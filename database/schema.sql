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

-- Workout sessions table
CREATE TABLE IF NOT EXISTS workout_sessions (
  id SERIAL PRIMARY KEY,
  clerk_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  workout_type TEXT CHECK (workout_type IN ('exercise', 'barbell')),
  scheduled_date DATE NOT NULL,
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
  order_index INTEGER DEFAULT 1,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  calories_burned INTEGER,
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

-- Workout exercises table indexes
CREATE INDEX IF NOT EXISTS idx_workout_exercises_session_id ON workout_exercises(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_order ON workout_exercises(order_index);

-- Deep focus sessions table indexes
CREATE INDEX IF NOT EXISTS idx_deep_focus_clerk_id ON deep_focus_sessions(clerk_id);
CREATE INDEX IF NOT EXISTS idx_deep_focus_date ON deep_focus_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_deep_focus_created_at ON deep_focus_sessions(created_at);

-- Daily quests table indexes
CREATE INDEX IF NOT EXISTS idx_daily_quests_clerk_id ON daily_quests(clerk_id);
CREATE INDEX IF NOT EXISTS idx_daily_quests_date ON daily_quests(date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_clerk_date ON daily_quests(clerk_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_created_at ON daily_quests(created_at);
