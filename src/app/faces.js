// Portraits of the four crewmen: the supplied crew models, head and shoulders, with expressions made by moving the bones of
// their faces. What each face shows comes from the battle's own crew model (stress, state, wounds, freezing) and from what
// has just happened (a blast close by, a hit, his own voice on the intercom).
//
// THERE IS NO COMMANDER MODEL: the commander is the gunner's model again, made unmistakable: a lighter skin tone, a plain olive
// helmet with the goggles taken off it, and his name (the numbers are in LOOK below, for the seated figure to match).
// The loader's dark glasses are taken off so that his eyes and brows can be read.
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
  browUp: [['InnerEyebrow', 11, 1, 0], ['MMiddleEyebrow', 8, 1, 0], ['OuterEyebrow', 6, 0, 0]],                 // fear, surprise
  browDown: [['InnerEyebrow', -6.5, 1.5, -4], ['MMiddleEyebrow', -5, 2, 0], ['OuterEyebrow', -2, 0, 0]],         // strain, pain
  lid: [['EyeBlinkTop', -7.5, 0.6, 0], ['EyeBlinkBottom', 1.6, 0.2, 0]],                                        // eye shut (blink, flinch, dead)
  wide: [['EyeBlinkTop', 3.6, 0, 0], ['EyeBlinkBottom', -1.9, 0, 0]],                                           // eyes wide
  squeeze: [['Cheek', 4.5, 1, 0], ['EyeBlinkBottom', 1.8, 0.2, 0], ['InnerEyebrow', -3.5, 0.8, -2.5]],          // eyes screwed up
  stretch: [['MouthCorner', -1.2, -2, 9]],                                                                      // mouth pulled wide
  frown: [['MouthCorner', -7, 0, 1.6]],                                                                         // corners down
  snarl: [['MUpperLip', 3, 0.9, 0], ['Upperlip', 3.4, 0.9, 0], ['Cheek', 2, 0.4, 0]],                           // upper lip lifted (grimace)
  tight: [['MUpperLip', -1.6, -2, 0], ['MBottomLip', 1.6, -2, 0], ['MouthCorner', 0, -0.8, -2.6]],              // lips pressed, jaw set
};
// Turns at full strength, in radians: the jaw about the ear-to-ear line, the head and the eyes about the same line (pitch),
// the upright line (yaw) and the nose line (roll). Shoulders: both collar bones lifted, in millimetres.
export const TURN = { jaw: 0.3, eyeYaw: 0.42, eyePitch: 0.26, shoulders: 22, thrust: 28 };   // thrust: the head pushed forward (+) or pulled back (-), millimetres
// How each man is told apart, and what stress does to skin and light (multipliers of the picture's own colours).
export const LOOK = {
  cdrSkin: [2.3, 2.15, 2.1],       // the commander's face: the gunner's dark skin lightened by these factors (red, green, blue)
  cdrHelmet: [0.5, 0.62, 0.3],     // his helmet: the camouflage cover multiplied to a plain olive; its goggles and their strap removed
  pallor: [0.62, 0.74, 0.8],       // a face that has lost all its colour (shaken about half way, wounded three quarters, dead fully)
  flush: [1.1, 0.93, 0.9],         // a strained face, before fear takes the colour out again
  sweat: 0.24,                     // how far the skin's roughness drops at full strain (a wet sheen)
};
// The limits every channel is held to, so no state can push the face past what the skin stands (found by looking at pictures).
const LIMIT = { browUp: 1, browDown: 1, lid: 1, wide: 1, squeeze: 1, stretch: 1, frown: 1, snarl: 1, tight: 1, jaw: 1, thrust: 1, flush: 1, sweat: 1, pitch: 0.32, yaw: 0.6, roll: 0.45,   /* a head ducked further than 0.32 hides the face under the helmet */ eyeYaw: 1, eyePitch: 1, shoulders: 1.2, pallor: 1 };
const CHANNELS = Object.keys(LIMIT);
// how quickly each channel follows its target (per second; higher is quicker): lids snap, heads are heavy
const SPEED = { thrust: 8, flush: 1.2, sweat: 0.6, lid: 34, squeeze: 26, wide: 16, jaw: 22, eyeYaw: 20, eyePitch: 20, pitch: 9, yaw: 7, roll: 7, shoulders: 9, pallor: 0.8 };

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

// A copy of a mesh without some of its separate pieces (pieces = parts that share no corner with the rest, such as a pair of
// glasses modelled on to a head). drop(piece) is asked for each piece, given its box { min, max } in the mesh's own space
// (metres; x across, y negative towards the face, z up).
function without(geo, drop) {
  const P = geo.attributes.position, I = geo.index; if (!I) return geo;
  const key = new Map(), id = new Int32Array(P.count), par = [];
  for (let v = 0; v < P.count; v++) { const k = P.getX(v).toFixed(4) + ',' + P.getY(v).toFixed(4) + ',' + P.getZ(v).toFixed(4); let n = key.get(k); if (n == null) { n = par.length; key.set(k, n); par.push(n); } id[v] = n; }
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.count; t += 3) { const a = find(id[I.getX(t)]), b = find(id[I.getX(t + 1)]), c = find(id[I.getX(t + 2)]); par[b] = a; par[c] = a; }
  const box = new Map();
  for (let v = 0; v < P.count; v++) { const r = find(id[v]); let b = box.get(r); if (!b) { b = { n: 0, min: new THREE.Vector3(9, 9, 9), max: new THREE.Vector3(-9, -9, -9) }; box.set(r, b); } b.n++; _v.fromBufferAttribute(P, v); b.min.min(_v); b.max.max(_v); }
  let biggest = null; for (const b of box.values()) if (!biggest || b.n > biggest.n) biggest = b;
  const gone = new Set(); for (const [r, b] of box) if (b !== biggest && drop(b)) gone.add(r);
  if (!gone.size) return geo;
  const keep = []; for (let t = 0; t < I.count; t += 3) if (!gone.has(find(id[I.getX(t)]))) keep.push(I.getX(t), I.getX(t + 1), I.getX(t + 2));
  const out = geo.clone(); out.setIndex(keep); return out;
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
      this.hemi = new THREE.HemisphereLight(0xc8d6cc, 0x2a322d, 1.25); this.scene.add(this.hemi);
      const lamp = this.lamp = new THREE.DirectionalLight(0xffe2bd, 3.4); lamp.position.copy(F).multiplyScalar(1).addScaledVector(U, 1.3).addScaledVector(L, 0.7); this.scene.add(lamp);
      const glow = new THREE.DirectionalLight(0xc2dcd0, 0.7); glow.position.copy(F).multiplyScalar(0.6).addScaledVector(U, -0.8).addScaledVector(L, -1); this.scene.add(glow);
      const red = this.red = new THREE.DirectionalLight(0xff2a1c, 0); red.position.copy(F).multiplyScalar(0.8).addScaledVector(U, 0.9).addScaledVector(L, -0.9); this.scene.add(red);   /* the emergency lamp, lit for a while after a hit */
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
    const neck = take(B.Bip01Neck), jaw = take(B.Bip01MJaw), hd = take(head), eyeL = take(le), eyeR = take(re), clav = [take(B.Bip01LClavicle), take(B.Bip01RClavicle)].filter(Boolean);
    // which way round the turns go: the chin must drop when the jaw opens, the face must drop when the head ducks
    const chin = B.Bip01MBottomLip ? wp(B.Bip01MBottomLip).sub(wp(B.Bip01MJaw)) : F.clone(), jawSign = _v.crossVectors(L, chin).dot(U) < 0 ? 1 : -1;
    const face = eyes.clone().sub(wp(head)), nodSign = _v.crossVectors(L, face.lengthSq() > 1e-8 ? face : F).dot(U) < 0 ? 1 : -1, yawSign = _v.crossVectors(U, F).dot(L) > 0 ? 1 : -1;
    // his own skin, so it can change colour and shine; the commander's lighter skin and olive helmet; goggles and dark glasses off
    const skin = [], base = role === 'cdr' ? LOOK.cdrSkin : [1, 1, 1];
    fig.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = false;
      const names = [].concat(o.material).map(m => m.name || '').join(' ');
      if (/head/i.test(names) && role === 'cdr') o.geometry = without(o.geometry, c => c.min.z > 1.73);                                  /* the goggles on the helmet's front and their strap */
      if (/head/i.test(names) && role === 'ldr') o.geometry = without(o.geometry, c => c.min.z > 1.655 && c.max.z < 1.705 && c.min.y < -0.12);   /* the dark glasses: frame and both lenses (the eyeballs sit behind -0.112) */
      const mats = [].concat(o.material).map(m => { const c = m.clone(); c.metalness = 0; c.roughness = Math.max(0.7, c.roughness || 0); if (/head/i.test(m.name)) skin.push(c); else if (role === 'cdr' && /helmet/i.test(m.name)) c.color.setRGB(...LOOK.cdrHelmet); return c; });
      o.material = Array.isArray(o.material) ? mats : mats[0]; });
    const cam = new THREE.PerspectiveCamera(27, W / H, 0.1, 6); cam.position.copy(eyes).addScaledVector(F, 0.7).addScaledVector(U, 0.0).addScaledVector(L, role === 'gnr' ? -0.07 : role === 'drv' ? 0.06 : 0.02); cam.up.copy(U); cam.lookAt(_v.copy(eyes).addScaledVector(U, -0.045)); cam.updateMatrixWorld(true);
    return { role, i, seed: i * 1.7 + 1, g, head, rec, shifts, neck, base, stress: 0, jaw, hd, eyeL, eyeR, clav, jawSign, nodSign, yawSign, skin, cam, U, F, L, sp: new Springs(), speak: 0 };
  }

  // ---- what each face should be doing at battle time t. Returns the channel targets.
  // m: his entry in battle.crewState().who; ev: { hit, near } seconds since the last hit on the vehicle and the last blast close by
  target(M, m, t, ev, speaking) {
    const sd = M.seed, k = Math.max(0, STATES.indexOf(m.state)), s = m.stress || 0, tense = sat((s - 0.2) / 0.3), fear = sat((s - 0.5) / 0.3), panic = k === 3;
    const down = m.status === 'down', hurt = m.status === 'wounded', frozen = /frozen/.test(m.busy || ''), N = this.note[M.role] || (this.note[M.role] = {});
    if (hurt && (N.w == null || t < N.w)) N.w = t; if (!hurt && !down) N.w = null; if (down && (N.d == null || t < N.d)) N.d = t; if (!down) N.d = null;
    if (down) {   /* out of action or dead: the head sinks, the eyes close (a dead man's stay half open), the colour drains */
      const d = sat((t - N.d) / 1.6), side = M.i % 2 ? 1 : -1, dead = /killed/.test(m.busy || '');
      return { lid: dead ? 0.8 : 1, jaw: (dead ? 0.3 : 0.12) * d, pitch: (dead ? -0.26 : 0.28) * d, roll: 0.4 * d * side, yaw: 0.2 * side * d, shoulders: -0.6 * d, thrust: dead ? -0.5 * d : 0.4 * d, pallor: dead ? d : 0.8 * d };   /* a dead man's head falls back and to one side, mouth open; an unconscious man's sinks forward */
    }
    // steady: neutral, eyes on his work. strained: brows drawn, jaw set, chin down and forward, flushed and starting to sweat.
    // shaken: brows up, eyes wide, mouth parted, head pulled back and turned away, shoulders up, the colour going.
    const T = { browUp: fear, browDown: tense * (1 - fear), wide: 0.1 * tense + 0.9 * fear, lid: 0, squeeze: 0, jaw: 0.16 * fear, stretch: 0.25 * fear, frown: 0.5 * tense + 0.4 * fear, snarl: 0, tight: tense * (1 - fear),
      pitch: 0.16 * tense * (1 - fear) - 0.08 * fear, yaw: 0, roll: 0, eyeYaw: 0, eyePitch: k === 0 ? 0.35 : 0.1, shoulders: 0, thrust: 0.9 * tense * (1 - fear) - fear, pallor: 0.55 * fear, flush: tense * (1 - fear), sweat: Math.max(tense, fear) };
    // where he looks: slow looks at his work when steady, quick glances when strained, darting when panicked
    const G = [3.6, 1.7, 0.9, 0.38][k], gk = Math.floor(t / G + sd * 0.37), amp = [0.35, 0.6, 0.85, 1][k];
    T.eyeYaw = (hash(gk, sd) - 0.5) * 2 * amp; T.eyePitch += (hash(gk, sd + 9) - 0.5) * amp * 0.5; T.yaw = T.eyeYaw * [0.08, 0.16, 0.3, 0.55][k];
    if (k === 2) T.yaw += (M.i % 2 ? 0.28 : -0.28);   /* a shaken man keeps his head half turned away */
    // blinking: slow when steady, faster with strain
    const P = [4.2, 2.4, 1.3, 0.9][k], bk = Math.floor(t / P), tb = (bk + 0.2 + 0.6 * hash(bk, sd + 3)) * P; if (Math.abs(t - tb) < 0.11) T.lid = 1;
    // breathing, seen in the shoulders
    const br = Math.sin(t * (1.3 + s * 7) + sd); T.shoulders = 0.05 + br * (0.1 + fear * 0.5) + fear * 0.55;
    if (panic) { const hv = Math.sin(t * 11 + sd); T.jaw = 0.42 + 0.2 * hv; T.shoulders = 0.7 + 0.45 * hv; T.stretch = 0.55; T.thrust = -0.4 + 0.5 * Math.sin(t * 7 + sd); T.pitch = 0.1 * Math.sin(t * 5.3 + sd); T.pallor = 0.6; if (hash(Math.floor(t / 1.9), sd + 5) < 0.3) { T.squeeze = 1; T.lid = 1; T.wide = 0; } }
    if (frozen) { T.wide = 1; T.browUp = 0.55; T.browDown = 0; T.jaw = 0.3; T.stretch = 0; T.frown = 0.3; T.eyeYaw = 0; T.eyePitch = -0.15; T.yaw = 0; T.lid = 0; T.squeeze = 0; T.roll = 0.012 * Math.sin(t * 31 + sd); T.pitch = -0.05; T.thrust = -0.3; T.shoulders = 0.9; T.pallor = 0.8; }   /* rigid: staring past everything, jaw slack, no blink, shoulders locked up */
    if (speaking) { const syl = Math.max(0, Math.sin(t * 19 + sd) * 0.6 + Math.sin(t * 31) * 0.4); T.jaw = Math.max(T.jaw, 0.1 + syl * (0.4 + fear * 0.3)); T.stretch = Math.max(T.stretch, fear * 0.4); T.tight = 0; }
    // a blast close by: flinch and screw the eyes up, then stare; a hit on the vehicle: thrown, mouth open
    if (ev.near < 0.35) { T.squeeze = 1; T.lid = 1; T.wide = 0; T.pitch = 0.2; T.shoulders = 1; T.frown = 0.9; T.stretch = 0.6; }
    else if (ev.near < 1.2 && k > 0) { T.wide = 1; T.browUp = 1; T.jaw = Math.max(T.jaw, 0.22); T.yaw = Math.sin(ev.near * 11 + sd) * 0.25; }
    if (ev.hit < 0.45) { T.squeeze = 1; T.lid = 1; T.wide = 0; T.pitch = 0.3; T.roll = (M.i % 2 ? 0.25 : -0.25); T.shoulders = 1; T.jaw = 0.9; T.stretch = 1; }
    else if (ev.hit < 2) { T.wide = 1; T.browUp = 1; T.jaw = 0.5; T.stretch = 0.5; T.yaw = Math.sin(ev.hit * 9 + sd * 2) * 0.3; T.shoulders = 0.8; }
    if (hurt) {   /* the grimace of a wound, with a gasp every few seconds */
      const age = t - N.w, gasp = ((t + sd) % 3.4) < 0.5;
      if (age < 1.7) { T.squeeze = 1; T.lid = 1; T.wide = 0; T.jaw = 0.95; T.stretch = 1; T.pitch = -0.25; T.roll = 0.2; T.shoulders = 0.9; }
      else { T.squeeze = gasp ? 1 : 0.6; T.lid = gasp ? 0.95 : 0.5; T.wide = 0; T.jaw = gasp ? 0.6 : 0.2; T.stretch = 0.9; T.frown = 1; T.snarl = 1; T.browDown = 0.9; T.browUp = 0.4; T.roll = (M.i % 2 ? -1 : 1) * (0.34 + Math.sin(t * 1.1) * 0.05); T.pitch = 0.14 + Math.sin(t * 0.8 + sd) * 0.05; T.yaw = 0; T.eyeYaw *= 0.3; T.thrust = -0.2; T.shoulders = 0.5 + 0.3 * Math.sin(t * 5); }   /* head lolling to one side, eyes half shut, teeth bared */
      T.pallor = 0.75; T.flush = 0; T.sweat = 1;
    }
    return T;
  }
  // put a man's channel values onto his bones
  pose(M) {
    const x = M.sp.x;
    for (const r of Object.values(M.rec)) if (r) r.b.position.copy(r.p);
    for (const ch of Object.keys(SHIFT)) { const a = x[ch]; if (Math.abs(a) < 1e-4) continue; for (const h of M.shifts[ch]) { const r = h.r, kk = a * r.k; r.b.position.addScaledVector(r.u, h.up * kk).addScaledVector(r.f, h.fwd * kk).addScaledVector(r.l, h.out * kk); } }
    if (M.jaw) M.jaw.b.quaternion.copy(_q.setFromAxisAngle(M.jaw.l, x.jaw * TURN.jaw * M.jawSign)).multiply(M.jaw.q);
    const hd = M.hd; hd.b.quaternion.copy(_q.setFromAxisAngle(hd.u, x.yaw * 0.65 * M.yawSign)).multiply(_q2.setFromAxisAngle(hd.l, x.pitch * 0.7 * M.nodSign)).multiply(_q2.setFromAxisAngle(hd.f, x.roll * 0.65)).multiply(hd.q);
    hd.b.position.copy(hd.p).addScaledVector(hd.f, x.thrust * TURN.thrust * hd.k);
    const nk = M.neck; if (nk) nk.b.quaternion.copy(_q.setFromAxisAngle(nk.u, x.yaw * 0.35 * M.yawSign)).multiply(_q2.setFromAxisAngle(nk.l, x.pitch * 0.3 * M.nodSign)).multiply(_q2.setFromAxisAngle(nk.f, x.roll * 0.35)).multiply(nk.q);   /* the neck takes a third of every turn of the head */
    for (const e of [M.eyeL, M.eyeR]) e.b.quaternion.copy(_q.setFromAxisAngle(e.u, x.eyeYaw * TURN.eyeYaw * M.yawSign)).multiply(_q2.setFromAxisAngle(e.l, x.eyePitch * TURN.eyePitch * M.nodSign)).multiply(e.q);
    for (const c of M.clav) c.b.position.copy(c.p).addScaledVector(c.u, x.shoulders * TURN.shoulders * c.k);
    const pal = sat(x.pallor), fl = sat(x.flush) * (1 - pal), b = M.base, mixc = i => b[i] * (1 + (LOOK.flush[i] - 1) * fl) * (1 + (LOOK.pallor[i] - 1) * pal);
    for (const m of M.skin) { m.color.setRGB(mixc(0), mixc(1), mixc(2)); m.roughness = 0.8 - LOOK.sweat * sat(x.sweat); }
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
    const ev = this.ev = this.recent(s.battle, t), t0 = performance.now();
    for (const r of ROLES) { const M = this.men[r], m = s.crew.who[r];
      let T = this.target(M, m, t, ev, s.speaking && s.speaking.toLowerCase() === r); if (this.hold && this.hold[r]) T = Object.assign(T, this.hold[r]);
      if (jumped) M.sp.snap(T); else M.sp.step(T, step); this.pose(M); }
    this.draw(s);
    this.ms += (performance.now() - t0 - this.ms) * 0.2; this.draws++;
  }
  // seconds since the last hit on the vehicle and since the last blast close to it (Trophy firing, a warhead bursting on the ground near by)
  recent(B, t) {
    const E = B.events || [], out = { hit: 99, near: 99 };
    for (let i = E.length - 1, n = 0; i >= 0 && n < 80; i--, n++) { const e = E[i]; if (e.type !== 'end' || e.t > t || t - e.t > 15) continue;
      if (e.how === 'hit') out.hit = Math.min(out.hit, t - e.t); else if (t - e.t > 3) continue; else if (e.how === 'aps_kill' || e.how === 'ground' || e.how === 'miss') out.near = Math.min(out.near, t - e.t); }
    return out;
  }
  draw(s) {
    const R = this.gl, cv = R.domElement;
    const alarm = sat(1 - (this.ev ? this.ev.hit : 99) / 14);   /* the red emergency lamp: on at a hit, fading over 14 s */
    ROLES.forEach((r, i) => { const m = s.crew.who[r], st = m.status === 'down' ? 0 : sat(((m.stress || 0) - 0.3) / 0.6);   /* the light on a face turns cooler and harder as his stress rises */
      this.lamp.color.setRGB(1, 0.89 + 0.06 * st, 0.74 + 0.26 * st); this.lamp.intensity = 3.4 + 1.6 * st; this.hemi.intensity = 1.25 - 0.6 * st - 0.35 * alarm; this.red.intensity = 2.6 * alarm;
      R.setViewport(i * W, 0, W, H); R.setScissor(i * W, 0, W, H); R.render(this.scene, this.men[r].cam); });
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
      _v.setFromMatrixPosition(M.head.matrixWorld).addScaledVector(M.U, 0.098).addScaledVector(M.F, 0.085).addScaledVector(M.L, (M.i % 2 ? 0.05 : -0.05)).project(M.cam);   /* on the cheekbone, below the helmet's rim */
      const px = (_v.x + 1) / 2 * cv.width, py = (1 - _v.y) / 2 * cv.height, u = cv.height / 200;
      x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
      const side = M.i % 2 ? 1 : -1;
      x.fillStyle = 'rgba(38,3,3,.9)'; x.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, rr = (2.2 + 2.4 * hash(k, sd + 21)) * u; x.lineTo(px + Math.cos(a) * rr * 1.5, py + Math.sin(a) * rr); } x.closePath(); x.fill();   /* the wound: a dark ragged patch */
      for (let k = 0; k < 4; k++) {   /* runs: thin, uneven, each finding its own way down the cheek, thicker where it gathers */
        const len = (16 + 42 * hash(k, sd + 2)) * grow * u; if (len < 2 * u) continue; let cx = px + (hash(k, sd) - 0.5) * 7 * u, cy = py + 1.5 * u; const n = 7;
        for (let j = 0; j < n; j++) { const nx = cx + (hash(k * 13 + j, sd + 4) - 0.5 + side * 0.12) * 3.4 * u, ny = cy + len / n; x.strokeStyle = `rgba(${52 + 22 * hash(k, sd + 8)},4,4,${0.82 - 0.3 * j / n})`; x.lineWidth = (0.7 + 1.1 * hash(k * 7 + j, sd + 6) + (j === n - 1 ? 0.9 : 0)) * u; x.beginPath(); x.moveTo(cx, cy); x.lineTo(nx, ny); x.stroke(); cx = nx; cy = ny; }
      }
      x.fillStyle = 'rgba(46,4,4,.6)'; x.beginPath(); x.ellipse(px + side * 2 * u, py + 3 * u, 7 * u, 10 * u * (0.4 + 0.6 * grow), 0.2 * side, 0, 6.3); x.globalAlpha = 0.35; x.fill(); x.globalAlpha = 1;   /* the smear around it */
      x.fillStyle = 'rgba(60,5,5,.7)'; for (let k = 0; k < 12; k++) { const rr = (0.5 + hash(k, sd + 15) * hash(k, sd + 16) * 2.6) * u; x.beginPath(); x.ellipse(px + (hash(k, sd + 11) - 0.5 + side * 0.25) * 70 * u, py + (48 + hash(k, sd + 13) * 70) * u, rr, rr * (1 + hash(k, sd + 17)), hash(k, sd + 18) * 3, 0, 6.3); x.fill(); }   /* spatter on the collar and chest */
      x.restore();
    }
    if (down) { x.fillStyle = 'rgba(4,6,5,.3)'; x.fillRect(0, 0, cv.width, cv.height); }
  }
  // forget where the springs were (a new battle, a rewind)
  reset() { this.tLast = null; this.note = {}; this.acc = 0; }
}
