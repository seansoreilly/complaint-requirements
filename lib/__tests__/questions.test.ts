/**
 * The conversation has to keep asking until the form is actually complete.
 *
 * These cover the guarantee itself: while anything is outstanding there is
 * always something to ask, a waiting draft is asked about before any field,
 * and a reply that forgot to ask gets the question appended.
 */
import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch";
import { emptyState } from "../schema";
import { missingFor } from "../next";
import {
  endsWithQuestion,
  outstandingPrompt,
  pendingDraft,
  questionFor,
} from "../questions";
import { ensureAsk } from "../continue";

describe("outstandingPrompt", () => {
  it("always has something to ask while required fields are missing", () => {
    const state = emptyState();
    expect(missingFor(state).length).toBeGreaterThan(0);
    expect(outstandingPrompt(state)).toContain("?");
  });

  it("asks for a waiting narrative draft to be approved, not retold", () => {
    const state = applyPatch(emptyState(), {
      drafts: { narrative: "On 3 September I emailed them about the cancellation." },
    });
    const prompt = outstandingPrompt(state);
    expect(prompt).toMatch(/approve/i);
    // The draft is waiting, so it must not ask them to tell the story again.
    expect(prompt).not.toContain("Tell me what happened");
  });

  it("asks about a waiting outcome draft before any remaining field", () => {
    const state = applyPatch(emptyState(), {
      drafts: { fair_outcome: "Reinstate the insurance cover and refund the premiums." },
    });
    expect(pendingDraft(state)).toBe("fair_outcome");
    expect(outstandingPrompt(state)).toMatch(/approve/i);
  });

  it("falls silent only when the form needs nothing more", () => {
    const state = completeState();
    expect(missingFor(state)).toEqual([]);
    expect(outstandingPrompt(state)).toBeNull();
  });
});

describe("endsWithQuestion", () => {
  it("sees a closing question", () => {
    expect(endsWithQuestion("Got it.\n\nWhat's your date of birth?")).toBe(true);
  });

  it("is not fooled by a question buried above a sign-off", () => {
    const reply = [
      "Did they reply? You said they didn't.",
      "",
      "I've noted that down.",
      "",
      "I'll write this up for you.",
    ].join("\n");
    expect(endsWithQuestion(reply)).toBe(false);
  });

  it("still finds a question above a trailing counter", () => {
    expect(endsWithQuestion("How did you get in touch?\n\n(3 things left after this.)")).toBe(true);
  });

  it("treats an empty reply as asking nothing", () => {
    expect(endsWithQuestion("   ")).toBe(false);
  });
});

describe("ensureAsk", () => {
  it("appends the next question when the reply forgot to ask", () => {
    const state = emptyState();
    const result = ensureAsk("Thanks for telling me that.", state);
    expect(result).toContain("Thanks for telling me that.");
    expect(result).toContain("Which financial firm");
  });

  it("leaves a reply that already asks alone", () => {
    const state = emptyState();
    const reply = "Which financial firm is your complaint about?";
    expect(ensureAsk(reply, state)).toBe(reply);
  });

  it("does not invent a question once the form is complete", () => {
    const reply = "That's everything the form needs.";
    expect(ensureAsk(reply, completeState())).toBe(reply);
  });

  it("rescues the model-failure fallback, which asks for nothing", () => {
    // lib/model.ts returns this when the response will not parse. It ends
    // without a question precisely so the real one gets appended here.
    const fallback = "Sorry — I didn't catch that.";
    const result = ensureAsk(fallback, emptyState());
    expect(result).toContain("Which financial firm");
  });

  it("leaves a reply that asks its own clarifying question alone", () => {
    // A genuine question about something already on the form must not collect a
    // second, redundant question underneath it.
    const reply = "I didn't catch the fund's name — which firm was it?";
    expect(ensureAsk(reply, emptyState())).toBe(reply);
  });

  it("does not count a question stranded above a trailing note", () => {
    // The unmatched-firm note used to be appended after the reply, pushing the
    // question out of the tail so the turn closed on a statement. The note now
    // goes above the reply; this guards the case either way.
    const stranded = [
      "Which financial firm is your complaint about?",
      "",
      `"Bogus Ltd" isn't in this demo's firm directory, so there's no member number.`,
      "",
      "The rest of the form still works.",
    ].join("\n");
    expect(endsWithQuestion(stranded)).toBe(false);
    expect(ensureAsk(stranded, emptyState())).toContain("Which financial firm");
  });

  it("asks for approval rather than a field when a draft is waiting", () => {
    const state = applyPatch(emptyState(), { drafts: { narrative: "A write-up." } });
    const result = ensureAsk("Here's how I'd put it.", state);
    expect(result).toMatch(/approve/i);
  });
});

describe("questionFor", () => {
  it("offers the subtypes that belong to the chosen service type", () => {
    const state = applyPatch(emptyState(), { service: { type: "Superannuation" } });
    const question = questionFor("service.subtype", "Product", state);
    expect(question).toContain("Which of these fits best?");
  });

  it("falls back to the field label for anything unlisted", () => {
    expect(questionFor("complainant.phone", "Phone number", emptyState())).toContain(
      "phone number",
    );
  });
});

/** Every required field answered, so nothing is outstanding. */
function completeState() {
  return applyPatch(emptyState(), {
    complainant: {
      lodging_for: "Myself",
      first_name: "Jo",
      last_name: "Rivers",
      email: "jo@example.com",
      dob: "1980-01-01",
      notify_by: "Email",
      address: {
        line1: "1 Test St",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
      },
    },
    firm: { name: "AustralianSuper", no_reference: true },
    service: { type: "Superannuation", subtype: "Insurance in super" },
    complaint: {
      issues: ["Insurance cancelled"],
      narrative: "They cancelled my cover without telling me.",
    },
    complained_to_firm: { yes: true, date: "2025-09-03", how: "Email", final_reply: false },
    outcome: { seeking_compensation: "no", fair_outcome: "Reinstate the cover." },
    open_afca_complaint: false,
    legal_proceedings: false,
    consents: { authority: true, engagement_charter: true },
  });
}
