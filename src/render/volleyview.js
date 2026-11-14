// Draws what the engine decided for the current engagement: missiles and drones flying in, the guidance line from launcher to
// missile, HKOI's rounds and its obscurant cloud, Trophy, impacts. Nothing here decides an outcome. Positions come from the
// battle (true map positions); times, paths, cloud size and drift, and every result come from the engine's record.
//
// How the engine's own frame is laid on the map. The engine works on a straight line from the vehicle to the launcher:
// x = metres from the vehicle along that line, y = metres to the right of it (seen from the vehicle), z = height. Here x is laid
// along the true line on the map, y to its right, and heights are taken as a difference from the nominal flight line, so the
// engine's sideways wander of a blinded missile, and the place of every puff, appear where the engine had them.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { missileMesh } from './units.js';
import { MARK } from './fx.js';
import { ObscurantCloud } from './obscurant.js';

const DEG = Math.PI / 180, lerp = (a, b, t) => a + (b - a) * t, clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const MAXBEAM = 8;
// missiles that are steered along a line from their launcher (the only ones a cloud can blind, and the only ones that get a line drawn)
const LINKED = { beam_rider: [1.0, 0.16, 0.12], radio_saclos: [1.0, 0.62, 0.12] };
// tracer colours (assumed for readability): obscurant rounds pale blue-white, high-explosive rounds orange-red
const TR_OBS = [0.62, 0.92, 1.0], TR_HE = [1.0, 0.42, 0.14];

export class VolleyView {
  constructor(scene3d, battle, particles) {
    this.s = scene3d; this.b = battle; this.fx = particles; this.live = new Map(); this.info = []; this.emit = () => {}; this.seen = new Set();
    this.group = new THREE.Group(); scene3d.scene.add(this.group); this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.tmp3 = new THREE.Vector3(); this.tmp4 = new THREE.Vector3(); this.lastT = 0;
    this.aimAt = null; this._aim = new THREE.Vector3(); this._muzzle = new THREE.Vector3();
    this.fly = [];      /* missiles that missed and are still in the air, falling wreckage */
    this.later = [];    /* things due a moment after an event (secondary explosions) */
    this.transit = new Map();   /* drones on their way in, before the engine takes them over */
    this.windSet = false; this._ae = 0; this._an = 1; this._oy = 0; this._oz = 0; this._ot = false;
    const W = battle.world; particles.ground = (x, z) => W.h(x, -z); particles.driven = true;
    this.cloud = new ObscurantCloud(); this.group.add(this.cloud.mesh);
    // guidance lines: one object for whole lines, one (dashed) for the part that is cut
    this.beamOn = this._lines(false); this.beamCut = this._lines(true);
  }
  _lines(dashed) {
    const geo = new LineSegmentsGeometry(); geo.setPositions(new Float32Array(MAXBEAM * 2 * 6)); geo.setColors(new Float32Array(MAXBEAM * 2 * 6));
    const mat = new LineMaterial({ linewidth: dashed ? 1.6 : 2.2, vertexColors: true, transparent: true, opacity: dashed ? 0.55 : 0.8, dashed, dashSize: 7, gapSize: 9, depthWrite: false, fog: false });
    const line = new LineSegments2(geo, mat); if (dashed) line.computeLineDistances(); line.frustumCulled = false; line.renderOrder = 8;   /* drawn before the cloud, so the cloud lies over the line where it covers it */ geo.instanceCount = 0; this.group.add(line);
    return { line, geo, pos: geo.attributes.instanceStart.data, col: geo.attributes.instanceColorStart.data, dist: dashed ? geo.attributes.instanceDistanceStart.data : null, n: 0 };
  }
  _seg(L, a, b, c0, c1, k0, k1) {
    if (L.n >= MAXBEAM * 2) return; const o = L.n * 6, P = L.pos.array, C = L.col.array;
    P[o] = a.x; P[o + 1] = a.y; P[o + 2] = a.z; P[o + 3] = b.x; P[o + 4] = b.y; P[o + 5] = b.z;
    C[o] = c0[0] * k0; C[o + 1] = c0[1] * k0; C[o + 2] = c0[2] * k0; C[o + 3] = c1[0] * k1; C[o + 4] = c1[1] * k1; C[o + 5] = c1[2] * k1;
    if (L.dist) { L.dist.array[L.n * 2] = 0; L.dist.array[L.n * 2 + 1] = a.distanceTo(b); }
    L.n++;
  }
  _flush(L) { L.geo.instanceCount = L.n; L.line.visible = L.n > 0; if (L.n) { L.pos.needsUpdate = true; L.col.needsUpdate = true; if (L.dist) L.dist.needsUpdate = true; } L.n = 0; }

  // ---- where things are --------------------------------------------------------------------------------------------------
  // the nominal flight line of threat th at x metres from the vehicle, with the vehicle where it is at volley time tv
  _line(v, th, l, x, tv, out) {
    const HKe = window.HK, T = this.b.tankAt(v.t0 + tv), W = this.b.world, tt = HKe.THREATS[th.key], f = 1 - x / th.R;
    const e = lerp(l.u0.e, T.e, f), n = lerp(l.u0.n, T.n, f), h0 = W.h(l.u0.e, l.u0.n) + 1.3, h1 = W.h(T.e, T.n) + 2.0;
    let y = lerp(h0, h1, f);
    if (tt.guidance === 'drone') y = Math.max(y, W.h(e, n) + 3) + Math.sin(Math.PI * Math.min(1, f * 1.1)) * 34;
    else y = Math.max(y + Math.sin(Math.PI * f) * Math.min(12, th.R * 0.004), W.h(e, n) + 1.0);
    const dE = l.u0.e - T.e, dN = l.u0.n - T.n, d = Math.hypot(dE, dN) || 1; this._ae = dE / d; this._an = dN / d;
    return out.set(e, y, -n);
  }
  // an engine point (x along the line, y to the right, dz above the nominal flight line) as a scene position
  _pt(v, th, l, x, y, dz, tv, out) { this._line(v, th, l, x, tv, out); out.x += this._an * y; out.z += this._ae * y; out.y += dz; return out; }
  // the engine's recorded path of a missile under HKOI's fire: how far it has strayed sideways and in height at volley time tv
  _stray(th, tv) {
    this._oy = 0; this._oz = 0; this._ot = false; const trs = th.viz.trajs; if (!trs) return;
    let tr = null; for (const q of trs) if (q.pts && q.pts.length && q.pts[0][0] <= tv) tr = q; if (!tr) return;
    const P = tr.pts, F = tr.frame || {}; let lo = 0, hi = P.length - 1; const t = Math.min(tv, P[hi][0]);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][0] <= t) lo = m; else hi = m; }
    const a = P[lo], b = P[hi], f = b[0] > a[0] ? clamp01((t - a[0]) / (b[0] - a[0])) : 0, x = lerp(a[1], b[1], f), y = lerp(a[2], b[2], f), z = lerp(a[3], b[3], f);
    const R = F.R || th.R, hh = F.hh == null ? 1.2 : F.hh, LH = F.LH == null ? hh : F.LH, lo2 = F.los_off || 0, zc = hh + (LH - hh) * x / R + (x > 300 ? lo2 : lo2 * Math.max(x, 0) / 300);
    const w = clamp01((tv - P[0][0]) / 0.25); this._oy = y * w; this._oz = (z - zc) * w; this._ot = true;
  }
  // an evasive drone: a steady wobble, a sidestep while HE rounds are in the air (the engine's jink, in g), a break-away on a feint
  _dodge(v, th, tv) {
    let y = Math.sin(tv * 2.3 + th.idx * 1.7) * 0.5 + Math.sin(tv * 5.1 + th.idx) * 0.2, z = Math.sin(tv * 3.1 + th.idx * 2.9) * 0.35;
    const jg = th.viz.jink || 0, sign = hash(th.idx * 3.3 + v.i) < 0.5 ? -1 : 1;
    if (jg) for (const b of v.rec.bursts) { if (b.idx !== th.idx || b.kind !== 'he' || !b.rounds || !b.rounds.length) continue;
      const t0 = b.rounds[0].t_fire, t1 = b.rounds[0].t_pass, full = Math.min(9, 0.5 * jg * 9.81 * (t1 - t0) * (t1 - t0) * 0.6);
      if (tv > t0 && tv <= t1) { const f = (tv - t0) / (t1 - t0); y += sign * full * f * f; } else if (tv > t1 && tv < t1 + 1.4) { const f = 1 - (tv - t1) / 1.4; y += sign * full * f * f; } }
    for (const tf of th.viz.feints || []) if (tv > tf - 0.2 && tv < tf + 1.6) { const f = Math.sin(Math.PI * clamp01((tv - tf + 0.2) / 1.8)); y -= sign * 7 * f; z += 3.5 * f; }
    this._oy += y; this._oz += z;
  }
  // where a missile or drone of volley v is at volley time tv
  pos(v, th, l, tv, out) {
    const HKe = window.HK, W = this.b.world, end = th.viz.end, tc = Math.min(tv, end.t), x = Math.max(0, HKe.distAt(th, tc)), drone = HKe.THREATS[th.key].guidance === 'drone';
    this._stray(th, tc); if (drone) this._dodge(v, th, tc);
    this._pt(v, th, l, x, this._oy, this._oz, tv, out);
    const g = W.h(out.x, -out.z);
    if (end.type === 'ground' && tv >= end.t - 0.6 && !this._ot) out.y = lerp(out.y, g, Math.min(1, (tv - (end.t - 0.6)) / 0.6));
    if (out.y < g + 0.15) out.y = g + 0.15;
    return out;
  }
  _launcher(v, th, l, out) { const W = this.b.world; return out.set(l.u0.e, W.h(l.u0.e, l.u0.n) + 1.3, -l.u0.n); }
  // where Trophy's launcher on that side of the turret is (assumed: 1.85 m out from the turret centre line, 0.75 m above the turret ring, 0.6 m behind its centre)
  _apsPort(side, T, out) {
    const tv = this.tankView; if (tv && tv.turret) { tv.group.updateWorldMatrix(true, true); return tv.turret.localToWorld(out.set(side === 'L' ? 1.85 : -1.85, 0.75, -0.6)); }
    return this.s.at(T.e, T.n, 2.6, out);
  }
  // what a round or missile lands on at a scene point: a building, trees, or open ground
  _surf(x, z) { const W = this.b.world; if (W.buildingAt && W.buildingAt(x, -z, 2)) return 'wall'; const g = W.veg ? W.veg(x, -z) : null; return g && (g.cls === 4 || g.cls === 5) ? 'trees' : null; }   /* 4 forest, 5 tree line */
  _mode(th, tv) { let md = 'guided'; for (const p of th.viz.phases || []) if (p.t <= tv) md = p.mode; return md; }

  dispose() { this.s.scene.remove(this.group); for (const d of this.transit.values()) this.group.remove(d.mesh); this.transit.clear(); }
  // After a jump in time (replay): everything that has already happened in the current engagement is taken as seen, so old
  // explosions and muzzle flashes do not all go off at once. Lingering smoke is dropped; the cloud is rebuilt as old as it should be.
  skipTo(t) {
    const B = this.b, v = B.volleys.length ? B.volleys[B.volleys.length - 1] : null;
    for (const m of this.live.values()) this.group.remove(m.mesh); this.live.clear();
    for (const f of this.fly) this.group.remove(f.mesh); this.fly.length = 0; this.later.length = 0;
    for (const d of this.transit.values()) this.group.remove(d.mesh); this.transit.clear();
    this.fx.clear(); this.cloud.clear(); this.lastT = t; if (!v) return;
    const tv = t - v.t0, rec = v.rec; this._first(v);
    rec.threats.forEach((th, i) => { const l = this._l(v, th, i); if (!l) return; if (tv >= th.viz.end.t) { this.seen.add(v.i + ':' + th.idx); if (th.viz.end.type === 'hit' && th.viz.end.killing) { const T = B.tankAt(v.t0 + th.viz.end.t), p = this.s.at(T.e, T.n, 2, this.tmp); this.fx.fire(p.x, p.y, p.z, 1e9, 1.2); } } });
    for (const b of rec.bursts) { if (b.idx < 0) continue; const th = rec.threats[b.idx], l = this._l(v, th, b.idx); if (!l) continue;
      for (const r of b.rounds || []) { const tb = r.t_burst != null ? r.t_burst : r.t_pass, rk = v.i + ':' + b.idx + ':' + r.t_fire; if (tv >= r.t_fire) this.seen.add(rk + 'm'); if (tv >= tb) { this.seen.add(rk); if (b.kind === 'obs') this._bloom(v, b, th, l, r, true); } } }
    for (const a of rec.aps || []) if (tv >= a.t) this.seen.add(v.i + ':aps:' + a.t);
  }
  _l(v, th, i) { return v.launches.find(q => q.u.id === th.uid) || v.launches[i]; }
  // once per engagement: remember where each launcher stood when it fired; take the wind for drifting smoke from the first engagement
  _first(v) {
    for (const l of v.launches) if (!l.u0) l.u0 = { e: l.u.e, n: l.u.n };
    if (!this.windSet && v.rec.ctx && v.rec.ctx.wind != null) { const w = v.rec.ctx.wind, a = (v.rec.ctx.wind_dir || 0) * DEG; this.fx.mat.uniforms.wind.value.set(Math.sin(a) * w, 0, -Math.cos(a) * w); this.windSet = true; }
  }
  // an obscurant round bursting: the fuze pop, and the engine's puff handed to the cloud layer
  _bloom(v, b, th, l, r, quiet) {
    if (r.bx == null) return;
    const ps = b.puffs || [], j = ps.findIndex(p => p.x === r.bx && p.y === r.by), p = j >= 0 ? ps[j] : null, tb = r.t_burst != null ? r.t_burst : r.t_pass;
    const tform = p && b.t_ref != null ? b.t_ref + p.tf : tb + 0.3, pt = this._pt(v, th, l, r.bx, r.by, p ? p.z0 : 0, tform, this.tmp2), gy = this.b.world.h(pt.x, -pt.z);
    if (pt.y < gy + 0.5) pt.y = gy + 0.5;
    if (!quiet) { this.fx.seed(v.i * 97 + b.idx * 13 + r.t_fire); this.fx.cloudPop(pt.x, pt.y, pt.z); }
    if (!p) return;   /* a fuze that went off with no puff in the engine's list: the pop only */
    const wa = p.wa || 0, wc = b.wind_cross || 0, ve = this._ae * wa + this._an * wc, vn = this._an * wa - this._ae * wc;
    this.cloud.add({ id: v.i * 131 + b.idx * 17 + j * 3 + r.t_fire, t0: v.t0 + tform, tb: v.t0 + tb, x: pt.x, y: pt.y, z: pt.z, vx: ve, vz: -vn, s0: p.s0 || 2, K: b.phys ? b.phys.K : 2, wash: b.phys ? b.phys.wash : 0, gy });
  }
  // the engine's own measure of how much of the line the cloud is blocking for threat th at volley time tv: 0 clear, 1 = lock lost
  _block(rec, th, tv) {
    let out = 0, x1 = null;
    for (const b of rec.bursts) { if (b.idx !== th.idx || b.kind !== 'obs' || !b.tau_s || !b.tau_s.length || !b.tau_need) continue; const S = b.tau_s; if (S[0][0] > tv) continue;
      let k = 0; while (k < S.length - 1 && S[k + 1][0] <= tv) k++; const a = S[k], c = S[Math.min(k + 1, S.length - 1)], f = c[0] > a[0] ? clamp01((tv - a[0]) / (c[0] - a[0])) : 0;
      out = Math.max(out, clamp01(lerp(a[1], c[1], f) / b.tau_need)); for (const p of b.puffs || []) if (b.t_ref + p.tf <= tv + 0.3 && (x1 == null || p.x > x1)) x1 = p.x; }
    this._bx = x1; return out;
  }

  update(t, dt) {
    this.info.length = 0;
    const B = this.b, HKe = window.HK, fx = this.fx, W = B.world, s = this.s;
    fx.sync(s); fx.driven = true; fx.step(dt);
    for (let i = this.later.length - 1; i >= 0; i--) if (t >= this.later[i].t) { const e = this.later[i]; this.later.splice(i, 1); e.fn(); }
    this._transit(t); this._flyers(t);
    const v = B.volleys.length ? B.volleys[B.volleys.length - 1] : null;
    if (!v) { this.cloud.update(t, s); this._flush(this.beamOn); this._flush(this.beamCut); return; }
    const tv = t - v.t0, rec = v.rec; this._first(v); this.aimAt = null;
    if (this.curV !== v.i) { this.curV = v.i; for (const [k, st] of this.live) if (!k.startsWith(v.i + ':')) { this.group.remove(st.mesh); this.live.delete(k); } }   /* nothing of an earlier engagement is left hanging in the air */
    const cam = s.camera, pixA = 2 * Math.tan((cam.fov || 50) * Math.PI / 360) / (s.canvas ? s.canvas.clientHeight || 720 : 720);

    rec.threats.forEach((th, i) => {
      const l = this._l(v, th, i), key = v.i + ':' + th.idx, tt = HKe.THREATS[th.key], drone = tt.guidance === 'drone', rpg = tt.guidance === 'unguided', end = th.viz.end; if (!l) return;
      if (tv >= th.t0 && tv < end.t) {
        let st = this.live.get(key);
        if (!st) {
          st = { mesh: missileMesh(drone, this.assetBase), next: Math.max(th.t0, tv - 0.5) }; this.group.add(st.mesh); this.live.set(key, st);
          const old = this.transit.get(th.uid); if (old) { this.group.remove(old.mesh); this.transit.delete(th.uid); }
          if (!drone && tv - th.t0 < 1.5) {   /* the launch: flame and smoke out of the back, dust, a flash that marks the position */
            const p = this._launcher(v, th, l, this.tmp), T0 = B.tankAt(v.t0 + th.t0), dx = T0.e - l.u0.e, dn = T0.n - l.u0.n, dd = Math.hypot(dx, dn) || 1;
            fx.seed(v.i * 53 + th.idx * 7 + 1); fx.backblast(p.x, p.y, p.z, dx / dd, -dn / dd, rpg ? 0.75 : 1.4); fx.dustRing(p.x, p.y - 1.2, p.z, rpg ? 0.4 : 0.8, 5);
            this.emit('launch', p, { big: !rpg }); s.blast(p, 0.3, false);
          }
        }
        const p = this.pos(v, th, l, tv, this.tmp), p2 = this.pos(v, th, l, tv + 0.05, this.tmp2), m = st.mesh; m.position.copy(p); m.lookAt(p2);
        const burning = !rpg || tv - th.t0 < 0.7, U = m.userData;
        if (drone) m.rotateZ(Math.sin(tv * 4.3 + th.idx) * 0.14);
        if (U.flame) { U.flame.visible = burning; if (burning) { const fl = 0.8 + 0.4 * hash(Math.floor(t * 60) + th.idx); U.flame.scale.set(1, 1, fl); } }
        if (U.glow) { U.glow.visible = burning; const d = cam.position.distanceTo(p), sz = Math.max(1.5, d * pixA * 5) * (0.85 + 0.3 * hash(Math.floor(t * 45) + th.idx * 3)); U.glow.scale.set(sz, sz, 1); }
        // the smoke trail: one puff every few metres of flight, laid at the points the missile really passed
        if (!drone ? burning : true) {
          const spacing = (drone ? 7 : rpg ? 1.8 : th.v > 320 ? 3 : 2.3) / Math.max(0.35, fx.q), step = spacing / Math.max(10, th.v); let guard = 0;
          if (st.next < tv - 1.2) st.next = tv - 1.2;
          while (st.next <= tv && guard++ < 160) { const q = this.pos(v, th, l, st.next, this.tmp3);
            if (drone) fx.puff(q.x, q.y, q.z, 0, 0, 0, 1.6, 0.25, 0.9, 0.5, 0.52, 0.55, 0.1, 1, 0);
            else { const a = st.next * 13.8 + th.idx, cr = tt.guidance === 'beam_rider' ? 0.4 : 0.12; fx.trail(q.x + this._an * Math.cos(a) * cr, q.y + Math.sin(a) * cr, q.z + this._ae * Math.cos(a) * cr, rpg ? 0.7 : th.v > 320 ? 0.75 : 1, 0.9); }
            st.next += step; }
          this.pos(v, th, l, tv, this.tmp);   /* put the working values back for the lines below */
        } else st.next = tv;
        const dir = p2.clone().sub(p).normalize();
        this.info.push({ p: p.clone(), dir, th, tt, drone, cued: th.cue != null && tv >= th.cue, tracked: th.track != null && tv >= th.track, range: Math.max(0, HKe.distAt(th, tv)), brg: l.brg });
        // the guidance line: launcher to missile. Whole while the missile is guided; past the cloud it fades as the engine's
        // blocking figure rises, and turns into a grey broken line once the engine says guidance is lost
        const col = LINKED[tt.guidance];
        if (col && tv - th.t0 > 0.15) {
          const L = this._launcher(v, th, l, this.tmp2), blind = this._mode(th, tv) === 'blind', blk = this._block(rec, th, tv), xm = Math.max(0, HKe.distAt(th, tv));
          const fc = this._bx != null && this._bx > xm ? clamp01((th.R - this._bx) / Math.max(1, th.R - xm)) : null;
          if (fc == null) { if (blind) this._seg(this.beamCut, L, p, GREY, GREY, 1, 1); else this._seg(this.beamOn, L, p, col, col, 1, 1); }
          else { const C = this.tmp3.lerpVectors(L, p, fc); this._seg(this.beamOn, L, C, col, col, 1, 1);
            if (blind) this._seg(this.beamCut, C, p, GREY, GREY, 1, 1); else this._seg(this.beamOn, C, p, col, col, 1 - 0.75 * blk, 1 - 0.75 * blk); }
        }
      } else if (tv >= end.t && !this.seen.has(key)) {
        this.seen.add(key); const st = this.live.get(key), late = tv - end.t > 2.5; let keep = false;
        const p = this.pos(v, th, l, end.t, this.tmp).clone(), p0 = this.pos(v, th, l, end.t - 0.05, this.tmp2), vel = p.clone().sub(p0).multiplyScalar(20), T = B.tankAt(v.t0 + end.t);
        fx.seed(v.i * 53 + th.idx * 7 + 2);
        if (late) { /* jumped over it: no effect */ }
        else if (end.type === 'hit') {
          const hp = s.at(T.e + this._ae * 2.4, T.n + this._an * 2.4, 1.7, this.tmp2), k = end.killing ? 1.6 : 1;
          fx.vehicleHit(hp.x, hp.y, hp.z, -this._ae, this._an, k); fx.dustRing(hp.x, hp.y - 1.6, hp.z, 1.2, 12);
          this.emit('hit', hp, { killing: !!end.killing }); s.blast(hp, end.killing ? 2 : 1.2, false);
          if (end.killing) this._kill(T, t);
        } else if (end.type === 'ground') {
          p.y = W.h(p.x, -p.z) + 0.3; fx.explosion(p.x, p.y, p.z, 0.9, { surface: this._surf(p.x, p.z) }); this.emit('explosion', p, { size: 0.9 }); s.blast(p, 0.9); s.marks.add(p.x, p.z, 1.5, (x, z) => W.h(x, -z), { kind: MARK.CRATER });
        } else if (end.type === 'miss') {   /* flies on past the vehicle and comes down behind it */
          if (st) { keep = true; this.fly.push({ mesh: st.mesh, x: p.x, y: p.y, z: p.z, vx: vel.x, vy: Math.min(vel.y, 2), vz: vel.z, t0: t, seed: v.i * 53 + th.idx * 7 + 3 }); this.emit('pass', p, {}); }
        } else if (end.type === 'aps_kill') {
          fx.breakup(p.x, p.y, p.z, vel.x, vel.y, vel.z, 1.1); const g = W.h(p.x, -p.z); fx.dust(p.x, g, p.z, 1.6); fx.sparks(T.e + this._ae * 2.4, W.h(T.e, T.n) + 1.8, -(T.n + this._an * 2.4), this._ae, 0.4, -this._an, 14, 12, 1.2, 0.5);
          s.blast(p, 0.8, false); s.marks.add(p.x + vel.x * 0.03, p.z + vel.z * 0.03, 1.6, (x, z) => W.h(x, -z), { kind: MARK.SCORCH });
        } else if (end.type === 'he_kill') {
          fx.airburst(p.x, p.y, p.z, 1.0); fx.breakup(p.x, p.y, p.z, vel.x, vel.y, vel.z, drone ? 0.5 : 0.9); this.emit('airburst', p, { size: 1 }); s.blast(p, 0.6, false);
        } else { fx.airburst(p.x, p.y, p.z, 1.3); fx.breakup(p.x, p.y, p.z, vel.x * 0.5, vel.y * 0.5, vel.z * 0.5, 0.7); this.emit('airburst', p, { size: 1 }); s.blast(p, 0.6, false); }
        if (st) { if (!keep) this.group.remove(st.mesh); this.live.delete(key); }
      }
    });

    // HKOI: the weapon station fires; each round is a tracer that flies to its meeting point; obscurant rounds bloom there
    const T = B.tankAt(t), muzzle = (this.tankView && this.tankView.hkoiMuzzle(this._muzzle)) || s.at(T.e, T.n, 3.1, this._muzzle);
    for (const b of rec.bursts) {
      if (b.idx < 0) continue; const th = rec.threats[b.idx], l = this._l(v, th, b.idx); if (!l) continue; const obs = b.kind === 'obs', tc = obs ? TR_OBS : TR_HE;
      for (const r of b.rounds || []) {
        const tb = r.t_burst != null ? r.t_burst : r.t_pass, rk = v.i + ':' + b.idx + ':' + r.t_fire;
        if (tv >= r.t_fire - 1.2 && tv < tb && !this.aimAt) this.aimAt = this.pos(v, th, l, Math.max(tv, tb), this._aim);   /* the station lays on the meeting point a moment before it fires */
        if (tv >= r.t_fire && !this.seen.has(rk + 'm')) {
          this.seen.add(rk + 'm'); if (tv - r.t_fire > 1.5) continue;
          // where this round is going: its own burst point if it blooms, otherwise past the missile where the engine says it passed
          const tgt = this.tmp2; if (obs && r.bx != null) { const ps = b.puffs || [], p = ps.find(q => q.x === r.bx && q.y === r.by); this._pt(v, th, l, r.bx, r.by, p ? p.z0 : 0, tb, tgt); }
          else { this.pos(v, th, l, tb, tgt); tgt.x += this._an * (r.ey || 0); tgt.z += this._ae * (r.ey || 0); tgt.y += r.ez || 0; }
          if (this.tankView) this.tankView.hkoiMuzzle(muzzle, true);
          const d = tgt.clone().sub(muzzle), D = d.length() || 1; d.multiplyScalar(1 / D); const sl = Math.hypot(d.x, d.z) || 1, f0 = clamp01((tv - r.t_fire) / Math.max(0.05, tb - r.t_fire));
          fx.seed(v.i * 97 + b.idx * 13 + r.t_fire + 0.5); fx.muzzle30(muzzle.x, muzzle.y, muzzle.z, d.x, d.y, d.z, -d.z / sl, d.x / sl); s.blast(muzzle, 0.12, false);
          fx.tracer(lerp(muzzle.x, tgt.x, f0), lerp(muzzle.y, tgt.y, f0), lerp(muzzle.z, tgt.z, f0), tgt.x, tgt.y, tgt.z, Math.max(0.02, tb - Math.max(tv, r.t_fire)), tc[0], tc[1], tc[2], 0.16, 14, 7);
          if (!(obs && r.bx != null) && r.fate !== 'he_kill') { const sp = D / Math.max(0.05, tb - r.t_fire); fx.tracer(tgt.x, tgt.y, tgt.z, tgt.x + d.x * sp * 1.6, tgt.y + d.y * sp * 1.6 - 14, tgt.z + d.z * sp * 1.6, 1.6, tc[0], tc[1], tc[2], 0.16, 14, 5, Math.max(0, tb - tv)); }
          this.emit('gun', muzzle, {});
        }
        if (tv >= tb && !this.seen.has(rk)) {
          this.seen.add(rk); if (tv - tb > 3 && !obs) continue;
          if (obs) this._bloom(v, b, th, l, r, tv - tb > 1.5);
          else if (r.fate === 'he_kill') { const p = this.pos(v, th, l, tb, this.tmp); fx.seed(v.i * 97 + b.idx * 13 + r.t_fire); fx.airburst(p.x, p.y, p.z, 0.7); this.emit('airburst', p, { size: 0.5 }); }
        }
      }
    }
    // Trophy: the shot leaves the launcher on the side of the turret the record names, a tight fan of fragments toward the missile
    for (const a of rec.aps || []) {
      const k = v.i + ':aps:' + a.t; if (tv < a.t || this.seen.has(k)) continue; this.seen.add(k); if (tv - a.t > 2) continue;
      const th = rec.threats[a.idx], l = th && this._l(v, th, a.idx), Ta = B.tankAt(v.t0 + a.t), port = this._apsPort(a.side, Ta, this.tmp), br = a.brg * DEG;
      const tgt = l ? this.pos(v, th, l, a.t, this.tmp2) : s.at(Ta.e + Math.sin(br) * 12, Ta.n + Math.cos(br) * 12, 2.6, this.tmp2), d = tgt.clone().sub(port), D = d.length() || 1; d.multiplyScalar(1 / D);
      fx.seed(v.i * 71 + a.t); fx.apsLaunch(port.x, port.y, port.z, d.x, d.y, d.z); fx.tracer(port.x, port.y, port.z, tgt.x, tgt.y, tgt.z, 0.05, 1, 0.9, 0.7, 0.2, D * 0.7, 6);
      if (!a.kill) fx.airburst(tgt.x, tgt.y, tgt.z, 0.5);
      this.emit('aps', tgt, {}); s.blast(port, 0.5, false);
    }
    this.cloud.update(t, s); this._flush(this.beamOn); this._flush(this.beamCut); this.lastT = t;
  }

  // the vehicle is destroyed: fire that stays, a black column, and ammunition going up over the next few seconds
  _kill(T, t) {
    const s = this.s, fx = this.fx, p = s.at(T.e, T.n, 2, new THREE.Vector3()); fx.fire(p.x, p.y, p.z, 1e9, 1.2);
    [0.9, 2.2, 3.9].forEach((d, i) => { const dd = d + hash(T.e + i) * 0.6; this.later.push({ t: t + dd, fn: () => { fx.seed(T.e + i * 3); fx.secondary(p.x, p.y + 0.6, p.z, 1 - i * 0.15); s.blast(p, 1.4 - i * 0.2, false); this.emit('explosion', p, { size: 1.2 }); } }); });
  }
  // missiles that missed: they carry on along their last heading, sink, and burst where they meet the ground
  _flyers(t) {
    const W = this.b.world, fx = this.fx;
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const f = this.fly[i], a = t - f.t0, x = f.x + f.vx * a, z = f.z + f.vz * a, y = f.y + f.vy * a - 0.5 * 4.5 * a * a, g = W.h(x, -z);
      if (y <= g + 0.2 || a > 6) { const p = this.tmp.set(x, g + 0.3, z); fx.seed(f.seed); fx.explosion(p.x, p.y, p.z, 0.8, { surface: this._surf(p.x, p.z) }); this.emit('explosion', p, { size: 0.8 }); this.s.blast(p, 0.8); this.s.marks.add(p.x, p.z, 1.4, (px, pz) => W.h(px, -pz), { kind: MARK.CRATER }); this.group.remove(f.mesh); this.fly.splice(i, 1); continue; }
      f.mesh.position.set(x, y, z); f.mesh.lookAt(x + f.vx, y + f.vy - 4.5 * a, z + f.vz);
      if (!f.next || f.next < a - 0.3) f.next = a; while (f.next <= a) { fx.trail(f.x + f.vx * f.next, f.y + f.vy * f.next - 2.25 * f.next * f.next, f.z + f.vz * f.next, 1, 0.9); f.next += 0.016; }
    }
  }
  // drones on their way in, before the engine takes them over at the terminal range: small, low, with a faint motor trail
  _transit(t) {
    const B = this.b, L = B.transit || [], HKe = window.HK, W = B.world;
    for (const d of this.transit.values()) d.keep = false;
    for (const d of L) {
      if (!d.u || d.arrive <= t || t < d.t0) continue; const tt = HKe.THREATS[d.key] || { speed: 30, short: 'FPV', guidance: 'drone' }, R = Math.max(0, d.R0 - tt.speed * (t - d.t0));
      let st = this.transit.get(d.u.id); if (!st) { st = { mesh: missileMesh(true, this.assetBase), next: t, th: { idx: 'tr' + d.u.id, t0: d.t0, key: d.key, viz: {} } }; this.group.add(st.mesh); this.transit.set(d.u.id, st); }
      st.keep = true; const T = B.tankAt(t), a = d.brg * DEG, at = (R2, tt2, out) => { const e = T.e + Math.sin(a) * R2, n = T.n + Math.cos(a) * R2, far = clamp01((R2 - 900) / 500); return out.set(e + Math.cos(a) * Math.sin(tt2 * 2.3) * 0.6, W.h(e, n) + 3 + 22 * far * far * (3 - 2 * far) + Math.sin(tt2 * 3.1) * 0.35, -n + Math.sin(a) * Math.sin(tt2 * 2.3) * 0.6); };
      const p = at(R, t, this.tmp), p2 = at(R - tt.speed * 0.05, t + 0.05, this.tmp2); st.mesh.position.copy(p); st.mesh.lookAt(p2); st.mesh.rotateZ(Math.sin(t * 4.3) * 0.14);
      if (st.next < t - 1) st.next = t - 1; while (st.next <= t) { const q = at(Math.max(0, d.R0 - tt.speed * (st.next - d.t0)), st.next, this.tmp3); this.fx.puff(q.x, q.y, q.z, 0, 0, 0, 1.6, 0.25, 0.9, 0.5, 0.52, 0.55, 0.1, 1, 0); st.next += 0.25 / Math.max(0.35, this.fx.q); }
      this.info.push({ p: p.clone(), dir: p2.clone().sub(p).normalize(), th: st.th, tt, drone: true, cued: false, tracked: false, range: R, brg: d.brg });
    }
    for (const [id, d] of this.transit) if (!d.keep) { this.group.remove(d.mesh); this.transit.delete(id); }
  }
}
const GREY = [0.72, 0.76, 0.8];
