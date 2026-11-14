// Portraits of the four crewmen: the supplied crew models, head and shoulders, with expressions made by moving the bones of
// their faces. What each face shows comes from the battle's own crew model (stress, state, wounds, freezing) and from what
// has just happened (a blast close by, a hit, his own voice on the intercom).
//
// THERE IS NO COMMANDER MODEL: the commander is the gunner's model again, told apart by a darker helmet and kit and by his name.
//
// How a face is moved. All three models share one skeleton. Every face bone hangs off "Bip01 Head", so an expression is a
// set of small shifts of those bones measured in the head's own directions (up, forward, outward from the nose, in
// millimetres), plus turns of the jaw, the eyes and the head. The directions and the signs of the turns are measured from
// the model when it is loaded (where the eyes sit, which way the chin goes when the jaw turns), not assumed.
// Every channel is eased by a critically damped spring stepped exactly, so the motion is the same at any frame rate; the
// targets are functions of battle time, so a replay shows the same faces.
//
// Cost: one small extra drawing surface (4 x 160 x 200), four figures of about 12,000 points each, drawn 12 times a second
// while a battle runs and the faces are on screen, 5 times a second when all four men are steady, and not at all when the
// crew panel is folded, the battle is paused or nothing shows them. The time of the last drawing is kept in `ms`.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from '../render/units.js';

export const ROLES = ['cdr', 'gnr', 'ldr', 'drv'];
const MODEL = { cdr: 'crew_gunner', gnr: 'crew_gunner', ldr: 'crew_loader', drv: 'crew_driver' };
const W = 160, H = 200;
const STATES = ['steady', 'strained', 'shaken', 'panicked'];

// ---- THE EXPRESSION TABLE (for anyone posing the seated figures: the same numbers work on them).
// Shifts of the face bones for a channel at full strength (1.0): [bone, up, forward, outward] in millimetres, in the head's
// own directions. A bone named without a side is used on both sides (R... and L...); "M..." bones sit on the centre line.
export const SHIFT = {
  browUp: [['InnerEyebrow', 5, 0.5, 0], ['MMiddleEyebrow', 3.5, 0.5, 0], ['OuterEyebrow', 2.5, 0, 0]],          // fear, surprise
  browDown: [['InnerEyebrow', -3, 0.8, -2], ['MMiddleEyebrow', -2.2, 1, 0], ['OuterEyebrow', -0.8, 0, 0]],      // strain, pain
  lid: [['EyeBlinkTop', -7.5, 0.6, 0], ['EyeBlinkBottom', 1.6, 0.2, 0]],                                        // eye shut (blink, flinch, dead)
  wide: [['EyeBlinkTop', 2.4, 0, 0], ['EyeBlinkBottom', -1.1, 0, 0]],                                           // eyes wide
  squeeze: [['Cheek', 2.8, 0.6, 0], ['EyeBlinkBottom', 1.4, 0.2, 0], ['InnerEyebrow', -2.2, 0.5, -1.5]],        // eyes screwed up
  stretch: [['MouthCorner', -0.5, -1, 4]],                                                                      // mouth pulled wide
  frown: [['MouthCorner', -3, 0, 0.8]],                                                                         // corners down
  snarl: [['MUpperLip', 2, 0.6, 0], ['Upperlip', 2.2, 0.6, 0]],                                                 // upper lip lifted (grimace)
  tight: [['MUpperLip', -0.7, -0.9, 0], ['MBottomLip', 0.7, -0.9, 0], ['MouthCorner', 0, -0.4, -1]],            // lips pressed, jaw set
};
// Turns at full strength, in radians: the jaw about the ear-to-ear line, the head and the eyes about the same line (pitch),
// the upright line (yaw) and the nose line (roll). Shoulders: both collar bones lifted, in millimetres.
export const TURN = { jaw: 0.3, eyeYaw: 0.38, eyePitch: 0.24, shoulders: 14 };
// The limits every channel is held to, so no state can push the face past what the skin stands (found by looking at pictures).
const LIMIT = { browUp: 1, browDown: 1, lid: 1, wide: 1, squeeze: 1, stretch: 1, frown: 1, snarl: 1, tight: 1, jaw: 1, pitch: 0.7, yaw: 0.5, roll: 0.4, eyeYaw: 1, eyePitch: 1, shoulders: 1.2, pallor: 1 };
const CHANNELS = Object.keys(LIMIT);
// how quickly each channel follows its target (per second; higher is quicker): lids snap, heads are heavy
const SPEED = { lid: 34, squeeze: 26, wide: 16, jaw: 22, eyeYaw: 20, eyePitch: 20, pitch: 9, yaw: 7, roll: 7, shoulders: 9, pallor: 0.8 };

const hash = (i, sd) => { const v = Math.sin(i * 127.1 + sd * 311.7) * 43758.5453; return v - Math.floor(v); };
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const key = n => String(n).replace(/[^A-Za-z0-9]/g, '');
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// one man's channels: value and speed for each, stepped as critically damped springs (exact for any length of step)
class Springs {
  constructor() { this.x = {}; this.v = {}; for (const c of CHANNELS) { this.x[c] = 0; this.v[c] = 0; } }
  step(T, dt) {
    for (const c of CHANNELS) {
      const w = SPEED[c] || 14, tgt = Math.max(-LIMIT[c], Math.min(LIMIT[c], T[c] || 0)), e = Math.exp(-w * dt), d = this.x[c] - tgt, tmp = (this.v[c] + w * d) * dt;
      this.v[c] = (this.v[c] - w * tmp) * e; this.x[c] = tgt + (d + tmp) * e;
    }
  }
  snap(T) { for (const c of CHANNELS) { this.x[c] = Math.max(-LIMIT[c], Math.min(LIMIT[c], T[c] || 0)); this.v[c] = 0; } }
}

export class Faces {
  constructor(assetBase) {
    this.base = assetBase; this.ok = false; this.failed = false; this.asked = false; this.ms = 0; this.draws = 0;
    this.men = {}; this.out = {}; this.small = {};   // per role: the rigged figure; the picture in the panel; the small picture in the compact row
    for (const r of ROLES) { this.out[r] = null; this.small[r] = null; }
    this.acc = 0; this.tLast = null; this.hold = null;   // hold: a pose forced by a test or a picture session ({ role: { channel: value } })
    this.note = {};      // per role: when he was wounded, when he went down (battle time)
  }
  attach(role, canvas, small) { if (small) this.small[role] = canvas; else this.out[role] = canvas; }

  // ---- loading and measuring
  async load() {
    if (this.asked || !this.base) return; this.asked = true;
    try {
      const R = this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      R.setPixelRatio(1); R.setSize(W * 4, H, false); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.setScissorTest(true);
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x111815);
      const src = {}; for (const n of new Set(Object.values(MODEL))) src[n] = await loadModel(this.base + 'crew/' + n + '.json');
      if (Object.values(src).some(x => !x)) throw new Error('a crew model is missing');
      ROLES.forEach((r, i) => { this.men[r] = this.rig(cloneSkinned(src[MODEL[r]]), r, i); });
      // lit like the turret: a warm lamp above and in front, cool light off the displays from below and the side, little else
      const F = this.men.cdr.F, U = this.men.cdr.U, L = this.men.cdr.L;
      this.scene.add(new THREE.HemisphereLight(0xb8c8bc, 0x141a16, 0.55));
      const lamp = new THREE.DirectionalLight(0xffe2bd, 2.3); lamp.position.copy(F).multiplyScalar(1).addScaledVector(U, 1.3).addScaledVector(L, 0.7); this.scene.add(lamp);
      const glow = new THREE.DirectionalLight(0x8fe6c8, 0.7); glow.position.copy(F).multiplyScalar(0.6).addScaledVector(U, -0.8).addScaledVector(L, -1); this.scene.add(glow);
      this.ok = true;
    } catch (e) { this.failed = true; console.warn('crew portraits not available:', e && e.message); }
  }
  // set one figure up: arms down, own materials for the head, the face bones found and measured, a camera on his face
  rig(fig, role, i) {
    const g = new THREE.Group(); g.add(fig); g.position.set(i * 4, 0, 0); this.scene.add(g); g.updateMatrixWorld(true);
    const B = {}; fig.traverse(o => { if (o.isBone) B[key(o.name)] = o; });
    const head = B.Bip01Head, le = B.Bip01LEye, re = B.Bip01REye, pelvis = B.Bip01Pelvis || B.Bip01;
    if (!head || !le || !re) throw new Error('not the crew skeleton');
    const wp = b => b.getWorldPosition(new THREE.Vector3());
    const L = wp(le).sub(wp(re)).normalize(), U = wp(head).sub(wp(pelvis)).normalize(); U.addScaledVector(L, -U.dot(L)).normalize();
    const eyes = wp(le).add(wp(re)).multiplyScalar(0.5), F = new THREE.Vector3().crossVectors(L, U).normalize(); if (F.dot(_v.copy(eyes).sub(wp(head))) < 0) F.negate();
    const unit = wp(le).distanceTo(wp(re)) / 0.064;   /* the eyes are 64 mm apart in the file: anything else is the model's scale */
    // arms out of the picture: each upper arm is turned to hang down and a little forward
    for (const [s, k] of [['L', 1], ['R', -1]]) { const a = B['Bip01' + s + 'UpperArm'], c = B['Bip01' + s + 'Forearm']; if (!a || !c) continue;
      const cur = wp(c).sub(wp(a)).normalize(), want = new THREE.Vector3().copy(U).multiplyScalar(-1).addScaledVector(L, 0.22 * k).addScaledVector(F, 0.12).normalize();
      _q.setFromUnitVectors(cur, want); a.getWorldQuaternion(_q2); const pq = a.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); a.quaternion.copy(pq.multiply(_q.multiply(_q2))); a.updateMatrixWorld(true); }
    g.updateMatrixWorld(true);
    // a bone's rest place and turn, and the head's three directions written in its parent's own frame
    const take = b => { if (!b) return null; const pinv = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); _m.copy(b.parent.matrixWorld).decompose(_p, _q, _s);
      return { b, p: b.position.clone(), q: b.quaternion.clone(), u: U.clone().applyQuaternion(pinv), f: F.clone().applyQuaternion(pinv), l: L.clone().applyQuaternion(pinv), k: unit / (_s.x || 1) / 1000 }; };
    const shifts = {};   // channel -> [{ bone record, up, fwd, out (with the side's sign) }]
    const rec = {}; const get = n => rec[n] || (rec[n] = take(B['Bip01' + n]));
    for (const [ch, list] of Object.entries(SHIFT)) { shifts[ch] = []; for (const [name, up, fwd, out] of list) {
      if (name[0] === 'M' && get(name)) shifts[ch].push({ r: get(name), up, fwd, out: 0 });
      else for (const [s, sg] of [['R', -1], ['L', 1]]) if (get(s + name)) shifts[ch].push({ r: get(s + name), up, fwd, out: out * sg }); } }
    const jaw = take(B.Bip01MJaw), hd = take(head), eyeL = take(le), eyeR = take(re), clav = [take(B.Bip01LClavicle), take(B.Bip01RClavicle)].filter(Boolean);
    // which way round the turns go: the chin must drop when the jaw opens, the face must drop when the head ducks
    const chin = B.Bip01MBottomLip ? wp(B.Bip01MBottomLip).sub(wp(B.Bip01MJaw)) : F.clone(), jawSign = _v.crossVectors(L, chin).dot(U) < 0 ? 1 : -1;
    const face = eyes.clone().sub(wp(head)), nodSign = _v.crossVectors(L, face.lengthSq() > 1e-8 ? face : F).dot(U) < 0 ? 1 : -1, yawSign = _v.crossVectors(U, F).dot(L) > 0 ? 1 : -1;
    // his own skin, so it can lose its colour; the commander's kit darker than the gunner's
    const skin = []; fig.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = false; const mats = [].concat(o.material).map(m => { const c = m.clone(); c.metalness = 0; c.roughness = Math.max(0.7, c.roughness || 0); if (/head/i.test(m.name)) skin.push(c); else if (role === 'cdr' && /helmet|equipment/i.test(m.name)) c.color.multiplyScalar(0.55); return c; }); o.material = Array.isArray(o.material) ? mats : mats[0]; });
    const cam = new THREE.PerspectiveCamera(27, W / H, 0.1, 6); cam.position.copy(eyes).addScaledVector(F, 0.86).addScaledVector(U, 0.02).addScaledVector(L, role === 'gnr' ? -0.07 : role === 'drv' ? 0.06 : 0.02); cam.up.copy(U); cam.lookAt(_v.copy(eyes).addScaledVector(U, -0.075)); cam.updateMatrixWorld(true);
    return { role, i, seed: i * 1.7 + 1, g, head, rec, shifts, jaw, hd, eyeL, eyeR, clav, jawSign, nodSign, yawSign, skin, cam, U, F, L, sp: new Springs(), speak: 0 };
  }

  // ---- what each face should be doing at battle time t. Returns the channel targets.
  // m: his entry in battle.crewState().who; ev: { hit, near } seconds since the last hit on the vehicle and the last blast close by
  target(M, m, t, ev, speaking) {
    const sd = M.seed, k = Math.max(0, STATES.indexOf(m.state)), s = m.stress || 0, tense = sat((s - 0.2) / 0.3), fear = sat((s - 0.5) / 0.3), panic = k === 3;
    const down = m.status === 'down', hurt = m.status === 'wounded', frozen = /frozen/.test(m.busy || ''), N = this.note[M.role] || (this.note[M.role] = {});
    if (hurt && (N.w == null || t < N.w)) N.w = t; if (!hurt && !down) N.w = null; if (down && (N.d == null || t < N.d)) N.d = t; if (!down) N.d = null;
    if (down) {   /* out of action or dead: the head sinks, the eyes close (a dead man's stay half open), the colour drains */
      const d = sat((t - N.d) / 1.6), side = M.i % 2 ? 1 : -1, dead = /killed/.test(m.busy || '');
      return { lid: dead ? 0.62 : 0.95, jaw: 0.18 * d, pitch: 0.55 * d, roll: 0.26 * d * side, yaw: 0.14 * side * d, shoulders: -0.4 * d, pallor: dead ? d : 0.7 * d };
    }
    const T = { browUp: 0.9 * fear, browDown: 0.85 * tense * (1 - fear), wide: 0.12 * tense + 0.8 * fear, lid: 0, squeeze: 0, jaw: 0.06 * fear, stretch: 0, frown: 0.25 * tense + 0.45 * fear, snarl: 0, tight: 0.8 * tense * (1 - fear),
      pitch: 0, yaw: 0, roll: 0, eyeYaw: 0, eyePitch: k === 0 ? 0.35 : 0.1, shoulders: 0, pallor: 0.25 * fear };
    // where he looks: slow looks at his work when steady, quick glances when strained, darting when panicked
    const G = [3.6, 1.7, 0.9, 0.38][k], gk = Math.floor(t / G + sd * 0.37), amp = [0.35, 0.6, 0.85, 1][k];
    T.eyeYaw = (hash(gk, sd) - 0.5) * 2 * amp; T.eyePitch += (hash(gk, sd + 9) - 0.5) * amp * 0.5; T.yaw = T.eyeYaw * [0.08, 0.14, 0.22, 0.3][k];
    // blinking: slow when steady, faster with strain
    const P = [4.2, 2.4, 1.3, 0.9][k], bk = Math.floor(t / P), tb = (bk + 0.2 + 0.6 * hash(bk, sd + 3)) * P; if (Math.abs(t - tb) < 0.11) T.lid = 1;
    // breathing, seen in the shoulders
    const br = Math.sin(t * (1.3 + s * 7) + sd); T.shoulders = 0.1 + br * (0.08 + fear * 0.45) + fear * 0.3;
    if (panic) { const hv = Math.sin(t * 11 + sd); T.jaw = 0.3 + 0.16 * hv; T.shoulders = 0.6 + 0.45 * hv; T.stretch = 0.3; if (hash(Math.floor(t / 1.9), sd + 5) < 0.3) { T.squeeze = 1; T.lid = 1; T.wide = 0; } }
    if (frozen) { T.wide = 1; T.browUp = 1; T.jaw = 0.24; T.eyeYaw = 0; T.eyePitch = 0; T.yaw = 0; T.lid = Math.abs(t % 6.3 - 3) < 0.09 ? 1 : 0; T.squeeze = 0; T.roll = 0.015 * Math.sin(t * 31 + sd); T.pitch = 0.06; }
    if (speaking) { const syl = Math.max(0, Math.sin(t * 19 + sd) * 0.6 + Math.sin(t * 31) * 0.4); T.jaw = Math.max(T.jaw, 0.1 + syl * (0.4 + fear * 0.3)); T.stretch = Math.max(T.stretch, fear * 0.4); T.tight = 0; }
    // a blast close by: flinch and screw the eyes up, then stare; a hit on the vehicle: thrown, mouth open
    if (ev.near < 0.35) { T.squeeze = 1; T.lid = 1; T.wide = 0; T.pitch = 0.3; T.shoulders = 1; T.frown = 0.9; T.stretch = 0.6; }
    else if (ev.near < 1.2 && k > 0) { T.wide = 1; T.browUp = 1; T.jaw = Math.max(T.jaw, 0.22); T.yaw = Math.sin(ev.near * 11 + sd) * 0.25; }
    if (ev.hit < 0.45) { T.squeeze = 1; T.lid = 1; T.wide = 0; T.pitch = 0.5; T.roll = (M.i % 2 ? 0.25 : -0.25); T.shoulders = 1; T.jaw = 0.9; T.stretch = 1; }
    else if (ev.hit < 2) { T.wide = 1; T.browUp = 1; T.jaw = 0.5; T.stretch = 0.5; T.yaw = Math.sin(ev.hit * 9 + sd * 2) * 0.3; T.shoulders = 0.8; }
    if (hurt) {   /* the grimace of a wound, with a gasp every few seconds */
      const age = t - N.w, gasp = ((t + sd) % 3.4) < 0.5;
      if (age < 1.7) { T.squeeze = 1; T.lid = 1; T.wide = 0; T.jaw = 0.95; T.stretch = 1; T.pitch = -0.25; T.roll = 0.2; T.shoulders = 0.9; }
      else { T.squeeze = gasp ? 0.9 : 0.5; T.lid = gasp ? 0.9 : 0.3; T.wide = 0; T.jaw = gasp ? 0.55 : 0.14; T.stretch = 0.8; T.frown = 1; T.snarl = 0.9; T.browDown = 0.7; T.browUp = 0.3; T.roll = 0.14 + Math.sin(t * 1.1) * 0.04; T.pitch = 0.12 + Math.sin(t * 0.8 + sd) * 0.05; T.shoulders = 0.5 + 0.3 * Math.sin(t * 5); }
      T.pallor = 0.55;
    }
    return T;
  }
  // put a man's channel values onto his bones
  pose(M) {
    const x = M.sp.x;
    for (const r of Object.values(M.rec)) if (r) r.b.position.copy(r.p);
    for (const ch of Object.keys(SHIFT)) { const a = x[ch]; if (Math.abs(a) < 1e-4) continue; for (const h of M.shifts[ch]) { const r = h.r, kk = a * r.k; r.b.position.addScaledVector(r.u, h.up * kk).addScaledVector(r.f, h.fwd * kk).addScaledVector(r.l, h.out * kk); } }
    if (M.jaw) M.jaw.b.quaternion.copy(_q.setFromAxisAngle(M.jaw.l, x.jaw * TURN.jaw * M.jawSign)).multiply(M.jaw.q);
    const hd = M.hd; hd.b.quaternion.copy(_q.setFromAxisAngle(hd.u, x.yaw * M.yawSign)).multiply(_q2.setFromAxisAngle(hd.l, x.pitch * M.nodSign)).multiply(_q2.setFromAxisAngle(hd.f, x.roll)).multiply(hd.q);
    for (const e of [M.eyeL, M.eyeR]) e.b.quaternion.copy(_q.setFromAxisAngle(e.u, x.eyeYaw * TURN.eyeYaw * M.yawSign)).multiply(_q2.setFromAxisAngle(e.l, x.eyePitch * TURN.eyePitch * M.nodSign)).multiply(e.q);
    for (const c of M.clav) c.b.position.copy(c.p).addScaledVector(c.u, x.shoulders * TURN.shoulders * c.k);
    const pal = sat(x.pallor); for (const m of M.skin) m.color.setRGB(1 - 0.34 * pal, 1 - 0.27 * pal, 1 - 0.22 * pal);
  }

  // ---- one frame. s: { on (any face is on screen), playing, battle, now, crew (battle.crewState()), speaking ('CDR' ...), graphic }
  update(dt, s) {
    if (!s.on || !s.crew) { this.tLast = null; return; }
    if (!this.asked) this.load();
    if (!this.ok) return;
    const t = s.now, jumped = this.tLast == null || t < this.tLast - 0.01 || t > this.tLast + 3; this.acc += dt;
    const quiet = ROLES.every(r => s.crew.who[r].state === 'steady' && s.crew.who[r].status === 'ok') && !s.speaking;
    if (!jumped && !this.hold && (!s.playing || this.acc < (quiet ? 0.2 : 0.083))) return;
    const step = jumped ? 0 : Math.max(0, Math.min(1, t - this.tLast)); this.acc = 0; this.tLast = t;
    const ev = this.recent(s.battle, t), t0 = performance.now();
    for (const r of ROLES) { const M = this.men[r], m = s.crew.who[r];
      let T = this.target(M, m, t, ev, s.speaking && s.speaking.toLowerCase() === r); if (this.hold && this.hold[r]) T = Object.assign(T, this.hold[r]);
      if (jumped) M.sp.snap(T); else M.sp.step(T, step); this.pose(M); }
    this.draw(s);
    this.ms += (performance.now() - t0 - this.ms) * 0.2; this.draws++;
  }
  // seconds since the last hit on the vehicle and since the last blast close to it (Trophy firing, a warhead bursting on the ground near by)
  recent(B, t) {
    const E = B.events || [], out = { hit: 99, near: 99 };
    for (let i = E.length - 1, n = 0; i >= 0 && n < 80; i--, n++) { const e = E[i]; if (e.type !== 'end' || e.t > t || t - e.t > 3) continue;
      if (e.how === 'hit') out.hit = Math.min(out.hit, t - e.t); else if (e.how === 'aps_kill' || e.how === 'ground' || e.how === 'miss') out.near = Math.min(out.near, t - e.t); }
    return out;
  }
  draw(s) {
    const R = this.gl, cv = R.domElement;
    ROLES.forEach((r, i) => { R.setViewport(i * W, 0, W, H); R.setScissor(i * W, 0, W, H); R.render(this.scene, this.men[r].cam); });
    ROLES.forEach((r, i) => {
      const m = s.crew.who[r], M = this.men[r], big = this.out[r], sm = this.small[r];
      if (big && big.isConnected) { const x = big._x || (big._x = big.getContext('2d')); x.drawImage(cv, i * W, 0, W, H, 0, 0, big.width, big.height); this.marks(x, big, M, m, s); }
      if (sm && sm.isConnected) { const x = sm._x || (sm._x = sm.getContext('2d')); x.drawImage(cv, i * W + W * 0.2, H * 0.1, W * 0.6, H * 0.62, 0, 0, sm.width, sm.height); if (m.status === 'down') { x.fillStyle = 'rgba(4,6,5,.55)'; x.fillRect(0, 0, sm.width, sm.height); } }
    });
  }
  // drawn over the picture: blood for a wounded or dead man (only with graphic effects on), and the dimming of a man out of action
  marks(x, cv, M, m, s) {
    const hurt = m.status === 'wounded', down = m.status === 'down', N = this.note[M.role] || {};
    if ((hurt || down) && s.graphic) {
      const age = Math.max(0, s.now - (N.w != null ? N.w : N.d != null ? N.d : s.now)), grow = sat(age / 9), sd = M.seed;
      _v.setFromMatrixPosition(M.head.matrixWorld).addScaledVector(M.U, 0.115).addScaledVector(M.F, 0.09).addScaledVector(M.L, (M.i % 2 ? 0.035 : -0.035)).project(M.cam);
      const px = (_v.x + 1) / 2 * cv.width, py = (1 - _v.y) / 2 * cv.height, u = cv.height / 200;
      x.save(); x.lineCap = 'round';
      x.fillStyle = 'rgba(96,6,6,.9)'; x.beginPath(); x.ellipse(px, py, 5 * u, 3.2 * u, 0.4, 0, 6.3); x.fill();
      for (let k = 0; k < 3; k++) { const ox = (hash(k, sd) - 0.5) * 8 * u, len = (14 + 46 * hash(k, sd + 2)) * grow * u; x.strokeStyle = `rgba(${120 - k * 12},8,8,${0.85 - k * 0.12})`; x.lineWidth = (2.6 - k * 0.5) * u; x.beginPath(); x.moveTo(px + ox, py); x.quadraticCurveTo(px + ox + (hash(k, sd + 4) - 0.5) * 9 * u, py + len * 0.5, px + ox * 1.3 + (hash(k, sd + 6) - 0.5) * 7 * u, py + len); x.stroke(); }
      x.fillStyle = 'rgba(110,8,8,.6)'; for (let k = 0; k < 7; k++) { x.beginPath(); x.arc(px + (hash(k, sd + 11) - 0.5) * 60 * u, py + (40 + hash(k, sd + 13) * 95) * u, (0.8 + hash(k, sd + 15) * 2.2) * u, 0, 6.3); x.fill(); }
      x.restore();
    }
    if (down) { x.fillStyle = 'rgba(4,6,5,.5)'; x.fillRect(0, 0, cv.width, cv.height); }
  }
  // forget where the springs were (a new battle, a rewind)
  reset() { this.tLast = null; this.note = {}; this.acc = 0; }
}
