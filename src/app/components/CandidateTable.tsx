"use client";

import { useState } from "react";
import type { CandidateRow } from "@/lib/types";
import { ChevronDownIcon, CheckCircleIcon, PauseCircleIcon, XCircleIcon, SparkleIcon } from "./icons";
import { SendPreviewModal } from "./SendPreviewModal";

const BAND_LABEL: Record<string, string> = {
  PRIORITY_SHORTLIST: "Priority Shortlist",
  SHORTLIST: "Shortlist",
  HOLD: "Hold",
  DECLINE_QUEUE: "Decline Queue",
};

const BAND_PILL: Record<string, string> = {
  PRIORITY_SHORTLIST: "bg-emerald-100 text-emerald-800",
  SHORTLIST: "bg-navy-100 text-navy-800",
  HOLD: "bg-amber-100 text-amber-800",
  DECLINE_QUEUE: "bg-stone-200 text-stone-700",
};

export function CandidateTable({
  candidates,
  onChanged,
}: {
  candidates: CandidateRow[];
  onChanged: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (candidates.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-stone-400">No candidates yet for this role.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-stone-400">
            <th className="px-6 py-3 font-medium">Candidate</th>
            <th className="px-3 py-3 font-medium">Band</th>
            <th className="px-3 py-3 font-medium">Score</th>
            <th className="px-3 py-3 font-medium hidden md:table-cell">Key insight</th>
            <th className="px-6 py-3 font-medium text-right">Decision</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <CandidateRowItem
              key={c.id}
              candidate={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId((cur) => (cur === c.id ? null : c.id))}
              onChanged={onChanged}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateRowItem({
  candidate,
  expanded,
  onToggle,
  onChanged,
}: {
  candidate: CandidateRow;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [sending, setSending] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<"invite" | "decline" | null>(null);
  const [preview, setPreview] = useState<{ type: "invite" | "decline"; subject: string; body: string } | null>(
    null
  );
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
      if (!json.ok) alert(`Failed: ${json.reason}`);
      onChanged();
    } finally {
      setSending(null);
    }
  }

  /** Advance/decline open a preview of the personalized email first; Hold sends immediately (no email). */
  async function requestSend(type: "invite" | "decline") {
    setLoadingPreview(type);
    try {
      const res = await fetch("/api/draft-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, type }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Couldn't load the draft: ${json.error ?? "unknown error"}`);
        return;
      }
      setPreview({ type, subject: json.subject, body: json.body });
    } finally {
      setLoadingPreview(null);
    }
  }

  async function confirmSend() {
    if (!preview) return;
    await act(preview.type === "invite" ? "advance" : "decline");
    setPreview(null);
  }

  if (!score) {
    return (
      <tr className="border-t border-stone-100">
        <td className="px-6 py-4 font-medium text-stone-800">{candidate.name}</td>
        <td colSpan={4} className="px-3 py-4 text-amber-600">
          Needs review — scoring did not complete.
        </td>
      </tr>
    );
  }

  const activeDraft = score.band === "DECLINE_QUEUE" || score.band === "HOLD" ? declineDraft : inviteDraft;

  return (
    <>
      <tr
        className="cursor-pointer border-t border-stone-100 transition hover:bg-stone-50"
        onClick={onToggle}
      >
        <td className="px-6 py-4">
          <p className="font-medium text-navy-950">{candidate.name}</p>
          <p className="text-xs text-stone-400">{candidate.email}</p>
        </td>
        <td className="px-3 py-4">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${BAND_PILL[score.band]}`}>
            {BAND_LABEL[score.band]}
          </span>
        </td>
        <td className="px-3 py-4 font-mono text-navy-900">{score.total.toFixed(1)}</td>
        <td className="hidden max-w-xs truncate px-3 py-4 text-stone-500 md:table-cell">{score.key_insight}</td>
        <td className="px-6 py-4">
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <ActionButton
              title={inviteSent ? "Invite sent" : "Advance & send invite"}
              onClick={() => requestSend("invite")}
              disabled={inviteSent || sending !== null || loadingPreview !== null}
              active={inviteSent}
              colorClass="text-emerald-600 hover:bg-emerald-50"
              activeClass="bg-emerald-100 text-emerald-700"
            >
              <CheckCircleIcon className="w-5 h-5" />
            </ActionButton>
            <ActionButton
              title="Hold"
              onClick={() => act("hold")}
              disabled={sending !== null || loadingPreview !== null}
              colorClass="text-amber-600 hover:bg-amber-50"
            >
              <PauseCircleIcon className="w-5 h-5" />
            </ActionButton>
            <ActionButton
              title={declineSent ? "Decline sent" : "Decline & send"}
              onClick={() => requestSend("decline")}
              disabled={declineSent || sending !== null || loadingPreview !== null}
              active={declineSent}
              colorClass="text-stone-500 hover:bg-stone-100"
              activeClass="bg-stone-200 text-stone-700"
            >
              <XCircleIcon className="w-5 h-5" />
            </ActionButton>
            <button
              onClick={onToggle}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-navy-700 hover:bg-navy-50"
            >
              View details
              <ChevronDownIcon className={`w-4 h-4 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </td>
      </tr>
      {loadingPreview && (
        <tr>
          <td colSpan={5} className="px-6 py-2 text-xs text-stone-400">
            Loading the {loadingPreview} email draft…
          </td>
        </tr>
      )}
      {expanded && (
        <tr className="border-t border-stone-100 bg-stone-50/70">
          <td colSpan={5} className="px-6 py-5">
            <div className="space-y-4 text-sm">
              {score.key_insight && (
                <div className="flex items-start gap-2 rounded-2xl border border-navy-200 bg-navy-50 px-4 py-3 text-navy-900">
                  <SparkleIcon className="mt-0.5 w-4 h-4 shrink-0 text-navy-500" />
                  <p>{score.key_insight}</p>
                </div>
              )}
              {crossScore && (
                <p className="text-xs text-stone-500">
                  Cross-scored on {crossScore.rubric_variant.toUpperCase()} rubric: {crossScore.total.toFixed(1)}/100
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(["c1", "c2", "c3", "c4", "c5"] as const).map((k) => (
                  <div key={k} className="rounded-2xl bg-white p-3 shadow-sm">
                    <p className="text-xs font-medium uppercase text-stone-400">{k}</p>
                    <p className="font-medium text-stone-800">
                      {score[k]}/4 <span className="text-stone-400">({score.confidence[k]})</span>
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs italic text-stone-500">&ldquo;{score.quotes[k]}&rdquo;</p>
                  </div>
                ))}
              </div>
              {score.hidden_value.length > 0 && (
                <div>
                  <p className="font-medium text-navy-900">Hidden value</p>
                  <ul className="list-inside list-disc text-stone-500">
                    {score.hidden_value.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              {score.probes.length > 0 && (
                <div>
                  <p className="font-medium text-navy-900">Top probes</p>
                  <ul className="list-inside list-disc text-stone-500">
                    {score.probes.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-stone-400">
                G1: {score.gates.g1_status} — {score.gates.g1_reason}. G2: {score.gates.g2.flag}
              </p>
              {activeDraft && (
                <div className="rounded-2xl border border-stone-200 bg-white p-3">
                  <p className="font-medium text-navy-900">Draft ({activeDraft.type})</p>
                  <p className="font-mono text-xs text-stone-800">{activeDraft.subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-stone-500">{activeDraft.body_template}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
      {preview && (
        <SendPreviewModal
          candidateName={candidate.name}
          type={preview.type}
          subject={preview.subject}
          body={preview.body}
          sending={sending !== null}
          onCancel={() => setPreview(null)}
          onConfirm={confirmSend}
        />
      )}
    </>
  );
}

function ActionButton({
  children,
  title,
  onClick,
  disabled,
  active,
  colorClass,
  activeClass,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  colorClass: string;
  activeClass?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active && activeClass ? activeClass : colorClass
      }`}
    >
      {children}
    </button>
  );
}
