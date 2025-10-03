-- Migration 002: Create Daily Quests Table
-- This migration creates the daily_quests table for tracking user daily quest completion and streaks

-- Create daily_quests table
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_daily_quests_clerk_id ON daily_quests(clerk_id);
CREATE INDEX IF NOT EXISTS idx_daily_quests_date ON daily_quests(date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_clerk_date ON daily_quests(clerk_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_created_at ON daily_quests(created_at);

-- Add comment to table
COMMENT ON TABLE daily_quests IS 'Tracks user daily quest completion status and streaks for weight logging, meal logging, and exercise logging';
