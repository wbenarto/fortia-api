import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Calculate calories burned from steps
function calculateCaloriesFromSteps(
  steps: number,
  userProfile: { weight: number; height: number; gender: string }
) {
  // Calculate stride length based on gender
  let strideLength;
  if (userProfile.gender === 'male') {
    strideLength = (userProfile.height * 0.415) / 100; // meters per step
  } else {
    strideLength = (userProfile.height * 0.413) / 100; // meters per step
  }

  // Calculate distance walked
  const distanceMeters = steps * strideLength;
  const distanceKm = distanceMeters / 1000;

  // Calculate calories burned (rough estimate: 0.6 calories per kg per km)
  const caloriesBurned = Math.round(distanceKm * userProfile.weight * 0.6);

  return caloriesBurned;
}

export async function POST(request: NextRequest) {
  try {
    const { clerkId, steps, goal = 10000, date, caloriesBurned } = await request.json();
    if (!clerkId || steps === undefined || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch user's nutrition profile for calorie calculation
    let calculatedCalories = caloriesBurned;
    try {
      const userProfile = await sql`
				SELECT weight, height, age, gender 
				FROM users 
				WHERE clerk_id = ${clerkId}
			`;

      if (userProfile.length > 0 && steps > 0) {
        const profile = userProfile[0];
        if (profile.weight && profile.height && profile.gender) {
          calculatedCalories = calculateCaloriesFromSteps(steps, {
            weight: Number(profile.weight),
            height: Number(profile.height),
            gender: profile.gender,
          });
        }
      }
    } catch {
      // Use provided caloriesBurned or fallback to 0
      calculatedCalories = caloriesBurned || 0;
    }

    // Upsert step data (insert or update) - only update if steps have changed
    const result = await sql`
			INSERT INTO steps (clerk_id, steps, goal, calories_burned, date)
			VALUES (${clerkId}, ${steps}, ${goal}, ${calculatedCalories}, ${date})
			ON CONFLICT (clerk_id, date) 
			DO UPDATE SET 
				steps = CASE 
					WHEN steps.steps != EXCLUDED.steps THEN EXCLUDED.steps
					ELSE steps.steps
				END,
				goal = EXCLUDED.goal,
				calories_burned = EXCLUDED.calories_burned,
				created_at = CASE 
					WHEN steps.steps != EXCLUDED.steps THEN NOW()
					ELSE steps.created_at
				END
			RETURNING *
		`;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (err) {
    console.error('Steps POST error:', err);
    return NextResponse.json({ error: 'Failed to save steps' }, { status: 400 });
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

    let query;
    if (date) {
      // Get steps for specific date
      query = sql`
				SELECT * FROM steps 
				WHERE clerk_id = ${clerkId} AND date = ${date}
				ORDER BY created_at DESC
				LIMIT 1
			`;
    } else {
      // Get all steps for user
      query = sql`
				SELECT * FROM steps 
				WHERE clerk_id = ${clerkId}
				ORDER BY date DESC
				LIMIT 30
			`;
    }

    const response = await query;

    return NextResponse.json({ success: true, data: response });
  } catch (err) {
    console.error('Steps GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch steps' }, { status: 400 });
  }
}
