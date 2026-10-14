"""WINNERS Bot Roblox Studio bridge: full control of Studio with no manual plugin setup.

WINNERS Bot writes a small plugin (WinnersBridge.rbxmx) into Studio's local Plugins folder. Studio loads it on start; it polls a
local server here (127.0.0.1:47123) for Luau to run, runs it inside Studio with undo support, and sends back the output
(prints, warnings, errors and the returned value). The roblox_studio tool queues code and waits for the result.
"""
import glob, json, os, platform, queue, subprocess, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 47124
IS_WIN = platform.system() == "Windows"

PLUGIN = r'''-- WINNERS Bot bridge: lets WINNERS Bot build and edit in Roblox Studio. Installed automatically by WINNERS Bot; safe to delete.
local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local RunService = game:GetService("RunService")
if RunService:IsRunning() and not RunService:IsEdit() then return end  -- only the edit session, not play-test copies
local BASE = "http://127.0.0.1:__PORT__/rbx/"
local alive = true
plugin.Unloading:Connect(function() alive = false end)

local function fmt(...)
	local t = table.pack(...)
	for i = 1, t.n do t[i] = tostring(t[i]) end
	return table.concat(t, " ", 1, t.n)
end

local function run(code)
	local out = {}
	local fn, err = loadstring(code)
	if not fn then return false, "Syntax error: " .. tostring(err), out end
	local env = setmetatable({
		print = function(...) table.insert(out, fmt(...)) print("[WINNERS Bot]", ...) end,
		warn = function(...) table.insert(out, "WARN: " .. fmt(...)) warn("[WINNERS Bot]", ...) end,
		plugin = plugin,
	}, { __index = getfenv(0) })
	setfenv(fn, env)
	local rec
	pcall(function() rec = ChangeHistoryService:TryBeginRecording("WINNERS Bot") end)
	local ok, res = pcall(fn)
	pcall(function()
		if rec then
			ChangeHistoryService:FinishRecording(rec, ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel)
		else
			ChangeHistoryService:SetWaypoint("WINNERS Bot")
		end
	end)
	if not ok then return false, tostring(res), out end
	return true, res ~= nil and tostring(res) or "", out
end

task.spawn(function()
	local warned = false
	while alive do
		local ok, body = pcall(function()
			return HttpService:GetAsync(BASE .. "poll?place=" .. HttpService:UrlEncode(game.Name), true)
		end)
		if ok then
			warned = false
			local job = body ~= "" and HttpService:JSONDecode(body) or nil
			if job and job.id then
				local good, result, out = run(job.code)
				pcall(function()
					HttpService:PostAsync(BASE .. "result", HttpService:JSONEncode({
						id = job.id, ok = good, result = result, output = out,
					}))
				end)
			end
		else
			if not warned then warned = true end
			task.wait(3)  -- WINNERS Bot is not running; try again quietly
		end
	end
end)
'''.replace("__PORT__", str(PORT))

# a Studio model file holding the plugin Script (Studio loads .rbxmx files from its Plugins folder at start)
PLUGIN_FILE = ('<roblox version="4"><Item class="Script" referent="RBX0"><Properties><string name="Name">WinnersBridge</string>'
               '<ProtectedString name="Source"><![CDATA[' + PLUGIN + ']]></ProtectedString></Properties></Item></roblox>')

ROBLOX_TOOLS = [{
    "name": "roblox_studio",
    "description": "Full control of Roblox Studio, no plugin setup needed from the user. run executes Luau inside the open Studio place "
                   "(plugin security: Instance.new, workspace, ServerScriptService, Selection, InsertService, create Scripts and set their "
                   ".Source, terrain, lighting...) and returns its print output, warnings, errors and return value; every run is one undo step. "
                   "Build things with run, e.g. local p = Instance.new('Part'); p.Size = Vector3.new(4,1,4); p.Anchored = true; p.Parent = workspace. "
                   "Work in small steps, print what you created, and fix errors yourself. status says whether Studio is connected; open starts "
                   "Roblox Studio; install (re)writes the bridge plugin (Studio must be restarted once afterwards).",
    "parameters": {"type": "OBJECT", "properties": {
        "action": {"type": "STRING", "description": "run, status, open or install"},
        "code": {"type": "STRING", "description": "run: the Luau code to execute in Studio"},
        "timeout": {"type": "NUMBER", "description": "run: seconds to wait for the result (default 30)"},
    }, "required": ["action"]},
}]
ROBLOX_NAMES = {t["name"] for t in ROBLOX_TOOLS}


def plugins_dir():
    if IS_WIN:
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "Roblox" / "Plugins"
    if platform.system() == "Darwin":
        return Path.home() / "Documents" / "Roblox" / "Plugins"
    return None


def studio_exe():
    if IS_WIN:
        hits = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\Roblox\Versions\*\RobloxStudioBeta.exe"))
        hits += glob.glob(os.path.expandvars(r"%ProgramFiles(x86)%\Roblox\Versions\*\RobloxStudioBeta.exe"))
        return max(hits, key=os.path.getmtime) if hits else ""
    return "/Applications/RobloxStudio.app" if os.path.exists("/Applications/RobloxStudio.app") else ""


class Bridge:
    def __init__(self, core):
        self.core = core
        self.jobs, self.results, self.cv = queue.Queue(), {}, threading.Condition()
        self.last_poll, self.place = 0.0, ""
        self.server = None
        threading.Thread(target=self._serve, daemon=True).start()
        threading.Thread(target=self.install, args=(True,), daemon=True).start()

    # ---- plugin ----
    def install(self, quiet=False):
        d = plugins_dir()
        if not d:
            return "Roblox Studio is not available on this system."
        if quiet and not (studio_exe() or d.parent.exists()):
            return ""
        try:
            d.mkdir(parents=True, exist_ok=True)
            f = d / "WinnersBridge.rbxmx"
            if not f.exists() or f.read_text(encoding="utf-8", errors="replace") != PLUGIN_FILE:
                f.write_text(PLUGIN_FILE, encoding="utf-8")
                return "Bridge plugin installed at %s. Restart Roblox Studio once so it loads." % f
            return "Bridge plugin is already installed at %s." % f
        except Exception as e:
            return "Could not install the bridge plugin: %s" % e

    # ---- local server the plugin talks to ----
    def _serve(self):
        bridge = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, body=b""):
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if not self.path.startswith("/rbx/poll"):
                    return self._send(404)
                bridge.last_poll = time.monotonic()
                try:
                    from urllib.parse import parse_qs, urlparse
                    bridge.place = (parse_qs(urlparse(self.path).query).get("place") or [""])[0]
                except Exception:
                    pass
                try:
                    job = bridge.jobs.get(timeout=20)      # long poll: answer at once when there is work
                except queue.Empty:
                    return self._send(200, b"")
                bridge.last_poll = time.monotonic()
                self._send(200, json.dumps(job).encode())

            def do_POST(self):
                if not self.path.startswith("/rbx/result"):
                    return self._send(404)
                n = int(self.headers.get("Content-Length") or 0)
                try:
                    data = json.loads(self.rfile.read(n).decode("utf-8", "replace"))
                except Exception:
                    return self._send(400)
                with bridge.cv:
                    bridge.results[data.get("id")] = data
                    bridge.cv.notify_all()
                self._send(200, b"{}")

        try:
            self.server = ThreadingHTTPServer(("127.0.0.1", PORT), H)
            self.server.daemon_threads = True
            self.server.serve_forever()
        except Exception:
            self.server = None

    @property
    def connected(self):
        return time.monotonic() - self.last_poll < 30

    def run(self, code, timeout=30):
        jid = uuid.uuid4().hex[:12]
        self.jobs.put({"id": jid, "code": code})
        end = time.monotonic() + timeout
        with self.cv:
            while jid not in self.results and time.monotonic() < end:
                self.cv.wait(0.5)
            res = self.results.pop(jid, None)
        if res is None:
            # take it back so it does not run later by surprise
            keep = []
            while not self.jobs.empty():
                j = self.jobs.get_nowait()
                if j["id"] != jid:
                    keep.append(j)
            for j in keep:
                self.jobs.put(j)
            return None
        return res

    # ---- tool ----
    def handle(self, name, a):
        if name not in ROBLOX_NAMES:
            return None
        act = str(a.get("action") or "status").lower()
        if act == "install":
            return self.install()
        if act == "open":
            exe = studio_exe()
            if not exe:
                return "Roblox Studio is not installed. It can be downloaded from create.roblox.com."
            if IS_WIN:
                os.startfile(exe)
            else:
                subprocess.Popen(["open", "-a", exe])
            self.install(True)
            return "Opening Roblox Studio. Once a place is open, the bridge connects within a few seconds (check with status)."
        if act == "status":
            if self.server is None:
                return "The bridge server could not start (port %d is in use, maybe by another WINNERS Bot)." % PORT
            if self.connected:
                return "Connected to Roblox Studio (place: %s)." % (self.place or "unknown")
            return ("Roblox Studio is not connected. %s Open Studio with a place (roblox_studio open). If Studio was already open "
                    "before the plugin was installed, it has to be restarted once. If Studio asks whether WinnersBridge may access "
                    "127.0.0.1, it must be allowed." % self.install(True))
        if act == "run":
            code = str(a.get("code") or "").strip()
            if not code:
                return "Give the Luau code to run."
            if not self.connected:
                return self.handle(name, {"action": "status"})
            res = self.run(code, max(5, min(300, float(a.get("timeout") or 30))))
            if res is None:
                return "Studio did not answer in time (it may be busy, in play mode, or showing a dialog). Try again or check status."
            out = "\n".join(res.get("output") or [])[-6000:]
            if not res.get("ok"):
                return "Error in Studio: %s%s" % (res.get("result"), ("\nOutput before the error:\n" + out) if out else "")
            return "Done in Studio.%s%s" % (("\nOutput:\n" + out) if out else "", ("\nReturned: " + str(res.get("result"))[:2000]) if res.get("result") else "")
        return "Use run, status, open or install."
