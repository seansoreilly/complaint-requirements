/**
 * A reply that says it changed a field, on a turn that changed nothing.
 *
 * The tester was told "I've changed the date to 2 September" and believed it,
 * which is the only sensible thing to do when the chat is the thing talking to
 * you. The form still read 7 September. The bot was narrating what it had
 * decided to do rather than reporting what the form had accepted, and nothing
 * in the app knew the difference.
 *
 * `correctSavedClaim` already covers the version of this with a draft card in
 * it. This is the same lie one field along, and the route can catch it for the
 * same reason: it holds the state before and after, so it knows whether the
 * form moved. `changedPaths` answers that, and a claim with an empty diff gets
 * an honest sentence put in front of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, flagUnbackedClaim, makesChangeClaim } from "../../app/api/chat/route";
import { emptyState } from "../schema";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

function toolResponse(input: unknown): void {
  create.mockResolvedValue({
    content: [{ type: "tool_use", name: "turn", input }],
    stop_reason: "tool_use",
  });
}

async function turn(state: ReturnType<typeof emptyState>, message: string) {
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ state, message }),
    }),
  );
  return response.json();
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  create.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("makesChangeClaim", () => {
  it("reads the claim the tester was given", () => {
    expect(makesChangeClaim("I've changed the date to 2 September.")).toBe(true);
  });

  /**
   * Both shapes the pronoun takes, as the saved-text guard found the model
   * using them: leading the verb, or following it.
   */
  it("reads the other wordings of the same claim", () => {
    expect(makesChangeClaim("I've updated the date to 2 September.")).toBe(true);
    expect(makesChangeClaim("That's now corrected to 2 September.")).toBe(true);
    expect(makesChangeClaim("I have amended that for you.")).toBe(true);
  });

  /**
   * The guard has to stay off ordinary turns. A reply that thanks someone, or
   * asks the next question, has claimed nothing — and an apology for not
   * changing anything, stacked above a turn that never said it had, is its own
   * kind of confusing.
   */
  it("stays quiet on a reply that claims nothing", () => {
    expect(makesChangeClaim("Thanks — what would a fair outcome look like?")).toBe(false);
    expect(makesChangeClaim("Noted. Is there any court case going on about this?")).toBe(false);
    expect(makesChangeClaim("That sounds frustrating.")).toBe(false);
  });

  /**
   * The sentences that made the first version of this pattern wrong.
   *
   * It matched any of eight verbs followed by "to", "as", "in" or "on the
   * form" — which is most of the English language, and every one of these is a
   * turn that legitimately writes nothing. The correction would have fired on
   * all four, telling the person the form had not changed when they had never
   * been told it had.
   *
   * The rule `IMPERATIVE_ASK` states in questions.ts applies here too: entries
   * come from replies that actually occurred, not from imagination. So the
   * pattern now wants a first-person claim about a field, and these stay out.
   */
  it("stays quiet on ordinary sentences that merely use the words", () => {
    expect(makesChangeClaim("Has anything changed in your circumstances since then?")).toBe(false);
    expect(makesChangeClaim("Have they updated you as to their decision?")).toBe(false);
    expect(makesChangeClaim("AFCA has a fixed timeframe to respond.")).toBe(false);
    expect(makesChangeClaim("I've set aside the fees question to come back to.")).toBe(false);
  });
});

describe("a claim with nothing behind it", () => {
  it("is corrected when the turn wrote nothing", async () => {
    const state = emptyState();
    state.firm.name = "AustralianSuper";
    state.firm.afca_member_no = "10657";
    state.complained_to_firm.yes = true;
    state.complained_to_firm.date = "2026-09-07";

    // The shape the tester hit: the reply announces the change, the patch is
    // empty, and the date on the form does not move.
    toolResponse({ reply: "I've changed the date to 2 September.", patch: {} });
    const data = await turn(state, "it was the 2nd, not the 7th");

    expect(data.changed).toEqual([]);
    expect(data.reply).toContain("haven't actually changed anything on the form");
    expect(data.state.complained_to_firm.date).toBe("2026-09-07");
  });

  it("is left alone when the write actually landed", async () => {
    const state = emptyState();
    state.firm.name = "AustralianSuper";
    state.firm.afca_member_no = "10657";
    state.complained_to_firm.yes = true;
    state.complained_to_firm.date = "2026-09-07";

    toolResponse({
      reply: "I've changed the date to 2 September.",
      patch: { complained_to_firm: { date: "2026-09-02" } },
    });
    const data = await turn(state, "it was the 2nd, not the 7th");

    expect(data.changed).toEqual(["complained_to_firm.date"]);
    expect(data.reply).not.toContain("haven't actually changed anything");
    expect(data.state.complained_to_firm.date).toBe("2026-09-02");
  });

  /**
   * Two corrections stacked above one reply is worse than the lie they fix.
   * The draft guard is the more specific of the pair and speaks first, so this
   * one stands down on a turn where text was diverted onto a card.
   */
  it("stands down when the draft guard has already spoken", async () => {
    const state = emptyState();
    state.firm.name = "AustralianSuper";
    state.firm.afca_member_no = "10657";

    toolResponse({
      reply: "I've saved that as your complaint description.",
      patch: { complaint: { narrative: "On 2 September I emailed them about the cancelled cover." } },
    });
    const data = await turn(state, "write it up for me");

    expect(data.reply).toContain("on the card for you to check");
    expect(data.reply).not.toContain("haven't actually changed anything");
  });
});

/**
 * The baseline has to be the state the person sent, not the state the route
 * has already improved.
 *
 * `takeShortFirmAnswer` and `resolveFirmDetails` both run before the model is
 * called — that is the point of them, so the prompt carries real directory
 * facts. Diffing from *after* they ran hides exactly the write the demo opens
 * on: someone types "Westpac", code resolves the firm and its member number,
 * and the one beat the whole split-screen idea rests on produces no chip and
 * no flash.
 */
describe("writes the route itself made", () => {
  it("reports the firm the directory resolved from a bare name", async () => {
    toolResponse({ reply: "Thanks — what kind of financial service is this about?", patch: {} });
    const data = await turn(emptyState(), "Westpac");

    expect(data.state.firm.name).toBe("Westpac Banking Corporation");
    expect(data.changed).toContain("firm.name");
  });
});

describe("flagUnbackedClaim", () => {
  it("keeps the reply and puts the truth above it", () => {
    const flagged = flagUnbackedClaim("I've changed the date to 2 September.");
    expect(flagged).toContain("I've changed the date to 2 September.");
    expect(flagged.indexOf("haven't actually changed anything")).toBeLessThan(
      flagged.indexOf("I've changed the date"),
    );
  });
});
