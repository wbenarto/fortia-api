/**
 * BMR (Basal Metabolic Rate) utility functions
 * Uses the Mifflin-St Jeor Equation for accurate BMR calculation
 */

/**
 * Calculate BMR using Mifflin-St Jeor Equation
 * @param weight - Weight in pounds (will be converted to kg)
 * @param height - Height in centimeters
 * @param age - Age in years
 * @param gender - 'male' or 'female'
 * @returns BMR in calories per day
 */
export function calculateBMR(
  weight: number,
  height: number,
  age: number,
  gender: string
): number {
  // Convert weight from pounds to kilograms (1 lb = 0.453592 kg)
  const weightInKg = weight * 0.453592;
  console.log('calculating bmr ', weight, height, age, gender);

  // Height is already in centimeters (stored in DB as cm)
  if (gender === 'male') {
    return 10 * weightInKg + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weightInKg + 6.25 * height - 5 * age - 161;
  }
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure) based on activity level
 * @param bmr - Basal Metabolic Rate
 * @param activityLevel - Activity level string
 * @returns TDEE in calories per day
 */
export function calculateTDEE(bmr: number, activityLevel: string): number {
  // const activityMultipliers = {
  //   sedentary: 1.2, // Little or no exercise
  //   light: 1.375, // Light exercise 1-3 days/week
  //   moderate: 1.55, // Moderate exercise 3-5 days/week
  //   active: 1.725, // Hard exercise 6-7 days/week
  //   very_active: 1.9, // Very hard exercise, physical job
  // };

  const activityMultipliers = {
    sedentary: 1.1, // Little or no exercise
    light: 1.2, // Light exercise 1-3 days/week
    moderate: 1.4, // Moderate exercise 3-5 days/week
    active: 1.5, // Hard exercise 6-7 days/week
    very_active: 1.8, // Very hard exercise, physical job
  };
  const multiplier =
    activityMultipliers[activityLevel as keyof typeof activityMultipliers] ||
    1.2;
  return Math.round(bmr * multiplier);
}

/**
 * Update BMR and TDEE in nutrition goals when weight changes
 * @param userId - User ID
 * @param newWeight - New weight in kg
 * @param height - Height in cm
 * @param age - Age in years
 * @param gender - Gender
 * @param activityLevel - Activity level
 * @returns Updated BMR and TDEE values
 */
export function updateBMRAndTDEE(
  userId: string,
  newWeight: number,
  height: number,
  age: number,
  gender: string,
  activityLevel: string
): { bmr: number; tdee: number } {
  const bmr = Math.round(calculateBMR(newWeight, height, age, gender));
  const tdee = calculateTDEE(bmr, activityLevel);

  return { bmr, tdee };
}

/**
 * Get activity level description
 * @param activityLevel - Activity level string
 * @returns Human-readable description
 */
export function getActivityLevelDescription(activityLevel: string): string {
  const descriptions = {
    sedentary: 'Little or no exercise',
    light: 'Light exercise 1-3 days/week',
    moderate: 'Moderate exercise 3-5 days/week',
    active: 'Hard exercise 6-7 days/week',
    very_active: 'Very hard exercise, physical job',
  };

  return (
    descriptions[activityLevel as keyof typeof descriptions] ||
    'Unknown activity level'
  );
}

/**
 * Format BMR for display
 * @param bmr - BMR value
 * @returns Formatted string
 */
export function formatBMR(bmr: number): string {
  return `${bmr.toLocaleString()} kcal/day`;
}
