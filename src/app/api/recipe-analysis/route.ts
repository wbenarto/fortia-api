import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: Request) {
	const maxRetries = 3;
	let lastError: Error | null = null;

	// Read request body once before retry loop
	let requestBody;
	try {
		requestBody = await request.json();
	} catch (parseError) {
		console.error('Failed to parse request body:', parseError);
		return Response.json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { ingredients, userId } = requestBody;

	// Rate limiting check
	if (!userId) {
		return Response.json({ error: 'User ID is required for rate limiting' }, { status: 400 });
	}

	if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
		return Response.json({ error: 'Ingredients array is required' }, { status: 400 });
	}

	// Validate ingredients format
	for (const ingredient of ingredients) {
		if (!ingredient.ingredient || !ingredient.amount) {
			return Response.json({ error: 'Each ingredient must have ingredient and amount' }, { status: 400 });
		}
	}

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			if (!GEMINI_API_KEY) {
				return Response.json({ error: 'Gemini API key not configured' }, { status: 500 });
			}

			// Create optimized prompt for minimal token usage
			const ingredientsList = ingredients
				.map(ing => `${ing.ingredient} ${ing.amount}`)
				.join(', ');

			const prompt = `Analyze total macronutrients for: ${ingredientsList}

Return JSON only:
{
  "calories": number,
  "protein": number,
  "carbs": number,
  "fats": number,
  "fiber": number,
  "sugar": number,
  "sodium": number,
  "confidence": number
}`;

			// Gemini API request
			const geminiRequestBody = {
				contents: [
					{
						parts: [
							{
								text: `You are a nutrition expert. Provide accurate nutrition information in JSON format only. ${prompt}`,
							},
						],
					},
				],
				generationConfig: {
					temperature: 0.3,
					maxOutputTokens: 500,
				},
			};

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

			console.log('Gemini API response status:', response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Gemini API error response:', errorText);

				// Handle specific Gemini API errors
				if (response.status === 503) {
					throw new Error(
						'Gemini API is temporarily unavailable. Please try again in a few minutes.'
					);
				} else if (response.status === 429) {
					throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
				} else if (response.status === 400) {
					throw new Error('Invalid request to Gemini API. Please check your input.');
				} else {
					throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
				}
			}

			const data = await response.json();
			const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

			if (!content) {
				throw new Error('No response from Gemini');
			}

			console.log('Raw Gemini response content:', content);

			// Parse the JSON response
			let nutritionData;
			let extractedJson = null;

			// Strategy 1: Look for JSON between backticks (markdown code blocks) - most common
			try {
				// Try different code block patterns
				let codeBlockMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
				if (!codeBlockMatch) {
					codeBlockMatch = content.match(/```\s*(\{[\s\S]*?\})\s*```/);
				}
				if (!codeBlockMatch) {
					codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
				}
				if (!codeBlockMatch) {
					codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/);
				}
				
				if (codeBlockMatch) {
					extractedJson = JSON.parse(codeBlockMatch[1]);
					console.log('Successfully extracted JSON from code block');
				}
			} catch (codeBlockError) {
				console.error('Code block extraction failed:', codeBlockError);
			}

			// Strategy 2: Try to parse the content directly
			if (!extractedJson) {
				try {
					extractedJson = JSON.parse(content);
					console.log('Successfully parsed JSON directly');
				} catch (directError) {
					console.error('Direct JSON parse failed:', directError);
				}
			}

			// Strategy 3: Look for JSON object with regex
			if (!extractedJson) {
				try {
					const jsonMatch = content.match(/\{[\s\S]*\}/);
					if (jsonMatch) {
						extractedJson = JSON.parse(jsonMatch[0]);
						console.log('Successfully extracted JSON with regex');
					}
				} catch (regexError) {
					console.error('Regex extraction failed:', regexError);
				}
			}

			// Strategy 4: Look for JSON after "JSON:" or similar prefixes
			if (!extractedJson) {
				try {
					const prefixMatch = content.match(/(?:JSON|json|Response|response):\s*(\{[\s\S]*\})/);
					if (prefixMatch) {
						extractedJson = JSON.parse(prefixMatch[1]);
						console.log('Successfully extracted JSON with prefix match');
					}
				} catch (prefixError) {
					console.error('Prefix extraction failed:', prefixError);
				}
			}

			if (!extractedJson) {
				console.error('Raw content that failed to parse:', content);
				throw new Error('Could not extract valid JSON from response');
			}

			nutritionData = extractedJson;

			// Validate required fields
			const requiredFields = ['calories', 'protein', 'carbs', 'fats', 'fiber', 'sugar', 'sodium', 'confidence'];
			for (const field of requiredFields) {
				if (typeof nutritionData[field] !== 'number') {
					throw new Error(`Invalid ${field} value: expected number, got ${typeof nutritionData[field]}`);
				}
			}

			// Ensure confidence is between 0 and 1
			if (nutritionData.confidence < 0 || nutritionData.confidence > 1) {
				nutritionData.confidence = Math.max(0, Math.min(1, nutritionData.confidence));
			}

			// Ensure all values are non-negative
			const numericFields = ['calories', 'protein', 'carbs', 'fats', 'fiber', 'sugar', 'sodium'];
			for (const field of numericFields) {
				if (nutritionData[field] < 0) {
					nutritionData[field] = 0;
				}
			}

			return Response.json({
				success: true,
				data: nutritionData
			});

		} catch (error) {
			console.error(`Recipe analysis attempt ${attempt} failed:`, error);
			lastError = error as Error;

			// If this is the last attempt, return the error
			if (attempt === maxRetries) {
				return Response.json(
					{
						error: lastError.message || 'Failed to analyze recipe after multiple attempts',
					},
					{ status: 500 }
				);
			}

			// Wait before retrying (exponential backoff)
			const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	// This should never be reached, but just in case
	return Response.json(
		{ error: 'Unexpected error in recipe analysis' },
		{ status: 500 }
	);
}
