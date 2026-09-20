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
npm test         # 429 unit tests
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
| `lib/patch.ts` | Zod validation, date/enum coercion, deep merge, and `reconcile` — the one gate every write passes through, clearing answers a later change has made inapplicable. Nothing reaches the state unvalidated. |
| `lib/next.ts` | What is missing and what to ask next, honouring branches. Never gates progress. |
| `lib/questions.ts` | The wording used to ask for each field, shared by both brains and the route so they cannot ask differently. |
| `lib/continue.ts` | The guarantee that a turn never dead-ends while the form still needs something. |
| `lib/directory.ts` | Fuzzy firm lookup in code. The model proposes a name; code assigns the member number. |
| `lib/prompt.ts` | System prompt, generated from the schema. |
| `lib/mock-brain.ts` | Offline rule-based extractor used when no API key is set. |
| `lib/merge-state.ts` | Applies only what the server actually changed, so a form edit made while a reply is in flight is not silently discarded. |
| `lib/changed.ts` | What a turn actually changed on the form, diffed from the state before and after — never from the patch. The chips, the field flash and the unbacked-claim guard all read it. |
| `lib/reveal.ts` | Identifies what is showing above the form, so a panel that appears is scrolled into view instead of mounting off-screen. |
| `lib/export.ts` | The review summary, the clipboard text, and the JSON download. |
| `app/api/chat/route.ts` | One turn: validate → resolve firm → apply → return authoritative state. |

### Four deliberate constraints

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

**The conversation does not dead-end.** While any required field is unanswered
or a draft is waiting, every turn ends by asking for something. The prompt asks
the model for this; `lib/continue.ts` guarantees it, appending the next question
when a reply trails off — including when the model's response fails to parse.
Skipping stays allowed: a skip is respected at once and never pressed twice in a
row, but a *required* field is returned to later rather than quietly dropped.

## Pages

- `/` — the demo: chat on the left, the form filling itself on the right.
- `/privacy` — what happens to what people type. Reachable from the menu.

## Tests

```bash
npm test
```

429 tests across forty-three files, covering the parts where being wrong matters:
date and enum coercion, branch rules, firm matching, request-input sanitising,
the in-flight merge, reconciliation, and the full six-step demo script end to
end. Most of them exist because they caught a real bug — a super fund's
insurance filed as "General insurance", "No, I haven't complained" read as
*yes*, `31 February` accepted as a date, a stray word stored as an account
number.

`reconcile.test.ts` is the newest group, and it covers one class in
particular: **a rule enforced where the model writes but not where the person
does.** The model's patches pass through `cleanPatch`; text typed into the form
panel or a draft card does not, so limits held on one path and not the other.
Switching the service type left the old product on the form — "Credit /
Insurance in superannuation (TPD)", counted as answered and exported that way —
because `subtype` has no `showIf` guard: its validity depends on a sibling's
*value*, which `applies()` cannot express. `reconcile` in `lib/patch.ts` is
the one gate every write now passes through.

The second group — `address-guard`, `freetext-guard`, `firm-correction`,
`firm-name-words` — came out of driving the app in a browser, and covers a
different class: **text landing in a field it was never about.** "I agree to
the authority to act" set the address state to ACT and the assistant said it
had noted an address; a consent sentence typed while the product was the
question was filed as the product name. Both write something into a document
someone signs that they never said, which is the same failure
`readContactStance` exists to prevent. The firm was also unchangeable once
set, so a misheard or mistyped name could never be corrected — the worst
field in the form to be stuck with.

`firm-resolve` and `draft-claim-stale` came from three agents driving the
deployed app, and they are both the first class again — **a rule enforced where
the model writes but not where the person does** — found in two new places.

The member number is the directory's to assign, but only the chat route asked
the directory. A firm name retyped in the form panel kept the previous firm's
number, so the form showed AustralianSuper's `10657` beside "Westpac": a real
number against the wrong company, which is precisely what the constraint exists
to prevent. `resolveFirmDetails` in `lib/directory.ts` is now the one lookup
both paths call.

And `correctSavedClaim` corrected a reply that claimed text was saved — but only
on a turn where `holdDrafts` had diverted a write, and only for "I've saved
*that*". The transcript showed the other shape: the card already up from an
earlier turn, the reply "that's now saved as your complaint description", and a
patch that wrote nothing. Nothing diverted, so nothing corrected, and the
sentence the guard exists for was the one getting through. Someone told their
complaint is written stops looking for the button that would have written it.

`changed-paths`, `unbacked-claim`, `approval-gate` and `chat-approval` came from
a fifth pass over the deployed app, and they are the first class again — **a
rule the model was asked to follow rather than held to** — in the place it does
the most damage: what the chat says it did.

"I've changed the date to 2 September" was said, believed, and false; the form
still read the 7th. That is `correctSavedClaim`'s failure one field along, so it
gets the same treatment. `lib/changed.ts` diffs the state the browser sent
against the state going back, which is deliberately not `touchedPaths` — that
reports what a patch *asked* for, and a patch rewriting a field with the value
it already holds, or one whose write `reconcile` cleared, touches a path and
moves nothing. The answer drives chips naming the fields under the reply, a
flash on those fields, and a correction in front of any claim the diff cannot
see. The baseline is taken before the route resolves the firm, or the demo's
opening beat — type "Westpac", watch the member number appear — would diff to
"nothing changed".

The same pass found the ask-confirm-ask-again loop. A draft on screen is a
question already asked, but `outstandingPrompt` only preferred the approval
request for the question `ensureAsk` *appends*; the model's own reply ended on
the next field, `endsWithQuestion` saw a question and left it, and the court
case got asked either side of a card nobody had approved. The gate turned one
untidiness into a trap, so `holdDrafts` closes it: approving on the card cleared
the draft client-side, saying "yes, use it" in chat cleared nothing unless the
model remembered to, and a draft outliving its approval would now ask for
approval every turn with no answer that moves it along.

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
