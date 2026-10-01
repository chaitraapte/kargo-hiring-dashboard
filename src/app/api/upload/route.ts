import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/extraction/extract";
import { redactCv } from "@/lib/redaction/redact";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runScoringPipeline } from "@/lib/processing/pipeline";
import { generateDraft } from "@/lib/drafting/draft";
import type { Band } from "@/lib/processing/scoring-math";

export const maxDuration = 60;

function draftTypeForBand(band: Band): "invite" | "decline" {
  if (band === "PRIORITY_SHORTLIST" || band === "SHORTLIST") return "invite";
  return "decline"; // HOLD defaults to decline draft until Arjun picks a side
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const roleApplied = formData.get("role") as "pm" | "spm" | null;

    if (!file || !roleApplied) {
      return NextResponse.json({ stage: "validate", error: "file and role are required" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const buffer = Buffer.from(await file.arrayBuffer());

    // --- Stage: extraction + redaction ---
    const rawText = await extractText(buffer, file.name);
    const { redacted, contact } = redactCv(rawText);

    const storagePath = `${roleApplied}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await db.storage.from("cvs").upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
    });
    if (uploadError) {
      return NextResponse.json({ stage: "storage", error: uploadError.message }, { status: 500 });
    }

    // Dedupe on email: update the existing candidate row on re-upload.
    const { data: candidate, error: upsertError } = await db
      .from("candidates")
      .upsert(
        {
          role_applied: roleApplied,
          name: contact.name,
          email: contact.email ?? `unknown-${Date.now()}@no-email.invalid`,
          phone: contact.phone,
          cv_path: storagePath,
          cv_text_redacted: redacted,
          status: "scoring",
        },
        { onConflict: "email" }
      )
      .select("id, name, email, role_applied")
      .single();

    if (upsertError || !candidate) {
      return NextResponse.json({ stage: "db", error: upsertError?.message ?? "upsert failed" }, { status: 500 });
    }

    // --- Stage: scoring ---
    let pipeline;
    try {
      pipeline = await runScoringPipeline(redacted, roleApplied);
    } catch (err) {
      await db.from("candidates").update({ status: "needs_review" }).eq("id", candidate.id);
      return NextResponse.json(
        { stage: "scoring", error: String(err), candidateId: candidate.id },
        { status: 200 }
      );
    }

    const outcomes = [pipeline.primary, ...(pipeline.secondary ? [pipeline.secondary] : [])];
    for (const outcome of outcomes) {
      const c = outcome.score.criteria;
      await db.from("scores").upsert(
        {
          candidate_id: candidate.id,
          rubric_variant: outcome.score.rubricVariant,
          c1: c.c1.score,
          c2: c.c2.score,
          c3: c.c3.score,
          c4: c.c4.score,
          c5: c.c5.score,
          confidence: {
            c1: c.c1.confidence,
            c2: c.c2.confidence,
            c3: c.c3.confidence,
            c4: c.c4.confidence,
            c5: c.c5.confidence,
          },
          quotes: { c1: c.c1.quote, c2: c.c2.quote, c3: c.c3.quote, c4: c.c4.quote, c5: c.c5.quote },
          gates: {
            g1_status: outcome.g1Status,
            g1_reason: outcome.g1Reason,
            g2: pipeline.g2,
            experience_facts: outcome.score.experienceFacts,
          },
          total: outcome.score.total,
          band: outcome.band,
          hidden_value: outcome.score.hiddenValue,
          probes: outcome.score.probes,
          risks: outcome.score.risks,
          key_insight: outcome.score.keyInsight,
          model: outcome.score.model,
        },
        { onConflict: "candidate_id,rubric_variant" }
      );
    }

    // --- Stage: drafting ---
    try {
      const draftType = draftTypeForBand(pipeline.primary.band);
      const draft = await generateDraft(draftType, roleApplied, pipeline.primary.score);
      await db.from("drafts").upsert(
        {
          candidate_id: candidate.id,
          type: draftType,
          subject: draft.subject,
          body_template: draft.bodyTemplate,
          brief_md: draft.briefMd,
        },
        { onConflict: "candidate_id,type" }
      );
    } catch (err) {
      await db.from("candidates").update({ status: "needs_review" }).eq("id", candidate.id);
      return NextResponse.json(
        { stage: "drafting", error: String(err), candidateId: candidate.id },
        { status: 200 }
      );
    }

    await db.from("candidates").update({ status: "scored" }).eq("id", candidate.id);

    return NextResponse.json({
      stage: "done",
      candidateId: candidate.id,
      band: pipeline.primary.band,
      total: pipeline.primary.score.total,
    });
  } catch (err) {
    return NextResponse.json({ stage: "unknown", error: String(err) }, { status: 500 });
  }
}
