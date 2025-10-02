import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';

const sql = neon(process.env.DATABASE_URL!);

export async function PUT(request: NextRequest) {
  try {
    const { clerkId, username } = await request.json();

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    if (!username) {
      return ErrorResponses.badRequest('Username is required');
    }

    // Check if username is already taken by another user
    const existingUsername = await sql`
      SELECT id FROM users 
      WHERE username = ${username.toLowerCase()} 
      AND clerk_id != ${clerkId}
    `;

    if (existingUsername.length > 0) {
      return ErrorResponses.conflict('Username is already taken');
    }

    // Update user's username
    const result = await sql`
      UPDATE users 
      SET username = ${username.toLowerCase()}, updated_at = NOW()
      WHERE clerk_id = ${clerkId}
      RETURNING id, username
    `;

    if (result.length === 0) {
      return ErrorResponses.notFound('User not found');
    }

    return NextResponse.json({
      success: true,
      data: result[0],
      message: 'Username updated successfully',
    });
  } catch (error) {
    console.error('Username update error:', error);
    return handleDatabaseError(error);
  }
}
