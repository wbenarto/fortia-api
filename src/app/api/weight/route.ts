import { calculateBMR, calculateTDEE } from '@/lib/bmrUtils';
import { calculateBodyFatPercentage } from '@/lib/bodyFatUtils';
import { getDayBounds, parseLocalDate } from '@/lib/dateUtils';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    const { clerkId, weight, date } = await request.json();
    if (!weight || !date || !clerkId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create a timezone-aware timestamp for the weight (like activities/meals)
    const localDate = parseLocalDate(date);
    localDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone edge cases
    const weightTimestamp = localDate.toISOString();

    // Insert the weight record with timezone-aware timestamp
    const weightResponse = await sql`
        INSERT INTO weights (
            weight,
            date,
            clerk_id,
            created_at
        )
        VALUES (
            ${weight},
            ${date},
            ${clerkId},
            ${weightTimestamp}
        )
        `;

    // Update BMR and TDEE in user table if they exist
    try {
      // Get user's data to calculate new BMR
      const userData = await sql`
				SELECT height, age, gender, activity_level, fitness_goal
				FROM users
				WHERE clerk_id = ${clerkId}
			`;

      if (userData.length > 0) {
        const user = userData[0];
        console.log(user);
        const newBMR = Math.round(
          calculateBMR(weight, user.height, user.age, user.gender)
        );
        const newTDEE = calculateTDEE(newBMR, user.activity_level);

        // Calculate daily macros based on new TDEE
        let dailyCalories = 0;
        let dailyProtein = 0;
        let dailyCarbs = 0;
        let dailyFats = 0;

        if (user.fitness_goal == 'lose_weight') {
          dailyCalories = Math.round(newTDEE * 0.8);
          dailyProtein = Math.round((dailyCalories * 0.25) / 4); // 25% protein
          dailyCarbs = Math.round((dailyCalories * 0.45) / 4); // 45% carbs
          dailyFats = Math.round((dailyCalories * 0.3) / 9); // 30% fats
        } else if (user.fitness_goal === 'gain_muscle') {
          dailyCalories = Math.round(newTDEE * 0.9);
          dailyProtein = Math.round((dailyCalories * 0.4) / 4); // 25% protein
          dailyCarbs = Math.round((dailyCalories * 0.3) / 4); // 45% carbs
          dailyFats = Math.round((dailyCalories * 0.3) / 9); // 30% fats
        } else {
          dailyCalories = Math.round(newTDEE * 0.9);
          dailyProtein = Math.round((dailyCalories * 0.25) / 4); // 25% protein
          dailyCarbs = Math.round((dailyCalories * 0.45) / 4); // 45% carbs
          dailyFats = Math.round((dailyCalories * 0.3) / 9); // 30% fats
        }

        // Calculate body fat percentage
        const heightInInches = user.height / 2.54; // Convert cm to inches
        const bodyFatPercentage = calculateBodyFatPercentage(
          weight,
          heightInInches,
          user.age,
          user.gender
        );

        // Update user with new weight, BMR, TDEE, daily macros, and body fat percentage
        await sql`
          UPDATE users
          SET
            weight = ${weight},
            bmr = ${newBMR},
            tdee = ${newTDEE},
            daily_calories = ${dailyCalories},
            daily_protein = ${dailyProtein},
            daily_carbs = ${dailyCarbs},
            daily_fats = ${dailyFats},
            body_fat_percentage = ${bodyFatPercentage},
            updated_at = NOW()
          WHERE clerk_id = ${clerkId}
        `;

        // BMR and TDEE updated successfully
      }
    } catch (bmrError) {
      console.error('Failed to update BMR:', bmrError);
      // Don't fail the weight logging if BMR update fails
    }

    // Update daily quest for weight logging
    try {
      await sql`
        INSERT INTO daily_quests (clerk_id, date, weight_logged)
        VALUES (${clerkId}, ${date}, true)
        ON CONFLICT (clerk_id, date)
        DO UPDATE SET weight_logged = true, updated_at = NOW()
      `;

      // Check if all quests are completed and update day_completed
      const questStatus = await sql`
        SELECT weight_logged, meal_logged, exercise_logged, day_completed
        FROM daily_quests
        WHERE clerk_id = ${clerkId} AND date = ${date}
      `;

      if (questStatus.length > 0) {
        const quest = questStatus[0];
        const allCompleted =
          quest.weight_logged && quest.meal_logged && quest.exercise_logged;

        if (allCompleted && !quest.day_completed) {
          await sql`
            UPDATE daily_quests
            SET day_completed = true, updated_at = NOW()
            WHERE clerk_id = ${clerkId} AND date = ${date}
          `;
        }
      }
    } catch (questError) {
      console.error('Failed to update daily quest:', questError);
      // Don't fail the weight logging if quest update fails
    }

    return NextResponse.json(
      {
        data: weightResponse,
        message: 'Weight logged and BMR updated successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Weight POST error:', err);
    return NextResponse.json(
      { error: 'Failed to save weight' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const date = searchParams.get('date');

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Clerk ID is required' },
        { status: 400 }
      );
    }

    if (date) {
      // Use timezone-aware date bounds for accurate retrieval (like activities/meals)
      const { start, end } = getDayBounds(date);

      const response = await sql`
        SELECT * FROM weights
        WHERE clerk_id = ${clerkId}
        AND created_at >= ${start.toISOString()}
        AND created_at < ${end.toISOString()}
        ORDER BY date ASC, created_at ASC
      `;
      return NextResponse.json({ data: response });
    } else {
      const response = await sql`
        SELECT * FROM weights
        WHERE clerk_id = ${clerkId}
        ORDER BY date ASC, created_at ASC
      `;
      return NextResponse.json({ data: response });
    }
  } catch (err) {
    console.error('Weight GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch weights' },
      { status: 400 }
    );
  }
}
