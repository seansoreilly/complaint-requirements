/**
 * A scam the person paid themselves is not an unauthorised transaction.
 *
 * From case 20's run, one paragraph after the app had correctly said what AFCA
 * can look at now is "how the bank itself handled things":
 *
 *   "I've pencilled in 'Unauthorised transactions' as the issue for now, but
 *    I'd rather use what fits. From this list, which ones describe what went
 *    wrong? — Unauthorised transactions / Service quality / Incorrect
 *    information provided / Delay / Failure to follow instructions"
 *
 * Hugh: "Unauthorised transactions sounds right." Final issues:
 * ["Unauthorised transactions"].
 *
 * Two faults in one turn.
 *
 * The category is wrong on its face. He moved the money himself under
 * deception — the authorised-push-payment side of the line the SCAMS section
 * draws — and the ordinary complaint the app had just named is the bank's
 * handling of his report. An earlier run recorded exactly that.
 *
 * And the list was invented. "Banking deposits and payments" is a stubbed type
 * with no entry in SERVICE_ISSUES, so the model assembled one from Credit's and
 * Superannuation's, then pre-filled a pick before he answered. A person
 * confirms a suggestion; that is what he did.
 */
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../prompt";
import { SERVICE_ISSUES, SERVICE_TYPES, SERVICE_SUBTYPES, emptyState } from "../schema";

describe("stubbed service types", () => {
  it("has no issue list for banking — so any list offered is invented", () => {
    // The premise of the defect, pinned so a later schema change is noticed.
    expect(SERVICE_ISSUES["Banking deposits and payments"]).toBeUndefined();
    expect(SERVICE_TYPES).toContain("Banking deposits and payments");
  });

  it("tells the model not to borrow another type's list", () => {
    const state = emptyState();
    state.service.type = "Banking deposits and payments";
    const prompt = buildSystemPrompt({ state, firm: null }).replace(/\s+/g, " ");
    expect(prompt).toContain("never offer or pre-fill an entry from another service type");
  });

  it("names the stubbed types it applies to", () => {
    const prompt = buildSystemPrompt({ state: emptyState(), firm: null });
    const stubbed = SERVICE_TYPES.filter((t) => !SERVICE_SUBTYPES[t]);
    for (const type of stubbed) {
      expect(prompt).toContain(type);
    }
  });
});

describe("a payment made under deception", () => {
  it("is the firm's handling, never an unauthorised transaction", () => {
    const prompt = buildSystemPrompt({ state: emptyState(), firm: null }).replace(/\s+/g, " ");
    expect(prompt).toContain(
      "when they made the payment themselves, the issue is the firm's handling",
    );
    expect(prompt).toContain('never "Unauthorised transactions"');
  });

  it("keeps the unauthorised category available where it belongs", () => {
    // Someone whose card was used without them is a real unauthorised case and
    // must still be able to say so — the rule is about who moved the money.
    expect(SERVICE_ISSUES["Credit"]).toContain("Unauthorised transactions");
  });
});
