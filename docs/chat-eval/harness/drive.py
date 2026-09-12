"""Drive /api/chat turn by turn, the way a person's browser would.

Cheaper than an agent in a browser and better evidence in one respect: state is
captured after EVERY turn, which three of nine agent runs failed to do. It
cannot see the UI layer, so it is for checks whose answer is in the state or the
reply text; anything that depends on a click or on rendered text still needs a
browser.
"""
import json
import os
import pathlib
import subprocess
import sys
import time

URL = os.environ.get("APP_URL", "http://localhost:3100").rstrip("/") + "/api/chat"
OUT = pathlib.Path(os.environ.get("OUT", pathlib.Path(__file__).parent / "runs"))


class Chat:
    def __init__(self, state=None, label=""):
        self.state = state or {}
        self.history = []
        self.turns = []
        self.label = label
        self.timeouts = 0
        self.failures = []

    def say(self, message, retries=2):
        """One turn. Retries a transient failure, and counts it."""
        for attempt in range(retries + 1):
            body = {"state": self.state, "history": self.history[-20:], "message": message}
            proc = subprocess.run(
                ["curl", "-s", "--max-time", "180", "-X", "POST", URL,
                 "-H", "Content-Type: application/json", "-d", "@-"],
                input=json.dumps(body), capture_output=True, text=True,
            )
            try:
                data = json.loads(proc.stdout)
            except json.JSONDecodeError:
                data = {"error": proc.stdout[:200] or "no response"}

            if "error" in data:
                err = str(data["error"])
                transient = "timed out" in err.lower() or "connection" in err.lower()
                if transient:
                    self.timeouts += 1
                if transient and attempt < retries:
                    time.sleep(2)
                    continue
                self.failures.append({"message": message, "error": err[:200]})
                return {"reply": "", "state": self.state, "error": err}

            self.state = data["state"]
            self.history.append({"role": "user", "content": message})
            self.history.append({"role": "assistant", "content": data["reply"]})
            self.turns.append({"said": message, "reply": data["reply"], "state": data["state"]})
            return data

    def field(self, path):
        node = self.state
        for part in path.split("."):
            if not isinstance(node, dict):
                return None
            node = node.get(part)
        return node


def check(name, passed, detail=""):
    print(f"{'PASS' if passed else 'FAIL'}  {name}")
    if detail:
        for line in str(detail).strip().splitlines():
            print(f"        {line}")
    return passed


def save(chat, name):
    """Write one run's transcript. `name` is a bare filename."""
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / name, "w") as fh:
        json.dump({"label": chat.label, "turns": chat.turns,
                   "timeouts": chat.timeouts, "failures": chat.failures}, fh, indent=1)


if __name__ == "__main__":
    print("harness ready", file=sys.stderr)
