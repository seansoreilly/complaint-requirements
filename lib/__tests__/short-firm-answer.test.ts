/**
 * A short answer to "which firm?" is the firm's name.
 *
 * Case 12, verbatim. The app asked for the fund's full name and ended the turn
 * by offering to defer:
 *
 *   "If you'd rather not chase it down right now, that's OK too — tell me and
 *    I'll come back to it later so we can get on with the rest."
 *
 * Helen answered: "Rest".
 *
 *   "No problem — I'll leave the fund's name aside for now and come back to it
 *    once we've done everything else."
 *
 * `firm.name` stayed "super fund". She had to say "Sorry, the fund's name is
 * Rest" before 11540 appeared — answering the same question twice.
 *
 * It is the app's OWN defer offer that makes the misread available: "rest" is
 * an English word, and the sentence before it invited exactly that reading. I
 * first tried to reproduce this without the offer and could not, three times,
 * and reported it as model variance. With the offer present it reproduces 3/3.
 * The fixture was wrong, not the finding.
 *
 * So the route decides it, not the model: when the firm is unresolved and the
 * person's whole message is a short phrase the directory matches confidently,
 * that is the name. `lookupFirm` is already the authority on firm identity —
 * this just asks it before the model gets a chance to read "Rest" as a verb.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/chat/route";
import { emptyState, type ComplaintState } from "../schema";
import { buildSystemPrompt } from "../prompt";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

/** The model's reply on that turn — it read the answer as a deferral. */
function deferringResponse() {
  create.mockResolvedValue({
    content: [
      {
        type: "tool_use",
        name: "turn",
        input: {
          reply: "No problem — I'll leave the fund's name aside for now.",
          patch: {},
        },
      },
    ],
    stop_reason: "tool_use",
  });
}

function unresolvedFirm(): ComplaintState {
  const state = emptyState();
  state.firm.name = "super fund";
  state.service.type = "Superannuation";
  return state;
}

async function say(state: ComplaintState, message: string) {
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ state, message }),
    }),
  );
  return response.json();
}

describe("a short answer while the firm is unresolved", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    deferringResponse();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    create.mockReset();
  });

  it("takes 'Rest' as the firm, whatever the model does with it", async () => {
    const body = await say(unresolvedFirm(), "Rest");
    expect(body.state.firm.name).toBe("Rest Superannuation");
    expect(body.state.firm.afca_member_no).toBe("11540");
  });

  it("takes the other short names people actually type", async () => {
    for (const [said, expected] of [
      ["NAB", "National Australia Bank"],
      ["commbank", "Commonwealth Bank of Australia"],
      ["Westpac", "Westpac Banking Corporation"],
    ] as const) {
      create.mockClear();
      deferringResponse();
      const body = await say(unresolvedFirm(), said);
      expect(body.state.firm.name, said).toBe(expected);
    }
  });

  it("leaves a refusal alone", async () => {
    const body = await say(unresolvedFirm(), "not sure");
    expect(body.state.firm.name).toBe("super fund");
  });

  it("leaves a sentence alone — this is for bare names only", async () => {
    const body = await say(unresolvedFirm(), "I think it might be one of the big ones");
    expect(body.state.firm.name).toBe("super fund");
  });

  it("does not touch a firm that is already resolved", async () => {
    const state = emptyState();
    state.firm.name = "AustralianSuper";
    state.firm.afca_member_no = "10657";
    const body = await say(state, "Rest");
    expect(body.state.firm.name).toBe("AustralianSuper");
  });

  it("leaves a short phrase the directory cannot place to the model", async () => {
    // The guard only acts on a confident directory match. An unlisted firm is
    // the model's to record as normal — here the mocked patch is empty, so
    // nothing changes, which is the point: the guard did not invent anything.
    const body = await say(unresolvedFirm(), "Bloggs Mutual");
    expect(body.state.firm.afca_member_no).toBe("");
    expect(body.state.firm.name).toBe("super fund");
  });
});

/**
 * The other half: stop making the offer that sets the trap.
 *
 * The guard catches the answer whatever the model does with it. This stops the
 * model inviting the misread in the first place — the firm's name is the one
 * required field that is never deferred, because without it there is no
 * complaint and nothing else on the form means anything.
 */
describe("the firm name is never offered as deferrable", () => {
  it("says so while the firm is unresolved", () => {
    const prompt = buildSystemPrompt({ state: emptyState(), firm: null }).replace(/\s+/g, " ");
    expect(prompt).toContain("never offer to defer");
  });
});
