/**
 * Deterministic stand-in for the model, used when no API key is configured.
 *
 * It is a rule-based extractor, not a small language model: it covers the demo
 * script and common phrasings so the UI is fully clickable offline. Real runs
 * should set ANTHROPIC_API_KEY — see lib/model.ts.
 */
import { type ComplaintState, SERVICE_ISSUES, SERVICE_SUBTYPES, STAGES, findField } from "./schema";
import { type ComplaintPatch, applyPatch, cleanPatch } from "./patch";
import { FIRMS, SECTOR_SERVICE_TYPE, lookupFirm } from "./directory";
import { groupedWithNext, missingFor } from "./next";

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
 * `composeReply` joins the question in with an acknowledgement line and a
 * "N things left" footer (see composeReply below), so the question is rarely
 * the whole message — it is matched line by line instead. A grouped question
 * ("could you give me your X, Y?") or a draft-approval message has no single
 * field behind it, so those turns are left unmatched and fall through to the
 * groupedWithNext fallback, same as the first turn.
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
/** Agreeing to one of the consents, which is never a product name. */
const CONSENT_TALK =
  /\b(authority to act|engagement charter|both consents?|tick both|i consent|i agree to the)\b/i;

/**
 * Is this sentence plainly an answer to some other question?
 *
 * A free-text field takes whatever is typed while it is the question, so a
 * sentence about a consent or a skip would be filed as the person's answer.
 * Only clear signals count: anything else is taken at face value, because
 * refusing a real answer is worse than accepting an odd one.
 */
function isAboutSomethingElse(text: string): boolean {
  return CONSENT_TALK.test(text) || SKIP.test(text);
}

/** Someone putting right something they or the assistant got wrong. */
const CORRECTION =
  /\b(actually|sorry,?|i meant|i mean|no,? it'?s|not that|instead of|rather than|correction|my mistake|wrong|should (?:be|have been)|change (?:it|that) to|it'?s not)\b/i;

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

/**
 * The first directory firm named in the text.
 *
 * `exclude` skips one firm by name, for a correction: "actually it was Westpac,
 * not CBA" names both, and the one being corrected away from is the one already
 * on the form. Without that, the old name matches first and the correction
 * silently does nothing.
 */
function matchFirm(
  text: string,
  exclude?: string,
): { name: string; member: string; serviceType: string } | null {
  for (const firm of FIRMS) {
    if (exclude && firm.name === exclude) continue;
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
/** State codes that are also ordinary words, so they need address context. */
const AMBIGUOUS_STATE_CODES = ["ACT", "WA", "SA", "NT"];
/** The words that make a string look like a street address. */
const STREET_WORD =
  /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|place|pl|parade|pde|crescent|cres|terrace|tce|way)\b/i;

/**
 * Pull what we can from an Australian address written as one line. Partial
 * results are fine — whatever is found gets filled, the rest stays askable.
 */
/**
 * `asked` means the address was the question, so a bare state code is an answer
 * to it rather than a word that happens to look like one.
 */
function parseAddress(text: string, asked = false): Record<string, string> {
  const found: Record<string, string> = {};
  const value = text.trim();

  const postcode = /\b(\d{4})\b/.exec(value);
  const stateMatch = new RegExp(`\\b(${STATE_CODES.join("|")})\\b`, "i").exec(value);

  // "ACT" is a state code and an ordinary word: "authority to act", "refused to
  // act on my complaint". Taking it at face value writes an address nobody gave
  // — the one thing this must never do — so an ambiguous code has to be earned
  // by the text around it.
  if (stateMatch) {
    const code = stateMatch[1].toUpperCase();
    const addressShaped = asked || STREET_WORD.test(value) || /\b\d{4}\b/.test(value);
    if (!AMBIGUOUS_STATE_CODES.includes(code) || addressShaped) found.state = code;
  }
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
  const captured: string[] = [];
  // What the assistant actually asked about last turn, when the message
  // doesn't carry its own focus. This must win over "whatever the form still
  // needs" — otherwise an answer to an already-satisfied field gets rerouted
  // to whatever question happens to be next, and lands on the wrong path.
  const historyTarget = askedAboutPath(history, state);
  const answerTargetIsFirm =
    (focusPath ?? historyTarget ?? groupedWithNext(state)[0]?.path) === "firm.name";

  // A firm already on the form is only replaced on a clear signal: the person
  // correcting themselves, or answering a question about the firm. Without
  // that, "I also bank with CBA" would hijack a complaint about a super fund.
  // With no exception at all, though, a misheard or mistyped firm could never
  // be put right in chat — and the wrong firm is the worst field to be stuck
  // with, so an explicit correction has to win.
  const correcting = CORRECTION.test(text);
  // A stored name the directory does not recognise is provisional: it is either
  // a typo or a firm this demo does not carry, and the route has just asked
  // which one was meant. Naming a real firm next answers that question, so it
  // replaces the guess rather than sitting alongside it.
  const storedFirmIsProvisional =
    Boolean(state.firm.name) && matchFirm(state.firm.name) === null;
  const replacingFirm =
    Boolean(state.firm.name) && (correcting || answerTargetIsFirm || storedFirmIsProvisional);
  // While correcting, the firm being corrected away from is not a candidate:
  // "actually it was Westpac, not CBA" names the old firm only to reject it.
  const firm = matchFirm(text, replacingFirm ? state.firm.name : undefined);

  if (firm && (!state.firm.name || (replacingFirm && firm.name !== state.firm.name))) {
    patch.firm = { name: firm.name };
    // The old firm's member number must not survive the name change; the route
    // re-resolves and fills the right one.
    if (state.firm.afca_member_no) patch.firm.afca_member_no = "";
    captured.push(
      state.firm.name ? `the firm (now ${firm.name})` : `the firm (${firm.name})`,
    );
  } else if (!state.firm.name && !firm) {
    // They may have named a firm this demo's directory does not carry. Take it
    // at face value rather than asking the same question forever; the route
    // will say plainly that there is no member number for it.
    const named = namedFirmCandidate(text, answerTargetIsFirm);
    if (named) {
      patch.firm = { name: named };
      captured.push(`the firm (${named})`);
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
    captured.push("that you have no reference number");
  } else {
    // Requires an explicit "number"/"no."/"#" cue and a token that actually looks
    // like an identifier — at least one digit. Otherwise ordinary prose such as
    // "make a claim after I hurt my back" captures "after" as a reference.
    const ref =
      /\b(?:reference|account|policy|member|claim|complaint)\s*(?:number|no\.?|#)\s*(?:is\s+)?[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,})\b/i.exec(text) ??
      /\b(?:reference|account|policy|member)\s*(?:is|:)\s*([A-Za-z0-9][A-Za-z0-9-]{3,})\b/i.exec(text);
    if (ref && /\d/.test(ref[1]) && !state.firm.reference) {
      patch.firm = { ...patch.firm, reference: ref[1] };
      captured.push(`the reference number (${ref[1]})`);
    }
  }

  // Did they complain to the firm, and how?
  if (state.complained_to_firm.yes === null) {
    const stance = readContactStance(text);
    if (stance === true) {
      patch.complained_to_firm = { yes: true };
      captured.push("that you already contacted the firm");
    } else if (stance === false) {
      patch.complained_to_firm = { yes: false };
      captured.push("that you have not contacted the firm yet");
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
    captured.push(`the date (${date[1]})`);
  }

  const contactedByUser =
    patch.complained_to_firm?.yes === true || state.complained_to_firm.yes === true;
  if (!state.complained_to_firm.how && contactedByUser) {
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
    patch.complainant = { ...patch.complainant, email: email[0] };
    captured.push("your email address");
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
      captured.push(`your name (${[named[1], named[2]].filter(Boolean).join(" ")})`);
    }
  }

  const address = parseAddress(text);
  if (Object.keys(address).length > 0 && !state.complainant.address.postcode) {
    patch.complainant = {
      ...patch.complainant,
      address: { ...patch.complainant?.address, ...address },
    };
    captured.push("your address");
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
      const address = parseAddress(text, true);
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
      } else if (text.trim() && !isAboutSomethingElse(text)) {
        // Free text for the service types this demo does not model in full,
        // which makes this field a catch-all: while it is the question, an
        // answer to a *different* question would be printed on the form as the
        // person's product name.
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

/**
 * What the state will look like once this patch lands, used to decide what to
 * ask next. It has to agree with the real thing exactly, so it defers to
 * `applyPatch` rather than keeping a second merge of its own — including the
 * reconciliation that clears answers the patch has just made inapplicable.
 */
function projectState(state: ComplaintState, patch: ComplaintPatch): ComplaintState {
  return applyPatch(state, patch);
}

function listOut(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export { lookupFirm };
