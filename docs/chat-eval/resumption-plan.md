# Resumption plan — live-brain chat evaluation, phase 2

Written 12 September 2026 at the end of phase 1, for whoever picks this up cold.
Phase 1 stopped because the Anthropic API key hit its spend limit; access returns
**2026-10-01 00:00 UTC**. Nothing below needs re-deriving — read this, then start.

## Where phase 1 ended

- Ledger: `scores.md` — 21 rows, strict tally **0 passed / 0 cleared once**.
  **Read that as a stopped clock, not a verdict.** Nobody reached the two-sweep
  phase; the app was never measured against the bar. Every run on the ledger was
  on a build later changed, because each one found something and it was fixed.
- Defects: `defects.md` — all fixed in code; 17 and 18 are marked NOT VERIFIED
  LIVE in their headings. Three fixes this run passed tests and did nothing in
  production, which is why Step 0 exists.
- Frozen build: **`39c38bb`** (2026-09-12 22:47 AEST) — the last commit that
  changed behaviour, and the behaviour under test. Documentation commits after
  it do not move the freeze and do not restart any count; a code, prompt, schema
  or data change does.
- Personas never run: **1, 4, 10, 13, 15**, plus **12**, whose only run skipped
  its trap (the tester answered "Rest" where the sheet says "my super fund" —
  the directory's ambiguous-match path has never fired in a browser). 2 ran
  clean but without a state capture; 9 ran clean and scored 10. The `declined` path has
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
   starts with the hash and the start time (record `Date.now()` on the first
   tool call; nobody in f1 had one).
5. Browser automation: each tester owns its own tab and passes its tabId on
   every call. Type into the chat box via an element ref from read_page or
   form_input, never by clicking pixel coordinates from a screenshot — f1-case09
   found the click silently fails to focus the textarea, typed text vanishes,
   and a message can be scored as sent when it never was. Confirm each message
   appears in the transcript before reading the reply.

## Step 0 — verify the two NOT-VERIFIED-LIVE fixes, in a browser, before anything else

If either is wrong, every sweep run is void, so these come first. One short
conversation each; a tester or the lead can drive it; the manager reads the
transcript.

**Fix A — defect 17, card approval no longer dead-ends** (`app/page.tsx` approveDraft, landed in 5076d69; frozen build is 39c38bb).
Run any persona to the narrative draft card, click **Use this**, and read the
assistant line that follows. Pass: "Added to your complaint…" is followed by a
question for the next missing field. Fail: the line ends without a question.
Repeat once for the outcome card ("Noted as the outcome you're seeking." must be
followed by a question). Observed failing on cases 5 and 20 round 4.

**Fix B — defect 18, the "even when reasonable" DRAFTING line** (`lib/prompt.ts`, landed in 5076d69; frozen build is 39c38bb).
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
  Also confirm the `declined` list survives a later decline (reconcile unions it
  since 2d7cc67, which is in the frozen build; before that a partial patch wiped
  earlier refusals) — persona 15 declines two fields, so it is the natural check.
  The header arithmetic ("Ready — 1 left blank ✓") landed in 39c38bb and is
  likewise NOT VERIFIED LIVE.
- **notify_by is asked**: any persona — "How would you prefer AFCA to contact you"
  must be asked before the summary; the tick must not be pre-filled.

If any of these fails: fix, commit, new hash, repeat Step 0. Do not start Step 1
on a hash with a known live failure.

## Step 1 — the unrun eight, then two clean re-runs (defect-finding)

Order, most likely to find something first:

| # | Persona | Why here |
|---|---|---|
| 1 | **15 skip-and-return** | Only test of the required-field return-once rule and `declined`. Watch item: between the first "I'd rather not" and the second, the field is still askable, so if any intervening reply trails off, `ensureAsk` re-asks it — count every raise of DOB and email and whether each carries a reason. |
| 2 | **12 ambiguous-firm** | "my super fund" must produce the disambiguation note and no member number until "Rest" → 11540. Tester: answer the firm question with **"my super fund"**, exactly — the f1 run answered "Rest" straight away and tested nothing. |
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
6. The final state JSON. Install a fetch interceptor on `/api/chat` before the
   first message that stores each response's `state` on `window.__state`, and
   guard it: only overwrite on a 200 with a JSON body carrying `state`, so a
   later 400 cannot clobber the last good value (that is how f1-case09 lost its
   final dump). Capture it **after every turn**, not only at the end — a closed
   tab loses it (f1-case12). If the interceptor never populates, fall back to
   reading the form panel with get_page_text after each turn, and **say which
   source a state came from**; a panel reading supports B and C but a run
   without a JSON state cannot be scored on field accuracy (f1-case02).
7. A list of everything said in character that is not on the persona sheet.
   The rule, settled at close: **facts are not improvised; colour may be.**
   - A fact is anything that becomes a field value or a sentence in a draft:
     an amount, a date, a duration, a reference number, an illness, a phone
     number, a remedy. If the sheet is silent, say "I'm not sure" in character.
     That tests something real — the app must handle a gap without filling it
     (cases 6, 11, 18 all passed exactly that test) — whereas an invented "$180"
     tests nothing and can mask a real invention if the tester later misremembers
     what they said. Case 20 round 3 was voided for an unlisted date.
   - Colour is register and framing that lands in no field — "it was just a
     normal customer service call", "it's been really stressful". Allowed, and
     the app is scored against what the transcript shows the tester said, not
     against the sheet.
   - Never improvise around the thing the persona exists to test. A run is
     voided when an improvisation dodges the trap (case 14: picking a category to
     avoid the trigger), replaces it (case 12: "Rest" where the sheet says "my
     super fund"), or supplies it unscripted (case 5's decline, now scripted).
   Whatever you improvise, of either kind, list it here.
8. A list of anything the assistant stated that the persona did not say — a phone
   number, an email, a full firm name, a date. Flag it; do not judge it. **The
   manager verifies every flag against `data/firms.json` before it becomes a
   finding.** Three phase-1 testers flagged the firm's complaints phone and
   email as invented; all three were verbatim from the directory, which the app
   is meant to offer. Likewise "ANZ" → "ANZ Banking Group" and "CommBank" →
   "Commonwealth Bank of Australia" is the directory's canonical name replacing
   the alias, by design. An unprompted number is the right thing to be
   suspicious of — and the wrong thing to score without checking.
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

## Status update — 12 September 2026, phase 2 opened early

The spend limit was raised the same night. Step 0 ran on 39c38bb and all four
checks passed (see the Phase 2 block in `scores.md`). Fix B's Step 0 check was
weak (no coaching menu was offered), so persona 18 is the real test and runs
early in Step 1.

**Then the freeze moved to 3bfdd51** (defect 19: "super fund" resolved
confidently to Hesta Super Fund via the directory's generic-word exemption).
Step 0 re-runs on 3bfdd51 — all four checks, per the rule that Step 0 is a
property of a hash — before anything counts. The nine runs launched on 39c38bb
are defect-finding rows. Persona 12's sheet was wrong ("my super fund" was never
ambiguous on this directory) and is rewritten: the ambiguous path is reached by
typing "super fund" into the panel's firm box, since the model correctly asks
rather than guesses. Add a fifth Step 0 check on any future hash: type "super
fund" into the firm box and confirm no member number appears.

**Then defect 20** (case 2 on 39c38bb): the model quoted its proposal in the
reply and never populated `drafts.*`, so no card appeared and the person
approved by typing "yes". Fix is a code guard in the route (a first write to
`complaint.narrative` / `outcome.fair_outcome` with no pending draft is diverted
into the draft) plus a prompt line. Sixth Step 0 check on any future hash: run
any persona to the story and confirm the proposal appears as a card with
Use this / Discard, never only as quoted text. Colour note for testers: vague
colour given as an outcome answer ("work with me on it") becomes vague lodged
text — give a concrete remedy or "I'm not sure", not filler.

**Then defect 21** (case 15 on 39c38bb): date and how written while
`complained_to_firm.yes` was still null; reconcile clears branch fields only on
an open→closed transition, so a later "no" left a complaint date on a form that
says no complaint. Fix in `reconcile`: blank any `showIf` field that does not
apply in `next` and was not touched, regardless of `previous`. Seventh Step 0
check on any future hash: say "I emailed them on 5 August 2026" before being
asked whether you complained, then answer that it was a query — confirm
`complained_to_firm.date` and `how` are empty.

**Freeze history in phase 2:** 39c38bb (nine p2 runs) → 3bfdd51 (defect 19) →
9966b2e (19b, the single-candidate note) → 1d49493 (defect 20, draft hold in
code) → 862a8c9 (defect 21, shut branch holds nothing) → **29991ee** (the
"saved" sentence corrected by the route on a diverted turn, plus the
clarify-then-draft STYLE line). Step 0 runs once on 29991ee with eight checks:
the seven, plus a story with a gap that invites a clarification (Iris's "I
emailed them on 5 August" line) — the question must come in its own turn and
the draft in a later one.

**Standing rule (adopted after the fourth prompt-only request the live path
ignored — date, chasing, `declined`, "saved"):** a prompt line is a request; if
the constraint matters, the route enforces it and the prompt line is the
courtesy. When a fix is proposed as "one prompt line", ask what the route does
if the model ignores it. Boundary: the route can enforce what it composes or
writes — a question it appends (defect 16), text reaching the form (20), a false
"saved" sentence (the 29991ee correction) — but it cannot stop the model raising
a subject (defect 22). For that class the prompt is all there is and the sweeps
are the enforcement: an unprompted re-raise of a declined field is a C-2
deduction.

Step 0 evidence for the sweep hash: `docs/chat-eval/step0-9ae75bf.txt` (hash at
the top, reply and state per check), regenerated at 6637d9d after the harness
assertions were tightened. The original check 3b returned false against the
real defect-22 reply — it would not have caught the thing it existed to catch —
and the replacement took four attempts, each of which read fine. So:
`docs/chat-eval/harness/verify_predicate.py` holds the five real replies the
re-ask predicate must classify (two defects to catch, two correct replies not
to flag, one legitimate first ask); run it after touching that function. The
rule it encodes: **a green check you have never seen fail is not evidence** —
the same finding as the app's own suite, three times this run.

**Then 9ae75bf → b8fa2f6** (defect 24: a declined field re-asked by ensureAsk one
turn later, because a first refusal left it askable; fixed with a `deferred`
list in state that askableFor skips until the end and surfaces once, closing
finding 23 too). Two lessons recorded on the way: a regex over the person's
current sentence cannot close a gap between turns (6015627, rejected), and a
test that puts the decline and the trail-off on one turn is green against the
bug (late-decline.test.ts, deleted). Step 0 on b8fa2f6: eight scripted/browser
checks plus the two-turn deferred test in the unit suite; personas 5 and 12 are
the browser evidence for it.

**Then b8fa2f6 → bac07c5** (defect 25, found by the server monitor mid-run: a
malformed turn — `patch` returned as a leaked tool-call fragment with
`deferred` beside it instead of inside — lost the deferral while the reply
promising to "come back to it later" still reached the person; the envelope
now salvages `deferred`/`declined` from the top level when the patch is
broken). The p4 runs of 5, 12, 20 started on b8fa2f6 finish as defect-finding
rows and re-run on bac07c5 after Step 0. Sweep hash: **bac07c5**.

**Then bac07c5 → 2f1e223 → (pending).** 2f1e223 carried the `deferred`/`patch`
describe() wording (a behaviour change — tool-schema text is prompt). The p4
re-runs of 5, 12, 20 on b8fa2f6 (8, 9, 9; all defect-finding) proved `deferred`
end to end twice and found four more defects, all person-facing: 26 the model
told Marie a listed firm was "not in this demo's firm directory" while the
route assigned its number (lib/prompt.ts no-firm branch invites the claim); 27
parsePatch's "Patch did not match the schema." rendered to the person
(app/page.tsx:85); 28 endsWithQuestion missing an ask for the third time and
stacking the full option list under a reply that already held it, on the one
return-with-reason turn; 29 a scam the person paid under deception filed as
"Unauthorised transactions" from a list the model composed for a stubbed type.
One commit for all four, then Step 0 with three added checks (a listed firm is
never called unlisted; a reply already carrying a field's options gets none
appended; Hugh's story yields no "Unauthorised transactions"), then 5, 12, 20
again. The sweep hash is that commit.

**Then 945a894 (26, 27) → 5490982 (28 `alreadyAsks`, 29 stubbed-type issues and
scam handling, no example fund names) → (retry commit, pending).** Step 0 on
5490982 went 9/10 then 10/10 on identical code: the failed check lost its draft
to a rejected patch, the defect-25 fragment shape, which is now firing at ~3.6%
of recent turns (5 in ~139; wide interval) against ~1% historically. Ruling:
retry once in runTurn on an unparseable patch only (not on a missing reply),
fall back as before if the retry fails, log both attempts and a per-build
counter (turns, fragment failures, successful retries) so the prompt-length
hypothesis (lib/prompt.ts grew ~11% today) can be tested with numbers after the
sweeps rather than guessed at now. That commit is **3f2bce0 — the sweep
build** (Step 0 10/10, evidence 626df3e; the retry fired once during Step 0
and recovered). Any code, prompt, schema, tool-schema or data change after it
restarts every count.

**Retry recovery is ~50%, not 100%** (4 retries in the first 50 sweep-build
turns: 2 recovered, 2 failed twice; one of the failures cost Hugh's outcome
draft on p5 case 20). Ten fragments across the run hit five different fields,
so it is a general serialisation failure, not one schema entry; and a retry on
identical input reproduces it about half the time, so it is closer to
deterministic-given-input than to noise. Two of the ten carried `drafts` — the
longest strings in any patch — which is the hypothesis to test first: log the
raw envelope length on every fragment and compare with clean turns. Ruling:
build stays 3f2bce0; no second retry (two identical failures predict a third
and double the worst-case latency); decide on the prompt trim after sweep 1
with the counter's denominator. **Scoring rule for dropped turns during the
sweeps:** a turn the tester re-sent once under the mechanical rule is not a
deduction — it is a measured, mitigated limitation tracked on the row; two or
more dropped turns in one run cost the C-1 point (the experience degraded); a
reply that claims a card is waiting when none appeared is noted on the row as
the "saved" family and goes on the post-sweep fix list (the route can detect a
promised draft that did not land, as it already does for "saved").

**Then 3f2bce0 → (defect 30, pending).** The p5 re-runs on 3f2bce0: 5 = 10 and
12 = 9, the first clearances that could count. 12 found defect 30: Helen's
one-word "Rest" to "do you know which fund it is?" was read as a deferral of
the firm name (the reply before had offered to defer it), and she had to answer
twice. Fix is a deterministic route guard — an unresolved firm plus a message
of at most three words that lookupFirm matches confidently sets firm.name
before the model speaks — plus a prompt line that the firm name is never
deferred. The lead could not reproduce it in three attempts (bare state, and
the refusal-heavy history), so it is one misread in four observed. **Freeze
rule refined:** a defect moves the hash only when it is reproducible — a
failing test or repeatable live; an unreproducible single observation is a
watchlist item with its fix specified, promoted on a second instance. Defect
30 is on the watchlist; the build stays 3f2bce0 and the 5 and 12 clearances
stand. Watch for a bare firm name read as a refusal in the sweeps.

**Convergence — the stop condition for this phase.** Every batch since 9ae75bf
found one new person-meets-it defect (24; 26/27/28/29; 30), each fixed, each
restarting the count; the rubric caps the exercise at five rounds and says to
report the failure pattern rather than burn the key. The pattern: the model's
conversational judgement produces a new class of misread each batch, and code
guards close them one at a time — correct engineering, and not something that
converges on two clean sweeps in one night. Proposal recorded: fix 30, Step 0,
one more batch of 5/12/20; if it is clean, sweep 1; if it finds another
person-meets-it defect, STOP, write the pattern up as phase 2's result, hand
over the ledger and this plan, and run the sweeps on a later day with the
fragment counter's numbers in hand.

**Sweep brief rule (mechanical, so it is not a judgement call):** after each
answer, glance at the panel; if the value you just gave did not land, re-send
the same message once and report it as "dropped turn (re-sent)" — not as a
defect. The monitor log, read after each batch, is the record of what was
dropped.

**Standing rule for scripted checks (third instance: the firm-status check
passed against the broken prompt because the model happened not to guess):** a
check that drives the live model tests what the model happened to do, not what
the app guarantees. Where the guarantee is code, assert it in the unit suite
(prompt text, route behaviour, state); keep the scripted check as a watchpost
for recurrence, never as the gate. Defect 24's check, the re-ask predicate and
the firm-status check all resolved this way.

**Known edge, from defects 5 and 25:** two defects this run were found by the
server-side monitor (`[turn-parse-failed]` logging) and not by any persona,
because the person experiences both as "the app just moved on" — nothing
visible is wrong on the turn it happens. Keep the monitor running during every
sweep and read its log after each batch; a persona transcript cannot show a
value that was never written.

**A reusable idea from defect 19:** when a code guard is only reachable through
a state the model never produces (it asks rather than guesses), reach it through
the form panel — the panel is directly editable and the route resolves the
client-sent state every turn. Any future guard the model routes around can be
tested the same way, without asking the model to misbehave.

**The nine p2 runs on 39c38bb** (13, 18, 10, 12, 9, 4 at 10; 2, 15, 1 at 9) are
all on the ledger as defect-finding rows. After them, only the two clean re-runs
(5 and 20) and persona 12 on its rewritten sheet remain before the sweep clock
can start on the next frozen hash.

## Known edges, documented rather than fixed

- A turn can fail with "The assistant is unavailable: Request timed out." while
  the turns either side return in 3-5 s. Measured: 0 in 18 solo turns, 2-4 per
  run under nine-way concurrency — it is load, not the app. Testers running in
  parallel should expect several per run: re-send the same message, note the
  count in the report, and do not report them as findings.
- Scripted runs (docs/chat-eval/harness/, against the live /api/chat) are for
  Step 0's state-level checks and for reproducing a defect while fixing it.
  They are NOT scoring evidence and do not count toward the bar: a script plays
  a fixed line, and the rubric's whole reason for personas over scripts is that
  the live brain varies its questions. The card click and the header text are
  invisible to the API and must be checked in a browser regardless.

- ~1% of decline turns: a parse failure on the very turn the person declines
  loses the patch carrying `declined`, so the field is asked once more. If a sweep
  shows it, score it and the lead adds the heuristic. Count N in DECLINE TURNS as
  batches accumulate; do not close it on a clean batch of two declining personas
  (four to six decline turns is far too small for "not observed" to mean
  anything). See defects.md under defect 16.

- Concurrency does not slow the app. Measured on 12 September with nine testers
  running at once: turn latency 3-4 s, identical to single-user, no non-200
  responses, and 202 consecutive turns with zero parse failures. So a slow or
  failed turn during a sweep is not "the other testers" — investigate it as
  itself.
- The assistant sometimes speaks for AFCA's process ("AFCA can sort that out with
  Latitude from the account number"). Not a prediction of a decision; watch that
  it never becomes one.
- SCAMS classifier boundary: deception-into-paying triggers the 2027 notice;
  unauthorised use does not (verified on cases 3 and 14). A fake-merchant card
  dispute triggers it (probe only). Keep checking 3 and 14 in the sweeps.

## Persona coverage at close

| Persona | Runs | Last score | Status |
|---|---|---|---|
| 1 super-tpd | 1 | 9 | p2 on 39c38bb; clarify-then-draft bundled; sheet's "compensation: yes" vs her "nothing extra" to settle |
| 2 credit-hardship | 2 | 9 | p2 on 39c38bb; found defect 20 (no draft card); clarify-then-draft bundled |
| 3 unauth-transactions | 1 | 10 | pre-freeze |
| 4 bnpl-fees | 1 | 10 | p2 on 39c38bb; no_reference path clean |
| 5 default-listing | 3 | 10, 8 | p3 on 9ae75bf 10 (superseded); p4 on b8fa2f6 8 — `deferred` proven, found 26, 27 |
| 6 general-insurance | 1 | 10 | pre-freeze; found defect 15 |
| 7 firm-initiated-contact | 3 | 10 | pre-freeze |
| 8 impossible-date | 3 | 10 | pre-freeze; sheet rewritten |
| 9 negated-complaint | 2 | 10 | p2 on 39c38bb; negation → false, note once, kept going |
| 10 stray-reference | 1 | 10 | p2 on 39c38bb; no stray word stored |
| 11 unknown-firm | 2 | 10 | pre-freeze |
| 12 ambiguous-firm | 4 | 9, 9 | p3 on 9ae75bf 9 (trap fired and held; found 24); p4 on b8fa2f6 9 (`deferred` proven; found 28) |
| 13 everything-at-once | 1 | 10 | p2 on 39c38bb; six fields from one paragraph, nothing re-asked |
| 14 terse | 1 | 10 | pre-freeze; invention trigger not exercised |
| 15 skip-and-return | 1 | 9 | p2 on 39c38bb; return-once with reasons held; found defect 21 (branch fields written while closed) |
| 16 changes-mind | 1 | 10 | pre-freeze |
| 17 edits-draft | 1 | 9 | pre-freeze; found "with reasons" |
| 18 not-sure-compensation | 2 | 10 | p2 on 39c38bb; Fix B proven on the menu path |
| 19 distressed | 1 | 10 | pre-freeze |
| 20 scam-complaint | 4 | 10, 9 | p3 on 9ae75bf 10 (superseded); p4 on b8fa2f6 9 — found 29 |

## Files

- `rubric.md` — scoring rubric and preconditions.
- `personas.md` — the twenty fact sheets; 5 and 8 updated at close.
- `scores.md` — the ledger; append, never rewrite.
- `defects.md` — the lead's defect write-ups, all 18, headings not in numeric
  order (they were written up as found).
- `transcripts/` — raw tester captures where saved.
- `resumption-plan.md` — this file.
