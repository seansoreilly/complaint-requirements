# Thumbnail

`thumbnail.jpg` — 1280x720, the YouTube thumbnail for the explainer.

A speech bubble beside a form completing itself with ticks, and the title in a
band across the bottom. Rebuild it with `../../thumbnail.sh`, which takes the
generated artwork and draws the text over it.

**The text is drawn by ffmpeg, not by the image model.** Image models garble
lettering, and a misspelt "Complaint Concierge" or "AFCA" on something sent to a
recruiter at AFCA would be the worst possible typo. Drawing it in code means it
is sharp, correctly spelled, in the exact brand colours, and the wording can
change without spending another generation — edit `TITLE` and `TAGLINE` at the
top of the script.

Layout note: the text sits in a bottom band rather than a left-hand column.
The artwork is composed centre-frame, so a left column ran the title across the
speech bubble, and cropping to make room sliced the bubble in half. A bottom
band works with whatever the generator produces.

Checked at 360px wide — the size YouTube shows in a list — where the title is
still clearly legible.

The artwork was generated with the Gemini nanobanana extension:

```bash
gemini --yolo "/generate 'Promotional header image for Complaint Concierge, a
web app that helps ordinary Australians lodge a financial complaint. Instead of
filling in a long eight stage government complaint form, the person describes
their problem in plain conversation and an AI fills the official form in for
them automatically. The feeling is relief, competence and calm. Australian
financial ombudsman brand palette, deep navy 002850 background and bright
yellow FFD200 accents. Wide 16:9 hero image about effortlessness: a large white
rounded speech bubble centre left with a single bright yellow cursor inside it,
and to the RIGHT a form whose rows are visibly completing themselves in
sequence, each ending in a yellow checkmark, with a subtle sense of motion and
automation. Conveys you talk and it does the rest. Clean, premium, high
contrast flat vector, no people, absolutely no text or letters or numbers'
--styles=minimalist"
```

Leading the prompt with what the product *does* — rather than only describing
shapes — is what turned these from diagrams into something that reads as
marketing. Four other concepts were generated and rejected; this one survived
because it stays legible at thumbnail size.

Notes for regenerating: `/generate` ignores `--count` (one image per call) and
rejects `--aspect`; output lands in `./nanobanana-output/` and is JPEG even when
named `.png`. Ask for "no text" — image models garble lettering, and a title is
better overlaid afterwards.
