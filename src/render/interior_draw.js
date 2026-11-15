// The drawing tools of the hit effects inside the vehicle: three pooled instanced meshes, one draw call each.
//   Decals: flat marks on the walls, floor and seats (holes, scorch, daylight through a hole, blood pools that grow, spatter, cracks)
//   Puffs: soft camera-facing particles, lit ones (smoke, dust, Halon, mist, spray) and glowing ones (fire, flash, arcs, light shafts)
//   Bits: small solid glowing boxes (spall fragments, sparks, the jet's streak)
// All three are refilled every frame from plain functions of the battle clock (no particle keeps a state of its own), so a replay, a
// rewind or any frame rate gives the same picture. Their pictures are made in code (one 1024 x 1024 sheet of 16 marks, filled by
// arithmetic, no canvas and no file: the hosting page allows no data: or blob: fetches and the node tests have no canvas).
// They are drawn with the interior's own depth rule (see interior_parts.js DEPTH_VS: from a seat the interior sits in the nearest
// fiftieth of the depth range) and lit by the interior's own lamps, so a mark in a dark turret is dark.
import * as THREE from 'three';
import { SHARED, NLAMP } from './interior_parts.js';

const DEPTH = /* glsl */`
  uniform float uInside;
  void cabDepth(in vec4 mv) { gl_Position = projectionMatrix * mv; if (uInside > 0.5) { float zv = -mv.z; const float NI = 0.03; const float FI = 40.0; const float E = 0.02; gl_Position.z = -zv + 2.0 * E * (zv - NI) * FI / (FI - NI); } }`;
const LAMPS = /* glsl */`
  uniform vec3 uLampPos[${NLAMP}]; uniform vec3 uLampCol[${NLAMP}]; uniform float uLampR[${NLAMP}]; uniform vec3 uAmb;
  vec3 lampLight(vec3 w, vec3 n, float wrapK) { vec3 dif = uAmb; for (int i = 0; i < ${NLAMP}; i++) { vec3 L = uLampPos[i] - w; float d = length(L); L /= max(d, 1e-3); float r = d / uLampR[i]; float att = 1.0 / (1.0 + 6.0 * r * r) * clamp(1.6 - r * 0.8, 0.0, 1.0); dif += uLampCol[i] * att * clamp(dot(n, L) * (1.0 - wrapK) + wrapK, 0.0, 1.0); } return dif; }`;
const END = `\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n`;

// ---- the sheet of marks -------------------------------------------------------------------------------------------------------
export const CELL = { pool: 0, spatter: 1, runs: 2, soak: 3, scorch: 4, hole: 5, day: 6, crater: 7, crack: 8, soot: 9, seam: 10, chips: 11, drops: 12, smear: 13, char: 14, fluid: 15 };
const N = 1024, C = 256;
const h2 = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const vn = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (h2(xi, yi, s) * (1 - u) + h2(xi + 1, yi, s) * u) * (1 - v) + (h2(xi, yi + 1, s) * (1 - u) + h2(xi + 1, yi + 1, s) * u) * v; };
const fbm = (x, y, s) => 0.5 * vn(x, y, s) + 0.27 * vn(x * 2.1, y * 2.1, s + 3) + 0.15 * vn(x * 4.3, y * 4.3, s + 7) + 0.08 * vn(x * 8.7, y * 8.7, s + 11);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v), sm = (a, b, v) => { v = sat((v - a) / (b - a)); return v * v * (3 - 2 * v); };
let _sheet = null;
export function markSheet() {
  if (_sheet) return _sheet;
  const D = new Uint8Array(N * N * 4);
  const put = (cell, f) => { const ox = (cell % 4) * C, oy = (cell >> 2) * C, o = [0, 0, 0, 0]; for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) { const x = (i + 0.5) / C - 0.5, y = (j + 0.5) / C - 0.5; o[0] = o[1] = o[2] = o[3] = 0; f(x, y, Math.hypot(x, y), Math.atan2(y, x), o);
    const edge = Math.min(i, j, C - 1 - i, C - 1 - j) < 2 ? 0 : 1, k = ((oy + j) * N + ox + i) * 4; D[k] = sat(o[0]) * 255; D[k + 1] = sat(o[1]) * 255; D[k + 2] = sat(o[2]) * 255; D[k + 3] = sat(o[3]) * 255 * edge; } };
  // drops laid into a cell: [x, y, rx, ry, turn, strength]
  // drops laid into a cell: [x, y, rx, ry, turn, strength], drawn once into a small field that the cell then reads
  const F = new Float32Array(C * C), at = (x, y) => F[Math.min(C - 1, Math.max(0, Math.floor((y + 0.5) * C))) * C + Math.min(C - 1, Math.max(0, Math.floor((x + 0.5) * C)))];
  const drops = (seed, n, gen) => { F.fill(0); let s = seed; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) { const d = gen(R, i), ext = Math.max(d[2], d[3]), c = Math.cos(d[4]), sn = Math.sin(d[4]), i0 = Math.max(0, Math.floor((d[0] - ext + 0.5) * C)), i1 = Math.min(C - 1, Math.ceil((d[0] + ext + 0.5) * C)), j0 = Math.max(0, Math.floor((d[1] - ext + 0.5) * C)), j1 = Math.min(C - 1, Math.ceil((d[1] + ext + 0.5) * C));
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) { const dx = (k + 0.5) / C - 0.5 - d[0], dy = (j + 0.5) / C - 0.5 - d[1], u = (dx * c + dy * sn) / d[2], v = (-dx * sn + dy * c) / d[3], q = u * u + v * v; if (q < 1) { const a = d[5] * sm(1, 0.55, q); if (a > F[j * C + k]) F[j * C + k] = a; } } }
    return at; };
  // lines laid into a cell the same way: the field holds how near each point is to a line (1 on it, 0 from `w` away)
  const lines = (L, w) => { F.fill(0); for (const q of L) { const i0 = Math.max(0, Math.floor((Math.min(q[0], q[2]) - w + 0.5) * C)), i1 = Math.min(C - 1, Math.ceil((Math.max(q[0], q[2]) + w + 0.5) * C)), j0 = Math.max(0, Math.floor((Math.min(q[1], q[3]) - w + 0.5) * C)), j1 = Math.min(C - 1, Math.ceil((Math.max(q[1], q[3]) + w + 0.5) * C)), vx = q[2] - q[0], vy = q[3] - q[1], vv = vx * vx + vy * vy || 1e-9;
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) { const x = (k + 0.5) / C - 0.5, y = (j + 0.5) / C - 0.5, t = sat(((x - q[0]) * vx + (y - q[1]) * vy) / vv), d = Math.hypot(x - q[0] - vx * t, y - q[1] - vy * t), a = sm(w, w * 0.27, d); if (a > F[j * C + k]) F[j * C + k] = a; } } return at; };
  const blood = (o, a, dark) => { o[0] = 0.33 - 0.14 * dark; o[1] = 0.012; o[2] = 0.012; o[3] = a; };
  // 0 pool: its alpha is WHEN each point is reached (centre first), so the same mark can be shown growing
  put(0, (x, y, r, a, o) => { const R = 0.44 * (0.72 + 0.4 * fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, 1)), k = 1 - r / R; if (k > 0) blood(o, 0.06 + 0.94 * k, sat(k * 1.4)); });
  { const f = drops(11, 150, (R, i) => { const a = (R() - 0.5) * 1.5, d = Math.pow(R(), 0.7) * 0.86, big = i < 16; return [-0.45 + Math.cos(a) * d, Math.sin(a) * d * 0.9, (big ? 0.02 + R() * 0.03 : 0.004 + R() * 0.012) * (1 + d * 2.2), big ? 0.012 + R() * 0.016 : 0.003 + R() * 0.007, a, 0.75 + R() * 0.25]; });
    put(1, (x, y, r, a, o) => { const v = f(x, y); if (v > 0.02) blood(o, v, 0.4); }); }
  { const f = drops(23, 9, (R, i) => { const len = 0.12 + R() * 0.5; return [(i - 4) * 0.085 + (R() - 0.5) * 0.03, -0.32 + len / 2, 0.008 + R() * 0.012, len / 2, 0, 1]; });
    put(2, (x, y, r, a, o) => { const top = sm(0.2, 0.0, Math.hypot(x * 0.8, (y + 0.36) * 2.2)) * (0.6 + 0.6 * fbm(x * 9 + 2, y * 9, 4)), run = f(x, y), v = Math.max(top > 0.3 ? 1 : 0, run > 0.25 ? 1 : 0); if (v) blood(o, sat(1.0 - (y + 0.42) * 1.05), 0.5); }); }
  put(3, (x, y, r, a, o) => { const k = fbm(x * 5 + 9, y * 5 + 2, 9) * 1.5 - 0.42 - r * 1.25; if (k > 0) blood(o, sat(0.08 + k * 2.6), sat(k * 3)); });
  put(4, (x, y, r, a, o) => { const k = Math.pow(sat(1 - r / 0.5), 1.6) * (0.55 + 0.75 * fbm(Math.cos(a) * 3 + 4, Math.sin(a) * 3 + 4 + r * 2, 13)); o[0] = 0.03; o[1] = 0.027; o[2] = 0.024; o[3] = sat(k * 1.5); });
  const lip = a => 0.085 * (0.7 + 0.75 * fbm(Math.cos(a) * 2.2 + 7, Math.sin(a) * 2.2 + 7, 17));
  put(5, (x, y, r, a, o) => { const r0 = lip(a), petal = 0.55 + 0.45 * Math.sin(a * 7 + fbm(x * 8, y * 8, 2) * 5);
    if (r < r0) { o[3] = 1; } else if (r < r0 + 0.035 * petal + 0.012) { const g = 0.32 + 0.4 * fbm(x * 30, y * 30, 21); o[0] = g; o[1] = g * 0.96; o[2] = g * 0.9; o[3] = 1; } else { const k = Math.pow(sat(1 - (r - r0) / 0.4), 2.2) * (0.6 + 0.7 * fbm(Math.cos(a) * 4, Math.sin(a) * 4 + r * 3, 5)); o[0] = o[1] = o[2] = 0.03; o[3] = sat(k * 1.4); } });
  put(6, (x, y, r, a, o) => { const r0 = lip(a) * 0.92; o[0] = 1; o[1] = 0.97; o[2] = 0.9; o[3] = sm(r0, r0 - 0.014, r); });
  put(7, (x, y, r, a, o) => { const r0 = 0.07 * (0.7 + 0.7 * fbm(Math.cos(a) * 2 + 1, Math.sin(a) * 2 + 1, 31)), ring = sm(r0 + 0.11, r0, r) * sm(r0 * 0.5, r0, r); o[0] = 1; o[1] = 0.42 + 0.3 * ring; o[2] = 0.08; o[3] = sat(ring * (0.6 + 0.6 * fbm(x * 14, y * 14, 3))); if (r < r0 * 0.7) { o[0] = 0.02; o[1] = 0.02; o[2] = 0.02; o[3] = 1; } });
  { const L = []; let s = 41; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; for (let i = 0; i < 13; i++) { let a = i / 13 * 6.283 + R() * 0.3, px = 0.06 * (R() - 0.5), py = 0.06 * (R() - 0.5); const n = 5 + (R() * 4 | 0); for (let k = 0; k < n; k++) { const l = 0.04 + R() * 0.08, qx = px + Math.cos(a) * l, qy = py + Math.sin(a) * l; L.push([px, py, qx, qy]); px = qx; py = qy; a += (R() - 0.5) * 0.7; } }
    for (let i = 0; i < 16; i++) { const a = R() * 6.283, rr = 0.07 + R() * 0.3, b = a + 0.25 + R() * 0.5; L.push([Math.cos(a) * rr, Math.sin(a) * rr, Math.cos(b) * rr * (0.9 + R() * 0.2), Math.sin(b) * rr]); }
    const f = lines(L, 0.0045); put(8, (x, y, r, a, o) => { const k = f(x, y) + 0.9 * sm(0.07, 0.0, r); o[0] = 0.82; o[1] = 0.9; o[2] = 0.86; o[3] = sat(k) * 0.92; }); }
  put(9, (x, y, r, a, o) => { const w = 0.16 + (0.5 - y) * 0.22, k = sm(w, w * 0.2, Math.abs(x + 0.05 * Math.sin(y * 9))) * sm(-0.5, -0.3, y) * sm(0.52, 0.1, y) * (0.5 + 0.8 * fbm(x * 6, y * 3, 51)); o[0] = o[1] = o[2] = 0.025; o[3] = sat(k * 1.2); });
  put(10, (x, y, r, a, o) => { const d = Math.min(Math.abs(Math.abs(x) - 0.46), Math.abs(Math.abs(y) - 0.46), Math.abs(x)), k = sm(0.03, 0.0, d) * (0.5 + 0.8 * fbm(x * 10, y * 10, 61)); o[0] = 1; o[1] = 0.72; o[2] = 0.36; o[3] = sat(k); });
  put(11, (x, y, r, a, o) => { const k = fbm(x * 16 + 3, y * 16 + 8, 71) - 0.5 - r * 0.5; if (k > 0) { const g = 0.4 + 0.3 * vn(x * 60, y * 60, 2); o[0] = g; o[1] = g * 0.98; o[2] = g * 0.93; o[3] = sat(k * 14); } });
  { const f = drops(83, 46, (R, i) => { const a = R() * 6.283, d = Math.pow(R(), 0.6) * 0.44, rr = 0.006 + R() * R() * 0.035; return [Math.cos(a) * d, Math.sin(a) * d, rr, rr * (0.8 + R() * 0.4), a, 1]; });
    put(12, (x, y, r, a, o) => { const v = f(x, y); if (v > 0.02) blood(o, v * sat(1.15 - r * 1.6), 0.5); }); }
  put(13, (x, y, r, a, o) => { const k = sm(0.2, 0.02, Math.abs(y + 0.07 * Math.sin(x * 7))) * sm(-0.5, -0.36, x) * sm(0.5, 0.1, x) * (0.25 + 0.95 * fbm(x * 3, y * 26, 91)); if (k > 0.2) blood(o, sat(0.25 + k * 0.8 - (x + 0.5) * 0.3), 0.3); });
  put(14, (x, y, r, a, o) => { const k = fbm(x * 6 + 4, y * 6 + 1, 101) * 1.5 - 0.45 - r * 1.3, cr = sm(0.035, 0.0, Math.abs(fbm(x * 11, y * 11, 113) - 0.5)); if (k > 0) { o[0] = 0.03 + 0.9 * cr; o[1] = 0.025 + 0.3 * cr; o[2] = 0.02; o[3] = sat(k * 4); } });
  put(15, (x, y, r, a, o) => { const R = 0.44 * (0.7 + 0.45 * fbm(Math.cos(a) * 1.3 + 2, Math.sin(a) * 1.3 + 9, 121)), k = 1 - r / R; if (k > 0) { o[0] = o[1] = o[2] = 1; o[3] = 0.06 + 0.94 * k; } });
  const t = new THREE.DataTexture(D, N, N, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; _sheet = t; return t;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _v = new THREE.Vector3();
const inst = (geo, name, size, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };

// ---- flat marks -------------------------------------------------------------------------------------------------------------
export class Decals {
  constructor(parent, n = 96) {
    this.n = n; this.count = 0; const g = new THREE.PlaneGeometry(1, 1); this.aA = inst(g, 'aA', 4, n); this.aB = inst(g, 'aB', 4, n);
    const mat = this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uInside: SHARED.uInside, uExpo: SHARED.uExpo, uLampPos: SHARED.uLampPos, uLampCol: SHARED.uLampCol, uLampR: SHARED.uLampR, uAmb: SHARED.uAmb, uClip: SHARED.uClip, uClipOn: SHARED.uClipOn, uSheet: { value: markSheet() } },
      vertexShader: `attribute vec4 aA; attribute vec4 aB; varying vec2 vUv; varying vec4 vA; varying vec4 vB; varying vec3 vW; varying vec3 vN; ${DEPTH}
        void main() { vec4 p = instanceMatrix * vec4(position, 1.0); float c = floor(aA.x + 0.5); vUv = (vec2(mod(c, 4.0), floor(c / 4.0)) + clamp(uv, 0.012, 0.988)) * 0.25; vA = aA; vB = aB; vec4 w = modelMatrix * p; vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0)); cabDepth(viewMatrix * w); }`,
      fragmentShader: `uniform sampler2D uSheet; uniform float uExpo; uniform vec4 uClip; uniform float uClipOn; varying vec2 vUv; varying vec4 vA; varying vec4 vB; varying vec3 vW; varying vec3 vN; ${LAMPS}
        void main() { if (uClipOn > 0.5 && dot(vW, uClip.xyz) + uClip.w > 0.0) discard; vec4 t = texture2D(uSheet, vUv); float th = 1.0 - vA.y; float a = smoothstep(th, th + 0.07, t.a) * vA.w; if (a < 0.004) discard;
          vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW); vec3 alb = t.rgb * vB.rgb; vec3 lit = lampLight(vW, n, 0.3); vec3 col = alb * lit;
          col += vB.a * pow(max(dot(n, normalize(v + vec3(0.0, 1.0, 0.0))), 0.0), 26.0) * lit * 0.5;   /* wet shine */
          col += t.rgb * vB.rgb * vA.z;                                                                 /* its own light: daylight through a hole, hot metal */
          gl_FragColor = vec4(col * uExpo, a); ${END} }` });
    const m = this.mesh = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.renderOrder = 6; m.count = 0; m.userData.cabFx = true; parent.add(m);
  }
  begin() { this.count = 0; }
  // M: turns the frame's coordinates into the mesh's own (null: they are the same). pos, nrm: arrays. size (m), cell, grow 0..1 (how
  // much of the mark has arrived), glow, alpha, tint [r, g, b], wet 0..1, turn (radians about the normal), sy (height / width)
  add(M, pos, nrm, size, cell, grow, glow, alpha, tint, wet = 0, turn = 0, sy = 1, lift = 0.004) {
    if (this.count >= this.n || alpha <= 0.003 || grow <= 0.003) return; const i = this.count++;
    _n.set(nrm[0], nrm[1], nrm[2]); _p.set(pos[0] + nrm[0] * lift, pos[1] + nrm[1] * lift, pos[2] + nrm[2] * lift); _q.setFromUnitVectors(_z, _n); if (turn) _q.multiply(_q2.setFromAxisAngle(_z, turn)); _s.set(size, size * sy, 1); _m.compose(_p, _q, _s); if (M) _m.premultiply(M);
    this.mesh.setMatrixAt(i, _m); this.aA.setXYZW(i, cell, grow, glow, alpha); this.aB.setXYZW(i, tint[0], tint[1], tint[2], wet);
  }
  end(show) { const m = this.mesh; m.count = show ? this.count : 0; m.visible = m.count > 0; if (m.count) { m.instanceMatrix.needsUpdate = true; this.aA.needsUpdate = true; this.aB.needsUpdate = true; } }
}

// ---- soft particles -----------------------------------------------------------------------------------------------------------
export class Puffs {
  constructor(parent, n = 360, glow = false) {
    this.n = n; this.count = 0; this.glow = glow; const g = new THREE.PlaneGeometry(1, 1); this.aP = inst(g, 'aP', 4, n); this.aC = inst(g, 'aC', 4, n); this.aK = inst(g, 'aK', 4, n);
    const mat = this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uInside: SHARED.uInside, uExpo: SHARED.uExpo, uLampPos: SHARED.uLampPos, uLampCol: SHARED.uLampCol, uLampR: SHARED.uLampR, uAmb: SHARED.uAmb },
      vertexShader: `attribute vec4 aP; attribute vec4 aC; attribute vec4 aK; varying vec2 vUv; varying vec4 vC; varying vec2 vK; ${DEPTH} ${LAMPS}
        void main() { vec4 w = modelMatrix * vec4(aP.xyz, 1.0); vec4 mv = viewMatrix * w; float c = cos(aK.x), s = sin(aK.x); vec2 q = position.xy * vec2(1.0, aK.y) * aP.w; mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
          vUv = uv; vK = aK.zw; vC = aC; ${glow ? '' : 'vC.rgb *= min(lampLight(w.xyz, vec3(0.0, 1.0, 0.0), 1.0) * 1.7, vec3(1.6));'}
          float near = smoothstep(0.05, 0.3, -mv.z); vC.a *= near;   /* a puff right at the eye fades instead of filling the picture */
          cabDepth(mv); }`,
      fragmentShader: `uniform float uExpo; varying vec2 vUv; varying vec4 vC; varying vec2 vK;
        float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float nz(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main() { vec2 p = vUv - 0.5; float r = length(p) * 2.0; float n = nz(p * 5.0 + vK.x * 37.0) * 0.6 + nz(p * 11.0 - vK.x * 17.0) * 0.4;
          float a = smoothstep(1.0, mix(0.25, 0.85, vK.y), r + (n - 0.5) * 0.55 * (1.0 - vK.y)) * vC.a; if (a < 0.003) discard;
          gl_FragColor = vec4(vC.rgb * ${glow ? '(0.55 + 0.9 * n)' : '(0.8 + 0.4 * n)'} * uExpo, a); ${END} }` });
    const m = this.mesh = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.renderOrder = glow ? 9 : 8; m.count = 0; m.userData.cabFx = true; parent.add(m);
  }
  begin() { this.count = 0; }
  // M as in Decals.add; x, y, z in the frame; size (m); colour and alpha; turn; stretch (height / width); seed; hard 0..1 (1 = a sharp-edged disc)
  add(M, x, y, z, size, r, g, b, a, turn = 0, stretch = 1, seed = 0, hard = 0) {
    if (this.count >= this.n || a <= 0.003 || size <= 0) return; const i = this.count++; _v.set(x, y, z); if (M) _v.applyMatrix4(M);
    this.aP.setXYZW(i, _v.x, _v.y, _v.z, size); this.aC.setXYZW(i, r, g, b, a); this.aK.setXYZW(i, turn, stretch, seed, hard);
  }
  end(show) { const m = this.mesh; m.count = show ? this.count : 0; m.visible = m.count > 0; if (m.count) { this.aP.needsUpdate = true; this.aC.needsUpdate = true; this.aK.needsUpdate = true; } }
}

// ---- small glowing solids -----------------------------------------------------------------------------------------------------
export class Bits {
  constructor(parent, n = 160) {
    this.n = n; this.count = 0; const g = new THREE.BoxGeometry(1, 1, 1); this.aH = inst(g, 'aH', 4, n);
    const mat = this.mat = new THREE.ShaderMaterial({ uniforms: { uInside: SHARED.uInside, uExpo: SHARED.uExpo },
      vertexShader: `attribute vec4 aH; varying vec4 vH; ${DEPTH} void main() { vH = aH; cabDepth(modelViewMatrix * instanceMatrix * vec4(position, 1.0)); }`,
      fragmentShader: `uniform float uExpo; varying vec4 vH; void main() { gl_FragColor = vec4(vH.rgb * vH.a * uExpo, 1.0); ${END} }` });
    const m = this.mesh = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.count = 0; m.userData.cabFx = true; parent.add(m);
  }
  begin() { this.count = 0; }
  // a box at p (frame coordinates, a THREE.Vector3 that is not kept), its long side along dir (a unit THREE.Vector3), thick x long, colour x heat
  add(M, p, dir, thick, long, r, g, b, heat) {
    if (this.count >= this.n || heat <= 0.003) return; const i = this.count++; _q.setFromUnitVectors(_z, dir); _s.set(thick, thick, long); _m.compose(p, _q, _s); if (M) _m.premultiply(M);
    this.mesh.setMatrixAt(i, _m); this.aH.setXYZW(i, r, g, b, heat);
  }
  end(show) { const m = this.mesh; m.count = show ? this.count : 0; m.visible = m.count > 0; if (m.count) { m.instanceMatrix.needsUpdate = true; this.aH.needsUpdate = true; } }
}
