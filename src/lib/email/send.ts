import "server-only";
import { Resend } from "resend";
import { supabaseAdmin } from "../supabase/server";
import { generateDraft } from "../drafting/draft";
import type { ScoreResult } from "../scoring/score";

export interface SendResult {
  ok: boolean;
  reason?: string;
  emailId?: string;
}

/**
 * The one guarded send path, shared by single-card buttons and the batch
 * decline action. Order matters: no email call happens before a verified
 * decision row exists, and a duplicate send for the same (candidate, type)
 * is rejected before either a decision or a send is attempted.
 */
export async function guardedSend(params: {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  roleApplied: "pm" | "spm";
  type: "invite" | "decline";
  decision: "advance" | "decline";
  note?: string;
  score: ScoreResult;
}): Promise<SendResult> {
  const db = supabaseAdmin();
  const { candidateId, type } = params;

  // 1. No row already exists in `emails` for this (candidate, type).
  const { data: existingEmail } = await db
    .from("emails")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("type", type)
    .maybeSingle();
  if (existingEmail) {
    return { ok: false, reason: `An email of type "${type}" was already sent to this candidate.` };
  }

  // 2. Insert the decision row.
  const { data: decisionRow, error: decisionError } = await db
    .from("decisions")
    .insert({ candidate_id: candidateId, decision: params.decision, note: params.note ?? null })
    .select("id")
    .single();
  if (decisionError || !decisionRow) {
    return { ok: false, reason: `Failed to record decision: ${decisionError?.message}` };
  }

  // 3. Re-read and verify the decision row actually exists.
  const { data: verifyRow, error: verifyError } = await db
    .from("decisions")
    .select("id, decision")
    .eq("id", decisionRow.id)
    .single();
  if (verifyError || !verifyRow || verifyRow.decision !== params.decision) {
    return { ok: false, reason: "Decision row could not be verified after insert." };
  }

  // 4. Ensure a draft of the needed type exists; generate on demand.
  const { data: draftRow } = await db
    .from("drafts")
    .select("subject, body_template, brief_md")
    .eq("candidate_id", candidateId)
    .eq("type", type)
    .maybeSingle();

  let subject: string;
  let bodyTemplate: string;
  if (draftRow) {
    subject = draftRow.subject;
    bodyTemplate = draftRow.body_template;
  } else {
    const generated = await generateDraft(type, params.roleApplied, params.score);
    subject = generated.subject;
    bodyTemplate = generated.bodyTemplate;
    await db.from("drafts").upsert(
      {
        candidate_id: candidateId,
        type,
        subject,
        body_template: bodyTemplate,
        brief_md: generated.briefMd,
      },
      { onConflict: "candidate_id,type" }
    );
  }

  const firstName = params.candidateName.split(/\s+/)[0] || params.candidateName;
  const body = bodyTemplate.replaceAll("{{first_name}}", firstName);

  // 5. Send the email — dry-run by default.
  const mode = (process.env.EMAIL_MODE === "live" ? "live" : "dry") as "live" | "dry";
  const to = mode === "live" ? params.candidateEmail : process.env.TEST_RECIPIENT!;
  const subjectForSend = mode === "dry" ? `[DRY RUN -> ${params.candidateEmail}] ${subject}` : subject;

  let resendId: string | undefined;
  let status: "sent" | "failed" = "sent";
  let error: string | undefined;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM || "onboarding@resend.dev",
      to,
      subject: subjectForSend,
      text: body,
    });
    if (result.error) {
      status = "failed";
      error = result.error.message;
    } else {
      resendId = result.data?.id;
    }
  } catch (err) {
    status = "failed";
    error = String(err);
  }

  // 6. Write the result to `emails`, success or failure, never dropped silently.
  const { data: emailRow } = await db
    .from("emails")
    .insert({
      candidate_id: candidateId,
      type,
      mode,
      resend_id: resendId ?? null,
      status,
      error: error ?? null,
    })
    .select("id")
    .single();

  if (status === "failed") {
    return { ok: false, reason: error, emailId: emailRow?.id };
  }
  return { ok: true, emailId: emailRow?.id };
}

export async function recordHold(candidateId: string, note?: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("decisions").insert({ candidate_id: candidateId, decision: "hold", note: note ?? null });
  if (error) throw new Error(`Failed to record hold: ${error.message}`);
}
