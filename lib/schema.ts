/**
 * The AFCA complaint form, expressed as data.
 *
 * This module is the single source of truth: the system prompt, the progress
 * rail, the required-field checks and the review page all derive from it.
 * Nothing here is hand-mirrored anywhere else.
 */

export type YesNoUnsure = "yes" | "no" | "not_sure";

export interface Address {
  line1: string;
  line2: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}

export interface ComplaintState {
  firm: { name: string; afca_member_no: string; reference: string; no_reference: boolean };
  open_afca_complaint: boolean | null;
  complained_to_firm: {
    yes: boolean | null;
    date: string;
    how: string;
    final_reply: boolean | null;
  };
  legal_proceedings: boolean | null;
  service: { type: string; subtype: string };
  complaint: { issues: string[]; narrative: string; lodged_elsewhere: string };
  attachments: string[];
  outcome: { seeking_compensation: YesNoUnsure | null; fair_outcome: string };
  complainant: {
    lodging_for: string;
    first_name: string;
    last_name: string;
    email: string;
    dob: string;
    mobile: string;
    address: Address;
    pronoun: string;
    interpreter: boolean | null;
    interpreter_language: string;
    support_needs: string;
    currently_experiencing: string;
    notify_by: string;
  };
  consents: { authority: boolean; engagement_charter: boolean };
  /** Model-proposed text held for the person's approval; never written straight to the form. */
  drafts: { narrative: string; fair_outcome: string };
}

export function emptyState(): ComplaintState {
  return {
    firm: { name: "", afca_member_no: "", reference: "", no_reference: false },
    open_afca_complaint: null,
    complained_to_firm: { yes: null, date: "", how: "", final_reply: null },
    legal_proceedings: null,
    service: { type: "", subtype: "" },
    complaint: { issues: [], narrative: "", lodged_elsewhere: "" },
    attachments: [],
    outcome: { seeking_compensation: null, fair_outcome: "" },
    complainant: {
      lodging_for: "self",
      first_name: "",
      last_name: "",
      email: "",
      dob: "",
      mobile: "",
      address: { line1: "", line2: "", suburb: "", state: "", postcode: "", country: "Australia" },
      pronoun: "",
      interpreter: null,
      interpreter_language: "",
      support_needs: "",
      currently_experiencing: "",
      notify_by: "email",
    },
    consents: { authority: false, engagement_charter: false },
    drafts: { narrative: "", fair_outcome: "" },
  };
}

export const NARRATIVE_MAX = 10000;

export type FieldKind =
  | "text"
  | "longtext"
  | "date"
  | "email"
  | "bool"
  /** A tick box: only `true` counts as answered, unlike a yes/no question. */
  | "consent"
  | "enum"
  | "list";

export interface FieldDef {
  /** Dotted path into ComplaintState. */
  path: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  /** Required unless `showIf` says the branch is not taken. */
  required: boolean;
  /** Branch guard: field only applies when this returns true. */
  showIf?: (s: ComplaintState) => boolean;
  /** Shown in the field's info tooltip. Every field carries one. */
  help?: string;
  /** Sensitive/optional: offered once, gently, never pushed. */
  sensitive?: boolean;
}

export interface StageDef {
  id: string;
  title: string;
  fields: FieldDef[];
}

export const SERVICE_TYPES = [
  "Superannuation",
  "Credit",
  "Banking deposits and payments",
  "General insurance",
  "Life insurance",
  "Investments and advice",
] as const;

/** Fully modelled for the MVP; the rest fall back to a free-text subtype. */
export const SERVICE_SUBTYPES: Record<string, readonly string[]> = {
  Superannuation: [
    "Account balance / contributions",
    "Death benefit distribution",
    "Insurance in superannuation (TPD)",
    "Insurance in superannuation (income protection)",
    "Insurance in superannuation (death cover)",
    "Fees and charges",
    "Rollover / transfer delay",
  ],
  Credit: [
    "Home loan",
    "Personal loan",
    "Credit card",
    "Buy now pay later",
    "Car loan / lease",
    "Overdraft",
    "Debt collection",
  ],
};

export const SERVICE_ISSUES: Record<string, readonly string[]> = {
  Superannuation: [
    "Denial of insurance claim",
    "Delay in claim handling",
    "Incorrect premiums or fees",
    "Failure to follow instructions",
    "Incorrect information provided",
    "Account administration error",
    "Decision of trustee",
  ],
  Credit: [
    "Financial difficulty / hardship",
    "Responsible lending",
    "Unauthorised transactions",
    "Incorrect fees or interest",
    "Default listing on credit file",
    "Misleading information",
    "Service quality",
  ],
};

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;

export const STAGES: StageDef[] = [
  {
    id: "firm",
    title: "Financial firm",
    fields: [
      {
        path: "firm.name",
        label: "Financial firm",
        kind: "text",
        required: true,
        help: "The name, ABN or ACN of the firm you are complaining about.",
      },
      {
        path: "firm.reference",
        label: "Reference / account number",
        kind: "text",
        required: true,
        showIf: (s) => !s.firm.no_reference,
        help: "An account, policy, member or complaint number. 'I don't know' is fine.",
      },
      {
        path: "open_afca_complaint",
        label: "Open complaint with AFCA already?",
        kind: "bool",
        required: true,
        help: "Whether you already have another complaint open with AFCA that has not been closed yet.",
      },
    ],
  },
  {
    id: "authority",
    title: "Authority",
    fields: [
      {
        path: "complainant.lodging_for",
        label: "Who is this complaint for?",
        kind: "enum",
        options: ["self", "jointly", "business", "someone_else"],
        required: true,
        help: "Self is you alone. Jointly covers a shared account. Business is a company or trust. Someone else means you are acting for another person.",
      },
      {
        path: "consents.authority",
        label: "Authority to act consent",
        kind: "consent",
        required: true,
        help: "Confirms you have the authority to lodge this complaint and for AFCA to deal with you about it.",
      },
      {
        path: "consents.engagement_charter",
        label: "Engagement charter consent",
        kind: "consent",
        required: true,
        help: "Confirms you have read the charter setting out how AFCA and everyone involved are expected to work together.",
      },
    ],
  },
  {
    id: "service",
    title: "Type of service",
    fields: [
      {
        path: "service.type",
        label: "Type of financial service",
        kind: "enum",
        options: SERVICE_TYPES,
        required: true,
        help: "The broad category the product falls under. Pick the closest one — it can be changed later.",
      },
      {
        path: "service.subtype",
        label: "Product or service",
        kind: "text",
        required: true,
        help: "The specific product the complaint is about, such as a home loan or a death benefit.",
      },
    ],
  },
  {
    id: "details",
    title: "Complaint details",
    fields: [
      {
        path: "complaint.issues",
        label: "What went wrong",
        kind: "list",
        required: true,
        help: "The short labels for the problem. Add as many as fit — the full story goes in the next field.",
      },
      {
        path: "complaint.narrative",
        label: "Tell us about your complaint",
        kind: "longtext",
        required: true,
        help: `Up to ${NARRATIVE_MAX.toLocaleString()} characters, in your own words.`,
      },
      {
        path: "complained_to_firm.yes",
        label: "Complained to the firm already?",
        kind: "bool",
        required: true,
        help: "AFCA normally expects the firm to have had a chance to put things right first.",
      },
      {
        path: "complained_to_firm.date",
        label: "Date you complained",
        kind: "date",
        required: true,
        showIf: (s) => s.complained_to_firm.yes === true,
        help: "Approximate is fine.",
      },
      {
        path: "complained_to_firm.how",
        label: "How you complained",
        kind: "text",
        required: true,
        showIf: (s) => s.complained_to_firm.yes === true,
        help: "However you got in touch — phone, email, a web form, a letter or in branch.",
      },
      {
        path: "complained_to_firm.final_reply",
        label: "Received a final response?",
        kind: "bool",
        required: true,
        showIf: (s) => s.complained_to_firm.yes === true,
        help: "A final answer from the firm closing off your complaint. No is fine — you can still lodge.",
      },
      {
        path: "legal_proceedings",
        label: "Legal proceedings on foot?",
        kind: "bool",
        required: true,
        help: "Whether this dispute is already before a court or tribunal.",
      },
    ],
  },
  {
    id: "attachments",
    title: "Attach files",
    fields: [
      {
        path: "attachments",
        label: "Supporting documents",
        kind: "list",
        required: false,
        help: "Optional. Demo lists filenames only — nothing is uploaded.",
      },
    ],
  },
  {
    id: "outcome",
    title: "Outcome sought",
    fields: [
      {
        path: "outcome.seeking_compensation",
        label: "Seeking compensation?",
        kind: "enum",
        options: ["yes", "no", "not_sure"],
        required: true,
        help: "Whether you are asking for money back or a payment. Not sure is a perfectly good answer.",
      },
      {
        path: "outcome.fair_outcome",
        label: "What would be a fair outcome?",
        kind: "longtext",
        required: true,
        help: "What you would like the firm to do to put things right, in your own words.",
      },
    ],
  },
  {
    id: "contact",
    title: "Contact details",
    fields: [
      {
        path: "complainant.first_name",
        label: "First name",
        kind: "text",
        required: true,
        help: "Your given name, as the firm holds it on the account.",
      },
      {
        path: "complainant.last_name",
        label: "Last name",
        kind: "text",
        required: true,
        help: "Your family name, as the firm holds it on the account.",
      },
      {
        path: "complainant.email",
        label: "Email",
        kind: "email",
        required: true,
        help: "Where AFCA sends updates about your complaint.",
      },
      {
        path: "complainant.dob",
        label: "Date of birth",
        kind: "date",
        required: true,
        help: "Used to match you to the account the firm holds.",
      },
      {
        path: "complainant.mobile",
        label: "Mobile",
        kind: "text",
        required: false,
        help: "Optional. A number to reach you on if something needs a quick word.",
      },
      {
        path: "complainant.address.line1",
        label: "Street address",
        kind: "text",
        required: true,
        help: "Your street number and name, including a unit number if you have one.",
      },
      {
        path: "complainant.address.suburb",
        label: "Suburb",
        kind: "text",
        required: true,
        help: "The suburb or town of your postal address.",
      },
      {
        path: "complainant.address.state",
        label: "State",
        kind: "enum",
        options: AU_STATES,
        required: true,
        help: "The Australian state or territory of your postal address.",
      },
      {
        path: "complainant.address.postcode",
        label: "Postcode",
        kind: "text",
        required: true,
        help: "The four-digit postcode of your postal address.",
      },
      {
        path: "complainant.notify_by",
        label: "How should we contact you?",
        kind: "enum",
        options: ["email", "post", "sms"],
        required: true,
        help: "Your preferred channel for updates: email, post, or a text message.",
      },
      {
        path: "complainant.pronoun",
        label: "Pronoun",
        kind: "text",
        required: false,
        sensitive: true,
        help: "How you would like to be referred to, such as she, he or they. Entirely optional.",
      },
      {
        path: "complainant.interpreter",
        label: "Need an interpreter?",
        kind: "bool",
        required: false,
        sensitive: true,
        help: "AFCA can arrange one at no cost to you. Entirely optional.",
      },
      {
        path: "complainant.support_needs",
        label: "Support needs",
        kind: "text",
        required: false,
        sensitive: true,
        help: "Anything that would make this easier for you, such as a preferred contact time. Entirely optional.",
      },
      {
        path: "complainant.currently_experiencing",
        label: "Currently experiencing",
        kind: "text",
        required: false,
        sensitive: true,
        help: "e.g. financial hardship, illness. Entirely optional.",
      },
    ],
  },
  { id: "review", title: "Review", fields: [] },
];

export function getPath(state: ComplaintState, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, state);
}

export function setPath(state: ComplaintState, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop();
  if (!last) return;
  let cursor: Record<string, unknown> = state as unknown as Record<string, unknown>;
  for (const key of keys) {
    const next = cursor[key];
    if (!next || typeof next !== "object") return;
    cursor = next as Record<string, unknown>;
  }
  cursor[last] = value;
}

export function findField(path: string): FieldDef | undefined {
  for (const stage of STAGES) {
    const field = stage.fields.find((f) => f.path === path);
    if (field) return field;
  }
  return undefined;
}
