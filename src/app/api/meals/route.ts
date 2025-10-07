import { getDayBounds, getTodayDate, parseLocalDate } from '@/lib/dateUtils';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

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
      imageUrl, // Cloudinary URL for meal photo
      date, // User's local date (YYYY-MM-DD format)
      ingredients, // Array of ingredients for recipe-based meals
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

    // Validate ingredients format
    let validatedIngredients = [];
    if (ingredients && Array.isArray(ingredients)) {
      validatedIngredients = ingredients.filter(
        ingredient =>
          Array.isArray(ingredient) &&
          ingredient.length === 2 &&
          typeof ingredient[0] === 'string' &&
          typeof ingredient[1] === 'string' &&
          ingredient[0].trim() !== '' &&
          ingredient[1].trim() !== ''
      );
    }

    // Validate numeric ranges
    if (
      isNaN(validatedData.calories) ||
      validatedData.calories < 0 ||
      validatedData.calories > 10000
    ) {
      return ErrorResponses.badRequest('Invalid calories value');
    }
    if (
      isNaN(validatedData.protein) ||
      validatedData.protein < 0 ||
      validatedData.protein > 1000
    ) {
      return ErrorResponses.badRequest('Invalid protein value');
    }
    if (
      isNaN(validatedData.carbs) ||
      validatedData.carbs < 0 ||
      validatedData.carbs > 1000
    ) {
      return ErrorResponses.badRequest('Invalid carbs value');
    }
    if (
      isNaN(validatedData.fats) ||
      validatedData.fats < 0 ||
      validatedData.fats > 1000
    ) {
      return ErrorResponses.badRequest('Invalid fats value');
    }
    if (
      isNaN(validatedData.fiber) ||
      validatedData.fiber < 0 ||
      validatedData.fiber > 100
    ) {
      return ErrorResponses.badRequest('Invalid fiber value');
    }
    if (
      isNaN(validatedData.sugar) ||
      validatedData.sugar < 0 ||
      validatedData.sugar > 1000
    ) {
      return ErrorResponses.badRequest('Invalid sugar value');
    }
    if (
      isNaN(validatedData.sodium) ||
      validatedData.sodium < 0 ||
      validatedData.sodium > 10000
    ) {
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
				fiber, sugar, sodium, confidence_score, meal_type, notes, image_url, ingredients, created_at, updated_at
			) VALUES (
				${clerkId}, ${foodName}, ${portionSize}, ${validatedData.calories},
				${validatedData.protein}, ${validatedData.carbs}, ${validatedData.fats},
				${validatedData.fiber}, ${validatedData.sugar}, ${validatedData.sodium},
				${validatedData.confidenceScore}, ${mealType}, ${notes}, ${imageUrl}, ${JSON.stringify(validatedIngredients)}, ${mealTimestamp}, ${mealTimestamp}
			)
			RETURNING *
		`;

    // Update daily quest for meal logging (always update when meal is logged)
    try {
      await sql`
        INSERT INTO daily_quests (clerk_id, date, meal_logged)
        VALUES (${clerkId}, ${mealDate}, true)
        ON CONFLICT (clerk_id, date)
        DO UPDATE SET meal_logged = true, updated_at = NOW()
      `;

      // Check if all quests are completed and update day_completed
      const questStatus = await sql`
        SELECT weight_logged, meal_logged, exercise_logged, day_completed
        FROM daily_quests
        WHERE clerk_id = ${clerkId} AND date = ${mealDate}
      `;

      if (questStatus.length > 0) {
        const quest = questStatus[0];
        const allCompleted =
          quest.weight_logged && quest.meal_logged && quest.exercise_logged;

        if (allCompleted && !quest.day_completed) {
          await sql`
            UPDATE daily_quests
            SET day_completed = true, updated_at = NOW()
            WHERE clerk_id = ${clerkId} AND date = ${mealDate}
          `;
        }
      }
    } catch (questError) {
      console.error('Failed to update daily quest:', questError);
      // Don't fail the meal logging if quest update fails
    }

    return NextResponse.json({ success: true, data: newMeal[0] });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

// PUT - Update an existing meal
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mealId = searchParams.get('id');

    if (!mealId) {
      return ErrorResponses.badRequest('Meal ID is required');
    }

    const {
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
      imageUrl,
    } = await request.json();

    const updatedMeal = await sql`
      UPDATE meals SET
        food_name = COALESCE(${foodName}, food_name),
        portion_size = COALESCE(${portionSize}, portion_size),
        calories = COALESCE(${calories}, calories),
        protein = COALESCE(${protein}, protein),
        carbs = COALESCE(${carbs}, carbs),
        fats = COALESCE(${fats}, fats),
        fiber = COALESCE(${fiber}, fiber),
        sugar = COALESCE(${sugar}, sugar),
        sodium = COALESCE(${sodium}, sodium),
        confidence_score = COALESCE(${confidenceScore}, confidence_score),
        meal_type = COALESCE(${mealType}, meal_type),
        notes = COALESCE(${notes}, notes),
        image_url = COALESCE(${imageUrl}, image_url),
        updated_at = NOW()
      WHERE id = ${mealId}
      RETURNING *
    `;

    if (updatedMeal.length === 0) {
      return ErrorResponses.notFound('Meal not found');
    }

    return NextResponse.json({ success: true, data: updatedMeal[0] });
  } catch (error) {
    console.error('Update meal error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update meal',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete a meal
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mealId = searchParams.get('id');

    if (!mealId) {
      return ErrorResponses.badRequest('Meal ID is required');
    }

    const deletedMeal = await sql`
      DELETE FROM meals WHERE id = ${mealId} RETURNING *
    `;

    if (deletedMeal.length === 0) {
      return ErrorResponses.notFound('Meal not found');
    }

    return NextResponse.json({ success: true, data: deletedMeal[0] });
  } catch (error) {
    console.error('Delete meal error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete meal',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Debug endpoint to see all meals for a user
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    // Get user info
    const userInfo = await sql`
      SELECT id, first_name, last_name, email, clerk_id, created_at
      FROM users
      WHERE clerk_id = ${clerkId}
    `;

    // Get all meals for debugging
    const allMeals = await sql`
      SELECT id, food_name, created_at, DATE(created_at) as date_only
      FROM meals
      WHERE clerk_id = ${clerkId}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return NextResponse.json({
      success: true,
      user: userInfo.length > 0 ? userInfo[0] : null,
      meals: allMeals,
      debug: {
        today: new Date().toISOString().split('T')[0],
        now: new Date().toISOString(),
        userExists: userInfo.length > 0,
        mealCount: allMeals.length,
      },
    });
  } catch (error) {
    console.error('Debug meals error:', error);
    return NextResponse.json({ error: 'Debug failed' }, { status: 500 });
  }
}
