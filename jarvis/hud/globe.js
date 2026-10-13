/* Holographic Earth: dot-matrix continents, vector coastlines, live day/night terminator and real satellites (SGP4 on
   CelesTrak elements, simulated orbits when offline). Earth-fixed frame: continents stay put, the terminator and the
   satellites move in real time. Display altitude is true to scale up to 2,000 km and compressed above that. */
import * as THREE from 'three';
import * as SGP from './vendor/satellite.es.js';
import { LAND, LAND_W, LAND_H, COAST, BORDERS } from './vendor/earth-data.js';

export const R = 2.0;                 // globe radius in scene units
const RE = 6371;                      // Earth radius, km
const MU = 398600.4418;               // km^3/s^2
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export const GROUPS = {
  stations: { label: 'Stations', color: 0xfff1c9, size: 3.2, on: true },
  brightest: { label: 'Brightest', color: 0x7fe7ff, size: 2.2, on: true },
  gps: { label: 'GPS', color: 0x7dffb0, size: 2.4, on: true },
  weather: { label: 'Weather', color: 0xffc06b, size: 2.4, on: true },
  science: { label: 'Science', color: 0xc9a2ff, size: 2.4, on: true },
  geo: { label: 'Geostationary', color: 0xff8fc8, size: 2.0, on: false },
  starlink: { label: 'Starlink', color: 0x5aa9d6, size: 1.25, on: false },
};
const ALIASES = { ISS: 'ISS (ZARYA)', 'SPACE STATION': 'ISS (ZARYA)', HUBBLE: 'HST', 'HUBBLE SPACE TELESCOPE': 'HST', TIANGONG: 'CSS (TIANHE)', 'CHINESE SPACE STATION': 'CSS (TIANHE)' };

/* ---------- geometry helpers ---------- */
export function latLonToVec(lat, lon, r, out = new THREE.Vector3()) {
  const la = lat * D2R, lo = lon * D2R;
  return out.set(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}
export function dispRadius(altKm) {
  const k = R / RE;
  return altKm <= 2000 ? R + altKm * k : R + 2000 * k + (altKm - 2000) * k * 0.25;
}
function landAt(lat, lon) {
  const x = Math.min(LAND_W - 1, Math.max(0, Math.floor((lon + 180) / 360 * LAND_W)));
  const y = Math.min(LAND_H - 1, Math.max(0, Math.floor((90 - lat) / 180 * LAND_H)));
  const i = y * LAND_W + x;
  return (LAND_BITS[i >> 3] >> (i & 7)) & 1;
}
const LAND_BITS = Uint8Array.from(atob(LAND), (c) => c.charCodeAt(0));

/** Subsolar point (degrees) for a date: low-precision solar ephemeris, good to a fraction of a degree. */
export function subsolar(date) {
  const d = date.getTime() / 86400000 - 10957.5;                // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * D2R;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const e = (23.439 - 0.00000036 * d) * D2R;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = SGP.gstime(date);
  let lon = (ra - gmst) * R2D;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec * R2D, lon };
}

/* ---------- simulated constellation for offline use ---------- */
function simulated() {
  const list = [];
  const add = (name, group, inc, alt, raan, m0, lonFix) => list.push({ name: name + ' · SIM', group, sim: { inc: inc * D2R, alt, raan: raan * D2R, m0: m0 * D2R, lonFix } });
  add('ISS (ZARYA)', 'stations', 51.64, 418, 30, 0);
  add('CSS (TIANHE)', 'stations', 41.47, 385, 160, 120);
  add('HST', 'science', 28.47, 525, 250, 200);
  add('NOAA 19', 'weather', 99.1, 850, 80, 40); add('METOP-C', 'weather', 98.7, 817, 140, 300);
  add('TERRA', 'science', 98.2, 705, 110, 90); add('AQUA', 'science', 98.2, 705, 290, 10);
  add('LANDSAT 9', 'brightest', 98.2, 705, 200, 160); add('SENTINEL-2A', 'brightest', 98.6, 786, 20, 250);
  for (let p = 0; p < 6; p++) for (let s = 0; s < 4; s++) add('GPS ' + (p * 4 + s + 1), 'gps', 55, 20180, p * 60, s * 90 + p * 15);
  [-75.2, -137.2, 0, 140.7, 76].forEach((lon, i) => add(['GOES 16', 'GOES 18', 'METEOSAT 11', 'HIMAWARI 9', 'INSAT 3D'][i], i < 4 ? 'weather' : 'geo', 0, 35786, 0, 0, lon));
  for (let p = 0; p < 24; p++) for (let s = 0; s < 22; s++) add('STARLINK-' + (1000 + p * 22 + s), 'starlink', 53, 550, p * 15, s * (360 / 22) + p * 7);
  return list;
}

/** Position of one satellite: {lat, lon (deg), alt (km), vel (km/s), eci {x,y,z} km} or null. */
function stateOf(s, date, gmst) {
  if (s.satrec) {
    const pv = SGP.propagate(s.satrec, date);
    if (!pv || !pv.position || isNaN(pv.position.x)) return null;
    const gd = SGP.eciToGeodetic(pv.position, gmst);
    const v = pv.velocity;
    return { lat: gd.latitude * R2D, lon: gd.longitude * R2D, alt: gd.height, vel: Math.hypot(v.x, v.y, v.z), eci: pv.position };
  }
  const o = s.sim, r = RE + o.alt, n = Math.sqrt(MU / (r * r * r));
  if (o.lonFix != null) return { lat: 0, lon: o.lonFix, alt: o.alt, vel: Math.sqrt(MU / r), eci: null };
  const u = o.m0 + n * (date.getTime() / 1000 % 1e7);
  const cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(o.raan), sO = Math.sin(o.raan), ci = Math.cos(o.inc), si = Math.sin(o.inc);
  const eci = { x: r * (cu * cO - su * ci * sO), y: r * (cu * sO + su * ci * cO), z: r * su * si };
  let lon = (Math.atan2(eci.y, eci.x) - gmst) * R2D;
  lon = ((lon + 540) % 360) - 180;
  return { lat: Math.asin(eci.z / r) * R2D, lon, alt: o.alt, vel: Math.sqrt(MU / r), eci };
}
function periodMin(s) {
  if (s.satrec) return (2 * Math.PI) / s.satrec.no;      // satrec.no is rad/min
  const r = RE + s.sim.alt;
  return (2 * Math.PI * Math.sqrt((r * r * r) / MU)) / 60;
}
function incDeg(s) { return s.satrec ? s.satrec.inclo * R2D : s.sim.inc * R2D; }

/* ---------- reticle texture for the tracked satellite ---------- */
function reticleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 7;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    g.beginPath(); g.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke();
  }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGlobe({ color, pxRatio, loadTLE, onUpdate }) {
  const additive = (x = {}) => ({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...x });
  const group = new THREE.Group();          // positioned + scaled by the scene
  const earth = new THREE.Group();          // user yaw/pitch; everything Earth-fixed lives in here
  group.add(earth);
  earth.rotation.order = 'XYZ';
  const sunLocal = new THREE.Vector3(1, 0, 0);
  const U = { uTime: { value: 0 }, uReveal: { value: 0 }, uColor: { value: color }, uSun: { value: sunLocal }, uPx: { value: pxRatio } };
  const tinted = [];
  const lineMat = (op) => { const m = new THREE.LineBasicMaterial({ color: color.clone(), opacity: op, ...additive() }); tinted.push([m, 1]); return m; };

  /* depth-only occluder so the far side, and satellites behind Earth, are hidden */
  const occ = new THREE.Mesh(new THREE.SphereGeometry(R * 0.992, 64, 48), new THREE.MeshBasicMaterial({ colorWrite: false }));
  occ.renderOrder = -1;
  earth.add(occ);

  /* translucent body with fresnel rim, scanlines and night shading */
  const body = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({
    uniforms: U, ...additive(),
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){ vL = normalize(position); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uSun; uniform float uTime, uReveal; varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){
        float f = 1.0 - max(dot(vN, normalize(cameraPosition - vW)), 0.0);
        float day = smoothstep(-0.1, 0.25, dot(vL, uSun));
        float scan = 0.5 + 0.5 * sin(vW.y * 90.0 - uTime * 4.0);
        float edge = vL.y * 1.2 + 1.2 - uReveal * 2.6;
        if (edge > 0.0) discard;
        float band = exp(-edge * edge * 900.0);
        vec3 c = uColor * (0.05 + 0.10 * day + pow(f, 2.5) * 0.9 + scan * 0.02) + vec3(1.0) * band * 0.6;
        gl_FragColor = vec4(c, 0.55);
      }`,
  }));
  earth.add(body);

  /* atmosphere halo */
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 64, 48), new THREE.ShaderMaterial({
    uniforms: U, ...additive(), side: THREE.BackSide,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uReveal; varying vec3 vN; varying vec3 vW;
      void main(){ float f = pow(max(0.0, -dot(vN, normalize(cameraPosition - vW))), 3.0); gl_FragColor = vec4(uColor * f * 1.3 * uReveal, 1.0); }`,
  }));
  group.add(atmo);

  /* dot-matrix continents (Fibonacci sphere sampled against the land mask), coast dots brighter */
  {
    const N = 90000, pos = [], kind = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
      const lat = Math.asin(y) * R2D, lon = ((Math.atan2(-Math.sin(th) * r, Math.cos(th) * r) * R2D) + 540) % 360 - 180;
      if (!landAt(lat, lon)) continue;
      const step = 0.9;
      const coast = !landAt(lat + step, lon) || !landAt(lat - step, lon) || !landAt(lat, lon + step) || !landAt(lat, lon - step);
      const v = latLonToVec(lat, lon, R * 1.001);
      pos.push(v.x, v.y, v.z); kind.push(coast ? 1 : 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    const dots = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: U, ...additive(),
      vertexShader: /* glsl */`
        attribute float aKind; uniform float uTime, uReveal, uPx; uniform vec3 uSun;
        varying float vDay; varying float vKind; varying float vBand;
        void main(){
          vec3 n = normalize(position);
          float edge = n.y * 1.2 + 1.2 - uReveal * 2.6;
          vBand = exp(-edge * edge * 600.0);
          vDay = smoothstep(-0.12, 0.18, dot(n, uSun));
          vKind = aKind;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // capped so the dot matrix stays crisp (not a white-out) when the camera rides close to the surface
          gl_PointSize = (edge > 0.0 ? 0.0 : 1.0) * uPx * min((1.5 + aKind * 0.9 + vBand * 3.0) * (9.0 / -mv.z), 3.4 + vBand * 3.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vDay; varying float vKind; varying float vBand;
        void main(){
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.15, d);
          vec3 c = uColor * (0.32 + 0.75 * vDay) * (1.0 + vKind * 0.7) + vec3(1.0) * vBand;
          vec3 night = vec3(1.0, 0.72, 0.35) * 0.18 * (1.0 - vDay);   // warm city-light tint on the night side
          gl_FragColor = vec4(c + night, a);
        }`,
    }));
    earth.add(dots);
  }

  /* vector coastlines and borders */
  const polyLines = (lines, r, op) => {
    const pos = [];
    for (const l of lines) for (let i = 0; i + 3 < l.length; i += 2) {
      const a = latLonToVec(l[i + 1] / 20, l[i] / 20, r), b = latLonToVec(l[i + 3] / 20, l[i + 2] / 20, r);
      if (a.distanceTo(b) > R * 0.5) continue;      // antimeridian jumps
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.LineSegments(g, lineMat(op));
  };
  const coast = polyLines(COAST, R * 1.003, 0.75); earth.add(coast);
  const borders = polyLines(BORDERS, R * 1.002, 0.22); earth.add(borders);

  /* graticule */
  {
    const pos = [];
    const seg = (a, b) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 3) seg(latLonToVec(lat, lon, R * 1.0015), latLonToVec(lat, lon + 3, R * 1.0015));
    for (let lon = -180; lon < 180; lon += 15) for (let lat = -88; lat < 88; lat += 2) seg(latLonToVec(lat, lon, R * 1.0015), latLonToVec(lat + 2, lon, R * 1.0015));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    earth.add(new THREE.LineSegments(g, lineMat(0.12)));
    const eq = [];
    for (let lon = -180; lon <= 180; lon += 2) { const v = latLonToVec(0, lon, R * 1.004); eq.push(v.x, v.y, v.z); }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(eq, 3));
    earth.add(new THREE.Line(eg, lineMat(0.45)));
  }

  /* day / night terminator */
  const termPos = new Float32Array(181 * 3);
  const termG = new THREE.BufferGeometry(); termG.setAttribute('position', new THREE.BufferAttribute(termPos, 3));
  const termMat = new THREE.LineBasicMaterial({ color: 0xffc27a, opacity: 0.55, ...additive() });
  const terminator = new THREE.Line(termG, termMat);
  earth.add(terminator);
  const sunMarker = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 32), new THREE.MeshBasicMaterial({ color: 0xffc27a, opacity: 0.9, side: THREE.DoubleSide, ...additive() }));
  earth.add(sunMarker);
  let sunInfo = { lat: 0, lon: 0 };
  function updateSun(date) {
    sunInfo = subsolar(date);
    latLonToVec(sunInfo.lat, sunInfo.lon, 1, sunLocal).normalize();
    const a = new THREE.Vector3(0, 1, 0).cross(sunLocal).normalize();
    if (a.lengthSq() < 0.01) a.set(1, 0, 0);
    const b = sunLocal.clone().cross(a).normalize();
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * Math.PI * 2;
      const v = a.clone().multiplyScalar(Math.cos(t)).add(b.clone().multiplyScalar(Math.sin(t))).multiplyScalar(R * 1.006);
      termPos.set([v.x, v.y, v.z], i * 3);
    }
    termG.attributes.position.needsUpdate = true;
    sunMarker.position.copy(sunLocal).multiplyScalar(R * 1.01);
    sunMarker.lookAt(sunLocal.clone().multiplyScalar(R * 3));
  }

  /* ---------- pins: home and focused place ---------- */
  function makePin(hex) {
    const g = new THREE.Group();
    const m = new THREE.LineBasicMaterial({ color: hex, opacity: 0.95, ...additive() });
    const beam = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, R * 0.22)]);
    g.add(new THREE.Line(beam, m));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 32), new THREE.MeshBasicMaterial({ color: hex, opacity: 0.9, side: THREE.DoubleSide, ...additive() }));
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.068, 48), new THREE.MeshBasicMaterial({ color: hex, opacity: 0.6, side: THREE.DoubleSide, ...additive() }));
    g.add(ring2);
    g.userData.pulse = ring2;
    g.visible = false;
    earth.add(g);
    return g;
  }
  const pins = { home: makePin(0xffb347), place: makePin(0xffffff) };
  const pinInfo = { home: null, place: null };
  function setPin(which, info) {
    const p = pins[which];
    pinInfo[which] = info;
    if (!info) { p.visible = false; return; }
    const v = latLonToVec(info.lat, info.lon, R * 1.004);
    p.position.copy(v);
    p.lookAt(v.clone().multiplyScalar(2));
    p.visible = true;
  }

  /* ---------- satellites ---------- */
  let sats = [], byKey = new Map(), live = false, loaded = {}, loading = {};
  let satPos = new Float32Array(0), satCol = new Float32Array(0), satSize = new Float32Array(0), satVis = new Float32Array(0);
  const satG = new THREE.BufferGeometry();
  const satMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uSel: { value: -1 } }, ...additive(),
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aVis; uniform float uPx, uReveal, uTime;
      varying vec3 vC; varying float vA;
      void main(){
        vC = aColor; vA = aVis * uReveal;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aVis * uPx * min(aSize * (10.0 / -mv.z), aSize * 2.6) * (0.9 + 0.1 * sin(uTime * 3.0 + position.x * 40.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main(){
        vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard;
        float core = smoothstep(0.22, 0.0, d), ring = smoothstep(0.08, 0.0, abs(d - 0.36));
        gl_FragColor = vec4(vC * (core * 1.4 + ring * 0.7), (core + ring * 0.6) * vA);
      }`,
  });
  const satPoints = new THREE.Points(satG, satMat);
  satPoints.frustumCulled = false;
  earth.add(satPoints);

  // tracked-satellite decorations
  const sel = { s: null, view: false };
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture(), color: 0xffffff, ...additive(), depthTest: false }));
  reticle.scale.setScalar(0.16); reticle.visible = false; earth.add(reticle);
  const orbitG = new THREE.BufferGeometry(); orbitG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(257 * 3), 3));
  const orbitLine = new THREE.Line(orbitG, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.6, ...additive() }));
  const trackG = new THREE.BufferGeometry(); trackG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(181 * 3), 3));
  const trackLine = new THREE.Line(trackG, new THREE.LineDashedMaterial({ color: 0xffffff, opacity: 0.55, dashSize: 0.05, gapSize: 0.035, ...additive() }));
  const footG = new THREE.BufferGeometry(); footG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(129 * 3), 3));
  const footLine = new THREE.Line(footG, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.7, ...additive() }));
  const nadirG = new THREE.BufferGeometry(); nadirG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const nadirLine = new THREE.Line(nadirG, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, ...additive() }));
  for (const o of [orbitLine, trackLine, footLine, nadirLine]) { o.visible = false; o.frustumCulled = false; earth.add(o); }

  function rebuildBuffers() {
    const n = sats.length;
    satPos = new Float32Array(n * 3); satCol = new Float32Array(n * 3); satSize = new Float32Array(n); satVis = new Float32Array(n);
    const c = new THREE.Color();
    sats.forEach((s, i) => {
      s.idx = i;
      c.setHex(GROUPS[s.group].color);
      satCol.set([c.r, c.g, c.b], i * 3);
      satSize[i] = GROUPS[s.group].size * (s.name.startsWith('ISS') || s.name.startsWith('CSS') || s.name.startsWith('HST') ? 1.8 : 1);
    });
    satG.setAttribute('position', new THREE.BufferAttribute(satPos, 3));
    satG.setAttribute('aColor', new THREE.BufferAttribute(satCol, 3));
    satG.setAttribute('aSize', new THREE.BufferAttribute(satSize, 1));
    satG.setAttribute('aVis', new THREE.BufferAttribute(satVis, 1));
    satG.setDrawRange(0, n);
    rr = 0;
  }

  function parseTLE(txt, groupName) {
    const lines = txt.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
    const out = [];
    for (let i = 0; i + 2 < lines.length + 1; i++) {
      if (lines[i].startsWith('1 ') && lines[i + 1] && lines[i + 1].startsWith('2 ')) {
        const name = (i > 0 && !lines[i - 1].startsWith('2 ') ? lines[i - 1] : 'NORAD ' + lines[i].slice(2, 7)).trim();
        try {
          const satrec = SGP.twoline2satrec(lines[i], lines[i + 1]);
          if (!satrec.error) out.push({ name, group: groupName, norad: lines[i].slice(2, 7).trim(), satrec });
        } catch (e) { /* skip a malformed set */ }
        i++;
      }
    }
    return out;
  }

  async function loadGroup(name) {
    if (loaded[name] || loading[name]) return;
    loading[name] = true;
    let list = [];
    try {
      const txt = await loadTLE(name);
      if (txt) list = parseTLE(txt, name);
    } catch (e) { /* fall through to simulation */ }
    if (list.length) live = true;
    else list = simulated().filter((s) => s.group === name);
    for (const s of list) {
      const key = s.norad || s.name;
      if (byKey.has(key)) continue;          // the same satellite can be in several groups; keep the first
      byKey.set(key, s); sats.push(s);
    }
    loaded[name] = true; loading[name] = false;
    rebuildBuffers();
    updateAll(new Date());
    onUpdate && onUpdate();
  }
  function ensureGroups() { for (const [k, g] of Object.entries(GROUPS)) if (g.on) loadGroup(k); }

  // round-robin propagation: a fixed budget of satellites per frame keeps big constellations smooth
  let rr = 0;
  const tmp = new THREE.Vector3();
  function placeSat(s, st) {
    s.st = st;
    const i = s.idx * 3;
    if (!st) { satVis[s.idx] = 0; return; }
    latLonToVec(st.lat, st.lon, dispRadius(st.alt), tmp);
    satPos[i] = tmp.x; satPos[i + 1] = tmp.y; satPos[i + 2] = tmp.z;
    satVis[s.idx] = GROUPS[s.group].on ? 1 : 0;
  }
  function updateSome(date, budget) {
    if (!sats.length) return;
    const gmst = SGP.gstime(date);
    for (let k = 0; k < Math.min(budget, sats.length); k++) {
      const s = sats[rr]; rr = (rr + 1) % sats.length;
      placeSat(s, stateOf(s, date, gmst));
    }
    satG.attributes.position.needsUpdate = true;
    satG.attributes.aVis.needsUpdate = true;
  }
  function updateAll(date) { updateSome(date, sats.length); }

  function drawSelection(date) {
    const s = sel.s;
    const on = !!(s && s.st);
    for (const o of [reticle, orbitLine, trackLine, footLine, nadirLine]) o.visible = on;
    if (!on) return;
    const gmst = SGP.gstime(date);
    const st = stateOf(s, date, gmst); if (!st) return;
    s.st = st;
    const p = latLonToVec(st.lat, st.lon, dispRadius(st.alt));
    reticle.position.copy(p);
    const c = new THREE.Color(GROUPS[s.group].color);
    for (const o of [orbitLine, trackLine, footLine, nadirLine]) o.material.color.copy(c);
    reticle.material.color.copy(c);
    // orbit (inertial ellipse frozen in today's Earth-fixed frame) and ground track (true path over the ground)
    const per = periodMin(s) * 60000;
    const op = orbitG.attributes.position.array, tp = trackG.attributes.position.array;
    for (let i = 0; i <= 256; i++) {
      const d = new Date(date.getTime() + (i / 256) * per);
      const q = stateOf(s, d, gmst);
      if (q) latLonToVec(q.lat, q.lon, dispRadius(q.alt), tmp); op.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    for (let i = 0; i <= 180; i++) {
      const d = new Date(date.getTime() + ((i - 60) / 180) * per * 1.0);
      const q = stateOf(s, d, SGP.gstime(d));
      if (q) latLonToVec(q.lat, q.lon, R * 1.005, tmp); tp.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    orbitG.attributes.position.needsUpdate = true; trackG.attributes.position.needsUpdate = true;
    trackLine.computeLineDistances();
    // coverage footprint: everything that can see the satellite above the horizon
    const lam = Math.acos(RE / (RE + Math.max(1, st.alt)));
    const n = latLonToVec(st.lat, st.lon, 1).normalize();
    const a = new THREE.Vector3(0, 1, 0).cross(n); if (a.lengthSq() < 1e-4) a.set(1, 0, 0); a.normalize();
    const b = n.clone().cross(a).normalize();
    const fp = footG.attributes.position.array;
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      const v = n.clone().multiplyScalar(Math.cos(lam)).add(a.clone().multiplyScalar(Math.sin(lam) * Math.cos(t))).add(b.clone().multiplyScalar(Math.sin(lam) * Math.sin(t))).multiplyScalar(R * 1.006);
      fp.set([v.x, v.y, v.z], i * 3);
    }
    footG.attributes.position.needsUpdate = true;
    const np = nadirG.attributes.position.array;
    const sub = n.clone().multiplyScalar(R * 1.004);
    np.set([p.x, p.y, p.z, sub.x, sub.y, sub.z]);
    nadirG.attributes.position.needsUpdate = true;
  }

  /* ---------- view control: yaw/pitch with inertia, focus animation ---------- */
  const view = { yaw: -1.2, pitch: 0.35, vy: 0, vp: 0, ty: null, tp: null, auto: true, dist: 1 };
  function focusLatLon(lat, lon) {
    let ty = -Math.PI / 2 - lon * D2R;
    const d = ((ty - view.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;   // shortest way round
    view.ty = view.yaw + d; view.tp = Math.max(-1.3, Math.min(1.3, lat * D2R)); view.auto = false;
  }
  function drag(dx, dy) { view.vy += dx * 0.0055; view.vp += dy * 0.0045; view.ty = view.tp = null; view.auto = false; view.follow = false; }
  function nudge(dx, dy) { view.follow = false; view.ty = (view.ty ?? view.yaw) + dx; view.tp = Math.max(-1.3, Math.min(1.3, (view.tp ?? view.pitch) + dy)); view.auto = false; }

  /* ---------- picking (screen space, skips satellites hidden behind Earth) ---------- */
  const wp = new THREE.Vector3(), cam2 = new THREE.Vector3(), ray = new THREE.Vector3(), ctr = new THREE.Vector3();
  function pick(camera, x, y, w, h, maxPx = 14) {
    let best = null, bd = maxPx * maxPx;
    earth.updateWorldMatrix(true, false);
    group.getWorldPosition(ctr);
    const rad = R * group.scale.x;
    cam2.copy(camera.position);
    for (const s of sats) {
      if (!satVis[s.idx]) continue;
      wp.set(satPos[s.idx * 3], satPos[s.idx * 3 + 1], satPos[s.idx * 3 + 2]).applyMatrix4(earth.matrixWorld);
      if (occluded(cam2, wp, ctr, rad)) continue;
      const p = wp.clone().project(camera);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * w, sy = (-p.y * 0.5 + 0.5) * h;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function occluded(cam, p, c, r) {
    ray.copy(p).sub(cam); const L = ray.length(); ray.divideScalar(L);
    const oc = cam.clone().sub(c); const b = oc.dot(ray), q = oc.lengthSq() - r * r, disc = b * b - q;
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && t < L - 1e-3;
  }

  /** Screen position for a label anchor, or null when hidden. */
  function screenOf(camera, local, w, h) {
    earth.updateWorldMatrix(true, false);
    group.getWorldPosition(ctr);
    wp.copy(local).applyMatrix4(earth.matrixWorld);
    if (occluded(camera.position, wp, ctr, R * group.scale.x * 0.995)) return null;
    const p = wp.clone().project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return null;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
  }

  /* ---------- per frame ---------- */
  let sunT = 0, selT = 0;
  function update(dt, t, opts = {}) {
    U.uTime.value = t;
    const now = new Date();
    sunT -= dt; if (sunT <= 0) { updateSun(now); sunT = 10; }
    updateSome(now, 1600);
    selT -= dt; if (selT <= 0) { drawSelection(now); selT = 0.25; }
    // keep the tracked satellite in front of the camera unless the user is dragging
    if (sel.s && sel.s.st && !sel.view && view.follow) focusLatLon(sel.s.st.lat, sel.s.st.lon);
    if (view.ty != null) { view.yaw += (view.ty - view.yaw) * Math.min(1, dt * 2.6); if (Math.abs(view.ty - view.yaw) < 1e-3) view.ty = null; }
    if (view.tp != null) { view.pitch += (view.tp - view.pitch) * Math.min(1, dt * 2.6); if (Math.abs(view.tp - view.pitch) < 1e-3) view.tp = null; }
    view.yaw += view.vy; view.pitch = Math.max(-1.35, Math.min(1.35, view.pitch + view.vp));
    view.vy *= Math.pow(0.04, dt); view.vp *= Math.pow(0.04, dt);
    if (view.auto && !opts.calm) view.yaw += dt * 0.05;
    earth.rotation.set(view.pitch, view.yaw, 0);
    atmo.rotation.copy(earth.rotation);
    for (const p of Object.values(pins)) if (p.visible) { const k = 1 + ((t * 0.8) % 1) * 1.6; p.userData.pulse.scale.setScalar(k); p.userData.pulse.material.opacity = 0.7 * (1 - ((t * 0.8) % 1)); }
    reticle.material.rotation = t * 0.8;
    const k = 0.78;
    for (const [m] of tinted) m.color.copy(color).multiplyScalar(k);
  }

  /** Camera pose for "satellite view": ride just behind and above the satellite, looking down along the track. */
  function satCamera() {
    if (!sel.view || !sel.s || !sel.s.st) return null;
    const st = sel.s.st, now = new Date();
    const ahead = stateOf(sel.s, new Date(now.getTime() + 60000), SGP.gstime(now));
    if (!ahead) return null;
    earth.updateWorldMatrix(true, false);
    const p = latLonToVec(st.lat, st.lon, dispRadius(st.alt)).applyMatrix4(earth.matrixWorld);
    const f = latLonToVec(ahead.lat, ahead.lon, dispRadius(ahead.alt)).applyMatrix4(earth.matrixWorld);
    group.getWorldPosition(ctr);
    const up = p.clone().sub(ctr).normalize();
    const fwd = f.clone().sub(p).normalize();
    const h = Math.max(0.35, (dispRadius(st.alt) - R) * group.scale.x * 2.2);
    const pos = p.clone().addScaledVector(fwd, -h * 1.1).addScaledVector(up, h * 0.9);
    const look = ctr.clone().addScaledVector(up, R * group.scale.x * 0.92).addScaledVector(fwd, h * 1.4);
    return { pos, look, up };
  }

  /* ---------- queries for the HUD and the hologram tool ---------- */
  function find(q) {
    q = String(q || '').trim().toUpperCase();
    if (!q) return null;
    q = ALIASES[q] || q;
    const pool = sats.filter((s) => s.st);
    return pool.find((s) => s.norad === q) || pool.find((s) => s.name.toUpperCase() === q) || pool.find((s) => s.name.toUpperCase().replace(' · SIM', '') === q)
      || pool.find((s) => s.name.toUpperCase().startsWith(q)) || pool.find((s) => s.name.toUpperCase().includes(q)) || null;
  }
  function describe(s) {
    if (!s || !s.st) return null;
    const st = s.st;
    return { name: s.name, norad: s.norad || '—', group: GROUPS[s.group].label, lat: st.lat, lon: st.lon, alt: st.alt, vel: st.vel,
      period: periodMin(s), inc: incDeg(s), live: !!s.satrec, color: '#' + new THREE.Color(GROUPS[s.group].color).getHexString() };
  }
  function select(s, follow = true) {
    sel.s = s || null; selT = 0;
    if (!s) sel.view = false;
    view.follow = !!(s && follow);
    if (s && s.st) focusLatLon(s.st.lat, s.st.lon);
    onUpdate && onUpdate();
  }
  function setGroup(name, on) {
    if (!GROUPS[name]) return;
    GROUPS[name].on = on;
    if (on) loadGroup(name);
    for (const s of sats) if (s.group === name) satVis[s.idx] = on && s.st ? 1 : 0;
    satG.attributes.aVis && (satG.attributes.aVis.needsUpdate = true);
    if (!on && sel.s && sel.s.group === name) select(null);
    onUpdate && onUpdate();
  }
  function counts() {
    const c = {};
    for (const s of sats) c[s.group] = (c[s.group] || 0) + 1;
    return c;
  }

  ensureGroups();
  updateSun(new Date());

  return {
    group, earth, U,
    update, pick, screenOf, satCamera, drag, nudge, focusLatLon, setPin, pinInfo,
    find, describe, select, setGroup, counts, ensureGroups,
    get selected() { return sel.s; },
    get satView() { return sel.view; },
    set satView(v) { sel.view = !!(v && sel.s); onUpdate && onUpdate(); },
    get live() { return live; },
    get total() { return sats.filter((s) => GROUPS[s.group].on).length; },
    get sun() { return sunInfo; },
    get view() { return view; },
    search(q, max = 8) {
      q = String(q || '').trim().toUpperCase();
      if (!q) return [];
      return sats.filter((s) => s.st && GROUPS[s.group].on && (s.name.toUpperCase().includes(q) || s.norad === q)).slice(0, max);
    },
    labelAnchor(s) { return s && s.st ? latLonToVec(s.st.lat, s.st.lon, dispRadius(s.st.alt)) : null; },
    pinAnchor(which) { const p = pinInfo[which]; return p ? latLonToVec(p.lat, p.lon, R * 1.12) : null; },
    setReveal(v) { U.uReveal.value = v; },
  };
}
