import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
  BOOT:       { c: 0x2fa8ff, speed: 0.5, energy: 0.2,  bloom: 0.9,  scale: 0.9 },
  STANDBY:    { c: 0x2d90d8, speed: 0.35, energy: 0.12, bloom: 0.75, scale: 0.9 },
  LISTENING:  { c: 0x55dcff, speed: 1.0, energy: 0.5,  bloom: 1.15, scale: 1.0 },
  THINKING:   { c: 0xffb347, speed: 3.4, energy: 0.95, bloom: 1.35, scale: 1.02 },
  SPEAKING:   { c: 0x8eeaff, speed: 1.8, energy: 0.7,  bloom: 1.3,  scale: 1.05 },
  MUTED:      { c: 0xff4d63, speed: 0.12, energy: 0.05, bloom: 0.7, scale: 0.88 },
  CONNECTING: { c: 0x6f93ad, speed: 0.7, energy: 0.2,  bloom: 0.8,  scale: 0.92 },
  SETUP:      { c: 0xffb347, speed: 0.5, energy: 0.2,  bloom: 0.9,  scale: 0.92 },
};

export function createScene(canvas) {
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
          vec2 q = p * 0.5;
          vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          float ln = 1.0 - min(min(g.x, g.y), 1.0);
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
  }

  /* ---------- post-processing: bloom + lens, curvature, grain, scanlines ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.22);
  composer.addPass(bloom);
  const fx = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAb: { value: 0.0016 }, uBoot: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime, uAb, uBoot; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5; float d = dot(c, c);
        vec2 uv = 0.5 + c * (1.0 + 0.07 * d);              // gentle barrel curve
        vec2 o = c * uAb * (1.0 + d * 8.0);
        float r = texture2D(tDiffuse, uv + o).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv - o).b;
        vec3 col = vec3(r, g, b);
        col *= 0.93 + 0.07 * sin(gl_FragCoord.y * 1.6);     // scanlines
        col += (h(vUv * 900.0 + uTime) - 0.5) * 0.028;      // film grain
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
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* ---------- per-frame ---------- */
  const clock = new THREE.Clock();
  const baseCam = camera.position.clone();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    const k = 1 - Math.exp(-dt * 4);
    color.lerp(target, k);
    for (const m of tinted) m.color.copy(color).multiplyScalar(0.78);
    P.speed += (st.speed - P.speed) * k;
    P.energy += (st.energy - P.energy) * k;
    P.bloom += (st.bloom - P.bloom) * k;
    P.scale += (st.scale - P.scale) * k;

    const want = stateName === 'SPEAKING' ? outL : stateName === 'LISTENING' ? inL * 0.9 : stateName === 'STANDBY' ? inL * 0.15 : 0;
    lvl += (want - lvl) * (want > lvl ? 0.45 : 0.12);

    coreU.uTime.value = shellU.uTime.value = floorU.uTime.value = dustU.uTime.value = t;
    coreU.uLevel.value = shellU.uLevel.value = lvl;
    coreU.uEnergy.value = P.energy;
    gridPulse = Math.min(1, gridPulse + dt * 0.55);
    floorU.uPulse.value = gridPulse;

    const breathe = P.scale * (1 + 0.025 * Math.sin(t * 1.5) + 0.16 * lvl);
    core.scale.setScalar(breathe);
    inner.scale.setScalar(breathe * (1 + 0.3 * Math.sin(t * 3) * P.energy));
    lattice.rotation.y += dt * 0.25 * P.speed; lattice.rotation.x += dt * 0.11 * P.speed;
    lattice2.rotation.y -= dt * 0.18 * P.speed; lattice2.rotation.z += dt * 0.09 * P.speed;
    shell.rotation.y += dt * 0.07 * (0.4 + P.speed); shell.rotation.x = Math.sin(t * 0.2) * 0.15;
    shellU.uSize.value = 1.8 + P.energy * 1.2;

    for (const g of rings) {
      g.rotation.z += dt * g.userData.sp * P.speed;
      g.rotation.y += dt * 0.05 * P.speed * Math.sign(g.userData.sp);
    }
    plate.rotation.z += dt * 0.06 * (0.5 + P.speed * 0.5);

    // voice ring: gentle idle ripple, strong response to the voice level
    const amp = 0.025 + lvl * 0.6;
    for (let i = 0; i < WN; i++) {
      const a = (i / WN) * Math.PI * 2;
      const n = Math.sin(a * 7 + t * 3.1) * 0.5 + Math.sin(a * 13 - t * 4.7) * 0.3 + Math.sin(a * 3 + t * 1.3) * 0.4;
      const r = 1.98 + n * amp;
      wavePos[i * 3] = Math.cos(a) * r; wavePos[i * 3 + 1] = Math.sin(a) * r; wavePos[i * 3 + 2] = 0;
    }
    waveG.attributes.position.needsUpdate = true;

    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.userData.age += dt;
      const a = s.userData.age / 1.3;
      s.scale.setScalar(1 + a * 6.5 * s.userData.s);
      s.material.opacity = Math.max(0, 0.9 * (1 - a));
      if (a >= 1) { root.remove(s); s.material.dispose(); shocks.splice(i, 1); }
    }

    // camera: intro push-in, slow drift, mouse parallax
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    let z = baseCam.z;
    if (introOn) { intro = Math.min(1, intro + dt / 2.6); z += (1 - (1 - Math.pow(1 - intro, 3))) * 7; if (intro >= 1) introOn = false; }
    camera.position.set(baseCam.x + mouse.x * 0.8 + Math.sin(t * 0.17) * 0.12, baseCam.y - mouse.y * 0.45 + Math.cos(t * 0.13) * 0.08, z);
    camera.lookAt(0, -0.2, 0);
    root.rotation.y = mouse.x * 0.28 + Math.sin(t * 0.21) * 0.05;
    root.rotation.x = -mouse.y * 0.12;

    bloom.strength = P.bloom * 0.62 + lvl * 0.45;
    fx.uniforms.uTime.value = t;
    fx.uniforms.uAb.value = 0.0014 + lvl * 0.003 + (gridPulse < 0.3 ? 0.003 : 0);
    composer.render();
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
    intro() { introOn = true; intro = 0; },
    setBoot(v) { fx.uniforms.uBoot.value = v; },
  };
}
