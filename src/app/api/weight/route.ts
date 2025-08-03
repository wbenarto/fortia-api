import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { calculateBMR, calculateTDEE } from '@/lib/bmrUtils';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    const { clerkId, weight, date } = await request.json();
    if (!weight || !date || !clerkId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Insert the weight record
    const weightResponse = await sql`
        INSERT INTO weights (
            weight,
            date,
            clerk_id
        )
        VALUES (
            ${weight},
            ${date},
            ${clerkId}
        )
        `;

    // Update BMR and TDEE in user table if they exist
    try {
      // Get user's data to calculate new BMR
      const userData = await sql`
				SELECT height, age, gender, activity_level 
				FROM users 
				WHERE clerk_id = ${clerkId}
			`;

      if (userData.length > 0) {
        const user = userData[0];
        const newBMR = Math.round(calculateBMR(weight, user.height, user.age, user.gender));
        const newTDEE = calculateTDEE(newBMR, user.activity_level);

        // Update user with new weight, BMR and TDEE
        await sql`
					UPDATE users 
					SET 
						weight = ${weight},
						bmr = ${newBMR},
						tdee = ${newTDEE},
						updated_at = NOW()
					WHERE clerk_id = ${clerkId}
				`;

        // BMR and TDEE updated successfully
      }
    } catch (bmrError) {
      console.error('Failed to update BMR:', bmrError);
      // Don't fail the weight logging if BMR update fails
    }

    return NextResponse.json(
      {
        data: weightResponse,
        message: 'Weight logged and BMR updated successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Weight POST error:', err);
    return NextResponse.json({ error: 'Failed to save weight' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    const response = await sql`
        SELECT * FROM weights 
        WHERE clerk_id = ${clerkId}
        ORDER BY date ASC, created_at ASC
        `;

    return NextResponse.json({ data: response });
  } catch (err) {
    console.error('Weight GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch weights' }, { status: 400 });
  }
}
