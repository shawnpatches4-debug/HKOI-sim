// Where the HKOI weapon station stands on the turret roof, proved by numbers. No browser.
//   node station_clear.mjs            the check: exit code 1 if any solid part of the station, at any bearing and any elevation it is
//                                     allowed, comes within CLEAR of the tank's own roof fittings, a man standing in either hatch, either
//                                     hatch lid anywhere in its travel, the loader's machine gun anywhere in its travel, or the commander's
//                                     weapon station anywhere in its travel; or if the elevation tables in src/render/station.js are stale
//   node station_clear.mjs search     try every place on the roof (5 cm grid, pedestals 0.05 to 0.9 m) and print the best of each region
//   node station_clear.mjs table      print the elevation tables for src/render/station.js
//   node station_clear.mjs survey     measure the real turret model again and rewrite roof_survey.json (needs assets/m1v3/m1v3_turret.json)
// Run through tests/interior/run.sh (it puts the sources next to this file), or from the repository with SRC=src.
//
// HOW IT IS MEASURED
// The turret model is turned into a height field (2.5 cm cells, the highest point of the model in each cell): roof_survey.json. That
// file is a measurement of the supplied model (which is not in the repository); when the model is present the check measures it again
// and fails if the two differ. Everything on the roof is taken as SOLID FROM ITS TOP DOWN TO THE ROOF, which can only overstate a clash.
// The moving things are height fields too, built from the interior's own dimensions (interior_build.js DIM, SEATS) so they follow it:
//   loader standing behind his gun (head top = his eye + 0.17 m), within 0.42 m of the hatch centre (he turns with his gun);
//   his lid anywhere between shut and thrown back on its outboard hinge; his M240 anywhere in its arc (110 degrees each way, -10 to +35);
//   commander head and shoulders out; his lid anywhere between shut, lifted 0.12 m and swung aside round its post;
//   the commander's weapon station (the .50 in front of his hatch) turned all the way round, -20 to +60 degrees (ASSUMED limits).
// The station turns all the way round, so its body (everything except the gun in front of its cradle) sweeps a figure of revolution:
// for every distance from the axis the check finds the LOWEST point any body part reaches at any elevation, and compares it with the
// highest obstacle at that distance in every direction. The barrel is checked bearing by bearing and elevation by elevation, and
// the line of fire beyond the muzzle (LOF m around the bore, out past the end of the main gun) with it: the lowest elevation that
// clears the tank at each bearing is the station's masked zone there. Hull: not in the survey; ASSUMED clear (its top is 0.8 m and
// more below the roof plate, and a -10 degree line from the trunnion is still above it at the hull's ends: checked in `search`).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : HERE;
const { STATION, stationParts, partPoints, trunnionUp, FLOOR, elevationFloor } = await import(path.join(SRC, 'render/station.js'));
globalThis.document = globalThis.document || { createElement: () => ({ getContext: () => null, style: {} }) };
let DIM, SEATS; try { ({ DIM, SEATS } = await import(path.join(SRC, 'render/interior_build.js'))); } catch (e) { console.log('station_clear: interior dimensions not loadable (' + String(e.message).slice(0, 80) + '): using the values of 15 Nov 2026'); }
DIM = DIM || { CUP: [0.52, 0.36], CUPR: 0.40, CUPTOP: 0.895, CUPLIFT: 0.12, HAT: [-0.77, 0.62], HATR: 0.33, RF: 0.54 }; const CDR_OUT = (SEATS && SEATS.in_cdr && SEATS.in_cdr.out) || 1.47;
const DEG = Math.PI / 180, CLEAR = 0.03, LOF = 0.10, CELL = 0.025, X0 = -2.0, X1 = 2.0, Z0 = -3.0, Z1 = 5.8, W = Math.round((X1 - X0) / CELL), H = Math.round((Z1 - Z0) / CELL), NONE = -9;
const mode = process.argv[2] || 'check', SURVEY = path.join(fs.existsSync(path.join(HERE, 'roof_survey.json')) ? HERE : path.join(SRC, '../tests/interior'), 'roof_survey.json');
const cellOf = (x, z) => { const i = Math.floor((x - X0) / CELL), k = Math.floor((z - Z0) / CELL); return i < 0 || k < 0 || i >= W || k >= H ? -1 : k * W + i; };

// ---------------------------------------------------------------- the survey of the real model
function measure(file) {
  const j = JSON.parse(fs.readFileSync(file)), buf = Buffer.from(j.buffers[0].uri.split(',')[1], 'base64');
  const acc = i => { const a = j.accessors[i], bv = j.bufferViews[a.bufferView], off = (bv.byteOffset || 0) + (a.byteOffset || 0), n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type]), T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType]; return new T(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + n * T.BYTES_PER_ELEMENT)); };
  const fixed = new Float32Array(W * H).fill(NONE), crows = new Float32Array(W * H).fill(NONE), F = 2, w = W * F, h = H * F, s = CELL / F;   /* rastered at half the cell size, kept as the highest value in each cell */
  for (const n of j.nodes) { if (n.mesh == null) continue; const p = j.meshes[n.mesh].primitives[0], P = acc(p.attributes.POSITION), I = p.indices != null ? acc(p.indices) : null, nt = I ? I.length / 3 : P.length / 9, isM2 = /^m2/i.test(n.name);
    for (let t = 0; t < nt; t++) { const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
      const put = (x, z, y) => { const q = cellOf(x, z); if (q < 0) return; if (y > fixed[q]) fixed[q] = y; if (isM2 && x < -0.3 && z < 2.2 && y > crows[q]) crows[q] = y; };
      put(ax, az, ay); put(bx, bz, by); put(cx, cz, cy); const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az); if (Math.abs(d) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - X0) / s)), i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx, cx) - X0) / s)), k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - Z0) / s)), k1 = Math.min(h - 1, Math.ceil((Math.max(az, bz, cz) - Z0) / s));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) { const x = X0 + (i + 0.5) * s, z = Z0 + (k + 0.5) * s, u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / d, v = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / d; if (u < -0.02 || v < -0.02 || u + v > 1.02) continue; put(x, z, ay + u * (by - ay) + v * (cy - ay)); } } }
  return { fixed, crows };
}
const pack = f => { const u = new Uint8Array(f.length); for (let i = 0; i < f.length; i++) u[i] = f[i] <= NONE + 1 ? 0 : Math.max(1, Math.min(255, Math.ceil((f[i] + 0.5) * 100 - 1e-6))); return Buffer.from(u).toString('base64'); };   /* whole centimetres above -0.5 m, rounded UP */
const unpack = s => { const u = Buffer.from(s, 'base64'), f = new Float32Array(u.length); for (let i = 0; i < u.length; i++) f[i] = u[i] ? u[i] / 100 - 0.5 : NONE; return f; };
const modelFile = path.join(process.env.HK_ASSETS || path.join(SRC, '../assets'), 'm1v3/m1v3_turret.json'); let fixed, crowsF, problems = [];
if (mode === 'survey') { const m = measure(modelFile); fs.writeFileSync(SURVEY, JSON.stringify({ note: 'Height field of the supplied M1A2 SEPv3 turret model (highest point in each 2.5 cm cell, whole centimetres above -0.5 m, 0 = nothing), measured by tests/interior/station_clear.mjs survey. fixed = the whole turret; crows = the commander\'s .50 and its mount only.', X0, Z0, CELL, W, H, fixed: pack(m.fixed), crows: pack(m.crows) })); console.log('survey written:', SURVEY); }
{ if (!fs.existsSync(SURVEY)) { console.log('station_clear: no roof_survey.json. Run: node station_clear.mjs survey'); process.exit(1); } const sv = JSON.parse(fs.readFileSync(SURVEY)); if (sv.W !== W || sv.H !== H || sv.CELL !== CELL) { console.log('roof_survey.json has another grid: run survey again'); process.exit(1); } fixed = unpack(sv.fixed); crowsF = unpack(sv.crows);
  if (fs.existsSync(modelFile) && mode !== 'survey') { const m = measure(modelFile), a = unpack(pack(m.fixed)); let bad = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - fixed[i]) > 0.011) bad++; if (bad) problems.push('roof_survey.json no longer matches the turret model (' + bad + ' cells differ): run `survey` and check again'); else if (mode === 'check') console.log('  survey matches the real turret model (' + W * H + ' cells)'); }
  else if (mode === 'check') console.log('  (turret model file not here: using the stored survey of it)'); }

// ---------------------------------------------------------------- the moving things, as height fields (model frame: x = -interior x, z = -interior z)
const field = () => new Float32Array(W * H).fill(NONE), each = (cx, cz, R, fn) => { const i0 = Math.max(0, Math.floor((cx - R - X0) / CELL)), i1 = Math.min(W - 1, Math.ceil((cx + R - X0) / CELL)), k0 = Math.max(0, Math.floor((cz - R - Z0) / CELL)), k1 = Math.min(H - 1, Math.ceil((cz + R - Z0) / CELL)); for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(X0 + (i + 0.5) * CELL, Z0 + (k + 0.5) * CELL, k * W + i); };
const HATC = [-DIM.HAT[0], -DIM.HAT[1]], CUPC = [-DIM.CUP[0], -DIM.CUP[1]], ROOF_TOP = DIM.RF + 0.05;
// the loader's machine gun, from the survey: bore height and length (it lies along z at x 0.64 to 0.90)
const M240 = { z0: -0.43, z1: 0.63, top: 1.06, bore: 0.99 };   /* MEASURED on the model's own M240 piece: it spans z -0.43 to 0.63, y 0.84 to 1.06 */
function crewFields() {
  const ldr = field(), cdr = field(), crows = field(), mgEl = field(), up = (f, q, y) => { if (y > f[q]) f[q] = y; };
  // loader: the man. His eye is 0.2 m above the bore of his gun (interior.js _mg); head top 0.17 m above the eye (helmet)
  const headL = M240.bore + 0.2 + 0.17; each(HATC[0], HATC[1], 0.42, (x, z, q) => { if (Math.hypot(x - HATC[0], z - HATC[1]) <= 0.42) up(ldr, q, headL); });
  // his lid: a disc of radius HATR + 0.03 whose centre is HATR from a hinge on the OUTBOARD rim (hinge along z), thrown through 163 degrees
  { const hx = HATC[0] + DIM.HATR + 0.035, hy = DIM.RF + 0.065, R = DIM.HATR + 0.03; each(hx, HATC[1], 0.75, (x, z, q) => { const s = Math.abs(z - HATC[1]); if (s > R) return; const rho = DIM.HATR + Math.sqrt(R * R - s * s) + 0.02, d = x - hx; if (Math.abs(d) > rho) return; up(ldr, q, hy + Math.sqrt(rho * rho - d * d) + 0.03); }); }
  // his gun: turns about the hatch centre, 110 degrees each way from straight ahead, -10 to +35 degrees
  { const rB = M240.z0 - HATC[1], rT = M240.z1 - HATC[1] + 0.02; each(HATC[0], HATC[1], rT + 0.15, (x, z, q) => { const dx = x - HATC[0], dz = z - HATC[1], r = Math.hypot(dx, dz), a = Math.abs(Math.atan2(dx, dz)) / DEG; if (a > 110 + 8 || r > rT + 0.13) return; up(ldr, q, M240.top + 0.03); up(mgEl, q, Math.min(M240.top + 0.03 + Math.max(0, r) * Math.tan(35 * DEG), M240.top + 0.03 + Math.sqrt(Math.max(0, rT * rT - Math.min(r, rT) ** 2)))); }); }   /* ldr: the gun level anywhere in its arc; mgEl: raised anywhere up to +35 */
  // commander: head and shoulders out; head top 0.17 m above his eye
  each(CUPC[0], CUPC[1], DIM.CUPR, (x, z, q) => { if (Math.hypot(x - CUPC[0], z - CUPC[1]) <= DIM.CUPR) up(cdr, q, CDR_OUT + 0.17); });
  // his lid: radius CUPR + 0.035 on an arm PZ long from a post behind the cupola; lifted 0.12 m and swung from forward, round the right, to 143 degrees
  { const PZ = DIM.CUPR + 0.075, px = CUPC[0], pz = CUPC[1] - PZ, R = DIM.CUPR + 0.035, top = DIM.CUPTOP + 0.132 + DIM.CUPLIFT + 0.05; each(px, pz, PZ + R, (x, z, q) => { const dx = x - px, dz = z - pz, r = Math.hypot(dx, dz); if (r > PZ + R) return; const a = Math.atan2(-dx, dz) / DEG;   /* 0 forward, positive to the tank's right */ const w = r > 1e-6 && r > Math.abs(PZ - R) ? Math.acos(Math.max(-1, Math.min(1, (r * r + PZ * PZ - R * R) / (2 * r * PZ)))) / DEG : 180; if (a > -w - 2 && a < 143.3 + w + 2) up(cdr, q, top); }); }
  // commander's weapon station: the surveyed .50 and mount turned all the way round its axis, the gun -20 to +60 degrees
  { const ax = CROWS.axis, prof = CROWS.prof, L = CROWS.L; each(ax[0], ax[1], L + 0.05, (x, z, q) => { const r = Math.hypot(x - ax[0], z - ax[1]); if (r > L + 0.03) return; const b = Math.min(prof.length - 1, Math.floor(r / CELL)); let y = Math.max(prof[b], prof[Math.max(0, b - 1)], prof[Math.min(prof.length - 1, b + 1)]); y = Math.max(y, CROWS.bore + 0.05 + Math.min(r * Math.tan(60 * DEG), Math.sqrt(Math.max(0, L * L - Math.min(r, L) ** 2)))); up(crows, q, y); }); }
  return { ldr, cdr, crows, mgEl };
}
// the commander's weapon station from the survey: its axis (centre of the mount), the highest point at each distance from it, the bore height and the reach of the barrel
const CROWS = (() => { const axis = [-0.73, 0.50]; let L = 0, bore = 0; const prof = new Float32Array(120).fill(NONE); for (let q = 0; q < W * H; q++) { if (crowsF[q] <= NONE + 1) continue; const x = X0 + (q % W + 0.5) * CELL, z = Z0 + (Math.floor(q / W) + 0.5) * CELL, r = Math.hypot(x - axis[0], z - axis[1]), b = Math.min(119, Math.floor(r / CELL)); if (crowsF[q] > prof[b]) prof[b] = crowsF[q]; if (r > L) { L = r; bore = crowsF[q]; } } return { axis, prof, L: L + 0.02, bore }; })();
const CF = crewFields(), F_LDRALL = maxF(CF.ldr, CF.mgEl);
// blow-out panels of the bustle ammunition: MEASURED on the survey as the raised plate (0.63 to 0.66) behind the hatches
const PANEL = { x0: -0.775, x1: 0.775, z0: -2.125, z1: -0.975 };   /* read off the survey: the plate at 0.65 (the roof round it is at 0.58 to 0.61) */

// ---------------------------------------------------------------- the station
// lowest point of the body at each distance from the axis, over every elevation (heights above the ROOF PLATE under the pedestal)
function bodyProfile(S) { const parts = stationParts(S), NB = 64, lo = new Float32Array(NB).fill(99), base = new Float32Array(NB).fill(99); let rmax = 0; const T = trunnionUp(S), deck = S.ped + S.bearing;
  const put = (arr, x, y, z) => { const r = Math.hypot(x, z); if (r > rmax) rmax = r; const b = Math.min(NB - 1, Math.floor(r / CELL)); if (y < arr[b]) arr[b] = y; };
  for (const pt of parts) { if (pt.barrel) continue; const pts = partPoints(pt, 0.02);
    if (pt.frame === 'base') for (const p of pts) put(pt.name !== 'slew bearing' ? base : lo, p[0], p[1], p[2]);   /* flange, column, gussets, bolts: the foot, standing on the roof inside S.foot */
    else if (pt.frame === 'yaw') for (const p of pts) put(lo, p[0], deck + p[1], p[2]);
    else for (let e = S.elMin; e <= S.elMax + 1e-6; e += 2.5) { const c = Math.cos(e * DEG), s = Math.sin(e * DEG); for (const p of pts) put(lo, p[0], T + p[1] * c + p[2] * s, p[2] * c - p[1] * s); } }
  for (let b = NB - 2; b >= 0; b--) if (lo[b] > 98 && b * CELL < rmax) lo[b] = Math.min(lo[b], lo[b + 1]);   /* a bin no sample fell in takes its outer neighbour's value */
  return { lo, rmax, NB }; }
function roofUnder(S, R = S.foot) { const hs = []; each(S.at[0], S.at[1], R, (x, z, q) => { if (Math.hypot(x - S.at[0], z - S.at[1]) <= R) hs.push(fixed[q]); }); hs.sort((a, b) => a - b); return { med: hs[hs.length >> 1], lo: hs[0], hi: hs[hs.length - 1], p90: hs[Math.floor(hs.length * 0.9)], p10: hs[Math.floor(hs.length * 0.1)] }; }
// deepest overlap (metres; 0 = clear by at least CLEAR) of the station's body with a height field
function bodyClash(S, prof, F, roofY, skipFoot) { let worst = 0, at = null; const R = prof.rmax + CLEAR + CELL; each(S.at[0], S.at[1], R, (x, z, q) => { const f = F[q]; if (f <= NONE + 1) return; const r = Math.hypot(x - S.at[0], z - S.at[1]); if (r > R) return; if (skipFoot && r <= S.foot + CELL) return;   /* the pedestal stands on the roof there */
    let lo = 99; for (let b = Math.max(0, Math.floor((r - CELL * 0.75) / CELL)); b <= Math.min(prof.NB - 1, Math.floor((r + CELL * 0.75) / CELL)); b++) lo = Math.min(lo, prof.lo[b]); if (lo > 98) return; const d = f + CLEAR - (roofY + lo); if (d > worst) { worst = d; at = [+x.toFixed(2), +z.toFixed(2), +f.toFixed(2)]; } }); return { worst, at }; }
// the gun in front of the cradle and the line of fire beyond it: does it clear the field at this bearing and elevation?
function boreClear(S, F, roofY, brg, el, metalOnly) { const T = roofY + trunnionUp(S), ce = Math.cos(el * DEG), se = Math.sin(el * DEG), dx = -Math.sin(brg * DEG), dz = Math.cos(brg * DEG), end = metalOnly ? S.reach : 12;
  for (let s = 0.2; s <= end; s += 0.02) { const rad = s <= S.reach ? (s <= 0.5 ? 0.16 : s < 0.95 ? 0.06 : s > S.reach - 0.23 ? 0.085 : 0.04) : LOF, y = T + s * se - rad / Math.max(0.42, ce) - (s <= S.reach ? CLEAR : 0), h = s * ce;   /* (0.16: half the receiver's height with its corner) */ for (let o = -1; o <= 1; o++) { const q = cellOf(S.at[0] + dx * h + dz * o * rad, S.at[1] + dz * h - dx * o * rad); if (q >= 0 && F[q] > y) return false; } } return true; }
function floorAt(S, F, roofY, brg, metalOnly, es = 0.5) { let fl = S.elMin; for (let e = S.elMax; e >= S.elMin - 1e-6; e -= es) { if (!boreClear(S, F, roofY, brg, e, metalOnly)) { fl = e + es; break; } } return fl; }
function maxF(...fs) { const o = field(); for (const f of fs) for (let i = 0; i < o.length; i++) if (f[i] > o[i]) o[i] = f[i]; return o; }
const F_UP = maxF(fixed, CF.ldr, CF.cdr), F_LDR = maxF(fixed, CF.ldr), F_CDR = maxF(fixed, CF.cdr), F_GUNS = maxF(CF.crows, CF.mgEl);
// each entry covers its bearing and 2.5 degrees either side (sampled every 1.25 degrees), so a thin thing between two entries is not missed
function tables(S, roofY, step = 5, es = 0.5, wide = true) { const a = [], b = [], c = [], fl = (F, brg, metal) => { if (!wide) return floorAt(S, F, roofY, brg, metal, es); let m = -99; for (let o = -2; o <= 2; o++) m = Math.max(m, floorAt(S, F, roofY, brg + o * step / 4, metal, es)); return m; };
  for (let brg = 0; brg < 360; brg += step) { a.push(fl(fixed, brg, false)); b.push(fl(F_UP, brg, false)); c.push(fl(F_GUNS, brg, true)); } return { fixed: a, crewUp: b, crows: c }; }
const arcs = (T, lim, step = 5) => { const out = []; let s = null; for (let i = 0; i <= T.length; i++) { const on = i < T.length && T[i] > lim; if (on && s == null) s = i; if (!on && s != null) { out.push([s * step, (i - 1) * step, Math.max(...T.slice(s, i))]); s = null; } } return out; };
const sumAbove = (T, lim) => T.reduce((n, v) => n + (v > lim ? 1 : 0), 0);
// everything about one candidate place
function assess(S, quick) { const R = roofUnder(S), roofY = R.med, prof = bodyProfile(S), out = { roofY, flat: R.p90 - R.p10, rmax: prof.rmax };
  out.onPanel = S.at[0] + S.foot > PANEL.x0 && S.at[0] - S.foot < PANEL.x1 && S.at[1] + S.foot > PANEL.z0 && S.at[1] - S.foot < PANEL.z1;
  out.overPanel = Math.max(0, Math.min(S.at[0] + prof.rmax - PANEL.x0, PANEL.x1 - (S.at[0] - prof.rmax), S.at[1] + prof.rmax - PANEL.z0, PANEL.z1 - (S.at[1] - prof.rmax)));   /* how far the turning body reaches in over the blow-out panels (plan view) */
  out.fixed = bodyClash(S, prof, fixed, roofY, true); if (quick && out.fixed.worst > 0) return out; out.ldr = bodyClash(S, prof, F_LDRALL, roofY); out.cdr = bodyClash(S, prof, CF.cdr, roofY); out.crows = bodyClash(S, prof, CF.crows, roofY); out.body = Math.max(out.fixed.worst, out.ldr.worst, out.cdr.worst, out.crows.worst); return out; }

// ---------------------------------------------------------------- modes
const show = (name, S) => { const A = assess(S), T = tables(S, A.roofY, 5), f = v => v.toFixed(3); console.log(`${name}: axis (${S.at[0]}, ${S.at[1]}), pedestal ${S.ped} m, roof ${f(A.roofY)} (flat within ${f(A.flat)}), trunnion ${f(A.roofY + trunnionUp(S))}, body radius ${f(A.rmax)}`);
  console.log(`   body overlap: fittings ${f(A.fixed.worst)} ${A.fixed.at || ''}, loader/lid/M240 ${f(A.ldr.worst)} ${A.ldr.at || ''}, commander/lid ${f(A.cdr.worst)} ${A.cdr.at || ''}, commander's weapon ${f(A.crows.worst)}; flange on blow-out panel: ${A.onPanel}; body over the panels by ${f(A.overPanel)} m`);
  console.log(`   gun cannot be level (0 deg) over ${sumAbove(T.fixed, 0) * 5} deg of bearing, cannot reach -10 over ${sumAbove(T.fixed, -10) * 5} deg; with both men up: ${sumAbove(T.crewUp, 0) * 5} / ${sumAbove(T.crewUp, -10) * 5} deg; blocked outright (above ${S.elMax}): ${sumAbove(T.fixed, S.elMax) * 5} deg`);
  console.log('   masked above level, hatches shut  [from, to, lowest elevation]: ' + JSON.stringify(arcs(T.fixed, 0))); console.log('   masked above level, both men up: ' + JSON.stringify(arcs(T.crewUp, 0))); { const l = [], c = []; for (let b = 0; b < 360; b += 5) { l.push(Math.max(T.fixed[b / 5], floorAt(S, F_LDR, A.roofY, b))); c.push(Math.max(T.fixed[b / 5], floorAt(S, F_CDR, A.roofY, b))); } console.log('   masked above level, only the loader up: ' + JSON.stringify(arcs(l, 0)) + '; only the commander up: ' + JSON.stringify(arcs(c, 0))); } return { A, T }; };
if (mode === 'at') { const [x, z, ped] = process.argv.slice(3).map(Number); const S = Object.assign({}, STATION, { at: [x, z], ped }); console.log(JSON.stringify(roofUnder(S))); show('at', S); process.exit(0); }
if (mode === 'search') {
  console.log('blow-out panels measured:', JSON.stringify(PANEL), ' commander weapon reach', CROWS.L.toFixed(2), 'bore', CROWS.bore.toFixed(2), ' M240', JSON.stringify(M240));
  const best = {}, region = (x, z) => z > 0.15 ? 'front (beside the commander\'s weapon)' : z > -1.0 ? (x > 0 ? 'left middle' : 'right middle') : Math.abs(x) < 0.8 ? 'rear centre' : x > 0 ? 'rear left' : 'rear right'; let tried = 0, ok = 0;
  for (let x = -1.6; x <= 1.6001; x += 0.05) for (let z = -2.7; z <= 1.3001; z += 0.05) for (const ped of [0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9].filter(p => p <= +(process.env.MAXPED || 9))) { const S = Object.assign({}, STATION, { at: [+x.toFixed(2), +z.toFixed(2)], ped }); tried++; const R = roofUnder(S); if (!(R.med > 0.5 && R.med < 0.72) || R.p90 - R.p10 > 0.04) continue; const A = assess(S, true); if (A.onPanel || A.fixed.worst > 0 || A.body > 0) continue; ok++;
    const T = tables(S, A.roofY, 10, 2.5, false), score = sumAbove(T.fixed, 0) * 10 + sumAbove(T.crewUp, 0) * 10 * 0.5 + A.overPanel * 400 + ped * 60, k = region(x, z); if (!best[k] || score < best[k].score) best[k] = { score, S, lvl: sumAbove(T.fixed, 0) * 10, up: sumAbove(T.crewUp, 0) * 10, over: A.overPanel }; }
  console.log(`tried ${tried} places and pedestal heights; ${ok} have a body that touches nothing, stand on flat roof plate and off the blow-out panels`);
  for (const k in best) { console.log('\nBEST IN REGION ' + k + ' (score ' + best[k].score.toFixed(0) + ')'); show(k, best[k].S); }
  console.log('\nFOR COMPARISON'); show('old place (0.55, -0.95), new station', Object.assign({}, STATION, { at: [0.55, -0.95] })); show('beside the commander\'s weapon (0.10, 0.45)', Object.assign({}, STATION, { at: [0.10, 0.45] })); show('CHOSEN', STATION);
  { const T = STATION.roofY + trunnionUp(STATION); console.log(`hull: a -10 degree line from the trunnion (${T.toFixed(2)}) is at ${(T - 5.5 * Math.tan(10 * DEG)).toFixed(2)} after 5.5 m; the hull top is at -0.20 to -0.43: clear`); }
  process.exit(0);
}
const { A, T } = show('HKOI station', STATION);
if (mode === 'table') { console.log('FLOOR.fixed = ' + JSON.stringify(T.fixed) + ';\nFLOOR.crewUp = ' + JSON.stringify(T.crewUp) + ';'); console.log('commander\'s weapon and the loader\'s gun raised (mutual no-go, metal against metal; [from, to, lowest elevation]): ' + JSON.stringify(arcs(T.crows, STATION.elMin))); process.exit(0); }
const need = (ok, msg) => { if (!ok) problems.push(msg); };
need(A.rmax <= STATION.bodyR + 1e-6, `a body part reaches ${A.rmax.toFixed(3)} m from the axis: more than bodyR ${STATION.bodyR}`);
need(Math.abs(A.roofY - STATION.roofY) <= 0.02, `the roof under the pedestal is at ${A.roofY.toFixed(3)}, the station says ${STATION.roofY}`);
need(A.flat <= 0.04, `the pedestal's flange is not on flat roof plate (heights under it differ by ${A.flat.toFixed(3)} m)`);
need(!A.onPanel, 'the pedestal stands on an ammunition blow-out panel');
need(A.fixed.worst <= 0, `the station's body comes within ${CLEAR} m of the tank's own fittings (deepest ${A.fixed.worst.toFixed(3)} m at ${A.fixed.at})`);
need(A.ldr.worst <= 0, `the station's body sweeps through the standing loader, his lid or his gun (deepest ${A.ldr.worst.toFixed(3)} m at ${A.ldr.at})`);
need(A.cdr.worst <= 0, `the station's body sweeps through the standing commander or his lid (deepest ${A.cdr.worst.toFixed(3)} m at ${A.cdr.at})`);
need(A.crows.worst <= 0, `the station's body sweeps through the commander's weapon station's travel (deepest ${A.crows.worst.toFixed(3)} m)`);
need(sumAbove(T.fixed, STATION.elMax) === 0, 'at some bearing the gun cannot pass at any elevation: the station could not turn all the way round');
need(!!FLOOR.fixed && !!FLOOR.crewUp && FLOOR.fixed.length === 72 && FLOOR.crewUp.length === 72, 'station.js has no elevation tables: run `table`');
if (FLOOR.fixed && FLOOR.crewUp) { let stale = 0; for (let i = 0; i < 72; i++) if (FLOOR.fixed[i] < T.fixed[i] - 1e-6 || FLOOR.crewUp[i] < T.crewUp[i] - 1e-6) stale++; need(!stale, `the elevation tables in station.js are too low at ${stale} bearings (the gun would pass through something): run \`table\``);
  // with the tables applied nothing metal meets anything: every bearing (2.5 degree steps, the table read between its entries), from the table's floor up
  let hit = 0; for (let b = 0; b < 360; b += 2.5) for (const [F, up] of [[fixed, false], [F_UP, true]]) { const f0 = elevationFloor(b, up); for (let e = f0; e <= STATION.elMax; e += 2.5) if (!boreClear(STATION, F, A.roofY, b, e, true)) hit++; } need(!hit, `with the elevation tables applied the barrel still meets something in ${hit} poses`); }
console.log(`   overhang over the blow-out panels (plan view): ${A.overPanel.toFixed(3)} m`);
if (problems.length) { console.log('STATION CLEARANCE: FAILED'); for (const p of problems) console.log('  - ' + p); process.exit(1); }
console.log('STATION CLEARANCE: PASSED (body clear of everything by at least ' + CLEAR * 100 + ' cm at every bearing and elevation; barrel clear with the elevation tables)');
