/**
 * Model call. One place decides between a live Claude call and the offline
 * mock brain, so every other module is indifferent to which is in play.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { type ComplaintState } from "./schema";
import { type ComplaintPatch, type PatchIssue, parsePatch, patchSchema } from "./patch";
import { type Firm } from "./directory";
import { buildSystemPrompt } from "./prompt";
import { missingFor } from "./next";
import { mockBrain } from "./mock-brain";

/** Opus 5 by default; COMPLAINT_MODEL overrides it. */
const MODEL = process.env.COMPLAINT_MODEL ?? "claude-opus-5";

export type BrainMode = "claude" | "mock";

export function brainMode(): BrainMode {
  return process.env.ANTHROPIC_API_KEY ? "claude" : "mock";
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TurnResult {
  reply: string;
  patch: ComplaintPatch;
  mode: BrainMode;
  issues?: PatchIssue[];
}

/**
 * The model returns a reply and a patch; `stage_complete` is computed in code.
 *
 * Both fields are described, not just typed. Undescribed, `reply` was omitted
 * outright on roughly one turn in fifty — the tool call carried a patch and no
 * reply at all — and the person saw "Sorry — I didn't catch that" for a message
 * the model had understood well enough to extract fields from.
 */
const turnSchema = z.object({
  reply: z
    .string()
    .describe(
      "What you say to the person this turn, in plain English. Always required, " +
        "even when the patch is empty and even when you are only acknowledging " +
        "something. Never omit this field.",
    ),
  patch: patchSchema.describe(
    "Only the form fields this message gave you. Omit anything you do not know. " +
      "This is also where `deferred` and `declined` go when someone refuses a " +
      "field — inside this object, not beside it. A refusal recorded outside " +
      "the patch is lost, and the person is left with a promise the form does " +
      "not keep.",
  ),
});

/**
 * The turn comes back as a forced tool call, not `output_config.format`.
 * Structured output compiles the schema into a grammar, and the API caps that
 * at 24 optional parameters — the patch is a deep-partial mirror of the whole
 * form, so it has 49 and is rejected outright. A tool schema has no such cap,
 * and reply and patch are validated independently on return.
 */
const turnTool: Anthropic.Tool = {
  name: "turn",
  description: "Reply to the person and patch the complaint form.",
  input_schema: toolInputSchema(),
};

function toolInputSchema(): Anthropic.Tool["input_schema"] {
  const schema = z.toJSONSchema(turnSchema, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema as Anthropic.Tool["input_schema"];
}

/**
 * Rescue a refusal the model put outside the patch.
 *
 * Seen live, in a turn whose patch was a leaked tool-call fragment rather than
 * an object:
 *
 *   { "patch": "\n<parameter name=\"complaint\">{...}",
 *     "deferred": ["service.subtype"],
 *     "reply": "That's completely fine — I'll come back to it later..." }
 *
 * `parsePatch` rejected the patch, so the whole turn's extraction went, and
 * `deferred` sat where the envelope was not looking. The reply still reached
 * the person: they were told the field would wait, and the form forgot. That is
 * exactly the state defect 24 needed — the field back in `askableFor` with a
 * promise made about it.
 *
 * `deferred` and `declined` get this treatment and nothing else does, because
 * they are the two fields where losing the value silently contradicts something
 * the assistant just said. A valid patch always wins; this only fills a gap.
 */
/**
 * Per-build counters, so the fragment rate is a measurement rather than an
 * impression. Logged every 25 turns; reset when the server restarts, which is
 * what makes them per-build.
 */
let turnsSeen = 0;
let fragmentFailures = 0;
let retriesRecovered = 0;

/** The tool call's input, whatever shape it arrived in. */
function toolInput(response: Anthropic.Message): unknown {
  const call = response.content.find((block) => block.type === "tool_use");
  return call && "input" in call ? call.input : undefined;
}

/**
 * Did the patch fail to parse at all — as opposed to parsing with issues?
 *
 * A patch that is simply absent is fine: plenty of turns extract nothing. This
 * is about a patch that is PRESENT and unusable, which is the fragment shape.
 */
function unparseablePatch(response: Anthropic.Message): boolean {
  const input = toolInput(response);
  if (typeof input !== "object" || input === null) return false;
  const patch = (input as { patch?: unknown }).patch;
  if (patch === undefined) return false;
  return typeof patch !== "object" || patch === null;
}

function salvageRefusals(
  patch: ComplaintPatch,
  envelope: { deferred?: unknown; declined?: unknown } | undefined,
): ComplaintPatch {
  if (!envelope) return patch;
  const list = z.array(z.string());
  const rescued = { ...patch };
  if (rescued.deferred === undefined) {
    const stray = list.safeParse(envelope.deferred);
    if (stray.success) rescued.deferred = stray.data;
  }
  if (rescued.declined === undefined) {
    const stray = list.safeParse(envelope.declined);
    if (stray.success) rescued.declined = stray.data;
  }
  return rescued;
}

export async function runTurn(args: {
  state: ComplaintState;
  firm: Firm | null;
  history: ChatTurn[];
  message: string;
  focusPath?: string;
}): Promise<TurnResult> {
  const { state, firm, history, message, focusPath } = args;

  if (brainMode() === "mock") {
    const { reply, patch } = mockBrain(state, message, focusPath, history);
    return { reply, patch, mode: "mock" };
  }

  const client = new Anthropic();
  const request = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" as const },
    system: buildSystemPrompt({ state, firm, focusPath }),
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: message },
    ],
    tools: [turnTool],
    tool_choice: { type: "tool" as const, name: turnTool.name },
  };

  let response = await client.messages.create(request);

  // One retry, and only when the patch cannot be parsed AT ALL.
  //
  // A shape that arrived five times in ~139 turns, four of them in one
  // afternoon: `patch` comes back as a leaked tool-call fragment —
  // "\n<parameter name=\"complaint\">{...}" — rather than an object, so the
  // whole turn's extraction is discarded. The person sees nothing wrong; the
  // reply is fine and `ensureAsk` carries on. But the draft or the date they
  // just gave is gone, and what they notice later is a field they answered
  // sitting empty. It cost a Step 0 check the day it was measured.
  //
  // A missing `reply` is NOT retried: that is defect 5's shape, the patch is
  // usually good, and the empty-reply fallback already handles it. Retrying it
  // would buy latency for nothing.
  //
  // The rate is "higher than before and rising today", not a settled figure —
  // 5 in 139 carries an interval of roughly 1% to 8%. The counter logged below
  // is what will settle it, and what makes the prompt-length correlation
  // testable later instead of a guess about which rule to cut.
  if (unparseablePatch(response)) {
    console.info(
      "[turn-patch-retry]",
      JSON.stringify({ attempt: 1, raw: toolInput(response) }),
    );
    fragmentFailures += 1;
    response = await client.messages.create(request);
    if (!unparseablePatch(response)) retriesRecovered += 1;
  }
  turnsSeen += 1;
  if (turnsSeen % 25 === 0) {
    console.info(
      "[turn-counter]",
      JSON.stringify({ turns: turnsSeen, fragmentFailures, retriesRecovered }),
    );
  }

  const call = response.content.find((block) => block.type === "tool_use");
  const envelope = z
    .object({
      reply: z.unknown().optional(),
      patch: z.unknown().optional(),
      // Read from the top level as well, because the model sometimes puts them
      // there. See `salvageRefusals` below.
      deferred: z.unknown().optional(),
      declined: z.unknown().optional(),
    })
    .safeParse(call?.input);
  const reply = z.string().safeParse(envelope.success ? envelope.data.reply : undefined);
  const parsed = parsePatch(envelope.success ? envelope.data.patch : undefined);
  const patch = salvageRefusals(parsed.patch, envelope.success ? envelope.data : undefined);
  const { issues } = parsed;
  if (!reply.success || issues.length > 0) {
    console.error(
      "[turn-parse-failed]",
      JSON.stringify({
        stop_reason: response.stop_reason,
        had_tool_use: Boolean(call),
        issues: [...(reply.error?.issues ?? []), ...issues],
        raw: call?.input,
      }),
    );
  }
  return {
    // A missing reply is the model's slip, not the person's. Apologising for it
    // reads as "you were unclear" when the same turn often extracted fields
    // perfectly well, so say nothing and let ensureAsk supply the outstanding
    // question — the person sees the conversation carry on. Only a finished
    // form needs words of its own, since there is no question left to ask.
    reply: reply.success ? reply.data : missingFor(state).length === 0
      ? "You can review your completed form and export it now."
      : "",
    patch,
    issues,
    mode: "claude",
  };
}
