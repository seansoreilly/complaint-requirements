/**
 * The prompt has to tell the model to chase a waiting draft, not re-ask for it.
 */
import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch";
import { emptyState } from "../schema";
import { buildSystemPrompt } from "../prompt";
import { completeState } from "./completion-handoff.test";

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

  /**
   * The model dated things from its training data otherwise. Told "28 February
   * 2026" it called that date "in the future" and pressed for 2025 — the person
   * was right and had to argue. Code knew the date all along; the model was not
   * told it.
   */
  it("states today's date so the model does not date things from training", () => {
    const prompt = buildSystemPrompt({
      state: emptyState(),
      firm: null,
      today: new Date("2026-09-12T00:00:00Z"),
    });
    expect(prompt).toContain("2026-09-12");
    expect(prompt).toContain("September 2026");
  });

  it("warns against calling a date future without checking today", () => {
    const prompt = buildSystemPrompt({ state: emptyState(), firm: null });
    // Line-wrapped in the prompt, so match without the newline.
    expect(prompt.replace(/\s+/g, " ")).toContain(
      "never press them to change a year that is already right",
    );
  });
});

/**
 * The evidence question has to be asked by the MODEL, not only guaranteed by
 * code.
 *
 * `ensureAsk` appends the completion handoff, but only when the reply asks
 * nothing — and a prompted model almost always ends on a question. Driven to
 * completion on the live brain it offered the optional sensitive questions and
 * closed "or shall we leave them blank?", so `endsWithQuestion` returned early
 * and the evidence question was never asked at all. The code fallback stays as
 * the guarantee for a turn that trails off; this is what makes it happen on
 * the turns that do not.
 */
describe("the completion instruction", () => {
  it("asks for evidence once nothing required is missing", () => {
    const prompt = buildSystemPrompt({ state: completeState(), firm: null });
    expect(prompt.replace(/\s+/g, " ")).toContain("statements, letters or screenshots");
  });

  it("still sends them on to the review and the export", () => {
    const prompt = buildSystemPrompt({ state: completeState(), firm: null });
    expect(prompt).toContain("review step");
    expect(prompt).toContain("export");
  });
});
