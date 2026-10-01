import "server-only";
import { generateText } from "../scoring/model-client";
import type { ScoreResult } from "../scoring/score";

export interface DraftResult {
  briefMd: string;
  subject: string;
  bodyTemplate: string; // contains {{first_name}}, never the real name
}

const SYSTEM_PROMPT = `You write two things for a hiring pipeline at Kargo, a logistics SaaS company:
1. An interview brief in markdown: the top probes to ask, risks to watch for, and any hidden value worth exploring.
2. One email draft (invite or decline, as instructed).

You will NEVER be told or see the candidate's real name. Use the literal placeholder {{first_name}} wherever a name would go.

Invite emails: warm, specific to the role (PM or SPM) and to something genuine in the candidate's background, with a line about scheduling.
Decline emails: courteous, specific to the role, brief. They must NEVER mention scores, criteria, rubric, bands, or reasons for the decision.

Respond with STRICT JSON only: { "brief_md": "...", "subject": "...", "body": "..." }`;

export async function generateDraft(
  type: "invite" | "decline",
  roleApplied: "pm" | "spm",
  score: ScoreResult
): Promise<DraftResult> {
  const userContent = JSON.stringify({
    draft_type: type,
    role_applied: roleApplied,
    band: null,
    why_ranked_here_inputs: {
      probes: score.probes,
      risks: score.risks,
      hidden_value: score.hiddenValue,
      key_insight: score.keyInsight,
    },
  });

  const text = await generateText(SYSTEM_PROMPT, userContent, { json: true });
  const parsed = JSON.parse(text) as { brief_md: string; subject: string; body: string };

  return {
    briefMd: parsed.brief_md,
    subject: parsed.subject,
    bodyTemplate: parsed.body,
  };
}
