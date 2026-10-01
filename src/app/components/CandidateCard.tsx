"use client";

import { useState } from "react";
import type { CandidateRow } from "@/lib/types";

const BAND_LABEL: Record<string, string> = {
  PRIORITY_SHORTLIST: "Priority Shortlist",
  SHORTLIST: "Shortlist",
  HOLD: "Hold",
  DECLINE_QUEUE: "Decline Queue",
};

const BAND_COLOR: Record<string, string> = {
  PRIORITY_SHORTLIST: "bg-emerald-100 text-emerald-800",
  SHORTLIST: "bg-blue-100 text-blue-800",
  HOLD: "bg-amber-100 text-amber-800",
  DECLINE_QUEUE: "bg-zinc-200 text-zinc-700",
};

export function CandidateCard({ candidate, onChanged }: { candidate: CandidateRow; onChanged: () => void }) {
  const [sending, setSending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const score = candidate.scores.find((s) => s.rubric_variant === candidate.role_applied) ?? candidate.scores[0];
  const crossScore = candidate.scores.find((s) => s.rubric_variant !== candidate.role_applied);
  const inviteSent = candidate.emails.some((e) => e.type === "invite" && e.status === "sent");
  const declineSent = candidate.emails.some((e) => e.type === "decline" && e.status === "sent");
  const inviteDraft = candidate.drafts.find((d) => d.type === "invite");
  const declineDraft = candidate.drafts.find((d) => d.type === "decline");

  async function act(action: "advance" | "hold" | "decline") {
    setSending(action);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, action }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert(`Failed: ${json.reason}`);
      }
      onChanged();
    } finally {
      setSending(null);
    }
  }

  if (!score) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="font-medium">{candidate.name}</p>
        <p className="text-sm text-amber-600">Needs review — scoring did not complete.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-900">{candidate.name}</p>
          <p className="text-xs text-zinc-500">{candidate.email}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BAND_COLOR[score.band]}`}>
            {BAND_LABEL[score.band]}
          </span>
          <span className="text-sm font-mono text-zinc-700">{score.total.toFixed(1)}/100</span>
        </div>
      </div>

      {score.key_insight && (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <span className="font-medium">Key insight: </span>
          {score.key_insight}
        </div>
      )}

      {crossScore && (
        <p className="text-xs text-zinc-500">
          Cross-scored on {crossScore.rubric_variant.toUpperCase()} rubric: {crossScore.total.toFixed(1)}/100
        </p>
      )}

      <button onClick={() => setExpanded((v) => !v)} className="text-xs text-indigo-600 underline">
        {expanded ? "Hide details" : "Show scores, brief & draft"}
      </button>

      {expanded && (
        <div className="space-y-3 text-sm border-t border-zinc-100 pt-3">
          <div className="grid grid-cols-5 gap-2 text-xs">
            {(["c1", "c2", "c3", "c4", "c5"] as const).map((k) => (
              <div key={k} className="rounded bg-zinc-50 p-2">
                <p className="font-medium uppercase">{k}</p>
                <p>
                  {score[k]}/4 ({score.confidence[k]})
                </p>
                <p className="text-zinc-500 italic mt-1 line-clamp-3">&ldquo;{score.quotes[k]}&rdquo;</p>
              </div>
            ))}
          </div>
          {score.hidden_value.length > 0 && (
            <div>
              <p className="font-medium">Hidden value</p>
              <ul className="list-disc list-inside text-zinc-600">
                {score.hidden_value.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {score.probes.length > 0 && (
            <div>
              <p className="font-medium">Top probes</p>
              <ul className="list-disc list-inside text-zinc-600">
                {score.probes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            G1: {score.gates.g1_status} — {score.gates.g1_reason}. G2: {score.gates.g2.flag}
          </p>
          {(inviteDraft || declineDraft) && (
            <div className="rounded border border-zinc-200 p-2">
              <p className="font-medium">
                Draft ({score.band === "DECLINE_QUEUE" || score.band === "HOLD" ? "decline" : "invite"})
              </p>
              <p className="text-zinc-800 font-mono text-xs">
                {(score.band === "DECLINE_QUEUE" || score.band === "HOLD" ? declineDraft : inviteDraft)?.subject}
              </p>
              <p className="text-zinc-600 whitespace-pre-wrap text-xs mt-1">
                {(score.band === "DECLINE_QUEUE" || score.band === "HOLD" ? declineDraft : inviteDraft)?.body_template}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-zinc-100">
        <button
          onClick={() => act("advance")}
          disabled={inviteSent || sending !== null}
          className="flex-1 rounded bg-emerald-600 text-white text-sm py-1.5 disabled:opacity-50"
        >
          {inviteSent ? "Invite sent" : sending === "advance" ? "Sending…" : "Advance & send invite"}
        </button>
        <button
          onClick={() => act("hold")}
          disabled={sending !== null}
          className="flex-1 rounded bg-amber-500 text-white text-sm py-1.5 disabled:opacity-50"
        >
          {sending === "hold" ? "Saving…" : "Hold"}
        </button>
        <button
          onClick={() => act("decline")}
          disabled={declineSent || sending !== null}
          className="flex-1 rounded bg-zinc-600 text-white text-sm py-1.5 disabled:opacity-50"
        >
          {declineSent ? "Decline sent" : sending === "decline" ? "Sending…" : "Decline & send"}
        </button>
      </div>
    </div>
  );
}
