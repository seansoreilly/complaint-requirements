/**
 * Identifying what is currently shown above the form.
 *
 * The form panel has one scroll container, and the review panel and draft cards
 * mount at the top of it. The container keeps whatever offset the person had
 * scrolled to, so a panel appearing while they are several stages down the form
 * lands above the viewport — on production, the review panel mounted roughly
 * 3,400px up, so clicking "Review" changed nothing on screen and read as a dead
 * button.
 *
 * Scrolling needs a value that changes exactly when the set of panels changes:
 * not on every re-render, or the form would jump while someone types into one.
 * React renders a hidden panel as `false` rather than as nothing, so the falsy
 * slots are what distinguish "nothing is up there" from "something is".
 */
import type { ReactNode } from "react";

function keyOf(child: unknown, index: number): string | null {
  if (!child) return null;
  if (typeof child === "object" && "key" in child) {
    const { key } = child as { key: unknown };
    if (typeof key === "string" && key.length > 0) return key;
  }
  return `slot-${index}`;
}

/**
 * A stable identifier for whatever is on show above the form, or null when
 * nothing is. Equal across re-renders of the same panels; different as soon as
 * one appears or disappears.
 */
export function revealKey(children: ReactNode): string | null {
  const list = Array.isArray(children) ? children : [children];
  const keys = list.map(keyOf).filter((key): key is string => key !== null);
  return keys.length === 0 ? null : keys.join("|");
}
