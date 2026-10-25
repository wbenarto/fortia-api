import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { EQUIPMENT_KEYS, IMAGE_BASE_URL } from '@/lib/exerciseLibrary';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// GET ?slug=…&equipment=dumbbells,bench&exclude=a,b
// Up to 3 swaps for an exercise: same main muscle and kind of movement, doable with
// the user's equipment. DB only — no AI.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    if (!slug) return ErrorResponses.badRequest('slug is required');
    const equipment = (searchParams.get('equipment') || '')
      .split(',')
      .filter(e => (EQUIPMENT_KEYS as readonly string[]).includes(e));
    const exclude = (searchParams.get('exclude') || '')
      .split(',')
      .filter(Boolean);

    const [source] = await sql`
      SELECT primary_muscles, category FROM exercise_library WHERE slug = ${slug}
    `;
    if (!source) return ErrorResponses.notFound('Exercise not found');

    const rows = (await sql.query(
      `SELECT slug, name, category, mechanic, primary_muscles, equipment, image_paths
       FROM exercise_library
       WHERE slug <> ALL($1::text[])
         AND equipment <@ $2::text[]
         AND category = $3
         AND primary_muscles && $4::text[]
         AND COALESCE(level, '') <> 'expert'
       ORDER BY (primary_muscles[1] = $5) DESC, random()
       LIMIT 3`,
      [
        [slug, ...exclude],
        equipment,
        source.category,
        source.primary_muscles,
        source.primary_muscles[0] || '',
      ]
    )) as { image_paths: string[] }[];

    return NextResponse.json({
      success: true,
      data: rows.map(({ image_paths, ...row }) => ({
        ...row,
        images: image_paths.map(p => IMAGE_BASE_URL + p),
      })),
    });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
