/**
 * A required field the person has declined twice.
 *
 * The README promises the assistant returns to a skipped field once with the
 * reason, and leaves it if they decline again. Code had no way to represent
 * "leave it": the field stayed at the head of `missingFor`, so `ensureAsk`
 * appended the canonical question to every subsequent turn and the prompt said
 * "Ask about: service.subtype" underneath. A live run produced exactly that —
 * "I won't ask again, I'll leave the product blank", then a forced choice with
 * no "not sure" option two turns later.
 *
 * The person's refusal is recorded in state, the same shape as
 * `firm.no_reference` and `sensitive_offered`. It stops the field being raised;
 * it does not pretend the field is answered.
 */
import { describe, expect, it } from "vitest";
import { emptyState } from "../schema";
import { missingFor, nextField, groupedWithNext } from "../next";
import { outstandingPrompt } from "../questions";
import { buildSystemPrompt } from "../prompt";
import { applyPatch } from "../patch";

/**
 * Everything answered except the product type — the shape case 5 reached, where
 * she had told her whole story and only the Latitude product was in doubt.
 */
function stateNeedingSubtype(): ReturnType<typeof emptyState> {
  const state = applyPatch(emptyState(), {
    complainant: {
      lodging_for: "Myself",
      first_name: "Marie",
      last_name: "Osei",
      email: "marie@example.com",
      dob: "1979-04-02",
      notify_by: "Email",
      address: { line1: "3 Test St", suburb: "Sydney", state: "NSW", postcode: "2000" },
    },
    firm: { name: "Latitude Financial", no_reference: true },
    service: { type: "Credit" },
    complaint: { issues: ["Unauthorised transactions"], narrative: "Charges I did not make." },
    complained_to_firm: { yes: true, date: "2025-08-14", how: "Phone", final_reply: false },
    outcome: { seeking_compensation: "yes", fair_outcome: "Refund the charges." },
    open_afca_complaint: false,
    legal_proceedings: false,
    consents: { authority: true, engagement_charter: true },
  });
  state.service.subtype = "";
  return state;
}

describe("a field the person has declined", () => {
  it("is the next question before they decline it", () => {
    const state = stateNeedingSubtype();
    expect(nextField(state)?.path).toBe("service.subtype");
    expect(outstandingPrompt(state)).toContain("Which of these fits best?");
  });

  it("is no longer asked once declined", () => {
    const state = stateNeedingSubtype();
    state.declined = ["service.subtype"];
    expect(nextField(state)?.path).not.toBe("service.subtype");
    expect(outstandingPrompt(state) ?? "").not.toContain("Which of these fits best?");
    expect(groupedWithNext(state).some((m) => m.path === "service.subtype")).toBe(false);
  });

  it("still counts as missing, because a blank field is blank", () => {
    const state = stateNeedingSubtype();
    state.declined = ["service.subtype"];
    expect(missingFor(state).some((m) => m.path === "service.subtype")).toBe(true);
  });

  it("is not put back on the model's agenda by the system prompt", () => {
    const state = stateNeedingSubtype();
    state.declined = ["service.subtype"];
    const prompt = buildSystemPrompt({ state, firm: null });
    expect(prompt).not.toContain("Ask about: service.subtype");
    expect(prompt).toContain("service.subtype (Product or service) — declined");
  });

  it("comes back if the person later volunteers an answer", () => {
    const state = stateNeedingSubtype();
    state.declined = ["service.subtype"];
    const next = applyPatch(state, { service: { subtype: "Personal loan" } });
    expect(next.service.subtype).toBe("Personal loan");
    expect(next.declined).not.toContain("service.subtype");
  });

  it("ignores a path the model invents", () => {
    const state = stateNeedingSubtype();
    const next = applyPatch(state, { declined: ["service.subtype", "not.a.field"] });
    expect(next.declined).toEqual(["service.subtype"]);
  });
});

/**
 * A required field that ticks itself.
 *
 * `notify_by` defaulted to "email", so `isAnswered` said yes from the moment
 * the page loaded: it never entered `missingFor`, was never asked, and the
 * export asserted a contact preference the person had never been offered.
 * Email is a reasonable default to *offer*; it is not an answer they gave.
 */
describe("contact preference", () => {
  it("is asked, not assumed", () => {
    const state = emptyState();
    expect(state.complainant.notify_by).toBe("");
    expect(missingFor(state).some((m) => m.path === "complainant.notify_by")).toBe(true);
  });

  it("still counts as answered once they choose", () => {
    const state = applyPatch(emptyState(), { complainant: { notify_by: "post" } });
    expect(missingFor(state).some((m) => m.path === "complainant.notify_by")).toBe(false);
  });
});

/**
 * `merge` replaces arrays wholesale, so a patch naming only the newest refusal
 * would drop every earlier one and the person would be asked again for
 * something they had already refused twice. The union in `reconcile` makes the
 * model's list additive without making a refusal permanent.
 */
describe("the declined list accumulates", () => {
  it("keeps an earlier refusal when a patch names only the newest", () => {
    const state = stateNeedingSubtype();
    state.declined = ["service.subtype"];
    state.complainant.dob = "";
    const next = applyPatch(state, { declined: ["complainant.dob"] });
    expect(next.declined).toContain("service.subtype");
    expect(next.declined).toContain("complainant.dob");
  });

  it("still lets an answer clear a refusal, union or not", () => {
    const state = stateNeedingSubtype();
    state.declined = ["service.subtype"];
    const next = applyPatch(state, { service: { subtype: "Personal loan" } });
    expect(next.declined).not.toContain("service.subtype");
  });
});
