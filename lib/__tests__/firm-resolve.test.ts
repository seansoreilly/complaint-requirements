/**
 * Resolving the firm on the path a person edits by hand.
 *
 * "Firm details cannot be invented" held on the chat path — the route strips
 * any member number the model emits and fills it from the directory — but the
 * form panel writes straight to state through `edit()` in app/page.tsx, which
 * never consulted the directory. Retyping the firm there left the previous
 * firm's member number sitting next to the new name.
 */
import { describe, expect, it } from "vitest";
import { resolveFirmDetails } from "../directory";
import { emptyState } from "../schema";

function resolvedAs(name: string, existingNumber = "") {
  const state = emptyState();
  state.firm.name = name;
  state.firm.afca_member_no = existingNumber;
  return resolveFirmDetails(state);
}

describe("resolveFirmDetails", () => {
  it("clears a member number left behind by the firm it no longer names", () => {
    // The bug as observed: AustralianSuper (10657) retyped as Westpac in the
    // form panel kept 10657 — a real number shown against the wrong firm.
    const result = resolvedAs("Westpac", "10657");

    expect(result.state.firm.afca_member_no).not.toBe("10657");
  });

  it("fills the number from the directory when the name matches", () => {
    const result = resolvedAs("Westpac", "10657");

    expect(result.state.firm.name).toBe("Westpac Banking Corporation");
    expect(result.state.firm.afca_member_no).toBe("10102");
  });

  it("clears the number for a firm that is not in the directory", () => {
    const result = resolvedAs("Bank of Nowhere Pty Ltd", "10657");

    expect(result.state.firm.afca_member_no).toBe("");
    expect(result.state.firm.name).toBe("Bank of Nowhere Pty Ltd");
    expect(result.note).toContain("directory");
  });

  it("clears the number while the name is still ambiguous", () => {
    const result = resolvedAs("Super", "10657");

    expect(result.state.firm.afca_member_no).toBe("");
    expect(result.note).toContain("Super");
  });

  it("leaves an empty firm name alone", () => {
    const result = resolvedAs("", "");

    expect(result.state.firm.afca_member_no).toBe("");
    expect(result.note).toBeNull();
  });

  it("never invents a number from a name that merely contains digits", () => {
    const result = resolvedAs("99999", "");

    expect(result.state.firm.afca_member_no).toBe("");
  });

  it("hands back the same state when the firm is already resolved", () => {
    // Every blur on the firm field runs this. Returning a fresh clone each time
    // would make the caller treat an unchanged field as a change and clear an
    // unrelated note off the screen — a date error, say — just for tabbing past.
    const state = emptyState();
    state.firm.name = "Westpac Banking Corporation";
    state.firm.afca_member_no = "10102";

    expect(resolveFirmDetails(state).state).toBe(state);
  });

  it("does not mutate the state it was given", () => {
    const state = emptyState();
    state.firm.name = "Westpac";
    state.firm.afca_member_no = "10657";

    resolveFirmDetails(state);

    expect(state.firm.afca_member_no).toBe("10657");
    expect(state.firm.name).toBe("Westpac");
  });
});
