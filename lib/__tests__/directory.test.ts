import { describe, expect, it } from "vitest";
import { lookupFirm } from "../directory";

describe("lookupFirm", () => {
  it("matches an exact name", () => {
    const result = lookupFirm("AustralianSuper");
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.firm.afca_member_no).toBe("10657");
  });

  it("matches a common alias", () => {
    const result = lookupFirm("commbank");
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.firm.name).toBe("Commonwealth Bank of Australia");
  });

  it("matches case- and spacing-insensitively", () => {
    const result = lookupFirm("  australian super ");
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.firm.name).toBe("AustralianSuper");
  });

  it("matches on ABN with or without spaces", () => {
    const spaced = lookupFirm("65 714 394 898");
    const bare = lookupFirm("65714394898");
    expect(spaced.status).toBe("matched");
    expect(bare.status).toBe("matched");
    if (spaced.status === "matched") expect(spaced.firm.name).toBe("AustralianSuper");
  });

  it("reports not found for a firm outside the demo directory", () => {
    expect(lookupFirm("Bank of Nowhere").status).toBe("not_found");
  });

  it("returns nothing for an empty query", () => {
    expect(lookupFirm("   ").status).toBe("not_found");
  });

  it("supplies a complaint contact for the readiness nudge", () => {
    const result = lookupFirm("hesta");
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.firm.complaint_contact.phone).toBeTruthy();
    }
  });
});
