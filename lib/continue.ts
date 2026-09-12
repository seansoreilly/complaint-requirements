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
import { endsWithQuestion, outstandingPrompt } from "./questions";

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
  // Nothing left to ask: a reply with no question is the correct ending.
  if (prompt === null) return reply;
  if (endsWithQuestion(reply)) return reply;

  const body = reply.trim();
  return body.length === 0 ? prompt : `${body}\n\n${prompt}`;
}
