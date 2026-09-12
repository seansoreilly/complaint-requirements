/**
 * The turn schema is sent to the API as a tool schema, not as a structured
 * output format. Structured output compiles the schema into a grammar and
 * rejects more than 24 optional parameters; the patch mirrors the whole form
 * deep-partially, so it is well over that. These tests pin the two properties
 * that keep the live brain working: the patch really is deep-partial, and the
 * shape we send still round-trips through the schema that guards the state.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { patchSchema } from "../patch";

const turnSchema = z.object({
  reply: z.string(),
  patch: patchSchema,
});

/** Counts optional parameters the way the API's grammar compiler does. */
function countOptional(node: unknown): number {
  if (typeof node !== "object" || node === null) return 0;
  const schema = node as Record<string, unknown>;

  let total = 0;
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (properties) {
    const required = new Set((schema.required as string[] | undefined) ?? []);
    for (const name of Object.keys(properties)) {
      if (!required.has(name)) total += 1;
    }
  }

  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) {
      for (const entry of value) total += countOptional(entry);
    } else if (typeof value === "object" && value !== null) {
      total += countOptional(value);
    }
  }
  return total;
}

describe("turn schema", () => {
  it("has more optional parameters than structured output allows", () => {
    // The reason lib/model.ts sends a tool schema instead of output_config.
    // If this ever drops to 24 or below, structured output becomes an option
    // again — but nothing breaks either way, so it is documentation, not a gate.
    const json = z.toJSONSchema(turnSchema, { io: "input" });
    expect(countOptional(json)).toBeGreaterThan(24);
  });

  it("round-trips a tool call the model would send", () => {
    const input = {
      reply: "Which financial firm is your complaint about?",
      patch: { firm: { name: "Example Bank" }, legal_proceedings: false },
    };

    const parsed = turnSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.patch.firm?.name).toBe("Example Bank");
  });

  it("rejects a malformed tool call rather than passing it to the state", () => {
    // model.ts treats a failed parse as a lost turn, never as a patch.
    expect(turnSchema.safeParse({ reply: 42 }).success).toBe(false);
    expect(turnSchema.safeParse(undefined).success).toBe(false);
  });

  it("keeps absent and null distinct, which the patch relies on", () => {
    const absent = turnSchema.safeParse({ reply: "", patch: {} });
    const explicit = turnSchema.safeParse({
      reply: "",
      patch: { legal_proceedings: null },
    });

    expect(absent.success && "legal_proceedings" in absent.data.patch).toBe(false);
    expect(explicit.success && explicit.data.patch.legal_proceedings).toBeNull();
  });
});
