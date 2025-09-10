import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { ErrorResponses } from './errorUtils';

const sql = neon(process.env.DATABASE_URL!);

// Types for OAuth responses
interface UserData {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  clerk_id: string;
  weight?: number;
  height?: number;
  fitness_goal?: string;
  created_at: string;
  updated_at: string;
}

interface OAuthResult {
  success: boolean;
  code?: 'success' | 'needs_onboarding' | 'user_creation_failed' | 'user_canceled' | 'error';
  message: string;
  needsOnboarding?: boolean;
  data?: UserData;
}

interface OAuthSignUp {
  createdUserId: string;
  firstName?: string;
  lastName?: string;
  emailAddress: string;
}

interface OAuthSignIn {
  userId: string;
  firstName?: string;
  lastName?: string;
  emailAddress: string;
}

interface OAuthFlowResult {
  createdSessionId?: string;
  signIn?: OAuthSignIn;
  signUp?: OAuthSignUp;
  setActive?: (params: { session: string }) => Promise<void>;
}

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
  data?: UserData;
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
      const userData = userCheckResponse[0] as UserData;

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
      // User doesn't exist in database - FIXED: return 'user_not_found' instead of 'needs_onboarding'
      return {
        success: true,
        code: 'user_not_found',
        message: 'User not found',
        needsOnboarding: false,
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
  data?: UserData;
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
        data: existingUser[0] as UserData,
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
      data: result[0] as UserData,
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
              data: existingUser[0] as UserData,
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
 * Handle OAuth authentication flow (matches main app's auth.ts)
 * This function handles both Google and Apple OAuth flows
 */
export async function handleOAuthFlow(
  oauthResult: OAuthFlowResult,
  provider: 'google' | 'apple'
): Promise<OAuthResult> {
  try {
    const { createdSessionId, signIn, signUp, setActive } = oauthResult;

    // If sign in was successful, set the active session
    if (createdSessionId) {
      if (setActive) {
        await setActive({ session: createdSessionId });

        // Check if this is a new user (sign up) or existing user (sign in)
        if (signUp?.createdUserId) {
          // This is a new user signing up
          return await handleNewUserSignUp(signUp);
        } else if (signIn?.userId) {
          // This is an existing user signing in
          return await handleExistingUserSignIn(signIn);
        }

        // Fallback for any other case
        return {
          success: true,
          code: 'success',
          message: 'You have successfully authenticated',
          needsOnboarding: false,
        };
      }
    }

    return {
      success: false,
      code: 'error',
      message: 'An error occurred during authentication',
    };
  } catch (error: unknown) {
    console.error(`${provider} OAuth error:`, error);

    // Handle specific OAuth errors
    if (error instanceof Error && 'code' in error && error.code === 'ERR_CANCELED') {
      return {
        success: false,
        code: 'user_canceled',
        message: 'Sign in was canceled',
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      code: 'error',
      message: errorMessage || `${provider} Sign In failed`,
    };
  }
}

/**
 * Handle new user sign up flow
 */
async function handleNewUserSignUp(signUp: OAuthSignUp): Promise<OAuthResult> {
  try {
    // Check if user already exists in our database
    const userCheckResponse = await checkUserAuthStatus(signUp.createdUserId);

    if (userCheckResponse.success && userCheckResponse.data) {
      // User exists in database, check if they need onboarding
      if (userCheckResponse.needsOnboarding) {
        return {
          success: true,
          code: 'needs_onboarding',
          message: 'Please complete your profile setup',
          needsOnboarding: true,
        };
      } else {
        return {
          success: true,
          code: 'success',
          message: 'You have successfully authenticated',
          needsOnboarding: false,
        };
      }
    } else {
      // User doesn't exist in database, create them
      const userCreationResult = await createUserInDatabase({
        clerkId: signUp.createdUserId,
        firstName: signUp.firstName || '',
        lastName: signUp.lastName || '',
        email: signUp.emailAddress,
      });

      if (userCreationResult.success) {
        // User created successfully, needs onboarding
        return {
          success: true,
          code: 'needs_onboarding',
          message: 'Please complete your profile setup',
          needsOnboarding: true,
        };
      } else {
        // User creation failed
        return {
          success: false,
          code: 'user_creation_failed',
          message: 'Failed to create user profile',
        };
      }
    }
  } catch (error) {
    console.error('New user sign up error:', error);
    // If we can't check/create the user, assume they need onboarding
    return {
      success: true,
      code: 'needs_onboarding',
      message: 'Please complete your profile setup',
      needsOnboarding: true,
    };
  }
}

/**
 * Handle existing user sign in flow
 */
async function handleExistingUserSignIn(signIn: OAuthSignIn): Promise<OAuthResult> {
  try {
    // Check if user exists in our database and has completed onboarding
    const userCheckResponse = await checkUserAuthStatus(signIn.userId);

    if (userCheckResponse.success && userCheckResponse.data) {
      // User exists in database, check if they need onboarding
      if (userCheckResponse.needsOnboarding) {
        return {
          success: true,
          code: 'needs_onboarding',
          message: 'Please complete your profile setup',
          needsOnboarding: true,
        };
      } else {
        return {
          success: true,
          code: 'success',
          message: 'You have successfully authenticated',
          needsOnboarding: false,
        };
      }
    } else {
      // User doesn't exist in database, create them
      const userCreationResult = await createUserInDatabase({
        clerkId: signIn.userId,
        firstName: signIn.firstName || '',
        lastName: signIn.lastName || '',
        email: signIn.emailAddress,
      });

      if (userCreationResult.success) {
        // User created successfully, needs onboarding
        return {
          success: true,
          code: 'needs_onboarding',
          message: 'Please complete your profile setup',
          needsOnboarding: true,
        };
      } else {
        // User creation failed
        return {
          success: false,
          code: 'user_creation_failed',
          message: 'Failed to create user profile',
        };
      }
    }
  } catch (error) {
    console.error('Existing user sign in error:', error);
    // If we can't check/create the user, assume they need onboarding
    return {
      success: true,
      code: 'needs_onboarding',
      message: 'Please complete your profile setup',
      needsOnboarding: true,
    };
  }
}

/**
 * Google OAuth handler (matches main app's googleOAuth function)
 */
export async function googleOAuth(
  startOAuthFlow: () => Promise<OAuthFlowResult>
): Promise<OAuthResult> {
  try {
    const oauthResult = await startOAuthFlow();
    return await handleOAuthFlow(oauthResult, 'google');
  } catch (error: unknown) {
    console.error('Google OAuth error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      code: 'error',
      message: errorMessage || 'Google Sign In failed',
    };
  }
}

/**
 * Apple OAuth handler (matches main app's appleOAuth function)
 */
export async function appleOAuth(
  startOAuthFlow: () => Promise<OAuthFlowResult>
): Promise<OAuthResult> {
  try {
    const oauthResult = await startOAuthFlow();
    return await handleOAuthFlow(oauthResult, 'apple');
  } catch (error: unknown) {
    console.error('Apple OAuth error:', error);

    // Handle specific Apple Authentication errors
    if (error instanceof Error && 'code' in error && error.code === 'ERR_CANCELED') {
      return {
        success: false,
        code: 'user_canceled',
        message: 'Sign in was canceled',
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      code: 'error',
      message: errorMessage || 'Apple Sign In failed',
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
  } catch {
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function logAuthAttempt(clerkId: string, success: boolean, endpoint: string): void {
  // Logging removed for production
  // Parameters are required for interface compatibility but not used
}
