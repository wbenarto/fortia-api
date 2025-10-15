-- Migration 014: Fix workout_exercises table columns for AI workout programs
-- This migration adds missing columns to the workout_exercises table

-- Add rest_seconds column for rest time between sets
ALTER TABLE workout_exercises
ADD COLUMN IF NOT EXISTS rest_seconds INTEGER DEFAULT 60;

-- Add muscle_groups column to track which muscle groups the exercise targets
ALTER TABLE workout_exercises
ADD COLUMN IF NOT EXISTS muscle_groups TEXT[];

-- Add video_url column for YouTube exercise videos
ALTER TABLE workout_exercises
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add exercise_completed column for tracking completion status
ALTER TABLE workout_exercises
ADD COLUMN IF NOT EXISTS exercise_completed BOOLEAN DEFAULT FALSE;

-- Add completion_notes column for user notes about exercise completion
ALTER TABLE workout_exercises
ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workout_exercises_session_id ON workout_exercises(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_completed ON workout_exercises(exercise_completed);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_order ON workout_exercises(workout_session_id, order_index);

-- Add comments to new columns
COMMENT ON COLUMN workout_exercises.rest_seconds IS 'Rest time in seconds between sets';
COMMENT ON COLUMN workout_exercises.muscle_groups IS 'Array of muscle groups targeted by this exercise';
COMMENT ON COLUMN workout_exercises.video_url IS 'YouTube URL for exercise demonstration video';
COMMENT ON COLUMN workout_exercises.exercise_completed IS 'Whether the exercise has been completed';
COMMENT ON COLUMN workout_exercises.completion_notes IS 'User notes about exercise completion';

