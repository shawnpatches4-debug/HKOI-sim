// Draws what the engine decided for the current volley: missiles flying from their launchers, HKOI's rounds and clouds,
// Trophy firing, impacts. Positions come from the battle (true map positions); timings and outcomes from the engine's record.
import * as THREE from 'three';
import { missileMesh } from './units.js';

const DEG = Math.PI / 180, lerp = (a, b, t) => a + (b - a) * t;

export class VolleyView {
  constructor(scene3d, battle, particles) { this.s = scene3d; this.b = battle; this.fx = particles; this.live = new Map(); this.info = []; this.emit = () => {}; this.seen = new Set(); this.tracers = []; this.group = new THREE.Group(); scene3d.scene.add(this.group); this.tmp = new THREE.Vector3(); this.lastT = 0;
    this.tracerGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5); this.tracerGeo.rotateX(Math.PI / 2); this.tracerMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' }); }
  // where a missile of volley v is at volley time tv: along the line from its launcher to where the vehicle is now, at the range the engine gives
  pos(v, th, l, tv, out) {
    const HKe = window.HK, T = this.b.tankAt(v.t0 + tv), W = this.b.world, tt = HKe.THREATS[th.key], x = Math.max(0, HKe.distAt(th, Math.min(tv, th.viz.end.t))), f = 1 - x / th.R;
    const e = lerp(l.u0.e, T.e, f), n = lerp(l.u0.n, T.n, f), drone = tt.guidance === 'drone', h0 = W.h(l.u0.e, l.u0.n) + 1.3, h1 = W.h(T.e, T.n) + 2.0;
    let y = lerp(h0, h1, f); if (drone) y = Math.max(y, W.h(e, n) + 3) + Math.sin(Math.PI * Math.min(1, f * 1.1)) * 34; else y = Math.max(y + Math.sin(Math.PI * f) * Math.min(12, th.R * 0.004), W.h(e, n) + 1.0);
    const end = th.viz.end; if (end.type === 'ground' && tv >= end.t - 0.6) y = lerp(y, W.h(e, n), Math.min(1, (tv - (end.t - 0.6)) / 0.6));
    return out.set(e, y, -n); }
  dispose() { this.s.scene.remove(this.group); }
  update(t, dt) {
    this.info.length = 0;
    const B = this.b, HKe = window.HK, v = B.volleys.length ? B.volleys[B.volleys.length - 1] : null; if (!v) return;
    const tv = t - v.t0, rec = v.rec, fx = this.fx, W = B.world;
    for (const l of v.launches) if (!l.u0) l.u0 = { e: l.u.e, n: l.u.n };   // remember where each launcher stood when it fired
    rec.threats.forEach((th, i) => { const l = v.launches.find(q => q.u.id === th.uid) || v.launches[i], key = v.i + ':' + th.idx, tt = HKe.THREATS[th.key], drone = tt.guidance === 'drone', end = th.viz.end; if (!l) return;
      if (tv >= th.t0 && tv < end.t) { let m = this.live.get(key); if (!m) { m = missileMesh(drone, this.assetBase); this.group.add(m); this.live.set(key, m); if (!drone) { const p = this.pos(v, th, l, th.t0, this.tmp), T0 = B.tankAt(v.t0 + th.t0), dx = T0.e - l.u0.e, dn = T0.n - l.u0.n, dd = Math.hypot(dx, dn) || 1; fx.backblast(p.x, p.y, p.z, dx / dd, -dn / dd, tt.guidance === 'unguided' ? 0.7 : 1.2); this.emit('launch', p, { big: tt.guidance !== 'unguided' }); fx.dust(p.x, p.y - 1, p.z, 1.2); this.s.blast(p, 0.25, false); } }
        const p = this.pos(v, th, l, tv, this.tmp); m.position.copy(p); const p2 = this.pos(v, th, l, tv + 0.05, new THREE.Vector3()); m.lookAt(p2); this.info.push({ p: p.clone(), dir: p2.sub(p).normalize(), th, tt, drone, cued: th.cue != null && tv >= th.cue, tracked: th.track != null && tv >= th.track, range: Math.max(0, HKe.distAt(th, tv)), brg: l.brg }); if (!drone && Math.random() < dt * 60) fx.trail(p.x, p.y, p.z); }
      else if (tv >= end.t && !this.seen.has(key)) { this.seen.add(key); const m = this.live.get(key); if (m) { this.group.remove(m); this.live.delete(key); } const p = this.pos(v, th, l, end.t, this.tmp);
        if (end.type === 'hit') { const T = B.tankAt(v.t0 + end.t); this.s.at(T.e, T.n, 2, p); fx.explosion(p.x, p.y, p.z, end.killing ? 2.2 : 1.2, { dirt: 0.3 }); this.emit('hit', p, { killing: !!end.killing }); this.s.blast(p, end.killing ? 2 : 1.2, false); if (end.killing) this.burning = { e: T.e, n: T.n }; }
        else if (end.type === 'ground') { p.y = W.h(p.x, -p.z) + 0.3; fx.explosion(p.x, p.y, p.z, 0.9); this.emit('explosion', p, { size: 0.9 }); this.s.blast(p, 0.9); }
        else if (end.type === 'miss') { /* flies on past the vehicle and comes down behind it */ const T = B.tankAt(v.t0 + end.t), dx = T.e - l.u0.e, dn = T.n - l.u0.n, d = Math.hypot(dx, dn) || 1, e = T.e + dx / d * 90 + (end.lat || 4) * 3, n = T.n + dn / d * 90; this.s.at(e, n, 0.3, p); fx.explosion(p.x, p.y, p.z, 0.8); this.emit('pass', p, {}); this.emit('explosion', p, { size: 0.8 }); this.s.blast(p, 0.8); }
        else { fx.airburst(p.x, p.y, p.z, 1.3); this.emit('airburst', p, { size: 1 }); this.s.blast(p, 0.6, false); } } });
    // HKOI: tracers for rounds in flight, a cloud where each obscurant round blooms
    const T = B.tankAt(t), muzzle = this.s.at(T.e, T.n, 3.1, new THREE.Vector3());
    for (const b of rec.bursts) { if (b.idx < 0) continue; const th = rec.threats[b.idx], l = v.launches.find(q => q.u.id === th.uid) || v.launches[b.idx]; if (!l) continue;
      for (const r of b.rounds || []) { const tb = r.t_burst != null ? r.t_burst : r.t_pass, rk = v.i + ':' + b.idx + ':' + r.t_fire; if (tv >= r.t_fire && tv < tb) { const f = (tv - r.t_fire) / Math.max(0.05, tb - r.t_fire), tgt = this.pos(v, th, l, tb, this.tmp), p = new THREE.Vector3().lerpVectors(muzzle, tgt, f); this.tracers.push({ p, dir: tgt.clone().sub(muzzle).normalize() }); if (!this.seen.has(rk + 'm')) { this.seen.add(rk + 'm'); fx.flash(muzzle.x, muzzle.y, muzzle.z, 0.5); this.emit('gun', muzzle, {}); } }
        else if (tv >= tb && !this.seen.has(rk)) { this.seen.add(rk); const p = this.pos(v, th, l, tb, this.tmp); if (b.kind === 'obs') { if (r.fate === 'bloom' || r.bx != null) fx.cloud(p.x + (Math.random() - 0.5) * 4, p.y + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 4, 1.4); } else if (b.kind === 'he') { fx.airburst(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 4, p.z + (Math.random() - 0.5) * 6, 0.6); this.emit('airburst', p, { size: 0.5 }); } } } }
    // Trophy: a flash on the turret side and the intercept a few metres out
    for (const a of rec.aps || []) { const k = v.i + ':aps:' + a.t; if (tv >= a.t && !this.seen.has(k)) { this.seen.add(k); const br = a.brg * DEG, p = this.s.at(T.e + Math.sin(br) * 12, T.n + Math.cos(br) * 12, 2.6, this.tmp); fx.flash(muzzle.x, muzzle.y, muzzle.z, 1.2); fx.airburst(p.x, p.y, p.z, 1.6); this.emit('aps', p, {}); this.s.blast(p, 0.7, false); } }
    if (this.burning && dt > 0) { const p = this.s.at(this.burning.e, this.burning.n, 2, this.tmp); fx.burn(p.x, p.y, p.z, dt, 1.2); }
    // tracer meshes: reuse a small pool
    while (this.tpool && this.tpool.length < this.tracers.length) { const m = new THREE.Mesh(this.tracerGeo, this.tracerMat); m.scale.z = 9; this.group.add(m); this.tpool.push(m); } if (!this.tpool) this.tpool = [];
    while (this.tpool.length < this.tracers.length) { const m = new THREE.Mesh(this.tracerGeo, this.tracerMat); m.scale.z = 9; this.group.add(m); this.tpool.push(m); }
    this.tpool.forEach((m, i) => { const tr = this.tracers[i]; m.visible = !!tr; if (tr) { m.position.copy(tr.p); m.lookAt(tr.p.clone().add(tr.dir)); } }); this.tracers.length = 0;
  }
}
