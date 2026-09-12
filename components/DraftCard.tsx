"use client";

import { useState } from "react";
import { NARRATIVE_MAX } from "@/lib/schema";

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
        // The card invites rewriting, so the same limit the form panel keeps
        // applies here.
        maxLength={NARRATIVE_MAX}
        className="w-full rounded-xl border border-afca-line bg-white px-3 py-2.5 text-xs leading-relaxed text-afca-navy outline-none focus:border-afca-blue"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onApprove(text)}
          className="min-h-11 rounded-full bg-afca-navy px-5 py-2.5 text-sm font-bold text-white transition hover:bg-afca-ink"
        >
          Use this
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-11 rounded-full px-4 py-2.5 text-sm text-afca-navy/70 underline underline-offset-2 transition hover:bg-white hover:text-afca-navy"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
