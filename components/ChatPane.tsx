"use client";

import { useEffect, useRef, useState } from "react";
import { type FieldDef, findField } from "@/lib/schema";
import { Assistant } from "@/components/Assistant";
import { renderInlineMarkdown } from "@/lib/markdown";

export interface Message {
  role: "user" | "assistant";
  content: string;
  /**
   * Form paths this turn actually wrote, from the route's own before/after
   * diff. Carried on the message rather than held as "the latest change" so
   * the record stays with the turn that made it: scrolling back up a
   * transcript should show what each turn did, not what the newest one did.
   */
  changed?: string[];
}

/**
 * The fields a turn wrote, named.
 *
 * The demo's best trick is the form moving in response to the chat, and until
 * now that only happened where the person was not looking. This is the chat's
 * half of the claim — the form's half is the flash — and both are computed
 * from what the state did, so neither can say a write happened that did not.
 */
function ChangedChips({ paths }: { paths: string[] }) {
  const labels = paths
    .map((path) => findField(path)?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {labels.map((label) => (
        <li
          key={label}
          className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
        >
          ✓ {label}
        </li>
      ))}
    </ul>
  );
}

const DEMO_STORY =
  "I emailed AustralianSuper on 3 Sept about my insurance being cancelled without warning and they still haven't replied to me about it at all.";

export function ChatPane({
  messages,
  pending,
  notes,
  missingCount,
  declinedCount,
  focusField,
  onClearFocus,
  onSend,
}: {
  messages: Message[];
  pending: boolean;
  notes: string[];
  /** Required fields still unanswered — shown as a counter above the input. */
  missingCount: number;
  /**
   * How many of the missing fields the person declined to answer.
   *
   * A declined field stays in `missingCount` on purpose — it IS still blank,
   * and the review must keep saying so. But if the only things left are things
   * they refused, the conversation is finished, and a header stuck on "1 answer
   * left" never tells them that. It says so without claiming the field was
   * answered.
   */
  declinedCount: number;
  focusField: FieldDef | null;
  onClearFocus: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function submit(): void {
    const text = draft.trim();
    if (text.length === 0 || pending) return;
    setDraft("");
    onSend(text);
  }

  return (
    <section className="chat flex h-full min-h-0 flex-col bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          // Only the newest assistant message animates; older ones go fully
          // still, so a long conversation isn't a column of bobbing characters.
          const isLatestAssistant =
            !isUser && index === messages.length - 1 && !pending;
          return (
            <div key={index} className={isUser ? "flex justify-end" : "flex justify-start gap-2"}>
              {!isUser && <Assistant state={isLatestAssistant ? "speaking" : "still"} />}
              <div className={isUser ? "max-w-[85%]" : "max-w-[calc(85%-2.5rem)]"}>
                <div
                  className={
                    isUser
                      ? "whitespace-pre-wrap rounded-2xl rounded-br-sm bg-afca-navy px-4 py-2.5 text-sm leading-relaxed text-white"
                      : `whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-afca-skylight px-4 py-2.5 text-sm leading-relaxed text-afca-navy`
                  }
                >
                  {/* The model writes light markdown; the person shouldn't see
                      the asterisks. User messages stay literal. */}
                  {isUser ? message.content : renderInlineMarkdown(message.content)}
                </div>
                {!isUser && message.changed && message.changed.length > 0 && (
                  <ChangedChips paths={message.changed} />
                )}
              </div>
            </div>
          );
        })}
        {pending && (
          <div className="flex justify-start gap-2">
            <Assistant state="thinking" />
            {/* The pose is decorative; the word stays as the accessible signal. */}
            <div className="rounded-2xl rounded-bl-sm bg-afca-skylight px-4 py-2.5 text-sm text-afca-blue">
              Thinking…
            </div>
          </div>
        )}
        {notes.length > 0 && (
          <ul className="space-y-1 text-xs text-afca-amber">
            {notes.map((note, index) => (
              <li key={index}>· {note}</li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-afca-line bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {focusField && (
            <div className="inline-flex items-center gap-2 rounded-full bg-afca-skylight px-3 py-1 text-xs font-semibold text-afca-blue ring-1 ring-afca-sky/50">
              Answering: {focusField.label}
              <button
                type="button"
                onClick={onClearFocus}
                className="text-afca-blue hover:text-afca-ink"
                aria-label="Stop answering this field"
              >
                ✕
              </button>
            </div>
          )}
          {/* The assistant used to append "(N things left after this.)" to every
              reply. The count belongs in the UI, where it updates with the form
              and does not repeat itself down the transcript.

              It says "questions", not "answers". A tester read "3 answers left"
              as a demo allowance being spent — each field the bot filled looked
              like it cost one — and expected the conversation to be cut off when
              it ran out. Nothing here is metered: it counts required fields that
              are still blank and goes up if a branch opens. "Questions left" can
              only be read as the form's, and the title says so outright. */}
          <p
            aria-live="polite"
            title="Required fields still blank. Nothing here is rationed — the count goes up if a new branch of the form opens."
            className={
              missingCount === 0 || missingCount === declinedCount
                ? "ml-auto text-xs font-semibold text-emerald-600"
                : "ml-auto text-xs font-semibold text-afca-blue"
            }
          >
            {missingCount === 0
              ? "All questions answered ✓"
              : missingCount === declinedCount
                ? `Ready — ${declinedCount} left blank ✓`
                : `${missingCount - declinedCount} ${
                    missingCount - declinedCount === 1 ? "question" : "questions"
                  } left to answer`}
          </p>
        </div>
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Tell me what happened…"
            className="flex-1 resize-none rounded-xl border border-afca-line px-3.5 py-2.5 text-sm text-afca-navy outline-none transition focus:border-afca-blue focus:ring-2 focus:ring-afca-sky/40"
          />
          <button
            type="button"
            onClick={submit}
            disabled={pending || draft.trim().length === 0}
            className="h-11 self-end rounded-full bg-afca-yellow px-5 text-sm font-bold text-afca-ink transition hover:brightness-95 disabled:bg-afca-line disabled:text-white"
          >
            Send
          </button>
        </div>
        {messages.length <= 1 && (
          <button
            type="button"
            onClick={() => setDraft(DEMO_STORY)}
            className="mt-1 inline-block py-2 text-xs font-semibold text-afca-blue underline decoration-afca-sky underline-offset-2 hover:text-afca-navy"
          >
            Paste the demo story
          </button>
        )}
      </div>
    </section>
  );
}
