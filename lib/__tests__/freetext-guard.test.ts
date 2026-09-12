/**
 * A free-text field must not swallow a sentence that was plainly about
 * something else.
 *
 * `service.subtype` takes free text for the service types this demo does not
 * model in full, which makes it a catch-all: while it is the question, whatever
 * the person types lands in it. Someone answering a different question —
 * agreeing to a consent, saying they would rather skip — then finds that
 * sentence printed on the form as their product name.
 */
import { describe, expect, it } from "vitest";
import { mockBrain } from "../mock-brain";
import { applyPatch, cleanPatch } from "../patch";
import { type ComplaintState, emptyState } from "../schema";

const TODAY = new Date("2026-09-11T00:00:00Z");

function turn(
  state: ComplaintState,
  message: string,
  focus?: string,
  history?: { role: string; content: string }[],
): { state: ComplaintState; reply: string } {
  const { reply, patch } = mockBrain(state, message, focus, history);
  const { patch: cleaned } = cleanPatch(patch, TODAY);
  return { state: applyPatch(state, cleaned), reply };
}

const SUBTYPE_QUESTION = "What product or service specifically?";

function askedSubtype(): ComplaintState {
  const state = emptyState();
  state.firm.name = "Westpac Banking Corporation";
  state.service.type = "Banking deposits and payments";
  return state;
}

describe("a consent sentence is not a product name", () => {
  const history = [{ role: "assistant", content: SUBTYPE_QUESTION }];

  it("does not file the sentence as the product", () => {
    const { state } = turn(askedSubtype(), "Also I agree to the engagement charter", undefined, history);
    expect(state.service.subtype).toBe("");
  });

  it("leaves the consent untouched rather than ticking it in passing", () => {
    // Dropping the text is the fix; ticking a consent off the back of a remark
    // made while answering something else would be its own over-reach. The
    // consents stage asks for both explicitly, and that is where they are given.
    const { state } = turn(askedSubtype(), "Also I agree to the engagement charter", undefined, history);
    expect(state.consents.engagement_charter).toBe(false);
  });

  it("does not file an authority consent as the product either", () => {
    const { state } = turn(
      askedSubtype(),
      "I agree to the authority to act",
      undefined,
      history,
    );
    expect(state.service.subtype).toBe("");
  });
});

describe("a skip is not a product name", () => {
  const history = [{ role: "assistant", content: SUBTYPE_QUESTION }];

  it("does not file 'I would rather not say' as the product", () => {
    const { state } = turn(askedSubtype(), "I'd rather not say right now", undefined, history);
    expect(state.service.subtype).toBe("");
  });
});

describe("a real answer still lands", () => {
  const history = [{ role: "assistant", content: SUBTYPE_QUESTION }];

  it("takes a plain product name", () => {
    const { state } = turn(askedSubtype(), "A everyday transaction account", undefined, history);
    expect(state.service.subtype).toBe("A everyday transaction account");
  });

  it("takes a short product name", () => {
    const { state } = turn(askedSubtype(), "Term deposit", undefined, history);
    expect(state.service.subtype).toBe("Term deposit");
  });
});
