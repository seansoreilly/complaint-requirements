/**
 * Model call. One place decides between a live Claude call and the offline
 * mock brain, so every other module is indifferent to which is in play.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: buildSystemPrompt({ state, firm, focusPath }),
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: message },
    ],
    output_config: { format: zodOutputFormat(turnSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
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
