// Cameras: where the viewer stands. Each mode is a small function of the battle state; switching is instant, movement is smoothed.
import * as THREE from 'three';

const DEG = Math.PI / 180;
export const CAMERA_MODES = [
  { key: 'orbit', name: 'Orbit', hint: 'Drag to look around the vehicle, wheel to zoom' },
  { key: 'chase', name: 'Chase', hint: 'Behind the vehicle' },
  { key: 'cdr', name: 'Commander', hint: 'From the commander\'s hatch, facing the threat' },
  { key: 'gnr', name: 'Gunner sight', hint: 'Through the gunner\'s primary sight: watch the crew lay, range and fire' },
  { key: 'top', name: 'Overhead', hint: 'Straight down, north up' },
  { key: 'enemy', name: 'Enemy sight', hint: 'Through an enemy launcher\'s optic (spectator)', spectator: true },
  { key: 'missile', name: 'Missile', hint: 'Riding the latest missile or drone (spectator)', spectator: true },
  { key: 'close', name: 'Enemy close-up', hint: 'Up close to an enemy team: drag to look around it, wheel to zoom (spectator)', spectator: true },
];
// the two views that look at or through one chosen enemy team (they share the unit menu)
export const UNIT_VIEWS = { enemy: true, close: true };

export class Cameras {
  constructor(scene3d) { this.s = scene3d; this.mode = 'orbit'; this.unitId = 0; this.unit = null; this.closeId = -1; this.lastUnit = null; this.tankPos = null; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.lastTank = null; this.fov = 50; this.topH = 700; this.cdrYaw = null; this.snap = true; }
  set(mode) {
    const C = this.s.controls, was = this.mode; this.mode = mode; this.snap = true; C.enabled = mode === 'orbit' || mode === 'close';
    if (mode === 'close' && was !== 'close') { this.zoomWas = [C.minDistance, C.maxDistance]; C.minDistance = 2; C.maxDistance = 40; this.closeId = -1; this.lastUnit = null; }
    if (mode !== 'close' && was === 'close') { if (this.zoomWas) { C.minDistance = this.zoomWas[0]; C.maxDistance = this.zoomWas[1]; }   /* back from the close-up: give the orbit view its own zoom limits again and stand it next to the vehicle, not out at the enemy team */
      if (mode === 'orbit' && this.tankPos) { this.s.camera.up.set(0, 1, 0); this.s.camera.position.set(this.tankPos.x - 26, this.tankPos.y + 13, this.tankPos.z + 34); } }
  }
  // the enemy team the unit views show: the chosen one, or the first living team if that one is dead (null when none are left)
  pick(units) { const u = units[this.unitId]; if (u && u.alive) return u; for (const x of units) if (x.alive) return x; return null; }
  // step to the next (dir 1) or previous (dir -1) living team
  step(dir, units) { const n = units.length, cur = this.pick(units); if (!cur) return; for (let i = 1; i <= n; i++) { const u = units[(((cur.id + dir * i) % n) + n) % n]; if (u && u.alive) { this.unitId = u.id; return; } } }
  // ctx: { tank: {e,n,h}, units: [...], missiles: [{p: Vector3, dir}], threatBrg (deg or null) }
  update(dt, ctx) {
    const S = this.s, cam = S.camera, W = S.world, T = ctx.tank, tp = S.at(T.e, T.n, 0, new THREE.Vector3());
    this.tankPos = tp; if (this.mode === 'free') return;
    let fov = 50, k = this.snap ? 1 : 1 - Math.exp(-dt * 5);
    if (this.mode === 'orbit') {   // keep the orbit centred on the vehicle as it moves
      const tgt = tp.clone(); tgt.y += 2; if (this.lastTank) { const d = tgt.clone().sub(this.lastTank); cam.position.add(d); } S.controls.target.copy(tgt); this.lastTank = tgt;
      const g = W.h(cam.position.x, -cam.position.z) + 1.2; if (cam.position.y < g) cam.position.y = g;
      S.controls.update(); this.snap = false; if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return;
    }
    if (this.mode === 'close') {   // up close to the chosen enemy team: the same drag-and-zoom view as Orbit, centred on the team instead of the vehicle
      const u = this.pick(ctx.units); if (!u) { this.set('orbit'); return; } this.unit = u; this.lastTank = null;
      const tgt = S.at(u.e, u.n, 1.2, new THREE.Vector3());
      if (this.closeId !== u.id || !this.lastUnit) {   /* a new team: stand 6 m away on the side facing the vehicle, a little off the line of fire, 1.6 m above the ground */
        const a = Math.atan2(T.e - u.e, T.n - u.n) + 35 * DEG, e = u.e + Math.sin(a) * 6, n = u.n + Math.cos(a) * 6; cam.position.set(e, W.h(e, n) + 1.6, -n); cam.up.set(0, 1, 0); this.closeId = u.id; }
      else cam.position.add(tgt.clone().sub(this.lastUnit));
      S.controls.target.copy(tgt); this.lastUnit = tgt;
      const g = W.h(cam.position.x, -cam.position.z) + 0.5; if (cam.position.y < g) cam.position.y = g;
      S.controls.update();
      this.snap = false; if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return;
    }
    this.lastTank = null; const h = T.h * DEG;
    if (this.mode === 'chase') { const b = 17, e = T.e - Math.sin(h) * b, n = T.n - Math.cos(h) * b; this.pos.set(e, Math.max(W.h(e, n) + 2.5, tp.y + 6), -n); this.look.copy(tp); this.look.y += 2.2; fov = 55; }
    else if (this.mode === 'cdr') { let yaw = ctx.threatBrg != null ? ctx.threatBrg : T.h; if (this.cdrYaw == null || this.snap) this.cdrYaw = yaw; const d = ((yaw - this.cdrYaw + 540) % 360) - 180; this.cdrYaw = (this.cdrYaw + d * Math.min(1, dt * 2.2) + 360) % 360; const a = this.cdrYaw * DEG; this.pos.copy(tp); this.pos.y += 3.9; this.pos.x += Math.sin(a) * 1.2; this.pos.z -= Math.cos(a) * 1.2; this.look.set(tp.x + Math.sin(a) * 200, tp.y + 6, tp.z - Math.cos(a) * 200); fov = 62; k = 1; }
    else if (this.mode === 'gnr') {   // the sight follows what the gunner is laid on: the main-gun target, else the nearest threat, else straight ahead
      const tgt = ctx.aim, want = tgt ? Math.atan2(tgt.e - T.e, tgt.n - T.n) / DEG : ctx.threatBrg != null ? ctx.threatBrg : T.h; if (this.gYaw == null || this.snap) this.gYaw = want;
      const d = ((want - this.gYaw + 540) % 360) - 180; this.gYaw = (this.gYaw + Math.max(-40 * dt, Math.min(40 * dt, d)) + 360) % 360;   // turret traverse, 40 degrees a second
      const a = this.gYaw * DEG; this.pos.copy(tp); this.pos.y += 2.75; this.pos.x += Math.sin(a) * 1.6 + Math.cos(a) * 0.7; this.pos.z += -Math.cos(a) * 1.6 + Math.sin(a) * 0.7;
      const R = tgt ? Math.hypot(tgt.e - T.e, tgt.n - T.n) : 1500, ty = tgt ? W.h(tgt.e, tgt.n) + 1 : this.pos.y - 8; this.look.set(tp.x + Math.sin(a) * R, ty, tp.z - Math.cos(a) * R);
      this.onTarget = Math.abs(d) < 0.6; fov = tgt && Math.abs(d) < 8 ? 6.5 : 21; k = 1; }
    else if (this.mode === 'top') { this.pos.set(tp.x, tp.y + this.topH, tp.z + 0.01); this.look.copy(tp); fov = 50; }
    else if (this.mode === 'enemy') { const u = this.pick(ctx.units); if (!u) { this.set('orbit'); return; } this.unit = u; S.at(u.e, u.n, u.spec.agl + 0.25, this.pos); this.look.copy(tp); this.look.y += 1.8; const R = this.pos.distanceTo(this.look); fov = Math.max(1.2, Math.min(30, Math.atan(14 / R) * 2 / DEG)); k = 1; }
    else if (this.mode === 'missile') { const m = ctx.missiles[ctx.missiles.length - 1]; if (!m) { if (this.snap) { this.pos.copy(tp).add(new THREE.Vector3(-40, 18, 40)); this.look.copy(tp); } k = this.snap ? 1 : 0; } else { this.pos.copy(m.p).addScaledVector(m.dir, -7); this.pos.y += 1.6; this.look.copy(tp); this.look.y += 2; fov = 70; k = 1 - Math.exp(-dt * 12); if (this.snap) k = 1; } }
    if (k > 0) { cam.position.lerp(this.pos, k); if (!this._l) this._l = this.look.clone(); this._l.lerp(this.look, this.snap ? 1 : Math.max(k, 1 - Math.exp(-dt * 8))); }
    if (this.mode === 'top') { cam.up.set(0, 0, -1); } else cam.up.set(0, 1, 0);
    cam.lookAt(this._l || this.look); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = this.snap ? fov : cam.fov + (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
    this.snap = false;
  }
}
