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

const DEG = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const LOAD_S = 6;                       // seconds for a reload with the loader at his station (the same number as in the battle's crew model)
const DOME = [null, [2.3, 2.1, 1.75], [2.0, 0.16, 0.1], [0.25, 1.5, 1.25]];   // dome lamp settings: off, white, red, blue-green
const DOME_NAME = ['off', 'white', 'red', 'blue-green'], HATCH_NAME = ['closed', 'open-protected', 'open'];
// how often each small view of the outside is redrawn, seconds (at most one of them in any frame)
const SIGHT_EVERY = { gps: 0.05, citv: 0.08, lp: 0.07, gas: 0.25 };
const BRT = [0.3, 0.6, 1.0, 1.45], CREW_NAMES = ['Gunner', 'Commander', 'Loader', 'Driver'], DOME_IDS = ['domeR', 'domeL', 'domeD'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _ray = new THREE.Raycaster();

export class Interior {
  constructor(scene3d, tank, cams, opts = {}) {
    this.s = scene3d; this.tank = tank; this.cams = cams; if (cams) cams.interior = this;
    this.inside = false;         // true while a seat view is active (the sound module muffles the outside)
    this.active = false; this.built = false; this.mode = null;
    this.warning = false;        // a missile or drone is inbound: warning lights are flashing
    this.warnTone = false;       // the same, while the HKOI tone switch is on (a flag for the sound module; nothing plays it yet)
    this.intercomVol = 0.75;     // what the intercom volume knobs are set to, 0 to 1 (a value for the sound module)
    this.look = { yaw: 0, pitch: 0, zoom: 1 }; this.head = { z: 0, vz: 0, x: 0, vx: 0, up: 0 };
    this.cupHatch = 0;           // commander's hatch: 0 closed, 1 open-protected, 2 open (the viewer's choice; the battle has no state for it)
    this.domeMode = 1; this.domeUser = false; this.hkPage = 0; this.toneOn = true; this.lampTestT = 0; this.hkFireT = 0; this.clock = 0;
    this.st = { door: 0, block: 0, hatch: 0, rec: 9, slew: 0, steer: 0, arm: 1, cup1: 0, cup2: 0, thr: 0, gear: 0 }; this.last = { main: null, yaw: null, hdg: null, v: 0, recoil: 0, t: null };
    this.stats = { triangles: 0, meshes: 0, sightCalls: 0, controls: 0 };
    this.brt = { gps: 1, citv: 1, comp: 1, hkoi: 1, drv: 1, lp: 1, gas: 1 };   /* what the brightness knobs of the displays are set to */
    this.due = {}; this.plane = new THREE.Plane(); this.ext = null; this.citvYaw = null; this.sightT = 0; this.sightN = 0; this.keys = {};
    // PROPOSAL ONLY: crew figures are parked by the owner. They are loaded only when the page address carries crew=1 (to take pictures for him to judge).
    this.crewOn = typeof location !== 'undefined' && new URLSearchParams((location.hash || '').slice(1)).get('crew') === '1'; this.crew = null;
    this.ui = typeof document !== 'undefined' && scene3d && scene3d.canvas ? new SeatUI(scene3d.canvas, this) : null;
    if (scene3d && scene3d.renderer) scene3d.renderer.localClippingEnabled = true;   /* the cutaway view slices the outside model with a plane */
  }
  owns(mode) { return !!SEATS[mode]; }

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
      if (d.pos) g.position.fromArray(d.pos); if (d.quat) g.quaternion.copy(d.quat); if (d.rx) g.rotation.x = d.rx; g.userData.home = g.position.clone(); g.userData.q0 = g.quaternion.clone(); P[key] = g; }
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
    const mkScreen = (key, w, h, opaque) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; this.cv[key] = { c, x: c.getContext('2d'), t, key: '', opaque }; return screenMaterial(t); };
    const SM = { gps: mkScreen('gps', 320, 200), citv: mkScreen('citv', 320, 200), comp: mkScreen('comp', 320, 144, true), hkoi: mkScreen('hkoi', 512, 320, true), drv: mkScreen('drv', 384, 240, true), lp: mkScreen('lp', 256, 80), gas: mkScreen('gas', 128, 128) };
    for (const d of B.screens) { const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), SM[d.key]); m.position.copy(d.pos); m.quaternion.copy(d.quat); m.frustumCulled = false; G[d.g].add(m); this.scr[d.key] = SM[d.key]; meshes++; tris += 2; }
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
  operate(c) {
    if (c.type === 'spot' && !c.key) return c.name + (c.locked ? ' · the crew works this.' : '');
    if (c.locked) { c.anim = 1; return c.name + ' · the crew works this one: it springs back.'; }
    if (c.type === 'button') { c.press = 0.35; if (c.key === 'lampTest') this.lampTestT = 1.3; if (c.key === 'hkPage') this.hkPage = (this.hkPage + 1) % 3; this._poseControl(c); return c.name; }
    c.state = (c.state + 1) % c.n; if (c.key) for (const o of this.controls) if (o.key === c.key && o !== c) { o.state = c.state; this._poseControl(o); } this._poseControl(c); this._apply(c);
    return c.name + ' · now ' + this._stateName(c);
  }
  _apply(c) {
    const k = c.key, U = n => this.scr[n].uniforms; if (!k) return;
    if (k === 'cdrHatch') { this.cupHatch = c.state; return; }
    if (k === 'dome') { this.domeMode = c.state; this.domeUser = true; } else if (k === 'gpsPol') U('gps').uMode.value = c.state ? -1 : 1; else if (k === 'citvPol') U('citv').uMode.value = c.state ? -1 : 1;
    else if (k === 'gpsBrt') this.brt.gps = BRT[c.state]; else if (k === 'citvBrt') this.brt.citv = BRT[c.state]; else if (k === 'compBrt') this.brt.comp = BRT[c.state]; else if (k === 'hkBrt') this.brt.hkoi = BRT[c.state]; else if (k === 'drvBrt') this.brt.drv = BRT[c.state];
    else if (k === 'hkTone') this.toneOn = !!c.state; else if (k === 'icomVol') this.intercomVol = c.state / (c.n - 1); else if (k === 'backlight') SHARED.uBack.value = [0, 0.35, 0.7, 1.1][c.state];
  }
  turnHead(dx, dy) { const S = SEATS[this.mode]; if (!S) return; const k = 0.16 / this.look.zoom; this.look.yaw = S.yawLim >= 180 ? ((this.look.yaw - dx * k + 540) % 360) - 180 : clamp(this.look.yaw - dx * k, -S.yawLim - S.yaw0, S.yawLim - S.yaw0);   /* the commander can turn right round in his cupola */ this.look.pitch = clamp(this.look.pitch + dy * k, S.pitch[0] - S.pitch0, S.pitch[1] - S.pitch0); }
  // for tests and pictures: point the head (degrees from the seat's own forward) and set the zoom; survives a change of seat made in the same breath
  setLook(yaw, pitch, zoom = 1) { this.look.yaw = yaw; this.look.pitch = pitch; this.look.zoom = zoom; this.pendingLook = { yaw, pitch, zoom }; }
  zoomBy(d) { this.look.zoom = clamp(this.look.zoom * Math.exp(-d * 0.0012), 1, 3.4); }

  // ---------------------------------------------------------------- entering and leaving
  _enter(mode) {
    const tk = this.tank, tur = tk.turret || tk.group, body = tk.body || tk.group; if (this.tur.parent !== tur) tur.add(this.tur); if (this.hul.parent !== body) body.add(this.hul);
    if (tk.turret) this.hul.position.copy(tk.turret.position); else { this.hul.position.set(0, 1.617, -0.025); this.tur.position.copy(this.hul.position); }
    const cut = mode === 'cut'; if (cut) this._near(); SHARED.uInside.value = cut ? 0 : 1; SHARED.uClipOn.value = cut ? 1 : 0; if (cut) this._cutOn(); else this._cutOff();
    if (this.pendingLook) { Object.assign(this.look, this.pendingLook); this.pendingLook = null; } else { this.look.yaw = 0; this.look.pitch = 0; this.look.zoom = 1; } this.head.z = this.head.vz = this.head.x = this.head.vx = 0; this.head.up = 0; this.mode = mode; this.active = true;
    this._marks(cut);   /* the floating map markers of the outside views would hang in front of the walls */
    if (this.ui && !cut) this.ui.show(`${SEATS[mode].name}'s seat · drag to look around, wheel to lean in, click a switch. The crew runs the vehicle; your clicks only change harmless things.`, 6500);
  }
  _near() { const cam = this.s.camera; if (this.near0 != null && cam.near !== this.near0) { cam.near = this.near0; cam.updateProjectionMatrix(); } }   /* give the camera its usual near distance back */
  _marks(show) { const m = typeof document !== 'undefined' && document.getElementById('marks'); if (m) m.style.visibility = show ? '' : 'hidden'; }
  _leave() { this._marks(true); this._near(); if (this.tur.parent) this.tur.parent.remove(this.tur); if (this.hul.parent) this.hul.parent.remove(this.hul); this._cutOff(); this.active = false; this.mode = null; this.inside = false; this.warning = this.warnTone = false; if (this.ui) this.ui.hide(); }
  // the cutaway: the outside model is sliced by a plane that always faces the viewer, and shown from both sides so the far half reads as a shell
  _cutOn() { if (this.ext) return; const seen = new Set(), list = []; const root = this.tank.model || this.tank.group; root.traverse(o => { let p = o; while (p) { if (p.userData && p.userData.cab) return; p = p.parent; } if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m && !seen.has(m)) { seen.add(m); list.push({ m, side: m.side, cp: m.clippingPlanes }); m.side = THREE.DoubleSide; m.clippingPlanes = [this.plane]; m.needsUpdate = true; } }); this.ext = list; }
  _cutOff() { if (!this.ext) return; for (const x of this.ext) { x.m.side = x.side; x.m.clippingPlanes = x.cp || null; x.m.needsUpdate = true; } this.ext = null; }

  // ---------------------------------------------------------------- every frame
  // s: { on, battle, shown: {e, n, h}, volleys, cond, playing, speed }
  update(dt, s) {
    const mode = this.cams ? this.cams.mode : null, seat = SEATS[mode], cut = mode === 'cut', on = !!(s && s.on && (seat || cut));
    if (!on) { if (this.active) this._leave(); return; }
    if (!this.built) this._build();
    if (!this.active || this.mode !== mode || (this.tank.turret && this.tur.parent !== this.tank.turret)) this._enter(mode);   /* also when the vehicle's model has only just arrived */
    this.pendingLook = null; this.inside = !!seat; this.clock += dt; SHARED.uTime.value = this.clock;
    if (this.crewOn && !this.crewAsked && s.volleys && s.volleys.assetBase) { this.crewAsked = true; import('./interior_crew.js').then(m => m.seatCrew(this, s.volleys.assetBase)).then(list => { this.crew = list; }).catch(e => console.warn('crew figures not shown:', e && e.message)); }
    if (this.crew) for (const c of this.crew) c.group.visible = c.key !== mode;   /* the viewer has taken that man's seat */
    const B = s.battle, T = B.tank, st = T.st || {}, info = (s.volleys && s.volleys.info) || [], A = T.ai || {}, P = this.part, L = this.last, sdt = s.playing ? dt * (s.speed || 1) : 0, D = DIM;
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
      if (loading && f > 0.1 && f < 0.36) { R.visible = true; R.position.set(p[0], p[1], p[2] + 0.45 - 0.75 * clamp((f - 0.1) / 0.22, 0, 1)); }
      else if (loading && f >= 0.5 && f < 0.82) { R.visible = true; R.position.set(0, D.GY, 0.25 - 1.05 * clamp((f - 0.56) / 0.24, 0, 1)); }
      else R.visible = false;
      const nReady = clamp(T.main - (T.loaded ? 0 : 0), 0, 18) - (loading && f > 0.1 ? 1 : 0), nSemi = clamp(T.ap == null ? 18 : T.ap, 0, 18);
      if (nReady !== this._nR || nSemi !== this._nS) { this._nR = nReady; this._nS = nSemi; const z = _m.makeScale(0, 0, 0); for (let i = 0; i < 36; i++) { const here = i < 18 ? i < nReady : i - 18 < nSemi; if (here) { const q = this.rackSlot(i < 18 ? -1 : 1, i % 18); this.rounds.setMatrixAt(i, _m.makeTranslation(q[0], q[1], q[2])); } else this.rounds.setMatrixAt(i, z.makeScale(0, 0, 0)); } this.rounds.instanceMatrix.needsUpdate = true; } }
    this.st.arm = ease(this.st.arm, T.loaded ? 1 : 0, 6, dt); P.armLever.quaternion.copy(P.armLever.userData.q0).multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), 0.5 - this.st.arm));
    this.st.hatch = ease(this.st.hatch, ldrUp ? 1 : 0, 3, sdt || dt * 0.5); P.hatch.rotation.x = this.st.hatch * 1.45;
    // the handles follow the turret, the T-bar follows the steering
    const yaw = this.tank.turretYaw || 0, hdg = s.shown ? s.shown.h : T.h, v = T.v || 0;
    if (L.yaw != null && dt > 1e-4) { const rate = clamp((((yaw - L.yaw + 540) % 360) - 180) / dt / 40, -1, 1); this.st.slew = ease(this.st.slew, rate, 10, dt); const tr = clamp((((hdg - L.hdg + 540) % 360) - 180) / dt / 25, -1, 1); this.st.steer = ease(this.st.steer, s.playing ? tr : 0, 6, dt); }
    L.yaw = yaw; L.hdg = hdg; const acc = dt > 1e-4 && s.playing ? clamp((v - L.v) / Math.max(dt * (s.speed || 1), 1e-3), -4, 4) : 0; L.v = v;
    P.yoke.rotation.z = -this.st.slew * 0.42; P.override.rotation.z = -this.st.slew * 0.12; P.tbar.rotation.set(0.3, 0, 0); P.tbar.rotateY(-this.st.steer * 0.55);   /* the T-bar turns about its stem */
    this.st.thr = ease(this.st.thr, s.playing && T.alive ? clamp(Math.abs(v) / 14 + Math.max(0, acc * Math.sign(v || 1)) * 0.25, 0, 1) : 0, 6, dt); P.throttle.rotation.x = -this.st.thr * 1.2;   /* twist grip: more power, more twist */
    this.st.gear = ease(this.st.gear, v > 0.3 ? 1 : v < -0.3 ? -1 : 0, 8, dt); P.gear.rotation.x = -this.st.gear * 0.5;
    this.st.cup1 = ease(this.st.cup1, this.cupHatch === 1 ? 1 : 0, 5, dt); this.st.cup2 = ease(this.st.cup2, this.cupHatch === 2 ? 1 : 0, 4, dt); this._cupPose();
    // head: leans against acceleration and jolts with the main gun
    { const H = this.head; let left = Math.min(dt, 0.1); while (left > 1e-5) { const h = Math.min(left, 1 / 120); H.vz += (-90 * H.z - 13 * H.vz + acc * 0.9) * h; H.z = clamp(H.z + H.vz * h, -0.06, 0.06); H.vx += (-90 * H.x - 13 * H.vx - this.st.steer * Math.abs(v) * 0.5) * h; H.x = clamp(H.x + H.vx * h, -0.04, 0.04); left -= h; } }

    // ---- the HKOI station, as its panel shows it
    const rc = this.tank.recoil || 0; if (rc > L.recoil + 1e-4) this.hkFireT = 0.8; L.recoil = rc; this.hkFireT = Math.max(0, this.hkFireT - dt);
    const active = !!(B._volleyActive && B._volleyActive()), inbound = info.length > 0;
    const hk = !T.alive ? 'OFF' : this.hkFireT > 0 ? 'FIRING' : s.volleys && s.volleys.aimAt ? 'LAYING' : info.some(m => m.tracked) ? 'TRACKING' : info.some(m => m.cued) ? 'CUED' : active && inbound ? 'SEARCH' : 'RADAR SILENT';
    this.hkState = hk; this.warning = T.alive && active && inbound; this.warnTone = this.warning && this.toneOn;

    // ---- indicator lights
    const I = SHARED.uInd.value, blink = (this.clock * 2.2) % 1 < 0.55 ? 1 : 0, set = (n, val) => { if (IND[n] != null) I[IND[n]] = val; }, rf = B._rf, wait = rf ? rf.at - B.t : 0;
    this.lampTestT = Math.max(0, this.lampTestT - dt);
    if (this.lampTestT > 0) I.fill(1); else {
      I.fill(0); const w = this.warning ? blink : 0; set('gnrWarn', w); set('cdrWarn', w); set('ldrWarn', w); set('drvWarn', w);
      set('ammo2', 1); set('gunReady', T.loaded && T.main > 0 && T.alive ? 1 : 0); set('laser', rf && wait > 0 && wait < 3 ? blink : 0.15);
      set('hkRadar', hk === 'RADAR SILENT' || hk === 'OFF' ? 0 : 1); set('hkTrack', hk === 'TRACKING' || hk === 'LAYING' || hk === 'FIRING' ? 1 : 0); set('hkFire', hk === 'FIRING' ? 1 : 0); set('hkArmed', T.alive ? 1 : 0);
      set('ldrSafe', T.loaded ? 0 : 1); set('ldrArmed', T.loaded ? 1 : 0); set('turPwr', T.alive ? 1 : 0); set('smkL', 0.8); set('smkR', 0.8); set('apsL', st.apsL == null || st.apsL > 0 ? 1 : 0); set('apsR', st.apsR == null || st.apsR > 0 ? 1 : 0);
      set('net0', 0.8); set('net1', 0.6 + 0.4 * (Math.sin(this.clock * 9) > 0.3 ? 1 : 0)); set('net2', blink * 0.7); set('radio0', 0.7); set('radio1', 0.7);
      for (const who of CREW_NAMES) set('icom' + who, 0.5);
      set('drvPwr', T.alive ? 1 : 0); set('drvEng', T.alive ? 1 : 0); set('drvPark', Math.abs(v) < 0.1 ? 1 : 0);
      for (const c of this.controls) if (c.lamp != null) I[c.lamp] = c.state ? 1 : 0;
      const dm = this.domeMode; for (const d of DOME_IDS) { set(d + 'w', dm === 1 ? 1 : 0); set(d + 'r', dm === 2 ? 1 : 0); set(d + 'b', dm === 3 ? 1 : 0); }
    }
    // switches the crew and the systems move themselves
    this._crewSet('park', Math.abs(v) < 0.1 ? 1 : 0); this._crewSet('mag', this.gpsMag === 10 ? 1 : 0); this._crewSet('radar', hk === 'RADAR SILENT' || hk === 'OFF' ? 0 : 1);
    // spring back the controls the crew owns, release pushed buttons
    for (const c of this.controls) { if (c.anim > 0) { c.anim = Math.max(0, c.anim - dt * 2.2); this._poseControl(c); } if (c.press > 0) { c.press -= dt; this._poseControl(c); } }

    // ---- lighting: dome lamps, display glow, daylight through openings
    this.tur.updateWorldMatrix(true, false); this.hul.updateWorldMatrix(true, false);
    const LP = SHARED.uLampPos.value, LC = SHARED.uLampCol.value, LR = SHARED.uLampR.value, dome = DOME[this.domeMode], dayK = (night ? 0.05 : 0.55 + 0.25 * Math.min(1.5, cond.hemiI || 1));
    if (this._skyOf !== s.cond) { this._skyOf = s.cond; const c = new THREE.Color(cond.sky || '#ffffff'); this._sky = new THREE.Vector3(0.6 + 0.4 * c.r, 0.6 + 0.4 * c.g, 0.6 + 0.4 * c.b); } _v.copy(this._sky);
    for (let i = 0; i < NLAMP; i++) { const l = this.lamps[i]; LP[i].copy(l.p).applyMatrix4((l.g === 'tur' ? this.tur : this.hul).matrixWorld); LR[i] = l.r; }
    const dead = !T.alive, flick = dead ? (Math.sin(this.clock * 23) * Math.sin(this.clock * 7.3) > 0.2 ? 0.5 : 0.08) : 0;   /* knocked out: power gone, an emergency lamp flickers */
    for (let i = 0; i < 3; i++) { if (dead) LC[i].set(1.6 * flick, 0.12 * flick, 0.08 * flick); else if (dome) LC[i].set(dome[0], dome[1], dome[2]); else LC[i].set(0, 0, 0); }
    for (const k in this.brt) this.scr[k].uniforms.uBright.value = this.brt[k] * (dead ? 0.1 : 1);
    const hb = this.scr.hkoi.uniforms.uBright.value, gb = this.scr.gps.uniforms.uBright.value;
    LC[3].set(0.1, 0.42, 0.4).multiplyScalar(hb * (T.alive ? 1 : 0)); LC[7].set(0.1, 0.4, 0.16).multiplyScalar(gb * (T.alive ? 1 : 0));
    LC[4].copy(_v).multiplyScalar(dayK * 3.2 * this.st.hatch); LC[5].copy(_v).multiplyScalar(dayK * (1.3 + 1.2 * this.st.cup1 + 3.2 * this.st.cup2)); LC[6].copy(_v).multiplyScalar(dayK * 1.1);
    const a = dome && !dead ? 0.045 : 0.012; SHARED.uAmb.value.set(a + dayK * 0.02 + (dome ? dome[0] * 0.012 : 0), a + dayK * 0.02 + (dome ? dome[1] * 0.012 : 0), a + dayK * 0.02 + (dome ? dome[2] * 0.012 : 0));
    const R = this.s.renderer; SHARED.uExpo.value = clamp(0.62 / Math.max(0.05, R.toneMappingExposure || 0.62), 0.3, 3) * (cut ? 1.5 : 1);   /* a little brighter in the cutaway, where daylight is all round it */
    this.mat.glass.uniforms.uDay.value.copy(_v).multiplyScalar(dayK * 0.9);

    // ---- cutaway: the cutting plane faces the viewer
    if (cut) { const c = _v.set(0, 0.15, 0).applyMatrix4(this.tur.matrixWorld), n = _v2.copy(this.s.camera.position).sub(c).normalize(); const d0 = n.dot(c) + 0.12; SHARED.uClip.value.set(n.x, n.y, n.z, -d0); this.plane.normal.copy(n).negate(); this.plane.constant = d0; }

    // ---- displays
    this._sights(dt, s, seat, cut); this._draw(dt, s, hk, info);
  }

  _cupPose() { const h = this.part.cupHatch; h.position.y = h.userData.home.y + 0.11 * this.st.cup1; h.rotation.x = 1.75 * this.st.cup2; }
  setCupolaHatch(state, now) { this.cupHatch = state; for (const c of this.controls || []) if (c.key === 'cdrHatch') c.state = state; if (now) { this.st.cup1 = state === 1 ? 1 : 0; this.st.cup2 = state === 2 ? 1 : 0; this._cupPose(); } }
  // The seat cameras. Called by the camera module in place of its own modes.
  drive(cams, dt) {
    const S = SEATS[cams.mode]; if (!S || !this.active) return false; const g = S.g === 'tur' ? this.tur : this.hul, cam = this.s.camera, L = this.look, H = this.head;
    const yaw = S.yaw0 + L.yaw, pitch = S.pitch0 + L.pitch;
    // the commander lifts his head into the cupola to look out through the vision blocks, and drops below the roof to look at his displays
    if (S.up) H.up = ease(H.up, clamp((pitch + 20) / 12, 0, 1), cams.snap ? 1e3 : 7, dt);
    _v.set(S.eye[0] + H.x, S.eye[1] + (S.up ? S.up * H.up : 0) + Math.sin(this.clock * 1.3) * 0.0015, S.eye[2] + H.z);   /* the wheel narrows the view; the eye itself does not move forward, so it can never pass through a console */
    g.updateWorldMatrix(true, false); cam.position.copy(_v).applyMatrix4(g.matrixWorld);
    g.getWorldQuaternion(_q); cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(pitch * DEG, -yaw * DEG, -H.x * 0.4, 'YXZ'))); cam.up.set(0, 1, 0);
    const near = (S.near || 0.5) + (S.nearUp ? (S.nearUp - S.near) * H.up : 0); if (Math.abs(cam.near - near) > 0.004) { if (this.near0 == null) this.near0 = cam.near; cam.near = near; cam.updateProjectionMatrix(); }
    const fov = S.fov / L.zoom; if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = cams.snap ? fov : cam.fov + (fov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
    return true;
  }

  // ---------------------------------------------------------------- the two sight pictures (a small extra view of the outside, at most one a frame)
  _sights(dt, s, seat, cut) {
    const q = this.s.quality, ok = q !== 'min' && q !== 'low' && !this.s.software_off, want = !ok ? [] : this.mode === 'in_gnr' ? ['gps', 'gas'] : this.mode === 'in_cdr' || cut ? ['citv', 'gps'] : this.mode === 'in_ldr' ? ['lp'] : [];
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
    if (!key || !T.alive) return; this.due[key] = SIGHT_EVERY[key]; this.stats.sightDraws = (this.stats.sightDraws || 0) + 1;
    const R = this.s.renderer, cam = this.sightCam, SZ = { gps: [320, 200], citv: [320, 200], lp: [256, 80], gas: [128, 128] }[key];
    if (!this.rt[key]) { this.rt[key] = new THREE.WebGLRenderTarget(SZ[0], SZ[1], { type: THREE.HalfFloatType, depthBuffer: true }); this.scr[key].uniforms.uLive.value = this.rt[key].texture; }
    cam.aspect = SZ[0] / SZ[1];
    if (key === 'lp') { cam.position.set(DIM.HAT[0], DIM.RF + 0.32, DIM.HAT[1] - DIM.HATR - 0.2).applyMatrix4(this.tur.matrixWorld); const b = (this.turBrg - 20) * DEG; cam.fov = 12.5; _v.set(cam.position.x + Math.sin(b) * 300, cam.position.y - 14, cam.position.z - Math.cos(b) * 300); }   /* unity power: about 40 degrees wide, 12 high */
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
    const B = s.battle, T = B.tank, st = T.st || {}, rf = B._rf, wait = rf ? Math.max(0, rf.at - B.t) : 0, pad = (n, w) => String(Math.round(n)).padStart(w, '0'), F = '"DIN Alternate", "Arial Narrow", Arial, sans-serif';
    const begin = (k, key) => { const c = this.cv[k]; if (c.key === key) return null; c.key = key; const x = c.x; if (c.opaque) { x.fillStyle = '#020806'; x.fillRect(0, 0, c.c.width, c.c.height); } else x.clearRect(0, 0, c.c.width, c.c.height); c.t.needsUpdate = true; return x; };
    const live = k => this.scr[k].uniforms.uHasLive.value > 0.5, loading = !T.loaded && T.main > 0;
    // gunner's primary sight: reticle, range, ammunition, what the gunner is doing
    { const line = !T.alive ? 'OFF' : rf ? (this.gpsOn ? (wait > 1.2 ? 'LASING' : 'ON THE WAY IN ' + wait.toFixed(1)) : 'TRAVERSING') : this.st.rec < 2.5 ? 'ROUND AWAY' : loading ? 'LOADING' : T.main <= 0 ? 'NO MP ROUNDS' : 'SCANNING';
      const x = begin('gps', [line, rf ? Math.round(rf.R / 10) : '-', T.main, this.gpsMag, Math.round(this.turBrg), live('gps'), T.loaded].join('|'));
      if (x) { const g = '#9dffb0'; x.strokeStyle = g; x.fillStyle = g; x.lineWidth = 1.6; x.beginPath(); for (const [a, b, c, d] of [[160, 20, 160, 82], [160, 118, 160, 180], [60, 100, 142, 100], [178, 100, 260, 100], [150, 100, 156, 100], [164, 100, 170, 100]]) { x.moveTo(a, b); x.lineTo(c, d); } for (let i = 1; i <= 3; i++) { x.moveTo(160 - 5, 118 + i * 14); x.lineTo(160 + 5, 118 + i * 14); } x.stroke(); x.fillRect(159, 99, 2, 2);
        x.font = `700 15px ${F}`; x.textAlign = 'left'; x.fillText(rf ? 'RNG ' + pad(Math.round(rf.R / 10) * 10, 4) : 'RNG ----', 10, 20); x.textAlign = 'right'; x.fillText(`MPAT  ${pad(T.main, 2)} RDS`, 310, 20); x.fillText(`${this.gpsMag}X`, 310, 190); x.textAlign = 'left'; x.fillText(line, 10, 190); x.textAlign = 'center'; x.fillText(pad(this.turBrg % 360, 3) + '°', 160, 14);
        if (T.loaded && T.main > 0) { x.strokeRect(118, 180, 84, 15); x.font = `700 12px ${F}`; x.fillText('GUN READY', 160, 192); }
        if (!live('gps')) { x.font = `600 12px ${F}`; x.fillStyle = 'rgba(157,255,176,.7)'; x.fillText(this.mode === 'in_gnr' || this.mode === 'in_cdr' || this.mode === 'cut' ? 'SYMBOLS ONLY: PICTURE NEEDS MEDIUM GRAPHICS OR BETTER' : 'PICTURE SHOWN FROM THE GUNNER\'S AND COMMANDER\'S SEATS', 160, 60); } } }
    // commander's display: his own viewer
    { const x = begin('citv', [Math.round(this.citvYaw || 0), this.citvMag, this.citvOn, !!this.citvTgt, live('citv'), this.warning && Math.floor(this.clock * 2.2) % 2].join('|'));
      if (x) { const g = '#9dffb0'; x.strokeStyle = g; x.fillStyle = g; x.lineWidth = 1.5; x.strokeRect(130, 75, 60, 50); x.beginPath(); x.moveTo(160, 60); x.lineTo(160, 85); x.moveTo(160, 115); x.lineTo(160, 140); x.moveTo(110, 100); x.lineTo(140, 100); x.moveTo(180, 100); x.lineTo(210, 100); x.stroke();
        x.font = `700 15px ${F}`; x.textAlign = 'left'; x.fillText('CITV', 10, 20); x.fillText(this.citvTgt ? (this.citvOn ? 'TARGET HELD' : 'SLEWING TO TARGET') : 'AUTO SCAN', 10, 190); x.textAlign = 'right'; x.fillText(`${this.citvMag}X`, 310, 190); x.fillText('BRG ' + pad((this.citvYaw || 0) % 360, 3), 310, 20);
        if (this.warning && Math.floor(this.clock * 2.2) % 2) { x.fillStyle = '#ff5040'; x.textAlign = 'center'; x.fillText('MISSILE WARNING', 160, 44); }
        if (!live('citv')) { x.font = `600 12px ${F}`; x.fillStyle = 'rgba(157,255,176,.7)'; x.textAlign = 'center'; x.fillText(this.mode === 'in_cdr' || this.mode === 'cut' ? 'SYMBOLS ONLY: PICTURE NEEDS MEDIUM GRAPHICS OR BETTER' : 'PICTURE SHOWN FROM THE COMMANDER\'S SEAT', 160, 60); } } }
    // ballistic computer
    { const rel = ((this.tank.turretYaw || 0) % 360 + 540) % 360 - 180, x = begin('comp', [rf ? Math.round(rf.R / 10) : '-', T.main, T.loaded, Math.round(rel), T.alive].join('|'));
      if (x) { x.fillStyle = '#7ff0a0'; x.font = `700 20px ${F}`; x.textAlign = 'left'; const rows = [['RANGE', rf ? pad(Math.round(rf.R / 10) * 10, 4) + ' M' : '---- M'], ['AMMO', 'MPAT'], ['ROUNDS', pad(T.main, 2) + ' MP  ' + pad(T.ap == null ? 0 : T.ap, 2) + ' KE'], ['GUN', !T.alive ? 'OFF' : T.loaded ? 'LOADED' : T.main > 0 ? 'LOADING' : 'EMPTY'], ['TURRET', (rel >= 0 ? 'R ' : 'L ') + pad(Math.abs(rel), 3) + '°']]; rows.forEach((r, i) => { x.fillText(r[0], 12, 26 + i * 26); x.fillText(r[1], 130, 26 + i * 26); }); } }
    // HKOI panel: state, rounds, threats, a small all-round scope
    { const list = info.slice().sort((p, q) => p.range - q.range).slice(0, 5), blink = this.warning && Math.floor(this.clock * 2.2) % 2 ? 1 : 0;
      const x = begin('hkoi', [hk, st.obs, st.he, st.apsL, st.apsR, this.hkPage, blink, T.alive, Math.round(this.turBrg / 3), list.map(m => m.tt.short + Math.round(m.range / 20) + (m.tracked ? 't' : m.cued ? 'c' : '')).join(',')].join('|'));
      if (x) { const cy = '#7ff0e6', am = '#ffb020', rd = '#ff5040', gr = '#5cff7a'; x.textAlign = 'left'; x.fillStyle = cy; x.font = `700 22px ${F}`; x.fillText('HKOI  30 MM', 12, 28);
        const sc = hk === 'FIRING' ? rd : hk === 'RADAR SILENT' ? cy : hk === 'OFF' ? '#557' : am; x.fillStyle = sc; x.fillRect(190, 8, 180, 28); x.fillStyle = '#020806'; x.textAlign = 'center'; x.font = `700 20px ${F}`; x.fillText(hk, 280, 29); x.textAlign = 'left';
        x.font = `700 19px ${F}`; const num = v => (v == null ? '--' : String(v)); x.fillStyle = st.obs != null && st.obs < 40 ? am : cy; x.fillText('OBSCURANT  ' + num(st.obs), 12, 64); x.fillStyle = st.he != null && st.he < 40 ? am : cy; x.fillText('HE AIRBURST  ' + num(st.he), 190, 64);
        x.fillStyle = cy; x.fillText(`TROPHY  L ${num(st.apsL)}  R ${num(st.apsR)}`, 12, 90); x.fillText('MODE  AUTO', 250, 90); x.strokeStyle = '#2c6f6a'; x.lineWidth = 1; x.beginPath(); x.moveTo(8, 102); x.lineTo(504, 102); x.stroke();
        if (this.hkPage === 2) { x.fillText('ROUNDS PAGE', 12, 128); x.font = `600 17px ${F}`; x.fillText('Obscurant rounds blind a guided missile\'s', 12, 156); x.fillText('link with a cloud in its path. HE airburst', 12, 178); x.fillText('rounds are for drones and close threats.', 12, 200); x.fillText(`Trophy countermeasures left: ${num(st.apsL)} and ${num(st.apsR)}`, 12, 230); }
        else { x.font = `700 17px ${F}`; x.fillStyle = '#4fb0a8'; x.fillText('THREAT        RANGE     BRG    STATE', 12, 124); if (!list.length) { x.fillStyle = cy; x.fillText(hk === 'RADAR SILENT' ? 'NO WARNING · RADAR SILENT' : 'NONE IN THE AIR', 12, 152); }
          list.forEach((m, i) => { x.fillStyle = m.tracked ? gr : m.cued ? am : cy; const y = 150 + i * 24; x.fillText(String(m.tt.short || 'THREAT').toUpperCase().slice(0, 11), 12, y); x.fillText(pad(m.range, 4) + ' M', 130, y); x.fillText(pad((m.brg + 360) % 360, 3), 222, y); x.fillText(m.tracked ? 'TRACKED' : m.cued ? 'CUED' : 'WARNING', 282, y); }); }
        // scope: the vehicle at the centre, north up; a line for the turret, a dot for each threat in the air
        { const ox = 432, oy = 196, R = 62; x.strokeStyle = '#2c6f6a'; x.lineWidth = 1.5; for (const r of [R, R * 0.5]) { x.beginPath(); x.arc(ox, oy, r, 0, 6.3); x.stroke(); } x.fillStyle = '#4fb0a8'; x.font = `700 13px ${F}`; x.textAlign = 'center'; x.fillText('N', ox, oy - R - 4); x.fillText('4 KM', ox, oy + R + 14);
          const tb = this.turBrg * DEG; x.strokeStyle = cy; x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + Math.sin(tb) * R * 0.45, oy - Math.cos(tb) * R * 0.45); x.stroke();
          for (const m of list) { const b = (m.brg || 0) * DEG, rr = Math.min(1, m.range / 4000) * R; x.fillStyle = m.tracked ? gr : m.cued ? am : rd; x.beginPath(); x.arc(ox + Math.sin(b) * rr, oy - Math.cos(b) * rr, 4, 0, 6.3); x.fill(); } x.textAlign = 'left'; }
        if (blink) { x.fillStyle = rd; x.fillRect(8, 282, 496, 30); x.fillStyle = '#020806'; x.textAlign = 'center'; x.font = `700 21px ${F}`; x.fillText('MISSILE WARNING', 256, 304); }
        else { x.fillStyle = this.warning ? rd : '#4fb0a8'; x.textAlign = 'center'; x.font = `700 17px ${F}`; x.fillText(this.warning ? 'MISSILE WARNING' : hk === 'RADAR SILENT' ? 'LISTENING · NOTHING IN THE AIR' : ' ', 256, 303); } } }
    // driver's display
    { const v = T.v || 0, kmh = Math.round(Math.abs(v) * 3.6), hdg = Math.round(((s.shown ? s.shown.h : T.h) % 360 + 360) % 360) % 360, gear = v > 0.3 ? 'D' : v < -0.3 ? 'R' : 'N', blink = this.warning && Math.floor(this.clock * 2.2) % 2 ? 1 : 0;
      const x = begin('drv', [kmh, hdg, gear, blink, this.warning, T.alive, Math.round(this.tank.turretYaw || 0)].join('|'));
      if (x) { const cy = '#7ff0e6'; x.fillStyle = cy; x.textAlign = 'left'; x.font = `700 76px ${F}`; x.fillText(String(kmh).padStart(2, ' '), 18, 86); x.font = `700 24px ${F}`; x.fillText('KM/H', 122, 86); x.fillText('HDG ' + pad(hdg, 3), 236, 46); x.fillText('GEAR ' + gear, 236, 86);
        x.font = `700 22px ${F}`; { const rel = ((this.tank.turretYaw || 0) % 360 + 540) % 360 - 180; x.fillText('GUN  ' + (Math.abs(rel) < 2 ? 'OVER THE FRONT' : (rel > 0 ? 'RIGHT ' : 'LEFT ') + pad(Math.abs(rel), 3) + '°'), 18, 128); } x.fillText(T.alive ? 'ENGINE RUNNING' : 'ENGINE STOPPED', 18, 158); x.font = `600 14px ${F}`; x.fillStyle = '#4fb0a8'; x.fillText('ENGINE RPM AND FUEL: NOT MODELLED IN THE SIMULATOR', 18, 178); x.fillStyle = cy;
        if (blink) { x.fillStyle = '#ff5040'; x.fillRect(10, 186, 364, 40); x.fillStyle = '#020806'; } else x.fillStyle = this.warning ? '#ff5040' : '#5cff7a'; x.font = `700 24px ${F}`; x.textAlign = 'center'; x.fillText(this.warning ? 'MISSILE WARNING' : T.alive ? 'NO WARNING' : 'VEHICLE KNOCKED OUT', 192, 214); } }
  }
}
