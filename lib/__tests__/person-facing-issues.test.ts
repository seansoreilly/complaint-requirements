/**
 * Two things the person should never be told, and one they should.
 *
 * DEFECT 26 — the model announced a firm was not in the directory when it was.
 * Turn 1 of a live run, verbatim:
 *
 *   "Thanks — I've noted Latitude Financial Services as the firm. One thing to
 *    be upfront about: they're not in this demo's firm directory, so I can't
 *    confirm a membership number for them."
 *
 * Latitude is at data/firms.json:106, and the route assigned member 12207 on
 * that same turn — so the summary then showed the number the sentence had just
 * said could not exist. The cause is the prompt: on the turn a firm is first
 * named, `resolveFirm` has not run yet, so `firmFacts` emits the no-firm branch
 * telling the model to "say so plainly" if the firm is not in the directory.
 * The model cannot know that yet, so it guessed. Directory status is the
 * route's to state, never the model's.
 *
 * DEFECT 27 — "· Patch did not match the schema." appeared in the chat. That is
 * `parsePatch`'s internal issue, rendered by app/page.tsx as a note. The person
 * is shown a schema error for something the model did wrong, on a turn whose
 * reply claimed the field had been recorded.
 *
 * The distinction that matters: most issues ARE for the person — "Could not
 * read that as a date" is exactly what they need to see. Two are not.
 */
import { describe, expect, it } from "vitest";
import { cleanPatch, parsePatch } from "../patch";
import { buildSystemPrompt } from "../prompt";
import { emptyState } from "../schema";

describe("what the prompt says about the directory", () => {
  it("never invites the model to state directory status", () => {
    const prompt = buildSystemPrompt({ state: emptyState(), firm: null }).replace(/\s+/g, " ");
    // The old wording. The model cannot know this on the turn it is asked to say it.
    expect(prompt).not.toContain("If it is not in the demo directory, say so plainly");
    expect(prompt).toContain("Never say whether a firm is or is not in the directory");
  });

  it("still tells the model not to invent a member number", () => {
    const prompt = buildSystemPrompt({ state: emptyState(), firm: null }).replace(/\s+/g, " ");
    expect(prompt).toContain("do not guess a member number");
  });
});

describe("which issues reach the person", () => {
  it("keeps a schema failure off the page", () => {
    const { issues } = parsePatch("not an object at all");
    expect(issues.every((i) => i.personFacing !== true)).toBe(true);
  });

  it("shows a date it could not read", () => {
    const { issues } = cleanPatch({ complained_to_firm: { date: "whenever" } });
    const date = issues.find((i) => i.path === "complained_to_firm.date");
    expect(date?.personFacing).toBe(true);
    expect(date?.message).toBe("Could not read that as a date.");
  });

  it("shows a future date, which is a question for them", () => {
    const { issues } = cleanPatch({ complainant: { dob: "2030-01-01" } });
    expect(issues.find((i) => i.path === "complainant.dob")?.personFacing).toBe(true);
  });

  it("keeps the trim notice internal — the text is already capped on screen", () => {
    const { issues } = cleanPatch({ complaint: { narrative: "x".repeat(20000) } });
    const trim = issues.find((i) => i.message.startsWith("Trimmed to"));
    expect(trim).toBeDefined();
    expect(trim?.personFacing).not.toBe(true);
  });
});
