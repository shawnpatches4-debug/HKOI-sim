// Enemy vehicles as they are drawn: UAZ-469 (carries a missile team), BMP-2, T-72B3 and T-90M.
//
// The battle says where each vehicle is and what has happened to it (`battle.vehicles()`, plain data, ten times a second);
// nothing here changes the battle. This file turns that into something to look at:
//   - movement eased between the battle's samples, the body following the real ground, squatting and dipping on its springs,
//     wheels and tracks running with the distance covered, dust behind it;
//   - firing: 30 mm bursts, coaxial machine gun, the main gun (flash, blast, recoil, the hull rocking), a missile leaving its rail;
//   - being hit: sparks, a thrown track, a jammed turret with smoke from the hatches, and the catastrophic kills (a tank's turret
//     thrown off on a jet of fire, a BMP burning with its rear doors blown open, a UAZ thrown on its side with its riders thrown clear);
//   - a missile team riding in the UAZ, getting in and out;
//   - a heat picture for the thermal sights;
//   - three levels of detail by apparent distance, and wrecks that cost nothing once they have burnt out.
// Everything is worked out from the battle's data and the time, so a replay or a rewind shows the right state for the moment.
//
// Use (from the app, once per frame after the teams are placed):
//   const vehicles = new Vehicles(scene, ASSETS);
//   vehicles.update(battle, { t: tNow, all: seeAll(), teams });
// If `battle.vehicles` does not exist nothing is drawn. The effects go through the scene's effects layer (scene.fx).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { vehicleFinish, ENV } from './env.js';
import { loadModel } from './units.js';
import { POSES, setPose, makeRig, poseTurns, lowest, chase, chaseAngle, stiff, NJ } from './figure.js';
import { SPEC, vehicleProto } from './vehmodels.js';

const DEG = Math.PI / 180, G = 9.81;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x, ease = x => { x = sat(x); return x * x * (3 - 2 * x); }, mix = (a, b, t) => a + (b - a) * t;
const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
// a number between 0 and 1 that is always the same for the same vehicle and purpose (so a replay looks the same)
const dice = (id, k) => { let t = (Math.imul(id | 0, 2654435761) ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// How far away (as it looks through the lens, metres) each level of detail ends, at High graphics: [close, middle]. Beyond the
// middle distance a vehicle is a plain shape of a few boxes. Lower graphics levels pull these in (QF).
const LOD = { uaz: [170, 800], bmp2: [170, 900], t72: [260, 1300], t90: [260, 1300] }, QF = { min: 0.4, low: 0.6, medium: 0.85, high: 1, auto: 0.85 };
// How each kind sits on its springs: w = how fast it rocks (radians a second), z = damping, squat = lean per m/s2, cy = height it rocks about
const SPRING = { uaz: { w: 10.5, z: 0.5, squat: 0.02, lean: 0.012, cy: 0.55 }, bmp2: { w: 8.5, z: 0.7, squat: 0.01, lean: 0.006, cy: 0.8 }, t72: { w: 7.5, z: 0.85, squat: 0.0075, lean: 0.004, cy: 0.9 } };
// How long a wreck burns with open flame, then smoulders (seconds), and how big the fire is
const BURN = { uaz: [70, 60, 0.7], bmp2: [130, 90, 1.1], t72: [170, 120, 1.5] };
const SCORCH = new THREE.Color(0.035, 0.033, 0.03);
// The moments (seconds after a catastrophic kill) at which ammunition goes up, and how big each bang is
const BANGS = { t72: [[1.3, 1.2], [2.6, 0.8], [5.2, 1.0], [8.5, 0.6], [14, 0.9], [23, 0.6], [36, 0.7], [52, 0.5]], bmp2: [[1.6, 0.6], [4.5, 0.5], [9, 0.7], [17, 0.4], [28, 0.5]], uaz: [[2.2, 0.35]] };

// Poses of a rider that the team view has no use for: sitting on a bench seat, and half out of a door
const SIT = { Spine: [0, 1, -0.06], Spine1: [0, 1, 0], Spine2: [0, 1, 0.06], Neck: [0, 0.9, 0.45], LeftUpLeg: [0.2, -0.08, 1], LeftLeg: [0, -1, 0.12], LeftFoot: [0, -0.2, 1], RightUpLeg: [-0.2, -0.08, 1], RightLeg: [0, -1, 0.12], RightFoot: [0, -0.2, 1],
  LeftArm: [0.15, -0.8, 0.5], LeftForeArm: [-0.1, -0.3, 0.9], RightArm: [-0.15, -0.8, 0.5], RightForeArm: [0.1, -0.3, 0.9] };
const RIDER_POSES = { sit: SIT, crouch: POSES.crouch, ready: POSES.ready, buckle: POSES.buckle, fallen: POSES.fallen, fallen_back: POSES.fallen_back, fallen_side: POSES.fallen_side };
const TURNS = {};                                             /* each pose as joint turns, worked out once (every rider is the same figure) */
function turnsOf(rig, name) { let T = TURNS[name]; if (!T) { T = TURNS[name] = { q: poseTurns(rig, RIDER_POSES[name]), low: 0 }; T.low = lowest(); } return T; }
// put a figure in a pose part-way between two poses, standing its lowest point on `floor` (in its parent's frame)
function pose(fig, a, b, u, floor) {
  const rig = fig.userData.rig, A = turnsOf(rig, a), B = turnsOf(rig, b), bones = rig.bones;
  for (let k = 0; k < NJ; k++) bones[k].quaternion.slerpQuaternions(A.q[k], B.q[k], u);
  fig.position.y = floor - mix(A.low, B.low, u);
}

// Plain words for the map and the enemy menu: what a vehicle is and what it is doing. v = one entry of battle.vehicles().
// Returns { id, name (as on the menu: "BMP-2 #101"), kind, icon ('truck' | 'ifv' | 'tank'), line (one line on its state), alive, known, e, n, hull, turret }.
export function vehicleInfo(v) {
  const S = SPEC[v.kind] || SPEC.bmp2, kmh = Math.round(Math.abs(v.speed || 0) * 3.6), riders = (v.riders || []).filter(r => r.mounted).length;
  let line = v.state === 'burning' ? 'Destroyed, burning' : v.state === 'abandoned' ? 'Abandoned by its crew'
    : v.state === 'firing' ? 'Firing' + (v.lastShot ? ' (' + ({ '30mm': '30 mm gun', konkurs: 'missile', '125mm': 'main gun', coax: 'machine gun' }[v.lastShot.weapon] || v.lastShot.weapon) + ')' : '')
    : v.state === 'hit' ? 'Hit' : v.state === 'moving' ? 'Moving, ' + kmh + ' km/h' : 'Halted';
  if (v.alive !== false) { if (v.mobile === false) line += ', cannot move'; if (v.canFire === false) line += ', cannot fire'; if (v.hullDown) line += ', hull down'; if (riders) line += ', team aboard'; }
  return { id: v.id, name: (v.name || S.name) + ' #' + v.id, kind: v.kind, icon: S.icon, line, alive: v.alive !== false, known: !!v.known, e: v.e, n: v.n, hull: v.hull, turret: v.turret };
}

// ---------------------------------------------------------------------------------------------------------------------
// One vehicle
// ---------------------------------------------------------------------------------------------------------------------
export class VehicleView {
  constructor(owner, v) {
    this.o = owner; this.id = v.id; this.kind = SPEC[v.kind] ? v.kind : 'bmp2'; this.S = SPEC[this.kind]; this.cls = this.S.tank ? 't72' : this.kind;
    this.group = new THREE.Group(); this.group.name = 'vehicle:' + v.id; this.group.userData.heat = 0.3; this.group.visible = false; owner.scene.units.add(this.group);
    this.loose = null;                                         /* things that have left the vehicle: thrown riders, a thrown track */
    this.ready = false; this.gone = false; this.groundU = { value: 0 };
    this.X = { x: 0, v: 0 }; this.N = { x: 0, v: 0 }; this.H = { x: 0, v: 0 }; this.T = { x: 0, v: 0 }; this.P = { x: 0, v: 0 }; this.R = { x: 0, v: 0 }; this.E = { x: 0, v: 0 };
    this.g = { e: 0, n: 0, h: 0, t: 0, p: 0, r: 0, el: 0 };    /* last goals, for the easing */
    this.A = { bank: 0, vf: 0, p: 0, pv: 0, r: 0, rv: 0, y: 0, yv: 0, kp: 0, kr: 0, ky: 0, dist: 0 };   /* the body on its springs */
    this.y = 0; this.fwd = 0; this.dust = 0; this.warm = 0.25; this.lod = -1; this.th = false; this.init = false; this.settled = false;
    this.shotT = null; this.bursts = []; this.recoilT = -99; this.dmgSig = ''; this.tCat = null; this.tMob = null; this.tFp = null; this.tAb = null; this.catAge = -1; this.scorch = -1; this.acc = 0;
    this.riders = new Map(); this.sphere = new THREE.Sphere(this.group.position, 7);
    vehicleProto(this.kind, owner.base).then(p => { if (p && !this.gone) this._build(p); });
  }

  // ---- a copy of the prepared shape, with its own paint (so it can scorch and glow by itself) ----
  _build(proto) {
    const root = this.root = proto.clone(true), U = this.U = proto.userData, done = new Map(); this.group.add(root);
    this.mats = []; this.gearMats = []; this.hots = { engine: [], exhaust: [], gun: [], gear: [] }; this.pieces = []; this.tracks = []; this.doors = []; this.wheels = [];
    const paint = (m, gear) => {
      if (done.has(m)) return done.get(m);
      const c = m.clone(); c.name = m.name; vehicleFinish(c); const prev = c.onBeforeCompile; c.onBeforeCompile = (sh, r) => { prev(sh, r); sh.uniforms.uFGround = this.groundU; };   /* dirt builds up from THIS vehicle's ground, not the M1's */
      if (gear && this.S.wheeled) c.color.multiplyScalar(0.16);                              /* tyres: dark enough that the theatre's paint leaves them alone */
      c.userData.c0 = c.color.clone(); (gear ? this.gearMats : this.mats).push(c); done.set(m, c); return c;
    };
    const gear = this.gear = root.getObjectByName('gear'); this.body = root.getObjectByName('body'); this.turret = root.getObjectByName('turret'); this.gun = root.getObjectByName('gun');
    this.muzzle = root.getObjectByName('muzzle'); this.coax = root.getObjectByName('coax'); this.rail = root.getObjectByName('rail'); this.lid = root.getObjectByName('lid');
    root.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.hot) { const zone = this.hots[o.userData.hot]; if (!zone.mat) { zone.mat = o.material.clone(); zone.mat.userData.e0 = 0; zone.mat.userData.ei0 = 0; } o.material = zone.mat; zone.push(o); return; }
      let inGear = false; for (let p = o.parent; p; p = p.parent) if (p === gear) inGear = true;
      if (o.userData.slide) { const m = o.material.clone(); m.name = o.material.name; if (m.map) { m.map = m.map.clone(); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.needsUpdate = true; } o.material = paint(m, true); this.tracks.push({ mesh: o, side: o.userData.side, slide: o.userData.slide, off: 0 }); }
      else if (/^track:/.test(o.name)) { o.material = paint(o.material, true); this.tracks.push({ mesh: o, side: o.userData.side, slide: null, off: 0 }); }
      else o.material = paint(o.material, inGear);
      if (o.userData.lod) this.pieces.push(o);
    });
    (U.wheels || []).forEach((w, i) => { const obj = root.getObjectByName('wheel:' + i); if (obj) { obj.rotation.order = 'YXZ'; this.wheels.push({ obj, r: w.r, side: w.side, steer: !!w.steer, a: 0 }); } });
    this.wheelInst = U.wheelMesh ? root.getObjectByName(U.wheelMesh) : null; if (this.wheelInst) this.instA = (U.wheels || []).map(() => 0);
    for (let i = 0; i < 2; i++) { const d = root.getObjectByName('door:' + i); if (d) this.doors.push(d); }
    if (this.S.tank && !this.lid && U.hatch) { const far = this.pieces.find(p => p.userData.lod === 'far'); const lid = this.lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10).translate(0, 0.3, 0), far ? far.material : this.mats[0]); lid.name = 'lid'; lid.position.set(U.hatch[0][0], U.hatch[0][1] - 0.05 - U.turretAt[1], U.hatch[0][2] - 0.3 - U.turretAt[2]); lid.rotation.x = -1.3; lid.visible = false; this.turret.add(lid); }
    if (this.turret) { this.turret0 = this.turret.position.clone(); this.gun0 = this.gun ? this.gun.position.clone() : null; }
    this.ready = true; this.lod = -1; this.scorch = -1; this.th = null;
  }
  dispose() { this.gone = true; this.o.scene.units.remove(this.group); if (this.loose) this.o.loose.remove(this.loose); }
  // where a point of the vehicle is in the world. p: [x, y, z] in the vehicle's frame (x = its left, z = its nose)
  _world(p, out) { return out.set(p[0], p[1], p[2]).applyMatrix4(this.group.matrixWorld); }
  _fresh() { this.group.updateWorldMatrix(true, true); }

  // ---- once per frame ----
  update(v, C) {
    const show = (C.all || v.known || v.state === 'firing') && this.ready;
    const cat = v.state === 'burning', wreck = cat || v.state === 'abandoned';
    this._marks(v, C, cat);
    if (this.settled && !C.snap && cat) { this._see(show, C); if (show && C.thermal !== this.th) this._heat(v, C, cat); return; }   /* a burnt-out wreck: nothing moves any more */
    if (this.settled) this._unsettle();
    this._move(v, C, wreck);
    if (!this.ready) return;
    const vis = this._see(show, C);
    this._pose(v, C, cat);
    this._riders(v, C, cat, vis);
    if (!C.snap) { this._shots(v, C); this._running(v, C, vis, wreck); }
    else { this.bursts.length = 0; this.shotT = v.lastShot ? v.lastShot.t : null; }
    this._damage(v, C, cat, vis);
    if ((vis && C.thermal) || C.thermal !== this.th) this._heat(v, C, cat);
  }

  // the times things happened to it. The battle gives the time of the latest hit; anything already true when first seen (after a
  // rewind, or a vehicle met as a wreck) is taken to be old, so it is shown settled and not acted out again.
  _marks(v, C, cat) {
    const d = v.damage, sig = d ? d.t + '|' + d.zone + '|' + d.effect : '', isNew = sig !== this.dmgSig, old = C.t - 9999;
    if (C.snap) { this.tCat = this.tMob = this.tFp = this.tAb = null; this.hitNew = null; this.catAge = -1; this.burnMark = false; }
    if (!cat && this.throwOff) { this.throwOff = false; this.throwBusy = false; }
    const when = eff => d && d.effect === eff ? d.t : C.snap ? old : C.t;
    if (cat && this.tCat == null) this.tCat = when('catastrophic'); if (!cat) this.tCat = null;
    const crewed = !cat && v.state !== 'abandoned';                           /* (a wreck or an abandoned vehicle also reports that it cannot move or fire: that is not a thrown track or a jammed turret) */
    if (v.mobile === false && this.tMob == null && crewed) this.tMob = when('mobility'); if (v.mobile !== false) this.tMob = null;
    if (v.canFire === false && this.tFp == null && crewed) this.tFp = when('firepower'); if (v.canFire !== false) this.tFp = null;
    if (v.state === 'abandoned' && this.tAb == null) this.tAb = C.snap ? old : C.t; if (v.state !== 'abandoned') this.tAb = null;
    if (isNew) { this.dmgSig = sig; this.hitNew = d && !C.snap && C.t - d.t < 1.2 ? d : null; }
  }

  // ---- where it is: eased between the battle's samples ----
  _move(v, C, wreck) {
    // The battle gives a new sample every step (a tenth of a second). The picture runs up to one step behind, so the goal at any
    // moment lies on the straight line between the last two samples: the same line whatever the frame rate.
    const D = this.smp || (this.smp = { e0: 0, n0: 0, h0: 0, u0: 0, t0: 0, e1: 0, n1: 0, h1: 0, u1: 0, t1: -1 }), first = C.snap || !this.init, g = this.g, dt = C.dt;
    const hr1 = v.hull * DEG, tu1 = (v.turret != null ? v.turret : v.hull) * DEG;
    if (first || C.bt !== D.t1) {
      const leap = first || Math.hypot(v.e - D.e1, v.n - D.n1) > 12;
      if (leap) { D.e0 = v.e; D.n0 = v.n; D.h0 = hr1; D.u0 = tu1; D.t0 = C.bt - 0.1; } else { D.e0 = D.e1; D.n0 = D.n1; D.h0 = D.h1; D.u0 = D.u1; D.t0 = D.t1; }
      D.e1 = v.e; D.n1 = v.n; D.h1 = hr1; D.u1 = tu1; D.t1 = C.bt; if (leap && !first) this.init = false;
    }
    const span = D.t1 - D.t0, f = span > 1e-6 ? sat((C.t - D.t0) / span) : 1, ge = D.e0 + (D.e1 - D.e0) * f, gn = D.n0 + (D.n1 - D.n0) * f, hr = D.h0 + wrapPi(D.h1 - D.h0) * f;
    const jam = this.tFp != null || wreck, gt = jam && this.init ? g.t : D.u0 + wrapPi(D.u1 - D.u0) * f, sp = wreck ? 0 : (v.speed || 0);
    if (first || !this.init) {
      this.X.x = ge; this.X.v = Math.sin(hr) * sp; this.N.x = gn; this.N.v = Math.cos(hr) * sp; this.H.x = hr; this.H.v = 0; this.T.x = D.u0 + wrapPi(D.u1 - D.u0) * f; this.T.v = 0; this.E.x = 0; this.E.v = 0;
      g.e = ge; g.n = gn; g.h = hr; g.t = this.T.x; this.init = true; this.A.vf = sp; this.A.p = this.A.pv = this.A.r = this.A.rv = this.A.y = this.A.yv = this.A.kp = this.A.kr = this.A.ky = 0; this.fwd = sp; this.warm = v.state === 'moving' ? 0.7 : 0.25; this._ground(true);
    } else if (dt > 0) {
      const y = stiff(0.07);
      chase(this.X, g.e, ge, y, dt, 1); chase(this.N, g.n, gn, y, dt, 1); chaseAngle(this.H, g.h, hr, stiff(0.1), dt, 1); chaseAngle(this.T, g.t, gt, stiff(0.1), dt, 1);
      g.e = ge; g.n = gn; g.h = hr; g.t = gt;
      this.fwd = this.X.v * Math.sin(this.H.x) + this.N.v * Math.cos(this.H.x); this._ground(false, dt);
    }
    if (this.throwOff) return;                                                                 /* a thrown vehicle is placed by its own fall (see _thrown) */
    this.group.position.set(this.X.x, this.y, -this.N.x); this.group.rotation.set(-this.P.x, Math.PI - this.H.x, this.R.x, 'YXZ'); this.groundU.value = this.y;
  }
  // the ground under its four corners gives its height, pitch and roll
  _ground(now, dt) {
    const W = this.o.scene.world, e = this.X.x, n = this.N.x, fe = Math.sin(this.H.x), fn = Math.cos(this.H.x), L = this.S.half, B = this.S.gauge;
    const hf = W.h(e + fe * L, n + fn * L), hb = W.h(e - fe * L, n - fn * L), hr = W.h(e + fn * B, n - fe * B), hl = W.h(e - fn * B, n + fe * B);
    const p = Math.atan2(hf - hb, 2 * L), r = Math.atan2(hr - hl, 2 * B), y = (hf + hb + hr + hl) / 4, g = this.g;
    if (now || !(dt > 0)) { this.P.x = p; this.P.v = 0; this.R.x = r; this.R.v = 0; this.y = y; } else { const k = stiff(0.07); chase(this.P, g.p, p, k, dt, 1); chase(this.R, g.r, r, k, dt, 1); this.y += (y - this.y) * (1 - Math.exp(-dt * 14)); }
    g.p = p; g.r = r;
  }

  // ---- is it drawn, and at what level of detail ----
  _see(show, C) {
    const G = this.group; if (!show) { if (G.visible) G.visible = false; if (this.loose) this.loose.visible = false; return false; }
    const d = G.position.distanceTo(C.cam) * C.fovK, L = LOD[this.kind] || LOD.bmp2;
    if (d > 14000) { if (G.visible) G.visible = false; return false; }
    if (!G.visible) G.visible = true; if (this.loose) this.loose.visible = true;
    const lod = d < L[0] * C.q ? 0 : d < L[1] * C.q ? 1 : 2; this.dist = d;
    if (lod !== this.lod) { this.lod = lod; for (const p of this.pieces) { const k = p.userData.lod; p.visible = k === 'near' ? lod === 0 : k === 'detail' ? lod < 2 : k === 'mid' ? lod === 1 : lod === 2; } this._parts(); }
    return C.frustum.intersectsSphere(this.sphere);
  }
  // pieces that damage has taken away or opened, on top of the level of detail
  _parts() {
    if (!this.ready) return;
    if (this.tMob != null || this.trackOff != null) { const side = dice(this.id, 3) < 0.5 ? 1 : -1; for (const t of this.tracks) if (t.side === side && this.lod === 0) t.mesh.visible = false; }
    if (this.strip) this.strip.visible = this.trackOff != null && this.lod < 2;
    if (this.lid) this.lid.visible = this.lod < 2 && (this.tAb != null || this.tFp != null || this.tCat != null);
  }

  // ---- the moving parts: springs, wheels, tracks, turret, gun ----
  _pose(v, C, cat) {
    const A = this.A, K = SPRING[this.cls], dt = C.dt, S = this.S;
    if (dt > 0 && !cat) {
      const h = 1 / 240, lag = 0.3, kf = 1 - Math.exp(-h / lag), yaw = Math.max(-1.2, Math.min(1.2, this.H.v)); A.bank += Math.min(dt, 0.25); let n = Math.min(60, Math.floor(A.bank / h + 1e-6)); A.bank -= n * h; if (A.bank > h) A.bank = 0;
      while (n-- > 0) {
        A.vf += (this.fwd - A.vf) * kf; const acc = (this.fwd - A.vf) / lag;
        const pt = Math.max(-0.05, Math.min(0.07, -acc * K.squat)), rt = Math.max(-0.05, Math.min(0.05, this.fwd * yaw * K.lean));
        A.pv += A.kp; A.rv += A.kr; A.yv += A.ky; A.kp = A.kr = A.ky = 0;
        A.pv += (-(A.p - pt) * K.w * K.w - A.pv * 2 * K.z * K.w) * h; A.p += A.pv * h;
        A.rv += (-(A.r - rt) * K.w * K.w * 1.6 - A.rv * 2 * K.z * K.w * 1.26) * h; A.r += A.rv * h;
        A.yv += (-A.y * K.w * K.w * 1.3 - A.yv * 2 * K.z * K.w * 1.14) * h; A.y += A.yv * h;
        A.dist += this.fwd * h;
      }
    }
    const amp = Math.min(1, Math.abs(A.vf) / 7) * (S.wheeled ? 2.2 : 1), bp = amp * (Math.sin(A.dist * 1.37) * 0.0022 + Math.sin(A.dist * 0.61 + 1) * 0.0016), by = amp * (Math.sin(A.dist * 1.05 + 2) * 0.006 + Math.sin(A.dist * 2.3) * 0.003);
    const sag = cat ? -0.06 * sat((C.t - this.tCat) / 4) : 0, Pb = A.p + bp, Rb = A.r + amp * Math.sin(A.dist * 0.83 + 0.5) * 0.0015;
    this.body.rotation.set(Pb, 0, Rb); this.body.position.set(K.cy * Math.sin(Rb), A.y + by + sag, -K.cy * Math.sin(Pb));
    if (this.turret) {
      let rel = this.T.x - this.H.x, tilt = 0, droop = 0;
      if (this.tFp != null && !cat) { const k = ease((C.t - this.tFp) / 0.6); rel += k * (dice(this.id, 5) - 0.5) * 0.5; droop = k * (dice(this.id, 6) < 0.5 ? -0.07 : 0.12); }   /* jammed where it was, knocked a little off its line, the gun fallen or stuck up */
      if (cat && !this.S.tank) { const k = ease((C.t - this.tCat) / 0.4); rel += k * (dice(this.id, 5) - 0.5) * 0.7; tilt = k * 0.07; droop = -k * 0.1; }
      if (!(cat && this.S.tank)) { this.turret.position.copy(this.turret0); this.turret.rotation.set(tilt, -rel, tilt * 0.6, 'YXZ'); }
      if (this.gun) {
        const ls = v.lastShot, aim = ls && C.t - ls.t < 5 && !cat && this.tFp == null; let el = 0;
        if (aim) { const dx = ls.at[0] - this.X.x, dn = ls.at[1] - this.N.x, R = Math.hypot(dx, dn), W = this.o.scene.world; el = Math.max(-0.09, Math.min(0.3, Math.atan2(W.h(ls.at[0], ls.at[1]) + 1.5 - this.y - 2, R) - this.P.x * Math.cos(rel))); }
        if (C.snap || !(dt > 0)) { if (C.snap) this.E.x = el; } else chase(this.E, this.g.el, el, stiff(0.25), dt, 0); this.g.el = el;
        const ra = C.t - this.recoilT, rec = ra < 0 || ra > 3 ? 0 : (ra < 0.05 ? ra / 0.05 : Math.exp(-(ra - 0.05) * 4.5)) * (this.S.tank ? 0.32 : 0.05);   /* back hard, forward slowly */
        this.gun.rotation.x = -(this.E.x + droop + (cat && this.S.tank ? -0.09 : 0)); this.gun.position.copy(this.gun0); this.gun.position.z -= rec * Math.cos(this.gun.rotation.x); this.gun.position.y -= rec * Math.sin(-this.gun.rotation.x);
      }
    }
    for (const d of this.doors) { const k = cat ? ease((C.t - this.tCat) / 0.25) * 1.95 : this.tAb != null ? ease((C.t - this.tAb) / 1.2) * 1.45 : 0; d.rotation.y = -d.userData.side * k; }
  }
  // wheels and tracks by the distance covered, dust, and how warm the running gear is
  _running(v, C, vis, wreck) {
    const dt = C.dt; if (!(dt > 0) || wreck) return;
    const f = this.fwd, yaw = this.H.v, B = this.S.gauge, dL = (f + yaw * B) * dt, dR = (f - yaw * B) * dt;
    this.warm = Math.max(0.2, Math.min(1, this.warm + (Math.abs(f) * 0.006 - (this.warm - 0.2) * 0.008) * dt));
    if (vis && this.lod === 0) {
      const steer = this.S.wheeled ? Math.max(-0.5, Math.min(0.5, -Math.atan2(2.4 * yaw, Math.max(1.5, Math.abs(f))))) * Math.sign(f || 1) : 0;
      for (const w of this.wheels) { w.a = (w.a + (w.side > 0 ? dL : dR) / w.r) % (Math.PI * 2); w.obj.rotation.set(w.a, w.steer ? steer : 0, 0, 'YXZ'); }
      if (this.wheelInst) { const W = this.U.wheels, I = this.wheelInst; for (let i = 0; i < W.length; i++) { const w = W[i]; this.instA[i] = (this.instA[i] + (w.side > 0 ? dL : dR) / w.r) % (Math.PI * 2); _m.compose(_v.set(w.x, w.y, w.z), _q.setFromAxisAngle(_w.set(1, 0, 0), this.instA[i]), _u.set(1, w.r, w.r)); I.setMatrixAt(i, _m); } I.instanceMatrix.needsUpdate = true; }
      for (const t of this.tracks) if (t.slide && t.mesh.material.map) { t.off = (t.off + (t.side > 0 ? dL : dR) * t.slide.perM) % 1; t.mesh.material.map.offset[t.slide.axis] = t.off; }
    }
    // dust behind it by the distance driven (the same at any frame rate); much less on wet ground or snow
    if (Math.abs(f) > 1.2 && this.dist < 4000) {
      this.dust += Math.abs(f) * dt; const step = this.S.wheeled ? 1.7 : 1.1, wet = ENV.wet.value > 0.3 || ENV.snow.value > 0.3 ? 0.3 : 1, k = (this.S.wheeled ? 0.5 : this.S.tank ? 1 : 0.8) * wet * Math.min(1, Math.abs(f) / 6);
      while (this.dust >= step) { this.dust -= step; this.side = -(this.side || 1); const sh = Math.sin(this.H.x), ch = Math.cos(this.H.x), back = this.S.len * 0.5 * Math.sign(f), sd = this.side * B, p = this.o.scene.at(this.X.x - sh * back + ch * sd, this.N.x - ch * back - sh * sd, 0.2, _v); C.fx.dust(p.x, p.y, p.z, k); }
    }
  }

  // ---- firing ----
  _shots(v, C) {
    const ls = v.lastShot;
    if (ls && ls.t !== this.shotT) { this.shotT = ls.t; if (C.t - ls.t < 1.5 && ls.t - C.t < 1) { const w = ls.weapon, dur = ls.dur || (w === 'coax' ? 1 : 0.8), n = w === '30mm' ? Math.max(1, Math.min(14, Math.round(dur * 5))) : w === 'coax' ? Math.max(1, Math.min(24, Math.round(dur * 10))) : 1; this.bursts.push({ t: ls.t, w, at: [ls.at[0], ls.at[1]], hit: ls.hit, n, i: 0, gap: n > 1 ? dur / n : 0 }); } }
    for (let b = this.bursts.length - 1; b >= 0; b--) { const B = this.bursts[b]; while (B.i < B.n && B.t + B.i * B.gap <= C.t) this._round(B, B.i++, C); if (B.i >= B.n) this.bursts.splice(b, 1); }
  }
  _round(B, i, C) {
    const fx = C.fx, sc = this.o.scene, W = sc.world; this._fresh();
    const from = (B.w === 'konkurs' ? this.rail : B.w === 'coax' ? this.coax : this.muzzle) || this.group; from.getWorldPosition(_v);
    const mx = _v.x, my = _v.y, mz = _v.z; fx.seed(B.t * 7 + i + this.id);
    // where this round goes: at the M1 if the battle says the burst hit, otherwise spread round the point aimed at, short or over
    const R0 = Math.hypot(B.at[0] - this.X.x, B.at[1] - this.N.x) || 1, ux = (B.at[0] - this.X.x) / R0, un = (B.at[1] - this.N.x) / R0, hitTank = B.hit === true && (B.n === 1 || fx.R() < 0.6);
    const sig = R0 * (B.w === 'coax' ? 0.0022 : 0.0013), along = hitTank ? 0 : (fx.R() - 0.5) * 2 * sig * 6 + (B.hit === false ? (fx.R() < 0.5 ? -1 : 1) * (5 + fx.R() * 9) : 0), across = hitTank ? (fx.R() - 0.5) * 2.4 : (fx.R() - 0.5) * 2 * sig * 2.5 + (B.hit === false ? (fx.R() - 0.5) * 6 : 0);
    const te = B.at[0] + ux * along + un * across, tn = B.at[1] + un * along - ux * across, ty = W.h(te, tn) + (hitTank ? 1.0 + fx.R() * 1.4 : 0.1);
    const dx = te - mx, dy = ty - my, dz = -tn - mz, D = Math.hypot(dx, dy, dz) || 1, ax = dx / D, ay = dy / D, az = dz / D;
    if (B.w === '30mm') {
      const tof = D / 970; fx.mgFlash(mx, my, mz, ax, ay, az, true); fx.flash(mx + ax, my + ay, mz + az, 0.3); fx.tracer(mx, my, mz, te, ty, -tn, tof, 1, 0.5, 0.22, 0.16, 14, 7);
      if (i % 3 === 0) fx.puff(mx, my, mz, ax * 4, 0.6, az * 4, 1.6, 0.4, 2.2, 0.72, 0.71, 0.69, 0.3, 2.4, 0.3);
      if (hitTank) this.o.later(B.t + i * B.gap + tof, () => { fx.seed(B.t + i); fx.sparks(te, ty, -tn, -ax, 0.5, -az, 16, 20, 1.3, 0.5, [1, 0.8, 0.45], 6); fx.flash(te, ty, -tn, 0.25); fx.puff(te, ty, -tn, 0, 1.5, 0, 1.4, 0.4, 2.4, 0.2, 0.2, 0.2, 0.5); });
      else { fx.bulletStrike(te, ty, -tn, 2.0, tof); this.o.later(B.t + i * B.gap + tof, () => { fx.flash(te, ty + 0.2, -tn, 0.18); }); }
      this.A.kp -= 0.012; this.recoilT = C.t; if (i === 0) this.o.say('veh_fire', this, B.w, _v.set(mx, my, mz));
    } else if (B.w === 'coax') {
      const tof = D / 820; fx.mgFlash(mx, my, mz, ax, ay, az, false); if (i % 3 === 0) fx.tracer(mx, my, mz, te, ty, -tn, tof, 0.45, 1, 0.5, 0.09, 8, 5);
      if (hitTank) this.o.later(B.t + i * B.gap + tof, () => { fx.seed(B.t + i); fx.sparks(te, ty, -tn, -ax, 0.6, -az, 5, 14, 1.4, 0.3); }); else fx.bulletStrike(te, ty, -tn, 0.8, tof, i % 6 === 0 ? [0.45, 1, 0.5] : null);
      if (i === 0) this.o.say('veh_fire', this, B.w, _v.set(mx, my, mz));
    } else if (B.w === 'konkurs') {
      fx.flash(mx, my, mz, 0.7); fx.backblast(mx - ax * 1.2, my, mz - az * 1.2, ax, az, 0.55); sc.blast(_v.set(mx, my, mz), 0.6, false); this.A.kp -= 0.03; this.o.say('veh_fire', this, B.w, _v);
    } else {
      // the main gun: a tongue of flame, the blast lifting dust off the ground all round, the gun running back and the hull rocking
      fx.muzzleBlast(mx, my, mz, ax, ay, az, 1.5); const g = sc.at(this.X.x + ux * 3, this.N.x + un * 3, 0.3, _w); fx.dustRing(g.x, g.y, g.z, 1.3, 11); sc.blast(_v.set(mx, my, mz), 1.4, false);
      const rel = this.T.x - this.H.x; this.A.kp -= 0.3 * Math.cos(rel); this.A.kr -= 0.2 * Math.sin(rel); this.A.ky -= 0.2; this.recoilT = C.t;
      if (B.hit === false) { const tof = D / 1700; fx.tracer(mx, my, mz, te, ty, -tn, tof, 1, 0.7, 0.35, 0.28, 34, 8); this.o.later(B.t + tof, () => { fx.seed(B.t + 1); fx.explosion(te, ty + 0.3, -tn, 1.1, {}); sc.blast(_v.set(te, ty, -tn), 1, true); }); }   /* a round that hits is drawn by the view of the engagement */
      this.o.say('veh_fire', this, B.w, _v.set(mx, my, mz));
    }
  }

  // ---- being hit ----
  // where on the vehicle a round struck: the side towards the M1, at the height of the part named
  _hitPoint(zone, C, out) {
    const be = C.tank.e - this.X.x, bn = C.tank.n - this.N.x, R = Math.hypot(be, bn) || 1, ue = be / R, un = bn / R, fe = Math.sin(this.H.x), fn = Math.cos(this.H.x), ca = ue * fe + un * fn, sa = ue * fn - un * fe;
    const tur = /^turret/.test(zone || ''), y = tur ? this.S.hgt - 0.5 : zone === 'track' ? 0.45 : zone === 'lower_front' ? 0.65 : this.S.hgt * 0.5, hl = tur ? 1.2 : this.S.len / 2, hw = tur ? 1.1 : this.S.wid / 2, k = 1 / Math.max(Math.abs(ca) / hl, Math.abs(sa) / hw, 1e-3);
    out.set(this.X.x + ue * k * 0.95, this.y + y, -(this.N.x + un * k * 0.95)); this._ue = ue; this._un = un; return out;
  }
  _damage(v, C, cat, vis) {
    const fx = C.fx, sc = this.o.scene, t = C.t, dt = C.dt, id = this.id;
    // the strike itself
    if (this.hitNew && t >= this.hitNew.t) {
      const d = this.hitNew, p = this._hitPoint(d.zone, C, _v), small = d.by === 'm2', ue = this._ue, un = this._un; this.hitNew = null; fx.seed(d.t + id);
      if (small) { fx.sparks(p.x, p.y, p.z, ue, 0.6, -un, 9, 13, 1.4, 0.35); }
      else if (d.effect === 'none' || !d.through) { fx.flash(p.x, p.y, p.z, 0.7); fx.sparks(p.x, p.y, p.z, ue, 0.9, -un, 70, 34, 1.1, 0.9, [1, 0.8, 0.45], 6); fx.sparks(p.x, p.y, p.z, -un * 0.6, 1.2, -ue * 0.6, 14, 60, 0.3, 0.5, [1, 0.9, 0.6], 7); fx.puff(p.x, p.y, p.z, ue * 2, 2, -un * 2, 3, 1, 5, 0.25, 0.24, 0.22, 0.5); this.A.kp += 0.05 * (ue * Math.sin(this.H.x) + un * Math.cos(this.H.x)); this.A.kr += 0.06; }
      else if (d.effect !== 'catastrophic') { fx.vehicleHit(p.x, p.y, p.z, -ue, un, d.effect === 'mobility' ? 0.55 : 0.75); this.A.kp += 0.08; this.A.kr += 0.08; if (d.effect === 'mobility') fx.clods(p.x, p.y - 0.3, p.z, 16, 9, 0.16, [0.14, 0.13, 0.12], 0.8, 0); }
      this.o.say('veh_hit', this, d.effect, p);
    }
    // a thrown track lies behind it; grey smoke from the running gear for a while
    if (this.tMob != null) {
      const a = t - this.tMob, side = dice(id, 3) < 0.5 ? 1 : -1;
      if (this.trackOff == null && !this.S.wheeled) { this.trackOff = side; this._parts(); this._strip(side); }
      if (!cat && a < 30 && dt > 0 && vis) { this.acc += dt * 7 * (1 - a / 30); while (this.acc >= 1) { this.acc -= 1; this._fresh(); const p = this._world([side * this.S.gauge, 0.7, (fx.R() - 0.5) * 3], _v); fx.puff(p.x, p.y, p.z, (fx.R() - 0.5), 1.2 + fx.R(), (fx.R() - 0.5), 4 + fx.R() * 4, 0.7, 3.6, 0.4, 0.39, 0.37, 0.4, 0.8, 0.35); } }
    } else if (this.trackOff != null) { this.trackOff = null; this.lod = -1; this._parts(); }
    // a firepower kill: dark smoke out of the hatches, thinning over a minute
    if (this.tFp != null && !cat) {
      const a = t - this.tFp; if (a >= 0 && a < 60 && dt > 0 && vis && this.U.hatch) { this.acc2 = (this.acc2 || 0) + dt * 12 * (1 - a / 60); while (this.acc2 >= 1) { this.acc2 -= 1; this._fresh(); const h = this.U.hatch[(fx.R() * this.U.hatch.length) | 0], p = this._world(h, _v); fx.puff(p.x, p.y, p.z, (fx.R() - 0.5) * 0.8, 2.2 + fx.R() * 1.5, (fx.R() - 0.5) * 0.8, 5 + fx.R() * 5, 0.6, 4.5, 0.07, 0.07, 0.07, 0.6, 0.6, 0.5); } }
      if (this.lid && !this.lid.visible && this.lod < 2) this.lid.visible = true;
    }
    if (this.tAb != null && this.lid && !this.lid.visible && this.lod < 2) this.lid.visible = true;
    if (cat) this._wreck(v, C, vis); else { this.catAge = -1; if (this.scorch > 0) this._scorch(0); }
  }
  // the length of track a mobility kill threw off, lying on the ground behind the vehicle
  _strip(side) {
    if (!this.strip) { const g = new THREE.BoxGeometry(0.5, 0.05, 4.6), src = this.tracks[0] && this.tracks[0].mesh.material, m = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.8, metalness: 0.3, map: src && this.S.standIn ? src.map : null }); this.strip = new THREE.Mesh(g, m); this.strip.receiveShadow = true; this.strip.userData.lod = 'detail'; this.pieces.push(this.strip); this.gear.add(this.strip); }
    this.strip.visible = this.lod < 2; this.strip.position.set(side * (this.S.gauge + 0.25), 0.04, -this.S.len / 2 - 1.6); this.strip.rotation.set(0, side * 0.16, 0);
  }
  _scorch(k) {
    if (Math.abs(k - this.scorch) < 0.02 && k < 1 && k > 0) return; this.scorch = k;
    for (const L of [this.mats, this.gearMats]) for (const m of L) { m.color.copy(m.userData.c0).lerp(SCORCH, k); if (m.metalness != null && m.userData.m0 == null) { m.userData.m0 = m.metalness; m.userData.r0 = m.roughness; } m.roughness = mix(m.userData.r0, 0.95, k); m.metalness = mix(m.userData.m0, 0.05, k); }
  }
  // a catastrophic kill, by the time since it happened (so a replay can stand at any moment of it)
  _wreck(v, C, vis) {
    const fx = C.fx, sc = this.o.scene, W = sc.world, t = C.t, a = t - this.tCat, a0 = this.catAge, id = this.id, kind = this.cls, B = BURN[kind], U = this.U, live = !C.snap && C.dt > 0;
    this.catAge = a; this._scorch(sat(a / 10) * 0.97);
    const be = this.X.x - C.tank.e, bn = this.N.x - C.tank.n, R = Math.hypot(be, bn) || 1, ue = be / R, un = bn / R;       /* the way the round was going */
    if (!this.burnMark && a >= 0) { this.burnMark = true; sc.marks.add(this.X.x, -this.N.x, this.S.len * 0.75, (x, z) => W.h(x, -z)); }
    const cx = this.X.x, cz = -this.N.x, cy = this.y + this.S.hgt * 0.55;
    if (live && a0 < 0 && a >= 0 && a < 1.5) {                                                    /* the moment itself */
      fx.seed(this.tCat + id); fx.vehicleHit(cx, cy, cz, ue, -un, kind === 'uaz' ? 0.8 : 1.2); fx.secondary(cx, cy, cz, kind === 't72' ? 1.7 : kind === 'bmp2' ? 1.1 : 0.7, 0.12); sc.blast(_v.set(cx, cy, cz), kind === 'uaz' ? 1 : 1.8, false);
      if (kind === 't72') fx.fireball(cx, cy + 0.6, cz, 1.6, 26, 20, 3.2, [0.07, 0.07, 0.07], 0.5, 6);                                        /* the jet out of the turret ring */
      if (kind === 'bmp2' && U.rear) { this._fresh(); const p = this._world(U.rear, _w); fx.fireball(p.x, p.y, p.z, 0.9, 12, 9, 2.4, [0.08, 0.08, 0.08], 0.35, 1.2); fx.sparks(p.x, p.y, p.z, -Math.sin(this.H.x), 0.3, Math.cos(this.H.x), 40, 22, 0.7, 0.9); }
      this.o.say('veh_lost', this, 'burning', _v.set(cx, cy, cz));
    }
    if (live) for (const b of BANGS[kind]) if (a0 < b[0] && a >= b[0] && a - b[0] < 1) { fx.seed(this.tCat + b[0]); fx.secondary(cx + (fx.R() - 0.5) * 1.5, cy, cz + (fx.R() - 0.5) * 1.5, b[1], 0); sc.blast(_v.set(cx, cy, cz), b[1], false); this.o.say('veh_bang', this, b[1], _v); }
    // the fire: open flame and a black column, then a smoulder, then nothing
    if (C.dt > 0 && this.dist < 9000) {
      const k = B[2] * C.dt;
      if (a < B[0]) { const f = a < 4 ? 1.3 : mix(1, 0.55, a / B[0]); fx.burn(cx, this.y + (kind === 'uaz' ? 0.5 : 1.3), cz, C.dt * f, B[2]); if (kind === 'bmp2' && vis && (this.acc3 = (this.acc3 || 0) + C.dt * 2.2) >= 1 && a > 3 && a < 50) { this.acc3 = 0; fx.sparks(cx, cy + 0.6, cz, 0, 1, 0, 5 + fx.R() * 9, 17, 1.3, 0.6, [1, 0.75, 0.4], 6); } }   /* 30 mm rounds cooking off */
      else if (a < B[0] + B[1]) { this.acc = (this.acc || 0) + (k / B[2]) * 2.5 * (1 - (a - B[0]) / B[1]); while (this.acc >= 1) { this.acc -= 1; fx.puff(cx + (fx.R() - 0.5) * 2, cy + 0.5, cz + (fx.R() - 0.5) * 2, (fx.R() - 0.5) * 0.6, 1.6 + fx.R(), (fx.R() - 0.5) * 0.6, 9 + fx.R() * 8, 1.2, 7, 0.1, 0.1, 0.1, 0.45, 0.4, 0.4); } }
    }
    // the parts thrown about
    if (kind === 't72' && this.turret) this._turretOff(a, a0, C, live);
    if (kind === 'uaz') this._thrown(a, a0, C, live, ue, un);
    if (a > B[0] + B[1] && !this.throwBusy) this._settle();
  }
  // a tank's turret blown off: straight up on the jet, turning over, down beside the hull on its roof
  _turretOff(a, a0, C, live) {
    const id = this.id, T = this.turret, tau = a - 0.22, side = dice(id, 7) < 0.5 ? 1 : -1, v0 = 7.5 + dice(id, 8) * 2, vx = side * (2.0 + dice(id, 9) * 0.5), vz = -0.6 + (dice(id, 10) - 0.5) * 1.6, rest = 0.55 - this.turret0.y;
    if (tau <= 0) { T.position.copy(this.turret0); T.position.y += 0.03 * sat(a / 0.22); return; }
    const tl = (v0 + Math.sqrt(v0 * v0 - 2 * G * rest)) / G, u = Math.min(1, tau / tl), tt = Math.min(tau, tl);
    T.position.set(this.turret0.x + vx * tt, this.turret0.y + v0 * tt - 0.5 * G * tt * tt, this.turret0.z + vz * tt);
    if (u >= 1) { const s = Math.exp(-(tau - tl) * 3) * Math.abs(Math.sin((tau - tl) * 9)) * 0.25; T.position.y += s; }               /* one short bounce */
    T.rotation.set(0.25 * Math.sin(Math.PI * u) + 0.12 * u, (this.T.x - this.H.x) * -1 + side * 1.1 * u, side * (Math.PI - 0.2) * u, 'YXZ');
    this.throwBusy = tau < tl + 1.5;
    if (live && a0 - 0.22 < tl && tau >= tl) { this._fresh(); const p = T.getWorldPosition(_v), gy = this.o.scene.world.h(p.x, -p.z); C.fx.seed(this.tCat + 3); C.fx.dustRing(p.x, gy + 0.2, p.z, 1.2, 8); C.fx.clods(p.x, gy + 0.2, p.z, 22, 9, 0.2, [0.2, 0.17, 0.13], 1, 0); C.fx.sparks(p.x, gy + 0.4, p.z, 0, 1, 0, 30, 14, 1.5, 0.7); this.o.say('veh_bang', this, 0.5, p); }
  }
  // a light vehicle thrown by the blast: up, over onto its side, sliding to a stop
  _thrown(a, a0, C, live, ue, un) {
    const u = sat(a / 0.95), id = this.id, side = dice(id, 7) < 0.5 ? 1 : -1, s = 3.4 * (1 - (1 - u) * (1 - u)), roll = side * 1.62 * ease(u), W = this.o.scene.world;
    const e = this.X.x + ue * s, n = this.N.x + un * s, gy = W.h(e, n), y = gy + 1.5 * 4 * u * (1 - u) + 0.86 * Math.abs(Math.sin(roll)) + (u >= 1 ? Math.exp(-(a - 0.95) * 4) * Math.abs(Math.sin((a - 0.95) * 8)) * 0.18 : 0);
    this.throwOff = true; this.throwBusy = a < 2.5; this.group.position.set(e, y, -n); this.group.rotation.set(-this.P.x * (1 - u), Math.PI - this.H.x + side * 0.7 * u, roll, 'YXZ'); this.groundU.value = gy;
    if (live && a0 < 0.95 && a >= 0.95) { C.fx.seed(this.tCat + 5); C.fx.dustRing(e, gy + 0.2, -n, 0.8, 7); C.fx.sparks(e, gy + 0.3, -n, ue, 0.6, -un, 20, 12, 1.2, 0.6); }
  }
  _settle() { this.settled = true; this.group.updateMatrixWorld(true); this.group.traverse(o => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; }); if (this.loose) { this.loose.updateMatrixWorld(true); this.loose.traverse(o => { o.matrixAutoUpdate = false; }); } }
  _unsettle() { this.settled = false; this.group.traverse(o => { o.matrixAutoUpdate = true; o.matrixWorldAutoUpdate = true; }); if (this.loose) this.loose.traverse(o => { o.matrixAutoUpdate = true; }); if (this.throwOff) { this.throwOff = false; } this.throwBusy = false; this.burnMark = false; this.catAge = -1; this.lod = -1; }

  // ---- the missile team that rides in a UAZ ----
  owns(uid) { const r = this.riders.get(uid); return !!r && r.state !== 'out'; }
  _riders(v, C, cat, vis) {
    const list = v.riders; if (!list || !list.length) { if (this.riders.size) { for (const r of this.riders.values()) this._dropRider(r); this.riders.clear(); } return; }
    const t = C.t, ACT = 2.2;
    for (const ri of list) {
      let r = this.riders.get(ri.uid);
      if (!r || C.snap) { if (r) this._dropRider(r); r = { uid: ri.uid, state: ri.mounted ? (cat ? 'thrown' : 'in') : 'out', t0: ri.mounted && cat ? this.tCat : t - 999, figs: null }; this.riders.set(ri.uid, r); }
      if (!cat && this.tCat == null && r.state === 'thrown') r.state = ri.mounted ? 'in' : 'out';
      if (cat && (r.state === 'in' || r.state === 'mounting' || (r.state !== 'thrown' && ri.mounted))) { const u = !ri.mounted && C.units && C.units.find(x => x.id === ri.uid); if (u && u.alive !== false) { r.state = 'leaving'; r.t0 = t; } else { r.state = 'thrown'; r.t0 = this.tCat; } }      /* aboard when it was destroyed: thrown out */
      else if (r.state !== 'thrown') {
        if (ri.mounted && (r.state === 'out' || r.state === 'leaving')) { r.state = 'mounting'; r.t0 = t; }
        else if (!ri.mounted && (r.state === 'in' || r.state === 'mounting')) { r.state = 'leaving'; r.t0 = t; }
        if (r.state === 'mounting' && t - r.t0 >= ACT) r.state = 'in'; if (r.state === 'leaving' && t - r.t0 >= ACT) r.state = 'out';
      }
      const want = r.state === 'thrown' || ((r.state === 'mounting' || r.state === 'leaving' || (r.state === 'in' && !this.S.closed)) && this.lod === 0);
      if (!want) { if (r.figs) for (const f of r.figs) f.visible = false; continue; }
      if (!r.figs) { if (!this.o.soldier) continue; r.figs = [0, 1].map(() => this.o.figure()); r.where = null; }
      const k = [...this.riders.keys()].indexOf(ri.uid);
      r.figs.forEach((f, i) => { f.visible = true; const seat = (k * 2 + i) % 4, sx = seat % 2 ? -1 : 1, sz = seat < 2 ? -0.55 : -1.25;
        if (r.state === 'thrown') { this._throwRider(r, f, i, C); return; }
        if (f.parent !== this.group) this.group.add(f);
        const a = t - r.t0 - i * 0.45, out = r.state === 'leaving' ? sat(a / 1.6) : r.state === 'mounting' ? 1 - sat(a / 1.6) : 0;          /* 0 = in his seat, 1 = standing clear of the door */
        const u1 = sat(out / 0.45), u2 = sat((out - 0.45) / 0.55), floorIn = this.U.floor != null ? this.U.floor : 0.62;
        if (out <= 0) { pose(f, 'sit', 'sit', 0, floorIn); f.position.x = sx * 0.4; f.position.z = sz; f.rotation.set(0, 0, 0); f.visible = !this.S.closed; return; }
        if (u2 <= 0) pose(f, 'sit', 'crouch', ease(u1), floorIn - 0.1 * u1); else pose(f, 'crouch', 'ready', ease(u2), mix(floorIn - 0.1, 0, ease(sat(u2 * 2))));
        f.position.x = sx * mix(mix(0.4, 0.95, ease(u1)), 1.75, ease(u2)); f.position.z = sz + 0.25 * ease(u2) * (i ? -1 : 1); f.rotation.set(0, sx * (Math.PI / 2) * ease(u1) * (1 - 0.4 * ease(u2)), 0); });
    }
  }
  // a rider thrown clear of a destroyed vehicle: a short flight and he lies where he lands
  _throwRider(r, f, i, C) {
    const L = this.loose || (this.loose = this.o.looseGroup()), W = this.o.scene.world, id = this.id + r.uid * 7 + i * 13;
    if (f.parent !== L) L.add(f);
    const a = C.t - r.t0, T = 0.75 + dice(id, 1) * 0.5, u = sat(a / T), be = this.X.x - C.tank.e, bn = this.N.x - C.tank.n, R = Math.hypot(be, bn) || 1, ang = (dice(id, 2) - 0.5) * 2.2, ca = Math.cos(ang), sa = Math.sin(ang);
    const de = (be * ca - bn * sa) / R, dn = (be * sa + bn * ca) / R, far = 3.5 + dice(id, 3) * 4.5, e = this.X.x + de * far * u, n = this.N.x + dn * far * u, g0 = this.y + 0.7, g1 = W.h(this.X.x + de * far, this.N.x + dn * far);
    const end = ['fallen', 'fallen_back', 'fallen_side'][(dice(id, 4) * 3) | 0], w = ease(sat(u * 1.4));
    pose(f, 'buckle', end, w, 0); const low = f.position.y;                                              /* (pose leaves the height that stands him on y = 0) */
    f.position.set(e, mix(g0, g1, u) + (1.2 + dice(id, 5)) * 4 * u * (1 - u) + low, -n); f.rotation.set(0, Math.atan2(de, -dn) + dice(id, 6) * 2, 0);
  }
  _dropRider(r) { if (r.figs) for (const f of r.figs) f.removeFromParent(); r.figs = null; }

  // ---- how warm it looks in the thermal sights ----
  // (assumed values, 0 to 1: a running engine and its exhaust are the hottest things on it, the barrel after firing, tracks or tyres after
  // driving; a burning wreck is saturated, and stays warm long after the flames are out)
  _heat(v, C, cat) {
    const on = !!C.thermal; this.th = C.thermal;
    for (const k in this.hots) for (const m of this.hots[k]) m.visible = on && this.lod < 2 || on && k === 'engine';
    if (!on) return;
    const t = C.t, a = cat ? t - this.tCat : 0, B = BURN[this.cls], burn = cat ? (a < B[0] ? 1 : Math.max(0.45, 1 - (a - B[0]) / 600)) : 0, running = v.alive !== false;
    const cold = this.tAb != null ? Math.exp(-(t - this.tAb) / 400) : 1, body = cat ? burn : 0.26 + (running ? 0.08 : 0), eng = cat ? burn : running ? 0.95 : 0.3 + 0.6 * cold, gun = cat ? burn : 0.25 + (v.lastShot ? 0.75 * Math.exp(-Math.max(0, t - v.lastShot.t) / 45) : 0), gear = cat ? burn : this.warm;
    const set = (m, h) => { if (!m) return; if (m.userData.e0 == null) { m.userData.e0 = m.emissive.getHex(); m.userData.ei0 = m.emissiveIntensity; } m.emissive.setScalar(1); m.emissiveIntensity = h * 3.2; };
    for (const m of this.mats) set(m, body); for (const m of this.gearMats) set(m, Math.max(body * 0.8, gear * 0.6));
    set(this.hots.engine.mat, eng); set(this.hots.exhaust.mat, Math.min(1, eng * 1.1)); set(this.hots.gun.mat, gun); set(this.hots.gear.mat, gear);
    this.group.userData.heat = body;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// All the vehicles of a battle
// ---------------------------------------------------------------------------------------------------------------------
export class Vehicles {
  constructor(scene, assetBase) {
    this.scene = scene; this.base = assetBase; this.views = new Map(); this.todo = []; this.errors = 0; this.lastError = null; this.emit = null;   /* emit(type, info): for sound, if anyone wants it */
    this.loose = new THREE.Group(); this.loose.name = 'vehicle-loose'; this.loose.userData.heat = 0.9; scene.units.add(this.loose);
    this.soldier = null; if (assetBase) loadModel(assetBase + 'enemy/soldier.json').then(m => { this.soldier = m; });
    this._battle = null; this._t = -1; this._evI = 0; this._frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4();
    this.C = { t: 0, bt: 0, dt: 0, snap: true, all: false, cam: scene.camera.position, fovK: 1, q: 1, thermal: 0, fx: scene.fx, frustum: this._frustum, tank: { e: 0, n: 0, h: 0 } };
    scene.vehicles = this;
  }
  // One frame. o: { t: the time being drawn (the battle's clock if left out), bt: the time the vehicle list is for (battle.t if left out), all: draw vehicles the tank crew has not located, teams: the
  // team views in the order of battle.units (so a team that is aboard is not drawn twice) }. Never throws: a fault is counted and logged.
  update(battle, o) { try { this._update(battle, o || {}); } catch (e) { this.lastError = e; if (this.errors++ < 3) console.error('vehicles:', e); } }
  _update(battle, o) {
    const list = battle && typeof battle.vehicles === 'function' ? battle.vehicles() : null;
    if (battle !== this._battle) { this.reset(); this._battle = battle; }
    if (!list || !list.length) { this._t = -1; return; }
    const sc = this.scene, C = this.C, t = o.t != null ? o.t : battle.t, snap = this._t < 0 || t < this._t - 1e-6 || t > this._t + 2.5;
    C.t = t; C.bt = o.bt != null ? o.bt : Math.max(t, battle.t); C.dt = snap ? 0 : t - this._t; C.snap = snap; C.all = !!o.all; C.fx = sc.fx; C.fovK = sc.camera.fov / 40; C.q = QF[sc.quality] || 0.85; C.thermal = sc.thermal || 0;
    C.units = battle.units; C.tank.e = battle.tank.e; C.tank.n = battle.tank.n; C.tank.h = battle.tank.h || 0; this._t = t;
    sc.camera.updateMatrixWorld(); this._frustum.setFromProjectionMatrix(this._pm.multiplyMatrices(sc.camera.projectionMatrix, sc.camera.matrixWorldInverse));
    if (snap) { this.todo.length = 0; this._evI = (battle.events || []).length; }
    while (this.todo.length && this.todo[0].t <= t) this.todo.shift().fn();
    for (const v of list) { let w = this.views.get(v.id); if (!w) { w = new VehicleView(this, v); this.views.set(v.id, w); } w.update(v, C); }
    // a team that is aboard (or getting in or out, or thrown from the wreck) is drawn here, not by its own team view
    if (o.teams && battle.units) for (const v of list) if (v.riders && v.riders.length) { const w = this.views.get(v.id); for (const r of v.riders) if (w.owns(r.uid) || r.mounted) { const i = battle.units.findIndex(u => u.id === r.uid), tv = i >= 0 && o.teams[i]; if (tv && tv.group.visible) tv.group.visible = false; } }
    this._tankSparks(battle, C);
  }
  // 30 mm strikes on the M1 that broke something (the battle's 'tank_damage' events): a shower of sparks on that part
  _tankSparks(battle, C) {
    const E = battle.events; if (!E) return;
    for (; this._evI < E.length; this._evI++) { const ev = E[this._evI]; if (ev.type !== 'tank_damage' || Math.abs(ev.t - C.t) > 1.5) continue;
      const at = TANK_PARTS[ev.what] || TANK_PARTS.other, T = C.tank;
      this.later(ev.t, () => { const h = (battle.tank.h || 0) * DEG, sh = Math.sin(h), ch = Math.cos(h), p = this.scene.at(battle.tank.e + sh * at[2] + ch * at[0], battle.tank.n + ch * at[2] - sh * at[0], at[1], _v), fx = this.scene.fx; fx.seed(ev.t + 3); fx.flash(p.x, p.y, p.z, 0.4); fx.sparks(p.x, p.y, p.z, 0, 1, 0, 34, 20, 1.5, 0.7, [1, 0.8, 0.45], 6); fx.clods(p.x, p.y, p.z, 6, 7, 0.07, [0.15, 0.15, 0.14], 0.8, 0); }); }
  }
  later(t, fn) { const ev = { t, fn }; let i = this.todo.length; while (i > 0 && this.todo[i - 1].t > t) i--; this.todo.splice(i, 0, ev); }
  say(type, view, what, pos) { if (this.emit) this.emit(type, { id: view.id, kind: view.kind, what, x: pos.x, y: pos.y, z: pos.z }); }
  figure() { const f = cloneSkinned(this.soldier); setPose(f, {}); f.userData.rig = makeRig(f); f.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } }); return f; }
  looseGroup() { const g = new THREE.Group(); this.loose.add(g); return g; }
  // where a vehicle is drawn this frame (eased between the battle's steps), or null: for cameras, labels and anything aimed at it
  positionOf(id) { const w = this.views.get(id); return w && w.init ? w.group.position : null; }
  view(id) { return this.views.get(id) || null; }
  // how many are loaded and what they cost, for the performance read-out
  status() { let n = 0, ready = 0, shown = 0, settled = 0; for (const w of this.views.values()) { n++; if (w.ready) ready++; if (w.group.visible) shown++; if (w.settled) settled++; } return { vehicles: n, ready, shown, settled, errors: this.errors }; }
  reset() { for (const w of this.views.values()) w.dispose(); this.views.clear(); this.todo.length = 0; this._t = -1; this._evI = 0; while (this.loose.children.length) this.loose.remove(this.loose.children[0]); }
}
// where the parts of the M1 named in a 'tank_damage' event are: [to its right, up, forward] in metres from the middle of the hull on the ground
const TANK_PARTS = { gps: [0.9, 2.5, 1.0], citv: [-0.8, 2.9, 0.4], hkoi: [0.3, 3.0, -0.6], radar: [0, 2.9, -1.2], aps_L: [-1.6, 2.4, -0.3], aps_R: [1.6, 2.4, -0.3], track: [1.6, 0.6, 1.5], radio: [-0.9, 2.6, -1.9], loader: [-0.6, 2.7, 0.2], other: [0, 2.3, 0.5] };
