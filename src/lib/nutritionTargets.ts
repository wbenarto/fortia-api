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

/** Macro split as a fraction of total calories (protein / carbs / fat). */
export const MACRO_SPLIT = { protein: 0.25, carbs: 0.45, fats: 0.3 } as const;

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

/** Macro targets (grams) for a given calorie total. */
export function calculateMacros(dailyCalories: number): {
  dailyProtein: number;
  dailyCarbs: number;
  dailyFats: number;
} {
  return {
    dailyProtein: Math.round(
      (dailyCalories * MACRO_SPLIT.protein) / CALORIES_PER_GRAM.protein
    ),
    dailyCarbs: Math.round(
      (dailyCalories * MACRO_SPLIT.carbs) / CALORIES_PER_GRAM.carbs
    ),
    dailyFats: Math.round(
      (dailyCalories * MACRO_SPLIT.fats) / CALORIES_PER_GRAM.fats
    ),
  };
}

export interface NutritionTargetInput {
  weight: number; // lbs
  height: number; // cm
  age: number;
  gender: string;
  activityLevel?: string | null;
  fitnessGoal?: string | null;
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
  const { weight, height, age, gender, activityLevel, fitnessGoal } = input;

  const bmr = Math.round(calculateBMR(weight, height, age, gender));
  const tdee = calculateTDEE(bmr, activityLevel || 'moderate');
  const dailyCalories = calculateCalorieTarget(bmr, fitnessGoal);
  const macros = calculateMacros(dailyCalories);

  return { bmr, tdee, dailyCalories, ...macros };
}

interface UserRowLike {
  weight?: number | null;
  height?: number | null;
  age?: number | null;
  gender?: string | null;
  activity_level?: string | null;
  fitness_goal?: string | null;
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
  });
}
