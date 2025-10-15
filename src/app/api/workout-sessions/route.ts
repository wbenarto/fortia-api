import { recordMuscleBalance } from '@/lib/muscleBalanceUtils';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Get workout session details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const clerkId = searchParams.get('clerkId');

    if (!sessionId || !clerkId) {
      return NextResponse.json(
        { error: 'Session ID and Clerk ID are required' },
        { status: 400 }
      );
    }

    // Get session details
    const [session] = await sql`
      SELECT
        ws.id, ws.title, ws.week_number, ws.session_number, ws.phase_name,
        ws.completion_status, ws.scheduled_date, ws.warm_up_video_url,
        wp.program_name, wp.program_goal, wp.muscle_balance_target
      FROM workout_sessions ws
      JOIN workout_programs wp ON ws.program_id = wp.id
      WHERE ws.id = ${sessionId} AND ws.clerk_id = ${clerkId}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get exercises
    const exercises = await sql`
      SELECT
        id, exercise_name, sets, reps, rest_seconds, order_index,
        muscle_groups, video_url, exercise_completed, completion_notes
      FROM workout_exercises
      WHERE workout_session_id = ${sessionId}
      ORDER BY order_index
    `;

    return NextResponse.json({
      success: true,
      data: {
        session,
        exercises,
      },
    });
  } catch (error) {
    console.error('Get workout session error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout session', details: error.message },
      { status: 500 }
    );
  }
}

// Complete workout session
export async function POST(request: NextRequest) {
  try {
    const { sessionId, clerkId, exercises, difficultyRating, notes } =
      await request.json();

    if (!sessionId || !clerkId || !exercises) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Update session completion status
    await sql`
      UPDATE workout_sessions
      SET completion_status = 'completed', updated_at = NOW()
      WHERE id = ${sessionId} AND clerk_id = ${clerkId}
    `;

    // Update exercise completions
    for (const exercise of exercises) {
      await sql`
        UPDATE workout_exercises
        SET exercise_completed = ${exercise.completed || false},
            completion_notes = ${exercise.notes || null}
        WHERE id = ${exercise.id} AND workout_session_id = ${sessionId}
      `;
    }

    // Record muscle balance
    const [session] = await sql`
      SELECT program_id, scheduled_date
      FROM workout_sessions
      WHERE id = ${sessionId}
    `;

    if (session) {
      await recordMuscleBalance(
        clerkId,
        session.program_id,
        sessionId,
        exercises,
        session.scheduled_date
      );
    }

    // Store feedback
    if (difficultyRating) {
      await sql`
        INSERT INTO workout_feedback (
          clerk_id, session_id, difficulty_rating, notes
        ) VALUES (
          ${clerkId}, ${sessionId}, ${difficultyRating}, ${notes || null}
        )
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Workout completed successfully',
    });
  } catch (error) {
    console.error('Complete workout session error:', error);
    return NextResponse.json(
      { error: 'Failed to complete workout session', details: error.message },
      { status: 500 }
    );
  }
}

// Update exercise completion
export async function PUT(request: NextRequest) {
  try {
    const { exerciseId, completed, notes, sessionId, clerkId } =
      await request.json();

    if (!exerciseId) {
      return NextResponse.json(
        { error: 'Exercise ID is required' },
        { status: 400 }
      );
    }

    // Update exercise completion
    await sql`
      UPDATE workout_exercises
      SET exercise_completed = ${completed || false},
          completion_notes = ${notes || null}
      WHERE id = ${exerciseId}
    `;

    // If this is the first exercise being started, update session status to in_progress
    if (sessionId && clerkId && completed) {
      const [session] = await sql`
        SELECT completion_status FROM workout_sessions
        WHERE id = ${sessionId} AND clerk_id = ${clerkId}
      `;

      if (session && session.completion_status === 'scheduled') {
        await sql`
          UPDATE workout_sessions
          SET completion_status = 'in_progress', updated_at = NOW()
          WHERE id = ${sessionId} AND clerk_id = ${clerkId}
        `;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Exercise updated successfully',
    });
  } catch (error) {
    console.error('Update exercise error:', error);
    return NextResponse.json(
      { error: 'Failed to update exercise', details: error.message },
      { status: 500 }
    );
  }
}

// Save exercise completion states
export async function PATCH(request: NextRequest) {
  try {
    const { sessionId, clerkId, completionStates } = await request.json();

    if (!sessionId || !clerkId || !completionStates) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Update each exercise's completion state
    for (let i = 0; i < completionStates.length; i++) {
      const isCompleted = completionStates[i];
      await sql`
        UPDATE workout_exercises
        SET exercise_completed = ${isCompleted},
            completion_notes = ${isCompleted ? 'Completed' : 'Not completed'}
        WHERE workout_session_id = ${sessionId}
        AND order_index = ${i + 1}
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Exercise completion states saved successfully',
    });
  } catch (error) {
    console.error('Save completion states error:', error);
    return NextResponse.json(
      { error: 'Failed to save completion states', details: error.message },
      { status: 500 }
    );
  }
}
