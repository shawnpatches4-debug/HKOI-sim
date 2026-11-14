// Cameras: where the viewer stands. Each mode is a small function of the battle state; switching is instant, movement is smoothed.
import * as THREE from 'three';

const DEG = Math.PI / 180;
export const CAMERA_MODES = [
  { key: 'orbit', name: 'Orbit', hint: 'Drag to look around the vehicle, wheel to zoom' },
  { key: 'chase', name: 'Chase', hint: 'Behind the vehicle' },
  { key: 'cdr', name: 'Commander', hint: 'From the commander\'s hatch, facing the threat' },
  { key: 'gnr', name: 'Gunner sight', hint: 'Through the gunner\'s primary sight: watch the crew lay, range and fire' },
  { key: 'citv', name: 'CITV', hint: 'Commander\'s independent thermal viewer: sweeps for the enemy, stops on what he finds', sensor: true },
  { key: 'hkoi', name: 'HKOI sight', hint: 'Through the HKOI station\'s own sensor: follows what it tracks and fires at', sensor: true },
  { key: 'drv', name: 'Driver', hint: 'Through the driver\'s vision blocks' },
  { key: 'ldr', name: 'Loader', hint: 'Head out on the loader\'s side of the turret roof' },
  { key: 'top', name: 'Overhead', hint: 'Straight down, north up' },
  { key: 'enemy', name: 'Enemy sight', hint: 'Through an enemy launcher\'s optic (spectator)', spectator: true },
  { key: 'troops', name: 'Enemy close-up', hint: 'Beside an enemy team: drag to look around them, wheel to zoom (spectator)', spectator: true },
  { key: 'fly', name: 'Free look', hint: 'Fly anywhere: W A S D to move, Q and E down and up, drag to look, hold Shift to go faster' },
  { key: 'missile', name: 'Missile', hint: 'Riding the latest missile or drone (spectator)', spectator: true },
];

// Enemy sights. Magnification and true field of view (degrees across the round picture) of the optic each team looks through.
// ASSUMPTIONS from open sources: Kornet 1P45M-1 12x / 5 deg; Konkurs 9Sh119M1 10x / 5 deg; RPG-7 PGO-7V 2.7x / 13 deg;
// laser designator of the LPR-1 kind 7x / 6.7 deg; FPV crews have no weapon sight, so they get an 8x30 binocular (8.5 deg).
export const ENEMY_SIGHTS = {
  kornet: { name: '1P45M-1', mag: 12, fov: 5 }, saclos: { name: '9Sh119M1', mag: 10, fov: 5 }, rpg: { name: 'PGO-7V', mag: 2.7, fov: 13 },
  sal: { name: 'LPR-1', mag: 7, fov: 6.7 }, fpv: { name: 'B8x30 binocular', mag: 8, fov: 8.5 }, fpv_fiber: { name: 'B8x30 binocular', mag: 8, fov: 8.5 },
};
export const SIGHT_RING = 0.82;   // the round picture is this fraction of the shorter side of the window (same number as in the page's CSS)

export class Cameras {
  constructor(scene3d) { this.s = scene3d; this.mode = 'orbit'; this.enemyId = null; this.unit = null; this.sightUp = false; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.lastTank = null; this.fov = 50; this.topH = 700; this._d = new THREE.Vector3(); this.keys = {}; this.flyYaw = 0; this.flyPitch = -0.15; this.citvYaw = null; this.citvDir = 1;
    // free look: keys held, and dragging on the picture turns the view
    const cv = scene3d.canvas; let drag = null; addEventListener('keydown', e => { this.keys[e.code] = true; }); addEventListener('keyup', e => { this.keys[e.code] = false; }); addEventListener('blur', () => { this.keys = {}; });
    cv.addEventListener('pointerdown', e => { if (this.mode === 'fly') { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); } }); cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('pointermove', e => { if (!drag || this.mode !== 'fly') return; this.flyYaw += (e.clientX - drag[0]) * 0.004; this.flyPitch = Math.max(-1.5, Math.min(1.5, this.flyPitch - (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY]; }); this.cdrYaw = null; this.snap = true; }
  set(mode) { if (mode === 'fly' && this.mode !== 'fly') { const c = this.s.camera, d = c.getWorldDirection(new THREE.Vector3()); this.flyYaw = Math.atan2(d.x, -d.z); this.flyPitch = Math.asin(Math.max(-1, Math.min(1, d.y))); } this.mode = mode; this.snap = true; this.s.controls.enabled = mode === 'orbit' || mode === 'troops'; this.s.controls.minDistance = mode === 'troops' ? 1.5 : 4; if (mode !== 'enemy' && mode !== 'troops') this.unit = null; }
  // which enemy team the enemy views follow: the chosen one while it lives, otherwise the first team still alive
  pick(units) { let u = units.find(x => x.id === this.enemyId && x.alive && !x.gone); if (!u) { u = units.find(x => x.alive && !x.gone) || null; this.enemyId = u ? u.id : null; } return u; }
  choose(u) { if (u && u.id !== this.enemyId) { this.enemyId = u.id; this.snap = true; } }
  cycle(units, step) { const a = units.filter(x => x.alive); if (!a.length) return; const i = a.findIndex(x => x.id === this.enemyId); this.choose(a[(i + step + a.length) % a.length]); }
  // ctx: { tank: {e,n,h}, units: [...], missiles: [{p: Vector3, dir}], threatBrg (deg or null) }
  update(dt, ctx) {
    const S = this.s, cam = S.camera, W = S.world, T = ctx.tank, tp = S.at(T.e, T.n, 0, new THREE.Vector3());
    if (this.mode === 'free') return;
    if (this.mode === 'fly') {   // fly anywhere: the view turns with the drag, the keys move along it; never below the ground
      const K = this.keys, sp = (K.ShiftLeft || K.ShiftRight ? 120 : 25) * dt, cy = Math.cos(this.flyYaw), sy = Math.sin(this.flyYaw), cp = Math.cos(this.flyPitch), f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), r = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), u = (K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0);
      cam.position.x += (sy * cp * f + cy * r) * sp; cam.position.z += (-cy * cp * f + sy * r) * sp; cam.position.y += (Math.sin(this.flyPitch) * f + u) * sp; const g = W.h(cam.position.x, -cam.position.z) + 0.6; if (cam.position.y < g) cam.position.y = g;
      cam.up.set(0, 1, 0); this.look.set(cam.position.x + sy * cp, cam.position.y + Math.sin(this.flyPitch), cam.position.z - cy * cp); cam.lookAt(this.look); if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); } this.snap = false; this.lastTank = null; return; }
    let fov = 50, k = this.snap ? 1 : 1 - Math.exp(-dt * 5);
    if (this.mode === 'troops') {   // beside an enemy team, looking past them toward the vehicle; the viewer can drag around them like the orbit view
      const u = this.pick(ctx.units); if (!u) { this.set('orbit'); return; } this.unit = u; this.lastTank = null;
      const tgt = ctx.unitPos(u).clone(); tgt.y += 1.0;
      if (this.snap || !this.lastUnit) { const de = u.e - T.e, dn = u.n - T.n, R = Math.hypot(de, dn) || 1, ue = de / R, un = dn / R, e = u.e + ue * 5.5 + un * 3.2, n = u.n + un * 5.5 - ue * 3.2; cam.position.set(e, 0, -n); cam.position.y = Math.max(W.h(e, n) + 1.2, tgt.y + 1.1); }
      else cam.position.add(this._d.copy(tgt).sub(this.lastUnit));
      (this.lastUnit || (this.lastUnit = new THREE.Vector3())).copy(tgt); S.controls.target.copy(tgt);
      S.controls.update(); const g = W.h(cam.position.x, -cam.position.z) + 0.4; if (cam.position.y < g) cam.position.y = g;
      cam.up.set(0, 1, 0); this.snap = false; if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return;
    }
    this.lastUnit = null;
    if (this.mode === 'orbit') {   // keep the orbit centred on the vehicle as it moves
      const tgt = tp.clone(); tgt.y += 2; if (this.lastTank) { const d = tgt.clone().sub(this.lastTank); cam.position.add(d); } S.controls.target.copy(tgt); this.lastTank = tgt;
      const g = W.h(cam.position.x, -cam.position.z) + 1.2; if (cam.position.y < g) cam.position.y = g;
      S.controls.update(); this.snap = false; if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return;
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
    else if (this.mode === 'citv') {   // the commander's viewer on the turret roof: sweeps all round on its own, and stops on a located team (ctx.cdrLook) when there is one
      const tgt = ctx.cdrLook; if (this.citvYaw == null || this.snap) this.citvYaw = ctx.threatBrg != null ? ctx.threatBrg : (ctx.turret != null ? ctx.turret : T.h);
      if (tgt) { const want = Math.atan2(tgt.e - T.e, tgt.n - T.n) / DEG, d = ((want - this.citvYaw + 540) % 360) - 180; this.citvYaw = (this.citvYaw + Math.max(-60 * dt, Math.min(60 * dt, d)) + 360) % 360; this.citvOn = Math.abs(d) < 1; }
      else { this.citvYaw = (this.citvYaw + 12 * dt + 360) % 360; this.citvOn = false; }   /* a slow sweep, twelve degrees a second */
      const a = this.citvYaw * DEG, R = tgt ? Math.hypot(tgt.e - T.e, tgt.n - T.n) : 1200; this.pos.copy(tp); this.pos.y += 3.35; this.pos.x += Math.sin(a) * 0.4; this.pos.z -= Math.cos(a) * 0.4;
      this.look.set(tp.x + Math.sin(a) * R, tgt ? W.h(tgt.e, tgt.n) + 1 : this.pos.y - 14, tp.z - Math.cos(a) * R); fov = tgt && this.citvOn ? 3.4 : 13; k = 1; }
    else if (this.mode === 'hkoi') {   // the HKOI station's sensor: on the point it is laying on or the missile it tracks; otherwise it rests along the turret
      const m = ctx.missiles.filter(x => x.cued).sort((p, q) => p.range - q.range)[0], aim = ctx.hkoiAim || (m && m.p) || null; const rest = (ctx.turret != null ? ctx.turret : T.h) * DEG;
      this.pos.copy(ctx.hkoiAt || tp); if (!ctx.hkoiAt) this.pos.y += 3.3; else this.pos.y += 0.35;
      if (aim) this.look.copy(aim); else this.look.set(this.pos.x + Math.sin(rest) * 800, this.pos.y - 6, this.pos.z - Math.cos(rest) * 800);
      this.hkoiTrack = !!aim; fov = aim ? 4 : 14; k = 1; }
    else if (this.mode === 'drv') { this.pos.copy(tp); this.pos.y += 1.45; this.pos.x += Math.sin(h) * 2.6; this.pos.z -= Math.cos(h) * 2.6; this.look.set(tp.x + Math.sin(h) * 80, tp.y + 0.6, tp.z - Math.cos(h) * 80); fov = 62; k = 1; }
    else if (this.mode === 'ldr') {   // head out of the loader's hatch, left of the turret roof, looking where his gun looks or out over the left front
      const tb = (ctx.turret != null ? ctx.turret : T.h) * DEG, tgt = ctx.ldrLook; this.pos.copy(tp); this.pos.y += 3.25; this.pos.x += -Math.cos(tb) * 0.75 + Math.sin(tb) * 0.2; this.pos.z += -Math.sin(tb) * 0.75 - Math.cos(tb) * 0.2;
      const a = tgt ? Math.atan2(tgt.e - T.e, tgt.n - T.n) : tb - 0.6; this.look.set(tp.x + Math.sin(a) * 200, tp.y + 2.2, tp.z - Math.cos(a) * 200); fov = 66; k = this.snap ? 1 : 1 - Math.exp(-dt * 6); this.pos.y += 0; }
    else if (this.mode === 'top') { this.pos.set(tp.x, tp.y + this.topH, tp.z + 0.01); this.look.copy(tp); fov = 50; }
    else if (this.mode === 'enemy') {   // through the team's own optic at its true magnification; on the move nobody is at the sight, so a plain view along the way they walk
      const u = this.pick(ctx.units); if (!u) { this.set('orbit'); return; } this.unit = u; const moving = u.state === 'moving'; this.sightUp = !moving; this.pos.copy(ctx.unitPos(u));
      if (moving) { const a = (u.hdg || 0) * DEG; this.pos.y += 1.65; this.look.set(this.pos.x + Math.sin(a) * 60, this.pos.y - 3, this.pos.z - Math.cos(a) * 60); fov = 55; k = this.snap ? 1 : 1 - Math.exp(-dt * 6); }
      else { this.pos.y += u.spec.agl + 0.25; this.look.copy(tp); this.look.y += 1.8; const sg = ENEMY_SIGHTS[u.spec.key] || ENEMY_SIGHTS.fpv; fov = 2 * Math.atan(Math.tan(sg.fov * DEG / 2) / (SIGHT_RING * Math.min(1, cam.aspect))) / DEG; k = 1; } }
    else if (this.mode === 'missile') { const m = ctx.missiles[ctx.missiles.length - 1]; if (!m) { if (this.snap) { this.pos.copy(tp).add(new THREE.Vector3(-40, 18, 40)); this.look.copy(tp); } k = this.snap ? 1 : 0; } else { this.pos.copy(m.p).addScaledVector(m.dir, -7); this.pos.y += 1.6; this.look.copy(tp); this.look.y += 2; fov = 70; k = 1 - Math.exp(-dt * 12); if (this.snap) k = 1; } }
    if (k > 0) { cam.position.lerp(this.pos, k); if (!this._l) this._l = this.look.clone(); this._l.lerp(this.look, this.snap ? 1 : Math.max(k, 1 - Math.exp(-dt * 8))); }
    if (this.mode === 'top') { cam.up.set(0, 0, -1); } else cam.up.set(0, 1, 0);
    cam.lookAt(this._l || this.look); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = this.snap ? fov : cam.fov + (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
    this.snap = false;
  }
}
