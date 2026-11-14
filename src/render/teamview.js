// An enemy team as it is drawn: two soldier figures, their weapon and the loads they carry.
// How a single figure moves is in figure.js; this file is the team: who is where, what each man is doing, where each load is
// (on the ground, on a back, in a pair of hands) and the small scenes they act out: setting up, packing up, reloading,
// going to ground, getting hit.
//
// The battle says what the team is doing (`update(dt, mode, near, info)`); nothing here changes the battle.
//   mode: 'still' (at the weapon), 'down' (flat under fire), 'walk' or 'run' (the map point is moving).
//   info: loaded (a round is in the launcher), spare (a spare round lies ready), firing (launching or guiding),
//         reload (seconds until ready again), pack (seconds of packing up left), setup (seconds of setting up left),
//         dead (the team has been knocked out), dist (metres from the camera, as it appears through the lens).
import * as THREE from 'three';
import { POSES, setPose, bone, jointAt, RIG, NJ, J, UPPER, Wq, Wp, TQ, SD, SX, SO, sat, ease, mix, wrapPi, makeRig, lowest, solve, fk, poseTurns, reachQ,
  stiff, chase, chaseAngle, chaseJoint, Y_MOVING, Y_POSING, newGait, resetGait, stepGait, stridePose, clipPose } from './figure.js';

const DEG = Math.PI / 180, S2 = J.Spine2;
const AXX = new THREE.Vector3(1, 0, 0), AXY = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion(), QS = () => RIG.map(Q);
const _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V(), _q1 = Q(), _q2 = Q(), _q3 = Q(), _P0 = V(), _Q0 = Q(), _S0 = V(), GQ = QS();
const LEGS = RIG.map((n, i) => i === 0 || i >= UPPER);          /* the joints that must be exact while walking (hips and legs) */
const KNEELING = { kneel: 1, knee: 1, shoulder: 1 };
let H = null;                                                    /* loadModel, skin, fit, alongZ, cloneSkinned: handed over by units.js */

const home = o => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
// remember how an object sits relative to a bone (it is placed in the figure's frame first), then lift it off again
function ride(obj, b) { const par = obj.parent; b.attach(obj); const r = { p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() }; if (par) par.attach(obj); else obj.removeFromParent(); return r; }
// a place on a man's chest, given the way it looks when he stands straight (figure's frame, measured from the upper-back joint)
function onChest(rig, fig, p, q, s) { const c = rig.at[S2], inv = c.q.clone().invert(); return { fig, p: p.clone().applyQuaternion(inv), q: inv.clone().multiply(q || Q()), s: s || V(1, 1, 1) }; }
// a slow, never-repeating wobble between -1 and 1
const drift = (t, a, b) => 0.6 * Math.sin(t * a + b) + 0.4 * Math.sin(t * a * 2.3 + b * 1.7);
// a short look up: 0, rising to 1 and back, once every `every` seconds
const peek = (t, every, len) => { const x = (t % every) / len; return x < 1 ? Math.sin(Math.PI * x) ** 2 : 0; };

export class TeamView {
  static use(helpers) { H = helpers; }
  constructor(kind, assetBase) {
    this.kind = kind; this.ground = null; this.dying = false;
    const g = this.group = new THREE.Group(), cloth = new THREE.MeshStandardMaterial({ color: '#5a5b45', roughness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: '#2a2c26', roughness: 0.8 });
    // plain stand-in shapes until the models arrive
    const man = (x, z, crouch) => { const m = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, crouch ? 0.45 : 0.75, 3, 8), cloth), head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), dark); body.position.y = crouch ? 0.55 : 0.8; head.position.y = crouch ? 1.05 : 1.48; body.castShadow = head.castShadow = true; m.add(body, head); m.position.set(x, 0, z); g.add(m); return m; };
    this.men = [man(0.15, 0.5, true), man(-0.8, 0.7, true)];
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8), dark); tube.rotation.x = Math.PI / 2; tube.position.set(0, kind === 'rpg' ? 1.25 : 0.95, -0.2); tube.castShadow = true; g.add(tube);
    if (kind !== 'rpg') for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), dark); leg.position.set(Math.sin(k * 2.094) * 0.3, 0.45, -0.2 + Math.cos(k * 2.094) * 0.3); leg.rotation.set(Math.cos(k * 2.094) * 0.35, 0, -Math.sin(k * 2.094) * 0.35); g.add(leg); }
    if (assetBase && H) this._load(kind, assetBase);
  }

  // ---- building the team once its models have arrived ----
  async _load(kind, base) {
    const atgm = kind === 'kornet' || kind === 'saclos' || kind === 'sal';
    const [sol, kor, rpg] = await Promise.all([H.loadModel(base + 'enemy/soldier.json'), atgm ? H.loadModel(base + 'enemy/kornet.json') : null, kind === 'rpg' ? H.loadModel(base + 'enemy/rpg7.json') : null]); if (!sol) return;
    const fresh = this.inner = new THREE.Group(), keep = [];
    // a figure: measured as supplied, then stood upright at the origin so loads can be fixed to his body
    const man = (pose, x, z, yaw, downAt) => { const f = H.cloneSkinned(sol); setPose(f, {}); f.userData.rig = makeRig(f); setPose(f, POSES.ready); f.updateMatrixWorld(true); f.userData.home = { pose, x, z, yaw, downAt }; keep.push(f); return f; };
    if (kor) {
      // The launcher model has four parts: tripod, sight unit, launch tube and a loose display missile. The missile is hidden (a real one
      // stays sealed in its tube). Tripod + sight unit are one load (the gunner's), the tube is the other (the second man's).
      const l = H.fit(kor.clone(), 1.35); l.rotation.y = TeamView.LAUNCHER_YAW; fresh.add(l); fresh.updateMatrixWorld(true);
      const part = {}; l.traverse(o => { if (o.isMesh) part[o.name] = o; }); const stand = part['стойка'], unit = part['комплекс'], tube = part['ракетница']; if (part.missile) part.missile.visible = false;
      const pivot = (objs, into) => { const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o)); const p = new THREE.Group(); b.getCenter(p.position); if (into) { into.updateMatrixWorld(true); into.worldToLocal(p.position); } (into || fresh).add(p); p.updateMatrixWorld(true); objs.forEach(o => p.attach(o)); p.userData.home = home(p); return p; };
      if (stand && unit) { this.base = pivot([stand, unit]); this.legs = pivot([stand], this.base); }
      if (tube) { if (kind === 'sal') tube.visible = false; else { this.tube = pivot([tube]); this.spare = this.tube.clone(); this.spent = this.tube.clone(); this.spent.visible = false; fresh.add(this.spare, this.spent); } }
      const g = man('gunner', 0.44, -0.78, 0, { x: 0.8, z: -1.1 }), s = man('prone', 1.75, -0.75, 0.12);
      // where each load rides on the move: the folded launcher on the gunner's back, the tube on the second man's right shoulder
      // (well out on the shoulder and tipped a little outward, clear of his head)
      if (this.base) { const c = jointAt(g, 'Spine2', V()); this.base.position.set(c.x, c.y - 0.2, c.z - 0.25); this.base.rotation.y = Math.PI / 2; this.baseRide = ride(this.base, bone(g, 'Spine2')); }
      if (this.tube) { const c = jointAt(s, 'RightArm', V()); this.tube.position.set(c.x - 0.035, c.y + 0.115, c.z + 0.04); this.tube.rotation.set(0.04, -0.07, 0); this.tubeRide = ride(this.tube, bone(s, 'Spine2')); }
      this.launcher = l;
    } else if (kind === 'rpg') {
      const g = man('shoulder', 0, 0.2, 0), s = man('crouch', -1.3, 0.9, 0.3);
      if (rpg) {
        // The supplied RPG-7 arrives with its rocket lying beside the launcher. Numbers below were measured on that model after it is laid
        // along z (muzzle forward): where the bore runs, where the muzzle is, and the two ends of the loose rocket.
        const R = TeamView.RPG, w = H.alongZ(H.skin(rpg.clone(), { RPG7: base + 'enemy/rpg7_albedo.webp', RPG7Rocket: base + 'enemy/rpg7rocket_albedo.webp' }), 1.34, false), G = this.weapon = new THREE.Group();
        w.position.set(-R.bore[0], -R.bore[1], -R.rest); G.add(w); G.updateMatrixWorld(true);
        let rk = null; w.traverse(o => { if (o.isMesh && o.name === 'rocket') rk = o; });
        if (rk) {
          const tail = V(R.tail[0] - R.bore[0], R.tail[1] - R.bore[1], R.tail[2] - R.rest), dir = V(R.nose[0] - R.tail[0], R.nose[1] - R.tail[1], R.nose[2] - R.tail[2]).normalize(), P = this.rocket = new THREE.Group();
          P.position.copy(tail); G.add(P); P.updateMatrixWorld(true); P.attach(rk);
          P.quaternion.setFromUnitVectors(dir, V(0, 0, 1)); P.position.set(0, 0, R.muzzle - R.rest - R.seated);   /* seated in the muzzle, warhead out in front */
          this.round = P.clone(); this.round.visible = false; fresh.add(this.round);                                /* the round that is handed over when reloading */
          // the second man carries two more rounds on his back
          const bag = this.bag = new THREE.Group(); for (const dx of [-0.07, 0.07]) { const c = P.clone(); c.position.set(dx, -0.58, 0); c.quaternion.setFromUnitVectors(V(0, 0, 1), V(dx * 1.2, 1, -0.06).normalize()); bag.add(c); } bag.scale.setScalar(R.scale);
          const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.15), new THREE.MeshStandardMaterial({ color: '#3d4031', roughness: 0.95 })); pack.position.set(0, -0.3, 0); pack.castShadow = true; bag.add(pack);
          const c = jointAt(s, 'Spine2', V()); bag.position.set(c.x, c.y, c.z - 0.19); bone(s, 'Spine2').attach(bag);
        }
        G.scale.setScalar(R.scale);   /* the launcher alone is 0.95 m long */
        // on the right shoulder, level, the shoulder about a third of the way from the back
        const c = jointAt(g, 'RightArm', V()); G.position.set(c.x + 0.045, c.y + 0.09, c.z - 0.02); this.weaponRide = ride(G, bone(g, 'Spine2')); fresh.add(G);
      }
    } else { man('crouch', 0, 0.3, 0); man('kneel', -1.1, 0.5, 0.4); }
    keep.forEach(f => { const h = f.userData.home; setPose(f, POSES[h.pose]); f.position.set(h.x, f.userData.seat, h.z); f.rotation.y = h.yaw; fresh.add(f); });
    while (this.group.children.length) this.group.remove(this.group.children[0]); this.group.add(fresh); this.figures = keep; this._start(); this.loaded = true;
  }

  // everything that is remembered about the figures and loads while they move
  _start() {
    const F = this.figures, R = TeamView.RPG;
    this.anim = false; this.mode = 'still'; this.inner.position.set(0, 0, 0); this.group.updateMatrixWorld(true);
    if (F.some(f => !f.userData.rig)) return;               /* an unexpected skeleton: the figures stay as posed, without movement */
    const psi = this.group.rotation.y, G = this.group.position;
    F.forEach((f, i) => {
      const rig = f.userData.rig, h = f.userData.home, K = {}; for (const k in POSES) K[k] = poseTurns(rig, POSES[k]);
      const still = { key: h.pose, post: h.pose === 'prone' ? 'flat' : 'low', x: h.x, z: h.z, yaw: h.yaw }, down = { key: 'pinned', post: 'flat', x: (h.downAt || h).x, z: (h.downAt || h).z, yaw: h.yaw };
      const a = f.userData.a = { rig, i, K, still, down, gen: 'static', key: still.key, post: still.post, hold: K[still.key], tl: null, kw: { x: 0, v: 0 },
        cur: K[still.key].map(q => q.clone()), out: QS(), gp: K[still.key].map(q => q.clone()), from: QS(), w: RIG.map(() => V()),
        X: { x: 0, v: 0 }, Z: { x: 0, v: 0 }, Yw: { x: 0, v: 0 }, GX: { x: 0, v: 0 }, GZ: { x: 0, v: 0 }, GY: { x: 0, v: 0 }, tx: 0, tz: 0, tyaw: 0, place: still, slot: null, lx: h.x, lz: h.z, lyaw: h.yaw,
        g: newGait(), gy: { x: G.y, v: 0 }, seat: { x: 0, v: 0 }, seatOk: false, hx: 0, hz: 0, flat: 0, base: 0,
        fp: V(), fq: Q(), cp: V(), cq: Q(), hands: [], clock: i * 7.3, calm: { x: 1, v: 0 }, rest: 0, settled: false, carry: 0 };
      resetGait(a.g, rig);
    });
    // The loads. Each has named places it can be (on the ground, on a back, in the hands, seated on the launcher) and travels between them.
    this.loads = []; const L = {}; this.L = L;
    const load = (name, obj, places, at, more) => { const l = Object.assign({ name, obj, places, from: places[at], to: places[at], at, e: 1, dur: 1, lift: 0, queue: [], P: V(), Q: Q(), S: V(1, 1, 1), mounted: false, fold: { x: 0, v: 0 }, foldT: 0 }, more); this.loads.push(l); L[name] = l; return l; };
    const rig0 = F[0].userData.rig, rig1 = F[1].userData.rig, yq = a => Q().setFromAxisAngle(AXY, a), xq = a => Q().setFromAxisAngle(AXX, a);
    if (this.base) load('base', this.base, { ground: Object.assign({ gnd: true }, this.base.userData.home), back: Object.assign({ fig: 0 }, this.baseRide) }, 'ground', { legs: this.legs });
    if (this.tube) {
      const hm = this.tube.userData.home, carry = onChest(rig1, 1, V(0.02, -0.2, 0.3), yq(1.25).multiply(xq(-0.12)));
      load('tube', this.tube, { seat: L.base ? { load: L.base, ...this._rel(hm, this.base.userData.home) } : Object.assign({ gnd: true }, hm), shoulder: Object.assign({ fig: 1 }, this.tubeRide), carry,
        spent: { gnd: true, p: V(1.25, 0.09, -1.75), q: yq(1.2), s: hm.s.clone() } }, 'seat');
      load('spare', this.spare, { lie: { gnd: true, p: V(1.22, 0.1, -0.8), q: yq(0.12), s: hm.s.clone() }, carry, seat: L.tube.places.seat }, 'lie');
      this.spent.position.copy(L.tube.places.spent.p); this.spent.quaternion.copy(L.tube.places.spent.q);
    }
    if (this.weapon) {
      const sc = V(R.scale, R.scale, R.scale);
      load('weapon', this.weapon, { shoulder: Object.assign({ fig: 0 }, this.weaponRide), port: onChest(rig0, 0, V(-0.1, -0.2, 0.2), yq(0.55).multiply(xq(-0.75)), sc), ground: { gnd: true, p: V(0, 0.07, 0), q: Q(), s: sc } }, 'shoulder');
      if (this.round) load('round', this.round, { muzzle: { load: L.weapon, p: this.rocket.position.clone(), q: this.rocket.quaternion.clone(), s: V(1, 1, 1) },
        bag: onChest(rig1, 1, V(0.05, -0.1, -0.2), xq(-1.5), sc), hand: onChest(rig1, 1, V(-0.18, -0.22, 0.36), yq(0.9).multiply(xq(-0.5)), sc) }, 'bag');
    }
    // Hands. Each says where a hand should be (on a load, or on the chest strap of a pack) and when.
    const PR = TeamView.POLE_R, PL = TeamView.POLE_L, strap = (rig, side, dx) => rig.at[J[side + 'Arm']].p.clone().add(V(dx, -0.14, 0.13)).sub(rig.at[S2].p).applyQuaternion(rig.at[S2].q.clone().invert());
    const hand = (i, side, kind, v, load, on, fidget) => F[i].userData.a.hands.push({ side, pole: side === 'Right' ? PR : PL, kind, v, load, on, fidget: fidget || 0, s: { x: 0, v: 0 } });
    const atPlace = (l, name) => l.to === l.places[name] && l.e >= 1, heldBy = (l, i) => l.to.fig === i || (l.e < 1 && l.from.fig === i), a0 = F[0].userData.a, a1 = F[1].userData.a;
    const lifting = () => { const l = L.base; return l.e < 1 && (l.to.fig === 0 ? l.e < 0.45 : l.from.fig === 0 ? l.e > 0.55 : true); };   /* in his hands while it is in front of him, not while it swings onto his back */
    if (L.base) {
      const hb = this.base.userData.home.s;                                       /* on the controls at the back of the sight unit (small corrections while aiming) */
      hand(0, 'Right', 'load', V(-0.03, 0.14, -0.36), L.base, () => atPlace(L.base, 'ground') && a0.key === 'gunner' && !a0.tl, 1);
      hand(0, 'Left', 'load', V(0.13, 0.1, -0.36), L.base, () => atPlace(L.base, 'ground') && a0.key === 'gunner' && !a0.tl, 1);
      hand(0, 'Right', 'chest', strap(rig0, 'Right', 0.05), null, () => L.base.to.fig === 0 && L.base.e > 0.5 && a0.post === 'up');
      hand(0, 'Left', 'chest', strap(rig0, 'Left', -0.05), null, () => L.base.to.fig === 0 && L.base.e > 0.5 && a0.post === 'up');
      hand(0, 'Right', 'load', V(-0.1, 0.1, -0.2), L.base, () => lifting() && a0.post !== 'flat');      /* both hands on the launcher while it is lifted or set down */
      hand(0, 'Left', 'load', V(0.1, 0.1, 0.2), L.base, () => lifting() && a0.post !== 'flat');
      void hb;
    }
    if (L.tube) for (const l of [L.tube, L.spare]) {
      hand(1, 'Right', 'load', V(-0.02, -0.06, -0.28), l, () => heldBy(l, 1) && a1.post !== 'flat');
      hand(1, 'Left', 'load', V(0.02, -0.06, 0.3), l, () => heldBy(l, 1) && a1.post !== 'flat' && !(l.to === l.places.shoulder && l.e > 0.6));
    }
    if (L.weapon) {
      hand(0, 'Right', 'load', V(R.grip[0], R.grip[1], R.grip[2]), L.weapon, () => heldBy(L.weapon, 0) && a0.post !== 'flat');
      hand(0, 'Left', 'load', V(R.grip2[0], R.grip2[1], R.grip2[2]), L.weapon, () => heldBy(L.weapon, 0) && a0.post === 'low');
      if (L.round) hand(1, 'Right', 'load', V(0, 0, 0.12), L.round, () => this.round.visible && L.round.to !== L.round.places.bag && !(atPlace(L.round, 'muzzle') && this._handOff));
    }
    this.act = 'weapon'; this.want = 'weapon'; this.setUp = true; this.hold = false; this.goWhenPacked = false; this.clock = 0; this.todo = []; this.lag = V(); this.back = V(); this.trail = [];
    this.P = { x: psi, v: 0 }; this._psi = psi; this._want0 = null; this._wait = 0; this._gx = null; this._gz = 0; this._gy = 0; this._err = null;
    this.kick = { x: 0, v: 0 }; this.away01 = { x: 0, v: 0 }; this._awayUntil = -1; this._firing = false; this._reload = null; this._info = Object.assign({}, TeamView.INFO); this.dying = false; this._deadT = 0; this._handOff = false;
    this.anim = true; this._snap(); this._poseAll(0, 0);
  }
  // how one thing sits relative to another (both given in the team's frame)
  _rel(a, b) { const inv = b.q.clone().invert(); return { p: a.p.clone().sub(b.p).applyQuaternion(inv).divide(b.s), q: inv.clone().multiply(a.q), s: a.s.clone().divide(b.s) }; }

  // ---- every frame ----
  update(dt, mode, near, info) {
    if (!this.figures) return;
    if (!this.anim || this._err) return;
    try { this._update(dt > 0 ? dt : 0, mode, near, info || TeamView.INFO); }
    catch (e) { this._err = e; console.error('enemy team animation stopped: ' + (e && e.stack || e)); }   /* a fault here must never stop the picture */
  }
  _update(dt, mode, near, info) {
    const I = this._info, moving = mode === 'walk' || mode === 'run';
    I.loaded = info.loaded !== false; I.spare = info.spare !== false; I.firing = !!info.firing; I.reload = info.reload || 0; I.pack = info.pack || 0; I.setup = info.setup || 0; I.dead = !!info.dead;
    const dist = info.dist != null ? info.dist : near ? 20 : 400;
    this.mode = mode;
    const want = I.dead ? 'dead' : moving ? 'move' : mode === 'down' ? 'down' : I.pack > 0 ? 'packed' : 'weapon';
    const changed = want !== this.want;
    // how often the figures are redone: every frame when close, less often further away, hardly at all when far or with nothing going on
    const lod = dist < 45 ? 0 : dist < 160 ? 1 : dist < 330 ? 2 : 3, every = lod === 0 ? 0 : lod === 1 ? 1 / 90 : lod === 2 ? 1 / 20 : 0.25;
    this._wait += dt;
    if (!changed && (this._wait <= 0 || this._wait < every)) return;
    if (!changed && lod > 0 && this._quiet() && !I.firing && !this._reload && this._gx != null && Math.abs(this.group.position.x - this._gx) + Math.abs(this.group.position.z - this._gz) < 1e-4 && Math.abs(wrapPi(this._wantPsi() - this.P.x)) < 0.01) { this._wait = 0; return; }
    dt = Math.min(this._wait, 3); this._wait = 0;
    if (changed) this._request(want);
    this._scenes(dt);
    this._tick(dt);
    this._poseAll(dt, lod);
  }
  _wantPsi() { return this._face == null ? this.P.x : Math.PI - this._face * DEG; }
  // nothing is moving: every figure has finished what it was doing and every load is where it belongs
  _quiet() { if (this.todo.length) return false; for (const f of this.figures) if (!f.userData.a.settled) return false; for (const l of this.loads) if (l.e < 1 || l.queue.length) return false; return true; }
  _h(x, z) { return this.ground ? this.ground(x, z) : this.group.position.y; }

  // the team as a whole, in small steps of time: where its frame is, which way it faces, where each man stands and how his stride goes
  _tick(dt) {
    const F = this.figures, G = this.group.position, want = this._wantPsi();
    let gx = this._gx == null ? 0 : G.x - this._gx, gz = this._gx == null ? 0 : G.z - this._gz, gy = this._gx == null ? 0 : G.y - this._gy;
    if (this._gx == null || Math.hypot(gx, gz) > 6 + 15 * dt) { this._gx = G.x; this._gz = G.z; this._gy = G.y; this._snap(); gx = gz = gy = 0; }
    this._gx = G.x; this._gz = G.z; this._gy = G.y;
    if (this._want0 == null) this._want0 = want;
    const n = Math.max(1, Math.min(16, Math.ceil(dt / 0.0042))), h = dt / n, sx = gx / n, sz = gz / n, sy = gy / n, turning = !(this.hold || this.act === 'dead' || (this.act === 'down' && !this.setUp));
    for (let k = 1; k <= n && h > 0; k++) {
      this.clock += h;
      while (this.todo.length && this.todo[0].t <= this.clock) { const ev = this.todo.shift(); ev.fn(); }
      if (this.hold) { this.lag.x += sx; this.lag.z += sz; this.lag.y += sy; }           /* the men are still getting up: the team's frame stays where the weapon is */
      if (turning) chaseAngle(this.P, this._want0, want, stiff(this.act === 'move' ? 0.28 : this.act === 'arrive' ? 0.6 : 0.45), h);
      const bl = this.back.length(); if (bl > 0) this.back.multiplyScalar(Math.max(0, bl - 0.9 * h) / bl);          /* left behind while getting up: they close the gap at a jog, not a sprint */
      const rest = n - k, ox = G.x - sx * rest - this.lag.x - this.back.x, oz = G.z - sz * rest - this.lag.z - this.back.z, psi = this.P.x;
      for (let i = 0; i < F.length; i++) this._walk(F[i].userData.a, h, ox, oz, psi);
      if (this.act === 'move') this._leave(F[0].userData.a);
      if (this.act === 'arrive') {
        let there = true; for (const f of F) { const a = f.userData.a; if (Math.hypot(a.X.x - a.tx, a.Z.x - a.tz) > 0.16 || Math.hypot(a.X.v, a.Z.v) > 0.3) there = false; }
        this._arriveT += h; if ((there && Math.abs(wrapPi(want - psi)) < 0.2) || this._arriveT > 7) this._toWeapon(this._info.setup > 0 ? this._info.setup : 4.5);
      }
    }
    this._want0 = want; this._psi = this.P.x; this.group.rotation.y = this._psi;
    const cs = Math.cos(this._psi), sn = Math.sin(this._psi), L = this.lag;
    this.inner.position.set(-(L.x * cs - L.z * sn), -L.y, -(L.x * sn + L.z * cs));
  }
  // one figure, one small step of time: he chases the spot where he should be (his place at the weapon, or his place in the file),
  // turns to face the way he is going, and his stride is moved on by the ground he really covered
  _walk(a, h, ox, oz, psi) {
    a.clock += h;
    const striding = a.gen === 'stride', s = striding && a.slot ? a.slot : a.place, cs = Math.cos(psi), sn = Math.sin(psi);
    let tx = ox + s.x * cs + s.z * sn, tz = oz - s.x * sn + s.z * cs, ty = psi + s.yaw; const x0 = a.X.x, z0 = a.Z.x, w0 = a.Yw.x, gx0 = a.GX.x, gz0 = a.GZ.x, gy0 = a.GY.x;
    if (striding && s.behind && this.trail.length) { this._behind(s.behind, s.side); tx = _v4.x; tz = _v4.z; ty = _v4.y; }   /* the men behind follow in the leader's footsteps */
    // the spot aimed for slides smoothly to a new place when he is given one (it keeps up exactly with a place that simply moves along)
    const yg = stiff(striding ? 0.6 : 0.3);
    chase(a.GX, a.tx, tx, yg, h, 1); chase(a.GZ, a.tz, tz, yg, h, 1); a.tx = tx; a.tz = tz;
    // he chases it: trailing a little when walking (so he eases off the mark and eases to a halt), exactly when at his place
    const y = stiff(striding ? 0.22 : 0.2);
    chase(a.X, gx0, a.GX.x, y, h, striding ? 0 : 1); chase(a.Z, gz0, a.GZ.x, y, h, striding ? 0 : 1);
    if (striding) { const v = Math.hypot(a.X.v, a.Z.v), m = ease((v - 0.3) / 0.7); ty += wrapPi(Math.atan2(a.X.v, a.Z.v) - ty) * m; }
    chaseAngle(a.GY, a.tyaw, ty, stiff(striding ? 0.12 : 0.32), h, 1); a.tyaw = ty;
    chaseAngle(a.Yw, gy0, a.GY.x, stiff(striding ? 0.12 : 0.26), h, striding ? 0 : 1);
    if (striding || a.kw.x > 0.001) {
      const ex = a.X.x - x0, ez = a.Z.x - z0, c2 = Math.cos(a.Yw.x), s2 = Math.sin(a.Yw.x);
      stepGait(a.g, a.rig, ex * c2 - ez * s2, ex * s2 + ez * c2, wrapPi(a.Yw.x - w0), h);
    }
  }
  // The path the leader has walked, a point every 20 cm, and the spot `d` metres back along it (and `side` metres to one side).
  // Following the path, not a fixed spot beside the leader, is what keeps the second man from being swung about when the team turns.
  _leave(a) {
    const T = this.trail, n = T.length, x = a.X.x, z = a.Z.x;
    if (n && Math.hypot(x - T[n - 1].x, z - T[n - 1].z) < 0.2) return;
    if (n >= 24) { const p = T.shift(); p.x = x; p.z = z; T.push(p); } else T.push({ x, z });
  }
  _behind(d, side) {
    const T = this.trail, lead = this.figures[0].userData.a; let px = lead.X.x, pz = lead.Z.x, left = d, dx = Math.sin(lead.Yw.x), dz = Math.cos(lead.Yw.x);
    for (let i = T.length - 1; i >= 0 && left > 0; i--) {
      const q = T[i], sx = px - q.x, sz = pz - q.z, len = Math.hypot(sx, sz); if (len < 1e-6) continue;
      dx = sx / len; dz = sz / len;
      if (len >= left) { px -= dx * left; pz -= dz * left; left = 0; } else { px = q.x; pz = q.z; left -= len; }
    }
    const k = side * sat(1 - left / d);                      /* (he steps out to the side only once the file has opened up) */
    _v4.set(px + dz * k, Math.atan2(dx, dz), pz - dx * k);
  }
  // put everyone exactly where they should be (the team was placed somewhere new)
  _snap() {
    const G = this.group.position, want = this._wantPsi(); this.P.x = want; this.P.v = 0; this._want0 = want; this._psi = want; this.lag.set(0, 0, 0); this.back.set(0, 0, 0);
    const cs = Math.cos(want), sn = Math.sin(want);
    for (const f of this.figures) {
      const a = f.userData.a, s = a.gen === 'stride' && a.slot ? a.slot : a.place;
      a.X.x = a.GX.x = a.tx = G.x + s.x * cs + s.z * sn; a.Z.x = a.GZ.x = a.tz = G.z - s.x * sn + s.z * cs; a.X.v = a.Z.v = a.GX.v = a.GZ.v = 0; a.Yw.x = a.GY.x = a.tyaw = want + s.yaw; a.Yw.v = a.GY.v = 0;
      a.gy.x = this._h(a.X.x, a.Z.x); a.gy.v = 0; a.g.refOk = false; a.seatOk = false; a.settled = false; a.rest = 0;
      if (a.gen === 'stride') resetGait(a.g, a.rig);
    }
    this._groundLoads();
  }
  // how far above or below the team's own spot the ground is under each thing that lies on the ground
  _groundLoads() {
    if (!this.loads) return; const G = this.group.position, cs = Math.cos(this.P.x), sn = Math.sin(this.P.x);
    for (const l of this.loads) for (const k in l.places) { const p = l.places[k]; if (p.gnd) p.dy = this._h(G.x - this.lag.x + p.p.x * cs + p.p.z * sn, G.z - this.lag.z - p.p.x * sn + p.p.z * cs) - (G.y - this.lag.y); }
  }

  // ---- posing (once per frame at most) ----
  _poseAll(dt, lod) {
    const F = this.figures, I = this._info;
    // a start when the weapon fires, and the second man turning his head away from the blast
    chase(this.kick, 0, 0, stiff(0.07), dt || 1e-4, 1);
    const turnAway = this.clock < this._awayUntil ? 1 : 0; chase(this.away01, turnAway, turnAway, stiff(turnAway ? 0.05 : 0.22), dt || 1e-4, 1);
    for (let i = 0; i < F.length; i++) this._pose(F[i], F[i].userData.a, dt, lod);
    for (const l of this.loads) this._carry(l, dt);
    for (let i = F.length - 1; i >= 0; i--) this._finish(F[i], F[i].userData.a, dt, lod, i !== F.length - 1);
    void I;
  }
  // one figure: the pose aimed for, every joint chasing it, and where his body ends up (so the loads can be placed)
  _pose(f, a, dt, lod) {
    const rig = a.rig, C = a.cur, O = a.out, g = a.g, tl = a.tl;
    if (a.settled && lod > 0) return;
    // the timeline of in-between poses moves on
    let seg = null, u = 0;
    if (tl) {
      tl.t += dt;
      while (tl.k < tl.keys.length && tl.t >= tl.keys[tl.k].d) { tl.t -= tl.keys[tl.k].d; tl.k++; if (tl.k < tl.keys.length && !tl.keys[tl.k].q) this._toStride(a); }
      if (tl.k >= tl.keys.length) { const last = tl.keys[tl.keys.length - 1]; a.hold = last.q; a.tl = null; a.rest = 0; }
      else { seg = tl.keys[tl.k]; u = tl.t / seg.d; }
    }
    const striding = a.gen === 'stride';
    // how much the legs are the walking legs (exactly on their footprints) rather than a held pose
    const kwT = striding ? (seg ? ease(u) : 1) : 0; chase(a.kw, kwT, kwT, stiff(striding ? 0.05 : 0.07), dt || 1e-4, 1);
    let kw = a.kw.x; if (kw > 0.9995 && striding && !seg) kw = a.kw.x = 1; else if (kw < 0.0005 && !striding) kw = a.kw.x = 0; kw = sat(kw);
    const wy = a.Yw.x, cs = Math.cos(wy), sn = Math.sin(wy), X = a.X.x, Z = a.Z.x;
    if (striding || kw > 0) {
      // the ground under each foot, and how steeply it rises the way he faces
      if (lod < 2 && this.ground) {
        for (let k = 0; k < 2; k++) { const ft = g.feet[k]; if (!ft.on || ft.fresh) { ft.gY = this._h(X + ft.x * cs + ft.z * sn, Z - ft.x * sn + ft.z * cs); ft.fresh = false; } }
        const rise = Math.atan2(this._h(X + sn * 0.35, Z + cs * 0.35) - this._h(X - sn * 0.35, Z - cs * 0.35), 0.7);
        g.slope += (Math.max(-0.5, Math.min(0.5, rise)) - g.slope) * (1 - Math.exp(-dt / 0.15));
      } else { const y0 = this._h(X, Z); g.feet[0].gY = g.feet[1].gY = y0; g.feet[0].fresh = g.feet[1].fresh = true; g.slope = 0; }
      const mid = (g.feet[0].gY + g.feet[1].gY) / 2;
      if (!g.refOk) { g.ref.x = mid; g.ref.v = 0; g.refOk = true; g.ref0 = mid; } else chase(g.ref, g.ref0, mid, stiff(0.09), dt || 1e-4, 1);
      g.ref0 = mid; g.feet[0].gy = g.feet[0].gY - g.ref.x; g.feet[1].gy = g.feet[1].gY - g.ref.x;
      const clip = TeamView.CLIPS && (g.run > 0.5 ? TeamView.CLIPS.run : TeamView.CLIPS.walk);
      stridePose(rig, g, a.carry, dt);
      if (clip) { clipPose(clip, rig, g.ph * clip.duration, TQ); } else solve(rig, SD, SX, TQ);
      a.sox = SO.x; a.soy = SO.y;
    }
    // the pose aimed for at this instant
    let Gp;
    if (seg) { const A = tl.k ? tl.keys[tl.k - 1].q : a.from, B = seg.q || TQ; Gp = GQ; for (let j = 0; j < NJ; j++) Gp[j].slerpQuaternions(A[j], B[j], u); }
    else Gp = striding ? TQ : a.hold;
    // every joint chases it; when walking, the hips and legs are exactly the stride
    const Y = striding && !seg ? Y_MOVING : Y_POSING, gp = a.gp, w = a.w;
    if (dt > 0) for (let j = 0; j < NJ; j++) {
      if (LEGS[j] && kw >= 1) { C[j].copy(TQ[j]); w[j].set(0, 0, 0); O[j].copy(C[j]); }
      else { chaseJoint(C[j], w[j], gp[j], Gp[j], Y[j], dt); if (LEGS[j] && kw > 0) O[j].slerpQuaternions(C[j], TQ[j], kw); else O[j].copy(C[j]); }
      gp[j].copy(Gp[j]);
    } else for (let j = 0; j < NJ; j++) { C[j].copy(Gp[j]); O[j].copy(Gp[j]); gp[j].copy(Gp[j]); w[j].set(0, 0, 0); }
    // signs of life in the back: breathing, and a start when the weapon fires
    const calmT = a.tl || striding ? 0 : 1; chase(a.calm, calmT, calmT, stiff(0.25), dt || 1e-4, 1);
    if (lod === 0) {
      const guiding = this._info.firing && a.i === 0 && !this.weapon ? 0.45 : 1;
      const breath = (0.012 * Math.sin(a.clock * 1.7) * guiding * a.calm.x) - (a.i === 0 ? (this.weapon ? 0.07 : 0.03) : 0.02) * this.kick.x;
      O[J.Spine1].multiply(_q1.setFromAxisAngle(AXX, breath));
    }
    // where his body is: on the ground under him, lying along the slope when he is flat
    let low = 0, flat = 0;
    if (kw < 1) {
      fk(rig, O);
      const up = _v1.copy(Wp[J.Neck]).sub(Wp[0]).normalize().y; flat = ease((0.8 - Math.abs(up)) / 0.45);
      if (lod < 2 && this.ground && !a.settled) { a.hx = (this._h(X + 0.4, Z) - this._h(X - 0.4, Z)) / 0.8; a.hz = (this._h(X, Z + 0.4) - this._h(X, Z - 0.4)) / 0.8; }
      const k = 1 - flat, gx = (a.hx * cs - a.hz * sn) * k, gz = (a.hx * sn + a.hz * cs) * k;
      low = lowest(gx, gz);
      const seat = 0.07 + 0.06 * flat - low;                                     /* joints sit a few centimetres inside the body, more so in the chest */
      if (!a.seatOk || dt <= 0) { a.seat.x = seat; a.seat.v = 0; a.seatOk = true; a.seat0 = seat; } else chase(a.seat, a.seat0, seat, stiff(0.03), dt, 1);
      a.seat0 = seat;
      const hY = this._h(X, Z); if (dt > 0) chase(a.gy, a.gy0 == null ? hY : a.gy0, hY, stiff(0.06), dt, 1); else { a.gy.x = hY; a.gy.v = 0; } a.gy0 = hY;
    } else { fk(rig, O, UPPER); a.seatOk = false; a.gy.x = g.ref.x; a.gy.v = 0; a.gy0 = null; }
    a.flat = flat;
    const baseY = mix(a.gy.x, kw > 0 ? g.ref.x : a.gy.x, kw) - (this.group.position.y - this.lag.y), ox = (a.sox || 0) * kw, oy = mix(kw < 1 ? a.seat.x : 0, a.soy || 0, kw);
    // his place in the team's frame
    const psi = this._psi, G = this.group.position, dx = X - (G.x - this.lag.x), dz = Z - (G.z - this.lag.z), cp = Math.cos(psi), sp = Math.sin(psi);
    a.lx = dx * cp - dz * sp; a.lz = dx * sp + dz * cp; a.lyaw = wy - psi;
    const cy = Math.cos(a.lyaw), sy = Math.sin(a.lyaw);
    a.fp.set(a.lx + ox * cy, baseY + oy, a.lz - ox * sy);
    a.fq.setFromAxisAngle(AXY, a.lyaw);
    if (flat > 0.01 && (a.hx || a.hz)) {                                           /* lying down: the body follows the slope of the ground */
      _v1.set(-a.hx, 1, -a.hz).normalize(); _q1.setFromUnitVectors(AXY, _v1); _q2.identity().slerp(_q1, flat);
      a.fq.setFromAxisAngle(AXY, wy).premultiply(_q2).premultiply(_q1.setFromAxisAngle(AXY, -psi));
    }
    a.cq.multiplyQuaternions(a.fq, Wq[S2]); a.cp.copy(Wp[S2]).applyQuaternion(a.fq).add(a.fp);
    a.posed = true;
  }
  // one figure, second half: hands onto whatever he holds, his head, and the result handed to the model
  _finish(f, a, dt, lod, again) {
    if (!a.posed) return; a.posed = false;
    const rig = a.rig, O = a.out, I = this._info;
    if (again) fk(rig, O, UPPER);
    let busy = 0;
    for (const hd of a.hands) {
      const on = hd.on() ? 1 : 0; chase(hd.s, on, on, stiff(0.085), dt || 1e-4, 1); if (dt <= 0) hd.s.x = on;
      const w = sat(hd.s.x); if (w < 0.003) continue; busy = Math.max(busy, w);
      if (hd.kind === 'chest') _v1.copy(hd.v).applyQuaternion(Wq[S2]).add(Wp[S2]);
      else {
        const l = hd.load; _v1.copy(hd.v);
        if (hd.fidget && lod === 0) { const t = a.clock, k = I.firing ? 0.0018 : 0.004; _v1.x += k * drift(t, 0.9, hd.side === 'Right' ? 1 : 4); _v1.y += k * drift(t, 0.7, hd.side === 'Right' ? 2 : 5); }   /* small corrections on the controls */
        _v1.multiply(l.S).applyQuaternion(l.Q).add(l.P).sub(a.fp).applyQuaternion(_q1.copy(a.fq).invert());
      }
      reachQ(rig, O, hd.side, _v1, hd.pole, w);
    }
    a.carry += (busy - a.carry) * (1 - Math.exp(-(dt || 0) * 6));
    // the head: looking about, ducking, turning away from the blast
    if (lod === 0) {
      const t = a.clock, calm = a.calm.x, second = a.i > 0; let look = 0, nod = 0;
      if (this.act === 'down') { const pk = peek(t + a.i * 4.1 + (this._seed || 0), 9.5, 2.4) * calm; nod = 0.5 * calm - 0.75 * pk; look = 0.35 * pk * drift(t, 0.5, a.i); }
      else if (second && this.act === 'weapon') look = (0.26 * Math.sin(t * 0.37 + 1) + 0.14 * Math.sin(t * 0.83 + 2.2)) * calm * (1 - this.away01.x);
      else if (!second && this.weapon && this.act === 'weapon') look = 0.05 * drift(t, 0.3, 2) * calm;
      if (second) { look += (a.lx > 0 ? -1 : 1) * 0.95 * this.away01.x; nod += 0.4 * this.away01.x + 0.2 * this.kick.x; } else nod -= 0.05 * this.kick.x;
      if (look || nod) O[J.Head].multiply(_q1.setFromAxisAngle(AXY, look)).multiply(_q2.setFromAxisAngle(AXX, nod));
    }
    const B = rig.bones; for (let k = 0; k < NJ; k++) B[k].quaternion.copy(O[k]);
    f.position.copy(a.fp); f.quaternion.copy(a.fq);
    // has he come to rest? (then a far-off figure need not be redone until something changes)
    if (!a.tl && a.gen === 'static' && Math.hypot(a.X.x - a.tx, a.Z.x - a.tz) < 0.004 && Math.abs(a.X.v) + Math.abs(a.Z.v) < 0.01) { a.rest += dt; if (a.rest > 1.5) a.settled = true; } else { a.rest = 0; a.settled = false; }
  }
  // a load: at one of its places, or on its way from one to the next
  _frame(pl, P, Qo, S) {
    if (pl.fig != null) { const a = this.figures[pl.fig].userData.a; P.copy(pl.p).applyQuaternion(a.cq).add(a.cp); Qo.multiplyQuaternions(a.cq, pl.q); S.copy(pl.s); }
    else if (pl.load) { const l = pl.load; P.copy(pl.p).multiply(l.S).applyQuaternion(l.Q).add(l.P); Qo.multiplyQuaternions(l.Q, pl.q); S.copy(pl.s).multiply(l.S); }
    else { P.copy(pl.p); if (pl.gnd) P.y += pl.dy || 0; Qo.copy(pl.q); S.copy(pl.s); }
  }
  _carry(l, dt) {
    if (l.e < 1) { l.e += dt / l.dur; if (l.e >= 1) { l.e = 1; const nx = l.queue.shift(); if (nx) { l.from = l.to; l.to = l.places[nx.to]; l.e = 0; l.dur = nx.dur; l.lift = nx.lift; } } }
    if (l.e >= 1) this._frame(l.to, l.P, l.Q, l.S);
    else {
      const s = ease(l.e); this._frame(l.from, _P0, _Q0, _S0); this._frame(l.to, l.P, l.Q, l.S);
      l.P.lerpVectors(_P0, l.P, s); l.P.y += l.lift * Math.sin(Math.PI * s); l.Q.slerpQuaternions(_Q0, l.Q, s); l.S.lerpVectors(_S0, l.S, s);
    }
    const o = l.obj, onBone = l.e >= 1 && l.to.fig != null;
    if (onBone) { if (!l.mounted) { const b = this.figures[l.to.fig].userData.a.rig.bones[S2]; b.add(o); o.position.copy(l.to.p); o.quaternion.copy(l.to.q); o.scale.copy(l.to.s); l.mounted = true; } }
    else { if (o.parent !== this.inner) this.inner.add(o); l.mounted = false; o.position.copy(l.P); o.quaternion.copy(l.Q); o.scale.copy(l.S); }
    if (l.legs) { chase(l.fold, l.foldT, l.foldT, stiff(0.16), dt || 1e-4, 1); if (dt <= 0) l.fold.x = l.foldT; const k = mix(1, 0.34, sat(l.fold.x)); l.legs.scale.set(k, 1, k); }   /* tripod legs folded in for the march */
  }

  // ---- what the team does ----
  _at(delay, fn) { const ev = { t: this.clock + delay, fn }; let i = this.todo.length; while (i > 0 && this.todo[i - 1].t > ev.t) i--; this.todo.splice(i, 0, ev); }
  // send a load to one of its places (and on to others after that)
  _send(l, to, dur, lift = 0.1) {
    if (!l) return;
    if (l.e < 1) { this._frame(l.from, _P0, _Q0, _S0); const s = ease(l.e), P = V(), Qo = Q(), S = V(); this._frame(l.to, P, Qo, S); l.from = { p: _P0.clone().lerp(P, s).setY(mix(_P0.y, P.y, s) + l.lift * Math.sin(Math.PI * s)), q: _Q0.clone().slerp(Qo, s), s: _S0.clone().lerp(S, s) }; }
    else l.from = l.to;
    l.queue.length = 0; l.to = l.places[to]; l.at = to; if (l.from === l.to) { l.e = 1; return; } l.e = 0; l.dur = dur; l.lift = lift;
  }
  _then(l, to, dur, lift = 0.05) { if (l) { if (l.e >= 1) this._send(l, to, dur, lift); else { l.queue.push({ to, dur, lift }); l.at = to; } } }
  // start one man on a list of in-between poses [[name or 'live' (= on his feet, walking or standing), seconds], ...] ending at a place
  _go(a, keys, place, key, post) {
    for (let j = 0; j < NJ; j++) a.from[j].copy(a.gp[j]);
    a.tl = { keys: keys.map(k => ({ q: k[0] === 'live' ? null : a.K[k[0]], d: k[1] })), k: 0, t: 0 };
    if (place) a.place = place;
    a.key = key; a.post = post; a.settled = false; a.rest = 0;
    if (keys[0][0] === 'live') this._toStride(a); else a.gen = 'static';
  }
  _toStride(a) { if (a.gen === 'stride') return; a.gen = 'stride'; if (a.kw.x < 0.01) resetGait(a.g, a.rig); a.settled = false; }
  // the in-between poses for getting from how he is now to a new pose; k stretches the time
  _route(a, key, post, k = 1) {
    const from = a.post, R = [];
    if (from === 'flat') { if (post !== 'flat') { R.push(['pushup', 0.38], ['hands_knees', 0.36]); if (post === 'up') R.push(['knee', 0.42], ['live', 0.5]); else R.push([key, 0.5]); } else R.push([key, 0.45]); }
    else if (from === 'low') { if (post === 'flat') R.push(['hands_knees', 0.42], ['pushup', 0.34], [key, 0.32]); else if (post === 'up') { if (!KNEELING[a.key]) R.push(['knee', 0.34]); R.push(['live', 0.52]); } else R.push([key, 0.55]); }
    else { if (post === 'flat') R.push(['crouch', 0.28], ['hands_knees', 0.34], ['pushup', 0.28], [key, 0.3]); else if (post === 'low') { if (!KNEELING[key] && key !== 'crouch') R.push(['crouch', 0.4]); R.push([key, 0.5]); } else R.push(['live', 0.3]); }
    for (const r of R) r[1] *= k; return R;
  }
  _to(i, key, post, place, k) {
    const a = this.figures[i].userData.a;
    if (post === 'up' ? a.post === 'up' : (a.key === key && a.place === place)) return 0;       /* already there, or on his way */
    const R = this._route(a, key, post, k); this._go(a, R, place, key, post); return R.reduce((s, r) => s + r[1], 0);
  }
  // where a man is now, as a place in the team's frame (optionally a little further on the way he faces)
  _here(a, ahead = 0) { const psi = this.P.x, G = this.group.position, wx = a.X.x + Math.sin(a.Yw.x) * ahead, wz = a.Z.x + Math.cos(a.Yw.x) * ahead, dx = wx - (G.x - this.lag.x), dz = wz - (G.z - this.lag.z), cs = Math.cos(psi), sn = Math.sin(psi); return { x: dx * cs - dz * sn, z: dx * sn + dz * cs, yaw: wrapPi(a.Yw.x - psi) }; }
  // drop whatever small scene was being acted out (a new order has come)
  _cancel() {
    this.todo.length = 0; this._reload = null; this._handOff = false; if (this.round) this.round.visible = false;
    if (this.tube && !this.tube.visible) this.tube.visible = true;
    if (this.L.spare && this.L.spare.at !== 'lie') { this._send(this.L.spare, 'lie', 0.4, 0.05); }
  }

  // a new order from the battle
  _request(want) {
    const was = this.act, F = this.figures; this.want = want;
    if (want === 'dead') { this._cancel(); this._fall(); return; }
    if (was === 'dead') return;
    if (want === 'move') {
      if (was === 'move') return;
      if (was === 'packed' || was === 'arrive') { this._stepOut(); return; }
      this.goWhenPacked = true; this.hold = true;
      if (was !== 'packing') this._pack(was === 'down' && !this.setUp ? 0 : this.base ? 1.7 : 0.8);
    } else if (want === 'packed') {
      if (was === 'weapon' || (was === 'down' && this.setUp)) { this.goWhenPacked = false; this._pack(Math.max(1.2, Math.min(this._info.pack - 0.3, this.base ? 4.4 : 1.6))); }
      else if (was === 'down') { this.act = 'packed'; F.forEach((f, i) => this._to(i, 'live', 'up', null)); this._upWeapon(0.8); }
    } else if (want === 'down') {
      this._cancel(); this.hold = false; this.goWhenPacked = false; this.act = 'down'; this.back.set(0, 0, 0);
      F.forEach((f, i) => { const a = f.userData.a; this._to(i, 'pinned', 'flat', this.setUp ? a.down : this._here(a, a.post === 'up' ? 0.55 : 0)); });
      if (this.L.weapon) {                                                         /* the launcher is laid on the ground beside him */
        const t = F[0].userData.a.place, c = Math.cos(t.yaw), s = Math.sin(t.yaw), g = this.L.weapon.places.ground;
        g.p.set(t.x + (-0.42 * c + 0.5 * s), 0.07, t.z + (0.42 * s + 0.5 * c)); g.q.setFromAxisAngle(AXY, t.yaw); this._groundLoads(); this._at(0.25, () => this._send(this.L.weapon, 'ground', 0.6, 0.02));
      }
    } else {   /* back to the weapon */
      if (was === 'down' && this.setUp) { this.act = 'weapon'; F.forEach((f, i) => { const a = f.userData.a; this._to(i, a.still.key, a.still.post, a.still); }); this._upWeapon(0.75); }
      else if (was === 'weapon' || was === 'arrive') return;
      else { this._cancel(); this.hold = false; this.goWhenPacked = false; this.lag.set(0, 0, 0); this.back.set(0, 0, 0); this.act = 'arrive'; this._arriveT = 0; F.forEach((f, i) => { const a = f.userData.a; a.slot = a.still; this._to(i, 'live', 'up', null); }); this._upWeapon(0.8); }
    }
  }
  // the RPG gunner picks his launcher up again: first across the chest, then up onto the shoulder from the front (never over his head)
  _upWeapon(after) { const l = this.L.weapon; if (!l || l.at === 'shoulder') return; this._at(after, () => { this._send(l, 'port', 0.5, 0.06); this._then(l, 'shoulder', 0.45, 0.02); }); }
  _stepOut() { this.act = 'move'; this.hold = false; this.goWhenPacked = false; this.back.add(this.lag); this.lag.set(0, 0, 0); { const b = this.figures[this.figures.length - 1].userData.a, l = this.figures[0].userData.a; this.trail = [{ x: b.X.x, z: b.Z.x }, { x: l.X.x, z: l.Z.x }]; } this.figures.forEach((f, i) => { const a = f.userData.a; a.slot = TeamView.FILE[i] || TeamView.FILE[1]; this._to(i, 'live', 'up', null); }); if (this.spare) this.spare.visible = false; }
  // Packing up over `dur` seconds: tripod legs folded, launcher onto the gunner's back, tube onto the second man's shoulder, both on their feet.
  _pack(dur) {
    const F = this.figures, L = this.L, a0 = F[0].userData.a, a1 = F[1].userData.a; this._cancel(); this.act = 'packing'; this.setUp = false;
    if (this.spent) this.spent.visible = false;
    let end = 0;
    if (dur <= 0) { F.forEach((f, i) => { end = Math.max(end, this._to(i, 'live', 'up', null)); }); this._upWeapon(0.7); }
    else if (L.base) {
      const k = Math.max(0.42, Math.min(1.25, dur / 4.4)), near = TeamView.BESIDE;
      this._to(0, 'kneel', 'low', a0.still, k);
      this._at(0.5 * k, () => { L.base.foldT = 1; });
      this._at(1.5 * k, () => { this._send(L.base, 'back', 1.1 * k, 0.12); });
      this._at(2.5 * k, () => { this._to(0, 'live', 'up', null, k); });
      if (L.tube) {
        this._to(1, 'knee', 'low', near, k);
        this._at(1.5 * k, () => { this._send(L.tube, 'carry', 0.8 * k, 0.1); this._then(L.tube, 'shoulder', 0.8 * k, 0.05); });
        this._at(3.0 * k, () => { this._to(1, 'live', 'up', null, k); });
      } else this._to(1, 'live', 'up', null, k);
      end = 4.1 * k;
    } else { F.forEach((f, i) => { end = Math.max(end, this._to(i, 'live', 'up', null)); }); this._upWeapon(0.3); end = Math.max(end, this.L.weapon && this.L.weapon.at !== 'shoulder' ? 1.3 : 0); }
    this._at(end, () => { if (this.goWhenPacked) this._stepOut(); else this.act = 'packed'; });
  }
  // Setting up over about `dur` seconds: launcher set down and its legs opened, the gunner behind it, the tube brought and seated.
  _toWeapon(dur) {
    const F = this.figures, L = this.L, a0 = F[0].userData.a, a1 = F[1].userData.a; this._cancel(); this.act = 'weapon'; this.setUp = true; this.hold = false; this.lag.set(0, 0, 0); this._groundLoads();
    if (L.base) {
      const k = Math.max(0.5, Math.min(1.3, dur / 4.6)), near = TeamView.BESIDE;
      this._to(0, 'kneel', 'low', a0.still, k);
      this._at(0.45 * k, () => { this._send(L.base, 'ground', 1.1 * k, 0.12); });
      this._at(1.4 * k, () => { L.base.foldT = 0; });
      this._at(2.2 * k, () => { this._to(0, 'gunner', 'low', a0.still, k); });
      if (L.tube) {
        this._to(1, 'knee', 'low', near, k);
        this._at(1.0 * k, () => { this._send(L.tube, 'carry', 0.7 * k, 0.05); });
        this._at(2.1 * k, () => { this._send(L.tube, 'seat', 0.9 * k, 0.1); });
        this._at(3.3 * k, () => { this._to(1, a1.still.key, a1.still.post, a1.still, k); if (this.spare) this.spare.visible = this._info.spare; });
      } else this._at(1.0 * k, () => { this._to(1, a1.still.key, a1.still.post, a1.still, k); });
    } else { F.forEach((f, i) => { const a = f.userData.a; this._to(i, a.still.key, a.still.post, a.still); }); this._upWeapon(0.1); }
  }
  // Knocked out: each man buckles and falls where he is, and what he carried drops beside him.
  _fall() {
    const F = this.figures; this.act = 'dead'; this.dying = true; this._deadT = 0; this.hold = false; this.setUp = false;
    F.forEach((f, i) => {
      const a = f.userData.a, back = (i + (this._seed || 0)) % 2 === 1 && a.post !== 'flat', here = this._here(a, back ? -0.4 : 0.45); here.yaw += (i ? -0.5 : 0.35);
      const keys = a.post === 'flat' ? [['fallen', 0.5]] : back ? [['buckle', 0.22 + 0.1 * i], ['fallen_back', 0.5]] : [['buckle', 0.2 + 0.1 * i], ['hands_knees', 0.28], ['fallen', 0.34]];
      this._go(a, keys, here, back ? 'fallen_back' : 'fallen', 'flat');
    });
    for (const l of this.loads) {
      if (l.to.fig == null && l.e >= 1) continue;
      this._frame(l.e >= 1 ? l.to : l.from, _P0, _Q0, _S0); const G = this.group.position, cs = Math.cos(this.P.x), sn = Math.sin(this.P.x), x = _P0.x + 0.25, z = _P0.z - 0.2;
      l.places.dropped = { p: V(x, this._h(G.x - this.lag.x + x * cs + z * sn, G.z - this.lag.z - x * sn + z * cs) - (G.y - this.lag.y) + 0.09, z), q: _Q0.clone().premultiply(Q().setFromUnitVectors(_v1.set(0, 0, 1).applyQuaternion(_Q0), _v2.set(_v1.x, 0, _v1.z).normalize())), s: _S0.clone() };
      if (l.name !== 'round') this._send(l, 'dropped', 0.55, 0);
    }
    if (this.round) this.round.visible = false;
  }

  // the small scenes at the weapon that follow the battle's clock: firing, reloading
  _scenes(dt) {
    const I = this._info, L = this.L, F = this.figures;
    if (this.act === 'dead') { this._deadT += dt; if (this._deadT > 45) this.dying = false; return; }
    if (I.firing !== this._firing) {
      this._firing = I.firing;
      if (I.firing) { this.kick.v += 54; this._awayUntil = this.clock + 1.1; for (const f of F) { f.userData.a.settled = false; f.userData.a.rest = 0; } }
    }
    if (this.rocket) { const on = I.loaded && !(this._reload && this._reload.shown === false); if (this.rocket.visible !== on) this.rocket.visible = on; }
    if (this.spare && this.act !== 'weapon' && this.act !== 'down') { if (this.spare.visible) this.spare.visible = false; }
    else if (this.spare && !this._reload && L.spare.e >= 1 && this.spare.visible !== I.spare) this.spare.visible = I.spare;
    if (this.act !== 'weapon') return;
    const reloading = !I.loaded && !I.firing && I.reload > 0;
    if (L.round && L.weapon) this._reloadRpg(reloading, I);
    else if (L.spare && L.tube) this._reloadTube(reloading, I);
  }
  // RPG: the gunner lowers the launcher, the second man comes over with a rocket from his pack and seats it, the gunner shoulders again.
  _reloadRpg(reloading, I) {
    const L = this.L, F = this.figures, a1 = F[1].userData.a, r = this._reload;
    if (!r && reloading && I.reload > 3.2) {
      const R = this._reload = { step: 1 }; this._handOff = false;
      this._send(L.weapon, 'port', 0.6, 0.02);
      this._to(1, 'crouch', 'low', TeamView.HANDOVER);
      this._at(0.7, () => { this._send(L.round, 'bag', 0.01, 0); this.round.visible = true; this._then(L.round, 'hand', 0.6, 0.12); });
      this._at(1.6, () => { this._send(L.round, 'muzzle', 0.8, 0.06); R.step = 2; });
    } else if (r && (I.loaded || !reloading && r.step > 1 && L.round.e >= 1)) {
      // the battle says a round is in: the rocket in the muzzle takes over from the one in his hand, and everyone goes back to how they were
      this.round.visible = false; this._handOff = true; this._reload = null;
      this._at(0.2, () => { this._send(L.weapon, 'shoulder', 0.6, 0.02); this._to(1, a1.still.key, a1.still.post, a1.still); });
    }
  }
  // Tripod launcher: the second man gets up, lifts the empty tube off and lays it behind, then brings the spare and seats it, and lies down again.
  _reloadTube(reloading, I) {
    const L = this.L, F = this.figures, a1 = F[1].userData.a, r = this._reload, near = TeamView.BESIDE;
    if (!r && reloading && I.reload > 6) {
      const R = this._reload = { step: 1 };
      this._to(1, 'knee', 'low', near);
      this._at(1.3, () => { this._send(L.tube, 'carry', 0.9, 0.08); this._then(L.tube, 'spent', 1.0, 0.1); });
      this._at(3.3, () => { this.tube.visible = false; this.spent.visible = true; this._send(L.tube, 'seat', 0.01, 0); R.step = 2; });
    } else if (r && r.step === 2 && (I.reload < 7.2 || !reloading)) {
      r.step = 3;
      if (!I.spare && !this.spare.visible) { this.tube.visible = true; this._reload = null; this._to(1, a1.still.key, a1.still.post, a1.still); return; }   /* (no spare was shown: nothing to carry) */
      this.spare.visible = true; this._send(L.spare, 'carry', 0.9, 0.1); this._then(L.spare, 'seat', 1.2, 0.1);
      this._at(2.2, () => { this.tube.visible = true; this._send(L.spare, 'lie', 0.01, 0); this.spare.visible = false; r.step = 4; });
      this._at(2.5, () => { this._to(1, a1.still.key, a1.still.post, a1.still); this._reload = null; });
    }
  }

  // finish what is going on at once (for pictures and tests)
  settle() {
    if (!this.anim) return; this._snap();
    for (let k = 0; k < 300; k++) { this._scenes(1 / 30); this._tick(1 / 30); if (k % 10 === 9 || k > 280) this._poseAll(1 / 3, 0); }
    this._poseAll(1 / 30, 0);
  }
  // where the team is and which way it should face (compass degrees); the turn itself is made in update, at a man's pace
  place(pos, faceDeg) {
    this.group.position.copy(pos); this._face = faceDeg;
    if (!this.anim) { this._psi = Math.PI - faceDeg * DEG; this.group.rotation.y = this._psi; }
  }
}
TeamView.INFO = { loaded: true, spare: true, firing: false, reload: 0, pack: 0, setup: 0, dead: false };
TeamView.CLIPS = { walk: null, run: null };   /* recorded movements, if any are supplied: see readClip in figure.js */
TeamView.LAUNCHER_YAW = -Math.PI / 2;
TeamView.FILE = [{ x: 0, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: 0, behind: 2.3, side: 0.45 }];   /* places in the marching file: the gunner leads, the second man follows 2.3 m behind and a little to one side */
TeamView.BESIDE = { x: 0.98, z: -0.2, yaw: -1.35 };                         /* where the second man kneels to handle the tube: beside the launcher, facing it */
TeamView.HANDOVER = { x: -0.62, z: 0.72, yaw: 1.25 };                       /* where the RPG second man squats to load: at the gunner's left, facing the muzzle */
// RPG-7 as supplied, after laying it along z: bore centre [x, y], muzzle z, where the shoulder sits (rest), the loose rocket's two ends,
// how far the rocket sits inside the muzzle, the grips (in the weapon's own frame: origin on the bore at the shoulder), and the scale to 0.95 m.
TeamView.RPG = { bore: [0.163, 0.038], muzzle: 0.344, rest: -0.25, tail: [-0.188, -0.112, -0.134], nose: [0.163, -0.089, 0.654], seated: 0.45, grip: [0.0, -0.12, 0.38], grip2: [0.0, -0.1, 0.25], scale: 0.94 };
TeamView.POLE_R = new THREE.Vector3(-0.7, -1, -0.1); TeamView.POLE_L = new THREE.Vector3(0.7, -1, -0.1);   /* which way the elbows point: down and out */
