# Chat evaluation — start here

Twenty personas talk to the app through a browser, against the live model. Each
conversation is scored out of 10. A persona **passes** only on two consecutive
runs of ≥9 on the same frozen build.

## Where to look

| File | What it is |
|---|---|
| `resumption-plan.md` | **Read this first.** How to restart cold: the bar, Step 0, run order, the tester contract, every scoring precedent. |
| `scores.md` | The ledger. Every run, its score, the hash it ran on, and why each point was lost. |
| `defects.md` | All defects found, with repro, cause, fix and how it was verified. |
| `personas.md` | The twenty fact sheets. Not scripts — the tester answers in character. |
| `rubric.md` | How a run is scored: A (field accuracy), B (safety), C (conversation). |
| `harness/` | The scripted Step 0 checks, and a README saying what a script **cannot** test. |
| `step0-<hash>.txt` | Evidence for one build: reply text and state per turn. The newest hash is the current one; earlier files are kept because several record a build that was later found broken. |

## The one thing that shaped this exercise

The app has two brains. `lib/mock-brain.ts` runs in tests; the live model runs
in production. **Three separate times a fix passed the full unit suite and did
nothing in production**, because the rule lived somewhere the live path could
not see it. A green suite is not evidence about the live path.

The same trap appeared in the test tooling itself: three scripted checks passed
against the very defect they were written for. The rule that came out of it —

> A check that drives the live model tests what the model happened to do, not
> what the app guarantees.

— so a deterministic assertion belongs in the unit suite, and the scripted check
is a watchpost. And its companion:

> A prompt line is a request. If the constraint matters, the route enforces it
> and the prompt line is the courtesy.

The boundary: the route can enforce what it composes or writes. It cannot stop
the model raising a subject, so for that class the sweeps are the enforcement.

## Why the tally may read 0 passed

A defect found mid-run moves the frozen build, and every run on the old build
becomes defect-finding rather than a clearance. That is the rule working, not
the app failing: a build with a known person-facing defect in it is not a build
worth certifying. Read the ledger's rows, not only its total.
