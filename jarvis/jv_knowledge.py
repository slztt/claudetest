"""Research before acting.

research() pulls three things together so JARVIS never works from memory alone:
  1. the skill folder (verified recipes and lessons from earlier runs, plus the built-in knowledge notes),
  2. a Google-grounded Gemini answer (live Google Search, with sources) when an API key is available,
  3. excerpts from the official documentation pages for the domain.
Everything network-related is injected, so this module has no dependencies and is easy to test.
"""
import concurrent.futures as cf
import re, time
from urllib.parse import urlparse

from jv_skills import norm_domain, tokens

# Official documentation hosts per domain, best first. Results from these are fetched and read.
OFFICIAL = {
    "roblox-studio": ["create.roblox.com", "devforum.roblox.com", "rojo.space"],
    "roblox": ["create.roblox.com", "devforum.roblox.com", "apis.roblox.com"],
    "discord": ["discord.com", "discordpy.readthedocs.io", "discord.js.org"],
    "blender": ["docs.blender.org", "developer.blender.org", "blender.stackexchange.com"],
    "google": ["developers.google.com", "ai.google.dev", "cloud.google.com", "support.google.com"],
    "windows": ["learn.microsoft.com"],
    "general": [],
}
SEARCH_WORDS = {"roblox-studio": "Roblox Studio Luau", "roblox": "Roblox", "discord": "Discord",
                "blender": "Blender Python bpy", "google": "Google", "windows": "Windows PowerShell", "general": ""}
SITE_FOR_QUERY = {"discord": ["discord.com/developers/docs", "discordpy.readthedocs.io"],
                  "blender": ["docs.blender.org/api/current", "docs.blender.org/manual"],
                  "roblox-studio": ["create.roblox.com/docs", "devforum.roblox.com"],
                  "roblox": ["create.roblox.com/docs", "devforum.roblox.com"],
                  "google": ["developers.google.com", "ai.google.dev"],
                  "windows": ["learn.microsoft.com"]}

_INFER = (
    ("blender", ("blender", "bpy", "bmesh", ".blend")),
    ("roblox-studio", ("roblox studio", "luau", "game:getservice", "serverscriptservice", "starterplayer", "instance.new",
                       ".rbxl", ".rbxm", "rbxlx", "workspace:", "replicatedstorage", "studio plugin")),
    ("roblox", ("roblox", "open cloud", "datastore", "robux", "universe id", "place id")),
    ("discord", ("discord", "webhook", "discord.py", "discord.js")),
    ("google", ("google", "gmail", "gemini", "google sheets", "apps script", "googleapis", "youtube", "google drive")),
    ("windows", ("powershell", "registry", "windows", "get-process", "get-service")),
)


def infer_domain(*texts):
    blob = " ".join(t for t in texts if t).lower()
    for dom, keys in _INFER:
        if any(k in blob for k in keys):
            return dom
    return "general"


def host_rank(url, dom):
    """0 = official host for the domain, 1 = anything else."""
    host = (urlparse(url).netloc or "").lower()
    return 0 if any(host == o or host.endswith("." + o) for o in OFFICIAL.get(dom, [])) else 1


def focus(text, keywords, size=1600):
    """Return the parts of a long flattened page that mention the keywords (windows around the hits)."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= size:
        return text
    low, spans = text.lower(), []
    for k in dict.fromkeys(keywords):
        for m in re.finditer(re.escape(k), low):
            spans.append(m.start())
            if len(spans) > 80:
                break
    if not spans:
        return text[:size]
    # choose the start of the densest region, then take windows around hits in reading order
    spans.sort()
    chosen, used, last_end = [], 0, -1
    best = sorted(spans, key=lambda p: -sum(1 for q in spans if p - 300 <= q <= p + 900))
    for p in sorted(best[:12]):
        a, b = max(0, p - 200), min(len(text), p + 700)
        if a <= last_end:
            a = last_end
        if b <= a:
            continue
        chosen.append(text[a:b])
        last_end, used = b, used + (b - a)
        if used >= size:
            break
    return " ... ".join(chosen)[:size + 200]


def ground_prompt(topic, dom):
    sites = ", ".join(OFFICIAL.get(dom, [])[:3]) or "official documentation"
    return ("You are a documentation researcher helping an assistant that will automate a task with a script. "
            "Task or question: %s\nArea: %s.\nUse live search and prefer official sources (%s). "
            "Answer with: (1) the exact current API names, function signatures, CLI flags or endpoints needed; "
            "(2) a minimal correct code example; (3) version differences or common pitfalls that would make a script fail. "
            "Be precise and brief (under 350 words). If you are not sure about something, say so instead of guessing."
            % (topic, SEARCH_WORDS.get(dom) or dom, sites))


def research(topic, domain, store, search_fn, fetch_fn, ground_fn=None, budget=26.0):
    """Returns (text_for_the_model, [source urls], domain)."""
    t0 = time.time()
    dom = norm_domain(domain) if domain else infer_domain(topic)
    if dom == "general" and not domain:
        dom = infer_domain(topic)
    parts, sources = [], []
    hits = store.search(topic, dom, limit=4)
    if hits:
        parts.append("FROM YOUR SKILL FOLDER (recipes marked as worked were verified on this PC; still compare with the notes below):\n"
                     + store.format_hits(hits, 1100))
    else:
        parts.append("Skill folder: nothing relevant yet. This will be learned once a script works.")

    kws = tokens(topic)
    ex = cf.ThreadPoolExecutor(max_workers=6)
    futs = {}
    try:
        if ground_fn:
            futs["ground"] = ex.submit(ground_fn, ground_prompt(topic, dom))
        qs = ["site:%s %s" % (s, topic) for s in SITE_FOR_QUERY.get(dom, [])[:2]]
        qs.append(("%s %s" % (SEARCH_WORDS.get(dom, ""), topic)).strip())
        for q in qs:
            futs[q] = ex.submit(search_fn, q)

        def left():
            return max(1.0, budget - (time.time() - t0))

        ground_text = ""
        if "ground" in futs:
            try:
                ground_text, urls = futs.pop("ground").result(timeout=left())
                sources += [u for u in urls if u]
            except Exception as e:
                parts.append("(Google-grounded lookup unavailable: %s)" % type(e).__name__)
        results, seen = [], set()
        for q, f in futs.items():
            try:
                for title, snip, url in f.result(timeout=left()):
                    if url and url not in seen:
                        seen.add(url)
                        results.append((host_rank(url, dom), title, snip, url))
            except Exception:
                pass
        results.sort(key=lambda r: r[0])
        if ground_text:
            parts.append("GOOGLE-GROUNDED ANSWER (live search):\n" + ground_text.strip()[:3200])
        pages = []
        picks = [r for r in results if r[0] == 0][:3] or results[:2]
        pf = {r[3]: ex.submit(fetch_fn, r[3]) for r in picks}
        for url, f in pf.items():
            try:
                txt = f.result(timeout=left())
                if txt and len(txt) > 200:
                    pages.append("PAGE %s\n%s" % (url, focus(txt, kws)))
                    sources.append(url)
            except Exception:
                pass
        if pages:
            parts.append("OFFICIAL DOCS EXCERPTS:\n" + "\n\n".join(pages))
        extra = [r for r in results if r[3] not in sources][:5]
        if extra:
            parts.append("OTHER RESULTS:\n" + "\n".join("- %s: %s (%s)" % (t, s[:160], u) for _, t, s, u in extra))
        if not ground_text and not pages and not extra:
            parts.append("WEB: no results (offline or blocked?). Work from the skill folder, and tell the user the research "
                         "could not be completed if the task depends on exact current details.")
    finally:
        ex.shutdown(wait=False, cancel_futures=True)
    text = "\n\n".join(parts)
    if len(text) > 9500:
        text = text[:9500] + "\n...[truncated]"
    return text, list(dict.fromkeys(sources))[:6], dom
