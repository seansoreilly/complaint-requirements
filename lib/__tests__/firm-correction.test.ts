/**
 * Correcting the firm.
 *
 * The firm is the one field where being wrong is unrecoverable: a complaint
 * filed against the wrong company is worse than an unfinished one. The offline
 * brain only wrote `firm.name` while it was empty — a guard that stops "I also
 * bank with CBA" from hijacking the subject, but which also meant a person who
 * was misheard, or who typed a name wrong, could never put it right in chat.
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

function withFirm(name: string): ComplaintState {
  const state = emptyState();
  state.firm.name = name;
  return state;
}

describe("an explicit correction", () => {
  it("replaces a firm named earlier", () => {
    const { state } = turn(withFirm("Commonwealth Bank of Australia"), "Actually it was Westpac, not CBA");
    expect(state.firm.name).toBe("Westpac Banking Corporation");
  });

  it("says what it changed rather than staying silent", () => {
    const { reply } = turn(withFirm("Commonwealth Bank of Australia"), "Actually it was Westpac, not CBA");
    expect(reply.toLowerCase()).toContain("westpac");
  });

  it("accepts 'no, it is X'", () => {
    const { state } = turn(withFirm("ANZ Banking Group"), "No, it's NAB");
    expect(state.firm.name).toBe("National Australia Bank");
  });

  it("accepts 'I meant X'", () => {
    const { state } = turn(withFirm("ANZ Banking Group"), "Sorry, I meant Westpac");
    expect(state.firm.name).toBe("Westpac Banking Corporation");
  });

  it("clears a member number that belonged to the old firm", () => {
    const state = withFirm("Commonwealth Bank of Australia");
    state.firm.afca_member_no = "10001";
    const result = turn(state, "Actually it was Westpac, not CBA");
    // The route re-resolves and fills the right number; what matters here is
    // that the old firm's number does not ride along with the new name.
    expect(result.state.firm.afca_member_no).not.toBe("10001");
  });
});

describe("disambiguating a typo", () => {
  it("replaces the typo with the firm that was meant", () => {
    // The route stores an unmatched name verbatim and asks which firm it was;
    // answering has to correct the stored name, not leave the typo on the form.
    const asked = "Several firms match \"Westpack\": Westpac Banking Corporation. Which one is it?";
    const { state } = turn(withFirm("Westpack"), "Westpac Banking Corporation", undefined, [
      { role: "assistant", content: asked },
    ]);
    expect(state.firm.name).toBe("Westpac Banking Corporation");
  });
});

describe("what the guard still protects", () => {
  it("does not let a firm mentioned in passing take over the complaint", () => {
    const { state } = turn(
      withFirm("AustralianSuper"),
      "I also bank with CBA but this complaint is about my super",
    );
    expect(state.firm.name).toBe("AustralianSuper");
  });

  it("leaves the firm alone when the message is about something else", () => {
    const { state } = turn(withFirm("AustralianSuper"), "My account number is 12345");
    expect(state.firm.name).toBe("AustralianSuper");
  });

  it("does not let a passing mention replace a firm the directory never knew", () => {
    // "Bank of Nowhere" is a documented, supported answer — a real firm this
    // demo's directory does not carry. It is settled, not provisional, so an
    // incidental CBA must not quietly take the complaint over. Only a name the
    // directory finds *ambiguous* is still an open question.
    const { state } = turn(
      withFirm("Bank of Nowhere"),
      "I also have a card with CBA but this is about the other one",
    );
    expect(state.firm.name).toBe("Bank of Nowhere");
  });
});
