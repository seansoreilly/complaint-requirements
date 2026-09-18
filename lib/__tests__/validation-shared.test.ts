/**
 * One definition of "usable", shared by every path that writes a value.
 *
 * The model's answers went through cleanPatch and were checked. A person
 * typing the same thing into the form did not: "not-an-email" was stored,
 * counted as answered, earned the stage a completion tick, and shipped in the
 * export. Validity has to be a property of the field, not of the route in.
 */
import { describe, expect, it } from "vitest";
import { emptyState, findField, isUsable, isValidEmail } from "../schema";
import { isAnswered, missingFor, nextField, stageProgress } from "../next";
import { cleanPatch } from "../patch";
import { plainTextSummary, summarise } from "../export";

const emailField = findField("complainant.email");

describe("isUsable", () => {
  it("rejects an incomplete email", () => {
    expect(emailField).toBeDefined();
    if (!emailField) return;
    expect(isUsable(emailField, "not-an-email")).toBe(false);
    expect(isUsable(emailField, "sam@example")).toBe(false);
    expect(isUsable(emailField, "sam@example.com")).toBe(true);
  });

  it("rejects a date that never became ISO", () => {
    const dob = findField("complainant.dob");
    expect(dob).toBeDefined();
    if (!dob) return;
    expect(isUsable(dob, "sometime last year")).toBe(false);
    expect(isUsable(dob, "1985-03-02")).toBe(true);
  });

  it("leaves fields with no semantic rule alone", () => {
    const firstName = findField("complainant.first_name");
    expect(firstName).toBeDefined();
    if (!firstName) return;
    expect(isUsable(firstName, "anything at all")).toBe(true);
  });
});

describe("an invalid value is not an answer", () => {
  it("does not count as answered", () => {
    const state = emptyState();
    state.complainant.email = "not-an-email";
    expect(emailField).toBeDefined();
    if (!emailField) return;
    expect(isAnswered(emailField, state)).toBe(false);

    state.complainant.email = "sam@example.com";
    expect(isAnswered(emailField, state)).toBe(true);
  });

  it("stays on the missing list, so it gets asked again", () => {
    const state = emptyState();
    state.complainant.email = "not-an-email";
    expect(missingFor(state).some((m) => m.path === "complainant.email")).toBe(true);
  });

  it("does not let its stage report complete", () => {
    const state = emptyState();
    state.complainant.email = "not-an-email";
    const stage = stageProgress(state).find((s) => s.id === "about_you");
    if (stage) expect(stage.complete).toBe(false);
  });

  it("can still be the next field to ask about", () => {
    const state = emptyState();
    state.complainant.email = "nope";
    // Whatever comes next, a field holding an unusable value must not have
    // been silently ticked off on the way past.
    expect(nextField(state)?.path).not.toBe(undefined);
    expect(missingFor(state).some((m) => m.path === "complainant.email")).toBe(true);
  });
});

describe("the summary does not present an unusable value as finished", () => {
  it("flags it in the review rows and the pasteable text", () => {
    const state = emptyState();
    state.complainant.email = "not-an-email";
    const rows = summarise(state).flatMap((s) => s.rows);
    const email = rows.find((r) => r.label === "Email");
    expect(email?.value).toContain("not-an-email");
    expect(email?.value).toContain("needs checking");
    expect(plainTextSummary(state)).toContain("needs checking");
  });

  it("leaves a usable value alone", () => {
    const state = emptyState();
    state.complainant.email = "sam@example.com";
    const email = summarise(state)
      .flatMap((s) => s.rows)
      .find((r) => r.label === "Email");
    expect(email?.value).toBe("sam@example.com");
  });
});

describe("the model's path and the person's path agree", () => {
  it("rejects the same email from the model that the form rejects", () => {
    const { patch, issues } = cleanPatch({ complainant: { email: "not-an-email" } });
    expect(patch.complainant?.email).toBeUndefined();
    expect(issues.some((i) => i.path === "complainant.email")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});
