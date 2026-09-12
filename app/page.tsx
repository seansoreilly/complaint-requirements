"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPane, type Message } from "@/components/ChatPane";
import { MainMenu } from "@/components/MainMenu";
import { DraftCard } from "@/components/DraftCard";
import { FormPane, type StageStatus } from "@/components/FormPane";
import { ReviewPanel } from "@/components/ReviewPanel";
import { type ComplaintState, emptyState, findField, getPath, setPath } from "@/lib/schema";
import { commitDate, reconcile } from "@/lib/patch";
import { applyServerDelta } from "@/lib/merge-state";
import { missingFor, stageProgress } from "@/lib/next";
import { outstandingPrompt } from "@/lib/questions";

const OPENER =
  "Hello — I can help you put together a complaint to AFCA, just by talking it through. " +
  "Nothing here is sent anywhere; it's a demo.\n\nTo start: which financial firm is your complaint about?";

export default function Page() {
  const [state, setState] = useState<ComplaintState>(emptyState);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: OPENER }]);
  const [pending, setPending] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [mode, setMode] = useState<"claude" | "mock" | null>(null);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    fetch("/api/chat")
      .then((response) => response.json())
      .then((data: { mode: "claude" | "mock" }) => setMode(data.mode))
      .catch(() => setMode(null));
  }, []);

  const stages: StageStatus[] = useMemo(() => stageProgress(state), [state]);
  const missing = useMemo(() => missingFor(state), [state]);
  /** Where the conversation is up to: the stage of the field being asked about. */
  const activeStageId = useMemo(() => {
    if (focusPath) return missing.find((m) => m.path === focusPath)?.stageId ?? null;
    return missing[0]?.stageId ?? "review";
  }, [missing, focusPath]);
  const focusField = focusPath ? (findField(focusPath) ?? null) : null;

  const send = useCallback(
    async (text: string) => {
      const history = messages.slice(-20);
      // Snapshot the state as it is sent: the server's reply is computed
      // from exactly this, so it is the baseline the response gets diffed
      // against, not whatever `state` has become by the time the reply lands.
      const snapshot = state;
      setMessages((previous) => [...previous, { role: "user", content: text }]);
      setPending(true);
      setNotes([]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: snapshot, history, message: text, focus: focusPath ?? undefined }),
        });
        const data = await response.json();

        if (!response.ok) {
          setMessages((previous) => [
            ...previous,
            { role: "assistant", content: data.error ?? "Something went wrong." },
          ]);
          return;
        }

        // Form inputs stay enabled while a reply is pending, so the person
        // may have typed into the form since `snapshot` was sent. Replacing
        // state wholesale with the server's reply would silently discard
        // those in-flight edits (the server never saw them). Instead, apply
        // only what the server actually changed this turn — see
        // applyServerDelta for the merge and its conflict rule.
        setState((previous) => applyServerDelta(previous, snapshot, data.state as ComplaintState));
        setMessages((previous) => [...previous, { role: "assistant", content: data.reply }]);
        setNotes((data.issues ?? []).map((issue: { message: string }) => issue.message));
        setFocusPath(null);
      } catch {
        setMessages((previous) => [
          ...previous,
          { role: "assistant", content: "I couldn't reach the assistant just then. Try again?" },
        ]);
      } finally {
        setPending(false);
      }
    },
    [messages, state, focusPath],
  );

  /** Direct edits in the form panel go through the same validation as the model's. */
  const edit = useCallback((path: string, value: unknown) => {
    setState((previous) => {
      const next = structuredClone(previous);
      setPath(next, path, value);
      // Changing a field here can close a branch or switch the service type
      // just as a chat turn can, so it gets the same reconciliation. The field
      // the person just edited is theirs and is never cleared. Dates are left
      // alone until blur — see commitDate — because this runs per keystroke.
      return reconcile(previous, next, (p) => p === path);
    });
  }, []);

  /**
   * A typed date, once the person has finished typing it. Held to the same
   * rules as a date the model proposes: normalised if it is real, cleared with
   * a note if it is not, rather than left on the form as typed.
   */
  const commit = useCallback((path: string) => {
    if (findField(path)?.kind !== "date") return;
    setState((previous) => {
      const current = getPath(previous, path);
      if (typeof current !== "string") return previous;
      const { value, issue } = commitDate(current, path);
      if (value === current) return previous;
      const next = structuredClone(previous);
      setPath(next, path, value);
      // Queued rather than set inside the updater: React may run an updater
      // twice, and a note is a side effect.
      queueMicrotask(() => setNotes(issue ? [issue.message] : []));
      return next;
    });
  }, []);

  const approveDraft = useCallback((kind: "narrative" | "fair_outcome", text: string) => {
    // Approving a card never goes near /api/chat, so `ensureAsk` — which is what
    // stops the route's replies trailing off — does not run on this path.
    // Without the prompt below, clicking "Use this" was answered by the canned
    // line and nothing else: the person finishes the hardest part of the form
    // and is met with silence, with fields still outstanding. Seen on two
    // transcripts, both times right after they signed off on something.
    setState((previous) => {
      const next = structuredClone(previous);
      if (kind === "narrative") {
        next.complaint.narrative = text;
        next.drafts.narrative = "";
      } else {
        next.outcome.fair_outcome = text;
        next.drafts.fair_outcome = "";
      }
      // The person can rewrite a draft before approving it, so what lands here
      // is typed text and gets the same treatment as the form panel's.
      const path = kind === "narrative" ? "complaint.narrative" : "outcome.fair_outcome";
      const reconciled = reconcile(previous, next, (p) => p === path);

      // The question is computed and queued HERE, inside the updater, because
      // this is the only place the reconciled state exists. Reading it out to a
      // variable and using it after `setState` would depend on the updater
      // having run by then, which React does not promise. Queued as a microtask
      // for the same reason `commitDate` queues its note: an updater must stay
      // free of side effects, since React may run it twice.
      //
      // It is read from `reconciled`, never from `previous`: the draft has just
      // cleared and the field it filled is no longer outstanding, so the old
      // state would ask for the very thing they just supplied.
      const prompt = outstandingPrompt(reconciled);
      queueMicrotask(() =>
        setMessages((before) => {
          const line =
            kind === "narrative"
              ? "Added to your complaint. That's the part most people find hardest — it's done."
              : "Noted as the outcome you're seeking.";
          const content = prompt ? `${line}\n\n${prompt}` : line;
          // React may run the updater twice; appending twice would double the
          // message, so drop it if the same text is already the last thing said.
          const last = before[before.length - 1];
          if (last?.role === "assistant" && last.content === content) return before;
          return [...before, { role: "assistant", content }];
        }),
      );
      return reconciled;
    });
  }, []);

  const startOver = useCallback(() => {
    setState(emptyState());
    setMessages([{ role: "assistant", content: OPENER }]);
    setNotes([]);
    setFocusPath(null);
    setShowReview(false);
  }, []);

  const attach = useCallback((names: string[]) => {
    setState((previous) => ({
      ...previous,
      attachments: [...new Set([...previous.attachments, ...names])],
    }));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col lg:h-dvh">
      {/* Unmissable by design: this must never be mistaken for AFCA's own service. */}
      <div className="banner flex items-center gap-3 bg-afca-yellow px-4 py-2.5 text-afca-ink">
        <span aria-hidden className="text-lg leading-none">⚠️</span>
        <p className="text-xs font-bold leading-snug sm:text-sm">
          Demonstration only — this is not AFCA.
          {/* The full disclaimer costs a quarter of a small phone screen, so the
              detail is kept for wider viewports and the headline carries it on phones. */}
          <span className="ml-1.5 hidden font-normal sm:inline">
            Not affiliated with, endorsed by, or connected to the Australian Financial Complaints
            Authority. Nothing you enter is submitted or sent anywhere, and the firm details are
            invented. To make a real complaint, go to{" "}
            <a
              href="https://www.afca.org.au"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:no-underline"
            >
              afca.org.au
            </a>
            .
          </span>
          <span className="ml-1.5 font-normal sm:hidden">
            Nothing is submitted.{" "}
            <a href="/privacy" className="underline underline-offset-2">
              What happens to your data
            </a>
          </span>
        </p>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-afca-blue/40 bg-afca-navy px-4 py-2.5">
        <p className="text-sm font-extrabold tracking-tight text-white">Complaint Concierge</p>
        <div className="flex items-center gap-2">
          <MainMenu onStartOver={startOver} />
          {mode && (
            <span className="rounded-full bg-afca-blue/40 px-2.5 py-0.5 text-[10px] font-semibold text-afca-skylight ring-1 ring-afca-sky/40">
              {mode === "claude" ? "Claude" : "Offline demo brain"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowReview((previous) => !previous)}
            className="min-h-11 rounded-full bg-afca-yellow px-5 py-2 text-sm font-bold text-afca-ink transition hover:brightness-95"
          >
            {showReview ? "Form" : `Review${missing.length === 0 ? " ✓" : ""}`}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="flex min-h-[60vh] flex-col border-b border-afca-line lg:min-h-0 lg:border-b-0 lg:border-r">
          <ChatPane
            messages={messages}
            pending={pending}
            notes={notes}
            missingCount={missing.length}
            focusField={focusField}
            onClearFocus={() => setFocusPath(null)}
            onSend={send}
          />
        </div>
        <div className="flex min-h-[70vh] flex-col lg:min-h-0">
          <FormPane
            state={state}
            stages={stages}
            activeStageId={activeStageId}
            focusPath={focusPath}
            onFocusField={setFocusPath}
            onEdit={edit}
            onCommit={commit}
            onAttach={attach}
          >
            {showReview && (
              <ReviewPanel
                state={state}
                missingCount={missing.length}
                onClose={() => setShowReview(false)}
              />
            )}
            {state.drafts.narrative && (
              <DraftCard
                key={state.drafts.narrative}
                title="Tell us about your complaint"
                draft={state.drafts.narrative}
                onApprove={(text) => approveDraft("narrative", text)}
                onDiscard={() => edit("drafts.narrative", "")}
              />
            )}
            {state.drafts.fair_outcome && (
              <DraftCard
                key={state.drafts.fair_outcome}
                title="What would be a fair outcome"
                draft={state.drafts.fair_outcome}
                onApprove={(text) => approveDraft("fair_outcome", text)}
                onDiscard={() => edit("drafts.fair_outcome", "")}
              />
            )}
          </FormPane>
        </div>
      </div>
    </main>
  );
}
