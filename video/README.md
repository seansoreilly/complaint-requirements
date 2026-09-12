# Explainer video

A short Remotion explainer for Complaint Concierge, built from screenshots
captured by driving the real app rather than from mockups.

## Rebuilding it

```bash
npm run dev                     # in the repo root, on http://localhost:3000
cd video && npm install
npm run capture                 # drives the app, writes public/shots/*.png
npm run render                  # writes out/explainer.mp4
```

### Changing what it says

Edit `SCRIPT.md`, then:

```bash
node show-script.mjs                                 # check it parses, see the word count
ELEVENLABS_API_KEY=... node voice.mjs --force        # regenerate narration
node retime.mjs                                      # rebalance beats to the narration
node recaption.mjs                                   # push captions into scenes.ts
npm run render
```

Pass clip ids to `voice.mjs` to regenerate only what changed (`node voice.mjs
01-empty outro`) — it is much cheaper than `--force`. The mp3s are committed, so
a plain render needs no API key.

The two cards' on-screen text lives in `Explainer.tsx`, not in `scenes.ts`; the
audio for them comes from `SCRIPT.md` like everything else.

`npm run studio` opens the Remotion preview if you want to retime a beat.

## How it is put together

| File | Role |
|---|---|
| `SCRIPT.md` | **The words.** Narration and on-screen captions per beat — the one file to edit to change what the video says. |
| `script.mjs` | Parses `SCRIPT.md`. Everything else reads the words from here, so nothing is retyped into code. |
| `capture.mjs` | Drives the running app through `docs/demo-script.md` with Playwright and saves a numbered screenshot at each beat. |
| `voice.mjs` | Generates the narration with ElevenLabs and measures each clip into `src/durations.json`. |
| `retime.mjs` | Recomputes beat durations from the measured clips; the runtime follows the narration. |
| `recaption.mjs` | Copies the on-screen captions from `SCRIPT.md` into `scenes.ts`. |
| `src/scenes.ts` | The storyboard — shot, caption, narration clip and duration per beat. The single place to edit pacing or wording. |
| `src/Explainer.tsx` | Title card, the captioned beats with a slow push, and the closing card. |
| `src/Root.tsx` | Registers the composition, asserts the storyboard total matches TOTAL_SECONDS, and asserts no beat is shorter than its narration. |

The video is 1920×1080 at 30fps. Its length follows the narration rather than a
round number: `retime.mjs` gives each beat its measured clip plus a capped
amount of breathing room and writes the resulting total into `TOTAL_SECONDS`,
and `Root.tsx` throws if the scene durations stop adding up to it. Padding a
short explainer out to a target is what makes one feel slow, so the cap wins and
the video comes in under the ceiling.

`capture.mjs` still captures all twelve screenshots, but the current cut uses
only three of them (`01`, `02`, `03`). The rest are kept because they cost
nothing and a longer cut would want them back — `script.mjs`'s `BEATS` list
decides which are used.

## The voiceover

Jess (`ys3XeJJA4ArWMhRpcX1D`), an Australian voice, via `eleven_multilingual_v2`.
The narration is deliberately terser than the on-screen captions — hearing and
reading the same words is grating, and the beats have no room for the captions
read aloud.

Two spellings in `voice.mjs` are load-bearing, both found by transcribing the
output rather than by listening: **"A F C A"** as separate letters, because
`Afca` is spoken as "Africa". Write any number as words for the same reason —
digits are read as quantities.

`src/durations.json` holds the measured length of each clip, and `Root.tsx`
refuses to render if any beat is shorter than its narration plus a margin.
Remotion truncates audio at the end of a `Sequence` silently, so without that
check a long clip would be cut off mid-word with nothing to indicate it. When a
clip grows, lengthen its scene and take the time from another — never speed the
audio up to fit.

## Two things that will bite you

**Capture must use `localhost`, not `127.0.0.1`.** `next dev` serves the page on
both, but only hydrates on the origin it was started with. On the other origin
you get static SSR HTML: clicks do nothing and Send stays permanently disabled.
Chrome is launched with `--host-resolver-rules=MAP localhost 127.0.0.1` so the
localhost origin still reaches the IPv6-bound dev server under WSL2.

**Captions describe the offline extractor.** The shots are captured with no
`ANTHROPIC_API_KEY` set, so the header pill reads "Offline demo brain" and the
narration is written to match. If you recapture with a key set, the pill changes
and the wording should be revisited.

## Output

`out/` is gitignored. Re-render, or keep a copy outside the repo.
