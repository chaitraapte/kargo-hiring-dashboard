export type RoleApplied = "pm" | "spm";
export type Band = "PRIORITY_SHORTLIST" | "SHORTLIST" | "HOLD" | "DECLINE_QUEUE";

export interface ScoreRow {
  rubric_variant: RoleApplied;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  confidence: Record<string, "H" | "M" | "L">;
  quotes: Record<string, string>;
  gates: { g1_status: string; g1_reason: string; g2: { flag: string } };
  total: number;
  band: Band;
  hidden_value: string[];
  probes: string[];
  risks: string[];
  key_insight: string;
}

export interface DraftRow {
  type: "invite" | "decline";
  subject: string;
  body_template: string;
  brief_md: string;
}

export interface EmailRow {
  type: "invite" | "decline";
  mode: "dry" | "live";
  status: string;
  sent_at: string;
}

export interface DecisionRow {
  decision: "advance" | "hold" | "decline";
  note: string | null;
  decided_at: string;
}

export interface CandidateRow {
  id: string;
  created_at: string;
  role_applied: RoleApplied;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  scores: ScoreRow[];
  drafts: DraftRow[];
  emails: EmailRow[];
  decisions: DecisionRow[];
}

export interface Stats {
  total: number;
  advanced: number;
  declined: number;
  pending: number;
  bandCounts: Record<Band, number>;
}
