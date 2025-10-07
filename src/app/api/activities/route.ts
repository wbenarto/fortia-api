import { getDayBounds, getTodayDate, parseLocalDate } from '@/lib/dateUtils';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    const { clerkId, activityDescription, estimatedCalories, date } =
      await request.json();
    if (!activityDescription || !clerkId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use provided date or fallback to today's date
    const activityDate = date || getTodayDate();

    // Create a timezone-aware timestamp for the activity (like meals)
    const localDate = parseLocalDate(activityDate);
    localDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone edge cases
    const activityTimestamp = localDate.toISOString();

    // Insert the activity into the database with timezone-aware timestamp
    const result = await sql`
			INSERT INTO activities (clerk_id, activity_description, estimated_calories, date, created_at)
			VALUES (${clerkId}, ${activityDescription}, ${estimatedCalories || null}, ${activityDate}, ${activityTimestamp})
			RETURNING id, activity_description, estimated_calories, date, created_at
		`;

    // Update daily quest for exercise logging ONLY for actual exercises (not BMR or Steps)
    // Check if this is an actual exercise by excluding BMR and Steps activities
    const isActualExercise =
      !activityDescription.toLowerCase().includes('basal metabolic rate') &&
      !activityDescription.toLowerCase().includes('daily steps');

    if (isActualExercise) {
      try {
        await sql`
          INSERT INTO daily_quests (clerk_id, date, exercise_logged)
          VALUES (${clerkId}, ${activityDate}, true)
          ON CONFLICT (clerk_id, date)
          DO UPDATE SET exercise_logged = true, updated_at = NOW()
        `;

        // Check if all quests are completed and update day_completed
        const questStatus = await sql`
          SELECT weight_logged, meal_logged, exercise_logged, day_completed
          FROM daily_quests
          WHERE clerk_id = ${clerkId} AND date = ${activityDate}
        `;

        if (questStatus.length > 0) {
          const quest = questStatus[0];
          const allCompleted =
            quest.weight_logged && quest.meal_logged && quest.exercise_logged;

          if (allCompleted && !quest.day_completed) {
            await sql`
              UPDATE daily_quests
              SET day_completed = true, updated_at = NOW()
              WHERE clerk_id = ${clerkId} AND date = ${activityDate}
            `;
          }
        }
      } catch (questError) {
        console.error('Failed to update daily quest:', questError);
        // Don't fail the activity logging if quest update fails
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: result[0],
        message: 'Activity logged successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Activity POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save activity' },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const {
      clerkId,
      activityDescription,
      estimatedCalories,
      activityType,
      date,
    } = await request.json();

    if (!clerkId || !activityType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use provided date or fallback to today's date
    const activityDate = date || getTodayDate();

    // Create a timezone-aware timestamp for the activity (like meals)
    const localDate = parseLocalDate(activityDate);
    localDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone edge cases
    const activityTimestamp = localDate.toISOString();

    // Update existing activity entry for today
    // This is specifically for updating daily entries like steps or BMR
    // Use specific matching based on activity type to prevent updating multiple entries
    let result;

    if (activityType === 'Basal Metabolic Rate') {
      // For BMR, look for entries containing "Basal Metabolic Rate"
      // First, find the most recent BMR entry for this user and date
      const latestBMREntry = await sql`
        SELECT id
        FROM activities
        WHERE
          clerk_id = ${clerkId}
          AND date = ${activityDate}
          AND activity_description LIKE '%Basal Metabolic Rate%'
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (latestBMREntry.length === 0) {
        return NextResponse.json(
          { error: 'No matching activity found to update' },
          { status: 404 }
        );
      }

      // Update the specific entry
      result = await sql`
        UPDATE activities
        SET
          activity_description = ${activityDescription || 'Basal Metabolic Rate (BMR)'},
          estimated_calories = ${estimatedCalories || null},
          created_at = ${activityTimestamp}
        WHERE id = ${latestBMREntry[0].id}
        RETURNING id, activity_description, estimated_calories, date, created_at
      `;
    } else if (activityType === 'Daily Steps') {
      // For Steps, look for entries containing "Daily Steps"
      // First, find the most recent steps entry for this user and date
      const latestStepsEntry = await sql`
        SELECT id
        FROM activities
        WHERE
          clerk_id = ${clerkId}
          AND date = ${activityDate}
          AND activity_description LIKE '%Daily Steps%'
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (latestStepsEntry.length === 0) {
        return NextResponse.json(
          { error: 'No matching activity found to update' },
          { status: 404 }
        );
      }

      // Update the specific entry
      result = await sql`
        UPDATE activities
        SET
          activity_description = ${activityDescription || 'Daily Steps'},
          estimated_calories = ${estimatedCalories || null},
          created_at = ${activityTimestamp}
        WHERE id = ${latestStepsEntry[0].id}
        RETURNING id, activity_description, estimated_calories, date, created_at
      `;
    } else {
      // Fallback for other activity types
      result = await sql`
        UPDATE activities
        SET
          activity_description = ${activityDescription || 'Daily Activity'},
          estimated_calories = ${estimatedCalories || null},
          created_at = ${activityTimestamp}
        WHERE
          clerk_id = ${clerkId}
          AND date = ${activityDate}
          AND activity_description LIKE ${`%${activityType}%`}
        ORDER BY created_at DESC
        LIMIT 1
        RETURNING id, activity_description, estimated_calories, date, created_at
      `;
    }

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'No matching activity found to update' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result[0],
        message: 'Activity updated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Activity PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update activity' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clerkId = searchParams.get('clerkId');

    if (!id || !clerkId) {
      return NextResponse.json(
        { error: 'Activity ID and Clerk ID are required' },
        { status: 400 }
      );
    }

    // Delete the activity (only if it belongs to the user)
    const result = await sql`
			DELETE FROM activities
			WHERE id = ${id} AND clerk_id = ${clerkId}
			RETURNING id
		`;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Activity not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Activity deleted successfully',
    });
  } catch (error) {
    console.error('Activity DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete activity' },
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
      // Use timezone-aware date bounds for accurate retrieval (like meals)
      const { start, end } = getDayBounds(date);

      const response = await sql`
				SELECT id, activity_description, estimated_calories, date, created_at
				FROM activities
				WHERE clerk_id = ${clerkId}
				AND created_at >= ${start.toISOString()}
				AND created_at < ${end.toISOString()}
				ORDER BY created_at DESC
			`;
      return NextResponse.json({ success: true, data: response });
    } else {
      const response = await sql`
				SELECT id, activity_description, estimated_calories, date, created_at
				FROM activities
				WHERE clerk_id = ${clerkId}
				ORDER BY created_at DESC
			`;
      return NextResponse.json({ success: true, data: response });
    }
  } catch (error) {
    console.error('Activity GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 400 }
    );
  }
}
