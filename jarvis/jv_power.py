"""JARVIS-3 power layer: deep background research, standing orders (what JARVIS does without being told), and autopilot.

deep_research   plans search queries, reads many sources in parallel, takes notes, finds gaps, searches again, and writes a
                cited report to Documents/JARVIS Research (and into his skill folder so he remembers it). Runs in the background;
                several can run at once.
standing orders a plain-text file (~/.jarvis/standing_orders.md, editable in Configuration) that is part of every prompt:
                how independent to be, what to do proactively, house rules.
autopilot       give him a goal and he works on it by himself: plan, act with every tool (optionally the screen too), verify,
                fix, continue, report. Long jobs keep a progress log.
"""
import concurrent.futures as cf
import datetime as dt
import json, re, threading, time
from pathlib import Path

S_, N_, B_ = "STRING", "NUMBER", "BOOLEAN"


def _t(name, desc, props=None, req=()):
    p = {k: {"type": v[0], "description": v[1]} for k, v in (props or {}).items()}
    return {"name": name, "description": desc, "parameters": {"type": "OBJECT", "properties": p, **({"required": list(req)} if req else {})}}


POWER_TOOLS = [
    _t("deep_research", "Research a topic thoroughly in the background, the way a human analyst would: many searches, many sources read, follow-up "
       "searches for gaps, then a cited report saved to Documents/JARVIS Research and remembered in your skill folder. Use it for anything that "
       "needs more than a quick answer (comparisons, how-tos, buying decisions, technical deep dives, news round-ups). It reports back when done; "
       "you can keep talking meanwhile. depth: quick (~1 min), normal (~3 min) or deep (~8 min).",
       {"topic": (S_, "What to research, as a precise question"), "depth": (S_, "quick, normal (default) or deep")}, ["topic"]),
    _t("autopilot", "Work on a goal by yourself until it is done: you plan it, carry it out with all your tools, check the result, fix problems and "
       "report. start begins one in the background (use_screen true lets it use the mouse, keyboard and screen, so only when the user is not "
       "using the PC or asked for it); status shows progress; stop cancels. Use it for multi-step jobs the user wants done without supervising "
       "(build a Roblox map through the Studio MCP, set up a project, organise files, debug and fix a script, prepare a report).",
       {"action": (S_, "start, status or stop"), "goal": (S_, "start: the goal and what done looks like"), "use_screen": (B_, "start: allow screen, mouse and keyboard tools"),
        "minutes": (N_, "start: time budget, default 30, max 240"), "id": (S_, "status / stop: the job id")}, ["action"]),
    _t("standing_orders", "Read or update your standing orders: the user's permanent instructions for how you work when they are not directing you. "
       "read shows them; add appends a rule the user just gave you ('from now on, always...'); replace rewrites them (only when asked).",
       {"action": (S_, "read, add or replace"), "text": (S_, "add / replace: the rule(s)")}, ["action"]),
]
POWER_NAMES = {t["name"] for t in POWER_TOOLS}

DEFAULT_ORDERS = """# Standing orders
These are your permanent instructions. Follow them whenever the user is not directing you step by step.

## Autonomy
- Act, don't ask, for anything safe and reversible. Ask one short question only when the request is truly ambiguous or an action is
  destructive, costs money, or sends something to another person.
- Finish the job. Break big requests into steps, do every step, verify the result (look, read back, run tests), fix what failed, and
  only then report. Never stop at "here is how you could do it" when you can do it yourself.
- When something fails, try at least three different approaches (another tool layer, a script, research the error) before reporting.
- Research before guessing: unfamiliar software, APIs, errors or current facts -> research or deep_research first.
- Long or multi-part work -> autopilot or start_background_task so the user is not kept waiting.

## Building and debugging
- For Roblox Studio and Blender, prefer their MCP tools (servers named roblox / blender) when connected; otherwise run_script.
- To debug: reproduce the problem, read the full error and logs, form a hypothesis, change one thing, re-run, repeat until it works.
- Save working solutions with skill_save so you are faster next time; record pitfalls with skill_lesson.

## Showing things
- When explaining something physical or spatial (a machine, a molecule, a building, a game map, a plan), build a hologram of it.
- Use the calendar UI and the holographic Earth whenever they make an answer clearer.

## My own rules
(Add your own here, e.g. "Always save research to OneDrive", "Never close my browser tabs", "Use metric units".)
"""


def _ask(core, system, prompt, max_tokens=1500):
    import jv_models
    return jv_models.gemini_text(core.cfg, system, prompt, max_tokens=max_tokens) or ""


def _json_list(text):
    m = re.search(r"\[.*\]", text or "", re.S)
    try:
        v = json.loads(m.group(0)) if m else []
        return [str(x).strip() for x in v if str(x).strip()]
    except Exception:
        return [l.strip(" -*•\"'0123456789.").strip() for l in (text or "").splitlines() if len(l.strip()) > 8][:8]


class Power:
    def __init__(self, core, data_dir, search_fn, fetch_fn):
        self.core, self.dir = core, Path(data_dir)
        self.search, self.fetch = search_fn, fetch_fn
        self.orders_file = self.dir / "standing_orders.md"
        if not self.orders_file.exists():
            self.orders_file.write_text(DEFAULT_ORDERS, encoding="utf-8")

    # ---- standing orders ----
    def orders(self):
        try:
            return self.orders_file.read_text(encoding="utf-8")[:6000]
        except Exception:
            return ""

    def handle(self, name, a, job=None):
        if name not in POWER_NAMES:
            return None
        a = a or {}
        if name == "standing_orders":
            act = str(a.get("action") or "read").lower()
            if act == "read":
                return self.orders()
            text = str(a.get("text") or "").strip()
            if not text:
                return "Give the text."
            if act == "add":
                with open(self.orders_file, "a", encoding="utf-8") as fh:
                    fh.write("\n- " + text.replace("\n", " ") + "\n")
                return "Added to your standing orders: %s" % text
            if act == "replace":
                self.orders_file.write_text(text, encoding="utf-8")
                return "Standing orders replaced."
            return "Use read, add or replace."
        if name == "deep_research":
            return self.start_research(str(a.get("topic") or ""), str(a.get("depth") or "normal"))
        if name == "autopilot":
            act = str(a.get("action") or "").lower()
            if act == "start":
                return self.core.agent.start(str(a.get("goal") or ""), screen=bool(a.get("use_screen")),
                                             minutes=max(5, min(240, int(float(a.get("minutes") or 30)))), autopilot=True)
            if act == "status":
                return self.core.jobs.describe(str(a.get("id"))) if a.get("id") else self.core.tool("job_status", {})
            if act == "stop":
                return self.core.jobs.cancel(str(a.get("id") or ""))
            return "Use start, status or stop."

    # ---- deep research ----
    def start_research(self, topic, depth):
        topic = topic.strip()
        if not topic:
            return "Give a topic."
        if self.core.cfg.get("offline_mode"):
            return "Offline mode is on, so I cannot research online."
        try:
            job = self.core.jobs.create("research", "Research: " + topic[:60])
        except RuntimeError as e:
            return str(e)
        threading.Thread(target=self._research, args=(job, topic, depth), daemon=True).start()
        return "Started research job %s on '%s' (%s). I'll report back when the report is ready; carry on meanwhile." % (job.id, topic, depth)

    def _research(self, job, topic, depth):
        core = self.core
        rounds, per_round, pages = {"quick": (1, 4, 5), "deep": (3, 6, 10)}.get(depth, (2, 5, 7))
        notes, sources, seen = [], [], set()
        sysmsg = "You are a meticulous research analyst. Be factual, specific and concise. Never invent sources or numbers."
        try:
            queries = _json_list(_ask(core, sysmsg, "Topic: %s\nToday is %s.\nWrite %d diverse web search queries that together cover this topic well "
                                                    "(official docs, recent news, expert comparisons, practical guides). Reply with a JSON list of strings only."
                                      % (topic, dt.date.today().isoformat(), per_round), 400))[:per_round] or [topic]
            for rnd in range(rounds):
                if job.cancel_flag:
                    return core.jobs.finish(job, "cancelled", "Cancelled.")
                core.jobs.set_progress(job, "round %d: searching %d queries" % (rnd + 1, len(queries)))
                hits = []
                with cf.ThreadPoolExecutor(6) as ex:
                    for res in ex.map(lambda q: self._safe(self.search, q, 6) or [], queries):
                        for title, snip, url in res:
                            if url not in seen and not re.search(r"(youtube\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com/)", url):
                                seen.add(url)
                                hits.append((title, snip, url))
                hits = hits[:pages]
                core.jobs.set_progress(job, "round %d: reading %d sources" % (rnd + 1, len(hits)))
                with cf.ThreadPoolExecutor(6) as ex:
                    texts = list(ex.map(lambda h: (h, self._safe(self.fetch, h[2], 60000) or h[1]), hits))
                for (title, snip, url), text in texts:
                    if job.cancel_flag:
                        return core.jobs.finish(job, "cancelled", "Cancelled.")
                    body = re.sub(r"\s+", " ", text or "")[:7000]
                    if len(body) < 200:
                        continue
                    n = len(sources) + 1
                    sources.append((title or url, url))
                    core.jobs.set_progress(job, "reading [%d] %s" % (n, (title or url)[:50]))
                    note = self._safe(_ask, core, sysmsg, "Research topic: %s\nSource [%d]: %s (%s)\n---\n%s\n---\nExtract the facts from this source that matter "
                                                          "for the topic as short bullet points, each ending with [%d]. Include numbers, versions, dates and names. "
                                                          "If it is irrelevant, reply IRRELEVANT." % (topic, n, title, url, body, n), 700) or ""
                    if note and "IRRELEVANT" not in note[:20]:
                        notes.append(note.strip())
                if rnd < rounds - 1 and notes:
                    queries = _json_list(self._safe(_ask, core, sysmsg, "Topic: %s\nNotes so far:\n%s\nWhat important questions are still unanswered or contradictory? "
                                                                        "Write %d new web search queries to fill those gaps. JSON list only."
                                                    % (topic, "\n".join(notes)[-6000:], per_round), 400) or "")[:per_round]
                    if not queries:
                        break
            if not notes:
                return core.jobs.finish(job, "failed", "I could not read enough sources on that (blocked pages or no results).")
            core.jobs.set_progress(job, "writing the report")
            refs = "\n".join("[%d] %s - %s" % (i + 1, t, u) for i, (t, u) in enumerate(sources))
            report = _ask(core, sysmsg, "Write a clear research report in Markdown on: %s\nStart with a 3-5 sentence summary that directly answers it, then sections "
                                        "with the details, a short 'Recommendations' or 'What to do' section if relevant, and keep every claim cited like [3]. "
                                        "Use only these notes:\n%s\n\nSources:\n%s" % (topic, "\n".join(notes)[-24000:], refs), 3000)
            report = "# %s\n_Researched by JARVIS on %s · %d sources_\n\n%s\n\n## Sources\n%s\n" % (topic, dt.datetime.now().strftime("%d %B %Y %H:%M"), len(sources), report.strip(), refs)
            folder = Path.home() / "Documents" / "JARVIS Research"
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / ("%s %s.md" % (dt.date.today().isoformat(), re.sub(r"[^\w\- ]", "", topic)[:60].strip() or "research"))
            path.write_text(report, encoding="utf-8")
            try:
                core.skills.save("general", "Research: " + topic[:100], report[:18000], "knowledge")
            except Exception:
                pass
            summary = report.split("\n\n", 2)[2][:600] if report.count("\n\n") >= 2 else report[:600]
            core.jobs.finish(job, "done", "Report saved to %s. Summary: %s" % (path, summary))
        except Exception as e:
            core.jobs.finish(job, "failed", "%s: %s" % (type(e).__name__, str(e)[:240]))

    @staticmethod
    def _safe(fn, *a):
        try:
            return fn(*a)
        except Exception:
            return None
