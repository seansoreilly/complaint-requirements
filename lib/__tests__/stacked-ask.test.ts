/**
 * Do not ask for a field the reply has already asked for.
 *
 * Third occurrence on the ledger of `endsWithQuestion` missing an ask, and the
 * one that made it a defect rather than a cosmetic flaw. From case 12's return
 * turn — the single turn `deferred` exists to make gentle:
 *
 *   "...Which part of your super does the complaint relate to?
 *
 *    - Account balance / contributions
 *    - Insurance in superannuation (TPD)
 *    - ...
 *
 *    If you're still not sure, that's absolutely fine — just say so and I'll
 *    note it as something you'd rather not answer.
 *
 *    Which of these fits best? Account balance / contributions, Death benefit
 *    distribution, Insurance in superannuation (TPD), ..."
 *
 * The last paragraph is `questionFor("service.subtype")` stacked under a reply
 * that had already asked the same thing, with the options listed twice. The app
 * pressed twice in one breath on the field it had just promised to be gentle
 * about.
 *
 * The earlier two were the same shape and I let them go: case 8 round 3 ("tell
 * me and I'll mark it") and case 9 ("I'll then draft the complaint text for you
 * to check"), both replies that invited an answer without a question mark.
 *
 * Two mechanisms, and both are needed. `alreadyAsks` is the stronger: it checks
 * whether THIS field has already been put to the person — its label, or two or
 * more of its options — which does not depend on wording. I argued that was
 * enough and that adding phrases to IMPERATIVE_ASK only chases the symptom. It
 * is not enough: case 8's reply carried no options and no label, so nothing but
 * the phrasing could catch it. The phrase list stays, fed only from replies
 * that actually occurred.
 */
import { describe, expect, it } from "vitest";
import { alreadyAsks, ensureAsk } from "../continue";
import { endsWithQuestion } from "../questions";
import { emptyState, type ComplaintState } from "../schema";

function needsSubtype(): ComplaintState {
  const state = emptyState();
  state.firm.name = "AustralianSuper";
  state.firm.no_reference = true;
  state.open_afca_complaint = false;
  state.consents = { authority: true, engagement_charter: true };
  state.service.type = "Superannuation";
  state.complaint.issues = ["Account administration error"];
  return state;
}

// The real reply from case 12, trimmed to its shape.
const ALREADY_ASKED = [
  "Which part of your super does the complaint relate to?",
  "",
  "- Account balance / contributions",
  "- Insurance in superannuation (TPD)",
  "- Insurance in superannuation (income protection)",
  "- Fees and charges",
  "",
  "If you're still not sure, that's absolutely fine — just say so and I'll note",
  "it as something you'd rather not answer.",
].join("\n");

describe("a reply that already asks for the field", () => {
  it("does not get the same question stacked underneath", () => {
    const out = ensureAsk(ALREADY_ASKED, needsSubtype());
    // The options appear once, in the model's own wording — not twice.
    expect(out).toBe(ALREADY_ASKED);
    expect(out).not.toContain("Which of these fits best?");
  });

  it("still appends when the reply asks for something else entirely", () => {
    const other = "Roughly when did you find out the cover had been cancelled?";
    const out = ensureAsk(other, needsSubtype());
    expect(out).toBe(other); // ends with a question, so nothing is added
  });

  it("still appends when the reply asks for nothing at all", () => {
    const trailing = "Thanks — I'll shape that into the complaint text for you.";
    const out = ensureAsk(trailing, needsSubtype());
    expect(out).toContain("Which of these fits best?");
  });
});

describe("alreadyAsks", () => {
  const subtypeField = { path: "service.subtype", label: "Product or service", stageId: "service" };

  it("sees the options listed, however they are phrased", () => {
    expect(alreadyAsks(ALREADY_ASKED, subtypeField, needsSubtype())).toBe(true);
  });

  it("sees the field's label", () => {
    const byLabel = "Could you tell me your product or service? I'll note it either way.";
    expect(alreadyAsks(byLabel, subtypeField, needsSubtype())).toBe(true);
  });

  it("is not fooled by one option mentioned in passing", () => {
    // "TPD" appearing once in a sentence about something else is not an ask.
    const passing = "You mentioned TPD cover earlier. When did you first claim?";
    expect(alreadyAsks(passing, subtypeField, needsSubtype())).toBe(false);
  });

  it("does not fire on a different field's list", () => {
    // The issue-category question, which legitimately carries its own options.
    const issues = [
      "Which of these fit best — you can pick more than one:",
      "Denial of insurance claim, Delay in claim handling, Incorrect premiums or fees.",
    ].join("\n");
    expect(alreadyAsks(issues, subtypeField, needsSubtype())).toBe(false);
  });

  it("handles a field with no option list", () => {
    const dob = { path: "complainant.dob", label: "Date of birth", stageId: "contact" };
    expect(alreadyAsks("What is your date of birth?", dob, needsSubtype())).toBe(true);
    expect(alreadyAsks("What happened next?", dob, needsSubtype())).toBe(false);
  });
});

/**
 * The weaker half of the pair, pinned against the replies that occurred.
 *
 * `IMPERATIVE_ASK` matches how a sentence is phrased, and there is always
 * another phrasing — which is why `alreadyAsks` exists. But two of the three
 * real replies carried no options and no field label, so only this can catch
 * them. Entries come from transcripts, never from imagination.
 */
describe("closing imperatives that hand the turn back", () => {
  it("recognises the two that invited an answer", () => {
    expect(endsWithQuestion("If it turns up later, tell me and I'll mark it on the form.")).toBe(true);
    expect(
      endsWithQuestion("If you're still not sure, that's absolutely fine — just say so and I'll note it."),
    ).toBe(true);
  });

  it("does not treat a statement of intent as an ask", () => {
    // "I'll then draft the complaint text for you to check" invites nothing —
    // it says what the app will do next. Recorded as cosmetic, no deduction.
    // Matching it would also match the legitimate trail-off below, which MUST
    // get a question appended, so the two cannot be told apart by phrasing.
    expect(endsWithQuestion("Take your time — I'll then draft the complaint text for you to check.")).toBe(false);
    expect(endsWithQuestion("I'll shape that into the complaint text for you afterwards.")).toBe(false);
  });
});
