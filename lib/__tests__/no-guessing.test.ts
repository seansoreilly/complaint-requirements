/**
 * What the brain must NOT infer.
 *
 * A guess that lands in a field is worse than no guess, because the field is
 * then marked answered and the person is never asked. The demo story — an
 * insurance policy cancelled by a super fund — came out as "death cover" and
 * "Denial of insurance claim", neither of which the person had said.
 */
import { describe, expect, it } from "vitest";
import { mockBrain } from "../mock-brain";
import { type ComplaintState, emptyState } from "../schema";
import { applyPatch, cleanPatch } from "../patch";
import { missingFor } from "../next";

const TODAY = new Date("2026-09-11T00:00:00Z");

/** One turn, exactly as the route runs it. */
function tell(text: string): ComplaintState {
  const state = applyPatch(emptyState(), { firm: { name: "AustralianSuper" } });
  const { patch } = mockBrain(state, text);
  const { patch: cleaned } = cleanPatch(patch, TODAY);
  return applyPatch(state, cleaned);
}

describe("a cancelled policy is not a denied claim", () => {
  const story =
    "My super fund cancelled my insurance without telling me and I only found out last month.";

  it("does not invent which kind of cover it was", () => {
    const state = tell(story);
    expect(state.service.subtype).not.toContain("death cover");
  });

  it("does not record a claim denial that was never described", () => {
    const state = tell(story);
    expect(state.complaint.issues).not.toContain("Denial of insurance claim");
  });

  it("leaves those fields to be asked about instead", () => {
    const state = tell(story);
    const missing = missingFor(state).map((m) => m.path);
    expect(missing).toContain("service.subtype");
    expect(missing).toContain("complaint.issues");
  });
});

describe("what it still reads confidently", () => {
  it("records a denial when the person actually describes one", () => {
    const state = tell("They denied my TPD claim in March.");
    expect(state.complaint.issues).toContain("Denial of insurance claim");
    expect(state.service.subtype).toBe("Insurance in superannuation (TPD)");
  });

  it("still names a cover the person names themselves", () => {
    // "death" reaches the earlier death-benefit branch, so this asserts the
    // narrower phrasing that only the cover rule matches.
    const state = tell("My life insurance through the fund was cancelled.");
    expect(state.service.subtype).toBe("Insurance in superannuation (death cover)");
  });

  it("still reads a delay", () => {
    const state = tell("I have been waiting three months with no response.");
    expect(state.complaint.issues).toContain("Delay in claim handling");
  });
});
