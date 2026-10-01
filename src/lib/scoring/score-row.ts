import "server-only";
import type { ScoreResult, CriterionResult } from "./score";

export interface ScoreRow {
  rubric_variant: "pm" | "spm";
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  confidence: Record<string, "H" | "M" | "L">;
  quotes: Record<string, string>;
  total: number;
  hidden_value: string[];
  probes: string[];
  risks: string[];
  key_insight: string;
  gates: { experience_facts: ScoreResult["experienceFacts"] };
}

export function scoreRowToResult(row: ScoreRow): ScoreResult {
  const criterion = (key: "c1" | "c2" | "c3" | "c4" | "c5"): CriterionResult => ({
    score: row[key],
    confidence: row.confidence?.[key] ?? "L",
    quote: row.quotes?.[key] ?? "",
  });
  return {
    rubricVariant: row.rubric_variant,
    criteria: { c1: criterion("c1"), c2: criterion("c2"), c3: criterion("c3"), c4: criterion("c4"), c5: criterion("c5") },
    total: row.total,
    hiddenValue: row.hidden_value ?? [],
    probes: row.probes ?? [],
    risks: row.risks ?? [],
    keyInsight: row.key_insight ?? "",
    experienceFacts: row.gates?.experience_facts,
    model: process.env.SCORING_MODEL || "gemini-3.8-flash",
  };
}
