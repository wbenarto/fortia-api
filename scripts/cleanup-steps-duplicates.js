#!/usr/bin/env node

/**
 * Script to clean up Steps duplicates in the database
 * Usage: node scripts/cleanup-steps-duplicates.js [date]
 * 
 * Examples:
 * - node scripts/cleanup-steps-duplicates.js                    # Clean up today's duplicates
 * - node scripts/cleanup-steps-duplicates.js 2024-01-15        # Clean up specific date
 * - node scripts/cleanup-steps-duplicates.js all               # Clean up all duplicates
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function cleanupStepsDuplicates(targetDate = null) {
  try {
    console.log('🧹 Starting Steps duplicate cleanup...');
    
    if (targetDate === 'all') {
      console.log('📅 Cleaning up ALL Steps duplicates (all dates)');
    } else if (targetDate) {
      console.log(`📅 Cleaning up Steps duplicates for date: ${targetDate}`);
    } else {
      console.log('📅 Cleaning up Steps duplicates for today');
    }

    // Show before cleanup
    console.log('\n📊 BEFORE CLEANUP:');
    
    let beforeResults;
    if (targetDate === 'all') {
      beforeResults = await sql`
        SELECT 
          clerk_id,
          date,
          activity_description,
          estimated_calories,
          created_at,
          COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
        ORDER BY clerk_id, date, created_at DESC
      `;
    } else if (targetDate) {
      beforeResults = await sql`
        SELECT 
          clerk_id,
          date,
          activity_description,
          estimated_calories,
          created_at,
          COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = ${targetDate}
        ORDER BY clerk_id, date, created_at DESC
      `;
    } else {
      beforeResults = await sql`
        SELECT 
          clerk_id,
          date,
          activity_description,
          estimated_calories,
          created_at,
          COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = CURRENT_DATE
        ORDER BY clerk_id, date, created_at DESC
      `;
    }
    
    console.table(beforeResults);

    // Count duplicates
    let duplicates;
    if (targetDate === 'all') {
      duplicates = await sql`
        SELECT 
          clerk_id,
          date,
          COUNT(*) as duplicate_count
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
        GROUP BY clerk_id, date
        HAVING COUNT(*) > 1
      `;
    } else if (targetDate) {
      duplicates = await sql`
        SELECT 
          clerk_id,
          date,
          COUNT(*) as duplicate_count
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = ${targetDate}
        GROUP BY clerk_id, date
        HAVING COUNT(*) > 1
      `;
    } else {
      duplicates = await sql`
        SELECT 
          clerk_id,
          date,
          COUNT(*) as duplicate_count
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = CURRENT_DATE
        GROUP BY clerk_id, date
        HAVING COUNT(*) > 1
      `;
    }
    
    if (duplicates.length === 0) {
      console.log('✅ No Steps duplicates found!');
      return;
    }

    console.log(`\n🔍 Found ${duplicates.length} user-date combinations with duplicates:`);
    console.table(duplicates);

    // Delete duplicates (keep most recent)
    let deleteResult;
    if (targetDate === 'all') {
      deleteResult = await sql`
        DELETE FROM activities 
        WHERE id IN (
          SELECT id 
          FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY clerk_id, date 
                     ORDER BY created_at DESC
                   ) as rn
            FROM activities 
            WHERE activity_description LIKE '%Daily Steps%'
          ) ranked
          WHERE rn > 1
        )
      `;
    } else if (targetDate) {
      deleteResult = await sql`
        DELETE FROM activities 
        WHERE id IN (
          SELECT id 
          FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY clerk_id, date 
                     ORDER BY created_at DESC
                   ) as rn
            FROM activities 
            WHERE activity_description LIKE '%Daily Steps%'
              AND date = ${targetDate}
          ) ranked
          WHERE rn > 1
        )
      `;
    } else {
      deleteResult = await sql`
        DELETE FROM activities 
        WHERE id IN (
          SELECT id 
          FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY clerk_id, date 
                     ORDER BY created_at DESC
                   ) as rn
            FROM activities 
            WHERE activity_description LIKE '%Daily Steps%'
              AND date = CURRENT_DATE
          ) ranked
          WHERE rn > 1
        )
      `;
    }
    
    console.log(`\n🗑️  Deleted ${deleteResult.length} duplicate Steps entries`);

    // Show after cleanup
    console.log('\n📊 AFTER CLEANUP:');
    let afterResults;
    if (targetDate === 'all') {
      afterResults = await sql`
        SELECT 
          clerk_id,
          date,
          activity_description,
          estimated_calories,
          created_at,
          COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
        ORDER BY clerk_id, date, created_at DESC
      `;
    } else if (targetDate) {
      afterResults = await sql`
        SELECT 
          clerk_id,
          date,
          activity_description,
          estimated_calories,
          created_at,
          COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = ${targetDate}
        ORDER BY clerk_id, date, created_at DESC
      `;
    } else {
      afterResults = await sql`
        SELECT 
          clerk_id,
          date,
          activity_description,
          estimated_calories,
          created_at,
          COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = CURRENT_DATE
        ORDER BY clerk_id, date, created_at DESC
      `;
    }
    
    console.table(afterResults);

    // Show summary
    let summary;
    if (targetDate === 'all') {
      summary = await sql`
        SELECT 
          COUNT(*) as total_steps_entries,
          COUNT(DISTINCT clerk_id) as unique_users,
          COUNT(DISTINCT date) as unique_dates
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
      `;
    } else if (targetDate) {
      summary = await sql`
        SELECT 
          COUNT(*) as total_steps_entries,
          COUNT(DISTINCT clerk_id) as unique_users,
          COUNT(DISTINCT date) as unique_dates
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = ${targetDate}
      `;
    } else {
      summary = await sql`
        SELECT 
          COUNT(*) as total_steps_entries,
          COUNT(DISTINCT clerk_id) as unique_users,
          COUNT(DISTINCT date) as unique_dates
        FROM activities 
        WHERE activity_description LIKE '%Daily Steps%'
          AND date = CURRENT_DATE
      `;
    }
    
    console.log('\n📈 SUMMARY:');
    console.table(summary);

    console.log('✅ Steps duplicate cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during Steps cleanup:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const targetDate = process.argv[2];

// Validate date format if provided
if (targetDate && targetDate !== 'all') {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(targetDate)) {
    console.error('❌ Invalid date format. Use YYYY-MM-DD or "all"');
    process.exit(1);
  }
}

// Run the cleanup
cleanupStepsDuplicates(targetDate);
