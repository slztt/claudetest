"""WINNERS Bot tool layer.

Declares the new tools and implements them on top of jv_exec (scripts, jobs, files, processes), jv_skills (the skill
folder) and jv_knowledge (research). winners.py hands every tool call here first; a name that is not ours returns None.

Rules this layer enforces in code, not just in the prompt:
  * research before acting: for Roblox / Discord / Blender / Google work, run_script refuses until research() was called;
  * exact work: every script is saved to disk, run by the right interpreter, logged, and checked against expect_files /
    expect_output; nothing is called a success unless that check passed;
  * learning: verified scripts become recipes, failures become lessons, both in the skill folder;
  * permissions: each category (files, processes, scripts, admin, network) has its own policy from Settings.
"""
import html as htmllib
import re, threading, time, urllib.parse, urllib.request
from pathlib import Path
from urllib.parse import quote

import jv_exec as X
from jv_knowledge import infer_domain, research as do_research
from jv_skills import SPECIALIST, norm_domain, slugify

S_, N_, B_ = "STRING", "NUMBER", "BOOLEAN"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
MAX_FOREGROUND = 45           # seconds a script may block the conversation; longer ones go to the background
MAX_ATTEMPTS = 3
RESEARCH_VALID = 20 * 60      # a research call counts for this long
EXEC_EXT = {".exe", ".msi", ".bat", ".cmd", ".ps1", ".scr", ".vbs", ".jar", ".dll", ".sh", ".apk", ".com", ".lnk"}
PERM_LEVELS = ("off", "risky", "always", "allow")
PERM_CATS = ("files", "processes", "scripts", "admin", "network")
PERM_DEFAULTS = {"files": "risky", "processes": "risky", "scripts": "risky", "admin": "always", "network": "risky"}


def _b(v):
    return v in (True, "true", "True", "TRUE", 1, "1")


def _t(name, desc, props=None, req=()):
    p = {k: {"type": v[0], "description": v[1]} for k, v in (props or {}).items()}
    return {"name": name, "description": desc,
            "parameters": {"type": "OBJECT", "properties": p, **({"required": list(req)} if req else {})}}


NEW_TOOLS = [
    _t("research", "ALWAYS call this BEFORE doing work in Roblox Studio, Roblox, Discord, Blender or Google, and before any unfamiliar or exact task. "
       "It reads your skill folder (verified recipes and lessons), asks Google-grounded search, and reads the official documentation, then returns the "
       "exact current API names, signatures and pitfalls. Use what it returns; do not rely on memory for APIs.",
       {"topic": (S_, "Exactly what you are about to do or need to know, e.g. 'Blender bpy render scene to PNG headless'"),
        "domain": (S_, "roblox-studio, roblox, discord, blender, google, windows or general (optional, guessed if empty)")}, ["topic"]),
    _t("run_script", "Do work with an exact script instead of improvising. Writes the script to disk, runs it with the right interpreter, captures the output "
       "and CHECKS the result. Languages: python, powershell, bash, cmd, node, blender (runs bpy headless in Blender), luau (installs a Roblox Studio plugin "
       "button; Studio itself runs it). Always give expect_files and/or expect_output so the result is verified. A verified script is saved to the skill "
       "folder automatically. If it fails, read the error, fix the script and call again (3 attempts), then report honestly. Use background true for anything that takes "
       "longer than about two minutes. admin true asks for administrator rights.",
       {"language": (S_, "python, powershell, bash, cmd, node, blender or luau"), "code": (S_, "The complete script"),
        "name": (S_, "Short name for the script"), "task": (S_, "One sentence: what this script is meant to achieve (used to learn from it)"),
        "domain": (S_, "roblox-studio, roblox, discord, blender, google, windows or general"),
        "expect_files": (S_, "Files or folders that must exist afterwards, separated by ; (desktop/downloads shortcuts work)"),
        "expect_output": (S_, "Text that must appear in the output, several separated by ||. Make the script print it on success."),
        "args": (S_, "Command line arguments (optional)"), "blend_file": (S_, "blender only: a .blend file to open first (optional)"),
        "timeout": (N_, "Seconds allowed (default 60)"), "background": (B_, "True to run it as a background job and return at once"),
        "admin": (B_, "True to run with administrator rights (the user is asked)"), "sources": (S_, "Doc pages the script is based on (optional)")},
       ["language", "code", "task"]),
    _t("script_outcome", "Tell the skill folder how the LAST script actually turned out, when you could only find out afterwards (for example a Roblox Studio "
       "plugin the user ran, or something the user checked). worked true saves it as a proven recipe; false records the lesson.",
       {"worked": (B_, "True if it did what was wanted"), "notes": (S_, "What happened, or what went wrong")}, ["worked"]),
    _t("start_background_task", "Hand a whole goal to a background worker that researches, scripts, verifies and reports back on its own while you carry on "
       "talking to the user. Use when the user says to do something in the background, or the job is long or has many steps. Write the goal completely: "
       "what must exist at the end, paths, names and constraints.",
       {"goal": (S_, "The complete goal"), "name": (S_, "Short label")}, ["goal"]),
    _t("job_status", "Check a background job (script or task), or list all jobs when no id is given.", {"job_id": (S_, "e.g. J2 (optional)")}),
    _t("cancel_job", "Stop a running background job.", {"job_id": (S_, "e.g. J2")}, ["job_id"]),
    _t("skill_search", "Search your skill folder: knowledge notes, proven recipes and lessons learned from earlier failures.",
       {"query": (S_, "What you are looking for"), "domain": (S_, "Optional domain")}, ["query"]),
    _t("skill_read", "Read one skill in full, by 'domain/name' as shown by skill_search.", {"name": (S_, "domain/slug or title")}, ["name"]),
    _t("skill_save", "Save something useful you learned or worked out to the skill folder (a fact, a method, a gotcha). Be specific and factual.",
       {"domain": (S_, "roblox-studio, roblox, discord, blender, google, windows or general"), "title": (S_, "Short title"),
        "content": (S_, "The note, markdown, include a short working example when there is one"), "tags": (S_, "Space-separated keywords")},
       ["domain", "title", "content"]),
    _t("skill_lesson", "Record a mistake or pitfall so it is never repeated (for example 'Blender 4.x renamed X to Y').",
       {"domain": (S_, "Domain"), "lesson": (S_, "One or two sentences: what went wrong and what to do instead")}, ["domain", "lesson"]),
    _t("file_ops", "Exact file operations: exists, info, hash, mkdir, copy, move, delete (goes to a recoverable trash), zip, unzip.",
       {"action": (S_, "exists, info, hash, mkdir, copy, move, delete, zip or unzip"), "path": (S_, "Source path"),
        "destination": (S_, "Destination (copy, move, zip, unzip)"), "overwrite": (B_, "Replace an existing destination")}, ["action", "path"]),
    _t("process_control", "List running programs (busiest first) or end one by name or PID.",
       {"action": (S_, "list or kill"), "target": (S_, "Name fragment or PID (kill), or a filter (list)")}, ["action"]),
    _t("download_file", "Download a file from an https address to disk and report its size and checksum.",
       {"url": (S_, "https URL"), "destination": (S_, "File or folder path (downloads shortcut works)")}, ["url", "destination"]),
    _t("api_request", "Call a web API. service discord or roblox adds the user's saved credentials for you (and only sends them to that service's own servers): "
       "discord uses the bot token (url may be just a path such as /channels/ID/messages, or 'webhook' for the saved webhook); roblox uses the Open Cloud key. "
       "Use service custom for any other API.",
       {"service": (S_, "discord, roblox or custom"), "method": (S_, "GET, POST, PUT, PATCH or DELETE"), "url": (S_, "Full https URL, or a path for discord/roblox"),
        "body": (S_, "JSON body text (optional)"), "headers_json": (S_, "Extra headers as JSON (optional)")}, ["service", "url"]),
    _t("install_python_package", "Install Python packages with pip (for scripts that need them, e.g. requests, discord.py).",
       {"packages": (S_, "Space-separated PyPI names")}, ["packages"]),
    _t("find_program", "Find where a program is installed on this computer (Blender, Roblox Studio, anything).", {"name": (S_, "Program name")}, ["name"]),
]

NEW_NAMES = {t["name"] for t in NEW_TOOLS}


def _get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9",
                                                         "Accept": "text/html,application/xhtml+xml"})
    return urllib.request.urlopen(req, timeout=8).read(1_500_000).decode("utf-8", "replace")


def _ddg_html(q, n):
    page = _get("https://html.duckduckgo.com/html/", urllib.parse.urlencode({"q": q, "kl": "uk-en"}).encode())
    out = []
    for m in re.finditer(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</a>', page, re.S):
        href, title, snip = m.groups()
        if "uddg=" in href:
            href = urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
        out.append((_strip(title), _strip(snip), href))
    return out[:n]


def _ddg_lite(q, n):
    page = _get("https://lite.duckduckgo.com/lite/", urllib.parse.urlencode({"q": q}).encode())
    links = re.findall(r"""<a[^>]+href=["']([^"']+)["'][^>]*class=['"]result-link['"][^>]*>(.*?)</a>""", page, re.S) or \
        re.findall(r"""<a[^>]+class=['"]result-link['"][^>]*href=["']([^"']+)["'][^>]*>(.*?)</a>""", page, re.S)
    snips = re.findall(r"""class=['"]result-snippet['"][^>]*>(.*?)</td>""", page, re.S)
    out = []
    for i, (href, title) in enumerate(links):
        if "uddg=" in href:
            href = urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
        out.append((_strip(title), _strip(snips[i]) if i < len(snips) else "", href))
    return out[:n]


def _bing(q, n):
    import base64
    page = _get("https://www.bing.com/search?" + urllib.parse.urlencode({"q": q, "setlang": "en", "count": str(max(10, n))}))
    out = []
    for block in re.findall(r'<li class="b_algo"(.*?)</li>', page, re.S):
        m = re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
        if not m:
            continue
        href, title = htmllib.unescape(m.group(1)), m.group(2)
        u = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("u", [""])[0]
        if "bing.com/ck/" in href and u.startswith("a1"):
            try:
                href = base64.urlsafe_b64decode(u[2:] + "=" * (-len(u[2:]) % 4)).decode("utf-8", "replace")
            except Exception:
                pass
        sn = re.search(r'<p[^>]*>(.*?)</p>', block, re.S)
        out.append((_strip(title), _strip(sn.group(1)) if sn else "", href))
    return out[:n]


SEARCH_ENGINES = (_ddg_html, _bing, _ddg_lite)
GROUNDED = None          # set by WINNERS Bot: Google Search through Gemini, the last resort when every engine blocks us
_bad = {}                # engine -> time it last failed, so a blocked engine is skipped for a while


def search_results(q, n=8):
    """Web results as (title, snippet, url) tuples: DuckDuckGo, Bing, DuckDuckGo Lite, then Google through Gemini."""
    errors = []
    for eng in SEARCH_ENGINES:
        nm = eng.__name__.strip("_")
        if time.time() - _bad.get(nm, 0) < 600:
            continue
        try:
            res = [r for r in eng(q, n) if r[2].startswith("http")]
            if res:
                return res
            errors.append("%s: no results" % nm)
        except Exception as e:
            errors.append("%s: %s" % (nm, type(e).__name__))
        _bad[nm] = time.time()
    if GROUNDED:
        try:
            res = GROUNDED(q, n)
            if res:
                return res
            errors.append("google: no results")
        except Exception as e:
            errors.append("google: %s" % str(e)[:80])
    search_results.last_errors = errors
    return []


def _strip(s):
    s = re.sub(r"(?is)<(script|style|noscript|svg|head).*?</\1>", " ", s or "")
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", htmllib.unescape(s)).strip()


def fetch_text(url, limit=90000):
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError("bad url")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=12) as r:
        raw = r.read(2_000_000).decode("utf-8", "replace")
    return _strip(raw)[:limit]


class Toolbox:
    def __init__(self, core, resolve, is_risky, is_hard):
        self.core, self.resolve, self.is_risky, self.is_hard = core, resolve, is_risky, is_hard
        self.researched, self.sources, self.last, self.attempts = {}, {}, {}, {}
        self.lock = threading.Lock()

    # ---- small helpers -----------------------------------------------------------------------
    @property
    def cfg(self):
        return self.core.cfg

    @staticmethod
    def _ctx(job):
        return job.id if (job and job.kind == "agent") else "main"

    @staticmethod
    def _group(dom):
        return "roblox" if dom in ("roblox", "roblox-studio") else dom

    def handle(self, name, a, job=None):
        if name not in NEW_NAMES:
            return None
        return getattr(self, "t_" + name)(a or {}, job)

    def ground(self, prompt):
        """A Google-grounded Gemini answer: (text, [source names])."""
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=self.cfg["api_key"], http_options={"api_version": "v1beta"})
        import jv_models
        last = None
        for m in jv_models.text_models(self.cfg):
            try:
                r = client.models.generate_content(model=m, contents=prompt, config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0.1))
                names, links = [], []
                try:
                    for ch in (r.candidates[0].grounding_metadata.grounding_chunks or []):
                        if ch.web and (ch.web.title or ch.web.uri):
                            names.append(ch.web.title or ch.web.uri)
                            links.append((ch.web.title or ch.web.uri, ch.web.uri or ""))
                except Exception:
                    pass
                jv_models.worked(m)
                self.last_links = links
                return (r.text or ""), names
            except Exception as e:
                last = e
        raise last or RuntimeError("no model")

    def grounded_results(self, q, n=8):
        """Search results from Google through Gemini: [(title, snippet, url)]. The first carries Google's summary as its snippet."""
        text, _ = self.ground("Search the web thoroughly and give a detailed, factual answer with names, numbers and dates: %s" % q)
        links = [(t, u) for t, u in getattr(self, "last_links", []) if u.startswith("http")]
        out = [(t, (text if i == 0 else ""), u) for i, (t, u) in enumerate(links[:n])]
        if not out and text:
            out = [("Google summary", text, "https://www.google.com/search?q=" + urllib.parse.quote(q))]
        return out

    # ---- research --------------------------------------------------------------------------------
    def t_research(self, a, job):
        topic = str(a.get("topic") or a.get("query") or "").strip()
        if not topic:
            return "Give a topic: the exact thing you are about to do or need to know."
        dom = str(a.get("domain") or "").strip()
        text, sources, dom = do_research(topic, dom, self.core.skills, search_results, fetch_text,
                                         self.ground if self.cfg.get("api_key") else None,
                                         budget=float(self.cfg.get("research_budget", 26)))
        ctx = self._ctx(job)
        with self.lock:
            self.researched.setdefault(ctx, {})[self._group(dom)] = time.time()
            self.sources[ctx] = sources
        return text + (("\nSOURCES: " + "; ".join(sources)) if sources else "") + \
            "\nNow write the script from THIS information, and make it print a clear success line you can check with expect_output."

    def _need_research(self, dom, ctx):
        if not self.cfg.get("research_on", True) or dom not in SPECIALIST:
            return ""
        t = self.researched.get(ctx, {}).get(self._group(dom), 0)
        if time.time() - t < RESEARCH_VALID:
            return ""
        return ("RESEARCH REQUIRED: this is %s work and you have not researched it yet. Call research(topic, domain=\"%s\") first, with the exact thing "
                "you want to do, then write the script from what it returns. (The user can switch this rule off in Settings.)" % (dom, dom))

    # ---- scripts ---------------------------------------------------------------------------------
    def t_run_script(self, a, job):
        lang = X.norm_lang(a.get("language"))
        code = str(a.get("code") or "")
        if not lang:
            return "Unsupported language '%s'. Use python, powershell, bash, cmd, node, blender or luau." % a.get("language")
        if not code.strip():
            return "No code was given."
        task = str(a.get("task") or a.get("name") or "script").strip()
        name = str(a.get("name") or task)[:40]
        dom = norm_domain(a.get("domain")) if a.get("domain") else ""
        if not dom or dom == "general":
            dom = "blender" if lang == "blender" else "roblox-studio" if lang == "luau" else infer_domain(task, code[:1500], str(a.get("domain") or ""))
        ctx = self._ctx(job)
        need = self._need_research(dom, ctx)
        if need:
            return need
        key = (ctx, task.lower()[:80])
        if self.attempts.get(key, 0) >= MAX_ATTEMPTS:
            return ("STOP: three attempts at this task have already failed. Do not try again. Tell the user plainly what failed and what would be needed "
                    "(see the lessons in the skill folder).")
        if lang == "luau":
            return self._luau(code, name, task, dom, ctx)
        lvl = X.assess(lang, code, self.is_risky, self.is_hard)
        admin = _b(a.get("admin"))
        preview = "%s script: %s\n\n%s" % (lang, task, code.strip()[:600])
        if admin and not self.core.gate("admin", "Run with ADMINISTRATOR rights?", preview, risky=True, hard=(lvl == "hard")):
            return "The user DENIED authorisation (or administrator scripts are switched off in Settings). Do not work around it."
        if not self.core.gate("scripts", "Run this script?", preview, risky=(lvl != "safe"), hard=(lvl == "hard")):
            return "The user DENIED authorisation (or scripts are switched off in Settings). Do not run it or attempt a workaround."
        try:
            timeout = max(5, min(float(a.get("timeout") or 40), 3600))
        except Exception:
            timeout = 40
        spec = {"lang": lang, "code": code, "name": name, "args": a.get("args") or "", "blend": str(a.get("blend_file") or ""), "timeout": timeout,
                "admin": admin, "expect_files": str(a.get("expect_files") or ""), "expect_output": str(a.get("expect_output") or "")}
        notes, sources = str(a.get("notes") or ""), str(a.get("sources") or "") or "; ".join(self.sources.get(ctx, [])[:4])
        if self.cfg.get("dry_run"):
            path = self.core.runner.write(lang, code, name)
            return "DRY RUN: the script was saved to %s but NOT executed (dry-run mode is on in Settings). Review it and tell the user." % path
        want_bg = _b(a.get("background"))
        if (timeout > MAX_FOREGROUND) and not want_bg:
            want_bg = True
        if want_bg:
            try:
                bj = self.core.jobs.create("script", name)
            except RuntimeError as e:
                return str(e)
            threading.Thread(target=self._bg_script, args=(spec, bj, dom, task, ctx, sources), daemon=True).start()
            return "Started as background job %s (%s). It will report when finished; use job_status to check it." % (bj.id, name)
        res = self.core.runner.execute(spec, job=job)
        return self._finish(res, spec, dom, task, ctx, sources, key, notes)

    def _bg_script(self, spec, bj, dom, task, ctx, sources):
        try:
            self.core.jobs.set_progress(bj, "running %s script" % spec["lang"])
            res = self.core.runner.execute(spec, job=bj)
            text = self._finish(res, spec, dom, task, ctx, sources, (ctx, task.lower()[:80]), "")
            status = "cancelled" if res["cancelled"] else "done" if res["ok"] else "failed"
            self.core.jobs.finish(bj, status, text[:900])
        except Exception as e:
            self.core.jobs.finish(bj, "failed", "%s: %s" % (type(e).__name__, str(e)[:240]))

    def _finish(self, res, spec, dom, task, ctx, sources, key, notes):
        text = X.format_result(res, spec)
        lang, learn = spec["lang"], self.cfg.get("learn_on", True)
        sk = self.core.skills
        sk.log_run(dom, lang, task, res["ok"], res["secs"], res["verified"])
        with self.lock:
            self.last[ctx] = {"lang": lang, "code": spec["code"], "task": task, "dom": dom, "sources": sources}
        if res["ok"] and res["verified"]:
            self.attempts.pop(key, None)
            if learn:
                where = sk.record_success(dom, task, lang, spec["code"], notes, sources)
                text += "\nLearned: saved as a proven recipe (%s)." % where
        elif res["ok"]:
            text += "\nVerify it another way (read the file, check the state) before telling the user it worked, or call again with expect_files/expect_output."
        elif not res["cancelled"] and not res.get("error"):
            self.attempts[key] = self.attempts.get(key, 0) + 1
            n = self.attempts[key]
            if learn:
                sk.note_failure(dom, task, lang, res["out"] or ("exit code %s" % res["code"]))
            text += ("\nAttempt %d of %d. Read the error, fix the cause (check the research notes and lessons), and call run_script again."
                     % (n, MAX_ATTEMPTS)) if n < MAX_ATTEMPTS else "\nThat was the third failed attempt: stop and report honestly."
        return text

    def _luau(self, code, name, task, dom, ctx):
        if not self.core.gate("scripts", "Install a Roblox Studio plugin?", "Luau: %s\n\n%s" % (task, code.strip()[:600]), risky=False):
            return "The user DENIED authorisation (or scripts are switched off in Settings)."
        folder = X.studio_plugins_dir()
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / ("WINNERS Bot-%s.lua" % slugify(name))
        path.write_text(X.luau_plugin(code, name), encoding="utf-8")
        self.core.skills.log_run(dom, "luau", task, True, 0.0, None)
        with self.lock:
            self.last[ctx] = {"lang": "luau", "code": code, "task": task, "dom": dom, "sources": "; ".join(self.sources.get(ctx, [])[:4])}
        return ("NOT RUN YET, NOT VERIFIED: the Luau script was written as a Studio plugin at %s. Roblox Studio only runs it when the user clicks the "
                "'%s' button on the WINNERS Bot toolbar (Plugins tab). Studio loads new plugin files when it starts, so tell the user to restart Studio, or use "
                "Plugins > Manage Plugins to reload it. Then ask whether it worked and call script_outcome." % (path, name))

    def t_script_outcome(self, a, job):
        ctx = self._ctx(job)
        last = self.last.get(ctx)
        if not last:
            return "There is no recent script to report on."
        worked = _b(a.get("worked"))
        notes = str(a.get("notes") or "")
        sk = self.core.skills
        if worked:
            where = sk.record_success(last["dom"], last["task"], last["lang"], last["code"], notes, last["sources"])
            sk.log_run(last["dom"], last["lang"], last["task"], True, 0.0, True)
            return "Recorded as a proven recipe (%s)." % where
        sk.note_failure(last["dom"], last["task"], last["lang"], notes or "reported as not working")
        sk.log_run(last["dom"], last["lang"], last["task"], False, 0.0, False)
        return "Recorded as a lesson. Work out what went wrong, research again if needed, and try a corrected script."

    # ---- background work -------------------------------------------------------------------------
    def t_start_background_task(self, a, job):
        try:
            return self.core.agent.start(str(a.get("goal") or ""), str(a.get("name") or ""))
        except RuntimeError as e:
            return str(e)

    def t_job_status(self, a, job):
        jid = str(a.get("job_id") or "").strip()
        return self.core.jobs.describe(jid) if jid else self.core.jobs.text_listing()

    def t_cancel_job(self, a, job):
        return self.core.jobs.cancel(str(a.get("job_id") or ""))

    # ---- skill folder ----------------------------------------------------------------------------
    def t_skill_search(self, a, job):
        hits = self.core.skills.search(str(a.get("query") or ""), str(a.get("domain") or ""), 5)
        return self.core.skills.format_hits(hits, 700) if hits else "Nothing relevant in the skill folder yet."

    def t_skill_read(self, a, job):
        it = self.core.skills.find(str(a.get("name") or ""))
        if not it:
            return "No such skill. Use skill_search to see what exists."
        return "[%s/%s] %s\n%s" % (it["domain"], it["slug"], it["title"], it["body"].strip()[:6000])

    def t_skill_save(self, a, job):
        title, body = str(a.get("title") or "").strip(), str(a.get("content") or "").strip()
        if not title or not body:
            return "A title and content are needed."
        where = self.core.skills.save(str(a.get("domain") or "general"), title, body[:12000], "knowledge", str(a.get("tags") or ""),
                                      "; ".join(self.sources.get(self._ctx(job), [])[:3]))
        return "Saved to the skill folder as %s." % where

    def t_skill_lesson(self, a, job):
        where = self.core.skills.lesson(str(a.get("domain") or "general"), str(a.get("lesson") or ""))
        return "Lesson recorded (%s)." % where if where else "Nothing to record."

    # ---- administration ---------------------------------------------------------------------------
    def t_file_ops(self, a, job):
        act = str(a.get("action") or "").lower()
        over = _b(a.get("overwrite"))
        risky = X.fileop_needs_approval(act, over)
        src = self.resolve(str(a.get("path") or "")) if a.get("path") else ""
        if not self.core.gate("files", "%s?" % act.capitalize(), "%s%s" % (src, (" -> " + str(a.get("destination"))) if a.get("destination") else ""), risky=risky):
            return "The user DENIED authorisation (or file operations are switched off in Settings)."
        return X.file_ops(act, str(a.get("path") or ""), str(a.get("destination") or ""), self.resolve, self.core.trash_dir, over)

    def t_process_control(self, a, job):
        act, target = str(a.get("action") or "").lower(), str(a.get("target") or "")
        if act == "list":
            return X.process_list(target)
        if act == "kill":
            if not target:
                return "Say which program or PID."
            if not self.core.gate("processes", "End this program?", target, risky=True):
                return "The user DENIED authorisation (or process control is switched off in Settings)."
            return X.process_kill(target)
        return "Use action list or kill."

    def t_download_file(self, a, job):
        url, dest = str(a.get("url") or ""), str(a.get("destination") or "")
        name = urllib.parse.unquote(urllib.parse.urlparse(url).path.rsplit("/", 1)[-1])
        ext = Path(dest if Path(dest).suffix else name).suffix.lower()
        if not self.core.gate("network", "Download this file?", "%s\n-> %s" % (url, dest), risky=ext in EXEC_EXT):
            return "The user DENIED authorisation (or network actions are switched off in Settings)."
        return X.download_file(url, dest, self.resolve)

    def t_api_request(self, a, job):
        method = str(a.get("method") or "GET").upper()
        svc, url = str(a.get("service") or "custom").lower(), str(a.get("url") or "")
        body = str(a.get("body") or "")
        detail = "%s %s %s\n%s" % (svc.upper(), method, url, body[:500])
        if not self.core.gate("network", "Send this %s request?" % method, detail, risky=method != "GET"):
            return "The user DENIED authorisation (or network actions are switched off in Settings)."
        return X.api_call(svc, method, url, body, str(a.get("headers_json") or ""), self.cfg)

    def t_install_python_package(self, a, job):
        pk = str(a.get("packages") or "")
        if not self.core.gate("scripts", "Install Python packages?", pk, risky=True):
            return "The user DENIED authorisation (or scripts are switched off in Settings)."
        return X.pip_install(pk, self.core.runner.dir / "logs")

    def t_find_program(self, a, job):
        if str(a.get("name") or "").lower().strip() == "blender" and self.cfg.get("blender_path"):
            b = X.find_blender(self.cfg["blender_path"])
            if b:
                return "Blender: " + b
        return X.find_program(str(a.get("name") or ""))
