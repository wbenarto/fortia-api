import {
  CHALLENGE_COLUMNS,
  MAX_CHALLENGE_DAYS,
  loadChallengeDetail,
  settleChallenges,
  type ChallengeRow,
} from '@/lib/challenges';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import {
  DIET_TYPES,
  recalculateNutritionTargets,
  type DietType,
} from '@/lib/nutritionTargets';
import { diffDays, isDateString } from '@/lib/progress';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// GET ?clerkId&today=YYYY-MM-DD → { active: detail | null, past: summaries[] }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const today = searchParams.get('today');
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    if (!isDateString(today))
      return ErrorResponses.badRequest('today must be YYYY-MM-DD');

    await settleChallenges(clerkId, today);
    const rows = (await sql.query(
      `SELECT ${CHALLENGE_COLUMNS} FROM challenges WHERE clerk_id = $1 ORDER BY start_date DESC LIMIT 20`,
      [clerkId]
    )) as ChallengeRow[];

    const activeRow = rows.find(r => r.status === 'active');
    const past = await Promise.all(
      rows
        .filter(r => r.status !== 'active')
        .slice(0, 10)
        .map(async r => {
          const { stats } = await loadChallengeDetail(r, today);
          return { challenge: r, stats };
        })
    );

    return NextResponse.json({
      success: true,
      data: {
        active: activeRow ? await loadChallengeDetail(activeRow, today) : null,
        past,
      },
    });
  } catch (error) {
    console.error('Challenges GET error:', error);
    return handleDatabaseError(error);
  }
}

// POST { clerkId, startDate, endDate, dietType, workoutsPerWeek, today }
// Switches the user's real diet (so the whole app uses the new macros), then stores
// the challenge with a copy of the resulting targets.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clerkId, startDate, endDate, dietType, today } = body;
    const workoutsPerWeek = Number(body.workoutsPerWeek);

    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    if (
      !isDateString(today) ||
      !isDateString(startDate) ||
      !isDateString(endDate)
    ) {
      return ErrorResponses.badRequest('Dates must be YYYY-MM-DD');
    }
    if (startDate < today)
      return ErrorResponses.badRequest('The challenge can’t start in the past');
    const length = diffDays(startDate, endDate) + 1;
    if (length < 7 || length > MAX_CHALLENGE_DAYS) {
      return ErrorResponses.badRequest(
        `A challenge runs 7–${MAX_CHALLENGE_DAYS} days`
      );
    }
    if (!DIET_TYPES.includes(dietType as DietType)) {
      return ErrorResponses.badRequest('Choose a diet type');
    }
    if (
      !Number.isInteger(workoutsPerWeek) ||
      workoutsPerWeek < 1 ||
      workoutsPerWeek > 7
    ) {
      return ErrorResponses.badRequest('Workouts per week must be 1–7');
    }

    await sql`
      UPDATE challenges SET status = 'completed', ended_at = NOW()
      WHERE clerk_id = ${clerkId} AND status = 'active' AND end_date < ${today}::date
    `;
    const [active] = await sql`
      SELECT id FROM challenges WHERE clerk_id = ${clerkId} AND status = 'active'
    `;
    if (active)
      return ErrorResponses.conflict('You already have an active challenge');

    const [user] = await sql`SELECT * FROM users WHERE clerk_id = ${clerkId}`;
    if (!user) return ErrorResponses.notFound('User not found');

    // Same recalculation the diet picker uses (PUT /api/user with dietType)
    const recalculated = recalculateNutritionTargets(user, { dietType });
    const [updated] = await sql`
      UPDATE users SET
        diet_type = ${dietType},
        daily_calories = COALESCE(${recalculated?.dailyCalories ?? null}, daily_calories),
        daily_protein = COALESCE(${recalculated?.dailyProtein ?? null}, daily_protein),
        daily_carbs = COALESCE(${recalculated?.dailyCarbs ?? null}, daily_carbs),
        daily_fats = COALESCE(${recalculated?.dailyFats ?? null}, daily_fats),
        bmr = COALESCE(${recalculated?.bmr ?? null}, bmr),
        tdee = COALESCE(${recalculated?.tdee ?? null}, tdee),
        updated_at = NOW()
      WHERE clerk_id = ${clerkId}
      RETURNING daily_calories, daily_protein, daily_carbs, daily_fats
    `;
    const targets = {
      calories: Number(updated.daily_calories) || 0,
      protein: Number(updated.daily_protein) || 0,
      carbs: Number(updated.daily_carbs) || 0,
      fats: Number(updated.daily_fats) || 0,
    };
    if (!targets.calories) {
      return ErrorResponses.badRequest(
        'Set up your profile so we can work out your targets first'
      );
    }

    const [row] = (await sql.query(
      `INSERT INTO challenges (clerk_id, start_date, end_date, diet_type, workouts_per_week, targets)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CHALLENGE_COLUMNS}`,
      [
        clerkId,
        startDate,
        endDate,
        dietType,
        workoutsPerWeek,
        JSON.stringify(targets),
      ]
    )) as ChallengeRow[];

    return NextResponse.json({
      success: true,
      data: await loadChallengeDetail(row, today),
    });
  } catch (error) {
    console.error('Challenges POST error:', error);
    return handleDatabaseError(error);
  }
}
