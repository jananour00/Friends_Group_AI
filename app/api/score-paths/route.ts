import { NextRequest, NextResponse } from "next/server";
import { scorePaths } from "@/lib/pipeline/scoring";
import type { NarrativeOutput, ResolvedPremise } from "@/types/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { narratives, resolved_premises }: { narratives: NarrativeOutput; resolved_premises: ResolvedPremise[] } = await req.json();
    const scores = scorePaths(narratives, resolved_premises);
    return NextResponse.json(scores);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Score-paths error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
-e 
export const runtime = "nodejs";
export const maxDuration = 30;
