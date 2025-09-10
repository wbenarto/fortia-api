# Database Migrations

This directory contains database migration scripts to fix duplicate BMR and Steps entries.

## Migration 001: Fix Activities Duplicates

**File**: `001_fix_activities_duplicates.sql`

**Purpose**: Clean up duplicate BMR and Steps entries and add unique constraints to prevent future duplicates.

**What it does**:
1. Removes duplicate BMR entries (keeps most recent per user per day)
2. Removes duplicate Steps entries (keeps most recent per user per day)  
3. Adds unique constraints to prevent future duplicates
4. Adds performance indexes

**How to run**:
```bash
# Connect to your Neon database and run:
psql "your-database-connection-string" -f migrations/001_fix_activities_duplicates.sql
```

**Or using Neon CLI**:
```bash
neon db execute --sql-file migrations/001_fix_activities_duplicates.sql
```

## Before Running Migration

⚠️ **Important**: This migration will delete duplicate entries. Make sure to backup your database first if you have important data.

## After Migration

The following constraints will be in place:
- Only one BMR entry per user per day
- Only one Steps entry per user per day
- Better performance on activity queries

## Verification

After running the migration, you can verify it worked by checking:
```sql
-- Check for any remaining duplicates
SELECT clerk_id, date, COUNT(*) as count
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
GROUP BY clerk_id, date
HAVING COUNT(*) > 1;

SELECT clerk_id, date, COUNT(*) as count
FROM activities 
WHERE activity_description LIKE '%Daily Steps%'
GROUP BY clerk_id, date
HAVING COUNT(*) > 1;
```

These queries should return no results if the migration was successful.
