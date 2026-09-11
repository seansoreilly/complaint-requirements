/**
 * Reconciling a server reply with a form the person kept editing while it was
 * in flight.
 *
 * Each chat turn POSTs a snapshot of the whole state and gets back the whole
 * next state, computed from that snapshot. If the person edits the form
 * while the reply is pending, replacing state wholesale with the server's
 * reply silently discards those edits — the server never saw them, so its
 * response still carries the old values. This is the lost-update bug.
 *
 * The fix: never replace state wholesale. Instead, work out what the server
 * actually changed this turn (the leaves where its reply differs from the
 * snapshot it was computed from) and apply only that delta on top of
 * whatever the state has become since — which may include edits the person
 * made mid-flight.
 *
 * Conflict rule: if the person edited field X while the reply was pending,
 * *and* the server also wrote a different value to X this turn, the
 * server's value wins. The server's write was produced from the person's own
 * chat message — a more deliberate statement of intent than a form field
 * mid-edit — so it takes precedence over an in-flight typing conflict.
 */
import type { ComplaintState } from "./schema";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Content equality for the array-valued leaves (attachments, issues). */
function sameArray(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * True if the server's reply changed this leaf relative to the snapshot it
 * was computed from — i.e. this is a write the server actually made, not
 * just the same value echoed back.
 */
function serverChanged(before: unknown, after: unknown): boolean {
  if (Array.isArray(before) && Array.isArray(after)) return !sameArray(before, after);
  return before !== after;
}

/**
 * Walk `current` (what the form has become since the request was sent),
 * `snapshot` (what was sent), and `server` (what came back), leaf by leaf.
 * A leaf the server changed is taken from the server; everything else is
 * left as `current` already has it, which preserves in-flight edits.
 */
function overlay(
  current: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  server: Record<string, unknown>,
): void {
  for (const [key, serverValue] of Object.entries(server)) {
    if (!(key in current)) continue; // never let a server response invent fields
    const currentValue = current[key];
    const snapshotValue = snapshot[key];
    if (isPlainObject(serverValue) && isPlainObject(currentValue) && isPlainObject(snapshotValue)) {
      overlay(currentValue, snapshotValue, serverValue);
    } else if (serverChanged(snapshotValue, serverValue)) {
      current[key] = serverValue;
    }
    // else: the server echoed back what it was sent — leave current[key],
    // which is whatever the person has typed there since.
  }
}

/**
 * Merge a server reply onto the live state, keeping any edits made while the
 * request was in flight. `previous` is the current (possibly edited) state
 * at the moment the reply lands; `snapshot` is the state that was sent to
 * the server; `server` is the state the server computed from that snapshot.
 */
export function applyServerDelta(
  previous: ComplaintState,
  snapshot: ComplaintState,
  server: ComplaintState,
): ComplaintState {
  const next = structuredClone(previous);
  overlay(
    next as unknown as Record<string, unknown>,
    snapshot as unknown as Record<string, unknown>,
    server as unknown as Record<string, unknown>,
  );
  return next;
}
