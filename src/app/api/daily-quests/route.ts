import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { getTodayDate, getDayBounds } from '@/lib/dateUtils';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';

const sql = neon(process.env.DATABASE_URL!);

// GET - Get today's quest status and current streak
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const date = searchParams.get('date') || getTodayDate();

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    // Get or create today's quest record
    let questRecord = await sql`
      SELECT * FROM daily_quests 
      WHERE clerk_id = ${clerkId} AND date = ${date}
    `;

    // If no record exists for today, create one
    if (questRecord.length === 0) {
      // Get the previous day's streak to determine current streak
      const previousDay = new Date(date);
      previousDay.setDate(previousDay.getDate() - 1);
      const previousDate = previousDay.toISOString().split('T')[0];

      const previousQuest = await sql`
        SELECT day_completed, streak_day FROM daily_quests 
        WHERE clerk_id = ${clerkId} AND date = ${previousDate}
      `;

      const currentStreak = previousQuest.length > 0 && previousQuest[0].day_completed 
        ? previousQuest[0].streak_day + 1 
        : 1;

      await sql`
        INSERT INTO daily_quests (clerk_id, date, streak_day)
        VALUES (${clerkId}, ${date}, ${currentStreak})
      `;

      // Fetch the newly created record
      questRecord = await sql`
        SELECT * FROM daily_quests 
        WHERE clerk_id = ${clerkId} AND date = ${date}
      `;
    }

    return NextResponse.json({
      success: true,
      data: questRecord[0] || {
        clerk_id: clerkId,
        date: date,
        weight_logged: false,
        meal_logged: false,
        exercise_logged: false,
        day_completed: false,
        streak_day: 1
      }
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

// POST - Update quest completion status
export async function POST(request: NextRequest) {
  try {
    const { clerkId, questType, date } = await request.json();

    if (!clerkId || !questType) {
      return ErrorResponses.badRequest('Clerk ID and quest type are required');
    }

    const questDate = date || getTodayDate();

    // Validate quest type
    const validQuestTypes = ['weight_logged', 'meal_logged', 'exercise_logged'];
    if (!validQuestTypes.includes(questType)) {
      return ErrorResponses.badRequest('Invalid quest type');
    }

    // Get or create today's quest record
    let questRecord = await sql`
      SELECT * FROM daily_quests 
      WHERE clerk_id = ${clerkId} AND date = ${questDate}
    `;

    if (questRecord.length === 0) {
      // Create new quest record
      await sql`
        INSERT INTO daily_quests (clerk_id, date, ${questType})
        VALUES (${clerkId}, ${questDate}, true)
      `;
    } else {
      // Update existing quest record
      await sql`
        UPDATE daily_quests 
        SET ${questType} = true, updated_at = NOW()
        WHERE clerk_id = ${clerkId} AND date = ${questDate}
      `;
    }

    // Check if all quests are completed and update day_completed
    const updatedRecord = await sql`
      SELECT * FROM daily_quests 
      WHERE clerk_id = ${clerkId} AND date = ${questDate}
    `;

    if (updatedRecord.length > 0) {
      const quest = updatedRecord[0];
      const allCompleted = quest.weight_logged && quest.meal_logged && quest.exercise_logged;
      
      if (allCompleted && !quest.day_completed) {
        await sql`
          UPDATE daily_quests 
          SET day_completed = true, updated_at = NOW()
          WHERE clerk_id = ${clerkId} AND date = ${questDate}
        `;
      }
    }

    return NextResponse.json({
      success: true,
      message: `${questType} marked as completed`,
      data: updatedRecord[0]
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

// PUT - Mark day as completed and increment streak (for manual completion)
export async function PUT(request: NextRequest) {
  try {
    const { clerkId, date } = await request.json();

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    const questDate = date || getTodayDate();

    // Update the quest record to mark as completed
    await sql`
      UPDATE daily_quests 
      SET day_completed = true, updated_at = NOW()
      WHERE clerk_id = ${clerkId} AND date = ${questDate}
    `;

    return NextResponse.json({
      success: true,
      message: 'Day marked as completed'
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
