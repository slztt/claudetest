/* WINNERS Bot holographic calendar: month / week / day / agenda / year views, natural-language quick add, event editor with
   repeats and reminders, drag-to-reschedule, categories, search, public holidays, 16-day forecast, moon phases, week
   numbers, working-hours shading, "now" line, keyboard control and screen-reader labels. Data lives in Python
   (jv_calendar.py); in a plain browser a small in-memory store stands in so the views can be previewed. */

const CSS = `
#cal{position:fixed;inset:66px 2.2vw 92px;z-index:20;display:grid;grid-template-columns:250px 1fr;gap:14px;opacity:0;pointer-events:none;
  transform:perspective(1400px) rotateX(9deg) translateY(30px) scale(.97);transition:opacity .45s,transform .6s cubic-bezier(.2,.8,.2,1);zoom:var(--ui-scale,1)}
#cal.open{opacity:1;pointer-events:auto;transform:none}
#cal .cpanel{position:relative;background:linear-gradient(180deg,rgba(var(--accent-rgb),.10),rgba(16,12,5,.78) 30%);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);
  box-shadow:inset 0 0 0 1px rgba(var(--accent-rgb),.16),0 20px 60px rgba(0,0,0,.55);clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px));min-height:0}
#cal .cbar{display:flex;flex-direction:column;gap:14px;padding:16px 16px 18px;overflow:auto;scrollbar-width:none}
#cal h4{font:400 9.5px var(--ui);letter-spacing:.32em;color:var(--accent);text-transform:uppercase;margin-bottom:8px;text-shadow:0 0 10px rgba(var(--accent-rgb),.5)}
#cal .main{display:flex;flex-direction:column;padding:14px 18px 16px;min-width:0}
#cal .top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
#cal .ttl{font:200 clamp(17px,1.75vw,26px) var(--ui);letter-spacing:.14em;color:#fff;text-shadow:0 0 22px rgba(var(--accent-rgb),.6);margin-right:auto;white-space:nowrap}
#cal .ttl small{font:400 10px var(--mono);letter-spacing:.2em;color:var(--dim);margin-left:12px}
.cb{border:0;cursor:pointer;background:rgba(255,255,255,.06);color:var(--txt);font:400 10px var(--ui);letter-spacing:.2em;text-transform:uppercase;padding:8px 12px;border-radius:99px;transition:.2s}
.cb:hover{background:rgba(var(--accent-rgb),.2);color:#fff}.cb.on{background:rgba(var(--accent-rgb),.3);color:#fff;box-shadow:0 0 16px rgba(var(--accent-rgb),.35)}
.cb.ic{width:32px;height:32px;padding:0;display:grid;place-items:center;font-size:15px;letter-spacing:0}
.cseg{display:flex;gap:2px;background:rgba(255,255,255,.04);border-radius:99px;padding:2px}.cseg .cb{background:transparent}.cseg .cb.on{background:rgba(var(--accent-rgb),.3)}
.cin{background:rgba(255,255,255,.05);border:0;border-bottom:1px solid rgba(var(--accent-rgb),.35);color:#fff;font:300 13px var(--ui);padding:9px 12px;outline:0;user-select:text;-webkit-user-select:text;border-radius:6px 6px 0 0}
.cin:focus{background:rgba(var(--accent-rgb),.1);border-bottom-color:var(--accent)}
.cin::placeholder{color:var(--dim);font-size:11px;letter-spacing:.08em}
#cal .quick{display:flex;gap:8px;margin-bottom:10px}#cal .quick .cin{flex:1}
#cal .view{flex:1;min-height:0;position:relative;overflow:hidden}
/* month */
.mgrid{display:grid;grid-template-columns:34px repeat(7,1fr);grid-template-rows:22px repeat(6,1fr);height:100%;gap:3px}
.mgrid .cdh{font:400 9px var(--ui);letter-spacing:.3em;color:var(--dim);text-align:center;align-self:end;padding-bottom:4px;height:18px}
.mgrid .cwk{font:400 9px var(--mono);color:rgba(var(--accent-rgb),.55);display:grid;place-items:center;letter-spacing:.1em}
.cday{position:relative;background:rgba(var(--accent-rgb),.045);padding:5px 6px;min-height:0;overflow:hidden;cursor:pointer;transition:background .2s,box-shadow .2s;outline-offset:-2px}
.cday:hover{background:rgba(var(--accent-rgb),.11)}
.cday.out{opacity:.38}.cday.wkend{background:rgba(var(--accent-rgb),.025)}
.cday.today{box-shadow:inset 0 0 0 1px var(--accent),0 0 22px rgba(var(--accent-rgb),.35)}
.cday.sel{background:rgba(var(--accent-rgb),.16)}
.cday.drop{background:rgba(61,224,140,.18);box-shadow:inset 0 0 0 1px var(--gold)}
.cday .n{display:flex;align-items:center;gap:6px;font:400 12px var(--mono);color:var(--txt)}
.cday.today .n b{background:var(--accent);color:#060503;border-radius:99px;padding:0 6px;box-shadow:0 0 12px var(--accent)}
.cday .n b{font-weight:500}
.cday .cwx{margin-left:auto;font-size:10px;color:var(--dim);white-space:nowrap}
.cday .chol{font:400 9px var(--ui);letter-spacing:.06em;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.cchip{display:flex;align-items:center;gap:5px;font-size:11px;line-height:1.5;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:4px;padding:0 5px;margin-top:2px;cursor:pointer}
.cchip i{flex:none;width:6px;height:6px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--c)}
.cchip.cad{background:color-mix(in srgb,var(--c) 28%,transparent);border-left:2px solid var(--c)}
.cchip span{overflow:hidden;text-overflow:ellipsis}.cchip small{color:var(--dim);font:400 9.5px var(--mono)}
.cchip:hover{background:color-mix(in srgb,var(--c) 22%,transparent)}
.cchip[draggable=true]{cursor:grab}
.cmore{font:400 9.5px var(--mono);color:var(--accent);margin-top:2px;letter-spacing:.08em}
/* week / day */
.tgrid{display:grid;height:100%;grid-template-rows:auto auto 1fr;min-height:0}
.thead,.tall{display:grid;grid-template-columns:52px repeat(var(--cols),1fr);gap:3px}
.thead div{text-align:center;font:400 9.5px var(--ui);letter-spacing:.24em;color:var(--dim);padding:4px 0}
.thead div b{display:block;font:300 20px var(--mono);color:#fff;letter-spacing:0}
.thead div.today b{color:var(--accent);text-shadow:0 0 12px var(--accent)}
.tall{min-height:24px;margin-bottom:4px}.tall .lab{font:400 8.5px var(--ui);letter-spacing:.2em;color:var(--dim);align-self:center}
.tall .cell{background:rgba(var(--accent-rgb),.04);padding:2px}
.tbody{overflow:auto;position:relative;scrollbar-width:thin}
.tcols{display:grid;grid-template-columns:52px repeat(var(--cols),1fr);gap:3px;position:relative;height:calc(24 * var(--hh))}
.hours{position:relative}.hours div{position:absolute;right:8px;font:400 9.5px var(--mono);color:var(--dim);transform:translateY(-50%)}
.tcol{position:relative;background:repeating-linear-gradient(180deg,rgba(var(--accent-rgb),.10) 0 1px,transparent 1px var(--hh));cursor:copy}
.tcol .off{position:absolute;left:0;right:0;background:rgba(0,0,0,.22);pointer-events:none}
.tcol.today{background-color:rgba(var(--accent-rgb),.05)}
.cev{position:absolute;border-radius:5px;padding:3px 6px;font-size:11px;color:#fff;overflow:hidden;cursor:pointer;background:color-mix(in srgb,var(--c) 30%,rgba(16,12,5,.6));border-left:3px solid var(--c);
  box-shadow:0 0 14px color-mix(in srgb,var(--c) 30%,transparent);transition:filter .2s}
.cev:hover{filter:brightness(1.25)}.cev b{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cev small{font:400 9.5px var(--mono);color:var(--txt);opacity:.8}
.nowline{position:absolute;left:0;right:0;height:2px;background:var(--red);box-shadow:0 0 10px var(--red);pointer-events:none;z-index:3}
.nowline::before{content:"";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red)}
/* agenda */
.cagenda{height:100%;overflow:auto;padding-right:6px}
.cagenda .cad{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:10px 0;border-bottom:1px solid rgba(var(--accent-rgb),.1)}
.cagenda .cad .cdd{font:300 22px var(--mono);color:#fff}.cagenda .cad .cdd small{display:block;font:400 9px var(--ui);letter-spacing:.24em;color:var(--dim)}
.cagenda .cad.today .cdd{color:var(--accent);text-shadow:0 0 12px var(--accent)}
.cagenda .crow{display:flex;gap:12px;align-items:baseline;padding:4px 6px;border-radius:4px;cursor:pointer}.cagenda .crow:hover{background:rgba(var(--accent-rgb),.1)}
.cagenda .crow .tm{font:400 11px var(--mono);color:var(--dim);width:92px;flex:none}.cagenda .crow b{font-weight:400;color:#fff}
.cagenda .crow .lc{color:var(--dim);font-size:11px}
.cagenda .crow i{width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c);flex:none;align-self:center}
/* year */
.ygrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 18px;height:100%;overflow:auto}
.cym{cursor:pointer;padding:6px;border-radius:6px}.cym:hover{background:rgba(var(--accent-rgb),.08)}
.cym h5{font:400 10px var(--ui);letter-spacing:.3em;color:var(--accent);margin-bottom:5px}
.cmini{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.cmini span{font:400 9.5px var(--mono);text-align:center;padding:2px 0;border-radius:3px;color:var(--txt);position:relative}
.cmini span.h{color:var(--dim);font-size:8px}.cmini span.o{visibility:hidden}
.cmini span.t{background:var(--accent)!important;color:#060503;box-shadow:0 0 8px var(--accent)}.cmini span.chol{color:var(--gold)}
.cmini span[data-l="1"]{background:rgba(var(--accent-rgb),.16)}.cmini span[data-l="2"]{background:rgba(var(--accent-rgb),.3)}.cmini span[data-l="3"]{background:rgba(var(--accent-rgb),.48)}
.cmini.cside span{cursor:pointer}.cmini.cside span:hover{background:rgba(var(--accent-rgb),.25)}
.cmini.cside span.sel{box-shadow:inset 0 0 0 1px var(--accent)}
/* sidebar */
.clegend{display:flex;flex-direction:column;gap:3px}
.clegend button{display:flex;align-items:center;gap:8px;border:0;background:none;color:var(--txt);font:300 12px var(--ui);cursor:pointer;padding:3px 4px;border-radius:4px;text-transform:capitalize;text-align:left}
.clegend button:hover{background:rgba(var(--accent-rgb),.08)}.clegend button i{width:9px;height:9px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
.clegend button[aria-pressed=false]{opacity:.35}.clegend button em{margin-left:auto;font:normal 400 10px var(--mono);color:var(--dim)}
.cup .crow{display:flex;gap:8px;font-size:11.5px;padding:4px 2px;cursor:pointer;color:var(--txt);border-radius:4px}.cup .crow:hover{background:rgba(var(--accent-rgb),.08)}
.cup .crow i{width:6px;height:6px;border-radius:50%;background:var(--c);margin-top:6px;flex:none}.cup .crow small{display:block;color:var(--dim);font:400 9.5px var(--mono)}
.cstat{display:grid;grid-template-columns:1fr 1fr;gap:6px}.cstat div{background:rgba(var(--accent-rgb),.07);padding:7px 8px}
.cstat b{display:block;font:300 18px var(--mono);color:#fff}.cstat span{font-size:8px;letter-spacing:.24em;color:var(--dim)}
.copts{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px;color:var(--dim)}.copts label{display:flex;flex-direction:column;gap:3px;letter-spacing:.14em;text-transform:uppercase;font-size:8.5px}
.copts .cin{padding:6px 8px;font-size:12px}
/* editor */
#cal-ed{position:fixed;inset:0;z-index:25;display:none;place-items:center;background:radial-gradient(circle,rgba(6,5,3,.4),rgba(6,5,3,.8))}
#cal-ed.show{display:grid}
#cal-ed form{width:min(560px,92vw);max-height:88vh;overflow:auto;padding:24px 28px 22px;background:linear-gradient(135deg,rgba(var(--accent-rgb),.16),rgba(16,12,5,.95) 50%);
  clip-path:polygon(0 0,calc(100% - 26px) 0,100% 26px,100% 100%,26px 100%,0 calc(100% - 26px));box-shadow:0 0 80px rgba(var(--accent-rgb),.2);zoom:var(--ui-scale,1)}
#cal-ed h2{font:300 11px var(--ui);letter-spacing:.5em;color:var(--accent);margin-bottom:14px}
#cal-ed .g{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
#cal-ed label{display:flex;flex-direction:column;gap:5px;font-size:8.5px;letter-spacing:.26em;color:var(--dim);text-transform:uppercase}
#cal-ed label.full{grid-column:1/-1}#cal-ed label.chk{flex-direction:row;align-items:center;gap:8px;font-size:11px;letter-spacing:.06em;text-transform:none;color:var(--txt)}
#cal-ed select.cin option{background:#14100a}
#cal-ed textarea.cin{min-height:70px;resize:vertical;font:300 13px var(--ui)}
#cal-ed .btns{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}#cal-ed .btns .sp{flex:1}
#cal-ed .cb.red{color:var(--red)}#cal-ed .cb.go{background:rgba(var(--accent-rgb),.25);color:#fff}
#cal-ed .note{font-size:11px;color:var(--gold);margin-top:10px;min-height:14px}
#cal-tip{position:fixed;z-index:24;pointer-events:none;padding:8px 10px;background:rgba(16,12,5,.94);font-size:11px;color:var(--txt);max-width:260px;border-left:2px solid var(--accent);display:none;line-height:1.5}
body.calopen #globe-ui,body.calopen .col{opacity:.12;pointer-events:none}
@media (max-width:1100px){#cal{grid-template-columns:1fr}#cal .cbar{display:none}}
`;

const WX = (c) => c == null ? '' : c === 0 ? '☀' : c <= 2 ? '🌤' : c === 3 ? '☁' : c <= 48 ? '🌫' : c <= 57 ? '🌦' : c <= 67 ? '🌧' : c <= 77 ? '❄' : c <= 82 ? '🌦' : c <= 86 ? '🌨' : '⛈';
const MOON = { 'New moon': '●', 'First quarter': '◐', 'Full moon': '○', 'Last quarter': '◑' };
const DN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CATS = { work: '#ffc93c', personal: '#9be7a1', health: '#ff7a8a', social: '#3de08c', travel: '#c9a2ff', birthday: '#ff8fc8', focus: '#7dffd3', other: '#a9c6da' };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hm = (s) => s.slice(11, 16);
const mins = (s) => +s.slice(11, 13) * 60 + +s.slice(14, 16);
const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };

/* ---------- in-browser stand-in for the Python calendar (preview only) ---------- */
function mockStore() {
  const t = new Date(), d = (o, h, m = 0) => { const x = addDays(t, o); return `${iso(x)} ${pad(h)}:${pad(m)}`; };
  let n = 0;
  const evs = [
    ['Team standup', d(-20, 9, 15), 15, 'work', { freq: 'weekdays' }, 'Zoom'], ['Gym', d(-14, 19), 60, 'health', { freq: 'weekly', days: [0, 2] }, 'PureGym'],
    ['Lunch with Sam', d(2, 13), 90, 'social', null, "Nando's"], ['Dentist', d(1, 9, 30), 45, 'health', null, ''], ['Project review', d(3, 10), 60, 'work', null, ''],
    ['Flight to Rome', d(9, 6, 40), 150, 'travel', null, 'LHR T5'], ['Deep work', d(0, 14), 120, 'focus', null, ''], ["Mum's birthday", d(12, 0), 1440, 'birthday', { freq: 'yearly' }, ''],
  ].map(([title, start, dur, cat, recur, location]) => {
    const s = new Date(start.replace(' ', 'T')), e = new Date(s.getTime() + dur * 60000);
    return { id: 'E' + (++n), title, start, end: `${iso(e)} ${pad(e.getHours())}:${pad(e.getMinutes())}`, cat, recur, location, notes: '', all_day: dur === 1440, remind: 10, exdates: [] };
  });
  function occ(e, a, b) {
    const s0 = new Date(e.start.replace(' ', 'T')), dur = new Date(e.end.replace(' ', 'T')) - s0, out = [], r = e.recur;
    const push = (s) => { if (s < b && s.getTime() + dur > a && !(e.exdates || []).includes(iso(s))) out.push(s); };
    if (!r) { push(s0); return out.map((s) => [s, dur]); }
    for (let i = 0, c = new Date(s0); i < 800 && c < b; i++) {
      const wd = (c.getDay() + 6) % 7;
      if (r.until && iso(c) > r.until) break;
      if (r.freq === 'daily' || (r.freq === 'weekdays' && wd < 5) || (r.freq === 'weekly' && (r.days ? r.days.includes(wd) : wd === (s0.getDay() + 6) % 7))) push(new Date(c));
      if (r.freq === 'monthly') { push(new Date(c)); c = new Date(s0); c.setMonth(s0.getMonth() + i + 1); continue; }
      if (r.freq === 'yearly') { push(new Date(c)); c = new Date(s0); c.setFullYear(s0.getFullYear() + i + 1); continue; }
      c = addDays(c, 1);
    }
    return out.map((s) => [s, dur]);
  }
  const fmt = (x) => `${iso(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
  return {
    async cal_range(start, end) {
      const a = parseISO(start), b = addDays(parseISO(end), 1), events = [];
      for (const e of evs) for (const [s, dur] of occ(e, a, b)) events.push({ ...e, oid: e.id + '@' + iso(s), ostart: fmt(s), oend: fmt(new Date(s.getTime() + dur)), color: CATS[e.cat], recurring: !!e.recur });
      events.sort((x, y) => (x.all_day === y.all_day ? 0 : x.all_day ? -1 : 1) || x.ostart.localeCompare(y.ostart));
      const wx = {}; for (let i = 0; i < 10; i++) wx[iso(addDays(t, i))] = { code: [0, 2, 3, 61, 80, 1, 0, 95, 71, 2][i], max: 14 + i % 5, min: 6 + i % 3, rain: i * 9 % 80 };
      return { events, holidays: { [`${t.getFullYear()}-12-25`]: ['Christmas Day'], [`${t.getFullYear()}-12-26`]: ['Boxing Day'], [`${t.getFullYear() + 1}-01-01`]: ["New Year's Day"] },
        weather: wx, moon: {}, today: iso(t), week_start: 0, work: ['09:00', '18:00'], country: 'GB' };
    },
    async cal_save(ev) {
      if (ev.id) { const e = evs.find((x) => x.id === ev.id); if (!e) return { ok: false }; Object.assign(e, ev, { remind: ev.remind_min ?? e.remind }); return { ok: true, event: e }; }
      const e = { ...ev, id: 'E' + (++n), exdates: [], remind: ev.remind_min ?? 10 };
      if (!e.end) { const s = new Date(e.start.replace(' ', 'T')); e.end = fmt(new Date(s.getTime() + (ev.duration_min || 60) * 60000)); }
      evs.push(e); return { ok: true, event: e, clash: [] };
    },
    async cal_quick(text) { return { ok: false, error: 'Natural-language add needs the WINNERS Bot app; use New event here.' }; },
    async cal_delete(id, scope, date) {
      const e = evs.find((x) => x.id === id.split('@')[0]); if (!e) return { ok: false };
      if (e.recur && scope === 'one') e.exdates.push(date); else if (e.recur && scope === 'following') e.recur.until = iso(addDays(parseISO(date), -1)); else evs.splice(evs.indexOf(e), 1);
      return { ok: true };
    },
    async cal_export() { return 'Export needs the WINNERS Bot app.'; },
  };
}

export function createCalendar({ call, hasBridge, esc, act, toast, say, onOpen }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mock = hasBridge() ? null : mockStore();
  const api = (fn, ...a) => (hasBridge() ? call(fn, ...a) : mock[fn](...a));
  const $ = (s, r = document) => r.querySelector(s);

  const root = document.createElement('section');
  root.id = 'cal'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Calendar'); root.setAttribute('aria-modal', 'false');
  root.innerHTML = `
  <aside class="cpanel cbar">
    <div><h4 id="cal-mini-h">—</h4><div class="cmini cside" id="cal-mini" role="grid" aria-label="Month picker"></div></div>
    <div><h4>This week</h4><div class="cstat"><div><b id="cs-n">0</b><span>EVENTS</span></div><div><b id="cs-h">0h</b><span>BOOKED</span></div><div><b id="cs-f">0h</b><span>FREE (WORK)</span></div><div><b id="cs-b">—</b><span>BUSIEST</span></div></div></div>
    <div><h4>Categories</h4><div class="clegend" id="cal-legend" role="group" aria-label="Show categories"></div></div>
    <div class="cup"><h4>Coming up</h4><div id="cal-up"></div></div>
    <div><h4>Options</h4><div class="copts">
      <label>Holidays<input class="cin" id="co-cc" maxlength="2" placeholder="GB" aria-label="Holiday country code"></label>
      <label>Week starts<select class="cin" id="co-ws"><option value="0">Monday</option><option value="6">Sunday</option></select></label>
      <label>Work from<input class="cin" id="co-w1" placeholder="09:00"></label><label>Work to<input class="cin" id="co-w2" placeholder="18:00"></label>
    </div><div style="display:flex;gap:6px;margin-top:10px"><button class="cb" id="co-exp">Export .ics</button><button class="cb" id="co-imp">Import .ics</button></div></div>
  </aside>
  <div class="cpanel main">
    <div class="top">
      <div class="ttl" id="cal-ttl" aria-live="polite">—</div>
      <button class="cb ic" id="cal-prev" aria-label="Previous">‹</button><button class="cb" id="cal-today">Today</button><button class="cb ic" id="cal-next" aria-label="Next">›</button>
      <div class="cseg" role="group" aria-label="View">
        <button class="cb" data-v="day">Day</button><button class="cb" data-v="week">Week</button><button class="cb" data-v="month">Month</button><button class="cb" data-v="agenda">Agenda</button><button class="cb" data-v="year">Year</button>
      </div>
      <input class="cin" id="cal-q" placeholder="SEARCH" aria-label="Search events" style="width:104px">
      <button class="cb ic" id="cal-x" aria-label="Close calendar" title="Close (Esc)">✕</button>
    </div>
    <div class="quick"><input class="cin" id="cal-add" aria-label="Quick add an event in plain English" placeholder="QUICK ADD · “Lunch with Sam Friday 1pm for 90 min at Nando's every week”"><button class="cb go" id="cal-new">New event · N</button></div>
    <div class="view" id="cal-view"></div>
  </div>`;
  document.body.appendChild(root);
  const ed = document.createElement('div');
  ed.id = 'cal-ed'; ed.setAttribute('role', 'dialog'); ed.setAttribute('aria-modal', 'true'); ed.setAttribute('aria-labelledby', 'ce-h');
  ed.innerHTML = `<form autocomplete="off"><h2 id="ce-h">EVENT</h2><div class="g">
    <label class="full">Title<input class="cin" name="title" required></label>
    <label>Date<input class="cin" type="date" name="date" required></label>
    <label class="chk"><input type="checkbox" name="all_day"> All day</label>
    <label>Starts<input class="cin" type="time" name="t1" step="300"></label><label>Ends<input class="cin" type="time" name="t2" step="300"></label>
    <label>Repeat<select class="cin" name="freq"><option value="">Does not repeat</option><option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></label>
    <label>Until<input class="cin" type="date" name="until"></label>
    <label>Reminder<select class="cin" name="remind"><option value="-1">None</option><option value="0">At start</option><option value="5">5 min before</option><option value="10">10 min before</option><option value="15">15 min before</option><option value="30">30 min before</option><option value="60">1 hour before</option><option value="120">2 hours before</option><option value="1440">1 day before</option></select></label>
    <label>Category<select class="cin" name="cat">${Object.keys(CATS).map((c) => `<option value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}</select></label>
    <label class="full">Location<input class="cin" name="location"></label>
    <label class="full">Notes<textarea class="cin" name="notes"></textarea></label>
  </div><p class="note" id="ce-note" role="status"></p>
  <div class="btns"><button class="cb go" type="submit">Save</button><button class="cb" type="button" id="ce-dup">Duplicate</button><span class="sp"></span>
    <button class="cb red" type="button" id="ce-del1">Delete this one</button><button class="cb red" type="button" id="ce-delf">This &amp; following</button><button class="cb red" type="button" id="ce-del">Delete</button><button class="cb" type="button" id="ce-x">Cancel</button></div></form>`;
  document.body.appendChild(ed);
  const tip = document.createElement('div'); tip.id = 'cal-tip'; document.body.appendChild(tip);

  const S = { view: 'month', cur: new Date(), sel: new Date(), data: null, hidden: new Set(), q: '', ws: 0, open: false, editing: null };
  try { const v = localStorage.getItem('jv-cal-view'); if (v) S.view = v; } catch (e) { /* private window */ }

  /* ---------- data ---------- */
  function range() {
    const c = S.cur;
    if (S.view === 'year') return [new Date(c.getFullYear(), 0, 1), new Date(c.getFullYear(), 11, 31)];
    if (S.view === 'agenda') return [new Date(c.getFullYear(), c.getMonth(), c.getDate()), addDays(c, 60)];
    if (S.view === 'day') return [c, c];
    if (S.view === 'week') { const a = weekStart(c); return [a, addDays(a, 6)]; }
    const a = weekStart(new Date(c.getFullYear(), c.getMonth(), 1));
    return [a, addDays(a, 41)];
  }
  function weekStart(d) { const wd = S.ws === 6 ? d.getDay() : (d.getDay() + 6) % 7; return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -wd); }
  let reqN = 0;
  async function load() {
    const [a, b] = range(), my = ++reqN;
    const lo = addDays(a, -7) < addDays(new Date(), -1) ? addDays(a, -7) : addDays(new Date(), -1);
    const hi = addDays(b, 7) > addDays(new Date(), 14) ? addDays(b, 7) : addDays(new Date(), 14);   // sidebar needs today+14 too
    const d = await api('cal_range', iso(lo), iso(hi));
    if (my !== reqN) return;
    if (!d || d.error) { $('#cal-view').innerHTML = `<p style="color:var(--red)">${esc((d && d.error) || 'Calendar unavailable.')}</p>`; return; }
    S.data = d; S.ws = d.week_start || 0;
    render();
  }
  const evsOn = (dayIso) => (S.data ? S.data.events : []).filter((e) => !S.hidden.has(e.cat) && (!S.q || (e.title + ' ' + (e.location || '') + ' ' + (e.notes || '')).toLowerCase().includes(S.q))
    && e.ostart.slice(0, 10) <= dayIso && (e.oend.slice(0, 10) > dayIso || (e.oend.slice(0, 10) === dayIso && e.oend.slice(11) !== '00:00') || e.ostart.slice(0, 10) === dayIso));

  /* ---------- render ---------- */
  function title() {
    const c = S.cur;
    let t;
    if (S.view === 'year') t = `${c.getFullYear()}`;
    else if (S.view === 'day') t = c.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    else if (S.view === 'week') { const a = weekStart(c), b = addDays(a, 6); t = `${a.getDate()} ${MN[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MN[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`; }
    else if (S.view === 'agenda') t = 'Agenda';
    else t = `${MN[c.getMonth()]} ${c.getFullYear()}`;
    $('#cal-ttl').innerHTML = `${esc(t)}<small>WEEK ${isoWeek(S.view === 'month' ? S.sel : c)}${S.data ? ' · ' + esc(S.data.country) : ''}</small>`;
    root.querySelectorAll('.cseg .cb').forEach((b) => { b.classList.toggle('on', b.dataset.v === S.view); b.setAttribute('aria-pressed', String(b.dataset.v === S.view)); });
  }
  function chip(e, showTime = true) {
    const tm = e.all_day ? '' : `<small>${hm(e.ostart)}</small>`;
    return `<div class="cchip${e.all_day ? ' cad' : ''}" style="--c:${e.color}" data-oid="${esc(e.oid)}" ${e.recurring ? '' : 'draggable="true"'} title="${esc(e.title)}">${e.all_day ? '' : '<i></i>'}${showTime ? tm : ''}<span>${esc(e.title)}</span></div>`;
  }
  function dayLabel(d, evs, hol) {
    return `${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${hol ? ', ' + hol.join(', ') : ''}, ${evs.length ? evs.length + ' event' + (evs.length > 1 ? 's' : '') + ': ' + evs.slice(0, 4).map((e) => (e.all_day ? '' : hm(e.ostart) + ' ') + e.title).join('; ') : 'nothing scheduled'}`;
  }
  function renderMonth() {
    const [a] = range(), m = S.cur.getMonth(), today = S.data.today, rowsH = $('#cal-view').clientHeight;
    const maxChips = Math.max(1, Math.floor(((rowsH - 22) / 6 - 30) / 19));
    const order = S.ws === 6 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    let h = `<div class="mgrid" role="grid" aria-label="${MN[m]} ${S.cur.getFullYear()}"><div class="cdh" role="presentation">WK</div>${order.map((i) => `<div class="cdh" role="columnheader">${DN[i]}</div>`).join('')}`;
    for (let r = 0; r < 6; r++) {
      h += `<div class="cwk" role="rowheader">${isoWeek(addDays(a, r * 7 + 3))}</div>`;
      for (let c = 0; c < 7; c++) {
        const d = addDays(a, r * 7 + c), di = iso(d), evs = evsOn(di), hol = S.data.holidays[di], wx = S.data.weather[di], moon = S.data.moon[di];
        const cls = ['cday', d.getMonth() !== m ? 'out' : '', di === today ? 'today' : '', di === iso(S.sel) ? 'sel' : '', [0, 6].includes(d.getDay()) ? 'wkend' : ''].join(' ');
        h += `<div class="${cls}" role="gridcell" tabindex="${di === iso(S.sel) ? 0 : -1}" data-d="${di}" aria-label="${esc(dayLabel(d, evs, hol))}" aria-selected="${di === iso(S.sel)}">
          <div class="n"><b>${d.getDate()}</b>${moon ? `<span title="${moon}" style="color:var(--dim)">${MOON[moon]}</span>` : ''}${wx ? `<span class="cwx" title="${Math.round(wx.min)}–${Math.round(wx.max)}°${wx.rain != null ? ', ' + wx.rain + '% rain' : ''}">${WX(wx.code)} ${Math.round(wx.max)}°</span>` : ''}</div>
          ${hol ? `<div class="chol">${esc(hol.join(' · '))}</div>` : ''}
          ${evs.slice(0, maxChips).map((e) => chip(e)).join('')}${evs.length > maxChips ? `<div class="cmore">+${evs.length - maxChips} more</div>` : ''}</div>`;
      }
    }
    $('#cal-view').innerHTML = h + '</div>';
  }
  function layoutCols(evs) {
    // assign side-by-side columns to overlapping timed events
    const out = [], active = [];
    for (const e of evs) {
      const s = mins(e.ostart), en = e.oend.slice(0, 10) > e.ostart.slice(0, 10) ? 1440 : Math.max(s + 15, mins(e.oend));
      for (let i = active.length - 1; i >= 0; i--) if (active[i].en <= s) active.splice(i, 1);
      let col = 0; while (active.some((x) => x.col === col)) col++;
      const item = { e, s, en, col }; active.push(item); out.push(item);
      const width = Math.max(...active.map((x) => x.col)) + 1; for (const x of active) x.n = Math.max(x.n || 1, width);
    }
    return out;
  }
  function renderTime(days) {
    const today = S.data.today, hh = 46, [w1, w2] = (S.data.work || ['09:00', '18:00']).map((x) => +x.slice(0, 2) * 60 + +x.slice(3, 5));
    let h = `<div class="tgrid" style="--cols:${days.length};--hh:${hh}px"><div class="thead"><div></div>${days.map((d) => `<div class="${iso(d) === today ? 'today' : ''}">${DN[(d.getDay() + 6) % 7]}<b>${d.getDate()}</b>${S.data.holidays[iso(d)] ? `<span style="color:var(--gold);letter-spacing:.04em">${esc(S.data.holidays[iso(d)][0])}</span>` : ''}</div>`).join('')}</div>`;
    h += `<div class="tall"><div class="lab">ALL DAY</div>${days.map((d) => `<div class="cell" data-d="${iso(d)}">${evsOn(iso(d)).filter((e) => e.all_day).map((e) => chip(e, false)).join('')}</div>`).join('')}</div>`;
    h += `<div class="tbody" id="cal-tb"><div class="tcols"><div class="hours">${Array.from({ length: 23 }, (_, i) => `<div style="top:${(i + 1) * hh}px">${pad(i + 1)}:00</div>`).join('')}</div>`;
    for (const d of days) {
      const di = iso(d), evs = evsOn(di).filter((e) => !e.all_day && e.ostart.slice(0, 10) === di);
      h += `<div class="tcol${di === today ? ' today' : ''}" data-d="${di}" role="group" aria-label="${esc(dayLabel(d, evs, S.data.holidays[di]))}">
        <div class="off" style="top:0;height:${w1 / 60 * hh}px"></div><div class="off" style="top:${w2 / 60 * hh}px;bottom:0"></div>`;
      for (const it of layoutCols(evs)) {
        const e = it.e, top = it.s / 60 * hh, ht = Math.max(20, (it.en - it.s) / 60 * hh - 2), w = 100 / it.n;
        h += `<div class="cev" style="--c:${e.color};top:${top}px;height:${ht}px;left:calc(${it.col * w}% + 2px);width:calc(${w}% - 4px)" data-oid="${esc(e.oid)}" tabindex="0" role="button" aria-label="${esc(e.title + ', ' + hm(e.ostart) + ' to ' + hm(e.oend) + (e.location ? ', ' + e.location : ''))}">
          <b>${esc(e.title)}</b><small>${hm(e.ostart)}–${hm(e.oend)}${e.location ? ' · ' + esc(e.location) : ''}${e.recurring ? ' ↻' : ''}</small></div>`;
      }
      if (di === today) { const n = new Date(); h += `<div class="nowline" style="top:${(n.getHours() * 60 + n.getMinutes()) / 60 * hh}px"></div>`; }
      h += '</div>';
    }
    $('#cal-view').innerHTML = h + '</div></div></div>';
    const tb = $('#cal-tb'); tb.scrollTop = Math.max(0, ((days.some((d) => iso(d) === today) ? new Date().getHours() - 2 : w1 / 60 - 1)) * hh);
  }
  function renderAgenda() {
    const [a] = range(), today = S.data.today;
    let h = '<div class="cagenda" role="list">', any = false;
    for (let i = 0; i < 60; i++) {
      const d = addDays(a, i), di = iso(d), evs = evsOn(di), hol = S.data.holidays[di], wx = S.data.weather[di];
      if (!evs.length && !hol) continue;
      any = true;
      h += `<div class="cad${di === today ? ' today' : ''}" role="listitem"><div class="cdd">${d.getDate()} <small>${d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase()} · ${MN[d.getMonth()].slice(0, 3).toUpperCase()}${wx ? ' · ' + WX(wx.code) + ' ' + Math.round(wx.max) + '°' : ''}</small></div><div>
        ${hol ? `<div class="crow"><span class="tm" style="color:var(--gold)">HOLIDAY</span><b style="color:var(--gold)">${esc(hol.join(' · '))}</b></div>` : ''}
        ${evs.map((e) => `<div class="crow" data-oid="${esc(e.oid)}" tabindex="0" role="button" style="--c:${e.color}"><i></i><span class="tm">${e.all_day ? 'ALL DAY' : hm(e.ostart) + '–' + hm(e.oend)}</span><b>${esc(e.title)}${e.recurring ? ' ↻' : ''}</b><span class="lc">${esc(e.location || '')}</span></div>`).join('')}</div></div>`;
    }
    $('#cal-view').innerHTML = h + (any ? '' : '<p style="color:var(--dim);padding:20px">Nothing in the next 60 days. Add something above.</p>') + '</div>';
  }
  function miniMonth(y, m, opts = {}) {
    const first = new Date(y, m, 1), a = weekStart(first), counts = {};
    if (S.data) for (const e of S.data.events) counts[e.ostart.slice(0, 10)] = (counts[e.ostart.slice(0, 10)] || 0) + 1;
    const order = S.ws === 6 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    let h = order.map((i) => `<span class="h">${DN[i][0]}</span>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(a, i), di = iso(d), out = d.getMonth() !== m;
      if (out && i >= 35) break;
      const c = counts[di] || 0, l = c >= 4 ? 3 : c >= 2 ? 2 : c ? 1 : 0;
      h += `<span class="${out ? 'o' : ''}${di === (S.data && S.data.today) ? ' t' : ''}${S.data && S.data.holidays[di] ? ' hol' : ''}${opts.sel && di === iso(S.sel) ? ' sel' : ''}" data-d="${di}" data-l="${out ? 0 : l}">${d.getDate()}</span>`;
    }
    return h;
  }
  async function renderYear() {
    const y = S.cur.getFullYear();
    $('#cal-view').innerHTML = `<div class="ygrid">${MN.map((n, i) => `<div class="cym" data-m="${i}" tabindex="0" role="button" aria-label="${n} ${y}"><h5>${n.toUpperCase()}</h5><div class="cmini">${miniMonth(y, i)}</div></div>`).join('')}</div>`;
  }
  function renderSide() {
    const c = S.cur;
    $('#cal-mini-h').textContent = `${MN[c.getMonth()]} ${c.getFullYear()}`.toUpperCase();
    $('#cal-mini').innerHTML = miniMonth(c.getFullYear(), c.getMonth(), { sel: true });
    const counts = {};
    for (const e of S.data.events) counts[e.cat] = (counts[e.cat] || 0) + 1;
    $('#cal-legend').innerHTML = Object.entries(S.data.cats || CATS).map(([k, col]) => `<button style="--c:${col}" data-cat="${k}" aria-pressed="${!S.hidden.has(k)}"><i></i>${k}<em>${counts[k] || ''}</em></button>`).join('');
    const now = new Date(), nowS = `${iso(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const up = S.data.events.filter((e) => e.oend > nowS && !S.hidden.has(e.cat)).slice(0, 6);
    $('#cal-up').innerHTML = up.map((e) => `<div class="crow" data-oid="${esc(e.oid)}" style="--c:${e.color}" tabindex="0" role="button"><i></i><div>${esc(e.title)}<small>${relDay(e.ostart)} ${e.all_day ? '' : hm(e.ostart)}</small></div></div>`).join('') || '<div class="crow" style="color:var(--dim)">Nothing coming up.</div>';
    // this week
    const ws = weekStart(now), we = addDays(ws, 7), [w1, w2] = (S.data.work || ['09:00', '18:00']).map((x) => +x.slice(0, 2) * 60 + +x.slice(3, 5));
    const wk = S.data.events.filter((e) => !e.all_day && e.ostart >= iso(ws) && e.ostart < iso(we));
    const booked = wk.reduce((s, e) => s + (new Date(e.oend.replace(' ', 'T')) - new Date(e.ostart.replace(' ', 'T'))) / 3600000, 0);
    let workBusy = 0;
    for (const e of wk) { const d = new Date(e.ostart.replace(' ', 'T')); if ([0, 6].includes(d.getDay())) continue; workBusy += Math.max(0, Math.min(w2, mins(e.oend) || 1440) - Math.max(w1, mins(e.ostart))) / 60; }
    const byDay = [0, 0, 0, 0, 0, 0, 0]; for (const e of wk) byDay[(new Date(e.ostart.replace(' ', 'T')).getDay() + 6) % 7]++;
    $('#cs-n').textContent = wk.length; $('#cs-h').textContent = booked.toFixed(1) + 'h';
    $('#cs-f').textContent = Math.max(0, 5 * (w2 - w1) / 60 - workBusy).toFixed(0) + 'h';
    $('#cs-b').textContent = wk.length ? DN[byDay.indexOf(Math.max(...byDay))] : '—';
    $('#co-cc').value = S.data.country || ''; $('#co-ws').value = String(S.ws);
    $('#co-w1').value = (S.data.work || [])[0] || ''; $('#co-w2').value = (S.data.work || [])[1] || '';
  }
  function relDay(s) {
    const d = parseISO(s), t = parseISO(S.data.today), n = Math.round((d - t) / 86400000);
    return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 && n > 0 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function render() {
    if (!S.data) return;
    title();
    if (S.view === 'month') renderMonth();
    else if (S.view === 'week') { const a = weekStart(S.cur); renderTime([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(a, i))); }
    else if (S.view === 'day') renderTime([S.cur]);
    else if (S.view === 'agenda') renderAgenda();
    else renderYear();
    renderSide();
  }

  /* ---------- navigation ---------- */
  function go(n) {
    const c = new Date(S.cur);
    if (S.view === 'month') { c.setDate(1); c.setMonth(c.getMonth() + n); S.sel = new Date(c); }
    else if (S.view === 'year') c.setFullYear(c.getFullYear() + n);
    else c.setDate(c.getDate() + n * (S.view === 'week' ? 7 : S.view === 'agenda' ? 30 : 1));
    S.cur = c; load();
  }
  function setView(v) { S.view = v; try { localStorage.setItem('jv-cal-view', v); } catch (e) { /* ignore */ } load(); }
  function goto(d, view) { S.cur = new Date(d); S.sel = new Date(d); if (view) S.view = view; load(); }

  /* ---------- editor ---------- */
  const F = ed.querySelector('form');
  function findOcc(oid) { return S.data && S.data.events.find((e) => e.oid === oid); }
  function openEditor(e, defaults = {}) {
    S.editing = e || null;
    const f = F.elements;
    const start = e ? e.ostart : defaults.start || `${iso(S.sel)} 09:00`, end = e ? e.oend : defaults.end || `${start.slice(0, 11)}${pad(Math.min(23, +start.slice(11, 13) + 1))}:${start.slice(14, 16)}`;
    f.title.value = e ? e.title : ''; f.date.value = start.slice(0, 10); f.t1.value = hm(start); f.t2.value = hm(end);
    f.all_day.checked = !!(e ? e.all_day : defaults.all_day); f.freq.value = e && e.recur ? e.recur.freq : ''; f.until.value = e && e.recur && e.recur.until || '';
    f.remind.value = String(e ? (e.remind ?? 10) : 10); if (!f.remind.value) f.remind.value = '10';
    f.cat.value = e ? e.cat : defaults.cat || 'other'; f.location.value = e ? e.location || '' : ''; f.notes.value = e ? e.notes || '' : '';
    $('#ce-h').textContent = e ? (e.recurring ? 'REPEATING EVENT · EDITS APPLY TO THE SERIES' : 'EDIT EVENT') : 'NEW EVENT';
    $('#ce-del').style.display = e ? '' : 'none'; $('#ce-dup').style.display = e ? '' : 'none';
    $('#ce-del1').style.display = $('#ce-delf').style.display = e && e.recurring ? '' : 'none';
    $('#ce-note').textContent = '';
    toggleTimes();
    ed.classList.add('show');
    setTimeout(() => f.title.focus(), 30);
  }
  function toggleTimes() { const ad = F.elements.all_day.checked; F.elements.t1.disabled = F.elements.t2.disabled = ad; }
  F.elements.all_day.addEventListener('change', toggleTimes);
  F.elements.title.addEventListener('input', () => { if (!S.editing) { const g = guessCat(F.elements.title.value); if (g) F.elements.cat.value = g; } });
  function guessCat(t) {
    const words = { work: /meet|standup|call|review|interview|client|deadline|demo/i, health: /gym|doctor|dentist|run|yoga|physio|swim/i, social: /dinner|lunch|drinks|party|coffee|brunch|pub/i,
      travel: /flight|train|trip|airport|hotel/i, birthday: /birthday|anniversary/i, focus: /focus|study|revise|deep work|write/i };
    return Object.keys(words).find((k) => words[k].test(t));
  }
  function closeEditor() { ed.classList.remove('show'); S.editing = null; }
  function formEvent() {
    const f = F.elements, ad = f.all_day.checked, date = f.date.value;
    const t1 = ad ? '00:00' : f.t1.value || '09:00', t2 = ad ? '00:00' : f.t2.value || t1;
    let end = `${date} ${t2}`;
    if (ad) end = `${iso(addDays(parseISO(date), 1))} 00:00`;
    else if (t2 <= t1) end = `${iso(addDays(parseISO(date), 1))} ${t2}`;
    const ev = { title: f.title.value.trim(), start: `${date} ${t1}`, end, all_day: ad, remind_min: +f.remind.value, cat: f.cat.value,
      location: f.location.value.trim(), notes: f.notes.value, recur: f.freq.value ? { freq: f.freq.value, ...(f.until.value ? { until: f.until.value } : {}), ...(S.editing && S.editing.recur && S.editing.recur.freq === f.freq.value && S.editing.recur.days ? { days: S.editing.recur.days } : {}) } : null };
    if (S.editing && S.editing.recurring) {   // editing a series from one occurrence: keep the series' first date, shift times only
      const e = S.editing, d0 = e.start.slice(0, 10);
      const shift = Math.round((parseISO(date) - parseISO(e.ostart.slice(0, 10))) / 86400000);
      const nd = iso(addDays(parseISO(d0), shift));
      ev.start = `${nd} ${t1}`; ev.end = ad ? `${iso(addDays(parseISO(nd), 1))} 00:00` : (t2 <= t1 ? `${iso(addDays(parseISO(nd), 1))} ${t2}` : `${nd} ${t2}`);
    }
    return ev;
  }
  F.addEventListener('submit', async (x) => {
    x.preventDefault();
    const ev = formEvent();
    if (!ev.title) { $('#ce-note').textContent = 'Give it a title.'; return; }
    if (S.editing) ev.id = S.editing.id;
    const r = await api('cal_save', ev);
    if (!r || !r.ok) { $('#ce-note').textContent = (r && r.error) || 'Could not save.'; return; }
    act(`CALENDAR · ${S.editing ? 'UPDATED' : 'ADDED'} · ${ev.title}`);
    say(`${S.editing ? 'Updated' : 'Added'} ${ev.title}`);
    if (r.clash && r.clash.length) toast('Clashes with ' + r.clash.join(', '), 5000);
    closeEditor(); load();
  });
  $('#ce-x').onclick = closeEditor;
  $('#ce-dup').onclick = () => { const e = S.editing; S.editing = null; $('#ce-h').textContent = 'NEW EVENT · COPY'; F.elements.title.value = e.title + ' (copy)'; $('#ce-del').style.display = $('#ce-dup').style.display = $('#ce-del1').style.display = $('#ce-delf').style.display = 'none'; };
  async function del(scope) {
    const e = S.editing; if (!e) return;
    await api('cal_delete', e.oid, scope, e.ostart.slice(0, 10));
    act(`CALENDAR · DELETED · ${e.title}`); say(`Deleted ${e.title}`);
    closeEditor(); load();
  }
  $('#ce-del').onclick = () => del('series'); $('#ce-del1').onclick = () => del('one'); $('#ce-delf').onclick = () => del('following');
  ed.addEventListener('keydown', (x) => { x.stopPropagation(); if (x.key === 'Escape') closeEditor(); });
  ed.addEventListener('click', (x) => { if (x.target === ed) closeEditor(); });

  /* ---------- interactions ---------- */
  root.addEventListener('click', (x) => {
    const c = x.target.closest('[data-oid]');
    if (c) { const e = findOcc(c.dataset.oid); if (e) openEditor(e); return; }
    const more = x.target.closest('.cmore'); if (more) { goto(parseISO(more.parentElement.dataset.d), 'day'); return; }
    const ym = x.target.closest('.cym'); if (ym) { S.cur = new Date(S.cur.getFullYear(), +ym.dataset.m, 1); S.sel = new Date(S.cur); setView('month'); return; }
    const mini = x.target.closest('.cmini.cside span[data-d]'); if (mini) { goto(parseISO(mini.dataset.d)); return; }
    const day = x.target.closest('.cday');
    if (day) {   // click selects (Enter or the Day button opens it); double-click creates an event there
      const d = parseISO(day.dataset.d);
      if (iso(d) === iso(S.sel)) return;
      S.sel = d;
      if (d.getMonth() !== S.cur.getMonth()) { S.cur = new Date(d); load().then(focusSel); } else { render(); focusSel(); }
      return;
    }
    const col = x.target.closest('.tcol');
    if (col) {
      const r = col.getBoundingClientRect(), m = Math.max(0, Math.round(((x.clientY - r.top) / 46 * 60) / 15) * 15);
      const s = `${col.dataset.d} ${pad(Math.floor(m / 60))}:${pad(m % 60)}`, e = Math.min(1439, m + 60);
      openEditor(null, { start: s, end: `${col.dataset.d} ${pad(Math.floor(e / 60))}:${pad(e % 60)}` });
      return;
    }
    const lg = x.target.closest('.clegend button'); if (lg) { const k = lg.dataset.cat; S.hidden.has(k) ? S.hidden.delete(k) : S.hidden.add(k); render(); return; }
    const vb = x.target.closest('.cseg .cb'); if (vb) { setView(vb.dataset.v); return; }
  });
  root.addEventListener('dblclick', (x) => { const day = x.target.closest('.cday'); if (day && !x.target.closest('[data-oid]')) openEditor(null, { start: `${day.dataset.d} 09:00`, end: `${day.dataset.d} 10:00` }); });
  root.addEventListener('mouseover', (x) => {
    const c = x.target.closest('[data-oid]'); if (!c) { tip.style.display = 'none'; return; }
    const e = findOcc(c.dataset.oid); if (!e) return;
    tip.style.setProperty('border-color', e.color);
    tip.innerHTML = `<b style="color:#fff">${esc(e.title)}</b><br>${e.all_day ? 'All day' : hm(e.ostart) + ' – ' + hm(e.oend)} · ${relDay(e.ostart)}${e.location ? '<br>📍 ' + esc(e.location) : ''}${e.recurring ? '<br>↻ Repeats ' + esc(e.recur.freq) : ''}${e.notes ? '<br><span style="color:var(--dim)">' + esc(e.notes.slice(0, 140)) + '</span>' : ''}`;
    tip.style.display = 'block';
  });
  root.addEventListener('mousemove', (x) => { if (tip.style.display === 'block') { tip.style.left = Math.min(innerWidth - 270, x.clientX + 14) + 'px'; tip.style.top = (x.clientY + 14) + 'px'; } });
  root.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  // drag an event chip to another day to reschedule it (keeps its time)
  root.addEventListener('dragstart', (x) => { const c = x.target.closest('[data-oid]'); if (c) { x.dataTransfer.setData('text/plain', c.dataset.oid); x.dataTransfer.effectAllowed = 'move'; tip.style.display = 'none'; } });
  root.addEventListener('dragover', (x) => { const d = x.target.closest('.cday,.tall .cell'); if (d) { x.preventDefault(); root.querySelectorAll('.drop').forEach((z) => z.classList.remove('drop')); d.classList.add('drop'); } });
  root.addEventListener('dragleave', (x) => { const d = x.target.closest('.cday'); if (d && !d.contains(x.relatedTarget)) d.classList.remove('drop'); });
  root.addEventListener('drop', async (x) => {
    const d = x.target.closest('.cday,.tall .cell'); root.querySelectorAll('.drop').forEach((z) => z.classList.remove('drop'));
    if (!d) return; x.preventDefault();
    const e = findOcc(x.dataTransfer.getData('text/plain')); if (!e) return;
    const shift = Math.round((parseISO(d.dataset.d) - parseISO(e.ostart.slice(0, 10))) / 86400000); if (!shift) return;
    const ns = new Date(e.start.replace(' ', 'T')); ns.setDate(ns.getDate() + shift);
    const ne = new Date(e.end.replace(' ', 'T')); ne.setDate(ne.getDate() + shift);
    const f = (q) => `${iso(q)} ${pad(q.getHours())}:${pad(q.getMinutes())}`;
    const r = await api('cal_save', { id: e.id, start: f(ns), end: f(ne) });
    if (r && r.ok) { act(`CALENDAR · MOVED · ${e.title} → ${d.dataset.d}`); say(`Moved ${e.title}`); load(); }
  });

  $('#cal-prev').onclick = () => go(-1); $('#cal-next').onclick = () => go(1);
  $('#cal-today').onclick = () => goto(new Date());
  $('#cal-x').onclick = () => close();
  $('#cal-new').onclick = () => openEditor(null);
  $('#cal-q').addEventListener('input', (x) => { S.q = x.target.value.trim().toLowerCase(); render(); });
  $('#cal-add').addEventListener('keydown', async (x) => {
    x.stopPropagation();
    if (x.key === 'Escape') { x.target.blur(); return; }
    if (x.key !== 'Enter' || !x.target.value.trim()) return;
    const r = await api('cal_quick', x.target.value.trim());
    if (!r || !r.ok) { toast((r && r.error) || 'Could not understand that.', 4000); return; }
    const e = r.event; x.target.value = '';
    act(`CALENDAR · ADDED · ${e.title}`); say(`Added ${e.title}, ${e.all_day ? e.start.slice(0, 10) : e.start}`);
    toast(`Added ${e.title} · ${e.all_day ? e.start.slice(0, 10) + ' all day' : e.start}${e.recur ? ' · repeats ' + e.recur.freq : ''}${r.clash && r.clash.length ? ' · clashes with ' + r.clash.join(', ') : ''}`, 5000);
    goto(parseISO(e.start));
  });
  for (const [q, k] of [['#co-cc', 'holiday_country'], ['#co-ws', 'week_start'], ['#co-w1', 'work_start'], ['#co-w2', 'work_end']]) {
    $(q).addEventListener('change', (x) => { call('set_setting', k, x.target.value.trim()); if (!hasBridge()) { if (k === 'week_start') { S.ws = +x.target.value; render(); } } });
    $(q).addEventListener('keydown', (x) => x.stopPropagation());
  }
  $('#co-exp').onclick = async () => toast(await api('cal_export') || 'Exported.', 6000);
  $('#co-imp').onclick = async () => {
    const p = prompt('Path to an .ics file (exported from Google Calendar, Outlook or Apple Calendar):');
    if (p) toast(await api('cal_import', p.trim().replace(/^"|"$/g, '')) || 'Import needs the WINNERS Bot app.', 6000), load();
  };

  // keyboard: arrows move the selected day, PageUp/PageDown change month, T today, D/W/M/A/Y views, N new, / search, Esc closes
  // capture phase on the document: while the calendar is open its shortcuts win over the HUD's, wherever focus is
  document.addEventListener('keydown', (x) => {
    if (!S.open || ed.classList.contains('show')) return;
    const ae = document.activeElement, inRoot = root.contains(ae);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(ae.tagName)) {
      if (inRoot) { if (x.key === 'Escape') ae.blur(); x.stopPropagation(); }
      return;   // typing in the command bar keeps working
    }
    if (x.ctrlKey || x.metaKey || x.altKey || x.key === 'Tab') return;
    x.stopPropagation();
    const k = x.key, mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k];
    if (mv && S.view === 'month') {
      x.preventDefault(); const d = addDays(S.sel, mv); S.sel = d;
      if (d.getMonth() !== S.cur.getMonth()) { S.cur = new Date(d); load().then(() => focusSel()); } else { render(); focusSel(); }
    } else if (mv && ['ArrowLeft', 'ArrowRight'].includes(k)) { x.preventDefault(); go(mv); }
    else if (k === 'PageUp' || k === 'PageDown') { x.preventDefault(); go(k === 'PageUp' ? -1 : 1); }
    else if (k === 'Enter' && S.view === 'month' && document.activeElement.classList.contains('cday')) goto(S.sel, 'day');
    else if (/^[tT]$/.test(k)) goto(new Date());
    else if (/^[dwmayDWMAY]$/.test(k)) setView({ d: 'day', w: 'week', m: 'month', a: 'agenda', y: 'year' }[k.toLowerCase()]);
    else if (/^[nN]$/.test(k)) { x.preventDefault(); openEditor(null); }
    else if (k === '/') { x.preventDefault(); $('#cal-add').focus(); }
    else if (k === 'Escape' || /^[cC]$/.test(k)) close();
    else return;
    if (!root.contains(document.activeElement)) setTimeout(() => (root.querySelector('.cday.sel') || root.querySelector('.cseg .cb.on'))?.focus(), 60);
  }, true);
  function focusSel() { const el = root.querySelector('.cday.sel'); if (el) el.focus(); }

  /* ---------- open / close ---------- */
  let lastFocus = null;
  function open(date, view) {
    if (date) { S.cur = typeof date === 'string' ? parseISO(date) : new Date(date); S.sel = new Date(S.cur); }
    if (view) S.view = view;
    if (!S.open) lastFocus = document.activeElement;
    S.open = true; root.classList.add('open'); document.body.classList.add('calopen');
    onOpen && onOpen(true);
    load().then(() => { if (S.view === 'month') focusSel(); else root.querySelector('.cseg .cb.on')?.focus(); });
  }
  function close() {
    S.open = false; root.classList.remove('open'); document.body.classList.remove('calopen'); tip.style.display = 'none'; closeEditor();
    onOpen && onOpen(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  window.addEventListener('resize', () => { if (S.open && S.view === 'month') render(); });
  setInterval(() => { if (S.open && ['day', 'week'].includes(S.view)) render(); }, 60000);   // keep the "now" line moving
  return { open, close, toggle: () => (S.open ? close() : open()), refresh: () => { if (S.open) load(); }, get isOpen() { return S.open; } };
}
