"""Any-model brain: lets JARVIS think with almost any chat model, not only Gemini Live.

Providers
  gemini-live   Google Gemini Live (the original: native voice in and out). Default.
  anthropic     Claude models through the Anthropic Messages API.
  openai, openrouter, groq, mistral, deepseek, xai, together, gemini
                hosted models through their OpenAI-compatible Chat Completions endpoints.
  ollama, lmstudio
                local models on this PC (no key, nothing leaves the machine).
  custom        any other OpenAI-compatible server (vLLM, llama.cpp server, LiteLLM, Azure proxy...).

Every provider gets the same tools, the same personality prompt and the same HUD. Voice works with all of them:
the wake word stays local, speech is transcribed (provider Whisper, Gemini, or faster-whisper on this PC) and
replies are spoken by the Fish Audio film voice, the provider's own TTS, or the operating system's voice.
Only the standard library is used for HTTP so no extra SDK is needed for any provider.
"""
import base64, io, json, os, platform, queue, re, shutil, subprocess, tempfile, threading, time, wave
import urllib.error, urllib.parse, urllib.request

import numpy as np

IS_WIN = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"

# name: (label, api style, default base url, needs key, model hint, whisper model for speech input or "")
PROVIDERS = {
    "gemini-live": ("Gemini Live · native voice", "live", "", True, "", ""),
    "anthropic": ("Anthropic · Claude", "anthropic", "https://api.anthropic.com/v1", True, "claude-sonnet-5-5", ""),
    "openai": ("OpenAI", "openai", "https://api.openai.com/v1", True, "gpt-4.1-mini", "whisper-1"),
    "gemini": ("Google Gemini · text models", "openai", "https://generativelanguage.googleapis.com/v1beta/openai", True, "gemini-2.5-flash", ""),
    "openrouter": ("OpenRouter · hundreds of models", "openai", "https://openrouter.ai/api/v1", True, "anthropic/claude-sonnet-5.5", ""),
    "groq": ("Groq", "openai", "https://api.groq.com/openai/v1", True, "llama-3.3-70b-versatile", "whisper-large-v3-turbo"),
    "mistral": ("Mistral", "openai", "https://api.mistral.ai/v1", True, "mistral-large-latest", ""),
    "deepseek": ("DeepSeek", "openai", "https://api.deepseek.com/v1", True, "deepseek-chat", ""),
    "xai": ("xAI · Grok", "openai", "https://api.x.ai/v1", True, "grok-3-mini", ""),
    "together": ("Together AI", "openai", "https://api.together.xyz/v1", True, "meta-llama/Llama-3.3-70B-Instruct-Turbo", ""),
    "ollama": ("Ollama · local", "openai", "http://localhost:11434/v1", False, "llama3.1", ""),
    "lmstudio": ("LM Studio · local", "openai", "http://localhost:1234/v1", False, "local-model", ""),
    "custom": ("Custom OpenAI-compatible", "openai", "", False, "", ""),
}
STT_MODES = ("auto", "provider", "gemini", "local", "off")
TTS_MODES = ("auto", "fish", "provider", "system", "off")

# Saved in config.json next to the original settings.
MODEL_CFG = {
    "brain_provider": "gemini-live", "brain_model": "", "brain_key": "", "brain_url": "",
    "stt_mode": "auto", "tts_mode": "auto", "tts_voice": "",
    # HUD / accessibility (stored here so they survive restarts; the HUD applies them)
    "ui_reduce_motion": False, "ui_contrast": False, "ui_scale": 1.0, "ui_captions": True,
    "home_name": "", "home_lat": "", "home_lon": "",
}
_BOOL = {"ui_reduce_motion", "ui_contrast", "ui_captions"}
BRAIN_KEYS = {"brain_provider", "brain_model", "brain_key", "brain_url"}


def coerce(key, value):
    if key in _BOOL:
        return value in (True, "true", "True", 1, "1")
    if key == "ui_scale":
        return max(0.8, min(1.6, float(value)))
    if key == "brain_provider":
        v = str(value).strip().lower()
        if v not in PROVIDERS:
            raise ValueError("unknown provider")
        return v
    if key == "stt_mode" and str(value) not in STT_MODES:
        raise ValueError("bad stt mode")
    if key == "tts_mode" and str(value) not in TTS_MODES:
        raise ValueError("bad tts mode")
    if key in ("home_lat", "home_lon") and str(value).strip():
        v = float(value)
        if not (-180 <= v <= 180):
            raise ValueError("out of range")
        return round(v, 5)
    return str(value).strip()


def provider_info(cfg):
    name = cfg.get("brain_provider") or "gemini-live"
    return name, PROVIDERS.get(name, PROVIDERS["custom"])


def is_live(cfg):
    return (cfg.get("brain_provider") or "gemini-live") == "gemini-live"


def provider_list():
    return [{"id": k, "label": v[0], "needs_key": v[3], "model": v[4], "url": v[2]} for k, v in PROVIDERS.items()]


# ---------------------------------------------------------------------------------------------
# Tool schemas: the original declarations use Gemini's upper-case types; everyone else wants JSON Schema.
# ---------------------------------------------------------------------------------------------
def json_schema(s):
    if isinstance(s, dict):
        out = {}
        for k, v in s.items():
            if k == "type" and isinstance(v, str):
                out[k] = v.lower()
            else:
                out[k] = json_schema(v)
        return out
    if isinstance(s, list):
        return [json_schema(x) for x in s]
    return s


def tool_specs(decls, style):
    specs = []
    for d in decls:
        params = json_schema(d.get("parameters") or {"type": "object", "properties": {}})
        params.setdefault("properties", {})
        if style == "anthropic":
            specs.append({"name": d["name"], "description": d.get("description", ""), "input_schema": params})
        else:
            specs.append({"type": "function", "function": {"name": d["name"], "description": d.get("description", ""), "parameters": params}})
    return specs


# ---------------------------------------------------------------------------------------------
# HTTP client. Conversation history is kept in OpenAI chat format and translated for Anthropic.
# ---------------------------------------------------------------------------------------------
class ModelError(RuntimeError):
    pass


def _http(url, body=None, headers=None, timeout=120, method=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"),
                                 headers={"Content-Type": "application/json", "User-Agent": "JARVIS", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read(600).decode("utf-8", "replace")
        try:
            j = json.loads(detail)
            detail = (j.get("error") or {}).get("message") if isinstance(j.get("error"), dict) else (j.get("error") or j.get("message") or detail)
        except Exception:
            pass
        hint = {401: " (the API key was rejected)", 403: " (this key may not have access to that model)",
                404: " (unknown model or wrong base URL)", 429: " (rate limited or out of credit)"}.get(e.code, "")
        raise ModelError("HTTP %d%s: %s" % (e.code, hint, str(detail)[:300]))
    except urllib.error.URLError as e:
        raise ModelError("Cannot reach %s (%s). Check the base URL, your internet, or that the local server is running." % (url.split("/v1")[0], e.reason))


class ChatClient:
    """One chat call with tools against the configured provider."""

    def __init__(self, cfg, model=None):
        self.cfg = cfg
        self.name, info = provider_info(cfg)
        self.label, self.style, base, self.needs_key, hint, self.whisper = info
        if self.style == "live":  # the live provider still gets a text client (for the background worker) via Gemini's OpenAI endpoint
            self.name, self.style, base, hint = "gemini", "openai", PROVIDERS["gemini"][2], PROVIDERS["gemini"][4]
        override = "" if self.style == "live" or provider_info(cfg)[1][1] == "live" else (cfg.get("brain_url") or "")
        self.base = (override or base or "").rstrip("/")
        self.key = (cfg.get("brain_key") or "").strip() or ((cfg.get("api_key") or "").strip() if self.name == "gemini" else "")
        self.model = (model or cfg.get("brain_model") or hint or "").strip()

    def problem(self):
        if not self.base:
            return "Set the base URL for your model server in Configuration."
        if not self.model:
            return "Choose a model name in Configuration."
        if self.needs_key and not self.key:
            return "Add the %s API key in Configuration." % self.label
        return ""

    def _headers(self):
        if self.style == "anthropic":
            return {"x-api-key": self.key, "anthropic-version": "2023-06-01"}
        h = {"Authorization": "Bearer " + self.key} if self.key else {}
        if self.name == "openrouter":
            h.update({"HTTP-Referer": "https://github.com/", "X-Title": "JARVIS"})
        return h

    def list_models(self):
        if self.style == "anthropic":
            j = _http(self.base + "/models?limit=100", headers=self._headers(), timeout=20)
        else:
            j = _http(self.base + "/models", headers=self._headers(), timeout=20)
        items = j.get("data") or j.get("models") or []
        ids = [m.get("id") or m.get("name") for m in items if isinstance(m, dict)]
        return sorted({i.replace("models/", "") for i in ids if i})

    def chat(self, system, messages, tools, max_tokens=1200, temperature=0.4):
        """Returns (text, [(id, name, args)], assistant_message_in_openai_format)."""
        if self.style == "anthropic":
            return self._anthropic(system, messages, tools, max_tokens, temperature)
        body = {"model": self.model, "messages": [{"role": "system", "content": system}] + messages,
                "max_tokens": max_tokens, "temperature": temperature}
        if tools:
            body["tools"] = tool_specs(tools, "openai")
        try:
            j = _http(self.base + "/chat/completions", body, self._headers())
        except ModelError as e:
            # Some models reject temperature or max_tokens (reasoning models) or tools (small local models): retry leaner.
            msg = str(e).lower()
            if "temperature" in msg or "max_tokens" in msg:
                body.pop("temperature", None)
                body["max_completion_tokens"] = body.pop("max_tokens", max_tokens)
                j = _http(self.base + "/chat/completions", body, self._headers())
            elif tools and ("tool" in msg or "function" in msg):
                body.pop("tools", None)
                j = _http(self.base + "/chat/completions", body, self._headers())
            else:
                raise
        ch = (j.get("choices") or [{}])[0]
        m = ch.get("message") or {}
        text = m.get("content") or ""
        if isinstance(text, list):
            text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()  # reasoning models that inline their thoughts
        calls = []
        for tc in m.get("tool_calls") or []:
            fn = tc.get("function") or {}
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except Exception:
                args = {}
            calls.append((tc.get("id") or "call_%d" % len(calls), fn.get("name", ""), args if isinstance(args, dict) else {}))
        msg = {"role": "assistant", "content": text or None}
        if calls:
            msg["tool_calls"] = [{"id": i, "type": "function", "function": {"name": n, "arguments": json.dumps(a)}} for i, n, a in calls]
        return text, calls, msg

    # ---- Anthropic Messages API ----
    @staticmethod
    def _to_anthropic(messages):
        out = []

        def push(role, blocks):
            if out and out[-1]["role"] == role:
                out[-1]["content"].extend(blocks)
            else:
                out.append({"role": role, "content": list(blocks)})

        for m in messages:
            r, c = m["role"], m.get("content")
            if r == "tool":
                push("user", [{"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": str(c or "")}])
            elif r == "assistant":
                blocks = [{"type": "text", "text": c}] if c else []
                for tc in m.get("tool_calls") or []:
                    try:
                        args = json.loads(tc["function"].get("arguments") or "{}")
                    except Exception:
                        args = {}
                    blocks.append({"type": "tool_use", "id": tc["id"], "name": tc["function"]["name"], "input": args})
                push("assistant", blocks or [{"type": "text", "text": "..."}])
            else:
                if isinstance(c, list):
                    blocks = []
                    for p in c:
                        if p.get("type") == "text":
                            blocks.append({"type": "text", "text": p["text"]})
                        elif p.get("type") == "image_url":
                            url = p["image_url"]["url"]
                            mt, b64 = url[5:].split(";base64,", 1)
                            blocks.append({"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}})
                    push("user", blocks)
                else:
                    push("user", [{"type": "text", "text": str(c or "")}])
        return out

    def _anthropic(self, system, messages, tools, max_tokens, temperature):
        body = {"model": self.model, "system": system, "max_tokens": max_tokens, "temperature": temperature,
                "messages": self._to_anthropic(messages)}
        if tools:
            body["tools"] = tool_specs(tools, "anthropic")
        try:
            j = _http(self.base + "/messages", body, self._headers())
        except ModelError as e:
            if "temperature" in str(e).lower():
                body.pop("temperature", None)
                j = _http(self.base + "/messages", body, self._headers())
            else:
                raise
        text, calls = "", []
        for b in j.get("content") or []:
            if b.get("type") == "text":
                text += b.get("text", "")
            elif b.get("type") == "tool_use":
                calls.append((b["id"], b["name"], b.get("input") or {}))
        msg = {"role": "assistant", "content": text or None}
        if calls:
            msg["tool_calls"] = [{"id": i, "type": "function", "function": {"name": n, "arguments": json.dumps(a)}} for i, n, a in calls]
        return text.strip(), calls, msg

    # ---- speech ----
    def transcribe(self, wav_bytes):
        if not self.whisper:
            raise ModelError("%s has no speech-to-text endpoint." % self.label)
        boundary = "----jarvis%d" % int(time.time() * 1000)
        parts = []
        for k, v in (("model", self.whisper), ("response_format", "json")):
            parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (boundary, k, v)).encode())
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n" % boundary).encode()
                     + wav_bytes + b"\r\n")
        parts.append(("--%s--\r\n" % boundary).encode())
        req = urllib.request.Request(self.base + "/audio/transcriptions", data=b"".join(parts), method="POST",
                                     headers={**self._headers(), "Content-Type": "multipart/form-data; boundary=" + boundary})
        with urllib.request.urlopen(req, timeout=60) as r:
            return (json.loads(r.read().decode("utf-8")).get("text") or "").strip()

    def speak(self, text, voice=""):
        """OpenAI text-to-speech. Returns 24 kHz mono 16-bit PCM."""
        body = {"model": "gpt-4o-mini-tts", "input": text, "voice": voice or "onyx", "response_format": "pcm",
                "instructions": "Calm, refined, dry British butler; measured pace."}
        req = urllib.request.Request(self.base + "/audio/speech", data=json.dumps(body).encode(), method="POST",
                                     headers={**self._headers(), "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()


# ---------------------------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------------------------
def pcm_to_wav(pcm, rate):
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(pcm)
    return b.getvalue()


def wav_to_pcm(path_or_bytes, rate):
    with wave.open(io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, bytes) else str(path_or_bytes), "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw == 1:
        a = (np.frombuffer(raw, np.uint8).astype(np.float32) - 128) / 128
    elif sw == 4:
        a = np.frombuffer(raw, np.int32).astype(np.float32) / 2147483648
    else:
        a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if sr != rate and len(a):
        a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * rate / sr)), np.arange(len(a)), a)
    return (np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes()


def system_tts(text, rate):
    """The operating system's own voice, offline. Returns PCM at `rate` or b''."""
    tmp = _tmp_wav()
    try:
        if IS_WIN:
            ps = ("Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                  "$v=$s.GetInstalledVoices()|%{$_.VoiceInfo}|?{$_.Culture -like 'en-GB*'}|select -First 1; if($v){$s.SelectVoice($v.Name)}; "
                  "$s.Rate=0; $s.SetOutputToWaveFile($env:JV_OUT); $s.Speak($env:JV_TEXT); $s.Dispose()")
            subprocess.run(["powershell", "-NoProfile", "-Command", ps], env={**os.environ, "JV_OUT": tmp, "JV_TEXT": text},
                           timeout=60, creationflags=0x08000000, capture_output=True)
        elif IS_MAC:
            subprocess.run(["say", "-v", "Daniel", "-o", tmp, "--data-format=LEI16@%d" % rate, text], timeout=60, capture_output=True)
        else:
            exe = shutil.which("espeak-ng") or shutil.which("espeak")
            if not exe:
                return b""
            subprocess.run([exe, "-v", "en-gb", "-s", "165", "-w", tmp, text], timeout=60, capture_output=True)
        return wav_to_pcm(tmp, rate) if os.path.exists(tmp) and os.path.getsize(tmp) > 44 else b""
    except Exception:
        return b""
    finally:
        try:
            os.remove(tmp)
        except Exception:
            pass


def _tmp_wav():
    fd, p = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    return p


_whisper = {"model": None, "failed": False}


def local_transcribe(pcm16k):
    """faster-whisper on this PC (pip install faster-whisper). Returns text or raises."""
    if _whisper["failed"]:
        raise ModelError("faster-whisper is not installed.")
    if _whisper["model"] is None:
        try:
            from faster_whisper import WhisperModel
        except Exception:
            _whisper["failed"] = True
            raise ModelError("faster-whisper is not installed (pip install faster-whisper).")
        _whisper["model"] = WhisperModel("base", device="auto", compute_type="int8")
    a = np.frombuffer(pcm16k, np.int16).astype(np.float32) / 32768
    segs, _ = _whisper["model"].transcribe(a, beam_size=1, vad_filter=True)
    return " ".join(s.text for s in segs).strip()


def gemini_transcribe(key, wav):
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=key)
    r = client.models.generate_content(model="gemini-2.5-flash", contents=[
        types.Part.from_bytes(data=wav, mime_type="audio/wav"),
        "Transcribe this speech exactly, in the language spoken. Reply with the words only. If there is no speech, reply with nothing."])
    return (r.text or "").strip()


# ---------------------------------------------------------------------------------------------
# ChatBrain: same interface as the Gemini Live Brain in jarvis.py, so Core does not care which one it has.
# ---------------------------------------------------------------------------------------------
class ChatBrain:
    IN_RATE, OUT_RATE = 16000, 24000
    MAX_TURNS = 40          # messages kept in the rolling conversation
    MAX_STEPS = 12          # tool rounds per request

    def __init__(self, core, tools, in_rate=16000, out_rate=24000):
        self.app, self.audio, self.tools = core, core.audio, tools
        self.IN_RATE, self.OUT_RATE = in_rate, out_rate
        self.connected, self.thinking, self.turn_open, self.retired = False, False, False, False
        self.history, self.images, self.gen = [], [], 0
        self.jobs = queue.Queue()
        self.speech_q = queue.Queue()
        self.speaking_tts = False
        self._seg, self._pre, self._voiced, self._silence = [], [], 0.0, 0.0
        self.client = ChatClient(core.cfg)
        self._check()
        threading.Thread(target=self._worker, daemon=True).start()
        threading.Thread(target=self._voice, daemon=True).start()
        threading.Thread(target=self._attach_mic, daemon=True).start()

    # ---- interface used by Core ----
    @property
    def needs_setup(self):
        return bool(self.client.problem())

    def _check(self):
        p = self.client.problem()
        self.connected = not p
        if p:
            self.app.post("status", p)
        else:
            self.app.post("status", "")
            self.app.post("log", "sys", "Online · %s · %s." % (self.client.label, self.client.model))

    def reconnect(self):
        self.client = ChatClient(self.app.cfg)
        self._check()

    def retire(self):
        self.retired = True
        self.stop()
        if self.audio.on_chunk == self._mic:
            self.audio.on_chunk = None

    def say_to_jarvis(self, text):
        if not self.connected:
            return False
        self.thinking = True
        self.jobs.put(("text", text))
        return True

    def send_image(self, jpeg):
        self.images.append(base64.b64encode(jpeg).decode())
        del self.images[:-2]
        return True

    def stop(self):
        self.gen += 1
        self.audio.clear()
        self.app.fish.cancel()
        try:
            while True:
                self.speech_q.get_nowait()
        except queue.Empty:
            pass

    # ---- microphone: collect one utterance after the wake word, then transcribe ----
    def _attach_mic(self):
        while not self.retired:
            if self.audio.on_chunk is None:
                self.audio.on_chunk = self._mic
            time.sleep(0.5)

    def _mic(self, data):
        if self.retired:
            return
        a = np.frombuffer(data, np.int16).astype(np.float32) / 32768
        lvl = min(1.0, float(np.sqrt(np.mean(a * a))) * 6)
        dur = len(a) / self.IN_RATE
        if lvl > 0.09:
            self._voiced += dur
            self._silence = 0.0
            if not self._seg:
                self._seg = list(self._pre)
            self._seg.append(data)
        elif self._seg:
            self._seg.append(data)
            self._silence += dur
        else:
            self._pre = (self._pre + [data])[-5:]
        total = sum(len(x) for x in self._seg) / 2 / self.IN_RATE
        if self._seg and ((self._silence > 0.85 and self._voiced > 0.3) or total > 25):
            pcm, self._seg, self._pre, self._voiced, self._silence = b"".join(self._seg), [], [], 0.0, 0.0
            self.thinking = True
            self.jobs.put(("audio", pcm))
        elif self._seg and self._silence > 1.2:  # a cough or click, not speech
            self._seg, self._voiced, self._silence = [], 0.0, 0.0

    def _transcribe(self, pcm):
        cfg, mode = self.app.cfg, self.app.cfg.get("stt_mode", "auto")
        wav = pcm_to_wav(pcm, self.IN_RATE)
        order = {"provider": ["provider"], "gemini": ["gemini"], "local": ["local"], "off": []}.get(mode, ["provider", "gemini", "local"])
        last = None
        for how in order:
            try:
                if how == "provider" and self.client.whisper:
                    return self.client.transcribe(wav)
                if how == "gemini" and cfg.get("api_key"):
                    return gemini_transcribe(cfg["api_key"], wav)
                if how == "local":
                    return local_transcribe(pcm)
            except Exception as e:
                last = e
        if mode == "off":
            raise ModelError("Voice input is off. Type to talk, or change Voice input in Configuration.")
        raise ModelError("No speech-to-text available%s. Add a Gemini key, pick OpenAI or Groq, or pip install faster-whisper." % (
            " (%s)" % last if last else ""))

    # ---- the thinking loop ----
    def _worker(self):
        while not self.retired:
            kind, payload = self.jobs.get()
            gen = self.gen
            try:
                if kind == "audio":
                    text = self._transcribe(payload)
                    if not text or len(text.strip(" .,!?")) < 2:
                        self.thinking = False
                        continue
                    self.app.post("log", "you", text)
                else:
                    text = payload
                self._turn(text, gen)
            except Exception as e:
                self.app.post("log", "sys", "Model error: %s" % str(e)[:300])
                self.app.audio.sfx("error")
            finally:
                self.thinking = self.turn_open = False

    def _turn(self, text, gen):
        self.turn_open = True
        self.history.append({"role": "user", "content": text})
        decls = self.tools()
        for _ in range(self.MAX_STEPS):
            reply, calls, msg = self.client.chat(self.app.prompt(), self._trimmed(), decls)
            self.history.append(msg)
            if reply and gen == self.gen:
                self.app.post("log", "jarvis", reply)
                self._say(reply)
            if not calls:
                return
            for cid, name, args in calls:
                if gen != self.gen:
                    res = "Cancelled: the user interrupted."
                else:
                    res = self.app.tool(name, args)
                self.history.append({"role": "tool", "tool_call_id": cid, "content": str(res)[:8000]})
            if self.images:
                imgs, self.images = self.images, []
                self.history.append({"role": "user", "content": [{"type": "text", "text": "[System] Screenshot / camera frame:"}] +
                                     [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b}} for b in imgs]})
        self.app.post("log", "sys", "Stopped after %d tool rounds." % self.MAX_STEPS)

    def _trimmed(self):
        h = self.history[-self.MAX_TURNS:]
        while h and h[0]["role"] != "user":  # never start mid tool-exchange
            h = h[1:]
        # drop old images to save tokens
        out = []
        for i, m in enumerate(h):
            if isinstance(m.get("content"), list) and i < len(h) - 3:
                out.append({"role": "user", "content": "[System] (an earlier image, no longer shown)"})
            else:
                out.append(m)
        self.history = self.history[-self.MAX_TURNS * 2:]
        return out

    # ---- speaking ----
    def _say(self, text):
        mode = self.app.cfg.get("tts_mode", "auto")
        if mode == "off":
            return
        fish = self.app.fish
        if mode in ("auto", "fish") and fish.enabled:
            fish.feed(text + " ")
            fish.flush()
            return
        for s in re.split(r"(?<=[.!?])\s+", re.sub(r"[*_#`]+", "", text)):
            if s.strip():
                self.speech_q.put((self.gen, s.strip()))

    def _voice(self):
        while not self.retired:
            gen, s = self.speech_q.get()
            if gen != self.gen:
                continue
            self.speaking_tts = True
            try:
                mode, pcm = self.app.cfg.get("tts_mode", "auto"), b""
                if mode in ("auto", "provider") and self.client.name == "openai":
                    try:
                        pcm = self.client.speak(s, self.app.cfg.get("tts_voice", ""))
                    except Exception as e:
                        if mode == "provider":
                            self.app.post("log", "sys", "Provider voice failed: %s" % str(e)[:160])
                if not pcm and mode in ("auto", "system", "provider"):
                    pcm = system_tts(s, self.OUT_RATE)
                if pcm and gen == self.gen:
                    self.audio.play(pcm)
                    while self.audio.outq.qsize() > 8 and gen == self.gen:
                        time.sleep(0.05)
            finally:
                self.speaking_tts = False


# ---------------------------------------------------------------------------------------------
# Generic tool loop for the background worker (used when the brain is not Gemini).
# ---------------------------------------------------------------------------------------------
def run_tool_loop(cfg, system, goal, decls, call_tool, max_steps=30, should_stop=lambda: False, model=None, on_step=None):
    client = ChatClient(cfg, model=model)
    p = client.problem()
    if p:
        raise ModelError(p)
    msgs = [{"role": "user", "content": "GOAL: " + goal}]
    for step in range(1, max_steps + 1):
        if should_stop():
            return None
        text, calls, msg = client.chat(system, msgs, decls, max_tokens=2500, temperature=0.2)
        msgs.append(msg)
        if not calls:
            return text
        for cid, name, args in calls:
            if on_step:
                on_step(step, name)
            msgs.append({"role": "tool", "tool_call_id": cid, "content": str(call_tool(name, args))[:6000]})
    return "Stopped after %d steps without finishing; the work so far is logged." % max_steps


def geocode(place):
    """Place name -> (name, lat, lon) using Open-Meteo's free geocoder (no key)."""
    q = urllib.parse.quote(place.strip())
    j = _http("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + q, timeout=12)
    r = (j.get("results") or [None])[0]
    if not r:
        return None
    label = ", ".join(x for x in (r.get("name"), r.get("admin1"), r.get("country")) if x)
    return label, float(r["latitude"]), float(r["longitude"])

