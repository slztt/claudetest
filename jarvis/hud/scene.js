import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGlobe, R as GLOBE_R } from './globe.js';
import { createHolo } from './holo.js';

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// Per-state look. c = colour, speed = ring spin multiplier, energy = shimmer, bloom = glow strength, scale = core size
const STATES = {
  BOOT:       { c: 0x2fa8ff, speed: 0.3, energy: 0.2,  bloom: 0.9,  scale: 0.9 },
  STANDBY:    { c: 0x2d90d8, speed: 0.25, energy: 0.12, bloom: 0.75, scale: 0.9 },
  LISTENING:  { c: 0x55dcff, speed: 0.5, energy: 0.5,  bloom: 1.15, scale: 1.0 },
  THINKING:   { c: 0xffb347, speed: 1.1, energy: 0.95, bloom: 1.35, scale: 1.02 },
  SPEAKING:   { c: 0x8eeaff, speed: 0.7, energy: 0.7,  bloom: 1.3,  scale: 1.05 },
  MUTED:      { c: 0xff4d63, speed: 0.12, energy: 0.05, bloom: 0.7, scale: 0.88 },
  CONNECTING: { c: 0x6f93ad, speed: 0.35, energy: 0.2,  bloom: 0.8,  scale: 0.92 },
  SETUP:      { c: 0xffb347, speed: 0.3, energy: 0.2,  bloom: 0.9,  scale: 0.92 },
};

export function createScene(canvas, opts = {}) {
  let themeHue = 0, themeMono = false;
  const KEEP = ['THINKING', 'MUTED', 'SETUP'];          // amber and red keep their meaning in every theme
  const hsl = {};
  function applyColor() {
    target.set(st.c);
    if (!KEEP.includes(stateName) && (themeHue || themeMono)) {
      target.getHSL(hsl);
      target.setHSL(((hsl.h + themeHue / 360) % 1 + 1) % 1, themeMono ? 0.04 : hsl.s, themeMono ? Math.min(0.9, hsl.l + 0.08) : hsl.l);
    }
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x02060c, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  const root = new THREE.Group();
  scene.add(root);

  const color = new THREE.Color(STATES.BOOT.c);
  const target = new THREE.Color(STATES.BOOT.c);
  const P = { speed: 0.5, energy: 0.2, bloom: 0.9, scale: 0.9 };
  let st = STATES.BOOT;
  let stateName = 'BOOT';
  let inL = 0, outL = 0, lvl = 0;
  let t = 0, intro = 0, introOn = false;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const shocks = [];
  const tinted = []; // basic materials that follow the state colour
  let gridPulse = 1;
  let calm = false;                 // reduced motion (accessibility)
  let spin = 0.45;                  // user's hologram speed (Configuration > Hologram speed)
  let modeTarget = 0, gm = 0;       // 0 = core, 1 = holographic Earth
  let hmTarget = 0, hm = 0;         // generated hologram (object / model) on the projector
  let zoom = 1, zoomT = 1;          // globe camera distance multiplier
  let glitch = 0;
  const camLook = new THREE.Vector3(0, -0.2, 0);
  let baseCam = null;

  const additive = (extra = {}) => ({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...extra });
  const basic = (opacity) => {
    const m = new THREE.MeshBasicMaterial({ color: color.clone(), opacity, ...additive() });
    tinted.push(m);
    return m;
  };
  const line = (opacity) => {
    const m = new THREE.LineBasicMaterial({ color: color.clone(), opacity, ...additive() });
    tinted.push(m);
    return m;
  };

  /* ---------- living energy core ---------- */
  const coreU = { uTime: { value: 0 }, uLevel: { value: 0 }, uEnergy: { value: 0 }, uColor: { value: color } };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.95, 24),
    new THREE.ShaderMaterial({
      uniforms: coreU, ...additive(), side: THREE.FrontSide,
      vertexShader: NOISE + /* glsl */ `
        uniform float uTime, uLevel, uEnergy;
        varying vec3 vN; varying vec3 vV; varying float vD;
        void main(){
          vec3 p = position;
          float n = snoise(p * 1.7 + vec3(0.0, 0.0, uTime * 0.35));
          float n2 = snoise(p * 3.4 - vec3(uTime * 0.5, 0.0, 0.0)) * 0.4;
          float d = (n + n2) * (0.07 + 0.30 * uLevel + 0.07 * uEnergy);
          vD = d;
          vec4 mv = modelViewMatrix * vec4(p + normal * d, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uLevel, uEnergy;
        varying vec3 vN; varying vec3 vV; varying float vD;
        void main(){
          float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.0);
          vec3 c = uColor * (0.10 + 1.15 * f) + vec3(1.0) * pow(f, 7.0) * 0.22 + uColor * vD * 2.0;
          float a = 0.22 + 0.78 * f;
          gl_FragColor = vec4(c * (0.50 + 0.55 * uLevel + 0.20 * uEnergy), a);
        }`,
    })
  );
  root.add(core);

  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 32), basic(0.38));
  root.add(inner);
  const lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(1.22, 2), new THREE.MeshBasicMaterial({ color: color.clone(), wireframe: true, opacity: 0.16, ...additive() }));
  tinted.push(lattice.material);
  root.add(lattice);
  const lattice2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.42, 1), new THREE.MeshBasicMaterial({ color: color.clone(), wireframe: true, opacity: 0.08, ...additive() }));
  tinted.push(lattice2.material);
  root.add(lattice2);

  /* ---------- particle shell ---------- */
  const pointVS = /* glsl */ `
    attribute float aSeed; uniform float uTime, uLevel, uSize, uPx; varying float vA;
    void main(){
      vec3 p = position;
      float k = 1.0 + uLevel * 0.45 + 0.05 * sin(uTime * 1.6 + aSeed * 6.2831);
      p *= k;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uSize * uPx * (0.6 + aSeed) * (9.0 / -mv.z);
      vA = 0.35 + 0.65 * fract(aSeed * 7.0 + uTime * 0.2);
      gl_Position = projectionMatrix * mv;
    }`;
  const pointFS = /* glsl */ `
    uniform vec3 uColor; uniform float uAlpha; varying float vA;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(uColor, a * a * vA * uAlpha);
    }`;
  const N = 2600;
  const sp = new Float32Array(N * 3), ss = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    const rad = 1.75 + Math.random() * 0.55;
    sp[i * 3] = Math.cos(th) * r * rad; sp[i * 3 + 1] = y * rad; sp[i * 3 + 2] = Math.sin(th) * r * rad;
    ss[i] = Math.random();
  }
  const shellG = new THREE.BufferGeometry();
  shellG.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  shellG.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
  const shellU = { uTime: { value: 0 }, uLevel: { value: 0 }, uSize: { value: 2.4 }, uPx: { value: renderer.getPixelRatio() }, uColor: { value: color }, uAlpha: { value: 0.85 } };
  const shell = new THREE.Points(shellG, new THREE.ShaderMaterial({ uniforms: shellU, vertexShader: pointVS, fragmentShader: pointFS, ...additive() }));
  root.add(shell);

  /* ---------- curved arc rings (partial tori) ---------- */
  const ringDefs = [
    { R: 2.15, tube: 0.016, arc: 4.4, rx: 1.15, ry: 0.0, rz: 0.2, sp: 0.35, op: 0.95 },
    { R: 2.15, tube: 0.016, arc: 1.2, rx: 1.15, ry: 0.0, rz: 3.6, sp: 0.35, op: 0.95 },
    { R: 2.55, tube: 0.010, arc: 5.6, rx: 0.4, ry: 0.9, rz: 0.0, sp: -0.5, op: 0.75 },
    { R: 2.95, tube: 0.026, arc: 1.7, rx: 1.45, ry: -0.5, rz: 0.0, sp: 0.8, op: 0.9 },
    { R: 2.95, tube: 0.026, arc: 1.1, rx: 1.45, ry: -0.5, rz: 3.3, sp: 0.8, op: 0.9 },
    { R: 1.7, tube: 0.012, arc: 3.3, rx: 0.2, ry: 1.2, rz: 0.4, sp: -1.1, op: 0.8 },
    { R: 3.4, tube: 0.008, arc: 6.283, rx: 1.0, ry: 0.35, rz: 0.0, sp: 0.12, op: 0.35 },
  ];
  const rings = ringDefs.map((d) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.TorusGeometry(d.R, d.tube, 6, 180, d.arc), basic(d.op));
    m.userData.op = d.op;
    g.add(m);
    g.rotation.set(d.rx, d.ry, d.rz);
    g.userData = { sp: d.sp, rz: d.rz };
    root.add(g);
    return g;
  });

  const tickRing = (R, n, long, short, op) => {
    const pos = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, l = i % 5 === 0 ? long : short;
      pos.push(Math.cos(a) * R, Math.sin(a) * R, 0, Math.cos(a) * (R + l), Math.sin(a) * (R + l), 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.LineSegments(g, line(op));
  };
  const plate = new THREE.Group(); // tilted orbital plate with tick marks, like a hologram dial
  plate.add(tickRing(3.9, 180, 0.22, 0.09, 0.55));
  plate.add(tickRing(3.55, 72, 0.12, 0.05, 0.3));
  const plateArc = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.012, 6, 220, 2.2), basic(0.8));
  plate.add(plateArc);
  const plateArc2 = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.012, 6, 220, 0.9), basic(0.8));
  plateArc2.rotation.z = 3.5;
  plate.add(plateArc2);
  plate.rotation.x = 1.22;
  plate.position.y = -0.6;
  root.add(plate);

  /* ---------- voice waveform ring ---------- */
  const WN = 256;
  const wavePos = new Float32Array(WN * 3);
  const waveG = new THREE.BufferGeometry();
  waveG.setAttribute('position', new THREE.BufferAttribute(wavePos, 3));
  const wave = new THREE.LineLoop(waveG, line(0.95));
  root.add(wave);
  const wave2 = new THREE.LineLoop(waveG, line(0.35));
  wave2.scale.setScalar(1.06);
  root.add(wave2);

  /* ---------- holo floor ---------- */
  const floorU = { uTime: { value: 0 }, uColor: { value: color }, uPulse: { value: 1 } };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShaderMaterial({
      uniforms: floorU, ...additive(),
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime, uPulse; varying vec3 vW;
        void main(){
          vec2 p = vW.xz; float r = length(p);
          // hexagonal grid: distance to the nearest hex edge
          vec2 q = p * 0.55;
          vec2 sq = vec2(1.0, 1.7320508);
          vec2 ha = mod(q, sq) - sq * 0.5, hb = mod(q - sq * 0.5, sq) - sq * 0.5;
          vec2 hc = dot(ha, ha) < dot(hb, hb) ? ha : hb;
          vec2 ah = abs(hc);
          float hexd = 0.5 - max(dot(ah, normalize(sq)), ah.x);
          float ln = 1.0 - smoothstep(0.0, fwidth(q.x) * 1.4, hexd);
          float w = abs(fract(r * 0.22 - uTime * 0.05) - 0.5);
          float ring = smoothstep(0.455, 0.5, w);
          float pr = exp(-pow((r - uPulse * 22.0) * 0.9, 2.0)) * (1.0 - uPulse) * smoothstep(0.0, 0.1, uPulse) * smoothstep(1.5, 5.0, r);
          float fade = smoothstep(18.0, 1.5, r);
          float a = (ln * 0.30 + ring * 0.30 + pr * 0.8) * fade;
          gl_FragColor = vec4(uColor * (0.55 + pr * 0.8), a);
        }`,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.0;
  scene.add(floor);

  /* ---------- hologram projector: emitter on the floor and a light cone up to the hologram ---------- */
  const beamU = { uTime: { value: 0 }, uColor: { value: color }, uLevel: { value: 0 }, uOn: { value: 1 } };
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 0.55, 2.4, 96, 1, true),
    new THREE.ShaderMaterial({
      uniforms: beamU, ...additive(), side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime, uLevel, uOn; varying vec2 vUv; varying vec3 vP;
        void main(){
          float h = vUv.y;                                   // 0 at the emitter, 1 at the top
          float fade = pow(1.0 - h, 1.6) * smoothstep(0.0, 0.08, h);
          float rays = 0.55 + 0.45 * pow(abs(sin(vUv.x * 3.14159 * 48.0 + uTime * 0.6)), 6.0);
          float scan = smoothstep(0.02, 0.0, abs(fract(h * 1.0 - uTime * 0.35) - 0.5) - 0.47);
          float a = fade * (0.06 + 0.06 * uLevel) * rays + scan * 0.10 * (1.0 - h);
          gl_FragColor = vec4(uColor, a * uOn);
        }`,
    })
  );
  beam.position.y = -1.8;
  scene.add(beam);
  const emitter = new THREE.Group();
  emitter.add(tickRing(0.62, 96, 0.08, 0.035, 0.7));
  const emDisc = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 64), basic(0.35));
  emitter.add(emDisc);
  const emRing = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.008, 6, 128), basic(0.8));
  emitter.add(emRing);
  emitter.rotation.x = -Math.PI / 2;
  emitter.position.y = -2.98;
  scene.add(emitter);

  /* ---------- radar sweep on the orbital plate ---------- */
  const sweepU = { uTime: { value: 0 }, uColor: { value: color } };
  const sweepM = new THREE.Mesh(
    new THREE.CircleGeometry(3.9, 128),
    new THREE.ShaderMaterial({
      uniforms: sweepU, ...additive(), side: THREE.DoubleSide,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; varying vec2 vP;
        void main(){
          float r = length(vP) / 3.9; if (r > 1.0 || r < 0.45) discard;
          float a = atan(vP.y, vP.x);
          float d = mod(uTime * 1.1 - a, 6.28318);
          float trail = exp(-d * 2.2) * 0.38;
          float blips = step(0.985, fract(sin(floor(a * 30.0) * 91.7 + floor(r * 9.0) * 13.1) * 4375.5)) * exp(-d * 0.7) * 0.9;
          gl_FragColor = vec4(uColor, (trail + blips) * smoothstep(1.0, 0.85, r) * smoothstep(0.45, 0.55, r));
        }`,
    })
  );
  plate.add(sweepM);

  /* ---------- orbiting wireframe drones (little holographic data probes) ---------- */
  const drones = [];
  [[new THREE.OctahedronGeometry(0.11, 0), 3.2, 0.42, 0.3], [new THREE.TetrahedronGeometry(0.12, 0), 3.7, -0.3, 1.9],
   [new THREE.IcosahedronGeometry(0.1, 0), 2.7, 0.65, 3.8], [new THREE.BoxGeometry(0.13, 0.13, 0.13), 4.1, -0.5, 5.1]].forEach(([g, r, sp, ph], i) => {
    const m = new THREE.LineSegments(new THREE.EdgesGeometry(g), line(0.95));
    const trailPos = new Float32Array(40 * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(tg, line(0.25));
    m.userData = { r, sp, ph, tilt: 0.35 + i * 0.32, trail, trailPos };
    root.add(m); root.add(trail);
    drones.push(m);
  });

  /* ---------- holographic Earth ---------- */
  const globe = createGlobe({ color, pxRatio: renderer.getPixelRatio(), loadTLE: opts.loadTLE || (async () => ''), onUpdate: opts.onGlobe });
  globe.group.visible = false;
  scene.add(globe.group);
  const holo = createHolo({ color });
  holo.group.visible = false;
  scene.add(holo.group);

  /* ---------- drifting dust ---------- */
  const DN = 900, dp = new Float32Array(DN * 3), ds = new Float32Array(DN);
  for (let i = 0; i < DN; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 30; dp[i * 3 + 1] = (Math.random() - 0.5) * 14; dp[i * 3 + 2] = -6 + Math.random() * 14;
    ds[i] = Math.random();
  }
  const dustG = new THREE.BufferGeometry();
  dustG.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dustG.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
  const dustU = { uTime: { value: 0 }, uLevel: { value: 0 }, uSize: { value: 1.2 }, uPx: { value: renderer.getPixelRatio() }, uColor: { value: color }, uAlpha: { value: 0.5 } };
  const dust = new THREE.Points(dustG, new THREE.ShaderMaterial({
    uniforms: dustU, ...additive(),
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uSize, uPx; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + 7.0 + uTime * (0.08 + aSeed * 0.18), 14.0) - 7.0;
        p.x += sin(uTime * 0.2 + aSeed * 40.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uPx * (0.5 + aSeed) * (8.0 / -mv.z);
        vA = 0.3 + 0.7 * aSeed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: pointFS,
  }));
  scene.add(dust);

  /* ---------- shockwave ---------- */
  const shockGeo = new THREE.RingGeometry(0.97, 1.0, 128);
  function pulse(strength = 1) {
    const m = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: color.clone(), opacity: 0.9, side: THREE.DoubleSide, ...additive() }));
    m.userData = { age: 0, s: strength };
    m.scale.setScalar(1.0);
    root.add(m);
    shocks.push(m);
    gridPulse = 0;
    if (!calm) glitch = Math.max(glitch, 0.6 * strength);
  }

  /* ---------- post-processing: bloom + lens, curvature, grain, scanlines ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.22);
  composer.addPass(bloom);
  const fx = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAb: { value: 0.0016 }, uBoot: { value: 1 }, uGlitch: { value: 0 }, uCalm: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime, uAb, uBoot, uGlitch, uCalm; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5; float d = dot(c, c);
        vec2 uv = 0.5 + c * (1.0 + 0.07 * d);              // gentle barrel curve
        float band = step(0.82, h(vec2(floor(vUv.y * 38.0), floor(uTime * 24.0))));
        uv.x += (h(vec2(floor(vUv.y * 38.0), uTime)) - 0.5) * 0.045 * band * uGlitch;   // hologram tear on wake / mode change
        vec2 o = c * uAb * (1.0 + d * 8.0);
        float r = texture2D(tDiffuse, uv + o).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv - o).b;
        vec3 col = vec3(r, g, b);
        col *= 1.0 - (1.0 - uCalm) * 0.07 * (0.5 - 0.5 * sin(gl_FragCoord.y * 1.6));     // scanlines
        col += (h(vUv * 900.0 + uTime) - 0.5) * 0.028 * (1.0 - uCalm);      // film grain
        col *= smoothstep(1.0, 0.18, length(c) * 1.25);     // vignette
        col *= uBoot;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(fx);
  composer.addPass(new OutputPass());

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // keep the whole hologram in frame on narrow windows
    camera.position.set(0, 0.5, w / h < 1.3 ? 8.2 + (1.3 - w / h) * 5 : 8.2);
    camera.lookAt(0, -0.2, 0);
    camera.updateProjectionMatrix();
    if (baseCam) baseCam.copy(camera.position);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* ---------- per-frame ---------- */
  const clock = new THREE.Clock();
  baseCam = camera.position.clone();
  const camPos = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0), lookTmp = new THREE.Vector3();
  let satBlend = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    const dm = dt * spin * (calm ? 0.25 : 1);                 // motion budget: reduced-motion slows everything that spins
    const k = 1 - Math.exp(-dt * 4);
    color.lerp(target, k);
    for (const m of tinted) m.color.copy(color).multiplyScalar(0.78);
    P.speed += (st.speed - P.speed) * k;
    P.energy += (st.energy - P.energy) * k;
    P.bloom += (st.bloom - P.bloom) * k;
    P.scale += (st.scale - P.scale) * k;

    const want = stateName === 'SPEAKING' ? outL : stateName === 'LISTENING' ? inL * 0.9 : stateName === 'STANDBY' ? inL * 0.15 : 0;
    lvl += (want - lvl) * (want > lvl ? 0.45 : 0.12);

    // core <-> Earth morph
    gm += (modeTarget - gm) * Math.min(1, dt * (calm ? 6 : 1.7));
    if (Math.abs(modeTarget - gm) < 1e-3) gm = modeTarget;
    hm += (hmTarget - hm) * Math.min(1, dt * (calm ? 6 : 1.7));
    if (Math.abs(hmTarget - hm) < 1e-3) hm = hmTarget;
    const coreK = Math.max(0, 1 - Math.max(gm, hm) * 1.25);
    const earthK = Math.min(1, Math.max(0, (gm - 0.15) / 0.85));

    coreU.uTime.value = shellU.uTime.value = floorU.uTime.value = dustU.uTime.value = beamU.uTime.value = sweepU.uTime.value = t;
    coreU.uLevel.value = shellU.uLevel.value = beamU.uLevel.value = lvl;
    coreU.uEnergy.value = P.energy;
    gridPulse = Math.min(1, gridPulse + dt * 0.55);
    floorU.uPulse.value = gridPulse;

    const breathe = P.scale * (1 + (calm ? 0 : 0.025 * Math.sin(t * 1.5)) + 0.16 * lvl);
    core.scale.setScalar(Math.max(1e-3, breathe * coreK));
    inner.scale.setScalar(Math.max(1e-3, breathe * coreK * (1 + 0.3 * Math.sin(t * 3) * P.energy)));
    lattice.scale.setScalar(Math.max(1e-3, coreK)); lattice2.scale.setScalar(Math.max(1e-3, coreK));
    const om = Math.max(gm, hm);
    shell.scale.setScalar(Math.max(1e-3, 1 + om * 0.55));
    shellU.uAlpha.value = 0.85 * (1 - om * 0.8);
    core.visible = inner.visible = lattice.visible = lattice2.visible = coreK > 0.002;
    lattice.rotation.y += dm * 0.25 * P.speed; lattice.rotation.x += dm * 0.11 * P.speed;
    lattice2.rotation.y -= dm * 0.18 * P.speed; lattice2.rotation.z += dm * 0.09 * P.speed;
    shell.rotation.y += dm * 0.07 * (0.4 + P.speed); shell.rotation.x = Math.sin(t * 0.2) * 0.15;
    shellU.uSize.value = 1.8 + P.energy * 1.2;

    const ringK = 1 + 0.34 * Math.max(gm, hm);
    for (const g of rings) {
      g.rotation.z += dm * g.userData.sp * P.speed;
      g.rotation.y += dm * 0.05 * P.speed * Math.sign(g.userData.sp);
      g.scale.setScalar(ringK);
      g.children[0].material.opacity = g.children[0].userData.op * (1 - 0.68 * Math.max(gm, hm));   // step back so the Earth reads clearly
    }
    plate.rotation.z += dm * 0.06 * (0.5 + P.speed * 0.5);
    plate.scale.setScalar(1 + 0.12 * gm);
    emitter.rotation.z -= dm * 0.4;
    emRing.scale.setScalar(1 + 0.08 * Math.sin(t * 2.2) + lvl * 0.4);
    beamU.uOn.value = 0.75 + 0.25 * gm;

    // drones orbit and leave a short trail
    for (const d of drones) {
      const u = d.userData; u.a = (u.a || u.ph) + dm * u.sp * (0.6 + P.speed * 0.4); const a = u.a;
      const r = u.r * (1 + 0.15 * gm);
      d.position.set(Math.cos(a) * r, Math.sin(a * 0.7) * 0.6 + Math.sin(u.tilt) * Math.sin(a) * r * 0.35, Math.sin(a) * r);
      d.rotation.x += dm * 1.3; d.rotation.y += dm * 0.9;
      u.trailPos.copyWithin(3, 0, u.trailPos.length - 3);
      u.trailPos[0] = d.position.x; u.trailPos[1] = d.position.y; u.trailPos[2] = d.position.z;
      u.trail.geometry.attributes.position.needsUpdate = true;
    }

    // voice ring: gentle idle ripple, strong response to the voice level; widens to circle the Earth
    const amp = 0.025 + lvl * 0.6;
    const baseR = 1.98 * (1 + 0.24 * gm);
    for (let i = 0; i < WN; i++) {
      const a = (i / WN) * Math.PI * 2;
      const n = calm ? Math.sin(a * 7) * 0.3 : Math.sin(a * 7 + t * 3.1) * 0.5 + Math.sin(a * 13 - t * 4.7) * 0.3 + Math.sin(a * 3 + t * 1.3) * 0.4;
      const r = baseR + n * amp;
      wavePos[i * 3] = Math.cos(a) * r; wavePos[i * 3 + 1] = Math.sin(a) * r; wavePos[i * 3 + 2] = 0;
    }
    waveG.attributes.position.needsUpdate = true;
    wave.rotation.x = wave2.rotation.x = gm * 1.25;   // lies down into an equatorial ring around the Earth
    wave.material.opacity = 0.95 * (1 - 0.45 * gm); wave2.material.opacity = 0.35 * (1 - 0.45 * gm);

    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.userData.age += dt;
      const a = s.userData.age / 1.3;
      s.scale.setScalar(1 + a * 6.5 * s.userData.s);
      s.material.opacity = Math.max(0, 0.9 * (1 - a));
      if (a >= 1) { root.remove(s); s.material.dispose(); shocks.splice(i, 1); }
    }

    // Earth
    globe.group.visible = earthK > 0.001;
    if (globe.group.visible) {
      globe.setReveal(earthK);
      globe.group.scale.setScalar(0.9 + 0.1 * earthK);
      globe.group.position.y = 0;
      globe.update(dt, t, { calm, spin });
    }

    // generated hologram
    holo.group.visible = hm > 0.002;
    if (holo.group.visible) {
      holo.group.scale.setScalar(Math.max(1e-3, hm));
      holo.update(dt, t, calm ? spin * 0.25 : spin);
    }

    // camera: intro push-in, slow drift, mouse parallax; zoom in Earth mode; ride-along in satellite view
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    zoom += (zoomT - zoom) * Math.min(1, dt * 5);
    let z = baseCam.z * (1 + (zoom - 1) * Math.max(gm, hm));
    if (introOn) { intro = Math.min(1, intro + dt / 2.6); z += (1 - (1 - Math.pow(1 - intro, 3))) * 7; if (intro >= 1) introOn = false; }
    const par = 1 - Math.max(gm, hm) * 0.8, drift = calm ? 0 : 1;
    camPos.set(baseCam.x + mouse.x * 0.8 * par + Math.sin(t * 0.17) * 0.12 * drift, baseCam.y - mouse.y * 0.45 * par + Math.cos(t * 0.13) * 0.08 * drift, z);
    lookTmp.set(0, -0.2 * (1 - gm), 0);
    const sc = globe.group.visible ? globe.satCamera() : null;
    satBlend += ((sc ? 1 : 0) - satBlend) * Math.min(1, dt * (calm ? 8 : 2.2));
    if (sc && satBlend > 0.001) {
      camPos.lerp(sc.pos, satBlend); lookTmp.lerp(sc.look, satBlend);
      camUp.set(0, 1, 0).lerp(sc.up, satBlend).normalize();
    } else camUp.set(0, 1, 0);
    camera.position.copy(camPos);
    camera.up.copy(camUp);
    camLook.lerp(lookTmp, sc ? 1 : Math.min(1, dt * 4));
    camera.lookAt(camLook);
    const fovT = 48 + satBlend * 14;
    if (Math.abs(camera.fov - fovT) > 0.01) { camera.fov = fovT; camera.updateProjectionMatrix(); }
    root.rotation.y = (mouse.x * 0.28 + (calm ? 0 : Math.sin(t * 0.21) * 0.05)) * par;
    root.rotation.x = -mouse.y * 0.12 * par;

    glitch = Math.max(0, glitch - dt * 1.6);
    bloom.strength = (P.bloom * 0.62 + lvl * 0.45) * (1 - 0.3 * gm) * (1 - 0.45 * hm) * (1 - 0.45 * satBlend);
    fx.uniforms.uTime.value = t;
    fx.uniforms.uGlitch.value = calm ? 0 : glitch;
    fx.uniforms.uAb.value = calm ? 0.0008 : 0.0014 + lvl * 0.003 + (gridPulse < 0.3 ? 0.003 : 0) + glitch * 0.004;
    composer.render();
    if (opts.onFrame) opts.onFrame(camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setState(name) {
      if (!STATES[name]) return;
      stateName = name; st = STATES[name]; applyColor();
    },
    setTheme(hue, mono) { themeHue = hue || 0; themeMono = !!mono; applyColor(); },
    setLevels(i, o) { inL = i; outL = o; },
    setMouse(nx, ny) { mouse.tx = nx; mouse.ty = ny; },
    pulse,
    intro() { if (!calm) { introOn = true; intro = 0; } },
    setBoot(v) { fx.uniforms.uBoot.value = v; },
    setSpin(v) { spin = Math.max(0.05, Math.min(1.5, +v || 0.45)); },
    setCalm(v) { calm = !!v; fx.uniforms.uCalm.value = calm ? 1 : 0; if (calm) introOn = false; },
    setMode(m) {
      const t2 = m === 'globe' ? 1 : 0, h2 = m === 'model' ? 1 : 0;
      if ((t2 !== modeTarget || h2 !== hmTarget) && !calm) glitch = 0.9;
      modeTarget = t2; hmTarget = h2;
      if (!t2) { globe.satView = false; zoomT = 1; }
    },
    get mode() { return modeTarget ? 'globe' : hmTarget ? 'model' : 'core'; },
    holo,
    zoomBy(f) { zoomT = Math.max(0.42, Math.min(1.9, zoomT * f)); },
    globe, camera,
  };
}
