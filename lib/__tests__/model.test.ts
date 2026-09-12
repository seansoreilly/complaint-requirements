import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/chat/route";
import { applyPatch } from "../patch";
import { buildSystemPrompt } from "../prompt";
import { nextField } from "../next";
import { emptyState } from "../schema";
import { runTurn } from "../model";

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

describe("live turn parsing", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    create.mockReset();
  });

  it("preserves a valid reply and reports a null pronoun patch issue", async () => {
    const reply = "We can skip those. Shall we review your form?";
    toolResponse({ reply, patch: { complainant: { pronoun: null } } });
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ state: emptyState(), message: "I'll skip those." }),
    }));
    const body = await response.json();
    expect(body.reply).toBe(reply);
    expect(body.issues).not.toEqual([]);
    expect(body.state.complainant.pronoun).toBe("");
  });

  it("does not re-ask a declined field when the patch fails", async () => {
    const reply = "We can leave your date of birth for now. How would you like to be contacted?";
    toolResponse({ reply, patch: { complainant: { dob: null } } });
    const state = completeState();
    state.complainant.dob = "";
    expect(nextField(state)?.path).toBe("complainant.dob");
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ state, message: "I'd rather not say right now." }),
    }));
    const body = await response.json();
    expect(body.reply).toBe(reply);
    expect(body.reply).not.toContain("What's your date of birth?");
  });

  it("remembers a sensitive-question decline with all four answers empty across turns", async () => {
    const state = completeState();
    expect(buildSystemPrompt({ state, firm: null })).toContain("have not yet offered");
    toolResponse({ reply: "We can skip those.", patch: { sensitive_offered: true } });
    const first = await POST(new Request("http://localhost/api/chat", {
      method: "POST", body: JSON.stringify({ state, message: "I'll skip all four." }),
    }));
    const declined = (await first.json()).state;
    expect(declined.complainant).toEqual(state.complainant);
    expect(buildSystemPrompt({ state: declined, firm: null })).not.toContain("have not yet offered");
    toolResponse({ reply: "Your form is ready for review.", patch: {} });
    const second = await POST(new Request("http://localhost/api/chat", {
      method: "POST", body: JSON.stringify({ state: declined, history: [], message: "Go ahead." }),
    }));
    expect(buildSystemPrompt({ state: (await second.json()).state, firm: null }))
      .not.toContain("have not yet offered");
    expect(create.mock.calls.at(-1)?.[0].system).not.toContain("have not yet offered");
  });

  it("instructs the live model not to record a complaint from 'they called me last week' alone", async () => {
    // Assert the actual system prompt sent to the SDK, not mock-brain behaviour.
    toolResponse({ reply: "Have you complained to them yourself?", patch: {} });
    await runTurn({ state: emptyState(), firm: null, history: [], message: "They called me last week." });
    const request = create.mock.calls.at(-1)?.[0];
    expect(request.messages).toEqual([{ role: "user", content: "They called me last week." }]);
    const system = request.system.replace(/\s+/g, " ");
    expect(system).toContain(
      "complained_to_firm.yes is true only when the person themselves made a complaint to the firm",
    );
    expect(system).toContain('"They called me last week" is the firm acting');
    expect(system).toContain("Leave yes out of the patch until you know");
  });

  /**
   * The other half of the same mistake, and the one a live run actually made:
   * "I've rung them four times and nobody gives me a straight answer" is chasing
   * a stuck matter, not lodging a complaint. Recorded as yes it puts a complaint
   * they never made onto a document they sign.
   */
  it("instructs the live model that chasing progress is not a complaint", async () => {
    toolResponse({ reply: "Were those calls a complaint, or chasing it up?", patch: {} });
    await runTurn({
      state: emptyState(),
      firm: null,
      history: [],
      message: "I've rung them four times and nobody gives me a straight answer.",
    });
    const system = create.mock.calls.at(-1)?.[0].system.replace(/\s+/g, " ");
    expect(system).toContain("Chasing progress");
    expect(system).toContain("not lodging a complaint");
    expect(system).toContain("When it is unclear which you are hearing, ASK");
  });

  it("offers review and export when a completed form has no usable tool reply", async () => {
    create.mockResolvedValue({ content: [], stop_reason: "max_tokens" });
    const turn = await runTurn({ state: completeState(), firm: null, history: [], message: "Go ahead." });
    expect(turn.reply).toContain("review");
    expect(turn.reply).toContain("export");
    expect(turn.patch).toEqual({});
    expect(console.error).toHaveBeenCalledWith("[turn-parse-failed]", expect.stringContaining('"stop_reason":"max_tokens"'));
  });

  it("keeps a valid patch even when the reply is malformed", async () => {
    toolResponse({ reply: null, patch: { legal_proceedings: false } });
    const turn = await runTurn({ state: emptyState(), firm: null, history: [], message: "No" });
    expect(turn.patch.legal_proceedings).toBe(false);
  });
});

function completeState(): ReturnType<typeof emptyState> {
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
