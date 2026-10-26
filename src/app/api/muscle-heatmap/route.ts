import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import {
  HEATMAP_RANGES,
  loadMuscleHeatmap,
  type HeatmapRange,
} from '@/lib/muscleHeatmap';
import { isDateString } from '@/lib/progress';
import { NextRequest, NextResponse } from 'next/server';

// GET ?clerkId=…&range=week|month|all&date=YYYY-MM-DD (the user's today)
// Sets per muscle over the range, with a 0–4 heat level for the body map.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const range = searchParams.get('range') as HeatmapRange | null;
    const date = searchParams.get('date');
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    if (!range || !HEATMAP_RANGES.includes(range)) {
      return ErrorResponses.badRequest('range must be week, month or all');
    }
    if (!isDateString(date)) {
      return ErrorResponses.badRequest('date must be YYYY-MM-DD');
    }

    return NextResponse.json({
      success: true,
      data: await loadMuscleHeatmap(clerkId, range, date),
    });
  } catch (error) {
    console.error('Muscle heatmap error:', error);
    return handleDatabaseError(error);
  }
}
