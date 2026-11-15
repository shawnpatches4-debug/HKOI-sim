// HKOI Battlefield: what kills the M1, drawn from outside. Reads battle.tank.fate (src/battle/fate.js: its DATA CONTRACT is the only
// thing relied on) and draws it on the battle clock, so a replay or a rewind shows the same:
//   blowout { t0, t1 }  the two ammunition blow-out panels of the turret bustle fly off and twin jets of flame stand on the bustle roof
//   fire { t0, t1, where: engine | hull | crew | bustle | all }  flames and smoke from the right place, then a thinning smoke column
//   kind 'catastrophic'  the first second: a blast out of every opening
//   mobility 'killed'    dark smoke from the engine deck; a track run off its sprocket and laid out behind, if a hit's parts list names a track
//   firepower 'killed'   grey smoke at the gun mantlet (the gun and turret are one piece of the model: it cannot be shown drooped)
// Without battle.tank.fate nothing here runs and the vehicle keeps today's fire and smoke. Particles go through the public calls of
// scene.fx only (burn, fireball, sparks, puff, flash, column). One point light, made at start with no brightness, flickers with the jets.
// The men bailing out are acted by the crew figures: src/render/interior.js _bailOut.
import * as THREE from 'three';
// MEASURED on the turret model (tests/interior/roof_survey.json): the raised plate x -0.775 to 0.775, z -2.125 to -0.975, top 0.65
// above the turret's turning point. Taken as two panels side by side (the real vehicle's bustle roof has two), ASSUMED split on the centre line.
const PANEL = [{ x: 0.39, z: -1.55, w: 0.755, l: 1.13, s: 1 }, { x: -0.39, z: -1.55, w: 0.755, l: 1.13, s: -1 }], PY = 0.655, G = 9.81;
// ASSUMED flight of a panel: thrown up at 13 m/s and outward at 2 to 3 m/s, tumbling; it comes down after about 2.7 s and lies where it fell
const FLY = [{ up: 13.2, out: 2.6, back: 1.1, wx: 5.3, wz: 3.1, yaw: 0.6 }, { up: 12.4, out: 3.1, back: 2.0, wx: -4.4, wz: -3.7, yaw: -0.9 }];
export class TankFate {
  constructor(scene3d, tankView) {
    this.s = scene3d; this.tank = tankView; this.built = false; this.acc = 0; this.last = null; this.done = {};
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this.light = new THREE.PointLight('#ff9838', 0, 45, 1.6); this.light.visible = true; scene3d.scene.add(this.light);   /* there from the start (brightness 0), so no material is rebuilt at the moment of the hit */
  }
  _build() {
    const tk = this.tank; if (!tk.turret) return false; this.built = true; const paint = new THREE.MeshStandardMaterial({ color: '#4a4e3b', roughness: 0.8, metalness: 0.2 }), black = new THREE.MeshBasicMaterial({ color: '#050403' });
    const flame = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.root = new THREE.Group(); this.root.name = 'tank-fate'; this.s.scene.add(this.root); this.onTur = new THREE.Group(); tk.turret.add(this.onTur); this.panels = []; this.jets = [];
    const jetGeo = new THREE.CylinderGeometry(0.07, 0.34, 1, 14, 4, true); jetGeo.translate(0, 0.5, 0); { const p = jetGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.35 * Math.sin(y * 3.1) * (1 - y); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k * 1.5); } }   /* a tongue: wide along the opening, drawn in at the top */
    for (let i = 0; i < 2; i++) { const P = PANEL[i], pan = new THREE.Mesh(new THREE.BoxGeometry(P.w, 0.035, P.l), paint); pan.castShadow = true; pan.visible = false; this.root.add(pan); this.panels.push(pan);
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.l), black); hole.rotation.x = -Math.PI / 2; hole.position.set(P.x, PY + 0.006, P.z); this.onTur.add(hole);
      const outer = new THREE.Mesh(jetGeo, flame('#ff7a1c', 0.5)), inner = new THREE.Mesh(jetGeo, flame('#ffe6a0', 0.75)); for (const j of [outer, inner]) { j.position.set(P.x, PY, P.z); j.renderOrder = 5; this.onTur.add(j); } this.jets.push({ outer, inner, ph: i * 1.7 }); }
    // a thrown track: a strip of links laid out on the ground behind the sprocket (made once, shown on the side that was hit)
    { const g = new THREE.Group(), link = new THREE.BoxGeometry(0.62, 0.07, 0.15), mat = new THREE.MeshStandardMaterial({ color: '#2b2a27', roughness: 0.9, metalness: 0.3 }); for (let k = 0; k < 26; k++) { const m = new THREE.Mesh(link, mat); m.position.set(0.1 * Math.sin(k * 0.45), 0.04, -k * 0.165); m.rotation.y = 0.12 * Math.cos(k * 0.45); m.castShadow = true; g.add(m); } g.visible = false; this.track = g; this.root.add(g); }
    this.onTur.visible = false; return true;
  }
  // now: the battle time being shown; dt: battle seconds since the last frame (0 while paused)
  update(B, now, dt) {
    const F = B && B.tank && B.tank.fate, tk = this.tank; if (!F || !tk.turret) { if (this.built && this.onTur.visible) this._reset(); return; }
    if (!this.built && !this._build()) return; if (this.last != null && now < this.last - 1e-6) this.done = {}; this.last = now;   /* a rewind: one-off bursts may happen again */
    const fx = this.s.fx, W = this.s.world, tur = tk.turret; tur.updateWorldMatrix(true, false); const once = (k, t) => { if (now >= t && now < t + 1.5 && !this.done[k]) { this.done[k] = true; return true; } if (now < t) this.done[k] = false; return false; };
    const at = (x, y, z, o) => o.set(x, y, z).applyMatrix4(tur.matrixWorld), hullAt = (x, y, z, o) => o.set(x, y, z).applyMatrix4(tk.group.matrixWorld);
    this.acc += dt; const tick = this.acc >= 0.1; if (tick) this.acc = Math.min(this.acc - 0.1, 0.1);   /* particle bursts ten times a battle second, however fast the frames come */
    // ---- blow-out panels and the jets
    const bo = F.blowout, on = !!(bo && now >= bo.t0); this.onTur.visible = on; let glow = 0;
    for (let i = 0; i < 2; i++) { const pan = this.panels[i], P = PANEL[i], f = FLY[i]; pan.visible = on; if (!on) continue; const t = now - bo.t0, p0 = at(P.x, PY + 0.02, P.z, this._a);
      // straight up in the world, outward and back in the turret's own directions
      const ox = this._b.set(P.s, 0, 0).transformDirection(tur.matrixWorld), oxx = ox.x, oxz = ox.z; ox.set(0, 0, -1).transformDirection(tur.matrixWorld); const gx = p0.x + (oxx * f.out + ox.x * f.back) * t, gz = p0.z + (oxz * f.out + ox.z * f.back) * t, gy = W.h(gx, -gz) + 0.04, y = p0.y + f.up * t - 0.5 * G * t * t;
      if (y > gy) { pan.position.set(gx, y, gz); this._e.set(f.wx * t, tk.group.rotation.y + f.yaw * t, f.wz * t); pan.quaternion.setFromEuler(this._e); }
      else { const tl = (f.up + Math.sqrt(f.up * f.up + 2 * G * Math.max(0, p0.y - gy))) / G, lx = p0.x + (oxx * f.out + ox.x * f.back) * tl, lz = p0.z + (oxz * f.out + ox.z * f.back) * tl; pan.position.set(lx, W.h(lx, -lz) + 0.04, lz); this._e.set(0.05 * P.s, tk.group.rotation.y + f.yaw * tl, 0.03); pan.quaternion.setFromEuler(this._e); if (once('land' + i, bo.t0 + tl)) fx.dust(lx, pan.position.y, lz, 0.8); }
      // the jet: up in 0.15 s, full for most of the burn, dying over the last 3 s (15 s for a catastrophic burn); it wavers
      const J = this.jets[i], tail = F.kind === 'catastrophic' ? 15 : 3, env = Math.max(0, Math.min(1, t / 0.15, (bo.t1 - now) / tail)), wav = 0.82 + 0.12 * Math.sin(now * 23 + J.ph) + 0.08 * Math.sin(now * 61 + J.ph * 2), H = (F.kind === 'catastrophic' ? 6.5 : 5) * env * wav;
      J.outer.visible = J.inner.visible = env > 0.01; J.outer.scale.set(1 + 0.25 * env, Math.max(0.01, H), 1); J.inner.scale.set(0.55, Math.max(0.01, H * 0.72), 0.6); J.outer.rotation.z = 0.05 * Math.sin(now * 7 + J.ph); J.inner.rotation.z = J.outer.rotation.z; glow = Math.max(glow, env * wav);
      if (env > 0.02 && tick) { const m = at(P.x, PY + 0.3, P.z, this._b); fx.fireball(m.x, m.y, m.z, 0.55 * env, 3, 7, 1.1, [0.09, 0.085, 0.08], 0.45, 9); if (i === 0) fx.sparks(m.x, m.y + 0.5, m.z, 0, 1, 0, 5, 16, 0.5, 1.1); }
      if (once('pop' + i, bo.t0)) { const m = at(P.x, PY + 0.4, P.z, this._b); fx.flash(m.x, m.y + 1, m.z, 2.2); fx.fireball(m.x, m.y, m.z, 1.5, 14, 16, 2.2, [0.08, 0.08, 0.08], 0.5, 12); fx.sparks(m.x, m.y, m.z, 0, 1, 0, 40, 26, 0.7, 1.6); } }
    { const L = this.light; if (glow > 0.01) { at(0, PY + 2.2, -1.55, L.position); L.intensity = 260 * glow; } else if (L.intensity) L.intensity = 0; }
    // ---- fire and smoke from the right place
    const fr = F.fire; if (fr && now >= fr.t0) { const burning = now <= fr.t1, w = fr.where, left = fr.t1 - now, k = burning ? Math.max(0.3, Math.min(1, left / 20)) : 0, p = this._b;
      if (burning && dt > 0) { if (w === 'engine' || w === 'all') { hullAt(0, 1.55, -2.9, p); fx.burn(p.x, p.y, p.z, dt, 0.8 * k); } if (w === 'hull' || w === 'all') { hullAt(1.2, 1.3, 0.2, p); fx.burn(p.x, p.y, p.z, dt * 0.6, 0.7 * k); }
        if (w === 'crew' || w === 'all') { at(-0.52, 0.95, -0.36, p); fx.burn(p.x, p.y, p.z, dt * (w === 'all' ? 0.8 : 0.35), (w === 'all' ? 0.55 : 0.3) * k); at(0.77, 0.75, -0.62, p); fx.burn(p.x, p.y, p.z, dt * (w === 'all' ? 0.7 : 0.25), (w === 'all' ? 0.5 : 0.25) * k); } }
      if (!burning && once('after', fr.t1)) { hullAt(0, 1.6, w === 'engine' ? -2.9 : -0.3, p); fx.column(p.x, p.y, p.z, 150, 0.6); } }   /* burnt out: a thinning column for another two and a half minutes */
    if (F.kind === 'catastrophic' && F.t != null && once('cat', F.t)) { const p = at(0, 0.4, 0, this._b); fx.flash(p.x, p.y + 1.5, p.z, 4); fx.explosion(p.x, p.y + 0.6, p.z, 2.4); for (const [x, y, z] of [[-0.52, 0.95, -0.36], [0.77, 0.75, -0.62]]) { at(x, y, z, p); fx.fireball(p.x, p.y, p.z, 1.3, 18, 20, 2.6, [0.07, 0.07, 0.07], 0.55, 14); fx.sparks(p.x, p.y, p.z, 0, 1, 0, 60, 30, 0.8, 2); } hullAt(0, 1.2, 3.0, p); fx.fireball(p.x, p.y, p.z, 1.0, 10, 14, 2.0, [0.07, 0.07, 0.07], 0.5, 6); }
    // ---- mobility and firepower kills on a living tank
    if (F.mobility === 'killed' && B.tank.alive && dt > 0 && tick) { const p = hullAt(0.3, 1.5, -2.9, this._b); fx.puff(p.x, p.y, p.z, 0.3, 2.2, -0.4, 7, 0.9, 5.5, 0.07, 0.07, 0.07, 0.6, 0.5, 0.35); }
    if (F.firepower === 'killed' && F.gunOut && B.tank.alive && dt > 0 && tick && F.t != null && now < F.t + 45) { const p = at(-0.1, 0.35, 1.9, this._b); fx.puff(p.x, p.y, p.z, 0.2, 1.1, 0.2, 4, 0.4, 2.4, 0.35, 0.35, 0.34, 0.4, 0.6, 0.3); }
    { let side = 0; if (F.hits) for (const h of F.hits) if (h.t <= now && h.comps) for (const c of h.comps) { if (c === 'track_l') side = 1; else if (c === 'track_r') side = -1; }
      const T = this.track; T.visible = side !== 0 && F.mobility !== 'ok'; if (T.visible) { const p = hullAt(side * (tk.gauge || 1.38), 0, -3.3, this._a); T.position.set(p.x, W.h(p.x, -p.z), p.z); T.rotation.y = tk.group.rotation.y + side * 0.08; for (const tr of tk.tracks || []) if (tr.side === side) tr.mesh.visible = false; } else if (this._hid) for (const tr of tk.tracks || []) tr.mesh.visible = true; this._hid = T.visible; }
  }
  _reset() { this.onTur.visible = false; for (const p of this.panels) p.visible = false; this.track.visible = false; this.light.intensity = 0; if (this._hid) { for (const tr of this.tank.tracks || []) tr.mesh.visible = true; this._hid = false; } this.done = {}; }
}
