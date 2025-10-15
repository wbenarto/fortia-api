import { getTodayDate } from '@/lib/dateUtils';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Get user's workout programs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Clerk ID is required' },
        { status: 400 }
      );
    }

    const programs = await sql`
      SELECT
        wp.id, wp.program_name, wp.program_goal, wp.total_weeks,
        wp.sessions_per_week, wp.session_duration, wp.workout_days,
        wp.available_equipment, wp.status, wp.start_date, wp.created_at,
        wp.muscle_balance_target
      FROM workout_programs wp
      WHERE wp.clerk_id = ${clerkId}
      ORDER BY wp.created_at DESC
    `;

    // If no programs found, return empty array
    if (!programs || programs.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // Get current week's sessions for each program
    const programsWithSessions = await Promise.all(
      programs.map(async program => {
        const currentWeek = Math.ceil(
          (new Date().getTime() - new Date(program.start_date).getTime()) /
            (7 * 24 * 60 * 60 * 1000)
        );

        // Get current week sessions and next few upcoming sessions
        const sessions = await sql`
          SELECT
            ws.id, ws.title, ws.week_number, ws.session_number,
            ws.phase_name, ws.completion_status, ws.scheduled_date,
            ws.warm_up_video_url
          FROM workout_sessions ws
          WHERE ws.program_id = ${program.id}
            AND ws.scheduled_date >= ${getTodayDate()}
            AND ws.week_number <= ${Math.min(currentWeek + 1, program.total_weeks)}
          ORDER BY ws.scheduled_date, ws.session_number
          LIMIT 10
        `;

        return {
          ...program,
          currentWeek: Math.min(currentWeek, program.total_weeks),
          sessions,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: programsWithSessions,
    });
  } catch (error) {
    console.error('Get workout programs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout programs', details: error.message },
      { status: 500 }
    );
  }
}

// Create new workout program
export async function POST(request: NextRequest) {
  try {
    const {
      clerkId,
      programName,
      goal,
      totalWeeks,
      sessionsPerWeek,
      sessionDuration,
      workoutDays,
      equipment,
    } = await request.json();

    if (!clerkId || !programName || !goal) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const [program] = await sql`
      INSERT INTO workout_programs (
        clerk_id, program_name, program_goal, total_weeks, sessions_per_week,
        session_duration, workout_days, available_equipment, start_date
      ) VALUES (
        ${clerkId}, ${programName}, ${goal}, ${totalWeeks}, ${sessionsPerWeek},
        ${sessionDuration}, ${workoutDays}, ${equipment}, ${new Date().toISOString().split('T')[0]}
      )
      RETURNING id, program_name, created_at
    `;

    return NextResponse.json({
      success: true,
      data: program,
    });
  } catch (error) {
    console.error('Create workout program error:', error);
    return NextResponse.json(
      { error: 'Failed to create workout program', details: error.message },
      { status: 500 }
    );
  }
}

// Update workout program
export async function PUT(request: NextRequest) {
  try {
    const { programId, clerkId, updates } = await request.json();

    if (!programId || !clerkId) {
      return NextResponse.json(
        { error: 'Program ID and Clerk ID are required' },
        { status: 400 }
      );
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = $${updateFields.length + 1}`);
        updateValues.push(value);
      }
    });

    if (updateFields.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updateValues.push(programId, clerkId);

    const query = `
      UPDATE workout_programs
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${updateFields.length + 1} AND clerk_id = $${updateFields.length + 2}
      RETURNING id, program_name, updated_at
    `;

    const [updatedProgram] = await sql(query, updateValues);

    if (!updatedProgram) {
      return NextResponse.json(
        { error: 'Program not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedProgram,
    });
  } catch (error) {
    console.error('Update workout program error:', error);
    return NextResponse.json(
      { error: 'Failed to update workout program', details: error.message },
      { status: 500 }
    );
  }
}

// Delete workout program
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get('programId');
    const clerkId = searchParams.get('clerkId');

    if (!programId || !clerkId) {
      return NextResponse.json(
        { error: 'Program ID and Clerk ID are required' },
        { status: 400 }
      );
    }

    // Soft delete by updating status
    const [deletedProgram] = await sql`
      UPDATE workout_programs
      SET status = 'deleted', updated_at = NOW()
      WHERE id = ${programId} AND clerk_id = ${clerkId}
      RETURNING id, program_name
    `;

    if (!deletedProgram) {
      return NextResponse.json(
        { error: 'Program not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Program deleted successfully',
      data: deletedProgram,
    });
  } catch (error) {
    console.error('Delete workout program error:', error);
    return NextResponse.json(
      { error: 'Failed to delete workout program', details: error.message },
      { status: 500 }
    );
  }
}
