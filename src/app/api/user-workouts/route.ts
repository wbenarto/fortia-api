import { insertActivity } from '@/lib/activities';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { fetchUserProfile } from '@/lib/userUtils';
import {
  estimateMinutes,
  estimateWorkoutCalories,
  hydrateWorkout,
  sanitizeBlocks,
  type UserWorkoutRow,
} from '@/lib/workoutBuilder';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

const findWorkout = async (id: number, clerkId: string) => {
  const [row] = (await sql`
    SELECT * FROM user_workouts WHERE id = ${id} AND clerk_id = ${clerkId}
  `) as UserWorkoutRow[];
  return row || null;
};

// GET ?clerkId=…           list (most recent first, no exercise details)
// GET ?clerkId=…&id=…      one workout with its exercises from the library
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const id = Number(searchParams.get('id'));
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');

    if (id) {
      const row = await findWorkout(id, clerkId);
      if (!row) return ErrorResponses.notFound('Workout not found');
      return NextResponse.json({
        success: true,
        data: await hydrateWorkout(row),
      });
    }

    const limit = Math.min(
      50,
      Math.max(1, Number(searchParams.get('limit')) || 20)
    );
    const rows = (await sql`
      SELECT * FROM user_workouts
      WHERE clerk_id = ${clerkId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as UserWorkoutRow[];
    return NextResponse.json({
      success: true,
      data: rows.map(({ blocks, progress, ...row }) => ({
        ...row,
        est_minutes: estimateMinutes(blocks),
        exercise_count: blocks.filter(b => b.section === 'main').length,
      })),
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

// PUT ?id=…  body: { clerkId, blocks?, progress?, status?, activeMinutes?, calories?, date? }
// status 'completed' records the workout as ONE activities row (feeds calories out).
// Re-completing updates that same row instead of adding another.
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    const body = await request.json();
    const clerkId = typeof body.clerkId === 'string' ? body.clerkId : '';
    if (!id || !clerkId)
      return ErrorResponses.badRequest('Workout id and Clerk ID are required');

    const row = await findWorkout(id, clerkId);
    if (!row) return ErrorResponses.notFound('Workout not found');

    let blocks = row.blocks;
    if (body.blocks !== undefined) {
      const sanitized = await sanitizeBlocks(body.blocks);
      if (!sanitized) return ErrorResponses.badRequest('Invalid exercises');
      blocks = sanitized;
    }

    const progress =
      body.progress && typeof body.progress === 'object'
        ? body.progress
        : row.progress;
    const status = ['planned', 'in_progress', 'completed'].includes(body.status)
      ? (body.status as UserWorkoutRow['status'])
      : row.status;

    let activeMinutes = row.active_minutes;
    let calories = row.calories;
    let activityId = row.activity_id;

    if (status === 'completed') {
      activeMinutes = Math.min(
        300,
        Math.max(1, Math.round(Number(body.activeMinutes) || 0))
      );
      if (
        Number.isFinite(Number(body.calories)) &&
        body.calories !== null &&
        body.calories !== ''
      ) {
        calories = Math.min(
          3000,
          Math.max(0, Math.round(Number(body.calories)))
        );
      } else {
        const profile = await fetchUserProfile(clerkId);
        calories = estimateWorkoutCalories(
          row.inputs.style,
          Number(profile?.weight) || 160,
          activeMinutes
        );
      }

      if (activityId) {
        const updated = await sql`
          UPDATE activities SET estimated_calories = ${calories}
          WHERE id = ${activityId} AND clerk_id = ${clerkId}
          RETURNING id
        `;
        if (updated.length === 0) activityId = null; // deleted meanwhile
      }
      if (!activityId) {
        const activity = await insertActivity({
          clerkId,
          description: `${row.title} workout`,
          calories,
          date: typeof body.date === 'string' ? body.date : null,
        });
        activityId = activity.id;
      }
    }

    const [updated] = (await sql`
      UPDATE user_workouts SET
        blocks = ${JSON.stringify(blocks)},
        progress = ${JSON.stringify(progress)},
        status = ${status},
        active_minutes = ${activeMinutes},
        calories = ${calories},
        activity_id = ${activityId},
        started_at = CASE WHEN ${status} <> 'planned' THEN COALESCE(started_at, NOW()) ELSE started_at END,
        completed_at = CASE WHEN ${status} = 'completed' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `) as UserWorkoutRow[];

    return NextResponse.json({
      success: true,
      data: await hydrateWorkout(updated),
    });
  } catch (error) {
    console.error('User workout update error:', error);
    return handleDatabaseError(error);
  }
}

// DELETE ?id=…&clerkId=…  removes the workout (its logged activity, if any, stays)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    const clerkId = searchParams.get('clerkId');
    if (!id || !clerkId)
      return ErrorResponses.badRequest('Workout id and Clerk ID are required');
    await sql`DELETE FROM user_workouts WHERE id = ${id} AND clerk_id = ${clerkId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
