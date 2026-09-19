/**
 * Bringing a panel shown above the form into view.
 *
 * The review panel and the draft cards mount at the top of the form panel's one
 * scroll container, which keeps whatever offset the person had scrolled to. On
 * production, clicking "Review" several stages down the form mounted the panel
 * roughly 3,400px above the viewport: nothing visibly changed and the button
 * looked broken. `revealKey` is what tells the effect something new is up
 * there — and, just as importantly, when nothing is.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { revealKey } from "../reveal";

/** A stand-in for a panel React renders above the form. */
function panel(key: string) {
  return createElement("div", { key });
}

describe("revealKey", () => {
  it("is null when nothing is shown above the form", () => {
    // No scroll should happen while the person is just filling the form in.
    expect(revealKey(null)).toBeNull();
    expect(revealKey(undefined)).toBeNull();
    expect(revealKey(false)).toBeNull();
    expect(revealKey([])).toBeNull();
  });

  it("ignores the falsy slots React leaves behind for hidden panels", () => {
    // `{showReview && <ReviewPanel/>}` renders `false`, not nothing.
    expect(revealKey([false, false, null])).toBeNull();
  });

  it("is non-null once something is actually shown", () => {
    expect(revealKey([false, panel("draft")])).not.toBeNull();
  });

  it("changes when a different panel appears, so the effect runs again", () => {
    const review = revealKey([panel("review"), false]);
    const draft = revealKey([false, panel("draft")]);

    expect(review).not.toBeNull();
    expect(draft).not.toBeNull();
    expect(review).not.toBe(draft);
  });

  it("is stable while the same panel stays open", () => {
    // Re-renders on every keystroke; the form must not scroll out from under
    // someone typing into the panel.
    expect(revealKey([panel("review"), false])).toBe(revealKey([panel("review"), false]));
  });

  it("changes when a second panel joins the first", () => {
    const one = revealKey([panel("review"), false]);
    const two = revealKey([panel("review"), panel("draft")]);

    expect(one).not.toBe(two);
  });
});
