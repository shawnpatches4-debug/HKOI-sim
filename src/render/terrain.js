// Terrain: the ground mesh and its material, built from a World.
// Scene axes: x = east, y = up, z = south (so north is -z). One unit = one metre.
//
// How the ground is drawn. Three map-sized pictures are painted once per world (about 4 m per pixel):
//   colour : the broad colour of every place (which field, wood, village; damp hollows darker, crests paler)
//   cover 1: how much of each pixel is plough, low crop, tall crop, and which way the field's rows run
//   cover 2: how much is forest floor, scrub, built-up ground, and the distance to the nearest road
// The material then lays repeating close-up surfaces (groundtex.js) over that by cover, adds furrows, crop rows, tractor lines,
// road ruts, bare earth on steep ground, snow and wet. So a field keeps its colour from far off and shows its surface from near.
import * as THREE from 'three';
import { ENV, atmosphere } from './env.js';
import { groundDetail } from './groundtex.js';

// broad ground colours per setting
export const GROUND = {
  farmland: { open: '#7a8350', meadow: '#8d9058', plough: '#5a4a39', low: ['#c4aa60', '#84914f', '#b8a676', '#627a3f'], high: ['#587338', '#70803a'], scrub: '#6c7547', forest: '#3d3b27', built: '#857d70', road: '#a39274', rock: '#7a705d', soil: '#5b4936', asphalt: 0 },
  desert: { open: '#c6a878', meadow: '#c0a273', plough: '#b3966a', low: ['#bca572'], high: ['#a8955f'], scrub: '#a8976a', forest: '#8a7c56', built: '#b7a382', road: '#d6c098', rock: '#96806a', soil: '#aa8f66', asphalt: 0 },
  town: { open: '#788150', meadow: '#8a8d57', plough: '#524131', low: ['#bfa75f', '#8a9850', '#b5a475'], high: ['#5a7439'], scrub: '#6c7547', forest: '#3d3b27', built: '#7f7a73', road: '#5f5e5c', rock: '#7a705d', soil: '#5b4936', asphalt: 1 },
  forest: { open: '#6c7d48', meadow: '#7d8a4f', plough: '#4c3c2d', low: ['#a9a05a', '#7f9049'], high: ['#557036'], scrub: '#5f6f42', forest: '#343320', built: '#7d766b', road: '#8e8064', rock: '#6f695c', soil: '#54432f', asphalt: 0 },
};

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// smooth noise, 0 to 1
function vn(u, v, sd) {
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = fu * fu * (3 - 2 * fu), b = fv * fv * (3 - 2 * fv);
  return (hash(i, j, sd) * (1 - a) + hash(i + 1, j, sd) * a) * (1 - b) + (hash(i, j + 1, sd) * (1 - a) + hash(i + 1, j + 1, sd) * a) * b;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ROAD_RANGE = 24;   // metres of road distance stored in the cover picture

// How far each grid point sits above or below the ground around it (about 100 m): hollows collect water and stay darker.
function relativeHeight(world) {
  const n = world.n, H = world.H, R = 6, tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) { let s = 0, c = 0; for (let i = -R; i < n + R; i++) { if (i + R < n) { s += H[j * n + Math.max(0, i + R)]; c++; } if (i - R - 1 >= 0) { s -= H[j * n + i - R - 1]; c--; } if (i >= 0 && i < n) tmp[j * n + i] = s / c; } }
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = -R; j < n + R; j++) { if (j + R < n) { s += tmp[Math.max(0, j + R) * n + i]; c++; } if (j - R - 1 >= 0) { s -= tmp[(j - R - 1) * n + i]; c--; } if (j >= 0 && j < n) out[j * n + i] = H[j * n + i] - s / c; } }
  return out;
}

// Paint the three map-sized pictures. Returns raw bytes (also used by the ground cover, which reads them to know what grows where).
export function bakeGroundMaps(world, size = 2048) {
  const G = GROUND[world.biomeKey] || GROUND.farmland, n = world.n, cell = world.cell, half = world.half, V = world.V, mpp = world.size / size, S = world.seed;
  const col = new Uint8Array(size * size * 4), c1 = new Uint8Array(size * size * 4), c2 = new Uint8Array(size * size * 4);
  const C = { open: rgb(G.open), meadow: rgb(G.meadow), plough: rgb(G.plough), low: G.low.map(rgb), high: G.high.map(rgb), scrub: rgb(G.scrub), forest: rgb(G.forest), built: rgb(G.built) };
  const rel = relativeHeight(world), g = world.fieldGrid, desert = world.biomeKey === 'desert';
  const at = (i, j) => (j < 0 ? 0 : j > n - 1 ? n - 1 : j) * n + (i < 0 ? 0 : i > n - 1 ? n - 1 : i);
  for (let py = 0; py < size; py++) {
    const nn = half - (py + 0.5) * mpp, gj = (nn + half) / cell, j0 = Math.floor(gj), fj = gj - j0;
    for (let px = 0; px < size; px++) {
      const e = (px + 0.5) * mpp - half, gi = (e + half) / cell, i0 = Math.floor(gi), fi = gi - i0, o = (py * size + px) * 4;
      const k00 = at(i0, j0), k10 = at(i0 + 1, j0), k01 = at(i0, j0 + 1), k11 = at(i0 + 1, j0 + 1), w00 = (1 - fi) * (1 - fj), w10 = fi * (1 - fj), w01 = (1 - fi) * fj, w11 = fi * fj;
      let wood = 0, line = 0, scrub = 0, built = 0;
      { let v = V[k00]; if (v === 4) wood += w00; else if (v === 5) line += w00; else if (v === 3) scrub += w00; else if (v === 6) built += w00;
        v = V[k10]; if (v === 4) wood += w10; else if (v === 5) line += w10; else if (v === 3) scrub += w10; else if (v === 6) built += w10;
        v = V[k01]; if (v === 4) wood += w01; else if (v === 5) line += w01; else if (v === 3) scrub += w01; else if (v === 6) built += w01;
        v = V[k11]; if (v === 4) wood += w11; else if (v === 5) line += w11; else if (v === 3) scrub += w11; else if (v === 6) built += w11; }
      const tpi = rel[k00] * w00 + rel[k10] * w10 + rel[k01] * w01 + rel[k11] * w11;
      const rag = (vn(e * 0.09, nn * 0.09, 21) - 0.5) * 0.6 + (vn(e * 0.4, nn * 0.4, 22) - 0.5) * 0.3;   // ragged edges for woods, scrub and yards
      const wFor = sstep(0.38, 0.6, wood + rag), wLine = sstep(0.3, 0.7, line + rag) * (1 - wFor), wScrub = Math.min(1, sstep(0.35, 0.65, scrub + rag) + wLine * 0.8) * (1 - wFor), wBuilt = sstep(0.3, 0.62, built + rag * 0.5);
      // the field this pixel lies in, and how far it is from the field's edge
      let c = C.open, wSoil = 0, wLow = 0, wTall = 0, dir = 0, tint = 1, warm = 0;
      if (g) {
        const F = world.fieldAt(e, nn);
        if (F) {
          const zz = F.z / g.FD, u = F.x / g.FW + (hash(Math.floor(zz), 7, g.S) - 0.5) * 0.6, fu = u - Math.floor(u), fz = zz - Math.floor(zz);
          const margin = Math.min(fu * g.FW, (1 - fu) * g.FW, fz * g.FD, (1 - fz) * g.FD), inF = sstep(1.5, 5.5, margin + rag * 4);   /* a grass strip between fields */
          dir = hash(F.id, 3, S) < 0.7 ? 0 : 1; tint = 1 + (hash(F.id, 1, 9) - 0.5) * 0.2; warm = (hash(F.id, 2, 9) - 0.5) * 0.08;
          if (F.t < 0.4) { if (F.id % 3 === 0) { c = C.plough; wSoil = inF; } else { c = F.id % 3 === 1 ? C.meadow : C.open; } }
          else if (F.t < 0.84) { c = C.low[F.id % C.low.length]; wLow = inF; }
          else { c = C.high[F.id % C.high.length]; wTall = inF; }
          if (inF < 1) { const k = 1 - inF; c = [c[0] + (C.open[0] * 0.92 - c[0]) * k, c[1] + (C.open[1] * 0.92 - c[1]) * k, c[2] + (C.open[2] * 0.92 - c[2]) * k]; tint = 1 + (tint - 1) * inF; }
        }
      }
      const keep = (1 - wFor) * (1 - wBuilt) * (1 - wScrub); wSoil *= keep; wLow *= keep; wTall *= keep;
      let r = c[0], gg = c[1], b = c[2];
      r += (C.scrub[0] - r) * wScrub; gg += (C.scrub[1] - gg) * wScrub; b += (C.scrub[2] - b) * wScrub;
      r += (C.forest[0] - r) * wFor; gg += (C.forest[1] - gg) * wFor; b += (C.forest[2] - b) * wFor;
      r += (C.built[0] - r) * wBuilt; gg += (C.built[1] - gg) * wBuilt; b += (C.built[2] - b) * wBuilt;
      // broad variation: big soft patches, smaller mottling, damp hollows and dry crests
      const big = vn(e * 0.0023, nn * 0.0023, 5), mid = vn(e * 0.011, nn * 0.011, 6), small = vn(e * 0.06, nn * 0.06, 3);
      const damp = Math.min(1, Math.max(0, -tpi / 3.5)), dry = Math.min(1, Math.max(0, tpi / 5));
      let m = tint * (0.86 + 0.16 * big + 0.12 * mid + 0.08 * small) * (1 - 0.2 * damp + 0.07 * dry);
      const grassy = 1 - wSoil - wBuilt - wFor;
      const patch = desert ? (big - 0.5) * 0.16 + (mid - 0.5) * 0.08 : (mid - 0.5) * 0.1 * grassy + warm;   /* desert: redder and paler sands; elsewhere greener and yellower patches of grass */
      r *= m * (1 + patch + 0.05 * dry); gg *= m * (1 + (desert ? 0 : 0.04 * damp * grassy)); b *= m * (1 - patch * 0.8 - 0.06 * dry);
      col[o] = r > 255 ? 255 : r; col[o + 1] = gg > 255 ? 255 : gg; col[o + 2] = b > 255 ? 255 : b; col[o + 3] = Math.round(damp * 255);
      c1[o] = wSoil * 255; c1[o + 1] = wLow * 255; c1[o + 2] = wTall * 255; c1[o + 3] = dir * 255;
      c2[o] = wFor * 255; c2[o + 1] = wScrub * 255; c2[o + 2] = wBuilt * 255; c2[o + 3] = 255;
    }
  }
  // distance to the nearest road, so the material can draw a crisp edge, wheel ruts and a verge at any zoom
  const R = ROAD_RANGE, P = (e, nn) => [(e + half) / mpp - 0.5, (half - nn) / mpp - 0.5];
  for (const road of world.roads) for (let s = 0; s < road.pts.length - 1; s++) {
    const [ax, ay] = P(road.pts[s][0], road.pts[s][1]), [bx, by] = P(road.pts[s + 1][0], road.pts[s + 1][1]), pad = R / mpp + 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + pad)), y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + pad));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2)), d = Math.hypot(x - ax - dx * t, y - ay - dy * t) * mpp, v = Math.min(255, d / R * 255), o = (y * size + x) * 4 + 3;
      if (v < c2[o]) c2[o] = v;
    }
  }
  return { size, col, c1, c2 };
}

function mapTexture(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

const PARS = /* glsl */`
  varying vec3 vWp; varying vec3 vWN;
  uniform sampler2D hkCol; uniform sampler2D hkC1; uniform sampler2D hkC2;
  #if HK_DETAIL > 0
  uniform highp sampler2DArray hkDet;
  #endif
  #if HK_DETAIL > 1
  uniform highp sampler2DArray hkNrm;
  #endif
  uniform vec3 hkMean[5]; uniform vec4 hkGrid; uniform vec3 hkRoad; uniform vec3 hkRock; uniform vec3 hkSoil; uniform float hkAsphalt;
  uniform float uSnow; uniform float uWet;
  vec2 hkTilt; float hkRough;
  float hk_h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hk_n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hk_h(i), hk_h(i + vec2(1, 0)), f.x), mix(hk_h(i + vec2(0, 1)), hk_h(i + vec2(1, 1)), f.x), f.y); }
`;
const BODY = /* glsl */`
  {
    vec2 wuv0 = (vWp.xz + hkGrid.z) / hkGrid.w;
    float dC = length(cameraPosition - vWp);
    vec3 gN = normalize(vWN);
    float n1 = hk_n(vWp.xz * 0.37), n2 = hk_n(vWp.xz * 0.043 + 7.3), n3 = hk_n(vWp.xz * 1.9 + 3.1);
    /* the map pictures are coarse (about 4 m a pixel): nudge where they are read by a metre or two so edges come out ragged, not airbrushed */
    vec2 wuv = wuv0 + (vec2(n1, hk_n(vWp.zx * 0.41 + 5.0)) - 0.5) * (3.2 / hkGrid.w) + (vec2(n3, hk_n(vWp.zx * 2.3 + 1.7)) - 0.5) * (1.2 / hkGrid.w);
    vec4 mc = texture2D(hkCol, wuv), c1 = texture2D(hkC1, wuv), c2 = texture2D(hkC2, wuv); c2.a = texture2D(hkC2, wuv0).a;
    float wSoil = c1.r, wLow = c1.g, wTall = c1.b, wFor = c2.r, wScrub = c2.g, wBuilt = c2.b, crop = wLow + wTall;
    float steep = smoothstep(0.90, 0.74, gN.y + (n1 - 0.5) * 0.07);

    // rows: furrows in plough, drill rows in crops, and the paired wheel lines a sprayer leaves through a crop
    float fe = vWp.x, fn = -vWp.z; vec2 fxz = vec2(fe * hkGrid.x + fn * hkGrid.y, -fe * hkGrid.y + fn * hkGrid.x);
    float across = step(0.5, c1.a), rc = mix(fxz.y, fxz.x, across), fwr = max(fwidth(rc), 1e-4);
    vec2 rdir = mix(vec2(-hkGrid.y, -hkGrid.x), vec2(hkGrid.x, -hkGrid.y), across);   /* which way "across the rows" points on the ground */
    float spF = 0.46, spL = 0.5, spT = 0.76;
    float aF = wSoil * (1.0 - smoothstep(0.22, 0.6, fwr / spF)), aL = wLow * (1.0 - smoothstep(0.22, 0.6, fwr / spL)), aT = wTall * (1.0 - smoothstep(0.22, 0.6, fwr / spT));
    float phF = rc / spF * 6.2832 + (n1 - 0.5) * 1.6, phL = rc / spL * 6.2832, phT = rc / spT * 6.2832;
    float gap = aL * (0.5 - 0.5 * sin(phL)) + aT * (0.5 - 0.5 * sin(phT));   /* soil showing between the rows */
    float tr = abs(mod(rc + 4.0, 21.0) - 10.5), tram = crop * clamp(0.5 + (0.17 - abs(tr - 0.9)) / fwr, 0.0, 1.0) * (0.55 + 0.45 * n1);
    /* broad bands a tractor leaves: each pass a slightly different tone, seen from far off */
    float pass = hk_h(vec2(floor(rc / 6.0), across + 3.0)), passW = 1.0 - smoothstep(1.5, 5.0, fwr);
    float band = 1.0 + (pass - 0.5) * 0.05 * passW * (wSoil + crop);

    // road: a worn surface with two wheel ruts, and grass creeping in at the middle and the edges of a dirt track
    float rd = c2.a * ${ROAD_RANGE.toFixed(1)}, rfw = fwidth(rd) + 0.01, halfW = mix(2.5, 3.3, hkAsphalt);
    float road = smoothstep(halfW + 0.35 + rfw, halfW - 0.35 - rfw, rd + (n1 - 0.5) * 1.1 * (1.0 - hkAsphalt) + (n3 - 0.5) * 0.3);
    float verge = smoothstep(halfW + 2.6, halfW, rd) * (1.0 - road);
    float rut = road * smoothstep(0.55 + rfw, 0.2, abs(rd - 0.95)) * (1.0 - hkAsphalt * 0.6);
    float crown = road * smoothstep(0.55, 0.1, rd) * smoothstep(0.35, 0.7, n1 * 0.6 + n3 * 0.4) * (1.0 - hkAsphalt);

    // which close-up surface belongs here
    float w1 = wSoil + wScrub * 0.3 + verge * 0.5, w2 = crop, w3 = wFor, w4 = wBuilt * 0.85;
    float w0 = max(0.0, 1.0 - w1 - w2 - w3 - w4);
    vec3 dcol = vec3(1.0); vec3 soilTex = vec3(1.0), stoneTex = vec3(1.0); float hgt = 0.5; hkTilt = vec2(0.0);
    #if HK_DETAIL > 0
      vec2 pa = vWp.xz * (1.0 / 3.3), pb = (mat2(0.8, -0.6, 0.6, 0.8) * vWp.xz) * (1.0 / 31.0);
      float fN = 1.0 - smoothstep(16.0, 85.0, dC);
      vec4 t0 = mix(mix(vec4(hkMean[0], 0.5), texture(hkDet, vec3(pb, 0.0)), 0.6), texture(hkDet, vec3(pa, 0.0)), fN);
      vec4 t1 = mix(mix(vec4(hkMean[1], 0.5), texture(hkDet, vec3(pb, 1.0)), 0.6), texture(hkDet, vec3(pa, 1.0)), fN);
      vec4 t2 = mix(mix(vec4(hkMean[2], 0.5), texture(hkDet, vec3(pb, 2.0)), 0.6), texture(hkDet, vec3(pa, 2.0)), fN);
      vec4 t3 = mix(mix(vec4(hkMean[3], 0.5), texture(hkDet, vec3(pb, 3.0)), 0.6), texture(hkDet, vec3(pa, 3.0)), fN);
      vec4 t4 = mix(mix(vec4(hkMean[4], 0.5), texture(hkDet, vec3(pb, 4.0)), 0.6), texture(hkDet, vec3(pa, 4.0)), fN);
      /* the taller surface wins where two meet, so grass tufts break into soil instead of fading across it */
      w0 *= 0.15 + t0.a * t0.a; w1 *= 0.15 + t1.a * t1.a; w2 *= 0.15 + t2.a * t2.a; w3 *= 0.15 + t3.a * t3.a; w4 *= 0.15 + t4.a * t4.a;
      float ws = w0 + w1 + w2 + w3 + w4 + 1e-4; w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws; w4 /= ws;
      soilTex = t1.rgb / hkMean[1]; stoneTex = t4.rgb / hkMean[4];
      dcol = w0 * t0.rgb / hkMean[0] + w1 * soilTex + w2 * t2.rgb / hkMean[2] + w3 * t3.rgb / hkMean[3] + w4 * stoneTex;
      hgt = w0 * t0.a + w1 * t1.a + w2 * t2.a + w3 * t3.a + w4 * t4.a;
      #if HK_DETAIL > 1
        vec2 nd = w0 * (texture(hkNrm, vec3(pa, 0.0)).rg - 0.5) * 1.5 + w1 * (texture(hkNrm, vec3(pa, 1.0)).rg - 0.5) * 2.2 + w2 * (texture(hkNrm, vec3(pa, 2.0)).rg - 0.5) * 1.6
          + w3 * (texture(hkNrm, vec3(pa, 3.0)).rg - 0.5) * 1.6 + w4 * (texture(hkNrm, vec3(pa, 4.0)).rg - 0.5) * 1.8;
        hkTilt = nd * fN * (1.0 - road * 0.5);
      #endif
    #else
      dcol = vec3(0.82 + 0.36 * (n1 * 0.6 + n3 * 0.4));
    #endif
    vec3 base = mc.rgb * dcol * band;
    base = mix(base, hkSoil * soilTex * (0.8 + 0.4 * n2), clamp(gap * 0.5 + tram * 0.5, 0.0, 1.0));
    base *= 1.0 - aF * 0.22 * (0.5 - 0.5 * sin(phF));
    base = mix(base, hkRock * mix(soilTex, stoneTex, 0.5) * (0.75 + 0.5 * n2), steep);
    vec3 roadCol = hkRoad * stoneTex * (0.86 + 0.28 * n2) * (1.0 - rut * 0.22);
    roadCol = mix(roadCol, mc.rgb * dcol * 0.9, crown * 0.7);
    base = mix(base, roadCol, road);
    hkTilt += rdir * (cos(phF) * aF * 0.55 + (cos(phL) * aL + cos(phT) * aT) * 0.4) * (1.0 - road);
    hkRough = 0.96 - 0.06 * road * hkAsphalt;

    // wet ground: darker, and standing water in furrow bottoms, wheel ruts and hollows
    if (uWet > 0.0) {
      float earth = clamp(w1 + road + gap + steep, 0.0, 1.0);
      float low = (1.0 - hgt) * 0.5 + mc.a * 0.5 + rut * 0.6 + aF * (0.5 - 0.5 * sin(phF)) * 0.5 + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.6;
      float puddle = uWet * smoothstep(0.62, 0.8, low) * smoothstep(0.93, 0.985, gN.y) * clamp(earth + 0.35, 0.0, 1.0);
      base *= 1.0 - uWet * (0.22 + 0.2 * earth);
      base = mix(base, base * 0.45, puddle); hkTilt *= 1.0 - puddle; hkRough = mix(hkRough - uWet * 0.3, 0.04, puddle);
    }
    // snow: lies thick on open ground, thinner under trees and in wheel ruts; tall stubble, clods and grass tips show through
    if (uSnow > 0.0) {
      float cover = uSnow * (0.9 + 0.5 * n2) + (0.45 - hgt) * 0.5 - rut * 0.5 - wFor * 0.35 - (aF * sin(phF) + gap) * 0.12;
      cover = clamp(cover, 0.0, 1.0) * smoothstep(0.55, 0.8, gN.y);
      base = mix(base, vec3(0.83, 0.86, 0.91) * (0.93 + 0.07 * n3), cover); hkTilt *= 1.0 - 0.75 * cover; hkRough = mix(hkRough, 0.82, cover);
    }
    diffuseColor.rgb = base;
  }
`;

export function buildTerrain(world, opt = {}) {
  const n = world.n, geo = new THREE.PlaneGeometry(world.size, world.size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  // PlaneGeometry rows run from -z (north) to +z (south); world rows run from south (j = 0) to north
  for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) pos.setY(r * n + i, world.H[(n - 1 - r) * n + i]);
  geo.computeVertexNormals();
  const maps = bakeGroundMaps(world), G = GROUND[world.biomeKey] || GROUND.farmland, det = groundDetail(world.biomeKey), fg = world.fieldGrid || { cs: 1, sn: 0 };
  const tex = { col: mapTexture(maps.col, maps.size, true), c1: mapTexture(maps.c1, maps.size), c2: mapTexture(maps.c2, maps.size) };
  const lin = h => new THREE.Color(h);   /* THREE.Color turns the written colour into the linear value the shader works in */
  const U = {
    hkCol: { value: tex.col }, hkC1: { value: tex.c1 }, hkC2: { value: tex.c2 }, hkDet: { value: det.det }, hkNrm: { value: det.nrm }, hkMean: { value: det.means },
    hkGrid: { value: new THREE.Vector4(fg.cs, fg.sn, world.half, world.size) }, hkRoad: { value: lin(G.road) }, hkRock: { value: lin(G.rock) }, hkSoil: { value: lin(G.soil) }, hkAsphalt: { value: G.asphalt },
    uSnow: ENV.snow, uWet: ENV.wet,
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  mat.defines = { HK_DETAIL: opt.detail == null ? 2 : opt.detail };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <map_fragment>', BODY)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(hkRough, 0.03, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + mat3(viewMatrix) * vec3(hkTilt.x, 0.0, hkTilt.y));');
  };
  mat.customProgramCacheKey = () => 'hkground';
  atmosphere(mat);
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.name = 'terrain';
  // beyond the edge of the map the ground carries on, flat and hazy, so the horizon is never a cliff
  { const R = world.half, far = R * 4.5, p = [], idx = [], N = n - 1, yFar = world.H.reduce((a, b) => a + b, 0) / world.H.length;
    const edge = [];
    for (let i = 0; i <= N; i++) edge.push([-R + i * world.cell, world.H[(n - 1) * n + i], -R]);            /* north edge, west to east */
    for (let j = 1; j <= N; j++) edge.push([R, world.H[(n - 1 - j) * n + N], -R + j * world.cell]);        /* east edge, north to south */
    for (let i = 1; i <= N; i++) edge.push([R - i * world.cell, world.H[N - i], R]);                        /* south edge, east to west */
    for (let j = 1; j < N; j++) edge.push([-R, world.H[j * n], R - j * world.cell]);                        /* west edge, south to north */
    for (const [x, y, z] of edge) { const k = far / Math.max(Math.abs(x), Math.abs(z)); p.push(x, y, z, x * k, yFar, z * k); }
    const E = edge.length; for (let q = 0; q < E; q++) { const a = q * 2, b = ((q + 1) % E) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); ag.setIndex(idx); ag.computeVertexNormals();
    const nrm = ag.attributes.normal; for (let q = 0; q < nrm.count; q++) nrm.setXYZ(q, 0, 1, 0);
    const apron = new THREE.Mesh(ag, mat); apron.name = 'apron'; apron.receiveShadow = false; mesh.add(apron); }
  return {
    mesh, maps, tex, map: tex.col,
    // 0 = plain colour only (weak machines), 1 = close-up surfaces, 2 = close-up surfaces with relief
    setDetail(level) { if (mat.defines.HK_DETAIL !== level) { mat.defines.HK_DETAIL = level; mat.needsUpdate = true; } },
    dispose() { geo.dispose(); mesh.children.forEach(c => c.geometry.dispose()); mat.dispose(); tex.col.dispose(); tex.c1.dispose(); tex.c2.dispose(); },
  };
}
