import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { getDayBounds } from '@/lib/dateUtils';

const sql = neon(process.env.DATABASE_URL!);

interface WorkoutRow {
  session_id: number;
  title: string;
  workout_type: string;
  scheduled_date: string;
  created_at: string;
  exercise_id?: number;
  exercise_name?: string;
  sets?: number;
  reps?: number;
  weight?: number;
  duration?: number;
  order_index?: number;
  is_completed?: boolean;
  completed_at?: string;
  calories_burned?: number;
}

interface GroupedWorkout {
  id: number;
  title: string;
  workout_type: string;
  scheduled_date: string;
  created_at: string;
  exercises: Array<{
    id: number;
    name: string;
    sets?: number;
    reps?: number;
    weight?: number;
    duration?: number;
    order_index?: number;
    is_completed?: boolean;
    completed_at?: string;
    calories_burned?: number;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, selectedDate, exercises, clerkId, duration } = body;

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 401 });
    }

    // Validate required fields
    if (!title || !type || !selectedDate) {
      return NextResponse.json(
        { error: 'Missing required fields: title, type, or selectedDate' },
        { status: 400 }
      );
    }

    // Validate workout type
    if (!['exercise', 'barbell'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid workout type. Must be "exercise" or "barbell"' },
        { status: 400 }
      );
    }

    // For barbell type, validate exercises
    if (type === 'barbell' && (!exercises || exercises.length === 0)) {
      return NextResponse.json(
        { error: 'Barbell workouts must have at least one exercise' },
        { status: 400 }
      );
    }

    // Create workout session
    const [workoutSession] = await sql`
			INSERT INTO workout_sessions (clerk_id, title, workout_type, scheduled_date)
			VALUES (${clerkId}, ${title}, ${type}, ${selectedDate})
			RETURNING id
		`;

    const sessionId = workoutSession.id;

    // Handle exercises based on type
    if (type === 'exercise') {
      // For single exercise, create one workout_exercise entry
      await sql`
				INSERT INTO workout_exercises (workout_session_id, exercise_name, duration, order_index, calories_burned)
				VALUES (${sessionId}, ${title}, ${duration}, 1, ${body.calories_burned || null})
			`;
    } else if (type === 'barbell') {
      // For multi-exercise workout, create entries for each exercise
      for (let i = 0; i < exercises.length; i++) {
        const exercise = exercises[i];
        await sql`
					INSERT INTO workout_exercises (
						workout_session_id, 
						exercise_name, 
						sets, 
						reps, 
						weight, 
						duration, 
						order_index,
						calories_burned
					)
					VALUES (
						${sessionId}, 
						${exercise.name}, 
						${parseInt(exercise.sets)}, 
						${parseInt(exercise.reps)}, 
						${parseFloat(exercise.weight)}, 
						${exercise.duration}, 
						${i + 1},
						${exercise.calories_burned || null}
					)
				`;
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Workout saved successfully',
    });
  } catch (error) {
    console.error('Error saving workout:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const date = searchParams.get('date');

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 401 });
    }

    let workouts;

    if (date) {
      // Get day bounds for proper timezone handling
      const { start, end } = getDayBounds(date);

      workouts = await sql`
				SELECT 
					ws.id as session_id,
					ws.title,
					ws.workout_type,
					ws.scheduled_date,
					ws.created_at,
					we.id as exercise_id,
					we.exercise_name,
					we.sets,
					we.reps,
					we.weight,
					we.duration,
					we.order_index,
					we.is_completed,
					we.completed_at,
					we.calories_burned
				FROM workout_sessions ws
				LEFT JOIN workout_exercises we ON ws.id = we.workout_session_id
				WHERE ws.clerk_id = ${clerkId} 
				AND ws.created_at >= ${start.toISOString()}
				AND ws.created_at < ${end.toISOString()}
				ORDER BY ws.scheduled_date DESC, we.order_index ASC
			`;
    } else {
      workouts = await sql`
				SELECT 
					ws.id as session_id,
					ws.title,
					ws.workout_type,
					ws.scheduled_date,
					ws.created_at,
					we.id as exercise_id,
					we.exercise_name,
					we.sets,
					we.reps,
					we.weight,
					we.duration,
					we.order_index,
					we.is_completed,
					we.completed_at,
					we.calories_burned
				FROM workout_sessions ws
				LEFT JOIN workout_exercises we ON ws.id = we.workout_session_id
				WHERE ws.clerk_id = ${clerkId}
				ORDER BY ws.scheduled_date DESC, we.order_index ASC
			`;
    }

    // Group exercises by session
    const groupedWorkouts = (workouts as WorkoutRow[]).reduce((acc: Record<string, GroupedWorkout>, row: WorkoutRow) => {
      const sessionId = row.session_id;

      if (!acc[sessionId]) {
        acc[sessionId] = {
          id: sessionId,
          title: row.title,
          workout_type: row.workout_type,
          scheduled_date: row.scheduled_date,
          created_at: row.created_at,
          exercises: [],
        };
      }

      if (row.exercise_id && row.exercise_name) {
        acc[sessionId].exercises.push({
          id: row.exercise_id,
          name: row.exercise_name,
          sets: row.sets,
          reps: row.reps,
          weight: row.weight,
          duration: row.duration,
          order_index: row.order_index,
          is_completed: row.is_completed,
          completed_at: row.completed_at,
          calories_burned: row.calories_burned,
        });
      }

      return acc;
    }, {} as Record<string, GroupedWorkout>);

    return NextResponse.json({
      success: true,
      workouts: Object.values(groupedWorkouts),
    });
  } catch (error) {
    console.error('Error fetching workouts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const sessionId = searchParams.get('sessionId');
    const exerciseId = searchParams.get('exerciseId');



    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 401 });
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const parsedSessionId = parseInt(sessionId);
    if (isNaN(parsedSessionId)) {
      return NextResponse.json({ error: 'Invalid session ID format' }, { status: 400 });
    }

    // If exerciseId is provided, delete individual exercise
    if (exerciseId) {
      const parsedExerciseId = parseInt(exerciseId);
      if (isNaN(parsedExerciseId)) {
        return NextResponse.json({ error: 'Invalid exercise ID format' }, { status: 400 });
      }



      // Verify the exercise belongs to a session owned by the user
      const exerciseCheck = await sql`
				SELECT we.id, we.exercise_name, ws.clerk_id 
				FROM workout_exercises we
				JOIN workout_sessions ws ON we.workout_session_id = ws.id
				WHERE we.id = ${parsedExerciseId} AND ws.clerk_id = ${clerkId}
			`;



      if (exerciseCheck.length === 0) {
        console.log('Exercise not found or access denied');
        return NextResponse.json({ error: 'Exercise not found or access denied' }, { status: 404 });
      }

      // Delete the individual exercise
      await sql`
				DELETE FROM workout_exercises 
				WHERE id = ${parsedExerciseId}
			`;

      console.log('Exercise deleted successfully');

      // Check if this was the last exercise in the session
      const remainingExercises = await sql`
				SELECT COUNT(*) as count
				FROM workout_exercises 
				WHERE workout_session_id = ${parsedSessionId}
			`;

      if (remainingExercises[0].count === 0) {
        // If no exercises left, delete the session too
        await sql`
					DELETE FROM workout_sessions 
					WHERE id = ${parsedSessionId} AND clerk_id = ${clerkId}
				`;
        console.log('Session deleted (no exercises remaining)');
        return NextResponse.json({
          success: true,
          message: 'Exercise and session deleted successfully',
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Exercise deleted successfully',
      });
    }

    // If no exerciseId, delete entire session (existing behavior)


    // First verify the session belongs to the user
    const sessionCheck = await sql`
			SELECT id FROM workout_sessions 
			WHERE id = ${parsedSessionId} AND clerk_id = ${clerkId}
		`;



    if (sessionCheck.length === 0) {
      console.log('Session not found or access denied');
      return NextResponse.json(
        { error: 'Workout session not found or access denied' },
        { status: 404 }
      );
    }



    // Delete the workout session (this will cascade delete all exercises due to ON DELETE CASCADE)
    await sql`
			DELETE FROM workout_sessions 
			WHERE id = ${parsedSessionId} AND clerk_id = ${clerkId}
		`;

    console.log('Session deleted successfully');

    return NextResponse.json({
      success: true,
      message: 'Workout session deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting workout session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
