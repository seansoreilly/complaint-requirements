"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChatPane, type Message } from "@/components/ChatPane";
import { MainMenu } from "@/components/MainMenu";
import { DraftCard } from "@/components/DraftCard";
import { FormPane, type StageStatus } from "@/components/FormPane";
import { ReviewPanel } from "@/components/ReviewPanel";
import { type ComplaintState, emptyState, findField, setPath } from "@/lib/schema";
import { cleanPatch } from "@/lib/patch";
import { missingFor, stageProgress } from "@/lib/next";
// PROTOTYPE: avatar concepts, switchable via ?variant=A|B|C. Remove with
// components/prototype-avatars.tsx and components/PrototypeSwitcher.tsx.
import { AVATARS, VARIANT_NAMES } from "@/components/prototype-avatars";
import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";

const OPENER =
  "Hello — I can help you put together a complaint to AFCA, just by talking it through. " +
  "Nothing here is sent anywhere; it's a demo.\n\nTo start: which financial firm is your complaint about?";

/** PROTOTYPE: the switcher pushes the URL, then pokes this event to re-read it. */
const VARIANT_EVENT = "prototype-variant-change";

function subscribeToVariant(onChange: () => void): () => void {
  window.addEventListener(VARIANT_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(VARIANT_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export default function Page() {
  const [state, setState] = useState<ComplaintState>(emptyState);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: OPENER }]);
  const [pending, setPending] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [mode, setMode] = useState<"claude" | "mock" | null>(null);
  const [showReview, setShowReview] = useState(false);
  // PROTOTYPE: useSyncExternalStore reads the URL identically on server and
  // client, so switching variants doesn't trip a hydration mismatch.
  const variant = useSyncExternalStore(
    subscribeToVariant,
    () => {
      const fromUrl = new URLSearchParams(window.location.search).get("variant");
      return fromUrl && fromUrl in AVATARS ? fromUrl : "A";
    },
    () => "A",
  );

  const chooseVariant = useCallback((next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(VARIANT_EVENT));
  }, []);

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
      setMessages((previous) => [...previous, { role: "user", content: text }]);
      setPending(true);
      setNotes([]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, history, message: text, focus: focusPath ?? undefined }),
        });
        const data = await response.json();

        if (!response.ok) {
          setMessages((previous) => [
            ...previous,
            { role: "assistant", content: data.error ?? "Something went wrong." },
          ]);
          return;
        }

        setState(data.state as ComplaintState);
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
      // Re-run coercion so a typed date still normalises.
      if (typeof value === "string" && findField(path)?.kind === "date") {
        const segments = path.split(".");
        const container = segments.slice(0, -1).join(".");
        const key = segments[segments.length - 1];
        const probe =
          container === "complained_to_firm"
            ? { complained_to_firm: { [key]: value } }
            : container === "complainant"
              ? { complainant: { [key]: value } }
              : null;
        if (probe) {
          const { patch } = cleanPatch(probe);
          const coerced =
            container === "complained_to_firm"
              ? patch.complained_to_firm?.date
              : patch.complainant?.dob;
          if (coerced) setPath(next, path, coerced);
        }
      }
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
      return next;
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
            focusField={focusField}
            onClearFocus={() => setFocusPath(null)}
            onSend={send}
            Avatar={AVATARS[variant]}
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

      <PrototypeSwitcher
        variants={Object.keys(AVATARS)}
        current={variant}
        names={VARIANT_NAMES}
        onChange={chooseVariant}
      />
    </main>
  );
}
