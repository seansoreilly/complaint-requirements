/**
 * Deterministic stand-in for the model, used when no API key is configured.
 *
 * It is a rule-based extractor, not a small language model: it covers the demo
 * script and common phrasings so the UI is fully clickable offline. Real runs
 * should set ANTHROPIC_API_KEY — see lib/model.ts.
 */
import { type ComplaintState, SERVICE_ISSUES, SERVICE_SUBTYPES, STAGES } from "./schema";
import { type ComplaintPatch, cleanPatch } from "./patch";
import { FIRMS, SECTOR_SERVICE_TYPE, lookupFirm } from "./directory";
import { groupedWithNext } from "./next";
import { questionFor } from "./questions";

export interface BrainResult {
  reply: string;
  patch: ComplaintPatch;
}

/**
 * A structural stand-in for `ChatTurn` (declared in lib/model.ts, which
 * imports this module). Duplicating the shape here avoids a circular type
 * dependency between the two files.
 */
type HistoryTurn = { role: string; content: string };

/**
 * Which field, if any, did the assistant's last message ask about?
 *
 * `questionFor` is a deterministic per-field template, so this is an exact
 * reverse lookup rather than a fuzzy guess: build the map by generating the
 * question for every known field against the current state and matching the
 * assistant's text against it verbatim. That keeps the lookup honest as the
 * templates change, instead of hand-copying question strings that would rot.
 *
 * A reply can still carry more than the question itself (a draft proposal, the
 * closing review message, or a question ensureAsk appended), so it is matched
 * line by line rather than whole. A grouped question ("could you give me your
 * X, Y?") or a draft-approval message has no single field behind it, so those
 * turns are left unmatched and fall through to the groupedWithNext fallback,
 * same as the first turn.
 */
function askedAboutPath(history: HistoryTurn[] | undefined, state: ComplaintState): string | undefined {
  if (!history || history.length === 0) return undefined;
  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  if (!lastAssistant) return undefined;
  const lines = lastAssistant.content.split("\n").map((line) => line.trim());

  for (const stage of STAGES) {
    for (const field of stage.fields) {
      if (lines.includes(questionFor(field.path, field.label, state))) return field.path;
    }
  }
  return undefined;
}

const NEGATIVE = /\b(no|nope|haven'?t|have not|didn'?t|did not|never|none)\b/i;
const AFFIRMATIVE = /\b(yes|yeah|yep|yup|correct|that'?s right|i did|i have|agree|agreed|ok|okay|sure|fine|confirm|confirmed|consent|happy to|go ahead)\b/i;
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

const CONTACT_VERB = "complained|emailed|e-mailed|called|rang|phoned|wrote|lodged|raised|contacted|spoke to|got in touch|reached out";

/**
 * Did the PERSON contact the firm, or did the firm contact them?
 *
 * "I emailed them" and "they called me" both contain a contact verb; only the
 * first is a complaint to the firm. Getting this backwards writes a false
 * statement into a document someone signs their name to, so the subject is
 * checked explicitly and anything ambiguous returns null rather than guessing.
 */
export function readContactStance(text: string): boolean | null {
  // The firm as the actor: "they called me", "the bank wrote to me".
  const firmActed = new RegExp(
    `\\b(they|he|she|it|the (?:bank|firm|fund|insurer|company)|someone|a (?:rep|representative))\\b[^.!?]{0,30}?\\b(?:${CONTACT_VERB})\\b`,
    "i",
  );
  // The person as the actor: "I emailed", "we complained", "I have written".
  const userActed = new RegExp(
    `\\b(i|we)\\b[^.!?]{0,24}?\\b(?:${CONTACT_VERB})\\b`,
    "i",
  );
  const negated = new RegExp(
    `\\b(no|not|never|haven'?t|have not|hadn'?t|didn'?t|did not|yet to)\\b[^.!?]{0,40}?\\b(?:complain|contact|email|call|rang|wrote|lodge|raise|speak|spoke)`,
    "i",
  );

  if (negated.test(text)) return false;
  if (userActed.test(text)) return true;
  // The firm contacting them is not the person complaining to the firm. Say
  // nothing rather than assert the opposite.
  if (firmActed.test(text)) return null;

  // A bare verb with no stated subject ("emailed them on the 3rd") reads as
  // the person, since they are the one telling the story.
  if (new RegExp(`\\b(?:${CONTACT_VERB})\\b`, "i").test(text)) return true;
  return null;
}

/**
 * A firm the directory does not know. Only trusted when we actually asked for
 * a firm, and only when the message looks like a name rather than a story —
 * a wrong guess here files the complaint against the wrong company.
 */
function namedFirmCandidate(text: string, asked: boolean): string | null {
  if (!asked) return null;
  const value = text.trim().replace(/[.!?]+$/, "");
  const words = value.split(/\s+/);

  // An explicit "with/about <Name>" is unambiguous however long the sentence,
  // so it is checked before the length guard.
  const trailing = /(?:with|about|against|fund,|bank,|called)\s+([A-Z][A-Za-z&'’.-]*(?:\s+[A-Z][A-Za-z&'’.-]*){0,3})$/.exec(value);
  if (trailing) return trailing[1];

  if (words.length > 6) return null;

  // A bare name typed on its own.
  if (/^[A-Z][A-Za-z&'’.-]*(\s+[A-Za-z&'’.-]+){0,3}$/.test(value) && words.length <= 4) {
    return value;
  }
  return null;
}

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

const STATE_CODES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

/**
 * Pull what we can from an Australian address written as one line. Partial
 * results are fine — whatever is found gets filled, the rest stays askable.
 */
function parseAddress(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  const value = text.trim();

  const postcode = /\b(\d{4})\b/.exec(value);
  const stateMatch = new RegExp(`\\b(${STATE_CODES.join("|")})\\b`, "i").exec(value);

  if (stateMatch) found.state = stateMatch[1].toUpperCase();
  // A four-digit number is only a postcode in an address-shaped string.
  if (postcode && (stateMatch || /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|place|pl|parade|pde|crescent|cres|terrace|tce|way)\b/i.test(value))) {
    found.postcode = postcode[1];
  }

  const street = /\b(\d+[a-zA-Z]?(?:[/-]\d+)?\s+[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)*?\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|place|pl|parade|pde|crescent|cres|terrace|tce|way)\b\.?)/i.exec(value);
  if (street) found.line1 = street[1].replace(/\s+/g, " ").trim();

  // The suburb sits between the street and the state.
  if (found.line1 && found.state) {
    const after = value.slice(value.indexOf(found.line1) + found.line1.length);
    const suburb = new RegExp(`^[,\\s]*([A-Za-z][A-Za-z'’\\s-]*?)[,\\s]+${found.state}\\b`, "i").exec(after);
    if (suburb) {
      const cleaned = suburb[1].trim();
      if (cleaned.length > 1 && cleaned.length < 40) found.suburb = titleCase(cleaned);
    }
  }
  return found;
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-03" reads like a database field; "3 September 2026" reads like a person. */
function humanDate(iso: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;
  const month = MONTH_NAMES[Number(parts[2]) - 1];
  if (!month) return iso;
  return `${Number(parts[3])} ${month} ${parts[1]}`;
}

function draftNarrative(state: ComplaintState, text: string): string {
  const firmName = state.firm.name || "the financial firm";
  const parts: string[] = [];
  parts.push(`My complaint is about ${firmName}.`);
  parts.push(text.trim().replace(/\s+/g, " "));
  if (state.complained_to_firm.yes === true) {
    const when = state.complained_to_firm.date ? ` on ${humanDate(state.complained_to_firm.date)}` : "";
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
  history?: HistoryTurn[],
): BrainResult {
  const patch: ComplaintPatch = {};
  const text = message.trim();
  // What the assistant actually asked about last turn, when the message
  // doesn't carry its own focus. This must win over "whatever the form still
  // needs" — otherwise an answer to an already-satisfied field gets rerouted
  // to whatever question happens to be next, and lands on the wrong path.
  const historyTarget = askedAboutPath(history, state);
  const answerTargetIsFirm =
    (focusPath ?? historyTarget ?? groupedWithNext(state)[0]?.path) === "firm.name";

  const firm = matchFirm(text);
  if (firm && !state.firm.name) {
    patch.firm = { name: firm.name };
  } else if (!state.firm.name && !firm) {
    // They may have named a firm this demo's directory does not carry. Take it
    // at face value rather than asking the same question forever; the route
    // will say plainly that there is no member number for it.
    const named = namedFirmCandidate(text, answerTargetIsFirm);
    if (named) {
      patch.firm = { name: named };
    }
  }
  // The sector of a firm named now, or one already on the form.
  const knownFirm = firm ?? (state.firm.name ? matchFirm(state.firm.name) : null);

  // "account no. AB-99213" is an account number, not an absence of one, so the
  // no-reference test must not fire on the abbreviation "no."
  const abbreviatedNumber = /\b(?:reference|account|policy|member|claim|complaint)\s*no\.?\s*[:#]?\s*[A-Za-z0-9]/i.test(text);
  const saysNone =
    !abbreviatedNumber &&
    (/\b(no|don'?t have|haven'?t got|without|none)\b[^.!?]{0,24}\b(reference|account|policy|member)\s*(number)?\b/i.test(text) ||
      /\b(reference|account|policy|member)\s*(number)?\b[^.!?]{0,24}\b(none|don'?t have|haven'?t got)\b/i.test(text));

  if (saysNone) {
    patch.firm = { ...patch.firm, no_reference: true };
  } else {
    // Requires an explicit "number"/"no."/"#" cue and a token that actually looks
    // like an identifier — at least one digit. Otherwise ordinary prose such as
    // "make a claim after I hurt my back" captures "after" as a reference.
    const ref =
      /\b(?:reference|account|policy|member|claim|complaint)\s*(?:number|no\.?|#)\s*(?:is\s+)?[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,})\b/i.exec(text) ??
      /\b(?:reference|account|policy|member)\s*(?:is|:)\s*([A-Za-z0-9][A-Za-z0-9-]{3,})\b/i.exec(text);
    if (ref && /\d/.test(ref[1]) && !state.firm.reference) {
      patch.firm = { ...patch.firm, reference: ref[1] };
    }
  }

  // Did they complain to the firm, and how?
  if (state.complained_to_firm.yes === null) {
    const stance = readContactStance(text);
    if (stance === true) {
      patch.complained_to_firm = { yes: true };
    } else if (stance === false) {
      patch.complained_to_firm = { yes: false };
    }
  }

  const answerTarget = focusPath ?? historyTarget ?? groupedWithNext(state)[0]?.path;

  const date = DATE_PATTERN.exec(text);
  if (
    date &&
    answerTarget !== "complainant.dob" &&
    !state.complained_to_firm.date &&
    state.complained_to_firm.yes !== false
  ) {
    patch.complained_to_firm = { ...patch.complained_to_firm, date: date[1] };
  }

  const contactedByUser =
    patch.complained_to_firm?.yes === true || state.complained_to_firm.yes === true;
  if (!state.complained_to_firm.how && contactedByUser) {
    for (const [pattern, channel] of CHANNELS) {
      if (pattern.test(text)) {
        patch.complained_to_firm = { ...patch.complained_to_firm, how: channel };
        break;
      }
    }
  }

  if (state.complained_to_firm.final_reply === null &&
      /\b(haven'?t replied|no reply|no response|still waiting|heard nothing|never got back)\b/i.test(text)) {
    patch.complained_to_firm = { ...patch.complained_to_firm, final_reply: false };
  }

  if (!state.service.type) {
    const type = guessServiceType(text, knownFirm?.serviceType);
    if (type) {
      const subtype = guessSubtype(type, text);
      patch.service = { type, ...(subtype ? { subtype } : {}) };
    }
  }

  const serviceType = patch.service?.type ?? state.service.type;
  if (serviceType && state.complaint.issues.length === 0) {
    const issues = guessIssues(serviceType, text);
    if (issues.length > 0) {
      patch.complaint = { issues };
    }
  }

  // Compensation stance.
  if (state.outcome.seeking_compensation === null) {
    if (UNSURE.test(text) && /\b(compensat|money|refund|out of pocket)\b/i.test(text)) {
      patch.outcome = { seeking_compensation: "not_sure" };
    } else if (/\b(compensat|refund|reimburse|money back|out of pocket)\b/i.test(text) && !NEGATIVE.test(text)) {
      patch.outcome = { seeking_compensation: "yes" };
    }
  }

  const email = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.exec(text);
  if (email && !state.complainant.email) {
    patch.complainant = { ...patch.complainant, email: email[0] };
  }

  // Contact details tend to arrive in one breath ("I'm Sam Chen, 12 Ford St,
  // Brunswick VIC 3056"), so parse them wherever they show up.
  // Only "my name is X" states a name outright. "I'm ..." and "it's ..." begin
  // far too many ordinary sentences ("it's just for me") to treat as a name,
  // unless we actually asked for one — that case is handled in applyDirectAnswer.
  if (!state.complainant.first_name) {
    // Longest alternative first: "my name.?s" would otherwise swallow "my name is".
    const named = /\b(?:my name is|my name'?s|name'?s)\s+([A-Za-z][a-z'’-]+)(?:\s+([A-Za-z][a-z'’-]+))?/i.exec(text);
    if (named) {
      patch.complainant = {
        ...patch.complainant,
        first_name: titleCase(named[1]),
        ...(named[2] ? { last_name: titleCase(named[2]) } : {}),
      };
    }
  }

  const address = parseAddress(text);
  if (Object.keys(address).length > 0 && !state.complainant.address.postcode) {
    patch.complainant = {
      ...patch.complainant,
      address: { ...patch.complainant?.address, ...address },
    };
  }

  // Approving or editing a held draft takes precedence over anything else.
  const draftHandled = handleDraftReply(patch, text, state);

  // Direct answers to the field the person was just asked about.
  if (!draftHandled && answerTarget) {
    applyDirectAnswer(patch, answerTarget, text, state);
  }

  // Once the story is in, offer a narrative draft.
  // A story is a message that recounts something happening, not one that is
  // merely long. Past-tense verbs and grievance words are the signal; the
  // length floor only guards against drafting from a two-word reply.
  const words = text.split(/\s+/).length;
  const recounts =
    /\b(they|he|she|it|nobody|no one|someone)\b/i.test(text) &&
    /\b(said|told|took|charged|cancelled|declined|denied|refused|ignored|failed|stopped|kept|never|wouldn'?t|won'?t|haven'?t|hasn'?t|didn'?t|couldn'?t)\b/i.test(text);
  const hasStory =
    !draftHandled &&
    words >= 12 &&
    (recounts || words >= 18 || text.length > 110 ||
      (state.complaint.issues.length > 0 && text.length > 60));
  if (hasStory && !state.complaint.narrative && !state.drafts.narrative) {
    // Use the state as it will be once this turn's patch lands: a story that
    // also supplies the dates should have them in its own draft.
    const { patch: cleaned } = cleanPatch(patch);
    const projected = projectState(state, cleaned);
    patch.drafts = { ...patch.drafts, narrative: draftNarrative(projected, text) };
  }

  const reply = composeReply(state, patch);
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
    } else {
      patch.outcome = { ...patch.outcome, fair_outcome: held };
      patch.drafts = { ...patch.drafts, fair_outcome: "" };
    }
    return true;
  }

  // Anything substantial that is not an approval is their rewrite.
  if (text.trim().length > 25) {
    if (pending === "narrative") {
      patch.complaint = { ...patch.complaint, narrative: text.trim() };
      patch.drafts = { ...patch.drafts, narrative: "" };
    } else {
      patch.outcome = { ...patch.outcome, fair_outcome: text.trim() };
      patch.drafts = { ...patch.drafts, fair_outcome: "" };
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
      } else if (no) {
        // A decline is a real answer. The form cannot proceed without both, so
        // say so plainly rather than silently asking again.
        patch.consents = { authority: false, engagement_charter: false };
      }
      break;
    case "complained_to_firm.final_reply":
      if (yes) patch.complained_to_firm = { ...patch.complained_to_firm, final_reply: true };
      if (no) patch.complained_to_firm = { ...patch.complained_to_firm, final_reply: false };
      break;
    case "complainant.first_name": {
      if (patch.complainant?.first_name) break;
      // We asked for a name, so an introduction or a bare name both count.
      const intro = /(?:^|\b)(?:i'?m|i am|it'?s|this is|call me)\s+([A-Za-z][a-z'’-]+)(?:\s+([A-Za-z][a-z'’-]+))?/i.exec(text);
      const bare = /^([A-Za-z][a-z'’-]+)(?:\s+([A-Za-z][a-z'’-]+))?$/.exec(text.trim());
      const found = intro ?? bare;
      if (found) {
        patch.complainant = {
          ...patch.complainant,
          first_name: titleCase(found[1]),
          ...(found[2] ? { last_name: titleCase(found[2]) } : {}),
        };
      }
      break;
    }
    case "outcome.seeking_compensation":
      if (UNSURE.test(text)) patch.outcome = { ...patch.outcome, seeking_compensation: "not_sure" };
      else if (no) patch.outcome = { ...patch.outcome, seeking_compensation: "no" };
      else if (yes) patch.outcome = { ...patch.outcome, seeking_compensation: "yes" };
      break;
    case "complainant.last_name": {
      const bare = text.trim();
      if (/^[A-Za-z][A-Za-z'’-]*$/.test(bare)) {
        patch.complainant = { ...patch.complainant, last_name: bare };
      }
      break;
    }
    case "complainant.address.line1":
    case "complainant.address.suburb":
    case "complainant.address.postcode":
    case "complainant.address.state": {
      const address = parseAddress(text);
      if (Object.keys(address).length > 0) {
        patch.complainant = {
          ...patch.complainant,
          address: { ...patch.complainant?.address, ...address },
        };
      }
      break;
    }
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

function composeReply(state: ComplaintState, patch: ComplaintPatch): string {
  const lines: string[] = [];

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

  return lines.join("\n");
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

export { lookupFirm };
