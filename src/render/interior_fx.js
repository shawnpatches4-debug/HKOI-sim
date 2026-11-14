// What a hit does to the inside of the vehicle: shake, flickering and failing lamps, glitching and dead displays, sparks and spall
// at the true entry point, smoke, fire, and blood where a crewman is wounded or killed.
//
// Everything here is worked out from the battle's own records and the battle clock, never from frame time, so a replay or a rewind shows
// the same damage at the same moments and the result is the same at any frame rate. The damage of each hit (plate struck, holed or not,
// where it came in and along which line, what it broke, who it hurt) is the legacy damage report, DMG.report(volley.rec, volley.cfg).
import * as THREE from 'three';
import { SHARED } from './interior_parts.js';

const hsh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
// which display each broken component takes with it
const SCREEN_OF = { gps: ['gps', 'gas', 'comp'], citv: ['citv'], hkoi: ['hkoi'], radar: ['hkoi'], tdrive: ['comp'], stab: ['comp'], engine: ['drv'], trans: ['drv'] };
export const PIVOT_Y = 1.617;   // height of the turret's turning point above the ground in the damage report's frame

// Every hit, Trophy shot and near miss of the battle so far, in time order. Rebuilt only when a new volley has been resolved.
// Each: { T (battle time), pen, kill, minor, s (strength), e (where it came in, hull frame of the interior), d (direction), comps, crew, idx }
export function hitList(battle) {
  if (battle.interiorHits) return battle.interiorHits;   /* the node test supplies its own */
  const V = battle.volleys || [], n = V.length, last = n ? V[n - 1] : null, key = n + ':' + (last && last.rec ? 1 : 0); if (battle._intHitKey === key && battle._intHits) return battle._intHits;
  const out = [], D = typeof DMG !== 'undefined' ? DMG : null;
  for (const v of V) { if (!v.rec) continue;
    if (D && v.cfg) { let rep = []; try { rep = D.report(v.rec, v.cfg); } catch (e) { rep = []; }
      for (const h of rep) { const comps = {}; for (const c of h.comps || []) comps[c.id] = c.state;
        out.push({ T: v.t0 + h.t, pen: !!h.penetrated, kill: !!h.killing, minor: false, s: h.killing ? 2 : h.penetrated ? 1.6 : 1, e: new THREE.Vector3(h.entry[0], h.entry[1] - PIVOT_Y, h.entry[2]), d: new THREE.Vector3(h.dir[0], h.dir[1], h.dir[2]).normalize(), comps, crew: h.crew || {}, idx: v.i * 100 + h.idx, zone: h.zoneName }); } }
    for (const a of v.rec.aps || []) out.push({ T: v.t0 + a.t, pen: false, kill: false, minor: true, s: 0.3, comps: {}, crew: {}, idx: v.i * 100 + 90 });   /* Trophy firing beside the hatch */
    for (const th of v.rec.threats || []) { const e = th.viz && th.viz.end; if (e && (e.type === 'miss' || e.type === 'ground')) out.push({ T: v.t0 + e.t, pen: false, kill: false, minor: true, s: 0.22, comps: {}, crew: {}, idx: v.i * 100 + 50 + th.idx }); } }
  out.sort((a, b) => a.T - b.T); battle._intHitKey = key; battle._intHits = out; return out;
}

// The state of the inside at battle time `now`, from the list of hits. A plain function: same inputs, same answer.
const ST = { shake: 0, flick: 0, glitch: 0, smoke: 0, dust: 0, flash: 0, fire: false, lightsOut: false, emergency: false, alarm: false, dark: {}, weak: {}, last: null, lastAge: 1e9, blood: {}, pulse: null };
export function fxState(hits, now) {
  const S = ST; S.shake = S.flick = S.glitch = S.smoke = S.dust = S.flash = 0; S.fire = S.lightsOut = S.emergency = S.alarm = false; S.dark = {}; S.weak = {}; S.last = null; S.lastAge = 1e9; S.blood = {}; S.pulse = null;
  for (const h of hits) { const age = now - h.T; if (age < 0) break;
    if (age < 5) S.shake += h.s * Math.exp(-2.2 * age);
    S.flick = Math.max(S.flick, (h.pen ? 2.2 : 0.55 * h.s) - age); S.glitch = Math.max(S.glitch, (h.pen ? 1.4 : 0.45 * h.s) - age);
    if (h.minor) { if (!S.pulse || h.T > S.pulse.t) S.pulse = { t: h.T, strength: h.s, penetrated: false }; continue; }
    S.pulse = { t: h.T, strength: h.s, penetrated: h.pen }; S.last = h; S.lastAge = age;
    if (h.pen) { S.smoke = Math.max(S.smoke, h.kill ? Math.min(1, 0.55 + age * 0.06) : 0.8 * Math.exp(-age / 14)); if (age < 0.14) S.flash = Math.max(S.flash, 1 - age / 0.14);
      if (h.kill) { S.fire = true; S.lightsOut = true; } else if (hsh(h.idx, 5) < 0.5) S.emergency = true; if (age < 25 || h.kill) S.alarm = true;
      for (const r in h.crew) if (h.crew[r] !== 'ok') S.blood[r] = S.blood[r] === 'killed' ? 'killed' : h.crew[r]; }
    else S.dust = Math.max(S.dust, 0.32 * Math.exp(-age / 1.6));
    for (const id in h.comps) for (const scr of SCREEN_OF[id] || []) { if (h.comps[id] === 'destroyed') S.dark[scr] = true; else S.weak[scr] = true; } }
  return S;
}

function bloodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); let s = 91; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  x.clearRect(0, 0, 256, 256);
  for (let q = 0; q < 4; q++) { const ox = (q % 2) * 128, oy = (q >> 1) * 128;   /* four different stains on one sheet */
    for (let i = 0; i < 26; i++) { const a = R() * 6.283, d = Math.pow(R(), 1.7) * 46, r = 3 + R() * (i < 5 ? 20 : 8); x.fillStyle = `rgba(${52 + R() * 30 | 0},${4 + R() * 8 | 0},${4 + R() * 6 | 0},1)`; x.beginPath(); x.ellipse(ox + 64 + Math.cos(a) * d, oy + 56 + Math.sin(a) * d * 0.8, r, r * (0.6 + R() * 0.5), a, 0, 7); x.fill(); }
    for (let i = 0; i < 5; i++) { const px = ox + 40 + R() * 48; x.fillStyle = 'rgba(46,5,5,1)'; x.fillRect(px, oy + 58, 2 + R() * 3, 20 + R() * 44); }   /* runs */
    for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(60,6,6,1)'; x.beginPath(); x.arc(ox + 8 + R() * 112, oy + 8 + R() * 112, 0.6 + R() * 1.8, 0, 7); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// The drawn part: sparks and spall of the latest penetration, and the blood stains by each seat (made once, shown when earned).
export class InteriorFx {
  // cab: (opts) => material of the interior; groups: { tur, hul }; seats: where each man sits, as [x, y, z, group]
  constructor(cab, groups, pack, merge) {
    this.G = groups; this.N = 56;
    const glow = this.glow = new THREE.ShaderMaterial({ uniforms: { uInside: SHARED.uInside, uExpo: SHARED.uExpo, uHeat: { value: 1 } },
      vertexShader: `uniform float uInside; void main() { vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; if (uInside > 0.5) { float zv = -mv.z; gl_Position.z = -zv + 2.0 * 0.02 * (zv - 0.03) * 40.0 / (40.0 - 0.03); } }`,
      fragmentShader: `uniform float uExpo; uniform float uHeat; void main() { gl_FragColor = vec4(vec3(3.2, 1.9 * uHeat, 0.5 * uHeat * uHeat) * uExpo, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}` });
    const sp = this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.004, 0.05), glow, this.N); sp.frustumCulled = false; sp.visible = false; groups.hul.add(sp);
    // blood: three stains by each seat (on the seat, on the wall or floor beyond it), all one mesh a seat
    const mat = this.bloodMat = cab({ labels: bloodTexture() }); this.stains = {};
    for (const [r, def] of Object.entries(pack)) { const geo = [], P = def.planes; P.forEach((p, i) => { const g = new THREE.PlaneGeometry(p[6], p[7]), uv = g.attributes.uv, q = (i + r.length) % 4; for (let k = 0; k < uv.count; k++) uv.setXY(k, ((q % 2) + uv.getX(k)) / 2, ((q >> 1) + uv.getY(k)) / 2);
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(p[3], p[4], p[5], 'YXZ')), new THREE.Vector3(1, 1, 1))); const n = g.attributes.position.count, col = new Float32Array(n * 4).fill(1); for (let k = 0; k < n; k++) col[k * 4 + 3] = 0; g.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.push(g.toNonIndexed()); });
      const m = new THREE.Mesh(merge(geo), mat); m.frustumCulled = false; m.visible = false; m.renderOrder = 5; groups[def.g].add(m); this.stains[r] = m; }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._d = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1); this._s = new THREE.Vector3(1, 1, 1);
  }
  // S: fxState(...); graphic: blood allowed
  update(S, graphic) {
    for (const r in this.stains) { const on = !!(graphic && S.blood[r]); if (this.stains[r].visible !== on) this.stains[r].visible = on; }
    const h = S.last, age = S.lastAge, sp = this.sparks, show = !!(h && h.pen && age < 1.1); if (sp.visible !== show) sp.visible = show; if (!show) return;
    // sparks and spall: thrown from the point where the plate was holed, in a cone along the line the jet came in on; they fall and die
    this.glow.uniforms.uHeat.value = Math.max(0.15, 1 - age / 1.1);
    for (let i = 0; i < this.N; i++) { const a = hsh(h.idx + i, 1) * 6.283, c = hsh(h.idx + i, 2) * 0.62, v = 2.5 + hsh(h.idx + i, 3) * 6, life = 0.35 + hsh(h.idx + i, 4) * 0.75, d = this._d;
      d.set(Math.cos(a) * c, Math.sin(a) * c, 0); const dir = h.d, ux = Math.abs(dir.y) < 0.9 ? this._p.set(0, 1, 0) : this._p.set(1, 0, 0); const ax = new THREE.Vector3().crossVectors(dir, ux).normalize(), ay = new THREE.Vector3().crossVectors(dir, ax);
      const vel = new THREE.Vector3().copy(dir).addScaledVector(ax, d.x).addScaledVector(ay, d.y).normalize().multiplyScalar(v), t = Math.min(age, life * 1.2), drag = (1 - Math.exp(-3 * t)) / 3;
      const p = this._p.copy(h.e).addScaledVector(dir, 0.35).addScaledVector(vel, drag); p.y -= 2.2 * t * t; if (p.y < -1.1) p.y = -1.1;
      this._q.setFromUnitVectors(this._z, vel.normalize()); const k = age < life ? 1 : 0; this._s.set(k, k, k * (0.5 + v * 0.12)); this._m.compose(p, this._q, this._s); sp.setMatrixAt(i, this._m); }
    sp.instanceMatrix.needsUpdate = true;
  }
}
