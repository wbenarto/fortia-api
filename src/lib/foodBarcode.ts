import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// Barcode → product nutrition, from free sources only:
//   1. our cache (barcode_products)
//   2. Open Food Facts (ODbL: the app shows "Data from Open Food Facts"; rows stay
//      in their own cache rows, never merged with other sources; no product photos)
//   3. USDA FoodData Central Branded Foods (public domain, needs FDC_API_KEY)
// Everything is normalised to per-100 g values plus the label's serving size.

export interface BarcodeProduct {
  code: string;
  source: 'openfoodfacts' | 'usda';
  name: string;
  brand: string | null;
  servingLabel: string | null;
  servingG: number | null;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
    sugar: number;
    sodiumMg: number;
  };
}

// Open Food Facts asks every app to identify itself; set OFF_CONTACT to a contact email or URL
const USER_AGENT = `Fortia/1.0 (${process.env.OFF_CONTACT || 'iOS nutrition app'})`;
const MISS_TTL_DAYS = 7; // re-check unknown codes after a week
const HIT_TTL_DAYS = 90; // products change rarely

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

// GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14 share the same mod-10 rule).
// Rejects camera misreads before they hit the APIs.
const validCheckDigit = (code: string) => {
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
};

/** Digits only, 8–14 long (EAN-8, UPC-A, EAN-13, GTIN-14), valid check digit, not all zeros. */
export const normalizeCode = (raw: string) => {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  if (/^0+$/.test(digits) || !validCheckDigit(digits)) return null;
  return digits;
};

// ── Open Food Facts ──────────────────────────────────────────────────────

const fetchOpenFoodFacts = async (code: string): Promise<BarcodeProduct | null> => {
  const fields =
    'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments';
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${code}?fields=${fields}`,
    { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.status !== 1 || !data.product) return null;
  const p = data.product;
  const n = p.nutriments || {};

  // Energy: prefer kcal; fall back to kJ
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? num(n['energy_100g']) / 4.184 : undefined);
  const name = (p.product_name_en || p.product_name || '').trim();
  if (!name || kcal === undefined) return null;

  return {
    code,
    source: 'openfoodfacts',
    name,
    brand: (p.brands || '').split(',')[0]?.trim() || null,
    servingLabel: p.serving_size || null,
    servingG: num(p.serving_quantity) > 0 ? num(p.serving_quantity) : null,
    per100g: {
      calories: round(num(kcal)),
      protein: round(num(n.proteins_100g)),
      carbs: round(num(n.carbohydrates_100g)),
      fats: round(num(n.fat_100g)),
      fiber: round(num(n.fiber_100g)),
      sugar: round(num(n.sugars_100g)),
      // OFF sodium is grams per 100 g
      sodiumMg: round(num(n.sodium_100g) * 1000, 0),
    },
  };
};

// ── USDA FoodData Central (Branded) ──────────────────────────────────────

// FDC nutrient numbers
const FDC = {
  calories: ['208', '957', '958'],
  protein: ['203'],
  carbs: ['205'],
  fats: ['204'],
  fiber: ['291'],
  sugar: ['269'],
  sodium: ['307'],
};

// USDA stores GTINs zero-padded to 14 digits (UPC 016000275287 → 00016000275287) and
// search only matches the stored form, so try the padded code first, then as scanned.
const stripZeros = (code: string) => code.replace(/^0+/, '');

const fetchUsda = async (code: string): Promise<BarcodeProduct | null> => {
  const key = process.env.FDC_API_KEY;
  if (!key) return null;
  const queries = [...new Set([code.padStart(14, '0'), code])];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let food: Record<string, any> | undefined;
  for (const query of queries) {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&dataType=Branded&pageSize=5&query=${query}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Duplicate GTINs are product updates: take the most recently published
    const matches = (data?.foods || [])
      .filter((f: { gtinUpc?: string }) => {
        const gtin = (f.gtinUpc || '').replace(/\D/g, '');
        return gtin && stripZeros(gtin) === stripZeros(code);
      })
      .sort((a: { publishedDate?: string }, b: { publishedDate?: string }) =>
        String(b.publishedDate || '').localeCompare(String(a.publishedDate || ''))
      );
    food = matches[0];
    if (food) break;
  }
  if (!food) return null;

  const nutrients: { nutrientNumber?: string; value?: number }[] = food.foodNutrients || [];
  const pick = (numbers: string[]) =>
    num(nutrients.find(x => x.nutrientNumber && numbers.includes(x.nutrientNumber))?.value);

  // Branded values are per 100 g / 100 ml
  const servingG =
    ['g', 'grm', 'ml', 'mlt'].includes(String(food.servingSizeUnit || '').toLowerCase()) &&
    num(food.servingSize) > 0
      ? num(food.servingSize)
      : null;
  const name = String(food.description || '').trim();
  if (!name) return null;
  const titleCase = (s: string) =>
    s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  return {
    code,
    source: 'usda',
    name: name === name.toUpperCase() ? titleCase(name) : name,
    brand: (() => {
      const brand = String(food.brandName || food.brandOwner || '').trim();
      return brand ? (brand === brand.toUpperCase() ? titleCase(brand) : brand) : null;
    })(),
    servingLabel:
      food.householdServingFullText ||
      (servingG ? `${servingG} ${String(food.servingSizeUnit).toLowerCase()}` : null),
    servingG,
    per100g: {
      calories: round(pick(FDC.calories)),
      protein: round(pick(FDC.protein)),
      carbs: round(pick(FDC.carbs)),
      fats: round(pick(FDC.fats)),
      fiber: round(pick(FDC.fiber)),
      sugar: round(pick(FDC.sugar)),
      sodiumMg: round(pick(FDC.sodium), 0),
    },
  };
};

// ── Cache ────────────────────────────────────────────────────────────────

type CacheRow = Record<string, unknown>;

const fromRow = (r: CacheRow): BarcodeProduct => ({
  code: String(r.code),
  source: r.source as BarcodeProduct['source'],
  name: String(r.name),
  brand: (r.brand as string) || null,
  servingLabel: (r.serving_label as string) || null,
  servingG: r.serving_g === null ? null : num(r.serving_g),
  per100g: {
    calories: num(r.calories_100g),
    protein: num(r.protein_100g),
    carbs: num(r.carbs_100g),
    fats: num(r.fats_100g),
    fiber: num(r.fiber_100g),
    sugar: num(r.sugar_100g),
    sodiumMg: num(r.sodium_mg_100g),
  },
});

const saveHit = (p: BarcodeProduct) => sql`
  INSERT INTO barcode_products (code, found, source, source_id, name, brand, serving_label,
    serving_g, calories_100g, protein_100g, carbs_100g, fats_100g, fiber_100g, sugar_100g,
    sodium_mg_100g, fetched_at)
  VALUES (${p.code}, TRUE, ${p.source}, ${p.code}, ${p.name}, ${p.brand}, ${p.servingLabel},
    ${p.servingG}, ${p.per100g.calories}, ${p.per100g.protein}, ${p.per100g.carbs},
    ${p.per100g.fats}, ${p.per100g.fiber}, ${p.per100g.sugar}, ${p.per100g.sodiumMg}, NOW())
  ON CONFLICT (code) DO UPDATE SET found = TRUE, source = EXCLUDED.source,
    source_id = EXCLUDED.source_id, name = EXCLUDED.name, brand = EXCLUDED.brand,
    serving_label = EXCLUDED.serving_label, serving_g = EXCLUDED.serving_g,
    calories_100g = EXCLUDED.calories_100g, protein_100g = EXCLUDED.protein_100g,
    carbs_100g = EXCLUDED.carbs_100g, fats_100g = EXCLUDED.fats_100g,
    fiber_100g = EXCLUDED.fiber_100g, sugar_100g = EXCLUDED.sugar_100g,
    sodium_mg_100g = EXCLUDED.sodium_mg_100g, fetched_at = NOW()
`;

const saveMiss = (code: string) => sql`
  INSERT INTO barcode_products (code, found, fetched_at) VALUES (${code}, FALSE, NOW())
  ON CONFLICT (code) DO UPDATE SET found = FALSE, source = NULL, name = NULL, fetched_at = NOW()
`;

/** Cache → Open Food Facts → USDA. Returns null when no source knows the code. */
export const lookupBarcode = async (rawCode: string): Promise<BarcodeProduct | null> => {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const [cached] = await sql`
    SELECT * FROM barcode_products WHERE code = ${code}
      AND fetched_at > NOW() - (CASE WHEN found THEN ${HIT_TTL_DAYS}::int ELSE ${MISS_TTL_DAYS}::int END) * INTERVAL '1 day'
  `;
  if (cached) return cached.found ? fromRow(cached) : null;

  let product: BarcodeProduct | null = null;
  try {
    product = await fetchOpenFoodFacts(code);
  } catch (err) {
    console.error('Open Food Facts lookup failed:', err);
  }
  if (!product) {
    try {
      product = await fetchUsda(code);
    } catch (err) {
      console.error('USDA lookup failed:', err);
    }
  }

  if (product) await saveHit(product);
  else await saveMiss(code);
  return product;
};
