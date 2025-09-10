-- Migration 001: Fix duplicate BMR and Steps entries in activities table
-- This migration cleans up existing duplicates and adds unique constraints

-- Step 1: Clean up duplicate BMR entries
-- Keep only the most recent BMR entry for each user per day
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
        WHERE activity_description LIKE '%Basal Metabolic Rate%'
    ) ranked
    WHERE rn > 1
);

-- Step 2: Clean up duplicate Steps entries  
-- Keep only the most recent Steps entry for each user per day
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
);

-- Step 3: Add unique constraint for BMR entries (one per user per day)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_bmr_unique 
ON activities (clerk_id, date) 
WHERE activity_description LIKE '%Basal Metabolic Rate%';

-- Step 4: Add unique constraint for Steps entries (one per user per day)  
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_steps_unique 
ON activities (clerk_id, date) 
WHERE activity_description LIKE '%Daily Steps%';

-- Step 5: Add a general index for better performance on daily activity queries
CREATE INDEX IF NOT EXISTS idx_activities_clerk_date_type 
ON activities (clerk_id, date, activity_description);

-- Step 6: Show summary of remaining entries
SELECT 
    'BMR entries' as activity_type,
    COUNT(*) as count
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'

UNION ALL

SELECT 
    'Steps entries' as activity_type,
    COUNT(*) as count
FROM activities 
WHERE activity_description LIKE '%Daily Steps%';
