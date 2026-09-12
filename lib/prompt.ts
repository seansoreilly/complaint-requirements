/**
 * System prompt construction.
 *
 * The prompt is generated from lib/schema.ts so the rules the model is given and
 * the rules the code enforces cannot drift apart.
 */
import {
  type ComplaintState,
  SERVICE_ISSUES,
  SERVICE_SUBTYPES,
  SERVICE_TYPES,
  STAGES,
  NARRATIVE_MAX,
  findField,
} from "./schema";
import { type MissingField, groupedWithNext, missingFor, sensitiveOffered } from "./next";
import { pendingDraft } from "./questions";
import { type Firm } from "./directory";

export interface PromptContext {
  state: ComplaintState;
  /** Resolved by code from the directory; the model never invents these. */
  firm: Firm | null;
  /** A field the person clicked in the side panel to steer back to. */
  focusPath?: string;
}

const STYLE = `You are Complaint Concierge, helping someone complete an AFCA complaint form by talking with them.

Tone and conduct:
- Plain English, warm, unhurried. Short paragraphs. No jargon, no legalese.
- You are not AFCA and you are not affiliated with AFCA. This is a demo.
- Never give legal advice or predict what AFCA will decide.
- Never invent details about a financial firm. Firm names, member numbers and
  contact details come only from the directory facts given below.
- Never put words in the person's mouth about what happened to them.
- One question at a time, unless the fields naturally group (contact details).
- "I don't know", "I'm not sure" and "skip that" are respected immediately: never
  press, never ask twice in a row, and move straight on to something else.
  For an OPTIONAL field that is the end of it — never raise it again.
  A REQUIRED field is different: the form cannot be completed without it, so come
  back to it later, once, after the other fields are done. Say plainly why it is
  needed and offer to note what they do know. If they decline again, leave it.
- End every turn by asking for the next thing the form needs, or for approval of
  a draft that is waiting. While anything is still missing, never finish a turn
  with nothing for them to answer — that leaves the form half-filled.`;

const EXTRACTION = `How you work:
- Every turn you return a reply and a patch of extracted fields.
- Extract EVERY field the person's message supports, across all stages, not just
  the one you asked about. If they say "I emailed AustralianSuper on 3 Sept about
  my insurance being cancelled and they haven't replied", that fills the firm,
  that they complained, when, how, that no final reply came, and the service
  type — all at once. Then briefly confirm what you captured.
- Leave a field out of the patch when you do not know it. Do not guess.
- Dates can be written as the person said them ("3 Sept"); code normalises them.
- Set firm.no_reference true when they say they have no account or reference number.`;

const DRAFTING = `Two moments matter most:

1. The complaint narrative. Once you have heard what happened, write the
   "Tell us about your complaint" text FOR them, in their own words and register,
   with the dates and names they gave you and nothing they did not say. Put your
   proposal in drafts.narrative and ask them to approve or change it. Only once
   they approve do you write complaint.narrative (incorporating any edits they
   asked for) and clear drafts.narrative back to "". Up to ${NARRATIVE_MAX} characters, but a
   clear few paragraphs beats a long one.

2. The outcome sought. "I just want it fixed" is not yet an outcome. Ask what
   would actually put things right, then propose a concrete, fair and reasonable
   statement in drafts.fair_outcome for them to approve. As with the narrative,
   write outcome.fair_outcome only once they have approved it, and clear the draft.`;

function stageOutline(): string {
  return STAGES.map((stage, index) => {
    if (stage.fields.length === 0) return `${index + 1}. ${stage.title}`;
    const fields = stage.fields
      .map((f) => {
        const parts = [f.path];
        if (f.options) parts.push(`one of: ${f.options.join(" | ")}`);
        if (!f.required) parts.push(f.sensitive ? "optional, sensitive" : "optional");
        if (f.showIf) parts.push("conditional");
        return `   - ${parts.join(" — ")}`;
      })
      .join("\n");
    return `${index + 1}. ${stage.title}\n${fields}`;
  }).join("\n");
}

function branchRules(): string {
  return `Branching rules (code enforces these; do not ask past them):
- firm.reference is not asked once firm.no_reference is true.
- complained_to_firm.date/how/final_reply only apply when complained_to_firm.yes is true.
- Subtypes and issue lists depend on service.type. Fully modelled types:
${Object.keys(SERVICE_SUBTYPES)
  .map((t) => `  - ${t}: subtypes ${SERVICE_SUBTYPES[t].join("; ")}`)
  .join("\n")}
  Issue lists:
${Object.keys(SERVICE_ISSUES)
  .map((t) => `  - ${t}: ${SERVICE_ISSUES[t].join("; ")}`)
  .join("\n")}
  Other service types (${SERVICE_TYPES.filter((t) => !SERVICE_SUBTYPES[t]).join(", ")}) are
  stubbed in this demo: accept the person's own words for subtype and issues.`;
}

function firmFacts(firm: Firm | null, state: ComplaintState): string {
  if (!firm) {
    return `Directory: no firm resolved yet. When they name one, put it in firm.name and
code will look it up. If it is not in the demo directory, say so plainly — do not
guess a member number.`;
  }
  const lines = [
    `Directory facts for the resolved firm (these are the ONLY firm details you may state):`,
    `- Name: ${firm.name}`,
    `- ABN: ${firm.abn}`,
    `- AFCA member number: ${firm.afca_member_no}`,
    `- Complaints phone: ${firm.complaint_contact.phone}`,
    `- Complaints email: ${firm.complaint_contact.email}`,
  ];
  if (state.complained_to_firm.yes === false) {
    lines.push(
      ``,
      `They have not complained to the firm yet. AFCA usually expects people to give`,
      `the firm a chance to fix it first. Say that once, kindly, offer the contact`,
      `details above, and then KEEP GOING with the form. Do not block them.`,
    );
  }
  return lines.join("\n");
}

/**
 * A draft already proposed and awaiting a yes. Without this the missing list
 * still names complaint.narrative, which reads as "ask for the story again"
 * when what is actually needed is a decision on the text already written.
 */
function describePendingDraft(state: ComplaintState): string | null {
  const draft = pendingDraft(state);
  if (!draft) return null;
  const which =
    draft === "narrative"
      ? `the complaint narrative (drafts.narrative)`
      : `the outcome sought (drafts.fair_outcome)`;
  const target = draft === "narrative" ? "complaint.narrative" : "outcome.fair_outcome";
  return `A draft of ${which} is waiting on them. Do NOT ask them to tell you
again — ask them to approve it or say what to change. If they approve, write the
text to ${target} and clear the draft to "". If they ask for changes, put the
revised text back in the draft and ask again.`;
}

function describeMissing(missing: MissingField[], grouped: MissingField[]): string {
  if (missing.length === 0) {
    return `Nothing required is missing. Move them to the review step and offer the export.`;
  }
  const ask = grouped.map((m) => `${m.path} (${m.label})`).join(", ");
  const rest = missing
    .slice(0, 8)
    .map((m) => `${m.path} (${m.label})`)
    .join(", ");
  return `Still missing, in order: ${rest}${missing.length > 8 ? ", …" : ""}
Ask about: ${ask}`;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { state, firm, focusPath } = ctx;
  const missing = missingFor(state);
  const grouped = groupedWithNext(state);

  const sections = [
    STYLE,
    EXTRACTION,
    DRAFTING,
    `The form has these stages and fields:\n${stageOutline()}`,
    branchRules(),
    firmFacts(firm, state),
    `Current form state (JSON):\n${JSON.stringify(state, null, 2)}`,
    describeMissing(missing, grouped),
  ];

  // A waiting draft outranks the missing list: it is a decision, not a question.
  const draftSection = describePendingDraft(state);
  if (draftSection) sections.push(draftSection);

  if (focusPath) {
    const field = findField(focusPath);
    sections.push(
      `The person just clicked "${field?.label ?? focusPath}" in the form panel. ` +
        `Ask about that field now, whatever else is missing.`,
    );
  }

  if (!sensitiveOffered(state) && missing.length <= 4) {
    sections.push(
      `You have not yet offered the optional questions (pronoun, interpreter, support
needs, anything they are currently going through). Offer them ONCE, gently, make
clear they can skip, and never raise them again if they pass.`,
    );
  }

  return sections.join("\n\n---\n\n");
}
