/**
 * A field whose branch is closed must not hold a value.
 *
 * Iris said "I emailed them on 5 August 2026" before anyone had established
 * whether that email was a complaint or a query. The model recorded the date
 * and the channel while `complained_to_firm.yes` was still null. Two turns
 * later she clarified it was a query, `yes` became false — and the date and
 * channel stayed. Her exported form said she had not complained to the firm,
 * beside the date she complained and how.
 *
 * `reconcile` cleared `showIf` fields only on a transition — applicable before,
 * not applicable now. The branch here was never open: `yes` went null → false,
 * and `applies()` is false for both, so the transition never fired and nothing
 * was cleared. The test is now the state of `next` alone: if the branch is shut,
 * the field is blank, however it got there.
 *
 * The exception stays what it always was — anything this same change explicitly
 * set survives, so the model can open a branch and fill it in one patch.
 */
import { describe, expect, it } from "vitest";
import { applyPatch, emptyState } from "../patch";

describe("a field on a closed branch", () => {
  it("does not survive being written before the branch was decided", () => {
    // The exact case-15 shape, in the order it happened.
    const withDate = applyPatch(emptyState(), {
      complained_to_firm: { date: "2026-08-05", how: "email" },
    });
    // yes is still null here — the branch was never open, so nothing has ever
    // made these fields applicable.
    expect(withDate.complained_to_firm.yes).toBeNull();
    expect(withDate.complained_to_firm.date).toBe("");
    expect(withDate.complained_to_firm.how).toBe("");
  });

  it("stays empty when the answer turns out to be no", () => {
    let state = applyPatch(emptyState(), {
      complained_to_firm: { date: "2026-08-05", how: "email" },
    });
    state = applyPatch(state, { complained_to_firm: { yes: false } });
    expect(state.complained_to_firm.yes).toBe(false);
    expect(state.complained_to_firm.date).toBe("");
    expect(state.complained_to_firm.how).toBe("");
  });

  it("keeps what the same change set when the branch opens", () => {
    // "I emailed them a formal complaint on 5 August" — one patch, branch
    // opened and filled together. This must survive, or the model cannot
    // record a complaint in a single turn.
    const state = applyPatch(emptyState(), {
      complained_to_firm: { yes: true, date: "2026-08-05", how: "email" },
    });
    expect(state.complained_to_firm.yes).toBe(true);
    expect(state.complained_to_firm.date).toBe("2026-08-05");
    expect(state.complained_to_firm.how).toBe("email");
  });

  it("keeps values already on an open branch", () => {
    let state = applyPatch(emptyState(), { complained_to_firm: { yes: true } });
    state = applyPatch(state, { complained_to_firm: { date: "2026-08-05" } });
    expect(state.complained_to_firm.date).toBe("2026-08-05");
    state = applyPatch(state, { legal_proceedings: false });
    expect(state.complained_to_firm.date).toBe("2026-08-05");
  });

  it("clears them again if the person corrects yes to no", () => {
    let state = applyPatch(emptyState(), {
      complained_to_firm: { yes: true, date: "2026-08-05", how: "email" },
    });
    state = applyPatch(state, { complained_to_firm: { yes: false } });
    expect(state.complained_to_firm.date).toBe("");
    expect(state.complained_to_firm.how).toBe("");
  });
});
