/**
 * The three-minute demo script, run end to end against the offline brain.
 * If this passes, the demo works with no API key.
 */
import { describe, expect, it } from "vitest";
import { mockBrain } from "../mock-brain";
import { applyPatch, cleanPatch } from "../patch";
import { type ComplaintState, emptyState } from "../schema";
import { missingFor, nextField } from "../next";

const TODAY = new Date("2026-09-11T00:00:00Z");

/** One turn: run the brain, clean the patch, apply it — exactly as the route does. */
function turn(state: ComplaintState, message: string, focus?: string): { state: ComplaintState; reply: string } {
  const { reply, patch } = mockBrain(state, message, focus);
  const { patch: cleaned } = cleanPatch(patch, TODAY);
  return { state: applyPatch(state, cleaned), reply };
}

const DEMO_STORY =
  "I emailed AustralianSuper on 3 Sept about my insurance being cancelled without warning and they still haven't replied to me about it at all.";

describe("demo step 1 — a messy paragraph fills several fields at once", () => {
  it("extracts firm, contact history, date, method, reply status and service type", () => {
    const { state } = turn(emptyState(), DEMO_STORY);
    expect(state.firm.name).toBe("AustralianSuper");
    expect(state.complained_to_firm.yes).toBe(true);
    expect(state.complained_to_firm.date).toBe("2026-09-03");
    expect(state.complained_to_firm.how).toBe("Email");
    expect(state.complained_to_firm.final_reply).toBe(false);
    expect(state.service.type).toBe("Superannuation");
  });

  it("does not mistake a super fund's insurance for general insurance", () => {
    const { state } = turn(emptyState(), DEMO_STORY);
    expect(state.service.type).not.toBe("General insurance");
  });

  it("offers a narrative draft rather than writing the form text itself", () => {
    const { state } = turn(emptyState(), DEMO_STORY);
    expect(state.drafts.narrative).toContain("AustralianSuper");
    expect(state.complaint.narrative).toBe("");
  });
});

describe("demo step 2 — 'I don't have an account number'", () => {
  it("records no-reference and stops asking for one", () => {
    let state = turn(emptyState(), DEMO_STORY).state;
    state = turn(state, "I don't have an account number", "firm.reference").state;
    expect(state.firm.no_reference).toBe(true);
    expect(missingFor(state).map((m) => m.path)).not.toContain("firm.reference");
  });
});

describe("demo step 3 — the narrative draft is approved or edited", () => {
  it("promotes the approved draft onto the form and clears it", () => {
    let state = turn(emptyState(), DEMO_STORY).state;
    const draft = state.drafts.narrative;
    state = turn(state, "yes, that's right").state;
    expect(state.complaint.narrative).toBe(draft);
    expect(state.drafts.narrative).toBe("");
  });

  it("treats a substantial reply as the person's own edit", () => {
    let state = turn(emptyState(), DEMO_STORY).state;
    const edit = "My income protection cover was cancelled with no notice and I want it reinstated.";
    state = turn(state, edit).state;
    expect(state.complaint.narrative).toBe(edit);
    expect(state.drafts.narrative).toBe("");
  });
});

describe("demo step 4 — 'not sure' about compensation gets coached", () => {
  it("accepts 'not sure' as a complete answer", () => {
    const state = turn(emptyState(), "not sure", "outcome.seeking_compensation").state;
    expect(state.outcome.seeking_compensation).toBe("not_sure");
  });

  it("turns a vague wish into a concrete outcome held for approval", () => {
    let state = applyPatch(emptyState(), {
      firm: { name: "AustralianSuper" },
      complaint: { issues: ["Denial of insurance claim"] },
      outcome: { seeking_compensation: "not_sure" },
    });
    state = turn(state, "I just want it fixed", "outcome.fair_outcome").state;
    expect(state.drafts.fair_outcome).toContain("AustralianSuper");
    expect(state.drafts.fair_outcome.length).toBeGreaterThan(40);
    // Still the person's to approve — not written to the form yet.
    expect(state.outcome.fair_outcome).toBe("");

    state = turn(state, "yes that's good").state;
    expect(state.outcome.fair_outcome).toContain("AustralianSuper");
    expect(state.drafts.fair_outcome).toBe("");
  });
});

describe("demo step 5 — skipping date of birth", () => {
  it("does not leak a date of birth into the complaint date", () => {
    let state = applyPatch(emptyState(), { complained_to_firm: { yes: false } });
    state = turn(state, "12/04/1978", "complainant.dob").state;
    expect(state.complainant.dob).toBe("1978-04-12");
    expect(state.complained_to_firm.date).toBe("");
  });

  it("lets the conversation continue past a skipped field", () => {
    let state = turn(emptyState(), DEMO_STORY).state;
    const before = nextField(state)?.path;
    state = turn(state, "I'd rather skip that for now", "complainant.dob").state;
    expect(state.complainant.dob).toBe("");
    // Skipping does not stall: the form still knows what it needs.
    expect(missingFor(state).length).toBeGreaterThan(0);
    expect(before).toBeDefined();
  });
});

describe("readiness nudge", () => {
  it("records not having complained yet without blocking the form", () => {
    const state = turn(emptyState(), "No, I haven't complained to them yet", "complained_to_firm.yes").state;
    expect(state.complained_to_firm.yes).toBe(false);
    // The branch fields are not asked, so the form moves on rather than stalling.
    const paths = missingFor(state).map((m) => m.path);
    expect(paths).not.toContain("complained_to_firm.date");
  });
});

describe("the model never supplies firm identifiers", () => {
  it("leaves the member number for the directory to fill", () => {
    const { patch } = mockBrain(emptyState(), DEMO_STORY);
    expect(patch.firm?.afca_member_no).toBeUndefined();
  });
});

describe("contact details can be given by talking", () => {
  it("takes a name from a natural introduction", () => {
    const state = turn(emptyState(), "I'm Sam Chen", "complainant.first_name").state;
    expect(state.complainant.first_name).toBe("Sam");
    expect(state.complainant.last_name).toBe("Chen");
  });

  it("takes an email wherever it appears", () => {
    const state = turn(emptyState(), "you can reach me at sam.chen@example.com").state;
    expect(state.complainant.email).toBe("sam.chen@example.com");
  });

  it("parses a one-line Australian address", () => {
    const state = turn(emptyState(), "12 Ford Street, Brunswick VIC 3056").state;
    expect(state.complainant.address.line1).toBe("12 Ford Street");
    expect(state.complainant.address.suburb).toBe("Brunswick");
    expect(state.complainant.address.state).toBe("VIC");
    expect(state.complainant.address.postcode).toBe("3056");
  });

  it("does not mistake a bare number for a postcode", () => {
    const state = turn(emptyState(), "about 3056 dollars", "outcome.fair_outcome").state;
    expect(state.complainant.address.postcode).toBe("");
  });

  it("fills name, email and address from one message", () => {
    const state = turn(
      emptyState(),
      "I'm Priya Nair, sam@example.com, 4/88 Rathdowne Road, Carlton VIC 3053",
    ).state;
    expect(state.complainant.first_name).toBe("Priya");
    expect(state.complainant.email).toBe("sam@example.com");
    expect(state.complainant.address.postcode).toBe("3053");
  });

  it("reaches zero missing fields through conversation alone", () => {
    let state = emptyState();
    const script: [string, string?][] = [
      ["I emailed AustralianSuper on 3 Sept about my insurance being cancelled without warning and they still haven't replied."],
      ["yes that's right"],
      ["I don't have an account number", "firm.reference"],
      ["no", "open_afca_complaint"],
      ["yes I agree to both", "consents.authority"],
      ["no", "legal_proceedings"],
      ["not sure", "outcome.seeking_compensation"],
      ["I just want my cover put back", "outcome.fair_outcome"],
      ["yes that's good"],
      ["I'm Sam Chen", "complainant.first_name"],
      ["sam.chen@example.com", "complainant.email"],
      ["12 Ford Street, Brunswick VIC 3056", "complainant.address.line1"],
      ["4 March 1979", "complainant.dob"],
    ];
    let previous = Infinity;
    for (const [message, focus] of script) {
      state = turn(state, message, focus).state;
      const remaining = missingFor(state).length;
      // The form must never move backwards as the conversation goes on.
      expect(remaining).toBeLessThanOrEqual(previous);
      previous = remaining;
    }
    expect(missingFor(state)).toEqual([]);
  });
});
