// Wounds: where on each man the damage report's hit landed, of what kind, and the blood that follows.
//
// The damage report (src/dmg.js) says only WHO a hit hurt and how badly ("wounded", "killed"), with the entry point and the line of
// the jet. This module answers the display question "where on his body, and what does it look like", from the same geometry:
// each man is a set of body parts at his seat (head, chest, belly, upper arms, forearms, thighs, shins), the jet is a line, the spall
// a cone round it. It never changes who is hurt or how badly: a man the report calls "killed" was in the jet (dmg.js: within 0.15 m
// plus 0.6 of his radius) and gets a wound through the trunk or head, the part the line passes closest to; a man it calls "wounded"
// was in the spall cone and gets fragment wounds on the parts that face the line, nearest first. A limb the line passes within
// LIMB_M of is taken off at the joint above (forearm with the hand, or the leg below the knee): that is what a shaped-charge jet
// does to what it touches. No other dismemberment is shown (the owner left the limit to this module: limbs yes, nothing else).
// Burns: a man within FLASH_M of the jet's line is flash-burnt on the side facing it; a man in a compartment that is on fire and
// who cannot leave (out of action or dead) burns for as long as the fire does.
// ASSUMPTIONS: the body-part offsets below (seated men, the driver lying back), LIMB_M 0.10, FLASH_M 0.45, fragment counts 2 to 4.
import { detail, hsh, BOX } from './interior_events.js';

export const LIMB_M = 0.10, FLASH_M = 0.45;
// body parts in the man's own frame, from his eye point: [to his right, up, forward, radius]; the bone (figure.js name) that carries each
const SEATED = { head: [0, -0.02, -0.08, 0.11], chest: [0, -0.3, -0.1, 0.17], belly: [0, -0.52, -0.08, 0.15], armL: [-0.21, -0.32, -0.04, 0.07], armR: [0.21, -0.32, -0.04, 0.07], foreL: [-0.2, -0.42, 0.2, 0.06], foreR: [0.2, -0.42, 0.2, 0.06],
  thighL: [-0.1, -0.66, 0.2, 0.09], thighR: [0.1, -0.66, 0.2, 0.09], shinL: [-0.1, -0.9, 0.42, 0.07], shinR: [0.1, -0.9, 0.42, 0.07] };
const LYING = { head: [0, -0.02, -0.08, 0.11], chest: [0, -0.2, 0.18, 0.17], belly: [0, -0.33, 0.4, 0.15], armL: [-0.22, -0.22, 0.25, 0.07], armR: [0.22, -0.22, 0.25, 0.07], foreL: [-0.2, -0.15, 0.5, 0.06], foreR: [0.2, -0.15, 0.5, 0.06],
  thighL: [-0.1, -0.3, 0.65, 0.09], thighR: [0.1, -0.3, 0.65, 0.09], shinL: [-0.1, -0.45, 0.95, 0.07], shinR: [0.1, -0.45, 0.95, 0.07] };
export const PART_BONE = { head: 'Head', chest: 'Spine2', belly: 'Spine', armL: 'LeftArm', armR: 'RightArm', foreL: 'LeftForeArm', foreR: 'RightForeArm', thighL: 'LeftUpLeg', thighR: 'RightUpLeg', shinL: 'LeftLeg', shinR: 'RightLeg' };
export const PART_NAME = { head: 'head', chest: 'chest', belly: 'abdomen', armL: 'left upper arm', armR: 'right upper arm', foreL: 'left forearm', foreR: 'right forearm', thighL: 'left thigh', thighR: 'right thigh', shinL: 'left leg', shinR: 'right leg' };
const TRUNK = { head: 1, chest: 1, belly: 1 }, LIMB = { foreL: 1, foreR: 1, shinL: 1, shinR: 1 };
// where each man sits (his eye, as interior_build.js SEATS) and which way he faces (degrees, 0 = along the gun, + = to his right)
export const MAN = {
  gnr: { eye: [0.63, 0.2, -0.5], face: 0, frame: 'tur', parts: SEATED }, cdr: { eye: [0.52, 0.38, 0.38], face: 0, frame: 'tur', parts: SEATED },
  ldr: { eye: [-0.66, 0.34, 0.3], face: 50, frame: 'tur', parts: SEATED }, drv: { eye: [0, -0.57, -2.53], face: 0, frame: 'hul', parts: LYING },
};
export const ROLES = ['cdr', 'gnr', 'ldr', 'drv'];
// a part's place in the interior's frame
export function partAt(role, part, out) { const m = MAN[role], p = m.parts[part], a = m.face * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); out[0] = m.eye[0] + p[0] * c + p[2] * s; out[1] = m.eye[1] + p[1]; out[2] = m.eye[2] + p[0] * s - p[2] * c; return out; }
// a direction of the interior's frame, in the man's own [right, up, forward]
function toOwn(role, v, out) { const a = MAN[role].face * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); out[0] = v[0] * c + v[2] * s; out[1] = v[1]; out[2] = v[0] * s - v[2] * c; return out; }

const _p = [0, 0, 0], _t = [0, 0, 0];
// The wounds one hit gives one man. Returns null if the report did not hurt him.
function woundsOfHit(h, role) {
  const st = h.crew && h.crew[role]; if (!st || st === 'ok') return null;
  const x = detail(h), m = MAN[role], killed = st === 'killed', o = m.frame === 'tur' ? x.eT : x.eH, d = m.frame === 'tur' ? x.dT : x.dH, out = [];
  const near = [];   /* every part: how far the jet's line passes from it, and from which side */
  for (const part in m.parts) { if (!o) { near.push({ part, dist: 0.3 + hsh(h.idx, part.length) * 0.3, side: [hsh(h.idx, 3) - 0.5, 0.2, 0.6] }); continue; }
    partAt(role, part, _p); const ax = _p[0] - o[0], ay = _p[1] - o[1], az = _p[2] - o[2], t = Math.max(0, ax * d[0] + ay * d[1] + az * d[2]), sx = o[0] + d[0] * t - _p[0], sy = o[1] + d[1] * t - _p[1], sz = o[2] + d[2] * t - _p[2], dist = Math.hypot(sx, sy, sz);
    // the side the fragments come from: toward the line where it is off to one side, otherwise back along it (toward the hole)
    const k = Math.min(1, dist / 0.12); _t[0] = sx / (dist || 1) * k - d[0] * (1 - k * 0.6); _t[1] = sy / (dist || 1) * k - d[1] * (1 - k * 0.6); _t[2] = sz / (dist || 1) * k - d[2] * (1 - k * 0.6); const l = Math.hypot(_t[0], _t[1], _t[2]) || 1; _t[0] /= l; _t[1] /= l; _t[2] /= l;
    near.push({ part, dist, side: toOwn(role, _t, [0, 0, 0]) }); }
  near.sort((a, b) => a.dist - b.dist);
  const add = (n, kind, sev) => out.push({ part: n.part, kind, sev, side: n.side, T: h.T, idx: h.idx, dist: n.dist });
  if (killed) { const trunk = near.find(n => TRUNK[n.part]); add(trunk, 'trauma', 1);
    for (const n of near) { if (LIMB[n.part] && n.dist < LIMB_M + 0.04) add(n, 'sever', 1); else if (n !== trunk && n.dist < 0.3 && out.length < 5) add(n, 'frag', 0.8); } }
  else { let cut = false; const want = 2 + Math.floor(hsh(h.idx, role.charCodeAt(0)) * 3);
    for (const n of near) { if (out.length >= want) break; if (LIMB[n.part] && n.dist < LIMB_M && !cut) { add(n, 'sever', 1); cut = true; continue; }
      if (n.part === 'head' && hsh(h.idx, 41) < 0.6) continue;   /* the helmet takes most of what comes at the head */
      add(n, 'frag', TRUNK[n.part] ? 0.45 : 0.7); } }
  if (near[0].dist < FLASH_M) { const n = near.find(q => q.part === 'head' || q.part === 'armL' || q.part === 'armR') || near[0]; out.push({ part: n.part, kind: 'burn', sev: 1 - near[0].dist / FLASH_M, side: n.side, T: h.T, idx: h.idx, dist: n.dist }); }
  return { list: out, dir: toOwn(role, d || [0, 0, 1], [0, 0, 0]), killed, T: h.T, idx: h.idx, o, d };
}

// Every wound of every man from the list of hits (worked out once per list and kept on it): { cdr: W, gnr: W, ldr: W, drv: W }
// W = { list: [{ part, kind 'frag' | 'trauma' | 'sever' | 'burn', sev 0..1, side [right, up, forward], T, idx }], T0 (first wound), Tk (killed at, or null),
//       dir (the line of the worst hit in his own frame), idx, sever: { foreL: T, ... }, o, d (that line in the interior's frame) }
export function woundsOf(hits, battle) {
  if (!hits) return EMPTY; const E = battle && battle.events, nE = E ? E.length : 0; if (hits._w && hits._wn === hits.length && hits._we === nE) return hits._w;
  const W = {}; for (const r of ROLES) W[r] = { list: [], T0: null, Tk: null, dir: [0, 0, 1], idx: 0, sever: {}, o: null, d: null, hatch: null };
  for (const h of hits) { if (h.minor || !h.pen) continue; for (const r of ROLES) { const w = woundsOfHit(h, r); if (!w) continue; const M = W[r];
    for (const q of w.list) { if (q.kind === 'sever') { if (M.sever[q.part] != null) continue; M.sever[q.part] = q.T; } M.list.push(q); }
    if (M.T0 == null) M.T0 = h.T; if (w.killed && M.Tk == null) M.Tk = h.T; if (w.killed || M.o == null) { M.dir = w.dir; M.idx = w.idx; M.o = w.o; M.d = w.d; } } }
  // the loader shot in his open hatch (the crew model's own event): a bullet or a fragment in the shoulder or neck, from the front and above
  if (E) for (let i = 0; i < nE; i++) { const e = E[i]; if (e.type !== 'loader_hit') continue; const M = W.ldr, k = hsh(e.t, 7); if (M.hatch != null) continue; M.hatch = e.t; if (M.T0 == null) M.T0 = e.t;
    M.list.push({ part: k < 0.5 ? 'chest' : 'armL', kind: 'frag', sev: 0.9, side: [k < 0.5 ? 0.2 : -0.6, 0.6, 0.6], T: e.t, idx: 900 + i, dist: 0 }); if (k < 0.3) M.list.push({ part: 'head', kind: 'frag', sev: 0.6, side: [0.3, 0.2, 0.9], T: e.t, idx: 950 + i, dist: 0 }); if (M.o == null) { M.dir = [0, -0.5, -0.8]; M.idx = 900 + i; } }
  hits._w = W; hits._wn = hits.length; hits._we = nE; return W;
}
const EMPTY = {}; for (const r of ROLES) EMPTY[r] = { list: [], T0: null, Tk: null, dir: [0, 0, 1], idx: 0, sever: {}, o: null, d: null, hatch: null };

// How each man is, for drawing, at battle time `now`: the wounds he has by then and what the crew model says of him.
//   who: battle.crewState().who[role] or null; fires: insideState().fires; breach: insideState().breach
// Returns { hurt (wounded, at his post), down (out of action or dead), dead, since (first wound), downAt, n (wounds so far), bleed 0..1 (how much
//   blood has run), burn 0..1 (charring), soot 0..1, onFire, worst (the worst wound so far) }
const LOOK = {}; for (const r of ROLES) LOOK[r] = { hurt: false, down: false, dead: false, since: null, downAt: null, n: 0, bleed: 0, burn: 0, soot: 0, onFire: false, worst: null, head: 0 };
export function lookOf(role, W, who, now, S) {
  const L = LOOK[role], M = W[role]; L.hurt = L.down = L.dead = L.onFire = false; L.since = L.downAt = L.worst = null; L.n = 0; L.bleed = L.burn = L.soot = L.head = 0;
  let sevSum = 0; for (const q of M.list) { if (q.T > now) continue; L.n++; if (L.since == null || q.T < L.since) L.since = q.T; if (!L.worst || rank(q) > rank(L.worst)) L.worst = q;
    const age = now - q.T; if (q.kind === 'burn') L.burn = Math.max(L.burn, 0.45 * q.sev); else { const rate = q.kind === 'trauma' ? 1 : q.kind === 'sever' ? 0.9 : 0.35 * q.sev; sevSum += rate * (1 - Math.exp(-age / (q.kind === 'frag' ? 40 : 14))); } if (q.part === 'head' && q.kind !== 'burn') L.head = Math.max(L.head, q.sev); }
  const st = who ? who.status : null, killedByReport = M.Tk != null && M.Tk <= now;
  L.dead = killedByReport || !!(who && /killed/.test(String(who.busy || ''))); L.down = L.dead || st === 'down'; L.hurt = !L.down && (st === 'wounded' || (st == null && L.n > 0));
  if ((L.down || L.hurt) && L.since == null) L.since = now;   /* the crew model has him hurt by something that left no report (a staged state): from now */
  L.downAt = L.down ? (M.Tk != null && M.Tk <= now ? M.Tk : M.hatch != null && M.hatch <= now ? M.hatch : L.since) : null;
  L.bleed = Math.min(1, sevSum * (L.dead ? 1 : 0.8));
  // fire: soot on everyone while it burns in his compartment; a man who cannot leave it burns
  if (S) { for (const f of S.fires) { const mine = (f.where === 'hull') || (f.where === 'ammo' && S.breach && role !== 'drv'); if (!mine) continue; const a = Math.max(0, Math.min(now, f.until) - f.since); L.soot = Math.max(L.soot, Math.min(0.7, a / 12));
      if (L.down && f.where === 'hull' && role === 'drv' && L.downAt != null) { const b = Math.max(0, Math.min(now, f.until) - Math.max(f.since, L.downAt)); L.burn = Math.max(L.burn, Math.min(1, b / 9)); L.onFire = L.onFire || (f.on && b > 0.5); } }
    if (S.breach && role !== 'drv') { const a = now - S.breach.T; if (a > 0) { L.burn = Math.max(L.burn, Math.min(1, a / 1.6)); L.soot = 1; L.onFire = a > 0.25; } }
    if (S.halon) L.soot = Math.max(0, L.soot - 0.1); }
  return L;
}
const rank = q => (q.kind === 'trauma' ? 4 : q.kind === 'sever' ? 3 : q.kind === 'frag' ? 1 + q.sev : 0.5);

// one line for the debrief, the X-ray and the crew panel: "fragment wounds, right upper arm and chest"
export function describe(role, W, now) {
  const M = W[role], by = {}; for (const q of M.list) if (q.T <= now) (by[q.kind] = by[q.kind] || []).push(PART_NAME[q.part]);
  const out = []; if (by.trauma) out.push('jet through the ' + by.trauma[0]); if (by.sever) out.push(by.sever.join(' and ') + ' taken off'); if (by.frag) out.push('fragment wounds, ' + [...new Set(by.frag)].join(' and ')); if (by.burn) out.push('flash burns');
  return out.join('; ');
}

// ---- the blood that leaves him: soaking the seat, pooling under it, thrown on the surfaces behind him along the line of the hit ----
// decals: Decals of interior_draw.js; planes: per role, the seat's own surfaces as given by the interior ([x, y, z, rx, ry, rz, w, h] each,
// in order: seat back or pan, the wall beside him, the floor or seat pan); MT: the matrix that carries turret coordinates into the mesh's
const RED = [1, 1, 1], _n = [0, 0, 0], _q = [0, 0, 0], _far = [0, 0, 0];
function planeNormal(p, out) { const cx = Math.cos(p[3]), sx = Math.sin(p[3]), cy = Math.cos(p[4]), sy = Math.sin(p[4]); out[0] = sy * cx; out[1] = -sx; out[2] = cy * cx; return out; }   /* the plane's +z after Euler YXZ (rz does not move it) */
export function drawBlood(decals, planes, W, look, now, MT) {
  for (const role of ROLES) { const M = W[role], L = look[role], P = planes[role]; if (!L || L.n === 0 && !L.down && !L.hurt) continue; if (L.since == null) continue;
    const age = now - L.since, heavy = L.dead || L.down ? 1 : 0.55, M4 = MAN[role].frame === 'tur' ? MT : null, sd = M.idx + role.charCodeAt(0);
    if (P) {   /* soak on the seat (quick), pool under him (slow, for minutes), runs down the wall beside him if he was thrown against it */
      const g0 = Math.min(1, 0.25 + age / 6) * heavy, g2 = Math.min(1, 0.08 + L.bleed * 1.1) * Math.min(1, age / 2 + 0.05);
      decals.add(M4, P[0], planeNormal(P[0], _n), Math.max(P[0][6], P[0][7]) * 1.5, 3, g0, 0, 0.92, RED, 0.5, hsh(sd, 1) * 6.28);
      decals.add(M4, P[2], planeNormal(P[2], _n), Math.max(P[2][6], P[2][7]) * (1.2 + 0.9 * heavy), 0, g2, 0, 0.95, RED, 1, hsh(sd, 2) * 6.28);
      if (L.down) decals.add(M4, P[1], planeNormal(P[1], _n), Math.max(P[1][6], P[1][7]) * 1.3, 2, Math.min(1, 0.2 + (now - L.downAt) / 14), 0, 0.9, RED, 0.6, 0); }
    // spatter: thrown along the line of the hit onto whatever is behind him; a fan on the far surface, drops on the floor under the line
    for (const q of M.list) { if (q.T > now || q.kind === 'burn' || !M.o) continue; const k = q.kind === 'trauma' ? 1 : q.kind === 'sever' ? 0.8 : 0.45 * q.sev; if (k < 0.25) continue;
      const B = BOX[MAN[role].frame === 'tur' ? 'tur' : 'drv']; partAt(role, q.part, _q); const d = M.d; let tb = 1e9, ax = 0;
      for (let a = 0; a < 3; a++) { if (Math.abs(d[a]) < 1e-4) continue; const lim = d[a] > 0 ? (a === 0 ? B.x1 : a === 1 ? B.y1 : B.z1) : (a === 0 ? B.x0 : a === 1 ? B.y0 : B.z0), t = (lim - _q[a]) / d[a]; if (t > 0 && t < tb) { tb = t; ax = a; } }
      if (tb < 2.6) { _far[0] = _q[0] + d[0] * tb; _far[1] = _q[1] + d[1] * tb - 0.04 * tb; _far[2] = _q[2] + d[2] * tb; _n[0] = _n[1] = _n[2] = 0; _n[ax] = d[ax] > 0 ? -1 : 1;
        decals.add(M4, _far, _n, (0.5 + 0.5 * k) * (0.7 + 0.25 * tb), 1, 1, 0, 0.95, RED, 0.4, hsh(q.idx, 5) * 6.28);
        decals.add(M4, _far, _n, 0.3 + 0.3 * k, 2, Math.min(1, 0.15 + (now - q.T) / 10), 0, 0.9, RED, 0.6, 0); }
      _far[0] = _q[0] + d[0] * 0.35; _far[2] = _q[2] + d[2] * 0.35; _far[1] = B.y0; _n[0] = 0; _n[1] = 1; _n[2] = 0; decals.add(M4, _far, _n, 0.45 + 0.35 * k, 12, 1, 0, 0.95, RED, 0.8, hsh(q.idx, 6) * 6.28); } }
}
