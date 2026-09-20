/** Turning the finished state into things a person can take away. */
import { type ComplaintState, STAGES, getPath } from "./schema";
import { applies, isAnswered } from "./next";
import { coerceDate, formatDateAU } from "./patch";

function display(value: unknown, kind?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  // An unticked consent has not been declined; it simply has not been given.
  if (kind === "consent") return value === true ? "Agreed" : "Not yet agreed";
  // The review and the paste-ready text are read by a person, so dates leave
  // ISO behind here too.
  if (kind === "date" && typeof value === "string") return formatDateAU(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (value === "not_sure") return "Not sure";
  return String(value);
}

export interface SummaryRow {
  label: string;
  value: string;
  /**
   * An optional question nobody answered, as opposed to a gap in the form.
   *
   * Four rows reading "—" for things the person was never asked is how a
   * review ends up looking unfinished when it is not, and it buries the blanks
   * that do matter among the ones that do not. A blank REQUIRED field never
   * gets this flag: that one is a finding, and the review is the last place it
   * can be seen before someone exports a document they will sign.
   */
  optionalBlank?: boolean;
}

export interface SummarySection {
  title: string;
  rows: SummaryRow[];
}

/** The review view: every applicable field, in form order. */
export function summarise(state: ComplaintState): SummarySection[] {
  const sections: SummarySection[] = [];
  for (const stage of STAGES) {
    if (stage.fields.length === 0) continue;
    const rows: SummaryRow[] = stage.fields
      .filter((field) => applies(field, state))
      .map((field) => ({
        label: field.label,
        value: display(getPath(state, field.path), field.kind),
        optionalBlank: !field.required && !isAnswered(field, state),
      }));
    if (stage.id === "firm" && state.firm.afca_member_no) {
      rows.splice(1, 0, { label: "AFCA member number", value: state.firm.afca_member_no });
    }
    if (rows.length > 0) sections.push({ title: stage.title, rows });
  }
  return sections;
}

export interface DateWarning {
  path: string;
  message: string;
}

/**
 * Dates in the story that do not match the date on the form.
 *
 * A tester wrote 2 September in the field and described emails sent on the 7th
 * and 11th in the narrative. The model noticed that time. Noticing is not a
 * guarantee — it is the shape of every rule in this codebase that held until
 * the turn it did not — so the check runs in code, at the review, which is the
 * last point before someone exports a document they will sign.
 *
 * It warns rather than corrects, because only the person knows which of the
 * two is right. And it warns only when NO date in the narrative matches: a
 * story that names the 2nd among several dates is describing a sequence, not
 * contradicting itself, and flagging that would make the warning noise.
 */
export function dateWarnings(state: ComplaintState): DateWarning[] {
  const field = state.complained_to_firm.date.trim();
  if (field === "") return [];
  const narrative = state.complaint.narrative.trim();
  if (narrative === "") return [];

  const found = datesIn(narrative);
  if (found.length === 0) return [];
  if (found.includes(field)) return [];

  return [
    {
      path: "complained_to_firm.date",
      message:
        `The form says you contacted them on ${readable(field)}, but your description ` +
        `mentions ${found.map(readable).join(" and ")}. Worth checking which is right.`,
    },
  ];
}

/**
 * The dates a piece of writing names, as ISO strings.
 *
 * Parsing is `coerceDate`'s job, not a second date reader living here — it
 * already knows that 2/9/2026 is September in this country, which is the one
 * mistake this function most needs not to make. Candidates are pulled out by
 * shape and handed to it.
 */
function datesIn(text: string): string[] {
  const candidates =
    text.match(
      /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{2,4})?\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/gi,
    ) ?? [];

  const seen: string[] = [];
  for (const candidate of candidates) {
    const iso = coerceDate(candidate);
    if (iso !== "" && !seen.includes(iso)) seen.push(iso);
  }
  return seen;
}

/** A date as a person would say it, for a sentence rather than a form field. */
function readable(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

/** Plain text for pasting into the real AFCA form. */
export function plainTextSummary(state: ComplaintState): string {
  const lines = ["AFCA complaint — draft summary", "(Prepared with Complaint Concierge — demo only)", ""];
  for (const section of summarise(state)) {
    lines.push(section.title.toUpperCase());
    for (const row of section.rows) lines.push(`  ${row.label}: ${row.value}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** The form state, without the working drafts. */
export function exportJson(state: ComplaintState): string {
  const rest: Partial<ComplaintState> = { ...state };
  delete rest.drafts;
  return JSON.stringify(rest, null, 2);
}
