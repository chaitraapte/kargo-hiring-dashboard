"use client";

import { useCallback, useEffect, useState } from "react";
import type { CandidateRow, RoleApplied, Stats } from "@/lib/types";
import { UploadPanel } from "./UploadPanel";
import { CandidateCard } from "./CandidateCard";

const BAND_ORDER = ["PRIORITY_SHORTLIST", "SHORTLIST", "HOLD", "DECLINE_QUEUE"] as const;

interface PreviouslyContacted {
  name: string;
  email: string;
  note: string;
}

function parseCsv(text: string): PreviouslyContacted[] {
  const lines = text.trim().split("\n").slice(1); // skip header
  return lines
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const [name, email, ...rest] = l.split(",");
      return { name: name?.trim() ?? "", email: email?.trim() ?? "", note: rest.join(",").trim() };
    });
}

export default function Dashboard() {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [role, setRole] = useState<RoleApplied>("pm");
  const [config, setConfig] = useState<{ emailMode: string; testRecipient: string } | null>(null);
  const [previouslyContacted, setPreviouslyContacted] = useState<PreviouslyContacted[]>([]);
  const [batchSending, setBatchSending] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/candidates");
    const json = await res.json();
    setCandidates(json.candidates ?? []);
    setStats(json.stats ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount, not a sync render loop
    refresh();
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig);
    fetch("/data/previously-contacted.csv")
      .then((r) => r.text())
      .then((t) => setPreviouslyContacted(parseCsv(t)))
      .catch(() => {});
  }, [refresh]);

  const roleCandidates = candidates.filter((c) => c.role_applied === role);
  const scoredOf = (c: CandidateRow) => c.scores.find((s) => s.rubric_variant === c.role_applied);

  const shortlistedCount = roleCandidates.filter((c) => {
    const s = scoredOf(c);
    return s && (s.band === "PRIORITY_SHORTLIST" || s.band === "SHORTLIST");
  }).length;
  const showHold = shortlistedCount < 5;

  const sorted = [...roleCandidates].sort((a, b) => {
    const sa = scoredOf(a);
    const sb = scoredOf(b);
    if (!sa || !sb) return 0;
    const bandDiff = BAND_ORDER.indexOf(sa.band) - BAND_ORDER.indexOf(sb.band);
    if (bandDiff !== 0) return bandDiff;
    if (sb.total !== sa.total) return sb.total - sa.total;
    if (sb.c1 !== sa.c1) return sb.c1 - sa.c1;
    if (sb.c2 !== sa.c2) return sb.c2 - sa.c2;
    return sb.hidden_value.length - sa.hidden_value.length;
  });

  const visible = sorted.filter((c) => {
    const s = scoredOf(c);
    if (!s) return true; // needs_review, still show
    if (s.band === "HOLD" && !showHold) return false;
    return true;
  });

  async function sendAllQueuedDeclines() {
    setBatchSending(true);
    try {
      const res = await fetch("/api/send/batch-decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      const failed = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      if (failed.length > 0) {
        alert(`${failed.length} decline(s) failed to send. Check the candidate cards for details.`);
      }
      await refresh();
    } finally {
      setBatchSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {config && (
        <div className="bg-zinc-900 text-zinc-100 text-xs py-2 px-4 text-left">
          Email mode: <strong>{config.emailMode.toUpperCase()}</strong>
          {config.emailMode === "dry" && (
            <>
              {" "}
              — all sends go to <code className="bg-zinc-700 px-1 rounded">{config.testRecipient}</code>
            </>
          )}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Kargo Hiring Dashboard</h1>

        {previouslyContacted.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
            <p className="font-medium mb-1">Previously contacted (informal replies before this dashboard)</p>
            <ul className="text-zinc-600 space-y-0.5">
              {previouslyContacted.map((p, i) => (
                <li key={i}>
                  {p.name} — {p.email} {p.note && `(${p.note})`}
                </li>
              ))}
            </ul>
          </div>
        )}

        <UploadPanel onDone={refresh} />

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total resumes" value={stats.total} />
            <StatTile label="Sent to interview" value={stats.advanced} />
            <StatTile label="Rejected" value={stats.declined} />
            <StatTile label="Pending review" value={stats.pending} />
          </div>
        )}
        {stats && (
          <div className="flex gap-2 text-xs text-zinc-600 flex-wrap">
            {BAND_ORDER.map((b) => (
              <span key={b} className="rounded-full bg-white border border-zinc-200 px-2 py-1">
                {b.replace("_", " ")}: {stats.bandCounts[b] ?? 0}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-zinc-200">
          {(["pm", "spm"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-4 py-2 text-sm font-medium ${
                role === r ? "border-b-2 border-indigo-600 text-indigo-700" : "text-zinc-500"
              }`}
            >
              {r === "pm" ? "Product Manager" : "Senior Product Manager"}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={sendAllQueuedDeclines}
            disabled={batchSending}
            className="mb-1 text-xs rounded bg-zinc-700 text-white px-3 py-1.5 disabled:opacity-50"
          >
            {batchSending ? "Sending…" : "Send all queued declines"}
          </button>
        </div>

        <div className="space-y-3">
          {visible.length === 0 && <p className="text-sm text-zinc-500">No candidates yet for this role.</p>}
          {visible.map((c) => (
            <CandidateCard key={c.id} candidate={c} onChanged={refresh} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
