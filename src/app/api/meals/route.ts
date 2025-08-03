import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { getTodayDate, getDayBounds } from '@/lib/dateUtils';

const sql = neon(process.env.DATABASE_URL!);

// GET - Get user's meals for a specific date
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const date = searchParams.get('date') || getTodayDate();
    const summary = searchParams.get('summary');

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    // Get day bounds for proper timezone handling
    const { start, end } = getDayBounds(date);

    if (summary === 'true') {
      // Get daily nutrition summary using timezone-aware date range
      const summaryData = await sql`
        SELECT 
          COALESCE(SUM(calories), 0) as total_calories,
          COALESCE(SUM(protein), 0) as total_protein,
          COALESCE(SUM(carbs), 0) as total_carbs,
          COALESCE(SUM(fats), 0) as total_fats,
          COALESCE(SUM(fiber), 0) as total_fiber,
          COALESCE(SUM(sugar), 0) as total_sugar,
          COALESCE(SUM(sodium), 0) as total_sodium,
          COUNT(*) as meal_count
        FROM meals 
        WHERE clerk_id = ${clerkId} 
        AND created_at >= ${start.toISOString()}
        AND created_at < ${end.toISOString()}
      `;

      return NextResponse.json({
        success: true,
        data: summaryData[0] || {
          total_calories: 0,
          total_protein: 0,
          total_carbs: 0,
          total_fats: 0,
          total_fiber: 0,
          total_sugar: 0,
          total_sodium: 0,
          meal_count: 0,
        },
      });
    }

    // Get individual meals for the date using timezone-aware date range
    const meals = await sql`
      SELECT * FROM meals 
      WHERE clerk_id = ${clerkId} 
      AND created_at >= ${start.toISOString()}
      AND created_at < ${end.toISOString()}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ success: true, data: meals });
  } catch (error) {
    console.error('Get meals error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch meals',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST - Log a new meal
export async function POST(request: NextRequest) {
  try {
    const {
      clerkId,
      foodName,
      portionSize,
      calories,
      protein,
      carbs,
      fats,
      fiber,
      sugar,
      sodium,
      confidenceScore,
      mealType,
      notes,
    } = await request.json();

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    // Validate and convert numeric fields
    const validatedData = {
      calories: Math.round(Number(calories) || 0),
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fats: Number(fats) || 0,
      fiber: Number(fiber) || 0,
      sugar: Number(sugar) || 0,
      sodium: Math.round(Number(sodium) || 0),
      confidenceScore: Number(confidenceScore) || 0,
    };

    // Validate numeric ranges
    if (
      isNaN(validatedData.calories) ||
      validatedData.calories < 0 ||
      validatedData.calories > 10000
    ) {
      return NextResponse.json({ error: 'Invalid calories value' }, { status: 400 });
    }
    if (isNaN(validatedData.protein) || validatedData.protein < 0 || validatedData.protein > 1000) {
      return NextResponse.json({ error: 'Invalid protein value' }, { status: 400 });
    }
    if (isNaN(validatedData.carbs) || validatedData.carbs < 0 || validatedData.carbs > 1000) {
      return NextResponse.json({ error: 'Invalid carbs value' }, { status: 400 });
    }
    if (isNaN(validatedData.fats) || validatedData.fats < 0 || validatedData.fats > 1000) {
      return NextResponse.json({ error: 'Invalid fats value' }, { status: 400 });
    }
    if (isNaN(validatedData.fiber) || validatedData.fiber < 0 || validatedData.fiber > 100) {
      return NextResponse.json({ error: 'Invalid fiber value' }, { status: 400 });
    }
    if (isNaN(validatedData.sugar) || validatedData.sugar < 0 || validatedData.sugar > 1000) {
      return NextResponse.json({ error: 'Invalid sugar value' }, { status: 400 });
    }
    if (isNaN(validatedData.sodium) || validatedData.sodium < 0 || validatedData.sodium > 10000) {
      return NextResponse.json({ error: 'Invalid sodium value' }, { status: 400 });
    }
    if (
      isNaN(validatedData.confidenceScore) ||
      validatedData.confidenceScore < 0 ||
      validatedData.confidenceScore > 1
    ) {
      return NextResponse.json({ error: 'Invalid confidence score' }, { status: 400 });
    }

    const newMeal = await sql`
			INSERT INTO meals (
				clerk_id, food_name, portion_size, calories, protein, carbs, fats, 
				fiber, sugar, sodium, confidence_score, meal_type, notes, created_at, updated_at
			) VALUES (
				${clerkId}, ${foodName}, ${portionSize}, ${validatedData.calories}, 
				${validatedData.protein}, ${validatedData.carbs}, ${validatedData.fats},
				${validatedData.fiber}, ${validatedData.sugar}, ${validatedData.sodium}, 
				${validatedData.confidenceScore}, ${mealType}, ${notes}, NOW(), NOW()
			)
			RETURNING *
		`;

    return NextResponse.json({ success: true, data: newMeal[0] });
  } catch (error) {
    console.error('Create meal error:', error);
    return NextResponse.json({ error: 'Failed to create meal' }, { status: 500 });
  }
}

// DELETE - Delete a meal
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mealId = searchParams.get('id');
    const clerkId = searchParams.get('clerkId');

    if (!mealId || !clerkId) {
      return NextResponse.json({ error: 'Meal ID and Clerk ID are required' }, { status: 400 });
    }

    const result = await sql`
			DELETE FROM meals 
			WHERE id = ${mealId} AND clerk_id = ${clerkId}
			RETURNING *
		`;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Meal not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Delete meal error:', error);
    return NextResponse.json({ error: 'Failed to delete meal' }, { status: 500 });
  }
}
