"""The skill folder: everything WINNERS Bot knows and learns, stored as plain markdown you can read, edit or delete.

Layout (inside  ~/.winnersbot/skills/):
    <domain>/<slug>.md      one skill per file: knowledge notes, or "recipes" (scripts that worked)
    <domain>/_lessons.md    short "do not do this / watch out for this" notes learned from failures
    journal.jsonl           one line per script run, used for the success-rate statistics

Built-in knowledge ships in  skills_seed/  and is copied in on first run (existing files are never overwritten,
so your edits and everything he learns are safe).
"""
import hashlib, json, re, shutil, threading, time
from pathlib import Path

DOMAINS = {
    "roblox-studio": "Roblox Studio: the editor, Luau scripting, plugins, UI, building, animation",
    "roblox": "Roblox platform: Open Cloud, DataStores, publishing, monetisation, web APIs",
    "discord": "Discord: bots, webhooks, REST API, servers and permissions",
    "blender": "Blender: bpy scripting, headless rendering, modelling, import/export",
    "google": "Google: Gemini API, Workspace APIs (Drive, Sheets, Docs, Gmail, Calendar), Apps Script, Cloud",
    "windows": "Windows and PC administration: PowerShell, processes, services, files, settings",
    "general": "Everything else",
}
SPECIALIST = ("roblox-studio", "roblox", "discord", "blender", "google")

_ALIASES = {
    "roblox-studio": ("roblox studio", "roblox_studio", "robloxstudio", "studio", "luau", "rbx studio", "roblox-studio", "lua", "rojo"),
    "roblox": ("rbx", "robux", "open cloud", "opencloud", "roblox api", "devforum", "datastore"),
    "discord": ("discord bot", "discord.py", "discordpy", "discord.js", "webhook", "discord api"),
    "blender": ("bpy", "blender3d", "blender 3d", "cycles", "eevee"),
    "google": ("gmail", "drive", "google drive", "sheets", "google sheets", "docs", "google docs", "gemini", "calendar",
               "google calendar", "google cloud", "gcp", "apps script", "appscript", "youtube", "google search", "chrome"),
    "windows": ("powershell", "pc", "system", "registry", "win", "cmd", "files", "admin"),
}
_STOP = set("a an the and or of to in on for with is are be it this that how do i you me my your what why when from as at by "
            "can will use using make create get set run need want please".split())


def norm_domain(d):
    d = (d or "").strip().lower().replace("_", "-")
    if d in DOMAINS:
        return d
    for dom, names in _ALIASES.items():
        if d in names or d.replace("-", " ") in names:
            return dom
    return "general"


def slugify(s, fallback="skill"):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60].strip("-")
    return s or fallback


def tokens(q):
    return [t for t in re.findall(r"[a-z0-9_.]+", (q or "").lower()) if len(t) > 1 and t not in _STOP]


def _parse(text):
    text = text.replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    meta, body = {}, text
    if m:
        for line in m.group(1).splitlines():
            k, _, v = line.partition(":")
            if k.strip():
                meta[k.strip()] = v.strip()
        body = m.group(2)
    return meta, body


def _dump(meta, body):
    return "---\n" + "\n".join("%s: %s" % (k, v) for k, v in meta.items()) + "\n---\n" + body.strip() + "\n"


def _int(v, d=0):
    try:
        return int(v)
    except Exception:
        return d


class SkillStore:
    def __init__(self, root, seed=None):
        self.root, self.lock = Path(root), threading.RLock()
        self.root.mkdir(parents=True, exist_ok=True)
        self._cache = {}
        if seed and Path(seed).exists():
            self._seed(Path(seed))

    # ---- housekeeping -----------------------------------------------------------------------
    def _seed(self, seed):
        for f in seed.rglob("*.md"):
            dest = self.root / f.relative_to(seed)
            if not dest.exists():
                try:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(f, dest)
                except Exception:
                    pass

    def _write(self, path, meta, body):
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(_dump(meta, body), encoding="utf-8")
        tmp.replace(path)
        self._cache.pop(str(path), None)

    def _load(self, path):
        key = str(path)
        try:
            mt = path.stat().st_mtime
        except OSError:
            return None
        hit = self._cache.get(key)
        if hit and hit[0] == mt:
            return hit[1]
        try:
            meta, body = _parse(path.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            return None
        item = {"path": path, "domain": path.parent.name, "slug": path.stem, "meta": meta, "body": body,
                "title": meta.get("title") or path.stem.replace("-", " ").replace("_", " ").strip().title()}
        self._cache[key] = (mt, item)
        return item

    def all(self):
        out = []
        with self.lock:
            for p in sorted(self.root.glob("*/*.md")):
                if p.parent.name.startswith("."):
                    continue
                it = self._load(p)
                if it:
                    out.append(it)
        return out

    # ---- search / read ------------------------------------------------------------------------
    def search(self, query, domain="", limit=5):
        toks = tokens(query)
        dom = norm_domain(domain) if domain else ""
        scored = []
        for it in self.all():
            meta = it["meta"]
            title, tags = it["title"].lower(), meta.get("tags", "").lower()
            body = it["body"].lower()
            score = 0.0
            for t in toks:
                if t in title:
                    score += 4
                if t in tags:
                    score += 3
                if t in it["slug"]:
                    score += 2
                n = body.count(t)
                if n:
                    score += min(n, 4) * 0.8
            if score <= 0:
                continue
            if dom and it["domain"] == dom:
                score += 2
            elif dom and it["domain"] not in (dom, "general"):
                score *= 0.5
            if meta.get("kind") == "recipe":
                score += min(_int(meta.get("successes")), 6) * 0.7
                score -= min(_int(meta.get("failures")), 4) * 0.3
            scored.append((score, it))
        scored.sort(key=lambda x: -x[0])
        return [it for _, it in scored[:limit]]

    def find(self, name, domain=""):
        """Look a skill up by 'domain/slug', slug or title words."""
        name = (name or "").strip().lower()
        if "/" in name:
            domain, _, name = name.partition("/")
        dom = norm_domain(domain) if domain else ""
        items = [i for i in self.all() if not dom or i["domain"] == dom]
        for i in items:
            if i["slug"] == slugify(name) or i["title"].lower() == name:
                return i
        hit = self.search(name, dom, 1)
        return hit[0] if hit else None

    @staticmethod
    def excerpt(it, n=900):
        body = it["body"].strip()
        return body if len(body) <= n else body[:n].rstrip() + "\n...[more in skill_read]"

    def format_hits(self, hits, n=900):
        rows = []
        for it in hits:
            m = it["meta"]
            tag = m.get("kind", "knowledge")
            if tag == "recipe":
                tag += " - worked %s time(s)" % (m.get("successes") or 0)
            rows.append("[%s/%s] %s (%s)\n%s" % (it["domain"], it["slug"], it["title"], tag, self.excerpt(it, n)))
        return "\n\n".join(rows)

    # ---- writing ---------------------------------------------------------------------------------
    def save(self, domain, title, body, kind="knowledge", tags="", sources=""):
        dom = norm_domain(domain)
        with self.lock:
            path = self.root / dom / (slugify(title) + ".md")
            old = self._load(path) if path.exists() else None
            meta = dict(old["meta"]) if old else {"created": time.strftime("%Y-%m-%d")}
            meta.update({"title": title.strip()[:120], "domain": dom, "kind": kind or "knowledge",
                         "tags": tags or meta.get("tags", ""), "updated": time.strftime("%Y-%m-%d")})
            if sources:
                meta["sources"] = sources[:400]
            self._write(path, meta, body)
        return "%s/%s" % (dom, path.stem)

    def record_success(self, domain, task, language, code, notes="", sources=""):
        """A script did what it was meant to and was verified. Keep it as a reusable recipe."""
        dom = norm_domain(domain)
        title = (task or "script").strip()[:100]
        with self.lock:
            path = self.root / dom / ("recipe-" + slugify(title) + ".md")
            old = self._load(path) if path.exists() else None
            meta = dict(old["meta"]) if old else {"created": time.strftime("%Y-%m-%d"), "successes": "0", "failures": "0"}
            meta.update({"title": "Recipe: " + title, "domain": dom, "kind": "recipe", "language": language,
                         "tags": " ".join(sorted(set(tokens(title)))[:12]), "updated": time.strftime("%Y-%m-%d"),
                         "successes": str(_int(meta.get("successes")) + 1)})
            if sources:
                meta["sources"] = sources[:400]
            body = "Task: %s\nLanguage: %s\nThis exact script ran and was verified.\n" % (task.strip(), language)
            if notes:
                body += "Notes: %s\n" % notes.strip()
            body += "\n```%s\n%s\n```" % (language, code.strip()[:12000])
            self._write(path, meta, body)
        return "%s/%s" % (dom, path.stem)

    def lesson(self, domain, text):
        """Append a short lesson to the domain's lessons file (deduplicated, newest last, capped)."""
        dom, text = norm_domain(domain), re.sub(r"\s+", " ", (text or "")).strip()[:400]
        if not text:
            return ""
        with self.lock:
            path = self.root / dom / "_lessons.md"
            old = self._load(path) if path.exists() else None
            meta = dict(old["meta"]) if old else {"title": "Lessons learned (%s)" % dom, "domain": dom, "kind": "lesson",
                                                  "tags": "lessons mistakes pitfalls errors avoid"}
            lines = [l for l in (old["body"].splitlines() if old else []) if l.strip().startswith("- ")]
            norm = lambda s: re.sub(r"\W+", "", s.lower())
            key = norm(text)[:60]
            if not any(key in norm(l) for l in lines):
                lines.append("- [%s] %s" % (time.strftime("%Y-%m-%d"), text))
            meta["updated"] = time.strftime("%Y-%m-%d")
            self._write(path, meta, "\n".join(lines[-60:]))
        return "%s/_lessons" % dom

    def note_failure(self, domain, task, language, error):
        """Remember that a script failed (and a short reason), so the same mistake is not repeated."""
        err = re.sub(r"\s+", " ", (error or "")).strip()
        err = err[-260:] if len(err) > 260 else err
        self.lesson(domain, "Attempt at '%s' (%s) failed: %s" % ((task or "?")[:80], language, err or "no error text"))
        dom = norm_domain(domain)
        with self.lock:
            path = self.root / dom / ("recipe-" + slugify((task or "script").strip()[:100]) + ".md")
            old = self._load(path) if path.exists() else None
            if old:
                meta = dict(old["meta"])
                meta["failures"] = str(_int(meta.get("failures")) + 1)
                self._write(path, meta, old["body"])

    def delete(self, domain, slug):
        src = self.root / norm_domain(domain) / (slug + ".md")
        if not src.exists():
            return False
        trash = self.root / ".trash"
        trash.mkdir(exist_ok=True)
        shutil.move(str(src), str(trash / ("%s-%s-%s.md" % (time.strftime("%Y%m%d%H%M%S"), src.parent.name, src.stem))))
        self._cache.pop(str(src), None)
        return True

    # ---- journal and statistics ---------------------------------------------------------------------
    def log_run(self, domain, language, task, ok, seconds, verified=None):
        row = {"ts": int(time.time()), "domain": norm_domain(domain), "lang": language, "task": (task or "")[:120],
               "ok": bool(ok), "s": round(seconds, 1), "verified": verified}
        try:
            with self.lock, open(self.root / "journal.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(row) + "\n")
        except Exception:
            pass

    def _journal(self, last=600):
        rows = []
        try:
            with open(self.root / "journal.jsonl", "r", encoding="utf-8") as f:
                for line in f.readlines()[-last:]:
                    try:
                        rows.append(json.loads(line))
                    except Exception:
                        pass
        except OSError:
            pass
        return rows

    def stats(self):
        items = self.all()
        per = {}
        for d in DOMAINS:
            per[d] = {"skills": 0, "recipes": 0, "lessons": 0}
        for it in items:
            d = it["domain"] if it["domain"] in per else "general"
            kind = it["meta"].get("kind", "knowledge")
            if kind == "recipe":
                per[d]["recipes"] += 1
            elif kind == "lesson":
                per[d]["lessons"] += max(1, it["body"].count("\n- ") + 1)
            else:
                per[d]["skills"] += 1
        rows = self._journal()
        ok = sum(1 for r in rows if r.get("ok"))
        return {"domains": per, "total": len(items), "runs": len(rows), "ok": ok,
                "rate": round(100 * ok / len(rows)) if rows else None,
                "learned": sum(v["recipes"] + v["lessons"] for v in per.values())}

    def prompt_summary(self, limit=8):
        """A few lines for the system prompt so he knows what is in the folder."""
        st = self.stats()
        recipes = [i for i in self.all() if i["meta"].get("kind") == "recipe"]
        recipes.sort(key=lambda i: -_int(i["meta"].get("successes")))
        names = "; ".join("%s/%s" % (i["domain"], i["title"].replace("Recipe: ", "")[:50]) for i in recipes[:limit])
        return "%d skills in the skill folder (%d learned recipes and lessons)%s." % (
            st["total"], st["learned"], (". Best-proven recipes: " + names) if names else "")

    def tree(self):
        """For the HUD: domain -> list of {slug, title, kind, uses}."""
        out = {}
        for it in self.all():
            out.setdefault(it["domain"], []).append({"slug": it["slug"], "title": it["title"],
                                                     "kind": it["meta"].get("kind", "knowledge"),
                                                     "ok": _int(it["meta"].get("successes"))})
        for v in out.values():
            v.sort(key=lambda x: (x["kind"] != "recipe", -x["ok"], x["title"]))
        return out


def script_fingerprint(code):
    return hashlib.sha1((code or "").encode("utf-8", "replace")).hexdigest()[:10]
