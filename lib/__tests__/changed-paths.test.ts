/**
 * What actually changed on the form this turn.
 *
 * The chat narrates what it did to the form; the form is what actually holds
 * the answer. When those two disagree the person believes the chat, because it
 * is the thing talking to them — so "I've changed the date to 2 September" with
 * no write behind it is the worst sentence this product can produce. It is the
 * same failure as `correctSavedClaim`, one field along.
 *
 * `touchedPaths` in patch.ts cannot answer this. It reports what the patch
 * ASKED for, and the two diverge in exactly the cases that matter: a patch
 * rewriting a field with the value it already held, and a patch whose write
 * `reconcile` cleared again because the branch it belonged to had shut. Both
 * look like a write and neither changes the form, so the claim has to be
 * checked against the state before and after, not against the patch.
 */
import { describe, expect, it } from "vitest";
import { changedPaths } from "../changed";
import { emptyState } from "../schema";

describe("changedPaths", () => {
  it("reports nothing when the state is untouched", () => {
    const before = emptyState();
    expect(changedPaths(before, emptyState())).toEqual([]);
  });

  it("reports a field that was filled", () => {
    const before = emptyState();
    const after = emptyState();
    after.complained_to_firm.date = "2026-09-02";
    expect(changedPaths(before, after)).toEqual(["complained_to_firm.date"]);
  });

  it("reports a field that was corrected, not just filled", () => {
    const before = emptyState();
    before.complained_to_firm.date = "2026-09-07";
    const after = structuredCloneState(before);
    after.complained_to_firm.date = "2026-09-02";
    expect(changedPaths(before, after)).toEqual(["complained_to_firm.date"]);
  });

  /**
   * The case `touchedPaths` gets wrong. The model re-sends a field it already
   * knows, the merge writes the identical string, and nothing on screen moves.
   * A chip saying "Updated: Date of contact" over a field that did not move is
   * the same lie in a smaller font.
   */
  it("reports nothing when a write lands the value already there", () => {
    const before = emptyState();
    before.complained_to_firm.date = "2026-09-02";
    const after = structuredCloneState(before);
    after.complained_to_firm.date = "2026-09-02";
    expect(changedPaths(before, after)).toEqual([]);
  });

  it("reports a boolean going from unanswered to false", () => {
    const before = emptyState();
    const after = emptyState();
    after.legal_proceedings = false;
    expect(changedPaths(before, after)).toEqual(["legal_proceedings"]);
  });

  it("reports a list that gained an entry", () => {
    const before = emptyState();
    const after = emptyState();
    after.complaint.issues = ["Delay"];
    expect(changedPaths(before, after)).toEqual(["complaint.issues"]);
  });

  it("ignores a list reordered to the same members", () => {
    const before = emptyState();
    before.complaint.issues = ["Delay", "Fees"];
    const after = structuredCloneState(before);
    after.complaint.issues = ["Delay", "Fees"];
    expect(changedPaths(before, after)).toEqual([]);
  });

  it("reports several fields in form order, not object order", () => {
    const before = emptyState();
    const after = emptyState();
    after.outcome.fair_outcome = "Reinstate the cover";
    after.firm.name = "AustralianSuper";
    const changed = changedPaths(before, after);
    expect(changed).toEqual(["firm.name", "outcome.fair_outcome"]);
  });

  /**
   * Bookkeeping the person never sees. A chip reading "Updated: firm_note_said"
   * is noise about the app's own memory, and `drafts.*` is the opposite of a
   * write to the form — it is text being held back FROM the form, already
   * announced by the card appearing.
   */
  it("ignores internal bookkeeping and held drafts", () => {
    const before = emptyState();
    const after = emptyState();
    after.firm_note_said = "westpac";
    after.deferred = ["complainant.dob"];
    after.declined = ["complainant.mobile"];
    after.sensitive_offered = true;
    after.drafts.narrative = "Proposed text";
    expect(changedPaths(before, after)).toEqual([]);
  });

  it("names a field inside the address", () => {
    const before = emptyState();
    const after = emptyState();
    after.complainant.address.suburb = "Carlton";
    expect(changedPaths(before, after)).toEqual(["complainant.address.suburb"]);
  });
});

function structuredCloneState(state: ReturnType<typeof emptyState>): ReturnType<typeof emptyState> {
  return structuredClone(state);
}
