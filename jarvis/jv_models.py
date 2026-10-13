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
    "auto": ("Best free AI · automatic (Gemini, Groq)", "auto", "", False, "", ""),
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
    "ollama": ("Ollama · local, free, private", "ollama", "http://localhost:11434", False, "qwen3:8b", ""),
    "lmstudio": ("LM Studio · local", "openai", "http://localhost:1234/v1", False, "local-model", ""),
    "custom": ("Custom OpenAI-compatible", "openai", "", False, "", ""),
}
STT_MODES = ("auto", "provider", "gemini", "local", "off")
TTS_MODES = ("auto", "fish", "kokoro", "provider", "system", "off")

# Saved in config.json next to the original settings.
MODEL_CFG = {
    "brain_provider": "auto", "brain_model": "", "brain_key": "", "brain_url": "", "groq_key": "", "openrouter_key": "", "local_fallback": False,
    "stt_mode": "auto", "tts_mode": "auto", "tts_voice": "",
    "brain_think": "auto", "brain_ctx": 0, "tool_limit": 0, "vision_model": "", "kokoro_voice": "bm_george", "kokoro_speed": 0.95,
    # HUD / accessibility (stored here so they survive restarts; the HUD applies them)
    "ui_reduce_motion": False, "ui_contrast": False, "ui_scale": 1.0, "ui_captions": True, "ui_spin": 0.45,
    "home_name": "", "home_lat": "", "home_lon": "",
}
_BOOL = {"ui_reduce_motion", "ui_contrast", "ui_captions", "local_fallback"}
BRAIN_KEYS = {"brain_provider", "brain_model", "brain_key", "brain_url", "brain_think", "brain_ctx", "tool_limit", "vision_model", "groq_key", "openrouter_key", "api_key"}


def coerce(key, value):
    if key in _BOOL:
        return value in (True, "true", "True", 1, "1")
    if key == "ui_scale":
        return max(0.8, min(1.6, float(value)))
    if key in ("brain_ctx", "tool_limit"):
        return max(0, min(262144, int(float(value or 0))))
    if key == "kokoro_speed":
        return max(0.6, min(1.5, float(value)))
    if key == "brain_think" and str(value) not in ("auto", "on", "off", "low", "medium", "high"):
        raise ValueError("bad think level")
    if key == "ui_spin":
        return max(0.05, min(1.5, float(value)))
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
def _loads(a):
    if isinstance(a, dict):
        return a
    try:
        v = json.loads(a or "{}")
        return v if isinstance(v, dict) else {}
    except Exception:
        return {}


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
        if self.style == "ollama" and self.base.endswith("/v1"):
            self.base = self.base[:-3]
        self.thinking = ""
        self.timeout = 300 if self.style == "ollama" else 90
        self.deep = False       # background work (autopilot, research) may think longer; voice replies must be quick
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
        if self.style == "ollama":
            j = _http(self.base + "/api/tags", timeout=10)
            return sorted(m.get("name") for m in j.get("models") or [] if m.get("name"))
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
        if self.style == "ollama":
            return self._ollama(system, messages, tools, max_tokens, temperature)
        messages = [{k: v for k, v in m.items() if not (m["role"] == "tool" and k == "name")} for m in messages]
        body = {"model": self.model, "messages": [{"role": "system", "content": system}] + messages,
                "max_tokens": max_tokens, "temperature": temperature}
        if tools:
            body["tools"] = tool_specs(tools, "openai")
        try:
            j = _http(self.base + "/chat/completions", body, self._headers(), timeout=self.timeout)
        except ModelError as e:
            # Some models reject temperature or max_tokens (reasoning models) or tools (small local models): retry leaner.
            msg = str(e).lower()
            if "temperature" in msg or "max_tokens" in msg:
                body.pop("temperature", None)
                body["max_completion_tokens"] = body.pop("max_tokens", max_tokens)
                j = _http(self.base + "/chat/completions", body, self._headers(), timeout=self.timeout)
            elif tools and ("tool" in msg or "function" in msg):
                body.pop("tools", None)
                j = _http(self.base + "/chat/completions", body, self._headers(), timeout=self.timeout)
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

    # ---- Ollama native API: real context size, thinking, tools, images ----
    def ctx_size(self):
        n = int(self.cfg.get("brain_ctx") or 0)
        if n:
            return n
        gb = hardware().get("vram_gb") or 0
        if not self.deep:          # conversation: enough for the prompt and ~24 tools, small enough to stay fast and in VRAM
            return 12288 if gb >= 10 else 8192
        return 32768 if gb >= 16 else 16384 if gb >= 8 else 8192

    def think_value(self):
        t = str(self.cfg.get("brain_think") or "auto")
        if t == "off" or (t == "auto" and not self.deep):
            return False
        if self.model.startswith("gpt-oss"):
            return t if t in ("low", "medium", "high") else "medium"
        return True

    def _ollama(self, system, messages, tools, max_tokens, temperature):
        msgs = [{"role": "system", "content": system}]
        for m in messages:
            r, c = m["role"], m.get("content")
            if r == "tool":
                msgs.append({"role": "tool", "content": str(c or ""), "tool_name": m.get("name", "")})
            elif r == "assistant":
                o = {"role": "assistant", "content": c or ""}
                if m.get("tool_calls"):
                    o["tool_calls"] = [{"function": {"name": tc["function"]["name"], "arguments": _loads(tc["function"].get("arguments"))}} for tc in m["tool_calls"]]
                msgs.append(o)
            elif isinstance(c, list):
                msgs.append({"role": "user", "content": " ".join(p.get("text", "") for p in c if p.get("type") == "text"),
                             "images": [p["image_url"]["url"].split(",", 1)[1] for p in c if p.get("type") == "image_url"]})
            else:
                msgs.append({"role": r, "content": str(c or "")})
        body = {"model": self.model, "messages": msgs, "stream": False, "keep_alive": "30m",
                "options": {"num_ctx": self.ctx_size(), "temperature": temperature, "num_predict": max(max_tokens, 4096) if self.deep else min(max_tokens, 1200)}}
        th = self.think_value()
        if th is not False:
            body["think"] = th
        if tools:
            body["tools"] = tool_specs(tools, "openai")
        try:
            j = _http(self.base + "/api/chat", body, timeout=self.timeout)
        except ModelError as e:
            msg = str(e).lower()
            if "think" in msg:                      # model without a thinking mode
                body.pop("think", None)
                j = _http(self.base + "/api/chat", body, timeout=self.timeout)
            elif tools and "tool" in msg:           # model without tool support: still answer
                body.pop("tools", None)
                j = _http(self.base + "/api/chat", body, timeout=self.timeout)
            elif "not found" in msg:
                raise ModelError("The model %s is not downloaded. Use 'Set up local AI' in Configuration, or run: ollama pull %s" % (self.model, self.model))
            else:
                raise
        m = j.get("message") or {}
        self.thinking = (m.get("thinking") or "").strip()
        text = re.sub(r"<think>.*?</think>", "", m.get("content") or "", flags=re.S).strip()
        calls = []
        for i, tc in enumerate(m.get("tool_calls") or []):
            fn = tc.get("function") or {}
            args = fn.get("arguments")
            calls.append(("call_%d_%d" % (int(time.time() * 1000) % 100000, i), fn.get("name", ""), _loads(args)))
        out = {"role": "assistant", "content": text or None}
        if calls:
            out["tool_calls"] = [{"id": i, "type": "function", "function": {"name": n, "arguments": json.dumps(a)}} for i, n, a in calls]
        return text, calls, out

    def describe_image(self, b64, question=""):
        """For text-only local models: a local vision model turns a screenshot into a detailed description."""
        vm = (self.cfg.get("vision_model") or "").strip()
        if not vm:
            return ""
        j = _http(self.base + "/api/chat", {"model": vm, "stream": False, "options": {"num_ctx": 8192}, "messages": [{"role": "user", "images": [b64],
                  "content": "Describe this screenshot for someone who must operate it: the app and window, every visible piece of text, buttons, fields, "
                             "menus and their approximate pixel positions (x, y from the top left), and anything that looks like an error or dialog. "
                             + (question or "")}]}, timeout=300)
        return ((j.get("message") or {}).get("content") or "").strip()

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
            j = _http(self.base + "/messages", body, self._headers(), timeout=self.timeout)
        except ModelError as e:
            if "temperature" in str(e).lower():
                body.pop("temperature", None)
                j = _http(self.base + "/messages", body, self._headers(), timeout=self.timeout)
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
        for k, v in (("model", self.whisper), ("response_format", "verbose_json"), ("temperature", "0")):
            parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (boundary, k, v)).encode())
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n" % boundary).encode()
                     + wav_bytes + b"\r\n")
        parts.append(("--%s--\r\n" % boundary).encode())
        req = urllib.request.Request(self.base + "/audio/transcriptions", data=b"".join(parts), method="POST",
                                     headers={**self._headers(), "Content-Type": "multipart/form-data; boundary=" + boundary})
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.loads(r.read().decode("utf-8"))
        segs = j.get("segments") or []
        if segs:   # keep only segments the model itself believes are speech
            keep = [s.get("text", "") for s in segs if (s.get("no_speech_prob") or 0) < 0.55 and (s.get("avg_logprob") or 0) > -1.0]
            return " ".join(keep).strip()
        return (j.get("text") or "").strip()

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


def _cuda_dll_dirs():
    """Make pip-installed NVIDIA libraries (nvidia-cublas-cu12, nvidia-cudnn-cu12) visible to ctranslate2 on Windows."""
    if not IS_WIN:
        return
    import importlib.util
    for mod in ("nvidia.cublas", "nvidia.cudnn", "nvidia.cuda_runtime"):
        try:
            spec = importlib.util.find_spec(mod)
        except Exception:
            spec = None
        for root in (spec.submodule_search_locations if spec and spec.submodule_search_locations else []):
            d = os.path.join(root, "bin")
            if os.path.isdir(d):
                try:
                    os.add_dll_directory(d)
                except Exception:
                    pass
                os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def _whisper_load(device):
    import jv_auto
    WhisperModel = jv_auto.ensure("faster-whisper", "faster_whisper").WhisperModel   # installed on first use
    size = "small" if (hardware().get("vram_gb") or 0) >= 4 else "base"
    if device == "cuda":
        _cuda_dll_dirs()
        m = WhisperModel(size, device="cuda", compute_type="float16")
    else:
        m = WhisperModel(size, device="cpu", compute_type="int8", cpu_threads=max(2, (os.cpu_count() or 4) // 2))
    # the CUDA libraries are only loaded on the first real transcription, so prove the device works right now
    list(m.transcribe(np.zeros(16000, np.float32), beam_size=1)[0])
    return m


def local_transcribe(pcm16k):
    """faster-whisper on this PC: the GPU when its CUDA 12 libraries are present, otherwise the CPU. Returns text or raises."""
    if _whisper["failed"]:
        raise ModelError("faster-whisper could not be installed (pip install faster-whisper).")
    if _whisper["model"] is None:
        last = None
        for device in (["cuda", "cpu"] if (hardware().get("vram_gb") or 0) >= 2 else ["cpu"]):
            try:
                _whisper["model"], _whisper["device"] = _whisper_load(device), device
                break
            except ImportError:
                _whisper["failed"] = True
                raise ModelError("faster-whisper could not be installed (pip install faster-whisper).")
            except Exception as e:   # e.g. "Library cublas64_12.dll is not found": fall back to the CPU
                last = e
        if _whisper["model"] is None:
            raise ModelError("Speech recognition could not start: %s" % str(last)[:200])
    a = np.frombuffer(pcm16k, np.int16).astype(np.float32) / 32768
    try:
        segs, _ = _whisper["model"].transcribe(a, beam_size=1, vad_filter=True, condition_on_previous_text=False)
        return " ".join(s.text for s in segs if s.no_speech_prob < 0.55 and s.avg_logprob > -1.0).strip()
    except Exception as e:
        if _whisper.get("device") == "cuda":   # the GPU path broke mid-session: switch to the CPU and retry once
            _whisper["model"], _whisper["device"] = _whisper_load("cpu"), "cpu"
            segs, _ = _whisper["model"].transcribe(a, beam_size=1, vad_filter=True)
            return " ".join(s.text for s in segs).strip()
        raise


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
        self.client = make_client(core.cfg)
        self._check()
        threading.Thread(target=self._warm, daemon=True).start()
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
        self.client = make_client(self.app.cfg)
        self._check()
        threading.Thread(target=self._warm, daemon=True).start()

    def _warm(self):
        """Load a local model into memory now, so the first question is not slow."""
        try:
            for c in getattr(self.client, "members", lambda: [self.client])():
                if c.style == "ollama" and ollama_up(c.base):
                    _http(c.base + "/api/generate", {"model": c.model, "prompt": "", "keep_alive": "30m"}, timeout=300)
                    break
        except Exception:
            pass

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
        dur = len(data) / 2 / self.IN_RATE
        if self.audio.voiced:          # WebRTC speech detection above the learned noise floor (see AudioIO._cb)
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
        if self._seg and ((self._silence > 0.8 and self._voiced > 0.35) or total > 25):
            pcm, self._seg, self._pre, self._voiced, self._silence = b"".join(self._seg), [], [], 0.0, 0.0
            self.thinking = True
            self.jobs.put(("audio", pcm))
        elif self._seg and self._silence > 0.8:  # a cough or click, not speech
            self._seg, self._voiced, self._silence = [], 0.0, 0.0

    def _transcribe(self, pcm):
        cfg, mode = self.app.cfg, self.app.cfg.get("stt_mode", "auto")
        wav = pcm_to_wav(pcm, self.IN_RATE)
        order = {"provider": ["provider"], "gemini": ["gemini"], "local": ["local"], "off": []}.get(
            mode, ["local", "provider", "gemini"] if self.client.style == "ollama" else ["provider", "gemini", "local"])
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
        raise ModelError("No speech-to-text available%s. Add a Gemini key, pick OpenAI or Groq, or run JARVIS.bat repair." % (
            " (%s)" % last if last else ""))

    # ---- the thinking loop ----
    def _worker(self):
        while not self.retired:
            kind, payload = self.jobs.get()
            gen = self.gen
            try:
                if kind == "audio":
                    text = self._transcribe(payload)
                    if not text or len(text.strip(" .,!?")) < 2 or is_hallucination(text):
                        self.thinking = False
                        if text:
                            self.app.ui({"t": "log", "who": "sys", "text": "(ignored background noise: \"%s\")" % text[:60]})
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
        decls = select_tools(self.tools(), text + " " + " ".join(str(m.get("content") or "")[:200] for m in self.history[-6:]), self.tool_limit())
        for _ in range(self.MAX_STEPS):
            reply, calls, msg = self.client.chat(self.app.prompt(), self._trimmed(), decls, max_tokens=1500)
            if self.client.thinking:
                self.app.ui({"t": "thought", "text": self.client.thinking[-1200:]})
            if getattr(self.client, "active", None):
                self.app.ui({"t": "brain", "label": "Free AI", "model": self.client.active})
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
                self.history.append({"role": "tool", "tool_call_id": cid, "name": name, "content": str(res)[:8000]})
            if self.images and self.client.style == "ollama" and (self.app.cfg.get("vision_model") or "").strip():
                imgs, self.images = self.images, []
                try:
                    desc = self.client.describe_image(imgs[-1], "The user asked: " + text)
                except Exception as e:
                    desc = "(the vision model failed: %s)" % str(e)[:160]
                self.history.append({"role": "user", "content": "[System] What the screen shows (from the vision model): " + desc})
            if self.images:
                imgs, self.images = self.images, []
                self.history.append({"role": "user", "content": [{"type": "text", "text": "[System] Screenshot / camera frame:"}] +
                                     [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b}} for b in imgs]})
        self.app.post("log", "sys", "Stopped after %d tool rounds." % self.MAX_STEPS)

    def tool_limit(self):
        n = int(self.app.cfg.get("tool_limit") or 0)
        if n:
            return n
        if self.client.style == "auto":
            return 28        # free tiers limit tokens per minute: send the tools that matter
        return 24 if self.client.style == "ollama" or self.client.name == "lmstudio" else 0   # small models drown in 80 tool definitions

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
                if mode in ("auto", "kokoro"):
                    try:
                        pcm = kokoro_pcm(self.app, s, self.OUT_RATE)
                    except Exception as e:
                        if mode == "kokoro" or not getattr(self, "_kwarned", False):
                            self._kwarned = True
                            self.app.post("log", "sys", "Local voice unavailable (%s); using a fallback voice." % str(e)[:160])
                if not pcm and mode in ("auto", "provider") and self.client.name == "openai":
                    try:
                        pcm = self.client.speak(s, self.app.cfg.get("tts_voice", ""))
                    except Exception as e:
                        if mode == "provider":
                            self.app.post("log", "sys", "Provider voice failed: %s" % str(e)[:160])
                if not pcm and mode in ("auto", "system", "provider", "kokoro"):
                    pcm = system_tts(s, self.OUT_RATE)
                if not pcm and mode != "off" and time.time() - getattr(self, "_vwarn", 0) > 60:
                    self._vwarn = time.time()
                    self.app.post("log", "sys", "No voice engine could speak that reply (the text is above). Settings > Voice output > Hear it tests the voice.")
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
    client = make_client(cfg, model=model)
    client.deep = True
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
            msgs.append({"role": "tool", "tool_call_id": cid, "name": name, "content": str(call_tool(name, args))[:6000]})
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



# ---------------------------------------------------------------------------------------------
# Tool routing: local models do far better with the 30 tools that matter than with all 80+.
# ---------------------------------------------------------------------------------------------
ESSENTIAL = ["run_command", "run_script", "open_app", "open_website", "web_search", "read_webpage", "browser", "ui_auto", "screen_text",
             "look_at_screen", "type_text", "press_keys", "wait_for", "file_ops", "read_file", "write_file", "calendar", "hologram",
             "deep_research", "start_background_task", "memory", "set_timer", "autopilot", "mcp"]


def select_tools(decls, query, limit):
    if not limit or len(decls) <= limit:
        return decls
    words = set(re.findall(r"[a-z0-9]{3,}", query.lower()))
    by = {d["name"]: d for d in decls}
    chosen = [by[n] for n in ESSENTIAL if n in by]
    rest = []
    for d in decls:
        if d in chosen:
            continue
        hay = (d["name"].replace("_", " ") + " " + d.get("description", "")).lower()
        score = sum(3 if w in d["name"].lower() else 1 for w in words if w in hay)
        rest.append((score, d))
    rest.sort(key=lambda x: -x[0])
    chosen += [d for sc, d in rest if sc > 0][:max(0, limit - len(chosen))]
    return chosen[:max(limit, len(chosen))]


# ---------------------------------------------------------------------------------------------
# Hardware check and the best local model for it (Ollama). Several candidates per tier: the first that
# downloads wins, so a renamed tag never leaves the user without a brain.
# ---------------------------------------------------------------------------------------------
_HW = {}


def hardware():
    if _HW:
        return _HW
    vram, gpu = 0.0, ""
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=8,
                           creationflags=0x08000000 if IS_WIN else 0)
        if r.returncode == 0 and r.stdout.strip():
            name, mem = r.stdout.strip().splitlines()[0].rsplit(",", 1)
            gpu, vram = name.strip(), float(mem) / 1024
    except Exception:
        pass
    ram = 0.0
    try:
        import psutil
        ram = psutil.virtual_memory().total / 2 ** 30
    except Exception:
        pass
    if IS_MAC and not vram:          # Apple silicon: the GPU shares system memory
        gpu, vram = "Apple silicon (unified memory)", ram * 0.7
    _HW.update({"gpu": gpu or "no NVIDIA GPU found", "vram_gb": round(vram, 1), "ram_gb": round(ram, 1)})
    return _HW


TIERS = [  # (min GB of fast memory, thinking + tool-calling brains in preference order, vision helper)
    (60, ["gpt-oss:120b", "qwen3.6:35b", "qwen3:30b"], "qwen2.5vl:32b"),
    (22, ["qwen3.6:35b", "qwen3:30b", "gpt-oss:20b"], "qwen2.5vl:7b"),
    (14, ["gpt-oss:20b", "qwen3:14b"], "qwen2.5vl:7b"),
    (7, ["qwen3.5:9b", "qwen3:8b"], "gemma3:4b"),
    (0, ["qwen3:4b", "qwen3:1.7b"], "gemma3:4b"),
]


def recommend():
    hw = hardware()
    mem = hw["vram_gb"] or hw["ram_gb"] * 0.5   # CPU only: about half the RAM is usable for a model, and it will be slow
    for need, models, vision in TIERS:
        if mem >= need:
            return {"models": models, "vision": vision, "hw": hw, "cpu_only": not hw["vram_gb"]}
    return {"models": TIERS[-1][1], "vision": TIERS[-1][2], "hw": hw, "cpu_only": True}


def ollama_up(base="http://localhost:11434"):
    try:
        _http(base + "/api/version", timeout=3)
        return True
    except Exception:
        return False


def ollama_pull(model, progress, base="http://localhost:11434"):
    """Stream a model download. progress(text, fraction). Raises ModelError when the tag does not exist."""
    req = urllib.request.Request(base + "/api/pull", data=json.dumps({"model": model, "stream": True}).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    last = 0
    try:
        with urllib.request.urlopen(req, timeout=7200) as r:
            for line in r:
                try:
                    j = json.loads(line)
                except Exception:
                    continue
                if j.get("error"):
                    raise ModelError(j["error"])
                tot, done = j.get("total") or 0, j.get("completed") or 0
                if time.time() - last > 0.7 or j.get("status") == "success":
                    last = time.time()
                    progress("%s: %s" % (model, j.get("status", "")), (done / tot) if tot else None)
    except urllib.error.HTTPError as e:
        raise ModelError("HTTP %d: %s" % (e.code, e.read(300).decode("utf-8", "replace")))


def install_ollama(progress):
    """Install Ollama if it is missing and make sure its server is running. Returns '' or a reason it could not."""
    if ollama_up():
        return ""
    exe = shutil.which("ollama")
    if not exe and IS_WIN:
        exe_guess = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
        exe = exe_guess if os.path.exists(exe_guess) else ""
    if not exe:
        if IS_WIN:
            progress("Installing Ollama with winget (a Windows prompt may appear)...", None)
            r = subprocess.run(["winget", "install", "-e", "--id", "Ollama.Ollama", "--accept-package-agreements", "--accept-source-agreements"],
                               capture_output=True, text=True, timeout=1800, creationflags=0x08000000)
            exe = shutil.which("ollama") or os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
            if not os.path.exists(exe):
                return "winget could not install Ollama (%s). Download it from https://ollama.com/download and run Set up again." % (r.stdout or r.stderr)[-200:]
        elif IS_MAC:
            return "Install Ollama from https://ollama.com/download (or: brew install ollama), open it once, then run Set up again."
        else:
            return "Install Ollama with: curl -fsSL https://ollama.com/install.sh | sh   then run Set up again."
    progress("Starting the Ollama server...", None)
    subprocess.Popen([exe, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=0x08000000 if IS_WIN else 0, start_new_session=not IS_WIN)
    for _ in range(40):
        if ollama_up():
            return ""
        time.sleep(0.5)
    return "Ollama is installed but its server did not start. Open the Ollama app once, then run Set up again."


# ---------------------------------------------------------------------------------------------
# Kokoro: a free, local, natural British voice (Apache-2.0, 82M parameters, runs on the CPU in real time)
# ---------------------------------------------------------------------------------------------
KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
KOKORO_VOICES = {"bm_george": "George · British, deep, measured (most JARVIS-like)", "bm_lewis": "Lewis · British, warm",
                 "bm_daniel": "Daniel · British, crisp", "bm_fable": "Fable · British, storyteller", "am_michael": "Michael · American",
                 "am_adam": "Adam · American, deep", "bf_emma": "Emma · British", "af_heart": "Heart · American"}


class Kokoro:
    _inst, _lock = None, threading.Lock()

    def __init__(self, folder, ensure_fn, progress=None):
        self.folder = folder
        folder.mkdir(parents=True, exist_ok=True)
        for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
            dest = folder / f
            if not dest.exists() or dest.stat().st_size < 1000:
                if progress:
                    progress("Downloading the free JARVIS voice (%s, one time)..." % f)
                tmp = dest.with_suffix(".part")
                with urllib.request.urlopen(urllib.request.Request(KOKORO_URL + f, headers={"User-Agent": "JARVIS"}), timeout=60) as r, open(tmp, "wb") as fh:
                    shutil.copyfileobj(r, fh, 1 << 20)
                tmp.replace(dest)
        mod = ensure_fn("kokoro-onnx", "kokoro_onnx")
        self.k = mod.Kokoro(str(folder / "kokoro-v1.0.onnx"), str(folder / "voices-v1.0.bin"))

    @classmethod
    def get(cls, folder, ensure_fn, progress=None):
        with cls._lock:
            if cls._inst is None:
                cls._inst = Kokoro(folder, ensure_fn, progress)
            return cls._inst

    def pcm(self, text, voice="bm_george", speed=0.95, rate=24000):
        lang = "en-gb" if voice.startswith(("b",)) else "en-us"
        samples, sr = self.k.create(text, voice=voice, speed=float(speed), lang=lang)
        a = np.asarray(samples, dtype=np.float32)
        if sr != rate and len(a):
            a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * rate / sr)), np.arange(len(a)), a)
        return (np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes()


def kokoro_pcm(core, text, rate=24000):
    import jv_auto
    k = Kokoro.get(core.voice_dir, lambda pip, mod: jv_auto.ensure(pip, mod, core), lambda t: core.post("status", t))
    core.post("status", "")
    return k.pcm(text, core.cfg.get("kokoro_voice") or "bm_george", core.cfg.get("kokoro_speed") or 0.95, rate)


# ---------------------------------------------------------------------------------------------
# "Best free AI": a chain of free providers. The first one that answers wins; a provider that is rate
# limited, down or slow is skipped for a while. Models are picked automatically from what each offers.
# ---------------------------------------------------------------------------------------------
FREE_CHAIN = [("gemini", "api_key"), ("groq", "groq_key"), ("openrouter", "openrouter_key"), ("ollama", None)]
FREE_PREFS = {
    "groq": ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct-0905", "moonshotai/kimi-k2-instruct", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"],
    "openrouter": ["openai/gpt-oss-120b:free", "deepseek/deepseek-chat-v3.1:free", "qwen/qwen3-coder:free", "meta-llama/llama-3.3-70b-instruct:free", "z-ai/glm-4.5-air:free"],
}
_PICKED, _COOL = {}, {}


def _pick_model(client, prov):
    if prov in _PICKED and time.time() - _PICKED[prov][1] < 6 * 3600:
        return _PICKED[prov][0]
    choice = ""
    try:
        have = client.list_models()
    except Exception:
        have = []
    if prov == "gemini":
        def ver(m):
            v = re.match(r"gemini-(\d+(?:\.\d+)?)-flash(?:-preview)?(?:-\d\d-\d{4})?$", m)
            return float(v.group(1)) if v else -1
        cands = sorted([m for m in have if ver(m) > 0], key=lambda m: (ver(m), "preview" not in m), reverse=True)
        choice = cands[0] if cands else ("gemini-flash-latest" if "gemini-flash-latest" in have else "gemini-2.5-flash")
    elif prov == "ollama":
        best = [m for m in recommend()["models"] if m in have]
        choice = best[0] if best else next((m for m in have if not re.search(r"vl|vision|embed|gemma3:4b", m)), "")
    else:
        choice = next((m for m in FREE_PREFS[prov] if m in have), FREE_PREFS[prov][0] if not have else next((m for m in have if m.endswith(":free") or prov == "groq"), FREE_PREFS[prov][0]))
    if choice:
        _PICKED[prov] = (choice, time.time())
    return choice


class AutoClient:
    name, label, style, needs_key = "auto", "Best free AI", "auto", False

    def __init__(self, cfg, model=None):
        self.cfg, self.thinking, self.active, self.deep, self.timeout = cfg, "", "", False, 90
        g = cfg.get("groq_key")
        self.whisper = "whisper-large-v3-turbo" if g else ""   # Groq also transcribes speech, free and fast
        self._groq = ChatClient({**cfg, "brain_provider": "groq", "brain_key": g, "brain_url": "", "brain_model": "x"}) if g else None
        self.model = "automatic"

    def members(self):
        out = []
        for prov, key in FREE_CHAIN:
            k = (self.cfg.get(key) or "").strip() if key else ""
            if key and not k:
                continue
            if prov == "ollama" and (not self.cfg.get("local_fallback") or not ollama_up()):
                continue      # cloud only unless the user turned the local fallback on
            c = ChatClient({**self.cfg, "brain_provider": prov, "brain_key": k, "brain_url": "", "brain_model": "",
                            "brain_think": self.cfg.get("brain_think", "auto")})
            c.model = (self.cfg.get("brain_model") if prov == "ollama" and self.cfg.get("brain_model") else "") or _pick_model(c, prov)
            c.timeout = 60 if prov != "ollama" else 240
            if c.model:
                out.append(c)
        return out

    def problem(self):
        if any((self.cfg.get(k) or "").strip() for _, k in FREE_CHAIN if k) or (self.cfg.get("local_fallback") and ollama_up()):
            return ""
        return "Add a free Gemini or Groq key in Configuration > Free AI (the Get free key buttons open the pages)."

    def list_models(self):
        return ["%s: %s" % (c.name, c.model) for c in self.members()]

    def chat(self, system, messages, tools, max_tokens=1200, temperature=0.4):
        last = None
        for c in self.members():
            if time.time() < _COOL.get(c.name, 0):
                continue
            c.deep = self.deep
            try:
                text, calls, msg = c.chat(system, messages, tools, max_tokens, temperature)
                self.thinking, self.active = c.thinking, "%s · %s" % (c.name, c.model)
                return text, calls, msg
            except ModelError as e:
                last = e
                m = str(e).lower()
                if "401" in m or "invalid" in m and "key" in m:
                    _COOL[c.name] = time.time() + 3600           # bad key: stop trying it for an hour
                else:
                    _COOL[c.name] = time.time() + (90 if ("429" in m or "rate" in m or "quota" in m) else 30)
        raise last or ModelError(self.problem() or "Every free provider is busy right now; try again in a minute.")

    def transcribe(self, wav):
        if not self._groq:
            raise ModelError("No Groq key for speech recognition.")
        return self._groq.transcribe(wav)

    def describe_image(self, b64, question=""):
        return ""


def make_client(cfg, model=None):
    if (cfg.get("brain_provider") or "") == "auto":
        return AutoClient(cfg, model)
    return ChatClient(cfg, model=model)


# Whisper-style models invent these when they are fed silence, hiss or music.
_HALLU = re.compile(r"^(thanks?( you)?( (so|very) much)?( for watching| for listening)?|thank you\.?|you|bye( bye)?|okay|oh|um+|uh+|hmm+|"
                    r"subtitles by.*|please subscribe.*|like and subscribe.*|\[?(music|silence|applause|laughter|blank_audio|no speech)\]?|"
                    r"amara\.org.*|transcribed by.*|\.+|♪+)$", re.I)


def is_hallucination(text):
    t = re.sub(r"[\s.,!?'\"-]+", " ", (text or "").strip().lower()).strip()
    return not t or bool(_HALLU.match(t)) or bool(_HALLU.match((text or "").strip()))
