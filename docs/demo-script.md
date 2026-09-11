# Three-minute demo

Live at https://complaint-requirements.vercel.app, or run `npm run dev` locally. No API key needed — the offline
extractor covers every step below. The mode pill in the header says which brain
is live.

## 1. One paragraph fills the form (~40s)

Click **Paste the demo story**, then Send:

> I emailed AustralianSuper on 3 Sept about my insurance being cancelled
> without warning and they still haven't replied to me about it at all.

Watch the right pane. Eight fields fill at once: the firm, that they complained,
the date, the method, that no final reply came, the service type, the product,
and the issue. The AFCA member number (10657) appears — resolved from the
directory in code, not written by the model.

**The point:** they typed one sentence. Filling that by hand is eight fields
across three of the form's eight stages.

## 2. The assistant writes their complaint (~40s)

A card appears in cream with a yellow border: the drafted "Tell us about your
complaint" text, in their words. Edit a line in the textarea, then **Use this**.

**The point:** this is the hardest box on the real form and the reason people
abandon it. The draft is *held* — it only reaches the form on approval, and the
person can rewrite it first.

## 3. "I don't know" is a real answer (~20s)

When asked for a reference number, type:

> I don't have an account number

The field disappears from the form and is never asked again.

## 4. Coaching a vague wish into an outcome (~40s)

Click **Seeking compensation?** in the right pane, answer `not sure`. Then when
asked what would be fair:

> I just want it fixed

The assistant proposes a concrete statement built only from what it already
knows, for approval.

**The point:** "I just want it fixed" is not something AFCA can act on. This
turns it into something that is, without inventing a grievance.

## 5. Skip and come back (~20s)

When asked for date of birth:

> I'd rather not say right now

The conversation moves on. Later, click **Date of birth** in the form panel and
type it directly — every field is both a steering target and an input.

## 6. Review and export (~20s)

Click **Review** in the header. The summary mirrors the real form's step 8.
**Copy to AFCA form** puts plain text on the clipboard; **Download JSON** saves
the state; **Print summary** hides the chat and prints the form alone.

## What to say at the end

The AFCA form is the demo case, not the product. The schema is one file
(`lib/schema.ts`). Swap it and the same engine runs a council request, a CAV
notice, or a grant application.
