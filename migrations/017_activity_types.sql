-- Activity catalogue for the "Log activity" modal. Calories are computed from these
-- MET values (Compendium of Physical Activities, rounded) and the user's weight —
-- no AI call. Only a free-text "Other" activity still goes to Gemini.
--
-- kcal = (MET − 1) × kg × hours. MET − 1 because calories out already includes BMR
-- (same rule as the workout builder).

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
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO activity_types (
  slug, name, icon, category, met_light, met_moderate, met_vigorous,
  intensity_labels, intensity_hints, supports_distance, sort_order
) VALUES
  ('running', 'Running', 'run', 'cardio', 7.0, 9.8, 11.8,
    '{Easy jog,Steady run,Fast run}', '{~5 mph,~6 mph,7+ mph}', TRUE, 10),
  ('walking', 'Walking', 'walk', 'cardio', 2.8, 3.5, 5.0,
    '{Easy,Steady,Brisk}', '{~2.5 mph,~3 mph,4 mph}', TRUE, 20),
  ('cycling', 'Cycling', 'bike', 'cardio', 4.0, 8.0, 10.0,
    '{Leisure,Steady,Fast}', '{<10 mph,12–14 mph,14–16 mph}', TRUE, 30),
  ('swimming', 'Swimming', 'swim', 'cardio', 5.8, 8.3, 10.0,
    '{Easy laps,Steady laps,Fast laps}', '{Relaxed pace,Moderate effort,Hard effort}', TRUE, 40),
  ('hiking', 'Hiking', 'hiking', 'cardio', 5.3, 6.0, 7.8,
    '{Flat trail,Hilly trail,Steep / with pack}', '{Easy terrain,Some climbs,Big climbs}', TRUE, 50),
  ('strength', 'Weight training', 'dumbbell', 'strength', 3.5, 5.0, 6.0,
    '{Light,Moderate,Heavy}', '{Long rests,Steady sets,Hard sets}', FALSE, 60),
  ('hiit', 'HIIT', 'lightning-bolt', 'cardio', 5.0, 8.0, 9.0,
    '{Light circuit,Circuit,All-out}', '{Easy pace,Hard intervals,Max effort}', FALSE, 70),
  ('stationary_bike', 'Indoor cycling', 'bike-fast', 'cardio', 3.5, 6.8, 8.8,
    '{Easy spin,Steady,Spin class}', '{Light resistance,Moderate,Hard}', TRUE, 80),
  ('rowing', 'Rowing', 'rowing', 'cardio', 4.8, 7.0, 8.5,
    '{Easy,Steady,Hard}', '{Light pull,Moderate pull,Race pace}', TRUE, 90),
  ('elliptical', 'Elliptical', 'shoe-sneaker', 'cardio', 4.0, 5.0, 6.5,
    '{Easy,Steady,Hard}', '{Light resistance,Moderate,Hard}', FALSE, 100),
  ('stairs', 'Stair climber', 'stairs-up', 'cardio', 5.0, 8.0, 9.5,
    '{Easy,Steady,Hard}', '{Slow steps,Steady climb,Fast climb}', FALSE, 110),
  ('jump_rope', 'Jump rope', 'jump-rope', 'cardio', 8.8, 11.8, 12.3,
    '{Easy,Steady,Fast}', '{<100 skips/min,100–120/min,120+/min}', FALSE, 120),
  ('yoga', 'Yoga', 'yoga', 'mind_body', 2.5, 3.0, 4.0,
    '{Gentle,Flow,Power}', '{Stretch & restore,Vinyasa,Power yoga}', FALSE, 130),
  ('pilates', 'Pilates', 'human-handsup', 'mind_body', 2.8, 3.5, 4.5,
    '{Gentle,Mat,Reformer / hard}', '{Beginner,Intermediate,Advanced}', FALSE, 140),
  ('dancing', 'Dancing', 'human-female-dance', 'cardio', 4.5, 5.5, 7.3,
    '{Easy,Social,Energetic}', '{Slow dance,Club / class,Zumba / cardio}', FALSE, 150),
  ('basketball', 'Basketball', 'basketball', 'sports', 4.5, 6.5, 8.0,
    '{Shooting,Pickup game,Competitive}', '{Light,Game,Hard game}', FALSE, 160),
  ('soccer', 'Soccer', 'soccer', 'sports', 5.0, 7.0, 10.0,
    '{Casual,Game,Competitive}', '{Kickabout,Recreational,Hard match}', FALSE, 170),
  ('tennis', 'Tennis', 'tennis', 'sports', 5.0, 7.3, 8.0,
    '{Doubles,Singles,Competitive}', '{Casual,Rally,Match}', FALSE, 180),
  ('pickleball', 'Pickleball', 'table-tennis', 'sports', 4.0, 5.0, 6.0,
    '{Casual,Game,Competitive}', '{Doubles,Singles,Tournament}', FALSE, 190),
  ('golf', 'Golf', 'golf', 'sports', 3.5, 4.3, 4.8,
    '{Cart,Walking,Carrying clubs}', '{Riding,Walking,Walk & carry}', FALSE, 200),
  ('boxing', 'Boxing', 'boxing-glove', 'sports', 5.5, 7.8, 9.0,
    '{Technique,Bag work,Sparring}', '{Light,Moderate,Hard}', FALSE, 210),
  ('martial_arts', 'Martial arts', 'karate', 'sports', 5.3, 7.8, 10.3,
    '{Drills,Class,Sparring}', '{Light,Moderate,Hard}', FALSE, 220),
  ('climbing', 'Climbing', 'image-filter-hdr', 'sports', 5.0, 7.3, 8.0,
    '{Easy routes,Bouldering,Hard routes}', '{Light,Moderate,Hard}', FALSE, 230),
  ('volleyball', 'Volleyball', 'volleyball', 'sports', 3.0, 4.0, 6.0,
    '{Casual,Game,Beach / competitive}', '{Light,Moderate,Hard}', FALSE, 240)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, icon = EXCLUDED.icon, category = EXCLUDED.category,
  met_light = EXCLUDED.met_light, met_moderate = EXCLUDED.met_moderate,
  met_vigorous = EXCLUDED.met_vigorous, intensity_labels = EXCLUDED.intensity_labels,
  intensity_hints = EXCLUDED.intensity_hints, supports_distance = EXCLUDED.supports_distance,
  sort_order = EXCLUDED.sort_order;
