/**
 * Firm names with a lowercase word in the middle.
 *
 * "Bank of Queensland", "Bendigo and Adelaide Bank", "Members Equity" — the
 * connector is lowercase in most real Australian firm names. Requiring every
 * word to be capitalised meant "My complaint is about Bank of Nowhere" captured
 * nothing at all, so the assistant asked the same question again, and again,
 * with no explanation of what was wrong.
 */
import { describe, expect, it } from "vitest";
import { mockBrain } from "../mock-brain";
import { applyPatch, cleanPatch } from "../patch";
import { type ComplaintState, emptyState } from "../schema";

const TODAY = new Date("2026-09-11T00:00:00Z");
const FIRM_QUESTION = "Which financial firm is your complaint about? A name, ABN or ACN all work.";

function turn(state: ComplaintState, message: string): ComplaintState {
  const { patch } = mockBrain(state, message, undefined, [
    { role: "assistant", content: FIRM_QUESTION },
  ]);
  const { patch: cleaned } = cleanPatch(patch, TODAY);
  return applyPatch(state, cleaned);
}

describe("a firm named in a sentence", () => {
  it("captures a name containing 'of'", () => {
    expect(turn(emptyState(), "My complaint is about Bank of Nowhere").firm.name).toBe(
      "Bank of Nowhere",
    );
  });

  it("captures a name containing 'and'", () => {
    expect(turn(emptyState(), "My complaint is about Bendigo and Adelaide Mutual").firm.name).toBe(
      "Bendigo and Adelaide Mutual",
    );
  });

  it("captures a name containing 'the'", () => {
    expect(turn(emptyState(), "It's about Bank of the Riverina").firm.name).toBe(
      "Bank of the Riverina",
    );
  });

  it("still captures an all-capitalised name", () => {
    expect(turn(emptyState(), "My complaint is about Nowhere Financial").firm.name).toBe(
      "Nowhere Financial",
    );
  });

  it("still captures a bare name typed on its own", () => {
    expect(turn(emptyState(), "Bank of Nowhere").firm.name).toBe("Bank of Nowhere");
  });
});

describe("what the capitalisation rule still keeps out", () => {
  it("does not take a lowercase sentence as a firm name", () => {
    expect(turn(emptyState(), "it is about my account being closed").firm.name).toBe("");
  });

  it("does not start a name on a connector word", () => {
    // "about of Something" is not a name; the first word must look like one.
    expect(turn(emptyState(), "My complaint is about of the thing").firm.name).toBe("");
  });
});
