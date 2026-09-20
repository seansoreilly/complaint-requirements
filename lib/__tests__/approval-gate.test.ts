/**
 * A draft on screen is a question already asked.
 *
 * The transcript: the app proposes the complaint write-up, the card goes up,
 * and the same reply asks whether there is a court case. The person answers the
 * court question, the card is still up, so the next turn asks about the court
 * case AGAIN — and somewhere in the middle "Added to your complaint" arrives for
 * a card nobody has approved. Three symptoms, one cause: nothing in the app
 * treats "a draft is waiting" as a state that owns the turn.
 *
 * `outstandingPrompt` already prefers the approval request over the next field,
 * so the APPENDED question was never the problem. The model's own prose was:
 * `ensureAsk` sees a reply that ends in a question, leaves it exactly as
 * written, and that question is about the next field. The hold is enforced on
 * the fallback path and not on the live one — the shape memory records as
 * "constraints need the live path".
 *
 * So the gate goes where the route can see it: while a draft is pending, the
 * turn's closing question is the approval request, whoever wrote it.
 */
import { describe, expect, it } from "vitest";
import { ensureAsk } from "../continue";
import { emptyState } from "../schema";

function withPendingDraft(): ReturnType<typeof emptyState> {
  const state = emptyState();
  state.firm.name = "AustralianSuper";
  state.firm.afca_member_no = "10657";
  state.firm.reference = "CPX-4471";
  state.service.type = "Superannuation";
  state.service.subtype = "Insurance in superannuation (TPD)";
  state.complaint.issues = ["Cancellation"];
  state.drafts.narrative = "On 2 September 2026 I emailed AustralianSuper…";
  return state;
}

describe("a pending draft owns the turn", () => {
  it("replaces a question about the next field with the approval request", () => {
    const state = withPendingDraft();
    const reply = ensureAsk(
      "I've drafted that up for you.\n\nIs there any court case or legal action going on about this?",
      state,
    );
    expect(reply).toContain("Approve it as it is, or tell me what to change.");
    expect(reply.toLowerCase()).not.toContain("court case");
  });

  /**
   * The gate is about what the turn CLOSES on, not about silencing the reply.
   * Whatever the model said before its misplaced question is the useful part —
   * it is the write-up being explained — and throwing it away to enforce a rule
   * about the last sentence would cost more than it saves.
   */
  it("keeps what the reply said before the misplaced question", () => {
    const state = withPendingDraft();
    const reply = ensureAsk(
      "I've drafted that up for you.\n\nIs there any court case or legal action going on about this?",
      state,
    );
    expect(reply).toContain("I've drafted that up for you.");
  });

  it("leaves a reply that already asks for approval exactly as written", () => {
    const state = withPendingDraft();
    const written = "Have a read — does that write-up look right to you?";
    expect(ensureAsk(written, state)).toBe(written);
  });

  it("appends the approval request to a reply that asks nothing", () => {
    const state = withPendingDraft();
    const reply = ensureAsk("Here is how I would put it.", state);
    expect(reply).toContain("Here is how I would put it.");
    expect(reply).toContain("Approve it as it is, or tell me what to change.");
  });

  /**
   * With no draft pending nothing changes: a reply that ends on the next
   * field's question is the normal, correct turn, and the gate must not touch
   * it.
   */
  it("does not touch the next question when no draft is waiting", () => {
    const state = emptyState();
    state.firm.name = "AustralianSuper";
    const written = "Thanks.\n\nIs there any court case or legal action going on about this?";
    expect(ensureAsk(written, state)).toBe(written);
  });

  /**
   * The route's own correction for a false saved-claim ends with an
   * invitation that carries no question mark. Treating that as silence stacked
   * the approval request underneath it: two invitations to the same click, on
   * the very turn the draft guard fires.
   */
  it("does not stack a second ask under the card correction", () => {
    const state = withPendingDraft();
    const corrected =
      "I've put that on the card for you to check — use it, edit it, or discard it.";
    expect(ensureAsk(corrected, state)).toBe(corrected);
  });

  /**
   * Bare "change" and "edit" would let an ordinary field question through, so
   * they are not in the vocabulary that counts as asking about the card.
   */
  it("still replaces a field question that happens to say change", () => {
    const state = withPendingDraft();
    const reply = ensureAsk("Would you like to change your email address?", state);
    expect(reply).toContain("Approve it as it is, or tell me what to change.");
  });

  it("asks for the outcome draft in its own words", () => {
    const state = withPendingDraft();
    state.drafts.narrative = "";
    state.drafts.fair_outcome = "Reinstate the cover and pay the claim.";
    const reply = ensureAsk(
      "Noted.\n\nWhat is your date of birth?",
      state,
    );
    expect(reply).toContain("Approve it, or tell me what to change.");
    expect(reply.toLowerCase()).not.toContain("date of birth");
  });
});
