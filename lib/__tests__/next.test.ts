import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch";
import { emptyState } from "../schema";
import { groupedWithNext, missingFor, nextField, stageProgress } from "../next";
import { summarise } from "../export";

describe("missingFor", () => {
  it("asks for the firm first on an empty form", () => {
    expect(nextField(emptyState())?.path).toBe("firm.name");
  });

  it("hides the reference field once 'no reference' is set", () => {
    const state = applyPatch(emptyState(), { firm: { no_reference: true } });
    expect(missingFor(state).map((m) => m.path)).not.toContain("firm.reference");
  });

  it("only asks how and when they complained if they say they did", () => {
    const said_no = applyPatch(emptyState(), { complained_to_firm: { yes: false } });
    expect(missingFor(said_no).map((m) => m.path)).not.toContain("complained_to_firm.date");

    const said_yes = applyPatch(emptyState(), { complained_to_firm: { yes: true } });
    const paths = missingFor(said_yes).map((m) => m.path);
    expect(paths).toContain("complained_to_firm.date");
    expect(paths).toContain("complained_to_firm.final_reply");
  });

  it("treats an explicit false as answered, not missing", () => {
    const state = applyPatch(emptyState(), { legal_proceedings: false });
    expect(missingFor(state).map((m) => m.path)).not.toContain("legal_proceedings");
  });

  it("never lists optional or sensitive fields as missing", () => {
    const paths = missingFor(emptyState()).map((m) => m.path);
    expect(paths).not.toContain("complainant.pronoun");
    expect(paths).not.toContain("attachments");
    expect(paths).not.toContain("complainant.mobile");
  });
});

describe("an empty form claims no progress", () => {
  it("ticks no stage before anything is answered", () => {
    const ticked = stageProgress(emptyState()).filter((s) => s.complete);
    expect(ticked).toEqual([]);
  });

  it("counts an unticked consent as unanswered, not as 'no'", () => {
    expect(missingFor(emptyState()).map((m) => m.path)).toContain("consents.authority");
    const ticked = applyPatch(emptyState(), {
      consents: { authority: true, engagement_charter: true },
    });
    expect(missingFor(ticked).map((m) => m.path)).not.toContain("consents.authority");
  });

  it("does not tick the attachments stage until a file is listed", () => {
    const before = stageProgress(emptyState()).find((s) => s.id === "attachments");
    expect(before?.complete).toBe(false);
    const after = stageProgress(applyPatch(emptyState(), { attachments: ["letter.pdf"] }));
    expect(after.find((s) => s.id === "attachments")?.complete).toBe(true);
  });
});

describe("stageProgress", () => {
  it("ticks a stage only once its required fields are answered", () => {
    const partial = applyPatch(emptyState(), { firm: { name: "AustralianSuper" } });
    expect(stageProgress(partial).find((s) => s.id === "firm")?.complete).toBe(false);

    const done = applyPatch(partial, {
      firm: { no_reference: true },
      open_afca_complaint: false,
    });
    expect(stageProgress(done).find((s) => s.id === "firm")?.complete).toBe(true);
  });

  it("marks review complete only when nothing is missing anywhere", () => {
    expect(stageProgress(emptyState()).find((s) => s.id === "review")?.complete).toBe(false);
  });
});

describe("groupedWithNext", () => {
  it("groups the contact details into one ask", () => {
    let state = emptyState();
    // Answer everything before the contact stage.
    state = applyPatch(state, {
      firm: { name: "AustralianSuper", no_reference: true },
      open_afca_complaint: false,
      complainant: { lodging_for: "self" },
      consents: { authority: true, engagement_charter: true },
      service: { type: "Superannuation", subtype: "Fees and charges" },
      complaint: { issues: ["Incorrect premiums or fees"], narrative: "A story." },
      complained_to_firm: { yes: false },
      legal_proceedings: false,
      outcome: { seeking_compensation: "not_sure", fair_outcome: "A refund." },
    });
    const group = groupedWithNext(state).map((m) => m.path);
    expect(group).toContain("complainant.first_name");
    expect(group).toContain("complainant.email");
    expect(group).toContain("complainant.address.postcode");
    // DOB is deliberately asked on its own so skipping it doesn't stall the rest.
    expect(group).not.toContain("complainant.dob");
  });
});

describe("review summary wording", () => {
  it("does not render an unticked consent as a refusal", () => {
    const rows = summarise(emptyState()).flatMap((section) => section.rows);
    const consent = rows.find((row) => row.label === "Authority to act consent");
    expect(consent?.value).toBe("Not yet agreed");
  });

  it("reads an agreed consent plainly", () => {
    const state = applyPatch(emptyState(), { consents: { authority: true } });
    const rows = summarise(state).flatMap((section) => section.rows);
    expect(rows.find((row) => row.label === "Authority to act consent")?.value).toBe("Agreed");
  });
});
