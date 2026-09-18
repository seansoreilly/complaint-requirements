"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatPane, type Message } from "@/components/ChatPane";
import { MainMenu } from "@/components/MainMenu";
import { DraftCard } from "@/components/DraftCard";
import { FormPane, type StageStatus } from "@/components/FormPane";
import { ReviewPanel } from "@/components/ReviewPanel";
import { type ComplaintState, emptyState, findField, getPath, setPath } from "@/lib/schema";
import { commitDate, reconcile } from "@/lib/patch";
import { applyServerDelta } from "@/lib/merge-state";
import { memberNumberFor } from "@/lib/directory";
import { missingFor, stageProgress } from "@/lib/next";

const OPENER =
  "Hello — I can help you put together a complaint to AFCA, just by talking it through. " +
  "This is a demo: nothing reaches AFCA or your firm, but what you type is sent to an AI " +
  "to work out a reply, so please use made-up personal details." +
  "\n\nTo start: which financial firm is your complaint about?";

export default function Page() {
  const [state, setState] = useState<ComplaintState>(emptyState);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: OPENER }]);
  const [pending, setPending] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [mode, setMode] = useState<"claude" | "mock" | null>(null);
  const [showReview, setShowReview] = useState(false);
  /**
   * Which conversation is current. Start over bumps this, and an in-flight
   * request compares the value it captured before applying anything — the
   * reply to a conversation that no longer exists is discarded rather than
   * merged into the fresh one.
   */
  const generationRef = useRef(0);
  const inflightRef = useRef<AbortController | null>(null);

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

      // Which conversation this request belongs to. Start over bumps the
      // generation, so a reply that was already in flight can tell that the
      // conversation it was answering no longer exists — without this, a slow
      // response landed after a reset and repopulated the cleared form.
      const generation = generationRef.current;
      inflightRef.current?.abort();
      const controller = new AbortController();
      inflightRef.current = controller;

      setMessages((previous) => [...previous, { role: "user", content: text }]);
      setPending(true);
      setNotes([]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: snapshot, history, message: text, focus: focusPath ?? undefined }),
          signal: controller.signal,
        });
        const data = await response.json();

        // Checked after every await: the reset may have happened while this
        // request was in flight, and nothing it carries applies any more.
        if (generation !== generationRef.current) return;

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
        // An abort lands here too, and a conversation that has been reset must
        // not be told the assistant was unreachable — there is nothing left to
        // retry, and the message would appear under a fresh opener.
        if (generation !== generationRef.current) return;
        setMessages((previous) => [
          ...previous,
          { role: "assistant", content: "I couldn't reach the assistant just then. Try again?" },
        ]);
      } finally {
        if (generation === generationRef.current) setPending(false);
      }
    },
    [messages, state, focusPath],
  );

  /** Direct edits in the form panel go through the same validation as the model's. */
  const edit = useCallback((path: string, value: unknown) => {
    setState((previous) => {
      const next = structuredClone(previous);
      setPath(next, path, value);
      // The member number belongs to the firm name, so it cannot outlive an
      // edit to it: changing AustralianSuper to Westpac used to leave 10657
      // on screen against the wrong firm. Re-derived here rather than merely
      // cleared, so a recognised name gets its number immediately.
      //
      // Only the number, never the name: canonicalising per keystroke would
      // rewrite "westpac" to "Westpac" under the cursor. The next turn's
      // server response does that, once they have stopped typing.
      if (path === "firm.name") {
        next.firm.afca_member_no = memberNumberFor(typeof value === "string" ? value : "");
      }
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
      return reconcile(previous, next, (p) => p === path);
    });
    setMessages((previous) => [
      ...previous,
      {
        role: "assistant",
        content:
          kind === "narrative"
            ? "Added to your complaint. That's the part most people find hardest — it's done."
            : "Noted as the outcome you're seeking.",
      },
    ]);
  }, []);

  const startOver = useCallback(() => {
    // Abandon anything in flight before clearing, so a reply that is already
    // on its way cannot repopulate the form the person just emptied.
    generationRef.current += 1;
    inflightRef.current?.abort();
    inflightRef.current = null;
    setPending(false);
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
            Authority. Nothing is submitted to AFCA or any firm, and the firm details are
            invented — but messages are sent to this server and to Anthropic&rsquo;s AI, so please
            use made-up personal details. To make a real complaint, go to{" "}
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
            Not sent to AFCA. Use made-up details.{" "}
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
