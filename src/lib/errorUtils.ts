import { NextResponse } from 'next/server';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  statusCode: number;
}

export class ApiErrorResponse extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: ApiErrorResponse | Error | string,
  statusCode = 500
): NextResponse {
  let apiError: ApiError;

  if (error instanceof ApiErrorResponse) {
    apiError = {
      code: error.code,
      message: error.message,
      details: error.details,
      statusCode: error.statusCode,
    };
  } else if (error instanceof Error) {
    apiError = {
      code: 'INTERNAL_ERROR',
      message: error.message,
      statusCode,
    };
  } else {
    apiError = {
      code: 'INTERNAL_ERROR',
      message: error,
      statusCode,
    };
  }

  console.error('API Error:', apiError);
  return NextResponse.json(
    { error: apiError.message, code: apiError.code },
    { status: apiError.statusCode }
  );
}

/**
 * Common error responses
 */
export const ErrorResponses = {
  badRequest: (message = 'Bad Request') =>
    createErrorResponse(new ApiErrorResponse(message, 400, 'BAD_REQUEST')),

  unauthorized: (message = 'Unauthorized') =>
    createErrorResponse(new ApiErrorResponse(message, 401, 'UNAUTHORIZED')),

  forbidden: (message = 'Forbidden') =>
    createErrorResponse(new ApiErrorResponse(message, 403, 'FORBIDDEN')),

  notFound: (message = 'Not Found') =>
    createErrorResponse(new ApiErrorResponse(message, 404, 'NOT_FOUND')),

  conflict: (message = 'Conflict') =>
    createErrorResponse(new ApiErrorResponse(message, 409, 'CONFLICT')),

  tooManyRequests: (message = 'Too Many Requests') =>
    createErrorResponse(new ApiErrorResponse(message, 429, 'RATE_LIMITED')),

  internalError: (message = 'Internal Server Error') =>
    createErrorResponse(new ApiErrorResponse(message, 500, 'INTERNAL_ERROR')),

  serviceUnavailable: (message = 'Service Unavailable') =>
    createErrorResponse(new ApiErrorResponse(message, 503, 'SERVICE_UNAVAILABLE')),
};

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!data[field] && data[field] !== 0) {
      missingFields.push(field);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Handle database errors
 */
export function handleDatabaseError(error: unknown): NextResponse {
  console.error('Database error:', error);

  // Check for specific database error types
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
      return ErrorResponses.conflict('Resource already exists');
    }

    if (errorMessage.includes('foreign key') || errorMessage.includes('constraint')) {
      return ErrorResponses.badRequest('Invalid reference');
    }

    if (errorMessage.includes('not null') || errorMessage.includes('null value')) {
      return ErrorResponses.badRequest('Missing required data');
    }

    if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
      return ErrorResponses.serviceUnavailable('Database connection error');
    }
  }

  return ErrorResponses.internalError('Database operation failed');
}

/**
 * Log API request for debugging
 */
export function logApiRequest(method: string, url: string, data?: unknown): void {
  // Only log method and endpoint, not full URL or request data
  const endpoint = url.split('?')[0]; // Remove query parameters
}

/**
 * Log API response for debugging
 */
export function logApiResponse(status: number, data?: unknown): void {
  // Logging removed for production
}
