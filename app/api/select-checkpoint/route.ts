import { NextRequest, NextResponse } from "next/server";
import { callLLMJSON } from "@/lib/pipeline/llm-client";
import { CHECKPOINT_SELECTION_PROMPT } from "@/lib/pipeline/prompts";
import { CheckpointSelectionSchema } from "@/lib/schemas";
import type { ExtractionOutput, ResolvedPremise, CheckpointSelectionOutput } from "@/types/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { extraction, resolved_premises }: { extraction: ExtractionOutput; resolved_premises: ResolvedPremise[] } = await req.json();
    const alreadyResolved = resolved_premises.map((p) => p.checkpoint_type).filter(Boolean);

    const userMessage = `
EXTRACTION:
Values: ${extraction.values.join(", ")}
Priorities: ${extraction.priorities.join(", ")}
Signals:
  - contradiction: ${extraction.signals.contradiction}
  - repetition: ${extraction.signals.repetition.join(", ") || "none"}
  - bundling: ${extraction.signals.bundling}
  - hedging: ${extraction.signals.hedging}
  - omission: ${extraction.signals.omission.join(", ") || "none"}

ALREADY RESOLVED (do NOT select these again): ${alreadyResolved.join(", ") || "none"}

Select the next checkpoint to resolve.`.trim();

    const result = await callLLMJSON<CheckpointSelectionOutput>({
      provider: "gemini",
      systemPrompt: CHECKPOINT_SELECTION_PROMPT,
      userMessage,
      maxTokens: 300,
      temperature: 0.1,
    });
    const parsed = CheckpointSelectionSchema.safeParse(result);
    if (!parsed.success) {
      return NextResponse.json({ error: "Schema validation failed", details: parsed.error.issues }, { status: 422 });
    }
    return NextResponse.json(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Select-checkpoint error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
-e 
export const runtime = "nodejs";
export const maxDuration = 30;
