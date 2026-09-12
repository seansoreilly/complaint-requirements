/**
 * One conversational turn.
 *
 * The browser sends the full state every turn; the route validates the model's
 * patch, resolves the firm against the directory in code, applies the patch and
 * returns the authoritative next state. The model never owns the state.
 */
import { NextResponse } from "next/server";
import { type ComplaintState, emptyState } from "@/lib/schema";
import { applyPatch, parsePatch } from "@/lib/patch";
import { type Firm, lookupFirm } from "@/lib/directory";
import { missingFor, nextField, stageProgress } from "@/lib/next";
import { ensureAsk } from "@/lib/continue";
import { type ChatTurn, brainMode, runTurn } from "@/lib/model";
import { patchSchema } from "@/lib/patch";

export const dynamic = "force-dynamic";

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
    .slice(-20);
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
    // One candidate is not "several". After the generic-word fix (defect 19),
    // "super fund" comes back ambiguous with Hesta alone — and a person told
    // "several firms match" and then shown one name will reasonably confirm
    // that one, which lands them on Hesta by a longer route. Naming it as the
    // only near match, and asking for the full name, keeps the choice theirs.
    const note =
      names.length === 1
        ? `The closest match to "${name}" in this demo's directory is ${names[0]}, ` +
          `but that may not be the firm you mean. What is its full name?`
        : `Several firms match "${name}": ${names.join(", ")}. Which one is it?`;
    return { state: cleared, firm: null, note };
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
export function shouldSayNote(
  note: string | null,
  history: ChatTurn[],
  alreadySaid = false,
): boolean {
  if (!note) return false;
  // The flag is the reliable record; history is the fallback for a state that
  // predates it. Either one saying "told them" is enough to stay quiet.
  if (alreadySaid) return false;
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

  const message = (body.message ?? "").trim();
  if (message.length === 0) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const incoming = sanitiseState(body.state);
  const history = sanitiseHistory(body.history);
  const focus = typeof body.focus === "string" ? body.focus : undefined;

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

  const { patch, issues } = parsePatch(turn.patch);
  // The member number is the directory's to assign, never the model's.
  if (patch.firm) delete patch.firm.afca_member_no;
  // Whether the note has been said is a fact about what this route did, not
  // something the model gets a view on.
  delete patch.firm_note_said;
  const applied = applyPatch(resolvedBefore.state, patch);

  // The firm may have only just been named, so resolve again after applying.
  const resolvedAfter = resolveFirm(applied);
  const state = resolvedAfter.state;

  const note = resolvedAfter.note;
  // The note is context, so it goes above the reply rather than after it: tacked
  // on the end it lands below the question and the turn closes on a statement,
  // leaving the person with nothing to answer.
  // The note names the firm, so a correction to a different firm is a different
  // note and has to be said again. Comparing the recorded name against the
  // current one does that without a separate reset.
  const noteAlreadySaid = state.firm_note_said === state.firm.name.trim().toLowerCase();
  const sayNote = shouldSayNote(note, history, noteAlreadySaid);
  const withNote = sayNote ? `${note}\n\n${turn.reply}` : turn.reply;
  // Record it in the state we return, so the next turn knows regardless of how
  // far the history window has slid.
  if (sayNote || noteAlreadySaid) state.firm_note_said = state.firm.name.trim().toLowerCase();

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
    issues: [...(turn.issues ?? []), ...issues],
    firmNote: resolvedAfter.note,
    mode: turn.mode,
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ mode: brainMode() });
}
