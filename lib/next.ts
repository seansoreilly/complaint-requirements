/**
 * What is still missing, and what to ask next.
 *
 * Code owns this decision, not the model — the model receives the answer as a
 * hint. Nothing here blocks progress: a person can skip a field and come back,
 * so "missing" describes the form, it does not gate the conversation.
 */
import {
  type ComplaintState,
  type FieldDef,
  type StageDef,
  STAGES,
  getPath,
} from "./schema";

/** Does this field apply, given the branches the person has taken? */
export function applies(field: FieldDef, state: ComplaintState): boolean {
  return field.showIf ? field.showIf(state) : true;
}

/** A field counts as answered when it holds a real value — `false` included. */
export function isAnswered(field: FieldDef, state: ComplaintState): boolean {
  const value = getPath(state, field.path);
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  // A consent tick is only answered when actually ticked; for a yes/no question
  // an explicit `false` is a real answer.
  if (field.kind === "consent") return value === true;
  return true;
}

export interface MissingField {
  path: string;
  label: string;
  stageId: string;
}

/** Required, applicable and unanswered — in form order. */
export function missingFor(state: ComplaintState): MissingField[] {
  const missing: MissingField[] = [];
  for (const stage of STAGES) {
    for (const field of stage.fields) {
      if (!field.required) continue;
      if (!applies(field, state)) continue;
      if (isAnswered(field, state)) continue;
      missing.push({ path: field.path, label: field.label, stageId: stage.id });
    }
  }
  return missing;
}

export function stageComplete(stage: StageDef, state: ComplaintState): boolean {
  const required = stage.fields.filter((f) => f.required && applies(f, state));
  // A stage with nothing required (attachments) is "done" only once the person
  // has actually put something there — otherwise it ticks before it is visited.
  if (required.length === 0) {
    return stage.fields.some((f) => isAnswered(f, state));
  }
  return required.every((f) => isAnswered(f, state));
}

export function stageProgress(state: ComplaintState): { id: string; title: string; complete: boolean }[] {
  return STAGES.map((stage) => ({
    id: stage.id,
    title: stage.title,
    complete: stage.id === "review" ? missingFor(state).length === 0 : stageComplete(stage, state),
  }));
}

/** The single next thing worth asking about, or null when the form is done. */
export function nextField(state: ComplaintState): MissingField | null {
  return missingFor(state)[0] ?? null;
}

/**
 * Fields that naturally get asked together, so the assistant can group them
 * instead of drip-feeding one question per turn.
 */
export function groupedWithNext(state: ComplaintState): MissingField[] {
  const next = nextField(state);
  if (!next) return [];
  const missing = missingFor(state);
  if (next.stageId === "contact") {
    // Name, email and address belong in one breath; DOB and contact preference
    // stay separate so skipping one doesn't stall the others.
    const together = new Set([
      "complainant.first_name",
      "complainant.last_name",
      "complainant.email",
      "complainant.address.line1",
      "complainant.address.suburb",
      "complainant.address.state",
      "complainant.address.postcode",
    ]);
    if (together.has(next.path)) return missing.filter((m) => together.has(m.path));
  }
  if (next.stageId === "authority") {
    return missing.filter((m) => m.stageId === "authority");
  }
  return [next];
}

/** Sensitive prompts are offered once; this reports whether that has happened. */
export function sensitiveOffered(state: ComplaintState): boolean {
  const c = state.complainant;
  return (
    c.pronoun.trim() !== "" ||
    c.interpreter !== null ||
    c.support_needs.trim() !== "" ||
    c.currently_experiencing.trim() !== ""
  );
}
