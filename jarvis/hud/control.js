/* JARVIS-2 Control Centre: jobs, skill folder, access levels, settings and themes. */
const { call, esc, put, S } = window.__hud;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const css = `
#cc{position:fixed;top:0;right:0;bottom:0;width:min(780px,97vw);z-index:32;display:flex;flex-direction:column;padding:62px 0 0;transform:translateX(104%);transition:transform .55s cubic-bezier(.2,.8,.2,1);
  background:linear-gradient(270deg,rgba(3,13,23,.95),rgba(4,16,28,.86));backdrop-filter:blur(26px) saturate(1.5);box-shadow:-30px 0 90px rgba(0,0,0,.65)}
#cc.open{transform:none}
#cc .hd{display:flex;align-items:center;gap:6px;padding:0 30px 0 34px;border-bottom:1px solid rgba(var(--accent-rgb),.18)}
#cc .hd h2{font-weight:300;font-size:12px;letter-spacing:.5em;color:var(--accent);margin-right:auto;text-shadow:0 0 12px rgba(var(--accent-rgb),.6)}
#cc .tab{background:none;border:0;color:var(--dim);font:400 10.5px var(--ui);letter-spacing:.28em;padding:14px 12px;cursor:pointer;border-bottom:2px solid transparent;transition:.2s}
#cc .tab:hover{color:var(--txt)}#cc .tab.on{color:var(--accent);border-bottom-color:var(--accent);text-shadow:0 0 10px rgba(var(--accent-rgb),.6)}
#cc .tab i{font-style:normal;margin-left:6px;color:var(--gold)}
#cc .body{flex:1;min-height:0;overflow:auto;padding:22px 34px 34px}
#cc .pane{display:none}#cc .pane.on{display:block;animation:fade .3s}
#cc h4{font-weight:400;font-size:9.5px;letter-spacing:.32em;text-transform:uppercase;color:var(--dim);margin:24px 0 10px}
#cc h4:first-child{margin-top:0}
#cc p.note{font-size:11.5px;line-height:1.65;color:var(--dim);margin:6px 0 4px}
#cc input[type=text],#cc input[type=password],#cc textarea,#cc select{width:100%;background:rgba(255,255,255,.045);border:0;border-bottom:1px solid rgba(var(--accent-rgb),.35);color:#fff;font:300 13px var(--ui);padding:9px 10px;outline:0;user-select:text;-webkit-user-select:text}
#cc textarea{font:12px/1.55 var(--mono);min-height:300px;resize:vertical;border:1px solid rgba(var(--accent-rgb),.25)}
#cc input:focus,#cc textarea:focus{background:rgba(var(--accent-rgb),.08);border-color:var(--accent)}
#cc input[type=range]{width:100%;accent-color:var(--accent)}
#cc .rowf{display:flex;gap:10px;align-items:center}
#cc .btn{padding:10px 18px;font-size:10px}
#cc .btn.sm{padding:6px 12px;font-size:9px}
.job{display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:12px 14px;margin-bottom:8px;background:rgba(var(--accent-rgb),.05);border-left:2px solid var(--dim);cursor:pointer}
.job:hover{background:rgba(var(--accent-rgb),.1)}
.job.running{border-color:var(--gold)}.job.done{border-color:var(--accent)}.job.failed{border-color:var(--red)}.job.cancelled{border-color:var(--dim)}
.job b{font:400 12px var(--mono);color:var(--accent)}.job .t{font-size:13px;color:#fff;font-weight:300;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.job small{display:block;font-size:10.5px;color:var(--dim);margin-top:3px;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.job .s{font:400 9.5px var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--dim);text-align:right}
.job.running .s{color:var(--gold)}.job.failed .s{color:var(--red)}
#cc pre.log{font:11px/1.55 var(--mono);color:var(--txt);background:rgba(0,0,0,.35);padding:12px 14px;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;margin:4px 0 10px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.stat{padding:12px 14px;background:rgba(var(--accent-rgb),.06)}.stat b{display:block;font:300 24px var(--ui);color:#fff}.stat span{font-size:9px;letter-spacing:.26em;color:var(--dim);text-transform:uppercase}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}
.chip{border:0;cursor:pointer;background:rgba(255,255,255,.05);color:var(--dim);font:400 10px var(--ui);letter-spacing:.18em;padding:7px 12px;border-radius:99px;text-transform:uppercase;transition:.2s}
.chip:hover{color:var(--txt)}.chip.on{background:rgba(var(--accent-rgb),.2);color:var(--accent)}
.sk{display:flex;align-items:center;gap:12px;padding:9px 12px;cursor:pointer;font-size:13px;font-weight:300;color:var(--txt);border-bottom:1px solid rgba(255,255,255,.04)}
.sk:hover{background:rgba(var(--accent-rgb),.08)}.sk em{font:normal 400 9px var(--mono);letter-spacing:.18em;padding:3px 7px;border-radius:3px;background:rgba(255,255,255,.07);color:var(--dim);text-transform:uppercase;flex:none}
.sk em.recipe{color:var(--accent);background:rgba(var(--accent-rgb),.14)}.sk em.lesson{color:var(--gold);background:rgba(255,179,71,.12)}
.sk span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sk small{color:var(--dim);font-size:10.5px;flex:none}
.lv{margin-bottom:14px}.lv .nm{font-size:13px;color:#fff;font-weight:300}.lv .ds{font-size:11px;color:var(--dim);margin:2px 0 8px;line-height:1.5}
.seg{display:flex;gap:2px}.seg button{flex:1;border:0;cursor:pointer;padding:9px 6px;font:400 9.5px var(--ui);letter-spacing:.2em;text-transform:uppercase;background:rgba(255,255,255,.05);color:var(--dim);transition:.2s}
.seg button:hover{color:var(--txt)}.seg button.on{background:rgba(var(--accent-rgb),.22);color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent)}
.seg button.on.warn{background:rgba(255,179,71,.18);color:var(--gold);box-shadow:inset 0 -2px 0 var(--gold)}.seg button.on.bad{background:rgba(255,90,110,.18);color:var(--red);box-shadow:inset 0 -2px 0 var(--red)}
#cc .sw{margin-top:14px}
.themes{display:flex;gap:10px;margin-top:6px}.th{width:34px;height:34px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:.2s}.th:hover{transform:scale(1.1)}.th.on{border-color:#fff;box-shadow:0 0 18px currentColor}
#jobchip{position:fixed;left:34px;top:66px;z-index:6;display:none;align-items:center;gap:9px;padding:6px 14px;border-radius:99px;font:400 10px var(--ui);letter-spacing:.22em;color:var(--gold);background:rgba(255,179,71,.09);cursor:pointer}
#jobchip.show{display:flex;animation:fade .3s}#jobchip i{width:7px;height:7px;border-radius:50%;background:var(--gold);box-shadow:0 0 10px var(--gold);animation:pulse 1.4s infinite}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

const PERMS = [
  ['files', 'Files', 'Create, copy, move, delete, zip. Deletes always go to a recoverable trash.'],
  ['processes', 'Programs', 'End running programs and close windows.'],
  ['scripts', 'Scripts and commands', 'Run scripts, commands and install packages.'],
  ['admin', 'Administrator rights', 'Scripts that ask Windows for elevation (you also see the Windows prompt).'],
  ['network', 'Network', 'Downloads and API calls to Discord, Roblox and other services.'],
];
const LEVELS = [['off', 'Off', 'bad'], ['risky', 'Ask if risky', ''], ['always', 'Ask always', 'warn'], ['allow', 'Allow', '']];
const THEME_COLORS = { cyan: '#55dcff', violet: '#a98bff', emerald: '#4de3a0', amber: '#ffb347', crimson: '#ff5a7a', mono: '#cfd8e0' };
const TOGGLES = [
  ['research_on', 'Research before acting', 'Roblox, Discord, Blender and Google scripts are refused until he has read the docs.'],
  ['learn_on', 'Learn from use', 'Verified scripts become recipes and failures become lessons in the skill folder.'],
  ['offline_mode', 'Offline mode', 'Blocks web search, research, downloads, email and API calls. (The live voice conversation itself still uses Google.)'],
  ['habits_on', 'Learn my habits', 'Log which tools and apps you ask for, locally, to suggest things at the right time.'],
  ['dry_run', 'Dry run', 'Scripts are written and shown but never executed.'],
  ['announce_jobs', 'Speak when background jobs finish', 'He tells you out loud when a job is done.'],
];

const root = document.createElement('aside');
root.id = 'cc';
root.innerHTML = `
<div class="hd"><h2>CONTROL CENTRE</h2>
  <button class="tab on" data-p="jobs">JOBS<i id="t-jobs"></i></button><button class="tab" data-p="skills">SKILLS</button>
  <button class="tab" data-p="me">PERSONAL</button><button class="tab" data-p="access">ACCESS</button><button class="tab" data-p="set">SETTINGS</button>
  <button class="ib" id="cc-x" title="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
<div class="body">
  <section class="pane on" id="p-jobs">
    <h4>Give him a goal to work on in the background</h4>
    <div class="rowf"><input type="text" id="goal" placeholder="e.g. Make a Blender scene with a red cube and render it to my Desktop as cube.png"><button class="btn go" id="goal-go">Run</button></div>
    <p class="note" id="goal-msg">He researches, writes scripts, verifies the result and reports back while you carry on.</p>
    <h4>Jobs</h4><div id="joblist"></div><div id="jobdetail"></div>
  </section>
  <section class="pane" id="p-skills">
    <div class="stats" id="sk-stats"></div>
    <div class="chips" id="sk-chips"></div>
    <div id="sk-list"></div>
    <div id="sk-edit" style="display:none">
      <h4 id="sk-title"></h4><textarea id="sk-body" spellcheck="false"></textarea>
      <div class="rowf" style="margin-top:12px"><button class="btn go" id="sk-save">Save</button><button class="btn no" id="sk-del">Delete</button><button class="btn" id="sk-back">Back</button></div>
    </div>
    <div class="rowf" style="margin-top:18px" id="sk-foot"><button class="btn" id="sk-new">New skill</button><button class="btn" id="sk-open">Open folder</button></div>
    <p class="note">Skills are plain text files. Recipes are scripts that worked; lessons are mistakes he will not repeat. Edit or delete anything: deleted skills go to a trash folder inside the skill folder.</p>
  </section>
  <section class="pane" id="p-me"><div id="me-body"></div>
    <p class="note">Everything here is stored only on this PC in the personal folder. He learns habits from what you ask HIM to do (tool and app names, never message text). Turn that off in Settings.</p>
    <div class="rowf" style="margin-top:14px"><button class="btn" data-f="personal">Open personal folder</button></div></section>
  <section class="pane" id="p-access"><h4>What he may do on his own</h4><div id="perms"></div>
    <p class="note"><b>Ask if risky</b> only asks for deletes, overwrites, installs, power actions and similar. <b>Ask always</b> asks every time. Actions that could wreck the system always ask, even in auto-authorise mode. The master switch “Ask before risky actions” in Configuration still applies.</p></section>
  <section class="pane" id="p-set"><div id="toggles"></div>
    <h4>Limits</h4><div class="lv"><div class="nm">Background jobs at once: <span id="v-jobs"></span></div><input type="range" id="s-maxjobs" min="1" max="8" step="1"></div>
    <div class="lv"><div class="nm">Research time limit: <span id="v-rs"></span> s</div><input type="range" id="s-rs" min="8" max="90" step="2"></div>
    <h4>Theme</h4><div class="themes" id="themes"></div>
    <h4>Models and programs</h4>
    <div class="lv"><div class="nm">Background worker model</div><div class="ds">Leave empty for the default (gemini-2.5-flash).</div><input type="text" id="s-wm"></div>
    <div class="lv"><div class="nm">Blender location</div><div class="ds">Leave empty to find it automatically.</div><input type="text" id="s-bl" placeholder="C:\\Program Files\\Blender Foundation\\Blender 4.x\\blender.exe"></div>
    <h4>Integrations</h4><p class="note">Stored only on this computer and sent only to the matching service.</p>
    <div class="lv"><div class="nm">Discord bot token</div><input type="password" id="s-dt"></div>
    <div class="lv"><div class="nm">Discord webhook URL</div><input type="password" id="s-dw"></div>
    <div class="lv"><div class="nm">Roblox Open Cloud key</div><input type="password" id="s-rk"></div>
    <h4>Email (read-only)</h4><p class="note">For inbox checks and drafts. Use an app password, never your main password.</p>
    <div class="lv"><div class="nm">IMAP server</div><input type="text" id="s-ih" placeholder="imap.gmail.com"></div>
    <div class="lv"><div class="nm">Email address</div><input type="text" id="s-iu"></div>
    <div class="lv"><div class="nm">App password</div><input type="password" id="s-ip"></div>
    <h4>Folders</h4><div class="rowf"><button class="btn" data-f="scripts">Scripts</button><button class="btn" data-f="jobs">Job logs</button><button class="btn" data-f="skills">Skills</button><button class="btn" data-f="trash">Trash</button></div>
  </section>
</div>`;
document.body.appendChild(root);

// button in the command bar + running-jobs chip
const bar = $('#bar'), setBtn = $('#b-set');
const ccb = document.createElement('button');
ccb.className = 'ib'; ccb.id = 'b-cc'; ccb.title = 'Control Centre';
ccb.innerHTML = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
bar.insertBefore(ccb, setBtn);
const chip = document.createElement('div'); chip.id = 'jobchip'; document.body.appendChild(chip);

let tab = 'jobs', ov = null, jobs = [], dom = 'all', cur = null, openJob = null;
const settings = () => S.settings || {};

window.__cc = { open: (on, p) => open(on, p), get isOpen() { return root.classList.contains('open'); } };
function open(on, p) {
  root.classList.toggle('open', on); ccb.classList.toggle('on', on);
  if (on) { $('#settings').classList.remove('open'); show(p || tab); refresh(); }
}
function show(p) {
  tab = p;
  $$('#cc .tab').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
  $$('#cc .pane').forEach((s) => s.classList.toggle('on', s.id === 'p-' + p));
  if (p === 'me') renderMe(); if (p === 'set') renderSettings(); if (p === 'access') renderPerms(); if (p === 'skills') skillsList();
}
ccb.onclick = () => open(!root.classList.contains('open'));
$('#cc-x').onclick = () => open(false);
chip.onclick = () => open(true, 'jobs');
$$('#cc .tab').forEach((b) => (b.onclick = () => show(b.dataset.p)));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('open') && !(/^(text|password)$/.test(document.activeElement.type || '') || document.activeElement.tagName === 'TEXTAREA')) { open(false); e.stopPropagation(); } }, true);

async function refresh() { ov = await call('overview'); if (ov) { jobs = ov.jobs; renderJobs(); if (tab === 'skills') skillsList(); if (tab === 'me') renderMe(); } }

/* ---------- jobs ---------- */
function renderJobs() {
  const run = jobs.filter((j) => j.status === 'running').length;
  $('#t-jobs').textContent = run ? run : '';
  chip.classList.toggle('show', run > 0);
  chip.innerHTML = `<i></i>${run} JOB${run > 1 ? 'S' : ''} RUNNING`;
  $('#joblist').innerHTML = jobs.length ? jobs.map((j) => `<div class="job ${j.status}" data-id="${esc(j.id)}"><b>${esc(j.id)}</b>
    <div><div class="t">${esc(j.label)}</div><small>${esc(j.progress || j.kind)} · ${j.secs}s</small></div>
    <div class="s">${esc(j.status)}${j.status === 'running' ? ' <button class="btn sm no" data-x="' + esc(j.id) + '">Stop</button>' : ''}</div></div>`).join('')
    : '<p class="note">No jobs yet. Ask him to do something “in the background”, or type a goal above.</p>';
  if (openJob) detail(openJob, true);
}
async function detail(id, quiet) {
  openJob = id;
  const t = await call('job_info', id);
  $('#jobdetail').innerHTML = `<h4>${esc(id)}</h4><pre class="log">${esc(t || '')}</pre>`;
}
$('#joblist').addEventListener('click', (e) => {
  const x = e.target.closest('[data-x]');
  if (x) { call('job_cancel', x.dataset.x); e.stopPropagation(); return; }
  const j = e.target.closest('.job'); if (j) detail(j.dataset.id);
});
$('#goal-go').onclick = async () => {
  const g = $('#goal').value.trim(); if (!g) return;
  $('#goal-msg').textContent = (await call('run_goal', g, true)) || 'Could not start.';
  $('#goal').value = ''; setTimeout(refresh, 400);
};
$('#goal').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#goal-go').click(); e.stopPropagation(); });

/* ---------- skills ---------- */
function skillsList() {
  if (!ov) return;
  const s = ov.stats, tree = ov.tree;
  $('#sk-stats').innerHTML = [[s.total, 'skills'], [s.learned, 'learned'], [s.runs, 'script runs'], [s.rate == null ? '–' : s.rate + '%', 'success']]
    .map(([a, b]) => `<div class="stat"><b>${a}</b><span>${b}</span></div>`).join('');
  const doms = Object.keys(tree);
  $('#sk-chips').innerHTML = ['all', ...doms].map((d) => `<button class="chip ${d === dom ? 'on' : ''}" data-d="${esc(d)}">${esc(d)}${d !== 'all' ? ' ' + tree[d].length : ''}</button>`).join('');
  const rows = [];
  for (const d of doms) if (dom === 'all' || dom === d) for (const k of tree[d]) rows.push([d, k]);
  $('#sk-list').innerHTML = rows.map(([d, k]) => `<div class="sk" data-d="${esc(d)}" data-s="${esc(k.slug)}"><em class="${k.kind}">${esc(k.kind)}</em><span>${esc(k.title)}</span><small>${k.kind === 'recipe' ? '✓ ' + k.ok : esc(d)}</small></div>`).join('') || '<p class="note">Nothing here yet.</p>';
  $('#sk-list').style.display = ''; $('#sk-chips').style.display = ''; $('#sk-stats').style.display = ''; $('#sk-foot').style.display = ''; $('#sk-edit').style.display = 'none';
}
$('#sk-chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { dom = c.dataset.d; skillsList(); } });
$('#sk-list').addEventListener('click', async (e) => {
  const r = e.target.closest('.sk'); if (!r) return;
  const it = await call('skill_read', r.dataset.d, r.dataset.s); if (!it) return;
  cur = { domain: it.domain, slug: it.slug, kind: (it.meta || {}).kind || 'knowledge', title: it.title };
  $('#sk-title').textContent = it.domain + ' / ' + it.title; $('#sk-body').value = it.body.trim();
  ['#sk-list', '#sk-chips', '#sk-stats', '#sk-foot'].forEach((q) => ($(q).style.display = 'none')); $('#sk-edit').style.display = ''; $('#sk-del').style.display = '';
});
$('#sk-back').onclick = () => { cur = null; skillsList(); };
$('#sk-save').onclick = async () => {
  if (!cur) return;
  await call('skill_save', cur.domain, cur.title, $('#sk-body').value, cur.kind);
  await refresh(); cur = null; skillsList();
};
$('#sk-del').onclick = async () => { if (cur && confirm('Delete this skill? It goes to the trash folder.')) { await call('skill_delete', cur.domain, cur.slug); await refresh(); cur = null; skillsList(); } };
$('#sk-new').onclick = () => {
  const title = prompt('Title of the new skill (for example "Blender: bake a texture")'); if (!title) return;
  const d = dom !== 'all' ? dom : (prompt('Domain: roblox-studio, roblox, discord, blender, google, windows or general', 'general') || 'general');
  cur = { domain: d, slug: '', kind: 'knowledge', title };
  $('#sk-title').textContent = d + ' / ' + title; $('#sk-body').value = '';
  ['#sk-list', '#sk-chips', '#sk-stats', '#sk-foot'].forEach((q) => ($(q).style.display = 'none')); $('#sk-edit').style.display = ''; $('#sk-del').style.display = 'none';
};
$('#sk-open').onclick = () => call('open_folder', 'skills');

/* ---------- personal ---------- */
function renderMe() {
  const p = ov && ov.plus; if (!p) { $('#me-body').innerHTML = '<p class="note">Loading…</p>'; return; }
  const ev = p.events.map((e) => `<div class="sk"><em>${esc(e.id)}</em><span>${esc(e.title)}</span><small>${esc(e.start)}</small></div>`).join('') || '<p class="note">Nothing scheduled. Ask him to add something.</p>';
  const wf = Object.entries(p.workflows).map(([k, n]) => `<div class="sk"><em class="recipe">routine</em><span>${esc(k)}</span><small>${n} steps</small></div>`).join('') || '<p class="note">No routines yet. Say “learn this routine” and then carry it out through him.</p>';
  const cm = p.commands.map((c) => `<div class="sk"><em class="lesson">phrase</em><span>${esc(c)}</span></div>`).join('') || '<p class="note">No custom phrases yet.</p>';
  const top = p.top.map(([t, n]) => `<div class="sk"><span>${esc(t.replace(/_/g, ' '))}</span><small>${n}×</small></div>`).join('') || '<p class="note">Nothing learned yet.</p>';
  $('#me-body').innerHTML = `<div class="stats" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><b>${p.events.length}</b><span>upcoming</span></div><div class="stat"><b>${Object.keys(p.workflows).length}</b><span>routines</span></div><div class="stat"><b>${p.facts}</b><span>remembered</span></div></div>
    <h4>Upcoming</h4>${ev}<h4>Routines</h4>${wf}<h4>Your phrases</h4>${cm}<h4>What you ask for most</h4>${top}`;
}

/* ---------- access ---------- */
function renderPerms() {
  const s = settings();
  $('#perms').innerHTML = PERMS.map(([k, n, d]) => `<div class="lv"><div class="nm">${n}</div><div class="ds">${d}</div>
    <div class="seg" data-k="perm_${k}">${LEVELS.map(([v, l, c]) => `<button data-v="${v}" class="${s['perm_' + k] === v ? 'on ' + c : ''}">${l}</button>`).join('')}</div></div>`).join('');
}
$('#perms').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const seg = b.parentElement; put(seg.dataset.k, b.dataset.v); renderPerms();
});

/* ---------- settings ---------- */
function renderSettings() {
  const s = settings();
  $('#toggles').innerHTML = TOGGLES.map(([k, n, d]) => `<div class="sw"><div>${n}<small>${d}</small></div><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></div>`).join('');
  $('#s-maxjobs').value = s.max_jobs || 3; $('#v-jobs').textContent = s.max_jobs || 3;
  $('#s-rs').value = s.research_budget || 26; $('#v-rs').textContent = s.research_budget || 26;
  $('#s-wm').value = s.worker_model || ''; $('#s-bl').value = s.blender_path || '';
  $('#s-ih').value = s.imap_host || ''; $('#s-iu').value = s.imap_user || ''; $('#s-ip').value = s.imap_pass || '';
  $('#s-dt').value = s.discord_token || ''; $('#s-dw').value = s.discord_webhook || ''; $('#s-rk').value = s.roblox_key || '';
  $('#themes').innerHTML = Object.entries(THEME_COLORS).map(([n, c]) => `<div class="th ${s.theme === n || (!s.theme && n === 'cyan') ? 'on' : ''}" data-t="${n}" title="${n}" style="background:${c};color:${c}"></div>`).join('');
}
$('#toggles').addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) put(k, e.target.checked); });
$('#s-maxjobs').addEventListener('input', (e) => { $('#v-jobs').textContent = e.target.value; put('max_jobs', +e.target.value); });
$('#s-rs').addEventListener('input', (e) => { $('#v-rs').textContent = e.target.value; put('research_budget', +e.target.value); });
[['#s-ih', 'imap_host'], ['#s-iu', 'imap_user'], ['#s-ip', 'imap_pass'], ['#s-wm', 'worker_model'], ['#s-bl', 'blender_path'], ['#s-dt', 'discord_token'], ['#s-dw', 'discord_webhook'], ['#s-rk', 'roblox_key']]
  .forEach(([q, k]) => { $(q).addEventListener('change', (e) => put(k, e.target.value.trim())); $(q).addEventListener('keydown', (e) => e.stopPropagation()); });
$('#themes').addEventListener('click', (e) => { const t = e.target.closest('.th'); if (!t) return; put('theme', t.dataset.t); window.__setTheme(t.dataset.t); renderSettings(); });
$('#p-set').addEventListener('click', (e) => { const f = e.target.closest('[data-f]'); if (f) call('open_folder', f.dataset.f); });

$('#sk-body').addEventListener('keydown', (e) => e.stopPropagation());

/* ---------- live events ---------- */
const prev = window.HUD.on;
window.HUD.on = (ev) => {
  if (ev.t === 'jobs') { jobs = ev.jobs; renderJobs(); return; }
  prev(ev);
};
setInterval(() => { if (root.classList.contains('open') && tab === 'jobs') refresh(); }, 4000);
setTimeout(refresh, 3000);
