/**
 * The reference number and the account number are two different things.
 *
 * The tester ended up with "CPX-4471 / account 062-114 8837 2291" in one
 * field, because the form offered one box labelled "Reference / account
 * number" and they had both. A complaint reference is what the firm calls the
 * conversation; an account number is what it calls the money. AFCA's own form
 * asks for them separately, and concatenating them means neither can be read
 * by anything downstream — including the paste into the real form, which is
 * the entire point of the export.
 *
 * The masking is the second half, and it is about a demo rather than about
 * AFCA. People paste real BSBs and account numbers into things that look like
 * forms. This one says on every screen that it is not AFCA and submits
 * nothing, and it still should not display a full account number back at
 * them: the state keeps what they typed, and every screen shows the last three
 * digits.
 */
import { describe, expect, it } from "vitest";
import { maskAccount, summarise } from "../export";
import { emptyState } from "../schema";
import { findField } from "../schema";

describe("the two numbers are two fields", () => {
  it("has a reference field that is not about the account", () => {
    const reference = findField("firm.reference");
    expect(reference?.label).toBe("Complaint reference");
    expect(reference?.label.toLowerCase()).not.toContain("account");
  });

  it("has an account number field of its own", () => {
    const account = findField("firm.account_number");
    expect(account).toBeDefined();
    expect(account?.label).toBe("Account or policy number");
  });

  /**
   * Optional, and deliberately so. Someone who has a complaint reference has
   * everything AFCA needs to find the matter, and a required account-number
   * field is a demo pressing for a real bank account before it will continue.
   */
  it("does not require the account number", () => {
    expect(findField("firm.account_number")?.required).toBe(false);
  });

  it("keeps them apart on the review", () => {
    const state = emptyState();
    state.firm.reference = "CPX-4471";
    state.firm.account_number = "062-114 8837 2291";
    const rows = summarise(state).flatMap((section) => section.rows);
    const reference = rows.find((row) => row.label === "Complaint reference");
    expect(reference?.value).toBe("CPX-4471");
  });
});

describe("maskAccount", () => {
  it("shows the last three digits and hides the rest", () => {
    expect(maskAccount("062-114 8837 2291")).toBe("••• 291");
  });

  it("leaves a short value alone, having nothing to hide", () => {
    expect(maskAccount("12")).toBe("12");
  });

  it("passes an empty value straight through", () => {
    expect(maskAccount("")).toBe("");
  });

  /**
   * The review is a screen, so it masks. The state keeps what was typed — the
   * person owns it, the JSON export is theirs, and a demo silently destroying
   * an answer is worse than showing it.
   */
  it("masks the account number on the review but not in the state", () => {
    const state = emptyState();
    state.firm.account_number = "062-114 8837 2291";
    const rows = summarise(state).flatMap((section) => section.rows);
    const account = rows.find((row) => row.label === "Account or policy number");
    expect(account?.value).toBe("••• 291");
    expect(state.firm.account_number).toBe("062-114 8837 2291");
  });
});
