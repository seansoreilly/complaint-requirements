/**
 * The address parser must not invent an address.
 *
 * "ACT" is a state code and also an ordinary English word — "authority to act",
 * "act on your complaint", "the act of". Reading one as the other writes a
 * fabricated address onto a document someone signs, which is the one thing this
 * product must never do. A state code only counts when the text around it is
 * actually an address.
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

const CONSENT_QUESTION =
  "Before we go further, I need two quick confirmations: that AFCA can act on your complaint, and that you accept the engagement charter. Happy to tick both?";

describe("the word 'act' is not the Australian Capital Territory", () => {
  it("does not read a consent agreement as an address", () => {
    const { state } = turn(
      emptyState(),
      "I agree to the authority to act consent and the engagement charter consent",
      undefined,
      [{ role: "assistant", content: CONSENT_QUESTION }],
    );
    expect(state.complainant.address.state).toBe("");
  });

  it("still records the consents themselves", () => {
    const { state } = turn(
      emptyState(),
      "I agree to the authority to act consent and the engagement charter consent",
      undefined,
      [{ role: "assistant", content: CONSENT_QUESTION }],
    );
    expect(state.consents.authority).toBe(true);
    expect(state.consents.engagement_charter).toBe(true);
  });

  it("does not claim to have noted an address", () => {
    const { reply } = turn(
      emptyState(),
      "I agree to the authority to act consent and the engagement charter consent",
      undefined,
      [{ role: "assistant", content: CONSENT_QUESTION }],
    );
    expect(reply.toLowerCase()).not.toContain("address");
  });

  it("ignores 'act' in ordinary prose", () => {
    const { state } = turn(emptyState(), "They refused to act on my complaint for months");
    expect(state.complainant.address.state).toBe("");
  });
});

describe("a real address still parses", () => {
  it("reads a full address written on one line", () => {
    const { state } = turn(emptyState(), "12 Smith Street, Braddon ACT 2612");
    expect(state.complainant.address.state).toBe("ACT");
    expect(state.complainant.address.postcode).toBe("2612");
    expect(state.complainant.address.line1).toBe("12 Smith Street");
  });

  it("reads an address in a state whose code is not a word", () => {
    const { state } = turn(emptyState(), "8 Bourke Road, Richmond VIC 3121");
    expect(state.complainant.address.state).toBe("VIC");
    expect(state.complainant.address.postcode).toBe("3121");
  });

  it("takes a bare state code when the address was the question", () => {
    const { state } = turn(emptyState(), "ACT", "complainant.address.state");
    expect(state.complainant.address.state).toBe("ACT");
  });
});
