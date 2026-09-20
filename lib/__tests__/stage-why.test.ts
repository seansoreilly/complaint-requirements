/**
 * Why AFCA asks for each section.
 *
 * The fields all carry help saying what to type. This is the other question —
 * what the answer is FOR — and it is the one a concierge is actually for.
 * Someone who knows the firm must have had a chance to respond first writes a
 * better complaint than someone filling in boxes, and filling in boxes is the
 * half of this product that already works.
 *
 * Pinned the way `field-help.test.ts` pins the field tooltips: a stage added
 * later without one is a gap in the coaching, and nothing else would catch it.
 */
import { describe, expect, it } from "vitest";
import { STAGES } from "../schema";

describe("every stage says why it matters", () => {
  for (const stage of STAGES.filter((s) => s.fields.length > 0)) {
    it(`${stage.id} has a why`, () => {
      expect(stage.why, `stage "${stage.id}" has no why`).toBeTruthy();
    });
  }

  /**
   * It has to say something about AFCA's process, not restate the title. The
   * threshold is crude on purpose — the point is to catch a placeholder, not
   * to grade the prose.
   */
  it("says more than the title does", () => {
    for (const stage of STAGES.filter((s) => s.fields.length > 0)) {
      expect(stage.why?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it("mentions AFCA or the firm somewhere in each", () => {
    for (const stage of STAGES.filter((s) => s.fields.length > 0)) {
      expect(stage.why?.toLowerCase()).toMatch(/afca|firm/);
    }
  });
});
