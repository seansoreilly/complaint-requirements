/**
 * A refusal must survive a malformed patch.
 *
 * Observed live, the ninth parse failure of the run and the first of its kind:
 *
 *   {
 *     "patch": "\n<parameter name=\"complaint\">{\"issues\": [...]}",
 *     "deferred": ["service.subtype"],
 *     "reply": "Thanks — that's clear. ..."
 *   }
 *
 * Two things went wrong at once. The patch is a broken string rather than an
 * object — a leaked tool-call fragment — so `parsePatch` rejects it and the
 * whole turn's extraction is dropped. And `deferred` was emitted as a SIBLING
 * of `patch` instead of inside it, where the envelope does not look.
 *
 * The reply is fine and reaches the person. But the refusal it is answering is
 * lost, which puts the field back in `askableFor` — the precondition for defect
 * 24. The person is told "I'll come back to it later" and the form forgets.
 *
 * `deferred` and `declined` are the two fields where losing the value silently
 * contradicts something the assistant just promised, so the envelope now picks
 * them up from the top level when the patch does not carry them. It is a
 * salvage, not a blessing: a valid patch always wins.
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

function needsSubtype(): ReturnType<typeof emptyState> {
  const state = emptyState();
  state.firm.name = "Latitude Financial Services";
  state.firm.no_reference = true;
  state.open_afca_complaint = false;
  state.consents = { authority: true, engagement_charter: true };
  state.service.type = "Credit";
  return state;
}

describe("a refusal emitted outside the patch", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    create.mockReset();
  });

  it("survives a patch that fails to parse", async () => {
    // The exact live shape: broken patch string, deferred alongside it.
    toolResponse({
      patch: '\n<parameter name="complaint">{"issues": ["Default listing on credit file"]}',
      deferred: ["service.subtype"],
      reply: "That's completely fine — I'll come back to it later if it turns up.",
    });
    const body = await turn(needsSubtype(), "I'm not totally sure what to call it.");
    expect(body.state.deferred).toContain("service.subtype");
    expect(body.reply).toContain("I'll come back to it later");
  });

  it("salvages a top-level declined too", async () => {
    toolResponse({
      patch: "not an object either",
      declined: ["service.subtype"],
      reply: "No problem — I won't ask again.",
    });
    const body = await turn(needsSubtype(), "Not sure, sorry.");
    expect(body.state.declined).toContain("service.subtype");
  });

  it("prefers the patch when the patch is valid", async () => {
    // A well-formed patch is the real answer; the top level is only a fallback.
    toolResponse({
      patch: { deferred: ["service.subtype"] },
      deferred: ["complainant.dob"],
      reply: "Noted.",
    });
    const body = await turn(needsSubtype(), "I'm not sure.");
    expect(body.state.deferred).toEqual(["service.subtype"]);
  });

  it("still drops an invented path", async () => {
    toolResponse({
      patch: "broken",
      deferred: ["service.subtype", "not.a.field"],
      reply: "Noted.",
    });
    const body = await turn(needsSubtype(), "I'm not sure.");
    expect(body.state.deferred).toEqual(["service.subtype"]);
  });

  it("ignores a top-level value that is not a list of strings", async () => {
    toolResponse({ patch: "broken", deferred: "service.subtype", reply: "Noted." });
    const body = await turn(needsSubtype(), "I'm not sure.");
    expect(body.state.deferred).toEqual([]);
  });
});
