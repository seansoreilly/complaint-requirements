# Scripted harness

Drives `/api/chat` turn by turn the way a browser would, for the checks whose
answer lives in the state or the reply text. Much cheaper than a browser agent,
and better evidence on one axis: it captures state after **every** turn, which
three of nine agent runs failed to do.

```
python3 docs/chat-eval/harness/step0.py            # the scripted Step 0 checks
OUT=/tmp/run python3 docs/chat-eval/harness/step0.py
```

Set `APP_URL` if the dev server is not on `http://localhost:3100`, and `OUT` to
choose where per-run transcripts are written (default: a `runs/` directory
beside these scripts, which is gitignored).

## What this cannot test

**A card click never reaches the API, and rendered text is not in the state.**
So these stay in a browser, always:

- approving a draft card ("Use this") and what the assistant says next
- the chat header wording ("All answers in ✓" / "Ready — N left blank ✓")
- anything about layout, focus, or what a person can actually click

The card that never appeared (defect 20) was **invisible to the API** — the
state looked correct either way, and only a tester searching the DOM found that
no approve button existed. That class of defect has been the most productive in
this exercise, so first runs of a persona and both sweeps stay with browser
agents. Use this harness for Step 0, for re-runs of personas that have already
passed once in a browser, and for reproducing a defect while fixing it.

A scripted run is **not** scoring evidence under the rubric: the bar is a
browser transcript on a known hash. It is a legitimate way to find a defect and
to prove a fix — defects 19 and 22 were both found this way.
