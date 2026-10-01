import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { guardedSend } from "@/lib/email/send";
import type { ScoreResult, CriterionResult } from "@/lib/scoring/score";

export const maxDuration = 60;

interface ScoreRow {
  rubric_variant: "pm" | "spm";
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  confidence: Record<string, "H" | "M" | "L">;
  quotes: Record<string, string>;
  total: number;
  band: string;
  hidden_value: string[];
  probes: string[];
  risks: string[];
  key_insight: string;
  gates: { experience_facts: ScoreResult["experienceFacts"] };
}

function toScoreResult(row: ScoreRow): ScoreResult {
  const criterion = (key: "c1" | "c2" | "c3" | "c4" | "c5"): CriterionResult => ({
    score: row[key],
    confidence: row.confidence?.[key] ?? "L",
    quote: row.quotes?.[key] ?? "",
  });
  return {
    rubricVariant: row.rubric_variant,
    criteria: { c1: criterion("c1"), c2: criterion("c2"), c3: criterion("c3"), c4: criterion("c4"), c5: criterion("c5") },
    total: row.total,
    hiddenValue: row.hidden_value ?? [],
    probes: row.probes ?? [],
    risks: row.risks ?? [],
    keyInsight: row.key_insight ?? "",
    experienceFacts: row.gates?.experience_facts,
    model: process.env.SCORING_MODEL || "gemini-3.8-flash",
  };
}

/** Only acts on DECLINE_QUEUE candidates with no decision recorded yet, for the given role. */
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const { role } = (await req.json()) as { role: "pm" | "spm" };

  const { data: candidates, error } = await db
    .from("candidates")
    .select("id, name, email, role_applied, scores(*), decisions(decision)")
    .eq("role_applied", role);

  if (error) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  const results: { candidateId: string; ok: boolean; reason?: string }[] = [];

  for (const candidate of candidates ?? []) {
    if ((candidate.decisions?.length ?? 0) > 0) continue; // already decided, skip

    const scoreRow = (candidate.scores as ScoreRow[] | undefined)?.find(
      (s) => s.rubric_variant === candidate.role_applied
    );
    if (!scoreRow || scoreRow.band !== "DECLINE_QUEUE") continue;

    const score = toScoreResult(scoreRow);
    const result = await guardedSend({
      candidateId: candidate.id,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      roleApplied: candidate.role_applied,
      type: "decline",
      decision: "decline",
      score,
    });

    if (result.ok) {
      await db.from("candidates").update({ status: "declined" }).eq("id", candidate.id);
    }
    results.push({ candidateId: candidate.id, ok: result.ok, reason: result.reason });
  }

  return NextResponse.json({ results });
}
