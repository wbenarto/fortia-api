-- Distance-based logging for activity_types.
--
-- typical_speeds   mph at [light, moderate, vigorous]. Distance + time → speed → MET
--                  interpolated between these points (met_from_speed). Distance only →
--                  time estimated from the chosen intensity's typical speed.
-- met_from_speed   false for hiking: steep-and-slow burns more than flat-and-fast, so
--                  the chosen intensity sets MET there, not speed.
-- distance_unit_*  unit shown/entered per unit system (swims in yd/m, rowing in m).
-- pace_style       how speed is shown: 'pace' (min/mi), 'speed' (mph), 'per100' (per
--                  100 yd/m), 'per500' (per 500 m split).

ALTER TABLE activity_types
  ADD COLUMN IF NOT EXISTS typical_speeds NUMERIC(4, 2)[],
  ADD COLUMN IF NOT EXISTS met_from_speed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS distance_unit_us TEXT,
  ADD COLUMN IF NOT EXISTS distance_unit_metric TEXT,
  ADD COLUMN IF NOT EXISTS pace_style TEXT;

UPDATE activity_types SET supports_distance = TRUE, met_from_speed = TRUE,
  typical_speeds = '{5,6,7.5}', distance_unit_us = 'mi', distance_unit_metric = 'km',
  pace_style = 'pace'
WHERE slug = 'running';

UPDATE activity_types SET supports_distance = TRUE, met_from_speed = TRUE,
  typical_speeds = '{2.5,3,4}', distance_unit_us = 'mi', distance_unit_metric = 'km',
  pace_style = 'pace'
WHERE slug = 'walking';

UPDATE activity_types SET supports_distance = TRUE, met_from_speed = TRUE,
  typical_speeds = '{9,13,15}', distance_unit_us = 'mi', distance_unit_metric = 'km',
  pace_style = 'speed'
WHERE slug = 'cycling';

-- ~2:25, 2:00 and 1:30 per 100 yd
UPDATE activity_types SET supports_distance = TRUE, met_from_speed = TRUE,
  typical_speeds = '{1.4,1.7,2.3}', distance_unit_us = 'yd', distance_unit_metric = 'm',
  pace_style = 'per100'
WHERE slug = 'swimming';

-- 2:45, 2:15 and 2:00 per 500 m split
UPDATE activity_types SET supports_distance = TRUE, met_from_speed = TRUE,
  typical_speeds = '{6.78,8.28,9.32}', distance_unit_us = 'm', distance_unit_metric = 'm',
  pace_style = 'per500'
WHERE slug = 'rowing';

UPDATE activity_types SET supports_distance = TRUE, met_from_speed = FALSE,
  typical_speeds = '{2.5,2.2,2}', distance_unit_us = 'mi', distance_unit_metric = 'km',
  pace_style = 'pace'
WHERE slug = 'hiking';

-- Indoor bike "distance" isn't comparable to road distance; time + intensity only
UPDATE activity_types SET supports_distance = FALSE WHERE slug = 'stationary_bike';
