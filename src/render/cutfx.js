// The moment HKOI's cloud cuts a missile's guidance, made unmistakable (Shawn, 16 Nov: "when a missile is cut make it much more obvious").
// Everything here is a HIGHLIGHT over what the engine recorded, in the same "plausible but highlighted" spirit as the cloud's tint:
// it never changes where a missile flies or how it ends, and it never looks like an explosion.
//
//   cutState(th, tv)  what the highlight shows for threat th at volley time tv, worked out from the record alone (th.viz.sever, the
//                     phases, th.viz.relock when the engine has re-acquisition, th.viz.end). A pure function of battle time, so the same
//                     picture at any frame rate and after any jump in time.
//   CutMarks          one instanced draw call: the bright break mark where the guidance line enters the cloud and a thin ring that
//                     opens around the missile at the cut.
//   CutLabels         small labels that follow the missile ("CUT, blind") and then sit where it ended ("missed by 7.9 m"); page text,
//                     no draw call. Placed in the page's own marker layer (#marks), so the clean-screen setting hides them with the rest.
import * as THREE from 'three';

export const BLIND = [0.3, 0.78, 1.0];          /* the "blind" colour: HKOI's own cool blue (the cloud's tint, the headline's HKOI colour) */
export const T_RING = 0.7, T_FLICK = 0.6, T_LABEL_END = 4.0, T_PULSE = 0.6;   /* seconds; chosen for readability, not physics */
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const num = m => Math.round(m).toLocaleString('en-US');
const metres1 = m => (m < 10 ? m.toFixed(1) : String(Math.round(m))) + ' m';

// the time the engine says the missile re-acquired its beam, if it records one (absent until the engine has re-acquisition)
export function relockT(th) { const r = th.viz && th.viz.relock; return r == null ? null : typeof r === 'number' ? r : r.t != null ? r.t : null; }
// how a cut missile's flight ended, in a few plain words, from the record
export function endWords(th) {
  const e = th.viz.end || {};
  if (e.type === 'miss') return e.miss != null ? `missed by ${metres1(e.miss)}` : 'missed';
  if (e.type === 'ground') return e.d != null && e.d > 3 ? `into the ground, ${num(e.d)} m short` : 'into the ground';
  if (e.type === 'self_destruct') return 'self-destructed';
  if (e.type === 'aps_kill') return 'Trophy destroyed it';
  if (e.type === 'he_kill') return 'shot down';
  if (e.type === 'hit') return 'hit the vehicle';
  return 'lost';
}
const _cs = { phase: '', tCut: 0, age: 0, d: 0, text: '', ring: 0, beam: 0, mark: 0, pulse: 0, end: false };
// The highlight for threat th at volley time tv, or null (no cut by HKOI's cloud, or not yet). The returned object is reused.
//   phase  'blind' (cut, still flying), 'relock' (the engine says it found its beam again), 'end' (its flight is over)
//   ring   0 to 1: the ring opening at the cut (0 when there is none)    beam: 0 to 1, the part of the line beyond the cloud
//   mark   brightness of the break mark at the cloud                       pulse: how much the cloud's puffs light up
export function cutState(th, tv) {
  const s = th && th.viz && th.viz.sever; if (!s || s.smoke || tv < s.t) return null;   /* smoke: the crew's own smoke screen, not HKOI */
  const o = _cs, age = tv - s.t, e = th.viz.end || { t: Infinity }, tr = relockT(th);
  o.tCut = s.t; o.age = age; o.d = s.d; o.end = tv >= e.t;
  o.ring = age < T_RING ? age / T_RING : 0;
  o.pulse = Math.exp(-age / T_PULSE);
  // the line beyond the cloud: flickers out over T_FLICK (on/off steps of 1/24 s, fewer and fewer on), then gone
  o.beam = age >= T_FLICK ? 0 : hash(Math.floor(age * 24) + th.idx * 7.3) > age / T_FLICK ? 1 - 0.5 * age / T_FLICK : 0;
  o.mark = age < 0.25 ? 1.6 - 2.4 * age : 1;
  if (tr != null && tv >= tr) { o.phase = 'relock'; o.beam = 1; o.mark = Math.max(0, 1 - (tv - tr) / 0.8); o.ring = 0; o.text = o.end ? `re-locked, then ${endWords(th)}` : 're-locked on its beam'; }
  else if (o.end) { o.phase = 'end'; o.mark = Math.max(0, 1 - (tv - e.t) / 1.5); o.text = endWords(th); }
  else { o.phase = 'blind'; o.text = 'CUT, blind'; }
  return o;
}

// ---- the marks: camera-facing quads, kind 0 a four-pointed glint, kind 1 a thin ring. Additive, no depth write, fog-free.
const MAXM = 24;
const VERT = /* glsl */`
attribute vec4 aP; attribute vec4 aC;   /* aP: centre, size (m).  aC: colour (rgb) and kind (0 glint, 1 ring) */
varying vec2 vUv; varying vec4 vC;
void main() { vUv = position.xy; vC = aC; vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); mv.xy += position.xy * aP.w; gl_Position = projectionMatrix * mv; }`;
const FRAG = /* glsl */`
varying vec2 vUv; varying vec4 vC;
void main() {
  float r = length(vUv), a;
  if (vC.w < 0.5) { float ax = abs(vUv.x), ay = abs(vUv.y); a = exp(-r * r * 22.0) * 1.6 + exp(-ay * 26.0) * exp(-ax * 3.2) + exp(-ax * 26.0) * exp(-ay * 3.2); a *= smoothstep(1.0, 0.7, r); }
  else { a = smoothstep(0.075, 0.0, abs(r - 0.86)) ; }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC.rgb * a, a);
}`;
export class CutMarks {
  constructor() {
    const geo = this.geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.P = new THREE.InstancedBufferAttribute(new Float32Array(MAXM * 4), 4); this.C = new THREE.InstancedBufferAttribute(new Float32Array(MAXM * 4), 4);
    this.P.setUsage(THREE.DynamicDrawUsage); this.C.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aP', this.P); geo.setAttribute('aC', this.C); geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;   /* over the cloud: the break is drawn where the line enters it */
    this.n = 0;
  }
  // p: scene position; size: half size in metres; c: colour; k: brightness; ring: true for a ring
  add(p, size, c, k, ring) {
    if (this.n >= MAXM || k <= 0.003) return; const i = this.n++ * 4, P = this.P.array, C = this.C.array;
    P[i] = p.x; P[i + 1] = p.y; P[i + 2] = p.z; P[i + 3] = size; C[i] = c[0] * k; C[i + 1] = c[1] * k; C[i + 2] = c[2] * k; C[i + 3] = ring ? 1 : 0;
  }
  flush() { this.geo.instanceCount = this.n; this.mesh.visible = this.n > 0; if (this.n) { this.P.needsUpdate = true; this.C.needsUpdate = true; } this.n = 0; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ---- the labels: page text pinned to scene points (none outside a page, as in node tests)
export class CutLabels {
  constructor() { this.pool = []; this.n = 0; this.v = new THREE.Vector3(); this.box = null; }
  _host() { if (this.box || typeof document === 'undefined') return this.box; const m = document.getElementById('marks'); if (!m) return null; this.box = m; return m; }
  // p: scene point; text; sub: a second smaller line; style: 'cut' | 'end' | 'sight'
  add(cam, p, text, sub, style, alpha) {
    const box = this._host(); if (!box) return; let L = this.pool[this.n];
    if (!L) { L = document.createElement('div'); L.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;will-change:transform;font:700 12px/1.25 var(--mono, monospace);letter-spacing:.04em;text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.8)'; L.append(document.createElement('b'), document.createElement('div')); L.lastChild.style.cssText = 'font-weight:600;font-size:10.5px;opacity:.85'; box.append(L); this.pool.push(L); }
    this.n++;
    const v = this.v.copy(p).project(cam), on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1; L.hidden = !on; if (!on) return;
    const W = box.clientWidth || innerWidth, H = box.clientHeight || innerHeight, x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
    L.style.transform = `translate(${(x + 14).toFixed(1)}px, ${(y + 12).toFixed(1)}px)`;   /* below and right of the point: clear of the threat marker's own label */
    const col = style === 'sight' ? '#b8ff9a' : style === 'end' ? '#d8f2ff' : '#8fdcff';
    if (L.firstChild.textContent !== text) L.firstChild.textContent = text; if (L.lastChild.textContent !== (sub || '')) L.lastChild.textContent = sub || '';
    if (L.style.color !== col) L.style.color = col; const op = String(Math.round(alpha * 100) / 100); if (L.style.opacity !== op) L.style.opacity = op;
  }
  flush() { for (let i = this.n; i < this.pool.length; i++) if (!this.pool[i].hidden) this.pool[i].hidden = true; this.n = 0; }
  dispose() { for (const L of this.pool) L.remove(); this.pool.length = 0; }
}
