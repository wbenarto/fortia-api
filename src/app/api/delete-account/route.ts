import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkId = searchParams.get('clerkId');

    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }



    // Delete all user data from all tables in the correct order
    // Start with tables that reference other tables, then move to main tables

    // 1. Delete API logs
    console.log('Deleting API logs...');
    await sql`
			DELETE FROM api_logs 
			WHERE clerk_id = ${clerkId}
		`;

    // 2. Delete deep focus sessions
    console.log('Deleting deep focus sessions...');
    await sql`
			DELETE FROM deep_focus_sessions 
			WHERE clerk_id = ${clerkId}
		`;

    // 3. Delete activities
    console.log('Deleting activities...');
    await sql`
			DELETE FROM activities 
			WHERE clerk_id = ${clerkId}
		`;

    // 4. Delete steps
    console.log('Deleting steps...');
    await sql`
			DELETE FROM steps 
			WHERE clerk_id = ${clerkId}
		`;

    // 5. Delete weights
    console.log('Deleting weights...');
    await sql`
			DELETE FROM weights 
			WHERE clerk_id = ${clerkId}
		`;

    // 6. Delete meals
    console.log('Deleting meals...');
    await sql`
			DELETE FROM meals 
			WHERE clerk_id = ${clerkId}
		`;

    // 7. Delete consent data
    console.log('Deleting consent data...');
    await sql`
			DELETE FROM data_consent 
			WHERE clerk_id = ${clerkId}
		`;

    await sql`
			DELETE FROM privacy_consent 
			WHERE clerk_id = ${clerkId}
		`;

    // 8. Finally, delete the user record
    console.log('Deleting user record...');
    const userResult = await sql`
			DELETE FROM users 
			WHERE clerk_id = ${clerkId}
			RETURNING id
		`;

    if (userResult.length === 0) {
      console.log('No user record found to delete');
    } else {
      console.log('User record deleted successfully');
    }



    return NextResponse.json({
      success: true,
      message: 'Account and all associated data deleted successfully',
      deletedUser: userResult.length > 0 ? userResult[0].id : null,
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete account',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
