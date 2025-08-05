import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function extractJson(text: string): string | null {
  // Remove markdown code blocks if present
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // Find JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.substring(start, end + 1);
  }

  return null;
}

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isLastAttempt = attempt === maxRetries;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isOverloaded =
        errorMessage.includes('overloaded') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('429') ||
        errorMessage.includes('rate limit');

      if (isLastAttempt || !isOverloaded) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(
        `Gemini API overloaded, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function POST(request: NextRequest) {
  try {
    console.log('Recipe breakdown API called');

    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const body = await request.json();

    const { videoUrl } = body;
    if (!videoUrl) {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const prompt = `Return ONLY a valid JSON object for this recipe. No explanations, no markdown, just pure JSON:

{
  "video_title": "Recipe Title Here",
  "video_url": "${videoUrl}",
  "ingredients": [
    {
      "name": "Ingredient Name",
      "quantity": "Amount",
      "macronutrients": {
        "calories": 100,
        "protein_g": 5,
        "carbs_g": 15,
        "fat_g": 2
      }
    }
  ],
  "instructions": [
    "Step 1 instruction",
    "Step 2 instruction"
  ],
  "total_macronutrients": {
    "calories": 500,
    "protein_g": 25,
    "carbs_g": 75,
    "fat_g": 10
  }
}`;

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    console.log('Calling Gemini API...');

    // Use retry logic for the Gemini API call
    const response = await retryWithBackoff(async () => {
      const res = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2000,
            topP: 0.8,
            topK: 40,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Gemini API error response:', errorText);
        throw new Error(`Gemini API error: ${res.status} - ${errorText}`);
      }

      return res;
    });

    console.log('Gemini API response status:', response.status);

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let result;
    try {
      const jsonString = extractJson(text);
      if (!jsonString) {
        throw new Error('No JSON found in response');
      }
      result = JSON.parse(jsonString);
    } catch (e) {
      console.error('Parse error:', e);
      result = { error: 'Failed to parse response', raw: text };
    }

    console.log('Final result:', result);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Recipe breakdown error:', error);

    // Provide specific error messages for different scenarios
    let errorMessage = 'Failed to analyze recipe breakdown';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes('overloaded')) {
        errorMessage = 'Gemini API is temporarily overloaded. Please try again in a few minutes.';
        statusCode = 503; // Service Unavailable
      } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
        errorMessage = 'API rate limit exceeded. Please try again later.';
        statusCode = 429; // Too Many Requests
      } else if (error.message.includes('API key')) {
        errorMessage = 'Invalid API key configuration.';
        statusCode = 500;
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: statusCode }
    );
  }
}
