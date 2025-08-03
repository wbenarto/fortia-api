import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    const result = await sql`
			SELECT * FROM users 
			WHERE clerk_id = ${clerkId}
			ORDER BY created_at DESC 
			LIMIT 1
		`;

    return NextResponse.json({ success: true, data: result[0] || null });
  } catch (error) {
    console.error('Fetch user error:', error);
    return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      clerkId,
      firstName,
      lastName,
      email,
      dateOfBirth,
      gender,
      height,
      weight,
      activityLevel,
      goal,
      targetWeight,
      timezone,
    } = await request.json();

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    const result = await sql`
			INSERT INTO users (
				clerk_id, first_name, last_name, email, date_of_birth, 
				gender, height, weight, activity_level, goal, 
				target_weight, timezone, created_at, updated_at
			) VALUES (
				${clerkId}, ${firstName}, ${lastName}, ${email}, ${dateOfBirth},
				${gender}, ${height}, ${weight}, ${activityLevel}, ${goal},
				${targetWeight}, ${timezone}, NOW(), NOW()
			)
			ON CONFLICT (clerk_id) DO UPDATE SET
				first_name = EXCLUDED.first_name,
				last_name = EXCLUDED.last_name,
				email = EXCLUDED.email,
				date_of_birth = EXCLUDED.date_of_birth,
				gender = EXCLUDED.gender,
				height = EXCLUDED.height,
				weight = EXCLUDED.weight,
				activity_level = EXCLUDED.activity_level,
				goal = EXCLUDED.goal,
				target_weight = EXCLUDED.target_weight,
				timezone = EXCLUDED.timezone,
				updated_at = NOW()
			RETURNING *
		`;

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Store user error:', error);
    return NextResponse.json({ error: 'Failed to store user data' }, { status: 500 });
  }
}
