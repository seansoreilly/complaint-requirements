import { describe, expect, it } from "vitest";
import {
  applyPatch,
  cleanPatch,
  coerceDate,
  formatDateAU,
  isValidEmail,
  parsePatch,
} from "../patch";
import { emptyState } from "../schema";

const TODAY = new Date("2026-09-11T00:00:00Z");

describe("coerceDate", () => {
  it("passes ISO dates through", () => {
    expect(coerceDate("2025-09-03", TODAY)).toBe("2025-09-03");
  });

  it("reads '3 Sept' as the most recent 3 September", () => {
    expect(coerceDate("3 Sept", TODAY)).toBe("2026-09-03");
  });

  it("rolls a not-yet-reached month/day back a year", () => {
    expect(coerceDate("25 Dec", TODAY)).toBe("2025-12-25");
  });

  it("reads day-first slashes, as Australians write them", () => {
    expect(coerceDate("3/9/2025", TODAY)).toBe("2025-09-03");
    expect(coerceDate("11/10/2024", TODAY)).toBe("2024-10-11");
  });

  it("reads month-first words and full month names", () => {
    expect(coerceDate("September 3 2025", TODAY)).toBe("2025-09-03");
    expect(coerceDate("3rd September 2025", TODAY)).toBe("2025-09-03");
  });

  it("expands two-digit years", () => {
    expect(coerceDate("3/9/25", TODAY)).toBe("2025-09-03");
  });

  it("returns empty for unreadable input", () => {
    expect(coerceDate("sometime last winter", TODAY)).toBe("");
  });

  it("rejects days that do not exist in the month", () => {
    expect(coerceDate("31 February 2026", TODAY)).toBe("");
    expect(coerceDate("31 April 2026", TODAY)).toBe("");
  });

  it("knows which Februaries have 29 days", () => {
    expect(coerceDate("29 Feb 2024", TODAY)).toBe("2024-02-29");
    expect(coerceDate("29 Feb 2025", TODAY)).toBe("");
  });

  it("validates an ISO date instead of trusting its shape", () => {
    expect(coerceDate("2026-13-45", TODAY)).toBe("");
    expect(coerceDate("2026-02-30", TODAY)).toBe("");
    expect(coerceDate("2026-09-03", TODAY)).toBe("2026-09-03");
  });

  it("rejects years outside any plausible range", () => {
    expect(coerceDate("1 Jan 1850", TODAY)).toBe("");
  });

  it("takes the day out of a timestamp the model returned", () => {
    expect(coerceDate("2025-09-03T00:00:00Z", TODAY)).toBe("2025-09-03");
    expect(coerceDate("2025-09-03 14:30", TODAY)).toBe("2025-09-03");
  });

  it("reads the longer ways a date gets written out", () => {
    expect(coerceDate("3rd of September 2025", TODAY)).toBe("2025-09-03");
    expect(coerceDate("3 September, 2025", TODAY)).toBe("2025-09-03");
    expect(coerceDate("03-Sep-2025", TODAY)).toBe("2025-09-03");
  });

  it("will not invent a day for a month on its own", () => {
    expect(coerceDate("September 2025", TODAY)).toBe("");
  });
});

describe("formatDateAU", () => {
  it("shows a stored date the way Australians read it", () => {
    expect(formatDateAU("2025-09-03")).toBe("03/09/2025");
    expect(formatDateAU("2024-10-11")).toBe("11/10/2024");
  });

  it("leaves a half-typed date alone", () => {
    expect(formatDateAU("")).toBe("");
    expect(formatDateAU("3/9")).toBe("3/9");
    expect(formatDateAU("3 Sept 2025")).toBe("3 Sept 2025");
  });

  it("round-trips what someone types on an Australian form", () => {
    expect(formatDateAU(coerceDate("3/9/2025", TODAY))).toBe("03/09/2025");
  });
});

describe("dates that cannot have happened yet", () => {
  it("refuses a future date for when they complained", () => {
    const { patch, issues } = cleanPatch(
      { complained_to_firm: { date: "3 Sept 2099" } },
      TODAY,
    );
    expect(patch.complained_to_firm?.date).toBeUndefined();
    expect(issues[0].message).toContain("future");
  });

  it("refuses a future date of birth", () => {
    const { patch, issues } = cleanPatch({ complainant: { dob: "2030-01-01" } }, TODAY);
    expect(patch.complainant?.dob).toBeUndefined();
    expect(issues).toHaveLength(1);
  });

  it("still accepts today", () => {
    const { patch } = cleanPatch({ complained_to_firm: { date: "2026-09-11" } }, TODAY);
    expect(patch.complained_to_firm?.date).toBe("2026-09-11");
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses and rejects incomplete ones", () => {
    expect(isValidEmail("sam@example.com")).toBe(true);
    expect(isValidEmail("sam@example")).toBe(false);
    expect(isValidEmail("sam at example.com")).toBe(false);
  });
});

describe("cleanPatch", () => {
  it("coerces a spoken date into the patch", () => {
    const { patch } = cleanPatch({ complained_to_firm: { date: "3 Sept" } }, TODAY);
    expect(patch.complained_to_firm?.date).toBe("2026-09-03");
  });

  it("drops an unreadable date and reports it", () => {
    const { patch, issues } = cleanPatch({ complained_to_firm: { date: "ages ago" } }, TODAY);
    expect(patch.complained_to_firm?.date).toBeUndefined();
    expect(issues.map((i) => i.path)).toContain("complained_to_firm.date");
  });

  it("drops an invalid email rather than writing it through", () => {
    const { patch, issues } = cleanPatch({ complainant: { email: "nope" } }, TODAY);
    expect(patch.complainant?.email).toBeUndefined();
    expect(issues).toHaveLength(1);
  });

  it("coerces service type case back to the canonical spelling", () => {
    const { patch } = cleanPatch({ service: { type: "superannuation" } }, TODAY);
    expect(patch.service?.type).toBe("Superannuation");
  });

  it("rejects a service type outside the enum", () => {
    const { patch, issues } = cleanPatch({ service: { type: "Crypto" } }, TODAY);
    expect(patch.service?.type).toBeUndefined();
    expect(issues.map((i) => i.path)).toContain("service.type");
  });

  it("caps the narrative at the AFCA character limit", () => {
    const { patch } = cleanPatch({ complaint: { narrative: "x".repeat(10_500) } }, TODAY);
    expect(patch.complaint?.narrative).toHaveLength(10_000);
  });
});

describe("applyPatch", () => {
  it("merges nested fields without clobbering siblings", () => {
    const state = applyPatch(emptyState(), { firm: { name: "AustralianSuper" } });
    const next = applyPatch(state, { firm: { reference: "12345" } });
    expect(next.firm.name).toBe("AustralianSuper");
    expect(next.firm.reference).toBe("12345");
  });

  it("keeps an answered 'no' distinct from unanswered", () => {
    const state = applyPatch(emptyState(), { complained_to_firm: { yes: false } });
    expect(state.complained_to_firm.yes).toBe(false);
    expect(emptyState().complained_to_firm.yes).toBeNull();
  });

  it("replaces arrays wholesale rather than concatenating", () => {
    const first = applyPatch(emptyState(), { complaint: { issues: ["a", "b"] } });
    const second = applyPatch(first, { complaint: { issues: ["c"] } });
    expect(second.complaint.issues).toEqual(["c"]);
  });

  it("ignores fields the model invented", () => {
    const state = applyPatch(emptyState(), { nonsense: true } as never);
    expect("nonsense" in state).toBe(false);
  });

  it("does not mutate the state it was given", () => {
    const before = emptyState();
    applyPatch(before, { firm: { name: "Westpac" } });
    expect(before.firm.name).toBe("");
  });
});

describe("parsePatch", () => {
  it("rejects a patch of the wrong shape", () => {
    const { patch, issues } = parsePatch({ firm: "AustralianSuper" });
    expect(patch).toEqual({});
    expect(issues).toHaveLength(1);
  });

  it("accepts a well-formed multi-field patch", () => {
    const { patch } = parsePatch({
      firm: { name: "AustralianSuper" },
      complained_to_firm: { yes: true, how: "email" },
      service: { type: "Superannuation" },
    });
    expect(patch.firm?.name).toBe("AustralianSuper");
    expect(patch.complained_to_firm?.yes).toBe(true);
  });
});
