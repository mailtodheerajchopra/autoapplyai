/**
 * Groq fallback tier — an open-source-hosted model (Llama 3.3 70B by default)
 * that absorbs discovery scans when BOTH Gemini tiers are quota-exhausted.
 * Free API key from console.groq.com; OpenAI-compatible REST with JSON mode.
 * The chain becomes: gemini-3.8-flash → gemini-3.5-flash → groq/llama → mock.
 */
import { deepSanitize } from './gemini.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export function groqEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function groqModelName(): string {
  return `groq/${GROQ_MODEL}`;
}

/**
 * Runs the discovery prompt against Groq and returns the parsed raw job array
 * (already sanitized with the same deepSanitize used for Gemini payloads).
 * Throws on any failure so the caller can degrade to the mock tier.
 */
export async function groqDiscoverJobs(
  prompt: string,
  systemInstruction: string,
  timeoutMs = 30_000,
): Promise<Array<Record<string, unknown>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          // Same prompt as the Gemini tier, plus an object-wrapping contract —
          // json_object mode requires the root to be an object, not an array.
          { role: 'user', content: prompt + '\n\nReturn ONLY a JSON object of shape {"jobs": [ ...the job array... ]}.' },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`groq http ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = JSON.parse(await res.text()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content) as { jobs?: unknown };
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    return deepSanitize(jobs) as Array<Record<string, unknown>>;
  } finally {
    clearTimeout(timer);
  }
}
