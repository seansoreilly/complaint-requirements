/**
 * The checks the review does before someone signs what it says.
 *
 * Two things the tester found, both at the last step where they are still
 * cheap to fix.
 *
 * The first: the structured date said 2 September and the narrative said the
 * emails went 7–11 September. The model happened to notice that time. Noticing
 * is not a guarantee — it is the same shape as every other rule in this
 * codebase that worked until the turn it did not — so the cross-check is code,
 * and it runs where the person is about to export a document they will sign.
 *
 * The second: four rows reading "—" for optional questions nobody was ever
 * asked. A blank required field is a finding; a blank optional one is just an
 * option not taken, and rendering them identically buries the first in the
 * second. `summarise` marks them so the review can fold them away.
 */
import { describe, expect, it } from "vitest";
import { dateWarnings, summarise } from "../export";
import { type ComplaintState, emptyState } from "../schema";

function withDates(): ComplaintState {
  const state = emptyState();
  state.complained_to_firm.yes = true;
  state.complained_to_firm.date = "2026-09-02";
  return state;
}

describe("dates that disagree with the story", () => {
  it("says nothing when the narrative repeats the same date", () => {
    const state = withDates();
    state.complaint.narrative = "I emailed them on 2 September 2026 and heard nothing back.";
    expect(dateWarnings(state)).toEqual([]);
  });

  it("says nothing when the narrative names no date at all", () => {
    const state = withDates();
    state.complaint.narrative = "I emailed them and heard nothing back for weeks.";
    expect(dateWarnings(state)).toEqual([]);
  });

  /**
   * The tester's case. The field says the 2nd; the story says the 7th to the
   * 11th. One of them is wrong and only the person knows which.
   */
  it("flags a narrative whose dates are all later than the field", () => {
    const state = withDates();
    state.complaint.narrative =
      "I emailed them on 7 September 2026 and again on 11 September 2026.";
    const warnings = dateWarnings(state);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe("complained_to_firm.date");
    expect(warnings[0].message).toContain("2 September 2026");
    expect(warnings[0].message).toContain("7 September");
  });

  /**
   * Only when NO date in the story matches. A narrative that mentions the 2nd
   * among several dates is consistent — people describe a sequence, and
   * flagging every extra date would make the warning noise.
   */
  it("says nothing when one of several dates matches the field", () => {
    const state = withDates();
    state.complaint.narrative =
      "I called on 2 September 2026, then emailed again on 11 September 2026.";
    expect(dateWarnings(state)).toEqual([]);
  });

  it("reads the Australian ordering, not the American one", () => {
    const state = withDates();
    // 2/9/2026 is 2 September here, and must not be read as 9 February.
    state.complaint.narrative = "I emailed them on 2/9/2026.";
    expect(dateWarnings(state)).toEqual([]);
  });

  it("says nothing when the date field is blank", () => {
    const state = emptyState();
    state.complaint.narrative = "It all happened on 7 September 2026.";
    expect(dateWarnings(state)).toEqual([]);
  });
});

describe("optional rows nobody answered", () => {
  it("marks a blank optional field as skippable", () => {
    const sections = summarise(emptyState());
    const rows = sections.flatMap((section) => section.rows);
    const pronoun = rows.find((row) => row.label.toLowerCase().includes("pronoun"));
    expect(pronoun?.optionalBlank).toBe(true);
  });

  /**
   * A blank REQUIRED field is a finding, not a tidy-away. It has to keep
   * showing as a gap on the review, which is the one place someone checks the
   * whole thing before exporting it.
   */
  it("does not mark a blank required field", () => {
    const sections = summarise(emptyState());
    const rows = sections.flatMap((section) => section.rows);
    const firm = rows.find((row) => row.label === "Financial firm");
    expect(firm?.value).toBe("—");
    expect(firm?.optionalBlank).toBeFalsy();
  });

  it("does not mark an optional field the person answered", () => {
    const state = emptyState();
    state.complainant.pronoun = "they/them";
    const rows = summarise(state).flatMap((section) => section.rows);
    const pronoun = rows.find((row) => row.label.toLowerCase().includes("pronoun"));
    expect(pronoun?.optionalBlank).toBeFalsy();
  });
});
