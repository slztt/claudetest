"""Execution layer for WINNERS Bot: exact, verifiable work done with scripts.

  ScriptRunner  writes a script to disk, runs it with the right interpreter (Python, PowerShell, bash, cmd, Node,
                Blender's bpy, ...), captures the output, and CHECKS the result against what the caller expected.
  Jobs          tracks work running in the background (cancel it, read its log, get told when it finishes).
  helpers       file operations (deletes go to a recoverable trash), processes, downloads, and authenticated API calls.
"""
import glob, hashlib, json, os, platform, re, shutil, signal, subprocess, sys, threading, time, zipfile
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

IS_WIN = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"
NO_WINDOW = 0x08000000

# ---------------------------------------------------------------------------------------------
# Languages
# ---------------------------------------------------------------------------------------------
EXT = {"python": ".py", "powershell": ".ps1", "bash": ".sh", "cmd": ".bat", "node": ".js", "blender": ".py", "luau": ".lua"}
LANG_ALIAS = {"py": "python", "python3": "python", "ps": "powershell", "ps1": "powershell", "pwsh": "powershell",
              "sh": "bash", "shell": "bash", "batch": "cmd", "bat": "cmd", "js": "node", "javascript": "node", "nodejs": "node",
              "bpy": "blender", "lua": "luau", "roblox": "luau", "robloxstudio": "luau", "roblox-studio": "luau"}


def norm_lang(lang):
    l = (lang or "").strip().lower()
    l = LANG_ALIAS.get(l, l)
    return l if l in EXT else ""


def py_exe():
    exe = sys.executable
    if IS_WIN and exe.lower().endswith("pythonw.exe"):
        alt = exe[:-len("pythonw.exe")] + "python.exe"
        if os.path.exists(alt):
            return alt
    return exe


def script_env():
    env = dict(os.environ)
    env.update({"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"})
    return env


def ps_quote(s):
    return "'" + str(s).replace("'", "''") + "'"


# ---------------------------------------------------------------------------------------------
# Risk assessment of a script before it runs
# ---------------------------------------------------------------------------------------------
PY_RISKY = re.compile(
    r"(\bos\.(remove|unlink|rmdir|removedirs|rename|system|kill|killpg|popen|startfile|chmod|chown|execv?p?e?)\b|"
    r"\bshutil\.(rmtree|move)\b|\.unlink\(|\.rmdir\(|send2trash|\bsubprocess\b|\bctypes\b|\bwinreg\b|\b_winreg\b|"
    r"\bpip\b.{0,40}\binstall|\bexec\(|__import__|bpy\.ops\.wm\.(save_mainfile|save_as_mainfile|read_homefile|read_factory_settings)|"
    r"\bsocket\.socket\b|smtplib)", re.I)
PY_HARD = re.compile(r"(rmtree\(\s*(r?['\"](/|~|[a-z]:\\{0,2})['\"]|path\.home|os\.path\.expanduser)|shutil\.rmtree\(\s*os\.environ)", re.I)
NODE_RISKY = re.compile(r"(child_process|\bfs\.(rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync|rename|renameSync)\b|process\.kill)", re.I)


def assess(lang, code, shell_risky, shell_hard):
    """Returns 'hard', 'risky' or 'safe'."""
    code = code or ""
    if shell_hard(code) or PY_HARD.search(code):
        return "hard"
    if lang in ("powershell", "bash", "cmd"):
        return "risky" if shell_risky(code) else "safe"
    if lang in ("python", "blender"):
        return "risky" if (PY_RISKY.search(code) or shell_hard(code)) else "safe"
    if lang == "node":
        return "risky" if NODE_RISKY.search(code) else "safe"
    return "safe"


# ---------------------------------------------------------------------------------------------
# Finding programs
# ---------------------------------------------------------------------------------------------
def _newest(paths):
    paths = [p for p in paths if p and os.path.exists(p)]
    try:
        return sorted(paths, key=lambda p: (os.path.getmtime(p), p))[-1] if paths else None
    except OSError:
        return paths[-1] if paths else None


def find_blender(custom=""):
    custom = (custom or "").strip().strip('"')
    if custom:
        p = Path(custom)
        if p.is_dir():
            p = next((p / n for n in ("blender.exe", "blender", "Blender.app/Contents/MacOS/Blender") if (p / n).exists()), p)
        if p.exists():
            return str(p)
    w = shutil.which("blender")
    if w:
        return w
    c = []
    if IS_WIN:
        bases = [os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", ""),
                 os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs")]
        for b in bases:
            if b:
                c += glob.glob(os.path.join(b, "Blender Foundation", "Blender*", "blender.exe"))
        for d in "CDEFG":
            c += glob.glob(d + r":\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe")
            c += glob.glob(d + r":\SteamLibrary\steamapps\common\Blender\blender.exe")
    elif IS_MAC:
        c += ["/Applications/Blender.app/Contents/MacOS/Blender"]
    else:
        c += ["/usr/bin/blender", "/snap/bin/blender", "/usr/local/bin/blender", "/opt/blender/blender"]
    return _newest(c)


def find_studio(custom=""):
    custom = (custom or "").strip().strip('"')
    if custom and os.path.exists(custom):
        return custom
    c = []
    if IS_WIN:
        la = os.environ.get("LOCALAPPDATA", "")
        c += glob.glob(os.path.join(la, "Roblox", "Versions", "*", "RobloxStudioBeta.exe"))
    elif IS_MAC:
        c += ["/Applications/RobloxStudio.app"]
    return _newest(c)


def studio_plugins_dir():
    if IS_WIN:
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Roblox" / "Plugins"
    return Path.home() / "Documents" / "Roblox" / "Plugins"


def find_program(name):
    """Look for an installed program by name. Returns a readable list of matches."""
    n = (name or "").strip().lower()
    if not n:
        return "No program name given."
    out = []
    if "blender" in n:
        b = find_blender()
        if b:
            out.append("Blender: " + b)
    if "studio" in n or "roblox" in n:
        s = find_studio()
        if s:
            out.append("Roblox Studio: " + s)
    w = shutil.which(n) or shutil.which(n.replace(" ", ""))
    if w:
        out.append("On PATH: " + w)
    if IS_WIN:
        roots = [os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
                 os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs"), os.environ.get("LOCALAPPDATA", ""),
                 os.environ.get("APPDATA", "")]
        for r in roots:
            if r and os.path.isdir(r):
                try:
                    for e in os.listdir(r):
                        if n.replace(" ", "") in e.lower().replace(" ", ""):
                            out.append("Folder: " + os.path.join(r, e))
                except OSError:
                    pass
        starts = [os.path.join(os.environ.get("ProgramData", ""), "Microsoft", "Windows", "Start Menu", "Programs"),
                  os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs")]
        for s in starts:
            if s and os.path.isdir(s):
                for p in glob.glob(os.path.join(s, "**", "*.lnk"), recursive=True):
                    if n.replace(" ", "") in os.path.basename(p).lower().replace(" ", ""):
                        out.append("Shortcut (open_path works on it): " + p)
    elif IS_MAC:
        out += ["App: " + p for p in glob.glob("/Applications/*%s*.app" % name)]
    return "\n".join(dict.fromkeys(out))[:2500] or "Could not find '%s' on this computer." % name


# ---------------------------------------------------------------------------------------------
# Running processes
# ---------------------------------------------------------------------------------------------
def kill_tree(proc):
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, creationflags=NO_WINDOW, timeout=10)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def run_proc(cmd, log, cwd=None, env=None, timeout=60, on_proc=None, cancelled=lambda: False):
    """Run a command with its output going to the log file. Returns (exit_code, timed_out, was_cancelled)."""
    kw = {"creationflags": NO_WINDOW} if IS_WIN else {"start_new_session": True}
    Path(log).parent.mkdir(parents=True, exist_ok=True)
    with open(log, "wb") as fh:
        proc = subprocess.Popen(cmd, stdout=fh, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, cwd=cwd, env=env, **kw)
        if on_proc:
            on_proc(proc)
        end, timed_out, was_cancelled = time.time() + float(timeout), False, False
        while True:
            try:
                code = proc.wait(timeout=0.3)
                break
            except subprocess.TimeoutExpired:
                if cancelled():
                    kill_tree(proc); proc.wait(); code, was_cancelled = -1, True
                    break
                if time.time() > end:
                    kill_tree(proc); proc.wait(); code, timed_out = -1, True
                    break
    return code, timed_out, was_cancelled


def read_log(path, limit=3500):
    try:
        txt = Path(path).read_text(encoding="utf-8", errors="replace").lstrip("\ufeff")
    except OSError:
        return ""
    txt = txt.replace("\r\n", "\n").strip()
    if len(txt) <= limit:
        return txt
    head = 700
    return txt[:head] + "\n...[middle of the output trimmed]...\n" + txt[-(limit - head):]


# ---------------------------------------------------------------------------------------------
# Script runner
# ---------------------------------------------------------------------------------------------
class ScriptRunner:
    def __init__(self, folder, cfg, resolve):
        self.dir, self.cfg, self.resolve = Path(folder), cfg, resolve
        (self.dir / "logs").mkdir(parents=True, exist_ok=True)

    def write(self, lang, code, name):
        stem = re.sub(r"[^\w\-]+", "-", (name or "script")).strip("-")[:40] or "script"
        path = self.dir / ("%s-%s%s" % (time.strftime("%Y%m%d-%H%M%S"), stem, EXT[lang]))
        n = 1
        while path.exists():
            n += 1
            path = self.dir / ("%s-%s-%d%s" % (time.strftime("%Y%m%d-%H%M%S"), stem, n, EXT[lang]))
        text = code.replace("\r\n", "\n")
        if lang == "powershell":
            text = "$ProgressPreference='SilentlyContinue'\n[Console]::OutputEncoding=[Text.Encoding]::UTF8\n" + text
            path.write_text(text.replace("\n", "\r\n"), encoding="utf-8-sig")
        elif lang == "cmd":
            path.write_text(text.replace("\n", "\r\n"), encoding="utf-8")
        else:
            path.write_text(text, encoding="utf-8", newline="\n")
        if lang == "bash":
            try:
                path.chmod(0o755)
            except OSError:
                pass
        return path

    def build(self, lang, path, args, blend=""):
        """Returns (command list, error text)."""
        args = args if isinstance(args, list) else (re.findall(r'"[^"]*"|\S+', args or "") if args else [])
        args = [a.strip('"') for a in args]
        if lang == "python":
            return [py_exe(), str(path)] + args, ""
        if lang == "powershell":
            exe = shutil.which("powershell") if IS_WIN else shutil.which("pwsh")
            if not exe:
                return None, "PowerShell is not available on this computer."
            return [exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(path)] + args, ""
        if lang == "bash":
            exe = shutil.which("bash")
            return ([exe, str(path)] + args, "") if exe else (None, "bash is not available on this computer.")
        if lang == "cmd":
            return (["cmd", "/c", str(path)] + args, "") if IS_WIN else (None, "cmd scripts only run on Windows.")
        if lang == "node":
            exe = shutil.which("node")
            return ([exe, str(path)] + args, "") if exe else (None, "Node.js is not installed. Install it first or use Python.")
        if lang == "blender":
            exe = find_blender(self.cfg.get("blender_path", ""))
            if not exe:
                return None, "Blender was not found. Install it, or set its location in Configuration > Integrations."
            cmd = [exe, "-b", "--factory-startup"] if not blend else [exe, "-b"]
            if blend:
                b = self.resolve(blend)
                if not b.exists():
                    return None, "The .blend file does not exist: %s" % b
                cmd.append(str(b))
            # --python-exit-code makes Blender return a non-zero exit code when the script raises (it returns 0 otherwise)
            cmd += ["--python-exit-code", "1", "--python", str(path)]
            if args:
                cmd += ["--"] + args
            return cmd, ""
        return None, "Unsupported language '%s'." % lang

    def elevate(self, cmd, log):
        """Wrap a command so it runs elevated. Returns (command, log file the elevated process writes to)."""
        if not IS_WIN:
            sudo = shutil.which("sudo")
            return ([sudo, "-n"] + cmd, log) if sudo else (None, log)
        elog = str(log) + ".elevated"
        wrapper = Path(str(log) + ".elevate.ps1")
        body = ("$ErrorActionPreference='Continue'\r\n& " + " ".join(ps_quote(c) for c in cmd) +
                " *>&1 | Out-File -FilePath " + ps_quote(elog) + " -Encoding utf8\r\nexit $LASTEXITCODE\r\n")
        wrapper.write_text(body, encoding="utf-8-sig")
        outer = ("try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList "
                 "'-NoProfile','-ExecutionPolicy','Bypass','-File'," + ps_quote('"%s"' % wrapper) + "; exit $p.ExitCode } "
                 "catch { Write-Output ('Elevation failed or was cancelled: ' + $_.Exception.Message); exit 1223 }")
        return ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", outer], elog

    def check(self, expect_files, expect_output, out):
        """Compare the result with what the caller said should happen. Returns (list of lines, all_ok or None)."""
        lines, ok = [], True
        files = [f.strip() for f in re.split(r"[;\n|]+", expect_files or "") if f.strip()]
        for f in files:
            p = self.resolve(f)
            if p.is_dir():
                lines.append("OK   folder exists: %s" % p)
            elif p.exists() and p.stat().st_size > 0:
                lines.append("OK   file exists: %s (%s)" % (p, _size(p.stat().st_size)))
            elif p.exists():
                ok = False
                lines.append("FAIL file is EMPTY: %s" % p)
            else:
                ok = False
                lines.append("FAIL file is MISSING: %s" % p)
        for needle in [s.strip() for s in re.split(r"\|\|", expect_output or "") if s.strip()]:
            if needle.lower() in (out or "").lower():
                lines.append("OK   output contains '%s'" % needle[:60])
            else:
                ok = False
                lines.append("FAIL output does not contain '%s'" % needle[:60])
        return lines, (ok if lines else None)

    def execute(self, spec, job=None):
        """spec: lang, code, name, args, blend, timeout, admin, expect_files, expect_output.  Returns a result dict."""
        t0 = time.time()
        lang = spec["lang"]
        path = self.write(lang, spec["code"], spec.get("name"))
        cmd, err = self.build(lang, path, spec.get("args"), spec.get("blend", ""))
        res = {"ok": False, "code": None, "out": "", "secs": 0.0, "path": str(path), "checks": [], "verified": None,
               "timed_out": False, "cancelled": False, "error": ""}
        if err:
            res["error"] = err
            return res
        log = job.log if job else self.dir / "logs" / (path.stem + ".log")
        log = str(log)
        read_from = log
        if spec.get("admin"):
            cmd, read_from = self.elevate(cmd, log)
            if not cmd:
                res["error"] = "Elevated execution is not available here (no sudo)."
                return res
        try:
            code, timed, canc = run_proc(cmd, log, cwd=str(path.parent), env=script_env(), timeout=spec.get("timeout", 60),
                                         on_proc=(lambda p: setattr(job, "proc", p)) if job else None,
                                         cancelled=(lambda: job.cancel_flag) if job else (lambda: False))
        except Exception as e:
            res["error"] = "Could not start the script: %s: %s" % (type(e).__name__, str(e)[:160])
            return res
        out = read_log(log)
        if spec.get("admin") and read_from != log:
            out = (read_log(read_from) + ("\n" + out if out else "")).strip()
        res.update({"code": code, "out": out, "secs": time.time() - t0, "timed_out": timed, "cancelled": canc})
        res["checks"], res["verified"] = self.check(spec.get("expect_files"), spec.get("expect_output"), out)
        res["ok"] = code == 0 and not timed and not canc and res["verified"] is not False
        return res


def _size(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return "%d %s" % (n, u) if u == "B" else "%.1f %s" % (n, u)
        n /= 1024.0


def format_result(res, spec):
    name = spec.get("name") or "script"
    if res.get("error"):
        return "SCRIPT NOT RUN (%s): %s" % (name, res["error"])
    if res["cancelled"]:
        head = "CANCELLED"
    elif res["timed_out"]:
        head = "FAILED: timed out after %ds and was stopped" % int(spec.get("timeout", 60))
    elif res["code"] != 0:
        head = "FAILED (exit code %s)" % res["code"]
    elif res["verified"] is False:
        head = "FAILED: the script exited cleanly but the expected result is NOT there"
    elif res["verified"]:
        head = "SUCCESS, VERIFIED"
    else:
        head = "RAN WITHOUT ERRORS, but NOT VERIFIED (no expect_files/expect_output were given). Do not claim it worked; verify it."
    s = "SCRIPT %s [%s] -> %s. %.1fs. Saved at %s" % (name, spec["lang"], head, res["secs"], res["path"])
    if res["checks"]:
        s += "\nChecks:\n" + "\n".join(res["checks"])
    s += "\nOutput:\n" + (res["out"] or "(no output)")
    return s


# ---------------------------------------------------------------------------------------------
# Background jobs
# ---------------------------------------------------------------------------------------------
class Job:
    def __init__(self, jid, kind, label, log):
        self.id, self.kind, self.label, self.log = jid, kind, label, Path(log)
        self.status, self.started, self.ended = "running", time.time(), None
        self.progress, self.summary, self.proc, self.cancel_flag = "", "", None, False
        self.announce = True


class Jobs:
    def __init__(self, folder, limit_fn=lambda: 3, on_change=None, on_finish=None):
        self.dir = Path(folder)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.limit_fn, self.on_change, self.on_finish = limit_fn, on_change, on_finish
        self.jobs, self.n, self.lock = {}, 0, threading.Lock()
        self.stamp = time.strftime("%Y%m%d-%H%M%S")
        cutoff = time.time() - 14 * 86400
        for f in self.dir.glob("*.log*"):
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
            except OSError:
                pass

    def _changed(self):
        if self.on_change:
            try:
                self.on_change()
            except Exception:
                pass

    def create(self, kind, label):
        with self.lock:
            running = sum(1 for j in self.jobs.values() if j.status == "running")
            if running >= max(1, int(self.limit_fn())):
                raise RuntimeError("Too many background jobs are running (%d). Wait for one to finish or cancel one." % running)
            self.n += 1
            jid = "J%d" % self.n
            job = Job(jid, kind, label[:90], self.dir / ("%s-%s.log" % (self.stamp, jid)))
            self.jobs[jid] = job
        self._changed()
        return job

    def set_progress(self, job, text):
        job.progress = text[:100]
        self._changed()

    def finish(self, job, status, summary=""):
        if job.status != "running":
            return
        job.status, job.ended, job.summary = status, time.time(), summary
        self._changed()
        if self.on_finish:
            try:
                self.on_finish(job)
            except Exception:
                pass

    def get(self, jid):
        return self.jobs.get((jid or "").strip().upper())

    def cancel(self, jid):
        j = self.get(jid)
        if not j:
            return "No job called %s." % jid
        if j.status != "running":
            return "%s is already %s." % (j.id, j.status)
        j.cancel_flag = True
        if j.proc:
            kill_tree(j.proc)
        return "Cancelling %s (%s)." % (j.id, j.label)

    def listing(self, n=12):
        rows = sorted(self.jobs.values(), key=lambda j: -j.started)[:n]
        now = time.time()
        return [{"id": j.id, "kind": j.kind, "label": j.label, "status": j.status, "progress": j.progress,
                 "secs": int((j.ended or now) - j.started)} for j in rows]

    def describe(self, jid):
        j = self.get(jid)
        if not j:
            return "No job called %s." % jid
        s = "%s [%s] %s: %s. Running for %ds." % (j.id, j.kind, j.status.upper(), j.label, int((j.ended or time.time()) - j.started))
        if j.progress:
            s += " Now: " + j.progress
        if j.summary:
            s += "\nResult: " + j.summary
        tail = read_log(j.log, 1500)
        return s + ("\nLog tail:\n" + tail if tail else "")

    def text_listing(self):
        rows = self.listing()
        return "\n".join("%s %s (%s) %ds%s" % (r["id"], r["status"].upper(), r["label"], r["secs"],
                                               (" - " + r["progress"]) if r["progress"] else "") for r in rows) or "No jobs yet."


# ---------------------------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------------------------
def is_protected(p):
    try:
        p = Path(p).resolve()
    except Exception:
        return True
    s = str(p).lower().rstrip("\\/")
    if p == p.parent or p == Path.home().resolve():
        return True
    if IS_WIN:
        roots = [os.environ.get("SystemRoot", r"C:\Windows"), os.environ.get("ProgramFiles", r"C:\Program Files"),
                 os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), os.environ.get("ProgramData", r"C:\ProgramData")]
        return any(s == r.lower().rstrip("\\/") or s.startswith(r.lower().rstrip("\\/") + "\\") for r in roots if r)
    return s in ("/", "/etc", "/usr", "/bin", "/sbin", "/boot", "/var", "/home", "/lib", "/opt", "/system", "/library") or \
        s.startswith(("/etc/", "/usr/", "/bin/", "/sbin/", "/boot/", "/lib/", "/system/"))


def file_ops(action, src, dst, resolve, trash_dir, overwrite=False):
    a = (action or "").strip().lower()
    s = resolve(src) if src else None
    d = resolve(dst) if dst else None
    if a in ("exists", "info", "hash", "delete", "copy", "move", "zip", "unzip") and not s:
        return "A source path is needed."
    if a == "mkdir":
        if not s:
            return "A path is needed."
        s.mkdir(parents=True, exist_ok=True)
        return "Folder ready: %s" % s
    if a in ("exists", "info"):
        if not s.exists():
            return "Does not exist: %s" % s
        st = s.stat()
        kind = "folder" if s.is_dir() else "file"
        extra = ""
        if s.is_dir():
            try:
                extra = ", %d items" % len(list(s.iterdir()))
            except OSError:
                pass
        return "%s %s%s, %s, modified %s" % (kind, s, extra, _size(st.st_size) if s.is_file() else "", time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)))
    if a == "hash":
        if not s.is_file():
            return "Not a file: %s" % s
        h = hashlib.sha256()
        with open(s, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return "SHA-256 of %s: %s" % (s.name, h.hexdigest())
    if not s.exists():
        return "Does not exist: %s" % s
    if a == "delete":
        if is_protected(s):
            return "Refused: %s is a protected system location." % s
        trash = Path(trash_dir)
        trash.mkdir(parents=True, exist_ok=True)
        dest = trash / ("%s-%s" % (time.strftime("%Y%m%d-%H%M%S"), s.name))
        shutil.move(str(s), str(dest))
        return "Moved %s to the WINNERS Bot trash (recoverable at %s)." % (s, dest)
    if a in ("copy", "move"):
        if not d:
            return "A destination is needed."
        if a == "move" and is_protected(s):
            return "Refused: %s is a protected system location." % s
        if d.is_dir() and not (s.is_dir() and d == s):
            d = d / s.name
        if d.exists():
            if not overwrite:
                return "The destination already exists: %s. Ask the user, then repeat with overwrite true." % d
            if is_protected(d):
                return "Refused: %s is a protected system location." % d
            if d.is_dir():
                shutil.rmtree(d)
            else:
                d.unlink()
        d.parent.mkdir(parents=True, exist_ok=True)
        if a == "copy":
            shutil.copytree(s, d) if s.is_dir() else shutil.copy2(s, d)
        else:
            shutil.move(str(s), str(d))
        return "%s %s -> %s" % ("Copied" if a == "copy" else "Moved", s, d)
    if a == "zip":
        out = d or s.with_suffix(".zip") if s.is_file() else (d or Path(str(s) + ".zip"))
        out = Path(out)
        if out.suffix.lower() != ".zip":
            out = out.with_suffix(".zip")
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            if s.is_dir():
                for f in s.rglob("*"):
                    if f.is_file():
                        z.write(f, f.relative_to(s.parent))
            else:
                z.write(s, s.name)
        return "Created %s (%s)." % (out, _size(out.stat().st_size))
    if a == "unzip":
        out = d or s.with_suffix("")
        out.mkdir(parents=True, exist_ok=True)
        base = out.resolve()
        with zipfile.ZipFile(s) as z:
            for m in z.namelist():
                if not (base / m).resolve().is_relative_to(base):
                    return "Refused: the archive contains an unsafe path (%s)." % m
            z.extractall(out)
            n = len(z.namelist())
        return "Extracted %d items into %s." % (n, out)
    return "Unknown file action '%s'. Use: exists, info, mkdir, copy, move, delete, zip, unzip, hash." % action


def fileop_needs_approval(action, overwrite=False):
    a = (action or "").lower()
    return a in ("delete", "move") or (a in ("copy", "unzip") and overwrite)


def download_file(url, dest, resolve, max_mb=500):
    if not url.lower().startswith(("http://", "https://")):
        return "Invalid URL."
    d = resolve(dest)
    if d.is_dir():
        name = urllib.parse.unquote(urllib.parse.urlparse(url).path.rsplit("/", 1)[-1]) or "download"
        d = d / name
    d.parent.mkdir(parents=True, exist_ok=True)
    tmp = d.with_suffix(d.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 WINNERS Bot"})
    h, total = hashlib.sha256(), 0
    with urllib.request.urlopen(req, timeout=30) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            total += len(chunk)
            if total > max_mb * 1048576:
                f.close(); tmp.unlink(missing_ok=True)
                return "Stopped: the file is larger than %d MB." % max_mb
            h.update(chunk)
            f.write(chunk)
    if total == 0:
        tmp.unlink(missing_ok=True)
        return "The download was empty."
    tmp.replace(d)
    return "Downloaded %s (%s), SHA-256 %s." % (d, _size(total), h.hexdigest()[:16])


# ---------------------------------------------------------------------------------------------
# Processes
# ---------------------------------------------------------------------------------------------
PROTECTED_PROCS = {"system", "system idle process", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe",
                   "smss.exe", "registry", "memory compression", "init", "systemd", "launchd", "kernel_task"}


def process_list(name="", top=15):
    import psutil
    rows = []
    for p in psutil.process_iter(["pid", "name", "memory_percent", "cpu_percent"]):
        try:
            nm = p.info["name"] or ""
            if name and name.lower() not in nm.lower():
                continue
            rows.append((p.info["memory_percent"] or 0, p.info["pid"], nm, p.info["cpu_percent"] or 0))
        except Exception:
            pass
    rows.sort(reverse=True)
    return "\n".join("%s (pid %d)  mem %.1f%%" % (n, pid, m) for m, pid, n, _ in rows[:top]) or "No matching processes."


def process_matches(target):
    import psutil
    t = str(target).strip()
    out = []
    for p in psutil.process_iter(["pid", "name"]):
        try:
            nm = (p.info["name"] or "")
            if (t.isdigit() and p.info["pid"] == int(t)) or (not t.isdigit() and t.lower() in nm.lower()):
                out.append(p)
        except Exception:
            pass
    return out


def process_kill(target):
    ms = [p for p in process_matches(target) if (p.info["name"] or "").lower() not in PROTECTED_PROCS and p.pid != os.getpid()]
    if not ms:
        return "No killable process matches '%s'." % target
    done = []
    for p in ms[:25]:
        try:
            p.kill()
            done.append("%s (%d)" % (p.info["name"], p.pid))
        except Exception as e:
            done.append("%s: %s" % (p.info["name"], type(e).__name__))
    return "Ended: " + ", ".join(done)


# ---------------------------------------------------------------------------------------------
# Authenticated API calls (credentials are only ever sent to the matching service's own hosts)
# ---------------------------------------------------------------------------------------------
API_HOSTS = {"discord": ("discord.com", "discordapp.com"), "roblox": ("apis.roblox.com", "roblox.com")}
API_BASE = {"discord": "https://discord.com/api/v10", "roblox": "https://apis.roblox.com"}


def api_call(service, method, url, body, headers_json, cfg, timeout=20):
    svc = (service or "custom").strip().lower()
    method = (method or "GET").strip().upper()
    if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        return "Unsupported method."
    url = (url or "").strip()
    if svc == "discord" and url.lower() in ("webhook", "") and cfg.get("discord_webhook"):
        url = cfg["discord_webhook"]
    if svc in API_BASE and not url.lower().startswith("http"):
        url = API_BASE[svc] + "/" + url.lstrip("/")
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if not url.lower().startswith("https://"):
        return "Only https:// URLs are allowed."
    headers = {"User-Agent": "DiscordBot (https://localhost, 1.0) WINNERS Bot" if svc == "discord" else "Mozilla/5.0 WINNERS Bot",
               "Accept": "application/json"}
    if svc in API_HOSTS:
        if not any(host == h or host.endswith("." + h) for h in API_HOSTS[svc]):
            return "Refused: %s credentials may only be sent to %s." % (svc, " or ".join(API_HOSTS[svc]))
        is_webhook = svc == "discord" and "/webhooks/" in url
        if svc == "discord" and not is_webhook:
            tok = (cfg.get("discord_token") or "").strip()
            if not tok:
                return "No Discord bot token is set. Add one in Configuration > Integrations."
            headers["Authorization"] = tok if tok.lower().startswith("bot ") else "Bot " + tok
        if svc == "roblox":
            if not (cfg.get("roblox_key") or "").strip():
                return "No Roblox Open Cloud API key is set. Add one in Configuration > Integrations."
            headers["x-api-key"] = cfg["roblox_key"].strip()
    try:
        if headers_json:
            extra = json.loads(headers_json) if isinstance(headers_json, str) else dict(headers_json)
            if svc in API_HOSTS:  # never let the caller override the credential headers
                extra = {k: v for k, v in extra.items() if k.lower() not in ("authorization", "x-api-key")}
            headers.update({str(k): str(v) for k, v in extra.items()})
    except Exception:
        return "headers_json is not valid JSON."
    data = None
    if body not in (None, "") and method != "GET":
        data = body.encode("utf-8") if isinstance(body, str) else json.dumps(body).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            code, raw = r.status, r.read(400000)
    except urllib.error.HTTPError as e:
        code, raw = e.code, e.read(40000)
    except Exception as e:
        return "Request failed: %s: %s" % (type(e).__name__, str(e)[:160])
    txt = raw.decode("utf-8", "replace")
    try:
        txt = json.dumps(json.loads(txt), indent=1)
    except Exception:
        pass
    if len(txt) > 3500:
        txt = txt[:3500] + "\n...[truncated]"
    note = " (rate limited: wait and retry)" if code == 429 else ""
    return "HTTP %d%s\n%s" % (code, note, txt or "(empty body)")


# ---------------------------------------------------------------------------------------------
# pip
# ---------------------------------------------------------------------------------------------
_PKG_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]*(\[[A-Za-z0-9_,\-]+\])?([<>=!~]=?[A-Za-z0-9_.*\-]+)?$")


def pip_install(pkgs, logdir, timeout=300):
    names = [p for p in re.split(r"[\s,]+", pkgs or "") if p]
    if not names or len(names) > 8 or not all(_PKG_OK.match(p) for p in names):
        return "Invalid package name(s). Give plain PyPI names such as requests or discord.py."
    log = Path(logdir) / ("pip-%s.log" % time.strftime("%Y%m%d-%H%M%S"))
    code, timed, _ = run_proc([py_exe(), "-m", "pip", "install", "--disable-pip-version-check"] + names, log, timeout=timeout, env=script_env())
    out = read_log(log, 1500)
    return ("Installed: %s" % " ".join(names) if code == 0 else "pip %s (exit %s)" % ("timed out" if timed else "failed", code)) + "\n" + out


# ---------------------------------------------------------------------------------------------
# Roblox Studio helpers
# ---------------------------------------------------------------------------------------------
def luau_plugin(code, title):
    """Wrap Luau so Studio shows a toolbar button that runs it as one undoable step."""
    safe = re.sub(r"[^\w ]+", "", title)[:40] or "script"
    return ('-- Generated by WINNERS Bot. Click the button on the WINNERS Bot toolbar to run it.\n'
            'local CHS = game:GetService("ChangeHistoryService")\n'
            'local toolbar = plugin:CreateToolbar("WINNERS Bot")\n'
            'local button = toolbar:CreateButton("jarvis_%s", "Run: %s", "")\n'
            'button.ClickableWhenViewportHidden = true\n'
            'button.Click:Connect(function()\n'
            '  local rec = CHS:TryBeginRecording("WINNERS Bot: %s")\n'
            '  local ok, err = pcall(function()\n%s\n  end)\n'
            '  if rec then CHS:FinishRecording(rec, ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel) end\n'
            '  if ok then print("[WINNERS Bot] finished: %s") else warn("[WINNERS Bot] failed: " .. tostring(err)) end\n'
            'end)\n') % (re.sub(r"\W+", "_", safe), safe, safe, code, safe)
