// ─── LLM Client ───────────────────────────────────────────────────────────────
// Primary:  Groq  (llama-3.3-70b-versatile) — fast, generous free tier
// Fallback: Gemini 1.5 Flash                — if Groq fails
// Groq free tier: 14,400 req/day, 6000 tokens/min
// Gemini 1.5 Flash free tier: 1500 req/day, 1M tokens/min

// ⚠️  Model used is gemini-1.5-flash, NOT gemini-2.0-flash.
//     gemini-2.0-flash has limit:0 on most free API keys.

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export type LLMProvider = "gemini" | "groq" | "auto";

interface LLMCallOptions {
  provider?: LLMProvider;   // default: "auto" (Groq first, Gemini fallback)
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

// ─── Strip markdown fences ────────────────────────────────────────────────────
function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/gim, "")
    .replace(/```\s*$/gim, "")
    .trim();
}

// ─── Pull first JSON object/array out of free-form text ──────────────────────
function extractJSON(raw: string): string {
  const stripped = stripFences(raw);
  const match = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return match ? match[1] : stripped;
}

// ─── Groq call ────────────────────────────────────────────────────────────────
async function callGroq(options: LLMCallOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",   // best quality on Groq free tier
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user",   content: options.userMessage },
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens:  options.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq ${res.status}: ${txt.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty content");
  return text.trim();
}

// ─── Gemini call (1.5-flash, NOT 2.0-flash) ──────────────────────────────────
async function callGemini(options: LLMCallOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: options.userMessage }] }],
      generationConfig: {
        temperature:     options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 1024,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data?.candidates?.[0]?.finishReason === "SAFETY")
    throw new Error("Gemini safety block");

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini empty response: ${JSON.stringify(data).slice(0, 200)}`);
  return text.trim();
}

// ─── Public: callLLM ──────────────────────────────────────────────────────────
// provider "auto" = try Groq first, fall back to Gemini on any error
export async function callLLM(options: LLMCallOptions): Promise<string> {
  const provider = options.provider ?? "auto";

  if (provider === "groq") {
    return stripFences(await callGroq(options));
  }
  if (provider === "gemini") {
    return stripFences(await callGemini(options));
  }

  // "auto" — Groq first, Gemini fallback
  try {
    return stripFences(await callGroq(options));
  } catch (groqErr) {
    console.warn("Groq failed, falling back to Gemini:", (groqErr as Error).message);
    return stripFences(await callGemini(options));
  }
}

// ─── Public: callLLMJSON ──────────────────────────────────────────────────────
export async function callLLMJSON<T>(
  options: LLMCallOptions,
  retries = 2
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await callLLM(options);
      return JSON.parse(extractJSON(raw)) as T;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`LLM JSON attempt ${attempt + 1}/${retries + 1} failed: ${msg}`);

      // If it's a 429 rate-limit, wait before retrying
      if (msg.includes("429")) {
        const waitMs = 15_000 * (attempt + 1);
        console.log(`Rate limit hit — waiting ${waitMs / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, waitMs));
      } else if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("LLM call failed after all retries");
}
