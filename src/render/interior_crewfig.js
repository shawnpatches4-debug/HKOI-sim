// The four crewmen in their seats: the crew MODELS of the owner's original simulator (assets/crew/crew_gunner.json, crew_loader.json,
// crew_driver.json; there is no commander model, so the commander is the gunner's model with a khaki uniform and a lighter helmet so
// that he can be told apart), animated fresh. The old page's pose-to-pose animation is not used.
//
// How they move: the method built for the enemy teams (figure.js). Each frame a man has a pose he is aiming for (which way each limb
// points, how far his trunk leans, where his head is turned); every joint CHASES that on a damped spring worked out exactly, so it
// eases off, never overshoots, arrives gently, and comes out the same at any frame rate. Then his hands are put exactly on their
// controls (two-bone reach), with a grip that itself eases on and off, so hands stay on a moving T-bar or handle and never pop.
// What he is aiming for comes from the battle: its crew model (steady, strained, shaken, panicked; wounded; down), the load cycle,
// an impact about to land or just landed. All of it runs on the battle clock.
//
// The models are loaded only through loadModel in units.js. Until they arrive, or if they are missing, the seats are empty.
// A fault in here must never stop the interior: update() catches its own errors.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeRig, solve, fk, reachQ, chaseJoint, chase, stiff, Y_POSING, NJ, J, Wp } from './figure.js';

const hsh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// this skeleton's joint names in the plain names figure.js works with (other names pass through, so the enemy figures are not disturbed)
const NAME = { Pelvis: 'Hips', Spine: 'Spine', Spine1: 'Spine1', Spine2: 'Spine2', Neck: 'Neck', Head: 'Head' };
for (const [s, S] of [['L', 'Left'], ['R', 'Right']]) Object.assign(NAME, { [s + '_Clavicle']: S + 'Shoulder', [s + '_UpperArm']: S + 'Arm', [s + '_Forearm']: S + 'ForeArm', [s + '_Hand']: S + 'Hand', [s + '_Thigh']: S + 'UpLeg', [s + '_Calf']: S + 'Leg', [s + '_Foot']: S + 'Foot', [s + '_Toe0']: S + 'ToeBase' });
export const crewBoneName = n => { if (/^Bip01/.test(n)) { const k = n.replace(/^Bip01[_ ]?/, '').replace(/ /g, '_'); return NAME[k] || n; } return n.replace(/^mixamorig:?/, ''); };
const FILE = { gnr: 'gunner', cdr: 'gunner', ldr: 'loader', drv: 'driver' }, HULL = { drv: true };
// which way each man faces in the interior's frame (degrees, 0 = along the gun), and his resting pose: limb directions in his own
// frame [his left, up, forward], and how far his trunk leans forward (tip, radians; negative = lying back)
const SEATED = { tip: 0.06, thigh: [0.13, -0.08, 1], shin: [0, -1, 0.12], foot: [0, -0.25, 1], upper: [0.28, -0.85, 0.4], fore: [-0.08, -0.25, 1] };
const BASE = {
  gnr: { face: 0, ...SEATED, tip: 0.2, upper: [0.22, -0.7, 0.68], fore: [-0.12, 0.05, 1] },
  cdr: { face: 0, ...SEATED, thigh: [0.14, -0.3, 1], shin: [0, -1, 0.05] },
  ldr: { face: 50, ...SEATED },
  drv: { face: 0, ...SEATED, tip: -0.9, thigh: [0.14, 0.75, 0.75], shin: [0, -0.82, 0.58], foot: [0, 0.4, 1], upper: [0.2, -0.3, 0.95], fore: [-0.1, 0.35, 1] },
};
// where each man looks, and for how long, when nothing else has his attention: [seconds, look (radians, + = to his left), nod (+ = down), what]
const GAZE = {
  gnr: [[5, 0, 0.08, 'sight'], [1.6, -0.55, 0.42, 'computer'], [4, 0, 0.1, 'sight'], [1.2, 0.1, 0.5, 'panel']],
  cdr: [[3.2, 0.05, 0.42, 'display'], [2.6, -0.95, 0.32, 'HKOI panel'], [2.2, 0.5, -0.12, 'ports'], [2.2, -0.45, -0.12, 'ports'], [1.8, 0, -0.1, 'ports']],
  ldr: [[4, 0.1, 0.2, 'breech'], [2.5, -0.6, 0.05, 'radios'], [2.2, 0.65, -0.25, 'periscope']],
  drv: [[6, 0, -0.1, 'vision blocks'], [1.6, -0.5, 0.2, 'display'], [4, 0.12, -0.1, 'vision blocks'], [1.3, 0.5, 0.22, 'master panel']],
};
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _e = new THREE.Euler();

function bloodTexture() {   /* blotches for a blood-soaked uniform: repeats over the figure */
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); let s = 17; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { const r = 3 + R() * (i < 8 ? 26 : 9); x.fillStyle = `rgba(${96 + R() * 40 | 0},${R() * 10 | 0},${R() * 8 | 0},${0.6 + R() * 0.4})`; for (const [ox, oy] of [[0, 0], [128, 0], [0, 128], [-128, 0], [0, -128]]) { x.beginPath(); x.ellipse((i * 37 % 128) + ox, (i * 61 % 128) + oy, r, r * 0.7, i, 0, 7); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export class CrewFigures {
  // cab: (opts) => a material of the interior (opts.skinned for these figures); groups { tur, hul }; base: the asset folder.
  // given (tests only): { gunner, loader, driver } ready-made figures to use instead of loading the files
  constructor(cab, groups, base, given) {
    this.G = groups; this.cab = cab; this.men = {}; this.ready = false; this.failed = false; this.tris = 0; this.blood = null; this.err = 0; this.lastT = null; this.measure = null;
    if (given) { this._all(given); return; }
    if (!base || typeof fetch === 'undefined' || typeof location === 'undefined') { this.failed = true; return; }
    import('./units.js').then(U => Promise.all(['gunner', 'loader', 'driver'].map(k => U.loadModel(base + 'crew/crew_' + k + '.json')))).then(([g, l, d]) => {
      if (!g || !l || !d) { this.failed = true; return; } this.blood = bloodTexture(); this._all({ gunner: cloneSkinned(g), loader: cloneSkinned(l), driver: cloneSkinned(d), gunner2: cloneSkinned(g) });
    }).catch(e => { this.failed = true; console.warn('crew figures not shown:', e && e.message); });
  }
  _all(src) { for (const r of ['gnr', 'cdr', 'ldr', 'drv']) { const m = this._make(r === 'cdr' ? (src.gunner2 || src.gunner_cdr) : src[FILE[r]], r); if (!m) { this.failed = true; return; } this.men[r] = m; } this.ready = true; }
  _make(fig, role) {
    if (!fig) return null; const mats = [], g = new THREE.Group(); let tris = 0; fig.position.set(0, 0, 0); fig.rotation.set(0, 0, 0); fig.updateMatrixWorld(true);
    const rig = makeRig(fig, crewBoneName); if (!rig) { console.warn('crew figure: the skeleton is not the one expected'); return null; }
    fig.traverse(o => { if (!o.isMesh) return; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; const n = (o.material && o.material.name) || ''; if (/knife|pistol/.test(n)) { o.visible = false; return; }
      // tank crew, not infantry: plain coveralls instead of camouflage and a dark crew helmet; the commander in khaki with a lighter helmet
      const cdr = role === 'cdr', tint = /_body$/.test(n) ? (cdr ? [0.74, 0.66, 0.48] : [0.6, 0.63, 0.48]) : /_helmet$/.test(n) ? (cdr ? [0.5, 0.46, 0.33] : [0.28, 0.29, 0.25]) : /_equipment$/.test(n) ? [0.56, 0.53, 0.42] : [1, 1, 1];
      if (this.cab) { const mat = this.cab({ skinned: true, map: o.material ? o.material.map : null, tint, blood: this.blood }); mat.userData.tint0 = tint; o.material = mat; mats.push(mat); }
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const B = BASE[role]; g.add(fig); g.rotation.y = Math.PI - B.face * Math.PI / 180; g.visible = false; this.G[HULL[role] ? 'hul' : 'tur'].add(g); this.tris += tris;
    const Q = () => Array.from({ length: NJ }, () => new THREE.Quaternion()), D = Array.from({ length: NJ }, () => null);
    for (const n of ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']) D[J[n]] = [0, -1, 0];
    const sp = () => ({ x: 0, v: 0, g: 0 });
    return { g, fig, rig, mats, role, D, X: { tip: 0, roll: 0, yaw: 0, twist: 0, look: 0, nod: 0 }, goal: Q(), prev: Q(), cur: Q(), draw: Q(), vel: Array.from({ length: NJ }, () => new THREE.Vector3()), fresh: true,
      head: [sp(), sp(), sp()], grip: [sp(), sp()], hand: [[sp(), sp(), sp()], [sp(), sp(), sp()]], lvl: -1, head0: fig.getObjectByProperty('isBone', true) && rig.bones[J.Head], handErr: [0, 0], speedJump: 0 };
  }

  // men: { gnr: { on, head [x,y,z], hands [[x,y,z],[x,y,z]] (left, right; in the interior's frame), state, status, frozen, brace, flinch, bodyOnly, blood, load, rise }, ... }
  // t = battle time, dt = battle seconds since the last call (0 while paused)
  update(men, t, dt) {
    if (!this.ready) return;
    try {
      dt = this.lastT == null ? 0 : t - this.lastT;   /* the battle's own clock: the same whether it is played, stepped or replayed */
      const jump = this.lastT == null || dt < -1e-6 || dt > 2; this.lastT = t; if (jump) dt = 0;   /* a new battle, a rewind or a long skip: settle at once instead of chasing across the gap */
      for (const role of ['gnr', 'cdr', 'ldr', 'drv']) { const r = this.men[role], M = men[role], on = !!(M && M.on); if (r.g.visible !== on) r.g.visible = on; if (!on) { r.fresh = true; continue; } this._man(r, M, t, dt, jump); }
    } catch (e) { if (this.err++ < 3) console.warn('crew figure fault:', e && e.message); }
  }
  _man(r, M, t, dt, jump) {
    const role = r.role, B = BASE[role], D = r.D, X = r.X, sd = [1, -1], down = M.status === 'down', hurt = M.status === 'wounded', panic = !down && (M.state === 'panicked' || M.frozen), shaken = M.state === 'shaken', strained = M.state === 'strained';
    const seed = role.charCodeAt(0) + role.charCodeAt(1), set = (n, v, k) => { const d = D[J[n]]; d[0] = v[0] * k; d[1] = v[1]; d[2] = v[2]; };
    // ---- what he is aiming for
    for (let i = 0; i < 2; i++) { const S = i ? 'Right' : 'Left', k = sd[i]; set(S + 'UpLeg', B.thigh, k); set(S + 'Leg', B.shin, k); set(S + 'Foot', B.foot, k); set(S + 'Arm', B.upper, k); set(S + 'ForeArm', B.fore, k); }
    // attention: where his head is turned (it moves from one thing to the next on its spring, never snapping)
    let look = 0, nod = 0; { const L = GAZE[role], per = strained ? 0.6 : shaken ? 0.45 : 1; let tot = 0; for (const a of L) tot += a[0] * per; let u = ((t + seed * 1.7) % tot + tot) % tot, i = 0; while (u >= L[i][0] * per) { u -= L[i][0] * per; i++; } look = L[i][1]; nod = L[i][2]; }
    let tip = B.tip, roll = 0.018 * Math.sin(t * 0.31 + seed), twist = 0, gripL = 1, gripR = 1;
    tip += 0.012 * Math.sin(t * 1.45 + seed);                                                                           /* breathing */
    if (strained) tip += 0.05; if (shaken) { tip += 0.11; look += (hsh(Math.floor(t * 6), seed) - 0.5) * 0.1; nod += 0.08; }
    if (role === 'ldr' && M.load >= 0.05 && M.load < 0.86) { look = M.load < 0.4 ? -1.0 : 0.25; nod = 0.25; twist = M.load < 0.4 ? -0.55 : 0.2; tip += 0.12; }      /* at the rack, then at the breech */
    if (role === 'cdr' && M.rise > 0.02) { nod = -0.05; look *= 0.6; }
    const br = Math.max(M.brace || 0, 0), fl = M.flinch || 0; tip += 0.2 * br + 0.42 * fl; nod += 0.28 * br + 0.45 * fl; if (br > 0.5) look *= 0.3;   /* bracing for a hit about to land; thrown by one that has */
    if (panic) { tip += 0.3; nod = 0.55; look = (hsh(Math.floor(t * 1.3), seed) - 0.5) * 0.5; gripL = gripR = 0; for (let i = 0; i < 2; i++) { const S = i ? 'Right' : 'Left'; set(S + 'Arm', [0.32, 0.25, 0.9], sd[i]); set(S + 'ForeArm', [-0.45, 0.88, 0.05], sd[i]); } }   /* hands to his helmet */
    if (hurt) { tip += 0.2; roll += 0.17; nod += 0.3; look = 0.15; gripL = 0; set('LeftArm', [0.18, -0.9, 0.38], 1); set('LeftForeArm', [-0.85, 0.22, 0.48], 1); }                                   /* left hand clamped to the wound, working one-handed */
    if (down) { tip = role === 'drv' ? B.tip + 0.1 : 0.78; roll = 0.3 * (hsh(seed, 9) < 0.5 ? -1 : 1); nod = 0.72; look = 0.3; gripL = gripR = 0; for (let i = 0; i < 2; i++) { const S = i ? 'Right' : 'Left'; set(S + 'Arm', [0.16, -1, 0.12], sd[i]); set(S + 'ForeArm', [0.05, -1, 0.3], sd[i]); } }
    if (M.rise > 0.02) { const k = M.rise; for (let i = 0; i < 2; i++) { const S = i ? 'Right' : 'Left'; set(S + 'UpLeg', [0.13, -0.08 - 0.9 * k, 1 - 0.7 * k], sd[i]); } }   /* standing up into the open hatch */
    X.tip = tip; X.roll = roll; X.twist = twist; X.look = clamp(look, -1.2, 1.2); X.nod = clamp(nod, -0.4, 0.9);
    solve(r.rig, D, X, r.goal);
    // ---- every joint chases it
    const slow = down ? 0.45 : hurt ? 0.7 : 1, first = r.fresh || jump; r.speedJump = 0;
    for (let i = 0; i < NJ; i++) { if (first) { r.cur[i].copy(r.goal[i]); r.vel[i].set(0, 0, 0); } else if (dt > 1e-6) { const w = r.vel[i], w0x = w.x, w0y = w.y, w0z = w.z; chaseJoint(r.cur[i], w, r.prev[i], r.goal[i], Y_POSING[i] * slow * 0.55, dt); const dj = Math.hypot(w.x - w0x, w.y - w0y, w.z - w0z); if (dj > r.speedJump) r.speedJump = dj; } r.prev[i].copy(r.goal[i]); r.draw[i].copy(r.cur[i]); }
    // his head is held at the seat's eye point (the point itself eases when he rises or slumps), and the grip of each hand eases on and off
    const hy = M.head[1] - (down ? 0.16 : hurt ? 0.05 : 0) - 0.05 * fl, HG = [M.head[0], hy, M.head[2]], yh = stiff(0.16), yg = stiff(0.14), GG = [gripL, gripR];
    for (let k = 0; k < 3; k++) { const s = r.head[k]; if (first) { s.x = HG[k]; s.v = 0; } else if (dt > 1e-6) chase(s, s.g, HG[k], yh, dt); s.g = HG[k]; }
    for (let k = 0; k < 2; k++) { const s = r.grip[k]; if (first) { s.x = GG[k]; s.v = 0; } else if (dt > 1e-6) chase(s, s.g, GG[k], yg, dt); s.g = GG[k]; }
    // where his hands should be: they follow their controls closely (a short spring, so a control that jumps does not jerk the arm)
    const yc = stiff(0.035); for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) { const s = r.hand[i][k], gk = M.hands[i][k]; if (first) { s.x = gk; s.v = 0; } else if (dt > 1e-6) chase(s, s.g, gk, yc, dt, 1); s.g = gk; }
    r.fresh = false;
    // ---- stand him so that his eyes are at the eye point, then put his hands on the controls
    fk(r.rig, r.draw); const ry = r.g.rotation.y, c = Math.cos(ry), s = Math.sin(ry), hp = Wp[J.Head], ex = hp.x, ey = hp.y + 0.11, ez = hp.z + 0.12;   /* his eyes: above and ahead of the head joint (which sits at the top of the neck); for the viewer's own body a little more, so his collar and chest stay out of the picture */
    r.g.position.set(r.head[0].x - (c * ex + s * ez), r.head[1].x - ey, r.head[2].x - (-s * ex + c * ez));
    for (let i = 0; i < 2; i++) { const g = clamp(r.grip[i].x, 0, 1); if (g < 0.01) { r.handErr[i] = 0; continue; } const S = i ? 'Right' : 'Left', H = r.hand[i];
      const dx = H[0].x - r.g.position.x, dy = H[1].x - r.g.position.y, dz = H[2].x - r.g.position.z; _t.set(c * dx - s * dz, dy, s * dx + c * dz);                        /* the control, in his own frame */
      _pole.set(sd[i] * 0.65, -0.7, -0.25); reachQ(r.rig, r.draw, S, _t, _pole, g * g * (3 - 2 * g));
      if (this.measure) { fk(r.rig, r.draw); const dxm = M.hands[i][0] - r.g.position.x, dym = M.hands[i][1] - r.g.position.y, dzm = M.hands[i][2] - r.g.position.z; _v.set(c * dxm - s * dzm, dym, s * dxm + c * dzm); r.handErr[i] = g > 0.99 ? Wp[J[S + 'Hand']].distanceTo(_v) : 0; r.reachLeft = _v.distanceTo(Wp[J[S + 'Arm']]) - (r.rig.upper + r.rig.fore); } }
    for (let i = 0; i < NJ; i++) r.rig.bones[i].quaternion.copy(r.draw[i]);
    // the viewer in this seat: no head of his own before his eyes, but his own arms and hands on his controls
    const cut = M.bodyOnly ? 0.34 : 0; if (r.cut !== cut) { r.cut = cut; for (const m of r.mats) m.uniforms.uNearCut.value = cut; }
    // blood: the uniform darkens and stains, more for the dead than for the wounded
    const lvl = M.blood === 'killed' ? 2 : M.blood ? 1 : 0; if (lvl !== r.lvl) { r.lvl = lvl; for (const m of r.mats) { const t0 = m.userData.tint0, k = lvl === 2 ? [0.7, 0.26, 0.22] : lvl === 1 ? [0.9, 0.6, 0.55] : [1, 1, 1]; m.uniforms.uTint.value.set(t0[0] * k[0], t0[1] * k[1], t0[2] * k[2]); m.uniforms.uBloodAmt.value = lvl === 2 ? 1 : lvl === 1 ? 0.75 : 0; } }
  }
  hide() { for (const k in this.men) this.men[k].g.visible = false; }
  triCount() { return Math.round(this.tris); }
}
