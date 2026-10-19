# Fortia — Meal Analysis Cost Analysis

**Model:** `gemini-3.6-flash` (via `GEMINI_MODEL` env var)  
**Endpoint:** `POST /api/meal-analysis`  
**Date:** August 2026

---

## What Each Request Sends

| Component | Details |
|-----------|---------|
| Model | `GEMINI_MODEL` (default `gemini-3.6-flash`) |
| Input | Fixed system prompt (~155 tokens) + food name + portion |
| Output cap | `maxOutputTokens: 500` |
| Thinking | `thinkingLevel: 'minimal'` (via `getGeminiGenerationConfig`) |
| Retries | Up to 3 attempts on failure (each retry = another billed API call) |
| Rate limit | 20 analyses per user per day |

---

## Measured Token Usage (Live Tests)

| Food example | Input tokens | Output tokens | Total |
|--------------|-------------|---------------|-------|
| chicken breast, 100g | 168 | 146 | 314 |
| In-N-Out Double Double with fries | 173 | 186 | 359 |
| Homemade pasta plate (long description) | 177 | 162 | 339 |
| **Typical average** | **~170** | **~165** | **~335** |

Food name length barely moves the needle — the fixed JSON prompt dominates input size.

### Why `minimal` thinking matters for cost

| Config | Input | Output (billable) | Result |
|--------|-------|-------------------|--------|
| **With `minimal` thinking** (current) | ~168 | ~146 | Works, ~$0.0015/meal |
| **Without thinking config** (old bug) | ~155 | 479 thinking + 17 text = 496 | Truncated JSON, ~3× more expensive, fails |

Google bills **thinking tokens at the output rate**, so the old setup was both broken and expensive.

---

## Gemini 3.6 Flash Pricing

Source: [Google AI Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

### Standard tier (real-time API — current setup)

| | Price per 1M tokens |
|--|---------------------|
| Input | **$1.50** |
| Output (includes thinking) | **$7.50** |

### Batch / Flex (50% off, async — not used today)

| | Price per 1M tokens |
|--|---------------------|
| Input | $0.75 |
| Output | $3.75 |

### Free tier

$0, but Google may use content to improve products.

---

## Cost Per Successful Meal Request

Using measured averages: **170 input + 165 output tokens**

### Standard tier

```
Input:  170 × $1.50 / 1,000,000 = $0.000255
Output: 165 × $7.50 / 1,000,000 = $0.001238
─────────────────────────────────────────────
Total per meal:                  ≈ $0.0015
                                 ≈ 0.15¢ per meal
```

### Batch/Flex tier (if switched)

```
≈ $0.00075 per meal (≈ 0.075¢)
```

---

## Cost at Scale

| Scenario | Meals | Cost (Standard) | Cost (Batch/Flex) |
|----------|-------|-----------------|-------------------|
| 1 meal logged | 1 | **$0.0015** | $0.00075 |
| 1 user, daily max (20/day) | 20 | **$0.030** | $0.015 |
| 1 user, ~3 meals/day avg | 90/mo | **$0.13/mo** | $0.07/mo |
| 1,000 active users × 3 meals/day | 90,000/mo | **~$135/mo** | ~$68/mo |
| 10,000 active users × 3 meals/day | 900,000/mo | **~$1,350/mo** | ~$675/mo |

---

## Hidden Cost Multipliers

1. **Re-analyze before save** — each tap in the modal counts as a new API call (and against the 20/day limit).
2. **Retries (up to 3×)** — a failing request can cost **3×** before returning an error. With the old thinking bug, that's ~$0.0045 per failed meal attempt.
3. **Recipe analysis** — similar prompt/token profile in `/api/recipe-analysis`, roughly the same cost per analyze.

---

## Business Context vs App Pricing

Planned premium tiers: **$4.99–$19.99/month**

| Metric | Value |
|--------|-------|
| AI cost per heavy user (20 analyses/day) | ~$0.90/month |
| AI cost per average user (3 meals/day) | ~$0.13/month |
| AI as % of $9.99 Pro plan | **~1–9%** |

The 20/day rate limit caps worst-case spend at **~$0.90/user/month** on meal analysis alone.

---

## Recommendations

| Priority | Action | Impact |
|----------|--------|--------|
| Keep | `thinkingLevel: 'minimal'` | ~3× cheaper + reliable JSON |
| Consider | Log `usageMetadata` from Gemini responses | Exact per-request cost tracking |
| Consider | `gemini-3.5-flash-lite` for meal analysis | ~$0.30/$2.50 per 1M — could drop cost ~80% if quality holds |
| Watch | Re-analyze UX | Users hammering "re-analyze" burns quota and money |
| Optional | Batch API for non-real-time flows | 50% savings (not suitable for live modal UX) |

---

## Bottom Line

A successful meal analysis costs about **0.15¢** on Standard tier with the current config — roughly **$0.0015 per request**, or **~$0.13/month per average user** logging 3 meals/day.
