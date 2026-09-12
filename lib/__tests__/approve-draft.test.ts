/**
 * Approving a draft card must not end the conversation in silence.
 *
 * "Use this" is handled entirely in the browser: app/page.tsx writes the field,
 * clears the draft and appends a canned line. It never calls /api/chat, so
 * `ensureAsk` — the thing that stops a reply trailing off with nothing to answer
 * — never runs on that path. Two transcripts caught it: the person approves the
 * narrative, the hardest part of the form, and is answered by "That's the part
 * most people find hardest — it's done." with fields still outstanding and no
 * question. Earlier testers knew the flow and typed on regardless, which is why
 * it took a tester writing down that nothing was asked.
 *
 * The page composes its message from `outstandingPrompt` of the RECONCILED
 * state. These tests pin that contract: what the page appends must be a real
 * question while anything is outstanding, must be read after the draft clears,
 * and must be nothing at all once the form is done.
 */
import { describe, expect, it } from "vitest";
import { emptyState, type ComplaintState } from "../schema";
import { reconcile } from "../patch";
import { outstandingPrompt } from "../questions";
import { missingFor } from "../next";

/** What approveDraft does to state, mirrored so the contract can be asserted. */
function approve(
  previous: ComplaintState,
  kind: "narrative" | "fair_outcome",
  text: string,
): ComplaintState {
  const next = structuredClone(previous);
  if (kind === "narrative") {
    next.complaint.narrative = text;
    next.drafts.narrative = "";
  } else {
    next.outcome.fair_outcome = text;
    next.drafts.fair_outcome = "";
  }
  const path = kind === "narrative" ? "complaint.narrative" : "outcome.fair_outcome";
  return reconcile(previous, next, (p) => p === path);
}

function midFormState(): ComplaintState {
  const state = emptyState();
  state.firm.name = "AustralianSuper";
  state.firm.no_reference = true;
  state.open_afca_complaint = false;
  state.service.type = "Superannuation";
  state.service.subtype = "Insurance in super";
  state.complaint.issues = ["Denial of insurance claim"];
  state.drafts.narrative = "They denied my claim without explaining why.";
  return state;
}

describe("approving a draft card", () => {
  it("leaves something to answer while the form is unfinished", () => {
    const before = midFormState();
    const after = approve(before, "narrative", before.drafts.narrative);
    expect(after.complaint.narrative).toBe("They denied my claim without explaining why.");
    expect(after.drafts.narrative).toBe("");
    expect(missingFor(after).length).toBeGreaterThan(0);

    const prompt = outstandingPrompt(after);
    expect(prompt).not.toBeNull();
    expect((prompt ?? "").trim().length).toBeGreaterThan(0);
  });

  it("asks from the state after approval, not before it", () => {
    // Read from `previous`, the pending draft is still there and the app asks
    // the person to approve the thing they just approved.
    const before = midFormState();
    expect(outstandingPrompt(before)).toContain("Does that write-up read right?");

    const after = approve(before, "narrative", before.drafts.narrative);
    expect(outstandingPrompt(after)).not.toContain("Does that write-up read right?");
  });

  it("says nothing more once nothing is outstanding", () => {
    // The canned line alone is the right ending here: a trailing question when
    // the form is complete would invent work that does not exist.
    const state = completeState();
    state.outcome.fair_outcome = "";
    state.drafts.fair_outcome = "Reinstate the cover.";
    const after = approve(state, "fair_outcome", state.drafts.fair_outcome);
    expect(missingFor(after)).toEqual([]);
    expect(outstandingPrompt(after)).toBeNull();
  });
});

function completeState(): ComplaintState {
  const state = emptyState();
  state.firm.name = "AustralianSuper";
  state.firm.no_reference = true;
  state.open_afca_complaint = false;
  state.legal_proceedings = false;
  state.service = { type: "Superannuation", subtype: "Insurance in super" };
  state.complaint.issues = ["Insurance cancelled"];
  state.complaint.narrative = "They cancelled my cover without telling me.";
  state.complained_to_firm = {
    yes: true,
    date: "2026-09-03",
    how: "Email",
    final_reply: false,
  };
  state.outcome = { seeking_compensation: "no", fair_outcome: "Reinstate the cover." };
  state.consents = { authority: true, engagement_charter: true };
  state.complainant = {
    ...state.complainant,
    lodging_for: "Myself",
    first_name: "Jo",
    last_name: "Rivers",
    email: "jo@example.com",
    dob: "1980-01-01",
    notify_by: "email",
    address: {
      ...state.complainant.address,
      line1: "1 Test St",
      suburb: "Sydney",
      state: "NSW",
      postcode: "2000",
    },
  };
  return state;
}
