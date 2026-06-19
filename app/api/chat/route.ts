import { NextRequest, NextResponse } from "next/server";
import type { PipelineState } from "@/types/pipeline";
import { callLLMJSON, callLLM } from "@/lib/pipeline/llm-client";
import {
  EXTRACTION_PROMPT,
  CHECKPOINT_SELECTION_PROMPT,
  CHECKPOINT_RESOLUTION_PROMPTS,
  NARRATIVE_GENERATION_PROMPT,
  STANCE_PROMPT,
} from "@/lib/pipeline/prompts";
import {
  ExtractionSchema,
  CheckpointSelectionSchema,
  NarrativeSchema,
  StanceSchema,
} from "@/lib/schemas";
import { scorePaths, totalScore } from "@/lib/pipeline/scoring";
import type {
  ExtractionOutput,
  CheckpointSelectionOutput,
  ResolvedPremise,
  NarrativeOutput,
  ScoringOutput,
  StanceOutput,
  CheckpointType,
} from "@/types/pipeline";

// ─── Step 1: Extract values and signals ──────────────────────────────────────
async function runExtraction(raw_input: string): Promise<ExtractionOutput> {
  const result = await callLLMJSON<ExtractionOutput>({
    provider: "auto",
    systemPrompt: EXTRACTION_PROMPT,
    userMessage: raw_input,
    maxTokens: 800,
    temperature: 0.2,
  });
  const parsed = ExtractionSchema.safeParse(result);
  if (!parsed.success) throw new Error(`Extraction validation: ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data as ExtractionOutput;
}

// ─── Step 2: Select next checkpoint ──────────────────────────────────────────
async function runCheckpointSelection(
  extraction: ExtractionOutput,
  resolved_premises: ResolvedPremise[]
): Promise<CheckpointSelectionOutput> {
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

Select the next checkpoint to resolve. Return null if all signals are resolved.`.trim();

  const result = await callLLMJSON<CheckpointSelectionOutput>({
    provider: "auto",
    systemPrompt: CHECKPOINT_SELECTION_PROMPT,
    userMessage,
    maxTokens: 300,
    temperature: 0.1,
  });
  const parsed = CheckpointSelectionSchema.safeParse(result);
  if (!parsed.success) throw new Error(`Checkpoint selection validation: ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data as CheckpointSelectionOutput;
}

// ─── Step 3a: Get checkpoint question (Groq for speed) ───────────────────────
async function runGetQuestion(
  checkpoint_type: CheckpointType,
  extraction: ExtractionOutput,
  raw_input: string
): Promise<string> {
  const systemPrompt = CHECKPOINT_RESOLUTION_PROMPTS[checkpoint_type as string];
  if (!systemPrompt) throw new Error(`No prompt for checkpoint type: ${checkpoint_type}`);

  const userMessage = `
The person's original statement:
"${raw_input}"

Key values I've extracted: ${extraction.values.join(", ")}
Key priorities: ${extraction.priorities.join(", ")}

Write your question now (in character, 2-3 sentences max, no preamble):`.trim();

  // Use Groq for speed on question generation; fall back to Gemini if no Groq key
  const provider = "auto";
  return callLLM({ provider, systemPrompt, userMessage, maxTokens: 200, temperature: 0.7 });
}

// ─── Step 3b: Resolve premise from user answer ────────────────────────────────
async function runResolvePremise(
  checkpoint_type: CheckpointType,
  question_asked: string,
  user_response: string
): Promise<string> {
  const resolvePrompt = `You are a decision clarity system. Given a checkpoint question and the user's response, extract a single clear resolved premise.

A resolved premise is a concrete, specific fact about this person's situation that is now established as true. It must be stated as a declarative sentence (not a question). It must be specific enough to constrain the narratives that follow.

Return ONLY a JSON object: {"resolved_premise": "one clear sentence stating what is now known to be true"}`;

  const userMessage = `
Checkpoint type: ${checkpoint_type}
Question asked: "${question_asked}"
User's response: "${user_response}"

Extract the resolved premise.`.trim();

  const result = await callLLMJSON<{ resolved_premise: string }>({
    provider: "auto",
    systemPrompt: resolvePrompt,
    userMessage,
    maxTokens: 200,
    temperature: 0.1,
  });
  return result.resolved_premise;
}

// ─── Step 4: Generate narratives ──────────────────────────────────────────────
async function runNarratives(
  raw_input: string,
  resolved_premises: ResolvedPremise[]
): Promise<NarrativeOutput> {
  const premisesText = resolved_premises
    .map((p, i) => `${i + 1}. ${p.resolved_premise}`)
    .join("\n");

  const userMessage = `
ORIGINAL SITUATION:
"${raw_input}"

RESOLVED PREMISES (established facts — treat these as hard constraints, not context):
${premisesText || "None — use the situation directly."}

Generate two paths for this person.`.trim();

  const result = await callLLMJSON<NarrativeOutput>({
    provider: "auto",
    systemPrompt: NARRATIVE_GENERATION_PROMPT,
    userMessage,
    maxTokens: 1200,
    temperature: 0.4,
  });
  const parsed = NarrativeSchema.safeParse(result);
  if (!parsed.success) throw new Error(`Narrative validation: ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data as NarrativeOutput;
}

// ─── Step 6: Generate stance ──────────────────────────────────────────────────
async function runStance(
  narratives: NarrativeOutput,
  scores: ScoringOutput
): Promise<StanceOutput> {
  const scoreA = totalScore(scores.path_a);
  const scoreB = totalScore(scores.path_b);

  const userMessage = `
PATH A: ${narratives.path_a_label}
Narrative: "${narratives.path_a.body}"
Flip condition (from Step 4): "${narratives.path_a.flip_condition}"
Total score: ${scoreA}/100
Dimension scores: Financial ${scores.path_a.financial}/5, Growth ${scores.path_a.growth}/5, Values ${scores.path_a.values}/5, Social ${scores.path_a.social}/5, Stability ${scores.path_a.stability}/5

PATH B: ${narratives.path_b_label}
Narrative: "${narratives.path_b.body}"
Flip condition (from Step 4): "${narratives.path_b.flip_condition}"
Total score: ${scoreB}/100
Dimension scores: Financial ${scores.path_b.financial}/5, Growth ${scores.path_b.growth}/5, Values ${scores.path_b.values}/5, Social ${scores.path_b.social}/5, Stability ${scores.path_b.stability}/5

Deliver the lean, flip condition, and handback.`.trim();

  const result = await callLLMJSON<StanceOutput>({
    provider: "auto",
    systemPrompt: STANCE_PROMPT,
    userMessage,
    maxTokens: 400,
    temperature: 0.3,
  });
  const parsed = StanceSchema.safeParse(result);
  if (!parsed.success) throw new Error(`Stance validation: ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data as StanceOutput;
}

// ─── MAIN PIPELINE ORCHESTRATOR ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { state, user_message }: { state: PipelineState; user_message?: string } =
      await req.json();

    let nextState: PipelineState = { ...state, resolved_premises: [...(state.resolved_premises ?? [])] };
    let responseMessage: {
      content: string;
      persona?: string;
      type?: string;
      metadata?: unknown;
    } | null = null;

    // ── PHASE: initial input ────────────────────────────────────────────────────
    if (nextState.phase === "input" && user_message) {
      nextState.raw_input = user_message;

      const extraction = await runExtraction(user_message);
      nextState.extraction = extraction;
      nextState.phase = "checkpoint_loop";

      const checkpoint = await runCheckpointSelection(extraction, []);
      nextState.current_checkpoint = checkpoint;

      if (!checkpoint.checkpoint_type) {
        nextState.phase = "narratives";
      } else {
        const question = await runGetQuestion(checkpoint.checkpoint_type, extraction, user_message);
        nextState.pending_question = question;
        nextState.pending_checkpoint_type = checkpoint.checkpoint_type;
        nextState.phase = "awaiting_user";
        responseMessage = { content: question, persona: "The Listener", type: "text" };
      }
    }

    // ── PHASE: awaiting user answer to a checkpoint question ────────────────────
    else if (nextState.phase === "awaiting_user" && user_message) {
      const resolved_premise = await runResolvePremise(
        nextState.pending_checkpoint_type as CheckpointType,
        nextState.pending_question ?? "",
        user_message
      );

      nextState.resolved_premises = [
        ...nextState.resolved_premises,
        {
          checkpoint_type: nextState.pending_checkpoint_type as CheckpointType,
          question_asked: nextState.pending_question ?? "",
          user_response: user_message,
          resolved_premise,
        },
      ];

      const extraction = nextState.extraction as ExtractionOutput;
      const nextCheckpoint = await runCheckpointSelection(extraction, nextState.resolved_premises as ResolvedPremise[]);

      if (!nextCheckpoint.checkpoint_type) {
        nextState.phase = "narratives";
        nextState.current_checkpoint = null;
        nextState.pending_question = null;
        nextState.pending_checkpoint_type = null;
      } else {
        nextState.current_checkpoint = nextCheckpoint;
        const question = await runGetQuestion(
          nextCheckpoint.checkpoint_type,
          extraction,
          nextState.raw_input
        );
        nextState.pending_question = question;
        nextState.pending_checkpoint_type = nextCheckpoint.checkpoint_type;
        nextState.phase = "awaiting_user";
        responseMessage = { content: question, persona: "The Listener", type: "text" };
      }
    }

    // ── PHASE: generate narratives + scores + stance in one shot ────────────────
    if (nextState.phase === "narratives") {
      const narratives = await runNarratives(
        nextState.raw_input,
        nextState.resolved_premises as ResolvedPremise[]
      );
      nextState.narratives = narratives;

      // Step 5 — deterministic, no LLM
      const scores = scorePaths(narratives, nextState.resolved_premises as ResolvedPremise[]);
      nextState.scores = scores;

      // Step 6 — stance
      const stance = await runStance(narratives, scores);
      nextState.stance = stance;
      nextState.phase = "done";

      // Return narratives+scores as first message; stance will come as second via client timer
      responseMessage = {
        content: "Here's how I see your two paths.",
        persona: "The Analyst",
        type: "narratives",
        metadata: { narratives, scores },
      };
    }

    return NextResponse.json({ state: nextState, message: responseMessage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat pipeline error:", message);
    return NextResponse.json(
      { error: "Pipeline failed", detail: message },
      { status: 500 }
    );
  }
}

// Force Node.js runtime — required for multi-step LLM pipeline
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow up to 60s for the full pipeline
