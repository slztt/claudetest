"""JARVIS-3 MCP client: plug any Model Context Protocol server into JARVIS (Roblox Studio, Blender, Playwright, GitHub,
file systems, databases...). Every tool those servers offer becomes a tool JARVIS can call, with any model provider.

Config lives in ~/.jarvis/mcp.json in the same shape Claude Desktop and Cursor use:
  {"mcpServers": {"blender": {"command": "uvx", "args": ["blender-mcp"]},
                  "github":  {"url": "https://api.githubcopilot.com/mcp/", "headers": {"Authorization": "Bearer ..."}}}}
Transports: stdio (newline-delimited JSON-RPC) and Streamable HTTP. Servers start in the background and reconnect
when they crash; slow servers never block JARVIS's voice.
"""
import json, os, platform, queue, re, shutil, subprocess, sys, threading, time, urllib.error, urllib.request
from pathlib import Path

IS_WIN = platform.system() == "Windows"
PROTOCOL = "2025-06-18"
S_ = "STRING"

PRESETS = {
    "roblox_studio": {"label": "Roblox Studio (official Roblox MCP)", "command": "rbx-studio-mcp", "args": ["--stdio"],
                      "note": "Install the Roblox Studio MCP server from github.com/Roblox/studio-rust-mcp-server (its installer adds the Studio plugin). "
                              "If Claude Desktop was set up by that installer, use Import from Claude Desktop instead. Keep Studio open with the MCP plugin on."},
    "blender": {"label": "Blender (blender-mcp)", "command": "uvx", "args": ["blender-mcp"],
                "note": "In Blender: install the blender-mcp add-on (uvx blender-mcp install-addon, or addon.py from github.com/ahujasid/blender-mcp), "
                        "then press N in the 3D view > BlenderMCP > Start MCP Server (port 9876)."},
    "playwright": {"label": "Playwright browser (Microsoft)", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "note": "Needs Node.js."},
    "filesystem": {"label": "File system (your home folder)", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", str(Path.home())], "note": "Needs Node.js."},
    "fetch": {"label": "Fetch web pages as markdown", "command": "uvx", "args": ["mcp-server-fetch"], "note": ""},
    "thinking": {"label": "Sequential thinking (step-by-step planning)", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
                 "note": "Helps smaller local models plan multi-step jobs. Needs Node.js."},
    "memory": {"label": "Knowledge-graph memory", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"], "note": "Needs Node.js."},
    "github": {"label": "GitHub (remote, needs a token)", "url": "https://api.githubcopilot.com/mcp/", "headers": {"Authorization": "Bearer YOUR_GITHUB_TOKEN"},
               "note": "Replace YOUR_GITHUB_TOKEN with a GitHub personal access token."},
}

MCP_TOOL = {"name": "mcp", "description": (
    "Manage MCP servers, which give you extra tools for other programs (Roblox Studio, Blender, browsers, GitHub, files...). status lists servers, "
    "whether they are connected and their tools. presets lists ready-made servers; add_preset adds one by name (roblox_studio, blender, playwright, "
    "filesystem, fetch, thinking, memory, github). add adds a custom server (name plus command and args, or url). remove deletes one, restart reconnects "
    "one. import_claude copies the servers configured in Claude Desktop. Once connected, their tools appear as servername__toolname and you can call them directly."),
    "parameters": {"type": "OBJECT", "properties": {
        "action": {"type": S_, "description": "status, presets, add_preset, add, remove, restart or import_claude"},
        "name": {"type": S_, "description": "Server name (add, add_preset, remove, restart)"},
        "command": {"type": S_, "description": "add: the program to run, e.g. npx, uvx, a path to an .exe"},
        "args": {"type": S_, "description": "add: arguments separated by spaces"},
        "url": {"type": S_, "description": "add: the server URL for a remote (HTTP) server"}}, "required": ["action"]}}


def _clean(name):
    return re.sub(r"[^A-Za-z0-9_-]", "_", name)[:30]


def gemini_schema(s, depth=0):
    """JSON Schema -> the OpenAPI subset Gemini function declarations accept."""
    if not isinstance(s, dict) or depth > 6:
        return {"type": "STRING"}
    t = s.get("type")
    if isinstance(t, list):
        t = next((x for x in t if x != "null"), "string")
    if not t:
        t = "object" if "properties" in s else "array" if "items" in s else "string"
        for k in ("anyOf", "oneOf"):
            if s.get(k):
                return gemini_schema(next((x for x in s[k] if x.get("type") != "null"), s[k][0]), depth + 1)
    out = {"type": str(t).upper()}
    if s.get("description"):
        out["description"] = str(s["description"])[:900]
    if s.get("enum") and out["type"] == "STRING":
        out["enum"] = [str(x) for x in s["enum"]][:50]
    if out["type"] == "OBJECT":
        props = {k: gemini_schema(v, depth + 1) for k, v in (s.get("properties") or {}).items()}
        if props:
            out["properties"] = props
            req = [r for r in s.get("required") or [] if r in props]
            if req:
                out["required"] = req
    if out["type"] == "ARRAY":
        out["items"] = gemini_schema(s.get("items") or {"type": "string"}, depth + 1)
    if out["type"] not in ("STRING", "NUMBER", "INTEGER", "BOOLEAN", "OBJECT", "ARRAY"):
        out["type"] = "STRING"
    return out


class Server:
    def __init__(self, hub, name, spec):
        self.hub, self.name, self.spec = hub, name, spec
        self.tools, self.status, self.error = [], "starting", ""
        self.proc, self.pending, self.nid, self.lock = None, {}, 0, threading.Lock()
        self.session, self.stopped = None, False
        threading.Thread(target=self._run, daemon=True).start()

    # ---- lifecycle ----
    def _run(self):
        delay = 2
        while not self.stopped:
            try:
                self._connect()
                self.status, self.error, delay = "connected", "", 2
                self.hub.changed()
                if self.proc:
                    self.proc.wait()
                    if self.stopped:
                        break
                    raise RuntimeError("the server process exited (code %s)" % self.proc.returncode)
                return  # HTTP servers have no process to watch
            except Exception as e:
                self.status, self.error, self.tools = "error", str(e)[:300], []
                self.hub.changed()
                for q in list(self.pending.values()):
                    q.put({"error": {"message": "server disconnected"}})
            time.sleep(delay)
            delay = min(delay * 2, 120)

    def stop(self):
        self.stopped = True
        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass

    def _connect(self):
        sp = self.spec
        if sp.get("url"):
            self.proc = None
        else:
            cmd = sp.get("command") or ""
            exe = self.hub.resolve(cmd)
            if not exe:
                raise RuntimeError("'%s' was not found on this PC. %s" % (cmd, PRESETS.get(self.name, {}).get("note", "Install it, or give the full path.")))
            args = [str(a) for a in sp.get("args") or []]
            argv = (["cmd", "/c", exe] if IS_WIN and exe.lower().endswith((".cmd", ".bat")) else [exe]) + args
            env = {**os.environ, **{k: str(v) for k, v in (sp.get("env") or {}).items()}}
            self.proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=str(Path.home()),
                                         creationflags=0x08000000 if IS_WIN else 0, bufsize=0)
            threading.Thread(target=self._reader, daemon=True).start()
            threading.Thread(target=self._stderr, daemon=True).start()
        init = self.request("initialize", {"protocolVersion": PROTOCOL, "capabilities": {"roots": {"listChanged": False}},
                                           "clientInfo": {"name": "JARVIS", "version": "3.0"}}, timeout=60)
        self.server_info = (init or {}).get("serverInfo", {})
        self.notify("notifications/initialized")
        self.refresh_tools()

    def refresh_tools(self):
        tools, cursor = [], None
        while True:
            r = self.request("tools/list", {"cursor": cursor} if cursor else {}, timeout=60)
            tools += r.get("tools") or []
            cursor = r.get("nextCursor")
            if not cursor:
                break
        self.tools = tools

    # ---- stdio transport ----
    def _reader(self):
        for line in iter(self.proc.stdout.readline, b""):
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line.decode("utf-8", "replace"))
            except Exception:
                continue  # servers sometimes print logs to stdout
            self._dispatch(msg)
        for q in list(self.pending.values()):   # the process ended: fail fast instead of waiting for timeouts
            q.put({"error": {"message": "the server stopped: " + getattr(self, "last_log", "").strip()[-200:]}})

    def _stderr(self):
        for line in iter(self.proc.stderr.readline, b""):
            self.last_log = line.decode("utf-8", "replace")[-300:]

    def _dispatch(self, msg):
        if "id" in msg and ("result" in msg or "error" in msg):
            q = self.pending.pop(msg["id"], None)
            if q:
                q.put(msg)
        elif "id" in msg and "method" in msg:   # a request from the server
            m = msg["method"]
            result = {} if m == "ping" else {"roots": [{"uri": Path.home().as_uri(), "name": "home"}]} if m == "roots/list" else None
            reply = {"jsonrpc": "2.0", "id": msg["id"]}
            if result is None:
                reply["error"] = {"code": -32601, "message": "JARVIS does not support %s" % m}
            else:
                reply["result"] = result
            self._send(reply)
        elif msg.get("method") == "notifications/tools/list_changed":
            threading.Thread(target=lambda: (self.refresh_tools(), self.hub.changed()), daemon=True).start()

    def _send(self, msg):
        if self.spec.get("url"):
            return self._http(msg)
        data = (json.dumps(msg) + "\n").encode("utf-8")
        with self.lock:
            self.proc.stdin.write(data)
            self.proc.stdin.flush()

    # ---- streamable HTTP transport ----
    def _http(self, msg):
        h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL,
             **{k: str(v) for k, v in (self.spec.get("headers") or {}).items()}}
        if self.session:
            h["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(self.spec["url"], data=json.dumps(msg).encode("utf-8"), headers=h, method="POST")
        try:
            r = urllib.request.urlopen(req, timeout=300)
        except urllib.error.HTTPError as e:
            raise RuntimeError("HTTP %d: %s" % (e.code, e.read(300).decode("utf-8", "replace")))
        with r:
            sid = r.headers.get("Mcp-Session-Id")
            if sid:
                self.session = sid
            ctype = r.headers.get("Content-Type", "")
            if "text/event-stream" in ctype:
                data = []
                for raw in r:
                    line = raw.decode("utf-8", "replace").rstrip("\r\n")
                    if line.startswith("data:"):
                        data.append(line[5:].strip())
                    elif not line and data:
                        try:
                            self._dispatch(json.loads("\n".join(data)))
                        except Exception:
                            pass
                        data = []
                        if "id" in msg and msg["id"] not in self.pending:
                            break
            else:
                body = r.read().decode("utf-8", "replace").strip()
                if body:
                    j = json.loads(body)
                    for m in j if isinstance(j, list) else [j]:
                        self._dispatch(m)

    # ---- JSON-RPC ----
    def request(self, method, params, timeout=120):
        self.nid += 1
        rid, q = self.nid, queue.Queue()
        self.pending[rid] = q
        self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        try:
            msg = q.get(timeout=timeout)
        except queue.Empty:
            self.pending.pop(rid, None)
            raise RuntimeError("%s timed out after %ss" % (method, timeout))
        if "error" in msg:
            raise RuntimeError(str(msg["error"].get("message", msg["error"]))[:300])
        return msg.get("result") or {}

    def notify(self, method, params=None):
        self._send({"jsonrpc": "2.0", "method": method, **({"params": params} if params else {})})

    def call(self, tool, args, timeout=300):
        if self.status != "connected":
            raise RuntimeError("MCP server '%s' is not connected (%s)." % (self.name, self.error or self.status))
        r = self.request("tools/call", {"name": tool, "arguments": args or {}}, timeout=timeout)
        parts, images = [], []
        for c in r.get("content") or []:
            t = c.get("type")
            if t == "text":
                parts.append(c.get("text", ""))
            elif t == "image":
                images.append(c.get("data", ""))
                parts.append("[image returned]")
            elif t == "resource":
                res = c.get("resource") or {}
                parts.append(res.get("text") or "[resource %s]" % res.get("uri", ""))
            else:
                parts.append(json.dumps(c)[:500])
        if r.get("structuredContent") and not parts:
            parts.append(json.dumps(r["structuredContent"])[:6000])
        text = "\n".join(parts).strip() or "(no output)"
        return ("ERROR from %s: " % self.name if r.get("isError") else "") + text, images


class Hub:
    def __init__(self, core, data_dir):
        self.core, self.file = core, Path(data_dir) / "mcp.json"
        self.servers, self.map, self._lock = {}, {}, threading.RLock()
        self._debounce = None
        self.load()

    # ---- config ----
    def config(self):
        try:
            return json.loads(self.file.read_text(encoding="utf-8"))
        except Exception:
            return {"mcpServers": {}}

    def save_config(self, cfg):
        if not isinstance(cfg, dict) or not isinstance(cfg.get("mcpServers"), dict):
            raise ValueError("The config must look like {\"mcpServers\": {\"name\": {\"command\": ..., \"args\": [...]}}}")
        self.file.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        self.load()

    def load(self):
        with self._lock:
            want = {n: s for n, s in self.config().get("mcpServers", {}).items() if isinstance(s, dict) and not s.get("disabled")}
            for n in list(self.servers):
                if n not in want or json.dumps(want[n], sort_keys=True) != json.dumps(self.servers[n].spec, sort_keys=True):
                    self.servers.pop(n).stop()
            for n, spec in want.items():
                if n not in self.servers:
                    self.servers[n] = Server(self, n, spec)
        self.changed()

    def resolve(self, cmd):
        if not cmd:
            return ""
        if os.path.isabs(cmd) and os.path.exists(cmd):
            return cmd
        here = Path(sys.executable).parent
        for c in (cmd, cmd + ".exe", cmd + ".cmd"):
            for d in (here, here / "Scripts"):
                if (d / c).exists():
                    return str(d / c)
        found = shutil.which(cmd)
        if found:
            return found
        if cmd in ("uv", "uvx"):  # bring uv into JARVIS's own environment
            try:
                import jv_auto
                jv_auto.ensure("uv", "uv", self.core)
                for d in (here, here / "Scripts"):
                    for c in (cmd, cmd + ".exe"):
                        if (d / c).exists():
                            return str(d / c)
            except Exception:
                pass
        if cmd.startswith("rbx-studio-mcp") and IS_WIN:
            for base in (os.environ.get("LOCALAPPDATA", ""), os.environ.get("PROGRAMFILES", "")):
                for p in Path(base).glob("**/rbx-studio-mcp*.exe") if base else []:
                    return str(p)
        return ""

    # ---- tools for the model ----
    def changed(self):
        with self._lock:
            self.map = {}
            for s in self.servers.values():
                for t in s.tools:
                    self.map["%s__%s" % (_clean(s.name), _clean(t.get("name", "")))[:64]] = (s, t)
        try:
            self.core.ui({"t": "mcp", "servers": self.status_rows()})
        except Exception:
            pass
        # Gemini Live fixes its tool list at connect time, so reconnect it (debounced) when tools change
        if self._debounce:
            self._debounce.cancel()
        self._debounce = threading.Timer(3.0, self._refresh_brain)
        self._debounce.daemon = True
        self._debounce.start()

    def _refresh_brain(self):
        try:
            b = self.core.brain
            if type(b).__name__ == "Brain" and b.connected and not b.turn_open:
                b.reconnect()
        except Exception:
            pass

    def decls(self, live=False):
        out = []
        for full, (s, t) in list(self.map.items()):
            schema = t.get("inputSchema") or {"type": "object", "properties": {}}
            out.append({"name": full, "description": ("[%s MCP] " % s.name + (t.get("description") or t.get("name", "")))[:1000],
                        "parameters": gemini_schema(schema) if live else schema})
        return out

    def handle(self, name, a):
        if name == "mcp":
            return self.tool(a or {})
        hit = self.map.get(name)
        if not hit:
            return None
        s, t = hit
        try:
            text, images = s.call(t["name"], a or {})
        except Exception as e:
            return "MCP tool %s failed: %s" % (name, e)
        for img in images[:2]:
            try:
                import base64
                self.core.brain.send_image(base64.b64decode(img))
            except Exception:
                pass
        return text[:12000]

    # ---- management ----
    def status_rows(self):
        return [{"name": n, "status": s.status, "error": s.error, "tools": len(s.tools), "url": s.spec.get("url", ""),
                 "command": " ".join([s.spec.get("command", "")] + [str(x) for x in s.spec.get("args") or []]).strip()} for n, s in self.servers.items()]

    def add(self, name, spec):
        cfg = self.config()
        cfg.setdefault("mcpServers", {})[_clean(name)] = spec
        self.save_config(cfg)

    def import_claude(self):
        cands = []
        if IS_WIN:
            cands.append(Path(os.environ.get("APPDATA", "")) / "Claude" / "claude_desktop_config.json")
        elif platform.system() == "Darwin":
            cands.append(Path.home() / "Library/Application Support/Claude/claude_desktop_config.json")
        else:
            cands.append(Path.home() / ".config/Claude/claude_desktop_config.json")
        cands += [Path.home() / ".cursor" / "mcp.json"]
        cfg, n = self.config(), 0
        for c in cands:
            try:
                other = json.loads(c.read_text(encoding="utf-8")).get("mcpServers") or {}
            except Exception:
                continue
            for k, v in other.items():
                if k not in cfg["mcpServers"]:
                    cfg["mcpServers"][k] = v
                    n += 1
        if n:
            self.save_config(cfg)
        return n

    def tool(self, a):
        act = str(a.get("action") or "status").lower()
        if act == "status":
            rows = self.status_rows()
            if not rows:
                return "No MCP servers yet. presets lists ready-made ones (roblox_studio, blender, playwright...)."
            out = []
            for r in rows:
                s = self.servers[r["name"]]
                out.append("%s: %s%s, %d tools%s" % (r["name"], r["status"], " (%s)" % r["error"] if r["error"] else "", r["tools"],
                                                     (": " + ", ".join(t["name"] for t in s.tools[:25])) if s.tools else ""))
            return "\n".join(out)
        if act == "presets":
            return "\n".join("%s: %s. %s" % (k, v["label"], v["note"]) for k, v in PRESETS.items())
        if act == "add_preset":
            k = str(a.get("name") or "").strip().lower()
            if k not in PRESETS:
                return "Unknown preset. Choose from: " + ", ".join(PRESETS)
            self.add(k, {x: v for x, v in PRESETS[k].items() if x in ("command", "args", "url", "headers", "env")})
            return "Added %s. It is connecting now; check with status in a few seconds. %s" % (k, PRESETS[k]["note"])
        if act == "add":
            name = str(a.get("name") or "").strip()
            if not name:
                return "Give the server a name."
            if a.get("url"):
                spec = {"url": str(a["url"]).strip()}
            elif a.get("command"):
                spec = {"command": str(a["command"]).strip(), "args": str(a.get("args") or "").split()}
            else:
                return "Give a command (with args) or a url."
            self.add(name, spec)
            return "Added %s; connecting." % name
        if act in ("remove", "restart"):
            name = str(a.get("name") or "")
            cfg = self.config()
            if name not in cfg.get("mcpServers", {}):
                return "No server called %s." % name
            if act == "remove":
                del cfg["mcpServers"][name]
                self.save_config(cfg)
                return "Removed %s." % name
            with self._lock:
                s = self.servers.pop(name, None)
                if s:
                    s.stop()
            self.load()
            return "Restarting %s." % name
        if act == "import_claude":
            n = self.import_claude()
            return "Imported %d servers from Claude Desktop / Cursor." % n if n else "Nothing new to import (no Claude Desktop or Cursor MCP config found)."
        return "Use status, presets, add_preset, add, remove, restart or import_claude."
