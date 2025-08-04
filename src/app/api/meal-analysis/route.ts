import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter for local development
const rateLimitMap = new Map<string, { count: number; date: string }>();

const mealAnalysisRateLimiter = {
  canMakeRequest: (userId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const userData = rateLimitMap.get(userId);

    if (!userData || userData.date !== today) {
      rateLimitMap.set(userId, { count: 1, date: today });
      return true;
    }

    if (userData.count >= 20) {
      return false;
    }

    userData.count++;
    return true;
  },
  getUsageInfo: (userId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const userData = rateLimitMap.get(userId);
    const count = userData && userData.date === today ? userData.count : 0;
    return { count, remaining: Math.max(0, 20 - count), date: today };
  },
};

export async function POST(request: NextRequest) {
  const maxRetries = 3;
  let lastError: Error | null = null;

  // Read request body once before retry loop
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { foodDescription, portionSize = '100g', userId } = requestBody;

  // Rate limiting check
  if (!userId) {
    return NextResponse.json({ error: 'User ID is required for rate limiting' }, { status: 400 });
  }

  if (!mealAnalysisRateLimiter.canMakeRequest(userId)) {
    const usageInfo = mealAnalysisRateLimiter.getUsageInfo(userId);
    return NextResponse.json(
      {
        error: 'Daily meal analysis limit reached. You can analyze 20 meals per day.',
        rateLimitInfo: {
          used: usageInfo.count,
          remaining: usageInfo.remaining,
          resetDate: usageInfo.date,
        },
      },
      { status: 429 }
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`=== MEAL ANALYSIS API CALLED (Attempt ${attempt}/${maxRetries}) ===`);
      console.log('Processing meal analysis request');

      if (!foodDescription) {
        return NextResponse.json({ error: 'Food description is required' }, { status: 400 });
      }

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
      }

      const prompt = `Analyze this food item and return nutrition facts in JSON format ONLY. Do not include any other text, explanations, or markdown formatting.

Food: ${foodDescription}
Portion: ${portionSize}

Return ONLY a valid JSON object with this exact structure:
{
  "calories": number,
  "protein": number,
  "carbs": number,
  "fats": number,
  "fiber": number,
  "sugar": number,
  "sodium": number,
  "confidence": number (0-1),
  "suggestions": ["food1", "food2", "food3"],
  "notes": "string with additional nutrition info"
}

Be accurate and realistic with the values. Do not include any text before or after the JSON object.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 500,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response structure from Gemini API');
      }

      const responseText = data.candidates[0].content.parts[0].text.trim();

      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const nutritionData = JSON.parse(jsonMatch[0]);

      // Validate the response structure
      const requiredFields = [
        'calories',
        'protein',
        'carbs',
        'fats',
        'fiber',
        'sugar',
        'sodium',
        'confidence',
      ];
      for (const field of requiredFields) {
        if (typeof nutritionData[field] !== 'number') {
          throw new Error(`Missing or invalid field: ${field}`);
        }
      }

      console.log('=== MEAL ANALYSIS SUCCESS ===');
      console.log('Nutrition data:', nutritionData);

      return NextResponse.json({
        success: true,
        data: nutritionData,
      });
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      lastError = error as Error;

      if (attempt === maxRetries) {
        console.error('=== MEAL ANALYSIS FAILED AFTER ALL RETRIES ===');
        return NextResponse.json(
          {
            error: 'Failed to analyze meal after multiple attempts',
            details: lastError.message,
          },
          { status: 500 }
        );
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
