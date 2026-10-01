import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { guardedSend, recordHold } from "@/lib/email/send";
import { scoreRowToResult, type ScoreRow } from "@/lib/scoring/score-row";

export const maxDuration = 30;

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

  const scoreRow = (candidate.scores as ScoreRow[] | undefined)?.find(
    (s) => s.rubric_variant === candidate.role_applied
  ) ?? (candidate.scores as ScoreRow[] | undefined)?.[0];
  if (!scoreRow) {
    return NextResponse.json({ ok: false, reason: "No score found for this candidate" }, { status: 400 });
  }
  const score = scoreRowToResult(scoreRow);

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
