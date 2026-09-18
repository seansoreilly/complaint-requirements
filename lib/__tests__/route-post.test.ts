/**
 * The route handler itself, not a copy of its helpers.
 *
 * The previous input tests re-implemented sanitiseState in the test file, so a
 * crash in POST's own argument handling — `.trim()` on a non-string message —
 * passed every one of them. These call the exported handler.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../model", () => ({
  brainMode: () => "mock",
  runTurn: vi.fn(async () => ({
    reply: "Thanks — what happened?",
    patch: {},
    mode: "mock" as const,
  })),
}));

import { POST } from "@/app/api/chat/route";
import { runTurn } from "../model";

function post(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat request envelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // JSON.stringify drops an undefined value, so that case arrives as a missing
  // message rather than a wrongly-typed one; it is covered by the absent-key
  // test below instead.
  it.each([42, true, {}, [], null])(
    "rejects a non-string message (%s) with 400, not a 500",
    async (message) => {
      const response = await POST(post({ message }));
      expect(response.status).toBe(400);
      expect(runTurn).not.toHaveBeenCalled();
    },
  );

  it("rejects a body with no message at all", async () => {
    const response = await POST(post({ state: null }));
    expect(response.status).toBe(400);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("rejects an empty message with 400", async () => {
    const response = await POST(post({ message: "   " }));
    expect(response.status).toBe(400);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("rejects a message longer than the cap", async () => {
    const response = await POST(post({ message: "x".repeat(10_001) }));
    expect(response.status).toBe(400);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("rejects a non-object body", async () => {
    const response = await POST(post("just a string"));
    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect((await POST(request)).status).toBe(400);
  });

  it("ignores a focus path that is not a known field", async () => {
    const response = await POST(post({ message: "hello", focus: "__proto__.polluted" }));
    expect(response.status).toBe(200);
    expect(vi.mocked(runTurn).mock.calls[0][0].focusPath).toBeUndefined();
  });

  it("passes an allowlisted focus path through", async () => {
    const response = await POST(post({ message: "hello", focus: "firm.name" }));
    expect(response.status).toBe(200);
    expect(vi.mocked(runTurn).mock.calls[0][0].focusPath).toBe("firm.name");
  });

  it("caps history rather than forwarding an unbounded list", async () => {
    const history = Array.from({ length: 200 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${i}`,
    }));
    const response = await POST(post({ message: "hello", history }));
    expect(response.status).toBe(200);
    expect(vi.mocked(runTurn).mock.calls[0][0].history.length).toBeLessThanOrEqual(20);
  });

  it("answers a well-formed turn with the authoritative state", async () => {
    const response = await POST(post({ message: "My super fund denied a claim." }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reply).toContain("what happened");
    expect(body.state).toBeDefined();
    expect(body.mode).toBe("mock");
  });
});
