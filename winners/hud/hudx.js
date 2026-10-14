// WINNERS Bot HUD extras: the dense, always-alive layer around the core.
// Voice-reactive halo and telemetry arcs around the core, a status strip, live widgets (graphs, network, processes, weather,
// world clocks, agenda, background jobs), edge data streams, a frame, and a news and markets ticker.
// Everything is driven by real data from the WINNERS Bot core; in a plain browser it runs on sample data.

const $ = (q, r = document) => r.querySelector(q);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = () => (window.pywebview && window.pywebview.api) || null;
const call = async (fn, ...a) => { const x = api(); if (!x || typeof x[fn] !== 'function') return null; try { return await x[fn](...a); } catch (e) { return null; } };
const calm = () => document.body.classList.contains('calm');
const preview = () => !new URLSearchParams(location.search).has('app') && !api();

/* ------------------------------------------------------------------ styles */
const css = document.createElement('style');
css.textContent = `
#hx-fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
body.globe #hx-fx,body.model #hx-fx{opacity:0;transition:opacity .5s}
#hx-fx{transition:opacity .8s}
.hx-frame{position:fixed;width:46px;height:46px;pointer-events:none;z-index:4;opacity:.75}
.hx-frame svg{width:100%;height:100%;stroke:var(--accent);fill:none;stroke-width:1.2;filter:drop-shadow(0 0 4px rgba(var(--accent-rgb),.8))}
#hx-tl{top:8px;left:8px}#hx-tr{top:8px;right:8px;transform:scaleX(-1)}#hx-bl{bottom:8px;left:8px;transform:scaleY(-1)}#hx-br{bottom:8px;right:8px;transform:scale(-1)}
.hx-stream{position:fixed;top:90px;bottom:130px;width:74px;overflow:hidden;pointer-events:none;z-index:1;opacity:.22;
  font:8.5px/1.55 var(--mono);color:var(--accent);letter-spacing:.06em;-webkit-mask-image:linear-gradient(180deg,transparent,#000 15%,#000 85%,transparent);mask-image:linear-gradient(180deg,transparent,#000 15%,#000 85%,transparent)}
#hx-sl{left:6px}#hx-sr{right:6px;text-align:right}
.hx-stream div{animation:hxup 38s linear infinite}
@keyframes hxup{from{transform:translateY(0)}to{transform:translateY(-50%)}}
#hx-strip{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:6;display:flex;gap:2px;pointer-events:none;
  font:400 9px var(--mono);letter-spacing:.2em;color:var(--dim);text-transform:uppercase;white-space:nowrap}
#hx-strip div{padding:6px 12px 5px;background:linear-gradient(180deg,rgba(var(--accent-rgb),.10),rgba(var(--accent-rgb),.02));position:relative}
#hx-strip div:first-child{clip-path:polygon(10px 0,100% 0,100% 100%,0 100%,0 10px)}
#hx-strip div:last-child{clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%)}
#hx-strip div::after{content:"";position:absolute;left:12px;right:12px;bottom:0;height:1px;background:rgba(var(--accent-rgb),.35)}
#hx-strip b{font-weight:400;color:var(--txt);margin-left:6px}
#hx-strip i{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;background:var(--dim);vertical-align:1px}
#hx-strip i.ok{background:#7dffb0;box-shadow:0 0 8px #7dffb0;animation:pulse 2.4s infinite}#hx-strip i.warn{background:var(--gold);box-shadow:0 0 8px var(--gold);animation:pulse .8s infinite}
#hx-strip i.bad{background:var(--red);box-shadow:0 0 8px var(--red)}
@media (max-width:1250px){#hx-strip .hx-w{display:none}}
@media (max-width:950px){#hx-strip{display:none}}
#hx-tick{position:fixed;left:0;right:0;bottom:0;height:22px;z-index:5;overflow:hidden;pointer-events:none;
  background:linear-gradient(0deg,rgba(var(--accent-rgb),.07),transparent);border-top:1px solid rgba(var(--accent-rgb),.12);
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
#hx-tick div{position:absolute;left:0;top:0;white-space:nowrap;font:400 10px/22px var(--mono);letter-spacing:.14em;color:var(--dim);will-change:transform}
#hx-tick b{color:var(--accent);font-weight:400;margin:0 8px 0 26px}#hx-tick .up{color:#7dffb0}#hx-tick .dn{color:var(--red)}
#hx-tick em{font-style:normal;color:var(--txt)}
body.calm #hx-tick div{transform:none!important}
.hx-spark{display:block;width:100%;height:38px;margin:2px 0 6px}
.hx-procs .row{font:10.5px/1.75 var(--mono);color:var(--dim);letter-spacing:.04em}
.hx-procs .row b{font-weight:400;color:var(--txt)}
.hx-net{display:flex;gap:14px;font:10.5px var(--mono);color:var(--dim);letter-spacing:.1em;margin-bottom:6px}
.hx-net b{color:var(--txt);font-weight:400}
.hx-wx{display:flex;align-items:center;gap:14px}
.hx-wx .t{font:200 30px var(--ui);color:#fff;text-shadow:0 0 16px rgba(var(--accent-rgb),.7)}
.hx-wx .d{font-size:11px;color:var(--dim);line-height:1.5;letter-spacing:.05em}
.hx-wx .d b{color:var(--txt);font-weight:400;display:block;font-size:12.5px;letter-spacing:.03em}
.hx-days{display:flex;justify-content:space-between;margin-top:8px;font:9.5px var(--mono);color:var(--dim);text-align:center}
.hx-days b{display:block;color:var(--txt);font-weight:400}
.hx-clock{display:flex;align-items:center;gap:14px;justify-content:flex-end}
.hx-clock svg{width:74px;height:74px;flex:none}
.hx-zones{font:10.5px/1.8 var(--mono);color:var(--dim);letter-spacing:.08em}
.hx-zones b{color:var(--txt);font-weight:400;margin-left:8px}
.hx-ag .row{font-size:12px}
.hx-ag .row em{font-style:normal;font:10px var(--mono);color:var(--accent);flex:none}
.hx-job{margin:4px 0 8px}
.hx-job div{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--txt)}
.hx-job small{display:block;font:9.5px var(--mono);color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.hx-job i{display:block;height:2px;margin-top:5px;background:rgba(255,255,255,.07);position:relative;overflow:hidden}
.hx-job i::after{content:"";position:absolute;top:0;bottom:0;width:30%;background:var(--gold);box-shadow:0 0 8px var(--gold);animation:hxscan 1.6s ease-in-out infinite}
@keyframes hxscan{from{left:-30%}to{left:100%}}
body.ready #left .panel:nth-child(n+4){opacity:1;transform:translateX(4px) rotateY(16deg);transition-delay:.55s}
body.ready #right .panel:nth-child(n+4){opacity:1;transform:translateX(-4px) rotateY(-16deg);transition-delay:.65s}
.col{gap:10px}
.col .panel{padding-top:12px;padding-bottom:12px}
@media (max-height:820px){.hx-spark{height:28px}.hx-days{display:none}}
@media (max-height:760px){#hx-wxp,#hx-agp{display:none}}
`;
document.head.appendChild(css);

/* ------------------------------------------------------------------ DOM */
const corner = '<svg viewBox="0 0 46 46"><path d="M1 22V1h21"/><path d="M6 12V6h6" opacity=".5"/><circle cx="1" cy="1" r="2.5" fill="var(--accent)"/></svg>';
for (const id of ['hx-tl', 'hx-tr', 'hx-bl', 'hx-br']) { const d = document.createElement('div'); d.className = 'hx-frame'; d.id = id; d.innerHTML = corner; d.setAttribute('aria-hidden', 'true'); document.body.appendChild(d); }
const fx = document.createElement('canvas'); fx.id = 'hx-fx'; fx.setAttribute('aria-hidden', 'true'); document.body.appendChild(fx);
const streams = ['hx-sl', 'hx-sr'].map((id) => { const d = document.createElement('div'); d.className = 'hx-stream'; d.id = id; d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<div></div>'; document.body.appendChild(d); return d; });
const strip = document.createElement('div'); strip.id = 'hx-strip'; strip.setAttribute('aria-hidden', 'true');
strip.innerHTML = `<div><i id="hx-link"></i>LINK<b id="hx-linkt">STANDBY</b></div><div>SESSION<b id="hx-up">00:00:00</b></div>
<div class="hx-w">ACTIONS<b id="hx-acts">0</b></div><div class="hx-w">NET<b id="hx-netv">—</b></div><div class="hx-w">GPU<b id="hx-gpu">—</b></div><div>BUILD<b id="hx-ver">—</b></div>`;
document.body.appendChild(strip);
const tick = document.createElement('div'); tick.id = 'hx-tick'; tick.setAttribute('aria-hidden', 'true'); tick.innerHTML = '<div></div>'; document.body.appendChild(tick);
// the command bar sits above the ticker
const bar = $('#bar'); if (bar) bar.style.bottom = '38px';

function panel(html, id) { const p = document.createElement('div'); p.className = 'panel'; if (id) p.id = id; p.innerHTML = html; return p; }
const left = $('#left'), right = $('#right');
// SYSTEM: add a live graph and GPU meter
const sys = left.querySelector('.panel');
sys.insertAdjacentHTML('beforeend', '<div class="m" id="m-gpu" hidden><div>GPU <b>--</b></div><i></i></div><canvas class="hx-spark" id="hx-sys" aria-hidden="true"></canvas>');
const procP = panel('<h3>NETWORK · PROCESSES</h3><div class="hx-net">↓ <b id="hx-dn">—</b> ↑ <b id="hx-upl">—</b></div><canvas class="hx-spark" id="hx-netc" style="height:26px" aria-hidden="true"></canvas><div class="hx-procs" id="hx-procs"></div>', 'hx-procp');
const wxP = panel('<h3>ENVIRONMENT</h3><div id="hx-wx"><div class="row dim"><span>Linking to weather…</span></div></div>', 'hx-wxp');
sys.after(procP); procP.after(wxP);
const clockP = panel('<h3>CHRONOMETER</h3><div class="hx-clock"><div class="hx-zones" id="hx-zones"></div><svg viewBox="0 0 80 80" id="hx-clk" aria-hidden="true"></svg></div>', 'hx-clkp');
const agP = panel('<h3>AGENDA</h3><div class="hx-ag" id="hx-ag"><div class="row dim"><span>Checking your calendar…</span></div></div>', 'hx-agp');
const jobP = panel('<h3>BACKGROUND OPERATIONS</h3><div id="hx-jobs"></div>', 'hx-jobp'); jobP.classList.add('empty');
right.prepend(jobP); right.prepend(agP); right.prepend(clockP);

/* ------------------------------------------------------------------ live state */
const T = { lvlIn: 0, lvlOut: 0, state: 'STANDBY', cpu: [], ram: [], dn: [], upl: [], cpuNow: 0, ramNow: 0, netNow: 0, acts: 0, t0: Date.now(), link: 'STANDBY' };
const H = 60;
const push = (arr, v) => { arr.push(v); if (arr.length > H) arr.shift(); };
const fmtRate = (b) => b == null ? '—' : b > 1e6 ? (b / 1e6).toFixed(1) + ' Mb/s' : b > 1e3 ? (b / 1e3).toFixed(0) + ' kb/s' : Math.round(b) + ' b/s';

function setLink(kind, text) {
  T.link = text;
  const i = $('#hx-link'); i.className = kind; $('#hx-linkt').textContent = text;
}

function onStats(d) {
  T.cpuNow = d.cpu || 0; T.ramNow = d.ram || 0;
  push(T.cpu, T.cpuNow); push(T.ram, T.ramNow);
  if (d.down != null) { push(T.dn, d.down); push(T.upl, d.up || 0); T.netNow = d.down + (d.up || 0); $('#hx-dn').textContent = fmtRate(d.down); $('#hx-upl').textContent = fmtRate(d.up); $('#hx-netv').textContent = '↓' + fmtRate(d.down); }
  const g = $('#m-gpu');
  if (d.gpu != null) { g.hidden = false; g.style.setProperty('--v', Math.round(d.gpu) + '%'); g.querySelector('b').textContent = Math.round(d.gpu) + '%'; $('#hx-gpu').textContent = Math.round(d.gpu) + '%'; }
  if (d.procs) $('#hx-procs').innerHTML = d.procs.slice(0, 5).map(([n, c, m]) => `<div class="row"><span>${esc(n.replace(/\.exe$/i, ''))}</span><span><b>${c.toFixed(0)}%</b> · ${m} MB</span></div>`).join('');
  spark($('#hx-sys'), [[T.cpu, 100, 'accent'], [T.ram, 100, 'gold']]);
  const mx = Math.max(1e5, ...T.dn, ...T.upl);
  spark($('#hx-netc'), [[T.dn, mx, 'accent'], [T.upl, mx, 'gold']]);
}
window.addEventListener('jv-stats', (e) => onStats(e.detail || {}));

function spark(c, series) {
  if (!c || !c.clientWidth) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement);
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
  for (let y = 0; y <= 2; y++) { g.beginPath(); g.moveTo(0, Math.round(h * y / 2) + .5); g.lineTo(w, Math.round(h * y / 2) + .5); g.stroke(); }
  for (const [arr, max, col] of series) {
    if (arr.length < 2) continue;
    const color = col === 'gold' ? (cs.getPropertyValue('--gold').trim() || '#3de08c') : (cs.getPropertyValue('--accent').trim() || '#ffc93c');
    g.beginPath();
    arr.forEach((v, i) => { const x = w - (arr.length - 1 - i) * (w / (H - 1)), y = h - 2 - (Math.min(v, max) / max) * (h - 4); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = color; g.lineWidth = 1.4; g.shadowColor = color; g.shadowBlur = 6; g.stroke(); g.shadowBlur = 0;
    g.lineTo(w, h); g.lineTo(w - (arr.length - 1) * (w / (H - 1)), h); g.closePath();
    g.fillStyle = color; g.globalAlpha = 0.12; g.fill(); g.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ events from the core */
const prevOn = window.HUD.on;
window.HUD.on = (ev) => {
  try {
    if (ev.t === 'f') { T.lvlIn = ev.i || 0; T.lvlOut = ev.o || 0; T.state = ev.s || T.state; }
    else if (ev.t === 'act') { T.acts++; $('#hx-acts').textContent = T.acts; streamLine('> ' + ev.text); }
    else if (ev.t === 'log' && ev.who === 'sys') {
      const t = ev.text || '';
      if (/^Online/.test(t)) setLink('ok', 'GEMINI LIVE');
      else if (/Connection|Reconnecting|Retrying|refused/i.test(t)) setLink('warn', 'RE-LINKING');
      streamLine('# ' + t.slice(0, 60));
    }
    else if (ev.t === 'brain') { const m = /version\s+([\w.]+)/.exec(ev.model || ''); if (m) $('#hx-ver').textContent = m[1]; }
    else if (ev.t === 'jobs') renderJobs(ev.jobs || []);
    else if (ev.t === 'calendar_changed') loadAgenda();
  } catch (e) { /* never break the HUD */ }
  return prevOn(ev);
};
// the brain label is set once at boot; read the version from it
new MutationObserver(() => { const m = /version\s+([\w.]+)/.exec($('#brain-name')?.textContent || ''); if (m) $('#hx-ver').textContent = m[1]; })
  .observe($('#brain-name'), { childList: true, characterData: true, subtree: true });
new MutationObserver(() => {
  const st = document.body.dataset.state || '';
  if (st === 'SETUP') setLink('bad', 'NO KEY');
  else if (T.link === 'STANDBY' && st && st !== 'BOOT') setLink('ok', 'ONLINE');
}).observe(document.body, { attributes: true, attributeFilter: ['data-state'] });

/* ------------------------------------------------------------------ background jobs */
function renderJobs(jobs) {
  const run = jobs.filter((j) => /running|queued|start/i.test(j.status || ''));
  const recent = jobs.filter((j) => !run.includes(j)).slice(0, Math.max(0, 2 - run.length));
  const all = [...run, ...recent];
  jobP.classList.toggle('empty', !all.length);
  $('#hx-jobs').innerHTML = all.map((j) => `<div class="hx-job"><div><span>${esc(j.label || j.name || j.id)}</span><span style="color:${run.includes(j) ? 'var(--gold)' : (/done/i.test(j.status) ? '#7dffb0' : 'var(--red)')}">${esc((j.status || '').toUpperCase())}</span></div>
    <small>${esc(j.progress || j.summary || '')}</small>${run.includes(j) ? '<i></i>' : ''}</div>`).join('');
}

/* ------------------------------------------------------------------ clock and world time */
const ZONES = [['LONDON', 'Europe/London'], ['NEW YORK', 'America/New_York'], ['TOKYO', 'Asia/Tokyo'], ['DUBAI', 'Asia/Dubai'], ['LOS ANGELES', 'America/Los_Angeles']];
const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = ZONES.filter(([, z]) => z !== here).slice(0, 3);
function drawClock() {
  const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
  const pt = (a, r) => [40 + r * Math.sin(a), 40 - r * Math.cos(a)];
  const hand = (a, r, w, c) => { const [x, y] = pt(a, r); return `<line x1="40" y1="40" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`; };
  let ticks = '';
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, [x1, y1] = pt(a, i % 5 ? 34 : 31), [x2, y2] = pt(a, 36); ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--accent)" stroke-opacity="${i % 5 ? .3 : .8}"/>`; }
  const sa = s / 60 * Math.PI * 2, [sx, sy] = pt(sa, 38);
  const large = s / 60 > 0.5 ? 1 : 0;
  $('#hx-clk').innerHTML = `<circle cx="40" cy="40" r="38" stroke="rgba(255,255,255,.08)" fill="none"/>
    <path d="M40 2 A38 38 0 ${large} 1 ${sx.toFixed(2)} ${sy.toFixed(2)}" stroke="var(--accent)" fill="none" stroke-width="1.6" style="filter:drop-shadow(0 0 3px var(--accent))"/>${ticks}
    ${hand(h / 12 * Math.PI * 2, 18, 2.2, '#fff')}${hand(m / 60 * Math.PI * 2, 27, 1.4, '#fff')}${hand(sa, 31, .8, 'var(--gold)')}<circle cx="40" cy="40" r="2" fill="var(--accent)"/>`;
  if (d.getSeconds() % 10 === 0 || !$('#hx-zones').innerHTML) {
    $('#hx-zones').innerHTML = zones.map(([n, z]) => { let t = '--:--'; try { t = d.toLocaleTimeString('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit' }); } catch (e) {} return `<div>${n}<b>${t}</b></div>`; }).join('')
      + `<div style="color:var(--accent)">${d.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase()}<b>${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}</b></div>`;
  }
  const up = Math.floor((Date.now() - T.t0) / 1000);
  $('#hx-up').textContent = [up / 3600, (up / 60) % 60, up % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':');
}
setInterval(drawClock, calm() ? 1000 : 250); drawClock();

/* ------------------------------------------------------------------ weather */
const WX = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
async function loadWeather() {
  const w = preview() ? { name: 'London', current: { temp: 14.2, code: 2, wind: 11 }, daily: ['Tue 13', 'Wed 14', 'Thu 15', 'Fri 16', 'Sat 17'].map((d, i) => ({ day: d, max: 15 + i % 3, min: 8 + i % 2, code: i % 3 ? 2 : 61 })) }
    : await call('weather_panel', '');
  const el = $('#hx-wx');
  if (!w) return;
  if (w.error) { el.innerHTML = `<div class="row dim"><span title="${esc(w.error)}">Say “set my home to …” for local weather</span></div>`; return; }
  el.innerHTML = `<div class="hx-wx"><div class="t">${Math.round(w.current.temp)}°</div><div class="d"><b>${esc(w.name)}</b>${WX[w.current.code] || 'Weather'} · wind ${Math.round(w.current.wind)} km/h</div></div>
    <div class="hx-days">${(w.daily || []).slice(1, 6).map((d) => `<div>${esc(String(d.day).slice(0, 3).toUpperCase())}<b>${Math.round(d.max)}°</b>${Math.round(d.min)}°</div>`).join('')}</div>`;
}

/* ------------------------------------------------------------------ agenda */
async function loadAgenda() {
  const el = $('#hx-ag');
  const iso = (d) => d.toISOString().slice(0, 10);
  const now = new Date(), end = new Date(now.getTime() + 7 * 864e5);
  let evs;
  if (preview()) evs = [{ title: 'Team stand-up', start: iso(now) + 'T09:30' }, { title: 'Gym', start: iso(now) + 'T18:00' }, { title: 'Dentist', start: iso(new Date(now.getTime() + 864e5)) + 'T11:15' }];
  else {
    const r = await call('cal_range', iso(now), iso(end));
    if (!r) return;
    evs = r.events || r.items || (Array.isArray(r) ? r : []);
  }
  const upcoming = evs.map((e) => ({ t: e.title || e.summary || 'Event', s: String(e.ostart || e.start || e.date || '').replace(' ', 'T'), allDay: !!e.all_day }))
    .filter((e) => e.s && new Date(e.s.length > 10 ? e.s : e.s + 'T23:59') >= new Date(now.getTime() - 36e5))
    .sort((a, b) => a.s.localeCompare(b.s)).slice(0, 4);
  if (!upcoming.length) { el.innerHTML = '<div class="row dim"><span>Nothing in the next 7 days</span></div>'; return; }
  el.innerHTML = upcoming.map((e) => {
    const d = new Date(e.s.length > 10 ? e.s : e.s + 'T00:00');
    const today = d.toDateString() === now.toDateString();
    const when = (today ? 'TODAY' : d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()) + (e.s.length > 10 && !e.allDay ? ' ' + e.s.slice(11, 16) : '');
    return `<div class="row"><span>${esc(e.t)}</span><em>${when}</em></div>`;
  }).join('');
}

/* ------------------------------------------------------------------ ticker */
let tickItems = [];
async function loadTicker() {
  const parts = [];
  if (preview()) {
    parts.push('<b>WORLD NEWS</b><em>Sample headline: markets rally as tech shares climb</em> &nbsp;◆&nbsp; <em>Sample headline: new space telescope images released</em>', '<b>MARKETS</b>BTC <em>$67,420</em> <span class="up">▲2.1%</span> &nbsp; ETH <em>$3,180</em> <span class="dn">▼0.8%</span>');
  } else {
    const n = await call('news_items', '', '');
    if (n && n.items && n.items.length) parts.push('<b>WORLD NEWS</b>' + n.items.slice(0, 12).map((i) => `<em>${esc(i.title)}</em>`).join(' &nbsp;◆&nbsp; '));
    const c = await call('crypto_prices', ['bitcoin', 'ethereum', 'solana'], 'usd');
    if (c && c.rows) parts.push('<b>MARKETS</b>' + c.rows.map((r) => `${r.id.slice(0, 3).toUpperCase()} <em>$${Number(r.price).toLocaleString('en-US', { maximumFractionDigits: r.price > 100 ? 0 : 2 })}</em> <span class="${r.change >= 0 ? 'up' : 'dn'}">${r.change >= 0 ? '▲' : '▼'}${Math.abs(r.change).toFixed(1)}%</span>`).join(' &nbsp; '));
  }
  parts.unshift('<b>THE WINNERS CLUB N.I</b><em>winnersclubni.com</em> &nbsp;◆&nbsp; <em>Free-to-enter competitions</em> &nbsp;◆&nbsp; <em>Live draws</em> &nbsp;◆&nbsp; <em>Fast payouts</em> &nbsp;◆&nbsp; <em>Newtownards, Co. Down</em>');
  tickItems = parts;
  const d = tick.firstElementChild;
  const one = parts.join(' &nbsp; ') + ' &nbsp; ';
  d.innerHTML = one + one;   // doubled for a seamless loop
  tickX = 0;
}
let tickX = 0, tickLast = performance.now();
function tickStep(now) {
  const d = tick.firstElementChild, dt = Math.min(100, now - tickLast); tickLast = now;
  if (!calm() && d.scrollWidth > 0) { tickX -= dt * 0.045; const half = d.scrollWidth / 2; if (-tickX > half) tickX += half; d.style.transform = `translateX(${tickX.toFixed(1)}px)`; }
}

/* ------------------------------------------------------------------ data streams at the screen edges */
const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0');
const lines = [[], []];
function streamLine(t) { const side = lines[0].length > lines[1].length ? 1 : 0; lines[side].push(String(t).slice(0, 14).toUpperCase()); }
function fillStreams() {
  streams.forEach((s, k) => {
    const L = lines[k].splice(0);
    const rows = [];
    for (let i = 0; i < 60; i++) {
      const r = Math.random();
      rows.push(L.length && r < 0.25 ? L.shift() : r < 0.5 ? hex() : r < 0.7 ? `${['CPU', 'MEM', 'NET', 'AUD', 'SYS'][i % 5]} ${(k ? T.ramNow : T.cpuNow).toFixed(1)}` : r < 0.85 ? `0x${hex().slice(0, 4)} ${['OK', 'ACK', 'SYN', 'RX', 'TX'][i % 5]}` : `${(Math.random() * 360).toFixed(2)}°`);
    }
    s.firstElementChild.innerHTML = [...rows, ...rows].map((r) => `<span style="display:block">${esc(r)}</span>`).join('');
  });
}
fillStreams(); setInterval(fillStreams, 38000);

/* ------------------------------------------------------------------ the core halo: voice spectrum and telemetry arcs */
const g = fx.getContext('2d');
let W = 0, Hh = 0, dpr = 1;
function resize() { dpr = Math.min(devicePixelRatio || 1, 1.5); W = innerWidth; Hh = innerHeight; fx.width = Math.round(W * dpr); fx.height = Math.round(Hh * dpr); }
addEventListener('resize', resize); resize();
const N = 120, bars = new Float32Array(N), phase = Array.from({ length: N }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
let sIn = 0, sOut = 0, rot = 0, sCpu = 0, sRam = 0, sNet = 0, last = performance.now();
function arc(cx, cy, r, a0, a1, color, width, glow) {
  g.beginPath(); g.arc(cx, cy, r, a0, a1); g.strokeStyle = color; g.lineWidth = width;
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.stroke(); g.shadowBlur = 0;
}
function label(t, x, y, color, align) { g.font = '400 9.5px ' + getComputedStyle(document.body).getPropertyValue('--mono'); g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); }
function frame(now) {
  requestAnimationFrame(frame);
  tickStep(now);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (document.hidden) return;
  const cs = getComputedStyle(document.documentElement), ac = cs.getPropertyValue('--accent').trim() || '#ffc93c', gold = cs.getPropertyValue('--gold').trim() || '#3de08c';
  const rgb = cs.getPropertyValue('--accent-rgb').trim() || '255,201,60';
  const k = 1 - Math.exp(-dt * 10);
  sIn += (T.lvlIn - sIn) * k; sOut += (T.lvlOut - sOut) * k;
  sCpu += (T.cpuNow - sCpu) * (1 - Math.exp(-dt * 2)); sRam += (T.ramNow - sRam) * (1 - Math.exp(-dt * 2));
  sNet += (Math.min(1, Math.log10(1 + T.netNow / 1e4) / 3) - sNet) * (1 - Math.exp(-dt * 2));
  rot += dt * (calm() ? 0.02 : 0.12);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
  const cx = W / 2, cy = Hh * 0.47, R = Math.min(W, Hh) * 0.155;
  // voice halo: radial bars, gold for you, accent for WINNERS Bot
  const speaking = T.state === 'SPEAKING', lvl = Math.max(sIn, sOut), col = speaking || sOut > sIn ? ac : gold;
  for (let i = 0; i < N; i++) {
    const p = phase[i], wob = 0.5 + 0.5 * Math.sin(now / 1000 * (2 + p * 5) + p * 20);
    const target = 0.04 + lvl * (0.35 + 0.65 * wob) * (0.6 + 0.4 * Math.sin(i / N * Math.PI * 6 + now / 700));
    bars[i] += (target - bars[i]) * (calm() ? 0.05 : 0.25);
    const a = i / N * Math.PI * 2 + rot * 0.4, len = R * 0.42 * bars[i];
    const x1 = cx + Math.cos(a) * R, y1 = cy + Math.sin(a) * R, x2 = cx + Math.cos(a) * (R + len), y2 = cy + Math.sin(a) * (R + len);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.strokeStyle = `rgba(${col === gold ? '61,224,140' : rgb},${0.25 + bars[i] * 1.6})`; g.lineWidth = 1.6; g.stroke();
  }
  // inner tick ring and rotating segments
  g.save(); g.translate(cx, cy); g.rotate(-rot);
  for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * (R * 0.93), Math.sin(a) * (R * 0.93)); g.lineTo(Math.cos(a) * (R * (i % 6 ? 0.96 : 0.9)), Math.sin(a) * (R * (i % 6 ? 0.96 : 0.9))); g.strokeStyle = `rgba(${rgb},${i % 6 ? 0.18 : 0.45})`; g.lineWidth = 1; g.stroke(); }
  g.restore();
  for (let s = 0; s < 3; s++) arc(cx, cy, R * 1.62, rot * 1.6 + s * 2.094, rot * 1.6 + s * 2.094 + 0.5, `rgba(${rgb},.35)`, 1.2, 0);
  // telemetry arcs left (CPU) and right (memory), outer (network)
  const RA = Math.min(W * 0.27, Hh * 0.43);
  const L0 = Math.PI * 0.78, L1 = Math.PI * 1.22, R0 = -Math.PI * 0.22, R1 = Math.PI * 0.22;
  arc(cx, cy, RA, L0, L1, 'rgba(255,255,255,.07)', 3); arc(cx, cy, RA, R0, R1, 'rgba(255,255,255,.07)', 3);
  arc(cx, cy, RA, L0, L0 + (L1 - L0) * (sCpu / 100), ac, 3, 10);          // both fill from the bottom up
  arc(cx, cy, RA, R1 - (R1 - R0) * (sRam / 100), R1, gold, 3, 10);
  for (let i = 0; i <= 20; i++) {
    for (const [a0, a1] of [[L0, L1], [R0, R1]]) {
      const a = a0 + (a1 - a0) * i / 20, r1 = RA + 6, r2 = RA + (i % 5 ? 10 : 15);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.strokeStyle = `rgba(${rgb},${i % 5 ? .2 : .5})`; g.lineWidth = 1; g.stroke();
    }
  }
  const lp = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  let [lx, ly] = lp(L1, RA + 4); label('CPU LOAD', lx, ly - 10, `rgba(${rgb},.6)`, 'center');
  [lx, ly] = lp(L0, RA + 4); label(Math.round(sCpu) + '%', lx, ly + 18, ac, 'center');
  [lx, ly] = lp(R0, RA + 4); label('MEMORY', lx, ly - 10, `rgba(${rgb},.6)`, 'center');
  [lx, ly] = lp(R1, RA + 4); label(Math.round(sRam) + '%', lx, ly + 18, gold, 'center');
  // scanning reticle that follows the state
  const pulse = T.state === 'THINKING' ? (Math.sin(now / 160) + 1) / 2 : T.state === 'LISTENING' ? 0.6 : 0.25;
  g.setLineDash([2, 6]); arc(cx, cy, R * 2.05, 0, Math.PI * 2, `rgba(${rgb},${0.08 + pulse * 0.18})`, 1); g.setLineDash([]);
}
requestAnimationFrame(frame);

/* ------------------------------------------------------------------ preview data + refresh loops */
function boot() {
  loadWeather(); loadAgenda(); loadTicker();
  setInterval(loadWeather, 20 * 60 * 1000); setInterval(loadAgenda, 5 * 60 * 1000); setInterval(loadTicker, 10 * 60 * 1000);
  if (preview()) {
    setLink('warn', 'PREVIEW'); $('#hx-ver').textContent = 'PREVIEW';
    const names = ['chrome', 'Code', 'Discord', 'RobloxStudioBeta', 'explorer', 'Spotify'];
    setInterval(() => {
      const t = Date.now() / 1000;
      window.dispatchEvent(new CustomEvent('jv-stats', { detail: { cpu: 22 + 14 * Math.sin(t / 7) + Math.random() * 6, ram: 58 + 4 * Math.sin(t / 30), gpu: 30 + 20 * Math.sin(t / 5),
        down: 2e6 + 1.5e6 * Math.sin(t / 3) + Math.random() * 5e5, up: 2e5 + Math.random() * 1e5,
        procs: names.map((n, i) => [n + '.exe', Math.max(0.1, 18 / (i + 1) + Math.random() * 3), 900 - i * 130]) } }));
    }, 1000);
    renderJobs([{ id: 'r1', label: 'Research: best gaming monitors 2026', status: 'running', progress: 'reading [6] rtings.com' }, { id: 'a1', label: 'Organise Downloads folder', status: 'done', summary: 'Moved 214 files into 9 folders' }]);
  }
}
setTimeout(boot, 1200);
