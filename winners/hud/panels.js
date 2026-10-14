/* WINNERS Bot floating holographic panels: things WINNERS Bot (or you) put on the screen and you move with your mouse or your
   HANDS (pinch to grab, move, release; pinch with both hands to resize; quick pinch = click).
   Kinds: youtube, video, web, image, stats, clock, weather, note, timer, stopwatch, chart, crypto, news, agenda, camera,
   plus processes and quote. Layout is remembered between sessions. */

const CSS = `
#panels{position:fixed;inset:0;z-index:15;pointer-events:none}
.wp{position:absolute;pointer-events:auto;display:flex;flex-direction:column;min-width:180px;min-height:110px;
  background:linear-gradient(160deg,rgba(var(--accent-rgb),.13),rgba(17,20,36,.82) 38%,rgba(17,20,36,.88));backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);
  box-shadow:inset 0 0 0 1px rgba(var(--accent-rgb),.22),0 18px 50px rgba(0,0,0,.55),0 0 30px rgba(var(--accent-rgb),.10);
  clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px));animation:wpin .55s cubic-bezier(.2,.8,.2,1);transition:box-shadow .2s,opacity .25s}
@keyframes wpin{0%{opacity:0;transform:scale(.92) translateY(14px);filter:brightness(2.5) blur(2px)}60%{filter:brightness(1.4)}100%{opacity:1;transform:none;filter:none}}
.wp.out{opacity:0;transform:scale(.94);transition:opacity .25s,transform .25s}
.wp.grab{box-shadow:inset 0 0 0 1px var(--accent),0 24px 70px rgba(0,0,0,.6),0 0 46px rgba(var(--accent-rgb),.45)}
.wp.hover{box-shadow:inset 0 0 0 1px rgba(var(--accent-rgb),.7),0 18px 50px rgba(0,0,0,.55),0 0 36px rgba(var(--accent-rgb),.3)}
.wp .wh{display:flex;align-items:center;gap:8px;padding:7px 8px 7px 14px;cursor:move;flex:none;user-select:none;-webkit-user-select:none}
.wp .wh b{flex:1;min-width:0;font:400 9.5px var(--ui);letter-spacing:.3em;color:var(--accent);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 10px rgba(var(--accent-rgb),.5)}
.wp .wh i{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent);flex:none}
.wp .wh button{border:0;background:none;color:var(--dim);cursor:pointer;width:22px;height:22px;border-radius:50%;font-size:12px;display:grid;place-items:center}
.wp .wh button:hover{color:#fff;background:rgba(var(--accent-rgb),.18)}
.wp .wb{flex:1;min-height:0;position:relative;overflow:hidden;margin:0 8px 8px}
.wp .wb iframe,.wp .wb video,.wp .wb img{width:100%;height:100%;border:0;display:block;object-fit:contain;background:#000}
.wp .rz{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 55%,rgba(var(--accent-rgb),.6) 56%,transparent 62%,transparent 70%,rgba(var(--accent-rgb),.6) 71%,transparent 77%)}
.wp.min .wb,.wp.min .rz{display:none}.wp.min{min-height:0;height:auto!important}
.wp .shield{position:absolute;inset:0;display:none}.wp.grab .shield,#panels.dragging .shield{display:block}
.wfall{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:var(--dim);font-size:12px;padding:20px;background:rgba(0,0,0,.4)}
.wbig{font:200 52px var(--mono);color:#fff;text-shadow:0 0 24px rgba(var(--accent-rgb),.7);letter-spacing:.04em;line-height:1}
.wsub{font:400 9.5px var(--ui);letter-spacing:.3em;color:var(--dim);text-transform:uppercase;margin-top:6px}
.wrow{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.05);color:var(--txt)}
.wrow b{font:400 12px var(--mono);color:#fff}.wrow.up b{color:#7dffb0}.wrow.down b{color:var(--red)}
.wscroll{position:absolute;inset:0;overflow:auto;padding:4px 6px;scrollbar-width:thin}
.wnote{position:absolute;inset:0;overflow:auto;padding:8px 10px;font-size:13px;line-height:1.6;color:var(--txt);user-select:text;-webkit-user-select:text}
.wnote h1,.wnote h2,.wnote h3{font-weight:300;color:#fff;margin:8px 0 4px}.wnote code{font-family:var(--mono);background:rgba(255,255,255,.07);padding:0 4px}
.wnote ul{padding-left:18px}.wnote a{color:var(--accent)}
.wspark{display:block;width:100%;height:46px}
.wstat{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px}
.wstat div{background:rgba(var(--accent-rgb),.06);padding:8px 10px}
.wstat b{display:block;font:300 22px var(--mono);color:#fff}.wstat span{font-size:8.5px;letter-spacing:.26em;color:var(--dim)}
.wring{display:block;margin:0 auto}
.wbtns{display:flex;gap:6px;justify-content:center;margin-top:8px}
.wbtns button{border:0;cursor:pointer;background:rgba(255,255,255,.07);color:var(--txt);font:400 9.5px var(--ui);letter-spacing:.2em;text-transform:uppercase;padding:7px 12px;border-radius:99px}
.wbtns button:hover{background:rgba(var(--accent-rgb),.25);color:#fff}
.wnews a{display:block;color:var(--txt);text-decoration:none;font-size:12.5px;line-height:1.45;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.05)}
.wnews a:hover{color:#fff}.wnews small{display:block;color:var(--dim);font:400 9.5px var(--mono);margin-top:2px}
#hand-cur{position:fixed;left:0;top:0;width:38px;height:38px;margin:-19px 0 0 -19px;z-index:60;pointer-events:none;display:none;border-radius:50%;
  border:2px solid var(--accent);box-shadow:0 0 18px var(--accent),inset 0 0 12px rgba(var(--accent-rgb),.4);transition:width .12s,height .12s,margin .12s,background .12s}
#hand-cur::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 8px #fff}
#hand-cur.pinch{width:24px;height:24px;margin:-12px 0 0 -12px;background:rgba(var(--accent-rgb),.35)}
#hand-cur.b{border-color:var(--gold);box-shadow:0 0 18px var(--gold)}
`;

const pad = (n) => String(n).padStart(2, '0');
const ICON = { youtube: '▶', video: '▶', web: '◎', image: '▣', stats: '≋', clock: '◷', weather: '☁', note: '✎', timer: '◔', stopwatch: '◔', chart: '▤', crypto: '◈', news: '☰', agenda: '▦', camera: '◉', processes: '≡', quote: '❝' };

function md(t) {   // tiny, safe markdown: headings, bold, italics, code, bullets, links
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let h = '', list = false;
  for (const raw of String(t || '').split('\n')) {
    let l = esc(raw).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    if (/^\s*[-*] /.test(raw)) { if (!list) { h += '<ul>'; list = true; } h += '<li>' + l.replace(/^\s*[-*] /, '') + '</li>'; continue; }
    if (list) { h += '</ul>'; list = false; }
    const m = raw.match(/^(#{1,3}) /);
    h += m ? `<h${m[1].length}>${l.slice(m[0].length)}</h${m[1].length}>` : (l.trim() ? `<p>${l}</p>` : '');
  }
  return h + (list ? '</ul>' : '');
}
function spark(canvas, vals, max = 100, color = '244,246,255') {
  const c = canvas.getContext('2d'), w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
  c.clearRect(0, 0, w, h);
  if (vals.length < 2) return;
  const x = (i) => (i / (vals.length - 1)) * w, y = (v) => h - (Math.min(max, v) / max) * (h - 6) - 3;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `rgba(${color},.35)`); g.addColorStop(1, `rgba(${color},0)`);
  c.beginPath(); c.moveTo(0, h); vals.forEach((v, i) => c.lineTo(x(i), y(v))); c.lineTo(w, h); c.fillStyle = g; c.fill();
  c.beginPath(); vals.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)))); c.strokeStyle = `rgb(${color})`; c.lineWidth = 3; c.stroke();
}
function chart(canvas, d) {
  const c = canvas.getContext('2d'), w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
  const pal = ['244,246,255', '111,134,255', '125,255,176', '201,162,255', '255,122,138', '255,143,200'];
  c.clearRect(0, 0, w, h); c.font = '20px Bahnschrift, Segoe UI, sans-serif';
  const series = (d.series || []).filter((s) => Array.isArray(s.values));
  const labels = d.labels || (series[0] ? series[0].values.map((_, i) => String(i + 1)) : []);
  if (!series.length) return;
  if ((d.type || 'line') === 'pie') {
    const vals = series[0].values, tot = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1, r = Math.min(w, h) * 0.38;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / tot) * Math.PI * 2;
      c.beginPath(); c.moveTo(w * 0.35, h / 2); c.arc(w * 0.35, h / 2, r, a0, a1); c.closePath();
      c.fillStyle = `rgba(${pal[i % pal.length]},.55)`; c.fill(); c.strokeStyle = `rgb(${pal[i % pal.length]})`; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#f4f6ff'; c.fillText(`${labels[i] || ''}  ${Math.round((v / tot) * 100)}%`, w * 0.68, 40 + i * 30);
      a0 = a1;
    });
    return;
  }
  const all = series.flatMap((s) => s.values), max = Math.max(...all, 0), min = Math.min(...all, 0), L = 60, B = 40;
  const X = (i, n) => L + (i / Math.max(1, n - 1)) * (w - L - 20), Y = (v) => h - B - ((v - min) / ((max - min) || 1)) * (h - B - 20);
  c.strokeStyle = 'rgba(244,246,255,.15)'; c.fillStyle = '#8a93b8';
  for (let k = 0; k <= 4; k++) { const v = min + ((max - min) * k) / 4, yy = Y(v); c.beginPath(); c.moveTo(L, yy); c.lineTo(w - 10, yy); c.stroke(); c.fillText(+v.toFixed(1), 4, yy + 6); }
  labels.forEach((lb, i) => { if (labels.length < 14 || i % Math.ceil(labels.length / 12) === 0) c.fillText(String(lb).slice(0, 8), X(i, labels.length) - 14, h - 10); });
  series.forEach((s, si) => {
    const col = pal[si % pal.length], n = s.values.length;
    if (d.type === 'bar') {
      const bw = (w - L - 20) / Math.max(1, n) / series.length * 0.8;
      s.values.forEach((v, i) => { const x0 = L + (i / n) * (w - L - 20) + si * bw, y0 = Y(Math.max(0, v)); c.fillStyle = `rgba(${col},.6)`; c.fillRect(x0, y0, bw - 2, Math.abs(Y(v) - Y(0)) || 2); });
    } else {
      c.beginPath(); s.values.forEach((v, i) => (i ? c.lineTo(X(i, n), Y(v)) : c.moveTo(X(i, n), Y(v)))); c.strokeStyle = `rgb(${col})`; c.lineWidth = 3; c.stroke();
    }
    c.fillStyle = `rgb(${col})`; c.fillText(s.name || '', w - 200, 30 + si * 26);
  });
}

export function createPanels({ call, hasBridge, esc, act, toast, say, vision }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'panels'; document.body.appendChild(root);
  const cur = document.createElement('div'); cur.id = 'hand-cur'; document.body.appendChild(cur);
  const panels = new Map();
  let nextId = 1, zTop = 20;
  const stats = { cpu: [], ram: [], last: {} };
  window.addEventListener('jv-stats', (e) => {
    const d = e.detail; stats.last = d;
    stats.cpu.push(d.cpu); stats.ram.push(d.ram);
    if (stats.cpu.length > 90) { stats.cpu.shift(); stats.ram.shift(); }
  });
  const ext = (url) => window.open(url, '_blank');

  /* ---------- kinds ---------- */
  const KINDS = {
    youtube: {
      size: [640, 400],
      mount(b, s) {
        const id = s.videoId || ((String(s.url || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1]);
        if (!id) { b.innerHTML = '<div class="wfall">No YouTube video found.</div>'; return {}; }
        const list = s.playlist ? `&list=${encodeURIComponent(s.playlist)}` : '';
        b.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&playsinline=1${s.start ? '&start=' + (+s.start | 0) : ''}${list}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="shield"></div>`;
        const f = b.querySelector('iframe');
        const yt = (func, args = []) => f.contentWindow && f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
        return { command(c) { const m = { play: 'playVideo', pause: 'pauseVideo', mute: 'mute', unmute: 'unMute', stop: 'stopVideo' }[c.op]; if (m) yt(m); if (c.op === 'volume') yt('setVolume', [+c.value || 50]); if (c.op === 'seek') yt('seekTo', [+c.value || 0, true]); }, external: `https://www.youtube.com/watch?v=${id}` };
      },
    },
    video: {
      size: [640, 380],
      mount(b, s) {
        b.innerHTML = `<video src="${esc(s.url)}" controls autoplay playsinline ${s.loop ? 'loop' : ''}></video>`;
        const v = b.querySelector('video');
        return { command(c) { if (c.op === 'play') v.play(); if (c.op === 'pause' || c.op === 'stop') v.pause(); if (c.op === 'mute') v.muted = true; if (c.op === 'unmute') v.muted = false; if (c.op === 'volume') v.volume = Math.max(0, Math.min(1, (+c.value || 50) / 100)); if (c.op === 'seek') v.currentTime = +c.value || 0; } };
      },
    },
    web: {
      size: [760, 520],
      mount(b, s) {
        b.innerHTML = `<iframe src="${esc(s.url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><div class="shield"></div>
          <div class="wfall" style="display:none">This site does not allow being shown inside another window.<div class="wbtns"><button>Open in browser</button></div></div>`;
        b.querySelector('.wfall button').onclick = () => ext(s.url);
        return { external: s.url };
      },
    },
    image: { size: [520, 380], mount(b, s) { b.innerHTML = `<img src="${esc(s.url)}" alt="${esc(s.title || '')}">`; return { external: s.url }; } },
    stats: {
      size: [360, 330],
      mount(b) {
        b.innerHTML = `<div class="wstat"><div><b data-k="cpu">--</b><span>CPU</span></div><div><b data-k="ram">--</b><span>MEMORY</span></div>
          <div><b data-k="gpu">--</b><span>GPU</span></div><div><b data-k="net">--</b><span>NETWORK</span></div></div>
          <canvas class="wspark" data-s="cpu"></canvas><canvas class="wspark" data-s="ram" style="margin-top:4px"></canvas>`;
        const t = setInterval(() => {
          const d = stats.last; if (!d || d.cpu == null) return;
          const q = (k) => b.querySelector(`[data-k="${k}"]`);
          q('cpu').textContent = Math.round(d.cpu) + '%'; q('ram').textContent = Math.round(d.ram) + '%';
          q('gpu').textContent = d.gpu != null ? Math.round(d.gpu) + '%' : 'n/a';
          q('net').textContent = d.down != null ? `${(d.down / 1e6).toFixed(1)}↓` : 'n/a';
          spark(b.querySelector('[data-s="cpu"]'), stats.cpu); spark(b.querySelector('[data-s="ram"]'), stats.ram, 100, '111,134,255');
        }, 1000);
        return { destroy() { clearInterval(t); } };
      },
    },
    processes: {
      size: [360, 300],
      mount(b) {
        b.innerHTML = '<div class="wscroll"></div>';
        const t = setInterval(() => { const p = (stats.last && stats.last.procs) || []; b.firstChild.innerHTML = p.map((x) => `<div class="wrow"><span>${esc(x[0])}</span><b>${x[1].toFixed(0)}% · ${x[2]} MB</b></div>`).join('') || '<div class="wfall">Waiting for data…</div>'; }, 2000);
        return { destroy() { clearInterval(t); } };
      },
    },
    clock: {
      size: [340, 260],
      mount(b, s) {
        const zones = (s.zones || s.data || ['Europe/London', 'America/New_York', 'Asia/Tokyo']).slice(0, 6);
        b.innerHTML = `<div style="text-align:center;padding:10px 0 6px"><div class="wbig" data-t>--:--</div><div class="wsub" data-d></div></div><div class="wscroll" style="top:96px" data-z></div>`;
        const tick = () => {
          const n = new Date();
          b.querySelector('[data-t]').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
          b.querySelector('[data-d]').textContent = n.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
          b.querySelector('[data-z]').innerHTML = zones.map((z) => { try { return `<div class="wrow"><span>${esc(z.split('/').pop().replace(/_/g, ' '))}</span><b>${n.toLocaleTimeString([], { timeZone: z, hour: '2-digit', minute: '2-digit', hour12: false })}</b></div>`; } catch (e) { return ''; } }).join('');
        };
        tick(); const t = setInterval(tick, 1000);
        return { destroy() { clearInterval(t); } };
      },
    },
    weather: {
      size: [360, 300],
      mount(b, s) {
        b.innerHTML = '<div class="wfall">Getting the forecast…</div>';
        const WX = (c) => c == null ? '' : c === 0 ? '☀' : c <= 2 ? '🌤' : c === 3 ? '☁' : c <= 48 ? '🌫' : c <= 67 ? '🌧' : c <= 77 ? '❄' : c <= 82 ? '🌦' : c <= 86 ? '🌨' : '⛈';
        const load = async () => {
          const d = await call('weather_panel', s.place || '');
          if (!d || d.error) { b.innerHTML = `<div class="wfall">${esc((d && d.error) || 'Weather needs the WINNERS Bot app.')}</div>`; return; }
          b.innerHTML = `<div style="display:flex;align-items:center;gap:14px;padding:6px 4px"><div class="wbig" style="font-size:46px">${Math.round(d.current.temp)}°</div>
            <div><div style="font-size:30px">${WX(d.current.code)}</div><div class="wsub">${esc(d.name)}</div><div class="wsub">WIND ${Math.round(d.current.wind)} KM/H</div></div></div>
            <div class="wscroll" style="top:90px">${d.daily.map((x) => `<div class="wrow"><span>${esc(x.day)}</span><span>${WX(x.code)} ${x.rain != null ? x.rain + '%' : ''}</span><b>${Math.round(x.min)}° / ${Math.round(x.max)}°</b></div>`).join('')}</div>`;
        };
        load(); const t = setInterval(load, 30 * 60000);
        return { destroy() { clearInterval(t); } };
      },
    },
    note: { size: [380, 300], mount(b, s) { b.innerHTML = `<div class="wnote">${md(s.content || s.text || '')}</div>`; return { update(n) { b.firstChild.innerHTML = md(n.content || n.text || ''); } }; } },
    quote: { size: [420, 200], mount(b, s) { b.innerHTML = `<div class="wnote" style="display:grid;place-items:center;text-align:center;font-size:18px;font-weight:300;color:#fff">${md(s.content || s.text || '')}</div>`; return {}; } },
    timer: {
      size: [280, 300],
      mount(b, s) {
        let total = Math.max(1, +s.seconds || 300), end = Date.now() + total * 1000, paused = 0, done = false;
        b.innerHTML = `<canvas class="wring" width="320" height="320" style="width:160px;height:160px"></canvas><div class="wbig" style="font-size:34px;text-align:center;margin-top:-104px;margin-bottom:70px" data-t></div>
          <div class="wbtns"><button data-a="p">Pause</button><button data-a="r">Restart</button></div>`;
        const cv = b.querySelector('canvas'), c = cv.getContext('2d');
        const draw = () => {
          const ms = paused ? paused : Math.max(0, end - Date.now());
          const f = ms / (total * 1000);
          c.clearRect(0, 0, 320, 320); c.lineWidth = 14; c.lineCap = 'round';
          c.strokeStyle = 'rgba(244,246,255,.12)'; c.beginPath(); c.arc(160, 160, 140, 0, Math.PI * 2); c.stroke();
          c.strokeStyle = ms < 10000 ? '#ff5a6e' : 'rgb(244,246,255)'; c.beginPath(); c.arc(160, 160, 140, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.stroke();
          const sec = Math.ceil(ms / 1000);
          b.querySelector('[data-t]').textContent = `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
          if (!ms && !done && !paused) { done = true; act('TIMER · ' + (s.title || 'done')); say((s.title || 'Timer') + ' finished'); toast((s.title || 'Timer') + ' finished', 6000); }
        };
        b.querySelector('[data-a="p"]').onclick = (e) => { if (paused) { end = Date.now() + paused; paused = 0; e.target.textContent = 'Pause'; } else { paused = Math.max(1, end - Date.now()); e.target.textContent = 'Resume'; } };
        b.querySelector('[data-a="r"]').onclick = () => { end = Date.now() + total * 1000; paused = 0; done = false; };
        const t = setInterval(draw, 250); draw();
        return { destroy() { clearInterval(t); } };
      },
    },
    stopwatch: {
      size: [280, 220],
      mount(b) {
        let start = Date.now(), acc = 0, run = true;
        b.innerHTML = `<div style="text-align:center;padding:24px 0 6px"><div class="wbig" style="font-size:40px" data-t>0:00.0</div></div><div class="wbtns"><button data-a="p">Pause</button><button data-a="r">Reset</button></div>`;
        const tick = () => { const ms = acc + (run ? Date.now() - start : 0), s = ms / 1000; b.querySelector('[data-t]').textContent = `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}.${Math.floor((ms % 1000) / 100)}`; };
        b.querySelector('[data-a="p"]').onclick = (e) => { if (run) { acc += Date.now() - start; run = false; e.target.textContent = 'Resume'; } else { start = Date.now(); run = true; e.target.textContent = 'Pause'; } };
        b.querySelector('[data-a="r"]').onclick = () => { acc = 0; start = Date.now(); };
        const t = setInterval(tick, 100);
        return { destroy() { clearInterval(t); } };
      },
    },
    chart: {
      size: [520, 320],
      mount(b, s) {
        let data = typeof s.data === 'string' ? (() => { try { return JSON.parse(s.data); } catch (e) { return {}; } })() : (s.data || {});
        b.innerHTML = '<canvas style="width:100%;height:100%;display:block"></canvas>';
        const draw = () => chart(b.firstChild, data); setTimeout(draw, 30);
        const ro = new ResizeObserver(draw); ro.observe(b);
        return { update(n) { data = n.data || data; draw(); }, destroy() { ro.disconnect(); } };
      },
    },
    crypto: {
      size: [340, 280],
      mount(b, s) {
        const ids = (s.coins || s.data || ['bitcoin', 'ethereum', 'solana']).slice(0, 10);
        b.innerHTML = '<div class="wscroll"><div class="wfall">Loading prices…</div></div>';
        const load = async () => {
          const d = await call('crypto_prices', ids, s.currency || 'usd');
          if (!d || d.error) { b.firstChild.innerHTML = `<div class="wfall">${esc((d && d.error) || 'Prices need the WINNERS Bot app.')}</div>`; return; }
          b.firstChild.innerHTML = d.rows.map((r) => `<div class="wrow ${r.change >= 0 ? 'up' : 'down'}"><span>${esc(r.id)}</span><span>${r.change >= 0 ? '▲' : '▼'} ${Math.abs(r.change).toFixed(2)}%</span><b>${r.price.toLocaleString(undefined, { maximumFractionDigits: r.price < 10 ? 4 : 2 })} ${esc(d.currency.toUpperCase())}</b></div>`).join('');
        };
        load(); const t = setInterval(load, 60000);
        return { destroy() { clearInterval(t); } };
      },
    },
    news: {
      size: [400, 420],
      mount(b, s) {
        b.innerHTML = '<div class="wscroll wnews"><div class="wfall">Loading headlines…</div></div>';
        const load = async () => {
          const d = await call('news_items', s.url || s.feed || '', s.query || '');
          if (!d || d.error) { b.firstChild.innerHTML = `<div class="wfall">${esc((d && d.error) || 'News needs the WINNERS Bot app.')}</div>`; return; }
          b.firstChild.innerHTML = d.items.map((x) => `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}<small>${esc(x.source || '')} ${esc(x.date || '')}</small></a>`).join('');
        };
        load(); const t = setInterval(load, 15 * 60000);
        return { destroy() { clearInterval(t); } };
      },
    },
    agenda: {
      size: [340, 320],
      mount(b) {
        b.innerHTML = '<div class="wscroll"><div class="wfall">Loading…</div></div>';
        const load = async () => {
          const t0 = new Date(), iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          const d = await call('cal_range', iso(t0), iso(new Date(t0.getTime() + 6 * 864e5)));
          if (!d || d.error) { b.firstChild.innerHTML = '<div class="wfall">Agenda needs the WINNERS Bot app.</div>'; return; }
          const now = `${iso(t0)} ${pad(t0.getHours())}:${pad(t0.getMinutes())}`;
          b.firstChild.innerHTML = d.events.filter((e) => e.oend >= now).slice(0, 14).map((e) => `<div class="wrow"><span><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${e.color};margin-right:7px"></i>${esc(e.title)}</span><b>${e.ostart.slice(5, 10)} ${e.all_day ? '' : e.ostart.slice(11)}</b></div>`).join('') || '<div class="wfall">Nothing in the next week.</div>';
        };
        load(); const t = setInterval(load, 5 * 60000);
        window.addEventListener('jv-cal-changed', load);
        return { destroy() { clearInterval(t); window.removeEventListener('jv-cal-changed', load); } };
      },
    },
    camera: {
      size: [640, 480],
      mount(b, s) { return vision.mount(b, s); },
    },
  };

  /* ---------- panel lifecycle ---------- */
  function place(spec, kind) {
    const [dw, dh] = (KINDS[kind] && KINDS[kind].size) || [420, 300];
    const W = innerWidth, H = innerHeight;
    const num = (v, full) => (v == null ? null : v <= 1 && v > 0 ? v * full : +v);
    let w = num(spec.w, W) || dw, h = num(spec.h, H) || dh;
    w = Math.min(w, W - 40); h = Math.min(h, H - 120);
    let x = num(spec.x, W), y = num(spec.y, H);
    if (x == null || y == null) {   // cascade from the upper middle so new panels never stack exactly
      const n = panels.size % 6;
      x = Math.round(W / 2 - w / 2 + (n - 2.5) * 42); y = Math.round(90 + n * 34);
    }
    return { x: Math.max(8, Math.min(W - w - 8, x)), y: Math.max(56, Math.min(H - h - 20, y)), w, h };
  }
  function add(spec) {
    const kind = String(spec.kind || 'note').toLowerCase();
    if (!KINDS[kind]) return { ok: false, text: `Unknown panel kind "${kind}". Use: ${Object.keys(KINDS).join(', ')}.` };
    if (kind === 'camera') { for (const [id, p] of panels) if (p.kind === 'camera') { focus(id); return { ok: true, id, text: 'The camera is already open.' }; } }
    const id = spec.id && !panels.has(spec.id) ? String(spec.id) : 'P' + nextId++;
    const r = place(spec, kind);
    const el = document.createElement('section');
    el.className = 'wp'; el.dataset.id = id; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', (spec.title || kind) + ' panel');
    el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:${++zTop}`;
    el.innerHTML = `<div class="wh"><i></i><b>${esc(ICON[kind] || '')}  ${esc(spec.title || kind)}</b>
      <button data-a="ext" title="Open in browser" aria-label="Open in browser" style="display:none">↗</button><button data-a="min" title="Minimise" aria-label="Minimise">–</button><button data-a="x" title="Close" aria-label="Close">✕</button></div>
      <div class="wb"></div><div class="rz" aria-hidden="true"></div>`;
    root.appendChild(el);
    const inst = KINDS[kind].mount(el.querySelector('.wb'), spec) || {};
    if (inst.external) { const e = el.querySelector('[data-a="ext"]'); e.style.display = ''; e.onclick = () => ext(inst.external); }
    panels.set(id, { id, kind, el, inst, spec: { ...spec, kind, id } });
    save(); act(`PANEL · ${(spec.title || kind).toUpperCase()}`);
    return { ok: true, id, text: `Showing ${spec.title || kind} (panel ${id}).` };
  }
  function close(id) {
    const p = panels.get(id); if (!p) return false;
    try { p.inst.destroy && p.inst.destroy(); } catch (e) { /* ignore */ }
    p.el.classList.add('out'); setTimeout(() => p.el.remove(), 260);
    panels.delete(id); save(); return true;
  }
  function focus(id) { const p = panels.get(id); if (p) p.el.style.zIndex = ++zTop; }
  function rect(id) { const r = panels.get(id).el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function setRect(id, r) {
    const p = panels.get(id); if (!p) return;
    const s = p.el.style;
    if (r.w != null) s.width = Math.max(180, Math.min(innerWidth - 16, r.w)) + 'px';
    if (r.h != null) s.height = Math.max(110, Math.min(innerHeight - 70, r.h)) + 'px';
    if (r.x != null) s.left = Math.max(-r.w * 0.6 || -100, Math.min(innerWidth - 60, r.x)) + 'px';
    if (r.y != null) s.top = Math.max(40, Math.min(innerHeight - 40, r.y)) + 'px';
  }
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        const rows = [...panels.values()].filter((p) => !['camera', 'timer', 'stopwatch'].includes(p.kind)).map((p) => ({ ...p.spec, ...rect(p.id) }));
        localStorage.setItem('jv-panels', JSON.stringify(rows));
      } catch (e) { /* private window */ }
    }, 400);
  }
  function restore() {
    try { for (const s of JSON.parse(localStorage.getItem('jv-panels') || '[]')) add({ ...s, autoplay: false }); } catch (e) { /* ignore */ }
  }

  /* ---------- mouse ---------- */
  let mdrag = null;
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.wp'); if (!el) return;
    const id = el.dataset.id; focus(id);
    if (e.target.closest('.wh button')) return;
    const mode = e.target.closest('.rz') ? 'size' : e.target.closest('.wh') ? 'move' : null;
    if (!mode) return;
    mdrag = { id, mode, sx: e.clientX, sy: e.clientY, r: rect(id) };
    el.classList.add('grab'); root.classList.add('dragging'); el.setPointerCapture(e.pointerId); e.preventDefault();
  });
  root.addEventListener('pointermove', (e) => {
    if (!mdrag) return;
    const dx = e.clientX - mdrag.sx, dy = e.clientY - mdrag.sy;
    if (mdrag.mode === 'move') setRect(mdrag.id, { x: mdrag.r.x + dx, y: mdrag.r.y + dy, w: mdrag.r.w });
    else setRect(mdrag.id, { w: mdrag.r.w + dx, h: mdrag.r.h + dy });
  });
  const up = () => { if (!mdrag) return; const p = panels.get(mdrag.id); p && p.el.classList.remove('grab'); root.classList.remove('dragging'); mdrag = null; save(); };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.wh button'); if (!b) return;
    const id = b.closest('.wp').dataset.id;
    if (b.dataset.a === 'x') close(id);
    if (b.dataset.a === 'min') { panels.get(id).el.classList.toggle('min'); save(); }
  });

  /* ---------- hands: pointer events from the vision module ---------- */
  const H = { grab: null, t0: 0, sx: 0, sy: 0, r: null, two: null, hoverEl: null };
  function under(x, y) {
    cur.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    cur.style.display = 'block';
    return el;
  }
  function pointer(hands) {
    // hands: [{x, y, pinch, pinchStart, pinchEnd, gesture}] in screen pixels, up to two
    if (!hands.length) { cur.style.display = 'none'; if (H.grab) endGrab(); return; }
    const h = hands[0];
    cur.style.display = 'block';
    cur.style.transform = `translate(${h.x}px,${h.y}px)`;
    cur.classList.toggle('pinch', !!h.pinch);
    cur.classList.toggle('b', !!H.grab);
    const el = under(h.x, h.y), pel = el && el.closest('.wp');
    if (H.hoverEl !== pel) { H.hoverEl && H.hoverEl.classList.remove('hover'); pel && pel.classList.add('hover'); H.hoverEl = pel; }
    // two-handed pinch on one panel: resize by the change in distance between the hands
    if (hands.length > 1 && hands[0].pinch && hands[1].pinch && H.grab) {
      const d = Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y);
      if (!H.two) H.two = { d0: d, r: rect(H.grab) };
      const k = d / Math.max(40, H.two.d0), r = H.two.r;
      const w = r.w * k, hh = r.h * k;
      setRect(H.grab, { x: r.x + (r.w - w) / 2, y: r.y + (r.h - hh) / 2, w, h: hh });
      return;
    }
    H.two = null;
    if (h.pinchStart) {
      H.t0 = performance.now(); H.sx = h.x; H.sy = h.y;
      if (pel) { H.grab = pel.dataset.id; H.r = rect(H.grab); focus(H.grab); pel.classList.add('grab'); root.classList.add('dragging'); }
      H.target = el;
    } else if (h.pinch && H.grab) {
      const moved = Math.hypot(h.x - H.sx, h.y - H.sy);
      if (moved > 14) setRect(H.grab, { x: H.r.x + (h.x - H.sx), y: H.r.y + (h.y - H.sy), w: H.r.w });
    } else if (h.pinchEnd) {
      const quick = performance.now() - H.t0 < 380 && Math.hypot(h.x - H.sx, h.y - H.sy) < 22;
      if (quick && H.target) {   // air-click whatever is under the cursor (buttons, links, the core...)
        const t = H.target.closest('button,a,[role=button],.cday,.cchip,input,select') || H.target;
        if (t.tagName === 'INPUT' || t.tagName === 'SELECT') t.focus(); else t.click();
      }
      endGrab();
    }
  }
  function endGrab() { if (H.grab) { const p = panels.get(H.grab); p && p.el.classList.remove('grab'); } H.grab = null; H.two = null; root.classList.remove('dragging'); save(); }

  /* ---------- commands from the `panel` tool ---------- */
  function command(c) {
    const a = String(c.action || 'add').toLowerCase();
    const pick = () => c.id && panels.has(c.id) ? c.id : [...panels.values()].reverse().find((p) => !c.kind || p.kind === c.kind)?.id;
    if (a === 'add' || a === 'show') return add(c).text;
    if (a === 'list') return panels.size ? [...panels.values()].map((p) => { const r = rect(p.id); return `${p.id} ${p.kind} "${p.spec.title || ''}" at ${Math.round(r.x)},${Math.round(r.y)} size ${Math.round(r.w)}x${Math.round(r.h)}`; }).join('\n') : 'No panels on screen.';
    if (a === 'clear') { for (const id of [...panels.keys()]) if (!c.kind || panels.get(id).kind === c.kind) close(id); return 'Cleared the panels.'; }
    const id = pick(); if (!id) return 'No such panel on screen.';
    const p = panels.get(id);
    if (a === 'close') { close(id); return `Closed ${p.spec.title || p.kind}.`; }
    if (a === 'move') { const W = innerWidth, Hh = innerHeight, r = rect(id); const named = { left: [16, null], right: [W - r.w - 16, null], top: [null, 70], bottom: [null, Hh - r.h - 110], center: [(W - r.w) / 2, (Hh - r.h) / 2] }[String(c.position || '').toLowerCase()];
      setRect(id, named ? { x: named[0] ?? r.x, y: named[1] ?? r.y, w: r.w } : { x: c.x <= 1 ? c.x * W : c.x, y: c.y <= 1 ? c.y * Hh : c.y, w: r.w }); save(); return 'Moved.'; }
    if (a === 'resize') { const r = rect(id); setRect(id, { w: c.w <= 3 ? r.w * (c.w || 1) : c.w, h: c.h <= 3 ? r.h * (c.h || c.w || 1) : c.h }); save(); return 'Resized.'; }
    if (a === 'fullscreen') { setRect(id, { x: 16, y: 60, w: innerWidth - 32, h: innerHeight - 150 }); focus(id); save(); return 'Maximised.'; }
    if (a === 'focus') { focus(id); return 'Brought to the front.'; }
    if (a === 'update') { if (p.inst.update) { p.inst.update(c); p.spec = { ...p.spec, ...c }; return 'Updated.'; } return 'That panel cannot be updated; close it and add a new one.'; }
    if (['play', 'pause', 'stop', 'mute', 'unmute', 'volume', 'seek'].includes(a)) { if (p.inst.command) { p.inst.command({ op: a, value: c.value }); return 'Done.'; } return 'That panel has no player.'; }
    return 'Unknown panel action.';
  }

  return { add, close, command, pointer, restore, kinds: Object.keys(KINDS), get count() { return panels.size; },
    hasCamera() { return [...panels.values()].some((p) => p.kind === 'camera'); },
    closeKind(k) { for (const [id, p] of panels) if (p.kind === k) close(id); } };
}
