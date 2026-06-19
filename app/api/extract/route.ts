import { NextRequest, NextResponse } from "next/server";
import { callLLMJSON } from "@/lib/pipeline/llm-client";
import { EXTRACTION_PROMPT } from "@/lib/pipeline/prompts";
import { ExtractionSchema } from "@/lib/schemas";
import type { ExtractionOutput } from "@/types/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { raw_input } = await req.json();
    if (!raw_input || typeof raw_input !== "string") {
      return NextResponse.json({ error: "raw_input is required" }, { status: 400 });
    }
    const result = await callLLMJSON<ExtractionOutput>({
      provider: "gemini",
      systemPrompt: EXTRACTION_PROMPT,
      userMessage: raw_input,
      maxTokens: 800,
      temperature: 0.2,
    });
    const parsed = ExtractionSchema.safeParse(result);
    if (!parsed.success) {
      return NextResponse.json({ error: "Schema validation failed", details: parsed.error.issues }, { status: 422 });
    }
    return NextResponse.json(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Extract error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
-e 
export const runtime = "nodejs";
export const maxDuration = 30;
