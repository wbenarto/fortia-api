import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { validateOnboardingData } from '@/lib/userUtils';
import { checkUserAuthStatus } from '@/lib/authUtils';

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
  let email = '';
  let clerkId = '';

  try {
    const {
      clerkId: clerkIdParam,
      firstName,
      lastName,
      email: emailParam,
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
    } = await request.json();

    clerkId = clerkIdParam;
    email = emailParam;

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

    // First check if user already exists
    const existingUser = await sql`
			SELECT id FROM users WHERE email = ${email} OR clerk_id = ${clerkId}
		`;

    if (existingUser.length > 0) {
      return NextResponse.json(
        {
          success: true,
          data: existingUser[0],
          message: 'User already exists',
        },
        { status: 200 }
      );
    }

    // Create complete user with all onboarding information
    const result = await sql`
      INSERT INTO users (
        first_name,
        last_name,
        email,
        clerk_id,
        dob,
        age,
        weight,
        starting_weight,
        target_weight,
        height,
        gender,
        activity_level,
        fitness_goal,
        daily_calories,
        daily_protein,
        daily_carbs,
        daily_fats,
        bmr,
        tdee,
        created_at,
        updated_at
      ) VALUES (
        ${firstName},
        ${lastName},
        ${email},
        ${clerkId},
        ${dob},
        ${age},
        ${weight},
        ${startingWeight},
        ${targetWeight},
        ${height},
        ${gender},
        ${activityLevel},
        ${fitnessGoal},
        ${dailyCalories},
        ${dailyProtein},
        ${dailyCarbs},
        ${dailyFats},
        ${bmr},
        ${tdee},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    return NextResponse.json(
      {
        success: true,
        data: result[0],
        message: 'User created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('User creation error:', error);

    // Check for specific database errors
    if (error instanceof Error) {
      if (error.message.includes('duplicate key')) {
        // If we still get a duplicate key error, try to fetch the existing user
        try {
          const existingUser = await sql`
            SELECT id FROM users WHERE email = ${email} OR clerk_id = ${clerkId}
          `;

          if (existingUser.length > 0) {
            return NextResponse.json(
              {
                success: true,
                data: existingUser[0],
                message: 'User already exists',
              },
              { status: 200 }
            );
          }
        } catch (fetchError) {
          console.error('Error fetching existing user:', fetchError);
        }

        return ErrorResponses.conflict('User already exists with this email');
      } else if (error.message.includes('connection')) {
        return ErrorResponses.internalError('Database connection failed');
      }
    }

    return ErrorResponses.internalError('Failed to create user');
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
