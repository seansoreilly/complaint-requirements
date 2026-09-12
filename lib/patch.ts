/**
 * Patch validation and application.
 *
 * The model proposes a deep-partial patch; nothing it returns reaches the state
 * until it has been parsed, coerced and range-checked here. Unanswered stays
 * null/""; an answered "no" is a real `false`, and the two must not collapse.
 */
import { z } from "zod";
import {
  type ComplaintState,
  NARRATIVE_MAX,
  SERVICE_SUBTYPES,
  SERVICE_TYPES,
  STAGES,
  emptyState,
  getPath,
  setPath,
} from "./schema";
import { applies } from "./next";

const addressPatch = z
  .object({
    line1: z.string(),
    line2: z.string(),
    suburb: z.string(),
    state: z.string(),
    postcode: z.string(),
    country: z.string(),
  })
  .partial();

/** Mirrors ComplaintState, every field optional and nullable where the state is. */
export const patchSchema = z
  .object({
    sensitive_offered: z.boolean(),
    /**
     * Carried through `sanitiseState` so the flag survives the round trip, but
     * the route recomputes it every turn from whether it actually said the
     * note — the model proposing one here changes nothing.
     */
    firm_note_said: z.string(),
    /**
     * Paths the person has refused; unknown paths are dropped in `applyPatch`.
     *
     * Described rather than bare, for the same reason `reply` and `patch` are:
     * this is one field among 49 in the tool schema, and a prose instruction in
     * the system prompt did not reach it. A live decline produced the right
     * reply and an empty list — the model had nowhere obvious to put it.
     */
    declined: z
      .array(z.string())
      .describe(
        "Field paths the person has declined to answer, e.g. [\"service.subtype\"]. " +
          "Add a path here when they have said they do not know or will not say and " +
          "you have told them you will leave it blank. This is what actually stops " +
          "the form asking again — say it here as well as in the reply, or they get " +
          "asked a question you just promised to drop. Include paths already in the " +
          "list; send the full list, not only what is new.",
      ),
    firm: z
      .object({
        name: z.string(),
        afca_member_no: z.string(),
        reference: z.string(),
        no_reference: z.boolean(),
      })
      .partial(),
    open_afca_complaint: z.boolean().nullable(),
    complained_to_firm: z
      .object({
        yes: z.boolean().nullable(),
        date: z.string(),
        how: z.string(),
        final_reply: z.boolean().nullable(),
      })
      .partial(),
    legal_proceedings: z.boolean().nullable(),
    service: z.object({ type: z.string(), subtype: z.string() }).partial(),
    complaint: z
      .object({
        issues: z.array(z.string()),
        narrative: z.string(),
        lodged_elsewhere: z.string(),
      })
      .partial(),
    attachments: z.array(z.string()),
    outcome: z
      .object({
        seeking_compensation: z.enum(["yes", "no", "not_sure"]).nullable(),
        fair_outcome: z.string(),
      })
      .partial(),
    complainant: z
      .object({
        lodging_for: z.string(),
        first_name: z.string(),
        last_name: z.string(),
        email: z.string(),
        dob: z.string(),
        mobile: z.string(),
        address: addressPatch,
        pronoun: z.string(),
        interpreter: z.boolean().nullable(),
        interpreter_language: z.string(),
        support_needs: z.string(),
        currently_experiencing: z.string(),
        notify_by: z.string(),
      })
      .partial(),
    consents: z.object({ authority: z.boolean(), engagement_charter: z.boolean() }).partial(),
    drafts: z.object({ narrative: z.string(), fair_outcome: z.string() }).partial(),
  })
  .partial();

export type ComplaintPatch = z.infer<typeof patchSchema>;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Coerce a human date to ISO. Handles "3 Sept", "3 September 2025", "3/9/2025"
 * (day-first, as Australians write it) and passes ISO through. A bare
 * day-and-month is read as the most recent such date, not a future one.
 */
export function coerceDate(input: string, today = new Date()): string {
  const value = input.trim();
  if (value.length === 0) return "";

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return format(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/.exec(value);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = slash[3] ? expandYear(Number(slash[3])) : inferYear(month, day, today);
    return format(year, month, day);
  }

  const words = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]{3,})\.?(?:\s+(\d{2,4}))?$/.exec(value);
  if (words) {
    const month = MONTHS[words[2].slice(0, 3).toLowerCase()];
    if (!month) return "";
    const day = Number(words[1]);
    const year = words[3] ? expandYear(Number(words[3])) : inferYear(month, day, today);
    return format(year, month, day);
  }

  const wordsFirst = /^([a-zA-Z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?$/.exec(value);
  if (wordsFirst) {
    const month = MONTHS[wordsFirst[1].slice(0, 3).toLowerCase()];
    if (!month) return "";
    const day = Number(wordsFirst[2]);
    const year = wordsFirst[3] ? expandYear(Number(wordsFirst[3])) : inferYear(month, day, today);
    return format(year, month, day);
  }

  return "";
}

function expandYear(year: number): number {
  if (year >= 1000) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

/** A month/day with no year means this year if it has passed, else last year. */
function inferYear(month: number, day: number, today: Date): number {
  const year = today.getFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const cutoff = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return candidate.getTime() > cutoff.getTime() ? year - 1 : year;
}

/** Days in each month, accounting for leap years. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function format(year: number, month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1) return "";
  // 31 February is not a date, however confidently it was typed.
  if (day > daysInMonth(year, month)) return "";
  if (year < 1900 || year > 2100) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Neither a complaint nor a birth can have happened after today. */
function isFuture(iso: string, today: Date): boolean {
  if (iso === "") return false;
  const cutoff = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
  return iso > cutoff;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Case-insensitive match back to the canonical enum spelling. */
function coerceEnum(value: string, options: readonly string[]): string {
  const found = options.find((o) => o.toLowerCase() === value.trim().toLowerCase());
  return found ?? "";
}

export interface PatchIssue {
  path: string;
  message: string;
}

export interface CleanResult {
  patch: ComplaintPatch;
  issues: PatchIssue[];
}

/**
 * Normalise a parsed patch: dates to ISO, enums to canonical spelling, strings
 * trimmed, narrative capped. Anything unusable is dropped and reported rather
 * than written through.
 */
export function cleanPatch(raw: ComplaintPatch, today = new Date()): CleanResult {
  const patch: ComplaintPatch = structuredClone(raw);
  const issues: PatchIssue[] = [];

  if (patch.complained_to_firm?.date !== undefined) {
    const coerced = coerceDate(patch.complained_to_firm.date, today);
    if (coerced === "" && patch.complained_to_firm.date.trim() !== "") {
      issues.push({ path: "complained_to_firm.date", message: "Could not read that as a date." });
      delete patch.complained_to_firm.date;
    } else if (isFuture(coerced, today)) {
      issues.push({
        path: "complained_to_firm.date",
        message: "That date is in the future — when did you contact them?",
      });
      delete patch.complained_to_firm.date;
    } else {
      patch.complained_to_firm.date = coerced;
    }
  }

  if (patch.complainant?.dob !== undefined) {
    const coerced = coerceDate(patch.complainant.dob, today);
    if (coerced === "" && patch.complainant.dob.trim() !== "") {
      issues.push({ path: "complainant.dob", message: "Could not read that as a date." });
      delete patch.complainant.dob;
    } else if (isFuture(coerced, today)) {
      issues.push({ path: "complainant.dob", message: "That date of birth is in the future." });
      delete patch.complainant.dob;
    } else {
      patch.complainant.dob = coerced;
    }
  }

  if (patch.complainant?.email !== undefined && patch.complainant.email.trim() !== "") {
    if (!isValidEmail(patch.complainant.email)) {
      issues.push({ path: "complainant.email", message: "That email address looks incomplete." });
      delete patch.complainant.email;
    } else {
      patch.complainant.email = patch.complainant.email.trim();
    }
  }

  if (patch.service?.type !== undefined && patch.service.type.trim() !== "") {
    const coerced = coerceEnum(patch.service.type, SERVICE_TYPES);
    if (coerced === "") {
      issues.push({ path: "service.type", message: "Not a recognised service type." });
      delete patch.service.type;
    } else {
      patch.service.type = coerced;
    }
  }

  // Only coerce the subtype for the service types we model in full; the rest
  // are stubbed and take free text.
  if (patch.service?.subtype !== undefined && patch.service.subtype.trim() !== "") {
    const type = patch.service.type;
    const options = type ? SERVICE_SUBTYPES[type] : undefined;
    if (options) {
      const coerced = coerceEnum(patch.service.subtype, options);
      patch.service.subtype = coerced === "" ? patch.service.subtype.trim() : coerced;
    } else {
      patch.service.subtype = patch.service.subtype.trim();
    }
  }

  for (const key of ["narrative", "fair_outcome"] as const) {
    const container = key === "narrative" ? patch.complaint : patch.outcome;
    if (!container) continue;
    const text = key === "narrative" ? patch.complaint?.narrative : patch.outcome?.fair_outcome;
    if (typeof text === "string" && text.length > NARRATIVE_MAX) {
      issues.push({ path: key, message: `Trimmed to ${NARRATIVE_MAX} characters.` });
      if (key === "narrative" && patch.complaint) patch.complaint.narrative = text.slice(0, NARRATIVE_MAX);
      if (key === "fair_outcome" && patch.outcome) patch.outcome.fair_outcome = text.slice(0, NARRATIVE_MAX);
    }
  }

  if (patch.drafts?.narrative !== undefined && patch.drafts.narrative.length > NARRATIVE_MAX) {
    patch.drafts.narrative = patch.drafts.narrative.slice(0, NARRATIVE_MAX);
  }

  return { patch, issues };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Clear answers that the latest change has just made inapplicable.
 *
 * Two ways an answer can go stale, and both produce a document that
 * contradicts itself if left alone:
 *
 * 1. A branch closes. `showIf` hides the field, so the review panel stops
 *    showing it — but the value is still in the state and still ships in the
 *    JSON export. Saying "no, I never complained to them" should not leave
 *    "I complained by email on 3 September" in the exported file.
 *
 * 2. The service type changes. `service.subtype` and `complaint.issues` are
 *    drawn from lists that belong to a specific service type, but neither
 *    field has a `showIf` guard — their validity depends on a sibling's
 *    *value*, which `applies()` cannot express. Switching Superannuation to
 *    Credit would otherwise leave "Credit / Insurance in superannuation
 *    (TPD)" on the form, counted as answered and shown as complete.
 *
 * Anything the same change explicitly set is kept: the demo paragraph fills
 * type, subtype and issues in one patch, and that must survive — and so must
 * "I emailed them a formal complaint on 5 August", which opens the branch and
 * fills it in a single turn.
 */
export function reconcile(
  previous: ComplaintState,
  next: ComplaintState,
  touched: (path: string) => boolean = () => false,
): ComplaintState {
  const blank = emptyState();

  for (const stage of STAGES) {
    for (const field of stage.fields) {
      if (!field.showIf) continue;
      // One rule: a field whose branch is shut holds nothing, however it got
      // there. `touched` is deliberately NOT consulted — it protects a field
      // the same change set, which is right when that change opens the branch
      // ("I emailed them a formal complaint on 5 August" fills yes, date and
      // how at once, and `applies` is true afterwards so nothing is cleared),
      // and wrong when it does not. Iris said "I emailed them on 5 August"
      // before anyone had established whether that email was a complaint, so
      // the date and channel were written while `yes` was still null. When she
      // clarified it was a query, yes went null → false — never open, so the
      // old applicable→not-applicable test never fired, and her form exported
      // saying she had not complained beside the date she complained and how.
      if (!applies(field, next)) {
        setPath(next, field.path, getPath(blank, field.path));
      }
    }
  }

  // The service type's dependants. Presence in the change is the only reliable
  // signal here: four of the six service types are unmodelled and take free
  // text, so an old subtype would pass any "is this valid now?" check.
  const typeChanged =
    previous.service.type !== "" && previous.service.type !== next.service.type;
  if (typeChanged) {
    if (!touched("service.subtype")) next.service.subtype = "";
    if (!touched("complaint.issues")) next.complaint.issues = [];
  }

  // The declined list. Two things keep it honest, and both have to happen here
  // rather than in the merge, because the form panel writes state without ever
  // going near a patch.
  //
  // A path that is not a real required field is dropped: the list drives what
  // the assistant stops asking for, so an invented entry would silently retire
  // a question. And an entry whose field now holds a value is dropped too — a
  // refusal is not a lock, and someone who says "actually, it was a personal
  // loan" has answered.
  const requiredPaths = new Set(
    STAGES.flatMap((stage) => stage.fields.filter((f) => f.required).map((f) => f.path)),
  );
  // Union rather than replace. `merge` overwrites arrays wholesale, so a patch
  // naming only the newest refusal would silently un-decline everything said
  // before it — and the person would be asked again for something they had
  // already refused twice. The field description tells the model to send the
  // whole list; this makes it not matter if it does not.
  next.declined = [...new Set([...previous.declined, ...next.declined])];
  const seen = new Set<string>();
  next.declined = next.declined.filter((path) => {
    if (!requiredPaths.has(path)) return false;
    if (seen.has(path)) return false;
    seen.add(path);
    const value = getPath(next, path);
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return value === null || value === undefined;
  });

  // The long free-text boxes. cleanPatch caps these on the way in from the model,
  // but a person typing or pasting into the form panel never goes through it,
  // so the cap has to live here too — otherwise the limit the schema declares
  // holds on one write path and not the other.
  if (next.complaint.narrative.length > NARRATIVE_MAX) {
    next.complaint.narrative = next.complaint.narrative.slice(0, NARRATIVE_MAX);
  }
  if (next.outcome.fair_outcome.length > NARRATIVE_MAX) {
    next.outcome.fair_outcome = next.outcome.fair_outcome.slice(0, NARRATIVE_MAX);
  }

  return next;
}

/**
 * Validate a date the person typed, once they have finished typing it.
 *
 * This cannot live in `reconcile`: the form panel fires on every keystroke, and
 * "3 Sept 2025" passes through "3", "3 ", "3 S" on the way. Coercing eagerly
 * would blank the field under the person's cursor. So the form commits a date
 * on blur instead, and this is what it calls — the same rules `cleanPatch`
 * applies to the model's dates, with the same message when the answer cannot
 * be used, rather than silently discarding what someone typed.
 */
export function commitDate(
  value: string,
  path: string,
  today = new Date(),
): { value: string; issue: PatchIssue | null } {
  if (value.trim() === "") return { value: "", issue: null };

  const coerced = coerceDate(value, today);
  if (coerced === "") {
    return { value: "", issue: { path, message: "Could not read that as a date." } };
  }
  if (isFuture(coerced, today)) {
    const message =
      path === "complainant.dob"
        ? "That date of birth is in the future."
        : "That date is in the future — when did you contact them?";
    return { value: "", issue: { path, message } };
  }
  return { value: coerced, issue: null };
}

/** Which leaves a patch actually sets, as dotted paths. */
function touchedPaths(patch: ComplaintPatch): Set<string> {
  const paths = new Set<string>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined) continue;
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (isPlainObject(value)) walk(value, path);
      else paths.add(path);
    }
  };
  walk(patch as Record<string, unknown>, "");
  return paths;
}

/** Deep merge, replacing arrays wholesale and ignoring undefined. */
export function applyPatch(state: ComplaintState, patch: ComplaintPatch): ComplaintState {
  const next = structuredClone(state);
  merge(next as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  const touched = touchedPaths(patch);
  return reconcile(state, next, (path) => touched.has(path));
}

function merge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!(key in target)) continue; // never let the model invent fields
    const current = target[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      merge(current, value);
    } else {
      target[key] = value;
    }
  }
}

/** Parse untrusted JSON into a patch, dropping anything that does not fit. */
export function parsePatch(input: unknown): CleanResult {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    return { patch: {}, issues: [{ path: "patch", message: "Patch did not match the schema." }] };
  }
  return cleanPatch(parsed.data);
}

export { emptyState };
