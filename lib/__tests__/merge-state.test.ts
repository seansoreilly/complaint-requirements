import { describe, expect, it } from "vitest";
import { applyServerDelta } from "../merge-state";
import { emptyState } from "../schema";

describe("applyServerDelta", () => {
  it("keeps a field the person typed while the reply was in flight", () => {
    // Reproduction of the lost-update bug: the snapshot sent to the server had
    // an empty address line, the person typed into it while "Thinking…" was
    // showing, and the server's reply — computed from the pre-edit snapshot —
    // still has it empty. The in-flight edit must survive the merge.
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    current.complainant.address.line1 = "LOSTUPDATE123";
    const server = structuredClone(snapshot); // server never saw the edit

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.complainant.address.line1).toBe("LOSTUPDATE123");
  });

  it("applies a field the server changed that the person did not touch", () => {
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    const server = structuredClone(snapshot);
    server.firm.name = "Westpac";

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.firm.name).toBe("Westpac");
  });

  it("lets the server win when both sides changed the same field", () => {
    // Conflict rule: the server's write came from the person's own chat
    // message this turn, which is the more deliberate statement of intent
    // than a form field mid-edit — so on a genuine conflict, the server wins.
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    current.firm.name = "Typed while thinking";
    const server = structuredClone(snapshot);
    server.firm.name = "Westpac";

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.firm.name).toBe("Westpac");
  });

  it("resolves nested address paths independently", () => {
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    current.complainant.address.suburb = "Typed suburb";
    const server = structuredClone(snapshot);
    server.complainant.address.postcode = "2000";

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.complainant.address.suburb).toBe("Typed suburb");
    expect(merged.complainant.address.postcode).toBe("2000");
  });

  it("keeps an in-flight attachment the server did not see", () => {
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    current.attachments = ["receipt.pdf"];
    const server = structuredClone(snapshot); // server's reply still has none

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.attachments).toEqual(["receipt.pdf"]);
  });

  it("applies a server-changed attachments array the person did not touch", () => {
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    const server = structuredClone(snapshot);
    server.attachments = ["bank-statement.pdf"];

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.attachments).toEqual(["bank-statement.pdf"]);
  });

  it("distinguishes null, false and empty string as different leaf values", () => {
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    // complained_to_firm.yes starts null; the person has not touched it.
    const server = structuredClone(snapshot);
    server.complained_to_firm.yes = false;

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.complained_to_firm.yes).toBe(false);
  });

  it("is a no-op when nothing changed in flight — merged equals server state", () => {
    // The overwhelmingly common case: no concurrent edit, so replacing state
    // wholesale and merging the (empty) delta must agree.
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    const server = structuredClone(snapshot);
    server.firm.name = "AustralianSuper";
    server.complainant.address.suburb = "Sydney";
    server.complaint.issues = ["delay"];

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged).toEqual(server);
  });

  it("does not mutate any of the state it was given", () => {
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    current.firm.name = "Typed while thinking";
    const server = structuredClone(snapshot);
    server.firm.name = "Westpac";

    applyServerDelta(current, snapshot, server);

    expect(current.firm.name).toBe("Typed while thinking");
    expect(snapshot.firm.name).toBe("");
    expect(server.firm.name).toBe("Westpac");
  });

  it("ignores fields the server response invented", () => {
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    const server = { ...structuredClone(snapshot), nonsense: true } as unknown as ReturnType<
      typeof emptyState
    >;

    const merged = applyServerDelta(current, snapshot, server);

    expect("nonsense" in merged).toBe(false);
  });
});
