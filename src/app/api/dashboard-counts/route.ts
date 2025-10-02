import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';

const sql = neon(process.env.DATABASE_URL!);

// GET - Get total counts for dashboard
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    // Get total counts for all categories
    const [mealsCount, weightsCount, exercisesCount, activitiesCount] = await Promise.all([
      // Total meals logged
      sql`
        SELECT COUNT(*) as total_meals
        FROM meals 
        WHERE clerk_id = ${clerkId}
      `,
      // Total weights logged
      sql`
        SELECT COUNT(*) as total_weights
        FROM weights 
        WHERE clerk_id = ${clerkId}
      `,
      // Total exercises logged (from workout_exercises)
      sql`
        SELECT COUNT(*) as total_exercises
        FROM workout_exercises we
        JOIN workout_sessions ws ON we.workout_session_id = ws.id
        WHERE ws.clerk_id = ${clerkId}
      `,
      // Total activities logged (from activities table, excluding Daily Steps and BMR)
      sql`
        SELECT COUNT(*) as total_activities
        FROM activities 
        WHERE clerk_id = ${clerkId}
        AND activity_description NOT LIKE '%Daily Steps%'
        AND activity_description NOT LIKE '%Basal Metabolic Rate%'
      `
    ]);

    const counts = {
      totalMeals: parseInt(mealsCount[0]?.total_meals || '0'),
      totalWeights: parseInt(weightsCount[0]?.total_weights || '0'),
      totalExercises: parseInt(exercisesCount[0]?.total_exercises || '0') + parseInt(activitiesCount[0]?.total_activities || '0'),
    };

    return NextResponse.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
