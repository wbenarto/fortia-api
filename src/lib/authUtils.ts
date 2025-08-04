import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { ErrorResponses, handleDatabaseError } from './errorUtils';
import { hasCompletedOnboarding } from './userUtils';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Extract Clerk ID from request
 * Supports both query parameters and request body
 */
export function extractClerkId(request: NextRequest): string | null {
  // Try to get from query parameters first
  const { searchParams } = new URL(request.url);
  const clerkIdFromQuery = searchParams.get('clerkId');

  if (clerkIdFromQuery) {
    return clerkIdFromQuery;
  }

  // If not in query, we'll need to parse the body
  // Note: This is a simplified approach - in production you might want to use Clerk's server SDK
  return null;
}

/**
 * Validate Clerk ID format
 * Basic validation - in production you should verify with Clerk's server SDK
 */
export function validateClerkId(clerkId: string): boolean {
  if (!clerkId || typeof clerkId !== 'string') {
    return false;
  }

  // Basic format validation for Clerk user IDs
  // Clerk user IDs typically start with 'user_' and are alphanumeric with underscores
  const clerkIdPattern = /^user_[a-zA-Z0-9_]+$/;
  return clerkIdPattern.test(clerkId);
}

/**
 * Check if user exists in database and has completed onboarding
 * This matches the flow in the main app's auth.ts
 */
export async function checkUserAuthStatus(clerkId: string): Promise<{
  success: boolean;
  code: 'success' | 'needs_onboarding' | 'user_not_found' | 'error';
  message: string;
  needsOnboarding: boolean;
  data?: any;
}> {
  try {
    // Check if user exists in database
    const userCheckResponse = await sql`
			SELECT * FROM users 
			WHERE clerk_id = ${clerkId}
			ORDER BY created_at DESC 
			LIMIT 1
		`;

    if (userCheckResponse.length > 0) {
      const userData = userCheckResponse[0];

      // Check if user has completed onboarding (same logic as main app)
      if (userData.weight && userData.height && userData.fitness_goal) {
        // User has completed onboarding
        return {
          success: true,
          code: 'success',
          message: 'You have successfully authenticated',
          needsOnboarding: false,
          data: userData,
        };
      } else {
        // User exists but hasn't completed onboarding
        return {
          success: true,
          code: 'needs_onboarding',
          message: 'Please complete your profile setup',
          needsOnboarding: true,
          data: userData,
        };
      }
    } else {
      // User doesn't exist in database
      return {
        success: true,
        code: 'needs_onboarding',
        message: 'Please complete your profile setup',
        needsOnboarding: true,
      };
    }
  } catch (error) {
    console.error('User check error:', error);
    return {
      success: false,
      code: 'error',
      message: 'Failed to check user status',
      needsOnboarding: false,
    };
  }
}

/**
 * Create user in database (matches main app's user creation flow)
 */
export async function createUserInDatabase(userData: {
  clerkId: string;
  firstName: string;
  lastName: string;
  email: string;
}): Promise<{
  success: boolean;
  code: 'success' | 'user_creation_failed' | 'user_already_exists';
  message: string;
  data?: any;
}> {
  try {
    // First check if user already exists
    const existingUser = await sql`
			SELECT id FROM users WHERE email = ${userData.email} OR clerk_id = ${userData.clerkId}
		`;

    if (existingUser.length > 0) {
      return {
        success: true,
        code: 'user_already_exists',
        message: 'User already exists',
        data: existingUser[0],
      };
    }

    // Create new user
    const result = await sql`
			INSERT INTO users (
				first_name,
				last_name,
				email,
				clerk_id,
				created_at,
				updated_at
			) VALUES (
				${userData.firstName},
				${userData.lastName},
				${userData.email},
				${userData.clerkId},
				NOW(),
				NOW()
			)
			RETURNING *
		`;

    return {
      success: true,
      code: 'success',
      message: 'User created successfully',
      data: result[0],
    };
  } catch (error) {
    console.error('User creation error:', error);

    // Check for specific database errors
    if (error instanceof Error) {
      if (error.message.includes('duplicate key')) {
        // If we still get a duplicate key error, try to fetch the existing user
        try {
          const existingUser = await sql`
						SELECT id FROM users WHERE email = ${userData.email} OR clerk_id = ${userData.clerkId}
					`;

          if (existingUser.length > 0) {
            return {
              success: true,
              code: 'user_already_exists',
              message: 'User already exists',
              data: existingUser[0],
            };
          }
        } catch (fetchError) {
          console.error('Error fetching existing user:', fetchError);
        }
      }
    }

    return {
      success: false,
      code: 'user_creation_failed',
      message: 'Failed to create user profile',
    };
  }
}

/**
 * Middleware to validate Clerk ID in requests
 */
export function validateClerkIdMiddleware(request: NextRequest): NextResponse | null {
  const clerkId = extractClerkId(request);

  if (!clerkId) {
    return ErrorResponses.badRequest('Clerk ID is required');
  }

  if (!validateClerkId(clerkId)) {
    return ErrorResponses.badRequest('Invalid Clerk ID format');
  }

  return null; // Continue with request
}

/**
 * Extract and validate Clerk ID from request body
 */
export async function extractClerkIdFromBody(
  request: NextRequest
): Promise<{ clerkId: string | null; error: NextResponse | null }> {
  try {
    const body = await request.json();
    const clerkId = body.clerkId;

    if (!clerkId) {
      return { clerkId: null, error: ErrorResponses.badRequest('Clerk ID is required') };
    }

    if (!validateClerkId(clerkId)) {
      return { clerkId: null, error: ErrorResponses.badRequest('Invalid Clerk ID format') };
    }

    return { clerkId, error: null };
  } catch (error) {
    return { clerkId: null, error: ErrorResponses.badRequest('Invalid request body') };
  }
}

/**
 * Create a middleware function for API routes that require authentication
 */
export function requireAuth(
  handler: (request: NextRequest, clerkId: string) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Check query parameters first
    let clerkId = extractClerkId(request);

    // If not in query, try to get from body
    if (!clerkId) {
      const bodyResult = await extractClerkIdFromBody(request);
      if (bodyResult.error) {
        return bodyResult.error;
      }
      clerkId = bodyResult.clerkId;
    }

    if (!clerkId) {
      return ErrorResponses.unauthorized('Authentication required');
    }

    return handler(request, clerkId);
  };
}

/**
 * Log authentication attempts for debugging
 */
export function logAuthAttempt(clerkId: string, success: boolean, endpoint: string): void {
  console.log(`🔐 Auth attempt: ${success ? '✅' : '❌'} [REDACTED] -> ${endpoint}`);
}
