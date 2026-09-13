/**
 * A field deferred after one refusal must not be asked for in the meantime.
 *
 * The observed sequence (step0-9ae75bf.txt turns [3] and [4], and case 12's
 * browser transcript), which is TWO turns, not one:
 *
 *   turn 3  person: "I'm honestly not sure which type of cover it was."
 *           app:    "...I'll leave the product type blank for now...
 *                    Which of those best describe what happened?"
 *                   ← ends with a question, so ensureAsk never runs
 *   turn 4  person: "Account administration error — they just cancelled it..."
 *           app:    "...I'll shape it into the complaint text for you
 *                    afterwards.
 *
 *                    Which of these fits best? Account balance / contributions,
 *                    Insurance in superannuation (TPD), ..."
 *                   ← the seven-item list, appended HERE
 *
 * My first fix suppressed the field on the turn the decline is SPOKEN. The
 * trail-off is a turn later, on an unrelated answer, so that fix cannot reach
 * it — and the test I wrote for it put the decline and the trail-off on one
 * turn, so it was green against a fix that missed the defect.
 *
 * The gap is between turns, so the fix has to be in state, not in a regex over
 * the current sentence. `deferred` carries the refusal forward: `askableFor`
 * skips a deferred path until nothing else is askable, so `ensureAsk` — which
 * reads `askableFor` — cannot append it on ANY later turn.
 */
import { describe, expect, it } from "vitest";
import { ensureAsk } from "../continue";
import { askableFor, missingFor } from "../next";
import { applyPatch } from "../patch";
import { emptyState, type ComplaintState } from "../schema";

/** After the story question, with the product type refused once. */
function afterFirstDecline(): ComplaintState {
  const state = emptyState();
  state.firm.name = "AustralianSuper";
  state.firm.no_reference = true;
  state.open_afca_complaint = false;
  state.consents = { authority: true, engagement_charter: true };
  state.service.type = "Superannuation";
  state.complaint.issues = ["Account administration error"];
  return state;
}

const TRAILS_OFF = [
  "Now the main part: tell me what happened, in your own words.",
  "",
  "Take as much or as little space as you like — I'll shape it into the",
  "complaint text for you afterwards.",
].join("\n");

// The turn after the decline, the person said something unrelated:
// "Account administration error — they just cancelled it without telling me."
// `ensureAsk` never sees that sentence, and does not need to: the deferral
// lives in state, so the field is not askable however many turns pass.

describe("a field deferred after one refusal", () => {
  it("is not appended a turn later, when the person said something else", () => {
    const state = afterFirstDecline();
    state.deferred = ["service.subtype"];
    const out = ensureAsk(TRAILS_OFF, state);
    expect(out).not.toContain("Which of these fits best?");
    expect(out).not.toContain("Insurance in superannuation (TPD)");
  });

  it("is still counted as missing — deferring is not answering", () => {
    const state = afterFirstDecline();
    state.deferred = ["service.subtype"];
    expect(missingFor(state).some((m) => m.path === "service.subtype")).toBe(true);
    expect(askableFor(state).some((m) => m.path === "service.subtype")).toBe(false);
  });

  it("comes back once everything else has been asked", () => {
    // The return-once the README promises, scheduled by code rather than
    // remembered by the model.
    const state = afterFirstDecline();
    state.deferred = ["service.subtype"];
    // Fill every other required field.
    const full = applyPatch(state, {
      complaint: { narrative: "They cancelled my cover without telling me." },
      complained_to_firm: { yes: true, date: "2026-08-20", how: "phone", final_reply: false },
      legal_proceedings: false,
      outcome: { seeking_compensation: "no", fair_outcome: "Reinstate the cover." },
      complainant: {
        lodging_for: "Myself",
        first_name: "Helen",
        last_name: "Byrne",
        email: "helen@example.com",
        dob: "1969-10-12",
        notify_by: "email",
        address: { line1: "18 King William Road", suburb: "Unley", state: "SA", postcode: "5061" },
      },
    });
    expect(askableFor(full).map((m) => m.path)).toEqual(["service.subtype"]);
  });

  it("stops being raised at all once the person refuses a second time", () => {
    const state = afterFirstDecline();
    state.deferred = ["service.subtype"];
    state.declined = ["service.subtype"];
    expect(askableFor(state).some((m) => m.path === "service.subtype")).toBe(false);
    const out = ensureAsk(TRAILS_OFF, state);
    expect(out).not.toContain("Which of these fits best?");
  });

  it("drops the deferral when the person answers after all", () => {
    const state = afterFirstDecline();
    state.deferred = ["service.subtype"];
    const next = applyPatch(state, { service: { subtype: "Insurance in superannuation (TPD)" } });
    expect(next.deferred).not.toContain("service.subtype");
    expect(next.service.subtype).toBe("Insurance in superannuation (TPD)");
  });

  it("ignores a path the model invents", () => {
    const state = afterFirstDecline();
    const next = applyPatch(state, { deferred: ["service.subtype", "not.a.field"] });
    expect(next.deferred).toEqual(["service.subtype"]);
  });

  it("still appends an ordinary outstanding field", () => {
    // The guarantee this must not break: a reply that trails off with something
    // legitimately outstanding still gets a question.
    const state = afterFirstDecline();
    const out = ensureAsk(TRAILS_OFF, state);
    expect(out).toContain("Which of these fits best?");
  });
  it("surfaces every deferred field once nothing else is askable", () => {
    // Two refusals, not one. `askableFor` returns the deferred list when the
    // ready list empties, so both come back rather than one blocking the other
    // — and `groupedWithNext` asks them one at a time, as it does for any other
    // fields. The failure this guards against is a deferred field never
    // surfacing because a second deferred field sits in front of it forever.
    const state = afterFirstDecline();
    state.deferred = ["service.subtype", "complainant.dob"];
    const full = applyPatch(state, {
      complaint: { narrative: "They cancelled my cover without telling me." },
      complained_to_firm: { yes: true, date: "2026-08-20", how: "phone", final_reply: false },
      legal_proceedings: false,
      outcome: { seeking_compensation: "no", fair_outcome: "Reinstate the cover." },
      complainant: {
        lodging_for: "Myself",
        first_name: "Helen",
        last_name: "Byrne",
        email: "helen@example.com",
        notify_by: "email",
        address: { line1: "18 King William Road", suburb: "Unley", state: "SA", postcode: "5061" },
      },
    });
    const paths = askableFor(full).map((m) => m.path);
    expect(paths).toContain("service.subtype");
    expect(paths).toContain("complainant.dob");
  });
});
