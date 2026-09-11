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
 */
export function ensureAsk(reply: string, state: ComplaintState): string {
  const prompt = outstandingPrompt(state);
  // Nothing left to ask: a reply with no question is the correct ending.
  if (prompt === null) return reply;
  if (endsWithQuestion(reply)) return reply;

  const body = reply.trim();
  return body.length === 0 ? prompt : `${body}\n\n${prompt}`;
}
