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
