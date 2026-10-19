type GeminiGenerationConfig = {
	temperature?: number;
	maxOutputTokens?: number;
	topP?: number;
	topK?: number;
	thinkingConfig?: { thinkingLevel?: string };
};

type GeminiPart = {
	text?: string;
	thought?: boolean;
};

type GeminiResponse = {
	candidates?: Array<{
		content?: {
			parts?: GeminiPart[];
		};
	}>;
};

export function getGeminiModel(): string {
	const model = process.env.GEMINI_MODEL;
	if (!model) {
		throw new Error('GEMINI_MODEL is not configured');
	}
	return model;
}

export function getGeminiGenerateContentUrl(apiKey: string): string {
	return `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${apiKey}`;
}

export function getGeminiGenerationConfig(
	overrides: GeminiGenerationConfig = {}
): GeminiGenerationConfig {
	const config: GeminiGenerationConfig = { ...overrides };

	if (/^gemini-3/i.test(getGeminiModel())) {
		config.thinkingConfig = {
			thinkingLevel: 'minimal',
			...config.thinkingConfig,
		};
	}

	return config;
}

export function extractGeminiResponseText(data: unknown): string {
	const parts = (data as GeminiResponse)?.candidates?.[0]?.content?.parts;

	if (!parts?.length) {
		throw new Error('Invalid response structure from Gemini API');
	}

	const responseText = parts
		.filter(part => part.text && !part.thought)
		.map(part => part.text as string)
		.join('')
		.trim();

	if (!responseText) {
		throw new Error('Empty response from Gemini API');
	}

	return responseText;
}

export function parseGeminiJsonFromResponse(data: unknown): Record<string, unknown> {
	const responseText = extractGeminiResponseText(data);
	const jsonMatch = responseText.match(/\{[\s\S]*\}/);

	if (!jsonMatch) {
		throw new Error('No JSON found in response');
	}

	return JSON.parse(jsonMatch[0]);
}
