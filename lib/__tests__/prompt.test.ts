/**
 * The prompt has to tell the model to chase a waiting draft, not re-ask for it.
 */
import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch";
import { emptyState } from "../schema";
import { buildSystemPrompt } from "../prompt";

describe("buildSystemPrompt", () => {
  it("flags a narrative draft that is waiting on approval", () => {
    const state = applyPatch(emptyState(), {
      drafts: { narrative: "They cancelled my cover without telling me." },
    });
    const prompt = buildSystemPrompt({ state, firm: null });
    expect(prompt).toContain("waiting on them");
    expect(prompt).toContain("complaint.narrative");
  });

  it("flags a waiting outcome draft against its own field", () => {
    const state = applyPatch(emptyState(), {
      drafts: { fair_outcome: "Reinstate the cover and refund the premiums." },
    });
    expect(buildSystemPrompt({ state, firm: null })).toContain("outcome.fair_outcome");
  });

  it("says nothing about drafts when none is waiting", () => {
    expect(buildSystemPrompt({ state: emptyState(), firm: null })).not.toContain(
      "waiting on them",
    );
  });

  it("tells the model to keep asking until the form is done", () => {
    const prompt = buildSystemPrompt({ state: emptyState(), firm: null });
    expect(prompt).toContain("End every turn by asking");
  });
});
