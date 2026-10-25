-- Fortia API Database Schema
-- This file contains all table definitions for the Fortia application

-- Users table for storing user information
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  dob DATE,
  age INTEGER,
  weight DECIMAL(5,2),
  starting_weight DECIMAL(5,2),
  target_weight DECIMAL(5,2),
  height DECIMAL(5,2),
  gender TEXT,
  activity_level TEXT,
  fitness_goal TEXT,
  daily_calories INTEGER DEFAULT 2000,
  daily_protein DECIMAL(5,2) DEFAULT 150.0,
  daily_carbs DECIMAL(5,2) DEFAULT 250.0,
  daily_fats DECIMAL(5,2) DEFAULT 65.0,
  bmr DECIMAL(8,2),
  tdee DECIMAL(8,2),
  custom_calories INTEGER,
  custom_protein DECIMAL(5,2),
  custom_carbs DECIMAL(5,2),
  custom_fats DECIMAL(5,2),
  diet_type TEXT NOT NULL DEFAULT 'balanced'
    CHECK (diet_type IN ('balanced', 'high_protein', 'low_carb', 'keto')),
  fasting_schedule TEXT NOT NULL DEFAULT 'off'
    CHECK (fasting_schedule IN ('off', '16_8', '18_6', '20_4', 'omad')),
  fasting_start_hour SMALLINT NOT NULL DEFAULT 12
    CHECK (fasting_start_hour BETWEEN 0 AND 23),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Meals table for storing user meal logs
CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  food_name TEXT NOT NULL,
  portion_size TEXT NOT NULL,
  calories INTEGER,
  protein DECIMAL(5,2),
  carbs DECIMAL(5,2),
  fats DECIMAL(5,2),
  fiber DECIMAL(5,2),
  sugar DECIMAL(5,2),
  sodium INTEGER,
  confidence_score DECIMAL(3,2),
  meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  notes TEXT,
  image_url TEXT,
  ingredients JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Weights table for tracking user weight over time
CREATE TABLE IF NOT EXISTS weights (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  weight DECIMAL(5,2) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Steps table for tracking user step data
CREATE TABLE IF NOT EXISTS steps (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  steps INTEGER NOT NULL,
  goal INTEGER DEFAULT 10000,
  calories_burned INTEGER,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(clerk_id, date)
);

-- Activities table for tracking user workout activities
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  activity_description TEXT NOT NULL,
  estimated_calories INTEGER,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API logs table for monitoring
CREATE TABLE IF NOT EXISTS api_logs (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT,
  request_text TEXT,
  response_data JSONB,
  tokens_used INTEGER,
  cost DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Privacy consent table for tracking user privacy policy consent
CREATE TABLE IF NOT EXISTS privacy_consent (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  consent_given BOOLEAN NOT NULL DEFAULT true,
  consent_version TEXT NOT NULL DEFAULT '1.0',
  consent_method TEXT NOT NULL DEFAULT 'onboarding',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(clerk_id)
);

-- Data consent table for granular data collection preferences
CREATE TABLE IF NOT EXISTS data_consent (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL UNIQUE,
  basic_profile BOOLEAN NOT NULL DEFAULT true,
  health_metrics BOOLEAN NOT NULL DEFAULT false,
  nutrition_data BOOLEAN NOT NULL DEFAULT false,
  weight_tracking BOOLEAN NOT NULL DEFAULT false,
  step_tracking BOOLEAN NOT NULL DEFAULT false,
  workout_activities BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT NOT NULL DEFAULT '1.0',
  consent_method TEXT NOT NULL DEFAULT 'onboarding',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workout programs table for AI-generated workout programs
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

-- Workout sessions table
CREATE TABLE IF NOT EXISTS workout_sessions (
  id SERIAL PRIMARY KEY,
  clerk_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  workout_type TEXT CHECK (workout_type IN ('exercise', 'barbell', 'ai_generated')),
  scheduled_date DATE NOT NULL,
  program_id INTEGER REFERENCES workout_programs(id),
  week_number INTEGER,
  session_number INTEGER,
  phase_name TEXT,
  warm_up_video_url TEXT,
  completion_status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workout exercises table
CREATE TABLE IF NOT EXISTS workout_exercises (
  id SERIAL PRIMARY KEY,
  workout_session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  weight DECIMAL(5,2),
  duration INTEGER,
  rest_seconds INTEGER DEFAULT 60,
  order_index INTEGER DEFAULT 1,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  calories_burned INTEGER,
  muscle_groups TEXT[],
  video_url TEXT,
  exercise_completed BOOLEAN DEFAULT FALSE,
  completion_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Deep focus sessions table
CREATE TABLE IF NOT EXISTS deep_focus_sessions (
  id SERIAL PRIMARY KEY,
  clerk_id VARCHAR(255) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  duration_minutes DECIMAL(5,2) GENERATED ALWAYS AS (duration_seconds / 60.0) STORED,
  session_start_time TIMESTAMP,
  session_end_time TIMESTAMP,
  session_date DATE GENERATED ALWAYS AS (DATE(session_start_time)) STORED,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Daily quests table for tracking user daily quest completion and streaks
CREATE TABLE IF NOT EXISTS daily_quests (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  date DATE NOT NULL,
  weight_logged BOOLEAN DEFAULT FALSE,
  meal_logged BOOLEAN DEFAULT FALSE,
  exercise_logged BOOLEAN DEFAULT FALSE,
  day_completed BOOLEAN DEFAULT FALSE,
  streak_day INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(clerk_id, date)
);

-- Exercise video cache table (global cache for all users)
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

-- Workout builder (see migrations/016_workout_builder.sql)
CREATE TABLE IF NOT EXISTS exercise_library (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  level TEXT,
  force TEXT,
  mechanic TEXT,
  primary_muscles TEXT[] NOT NULL DEFAULT '{}',
  secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
  -- Equipment the exercise *requires*; empty = bodyweight. Matched with `<@`
  -- against what the user has.
  equipment TEXT[] NOT NULL DEFAULT '{}',
  focus_tags TEXT[] NOT NULL DEFAULT '{}',
  instructions TEXT[] NOT NULL DEFAULT '{}',
  image_paths TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'seed',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_library_equipment ON exercise_library USING GIN (equipment);
CREATE INDEX IF NOT EXISTS idx_exercise_library_focus ON exercise_library USING GIN (focus_tags);
CREATE INDEX IF NOT EXISTS idx_exercise_library_muscles ON exercise_library USING GIN (primary_muscles);
CREATE INDEX IF NOT EXISTS idx_exercise_library_category ON exercise_library (category);

CREATE TABLE IF NOT EXISTS workout_templates (
  id SERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL,
  inputs JSONB NOT NULL,
  title TEXT NOT NULL,
  -- [{ section: 'warmup'|'main'|'cooldown', slug, sets, reps, seconds, rest }]
  blocks JSONB NOT NULL,
  est_minutes INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('gemini', 'rules')),
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_templates_cache_key ON workout_templates (cache_key);

CREATE TABLE IF NOT EXISTS user_workouts (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  inputs JSONB NOT NULL,
  blocks JSONB NOT NULL,
  -- { sets: { [blockIndex]: [{ reps, weight, done }] }, activeSeconds, index }
  progress JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed')),
  active_minutes INTEGER,
  calories INTEGER,
  activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_workouts_clerk ON user_workouts (clerk_id, created_at DESC);

-- Activity catalogue for Log activity (seeded by migrations/017_activity_types.sql)
CREATE TABLE IF NOT EXISTS activity_types (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- MaterialCommunityIcons glyph name
  icon TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cardio', 'strength', 'mind_body', 'sports')),
  met_light NUMERIC(4, 1) NOT NULL,
  met_moderate NUMERIC(4, 1) NOT NULL,
  met_vigorous NUMERIC(4, 1) NOT NULL,
  -- [light, moderate, vigorous] — what each intensity means for this activity
  intensity_labels TEXT[] NOT NULL,
  intensity_hints TEXT[] NOT NULL,
  supports_distance BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Distance logging (migrations/018_activity_distance.sql)
  typical_speeds NUMERIC(4, 2)[],
  met_from_speed BOOLEAN NOT NULL DEFAULT FALSE,
  distance_unit_us TEXT,
  distance_unit_metric TEXT,
  pace_style TEXT
);

-- Migrations table for tracking executed migrations
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Meals table indexes
CREATE INDEX IF NOT EXISTS idx_meals_clerk_id ON meals(clerk_id);
CREATE INDEX IF NOT EXISTS idx_meals_created_at ON meals(created_at);
CREATE INDEX IF NOT EXISTS idx_meals_meal_type ON meals(meal_type);
CREATE INDEX IF NOT EXISTS idx_meals_image_url ON meals(image_url);

-- Weights table indexes
CREATE INDEX IF NOT EXISTS idx_weights_clerk_id ON weights(clerk_id);
CREATE INDEX IF NOT EXISTS idx_weights_date ON weights(date);
CREATE INDEX IF NOT EXISTS idx_weights_clerk_date ON weights(clerk_id, date);

-- Steps table indexes
CREATE INDEX IF NOT EXISTS idx_steps_clerk_id ON steps(clerk_id);
CREATE INDEX IF NOT EXISTS idx_steps_date ON steps(date);
CREATE INDEX IF NOT EXISTS idx_steps_clerk_date ON steps(clerk_id, date);

-- Activities table indexes
CREATE INDEX IF NOT EXISTS idx_activities_clerk_id ON activities(clerk_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

-- API logs table indexes
CREATE INDEX IF NOT EXISTS idx_api_logs_clerk_id ON api_logs(clerk_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);

-- Privacy consent table indexes
CREATE INDEX IF NOT EXISTS idx_privacy_consent_clerk_id ON privacy_consent(clerk_id);
CREATE INDEX IF NOT EXISTS idx_privacy_consent_created_at ON privacy_consent(created_at);

-- Data consent table indexes
CREATE INDEX IF NOT EXISTS idx_data_consent_clerk_id ON data_consent(clerk_id);
CREATE INDEX IF NOT EXISTS idx_data_consent_created_at ON data_consent(created_at);

-- Workout sessions table indexes
CREATE INDEX IF NOT EXISTS idx_workout_sessions_clerk_id ON workout_sessions(clerk_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_program_id ON workout_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_week_number ON workout_sessions(week_number);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_scheduled_date ON workout_sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_completion_status ON workout_sessions(completion_status);

-- Workout exercises table indexes
CREATE INDEX IF NOT EXISTS idx_workout_exercises_session_id ON workout_exercises(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_order ON workout_exercises(order_index);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_completed ON workout_exercises(exercise_completed);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_order_composite ON workout_exercises(workout_session_id, order_index);

-- Deep focus sessions table indexes
CREATE INDEX IF NOT EXISTS idx_deep_focus_clerk_id ON deep_focus_sessions(clerk_id);
CREATE INDEX IF NOT EXISTS idx_deep_focus_date ON deep_focus_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_deep_focus_created_at ON deep_focus_sessions(created_at);

-- Daily quests table indexes
CREATE INDEX IF NOT EXISTS idx_daily_quests_clerk_id ON daily_quests(clerk_id);
CREATE INDEX IF NOT EXISTS idx_daily_quests_date ON daily_quests(date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_clerk_date ON daily_quests(clerk_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_created_at ON daily_quests(created_at);

-- Workout programs table indexes
CREATE INDEX IF NOT EXISTS idx_workout_programs_clerk_id ON workout_programs(clerk_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_status ON workout_programs(status);
CREATE INDEX IF NOT EXISTS idx_workout_programs_start_date ON workout_programs(start_date);

-- Exercise video cache table indexes
CREATE INDEX IF NOT EXISTS idx_exercise_video_cache_exercise_name ON exercise_video_cache(exercise_name);
CREATE INDEX IF NOT EXISTS idx_exercise_video_cache_last_used ON exercise_video_cache(last_used_at);

-- AI workout decisions table indexes
CREATE INDEX IF NOT EXISTS idx_ai_workout_decisions_clerk_id ON ai_workout_decisions(clerk_id);
CREATE INDEX IF NOT EXISTS idx_ai_workout_decisions_program_id ON ai_workout_decisions(program_id);
CREATE INDEX IF NOT EXISTS idx_ai_workout_decisions_created_at ON ai_workout_decisions(created_at);

-- Workout feedback table indexes
CREATE INDEX IF NOT EXISTS idx_workout_feedback_clerk_id ON workout_feedback(clerk_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_session_id ON workout_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_created_at ON workout_feedback(created_at);

-- Muscle balance history table indexes
CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_clerk_id ON muscle_balance_history(clerk_id);
CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_program_id ON muscle_balance_history(program_id);
CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_workout_date ON muscle_balance_history(workout_date);
CREATE INDEX IF NOT EXISTS idx_muscle_balance_history_clerk_date ON muscle_balance_history(clerk_id, workout_date);

-- Table comments for documentation
COMMENT ON TABLE workout_programs IS 'Stores AI-generated workout programs with user preferences and goals';
COMMENT ON TABLE exercise_video_cache IS 'Global cache for YouTube exercise videos to minimize API calls';
COMMENT ON TABLE ai_workout_decisions IS 'Tracks all AI decisions for program generation and adaptation';
COMMENT ON TABLE workout_feedback IS 'Stores user feedback after completing workouts for AI adaptation';
COMMENT ON TABLE muscle_balance_history IS 'Historical tracking of muscle group volume across ALL workouts for all-time balance visualization and progress tracking';
