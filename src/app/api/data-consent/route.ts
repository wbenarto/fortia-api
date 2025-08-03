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
			SELECT * FROM data_consent 
			WHERE clerk_id = ${clerkId}
			ORDER BY created_at DESC 
			LIMIT 1
		`;

    return NextResponse.json({ success: true, data: result[0] || null });
  } catch (error) {
    console.error('Fetch data consent error:', error);
    return NextResponse.json({ error: 'Failed to fetch consent data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      clerkId,
      basicProfile = true,
      healthMetrics = false,
      nutritionData = false,
      weightTracking = false,
      stepTracking = false,
      workoutActivities = false,
      consentVersion = '1.0',
      consentMethod = 'onboarding',
    } = await request.json();

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    const result = await sql`
			INSERT INTO data_consent (
				clerk_id, basic_profile, health_metrics, nutrition_data, 
				weight_tracking, step_tracking, workout_activities, 
				consent_version, consent_method, created_at, updated_at
			) VALUES (
				${clerkId}, ${basicProfile}, ${healthMetrics}, ${nutritionData},
				${weightTracking}, ${stepTracking}, ${workoutActivities},
				${consentVersion}, ${consentMethod}, NOW(), NOW()
			)
			ON CONFLICT (clerk_id) DO UPDATE SET
				basic_profile = EXCLUDED.basic_profile,
				health_metrics = EXCLUDED.health_metrics,
				nutrition_data = EXCLUDED.nutrition_data,
				weight_tracking = EXCLUDED.weight_tracking,
				step_tracking = EXCLUDED.step_tracking,
				workout_activities = EXCLUDED.workout_activities,
				consent_version = EXCLUDED.consent_version,
				consent_method = EXCLUDED.consent_method,
				updated_at = NOW()
			RETURNING *
		`;

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Store data consent error:', error);
    return NextResponse.json({ error: 'Failed to store consent data' }, { status: 500 });
  }
}
