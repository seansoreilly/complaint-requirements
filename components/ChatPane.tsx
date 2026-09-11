"use client";

import { useEffect, useRef, useState } from "react";
import { type FieldDef } from "@/lib/schema";
// PROTOTYPE: avatar concepts — remove with components/prototype-avatars.tsx
import { type AvatarProps } from "@/components/prototype-avatars";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

const DEMO_STORY =
  "I emailed AustralianSuper on 3 Sept about my insurance being cancelled without warning and they still haven't replied to me about it at all.";

export function ChatPane({
  messages,
  pending,
  notes,
  focusField,
  onClearFocus,
  onSend,
  Avatar,
  avatarOnlyWhenThinking = false,
}: {
  messages: Message[];
  pending: boolean;
  notes: string[];
  focusField: FieldDef | null;
  onClearFocus: () => void;
  onSend: (text: string) => void;
  /** PROTOTYPE: when set, assistant messages get an animated character. */
  Avatar?: (props: AvatarProps) => React.JSX.Element;
  /** PROTOTYPE: show the character only while it is working, not on every message. */
  avatarOnlyWhenThinking?: boolean;
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
              {!isUser && Avatar && !avatarOnlyWhenThinking && (
                <Avatar state={isLatestAssistant ? "speaking" : "still"} size={30} />
              )}
              <div
                className={
                  isUser
                    ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-afca-navy px-4 py-2.5 text-sm leading-relaxed text-white"
                    : `${Avatar && !avatarOnlyWhenThinking ? "max-w-[calc(85%-2.5rem)]" : "max-w-[85%]"} whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-afca-skylight px-4 py-2.5 text-sm leading-relaxed text-afca-navy`
                }
              >
                {message.content}
              </div>
            </div>
          );
        })}
        {pending && (
          <div className="flex justify-start gap-2">
            {Avatar && <Avatar state="thinking" size={30} />}
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
        {focusField && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-afca-skylight px-3 py-1 text-xs font-semibold text-afca-blue ring-1 ring-afca-sky/50">
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
