/**
 * Smoke test: one generateContent call to Gemini (same model as meal-analysis).
 * Run from fortia-api root: npm run test:gemini
 * Loads .env then .env.local (same idea as Next.js; local overrides).
 */
const path = require('path');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
require('dotenv').config({ path: path.join(root, '.env.local'), override: true });

async function main() {
	const key = process.env.GEMINI_API_KEY;
	if (!key) {
		console.error('Missing GEMINI_API_KEY in .env or .env.local');
		process.exit(1);
	}

	const model = process.env.GEMINI_MODEL;
	if (!model) {
		console.error('Missing GEMINI_MODEL in .env or .env.local');
		process.exit(1);
	}

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			contents: [
				{
					parts: [{ text: 'Reply with exactly: ok' }],
				},
			],
			generationConfig: {
				temperature: 0,
				maxOutputTokens: 32,
				...(model.startsWith('gemini-3')
					? { thinkingConfig: { thinkingLevel: 'minimal' } }
					: {}),
			},
		}),
	});

	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = null;
	}

	if (!res.ok) {
		console.error('Gemini request failed:', res.status, res.statusText);
		console.error('Body:', text.slice(0, 2000));
		process.exit(1);
	}

	const reply =
		json?.candidates?.[0]?.content?.parts
			?.filter((part) => part.text && !part.thought)
			?.map((part) => part.text)
			?.join('')
			?.trim() ?? '(no text)';
	console.log('OK — Gemini responded:', reply);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
