/**
 * One retry when the patch cannot be parsed at all.
 *
 * A shape that arrived five times in ~139 turns, four of them in one afternoon:
 *
 *   { "patch": "\n<parameter name=\"complaint\">{\"narrative\": \"...\"}",
 *     "reply": "Great — that's now saved as your complaint..." }
 *
 * The patch is a leaked tool-call fragment rather than an object, so the whole
 * turn's extraction is discarded. The person sees nothing wrong: the reply is
 * fine and `ensureAsk` carries the conversation on. But the draft, the date or
 * the issues they just gave are gone, and the next thing they notice is a field
 * they answered sitting empty. It cost a Step 0 check the day it was measured.
 *
 * So: one more call, same messages, same prompt. Only for an unparseable patch
 * — a missing `reply` is defect 5's shape, already handled by a fallback, and
 * retrying it would buy latency for nothing.
 *
 * The rate is "higher than before and rising", not a settled number: 5 in 139
 * has a confidence interval roughly 1%-8%. The per-build counter logged
 * alongside is what will settle it, and what makes the prompt-length
 * correlation testable rather than a guess.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyState } from "../schema";
import { runTurn } from "../model";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

function toolCall(input: unknown) {
  return { content: [{ type: "tool_use", name: "turn", input }], stop_reason: "tool_use" };
}

/** The live payload, verbatim in shape. */
const FRAGMENT = {
  patch: '\n<parameter name="complaint">{"narrative": "They cancelled my cover."}',
  reply: "Great — that's now saved as your complaint description.",
};

describe("retrying an unparseable patch", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    create.mockReset();
  });

  const args = () => ({ state: emptyState(), firm: null, history: [], message: "It was cancelled." });

  it("takes the second answer when the first patch is a fragment", async () => {
    create
      .mockResolvedValueOnce(toolCall(FRAGMENT))
      .mockResolvedValueOnce(
        toolCall({ reply: "Noted.", patch: { legal_proceedings: false } }),
      );
    const turn = await runTurn(args());
    expect(create).toHaveBeenCalledTimes(2);
    expect(turn.patch.legal_proceedings).toBe(false);
    expect(turn.reply).toBe("Noted.");
  });

  it("falls back when the retry fails too, keeping a salvaged refusal", async () => {
    create
      .mockResolvedValueOnce(toolCall({ ...FRAGMENT, deferred: ["service.subtype"] }))
      .mockResolvedValueOnce(toolCall({ ...FRAGMENT, deferred: ["service.subtype"] }));
    const turn = await runTurn(args());
    expect(create).toHaveBeenCalledTimes(2);
    expect(turn.patch.deferred).toEqual(["service.subtype"]);
    expect((turn.issues ?? []).length).toBeGreaterThan(0);
  });

  it("does not retry a missing reply — that has its own mitigation", async () => {
    create.mockResolvedValue(toolCall({ patch: { legal_proceedings: false } }));
    const turn = await runTurn(args());
    expect(create).toHaveBeenCalledTimes(1);
    expect(turn.patch.legal_proceedings).toBe(false);
  });

  it("does not retry a turn that parsed cleanly", async () => {
    create.mockResolvedValue(toolCall({ reply: "Noted.", patch: {} }));
    await runTurn(args());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sends the retry with the same messages and prompt", async () => {
    create
      .mockResolvedValueOnce(toolCall(FRAGMENT))
      .mockResolvedValueOnce(toolCall({ reply: "Noted.", patch: {} }));
    await runTurn(args());
    const [first, second] = create.mock.calls.map((c) => c[0]);
    expect(second.system).toBe(first.system);
    expect(second.messages).toEqual(first.messages);
  });
});
