// Usage: npm install topojson-client@3.1.0 world-atlas@2.0.2 in a folder, then
//   node tools/gen_earth_data.mjs <that folder> hud/vendor/earth-data.js
// Builds hud/vendor/earth-data.js: a 1-bit land mask + coastline and border polylines (Natural Earth via world-atlas, public domain).
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(process.argv[2] + '/');
const topo = require('topojson-client');
const land50 = JSON.parse(fs.readFileSync(process.argv[2] + '/node_modules/world-atlas/land-50m.json'));
const land110 = JSON.parse(fs.readFileSync(process.argv[2] + '/node_modules/world-atlas/land-110m.json'));
const ctry = JSON.parse(fs.readFileSync(process.argv[2] + '/node_modules/world-atlas/countries-110m.json'));

// ---- land mask (equirectangular, W x H, scanline even-odd fill of every ring) ----
const W = 1024, H = 512;
const geo = topo.feature(land50, land50.objects.land);
const rings = [];
for (const f of geo.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) for (const r0 of p) {
    // unwrap rings that cross the antimeridian so their edges stay short; pixels wrap modulo W when filling
    const r = [r0[0].slice()];
    for (let i = 1; i < r0.length; i++) {
      let x = r0[i][0];
      const px = r[i - 1][0];
      while (x - px > 180) x -= 360;
      while (px - x > 180) x += 360;
      r.push([x, r0[i][1]]);
    }
    rings.push(Math.abs(r[r.length - 1][0] - r[0][0]) < 1 ? r : r0); // pole-encircling ring (Antarctica): keep as is
  }
}
const bits = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  const lat = 90 - (y + 0.5) * 180 / H;
  for (const r of rings) {           // even-odd per ring (XOR), so overlapping rings cannot misalign the pairs
    const xs = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x1, y1] = r[i], [x2, y2] = r[j];
      if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + (lat - y1) * (x2 - x1) / (y2 - y1));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.ceil((xs[k] + 180) * W / 360 - 0.5), b = Math.floor((xs[k + 1] + 180) * W / 360 - 0.5);
      for (let x = a; x <= b; x++) bits[y * W + (((x % W) + W) % W)] ^= 1;
    }
  }
}
// Antarctica: the polygon wraps the pole, so fill everything south of its coast row by row
for (let x = 0; x < W; x++) { for (let y = H - 1; y >= 0 && (90 - (y + 0.5) * 180 / H) < -84; y--) bits[y * W + x] = 1; }
const packed = Buffer.alloc(W * H / 8);
for (let i = 0; i < W * H; i++) if (bits[i]) packed[i >> 3] |= 1 << (i & 7);
let landPct = bits.reduce((a, b) => a + b, 0) / (W * H);

// ---- polylines, quantised to 0.05 degrees ----
const q = (lines) => lines.map((l) => l.map(([x, y]) => [Math.round(x * 20), Math.round(y * 20)]).flat());
const coast = q(topo.mesh(land110, land110.objects.land).coordinates);
const borders = q(topo.mesh(ctry, ctry.objects.countries, (a, b) => a !== b).coordinates);
const out = `// Generated from Natural Earth (public domain) via world-atlas@2.0.2. Do not edit by hand.
// LAND: ${W}x${H} equirectangular 1-bit land mask (row 0 = 90N, column 0 = 180W), base64, LSB first.
// COAST / BORDERS: polylines of [lon*20, lat*20, lon*20, lat*20, ...].
export const LAND_W = ${W}, LAND_H = ${H};
export const LAND = '${packed.toString('base64')}';
export const COAST = ${JSON.stringify(coast)};
export const BORDERS = ${JSON.stringify(borders)};
`;
fs.writeFileSync(process.argv[3], out);
console.log('land fraction', landPct.toFixed(3), 'bytes', out.length, 'coast lines', coast.length, 'border lines', borders.length);
