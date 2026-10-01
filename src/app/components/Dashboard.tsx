"use client";

import { useCallback, useEffect, useState } from "react";
import type { CandidateRow, RoleApplied, Stats } from "@/lib/types";
import { UploadPanel } from "./UploadPanel";
import { CandidateTable } from "./CandidateTable";
import { StatTiles } from "./StatTiles";

type Tab = "dashboard" | "pm" | "spm";
const BAND_ORDER = ["PRIORITY_SHORTLIST", "SHORTLIST", "HOLD", "DECLINE_QUEUE"] as const;

interface PreviouslyContacted {
  name: string;
  email: string;
  note: string;
}

function parseCsv(text: string): PreviouslyContacted[] {
  const lines = text.trim().split("\n").slice(1);
  return lines
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const [name, email, ...rest] = l.split(",");
      return { name: name?.trim() ?? "", email: email?.trim() ?? "", note: rest.join(",").trim() };
    });
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
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

  async function sendAllQueuedDeclines(role: RoleApplied) {
    setBatchSending(true);
    try {
      const res = await fetch("/api/send/batch-decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      const failed = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      if (failed.length > 0) alert(`${failed.length} decline(s) failed to send.`);
      await refresh();
    } finally {
      setBatchSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-100">
      {config && (
        <div className="bg-navy-950 px-4 py-2 text-left text-xs text-navy-100">
          Email mode: <strong className="text-amber-400">{config.emailMode.toUpperCase()}</strong>
          {config.emailMode === "dry" && (
            <>
              {" "}
              — all sends go to <code className="rounded bg-navy-800 px-1 text-amber-200">{config.testRecipient}</code>
            </>
          )}
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        <h1 className="text-2xl font-semibold text-navy-950">Kargo Hiring Dashboard</h1>

        <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm w-fit">
          {(
            [
              { key: "dashboard", label: "Dashboard" },
              { key: "pm", label: "Product Manager" },
              { key: "spm", label: "Senior Product Manager" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                tab === t.key ? "bg-navy-900 text-white" : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "dashboard" && (
          <DashboardTab stats={stats} previouslyContacted={previouslyContacted} />
        )}

        {(tab === "pm" || tab === "spm") && (
          <RoleTab
            role={tab}
            candidates={candidates.filter((c) => c.role_applied === tab)}
            onChanged={refresh}
            onSendAllDeclines={() => sendAllQueuedDeclines(tab)}
            batchSending={batchSending}
          />
        )}
      </div>
    </div>
  );
}


function DashboardTab({
  stats,
  previouslyContacted,
}: {
  stats: Stats | null;
  previouslyContacted: PreviouslyContacted[];
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-500">
        An overview of every resume in the pipeline across both roles — how many are shortlisted, on hold,
        declined, or already sent to interview.
      </p>
      {stats && <StatTiles stats={stats} />}
      {previouslyContacted.length > 0 && (
        <div className="rounded-3xl bg-white p-5 text-sm shadow-sm">
          <p className="mb-2 font-medium text-navy-900">Previously contacted (informal replies before this dashboard)</p>
          <ul className="space-y-0.5 text-stone-500">
            {previouslyContacted.map((p, i) => (
              <li key={i}>
                {p.name} — {p.email} {p.note && `(${p.note})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RoleTab({
  role,
  candidates,
  onChanged,
  onSendAllDeclines,
  batchSending,
}: {
  role: RoleApplied;
  candidates: CandidateRow[];
  onChanged: () => void;
  onSendAllDeclines: () => void;
  batchSending: boolean;
}) {
  const scoredOf = (c: CandidateRow) => c.scores.find((s) => s.rubric_variant === c.role_applied);
  const shortlistedCount = candidates.filter((c) => {
    const s = scoredOf(c);
    return s && (s.band === "PRIORITY_SHORTLIST" || s.band === "SHORTLIST");
  }).length;
  const showHold = shortlistedCount < 5;

  const sorted = [...candidates].sort((a, b) => {
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
    if (!s) return true;
    if (s.band === "HOLD" && !showHold) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <UploadPanel fixedRole={role} onDone={onChanged} />

      <div className="rounded-3xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-navy-900">
            Scored candidates — {role === "pm" ? "Product Manager" : "Senior Product Manager"} rubric
          </h2>
          <button
            onClick={onSendAllDeclines}
            disabled={batchSending}
            className="rounded-xl bg-navy-800 px-3 py-1.5 text-xs text-white hover:bg-navy-700 disabled:opacity-50"
          >
            {batchSending ? "Sending…" : "Send all queued declines"}
          </button>
        </div>
        <CandidateTable candidates={visible} onChanged={onChanged} />
      </div>
    </div>
  );
}
