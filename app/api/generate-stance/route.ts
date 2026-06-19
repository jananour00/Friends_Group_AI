import { NextRequest, NextResponse } from "next/server";
import { callLLMJSON } from "@/lib/pipeline/llm-client";
import { STANCE_PROMPT } from "@/lib/pipeline/prompts";
import { StanceSchema } from "@/lib/schemas";
import type { NarrativeOutput, ScoringOutput, StanceOutput } from "@/types/pipeline";
import { totalScore } from "@/lib/pipeline/scoring";

export async function POST(req: NextRequest) {
  try {
    const { narratives, scores }: { narratives: NarrativeOutput; scores: ScoringOutput } = await req.json();
    const scoreA = totalScore(scores.path_a);
    const scoreB = totalScore(scores.path_b);
    const userMessage = `PATH A: ${narratives.path_a_label}\nNarrative: "${narratives.path_a.body}"\nFlip condition: "${narratives.path_a.flip_condition}"\nTotal score: ${scoreA}/100\nDimensions: Financial ${scores.path_a.financial}/5, Growth ${scores.path_a.growth}/5, Values ${scores.path_a.values}/5, Social ${scores.path_a.social}/5, Stability ${scores.path_a.stability}/5\n\nPATH B: ${narratives.path_b_label}\nNarrative: "${narratives.path_b.body}"\nFlip condition: "${narratives.path_b.flip_condition}"\nTotal score: ${scoreB}/100\nDimensions: Financial ${scores.path_b.financial}/5, Growth ${scores.path_b.growth}/5, Values ${scores.path_b.values}/5, Social ${scores.path_b.social}/5, Stability ${scores.path_b.stability}/5\n\nDeliver the lean, flip condition, and handback.`;
    const result = await callLLMJSON<StanceOutput>({ provider: "gemini", systemPrompt: STANCE_PROMPT, userMessage, maxTokens: 400, temperature: 0.3 });
    const parsed = StanceSchema.safeParse(result);
    if (!parsed.success) return NextResponse.json({ error: "Schema validation failed", details: parsed.error.issues }, { status: 422 });
    return NextResponse.json(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Generate-stance error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
-e 
export const runtime = "nodejs";
export const maxDuration = 30;
