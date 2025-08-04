import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { getTodayDate, getDayBounds, parseLocalDate } from '@/lib/dateUtils';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';

const sql = neon(process.env.DATABASE_URL!);

// GET - Get user's meals for a specific date
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const date = searchParams.get('date') || getTodayDate();
    const summary = searchParams.get('summary');

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
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
    return handleDatabaseError(error);
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
      date, // User's local date (YYYY-MM-DD format)
    } = await request.json();

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    // Use provided date or today's date in user's local timezone
    const mealDate = date || getTodayDate();

    // Create a timestamp for the meal that represents the user's local date
    // We'll use the middle of the day to avoid timezone edge cases
    const localDate = parseLocalDate(mealDate);
    localDate.setHours(12, 0, 0, 0); // Set to noon in user's local timezone
    const mealTimestamp = localDate.toISOString();

    console.log('Meal logging with date info:', {
      providedDate: date,
      finalDate: mealDate,
      timestamp: mealTimestamp,
      localDate: localDate.toISOString(),
    });

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
      return ErrorResponses.badRequest('Invalid calories value');
    }
    if (isNaN(validatedData.protein) || validatedData.protein < 0 || validatedData.protein > 1000) {
      return ErrorResponses.badRequest('Invalid protein value');
    }
    if (isNaN(validatedData.carbs) || validatedData.carbs < 0 || validatedData.carbs > 1000) {
      return ErrorResponses.badRequest('Invalid carbs value');
    }
    if (isNaN(validatedData.fats) || validatedData.fats < 0 || validatedData.fats > 1000) {
      return ErrorResponses.badRequest('Invalid fats value');
    }
    if (isNaN(validatedData.fiber) || validatedData.fiber < 0 || validatedData.fiber > 100) {
      return ErrorResponses.badRequest('Invalid fiber value');
    }
    if (isNaN(validatedData.sugar) || validatedData.sugar < 0 || validatedData.sugar > 1000) {
      return ErrorResponses.badRequest('Invalid sugar value');
    }
    if (isNaN(validatedData.sodium) || validatedData.sodium < 0 || validatedData.sodium > 10000) {
      return ErrorResponses.badRequest('Invalid sodium value');
    }
    if (
      isNaN(validatedData.confidenceScore) ||
      validatedData.confidenceScore < 0 ||
      validatedData.confidenceScore > 1
    ) {
      return ErrorResponses.badRequest('Invalid confidence score');
    }

    const newMeal = await sql`
			INSERT INTO meals (
				clerk_id, food_name, portion_size, calories, protein, carbs, fats, 
				fiber, sugar, sodium, confidence_score, meal_type, notes, created_at, updated_at
			) VALUES (
				${clerkId}, ${foodName}, ${portionSize}, ${validatedData.calories}, 
				${validatedData.protein}, ${validatedData.carbs}, ${validatedData.fats},
				${validatedData.fiber}, ${validatedData.sugar}, ${validatedData.sodium}, 
				${validatedData.confidenceScore}, ${mealType}, ${notes}, ${mealTimestamp}, ${mealTimestamp}
			)
			RETURNING *
		`;

    return NextResponse.json({ success: true, data: newMeal[0] });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

// DELETE - Delete a meal
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mealId = searchParams.get('id');
    const clerkId = searchParams.get('clerkId');

    if (!mealId || !clerkId) {
      return ErrorResponses.badRequest('Meal ID and Clerk ID are required');
    }

    const result = await sql`
			DELETE FROM meals 
			WHERE id = ${mealId} AND clerk_id = ${clerkId}
			RETURNING *
		`;

    if (result.length === 0) {
      return ErrorResponses.notFound('Meal not found or unauthorized');
    }

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
