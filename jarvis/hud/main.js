import { createScene } from './scene.js';
import { GROUPS } from './globe.js';
import { createCalendar } from './calendar.js';
import { createVision } from './vision.js';
import { createPanels } from './panels.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = () => (window.pywebview && window.pywebview.api) || null;
const call = (fn, ...a) => { try { const p = api(); return p ? p[fn](...a) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };

/* Satellite elements: through the Python bridge (cached, CelesTrak-friendly); straight from CelesTrak in a plain browser. */
async function loadTLE(group) {
  if (api()) return (await call('get_tle', group)) || '';
  const g = { stations: 'stations', brightest: 'visual', gps: 'gps-ops', weather: 'weather', science: 'science', geo: 'geo', starlink: 'starlink' }[group];
  try {
    const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`);
    return r.ok ? await r.text() : '';
  } catch (e) { return ''; }
}
const scene = createScene($('#gl'), { loadTLE, onGlobe: () => globeUI(), onFrame: (cam) => labels(cam) });
const globe = scene.globe;
window.__jv = { scene };   // for debugging from the dev tools
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
  document.body.dataset.state = name;
  hint();
}
let thinkT = 0, thinkTimer = null;
function hint() {
  const h = $('#st-hint');
  if (S.state === 'THINKING') {
    if (!thinkTimer) { thinkT = Date.now(); thinkTimer = setInterval(hint, 1000); }
    const s = Math.round((Date.now() - thinkT) / 1000);
    h.textContent = s >= 2 ? `THINKING · ${s}s${s > 25 ? ' · ESC TO CANCEL' : ''}` : '';
    return;
  }
  if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; }
  if (S.state === 'STANDBY') h.textContent = S.wakeOk ? 'SAY “HEY JARVIS”' : 'CLICK THE CORE TO TALK';
  else if (S.state === 'SETUP') h.textContent = 'OPEN CONFIGURATION · ADD API KEY';
  else h.textContent = '';
}

/* ---------- panels ---------- */
function list(el, items, empty, opts = {}) {
  const box = $(el);
  const pnl = box.closest('.panel'); if (pnl) pnl.classList.toggle('empty', !items.length);   // empty panels stay out of the way
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
  window.dispatchEvent(new CustomEvent('jv-stats', { detail: d }));
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
  else if (who === 'jarvis') { sub('#s-jv', text); say('JARVIS: ' + text); }
  else toast(text, 6000);
  const h = $('#hist');
  const p = document.createElement('p');
  p.className = who;
  p.textContent = (who === 'you' ? 'YOU  ' : who === 'jarvis' ? 'JARVIS  ' : '') + text;
  h.appendChild(p);
  while (h.children.length > 80) h.removeChild(h.firstChild);
  h.scrollTop = h.scrollHeight;
}
function say(text) { const r = $('#sr-say'); r.textContent = ''; setTimeout(() => { r.textContent = text; }, 30); }
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
  if (open) { mcpLoad(); ordersLoad(); }
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
  $('#fk-gem').value = s.api_key || ''; $('#fk-groq').value = s.groq_key || '';
  $('#s-lfb').checked = !!s.local_fallback;
  voiceNote();
  brainFields();
  applyA11y();
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

/* ---------- AI model (any provider) ---------- */
let PROVIDERS = [
  { id: 'gemini-live', label: 'Gemini Live · native voice', needs_key: true, model: '', url: '' },
  { id: 'anthropic', label: 'Anthropic · Claude', needs_key: true, model: 'claude-sonnet-5-5', url: 'https://api.anthropic.com/v1' },
  { id: 'openai', label: 'OpenAI', needs_key: true, model: 'gpt-4.1-mini', url: 'https://api.openai.com/v1' },
  { id: 'ollama', label: 'Ollama · local', needs_key: false, model: 'llama3.1', url: 'http://localhost:11434/v1' },
  { id: 'custom', label: 'Custom OpenAI-compatible', needs_key: false, model: '', url: '' },
];
function fillProviders(list) {
  if (list && list.length) PROVIDERS = list;
  $('#s-prov').innerHTML = PROVIDERS.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
  $('#s-prov').value = S.settings.brain_provider || 'gemini-live';
}
function brainFields() {
  const s = S.settings, id = s.brain_provider || 'gemini-live', p = PROVIDERS.find((x) => x.id === id) || PROVIDERS[0];
  if ($('#s-prov').options.length !== PROVIDERS.length) fillProviders();
  $('#s-prov').value = id;
  const live = id === 'gemini-live';
  $('#brain-fields').hidden = live;
  $('#s-model').value = s.brain_model || ''; $('#s-model').placeholder = p.model || 'model name';
  $('#s-bkey').value = s.brain_key || '';
  $('#s-bkey').placeholder = p.needs_key ? (id === 'gemini' ? 'leave empty to use the Gemini key below' : 'paste the provider API key') : 'not needed for local models';
  $('#s-burl').value = s.brain_url || ''; $('#s-burl').placeholder = p.url || 'https://your-server/v1';
  $('#s-stt').value = s.stt_mode || 'auto'; $('#s-tts').value = s.tts_mode || 'auto';
  $('#s-think').value = s.brain_think || 'auto'; $('#s-vision').value = s.vision_model || '';
  if ($('#s-kv').options.length) $('#s-kv').value = s.kokoro_voice || 'bm_george';
  $('#l-gkey').textContent = live ? 'Gemini API key' : 'Gemini API key · optional (voice input, research)';
  $('#brain-note').textContent = live
    ? 'Gemini Live hears and speaks natively. Pick another provider to use Claude, GPT, Llama, Mistral, DeepSeek, Grok, a local Ollama model or any OpenAI-compatible server; every tool and the hologram keep working.'
    : `${p.label}: text and tools go to ${s.brain_url || p.url || 'your server'}. The wake word stays on this PC; speech is transcribed and spoken as chosen below.`;
}
function setBrain(b) { if (b) $('#brain-name').textContent = `${b.label}${b.model ? ' · ' + b.model : ''}`; }
$('#s-prov').addEventListener('change', (e) => {
  const id = e.target.value;
  put('brain_url', ''); put('brain_model', ''); put('brain_provider', id);
  brainFields();
});
[['#s-model', 'brain_model'], ['#s-bkey', 'brain_key'], ['#s-burl', 'brain_url']].forEach(([q, k]) => {
  $(q).addEventListener('change', (e) => { put(k, e.target.value.trim()); brainFields(); });
  $(q).addEventListener('keydown', (e) => e.stopPropagation());
});
$('#s-stt').addEventListener('change', (e) => put('stt_mode', e.target.value));
$('#s-think').addEventListener('change', (e) => put('brain_think', e.target.value));
$('#s-vision').addEventListener('change', (e) => put('vision_model', e.target.value.trim()));
$('#s-vision').addEventListener('keydown', (e) => e.stopPropagation());
$('#s-kv').addEventListener('change', (e) => put('kokoro_voice', e.target.value));
$('#s-kvt').onclick = async () => { const r = await call('test_voice', $('#s-kv').value); if (r && r !== 'ok') $('#brain-note').textContent = r; else if (!r) $('#brain-note').textContent = 'Voice preview needs the JARVIS app.'; };

/* ---------- free cloud AI ---------- */
$('#fk-gem-get').onclick = () => { call('open_url', 'https://aistudio.google.com/apikey'); $('#fk-msg').textContent = 'Sign in with Google, press Create API key, copy it and paste it here.'; };
$('#fk-groq-get').onclick = () => { call('open_url', 'https://console.groq.com/keys'); $('#fk-msg').textContent = 'Sign in, press Create API Key, copy it and paste it here.'; };
$('#fk-gem').addEventListener('change', (e) => { put('api_key', e.target.value.trim()); $('#s-key').value = e.target.value.trim(); });
$('#fk-groq').addEventListener('change', (e) => put('groq_key', e.target.value.trim()));
for (const q of ['#fk-gem', '#fk-groq']) $(q).addEventListener('keydown', (e) => e.stopPropagation());
$('#fk-use').onclick = async () => {
  const g = $('#fk-gem').value.trim(), q = $('#fk-groq').value.trim();
  if (!g && !q) { $('#fk-msg').textContent = 'Paste at least one free key first.'; return; }
  if (g !== (S.settings.api_key || '')) put('api_key', g);
  if (q !== (S.settings.groq_key || '')) put('groq_key', q);
  put('brain_provider', 'auto'); put('stt_mode', 'auto'); brainFields();
  $('#fk-msg').textContent = 'Testing…';
  const r = await call('test_brain');
  $('#fk-msg').textContent = r ? (r.ok ? '✓ Ready: ' : '✗ ') + r.text : 'Saved. (Testing needs the JARVIS app.)';
};

/* ---------- free local AI ---------- */
async function localInfo() {
  const d = await call('local_info');
  if (!d) { $('#la-hw').textContent = 'One click installs Ollama and the best free model your PC can run (needs the JARVIS app).'; return; }
  const hw = d.hw;
  $('#la-hw').innerHTML = `${esc(hw.gpu)}${hw.vram_gb ? ' · ' + hw.vram_gb + ' GB VRAM' : ''} · ${hw.ram_gb} GB RAM.<br>Best brain for this PC: <b style="color:#fff;letter-spacing:.04em">${esc(d.models[0])}</b> (thinks, uses tools), plus <b style="color:#fff;letter-spacing:.04em">${esc(d.vision)}</b> to see the screen.${d.cpu_only ? ' No NVIDIA GPU found, so it will run on the CPU (slower).' : ''}${d.ollama ? ' Ollama is running' + (d.installed.length ? ' with ' + d.installed.length + ' models.' : '.') : ''}`;
  $('#s-kv').innerHTML = Object.entries(d.voices).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');
  $('#s-kv').value = S.settings.kokoro_voice || 'bm_george';
  if (d.installed.length) $('#s-models').innerHTML = d.installed.map((m) => `<option value="${esc(m)}">`).join('');
}
$('#s-lfb').addEventListener('change', (e) => put('local_fallback', e.target.checked));
$('#la-rm').onclick = async () => {
  $('#la-msg').textContent = 'Removing the local AI engine and its models…';
  const r = await call('remove_local');
  $('#la-msg').textContent = r || 'Removing needs the JARVIS app.';
};
$('#adv-local').addEventListener('toggle', (e) => { if (e.target.open) localInfo(); });
$('#la-go').onclick = async () => {
  const r = await call('local_setup', '', true);
  $('#la-msg').textContent = r === 'started' ? 'Starting…' : (r || 'Local setup needs the JARVIS app.');
  if (r === 'started') $('#la-go').disabled = true;
};
function setupProgress(ev) {
  $('#la-msg').textContent = ev.text; $('#la-msg').style.color = ev.ok === false ? 'var(--red)' : '';
  if (ev.pct != null) $('#la-bar').style.width = ev.pct + '%';
  if (ev.done) { $('#la-go').disabled = false; act('LOCAL AI · ' + (ev.ok ? 'READY' : 'FAILED')); if (ev.ok) { $('#la-bar').style.width = '100%'; localInfo(); } }
}

/* ---------- MCP servers ---------- */
let mcpPresets = {};
window.__renderMcp = () => {
  const rows = window.__mcpRows || [];
  $('#mcp-list').innerHTML = rows.length ? rows.map((r) => `<div class="mrow"><i class="${esc(r.status)}" title="${esc(r.status)}"></i><span>${esc(r.name)} · ${r.tools} tools<small title="${esc(r.error || r.command || r.url)}">${esc(r.error || r.command || r.url)}</small></span><button data-mcp-restart="${esc(r.name)}" title="Reconnect">↻</button><button data-mcp-rm="${esc(r.name)}" title="Remove">✕</button></div>`).join('')
    : '<p class="gnote" style="text-align:left">No servers yet. Pick one below.</p>';
};
async function mcpLoad() {
  const d = await call('mcp_status');
  if (!d) { $('#mcp-list').innerHTML = '<p class="gnote" style="text-align:left">MCP needs the JARVIS app.</p>'; return; }
  mcpPresets = d.presets; window.__mcpRows = d.servers; window.__renderMcp();
  $('#mcp-preset').innerHTML = Object.entries(d.presets).map(([k, v]) => `<option value="${esc(k)}">${esc(v.label)}</option>`).join('');
  $('#mcp-json').value = d.config;
  $('#mcp-note').textContent = (d.presets[$('#mcp-preset').value] || {}).note || '';
}
$('#mcp-preset').addEventListener('change', (e) => { $('#mcp-note').textContent = (mcpPresets[e.target.value] || {}).note || ''; });
$('#mcp-add').onclick = async () => { $('#mcp-note').textContent = await call('mcp_action', 'add_preset', $('#mcp-preset').value) || ''; mcpLoad(); };
$('#mcp-imp').onclick = async () => { $('#mcp-note').textContent = await call('mcp_action', 'import_claude', '') || ''; mcpLoad(); };
$('#mcp-edit').onclick = () => { const h = !$('#mcp-json').hidden; $('#mcp-json').hidden = h; $('#mcp-jrow').hidden = h; };
$('#mcp-save').onclick = async () => { $('#mcp-note').textContent = await call('mcp_save', $('#mcp-json').value) || ''; mcpLoad(); };
$('#mcp-json').addEventListener('keydown', (e) => e.stopPropagation());
$('#mcp-list').addEventListener('click', async (e) => {
  const rm = e.target.closest('[data-mcp-rm]'), rs = e.target.closest('[data-mcp-restart]');
  if (rm) { $('#mcp-note').textContent = await call('mcp_action', 'remove', rm.dataset.mcpRm) || ''; mcpLoad(); }
  if (rs) { $('#mcp-note').textContent = await call('mcp_action', 'restart', rs.dataset.mcpRestart) || ''; setTimeout(mcpLoad, 1500); }
});

/* ---------- standing orders ---------- */
$('#orders').addEventListener('keydown', (e) => e.stopPropagation());
$('#orders-save').onclick = async () => { const r = await call('orders_save', $('#orders').value); act('STANDING ORDERS · ' + (r || 'needs the JARVIS app')); };
async function ordersLoad() { const t = await call('orders_get'); $('#orders').value = t || '# Standing orders\n(Available in the JARVIS app.)'; }
$('#s-tts').addEventListener('change', (e) => put('tts_mode', e.target.value));
$('#s-list').onclick = async () => {
  const n = $('#brain-note'); n.textContent = 'Asking the provider which models this key can use…';
  const r = await call('list_models');
  if (!r) { n.textContent = 'Model listing needs the JARVIS app (not available in browser preview).'; return; }
  if (!r.ok) { n.textContent = r.error; return; }
  $('#s-models').innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join('');
  n.textContent = `${r.models.length} models available. Click the Model box to pick one.`;
  $('#s-model').focus();
};
$('#s-tb').onclick = async () => {
  const n = $('#brain-note'); n.textContent = 'Testing…';
  const r = await call('test_brain');
  n.textContent = r ? (r.ok ? '✓ ' : '✗ ') + r.text : 'Testing needs the JARVIS app.';
};

/* ---------- accessibility ---------- */
const mqCalm = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
function applyA11y() {
  const s = S.settings || {};
  const calm = !!s.ui_reduce_motion || mqCalm.matches;
  document.body.classList.toggle('calm', calm);
  document.body.classList.toggle('contrast', !!s.ui_contrast);
  document.body.classList.toggle('nocaps', s.ui_captions === false);
  document.documentElement.style.setProperty('--ui-scale', s.ui_scale || 1);
  scene.setCalm(calm);
  scene.setSpin(s.ui_spin ?? 0.45); $('#s-spin').value = s.ui_spin ?? 0.45;
  $('#s-calm').checked = !!s.ui_reduce_motion; $('#s-contrast').checked = !!s.ui_contrast;
  $('#s-caps').checked = s.ui_captions !== false; $('#s-scale').value = s.ui_scale || 1;
}
mqCalm.addEventListener && mqCalm.addEventListener('change', applyA11y);
$('#s-calm').addEventListener('change', (e) => { put('ui_reduce_motion', e.target.checked); applyA11y(); });
$('#s-contrast').addEventListener('change', (e) => { put('ui_contrast', e.target.checked); applyA11y(); });
$('#s-caps').addEventListener('change', (e) => { put('ui_captions', e.target.checked); applyA11y(); });
$('#s-scale').addEventListener('input', (e) => { put('ui_scale', +e.target.value); applyA11y(); });
$('#s-spin').addEventListener('input', (e) => { put('ui_spin', +e.target.value); applyA11y(); });
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
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === 'Escape' && document.activeElement !== cmd) {
    if (setEl.classList.contains('open')) openSettings(false);
    else if (cal.isOpen) cal.close();
    else if (scene.mode === 'model') { setMode('core'); }
    else if (scene.mode === 'globe' && globe.satView) { globe.satView = false; }
    else if (scene.mode === 'globe' && globe.selected) { globe.select(null); }
    else call('stop');
  }
  else if (!typing && (e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); cal.toggle(); }
  else if (!typing && (e.key === 'o' || e.key === 'O') && !e.ctrlKey) { e.preventDefault(); HUD.ui({ action: vision.open ? 'close' : 'open', target: 'camera' }); }
  else if (!typing && (e.key === 'j' || e.key === 'J') && !e.ctrlKey) { e.preventDefault(); window.__cc && window.__cc.open(!window.__cc.isOpen); }
  else if (!typing && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); setMode(scene.mode === 'globe' ? 'core' : 'globe'); }
  else if (!typing && scene.mode === 'globe' && globeKey(e)) e.preventDefault();
  else if (e.key === 'F11') { e.preventDefault(); call('fullscreen'); }
  else if ((e.key === '/' || e.key === 't') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') { e.preventDefault(); cmd.focus(); }
});
// pointer: click the core to talk; in Earth mode drag to rotate and click a satellite to lock on
const gl = $('#gl');
let drag = null;
gl.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0 };
  if (scene.mode !== 'core') { gl.setPointerCapture(e.pointerId); document.body.classList.add('dragging'); }
});
gl.addEventListener('pointermove', (e) => {
  if (!drag || scene.mode === 'core') return;
  const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
  drag.lx = e.clientX; drag.ly = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (scene.mode === 'model') scene.holo.drag(dx, dy);
  else if (!globe.satView) globe.drag(dx, dy);
});
gl.addEventListener('pointerup', (e) => {
  document.body.classList.remove('dragging');
  if (!drag) return;
  const click = drag.moved < 6; drag = null;
  if (!click) return;
  if (scene.mode === 'model') return;
  if (scene.mode === 'globe') {
    const s = globe.pick(scene.camera, e.clientX, e.clientY, innerWidth, innerHeight, 16);
    if (s) { globe.select(s); act('TARGET LOCK · ' + s.name); scene.pulse(0.35); }
    return;
  }
  const r = Math.hypot(e.clientX - innerWidth / 2, e.clientY - innerHeight * 0.46);
  if (r < Math.min(innerWidth, innerHeight) * 0.22) call('wake');
});
gl.addEventListener('wheel', (e) => { if (scene.mode !== 'core') { e.preventDefault(); scene.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); } }, { passive: false });
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
        $('#s-lvl').style.width = Math.min(100, ev.i * 100) + '%';
        if (setEl.classList.contains('open') && ev.v != null) { const h = $('#s-heard'); h.textContent = ev.v ? 'Mic check: hearing SPEECH' : `Mic check: background only (noise ${Math.round((ev.nf || 0) * 100)}%, ignored)`; h.style.color = ev.v ? 'var(--accent)' : 'var(--dim)'; }
        break;
      case 'log': log(ev.who, ev.text); break;
      case 'status': toast(ev.text, 0); break;
      case 'lists': lists(ev); break;
      case 'stats': stats(ev); break;
      case 'act': act(ev.text); break;
      case 'wake': scene.pulse(1); $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go'); break;
      case 'pulse': scene.pulse(0.6); break;
      case 'approval': showApproval(ev); break;
      case 'brain': setBrain(ev); break;
      case 'settings': loadSettings(ev.settings); break;
      case 'calendar': if (ev.close) cal.close(); else cal.open(ev.date, ev.view); break;
      case 'calendar_changed': cal.refresh(); window.dispatchEvent(new Event('jv-cal-changed')); break;
      case 'auto': setAuto(ev.on); break;
      case 'approval_clear': pending = null; $('#approve').classList.remove('show'); break;
      case 'thought': { const h = $('#hist'), p = document.createElement('p'); p.className = 'sys'; p.textContent = '💭 ' + ev.text.slice(-400); h.appendChild(p); h.scrollTop = h.scrollHeight; break; }
      case 'mcp': window.__mcpRows = ev.servers; window.__renderMcp && window.__renderMcp(); break;
      case 'setup': setupProgress(ev); break;
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
  await new Promise((r) => setTimeout(r, document.body.classList.contains('calm') || mqCalm.matches ? 600 : 2500));
  $('#boot').classList.add('gone');
  document.body.classList.add('ready');
  scene.intro();
  if (initial) {
    fillProviders(initial.providers); S.settings = initial.settings || {};
    loadSettings(initial.settings); lists(initial.lists); setState(initial.state); setTheme((initial.settings || {}).theme);
    setBrain(initial.brain);
    if (initial.state === 'SETUP') setTimeout(() => openSettings(true), 1200);   // first run: go straight to choosing a brain
    const st = initial.settings || {};
    if (st.home_lat !== '' && st.home_lat != null && st.home_lon !== '' && st.home_lon != null) globe.setPin('home', { name: st.home_name || 'Home', lat: +st.home_lat, lon: +st.home_lon });
  }
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
  return { state: 'STANDBY', brain: { label: 'Preview', model: 'no model connected' },
    settings: { api_key: '', volume: 1, wake_threshold: 0.5, barge_in: false, confirm_risky: true, fish_key: '', mic: '', speaker: '', brain_provider: 'gemini-live', stt_mode: 'auto', tts_mode: 'auto', ui_scale: 1, ui_captions: true },
    lists: { tasks: ['Renew passport', 'Book dentist'], notes: ['Wi-Fi password is on the fridge'], contacts: [['Mum', '07700 900123']], timers: [{ label: 'Tea', left: 142 }] } };
}

/* ---------- calendar ---------- */
const cal = createCalendar({ call, hasBridge: () => !!api(), esc, act, toast, say, onOpen: () => {} });
window.__cal = cal;

/* =====================================================================================
   Holographic Earth: mode switch, panel, labels, keyboard, and the `hologram` tool
   ===================================================================================== */
function setMode(m) {
  scene.setMode(m);
  document.body.classList.toggle('model', m === 'model');
  $('#ghint').textContent = m === 'model' ? 'DRAG TO TURN · SCROLL TO ZOOM · ESC FOR CORE' : 'DRAG TO ROTATE · SCROLL OR +/- TO ZOOM · CLICK A SATELLITE · G FOR CORE';
  if (m !== 'model') holoLabels([]);
  const on = m === 'globe';
  document.body.classList.toggle('globe', on);
  if (on) { globe.ensureGroups(); globeUI(); act('HOLOGRAM · EARTH'); }
  else if (m === 'core') act('HOLOGRAM · CORE');
}
$('#g-core').onclick = () => setMode('core');

const fmtLat = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`;
const fmtNum = (v) => Math.round(v).toLocaleString('en-GB');

function layerChips() {
  const c = globe.counts();
  $('#g-layers').innerHTML = Object.entries(GROUPS).map(([k, g]) =>
    `<button class="gchip" data-g="${k}" aria-pressed="${g.on}" style="color:#${g.color.toString(16).padStart(6, '0')}"><i></i><span style="color:var(--txt)">${g.label}</span>${c[k] ? `<em>${c[k]}</em>` : ''}</button>`).join('');
}
$('#g-layers').addEventListener('click', (e) => {
  const b = e.target.closest('.gchip'); if (!b) return;
  const k = b.dataset.g; globe.setGroup(k, !GROUPS[k].on); layerChips();
});

function globeUI() {
  layerChips();
  $('#g-count').textContent = fmtNum(globe.total);
  $('#g-src').textContent = globe.total ? (globe.live ? 'LIVE · CELESTRAK' : 'SIMULATED · OFFLINE') : 'LOADING';
  const d = globe.describe(globe.selected);
  $('#g-card').hidden = !d;
  $('#gc-view').classList.toggle('on', globe.satView); $('#gc-view').setAttribute('aria-pressed', String(globe.satView));
  $('#gc-follow').classList.toggle('on', !!globe.view.follow); $('#gc-follow').setAttribute('aria-pressed', String(!!globe.view.follow));
  if (d) {
    $('#gc-name').textContent = d.name; $('#gc-name').style.color = d.color;
    $('#gc-sub').textContent = `NORAD ${d.norad} · ${d.group.toUpperCase()}${d.live ? '' : ' · SIMULATED'}`;
  }
  liveCard();
}
function liveCard() {
  const d = globe.describe(globe.selected);
  const now = new Date();
  $('#g-utc').textContent = now.toISOString().slice(11, 16);
  const sun = globe.sun; $('#g-sun').textContent = `${Math.round(sun.lat)}°,${Math.round(sun.lon)}°`;
  if (!d) return;
  $('#gc-alt').textContent = fmtNum(d.alt) + ' km'; $('#gc-vel').textContent = d.vel.toFixed(2) + ' km/s';
  $('#gc-lat').textContent = fmtLat(d.lat); $('#gc-lon').textContent = fmtLon(d.lon);
  $('#gc-per').textContent = d.period.toFixed(1) + ' min'; $('#gc-inc').textContent = d.inc.toFixed(1) + '°';
}
setInterval(() => { if (scene.mode === 'globe') liveCard(); }, 1000);

$('#gc-view').onclick = () => { globe.satView = !globe.satView; };
$('#gc-follow').onclick = () => { const s = globe.selected; if (s) { globe.view.follow = !globe.view.follow; if (globe.view.follow) globe.select(s); globeUI(); } };
$('#gc-free').onclick = () => globe.select(null);

// satellite search (combobox)
let results = [], ri = -1;
function renderResults() {
  const box = $('#g-results');
  box.innerHTML = results.map((s, i) => `<li role="option" id="gr-${i}" aria-selected="${i === ri}" data-i="${i}"><span>${esc(s.name)}</span><small>${esc(GROUPS[s.group].label)}</small></li>`).join('');
  $('#g-search').setAttribute('aria-expanded', String(results.length > 0));
  if (ri >= 0) $('#g-search').setAttribute('aria-activedescendant', 'gr-' + ri); else $('#g-search').removeAttribute('aria-activedescendant');
}
function choose(s) { if (!s) return; globe.select(s); results = []; ri = -1; renderResults(); $('#g-search').value = ''; act('TARGET LOCK · ' + s.name); say('Tracking ' + s.name); }
$('#g-search').addEventListener('input', (e) => { results = globe.search(e.target.value); ri = results.length ? 0 : -1; renderResults(); });
$('#g-search').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'ArrowDown') { ri = Math.min(results.length - 1, ri + 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { ri = Math.max(0, ri - 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'Enter') choose(results[ri] || globe.find(e.target.value));
  else if (e.key === 'Escape') { results = []; renderResults(); e.target.blur(); }
});
$('#g-results').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) choose(results[+li.dataset.i]); });

// places
async function geocode(q) {
  if (api()) return call('geocode', q);
  try {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&name=' + encodeURIComponent(q));
    const j = await r.json(); const x = (j.results || [])[0];
    return x ? { name: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude } : null;
  } catch (e) { return null; }
}
let lastPlace = null;
function flyTo(p, which = 'place') {
  lastPlace = p; globe.select(null); globe.setPin(which, p); globe.focusLatLon(p.lat, p.lon); scene.zoomBy(0.85);
  act(`FOCUS · ${p.name}`); say(`Showing ${p.name}`);
}
$('#g-place').addEventListener('keydown', async (e) => {
  e.stopPropagation();
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  const p = await geocode(e.target.value.trim());
  if (p) { flyTo(p); e.target.value = ''; } else toast('No such place found', 3000);
});
$('#g-home').onclick = () => { const h = globe.pinInfo.home; if (h) flyTo(h, 'home'); else toast('No home set yet · fly to a place, then Set as home', 4000); };
$('#g-sethome').onclick = () => {
  const p = lastPlace; if (!p) { toast('Fly to a place first', 3000); return; }
  globe.setPin('home', p); put('home_name', p.name); put('home_lat', p.lat); put('home_lon', p.lon); act('HOME · ' + p.name);
};
$('#g-sunbtn').onclick = () => { globe.select(null); globe.focusLatLon(globe.sun.lat, globe.sun.lon); act('FOCUS · SUBSOLAR POINT'); };

function globeKey(e) {
  const step = e.shiftKey ? 0.6 : 0.25;
  switch (e.key) {
    case 'ArrowLeft': globe.nudge(-step, 0); return true;
    case 'ArrowRight': globe.nudge(step, 0); return true;
    case 'ArrowUp': globe.nudge(0, step); return true;
    case 'ArrowDown': globe.nudge(0, -step); return true;
    case '+': case '=': scene.zoomBy(0.88); return true;
    case '-': case '_': scene.zoomBy(1.14); return true;
    case 'v': case 'V': if (globe.selected) globe.satView = !globe.satView; return true;
    case '[': case ']': {
      const pool = cyclePool(); if (!pool.length) return true;
      const i = pool.indexOf(globe.selected);
      choose(pool[(i + (e.key === ']' ? 1 : -1) + pool.length) % pool.length]); return true;
    }
  }
  return false;
}
function cyclePool() {
  // notable satellites first, then everything visible
  const pri = ['ISS', 'TIANHE', 'HST', 'NOAA', 'GOES', 'METEOSAT', 'TERRA', 'AQUA', 'LANDSAT', 'SENTINEL', 'GPS'];
  const all = [];
  for (const p of pri) for (const s of globe.search(p, 40)) if (!all.includes(s)) all.push(s);
  return all.length ? all : globe.search('A', 50);
}

// HTML labels that follow 3D anchors (selected satellite, ISS, home, focused place)
function placeLabel(el, anchor, cam, html) {
  const p = anchor && scene.mode === 'globe' ? globe.screenOf(cam, anchor, innerWidth, innerHeight) : null;
  if (!p) { el.style.transform = 'translate(-9999px,-9999px)'; return; }
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
  el.style.transform = `translate(${Math.round(p.x + 30)}px,${Math.round(p.y - 8)}px)`;
}
let issCache = null, issT = 0;
function holoLabels(list, cam) {
  const box = $('#holo-labels');
  // project, then nudge labels apart vertically so callouts never sit on top of each other
  list = list.map((l) => { const p = l.pos.clone().project(cam); return { ...l, sx: (p.x * 0.5 + 0.5) * innerWidth, sy: (-p.y * 0.5 + 0.5) * innerHeight, z: p.z }; }).sort((a, b) => a.sy - b.sy);
  for (let i = 1; i < list.length; i++) if (list[i].sy - list[i - 1].sy < 16 && Math.abs(list[i].sx - list[i - 1].sx) < 220) list[i].sy = list[i - 1].sy + 16;
  while (box.children.length < list.length) { const d = document.createElement('div'); d.className = 'lbl'; box.appendChild(d); }
  [...box.children].forEach((el, i) => {
    const l = list[i];
    if (!l) { el.style.transform = 'translate(-9999px,-9999px)'; return; }
    if (l.z > 1) { el.style.transform = 'translate(-9999px,-9999px)'; return; }
    if (el._t !== l.text) { el.textContent = l.text; el._t = l.text; }
    el.style.transform = `translate(${Math.round(l.sx + 30)}px,${Math.round(l.sy - 8)}px)`;
  });
}
function labels(cam) {
  if (scene.mode === 'model') holoLabels(scene.holo.labelAnchors(), cam);
  if (scene.mode !== 'globe' && !document.body.classList.contains('globe')) { for (const id of ['#lb-sel', '#lb-iss', '#lb-home', '#lb-place']) $(id).style.transform = 'translate(-9999px,-9999px)'; return; }
  const s = globe.selected;
  placeLabel($('#lb-sel'), globe.labelAnchor(s), cam, s && s.st ? `${esc(s.name)}<small>${fmtNum(s.st.alt)} KM · ${s.st.vel.toFixed(2)} KM/S</small>` : '');
  if (performance.now() - issT > 2000) { issCache = globe.find('ISS'); issT = performance.now(); }
  const iss = issCache && issCache !== s ? issCache : null;
  placeLabel($('#lb-iss'), globe.labelAnchor(iss), cam, iss ? 'ISS<small>CREWED</small>' : '');
  const h = globe.pinInfo.home, pl = globe.pinInfo.place;
  placeLabel($('#lb-home'), globe.pinAnchor('home'), cam, h ? `HOME<small>${esc(h.name.split(',')[0].toUpperCase())}</small>` : '');
  placeLabel($('#lb-place'), globe.pinAnchor('place'), cam, pl ? `${esc(pl.name.split(',')[0].toUpperCase())}<small>${fmtLat(pl.lat)} ${fmtLon(pl.lon)}</small>` : '');
}

/** The `hologram` tool, called synchronously from Python (any model can drive the HUD). Returns a sentence. */
window.HUD.hologram = function (c) {
  const a = (c && c.action) || '';
  const need = () => { if (scene.mode !== 'globe') setMode('globe'); };
  const where = (s) => { const d = globe.describe(s); return d ? `${d.name}: altitude ${fmtNum(d.alt)} km, speed ${d.vel.toFixed(2)} km/s, over ${fmtLat(d.lat)} ${fmtLon(d.lon)}, orbit period ${d.period.toFixed(0)} minutes${d.live ? '' : ' (simulated orbit: live data unavailable)'}.` : ''; };
  switch (a) {
    case 'show_earth': need(); return `Holographic Earth online. ${globe.total} satellites ${globe.live ? 'tracked from live CelesTrak data' : 'shown (simulated: live data unavailable)'}.`;
    case 'show_core': case 'clear': setMode('core'); return 'Back to the core.';
    case 'build': {
      const r = scene.holo.build(c.spec || '');
      if (r.startsWith('Hologram')) { setMode('model'); act('HOLOGRAM · ' + (scene.holo.title || 'MODEL').toUpperCase()); $('#ghint').textContent = 'DRAG TO TURN · SCROLL TO ZOOM · ESC FOR CORE'; }
      return r;
    }
    case 'load_model': {
      setMode('model');
      scene.holo.loadModel(c.url, c.ext, c.name).then((r) => { act('HOLOGRAM · ' + r); toast(r, 4000); });
      return `Loading ${c.name || 'the model'} onto the projector.`;
    }
    case 'explode': case 'assemble': scene.holo.setExplode(a === 'explode'); return a === 'explode' ? 'Exploded view.' : 'Reassembled.';
    case 'reset_view': need(); globe.select(null); globe.view.auto = true; scene.zoomBy(1 / 0.85); return 'View released.';
    case 'focus_place': case 'set_home': {
      need();
      const p = { name: c.name || c.query, lat: +c.lat, lon: +c.lon };
      if (!isFinite(p.lat) || !isFinite(p.lon)) return 'No coordinates for that place.';
      flyTo(p, a === 'set_home' ? 'home' : 'place');
      return `${a === 'set_home' ? 'Home set to' : 'Showing'} ${p.name} (${fmtLat(p.lat)}, ${fmtLon(p.lon)}).`;
    }
    case 'track_satellite': case 'satellite_view': case 'where_is': {
      if (!globe.total) { need(); return 'Satellite data is still loading; try again in a moment.'; }
      const s = globe.find(c.query);
      if (!s) return `No satellite matching "${c.query}" among the ${globe.total} loaded. Try another name or enable more layers.`;
      if (a !== 'where_is' || scene.mode === 'globe') { need(); globe.select(s); }
      if (a === 'satellite_view') globe.satView = true;
      return (a === 'satellite_view' ? 'Riding along with ' : a === 'track_satellite' ? 'Tracking ' : '') + where(s);
    }
    case 'list_satellites': {
      const cnt = globe.counts();
      const groups = Object.entries(GROUPS).map(([k, g]) => `${g.label} ${g.on ? (cnt[k] || 0) : 'off'}`).join(', ');
      const notable = cyclePool().slice(0, 12).map((s) => s.name).join(', ');
      return `Layers: ${groups}. Notable: ${notable || 'none loaded yet'}.`;
    }
    case 'layers': {
      need();
      const want = String(c.layers || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
      const all = want.includes('all'), none = want.includes('none');
      for (const k of Object.keys(GROUPS)) {
        const on = all ? k !== 'starlink' || want.includes('starlink') : none ? false : want.includes(k) || (k === 'brightest' && want.includes('visual'));
        globe.setGroup(k, on);
      }
      layerChips();
      return 'Layers now: ' + Object.entries(GROUPS).filter(([, g]) => g.on).map(([, g]) => g.label).join(', ') + '.';
    }
  }
  return 'Unknown hologram action: ' + a;
};


/* =====================================================================================
   Camera HUD + floating panels moved by hand
   ===================================================================================== */
const vision = createVision({
  call, act, toast, say,
  onHands: (h) => panels.pointer(h),
  hooks: { speaking: () => S.state === 'SPEAKING', stop: () => call('stop'), approvalShown: () => pending != null, approve: (ok) => answer(ok), wake: () => call('wake') },
});
const panels = createPanels({ call, hasBridge: () => !!api(), esc, act, toast, say, vision });
window.HUD.panel = (c) => panels.command(c || {});
window.HUD.vision = function (c) {
  const a = String((c && c.action) || '').toLowerCase(), v = String((c && c.value) || '').toLowerCase();
  if (a === 'open') { if (!vision.open) panels.add({ kind: 'camera', title: 'Optical analysis', x: 0.52, y: 0.1, w: 0.42, h: 0.6, style: v || undefined }); return 'Camera open: tracking face, hands and body. ' + (v ? '' : 'Ask whether they would like the wireframe overlay.'); }
  if (a === 'close') { panels.closeKind('camera'); return 'Camera closed.'; }
  if (a === 'style') return vision.setStyle(v) ? 'Overlay set to ' + v + '.' : 'Use off, minimal, wireframe or full.';
  if (a === 'track') { vision.setTrack(v); return 'Tracking ' + (v || 'all') + '.'; }
  if (a === 'hand_control') { vision.setHandControl(!/off|false|no/.test(v)); return 'Hand control ' + (/off|false|no/.test(v) ? 'off.' : 'on: pinch to grab panels, quick pinch to click, two hands to resize.'); }
  if (a === 'snapshot') return vision.open ? vision.snapshot(false) : 'The camera is closed; open it first.';
  return vision.status();
};
window.HUD.ui = function (c) {
  const open = String((c && c.action) || 'open') !== 'close', t = String((c && c.target) || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (t === 'calendar') { open ? cal.open() : cal.close(); return 'Calendar ' + (open ? 'open.' : 'closed.'); }
  if (t === 'earth' || t === 'globe') { setMode(open ? 'globe' : 'core'); return open ? 'Holographic Earth online.' : 'Back to the core.'; }
  if (t === 'camera' || t === 'vision') return window.HUD.vision({ action: open ? 'open' : 'close' });
  if (t === 'control_centre' || t === 'control_center') { window.__cc && window.__cc.open(open); return 'Control Centre ' + (open ? 'open.' : 'closed.'); }
  if (t === 'settings' || t === 'configuration') { openSettings(open); return 'Configuration ' + (open ? 'open.' : 'closed.'); }
  if (t === 'transcript') { $('#hist').classList.toggle('show', open); return 'Transcript ' + (open ? 'shown.' : 'hidden.'); }
  if (t === 'panels') { $('#panels').style.display = open ? '' : 'none'; return 'Panels ' + (open ? 'shown.' : 'hidden.'); }
  if (t === 'core') { setMode('core'); cal.close(); return 'Back to the core.'; }
  return 'Unknown HUD part: ' + t;
};

/* keyboard focus rings only for keyboard users (never on click) */
window.addEventListener('keydown', (e) => { if (e.key === 'Tab') document.body.classList.add('kbnav'); }, true);
window.addEventListener('pointerdown', () => document.body.classList.remove('kbnav'), true);

start();
setTimeout(() => panels.restore(), 3200);

window.__hud = { call, esc, put, S };
