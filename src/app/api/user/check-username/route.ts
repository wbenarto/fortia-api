import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return ErrorResponses.badRequest('Username is required');
    }

    // Basic validation
    if (username.length < 4) {
      return NextResponse.json({
        success: true,
        available: false,
        message: 'Username must be at least 4 characters long'
      });
    }

    if (username.length > 30) {
      return NextResponse.json({
        success: true,
        available: false,
        message: 'Username must be less than 30 characters'
      });
    }

    // Check for valid characters (letters, numbers, underscores only)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json({
        success: true,
        available: false,
        message: 'Username can only contain letters, numbers, and underscores'
      });
    }

    // Check if username is already taken
    const existingUser = await sql`
      SELECT id FROM users WHERE username = ${username.toLowerCase()}
    `;

    const isAvailable = existingUser.length === 0;

    return NextResponse.json({
      success: true,
      available: isAvailable,
      message: isAvailable ? 'Username is available' : 'Username is already taken'
    });

  } catch (error) {
    console.error('Username check error:', error);
    return handleDatabaseError(error);
  }
}
