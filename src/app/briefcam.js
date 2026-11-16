// The briefing's own camera shots (Shawn, 16 Nov 2026: "they have bad camera angles"). Each shot is built for one kind of step and
// keeps the thing the text talks about large, near the middle of the free part of the screen, lit by the open sky and not behind
// the text panel. This file is plain arithmetic (no three.js, no page): the page hands it where things are this frame, the node test
// (tests/app/tour.test.mjs) hands it where the battle record says they are, and both get the same camera. The test then projects the
// subject onto the screen with project() below and checks it is inside the clear area and big enough, so a framing cannot silently
// go bad again.
//
// Scene coordinates as everywhere in the page: x = east, y = up, z = -north. A point is { x, y, z }.
// Frame rate: a shot is a function of the subjects' positions and of battle time only, so it is the same at any frame rate.

export const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const V = (x, y, z) => ({ x, y, z });
const add = (a, b, k) => V(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = a => Math.sqrt(dot(a, a));
const norm = a => { const l = len(a) || 1; return V(a.x / l, a.y / l, a.z / l); };
const mid = (a, b, f) => V(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
export const vec = { V, add, sub, dot, len, norm, mid };

// ---- the screen: a text panel down the left side, a thin chapter bar along the top; the rest is the clear picture -------------
export const PANEL = { min: 330, frac: 0.33, max: 640, top: 44 };
export const panelW = W => Math.round(clamp(W * PANEL.frac, PANEL.min, PANEL.max));
// the free part of the screen, where a subject must sit (with a margin), and the camera's view offset that centres the picture there
export function clearArea(W, H) { const p = panelW(W); return { x0: p + 10, x1: W - 10, y0: PANEL.top + 6, y1: H - 10, sx: p / 2, sy: PANEL.top / 2 }; }

// a point to the screen for a camera { pos, look, fov (vertical, degrees) } drawn with the view offset above. null: behind the camera
export function project(cam, p, W, H) {
  const f = norm(sub(cam.look, cam.pos)), r = norm(V(-f.z, 0, f.x)), u = V(r.y * f.z - r.z * f.y, r.z * f.x - r.x * f.z, r.x * f.y - r.y * f.x);
  const d = sub(p, cam.pos), z = dot(d, f); if (z < 0.1) return null;
  const t = Math.tan(cam.fov * DEG / 2), a = W / H, nx = dot(d, r) / z / (t * a), ny = dot(d, u) / z / t, C = clearArea(W, H);
  return { x: (nx + 1) / 2 * W + C.sx, y: (1 - ny) / 2 * H + C.sy, dist: z, px: H / (2 * t * z) };   /* px: screen pixels per metre at that distance */
}

// ---- what a shot needs (the page and the node test both build this) ----------------------------------------------------------
//   tank, station, launcher, missile, trophy: positions (missile: null when not in the air); mdir: the missile's heading (unit)
//   b: unit vector along the ground from the tank towards the launcher; p: unit vector to its right; g(x, z): ground height
//   at(d, h): the point d metres out along the line at h metres above the ground there; pts: extra named points (meet, cloud, end, ...)
export function frameOf(tank, launcher, g) {
  const dx = launcher.x - tank.x, dz = launcher.z - tank.z, l = Math.hypot(dx, dz) || 1, b = V(dx / l, 0, dz / l), p = V(-b.z, 0, b.x);
  return { b, p, R: l, at: (d, h) => { const x = tank.x + b.x * d, z = tank.z + b.z * d; return V(x, g(x, z) + (h || 0), z); } };
}

// The shots. side: +1 or -1, which side of the line the camera stands (chosen once per step by chooseSide so that the view is clear).
// age: battle seconds since the step began (a few shots drift slowly). Every shot returns { pos, look, fov }.
const lift = (S, P, h) => { const gy = S.g(P.x, P.z); if (P.y < gy + h) P.y = gy + h; return P; };
export const SHOTS = {
  // behind and beside the launching team, low, looking down its line of fire towards the tank: the team large in the foreground
  team: (S, side) => { const L = S.launcher, P = lift(S, add(add(L, S.b, 10), S.p, 4.2 * side), 2.6); P.y = Math.max(P.y, L.y + 1.8);
    const look = add(add(L, S.b, -9), S.p, 1.2 * side); look.y = L.y - 0.2; return { pos: P, look, fov: 42 }; },
  // over the weapon station's shoulder, looking out along the threat's bearing: the gun in the foreground, the distance it reaches beyond
  overgun: (S, side) => { const st = S.station, P = add(add(add(st, S.b, -6), S.p, 1.5 * side), V(0, 1, 0), 1.3);
    const look = add(st, S.b, 220); look.y = st.y + 1; return { pos: lift(S, P, 2.5), look, fov: 40 }; },
  // the weapon station on the turret roof, close, from the side and a little behind, the gun pointing across the picture
  station: (S, side, age) => { const body = add(S.station, S.b, -1.1), a = (Math.sign(side) * (Math.abs(side) > 1 ? 150 : 100) + 6 * Math.sin(age * 0.25)) * DEG, dir = add(V(S.b.x * Math.cos(a), 0, S.b.z * Math.cos(a)), S.p, Math.sin(a));
    const P = add(add(body, dir, 7.5), V(0, 1, 0), 2.2); return { pos: lift(S, P, 2.5), look: add(add(body, S.b, 0.6), V(0, 1, 0), -0.2), fov: 38 }; },
  // the whole engagement from high to one side: the tank, the line to the launcher, and the points along it (planning)
  plan: (S, side) => { const C = S.at(S.R * 0.5, 0), D = S.R * 1.0, P = add(add(add(C, S.p, D * side), S.b, -D * 0.05), V(0, 1, 0), D * 0.5);
    return { pos: P, look: C, fov: 44 }; },
  // the whole tank from three quarters, close enough to fill the picture
  tank: (S, side, age) => { const T = S.tank, a = (Math.sign(side) * (Math.abs(side) > 1 ? 60 : 120) + age * 1.5) * DEG, dir = add(V(S.b.x * Math.cos(a), 0, S.b.z * Math.cos(a)), S.p, Math.sin(a));
    return { pos: lift(S, add(add(T, dir, 15), V(0, 1, 0), 8), 3), look: add(T, V(0, 1, 0), 0.6), fov: 40 }; },   /* 8 m up: looking down over the bushes beside the tank (the trees drawn on the map are not in the sight-line grid) */
  // a Trophy launcher: low, beside the turret on the launcher's side
  trophy: (S, side) => { const T = S.trophy || S.tank, sd = Math.sign(side), P = add(add(add(T, S.p, 7.5 * sd), S.b, Math.abs(side) > 1 ? -3.5 : 3.5), V(0, 1, 0), 0.8);
    return { pos: lift(S, P, 2.2), look: add(T, V(0, 1, 0), -0.4), fov: 40 }; },
  // from behind the tank, looking out along the threat's bearing: the tank low in the picture, the bearing running away to the horizon
  bearing: (S, side) => { const T = S.tank, P = add(add(add(T, S.b, -17), S.p, 4.5 * side), V(0, 1, 0), 5.5);
    const look = add(T, S.b, 140); look.y = T.y + 3.2; return { pos: lift(S, P, 3), look, fov: 44 }; },
  // straight above the tank, looking down, with the threat's direction at the top of the picture
  overhead: (S, side, age, o) => { const T = S.tank, h = (o && o.h) || 130, P = add(add(T, S.b, -h * 0.28), V(0, 1, 0), h);
    return { pos: P, look: add(T, S.b, h * 0.08), fov: (o && o.fov) || 46 }; },
  // a side view across the guidance line, centred on a point of it (o.at: a named point, or the missile while it flies) and wide
  // enough for o.span metres of it; o.track: follow the missile along the line (the camera trucks beside it)
  line: (S, side, age, o) => {
    let C = (o.track && S.missile) || (o.at && S.pts[o.at]) || S.missile || S.tank; const span = o.span || 120, fov = o.fov || 34;
    const D = clamp(span * 0.5 / Math.tan(fov * DEG / 2) / (16 / 9) * 1.7 + 18, 30, 900);
    const P = add(add(add(C, S.p, D * side), S.b, -D * (o.back == null ? 0.18 : o.back)), V(0, 1, 0), D * (o.up == null ? 0.16 : o.up));
    return { pos: lift(S, P, 2.5), look: C, fov }; },
  // behind and beside a missile or drone, keeping it low in the picture with the way ahead clear
  chase: (S, side, age, o) => { const M = S.missile || S.pts.last || S.tank, d = S.mdir || V(-S.b.x, 0, -S.b.z), back = (o && o.back) || 20;
    const P = add(add(add(M, d, -back), S.p, back * 0.35 * side), V(0, 1, 0), back * 0.32); return { pos: lift(S, P, 2), look: add(M, d, back * 1.4), fov: 46 }; },
  // beside the missile and a little ahead of it, looking back along the guidance line behind it (towards the launcher): the missile in
  // the foreground, the stretch of line its tail receiver looks along, and the puffs that land on it. (Straight down the line, the
  // missile's own smoke trail hides everything.)
  tail: (S, side, age, o) => { const M = S.missile || S.pts.last || S.at(S.R * 0.6, 4);
    const P = add(add(add(M, S.p, 10 * side), S.b, -12), V(0, 1, 0), 2.4); return { pos: lift(S, P, 1.5), look: add(add(M, S.b, 15), V(0, 1, 0), 0.3), fov: 44 }; },
  // two things on the ground at once (the tank and o.at): from the side, far enough for both
  pair: (S, side, age, o) => { const A = S.tank, Bp = S.pts[o.at] || S.launcher, C = mid(A, Bp, o.f == null ? 0.5 : o.f), span = len(sub(Bp, A)) + (o.pad || 30), fov = 38;
    const D = clamp(span * 0.5 / Math.tan(fov * DEG / 2) / (16 / 9) * 1.6 + 12, 25, 700), u = norm(sub(Bp, A)), q = V(-u.z, 0, u.x);
    const P = add(add(C, q, D * side), V(0, 1, 0), D * (o.up || 0.32)); return { pos: lift(S, P, 3), look: add(C, V(0, 1, 0), 1), fov }; },
};

// which side of the line to stand: the one with a clear sight line to the subject over the ground and through the trees
// (world.los, vegetation counted to within 2 m of each end), and not standing inside tall vegetation. Falls back to +1.
// The trees drawn on the map stand in the sight-line grid's scrub, wood and tree-line cells (src/render/scenery.js; an acacia in scrub
// up to 1.6 times the cell's height). A strict test: any such cell on the line from the camera to within 4 m of the subject, with the
// line below its trees' height, counts as blocking (world.los lets a sight line through some vegetation; a camera must not).
export function treesClear(world, cam, q) {
  const D = len(sub(q, cam.pos)), n = Math.ceil(D / 2);
  for (let i = 0; i <= n; i++) { const f = i / n; if (D * (1 - f) < 4 || D * f > 80) break;   /* a tree further than 80 m from the camera hides only a small part of the picture */ const x = cam.pos.x + (q.x - cam.pos.x) * f, y = cam.pos.y + (q.y - cam.pos.y) * f, z = cam.pos.z + (q.z - cam.pos.z) * f, v = world.veg(x, -z);
    if (v.cls >= 3 && v.cls <= 5 && y < world.h(x, -z) + v.h * (v.cls === 3 ? 1.6 : 1) + 0.5) return false; }
  return true;
}
// which side of the line to stand: the first with a clear sight line to the subject over the ground (world.los) and past the trees
// (treesClear). Shots that circle the tank (station, tank, trophy) also have a second angle each side (side +2 / -2). Falls back to +1.
const TURNS = { station: 1, tank: 1, trophy: 1 };
export function chooseSide(kind, S, o, subject, world) {
  if (!world) return 1; let best = 1, bestScore = -1;
  for (const side of TURNS[kind] ? [1, -1, 2, -2] : [1, -1]) { const c = SHOTS[kind](S, side, 0, o || {}), q = subject || c.look; let score = 0;
    try { const ge = c.pos.x, gn = -c.pos.z, h1 = c.pos.y - world.h(ge, gn), h2 = q.y - world.h(q.x, -q.z);
      const L = world.los(ge, gn, h1, q.x, -q.z, Math.max(0.3, h2), { endPad: 2 }); if (L.clear) score += 2; else if (L.d > len(sub(q, c.pos)) * 0.8) score += 1;
      if (treesClear(world, c, q)) score += 3; } catch (e) { score = 0; }
    if (score > bestScore) { bestScore = score; best = side; } }
  return best;
}
// is the line from the camera to a point open (terrain and trees)? the node test's check of a finished framing
export function sightClear(world, cam, q) {
  const ge = cam.pos.x, gn = -cam.pos.z, h1 = cam.pos.y - world.h(ge, gn), h2 = q.y - world.h(q.x, -q.z);
  return world.los(ge, gn, h1, q.x, -q.z, Math.max(0.3, h2), { endPad: 2 });
}
