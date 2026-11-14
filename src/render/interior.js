// The inside of the vehicle: turret and hull interior with the four crew seats, shown from the seat cameras and in the cutaway view.
// The interior is a model inside the battlefield scene, hung on the vehicle's own hull and turret, so it turns with the turret and
// the real world is seen through its hatches and vision blocks. Every frame it is driven from the battle: the breech recoils when the
// main gun fires, the ammunition door opens for a reload, the displays show what the sights see, the HKOI panel shows what the
// 30 mm station is doing. Nothing the viewer clicks can change the battle: the crew runs the vehicle.
//
// Cost: nothing while no inside view is active (the interior is taken out of the scene). No crew figures are shown (parked by the owner).
import * as THREE from 'three';
import { SHARED, NLAMP, NIND, cabMaterial, screenMaterial, lampMaterial, glassMaterial, Labels, Kit } from './interior_parts.js';
import { buildInterior, SEATS, DIM, IND, COL } from './interior_build.js';
import { CONDITIONS } from './scene3d.js';
import { SeatUI } from '../app/seats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { InteriorFx, hitList, fxState } from './interior_fx.js';
import { CrewFigures } from './interior_crewfig.js';
import { drawMfd, MFD } from './interior_mfd.js';

const DEG = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sm = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }, ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const LOAD_S = 6;                       // seconds for a reload with the loader at his station (the same number as in the battle's crew model)
const DOME = [null, [2.3, 2.1, 1.75], [2.0, 0.16, 0.1], [0.25, 1.5, 1.25]];   // dome lamp settings: off, white, red, blue-green
const DOME_NAME = ['off', 'white', 'red', 'blue-green'], HATCH_NAME = ['closed', 'open-protected', 'open'];
// how often each small view of the outside is redrawn, seconds (at most one of them in any frame)
const SIGHT_EVERY = { gps: 0.05, citv: 0.08, lp: 0.07, gas: 0.25 };
const BRT = [0.3, 0.6, 1.0, 1.45], CREW_NAMES = ['Gunner', 'Commander', 'Loader', 'Driver'], DOME_IDS = ['domeR', 'domeL', 'domeD'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _ray = new THREE.Raycaster(), _on = new THREE.Vector3();

export class Interior {
  constructor(scene3d, tank, cams, opts = {}) {
    this.s = scene3d; this.tank = tank; this.cams = cams; if (cams) cams.interior = this;
    this.inside = false;         // true while a seat view is active (the sound module muffles the outside)
    this.active = false; this.built = false; this.mode = null;
    this.warning = false;        // a missile or drone is inbound: warning lights are flashing
    this.warnTone = false;       // the same, while the HKOI tone switch is on (a flag for the sound module; nothing plays it yet)
    this.intercomVol = 0.75;     // what the intercom volume knobs are set to, 0 to 1 (a value for the sound module)
    this.look = { yaw: 0, pitch: 0, zoom: 1 }; this.head = { z: 0, vz: 0, x: 0, vx: 0, up: 0 };
    this.cupHatch = 0; this.cupUser = false;   // commander's hatch: 0 closed, 1 open-protected, 2 open. It follows the crew (closed when they are closed down, open-protected otherwise) until the viewer moves its handle
    this.domeMode = 1; this.domeUser = false; this.hkPage = 0; this.toneOn = true; this.lampTestT = 0; this.hkFireT = 0; this.clock = 0; this.optic = null; this.opT = 1; this.opCur = null; this.opFrom = null; this.lpYaw = 0;
    this.st = { door: 0, block: 0, hatch: 0, rec: 9, slew: 0, steer: 0, arm: 1, cup1: 0, cup2: 0, thr: 0, gear: 0, ldrU: 0, mgYaw: 0 }; this.last = { main: null, yaw: null, hdg: null, v: 0, recoil: 0, t: null };
    this.stats = { triangles: 0, meshes: 0, sightCalls: 0, controls: 0 };
    this.brt = { gps: 1, citv: 1, comp: 1, hkoi: 1, drv: 1, lp: 1, gas: 1 };   /* what the brightness knobs of the displays are set to */
    this.due = {}; this.plane = new THREE.Plane(); this.ext = null; this.citvYaw = null; this.sightT = 0; this.sightN = 0; this.keys = {};
    // Settings (the page can set these; they can also be turned off in the address: crew=0, graphic=0).
    const Q = typeof location !== 'undefined' ? new URLSearchParams((location.hash || '').slice(1)) : null;
    this.crewOn = !Q || Q.get('crew') !== '0';        // crew figures in the seats
    this.graphic = true;         // blood and hit effects are always on (the owner's decision)
    this.hitPulse = null;        // for the sound module: the latest hit, Trophy shot or near miss { t (battle time), strength, penetrated }
    this.alarm = false;          // for the sound module: the fire and penetration alarm is sounding
    this.smoke = 0;              // 0 to 1: how thick the smoke inside is (for coughing, muffling)
    this.fxS = null; this.simT = 0;
    this.ui = typeof document !== 'undefined' && scene3d && scene3d.canvas ? new SeatUI(scene3d.canvas, this) : null;
    if (scene3d && scene3d.renderer) scene3d.renderer.localClippingEnabled = true;   /* the cutaway view slices the outside model with a plane */
  }
  owns(mode) { return !!SEATS[mode]; }
  // every hit, Trophy shot and near miss of a battle so far (see interior_fx.js): for the sound module, the debrief and the tests
  hitsOf(battle) { return hitList(battle); }

  // ---------------------------------------------------------------- build (once, the first time an inside view is opened)
  _build() {
    const labels = this.labels = new Labels(2048), B = buildInterior(labels), M = this.mat = { shell: cabMaterial({ shell: true, side: THREE.DoubleSide }), fit: cabMaterial(), label: cabMaterial({ labels: labels.tex }), lamp: lampMaterial(), glass: glassMaterial() };
    this.tur = new THREE.Group(); this.hul = new THREE.Group(); this.tur.name = 'cab-turret'; this.hul.name = 'cab-hull'; this.tur.rotation.y = this.hul.rotation.y = Math.PI; this.tur.userData.cab = this.hul.userData.cab = true;
    const G = { tur: this.tur, hul: this.hul }; let meshes = 0, tris = B.T.tris + B.H.tris;
    for (const [kit, grp] of [[B.T, this.tur], [B.H, this.hul]]) for (const b of ['shell', 'fit', 'label', 'lamp']) { const m = kit.mesh(b, M[b]); if (m) { grp.add(m); meshes++; } }
    // parts that move on their own
    const P = this.part = {};
    // audit: every solid piece with the assembly it belongs to, for the overlap check (tests/interior/overlap.test.mjs)
    this.audit = []; for (const r of B.T.rec) this.audit.push({ g: 'tur', node: null, ...r }); for (const r of B.H.rec) this.audit.push({ g: 'hul', node: null, ...r });
    for (const [key, d] of Object.entries(B.moving)) { if (!d.build) continue; const k = new Kit(labels); k.tag = 'part:' + key; d.build(k); const g = new THREE.Group(); for (const r of k.rec) this.audit.push({ g: d.g, node: g, ...r }); for (const [b, mat] of [['p', M.fit], ['label', M.label]]) { const m = k.mesh(b, mat); if (m) { g.add(m); meshes++; } } tris += k.tris;
      if (d.pos) g.position.fromArray(d.pos); if (d.quat) g.quaternion.copy(d.quat); if (d.rx) g.rotation.x = d.rx; if (d.out) g.userData.out = true; if (d.hole) g.userData.hole = true; g.userData.home = g.position.clone(); g.userData.q0 = g.quaternion.clone(); P[key] = g; }
    for (const [key, d] of Object.entries(B.moving)) if (P[key]) (d.parent ? P[d.parent] : G[d.g]).add(P[key]);
    P.round.visible = false;
    // dirty glass in the vision blocks (the world is seen through it)
    { const k = new Kit(labels), g = B.moving.glass; for (let i = 0; i < 8; i++) { const a = i * 45 * DEG; k.plane('g', 0.21, g.h, [0xffffff, 0], g.c[0] + Math.sin(a) * g.R, g.y, g.c[1] - Math.cos(a) * g.R, 0, -a + Math.PI, 0); } const m = k.mesh('g', M.glass); m.renderOrder = 50; this.tur.add(m); meshes++; tris += 16;
      const k2 = new Kit(labels), d = B.moving.dglass; for (const x of d.xs) k2.plane('g', d.w, d.h, [0xffffff, 0], x, d.y, d.z); const m2 = k2.mesh('g', M.glass); m2.renderOrder = 50; this.hul.add(m2); meshes++; tris += 6; }
    // rounds in the two bustle racks: one drawn base per round still there
    { const k = new Kit(labels); k.cyl('r', 0.06, 0.06, 0.02, COL.brass, 0, 0, 0, Math.PI / 2, 0, 0, 12); k.cyl('r', 0.016, 0.016, 0.004, COL.steel, 0, 0, -0.011, Math.PI / 2, 0, 0, 8); const g = k.mesh('r', M.fit).geometry; tris += k.tris * 36;
      const im = this.rounds = new THREE.InstancedMesh(g, M.fit, 36); im.frustumCulled = false; this.rackSlot = B.moving.rack.slot; for (let i = 0; i < 36; i++) { const p = this.rackSlot(i < 18 ? -1 : 1, i % 18); _m.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, _m); } im.instanceMatrix.needsUpdate = true; this.tur.add(im); meshes++; }
    // displays
    this.cv = {}; this.scr = {};
    const mkScreen = (key, w, h, opaque) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.cv[key] = { c, x: c.getContext('2d'), t, key: '', opaque }; const m = screenMaterial(t); m.uniforms.uPx.value.set(1 / w, 1 / h); m.uniforms.uLines.value = h / 2; return m; };
    const mfd = k => mkScreen(k, MFD[k].w, MFD[k].h, !!MFD[k].opaque);
    const SM = { gps: mfd('gps'), citv: mfd('citv'), comp: mfd('comp'), hkoi: mfd('hkoi'), drv: mfd('drv'), ldr: mfd('ldr'), lp: mkScreen('lp', 256, 80), gas: mkScreen('gas', 128, 128) };
    this.screenDefs = B.screens; for (const d of B.screens) { const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), SM[d.key]); m.position.copy(d.pos); m.quaternion.copy(d.quat); m.frustumCulled = false; G[d.g].add(m); this.scr[d.key] = SM[d.key]; meshes++; tris += 2; }
    this.scr.gps.uniforms.uMode.value = 1; this.scr.citv.uniforms.uMode.value = 1; for (const k of ['comp', 'hkoi', 'drv', 'lp', 'gas']) this.scr[k].uniforms.uMode.value = 0;   /* the periscope and the telescope are plain glass: a colour picture */
    // controls the viewer can click: one drawn set per kind and group
    this.controls = B.controls; this.ctlMesh = {};
    const shapes = { toggle: k => { k.cyl('c', 0.009, 0.009, 0.006, COL.steel, 0, 0, 0.003, Math.PI / 2, 0, 0, 8); k.cyl('c', 0.0032, 0.0048, 0.026, COL.steel, 0, 0, 0.018, Math.PI / 2, 0, 0, 6); k.ball('c', 0.0058, COL.steel, 0, 0, 0.031); },
      knob: k => { k.cyl('c', 0.013, 0.015, 0.016, COL.black, 0, 0, 0.008, Math.PI / 2, 0, 0, 12); k.box('c', 0.003, 0.014, 0.004, COL.white, 0, 0.007, 0.017); k.cyl('c', 0.017, 0.017, 0.003, COL.gunm, 0, 0, 0.0015, Math.PI / 2, 0, 0, 12); },
      button: k => { k.box('c', 0.03, 0.018, 0.008, COL.gunm, 0, 0, 0.004); k.box('c', 0.024, 0.012, 0.003, COL.creamD, 0, 0, 0.009); } };
    for (const g of ['tur', 'hul']) for (const type of Object.keys(shapes)) { const list = this.controls.filter(c => c.g === g && c.type === type); if (!list.length) continue; const k = new Kit(labels); shapes[type](k); const geo = k.mesh('c', M.fit).geometry; tris += k.tris * list.length;
      const im = new THREE.InstancedMesh(geo, M.fit, list.length); im.frustumCulled = false; list.forEach((c, i) => { c.mesh = im; c.i = i; c.anim = 0; this._poseControl(c); }); im.instanceMatrix.needsUpdate = true; G[g].add(im); meshes++; this.ctlMesh[g + type] = im; }
    // lamps (the lighting of the interior): where each one hangs
    const D = DIM; this.lamps = [
      { g: 'tur', p: new THREE.Vector3(0.05, D.RF - 0.1, 0.82), r: 1.7 }, { g: 'tur', p: new THREE.Vector3(-0.98, D.RF - 0.1, -0.45), r: 1.7 }, { g: 'hul', p: new THREE.Vector3(-0.2, D.DRF - 0.1, D.DZ + 0.7), r: 1.3 },
      { g: 'tur', p: new THREE.Vector3(0.93, 0.2, 0.16), r: 0.55 },                            /* glow of the HKOI display */
      { g: 'tur', p: new THREE.Vector3(D.HAT[0], D.RF - 0.02, D.HAT[1]), r: 1.5 },             /* daylight through the loader's hatch when it is open */
      { g: 'tur', p: new THREE.Vector3(D.CUP[0], D.RF + 0.12, D.CUP[1]), r: 0.6 },             /* daylight through the cupola's vision blocks */
      { g: 'hul', p: new THREE.Vector3(0, D.DRF - 0.1, D.DZ - 0.08), r: 0.6 },                 /* daylight through the driver's vision blocks */
      { g: 'tur', p: new THREE.Vector3(0.64, 0.2, -0.62), r: 0.5 } ];                          /* glow of the gunner's display */
    this.sightCam = new THREE.PerspectiveCamera(21, 1.6, 2, 30000); this.rt = {};
    // what a hit does (sparks, blood) and the crew figures
    const D2 = DIM, PI = Math.PI; this.fx = new InteriorFx(o => cabMaterial({ ...o, glow: false }), G, {
      gnr: { g: 'tur', planes: [[0.6, -0.36, -0.336, 0.12, PI, 0, 0.3, 0.34], [1.196, 0.12, -0.36, 0, -PI / 2, 0, 0.46, 0.36], [0.6, -0.588, -0.5, -PI / 2, 0, 0, 0.3, 0.28]] },
      cdr: { g: 'tur', planes: [[0.58, -0.1, 0.632, -0.1, PI, 0, 0.32, 0.36], [0.62, 0.2, D2.BZ - 0.058, 0, PI, 0, 0.5, 0.38], [0.58, -0.328, 0.46, -PI / 2, 0, 0, 0.32, 0.28]] },
      ldr: { g: 'tur', planes: [[-0.66, -0.393, 0.42, -PI / 2, 0, 0, 0.3, 0.28], [-1.196, -0.1, 0.3, 0, PI / 2, 0, 0.5, 0.22], [-0.62, D2.FL + 0.003, 0.14, -PI / 2, 0, 0, 0.5, 0.5]] },
      drv: { g: 'hul', planes: [[0.496, D2.HF + 0.36, D2.DZ + 0.08, 0, -PI / 2, 0, 0.5, 0.4], [-0.496, D2.HF + 0.36, D2.DZ + 0.2, 0, PI / 2, 0, 0.42, 0.36], [0, D2.HF + 0.002, D2.DZ + 0.02, -PI / 2, 0, 0, 0.6, 0.5]] },
    }, g => mergeGeometries(g, false)); meshes += 5;
    this.crewFig = null;   /* made when the asset folder is known: the crew models of the original simulator */
    this.stats.triangles = Math.round(tris); this.stats.meshes = meshes; this.stats.controls = this.controls.length; this.built = true;
  }

  // ---------------------------------------------------------------- controls
  // where the drawn lever, knob or button of a control sits for its present state
  _poseControl(c) {
    if (!c.mesh) return;   /* a caption spot (a port, a hatch handle) has no lever of its own */
    let s = c.state; if (c.anim > 0) s = c.type === 'knob' ? c.state + Math.sin(c.anim * Math.PI) * 0.8 : c.anim > 0.5 ? 1 - c.state : c.state; if (c.press > 0) s = 1;
    _q.copy(c.quat); _v.copy(c.pos);
    if (c.type === 'toggle') _q.multiply(_q2.setFromAxisAngle(_v2.set(1, 0, 0), s ? -0.5 : 0.5));
    else if (c.type === 'knob') _q.multiply(_q2.setFromAxisAngle(_v2.set(0, 0, 1), -(s - (c.n - 1) / 2) * (c.n > 3 ? 0.62 : 0.8)));
    else if (s) _v.addScaledVector(_v2.set(0, 0, -0.004).applyQuaternion(c.quat), 1);
    _m.compose(_v, _q, _one); c.mesh.setMatrixAt(c.i, _m); c.mesh.instanceMatrix.needsUpdate = true;
  }
  // which control is under the pointer (x, y from -1 to 1 across the picture), or null
  pick(nx, ny) {
    if (!this.active || !this.inside) return null; const seat = SEATS[this.mode]; _ray.setFromCamera(_v.set(nx, ny, 0), this.s.camera); const o = _ray.ray.origin, d = _ray.ray.direction; let best = null, bd = 1e9;
    for (const c of this.controls) { const g = c.g === 'tur' ? this.tur : this.hul; _v.copy(c.pos).applyMatrix4(g.matrixWorld).sub(o); const t = _v.dot(d); if (t < 0.08 || t > 2.4) continue; const off = Math.sqrt(Math.max(0, _v.lengthSq() - t * t)), lim = c.r * (1 + t * 0.15); if (off > lim) continue;
      _v2.set(0, 0, 1).applyQuaternion(c.quat).transformDirection(g.matrixWorld); if (_v2.dot(d) > 0.1) continue;   /* a panel seen from behind */ const score = off / lim + t * 0.2; if (score < bd) { bd = score; best = c; } }
    return seat ? best : null;
  }
  _crewSet(key, state) { for (const c of this.controls) if (c.key === key && c.state !== state) { c.state = state; this._poseControl(c); } }
  describe(c) { return c.name + (c.locked || (c.type === 'spot' && !c.key) ? '' : ' · ' + this._stateName(c)); }
  _stateName(c) { if (c.key === 'dome') return DOME_NAME[c.state]; if (c.key === 'cdrHatch') return HATCH_NAME[c.state]; if (c.type === 'button') return 'push'; if (c.type === 'knob') return `${c.state + 1} of ${c.n}`; return c.state ? 'on' : 'off'; }
  // the viewer clicks a control. Returns the line to show.
  // ---- putting the eye to a periscope, a vision block or the auxiliary sight
  // lookThrough(control) moves the viewer's eye up to that optic over 0.4 s (the same path at any frame rate); lookThrough(null) sits him back.
  lookThrough(c) {
    c = c || null; if (c === this.optic) return; if (c && (!c.optic || !SEATS[this.mode] || c.g !== SEATS[this.mode].g)) return;
    this.opFrom = this.opCur ? { ...this.opCur } : null; this.opT = this.opFrom ? 0 : 1;
    if (c && !this.optic) this.lookSeat = { ...this.look }; this.optic = c;
    if (c) { this.look.yaw = 0; this.look.pitch = 0; this.look.zoom = 1; this.lpYaw = 0; this.eyeOff = null; } else if (this.lookSeat) { Object.assign(this.look, this.lookSeat); this.lookSeat = null; }
  }
  // for pictures and tests: the eye straight in front of one display, which then fills most of the view
  faceScreen(key) { const d = (this.screenDefs || []).find(q => q.key === key); if (d) this.lookThrough({ g: d.g, pos: d.pos, quat: d.quat, name: key, optic: { kind: 'screen', dist: d.w * 0.95, fov: 40 } }); return !!d; }
  // the commander steps round his ring of ports: dir +1 = the next port to the right
  stepOptic(dir) { const O = this.optic; if (!O || O.optic.ring == null) return false; const c = this.controls.find(q => q.optic && q.optic.ring === (O.optic.ring + dir + 8) % 8); if (c) this.lookThrough(c); return !!c; }
  // the optic this seat would use first (the V key): the port the commander is facing, the loader's periscope, the gunner's auxiliary sight, the driver's centre block
  primaryOptic() {
    const S = SEATS[this.mode]; if (!S) return null; const L = this.controls.filter(q => q.optic && q.g === S.g); if (!L.length) return null;
    if (this.mode === 'in_cdr') { const want = Math.round((((S.yaw0 + this.look.yaw) % 360 + 360) % 360) / 45) % 8; return L.find(q => q.optic.ring === want) || null; }
    if (this.mode === 'in_ldr') return L.find(q => q.optic.kind === 'lp') || null; if (this.mode === 'in_gnr') return L.find(q => q.optic.kind === 'gas') || null;
    return L.find(q => q.optic.kind === 'block' && !q.optic.yaw) || L[0];
  }
  operate(c) {
    if (c.optic) { if (!SEATS[this.mode] || c.g !== SEATS[this.mode].g) return c.name; this.lookThrough(c); return c.name + ' · click or press Esc to sit back' + (c.optic.ring != null ? '; A and D step round the ring.' : '.'); }
    if (c.type === 'spot' && !c.key) return c.name + (c.locked ? ' · the crew works this.' : '');
    if (c.locked) { c.anim = 1; return c.name + ' · the crew works this one: it springs back.'; }
    if (c.type === 'button') { c.press = 0.35; if (c.key === 'lampTest') this.lampTestT = 1.3; if (c.key === 'hkPage') this.hkPage = (this.hkPage + 1) % 3; this._poseControl(c); return c.name; }
    c.state = (c.state + 1) % c.n; if (c.key) for (const o of this.controls) if (o.key === c.key && o !== c) { o.state = c.state; this._poseControl(o); } this._poseControl(c); this._apply(c);
    return c.name + ' · now ' + this._stateName(c);
  }
  _apply(c) {
    const k = c.key, U = n => this.scr[n].uniforms; if (!k) return;
    if (k === 'cdrHatch') { this.cupHatch = c.state; this.cupUser = true; return; }   /* from now on the viewer's choice stands */
    if (k === 'dome') { this.domeMode = c.state; this.domeUser = true; } else if (k === 'gpsPol') U('gps').uMode.value = c.state ? -1 : 1; else if (k === 'citvPol') U('citv').uMode.value = c.state ? -1 : 1;
    else if (k === 'gpsBrt') this.brt.gps = BRT[c.state]; else if (k === 'citvBrt') this.brt.citv = BRT[c.state]; else if (k === 'compBrt') this.brt.comp = BRT[c.state]; else if (k === 'hkBrt') this.brt.hkoi = BRT[c.state]; else if (k === 'drvBrt') this.brt.drv = BRT[c.state];
    else if (k === 'hkTone') this.toneOn = !!c.state; else if (k === 'icomVol') this.intercomVol = c.state / (c.n - 1); else if (k === 'backlight') SHARED.uBack.value = [0, 0.35, 0.7, 1.1][c.state];
  }
  turnHead(dx, dy) { const S = SEATS[this.mode]; if (!S) return;
    if (this.optic) { const O = this.optic.optic; if (O.kind === 'lp') { this.lpYaw = clamp(this.lpYaw - dx * 0.1, -60, 60); return; } if (O.kind === 'gas') return;
      this.look.yaw -= dx * 0.1; this.look.pitch = clamp(this.look.pitch + dy * 0.1, -12, 12);
      if (O.ring != null && Math.abs(this.look.yaw) > 24) this.stepOptic(this.look.yaw > 0 ? 1 : -1); else this.look.yaw = clamp(this.look.yaw, -28, 28); return; }
    this.eyeOff = null; const k = 0.16 / this.look.zoom; this.look.yaw = S.yawLim >= 180 ? ((this.look.yaw - dx * k + 540) % 360) - 180 : clamp(this.look.yaw - dx * k, -S.yawLim - S.yaw0, S.yawLim - S.yaw0);   /* the commander can turn right round in his cupola */ this.look.pitch = clamp(this.look.pitch + dy * k, S.pitch[0] - S.pitch0, S.pitch[1] - S.pitch0); }
  // for tests and pictures: point the head (degrees from the seat's own forward) and set the zoom; survives a change of seat made in the same breath
  setLook(yaw, pitch, zoom = 1, off = null) { this.look.yaw = yaw; this.look.pitch = pitch; this.look.zoom = zoom; this.pendingLook = { yaw, pitch, zoom }; this.eyeOff = off; this.pendingOff = off; }   /* off: [x, y, z] metres from the seat's eye, for a picture taken from beside the crewman's place; yaw and pitch are then unlimited */
  zoomBy(d) { this.look.zoom = clamp(this.look.zoom * Math.exp(-d * 0.0012), 1, 3.4); }

  // ---------------------------------------------------------------- entering and leaving
  _enter(mode) {
    const tk = this.tank, tur = tk.turret || tk.group, body = tk.body || tk.group; if (this.tur.parent !== tur) tur.add(this.tur); if (this.hul.parent !== body) body.add(this.hul);
    if (tk.turret) this.hul.position.copy(tk.turret.position); else { this.hul.position.set(0, 1.617, -0.025); this.tur.position.copy(this.hul.position); }
    const cut = mode === 'cut', isSeat = !!SEATS[mode]; if (!isSeat) this._near(); SHARED.uInside.value = SHARED.uInsideF.value = isSeat ? 1 : 0;
    for (const g of [this.tur, this.hul]) for (const c of g.children) if (!c.userData.hole) c.visible = true; this._dbl(isSeat); SHARED.uClipOn.value = cut ? 1 : 0; if (cut) this._cutOn(); else this._cutOff();
    this.eyeOff = this.pendingOff || null; this.pendingOff = null;
    if (this.pendingLook) { Object.assign(this.look, this.pendingLook); this.pendingLook = null; } else { this.look.yaw = 0; this.look.pitch = 0; this.look.zoom = 1; } this.head.z = this.head.vz = this.head.x = this.head.vx = 0; this.head.up = 0; this.mode = mode; this.active = true;
    this._marks(!isSeat);   /* the floating map markers of the outside views would hang in front of the walls */
    if (this.ui && isSeat) this.ui.show(`${SEATS[mode].name}'s seat · drag to look around, wheel to lean in, click a switch. The crew runs the vehicle; your clicks only change harmless things.`, 6500);
  }
  _near() { const cam = this.s.camera; if (this.near0 != null && cam.near !== this.near0) { cam.near = this.near0; cam.updateProjectionMatrix(); } }   /* give the camera its usual near distance back */
  _marks(show) { const m = typeof document !== 'undefined' && document.getElementById('marks'); if (m) m.style.visibility = show ? '' : 'hidden'; }
  // from a seat, the roof machine guns of the outside model are drawn from both sides (they are open shells: from below one saw sky through them)
  _dbl(on) { if (on && !this.dbl) { const list = [], seen = new Set(), root = this.tank.turret; if (!root) return; root.traverse(o => { if (!o.isMesh || !o.material) return; for (const m of [].concat(o.material)) if (m && /^M2|M240/.test(m.name || '') && !seen.has(m)) { seen.add(m); list.push([m, m.side]); m.side = THREE.DoubleSide; m.needsUpdate = true; } }); this.dbl = list; } else if (!on && this.dbl) { for (const [m, sd] of this.dbl) { m.side = sd; m.needsUpdate = true; } this.dbl = null; } }
  _leave() { this._marks(true); this._near(); this._dbl(false); this._box(null); this._mgRest(); if (this.tur.parent) this.tur.parent.remove(this.tur); if (this.hul.parent) this.hul.parent.remove(this.hul); this._cutOff(); this.active = false; this.mode = null; this.inside = false; this.warning = this.warnTone = false; if (this.ui) this.ui.hide(); }
  // the cutaway: the outside model is sliced by a plane that always faces the viewer, and shown from both sides so the far half reads as a shell
  _cutOn() { if (this.ext) return; const seen = new Set(), list = []; const root = this.tank.model || this.tank.group; root.traverse(o => { let p = o; while (p) { if (p.userData && p.userData.cab) return; p = p.parent; } if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m && !seen.has(m)) { seen.add(m); list.push({ m, side: m.side, cp: m.clippingPlanes }); m.side = THREE.DoubleSide; m.clippingPlanes = [this.plane]; m.needsUpdate = true; } }); this.ext = list; }
  _cutOff() { if (!this.ext) return; for (const x of this.ext) { x.m.side = x.side; x.m.clippingPlanes = x.cp || null; x.m.needsUpdate = true; } this.ext = null; }

  // ---------------------------------------------------------------- every frame
  // s: { on, battle, shown: {e, n, h}, volleys, cond, playing, speed }
  update(dt, s) {
    const cm = this.cams ? this.cams.mode : null, seat = SEATS[cm], cut = cm === 'cut';
    // From outside, the interior is normally not there at all. The exception: a man with his head out. While the loader is up at his machine gun
    // (or the viewer has opened the commander's hatch) the hatch lids and those men are shown in every outside view, and nothing else of the interior.
    const lu0 = !!(s && s.on && s.battle && s.battle.tank.ai && s.battle.tank.ai.ldr && s.battle.tank.ai.ldr.up && s.battle.tank.alive);
    const outside = !!(s && s.on && !seat && !cut && cm !== 'gnr' && cm !== 'citv' && cm !== 'hkoi' && cm !== 'drv' && this.tank.turret && (lu0 || (this.built && (this.st.ldrU > 0.004 || (this.cupUser && (this.cupHatch > 0 || this.st.cup1 + this.st.cup2 > 0.01))))));
    const mode = outside ? 'outside' : cm, on = !!(s && s.on && (seat || cut || outside));
    if (!on) { if (this.active) this._leave(); return; }
    if (!this.built) this._build();
    if (!this.active || this.mode !== mode || (this.tank.turret && this.tur.parent !== this.tank.turret)) this._enter(mode);   /* also when the vehicle's model has only just arrived */
    this.pendingLook = null; this.pendingOff = null; this.inside = !!seat; this.clock += dt; SHARED.uTime.value = this.clock;
    const cs0 = this.crewS, B = s.battle, T = B.tank, st = T.st || {}, info = (s.volleys && s.volleys.info) || [], A = T.ai || {}, P = this.part, L = this.last, sdt = s.playing ? dt * (s.speed || 1) : 0, D = DIM;
    const cond = CONDITIONS[s.cond] || CONDITIONS.day, night = !!cond.night;
    if (!this.domeUser) { const want = night ? 2 : 1; if (want !== this.domeMode) { this.domeMode = want; for (const c of this.controls) if (c.key === 'dome') { c.state = want; this._poseControl(c); } } }

    // ---- what the battle is doing
    if (L.t != null && B.t < L.t - 0.5) { L.main = null; this.st.rec = 9; }                    /* the battle was rewound or restarted */
    const fired = L.main != null && T.main < L.main; L.main = T.main; L.t = B.t; if (fired) { this.st.rec = 0; this.head.vz += 0.5; }
    if (L.alive === true && !T.alive) { this.head.vz -= 0.9; this.head.vx += 0.6; } L.alive = T.alive;   /* the hit that knocks the vehicle out throws the crew about */
    this.st.rec += sdt; const r = this.st.rec, recoil = r < 0.07 ? r / 0.07 : r < 0.75 ? 1 - (r - 0.07) / 0.68 : 0;   /* back fast, forward slowly */
    P.breech.position.z = P.breech.userData.home.z + 0.3 * recoil * recoil * (3 - 2 * recoil);
    const ldrUp = !!(A.ldr && A.ldr.up), loading = !T.loaded && T.main > 0 && !ldrUp && T.alive, f = loading ? clamp((T.loadT || 0) / LOAD_S, 0, 1) : 0;
    this.st.door = ease(this.st.door, loading && f > 0.02 && f < 0.6 ? 1 : 0, 5, sdt || dt * 0.5); P.door.position.x = P.door.userData.home.x + this.st.door * 0.96; P.knee.position.z = P.knee.userData.home.z + (loading && f < 0.6 ? 0.012 : 0);
    this.st.block = ease(this.st.block, !T.loaded && r > 0.5 ? 1 : 0, 8, sdt || dt * 0.5); P.block.position.y = -0.2 * this.st.block;
    { const R = P.round, slot = Math.max(0, Math.min(17, T.main - 1)), p = this.rackSlot(-1, slot);                                          /* the round: out of its tube, then on the loading tray, then rammed */
      // the round's path through the drill: out of its tube, carried across to the tray behind the breech, rammed home
      const out0 = 0.45, rack = _v2.set(p[0], p[1], p[2] - 0.3), tray = _v.set(0, D.GY, 0.25); let rp = null;
      if (loading && f > 0.1 && f < 0.34) rp = R.position.set(p[0], p[1], p[2] + out0 - (out0 + 0.3) * clamp((f - 0.1) / 0.22, 0, 1));
      else if (loading && f >= 0.34 && f < 0.56) { const u = (f - 0.34) / 0.22, e = u * u * (3 - 2 * u); rp = R.position.copy(rack).lerp(tray, e); rp.y += Math.sin(e * Math.PI) * 0.06; }
      else if (loading && f >= 0.56 && f < 0.82) rp = R.position.set(0, D.GY, 0.25 - 1.05 * clamp((f - 0.58) / 0.22, 0, 1));
      R.visible = !!rp && mode !== 'outside' && (this.crewOn || f < 0.34 || f >= 0.56);   /* without a loader figure the carry across is not shown: nothing floats */ this.roundAt = rp ? rp : null; this.loadF = loading ? f : -1;
      const nReady = clamp(T.main - (T.loaded ? 0 : 0), 0, 18) - (loading && f > 0.1 ? 1 : 0), nSemi = clamp(T.ap == null ? 18 : T.ap, 0, 18);
      if (nReady !== this._nR || nSemi !== this._nS) { this._nR = nReady; this._nS = nSemi; const z = _m.makeScale(0, 0, 0); for (let i = 0; i < 36; i++) { const here = i < 18 ? i < nReady : i - 18 < nSemi; if (here) { const q = this.rackSlot(i < 18 ? -1 : 1, i % 18); this.rounds.setMatrixAt(i, _m.makeTranslation(q[0], q[1], q[2])); } else this.rounds.setMatrixAt(i, z.makeScale(0, 0, 0)); } this.rounds.instanceMatrix.needsUpdate = true; } }
    this.st.arm = ease(this.st.arm, T.loaded ? 1 : 0, 6, dt); P.armLever.quaternion.copy(P.armLever.userData.q0).multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), 0.5 - this.st.arm));
    // the loader going up to his machine gun and coming down: one number U on the battle clock (0 at his station, 1 standing behind the gun).
    // The battle gives him 4 s to get up before he may fire and 2 s to get down before he may load: the act is fitted inside those.
    { const hurt = (this.fxS && this.fxS.blood.ldr === 'killed') || !!(cs0 && cs0.on && cs0.who.ldr.status !== 'ok' && cs0.who.ldr.status !== 'wounded'), lu = ldrUp && T.alive && !hurt;   /* a loader who is down is not standing in his hatch: he drops back inside */ if (lu !== L.lu) { L.lu = lu; L.luT = B.t; L.luU = this.st.ldrU; } if (B.t < L.luT) { L.luT = B.t; L.luU = lu ? 0 : this.st.ldrU; }
      // The battle keeps the spells he is up as [time up, time down] and allows 4 s to get up and 2 s to get down: U is read straight off
      // those times, so a replay or a rewind shows the same climb. (Without that list, the same act is timed from when the change was seen.)
      const spells = A.ldr && A.ldr.upAt; let u = lu ? clamp(L.luU + (B.t - L.luT) / 4, 0, 1) : clamp(L.luU - (B.t - L.luT) / 2, 0, 1);
      if (spells && !hurt) { u = 0; for (const sp of spells) { if (B.t < sp[0]) continue; const top = Math.min(1, (Math.min(B.t, sp[1]) - sp[0]) / 4), v = B.t < sp[1] ? top : top * clamp(1 - (B.t - sp[1]) / 2, 0, 1); if (v > u) u = v; } }
      else if (hurt) u = Math.max(0, this.st.ldrU - (sdt || 0) / 1.2);
      this.st.ldrU = u; }
    const U = this.st.ldrU; this.st.hatch = Math.max(sm((U - 0.12) / 0.28), cs0 && cs0.abandoned ? 1 : 0);   /* the lid goes up under his hands over about a second, not ahead of them */ P.hatch.rotation.x = this.st.hatch * 1.5;   /* unlatched and pushed up and back on its hinge until the spring arm holds it */
    this._mg(B, T, sdt || 0);
    // the handles follow the turret, the T-bar follows the steering
    const yaw = this.tank.turretYaw || 0, hdg = s.shown ? s.shown.h : T.h, v = T.v || 0;
    if (L.yaw != null && dt > 1e-4) { const rate = clamp((((yaw - L.yaw + 540) % 360) - 180) / dt / 40, -1, 1); this.st.slew = ease(this.st.slew, rate, 10, dt); const tr = clamp((((hdg - L.hdg + 540) % 360) - 180) / dt / 25, -1, 1); this.st.steer = ease(this.st.steer, s.playing ? tr : 0, 6, dt); }
    L.yaw = yaw; L.hdg = hdg; const acc = dt > 1e-4 && s.playing ? clamp((v - L.v) / Math.max(dt * (s.speed || 1), 1e-3), -4, 4) : 0; L.v = v;
    P.yoke.rotation.z = -this.st.slew * 0.42; P.override.rotation.z = -this.st.slew * 0.12; P.tbar.rotation.set(-0.25, 0, -this.st.steer * 0.6);   /* the T-bar turns like handlebars, seen from his eye as a roll */
    this.st.thr = ease(this.st.thr, s.playing && T.alive ? clamp(Math.abs(v) / 14 + Math.max(0, acc * Math.sign(v || 1)) * 0.25, 0, 1) : 0, 6, dt); P.throttle.rotation.set(0, 0, -(Math.PI / 2 + 0.16)); P.throttle.rotateY(-this.st.thr * 1.3);   /* twist grip: more power, more twist */
    this.st.gear = ease(this.st.gear, v > 0.3 ? 1 : v < -0.3 ? -1 : 0, 8, dt); P.gear.rotation.z = -this.st.gear * 0.6;
    this.st.cup1 = ease(this.st.cup1, this.cupHatch === 1 ? 1 : 0, 5, dt); this.st.cup2 = ease(this.st.cup2, this.cupHatch === 2 ? 1 : 0, 4, dt); this._cupPose();
    // ---- hits: everything from the battle's records and the battle clock
    this.simT = B.t; SHARED.uSimT.value = B.t; const FX = this.fxS = fxState(hitList(B), B.t); this.hitPulse = FX.pulse; this.alarm = FX.alarm; this.smoke = Math.max(FX.smoke, FX.dust);
    // head: leans against acceleration and jolts with the main gun
    { const H = this.head; let left = Math.min(dt, 0.1); while (left > 1e-5) { const h = Math.min(left, 1 / 120); H.vz += (-90 * H.z - 13 * H.vz + acc * 0.9) * h; H.z = clamp(H.z + H.vz * h, -0.06, 0.06); H.vx += (-90 * H.x - 13 * H.vx - this.st.steer * Math.abs(v) * 0.5) * h; H.x = clamp(H.x + H.vx * h, -0.04, 0.04); left -= h; } }

    // ---- the HKOI station, as its panel shows it
    const rc = this.tank.recoil || 0; if (rc > L.recoil + 1e-4) this.hkFireT = 0.8; L.recoil = rc; this.hkFireT = Math.max(0, this.hkFireT - dt);
    const active = !!(B._volleyActive && B._volleyActive()), inbound = info.length > 0;
    const nTrk = info.filter(m => m.tracked).length; this.hkTracks = nTrk;
    const hk = !T.alive ? 'OFF' : this.hkFireT > 0 ? 'FIRING' : s.volleys && s.volleys.aimAt ? 'LAYING' : nTrk ? 'TRACKING' : info.some(m => m.cued) ? 'CUED' : 'SEARCH';   /* the radar scans all the time: with nothing found it is searching */
    this.hkState = hk; this.warning = T.alive && active && inbound; this.warnTone = this.warning && this.toneOn;

    // the crew's own state (four times a second): shown on the HKOI panel's crew page; the commander's hatch follows whether the crew is closed down
    this.crewT = (this.crewT || 0) - dt; if (this.crewT <= 0) { this.crewT = 0.25; this.crewS = B.crewState ? B.crewState() : null; if (!this.cupUser && this.crewS && this.crewS.on) { const want = this.crewS.buttoned ? 0 : 1; if (want !== this.cupHatch) this.setCupolaHatch(want); } }
    // ---- indicator lights
    const I = SHARED.uInd.value, blink = (this.clock * 2.2) % 1 < 0.55 ? 1 : 0, set = (n, val) => { if (IND[n] != null) I[IND[n]] = val; }, rf = B._rf, wait = rf ? rf.at - B.t : 0;
    this.lampTestT = Math.max(0, this.lampTestT - dt);
    if (this.lampTestT > 0) I.fill(1); else {
      I.fill(0); const w = this.warning || this.alarm ? blink : 0; set('gnrWarn', w); set('cdrWarn', w); set('ldrWarn', w); set('drvWarn', w);
      set('ammo2', 1); set('gunReady', T.loaded && T.main > 0 && T.alive ? 1 : 0); set('laser', rf && wait > 0 && wait < 3 ? blink : 0.15);
      set('hkRadar', hk === 'OFF' ? 0 : 1); set('hkTrack', hk === 'TRACKING' || hk === 'LAYING' || hk === 'FIRING' ? 1 : 0); set('hkFire', hk === 'FIRING' ? 1 : 0); set('hkArmed', T.alive ? 1 : 0);
      set('ldrSafe', T.loaded ? 0 : 1); set('ldrArmed', T.loaded ? 1 : 0); set('turPwr', T.alive ? 1 : 0); set('smkL', 0.8); set('smkR', 0.8); set('apsL', st.apsL == null || st.apsL > 0 ? 1 : 0); set('apsR', st.apsR == null || st.apsR > 0 ? 1 : 0);
      set('net0', 0.8); set('net1', 0.6 + 0.4 * (Math.sin(this.clock * 9) > 0.3 ? 1 : 0)); set('net2', blink * 0.7); set('radio0', 0.7); set('radio1', 0.7);
      for (const who of CREW_NAMES) set('icom' + who, 0.5);
      set('drvPwr', T.alive ? 1 : 0); set('drvEng', T.alive ? 1 : 0); set('drvPark', Math.abs(v) < 0.1 ? 1 : 0);
      for (const c of this.controls) if (c.lamp != null) I[c.lamp] = c.state ? 1 : 0;
      const dm = this.domeMode; for (const d of DOME_IDS) { set(d + 'w', dm === 1 ? 1 : 0); set(d + 'r', dm === 2 ? 1 : 0); set(d + 'b', dm === 3 ? 1 : 0); }
    }
    // switches the crew and the systems move themselves
    this._crewSet('park', Math.abs(v) < 0.1 ? 1 : 0); this._crewSet('mag', this.gpsMag === 10 ? 1 : 0); this._crewSet('radar', hk === 'OFF' ? 0 : 1);
    // spring back the controls the crew owns, release pushed buttons
    for (const c of this.controls) { if (c.anim > 0) { c.anim = Math.max(0, c.anim - dt * 2.2); this._poseControl(c); } if (c.press > 0) { c.press -= dt; this._poseControl(c); } }

    // ---- lighting: dome lamps, display glow, daylight through openings
    this.tur.updateWorldMatrix(true, false); this.hul.updateWorldMatrix(true, false);
    const LP = SHARED.uLampPos.value, LC = SHARED.uLampCol.value, LR = SHARED.uLampR.value, dome = DOME[this.domeMode], dayK = (night ? 0.05 : 0.55 + 0.25 * Math.min(1.5, cond.hemiI || 1));
    if (this._skyOf !== s.cond) { this._skyOf = s.cond; const c = new THREE.Color(cond.sky || '#ffffff'); this._sky = new THREE.Vector3(0.6 + 0.4 * c.r, 0.6 + 0.4 * c.g, 0.6 + 0.4 * c.b); } _v.copy(this._sky);
    for (let i = 0; i < NLAMP; i++) { const l = this.lamps[i]; LP[i].copy(l.p).applyMatrix4((l.g === 'tur' ? this.tur : this.hul).matrixWorld); LR[i] = l.r; }
    const dead = !T.alive || FX.lightsOut, flick = dead ? (Math.sin(this.clock * 23) * Math.sin(this.clock * 7.3) > 0.2 ? 0.5 : 0.08) : 0;   /* knocked out: power gone, an emergency lamp flickers */
    // lamps: flicker for a moment after any hit; a penetration may leave only the red emergency lamps; a killing hit puts them out
    const fl = FX.flick > 0 ? ((Math.sin(B.t * 61) * Math.sin(B.t * 23.7) > -0.1 ? 1 : 0.12)) : 1;
    for (let i = 0; i < 3; i++) { if (dead) LC[i].set(1.6 * flick, 0.12 * flick, 0.08 * flick); else if (FX.emergency) LC[i].set(1.3 * fl, 0.1 * fl, 0.07 * fl); else if (dome) LC[i].set(dome[0] * fl, dome[1] * fl, dome[2] * fl); else LC[i].set(0, 0, 0); }
    SHARED.uGlitch.value = clamp(FX.glitch, 0, 1);
    for (const k in this.brt) { const U = this.scr[k].uniforms; U.uBright.value = this.brt[k] * (dead || FX.dark[k] ? (FX.dark[k] ? 0 : 0.1) : 1); U.uWeak.value = FX.weak[k] ? 0.55 : 0; }
    const hb = this.scr.hkoi.uniforms.uBright.value, gb = this.scr.gps.uniforms.uBright.value;
    LC[3].set(0.1, 0.42, 0.4).multiplyScalar(hb * (T.alive ? 1 : 0)); LC[7].set(0.1, 0.4, 0.16).multiplyScalar(gb * (T.alive ? 1 : 0));
    LC[4].copy(_v).multiplyScalar(dayK * 3.2 * this.st.hatch); LC[5].copy(_v).multiplyScalar(dayK * (1.3 + 1.2 * this.st.cup1 + 3.2 * this.st.cup2)); LC[6].copy(_v).multiplyScalar(dayK * 1.1);
    const a = (dome && !dead ? 0.045 * (FX.emergency ? 0.35 : 1) : 0.012) + (seat ? 0 : dayK * 0.5);   /* seen from outside (cutaway, a man in a hatch) daylight falls on it */ SHARED.uAmb.value.set(a + dayK * 0.02 + (dome ? dome[0] * 0.012 : 0), a + dayK * 0.02 + (dome ? dome[1] * 0.012 : 0), a + dayK * 0.02 + (dome ? dome[2] * 0.012 : 0));
    // flash of the penetration, glow of a fire, and the smoke
    if (FX.flash > 0) { SHARED.uAmb.value.x += 3.2 * FX.flash; SHARED.uAmb.value.y += 2.1 * FX.flash; SHARED.uAmb.value.z += 1.0 * FX.flash; }
    const fireK = FX.fire ? 0.16 + 0.07 * Math.sin(B.t * 11) * Math.sin(B.t * 4.3) : 0; if (fireK) { SHARED.uAmb.value.x += fireK; SHARED.uAmb.value.y += fireK * 0.42; SHARED.uAmb.value.z += fireK * 0.1; }
    { const lit = SHARED.uAmb.value, k = 2.2 + (dome && !dead ? 2.5 : 0); SHARED.uSmoke.value = this.smoke; SHARED.uSmokeCol.value.set(Math.min(0.5, lit.x * k), Math.min(0.48, lit.y * k), Math.min(0.46, lit.z * k)); }
    SHARED.uCabY.value = _v.set(0, 0, 0).applyMatrix4(this.tur.matrixWorld).y; { const h = FX.last, U = SHARED.uSmokeAt.value; if (h && h.pen) { _v.copy(h.e).addScaledVector(h.d, 0.4).applyMatrix4(this.hul.matrixWorld); U.set(_v.x, _v.y, _v.z, (FX.fire ? 1.4 : 1.3 * Math.exp(-FX.lastAge / 7))); } else U.w = 0; }
    this.fx.update(mode === 'outside' ? fxState([], 0) : FX, this.graphic);
    this._crew(s, FX, info, seat, loading, sdt);
    const R = this.s.renderer; SHARED.uExpo.value = clamp(0.62 / Math.max(0.05, R.toneMappingExposure || 0.62), 0.3, 3) * (cut ? 1.5 : 1);   /* a little brighter in the cutaway, where daylight is all round it */
    this.mat.glass.uniforms.uDay.value.copy(_v).multiplyScalar(dayK * 0.9);

    // ---- cutaway: the cutting plane faces the viewer
    // ---- cutaway: one straight cut, fixed to the vehicle, so the section is clean and nothing is left hanging. From the side the near
    // half is taken off along the hull's length (a hand's width to the viewer's side of the centre line, so the gun stays whole on its
    // mount); from high above the turret roof is lifted off instead. The choice has some give in it so it does not flicker.
    if (cut) { const lc = _v.copy(this.s.camera.position); this.hul.worldToLocal(lc); const el = Math.atan2(lc.y - 0.2, Math.hypot(lc.x, lc.z)) / DEG;
      if (this.cutTop ? el < 46 : el > 56) this.cutTop = !this.cutTop; if (!this.cutSide || lc.x * this.cutSide < -0.35) this.cutSide = lc.x >= 0 ? 1 : -1;
      const n = _v2, p = _v; if (this.cutTop) { n.set(0, 1, 0); p.set(0, DIM.RF - 0.12, 0); } else { n.set(this.cutSide, 0, 0); p.set(this.cutSide * 0.22, 0, 0); }
      p.applyMatrix4(this.hul.matrixWorld); n.transformDirection(this.hul.matrixWorld);  const d0 = n.dot(p); SHARED.uClip.value.set(n.x, n.y, n.z, -d0); this.plane.normal.copy(n).negate(); this.plane.constant = d0; }

    { const lids = !(cut && this.cutTop); if (P.hatch.visible !== lids) P.hatch.visible = P.cupHatch.visible = lids; }   /* with the roof lifted off, the two hatch lids go with it */
    // ---- displays
    this._box(SEATS[mode] && !cut ? (this.headOut ? (mode === 'in_ldr' ? 'hatch' : null) : mode) : mode === 'outside' && this.st.hatch > 0.02 ? 'hatch' : null);
    this._sights(dt, s, seat, cut); if (mode === 'outside' || this.headOut) { this._outsideOnly(); this.wasOut = true; } else { if (this.wasOut) { this.wasOut = false; for (const g of [this.tur, this.hul]) for (const c of g.children) if (!c.userData.crew && !c.userData.hole) c.visible = true; } this.part.ldrHole.visible = this.part.cupHole.visible = false; this._draw(dt, s, hk, info); }
  }

  _cupPose() { const h = this.part.cupHatch; h.position.y = h.userData.home.y + 0.1 * Math.max(this.st.cup1, Math.min(1, this.st.cup2 * 3)); h.rotation.y = -2.5 * sm((this.st.cup2 - 0.3) / 0.7); }   /* up its post first, then swung aside round it */
  setCupolaHatch(state, now) { this.cupHatch = state; for (const c of this.controls || []) if (c.key === 'cdrHatch') c.state = state; if (now) { this.st.cup1 = state === 1 ? 1 : 0; this.st.cup2 = state === 2 ? 1 : 0; this._cupPose(); } }
  // What each crewman is doing this moment, handed to the figures: where his head and hands are, how he is bearing up (from the battle's
  // crew model), whether he is hurt (the damage reports), whether a hit is about to land.
  _crew(s, FX, info, seat, loading, sdt) {
    if (!this.crewFig) { const base = s.volleys && s.volleys.assetBase; if (!base && !this._noBase) return; this.crewFig = new CrewFigures(o => cabMaterial(o), { tur: this.tur, hul: this.hul }, base); }
    if (!this.crewOn) { this.crewFig.hide(); return; }
    const cs = this.crewS, P = this.part, T = s.battle.tank, gone = !!(cs && cs.abandoned), men = this._men || (this._men = { gnr: { hands: [[0, 0, 0], [0, 0, 0]], head: [0, 0, 0] }, cdr: { hands: [[0, 0, 0], [0, 0, 0]], head: [0, 0, 0] }, ldr: { hands: [[0, 0, 0], [0, 0, 0]], head: [0, 0, 0] }, drv: { hands: [[0, 0, 0], [0, 0, 0]], head: [0, 0, 0] } });
    const brace = info.some(m => m.range < (m.drone ? 150 : 400)) ? 1 : 0, flinch = clamp(FX.shake, 0, 1), KEY = { gnr: 'in_gnr', cdr: 'in_cdr', ldr: 'in_ldr', drv: 'in_drv' };
    const grip = (part, x, y, z, out) => { part.updateMatrix(); _v.set(x, y, z).applyMatrix4(part.matrix); if (part.parent && part.parent !== this.tur && part.parent !== this.hul) { part.parent.updateMatrix(); _v.applyMatrix4(part.parent.matrix); } out[0] = _v.x; out[1] = _v.y; out[2] = _v.z; };
    for (const r of ['gnr', 'cdr', 'ldr', 'drv']) { const M = men[r], S = SEATS[KEY[r]], w = cs && cs.on ? cs.who[r] : null, bl = FX.blood[r] || null;
      M.on = !gone && (this.mode !== 'outside' || (r === 'ldr' && this.st.ldrU > 0.45) || (r === 'cdr' && this.st.cup2 > 0.5)); M.up = 0; M.firing = false; M.aim = 0; M.load = r === 'ldr' ? this.loadF : -1; M.bodyOnly = this.mode === KEY[r] && !this.eyeOff;   /* from his own seat the viewer sees his hands on handgrips (gunner, driver) and his legs, not a torso; an arm reaching across to a panel would only block the view */ M.state = w ? w.state : 'steady'; M.frozen = !!(w && /freez|frozen/.test(String(w.busy || '') + String(w.why || '')));
      M.status = (w && w.status !== 'ok' && w.status !== 'wounded') || bl === 'killed' ? 'down' : (w && w.status === 'wounded') || bl === 'wounded' ? 'wounded' : 'ok'; M.blood = this.graphic ? bl : null; M.brace = brace; M.flinch = flinch;
      M.head[0] = S.eye[0]; M.head[1] = S.eye[1]; M.head[2] = S.eye[2]; M.rise = 0; }
    if (this.cupHatch >= 1 && men.cdr.status === 'ok' && men.cdr.state !== 'panicked') { men.cdr.head[1] += SEATS.in_cdr.up * 0.75 * Math.max(this.st.cup1, this.st.cup2) + 0.5 * this.st.cup2; men.cdr.rise = this.st.cup2; }   /* up at the ports when the hatch is raised; head and shoulders out when it is open */
    grip(P.yoke, -0.135, 0.06, 0.01, men.gnr.hands[0]); grip(P.yoke, 0.135, 0.06, 0.01, men.gnr.hands[1]);
    grip(P.tbar, -0.225, -0.036, 0.0, men.drv.hands[0]); grip(P.tbar, 0.225, -0.036, 0.0, men.drv.hands[1]);
    men.cdr.hands[0][0] = 0.5; men.cdr.hands[0][1] = 0.16; men.cdr.hands[0][2] = 0.02; men.cdr.hands[1][0] = 0.96; men.cdr.hands[1][1] = 0.04; men.cdr.hands[1][2] = 0.14;
    { const H = men.ldr.hands, ra = this.roundAt; if (ra && this.loadF >= 0.1) { H[0][0] = ra.x - 0.05; H[0][1] = ra.y - 0.03; H[0][2] = ra.z - 0.12; H[1][0] = ra.x + 0.04; H[1][1] = ra.y - 0.02; H[1][2] = ra.z + (this.loadF > 0.56 ? 0.5 : 0.3); }   /* left hand under the nose, right hand at the base: he rams with the right */
      else { H[0][0] = -0.74; H[0][1] = -0.3; H[0][2] = 0.2; H[1][0] = -0.37; H[1][1] = DIM.GY + 0.0; H[1][2] = 0.3; } }
    if (this.st.ldrU > 0.004) {   // the climb, acted: reach for the lid's handle, push it open, hands to the rim, up through the opening, onto the gun
      const M = men.ldr, U = this.st.ldrU, H = M.hands, hx = DIM.HAT[0], hz = DIM.HAT[1], hr = DIM.HATR; this._ldrHead(U, _v); M.head[0] = _v.x; M.head[1] = _v.y; M.head[2] = _v.z; M.up = U; M.rise = sm((U - 0.42) / 0.3); M.load = -1;
      const a = sm((U - 0.02) / 0.1), b = sm((U - 0.3) / 0.1), c = sm((U - 0.8) / 0.14); P.hatch.updateMatrix(); M.firing = this.mgFiring && U > 0.97; M.aim = -this.st.mgYaw * DEG * 0.6;
      for (let i = 0; i < 2; i++) { const sx = i ? 1 : -1, sh = M.firing ? 0.005 * Math.sin(s.battle.t * 75 + i) : 0;
        _v.set(sx * 0.09, -0.05, -hr - 0.08).applyMatrix4(P.hatch.matrix);                                                    /* the handle under the lid, wherever the lid is */
        let x = H[i][0] + (_v.x - H[i][0]) * a, y = H[i][1] + (_v.y - H[i][1]) * a, z = H[i][2] + (_v.z - H[i][2]) * a;
        const rx = hx + sx * 0.23, ry = DIM.RF + 0.09, rz = hz - 0.2; x += (rx - x) * b; y += (ry - y) * b; z += (rz - z) * b;                          /* the rim, to pull himself up and to lean on */
        if (this.mgGripT) { x += (this.mgGripT.x + sx * 0.045 - x) * c; y += (this.mgGripT.y - 0.03 + sh - y) * c; z += (this.mgGripT.z + sh - z) * c; }   /* the machine gun's grips */
        H[i][0] = x; H[i][1] = y; H[i][2] = z; } }
    if (gone) { this.st.hatch = Math.max(this.st.hatch, 1); if (this.cupHatch !== 2) this.setCupolaHatch(2); }   /* bailed out: hatches open, seats empty */
    this.crewFig.update(men, s.battle.t, sdt); this.stats.crewTriangles = this.crewFig.triCount(); this.stats.crewReady = this.crewFig.ready; this.stats.crewFailed = this.crewFig.failed;
  }
  // where the loader's head is at each moment of his climb (interior frame): at his station, then up through the middle of the opening
  // with a little bob of effort, to standing behind his gun
  _ldrHead(U, out) { const e = SEATS.in_ldr.eye, k = sm((U - 0.4) / 0.36), tx = DIM.HAT[0] - 0.02, ty = DIM.RF + 0.5, tz = DIM.HAT[1] + 0.2; return out.set(e[0] + (tx - e[0]) * k, e[1] + (ty - e[1]) * k + 0.018 * Math.sin(k * Math.PI * 2) * (1 - k), e[2] + (tz - e[2]) * k); }
  // The loader's machine gun on the outside model: found by name, hung on a pivot at its mount so that it can be traversed, shaken as it fires.
  _mg(B, T, sdt) {
    const tk = this.tank; if (!tk.turret) return;
    if (this.mgPivot === undefined) { this.mgPivot = null; let mesh = null; tk.turret.traverse(o => { if (!mesh && o.isMesh && /m240/i.test(o.name)) mesh = o; });
      if (mesh && mesh.geometry) { tk.turret.updateWorldMatrix(true, true); mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox.clone().applyMatrix4(_m.copy(tk.turret.matrixWorld).invert().multiply(mesh.matrixWorld)), c = box.getCenter(new THREE.Vector3());
        const pv = new THREE.Group(); pv.name = 'm240-pivot'; pv.position.set(c.x, box.min.y, c.z); tk.turret.add(pv); pv.updateWorldMatrix(true, false); pv.attach(mesh); this.mgPivot = pv; this.mgMesh = mesh; this.mgHome = mesh.position.clone(); this.mgGrip = new THREE.Vector3(0, c.y - box.min.y, box.min.z - c.z + 0.05); this.mgGripT = new THREE.Vector3(); } }
    const pv = this.mgPivot; if (!pv) { this.mgFiring = false; return; }
    const mg = B._mg, U = this.st.ldrU, firing = !!(mg && mg.m240 && B.t >= mg.t && B.t <= mg.t + (mg.dur || 3)), recent = !!(mg && mg.m240 && B.t >= mg.t && B.t < mg.t + (mg.dur || 3) + 4); this.mgFiring = firing;
    let want = 0; if (recent && U > 0.8) want = clamp((((Math.atan2(mg.e - T.e, mg.n - T.n) / DEG - (this.turBrg || 0) + 540) % 360) - 180), -110, 110);
    this.st.mgYaw = ease(this.st.mgYaw, want, 3.5, sdt); pv.rotation.y = -this.st.mgYaw * DEG;
    this.mgMesh.position.copy(this.mgHome); if (firing && U > 0.97) this.mgMesh.position.z -= 0.012 * (Math.sin(B.t * 75) > 0.2 ? 1 : 0);                         /* recoil of each round */
    pv.updateWorldMatrix(true, false); this.mgGripT.copy(this.mgGrip).applyMatrix4(pv.matrixWorld); this.tur.worldToLocal(this.mgGripT);
  }
  _mgRest() { if (this.mgPivot) { this.mgPivot.rotation.y = 0; this.mgMesh.position.copy(this.mgHome); this.st.mgYaw = 0; } }
  // in an outside view only the hatch lids, the dark of the open hatchways and the men who are up are left showing
  _outsideOnly() { const lo = this.st.hatch > 0.25, co = this.st.cup2 > 0.25 || this.st.cup1 > 0.25; for (const g of [this.tur, this.hul]) for (const c of g.children) { if (c.userData.crew) continue; c.visible = !!c.userData.out && (!c.userData.hole || (c === this.part.ldrHole ? lo : co)) && (c === this.part.hatch || c === this.part.ldrHole ? this.st.hatch > 0.01 : !!this.cupUser); } }
  // The seat cameras. Called by the camera module in place of its own modes.
  drive(cams, dt) {
    const S = SEATS[cams.mode]; if (!S || !this.active) return false; const g = S.g === 'tur' ? this.tur : this.hul, cam = this.s.camera, L = this.look, H = this.head;
    let yaw = S.yaw0 + L.yaw, pitch = S.pitch0 + L.pitch; const U = cams.mode === 'in_ldr' ? this.st.ldrU : 0, upK = sm((U - 0.6) / 0.3);
    if (U > 0.002) { pitch += 52 * sm(U / 0.1) * (1 - sm((U - 0.42) / 0.3)) + (10 - S.pitch0) * 0 + (-6 - S.pitch0) * upK * 0 + 8 * upK; yaw += (this.st.mgYaw - S.yaw0) * upK; }   /* he looks up at his hatch as he works it, then along his gun */
    // the commander lifts his head into the cupola to look out through the vision blocks, and drops below the roof to look at his displays
    if (S.up) H.up = ease(H.up, clamp((pitch + 20) / 12, 0, 1), cams.snap ? 1e3 : 7, dt);
    _v.set(S.eye[0] + H.x, S.eye[1] + (S.up ? S.up * H.up : 0) + Math.sin(this.clock * 1.3) * 0.0015, S.eye[2] + H.z); if (U > 0.002) { this._ldrHead(U, _v); if (this.mgFiring && U > 0.97) { _v.y += 0.004 * Math.sin(this.simT * 75); _v.z += 0.003 * Math.sin(this.simT * 75 + 1); } } if (this.eyeOff) { _v.x += this.eyeOff[0]; _v.y += this.eyeOff[1]; _v.z += this.eyeOff[2]; }
    // at an optic: the eye goes to a place just inside its glass and looks out along it; the move there and back is a fixed 0.4 s blend
    if (this.opMode !== cams.mode) { this.opMode = cams.mode; this.optic = null; this.opT = 1; this.lookSeat = null; this.opCur = null; }
    let fovT = S.fov / L.zoom; const O = this.optic;
    if (O || this.opT < 1) {
      if (O) { const k = O.optic, rt = k.kind !== 'block'; _on.set(0, 0, 1).applyQuaternion(O.quat); _v.copy(O.pos).addScaledVector(_on, k.dist || (k.kind === 'lp' ? 0.25 : k.kind === 'gas' ? 0.15 : 0.12));
        yaw = Math.atan2(-_on.x, _on.z) / DEG + (k.yaw || 0) + (rt ? 0 : L.yaw); pitch = Math.asin(clamp(-_on.y, -1, 1)) / DEG + (rt ? 0 : L.pitch); fovT = k.fov || (rt ? 30 : 50); }
      const F = this.opFrom, K = F ? sm(this.opT) : 1; if (F && K < 1) { _v.x = F.x + (_v.x - F.x) * K; _v.y = F.y + (_v.y - F.y) * K; _v.z = F.z + (_v.z - F.z) * K; yaw = F.yaw + ((((yaw - F.yaw) % 360) + 540) % 360 - 180) * K; pitch = F.pitch + (pitch - F.pitch) * K; fovT = F.fov + (fovT - F.fov) * K; }
      this.opT = Math.min(1, this.opT + dt / 0.4);
    }
    { const c = this.opCur || (this.opCur = {}); c.x = _v.x; c.y = _v.y; c.z = _v.z; c.yaw = yaw; c.pitch = pitch; c.fov = fovT; }
    { const out = _v.y > DIM.RF + 0.05 && !O && this.opT >= 1 ? 0 : 1; if (SHARED.uInside.value !== out) SHARED.uInside.value = SHARED.uInsideF.value = out; this.headOut = !out; }   /* once his eyes are above the roof the outside model is drawn in the ordinary way */   /* the wheel narrows the view; the eye itself does not move forward, so it can never pass through a console */
    g.updateWorldMatrix(true, false);
    { const sh = this.fxS ? Math.min(2.2, this.fxS.shake) : 0; if (sh > 0.02) { const t = Math.floor(this.simT * 40), n = k => (Math.sin((t + k * 17.3) * 127.1) * 43758.5453 % 1); _v.x += n(1) * sh * 0.022; _v.y += n(2) * sh * 0.02; _v.z += n(3) * sh * 0.016; this.shakeRoll = n(5) * sh * 0.04; } else this.shakeRoll = 0; }   /* the whole compartment jumps */
    cam.position.copy(_v).applyMatrix4(g.matrixWorld);
    g.getWorldQuaternion(_q); cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(pitch * DEG, -yaw * DEG, -H.x * 0.4 + (this.shakeRoll || 0), 'YXZ'))); cam.up.set(0, 1, 0);
    const near = this.headOut ? 0.12 : (S.near || 0.5) + (S.nearUp ? (S.nearUp - S.near) * H.up : 0); if (Math.abs(cam.near - near) > 0.004) { if (this.near0 == null) this.near0 = cam.near; cam.near = near; cam.updateProjectionMatrix(); }
    const fov = fovT; if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = cams.snap || O || this.opT < 1 ? fov : cam.fov + (fov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
    return true;
  }

  // ---------------------------------------------------------------- the two sight pictures (a small extra view of the outside, at most one a frame)
  _sights(dt, s, seat, cut) {
    const q = this.s.quality, ok = q !== 'min' && q !== 'low' && !this.s.software_off, want = !ok ? [] : this.mode === 'in_gnr' ? ['gps', 'gas'] : this.mode === 'in_cdr' || cut ? ['citv', 'gps'] : this.mode === 'in_ldr' ? ['lp'] : [], at = this.optic && (this.optic.optic.kind === 'lp' || this.optic.optic.kind === 'gas') ? this.optic.optic.kind : null; if (at && !want.includes(at)) want.push(at);
    const B = s.battle, T = B.tank, tw = this.s.world;
    // where the commander's viewer points: it sweeps on its own and stops on a team the crew has found and can see
    this.tur.getWorldDirection(_v); const turBrg = Math.atan2(-_v.x, _v.z) / DEG;   /* the group's own +z points backward, so its direction is turned round */
    this.turBrg = (turBrg + 360) % 360; if (this.citvYaw == null) this.citvYaw = this.turBrg;
    this.tgtT = (this.tgtT || 0) - dt; if (this.tgtT <= 0) { this.tgtT = 0.25; const tg = B._targets ? B._targets().find(x => x.los) : null; this.citvTgt = tg ? tg.k : null; }
    const sdt = s.playing ? dt * (s.speed || 1) : 0, ct = this.citvTgt;
    if (ct) { const wantB = Math.atan2(ct.e - T.e, ct.n - T.n) / DEG, d = ((wantB - this.citvYaw + 540) % 360) - 180; this.citvYaw = (this.citvYaw + clamp(d, -60 * sdt, 60 * sdt) + 360) % 360; this.citvOn = Math.abs(d) < 1; } else { this.citvYaw = (this.citvYaw + 12 * sdt + 360) % 360; this.citvOn = false; }
    const rf = B._rf, aim = rf ? rf.k : null; this.gpsOn = false; if (aim) { const wantB = Math.atan2(aim.e - T.e, aim.n - T.n) / DEG; this.gpsOff = ((wantB - this.turBrg + 540) % 360) - 180; this.gpsOn = Math.abs(this.gpsOff) < 0.8; }
    this.gpsMag = aim && Math.abs(this.gpsOff) < 8 ? 10 : 3; this.citvMag = ct && this.citvOn ? 10 : 3;
    for (const k in SIGHT_EVERY) this.scr[k].uniforms.uHasLive.value = this.rt[k] && want.includes(k) ? 1 : 0;
    // each wanted view has its own clock; the most overdue one is drawn, and never more than one in a frame
    let key = null, worst = 0; for (const k of want) { this.due[k] = (this.due[k] == null ? 0 : this.due[k]) - dt; if (this.due[k] <= worst) { worst = this.due[k]; key = k; } }
    if (at) key = at;   /* the optic the eye is at is drawn every frame */
    if (!key || !T.alive) return; this.due[key] = SIGHT_EVERY[key]; this.stats.sightDraws = (this.stats.sightDraws || 0) + 1;
    const R = this.s.renderer, cam = this.sightCam, SZ = key === at ? (key === 'lp' ? [1280, 400] : [720, 720]) : { gps: [640, 400], citv: [640, 400], lp: [640, 200], gas: [256, 256] }[key];
    if (!this.rt[key]) { this.rt[key] = new THREE.WebGLRenderTarget(SZ[0], SZ[1], { type: THREE.HalfFloatType, depthBuffer: true }); this.scr[key].uniforms.uLive.value = this.rt[key].texture; } else if (this.rt[key].width !== SZ[0]) this.rt[key].setSize(SZ[0], SZ[1]);
    cam.aspect = SZ[0] / SZ[1];
    if (key === 'lp') { cam.position.set(DIM.HAT[0], DIM.RF + 0.32, DIM.HAT[1] - DIM.HATR - 0.2).applyMatrix4(this.tur.matrixWorld); const b = (this.turBrg - 20 + (this.lpYaw || 0)) * DEG; cam.fov = 12.5; _v.set(cam.position.x + Math.sin(b) * 300, cam.position.y - 14, cam.position.z - Math.cos(b) * 300); }   /* unity power: about 40 degrees wide, 12 high */
    else if (key === 'gas') { cam.position.set(0.41, DIM.GY + 0.35, -1.9).applyMatrix4(this.tur.matrixWorld); const b = this.turBrg * DEG, Rg = aim ? Math.hypot(aim.e - T.e, aim.n - T.n) : 1500, ty = aim ? tw.h(aim.e, aim.n) + 1 : cam.position.y - Rg * 0.0053; cam.fov = 8; _v.set(cam.position.x + Math.sin(b) * Rg, ty, cam.position.z - Math.cos(b) * Rg); }   /* fixed 8 power, 8 degrees */
    else if (key === 'gps') { cam.position.set(0.66, DIM.RF + 0.3, -1.0).applyMatrix4(this.tur.matrixWorld); const b = this.turBrg * DEG, Rg = aim ? Math.hypot(aim.e - T.e, aim.n - T.n) : 1500, ty = aim ? tw.h(aim.e, aim.n) + 1 : cam.position.y - Rg * 0.0053; cam.fov = this.gpsMag === 10 ? 4.1 : 13.5; _v.set(cam.position.x + Math.sin(b) * Rg, ty, cam.position.z - Math.cos(b) * Rg); }
    else { cam.position.set(-0.55, DIM.RF + 0.55, -0.7).applyMatrix4(this.tur.matrixWorld); const b = this.citvYaw * DEG, Rg = ct ? Math.hypot(ct.e - T.e, ct.n - T.n) : 1200, ty = ct ? tw.h(ct.e, ct.n) + 1 : cam.position.y - Rg * 0.0117; cam.fov = this.citvMag === 10 ? 2.1 : 8.2; _v.set(cam.position.x + Math.sin(b) * Rg, ty, cam.position.z - Math.cos(b) * Rg); }
    cam.up.set(0, 1, 0); cam.lookAt(_v); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const tv = this.tank.group.visible, prev = R.getRenderTarget(), c0 = R.info.render.calls, fxU = this.s.fx && this.s.fx.mat && this.s.fx.mat.uniforms.scale, sc0 = fxU ? fxU.value : 0;
    this.tank.group.visible = false; if (fxU) fxU.value = 200 * 0.9;
    try { R.setRenderTarget(this.rt[key]); R.render(this.s.scene, cam); } finally { R.setRenderTarget(prev); this.tank.group.visible = tv; if (fxU) fxU.value = sc0; }
    this.stats.sightCalls = R.info.render.calls - c0; this.scr[key].uniforms.uGain.value = (R.toneMappingExposure || 0.62) * 1.5;
  }

  // ---------------------------------------------------------------- what the displays show (redrawn only when something on them changes)
  _draw(dt, s, hk, info) {
    this.drawT = (this.drawT || 0) - dt; if (this.drawT > 0) return; this.drawT = 0.1;   /* ten times a second is plenty for numbers and lists */
    const B = s.battle, T = B.tank, st = T.st || {}, rf = B._rf, wait = rf ? Math.max(0, rf.at - B.t) : 0, loading = !T.loaded && T.main > 0, live = k => this.scr[k].uniforms.uHasLive.value > 0.5;
    // the battle's own status board (per station: state, target, rounds of the full load), read a few times a second
    this.boardT = (this.boardT || 0) - 0.1; if (this.boardT <= 0 || !this.board) { this.boardT = 0.3; const list = B.tankBoard ? B.tankBoard() : []; this.board = {}; for (const r of list) this.board[r.key] = r; }
    const bd = this.board, M = B._max || {}, max = { main: M.main || Math.max(T.main || 0, 18), m240: M.m240 || 800, obs: M.obs || 150, he: M.he || 150, aps: M.aps || 4 };
    const hull = (((s.shown ? s.shown.h : T.h) || 0) % 360 + 360) % 360, rel = ((this.tank.turretYaw || 0) % 360 + 540) % 360 - 180, v = T.v || 0, gl = SHARED.uGlitch.value > 0.3;
    // each threat in the air: where it is, how long it has left, and what the station is doing about it
    const vols = (B.volleys || []).slice(-4);
    const threats = info.map(m => { const th = m.th || {}, vol = vols.find(q => q.rec && q.rec.threats && q.rec.threats.includes(th)), tv = vol ? B.t - vol.t0 : null, fired = th.viz ? th.viz.fired : null, by = th.defeated_by || '';
      const tti = tv != null && th.impact != null ? Math.max(0, th.impact - tv) : (th.v > 0 ? m.range / th.v : null), shot = fired != null && tv != null && tv >= fired;
      const act = shot ? (by === 'hkoi_he' ? 'AIRBURST FIRED' : th.sever_m != null && m.range <= th.sever_m ? 'BEAM CUT' : 'OBSCURANT FIRED') : m.tracked ? (fired != null ? 'LAYING GUN' : by === 'aps' ? 'HANDED TO TROPHY' : 'TRACKING') : m.cued ? 'CUED' : 'DETECTED';
      return { no: (th.idx != null ? th.idx : 0) + 1, name: (m.tt && m.tt.short) || (m.drone ? 'drone' : 'threat'), range: m.range, brg: ((m.brg || 0) % 360 + 360) % 360, tti, act, tone: shot ? 'ok' : m.tracked ? 'busy' : m.cued ? 'warn' : 'bad' }; }).sort((p, q) => (p.tti == null ? 99 : p.tti) - (q.tti == null ? 99 : q.tti));
    const seatSees = this.mode === 'in_gnr' || this.mode === 'in_cdr' || this.mode === 'cut';
    const D = { t: B.t, alive: !!T.alive, warning: !!this.warning, blink: Math.floor(this.clock * 2.2) % 2 === 1, hk, hkPage: this.hkPage, tracks: this.hkTracks || 0, threats, st: { obs: st.obs, he: st.he, apsL: st.apsL, apsR: st.apsR }, max,
      turBrg: ((this.turBrg || 0) % 360 + 360) % 360, hull, rel, sweep: Math.floor(B.t * 4) * 24 % 360, crew: this.crewS, hkLine: (bd.HKOI && bd.HKOI.line) || '', hkFact: (bd.HKOI && bd.HKOI.facts && bd.HKOI.facts[0]) || '',
      faults: [['RADAR', T.alive ? 'SCANNING' : 'OFF', T.alive ? 'ok' : 'bad'], ['GUN DRIVE', T.alive ? 'OK' : 'OFF', T.alive ? 'ok' : 'bad'], ['OBSCURANT FEED', st.obs > 0 ? 'OK' : 'EMPTY', st.obs > 0 ? 'ok' : 'bad'], ['AIRBURST FEED', st.he > 0 ? 'OK' : 'EMPTY', st.he > 0 ? 'ok' : 'bad'],
        ['TROPHY LEFT', st.apsL > 0 ? 'READY' : 'EMPTY', st.apsL > 0 ? 'ok' : 'bad'], ['TROPHY RIGHT', st.apsR > 0 ? 'READY' : 'EMPTY', st.apsR > 0 ? 'ok' : 'bad'], ['DATA BUS', gl ? 'FAULT' : 'OK', gl ? 'bad' : 'ok'], ['POWER', T.alive ? 'OK' : 'OFF', T.alive ? 'ok' : 'bad']],
      rf: rf ? { R: rf.R } : null, wait, main: T.main || 0, loaded: !!T.loaded, loading, gpsMag: this.gpsMag, gpsLive: live('gps'), tgt: bd.MAIN && bd.MAIN.target,
      gunLine: !T.alive ? 'OFF' : rf ? (this.gpsOn ? (wait > 1.2 ? 'LASING' : 'ON THE WAY IN ' + wait.toFixed(1)) : 'TRAVERSING') : this.st.rec < 2.5 ? 'ROUND AWAY' : loading ? 'LOADING' : T.main <= 0 ? 'NO ROUNDS' : 'SCANNING',
      liveNote: seatSees ? 'SYMBOLS ONLY: PICTURE NEEDS MEDIUM GRAPHICS OR BETTER' : 'PICTURE SHOWN FROM THE GUNNER\'S AND COMMANDER\'S SEATS',
      citvYaw: ((this.citvYaw || 0) % 360 + 360) % 360, citvMag: this.citvMag, citvOn: !!this.citvOn, citvTgt: !!this.citvTgt, citvLive: live('citv'), cdrLine: (bd.CDR && bd.CDR.line) || '',
      solution: !T.alive ? 'OFF' : rf ? (this.gpsOn ? 'SOLUTION' : 'LAYING') : 'NO TARGET',
      fcs: [['LASER', T.alive ? 'OK' : 'OFF', T.alive ? 'ok' : 'bad'], ['THERMAL', T.alive ? 'ON' : 'OFF', T.alive ? 'ok' : 'bad'], ['GUN', T.loaded ? 'ARMED' : 'SAFE', T.loaded ? 'warn' : 'ok'], ['DATA BUS', gl ? 'FAULT' : 'OK', gl ? 'bad' : 'ok'], ['HKOI', hk, hk === 'OFF' ? 'bad' : hk === 'SEARCH' ? 'ok' : 'warn'], ['TROPHY', (st.apsL || 0) + (st.apsR || 0) > 0 ? 'READY' : 'EMPTY', (st.apsL || 0) + (st.apsR || 0) > 0 ? 'ok' : 'bad']],
      kmh: Math.round(Math.abs(v) * 3.6), gear: v > 0.3 ? 'D' : v < -0.3 ? 'R' : 'N', rpm: T.alive ? 900 + 1900 * Math.min(1, Math.abs(this.st.thr || 0)) : 0, steer: clamp(this.st.steer || 0, -1, 1),
      cautions: [Math.abs(rel) > 25 ? ['GUN OVER THE SIDE', 'warn'] : null, gl ? ['ELECTRICAL FAULT', 'bad'] : null, (this.smoke || 0) > 0.25 ? ['SMOKE IN THE VEHICLE', 'bad'] : null, this.crewS && this.crewS.on && this.crewS.who.drv.status !== 'ok' ? ['DRIVER ' + String(this.crewS.who.drv.status).toUpperCase(), 'bad'] : null].filter(Boolean),
      ldrUp: this.st.ldrU > 0.5, door: this.st.door || 0, armed: this.st.arm > 0.5, m240: T.m240 || 0, m240State: (bd.M240 && bd.M240.state) || (this.st.ldrU > 0.5 ? 'manned' : 'stowed') };
    for (const k in MFD) drawMfd(k, this.cv[k], D);
  }

  // From a seat, the outside model is left out inside a box round the crew space (and a little above the roof), so that its own
  // fittings, lids and sight heads never stand in a port, a periscope or an open hatchway. Beyond the box (gun barrel, hull front,
  // track guards) it is still seen. The machine guns keep their own materials and stay.
  _box(mode) {
    const on = !!mode; if (on && !this.boxed) { const seen = new Set(), list = []; const root = this.tank.model || this.tank.group;
      if (!this.boxPl) this.boxPl = Array.from({ length: 6 }, () => new THREE.Plane());
      root.traverse(o => { let p = o; while (p) { if (p.userData && p.userData.cab) return; p = p.parent; } if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m && !seen.has(m) && !/^M2|M240/.test(m.name || '')) { seen.add(m); list.push({ m, cp: m.clippingPlanes, ci: m.clipIntersection }); m.clippingPlanes = this.boxPl; m.clipIntersection = true; m.needsUpdate = true; } });
      this.boxed = list; }
    else if (!on && this.boxed) { for (const x of this.boxed) { x.m.clippingPlanes = x.cp || null; x.m.clipIntersection = !!x.ci; x.m.needsUpdate = true; } this.boxed = null; }
    if (!on) return; const drv = mode === 'in_drv', G = drv ? this.hul : this.tur, lo = drv ? [-0.8, -1.4, -5.2] : [-1.3, -1.3, -1.3], hi = drv ? [0.8, -0.2, DIM.DZ + 0.95] : [1.3, DIM.RF + 0.8, 1.75];
    if (mode === 'hatch') { const hx = DIM.HAT[0], hz = DIM.HAT[1], r = DIM.HATR + 0.02; lo[0] = hx - r; lo[1] = DIM.RF - 0.3; lo[2] = hz - r; hi[0] = hx + r; hi[1] = DIM.RF + 0.2; hi[2] = hz + r; }
    for (let i = 0; i < 6; i++) { const ax = i >> 1, sg = i & 1 ? 1 : -1; _v2.set(0, 0, 0).setComponent(ax, sg); _v.set(0, 0, 0).setComponent(ax, sg > 0 ? hi[ax] : lo[ax]); _v.applyMatrix4(G.matrixWorld); _v2.transformDirection(G.matrixWorld); this.boxPl[i].setFromNormalAndCoplanarPoint(_v2, _v); }
  }
}
