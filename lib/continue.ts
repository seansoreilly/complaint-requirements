/**
 * Keeping the conversation going until the form is actually finished.
 *
 * The prompt asks the model to end every turn with a question, but asking is
 * not the same as guaranteeing. A turn that trails off without a question is a
 * dead end: the person has nothing to answer, so the form stays half-filled.
 * Code closes that gap here, the same way code — not the model — owns the state
 * and the member number.
 */
import {
  type ComplaintState,
  SERVICE_ISSUES,
  SERVICE_SUBTYPES,
  SERVICE_TYPES,
} from "./schema";
import { type MissingField, nextField } from "./next";
import {
  completionHandoff,
  endsWithQuestion,
  needsCompletionHandoff,
  outstandingPrompt,
  pendingDraft,
} from "./questions";

/**
 * Return the reply, guaranteed to ask for something while anything is
 * outstanding. A reply that already asks is left exactly as written — the
 * model's own wording is better than a generic fallback.
 *
 * This deliberately does NOT inspect what the person just said. It asked for
 * whatever `outstandingPrompt` offers, and the job of knowing a field has been
 * refused belongs to the state: `deferred` and `declined` are filtered out by
 * `askableFor`, which `outstandingPrompt` reads. An earlier attempt at defect
 * 24 put a decline-detecting regex here instead, and it could not work — the
 * refusal and the reply that trails off are usually a turn or more apart, so
 * by the time the append happens the person is talking about something else.
 * A gap between turns has to be closed by state, not by reading one sentence.
 */
export function ensureAsk(reply: string, state: ComplaintState): string {
  const prompt = outstandingPrompt(state);
  // Nothing required is left. That is not the same as nothing left to say: the
  // form ends, the conversation should hand over. Without this the demo
  // stopped on whatever the model said last — the tester's ended one message
  // after contact details, before the optional questions, with no route to the
  // review. `needsCompletionHandoff` fires once, at the hinge.
  if (prompt === null) {
    if (!needsCompletionHandoff(state)) return reply;
    if (endsWithQuestion(reply)) return reply;
    // A reply that already sends them to the review has done this job in its
    // own words, which are better than these. That is not a cosmetic
    // preference: the turn where someone declines the last required field
    // often ends "your form is ready for review", and stacking a second,
    // longer sign-off under a boundary the app has just agreed to respect is
    // how "I won't ask again" starts sounding like a preamble.
    if (/\breview\b/i.test(reply)) return reply;
    const body = reply.trim();
    const handoff = completionHandoff();
    return body.length === 0 ? handoff : `${body}\n\n${handoff}`;
  }

  // A draft on screen is a question already asked, so it owns the turn until
  // it is resolved. `outstandingPrompt` has preferred the approval request
  // over the next field all along, but only for the question this function
  // APPENDS — and the observed failure was the model's own. It ended its reply
  // with the next field's question, `endsWithQuestion` saw a question and left
  // it alone, and the person answered it with the card still up. The next turn
  // had no record of the answer belonging to that question, so it asked again:
  // the court case twice, either side of a card nobody had approved.
  //
  // So while a draft waits, the turn closes on the approval request whoever
  // wrote the reply. Enforced here rather than asked for in the prompt, for
  // the reason every other rule in this file is: asking is not guaranteeing.
  if (pendingDraft(state)) return closeOnApproval(reply, prompt);

  if (endsWithQuestion(reply)) return reply;

  // The reply may ask for the field in wording `endsWithQuestion` does not
  // recognise — there is always another way to invite an answer, so chasing
  // phrasings is endless. Ask instead whether THIS field has already been put
  // to them. On case 12 the canonical list was stacked under a reply that had
  // just listed the same options and offered a way out, on the one turn a
  // deferred field returns: the app pressed twice in one breath about the very
  // thing it had promised to be gentle on.
  const next = nextField(state);
  if (next && alreadyAsks(reply, next, state)) return reply;

  const body = reply.trim();
  return body.length === 0 ? prompt : `${body}\n\n${prompt}`;
}

/**
 * End the turn on the approval request, dropping a question that jumps ahead
 * of the card.
 *
 * What the reply said before that question is kept: it is the model explaining
 * the write-up it just proposed, which is the useful half of the turn. Only
 * the closing question goes, and only when it is not already about the draft —
 * "does that read right to you?" is the right question in the model's own
 * words, and its wording beats this one.
 */
function closeOnApproval(reply: string, prompt: string): string {
  const body = reply.trim();
  if (body.length === 0) return prompt;
  if (asksAboutDraft(body)) return reply;

  const kept = dropTrailingQuestion(body);
  return kept.length === 0 ? prompt : `${kept}\n\n${prompt}`;
}

/**
 * Does the closing stretch already put the card to the person?
 *
 * Not "does it end with a question": the route's own correction for a false
 * saved-claim ends "I've put that on the card for you to check — use it, edit
 * it, or discard it.", which is an invitation with no question mark in it.
 * Requiring one stacked the approval request underneath that sentence — two
 * invitations to the same click, on exactly the turn the draft guard fires.
 *
 * The phrases are specific to the card instead. Bare "change" and "edit" are
 * deliberately absent: "Would you like to change your email?" would defeat the
 * gate, which is the defect this exists to close.
 */
function asksAboutDraft(reply: string): boolean {
  const tail = reply.split(/\n\s*\n/).slice(-1)[0]?.toLowerCase() ?? "";
  return /\b(read right|look right|sound right|approve|use it|as it is|that capture|happy with (?:that|it)|tell me what to change|on the card|discard it|rewrite it|the wording|that draft|write-?up)\b/.test(
    tail,
  );
}

/**
 * Remove the trailing question, leaving the statements before it.
 *
 * Paragraph first, because a question that got its own paragraph is a whole
 * thought and takes any lead-in with it ("One more thing. Is there a court
 * case?"). Otherwise sentence by sentence from the end, so a question tacked
 * onto a paragraph of explanation costs only the question.
 */
function dropTrailingQuestion(reply: string): string {
  const paragraphs = reply.split(/\n\s*\n/);
  if (paragraphs.length > 1 && paragraphs[paragraphs.length - 1].includes("?")) {
    return paragraphs.slice(0, -1).join("\n\n").trim();
  }

  const sentences = reply.split(/(?<=[.!?])\s+/);
  while (sentences.length > 0 && sentences[sentences.length - 1].includes("?")) {
    sentences.pop();
  }
  return sentences.join(" ").trim();
}

/**
 * Has this reply already asked for this field?
 *
 * Not "does it end with a question" — that is `endsWithQuestion`, and it is
 * about the sentence. This is about the field: its label, or enough of its
 * options to be an offer rather than a mention. Two options are the threshold,
 * so "you mentioned TPD cover earlier" is not an ask and a list of three is.
 */
export function alreadyAsks(
  reply: string,
  field: MissingField,
  state: ComplaintState,
): boolean {
  const text = reply.toLowerCase();
  if (text.includes(field.label.toLowerCase())) return true;

  const options = optionsFor(field.path, state);
  if (options.length === 0) return false;
  const hits = options.filter((o) => text.includes(o.toLowerCase())).length;
  return hits >= 2;
}

/** The option list a field offers, if it has one. */
function optionsFor(path: string, state: ComplaintState): readonly string[] {
  if (path === "service.subtype") return SERVICE_SUBTYPES[state.service.type] ?? [];
  if (path === "complaint.issues") return SERVICE_ISSUES[state.service.type] ?? [];
  if (path === "service.type") return SERVICE_TYPES;
  return [];
}
