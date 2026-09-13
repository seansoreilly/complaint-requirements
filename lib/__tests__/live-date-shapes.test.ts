import { describe, expect, it } from "vitest";
import { coerceDate, formatDateAU } from "../patch";

// Shapes observed coming back from the real model under the date rule in
// lib/prompt.ts, asserting the parser reads them day-first. These are
// recorded observations, not a live check: nothing here calls the model, so
// a prompt that drifted back to US order would still pass. It would show up
// as the wrong month on the form.
const TODAY = new Date("2026-09-13T00:00:00Z");

describe("dates the model sends back", () => {
  it("reads a day-first date as day-first", () => {
    expect(coerceDate("03/09/2026", TODAY)).toBe("2026-09-03");
  });

  it("keeps 9 March as March, not September", () => {
    expect(coerceDate("09/03/2026", TODAY)).toBe("2026-03-09");
  });

  it("round-trips back to the form unchanged", () => {
    expect(formatDateAU(coerceDate("03/09/2025", TODAY))).toBe("03/09/2025");
  });
});
