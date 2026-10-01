import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const db = supabaseAdmin();

  const { data: candidates, error } = await db
    .from("candidates")
    .select(
      `id, created_at, role_applied, name, email, phone, status,
       scores ( rubric_variant, c1, c2, c3, c4, c5, confidence, quotes, gates, total, band, hidden_value, probes, risks, key_insight ),
       drafts ( type, subject, body_template, brief_md ),
       emails ( type, mode, status, sent_at ),
       decisions ( decision, note, decided_at )`
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = candidates?.length ?? 0;
  const advanced = candidates?.filter((c) => c.decisions?.some((d) => d.decision === "advance")).length ?? 0;
  const declined = candidates?.filter((c) => c.decisions?.some((d) => d.decision === "decline")).length ?? 0;
  const pending = total - advanced - declined;

  const bandCounts: Record<string, number> = {
    PRIORITY_SHORTLIST: 0,
    SHORTLIST: 0,
    HOLD: 0,
    DECLINE_QUEUE: 0,
  };
  for (const c of candidates ?? []) {
    for (const s of c.scores ?? []) {
      if (s.rubric_variant === c.role_applied) {
        bandCounts[s.band] = (bandCounts[s.band] ?? 0) + 1;
      }
    }
  }

  return NextResponse.json({
    candidates: candidates ?? [],
    stats: { total, advanced, declined, pending, bandCounts },
  });
}
