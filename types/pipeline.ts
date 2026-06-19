// ─── Step 1: Extraction ───────────────────────────────────────────────────────
export interface ExtractionSignals {
  contradiction: boolean;
  repetition: string[];
  bundling: boolean;
  hedging: boolean;
  omission: string[];
}

export interface ExtractionOutput {
  values: string[];
  priorities: string[];
  signals: ExtractionSignals;
}

// ─── Step 2: Checkpoint Selection ────────────────────────────────────────────
export type CheckpointType =
  | "contradiction"
  | "repetition"
  | "bundling"
  | "hedging"
  | "omission"
  | null;

export interface CheckpointSelectionOutput {
  checkpoint_type: CheckpointType;
  reason: string;
  confidence: "high" | "medium" | "low";
}

// ─── Step 3: Checkpoint Resolution ───────────────────────────────────────────
export interface ResolvedPremise {
  checkpoint_type: CheckpointType;
  question_asked: string;
  user_response: string;
  resolved_premise: string;
}

// ─── Step 4: Narrative Generation ────────────────────────────────────────────
export interface PathNarrative {
  body: string;
  flip_condition: string;
}

export interface NarrativeOutput {
  path_a: PathNarrative;
  path_b: PathNarrative;
  path_a_label: string;
  path_b_label: string;
}

// ─── Step 5: Scoring (deterministic) ─────────────────────────────────────────
export interface DimensionScores {
  financial: number;    // 1-5
  growth: number;       // 1-5
  values: number;       // 1-5
  social: number;       // 1-5
  stability: number;    // 1-5
}

export interface ScoringOutput {
  path_a: DimensionScores;
  path_b: DimensionScores;
  reasoning: Record<keyof DimensionScores, { a: string; b: string }>;
}

// ─── Step 6: Stance + Handback ───────────────────────────────────────────────
export interface StanceOutput {
  lean: string;
  flip_condition: string;
  handback: string;
}

// ─── Full Pipeline State ──────────────────────────────────────────────────────
export interface PipelineState {
  raw_input: string;
  extraction: ExtractionOutput | null;
  resolved_premises: ResolvedPremise[];
  current_checkpoint: CheckpointSelectionOutput | null;
  narratives: NarrativeOutput | null;
  scores: ScoringOutput | null;
  stance: StanceOutput | null;
  phase:
    | "input"
    | "checkpoint_loop"
    | "awaiting_user"
    | "narratives"
    | "scores"
    | "stance"
    | "done";
  pending_question: string | null;
  pending_checkpoint_type: CheckpointType;
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
export type PersonaName = "The Listener" | "The Analyst" | "The Advisor";

export interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
  persona?: PersonaName;
  type?: "text" | "narratives" | "scores" | "stance" | "typing";
  metadata?: Record<string, unknown>;
  timestamp: number;
}
