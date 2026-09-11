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

`npm run studio` opens the Remotion preview if you want to retime a beat.

## How it is put together

| File | Role |
|---|---|
| `capture.mjs` | Drives the running app through `docs/demo-script.md` with Playwright and saves a numbered screenshot at each beat. |
| `src/scenes.ts` | The storyboard — shot, caption and duration per beat. The single place to edit pacing or wording. |
| `src/Explainer.tsx` | Title card, the captioned beats with a slow push, and the closing card. |
| `src/Root.tsx` | Registers the composition and asserts the storyboard totals exactly 120s. |

The video is 1920×1080 at 30fps, so exactly 3600 frames. `Root.tsx` throws if
the scene durations stop adding up to two minutes, which keeps a caption edit
from quietly changing the runtime.

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
