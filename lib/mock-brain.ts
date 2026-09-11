/**
 * Deterministic stand-in for the model, used when no API key is configured.
 *
 * It is a rule-based extractor, not a small language model: it covers the demo
 * script and common phrasings so the UI is fully clickable offline. Real runs
 * should set ANTHROPIC_API_KEY — see lib/model.ts.
 */
import { type ComplaintState, SERVICE_ISSUES, SERVICE_SUBTYPES, findField } from "./schema";
import { type ComplaintPatch } from "./patch";
import { FIRMS, SECTOR_SERVICE_TYPE, lookupFirm } from "./directory";
import { groupedWithNext, missingFor } from "./next";

export interface BrainResult {
  reply: string;
  patch: ComplaintPatch;
}

const NEGATIVE = /\b(no|nope|haven'?t|have not|didn'?t|did not|never|none)\b/i;
const AFFIRMATIVE = /\b(yes|yeah|yep|correct|that'?s right|i did|i have)\b/i;
const UNSURE = /\b(not sure|unsure|don'?t know|dunno|no idea|maybe)\b/i;
const SKIP = /\b(skip|later|rather not|prefer not|come back)\b/i;

const DATE_PATTERN =
  /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{2,4})?|\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/i;

const CHANNELS: [RegExp, string][] = [
  [/\be-?mail(ed)?\b/i, "Email"],
  [/\b(phone|called|rang|calling)\b/i, "Phone"],
  [/\b(letter|post|mail(ed)? a letter|wrote)\b/i, "Letter"],
  [/\b(website|online|web form|portal|chat)\b/i, "Online form"],
  [/\bin branch|in person\b/i, "In person"],
];

function matchFirm(text: string): { name: string; member: string; serviceType: string } | null {
  for (const firm of FIRMS) {
    const names = [firm.name, ...firm.aliases];
    for (const candidate of names) {
      const pattern = new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(text)) {
        return {
          name: firm.name,
          member: firm.afca_member_no,
          serviceType: SECTOR_SERVICE_TYPE[firm.sector],
        };
      }
    }
  }
  return null;
}

function guessServiceType(text: string, firmSector?: string): string {
  // An explicit credit/insurance signal can override the firm's usual sector
  // (a bank can also be the lender), but otherwise the firm is the best clue.
  if (firmSector === "Superannuation") return "Superannuation";
  if (/\b(super|superannuation|tpd|smsf|rollover|trustee)\b/i.test(text)) return "Superannuation";
  if (/\b(loan|credit card|mortgage|home loan|repayment|afterpay|bnpl|buy now|debt)\b/i.test(text))
    return "Credit";
  if (/\b(insurance|policy|claim|premium)\b/i.test(text)) return "General insurance";
  if (/\b(account|deposit|transfer|payment|atm|savings)\b/i.test(text))
    return "Banking deposits and payments";
  return firmSector ?? "";
}

function guessSubtype(type: string, text: string): string {
  const options = SERVICE_SUBTYPES[type];
  if (!options) return "";
  if (type === "Superannuation") {
    if (/\b(tpd|total and permanent)\b/i.test(text)) return "Insurance in superannuation (TPD)";
    if (/\b(income protection)\b/i.test(text))
      return "Insurance in superannuation (income protection)";
    if (/\b(death|beneficiar)\b/i.test(text)) return "Death benefit distribution";
    if (/\b(insurance|cover|cancelled)\b/i.test(text))
      return "Insurance in superannuation (death cover)";
    if (/\b(fee|charge)\b/i.test(text)) return "Fees and charges";
    if (/\b(rollover|transfer)\b/i.test(text)) return "Rollover / transfer delay";
  }
  if (type === "Credit") {
    if (/\b(home loan|mortgage)\b/i.test(text)) return "Home loan";
    if (/\b(credit card)\b/i.test(text)) return "Credit card";
    if (/\b(afterpay|buy now|bnpl)\b/i.test(text)) return "Buy now pay later";
    if (/\b(car|vehicle|lease)\b/i.test(text)) return "Car loan / lease";
    if (/\b(personal loan)\b/i.test(text)) return "Personal loan";
    if (/\b(debt collect)\b/i.test(text)) return "Debt collection";
  }
  return "";
}

function guessIssues(type: string, text: string): string[] {
  const options = SERVICE_ISSUES[type];
  if (!options) return [];
  const issues: string[] = [];
  if (/\b(denied|declined|rejected|knocked back|cancelled|cancelling|stopped|terminated|without warning)\b/i.test(text)) {
    const denial = options.find((o) => /denial|responsible/i.test(o));
    if (denial) issues.push(denial);
  }
  if (/\b(delay|waiting|haven'?t heard|no response|slow)\b/i.test(text)) {
    const delay = options.find((o) => /delay/i.test(o));
    if (delay) issues.push(delay);
  }
  if (/\b(fee|charge|premium|interest)\b/i.test(text)) {
    const fees = options.find((o) => /fee|premium|interest/i.test(o));
    if (fees) issues.push(fees);
  }
  if (/\b(hardship|can'?t afford|struggling|behind on)\b/i.test(text)) {
    const hardship = options.find((o) => /hardship/i.test(o));
    if (hardship) issues.push(hardship);
  }
  return [...new Set(issues)];
}

function draftNarrative(state: ComplaintState, text: string): string {
  const firmName = state.firm.name || "the financial firm";
  const parts: string[] = [];
  parts.push(`My complaint is about ${firmName}.`);
  parts.push(text.trim().replace(/\s+/g, " "));
  if (state.complained_to_firm.yes === true) {
    const when = state.complained_to_firm.date ? ` on ${state.complained_to_firm.date}` : "";
    const how = state.complained_to_firm.how ? ` by ${state.complained_to_firm.how.toLowerCase()}` : "";
    parts.push(`I raised this with ${firmName}${when}${how}.`);
    if (state.complained_to_firm.final_reply === false) {
      parts.push(`I have not received a final response.`);
    }
  }
  return parts.join("\n\n");
}

/** Extract whatever the message supports, then ask for the next missing thing. */
export function mockBrain(
  state: ComplaintState,
  message: string,
  focusPath?: string,
): BrainResult {
  const patch: ComplaintPatch = {};
  const text = message.trim();
  const captured: string[] = [];

  const firm = matchFirm(text);
  if (firm && !state.firm.name) {
    patch.firm = { name: firm.name };
    captured.push(`the firm (${firm.name})`);
  }
  // The sector of a firm named now, or one already on the form.
  const knownFirm = firm ?? (state.firm.name ? matchFirm(state.firm.name) : null);

  if (/\b(no|don'?t have|haven'?t got|without)\b.{0,24}\b(reference|account|policy|member)\s*(number)?\b/i.test(text) ||
      /\b(reference|account|policy|member)\s*(number)?\b.{0,24}\b(no|none|don'?t have)\b/i.test(text)) {
    patch.firm = { ...patch.firm, no_reference: true };
    captured.push("that you have no reference number");
  } else {
    const ref = /\b(?:reference|account|policy|member|claim)\s*(?:number|no\.?|#)?\s*(?:is\s*)?([A-Z0-9][A-Z0-9-]{3,})\b/i.exec(text);
    if (ref && !state.firm.reference) {
      patch.firm = { ...patch.firm, reference: ref[1] };
      captured.push(`the reference number (${ref[1]})`);
    }
  }

  // Did they complain to the firm, and how?
  if (state.complained_to_firm.yes === null) {
    const contactVerb = /\b(complained|emailed|called|rang|wrote|lodged|raised|contacted)\b/i;
    // "No, I haven't complained yet" names the verb but denies it; a negation
    // anywhere before the verb flips the meaning.
    const negated = /\b(no|not|never|haven'?t|have not|hadn'?t|didn'?t|did not|yet to)\b[^.!?]{0,40}?\b(complain|contact|email|call|rang|wrote|lodge|raise)/i.test(text);
    if (negated) {
      patch.complained_to_firm = { yes: false };
      captured.push("that you have not contacted the firm yet");
    } else if (contactVerb.test(text)) {
      patch.complained_to_firm = { yes: true };
      captured.push("that you already contacted the firm");
    } else if (NEGATIVE.test(text) && /\b(complain|contact|raise)/i.test(text)) {
      patch.complained_to_firm = { yes: false };
      captured.push("that you have not contacted the firm yet");
    }
  }

  const answerTarget = focusPath ?? groupedWithNext(state)[0]?.path;

  const date = DATE_PATTERN.exec(text);
  if (
    date &&
    answerTarget !== "complainant.dob" &&
    !state.complained_to_firm.date &&
    state.complained_to_firm.yes !== false
  ) {
    patch.complained_to_firm = { ...patch.complained_to_firm, date: date[1] };
    captured.push(`the date (${date[1]})`);
  }

  if (!state.complained_to_firm.how) {
    for (const [pattern, channel] of CHANNELS) {
      if (pattern.test(text)) {
        patch.complained_to_firm = { ...patch.complained_to_firm, how: channel };
        captured.push(`how you contacted them (${channel.toLowerCase()})`);
        break;
      }
    }
  }

  if (state.complained_to_firm.final_reply === null &&
      /\b(haven'?t replied|no reply|no response|still waiting|heard nothing|never got back)\b/i.test(text)) {
    patch.complained_to_firm = { ...patch.complained_to_firm, final_reply: false };
    captured.push("that they have not given a final response");
  }

  if (!state.service.type) {
    const type = guessServiceType(text, knownFirm?.serviceType);
    if (type) {
      const subtype = guessSubtype(type, text);
      patch.service = { type, ...(subtype ? { subtype } : {}) };
      captured.push(`the service type (${type}${subtype ? ` — ${subtype}` : ""})`);
    }
  }

  const serviceType = patch.service?.type ?? state.service.type;
  if (serviceType && state.complaint.issues.length === 0) {
    const issues = guessIssues(serviceType, text);
    if (issues.length > 0) {
      patch.complaint = { issues };
      captured.push(`what went wrong (${issues.join(", ").toLowerCase()})`);
    }
  }

  // Compensation stance.
  if (state.outcome.seeking_compensation === null) {
    if (UNSURE.test(text) && /\b(compensat|money|refund|out of pocket)\b/i.test(text)) {
      patch.outcome = { seeking_compensation: "not_sure" };
      captured.push("that you are not sure about compensation");
    } else if (/\b(compensat|refund|reimburse|money back|out of pocket)\b/i.test(text) && !NEGATIVE.test(text)) {
      patch.outcome = { seeking_compensation: "yes" };
      captured.push("that you are seeking compensation");
    }
  }

  const email = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.exec(text);
  if (email && !state.complainant.email) {
    patch.complainant = { email: email[0] };
    captured.push("your email address");
  }

  // Approving or editing a held draft takes precedence over anything else.
  const draftHandled = handleDraftReply(patch, text, state, captured);

  // Direct answers to the field the person was just asked about.
  if (!draftHandled && answerTarget) {
    const before = JSON.stringify(patch);
    applyDirectAnswer(patch, answerTarget, text, state);
    // A short answer that lands should still be acknowledged by name.
    if (JSON.stringify(patch) !== before && captured.length === 0) {
      const field = findField(answerTarget);
      if (field && !patch.drafts?.fair_outcome) captured.push(`your answer for ${field.label.toLowerCase()}`);
    }
  }

  // Once the story is in, offer a narrative draft.
  const words = text.split(/\s+/).length;
  const hasStory =
    !draftHandled &&
    (words >= 18 || text.length > 110 || (state.complaint.issues.length > 0 && text.length > 60));
  if (hasStory && !state.complaint.narrative && !state.drafts.narrative) {
    const merged = { ...state, ...(patch.firm ? { firm: { ...state.firm, ...patch.firm } } : {}) };
    patch.drafts = { narrative: draftNarrative(merged as ComplaintState, text) };
  }

  const reply = composeReply(state, patch, captured);
  return { reply, patch };
}

/**
 * A held draft is the person's to approve. "Yes" promotes it onto the form; a
 * substantial reply is treated as their edit and becomes the text itself.
 * Returns true when the message was consumed as a response to a draft.
 */
function handleDraftReply(
  patch: ComplaintPatch,
  text: string,
  state: ComplaintState,
  captured: string[],
): boolean {
  const pending = state.drafts.narrative
    ? ("narrative" as const)
    : state.drafts.fair_outcome
      ? ("fair_outcome" as const)
      : null;
  if (!pending) return false;

  const approved = AFFIRMATIVE.test(text) || /\b(looks? good|perfect|that'?s it|approve|send it|fine)\b/i.test(text);
  const held = pending === "narrative" ? state.drafts.narrative : state.drafts.fair_outcome;

  if (approved && text.trim().split(/\s+/).length <= 12) {
    if (pending === "narrative") {
      patch.complaint = { ...patch.complaint, narrative: held };
      patch.drafts = { ...patch.drafts, narrative: "" };
      captured.push("your complaint description");
    } else {
      patch.outcome = { ...patch.outcome, fair_outcome: held };
      patch.drafts = { ...patch.drafts, fair_outcome: "" };
      captured.push("the outcome you are seeking");
    }
    return true;
  }

  // Anything substantial that is not an approval is their rewrite.
  if (text.trim().length > 25) {
    if (pending === "narrative") {
      patch.complaint = { ...patch.complaint, narrative: text.trim() };
      patch.drafts = { ...patch.drafts, narrative: "" };
      captured.push("your edited complaint description");
    } else {
      patch.outcome = { ...patch.outcome, fair_outcome: text.trim() };
      patch.drafts = { ...patch.drafts, fair_outcome: "" };
      captured.push("your edited outcome");
    }
    return true;
  }

  return false;
}

/**
 * Turn "I just want it fixed" into something concrete enough to act on, built
 * only from what they have already told us.
 */
function draftFairOutcome(state: ComplaintState): string {
  const firmName = state.firm.name || "the firm";
  const parts: string[] = [];
  const issues = state.complaint.issues.map((i) => i.toLowerCase());

  if (issues.some((i) => /denial|declined/.test(i))) {
    parts.push(`review and reconsider its decision`);
  } else if (issues.some((i) => /delay/.test(i))) {
    parts.push(`finalise my claim and tell me the outcome in writing`);
  } else if (issues.some((i) => /fee|premium|interest/.test(i))) {
    parts.push(`correct the charges on my account and refund anything charged in error`);
  } else if (issues.some((i) => /hardship/.test(i))) {
    parts.push(`agree an affordable repayment arrangement with me`);
  } else {
    parts.push(`put my account back where it should have been`);
  }

  if (state.outcome.seeking_compensation === "yes") {
    parts.push(`pay me back what this has cost me`);
  } else if (state.outcome.seeking_compensation === "not_sure") {
    parts.push(`tell me whether I am out of pocket, and repay me if I am`);
  }
  parts.push(`confirm the outcome to me in writing`);

  return `I would like ${firmName} to ${parts.join(", ")}.`;
}

function applyDirectAnswer(
  patch: ComplaintPatch,
  path: string,
  text: string,
  state: ComplaintState,
): void {
  const yes = AFFIRMATIVE.test(text) && !NEGATIVE.test(text);
  const no = NEGATIVE.test(text) && !AFFIRMATIVE.test(text);

  switch (path) {
    case "open_afca_complaint":
      if (yes) patch.open_afca_complaint = true;
      if (no) patch.open_afca_complaint = false;
      break;
    case "legal_proceedings":
      if (yes) patch.legal_proceedings = true;
      if (no) patch.legal_proceedings = false;
      break;
    case "consents.authority":
    case "consents.engagement_charter":
      if (yes) {
        patch.consents = { authority: true, engagement_charter: true };
      }
      break;
    case "complained_to_firm.final_reply":
      if (yes) patch.complained_to_firm = { ...patch.complained_to_firm, final_reply: true };
      if (no) patch.complained_to_firm = { ...patch.complained_to_firm, final_reply: false };
      break;
    case "complainant.first_name": {
      const name = /\b(?:i'?m|my name is|it'?s|this is)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/.exec(text);
      if (name) {
        patch.complainant = {
          ...patch.complainant,
          first_name: name[1],
          ...(name[2] ? { last_name: name[2] } : {}),
        };
      } else if (/^[A-Za-z]+(\s+[A-Za-z]+)?$/.test(text.trim())) {
        const [first, last] = text.trim().split(/\s+/);
        patch.complainant = { ...patch.complainant, first_name: first, ...(last ? { last_name: last } : {}) };
      }
      break;
    }
    case "outcome.seeking_compensation":
      if (UNSURE.test(text)) patch.outcome = { ...patch.outcome, seeking_compensation: "not_sure" };
      else if (no) patch.outcome = { ...patch.outcome, seeking_compensation: "no" };
      else if (yes) patch.outcome = { ...patch.outcome, seeking_compensation: "yes" };
      break;
    case "complainant.dob": {
      if (SKIP.test(text)) break;
      const dob = DATE_PATTERN.exec(text);
      if (dob) patch.complainant = { ...patch.complainant, dob: dob[1] };
      break;
    }
    case "outcome.fair_outcome": {
      // Never written straight to the form: propose a concrete version and let
      // them approve it, the same way the narrative works.
      const projected = { ...state, outcome: { ...state.outcome, ...patch.outcome } };
      const vague = UNSURE.test(text) || text.trim().length <= 25;
      patch.drafts = {
        ...patch.drafts,
        fair_outcome: vague ? draftFairOutcome(projected) : text.trim(),
      };
      break;
    }
    case "complaint.narrative":
      if (text.length > 40) patch.drafts = { narrative: text };
      break;
    case "firm.reference":
      if (UNSURE.test(text) || SKIP.test(text) || NEGATIVE.test(text)) {
        patch.firm = { ...patch.firm, no_reference: true };
      }
      break;
    case "service.subtype": {
      const options = SERVICE_SUBTYPES[state.service.type];
      if (options) {
        const found = options.find((o) => o.toLowerCase().includes(text.toLowerCase().trim()));
        patch.service = { ...patch.service, subtype: found ?? text.trim() };
      } else if (text.trim()) {
        patch.service = { ...patch.service, subtype: text.trim() };
      }
      break;
    }
    default:
      break;
  }
}

function composeReply(state: ComplaintState, patch: ComplaintPatch, captured: string[]): string {
  const lines: string[] = [];

  if (captured.length > 0) {
    lines.push(`Got it — I've noted ${listOut(captured)}.`);
  }

  if (patch.drafts?.fair_outcome) {
    lines.push(
      `Let me put that into words the form can use:`,
      ``,
      patch.drafts.fair_outcome,
      ``,
      `Does that capture it? Approve it, or tell me what to change.`,
    );
    return lines.join("\n");
  }

  if (patch.drafts?.narrative) {
    lines.push(
      `Here's how I'd write that up for the "Tell us about your complaint" box, in your words:`,
      ``,
      patch.drafts.narrative,
      ``,
      `Does that read right? You can approve it as-is or tell me what to change.`,
    );
    return lines.join("\n");
  }

  // Ask for the next thing, using the state as it will be after this patch.
  const projected = projectState(state, patch);
  const next = groupedWithNext(projected);
  if (next.length === 0) {
    lines.push(`That's everything the form needs. Have a look at the review panel — you can export it as JSON or print a summary.`);
    return lines.join("\n");
  }

  if (next.length > 1) {
    lines.push(`Next, could you give me your ${next.map((n) => n.label.toLowerCase()).join(", ")}?`);
  } else {
    lines.push(questionFor(next[0].path, next[0].label, projected));
  }

  const remaining = missingFor(projected).length;
  if (remaining > 0 && captured.length > 0) {
    lines.push(`(${remaining} ${remaining === 1 ? "thing" : "things"} left after this.)`);
  }
  return lines.join("\n");
}

function questionFor(path: string, label: string, state: ComplaintState): string {
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

function projectState(state: ComplaintState, patch: ComplaintPatch): ComplaintState {
  const next = structuredClone(state);
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || !(key in target)) continue;
      const current = target[key];
      if (value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object" && !Array.isArray(current)) {
        merge(current as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        target[key] = value;
      }
    }
  };
  merge(next as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  return next;
}

function listOut(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export { lookupFirm };
