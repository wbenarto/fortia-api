import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { ErrorResponses } from '@/lib/errorUtils';
import {
  getGeminiGenerateContentUrl,
  getGeminiGenerationConfig,
  parseGeminiJsonFromResponse,
} from '@/lib/gemini';

const sql = neon(process.env.DATABASE_URL!);

// Meal photo → foods + portions + macros, in ONE Gemini call (~1k input / ~600 output
// tokens with a 1024px JPEG at medium resolution ≈ $0.003–0.006 per photo).
// mode 'label': a nutrition-facts label (fallback when a barcode isn't found).
// The photo is not stored. 10 photos per user per day, counted in ai_usage.

const DAILY_LIMIT = 10;
const MAX_BASE64_CHARS = 2_000_000; // ≈ 1.5 MB of image

const num = (v: unknown, max = 10000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n * 10) / 10) : 0;
};

const MEAL_PROMPT = `You are a nutrition expert looking at a photo of food someone is about to eat.
Identify each distinct food or drink and estimate its portion from visual cues (plate size, utensils, packaging).
Return JSON only:
{
  "notFood": boolean,            // true if there is no food in the photo
  "mealName": string,            // short name for the whole meal, e.g. "Chicken burrito bowl"
  "items": [
    { "ingredient": string, "amount": string, "calories": number, "protein": number, "carbs": number, "fats": number }
  ],
  "fiber": number, "sugar": number, "sodium": number,   // totals for the meal (g, g, mg)
  "confidence": number           // 0-1, how sure you are about foods and portions
}
Use common names ("grilled chicken breast", "white rice"), US units for amounts ("1 cup", "6 oz", "2 slices"),
at most 8 items, and grams for macros. Include visible sauces, dressings and cooking oil.`;

const LABEL_PROMPT = `This is a photo of a packaged food's nutrition facts label.
Read it and return JSON only, for ONE serving as printed:
{
  "notFood": boolean,            // true if no nutrition label is readable
  "mealName": string,            // product name if visible, else "Packaged food"
  "servingSize": string,         // as printed, e.g. "2/3 cup (55g)"
  "calories": number, "protein": number, "carbs": number, "fats": number,
  "fiber": number, "sugar": number, "sodium": number,   // g, except sodium in mg
  "confidence": number           // 0-1, how legible the label was
}`;

const bumpUsage = async (clerkId: string, delta: number) => {
  const [row] = await sql`
    INSERT INTO ai_usage (clerk_id, day, kind, count) VALUES (${clerkId}, CURRENT_DATE, 'meal_photo', ${delta})
    ON CONFLICT (clerk_id, day, kind) DO UPDATE SET count = GREATEST(0, ai_usage.count + ${delta})
    RETURNING count
  `;
  return Number(row?.count) || 0;
};

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorResponses.badRequest('Invalid request body');
  }

  const clerkId = typeof body.clerkId === 'string' ? body.clerkId : '';
  const image = typeof body.image === 'string' ? body.image.replace(/^data:[^,]+,/, '') : '';
  const mimeType = body.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const mode = body.mode === 'label' ? 'label' : 'meal';

  if (!clerkId) return ErrorResponses.unauthorized('Authentication required');
  if (!image) return ErrorResponses.badRequest('An image is required');
  if (image.length > MAX_BASE64_CHARS) return ErrorResponses.badRequest('Image is too large');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return ErrorResponses.internalError('AI is not configured');

  // Count first (atomic), give the slot back if the call fails
  const used = await bumpUsage(clerkId, 1);
  if (used > DAILY_LIMIT) {
    await bumpUsage(clerkId, -1);
    return ErrorResponses.tooManyRequests(
      `You've used today's ${DAILY_LIMIT} photo scans. They reset tomorrow, and you can still type a meal in.`
    );
  }

  try {
    const response = await fetch(getGeminiGenerateContentUrl(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: image } },
              { text: mode === 'label' ? LABEL_PROMPT : MEAL_PROMPT },
            ],
          },
        ],
        generationConfig: getGeminiGenerationConfig({
          temperature: 0.2,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
          mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        }),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    // Token counts for cost tracking (no user content)
    console.log('meal-photo-analysis usage:', JSON.stringify(data?.usageMetadata ?? {}));

    const raw = parseGeminiJsonFromResponse(data);
    const notFood = raw.notFood === true;
    const confidence = Math.min(1, num(raw.confidence, 1));
    const mealName =
      typeof raw.mealName === 'string' && raw.mealName.trim()
        ? raw.mealName.trim().slice(0, 80)
        : mode === 'label'
          ? 'Packaged food'
          : 'Meal';

    let items: { ingredient: string; amount: string; calories: number; protein: number; carbs: number; fats: number }[];
    if (mode === 'label') {
      items = notFood
        ? []
        : [
            {
              ingredient: mealName,
              amount: typeof raw.servingSize === 'string' && raw.servingSize ? raw.servingSize : '1 serving',
              calories: num(raw.calories),
              protein: num(raw.protein),
              carbs: num(raw.carbs),
              fats: num(raw.fats),
            },
          ];
    } else {
      items = (Array.isArray(raw.items) ? raw.items : [])
        .slice(0, 8)
        .map((it: Record<string, unknown>) => ({
          ingredient: String(it?.ingredient ?? '').trim().slice(0, 80),
          amount: String(it?.amount ?? '').trim().slice(0, 40) || '1 serving',
          calories: num(it?.calories),
          protein: num(it?.protein),
          carbs: num(it?.carbs),
          fats: num(it?.fats),
        }))
        .filter(it => it.ingredient);
    }

    const sum = (key: 'calories' | 'protein' | 'carbs' | 'fats') =>
      Math.round(items.reduce((s, it) => s + it[key], 0) * 10) / 10;

    return NextResponse.json({
      success: true,
      data: {
        notFood: notFood || items.length === 0,
        mealName,
        items,
        totals: {
          calories: Math.round(sum('calories')),
          protein: sum('protein'),
          carbs: sum('carbs'),
          fats: sum('fats'),
          fiber: num(raw.fiber),
          sugar: num(raw.sugar),
          sodium: Math.round(num(raw.sodium, 20000)),
        },
        confidence,
        remainingToday: Math.max(0, DAILY_LIMIT - used),
      },
    });
  } catch (error) {
    console.error('Meal photo analysis error:', error);
    await bumpUsage(clerkId, -1).catch(() => {});
    return ErrorResponses.internalError("Couldn't read that photo. Try again, or type the meal in.");
  }
}
