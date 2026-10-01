import "server-only";
import {
  bandFor,
  evaluateG1,
  G2_RESULT,
  type ExperienceFacts,
  type Band,
  type GateStatus,
} from "./scoring-math";
import { scoreCandidate, type ScoreResult } from "../scoring/score";

export interface VariantOutcome {
  score: ScoreResult;
  g1Status: GateStatus;
  g1Reason: string;
  band: Band;
  routeToOtherRubric?: "pm" | "spm";
}

export interface PipelineResult {
  primary: VariantOutcome;
  secondary?: VariantOutcome; // when routed to both PM and SPM
  g2: typeof G2_RESULT;
}

function experienceFactsFrom(score: ScoreResult): ExperienceFacts {
  const f = score.experienceFacts;
  return {
    yearsAsPmOrOwner: f.years_as_pm_or_owner,
    yearsHandsOnOps: f.years_hands_on_ops,
    ownedAreaWithoutSeniorPm: f.owned_area_without_senior_pm,
  };
}

async function scoreVariant(cvText: string, variant: "pm" | "spm"): Promise<VariantOutcome> {
  const score = await scoreCandidate(cvText, variant);
  const facts = experienceFactsFrom(score);
  const g1 = evaluateG1(variant, facts, score.criteria.c1.score, score.criteria.c2.score);
  const band = bandFor(score.total, g1.status === "fail");
  return {
    score,
    g1Status: g1.status,
    g1Reason: g1.reason,
    band,
    routeToOtherRubric: g1.routeToOtherRubric,
  };
}

/**
 * Runs scoring for the applied role, and applies G3 routing: if G1 flags a
 * near-miss that routes to the other rubric, or the candidate is senior
 * enough to warrant cross-scoring, score the second variant too.
 */
export async function runScoringPipeline(
  cvTextRedacted: string,
  roleApplied: "pm" | "spm"
): Promise<PipelineResult> {
  const primary = await scoreVariant(cvTextRedacted, roleApplied);

  let secondary: VariantOutcome | undefined;
  if (primary.routeToOtherRubric) {
    secondary = await scoreVariant(cvTextRedacted, primary.routeToOtherRubric);
  } else if (
    roleApplied === "pm" &&
    primary.score.experienceFacts.years_as_pm_or_owner >= 5 &&
    primary.score.criteria.c4.score >= 2
  ) {
    // PM applicants with 5+ yrs PM and C4-SPM-shaped evidence are also scored on SPM.
    secondary = await scoreVariant(cvTextRedacted, "spm");
  }

  return { primary, secondary, g2: G2_RESULT };
}
