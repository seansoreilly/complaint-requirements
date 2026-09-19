/**
 * A draft claimed as saved on a turn that wrote nothing.
 *
 * `holdDrafts` catches the model writing the narrative straight to the form, and
 * `correctSavedClaim` fixes the reply on the turns it diverts. Between them sits
 * the case a production transcript actually hit: the card is already up from an
 * earlier turn, the person says "yes, use it", and the model replies "that's now
 * saved as your complaint description" and moves to the next question — but its
 * patch writes nothing. Nothing was diverted, so nothing was corrected, and the
 * reply asserts a state the app is not in: the card is still sitting there
 * unapproved and the form still shows the field as missing.
 *
 * Someone told their complaint is written stops looking for the button that
 * would have written it. The guard is the same one `ensureAsk` applies to
 * dead-ends: the reply is held to what the state actually says.
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

const story = "They cancelled my cover without telling me.";

function withPendingNarrative() {
  const state = emptyState();
  state.drafts.narrative = story;
  return state;
}

describe("a reply cannot claim a still-pending draft is saved", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    create.mockReset();
  });

  it("corrects the claim when the patch wrote nothing", async () => {
    // The transcript: card already up, reply says saved, patch is empty.
    toolResponse({
      reply: "Great — that's now saved as your complaint description.",
      patch: {},
    });

    const body = await turn(withPendingNarrative(), "Yes, that looks right, use it.");

    expect(body.state.complaint.narrative).toBe("");
    expect(body.state.drafts.narrative).toBe(story);
    expect(body.reply).toContain("on the card");
  });

  it("leaves a genuine approval alone", async () => {
    // Claims saved AND writes it: the claim is true, so it stands.
    toolResponse({
      reply: "Great — that's now saved as your complaint description.",
      patch: { complaint: { narrative: story }, drafts: { narrative: "" } },
    });

    const body = await turn(withPendingNarrative(), "Yes, use it.");

    expect(body.state.complaint.narrative).toBe(story);
    expect(body.reply).toContain("saved");
  });

  it("leaves a reply that only asks about the draft alone", async () => {
    // No claim of completion, so nothing to correct.
    const reply = "Have a read of that — use it, edit it, or tell me what to change?";
    toolResponse({ reply, patch: {} });

    const body = await turn(withPendingNarrative(), "Show me that again");

    expect(body.reply).toBe(reply);
  });

  it("still ends on a question after the correction", async () => {
    // The dead-end guarantee has to survive the rewrite.
    toolResponse({ reply: "That's now recorded as your complaint.", patch: {} });

    const body = await turn(withPendingNarrative(), "yes");

    expect(body.reply).toContain("?");
  });
});
