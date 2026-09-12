# Complaint Concierge

**Live: https://complaint-requirements.vercel.app**

A chat that fills in a form. The AFCA complaint form is the schema; the
conversation is the interface.

**Not affiliated with AFCA.** Demo data only — nothing is submitted anywhere,
and the firm directory is fabricated.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 125 unit tests
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
| `lib/merge-state.ts` | Applies only what the server actually changed, so a form edit made while a reply is in flight is not silently discarded. |
| `lib/export.ts` | The review summary, the clipboard text, and the JSON download. |
| `app/api/chat/route.ts` | One turn: validate → resolve firm → apply → return authoritative state. |

### Two deliberate constraints

**Firm details cannot be invented.** The model only ever emits a firm *name*;
`app/api/chat/route.ts` strips any `afca_member_no` it returns and fills the
number from `data/firms.json`. An unrecognised firm gets an explicit "not in
the directory" note rather than a plausible-looking number.

**Drafts are held, not written.** When the assistant writes the complaint
narrative or the outcome statement, it goes to `drafts.*` and appears as a card
the person approves or edits. Only approval moves text onto the form.

A third rule falls out of the first: the assistant only records that someone
complained to the firm when *they* were the one who made contact. "They called
me last week" is the firm acting, not a complaint — writing "I raised this with
CommBank by phone" into a document someone signs is the worst thing this product
could do, so `readContactStance` in `lib/mock-brain.ts` reads the subject and
records nothing when it is ambiguous.

## Pages

- `/` — the demo: chat on the left, the form filling itself on the right.
- `/privacy` — what happens to what people type. Reachable from the menu.

## Tests

```bash
npm test
```

125 tests across seven files, covering the parts where being wrong matters:
date and enum coercion, branch rules, firm matching, request-input sanitising,
the in-flight merge, and the full six-step demo script end to end. Most of them
exist because they caught a real bug — a super fund's insurance filed as
"General insurance", "No, I haven't complained" read as *yes*, `31 February`
accepted as a date, a stray word stored as an account number.

## Scope

Single complainant (self), all 8 stages, ~10 mock firms, Superannuation and
Credit modelled in full with other service types accepting free text.
Attachments list filenames only. Export as JSON, clipboard text, or print.

Not included: real submission, persistence, login, multi-party complaints.

Scam complaints are deliberately absent: AFCA cannot consider a Scams
Prevention Framework complaint until 31 March 2027, and the SPF is multi-party
in a way this one-complainant-one-firm schema does not model. See
`docs/scam-complaints-note.md`.

## Repository layout

| Path | |
|---|---|
| `app/` | Routes: the demo at `/`, the privacy page at `/privacy`, the turn endpoint at `/api/chat`. |
| `components/` | Chat pane, form pane, draft card, review panel, menu, assistant avatar. |
| `lib/` | The engine, and `lib/__tests__/`. |
| `data/firms.json` | The fabricated firm directory. |
| `docs/` | The three-minute demo script, and the note on scam complaints. |

`.claude/worktrees/` holds agent worktrees — full checkouts of this repo. They
are ignored by git, excluded from Vercel uploads, and excluded from the vitest
run; without that last one, vitest walks into them and reports their tests as
this project's.
