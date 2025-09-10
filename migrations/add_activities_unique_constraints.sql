-- Migration: Add unique constraints to prevent duplicate BMR and Steps entries
-- This ensures only one BMR and one Steps entry per user per day in the activities table

-- Add unique constraint for BMR entries (one per user per day)
-- This will prevent duplicate BMR entries for the same user on the same day
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_bmr_unique 
ON activities (clerk_id, date) 
WHERE activity_description LIKE '%Basal Metabolic Rate%';

-- Add unique constraint for Steps entries (one per user per day)  
-- This will prevent duplicate Steps entries for the same user on the same day
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_steps_unique 
ON activities (clerk_id, date) 
WHERE activity_description LIKE '%Daily Steps%';

-- Add a general index for better performance on daily activity queries
CREATE INDEX IF NOT EXISTS idx_activities_clerk_date_type 
ON activities (clerk_id, date, activity_description);

-- Note: These are partial unique indexes that only apply to specific activity types
-- This allows multiple different activities per user per day, but prevents duplicates
-- of the same type (BMR or Steps) per user per day
