import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export interface MuscleVolume {
  chest: number;
  back: number;
  legs: number;
  shoulders: number;
  arms: number;
  core: number;
}

// Calculate volume from exercises
export function calculateMuscleVolume(exercises: any[]): MuscleVolume {
  const volume: MuscleVolume = {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
    core: 0,
  };

  exercises.forEach(exercise => {
    const exerciseVolume = exercise.sets * exercise.reps;

    exercise.muscle_groups?.forEach((group: string) => {
      if (volume[group as keyof MuscleVolume] !== undefined) {
        volume[group as keyof MuscleVolume] += exerciseVolume;
      }
    });
  });

  return volume;
}

// Store in historical table
export async function recordMuscleBalance(
  clerkId: string,
  programId: number,
  sessionId: number,
  exercises: any[],
  workoutDate: string
) {
  const volume = calculateMuscleVolume(exercises);
  const totalVolume = Object.values(volume).reduce((a, b) => a + b, 0);

  await sql`
    INSERT INTO muscle_balance_history (
      clerk_id, program_id, session_id,
      chest_volume, back_volume, legs_volume,
      shoulders_volume, arms_volume, core_volume,
      total_volume, workout_date
    ) VALUES (
      ${clerkId}, ${programId}, ${sessionId},
      ${volume.chest}, ${volume.back}, ${volume.legs},
      ${volume.shoulders}, ${volume.arms}, ${volume.core},
      ${totalVolume}, ${workoutDate}
    )
    ON CONFLICT (clerk_id, session_id)
    DO UPDATE SET
      chest_volume = ${volume.chest},
      back_volume = ${volume.back},
      legs_volume = ${volume.legs},
      shoulders_volume = ${volume.shoulders},
      arms_volume = ${volume.arms},
      core_volume = ${volume.core},
      total_volume = ${totalVolume}
  `;
}

// Get all-time muscle balance
export async function getAllTimeMuscleBalance(clerkId: string) {
  const result = await sql`
    SELECT
      SUM(chest_volume) as chest,
      SUM(back_volume) as back,
      SUM(legs_volume) as legs,
      SUM(shoulders_volume) as shoulders,
      SUM(arms_volume) as arms,
      SUM(core_volume) as core,
      SUM(total_volume) as total
    FROM muscle_balance_history
    WHERE clerk_id = ${clerkId}
  `;

  const total = Number(result[0].total) || 1;

  return {
    chest: ((Number(result[0].chest) / total) * 100).toFixed(1),
    back: ((Number(result[0].back) / total) * 100).toFixed(1),
    legs: ((Number(result[0].legs) / total) * 100).toFixed(1),
    shoulders: ((Number(result[0].shoulders) / total) * 100).toFixed(1),
    arms: ((Number(result[0].arms) / total) * 100).toFixed(1),
    core: ((Number(result[0].core) / total) * 100).toFixed(1),
  };
}

// Get muscle balance by time period
export async function getMuscleBalanceByPeriod(
  clerkId: string,
  startDate: string,
  endDate: string
) {
  const result = await sql`
    SELECT
      SUM(chest_volume) as chest,
      SUM(back_volume) as back,
      SUM(legs_volume) as legs,
      SUM(shoulders_volume) as shoulders,
      SUM(arms_volume) as arms,
      SUM(core_volume) as core,
      SUM(total_volume) as total
    FROM muscle_balance_history
    WHERE clerk_id = ${clerkId}
      AND workout_date BETWEEN ${startDate} AND ${endDate}
  `;

  const total = Number(result[0].total) || 1;

  return {
    chest: ((Number(result[0].chest) / total) * 100).toFixed(1),
    back: ((Number(result[0].back) / total) * 100).toFixed(1),
    legs: ((Number(result[0].legs) / total) * 100).toFixed(1),
    shoulders: ((Number(result[0].shoulders) / total) * 100).toFixed(1),
    arms: ((Number(result[0].arms) / total) * 100).toFixed(1),
    core: ((Number(result[0].core) / total) * 100).toFixed(1),
  };
}
