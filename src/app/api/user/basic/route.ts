import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Create basic user record (same as OAuth flow)
 * This creates a minimal user record with just essential fields
 * Onboarding data will be added later via the main /api/user POST endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const {
      clerkId,
      firstName,
      lastName,
      email,
    } = await request.json();

    if (!clerkId) {
      return ErrorResponses.badRequest('Clerk ID is required');
    }

    if (!firstName || !lastName || !email) {
      return ErrorResponses.badRequest('First name, last name, and email are required');
    }

    // First check if user already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email} OR clerk_id = ${clerkId}
    `;

    if (existingUser.length > 0) {
      return NextResponse.json(
        {
          success: true,
          data: existingUser[0],
          message: 'User already exists',
        },
        { status: 200 }
      );
    }

    // Create basic user record (same as createUserInDatabase function)
    const result = await sql`
      INSERT INTO users (
        first_name,
        last_name,
        email,
        clerk_id,
        created_at,
        updated_at
      ) VALUES (
        ${firstName},
        ${lastName},
        ${email},
        ${clerkId},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    return NextResponse.json(
      {
        success: true,
        data: result[0],
        message: 'Basic user created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Basic user creation error:', error);

    // Check for specific database errors
    if (error instanceof Error) {
      if (error.message.includes('duplicate key')) {
        // If we still get a duplicate key error, try to fetch the existing user
        try {
          const { clerkId, email } = await request.json();
          const existingUser = await sql`
            SELECT id FROM users WHERE email = ${email} OR clerk_id = ${clerkId}
          `;

          if (existingUser.length > 0) {
            return NextResponse.json(
              {
                success: true,
                data: existingUser[0],
                message: 'User already exists',
              },
              { status: 200 }
            );
          }
        } catch (fetchError) {
          console.error('Error fetching existing user:', fetchError);
        }
      }
    }

    return handleDatabaseError(error);
  }
}
