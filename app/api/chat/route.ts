/**
 * One conversational turn.
 *
 * The browser sends the full state every turn; the route validates the model's
 * patch, resolves the firm against the directory in code, applies the patch and
 * returns the authoritative next state. The model never owns the state.
 */
import { NextResponse } from "next/server";
import { type ComplaintState, emptyState } from "@/lib/schema";
import { applyPatch, parsePatch } from "@/lib/patch";
import { type Firm, lookupFirm } from "@/lib/directory";
import { missingFor, nextField, stageProgress } from "@/lib/next";
import { type ChatTurn, brainMode, runTurn } from "@/lib/model";

export const dynamic = "force-dynamic";

interface ChatRequest {
  state?: ComplaintState;
  history?: ChatTurn[];
  message?: string;
  focus?: string;
}

/**
 * Resolve firm.name against the directory and write back the member number.
 * Doing this in code — not the model — is what makes invented firm details
 * impossible rather than merely discouraged.
 */
function resolveFirm(state: ComplaintState): {
  state: ComplaintState;
  firm: Firm | null;
  note: string | null;
} {
  const name = state.firm.name.trim();
  if (name.length === 0) return { state, firm: null, note: null };

  const result = lookupFirm(name);
  if (result.status === "matched") {
    const next = structuredClone(state);
    next.firm.name = result.firm.name;
    next.firm.afca_member_no = result.firm.afca_member_no;
    return { state: next, firm: result.firm, note: null };
  }
  if (result.status === "ambiguous") {
    const cleared = structuredClone(state);
    cleared.firm.afca_member_no = "";
    const names = result.candidates.map((c) => c.firm.name);
    return {
      state: cleared,
      firm: null,
      note: `Several firms match "${name}": ${names.join(", ")}. Which one is it?`,
    };
  }
  const unmatched = structuredClone(state);
  unmatched.firm.afca_member_no = "";
  return {
    state: unmatched,
    firm: null,
    note: `"${name}" isn't in this demo's firm directory, so there's no member number to attach. The rest of the form still works.`,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (message.length === 0) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const incoming = body.state ?? emptyState();
  const history = (body.history ?? []).slice(-20);

  // Resolve the firm from whatever state we were handed, so the prompt carries
  // real directory facts before the model speaks.
  const resolvedBefore = resolveFirm(incoming);

  let turn;
  try {
    turn = await runTurn({
      state: resolvedBefore.state,
      firm: resolvedBefore.firm,
      history,
      message,
      focusPath: body.focus,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `The assistant is unavailable: ${detail}` },
      { status: 502 },
    );
  }

  const { patch, issues } = parsePatch(turn.patch);
  // The member number is the directory's to assign, never the model's.
  if (patch.firm) delete patch.firm.afca_member_no;
  const applied = applyPatch(resolvedBefore.state, patch);

  // The firm may have only just been named, so resolve again after applying.
  const resolvedAfter = resolveFirm(applied);
  const state = resolvedAfter.state;

  const note = resolvedAfter.note;
  return NextResponse.json({
    reply: note ? `${turn.reply}\n\n${note}` : turn.reply,
    state,
    missing: missingFor(state),
    next: nextField(state),
    stages: stageProgress(state),
    issues,
    firmNote: resolvedAfter.note,
    mode: turn.mode,
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ mode: brainMode() });
}
