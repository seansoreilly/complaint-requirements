/**
 * Text reaches the form only through an approval.
 *
 * The README's second constraint: "Drafts are held, not written… Only approval
 * moves text onto the form." The draft card IS that hold — it gives an edit
 * box, a Discard button, and an approval that is an act rather than an
 * inference from the word "yes".
 *
 * On one live run (case 2, Tom Alvarez) the model quoted its proposal in the
 * reply and wrote `complaint.narrative` directly, never populating
 * `drafts.narrative`. `app/page.tsx` renders the card only when the draft field
 * is non-empty, so no card appeared: the tester searched the DOM and found no
 * "Use this" button anywhere. They approved by typing. Nothing was fabricated,
 * but the hold existed only as the model's good manners — the same shape as
 * defects 3, 4, 7, 11 and 14, where a rule sat somewhere the live path could
 * not see it.
 *
 * So the route enforces it. A FIRST write to a draftable field, with no draft
 * pending and the field empty, is treated as a proposal and diverted into the
 * draft. A write is allowed only when there was a draft to approve, or the
 * field already held text and this is an edit.
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

describe("a proposal cannot skip the card", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    create.mockReset();
  });

  const story = "They cancelled my cover without telling me.";

  it("diverts a first narrative write into the draft", () => {
    return (async () => {
      toolResponse({
        reply: "Here's a draft — does that read right?",
        patch: { complaint: { narrative: story } },
      });
      const body = await turn(emptyState(), "They cancelled my cover.");
      expect(body.state.drafts.narrative).toBe(story);
      expect(body.state.complaint.narrative).toBe("");
    })();
  });

  it("diverts a first outcome write into the draft", async () => {
    const want = "Reinstate my cover.";
    toolResponse({
      reply: "Here's the outcome — right?",
      patch: { outcome: { fair_outcome: want } },
    });
    const body = await turn(emptyState(), "I want my cover back.");
    expect(body.state.drafts.fair_outcome).toBe(want);
    expect(body.state.outcome.fair_outcome).toBe("");
  });

  it("lets the write through when a draft was pending — that is the approval", async () => {
    const state = emptyState();
    state.drafts.narrative = story;
    toolResponse({
      reply: "Saved.",
      patch: { complaint: { narrative: story }, drafts: { narrative: "" } },
    });
    const body = await turn(state, "Yes that looks right");
    expect(body.state.complaint.narrative).toBe(story);
    expect(body.state.drafts.narrative).toBe("");
  });

  it("lets the write through when the field already held text — that is an edit", async () => {
    const state = emptyState();
    state.complaint.narrative = "First version.";
    const revised = "Second version, with the date corrected.";
    toolResponse({ reply: "Updated.", patch: { complaint: { narrative: revised } } });
    const body = await turn(state, "Change it to say 3 September.");
    expect(body.state.complaint.narrative).toBe(revised);
    expect(body.state.drafts.narrative).toBe("");
  });

  it("leaves a patch that touches neither field alone", async () => {
    toolResponse({ reply: "Noted.", patch: { legal_proceedings: false } });
    const body = await turn(emptyState(), "No court case.");
    expect(body.state.legal_proceedings).toBe(false);
    expect(body.state.drafts.narrative).toBe("");
    expect(body.state.complaint.narrative).toBe("");
  });
});
