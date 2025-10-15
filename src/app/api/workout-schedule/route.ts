import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Get full workout schedule for a specific program
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const programId = searchParams.get('programId');
  const clerkId = searchParams.get('clerkId');

  if (!programId || !clerkId) {
    return NextResponse.json(
      { error: 'Program ID and Clerk ID are required' },
      { status: 400 }
    );
  }

  try {
    // Get program details
    const [program] = await sql`
      SELECT * FROM workout_programs
      WHERE id = ${programId} AND clerk_id = ${clerkId}
    `;

    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    // Get all scheduled sessions
    const sessions = await sql`
      SELECT
        ws.id, ws.title, ws.week_number, ws.session_number,
        ws.phase_name, ws.completion_status, ws.scheduled_date,
        ws.warm_up_video_url,
        COUNT(we.id) as exercise_count
      FROM workout_sessions ws
      LEFT JOIN workout_exercises we ON ws.id = we.workout_session_id
      WHERE ws.program_id = ${programId}
      GROUP BY ws.id, ws.title, ws.week_number, ws.session_number,
               ws.phase_name, ws.completion_status, ws.scheduled_date,
               ws.warm_up_video_url
      ORDER BY ws.scheduled_date, ws.session_number
    `;

    // Group sessions by week
    const scheduleByWeek = sessions.reduce((acc: any, session: any) => {
      const week = session.week_number;
      if (!acc[week]) {
        acc[week] = {
          weekNumber: week,
          sessions: [],
        };
      }
      acc[week].sessions.push(session);
      return acc;
    }, {});

    // Calculate progress statistics
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(
      (s: any) => s.completion_status === 'completed'
    ).length;
    const upcomingSessions = sessions.filter(
      (s: any) =>
        s.completion_status === 'scheduled' &&
        new Date(s.scheduled_date) >= new Date()
    );

    return NextResponse.json({
      success: true,
      data: {
        program,
        schedule: Object.values(scheduleByWeek),
        statistics: {
          totalSessions,
          completedSessions,
          upcomingSessions: upcomingSessions.length,
          completionRate:
            totalSessions > 0
              ? Math.round((completedSessions / totalSessions) * 100)
              : 0,
        },
      },
    });
  } catch (error) {
    console.error('Get workout schedule error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout schedule', details: error.message },
      { status: 500 }
    );
  }
}

