import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses, handleDatabaseError, validateRequiredFields } from '@/lib/errorUtils';
import { validateOnboardingData } from '@/lib/userUtils';
import { createUserInDatabase, checkUserAuthStatus } from '@/lib/authUtils';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    // Use the auth utility to check user status (matches main app flow)
    const authStatus = await checkUserAuthStatus(clerkId);

    if (!authStatus.success) {
      return ErrorResponses.internalError(authStatus.message);
    }

    return NextResponse.json({
      success: true,
      data: authStatus.data || null,
      code: authStatus.code,
      needsOnboarding: authStatus.needsOnboarding,
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { clerkId, firstName, lastName, email } = await request.json();

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    // Use the auth utility to create user (matches main app flow)
    const userCreationResult = await createUserInDatabase({
      clerkId,
      firstName: firstName || '',
      lastName: lastName || '',
      email: email || '',
    });

    if (!userCreationResult.success) {
      return ErrorResponses.internalError(userCreationResult.message);
    }

    return NextResponse.json({
      success: true,
      data: userCreationResult.data,
      code: userCreationResult.code,
      message: userCreationResult.message,
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const {
      clerkId,
      firstName,
      lastName,
      dob,
      age,
      weight,
      startingWeight,
      targetWeight,
      height,
      gender,
      activityLevel,
      fitnessGoal,
      dailyCalories,
      dailyProtein,
      dailyCarbs,
      dailyFats,
      bmr,
      tdee,
      customCalories,
      customProtein,
      customCarbs,
      customFats,
    } = await request.json();

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    // Validate onboarding data
    const validation = validateOnboardingData({
      clerkId,
      dob,
      age,
      weight,
      height,
      gender,
      fitnessGoal,
      targetWeight,
    });

    if (!validation.isValid) {
      return ErrorResponses.badRequest(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // First check if user exists
    const existingUser = await sql`
			SELECT id FROM users WHERE clerk_id = ${clerkId}
		`;

    if (existingUser.length === 0) {
      return ErrorResponses.notFound('User not found. Please complete sign-up first.');
    }

    // Update user with onboarding information
    const result = await sql`
      UPDATE users 
      SET 
        first_name = COALESCE(${firstName}, first_name),
        last_name = COALESCE(${lastName}, last_name),
        dob = COALESCE(${dob}, dob),
        age = COALESCE(${age}, age),
        weight = COALESCE(${weight}, weight),
        starting_weight = COALESCE(${startingWeight}, starting_weight),
        target_weight = COALESCE(${targetWeight}, target_weight),
        height = COALESCE(${height}, height),
        gender = COALESCE(${gender}, gender),
        activity_level = COALESCE(${activityLevel}, activity_level),
        fitness_goal = COALESCE(${fitnessGoal}, fitness_goal),
        daily_calories = COALESCE(${dailyCalories}, daily_calories),
        daily_protein = COALESCE(${dailyProtein}, daily_protein),
        daily_carbs = COALESCE(${dailyCarbs}, daily_carbs),
        daily_fats = COALESCE(${dailyFats}, daily_fats),
        bmr = COALESCE(${bmr}, bmr),
        tdee = COALESCE(${tdee}, tdee),
        custom_calories = COALESCE(${customCalories}, custom_calories),
        custom_protein = COALESCE(${customProtein}, custom_protein),
        custom_carbs = COALESCE(${customCarbs}, custom_carbs),
        custom_fats = COALESCE(${customFats}, custom_fats),
        updated_at = NOW()
      WHERE clerk_id = ${clerkId}
      RETURNING *
    `;

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
