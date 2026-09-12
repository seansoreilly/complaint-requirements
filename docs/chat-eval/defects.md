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

Three of these — 3, 4 and 7 — share a shape worth naming. Each was a rule that
read as enforced but was not: one lived in the mock brain production never runs,
one in a markdown file, and one was a safety rule the model over-applied. A
constraint is only enforced where the live path can see it.

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
