# Explainer video

A two-minute Remotion explainer for Complaint Concierge, built from screenshots
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
node retime.mjs                                      # rebalance beats back to 120s
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
| `retime.mjs` | Recomputes beat durations from the measured clips so the total stays exactly 120s. |
| `recaption.mjs` | Copies the on-screen captions from `SCRIPT.md` into `scenes.ts`. |
| `src/scenes.ts` | The storyboard — shot, caption, narration clip and duration per beat. The single place to edit pacing or wording. |
| `src/Explainer.tsx` | Title card, the captioned beats with a slow push, and the closing card. |
| `src/Root.tsx` | Registers the composition, asserts the storyboard totals exactly 120s, and asserts no beat is shorter than its narration. |

The video is 1920×1080 at 30fps, so exactly 3600 frames. `Root.tsx` throws if
the scene durations stop adding up to two minutes, which keeps a caption edit
from quietly changing the runtime.

## The voiceover

Jess (`ys3XeJJA4ArWMhRpcX1D`), an Australian voice, via `eleven_multilingual_v2`.
The narration is deliberately terser than the on-screen captions — hearing and
reading the same words is grating, and the beats have no room for the captions
read aloud.

Two spellings in `voice.mjs` are load-bearing, both found by transcribing the
output rather than by listening: **"A F C A"** as separate letters, because
`Afca` is spoken as "Africa"; and the member number as **"one oh six five
seven"**, so it is not read as a quantity.

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

`out/explainer.mp4` is gitignored — it is ~63 MB. Re-render it, or keep a copy
outside the repo.
