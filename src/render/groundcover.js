// Ground cover near the camera: grass tufts, crop stalks, tall maize and woodland undergrowth, as tens of thousands of small
// crossed cards. They live in one square patch that slides along with the view and wraps around, so nothing is moved on the
// processor: the graphics card works out, for each tuft, where it stands, how high the ground is there, what grows there
// (from the same map pictures the ground uses) and how the wind bends it. Off at the Minimum setting, light at Low.
//
// Honest heights: low crops stand 0.55 to 0.9 m, tall crops about 1.9 m, as the battle model assumes for cover. A small patch
// is shown trodden flat around every vehicle and team so that they can be seen from close by.
import * as THREE from 'three';
import { ENV, atmosphere } from './env.js';
import { ROAD_RANGE } from './terrain.js';

const MAX = 72000, MAX_CLEAR = 16;
// level: [number of tufts, radius of the patch in metres]
const LEVELS = { 0: [0, 0], 1: [14000, 26], 2: [36000, 38], 3: [72000, 48] };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const grey = (l, a = 1) => `hsla(72,14%,${Math.max(0, Math.min(100, l)).toFixed(0)}%,${a})`;

// Four pictures on one sheet, painted pale and nearly colourless: the ground's own colour is laid over them, so grass matches
// the meadow it stands in and wheat matches its field. 0 grass tuft, 1 cereal stalks with ears, 2 maize, 3 fern and weeds.
let sheet = null;
function coverSheet() {
  if (sheet) return sheet;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S * 2; const c = cv.getContext('2d', { willReadFrequently: true });
  const cell = (k, f) => { c.save(); c.translate((k % 2) * S, Math.floor(k / 2) * S); c.beginPath(); c.rect(0, 0, S, S); c.clip(); f(rng(50 + k)); c.restore(); };
  // a blade: a curve from its foot that thins to a point
  const blade = (x0, lean, len, w, lum) => {
    const x1 = x0 + lean * len * 0.45, y1 = S - len * 0.6, x2 = x0 + lean * len, y2 = S - len;
    c.fillStyle = grey(lum); c.beginPath(); c.moveTo(x0 - w / 2, S); c.quadraticCurveTo(x1 - w / 3, y1, x2, y2); c.quadraticCurveTo(x1 + w / 3, y1, x0 + w / 2, S); c.fill();
  };
  cell(0, R => { for (let i = 0; i < 150; i++) { const f = i / 150; blade(S * (0.12 + R() * 0.76), (R() - 0.5) * 1.2, S * (0.3 + R() * 0.65), S * (0.011 + R() * 0.012), 30 + f * 34 + R() * 12); } });
  cell(1, R => {
    for (let i = 0; i < 46; i++) { const f = i / 46, x0 = S * (0.1 + R() * 0.8), lean = (R() - 0.5) * 0.24, len = S * (0.74 + R() * 0.2), lum = 34 + f * 30 + R() * 10, x2 = x0 + lean * len, y2 = S - len;
      c.strokeStyle = grey(lum); c.lineWidth = S * 0.008; c.beginPath(); c.moveTo(x0, S); c.lineTo(x2, y2 + S * 0.08); c.stroke();
      blade(x0, (R() - 0.5) * 1.3, S * (0.3 + R() * 0.3), S * 0.018, lum - 6);
      c.fillStyle = grey(lum + 14); c.save(); c.translate(x2, y2 + S * 0.05); c.rotate(lean * 1.5); c.beginPath(); c.ellipse(0, 0, S * 0.014, S * 0.055, 0, 0, 6.2832); c.fill();   /* the ear */
      c.strokeStyle = grey(lum + 18, 0.8); c.lineWidth = 1; for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(0, k * S * 0.012); c.lineTo(k < 0 ? -S * 0.03 : S * 0.03, k * S * 0.012 - S * 0.035); c.stroke(); } c.restore(); }
  });
  cell(2, R => {
    for (let q = 0; q < 3; q++) { const x0 = S * (0.25 + q * 0.25 + (R() - 0.5) * 0.08), top = S * (0.04 + R() * 0.1), lum = 40 + R() * 12;
      c.strokeStyle = grey(lum); c.lineWidth = S * 0.016; c.beginPath(); c.moveTo(x0, S); c.lineTo(x0 + (R() - 0.5) * 10, top + S * 0.06); c.stroke();
      for (let k = 0; k < 9; k++) { const y = S - S * (0.12 + k * 0.09 + R() * 0.03), side = k % 2 ? 1 : -1, len = S * (0.2 + R() * 0.1), w = S * (0.03 + R() * 0.012);   /* long arching leaves */
        c.fillStyle = grey(lum - 8 + k * 2.5 + R() * 8); c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(x0 + side * len * 0.55, y - len * 0.55 - w, x0 + side * len, y + len * 0.12); c.quadraticCurveTo(x0 + side * len * 0.5, y - len * 0.3 + w, x0, y + w * 0.6); c.fill(); }
      c.strokeStyle = grey(lum + 20); c.lineWidth = 2; for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(x0, top + S * 0.07); c.lineTo(x0 + (k - 3) * S * 0.014, top + R() * S * 0.02); c.stroke(); } }   /* the tassel */
  });
  cell(3, R => {
    for (let q = 0; q < 9; q++) { const x0 = S * (0.38 + R() * 0.24), lean = (q - 4) / 4 * 0.9 + (R() - 0.5) * 0.2, len = S * (0.5 + R() * 0.42), lum = 30 + R() * 26;
      for (let k = 2; k < 22; k++) { const t = k / 22, bx = x0 + lean * len * t * (0.6 + 0.4 * t), by = S - len * t * (1 - 0.25 * t * Math.abs(lean)), l = len * 0.16 * Math.sin(t * 2.6 + 0.4);
        c.strokeStyle = grey(lum + t * 16); c.lineWidth = S * 0.012; c.lineCap = 'round'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + s * l * Math.cos(lean), by - l * 0.35 + s * l * Math.sin(lean) * 0.6); c.stroke(); } }
      c.strokeStyle = grey(lum - 6); c.lineWidth = S * 0.007; c.beginPath(); c.moveTo(x0, S); c.quadraticCurveTo(x0 + lean * len * 0.3, S - len * 0.6, x0 + lean * len, S - len * (1 - 0.25 * Math.abs(lean))); c.stroke(); }
  });
  // clear pixels take the picture's own tone so the cut-out edge has no dark rim
  const W = S * 2, im = c.getImageData(0, 0, W, W), d = im.data;
  for (let o = 0; o < d.length; o += 4) { const f = d[o + 3] / 255; d[o] = d[o] * f + 118 * (1 - f); d[o + 1] = d[o + 1] * f + 122 * (1 - f); d[o + 2] = d[o + 2] * f + 104 * (1 - f); }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer), W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  sheet = t; return t;
}

const VERT_PARS = /* glsl */`
  attribute vec4 aSeed;
  uniform highp sampler2D hkHeight; uniform sampler2D hkCol; uniform sampler2D hkC1; uniform sampler2D hkC2;
  uniform vec4 hkGrid; uniform vec2 hkCellN; uniform vec2 hkCentre; uniform vec3 hkPatch; uniform float hkTime; uniform vec3 hkWind; uniform float uSnow; uniform float uWet; uniform float hkDry;
  uniform vec3 hkClear[${MAX_CLEAR}];
  varying vec3 vTint; varying vec3 vWp; varying float vUp;
  float hkGround(vec2 xz){
    vec2 g = clamp(vec2(xz.x + hkGrid.z, -xz.y + hkGrid.z) / hkCellN.x, vec2(0.0), vec2(hkCellN.y - 1.001)); ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
    float a = texelFetch(hkHeight, i, 0).r, b = texelFetch(hkHeight, i + ivec2(1, 0), 0).r, c = texelFetch(hkHeight, i + ivec2(0, 1), 0).r, d = texelFetch(hkHeight, i + ivec2(1, 1), 0).r;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
`;
const VERT_BODY = /* glsl */`
  vec3 transformed;
  {
    float T = hkPatch.x, R = hkPatch.y;
    vec2 base = aSeed.xy * T, wxz = base + floor((hkCentre - base) / T + 0.5) * T;
    vec2 wuv = (wxz + hkGrid.z) / hkGrid.w;
    vec4 mc = textureLod(hkCol, wuv, 0.0), c1 = textureLod(hkC1, wuv, 0.0), c2 = textureLod(hkC2, wuv, 0.0);
    float low = step(0.5, c1.g), tall = step(0.5, c1.b), wood = step(0.5, c2.r), rd = c2.a * ${ROAD_RANGE.toFixed(1)};
    // crops stand in their rows (the same rows the ground shows)
    float fe = wxz.x, fn = -wxz.y; vec2 fxz = vec2(fe * hkGrid.x + fn * hkGrid.y, -fe * hkGrid.y + fn * hkGrid.x);
    float across = step(0.5, c1.a), rc = mix(fxz.y, fxz.x, across), sp = mix(0.5, 0.76, tall), snap = (floor(rc / sp) + 0.25) * sp - rc;
    vec2 rdir = mix(vec2(-hkGrid.y, -hkGrid.x), vec2(hkGrid.x, -hkGrid.y), across);
    float crop = max(low, tall); wxz += rdir * snap * crop;
    // what grows here, how thick and how tall
    float open = clamp(1.0 - c1.r * 1.6 - c2.b * 0.75, 0.0, 1.0);
    float thick = mix(mix(open * hkDry, 0.38, wood), 1.0, crop) * (1.0 - 0.8 * uSnow);   /* under snow only scattered stalks still show */
    float tram = abs(mod(rc + 4.0, 21.0) - 10.5);
    float there = step(aSeed.z, thick) * smoothstep(2.9, 3.6, rd) * (1.0 - crop * step(abs(tram - 0.9), 0.3));
    float h = mix(mix(0.14 + 0.24 * aSeed.w + 0.25 * c2.g, 0.35 + 0.3 * aSeed.w, wood), mix(0.55 + 0.35 * aSeed.w, 1.75 + 0.35 * aSeed.w, tall), crop);
    float w = mix(mix(0.75, 0.9, wood), mix(0.6, 1.0, tall), crop);
    float kind = mix(mix(0.0, 3.0, wood), mix(1.0, 2.0, tall), crop);
    // fade out at the rim of the patch, and where something stands on it
    float edge = 1.0 - smoothstep(R * 0.62, R, distance(wxz, hkCentre));
    float trod = 1.0; for (int i = 0; i < ${MAX_CLEAR}; i++) { vec3 q = hkClear[i]; float r = max(q.z, 0.01); trod *= mix(1.0, smoothstep(r * 0.55, r, distance(wxz, q.xy)), step(0.0, q.z)); }
    float sc = there * edge * hkPatch.z * (0.25 + 0.75 * trod) * (1.0 - 0.3 * uSnow * (1.0 - crop));
    h *= sc * mix(1.0, 0.18, 1.0 - trod) * (1.0 - 0.45 * uSnow * crop); w *= step(0.02, sc);
    float ang = aSeed.w * 39.0 + aSeed.z * 11.0, ca = cos(ang), sa = sin(ang);
    vec3 lp = vec3(position.x * ca * w - position.z * sa * w, position.y * h, position.x * sa * w + position.z * ca * w);
    float gy = hkGround(wxz) - 0.04;
    // wind: tips lean and shiver, in waves that cross the field
    float ph = dot(wxz, vec2(0.21, 0.17)), sway = sin(hkTime * 1.9 + ph) * 0.6 + sin(hkTime * 3.3 + ph * 2.3) * 0.4;
    float tip = position.y * position.y * h * (0.10 + 0.07 * sway) * hkWind.y;
    lp.xz += vec2(hkWind.x, hkWind.z) * tip;
    transformed = vec3(wxz.x + lp.x, gy + lp.y, wxz.y + lp.z);
    vTint = mc.rgb * (0.8 + 0.5 * aSeed.z) * mix(0.6, 1.12, position.y) * (1.0 - 0.3 * uWet);
    vTint = mix(vTint, vec3(dot(vTint, vec3(0.4, 0.5, 0.1))) * vec3(1.25, 1.0, 0.62), 0.8 * uSnow);   /* winter: what still stands is dead and straw-coloured */
    vUp = position.y; vWp = transformed;
    vMapUv = (uv * 0.96 + 0.02 + vec2(mod(kind, 2.0), floor(kind / 2.0))) * 0.5; vMapUv.y = (floor(kind / 2.0) + 1.0 - (uv.y * 0.96 + 0.02)) * 0.5;
  }
`;

export class GroundCover {
  constructor() {
    const R = rng(4242), seed = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX * 4; i++) seed[i] = R();
    const g = new THREE.InstancedBufferGeometry();
    // two crossed upright cards, one unit wide and one tall
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = 0;
    this.uniforms = {
      hkHeight: { value: null }, hkCol: { value: null }, hkC1: { value: null }, hkC2: { value: null }, hkGrid: { value: new THREE.Vector4(1, 0, 4000, 8000) }, hkCellN: { value: new THREE.Vector2(15.6, 513) },
      hkCentre: { value: new THREE.Vector2() }, hkPatch: { value: new THREE.Vector3(90, 45, 1) }, hkTime: ENV.time, hkWind: ENV.wind, uSnow: ENV.snow, uWet: ENV.wet, hkDry: { value: 1 },
      hkClear: { value: Array.from({ length: MAX_CLEAR }, () => new THREE.Vector3(0, 0, -1)) },
    };
    const mat = new THREE.MeshStandardMaterial({ map: coverSheet(), alphaTest: 0.36, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    mat.alphaToCoverage = true;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')   /* lit like the ground it grows from, so it blends into it */
        .replace('#include <begin_vertex>', VERT_BODY);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying vec3 vWp; varying float vUp; uniform float uSnow;')
        .replace('#include <color_fragment>', `diffuseColor.rgb *= vTint * 2.4; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.87, 0.92), uSnow * smoothstep(0.35, 0.9, vUp) * 0.7);
          { vec2 tx = vMapUv * 1024.0; float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx))))); diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + 0.4 * lod)); }`)
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    };
    mat.customProgramCacheKey = () => 'hkcover';
    atmosphere(mat);
    this.material = mat;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.name = 'groundcover'; this.mesh.visible = false;
    this.level = 0; this._fwd = new THREE.Vector3();
  }
  // world: the battlefield; terrain: what buildTerrain returned (its map pictures are shared)
  setWorld(world, terrain) {
    const u = this.uniforms;
    if (u.hkHeight.value) u.hkHeight.value.dispose();
    const ht = new THREE.DataTexture(world.H, world.n, world.n, THREE.RedFormat, THREE.FloatType); ht.minFilter = ht.magFilter = THREE.NearestFilter; ht.generateMipmaps = false; ht.needsUpdate = true;
    u.hkHeight.value = ht; u.hkCol.value = terrain.tex.col; u.hkC1.value = terrain.tex.c1; u.hkC2.value = terrain.tex.c2;
    const fg = world.fieldGrid || { cs: 1, sn: 0 }; u.hkGrid.value.set(fg.cs, fg.sn, world.half, world.size); u.hkCellN.value.set(world.cell, world.n);
    u.hkDry.value = world.biomeKey === 'desert' ? 0.05 : 1; this.world = world;
  }
  setLevel(level) {
    const L = LEVELS[level] || LEVELS[0]; this.level = level; this.mesh.geometry.instanceCount = L[0]; this.uniforms.hkPatch.value.set(L[1] * 2, L[1], 1); this.mesh.visible = L[0] > 0;
  }
  // each frame: slide the patch to lie ahead of the camera, and note where vehicles and teams stand (they tread it flat)
  update(camera, units) {
    if (!this.mesh.visible && !this.level) return;
    const u = this.uniforms, R = u.hkPatch.value.y, f = camera.getWorldDirection(this._fwd), p = camera.position;
    u.hkCentre.value.set(p.x + f.x * R * 0.72, p.z + f.z * R * 0.72);
    // from high up the cover cannot be told from the ground's own texture: shrink it away rather than draw it for nothing
    const alt = this.world ? p.y - this.world.h(p.x, -p.z) : 0, k = 1 - Math.min(1, Math.max(0, (alt - 28) / 40));
    u.hkPatch.value.z = k; this.mesh.visible = this.level > 0 && k > 0;
    const C = u.hkClear.value; let n = 0;
    if (units) for (const o of units.children) { if (n >= MAX_CLEAR) break; if (!o.visible) continue; C[n++].set(o.position.x, o.position.z, (o.userData.heat || 0) >= 0.8 ? 2.6 : 5.5); }
    for (; n < MAX_CLEAR; n++) C[n].z = -1;
  }
}
