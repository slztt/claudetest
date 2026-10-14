"""WINNERS Bot Homework mode: a tab where you ask homework questions and WINNERS Bot answers them in text and out loud.

You choose the level, how long and how detailed. Answers are correct, show the working where it matters, and are written
in clear, plain, natural English at your level, so you can follow them and learn from them. Questions can be typed,
spoken, or read straight off the screen (a worksheet, a PDF, a website). Every answer is saved to Documents/WINNERS Bot Homework.
"""
import datetime as dt
import re
import threading
import time
from pathlib import Path

import jv_models

S_, N_, B_ = "STRING", "NUMBER", "BOOLEAN"

HOMEWORK_TOOLS = [{
    "name": "homework",
    "description": "Homework mode. open shows the Homework tab; close hides it. answer works out the answer to a homework question "
                   "(typed, spoken, or from_screen to read the question off the user's screen), shows it in the tab and returns it so you "
                   "can read it out. Use the user's wishes for length (e.g. '200 words', 'one paragraph', 'short'), level (e.g. 'Year 9', "
                   "'GCSE', 'A-level', 'university') and detail ('answer only', 'with working', 'full explanation'). After answer, read the "
                   "answer aloud unless the user said text only. read reads the last answer aloud again.",
    "parameters": {"type": "OBJECT", "properties": {
        "action": {"type": "STRING", "description": "open, close, answer or read"},
        "question": {"type": "STRING", "description": "answer: the question(s), word for word"},
        "subject": {"type": "STRING", "description": "answer: subject, e.g. maths, history, English, biology (optional)"},
        "level": {"type": "STRING", "description": "answer: school year or level (optional)"},
        "length": {"type": "STRING", "description": "answer: how long, e.g. 'short', 'one paragraph', '300 words', '2 pages'"},
        "detail": {"type": "STRING", "description": "answer: 'answer only', 'with working' or 'full explanation'"},
        "from_screen": {"type": "BOOLEAN", "description": "answer: read the question(s) from the user's screen"},
    }, "required": ["action"]},
}]
HOMEWORK_NAMES = {t["name"] for t in HOMEWORK_TOOLS}

SYSTEM = (
    "You are an expert, patient tutor helping a student with homework. Get the answer right: think it through carefully, check "
    "calculations, dates and facts, and say so plainly if a question is ambiguous. Write the way a clear, thoughtful person writes: "
    "plain natural English pitched at the student's level, varied sentence length, concrete wording, no filler or padding, no emoji, "
    "and no preamble. Use headings or bullet points only when the question calls for a list or the student asked for them. For maths "
    "and science show each step of the working on its own line with the reasoning, and give the final answer clearly at the end "
    "(with units). For essays and long answers use paragraphs with a clear point in each. Match the requested length closely.")


def _words(length):
    """Rough target word count for a length request."""
    t = (length or "").lower()
    m = re.search(r"(\d+)\s*(words?|w\b)", t)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*pages?", t)
    if m:
        return int(float(m.group(1)) * 450)
    for k, v in (("one sentence", 30), ("sentence", 40), ("short", 80), ("brief", 80), ("one paragraph", 150), ("paragraph", 150),
                 ("long", 600), ("essay", 800), ("detailed", 500)):
        if k in t:
            return v
    return 0


class Homework:
    def __init__(self, core):
        self.core = core
        self.last = {"question": "", "answer": ""}
        self.lock = threading.Lock()
        self.folder = Path.home() / "Documents" / "WINNERS Bot Homework"

    def ui(self, **ev):
        self.core.ui({"t": "homework", **ev})

    def answer(self, question, subject="", level="", length="", detail="", image=None):
        question = (question or "").strip()
        if not question and not image:
            return {"error": "Give the question."}
        words = _words(length)
        want = []
        if subject:
            want.append("Subject: %s." % subject)
        if level:
            want.append("Level: %s; use vocabulary and methods taught at that level." % level)
        if words:
            want.append("Length: about %d words (stay within 10%%)." % words)
        elif length:
            want.append("Length: %s." % length)
        d = (detail or "").lower()
        if "only" in d or "just" in d:
            want.append("Give just the answer(s), no explanation, but keep any required working for maths.")
        elif "full" in d or "explain" in d:
            want.append("Give the answer, then explain how you got there step by step so the student fully understands it, and end "
                        "with one short tip for similar questions.")
        else:
            want.append("Give the answer with the key working or reasoning.")
        if image is not None:
            want.append("The question(s) are in the attached screenshot. Answer every homework question visible on it, numbered "
                        "as on the sheet. Ignore menus, buttons and anything that is not a question.")
        prompt = "%s\n\nHOMEWORK QUESTION(S):\n%s" % (" ".join(want), question or "(see screenshot)")
        budget = min(16000, 3000 + max(words, 400) * 3)
        text = jv_models.gemini_text(self.core.cfg, SYSTEM, prompt, max_tokens=budget, temperature=0.5,
                                     images=[image] if image else None)
        text = re.sub(r"^(Sure|Certainly|Of course|Great question)[^\n]*\n+", "", text.strip(), flags=re.I)
        with self.lock:
            self.last = {"question": question or "(from screen)", "answer": text}
        self._save(question or "(from screen)", text, subject)
        return {"answer": text, "words": len(text.split())}

    def _save(self, q, a, subject):
        try:
            self.folder.mkdir(parents=True, exist_ok=True)
            f = self.folder / ("%s%s.md" % (dt.date.today().isoformat(), (" " + re.sub(r"[^\w\- ]", "", subject)[:30]) if subject else ""))
            with open(f, "a", encoding="utf-8") as fh:
                fh.write("## %s\n\n**Question:** %s\n\n%s\n\n" % (dt.datetime.now().strftime("%H:%M"), q, a))
        except Exception:
            pass

    def speak(self, text=None):
        text = (text or self.last.get("answer") or "").strip()
        if not text:
            return False
        spoken = re.sub(r"[#*_`>|]", "", text)
        return self.core.brain.say_to_jarvis("[System] Read the following homework answer aloud to the user, word for word, "
                                             "naturally and clearly, without adding anything before or after it:\n\n" + spoken[:12000])

    # ---- the tool ----
    def handle(self, name, a):
        if name not in HOMEWORK_NAMES:
            return None
        act = str(a.get("action") or "open").lower()
        if act == "open":
            self.ui(action="open")
            return "The Homework tab is open. Ask the question (or say 'it's on my screen')."
        if act == "close":
            self.ui(action="close")
            return "Homework tab closed."
        if act == "read":
            return "Read this aloud to the user:\n" + self.last["answer"] if self.last.get("answer") else "There is no answer yet."
        if act == "answer":
            img = None
            if a.get("from_screen"):
                win = getattr(self.core, "window", None)
                try:
                    if win:                          # step aside so the worksheet behind WINNERS Bot is visible
                        win.minimize()
                        time.sleep(0.7)
                    img, _ = self.core.comp.screenshot("screen")
                except Exception as e:
                    return "Could not see the screen: %s" % e
                finally:
                    try:
                        win and win.restore()
                    except Exception:
                        pass
            opts = {k: str(a.get(k) or "") for k in ("subject", "level", "length", "detail")}
            self.ui(action="working", question=str(a.get("question") or "(reading your screen)"), opts=opts)
            r = self.answer(str(a.get("question") or ""), image=img, **opts)
            if r.get("error"):
                self.ui(action="error", text=r["error"])
                return r["error"]
            self.ui(action="show", question=self.last["question"], answer=r["answer"], opts=opts)
            return ("The answer (%d words) is on screen in the Homework tab and saved to Documents/WINNERS Bot Homework. Now read it aloud "
                    "to the user word for word:\n\n%s" % (r["words"], r["answer"]))
        return "Use open, close, answer or read."
