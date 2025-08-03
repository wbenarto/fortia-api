import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { getTodayDate } from '@/lib/dateUtils';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    const { clerkId, activityDescription, estimatedCalories } = await request.json();
    if (!activityDescription || !clerkId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const today = getTodayDate();

    // Insert the activity into the database
    const result = await sql`
			INSERT INTO activities (clerk_id, activity_description, estimated_calories, date)
			VALUES (${clerkId}, ${activityDescription}, ${estimatedCalories || null}, ${today})
			RETURNING id, activity_description, estimated_calories, date, created_at
		`;

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
    return NextResponse.json({ error: 'Failed to save activity' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clerkId = searchParams.get('clerkId');

    if (!id || !clerkId) {
      return NextResponse.json({ error: 'Activity ID and Clerk ID are required' }, { status: 400 });
    }

    // Delete the activity (only if it belongs to the user)
    const result = await sql`
			DELETE FROM activities 
			WHERE id = ${id} AND clerk_id = ${clerkId}
			RETURNING id
		`;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Activity not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Activity deleted successfully',
    });
  } catch (error) {
    console.error('Activity DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete activity' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const date = searchParams.get('date');

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    if (date) {
      const response = await sql`
				SELECT id, activity_description, estimated_calories, date, created_at
				FROM activities
				WHERE clerk_id = ${clerkId} AND date = ${date}
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
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 400 });
  }
}
