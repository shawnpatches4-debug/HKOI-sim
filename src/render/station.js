// HKOI Battlefield: the HKOI weapon station as numbers. One list of solid parts that BOTH the picture (TankView._station in
// units.js) and the clearance check (tests/interior/station_clear.mjs) are built from, so the check always measures what is drawn.
// No drawing code and no imports here: it runs in node and in the page alike.
//
// Frame: the turret model's own (x to the tank's LEFT, y up from the turret's turning point, z FORWARD along the main gun).
//
// THE GUN. M230LF 30 x 113 mm chain gun. ASSUMED from the maker's public data sheet: 2.18 m overall, receiver about 0.26 m wide and
// 0.29 m high; the split into a 0.85 m receiver and 1.33 m of barrel in front of it is an estimate from photographs. It is hung in
// its cradle well back (0.35 m of receiver behind the trunnion, 1.83 m in front) so the breech end swings in a small circle and the
// station stays compact: the price is a long barrel sweep, which the check below accounts for.
//
// THE PLACE. Chosen by tests/interior/station_clear.mjs search (numbers in docs/HKOI_STATION.md): the left rear corner of the turret
// roof, on the roof plate over the left bustle wall, outboard of the ammunition blow-out panels and behind the loader's hatch.
// ELEVATION -10 to +65 degrees (the same limits TankView.aimStation has always used), all round traverse.
export const STATION = {
  at: [1.22, -1.50],        // the traverse axis on the roof (x, z)
  ped: 0.50,                // height of the pedestal: roof plate to the underside of the slew bearing, metres
  bearing: 0.10,            // slew bearing and turntable, metres
  trunnion: 0.42,           // trunnion axis above the turntable deck: lets the breech end swing down clear of the deck at full elevation
  elMin: -10, elMax: 65,    // degrees
  rear: 0.35, reach: 1.83,  // gun behind and in front of the trunnion, metres (sum 2.18 = M230LF overall length)
  bodyR: 0.45, foot: 0.31,              // nothing but the gun in front of the cradle is farther than this from the traverse axis (checked by the test)
  roofY: 0.58,              // measured height of the roof plate under the pedestal (the view measures it again on the real model)
};
// height of the trunnion axis above the roof plate
export const trunnionUp = S => S.ped + S.bearing + S.trunnion;

// The solid parts. frame: 'base' fixed to the roof (origin: the axis at roof level), 'yaw' turns with the station (origin: the axis at
// the turntable deck), 'pitch' elevates with the gun (origin: the trunnion), 'slide' = pitch, but recoils (the barrel group).
// box: s = [width x, height y, length z]; cyl: r0 (top or front), r1 (bottom or back), len, axis 'y' or 'z' (or 'x'). p = centre.
// mat: paint | dark | steel | glass. A part marked barrel: true is the gun in front of the cradle, from 0.20 m ahead of the trunnion to the muzzle (the long sweep).
export function stationParts(S = STATION) {
  const P = [], box = (frame, mat, sx, sy, sz, x, y, z, o) => P.push(Object.assign({ frame, mat, shape: 'box', s: [sx, sy, sz], p: [x, y, z] }, o)), cyl = (frame, mat, r0, r1, len, axis, x, y, z, o) => P.push(Object.assign({ frame, mat, shape: 'cyl', r0, r1, len, axis, p: [x, y, z] }, o));
  const ped = S.ped, T = S.trunnion;
  // ---- pedestal: a flange bolted to the roof plate, a welded tapered column, four gussets, the slew bearing on top
  cyl('base', 'paint', 0.30, S.foot, 0.025, 'y', 0, 0.0125, 0, { seg: 32, name: 'flange' });
  cyl('base', 'paint', 0.21, 0.26, ped - 0.025, 'y', 0, 0.025 + (ped - 0.025) / 2, 0, { seg: 28, name: 'column' });
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; box('base', 'paint', 0.02, Math.min(0.2, ped - 0.05), 0.085, Math.sin(a) * 0.262, 0.025 + Math.min(0.2, ped - 0.05) / 2, Math.cos(a) * 0.262, { ry: a, name: 'gusset' }); }
  for (let i = 0; i < 12; i++) { const a = (i + 0.5) * Math.PI / 6; cyl('base', 'steel', 0.012, 0.012, 0.014, 'y', Math.sin(a) * 0.283, 0.032, Math.cos(a) * 0.283, { seg: 6, name: 'bolt', small: true }); }
  cyl('base', 'dark', 0.28, 0.28, S.bearing - 0.035, 'y', 0, ped + (S.bearing - 0.035) / 2, 0, { seg: 32, name: 'slew bearing' });
  // ---- turntable and cradle (turn with the station)
  cyl('yaw', 'paint', 0.28, 0.28, 0.035, 'y', 0, -0.0175, 0, { seg: 32, name: 'turntable' });
  box('yaw', 'paint', 0.04, T + 0.10, 0.30, -0.165, (T + 0.10) / 2, 0, { name: 'cheek L' }); box('yaw', 'paint', 0.04, T + 0.10, 0.30, 0.165, (T + 0.10) / 2, 0, { name: 'cheek R' });
  box('yaw', 'dark', 0.07, 0.16, 0.20, -0.22, 0.12, -0.02, { name: 'elevation drive' });
  box('yaw', 'dark', 0.20, 0.14, 0.16, 0, 0.07, -0.17, { name: 'traverse drive' });
  // ammunition box on the right with its lid and feed motor. 0.20 x 0.50 x 0.36 m = 36 litres: ASSUMED about 85 linked 30 x 113 mm rounds
  box('yaw', 'paint', 0.20, 0.50, 0.36, 0.30, 0.29, 0, { name: 'ammunition box' }); box('yaw', 'paint', 0.21, 0.02, 0.37, 0.30, 0.55, 0, { name: 'ammunition box lid' });
  box('yaw', 'dark', 0.11, 0.06, 0.13, 0.30, 0.59, -0.06, { name: 'feed motor' });
  // ---- elevating mass (the gun in its cradle, the sight)
  cyl('pitch', 'steel', 0.045, 0.045, 0.40, 'x', 0, 0, 0, { seg: 14, name: 'trunnion pin' });
  box('pitch', 'dark', 0.26, 0.29, 0.55, 0, 0.005, -0.075, { name: 'receiver' }); box('pitch', 'dark', 0.26, 0.29, 0.30, 0, 0.005, 0.35, { name: 'receiver front', barrel: true });   /* one receiver 0.85 m long; the part in front of the cradle sweeps with the barrel and is checked with it */
  box('pitch', 'dark', 0.14, 0.07, 0.30, 0, 0.185, -0.12, { name: 'feed cover' });
  box('pitch', 'dark', 0.10, 0.09, 0.16, 0.0, -0.185, 0.05, { name: 'gun drive motor', small: true });
  // sight unit on the left of the cradle: day camera, thermal camera, laser rangefinder behind one armoured face
  box('pitch', 'paint', 0.18, 0.30, 0.26, -0.29, 0.0, 0.01, { name: 'sight unit' });
  box('pitch', 'paint', 0.19, 0.015, 0.28, -0.29, 0.158, 0.012, { name: 'sight hood' });
  for (const [lx, ly, lr] of [[-0.26, 0.06, 0.05], [-0.34, 0.06, 0.026], [-0.255, -0.06, 0.026], [-0.33, -0.05, 0.026]]) cyl('pitch', 'glass', lr, lr, 0.012, 'z', lx, ly, 0.146, { seg: 18, name: 'sight window', small: true });
  // ---- the barrel group (recoils): sleeve, barrel, muzzle brake. Everything from the front of the receiver (0.50) to the muzzle (reach)
  cyl('slide', 'dark', 0.06, 0.06, 0.45, 'z', 0, 0, 0.725, { seg: 14, name: 'recoil sleeve', barrel: true });
  cyl('slide', 'dark', 0.034, 0.04, S.reach - 0.23 - 0.95, 'z', 0, 0, (0.95 + S.reach - 0.23) / 2, { seg: 12, name: 'barrel', barrel: true });
  cyl('slide', 'steel', 0.075, 0.075, 0.23, 'z', 0, 0, S.reach - 0.115, { seg: 16, name: 'muzzle brake', barrel: true });
  for (let k = 0; k < 3; k++) box('slide', 'dark', 0.165, 0.028, 0.03, 0, 0, S.reach - 0.19 + k * 0.065, { name: 'brake slot', barrel: true, small: true });
  return P;
}
// corner or rim points of a part in its own frame (for the check): boxes give 8 corners plus edge and face points, cylinders rings of points
export function partPoints(pt, step = 0.03) {
  const out = [], [px, py, pz] = pt.p;
  if (pt.shape === 'box') { const [sx, sy, sz] = pt.s, nx = Math.max(1, Math.ceil(sx / step)), ny = Math.max(1, Math.ceil(sy / step)), nz = Math.max(1, Math.ceil(sz / step)), c = Math.cos(pt.ry || 0), s = Math.sin(pt.ry || 0);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) { if (i && i < nx && j && j < ny && k && k < nz) continue; const x = (i / nx - 0.5) * sx, y = (j / ny - 0.5) * sy, z = (k / nz - 0.5) * sz; out.push([px + x * c + z * s, py + y, pz - x * s + z * c]); } }
  else { const n = Math.max(1, Math.ceil(pt.len / step)), m = 20; for (let i = 0; i <= n; i++) { const f = i / n, r = pt.r1 + (pt.r0 - pt.r1) * f, a0 = (f - 0.5) * pt.len; for (let k = 0; k < m; k++) { const a = k / m * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r; out.push(pt.axis === 'y' ? [px + u, py + a0, pz + v] : pt.axis === 'z' ? [px + u, py + v, pz + a0] : [px + a0, py + u, pz + v]); } } }
  return out;
}
// Lowest elevation (degrees) the gun may take at a station bearing (degrees, clockwise from the turret's front), from the table the
// check computed for the chosen place (FLOOR below; index = bearing / 5). The station lifts its gun over its own tank as it traverses,
// as real weapon stations do with their no-go zones. A second table applies while a hatch is open with a man up in it.
// The tables are written by `node tests/interior/station_clear.mjs table` (run through tests/interior/run.sh) and checked by the test.
export const FLOOR = { fixed: null, crewUp: null };
// fixed: hatches shut (the two rear whip aerials are the 13 and 42 degree entries); crewUp: a man standing in each hatch as well
FLOOR.fixed = [-10,-10,-8.5,-8.5,-9,-9,-4,-4.5,-3,-2.5,-2.5,-3,-3,-3,-3,-3.5,-10,-10,-10,-10,13,13,13,-10,-9.5,-9.5,-10,-10,-10,-10,-10,-10,42,42,42,42,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10];
FLOOR.crewUp = [-9,-7.5,-7,-7,-6.5,-6.5,-4,-4.5,-3,5.5,5.5,5.5,5.5,5.5,5,-3.5,-6,-6.5,-6.5,-7,13,13,13,-10,-9.5,-9.5,-10,-10,-10,-10,-10,-10,42,42,42,42,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-10,-9];
export function elevationFloor(bearingDeg, crewUp) { const T = (crewUp && FLOOR.crewUp) || FLOOR.fixed; if (!T) return STATION.elMin; const b = ((bearingDeg % 360) + 360) % 360 / 5, i = Math.floor(b) % 72, j = (i + 1) % 72, f = b - Math.floor(b); return Math.max(T[i], T[j], T[i] + (T[j] - T[i]) * f); }
