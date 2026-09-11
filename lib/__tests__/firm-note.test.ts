/**
 * The unmatched-firm note is a fact about the state, not about the turn, so the
 * route recomputes it every time. These cover saying it once rather than
 * appending the same paragraph to every reply in the conversation.
 */
import { describe, expect, it } from "vitest";
import { shouldSayNote } from "../../app/api/chat/route";
import type { ChatTurn } from "../model";

const NOTE =
  `"OReilly financing" isn't in this demo's firm directory, so there's no member number to attach. The rest of the form still works.`;

describe("unmatched-firm note", () => {
  it("says nothing when the firm resolved", () => {
    expect(shouldSayNote(null, [])).toBe(false);
  });

  it("says it the first time, with nothing said yet", () => {
    expect(shouldSayNote(NOTE, [])).toBe(true);
  });

  it("stays quiet once it has already been said", () => {
    const history: ChatTurn[] = [
      { role: "user", content: "OReilly financing" },
      { role: "assistant", content: `Got it.\n\n${NOTE}` },
      { role: "user", content: "no" },
    ];
    expect(shouldSayNote(NOTE, history)).toBe(false);
  });

  it("is not silenced by the person quoting it back", () => {
    const history: ChatTurn[] = [{ role: "user", content: NOTE }];
    expect(shouldSayNote(NOTE, history)).toBe(true);
  });

  it("speaks again when the firm changed to a different unknown name", () => {
    const history: ChatTurn[] = [
      { role: "assistant", content: `Got it.\n\n${NOTE}` },
    ];
    const other =
      `"Bloggs Mutual" isn't in this demo's firm directory, so there's no member number to attach. The rest of the form still works.`;
    expect(shouldSayNote(other, history)).toBe(true);
  });
});
