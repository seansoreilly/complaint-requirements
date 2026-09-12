# Explainer script — for review

Edit this file, then tell me to rebuild. I read the narration and captions
straight from here, regenerate the affected audio clips, retime the beats to
total exactly two minutes, and re-render.

**Audience:** a recruiter at AFCA. Not a technical audience.

**Rules this draft follows** (agreed before writing it):

- No first person — nothing says "I built" or "I chose".
- Each constraint names the easy alternative it rejected: *"It would be easy to
  X. It does Y instead."* That signals a decision without needing an author.
- No jargon: no schema, patch, state, model, JSON, extractor.
- Ends on the complainant, not on the engineering.
- No spoken disclaimer — the on-screen banner covers it.

**Editing notes:**

- Narration and caption should not be word-for-word identical — hearing and
  reading the same sentence at once is grating.
- Keep captions short. They sit in the lower third and compete with the voice.
- Length is the constraint: the nine beats plus the two cards have to fit two
  minutes. Longer lines here mean less breathing room, not a longer video. If
  something will not fit, I will say so rather than speed the voice up.
- Spelling matters for the voice: write **A F C A** as separate letters (spelled
  "Afca" it is read aloud as "Africa"), and numbers as words ("one oh six five
  seven"), or they are read as quantities.

---

## Title card

**Narration:**
> This is Complaint Concierge. A complaint form you can talk your way through.

**On screen:**
- Eyebrow: `A complaint form you can talk your way through`
- Title: `Complaint Concierge`
- Subtitle: `Nobody should give up on a complaint because the form asked too much.`

---

## 1 — The form as it stands

**Narration:**
> A complaint to A F C A runs to eight stages of questions. It's a lot to face
> when you're already frustrated, and a lot of people stop partway.

**On screen:**
- Title: `Eight stages of questions`
- Body: `A lot to face when you're already frustrated.`

---

## 2 — It listens first

**Narration:**
> So it doesn't start by asking. It starts by listening — one sentence, in your
> own words.

**On screen:**
- Title: `It listens first`
- Body: `One sentence, in your own words.`

---

## 3 — One sentence, eight answers

**Narration:**
> That one sentence filled eight answers at once. The firm, the date, how they
> were contacted, the service, the product, and what went wrong. Filling that by
> hand means working through three separate sections.

**On screen:**
- Title: `One sentence, eight answers`
- Body: `The firm, the date, the service, the product, what went wrong.`

---

## 4 — The part people stall on

**Narration:**
> Then it offers to write the hardest part. "Tell us about your complaint" is the
> box people stall on, and it's written here from what was already said.

**On screen:**
- Title: `The part people stall on`
- Body: `Written from what was already said.`

---

## 5 — It waits to be approved

**Narration:**
> It would be easy to drop that straight into the form. It waits to be approved
> instead — because a complaint should say what the person meant, not what an
> AI assumed.

**On screen:**
- Title: `It waits to be approved`
- Body: `Easy to fill in automatically. It asks first instead.`

---

## 6 — "I don't have one" is an answer

**Narration:**
> The easy thing would be to insist on an account number. "I don't have one" is
> accepted instead. The question is marked and doesn't come back.

**On screen:**
- Title: `"I don't have one" is an answer`
- Body: `Marked, and not asked again.`

---

## 7 — Leave anything for later

**Narration:**
> Anything can be left for later. The conversation moves on, and every answer can
> be typed in directly whenever it suits.

**On screen:**
- Title: `Leave anything for later`
- Body: `Or type any answer in directly.`

---

## 8 — The member number isn't guessed

**Narration:**
> The firm's details aren't guessed at. The member number comes from a directory
> the app looks up — a made-up name would get an honest "not found" rather than a
> number that looks convincing.

**On screen:**
- Title: `The member number isn't guessed`
- Body: `Looked up, not invented.`

---

## 9 — Yours to check and keep

**Narration:**
> At the end, everything's in one place to check over, print, and send to A F C A.

**On screen:**
- Title: `Yours to check and keep`
- Body: `Check it over, print it, take it to AFCA.`

---

## Outro card

**Narration:**
> Nobody should have to give up on a complaint because the form asked too much of
> them.

**On screen:**
- Headline: `Nobody should have to give up on a complaint because the form asked too much of them.`
- Button: `complaint-requirements.vercel.app`
- Footnote: `Demonstration only — not affiliated with AFCA. Demo data throughout.`

---

## What changed from the published version

| Was | Now | Why |
|---|---|---|
| "The complaint form is the schema, the conversation is the interface" | "A complaint form you can talk your way through" | Jargon in the first line. |
| "The model never owns the state. It proposes a patch…" | "Nobody should have to give up on a complaint…" | The line you flagged. Ends on the person instead of the architecture. |
| "The draft is held, not written" | "It would be easy to drop that straight in. It waits to be approved instead" | States the rejected alternative, so it reads as a decision. |
| "I don't know is a real answer" | "The easy thing would be to insist on an account number…" | Same pattern. |
| "a directory lookup in code — not from the model" | "a directory the app looks up" | No jargon, and avoids implying the real AFCA member registry. |
| "as plain text, as JSON, or printed" | "check over, copy, or print" | JSON means nothing to this audience. |
| Swap-the-schema reusability point | Cut | You chose to end on the person rather than the engineering. |

## Decisions recorded

**Beat 9 says "send to AFCA".** The app has no submission path — "Copy to AFCA
form" puts plain text on the clipboard, which the person then pastes into AFCA's
real form themselves, and the page states twice that nothing is submitted. The
line was flagged as claiming a capability the app does not have; you chose to
keep it. Recorded here so the decision is visible rather than forgotten. The
on-screen caption reads "take it to AFCA", which stays accurate.

## One thing I would still change

The narration never says the firms are fabricated. The on-screen banner does say
so in every frame, but it sits at the top while the captions sit at the bottom —
someone reading captions on a laptop may not read it. Four seconds ("the firms
here are made up") would remove any chance an AFCA recruiter briefly wonders
whether the data is real. You decided against it; noting it here so the decision
is visible rather than forgotten.
