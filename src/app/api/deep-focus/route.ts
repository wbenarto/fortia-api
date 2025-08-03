import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clerkId, durationSeconds, sessionStartTime, sessionEndTime, isCompleted } = body;

    // Validate required fields
    if (!clerkId || !durationSeconds) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: clerkId and durationSeconds' },
        { status: 400 }
      );
    }

    // Validate duration is positive
    if (durationSeconds <= 0) {
      return NextResponse.json(
        { success: false, error: 'Duration must be greater than 0' },
        { status: 400 }
      );
    }



    // Insert the deep focus session
    const result = await sql`
			INSERT INTO deep_focus_sessions (
				clerk_id, 
				duration_seconds, 
				session_start_time, 
				session_end_time, 
				is_completed
			) VALUES (
				${clerkId}, 
				${durationSeconds}, 
				${sessionStartTime || null}, 
				${sessionEndTime || null}, 
				${isCompleted || false}
			) RETURNING id, duration_seconds, duration_minutes, session_date, created_at
		`;

    console.log('Deep focus session saved successfully');

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    console.error('Error saving deep focus session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save deep focus session' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const period = searchParams.get('period') || 'week'; // week, month, year

    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Missing clerkId parameter' },
        { status: 400 }
      );
    }



    let query;

    switch (period) {
      case 'today':
        // Get today's data
        query = sql`
					SELECT 
						'Today' as day_label,
						CURRENT_DATE as date,
						COALESCE(SUM(duration_minutes), 0) as total_minutes,
						COALESCE(SUM(duration_minutes) / 60.0, 0) as total_hours
					FROM deep_focus_sessions 
					WHERE clerk_id = ${clerkId} 
						AND DATE(session_date) = CURRENT_DATE
				`;
        break;
      case 'week':
        // Get current week data (Sunday to Saturday)
        query = sql`
					SELECT 
						TO_CHAR(session_date, 'Dy') as day_label,
						DATE(session_date) as date,
						COALESCE(SUM(duration_minutes), 0) as total_minutes,
						COALESCE(SUM(duration_minutes) / 60.0, 0) as total_hours
					FROM deep_focus_sessions 
					WHERE clerk_id = ${clerkId} 
						AND session_date >= DATE_TRUNC('week', CURRENT_DATE)
						AND session_date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
					GROUP BY session_date, TO_CHAR(session_date, 'Dy')
					ORDER BY session_date
				`;
        break;
      case 'month':
        // Get last 30 days of data
        query = sql`
					SELECT 
						TO_CHAR(session_date, 'MM/DD') as day_label,
						DATE(session_date) as date,
						COALESCE(SUM(duration_minutes), 0) as total_minutes,
						COALESCE(SUM(duration_minutes) / 60.0, 0) as total_hours
					FROM deep_focus_sessions 
					WHERE clerk_id = ${clerkId} 
						AND session_date >= CURRENT_DATE - INTERVAL '29 days'
					GROUP BY session_date, TO_CHAR(session_date, 'MM/DD')
					ORDER BY session_date
				`;
        break;
      case 'year':
        // Get this year's data
        query = sql`
					SELECT 
						TO_CHAR(session_date, 'Mon') as day_label,
						DATE(session_date) as date,
						COALESCE(SUM(duration_minutes), 0) as total_minutes,
						COALESCE(SUM(duration_minutes) / 60.0, 0) as total_hours
					FROM deep_focus_sessions 
					WHERE clerk_id = ${clerkId} 
						AND session_date >= DATE_TRUNC('year', CURRENT_DATE)
					GROUP BY session_date, TO_CHAR(session_date, 'Mon')
					ORDER BY session_date
				`;
        break;
      default:
        query = sql`
					SELECT 
						TO_CHAR(session_date, 'Dy') as day_label,
						DATE(session_date) as date,
						COALESCE(SUM(duration_minutes), 0) as total_minutes,
						COALESCE(SUM(duration_minutes) / 60.0, 0) as total_hours
					FROM deep_focus_sessions 
					WHERE clerk_id = ${clerkId} 
						AND session_date >= CURRENT_DATE - INTERVAL '6 days'
					GROUP BY session_date, TO_CHAR(session_date, 'Dy')
					ORDER BY session_date
				`;
    }

    const result = await query;

    console.log('Deep focus data retrieved successfully');

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching deep focus data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch deep focus data' },
      { status: 500 }
    );
  }
}
