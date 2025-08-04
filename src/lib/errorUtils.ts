import { NextResponse } from 'next/server';

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
}

export class ApiErrorResponse extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any
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
  statusCode: number = 500
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
  badRequest: (message: string = 'Bad Request') =>
    createErrorResponse(new ApiErrorResponse(message, 400, 'BAD_REQUEST')),

  unauthorized: (message: string = 'Unauthorized') =>
    createErrorResponse(new ApiErrorResponse(message, 401, 'UNAUTHORIZED')),

  forbidden: (message: string = 'Forbidden') =>
    createErrorResponse(new ApiErrorResponse(message, 403, 'FORBIDDEN')),

  notFound: (message: string = 'Not Found') =>
    createErrorResponse(new ApiErrorResponse(message, 404, 'NOT_FOUND')),

  conflict: (message: string = 'Conflict') =>
    createErrorResponse(new ApiErrorResponse(message, 409, 'CONFLICT')),

  tooManyRequests: (message: string = 'Too Many Requests') =>
    createErrorResponse(new ApiErrorResponse(message, 429, 'RATE_LIMITED')),

  internalError: (message: string = 'Internal Server Error') =>
    createErrorResponse(new ApiErrorResponse(message, 500, 'INTERNAL_ERROR')),

  serviceUnavailable: (message: string = 'Service Unavailable') =>
    createErrorResponse(new ApiErrorResponse(message, 503, 'SERVICE_UNAVAILABLE')),
};

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: any,
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
export function handleDatabaseError(error: any): NextResponse {
  console.error('Database error:', error);

  if (error.message?.includes('duplicate key')) {
    return ErrorResponses.conflict('Resource already exists');
  }

  if (error.message?.includes('foreign key')) {
    return ErrorResponses.badRequest('Invalid reference');
  }

  if (error.message?.includes('connection')) {
    return ErrorResponses.serviceUnavailable('Database connection failed');
  }

  return ErrorResponses.internalError('Database operation failed');
}

/**
 * Log API request for debugging
 */
export function logApiRequest(method: string, url: string, data?: any): void {
  console.log(`🌐 ${method} ${url}`);
  if (data) {
    console.log('📤 Request data:', JSON.stringify(data, null, 2));
  }
}

/**
 * Log API response for debugging
 */
export function logApiResponse(status: number, data?: any): void {
  console.log(`📡 Response status: ${status}`);
  if (data) {
    console.log('📥 Response data:', JSON.stringify(data, null, 2));
  }
}
