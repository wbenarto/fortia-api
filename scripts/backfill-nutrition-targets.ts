/**
 * Backfill daily_calories / daily_* / bmr / tdee for existing users using the
 * current nutritionTargets formula (BMR-anchored goal factors).
 *
 * Existing rows were written by the old TDEE-based formula and are only
 * recomputed on a write event (weight log, goal change, profile edit). This
 * script brings every row up to date in one pass.
 *
 * Usage (from fortia-api root):
 *   npx tsx scripts/backfill-nutrition-targets.ts                 # dry run, prints diffs
 *   npx tsx scripts/backfill-nutrition-targets.ts --apply         # write changes
 *   npx tsx scripts/backfill-nutrition-targets.ts --email a@b.com # limit to one user
 */

import * as path from 'path';
import { config as loadEnv } from 'dotenv';

const root = path.join(__dirname, '..');
loadEnv({ path: path.join(root, '.env') });
loadEnv({ path: path.join(root, '.env.local'), override: true });

import { neon } from '@neondatabase/serverless';
import { recalculateNutritionTargets } from '../src/lib/nutritionTargets';

const sql = neon(process.env.DATABASE_URL!);

const APPLY = process.argv.includes('--apply');
const emailArg = process.argv.find(a => a.startsWith('--email'));
const onlyEmail = emailArg
  ? emailArg.split('=')[1] || process.argv[process.argv.indexOf(emailArg) + 1]
  : null;

async function main() {
  const rows = onlyEmail
    ? await sql`SELECT * FROM users WHERE email = ${onlyEmail}`
    : await sql`SELECT * FROM users ORDER BY created_at ASC`;

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${rows.length} user(s)\n`);

  let changed = 0;
  let skipped = 0;

  for (const u of rows) {
    const t = recalculateNutritionTargets(u);
    if (!t) {
      skipped++;
      console.log(`skip   ${u.email} — missing weight/height/age/gender`);
      continue;
    }

    const diffs: string[] = [];
    if (u.daily_calories !== t.dailyCalories)
      diffs.push(`cal ${u.daily_calories}→${t.dailyCalories}`);
    if (u.bmr !== t.bmr) diffs.push(`bmr ${u.bmr}→${t.bmr}`);
    if (u.tdee !== t.tdee) diffs.push(`tdee ${u.tdee}→${t.tdee}`);
    if (u.daily_protein !== t.dailyProtein)
      diffs.push(`P ${u.daily_protein}→${t.dailyProtein}`);
    if (u.daily_carbs !== t.dailyCarbs)
      diffs.push(`C ${u.daily_carbs}→${t.dailyCarbs}`);
    if (u.daily_fats !== t.dailyFats)
      diffs.push(`F ${u.daily_fats}→${t.dailyFats}`);

    if (diffs.length === 0) {
      console.log(`ok     ${u.email} (${u.fitness_goal}) — already current`);
      continue;
    }

    changed++;
    console.log(`change ${u.email} (${u.fitness_goal}) — ${diffs.join(', ')}`);

    if (APPLY) {
      await sql`
        UPDATE users SET
          daily_calories = ${t.dailyCalories},
          daily_protein = ${t.dailyProtein},
          daily_carbs = ${t.dailyCarbs},
          daily_fats = ${t.dailyFats},
          bmr = ${t.bmr},
          tdee = ${t.tdee},
          updated_at = NOW()
        WHERE clerk_id = ${u.clerk_id}
      `;
    }
  }

  console.log(
    `\n${APPLY ? 'Updated' : 'Would update'} ${changed}, skipped ${skipped}, unchanged ${rows.length - changed - skipped}.`
  );
  if (!APPLY && changed > 0) console.log('Re-run with --apply to write.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
