-- Script to remove BMR duplicates for a specific date or all dates
-- Usage: Replace 'TARGET_DATE' with the desired date (YYYY-MM-DD) or use CURRENT_DATE for today

-- Set the target date (change this as needed)
-- For today: CURRENT_DATE
-- For specific date: '2024-01-15'::date
-- For all dates: Remove the date filter in WHERE clauses
\set target_date CURRENT_DATE

-- Show current BMR entries for the target date before cleanup
SELECT 
    'BEFORE CLEANUP' as status,
    clerk_id,
    date,
    activity_description,
    estimated_calories,
    created_at,
    COUNT(*) OVER (PARTITION BY clerk_id, date) as total_entries_for_user_date
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
  AND date = :target_date
ORDER BY clerk_id, date, created_at DESC;

-- Delete duplicate BMR entries for the target date (keep only the most recent one per user per date)
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
          AND date = :target_date
    ) ranked
    WHERE rn > 1
);

-- Show remaining BMR entries for the target date after cleanup
SELECT 
    'AFTER CLEANUP' as status,
    clerk_id,
    date,
    activity_description,
    estimated_calories,
    created_at
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
  AND date = :target_date
ORDER BY clerk_id, date, created_at DESC;

-- Show summary for the target date
SELECT 
    'SUMMARY' as status,
    :target_date as target_date,
    COUNT(*) as total_bmr_entries,
    COUNT(DISTINCT clerk_id) as unique_users_with_bmr
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
  AND date = :target_date;

-- Show overall BMR duplicate summary (all dates)
SELECT 
    'OVERALL DUPLICATE CHECK' as status,
    clerk_id,
    date,
    COUNT(*) as duplicate_count
FROM activities 
WHERE activity_description LIKE '%Basal Metabolic Rate%'
GROUP BY clerk_id, date
HAVING COUNT(*) > 1
ORDER BY date DESC, duplicate_count DESC;
