import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import {
  MAX_RANGE_DAYS,
  diffDays,
  isDateString,
  loadProgress,
} from '@/lib/progress';
import { NextRequest, NextResponse } from 'next/server';

// GET ?clerkId=…&from=YYYY-MM-DD&to=YYYY-MM-DD[&today=YYYY-MM-DD]
// Per-day history (nutrition, weight, activity, what was logged), summaries against
// the user's current targets, streaks, and rule-based insight sentences.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const today = searchParams.get('today'); // user's local date, optional
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    if (!isDateString(from) || !isDateString(to)) {
      return ErrorResponses.badRequest('from and to must be YYYY-MM-DD');
    }
    const span = diffDays(from, to);
    if (span < 0 || span >= MAX_RANGE_DAYS) {
      return ErrorResponses.badRequest(
        `Range must be 1–${MAX_RANGE_DAYS} days`
      );
    }

    return NextResponse.json({
      success: true,
      data: await loadProgress(
        clerkId,
        from,
        to,
        isDateString(today) ? today : to
      ),
    });
  } catch (error) {
    console.error('Progress error:', error);
    return handleDatabaseError(error);
  }
}
