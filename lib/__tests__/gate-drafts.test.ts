/**
 * The approval boundary.
 *
 * Before this, the prompt asked the model to propose in drafts.* and wait —
 * but nothing stopped it writing complaint.narrative directly, putting words
 * the person never saw into the complaint they are about to lodge.
 */
import { describe, expect, it } from "vitest";
import { applyPatch, gateDrafts } from "../patch";
import { type ComplaintState, emptyState } from "../schema";

function withDraft(kind: "narrative" | "fair_outcome", text: string): ComplaintState {
  const state = emptyState();
  state.drafts[kind] = text;
  return state;
}

describe("gateDrafts", () => {
  it("redirects an unapproved narrative into the draft slot", () => {
    const { patch, issues } = gateDrafts(
      { complaint: { narrative: "Words nobody approved." } },
      emptyState(),
    );
    expect(patch.complaint?.narrative).toBeUndefined();
    expect(patch.drafts?.narrative).toBe("Words nobody approved.");
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("complaint.narrative");
  });

  it("promotes a narrative that matches the pending draft", () => {
    const state = withDraft("narrative", "On 3 September my claim was denied.");
    const { patch, issues } = gateDrafts(
      {
        complaint: { narrative: "On 3 September my claim was denied." },
        drafts: { narrative: "" },
      },
      state,
    );
    expect(patch.complaint?.narrative).toBe("On 3 September my claim was denied.");
    expect(patch.drafts?.narrative).toBe("");
    expect(issues).toHaveLength(0);
  });

  it("re-drafts a rewrite rather than committing it, keeping the new text", () => {
    const state = withDraft("narrative", "The original proposal.");
    const { patch } = gateDrafts(
      {
        // The approval-shaped patch clears the draft in the same object; the
        // redirect must overwrite that "" or the proposal is lost entirely.
        complaint: { narrative: "A silently reworded version." },
        drafts: { narrative: "" },
      },
      state,
    );
    expect(patch.complaint?.narrative).toBeUndefined();
    expect(patch.drafts?.narrative).toBe("A silently reworded version.");
  });

  it("lets the person's own typed words through", () => {
    const state = withDraft("narrative", "The model's proposal.");
    const typed = "Actually, here is what happened in my own words.";
    const { patch, issues } = gateDrafts(
      { complaint: { narrative: typed }, drafts: { narrative: "" } },
      state,
      () => typed,
    );
    expect(patch.complaint?.narrative).toBe(typed);
    expect(issues).toHaveLength(0);
  });

  it("allows clearing a field", () => {
    const { patch, issues } = gateDrafts({ complaint: { narrative: "" } }, emptyState());
    expect(patch.complaint?.narrative).toBe("");
    expect(issues).toHaveLength(0);
  });

  it("applies the same rule to the outcome sought", () => {
    const unapproved = gateDrafts(
      { outcome: { fair_outcome: "Pay me $5,000." } },
      emptyState(),
    );
    expect(unapproved.patch.outcome?.fair_outcome).toBeUndefined();
    expect(unapproved.patch.drafts?.fair_outcome).toBe("Pay me $5,000.");

    const state = withDraft("fair_outcome", "Reinstate the policy.");
    const approved = gateDrafts(
      { outcome: { fair_outcome: "Reinstate the policy." }, drafts: { fair_outcome: "" } },
      state,
    );
    expect(approved.patch.outcome?.fair_outcome).toBe("Reinstate the policy.");
  });

  it("leaves every other field alone", () => {
    const { patch, issues } = gateDrafts(
      { firm: { name: "AustralianSuper" }, legal_proceedings: false },
      emptyState(),
    );
    expect(patch.firm?.name).toBe("AustralianSuper");
    expect(patch.legal_proceedings).toBe(false);
    expect(issues).toHaveLength(0);
  });

  it("does not mutate the patch it was given", () => {
    const original = { complaint: { narrative: "Unapproved." } };
    gateDrafts(original, emptyState());
    expect(original.complaint.narrative).toBe("Unapproved.");
  });

  it("survives the round trip into state", () => {
    const { patch } = gateDrafts(
      { complaint: { narrative: "Unapproved text." } },
      emptyState(),
    );
    const state = applyPatch(emptyState(), patch);
    expect(state.complaint.narrative).toBe("");
    expect(state.drafts.narrative).toBe("Unapproved text.");
  });
});
