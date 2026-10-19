-- Diet program + intermittent fasting settings on the user.
-- diet_type changes the macro split (see src/lib/nutritionTargets.ts);
-- fasting_* is display/hints only and never changes targets.
-- Defaults keep every existing user on the current behaviour (balanced, no fasting).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS diet_type TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS fasting_schedule TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS fasting_start_hour SMALLINT NOT NULL DEFAULT 12;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_diet_type_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_diet_type_check
      CHECK (diet_type IN ('balanced', 'high_protein', 'low_carb', 'keto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_fasting_schedule_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_fasting_schedule_check
      CHECK (fasting_schedule IN ('off', '16_8', '18_6', '20_4', 'omad'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_fasting_start_hour_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_fasting_start_hour_check
      CHECK (fasting_start_hour BETWEEN 0 AND 23);
  END IF;
END $$;
