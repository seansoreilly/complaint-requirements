import { describe, expect, it } from "vitest";
import { STAGES } from "@/lib/schema";

/**
 * Every field carries its own info tooltip, so a person can always find out
 * what is being asked for without having to ask the assistant.
 */
describe("field help text", () => {
  const fields = STAGES.flatMap((stage) => stage.fields);

  it("covers every field in every stage", () => {
    const missing = fields.filter((field) => !field.help?.trim()).map((field) => field.path);
    expect(missing).toEqual([]);
  });

  it("keeps each tooltip short enough to read in the bubble", () => {
    const tooLong = fields.filter((field) => (field.help?.length ?? 0) > 160).map((field) => field.path);
    expect(tooLong).toEqual([]);
  });
});
