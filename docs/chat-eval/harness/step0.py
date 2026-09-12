"""Step 0, the six checks whose answer lives in the state or the reply text.

Checks 1 (card approval follow-up) and the header wording need a browser and are
run separately — a card click never reaches the API.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from drive import Chat, check, save  # noqa: E402
import re  # noqa: E402


def reoffers_cover_type(reply: str) -> bool:
    """Is the cover type being PUT TO THEM again, rather than mentioned?

    Three real replies shaped this, and each broke a simpler version:

    - defect 22 asked in its own words, in ONE sentence carrying the options:
      "which cover was it? For example death cover, TPD, or income protection".
    - defect 16 asked as a bare list, where the QUESTION and the OPTIONS are
      separate sentences: "Which of these fits best? Insurance in super (TPD),
      Insurance in super (income protection), ..." — so a per-sentence test
      misses it.
    - a correct reply named all three options while declining to press: "whether
      it was TPD, income protection, or death cover — is the bit you're unsure
      about, and I won't press you on it."

    So: find where the options appear, take that sentence AND the one before it,
    and ask whether that window contains a question. Naming the options is not
    asking; a question next to them is. Words like "not sure" do not make a
    sentence safe — both defects said "or if you're not sure, that's fine" in
    the very breath that asked.
    """
    options = ["tpd", "income protection", "death cover"]
    sentences = re.split(r"(?<=[.!?])\s+", reply)
    for i, sentence in enumerate(sentences):
        if sum(o in sentence.lower() for o in options) < 2:
            continue
        window = " ".join(sentences[max(0, i - 1): i + 1])
        low = window.lower()
        if "?" in window:
            return True
        if re.search(r"\b(which|pick one|choose|was it|is it)\b", low):
            return True
    return False


results = []
timeouts = 0
turns_total = 0


def banner(text):
    print(f"\n=== {text} ===")


# ---------------------------------------------------------------- check 4 + 3
banner("CHECK 4 notify_by asked, and CHECK 3 declined on the live path")
c = Chat(label="declined+notify")
c.say("My complaint is about AustralianSuper. They cancelled my insurance cover "
      "without telling me. I don't have my member number handy.")
c.say("No, this is the first time. And yes, I agree to both consents.")
r = c.say("I'm honestly not sure which type of cover it was.")
first_decline_reply = r.get("reply", "")

c.say("Account administration error — they just cancelled it without telling me.")
c.say("I logged in about a month ago and the cover was gone. No letter, no email. "
      "I'd had it for years.")

# This proves NOT PRE-TICKED, which is what defect 15 was. That it is actually
# asked has been seen in every persona run and in the browser half of Step 0;
# asserting it here would mean driving to the contact stage for no extra signal.
results.append(check(
    "4  notify_by is not pre-ticked before anyone is asked",
    c.field("complainant.notify_by") == "",
    f'notify_by = {c.field("complainant.notify_by")!r}'))

# The test is whether the COVER TYPE is re-offered, not whether the reply
# contains a list at all: the next question is the issue category, which is a
# different required field and legitimately comes with its own list. Matching on
# "which of these" alone failed on a run where the app behaved perfectly.
results.append(check(
    "3a declined accepted without re-offering the cover type",
    not reoffers_cover_type(first_decline_reply),
    first_decline_reply[:240]))

# ------------------------------------------------------------------- check 6
banner("CHECK 6 the proposal is held as a card, not quoted into the form")
# The draft does not arrive on the story turn: clarify-first means the model
# asks its outstanding question and drafts on a later turn (that is check 8).
# Answer whatever it asked, then look for the draft.
c.say("No, I haven't been in touch with them about it at all yet.")
held = c.field("drafts.narrative") or ""
results.append(check(
    "6  drafts.narrative populated, complaint.narrative still empty",
    len(held) > 0 and c.field("complaint.narrative") == "",
    f'draft={held[:80]!r}\ncommitted={c.field("complaint.narrative")!r}'))

turns_total += len(c.turns)
timeouts_c_before = c.timeouts
timeouts += c.timeouts
save(c, "step0_a.json")

# ---------------------------------------------------------------- check 3b
banner("CHECK 3b the declined field is never raised again")
decline_turn = len(c.turns)  # everything after this is "later"
c.say("Yes, that draft reads right.")
c.say("I rang them on 20 August 2026 to complain. No final answer yet.")
c.say("No court case. I'd like the cover reinstated.")
# Defect 22 was the model re-asking IN ITS OWN WORDS ("which type of cover was
# it?"), which a literal match on the forced list would not catch. Test the
# options that identify the field, across every turn after the decline — not
# the last three, and not the phrasing.
later_replies = [t["reply"] for t in c.turns[decline_turn:]]
reraised = [r for r in later_replies if reoffers_cover_type(r)]
results.append(check(
    "3b the cover type is never raised again, in any wording",
    len(reraised) == 0,
    f'declined={c.field("declined")}  subtype={c.field("service.subtype")!r}\n'
    + (f"re-raised in: {reraised[0][:200]}" if reraised else "no later reply offers the options")))

turns_total += 3
# `c.timeouts` is cumulative for this Chat, and the earlier `timeouts +=` above
# already counted its first five turns. Add only what this stretch added.
timeouts += c.timeouts - timeouts_c_before
save(c, "step0_b.json")

# ------------------------------------------------------------------- check 5
banner('CHECK 5 panel "super fund" assigns no member number')
base = Chat().say("I have a problem with my credit card.")["state"]
panel = json.loads(json.dumps(base))
panel["firm"]["name"] = "super fund"
panel["firm"]["afca_member_no"] = ""
p = Chat(state=panel, label="panel-super-fund")
r = p.say("does that help?")
note = r.get("firmNote") or ""
# The number being blank is not enough: if the route canonicalised the name to
# "Hesta Super Fund" while leaving the number empty, the panel would still show
# Hesta and this check would pass.
resolved_name = p.field("firm.name") or ""
DIRECTORY_NAMES = ["Hesta Super Fund", "Rest Superannuation", "AustralianSuper"]
results.append(check(
    "5  no member number, name left unresolved, closest match named, full name asked",
    p.field("firm.afca_member_no") == ""
    and resolved_name not in DIRECTORY_NAMES
    and "Several firms match" not in note
    and "may not be the firm you mean" in note,
    f'member_no={p.field("firm.afca_member_no")!r}  name={resolved_name!r}\nnote={note}'))
turns_total += len(p.turns)
timeouts += p.timeouts
save(p, "step0_c.json")

# ------------------------------------------------------------- checks 7 + 8
banner("CHECK 7 date before the branch is decided, CHECK 8 clarify before drafting")
q = json.loads(json.dumps(base))
q["firm"]["name"] = "AustralianSuper"
q["firm"]["no_reference"] = True
q["open_afca_complaint"] = False
q["consents"] = {"authority": True, "engagement_charter": True}
q["service"] = {"type": "Superannuation", "subtype": "Fees and charges"}
q["complaint"]["issues"] = ["Incorrect premiums or fees"]
q["complaint"]["narrative"] = ""
q["complained_to_firm"] = {"yes": None, "date": "", "how": "", "final_reply": None}
q["drafts"] = {"narrative": "", "fair_outcome": ""}

s = Chat(state=q, label="date-before-branch")
r1 = s.say("The admin fees crept up with no explanation. I emailed them on 5 August 2026.")
after_first = dict(s.state["complained_to_firm"])

results.append(check(
    "7a date and how stay empty while yes is undecided",
    after_first["date"] == "" and after_first["how"] == "",
    json.dumps(after_first)))

asked_clarify = "complaint" in r1.get("reply", "").lower() and "?" in r1.get("reply", "")
drafted_same_turn = len(s.field("drafts.narrative") or "") > 0
results.append(check(
    "8  the clarification comes in its own turn, not with a draft",
    asked_clarify and not drafted_same_turn,
    f'asked={asked_clarify} drafted_same_turn={drafted_same_turn}\n{r1.get("reply","")[:200]}'))

s.say("It was more of a query asking them to explain the fees.")
after_second = dict(s.state["complained_to_firm"])
contradiction = after_second["yes"] is not True and (after_second["date"] or after_second["how"])
results.append(check(
    "7b no complaint date on a form that says she did not complain",
    not contradiction,
    json.dumps(after_second)))

turns_total += len(s.turns)
timeouts += s.timeouts
save(s, "step0_d.json")

# ------------------------------------------------------------------- check 9
banner("CHECK 9 a decline is honoured before the model records it (defect 24)")
# NOT tested here, deliberately, and this note is the check.
#
# The defect: the person declines, the model says it will leave the field blank
# but does not add the path to `declined` until a turn later, and in that gap
# `ensureAsk` appends the canonical bare list underneath an otherwise good
# reply. Two instances were sitting in this file's own evidence.
#
# It cannot be driven from here. `ensureAsk` only appends when the model's reply
# does NOT already end with a question, and whether it does is the model's
# choice, not something the API lets us set. Driving the failing state through
# /api/chat on the BROKEN build produced a reply that ended in a question, so
# the append never fired and a check written here PASSED against the defect —
# which is the exact failure this harness's README warns about.
#
# So it lives in the unit suite, where the trailing reply is an input:
# lib/__tests__/late-decline.test.ts. Verified to fail without the fix.
print("     (covered by lib/__tests__/late-decline.test.ts — see note in source)")

banner("RESULT")
print(f"{sum(results)}/{len(results)} scripted checks passed")
print(f"turns: {turns_total}   transient timeouts: {timeouts}")
print(f"timeout rate (solo): {timeouts / max(turns_total, 1) * 100:.1f}%")
sys.exit(0 if all(results) else 1)
