import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { IMAGE_BASE_URL } from '@/lib/exerciseLibrary';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

const MAX_LIMIT = 40;

// GET ?q=bench&muscle=chest&limit=30
// Search the exercise library (free-exercise-db, public domain) by name or muscle for
// the app's Search tab. DB only — no AI. Names starting with the query rank first,
// then easier exercises.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim().slice(0, 60);
    const muscle = (searchParams.get('muscle') || '').trim().toLowerCase().slice(0, 30);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(searchParams.get('limit')) || 30)
    );
    if (!q && !muscle) return ErrorResponses.badRequest('q or muscle is required');

    // Escape LIKE wildcards so "%" or "_" in the query match literally
    const term = q.replace(/[\\%_]/g, m => `\\${m}`);

    const rows = (await sql.query(
      `SELECT slug, name, category, level, mechanic, primary_muscles, secondary_muscles,
              equipment, instructions, image_paths
       FROM exercise_library
       WHERE ($1 = '' OR name ILIKE '%' || $1 || '%'
              OR EXISTS (SELECT 1 FROM unnest(primary_muscles) m WHERE m ILIKE $1 || '%'))
         AND ($2 = '' OR $2 = ANY(primary_muscles))
       ORDER BY
         ($1 <> '' AND name ILIKE $1 || '%') DESC,
         ($1 <> '' AND name ILIKE '%' || $1 || '%') DESC,
         CASE level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END,
         name
       LIMIT $3`,
      [term, muscle, limit]
    )) as { image_paths: string[] }[];

    return NextResponse.json({
      success: true,
      data: rows.map(({ image_paths, ...row }) => ({
        ...row,
        images: (image_paths || []).map(p => IMAGE_BASE_URL + p),
      })),
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
