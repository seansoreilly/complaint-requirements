# Complaint Concierge — live-brain defects

Found by driving the real app in a browser against the live Claude brain
(`ANTHROPIC_API_KEY` set, `/api/chat` reporting `mode: "claude"`), not the mock.
Branch: `staging`. All 216 unit tests passed with every defect below present —
they exercise `lib/mock-brain.ts`, and these live only on the real-brain path.
That is the single most useful thing this exercise established: the suite and
these failures were on opposite sides of the mock/real boundary.

**All ten are fixed on `staging`, each verified against the live brain rather
than only the mocked suite.** 224 tests green.

| # | Defect | Found | Fixed in |
|---|---|---|---|
| 0 | Every live turn returned 400 (49 optionals vs a 24 grammar cap) | before round 1 | `fix-turn-schema-grammar-limit`, merged |
| 1 | One bad patch field discarded the whole turn, reply included | round 1 | `lib/model.ts` — reply and patch parsed separately |
| 2 | A declined optional question read as never asked, so it repeated | round 1 | `sensitive_offered` flag |
| 3 | The firm-initiated-contact rule existed only in the mock brain | round 1 | `lib/prompt.ts` EXTRACTION |
| 4 | A scam complaint was processed as an ordinary one | round 2 | `lib/prompt.ts` SCAMS |
| 5 | The model omitted `reply` on ~2% of turns | round 2 | `.describe()` on both fields; empty fallback — mitigated, not eliminated, see below |
| 6 | The unmatched-firm note repeated once history slid past it | round 2 | `firm_note_said` in state |
| 7 | A firm correction was refused; the wrong firm reached export | round 2 | `lib/prompt.ts` firmFacts |
| 8 | Drafts added sentences the person never said | round 2 | `lib/prompt.ts` DRAFTING |
| 9 | An outcome draft contradicted the compensation answer | round 2 | `lib/prompt.ts` DRAFTING |
| 10 | A correction turn asked two questions at once | round 2 | `lib/prompt.ts` STYLE |
| 11 | The model was never told today's date, and talked someone out of a correct one | round 3 | `lib/prompt.ts` `todayFact()` |

Three of these — 3, 4 and 7 — share a shape worth naming. Each was a rule that
read as enforced but was not: one lived in the mock brain production never runs,
one in a markdown file, and one was a safety rule the model over-applied. A
constraint is only enforced where the live path can see it.

Defect 11 is the same shape again, and the sharpest example: the *code* knew
today's date and the model did not, so the model dated things from its training
data and argued with someone who had it right.

---

## 11. The model was never told today's date

**Severity: high. Intermittent. Found in round 3.**

`lib/prompt.ts` contained no date. `coerceDate` and `isFuture` in `lib/patch.ts`
have always taken one (`today = new Date()`), so the *code* has never been
confused — but nothing told the model, which therefore dated everything from its
training data.

Observed live (round 3, case 08). The person corrected an impossible "31
February" to **28 February 2026**. The app told her that date was in the future
and pressed her to change the year to 2025 — seven months *after* the date had
actually passed. She pushed back in character and it conceded and stored
`2026-02-28`, but she had to argue to keep her own correct date.

This is worse than a rejected date. A refused date leaves a field empty and
visible; a confident, authoritative-sounding correction gets accepted, and the
wrong year is signed. The failure mode is the app persuading someone out of
something true.

**Fix:** `todayFact()` states the date in long form and ISO at the top of the
prompt, with the rule that follows from it — check a date against today before
calling it future, and never press someone to change a year that is already
right. The date is injectable (`PromptContext.today`) so a test can pin it.

**Verified both directions on the live brain:**
- 28 February 2026 → accepted without argument, stored `2026-02-28`.
- 15 December 2026 → still caught, now showing its working: *"15 December 2026
  is still a few months away (today is 12 September 2026)"*, and the field left
  empty rather than filled with a guess.

**Regression tests:** `lib/__tests__/prompt.test.ts` pins both the date's
presence (with an injected `today`) and the never-press-them rule.

---

## 1. Turn parse failure discards a good reply — and re-asks what the person just declined

**Severity: high. Intermittent.**

`lib/model.ts` validates the model's tool call with a single schema covering both
`reply` and `patch`:

```ts
const turnSchema = z.object({ reply: z.string(), patch: patchSchema });
const result = turnSchema.safeParse(call?.input);
const parsed = result.success ? result.data : null;
if (!parsed) {
  return { reply: "Sorry — I didn't catch that.", patch: {}, mode: "claude" };
}
```

Any validation failure anywhere in the patch throws away the **entire turn**,
including a perfectly good reply. Two observed consequences:

**(a) Mid-form — the serious one.** `patch: {}` means state is unchanged, so
`ensureAsk` (`lib/continue.ts`) appends the outstanding question — which is the
question the person just answered or declined. Verified output:

> Person: "I'd rather not say right now."
> App: "Sorry — I didn't catch that. **What's your date of birth?** AFCA uses it to confirm your identity."

This breaks the README's "a skip is respected at once and never pressed twice in
a row" guarantee in **code**, not in the model, and it fires exactly when someone
sets a boundary.

**(b) At completion.** With the form complete, `outstandingPrompt` returns `null`,
so nothing is appended and a finished conversation ends on a bare apology instead
of pointing at the review/export step. Observed twice:

> Person: "No, I'll skip those, let's move on." → "Sorry — I didn't catch that."
> Person: "Yes, that all looks right. Go ahead." → "Sorry — I didn't catch that."

**Cause: settled in round 2 — see defect 5.** The model omits the `reply` field
entirely on ~2% of turns (`stop_reason: "tool_use"`, patch present, reply
absent). Neither candidate below was the cause, though candidate 1 remains a
real latent flaw worth fixing. Original hypotheses, kept for the record:

1. *Schema strictness.* `lib/patch.ts:77-81` types `pronoun`, `support_needs`
   and `currently_experiencing` as bare `z.string()` while `interpreter` is
   `.nullable()`. A model recording a decline naturally emits `null`. Confirmed
   by direct test that `{reply: "...", patch: {complainant: {pronoun: null}}}`
   fails the whole `turnSchema.safeParse`.
2. *Truncation.* `max_tokens: 16000` with `thinking: {type: "adaptive"}`. Both
   real failures occurred ~20 turns deep with long history; 6/6 replays of the
   identical message with **empty** history succeeded. Suspect the thinking
   budget consumes the allowance and the tool call truncates
   (`stop_reason: "max_tokens"` → partial/absent tool input).

A `console.error("[turn-parse-failed]", ...)` logging `stop_reason`,
`result.error.issues` and the raw tool input is already added on `staging` to
settle this.

**Suggested fix (correct regardless of cause):** parse `reply` and `patch`
separately. Keep the model's reply whenever `call.input.reply` is a string, and
only zero the patch when the patch fails — `parsePatch` already coerces what it
can and returns `issues` for the rest. One bad optional field should cost a
field, not the whole turn. Separately, make the three sensitive string fields
`.nullable()`, raise `max_tokens`, and give the completion case a real ending
("that's everything — here's your review") instead of the bare fallback.

**Regression tests to add:** a tool input with `pronoun: null` plus a valid reply
must yield the reply and an issue, not the fallback; and a parse failure
immediately after a decline must not re-ask the declined field.

---

## 2. A declined optional question is invisible, so the app keeps re-offering it

**Severity: medium. Deterministic.**

`lib/next.ts:105` decides whether the sensitive questions have been offered by
checking whether any of them holds a **value**:

```ts
export function sensitiveOffered(state: ComplaintState): boolean {
  const c = state.complainant;
  return (
    c.pronoun.trim() !== "" || c.interpreter !== null ||
    c.support_needs.trim() !== "" || c.currently_experiencing.trim() !== ""
  );
}
```

Someone who **declines all four** leaves every value empty, so this returns
`false` forever — indistinguishable from never having been asked. `lib/prompt.ts:191`
then re-injects "You have not yet offered the optional questions… Offer them
ONCE" on every subsequent turn where `missing.length <= 4`.

The function's own doc comment says it "reports whether that has happened", but
it reports whether they were *answered*. Declining is the case the promise
matters most for, and it is the case that breaks.

Observed live: with a **complete** form, 5/5 replayed turns re-offered the
optional questions. The README promises they are "offered once, gently, never
pushed" and "never raise them again if they pass".

**Note:** `interpreter: false` *does* satisfy the check, so the state can express
"asked and declined" for that one field but not for the three text fields.

**Suggested fix:** record the offer rather than inferring it from answers — a
state flag the model sets on a decline, or detect the offer from conversation
history the way `shouldSayNote` (`app/api/chat/route.ts:97`) already does for the
firm note. Caveat on the history approach: `sanitiseHistory` caps at 20 turns, so
in a long chat the offer scrolls out and the instruction re-fires.

**Regression test:** state with all four sensitive fields empty *after* a decline
→ `buildSystemPrompt` must not contain "have not yet offered".

---

## 3. The firm-initiated-contact rule is missing from the live prompt

**Severity: high (latent). Not yet observed failing.**

The README's third constraint: the assistant records that someone complained to
the firm only when **they** made contact. "They called me last week" is the firm
acting, not a complaint — writing "I raised this with CommBank by phone" into a
document someone signs is described as the worst thing this product could do.

That rule is implemented in `readContactStance` in **`lib/mock-brain.ts` only**.
`lib/prompt.ts` never states it, so on the live path nothing tells the model.

In testing, the trap was passed — but only because the persona volunteered "I
haven't contacted NAB about any of this myself; they rang me, not the other way
round" inside a narrative turn. The model transcribed an explicitly stated fact
rather than reasoning from "they called me last week" alone. The mirror-image
guess (`yes: true` because *contact happened*) is the catastrophic one, and
nothing in the live prompt forbids it.

**Suggested fix:** one line in the EXTRACTION section of `lib/prompt.ts`:

> `complained_to_firm.yes` is true only when the person themselves contacted the
> firm. The firm phoning or writing to them is not a complaint — leave `yes` out
> of the patch until they say whether they have complained.

**Regression test:** a turn whose only evidence is "they called me last week"
must not produce `complained_to_firm.yes === true`.

---

## 4. A scam complaint is processed as though AFCA could consider it

**Severity: medium-high. Deterministic. Found in round 2.**

`docs/scam-complaints-note.md` sets out, with sources, why scams are out of
scope: AFCA cannot consider a Scams Prevention Framework complaint until
**31 March 2027** (Competition and Consumer (Scams Prevention Framework—External
Dispute Resolution) Authorisation 2026, s50(2)), and the SPF is multi-party in a
way this one-complainant-one-firm schema does not model.

That decision was documented and never implemented. `grep -ri scam lib/ app/`
returns **nothing** — the live prompt never mentions it.

Observed live (round 2, case 20). Opening message: *"It's CommBank I want to
complain about. I lost $12,000 to a scammer."* The assistant replied with
appropriate empathy — *"losing $12,000 to a scam is a serious thing to go
through"* — and then proceeded to fill in an ordinary complaint form, saying
nothing about scope. A person in that position is walked through a complete
complaint for a matter that cannot be lodged for another eighteen months.

This is the same shape as defect 3: a constraint that exists only in prose the
live model never sees.

**Suggested fix:** a short prompt section — recognise a scam, say plainly that
AFCA cannot consider scam complaints until 31 March 2027 and that this demo does
not model the multi-party shape, then offer to carry on recording it as an
ordinary service complaint against the bank if that is what they want. Do not
invent a scam pathway, do not dead-end, and do not promise a timeline. The note
itself argues the demo should be able to say this: *"which is itself a useful
thing for the demo to be able to say."*

**Regression test:** a message naming a scam loss must produce a reply
containing the 31 March 2027 limitation, and must not set a `scam` service type
(there is none).

---

## 5. The model sometimes omits `reply` entirely

**Severity: low (post-fix). Intermittent, ~2% of turns.**

Root cause of the "Sorry — I didn't catch that" replies, settled from the
`[turn-parse-failed]` log added for defect 1:

```
{"stop_reason":"tool_use","had_tool_use":true,
 "issues":[{"expected":"string","code":"invalid_type","path":[],
            "message":"Invalid input: expected string, received undefined"}],
 "raw":{"patch":{"firm":{"name":"AustralianSuper","reference":"444444"}}}}
```

`stop_reason` is `tool_use`, not `max_tokens`, and the tool input carries a
patch with **no `reply` field at all**. Neither of the original hypotheses (null
sensitive fields; truncation under a long history) was the cause — the model
simply omits `reply` on a small fraction of turns. Measured at 2 failures in 138
turns (~1.5%) across ten concurrent round-2 conversations.

Post-fix this costs only the reply text: in the example above the firm name and
reference `444444` were still applied to the form. Pre-fix the whole turn was
discarded.

**Fix applied:** the tool schema marked `reply` required and then said nothing
about what it was for, so both fields now carry `.describe()` (it flows through
`z.toJSONSchema` into the tool definition). The mid-form fallback is an empty
string rather than an apology, so `ensureAsk` supplies the outstanding question
and the conversation carries on.

**Outcome: mitigated, not eliminated — say so rather than claiming a cure.**
Measured over ~310 live turns across rounds 2 and 3: 2 occurrences before the
fix, 1 after. That is roughly 2% down to roughly 1%, on a sample too small to
call the difference real. The model still omits `reply` sometimes.

Later observation, recorded with its boundaries rather than as a new rate: since
log line 682 — before the phase-2 batch — **202 consecutive turns on 39c38bb
with zero parse failures**, under nine-way concurrency, no non-200 responses,
turn latency unchanged at 3-4s. That is a good sign and not a new number. Zero
in 202 bounds the rate at roughly under 1.5% with any confidence, which is not
distinguishable from the ~1% above, so the figure stands. The whole-run total
(8 failures in 673 turns) must NOT be quoted as the current rate: it spans
pre-fix builds and would flatter this one.

What did change is what the person sees. With the reply empty, `ensureAsk`
returns the outstanding question on its own — verified: a mid-form omission now
renders as "Which financial firm is your complaint about? A name, ABN or ACN all
work." rather than "Sorry — I didn't catch that." The turn still costs the
model's own wording, but it no longer costs the person an apology for something
they said perfectly clearly, and the patch from that turn is applied either way.

If the rate matters more than the symptom, the next lever is a retry: on a tool
call with no `reply`, call once more before falling back. Not done here — one
extra round trip on 1% of turns is a real latency cost for a cosmetic gain, and
the symptom is already handled.

---

## 6. The unmatched-firm note repeats once the history window slides

**Severity: low. Deterministic given a long-enough conversation. Found in round 2.**

`shouldSayNote` (`app/api/chat/route.ts:102`) suppresses the "not in this demo's
firm directory" note by checking whether the assistant has already said it — but
it can only check the history it is given, and `sanitiseHistory` caps that at
`.slice(-20)` (`app/api/chat/route.ts:48`). Once the opening turn scrolls out of
that window, the note looks unsaid and is emitted again.

The code anticipates this in its own comment: *"in a very long conversation the
note can surface once more after it scrolls out — rare, and harmless for a
demo."* Round 2 shows the estimate is too optimistic. Case 11 (Bendigo Bank) was
an ordinary completed complaint — about 11 user turns, ~22 history entries — and
the note fired a second time, unprompted, at the export step:

> **USER:** No attachments, please export as is
> **ASSISTANT:** "Bendigo Bank" isn't in this demo's firm directory, so there's no member number to attach. The rest of the form still works.
> Done — no attachments, and your complaint is finalised...

So it is not a pathological-length edge case: any complaint that reaches review
will exceed 20 history entries. It reads as the assistant forgetting what it has
already told you, one turn after it said "I won't ask again" about something
else.

**Suggested fix:** record the fact in state rather than inferring it from a
sliding window — a `firm_note_said` flag set when the note is emitted, cleared
when `firm.name` changes. That is the same shape as the `sensitive_offered` fix
for defect 2, and for the same reason: a fact about what was said belongs in
state, not in a window that slides.

**Regression test:** a state whose history no longer contains the note, with the
flag set, must not re-emit it.

---

## 15. Two fields are ticked as answered without ever being asked

**Severity: low-medium. Deterministic. Found in round 5 (case 06). `notify_by`
FIXED in bd17316; `lodging_for` left to the owner — see the verdict below.**

`complainant.lodging_for` defaults to `"self"` and `complainant.notify_by` to
`"email"` in `emptyState()` (`lib/schema.ts:82`). Both are required fields, and
`missingFor()` therefore never lists them — verified: on a completely empty form
both return `false` for "missing". The form panel shows a green ✓ against each
from the moment the page loads.

The consequence is that a person can complete the entire conversation, read the
review, and export, having never been asked either question — while the document
asserts answers to both. Observed in case 06: the tester noted both ticked
without any chat turn asking them. They happened to be right for Rob.

`notify_by` is largely benign — email is a safe default and the review lists it.
`lodging_for` is not: someone lodging for a parent, or jointly with a spouse,
gets a form that says they are lodging for themselves and is never asked
otherwise. Nothing in `lib/` branches on the value, so a wrong answer is silent.

This is the same family as the invented-value defects — the form asserting
something on the person's behalf — but milder, because a default is a stated
design choice rather than a model guess, and the value is visible on the review.

**Options, not a recommendation:**
1. Leave it. Defensible: the README scopes the demo to a single complainant, and
   `lodging_for` is the field that would carry a scope the schema cannot model.
2. Ask `lodging_for` once, early. Costs a turn; makes the answer real.
3. Keep the default but drop the ✓ until it is confirmed, so the panel
   distinguishes "defaulted" from "answered".

Option 3 is the cheapest honest fix: it changes nothing about the flow and stops
the panel claiming an answer nobody gave.

**Verdict, after splitting the two halves (bd17316).** They are not the same
defect and should not have been written up as one.

`notify_by` is fixed. It starts blank, so it is asked like any other required
field; the wording already existed at `questions.ts:55` and nothing else
changed. The write-up above called it "largely benign" because email is a safe
default — that reasoning was wrong. The question is not whether the value is
plausible but whether the person gave it, and an exported document stating a
contact preference nobody was offered states something they did not say. That
is the same test every other defect here is measured against. Fixing it also
exposed that `lib/mock-brain.ts` had no extraction for the field at all: it
could not, since the field was unreachable. Added, gated on the field being the
one under discussion.

`lodging_for` stays as described, and option 1 stands. It is the field that
would carry a scope — a second complainant, an authority to act — that the
schema deliberately does not model, so making the question real without the
branch behind it would collect an answer the form cannot honour. That is a
product decision, not a bug fix.

---

## 16. A declined required field is asked again, in a form that allows no decline

**Severity: high. Deterministic. Found in round 2 (case 05, Marie Osei /
Latitude). FIXED in bd17316.**

Marie did not know which Latitude product her complaint was about. The
assistant handled it well:

> That's completely fine — I won't ask again. I'll leave the product blank.

Two turns later, after the closing summary, the app asked again — as a forced
multiple choice with no "not sure" option:

> Which of these fits best? Home loan, Personal loan, Credit card, ...

Marie pushed back in character: *"I already said I'm not sure - please just
leave it blank like you said you would."*

**This was not the model breaking its promise.** That wording is
`questionFor()` at `lib/questions.ts:29` — generated by code, appended by
`ensureAsk` in `lib/continue.ts:18`. I first wrote this up as a model slip; it
is not. `ensureAsk` appends `outstandingPrompt(state)` to any reply that does
not itself ask something, and `outstandingPrompt` took `missingFor(state)[0]`.
A skipped required field never leaves that list, so it sat at the head of the
queue permanently. The prompt was pushing the same direction underneath:
`describeMissing` emitted `Ask about: service.subtype` on every turn. The
re-ask was over-determined — which is why it is deterministic rather than the
~1% parse-failure event I initially suspected.

`lib/prompt.ts` has told the model "if they decline again, leave it" since the
beginning. There was no way to record that it had happened, so the instruction
could not be obeyed by anything.

**Fix.** State carries `declined: string[]`, following the existing
`firm.no_reference` / `sensitive_offered` idiom — the person's own statement,
recorded where code can honour it.

- `lib/next.ts` gains `askableFor()`: missing, minus declined. `nextField` and
  `groupedWithNext` go through it, so nothing that generates a question can
  raise a declined field. **`missingFor` is deliberately unchanged** — the
  field IS still blank, and the counter and the review panel should keep
  saying so. A refusal is not an answer, and the fix must not make the form
  claim otherwise.
- `lib/prompt.ts` marks declined paths `— declined, do not ask again` in the
  missing list rather than hiding them, and when everything left is declined,
  says so and points at review.
- `lib/patch.ts` reconciles: an invented path is dropped (the list controls
  what stops being asked, so a forged entry would silently retire a real
  question), and an entry whose field later holds a value is dropped, so
  "actually, it was a personal loan" still lands.

**Why it matters more than the annoyance.** From the tester's report: *"A less
assertive persona than Marie might have just picked a wrong answer (e.g.
'Personal loan') under pressure rather than push back, which would have
introduced a fabricated fact into the record."* The forced re-ask does not just
irritate — it manufactures answers, on a document the person signs. Marie
happened to be assertive. The defect is what happens to someone who is not.

**Residual edge, documented not fixed.** A parse failure on the very turn
someone first declines still produces one immediate re-ask: the model's patch
is lost, so `declined` was never recorded, and `ensureAsk` appends the question
to an empty reply. Roughly the parse-failure rate (~1%) times the number of
decline turns, so rare. The cheap heuristic if it ever shows up in a sweep is
to have `ensureAsk` skip a field whose `questionFor` text already appears in
the last assistant turn — the same shape as `shouldSayNote` in the route. Not
worth the code on current evidence; noted so the next person does not have to
rediscover it.

**How to close it, and how not to.** Count N in DECLINE TURNS, not personas: a
persona that declines twice contributes two. Record "not observed in N decline
turns" as the batches accumulate. Do not close it because a batch of personas
that decline came back clean — two such personas are perhaps four to six decline
turns, and at anything near 1% the expected number of failures in that sample is
well under one, so "not observed" there is evidence of nothing. It closes as
observed-not-reproduced only once N is large enough that a 1%-ish edge would
probably have shown, which means a few hundred decline turns — more than the two
sweeps will produce. In practice it stays open and documented through phase 2.
That is the right outcome: it is a known, bounded, rare re-ask rather than a
data-integrity risk, and the heuristic above is cheap to add the moment a
transcript actually shows it.

**Verification note.** The first regression test passed with the fix reverted.
Its reply ended *"Shall we move on to the review step?"*, so `endsWithQuestion`
returned true and `ensureAsk` never reached the append — the test exercised
nothing. Rewritten to end without a question, confirmed failing on reverted
code, then confirmed passing. Same false-positive shape as the `IMPERATIVE_ASK`
regex earlier in this run: a test that passes for the wrong reason is worse
than no test, because it certifies the bug.

---

## 17. Approving a draft card ends the conversation in silence

**Severity: high. Deterministic — every card approval. Found by the test manager
scoring cases 20 (round 4) and 5. Fixed in 5076d69. NOT VERIFIED LIVE.**

Clicking "Use this" on a draft card is handled entirely in the browser.
`approveDraft` (`app/page.tsx`) writes the field, clears the draft and appends a
canned line. It never calls `/api/chat`, so `ensureAsk` — the thing that stops a
reply trailing off with nothing to answer — does not run on that path at all.

What a person met:

> **[approves the narrative card]**
> "Added to your complaint. That's the part most people find hardest — it's done."

and nothing else, with the outcome and every contact field still outstanding.
Same after the outcome card: "Noted as the outcome you're seeking." then silence.
Two independent transcripts (case 20 round 4, case 5) recorded it, both times
immediately after the person had signed off on something.

This is the README's never-dead-end guarantee failing at the two most important
moments in the form — and it had been on every card-approved run on the ledger
(16, 3, 11, 14, 20, 5). It surfaced only when a tester wrote down that no
question appeared; the others knew the flow and typed on regardless, which is
exactly how a defect hides from people who know the system.

**Fix.** The outstanding question is computed inside the state updater, from the
reconciled state, and queued with `queueMicrotask` — the idiom `commitDate` a
few lines above already uses, and for the same reason: an updater may run twice
and must stay free of side effects.

The first version of this fix read the prompt into a variable and used it after
`setState`. It typechecked, all tests passed, and it was wrong: it assumes React
has run the updater by the next statement, which React does not promise. It
would have been the fourth fix in this run that was green in tests and dead in
the browser. Noted here because the mistake is more instructive than the fix.

**Why unverified.** The browser check was in progress when the API key hit its
spend limit. Live-check this before any score is banked against 5076d69:
approve a card mid-form and confirm a real question follows the canned line, and
approve the last one and confirm NO question follows.

---

## 18. A reasonable request nobody made, written into a signed outcome

**Severity: medium. Intermittent. Three instances across cases 17, 18 and 20
(round 3). Prompt line added in 5076d69. NOT VERIFIED LIVE.**

Three separate people had a remedy they never asked for written into an outcome
they then approved:

- Case 17: she asked for "the claim decided properly and back payments made".
  The draft said "give me a proper decision, **with reasons**".
- Case 18: Colin described what happened. The draft had him requesting "a
  review" and "a proper response" — both lifted from the app's own coaching
  menu, which he had not picked from.
- Case 20 (round 3): a motive — "because they sounded official" — he never gave.

DRAFTING already said not to add "the remedy you would ask for". That framing
missed all three, because each addition IS a remedy the person would plausibly
want. That is precisely what makes it dangerous: it reads as harmless, it is
easy to approve without noticing, and it goes onto a document they sign.

The rule now says so in terms — reasonable, obviously in their interest, and
previously offered by you are each still not the same as asked for, and options
the assistant listed are suggestions, not answers.

**Why unverified.** Prompt-only change; needs a live draft to confirm. It is also
the weakest kind of fix in this codebase — prose, not structure — so it deserves
a deliberate test rather than an assumption. Cases 17, 18 and 20 are the ones to
re-run.

---

## 19. "super fund" resolved to one particular super fund

**Severity: high. Deterministic. Found by probing the directory after persona 12
PASSED. Fixed in 3bfdd51.**

```
"super fund"          -> matched :: Hesta Super Fund   (member 11902)
"the super fund"      -> matched :: Hesta Super Fund
"my super fund"       -> not_found
"superannuation fund" -> ambiguous :: Hesta Super Fund
"super"               -> ambiguous :: AustralianSuper / Hesta / Rest
"bank"                -> ambiguous :: CBA / NAB / Westpac / ANZ
```

"super fund" is two tokens and both appear in "Hesta Super Fund", so it scored
1.0 and came back as a CONFIDENT match — firm name and AFCA member number 11902
— from a phrase that names no firm at all. Someone opening "it's about my super
fund" could carry Hesta's member number onto a complaint against a different
fund, and that is the field nobody double-checks, because it is the field the
app is trusted to supply.

The bug bites only firms whose names contain the generic words. The directory
has three (Hesta Super Fund, Rest Superannuation, AustralianSuper) plus the
"Banking Group" / "Banking Corporation" suffixes. "bank" was already safe
because no bank's name is *covered* by "bank" alone — which is exactly why the
fixed rule works.

**Cause.** `score` already refuses a candidate whose only hits are generic
words. The `allGeneric` exemption beneath it — written so "australian super"
could still rank — was switching that guard off for precisely the queries it
was meant to catch.

**Fix.** The test now applies to the MATCH, not the query: an all-generic query
settles on a firm only when it accounts for that firm's whole name. "australian
super" covers "AustralianSuper" once spacing is ignored and still resolves;
"super fund" covers only part of "Hesta Super Fund" and comes back as candidates
to ask about.

**Two wrong fixes on the way, both caught by the full suite, both now pinned by
tests so nobody narrows this again and rediscovers them:**
1. Refusing every all-generic query broke "australian super".
2. Refusing to return a single candidate as ambiguous broke typo correction —
   "Westpack" stopped resolving to Westpac. That is a worse outcome for a real
   person than the bug being fixed.

**How it was found, and why that matters.** Persona 12 passed. The app did ask
Helen which fund — but because "my super fund" is `not_found`, not because it
was ambiguous. Her sheet claimed that phrase was "verified ambiguous"; it was
not, on this build, so the trap that persona exists to spring had never fired in
any run. A passing test that tests nothing is the failure this exercise keeps
finding, and this time it was in our own fixtures.

A probe is not scoring evidence — only a browser transcript on a known hash is —
but it is a legitimate way to FIND a code defect. The fix is proven by unit
tests; the browser transcript comes from the rewritten persona 12, which reaches
the phrase through the editable form panel (`components/FormPane.tsx` onEdit →
the route resolves the firm on the next turn) rather than asking the model to
guess. The model has asked, correctly, every time it has seen a generic phrase,
so the ambiguous path is simply not reachable through chat.

Persona 12's earlier pass stays on the ledger as evidence of good model
behaviour and none at all about this guard.

---

## Context worth knowing

The reason all of this survived to now: **the live path was completely broken and
the test suite could not see it.** Every real-brain turn returned

```
400 invalid_request_error: Schemas contains too many optional parameters (49),
which would make grammar compilation inefficient … (limit: 24)
```

because the deep-partial patch schema was compiled into a structured-output
grammar. Fixed on branch `fix-turn-schema-grammar-limit` (commit 9d51e38, "Send
the turn as a tool call, not a structured output"), now merged into `staging`.
Its own commit message puts it plainly: *"the form only ever worked because no
deployment had an API key and so ran the mock brain."*

Every defect above is on the real-brain path only, which is why 216 green tests
say nothing about them.
