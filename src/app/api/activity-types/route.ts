import { handleDatabaseError } from '@/lib/errorUtils';
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// GET - the activity catalogue (name, icon, MET per intensity) for the Log activity
// modal. Same for every user, so it's cacheable; the app computes calories from it.
export async function GET() {
  try {
    const rows = await sql`
      SELECT slug, name, icon, category,
             met_light::float AS met_light, met_moderate::float AS met_moderate,
             met_vigorous::float AS met_vigorous,
             intensity_labels, intensity_hints, supports_distance,
             typical_speeds::float[] AS typical_speeds, met_from_speed,
             distance_unit_us, distance_unit_metric, pace_style
      FROM activity_types
      WHERE is_active
      ORDER BY sort_order, name
    `;
    return NextResponse.json(
      { success: true, data: rows },
      { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    return handleDatabaseError(error);
  }
}
