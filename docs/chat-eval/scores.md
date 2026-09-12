# Chat evaluation ledger

Scored by the test manager against `docs/chat-eval/rubric.md`. One row per case
per round; rounds are appended, never rewritten.

| Round | Case | Score | Reason |
|---|---|---|---|
| 1 | 7 firm-initiated-contact | 9/10 | All fields and all safety invariants held (complained_to_firm.yes=false, member 10100 from directory, drafts approved before write). Last turn was a silent parse failure ("Sorry — I didn't catch that") after the person declined the optional questions; nothing lost because the form was already complete, but the person was left without a reply. Trap only partly exercised: the agent volunteered "I haven't contacted NAB myself", so the standalone "have you complained?" path was never taken. |
