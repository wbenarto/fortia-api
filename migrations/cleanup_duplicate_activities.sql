-- Migration: Clean up duplicate BMR and Steps entries before adding unique constraints
-- This script removes duplicate entries, keeping only the most recent one for each user per day

-- Clean up duplicate BMR entries
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

-- Clean up duplicate Steps entries  
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

-- Show summary of remaining entries
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
