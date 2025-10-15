-- Migration 012: Fix workout_sessions table columns for AI workout programs
-- This migration adds missing columns to the workout_sessions table

-- Add program_id column to link sessions to workout programs
ALTER TABLE workout_sessions
ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES workout_programs(id);

-- Add week_number column to track which week of the program
ALTER TABLE workout_sessions
ADD COLUMN IF NOT EXISTS week_number INTEGER;

-- Add session_number column to track session within the week
ALTER TABLE workout_sessions
ADD COLUMN IF NOT EXISTS session_number INTEGER;

-- Add phase_name column to track training phase
ALTER TABLE workout_sessions
ADD COLUMN IF NOT EXISTS phase_name TEXT;

-- Add warm_up_video_url column for YouTube warm-up videos
ALTER TABLE workout_sessions
ADD COLUMN IF NOT EXISTS warm_up_video_url TEXT;

-- Add completion_status column to track session status
ALTER TABLE workout_sessions
ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'scheduled';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workout_sessions_program_id ON workout_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_week_number ON workout_sessions(week_number);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_scheduled_date ON workout_sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_completion_status ON workout_sessions(completion_status);

-- Add comments to new columns
COMMENT ON COLUMN workout_sessions.program_id IS 'Links to the workout program this session belongs to';
COMMENT ON COLUMN workout_sessions.week_number IS 'Week number within the program (1, 2, 3, etc.)';
COMMENT ON COLUMN workout_sessions.session_number IS 'Session number within the week (1, 2, 3, etc.)';
COMMENT ON COLUMN workout_sessions.phase_name IS 'Training phase name (e.g., Foundation, Build, Peak)';
COMMENT ON COLUMN workout_sessions.warm_up_video_url IS 'YouTube URL for warm-up video';
COMMENT ON COLUMN workout_sessions.completion_status IS 'Session status: scheduled, in_progress, completed';

