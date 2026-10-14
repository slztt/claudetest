"""WINNERS Bot calendar: recurring events, natural-language quick add, holidays, weather, moon phases, free-time finder,
.ics import/export, spoken reminders, and the data behind the holographic month / week / day / agenda / year views.

Data stays in ~/.winnersbot/personal/calendar.json (the WINNERS Bot file, upgraded in place: old events keep working).
Holidays come from Nager.Date and the forecast from Open-Meteo (both free, no key); both are cached and both are
skipped in offline mode.
"""
import calendar as _cal
import datetime as dt
import json, locale, math, re, threading, time, urllib.request
from pathlib import Path

CATS = {  # name: (colour, keywords that suggest it)
    "work": ("#55dcff", "meeting standup stand-up call sync review interview presentation demo client office deadline 1:1 one-on-one"),
    "personal": ("#9be7a1", "errand shopping haircut bank pick up collect clean"),
    "health": ("#ff7a8a", "gym doctor dentist workout run yoga therapy physio hospital appointment gp swim"),
    "social": ("#ffb347", "dinner lunch breakfast drinks party coffee date brunch bbq game night pub"),
    "travel": ("#c9a2ff", "flight train trip airport hotel drive travel holiday vacation ferry"),
    "birthday": ("#ff8fc8", "birthday bday anniversary"),
    "focus": ("#7dffd3", "focus deep work study revise revision write coding"),
    "other": ("#a9c6da", ""),
}
CAL_CFG = {"holiday_country": "", "work_start": "09:00", "work_end": "18:00", "week_start": 0, "cal_weather": True}
FREQS = ("daily", "weekdays", "weekly", "monthly", "yearly")
WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WD_SHORT = {w[:3]: i for i, w in enumerate(WD)} | {"tues": 1, "weds": 2, "thur": 3, "thurs": 3}
MONTHS = {m.lower(): i for i, m in enumerate(_cal.month_name) if m} | {m.lower(): i for i, m in enumerate(_cal.month_abbr) if m} | {"sept": 9}
FMT = "%Y-%m-%d %H:%M"


def parse_dt(s):
    s = str(s or "").strip().replace("T", " ")
    for f in (FMT, "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s, f)
        except ValueError:
            pass
    raise ValueError("Use the format YYYY-MM-DD HH:MM")


def fmt(d):
    return d.strftime(FMT)


def guess_cat(text):
    t = " " + text.lower() + " "
    for name, (_, words) in CATS.items():
        if any(re.search(r"\b" + re.escape(w) + r"\b", t) for w in words.split()):
            return name
    return "other"


def moon_phase(d):
    """0..1 (0 new, 0.5 full) for a date, from the mean synodic month (good to about half a day)."""
    ref = dt.datetime(2000, 1, 6, 18, 14)
    days = (dt.datetime(d.year, d.month, d.day, 12) - ref).total_seconds() / 86400
    return (days % 29.530588853) / 29.530588853


def moon_name(p):
    names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"]
    return names[int((p * 8) + 0.5) % 8]


# ---------------------------------------------------------------------------------------------
# Natural-language quick add: "Lunch with Sam friday 1pm for 90 min at Nando's every week remind me 15 min before"
# ---------------------------------------------------------------------------------------------
def _time(h, m, ap):
    h, m = int(h), int(m or 0)
    ap = (ap or "").lower().replace(".", "")
    if ap in ("pm", "p") and h < 12:
        h += 12
    if ap in ("am", "a") and h == 12:
        h = 0
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError("bad time")
    return h, m


TIME_RE = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?"


def parse_quick(text, now=None, week_start=0):
    """Returns a dict ready for Calendar.add, plus 'parsed' notes. Raises ValueError when no date/time is found at all."""
    now = now or dt.datetime.now()
    s = " " + re.sub(r"\s+", " ", text.strip()) + " "
    out = {"remind_min": None, "recur": None, "location": "", "all_day": False}
    day, t1, t2, dur = None, None, None, None

    def cut(pattern, fn, flags=re.I):
        nonlocal s
        m = re.search(pattern, s, flags)
        if m:
            fn(m)
            s = s[:m.start()] + " " + s[m.end():]
            return True
        return False

    # reminders
    cut(r"\bremind(?: me)?\s+(\d+)\s*(min|mins|minutes|m|hours?|hrs?|h|days?|d)\s+(?:before|early|earlier)\b",
        lambda m: out.__setitem__("remind_min", int(m.group(1)) * {"h": 60, "d": 1440}.get(m.group(2)[0].lower(), 1)))
    cut(r"\b(?:no reminder|don'?t remind me)\b", lambda m: out.__setitem__("remind_min", -1))
    # recurrence
    rec = {}

    def set_rec(m):
        w = m.group(1).lower()
        if w in ("day", "daily"):
            rec["freq"] = "daily"
        elif w in ("weekday", "weekdays", "working day", "work day"):
            rec["freq"] = "weekdays"
        elif w in ("week", "weekly"):
            rec["freq"] = "weekly"
        elif w in ("month", "monthly"):
            rec["freq"] = "monthly"
        elif w in ("year", "yearly", "annually"):
            rec["freq"] = "yearly"
    cut(r"\b(?:every|each)\s+(day|weekday|weekdays|working day|work day|week|month|year)\b", set_rec)
    cut(r"\b(daily|weekly|monthly|yearly|annually)\b", set_rec)
    m = re.search(r"\b(?:every|each)\s+((?:(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)[a-z]*(?:\s*(?:,|and|&)\s*)?)+)", s, re.I)
    if m:
        days = sorted({WD_SHORT[w[:3].lower()] if w[:3].lower() in WD_SHORT else WD_SHORT.get(w[:4].lower(), 0)
                       for w in re.findall(r"(mon|tue|wed|thu|fri|sat|sun)", m.group(1), re.I)})
        rec.update({"freq": "weekly", "days": days})
        s = s[:m.start()] + " " + s[m.end():]
    m = re.search(r"\bevery\s+(\d+)\s+(days|weeks|months|years)\b", s, re.I)
    if m:
        rec.update({"freq": {"d": "daily", "w": "weekly", "m": "monthly", "y": "yearly"}[m.group(2)[0].lower()], "interval": int(m.group(1))})
        s = s[:m.start()] + " " + s[m.end():]
    cut(r"\b(\d+)\s+times\b", lambda m: rec.__setitem__("count", int(m.group(1))))

    # explicit dates
    def set_day(d):
        nonlocal day
        day = d

    def resolve_md(mon, dd, yy=None):
        y = int(yy) if yy else now.year
        if y < 100:
            y += 2000
        d = dt.date(y, mon, dd)
        if not yy and d < now.date():
            d = dt.date(y + 1, mon, dd)
        return d
    until = None
    mu = re.search(r"\buntil\s+(.+?)(?=\s+(?:at|for|from|remind|every)\b|\s*$)", s, re.I)
    if mu:
        try:
            until = parse_quick_date(mu.group(1), now)
            s = s[:mu.start()] + " " + s[mu.end():]
        except ValueError:
            pass
    cut(r"\b(\d{4})-(\d{2})-(\d{2})\b", lambda m: set_day(dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))))
    if day is None:
        mon_names = "|".join(sorted(MONTHS, key=len, reverse=True))
        cut(r"\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(" + mon_names + r")\.?(?:,?\s+(\d{4}))?\b",
            lambda m: set_day(resolve_md(MONTHS[m.group(2).lower()], int(m.group(1)), m.group(3))))
    if day is None:
        cut(r"\b(?:on\s+)?(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b",
            lambda m: set_day(resolve_md(MONTHS[m.group(1).lower()], int(m.group(2)), m.group(3))))
    if day is None:  # 14/3 or 14/03/2027 (day first, as in the UK); 3/14 style is caught when the "day" is over 12
        def dmy(m):
            a, b = int(m.group(1)), int(m.group(2))
            dd, mm = (a, b) if a > 12 or b <= 12 else (b, a)
            set_day(resolve_md(mm, dd, m.group(3)))
        cut(r"\b(?:on\s+)?(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", dmy)
    if day is None:
        cut(r"\bday after tomorrow\b", lambda m: set_day(now.date() + dt.timedelta(days=2)))
    if day is None:
        cut(r"\b(today|tonight|this evening|this afternoon|this morning)\b", lambda m: (set_day(now.date()), _daypart(m.group(1), out)))
    if day is None:
        cut(r"\b(tomorrow|tmrw|tmr)(?:\s+(morning|afternoon|evening|night))?\b", lambda m: (set_day(now.date() + dt.timedelta(days=1)), _daypart(m.group(2) or "", out)))
    if day is None:
        cut(r"\bin\s+(\d+)\s+(days?|weeks?)\b", lambda m: set_day(now.date() + dt.timedelta(days=int(m.group(1)) * (7 if m.group(2)[0] == "w" else 1))))
    if day is None:
        def wd(m):
            delta = (WD_SHORT[m.group(2)[:3].lower()] - now.weekday()) % 7
            if delta == 0 and (m.group(1) or "").lower() == "next":
                delta = 7                                  # "next Friday" on a Friday means a week today
            set_day(now.date() + dt.timedelta(days=delta))
        cut(r"\b(?:on\s+)?(next|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b", wd)
    if day is None:
        cut(r"\bnext week\b", lambda m: set_day(now.date() + dt.timedelta(days=(week_start - now.weekday()) % 7 or 7)))
    if day is None:
        cut(r"\bnext month\b", lambda m: set_day((now.date().replace(day=1) + dt.timedelta(days=32)).replace(day=1)))

    # times and ranges
    def rng(m):
        nonlocal t1, t2
        ap2 = m.group(6)
        ap1 = m.group(3) or (ap2 if ap2 and int(m.group(1)) <= int(m.group(4)) else None)
        t1, t2 = _time(m.group(1), m.group(2), ap1), _time(m.group(4), m.group(5), ap2)
    if not cut(r"\b(?:from\s+)?" + TIME_RE + r"\s*(?:-|–|to|until|till)\s*" + TIME_RE + r"(?=\s|$)", rng):
        def single(m):
            nonlocal t1
            t1 = _time(m.group(1), m.group(2), m.group(3))
        if not cut(r"\b(?:at|@)\s*" + TIME_RE + r"(?=\s|$)", single):
            if not cut(r"\b(\d{1,2}):(\d{2})\s*(am|pm)?(?=\s|$)", single):
                cut(r"\b(\d{1,2})()\s*(am|pm)\b", single)
    cut(r"\b(?:at\s+)?noon\b", lambda m: _set(out, "_t", (12, 0)))
    cut(r"\b(?:at\s+)?midnight\b", lambda m: _set(out, "_t", (0, 0)))
    cut(r"\b(?:in the\s+)?(morning|afternoon|evening)\b", lambda m: _daypart(m.group(1), out))
    if t1 is None and out.get("_t"):
        t1 = out["_t"]

    def dur_h(m):
        nonlocal dur
        dur = int(float(m.group(1)) * 60) + int(m.group(2) or 0)

    def dur_m(m):
        nonlocal dur
        dur = int(m.group(1))

    def dur_set(v):
        nonlocal dur
        dur = v
    if not cut(r"\bfor\s+(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)(?:\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minutes))?\b", dur_h):
        if not cut(r"\bfor\s+(\d+)\s*(?:m|min|mins|minutes)\b", dur_m) and not cut(r"\bfor\s+(\d+)h(\d{1,2})\b", dur_h):
            if not cut(r"\bfor\s+(?:an?|one)\s+hour\b", lambda m: dur_set(60)):
                cut(r"\bfor\s+half\s+an?\s+hour\b", lambda m: dur_set(30))
    if dur is None and t1 and t2:
        dur = (t2[0] * 60 + t2[1]) - (t1[0] * 60 + t1[1])
        if dur <= 0:
            dur += 1440

    # location: "at X" / "@ X" / "in X" left over after times are gone
    cut(r"\s(?:at|@)\s+([A-Z0-9][\w'&.\- ]{1,60}?)(?=\s+(?:on|with|for|every|remind)\b|\s*$)", lambda m: out.__setitem__("location", m.group(1).strip()), flags=0)

    if day is None and t1 is None:
        raise ValueError("I could not find a date or time in that.")
    if day is None:
        day = now.date()
        if dt.datetime.combine(day, dt.time(*t1)) < now:
            day += dt.timedelta(days=1)
    title = re.sub(r"\s+", " ", re.sub(r"\b(on|at|from|for|the|and)\s*$", "", s.strip(" ,.-")).strip(" ,.-"))
    title = re.sub(r"^(?:add|schedule|create|new)\s+(?:an?\s+)?(?:event\s+)?(?:for\s+)?", "", title, flags=re.I)
    title = title[:1].upper() + title[1:] if title else "Event"
    cat = guess_cat(text)
    if t1 is None:
        out.update({"all_day": True, "start": day.strftime("%Y-%m-%d") + " 00:00", "duration_min": 1440})
    else:
        out.update({"start": fmt(dt.datetime.combine(day, dt.time(*t1))), "duration_min": dur or 60})
    if cat == "birthday" and not rec:
        rec = {"freq": "yearly"}
    if rec:
        if until:
            rec["until"] = until.isoformat()
        out["recur"] = rec
    out.update({"title": title, "cat": cat})
    out.pop("_t", None)
    return out


def _set(d, k, v):
    d[k] = v


def _daypart(word, out):
    w = (word or "").lower()
    if "morning" in w:
        out.setdefault("_t", (9, 0))
    elif "afternoon" in w:
        out.setdefault("_t", (14, 0))
    elif "evening" in w or "tonight" in w or "night" in w:
        out.setdefault("_t", (19, 0))


def parse_quick_date(text, now=None):
    d = parse_quick(text + " ", now)
    return parse_dt(d["start"]).date()


# ---------------------------------------------------------------------------------------------
class Calendar:
    def __init__(self, core, folder):
        self.core, self.dir = core, Path(folder)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.file = self.dir / "calendar.json"
        self.lock = threading.RLock()
        self.reminded = set()
        self._cache = {}
        threading.Thread(target=self._reminders, daemon=True).start()

    # ---- storage ----
    def load(self):
        try:
            evs = json.loads(self.file.read_text(encoding="utf-8"))
        except Exception:
            evs = []
        for e in evs:  # upgrade WINNERS Bot events in place
            e.setdefault("all_day", False); e.setdefault("location", ""); e.setdefault("notes", "")
            e.setdefault("cat", guess_cat(e.get("title", ""))); e.setdefault("recur", None); e.setdefault("exdates", [])
            e.setdefault("remind", 10)
        return evs

    def save(self, evs):
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps(evs, indent=1, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.file)
        try:
            self.core.ui({"t": "calendar_changed"})
        except Exception:
            pass

    def cfg(self, k):
        return self.core.cfg.get(k, CAL_CFG.get(k))

    # ---- recurrence ----
    @staticmethod
    def occurrences(e, a, b, limit=2000):
        """Every occurrence of event e that overlaps [a, b)."""
        s0, e0 = parse_dt(e["start"]), parse_dt(e["end"])
        dur = e0 - s0
        r = e.get("recur") or None
        ex = set(e.get("exdates") or [])
        if not r or r.get("freq") not in FREQS:
            return [(s0, e0)] if s0 < b and e0 > a else []
        f, iv = r["freq"], max(1, int(r.get("interval") or 1))
        until = parse_dt(r["until"]).replace(hour=23, minute=59) if r.get("until") else None
        count = int(r.get("count") or 0)
        days = sorted(set(int(x) for x in (r.get("days") or []))) if f == "weekly" else []
        out, n, cur, i, step = [], 0, s0, 0, 0

        def emit(st):
            nonlocal n
            n += 1
            if st.strftime("%Y-%m-%d") not in ex and st < b and st + dur > a:
                out.append((st, st + dur))

        while i < limit:
            i += 1
            if until and cur > until or count and n >= count or cur >= b:
                break
            if f == "weekly" and days:
                week0 = cur - dt.timedelta(days=cur.weekday())
                for d in days:
                    st = week0 + dt.timedelta(days=d)
                    if st < s0 or (until and st > until) or (count and n >= count) or st >= b:
                        continue
                    emit(st)
                cur = week0 + dt.timedelta(weeks=iv)
                continue
            if f == "weekdays" and cur.weekday() >= 5:
                cur += dt.timedelta(days=1)
                continue
            emit(cur)
            if f in ("daily", "weekdays"):
                cur += dt.timedelta(days=iv if f == "daily" else 1)
            elif f == "weekly":
                cur += dt.timedelta(weeks=iv)
            elif f == "monthly":
                while True:  # same day of the month; months without that day are skipped
                    step += 1
                    mm = s0.month - 1 + step * iv
                    y, m = s0.year + mm // 12, mm % 12 + 1
                    if s0.day <= _cal.monthrange(y, m)[1]:
                        cur = s0.replace(year=y, month=m)
                        break
            elif f == "yearly":
                while True:  # 29 February only repeats in leap years
                    step += 1
                    y = s0.year + step * iv
                    if not (s0.month == 2 and s0.day == 29) or _cal.isleap(y):
                        cur = s0.replace(year=y)
                        break
        return out

    def expand(self, a, b, evs=None):
        rows = []
        for e in (evs if evs is not None else self.load()):
            for s, en in self.occurrences(e, a, b):
                rows.append({**e, "oid": e["id"] + "@" + s.strftime("%Y-%m-%d"), "ostart": fmt(s), "oend": fmt(en),
                             "color": CATS.get(e.get("cat"), CATS["other"])[0], "recurring": bool(e.get("recur"))})
        rows.sort(key=lambda r: (not r.get("all_day"), r["ostart"]))
        return rows

    # ---- external data ----
    def country(self):
        c = (self.cfg("holiday_country") or "").strip().upper()
        if c:
            return c
        try:
            loc = locale.getlocale()[0] or locale.getdefaultlocale()[0] or ""
        except Exception:
            loc = ""
        m = re.search(r"[_-]([A-Z]{2})", loc or "")
        if m:
            return m.group(1)
        m = re.search(r"_(\w+)", loc or "")
        return {"United Kingdom": "GB", "United States": "US"}.get(m.group(1) if m else "", "US")

    def _fetch_json(self, url, cache_name, max_age):
        p = self.dir / cache_name
        if p.exists() and time.time() - p.stat().st_mtime < max_age:
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass
        if self.core.cfg.get("offline_mode"):
            return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "WINNERS Bot"}), timeout=10) as r:
                data = json.loads(r.read().decode("utf-8"))
            p.write_text(json.dumps(data), encoding="utf-8")
            return data
        except Exception:
            try:
                return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
            except Exception:
                return None

    def holidays(self, year):
        cc = self.country()
        data = self._fetch_json("https://date.nager.at/api/v3/PublicHolidays/%d/%s" % (year, cc), "holidays-%s-%d.json" % (cc, year), 14 * 86400) or []
        out = {}
        for h in data if isinstance(data, list) else []:
            out.setdefault(h.get("date"), []).append(h.get("localName") or h.get("name"))
        return out

    def weather(self):
        c = self.core.cfg
        if not self.cfg("cal_weather") or c.get("home_lat") in ("", None) or c.get("home_lon") in ("", None):
            return {}
        url = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&daily=weather_code,temperature_2m_max,temperature_2m_min,"
               "precipitation_probability_max&timezone=auto&forecast_days=16" % (c["home_lat"], c["home_lon"]))
        j = self._fetch_json(url, "forecast.json", 3 * 3600) or {}
        d = j.get("daily") or {}
        out = {}
        for i, day in enumerate(d.get("time") or []):
            out[day] = {"code": d["weather_code"][i], "max": d["temperature_2m_max"][i], "min": d["temperature_2m_min"][i],
                        "rain": (d.get("precipitation_probability_max") or [None] * 99)[i]}
        return out

    def range_payload(self, start, end):
        """Everything the calendar UI needs for a date range (inclusive dates, 'YYYY-MM-DD')."""
        a = parse_dt(start).replace(hour=0, minute=0)
        b = parse_dt(end).replace(hour=0, minute=0) + dt.timedelta(days=1)
        hol = {}
        for y in range(a.year, b.year + 1):
            hol.update(self.holidays(y))
        moon = {}
        d = a
        while d < b:
            p, q = moon_phase(d), moon_phase(d + dt.timedelta(days=1))
            for target, name in ((0.0, "New moon"), (0.25, "First quarter"), (0.5, "Full moon"), (0.75, "Last quarter")):
                if (p <= target < q) or (target == 0.0 and q < p):
                    moon[d.strftime("%Y-%m-%d")] = name
            d += dt.timedelta(days=1)
        return {"events": self.expand(a, b), "holidays": {k: v for k, v in hol.items() if start <= k <= end},
                "weather": self.weather(), "moon": moon, "cats": {k: v[0] for k, v in CATS.items()},
                "country": self.country(), "week_start": int(self.cfg("week_start") or 0),
                "work": [self.cfg("work_start"), self.cfg("work_end")], "today": dt.date.today().isoformat()}

    # ---- mutations ----
    def add(self, a):
        with self.lock:
            evs = self.load()
            all_day = bool(a.get("all_day"))
            start = parse_dt(a.get("start"))
            if all_day:
                start = start.replace(hour=0, minute=0)
            dur = int(float(a.get("duration_min") or (1440 if all_day else 60)))
            end = parse_dt(a["end"]) if a.get("end") else start + dt.timedelta(minutes=max(5, dur))
            title = str(a.get("title") or "").strip()
            if not title:
                return None, "An event needs a title."
            rec = a.get("recur")
            if isinstance(rec, str):
                rec = {"freq": rec} if rec in FREQS else None
            n = max([int(re.sub(r"\D", "", e["id"]) or 0) for e in evs] + [0]) + 1
            remind = a.get("remind_min")
            ev = {"id": "E%d" % n, "title": title[:120], "start": fmt(start), "end": fmt(end), "all_day": all_day,
                  "remind": int(remind) if remind not in (None, "") else (-1 if all_day else int(self.core.cfg.get("remind_default", 10))),
                  "notes": str(a.get("notes") or "")[:2000], "location": str(a.get("location") or "")[:160],
                  "cat": a.get("cat") if a.get("cat") in CATS else guess_cat(title), "recur": rec or None, "exdates": [],
                  "created": fmt(dt.datetime.now())}
            clash = [] if all_day else [r for r in self.expand(start, end, evs) if not r.get("all_day")]
            evs.append(ev)
            self.save(evs)
            return ev, clash

    def edit(self, eid, changes):
        with self.lock:
            evs = self.load()
            e = next((x for x in evs if x["id"].lower() == str(eid).lower()), None)
            if not e:
                return None
            if "start" in changes or "end" in changes or "duration_min" in changes:
                s = parse_dt(changes.get("start") or e["start"])
                if changes.get("all_day", e.get("all_day")):
                    s = s.replace(hour=0, minute=0)
                if changes.get("end"):
                    en = parse_dt(changes["end"])
                elif changes.get("duration_min"):
                    en = s + dt.timedelta(minutes=int(float(changes["duration_min"])))
                else:
                    en = s + (parse_dt(e["end"]) - parse_dt(e["start"]))
                e["start"], e["end"] = fmt(s), fmt(max(en, s + dt.timedelta(minutes=5)))
            for k in ("title", "notes", "location"):
                if k in changes and changes[k] is not None:
                    e[k] = str(changes[k])[:2000]
            if "cat" in changes and changes["cat"] in CATS:
                e["cat"] = changes["cat"]
            if "all_day" in changes:
                e["all_day"] = bool(changes["all_day"])
            if "remind_min" in changes and changes["remind_min"] not in (None, ""):
                e["remind"] = int(changes["remind_min"])
            if "recur" in changes:
                r = changes["recur"]
                e["recur"] = ({"freq": r} if r in FREQS else None) if isinstance(r, str) else (r or None)
            self.reminded = {k for k in self.reminded if not k.startswith(e["id"] + "@")}
            self.save(evs)
            return e

    def delete(self, eid, scope="series", date=""):
        """scope: series (whole event), one (just this date's occurrence), following (this date and later)."""
        with self.lock:
            evs = self.load()
            e = next((x for x in evs if x["id"].lower() == str(eid).split("@")[0].lower()), None)
            if not e:
                return None
            date = date or (str(eid).split("@")[1] if "@" in str(eid) else "")
            if e.get("recur") and scope == "one" and date:
                e.setdefault("exdates", []).append(date)
            elif e.get("recur") and scope == "following" and date:
                prev = (parse_dt(date) - dt.timedelta(days=1)).strftime("%Y-%m-%d")
                if prev < e["start"][:10]:
                    evs.remove(e)
                else:
                    e["recur"]["until"] = prev
            else:
                evs.remove(e)
            self.save(evs)
            return e

    # ---- the `calendar` tool ----
    def tool(self, a):
        act = str(a.get("action") or "").lower().strip()
        try:
            return getattr(self, "t_" + act)(a) if hasattr(self, "t_" + act) else (
                "Use add, quick_add, list, agenda, search, edit, move, cancel, free, find_time, countdown, stats, holidays, export, import or show.")
        except ValueError as e:
            return "Calendar error: %s" % e

    def _line(self, r):
        when = r["ostart"][:10] + (" all day" if r.get("all_day") else " %s-%s" % (r["ostart"][11:], r["oend"][11:]))
        extra = "".join([" @ " + r["location"] if r.get("location") else "", " (repeats %s)" % r["recur"]["freq"] if r.get("recur") else "",
                         " [" + r["notes"][:80] + "]" if r.get("notes") else ""])
        return "%s  %s  %s%s" % (r["id"], when, r["title"], extra)

    def t_add(self, a):
        if a.get("text") and not a.get("start"):
            return self.t_quick_add(a)
        if a.get("repeat"):
            a = {**a, "recur": {"freq": a["repeat"], **({"until": a["until"]} if a.get("until") else {}), **({"days": a["days"]} if isinstance(a.get("days"), list) else {})}}
        ev, clash = self.add(a)
        if not ev:
            return clash
        msg = "Added %s: %s on %s%s." % (ev["id"], ev["title"], ev["start"][:10], "" if ev["all_day"] else " at " + ev["start"][11:])
        if ev["recur"]:
            msg += " Repeats %s%s." % (ev["recur"]["freq"], " until " + ev["recur"]["until"] if ev["recur"].get("until") else "")
        if clash:
            msg += " WARNING, it clashes with: " + "; ".join("%s %s (%s)" % (c["id"], c["title"], c["ostart"][11:]) for c in clash[:4]) + ". Offer to move one."
        return msg

    def t_quick_add(self, a):
        text = str(a.get("text") or a.get("title") or "").strip()
        d = parse_quick(text, week_start=int(self.cfg("week_start") or 0))
        return self.t_add(d)

    def t_list(self, a):
        now = dt.datetime.now()
        start = parse_dt(a["start"]) if a.get("start") else now - dt.timedelta(hours=1)
        rows = self.expand(start, start + dt.timedelta(days=int(a.get("days") or 7)))
        return "\n".join(self._line(r) for r in rows[:80]) or "Nothing scheduled."

    def t_agenda(self, a):
        day = parse_dt(a.get("start") or dt.date.today().isoformat()).replace(hour=0, minute=0)
        rows = self.expand(day, day + dt.timedelta(days=1))
        hol = self.holidays(day.year).get(day.strftime("%Y-%m-%d"))
        head = day.strftime("%A %d %B %Y") + (" (holiday: %s)" % ", ".join(hol) if hol else "")
        w = self.weather().get(day.strftime("%Y-%m-%d"))
        if w:
            head += ", forecast %s, %.0f-%.0f°C%s" % (WMO.get(w["code"], "mixed"), w["min"], w["max"], ", %s%% rain" % w["rain"] if w.get("rain") is not None else "")
        return head + ":\n" + ("\n".join(self._line(r) for r in rows) or "Nothing scheduled.")

    def t_search(self, a):
        q = str(a.get("text") or a.get("title") or "").lower().strip()
        now = dt.datetime.now()
        rows = [r for r in self.expand(now - dt.timedelta(days=365), now + dt.timedelta(days=730))
                if q in (r["title"] + " " + r.get("notes", "") + " " + r.get("location", "")).lower()]
        upcoming = [r for r in rows if r["oend"] >= fmt(now)][:15]
        past = [r for r in rows if r["oend"] < fmt(now)][-5:]
        return ("Upcoming:\n" + "\n".join(map(self._line, upcoming)) if upcoming else "Nothing upcoming matches.") + \
            ("\nRecent:\n" + "\n".join(map(self._line, past)) if past else "")

    def t_edit(self, a):
        changes = {k: a[k] for k in ("title", "start", "end", "duration_min", "notes", "location", "cat", "all_day", "remind_min") if a.get(k) not in (None, "")}
        if a.get("repeat"):
            changes["recur"] = None if a["repeat"] == "none" else {"freq": a["repeat"], **({"until": a["until"]} if a.get("until") else {})}
        e = self.edit(a.get("id", ""), changes)
        return ("Updated %s: %s at %s." % (e["id"], e["title"], e["start"])) if e else "No event with that id. Use list or search to see ids."

    def t_move(self, a):
        return self.t_edit({"id": a.get("id"), "start": a.get("start")})

    def t_cancel(self, a):
        e = self.delete(a.get("id", ""), str(a.get("scope") or "series"), str(a.get("date") or ""))
        return ("Cancelled %s%s: %s." % (e["id"], " (that occurrence)" if a.get("scope") == "one" else "", e["title"])) if e else "No event with that id."

    def _busy(self, day):
        a = day.replace(hour=0, minute=0)
        return sorted((parse_dt(r["ostart"]), parse_dt(r["oend"])) for r in self.expand(a, a + dt.timedelta(days=1)) if not r.get("all_day"))

    def _slots(self, day, need):
        ws, we = (self.cfg("work_start") or "09:00").split(":"), (self.cfg("work_end") or "18:00").split(":")
        cur = day.replace(hour=int(ws[0]), minute=int(ws[1]), second=0)
        stop = day.replace(hour=int(we[0]), minute=int(we[1]), second=0)
        now = dt.datetime.now()
        if cur.date() == now.date():
            cur = max(cur, now.replace(second=0, microsecond=0) + dt.timedelta(minutes=(15 - now.minute % 15) % 15))
        slots = []
        for s, e in self._busy(day) + [(stop, stop)]:
            if min(s, stop) - cur >= need:
                slots.append((cur, min(s, stop)))
            cur = max(cur, e)
        return slots

    def t_free(self, a):
        day = parse_dt(a.get("start") or dt.date.today().isoformat())
        need = dt.timedelta(minutes=int(a.get("duration_min") or 60))
        slots = self._slots(day, need)
        return ("Free on %s: " % day.strftime("%a %d %b") + ", ".join("%s-%s" % (s.strftime("%H:%M"), e.strftime("%H:%M")) for s, e in slots)) if slots \
            else "No free slot of %d minutes on %s within working hours." % (need.seconds // 60, day.date())

    def t_find_time(self, a):
        need = dt.timedelta(minutes=int(a.get("duration_min") or 60))
        day = parse_dt(a.get("start") or dt.date.today().isoformat())
        found = []
        for i in range(int(a.get("days") or 14)):
            d = day + dt.timedelta(days=i)
            if d.weekday() >= 5 and not a.get("weekends"):
                continue
            for s, e in self._slots(d, need):
                found.append("%s %s-%s" % (d.strftime("%a %d %b"), s.strftime("%H:%M"), e.strftime("%H:%M")))
                break
            if len(found) >= 5:
                break
        return ("First free %d-minute slots: " % (need.seconds // 60) + "; ".join(found)) if found else "No free slot found."

    def t_countdown(self, a):
        q = str(a.get("text") or a.get("title") or "").lower()
        now = dt.datetime.now()
        rows = [r for r in self.expand(now, now + dt.timedelta(days=730)) if not q or q in r["title"].lower()]
        if not rows:
            return "Nothing upcoming matches."
        r = rows[0]
        left = parse_dt(r["ostart"]) - now
        return "%s is in %d days, %d hours and %d minutes (%s)." % (r["title"], left.days, left.seconds // 3600, left.seconds % 3600 // 60, r["ostart"])

    def t_stats(self, a):
        now = dt.datetime.now()
        wk = (now - dt.timedelta(days=now.weekday())).replace(hour=0, minute=0)
        rows = [r for r in self.expand(wk, wk + dt.timedelta(days=7)) if not r.get("all_day")]
        hrs = sum((parse_dt(r["oend"]) - parse_dt(r["ostart"])).total_seconds() for r in rows) / 3600
        by = {}
        for r in rows:
            by[r["cat"]] = by.get(r["cat"], 0) + (parse_dt(r["oend"]) - parse_dt(r["ostart"])).total_seconds() / 3600
        busiest = max(range(7), key=lambda i: sum(1 for r in rows if parse_dt(r["ostart"]).weekday() == i)) if rows else None
        return "This week: %d events, %.1f hours booked%s%s." % (len(rows), hrs,
                                                             (" (" + ", ".join("%s %.1fh" % (k, v) for k, v in sorted(by.items(), key=lambda x: -x[1])) + ")") if by else "",
                                                             ", busiest day %s" % WD[busiest].title() if busiest is not None else "")

    def t_holidays(self, a):
        y = int(str(a.get("start") or dt.date.today().year)[:4])
        h = self.holidays(y)
        today = dt.date.today().isoformat()
        rows = sorted((d, ", ".join(n)) for d, n in h.items() if d >= today or str(y) != today[:4])
        return ("Public holidays (%s): " % self.country() + "; ".join("%s %s" % r for r in rows[:15])) if rows else \
            "No holiday data (offline, or set the country in Configuration)."

    def t_export(self, a):
        out = self.dir / "calendar.ics"
        out.write_text(to_ics(self.load()), encoding="utf-8")
        return "Exported to %s. Import it into Google Calendar, Outlook or Apple Calendar." % out

    def t_import(self, a):
        p = Path(str(a.get("path") or a.get("text") or "")).expanduser()
        if not p.exists():
            return "No such file: %s" % p
        added = 0
        for ev in from_ics(p.read_text(encoding="utf-8", errors="replace")):
            e, _ = self.add(ev)
            added += bool(e)
        return "Imported %d events from %s." % (added, p.name)

    def t_show(self, a):
        d = str(a.get("start") or a.get("text") or "").strip() or dt.date.today().isoformat()
        d = d[:10] if re.match(r"\d{4}-\d{2}-\d{2}", d) else d
        m = re.fullmatch(r"(?:in\s+)?([a-z]+)\.?(?:\s+(\d{4}))?", d.lower())
        if m and m.group(1) in MONTHS:   # "March", "december 2027": the first of that month (the coming one)
            today = dt.date.today()
            mon, yr = MONTHS[m.group(1)], int(m.group(2)) if m.group(2) else None
            d = dt.date(yr or (today.year if mon >= today.month else today.year + 1), mon, 1).isoformat()
        if not re.match(r"\d{4}-\d{2}-\d{2}$", d):
            try:
                d = parse_quick_date(d).isoformat()
            except ValueError:
                d = dt.date.today().isoformat()
        view = str(a.get("view") or "month").lower()
        self.core.ui({"t": "calendar", "date": d, "view": view if view in ("month", "week", "day", "agenda", "year") else "month"})
        return "The calendar is open on the screen (%s view, %s)." % (view, d)

    def t_close(self, a):
        self.core.ui({"t": "calendar", "close": True})
        return "Calendar closed."

    # ---- spoken reminders (recurring-aware) ----
    def _reminders(self):
        while True:
            time.sleep(30)
            try:
                now = dt.datetime.now()
                for r in self.expand(now - dt.timedelta(minutes=5), now + dt.timedelta(days=1)):
                    if r.get("remind", 10) < 0 or r.get("all_day"):
                        continue
                    s = parse_dt(r["ostart"])
                    key = r["oid"] + r["ostart"]
                    if key not in self.reminded and s - dt.timedelta(minutes=r.get("remind", 10)) <= now < s + dt.timedelta(minutes=2):
                        self.reminded.add(key)
                        self.core.audio.sfx("alarm")
                        self.core.activate()
                        self.core.ui({"t": "act", "text": "REMINDER  ·  %s %s" % (s.strftime("%H:%M"), r["title"])})
                        self.core.brain.say_to_jarvis("[System] Calendar reminder: '%s' starts at %s (in about %d minutes)%s. Tell the user briefly." % (
                            r["title"], s.strftime("%H:%M"), max(0, int((s - now).total_seconds() // 60)), (" at " + r["location"]) if r.get("location") else ""))
            except Exception:
                pass


WMO = {0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "drizzle", 53: "drizzle", 55: "drizzle",
       61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
       77: "snow grains", 80: "showers", 81: "showers", 82: "heavy showers", 85: "snow showers", 86: "snow showers", 95: "thunderstorms",
       96: "thunderstorms with hail", 99: "thunderstorms with hail"}


# ---------------------------------------------------------------------------------------------
# iCalendar
# ---------------------------------------------------------------------------------------------
def _esc(s):
    return str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def to_ics(evs):
    z = lambda s: parse_dt(s).strftime("%Y%m%dT%H%M%S")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WINNERS Bot//EN", "CALSCALE:GREGORIAN"]
    for e in evs:
        lines += ["BEGIN:VEVENT", "UID:%s@jarvis" % e["id"], "DTSTAMP:" + dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")]
        if e.get("all_day"):
            lines += ["DTSTART;VALUE=DATE:" + e["start"][:10].replace("-", ""), "DTEND;VALUE=DATE:" + (parse_dt(e["end"]).date() + dt.timedelta(days=0 if e["end"][11:] == "00:00" else 1)).strftime("%Y%m%d")]
        else:
            lines += ["DTSTART:" + z(e["start"]), "DTEND:" + z(e["end"])]
        lines.append("SUMMARY:" + _esc(e["title"]))
        if e.get("location"):
            lines.append("LOCATION:" + _esc(e["location"]))
        if e.get("notes"):
            lines.append("DESCRIPTION:" + _esc(e["notes"]))
        if e.get("cat"):
            lines.append("CATEGORIES:" + e["cat"].upper())
        r = e.get("recur")
        if r and r.get("freq") in FREQS:
            parts = ["FREQ=" + ("DAILY" if r["freq"] == "daily" else "WEEKLY" if r["freq"] in ("weekly", "weekdays") else r["freq"].upper())]
            if r["freq"] == "weekdays":
                parts.append("BYDAY=MO,TU,WE,TH,FR")
            elif r.get("days"):
                parts.append("BYDAY=" + ",".join(["MO", "TU", "WE", "TH", "FR", "SA", "SU"][d] for d in r["days"]))
            if int(r.get("interval") or 1) > 1:
                parts.append("INTERVAL=%d" % int(r["interval"]))
            if r.get("until"):
                parts.append("UNTIL=" + r["until"].replace("-", "") + "T235959")
            elif r.get("count"):
                parts.append("COUNT=%d" % int(r["count"]))
            lines.append("RRULE:" + ";".join(parts))
            for x in e.get("exdates") or []:
                lines.append("EXDATE:" + x.replace("-", "") + e["start"][10:].replace(":", "").replace(" ", "T") + "00")
        if e.get("remind", -1) >= 0 and not e.get("all_day"):
            lines += ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + _esc(e["title"]), "TRIGGER:-PT%dM" % e["remind"], "END:VALARM"]
        lines.append("END:VEVENT")
    return "\r\n".join(lines + ["END:VCALENDAR"]) + "\r\n"


def from_ics(text):
    text = re.sub(r"\r?\n[ \t]", "", text)  # unfold
    out = []
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        f = {}
        for line in block.strip().splitlines():
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            f.setdefault(k.split(";")[0].upper(), (k, v.strip()))
        if "DTSTART" not in f:
            continue

        def when(key):
            k, v = f[key]
            v = v.rstrip("Z")
            if "VALUE=DATE" in k or len(v) == 8:
                return dt.datetime.strptime(v[:8], "%Y%m%d"), True
            return dt.datetime.strptime(v[:15], "%Y%m%dT%H%M%S"), False
        s, allday = when("DTSTART")
        en = when("DTEND")[0] if "DTEND" in f else s + dt.timedelta(hours=1 if not allday else 24)
        un = lambda x: x.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
        ev = {"title": un(f.get("SUMMARY", ("", "Event"))[1]), "start": fmt(s), "end": fmt(en), "all_day": allday,
              "location": un(f.get("LOCATION", ("", ""))[1]), "notes": un(f.get("DESCRIPTION", ("", ""))[1])[:2000]}
        if "RRULE" in f:
            rr = dict(p.split("=", 1) for p in f["RRULE"][1].split(";") if "=" in p)
            freq = {"DAILY": "daily", "WEEKLY": "weekly", "MONTHLY": "monthly", "YEARLY": "yearly"}.get(rr.get("FREQ"))
            if freq:
                r = {"freq": freq}
                if rr.get("BYDAY") and freq == "weekly":
                    days = [["MO", "TU", "WE", "TH", "FR", "SA", "SU"].index(d[-2:]) for d in rr["BYDAY"].split(",") if d[-2:] in ("MO", "TU", "WE", "TH", "FR", "SA", "SU")]
                    r = {"freq": "weekdays"} if days == [0, 1, 2, 3, 4] else {**r, "days": days}
                if rr.get("INTERVAL"):
                    r["interval"] = int(rr["INTERVAL"])
                if rr.get("UNTIL"):
                    u = rr["UNTIL"][:8]
                    r["until"] = "%s-%s-%s" % (u[:4], u[4:6], u[6:8])
                if rr.get("COUNT"):
                    r["count"] = int(rr["COUNT"])
                ev["recur"] = r
        out.append(ev)
    return out
