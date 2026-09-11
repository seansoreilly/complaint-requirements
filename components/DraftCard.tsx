"use client";

import { useState } from "react";

/**
 * A proposal held for approval. The assistant writes here; only the person's
 * approval moves the text onto the form itself.
 */
export function DraftCard({
  title,
  draft,
  onApprove,
  onDiscard,
}: {
  title: string;
  draft: string;
  onApprove: (text: string) => void;
  onDiscard: () => void;
}) {
  const [text, setText] = useState(draft);

  return (
    <div className="mb-4 rounded-2xl border-2 border-afca-yellow bg-afca-cream p-3.5 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-afca-navy">{title}</h3>
        <span className="text-[10px] font-semibold text-afca-navy/60">Your words — edit before approving</span>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={7}
        className="w-full rounded-xl border border-afca-line bg-white px-3 py-2.5 text-xs leading-relaxed text-afca-navy outline-none focus:border-afca-blue"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onApprove(text)}
          className="rounded-full bg-afca-navy px-4 py-1.5 text-xs font-bold text-white transition hover:bg-afca-ink"
        >
          Use this
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="text-xs text-afca-navy/60 underline hover:text-afca-navy"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
