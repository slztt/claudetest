/* JARVIS-3 optical analysis: the camera panel. Tracks faces (478-point mesh, expressions, head pose), both hands
   (21 joints each, gestures) and the body (33-point pose) in real time with MediaPipe, on this PC (nothing is uploaded).
   Overlays: off | minimal (brackets and labels) | wireframe (mesh and skeletons) | full (everything plus readouts).
   Hands drive the HUD: the index fingertip is a cursor, a pinch grabs and moves panels, a quick pinch clicks, two pinching
   hands resize. Gesture commands: open palm (hold) = stop talking, thumbs up / down (hold) = authorise / deny a card,
   pointing up (hold) = listen, victory = snapshot. */
import { FilesetResolver, FaceLandmarker, GestureRecognizer, PoseLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

const MODELS = {
  face: ['face_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
  hands: ['gesture_recognizer.task', 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'],
  pose: ['pose_landmarker_lite.task', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'],
};
const GESTURE_NAME = { Open_Palm: 'OPEN PALM', Closed_Fist: 'FIST', Pointing_Up: 'POINTING UP', Thumb_Up: 'THUMBS UP', Thumb_Down: 'THUMBS DOWN', Victory: 'VICTORY', ILoveYou: 'ROCK ON', None: '' };

const CSS = `
.vis{position:absolute;inset:0;background:#000;overflow:hidden}
.wp .wb .vis video,.vis video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);filter:saturate(.75) contrast(1.05) brightness(.9)}
.vis.tint video{filter:grayscale(.6) sepia(.25) hue-rotate(160deg) saturate(1.6) brightness(.75) contrast(1.15)}
.vis canvas{position:absolute;inset:0;width:100%;height:100%}
.vis .vbar{position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:5px;flex-wrap:wrap;z-index:2}
.vis .vbar button{border:0;cursor:pointer;background:rgba(2,10,18,.6);color:var(--dim);font:400 9px var(--ui);letter-spacing:.18em;text-transform:uppercase;padding:6px 10px;border-radius:99px;backdrop-filter:blur(6px)}
.vis .vbar button.on{color:#fff;background:rgba(var(--accent-rgb),.35)}
.vis .vbar span{margin-left:auto;font:400 9.5px var(--mono);color:var(--accent);letter-spacing:.14em;align-self:center;text-shadow:0 0 6px #000}
.vis .vmsg{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:var(--txt);font-size:12.5px;padding:24px;z-index:1;line-height:1.6}
`;

export function createVision({ call, act, toast, say, onHands, hooks }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  let fileset = null, face = null, hands = null, pose = null, loading = null;
  const S = {
    on: false, track: { face: true, hands: true, body: true }, style: 'wireframe', handControl: true, gestures: true,
    video: null, canvas: null, root: null, stream: null, mjpeg: null, raf: 0, fps: 0, frames: 0, fpsT: 0,
    res: { face: null, hands: null, pose: null }, summary: 'Camera closed.', hold: { name: '', t: 0, fired: false }, pinch: [false, false],
    smooth: [null, null],
  };
  try { const s = JSON.parse(localStorage.getItem('jv-vision') || '{}'); Object.assign(S.track, s.track || {}); if (s.style) S.style = s.style; if (s.handControl != null) S.handControl = s.handControl; } catch (e) { /* ignore */ }
  const persist = () => { try { localStorage.setItem('jv-vision', JSON.stringify({ track: S.track, style: S.style, handControl: S.handControl })); } catch (e) { /* ignore */ } };

  async function model(kind) {
    const [file, remote] = MODELS[kind];
    try { const r = await fetch('mlmodel/' + file, { method: 'HEAD' }); if (r.ok) return 'mlmodel/' + file; } catch (e) { /* not served */ }
    return remote;
  }
  async function load(msg) {
    if (loading) return loading;
    loading = (async () => {
      msg('Loading the vision engine…');
      fileset = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', import.meta.url).href);
      const make = async (Cls, kind, opts, order = ['GPU', 'CPU']) => {
        for (const delegate of order) {
          try { return await Cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: await model(kind), delegate }, runningMode: 'VIDEO', ...opts }); } catch (e) { if (delegate === 'CPU') throw e; }
        }
      };
      msg('Loading face tracking…');
      face = await make(FaceLandmarker, 'face', { numFaces: 2, outputFaceBlendshapes: true });
      msg('Loading hand tracking…');
      hands = await make(GestureRecognizer, 'hands', { numHands: 2 });
      msg('Loading body tracking…');
      pose = await make(PoseLandmarker, 'pose', { numPoses: 1 });
    })();
    return loading;
  }

  async function startCamera(msg) {
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      S.video.srcObject = S.stream; await S.video.play();
      return true;
    } catch (e) {
      // the window's web engine refused the camera: fall back to JARVIS streaming it from Python
      msg('Opening the camera through JARVIS…');
      const ok = await call('camera_stream', true);
      if (!ok) { msg('Could not open the camera (' + (e && e.message || e) + '). Check that no other app is using it and that Windows camera privacy allows desktop apps.'); return false; }
      S.mjpeg = new Image(); S.mjpeg.crossOrigin = 'anonymous'; S.mjpeg.src = 'camera.mjpg?' + Date.now();
      S.video.style.display = 'none';
      S.mjpeg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
      S.root.insertBefore(S.mjpeg, S.canvas);
      await new Promise((r) => { S.mjpeg.onload = r; setTimeout(r, 4000); });
      return true;
    }
  }
  const source = () => S.mjpeg || S.video;
  const srcSize = () => S.mjpeg ? [S.mjpeg.naturalWidth || 640, S.mjpeg.naturalHeight || 480] : [S.video.videoWidth || 640, S.video.videoHeight || 480];

  /* ---------- the panel ---------- */
  function mount(body, spec = {}) {
    if (spec.style) S.style = spec.style;
    if (spec.track) for (const k of Object.keys(S.track)) S.track[k] = String(spec.track).includes(k) || spec.track === 'all';
    body.innerHTML = `<div class="vis tint"><video playsinline muted></video><canvas></canvas><div class="vmsg">Starting the camera…</div>
      <div class="vbar"><button data-t="face">Face</button><button data-t="hands">Hands</button><button data-t="body">Body</button>
      <button data-s>Wireframe</button><button data-h>Hand control</button><button data-shot>Snapshot</button><span data-fps></span></div></div>`;
    S.root = body.firstChild; S.video = S.root.querySelector('video'); S.canvas = S.root.querySelector('canvas');
    const msgEl = S.root.querySelector('.vmsg'), msg = (t) => { msgEl.style.display = t ? 'grid' : 'none'; msgEl.textContent = t || ''; };
    const syncBar = () => {
      S.root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', !!S.track[b.dataset.t]));
      const sb = S.root.querySelector('[data-s]'); sb.textContent = 'Overlay: ' + S.style; sb.classList.toggle('on', S.style !== 'off');
      S.root.querySelector('[data-h]').classList.toggle('on', S.handControl);
    };
    S.root.querySelector('.vbar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.t) S.track[b.dataset.t] = !S.track[b.dataset.t];
      if (b.dataset.s != null) S.style = { off: 'minimal', minimal: 'wireframe', wireframe: 'full', full: 'off' }[S.style] || 'wireframe';
      if (b.dataset.h != null) S.handControl = !S.handControl;
      if (b.dataset.shot != null) snapshot(true);
      syncBar(); persist();
    });
    syncBar();
    S.on = true;
    (async () => {
      try {
        if (!(await startCamera(msg))) return;
        await load(msg);
        msg('');
        act('OPTICS · TRACKING ONLINE');
        loop();
      } catch (e) { msg('Vision engine failed: ' + (e && e.message || e)); }
    })();
    return { destroy: stop, command(c) { if (c.op === 'style') { S.style = c.value; syncBar(); persist(); } } };
  }
  function stop() {
    S.on = false; cancelAnimationFrame(S.raf);
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    if (S.mjpeg) { S.mjpeg.src = ''; call('camera_stream', false); }
    S.stream = S.mjpeg = null; S.res = { face: null, hands: null, pose: null }; S.summary = 'Camera closed.';
    onHands([]);
    act('OPTICS · OFFLINE');
  }

  /* ---------- tracking loop ---------- */
  let lastTs = 0, n = 0;
  function loop() {
    if (!S.on) return;
    S.raf = requestAnimationFrame(loop);
    const src = source(); const [w, h] = srcSize();
    if (!w || (S.video && !S.mjpeg && S.video.readyState < 2)) return;
    let ts = performance.now(); if (ts <= lastTs) ts = lastTs + 1; lastTs = ts;
    n++;
    try {
      if (S.track.hands || S.handControl) S.res.hands = hands.recognizeForVideo(src, ts);
      if (S.track.face && n % 2 === 0) S.res.face = face.detectForVideo(src, ts);
      if (S.track.body && n % 3 === 0) S.res.pose = pose.detectForVideo(src, ts);
      if (!S.track.face) S.res.face = null;
      if (!S.track.body) S.res.pose = null;
    } catch (e) { /* a dropped frame */ }
    S.frames++;
    if (S.stream && ts - (S.lastSent || 0) > 1000 && hooks.active()) {   // live view: Gemini sees the camera about once a second
      S.lastSent = ts;
      const url = snapshot(false);
      if (url) call('vision_frame', url.split(',')[1]);
    }
    if (ts - S.fpsT > 1000) { S.fps = Math.round(S.frames * 1000 / (ts - S.fpsT)); S.frames = 0; S.fpsT = ts; const f = S.root && S.root.querySelector('[data-fps]'); if (f) f.textContent = `${S.fps} FPS · ${w}x${h}`; }
    draw(w, h);
    handControl();
    gestureCommands();
  }

  /* ---------- drawing ---------- */
  function mapper(w, h) {
    // object-fit: cover + mirror, from normalised camera coords to canvas pixels
    const cw = S.canvas.clientWidth, ch = S.canvas.clientHeight, k = Math.max(cw / w, ch / h), ox = (cw - w * k) / 2, oy = (ch - h * k) / 2;
    return (p) => [cw - (ox + p.x * w * k), oy + p.y * h * k];
  }
  function draw(w, h) {
    const cv = S.canvas, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(cv.clientWidth * dpr)) { cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
    const M = mapper(w, h), style = S.style, acc = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '85,220,255';
    const line = (pts, pairs, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); for (const { start, end } of pairs) { const a = M(pts[start]), b = M(pts[end]); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } c.stroke(); };
    const dots = (pts, idx, r, col) => { c.fillStyle = col; for (const i of idx) { const [x, y] = M(pts[i]); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } };
    const brackets = (pts, label, sub, col) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of pts) { const [x, y] = M(p); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const pd = 10, L = Math.min(24, (x1 - x0) / 4); x0 -= pd; y0 -= pd; x1 += pd; y1 += pd;
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
      for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { c.moveTo(x + dx * L, y); c.lineTo(x, y); c.lineTo(x, y + dy * L); }
      c.stroke();
      c.font = '600 11px Bahnschrift, Segoe UI, sans-serif'; c.fillStyle = col; c.fillText(label, x0, y0 - 18);
      if (sub) { c.font = '10px Consolas, monospace'; c.fillStyle = 'rgba(217,241,255,.85)'; c.fillText(sub, x0, y0 - 5); }
      return [x0, y0, x1, y1];
    };
    if (style === 'off') { S.summary = summarise(); return; }
    // face
    const F = S.res.face;
    (F && F.faceLandmarks || []).forEach((pts, i) => {
      if (style === 'wireframe' || style === 'full') {
        line(pts, FaceLandmarker.FACE_LANDMARKS_TESSELATION, `rgba(${acc},.22)`, 0.6);
        line(pts, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, `rgba(${acc},.9)`, 1.4);
        for (const k of ['FACE_LANDMARKS_LEFT_EYE', 'FACE_LANDMARKS_RIGHT_EYE', 'FACE_LANDMARKS_LIPS', 'FACE_LANDMARKS_LEFT_EYEBROW', 'FACE_LANDMARKS_RIGHT_EYEBROW']) line(pts, FaceLandmarker[k], `rgba(${acc},.95)`, 1.2);
        for (const k of ['FACE_LANDMARKS_LEFT_IRIS', 'FACE_LANDMARKS_RIGHT_IRIS']) line(pts, FaceLandmarker[k], 'rgba(255,255,255,.95)', 1.4);
      }
      const pose3 = headPose(pts), ex = expression(F.faceBlendshapes && F.faceBlendshapes[i]);
      brackets(pts, `SUBJECT ${String(i + 1).padStart(2, '0')} · FACE LOCK`, `YAW ${pose3.yaw}°  PITCH ${pose3.pitch}°  ROLL ${pose3.roll}°${ex ? '  · ' + ex.toUpperCase() : ''}`, `rgb(${acc})`);
      if (style === 'full') { dots(pts, [1, 33, 263, 61, 291, 199], 2.5, '#fff'); }
    });
    // hands
    const Hh = S.res.hands;
    (Hh && Hh.landmarks || []).forEach((pts, i) => {
      const side = ((Hh.handedness[i] || [])[0] || {}).categoryName === 'Left' ? 'RIGHT' : 'LEFT';   // mirrored view
      const g = ((Hh.gestures[i] || [])[0]) || {};
      const col = S.pinch[i] ? '255,179,71' : acc;
      if (style !== 'minimal') {
        line(pts, GestureRecognizer.HAND_CONNECTIONS, `rgba(${col},.95)`, 2);
        dots(pts, [...Array(21).keys()], 3, `rgba(${col},1)`);
        dots(pts, [4, 8, 12, 16, 20], 4.5, '#fff');
      }
      brackets(pts, `${side} HAND${GESTURE_NAME[g.categoryName] ? ' · ' + GESTURE_NAME[g.categoryName] : ''}`, g.score ? `CONF ${(g.score * 100).toFixed(0)}%${S.pinch[i] ? '  · PINCH' : ''}` : '', `rgb(${col})`);
    });
    // body
    const P = S.res.pose;
    (P && P.landmarks || []).forEach((pts) => {
      const vis = pts.map((p, i) => ({ ...p, i })).filter((p) => (p.visibility ?? 1) > 0.5);
      if (style !== 'minimal') {
        c.strokeStyle = 'rgba(201,162,255,.9)'; c.lineWidth = 2.2; c.beginPath();
        for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
          if ((pts[start].visibility ?? 1) < 0.5 || (pts[end].visibility ?? 1) < 0.5 || (start < 11 && end < 11)) continue;
          const a = M(pts[start]), b = M(pts[end]); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
        }
        c.stroke();
        dots(pts, vis.filter((p) => p.i >= 11).map((p) => p.i), 3, 'rgba(201,162,255,1)');
      }
      if (style === 'full' && vis.length > 8) brackets(vis.filter((p) => p.i >= 11), 'BODY · ' + posture(pts), '', 'rgb(201,162,255)');
    });
    if (style === 'full') {   // scanning line and corner readouts
      const cw = S.canvas.clientWidth, ch = S.canvas.clientHeight, y = (performance.now() / 12) % ch;
      const g = c.createLinearGradient(0, y - 40, 0, y); g.addColorStop(0, `rgba(${acc},0)`); g.addColorStop(1, `rgba(${acc},.18)`);
      c.fillStyle = g; c.fillRect(0, y - 40, cw, 40);
      c.font = '10px Consolas, monospace'; c.fillStyle = `rgba(${acc},.9)`;
      const s = summarise();
      s.split(' · ').slice(0, 4).forEach((t, i) => c.fillText(t.toUpperCase(), 12, ch - 14 - i * 14));
    }
    S.summary = summarise();
  }
  function headPose(p) {
    const L = p[234], R = p[454], N = p[1], T = p[10], B = p[152];
    const yaw = Math.round(((N.x - (L.x + R.x) / 2) / Math.max(1e-3, Math.abs(R.x - L.x))) * -120);
    const pitch = Math.round(((N.y - (T.y + B.y) / 2) / Math.max(1e-3, Math.abs(B.y - T.y))) * -140);
    const roll = Math.round(Math.atan2(R.y - L.y, R.x - L.x) * 180 / Math.PI) * -1;
    return { yaw, pitch, roll };
  }
  function expression(bs) {
    if (!bs) return '';
    const s = Object.fromEntries(bs.categories.map((c) => [c.categoryName, c.score]));
    const smile = ((s.mouthSmileLeft || 0) + (s.mouthSmileRight || 0)) / 2, blink = ((s.eyeBlinkLeft || 0) + (s.eyeBlinkRight || 0)) / 2;
    if (blink > 0.6) return 'eyes closed';
    if ((s.jawOpen || 0) > 0.45) return smile > 0.3 ? 'laughing' : 'mouth open';
    if (smile > 0.45) return 'smiling';
    if ((s.browInnerUp || 0) > 0.5) return 'surprised';
    if (((s.browDownLeft || 0) + (s.browDownRight || 0)) / 2 > 0.45) return 'frowning';
    return 'neutral';
  }
  function posture(p) {
    const sh = (p[11].y + p[12].y) / 2, hip = (p[23].y + p[24].y) / 2, wr = Math.min(p[15].y, p[16].y);
    if (wr < p[0].y) return 'ARMS RAISED';
    if (Math.abs(p[11].y - p[12].y) > 0.06) return 'LEANING';
    return hip - sh < 0.25 ? 'SEATED' : 'UPRIGHT';
  }
  function summarise() {
    const out = [];
    const F = S.res.face, Hh = S.res.hands, P = S.res.pose;
    const nf = F && F.faceLandmarks ? F.faceLandmarks.length : 0;
    if (S.track.face) out.push(nf ? `${nf} face${nf > 1 ? 's' : ''}` + (nf ? ` (${expression(F.faceBlendshapes && F.faceBlendshapes[0]) || 'neutral'}, looking ${dir(headPose(F.faceLandmarks[0]))})` : '') : 'no face');
    if (S.track.hands || S.handControl) {
      const nh = Hh && Hh.landmarks ? Hh.landmarks.length : 0;
      out.push(nh ? `${nh} hand${nh > 1 ? 's' : ''}: ` + Hh.landmarks.map((_, i) => (GESTURE_NAME[((Hh.gestures[i] || [])[0] || {}).categoryName] || 'open').toLowerCase()).join(', ') : 'no hands');
    }
    if (S.track.body) out.push(P && P.landmarks && P.landmarks.length ? 'body ' + posture(P.landmarks[0]).toLowerCase() : 'no body');
    out.push(`${S.fps} fps`);
    return out.join(' · ');
  }
  const dir = (p) => Math.abs(p.yaw) < 12 && Math.abs(p.pitch) < 12 ? 'at the camera' : Math.abs(p.yaw) > Math.abs(p.pitch) ? (p.yaw > 0 ? 'right' : 'left') : (p.pitch > 0 ? 'up' : 'down');

  /* ---------- hands as a pointer ---------- */
  function handControl() {
    const Hh = S.res.hands;
    if (!S.handControl || !Hh || !Hh.landmarks || !Hh.landmarks.length) { if (S.hadHands) { onHands([]); S.hadHands = false; } return; }
    S.hadHands = true;
    const out = [];
    Hh.landmarks.slice(0, 2).forEach((pts, i) => {
      // comfortable control box in the middle of the camera view maps to the whole screen
      const bx = (1 - pts[8].x - 0.18) / 0.64, by = (pts[8].y - 0.15) / 0.6;
      let x = Math.max(0, Math.min(1, bx)) * innerWidth, y = Math.max(0, Math.min(1, by)) * innerHeight;
      const sm = S.smooth[i] || { x, y };
      const d = Math.hypot(x - sm.x, y - sm.y), k = Math.min(1, 0.18 + d / 260);   // adaptive smoothing: steady when still, quick when moving
      sm.x += (x - sm.x) * k; sm.y += (y - sm.y) * k; S.smooth[i] = sm;
      const span = Math.hypot(pts[0].x - pts[5].x, pts[0].y - pts[5].y) || 0.1;
      const pd = Math.hypot(pts[4].x - pts[8].x, pts[4].y - pts[8].y) / span;
      const was = S.pinch[i], now = was ? pd < 0.48 : pd < 0.3;   // hysteresis so a pinch does not flicker
      S.pinch[i] = now;
      out.push({ x: sm.x, y: sm.y, pinch: now, pinchStart: now && !was, pinchEnd: !now && was, gesture: ((Hh.gestures[i] || [])[0] || {}).categoryName });
    });
    for (let i = out.length; i < 2; i++) { S.pinch[i] = false; S.smooth[i] = null; }
    onHands(out);
  }
  function gestureCommands() {
    if (!S.gestures) return;
    const Hh = S.res.hands, g = Hh && Hh.gestures && Hh.gestures[0] && Hh.gestures[0][0];
    const name = g && g.score > 0.7 ? g.categoryName : '';
    if (name !== S.hold.name) { S.hold = { name, t: performance.now(), fired: false }; return; }
    if (!name || S.hold.fired) return;
    const held = performance.now() - S.hold.t;
    const fire = (fn, text) => { S.hold.fired = true; act('GESTURE · ' + text); fn(); };
    if (name === 'Open_Palm' && held > 1200 && hooks.speaking()) fire(hooks.stop, 'STOP');
    else if (name === 'Thumb_Up' && held > 1200 && hooks.approvalShown()) fire(() => hooks.approve(true), 'AUTHORISED');
    else if (name === 'Thumb_Down' && held > 1200 && hooks.approvalShown()) fire(() => hooks.approve(false), 'DENIED');
    else if (name === 'Pointing_Up' && held > 1500) fire(hooks.wake, 'LISTENING');
    else if (name === 'Victory' && held > 900) fire(() => snapshot(true), 'SNAPSHOT');
  }

  /* ---------- snapshot (for JARVIS to look at) ---------- */
  function snapshot(share) {
    const src = source(); if (!src || !S.on) return '';
    const [w, h] = srcSize(), k = Math.min(1, 1024 / w);
    const cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k;
    const c = cv.getContext('2d'); c.translate(cv.width, 0); c.scale(-1, 1); c.drawImage(src, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL('image/jpeg', 0.82);
    if (share) { call('vision_frame', url.split(',')[1]); toast('Snapshot shared with JARVIS', 2500); }
    return url;
  }

  return {
    mount,
    get open() { return S.on; },
    status() { return S.on ? 'Camera open. ' + S.summary + `. Overlay: ${S.style}. Hand control ${S.handControl ? 'on' : 'off'}.` : 'The camera is closed.'; },
    setStyle(v) { if (['off', 'minimal', 'wireframe', 'full'].includes(v)) { S.style = v; persist(); return true; } return false; },
    setTrack(list) { const l = String(list || 'all').toLowerCase(); for (const k of Object.keys(S.track)) S.track[k] = l === 'all' || l.includes(k) || (k === 'body' && l.includes('pose')); persist(); },
    setHandControl(v) { S.handControl = !!v; persist(); },
    setStream(v) { S.stream = !!v; },
    snapshot,
  };
}
