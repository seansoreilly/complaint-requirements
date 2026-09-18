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

  it("lets the person win when both sides changed the same field", () => {
    // Conflict rule, reversed from the original server-wins: the form edit
    // happened after the chat message that produced the server's write, often
    // because the person saw the reply going wrong. Overwriting it reads as
    // the form fighting back.
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    current.firm.name = "Typed while thinking";
    const server = structuredClone(snapshot);
    server.firm.name = "Westpac";

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.firm.name).toBe("Typed while thinking");
  });

  it("re-derives the member number for whichever firm name survived", () => {
    // The number belongs to the name. A person renaming the firm mid-flight
    // must not be left holding the other firm's member number.
    const snapshot = emptyState();
    snapshot.firm.name = "AustralianSuper";
    snapshot.firm.afca_member_no = "10657";
    const current = structuredClone(snapshot);
    current.firm.name = "Westpac";
    const server = structuredClone(snapshot);

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.firm.name).toBe("Westpac");
    expect(merged.firm.afca_member_no).not.toBe("10657");
  });

  it("drops the server's issues when the person's service type won", () => {
    // The reported bug exactly: nothing is set yet, the server decides it is a
    // superannuation insurance denial, and mid-flight the person picks Credit.
    // The server's issue belongs to the type that lost.
    const snapshot = emptyState();
    const current = structuredClone(snapshot);
    current.service.type = "Credit";
    const server = structuredClone(snapshot);
    server.service.type = "Superannuation";
    server.complaint.issues = ["Denial of insurance claim"];

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.service.type).toBe("Credit");
    expect(merged.complaint.issues).toEqual([]);
  });

  it("drops a stale issue even when the type was already set", () => {
    // Here reconcile's own typeChanged fires, but the server's write to issues
    // is in `taken` — so protecting it would preserve the stale value.
    const snapshot = emptyState();
    snapshot.service.type = "Superannuation";
    const current = structuredClone(snapshot);
    current.service.type = "Credit";
    const server = structuredClone(snapshot);
    server.complaint.issues = ["Denial of insurance claim"];

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.service.type).toBe("Credit");
    expect(merged.complaint.issues).toEqual([]);
  });

  it("does not leave the service type contradicting the issues", () => {
    // The concurrent-edit bug that produced "Credit" beside the
    // superannuation issue "Denial of insurance claim".
    const snapshot = emptyState();
    snapshot.service.type = "Superannuation";
    snapshot.complaint.issues = ["Denial of insurance claim"];
    const current = structuredClone(snapshot);
    current.service.type = "Credit";
    const server = structuredClone(snapshot);

    const merged = applyServerDelta(current, snapshot, server);

    expect(merged.service.type).toBe("Credit");
    expect(merged.complaint.issues).toEqual([]);
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

    // Equal but for the member number, which is re-derived from the name
    // rather than trusted from the reply — the fixture's AustralianSuper had
    // no number on it, and the directory supplies one.
    expect({ ...merged, firm: { ...merged.firm, afca_member_no: "" } }).toEqual(server);
    expect(merged.firm.afca_member_no).toBe("10657");
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
