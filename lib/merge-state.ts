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
 * *and* the server also wrote a different value to X this turn, the person's
 * value wins.
 *
 * This reverses the rule this module originally shipped with, which preferred
 * the server on the grounds that a chat message is more deliberate than a form
 * field mid-edit. In practice the edit is simply later: the person typed it
 * after sending the message, often *because* they saw the reply going wrong.
 * Having the reply then overwrite it reads as the form fighting back.
 *
 * Merging leaf by leaf is not enough on its own. Fields constrain each other —
 * complaint.issues is drawn from a list belonging to service.type — so a server
 * write to one leaf can contradict a person's edit to another and produce a
 * state neither of them asked for: "Credit" beside "Denial of insurance claim".
 * The merged state therefore goes through `reconcile` before it is returned,
 * and firm.afca_member_no is re-derived from whichever name won.
 */
import { reconcile } from "./patch";
import { memberNumberFor } from "./directory";
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
  taken: Set<string>,
  prefix = "",
): void {
  for (const [key, serverValue] of Object.entries(server)) {
    if (!(key in current)) continue; // never let a server response invent fields
    const currentValue = current[key];
    const snapshotValue = snapshot[key];
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (isPlainObject(serverValue) && isPlainObject(currentValue) && isPlainObject(snapshotValue)) {
      overlay(currentValue, snapshotValue, serverValue, taken, path);
    } else if (serverChanged(snapshotValue, serverValue)) {
      // The person edited this same leaf while the reply was in flight, so
      // their edit is the later statement of intent and stands.
      if (serverChanged(snapshotValue, currentValue)) continue;
      current[key] = serverValue;
      taken.add(path);
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
  const taken = new Set<string>();
  overlay(
    next as unknown as Record<string, unknown>,
    snapshot as unknown as Record<string, unknown>,
    server as unknown as Record<string, unknown>,
    taken,
  );

  // The server's subtype and issues are only meaningful for the service type
  // the server was reasoning about. If the person's type won the conflict,
  // those writes describe a type that is no longer selected, and reconcile
  // cannot see it: measured from the snapshot the person's type may be the
  // only change, and the server's issue write is in `taken`, so protecting it
  // would preserve exactly the stale value. This is the "Credit" beside
  // "Denial of insurance claim" case.
  if (next.service.type !== server.service.type) {
    if (taken.has("service.subtype")) next.service.subtype = "";
    if (taken.has("complaint.issues")) next.complaint.issues = [];
  }

  // A merge of two individually-valid states can still be invalid: the person
  // switching service.type while the server writes an issue from the old type's
  // list leaves the two contradicting each other.
  //
  // Reconcile against the *snapshot*, not against `previous`. Both sides
  // diverged from the snapshot, so it is the only baseline that sees either
  // change as a transition — measured against `previous` the person's own edit
  // has already happened and looks like no change at all.
  const reconciled = reconcile(snapshot, next, (path) => taken.has(path));

  // The member number belongs to whichever name survived the merge, not to the
  // one the server happened to be looking at.
  reconciled.firm.afca_member_no = memberNumberFor(reconciled.firm.name);

  return reconciled;
}
