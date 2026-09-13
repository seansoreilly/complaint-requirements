import { describe, expect, it } from "vitest";
import { coerceDate, formatDateAU } from "../patch";

// The shapes the live model actually returns under the date rule in
// lib/prompt.ts, recorded from real turns rather than imagined. A prompt
// change that lets the model drift back to ISO or US order fails here.
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
