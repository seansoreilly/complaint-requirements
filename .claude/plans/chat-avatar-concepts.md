# Chatbot icon as a cute animated character — findings

**Question:** should the assistant have a cute animated character as its icon, and if so, what?

**Status:** decided and shipped. **C (Sunny)** is now the assistant's avatar in the real
chat (`components/Assistant.tsx`); the prototype scaffolding and the other two concepts
have been deleted. This document is the record of why — the variants and the
`?variant=` switcher it describes no longer exist, so read it as history, not as
instructions.

## First, a scoping correction

There is no floating chat-launcher bubble in this app to put a character on. The chat is a
full pane (`components/ChatPane.tsx`), always open, side by side with the form. So "the
chatbot icon" can only mean one of:

1. **An avatar beside the assistant's messages** — the character has a face, reacts while
   thinking, and is present through the whole conversation. This is what I prototyped.
2. A mark in the header next to "Complaint Concierge" (`app/page.tsx:171`) and/or the
   favicon. Cheap follow-on once a character exists; not prototyped.

## How to look at it

`npm run dev`, then `http://localhost:3000` — the character is on the assistant's
messages. It was chosen by comparing three concepts side by side against the avatar-less
baseline; that comparison harness has since been removed.

## The three concepts

| | Concept | Idle | Thinking | Speaking | Verdict |
|---|---|---|---|---|---|
| **A** | **Pip** — folded paper crane | bobs | dips its head | wing flaps | ✗ Doesn't survive the size |
| **B** | **Nib** — fountain-pen nib with a face | slow tilt | ink drop forms and falls | smile moves | ✗ Reads wrong |
| **C** | **Sunny** — a small sun | rays breathe | rays rotate | face warms | ✓ **Recommended** |

**A — Pip.** The idea was papercraft: "we fold your story into a form". At 96px it's
pleasant. At 30px — the size it actually ships at — the folded facets collapse into a
blue smudge that reads as a fragment of a paper plane, not a character. The face is a
single 1.6px dot; there is nothing to warm to. Killed by the contact sheet.

**B — Nib.** The most literal: the thing filling in your form, with a face. The ink-drop
thinking state is genuinely the nicest animation of the three. But the silhouette — dark
navy, pointed hood, two pale eyes — reads as a hooded figure rather than a friendly pen,
which is the worst possible accident for an app used by people who are already anxious
about a financial dispute. Fixable with a lighter fill and a wider body, but it starts
from a hole.

**C — Sunny.** The only one whose face is still legible at 30px, because it's a circle
with two dots and a curve and nothing else competing. Unmistakably a character. Reuses
`--color-afca-yellow`, already the demo's accent, so it looks like it belongs rather than
like a mascot bolted on.

I softened it after first look: the initial version had a full grin, which lands as
breezy — wrong note for someone whose insurance was just cancelled. It's now a settled
half-smile. Warm, not chirpy. **This tone question matters more than the shape choice**
and is worth a second opinion.

## Technique: inline SVG + CSS keyframes

| Approach | Deps | State control | Theming | Verdict |
|---|---|---|---|---|
| **Inline SVG + CSS keyframes** | none | drives off the existing `pending` flag | uses `--color-afca-*` | **chosen** |
| Lottie / dotLottie | runtime dep + JSON asset | good | baked into the file | overkill at 30px |
| Animated GIF / APNG / WebP | none | none — can't react to state | none; blurry at DPR 2+ | no |
| Sprite sheet | none | clunky | none | no |
| Rive | runtime dep + editor + `.riv` | excellent | limited | far too much machinery |

`package.json` has five runtime dependencies. Adding an animation runtime for a 30px
avatar would be the largest dependency decision in the project, for the smallest element.
The whole prototype is ~150 lines of SVG and ~60 lines of keyframes.

## Things this had to respect (all checked)

- **Not AFCA.** `app/globals.css:6-9` deliberately avoids AFCA's logo. All three shapes are
  original — no shield, scales, crest, or anything resembling an official ombudsman mark.
  Sunny uses the sampled palette, which was already in use, but no borrowed form.
- **Reduced motion — this surfaced a latent trap.** The existing clamp at `app/globals.css:44-51`
  zeroes `animation-duration` but leaves infinite animations looping, so they freeze on an
  arbitrary frame. Measured in the browser: Sunny's face froze at **scale 1.11** — a
  permanently puffed-up sun for every reduced-motion user. (Nothing in the repo looped
  before these avatars, so nothing was visibly broken until now.) Fixed by forcing
  `animation-iteration-count: 1` for the avatars; re-measured, all three now rest at the
  neutral pose. **If any other looping animation is added later, it will hit this same
  trap** — worth considering the iteration-count rule for the global clamp, not just the
  avatars.
- **Accessibility.** The character is `aria-hidden`; the word "Thinking…" stays as the
  textual pending signal. The pose adds to it, never replaces it.
- **Phone width.** At 400px the avatar takes 30px and the bubble's max-width was reduced
  to compensate (`calc(85% - 2.5rem)`), measured at 294px total — no overflow, and the
  recent phone-layout fixes (b32479a, 8d4c6f3) stay intact.
- **Print.** The avatar is inside `.chat`, which is already `display:none` in print.
- **Only the newest assistant message animates.** Older ones render in a `still` state
  with no animation at all — verified in the browser, an older avatar reports zero running
  animations — so a fifteen-turn conversation isn't fifteen pulsing suns. The speaking
  animation also runs a finite three iterations and settles, rather than beaming
  indefinitely while the user types their reply.

## Recommendation

Go with **C (Sunny)**, if a character is wanted at all.

Worth saying plainly: this is a demo of a serious tool for people in financial distress,
and the disclaimer banner works hard to keep it from looking like a toy. A character is a
real tonal risk — it can read as friendly and disarming, or as a bank chatbot mascot that
trivialises the complaint. Sunny with the softened smile is my best attempt at the first,
but the judgement is yours and it's easy to reverse.

Cheaper middle ground if the full character feels like too much: keep the character
**only** for the "Thinking…" state, where it does actual work (signalling wait), and leave
the settled messages plain.

## What shipped

- `components/Assistant.tsx` — Sunny, rewritten as a real component rather than promoted
  from prototype code. Three states: `still` (older messages, no animation at all),
  `thinking` (rays rotate while the reply is in flight), `speaking` (the newest message
  warms, three iterations, then settles).
- The keyframes in `app/globals.css`, including the `animation-iteration-count: 1` rule
  for reduced motion. **Keep that rule**: it's a latent trap in the existing clamp, and
  the next looping animation added anywhere in this app would hit it too.
- Everything else — the two rejected characters, the `?variant=` plumbing, the switcher,
  the `/prototype/avatars` contact sheet — was deleted. `app/page.tsx` is byte-identical
  to what it was before the investigation.

Still open, if wanted: the same mark in the header beside "Complaint Concierge", and as
the favicon (`app/favicon.ico` appears to still be the Next.js default).
