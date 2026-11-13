// Cameras: where the viewer stands. Each mode is a small function of the battle state; switching is instant, movement is smoothed.
import * as THREE from 'three';

const DEG = Math.PI / 180;
export const CAMERA_MODES = [
  { key: 'orbit', name: 'Orbit', hint: 'Drag to look around the vehicle, wheel to zoom' },
  { key: 'chase', name: 'Chase', hint: 'Behind the vehicle' },
  { key: 'cdr', name: 'Commander', hint: 'From the commander\'s hatch, facing the threat' },
  { key: 'top', name: 'Overhead', hint: 'Straight down, north up' },
  { key: 'enemy', name: 'Enemy sight', hint: 'Through an enemy launcher\'s optic (spectator)', spectator: true },
  { key: 'missile', name: 'Missile', hint: 'Riding the latest missile or drone (spectator)', spectator: true },
];

export class Cameras {
  constructor(scene3d) { this.s = scene3d; this.mode = 'orbit'; this.enemyIdx = 0; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.lastTank = null; this.fov = 50; this.topH = 700; this.cdrYaw = null; this.snap = true; }
  set(mode) { if (mode === 'enemy' && this.mode === 'enemy') this.enemyIdx++; this.mode = mode; this.snap = true; this.s.controls.enabled = mode === 'orbit'; }
  // ctx: { tank: {e,n,h}, units: [...], missiles: [{p: Vector3, dir}], threatBrg (deg or null) }
  update(dt, ctx) {
    const S = this.s, cam = S.camera, W = S.world, T = ctx.tank, tp = S.at(T.e, T.n, 0, new THREE.Vector3());
    if (this.mode === 'free') return;
    let fov = 50, k = this.snap ? 1 : 1 - Math.exp(-dt * 5);
    if (this.mode === 'orbit') {   // keep the orbit centred on the vehicle as it moves
      const tgt = tp.clone(); tgt.y += 2; if (this.lastTank) { const d = tgt.clone().sub(this.lastTank); cam.position.add(d); } S.controls.target.copy(tgt); this.lastTank = tgt;
      const g = W.h(cam.position.x, -cam.position.z) + 1.2; if (cam.position.y < g) cam.position.y = g;
      S.controls.update(); this.snap = false; if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return;
    }
    this.lastTank = null; const h = T.h * DEG;
    if (this.mode === 'chase') { const b = 17, e = T.e - Math.sin(h) * b, n = T.n - Math.cos(h) * b; this.pos.set(e, Math.max(W.h(e, n) + 2.5, tp.y + 6), -n); this.look.copy(tp); this.look.y += 2.2; fov = 55; }
    else if (this.mode === 'cdr') { let yaw = ctx.threatBrg != null ? ctx.threatBrg : T.h; if (this.cdrYaw == null || this.snap) this.cdrYaw = yaw; const d = ((yaw - this.cdrYaw + 540) % 360) - 180; this.cdrYaw = (this.cdrYaw + d * Math.min(1, dt * 2.2) + 360) % 360; const a = this.cdrYaw * DEG; this.pos.copy(tp); this.pos.y += 3.9; this.pos.x += Math.sin(a) * 1.2; this.pos.z -= Math.cos(a) * 1.2; this.look.set(tp.x + Math.sin(a) * 200, tp.y + 6, tp.z - Math.cos(a) * 200); fov = 62; k = 1; }
    else if (this.mode === 'top') { this.pos.set(tp.x, tp.y + this.topH, tp.z + 0.01); this.look.copy(tp); fov = 50; }
    else if (this.mode === 'enemy') { const us = ctx.units.filter(u => u.alive); if (!us.length) { this.set('orbit'); return; } const u = us[this.enemyIdx % us.length]; this.unit = u; S.at(u.e, u.n, u.spec.agl + 0.25, this.pos); this.look.copy(tp); this.look.y += 1.8; const R = this.pos.distanceTo(this.look); fov = Math.max(1.2, Math.min(30, Math.atan(14 / R) * 2 / DEG)); k = 1; }
    else if (this.mode === 'missile') { const m = ctx.missiles[ctx.missiles.length - 1]; if (!m) { if (this.snap) { this.pos.copy(tp).add(new THREE.Vector3(-40, 18, 40)); this.look.copy(tp); } k = this.snap ? 1 : 0; } else { this.pos.copy(m.p).addScaledVector(m.dir, -7); this.pos.y += 1.6; this.look.copy(tp); this.look.y += 2; fov = 70; k = 1 - Math.exp(-dt * 12); if (this.snap) k = 1; } }
    if (k > 0) { cam.position.lerp(this.pos, k); if (!this._l) this._l = this.look.clone(); this._l.lerp(this.look, this.snap ? 1 : Math.max(k, 1 - Math.exp(-dt * 8))); }
    if (this.mode === 'top') { cam.up.set(0, 0, -1); } else cam.up.set(0, 1, 0);
    cam.lookAt(this._l || this.look); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = this.snap ? fov : cam.fov + (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
    this.snap = false;
  }
}
