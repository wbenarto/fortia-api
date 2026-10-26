import { addDays, diffDays } from '@/lib/progress';
import { loadSessions } from '@/lib/workoutSuggestion';

// Body heat map: sets per muscle over a range, from the same sessions Progress and the
// daily suggestion use (built workouts, logged exercises, logged activities). No AI.

export type HeatmapRange = 'week' | 'month' | 'all';
export const HEATMAP_RANGES: HeatmapRange[] = ['week', 'month', 'all'];

// exercise_library primary_muscles shown on the body (neck is left out)
export const HEATMAP_MUSCLES = [
  'chest',
  'shoulders',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abdominals',
  'lats',
  'middle back',
  'lower back',
  'glutes',
  'abductors',
  'adductors',
  'quadriceps',
  'hamstrings',
  'calves',
] as const;

// Week / month: heat from average weekly sets (~10+ hard sets a week is a full dose).
// All time: averages over many months wash out, so heat is relative to the most
// trained muscle instead.
const levelFor = (weeklySets: number) =>
  weeklySets <= 0
    ? 0
    : weeklySets < 3
      ? 1
      : weeklySets < 6
        ? 2
        : weeklySets < 10
          ? 3
          : 4;

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function loadMuscleHeatmap(
  clerkId: string,
  range: HeatmapRange,
  today: string
) {
  const from =
    range === 'week'
      ? addDays(today, -6)
      : range === 'month'
        ? addDays(today, -29)
        : '2000-01-01';
  const sessions = await loadSessions(clerkId, from, today);

  const sets: Record<string, number> = {};
  const last: Record<string, string> = {};
  let firstDay: string | null = null;
  let trainingSessions = 0;
  for (const s of sessions) {
    const entries = Object.entries(s.muscleSets).filter(([, n]) => n > 0);
    if (!entries.length) continue;
    trainingSessions++;
    if (!firstDay || s.day < firstDay) firstDay = s.day;
    for (const [muscle, n] of entries) {
      sets[muscle] = (sets[muscle] || 0) + n;
      if (!last[muscle] || s.day > last[muscle]) last[muscle] = s.day;
    }
  }

  // All time starts at the first session; at least one week so a new user isn't inflated
  const start = range === 'all' ? firstDay || today : from;
  const weeks = Math.max(1, (diffDays(start, today) + 1) / 7);

  const maxSets = Math.max(0, ...Object.values(sets));
  const relativeLevel = (total: number) => {
    const share = maxSets ? total / maxSets : 0;
    return share <= 0
      ? 0
      : share < 0.25
        ? 1
        : share < 0.5
          ? 2
          : share < 0.75
            ? 3
            : 4;
  };

  return {
    range,
    scale: range === 'all' ? ('relative' as const) : ('weekly' as const),
    from: start,
    to: today,
    weeks: round1(weeks),
    sessions: trainingSessions,
    muscles: HEATMAP_MUSCLES.map(muscle => {
      const total = sets[muscle] || 0;
      const weekly = total / weeks;
      return {
        muscle,
        sets: round1(total),
        weeklySets: round1(weekly),
        level: range === 'all' ? relativeLevel(total) : levelFor(weekly),
        lastTrained: last[muscle] || null,
      };
    }),
  };
}
