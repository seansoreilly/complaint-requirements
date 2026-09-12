# Thumbnail

`thumbnail.jpg` — 1280x720, the YouTube thumbnail for the explainer.

A speech bubble on the left dissolving into particles that reassemble as form
fields on the right: the video's whole argument in one image, reading left to
right. No text is baked in, so it can be retitled without regenerating.

Generated with the Gemini nanobanana extension, then resized from 1376x768:

```bash
gemini --yolo "/generate 'Wide 16:9 widescreen banner, minimal abstract
editorial illustration. A single rounded speech bubble on the left dissolving
and reorganising into a neat vertical stack of blank form field rectangles on
the right, suggesting spoken words turning into a completed form. Deep navy
background, form fields and speech bubble in white with warm golden yellow
accents. Flat vector style, generous negative space, calm and professional,
government service design aesthetic, not playful, no people, no faces,
absolutely no text or letters or numbers anywhere' --styles=minimalist"

ffmpeg -i <generated> -vf "scale=1280:720:flags=lanczos" -q:v 2 thumbnail.jpg
```

Notes for regenerating: `/generate` ignores `--count` (one image per call) and
rejects `--aspect`; output lands in `./nanobanana-output/` and is JPEG even when
named `.png`. Ask for "no text" — image models garble lettering, and a title is
better overlaid afterwards.
