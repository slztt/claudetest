"""JARVIS Windows helpers: find apps by their real Start-menu names, and press OK on error pop-ups while JARVIS works.

find_app        'roblox player' -> ('Roblox Player', how to launch it), from the Start menu (Get-StartApps and shortcuts), so apps
                open by their proper names instead of a guessed lowercase command.
DialogWatcher   while JARVIS is acting (and for a short time after), standard Windows error/info boxes (OK or Close only) are
                pressed automatically; their text is added to the next tool result so JARVIS can fix the cause. Boxes with real
                choices (Yes/No, Save, Cancel) are never touched. Setting auto_ok_errors turns it off.
"""
import difflib, json, os, platform, re, subprocess, threading, time
from pathlib import Path

IS_WIN = platform.system() == "Windows"
NOWIN = 0x08000000

WIN_TOOLS = [{
    "name": "dialogs",
    "description": "Pop-up boxes on screen (errors, warnings, confirmations). list shows every open dialog with its title, text and buttons; "
                   "press clicks a button by its text in the dialog whose title contains the given text. Error boxes with only OK/Close are "
                   "already pressed automatically while you work.",
    "parameters": {"type": "OBJECT", "properties": {
        "action": {"type": "STRING", "description": "list or press"},
        "title": {"type": "STRING", "description": "press: part of the dialog title"},
        "button": {"type": "STRING", "description": "press: the button text, e.g. OK, Yes, Retry"},
    }, "required": ["action"]},
}]
WIN_NAMES = {t["name"] for t in WIN_TOOLS}


# ---------------------------------------------------------------- apps by their real names
_apps, _apps_at = [], 0.0


def _norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def start_apps():
    """[(name, kind, target)]: Start-menu apps (kind 'appid') and shortcuts (kind 'lnk'). Cached for 10 minutes."""
    global _apps, _apps_at
    if not IS_WIN:
        return []
    if _apps and time.time() - _apps_at < 600:
        return _apps
    out, seen = [], set()
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-Command",
                            "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress"],
                           capture_output=True, text=True, encoding="utf-8", timeout=20, creationflags=NOWIN)
        data = json.loads(r.stdout or "[]")
        for d in (data if isinstance(data, list) else [data]):
            if d.get("Name") and d.get("AppID") and _norm(d["Name"]) not in seen:
                seen.add(_norm(d["Name"]))
                out.append((d["Name"], "appid", d["AppID"]))
    except Exception:
        pass
    for root in (os.path.expandvars(r"%ProgramData%\Microsoft\Windows\Start Menu\Programs"),
                 os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs"),
                 str(Path.home() / "Desktop"), os.path.expandvars(r"%PUBLIC%\Desktop")):
        try:
            for p in Path(root).rglob("*.lnk"):
                if _norm(p.stem) not in seen and not re.search(r"uninstall|readme|help|website", p.stem, re.I):
                    seen.add(_norm(p.stem))
                    out.append((p.stem, "lnk", str(p)))
        except Exception:
            pass
    _apps, _apps_at = out, time.time()
    return out


ALIASES = {"roblox": "roblox player", "roblox game": "roblox player", "roblox client": "roblox player",
           "studio": "roblox studio", "vscode": "visual studio code", "vs code": "visual studio code"}


def find_app(name, apps=None):
    """Best Start-menu match for a spoken app name, or None."""
    apps = start_apps() if apps is None else apps
    q = _norm(name)
    q = ALIASES.get(q, q)
    if not q or not apps:
        return None
    names = [_norm(a[0]) for a in apps]
    for i, n in enumerate(names):
        if n == q:
            return apps[i]
    words = q.split()
    starts = [i for i, n in enumerate(names) if n.startswith(q + " ") or n.startswith(q)]
    if starts:
        return apps[min(starts, key=lambda i: len(names[i]))]
    every = [i for i, n in enumerate(names) if all(w in n.split() for w in words)]
    if every:
        return apps[min(every, key=lambda i: len(names[i]))]
    close = difflib.get_close_matches(q, names, n=1, cutoff=0.78)
    return apps[names.index(close[0])] if close else None


def launch(app):
    name, kind, target = app
    if kind == "appid":
        subprocess.Popen(["explorer.exe", "shell:AppsFolder\\" + target], creationflags=NOWIN)
    else:
        os.startfile(target)
    return name


# ---------------------------------------------------------------- dialogs
OK_WORDS = {"ok", "close", "dismiss", "got it", "continue"}
CHOICE_WORDS = {"yes", "no", "cancel", "save", "don't save", "dont save", "retry", "abort", "ignore", "allow", "deny", "install",
                "delete", "replace", "overwrite", "skip", "try again"}


def _win_api():
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    return ctypes, wintypes, u, proc


def _text(ctypes, u, h):
    buf = ctypes.create_unicode_buffer(1024)
    u.SendMessageTimeoutW(h, 0x000D, 1024, buf, 0x0002, 300, None)   # WM_GETTEXT, abort if hung
    return buf.value


def list_dialogs():
    """[{hwnd, title, text, buttons: [(label, hwnd)], pid}] for visible standard dialogs (#32770)."""
    if not IS_WIN:
        return []
    ctypes, wintypes, u, proc = _win_api()
    found = []

    def top(h, _):
        cls = ctypes.create_unicode_buffer(64)
        u.GetClassNameW(h, cls, 64)
        if cls.value == "#32770" and u.IsWindowVisible(h):
            found.append(h)
        return True
    u.EnumWindows(proc(top), 0)
    out = []
    for h in found:
        pid = wintypes.DWORD()
        u.GetWindowThreadProcessId(h, ctypes.byref(pid))
        texts, buttons = [], []

        def child(c, _):
            cls = ctypes.create_unicode_buffer(64)
            u.GetClassNameW(c, cls, 64)
            t = _text(ctypes, u, c).strip()
            if cls.value == "Button" and t and u.IsWindowVisible(c):
                buttons.append((t.replace("&", ""), c))
            elif cls.value in ("Static", "Edit", "RichEdit20W") and t:
                texts.append(t)
            return True
        u.EnumChildWindows(h, proc(child), 0)
        out.append({"hwnd": h, "title": _text(ctypes, u, h), "text": " ".join(texts)[:600], "buttons": buttons, "pid": pid.value})
    return out


def press(d, label=None):
    ctypes, wintypes, u, proc = _win_api()
    if label is None:
        u.PostMessageW(d["hwnd"], 0x0111, 1, 0)          # WM_COMMAND IDOK: works for message boxes and task dialogs
        return True
    for t, h in d["buttons"]:
        if t.lower() == label.lower() or t.lower().startswith(label.lower()):
            u.PostMessageW(h, 0x00F5, 0, 0)               # BM_CLICK
            return True
    return False


class DialogWatcher:
    def __init__(self, core):
        self.core, self.notes, self.lock = core, [], threading.Lock()
        self.acted, self.handled = 0.0, set()
        if IS_WIN:
            threading.Thread(target=self._loop, daemon=True).start()

    def after_action(self):
        """Called after every tool: keeps the watcher on for a while, and returns notes about boxes it pressed."""
        self.acted = time.monotonic()
        with self.lock:
            notes, self.notes = self.notes, []
        return ("\n[Auto-pressed pop-ups: %s]" % " | ".join(notes)) if notes else ""

    def _loop(self):
        me = os.getpid()
        while True:
            time.sleep(1.2)
            if not self.core.cfg.get("auto_ok_errors", True) or time.monotonic() - self.acted > 90:
                continue
            try:
                for d in list_dialogs():
                    if d["pid"] == me or d["hwnd"] in self.handled:
                        continue
                    labels = {t.lower() for t, _ in d["buttons"]}
                    if labels & CHOICE_WORDS:
                        continue                          # a real decision: leave it for JARVIS or the user
                    if labels and not labels <= OK_WORDS:
                        continue
                    if not labels and not re.search(r"error|failed|cannot|can't|could not|not found|warning|problem|unable|crash", d["title"] + " " + d["text"], re.I):
                        continue
                    ok_label = next((t for t, _ in d["buttons"] if t.lower() in ("ok", "close", "dismiss", "got it", "continue")), None)
                    press(d, ok_label)
                    self.handled.add(d["hwnd"])
                    note = "'%s': %s" % (d["title"] or "dialog", d["text"] or "(no text)")
                    with self.lock:
                        self.notes.append(note[:400])
                    try:
                        self.core.post("log", "sys", "Pressed OK on a pop-up: " + note[:200])
                    except Exception:
                        pass
            except Exception:
                pass

    def handle(self, name, a):
        if name not in WIN_NAMES:
            return None
        if not IS_WIN:
            return "Dialogs can only be handled on Windows."
        ds = list_dialogs()
        act = str(a.get("action") or "list").lower()
        if act == "list":
            if not ds:
                return "No dialogs are open."
            return "\n".join("'%s': %s [buttons: %s]" % (d["title"], d["text"] or "-", ", ".join(t for t, _ in d["buttons"]) or "none found")
                             for d in ds)
        if act == "press":
            want = str(a.get("title") or "").lower()
            label = str(a.get("button") or "OK")
            for d in ds:
                if want in (d["title"] or "").lower():
                    if press(d, label) or (label.lower() == "ok" and press(d)):
                        return "Pressed %s in '%s'." % (label, d["title"])
                    return "No button '%s' in '%s'. Buttons: %s" % (label, d["title"], ", ".join(t for t, _ in d["buttons"]))
            return "No dialog with that title is open."
        return "Use list or press."
