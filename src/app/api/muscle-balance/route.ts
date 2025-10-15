import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  getAllTimeMuscleBalance,
  getMuscleBalanceByPeriod,
} from '@/lib/muscleBalanceUtils';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');
    const period = searchParams.get('period') || 'all-time';

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Clerk ID is required' },
        { status: 400 }
      );
    }

    let balanceData;

    switch (period) {
      case 'all-time':
        balanceData = await getAllTimeMuscleBalance(clerkId);
        break;

      case 'month':
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const endOfMonth = new Date();
        endOfMonth.setMonth(endOfMonth.getMonth() + 1, 0);

        balanceData = await getMuscleBalanceByPeriod(
          clerkId,
          startOfMonth.toISOString().split('T')[0],
          endOfMonth.toISOString().split('T')[0]
        );
        break;

      case 'week':
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        balanceData = await getMuscleBalanceByPeriod(
          clerkId,
          startOfWeek.toISOString().split('T')[0],
          endOfWeek.toISOString().split('T')[0]
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid period. Use: all-time, month, or week' },
          { status: 400 }
        );
    }

    // Get detailed volume data for charts
    const volumeData = await sql`
      SELECT
        workout_date,
        chest_volume, back_volume, legs_volume,
        shoulders_volume, arms_volume, core_volume,
        total_volume
      FROM muscle_balance_history
      WHERE clerk_id = ${clerkId}
      ORDER BY workout_date DESC
      LIMIT 30
    `;

    // Get muscle group trends
    const trends = await sql`
      SELECT
        DATE_TRUNC('week', workout_date) as week,
        SUM(chest_volume) as chest,
        SUM(back_volume) as back,
        SUM(legs_volume) as legs,
        SUM(shoulders_volume) as shoulders,
        SUM(arms_volume) as arms,
        SUM(core_volume) as core,
        SUM(total_volume) as total
      FROM muscle_balance_history
      WHERE clerk_id = ${clerkId}
        AND workout_date >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', workout_date)
      ORDER BY week DESC
    `;

    return NextResponse.json({
      success: true,
      data: {
        balance: balanceData,
        volumeHistory: volumeData,
        weeklyTrends: trends,
      },
    });
  } catch (error) {
    console.error('Get muscle balance error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch muscle balance', details: error.message },
      { status: 500 }
    );
  }
}
