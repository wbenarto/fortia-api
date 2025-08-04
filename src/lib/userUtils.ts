import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export interface UserProfile {
  id: string;
  clerk_id: string;
  first_name: string;
  last_name: string;
  email: string;
  dob?: string;
  age?: number;
  weight?: number;
  height?: number;
  target_weight?: number;
  starting_weight?: number;
  gender?: string;
  activity_level?: string;
  fitness_goal?: string;
  daily_calories?: number;
  daily_protein?: number;
  daily_carbs?: number;
  daily_fats?: number;
  bmr?: number;
  tdee?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch user profile from database
 */
export async function fetchUserProfile(clerkId: string): Promise<UserProfile | null> {
  try {
    const result = await sql`
			SELECT * FROM users 
			WHERE clerk_id = ${clerkId}
			ORDER BY created_at DESC 
			LIMIT 1
		`;

    return (result[0] as UserProfile) || null;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return null;
  }
}

/**
 * Check if user has completed onboarding
 */
export function hasCompletedOnboarding(userProfile: UserProfile | null): boolean {
  if (!userProfile) return false;

  return !!(
    userProfile.dob &&
    userProfile.age &&
    userProfile.weight &&
    userProfile.height &&
    userProfile.gender &&
    userProfile.fitness_goal &&
    userProfile.daily_calories
  );
}

/**
 * Get user display name
 */
export function getUserDisplayName(userProfile: UserProfile | null): string {
  if (!userProfile) return 'User';

  if (userProfile.first_name && userProfile.last_name) {
    return `${userProfile.first_name} ${userProfile.last_name}`;
  }

  if (userProfile.first_name) {
    return userProfile.first_name;
  }

  if (userProfile.email) {
    return userProfile.email.split('@')[0];
  }

  return 'User';
}

/**
 * Get user initials
 */
export function getUserInitials(userProfile: UserProfile | null): string {
  if (!userProfile) return 'U';

  const firstName = userProfile.first_name || '';
  const lastName = userProfile.last_name || '';

  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }

  if (firstName) {
    return firstName[0].toUpperCase();
  }

  if (lastName) {
    return lastName[0].toUpperCase();
  }

  return 'U';
}

interface OnboardingData {
  clerkId?: string;
  dob?: string;
  age?: number;
  weight?: number;
  height?: number;
  gender?: string;
  fitnessGoal?: string;
  targetWeight?: number;
}

/**
 * Validate user data for onboarding
 */
export function validateOnboardingData(data: OnboardingData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.clerkId) errors.push('Clerk ID is required');
  if (!data.dob) errors.push('Date of birth is required');
  if (!data.age || data.age < 13 || data.age > 120) errors.push('Valid age is required (13-120)');
  if (!data.weight || data.weight < 30 || data.weight > 500)
    errors.push('Valid weight is required (30-500 lbs)');
  if (!data.height || data.height < 100 || data.height > 250)
    errors.push('Valid height is required (100-250 cm)');
  if (!data.gender || !['male', 'female', 'other'].includes(data.gender))
    errors.push('Valid gender is required');
  if (
    !data.fitnessGoal ||
    !['lose_weight', 'gain_muscle', 'maintain', 'improve_fitness'].includes(data.fitnessGoal)
  ) {
    errors.push('Valid fitness goal is required');
  }
  if (!data.targetWeight || data.targetWeight < 30 || data.targetWeight > 500) {
    errors.push('Valid target weight is required (30-500 lbs)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Check if user exists in database
 */
export async function userExists(clerkId: string): Promise<boolean> {
  try {
    const result = await sql`
			SELECT id FROM users WHERE clerk_id = ${clerkId}
		`;
    return result.length > 0;
  } catch (error) {
    console.error('Failed to check if user exists:', error);
    return false;
  }
}

/**
 * Get user's nutrition goals
 */
export function getNutritionGoals(userProfile: UserProfile | null): {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFats: number;
} | null {
  if (!userProfile || !userProfile.daily_calories) return null;

  return {
    dailyCalories: userProfile.daily_calories,
    dailyProtein: userProfile.daily_protein || 0,
    dailyCarbs: userProfile.daily_carbs || 0,
    dailyFats: userProfile.daily_fats || 0,
  };
}
