import { NextRequest, NextResponse } from "next/server";
import { callLLM, callLLMJSON } from "@/lib/pipeline/llm-client";
import { CHECKPOINT_RESOLUTION_PROMPTS } from "@/lib/pipeline/prompts";
import type { CheckpointType, ExtractionOutput } from "@/types/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { checkpoint_type, extraction, raw_input, mode, user_response, question_asked }: {
      checkpoint_type: CheckpointType;
      extraction: ExtractionOutput;
      raw_input: string;
      mode: "ask" | "resolve";
      user_response?: string;
      question_asked?: string;
    } = await req.json();

    if (!checkpoint_type) return NextResponse.json({ error: "checkpoint_type required" }, { status: 400 });
    const systemPrompt = CHECKPOINT_RESOLUTION_PROMPTS[checkpoint_type as string];
    if (!systemPrompt) return NextResponse.json({ error: `Unknown checkpoint type: ${checkpoint_type}` }, { status: 400 });

    if (mode === "ask") {
      const userMessage = `The person's original statement:\n"${raw_input}"\n\nKey values: ${extraction.values.join(", ")}\nKey priorities: ${extraction.priorities.join(", ")}\n\nWrite your question now:`;
      const provider = process.env.GROQ_API_KEY ? "groq" : "gemini";
      const question = await callLLM({ provider, systemPrompt, userMessage, maxTokens: 200, temperature: 0.7 });
      return NextResponse.json({ question });
    }

    if (mode === "resolve") {
      const resolvePrompt = `Extract a single resolved premise from the user's answer. Return ONLY JSON: {"resolved_premise": "one clear declarative sentence stating what is now known to be true about this person's situation"}`;
      const userMessage = `Checkpoint type: ${checkpoint_type}\nQuestion asked: "${question_asked}"\nUser's response: "${user_response}"\n\nExtract the resolved premise.`;
      const result = await callLLMJSON<{ resolved_premise: string }>({ provider: "gemini", systemPrompt: resolvePrompt, userMessage, maxTokens: 200, temperature: 0.1 });
      return NextResponse.json({ resolved_premise: result.resolved_premise });
    }

    return NextResponse.json({ error: "mode must be ask or resolve" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Resolve-checkpoint error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
-e 
export const runtime = "nodejs";
export const maxDuration = 30;
