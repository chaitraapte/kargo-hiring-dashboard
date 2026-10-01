"use client";

import { createPortal } from "react-dom";

export function SendPreviewModal({
  candidateName,
  type,
  subject,
  body,
  sending,
  onCancel,
  onConfirm,
}: {
  candidateName: string;
  type: "invite" | "decline";
  subject: string;
  body: string;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/40 p-4 pt-20">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-950">
            {type === "invite" ? "Send invite" : "Send decline"} — {candidateName}
          </h2>
        </div>
        <p className="mb-3 text-xs text-stone-500">
          Personalized email ready to send. Review before confirming.
        </p>
        <div className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Subject</p>
          <p className="text-sm font-medium text-navy-950">{subject}</p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-400">Body</p>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-stone-700">{body}</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={sending}
            className="rounded-xl px-4 py-2 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              type === "invite" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-navy-800 hover:bg-navy-700"
            }`}
          >
            {sending ? "Sending…" : type === "invite" ? "Send invite" : "Send decline"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
