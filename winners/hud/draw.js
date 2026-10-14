// Live Draw: full-screen slot-machine reveal with confetti, plus a panel to run draws by hand (D key).
const $ = (q, r = document) => r.querySelector(q);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = () => (window.pywebview && window.pywebview.api) || null;
const call = async (fn, ...a) => { const x = api(); if (!x || typeof x[fn] !== 'function') return null; try { return await x[fn](...a); } catch (e) { return { error: String(e) }; } };

const css = document.createElement('style');
css.textContent = `
#dr{position:fixed;inset:0;z-index:45;display:none;place-items:center;background:radial-gradient(ellipse at 50% 45%,rgba(40,30,6,.82),rgba(4,3,1,.96) 70%);backdrop-filter:blur(10px)}
#dr.show{display:grid;animation:fade .35s}
#dr canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#dr .box{position:relative;width:min(980px,90vw);text-align:center}
#dr .kick{font:400 11px var(--mono);letter-spacing:.7em;color:var(--dim);margin-bottom:10px}
#dr h2{font:700 clamp(26px,4vw,46px) var(--ui);letter-spacing:.14em;color:#fff;text-transform:uppercase;text-shadow:0 0 30px rgba(var(--accent-rgb),.8);margin-bottom:6px}
#dr .pool{font:400 12px var(--mono);letter-spacing:.3em;color:var(--accent);margin-bottom:34px}
#dr .reel{position:relative;height:clamp(120px,18vh,180px);margin:0 auto;width:min(760px,86vw);overflow:hidden;
  background:linear-gradient(180deg,rgba(0,0,0,.6),rgba(40,30,6,.5),rgba(0,0,0,.6));border-top:2px solid var(--accent);border-bottom:2px solid var(--accent);
  box-shadow:0 0 60px rgba(var(--accent-rgb),.35),inset 0 0 50px rgba(0,0,0,.8)}
#dr .reel::before,#dr .reel::after{content:"";position:absolute;left:0;right:0;height:30%;z-index:2;pointer-events:none}
#dr .reel::before{top:0;background:linear-gradient(180deg,rgba(4,3,1,.95),transparent)}#dr .reel::after{bottom:0;background:linear-gradient(0deg,rgba(4,3,1,.95),transparent)}
#dr .val{position:absolute;inset:0;display:grid;place-items:center;font:800 clamp(48px,9vw,110px)/1 var(--ui);color:#fff;letter-spacing:.04em;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding:0 20px;
  text-shadow:0 0 24px rgba(var(--accent-rgb),.9)}
#dr .val.blur{filter:blur(1.5px);opacity:.85}
#dr .won{margin-top:30px;min-height:90px}
#dr .won b{display:block;font:700 13px var(--ui);letter-spacing:.8em;color:var(--gold);text-shadow:0 0 20px var(--gold);opacity:0;transform:scale(.6);transition:.5s cubic-bezier(.2,1.6,.4,1)}
#dr .won.on b{opacity:1;transform:none}
#dr .list{font:400 15px var(--ui);color:var(--txt);margin-top:10px;letter-spacing:.06em}
#dr .meta{font:400 9.5px var(--mono);letter-spacing:.2em;color:var(--dim);margin-top:18px}
#dr .btns{margin-top:22px;display:flex;gap:10px;justify-content:center}
#dr form{display:none;gap:12px;flex-direction:column;align-items:center}
#dr.manual form{display:flex}#dr.manual .stage{display:none}
#dr form input,#dr form textarea{width:min(560px,80vw);background:rgba(255,255,255,.05);border:0;border-bottom:1px solid rgba(var(--accent-rgb),.5);color:#fff;font:300 15px var(--ui);padding:11px 14px;outline:0;user-select:text;-webkit-user-select:text}
#dr form textarea{min-height:110px;resize:vertical;font-size:13px}
#dr form .two{display:flex;gap:12px;width:min(560px,80vw)}#dr form .two input{flex:1;width:auto}
#dr form small{color:var(--dim);font-size:11px;letter-spacing:.04em}
`;
document.head.appendChild(css);

const el = document.createElement('div');
el.id = 'dr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Live draw');
el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="box">
  <div class="kick">THE WINNERS CLUB N.I · LIVE DRAW</div>
  <form>
    <h2>Run a draw</h2>
    <input id="dr-prize" placeholder="Prize, e.g. iPhone 17 Pro" aria-label="Prize">
    <div class="two"><input id="dr-tix" type="number" min="1" placeholder="Tickets sold, e.g. 500" aria-label="Tickets sold"><input id="dr-n" type="number" min="1" value="1" aria-label="Number of winners" title="Number of winners"></div>
    <textarea id="dr-entries" placeholder="…or paste the entries (names or ticket numbers), one per line" aria-label="Entries"></textarea>
    <input id="dr-ex" placeholder="Leave out (void) ticket numbers, comma separated (optional)" aria-label="Excluded tickets">
    <small>Winners are picked by your PC's cryptographic random generator and recorded in Documents › WINNERS Draws.</small>
    <div class="btns"><button type="submit" class="btn go">Start the draw</button><button type="button" class="btn" data-x>Close · Esc</button></div>
  </form>
  <div class="stage">
    <h2 id="dr-prize-t">Prize draw</h2><div class="pool" id="dr-pool"></div>
    <div class="reel"><div class="val" id="dr-val">—</div></div>
    <div class="won" id="dr-won"><b>WINNER</b><div class="list" id="dr-list"></div></div>
    <div class="meta" id="dr-meta"></div>
    <div class="btns"><button class="btn" data-again>New draw</button><button class="btn" data-x>Close · Esc</button></div>
  </div></div>`;
document.body.appendChild(el);

/* ---------- confetti ---------- */
const cv = el.querySelector('canvas'), g = cv.getContext('2d');
let bits = [], raf = 0;
function confetti() {
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#ffc93c', '#fff1b0', '#3de08c', '#ffffff', '#e8ac2d'];
  for (let i = 0; i < 260; i++) bits.push({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .45, vx: (Math.random() - .5) * 18, vy: -Math.random() * 16 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 8, h: 3 + Math.random() * 5, c: cols[i % cols.length], life: 1 });
  if (!raf) tick();
}
function tick() {
  g.clearRect(0, 0, cv.width, cv.height);
  bits = bits.filter((b) => b.life > 0 && b.y < cv.height + 40);
  for (const b of bits) {
    b.vy += .38; b.vx *= .992; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.life -= .004;
    g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.globalAlpha = Math.max(0, b.life); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); g.restore();
  }
  raf = bits.length ? requestAnimationFrame(tick) : 0;
}

/* ---------- reveal ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (w) => (/^\d+$/.test(w) ? '#' + w : w);
let running = false;
async function reveal(d) {
  running = true;
  el.classList.add('show'); el.classList.remove('manual');
  $('#dr-prize-t').textContent = d.prize || 'Prize draw';
  $('#dr-pool').textContent = `DRAWING FROM ${String(d.pool || '').toUpperCase()} · ${d.size} IN THE DRAW`;
  $('#dr-meta').textContent = `DRAW ${d.id || ''} · ${d.when ? new Date(d.when).toLocaleString('en-GB') : ''} · POOL FINGERPRINT ${d.fingerprint || ''}`;
  const won = $('#dr-won'), list = $('#dr-list'), val = $('#dr-val');
  won.classList.remove('on'); list.innerHTML = '';
  const reel = (d.reel && d.reel.length ? d.reel : ['—']).map(fmt);
  const calm = document.body.classList.contains('calm');
  for (const w of d.winners) {
    const total = (d.seconds || 7) * 1000, t0 = performance.now();
    val.classList.add('blur');
    while (performance.now() - t0 < total) {
      const p = (performance.now() - t0) / total;                    // eases from ~25 changes a second down to a crawl
      val.textContent = reel[Math.floor(Math.random() * reel.length)];
      await sleep(calm ? 300 : 40 + 520 * p * p * p);
    }
    val.classList.remove('blur');
    val.textContent = fmt(w);
    val.animate([{ transform: 'scale(1.35)', filter: 'brightness(2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 650, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    won.classList.add('on');
    list.innerHTML += `<div>${esc(fmt(w))}</div>`;
    if (!calm) confetti();
    await sleep(d.winners.length > 1 ? 2200 : 400);
  }
  running = false;
}
function openManual() { el.classList.add('show', 'manual'); setTimeout(() => $('#dr-prize').focus(), 50); }
function close() { if (running) return; el.classList.remove('show', 'manual'); }
el.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const o = { prize: $('#dr-prize').value.trim(), tickets: +$('#dr-tix').value || 0, entries: $('#dr-entries').value, winners: +$('#dr-n').value || 1, exclude: $('#dr-ex').value };
  if (!api()) {                                                      // preview mode: demonstrate the reveal
    const n = o.tickets || 500;
    return reveal({ id: 'PREVIEW', prize: o.prize || 'Preview draw', pool: 'tickets 1-' + n, size: n, winners: [String(1 + Math.floor(Math.random() * n))],
      reel: Array.from({ length: 200 }, () => String(1 + Math.floor(Math.random() * n))), seconds: 6, when: new Date().toISOString(), fingerprint: 'preview' });
  }
  const r = await call('draw_run', o);
  if (r && r.error) alert(r.error);
});
el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) close(); if (e.target.closest('[data-again]') && !running) openManual(); });
el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
window.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === 'Escape' && el.classList.contains('show')) { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
  if (!typing && (e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); el.classList.contains('show') ? close() : openManual(); }
}, true);

const prev = window.HUD.on;
window.HUD.on = (ev) => {
  if (ev.t === 'draw') { if (ev.action === 'open') openManual(); else if (ev.action === 'run') reveal(ev); return; }
  return prev(ev);
};
window.__draw = { reveal, openManual };
