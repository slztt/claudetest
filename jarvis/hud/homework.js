// Homework tab: ask a question (typed, spoken or from the screen), choose level, length and detail, get the answer as text and voice.
const $ = (q, r = document) => r.querySelector(q);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = () => (window.pywebview && window.pywebview.api) || null;
const call = async (fn, ...a) => { const x = api(); if (!x || typeof x[fn] !== 'function') return null; try { return await x[fn](...a); } catch (e) { return { error: String(e) }; } };

const css = document.createElement('style');
css.textContent = `
#hw{position:fixed;left:50%;top:84px;bottom:110px;width:min(860px,64vw);transform:translate(-50%,24px) perspective(1200px) rotateX(6deg);z-index:20;opacity:0;pointer-events:none;
  display:flex;flex-direction:column;padding:22px 28px 20px;transition:opacity .45s,transform .6s cubic-bezier(.2,.8,.2,1);
  background:linear-gradient(160deg,rgba(var(--accent-rgb),.14),rgba(4,14,24,.86) 40%,rgba(4,14,24,.9));backdrop-filter:blur(22px) saturate(1.4);-webkit-backdrop-filter:blur(22px) saturate(1.4);
  clip-path:polygon(0 0,calc(100% - 26px) 0,100% 26px,100% 100%,26px 100%,0 calc(100% - 26px));box-shadow:0 30px 90px rgba(0,0,0,.6)}
#hw.open{opacity:1;pointer-events:auto;transform:translate(-50%,0)}
body.hw-open #left,body.hw-open #right,body.hw-open #subs{opacity:.12;transition:opacity .4s}
#hw::before{content:"";position:absolute;left:0;top:22px;width:2px;height:34px;background:var(--accent);box-shadow:0 0 12px var(--accent)}
#hw header{display:flex;align-items:center;gap:14px;margin-bottom:14px}
#hw h2{font-weight:300;font-size:13px;letter-spacing:.55em;color:var(--accent);text-shadow:0 0 14px rgba(var(--accent-rgb),.7);flex:1}
#hw h2 small{font:400 9px var(--mono);letter-spacing:.2em;color:var(--dim);margin-left:12px}
#hw textarea{width:100%;min-height:84px;max-height:22vh;resize:vertical;background:rgba(255,255,255,.045);border:0;border-bottom:1px solid rgba(var(--accent-rgb),.4);color:#fff;
  font:300 14.5px/1.5 var(--ui);padding:12px 14px;outline:0;user-select:text;-webkit-user-select:text;border-radius:6px 6px 0 0}
#hw textarea:focus{background:rgba(var(--accent-rgb),.08);border-bottom-color:var(--accent)}
#hw textarea::placeholder{color:var(--dim)}
.hw-opts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}
.hw-opts label{display:flex;flex-direction:column;gap:5px;font-size:8.5px;letter-spacing:.3em;color:var(--dim);text-transform:uppercase}
.hw-opts input,.hw-opts select{background:rgba(255,255,255,.045);border:0;border-bottom:1px solid rgba(var(--accent-rgb),.3);color:#fff;font:300 12.5px var(--ui);padding:8px;outline:0;border-radius:4px 4px 0 0;user-select:text;-webkit-user-select:text}
.hw-opts select option{background:#06121e}
.hw-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hw-btns .sp{flex:1}
#hw-status{font:400 10px var(--mono);letter-spacing:.18em;color:var(--dim);text-transform:uppercase}
#hw-status.busy{color:var(--gold)}
#hw-status.busy::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);box-shadow:0 0 8px var(--gold);margin-right:8px;animation:pulse .8s infinite}
#hw-out{flex:1;min-height:0;overflow:auto;margin-top:14px;padding:18px 20px;background:rgba(0,0,0,.22);border-left:2px solid rgba(var(--accent-rgb),.5);
  font:300 15px/1.7 var(--ui);color:var(--txt);white-space:pre-wrap;user-select:text;-webkit-user-select:text}
#hw-out:empty::before{content:"Type or say your question. Say 'it's on my screen' to have JARVIS read a worksheet. Ctrl+Enter answers.";color:var(--dim);font-size:13px}
#hw-out .q{display:block;color:var(--gold);font-size:12.5px;margin-bottom:12px;letter-spacing:.02em}
#hw-meta{font:400 9.5px var(--mono);letter-spacing:.16em;color:var(--dim);margin-top:8px;display:flex;justify-content:space-between}
#hw-hist{display:flex;gap:6px;overflow-x:auto;margin-top:8px;scrollbar-width:none}
#hw-hist button{flex:none;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:0;cursor:pointer;background:rgba(255,255,255,.05);color:var(--dim);font:400 10px var(--ui);padding:6px 10px;border-radius:99px}
#hw-hist button:hover{color:#fff;background:rgba(var(--accent-rgb),.18)}
@media (max-width:1000px){#hw{width:92vw}.hw-opts{grid-template-columns:repeat(2,1fr)}}
`;
document.head.appendChild(css);

const el = document.createElement('section');
el.id = 'hw'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Homework mode');
el.innerHTML = `
<header><h2>HOMEWORK MODE<small>H TO OPEN · ESC TO CLOSE</small></h2><button class="ib" id="hw-x" aria-label="Close homework" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
<textarea id="hw-q" placeholder="Paste or type the question(s)…" spellcheck="true" aria-label="Homework question"></textarea>
<div class="hw-opts">
  <label>Subject<input id="hw-sub" placeholder="optional, e.g. History" aria-label="Subject"></label>
  <label>Level<select id="hw-lvl" aria-label="Level"><option value="">Auto</option><option>Primary school</option><option>Year 7-8</option><option>Year 9</option><option>GCSE</option><option>A-level</option><option>University</option></select></label>
  <label>Length<select id="hw-len" aria-label="Length"><option value="">Natural</option><option>one sentence</option><option>short</option><option>one paragraph</option><option>200 words</option><option>350 words</option><option>500 words</option><option>800 words</option><option>1 page</option><option>2 pages</option></select></label>
  <label>Detail<select id="hw-det" aria-label="Detail"><option value="with working">With working</option><option value="answer only">Answer only</option><option value="full explanation">Full explanation</option></select></label>
</div>
<div class="hw-btns">
  <button class="btn go" id="hw-go">Answer · Ctrl+Enter</button>
  <button class="btn" id="hw-scr" title="Read the question from your screen">From screen</button>
  <button class="btn" id="hw-say" title="Read the answer aloud">Read aloud</button>
  <button class="btn" id="hw-copy">Copy</button>
  <span class="sp"></span><span id="hw-status" role="status"></span>
</div>
<div id="hw-out" aria-live="polite"></div>
<div id="hw-meta"><span id="hw-wc"></span><span>SAVED TO DOCUMENTS · JARVIS HOMEWORK</span></div>
<div id="hw-hist" aria-label="Earlier answers"></div>`;
document.body.appendChild(el);

const S = { last: null, hist: [] };
function open(on = true) {
  el.classList.toggle('open', on); document.body.classList.toggle('hw-open', on);
  if (on) setTimeout(() => $('#hw-q').focus(), 200);
}
function status(t, busy) { const s = $('#hw-status'); s.textContent = t || ''; s.classList.toggle('busy', !!busy); }
function show(q, a) {
  S.last = { q, a };
  $('#hw-out').innerHTML = `<span class="q">${esc(q)}</span>${esc(a)}`;
  $('#hw-wc').textContent = a ? a.split(/\s+/).filter(Boolean).length + ' WORDS' : '';
  if (a && !S.hist.some((h) => h.a === a)) {
    S.hist.unshift({ q, a }); S.hist.length = Math.min(S.hist.length, 12);
    $('#hw-hist').innerHTML = S.hist.map((h, i) => `<button data-i="${i}" title="${esc(h.q)}">${esc(h.q.slice(0, 60))}</button>`).join('');
  }
  status('Done');
}
const opts = () => ({ subject: $('#hw-sub').value.trim(), level: $('#hw-lvl').value, length: $('#hw-len').value, detail: $('#hw-det').value });
async function ask(fromScreen) {
  const q = $('#hw-q').value.trim();
  if (!q && !fromScreen) { $('#hw-q').focus(); return; }
  status(fromScreen ? 'Reading your screen…' : 'Working it out…', true);
  $('#hw-out').innerHTML = `<span class="q">${esc(q || 'From your screen')}</span>`;
  if (!api()) { setTimeout(() => show(q, 'Preview mode: in the JARVIS app the answer appears here and is read aloud.'), 600); return; }
  const r = await call('hw_answer', q, opts(), !!fromScreen);
  if (!r || r.error) { status('Error'); $('#hw-out').innerHTML = `<span class="q">${esc(q)}</span>${esc((r && r.error) || 'No answer.')}`; return; }
  show(r.question || q, r.answer);
  call('hw_speak', r.answer);
}
$('#hw-go').onclick = () => ask(false);
$('#hw-scr').onclick = () => ask(true);
$('#hw-say').onclick = () => S.last && call('hw_speak', S.last.a);
$('#hw-copy').onclick = async () => { if (!S.last) return; try { await navigator.clipboard.writeText(S.last.a); status('Copied'); } catch (e) { call('set_clipboard', S.last.a); status('Copied'); } };
$('#hw-x').onclick = () => open(false);
$('#hw-hist').onclick = (e) => { const b = e.target.closest('button'); if (b) { const h = S.hist[+b.dataset.i]; show(h.q, h.a); } };
el.addEventListener('keydown', (e) => {
  e.stopPropagation();                       // typing here must not trigger the HUD's keyboard shortcuts
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(false); }
  if (e.key === 'Escape') { e.preventDefault(); open(false); }
});
window.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === 'Escape' && el.classList.contains('open')) { e.preventDefault(); e.stopImmediatePropagation(); open(false); return; }
  if (!typing && (e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); open(!el.classList.contains('open')); }
}, true);

// events from the JARVIS core (the homework tool)
const prev = window.HUD.on;
window.HUD.on = (ev) => {
  if (ev.t === 'homework') {
    if (ev.action === 'open') open(true);
    else if (ev.action === 'close') open(false);
    else if (ev.action === 'working') { open(true); if (ev.question) $('#hw-q').value = ev.question; status('Working it out…', true); }
    else if (ev.action === 'show') { open(true); show(ev.question, ev.answer); }
    else if (ev.action === 'error') status(ev.text || 'Error');
    return;
  }
  return prev(ev);
};
window.__hw = { open, isOpen: () => el.classList.contains('open') };
