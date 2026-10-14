"""WINNERS Bot video editing: real edits with FFmpeg (installed automatically), plus CapCut hand-off.

CapCut has no official automation interface, so WINNERS Bot does the editing itself with FFmpeg (exact and fast) and can then open
the result in CapCut for any final touches; he can also drive CapCut's own buttons with the screen tools when asked.

Every action writes a NEW file next to the input (the original is never changed) and returns its path, so edits can be chained.
"""
import json, os, platform, re, shutil, subprocess, tempfile, time
from pathlib import Path

IS_WIN = platform.system() == "Windows"
VIDEO_EXT = (".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".wmv", ".flv")

VIDEO_TOOLS = [{
    "name": "video_edit",
    "description": "Edit videos for real (FFmpeg). Each action makes a NEW file next to the input and returns its path; chain actions by "
                   "passing that path on. Actions: info (length, size, fps); trim (keep start..end); cut (remove ranges, e.g. '0:05-0:09, "
                   "1:20-1:31'); concat (join files in order); speed (factor, e.g. 2 or 0.5, audio kept in pitch); resize (aspect 9:16 for "
                   "TikTok/Shorts/Reels, 16:9, 1:1, 4:5, with a blurred background fill); text (title or caption: text, position top/centre/"
                   "bottom, start, end); captions (auto-transcribe speech and burn in subtitles; style 'tiktok' for big centred words); "
                   "music (add a music file under the video, volume 0-1, ducked under speech); remove_silence (cut pauses longer than "
                   "min_silence seconds); fade (fade in/out seconds); color (brightness, contrast, saturation e.g. 'vivid', 'cinematic', "
                   "'black and white'); rotate (90, 180, 270) and flip; crop (x,y,w,h); mute; audio (extract MP3); volume (factor); "
                   "reverse; compress (target_mb); gif (start, end); frame (save a still at a time); capcut (open CapCut with the video "
                   "ready to import, for manual polishing). Times may be seconds or m:ss.",
    "parameters": {"type": "OBJECT", "properties": {
        "action": {"type": "STRING", "description": "one of the actions above"},
        "input": {"type": "STRING", "description": "the video file (full path, or a name in Videos/Downloads/Desktop)"},
        "files": {"type": "STRING", "description": "concat: the files to join, separated by |"},
        "output": {"type": "STRING", "description": "optional output file name or path"},
        "start": {"type": "STRING", "description": "start time (s or m:ss)"},
        "end": {"type": "STRING", "description": "end time (s or m:ss)"},
        "ranges": {"type": "STRING", "description": "cut: ranges to remove, comma separated"},
        "factor": {"type": "NUMBER", "description": "speed / volume factor"},
        "aspect": {"type": "STRING", "description": "resize: 9:16, 16:9, 1:1 or 4:5"},
        "text": {"type": "STRING", "description": "text: the words to show"},
        "position": {"type": "STRING", "description": "text: top, centre or bottom"},
        "style": {"type": "STRING", "description": "captions: 'tiktok' or 'classic'; color: the look"},
        "music": {"type": "STRING", "description": "music: the audio file"},
        "volume": {"type": "NUMBER", "description": "music: music volume 0-1 (default 0.25)"},
        "seconds": {"type": "NUMBER", "description": "fade length, min_silence for remove_silence, time for frame"},
        "angle": {"type": "NUMBER", "description": "rotate: 90, 180 or 270"},
        "box": {"type": "STRING", "description": "crop: x,y,w,h in pixels"},
        "target_mb": {"type": "NUMBER", "description": "compress: target size in MB"},
    }, "required": ["action"]},
}]
VIDEO_NAMES = {t["name"] for t in VIDEO_TOOLS}

LOOKS = {"vivid": "eq=saturation=1.35:contrast=1.08", "cinematic": "eq=contrast=1.12:saturation=0.85:gamma=0.95,curves=preset=medium_contrast",
         "black and white": "hue=s=0", "bw": "hue=s=0", "warm": "colortemperature=temperature=5200", "cool": "colortemperature=temperature=8000",
         "bright": "eq=brightness=0.06:gamma=1.08", "dark": "eq=brightness=-0.06", "vintage": "curves=preset=vintage", "sepia":
         "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"}


def secs(t):
    t = str(t or "").strip()
    if not t:
        return None
    parts = [float(p) for p in t.replace(",", ".").split(":")]
    v = 0.0
    for p in parts:
        v = v * 60 + p
    return v


class Video:
    def __init__(self, core, resolve):
        self.core, self.resolve = core, resolve
        self._ff = None

    # ---- ffmpeg ----
    def ff(self):
        if self._ff:
            return self._ff
        exe = shutil.which("ffmpeg")
        if not exe:
            import jv_auto
            mod = jv_auto.ensure("imageio-ffmpeg", "imageio_ffmpeg", self.core)
            exe = mod.get_ffmpeg_exe()
        self._ff = exe
        return exe

    def run(self, args, timeout=3600):
        self.core.ui({"t": "act", "text": "VIDEO  ·  rendering"})
        r = subprocess.run([self.ff(), "-hide_banner", "-y", *args], capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout)
        if r.returncode != 0:
            err = [l for l in r.stderr.splitlines() if l.strip() and not l.startswith("  ")][-4:]
            raise RuntimeError("FFmpeg failed: " + " | ".join(err)[:400])
        return r.stderr

    def probe(self, f):
        r = subprocess.run([self.ff(), "-hide_banner", "-i", str(f)], capture_output=True, text=True, encoding="utf-8", errors="replace")
        e = r.stderr
        m = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", e)
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
        v = re.search(r"Video: [^\n]*?(\d{2,5})x(\d{2,5})[^\n]*?(?:(\d+(?:\.\d+)?) fps)?", e)
        fps = re.search(r"(\d+(?:\.\d+)?) fps", e)
        return {"duration": dur, "width": int(v.group(1)) if v else 0, "height": int(v.group(2)) if v else 0,
                "fps": float(fps.group(1)) if fps else 30.0, "audio": "Audio:" in e}

    # ---- files ----
    def find(self, name):
        name = str(name or "").strip().strip('"')
        if not name:
            raise ValueError("Say which video (a path, or its name in Videos, Downloads or Desktop).")
        p = Path(self.resolve(name))
        if p.exists():
            return p
        stem = Path(name).stem.lower()
        for root in (Path.home() / "Videos", Path.home() / "Downloads", Path.home() / "Desktop", Path.home() / "Videos" / "Captures"):
            if root.exists():
                hits = [h for h in root.rglob("*") if h.suffix.lower() in VIDEO_EXT + (".mp3", ".wav", ".m4a") and stem in h.stem.lower()]
                if hits:
                    return max(hits, key=lambda h: h.stat().st_mtime)
        raise FileNotFoundError("No video called %s found." % name)

    def out(self, src, tag, output="", ext=None):
        if output:
            o = Path(self.resolve(output))
            if not o.suffix:
                o = o.with_suffix(ext or src.suffix or ".mp4")
            if not o.is_absolute() or str(o.parent) in ("", "."):
                o = src.parent / o.name
            return o
        o = src.parent / ("%s - %s%s" % (src.stem, tag, ext or ".mp4"))
        n = 2
        while o.exists():
            o = src.parent / ("%s - %s %d%s" % (src.stem, tag, n, ext or ".mp4"))
            n += 1
        return o

    ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]

    # ---- captions via Gemini speech recognition ----
    def transcribe(self, src):
        import jv_models
        tmp = Path(tempfile.mkdtemp())
        mp3 = tmp / "a.mp3"
        self.run(["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", str(mp3)])
        data = mp3.read_bytes()
        if len(data) > 19_000_000:
            raise RuntimeError("The audio is too long to transcribe in one go (over about 80 minutes).")
        txt = jv_models.gemini_text(self.core.cfg, "You transcribe speech precisely.",
                                    "Transcribe this audio as SRT subtitles. Short cues of at most 7 words, accurate timestamps "
                                    "(HH:MM:SS,mmm), the exact words spoken, no speaker names. Output only the SRT.",
                                    max_tokens=16000, temperature=0.0, media=[(data, "audio/mp3")])
        txt = re.sub(r"^```\w*\n?|```$", "", txt.strip(), flags=re.M).strip()
        if "-->" not in txt:
            raise RuntimeError("No speech was recognised.")
        return txt

    def handle(self, name, a):
        if name not in VIDEO_NAMES:
            return None
        act = str(a.get("action") or "").lower().replace(" ", "_")
        try:
            return self._do(act, a)
        except subprocess.TimeoutExpired:
            return "The render took too long and was stopped."
        except Exception as e:
            return "Video %s failed: %s" % (act, str(e)[:400])

    def _do(self, act, a):
        if act == "concat":
            files = [self.find(f) for f in str(a.get("files") or a.get("input") or "").split("|") if f.strip()]
            if len(files) < 2:
                return "Give at least two files, separated by |."
            o = self.out(files[0], "joined", str(a.get("output") or ""))
            info = self.probe(files[0])
            w, h = (info["width"] or 1920) // 2 * 2, (info["height"] or 1080) // 2 * 2
            ins, fl = [], ""
            for i, f in enumerate(files):
                ins += ["-i", str(f)]
                has_a = self.probe(f)["audio"]
                fl += "[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=%g[v%d];" % (i, w, h, w, h, info["fps"] or 30, i)
                fl += ("[%d:a]aresample=48000,aformat=channel_layouts=stereo[a%d];" % (i, i)) if has_a else \
                      ("anullsrc=r=48000:cl=stereo,atrim=0:%f[a%d];" % (self.probe(f)["duration"], i))
            fl += "".join("[v%d][a%d]" % (i, i) for i in range(len(files))) + "concat=n=%d:v=1:a=1[v][a]" % len(files)
            self.run(ins + ["-filter_complex", fl, "-map", "[v]", "-map", "[a]", *self.ENC, str(o)])
            return "Joined %d clips into %s." % (len(files), o)

        src = self.find(a.get("input"))
        info = self.probe(src)
        D = info["duration"]
        if act == "info":
            return "%s: %s long, %dx%d, %.3g fps, %s audio, %.1f MB." % (src.name, time.strftime("%M:%S", time.gmtime(D)), info["width"], info["height"],
                                                                       info["fps"], "with" if info["audio"] else "no", src.stat().st_size / 1e6)
        output = str(a.get("output") or "")
        if act == "capcut":
            return self.capcut(src)
        if act == "trim":
            s, e = secs(a.get("start")) or 0, secs(a.get("end")) or D
            o = self.out(src, "trimmed", output)
            self.run(["-i", str(src), "-ss", str(s), "-to", str(e), *self.ENC, str(o)])
            return "Trimmed to %.1fs-%.1fs: %s" % (s, e, o)
        if act == "cut":
            rm = []
            for part in re.split(r"[,;]", str(a.get("ranges") or "")):
                m = re.match(r"\s*([\d:.]+)\s*(?:-|to)\s*([\d:.]+)\s*$", part)
                if m:
                    rm.append((secs(m.group(1)), secs(m.group(2))))
            if not rm:
                return "Give the ranges to remove, e.g. '0:05-0:09, 1:20-1:31'."
            keep, t = [], 0.0
            for s, e in sorted(rm):
                if s > t:
                    keep.append((t, s))
                t = max(t, e)
            if t < D:
                keep.append((t, D))
            return self._keep(src, keep, info, self.out(src, "cut", output), "Removed %d section(s)" % len(rm))
        if act == "speed":
            f = max(0.25, min(8.0, float(a.get("factor") or 2)))
            o = self.out(src, "%gx" % f, output)
            at, r = [], f
            while r > 2:
                at.append("atempo=2"); r /= 2
            while r < 0.5:
                at.append("atempo=0.5"); r /= 0.5
            at.append("atempo=%g" % r)
            args = ["-i", str(src), "-filter:v", "setpts=PTS/%g" % f]
            args += ["-filter:a", ",".join(at)] if info["audio"] else ["-an"]
            self.run(args + self.ENC + [str(o)])
            return "Made it %gx speed: %s" % (f, o)
        if act == "resize":
            asp = str(a.get("aspect") or "9:16")
            m = re.match(r"(\d+)\s*[:x/]\s*(\d+)", asp)
            aw, ah = (int(m.group(1)), int(m.group(2))) if m else (9, 16)
            H = 1920 if ah >= aw else 1080
            W = int(round(H * aw / ah / 2)) * 2
            o = self.out(src, asp.replace(":", "x"), output)
            fl = ("[0:v]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,boxblur=20:2[bg];"
                  "[0:v]scale=%d:%d:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]") % (W, H, W, H, W, H)
            self.run(["-i", str(src), "-filter_complex", fl, "-map", "[v]", "-map", "0:a?", *self.ENC, str(o)])
            return "Resized to %s (%dx%d) with a blurred background: %s" % (asp, W, H, o)
        if act == "text":
            txt = str(a.get("text") or "").strip()
            if not txt:
                return "Give the text to show."
            pos = str(a.get("position") or "bottom").lower()
            y = {"top": "h*0.08", "centre": "(h-text_h)/2", "center": "(h-text_h)/2", "middle": "(h-text_h)/2"}.get(pos, "h*0.86-text_h")
            s, e = secs(a.get("start")) or 0, secs(a.get("end")) or D
            tf = Path(tempfile.mkdtemp()) / "t.txt"
            tf.write_text(txt, encoding="utf-8")
            size = max(24, int((info["height"] or 1080) / 18))
            dt = ("drawtext=textfile='%s':fontcolor=white:fontsize=%d:borderw=4:bordercolor=black@0.85:x=(w-text_w)/2:y=%s:"
                  "enable='between(t,%g,%g)'%s") % (self._esc(tf), size, y, s, e, self._font())
            o = self.out(src, "text", output)
            self.run(["-i", str(src), "-vf", dt, *self.ENC, str(o)])
            return "Added the text: %s" % o
        if act == "captions":
            srt = self.transcribe(src)
            tmp = Path(tempfile.mkdtemp())
            (tmp / "subs.srt").write_text(srt, encoding="utf-8")
            keep = src.with_suffix(".srt")
            try:
                keep.write_text(srt, encoding="utf-8")
            except Exception:
                keep = None
            tiktok = "tik" in str(a.get("style") or "").lower() or (info["height"] > info["width"])
            style = ("Fontname=Arial Black,Fontsize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,"
                     "Alignment=2,MarginV=80,Bold=1") if tiktok else ("Fontname=Arial,Fontsize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                                                                     "BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=28")
            o = self.out(src, "captions", output)
            # run inside the temp folder so the subtitles path needs no escaping (Windows drive colons break the filter)
            r = subprocess.run([self.ff(), "-hide_banner", "-y", "-i", str(src), "-vf", "subtitles=subs.srt:force_style='%s'" % style, *self.ENC, str(o)],
                               cwd=str(tmp), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=3600)
            if r.returncode != 0:
                raise RuntimeError("burning subtitles failed: " + r.stderr.strip().splitlines()[-1][:300])
            return "Added captions: %s%s" % (o, (" (subtitle file: %s)" % keep) if keep else "")
        if act == "music":
            mus = self.find(a.get("music"))
            vol = max(0.0, min(1.5, float(a.get("volume") if a.get("volume") is not None else 0.25)))
            o = self.out(src, "music", output)
            if info["audio"]:
                fl = ("[1:a]volume=%g,aloop=loop=-1:size=2e9,atrim=0:%f[m];[m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[d];"
                      "[0:a][d]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]") % (vol, D)
            else:
                fl = "[1:a]volume=%g,aloop=loop=-1:size=2e9,atrim=0:%f[a]" % (vol, D)
            self.run(["-i", str(src), "-i", str(mus), "-filter_complex", fl, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                      "-shortest", str(o)])
            return "Added %s as background music (ducked under speech): %s" % (mus.name, o)
        if act == "remove_silence":
            if not info["audio"]:
                return "This video has no audio to find pauses in."
            ms = float(a.get("seconds") or 0.6)
            log = self.run(["-i", str(src), "-af", "silencedetect=noise=-32dB:d=%g" % ms, "-f", "null", "-"])
            starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
            ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
            gaps = [(s + 0.12, e - 0.12) for s, e in zip(starts, ends) if e - s > ms]
            if not gaps:
                return "No pauses longer than %gs found." % ms
            keep, t = [], 0.0
            for s, e in gaps:
                if s > t:
                    keep.append((t, s))
                t = e
            if t < D:
                keep.append((t, D))
            return self._keep(src, keep, info, self.out(src, "tight", output), "Removed %d pauses (%.1fs saved)" % (len(gaps), sum(e - s for s, e in gaps)))
        if act == "fade":
            f = float(a.get("seconds") or 1)
            o = self.out(src, "fade", output)
            vf = "fade=t=in:st=0:d=%g,fade=t=out:st=%g:d=%g" % (f, max(0, D - f), f)
            args = ["-i", str(src), "-vf", vf]
            args += ["-af", "afade=t=in:st=0:d=%g,afade=t=out:st=%g:d=%g" % (f, max(0, D - f), f)] if info["audio"] else []
            self.run(args + self.ENC + [str(o)])
            return "Added %gs fades: %s" % (f, o)
        if act == "color":
            look = str(a.get("style") or "vivid").lower()
            vf = LOOKS.get(look) or next((v for k, v in LOOKS.items() if k in look), LOOKS["vivid"])
            o = self.out(src, look.replace(" ", "-"), output)
            self.run(["-i", str(src), "-vf", vf, *self.ENC, str(o)])
            return "Applied the %s look: %s" % (look, o)
        if act in ("rotate", "flip"):
            if act == "flip":
                vf = "hflip"
            else:
                vf = {90: "transpose=1", 180: "transpose=1,transpose=1", 270: "transpose=2"}.get(int(float(a.get("angle") or 90)), "transpose=1")
            o = self.out(src, act, output)
            self.run(["-i", str(src), "-vf", vf, *self.ENC, str(o)])
            return "Done: %s" % o
        if act == "crop":
            nums = [int(float(x)) for x in re.findall(r"[\d.]+", str(a.get("box") or ""))]
            if len(nums) != 4:
                return "Give the crop box as x,y,w,h."
            x, y, w, h = nums
            o = self.out(src, "crop", output)
            self.run(["-i", str(src), "-vf", "crop=%d:%d:%d:%d" % (w // 2 * 2, h // 2 * 2, x, y), *self.ENC, str(o)])
            return "Cropped: %s" % o
        if act == "mute":
            o = self.out(src, "muted", output)
            self.run(["-i", str(src), "-c:v", "copy", "-an", str(o)])
            return "Removed the audio: %s" % o
        if act == "volume":
            f = float(a.get("factor") or 1.5)
            o = self.out(src, "volume", output)
            self.run(["-i", str(src), "-c:v", "copy", "-af", "volume=%g" % f, "-c:a", "aac", "-b:a", "192k", str(o)])
            return "Volume x%g: %s" % (f, o)
        if act == "audio":
            o = self.out(src, "audio", output, ".mp3")
            self.run(["-i", str(src), "-vn", "-c:a", "libmp3lame", "-q:a", "2", str(o)])
            return "Extracted the audio: %s" % o
        if act == "reverse":
            if D > 120:
                return "Reverse works on clips up to 2 minutes; trim it first."
            o = self.out(src, "reversed", output)
            self.run(["-i", str(src), "-vf", "reverse"] + (["-af", "areverse"] if info["audio"] else []) + self.ENC + [str(o)])
            return "Reversed: %s" % o
        if act == "compress":
            mb = float(a.get("target_mb") or 25)
            kbps = max(150, int(mb * 8192 / max(1, D) - 128))
            o = self.out(src, "small", output)
            self.run(["-i", str(src), "-c:v", "libx264", "-preset", "medium", "-b:v", "%dk" % kbps, "-maxrate", "%dk" % int(kbps * 1.3),
                      "-bufsize", "%dk" % (kbps * 2), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(o)])
            return "Compressed to %.1f MB: %s" % (o.stat().st_size / 1e6, o)
        if act == "gif":
            s, e = secs(a.get("start")) or 0, secs(a.get("end")) or min(D, 6)
            o = self.out(src, "gif", output, ".gif")
            self.run(["-ss", str(s), "-t", str(e - s), "-i", str(src), "-vf",
                      "fps=15,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", str(o)])
            return "Made a GIF: %s" % o
        if act == "frame":
            t = secs(a.get("start")) if a.get("start") else float(a.get("seconds") or D / 2)
            o = self.out(src, "frame", output, ".png")
            self.run(["-ss", str(t), "-i", str(src), "-frames:v", "1", str(o)])
            return "Saved the frame: %s" % o
        return "Unknown action %s." % act

    def _keep(self, src, keep, info, o, what):
        keep = [(s, e) for s, e in keep if e - s > 0.05]
        if not keep:
            return "Nothing would be left."
        fl = ""
        for i, (s, e) in enumerate(keep):
            fl += "[0:v]trim=%f:%f,setpts=PTS-STARTPTS[v%d];" % (s, e, i)
            if info["audio"]:
                fl += "[0:a]atrim=%f:%f,asetpts=PTS-STARTPTS[a%d];" % (s, e, i)
        n = len(keep)
        if info["audio"]:
            fl += "".join("[v%d][a%d]" % (i, i) for i in range(n)) + "concat=n=%d:v=1:a=1[v][a]" % n
            maps = ["-map", "[v]", "-map", "[a]"]
        else:
            fl += "".join("[v%d]" % i for i in range(n)) + "concat=n=%d:v=1:a=0[v]" % n
            maps = ["-map", "[v]"]
        script = Path(tempfile.mkdtemp()) / "f.txt"
        script.write_text(fl, encoding="utf-8")
        self.run(["-i", str(src), "-filter_complex_script", str(script), *maps, *self.ENC, str(o)])
        return "%s: %s (now %s long)." % (what, o, time.strftime("%M:%S", time.gmtime(sum(e - s for s, e in keep))))

    @staticmethod
    def _esc(p):
        return str(p).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")

    def _font(self):
        for f in (r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\segoeuib.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
            if os.path.exists(f):
                return ":fontfile='%s'" % self._esc(f)
        return ""

    # ---- CapCut ----
    def capcut(self, src):
        import jv_win
        app = jv_win.find_app("CapCut")
        if not app:
            exe = next((p for p in (Path(os.environ.get("LOCALAPPDATA", "")) / "CapCut" / "Apps" / "CapCut.exe",) if p.exists()), None)
            if not exe:
                return "CapCut is not installed. It is free from capcut.com; the edits I make work without it."
            os.startfile(str(exe))
        else:
            jv_win.launch(app)
        try:
            if IS_WIN:
                subprocess.run(["powershell", "-NoProfile", "-Command", "Set-Clipboard -Path $env:JV_F"], env={**os.environ, "JV_F": str(src)},
                               timeout=15)
        except Exception:
            pass
        return ("CapCut is opening and %s is on the clipboard as a file: in CapCut start a New project, then press Ctrl+V (or Import) "
                "to bring it in. If the user wants, use the screen tools to click New project and paste it." % src.name)
