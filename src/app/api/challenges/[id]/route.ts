import {
  CHALLENGE_COLUMNS,
  loadChallengeDetail,
  settleChallenges,
  type ChallengeRow,
} from '@/lib/challenges';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { isDateString } from '@/lib/progress';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

const findChallenge = async (id: number, clerkId: string) => {
  const [row] = (await sql.query(
    `SELECT ${CHALLENGE_COLUMNS} FROM challenges WHERE id = $1 AND clerk_id = $2`,
    [id, clerkId]
  )) as ChallengeRow[];
  return row;
};

// GET ?clerkId&today → full detail (days, weeks, stats)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const today = searchParams.get('today');
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    if (!isDateString(today))
      return ErrorResponses.badRequest('today must be YYYY-MM-DD');

    await settleChallenges(clerkId, today);
    const row = await findChallenge(Number(id), clerkId);
    if (!row) return ErrorResponses.notFound('Challenge not found');
    return NextResponse.json({
      success: true,
      data: await loadChallengeDetail(row, today),
    });
  } catch (error) {
    console.error('Challenge GET error:', error);
    return handleDatabaseError(error);
  }
}

// PATCH { clerkId, action: 'end' } → stop an active challenge early
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { clerkId, action } = await request.json();
    if (!clerkId) return ErrorResponses.badRequest('Clerk ID is required');
    if (action !== 'end') return ErrorResponses.badRequest('Unknown action');

    const [row] = await sql`
      UPDATE challenges SET status = 'ended', ended_at = NOW()
      WHERE id = ${Number(id)} AND clerk_id = ${clerkId} AND status = 'active'
      RETURNING id
    `;
    if (!row) return ErrorResponses.notFound('No active challenge to end');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Challenge PATCH error:', error);
    return handleDatabaseError(error);
  }
}
