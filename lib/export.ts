/** Turning the finished state into things a person can take away. */
import { type ComplaintState, type FieldDef, STAGES, getPath, isUsable } from "./schema";
import { applies } from "./next";

function display(value: unknown, kind?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  // An unticked consent has not been declined; it simply has not been given.
  if (kind === "consent") return value === true ? "Agreed" : "Not yet agreed";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (value === "not_sure") return "Not sure";
  return String(value);
}

/**
 * A field's value for the summary, flagged when it cannot be used.
 *
 * The summary is what a person reads before acting on this, and what they
 * paste into the real AFCA form. Showing "not-an-email" plainly, in a row that
 * looks like every other answered row, hands them a problem they cannot see.
 * The value is still shown — it is theirs — but it is not shown as finished.
 */
function valueFor(field: FieldDef, state: ComplaintState): string {
  const raw = getPath(state, field.path);
  const shown = display(raw, field.kind);
  if (shown !== "—" && !isUsable(field, raw)) return `${shown} (needs checking)`;
  return shown;
}

export interface SummarySection {
  title: string;
  rows: { label: string; value: string }[];
}

/** The review view: every applicable field, in form order. */
export function summarise(state: ComplaintState): SummarySection[] {
  const sections: SummarySection[] = [];
  for (const stage of STAGES) {
    if (stage.fields.length === 0) continue;
    const rows = stage.fields
      .filter((field) => applies(field, state))
      .map((field) => ({
        label: field.label,
        value: valueFor(field, state),
      }));
    if (stage.id === "firm" && state.firm.afca_member_no) {
      rows.splice(1, 0, { label: "AFCA member number", value: state.firm.afca_member_no });
    }
    if (rows.length > 0) sections.push({ title: stage.title, rows });
  }
  return sections;
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
