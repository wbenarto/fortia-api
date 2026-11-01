import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Favorite meals (Log a meal → Favorites). The key matches the app's favoriteKey()
// and the Recent list's dedupe: food name, portion and ingredients.
const mealKey = (
  foodName: string,
  portion: string | null,
  ingredients: unknown
) =>
  `${foodName.trim().toLowerCase()}|${(portion || '').trim().toLowerCase()}|${JSON.stringify(
    Array.isArray(ingredients) ? ingredients : []
  )}`;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// GET ?clerkId → newest first
export async function GET(request: NextRequest) {
  try {
    const clerkId = new URL(request.url).searchParams.get('clerkId');
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    const rows = await sql`
      SELECT * FROM favorite_meals WHERE clerk_id = ${clerkId}
      ORDER BY created_at DESC LIMIT 100
    `;
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Favorite meals GET error:', error);
    return handleDatabaseError(error);
  }
}

// POST { clerkId, food_name, portion_size, calories, protein, carbs, fats, fiber,
//        sugar, sodium, confidence_score, ingredients } → saved (idempotent)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clerkId = body.clerkId;
    const foodName =
      typeof body.food_name === 'string' ? body.food_name.trim() : '';
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    if (!foodName) return ErrorResponses.badRequest('Meal name is required');
    const portion =
      typeof body.portion_size === 'string' ? body.portion_size : null;
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
    const key = mealKey(foodName, portion, ingredients);

    const [row] = await sql`
      INSERT INTO favorite_meals (clerk_id, meal_key, food_name, portion_size, calories, protein,
        carbs, fats, fiber, sugar, sodium, confidence_score, ingredients)
      VALUES (${clerkId}, ${key}, ${foodName}, ${portion}, ${Math.round(num(body.calories))},
        ${num(body.protein)}, ${num(body.carbs)}, ${num(body.fats)}, ${num(body.fiber)},
        ${num(body.sugar)}, ${Math.round(num(body.sodium))},
        ${Math.min(1, Math.max(0, num(body.confidence_score) || 0.5))}, ${JSON.stringify(ingredients)})
      ON CONFLICT (clerk_id, meal_key) DO UPDATE SET food_name = favorite_meals.food_name -- keep the first save; returns the row
      RETURNING *
    `;
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error('Favorite meals POST error:', error);
    return handleDatabaseError(error);
  }
}

// DELETE ?clerkId&key=<meal_key>
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const key = searchParams.get('key');
    if (!clerkId || !key)
      return ErrorResponses.badRequest('Clerk ID and key are required');
    await sql`DELETE FROM favorite_meals WHERE clerk_id = ${clerkId} AND meal_key = ${key}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Favorite meals DELETE error:', error);
    return handleDatabaseError(error);
  }
}
