/**
 * Body Fat Percentage utility functions
 * Uses the Deurenberg formula for body fat calculation
 * Includes age and gender adjustments for accuracy
 */

/**
 * Calculate body fat percentage using Deurenberg formula
 * @param weight - Weight in pounds
 * @param height - Height in inches
 * @param age - Age in years
 * @param gender - 'male' or 'female'
 * @returns Body fat percentage
 */
export function calculateBodyFatPercentage(
  weight: number,
  height: number,
  age: number,
  gender: string
): number {
  if (!weight || !height || !age || !gender) {
    return 0;
  }

  // Convert to metric
  const weightInKg = weight * 0.453592; // lbs to kg
  const heightInM = height * 0.0254; // inches to meters

  // Calculate BMI
  const bmi = weightInKg / (heightInM * heightInM);

  // Deurenberg formula (includes age and gender)
  const genderValue = gender === 'male' ? 1 : 0;
  const bodyFatPercentage = 1.2 * bmi + 0.23 * age - 10.8 * genderValue - 5.4;

  // Ensure result is within reasonable bounds (0-50%)
  return Math.max(0, Math.min(50, Math.round(bodyFatPercentage * 10) / 10));
}

/**
 * Get body fat category based on age and gender
 * @param bodyFatPercentage - Body fat percentage
 * @param age - Age in years
 * @param gender - 'male' or 'female'
 * @returns Object with category, description, and color
 */
export function getBodyFatCategory(
  bodyFatPercentage: number,
  age: number,
  gender: string
): { category: string; description: string; color: string } {
  let category: string;
  let description: string;
  let color: string;

  if (gender === 'male') {
    if (bodyFatPercentage < 6) {
      category = 'Essential Fat';
      description = 'Minimum required for health';
      color = '#3B82F6';
    } else if (bodyFatPercentage < 14) {
      category = 'Athletes';
      description = 'Very lean, athletic range';
      color = '#10B981';
    } else if (bodyFatPercentage < 18) {
      category = 'Fitness';
      description = 'Good fitness level';
      color = '#10B981';
    } else if (bodyFatPercentage < 25) {
      category = 'Average';
      description = 'Normal range';
      color = '#F59E0B';
    } else {
      category = 'Obese';
      description = 'Above healthy range';
      color = '#EF4444';
    }
  } else {
    // female
    if (bodyFatPercentage < 10) {
      category = 'Essential Fat';
      description = 'Minimum required for health';
      color = '#3B82F6';
    } else if (bodyFatPercentage < 16) {
      category = 'Athletes';
      description = 'Very lean, athletic range';
      color = '#10B981';
    } else if (bodyFatPercentage < 20) {
      category = 'Fitness';
      description = 'Good fitness level';
      color = '#10B981';
    } else if (bodyFatPercentage < 25) {
      category = 'Average';
      description = 'Normal range';
      color = '#F59E0B';
    } else {
      category = 'Obese';
      description = 'Above healthy range';
      color = '#EF4444';
    }
  }

  return { category, description, color };
}

/**
 * Calculate BMI using weight and height
 * @param weight - Weight in pounds
 * @param height - Height in inches
 * @returns BMI value
 */
export function calculateBMI(weight: number, height: number): number {
  if (!weight || !height || weight <= 0 || height <= 0) {
    return 0;
  }

  // Convert to metric for calculation
  const weightInKg = weight * 0.453592; // Convert lbs to kg
  const heightInM = height * 0.0254; // Convert inches to meters

  const bmi = weightInKg / (heightInM * heightInM);
  return Math.round(bmi * 10) / 10; // Round to 1 decimal place
}

/**
 * Get BMI category and description
 * @param bmi - BMI value
 * @returns Object with category and description
 */
export function getBMICategory(bmi: number): {
  category: string;
  description: string;
  color: string;
} {
  if (bmi < 18.5) {
    return {
      category: 'Underweight',
      description: 'Below normal weight range',
      color: '#3B82F6', // Blue
    };
  } else if (bmi >= 18.5 && bmi < 25) {
    return {
      category: 'Normal',
      description: 'Healthy weight range',
      color: '#10B981', // Green
    };
  } else if (bmi >= 25 && bmi < 30) {
    return {
      category: 'Overweight',
      description: 'Above normal weight range',
      color: '#F59E0B', // Yellow
    };
  } else {
    return {
      category: 'Obese',
      description: 'Significantly above normal weight',
      color: '#EF4444', // Red
    };
  }
}
