import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter for local development
const exerciseRateLimitMap = new Map<string, { count: number; date: string }>();

const exerciseAnalysisRateLimiter = {
  canMakeRequest: (userId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const userData = exerciseRateLimitMap.get(userId);

    if (!userData || userData.date !== today) {
      exerciseRateLimitMap.set(userId, { count: 1, date: today });
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
    const userData = exerciseRateLimitMap.get(userId);
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
    console.log('Exercise analysis request received');
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { exerciseDescription, duration, userId } = requestBody;

  // Rate limiting check
  if (!userId) {
    return NextResponse.json({ error: 'User ID is required for rate limiting' }, { status: 400 });
  }

  if (!exerciseAnalysisRateLimiter.canMakeRequest(userId)) {
    const usageInfo = exerciseAnalysisRateLimiter.getUsageInfo(userId);
    return NextResponse.json(
      {
        error: 'Daily exercise analysis limit reached. You can analyze 20 exercises per day.',
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
      console.log(`=== EXERCISE ANALYSIS API CALLED (Attempt ${attempt}/${maxRetries}) ===`);
      console.log('Processing exercise analysis request');

      if (!exerciseDescription) {
        return NextResponse.json({ error: 'Exercise description is required' }, { status: 400 });
      }

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
      }

      const prompt = `Analyze this exercise and estimate calories burned in JSON format ONLY. Do not include any other text, explanations, or markdown formatting.

Exercise: ${exerciseDescription}
Duration: ${duration}

Return ONLY a valid JSON object with this exact structure:
{
  "calories_burned": number,
  "confidence": number (0-1),
  "notes": "string with additional exercise info or recommendations"
}

Be realistic with the calorie estimates. Consider the exercise type, intensity, and duration. Do not include any text before or after the JSON object.`;

      // Gemini API request
      const geminiRequestBody = {
        contents: [
          {
            parts: [
              {
                text: `You are a fitness expert. Provide accurate calorie burn estimates in JSON format only. ${prompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 300,
        },
      };

      console.log('Sending request to Gemini API...');

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(geminiRequestBody),
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

      const exerciseData = JSON.parse(jsonMatch[0]);

      // Validate the response structure
      const requiredFields = ['calories_burned', 'confidence'];
      for (const field of requiredFields) {
        if (typeof exerciseData[field] !== 'number') {
          throw new Error(`Missing or invalid field: ${field}`);
        }
      }

      console.log('=== EXERCISE ANALYSIS SUCCESS ===');
      // Don't log exercise data as it contains user information
      if (process.env.NODE_ENV === 'development') {
        console.log('Exercise analysis completed successfully');
      }

      return NextResponse.json({
        success: true,
        data: exerciseData,
      });
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      lastError = error as Error;

      if (attempt === maxRetries) {
        console.error('=== EXERCISE ANALYSIS FAILED AFTER ALL RETRIES ===');
        return NextResponse.json(
          {
            error: 'Failed to analyze exercise after multiple attempts',
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
