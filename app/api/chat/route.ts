/**
 * One conversational turn.
 *
 * The browser sends the full state every turn; the route validates the model's
 * patch, resolves the firm against the directory in code, applies the patch and
 * returns the authoritative next state. The model never owns the state.
 */
import { NextResponse } from "next/server";
import { type ComplaintState, emptyState, findField } from "@/lib/schema";
import { applyPatch, gateDrafts, parsePatch } from "@/lib/patch";
import { type Firm, lookupFirm } from "@/lib/directory";
import { missingFor, nextField, stageProgress } from "@/lib/next";
import { ensureAsk } from "@/lib/continue";
import { type ChatTurn, brainMode, runTurn } from "@/lib/model";
import { patchSchema } from "@/lib/patch";
import { RateLimiter, callerKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
/**
 * A platform-enforced ceiling on the turn, just above the model client's own
 * 60s deadline so the client fails first with a message the person can read.
 */
export const maxDuration = 70;

/**
 * Shared by the requests this instance happens to serve — see lib/rate-limit.ts
 * for why that is a reducer rather than a guarantee.
 */
const limiter = new RateLimiter();

interface ChatRequest {
  state?: ComplaintState;
  history?: ChatTurn[];
  message?: string;
  focus?: string;
}

/**
 * The client sends the whole state every turn, so it is untrusted input like
 * any other. Rebuild it from a known-good empty state rather than believing
 * the shape we were handed.
 */
function sanitiseState(input: unknown): ComplaintState {
  if (!input || typeof input !== "object" || Array.isArray(input)) return emptyState();
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return emptyState();
  return applyPatch(emptyState(), parsed.data);
}

/**
 * A turn's message is a person typing into a chat box, not a payload. The cap
 * bounds what reaches the model: without it a single request can carry as much
 * input as the caller cares to send, and the paid brain is billed for it.
 */
const MESSAGE_MAX = 10_000;

/**
 * The focus path steers the model at one field, so it must name a real one.
 * `findField` is the schema's own list, which keeps the allowlist from drifting
 * as fields are added — and keeps a path like `__proto__.polluted` out of a
 * prompt that interpolates it.
 */
function sanitiseFocus(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  return findField(input) ? input : undefined;
}

function sanitiseHistory(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((turn): turn is ChatTurn =>
      Boolean(turn) &&
      typeof turn === "object" &&
      (turn as ChatTurn).role !== undefined &&
      ((turn as ChatTurn).role === "user" || (turn as ChatTurn).role === "assistant") &&
      typeof (turn as ChatTurn).content === "string",
    )
    .slice(-20)
    // Capping the count alone bounds nothing: twenty turns of unbounded text
    // is still unbounded, and all of it is billed on the way to the model.
    .map((turn) => ({ ...turn, content: turn.content.slice(0, MESSAGE_MAX) }));
}

/**
 * Resolve firm.name against the directory and write back the member number.
 * Doing this in code — not the model — is what makes invented firm details
 * impossible rather than merely discouraged.
 */
function resolveFirm(state: ComplaintState): {
  state: ComplaintState;
  firm: Firm | null;
  note: string | null;
} {
  const name = state.firm.name.trim();
  if (name.length === 0) return { state, firm: null, note: null };

  const result = lookupFirm(name);
  if (result.status === "matched") {
    const next = structuredClone(state);
    next.firm.name = result.firm.name;
    next.firm.afca_member_no = result.firm.afca_member_no;
    return { state: next, firm: result.firm, note: null };
  }
  if (result.status === "ambiguous") {
    const cleared = structuredClone(state);
    cleared.firm.afca_member_no = "";
    const names = result.candidates.map((c) => c.firm.name);
    return {
      state: cleared,
      firm: null,
      note: `Several firms match "${name}": ${names.join(", ")}. Which one is it?`,
    };
  }
  const unmatched = structuredClone(state);
  unmatched.firm.afca_member_no = "";
  return {
    state: unmatched,
    firm: null,
    note: `"${name}" isn't in this demo's firm directory, so there's no member number to attach. The rest of the form still works.`,
  };
}

/**
 * Should this turn's reply carry the unmatched-firm note?
 *
 * The note describes the state, not the turn, so it is recomputed every time —
 * left alone it gets appended to every reply for the rest of the conversation.
 * The route is stateless, so the only record of having said it is what the
 * assistant has already said: repeat it only if it is not already in history.
 *
 * A user echoing the text back does not count as having been told. History is
 * capped at 20 turns upstream, so in a very long conversation the note can
 * surface once more after it scrolls out — rare, and harmless for a demo.
 */
export function shouldSayNote(note: string | null, history: ChatTurn[]): boolean {
  if (!note) return false;
  return !history.some((turn) => turn.role === "assistant" && turn.content.includes(note));
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ChatRequest;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });
    }
    body = parsed as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // `?? ""` only catches null and undefined, so a message of the wrong type —
  // {"message": 42} — reached .trim() and crashed the route with a 500. The
  // type is the check; the nullish default was never one.
  if (typeof body.message !== "string") {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  const message = body.message.trim();
  if (message.length === 0) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Message is too long — keep it under ${MESSAGE_MAX} characters.` },
      { status: 400 },
    );
  }

  // Only the paid brain is worth rationing: the offline one costs nothing and
  // the limiter would otherwise refuse the demo and its own route tests.
  const metered = brainMode() === "claude";
  let limited = false;
  if (metered) {
    const decision = limiter.take(callerKey(request.headers));
    if (!decision.ok) {
      return NextResponse.json(
        {
          error:
            decision.reason === "concurrency"
              ? "The assistant is busy just now — try again in a moment."
              : "That's a lot of messages very quickly. Give it a minute.",
        },
        { status: 429, headers: { "Retry-After": String(decision.retryAfter) } },
      );
    }
    limited = true;
  }

  try {
    return await handleTurn(body, message, sanitiseFocus(body.focus), sanitiseHistory(body.history));
  } finally {
    if (limited) limiter.release();
  }
}

/** The turn itself, once the request has been accepted. */
async function handleTurn(
  body: ChatRequest,
  message: string,
  focus: string | undefined,
  history: ChatTurn[],
): Promise<NextResponse> {
  const incoming = sanitiseState(body.state);

  // Resolve the firm from whatever state we were handed, so the prompt carries
  // real directory facts before the model speaks.
  const resolvedBefore = resolveFirm(incoming);

  let turn;
  try {
    turn = await runTurn({
      state: resolvedBefore.state,
      firm: resolvedBefore.firm,
      history,
      message,
      focusPath: focus,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `The assistant is unavailable: ${detail}` },
      { status: 502 },
    );
  }

  const parsed = parsePatch(turn.patch);
  // The member number is the directory's to assign, never the model's.
  if (parsed.patch.firm) delete parsed.patch.firm.afca_member_no;

  // Approval is a boundary in code, not an instruction in the prompt: the model
  // cannot write the narrative or the outcome sought unless the text is the
  // draft the person has already seen, or the words they just typed themselves.
  const gated = gateDrafts(parsed.patch, resolvedBefore.state, () => message);
  const patch = gated.patch;
  const issues = [...parsed.issues, ...gated.issues];

  const applied = applyPatch(resolvedBefore.state, patch);

  // The firm may have only just been named, so resolve again after applying.
  const resolvedAfter = resolveFirm(applied);
  const state = resolvedAfter.state;

  const note = resolvedAfter.note;
  // The note is context, so it goes above the reply rather than after it: tacked
  // on the end it lands below the question and the turn closes on a statement,
  // leaving the person with nothing to answer.
  const sayNote = shouldSayNote(note, history);
  const withNote = sayNote ? `${note}\n\n${turn.reply}` : turn.reply;

  // The conversation must not dead-end while the form still needs something.
  // Applied to the text actually being sent, so an ambiguous-firm note that asks
  // "Which one is it?" counts as this turn's question — but only when the note is
  // genuinely included, since a note suppressed as a repeat asks nothing.
  const reply = ensureAsk(withNote, state);

  return NextResponse.json({
    reply,
    state,
    missing: missingFor(state),
    next: nextField(state),
    stages: stageProgress(state),
    issues,
    firmNote: resolvedAfter.note,
    mode: turn.mode,
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ mode: brainMode() });
}
