"""WINNERS Bot Live Draw: fair, recorded winner selection with a full-screen reveal.

Winners are picked with the operating system's cryptographic random generator (Python `secrets`), never by the AI.
Every draw is appended to Documents/WINNERS Draws/draws.csv with the time, prize, pool size, a fingerprint (SHA-256) of the
exact entry list, and the result, so any draw can be checked afterwards.
"""
import csv, datetime as dt, hashlib, json, re, secrets
from pathlib import Path

DRAW_TOOLS = [{
    "name": "live_draw",
    "description": "Run a live competition draw on screen with a slot-machine reveal, and record it. ALWAYS use this to pick winners "
                   "(it uses certified random numbers; never choose a winner yourself). Give the prize and either tickets (the number of "
                   "tickets sold: draws ticket numbers 1..tickets) or entries (names or ticket numbers, one per line or comma separated). "
                   "winners = how many to draw (default 1); exclude = ticket numbers to leave out (e.g. void entries). The result returns "
                   "straight away: wait for the on-screen reveal (about seconds per winner), then announce the winner with energy. "
                   "history lists recent draws. open shows the draw panel so the user can run one by hand.",
    "parameters": {"type": "OBJECT", "properties": {
        "action": {"type": "STRING", "description": "draw (default), history or open"},
        "prize": {"type": "STRING", "description": "the prize / competition name"},
        "tickets": {"type": "NUMBER", "description": "total tickets sold (numbers 1..tickets)"},
        "entries": {"type": "STRING", "description": "the entries: names or numbers, one per line or comma separated"},
        "winners": {"type": "NUMBER", "description": "how many winners to draw (default 1)"},
        "exclude": {"type": "STRING", "description": "ticket numbers to leave out, comma separated"},
        "seconds": {"type": "NUMBER", "description": "reveal length per winner in seconds (default 7)"},
    }},
}]
DRAW_NAMES = {t["name"] for t in DRAW_TOOLS}


class Draws:
    def __init__(self, core):
        self.core = core
        self.folder = Path.home() / "Documents" / "WINNERS Draws"
        self.log = self.folder / "draws.csv"

    def pool(self, tickets=None, entries="", exclude=""):
        ex = {e.strip().lstrip("#") for e in re.split(r"[,\n;]", str(exclude or "")) if e.strip()}
        if entries and str(entries).strip():
            items = [e.strip() for e in re.split(r"\n|,|;", str(entries)) if e.strip()]
            label = "%d entries" % len(items)
        else:
            n = int(float(tickets or 0))
            if n < 1:
                raise ValueError("Say how many tickets were sold, or give the list of entries.")
            if n > 5_000_000:
                raise ValueError("That is more tickets than a draw can hold (5 million max).")
            items = [str(i) for i in range(1, n + 1)]
            label = "tickets 1-%d" % n
        items = [i for i in items if i.lstrip("#") not in ex]
        if ex:
            label += " (%d excluded)" % (len(ex))
        if not items:
            raise ValueError("No entries left to draw from.")
        return items, label

    def run(self, prize="", tickets=None, entries="", winners=1, exclude="", seconds=7, announce=True):
        items, label = self.pool(tickets, entries, exclude)
        k = max(1, min(int(float(winners or 1)), len(items), 50))
        picked = secrets.SystemRandom().sample(items, k)
        fp = hashlib.sha256("\n".join(items).encode("utf-8")).hexdigest()
        did = dt.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2).upper()
        when = dt.datetime.now().astimezone().isoformat(timespec="seconds")
        prize = (prize or "Prize draw").strip()
        self._record(did, when, prize, label, len(items), fp, picked)
        secs = max(3.0, min(float(seconds or 7), 30.0))
        names = sorted(items, key=lambda _: secrets.randbelow(1 << 30))[:200]      # a random sample for the spinning reel
        self.core.ui({"t": "draw", "action": "run", "id": did, "prize": prize, "pool": label, "size": len(items), "winners": picked,
                      "reel": names, "seconds": secs, "when": when, "fingerprint": fp[:16]})
        return {"id": did, "prize": prize, "winners": picked, "pool": label, "size": len(items), "fingerprint": fp, "seconds": secs}

    def _record(self, did, when, prize, label, size, fp, picked):
        try:
            self.folder.mkdir(parents=True, exist_ok=True)
            new = not self.log.exists()
            with open(self.log, "a", newline="", encoding="utf-8") as fh:
                w = csv.writer(fh)
                if new:
                    w.writerow(["draw_id", "time", "prize", "pool", "pool_size", "pool_sha256", "winners", "method"])
                w.writerow([did, when, prize, label, size, fp, " | ".join(picked), "secrets.SystemRandom (OS cryptographic RNG)"])
        except Exception:
            pass

    def history(self, n=8):
        try:
            rows = list(csv.DictReader(open(self.log, encoding="utf-8")))[-n:]
        except Exception:
            return []
        return rows[::-1]

    # ---- tool ----
    def handle(self, name, a):
        if name not in DRAW_NAMES:
            return None
        act = str(a.get("action") or "draw").lower()
        if act == "open":
            self.core.ui({"t": "draw", "action": "open"})
            return "The Live Draw panel is open."
        if act == "history":
            rows = self.history()
            if not rows:
                return "No draws recorded yet."
            return "Recent draws (newest first):\n" + "\n".join("%s  %s: %s (from %s)" % (r["time"][:16], r["prize"], r["winners"], r["pool"]) for r in rows)
        try:
            r = self.run(a.get("prize"), a.get("tickets"), a.get("entries"), a.get("winners") or 1, a.get("exclude"), a.get("seconds") or 7)
        except ValueError as e:
            return str(e)
        who = ", ".join(("ticket #%s" % w) if w.isdigit() else w for w in r["winners"])
        return ("Draw %s for %s: %s, picked at random from %s. Recorded in Documents/WINNERS Draws/draws.csv. The reveal is playing on screen "
                "now (about %d seconds); build a little suspense, then announce: %s." % (r["id"], r["prize"], who, r["pool"],
                                                                                           int(r["seconds"] * len(r["winners"])), who))
