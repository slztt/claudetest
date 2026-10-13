"""Small shared helpers: web requests, geocoding, Gemini text calls (for background research), and the HUD's own settings.

JARVIS thinks, hears and speaks with Gemini Live (see Brain in jarvis.py). Background research uses the same Gemini key
through the regular Gemini API.
"""
import json, time, urllib.error, urllib.parse, urllib.request

# HUD and accessibility settings (saved in config.json next to the original ones)
UI_CFG = {
    "ui_reduce_motion": False, "ui_contrast": False, "ui_scale": 1.0, "ui_captions": True, "ui_spin": 0.45,
    "home_name": "", "home_lat": "", "home_lon": "", "live_view": "off",
}
_BOOL = {"ui_reduce_motion", "ui_contrast", "ui_captions"}
# settings from the multi-provider version that no longer exist; removed from config.json on start
OBSOLETE = ("brain_provider", "brain_model", "brain_key", "brain_url", "brain_think", "brain_ctx", "tool_limit", "vision_model",
            "groq_key", "openrouter_key", "local_fallback", "stt_mode", "tts_mode", "tts_voice", "kokoro_voice", "kokoro_speed")


def coerce(key, value):
    if key in _BOOL:
        return value in (True, "true", "True", 1, "1")
    if key == "ui_scale":
        return max(0.8, min(1.6, float(value)))
    if key == "ui_spin":
        return max(0.05, min(1.5, float(value)))
    if key == "live_view":
        v = str(value).strip().lower()
        if v not in ("off", "screen", "camera"):
            raise ValueError("bad live view")
        return v
    if key in ("home_lat", "home_lon") and str(value).strip():
        v = float(value)
        if not (-180 <= v <= 180):
            raise ValueError("out of range")
        return round(v, 5)
    return str(value).strip()


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
        raise ModelError("HTTP %d: %s" % (e.code, str(detail)[:300]))
    except urllib.error.URLError as e:
        raise ModelError("Cannot reach %s (%s)." % (url.split("/")[2] if "//" in url else url, e.reason))


def geocode(place):
    """Place name -> (name, lat, lon) using Open-Meteo's free geocoder (no key)."""
    q = urllib.parse.quote(place.strip())
    j = _http("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + q, timeout=12)
    r = (j.get("results") or [None])[0]
    if not r:
        return None
    label = ", ".join(x for x in (r.get("name"), r.get("admin1"), r.get("country")) if x)
    return label, float(r["latitude"]), float(r["longitude"])


TEXT_MODELS = ("gemini-2.5-flash", "gemini-2.0-flash")


def gemini_text(cfg, system, prompt, max_tokens=1500, temperature=0.2):
    """One plain Gemini text answer (no tools), trying the user's worker model first."""
    from google import genai
    from google.genai import types
    key = (cfg.get("api_key") or "").strip()
    if not key:
        raise ModelError("Add your Gemini API key in Configuration.")
    client = genai.Client(api_key=key, http_options={"api_version": "v1beta"})
    last = None
    for m in dict.fromkeys([(cfg.get("worker_model") or "").strip(), *TEXT_MODELS]):
        if not m:
            continue
        for attempt in range(3):
            try:
                r = client.models.generate_content(model=m, contents=prompt, config=types.GenerateContentConfig(
                    system_instruction=system, temperature=temperature, max_output_tokens=max_tokens))
                return (r.text or "").strip()
            except Exception as e:
                last, msg = e, str(e)
                if any(k in msg for k in ("429", "503", "500", "UNAVAILABLE", "RESOURCE_EXHAUSTED")):
                    time.sleep(3 * (attempt + 1))
                    continue
                break
    raise ModelError("Gemini did not answer: %s" % str(last)[:200])
