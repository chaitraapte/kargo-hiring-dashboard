import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { guardedSend, recordHold } from "@/lib/email/send";
import type { ScoreResult, CriterionResult } from "@/lib/scoring/score";

export const maxDuration = 30;

function toScoreResult(row: {
  rubric_variant: "pm" | "spm";
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  confidence: Record<string, "H" | "M" | "L">;
  quotes: Record<string, string>;
  total: number;
  hidden_value: string[];
  probes: string[];
  risks: string[];
  key_insight: string;
  gates: { experience_facts: ScoreResult["experienceFacts"] };
}): ScoreResult {
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

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { candidateId, action, note } = body as {
    candidateId: string;
    action: "advance" | "hold" | "decline";
    note?: string;
  };

  const { data: candidate, error: candidateError } = await db
    .from("candidates")
    .select("id, name, email, role_applied, scores(*)")
    .eq("id", candidateId)
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json({ ok: false, reason: "Candidate not found" }, { status: 404 });
  }

  if (action === "hold") {
    await recordHold(candidateId, note);
    await db.from("candidates").update({ status: "held" }).eq("id", candidateId);
    return NextResponse.json({ ok: true });
  }

  const scoreRow = candidate.scores?.find((s: { rubric_variant: string }) => s.rubric_variant === candidate.role_applied) ?? candidate.scores?.[0];
  if (!scoreRow) {
    return NextResponse.json({ ok: false, reason: "No score found for this candidate" }, { status: 400 });
  }
  const score = toScoreResult(scoreRow);

  const type = action === "advance" ? "invite" : "decline";
  const result = await guardedSend({
    candidateId,
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    roleApplied: candidate.role_applied,
    type,
    decision: action,
    note,
    score,
  });

  if (result.ok) {
    await db
      .from("candidates")
      .update({ status: action === "advance" ? "advanced" : "declined" })
      .eq("id", candidateId);
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
