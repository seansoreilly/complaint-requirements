"""Check the reoffers_cover_type predicate against real replies, both ways.

The function is copied here rather than imported, because importing step0 would
run the whole Step 0 suite. Kept byte-identical to the version in step0.py.
"""
import re

OPTIONS = ["tpd", "income protection", "death cover"]


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


CASES = [
    # (label, reply, should_flag)
    (
        "defect 22: re-asked in its own words",
        "One thing I want to get right before I draft anything: which cover was it? "
        "For example death cover, total and permanent disability (TPD), or income "
        "protection — or if you're not sure which, that's fine too.",
        True,
    ),
    (
        "defect 16: the forced bare list",
        "Which of these fits best? Insurance in superannuation (TPD), Insurance in "
        "superannuation (income protection), Insurance in superannuation (death cover).",
        True,
    ),
    (
        "correct: names the options while declining to press",
        "The more specific one — whether it was TPD (total and permanent disability), "
        "income protection, or death cover — is the bit you're unsure about, and I "
        "won't press you on it. I'll leave that blank unless you come across something.",
        False,
    ),
    (
        "correct: the issue-category question, a different field",
        "Let's move on to what went wrong. Which of these fit best — you can pick more "
        "than one: Denial of insurance claim, Delay in claim handling, Incorrect "
        "premiums or fees, Account administration error.",
        False,
    ),
    (
        "correct: the first ask, before any decline (3a runs on this turn only)",
        "Which part of your super does the complaint relate to? Insurance in super "
        "(TPD), insurance in super (income protection), or insurance in super (death "
        "cover)?",
        True,
    ),
]

failures = 0
for label, reply, expected in CASES:
    got = reoffers_cover_type(reply)
    mark = "ok " if got == expected else "BAD"
    if got != expected:
        failures += 1
    print(f"{mark} expected={expected!s:5} got={got!s:5}  {label}")

print("\nVERDICT:", "predicate behaves" if failures == 0 else f"{failures} case(s) wrong")
raise SystemExit(1 if failures else 0)
