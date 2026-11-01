import { neon } from '@neondatabase/serverless';
import { addDays, diffDays } from '@/lib/progress';
import { loadSessions } from '@/lib/workoutSuggestion';

const sql = neon(process.env.DATABASE_URL!);

// Macro challenges (Challenges tab). A day succeeds when calories, carbs and fat are
// all at or under target. Box shade = how many of the four targets were hit
// (protein counts when it reaches 90%). Everything is computed from meals /
// workouts already logged.

export const MAX_CHALLENGE_DAYS = 120;
const PROTEIN_HIT = 0.9;

export interface ChallengeTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface ChallengeRow {
  id: number;
  clerk_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  diet_type: string;
  workouts_per_week: number;
  targets: ChallengeTargets;
  status: 'active' | 'completed' | 'ended';
  created_at: string;
  ended_at: string | null;
}

export type DayState = 'future' | 'today' | 'success' | 'missed';

export interface ChallengeDay {
  date: string;
  state: DayState;
  logged: boolean;
  level: 0 | 1 | 2 | 3 | 4; // 0 = nothing logged, 1–4 = targets hit (shade)
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  hits: { calories: boolean; carbs: boolean; fats: boolean; protein: boolean };
  workout: boolean;
}

// Columns used when selecting a challenge (dates as plain strings)
export const CHALLENGE_COLUMNS = `id, clerk_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
  to_char(end_date, 'YYYY-MM-DD') AS end_date, diet_type, workouts_per_week, targets, status,
  created_at, ended_at`;

export async function loadChallengeDetail(
  challenge: ChallengeRow,
  today: string
) {
  const { start_date: from, end_date: to, targets } = challenge;
  const until = to < today ? to : today; // nothing to load past today

  const [meals, sessions] =
    until < from
      ? [[], []]
      : await Promise.all([
          sql`
            SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
                   COALESCE(SUM(calories), 0)::float AS calories,
                   COALESCE(SUM(protein), 0)::float AS protein,
                   COALESCE(SUM(carbs), 0)::float AS carbs,
                   COALESCE(SUM(fats), 0)::float AS fats,
                   COUNT(*)::int AS meal_count
            FROM meals
            WHERE clerk_id = ${challenge.clerk_id}
              AND created_at::date BETWEEN ${from}::date AND ${until}::date
            GROUP BY 1
          `,
          loadSessions(challenge.clerk_id, from, until),
        ]);

  const mealMap = new Map(meals.map(m => [m.day as string, m]));
  const workoutDays = new Set(sessions.map(s => s.day));
  const total = diffDays(from, to) + 1;

  const days: ChallengeDay[] = Array.from({ length: total }, (_, i) => {
    const date = addDays(from, i);
    const m = mealMap.get(date);
    const logged = !!m && m.meal_count > 0;
    const calories = Math.round(m?.calories ?? 0);
    const protein = Math.round(m?.protein ?? 0);
    const carbs = Math.round(m?.carbs ?? 0);
    const fats = Math.round(m?.fats ?? 0);
    const hits = {
      calories: logged && calories <= targets.calories,
      carbs: logged && carbs <= targets.carbs,
      fats: logged && fats <= targets.fats,
      protein: logged && protein >= targets.protein * PROTEIN_HIT,
    };
    const hitCount = Object.values(hits).filter(Boolean).length;
    const success = hits.calories && hits.carbs && hits.fats;
    const state: DayState =
      date > today
        ? 'future'
        : date === today
          ? 'today'
          : success
            ? 'success'
            : 'missed';
    return {
      date,
      state,
      logged,
      level: (logged ? Math.max(1, hitCount) : 0) as ChallengeDay['level'],
      calories,
      protein,
      carbs,
      fats,
      hits,
      workout: workoutDays.has(date),
    };
  });

  const finished = days.filter(
    d => d.state !== 'future' && d.state !== 'today'
  );
  const completedDays = finished.filter(d => d.state === 'success').length;
  const todayDay = days.find(d => d.state === 'today');

  // Streak of completed days up to yesterday, plus today once it's already a success
  let streak = 0;
  for (let i = finished.length - 1; i >= 0; i--) {
    if (finished[i].state === 'success') streak++;
    else break;
  }
  const todaySuccess =
    !!todayDay &&
    todayDay.hits.calories &&
    todayDay.hits.carbs &&
    todayDay.hits.fats;
  if (todaySuccess) streak++;

  // Workout weeks: 7-day blocks from the start date
  const weeks = [];
  for (let w = 0; w * 7 < total; w++) {
    const weekDays = days.slice(w * 7, w * 7 + 7);
    const started = weekDays[0].date <= today;
    const over = weekDays[weekDays.length - 1].date < today;
    const workouts = weekDays.filter(d => d.workout).length;
    weeks.push({
      index: w,
      from: weekDays[0].date,
      to: weekDays[weekDays.length - 1].date,
      workouts,
      goal: challenge.workouts_per_week,
      met: workouts >= challenge.workouts_per_week,
      state: !started ? 'future' : over ? 'done' : 'current',
    });
  }

  const dayNumber = Math.min(total, Math.max(0, diffDays(from, today) + 1));
  return {
    challenge,
    today,
    days,
    weeks,
    stats: {
      totalDays: total,
      dayNumber, // 0 before it starts
      completedDays,
      finishedDays: finished.length,
      missedDays: finished.filter(d => d.state === 'missed').length,
      completionPct: finished.length
        ? Math.round((completedDays / finished.length) * 100)
        : null,
      streak,
      weeksMet: weeks.filter(w => w.state === 'done' && w.met).length,
      weeksDone: weeks.filter(w => w.state === 'done').length,
    },
  };
}

// An active challenge whose end date has passed becomes completed
export async function settleChallenges(clerkId: string, today: string) {
  await sql`
    UPDATE challenges SET status = 'completed', ended_at = NOW()
    WHERE clerk_id = ${clerkId} AND status = 'active' AND end_date < ${today}::date
  `;
}
