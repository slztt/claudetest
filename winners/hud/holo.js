/* Generated holograms: WINNERS Bot describes an object as parts (boxes, cylinders, tori, tubes, text...) or loads a real 3D
   model file (.glb/.gltf/.obj/.stl), and it is projected as a translucent wireframe hologram with scan lines, a
   materialise sweep, labelled callouts and an exploded view. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const D2R = Math.PI / 180;
const FIT = 3.3;            // largest dimension after fitting, in scene units

export function createHolo({ color }) {
  const group = new THREE.Group();        // positioned by the scene
  const spinner = new THREE.Group();      // slow turntable + user drag
  const model = new THREE.Group();        // fitted content
  group.add(spinner); spinner.add(model);
  const U = { uTime: { value: 0 }, uColor: { value: color }, uReveal: { value: 0 }, uMinY: { value: -1.7 }, uMaxY: { value: 1.7 } };
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const faceMat = (hex) => new THREE.ShaderMaterial({
    uniforms: { ...U, uTint: { value: new THREE.Color(hex || 0xffffff) }, uUseTint: { value: hex ? 1 : 0 } }, ...additive, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uTint; uniform float uUseTint, uTime, uReveal, uMinY, uMaxY; varying vec3 vN; varying vec3 vW;
      void main(){
        float h = (vW.y - uMinY) / max(0.001, uMaxY - uMinY);
        if (h > uReveal * 1.08) discard;
        vec3 c = mix(uColor, uTint, uUseTint * 0.65);
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 2.2);
        float scan = 0.5 + 0.5 * sin(vW.y * 70.0 - uTime * 3.0);
        float edge = exp(-pow((h - uReveal * 1.08) * 30.0, 2.0));
        gl_FragColor = vec4(c * (0.025 + f * 0.32 + scan * 0.025) + vec3(1.0) * edge * 0.5, 1.0);
      }`,
  });
  const lineMat = (hex) => new THREE.ShaderMaterial({
    uniforms: { ...U, uTint: { value: new THREE.Color(hex || 0xffffff) }, uUseTint: { value: hex ? 1 : 0 } }, ...additive,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uTint; uniform float uUseTint, uReveal, uMinY, uMaxY, uTime; varying vec3 vW;
      void main(){
        float h = (vW.y - uMinY) / max(0.001, uMaxY - uMinY);
        if (h > uReveal * 1.08) discard;
        vec3 c = mix(uColor, uTint, uUseTint * 0.65);
        gl_FragColor = vec4(c * (0.62 + 0.12 * sin(uTime * 2.0 + vW.y * 8.0)), 0.8);
      }`,
  });
  const mats = [];
  const track = (m) => { mats.push(m); return m; };

  let labels = [], parts = [], explode = 0, explodeT = 0, title = '', revealT = 0;
  const drag = { vy: 0, vx: 0, rx: 0.18 };

  function holoMesh(geo, hex, edgesAngle = 22) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, track(faceMat(hex))));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, edgesAngle), track(lineMat(hex))));
    return g;
  }
  function textSprite(text, size = 0.3, hex = '#ffffff') {
    const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 64;
    g.font = `300 ${fs}px Bahnschrift, Segoe UI, sans-serif`;
    c.width = Math.ceil(g.measureText(text).width) + 20; c.height = fs + 20;
    g.font = `300 ${fs}px Bahnschrift, Segoe UI, sans-serif`; g.fillStyle = hex; g.textBaseline = 'middle'; g.fillText(text, 10, c.height / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, ...additive }));
    s.scale.set(size * c.width / c.height, size, 1);
    return s;
  }
  const v3 = (a, d = [0, 0, 0]) => new THREE.Vector3(...(Array.isArray(a) ? [a[0] ?? d[0], a[1] ?? d[1], a[2] ?? d[2]] : typeof a === 'number' ? [a, a, a] : d));

  function shape(p) {
    const s = String(p.shape || p.type || 'box').toLowerCase(), r = +p.radius || 0.5, h = +p.height || 1, seg = 32, hex = p.color;
    const size = v3(p.size, [1, 1, 1]);
    switch (s) {
      case 'box': case 'cube': return holoMesh(new THREE.BoxGeometry(size.x, size.y, size.z), hex);
      case 'sphere': return holoMesh(new THREE.SphereGeometry(r, 24, 16), hex, 40);
      case 'hemisphere': return holoMesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hex, 40);
      case 'cylinder': return holoMesh(new THREE.CylinderGeometry(p.radius_top ?? r, p.radius_bottom ?? r, h, seg), hex);
      case 'cone': return holoMesh(new THREE.ConeGeometry(r, h, seg), hex);
      case 'capsule': return holoMesh(new THREE.CapsuleGeometry(r, h, 6, 16), hex, 40);
      case 'torus': return holoMesh(new THREE.TorusGeometry(r, +p.tube || r * 0.15, 12, 48, (p.arc ?? 360) * D2R), hex, 40);
      case 'ring': return holoMesh(new THREE.RingGeometry(+p.inner || r * 0.6, +p.outer || r, 48), hex);
      case 'plane': return holoMesh(new THREE.PlaneGeometry(size.x, size.y), hex);
      case 'disc': case 'circle': return holoMesh(new THREE.CircleGeometry(r, 48), hex);
      case 'icosahedron': return holoMesh(new THREE.IcosahedronGeometry(r, p.detail || 0), hex);
      case 'octahedron': return holoMesh(new THREE.OctahedronGeometry(r), hex);
      case 'tetrahedron': return holoMesh(new THREE.TetrahedronGeometry(r), hex);
      case 'dodecahedron': return holoMesh(new THREE.DodecahedronGeometry(r), hex);
      case 'prism': return holoMesh(new THREE.CylinderGeometry(r, r, h, Math.max(3, p.sides || 6)), hex);
      case 'pyramid': return holoMesh(new THREE.ConeGeometry(r, h, Math.max(3, p.sides || 4)), hex);
      case 'line': case 'path': {
        const pts = (p.points || []).map((q) => v3(q));
        return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), track(lineMat(hex)));
      }
      case 'tube': {
        const pts = (p.points || []).map((q) => v3(q));
        if (pts.length < 2) return new THREE.Group();
        return holoMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(16, pts.length * 8), +p.radius || 0.05, 8, !!p.closed), hex, 50);
      }
      case 'extrude': {           // a 2D outline [[x,y],...] pushed out by depth
        const sh = new THREE.Shape((p.points || []).map((q) => new THREE.Vector2(q[0], q[1])));
        return holoMesh(new THREE.ExtrudeGeometry(sh, { depth: +p.depth || 0.2, bevelEnabled: false }), hex);
      }
      case 'lathe': {             // a profile [[radius,y],...] spun round the Y axis (vases, bottles, engines)
        return holoMesh(new THREE.LatheGeometry((p.points || []).map((q) => new THREE.Vector2(q[0], q[1])), 40), hex, 40);
      }
      case 'grid': return new THREE.GridHelper(+p.size || 4, +p.divisions || 10, new THREE.Color(hex || 0xffffff), new THREE.Color(hex || 0xffc93c));
      case 'text': return textSprite(String(p.text || ''), +p.size || 0.3, hex || '#ffffff');
      case 'group': return new THREE.Group();
      default: return holoMesh(new THREE.BoxGeometry(size.x, size.y, size.z), hex);
    }
  }
  function buildPart(p, parent, depth = 0) {
    if (depth > 6 || parts.length > 1500) return;
    const copies = Math.max(1, Math.min(64, +(p.repeat && p.repeat.count) || 1));
    for (let i = 0; i < copies; i++) {
      const o = shape(p);
      const holder = new THREE.Group();
      holder.add(o);
      holder.position.copy(v3(p.pos || p.position));
      const rot = v3(p.rot || p.rotation);
      holder.rotation.set(rot.x * D2R, rot.y * D2R, rot.z * D2R);
      if (p.scale != null) holder.scale.copy(v3(p.scale, [1, 1, 1]));
      if (i && p.repeat) {      // arrays: copies stepped by offset and/or rotation (blades, spokes, columns)
        const off = v3(p.repeat.offset), rr = v3(p.repeat.rotate);
        const pivot = new THREE.Group();
        pivot.rotation.set(rr.x * i * D2R, rr.y * i * D2R, rr.z * i * D2R);
        holder.position.add(off.clone().multiplyScalar(i));
        pivot.add(holder);
        parent.add(pivot);
      } else parent.add(holder);
      holder.userData.home = holder.position.clone();
      parts.push(holder);
      if (p.label && i === 0) labels.push({ text: String(p.label).slice(0, 60), obj: holder });
      for (const c of p.children || p.parts || []) buildPart(c, holder, depth + 1);
    }
  }
  function fit() {
    // measure in the hologram's own space: the projector group may be mid-animation (scaled to almost nothing)
    const keep = [group.scale.clone(), group.position.clone(), spinner.rotation.clone()];
    group.scale.setScalar(1); group.position.set(0, 0, 0); spinner.rotation.set(0, 0, 0);
    group.updateMatrixWorld(true);
    model.position.set(0, 0, 0); model.scale.setScalar(1);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const k = FIT / Math.max(size.x, size.y, size.z, 1e-3);
    model.scale.setScalar(k);
    model.position.copy(ctr.multiplyScalar(-k));
    U.uMinY.value = -size.y * k / 2 - 0.05; U.uMaxY.value = size.y * k / 2 + 0.05;
    // exploded view direction: each part away from the centre
    const c0 = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    for (const p of parts) {
      const wpos = p.getWorldPosition(new THREE.Vector3());
      p.userData.dir = wpos.sub(c0).normalize();
    }
    group.scale.copy(keep[0]); group.position.copy(keep[1]); spinner.rotation.copy(keep[2]);
    group.updateMatrixWorld(true);
  }
  function clear() {
    for (const m of mats) m.dispose();
    mats.length = 0; labels = []; parts = []; explode = explodeT = 0;
    model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    model.clear();
  }
  function start(t) { title = t || ''; U.uReveal.value = 0; revealT = 0; drag.vy = 0; spinner.rotation.set(0, -0.6, 0); }

  function build(spec) {
    clear();
    let s = spec;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return 'The hologram spec is not valid JSON: ' + e.message; } }
    if (Array.isArray(s)) s = { parts: s };
    const list = s.parts || s.children || [];
    if (!list.length) return 'The spec has no parts.';
    for (const p of list) buildPart(p, model);
    fit(); start(s.title);
    return `Hologram "${title || 'model'}" projected: ${parts.length} parts${labels.length ? ', ' + labels.length + ' labelled' : ''}.`;
  }
  function loadModel(url, ext, name) {
    clear(); start(name);
    ext = String(ext || url.split('?')[0].split('.').pop()).toLowerCase();
    return new Promise((resolve) => {
      const done = (obj) => {
        const out = new THREE.Group();
        let n = 0;
        obj.updateMatrixWorld(true);
        obj.traverse((o) => {
          if (o.isMesh && o.geometry && n < 4000) {
            n++;
            const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
            const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
            const m = new THREE.Group();
            m.add(new THREE.Mesh(g, track(faceMat())));
            if (tris < 400000) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, tris > 60000 ? 35 : 20), track(lineMat())));
            out.add(m); parts.push(m); m.userData.home = m.position.clone();
          }
        });
        model.add(out); fit();
        resolve(`Loaded ${name || 'the model'} as a hologram (${n} meshes).`);
      };
      const fail = (e) => resolve('Could not load that model: ' + (e && e.message || e));
      if (ext === 'glb' || ext === 'gltf') new GLTFLoader().load(url, (g) => done(g.scene), undefined, fail);
      else if (ext === 'obj') new OBJLoader().load(url, done, undefined, fail);
      else if (ext === 'stl') new STLLoader().load(url, (geo) => done(new THREE.Mesh(geo)), undefined, fail);
      else resolve('Unsupported model type .' + ext + ' (use glb, gltf, obj or stl).');
    });
  }
  function update(dt, t, spin = 0.45) {
    U.uTime.value = t;
    revealT = Math.min(1, revealT + dt / 2.2);
    U.uReveal.value = 1 - Math.pow(1 - revealT, 2);
    spinner.rotation.y += dt * 0.25 * spin + drag.vy; drag.vy *= Math.pow(0.05, dt);
    drag.rx = Math.max(-0.8, Math.min(0.9, drag.rx + drag.vx)); drag.vx *= Math.pow(0.05, dt);
    spinner.rotation.x = drag.rx;
    explode += (explodeT - explode) * Math.min(1, dt * 3);
    for (const p of parts) if (p.userData.dir) p.position.copy(p.userData.home).addScaledVector(p.userData.dir, explode * 0.8 / Math.max(0.01, model.scale.x));
  }
  return {
    group, build, loadModel, clear, update,
    drag(dx, dy) { drag.vy += dx * 0.004; drag.vx += dy * 0.003; },
    setExplode(v) { explodeT = v ? 1 : 0; },
    get exploded() { return explodeT > 0; },
    get title() { return title; },
    get count() { return parts.length; },
    labelAnchors() { return labels.slice(0, 14).map((l) => ({ text: l.text, pos: l.obj.getWorldPosition(new THREE.Vector3()) })); },
  };
}
