/**
 * What actually changed on the form, between one state and the next.
 *
 * The chat says what it did; the form holds what was done. Where those two
 * disagree the person believes the chat, because the chat is the thing talking
 * to them — so a reply claiming a field was changed, over a field that did not
 * move, is the same class of failure as `correctSavedClaim` in the chat route:
 * a sentence someone acts on that is not true of the document they will sign.
 *
 * This is deliberately NOT `touchedPaths` in patch.ts. That one reports what a
 * patch asked for, which is the right input for `reconcile` and the wrong one
 * here: a patch that rewrites a field with the value it already holds, and a
 * patch whose write `reconcile` cleared because the branch had shut, both
 * "touch" a path while leaving the form exactly as it was. Truth about the form
 * has to come from the form.
 */
import { type ComplaintState, STAGES, getPath } from "./schema";

/**
 * Paths whose value the person never sees on the form, so a change to one is
 * not something to announce.
 *
 * `drafts.*` is here for the opposite reason to the rest: it is not
 * bookkeeping, it is text being held BACK from the form. The card appearing is
 * already how that gets announced, and "Updated: narrative" beside a card
 * asking for approval would say the write had happened.
 */
const SILENT = new Set([
  "sensitive_offered",
  "firm_note_said",
  "deferred",
  "declined",
  "drafts.narrative",
  "drafts.fair_outcome",
]);

/**
 * Every field path the form can show, in the order the form shows them.
 *
 * Derived from the schema rather than listed, for the reason the README gives
 * for everything else deriving from it: a hand-kept second list drifts, and the
 * drift here would be a field that changes silently.
 */
function formPaths(): string[] {
  const paths: string[] = [];
  for (const stage of STAGES) {
    for (const field of stage.fields) {
      if (SILENT.has(field.path)) continue;
      paths.push(field.path);
    }
  }
  return paths;
}

/**
 * The form paths whose value differs between `before` and `after`, in form
 * order.
 *
 * Form order rather than the order the patch happened to be written in, so the
 * chips under a reply read down the page the way the eye travels — and so two
 * turns changing the same pair of fields describe them the same way.
 */
export function changedPaths(before: ComplaintState, after: ComplaintState): string[] {
  return formPaths().filter((path) => !same(getPath(before, path), getPath(after, path)));
}

/**
 * Did this value stay put?
 *
 * Arrays compare by members in order: `complaint.issues` is a set the person
 * picked, and a list re-sent in the same order with the same entries is the
 * "rewrote what was already there" case that must not count as a change.
 */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}
