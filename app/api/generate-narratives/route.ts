import { NextRequest, NextResponse } from "next/server";
import { callLLMJSON } from "@/lib/pipeline/llm-client";
import { NARRATIVE_GENERATION_PROMPT } from "@/lib/pipeline/prompts";
import { NarrativeSchema } from "@/lib/schemas";
import type { ResolvedPremise, NarrativeOutput } from "@/types/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { raw_input, resolved_premises }: { raw_input: string; resolved_premises: ResolvedPremise[] } = await req.json();
    const premisesText = resolved_premises.map((p, i) => `${i + 1}. ${p.resolved_premise}`).join("\n");
    const userMessage = `ORIGINAL SITUATION:\n"${raw_input}"\n\nRESOLVED PREMISES (hard constraints):\n${premisesText || "None."}\n\nGenerate two paths.`;
    const result = await callLLMJSON<NarrativeOutput>({ provider: "gemini", systemPrompt: NARRATIVE_GENERATION_PROMPT, userMessage, maxTokens: 1200, temperature: 0.4 });
    const parsed = NarrativeSchema.safeParse(result);
    if (!parsed.success) return NextResponse.json({ error: "Schema validation failed", details: parsed.error.issues }, { status: 422 });
    return NextResponse.json(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Generate-narratives error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
-e 
export const runtime = "nodejs";
export const maxDuration = 30;
