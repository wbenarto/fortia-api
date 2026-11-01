-- Challenges: a user opts into a dated macro challenge (Challenges tab).
-- Daily results are computed from meals / workouts already logged, so only the
-- challenge itself is stored. Targets are copied at the start so later diet or
-- profile changes don't recolor past days.

CREATE TABLE IF NOT EXISTS challenges (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  diet_type TEXT NOT NULL,
  workouts_per_week INTEGER NOT NULL CHECK (workouts_per_week BETWEEN 1 AND 7),
  -- { calories, protein, carbs, fats } at the start of the challenge
  targets JSONB NOT NULL,
  -- active → completed (end date passed) or ended (stopped early)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'ended')),
  created_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_challenges_clerk ON challenges (clerk_id, status);
-- One active challenge per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_one_active
  ON challenges (clerk_id) WHERE status = 'active';
