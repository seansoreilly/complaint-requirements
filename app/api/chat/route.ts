/**
 * One conversational turn.
 *
 * The browser sends the full state every turn; the route validates the model's
 * patch, resolves the firm against the directory in code, applies the patch and
 * returns the authoritative next state. The model never owns the state.
 */
import { NextResponse } from "next/server";
import { type ComplaintState, emptyState } from "@/lib/schema";
import { type ComplaintPatch, applyPatch, parsePatch } from "@/lib/patch";
import { lookupFirm, resolveFirmDetails } from "@/lib/directory";
import { missingFor, nextField, stageProgress } from "@/lib/next";
import { changedPaths } from "@/lib/changed";
import { pendingDraft } from "@/lib/questions";
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
 * The firm is resolved by `resolveFirmDetails` in lib/directory.ts — writing the
 * member number in code, not letting the model supply it, is what makes invented
 * firm details impossible rather than merely discouraged. It lives there rather
 * than here because the form panel's own edit path needs the same rule, and two
 * copies drifted: the panel had none, so retyping the firm kept the previous
 * firm's number.
 */

/**
 * Set the firm from a bare name the person just typed.
 *
 * Only when the firm is genuinely unresolved (no member number yet), the whole
 * message is short enough to be a name rather than a sentence, and the
 * directory matches it confidently. A refusal, a sentence, or a phrase the
 * directory cannot place is left for the model to handle as it always has.
 */
function takeShortFirmAnswer(state: ComplaintState, message: string): void {
  if (state.firm.afca_member_no !== "") return;
  const said = message.trim();
  if (said.length === 0) return;
  if (said.split(/\s+/).length > 3) return;
  const match = lookupFirm(said);
  if (match.status !== "matched") return;
  state.firm.name = match.firm.name;
}

/**
 * Text reaches the form only through an approval.
 *
 * The prompt asks the model to put its proposal in `drafts.narrative` and wait.
 * One live run quoted the proposal in the reply and wrote `complaint.narrative`
 * straight out, so `app/page.tsx` — which renders the card only when the draft
 * field is set — showed no card at all. The person had no edit box, no Discard,
 * and their "yes" was an inference rather than an act. Nothing was fabricated;
 * the hold simply was not enforced anywhere the live path could see it.
 *
 * So a FIRST write to a draftable field, with no draft pending and the field
 * empty, is a proposal and is diverted into the draft. A write stands only when
 * there was a draft to approve, or the field already held text and this is the
 * edit the person asked for. Panel typing never comes through here, and card
 * approval is client-side, so neither is affected.
 */
function holdDrafts(patch: ComplaintPatch, incoming: ComplaintState): boolean {
  const pairs = [
    ["narrative", patch.complaint?.narrative, incoming.complaint.narrative],
    ["fair_outcome", patch.outcome?.fair_outcome, incoming.outcome.fair_outcome],
  ] as const;

  let diverted = false;
  for (const [key, proposed, existing] of pairs) {
    if (typeof proposed !== "string" || proposed.trim().length === 0) continue;
    // An approval: there was something to approve. The write stands, and the
    // card comes down with it — in code, because the model has to remember to
    // clear the draft and a draft that outlives its approval is now a trap
    // rather than untidiness. `ensureAsk` closes every turn on the approval
    // request while one is pending, so a stale draft would ask the person to
    // approve what they just approved, every turn, with no answer that moves
    // it along. Clicking "Use this" clears it on the client; saying "yes, use
    // it" is the same act down the other path and clears it here.
    if (incoming.drafts[key].trim().length > 0) {
      patch.drafts = { ...patch.drafts, [key]: "" };
      continue;
    }
    // An edit: the field already holds text they approved earlier.
    if (existing.trim().length > 0) continue;

    patch.drafts = { ...patch.drafts, [key]: proposed };
    if (key === "narrative" && patch.complaint) delete patch.complaint.narrative;
    if (key === "fair_outcome" && patch.outcome) delete patch.outcome.fair_outcome;
    diverted = true;
  }
  return diverted;
}

/**
 * A reply that claims text is saved when it is only proposed.
 *
 * When `holdDrafts` diverts a write, the model believed it had put the text on
 * the form and says so — "I've saved that as your complaint description" —
 * while the text is actually sitting on the card awaiting approval. The prompt
 * asks it not to; on the live path it said it anyway, which is the usual result
 * of asking rather than enforcing. The route knows what it did, so the route
 * corrects the claim. Only the false sentence is replaced; the rest of the
 * reply, including whatever it asks next, is left alone.
 *
 * Two shapes, because the model uses both and only one was covered. The pronoun
 * can follow the verb ("I've saved that as your complaint description") or lead
 * it ("that's now saved as your complaint description") — the second is the
 * wording a production transcript actually produced, so the claim the guard
 * exists for was the one getting through.
 */
const SAVED_CLAIM =
  /\b(?:(?:I(?:'ve| have)?\s+)?(?:saved|added|recorded|locked(?:\s+that)?\s+in|put)\b[^.!?]*\b(?:that|this|it)\b|(?:that|this|it)(?:'s| is)?\s+(?:now\s+)?(?:saved|added|recorded|locked\s+in|on\s+the\s+form))\b[^.!?]*[.!?]/i;

/** Does this reply assert the text has landed on the form? */
export function makesSavedClaim(reply: string): boolean {
  return SAVED_CLAIM.test(reply);
}

export function correctSavedClaim(reply: string): string {
  // Ends on a question, because the turn must not dead-end and this sentence
  // is often the whole turn. It used to end on a full stop and rely on
  // `ensureAsk` to append the approval request underneath — which worked only
  // while `asksAboutDraft` did not recognise it, and produced two invitations
  // to the same click once it did. One sentence that both corrects the claim
  // and hands the turn back is the shape that holds either way.
  const replacement =
    "I've put that on the card for you to check — use it, edit it, or discard it. Does it read right?";
  if (!SAVED_CLAIM.test(reply)) {
    return `${replacement}\n\n${reply}`.trim();
  }
  return reply.replace(SAVED_CLAIM, replacement);
}

/**
 * A reply that claims it changed a field, on a turn that changed nothing.
 *
 * `correctSavedClaim` covers one field — text diverted onto a draft card. The
 * same lie has a second shape with no card in it: "I've changed the date to 2
 * September" when the patch wrote nothing, because the model misread the date,
 * or emitted a value `cleanPatch` rejected, or simply narrated an intention.
 * The tester met exactly this and believed the chat, which is the rational
 * thing to do when the chat is the thing talking to you.
 *
 * The route knows what it did: `changedPaths` reads the form before and after.
 * So a claim of change with an empty diff gets one honest sentence in front of
 * it. The reply is not otherwise touched — whatever it asks next still stands,
 * and the person can correct the app from there.
 *
 * Narrow on purpose, and narrower than it first was. The first version took
 * any of eight verbs followed by "to", "as" or "in", which is most of the
 * language: "Has anything changed in your circumstances?", "Have they updated
 * you as to their decision?", "AFCA has a fixed timeframe to respond" and
 * "I've set aside the fees question to come back to" all matched, and all four
 * are turns that write nothing and claim nothing. The correction would have
 * fired on every one of them, denying a claim the person had never been given.
 *
 * So it wants a first-person claim about a field — the app saying it did
 * something — in the two shapes the saved-text guard already found the model
 * using: the pronoun leading the verb, or following it. The same rule
 * `IMPERATIVE_ASK` states in questions.ts holds here: entries come from
 * replies that actually occurred, never from imagination.
 */
const CHANGE_CLAIM =
  /\b(?:I(?:'ve| have)?\s+(?:changed|updated|corrected|amended)|(?:that|this|it)(?:'s| is)?\s+(?:now\s+)?(?:changed|updated|corrected|amended))\b[^.!?]*[.!?]/i;

/** Does this reply assert a field moved? */
export function makesChangeClaim(reply: string): boolean {
  return CHANGE_CLAIM.test(reply);
}

/**
 * Put the truth in front of an unbacked claim.
 *
 * Prepended rather than substituted: unlike the saved-text case there is no
 * single wrong sentence to swap out — the claim may be spread over a reply
 * that is otherwise fine — and the person needs to know the form did not move
 * before they read on and act as though it did.
 */
export function flagUnbackedClaim(reply: string): string {
  return `I haven't actually changed anything on the form just now — tell me the value and I'll put it in, or type it into the form on the right.\n\n${reply}`;
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
  // The state exactly as the person sent it, kept for the change diff at the
  // end. It has to be taken here, before `takeShortFirmAnswer` and
  // `resolveFirmDetails` run: those are writes the route makes on the person's
  // behalf, and they are the demo's opening beat — someone types "Westpac" and
  // the firm and its member number appear. Diffing from after them would call
  // that turn "nothing changed" and hide the one write the split screen exists
  // to show.
  const asSent = structuredClone(incoming);
  const history = sanitiseHistory(body.history);
  const focus = typeof body.focus === "string" ? body.focus : undefined;

  // Resolve the firm from whatever state we were handed, so the prompt carries
  // real directory facts before the model speaks.
  // A short answer while the firm is unresolved IS the firm's name.
  //
  // Case 12: the app asked for the fund's full name and ended by offering to
  // defer — "tell me and I'll come back to it later". Helen answered "Rest".
  // The model read its own offer being taken up, said "I'll leave the fund's
  // name aside", and she had to answer the same question twice. It reproduces
  // 3/3 with that offer present and 0/3 without it, so the offer is what makes
  // "rest" readable as a verb.
  //
  // `lookupFirm` is already the authority on firm identity — the route strips
  // any member number the model invents and takes the directory's. This just
  // asks it first, before the model gets a chance to read a name as a refusal.
  takeShortFirmAnswer(incoming, message);
  const resolvedBefore = resolveFirmDetails(incoming);

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
  const heldForApproval = holdDrafts(patch, resolvedBefore.state);
  const applied = applyPatch(resolvedBefore.state, patch);

  // The firm may have only just been named, so resolve again after applying.
  const resolvedAfter = resolveFirmDetails(applied);
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
  // Two ways a reply can claim text is on the form when it is not. `holdDrafts`
  // diverting a write is one. The other is a draft left pending after the turn:
  // the card was already up, the model said "that's now saved" and moved on, and
  // its patch wrote nothing — so nothing was diverted and, before this, nothing
  // was corrected. Either way the state is the authority on what happened.
  //
  // The pending case tests the wording first, because `correctSavedClaim`
  // prepends its line when it finds no claim to replace. That is right after a
  // divert, where the card is news; it would be a nag on every ordinary turn
  // spent editing a draft that is already on screen.
  const staleClaim = pendingDraft(state) !== null && makesSavedClaim(withNote);
  const divertedOrStale = heldForApproval || staleClaim;
  const corrected = divertedOrStale ? correctSavedClaim(withNote) : withNote;

  // What this turn actually did to the form, read from the form rather than
  // from the patch — see lib/changed.ts for why those differ. The browser
  // renders it as chips under the reply and flashes the fields themselves, so
  // a claimed change the person cannot see becomes one they can, and a claim
  // with nothing behind it has nothing to show.
  const changed = changedPaths(asSent, state);

  // A claim that a field moved, on a turn where none did. Skipped when the
  // draft guard has already spoken: that case has its own, more specific
  // correction, and two apologies stacked above one reply is worse than the
  // lie they are fixing.
  const unbacked = !divertedOrStale && changed.length === 0 && makesChangeClaim(corrected);
  const reply = ensureAsk(unbacked ? flagUnbackedClaim(corrected) : corrected, state);

  return NextResponse.json({
    reply,
    state,
    changed,
    missing: missingFor(state),
    next: nextField(state),
    stages: stageProgress(state),
    // Only what the person can act on. An internal issue — a schema failure,
    // a silent trim — is the model's mistake in the model's vocabulary, and it
    // appeared in a live chat as "· Patch did not match the schema." beneath a
    // reply claiming the field had been recorded. It stays in the server log,
    // where [turn-parse-failed] already records the whole envelope.
    issues: [...(turn.issues ?? []), ...issues].filter((issue) => issue.personFacing),
    firmNote: resolvedAfter.note,
    mode: turn.mode,
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ mode: brainMode() });
}
