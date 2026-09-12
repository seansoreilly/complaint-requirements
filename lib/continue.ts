/**
 * Keeping the conversation going until the form is actually finished.
 *
 * The prompt asks the model to end every turn with a question, but asking is
 * not the same as guaranteeing. A turn that trails off without a question is a
 * dead end: the person has nothing to answer, so the form stays half-filled.
 * Code closes that gap here, the same way code — not the model — owns the state
 * and the member number.
 */
import { type ComplaintState } from "./schema";
import { endsWithQuestion, outstandingPrompt, questionFor } from "./questions";
import { askableFor } from "./next";

/**
 * Return the reply, guaranteed to ask for something while anything is
 * outstanding. A reply that already asks is left exactly as written — the
 * model's own wording is better than a generic fallback.
 */
export function ensureAsk(
  reply: string,
  state: ComplaintState,
  said = "",
): string {
  if (endsWithQuestion(reply)) return reply;

  // What the person just said can decline a field a turn before the model
  // records it in `declined`. On a live run someone said "I'm honestly not sure
  // which type of cover it was", the model answered "I'll leave the product
  // type blank for now" — and the NEXT turn ended with the canonical bare list
  // for that very field appended underneath, because `declined` did not catch
  // up until the turn after. That is defect 16's shape reached through the gap.
  //
  // The route cannot read intent, but it can read the sentence. If they have
  // just declined, the outstanding field waits one turn; the next field is
  // asked instead, and the model's own record catches up behind it.
  const declining = DECLINE.test(said);
  const prompt = declining ? nextAskableAfterDecline(state) : outstandingPrompt(state);
  // Nothing left to ask: a reply with no question is the correct ending.
  if (prompt === null) return reply;

  const body = reply.trim();
  return body.length === 0 ? prompt : `${body}\n\n${prompt}`;
}

/**
 * The ways people actually refuse, as seen in transcripts. Deliberately narrow:
 * it suppresses one field for one turn, so a false positive costs a delayed
 * question and a false negative costs the defect this exists to stop.
 */
const DECLINE =
  /\b(not sure|don'?t know|no idea|can'?t remember|don'?t remember|rather not|skip (?:that|it|this)|don'?t have (?:that|it|one)|unsure)\b/i;

/**
 * The field after the one on the table. Returns null when that was the last
 * thing outstanding — an honest ending beats re-offering what they refused.
 */
function nextAskableAfterDecline(state: ComplaintState): string | null {
  const queue = askableFor(state);
  if (queue.length < 2) return null;
  const after = queue[1];
  return questionFor(after.path, after.label, state);
}
