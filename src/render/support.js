// Drawing of the friendly support and the bomber drone (the battle side is src/battle/support.js; read its data contract first).
// The simplest correct picture, made from views that already exist:
//   the wingman       a second TankView, with a VolleyView of its own for the engagements fought on it (missiles, HKOI, Trophy, hits)
//   artillery         a shell burst, a crater mark and a flash for every round as it lands
//   the scout drone   the supplied drone model, larger, circling 150 m up
//   air strikes       an aircraft shape made in code flying its run, its tracers and strikes or its bomb and the burst
//   bomber drones     the supplied drone model, larger still, with its bombs falling and bursting; HKOI's airbursts at it
// Everything is a function of battle time: nothing here keeps a clock of its own, so it is the same at any frame rate, and a jump in
// time (replay) marks what is already past as seen instead of setting it all off at once.
import * as THREE from 'three';
import { TankView, missileMesh } from './units.js';
import { VolleyView } from './volleyview.js';

const DEG = Math.PI / 180;

// The particle system is stepped once a frame by the main VolleyView. A second VolleyView (the wingman's) must add its effects to the
// same system without stepping it again: it is given this stand-in, which passes everything through except the stepping.
function sharedParticles(fx) {
  const noop = () => {}, bound = new Map();
  return new Proxy(fx, {
    get(t, k) { if (k === 'sync' || k === 'step' || k === 'clear') return noop; const v = t[k]; if (typeof v !== 'function') return v; let b = bound.get(k); if (!b) { b = v.bind(t); bound.set(k, b); } return b; },
    set(t, k, v) { if (k === 'driven' || k === 'ground') return true; t[k] = v; return true; },
  });
}

export class SupportView {
  constructor(scene3d, assetBase) {
    this.s = scene3d; this.assets = assetBase; this.group = new THREE.Group(); this.group.name = 'support'; scene3d.scene.add(this.group);
    this.battle = null; this.t = 0; this.emit = () => {}; this.fxShared = sharedParticles(scene3d.fx);
    this.wingTank = null; this.wingVolleys = null; this.wing = { e: 0, n: 0, h: 0, set: false, shotI: 0, mgI: 0, mgAcc: 0, dead: false, landing: [] };
    this.scoutMesh = null; this.drones = new Map(); this.bombMeshes = new Map();
    this.v1 = new THREE.Vector3(); this.v2 = new THREE.Vector3(); this.v3 = new THREE.Vector3();
    this.bombGeo = new THREE.SphereGeometry(0.11, 8, 6); this.bombMat = new THREE.MeshStandardMaterial({ color: '#2b2d26', roughness: 0.7, metalness: 0.3 });
    this.planes = new Map(); this.info = { wing: false, scout: false, bombers: 0, bombs: 0, aircraft: 0 };   /* what is being drawn, for tests */
  }
  // an aircraft, made in code: fuselage, straight wing, tailplane, fin, two engine pods (an A-10 sort of shape, about 16 m long)
  _plane() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#5d6468', roughness: 0.7, metalness: 0.2 }), add = (geo, x, y, z, rx, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; g.add(o); return o; };
    add(new THREE.CylinderGeometry(0.75, 0.55, 13, 10), 0, 0, 0, Math.PI / 2); add(new THREE.ConeGeometry(0.75, 3, 10), 0, 0, -8, -Math.PI / 2);   /* the nose points along -z, the way a heading of 0 looks north */
    add(new THREE.BoxGeometry(17, 0.22, 2.6), 0, -0.2, -0.5); add(new THREE.BoxGeometry(6, 0.16, 1.6), 0, 0.2, 6.2); add(new THREE.BoxGeometry(0.16, 2.4, 1.8), 2.8, 1.2, 6.2); add(new THREE.BoxGeometry(0.16, 2.4, 1.8), -2.8, 1.2, 6.2);
    add(new THREE.CylinderGeometry(0.7, 0.7, 3, 10), 1.5, 1.1, 3.4, Math.PI / 2); add(new THREE.CylinderGeometry(0.7, 0.7, 3, 10), -1.5, 1.1, 3.4, Math.PI / 2);
    g.userData.heat = 0.8; this.group.add(g); return g;
  }
  _drone(scale) { const g = new THREE.Group(), m = missileMesh(true, this.assets); m.scale.multiplyScalar(scale); g.add(m); g.userData.heat = 0.6; this.group.add(g); return g; }
  // a new battle (or the same one started over for a replay)
  reset(battle) {
    this.battle = battle; this.t = battle ? battle.t : 0; const W = this.wing; W.set = false; W.shotI = 0; W.mgI = 0; W.dead = false; W.landing.length = 0;
    if (this.wingVolleys) { this.wingVolleys.dispose(); this.wingVolleys = null; }
    for (const m of this.drones.values()) this.group.remove(m); this.drones.clear(); for (const m of this.planes.values()) { this.group.remove(m.g); if (m.bomb) this.group.remove(m.bomb); } this.planes.clear(); for (const m of this.bombMeshes.values()) this.group.remove(m); this.bombMeshes.clear();
    if (this.scoutMesh) this.scoutMesh.visible = false; if (this.wingTank) this.wingTank.group.visible = false;
    if (battle && battle.wing) {
      if (!this.wingTank) { this.wingTank = new TankView(this.assets); this.wingTank.group.userData.heat = 0.5; this.wingTank.group.name = 'wingman'; this.s.units.add(this.wingTank.group); }
      this.wingTank.group.visible = true; this.wingVolleys = new VolleyView(this.s, battle.wingView(), this.fxShared); this.wingVolleys.assetBase = this.assets; this.wingVolleys.tankView = this.wingTank; this.wingVolleys.emit = (type, p, o) => this.emit(type, p, o);
    }
  }
  // everything up to time t has been seen: no effects for it
  skipTo(t) {
    const b = this.battle; if (!b) return; this.t = t; const S = b.sup, G = b.wing;
    if (G) { this.wing.shotI = G.shots.filter(s => s.t <= t).length; this.wing.mgI = G.mgs.filter(m => m.t + m.dur <= t).length; this.wing.landing.length = 0; this.wing.set = false; if (this.wingVolleys) this.wingVolleys.skipTo(t); }
    if (S) { for (const F of S.fires) for (const r of F.rounds) if (r.done && r.t <= t) r._dr = true; for (const fl of S.flights) for (const sh of fl.shots || []) { if (sh.t <= t) sh._d0 = true; if (sh.t + sh.tof <= t) sh._d1 = true; } }
    for (const B of b.bombs || []) if (B.t1 <= t) B._dr = true;
    if (S) for (const k of S.strikes) { if (k.release <= t) k._d0 = true; for (const im of k.impacts) if (im.t <= t) im._dr = true; if (k.state === 'lost' || k.state === 'waved_off') k._dOff = true; }
  }
  dispose() { this.reset(null); this.s.scene.remove(this.group); if (this.wingTank) this.s.units.remove(this.wingTank.group); }
  // o: { t (the moment being drawn), dt (simulated seconds since the last frame; 0 when paused), all (spectator: show everything),
  //      tank (the player's TankView, for the muzzle of its HKOI gun), world }
  update(battle, o) {
    if (battle !== this.battle) this.reset(battle); if (!battle) return;
    const t = o.t, dt = Math.max(0, o.dt || 0), s = this.s, fx = s.fx, W = battle.world, hf = (x, z) => W.h(x, -z);
    if (t < this.t - 0.05 || t > this.t + 6) this.skipTo(t); this.t = t;
    const S = battle.sup, G = battle.wing, I = this.info; I.wing = false; I.scout = false; I.bombers = 0; I.bombs = 0; I.aircraft = 0;
    // ---- the wingman
    if (G && this.wingTank) {
      const tv = this.wingTank, w = this.wing, P = battle.wingAt(Math.min(t, battle.t)); I.wing = true;
      if (!w.set || !(dt > 0) || Math.hypot(P.e - w.e, P.n - w.n) > 6) { w.e = P.e; w.n = P.n; w.h = P.h; w.set = true; }   /* no time has passed (paused, or stepped by hand): exactly where the battle has it */
      else { const k = dt > 0 ? 1 - Math.exp(-dt * 14) : 0; w.e += (P.e - w.e) * k; w.n += (P.n - w.n) * k; w.h = (w.h + ((((P.h - w.h) % 360) + 540) % 360 - 180) * k + 360) % 360; }   /* the battle moves in steps of 0.1 s: drawn eased between them */
      const hh = w.h * DEG, fe = Math.sin(hh), fn = Math.cos(hh), d = 2.5, pitch = Math.atan2(W.h(w.e + fe * d, w.n + fn * d) - W.h(w.e - fe * d, w.n - fn * d), 2 * d), roll = Math.atan2(W.h(w.e + fn * 1.6, w.n - fe * 1.6) - W.h(w.e - fn * 1.6, w.n + fe * 1.6), 3.2);
      tv.place(s.at(w.e, w.n, 0, this.v1), w.h, -pitch, roll); tv.animate(dt, G.alive ? (G.v || 0) : 0);
      if (G.alive && tv.turret) { /* the turret follows the battle's own turret bearing (which already turns at the turret's real rate), eased between steps */
        const want = (((G.tur == null ? w.h : G.tur) - w.h + 540) % 360) - 180, d = ((want - tv.turretYaw + 540) % 360) - 180; tv.turretYaw += d * (dt > 0 ? 1 - Math.exp(-dt * 18) : 1); tv.turret.rotation.y = -tv.turretYaw * DEG;
        if (this.wingVolleys) tv.aimStation(this.wingVolleys.aimAt, dt); }
      if (this.wingVolleys) this.wingVolleys.update(Math.min(t, battle.t), dt);
      // its main gun
      while (w.shotI < G.shots.length && G.shots[w.shotI].t <= t) { const sh = G.shots[w.shotI++]; if (t - sh.t > 2) continue; const a = Math.atan2(sh.to.e - sh.from.e, sh.to.n - sh.from.n), m = s.at(w.e + Math.sin(a) * 6.5, w.n + Math.cos(a) * 6.5, 2.3, this.v2);
        fx.seed(sh.t + 7); fx.muzzleBlast(m.x, m.y, m.z, Math.sin(a), 0, -Math.cos(a), 1.5); const g = s.at(w.e, w.n, 0.3, this.v3); fx.dustRing(g.x, g.y, g.z, 1.3, 11); const q = s.at(sh.to.e, sh.to.n, 0.6, this.v3); fx.tracer(m.x, m.y, m.z, q.x, q.y, q.z, Math.max(0.05, sh.tof), 1, 0.7, 0.35, 0.28, 34, 8); s.blast(m, 1.4, false); tv.kick(); this.emit('gun120', m, {}); w.landing.push(sh); }
      for (let i = w.landing.length - 1; i >= 0; i--) { const sh = w.landing[i]; if (t < sh.t + sh.tof) continue; w.landing.splice(i, 1); const p = s.at(sh.to.e, sh.to.n, 0.4, this.v2); fx.seed(sh.t + 8); fx.explosion(p.x, p.y, p.z, 1.5, {}); s.blast(p, 1.4); s.marks.add(p.x, p.z, 2.4, hf, { kind: 1 }); if (sh.hit) fx.column(p.x, p.y, p.z, 50, 1); this.emit('explosion', p, { size: 1.5 }); }
      // its machine guns: a red tracer every fifth round or so, strikes at the target
      while (w.mgI < G.mgs.length && t > G.mgs[w.mgI].t + G.mgs[w.mgI].dur) w.mgI++;
      for (let i = w.mgI; i < G.mgs.length && i < w.mgI + 4; i++) { const b = G.mgs[i]; if (t < b.t || t > b.t + b.dur || !(dt > 0)) continue; w.mgAcc += dt * 9; let n = Math.min(3, Math.floor(w.mgAcc)); w.mgAcc -= Math.floor(w.mgAcc);
        const key = b.w || (b.coax ? 'coax' : 'm2'), m = tv.mgMuzzle(key, this.v2) || s.at(w.e, w.n, 2.6, this.v2), tg = s.at(b.e, b.n, 0.5, this.v3);
        while (n-- > 0) { const jx = (fx.R() - 0.5) * b.R * 0.02, jz = (fx.R() - 0.5) * b.R * 0.02, dx = tg.x - m.x, dy = tg.y - m.y, dz = tg.z - m.z, L = Math.hypot(dx, dy, dz) || 1; fx.mgFlash(m.x, m.y, m.z, dx / L, dy / L, dz / L, key === 'm2'); if (fx.R() < 0.25) fx.tracer(m.x, m.y, m.z, tg.x + jx, tg.y, tg.z + jz, Math.min(1.2, L / 850), 1, 0.25, 0.12, 0.1, 9, 6); fx.bulletStrike(tg.x + jx, tg.y - 0.3, tg.z + jz, key === 'm2' ? 1.3 : 0.8, L / 850); } }
      if (!G.alive && !w.dead) { w.dead = true; const p = s.at(w.e, w.n, 2, this.v2), F = G.fate || {}; fx.seed(G.e); fx.explosion(p.x, p.y, p.z, F.kind === 'catastrophic' ? 2.4 : 1.4, {}); fx.fire(p.x, p.y, p.z, F.fire ? Math.max(20, F.fire.t1 - F.fire.t0) : 60, F.kind === 'catastrophic' ? 1.6 : 1.1); s.blast(p, 1.6); this.emit('explosion', p, { size: 2 }); }
    }
    if (!S) return;
    // ---- artillery: each round as it lands
    for (const F of S.fires) for (const r of F.rounds) { if (!r.done || r._dr) continue; r._dr = true; if (t - r.t > 2.5) continue; const p = s.at(r.e, r.n, 0.3, this.v1), v = W.veg(r.e, r.n).cls;
      fx.seed(r.t * 3.1 + r.e); fx.explosion(p.x, p.y, p.z, 2.6, { surface: W.buildingAt && W.buildingAt(r.e, r.n, 2) ? 'wall' : v === 4 || v === 5 ? 'trees' : null }); fx.dustRing(p.x, p.y, p.z, 2.2, 16); s.blast(p, 2.2); s.marks.add(p.x, p.z, 4.2, hf, { kind: 1 }); fx.column(p.x, p.y, p.z, 14, 1.4); this.emit('explosion', p, { size: 2.6 }); }
    // ---- air strikes: the aircraft is over its aim point at k.tot, flying along k.hdg; seen from 22 s before to 16 s after
    for (const k of S.strikes) {
      let P = this.planes.get(k.id); const dtk = t - k.tot, on = dtk > -22 && dtk < 16 && !(k.state === 'lost' && t > k.release - 2);
      if (!on) { if (P) { P.g.visible = false; if (P.bomb) P.bomb.visible = false; } if (k.state === 'lost' && !k._dOff && t >= k.release - 2) { k._dOff = true; if (P && t - (k.release - 2) < 2) { const q = P.g.position; fx.seed(k.tot); fx.explosion(q.x, q.y, q.z, 2.2, {}); if (fx.breakup) fx.breakup(q.x, q.y, q.z, 0, -10, 0, 2); s.blast(q, 1.6, false); this.emit('air_off', q, { why: 'lost' }); } } continue; }
      if (!P) { P = { g: this._plane(), bomb: null, said: false }; this.planes.set(k.id, P); }
      const a = k.hdg * DEG, se = Math.sin(a), sn = Math.cos(a), ce = k.aim ? k.aim[0] : k.e, cn = k.aim ? k.aim[1] : k.n, lead = k.kind === 'gun' ? 260 : 0   /* a gun run fires from short of the target and pulls up over it */, d = dtk * k.v - lead;
      const pull = k.kind === 'gun' ? Math.max(0, dtk) * Math.max(0, dtk) * 6 : 0, wav = k.state === 'waved_off' ? Math.max(0, dtk + 6) * 14 : 0, pe = ce + se * d, pn = cn + sn * d, py = W.h(ce, cn) + k.alt + pull + wav;
      P.g.visible = true; I.aircraft++; P.g.position.set(pe, py, -pn); P.g.rotation.set(k.kind === 'gun' && dtk > 0 ? Math.min(0.5, dtk * 0.25) : k.kind === 'gun' ? -0.12 : 0, Math.PI - a + Math.PI, 0, 'YXZ');
      if (!P.said && dtk > -8) { P.said = true; this.emit('air_inbound', P.g.position, { kind: k.kind }); }
      if (k.state === 'waved_off' && !k._dOff && dtk > -2) { k._dOff = true; this.emit('air_off', P.g.position, { why: 'waved_off' }); }
      if (k.kind === 'bomb' && (k.state === 'attacking' || k.state === 'done') && t >= k.release && t < k.tot) { if (!P.bomb) { P.bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 8), this.bombMat); this.group.add(P.bomb); } const u = (t - k.release) / (k.tot - k.release), r0 = (k.release - k.tot) * k.v, be = ce + se * r0 * (1 - u), bn = cn + sn * r0 * (1 - u); P.bomb.visible = true; P.bomb.position.set(be, W.h(ce, cn) + k.alt * (1 - u * u) + 1, -bn); P.bomb.rotation.set(Math.PI / 2 - u * 1.2, Math.PI - a, 0, 'YXZ'); if (!k._d0) { k._d0 = true; this.emit('air_release', P.g.position, { kind: 'bomb' }); } }
      else if (P.bomb) P.bomb.visible = false;
      if (k.kind === 'gun' && k.state !== 'inbound' && !k._d0 && t >= k.release) { k._d0 = true; if (t - k.release < 2) this.emit('air_release', P.g.position, { kind: 'gun' }); }
      for (const im of k.impacts) { if (im._dr || t < im.t) continue; im._dr = true; if (t - im.t > 2.5) continue; const p = s.at(im.e, im.n, 0.3, this.v1); fx.seed(im.t * 7.3 + im.e);
        if (k.kind === 'gun') { const q = P.g.position; fx.tracer(q.x, q.y - 1, q.z, p.x, p.y, p.z, 0.25, 1, 0.8, 0.4, 0.3, 26, 8); fx.explosion(p.x, p.y, p.z, 0.8, {}); fx.dustRing(p.x, p.y, p.z, 0.9, 8); s.marks.add(p.x, p.z, 1.4, hf, { kind: 1 }); if (im === k.impacts[0] || im === k.impacts[7]) this.emit('air_impact', p, { kind: 'gun', size: 0.8 }); }
        else { fx.explosion(p.x, p.y, p.z, 3.4, {}); fx.dustRing(p.x, p.y, p.z, 3, 22); fx.column(p.x, p.y, p.z, 25, 2); s.blast(p, 3); s.marks.add(p.x, p.z, 6, hf, { kind: 1 }); this.emit('air_impact', p, { kind: 'bomb', size: 2.6 }); } }
    }
    // ---- the scout drone
    const D = S.scout;
    if (D) { if (!this.scoutMesh) this.scoutMesh = this._drone(1.6); const m = this.scoutMesh; if (D.alive) { m.visible = true; I.scout = true; s.at(D.e, D.n, D.alt, m.position); m.rotation.set(0, Math.PI - D.hdg * DEG, -0.18, 'YXZ'); m.userData.lost = false; }
      else if (m.visible && !m.userData.lost) { m.userData.lost = true; m.visible = false; const p = m.position; fx.seed(D.e); if (fx.breakup) fx.breakup(p.x, p.y, p.z, 0, -6, 0, 0.8); fx.flash(p.x, p.y, p.z, 0.8); } }
    // ---- bomber drones, HKOI's bursts at them, their bombs
    for (const fl of S.flights) {
      let m = this.drones.get(fl.id); const show = fl.phase !== 'gone' && !(fl.phase === 'down' && t >= fl.downAt) && (o.all || fl.tracked || fl.phase === 'over' || Math.hypot(fl.e - battle.tank.e, fl.n - battle.tank.n) < 700);
      if (show) { if (!m) { m = this._drone(3.2); this.drones.set(fl.id, m); } m.visible = true; I.bombers++; s.at(fl.e, fl.n, fl.alt, m.position); m.rotation.set(fl.phase === 'over' ? 0 : 0.2, Math.PI - fl.hdg * DEG, 0, 'YXZ'); } else if (m) m.visible = false;
      for (const sh of fl.shots || []) {
        if (!sh._d0 && t >= sh.t) { sh._d0 = true; if (t - sh.t < 1.5) { const tk = sh.from === 'wing' ? this.wingTank : o.tank, mz = (tk && tk.hkoiMuzzle && tk.hkoiMuzzle(this.v1, true)) || s.at(sh.from === 'wing' && G ? G.e : battle.tank.e, sh.from === 'wing' && G ? G.n : battle.tank.n, 3.1, this.v1), q = s.at(fl.e, fl.n, fl.alt, this.v2);
            fx.seed(sh.t); for (let k = 0; k < 4; k++) fx.tracer(mz.x, mz.y, mz.z, q.x + (fx.R() - 0.5) * 6, q.y + (fx.R() - 0.5) * 6, q.z + (fx.R() - 0.5) * 6, Math.max(0.1, sh.tof), 1, 0.85, 0.5, 0.16, 12, 7, k * 0.3); fx.muzzleBlast(mz.x, mz.y, mz.z, (q.x - mz.x) / 800, (q.y - mz.y) / 800, (q.z - mz.z) / 800, 0.5); this.emit('gun', mz, {}); } }
        if (!sh._d1 && t >= sh.t + sh.tof) { sh._d1 = true; if (t - sh.t - sh.tof < 1.5) { const q = s.at(fl.e, fl.n, fl.alt, this.v2); fx.seed(sh.t + 1); for (let k = 0; k < 4; k++) fx.airburst(q.x + (fx.R() - 0.5) * (sh.kill ? 8 : 22), q.y + (fx.R() - 0.5) * (sh.kill ? 6 : 16), q.z + (fx.R() - 0.5) * (sh.kill ? 8 : 22), 1, {}); this.emit('airburst', q, { size: 1 });
            if (sh.kill) { fx.explosion(q.x, q.y, q.z, 0.9, {}); if (fx.breakup) fx.breakup(q.x, q.y, q.z, 0, -4, 0, 1.4); s.blast(q, 0.8, false); this.emit('explosion', q, { size: 0.9 }); } } }
      }
    }
    for (const B of battle.bombs || []) { if (B._dr) continue; let m = this.bombMeshes.get(B);
      if (t >= B.t1) { B._dr = true; if (m) { this.group.remove(m); this.bombMeshes.delete(B); } if (t - B.t1 > 2.5) continue; const F = B.F, p = B.hit && F ? s.at(F.e, F.n, 2.5, this.v1) : s.at(B.e1, B.n1, 0.2, this.v1);
        fx.seed(B.t1); fx.explosion(p.x, p.y, p.z, B.hit ? 1.3 : 1.0, {}); if (B.hit && fx.vehicleHit) fx.vehicleHit(p.x, p.y, p.z, 0, 0, 1); else { fx.dustRing(p.x, p.y, p.z, 1, 9); s.marks.add(p.x, p.z, 1.6, hf, { kind: 1 }); } s.blast(p, 1.1, false); this.emit(B.hit ? 'hit' : 'explosion', p, { size: 1.2, killing: !!(B.report && B.report.killing) }); continue; }
      if (t < B.t0) continue; if (!m) { m = new THREE.Mesh(this.bombGeo, this.bombMat); m.userData.heat = 0.3; this.group.add(m); this.bombMeshes.set(B, m); }
      const u = (t - B.t0) / (B.t1 - B.t0), y0 = W.h(B.e0, B.n0) + B.alt, y1 = W.h(B.e1, B.n1) + (B.hit ? 2.4 : 0); m.position.set(B.e0 + (B.e1 - B.e0) * u, y0 + (y1 - y0) * u * u, -(B.n0 + (B.n1 - B.n0) * u)); I.bombs++; }
  }
}
