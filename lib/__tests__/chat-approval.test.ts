/**
 * Approving a draft by saying so, rather than by clicking the card.
 *
 * "Use this" clears `drafts.narrative` itself, in app/page.tsx, so the card
 * comes down and the conversation moves on. Typing "yes, use it" into the chat
 * is the same intent down a different path: the model writes
 * `complaint.narrative`, `holdDrafts` lets it stand because there was a draft
 * to approve — and nothing clears the draft unless the model remembers to
 * include it in the same patch.
 *
 * Before the approval gate that was untidy: the card lingered until the model
 * happened to clear it. With the gate it is a trap. A pending draft makes the
 * turn close on the approval request, so a draft that never clears asks for
 * approval of something already approved, every turn, forever — and the person
 * cannot get past it by answering, because answering is not what it wants.
 *
 * So the transition is done in code: a write that stands as an approval takes
 * the draft down with it. The same shape as every other rule here — the model
 * is asked, and the route guarantees.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/chat/route";
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

function withPendingNarrative(): ReturnType<typeof emptyState> {
  const state = emptyState();
  state.firm.name = "AustralianSuper";
  state.firm.afca_member_no = "10657";
  state.firm.reference = "CPX-4471";
  state.service.type = "Superannuation";
  state.service.subtype = "Insurance in superannuation (TPD)";
  state.complaint.issues = ["Cancellation without notice"];
  state.drafts.narrative = "On 2 September 2026 I emailed AustralianSuper about my cancelled cover.";
  return state;
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  create.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("approving in chat rather than on the card", () => {
  it("takes the card down when the write stands", async () => {
    const state = withPendingNarrative();
    // The approval the model is most likely to send: the text onto the form,
    // and no mention of the draft it came from.
    toolResponse({
      reply: "Done.",
      patch: { complaint: { narrative: state.drafts.narrative } },
    });
    const data = await turn(state, "yes, use it");

    expect(data.state.complaint.narrative).toBe(
      "On 2 September 2026 I emailed AustralianSuper about my cancelled cover.",
    );
    expect(data.state.drafts.narrative).toBe("");
  });

  /**
   * The trap the gate would otherwise set. With the draft still up, every
   * following turn closes on "approve it, or tell me what to change" — about
   * something already approved — and no answer can move it along.
   */
  it("moves on to the next question instead of asking for approval again", async () => {
    const state = withPendingNarrative();
    toolResponse({
      reply: "Done.",
      patch: { complaint: { narrative: state.drafts.narrative } },
    });
    const data = await turn(state, "yes, use it");

    expect(data.reply).not.toContain("Approve it as it is");
  });

  it("does the same for the outcome draft", async () => {
    const state = withPendingNarrative();
    state.drafts.narrative = "";
    state.drafts.fair_outcome = "Reinstate the cover and pay the claim.";
    toolResponse({
      reply: "Noted.",
      patch: { outcome: { fair_outcome: "Reinstate the cover and pay the claim." } },
    });
    const data = await turn(state, "that's right");

    expect(data.state.outcome.fair_outcome).toBe("Reinstate the cover and pay the claim.");
    expect(data.state.drafts.fair_outcome).toBe("");
  });

  /**
   * The hold itself must survive. A first proposal — no draft pending, field
   * empty — is still diverted onto the card rather than written, which is the
   * README's second constraint and the reason `holdDrafts` exists.
   */
  it("still holds a first proposal rather than writing it", async () => {
    const state = emptyState();
    state.firm.name = "AustralianSuper";
    state.firm.afca_member_no = "10657";
    toolResponse({
      reply: "Here is how I would put it.",
      patch: { complaint: { narrative: "On 2 September I emailed them about the cancelled cover." } },
    });
    const data = await turn(state, "write it up for me");

    expect(data.state.complaint.narrative).toBe("");
    expect(data.state.drafts.narrative).toContain("On 2 September");
  });
});
