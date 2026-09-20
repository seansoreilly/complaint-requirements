/**
 * The review's date cross-check, against a narrative the live model wrote.
 *
 * The rest of `review-checks.test.ts` uses prose written to exercise the rule.
 * This one uses the real thing: the write-up Claude produced when driven
 * through /api/chat on the live brain, kept verbatim. A rule that only ever
 * sees its author's own example sentences is a rule with no evidence it works
 * on the sentences it will actually meet.
 *
 * Two cases, from the one transcript. As the model wrote it the field and the
 * story agree, and the check must stay silent — a false warning on a correct
 * form is how a warning stops being read. Move the field to the date the
 * tester had, and it is their mismatch exactly: form says the 2nd, story says
 * the 7th and the 11th.
 */
import { describe, expect, it } from "vitest";
import { dateWarnings } from "../export";
import { emptyState } from "../schema";

/** Verbatim from a live turn; do not tidy the wording. */
const NARRATIVE =
  "I have had TPD cover through my AustralianSuper account and had been paying " +
  "premiums for six years.\n\nI found out the cover was gone when I logged into " +
  "the app and saw it was no longer there. I emailed AustralianSuper about it on " +
  "7 September 2026, and emailed them again on 11 September 2026.\n\nThey have " +
  "not replied.";

function liveState(date: string): ReturnType<typeof emptyState> {
  const state = emptyState();
  state.complained_to_firm.yes = true;
  state.complained_to_firm.date = date;
  state.complaint.narrative = NARRATIVE;
  return state;
}

describe("against a narrative the live model wrote", () => {
  it("stays silent when the field matches a date in the story", () => {
    expect(dateWarnings(liveState("2026-09-07"))).toEqual([]);
  });

  /** The tester's mismatch, on real prose. */
  it("catches the form saying the 2nd when the story says the 7th and 11th", () => {
    const warnings = dateWarnings(liveState("2026-09-02"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("2 September 2026");
    expect(warnings[0].message).toContain("7 September 2026");
    expect(warnings[0].message).toContain("11 September 2026");
  });
});
