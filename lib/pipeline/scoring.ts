import type { NarrativeOutput, ScoringOutput, DimensionScores, ResolvedPremise } from "@/types/pipeline";

const KEYWORDS: Record<keyof DimensionScores, { pos: string[]; neg: string[] }> = {
  financial: {
    pos: ["salary", "compensation", "equity", "raise", "income", "financial", "pay", "bonus", "profit", "earn", "money", "wealth"],
    neg: ["debt", "risk", "uncertain", "variable", "less money", "pay cut", "reduced", "lower salary", "broke"],
  },
  growth: {
    pos: ["learn", "grow", "skill", "develop", "advance", "opportunity", "challenge", "expand", "new", "experience", "leadership", "mentor", "progress"],
    neg: ["stuck", "plateau", "stagnant", "same", "routine", "limit", "ceiling", "no room", "bored"],
  },
  values: {
    pos: ["purpose", "meaning", "impact", "passion", "mission", "align", "authentic", "believe", "care", "matter", "fulfil"],
    neg: ["compromise", "against", "conflict", "drain", "hollow", "empty", "wrong", "misalign"],
  },
  social: {
    pos: ["team", "connect", "relationship", "community", "friend", "family", "support", "network", "colleague", "partner", "belong"],
    neg: ["alone", "isolat", "remote", "distant", "disconnect", "leave behind", "lose touch"],
  },
  stability: {
    pos: ["stable", "security", "safe", "certain", "reliable", "consistent", "predictable", "established", "proven", "steady"],
    neg: ["unstable", "uncertain", "risk", "volatile", "unpredictable", "fail", "startup risk", "unknown"],
  },
};

function scoreText(text: string, kw: { pos: string[]; neg: string[] }): number {
  const lower = text.toLowerCase();
  const pos = kw.pos.filter((k) => lower.includes(k)).length;
  const neg = kw.neg.filter((k) => lower.includes(k)).length;
  let score = 3;
  if (pos >= 3) score += 1;
  else if (pos >= 1) score += 0.5;
  if (neg >= 2) score -= 1;
  else if (neg >= 1) score -= 0.5;
  return Math.max(1, Math.min(5, Math.round(score)));
}

function premiseDelta(premises: ResolvedPremise[], kw: { pos: string[]; neg: string[] }): number {
  if (!premises.length) return 0;
  const text = premises.map((p) => p.resolved_premise).join(" ").toLowerCase();
  const pos = kw.pos.filter((k) => text.includes(k)).length;
  const neg = kw.neg.filter((k) => text.includes(k)).length;
  return pos - neg; // positive = helps path B (opportunity), negative = hurts
}

export function scorePaths(narratives: NarrativeOutput, resolved_premises: ResolvedPremise[]): ScoringOutput {
  const dims = Object.keys(KEYWORDS) as Array<keyof DimensionScores>;
  const path_a = {} as DimensionScores;
  const path_b = {} as DimensionScores;
  const reasoning = {} as ScoringOutput["reasoning"];

  for (const dim of dims) {
    const kw = KEYWORDS[dim];
    const baseA = scoreText(narratives.path_a.body, kw);
    const baseB = scoreText(narratives.path_b.body, kw);
    const delta = premiseDelta(resolved_premises, kw);

    // Premises bias toward the challenging path (path B) if positive signals
    path_a[dim] = Math.max(1, Math.min(5, baseA + (delta < 0 ? delta : 0)));
    path_b[dim] = Math.max(1, Math.min(5, baseB + (delta > 0 ? delta : 0)));

    reasoning[dim] = {
      a: `Score ${path_a[dim]}/5 — ${kw.pos.filter((k) => narratives.path_a.body.toLowerCase().includes(k)).slice(0, 2).join(", ") || "no strong signals"}`,
      b: `Score ${path_b[dim]}/5 — ${kw.pos.filter((k) => narratives.path_b.body.toLowerCase().includes(k)).slice(0, 2).join(", ") || "no strong signals"}`,
    };
  }

  return { path_a, path_b, reasoning };
}

export function totalScore(scores: DimensionScores, weights?: Partial<DimensionScores>): number {
  const w = { financial: 1, growth: 1, values: 1, social: 1, stability: 1, ...weights };
  const weighted = (Object.keys(w) as Array<keyof DimensionScores>).reduce((s, k) => s + scores[k] * w[k], 0);
  const max = 5 * (Object.values(w).reduce((s, v) => s + v, 0));
  return Math.round((weighted / max) * 100);
}
