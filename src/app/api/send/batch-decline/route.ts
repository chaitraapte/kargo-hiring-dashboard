import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { guardedSend } from "@/lib/email/send";
import { scoreRowToResult, type ScoreRow as BaseScoreRow } from "@/lib/scoring/score-row";

export const maxDuration = 60;

type ScoreRow = BaseScoreRow & { band: string };

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

    const score = scoreRowToResult(scoreRow);
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
