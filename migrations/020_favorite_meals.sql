-- Favorite meals (Log a meal → Favorites). A snapshot of the meal so it can be logged
-- again in one tap, even after the original log is deleted.
-- meal_key = lower(food name) | lower(portion) | ingredients JSON — the same identity
-- the Recent list dedupes on, so the app can show which recents are favorites.

CREATE TABLE IF NOT EXISTS favorite_meals (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  meal_key TEXT NOT NULL,
  food_name TEXT NOT NULL,
  portion_size TEXT,
  calories INTEGER NOT NULL DEFAULT 0,
  protein NUMERIC(6,2) NOT NULL DEFAULT 0,
  carbs NUMERIC(6,2) NOT NULL DEFAULT 0,
  fats NUMERIC(6,2) NOT NULL DEFAULT 0,
  fiber NUMERIC(6,2) NOT NULL DEFAULT 0,
  sugar NUMERIC(6,2) NOT NULL DEFAULT 0,
  sodium INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  ingredients JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (clerk_id, meal_key)
);

CREATE INDEX IF NOT EXISTS idx_favorite_meals_clerk ON favorite_meals (clerk_id, created_at DESC);
