-- Migration 013: Update workout_type constraint to include ai_generated
-- This migration allows AI-generated workouts to be stored in workout_sessions

-- Drop the existing constraint
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_workout_type_check;

-- Add new constraint that includes 'ai_generated' for AI workout programs
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_workout_type_check
CHECK (workout_type = ANY (ARRAY['exercise'::text, 'barbell'::text, 'ai_generated'::text]));

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT workout_sessions_workout_type_check ON workout_sessions
IS 'Allows exercise, barbell, and ai_generated workout types for different workout sources';

