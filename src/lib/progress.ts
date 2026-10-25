import { neon } from '@neondatabase/serverless';
import { fetchUserProfile } from '@/lib/userUtils';
import {
  AREAS,
  loadSessions,
  type Area,
  type Session,
} from '@/lib/workoutSuggestion';

const sql = neon(process.env.DATABASE_URL!);

// Progress = history + consistency feedback, computed from what's already stored.
// No AI: insights are rule-based sentences. Past days are judged against the user's
// *current* targets (no target history yet).

export const MAX_RANGE_DAYS = 120;
const STREAK_LOOKBACK_DAYS = 400;
const WEEKLY_CARDIO_TARGET = 150;
const CALORIE_TOLERANCE = 0.1; // ±10% of target counts as "on target"
const PROTEIN_HIT = 0.9; // ≥90% of the protein target counts as a hit
const DAY_MS = 86_400_000;

// --- Date helpers on YYYY-MM-DD strings (UTC math, so no DST surprises) -----------

const toUTC = (d: string) =>
  Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(5, 7)) - 1,
    Number(d.slice(8, 10))
  );
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * DAY_MS);
export const diffDays = (a: string, b: string) =>
  Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
const isWeekend = (d: string) =>
  [0, 6].includes(new Date(toUTC(d)).getUTCDay());
export const isDateString = (d: string | null): d is string =>
  !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toUTC(d));

const dateRange = (from: string, to: string) =>
  Array.from({ length: diffDays(from, to) + 1 }, (_, i) => addDays(from, i));

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = (value: number | null, digits = 0) =>
  value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

// --- Types ---------------------------------------------------------------------------

export interface ProgressDay {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  mealCount: number;
  weight: number | null;
  activeCalories: number;
  steps: number | null;
  workoutMinutes: number;
  trained: boolean;
  logged: { meal: boolean; weight: boolean; exercise: boolean };
  calorieStatus: 'on' | 'under' | 'over' | null;
}

export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  weight: number | null;
  startingWeight: number | null;
  fitnessGoal: string | null;
}

export interface Insight {
  id: string;
  tone: 'good' | 'neutral' | 'attention';
  icon: string; // Ionicons name
  // May contain {w} / {w2}: weights in lb that the app formats in the user's units
  text: string;
  weightLb?: number;
  weightLb2?: number;
}

// --- Loading ---------------------------------------------------------------------------

export async function loadProgress(clerkId: string, from: string, to: string) {
  const streakFrom = addDays(to, -STREAK_LOOKBACK_DAYS);

  const [
    profile,
    meals,
    weights,
    lastWeighIn,
    activityCals,
    exerciseCals,
    steps,
    loggedDays,
    sessions,
  ] = await Promise.all([
    fetchUserProfile(clerkId),
    sql`
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(calories), 0)::float AS calories,
               COALESCE(SUM(protein), 0)::float AS protein,
               COALESCE(SUM(carbs), 0)::float AS carbs,
               COALESCE(SUM(fats), 0)::float AS fats,
               COUNT(*)::int AS meal_count
        FROM meals
        WHERE clerk_id = ${clerkId} AND created_at::date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1
      `,
    sql`
        SELECT DISTINCT ON (date) to_char(date, 'YYYY-MM-DD') AS day, weight::float AS weight
        FROM weights
        WHERE clerk_id = ${clerkId} AND date BETWEEN ${from}::date AND ${to}::date
        ORDER BY date, created_at DESC
      `,
    sql`
        SELECT to_char(MAX(date), 'YYYY-MM-DD') AS day
        FROM weights WHERE clerk_id = ${clerkId} AND date <= ${to}::date
      `,
    sql`
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(estimated_calories), 0)::float AS calories
        FROM activities
        WHERE clerk_id = ${clerkId} AND created_at::date BETWEEN ${from}::date AND ${to}::date
          AND activity_description NOT ILIKE '%basal metabolic rate%'
          AND activity_description NOT ILIKE '%daily steps%'
        GROUP BY 1
      `,
    sql`
        SELECT to_char(ws.scheduled_date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(we.calories_burned), 0)::float AS calories
        FROM workout_sessions ws
        JOIN workout_exercises we ON we.workout_session_id = ws.id
        WHERE ws.clerk_id = ${clerkId} AND ws.scheduled_date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1
      `,
    sql`
        SELECT to_char(date, 'YYYY-MM-DD') AS day, steps::int AS steps,
               COALESCE(calories_burned, 0)::float AS calories
        FROM steps
        WHERE clerk_id = ${clerkId} AND date BETWEEN ${from}::date AND ${to}::date
      `,
    // Any log at all, for streaks (looks back further than the range)
    sql`
        SELECT DISTINCT day FROM (
          SELECT to_char(created_at, 'YYYY-MM-DD') AS day FROM meals
          WHERE clerk_id = ${clerkId} AND created_at::date BETWEEN ${streakFrom}::date AND ${to}::date
          UNION
          SELECT to_char(date, 'YYYY-MM-DD') FROM weights
          WHERE clerk_id = ${clerkId} AND date BETWEEN ${streakFrom}::date AND ${to}::date
          UNION
          SELECT to_char(scheduled_date, 'YYYY-MM-DD') FROM workout_sessions
          WHERE clerk_id = ${clerkId} AND scheduled_date BETWEEN ${streakFrom}::date AND ${to}::date
          UNION
          SELECT to_char(created_at, 'YYYY-MM-DD') FROM activities
          WHERE clerk_id = ${clerkId} AND created_at::date BETWEEN ${streakFrom}::date AND ${to}::date
            AND activity_description NOT ILIKE '%basal metabolic rate%'
            AND activity_description NOT ILIKE '%daily steps%'
        ) logs
      `,
    loadSessions(clerkId, from, to),
  ]);

  const byDay = <T extends { day: string }>(rows: T[]) =>
    new Map(rows.map(r => [r.day, r]));
  const mealMap = byDay(
    meals as {
      day: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
      meal_count: number;
    }[]
  );
  const weightMap = byDay(weights as { day: string; weight: number }[]);
  const activityMap = byDay(
    activityCals as { day: string; calories: number }[]
  );
  const exerciseMap = byDay(
    exerciseCals as { day: string; calories: number }[]
  );
  const stepsMap = byDay(
    steps as { day: string; steps: number; calories: number }[]
  );

  const minutesByDay = new Map<string, number>();
  for (const s of sessions)
    minutesByDay.set(s.day, (minutesByDay.get(s.day) || 0) + s.minutes);
  const trainedSet = new Set(sessions.map(s => s.day));

  const targets: Targets = {
    calories: Number(profile?.daily_calories) || 0,
    protein: Number(profile?.daily_protein) || 0,
    carbs: Number(profile?.daily_carbs) || 0,
    fats: Number(profile?.daily_fats) || 0,
    weight: Number(profile?.target_weight) || null,
    startingWeight: Number(profile?.starting_weight) || null,
    fitnessGoal: profile?.fitness_goal || null,
  };

  const days: ProgressDay[] = dateRange(from, to).map(date => {
    const meal = mealMap.get(date);
    const calories = meal?.calories || 0;
    const ratio = targets.calories ? calories / targets.calories : null;
    return {
      date,
      calories,
      protein: meal?.protein || 0,
      carbs: meal?.carbs || 0,
      fats: meal?.fats || 0,
      mealCount: meal?.meal_count || 0,
      weight: weightMap.get(date)?.weight ?? null,
      activeCalories: Math.round(
        (activityMap.get(date)?.calories || 0) +
          (exerciseMap.get(date)?.calories || 0) +
          (stepsMap.get(date)?.calories || 0)
      ),
      steps: stepsMap.get(date)?.steps ?? null,
      workoutMinutes: Math.round(minutesByDay.get(date) || 0),
      trained: trainedSet.has(date),
      logged: {
        meal: !!meal && meal.meal_count > 0,
        weight: weightMap.has(date),
        exercise:
          trainedSet.has(date) ||
          activityMap.has(date) ||
          exerciseMap.has(date),
      },
      // The last day is usually today and still in progress: don't call it "under" yet
      calorieStatus:
        !meal || !calories || ratio == null
          ? null
          : date === to && ratio < 1 - CALORIE_TOLERANCE
            ? null
            : ratio < 1 - CALORIE_TOLERANCE
              ? 'under'
              : ratio > 1 + CALORIE_TOLERANCE
                ? 'over'
                : 'on',
    };
  });

  const summary = summarize(
    days,
    targets,
    sessions,
    loggedDays.map(r => r.day as string),
    to,
    lastWeighIn[0]?.day ?? null,
    profile?.weight
  );
  return {
    from,
    to,
    days,
    targets,
    summary,
    insights: buildInsights(days, targets, summary),
  };
}

// --- Summaries ---------------------------------------------------------------------

type Sessions = Session[];

function summarize(
  days: ProgressDay[],
  targets: Targets,
  sessions: Sessions,
  loggedDays: string[],
  to: string,
  lastWeighIn: string | null,
  profileWeight: number | undefined
) {
  const weeks = days.length / 7;

  // Nutrition
  // Days judged against the target (today counts once it's on/over target)
  const logged = days.filter(d => d.calorieStatus !== null);
  const weekend = logged.filter(d => isWeekend(d.date));
  const weekday = logged.filter(d => !isWeekend(d.date));
  const avgOf = (
    list: ProgressDay[],
    key: 'calories' | 'protein' | 'carbs' | 'fats'
  ) => mean(list.map(d => d[key]));
  const nutrition = {
    daysLogged: logged.length,
    onTargetDays: logged.filter(d => d.calorieStatus === 'on').length,
    underDays: logged.filter(d => d.calorieStatus === 'under').length,
    overDays: logged.filter(d => d.calorieStatus === 'over').length,
    avgCalories: round(avgOf(logged, 'calories')),
    avgProtein: round(avgOf(logged, 'protein')),
    avgCarbs: round(avgOf(logged, 'carbs')),
    avgFats: round(avgOf(logged, 'fats')),
    avgProteinPct:
      targets.protein && logged.length
        ? round(
            (mean(logged.map(d => d.protein / targets.protein))! || 0) * 100
          )
        : null,
    proteinHitDays: targets.protein
      ? logged.filter(d => d.protein >= targets.protein * PROTEIN_HIT).length
      : 0,
    weekendDelta:
      weekend.length >= 2 && weekday.length >= 2
        ? round(avgOf(weekend, 'calories')! - avgOf(weekday, 'calories')!)
        : null,
  };

  // Weight: 7-day moving average at each weigh-in, linear trend for the rate
  const points = days
    .filter(d => d.weight != null)
    .map(d => ({ date: d.date, w: d.weight! }));
  const movingAvg = (date: string) =>
    mean(
      points
        .filter(p => diffDays(p.date, date) >= 0 && diffDays(p.date, date) < 7)
        .map(p => p.w)
    );
  let ratePerWeek: number | null = null;
  // Needs a week of spread, or a couple of weigh-ins swing the weekly rate wildly
  if (
    points.length >= 2 &&
    diffDays(points[0].date, points[points.length - 1].date) >= 7
  ) {
    const xs = points.map(p => diffDays(points[0].date, p.date));
    const xMean = mean(xs)!;
    const yMean = mean(points.map(p => p.w))!;
    const num = points.reduce(
      (sum, p, i) => sum + (xs[i] - xMean) * (p.w - yMean),
      0
    );
    const den = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
    ratePerWeek = den ? (num / den) * 7 : null;
  }
  const latest = points.length
    ? points[points.length - 1].w
    : Number(profileWeight) || null;
  const toGo =
    latest != null && targets.weight ? latest - targets.weight : null;
  let projectedDate: string | null = null;
  if (
    ratePerWeek &&
    toGo &&
    Math.abs(toGo) > 0.5 &&
    Math.sign(-toGo) === Math.sign(ratePerWeek)
  ) {
    const weeksToGoal = Math.abs(toGo) / Math.abs(ratePerWeek);
    if (weeksToGoal <= 104)
      projectedDate = addDays(to, Math.round(weeksToGoal * 7));
  }
  const weight = {
    weighIns: points.length,
    weighInsPerWeek: round(points.length / weeks, 1),
    start: points.length ? round(movingAvg(points[0].date), 1) : null,
    end: points.length
      ? round(movingAvg(points[points.length - 1].date), 1)
      : null,
    change:
      points.length >= 2
        ? round(
            movingAvg(points[points.length - 1].date)! -
              movingAvg(points[0].date)!,
            1
          )
        : null,
    ratePerWeek: round(ratePerWeek, 2),
    latest,
    toGo: round(toGo, 1),
    projectedDate,
    lastWeighIn,
    daysSinceWeighIn: lastWeighIn ? diffDays(lastWeighIn, to) : null,
  };

  // Activity
  const trainedDays = days.filter(d => d.trained).length;
  const cardioMinutes = sessions
    .filter(s => s.kind === 'cardio')
    .reduce((sum, s) => sum + s.minutes, 0);
  const lastTrained: Partial<Record<Area, string>> = {};
  const areaSets: Partial<Record<Area, number>> = {};
  for (const s of sessions) {
    for (const [area, sets] of Object.entries(s.areaSets) as [Area, number][]) {
      areaSets[area] = (areaSets[area] || 0) + sets;
      if (!lastTrained[area] || s.day > lastTrained[area]!)
        lastTrained[area] = s.day;
    }
  }
  const stepDays = days.filter(d => d.steps != null);
  const activity = {
    workoutDays: trainedDays,
    workoutsPerWeek: round(trainedDays / weeks, 1),
    weeklyGoal: targets.fitnessGoal === 'gain_muscle' ? 4 : 3,
    cardioMinutes: Math.round(cardioMinutes),
    cardioMinutesPerWeek: Math.round(cardioMinutes / weeks),
    cardioWeeklyTarget: WEEKLY_CARDIO_TARGET,
    avgActiveCalories: round(mean(days.map(d => d.activeCalories))),
    avgSteps: round(mean(stepDays.map(d => d.steps!))),
    muscleBalance: AREAS.map(area => ({
      area,
      sets: areaSets[area] || 0,
      lastTrained: lastTrained[area] || null,
    })),
  };

  // Consistency
  const loggedSet = new Set(loggedDays);
  let cursor = loggedSet.has(to) ? to : addDays(to, -1);
  let currentStreak = 0;
  while (loggedSet.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }
  let bestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of [...loggedSet].sort()) {
    run = previous && diffDays(previous, day) === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = day;
  }
  const consistency = {
    currentStreak,
    bestStreak,
    daysInRange: days.length,
    daysWithAnyLog: days.filter(
      d => d.logged.meal || d.logged.weight || d.logged.exercise
    ).length,
    mealDays: days.filter(d => d.logged.meal).length,
    loggingRate: round(
      (days.filter(d => d.logged.meal).length / days.length) * 100
    ),
    perfectDays: days.filter(
      d => d.logged.meal && d.logged.weight && d.logged.exercise
    ).length,
  };

  return { nutrition, weight, activity, consistency };
}

// --- Insights (rule-based sentences) -------------------------------------------------

type Summary = ReturnType<typeof summarize>;

function buildInsights(
  days: ProgressDay[],
  targets: Targets,
  summary: Summary
): Insight[] {
  const { nutrition, weight, activity, consistency } = summary;
  const period =
    days.length <= 7
      ? 'this week'
      : days.length <= 31
        ? 'this month'
        : 'over 3 months';
  const insights: (Insight & { priority: number })[] = [];
  const add = (insight: Insight, priority: number) =>
    insights.push({ ...insight, priority });

  const hasAnything =
    nutrition.daysLogged > 0 || weight.weighIns > 0 || activity.workoutDays > 0;
  if (!hasAnything) {
    return [
      {
        id: 'empty',
        tone: 'neutral',
        icon: 'sparkles-outline',
        text: 'Log meals, weight and workouts for a few days to see your trends here.',
      },
    ];
  }

  if (consistency.currentStreak >= 3) {
    add(
      {
        id: 'streak',
        tone: 'good',
        icon: 'flame-outline',
        text: `${consistency.currentStreak}-day logging streak — keep it going.`,
      },
      60
    );
  }

  // Calories (the "mostly under" insight below says it better when that's the pattern)
  const mostlyUnder =
    nutrition.daysLogged > 0 &&
    nutrition.underDays / nutrition.daysLogged >= 0.6;
  if (nutrition.daysLogged >= 3 && targets.calories && !mostlyUnder) {
    const rate = nutrition.onTargetDays / nutrition.daysLogged;
    add(
      {
        id: 'calorie-target',
        tone: rate >= 0.6 ? 'good' : rate < 0.4 ? 'attention' : 'neutral',
        icon: 'restaurant-outline',
        text: `You hit your calorie target ${nutrition.onTargetDays} of ${nutrition.daysLogged} logged days ${period}.`,
      },
      rate < 0.4 ? 90 : 70
    );
  }

  // Most days under target: missed logs or under-eating
  if (
    nutrition.daysLogged >= 3 &&
    targets.calories &&
    mostlyUnder &&
    nutrition.avgCalories != null
  ) {
    add(
      {
        id: 'calories-under',
        tone: 'attention',
        icon: 'alert-circle-outline',
        text: `You average ${nutrition.avgCalories.toLocaleString('en-US')} of ${targets.calories.toLocaleString('en-US')} cal — check for missed meals, or eat a bit more.`,
      },
      88
    );
  }

  // Logging gaps
  if (days.length >= 7 && consistency.mealDays / days.length < 0.6) {
    add(
      {
        id: 'logging-gaps',
        tone: 'attention',
        icon: 'calendar-outline',
        text: `Meals logged on ${consistency.mealDays} of ${days.length} days — gaps hide your real average.`,
      },
      85
    );
  }

  // Protein
  if (nutrition.daysLogged >= 3 && nutrition.avgProteinPct != null) {
    if (nutrition.avgProteinPct < 80) {
      add(
        {
          id: 'protein-low',
          tone: 'attention',
          icon: 'nutrition-outline',
          text: `Protein averages ${nutrition.avgProteinPct}% of your target.`,
        },
        80
      );
    } else if (nutrition.avgProteinPct >= 95) {
      add(
        {
          id: 'protein-good',
          tone: 'good',
          icon: 'nutrition-outline',
          text: `Protein on point: ${nutrition.avgProteinPct}% of your target on average.`,
        },
        55
      );
    }
  }

  // Weekends
  if (nutrition.weekendDelta != null && nutrition.weekendDelta >= 250) {
    add(
      {
        id: 'weekends',
        tone: 'attention',
        icon: 'wine-outline',
        text: `Weekends run about ${Math.round(nutrition.weekendDelta / 10) * 10} cal higher than weekdays.`,
      },
      65
    );
  }

  // Workouts
  if (days.length >= 7) {
    const perWeek = activity.workoutsPerWeek ?? 0;
    const met = perWeek >= activity.weeklyGoal;
    add(
      {
        id: 'workouts',
        tone: met
          ? 'good'
          : perWeek < activity.weeklyGoal / 2
            ? 'attention'
            : 'neutral',
        icon: 'barbell-outline',
        text:
          days.length <= 7
            ? `${activity.workoutDays} workout day${activity.workoutDays === 1 ? '' : 's'} ${period} — your goal is ${activity.weeklyGoal}.`
            : `${perWeek} workout days a week on average (goal ${activity.weeklyGoal}).`,
      },
      met ? 60 : 75
    );
  }

  // Cardio
  if (
    days.length >= 7 &&
    activity.cardioMinutesPerWeek < WEEKLY_CARDIO_TARGET / 2
  ) {
    add(
      {
        id: 'cardio',
        tone: 'neutral',
        icon: 'heart-outline',
        text: `Cardio is light: ${activity.cardioMinutesPerWeek} min a week vs ${WEEKLY_CARDIO_TARGET} recommended.`,
      },
      50
    );
  }

  // Weight trend
  if (
    weight.change != null &&
    weight.ratePerWeek != null &&
    Math.abs(weight.change) >= 0.3
  ) {
    const goalDirection =
      targets.weight && weight.latest != null
        ? Math.sign(targets.weight - weight.latest)
        : 0;
    const towardGoal =
      goalDirection !== 0 && Math.sign(weight.change) === goalDirection;
    add(
      {
        id: 'weight-trend',
        tone: towardGoal
          ? 'good'
          : goalDirection !== 0
            ? 'attention'
            : 'neutral',
        icon:
          weight.change < 0 ? 'trending-down-outline' : 'trending-up-outline',
        text: `${weight.change < 0 ? 'Down' : 'Up'} {w} ${period}, about {w2} a week.`,
        weightLb: Math.abs(weight.change),
        weightLb2: Math.abs(weight.ratePerWeek),
      },
      towardGoal ? 70 : 72
    );
  }

  // Weigh-in staleness
  if (weight.daysSinceWeighIn != null && weight.daysSinceWeighIn >= 7) {
    add(
      {
        id: 'weigh-in',
        tone: 'attention',
        icon: 'scale-outline',
        text: `You haven't weighed in for ${weight.daysSinceWeighIn} days.`,
      },
      78
    );
  } else if (weight.weighIns === 0 && weight.lastWeighIn == null) {
    add(
      {
        id: 'weigh-in-first',
        tone: 'neutral',
        icon: 'scale-outline',
        text: 'Log your weight to start tracking your trend.',
      },
      40
    );
  }

  // Doing well → lead with the best good news, then what needs attention
  const good = insights
    .filter(i => i.tone === 'good')
    .sort((a, b) => b.priority - a.priority);
  const rest = insights
    .filter(i => i.tone !== 'good')
    .sort((a, b) => b.priority - a.priority);
  const attentionCount = rest.filter(i => i.tone === 'attention').length;
  const ordered =
    good.length >= attentionCount
      ? [...good, ...rest]
      : [...rest.slice(0, 1), ...good, ...rest.slice(1)];
  return ordered.slice(0, 4).map(({ priority, ...insight }) => {
    void priority;
    return insight;
  });
}
