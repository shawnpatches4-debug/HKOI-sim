// The four crewmen in their seats: the crew models of the owner's original simulator (assets/crew/crew_gunner.json, crew_loader.json,
// crew_driver.json; the old page had no commander model, so the commander is a second copy of the gunner's), posed and driven the
// way the old page did it (src/cab.js): a small library of poses given as turns of each joint, a short list of things each man does in
// each state of mind, his head held at the seat's eye point. What is new: the state of mind is the battle's own crew model
// (steady, strained, shaken, panicked; wounded; down), the hands are then brought onto the real controls, and they are lit by the
// interior's lamps. Everything runs on the battle clock, so a replay shows the same thing.
//
// The models are loaded only through loadModel in units.js (the hosting page allows no other way). Until they have arrived, and if they
// are missing, the seats are simply empty. A fault in here must never stop the interior: update() catches its own errors.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { DIM } from './interior_build.js';

const DEG = Math.PI / 180, hsh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
// ---- pose library of the old simulator: degrees [x, y, z] for each joint, layered (legs, trunk, arms, head)
const PL = {
  seat: { L_Thigh: [0, 0, 90], R_Thigh: [0, 0, 90], L_Calf: [0, 0, -90], R_Calf: [0, 0, -90] },
  seatHigh: { L_Thigh: [0, 0, 78], R_Thigh: [0, 0, 82], L_Calf: [0, 0, -100], R_Calf: [0, 0, -85] },
  crouch: { L_Thigh: [0, 0, 75], R_Thigh: [0, 0, 70], L_Calf: [0, 0, -110], R_Calf: [0, 0, -105] },
  recline: { L_Thigh: [0, 0, 62], R_Thigh: [0, 0, 62], L_Calf: [0, 0, -50], R_Calf: [0, 0, -54], Spine: [0, 0, -48] },   /* deeper than the old page's: this hull is lower */
  armsDown: { L_UpperArm: [0, 48, -8], R_UpperArm: [0, -48, -8], L_Forearm: [0, 0, -12], R_Forearm: [0, 0, -12] },
  yoke: { L_UpperArm: [0, 30, -58], R_UpperArm: [0, -30, -58], L_Forearm: [0, 0, -55], R_Forearm: [0, 0, -55] },
  handle: { L_UpperArm: [0, 30, -35], R_UpperArm: [0, -25, -48], L_Forearm: [0, 0, -75], R_Forearm: [0, 0, -65] },
  overhead: { L_UpperArm: [0, 10, -150], R_UpperArm: [0, -45, -10], L_Forearm: [0, 0, -30], R_Forearm: [0, 0, -15] },
  scope: { L_UpperArm: [0, 15, -130], R_UpperArm: [0, -15, -130], L_Forearm: [0, 0, -70], R_Forearm: [0, 0, -70] },
  point: { L_UpperArm: [0, 30, -35], R_UpperArm: [0, -20, -100], L_Forearm: [0, 0, -75], R_Forearm: [0, 0, -12] },
  guard: { L_UpperArm: [0, 10, -125], R_UpperArm: [0, -10, -125], L_Forearm: [0, 0, -115], R_Forearm: [0, 0, -115] },
  tbar: { L_UpperArm: [0, 25, -40], R_UpperArm: [0, -25, -40], L_Forearm: [0, 0, -35], R_Forearm: [0, 0, -35] },
  slump: { L_UpperArm: [0, 40, -15], R_UpperArm: [0, -38, -20], L_Forearm: [0, 0, -10], R_Forearm: [0, 0, -8] },
};
const merge = (...ps) => { const o = {}; for (const p of ps) for (const k in p) o[k] = p[k].slice(); return o; };
const HUNCH = { L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] };
// What each man does in each state: [seconds, pose, hands stay on the controls]. From the old table, with the loader seated (this turret
// is too low for him to stand) and "panic" keeping the old page's frozen and frantic actions.
const A = (s, p, grip = true) => [s, p, grip];
const ACT = {
  gnr: { legs: PL.seat,
    calm: [A(5, merge(PL.yoke, { Spine1: [0, 0, 16], Head: [0, 0, 8] })), A(2.5, merge(PL.yoke, { Spine1: [-18, 0, 10], Head: [-35, 0, 4] }))],
    alert: [A(4, merge(PL.yoke, { Spine1: [0, 0, 22], Head: [0, 0, 12] })), A(1.2, merge(PL.yoke, { Spine1: [-12, 0, 16], Head: [-40, 0, 2] }))],
    stressed: [A(3, merge(PL.yoke, HUNCH, { Spine1: [0, 0, 28], Neck: [0, 0, 6], Head: [0, 0, 16] })), A(0.8, merge(PL.yoke, { Spine1: [0, 0, 18], Head: [0, 0, 2], R_UpperArm: [0, -15, -120], R_Forearm: [0, 0, -120] }), false)],
    panic: [A(1.3, merge(PL.yoke, HUNCH, { Spine1: [0, 0, 32], Neck: [0, 0, 8], Head: [0, 0, 16] })), A(1.5, merge(PL.guard, HUNCH, { Spine1: [0, 0, 30], Head: [0, 0, 22] }), false), A(0.6, merge(PL.yoke, HUNCH, { Spine1: [-10, 0, 28], Head: [-45, 0, 6] }))],
    shock: [A(9, merge(PL.guard, { Spine1: [0, 0, 40], Head: [0, 0, 28] }), false)] },
  cdr: { legs: PL.seatHigh,
    calm: [A(5, merge(PL.handle, { Spine1: [0, 0, 4], Head: [0, 0, -8] })), A(3, merge(PL.handle, { Spine1: [-14, 0, 8], Head: [-48, 0, 12] })), A(3, merge(PL.armsDown, { Spine1: [0, 0, 22], Head: [0, 0, 30], R_Forearm: [0, 0, -70] }), false)],
    alert: [A(2.5, merge(PL.handle, { Spine1: [0, 0, 4], Head: [0, 0, -8] })), A(1.6, merge(PL.handle, { Spine1: [-14, 0, 8], Head: [-48, 0, 12] })), A(1.5, merge(PL.handle, { Spine1: [0, 0, 10], Head: [0, 0, 4], R_Forearm: [0, 0, -80] }))],
    stressed: [A(1.6, merge(PL.point, { Spine1: [0, 0, 4] }), false), A(1.4, merge(PL.handle, { Spine1: [-14, 0, 10], Head: [-48, 0, 12], L_UpperArm: [0, 20, -95], L_Forearm: [0, 0, -125] }), false), A(1.3, merge(PL.handle, { Spine1: [0, 0, 30], Head: [0, 0, 18] }))],
    panic: [A(0.9, merge(PL.point, HUNCH, { Spine1: [0, 0, 16] }), false), A(1.6, merge(PL.guard, HUNCH, { Spine1: [-12, 0, 20], Head: [-30, 0, 22] }), false), A(0.7, merge(PL.handle, HUNCH, { Spine1: [0, 0, 12], Head: [0, 0, -8] }))],
    shock: [A(9, merge(PL.guard, { Spine1: [0, 0, 34], Head: [0, 0, 25] }), false)] },
  ldr: { legs: PL.seat,
    calm: [A(6, merge(PL.armsDown, { Spine1: [0, 0, 6], L_Forearm: [0, 0, -60], R_Forearm: [0, 0, -50] }), false), A(3, merge(PL.armsDown, { Spine1: [60, 0, 6], Head: [40, 0, 6] }), false)],
    alert: [A(3, merge(PL.scope, { Spine1: [0, 0, 8], Head: [0, 0, -12] }), false), A(1.5, merge(PL.handle, { Spine1: [40, 0, 10], Head: [30, 0, 10] }), false)],
    stressed: [A(1.8, merge(PL.overhead, { Spine1: [0, 0, 10], Head: [0, 0, -10] }), false), A(1.4, merge(PL.handle, { Spine1: [50, 0, 14], Head: [40, 0, 4] }), false)],
    panic: [A(1.0, merge(PL.overhead, HUNCH, { Spine1: [0, 0, 16], Head: [0, 0, 6], R_UpperArm: [0, -10, -150], R_Forearm: [0, 0, -30] }), false), A(1.4, merge(PL.guard, HUNCH, { Spine1: [0, 0, 26], Head: [0, 0, 20] }), false)],
    shock: [A(9, merge(PL.guard, { Spine1: [0, 0, 35], Head: [0, 0, 25] }), false)],
    load: [A(1, merge(PL.tbar, { Spine1: [60, 0, 18], Head: [20, 0, 6], L_UpperArm: [0, 25, -75], R_UpperArm: [0, -25, -75] }))] },
  drv: { legs: PL.recline,
    calm: [A(8, merge(PL.tbar)), A(3, merge(PL.tbar, { Head: [0, 0, 18] }))],
    alert: [A(4, merge(PL.tbar, { Spine1: [0, 0, 8] }))],
    stressed: [A(2, merge(PL.tbar, { Spine1: [0, 0, 16], Head: [0, 0, -6] })), A(1, merge(PL.tbar, { Spine1: [0, 0, 12], Head: [25, 0, 10] }))],
    panic: [A(1.0, merge(PL.tbar, HUNCH, { Spine1: [0, 0, 20], Head: [0, 0, -8] })), A(1.5, merge(PL.guard, HUNCH, { Spine1: [0, 0, 14], Head: [0, 0, 14] }), false)],
    shock: [A(9, merge(PL.guard, { Spine1: [0, 0, -8] }), false)] },
};
const WOUND = { L_UpperArm: [0, 22, -62], L_Forearm: [0, 0, -128], R_UpperArm: [0, -40, -18], R_Forearm: [0, 0, -20], Spine1: [10, 14, 20], Head: [14, 8, 18] };   /* left hand clamped to the wound, folded over it */
const DOWN = merge(PL.slump, { Spine: [0, 6, 18], Spine1: [-8, 16, 38], Neck: [0, 0, 14], Head: [18, 10, 34] });                                             /* slumped where he sat */
const PHASE = { steady: 'calm', strained: 'alert', shaken: 'stressed', panicked: 'panic' };
const FILE = { gnr: 'gunner', cdr: 'gunner', ldr: 'loader', drv: 'driver' }, ROT = { gnr: Math.PI, cdr: Math.PI, ldr: Math.PI * 0.72, drv: Math.PI }, HULL = { drv: true };
const qX = new THREE.Quaternion(), qY = new THREE.Quaternion(), qZ = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();

function bloodTexture() {   /* blotches for a blood-soaked uniform: repeats over the figure */
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); let s = 17; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { const r = 3 + R() * (i < 8 ? 26 : 9); x.fillStyle = `rgba(${96 + R() * 40 | 0},${R() * 10 | 0},${R() * 8 | 0},${0.6 + R() * 0.4})`; for (const [ox, oy] of [[0, 0], [128, 0], [0, 128], [-128, 0], [0, -128]]) { x.beginPath(); x.ellipse(R() * 0 + (i * 37 % 128) + ox, (i * 61 % 128) + oy, r, r * 0.7, i, 0, 7); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export class CrewFigures {
  // cab: (opts) => a material of the interior (opts.skinned for these figures); groups { tur, hul }; base: the asset folder
  constructor(cab, groups, base) {
    this.G = groups; this.cab = cab; this.men = {}; this.ready = false; this.failed = false; this.tris = 0; this.blood = null; this.err = 0;
    if (!base || typeof fetch === 'undefined') { this.failed = true; return; }
    import('./units.js').then(U => Promise.all(['gunner', 'loader', 'driver'].map(k => U.loadModel(base + 'crew/crew_' + k + '.json')))).then(([g, l, d]) => {
      if (!g || !l || !d) { this.failed = true; return; } const src = { gunner: g, loader: l, driver: d }; this.blood = bloodTexture();
      for (const r of ['gnr', 'cdr', 'ldr', 'drv']) this.men[r] = this._make(src[FILE[r]], r); this.ready = true;
    }).catch(e => { this.failed = true; console.warn('crew figures not shown:', e && e.message); });
  }
  _make(src, role) {
    const m = cloneSkinned(src), B = {}, rest = {}, mats = [], g = new THREE.Group(); let tris = 0;
    m.traverse(o => { if (o.isBone) B[o.name.replace(/^Bip01[_ ]/, '').replace(/ /g, '_')] = o;
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; const n = (o.material && o.material.name) || ''; if (/knife|pistol/.test(n)) { o.visible = false; return; }
        // tank crew, not infantry (as the old page did): plain coveralls instead of camouflage, a dark crew helmet
        const tint = /_body$/.test(n) ? [0.62, 0.64, 0.5] : /_helmet$/.test(n) ? [0.3, 0.31, 0.27] : /_equipment$/.test(n) ? [0.56, 0.53, 0.42] : [1, 1, 1];
        const mat = this.cab({ skinned: true, map: o.material ? o.material.map : null, tint, blood: this.blood }); mat.userData.tint0 = tint; mat.userData.cloth = /_body$|_equipment$/.test(n); o.material = mat; mats.push(mat);
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    for (const k in B) rest[k] = B[k].quaternion.clone(); g.add(m); g.rotation.y = ROT[role]; g.visible = false; this.G[HULL[role] ? 'hul' : 'tur'].add(g); this.tris += tris;
    return { g, m, B, rest, mats, role, P: {}, lvl: -1 };
  }
  // joints: every one back to rest, then the pose's turns (the old page's applyPose)
  _apply(r, P) { for (const k in r.rest) { const b = r.B[k], p = P[k]; b.quaternion.copy(r.rest[k]); if (!p) continue; qZ.setFromAxisAngle(AZ, (p[2] || 0) * DEG); qY.setFromAxisAngle(AY, (p[1] || 0) * DEG); qX.setFromAxisAngle(AX, (p[0] || 0) * DEG); b.quaternion.multiply(qZ).multiply(qY).multiply(qX); } }
  // which action of a list is running at battle time t, and the one before it with how far the change-over has got (so the man moves, not jumps)
  _pick(list, t, seed) { let tot = 0; for (const a of list) tot += a[0]; let u = ((t + seed * 3.7) % tot + tot) % tot, i = 0; while (u >= list[i][0]) { u -= list[i][0]; i++; } return [list[i], list[(i + list.length - 1) % list.length], Math.min(1, u / 0.4)]; }
  // bring a hand onto a point (in the group's frame): turn the upper arm and forearm so the wrist reaches it, elbow held down and out
  _reach(r, side, target, grp) {
    const up = r.B[side + '_UpperArm'], fo = r.B[side + '_Forearm'], ha = r.B[side + '_Hand']; if (!up || !fo || !ha) return;
    up.getWorldPosition(_a); fo.getWorldPosition(_b); ha.getWorldPosition(_c); const l1 = _b.distanceTo(_a), l2 = _c.distanceTo(_b); _t.set(target[0], target[1], target[2]); grp.localToWorld(_t);
    _d.copy(_t).sub(_a); const want = _d.length() || 1e-4, dist = Math.max(Math.abs(l1 - l2) * 1.05 + 1e-4, Math.min(want, (l1 + l2) * 0.985)); _d.divideScalar(want);
    const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    _e.set(side === 'L' ? -0.5 : 0.5, -1, 0).transformDirection(grp.matrixWorld); _e.addScaledVector(_d, -_e.dot(_d)); if (_e.lengthSq() < 1e-6) _e.set(0, -1, 0); _e.normalize();
    const elbow = _e.multiplyScalar(out).addScaledVector(_d, along).add(_a), wrist = _t.copy(_a).addScaledVector(_d, dist);
    this._turn(up, _b.sub(_a).normalize(), _c.copy(elbow).sub(_a).normalize()); fo.getWorldPosition(_b); ha.getWorldPosition(_c); this._turn(fo, _c.sub(_b).normalize(), _d.copy(wrist).sub(_b).normalize());
  }
  _turn(b, from, to) { _q.setFromUnitVectors(from, to); b.getWorldQuaternion(_wq); b.parent.getWorldQuaternion(_pq); b.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq))); b.updateMatrixWorld(true); }

  // men: { gnr: { on, head [x,y,z], hands [[x,y,z],[x,y,z]] (left, right), state, status, frozen, brace, flinch, bodyOnly, blood, load (0..1 or -1) }, ... }; t = battle time
  update(men, t) {
    if (!this.ready) return;
    try { for (const role of ['gnr', 'cdr', 'ldr', 'drv']) { const r = this.men[role], M = men[role], on = !!(M && M.on); if (r.g.visible !== on) r.g.visible = on; if (!on) continue;
      const Rr = ACT[role], grp = this.G[HULL[role] ? 'hul' : 'tur'], down = M.status === 'down', hurt = M.status === 'wounded'; let grip = true, P;
      if (down) { P = merge(Rr.legs, DOWN); grip = false; }
      else { const list = M.flinch > 0.55 ? Rr.shock : role === 'ldr' && M.load >= 0.05 && M.load < 0.86 ? Rr.load : Rr[M.frozen ? 'panic' : PHASE[M.state] || 'calm'], [cur, prev, k] = this._pick(list, t, role.charCodeAt(0));
        P = merge(Rr.legs, cur[1]); grip = cur[2];
        if (k < 1) { const Q = merge(Rr.legs, prev[1]), e = k * k * (3 - 2 * k); for (const j in Q) if (!P[j]) P[j] = [0, 0, 0]; for (const j in P) { const q = Q[j] || [0, 0, 0], p = P[j]; p[0] = q[0] + (p[0] - q[0]) * e; p[1] = q[1] + (p[1] - q[1]) * e; p[2] = q[2] + (p[2] - q[2]) * e; } if (!prev[2]) grip = grip && k > 0.6; }
        if (hurt) { for (const j in WOUND) { const w = WOUND[j], p = P[j] || (P[j] = [0, 0, 0]); if (/Arm$|Forearm$/.test(j)) { p[0] = w[0]; p[1] = w[1]; p[2] = w[2]; } else { p[0] += w[0]; p[1] += w[1]; p[2] += w[2]; } } }
        // breathing; tremor when shaken or worse; thrown by an impact; shoulders up and head down when a hit is about to land
        const add = (j, x, y, z) => { const p = P[j] || (P[j] = [0, 0, 0]); p[0] += x; p[1] += y; p[2] += z; }, bad = M.state === 'panicked' || M.state === 'shaken' ? (M.state === 'panicked' ? 1 : 0.55) : 0;
        add('Spine1', 0, 0, Math.sin(t * 1.5 + role.charCodeAt(1)) * (1 + bad * 1.5) + M.flinch * 12 + M.brace * 7); add('Head', (hsh(Math.floor(t * 13), 3) - 0.5) * 5 * bad, 0, (hsh(Math.floor(t * 13), 8) - 0.5) * 4 * bad + M.flinch * 9 + M.brace * 8);
        if (M.brace || bad) { add('L_Clavicle', 0, -8 * Math.max(M.brace, bad), 0); add('R_Clavicle', 0, 8 * Math.max(M.brace, bad), 0); } }
      this._apply(r, P);
      // the viewer in this seat: no head of his own in front of his eyes (the old page did the same), but his own arms and legs
      const hs = M.bodyOnly ? 0.001 : 1; if (r.B.Head && r.B.Head.scale.x !== hs) r.B.Head.scale.setScalar(hs);
      // stand him so that his head is at the seat's eye point
      r.g.position.set(0, 0, 0); r.g.updateMatrixWorld(true); r.B.Head.getWorldPosition(_a); grp.worldToLocal(_a); r.g.position.set(M.head[0] - _a.x, M.head[1] - _a.y - 0.06 - (down ? 0.1 : 0), M.head[2] - _a.z + 0.05); r.g.updateMatrixWorld(true);
      if (grip && !down) { if (!(hurt)) this._reach(r, 'L', M.hands[0], grp); this._reach(r, 'R', M.hands[1], grp); }
      // blood: the uniform darkens and stains, more for the dead than for the wounded (the old page's treatment, made plain to see)
      const lvl = M.blood === 'killed' ? 2 : M.blood ? 1 : 0; if (lvl !== r.lvl) { r.lvl = lvl; for (const m of r.mats) { const t0 = m.userData.tint0, k = lvl === 2 ? [0.62, 0.2, 0.18] : lvl === 1 ? [0.85, 0.5, 0.46] : [1, 1, 1]; m.uniforms.uTint.value.set(t0[0] * k[0], t0[1] * k[1], t0[2] * k[2]); m.uniforms.uBloodAmt.value = lvl === 2 ? 1 : lvl === 1 ? 0.62 : 0; } }
    } } catch (e) { if (this.err++ < 3) console.warn('crew figure fault:', e && e.message); }
  }
  hide() { for (const k in this.men) this.men[k].g.visible = false; }
  triCount() { return Math.round(this.tris); }
}
