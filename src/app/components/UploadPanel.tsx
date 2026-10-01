"use client";

import { useState } from "react";
import type { RoleApplied } from "@/lib/types";

type Stage = "queued" | "uploading" | "scoring" | "drafting" | "done" | "error";

interface FileStatus {
  name: string;
  stage: Stage;
  error?: string;
}

export function UploadPanel({ onDone }: { onDone: () => void }) {
  const [role, setRole] = useState<RoleApplied>("pm");
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setBusy(true);
    setStatuses(fileArray.map((f) => ({ name: f.name, stage: "queued" })));

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, stage: "uploading" } : s)));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("role", role);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const text = await res.text();
        let parsed: { stage: string; error?: string } | undefined;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = undefined;
        }

        if (!parsed) {
          setStatuses((prev) =>
            prev.map((s, idx) =>
              idx === i
                ? { ...s, stage: "error", error: `HTTP ${res.status}: ${text.slice(0, 200) || "(empty response)"}` }
                : s
            )
          );
          continue;
        }
        const json = parsed;

        if (!res.ok || json.error) {
          setStatuses((prev) =>
            prev.map((s, idx) =>
              idx === i ? { ...s, stage: (json.stage as Stage) || "error", error: json.error } : s
            )
          );
        } else {
          setStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, stage: "done" } : s)));
        }
      } catch (err) {
        setStatuses((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, stage: "error", error: String(err) } : s))
        );
      }
    }

    setBusy(false);
    onDone();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm font-medium text-zinc-700">Role for this batch:</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleApplied)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
          disabled={busy}
        >
          <option value="pm">Product Manager</option>
          <option value="spm">Senior Product Manager</option>
        </select>
        <input
          type="file"
          multiple
          accept=".pdf,.docx"
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
          className="text-sm"
        />
      </div>
      {statuses.length > 0 && (
        <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
          {statuses.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="truncate">{s.name}</span>
              <span
                className={
                  s.stage === "done"
                    ? "text-green-600"
                    : s.stage === "error"
                    ? "text-red-600"
                    : "text-zinc-500"
                }
              >
                {s.stage}
                {s.error ? `: ${s.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
