import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/errorUtils';
import { lookupBarcode, normalizeCode } from '@/lib/foodBarcode';

// GET ?clerkId&code → { success, data: BarcodeProduct | null }
// Free sources only (cache → Open Food Facts → USDA); see src/lib/foodBarcode.ts.
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    if (!params.get('clerkId')) return ErrorResponses.unauthorized('Authentication required');
    const code = normalizeCode(params.get('code') || '');
    if (!code) return ErrorResponses.badRequest('A valid barcode is required');

    const product = await lookupBarcode(code);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('Barcode lookup error:', error);
    return ErrorResponses.internalError('Barcode lookup failed');
  }
}
