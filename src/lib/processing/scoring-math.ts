export interface CriterionScores {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
}

export const WEIGHTS = { c1: 25, c2: 20, c3: 15, c4: 25, c5: 15 } as const;
export const ROLE_AGNOSTIC_WEIGHTS = { c1: 25, c2: 20, c3: 15, c5: 15 } as const; // max 75

export function total(scores: CriterionScores): number {
  return (
    (scores.c1 / 4) * WEIGHTS.c1 +
    (scores.c2 / 4) * WEIGHTS.c2 +
    (scores.c3 / 4) * WEIGHTS.c3 +
    (scores.c4 / 4) * WEIGHTS.c4 +
    (scores.c5 / 4) * WEIGHTS.c5
  );
}

/** Excludes the role-specific C4 criterion, out of a max of 75 — used by the rubric's own calibration table. */
export function roleAgnosticTotal(scores: Omit<CriterionScores, "c4">): number {
  return (
    (scores.c1 / 4) * ROLE_AGNOSTIC_WEIGHTS.c1 +
    (scores.c2 / 4) * ROLE_AGNOSTIC_WEIGHTS.c2 +
    (scores.c3 / 4) * ROLE_AGNOSTIC_WEIGHTS.c3 +
    (scores.c5 / 4) * ROLE_AGNOSTIC_WEIGHTS.c5
  );
}

export type Band = "PRIORITY_SHORTLIST" | "SHORTLIST" | "HOLD" | "DECLINE_QUEUE";

export function bandFor(totalScore: number, gateFailed: boolean): Band {
  if (gateFailed) return "DECLINE_QUEUE";
  if (totalScore >= 80) return "PRIORITY_SHORTLIST";
  if (totalScore >= 60) return "SHORTLIST";
  if (totalScore >= 45) return "HOLD";
  return "DECLINE_QUEUE";
}

export type GateStatus = "pass" | "flag" | "fail";

export interface ExperienceFacts {
  yearsAsPmOrOwner: number;
  yearsHandsOnOps: number;
  ownedAreaWithoutSeniorPm: boolean;
}

export interface G1Result {
  status: GateStatus;
  reason: string;
  routeToOtherRubric?: "pm" | "spm";
}

export function evaluateG1(role: "pm" | "spm", facts: ExperienceFacts, c1: number, c2: number): G1Result {
  if (role === "pm") {
    if (facts.yearsAsPmOrOwner >= 2) {
      return { status: "pass", reason: ">= 2 years owning product outcomes" };
    }
    if (facts.yearsAsPmOrOwner >= 1 && facts.yearsHandsOnOps >= 2 && c1 >= 3) {
      return {
        status: "flag",
        reason: "near-miss: 1-2 yrs PM + >= 2 yrs hands-on ops (C1 >= 3)",
      };
    }
    return { status: "fail", reason: "< 2 years owning product outcomes, no near-miss" };
  }

  // spm
  if (facts.yearsAsPmOrOwner >= 5 && facts.ownedAreaWithoutSeniorPm) {
    return { status: "pass", reason: ">= 5 years PM with an area owned without a senior PM above" };
  }
  if (facts.yearsAsPmOrOwner >= 3 && facts.yearsAsPmOrOwner < 5 && c1 >= 3 && c2 >= 3) {
    return {
      status: "flag",
      reason: "near-miss: 3-5 yrs PM + C1 >= 3 + C2 >= 3 -> route to PM rubric",
      routeToOtherRubric: "pm",
    };
  }
  return { status: "fail", reason: "< 5 years PM or never owned an area independently, no near-miss" };
}

export const G2_RESULT = { flag: "CONFIRM IN FIRST REPLY" } as const;

export function evaluateG3Routing(
  role: "pm" | "spm",
  facts: ExperienceFacts,
  c4spmEvidence: boolean
): "pm" | "spm" | "both" | null {
  if (role === "spm" && facts.yearsAsPmOrOwner < 5) return null; // handled by G1 flag routing
  if (role === "pm" && facts.yearsAsPmOrOwner >= 5 && c4spmEvidence) return "both";
  return null;
}

export interface TieBreakerInput {
  candidateId: string;
  c1: number;
  c2: number;
  hiddenValueCount: number;
  mostRecentOpsYearsAgo: number; // smaller = more recent
}

/** Higher C1 -> higher C2 -> more hidden-value items -> more recent ops exposure. */
export function compareTieBreak(a: TieBreakerInput, b: TieBreakerInput): number {
  if (a.c1 !== b.c1) return b.c1 - a.c1;
  if (a.c2 !== b.c2) return b.c2 - a.c2;
  if (a.hiddenValueCount !== b.hiddenValueCount) return b.hiddenValueCount - a.hiddenValueCount;
  return a.mostRecentOpsYearsAgo - b.mostRecentOpsYearsAgo;
}
