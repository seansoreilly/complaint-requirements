/**
 * Model call. One place decides between a live Claude call and the offline
 * mock brain, so every other module is indifferent to which is in play.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { type ComplaintState } from "./schema";
import { type ComplaintPatch, patchSchema } from "./patch";
import { type Firm } from "./directory";
import { buildSystemPrompt } from "./prompt";
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
}

/** The model returns a reply and a patch; `stage_complete` is computed in code. */
const turnSchema = z.object({
  reply: z.string(),
  patch: patchSchema,
});

/**
 * The turn comes back as a forced tool call, not `output_config.format`.
 * Structured output compiles the schema into a grammar, and the API caps that
 * at 24 optional parameters — the patch is a deep-partial mirror of the whole
 * form, so it has 49 and is rejected outright. A tool schema has no such cap,
 * and `turnSchema` still gates whatever comes back.
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
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: buildSystemPrompt({ state, firm, focusPath }),
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: message },
    ],
    tools: [turnTool],
    tool_choice: { type: "tool", name: turnTool.name },
  });

  const call = response.content.find((block) => block.type === "tool_use");
  const result = turnSchema.safeParse(call?.input);
  const parsed = result.success ? result.data : null;
  if (!parsed) {
    console.error(
      "[turn-parse-failed]",
      JSON.stringify({
        stop_reason: response.stop_reason,
        had_tool_use: Boolean(call),
        issues: result.error?.issues,
        raw: call?.input,
      }),
    );
    return {
      // Deliberately asks nothing: the route appends whatever the form still
      // needs, so a parse failure costs the person a turn, not the thread.
      reply: "Sorry — I didn't catch that.",
      patch: {},
      mode: "claude",
    };
  }
  return { reply: parsed.reply, patch: parsed.patch, mode: "claude" };
}
