"""WINNERS Bot automation layer: the tools that let him operate any program smoothly.

The approach follows what works best in current desktop agents (for example Microsoft's UFO2, which combines the
Windows UI Automation tree with screen parsing): use the most reliable layer that can reach the target, verify, and
fall back to the next layer only when needed.

  1. Commands / APIs / COM          run_command, run_script, api_request (fast, exact, no screen)
  2. browser                        a real Chromium-based browser driven by Playwright: click/fill by visible text,
                                    label or numbered element, read pages, wait for content (web apps)
  3. ui_auto                        Windows UI Automation via pywinauto: numbered snapshot of a window's controls, then
                                    invoke / type / toggle / select / expand them by number or name, with no mouse
  4. screen_text                    OCR (Windows' built-in engine, or RapidOCR) to read the screen, find text and click it
  5. look_at_screen + mouse_click   vision as the last resort
  plus wait_for (window, process, file, text, element, idle CPU) so steps never race ahead, and automation for
  scheduled routines ("every weekday at 8:30 open Outlook and read me the unread count").

Optional packages are installed into WINNERS Bot's own environment on first use (pywinauto, winocr or rapidocr, playwright).
"""
import asyncio, datetime as dt, difflib, importlib, json, os, platform, queue, re, subprocess, sys, threading, time, urllib.parse
from pathlib import Path

IS_WIN = platform.system() == "Windows"
S_, N_, B_ = "STRING", "NUMBER", "BOOLEAN"


def _t(name, desc, props=None, req=()):
    p = {k: {"type": v[0], "description": v[1]} for k, v in (props or {}).items()}
    return {"name": name, "description": desc, "parameters": {"type": "OBJECT", "properties": p, **({"required": list(req)} if req else {})}}


AUTO_TOOLS = [
    _t("ui_auto", "Operate ANY Windows program through its accessibility tree (UI Automation), with no mouse. First call snapshot (window = part of its "
       "title, or empty for the active window): you get numbered controls like '[12] Button \"Save\"'. Then act on a number (or a name): click (invokes it "
       "properly), set_text (fills a field), get_text, toggle, select (a combo box or list item; value is the item text), expand, collapse, focus, "
       "right_click, double_click, scroll_into_view. windows lists open windows. wait waits for a control named target to appear. Re-snapshot after the "
       "window changes. Prefer this over mouse_click for desktop apps.",
       {"action": (S_, "snapshot, windows, click, set_text, get_text, toggle, select, expand, collapse, focus, right_click, double_click, scroll_into_view or wait"),
        "window": (S_, "Part of the window title (empty = active window)"), "target": (S_, "Control number from the last snapshot, or its name"),
        "value": (S_, "Text for set_text, item for select"), "filter": (S_, "snapshot: only controls whose name contains this"),
        "timeout": (N_, "wait: seconds, default 15")}, ["action"]),
    _t("screen_text", "Read text anywhere on screen with OCR and act on it, for apps whose controls ui_auto cannot see (games, remote desktops, canvases, "
       "images). read returns the lines on screen with positions; find locates text; click clicks the text (nth match, double or right click optional); "
       "wait waits until the text appears (or until it disappears with gone true).",
       {"action": (S_, "read, find, click or wait"), "text": (S_, "Text to find / click / wait for"), "target": (S_, "screen (default), window or all"),
        "nth": (N_, "Which match when several (1 = first)"), "double": (B_, "Double-click"), "right": (B_, "Right-click"),
        "timeout": (N_, "wait: seconds, default 20"), "gone": (B_, "wait: wait for the text to disappear instead")}, ["action"]),
    _t("browser", "Drive a real web browser (WINNERS Bot's own Edge/Chrome window with its own profile, so sign-ins stick after the first time). Best for "
       "anything on the web: open a url, elements lists numbered clickable items and fields, click / fill / select / check by number, visible text, "
       "label, placeholder or CSS selector, press keys, read the page text, wait for text, scroll, back, tabs / switch / close_tab, screenshot (you "
       "see it), download (click target and save the file). Use it instead of open_website when you must DO something on a site.",
       {"action": (S_, "open, elements, click, fill, select, check, press, read, wait, scroll, back, forward, reload, tabs, switch, close_tab, screenshot, download, close"),
        "url": (S_, "open: address or search words"), "target": (S_, "Element number from elements, its text, label, placeholder or a CSS selector"),
        "value": (S_, "fill: text; select: option; press: keys like Enter or Control+A; switch: tab number or title; scroll: up or down; wait: text"),
        "new_tab": (B_, "open: in a new tab"), "timeout": (N_, "wait: seconds, default 20")}, ["action"]),
    _t("wait_for", "Wait until something is true before the next step, instead of guessing delays: a window title appears (or closes), a program "
       "starts or ends, a file exists, text appears on screen, the CPU goes idle (an install or render finished), or just a number of seconds.",
       {"what": (S_, "window, window_closed, process, process_ended, file, text, idle or seconds"), "value": (S_, "Title part, process name, file path, text, or seconds"),
        "timeout": (N_, "Max seconds to wait, default 30")}, ["what"]),
    _t("automation", "Scheduled routines that run on their own: add schedules an instruction you will carry out at that time (with all your tools), "
       "e.g. 'open Outlook and tell me how many unread emails there are'; repeat once, daily, weekdays, weekly or hourly. list shows them; delete removes "
       "one by id; run runs one now; pause / resume.",
       {"action": (S_, "add, list, delete, run, pause or resume"), "instruction": (S_, "add: what to do, in plain words"), "time": (S_, "add: 'HH:MM' or 'YYYY-MM-DD HH:MM'"),
        "repeat": (S_, "add: once, daily, weekdays, weekly or hourly"), "id": (S_, "delete / run / pause / resume: the routine id")}, ["action"]),
]
AUTO_NAMES = {t["name"] for t in AUTO_TOOLS}

PROMPT = (
    "HOW TO OPERATE THE PC RELIABLY: pick the most direct layer and verify every step. "
    "(1) Commands first: PowerShell/winget/COM objects (Excel.Application, Outlook.Application, Word.Application, Shell.Application), "
    "'start ms-settings:<page>' for any Settings page (display, sound, bluetooth, network-wifi, windowsupdate, defaultapps, privacy-webcam...), "
    "'explorer shell:AppsFolder\\<AppID>' for Store apps (find ids with Get-StartApps). "
    "(2) Websites and web apps: the browser tool (open, elements, click/fill by number or text, read, wait). "
    "(3) Desktop apps: ui_auto snapshot then act on numbered controls; re-snapshot after the window changes. "
    "(4) Anything ui_auto cannot see: screen_text find/click. (5) Last resort: look_at_screen then mouse_click. "
    "Use keyboard shortcuts when they are faster (press_keys with the window named). Use wait_for between steps that take time (an app opening, "
    "a page loading, a download, an install) instead of hoping. After an important step, confirm it worked (snapshot, read, screen_text or a "
    "screenshot) before saying it is done. If a layer fails, say nothing to the user and try the next layer; only report failure after the "
    "alternatives are exhausted. Long or repeatable jobs: write one script with run_script, or schedule them with automation. "
)


# ---------------------------------------------------------------------------------------------
# optional packages, installed on demand into WINNERS Bot's own environment
# ---------------------------------------------------------------------------------------------
_ensured = {}


def ensure(pip_name, import_name=None, core=None):
    import_name = import_name or pip_name
    if _ensured.get(import_name):
        return importlib.import_module(import_name)
    try:
        mod = importlib.import_module(import_name)
        _ensured[import_name] = True
        return mod
    except ImportError:
        pass
    if core:
        core.ui({"t": "act", "text": "INSTALLING  ·  " + pip_name})
        core.post("status", "Installing %s for automation (one time)..." % pip_name)
    r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", pip_name], capture_output=True, text=True, timeout=600,
                       creationflags=0x08000000 if IS_WIN else 0)
    if core:
        core.post("status", "")
    if r.returncode != 0:
        raise RuntimeError("Could not install %s: %s" % (pip_name, (r.stderr or r.stdout)[-300:]))
    importlib.invalidate_caches()
    mod = importlib.import_module(import_name)
    _ensured[import_name] = True
    return mod


def _norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


# ---------------------------------------------------------------------------------------------
# 3. UI Automation (pywinauto)
# ---------------------------------------------------------------------------------------------
INTERACTIVE = {"Button", "Edit", "ComboBox", "CheckBox", "RadioButton", "ListItem", "MenuItem", "TabItem", "Hyperlink", "TreeItem",
               "DataItem", "Slider", "Spinner", "SplitButton", "Document", "MenuBar", "Menu", "ScrollBar", "Thumb", "HeaderItem", "Custom"}
NAMED_ONLY = {"Text", "Image", "Group", "Pane", "List", "Tree", "Table", "ToolBar", "StatusBar", "Header"}


class UIA:
    def __init__(self, core):
        self.core, self.items, self.win = core, [], None

    def _desk(self):
        if not IS_WIN:
            raise RuntimeError("ui_auto works on Windows. On this system use the browser tool, keyboard shortcuts, screen_text or look_at_screen.")
        ensure("pywinauto", core=self.core)
        from pywinauto import Desktop
        return Desktop(backend="uia")

    def _window(self, title):
        desk = self._desk()
        wins = [w for w in desk.windows() if (w.window_text() or "").strip() and w.is_visible()]
        wins = [w for w in wins if "W.I.N.N.E.R.S" not in w.window_text()]
        if title:
            t = _norm(title)
            hit = [w for w in wins if t in _norm(w.window_text())]
            if not hit:
                raise RuntimeError("No open window with '%s' in its title. Open windows: %s" % (title, "; ".join(w.window_text()[:50] for w in wins[:15])))
            return hit[0]
        try:
            import ctypes
            h = ctypes.windll.user32.GetForegroundWindow()
            for w in wins:
                if w.handle == h:
                    return w
        except Exception:
            pass
        if not wins:
            raise RuntimeError("No windows found.")
        return wins[0]

    def _walk(self, root, limit=2500):
        out, stack, seen = [], [root], 0
        while stack and seen < limit:
            el = stack.pop(0)
            seen += 1
            try:
                kids = el.children()
            except Exception:
                kids = []
            stack.extend(kids)
            out.append(el)
        return out

    def snapshot(self, title="", filt=""):
        w = self._window(title)
        self.win = w
        items = []
        for el in self._walk(w):
            try:
                info = el.element_info
                ct, name = info.control_type or "", (info.name or "").strip()
                if not el.is_visible():
                    continue
                if ct not in INTERACTIVE and not (ct in NAMED_ONLY and name and ct in ("Text",) and len(name) < 80):
                    continue
                if ct in ("Custom", "Document") and not name:
                    continue
                if filt and _norm(filt) not in _norm(name + " " + (info.automation_id or "")):
                    continue
                items.append(el)
            except Exception:
                continue
            if len(items) >= 220:
                break
        self.items = items
        lines = []
        for i, el in enumerate(items, 1):
            info = el.element_info
            extra = ""
            try:
                if info.control_type in ("Edit", "ComboBox", "Document"):
                    v = el.get_value() if hasattr(el, "get_value") else ""
                    extra = ' value="%s"' % str(v)[:60] if v else ""
                elif info.control_type in ("CheckBox", "RadioButton"):
                    extra = " checked" if el.get_toggle_state() == 1 else ""
            except Exception:
                pass
            dis = "" if el.is_enabled() else " (disabled)"
            aid = " #" + info.automation_id if info.automation_id and len(info.automation_id) < 40 else ""
            lines.append('[%d] %s "%s"%s%s%s' % (i, info.control_type, (info.name or "")[:70], aid, extra, dis))
        head = 'Window "%s" (%d controls%s):\n' % (w.window_text()[:80], len(items), ", filtered" if filt else "")
        return head + ("\n".join(lines) if lines else "No interactive controls found. Try screen_text or look_at_screen.")

    def _el(self, target, title=""):
        target = str(target or "").strip().lstrip("[").rstrip("]")
        if target.isdigit():
            if not self.items:
                raise RuntimeError("Take a snapshot first.")
            i = int(target)
            if not 1 <= i <= len(self.items):
                raise RuntimeError("No control [%d] in the last snapshot (it had %d)." % (i, len(self.items)))
            return self.items[i - 1]
        if title or not self.items:
            self.snapshot(title)
        t = _norm(target)
        pool = self.items
        for test in (lambda n: n == t, lambda n: n.startswith(t), lambda n: t in n):
            hit = [el for el in pool if test(_norm(el.element_info.name))]
            if hit:
                return hit[0]
        names = [el.element_info.name for el in pool if el.element_info.name]
        close = difflib.get_close_matches(target, names, n=1, cutoff=0.6)
        if close:
            return next(el for el in pool if el.element_info.name == close[0])
        raise RuntimeError("No control called '%s'. Take a snapshot to see the names." % target)

    def act(self, action, target="", value="", title=""):
        el = self._el(target, title)
        info = el.element_info
        label = '%s "%s"' % (info.control_type, (info.name or "")[:60])
        try:
            if self.win:
                self.win.set_focus()
        except Exception:
            pass
        if action == "click":
            for how in ("invoke", "select", "toggle", "expand"):
                r = self._call(el, how)
                if r == "ok":
                    return "Clicked %s (%s)." % (label, how)
                if r == "busy":   # UIA Invoke blocks while a modal dialog it opened is showing
                    return "Clicked %s; it opened something that is waiting (probably a dialog). Snapshot again." % label
            el.click_input()
            return "Clicked %s." % label
        if action == "set_text":
            try:
                el.set_edit_text(value)
            except Exception:
                try:
                    el.iface_value.SetValue(value)
                except Exception:
                    el.set_focus()
                    from pywinauto.keyboard import send_keys
                    send_keys("^a{BACKSPACE}")
                    el.type_keys(value, with_spaces=True, with_newlines=True, pause=0.01)
            return "Typed into %s." % label
        if action == "get_text":
            for how in ("get_value", "window_text", "texts"):
                try:
                    v = getattr(el, how)()
                    if v:
                        return "%s: %s" % (label, str(v)[:4000])
                except Exception:
                    continue
            return "%s has no readable text." % label
        if action == "toggle":
            el.toggle()
            return "Toggled %s." % label
        if action == "select":
            try:
                el.select(value) if value else el.select()
            except Exception:
                el.expand()
                time.sleep(0.3)
                self.snapshot("", value)
                if self.items:
                    self.items[0].select() if hasattr(self.items[0], "select") else self.items[0].click_input()
            return "Selected %s in %s." % (value or "it", label)
        if action in ("expand", "collapse"):
            getattr(el, action)()
            return "%sed %s." % (action.title(), label)
        if action == "focus":
            el.set_focus()
            return "Focused %s." % label
        if action == "right_click":
            el.right_click_input()
            return "Right-clicked %s. A context menu may be open: snapshot again to see it." % label
        if action == "double_click":
            el.double_click_input()
            return "Double-clicked %s." % label
        if action == "scroll_into_view":
            try:
                el.iface_scroll_item.ScrollIntoView()
            except Exception:
                el.set_focus()
            return "Scrolled %s into view." % label
        return "Unknown ui_auto action."

    @staticmethod
    def _call(el, how, timeout=4.0):
        """Run a UIA pattern call on a helper thread so a modal dialog cannot freeze WINNERS Bot. ok / fail / busy."""
        box = {}

        def run():
            try:
                import comtypes
                comtypes.CoInitializeEx(0x0)
            except Exception:
                pass
            try:
                getattr(el, how)()
                box["r"] = "ok"
            except Exception:
                box["r"] = "fail"
        t = threading.Thread(target=run, daemon=True)
        t.start()
        t.join(timeout)
        return box.get("r", "busy")

    def wait(self, target, title="", timeout=15):
        end = time.time() + float(timeout or 15)
        while time.time() < end:
            try:
                self.snapshot(title, target)
                if self.items:
                    return 'Found "%s".' % self.items[0].element_info.name
            except Exception:
                pass
            time.sleep(0.7)
        return "Timed out waiting for a control called '%s'." % target

    def windows(self):
        desk = self._desk()
        rows = []
        for w in desk.windows():
            t = (w.window_text() or "").strip()
            if t and w.is_visible():
                rows.append(t[:90])
        return "Open windows:\n" + "\n".join(rows[:40])


# ---------------------------------------------------------------------------------------------
# 4. OCR
# ---------------------------------------------------------------------------------------------
class OCR:
    def __init__(self, core):
        self.core, self.engine, self._rapid = core, None, None

    def _lines(self, img):
        """[(text, (x, y, w, h) in image pixels)] for every line, plus word boxes for precise clicks."""
        if IS_WIN and self.engine in (None, "winocr"):
            try:
                winocr = ensure("winocr", core=self.core)
                lang = self.core.cfg.get("ocr_lang") or "en"
                res = asyncio.run(winocr.recognize_pil(img, lang))
                out = []
                for ln in res.lines:
                    words = []
                    for w in ln.words:
                        r = w.bounding_rect
                        words.append((w.text, (r.x, r.y, r.width, r.height)))
                    if words:
                        x0 = min(b[0] for _, b in words); y0 = min(b[1] for _, b in words)
                        x1 = max(b[0] + b[2] for _, b in words); y1 = max(b[1] + b[3] for _, b in words)
                        out.append((ln.text, (x0, y0, x1 - x0, y1 - y0), words))
                self.engine = "winocr"
                return out
            except Exception as e:
                if self.engine == "winocr":
                    raise
                self.core.post("log", "sys", "Windows OCR unavailable (%s); trying RapidOCR." % str(e)[:120])
        rapid = ensure("rapidocr_onnxruntime", core=self.core)
        if self._rapid is None:
            self._rapid = rapid.RapidOCR()
        import numpy as np
        res, _ = self._rapid(np.array(img.convert("RGB")))
        self.engine = "rapidocr"
        out = []
        for box, text, score in res or []:
            xs, ys = [p[0] for p in box], [p[1] for p in box]
            b = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
            out.append((text, b, [(text, b)]))
        return out

    def scan(self, target="screen"):
        img, origin = self.core.comp.grab(target)
        return self._lines(img), origin

    def read(self, target="screen"):
        lines, origin = self.scan(target)
        rows = ["%s  @(%d,%d)" % (t, origin[0] + b[0] + b[2] // 2, origin[1] + b[1] + b[3] // 2) for t, b, _ in lines]
        return ("Text on screen (%s OCR, centre coordinates are real screen pixels):\n" % self.engine + "\n".join(rows[:250])) if rows else "No text found on screen."

    def find(self, text, target="screen"):
        """Matches as [(matched text, abs centre x, abs centre y)], best first."""
        lines, origin = self.scan(target)
        want = _norm(text)
        exact, fuzzy = [], []
        for ltext, lbox, words in lines:
            lt = _norm(ltext)
            if want and want in lt:
                # narrow to the words that make up the match
                ws = [_norm(w) for w, _ in words]
                n = len(want.split())
                box = lbox
                for i in range(len(ws) - n + 1):
                    if want in " ".join(ws[i:i + n]) or (n == 1 and want in ws[i]):
                        bs = [b for _, b in words[i:i + n]]
                        x0 = min(b[0] for b in bs); y0 = min(b[1] for b in bs)
                        x1 = max(b[0] + b[2] for b in bs); y1 = max(b[1] + b[3] for b in bs)
                        box = (x0, y0, x1 - x0, y1 - y0)
                        break
                exact.append((ltext, origin[0] + box[0] + box[2] / 2, origin[1] + box[1] + box[3] / 2))
            else:
                r = difflib.SequenceMatcher(None, want, lt).ratio()
                if r >= 0.78:
                    fuzzy.append((r, ltext, origin[0] + lbox[0] + lbox[2] / 2, origin[1] + lbox[1] + lbox[3] / 2))
        fuzzy.sort(key=lambda x: -x[0])
        return exact + [(t, x, y) for _, t, x, y in fuzzy]

    def click(self, text, target="screen", nth=1, double=False, right=False):
        hits = self.find(text, target)
        if not hits:
            return "I could not see '%s' on the screen." % text
        n = max(1, int(nth or 1))
        if n > len(hits):
            return "Only %d matches for '%s'." % (len(hits), text)
        t, x, y = hits[n - 1]
        pg = self.core.comp._pg()
        pg.moveTo(x, y, duration=0.18)
        if right:
            pg.click(button="right")
        else:
            pg.click(clicks=2 if double else 1)
        return "Clicked '%s' at (%d, %d)%s." % (t[:60], x, y, " (%d matches; used #%d)" % (len(hits), n) if len(hits) > 1 else "")

    def wait(self, text, target="screen", timeout=20, gone=False):
        end = time.time() + float(timeout or 20)
        while time.time() < end:
            hit = bool(self.find(text, target))
            if hit != bool(gone):
                return ("'%s' has gone." if gone else "'%s' is on screen.") % text
            time.sleep(0.8)
        return "Timed out after %ss waiting for '%s' to %s." % (int(float(timeout or 20)), text, "disappear" if gone else "appear")


# ---------------------------------------------------------------------------------------------
# 2. Browser (Playwright on its own thread: the sync API must stay on one thread)
# ---------------------------------------------------------------------------------------------
MARK_JS = r"""
() => {
  const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=option],[role=switch],[role=combobox],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
  const out = []; let n = 0;
  document.querySelectorAll('[data-jv]').forEach(e => e.removeAttribute('data-jv'));
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    const label = (el.getAttribute('aria-label') || el.labels && el.labels[0] && el.labels[0].innerText || el.getAttribute('placeholder') || el.innerText || el.value || el.getAttribute('title') || el.getAttribute('name') || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const tag = el.tagName.toLowerCase(), type = el.getAttribute('type') || el.getAttribute('role') || '';
    if (!label && !['input', 'textarea', 'select'].includes(tag)) continue;
    el.setAttribute('data-jv', ++n);
    const val = ['input', 'textarea'].includes(tag) && type !== 'password' ? (el.value || '').slice(0, 40) : '';
    out.push(`[${n}] ${tag}${type ? ':' + type : ''} "${label}"${val ? ' value="' + val + '"' : ''}${r.top > innerHeight ? ' (below)' : ''}`);
    if (n >= 200) break;
  }
  return out.join('\n');
}"""


class Browser:
    def __init__(self, core, data_dir):
        self.core, self.dir = core, Path(data_dir) / "browser-profile"
        self.q, self.thread, self.ctx, self.page, self.pw = queue.Queue(), None, None, None, None

    def call(self, fn, *a, timeout=120):
        if not self.thread or not self.thread.is_alive():
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()
        box = queue.Queue()
        self.q.put((fn, a, box))
        try:
            ok, res = box.get(timeout=timeout)
        except queue.Empty:
            return "The browser did not answer in time."
        if not ok:
            raise res
        return res

    def _loop(self):
        while True:
            fn, a, box = self.q.get()
            try:
                box.put((True, fn(*a)))
            except Exception as e:
                box.put((False, e))

    # ---- runs on the browser thread ----
    def _start(self):
        if self.ctx:
            try:
                self.ctx.pages  # still alive?
                if self.page and not self.page.is_closed():
                    return
                self.page = self.ctx.pages[-1] if self.ctx.pages else self.ctx.new_page()
                return
            except Exception:
                self.ctx = None
        ensure("playwright", core=self.core)
        from playwright.sync_api import sync_playwright
        self.pw = self.pw or sync_playwright().start()
        self.dir.mkdir(parents=True, exist_ok=True)
        last = None
        # The user's installed browser is used, so nothing big is downloaded. Chrome 136+ refuses automation on the
        # user's default profile, which is why WINNERS Bot keeps his own profile folder (sign in there once).
        for channel in (["msedge", "chrome"] if IS_WIN else ["chrome", "msedge"]) + [None]:
            try:
                kw = {"headless": bool(self.core.cfg.get("browser_headless")) or os.environ.get("WINNERS Bot_BROWSER_HEADLESS") == "1", "no_viewport": True, "accept_downloads": True, "args": ["--start-maximized"]}
                if channel:
                    kw["channel"] = channel
                self.ctx = self.pw.chromium.launch_persistent_context(str(self.dir), **kw)
                break
            except Exception as e:
                last = e
                if channel is None:
                    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], capture_output=True, timeout=900)
                    try:
                        self.ctx = self.pw.chromium.launch_persistent_context(str(self.dir), **kw)
                        break
                    except Exception as e2:
                        last = e2
        if not self.ctx:
            raise RuntimeError("Could not start a browser: %s" % str(last)[:200])
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()

    def _loc(self, target):
        p, t = self.page, str(target or "").strip()
        if re.fullmatch(r"\[?\d+\]?", t):
            loc = p.locator('[data-jv="%s"]' % t.strip("[]"))
            if loc.count():
                return loc.first
            raise RuntimeError("No element [%s]: call elements again (the page changed)." % t.strip("[]"))
        if re.match(r"^([#.\[]|//|css=|xpath=|text=)", t) or re.search(r"[>\[\]=]", t):
            loc = p.locator(t)
            if loc.count():
                return loc.first
        for make in (lambda: p.get_by_role("button", name=t), lambda: p.get_by_role("link", name=t), lambda: p.get_by_label(t),
                     lambda: p.get_by_placeholder(t), lambda: p.get_by_role("tab", name=t), lambda: p.get_by_role("menuitem", name=t),
                     lambda: p.get_by_role("checkbox", name=t), lambda: p.get_by_text(t, exact=True), lambda: p.get_by_text(t),
                     lambda: p.get_by_title(t)):
            try:
                loc = make()
                if loc.count():
                    return loc.first
            except Exception:
                continue
        raise RuntimeError("Nothing on the page matches '%s'. Call elements to see what is there." % t)

    def _settle(self):
        try:
            self.page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception:
            pass
        time.sleep(0.4)

    def do(self, a):
        act = str(a.get("action") or "").lower()
        if act == "close":
            if self.ctx:
                try:
                    self.ctx.close()
                except Exception:
                    pass
            self.ctx = self.page = None
            return "Closed WINNERS Bot's browser."
        self._start()
        p = self.page
        target, value = a.get("target", ""), str(a.get("value", "") or "")
        if act == "open":
            url = str(a.get("url") or value or "").strip()
            if not re.match(r"^[a-z]+://", url):
                url = ("https://" + url) if re.match(r"^[\w-]+(\.[\w-]+)+(/|$)", url) else "https://www.bing.com/search?q=" + urllib.parse.quote(url)
            if a.get("new_tab"):
                self.page = p = self.ctx.new_page()
            p.goto(url, wait_until="domcontentloaded", timeout=45000)
            p.bring_to_front()
            self._settle()
            return "Opened %s: %s" % (p.url, p.title())
        if act == "elements":
            return "Page: %s (%s)\n%s" % (p.title(), p.url, p.evaluate(MARK_JS) or "No interactive elements found.")
        if act == "click":
            loc = self._loc(target)
            loc.scroll_into_view_if_needed(timeout=5000)
            loc.click(timeout=10000)
            self._settle()
            return "Clicked '%s'. Now on: %s" % (target, p.title())
        if act == "fill":
            loc = self._loc(target)
            loc.fill(value, timeout=10000)
            return "Filled '%s'." % target
        if act == "select":
            self._loc(target).select_option(label=value, timeout=10000)
            return "Selected '%s'." % value
        if act == "check":
            loc = self._loc(target)
            loc.uncheck(timeout=8000) if value.lower() in ("false", "off", "no", "uncheck") else loc.check(timeout=8000)
            return "Done."
        if act == "press":
            if target:
                self._loc(target).press(value or "Enter")
            else:
                p.keyboard.press(value or "Enter")
            self._settle()
            return "Pressed %s." % (value or "Enter")
        if act == "read":
            txt = p.evaluate("() => { const m = document.querySelector('main,article,[role=main]') || document.body; return m.innerText; }")
            txt = re.sub(r"\n{3,}", "\n\n", txt or "")
            return "%s (%s)\n%s" % (p.title(), p.url, txt[:9000] + ("\n[...truncated]" if len(txt) > 9000 else ""))
        if act == "wait":
            want = value or str(target)
            p.get_by_text(want).first.wait_for(timeout=float(a.get("timeout") or 20) * 1000)
            return "'%s' is on the page." % want
        if act == "scroll":
            p.mouse.wheel(0, -900 if value.lower() == "up" else 900)
            time.sleep(0.3)
            return "Scrolled %s." % ("up" if value.lower() == "up" else "down")
        if act in ("back", "forward", "reload"):
            getattr(p, {"back": "go_back", "forward": "go_forward", "reload": "reload"}[act])()
            self._settle()
            return "%s: %s" % (act.title(), p.title())
        if act == "tabs":
            return "\n".join("[%d] %s - %s%s" % (i + 1, pg.title()[:60], pg.url[:80], "  (current)" if pg == p else "") for i, pg in enumerate(self.ctx.pages))
        if act == "switch":
            pages = self.ctx.pages
            pick = pages[int(value) - 1] if value.isdigit() and 0 < int(value) <= len(pages) else next((x for x in pages if _norm(value) in _norm(x.title() + " " + x.url)), None)
            if not pick:
                return "No tab like '%s'." % value
            self.page = pick
            pick.bring_to_front()
            return "Switched to %s." % pick.title()
        if act == "close_tab":
            p.close()
            self.page = self.ctx.pages[-1] if self.ctx.pages else self.ctx.new_page()
            return "Closed the tab."
        if act == "screenshot":
            jpg = p.screenshot(type="jpeg", quality=70)
            ok = self.core.brain.send_image(jpg)
            return "Page screenshot shared with you." if ok else "Could not share the screenshot."
        if act == "download":
            with p.expect_download(timeout=120000) as d:
                self._loc(target).click()
            dl = d.value
            folder = Path.home() / "Downloads"
            folder.mkdir(exist_ok=True)
            dest = folder / dl.suggested_filename
            dl.save_as(str(dest))
            return "Downloaded %s (%d KB)." % (dest, dest.stat().st_size // 1024)
        return "Unknown browser action."


# ---------------------------------------------------------------------------------------------
# wait_for
# ---------------------------------------------------------------------------------------------
def _titles():
    try:
        import pygetwindow as gw
        return [w.title for w in gw.getAllWindows() if w.title]
    except Exception:
        pass
    if not IS_WIN:
        try:
            r = subprocess.run(["wmctrl", "-l"], capture_output=True, text=True, timeout=5)
            return [l.split(None, 3)[-1] for l in r.stdout.splitlines()]
        except Exception:
            return []
    return []


def _procs():
    try:
        import psutil
        return [(p.info["name"] or "").lower() for p in psutil.process_iter(["name"])]
    except Exception:
        return []


def wait_for(core, what, value, timeout=30):
    what, value = str(what or "").lower(), str(value or "")
    timeout = min(600.0, float(timeout or 30))
    if what == "seconds":
        s = min(600.0, float(value or 1))
        time.sleep(s)
        return "Waited %.0f seconds." % s
    end, v = time.time() + timeout, _norm(value)
    ocr = core.auto.ocr
    idle_since = None
    while time.time() < end:
        if what == "window" and any(v in _norm(t) for t in _titles()):
            return "The '%s' window is open." % value
        if what == "window_closed" and not any(v in _norm(t) for t in _titles()):
            return "The '%s' window has closed." % value
        if what in ("process", "process_ended"):
            running = any(v in p for p in _procs())
            if running == (what == "process"):
                return "%s is %s." % (value, "running" if running else "no longer running")
        if what == "file" and Path(os.path.expandvars(os.path.expanduser(value))).exists():
            return "%s exists." % value
        if what == "text":
            try:
                if ocr.find(value):
                    return "'%s' is on screen." % value
            except Exception as e:
                return "Cannot read the screen: %s" % e
        if what == "idle":
            try:
                import psutil
                if psutil.cpu_percent(interval=1.0) < float(value or 15):
                    idle_since = idle_since or time.time()
                    if time.time() - idle_since >= 4:
                        return "The computer has gone quiet (CPU under %s%%)." % (value or 15)
                else:
                    idle_since = None
                continue
            except Exception:
                return "psutil is missing."
        time.sleep(0.6)
    return "Timed out after %ds waiting for %s '%s'." % (timeout, what, value)


# ---------------------------------------------------------------------------------------------
# scheduled routines
# ---------------------------------------------------------------------------------------------
class Routines:
    def __init__(self, core, data_dir):
        self.core, self.file = core, Path(data_dir) / "routines.json"
        self.lock = threading.Lock()
        threading.Thread(target=self._loop, daemon=True).start()

    def load(self):
        try:
            return json.loads(self.file.read_text(encoding="utf-8"))
        except Exception:
            return []

    def save(self, rows):
        self.file.write_text(json.dumps(rows, indent=1), encoding="utf-8")

    @staticmethod
    def _next(r, after):
        t = r["time"]
        if len(t) > 5:  # a full date: one shot
            d = dt.datetime.strptime(t, "%Y-%m-%d %H:%M")
            return d if d > after else None
        h, m = map(int, t.split(":"))
        if r["repeat"] == "hourly":
            c = after.replace(minute=m, second=0, microsecond=0)
            return c if c > after else c + dt.timedelta(hours=1)
        c = after.replace(hour=h, minute=m, second=0, microsecond=0)
        if c <= after:
            c += dt.timedelta(days=1)
        for _ in range(8):
            if r["repeat"] == "weekdays" and c.weekday() >= 5:
                c += dt.timedelta(days=1)
            elif r["repeat"] == "weekly" and c.weekday() != r.get("weekday", c.weekday()):
                c += dt.timedelta(days=1)
            else:
                break
        return c

    def tool(self, a):
        act = str(a.get("action") or "").lower()
        with self.lock:
            rows = self.load()
            if act == "add":
                ins, t = str(a.get("instruction") or "").strip(), str(a.get("time") or "").strip()
                rep = str(a.get("repeat") or "once").lower()
                if not ins or not t:
                    return "Give an instruction and a time."
                if not re.fullmatch(r"(\d{4}-\d{2}-\d{2} )?\d{1,2}:\d{2}", t):
                    return "Time must be 'HH:MM' or 'YYYY-MM-DD HH:MM'."
                if rep == "once" and len(t) <= 5:
                    h, m = map(int, t.split(":"))
                    d = dt.datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)
                    if d <= dt.datetime.now():
                        d += dt.timedelta(days=1)
                    t = d.strftime("%Y-%m-%d %H:%M")
                n = max([int(r["id"][1:]) for r in rows] + [0]) + 1
                r = {"id": "R%d" % n, "instruction": ins[:600], "time": t if len(t) > 5 else "%02d:%s" % (int(t.split(":")[0]), t.split(":")[1]),
                     "repeat": rep if rep in ("once", "daily", "weekdays", "weekly", "hourly") else "once", "weekday": dt.datetime.now().weekday(),
                     "paused": False, "last": ""}
                nxt = self._next(r, dt.datetime.now())
                if not nxt:
                    return "That time has already passed."
                rows.append(r)
                self.save(rows)
                return "Scheduled %s: '%s' %s, next at %s." % (r["id"], ins[:80], r["repeat"] if r["repeat"] != "once" else "once", nxt.strftime("%a %d %b %H:%M"))
            if act == "list":
                now = dt.datetime.now()
                return "\n".join("%s  %s%s  next %s  %s" % (r["id"], r["repeat"], " (paused)" if r["paused"] else "",
                                                            (self._next(r, now) or now).strftime("%a %H:%M") if not r["paused"] else "-", r["instruction"][:90]) for r in rows) or "No routines yet."
            r = next((x for x in rows if x["id"].lower() == str(a.get("id") or "").lower()), None)
            if not r:
                return "No routine with that id."
            if act == "delete":
                rows.remove(r)
                self.save(rows)
                return "Deleted %s." % r["id"]
            if act in ("pause", "resume"):
                r["paused"] = act == "pause"
                self.save(rows)
                return "%s %s." % ("Paused" if r["paused"] else "Resumed", r["id"])
            if act == "run":
                self._fire(r)
                return "Running %s now." % r["id"]
        return "Use add, list, delete, run, pause or resume."

    def _fire(self, r):
        self.core.ui({"t": "act", "text": "ROUTINE  ·  %s  ·  %s" % (r["id"], r["instruction"][:50])})
        self.core.activate()
        self.core.brain.say_to_jarvis("[System] Scheduled routine %s is due now. Carry it out with your tools, then tell the user briefly what you did: %s" % (r["id"], r["instruction"]))

    def _loop(self):
        while True:
            time.sleep(20)
            try:
                now = dt.datetime.now()
                with self.lock:
                    rows, changed = self.load(), False
                    for r in list(rows):
                        if r.get("paused"):
                            continue
                        last = dt.datetime.strptime(r["last"], "%Y-%m-%d %H:%M") if r.get("last") else now - dt.timedelta(minutes=2)
                        due = self._next(r, last)
                        if due and due <= now and now - due < dt.timedelta(minutes=10):
                            r["last"] = now.strftime("%Y-%m-%d %H:%M")
                            changed = True
                            if r["repeat"] == "once":
                                rows.remove(r)
                            threading.Thread(target=self._fire, args=(r,), daemon=True).start()
                        elif due and now - due >= dt.timedelta(minutes=10):  # missed while the PC was off: skip ahead silently
                            r["last"] = now.strftime("%Y-%m-%d %H:%M")
                            changed = True
                            if r["repeat"] == "once":
                                rows.remove(r)
                    if changed:
                        self.save(rows)
            except Exception:
                pass


# ---------------------------------------------------------------------------------------------
class Auto:
    def __init__(self, core, data_dir):
        self.core = core
        self.uia, self.ocr = UIA(core), OCR(core)
        self.browser = Browser(core, data_dir)
        self.routines = Routines(core, data_dir)

    def handle(self, name, a):
        if name not in AUTO_NAMES:
            return None
        a = a or {}
        try:
            if name == "ui_auto":
                act = str(a.get("action") or "").lower()
                if act == "snapshot":
                    return self.uia.snapshot(str(a.get("window") or ""), str(a.get("filter") or ""))
                if act == "windows":
                    return self.uia.windows()
                if act == "wait":
                    return self.uia.wait(str(a.get("target") or a.get("value") or ""), str(a.get("window") or ""), a.get("timeout") or 15)
                return self.uia.act(act, a.get("target", ""), str(a.get("value", "") or ""), str(a.get("window") or ""))
            if name == "screen_text":
                act, tgt = str(a.get("action") or "").lower(), str(a.get("target") or "screen")
                if act == "read":
                    return self.ocr.read(tgt)
                if act == "find":
                    hits = self.ocr.find(str(a.get("text") or ""), tgt)
                    return ("Found %d: " % len(hits) + "; ".join("'%s' at (%d, %d)" % (t[:50], x, y) for t, x, y in hits[:8])) if hits else "Not on screen."
                if act == "click":
                    return self.ocr.click(str(a.get("text") or ""), tgt, a.get("nth") or 1, bool(a.get("double")), bool(a.get("right")))
                if act == "wait":
                    return self.ocr.wait(str(a.get("text") or ""), tgt, a.get("timeout") or 20, bool(a.get("gone")))
                return "Use read, find, click or wait."
            if name == "browser":
                return self.browser.call(self.browser.do, a, timeout=max(150, float(a.get("timeout") or 0) + 30))
            if name == "wait_for":
                return wait_for(self.core, a.get("what"), a.get("value"), a.get("timeout") or 30)
            if name == "automation":
                return self.routines.tool(a)
        except Exception as e:
            return "%s failed (%s: %s). Try the next layer: %s." % (name, type(e).__name__, str(e)[:240], {
                "ui_auto": "screen_text or keyboard shortcuts", "screen_text": "look_at_screen then mouse_click",
                "browser": "open_website plus keyboard, or screen_text", "wait_for": "a fixed wait", "automation": "a timer"}[name])
