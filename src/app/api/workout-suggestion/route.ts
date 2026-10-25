import { getDayBounds, getTodayDate } from '@/lib/dateUtils';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { fetchUserProfile } from '@/lib/userUtils';
import { suggestWorkouts } from '@/lib/workoutSuggestion';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// GET ?clerkId=…&date=YYYY-MM-DD&location=gym&equipment=dumbbells,bench
// Today's suggested workouts (best first) from the user's history — DB only, no AI.
// location/equipment are the app's saved builder choices, used until the user has
// built workouts of their own. Also returns any workout in progress / done today so
// the card can show Resume or Done instead.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    const dateParam = searchParams.get('date');
    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : getTodayDate();
    const { start, end } = getDayBounds(date);

    const [profile, inProgress, completed] = await Promise.all([
      fetchUserProfile(clerkId),
      sql`
        SELECT id, title FROM user_workouts
        WHERE clerk_id = ${clerkId} AND status = 'in_progress'
        ORDER BY updated_at DESC LIMIT 1
      `,
      sql`
        SELECT id, title, calories FROM user_workouts
        WHERE clerk_id = ${clerkId} AND status = 'completed'
          AND completed_at >= ${start.toISOString()} AND completed_at <= ${end.toISOString()}
        ORDER BY completed_at DESC LIMIT 1
      `,
    ]);
    const list = await suggestWorkouts(clerkId, date, profile?.fitness_goal, {
      location: searchParams.get('location'),
      equipment: (searchParams.get('equipment') || '')
        .split(',')
        .filter(Boolean),
    });

    return NextResponse.json({
      success: true,
      data: {
        suggestions: list,
        inProgress: inProgress[0] || null,
        completedToday: completed[0] || null,
      },
    });
  } catch (error) {
    console.error('Workout suggestion error:', error);
    return handleDatabaseError(error);
  }
}
