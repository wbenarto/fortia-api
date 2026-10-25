import { neon } from '@neondatabase/serverless';
import { getDayBounds, parseLocalDate } from '@/lib/dateUtils';
import {
  EQUIPMENT_KEYS,
  LOCATION_KEYS,
  MUSCLE_FOCUS,
  type EquipmentKey,
  type FocusKey,
  type LocationKey,
  type StyleKey,
} from '@/lib/exerciseLibrary';
import {
  titleFor,
  type BuilderInputs,
  type WorkoutBlock,
} from '@/lib/workoutBuilder';

const sql = neon(process.env.DATABASE_URL!);

// Daily suggestion = analytics over the user's own history, no AI. It only returns
// builder inputs + a reason; the workout itself is built (cache-first) when the user
// taps Start, so an unopened suggestion costs nothing.

const WINDOW_DAYS = 14;
const MIN_SESSIONS_FOR_HISTORY = 3; // training days; below this, use the goal-based default plan
const RECOVERY_HOURS = 48;
const WEEKLY_CARDIO_TARGET = 150; // minutes, WHO guideline for moderate activity
const DAY_MS = 86_400_000;

export type Area =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'glutes'
  | 'core';
export const AREAS: Area[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
];

// Strength splits we rotate through, and the areas each one covers
const SPLITS: { focus: FocusKey; label: string; areas: Area[] }[] = [
  { focus: 'legs', label: 'Legs', areas: ['legs', 'glutes'] },
  { focus: 'push', label: 'Chest & shoulders', areas: ['chest', 'shoulders'] },
  { focus: 'pull', label: 'Back', areas: ['back'] },
  { focus: 'arms', label: 'Arms', areas: ['arms'] },
  { focus: 'core', label: 'Core', areas: ['core'] },
];

export interface Suggestion {
  inputs: BuilderInputs;
  title: string;
  reason: string;
  kind: 'strength' | 'cardio' | 'recovery' | 'starter';
}

export interface Session {
  at: number; // ms
  day: string; // YYYY-MM-DD the session was logged for
  kind: 'strength' | 'cardio' | 'mobility' | 'other';
  minutes: number;
  areaSets: Partial<Record<Area, number>>;
}

interface Prefs {
  duration: number | null;
  location: LocationKey;
  equipment: EquipmentKey[];
  strengthStyle: 'strength' | 'muscle' | null;
  prefersFullBody: boolean;
}

const mode = <T>(values: T[]): T | null => {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) [best, bestCount] = [v, c];
  }
  return best;
};

const parseMinutes = (text: string | null | undefined) => {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(h|hr|hour|min)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return /^h/i.test(match[2]) ? value * 60 : value;
};

const parseSets = (text: string | null | undefined) => {
  const t = String(text || '');
  const sets = t.match(/(\d+)\s*(?:x|×|sets?)/i);
  return sets ? Math.min(10, Number(sets[1])) : 3;
};

const musclesToAreas = (muscles: string[]): Area[] => [
  ...new Set(
    muscles.flatMap(m =>
      (MUSCLE_FOCUS[m] || []).filter((f): f is Area =>
        AREAS.includes(f as Area)
      )
    )
  ),
];

// Every training session between `since` and `until` (inclusive dates), from finished
// builder workouts, logged exercises and logged activities. Shared with Progress.
export async function loadSessions(
  clerkId: string,
  since: string,
  until: string
): Promise<Session[]> {
  const [built, logged, activities, types] = await Promise.all([
    // Finished builder workouts (their activity rows are skipped below to avoid double counting)
    sql`
      SELECT uw.inputs, uw.blocks, uw.active_minutes, uw.completed_at,
             to_char(COALESCE(a.created_at, uw.completed_at), 'YYYY-MM-DD') AS day
      FROM user_workouts uw
      LEFT JOIN activities a ON a.id = uw.activity_id
      WHERE uw.clerk_id = ${clerkId} AND uw.status = 'completed'
        AND COALESCE(a.created_at, uw.completed_at)::date BETWEEN ${since}::date AND ${until}::date
    `,
    // Exercises logged via Log activity / quick log
    sql`
      SELECT ws.created_at, we.exercise_name, we.duration,
             to_char(ws.scheduled_date, 'YYYY-MM-DD') AS day
      FROM workout_sessions ws
      JOIN workout_exercises we ON we.workout_session_id = ws.id
      WHERE ws.clerk_id = ${clerkId}
        AND ws.scheduled_date BETWEEN ${since}::date AND ${until}::date
    `,
    sql`
      SELECT a.created_at, a.activity_description, a.estimated_calories,
             to_char(a.created_at, 'YYYY-MM-DD') AS day
      FROM activities a
      LEFT JOIN user_workouts uw ON uw.activity_id = a.id
      WHERE a.clerk_id = ${clerkId} AND uw.id IS NULL
        AND a.created_at::date BETWEEN ${since}::date AND ${until}::date
        AND a.activity_description NOT ILIKE '%basal metabolic rate%'
        AND a.activity_description NOT ILIKE '%daily steps%'
    `,
    sql`SELECT name, category FROM activity_types WHERE is_active`,
  ]);

  // Library muscles for every slug used in finished builder workouts
  const slugs = [
    ...new Set(
      built.flatMap(w =>
        (w.blocks as WorkoutBlock[])
          .filter(b => b.section === 'main')
          .map(b => b.slug)
      )
    ),
  ];
  const slugMuscles = new Map<string, string[]>();
  if (slugs.length) {
    const rows = (await sql.query(
      'SELECT slug, primary_muscles FROM exercise_library WHERE slug = ANY($1::text[])',
      [slugs]
    )) as { slug: string; primary_muscles: string[] }[];
    rows.forEach(r => slugMuscles.set(r.slug, r.primary_muscles));
  }

  const typeFor = (name: string) => {
    const lower = name.toLowerCase();
    return (types as { name: string; category: string }[]).find(t =>
      lower.startsWith(t.name.toLowerCase())
    );
  };

  // Free-text strength logs ("Bench press", "Bicep curls") → closest library exercise
  const unmatched = [
    ...new Set(
      logged
        .map(r =>
          String(r.exercise_name || '')
            .trim()
            .toLowerCase()
        )
        .filter(n => n.length >= 3 && !typeFor(n))
    ),
  ];
  const nameMuscles = new Map<string, string[]>();
  // Every word must appear in the library name, plurals ignored ("bicep curls" →
  // "Dumbbell Bicep Curl"); shortest match wins.
  await Promise.all(
    unmatched.slice(0, 25).map(async name => {
      const patterns = name
        .split(/\s+/)
        .filter(Boolean)
        .map(w => `%${w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w}%`);
      const [row] = (await sql.query(
        `SELECT primary_muscles FROM exercise_library
         WHERE name ILIKE ALL($1::text[])
         ORDER BY length(name) LIMIT 1`,
        [patterns]
      )) as { primary_muscles: string[] }[];
      if (row) nameMuscles.set(name, row.primary_muscles);
    })
  );

  const sessions: Session[] = [];

  for (const w of built) {
    const inputs = w.inputs as BuilderInputs;
    const areaSets: Partial<Record<Area, number>> = {};
    for (const b of w.blocks as WorkoutBlock[]) {
      if (b.section !== 'main') continue;
      for (const area of musclesToAreas(slugMuscles.get(b.slug) || [])) {
        areaSets[area] = (areaSets[area] || 0) + b.sets;
      }
    }
    sessions.push({
      at: new Date(w.completed_at).getTime(),
      day: w.day,
      kind:
        inputs.style === 'cardio' || inputs.style === 'hiit'
          ? 'cardio'
          : inputs.style === 'mobility'
            ? 'mobility'
            : 'strength',
      minutes: Number(w.active_minutes) || inputs.duration,
      areaSets,
    });
  }

  for (const r of logged) {
    const name = String(r.exercise_name || '').trim();
    const type = typeFor(name);
    const minutes = parseMinutes(r.duration);
    if (type) {
      sessions.push({
        at: new Date(r.created_at).getTime(),
        day: r.day,
        kind:
          type.category === 'strength'
            ? 'strength'
            : type.category === 'mind_body'
              ? 'mobility'
              : 'cardio',
        minutes: minutes ?? 30,
        areaSets: {},
      });
      continue;
    }
    const muscles = nameMuscles.get(name.toLowerCase());
    const areaSets: Partial<Record<Area, number>> = {};
    for (const area of musclesToAreas(muscles || []))
      areaSets[area] = parseSets(r.duration);
    sessions.push({
      at: new Date(r.created_at).getTime(),
      day: r.day,
      kind: muscles ? 'strength' : 'other',
      minutes: minutes ?? 0,
      areaSets,
    });
  }

  for (const a of activities) {
    const type = typeFor(String(a.activity_description || ''));
    sessions.push({
      at: new Date(a.created_at).getTime(),
      day: a.day,
      kind:
        type?.category === 'strength'
          ? 'strength'
          : type?.category === 'mind_body'
            ? 'mobility'
            : 'cardio',
      // Older activity rows have no duration; assume a typical half hour
      minutes: parseMinutes(a.activity_description) ?? 30,
      areaSets: {},
    });
  }

  return sessions;
}

async function loadHistory(clerkId: string, date: string) {
  const { end } = getDayBounds(date);
  const since = new Date(end.getTime() - WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const [sessions, recentInputs] = await Promise.all([
    loadSessions(clerkId, since, date),
    // Preferences come from what they choose to build (finished or not), last 30 days
    sql`
      SELECT inputs FROM user_workouts
      WHERE clerk_id = ${clerkId} AND created_at >= ${new Date(end.getTime() - 30 * DAY_MS).toISOString()}
      ORDER BY created_at DESC LIMIT 15
    `,
  ]);

  // Preferences
  const prior = recentInputs.map(r => r.inputs as BuilderInputs);
  const latest = prior[0];
  const strengthPicks = prior.filter(
    i => i.style === 'strength' || i.style === 'muscle'
  );
  const prefs: Prefs = {
    duration: mode(prior.map(i => i.duration)),
    location: latest?.location || 'anywhere',
    equipment: latest?.equipment || [],
    strengthStyle: mode(
      strengthPicks.map(i => i.style)
    ) as Prefs['strengthStyle'],
    prefersFullBody:
      strengthPicks.length >= 2 &&
      strengthPicks.filter(i => i.focus.includes('full_body')).length /
        strengthPicks.length >=
        0.5,
  };

  return { sessions, prefs, nowMs: end.getTime() };
}

const inputsFor = (
  prefs: Prefs,
  focus: FocusKey[],
  style: StyleKey,
  duration: number
): BuilderInputs => ({
  duration,
  focus,
  location: prefs.location,
  equipment: prefs.location === 'anywhere' ? [] : [...prefs.equipment].sort(),
  style,
});

const daysAgoText = (days: number) =>
  days < 1 ? 'today' : days < 2 ? 'yesterday' : `${Math.floor(days)} days ago`;

// Goal-based rotation for people without enough history yet
function starterPlan(
  goal: string,
  prefs: Prefs,
  dayIndex: number
): Suggestion[] {
  const muscleStyle: StyleKey = prefs.strengthStyle || 'muscle';
  const rotations: Record<string, [FocusKey[], StyleKey, number][]> = {
    gain_muscle: [
      [['push'], muscleStyle, 45],
      [['pull'], muscleStyle, 45],
      [['legs'], muscleStyle, 45],
    ],
    lose_weight: [
      [['full_body'], muscleStyle, 45],
      [['full_body'], 'hiit', 30],
    ],
    improve_fitness: [
      [['full_body'], 'strength', 45],
      [['full_body'], 'cardio', 30],
    ],
    maintain: [
      [['full_body'], muscleStyle, 45],
      [['full_body'], 'cardio', 30],
    ],
  };
  const rotation = rotations[goal] || rotations.maintain;
  const ordered = rotation.map(
    (_, i) => rotation[(dayIndex + i) % rotation.length]
  );
  const suggestions: Suggestion[] = ordered.map(([focus, style, duration]) => {
    const inputs = inputsFor(prefs, focus, style, prefs.duration ?? duration);
    return {
      inputs,
      title: titleFor(inputs),
      reason: 'A balanced starter plan — it adapts as you log workouts.',
      kind: 'starter',
    };
  });
  const mobility = inputsFor(prefs, ['full_body'], 'mobility', 15);
  suggestions.push({
    inputs: mobility,
    title: titleFor(mobility),
    reason: 'An easy day: stretch and move.',
    kind: 'recovery',
  });
  return suggestions;
}

export async function suggestWorkouts(
  clerkId: string,
  date: string,
  fitnessGoal: string | null | undefined,
  fallback: { location?: string | null; equipment?: string[] }
): Promise<Suggestion[]> {
  const { sessions, prefs, nowMs } = await loadHistory(clerkId, date);

  // No builder history yet: use the location/equipment saved in the app's builder
  if (
    !prefs.equipment.length &&
    prefs.location === 'anywhere' &&
    fallback.location
  ) {
    if (LOCATION_KEYS.includes(fallback.location as LocationKey)) {
      prefs.location = fallback.location as LocationKey;
      prefs.equipment = (fallback.equipment || []).filter(
        (e): e is EquipmentKey => EQUIPMENT_KEYS.includes(e as EquipmentKey)
      );
    }
  }

  const dayIndex = Math.floor(parseLocalDate(date).getTime() / DAY_MS);
  // Enough history = training on at least 3 different days in the window
  const trainingDays = new Set(sessions.map(s => Math.floor(s.at / DAY_MS)))
    .size;
  if (trainingDays < MIN_SESSIONS_FOR_HISTORY) {
    return starterPlan(fitnessGoal || 'maintain', prefs, dayIndex);
  }

  const weekAgo = nowMs - 7 * DAY_MS;
  const hoursSince = (at: number) => (nowMs - at) / 3_600_000;

  // Per-area recency and weekly volume
  const lastTrained: Partial<Record<Area, number>> = {};
  const weeklySets: Partial<Record<Area, number>> = {};
  for (const s of sessions) {
    for (const [area, sets] of Object.entries(s.areaSets) as [Area, number][]) {
      lastTrained[area] = Math.max(lastTrained[area] || 0, s.at);
      if (s.at >= weekAgo) weeklySets[area] = (weeklySets[area] || 0) + sets;
    }
  }
  const daysSince = (area: Area) =>
    lastTrained[area] ? hoursSince(lastTrained[area]!) / 24 : WINDOW_DAYS;

  const cardioMinutes = sessions
    .filter(s => s.kind === 'cardio' && s.at >= weekAgo)
    .reduce((sum, s) => sum + s.minutes, 0);
  const strengthDays = new Set(
    sessions
      .filter(s => s.kind === 'strength' && s.at >= weekAgo)
      .map(s => Math.floor(s.at / DAY_MS))
  ).size;
  const lastSession = [...sessions].sort((a, b) => b.at - a.at)[0];

  // Consecutive training days ending today (or yesterday, if today is still empty)
  const trainedDays = new Set(
    sessions.map(s => Math.floor((nowMs - s.at) / DAY_MS))
  );
  let day = trainedDays.has(0) ? 0 : 1;
  let streak = 0;
  while (trainedDays.has(day)) {
    streak++;
    day++;
  }

  const strengthStyle: StyleKey =
    prefs.strengthStyle ||
    (fitnessGoal === 'improve_fitness' ? 'strength' : 'muscle');
  const strengthDuration = prefs.duration ?? 45;
  const ranked: Suggestion[] = [];

  // Strength: the split with the most need — long since trained, little volume this
  // week, and not worked in the last 48h.
  const splitScores = SPLITS.map(split => {
    const recent = split.areas.some(a => daysSince(a) * 24 < RECOVERY_HOURS);
    const days = Math.min(...split.areas.map(daysSince));
    const sets =
      split.areas.reduce((sum, a) => sum + (weeklySets[a] || 0), 0) /
      split.areas.length;
    // Arms/core get a little less priority than the big muscle groups
    const weight = split.focus === 'arms' || split.focus === 'core' ? 0.7 : 1;
    return {
      split,
      recent,
      days,
      sets,
      score: recent ? -1 : weight * (Math.min(days, WINDOW_DAYS) - sets / 12),
    };
  }).sort((a, b) => b.score - a.score);

  const strengthSuggestions: Suggestion[] = [];
  if (prefs.prefersFullBody) {
    const lastStrength = sessions
      .filter(s => s.kind === 'strength')
      .sort((a, b) => b.at - a.at)[0];
    const days = lastStrength ? hoursSince(lastStrength.at) / 24 : WINDOW_DAYS;
    const inputs = inputsFor(
      prefs,
      ['full_body'],
      strengthStyle,
      strengthDuration
    );
    strengthSuggestions.push({
      inputs,
      title: titleFor(inputs),
      reason:
        days >= WINDOW_DAYS
          ? 'No strength training in the last 2 weeks.'
          : `Last strength session was ${daysAgoText(days)}.`,
      kind: 'strength',
    });
  }
  for (const { split, recent, days, sets } of splitScores) {
    if (recent) continue;
    const inputs = inputsFor(
      prefs,
      [split.focus],
      strengthStyle,
      strengthDuration
    );
    strengthSuggestions.push({
      inputs,
      title: titleFor(inputs),
      reason:
        days >= WINDOW_DAYS
          ? `No ${split.label.toLowerCase()} work in the last 2 weeks.`
          : sets === 0
            ? `${split.label} last trained ${daysAgoText(days)}.`
            : `${split.label} is your least-trained area this week.`,
      kind: 'strength',
    });
  }

  const cardioStyle: StyleKey =
    fitnessGoal === 'lose_weight' ? 'hiit' : 'cardio';
  const cardioInputs = inputsFor(prefs, ['full_body'], cardioStyle, 30);
  const cardioSuggestion: Suggestion = {
    inputs: cardioInputs,
    title: titleFor(cardioInputs),
    reason:
      cardioMinutes === 0
        ? 'No cardio logged this week.'
        : `${Math.round(cardioMinutes)} of ${WEEKLY_CARDIO_TARGET} cardio minutes this week.`,
    kind: 'cardio',
  };
  const mobilityInputs = inputsFor(prefs, ['full_body'], 'mobility', 15);
  const recoverySuggestion: Suggestion = {
    inputs: mobilityInputs,
    title: titleFor(mobilityInputs),
    reason:
      streak >= 3
        ? `${streak} days in a row — an easy recovery session.`
        : 'An easy day: stretch and move.',
    kind: 'recovery',
  };

  // 1. Three or more days straight → recover first
  if (streak >= 3) ranked.push(recoverySuggestion);
  // 2. Behind on cardio (pro-rated for the week) and last session wasn't cardio
  const cardioBehind = cardioMinutes < WEEKLY_CARDIO_TARGET / 2;
  if (cardioBehind && lastSession?.kind !== 'cardio' && strengthDays >= 1) {
    ranked.push(cardioSuggestion);
  }
  // 3. The most-needed strength focus
  ranked.push(...strengthSuggestions.slice(0, 2));
  if (!ranked.includes(cardioSuggestion)) ranked.push(cardioSuggestion);
  if (!ranked.includes(recoverySuggestion)) ranked.push(recoverySuggestion);

  // Unique by title, max 4 options for "Something else"
  const seen = new Set<string>();
  return ranked
    .filter(s => (seen.has(s.title) ? false : (seen.add(s.title), true)))
    .slice(0, 4);
}
