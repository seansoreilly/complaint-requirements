/**
 * The words used to ask for each field.
 *
 * Both brains and the route need this text: the mock brain to compose its whole
 * reply, and app/api/chat/route.ts to finish a live reply that drifted away
 * without asking for anything. Keeping one copy is what stops the offline script
 * and the real conversation from asking differently worded questions.
 */
import { type ComplaintState, SERVICE_ISSUES, SERVICE_SUBTYPES } from "./schema";
import { type MissingField, groupedWithNext } from "./next";

/** How to ask for one field. Falls back to the schema label. */
export function questionFor(path: string, label: string, state: ComplaintState): string {
  switch (path) {
    case "firm.name":
      return `Which financial firm is your complaint about? A name, ABN or ACN all work.`;
    case "firm.reference":
      return `Do you have an account, policy or reference number for this? If you don't have one to hand, just say so — it's not required.`;
    case "open_afca_complaint":
      return `Do you already have a complaint open with AFCA?`;
    case "complainant.lodging_for":
      return `Is this complaint for yourself, or are you lodging it for someone else?`;
    case "consents.authority":
      return `Before we go further, I need two quick confirmations: that AFCA can act on your complaint, and that you accept the engagement charter. Happy to tick both?`;
    case "service.type":
      return `What kind of financial service is this about — superannuation, credit, insurance, banking?`;
    case "service.subtype": {
      const options = SERVICE_SUBTYPES[state.service.type];
      if (options) return `Which of these fits best? ${options.join(", ")}.`;
      return `What product or service specifically?`;
    }
    case "complaint.issues": {
      const options = SERVICE_ISSUES[state.service.type];
      if (options) return `What went wrong? For example: ${options.slice(0, 4).join(", ")}.`;
      return `In a few words, what went wrong?`;
    }
    case "complaint.narrative":
      return `Tell me what happened, in your own words — as much or as little as you like. I'll write it up for you afterwards.`;
    case "complained_to_firm.yes":
      return `Have you complained to the firm directly yet?`;
    case "complained_to_firm.date":
      return `Roughly when did you contact them? An approximate date is fine.`;
    case "complained_to_firm.how":
      return `How did you get in touch — phone, email, letter, their website?`;
    case "complained_to_firm.final_reply":
      return `Have they given you a final response to that complaint?`;
    case "legal_proceedings":
      return `Is there any court case or legal action going on about this?`;
    case "outcome.seeking_compensation":
      return `Are you looking for compensation — money back for a loss? Yes, no, or not sure are all fine answers.`;
    case "outcome.fair_outcome":
      return `What would actually put this right for you? Even roughly — I'll help turn it into something concrete.`;
    case "complainant.dob":
      return `What's your date of birth? AFCA uses it to confirm your identity.`;
    case "complainant.notify_by":
      return `How would you prefer AFCA to contact you — email, post or SMS?`;
    default:
      return `Could you tell me your ${label.toLowerCase()}?`;
  }
}

/** A draft waiting on a yes or a change, if there is one. */
export function pendingDraft(state: ComplaintState): "narrative" | "fair_outcome" | null {
  if (state.drafts.fair_outcome.trim().length > 0) return "fair_outcome";
  if (state.drafts.narrative.trim().length > 0) return "narrative";
  return null;
}

/** Asking for a draft to be approved takes priority over asking for a field. */
export function approvalRequestFor(draft: "narrative" | "fair_outcome"): string {
  return draft === "narrative"
    ? `Does that write-up read right? Approve it as it is, or tell me what to change.`
    : `Does that capture what you're after? Approve it, or tell me what to change.`;
}

/**
 * The prompt the conversation should end on while anything is outstanding: an
 * approval request if a draft is waiting, otherwise the next missing field.
 * Null means nothing is left to ask.
 */
export function outstandingPrompt(state: ComplaintState): string | null {
  const draft = pendingDraft(state);
  if (draft) return approvalRequestFor(draft);
  const grouped: MissingField[] = groupedWithNext(state);
  if (grouped.length === 0) return null;
  if (grouped.length > 1) {
    return `Could you give me your ${grouped.map((m) => m.label.toLowerCase()).join(", ")}?`;
  }
  return questionFor(grouped[0].path, grouped[0].label, state);
}

/**
 * The turn that finishes the form.
 *
 * Everything required is in, so `outstandingPrompt` returns null and the
 * conversation would otherwise stop on whatever the model happened to say
 * last. The tester's demo ended exactly there — one message after contact
 * details, before the optional questions, with no handoff to the review.
 *
 * The evidence question is the right one to ask here, and only here. AFCA
 * wants to know what someone can produce, so asking teaches the person
 * something true about a real complaint even in a demo. It also fills the
 * attachments step, which nothing else asks for: `attachments` is optional, so
 * it never enters `missingFor` and no question is ever generated for it. And
 * it is phrased to accept an answer in words — "just tell me what you have" —
 * because this demo uploads nothing, and a note saying the person has app
 * screenshots showing the balance is the useful half of an attachment anyway.
 */
export function completionHandoff(): string {
  return (
    "That's everything AFCA requires. One last thing worth having: do you have " +
    "bank statements, letters or screenshots showing what happened? Tell me what " +
    "you've got and I'll note it — or open Review to see the whole complaint."
  );
}

/**
 * Has the form reached the point where the handoff belongs?
 *
 * Once, at the hinge: nothing required outstanding, no draft waiting, and
 * nothing said about evidence yet. Repeated under every later turn it stops
 * being the opening of the last step and becomes the thing that ends the demo.
 */
export function needsCompletionHandoff(state: ComplaintState): boolean {
  if (pendingDraft(state)) return false;
  if (state.attachments.length > 0) return false;
  return groupedWithNext(state).length === 0;
}

/**
 * Does this reply actually ask for anything?
 *
 * A reply that trails off without a question is where the conversation stalls:
 * the person has nothing to answer, so they stop. Only the closing stretch is
 * checked — a question mark in the middle of a recap is not an invitation to
 * reply, and a trailing "(3 things left after this.)" must not hide one.
 */
export function endsWithQuestion(reply: string): boolean {
  const trimmed = reply.trim();
  if (trimmed.length === 0) return false;
  const paragraphs = trimmed.split(/\n\s*\n/);
  const tail = paragraphs.slice(-2).join("\n");
  if (tail.includes("?")) return true;
  // An imperative is an ask too. "Just paste it in and I'll record it" invites a
  // reply as plainly as a question mark does, and treating it as silence made
  // the route stack its own wording of the same request underneath — the person
  // was asked for one thing twice in a single turn.
  //
  // Only the last sentence counts. "You said you'd tell me about the fees, and
  // you did" mentions the same words while asking for nothing.
  const sentences = tail.split(/(?<=[.!])\s+/);
  const last = sentences[sentences.length - 1] ?? "";
  return IMPERATIVE_ASK.test(last);
}

/**
 * Closing imperatives that invite an answer. Deliberately narrow: these are
 * phrasings that hand the turn back, not any sentence containing "tell".
 *
 * This list is the weaker half of the pair. It matches how a sentence is
 * phrased, and there is always another phrasing — three real replies stacked a
 * second ask underneath them before anyone noticed. `alreadyAsks` in
 * continue.ts is the stronger half: it asks whether the FIELD has already been
 * put to the person, which does not depend on wording. Entries here are added
 * from replies that actually occurred, never from imagination.
 */
const IMPERATIVE_ASK =
  /\b(tell me|let me know|paste it|pop it in|type it|send it through|give me|say the word|go ahead and|just say so|say so and|tell me what you do know)\b/i;
