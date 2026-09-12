# Resumption plan — live-brain chat evaluation, phase 2

Written 12 September 2026 at the end of phase 1, for whoever picks this up cold.
Phase 1 stopped because the Anthropic API key hit its spend limit; access returns
**2026-10-01 00:00 UTC**. Nothing below needs re-deriving — read this, then start.

## Where phase 1 ended

- Ledger: `scores.md` — 18 rows, strict tally **0 passed / 0 cleared once**.
  **Read that as a stopped clock, not a verdict.** Nobody reached the two-sweep
  phase; the app was never measured against the bar. Every run on the ledger was
  on a build later changed, because each one found something and it was fixed.
- Defects: `defects.md` — all fixed in code; 17 and 18 are marked NOT VERIFIED
  LIVE in their headings. Three fixes this run passed tests and did nothing in
  production, which is why Step 0 exists.
- Frozen build: **`2d7cc67`** (2026-09-12 22:44 AEST). The behaviour under test is
  this commit. Any code, prompt or schema change after it restarts every count.
- Personas never run: **1, 2, 4, 9, 10, 12, 13, 15**. The `declined` path has
  never been scored from a browser on a build where it works. Two personas test
  it: 15 (a required field declined once, returned to with a reason, then given)
  and the rescripted 5 (a required field declined twice and left blank).
- Persona sheets updated at close: 5 (Marie now scripts the product-type decline)
  and 8 (Sara now volunteers the negation in her story). See `personas.md`.

## The bar

A persona **passes** only on **two consecutive runs scoring ≥9/10 on the same
frozen hash**, both scored by the test manager from a full browser transcript.
A 9 requires: every `expect` field right, no safety breach, and a conversation a
real person would call good. Rubric: `rubric.md`.

Things that are **not evidence**: a green test suite (three fixes this run passed
tests and did nothing live); a probe driven at `/api/chat` by hand; a tester's
own summary ("clean pass"); anything from the mock brain.

## Preconditions (every session, before any run)

1. Worktree on branch `staging`, HEAD at the frozen hash. `git log -1 --format=%h`.
2. Dev server on **http://localhost:3100** (not 127.0.0.1 — hydration only works
   on the start origin).
3. `curl -s http://localhost:3100/api/chat` prints `{"mode":"claude"}`. If it
   prints `mock`, stop.
4. Every tester's launch brief contains the hash and the port, and every report
   starts with the hash and the start time.

## Step 0 — verify the two NOT-VERIFIED-LIVE fixes, in a browser, before anything else

If either is wrong, every sweep run is void, so these come first. One short
conversation each; a tester or the lead can drive it; the manager reads the
transcript.

**Fix A — defect 17, card approval no longer dead-ends** (`app/page.tsx` approveDraft, in 5076d69, frozen at 2d7cc67).
Run any persona to the narrative draft card, click **Use this**, and read the
assistant line that follows. Pass: "Added to your complaint…" is followed by a
question for the next missing field. Fail: the line ends without a question.
Repeat once for the outcome card ("Noted as the outcome you're seeking." must be
followed by a question). Observed failing on cases 5 and 20 round 4.

**Fix B — defect 18, the "even when reasonable" DRAFTING line** (`lib/prompt.ts`, in 5076d69, frozen at 2d7cc67).
Run persona 18 (Colin) to the outcome draft. His only stated remedy is "I
shouldn't be out of pocket for advice I didn't understand". Pass: the draft
contains no request he did not make — in particular not "review the advice" or
"a proper response", both of which the app's own coaching menu offers. Fail: any
menu item appears in the draft as his request. Observed failing on 17, 18, 20 r3.

Also confirm at the same time, because they were fixed at 2fa9d4f/bd17316 and
have only been seen at the API, never in a browser:
- **`declined` on the UI path**: persona 5 (now scripted) — after her second
  "not sure", the product-type list must not appear again; the summary shows the
  product blank. Observed failing on case 5 (ensureAsk forced a list). The
  header must read "Ready — 1 left blank ✓" (green, the completion state) while
  the review panel still lists the product as blank — the header and the panel
  now draw from one count in app/page.tsx, so if they disagree that is a
  failure. Export is not gated on a blank: ReviewPanel shows "N answers are
  still missing. You can export anyway and finish later" and the button works.
  Also confirm the `declined` list survives a later decline (2d7cc67 unions it
  in reconcile; before that a partial patch wiped earlier refusals) — persona 15
  declines two fields, so it is the natural check.
- **notify_by is asked**: any persona — "How would you prefer AFCA to contact you"
  must be asked before the summary; the tick must not be pre-filled.

If any of these fails: fix, commit, new hash, repeat Step 0. Do not start Step 1
on a hash with a known live failure.

## Step 1 — the unrun eight, then two clean re-runs (defect-finding)

Order, most likely to find something first:

| # | Persona | Why here |
|---|---|---|
| 1 | **15 skip-and-return** | Only test of the required-field return-once rule and `declined`. Watch item: between the first "I'd rather not" and the second, the field is still askable, so if any intervening reply trails off, `ensureAsk` re-asks it — count every raise of DOB and email and whether each carries a reason. |
| 2 | **12 ambiguous-firm** | "my super fund" must produce the disambiguation note and no member number until "Rest" → 11540. |
| 3 | **13 everything-at-once** | Multi-field extraction from one paragraph; fields must not be re-asked one by one. |
| 4 | **9 negated-complaint** | "No, I haven't complained to them yet" as a direct answer → false; AFCA-first note once; keep going. |
| 5 | **10 stray-reference** | "um I think so maybe" → nothing stored; `no_reference` true after "can't find it". |
| 6 | 1 super-tpd | Happy path; TPD must file under Superannuation, never General insurance. |
| 7 | 2 credit-hardship | Happy path; final_reply true. |
| 8 | 4 bnpl-fees | Happy path; "I don't have one" → `no_reference` true, reference "". |
| 9 | 5 default-listing (clean) | Now scripted; see persona sheet. |
| 10 | 20 scam-complaint (clean) | Tester must not improvise a date or an illness. |

These are defect-finding runs. A defect a person would meet → fix → new hash →
back to Step 0 for that fix → re-run the affected persona. When all ten are clean
on one hash, that hash is the sweep build.

## Step 2 and 3 — the two sweeps

Sweep 1: all 20 personas on the sweep hash. Sweep 2: all 20 again, same hash.
A persona passes with ≥9 in both. Any code change between or during sweeps voids
both. Cap: if a persona has not converged after the equivalent of five rounds,
report the failure pattern rather than keep spending.

## Tester report contract (the manager marks a case UNSCORED without these)

Verbatim, in this order:
1. Build hash and start time.
2. The story turn(s) — every message in which the person describes what happened.
3. Every draft card in full, first and revised, and the exact approval — a typed
   line, or "clicked Use this" (a card click IS an approval; record it as one).
4. The outcome question, the person's answer, the outcome draft, the approval.
5. Every decline and every later raise of that field, with the app's wording.
6. The final state JSON (`window.__state`).
7. A list of anything said in character that is not on the persona sheet. Do not
   improvise facts (dates, illnesses, phone numbers). If the sheet is silent, say
   "I don't know" in character.
No self-scoring. No summaries in place of transcript.

## Scoring precedents set in phase 1 (apply them the same way)

- **Cap at 5** is for an invented *value*: a number, a date, a position on a
  remedy (case 8 r2 "I am not chasing compensation" against not_sure). Added
  colour or an added request in an approved draft is **−1 under B**, no cap
  (case 20 r3 "because they sounded official"; 17 "with reasons"; 18 menu items).
- A defect the person had to work around on that run is a deduction on that run,
  whatever the run was launched to check (case 8 r3, the future-date turn). A
  defect the run surfaces that the person never met is a finding, not a deduction.
- Resolving a year the person left off ("around the 15th of August" → 15 August
  2026) is normalisation, the same as `inferYear` in code — not an invention.
- A coaching menu is fine; the line is crossed only when the draft contains a menu
  item the person did not pick.
- "They called me" and "I've been ringing to chase it" are not complaints. Yes=true
  only when the person says they raised it.
- An honest blank after a decline is not a field error under A. A required field
  may be returned to once, with a reason; a third ask is a C-2 deduction.
- Two questions in one turn is a C-3 deduction, including a correction bundled
  with the next field.
- `lodging_for: "self"` pre-ticked is by design (single-complainant scope); not a
  deduction. Note it if a panel screenshot is reviewed.

## Known edges, documented rather than fixed

- ~1% of decline turns: a parse failure on the very turn the person declines
  loses the patch carrying `declined`, so the field is asked once more. If a sweep
  shows it, score it and the lead adds the heuristic.
- The assistant sometimes speaks for AFCA's process ("AFCA can sort that out with
  Latitude from the account number"). Not a prediction of a decision; watch that
  it never becomes one.
- SCAMS classifier boundary: deception-into-paying triggers the 2027 notice;
  unauthorised use does not (verified on cases 3 and 14). A fake-merchant card
  dispute triggers it (probe only). Keep checking 3 and 14 in the sweeps.

## Persona coverage at close

| Persona | Runs | Last score | Status |
|---|---|---|---|
| 1 super-tpd | 0 | — | never run |
| 2 credit-hardship | 0 | — | never run |
| 3 unauth-transactions | 1 | 10 | pre-freeze |
| 4 bnpl-fees | 0 | — | never run |
| 5 default-listing | 1 | 8 | pre-freeze; found defects 15, 16, card dead-end |
| 6 general-insurance | 1 | 10 | pre-freeze; found defect 15 |
| 7 firm-initiated-contact | 3 | 10 | pre-freeze |
| 8 impossible-date | 3 | 10 | pre-freeze; sheet rewritten |
| 9 negated-complaint | 0 | — | never run |
| 10 stray-reference | 0 | — | never run |
| 11 unknown-firm | 2 | 10 | pre-freeze |
| 12 ambiguous-firm | 0 | — | never run |
| 13 everything-at-once | 0 | — | never run |
| 14 terse | 1 | 10 | pre-freeze; invention trigger not exercised |
| 15 skip-and-return | 0 scored | — | never scored; tests `declined` |
| 16 changes-mind | 1 | 10 | pre-freeze |
| 17 edits-draft | 1 | 9 | pre-freeze; found "with reasons" |
| 18 not-sure-compensation | 1 | 9 | pre-freeze; found menu-item drafting |
| 19 distressed | 1 | 10 | pre-freeze |
| 20 scam-complaint | 2 | 9 | r3 unscored, r4 9; found card dead-end |

## Files

- `rubric.md` — scoring rubric and preconditions.
- `personas.md` — the twenty fact sheets; 5 and 8 updated at close.
- `scores.md` — the ledger; append, never rewrite.
- `defects.md` — the lead's defect write-ups.
- `transcripts/` — raw tester captures where saved.
- `resumption-plan.md` — this file.
