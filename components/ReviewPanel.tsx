"use client";

import { useState } from "react";
import { type ComplaintState } from "@/lib/schema";
import { exportJson, plainTextSummary, summarise } from "@/lib/export";

export function ReviewPanel({
  state,
  missingCount,
  onClose,
}: {
  state: ComplaintState;
  missingCount: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function download(): void {
    const blob = new Blob([exportJson(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "afca-complaint-draft.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(plainTextSummary(state));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="review mb-4 rounded-2xl border border-afca-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-tight text-afca-navy">Review your complaint</h2>
        <button
          type="button"
          onClick={onClose}
          className="no-print text-xs font-semibold text-afca-blue underline hover:text-afca-navy"
        >
          Back to form
        </button>
      </div>

      {missingCount > 0 && (
        <p className="mb-3 rounded-xl border-l-4 border-afca-amber bg-afca-cream px-3 py-2 text-xs font-semibold text-afca-navy">
          {missingCount} {missingCount === 1 ? "answer is" : "answers are"} still missing. You can
          export anyway and finish later.
        </p>
      )}

      {summarise(state).map((section) => (
        <div key={section.title} className="mb-3">
          <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-afca-blue">
            {section.title}
          </h3>
          <dl className="divide-y divide-afca-line/60 overflow-hidden rounded-xl border border-afca-line">
            {section.rows.map((row) => (
              <div key={row.label} className="flex gap-3 px-2.5 py-1.5">
                <dt className="w-2/5 shrink-0 text-[11px] font-semibold text-afca-navy/60">{row.label}</dt>
                <dd className="flex-1 whitespace-pre-wrap text-[11px] text-afca-navy">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      <div className="no-print mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-full bg-afca-yellow px-4 py-2 text-xs font-bold text-afca-ink transition hover:brightness-95"
        >
          {copied ? "Copied ✓" : "Copy to AFCA form"}
        </button>
        <button
          type="button"
          onClick={download}
          className="rounded-full border border-afca-line bg-white px-4 py-2 text-xs font-bold text-afca-navy transition hover:bg-afca-skylight"
        >
          Download JSON
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full border border-afca-line bg-white px-4 py-2 text-xs font-bold text-afca-navy transition hover:bg-afca-skylight"
        >
          Print summary
        </button>
      </div>
    </div>
  );
}
