import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    const result = await sql`
			SELECT * FROM privacy_consent 
			WHERE clerk_id = ${clerkId}
			ORDER BY created_at DESC 
			LIMIT 1
		`;

    return NextResponse.json({ success: true, data: result[0] || null });
  } catch (error) {
    console.error('Fetch privacy consent error:', error);
    return NextResponse.json({ error: 'Failed to fetch privacy consent' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      clerkId,
      privacyPolicyAccepted = true,
      termsAccepted = true,
      consentVersion = '1.0',
      consentMethod = 'onboarding',
    } = await request.json();

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    const result = await sql`
			INSERT INTO privacy_consent (
				clerk_id, privacy_policy_accepted, terms_accepted,
				consent_version, consent_method, created_at, updated_at
			) VALUES (
				${clerkId}, ${privacyPolicyAccepted}, ${termsAccepted},
				${consentVersion}, ${consentMethod}, NOW(), NOW()
			)
			ON CONFLICT (clerk_id) DO UPDATE SET
				privacy_policy_accepted = EXCLUDED.privacy_policy_accepted,
				terms_accepted = EXCLUDED.terms_accepted,
				consent_version = EXCLUDED.consent_version,
				consent_method = EXCLUDED.consent_method,
				updated_at = NOW()
			RETURNING *
		`;

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Store privacy consent error:', error);
    return NextResponse.json({ error: 'Failed to store privacy consent' }, { status: 500 });
  }
}
