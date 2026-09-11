# Complaint Concierge

A chat that fills in a form. The AFCA complaint form is the schema; the
conversation is the interface.

**Not affiliated with AFCA.** Demo data only — nothing is submitted anywhere,
and the firm directory is fabricated.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 53 unit tests
```

With no `ANTHROPIC_API_KEY` set, the app runs on a deterministic offline
extractor (`lib/mock-brain.ts`) that covers the scripted walkthrough, so the UI
is fully clickable with no credentials. Set a key in `.env.local` for real
conversational extraction; see `.env.example`.

## How it works

The model never owns the state. Each turn it receives the schema plus the
current state and returns `{reply, patch}`; code validates the patch, coerces
it, applies it, and decides what is still missing.

| File | Role |
|---|---|
| `lib/schema.ts` | The form as data — stages, fields, branch rules. The prompt and the UI both derive from this, so they cannot drift. |
| `lib/patch.ts` | Zod validation, date/enum coercion, deep merge. Nothing reaches the state unvalidated. |
| `lib/next.ts` | What is missing and what to ask next, honouring branches. Never gates progress. |
| `lib/directory.ts` | Fuzzy firm lookup in code. The model proposes a name; code assigns the member number. |
| `lib/prompt.ts` | System prompt, generated from the schema. |
| `lib/mock-brain.ts` | Offline rule-based extractor used when no API key is set. |
| `app/api/chat/route.ts` | One turn: validate → resolve firm → apply → return authoritative state. |

### Two deliberate constraints

**Firm details cannot be invented.** The model only ever emits a firm *name*;
`app/api/chat/route.ts` strips any `afca_member_no` it returns and fills the
number from `data/firms.json`. An unrecognised firm gets an explicit "not in
the directory" note rather than a plausible-looking number.

**Drafts are held, not written.** When the assistant writes the complaint
narrative or the outcome statement, it goes to `drafts.*` and appears as a card
the person approves or edits. Only approval moves text onto the form.

## Scope

Single complainant (self), all 8 stages, ~10 mock firms, Superannuation and
Credit modelled in full with other service types accepting free text.
Attachments list filenames only. Export as JSON, clipboard text, or print.

Not included: real submission, persistence, login, multi-party complaints.
