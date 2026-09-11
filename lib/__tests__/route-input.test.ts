/**
 * The browser sends the whole state each turn, so the route's inputs are
 * untrusted. These cover the shapes that previously crashed it.
 */
import { describe, expect, it } from "vitest";
import { patchSchema, applyPatch } from "../patch";
import { emptyState } from "../schema";

/** Mirrors sanitiseState in app/api/chat/route.ts. */
function sanitiseState(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return emptyState();
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return emptyState();
  return applyPatch(emptyState(), parsed.data);
}

describe("state sanitising", () => {
  it.each([null, undefined, "a string", 42, [], [1, 2], true])(
    "falls back to an empty form for %s",
    (input) => {
      expect(sanitiseState(input)).toEqual(emptyState());
    },
  );

  it("rebuilds a valid state faithfully", () => {
    const original = applyPatch(emptyState(), {
      firm: { name: "AustralianSuper" },
      complained_to_firm: { yes: false },
    });
    const rebuilt = sanitiseState(original);
    expect(rebuilt.firm.name).toBe("AustralianSuper");
    expect(rebuilt.complained_to_firm.yes).toBe(false);
  });

  it("drops keys the schema does not know", () => {
    const rebuilt = sanitiseState({ firm: { name: "Westpac" }, injected: "evil" });
    expect("injected" in rebuilt).toBe(false);
    expect(rebuilt.firm.name).toBe("Westpac");
  });

  it("does not let a hostile key reach Object.prototype", () => {
    sanitiseState(JSON.parse('{"__proto__":{"polluted":true}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects a state whose fields are the wrong type", () => {
    expect(sanitiseState({ firm: { name: 42 } })).toEqual(emptyState());
    expect(sanitiseState({ attachments: "not-a-list" })).toEqual(emptyState());
  });
});
