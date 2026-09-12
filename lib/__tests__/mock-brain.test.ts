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
      "My name is Priya Nair, sam@example.com, 4/88 Rathdowne Road, Carlton VIC 3053",
      "complainant.first_name",
    ).state;
    expect(state.complainant.first_name).toBe("Priya");
    expect(state.complainant.email).toBe("sam@example.com");
    expect(state.complainant.address.postcode).toBe("3053");
  });

  it.each([
    ["It's just for me.", "complainant.lodging_for"],
    ["whatever happened, it's complicated", undefined],
    ["it's with my super fund", undefined],
  ])("does not read %s as someone's name", (message, focus) => {
    // "I'm ..." and "it's ..." begin far too many ordinary sentences to be
    // treated as a name unless we actually asked for one.
    const state = turn(emptyState(), message, focus as string | undefined).state;
    expect(state.complainant.first_name).toBe("");
    expect(state.complainant.last_name).toBe("");
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

describe("the drafted narrative never invents", () => {
  it("writes dates the way a person says them, not as ISO", () => {
    const { state } = turn(emptyState(), DEMO_STORY);
    expect(state.drafts.narrative).toContain("3 September 2026");
    expect(state.drafts.narrative).not.toContain("2026-09-03");
  });

  it("structures the first draft from facts found in the same message", () => {
    const { state } = turn(emptyState(), DEMO_STORY);
    expect(state.drafts.narrative).toContain("I raised this with AustralianSuper");
    expect(state.drafts.narrative).toContain("I have not received a final response");
  });

  it("asserts nothing the person did not say", () => {
    // Every sentence the draft adds must be traceable to an extracted field.
    const { state } = turn(
      emptyState(),
      "Afterpay kept charging me late fees after I had already paid the whole thing off in June and nobody will explain why.",
    );
    const draft = state.drafts.narrative;
    expect(draft).toContain("Afterpay Australia");
    // No contact history was stated, so the draft must not claim any.
    expect(draft).not.toContain("I raised this with");
    expect(draft).not.toContain("final response");
  });

  it("never claims a final response either way without being told", () => {
    let state = applyPatch(emptyState(), {
      firm: { name: "Westpac Banking Corporation" },
      complained_to_firm: { yes: true, date: "2026-08-01", how: "Phone" },
    });
    state = turn(state, "They took money out of my account twice for the same bill and I want it back.").state;
    expect(state.drafts.narrative).toContain("I raised this with");
    // final_reply is still null — say nothing about it.
    expect(state.drafts.narrative).not.toContain("final response");
  });
});

describe("who contacted whom", () => {
  it("does not claim the person complained when the firm rang them", () => {
    let state = applyPatch(emptyState(), { firm: { name: "Commonwealth Bank of Australia" } });
    state = turn(state, "They called me last week and told me my cover was gone.").state;
    // The firm made contact. That is not a complaint to the firm.
    expect(state.complained_to_firm.yes).not.toBe(true);
    expect(state.complained_to_firm.how).toBe("");
    expect(state.drafts.narrative).not.toContain("I raised this with");
  });

  it("still records a complaint the person made", () => {
    const state = turn(emptyState(), "I emailed AustralianSuper on 3 Sept about my cover.").state;
    expect(state.complained_to_firm.yes).toBe(true);
    expect(state.complained_to_firm.how).toBe("Email");
  });

  it("does not record a channel when the firm was the one who wrote", () => {
    let state = applyPatch(emptyState(), { firm: { name: "Westpac Banking Corporation" } });
    state = turn(state, "The bank wrote to me saying my account was closed.").state;
    expect(state.complained_to_firm.how).toBe("");
  });
});

describe("reference numbers are not invented", () => {
  it.each([
    "I tried to make a claim after I hurt my back and they refused",
    "they took money out of my account without permission",
  ])("does not capture a stray word from %s", (message) => {
    const state = turn(emptyState(), message).state;
    expect(state.firm.reference).toBe("");
  });

  it.each([
    ["my member number is 4471820", "4471820"],
    ["account no. AB-99213", "AB-99213"],
    ["reference number 12345", "12345"],
  ])("captures a real identifier from %s", (message, expected) => {
    const state = turn(emptyState(), message).state;
    expect(state.firm.reference).toBe(expected);
  });

  it("does not read 'account no.' as having no account", () => {
    const state = turn(emptyState(), "account no. AB-99213").state;
    expect(state.firm.no_reference).toBe(false);
  });
});

describe("consent can be given the way people actually say it", () => {
  it.each(["I agree to both", "yes", "ok", "sure, that's fine", "happy to"])(
    "accepts %s",
    (message) => {
      const state = turn(emptyState(), message, "consents.authority").state;
      expect(state.consents.authority).toBe(true);
      expect(state.consents.engagement_charter).toBe(true);
    },
  );

  it("treats a refusal as an answer rather than asking again", () => {
    const { state, reply } = turn(emptyState(), "no", "consents.authority");
    expect(state.consents.authority).toBe(false);
    expect(reply.length).toBeGreaterThan(0);
  });
});

describe("a firm outside the demo directory does not freeze the conversation", () => {
  it.each(["AusSuper", "Zorbo Financial", "Hi, I want to complain about my super fund, AusSuper."])(
    "accepts %s and moves on",
    (message) => {
      const { state } = turn(emptyState(), message, "firm.name");
      expect(state.firm.name).not.toBe("");
      // Unknown to the directory, so no member number may be attached.
      expect(state.firm.afca_member_no).toBe("");
      expect(nextField(state)?.path).not.toBe("firm.name");
    },
  );

  it("does not mistake a story for a firm name", () => {
    const { state } = turn(
      emptyState(),
      "They cancelled my insurance without telling me and I am very upset",
      "firm.name",
    );
    expect(state.firm.name).toBe("");
  });

  it("progresses past the firm question instead of repeating it", () => {
    let state = turn(emptyState(), "AusSuper", "firm.name").state;
    const first = nextField(state)?.path;
    state = turn(state, "I don't have an account number", "firm.reference").state;
    expect(nextField(state)?.path).not.toBe(first);
  });
});

describe("answers route to the field just asked about, not to whatever is still missing", () => {
  it("applies 'no' to the AFCA question the assistant just asked, even though the form panel already answered it", () => {
    // The person clicked "Yes" on the AFCA toggle in the form panel, which
    // satisfies open_afca_complaint and advances "what's still missing" to
    // consents.authority. But the assistant's last message in the transcript
    // was still asking about AFCA, and the person's "no" is answering THAT
    // question, not the consents one groupedWithNext would now point at.
    //
    // The history content is a REAL prior reply (not a hand-typed question),
    // so the reverse lookup is exercised against what the app actually emits
    // rather than against a string written to match.
    let state = applyPatch(emptyState(), {
      firm: { name: "AustralianSuper", no_reference: true },
      service: { type: "Superannuation" },
    });
    const asked = mockBrain(state, "", "open_afca_complaint");
    expect(asked.reply).toContain("Do you already have a complaint open with AFCA?");
    const history = [{ role: "assistant", content: asked.reply }];

    // Now the form panel answers AFCA directly, moving "still missing" on to
    // consents.authority — reproducing the state the browser bug needs.
    state = applyPatch(state, { open_afca_complaint: true });

    const { patch } = mockBrain(state, "no", undefined, history);
    expect(patch.open_afca_complaint).toBe(false);
    // The wrong-field symptom the bug produced was the "no" being recorded
    // against the authority-to-act consent instead of the AFCA question. The
    // reply may well go on to ASK about consents next — that is correct; what
    // must not happen is the answer landing there.
    expect(patch.consents).toBeUndefined();
  });

  it("falls back to groupedWithNext's field when history has no matching question (empty history)", () => {
    // Same setup, but with no history at all — today's behaviour: the "no"
    // has nowhere else to go but whatever groupedWithNext currently points at
    // (consents.authority, since open_afca_complaint is already satisfied).
    const state = applyPatch(emptyState(), {
      firm: { name: "AustralianSuper", no_reference: true },
      open_afca_complaint: true,
    });
    const { patch } = mockBrain(state, "no", undefined, []);
    expect(patch.open_afca_complaint).toBeUndefined();
    expect(patch.consents?.authority).toBe(false);
  });

  it("falls back to groupedWithNext's field when history is entirely absent (undefined)", () => {
    const state = applyPatch(emptyState(), {
      firm: { name: "AustralianSuper", no_reference: true },
      open_afca_complaint: true,
    });
    const { patch } = mockBrain(state, "no");
    expect(patch.open_afca_complaint).toBeUndefined();
    expect(patch.consents?.authority).toBe(false);
  });

  it("prefers an explicit focusPath over the history-derived path", () => {
    // The UI still knows better than a text-matched guess when it has an
    // explicit focus (e.g. the person is typing directly into a form field's
    // chat affordance for a different question than the last assistant turn).
    const state = applyPatch(emptyState(), {
      firm: { name: "AustralianSuper", no_reference: true },
      open_afca_complaint: true,
    });
    const history = [
      { role: "assistant", content: "Do you already have a complaint open with AFCA?" },
    ];
    const { patch } = mockBrain(state, "no", "legal_proceedings", history);
    expect(patch.open_afca_complaint).toBeUndefined();
    expect(patch.legal_proceedings).toBe(false);
  });

  it("does not treat a bare name as a firm when history shows a different question was asked (answerTargetIsFirm site)", () => {
    // This is the discriminating case for the derivation at line 251
    // (`answerTargetIsFirm`), which gates whether a bare name is trusted as
    // a firm at all — namedFirmCandidate only fires when we actually asked
    // for a firm. firm.name is left empty here on purpose: with an empty
    // firm.name, groupedWithNext(state)[0].path is ALWAYS "firm.name" (it is
    // the first required field in form order), so that alone would make
    // this test pass whether or not line 251 consults history. What
    // actually exercises the fix is that history's last question was about
    // something else entirely (legal_proceedings) — if line 251 correctly
    // prefers that history-derived path over groupedWithNext's fallback,
    // "Zorbo Financial" is not recognised as an answer to "which firm" and
    // is not applied to firm.name.
    const state = emptyState();
    const history = [
      { role: "assistant", content: "Is there any court case or legal action going on about this?" },
    ];
    const { patch } = mockBrain(state, "Zorbo Financial", undefined, history);
    expect(patch.firm).toBeUndefined();
  });

  it("does treat a bare name as a firm when history shows the firm question was asked (answerTargetIsFirm site)", () => {
    // The positive counterpart: history's last question was "which firm",
    // via a real prior mockBrain() reply, so the bare name is trusted.
    const state = emptyState();
    const asked = mockBrain(state, "", "firm.name");
    expect(asked.reply).toContain("Which financial firm is your complaint about?");
    const history = [{ role: "assistant", content: asked.reply }];

    const { patch } = mockBrain(state, "Zorbo Financial", undefined, history);
    expect(patch.firm?.name).toBe("Zorbo Financial");
  });
});

describe("replies carry the question only — the counter lives in the UI", () => {
  it("does not prefix an acknowledgement or append a 'things left' footer", () => {
    // Both used to be composed into every reply. The remaining-field count is
    // now rendered from state in the chat pane, and what the brain captured is
    // visible in the form panel, so the message is just the next question.
    const state = applyPatch(emptyState(), { firm: { name: "AustralianSuper" } });
    const { reply } = mockBrain(state, "I have no reference number", "firm.reference");

    expect(reply).not.toMatch(/left after this/i);
    expect(reply).not.toMatch(/Got it/i);
    expect(reply).not.toMatch(/I've noted/i);
  });

  it("answers a story turn without the removed acknowledgement or footer", () => {
    const { reply } = mockBrain(
      emptyState(),
      "I emailed AustralianSuper on 3 Sept about my insurance being cancelled and they haven't replied.",
    );
    // A story turn proposes a narrative draft, so assert on the absence of the
    // two removed fragments rather than on a one-line shape.
    expect(reply).not.toMatch(/left after this/i);
    expect(reply).not.toMatch(/Got it/i);
  });
});
