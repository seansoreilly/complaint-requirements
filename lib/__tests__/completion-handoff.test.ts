/**
 * The end of the form is not the end of the conversation.
 *
 * `ensureAsk` guarantees a question while anything is outstanding, and the
 * moment nothing is, it returns the reply untouched — which is correct for
 * "the form is done" and wrong for "the person is done". The tester finished
 * on contact details and the conversation simply stopped: one message after
 * the last required field, before the optional questions, with no handoff to
 * the review they were meant to reach. The prompt tells the model to move them
 * to the review step; nothing guaranteed it, so a reply that trailed off
 * ended the demo.
 *
 * So completion gets a closing turn of its own. It says the required part is
 * in, asks the one question that is worth asking at exactly this point —
 * whether they have evidence — and points at Review. That question is also
 * what fills the attachments step, which a conversation can otherwise never
 * reach: `attachments` is not required, so it never appears in `missingFor`
 * and is never asked for.
 */
import { describe, expect, it } from "vitest";
import { ensureAsk } from "../continue";
import { completionHandoff } from "../questions";
import { type ComplaintState, emptyState } from "../schema";
import { missingFor } from "../next";

/**
 * Everything required, answered.
 *
 * Exported because `prompt.test.ts` needs the same thing, and a fourth
 * hand-copied fixture is a fourth chance for one of them to drift out of step
 * with the schema and quietly stop testing completion at all.
 */
export function completeState(): ComplaintState {
  const state = emptyState();
  state.firm.name = "AustralianSuper";
  state.firm.afca_member_no = "10657";
  state.firm.reference = "CPX-4471";
  state.open_afca_complaint = false;
  state.complained_to_firm.yes = true;
  state.complained_to_firm.date = "2026-09-02";
  state.complained_to_firm.how = "Email";
  state.complained_to_firm.final_reply = false;
  state.legal_proceedings = false;
  state.service.type = "Superannuation";
  state.service.subtype = "Insurance in superannuation (TPD)";
  state.complaint.issues = ["Cancellation without notice"];
  state.complaint.narrative = "On 2 September 2026 I emailed them about my cancelled cover.";
  state.outcome.seeking_compensation = "yes";
  state.outcome.fair_outcome = "Reinstate the cover.";
  state.complainant.lodging_for = "self";
  state.complainant.first_name = "Sam";
  state.complainant.last_name = "Taylor";
  state.complainant.email = "sam@example.com";
  state.complainant.dob = "1985-03-11";
  state.complainant.notify_by = "Email";
  state.complainant.address.line1 = "1 Example St";
  state.complainant.address.suburb = "Carlton";
  state.complainant.address.state = "VIC";
  state.complainant.address.postcode = "3053";
  state.consents.authority = true;
  state.consents.engagement_charter = true;
  return state;
}

describe("the fixture", () => {
  it("leaves nothing required outstanding", () => {
    expect(missingFor(completeState())).toEqual([]);
  });
});

describe("the turn that finishes the form", () => {
  it("hands off instead of trailing into silence", () => {
    const reply = ensureAsk("That's your contact details recorded.", completeState());
    expect(reply).toContain("That's your contact details recorded.");
    expect(reply).toContain(completionHandoff());
  });

  /**
   * The evidence question, asked at the one moment it is useful. It fills the
   * attachments step, which nothing else asks for — `attachments` is optional,
   * so it never enters `missingFor` and a conversation can never reach it.
   */
  it("asks what evidence they have", () => {
    const reply = ensureAsk("All done.", completeState());
    expect(reply.toLowerCase()).toMatch(/statement|screenshot|evidence/);
  });

  it("points them at the review", () => {
    const reply = ensureAsk("All done.", completeState());
    expect(reply).toContain("Review");
  });

  /**
   * Said once. The handoff is a hinge, not a refrain — repeated under every
   * later turn it becomes the thing that ends the demo rather than the thing
   * that opens its last step.
   */
  it("does not repeat itself once the person is talking about evidence", () => {
    const state = completeState();
    state.attachments = ["bank-statement.pdf"];
    const reply = ensureAsk("Noted — I've listed that one.", state);
    expect(reply).not.toContain(completionHandoff());
  });

  /**
   * The turn where someone declines the last required field often ends "your
   * form is ready for review" — the model keeping a promise not to press. A
   * second, longer sign-off stacked under that is how "I won't ask again"
   * starts to sound like a preamble, so a reply that already points at the
   * review keeps its own words.
   */
  it("defers to a reply that already points at the review", () => {
    const written =
      "That's completely fine — I won't ask again. Your form is ready for review.";
    expect(ensureAsk(written, completeState())).toBe(written);
  });

  it("leaves a reply that already asks something alone", () => {
    const written = "All done. Anything else you'd like to add before we review it?";
    expect(ensureAsk(written, completeState())).toBe(written);
  });

  /**
   * Nothing changes while the form is unfinished: the next field is still the
   * question, and the handoff must not jump the queue.
   */
  it("stays out of the way while the form is unfinished", () => {
    const state = emptyState();
    const reply = ensureAsk("Thanks for that.", state);
    expect(reply).not.toContain(completionHandoff());
  });
});
