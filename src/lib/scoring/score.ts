import "server-only";
import { generateText } from "./model-client";
import { getRubricText } from "./rubric";
import { verifyQuote } from "./verify-quote";
import { G2_RESULT, total, type CriterionScores } from "../processing/scoring-math";

export interface CriterionResult {
  score: number;
  confidence: "H" | "M" | "L";
  quote: string;
}

export interface ExperienceFactsRaw {
  years_as_pm_or_owner: number;
  years_hands_on_ops: number;
  owned_area_without_senior_pm: boolean;
  founding_team_product_work: boolean;
}

export interface ScoreResult {
  rubricVariant: "pm" | "spm";
  criteria: Record<"c1" | "c2" | "c3" | "c4" | "c5", CriterionResult>;
  total: number;
  hiddenValue: string[];
  probes: string[];
  risks: string[];
  keyInsight: string;
  experienceFacts: ExperienceFactsRaw;
  model: string;
}

interface RawModelOutput {
  c1: { score: number; confidence: "H" | "M" | "L"; quote: string };
  c2: { score: number; confidence: "H" | "M" | "L"; quote: string };
  c3: { score: number; confidence: "H" | "M" | "L"; quote: string };
  c4: { score: number; confidence: "H" | "M" | "L"; quote: string };
  c5: { score: number; confidence: "H" | "M" | "L"; quote: string };
  hidden_value: string[];
  probes: string[];
  risks: string[];
  key_insight: string;
  experience_facts: ExperienceFactsRaw;
}

function buildSystemPrompt(variant: "pm" | "spm"): string {
  return `${getRubricText()}

You are scoring a candidate's REDACTED CV against the rubric above, for the ${variant.toUpperCase()} variant of C4 (Role Capability).

Respond with STRICT JSON only, matching exactly this shape (no markdown, no commentary):
{
  "c1": { "score": 0-4, "confidence": "H"|"M"|"L", "quote": "exact CV line" },
  "c2": { "score": 0-4, "confidence": "H"|"M"|"L", "quote": "exact CV line" },
  "c3": { "score": 0-4, "confidence": "H"|"M"|"L", "quote": "exact CV line" },
  "c4": { "score": 0-4, "confidence": "H"|"M"|"L", "quote": "exact CV line" },
  "c5": { "score": 0-4, "confidence": "H"|"M"|"L", "quote": "exact CV line" },
  "hidden_value": ["bullet with CV line", ...],
  "probes": ["probe question", ...],
  "risks": ["risk", ...],
  "key_insight": "one sentence weighing raw JD/experience fit against the pattern-based signal (Section 1) for this candidate",
  "experience_facts": {
    "years_as_pm_or_owner": number,
    "years_hands_on_ops": number,
    "owned_area_without_senior_pm": boolean,
    "founding_team_product_work": boolean
  }
}

Rules:
- Every "quote" must be an exact or near-exact substring of the CV text given. If there is no evidence, set score to 0 and quote to "no evidence in CV".
- Never infer experience that is not written in the CV.
- G2 (location) is never inferred from the CV; it is handled outside this response.`;
}

export async function scoreCandidate(
  cvTextRedacted: string,
  rubricVariant: "pm" | "spm"
): Promise<ScoreResult> {
  const systemPrompt = buildSystemPrompt(rubricVariant);
  let raw: RawModelOutput | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2 && !raw; attempt++) {
    try {
      const text = await generateText(systemPrompt, cvTextRedacted, { json: true });
      raw = JSON.parse(text) as RawModelOutput;
    } catch (err) {
      lastError = err;
      raw = null;
    }
  }

  if (!raw) {
    throw new Error(`Scoring failed after retry: ${String(lastError)}`);
  }

  const criteria: Record<"c1" | "c2" | "c3" | "c4" | "c5", CriterionResult> = {
    c1: toVerifiedCriterion(raw.c1, cvTextRedacted),
    c2: toVerifiedCriterion(raw.c2, cvTextRedacted),
    c3: toVerifiedCriterion(raw.c3, cvTextRedacted),
    c4: toVerifiedCriterion(raw.c4, cvTextRedacted),
    c5: toVerifiedCriterion(raw.c5, cvTextRedacted),
  };

  const risks = [...(raw.risks ?? [])];
  for (const [key, c] of Object.entries(criteria) as [string, CriterionResult][]) {
    if (c.quote !== "no evidence in CV" && !verifyQuote(c.quote, cvTextRedacted)) {
      risks.push(`unverified quote (${key})`);
    }
  }

  const scores: CriterionScores = {
    c1: criteria.c1.score,
    c2: criteria.c2.score,
    c3: criteria.c3.score,
    c4: criteria.c4.score,
    c5: criteria.c5.score,
  };

  return {
    rubricVariant,
    criteria,
    total: total(scores),
    hiddenValue: raw.hidden_value ?? [],
    probes: raw.probes ?? [],
    risks,
    keyInsight: raw.key_insight ?? "",
    experienceFacts: raw.experience_facts,
    model: process.env.SCORING_MODEL || "gemini-3.8-flash",
  };
}

function toVerifiedCriterion(
  c: { score: number; confidence: "H" | "M" | "L"; quote: string },
  cvText: string
): CriterionResult {
  if (c.quote === "no evidence in CV") return { score: 0, confidence: c.confidence, quote: c.quote };
  if (!verifyQuote(c.quote, cvText)) {
    return { score: 0, confidence: c.confidence, quote: c.quote };
  }
  return c;
}

export const G2 = G2_RESULT;
