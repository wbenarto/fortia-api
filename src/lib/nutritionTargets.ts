/**
 * Single source of truth for turning a user's profile + fitness goal into
 * daily calorie and macronutrient targets.
 *
 * Every path that writes daily_calories / daily_protein / daily_carbs /
 * daily_fats (user create, user update, weight logging) must go through
 * here so the stored numbers always match the user's current profile.
 *
 * Keep this file in sync with the mobile app copy (Fortia/lib/nutritionTargets.ts).
 */

import { calculateBMR, calculateTDEE } from './bmrUtils';

export type FitnessGoal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain'
  | 'improve_fitness';

/**
 * Multiplier applied to BMR (not TDEE) for each fitness goal:
 *  - lose_weight:     10% below BMR
 *  - maintain:        at BMR
 *  - improve_fitness: at BMR
 *  - gain_muscle:     15% above BMR
 *
 * The target is anchored to BMR because the app credits activity separately:
 * "calories out" = BMR + steps + logged activities + logged exercises. If the
 * target were anchored to TDEE the activity portion would be counted twice
 * (once inflating the eating target, once again as calories burned).
 */
export const GOAL_CALORIE_FACTORS: Record<FitnessGoal, number> = {
  lose_weight: 0.9,
  gain_muscle: 1.15,
  maintain: 1.0,
  improve_fitness: 1.0,
};

export type DietType = 'balanced' | 'high_protein' | 'low_carb' | 'keto';

export const DIET_TYPES: DietType[] = [
  'balanced',
  'high_protein',
  'low_carb',
  'keto',
];

export const DEFAULT_DIET_TYPE: DietType = 'balanced';

/**
 * Macro split per diet type, as a fraction of total calories (protein / carbs /
 * fat). The diet only changes how calories are divided — the calorie total
 * itself always comes from the fitness goal (GOAL_CALORIE_FACTORS).
 */
export const DIET_MACRO_SPLITS: Record<
  DietType,
  { protein: number; carbs: number; fats: number }
> = {
  balanced: { protein: 0.25, carbs: 0.45, fats: 0.3 },
  high_protein: { protein: 0.35, carbs: 0.35, fats: 0.3 },
  low_carb: { protein: 0.3, carbs: 0.2, fats: 0.5 },
  keto: { protein: 0.2, carbs: 0.05, fats: 0.75 },
};

/** Default (balanced) split, kept for existing imports. */
export const MACRO_SPLIT = DIET_MACRO_SPLITS.balanced;

/** High protein: at least this many grams per lb of body weight... */
export const HIGH_PROTEIN_GRAMS_PER_LB = 0.8;
/** ...but never more than this share of calories. */
export const HIGH_PROTEIN_MAX_SHARE = 0.45;
/** Keto: carbs never above this many grams/day; the rest goes to fat. */
export const KETO_MAX_CARBS_G = 30;

/** Intermittent fasting schedules. Display only — they don't change targets. */
export type FastingSchedule = 'off' | '16_8' | '18_6' | '20_4' | 'omad';

export const FASTING_SCHEDULES: FastingSchedule[] = [
  'off',
  '16_8',
  '18_6',
  '20_4',
  'omad',
];

export const DEFAULT_FASTING_SCHEDULE: FastingSchedule = 'off';

/** Hours in the eating window for each schedule (OMAD ≈ a 1-hour meal). */
export const FASTING_EATING_HOURS: Record<FastingSchedule, number> = {
  off: 24,
  '16_8': 8,
  '18_6': 6,
  '20_4': 4,
  omad: 1,
};

export const DEFAULT_FASTING_START_HOUR = 12;

export function resolveDietType(diet?: string | null): DietType {
  return diet && (DIET_TYPES as string[]).includes(diet)
    ? (diet as DietType)
    : DEFAULT_DIET_TYPE;
}

const CALORIES_PER_GRAM = { protein: 4, carbs: 4, fats: 9 } as const;

/**
 * Never recommend eating below this, regardless of BMR / goal. 1200 kcal is the
 * widely used lower bound for a self-directed diet without medical supervision.
 */
export const MIN_DAILY_CALORIES = 1200;

/** Resolve a (possibly unknown) goal string to its BMR multiplier. */
export function getGoalCalorieFactor(goal?: string | null): number {
  if (goal && goal in GOAL_CALORIE_FACTORS) {
    return GOAL_CALORIE_FACTORS[goal as FitnessGoal];
  }
  return GOAL_CALORIE_FACTORS.maintain;
}

/** Daily calorie target from BMR and fitness goal (floored at MIN_DAILY_CALORIES). */
export function calculateCalorieTarget(
  bmr: number,
  goal?: string | null
): number {
  return Math.max(
    MIN_DAILY_CALORIES,
    Math.round(bmr * getGoalCalorieFactor(goal))
  );
}

/**
 * Macro targets (grams) for a given calorie total and diet.
 *
 * Plain percentage split, with two adjustments so small or large calorie
 * totals still make sense:
 *  - high_protein: protein is at least HIGH_PROTEIN_GRAMS_PER_LB × body weight
 *    (capped at HIGH_PROTEIN_MAX_SHARE of calories); carbs and fat share the
 *    remaining calories in their usual ratio.
 *  - keto: carbs are capped at KETO_MAX_CARBS_G; the freed calories go to fat.
 */
export function calculateMacros(
  dailyCalories: number,
  dietType?: string | null,
  weightLbs?: number | null
): {
  dailyProtein: number;
  dailyCarbs: number;
  dailyFats: number;
} {
  const diet = resolveDietType(dietType);
  const split = DIET_MACRO_SPLITS[diet];

  let proteinG = (dailyCalories * split.protein) / CALORIES_PER_GRAM.protein;
  let carbsG = (dailyCalories * split.carbs) / CALORIES_PER_GRAM.carbs;
  let fatsG = (dailyCalories * split.fats) / CALORIES_PER_GRAM.fats;

  // DB numeric columns can arrive as strings
  const lbs = Number(weightLbs) || 0;

  if (diet === 'high_protein' && lbs > 0) {
    const maxProteinG =
      (dailyCalories * HIGH_PROTEIN_MAX_SHARE) / CALORIES_PER_GRAM.protein;
    proteinG = Math.min(
      Math.max(proteinG, lbs * HIGH_PROTEIN_GRAMS_PER_LB),
      maxProteinG
    );
    const remaining = dailyCalories - proteinG * CALORIES_PER_GRAM.protein;
    const carbShare = split.carbs / (split.carbs + split.fats);
    carbsG = (remaining * carbShare) / CALORIES_PER_GRAM.carbs;
    fatsG = (remaining * (1 - carbShare)) / CALORIES_PER_GRAM.fats;
  }

  if (diet === 'keto' && carbsG > KETO_MAX_CARBS_G) {
    const freed = (carbsG - KETO_MAX_CARBS_G) * CALORIES_PER_GRAM.carbs;
    carbsG = KETO_MAX_CARBS_G;
    fatsG += freed / CALORIES_PER_GRAM.fats;
  }

  return {
    dailyProtein: Math.round(proteinG),
    dailyCarbs: Math.round(carbsG),
    dailyFats: Math.round(fatsG),
  };
}

export interface NutritionTargetInput {
  weight: number; // lbs
  height: number; // cm
  age: number;
  gender: string;
  activityLevel?: string | null;
  fitnessGoal?: string | null;
  dietType?: string | null;
}

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFats: number;
}

/**
 * Full profile -> BMR, TDEE, calorie + macro targets.
 *
 * `tdee` is still computed and stored for display (e.g. the "calories out"
 * breakdown), but the eating target is derived from BMR — see
 * GOAL_CALORIE_FACTORS.
 */
export function calculateNutritionTargets(
  input: NutritionTargetInput
): NutritionTargets {
  const { weight, height, age, gender, activityLevel, fitnessGoal, dietType } =
    input;

  const bmr = Math.round(calculateBMR(weight, height, age, gender));
  const tdee = calculateTDEE(bmr, activityLevel || 'moderate');
  const dailyCalories = calculateCalorieTarget(bmr, fitnessGoal);
  const macros = calculateMacros(dailyCalories, dietType, weight);

  return { bmr, tdee, dailyCalories, ...macros };
}

interface UserRowLike {
  weight?: number | null;
  height?: number | null;
  age?: number | null;
  gender?: string | null;
  activity_level?: string | null;
  fitness_goal?: string | null;
  diet_type?: string | null;
}

/**
 * Recompute targets from an existing DB row merged with any changed fields.
 * Returns null when the merged data still lacks what a calculation needs
 * (weight, height, age, gender) so callers can leave stored values untouched.
 */
export function recalculateNutritionTargets(
  current: UserRowLike,
  changes: Partial<NutritionTargetInput> = {}
): NutritionTargets | null {
  const weight = changes.weight ?? current.weight ?? undefined;
  const height = changes.height ?? current.height ?? undefined;
  const age = changes.age ?? current.age ?? undefined;
  const gender = changes.gender ?? current.gender ?? undefined;
  const activityLevel =
    changes.activityLevel ?? current.activity_level ?? 'moderate';
  const fitnessGoal = changes.fitnessGoal ?? current.fitness_goal ?? 'maintain';
  const dietType = changes.dietType ?? current.diet_type ?? DEFAULT_DIET_TYPE;

  if (!weight || !height || !age || !gender) {
    return null;
  }

  return calculateNutritionTargets({
    weight,
    height,
    age,
    gender,
    activityLevel,
    fitnessGoal,
    dietType,
  });
}
