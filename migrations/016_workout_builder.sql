-- Workout builder (Home → Activities).
--
-- exercise_library   shared exercise catalogue, seeded once from the public-domain
--                    free-exercise-db (scripts/seed-exercise-library.ts). Instructions
--                    come from here, never from Gemini.
-- workout_templates  shared cache of generated workouts keyed by normalised builder
--                    inputs, so the same inputs never pay for a second Gemini call.
--                    Holds no personal data.
-- user_workouts      a user's own copy of a template (swaps/progress stay theirs).
--                    Finishing one writes a single `activities` row, which is what
--                    feeds calories out.

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
