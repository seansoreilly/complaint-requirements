/**
 * Answers that a later change makes inapplicable must not survive into the
 * exported document. Each of these produced a form that contradicted itself.
 */
import { describe, expect, it } from "vitest";
import { applyPatch, cleanPatch, emptyState, reconcile } from "../patch";
import { applyServerDelta } from "../merge-state";
import { missingFor } from "../next";
import { exportJson, summarise } from "../export";
import type { ComplaintState } from "../schema";

function apply(state: ComplaintState, raw: Parameters<typeof cleanPatch>[0]): ComplaintState {
  return applyPatch(state, cleanPatch(raw).patch);
}

describe("service type switch", () => {
  const superannuation = {
    service: { type: "Superannuation", subtype: "Insurance in superannuation (TPD)" },
    complaint: { issues: ["Decision of trustee"] },
  };

  it("clears a subtype that belonged to the old service type", () => {
    let state = apply(emptyState(), superannuation);
    state = apply(state, { service: { type: "Credit" } });
    expect(state.service.subtype).toBe("");
  });

  it("clears issues that belonged to the old service type", () => {
    let state = apply(emptyState(), superannuation);
    state = apply(state, { service: { type: "Credit" } });
    expect(state.complaint.issues).toEqual([]);
  });

  it("asks for the subtype again instead of reporting the form complete", () => {
    let state = apply(emptyState(), superannuation);
    state = apply(state, { service: { type: "Credit" } });
    const missing = missingFor(state).map((m) => m.path);
    expect(missing).toContain("service.subtype");
    expect(missing).toContain("complaint.issues");
  });

  it("never shows Credit alongside a superannuation product", () => {
    let state = apply(emptyState(), superannuation);
    state = apply(state, { service: { type: "Credit" } });
    const rows = summarise(state).find((s) => s.title === "Type of service")?.rows ?? [];
    expect(rows.find((r) => r.label === "Product or service")?.value).toBe("—");
  });

  it("keeps a subtype the same change supplies — the demo fills all three at once", () => {
    let state = apply(emptyState(), superannuation);
    state = apply(state, {
      service: { type: "Credit", subtype: "Home loan" },
      complaint: { issues: ["Responsible lending"] },
    });
    expect(state.service.subtype).toBe("Home loan");
    expect(state.complaint.issues).toEqual(["Responsible lending"]);
  });

  it("leaves everything alone when the same type is restated", () => {
    let state = apply(emptyState(), superannuation);
    state = apply(state, { service: { type: "Superannuation" } });
    expect(state.service.subtype).toBe("Insurance in superannuation (TPD)");
    expect(state.complaint.issues).toEqual(["Decision of trustee"]);
  });

  it("does not clear when the type is set for the first time", () => {
    // A subtype volunteered before the type, then the type arrives.
    let state = apply(emptyState(), { service: { subtype: "Home loan" } });
    state = apply(state, { service: { type: "Credit" } });
    expect(state.service.subtype).toBe("Home loan");
  });

  it("clears an unmodelled free-text subtype too", () => {
    // General insurance takes free text, so there is no option list to
    // validate against — a stale value would otherwise look perfectly fine.
    let state = apply(emptyState(), superannuation);
    state = apply(state, { service: { type: "General insurance" } });
    expect(state.service.subtype).toBe("");
  });
});

describe("closing a branch", () => {
  const complained = {
    complained_to_firm: { yes: true, date: "2025-09-03", how: "email", final_reply: false },
  };

  it("drops the date and method when the person says they never complained", () => {
    let state = apply(emptyState(), complained);
    state = apply(state, { complained_to_firm: { yes: false } });
    expect(state.complained_to_firm.date).toBe("");
    expect(state.complained_to_firm.how).toBe("");
    expect(state.complained_to_firm.final_reply).toBeNull();
  });

  it("keeps them out of the JSON export, not merely hidden from the review", () => {
    let state = apply(emptyState(), complained);
    state = apply(state, { complained_to_firm: { yes: false } });
    expect(exportJson(state)).not.toContain("2025-09-03");
  });

  it("drops a reference number once the person says they have none", () => {
    let state = apply(emptyState(), { firm: { reference: "ACC-12345" } });
    state = apply(state, { firm: { no_reference: true } });
    expect(state.firm.reference).toBe("");
    expect(exportJson(state)).not.toContain("ACC-12345");
  });

  it("restores nothing on its own when the branch reopens", () => {
    let state = apply(emptyState(), complained);
    state = apply(state, { complained_to_firm: { yes: false } });
    state = apply(state, { complained_to_firm: { yes: true } });
    expect(state.complained_to_firm.date).toBe("");
    expect(missingFor(state).map((m) => m.path)).toContain("complained_to_firm.date");
  });

  it("leaves an open branch untouched", () => {
    let state = apply(emptyState(), complained);
    state = apply(state, { legal_proceedings: false });
    expect(state.complained_to_firm.date).toBe("2025-09-03");
    expect(state.complained_to_firm.how).toBe("email");
  });
});

describe("reconcile on a direct form edit", () => {
  it("clears the old subtype when the type is changed in the form panel", () => {
    const previous = apply(emptyState(), {
      service: { type: "Superannuation", subtype: "Fees and charges" },
      complaint: { issues: ["Incorrect premiums or fees"] },
    });
    // What app/page.tsx does: clone, setPath, reconcile protecting the edited field.
    const next = structuredClone(previous);
    next.service.type = "Credit";
    const result = reconcile(previous, next, (p) => p === "service.type");
    expect(result.service.subtype).toBe("");
    expect(result.complaint.issues).toEqual([]);
  });

  it("never clears the field the person is editing", () => {
    const previous = apply(emptyState(), {
      service: { type: "Superannuation", subtype: "Fees and charges" },
    });
    const next = structuredClone(previous);
    next.service.subtype = "Home loan";
    const result = reconcile(previous, next, (p) => p === "service.subtype");
    expect(result.service.subtype).toBe("Home loan");
  });

  it("clears the date when the branch is closed from the form panel", () => {
    const previous = apply(emptyState(), {
      complained_to_firm: { yes: true, date: "2025-09-03", how: "phone", final_reply: true },
    });
    const next = structuredClone(previous);
    next.complained_to_firm.yes = false;
    const result = reconcile(previous, next, (p) => p === "complained_to_firm.yes");
    expect(result.complained_to_firm.date).toBe("");
    expect(result.complained_to_firm.how).toBe("");
  });
});

describe("rebuilding an inbound state", () => {
  // app/api/chat/route.ts sanitises the client's state with
  // applyPatch(emptyState(), parsed) every turn, so reconcile() runs against a
  // blank previous state on every request. A complete, consistent form has to
  // come back out of that untouched.
  const full = {
    firm: { name: "AustralianSuper", reference: "ACC-1", no_reference: false },
    service: { type: "Superannuation", subtype: "Insurance in superannuation (TPD)" },
    complaint: { issues: ["Decision of trustee"], narrative: "They cancelled my cover." },
    complained_to_firm: { yes: true, date: "2025-09-03", how: "Email", final_reply: false },
  };

  it("keeps a consistent form intact", () => {
    const rebuilt = apply(emptyState(), full);
    expect(rebuilt.service.subtype).toBe("Insurance in superannuation (TPD)");
    expect(rebuilt.complaint.issues).toEqual(["Decision of trustee"]);
  });

  it("keeps the answers behind an open branch", () => {
    const rebuilt = apply(emptyState(), full);
    expect(rebuilt.complained_to_firm.date).toBe("2025-09-03");
    expect(rebuilt.complained_to_firm.how).toBe("Email");
    expect(rebuilt.firm.reference).toBe("ACC-1");
  });
});

describe("a reconciled clear surviving the in-flight merge", () => {
  it("carries the server's cleared subtype through to the client", () => {
    // The clear is a real change (a value becoming ""), so it has to reach
    // the client like any other server write, not read as "nothing happened".
    const snapshot = apply(emptyState(), {
      service: { type: "Superannuation", subtype: "Fees and charges" },
    });
    const server = apply(snapshot, { service: { type: "Credit" } });
    expect(server.service.subtype).toBe("");

    const merged = applyServerDelta(snapshot, snapshot, server);
    expect(merged.service.subtype).toBe("");
    expect(merged.service.type).toBe("Credit");
  });

  it("still keeps an unrelated in-flight edit alongside that clear", () => {
    const snapshot = apply(emptyState(), {
      service: { type: "Superannuation", subtype: "Fees and charges" },
    });
    const server = apply(snapshot, { service: { type: "Credit" } });

    // Meanwhile the person typed their first name into the form panel.
    const live = structuredClone(snapshot);
    live.complainant.first_name = "Sam";

    const merged = applyServerDelta(live, snapshot, server);
    expect(merged.complainant.first_name).toBe("Sam");
    expect(merged.service.subtype).toBe("");
  });
});
