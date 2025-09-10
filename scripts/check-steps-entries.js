#!/usr/bin/env node

/**
 * Script to check current steps entries in the database
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function checkStepsEntries() {
  try {
    console.log('🔍 Checking steps entries in database...');
    
    // Check all steps entries
    const allSteps = await sql`
      SELECT 
        id,
        clerk_id,
        date,
        activity_description,
        estimated_calories,
        created_at
      FROM activities 
      WHERE activity_description LIKE '%Daily Steps%'
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    console.log('\n📊 All Steps Entries:');
    console.table(allSteps);
    
    // Check today's steps entries
    const todaySteps = await sql`
      SELECT 
        id,
        clerk_id,
        date,
        activity_description,
        estimated_calories,
        created_at
      FROM activities 
      WHERE activity_description LIKE '%Daily Steps%'
        AND date = CURRENT_DATE
      ORDER BY created_at DESC
    `;
    
    console.log('\n📅 Today\'s Steps Entries:');
    console.table(todaySteps);
    
    // Check for duplicates
    const duplicates = await sql`
      SELECT 
        clerk_id,
        date,
        COUNT(*) as duplicate_count
      FROM activities 
      WHERE activity_description LIKE '%Daily Steps%'
      GROUP BY clerk_id, date
      HAVING COUNT(*) > 1
      ORDER BY date DESC
    `;
    
    console.log('\n🔍 Steps Duplicates:');
    if (duplicates.length === 0) {
      console.log('✅ No steps duplicates found');
    } else {
      console.table(duplicates);
    }
    
  } catch (error) {
    console.error('❌ Error checking steps entries:', error);
    process.exit(1);
  }
}

checkStepsEntries();
