-- Script to remove BMR duplicates for today
-- This script keeps only the most recent BMR entry for each user for today

-- Show current BMR entries for today before cleanup
SELECT 
    'BEFORE CLEANUP' as status,
    clerk_id,
    date,
    activity_description,
    estimated_calories,
    created_at,
    COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries_for_user_today
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
  AND date = CURRENT_DATE
ORDER BY clerk_id, created_at DESC;

-- Delete duplicate BMR entries for today (keep only the most recent one per user)
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
          AND date = CURRENT_DATE
    ) ranked
    WHERE rn > 1
);

-- Show remaining BMR entries for today after cleanup
SELECT 
    'AFTER CLEANUP' as status,
    clerk_id,
    date,
    activity_description,
    estimated_calories,
    created_at
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
  AND date = CURRENT_DATE
ORDER BY clerk_id, created_at DESC;

-- Show summary
SELECT 
    'SUMMARY' as status,
    COUNT(*) as total_bmr_entries_today,
    COUNT(DISTINCT clerk_id) as unique_users_with_bmr_today
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
  AND date = CURRENT_DATE;
