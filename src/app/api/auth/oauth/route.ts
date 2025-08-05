import { NextRequest, NextResponse } from 'next/server';
import { handleOAuthFlow } from '@/lib/authUtils';
import { ErrorResponses } from '@/lib/errorUtils';

export async function POST(request: NextRequest) {
  try {
    const { provider, oauthResult } = await request.json();

    if (!provider || !oauthResult) {
      return ErrorResponses.badRequest('Provider and OAuth result are required');
    }

    let result;

    switch (provider) {
      case 'google':
        result = await handleOAuthFlow(oauthResult, 'google');
        break;
      case 'apple':
        result = await handleOAuthFlow(oauthResult, 'apple');
        break;
      default:
        return ErrorResponses.badRequest('Invalid provider. Must be "google" or "apple"');
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        code: result.code,
        message: result.message,
        needsOnboarding: result.needsOnboarding,
        data: result.data,
      });
    } else {
      return NextResponse.json({
        success: false,
        code: result.code,
        message: result.message,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('OAuth API error:', error);
    return ErrorResponses.internalError('OAuth authentication failed');
  }
}

// Handle Google OAuth specifically
export async function PUT(request: NextRequest) {
  try {
    const { oauthResult } = await request.json();

    if (!oauthResult) {
      return ErrorResponses.badRequest('OAuth result is required');
    }

    const result = await handleOAuthFlow(oauthResult, 'google');

    if (result.success) {
      return NextResponse.json({
        success: true,
        code: result.code,
        message: result.message,
        needsOnboarding: result.needsOnboarding,
        data: result.data,
      });
    } else {
      return NextResponse.json({
        success: false,
        code: result.code,
        message: result.message,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Google OAuth API error:', error);
    return ErrorResponses.internalError('Google OAuth authentication failed');
  }
}

// Handle Apple OAuth specifically
export async function PATCH(request: NextRequest) {
  try {
    const { oauthResult } = await request.json();

    if (!oauthResult) {
      return ErrorResponses.badRequest('OAuth result is required');
    }

    const result = await handleOAuthFlow(oauthResult, 'apple');

    if (result.success) {
      return NextResponse.json({
        success: true,
        code: result.code,
        message: result.message,
        needsOnboarding: result.needsOnboarding,
        data: result.data,
      });
    } else {
      return NextResponse.json({
        success: false,
        code: result.code,
        message: result.message,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Apple OAuth API error:', error);
    return ErrorResponses.internalError('Apple OAuth authentication failed');
  }
} 