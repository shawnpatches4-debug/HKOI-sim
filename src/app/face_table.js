// The crew's expressions: ONE table and ONE set of recipes, used both by the portraits in the crew panel (faces.js) and by the men
// in their seats (render/interior_crewfig.js), so that the same man shows the same face in both.
// Moved here from faces.js on 15 Nov 2026 unchanged, then extended (wound kinds, burns, relief, prayer, cursing, veterans' set faces).
import * as THREE from 'three';

export const STATES = ['steady', 'strained', 'shaken', 'panicked'];
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
  cdrSkinLift: 0.5,                // the commander's face: every colour of the gunner's head picture raised to this power (dark brown becomes light) ...
  cdrSkin: [1.0, 0.84, 0.72],      // ... and then multiplied by these (red, green, blue): a light tan, plainly not the gunner
  cdrHelmet: [0.5, 0.62, 0.3],     // his helmet: the camouflage cover multiplied to a plain olive; its goggles and their strap removed
  pallor: [0.62, 0.74, 0.8],       // a face that has lost all its colour (shaken about half way, wounded three quarters, dead fully)
  flush: [1.1, 0.93, 0.9],         // a strained face, before fear takes the colour out again
  sweat: 0.24,                     // how far the skin's roughness drops at full strain (a wet sheen)
};
// The limits every channel is held to, so no state can push the face past what the skin stands (found by looking at pictures).
export const LIMIT = { browUp: 1, browDown: 1, lid: 1, wide: 1, squeeze: 1, stretch: 1, frown: 1, snarl: 1, tight: 1, jaw: 1, thrust: 1, flush: 1, sweat: 1, pitch: 0.32, yaw: 0.6, roll: 0.45,   /* a head ducked further than 0.32 hides the face under the helmet */ eyeYaw: 1, eyePitch: 1, shoulders: 1.2, pallor: 1 };
export const CHANNELS = Object.keys(LIMIT);
// how quickly each channel follows its target (per second; higher is quicker): lids snap, heads are heavy
export const SPEED = { thrust: 8, flush: 1.2, sweat: 0.6, lid: 34, squeeze: 26, wide: 16, jaw: 22, eyeYaw: 20, eyePitch: 20, pitch: 9, yaw: 7, roll: 7, shoulders: 9, pallor: 0.8 };

export const hash = (i, sd) => { const v = Math.sin(i * 127.1 + sd * 311.7) * 43758.5453; return v - Math.floor(v); };
export const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const key = n => String(n).replace(/[^A-Za-z0-9]/g, '');
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// one man's channels: value and speed for each, stepped as critically damped springs (exact for any length of step)
export class Springs {
  constructor() { this.x = {}; this.v = {}; for (const c of CHANNELS) { this.x[c] = 0; this.v[c] = 0; } }
  step(T, dt) {
    for (const c of CHANNELS) {
      const w = SPEED[c] || 14, tgt = Math.max(-LIMIT[c], Math.min(LIMIT[c], T[c] || 0)), e = Math.exp(-w * dt), d = this.x[c] - tgt, tmp = (this.v[c] + w * d) * dt;
      this.v[c] = (this.v[c] - w * tmp) * e; this.x[c] = tgt + (d + tmp) * e;
    }
  }
  snap(T) { for (const c of CHANNELS) { this.x[c] = Math.max(-LIMIT[c], Math.min(LIMIT[c], T[c] || 0)); this.v[c] = 0; } }
}

// Find and measure the face bones of a crew figure that stands in its rest pose. given: { L, U, F, unit } if already measured.
// Returns what facePose needs: every face bone's rest place and the head's own directions in that bone's parent, the jaw, eyes,
// neck, collar bones, and which way round each turn goes on this model.
export function faceRig(fig, given) {
  const B = {}; fig.traverse(o => { if (o.isBone) B[key(o.name)] = o; }); fig.updateMatrixWorld(true);
  const head = B.Bip01Head, le = B.Bip01LEye, re = B.Bip01REye, pelvis = B.Bip01Pelvis || B.Bip01; if (!head || !le || !re || !pelvis) return null;
  const wp = b => b.getWorldPosition(new THREE.Vector3()); let L, U, F, unit;
  if (given) ({ L, U, F, unit } = given); else { L = wp(le).sub(wp(re)).normalize(); U = wp(head).sub(wp(pelvis)).normalize(); U.addScaledVector(L, -U.dot(L)).normalize();
    const eyes = wp(le).add(wp(re)).multiplyScalar(0.5); F = new THREE.Vector3().crossVectors(L, U).normalize(); if (F.dot(_v.copy(eyes).sub(wp(head))) < 0) F.negate(); unit = wp(le).distanceTo(wp(re)) / 0.064; }
  const take = b => { if (!b) return null; const pinv = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); _m.copy(b.parent.matrixWorld).decompose(_p, _q, _s);
    return { b, p: b.position.clone(), q: b.quaternion.clone(), u: U.clone().applyQuaternion(pinv), f: F.clone().applyQuaternion(pinv), l: L.clone().applyQuaternion(pinv), k: unit / (_s.x || 1) / 1000 }; };
  const shifts = {}, rec = {}, get = n => rec[n] || (rec[n] = take(B['Bip01' + n]));
  for (const [ch, list] of Object.entries(SHIFT)) { shifts[ch] = []; for (const [name, up, fwd, out] of list) {
    if (name[0] === 'M' && get(name)) shifts[ch].push({ r: get(name), up, fwd, out: 0 });
    else for (const [s, sg] of [['R', -1], ['L', 1]]) if (get(s + name)) shifts[ch].push({ r: get(s + name), up, fwd, out: out * sg }); } }
  const neck = take(B.Bip01Neck), jaw = take(B.Bip01MJaw), hd = take(head), eyeL = take(le), eyeR = take(re), clav = [take(B.Bip01LClavicle), take(B.Bip01RClavicle)].filter(Boolean);
  const eyes = wp(le).add(wp(re)).multiplyScalar(0.5), chin = B.Bip01MBottomLip && B.Bip01MJaw ? wp(B.Bip01MBottomLip).sub(wp(B.Bip01MJaw)) : F.clone(), jawSign = _v.crossVectors(L, chin).dot(U) < 0 ? 1 : -1;
  const face = eyes.clone().sub(wp(head)), nodSign = _v.crossVectors(L, face.lengthSq() > 1e-8 ? face : F).dot(U) < 0 ? 1 : -1, yawSign = _v.crossVectors(U, F).dot(L) > 0 ? 1 : -1;
  return { B, head, rec, shifts, neck, jaw, hd, eyeL, eyeR, clav, jawSign, nodSign, yawSign, U, F, L, unit, eyes };
}

  // ---- what each face should be doing at battle time t. Returns the channel targets.
  // m: his entry in battle.crewState().who; ev: { hit, near } seconds since the last hit on the vehicle and the last blast close by
export function faceTarget(M, m, t, ev, speaking, N, X) {
    const sd = M.seed, k = Math.max(0, STATES.indexOf(m.state)), s = m.stress || 0, tense = sat((s - 0.2) / 0.3), fear = sat((s - 0.5) / 0.3), panic = k === 3;
    const down = m.status === 'down', hurt = m.status === 'wounded', frozen = /frozen/.test(m.busy || '');
    if (hurt && (N.w == null || t < N.w)) N.w = t; if (!hurt && !down) N.w = null; if (down && (N.d == null || t < N.d)) N.d = t; if (!down) N.d = null;
    if (down) {   /* out of action or dead: the head sinks, the eyes close (a dead man's stay half open), the colour drains */
      const d = sat((t - N.d) / 1.6), side = M.i % 2 ? 1 : -1, dead = /killed/.test(m.busy || '') || !!(X && X.look && X.look.dead), burnt = X && X.look ? X.look.burn : 0;
      if (dead) return { lid: burnt > 0.5 ? 1 : 0.55, jaw: 0.38 * d, pitch: -0.26 * d, roll: 0.4 * d * side, yaw: 0.2 * side * d, shoulders: -0.6 * d, thrust: -0.5 * d, pallor: d, eyeYaw: 0.5 * side, eyePitch: 0.6, frown: 0.3 * d };   /* a dead man: eyes half open and turned up, jaw slack, all colour gone */
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
        // ---- what the seated figures and the portraits share beyond the crew model's four states (X: { look, mood, moodAge, quality, lookAt, lookDown })
    if (X) { const L = X.look, q = X.quality, vet = q === 'veteran' || q === 'expert';
      if (vet && !panic && !hurt && k >= 1) { T.browUp *= 0.3; T.wide *= 0.4; T.jaw = speaking ? T.jaw : 0; T.tight = Math.max(T.tight, 0.9); T.browDown = Math.max(T.browDown, 0.7); T.frown = Math.max(T.frown, 0.5); T.stretch = 0; T.pallor *= 0.5; }   /* an old hand works through it with a set face */
      if (L && L.burn > 0.05 && !down) { T.squeeze = Math.max(T.squeeze, 0.7); T.snarl = 1; T.stretch = 1; T.jaw = Math.max(T.jaw, 0.5 + 0.4 * Math.abs(Math.sin(t * 6 + sd))); }   /* burnt: crying out */
      if (L && L.hurt && L.worst && (L.worst.kind === 'sever' || L.worst.kind === 'trauma')) { const cry = ((t + sd) % 2.6) < 1.5; T.jaw = cry ? 0.95 : 0.4; T.stretch = 1; T.squeeze = cry ? 1 : 0.5; T.lid = cry ? 1 : 0.3; T.browUp = 0.8; T.pallor = 0.95; }   /* a limb gone: screaming, then gasping */
      if (X.mood === 'relief') { const a = X.moodAge || 0; if (a < 5) { T.lid = 1; T.squeeze = 0; T.wide = 0; T.browUp = 0.5; T.browDown = 0; T.tight = 0; T.frown = 0.2; T.jaw = 0.25 + 0.2 * Math.sin(Math.min(a, 3) * 1.2); T.stretch = 0; T.pitch = -0.25; T.shoulders = -0.4 + 0.5 * Math.sin(a * 1.3); T.pallor = 0.3; T.thrust = -0.5; }
        else { T.lid = hash(Math.floor(t * 3), sd) < 0.4 ? 1 : 0.4; T.browUp = 0.7; T.jaw = 0.2 + 0.12 * Math.sin(t * 9); T.frown = 0.6; T.pitch = 0.25; T.roll = 0.02 * Math.sin(t * 23 + sd); T.shoulders = 0.3 + 0.3 * Math.sin(t * 8); } }   /* head back, eyes shut, a long breath out; then it catches up with him and he shakes */
      if (X.mood === 'pray' && !speaking) { T.lid = 1; T.squeeze = 0.4; T.wide = 0; T.jaw = 0.08 + 0.14 * Math.max(0, Math.sin(t * 13 + sd)); T.pitch = 0.25; T.browUp = 0.9; T.stretch = 0.1; }   /* eyes shut, lips moving */
      if (X.mood === 'curse') { T.snarl = 1; T.browDown = 1; T.browUp = 0; T.jaw = 0.3 + 0.5 * Math.max(0, Math.sin(t * 9 + sd)); T.stretch = 0.6; T.squeeze = 0.3; T.wide = 0; }
      if (X.mood === 'shout') { T.jaw = Math.max(T.jaw, 0.55 + 0.4 * Math.max(0, Math.sin(t * 17 + sd))); T.stretch = Math.max(T.stretch, 0.7); T.browDown = Math.max(T.browDown, 0.6); T.thrust = 0.8; }
      if (X.lookAt != null && !down) { T.eyeYaw = X.lookAt; T.eyePitch = X.lookDown || 0; } }
    return T;
}

  // put a man's channel values onto his bones
export function facePose(M, x, full = true) {
    for (const r of Object.values(M.rec)) if (r) r.b.position.copy(r.p);
    for (const ch of Object.keys(SHIFT)) { const a = x[ch]; if (Math.abs(a) < 1e-4) continue; for (const h of M.shifts[ch]) { const r = h.r, kk = a * r.k; r.b.position.addScaledVector(r.u, h.up * kk).addScaledVector(r.f, h.fwd * kk).addScaledVector(r.l, h.out * kk); } }
    if (M.jaw) M.jaw.b.quaternion.copy(_q.setFromAxisAngle(M.jaw.l, x.jaw * TURN.jaw * M.jawSign)).multiply(M.jaw.q);
    if (!full) return;   /* the seated figures: their heads, necks and shoulders are moved by the body's own pose */
    const hd = M.hd; hd.b.quaternion.copy(_q.setFromAxisAngle(hd.u, x.yaw * 0.65 * M.yawSign)).multiply(_q2.setFromAxisAngle(hd.l, x.pitch * 0.7 * M.nodSign)).multiply(_q2.setFromAxisAngle(hd.f, x.roll * 0.65)).multiply(hd.q);
    hd.b.position.copy(hd.p).addScaledVector(hd.f, x.thrust * TURN.thrust * hd.k);
    const nk = M.neck; if (nk) nk.b.quaternion.copy(_q.setFromAxisAngle(nk.u, x.yaw * 0.35 * M.yawSign)).multiply(_q2.setFromAxisAngle(nk.l, x.pitch * 0.3 * M.nodSign)).multiply(_q2.setFromAxisAngle(nk.f, x.roll * 0.35)).multiply(nk.q);   /* the neck takes a third of every turn of the head */
    for (const e of [M.eyeL, M.eyeR]) e.b.quaternion.copy(_q.setFromAxisAngle(e.u, x.eyeYaw * TURN.eyeYaw * M.yawSign)).multiply(_q2.setFromAxisAngle(e.l, x.eyePitch * TURN.eyePitch * M.nodSign)).multiply(e.q);
    for (const c of M.clav) c.b.position.copy(c.p).addScaledVector(c.u, x.shoulders * TURN.shoulders * c.k);
    const pal = sat(x.pallor), fl = sat(x.flush) * (1 - pal), b = M.base, mixc = i => b[i] * (1 + (LOOK.flush[i] - 1) * fl) * (1 + (LOOK.pallor[i] - 1) * pal);
    for (const m of M.skin || []) { m.color.setRGB(mixc(0), mixc(1), mixc(2)); m.roughness = 0.8 - LOOK.sweat * sat(x.sweat); }
}
