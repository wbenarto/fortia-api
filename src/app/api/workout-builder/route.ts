import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { fetchUserProfile } from '@/lib/userUtils';
import {
  MAX_VARIANTS_PER_KEY,
  cacheKeyFor,
  estimateMinutes,
  generateWorkout,
  hydrateWorkout,
  parseBuilderInputs,
  titleFor,
  type UserWorkoutRow,
  type WorkoutBlock,
} from '@/lib/workoutBuilder';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

interface TemplateRow {
  id: number;
  title: string;
  blocks: WorkoutBlock[];
  use_count: number;
}

// POST - build a workout. Looks in the shared template cache first; only generates
// (Gemini choosing from the exercise library, or the free rules builder) when this
// input combination has no cached variant yet — or Shuffle asks for a new one and
// fewer than MAX_VARIANTS_PER_KEY exist.
//
// Body: { clerkId, duration, focus[], location, equipment[], style,
//         replaceWorkoutId? }  — replaceWorkoutId = Shuffle an existing planned workout
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clerkId = typeof body.clerkId === 'string' ? body.clerkId : '';
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');

    const inputs = parseBuilderInputs(body);
    if (typeof inputs === 'string') return ErrorResponses.badRequest(inputs);

    const replaceId = body.replaceWorkoutId
      ? Number(body.replaceWorkoutId)
      : null;
    let replacing: UserWorkoutRow | null = null;
    if (replaceId) {
      const [row] = (await sql`
        SELECT * FROM user_workouts
        WHERE id = ${replaceId} AND clerk_id = ${clerkId} AND status = 'planned'
      `) as UserWorkoutRow[];
      if (!row) return ErrorResponses.notFound('Workout not found');
      replacing = row;
    }

    const cacheKey = cacheKeyFor(inputs);
    const existing = (await sql`
      SELECT id, title, blocks, use_count FROM workout_templates
      WHERE cache_key = ${cacheKey}
      ORDER BY id
    `) as TemplateRow[];

    let template: TemplateRow;
    const wantsNew = replacing
      ? existing.length < MAX_VARIANTS_PER_KEY
      : existing.length === 0;

    if (wantsNew) {
      const profile = await fetchUserProfile(clerkId);
      const { blocks, source } = await generateWorkout(
        clerkId,
        inputs,
        profile
      );
      [template] = (await sql`
        INSERT INTO workout_templates (cache_key, inputs, title, blocks, est_minutes, source)
        VALUES (${cacheKey}, ${JSON.stringify(inputs)}, ${titleFor(inputs)},
                ${JSON.stringify(blocks)}, ${estimateMinutes(blocks)}, ${source})
        RETURNING id, title, blocks, use_count
      `) as TemplateRow[];
    } else {
      // Rotate: least-used variant, skipping the one being shuffled away from
      const pool = existing.filter(t => t.id !== replacing?.template_id);
      template = (pool.length ? pool : existing).reduce((a, b) =>
        b.use_count < a.use_count ? b : a
      );
    }

    await sql`UPDATE workout_templates SET use_count = use_count + 1 WHERE id = ${template.id}`;

    const [workout] = (
      replacing
        ? await sql`
          UPDATE user_workouts
          SET template_id = ${template.id}, title = ${template.title},
              blocks = ${JSON.stringify(template.blocks)}, progress = '{}', updated_at = NOW()
          WHERE id = ${replacing.id}
          RETURNING *
        `
        : await sql`
          INSERT INTO user_workouts (clerk_id, template_id, title, inputs, blocks)
          VALUES (${clerkId}, ${template.id}, ${template.title}, ${JSON.stringify(inputs)},
                  ${JSON.stringify(template.blocks)})
          RETURNING *
        `
    ) as UserWorkoutRow[];

    return NextResponse.json({
      success: true,
      data: await hydrateWorkout(workout),
    });
  } catch (error) {
    console.error('Workout builder error:', error);
    return handleDatabaseError(error);
  }
}
