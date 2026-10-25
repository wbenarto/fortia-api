import { getTodayDate, parseLocalDate } from '@/lib/dateUtils';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export interface ActivityRow {
  id: number;
  activity_description: string;
  estimated_calories: number | null;
  date: string;
  created_at: string;
}

// Insert one activity (feeds calories out) and tick the day's exercise quest.
// Shared by POST /api/activities and workout-builder completion.
export async function insertActivity({
  clerkId,
  description,
  calories,
  date,
}: {
  clerkId: string;
  description: string;
  calories?: number | null;
  date?: string | null;
}): Promise<ActivityRow> {
  // Use provided date or fallback to today's date
  const activityDate = date || getTodayDate();

  // Create a timezone-aware timestamp for the activity (like meals)
  const localDate = parseLocalDate(activityDate);
  localDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone edge cases
  const activityTimestamp = localDate.toISOString();

  const result = await sql`
    INSERT INTO activities (clerk_id, activity_description, estimated_calories, date, created_at)
    VALUES (${clerkId}, ${description}, ${calories || null}, ${activityDate}, ${activityTimestamp})
    RETURNING id, activity_description, estimated_calories, date, created_at
  `;

  // Update daily quest for exercise logging ONLY for actual exercises (not BMR or Steps)
  const isActualExercise =
    !description.toLowerCase().includes('basal metabolic rate') &&
    !description.toLowerCase().includes('daily steps');

  if (isActualExercise) {
    try {
      await sql`
        INSERT INTO daily_quests (clerk_id, date, exercise_logged)
        VALUES (${clerkId}, ${activityDate}, true)
        ON CONFLICT (clerk_id, date)
        DO UPDATE SET exercise_logged = true, updated_at = NOW()
      `;

      // Check if all quests are completed and update day_completed
      const questStatus = await sql`
        SELECT weight_logged, meal_logged, exercise_logged, day_completed
        FROM daily_quests
        WHERE clerk_id = ${clerkId} AND date = ${activityDate}
      `;

      if (questStatus.length > 0) {
        const quest = questStatus[0];
        const allCompleted =
          quest.weight_logged && quest.meal_logged && quest.exercise_logged;

        if (allCompleted && !quest.day_completed) {
          await sql`
            UPDATE daily_quests
            SET day_completed = true, updated_at = NOW()
            WHERE clerk_id = ${clerkId} AND date = ${activityDate}
          `;
        }
      }
    } catch (questError) {
      console.error('Failed to update daily quest:', questError);
      // Don't fail the activity logging if quest update fails
    }
  }

  return result[0] as ActivityRow;
}
