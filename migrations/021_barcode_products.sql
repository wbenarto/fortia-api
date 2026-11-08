-- Camera logging.
--
-- barcode_products: cache of barcode lookups so a product is fetched from the source
-- once. One row per code, from a single source, never merged with other data:
-- Open Food Facts rows are ODbL (attribution + share-alike), USDA rows are public
-- domain. Values are per 100 g (or 100 ml); serving_g is the label's serving size.
-- found = false caches a miss for a while so unknown codes don't hit both APIs every scan.
CREATE TABLE IF NOT EXISTS barcode_products (
  code TEXT PRIMARY KEY,
  found BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT,                 -- 'openfoodfacts' | 'usda'
  source_id TEXT,              -- OFF code / FDC id
  name TEXT,
  brand TEXT,
  serving_label TEXT,          -- e.g. "2 tbsp (32 g)"
  serving_g NUMERIC(8,2),
  calories_100g NUMERIC(8,2),
  protein_100g NUMERIC(8,2),
  carbs_100g NUMERIC(8,2),
  fats_100g NUMERIC(8,2),
  fiber_100g NUMERIC(8,2),
  sugar_100g NUMERIC(8,2),
  sodium_mg_100g NUMERIC(10,2),
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ai_usage: per-user daily counters for paid AI calls (meal photos), kept in the DB
-- because the in-memory limiter resets on every serverless instance.
CREATE TABLE IF NOT EXISTS ai_usage (
  clerk_id TEXT NOT NULL,
  day DATE NOT NULL,
  kind TEXT NOT NULL,          -- 'meal_photo'
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clerk_id, day, kind)
);
