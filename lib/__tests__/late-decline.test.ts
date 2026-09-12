/**
 * A refusal the model has not recorded yet still has to be honoured.
 *
 * Observed on a live run, and in the Step 0 evidence file for the very build
 * that claimed defect 16 fixed:
 *
 *   turn 3  person: "I'm honestly not sure which type of cover it was."
 *           app:    "No problem at all — I'll leave the product type blank for
 *                    now and we can come back to it later."
 *           state:  declined []        ← the model did not record it yet
 *   turn 4  app:    "...I'll shape it into the complaint text for you
 *                    afterwards.
 *
 *                    Which of these fits best? Account balance / contributions,
 *                    Death benefit distribution, Insurance in superannuation
 *                    (TPD), ..."
 *           state:  declined []
 *   turn 5  state:  declined ["service.subtype"]   ← recorded, one turn late
 *
 * That bare list is `questionFor("service.subtype")` appended by `ensureAsk`,
 * underneath a reply that was doing the right thing. It is defect 16's exact
 * shape — the forced list, no opt-out, over a promise just made — reached
 * through the one turn where `declined` had not caught up.
 *
 * I documented this as a residual edge under defect 16 and judged it too rare
 * to fix, on the theory that it needed a parse failure. It does not: it happens
 * whenever the model records the refusal a turn late, which is often.
 *
 * The route cannot know the model's intent, but it can read what was just said.
 * If the person's own message declines, `ensureAsk` must not append the field
 * that was on the table — it has one turn to wait for `declined` to catch up.
 */
import { describe, expect, it } from "vitest";
import { ensureAsk } from "../continue";
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

const TRAILING = [
  "Now the main part: tell me what happened, in your own words.",
  "",
  "Take as much or as little space as you like — I'll shape it into the",
  "complaint text for you afterwards.",
].join("\n");

describe("a decline the model has not recorded yet", () => {
  it("does not get the declined field appended underneath", () => {
    const state = needsSubtype();
    const out = ensureAsk(TRAILING, state, "I'm honestly not sure which type of cover it was.");
    expect(out).not.toContain("Which of these fits best?");
    expect(out).not.toContain("Insurance in superannuation (TPD)");
  });

  it("still appends when the person said nothing of the kind", () => {
    const state = needsSubtype();
    const out = ensureAsk(TRAILING, state, "It was cancelled in August.");
    expect(out).toContain("Which of these fits best?");
  });

  it("recognises the ways a person actually declines", () => {
    const state = needsSubtype();
    for (const said of [
      "I'm not sure",
      "I don't know, sorry",
      "no idea",
      "I can't remember",
      "I'd rather not say",
      "skip that one",
      "not sure what to call it",
      "I don't have that to hand",
    ]) {
      const out = ensureAsk(TRAILING, state, said);
      expect(out, said).not.toContain("Which of these fits best?");
    }
  });

  it("leaves a reply that already asks something alone", () => {
    const state = needsSubtype();
    const asking = "Roughly when did you find out the cover had gone?";
    expect(ensureAsk(asking, state, "I'm not sure")).toBe(asking);
  });

  it("still ends the turn with something to answer when the reply is empty", () => {
    // The parse-failure path: an empty reply plus a decline must not leave the
    // person with nothing at all. Falling back to the declined field would be
    // the old bug, so it asks for the next thing instead.
    const state = needsSubtype();
    const out = ensureAsk("", state, "I'm not sure");
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).not.toContain("Which of these fits best?");
  });
});
