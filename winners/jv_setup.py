"""WINNERS Bot setup and health check, run by the launcher (WINNERS.bat / start.sh) with WINNERS Bot's own Python.

  python jv_setup.py scan                 report what is installed and what is missing
  python jv_setup.py setup
                                          install / repair everything that is missing, then exit 0

Everything is idempotent: on a healthy install it finishes in a second or two.
"""
import glob, json, os, platform, shutil, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
IS_WIN = platform.system() == "Windows"
DATA = Path.home() / ".winnersbot"
CFG = DATA / "config.json"
STATE = DATA / "setup.json"
C = {"ok": "\033[96m", "warn": "\033[93m", "bad": "\033[91m", "dim": "\033[90m", "end": "\033[0m", "b": "\033[1m"}
if IS_WIN:
    os.system("")  # enable ANSI colours in the Windows console


def say(kind, text):
    mark = {"ok": "  OK ", "warn": "  !! ", "bad": "  XX ", "dim": "     ", "step": " >>> "}[kind]
    col = {"step": C["b"]}.get(kind, C.get(kind, ""))
    print("%s%s%s %s" % (col, mark, C["end"], text), flush=True)


def load(p, d):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return d


def save(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")


def cfg_set(**kw):
    cfg = load(CFG, {})
    cfg.update(kw)
    save(CFG, cfg)


def bar(label, frac):
    if frac is None:
        print("\r     %s%s" % (label[:70], " " * 20), end="", flush=True)
        return
    n = int(frac * 30)
    print("\r     [%s%s] %5.1f%%  %s" % ("#" * n, "." * (30 - n), frac * 100, label[:46].ljust(46)), end="", flush=True)


def find_blender():
    pats = [r"C:\Program Files\Blender Foundation\*\blender.exe", os.path.expandvars(r"%LOCALAPPDATA%\Programs\Blender Foundation\*\blender.exe")] if IS_WIN \
        else ["/Applications/Blender.app/Contents/MacOS/Blender", "/usr/bin/blender", "/snap/bin/blender"]
    for p in pats:
        hits = sorted(glob.glob(p))
        if hits:
            return hits[-1]
    return shutil.which("blender") or ""


def find_roblox_studio():
    if not IS_WIN:
        return "/Applications/RobloxStudio.app" if os.path.exists("/Applications/RobloxStudio.app") else ""
    hits = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\Roblox\Versions\*\RobloxStudioBeta.exe"))
    return hits[0] if hits else ""


def find_browser():
    if IS_WIN:
        for p in (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                  r"C:\Program Files\Google\Chrome\Application\chrome.exe", os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")):
            if os.path.exists(p):
                return p
        return ""
    for n in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
        if shutil.which(n):
            return shutil.which(n)
    return "/Applications/Google Chrome.app" if os.path.exists("/Applications/Google Chrome.app") else ""


# ---------------------------------------------------------------------------------------------
def scan():
    cfg = load(CFG, {})
    ollama = bool(shutil.which("ollama") or (IS_WIN and os.path.exists(os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe"))))
    return {"python": sys.version.split()[0], "gemini_key": bool(cfg.get("api_key")), "fish_key": bool(cfg.get("fish_key")),
            "browser": find_browser(), "node": shutil.which("node") or "", "blender": find_blender(),
            "roblox_studio": find_roblox_studio(), "ollama": ollama}


def print_scan(i):
    say("step", "Scanning this PC")
    say("ok", "Python %s" % i["python"])
    say("ok" if i["gemini_key"] else "warn", "Gemini key (the brain): %s" % ("set" if i["gemini_key"] else "missing"))
    say("ok" if i["fish_key"] else "dim", "Fish Audio film voice: %s" % ("set" if i["fish_key"] else "not set (optional; Gemini's own voice is used)"))
    say("ok" if i["browser"] else "warn", "Browser for automation: %s" % (os.path.basename(i["browser"]) if i["browser"] else "none found (Chromium will be downloaded)"))
    say("ok" if i["blender"] else "dim", "Blender: %s" % (i["blender"] or "not found (optional)"))
    say("ok" if i["roblox_studio"] else "dim", "Roblox Studio: %s" % ("found" if i["roblox_studio"] else "not found (optional)"))


def read_line(prompt, timeout=240):
    """A line of input with a timeout (empty string when nobody answers)."""
    print("%s  ?? %s %s" % (C["b"], C["end"], prompt), end="", flush=True)
    try:
        if IS_WIN:
            import msvcrt
            end, buf = time.time() + timeout, ""
            while time.time() < end:
                if msvcrt.kbhit():
                    ch = msvcrt.getwch()
                    if ch in "\r\n":
                        print()
                        return buf.strip()
                    if ch == "\b":
                        buf = buf[:-1]
                        print("\b \b", end="", flush=True)
                        continue
                    buf += ch
                    print("*", end="", flush=True)
                time.sleep(0.03)
            print()
            return ""
        import select
        r, _, _ = select.select([sys.stdin], [], [], timeout)
        return sys.stdin.readline().strip() if r else ""
    except Exception:
        return ""


def ask(question, default=True, timeout=25):
    """Yes/no with a default after `timeout` seconds (so an unattended setup still finishes)."""
    hint = "Y/n" if default else "y/N"
    print("%s  ?? %s %s [%s] (auto-%s in %ds): " % (C["b"], C["end"], question, hint, "yes" if default else "no", timeout), end="", flush=True)
    ans = None
    try:
        if IS_WIN:
            import msvcrt
            end, buf = time.time() + timeout, ""
            while time.time() < end:
                if msvcrt.kbhit():
                    ch = msvcrt.getwche()
                    if ch in "\r\n":
                        ans = buf
                        break
                    buf += ch
                time.sleep(0.05)
        else:
            import select
            r, _, _ = select.select([sys.stdin], [], [], timeout)
            ans = sys.stdin.readline() if r else None
    except Exception:
        ans = None
    print()
    if not ans or not ans.strip():
        return default
    return ans.strip().lower().startswith("y")


# ---------------------------------------------------------------------------------------------
def setup(quiet=False):
    import jv_auto, jv_mcp
    state = load(STATE, {})
    info = scan()
    print_scan(info)
    problems = []

    # 1. Gemini key ---------------------------------------------------------------------------
    cfg = load(CFG, {})
    if not cfg.get("api_key"):
        import webbrowser
        print()
        say("step", "Gemini key (free): WINNERS Bot thinks, hears, sees and speaks with Google Gemini")
        say("dim", "Opening aistudio.google.com/apikey: sign in, press 'Create API key', copy it, paste it here and press Enter.")
        try:
            webbrowser.open("https://aistudio.google.com/apikey")
        except Exception:
            pass
        k = read_line("Gemini key: ")
        if k:
            cfg_set(api_key=k)
            say("ok", "Gemini key saved")
        else:
            say("warn", "Skipped: WINNERS Bot will open Configuration so you can paste it.")
            problems.append("no Gemini key")

    # 2. Leftovers from the local-AI version ---------------------------------------------------
    if False:   # the old JARVIS local-AI clean-up does not apply to the WINNERS Bot
        state["cleanup_v5"] = True
        save(STATE, state)
        cfg = load(CFG, {})
        for k in ("brain_provider", "brain_model", "brain_key", "brain_url", "brain_think", "brain_ctx", "tool_limit", "vision_model", "groq_key",
                  "openrouter_key", "local_fallback", "stt_mode", "tts_mode", "tts_voice", "kokoro_voice", "kokoro_speed"):
            cfg.pop(k, None)
        save(CFG, cfg)
        for d in (DATA / "voices",):
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)
        if info["ollama"]:
            models_dir = Path.home() / ".ollama" / "models"
            size = sum(f.stat().st_size for f in models_dir.rglob("*") if f.is_file()) / 2 ** 30 if models_dir.exists() else 0
            print()
            say("dim", "The local AI engine (Ollama) from the earlier version is still installed (%.1f GB of models)." % size)
            if ask("Remove it to free the space?", default=True):
                try:
                    if IS_WIN:
                        subprocess.run(["taskkill", "/F", "/IM", "ollama.exe"], capture_output=True)
                        subprocess.run(["taskkill", "/F", "/IM", "ollama app.exe"], capture_output=True)
                    else:
                        subprocess.run(["pkill", "ollama"], capture_output=True)
                    shutil.rmtree(models_dir, ignore_errors=True)
                    if IS_WIN:
                        subprocess.run(["winget", "uninstall", "-e", "--id", "Ollama.Ollama", "--silent", "--accept-source-agreements"], capture_output=True, timeout=600)
                    say("ok", "Removed (%.1f GB freed)." % size)
                except Exception as e:
                    say("warn", "Could not remove everything (%s). Windows Settings > Apps > Ollama can uninstall it." % str(e)[:100])
        for pkg in ("kokoro-onnx", "faster-whisper", "ctranslate2", "nvidia-cublas-cu12", "nvidia-cudnn-cu12"):
            subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", pkg], capture_output=True)

    # 3. Automation browser --------------------------------------------------------------------
    if not state.get("browser_ok"):
        try:
            jv_auto.ensure("playwright")
            if not info["browser"]:
                say("step", "Downloading a browser for automation (Chromium)")
                subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
            state["browser_ok"] = True
            save(STATE, state)
            say("ok", "Browser automation ready")
        except Exception as e:
            say("warn", "Browser automation not ready (%s)" % str(e)[:120])

    # 4. MCP: connect what is on this PC -------------------------------------------------------
    if not state.get("mcp_scanned"):
        class _C:
            cfg = {}

            def ui(self, ev):
                pass

            def post(self, *a):
                pass
        hub = jv_mcp.Hub.__new__(jv_mcp.Hub)
        hub.core, hub.file = _C(), DATA / "mcp.json"
        try:
            n = jv_mcp.Hub.import_claude(hub)
            if n:
                say("ok", "Imported %d MCP servers from Claude Desktop / Cursor" % n)
            cfg = hub.config()
            if info["blender"] and "blender" not in cfg["mcpServers"]:
                cfg["mcpServers"]["blender"] = {k: v for k, v in jv_mcp.PRESETS["blender"].items() if k in ("command", "args")}
                save(hub.file, cfg)
                say("ok", "Added the Blender MCP server")
                say("dim", "Blender: run  uvx blender-mcp install-addon  once, then in Blender press N > BlenderMCP > Start MCP Server.")
            if info["roblox_studio"] and not any("rbx" in json.dumps(v).lower() or "roblox" in k.lower() for k, v in cfg["mcpServers"].items()):
                say("dim", "Roblox Studio found. For Studio tools, install the Roblox Studio MCP server (github.com/Roblox/studio-rust-mcp-server), then run this again.")
            state["mcp_scanned"] = True
            save(STATE, state)
        except Exception as e:
            say("warn", "MCP scan skipped (%s)" % str(e)[:100])

    state["last_setup"] = time.strftime("%Y-%m-%d %H:%M")
    state["complete"] = not problems
    state["v"] = 5
    save(STATE, state)
    print()
    say("ok" if not problems else "warn", "Setup finished%s." % ("" if not problems else " (" + "; ".join(problems) + ")"))
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "scan":
        print_scan(scan())
        sys.exit(0)
    if a[0] == "setup":
        sys.exit(setup("--quiet" in a))
    print(__doc__)
