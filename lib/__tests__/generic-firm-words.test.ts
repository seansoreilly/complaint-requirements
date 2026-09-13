/**
 * A query made only of generic words must never name one firm.
 *
 * "super fund" and "the super fund" resolved to Hesta Super Fund with
 * status "matched" — a confident, single answer, which the route then uses to
 * stamp an AFCA member number onto the complaint. The person named no firm at
 * all: both their words appear in that one firm's name, so the overlap was
 * 1.0. Someone complaining about a different fund who opens with "it's about my
 * super fund" would carry Hesta's member number on their form.
 *
 * `score` already guards this — a candidate matching on generic words alone
 * scores 0 — but the `allGeneric` exemption, which exists so "australian super"
 * can still rank, turned the guard off for exactly the queries it was meant to
 * catch. The exemption now lets such a query RANK candidates without letting it
 * SETTLE on one: an all-generic query can be ambiguous, never matched.
 *
 * Found by probing the directory after persona 12 passed: the app did ask which
 * fund, but because "my super fund" was not_found, not because it was
 * ambiguous. The trap the persona exists to spring had never fired.
 */
import { describe, expect, it } from "vitest";
import { lookupFirm } from "../directory";
import { emptyState } from "../schema";

function status(query: string): string {
  return lookupFirm(query).status;
}

describe("a query made only of generic words", () => {
  it("never settles on a single firm", () => {
    // Each of these names no firm. Hesta Super Fund contains both words of the
    // first two, which is why they were matched before.
    for (const q of ["super fund", "the super fund", "superannuation fund", "super", "bank"]) {
      expect(status(q), `"${q}" must not be a confident match`).not.toBe("matched");
    }
  });

  it("still ranks, so the caller can ask which", () => {
    // Not "not_found": the person did say something, and the candidates are
    // what lets the assistant ask "which of these?" rather than start over.
    const result = lookupFirm("super fund");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.map((c) => c.firm.name)).toContain("Hesta Super Fund");
    }
  });

  it("still matches a name the query accounts for in full", () => {
    // The reason the generic-word exemption exists, and the case this fix must
    // not break: "australian super" covers AustralianSuper's whole name once
    // spacing is ignored, so it is a real answer rather than a generic phrase.
    expect(status("australian super")).toBe("matched");
    expect(status("  australian super ")).toBe("matched");
    expect(status("AustralianSuper")).toBe("matched");
  });

  it("still corrects a typo to the firm that was meant", () => {
    // "Westpack" ranks one candidate. An earlier version of this fix refused a
    // single candidate outright and broke typo correction — a worse outcome
    // than the bug being fixed.
    expect(status("Westpack")).not.toBe("not_found");
  });

  it("leaves distinctive names alone", () => {
    for (const q of ["Rest", "Westpac", "ANZ", "Hesta"]) {
      expect(status(q), `"${q}" should still match`).toBe("matched");
    }
  });
});

/**
 * The note the person actually reads when their firm is unresolved.
 *
 * After the generic-word fix, "super fund" comes back ambiguous with a single
 * candidate — Hesta — because it is the only name those words touch. The route
 * said "Several firms match ...: Hesta Super Fund", which is both wrong on its
 * face and quietly dangerous: told several match and shown one, a person
 * reasonably confirms that one, and lands on Hesta by a longer route than the
 * bug this fix removed.
 */
describe("the unresolved-firm note", () => {
  it("does not say several when it found one", async () => {
    const { POST } = await import("../../app/api/chat/route");
    const state = emptyState();
    state.firm.name = "super fund";
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ state, message: "does that help?" }),
      }),
    );
    const body = await response.json();
    expect(body.firmNote).toBeTruthy();
    expect(body.firmNote).not.toContain("Several firms match");
    expect(body.firmNote).toContain("Hesta Super Fund");
    expect(body.firmNote).toContain("may not be the firm you mean");
    expect(body.state.firm.afca_member_no).toBe("");
  });
});
