import { createScene } from './scene.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = () => (window.pywebview && window.pywebview.api) || null;
const call = (fn, ...a) => { try { const p = api(); return p ? p[fn](...a) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };

const scene = createScene($('#gl'));
const COLORS = {
  STANDBY: '45,144,216', LISTENING: '85,220,255', THINKING: '255,179,71', SPEAKING: '142,234,255',
  MUTED: '255,77,99', CONNECTING: '111,147,173', SETUP: '255,179,71', BOOT: '47,168,255',
};
const LABEL = {
  STANDBY: 'STANDBY', LISTENING: 'LISTENING', THINKING: 'PROCESSING', SPEAKING: 'RESPONDING',
  MUTED: 'MICROPHONE OFF', CONNECTING: 'LINKING', SETUP: 'AWAITING KEY', BOOT: 'INITIALISING',
};

let S = { state: 'BOOT', wakeOk: true, wakeErr: '', settings: {} };

/* ---------- themes ---------- */
const THEMES = { cyan: [0, false], violet: [75, false], emerald: [-45, false], amber: [-160, false], crimson: [150, false], mono: [0, true] };
let theme = 'cyan';
function themed(rgb, name) {
  const [deg, mono] = THEMES[theme] || THEMES.cyan;
  if ((!deg && !mono) || ['THINKING', 'MUTED', 'SETUP'].includes(name)) return rgb;
  let [r, g, b] = rgb.split(',').map((x) => +x / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  h = (h + deg + 360) % 360; if (mono) s = 0.04;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), mm = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round((v + mm) * 255)).join(',');
}
function setTheme(name) {
  if (!THEMES[name]) name = 'cyan';
  theme = name;
  scene.setTheme(...THEMES[name]);
  const cur = S.state; S.state = '';
  setState(cur);
}
window.__setTheme = setTheme;

/* ---------- state ---------- */
function setState(name) {
  if (name === S.state) return;
  S.state = name;
  const rgb = themed(COLORS[name] || COLORS.LISTENING, name);
  const root = document.documentElement.style;
  root.setProperty('--accent-rgb', rgb);
  root.setProperty('--accent', `rgb(${rgb})`);
  $('#st-name').textContent = LABEL[name] || name;
  scene.setState(name);
  hint();
}
function hint() {
  const h = $('#st-hint');
  if (S.state === 'STANDBY') h.textContent = S.wakeOk ? 'SAY “HEY JARVIS”' : 'CLICK THE CORE TO TALK';
  else if (S.state === 'SETUP') h.textContent = 'OPEN CONFIGURATION · ADD API KEY';
  else h.textContent = '';
}

/* ---------- panels ---------- */
function list(el, items, empty, opts = {}) {
  const box = $(el);
  if (!items.length) { box.innerHTML = `<div class="row dim"><span>${esc(empty)}</span></div>`; return; }
  box.innerHTML = items.slice(0, opts.max || 4).map((t, i) =>
    `<div class="row"><span title="${esc(t)}">${esc(t)}</span>${opts.kind ? `<b class="x" data-k="${opts.kind}" data-i="${i}">×</b>` : ''}</div>`).join('');
}
function lists(d) {
  list('#l-tasks', d.tasks || [], 'No open tasks', { kind: 'tasks' });
  list('#l-notes', d.notes || [], 'No notes', { kind: 'notes' });
  list('#l-contacts', (d.contacts || []).map(([k, v]) => `${k}  ${v}`), 'No contacts', { kind: 'contacts' });
  list('#l-timers', (d.timers || []).map((t) => `${t.label}   ${Math.floor(t.left / 60)}:${String(t.left % 60).padStart(2, '0')}`), 'No active timers');
}
document.addEventListener('click', (e) => {
  const x = e.target.closest('.x');
  if (x) call('remove_item', x.dataset.k, +x.dataset.i);
});
const acts = [];
function act(text) {
  const d = new Date();
  const ts = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  acts.unshift([ts, text]);
  acts.length = Math.min(acts.length, 5);
  $('#l-act').innerHTML = acts.map(([a, b]) => `<div class="act" title="${esc(b)}"><b>${a}</b>${esc(b)}</div>`).join('');
}
function meter(id, pct, label) {
  const m = $(id);
  m.style.setProperty('--v', Math.max(0, Math.min(100, pct)) + '%');
  m.querySelector('b').textContent = label;
}
function stats(d) {
  meter('#m-cpu', d.cpu, Math.round(d.cpu) + '%');
  meter('#m-ram', d.ram, Math.round(d.ram) + '%');
  if (d.bat == null) meter('#m-bat', 100, 'AC');
  else meter('#m-bat', d.bat, Math.round(d.bat) + '%' + (d.plug ? ' ⚡' : ''));
}

/* ---------- subtitles + transcript ---------- */
const fade = {};
function sub(id, text) {
  const el = $(id);
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(fade[id]);
  fade[id] = setTimeout(() => el.classList.remove('show'), Math.max(5000, text.length * 85));
}
function log(who, text) {
  if (who === 'you') sub('#s-you', text);
  else if (who === 'jarvis') sub('#s-jv', text);
  else toast(text, 6000);
  const h = $('#hist');
  const p = document.createElement('p');
  p.className = who;
  p.textContent = (who === 'you' ? 'YOU  ' : who === 'jarvis' ? 'JARVIS  ' : '') + text;
  h.appendChild(p);
  while (h.children.length > 80) h.removeChild(h.firstChild);
  h.scrollTop = h.scrollHeight;
}
let toastT;
function toast(text, ms) {
  const t = $('#toast');
  clearTimeout(toastT);
  if (!text) { t.classList.remove('show'); return; }
  t.textContent = text;
  t.classList.add('show');
  if (ms) toastT = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- approval ---------- */
let pending = null;
function showApproval(d) {
  pending = d.id;
  $('#a-title').textContent = d.title;
  $('#a-detail').textContent = d.detail || '';
  const card = $('#approve');
  $('#a-auto').checked = false;
  card.classList.toggle('hard', !!d.hard);
  card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
  // restart countdown bar
  const bar = card.querySelector('.t i'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
}
function answer(ok) {
  if (pending == null) return;
  call('approval', pending, ok, !!(ok && $('#a-auto').checked && !$('#approve').classList.contains('hard')));
  if (ok && $('#a-auto').checked && !$('#approve').classList.contains('hard')) setAuto(true);
  pending = null;
  $('#approve').classList.remove('show');
}
$('#a-yes').onclick = () => answer(true);
$('#a-no').onclick = () => answer(false);

function setAuto(on) { $('#auto-chip').classList.toggle('show', !!on); }
$('#auto-chip').onclick = () => { call('set_auto', false); setAuto(false); };

/* ---------- settings ---------- */
const setEl = $('#settings');
function fillSelect(sel, items, current) {
  sel.innerHTML = ['System default', ...items].map((n) => `<option>${esc(n)}</option>`).join('');
  sel.value = items.includes(current) ? current : 'System default';
}
function openSettings(open) {
  setEl.classList.toggle('open', open);
  $('#b-set').classList.toggle('on', open);
  if (open) call('get_devices').then((d) => {
    if (!d) return;
    fillSelect($('#s-mic'), d.inputs, S.settings.mic);
    fillSelect($('#s-spk'), d.outputs, S.settings.speaker);
  });
}
function loadSettings(s) {
  S.settings = s;
  $('#s-key').value = s.api_key || '';
  $('#s-vol').value = s.volume;
  $('#s-wake').value = s.wake_threshold;
  $('#s-barge').checked = !!s.barge_in;
  $('#s-conf').checked = !!s.confirm_risky;
  $('#s-fish').value = s.fish_key || '';
  voiceNote();
}
const put = (k, v) => { S.settings[k] = v; call('set_setting', k, v); };
$('#s-key').addEventListener('change', (e) => put('api_key', e.target.value.trim()));
$('#s-mic').addEventListener('change', (e) => put('mic', e.target.value === 'System default' ? '' : e.target.value));
$('#s-spk').addEventListener('change', (e) => put('speaker', e.target.value === 'System default' ? '' : e.target.value));
$('#s-vol').addEventListener('input', (e) => put('volume', +e.target.value));
$('#s-wake').addEventListener('input', (e) => put('wake_threshold', +e.target.value));
$('#s-barge').addEventListener('change', (e) => put('barge_in', e.target.checked));
$('#s-conf').addEventListener('change', (e) => put('confirm_risky', e.target.checked));
$('#s-fish').addEventListener('change', (e) => { put('fish_key', e.target.value.trim()); voiceNote(); });
function voiceNote() {
  const on = !!(S.settings.fish_key || '').trim(), n = $('#voice-note');
  n.classList.toggle('on', on);
  n.textContent = on ? 'Voice: J.A.R.V.I.S. (MCU) via Fish Audio.' : 'Voice: built-in. Add a Fish Audio key to give him the film voice.';
}
$('#s-test').onclick = () => call('test_audio');
$('#s-done').onclick = () => {
  const k = $('#s-key'); if (k.value.trim() !== (S.settings.api_key || '')) put('api_key', k.value.trim());
  const f = $('#s-fish'); if (f.value.trim() !== (S.settings.fish_key || '')) { put('fish_key', f.value.trim()); voiceNote(); }
  openSettings(false);
};
$('#b-set').onclick = () => openSettings(!setEl.classList.contains('open'));

/* ---------- controls ---------- */
$('#b-min').onclick = () => call('minimize');
$('#b-full').onclick = () => call('fullscreen');
$('#b-close').onclick = () => call('close');
$('#b-stop').onclick = () => call('stop');
$('#b-log').onclick = () => { $('#hist').classList.toggle('show'); $('#b-log').classList.toggle('on'); };
$('#b-mic').onclick = async () => {
  const muted = await call('toggle_mute');
  $('#b-mic').classList.toggle('red', !!muted);
};
const cmd = $('#cmd');
cmd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && cmd.value.trim()) { call('send_text', cmd.value.trim()); cmd.value = ''; e.stopPropagation(); }
  if (e.key === 'Escape') cmd.blur();
});
window.addEventListener('keydown', (e) => {
  if (pending != null) {
    if (e.key === 'Enter') { e.preventDefault(); answer(true); }
    else if (e.key === 'Escape') { e.preventDefault(); answer(false); }
    return;
  }
  if (e.key === 'Escape' && document.activeElement !== cmd) { if (setEl.classList.contains('open')) openSettings(false); else call('stop'); }
  else if (e.key === 'F11') { e.preventDefault(); call('fullscreen'); }
  else if ((e.key === '/' || e.key === 't') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') { e.preventDefault(); cmd.focus(); }
});
// click the core to talk without the wake word
$('#gl').addEventListener('click', (e) => {
  const r = Math.hypot(e.clientX - innerWidth / 2, e.clientY - innerHeight * 0.46);
  if (r < Math.min(innerWidth, innerHeight) * 0.22) call('wake');
});
window.addEventListener('mousemove', (e) => scene.setMouse(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1));

/* ---------- clock ---------- */
function clock() {
  const d = new Date();
  $('#clock b').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#clock span').textContent = d.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
}
clock(); setInterval(clock, 10000);

/* ---------- events from Python ---------- */
window.HUD = {
  on(ev) {
    switch (ev.t) {
      case 'f': setState(ev.s); scene.setLevels(ev.i, ev.o);
        $('#s-lvl').style.width = Math.min(100, ev.i * 100) + '%'; break;
      case 'log': log(ev.who, ev.text); break;
      case 'status': toast(ev.text, 0); break;
      case 'lists': lists(ev); break;
      case 'stats': stats(ev); break;
      case 'act': act(ev.text); break;
      case 'wake': scene.pulse(1); $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go'); break;
      case 'pulse': scene.pulse(0.6); break;
      case 'approval': showApproval(ev); break;
      case 'auto': setAuto(ev.on); break;
      case 'approval_clear': pending = null; $('#approve').classList.remove('show'); break;
      case 'wake_status': S.wakeOk = ev.ok; S.wakeErr = ev.err || ''; hint();
        $('#hint-wake').textContent = ev.ok ? 'Wake word engine: online. Say “Hey JARVIS” to wake him.' : 'Wake word engine unavailable: ' + ev.err + ' You can still click the core or type to talk.'; break;
    }
  },
};

/* ---------- boot sequence ---------- */
const BOOT = ['CORE REACTOR ............ ONLINE', 'NEURAL LINK ............. ESTABLISHED', 'AUDIO CORTEX ............ CALIBRATED', 'WAKE WORD ENGINE ........ ARMED', 'SYSTEM CONTROL .......... AUTHORISED', 'ALL SYSTEMS NOMINAL'];
async function boot(initial) {
  const pre = $('#boot-log');
  BOOT.forEach((l, i) => { const s = document.createElement('span'); s.textContent = l; s.style.animationDelay = (0.5 + i * 0.28) + 's'; pre.appendChild(s); });
  await new Promise((r) => setTimeout(r, 2500));
  $('#boot').classList.add('gone');
  document.body.classList.add('ready');
  scene.intro();
  if (initial) { loadSettings(initial.settings); lists(initial.lists); setState(initial.state); setTheme((initial.settings || {}).theme); }
}

async function start() {
  let initial = null;
  for (let i = 0; i < 80 && !initial; i++) {          // wait for the Python bridge
    if (!window.pywebview && i >= 6) break;            // plain browser: no bridge will ever appear
    initial = await call('ready');
    if (!initial) await new Promise((r) => setTimeout(r, 100));
  }
  if (!initial) initial = demo();                      // opened in a plain browser: preview mode
  await boot(initial);
}
function demo() {
  const states = ['STANDBY', 'LISTENING', 'THINKING', 'SPEAKING'];
  let i = 0;
  setInterval(() => { HUD.on({ t: 'f', s: states[i = (i + 1) % 4], i: Math.random() * 0.6, o: Math.random() * 0.7 }); }, 3500);
  setInterval(() => HUD.on({ t: 'f', s: S.state === 'BOOT' ? 'STANDBY' : S.state, i: 0.1 + Math.random() * 0.5, o: 0.1 + Math.random() * 0.6 }), 60);
  setTimeout(() => {
    HUD.on({ t: 'stats', cpu: 23, ram: 61, bat: 84, plug: true });
    HUD.on({ t: 'act', text: 'RUN COMMAND · Get-Process | sort cpu' });
    HUD.on({ t: 'act', text: 'OPEN APP · Spotify' });
    HUD.on({ t: 'log', who: 'you', text: 'Hey Jarvis, what is eating my CPU?' });
    HUD.on({ t: 'log', who: 'jarvis', text: 'Chrome, mostly. Eleven tabs of it, I’m afraid.' });
    HUD.on({ t: 'wake_status', ok: true });
  }, 3200);
  return { state: 'STANDBY', settings: { api_key: '', volume: 1, wake_threshold: 0.5, barge_in: false, confirm_risky: true, fish_key: '', mic: '', speaker: '' },
    lists: { tasks: ['Renew passport', 'Book dentist'], notes: ['Wi-Fi password is on the fridge'], contacts: [['Mum', '07700 900123']], timers: [{ label: 'Tea', left: 142 }] } };
}
start();

window.__hud = { call, esc, put, S };
