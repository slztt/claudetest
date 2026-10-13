"""JARVIS-3 setup and health check, run by the launcher (JARVIS.bat / start.sh) with JARVIS's own Python.

  python jv_setup.py scan                 report what is installed and what is missing
  python jv_setup.py setup [--local ask|yes|no] [--quiet]
                                          install / repair everything that is missing, then exit 0

Everything is idempotent: on a healthy install it finishes in a second or two.
"""
import glob, json, os, platform, shutil, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
IS_WIN = platform.system() == "Windows"
DATA = Path.home() / ".jarvis"
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
    import jv_models
    hw = jv_models.hardware()
    rec = jv_models.recommend()
    cfg = load(CFG, {})
    up = jv_models.ollama_up()
    models = []
    if up:
        try:
            models = jv_models.ChatClient({"brain_provider": "ollama"}).list_models()
        except Exception:
            pass
    voice = (DATA / "voices" / "kokoro-v1.0.onnx").exists() and (DATA / "voices" / "voices-v1.0.bin").exists()
    info = {
        "python": sys.version.split()[0], "gpu": hw["gpu"], "vram_gb": hw["vram_gb"], "ram_gb": hw["ram_gb"],
        "ollama": up, "ollama_installed": bool(shutil.which("ollama") or (IS_WIN and os.path.exists(os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")))),
        "models": models, "best": rec["models"], "vision": rec["vision"], "voice": voice, "browser": find_browser(),
        "node": shutil.which("node") or "", "blender": find_blender(), "roblox_studio": find_roblox_studio(),
        "brain": cfg.get("brain_provider", "gemini-live"), "brain_model": cfg.get("brain_model", ""), "gemini_key": bool(cfg.get("api_key")),
    }
    return info


def print_scan(i):
    say("step", "Scanning this PC")
    say("ok", "Python %s" % i["python"])
    say("ok" if i["vram_gb"] else "warn", "Graphics: %s%s · %s GB RAM" % (i["gpu"], " · %s GB VRAM" % i["vram_gb"] if i["vram_gb"] else "", i["ram_gb"]))
    say("ok" if i["ollama"] else "warn", "Ollama (local AI engine): %s" % ("running" if i["ollama"] else "installed, not running" if i["ollama_installed"] else "not installed"))
    have = [m for m in i["best"] if m in i["models"]]
    say("ok" if have else "warn", "Local brain: %s (best for this PC: %s)" % (have[0] if have else "none downloaded", i["best"][0]))
    say("ok" if i["voice"] else "warn", "Free JARVIS voice (Kokoro): %s" % ("ready" if i["voice"] else "not downloaded"))
    say("ok" if i["browser"] else "warn", "Browser for automation: %s" % (os.path.basename(i["browser"]) if i["browser"] else "none found (Chromium will be downloaded)"))
    say("ok" if i["node"] else "dim", "Node.js (some MCP servers): %s" % ("found" if i["node"] else "not found (optional)"))
    say("ok" if i["blender"] else "dim", "Blender: %s" % (i["blender"] or "not found (optional)"))
    say("ok" if i["roblox_studio"] else "dim", "Roblox Studio: %s" % ("found" if i["roblox_studio"] else "not found (optional)"))
    say("ok", "Current brain: %s%s" % (i["brain"], " · " + i["brain_model"] if i["brain_model"] else ""))


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
def setup(local="ask", quiet=False):
    import jv_models, jv_auto, jv_mcp
    state = load(STATE, {})
    info = scan()
    print_scan(info)
    problems = []

    # 1. Local AI -------------------------------------------------------------------------------
    have = [m for m in info["best"] if m in info["models"]]
    want_local = state.get("local_ai")
    if local == "yes":
        want_local = True
    elif local == "no":
        want_local = False
    elif want_local is None:
        gb = "%d-%d GB" % ((4, 8) if info["vram_gb"] < 8 else (6, 14) if info["vram_gb"] < 20 else (20, 70))
        print()
        say("dim", "JARVIS can think with a FREE AI that runs on this PC (private, no API key, works offline).")
        say("dim", "Best for this PC: %s (thinks and uses tools) + %s (sees the screen). Download: about %s." % (info["best"][0], info["vision"], gb))
        if not info["vram_gb"]:
            say("warn", "No NVIDIA graphics card found: it will run on the processor, which is slow. A cloud brain (Gemini/Claude/GPT key) is faster.")
        want_local = ask("Set up the free local AI?", default=bool(info["vram_gb"]) or info["ram_gb"] >= 16)
        state["local_ai"] = want_local
        save(STATE, state)
    if want_local and not have:
        say("step", "Setting up the local AI")
        why = jv_models.install_ollama(lambda t, f=None: say("dim", t))
        if why:
            say("bad", why)
            problems.append(why)
        else:
            chosen = ""
            for m in info["best"]:
                try:
                    say("dim", "Downloading %s ..." % m)
                    jv_models.ollama_pull(m, lambda t, f: bar(t, f))
                    print()
                    chosen = m
                    break
                except Exception as e:
                    print()
                    say("warn", "%s not available (%s); trying the next choice" % (m, str(e)[:80]))
            vis = ""
            if chosen:
                try:
                    say("dim", "Downloading %s (vision) ..." % info["vision"])
                    jv_models.ollama_pull(info["vision"], lambda t, f: bar(t, f))
                    print()
                    vis = info["vision"]
                except Exception as e:
                    print()
                    say("warn", "Vision model skipped (%s)" % str(e)[:80])
                cfg_set(brain_provider="ollama", brain_model=chosen, brain_url="", vision_model=vis, stt_mode="local")
                say("ok", "Local brain ready: %s%s" % (chosen, " + " + vis if vis else ""))
            else:
                problems.append("No local model could be downloaded.")
    elif want_local and have:
        if not jv_models.ollama_up():
            jv_models.install_ollama(lambda t, f=None: None)   # just start the server
        cfg = load(CFG, {})
        if cfg.get("brain_provider", "gemini-live") == "gemini-live" and not cfg.get("api_key"):
            cfg_set(brain_provider="ollama", brain_model=have[0], stt_mode="local")
        say("ok", "Local brain ready: %s" % have[0])

    # 2. Free voice ----------------------------------------------------------------------------
    if not state.get("voice_ok"):
        say("step", "Preparing the free JARVIS voice (Kokoro, about 340 MB once)")
        try:
            class _Core:
                cfg = load(CFG, {})
                voice_dir = DATA / "voices"

                def post(self, *a):
                    if a and a[0] == "status" and len(a) > 1 and a[1]:
                        say("dim", a[1])

                def ui(self, ev):
                    pass
            pcm = jv_models.kokoro_pcm(_Core(), "Systems online.")
            if len(pcm) > 1000:
                state["voice_ok"] = True
                save(STATE, state)
                cfg = load(CFG, {})
                if not cfg.get("fish_key") and cfg.get("tts_mode", "auto") in ("auto", ""):
                    cfg_set(tts_mode="kokoro", kokoro_voice=cfg.get("kokoro_voice") or "bm_george")
                say("ok", "Voice ready (George, British)")
        except Exception as e:
            say("warn", "Voice not ready (%s). JARVIS will use a built-in voice and retry later." % str(e)[:120])

    # 3. Local speech recognition --------------------------------------------------------------
    if not state.get("whisper_ok"):
        say("step", "Preparing local speech recognition (faster-whisper)")
        try:
            if info["vram_gb"] and IS_WIN:
                # GPU speech recognition needs NVIDIA's CUDA 12 libraries; they come as pip packages (about 1 GB, optional)
                try:
                    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"], timeout=1800)
                except Exception:
                    pass
            jv_models.local_transcribe(b"\x00\x00" * 16000)
            state["whisper_ok"] = True
            save(STATE, state)
            say("ok", "Speech recognition ready (on the %s)" % ("graphics card" if jv_models._whisper.get("device") == "cuda" else "processor"))
        except Exception as e:
            say("warn", "Speech recognition not ready (%s); it will be retried when first used." % str(e)[:120])

    # 4. Automation browser --------------------------------------------------------------------
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

    # 5. MCP: connect what is on this PC -------------------------------------------------------
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
            added = []
            if info["blender"] and "blender" not in cfg["mcpServers"]:
                cfg["mcpServers"]["blender"] = {k: v for k, v in jv_mcp.PRESETS["blender"].items() if k in ("command", "args")}
                added.append("blender")
            if info["node"] and "thinking" not in cfg["mcpServers"]:
                cfg["mcpServers"]["thinking"] = {k: v for k, v in jv_mcp.PRESETS["thinking"].items() if k in ("command", "args")}
                added.append("thinking")
            if added:
                save(hub.file, cfg)
                say("ok", "Added MCP servers: %s" % ", ".join(added))
                if "blender" in added:
                    say("dim", "Blender: run  uvx blender-mcp install-addon  once, then in Blender press N > BlenderMCP > Start MCP Server.")
            if info["roblox_studio"] and not any("rbx" in json.dumps(v).lower() or "roblox" in k.lower() for k, v in cfg["mcpServers"].items()):
                say("dim", "Roblox Studio found. For the Studio tools, install the Roblox Studio MCP server (github.com/Roblox/studio-rust-mcp-server), then run this launcher again.")
            state["mcp_scanned"] = True
            save(STATE, state)
        except Exception as e:
            say("warn", "MCP scan skipped (%s)" % str(e)[:100])

    cfg = load(CFG, {})
    if cfg.get("brain_provider", "gemini-live") == "gemini-live" and not cfg.get("api_key"):
        say("warn", "No brain yet: JARVIS will open Configuration so you can add a key or press 'Set up local AI'.")
    state["last_setup"] = time.strftime("%Y-%m-%d %H:%M")
    state["complete"] = not problems
    save(STATE, state)
    print()
    say("ok" if not problems else "warn", "Setup finished%s." % ("" if not problems else " with warnings: " + "; ".join(problems)))
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "scan":
        print_scan(scan())
        sys.exit(0)
    if a[0] == "setup":
        local = "ask"
        if "--local" in a and a.index("--local") + 1 < len(a):
            local = a[a.index("--local") + 1]
        sys.exit(setup(local, "--quiet" in a))
    print(__doc__)
