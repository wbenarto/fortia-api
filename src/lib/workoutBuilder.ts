import { neon } from '@neondatabase/serverless';
import {
  DURATIONS,
  EQUIPMENT_KEYS,
  FOCUS_KEYS,
  IMAGE_BASE_URL,
  LOCATION_KEYS,
  STYLE_KEYS,
  type EquipmentKey,
  type FocusKey,
  type LocationKey,
  type StyleKey,
} from '@/lib/exerciseLibrary';
import {
  getGeminiGenerateContentUrl,
  getGeminiGenerationConfig,
  parseGeminiJsonFromResponse,
} from '@/lib/gemini';

const sql = neon(process.env.DATABASE_URL!);

// Cost controls: at most this many cached variants per input combination (Shuffle
// rotates them after that), and this many Gemini generations per user per day.
export const MAX_VARIANTS_PER_KEY = 3;
const DAILY_GEMINI_LIMIT = 10;
const CANDIDATES_MAIN = 36;
const CANDIDATES_EXTRA = 8;

export type Section = 'warmup' | 'main' | 'cooldown';

export interface WorkoutBlock {
  section: Section;
  slug: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
  rest: number;
}

export interface BuilderInputs {
  duration: number;
  focus: FocusKey[];
  location: LocationKey;
  equipment: EquipmentKey[];
  style: StyleKey;
}

interface Candidate {
  slug: string;
  name: string;
  primary_muscles: string[];
  mechanic: string | null;
  category: string;
  equipment: string[];
  tag?: string;
}

export const STYLE_LABELS: Record<StyleKey, string> = {
  strength: 'Strength',
  muscle: 'Build muscle',
  hiit: 'HIIT',
  cardio: 'Cardio',
  mobility: 'Mobility',
};

export const FOCUS_LABELS: Record<FocusKey, string> = {
  full_body: 'Full body',
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
};

const LOCATION_LABELS: Record<LocationKey, string> = {
  gym: 'Gym',
  home: 'Home',
  anywhere: 'Anywhere',
};

const STYLE_CONFIG: Record<
  StyleKey,
  {
    categories: string[];
    minutesPerExercise: number;
    scheme: Omit<WorkoutBlock, 'section' | 'slug'>;
    guidance: string;
    useFocus: boolean;
  }
> = {
  strength: {
    categories: ['strength', 'powerlifting'],
    minutesPerExercise: 8,
    scheme: { sets: 4, reps: 6, seconds: null, rest: 120 },
    guidance: '4-5 sets of 3-6 reps, 120-180s rest, mostly compound lifts',
    useFocus: true,
  },
  muscle: {
    categories: ['strength'],
    minutesPerExercise: 5.5,
    scheme: { sets: 3, reps: 10, seconds: null, rest: 75 },
    guidance: '3-4 sets of 8-12 reps, 60-90s rest, compound then isolation',
    useFocus: true,
  },
  hiit: {
    categories: ['plyometrics', 'strength'],
    minutesPerExercise: 3,
    scheme: { sets: 3, reps: null, seconds: 40, rest: 20 },
    guidance:
      'circuit of 3-4 rounds, 30-45s work and 15-20s rest, explosive full-body moves',
    useFocus: true,
  },
  cardio: {
    categories: ['cardio', 'plyometrics'],
    minutesPerExercise: 3,
    scheme: { sets: 3, reps: null, seconds: 45, rest: 15 },
    guidance:
      'intervals of 30-60s work; a cardio machine may be one long block (sets 1, 600-1200 seconds)',
    useFocus: false,
  },
  mobility: {
    categories: ['stretching'],
    minutesPerExercise: 2,
    scheme: { sets: 2, reps: null, seconds: 45, rest: 10 },
    guidance: 'timed holds of 30-60s, 2 rounds each',
    useFocus: true,
  },
};

// Broad focus areas expand into specific tags so candidates (and the workout)
// stay balanced instead of all coming from one muscle group.
const FOCUS_EXPANSION: Partial<Record<FocusKey, FocusKey[]>> = {
  full_body: ['legs', 'push', 'pull', 'core'],
  upper: ['chest', 'back', 'shoulders', 'arms'],
  lower: ['legs', 'glutes'],
};

// Stretches are static (no push/pull force), so movement patterns map to the muscle
// areas they work when picking stretches.
const STRETCH_EXPANSION: Partial<Record<FocusKey, FocusKey[]>> = {
  ...FOCUS_EXPANSION,
  full_body: ['legs', 'back', 'chest', 'shoulders', 'core'],
  push: ['chest', 'shoulders', 'arms'],
  pull: ['back', 'arms'],
};

const tagsFor = (focus: FocusKey[], stretching: boolean) => [
  ...new Set(
    focus.flatMap(
      f => (stretching ? STRETCH_EXPANSION : FOCUS_EXPANSION)[f] || [f]
    )
  ),
];

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function parseBuilderInputs(
  body: Record<string, unknown>
): BuilderInputs | string {
  const duration = Number(body.duration);
  if (!(DURATIONS as readonly number[]).includes(duration))
    return 'Invalid duration';

  const style = body.style as StyleKey;
  if (!STYLE_KEYS.includes(style)) return 'Invalid style';

  const location = body.location as LocationKey;
  if (!LOCATION_KEYS.includes(location)) return 'Invalid location';

  const rawFocus = Array.isArray(body.focus) ? body.focus : [];
  let focus = [...new Set(rawFocus)].filter((f): f is FocusKey =>
    FOCUS_KEYS.includes(f as FocusKey)
  );
  if (focus.length === 0) return 'Pick at least one focus';
  if (focus.length > 4) return 'Pick up to 4 focus areas';
  if (focus.includes('full_body')) focus = ['full_body'];

  const rawEquipment = Array.isArray(body.equipment) ? body.equipment : [];
  const equipment =
    location === 'anywhere'
      ? []
      : [...new Set(rawEquipment)].filter((e): e is EquipmentKey =>
          EQUIPMENT_KEYS.includes(e as EquipmentKey)
        );

  return {
    duration,
    focus: [...focus].sort(),
    location,
    equipment: equipment.sort(),
    style,
  };
}

export const cacheKeyFor = (inputs: BuilderInputs) =>
  [
    inputs.duration,
    inputs.focus.join(','),
    inputs.location,
    inputs.equipment.join(',') || 'none',
    inputs.style,
  ].join('|');

export const titleFor = (inputs: BuilderInputs) =>
  `${inputs.duration}-min ${inputs.focus.map(f => FOCUS_LABELS[f]).join(' & ')} · ${
    STYLE_LABELS[inputs.style]
  }`;

// Minutes a block takes: work (4s per rep, or the timed seconds) plus rest, per set,
// plus ~30s to set up / move between exercises.
const blockSeconds = (block: WorkoutBlock) =>
  block.sets * ((block.seconds ?? (block.reps ?? 10) * 4) + block.rest) + 30;

export const estimateMinutes = (blocks: WorkoutBlock[]) =>
  Math.max(
    1,
    Math.round(blocks.reduce((total, b) => total + blockSeconds(b), 0) / 60)
  );

const sectionMinutes = (duration: number) => {
  const warmup = Math.max(3, Math.round(duration * 0.1));
  const cooldown = Math.max(2, Math.round(duration * 0.08));
  return { warmup, cooldown, main: duration - warmup - cooldown };
};

// --- Candidate selection (DB only) --------------------------------------------

async function mainCandidates(inputs: BuilderInputs): Promise<Candidate[]> {
  const config = STYLE_CONFIG[inputs.style];
  const tags = tagsFor(inputs.focus, inputs.style === 'mobility');
  const query = async (tag: string | null, limit: number) =>
    (await sql.query(
      `SELECT slug, name, primary_muscles, mechanic, category, equipment, $4::text AS tag
       FROM exercise_library
       WHERE equipment <@ $1::text[]
         AND category = ANY($2::text[])
         AND COALESCE(level, '') <> 'expert'
         AND ($4::text IS NULL OR $4::text = ANY(focus_tags))
       ORDER BY random()
       LIMIT $3`,
      [inputs.equipment, config.categories, limit, tag]
    )) as Candidate[];

  let rows: Candidate[] = [];
  if (config.useFocus) {
    const perTag = Math.ceil(CANDIDATES_MAIN / tags.length);
    const groups = await Promise.all(tags.map(tag => query(tag, perTag)));
    rows = groups.flat();
  }
  // Too little to build from (e.g. bodyweight-only biceps): widen to any focus
  if (rows.length < 6) rows = rows.concat(await query(null, CANDIDATES_MAIN));

  const seen = new Set<string>();
  return rows.filter(row =>
    seen.has(row.slug) ? false : (seen.add(row.slug), true)
  );
}

async function warmupCandidates(inputs: BuilderInputs): Promise<Candidate[]> {
  return (await sql.query(
    `SELECT slug, name, primary_muscles, mechanic, category, equipment
     FROM exercise_library
     WHERE equipment <@ $1::text[]
       AND (
         (category = 'stretching' AND name ~* '(circle|dynamic|swing|drill|moving|elbows back)')
         OR (category = 'plyometrics' AND level = 'beginner' AND equipment = '{}')
       )
     ORDER BY random()
     LIMIT $2`,
    [inputs.equipment, CANDIDATES_EXTRA]
  )) as Candidate[];
}

async function cooldownCandidates(inputs: BuilderInputs): Promise<Candidate[]> {
  const tags = tagsFor(inputs.focus, true);
  const query = async (useTags: boolean) =>
    (await sql.query(
      `SELECT slug, name, primary_muscles, mechanic, category, equipment
       FROM exercise_library
       WHERE equipment <@ $1::text[]
         AND category = 'stretching'
         AND name !~* '(circle|dynamic|swing|drill|moving|-SMR)'
         AND (NOT $3::boolean OR focus_tags && $4::text[])
       ORDER BY random()
       LIMIT $2`,
      [inputs.equipment, CANDIDATES_EXTRA, useTags, tags]
    )) as Candidate[];
  const rows = await query(true);
  return rows.length >= 3 ? rows : rows.concat(await query(false));
}

// --- Rules builder (free, deterministic given the candidates) ------------------

const timedBlock = (section: Section, slug: string): WorkoutBlock => ({
  section,
  slug,
  sets: 1,
  reps: null,
  seconds: 45,
  rest: 10,
});

function buildWithRules(
  inputs: BuilderInputs,
  candidates: { warmup: Candidate[]; main: Candidate[]; cooldown: Candidate[] }
): WorkoutBlock[] {
  const config = STYLE_CONFIG[inputs.style];
  const minutes = sectionMinutes(inputs.duration);
  const blocks: WorkoutBlock[] = [];

  for (const c of candidates.warmup.slice(0, minutes.warmup >= 5 ? 3 : 2)) {
    blocks.push(timedBlock('warmup', c.slug));
  }

  let mainMinutes = minutes.main;
  let pool = [...candidates.main];

  // Cardio: one steady block (machine or run) when there's time, intervals for the
  // rest. Steady-state cardio never goes into the interval pool.
  if (inputs.style === 'cardio') {
    const machine = pool.find(c => c.category === 'cardio');
    if (machine && inputs.duration >= 30) {
      const machineMinutes = Math.min(20, Math.round(mainMinutes / 2));
      blocks.push({
        section: 'main',
        slug: machine.slug,
        sets: 1,
        reps: null,
        seconds: machineMinutes * 60,
        rest: 60,
      });
      mainMinutes -= machineMinutes + 1;
    }
  }
  pool = pool.filter(c => c.category !== 'cardio');

  const count = Math.min(
    10,
    Math.max(2, Math.round(mainMinutes / config.minutesPerExercise))
  );

  // Round-robin across focus tags so every requested area gets work, compounds first
  const byTag = new Map<string, Candidate[]>();
  for (const c of pool) {
    const key = c.tag || 'any';
    byTag.set(key, [...(byTag.get(key) || []), c]);
  }
  for (const list of byTag.values()) {
    list.sort(
      (a, b) =>
        Number(b.mechanic === 'compound') - Number(a.mechanic === 'compound')
    );
  }
  const picked: Candidate[] = [];
  const used = new Set<string>();
  while (picked.length < count) {
    let added = false;
    for (const list of byTag.values()) {
      const next = list.find(c => !used.has(c.slug));
      if (next && picked.length < count) {
        picked.push(next);
        used.add(next.slug);
        added = true;
      }
    }
    if (!added) break;
  }
  picked.sort(
    (a, b) =>
      Number(b.mechanic === 'compound') - Number(a.mechanic === 'compound')
  );
  for (const c of picked)
    blocks.push({ section: 'main', slug: c.slug, ...config.scheme });

  for (const c of candidates.cooldown.slice(0, minutes.cooldown >= 4 ? 3 : 2)) {
    blocks.push(timedBlock('cooldown', c.slug));
  }
  return blocks;
}

// --- Gemini (chooses from our candidates only) ---------------------------------

async function geminiCallsToday(clerkId: string) {
  const [{ count }] = (await sql`
    SELECT COUNT(*)::int AS count FROM ai_workout_decisions
    WHERE clerk_id = ${clerkId}
      AND decision_type = 'workout_builder'
      AND created_at > NOW() - INTERVAL '1 day'
  `) as { count: number }[];
  return count;
}

async function buildWithGemini(
  inputs: BuilderInputs,
  candidates: { warmup: Candidate[]; main: Candidate[]; cooldown: Candidate[] },
  profile: {
    fitness_goal?: string;
    activity_level?: string;
    age?: number;
  } | null
): Promise<WorkoutBlock[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // One id space across all lists; ids are cheaper than slugs in the response
  const all: Candidate[] = [
    ...candidates.warmup,
    ...candidates.main,
    ...candidates.cooldown,
  ];
  const line = (c: Candidate, i: number) =>
    `${i}:${c.name}|${c.primary_muscles[0] || '-'}|${c.mechanic === 'compound' ? 'c' : 'i'}`;
  let offset = 0;
  const list = (label: string, items: Candidate[]) => {
    const text = `${label}\n${items.map((c, i) => line(c, offset + i)).join('\n')}`;
    offset += items.length;
    return text;
  };

  const minutes = sectionMinutes(inputs.duration);
  const config = STYLE_CONFIG[inputs.style];
  const prompt = `You are a certified personal trainer. Build ONE ${inputs.duration}-min ${
    STYLE_LABELS[inputs.style]
  } workout. Focus: ${inputs.focus.map(f => FOCUS_LABELS[f]).join(', ')}. Equipment: ${
    inputs.equipment.join(', ') || 'bodyweight only'
  }.
Client: goal ${profile?.fitness_goal || 'general fitness'}, activity ${
    profile?.activity_level || 'moderate'
  }, age ${profile?.age || 'adult'}.
Use ONLY these exercises (id:name|muscle|c=compound,i=isolation):
${list('WARMUP', candidates.warmup)}
${list('MAIN', candidates.main)}
${list('COOLDOWN', candidates.cooldown)}
Plan: warm-up ~${minutes.warmup} min (2-3 timed moves), main ~${minutes.main} min, cool-down ~${
    minutes.cooldown
  } min (2-3 timed stretches).
Main: ${config.guidance}. Compound before isolation, balance the focus areas, no duplicates.
Return JSON only: {"b":[["w"|"m"|"c",id,sets,reps,seconds,rest_seconds]]} with reps 0 for timed moves and seconds 0 for rep moves.`;

  const response = await fetch(getGeminiGenerateContentUrl(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: getGeminiGenerationConfig({
        temperature: 0.4,
        maxOutputTokens: 700,
        responseMimeType: 'application/json',
      }),
    }),
  });
  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

  const parsed = parseGeminiJsonFromResponse(await response.json());
  const rows = Array.isArray(parsed.b) ? parsed.b : [];
  const sectionOf: Record<string, Section> = {
    w: 'warmup',
    m: 'main',
    c: 'cooldown',
  };
  const used = new Set<string>();
  const blocks: WorkoutBlock[] = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const [s, id, sets, reps, seconds, rest] = row;
    const section = sectionOf[String(s)];
    const candidate = all[Number(id)];
    if (!section || !candidate || used.has(candidate.slug)) continue;
    used.add(candidate.slug);
    // Steady-state cardio (treadmill, bike, rower, run) only makes sense as one long
    // block in the main section — never a 90s warm-up jog or 40s intervals.
    if (candidate.category === 'cardio') {
      if (section !== 'main') continue;
      blocks.push({
        section,
        slug: candidate.slug,
        sets: 1,
        reps: null,
        seconds: clampInt(seconds, 600, 1800, 900),
        rest: 60,
      });
      continue;
    }
    const timed = !(Number(reps) > 0);
    blocks.push({
      section,
      slug: candidate.slug,
      sets: clampInt(sets, 1, 6, 3),
      reps: timed ? null : clampInt(reps, 1, 30, 10),
      seconds: timed ? clampInt(seconds, 10, 1800, 45) : null,
      rest: clampInt(rest, 0, 240, 60),
    });
  }

  const order: Record<Section, number> = { warmup: 0, main: 1, cooldown: 2 };
  blocks.sort((a, b) => order[a.section] - order[b.section]);
  return blocks.filter(b => b.section === 'main').length >= 2 ? blocks : null;
}

// Keep the plan within the requested time: short warm-up/cool-down holds, then drop
// trailing main exercises (isolation first), then trim sets, until it fits.
function fitToDuration(
  input: WorkoutBlock[],
  duration: number
): WorkoutBlock[] {
  let blocks = input.map(b =>
    b.section === 'main'
      ? b
      : {
          ...b,
          sets: 1,
          seconds: Math.min(90, b.seconds ?? 45),
          rest: Math.min(15, b.rest),
        }
  );
  const limit = duration + 2;
  const mains = () => blocks.filter(b => b.section === 'main').length;

  while (estimateMinutes(blocks) > limit && mains() > 2) {
    const mainIndexes = blocks
      .map((b, i) => (b.section === 'main' ? i : -1))
      .filter(i => i >= 0);
    blocks = blocks.filter((_, i) => i !== mainIndexes[mainIndexes.length - 1]);
  }
  for (
    let i = blocks.length - 1;
    i >= 0 && estimateMinutes(blocks) > limit;
    i--
  ) {
    if (blocks[i].section === 'main' && blocks[i].sets > 2) {
      blocks[i] = { ...blocks[i], sets: blocks[i].sets - 1 };
      i++; // keep trimming this block while it helps
    }
  }
  // Still over (e.g. a long cardio block in a short session): shorten steady blocks
  for (let i = 0; i < blocks.length && estimateMinutes(blocks) > limit; i++) {
    const b = blocks[i];
    if (b.section === 'main' && b.sets === 1 && (b.seconds ?? 0) > 300) {
      const over = (estimateMinutes(blocks) - limit) * 60;
      blocks[i] = { ...b, seconds: Math.max(300, (b.seconds ?? 0) - over) };
    }
  }
  return blocks;
}

// --- Public entry -----------------------------------------------------------------

export async function generateWorkout(
  clerkId: string,
  inputs: BuilderInputs,
  profile: {
    fitness_goal?: string;
    activity_level?: string;
    age?: number;
  } | null
): Promise<{ blocks: WorkoutBlock[]; source: 'gemini' | 'rules' }> {
  const [main, warmup, cooldown] = await Promise.all([
    mainCandidates(inputs),
    warmupCandidates(inputs),
    cooldownCandidates(inputs),
  ]);
  const candidates = { warmup, main, cooldown };

  if ((await geminiCallsToday(clerkId)) < DAILY_GEMINI_LIMIT) {
    try {
      const blocks = await buildWithGemini(inputs, candidates, profile);
      // Counted whether or not the result was usable — it cost tokens either way
      await sql`
        INSERT INTO ai_workout_decisions (clerk_id, decision_type, input_data, output_data, reasoning)
        VALUES (${clerkId}, 'workout_builder', ${JSON.stringify(inputs)},
                ${JSON.stringify({ blocks })}, 'Chose exercises from library candidates')
      `;
      if (blocks)
        return {
          blocks: fitToDuration(blocks, inputs.duration),
          source: 'gemini',
        };
    } catch (error) {
      console.error('Workout builder Gemini failed, using rules:', error);
    }
  }
  return {
    blocks: fitToDuration(buildWithRules(inputs, candidates), inputs.duration),
    source: 'rules',
  };
}

// --- Validation / hydration for stored workouts --------------------------------

// Validate blocks sent back by the app (after swaps/removals): known slugs only.
export async function sanitizeBlocks(
  raw: unknown
): Promise<WorkoutBlock[] | null> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 30) return null;
  const sections: Section[] = ['warmup', 'main', 'cooldown'];
  const blocks: WorkoutBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const b = item as Record<string, unknown>;
    if (!sections.includes(b.section as Section) || typeof b.slug !== 'string')
      return null;
    const timed = b.reps == null;
    blocks.push({
      section: b.section as Section,
      slug: b.slug,
      sets: clampInt(b.sets, 1, 10, 3),
      reps: timed ? null : clampInt(b.reps, 1, 50, 10),
      seconds: timed ? clampInt(b.seconds, 5, 3600, 45) : null,
      rest: clampInt(b.rest, 0, 600, 60),
    });
  }
  const slugs = [...new Set(blocks.map(b => b.slug))];
  const known = (await sql.query(
    'SELECT slug FROM exercise_library WHERE slug = ANY($1::text[])',
    [slugs]
  )) as { slug: string }[];
  return known.length === slugs.length ? blocks : null;
}

export interface LibraryExercise {
  slug: string;
  name: string;
  category: string;
  mechanic: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string[];
  instructions: string[];
  images: string[];
}

export async function loadExercises(
  slugs: string[]
): Promise<Record<string, LibraryExercise>> {
  if (slugs.length === 0) return {};
  const rows = (await sql.query(
    `SELECT slug, name, category, mechanic, primary_muscles, secondary_muscles, equipment,
            instructions, image_paths
     FROM exercise_library WHERE slug = ANY($1::text[])`,
    [[...new Set(slugs)]]
  )) as (Omit<LibraryExercise, 'images'> & { image_paths: string[] })[];
  return Object.fromEntries(
    rows.map(({ image_paths, ...row }) => [
      row.slug,
      { ...row, images: image_paths.map(p => IMAGE_BASE_URL + p) },
    ])
  );
}

export interface UserWorkoutRow {
  id: number;
  clerk_id: string;
  template_id: number | null;
  title: string;
  inputs: BuilderInputs;
  blocks: WorkoutBlock[];
  progress: Record<string, unknown>;
  status: 'planned' | 'in_progress' | 'completed';
  active_minutes: number | null;
  calories: number | null;
  activity_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export async function hydrateWorkout(row: UserWorkoutRow) {
  const exercises = await loadExercises(row.blocks.map(b => b.slug));
  return {
    ...row,
    est_minutes: estimateMinutes(row.blocks),
    location_label: LOCATION_LABELS[row.inputs.location],
    exercises,
  };
}

// Calories for a finished workout. Net of resting burn (MET − 1), because calories
// out already includes BMR. Mirrored in the app's lib/workoutBuilder.ts.
const STYLE_MET: Record<StyleKey, number> = {
  strength: 5,
  muscle: 5,
  hiit: 8,
  cardio: 7,
  mobility: 2.5,
};
export const estimateWorkoutCalories = (
  style: StyleKey,
  weightLbs: number,
  minutes: number
) =>
  Math.max(
    0,
    Math.round((STYLE_MET[style] - 1) * (weightLbs / 2.20462) * (minutes / 60))
  );
