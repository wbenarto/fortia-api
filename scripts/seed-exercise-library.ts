/**
 * Seed exercise_library from free-exercise-db (public domain / Unlicense,
 * https://github.com/yuhonas/free-exercise-db). Pinned to a commit so re-runs are
 * reproducible. Idempotent: upserts by slug.
 *
 * Usage (from fortia-api root, after migration 016):
 *   npx tsx scripts/seed-exercise-library.ts           # dry run, prints counts
 *   npx tsx scripts/seed-exercise-library.ts --apply   # write rows
 */

import * as path from 'path';
import { config as loadEnv } from 'dotenv';

const root = path.join(__dirname, '..');
loadEnv({ path: path.join(root, '.env') });
loadEnv({ path: path.join(root, '.env.local'), override: true });

import { neon } from '@neondatabase/serverless';
import {
  EXCLUDED_CATEGORIES,
  mapEquipment,
  mapFocusTags,
  type SourceExercise,
} from '../src/lib/exerciseLibrary';

const DATASET_COMMIT = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const DATASET_URL = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${DATASET_COMMIT}/dist/exercises.json`;
const APPLY = process.argv.includes('--apply');

async function main() {
  const response = await fetch(DATASET_URL);
  if (!response.ok)
    throw new Error(`Dataset download failed: ${response.status}`);
  const source = (await response.json()) as SourceExercise[];

  const rows = [];
  const skipped: Record<string, number> = {};
  for (const ex of source) {
    if (EXCLUDED_CATEGORIES.has(ex.category)) {
      skipped[ex.category] = (skipped[ex.category] || 0) + 1;
      continue;
    }
    const equipment = mapEquipment(ex);
    if (!equipment) {
      skipped[`equipment:${ex.equipment}`] =
        (skipped[`equipment:${ex.equipment}`] || 0) + 1;
      continue;
    }
    rows.push({
      slug: ex.id,
      name: ex.name,
      category: ex.category,
      level: ex.level,
      force: ex.force,
      mechanic: ex.mechanic,
      primary_muscles: ex.primaryMuscles,
      secondary_muscles: ex.secondaryMuscles,
      equipment,
      focus_tags: mapFocusTags(ex),
      instructions: ex.instructions,
      image_paths: ex.images,
    });
  }

  console.log(`Source: ${source.length}, importing: ${rows.length}`);
  console.log('Skipped:', skipped);
  const byEquipment: Record<string, number> = {};
  for (const row of rows) {
    const key = row.equipment.length ? row.equipment.join('+') : 'bodyweight';
    byEquipment[key] = (byEquipment[key] || 0) + 1;
  }
  console.log('By equipment:', byEquipment);

  if (!APPLY) {
    console.log('Dry run — pass --apply to write.');
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);
  // jsonb_to_recordset keeps this to a few round trips instead of ~800 inserts
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await sql.query(
      `INSERT INTO exercise_library (
         slug, name, category, level, force, mechanic, primary_muscles,
         secondary_muscles, equipment, focus_tags, instructions, image_paths, source
       )
       SELECT slug, name, category, level, force, mechanic, primary_muscles,
              secondary_muscles, equipment, focus_tags, instructions, image_paths, 'seed'
       FROM jsonb_to_recordset($1::jsonb) AS r(
         slug text, name text, category text, level text, force text, mechanic text,
         primary_muscles text[], secondary_muscles text[], equipment text[],
         focus_tags text[], instructions text[], image_paths text[]
       )
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, category = EXCLUDED.category, level = EXCLUDED.level,
         force = EXCLUDED.force, mechanic = EXCLUDED.mechanic,
         primary_muscles = EXCLUDED.primary_muscles,
         secondary_muscles = EXCLUDED.secondary_muscles, equipment = EXCLUDED.equipment,
         focus_tags = EXCLUDED.focus_tags, instructions = EXCLUDED.instructions,
         image_paths = EXCLUDED.image_paths`,
      [JSON.stringify(chunk)]
    );
    console.log(`Upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  const [{ count }] =
    await sql`SELECT COUNT(*)::int AS count FROM exercise_library`;
  console.log(`exercise_library rows: ${count}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
