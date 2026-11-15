// What a hit does to the inside of the vehicle, DRAWN: the jet across the compartment on the damage model's own line, the spall
// fan and its glowing fragments, the hole with daylight in it, scorch, the scar on the far wall, dust and paint flakes off every surface
// when the armour holds, loose kit thrown and hanging things swinging, hydraulic spray and its mist, arcing and tripped breakers,
// fire where the damage model put it (hull fuel cell, engine bulkhead, bustle ammunition behind its doors, the doors breached),
// the Halon blast, light shafts under thrown-open hatches, cracked displays, blood, and the ringing-ears view of the man in the seat.
//
// WHAT happens is decided in interior_events.js (from the damage report and the crew model) and interior_gore.js (wounds); this file
// only draws it. Everything is a plain function of the battle clock: no particle or mark keeps a state of its own, so a replay or a
// rewind shows the same thing at the same moment and the result is the same at any frame rate.
// Cost: four instanced meshes (marks, lit particles, glowing particles, fragments) and one for loose kit: 5 draw calls, at most
// 96 + 360 + 220 + 160 + 12 instances (about 1,700 triangles), nothing while no inside view is active.
import * as THREE from 'three';
import { SHARED } from './interior_parts.js';
import { CTX, BOX, AT, HYD, HALON, PIVOT_Y, detail, insideState, noState, fateOf, concussion, hsh } from './interior_events.js';
import { Decals, Puffs, Bits, CELL } from './interior_draw.js';
import { woundsOf, lookOf, drawBlood, partAt, MAN, ROLES } from './interior_gore.js';
export { PIVOT_Y };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// Every hit, Trophy shot and near miss of the battle so far, in time order. Rebuilt only when a new volley has been resolved.
// Each: { T (battle time), pen, kill, minor, s (strength), e (where it came in, hull frame of the interior), d (direction), comps, crew, idx,
//         zone (plate name), zoneKey, turA (the damage report's turret angle), reach (m, from the plate), key (weapon), top (top attack) }
export function hitList(battle) {
  CTX.battle = battle;
  if (battle.interiorHits) return battle.interiorHits;   /* the node test and the picture staging supply their own */
  const V = battle.volleys || [], n = V.length, last = n ? V[n - 1] : null, key = n + ':' + (last && last.rec ? 1 : 0); if (battle._intHitKey === key && battle._intHits) return battle._intHits;
  const out = [], D = typeof DMG !== 'undefined' ? DMG : null;
  for (const v of V) { if (!v.rec) continue;
    if (D && v.cfg) { let rep = []; try { rep = D.report(v.rec, v.cfg); } catch (e) { rep = []; }
      for (const h of rep) { const comps = {}; for (const c of h.comps || []) comps[c.id] = c.state;
        out.push({ T: v.t0 + h.t, pen: !!h.penetrated, kill: !!h.killing, minor: false, s: h.killing ? 2 : h.penetrated ? 1.6 : 1, e: new THREE.Vector3(h.entry[0], h.entry[1] - PIVOT_Y, h.entry[2]), d: new THREE.Vector3(h.dir[0], h.dir[1], h.dir[2]).normalize(), comps, crew: h.crew || {}, idx: v.i * 100 + h.idx,
          zone: h.zoneName, zoneKey: h.zone, turA: h.turA || 0, reach: h.reach, key: h.key, top: !!h.top }); } }
    for (const a of v.rec.aps || []) out.push({ T: v.t0 + a.t, pen: false, kill: false, minor: true, s: 0.3, comps: {}, crew: {}, idx: v.i * 100 + 90 });   /* Trophy firing beside the hatch */
    for (const th of v.rec.threats || []) { const e = th.viz && th.viz.end; if (e && (e.type === 'miss' || e.type === 'ground')) out.push({ T: v.t0 + e.t, pen: false, kill: false, minor: true, s: 0.22, comps: {}, crew: {}, idx: v.i * 100 + 50 + th.idx }); } }
  out.sort((a, b) => a.T - b.T); battle._intHitKey = key; battle._intHits = out; return out;
}

// The state of the inside at battle time `now`, from the list of hits (interior_events.js insideState; the crew model's fire and
// bail-out and the tank's fate are read from the battle the list came from). An empty list at time 0 is the interior's way of
// asking for "nothing to show" (seen from outside).
export function fxState(hits, now) {
  if (!hits.length && now === 0) return noState();
  const b = CTX.battle; let crew = null; try { crew = b && b.crewState ? b.crewState() : null; } catch (e) { crew = null; }
  CTX.crew = crew; CTX.fate = fateOf(b); const S = insideState(hits, now, crew, CTX.fate); CTX.S = S; return S;
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = [0, 0, 0], _b = [0, 0, 0], _n = [0, 0, 0], WHITE = [1, 1, 1], UP = [0, 1, 0];
const KIT = [   /* loose kit on the basket floor and the hull floor: [x, y (its underside), z, sx, sy, sz, frame] */
  [-0.95, -0.98, -0.3, 0.16, 0.27, 0.3, 'tur'], [-0.5, -0.98, 0.72, 0.28, 0.18, 0.15, 'tur'], [0.2, -0.98, 0.78, 0.3, 0.1, 0.22, 'tur'], [0.95, -1.14, -1.4, 0.3, 0.19, 0.16, 'hul'], [-0.9, -1.14, 0.9, 0.16, 0.27, 0.3, 'hul'], [-0.2, -0.98, 0.5, 0.09, 0.24, 0.09, 'tur'] ];
const HANG = [[-1.05, 0.5, 0.15, 0.1, 0.2, 0.06, 'tur', 0.26], [1.02, 0.5, 0.62, 0.08, 0.13, 0.05, 'tur', 0.2]];   /* things hanging from the roof on a strap: [x, y of the hook, z, sx, sy, sz, frame, strap length] */

export class InteriorFx {
  // cab: (opts) => material of the interior; groups: { tur, hul }; pack: the seats' own surfaces ({ role: { g, planes } }); merge: unused now
  constructor(cab, groups, pack) {
    this.G = groups; this.planes = {}; this.stains = {}; for (const r in pack) { this.planes[r] = pack[r].planes; this.stains[r] = { visible: false }; }
    this.decals = new Decals(groups.hul, 96); this.lit = new Puffs(groups.hul, 360, false); this.glow = new Puffs(groups.hul, 220, true); this.bits = new Bits(groups.hul, 160);
    // loose kit and hanging things: plain painted boxes in the interior's own material
    { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), n = g.attributes.position.count, col = new Float32Array(n * 4); for (let i = 0; i < n; i++) { col[i * 4] = 0.2; col[i * 4 + 1] = 0.23; col[i * 4 + 2] = 0.15; col[i * 4 + 3] = 2.0; } g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      let mat = null; try { mat = cab({}); } catch (e) { mat = null; } const k = this.kit = new THREE.InstancedMesh(g, mat || new THREE.MeshBasicMaterial({ color: 0x33381f }), KIT.length + HANG.length * 2); k.frustumCulled = false; k.userData.cabFx = true; groups.hul.add(k); }
    this.MT = new THREE.Matrix4(); this.look = {}; this.W = null; this.view = { deaf: 0, tunnel: 0, shake: 0, blur: 0, flash: 0 }; this.L = [{ p: new THREE.Vector3(), c: new THREE.Vector3(), r: 1, w: 0 }, { p: new THREE.Vector3(), c: new THREE.Vector3(), r: 1, w: 0 }];
    this.day = null; this.screens = null; this.ov = null; this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  cost() { return { marks: this.decals.mesh.count, smoke: this.lit.mesh.count, glow: this.glow.mesh.count, bits: this.bits.mesh.count, kit: this.kit.count, calls: 5 }; }

  // a light that an effect throws (the two strongest take the place of two of the dome lamps for this frame). p in frame coordinates
  _light(M, x, y, z, r, g, b, rad) { const w = r + g + b, L = this.L, s = w > L[0].w ? 0 : w > L[1].w ? 1 : -1; if (s < 0) return; if (s === 0) { const t = L[0]; L[0] = L[1]; L[1] = t; } const t = L[s === 0 ? 0 : 1]; t.p.set(x, y, z); if (M) t.p.applyMatrix4(M); t.c.set(r, g, b); t.r = rad; t.w = w; }

  // S: fxState(...); graphic: blood allowed
  update(S, graphic) {
    const D = this.decals, P = this.lit, Q = this.glow, B = this.bits;
    if (S.outside || !S.hits) { D.begin(); P.begin(); Q.begin(); B.begin(); D.end(false); P.end(false); Q.end(false); B.end(false); this.kit.visible = false; for (const r in this.stains) this.stains[r].visible = false; this._overlay(null); return; }
    try { this._draw(S, graphic); } catch (e) { if (!this._err) { this._err = 1; console.warn('interior effects fault:', e && e.message); } }
  }
  _draw(S, graphic) {
    const D = this.decals, P = this.lit, Q = this.glow, B = this.bits, now = S.now, hits = S.hits, G = this.G;
    D.begin(); P.begin(); Q.begin(); B.begin(); this.L[0].w = this.L[1].w = 0;
    const MT = this.MT.copy(G.hul.matrixWorld).invert().multiply(G.tur.matrixWorld);   /* turret coordinates into the hull group's, where every effect mesh hangs */
    if (!this.day) G.tur.traverse(o => { const u = o.material && o.material.uniforms; if (u && u.uDay && !this.day) this.day = u.uDay; });
    const dc = this.day ? this.day.value : null, dayR = dc ? dc.x * 2.2 : 0.8, dayG = dc ? dc.y * 2.2 : 0.8, dayB = dc ? dc.z * 2.2 : 0.8, smoke = Math.max(S.smoke, S.dust);
    // ---- each hit: the newest eight leave their marks; the moving parts only while they last
    let n0 = 0; for (let i = hits.length - 1, k = 0; i >= 0; i--) { if (hits[i].minor || hits[i].T > now) continue; if (++k >= 8) { n0 = i; break; } }
    for (let i = n0; i < hits.length; i++) { const h = hits[i], age = now - h.T; if (age < 0) break; if (h.minor) continue; this._hit(h, detail(h), age, MT, dayR, dayG, dayB, smoke); }
    this._systems(S, MT, now); this._fires(S, MT, now); this._kit(S, MT, now);
    // hatches thrown open by a crew that is leaving: shafts of daylight standing in the smoke
    if (S.abandoned) for (const [hx, hz] of [[-0.77, 0.62], [0.52, 0.36]]) for (let i = 0; i < 6; i++) Q.add(MT, hx + 0.05 * Math.sin(i * 2.1), 0.5 - i * 0.22, hz + 0.05 * Math.cos(i * 1.7), 0.5 + i * 0.03, dayR, dayG, dayB, (0.035 + 0.16 * smoke) * (1 - i / 8), 0, 1.3, i * 0.37, 0);
    // ---- wounds: blood soaking, pooling, thrown along the line of the hit; a man who burns
    const W = this.W = woundsOf(hits, CTX.battle), who = CTX.crew && CTX.crew.on ? CTX.crew.who : null;
    for (const r of ROLES) { const L = this.look[r] = lookOf(r, W, who ? who[r] : null, now, S); if (this.stains[r]) this.stains[r].visible = !!graphic && (L.n > 0 || L.down || L.hurt);
      if (L.onFire && !S.abandoned) { const M = MAN[r].frame === 'tur' ? MT : null; for (let i = 0; i < 9; i++) { const L2 = 0.45, a = ((now * (1 + 0.13 * i) + i * 0.37) % L2) / L2, part = i % 3 === 0 ? 'head' : i % 3 === 1 ? 'chest' : 'belly'; partAt(r, part, _a); Q.add(M, _a[0] + 0.1 * (hsh(i, 3) - 0.5), _a[1] + a * 0.4, _a[2] + 0.1 * (hsh(i, 5) - 0.5), 0.24 * (1 - a * 0.6), 2.6, 1.15 - 0.6 * a, 0.25, 0.7 * (1 - a), hsh(i, 9) * 6, 1.5, i * 0.3 + Math.floor(now * 9) * 0.1, 0); } this._light(M, _a[0], _a[1] + 0.2, _a[2], 2.2, 0.9, 0.2, 1.1); } }
    if (graphic) drawBlood(D, this.planes, W, this.look, now, MT);
    this._screens(S, MT);
    D.end(true); P.end(true); Q.end(true); B.end(true);
    // ---- light: the two strongest effect lights take lamps 1 and 2; breakers tripping; running on batteries; Halon whitens the haze
    const LP = SHARED.uLampPos.value, LC = SHARED.uLampCol.value, LR = SHARED.uLampR.value, hw = G.hul.matrixWorld;
    if (S.tripAge < 0.4) for (let i = 0; i < 3; i++) LC[i].multiplyScalar(0.04); else if (S.powerOut && !S.emergency) for (let i = 0; i < 3; i++) LC[i].multiplyScalar(0.55);
    let used = -1; for (let i = 0; i < 2; i++) { const l = this.L[i]; if (l.w <= 0.02) continue; let s = -1; for (let k = 3; k < LC.length; k++) if (k !== used && LC[k].x + LC[k].y + LC[k].z < 0.02) { s = k; break; }   /* a lamp that is dark this frame (a closed hatch's daylight, a dead display's glow) is used first; otherwise a dome lamp gives way */
      if (s < 0) s = 2 - i; used = s; LP[s].copy(l.p).applyMatrix4(hw); LC[s].copy(l.c); LR[s] = l.r; }
    if (S.halon) { const k = Math.exp(-S.halon.age / 5), c = SHARED.uSmokeCol.value, a = SHARED.uAmb.value, w = Math.min(0.85, 0.25 + 3 * (a.x + a.y + a.z)); c.set(c.x + (w - c.x) * k, c.y + (w - c.y) * k, c.z + (w * 1.04 - c.z) * k); }
    if (S.breach) { const k = Math.min(1, S.breach.age / 0.12); SHARED.uAmb.value.x += 1.0 * k; SHARED.uAmb.value.y += 0.38 * k; SHARED.uAmb.value.z += 0.08 * k; }
    // ---- the viewer in a seat: ringing ears, tunnel vision, blurred edges, shake
    const role = CTX.viewer, C = role ? concussion(hits, now, MAN[role].eye, MAN[role].frame) : null; if (C && S.breach) { C.tunnel = Math.max(C.tunnel, Math.min(1, S.breach.age / 0.9)); }
    this.view.deaf = C ? C.deaf : 0; this.view.tunnel = C ? C.tunnel : 0; this.view.shake = C ? C.shake : 0; this.view.blur = C ? C.blur : 0; this.view.flash = C ? C.flash : 0; this._overlay(C, now);
  }

  _hit(h, x, age, MT, dayR, dayG, dayB, smoke) {
    const D = this.decals, P = this.lit, Q = this.glow, B = this.bits, M = x.frame === 'tur' ? MT : null, p = x.pIn, n = x.nIn, d = x.d, Bx = BOX[x.frame]; if (!p) return;
    if (x.hidden) {   /* behind a bulkhead: the blow is felt, dust jumps off the bulkhead or the doors */
      if (age < 2.5) { const z = x.seen === 'doors' || h.zoneKey === 'turret_rear' ? 0.96 : 1.26, MM = x.frame === 'tur' ? MT : null, y0 = x.frame === 'tur' ? 0.2 : -0.6; for (let i = 0; i < 10; i++) { const u = age / 2.5, a = hsh(h.idx + i, 1) - 0.5; P.add(MM, a * 1.8, y0 + (hsh(h.idx + i, 2) - 0.5) * 0.5 - 0.15 * u, z - 0.25 * (1 - Math.exp(-2.5 * age)) * (0.5 + hsh(h.idx + i, 3)), 0.12 + 0.4 * u, 0.6, 0.57, 0.5, 0.3 * (1 - u), hsh(i, 4) * 6, 1, i * 0.21, 0); } }
      return; }
    if (!h.pen) {   /* the armour held: paint is knocked off the inside of the plate, dust and flakes come off every surface */
      D.add(M, p, n, 0.5, CELL.chips, 1, 0, 0.9, WHITE, 0, hsh(h.idx, 2) * 6.28);
      if (age < 3) { for (let i = 0; i < 14; i++) { const u = age / (1.6 + hsh(h.idx + i, 7)), k = (1 - Math.exp(-3 * age)) / 3, sp = 0.5 + 2.2 * hsh(h.idx + i, 1), ox = (hsh(h.idx + i, 2) - 0.5) * 0.5, oy = (hsh(h.idx + i, 3) - 0.5) * 0.5; if (u >= 1) continue;
          const t1x = Math.abs(n[0]) > 0.5 ? 0 : 1, t1z = Math.abs(n[0]) > 0.5 ? 1 : 0; P.add(M, p[0] + n[0] * (0.05 + sp * k) + t1x * ox, p[1] + n[1] * (0.05 + sp * k) + (Math.abs(n[1]) > 0.5 ? 0 : oy) - 0.1 * age, p[2] + n[2] * (0.05 + sp * k) + t1z * ox + (Math.abs(n[1]) > 0.5 ? oy : 0), 0.1 + 0.45 * u, 0.62, 0.6, 0.53, 0.42 * (1 - u) * h.s, hsh(i, 4) * 6, 1, i * 0.17, 0); }
        for (let i = 0; i < 46; i++) { const life = 0.5 + 2.4 * hsh(h.idx + i, 11), t = age - 0.25 * hsh(h.idx + i, 12); if (t < 0 || t > life) continue; const near = i < 18, fx = near ? p[0] + (hsh(h.idx + i, 13) - 0.5) * 0.9 * (1 - Math.abs(n[0])) + n[0] * 0.03 : Bx.x0 + hsh(h.idx + i, 13) * (Bx.x1 - Bx.x0), fz = near ? p[2] + (hsh(h.idx + i, 14) - 0.5) * 0.9 * (1 - Math.abs(n[2])) + n[2] * 0.03 : Bx.z0 + hsh(h.idx + i, 14) * (Bx.z1 - Bx.z0), fy0 = near ? p[1] + (hsh(h.idx + i, 15) - 0.3) * 0.5 : Bx.y1 - 0.02;
            const fall = 1.1 * (t - (1 - Math.exp(-2.2 * t)) / 2.2) + 0.2 * t, y = Math.max(Bx.y0 + 0.01, fy0 - fall); P.add(M, fx + 0.04 * Math.sin(t * 9 + i) + n[0] * 0.25 * (1 - Math.exp(-3 * t)) * (near ? 1 : 0), y, fz + 0.04 * Math.cos(t * 7 + i * 2) + n[2] * 0.25 * (1 - Math.exp(-3 * t)) * (near ? 1 : 0), 0.008 + 0.014 * hsh(i, 16), 0.86, 0.84, 0.74, 0.95 * sat((life - t) * 4), t * 6 + i, 0.5 + 0.5 * Math.abs(Math.sin(t * 11 + i)), i * 0.3, 1); } }
      return; }
    // ---- a penetration
    // the marks it leaves: scorch round the hole, the hole with torn metal, daylight in it, its lip glowing for a few seconds
    const turn = hsh(h.idx, 2) * 6.28, hot = 2.4 * Math.exp(-age / 1.4);
    D.add(M, p, n, 0.85, CELL.scorch, 1, 0, 0.95, WHITE, 0, turn); D.add(M, p, n, 0.42, CELL.hole, 1, 0, 1, WHITE, 0, turn, 1, 0.006); D.add(M, p, n, 0.42, CELL.day, 1, 1, 1, [dayR, dayG, dayB], 0, turn, 1, 0.008);
    if (hot > 0.02) D.add(M, p, n, 0.36, CELL.crater, 1, hot, sat(hot), WHITE, 0, turn, 1, 0.01);
    this._light(M, p[0] + n[0] * 0.12, p[1] + n[1] * 0.12, p[2] + n[2] * 0.12, dayR * 0.5 + hot * 0.5, dayG * 0.5 + hot * 0.2, dayB * 0.5, 0.55);
    for (let i = 0; i < 5; i++) Q.add(M, p[0] + d[0] * (0.1 + i * 0.22), p[1] + d[1] * (0.1 + i * 0.22), p[2] + d[2] * (0.1 + i * 0.22), 0.1 + i * 0.05, dayR, dayG, dayB, 0.22 * smoke * (1 - i / 6), 0, 1, i * 0.2, 0);   /* the daylight from the hole, seen in the smoke */
    if (x.far) { const f = x.pFar, fn = x.nFar, hot2 = 3 * Math.exp(-age / 2.2); D.add(M, f, fn, 0.6, CELL.scorch, 1, 0, 0.9, WHITE, 0, turn + 1); D.add(M, f, fn, 0.3, CELL.crater, 1, hot2, 1, WHITE, 0, turn + 2, 1, 0.006); if (hot2 > 0.05) this._light(M, f[0] + fn[0] * 0.1, f[1] + fn[1] * 0.1, f[2] + fn[2] * 0.1, hot2, hot2 * 0.4, hot2 * 0.08, 0.6); }
    // the jet itself: a white-hot line across the compartment for less than a tenth of a second, then a thin glowing trail
    if (age < 0.5) { const k = age < 0.09 ? 1 - age / 0.09 : 0, tr = age < 0.09 ? 1 : 1 - (age - 0.09) / 0.41; _v.set(p[0] + d[0] * x.run / 2, p[1] + d[1] * x.run / 2, p[2] + d[2] * x.run / 2); _d.set(d[0], d[1], d[2]);
      B.add(M, _v, _d, 0.003 + 0.011 * k, x.run, 4.2, 3.4 * (0.4 + 0.6 * k) + 0.6 * tr, 2.8 * k + 0.25 * tr, 0.25 * tr + k);
      if (age < 0.2) { const u = age / 0.2; Q.add(M, p[0] + n[0] * 0.1, p[1] + n[1] * 0.1, p[2] + n[2] * 0.1, 0.5 + 1.1 * u, 3.4, 2.8, 1.9, 1 - u, 0, 1, h.idx, 0); for (let i = 1; i < 4; i++) Q.add(M, p[0] + d[0] * x.run * i / 4, p[1] + d[1] * x.run * i / 4, p[2] + d[2] * x.run * i / 4, 0.25 + 0.5 * u, 3.2, 2.2, 1.0, 0.8 * (1 - u), i, 1, i, 0); this._light(M, p[0] + d[0] * 0.4, p[1] + d[1] * 0.4, p[2] + d[2] * 0.4, 6 * (1 - u), 4.4 * (1 - u), 2.4 * (1 - u), 2.2); } }
    // spall: fragments thrown from the hole in a cone round the jet's line; they glow, slow, fall, bounce on the floor and lie cooling
    if (age < 3.2) { const ux = Math.abs(d[1]) < 0.9 ? 0 : 1, uy = Math.abs(d[1]) < 0.9 ? 1 : 0; let ax = d[1] * 0 - d[2] * uy, ay = d[2] * ux - d[0] * 0, az = d[0] * uy - d[1] * ux; const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al; const bx = d[1] * az - d[2] * ay, by = d[2] * ax - d[0] * az, bz = d[0] * ay - d[1] * ax;
      for (let i = 0; i < 72; i++) { const life = 0.45 + 2.6 * hsh(h.idx + i, 4) * hsh(h.idx + i, 8); if (age > life) continue; const a = hsh(h.idx + i, 1) * 6.283, c = Math.tan(0.61) * Math.sqrt(hsh(h.idx + i, 2)), v = 3 + 15 * hsh(h.idx + i, 3) * hsh(h.idx + i, 6), ca = Math.cos(a) * c, sa = Math.sin(a) * c;
        let vx = d[0] + ax * ca + bx * sa, vy = d[1] + ay * ca + by * sa, vz = d[2] + az * ca + bz * sa; const vl = Math.hypot(vx, vy, vz); vx *= v / vl; vy *= v / vl; vz *= v / vl;
        const drag = (1 - Math.exp(-2.4 * age)) / 2.4; let px = clamp(p[0] + n[0] * 0.03 + vx * drag, Bx.x0 + 0.02, Bx.x1 - 0.02), pz = clamp(p[2] + n[2] * 0.03 + vz * drag, Bx.z0 + 0.02, Bx.z1 - 0.02);
        // up and down: free fall with bounces off the floor (each keeps a third of the speed)
        let y = p[1] + n[1] * 0.03, w = vy * 0.5, t = age, rest = false; for (let b = 0; b < 4; b++) { const disc = w * w + 2 * 9.8 * (y - Bx.y0 - 0.01), th = (w + Math.sqrt(Math.max(0, disc))) / 9.8; if (t < th) { y += w * t - 4.9 * t * t; w -= 9.8 * t; t = 0; break; } t -= th; y = Bx.y0 + 0.01; w = (9.8 * th - w) * 0.33; if (w < 0.4) { rest = true; break; } } if (rest || t > 0) { y = Bx.y0 + 0.01; w = 0; } if (y > Bx.y1 - 0.02) y = Bx.y1 - 0.02;
        const heat = Math.max(0, 1 - age / life), ve = Math.exp(-2.4 * age); _v.set(px, y, pz); _d.set(vx * ve, w, vz * ve); const sp = _d.length(); if (sp > 1e-3) _d.multiplyScalar(1 / sp); else _d.set(1, 0, 0);
        B.add(M, _v, _d, 0.004 + 0.006 * hsh(i, 9), 0.012 + Math.min(0.14, sp * 0.012), 3.2, 1.9 * heat, 0.5 * heat * heat, 0.25 + 0.75 * heat); }
      // the dust and smoke driven in with it
      for (let i = 0; i < 12; i++) { const u = age / (1.2 + 2 * hsh(h.idx + i, 21)); if (u >= 1) continue; const k = (1 - Math.exp(-2 * age)) / 2 * (2 + 5 * hsh(h.idx + i, 22)), c = 0.5 * (hsh(h.idx + i, 23) - 0.5), e = 0.5 * (hsh(h.idx + i, 24) - 0.5); P.add(M, clamp(p[0] + d[0] * k + ax * c * k + bx * e * k, Bx.x0, Bx.x1), clamp(p[1] + d[1] * k + ay * c * k + by * e * k + 0.15 * age, Bx.y0, Bx.y1), clamp(p[2] + d[2] * k + az * c * k + bz * e * k, Bx.z0, Bx.z1), 0.15 + 0.7 * u, 0.2, 0.19, 0.18, 0.5 * (1 - u), hsh(i, 25) * 6, 1, i * 0.23, 0); } }
    // smoke coming in through the hole and off the burnt lining: it rises to the roof and spreads under it
    { const str = h.kill ? 1 : Math.exp(-age / 7); if (str > 0.03) for (let i = 0; i < 14; i++) { const L = 2.6, t = age - i * L / 14; if (t < 0) continue; const a = (t % L), cyc = Math.floor(t / L), u = a / L, sd = h.idx + i * 3 + cyc * 7, rise = Math.min(Bx.y1 - 0.08 - p[1], 0.55 * a), out = Math.max(0, 0.55 * a - rise);
        P.add(M, clamp(p[0] + n[0] * (0.08 + 0.25 * (1 - Math.exp(-2 * a))) + (hsh(sd, 1) - 0.5) * (0.1 + out), Bx.x0 + 0.05, Bx.x1 - 0.05), p[1] + rise, clamp(p[2] + n[2] * (0.08 + 0.25 * (1 - Math.exp(-2 * a))) + (hsh(sd, 2) - 0.5) * (0.1 + out), Bx.z0 + 0.05, Bx.z1 - 0.05), 0.12 + 0.5 * u, 0.13, 0.125, 0.12, 0.55 * str * Math.sin(Math.PI * Math.min(1, u * 1.1)), hsh(sd, 3) * 6 + a * 0.4, 1, sd * 0.1, 0); } }
  }

  // electrical arcing, hydraulic fluid, a hit gun
  _systems(S, MT, now) {
    const P = this.lit, Q = this.glow, B = this.bits, D = this.decals;
    for (const a of S.arcs) { const M = a.at[3] === 'tur' ? MT : null, k = 1 - a.age / a.life, slot = Math.floor(now * 26), on = hsh(slot, a.seed) < 0.1 + 0.4 * k, x = a.at[0], y = a.at[1], z = a.at[2];
      if (on) { const j = hsh(slot, a.seed + 1) - 0.5; Q.add(M, x + j * 0.08, y + (hsh(slot, a.seed + 2) - 0.5) * 0.08, z, 0.035 + 0.05 * hsh(slot, 3), 2.4, 2.8, 3.8, 1, slot, 1, slot * 0.1, 0.6); this._light(M, x, y, z, 1.2, 1.8, 3.4, 1.0); }
      const bi = Math.floor(now * 2.5), bt = now - bi / 2.5; if (hsh(bi, a.seed + 5) < 0.25 + 0.5 * k) for (let i = 0; i < 9; i++) { const vx = (hsh(bi * 9 + i, 1) - 0.5) * 3, vy = 0.5 + 2.2 * hsh(bi * 9 + i, 2), vz = (hsh(bi * 9 + i, 3) - 0.5) * 3, life = 0.25 + 0.3 * hsh(i, bi); if (bt > life) continue;
        _v.set(x + vx * bt, y + vy * bt - 4.9 * bt * bt, z + vz * bt); _d.set(vx, vy - 9.8 * bt, vz).normalize(); B.add(M, _v, _d, 0.003, 0.03, 2.6, 2.4, 1.6, 1 - bt / life); } }
    const hy = S.hyd; if (hy) { const x = hy.at[0], y = hy.at[1], z = hy.at[2], a = hy.age, pr = Math.exp(-a / 3), dx = hsh(hy.seed, 1) - 0.5, dz = hsh(hy.seed, 2) - 0.2;
      if (a < HYD.sprayS) for (let i = 0; i < 22; i++) { const L = 0.55, t = ((a + i * L / 22) % L), u = t / L, sp = (3 + 4 * hsh(i, 7)) * pr + 0.6, k = (1 - Math.exp(-3 * t)) / 3, fx = dx + 0.5 * (hsh(i, 8) - 0.5), fz = dz + 0.5 * (hsh(i, 9) - 0.5); P.add(MT, x + fx * sp * k, y + sp * k * 0.9 - 2.5 * t * t, z + fz * sp * k, 0.03 + 0.16 * u, 0.5, 0.11, 0.07, 0.75 * (1 - u) * (0.3 + 0.7 * pr), i, 1, i * 0.4, 0.2); }
      const mist = sat(a / 1.5) * (1 - a / HYD.mistS); for (let i = 0; i < 9; i++) P.add(MT, x + (hsh(i, 31) - 0.5) * 1.3 + 0.05 * Math.sin(now * 0.3 + i), y + 0.25 + hsh(i, 32) * 0.75, z + (hsh(i, 33) - 0.5) * 1.2, 0.55, 0.55, 0.33, 0.26, 0.085 * mist, i, 1, i * 0.5, 0);
      D.add(MT, [x + dx * 0.3, BOX.tur.y0, z + dz * 0.3], UP, 0.9, CELL.fluid, sat(0.1 + a / 12), 0, 0.85, [0.3, 0.05, 0.035], 1, hsh(hy.seed, 4) * 6);
      if (hy.destroyed && a > HYD.flashAt && a < HYD.flashAt + HYD.flashS) { const u = (a - HYD.flashAt) / HYD.flashS, k = Math.sin(Math.PI * u); for (let i = 0; i < 12; i++) Q.add(MT, x + (hsh(i, 41) - 0.5) * (0.4 + 1.2 * u), y + 0.2 + hsh(i, 42) * 0.7 + 0.5 * u, z + (hsh(i, 43) - 0.5) * (0.4 + 1.2 * u), 0.35 + 0.5 * u, 2.8, 1.3 - 0.5 * u, 0.3, 0.75 * k, i + u * 3, 1, i * 0.3 + u, 0); this._light(MT, x, y + 0.5, z, 5 * k, 2.6 * k, 0.7 * k, 2.0); } }
    const g = S.gunHit; if (g) { const x = AT.gun[0], y = AT.gun[1], z = AT.gun[2] + 0.35;   /* recoil oil from the hit recuperator, then smoke off the breech */
      if (g.gun && g.age < 5) for (let i = 0; i < 10; i++) { const L = 0.5, t = ((g.age + i * L / 10) % L), u = t / L, pr = Math.exp(-g.age / 1.6); P.add(MT, x + (hsh(i, 51) - 0.5) * 0.5 * t * 3, y + 0.05 + (1.2 * pr) * t - 3 * t * t, z + (0.4 + hsh(i, 52)) * t * 2 * pr, 0.03 + 0.1 * u, 0.42, 0.2, 0.1, 0.7 * (1 - u) * pr, i, 1, i * 0.3, 0.2); }
      if (g.age < 40) for (let i = 0; i < 5; i++) { const L = 3, t = ((g.age + i * L / 5) % L), u = t / L; P.add(MT, x + 0.05 * Math.sin(t * 2 + i), y + 0.1 + 0.25 * t, z - 0.1 + 0.04 * i, 0.08 + 0.3 * u, 0.3, 0.29, 0.28, 0.3 * (1 - u) * (1 - g.age / 40), i + t, 1, i * 0.6, 0); } }
  }

  // fire by place, the Halon blast, burning ammunition behind its doors, the doors breached
  _fires(S, MT, now) {
    const P = this.lit, Q = this.glow, D = this.decals;
    for (const f of S.fires) { const hal = S.halon && S.halon.age > 0.4 ? 0.3 + 0.7 * sat((S.halon.age - 5) / 4) : 1, k = f.on ? sat(f.age / 1.2) * hal : 0, fl = 0.75 + 0.25 * Math.sin(now * 23 + f.since) * Math.sin(now * 7.1);
      if (f.where === 'hull') {   /* a fuel cell burns through the driver's side wall (the cells flank him, behind the panels marked FUEL TANK); the hull rack burns at its doors */
        const sd = f.side, cell = sd !== 0, nx = cell ? -sd : 0, nz = cell ? 0 : -1, x = cell ? sd * 0.49 : AT.hull_ammo[0], y = cell ? -0.72 : AT.hull_ammo[1], z = cell ? -2.38 : AT.hull_ammo[2] - 0.06, N3 = [nx, 0, nz];
        const W1 = (ox, oz) => [x + nx * ox + (cell ? 0 : 0), 0, z + nz * ox + oz];   /* a point ox in from the wall, oz along it */
        D.add(null, [x, y + 0.15, z], N3, 1.0, CELL.char, sat(f.age / 4), f.on ? 1.2 * k * fl : 0, 0.95, WHITE, 0, 1.3); D.add(null, [x, y + 0.55, z + (cell ? 0.1 : 0)], N3, 0.9, CELL.soot, sat(f.age / 6), 0, 0.9, WHITE, 0, 0, 1.4);
        if (k > 0.02) {   /* flames licking out of the burnt-through panel: tongues that leave the wall, rise, lean in and burn out; a hot core at the hole; embers */
          const Bb = this.bits; for (let i = 0; i < 30; i++) { const L = 0.38 + 0.3 * hsh(i, 1), t = ((now * (1 + 0.07 * i) + i * 0.31) % L), u = t / L, cyc = Math.floor((now * (1 + 0.07 * i) + i * 0.31) / L), sd = i * 7 + cyc * 13, a = W1(0.04 + 0.12 * hsh(sd, 3) + (0.25 + 0.35 * hsh(sd, 5)) * u, (hsh(sd, 2) - 0.5) * 0.6 + 0.06 * Math.sin(now * 6 + i)); Q.add(null, a[0], y - 0.15 + u * (0.55 + 0.45 * k), a[2], (0.26 - 0.1 * u) * (0.6 + 0.4 * k), 3.0, 1.35 - 0.85 * u, 0.3 - 0.25 * u, 0.9 * k * (1 - u * u), (hsh(sd, 4) - 0.5) * 0.6, 2.2 + 0.8 * hsh(sd, 6), sd * 0.13, 0); }
          for (let i = 0; i < 6; i++) { const a = W1(0.03, (hsh(i, 11) - 0.5) * 0.35); Q.add(null, a[0], y + (hsh(i, 12) - 0.3) * 0.3, a[2], 0.22, 3.4, 2.4, 0.9, 0.7 * k * fl, now * 2 + i, 1.2, i + Math.floor(now * 9), 0); }
          for (let i = 0; i < 14; i++) { const L = 1.1 + 0.6 * hsh(i, 21), t = ((now + i * 0.37) % L), cyc = Math.floor((now + i * 0.37) / L), sd = i * 5 + cyc * 11, vo = 0.4 + 0.8 * hsh(sd, 22), vs = (hsh(sd, 23) - 0.5) * 0.8, a = W1(vo * t, vs * t); _v.set(a[0], y + 0.1 + 1.1 * t - 0.6 * t * t, a[2]); _d.set(nx * vo + (cell ? 0 : vs), 1.1 - 1.2 * t, nz * vo + (cell ? vs : 0)).normalize(); Bb.add(null, _v, _d, 0.006, 0.02, 3.2, 1.4, 0.3, k * (1 - t / L)); }
          this._light(null, x + nx * 0.3, y + 0.25, z + nz * 0.3, 4.2 * k * fl, 1.9 * k * fl, 0.45 * k * fl, 1.9); }
        if (f.on || f.out < 12) { const sk = f.on ? 0.35 + 0.65 * k : Math.exp(-f.out / 4), top = cell ? BOX.drv.y1 : BOX.hul.y1; for (let i = 0; i < 24; i++) { const Lp = 2.4, t = ((now + i * Lp / 24) % Lp), u = t / Lp, rise = Math.min(top - 0.08 - y - 0.1, 0.9 * t), spread = Math.max(0, 0.9 * t - rise), a = W1(0.12 + 0.25 * u + spread * 0.8 * hsh(i, 9), (hsh(i, 7) - 0.4) * (0.25 + 0.7 * u) + (cell ? spread * (hsh(i, 10) - 0.5) : 0)); P.add(null, a[0] + (hsh(i, 6) - 0.5) * 0.15, y + 0.1 + rise, a[2], 0.18 + 0.55 * u, 0.05, 0.045, 0.04, 0.78 * sk * Math.sin(Math.PI * Math.min(1, u * 1.3)), hsh(i, 8) * 6 + t * 0.5, 1, i * 0.29, 0); } } }   /* dark smoke pouring off it, rising, then rolling along under the roof */
      else if (f.where === 'engine') { const k2 = f.on ? sat(f.age / 3) : Math.exp(-f.out / 6);   /* behind the bulkhead: its seams glow, smoke comes round its edges */
        D.add(null, [0, -0.62, 1.285], [0, 0, -1], 1.9, CELL.seam, 1, 1.6 * k2 * fl, sat(k2 * 1.5), [1, 0.6, 0.3], 0, 0, 0.42);
        if (k2 > 0.03) { this._light(null, 0, -0.6, 1.05, 2.6 * k2 * fl, 0.9 * k2 * fl, 0.2 * k2 * fl, 1.5); for (let i = 0; i < 10; i++) { const L = 2.8, t = ((now + i * L / 10) % L), u = t / L; P.add(null, (hsh(i, 61) - 0.5) * 2.0, -0.3 - 0.05 * u, 1.24 - 0.5 * t * 0.6, 0.15 + 0.5 * u, 0.1, 0.095, 0.09, 0.5 * k2 * Math.sin(Math.PI * u), i + t * 0.4, 1, i * 0.33, 0); } } } }
    // Halon: a white blast from the nozzles, then a cold fog
    const ha = S.halon; if (ha && ha.age < HALON.blastS + 0.5) { const k = ha.age < HALON.blastS ? 1 : 1 - (ha.age - HALON.blastS) / 0.5;
      for (const [nx, ny, nz, dx, dy, dz, M] of [[0.95, -0.34, -0.5, -1, -0.5, -0.4, null], [-0.95, -0.34, -0.5, 1, -0.5, -0.4, null], [0.36, -0.52, -1.9, -0.4, -0.3, -1, null], [0, 0.48, 0.55, 0, -1, -0.3, MT]]) for (let i = 0; i < 12; i++) { const L = 0.4, t = ((ha.age + i * L / 12) % L), u = t / L, kk = (1 - Math.exp(-5 * t)) / 5 * 9;
        P.add(M, nx + dx * kk + (hsh(i, 71) - 0.5) * kk * 0.5, ny + dy * kk + (hsh(i, 72) - 0.5) * kk * 0.4, nz + dz * kk + (hsh(i, 73) - 0.5) * kk * 0.5, 0.06 + 0.6 * u, 1.5, 1.55, 1.6, 0.8 * k * (1 - u), i, 1, i * 0.21, 0); } }
    // ammunition burning behind the doors: light and smoke at every seam, the whole bulkhead lit from behind
    const bl = S.blow; if (bl && !S.breach) { const k = bl.on ? sat(bl.age / 0.4) : Math.exp(-(bl.age - 15) / 5), st = 0.55 + 0.45 * hsh(Math.floor(now * 38), 3);
      if (k > 0.02) { for (const sx of [-0.575, 0.575]) D.add(MT, [sx, 0.24, 0.975], [0, 0, -1], 1.12, CELL.seam, 1, 5 * k * st, 1, [1, 0.85, 0.6], 0, 0, 0.46);
        this._light(MT, 0, 0.3, 0.8, 5.5 * k * st, 3.6 * k * st, 1.6 * k * st, 2.0);
        for (let i = 0; i < 10; i++) { const L = 1.6, t = ((now + i * L / 10) % L), u = t / L; P.add(MT, (hsh(i, 81) - 0.5) * 2.2, 0.48 - 0.1 * hsh(i, 82) + 0.1 * u, 0.95 - 0.5 * t, 0.1 + 0.45 * u, 0.2, 0.19, 0.18, 0.5 * k * Math.sin(Math.PI * u), i + t, 1, i * 0.4, 0); }
        for (let i = 0; i < 24; i++) { const L = 1.4, t = ((now * 1.0 + i * L / 24) % L), cyc = Math.floor((now + i * L / 24) / L), sd = i * 5 + cyc * 13; P.add(MT, BOX.tur.x0 + hsh(sd, 1) * 2.4, Math.max(BOX.tur.y0, BOX.tur.y1 - 0.02 - 0.9 * t * t - 0.2 * t), BOX.tur.z0 + hsh(sd, 2) * 2.3, 0.008 + 0.012 * hsh(sd, 3), 0.86, 0.84, 0.74, 0.9 * k, t * 7 + i, 0.6, sd * 0.1, 1); } } }   /* and the roar shakes the paint off the roof */
    // the doors breached: the fire comes through into the fighting compartment
    // the doors breached: a wall of fire comes through the doors and across the fighting compartment at the men, dark smoke behind it.
    // ASSUMED for the picture only: the front crosses the 2.35 m of the compartment at about 5 m/s; nothing here changes an outcome.
    const br = S.breach; if (br) { const a = br.age, Tz = BOX.tur, front = Math.max(Tz.z0 - 0.2, 1.0 - 5 * a), k = sat(a / 0.06), Bb = this.bits;
      for (let i = 0; i < 80; i++) { const sd = i * 3 + Math.floor(now * 16 + i * 0.37) * 7, z = Math.max(Tz.z0 + 0.05, front + hsh(sd, 1) * 0.45 - 0.08), u = sat((1.0 - z) / 2.3);   /* the wall itself: a turbulent sheet of flame */
        Q.add(MT, (hsh(sd, 2) - 0.5) * 2.3, Tz.y0 + 0.15 + hsh(sd, 3) * 1.4, z, 0.4 + 0.6 * hsh(sd, 4), 3.2, 1.45 - 0.6 * u, 0.32 - 0.2 * u, 0.55 * k, (hsh(sd, 5) - 0.5) * 0.8, 1.6, sd * 0.07, 0); }
      for (let i = 0; i < 12; i++) { const sd = i * 11 + Math.floor(now * 10 + i * 0.41) * 5, z = Math.max(Tz.z0, front - 0.25 * hsh(sd, 1)); Q.add(MT, (hsh(sd, 2) - 0.5) * 2.0, Tz.y0 + 0.4 + hsh(sd, 3) * 1.0, z, 0.25 + 0.3 * hsh(sd, 4), 3.4, 2.2, 0.8, 0.6 * k, (hsh(sd, 5) - 0.5) * 1.2, 2.6, sd * 0.11, 0); }   /* tongues ahead of it */
      for (let i = 0; i < 34; i++) { const sd = i * 5 + Math.floor(now * 3 + i * 0.29) * 3, z = Math.min(0.95, front + 0.45 + hsh(sd, 1) * Math.max(0.05, 0.95 - front - 0.45)); if (z <= front + 0.3) continue; P.add(MT, (hsh(sd, 2) - 0.5) * 2.3, Tz.y0 + 0.3 + hsh(sd, 3) * 1.25, z, 0.5 + 0.5 * hsh(sd, 4), 0.06, 0.05, 0.045, 0.75, hsh(sd, 5) * 6 + now * 0.3, 1, sd * 0.05, 0); }   /* dense dark smoke behind the front */
      for (let i = 0; i < 24; i++) { const L = 0.6, t = ((now + i * L / 24) % L), cyc = Math.floor((now + i * L / 24) / L), sd = i * 7 + cyc * 13; _v.set((hsh(sd, 1) - 0.5) * 2.0, Tz.y0 + 0.4 + hsh(sd, 2) * 1.0 + 0.5 * t, front - 3.5 * t); if (_v.z < Tz.z0) continue; _d.set((hsh(sd, 3) - 0.5) * 0.4, 0.15, -1).normalize(); Bb.add(MT, _v, _d, 0.007, 0.05, 3.4, 1.6, 0.4, k * (1 - t / L)); }   /* burning grains thrown ahead */
      this._light(MT, 0, 0.2, Math.max(front - 0.2, Tz.z0 + 0.2), 8 * k, 3.0 * k, 0.7 * k, 2.6); this._light(null, 0, -0.7, -0.4, 3 * k, 1.1 * k, 0.25 * k, 2.6);
      for (const sx of [-0.575, 0.575]) D.add(MT, [sx, 0.24, 0.975], [0, 0, -1], 1.12, CELL.day, 1, 6, 1, [1, 0.6, 0.25], 0, sx, 0.46); }
  }

  // loose kit thrown by every blow, and the things that hang from the roof swinging with the hull
  _kit(S, MT, now) {
    const K = this.kit, hits = S.hits, q = this._q, e = this._e; K.visible = true; let n = 0;
    for (let i = 0; i < KIT.length; i++) { const it = KIT[i], Bx = BOX[it[6]]; let x = it[0], z = it[2], y = 0, yaw = hsh(i, 1) * 6.28, tip = 0, roll = 0;
      for (const h of hits) { const a = now - h.T; if (a < 0) break; const s = h.minor ? h.s * 0.25 : h.s * (h.pen ? 1 : 0.8), u = sat(a / 0.5), sd = h.idx + i * 17, dx = (hsh(sd, 1) - 0.5) * 0.3 * s, dz = (hsh(sd, 2) - 0.5) * 0.3 * s; if (s < 0.06) continue;
        x = clamp(x + dx * u, Bx.x0 + 0.25, Bx.x1 - 0.25); z = clamp(z + dz * u, Bx.z0 + 0.25, Bx.z1 - 0.25); yaw += (hsh(sd, 3) - 0.5) * 1.6 * s * u; if (u < 1) y += 4 * u * (1 - u) * 0.16 * s * hsh(sd, 4); if (hsh(sd, 5) < 0.3 * s) tip += (u < 1 ? u : 1) * Math.PI / 2 * (hsh(sd, 6) < 0.5 ? 1 : -1); else if (u < 1) roll += Math.sin(u * Math.PI) * 0.5 * s; }
      if (i === 0 || i === 4) {   /* the water cans: one that stands in a spall cone is holed, runs out in thin jets and leaves a pool */
        for (const h of hits) { const a = now - h.T; if (a < 0) break; if (!h.pen || h.minor) continue; const hx = detail(h); if (hx.hidden || (hx.frame === 'tur') !== (it[6] === 'tur')) continue; const p = hx.pIn, d = hx.d, ax = it[0] - p[0], ay = it[1] + 0.13 - p[1], az = it[2] - p[2], al = ax * d[0] + ay * d[1] + az * d[2]; if (al < 0 || al > hx.run + 0.4) continue; const off = Math.hypot(ax - d[0] * al, ay - d[1] * al, az - d[2] * al); if (off > 0.15 + 0.7 * al) continue;
          const M = it[6] === 'tur' ? MT : null, lvl = Math.exp(-a / 5); if (a < 16) for (let k = 0; k < 8; k++) { const L = 0.45, t = ((a + k * L / 8) % L), u = t / L, sx = (k % 2 ? 1 : -1) * (0.5 + 0.3 * hsh(k, 3)) * lvl; this.lit.add(M, x + sx * t * 1.2, it[1] + 0.06 + 0.16 * lvl * (k % 3) / 2 + 0.3 * lvl * t - 4.9 * t * t, z + (hsh(k, 4) - 0.5) * 0.3 * t, 0.012 + 0.03 * u, 0.75, 0.8, 0.85, 0.5 * lvl * (1 - u), k, 1, k * 0.3, 0.6); }
          _a[0] = x; _a[1] = (it[6] === 'tur' ? BOX.tur.y0 : BOX.hul.y0); _a[2] = z; this.decals.add(M, _a, UP, 0.75, CELL.fluid, sat(0.08 + a / 14), 0, 0.5, [0.16, 0.17, 0.17], 1, hsh(h.idx, 9) * 6); break; } }
      const lying = Math.abs(Math.sin(tip)) > 0.5, hh = lying ? it[5] : it[4]; _v.set(x, it[1] + hh / 2 + y, z); q.setFromEuler(e.set(tip, yaw, roll, 'YXZ')); this._s.set(it[3], it[4], it[5]); _m.compose(_v, q, this._s); if (it[6] === 'tur') _m.premultiply(MT); K.setMatrixAt(n++, _m); }
    for (let i = 0; i < HANG.length; i++) { const it = HANG[i], L = it[7]; let ang = 0, ang2 = 0;
      for (const h of hits) { const a = now - h.T; if (a < 0) break; if (a > 14) continue; const w = Math.sqrt(9.8 / L), amp = Math.min(0.9, 0.5 * h.s) * Math.exp(-a / 4); ang += amp * Math.sin(w * a) * (hsh(h.idx + i, 1) < 0.5 ? 1 : -1); ang2 += amp * 0.5 * Math.sin(w * a * 0.93 + 1) * (hsh(h.idx + i, 2) < 0.5 ? 1 : -1); }
      const M = it[6] === 'tur' ? MT : null; q.setFromEuler(e.set(ang, 0, ang2, 'XYZ'));
      _v.set(0, -L / 2, 0).applyQuaternion(q).add(_d.set(it[0], it[1], it[2])); this._s.set(0.012, L, 0.004); _m.compose(_v, q, this._s); if (M) _m.premultiply(M); K.setMatrixAt(n++, _m);
      _v.set(0, -L - it[4] / 2, 0).applyQuaternion(q).add(_d); this._s.set(it[3], it[4], it[5]); _m.compose(_v, q, this._s); if (M) _m.premultiply(M); K.setMatrixAt(n++, _m); }
    K.count = n; K.instanceMatrix.needsUpdate = true;
  }

  // cracked glass on the displays a hit has killed or damaged; sights whited out for a moment by a burst close by
  _screens(S, MT) {
    if (!this.screens) { this.screens = []; for (const g of [this.G.tur, this.G.hul]) for (const o of g.children) { const u = o.isMesh && o.material && o.material.uniforms; if (u && u.uBright && o.geometry && o.geometry.parameters && o.geometry.parameters.width) this.screens.push({ o, u, tur: g === this.G.tur, w: o.geometry.parameters.width, h: o.geometry.parameters.height, i: this.screens.length }); } }
    let any = false, weak = false; for (const k in S.cracked) { any = true; if (!S.dark[k]) weak = true; } const D = this.decals;
    for (const s of this.screens) { const u = s.u; if (S.optics > 0.02 && u.uHasLive && u.uHasLive.value > 0.5 && u.uBright.value > 0) u.uBright.value *= 1 + 5 * S.optics;
      if (!any) continue; const dark = u.uBright.value === 0, wk = u.uWeak && u.uWeak.value > 0; if (!dark && !(wk && weak)) continue;
      _v.set(0, 0, 1).applyQuaternion(s.o.quaternion); _n[0] = _v.x; _n[1] = _v.y; _n[2] = _v.z; _a[0] = s.o.position.x + s.w * (hsh(s.i, 1) - 0.5) * 0.3; _a[1] = s.o.position.y + s.h * (hsh(s.i, 2) - 0.5) * 0.3; _a[2] = s.o.position.z;
      D.add(s.tur ? MT : null, _a, _n, Math.max(s.w, s.h) * (dark ? 1.25 : 0.8), CELL.crack, 1, dark ? 0.05 : 0.25, dark ? 0.95 : 0.7, WHITE, 1, hsh(s.i, 3) * 6.28, 1, 0.003); }
  }

  // The viewer's own head after a blow: vision closing in from the edges, the edges blurred, the picture shaking, a white-out at
  // the instant of a penetration. One fixed layer over the 3D picture (under the displays' text), touched only while it shows.
  _overlay(C, now) {
    if (this.noOv || typeof document === 'undefined' || !document.body || !document.body.appendChild || !document.createElement) return;
    const on = !!C && (C.tunnel > 0.015 || C.flash > 0.01 || C.shake > 0.01 || C.blur > 0.02);
    if (!on) { if (this.ov && this.ovOn) { this.ovOn = false; this.ov.style.display = 'none'; const cv = document.getElementById('view'); if (cv && cv.style) cv.style.transform = ''; } return; }
    if (!this.ov) { const el = this.ov = document.createElement('div'); if (!el || !el.style || !el.appendChild) { this.ov = null; this.noOv = true; return; } el.id = 'concuss'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;display:none'; const bl = this.ovB = document.createElement('div'); bl.style.cssText = 'position:absolute;inset:0'; const wh = this.ovW = document.createElement('div'); wh.style.cssText = 'position:absolute;inset:0;background:#fff8ec;opacity:0'; el.appendChild(bl); el.appendChild(wh); document.body.appendChild(el); }
    if (!this.ovOn) { this.ovOn = true; this.ov.style.display = 'block'; }
    const t = Math.round(C.tunnel * 50) / 50, b = Math.round(C.blur * 20) / 20, f = Math.round(C.flash * 25) / 25, key = t + '|' + b;
    if (key !== this.ovKey) { this.ovKey = key; const inner = Math.round(78 - 58 * t), outer = Math.round(118 - 52 * t), px = (b * 3).toFixed(1), mask = `radial-gradient(ellipse at center, transparent ${Math.round(42 - 22 * b)}%, #000 ${Math.round(88 - 20 * b)}%)`;
      this.ov.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${inner}%, rgba(4,2,2,${(0.12 + 0.5 * t).toFixed(2)}) ${outer}%)`;
      const s = this.ovB.style; if (b > 0.04) { s.backdropFilter = s.webkitBackdropFilter = `blur(${px}px)`; s.maskImage = s.webkitMaskImage = mask; } else { s.backdropFilter = s.webkitBackdropFilter = 'none'; } }
    if (f !== this.ovF) { this.ovF = f; this.ovW.style.opacity = (0.3 * f).toFixed(2); }   /* only a brief brightening: the flash itself is drawn in the compartment, at the hole */
    const cv = document.getElementById('view'); if (cv && cv.style) { const k = C.shake * 9; cv.style.transform = k > 0.15 ? `translate(${(Math.sin(now * 61) * k).toFixed(1)}px, ${(Math.sin(now * 47 + 1) * k).toFixed(1)}px)` : ''; }
  }
}
