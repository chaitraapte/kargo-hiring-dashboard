import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureDraft } from "@/lib/email/send";
import { scoreRowToResult, type ScoreRow } from "@/lib/scoring/score-row";

export const maxDuration = 30;

/** Returns the personalized email draft for a candidate, generating it on demand — no side effects beyond saving the draft. */
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const { candidateId, type } = (await req.json()) as {
    candidateId: string;
    type: "invite" | "decline";
  };

  const { data: candidate, error } = await db
    .from("candidates")
    .select("name, role_applied, scores(*)")
    .eq("id", candidateId)
    .single();

  if (error || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const scoreRow = (candidate.scores as ScoreRow[] | undefined)?.find(
    (s) => s.rubric_variant === candidate.role_applied
  ) ?? (candidate.scores as ScoreRow[] | undefined)?.[0];
  if (!scoreRow) {
    return NextResponse.json({ error: "No score found for this candidate" }, { status: 400 });
  }

  const { subject, bodyTemplate } = await ensureDraft({
    candidateId,
    roleApplied: candidate.role_applied,
    type,
    score: scoreRowToResult(scoreRow),
  });

  const firstName = candidate.name.split(/\s+/)[0] || candidate.name;
  const body = bodyTemplate.replaceAll("{{first_name}}", firstName);

  return NextResponse.json({ subject, body });
}
