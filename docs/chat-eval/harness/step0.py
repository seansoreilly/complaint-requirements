"""Step 0, the six checks whose answer lives in the state or the reply text.

Checks 1 (card approval follow-up) and the header wording need a browser and are
run separately — a card click never reaches the API.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from drive import Chat, check, save  # noqa: E402
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

results.append(check(
    "4  notify_by starts blank and is not pre-ticked",
    c.field("complainant.notify_by") == "",
    f'notify_by = {c.field("complainant.notify_by")!r}'))

# The test is whether the COVER TYPE is re-offered, not whether the reply
# contains a list at all: the next question is the issue category, which is a
# different required field and legitimately comes with its own list. Matching on
# "which of these" alone failed on a run where the app behaved perfectly.
cover_options = ["TPD", "income protection", "death cover"]
reoffered = sum(opt.lower() in first_decline_reply.lower() for opt in cover_options) >= 2
results.append(check(
    "3a declined accepted without re-offering the cover type",
    not reoffered,
    first_decline_reply[:200]))

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
timeouts += c.timeouts
save(c, "step0_a.json")

# ---------------------------------------------------------------- check 3b
banner("CHECK 3b the declined field is never raised again")
c.say("Yes, that draft reads right.")
c.say("I rang them on 20 August 2026 to complain. No final answer yet.")
c.say("No court case. I'd like the cover reinstated.")
later = " ".join(t["reply"] for t in c.turns[-3:])
results.append(check(
    "3b product list does not reappear after the decline",
    "Which of these fits best" not in later and "Insurance in superannuation (TPD)" not in later,
    f'declined={c.field("declined")}  subtype={c.field("service.subtype")!r}'))

turns_total += 3
timeouts = c.timeouts
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
results.append(check(
    "5  no member number, closest match named, full name asked",
    p.field("firm.afca_member_no") == ""
    and "Several firms match" not in note
    and "may not be the firm you mean" in note,
    f'member_no={p.field("firm.afca_member_no")!r}\nnote={note}'))
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

banner("RESULT")
print(f"{sum(results)}/{len(results)} scripted checks passed")
print(f"turns: {turns_total}   transient timeouts: {timeouts}")
print(f"timeout rate (solo): {timeouts / max(turns_total, 1) * 100:.1f}%")
sys.exit(0 if all(results) else 1)
