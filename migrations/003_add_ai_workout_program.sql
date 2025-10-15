-- Migration 003: Add AI Workout Program Tables
-- This migration creates tables for AI-powered workout programs with historical muscle balance tracking

-- AI workout programs table
CREATE TABLE IF NOT EXISTS workout_programs (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  program_name TEXT NOT NULL,
  program_goal TEXT NOT NULL,
  total_weeks INTEGER NOT NULL,
  sessions_per_week INTEGER NOT NULL,
  session_duration INTEGER NOT NULL,
  workout_days TEXT[] NOT NULL,
  available_equipment TEXT[] NOT NULL,
  ai_generation_prompt TEXT,
  muscle_balance_target JSONB,
  status TEXT DEFAULT 'active',
  start_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Extend workout_sessions table (check before adding)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_sessions' AND column_name='program_id') THEN
    ALTER TABLE workout_sessions ADD COLUMN program_id INTEGER REFERENCES workout_programs(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_sessions' AND column_name='week_number') THEN
    ALTER TABLE workout_sessions ADD COLUMN week_number INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_sessions' AND column_name='session_number') THEN
    ALTER TABLE workout_sessions ADD COLUMN session_number INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_sessions' AND column_name='phase_name') THEN
    ALTER TABLE workout_sessions ADD COLUMN phase_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_sessions' AND column_name='warm_up_video_url') THEN
    ALTER TABLE workout_sessions ADD COLUMN warm_up_video_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_sessions' AND column_name='completion_status') THEN
    ALTER TABLE workout_sessions ADD COLUMN completion_status TEXT DEFAULT 'scheduled';
  END IF;
END $$;

-- Extend workout_exercises table (check before adding)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_exercises' AND column_name='muscle_groups') THEN
    ALTER TABLE workout_exercises ADD COLUMN muscle_groups TEXT[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_exercises' AND column_name='video_url') THEN
    ALTER TABLE workout_exercises ADD COLUMN video_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_exercises' AND column_name='exercise_completed') THEN
    ALTER TABLE workout_exercises ADD COLUMN exercise_completed BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='workout_exercises' AND column_name='completion_notes') THEN
    ALTER TABLE workout_exercises ADD COLUMN completion_notes TEXT;
  END IF;
END $$;

-- YouTube video cache table (global cache for all users)
CREATE TABLE IF NOT EXISTS exercise_video_cache (
  id SERIAL PRIMARY KEY,
  exercise_name TEXT NOT NULL UNIQUE,
  video_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  embed_url TEXT NOT NULL,
  video_title TEXT,
  fetched_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW(),
  use_count INTEGER DEFAULT 1
);

-- AI decisions tracking
CREATE TABLE IF NOT EXISTS ai_workout_decisions (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  program_id INTEGER REFERENCES workout_programs(id),
  decision_type TEXT NOT NULL,
  input_data JSONB NOT NULL,
  output_data JSONB NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Workout feedback (simplified)
CREATE TABLE IF NOT EXISTS workout_feedback (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  session_id INTEGER REFERENCES workout_sessions(id),
  difficulty_rating TEXT NOT NULL,
  completion_percentage INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Historical muscle balance tracking (ALL-TIME TRACKING)
-- This table stores cumulative muscle group volume for all-time visualization
CREATE TABLE IF NOT EXISTS muscle_balance_history (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  program_id INTEGER REFERENCES workout_programs(id),
  session_id INTEGER REFERENCES workout_sessions(id),

  -- Volume = sets × reps per muscle group
  chest_volume INTEGER DEFAULT 0,
  back_volume INTEGER DEFAULT 0,
  legs_volume INTEGER DEFAULT 0,
  shoulders_volume INTEGER DEFAULT 0,
  arms_volume INTEGER DEFAULT 0,
  core_volume INTEGER DEFAULT 0,

  total_volume INTEGER DEFAULT 0,
  workout_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Ensure one entry per session
  UNIQUE(clerk_id, session_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workout_programs_clerk_id ON workout_programs(clerk_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_status ON workout_programs(status);
CREATE INDEX IF NOT EXISTS idx_workout_programs_start_date ON workout_programs(start_date);

CREATE INDEX IF NOT EXISTS idx_exercise_video_cache_exercise_name ON exercise_video_cache(exercise_name);
CREATE INDEX IF NOT EXISTS idx_exercise_video_cache_last_used ON exercise_video_cache(last_used_at);

CREATE INDEX IF NOT EXISTS idx_ai_workout_decisions_clerk_id ON ai_workout_decisions(clerk_id);
CREATE INDEX IF NOT EXISTS idx_ai_workout_decisions_program_id ON ai_workout_decisions(program_id);
CREATE INDEX IF NOT EXISTS idx_ai_workout_decisions_created_at ON ai_workout_decisions(created_at);

CREATE INDEX IF NOT EXISTS idx_workout_feedback_clerk_id ON workout_feedback(clerk_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_session_id ON workout_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_created_at ON workout_feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_clerk_id ON muscle_balance_history(clerk_id);
CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_program_id ON muscle_balance_history(program_id);
CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_workout_date ON muscle_balance_history(workout_date);
CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_clerk_date ON muscle_balance_history(clerk_id, workout_date);

-- Add comments to tables
COMMENT ON TABLE workout_programs IS 'Stores AI-generated workout programs with user preferences and goals';
COMMENT ON TABLE exercise_video_cache IS 'Global cache for YouTube exercise videos to minimize API calls';
COMMENT ON TABLE ai_workout_decisions IS 'Tracks all AI decisions for program generation and adaptation';
COMMENT ON TABLE workout_feedback IS 'Stores user feedback after completing workouts for AI adaptation';
COMMENT ON TABLE muscle_balance_history IS 'Historical tracking of muscle group volume across ALL workouts for all-time balance visualization and progress tracking';
