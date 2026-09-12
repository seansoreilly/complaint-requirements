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
no approve button existed.

## Where it may and may not be used

**Allowed:** Step 0's state-level checks, and reproducing a defect while fixing
it. Also fine as an unscored smoke check between commits.

**Not allowed:** standing in for a persona run that counts, *including* a
re-run of a persona that has already passed once in a browser. A script plays a
fixed line. The reason the rubric wants personas rather than scripts is that the
live brain varies its questions — a scripted second run would certify that the
script still works, not that the app still does. **Both of a persona's two
consecutive ≥9 runs are browser transcripts.**

A scripted run is never scoring evidence: the bar is a browser transcript on a
known hash. It is a legitimate way to FIND a defect and to prove a fix — defects
19 and 22 were both found this way.

## Two mistakes already made here, so nobody re-makes them

1. **A check written before the rule it contradicts.** Check 6 asserted a draft
   appears on the story turn. Then the clarify-first rule landed, the model
   began asking its outstanding question first and drafting on the next turn,
   and the check failed against an app that was behaving correctly. If a check
   starts failing after a prompt change, ask whether the check or the app is
   the thing that moved.

2. **A string match that caught the next question.** Check 3a tested for a
   re-offered cover type by looking for "Which of these fits best" — which also
   opens the *issue category* question, a different required field that
   legitimately carries its own list. Match on the options that identify the
   field (TPD, income protection, death cover), not on the phrasing around them.

Both failures were the harness being wrong, not the app. That is the failure
mode to expect from a script: it asserts the shape of a conversation, and the
conversation is allowed to change shape.
