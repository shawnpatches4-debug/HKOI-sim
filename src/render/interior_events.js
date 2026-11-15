// What goes wrong INSIDE the vehicle, worked out from the battle's own records: the damage report of every hit (plate, entry point,
// line of the jet, what it broke, who it hurt), the crew model (fire, bail-out) and, if the battle keeps one, the tank's fate.
// Nothing in here is drawn and nothing in here changes an outcome: it only answers "what would a man inside see", with a cause
// for every item. Plain functions of the hit list and the battle clock: the same answer at any frame rate, in a replay or a rewind.
//
// ASSUMPTIONS (display only; none of these feeds back into the battle):
//  - the inside of the turret is a box 2.4 m wide from the front wall (z -1.35) to the bustle doors (z +1.0), roof 0.54, basket floor -0.98;
//    the hull tub 2.28 m wide from z -1.75 to the engine bulkhead at +1.3; the driver's compartment 1.0 m wide ahead of that
//    (the same figures the interior is built with, interior_build.js). A jet is followed from the damage report's entry point along its
//    line to where it meets that box: that is the hole a man sees. If its reach (the report's own figure) carries it to the far wall
//    it scars that wall; it does not go out through the second wall (the far plate is as thick as the near one).
//  - a destroyed electrical unit (sight, thermal viewer, weapon station, radio, turret drive, stabiliser) trips breakers: red
//    emergency lighting until a man who can still work resets them (ELEC.resetS); with the radio rack or two units destroyed it stays red
//  - a hit on the turret drive sprays hydraulic fluid for HYD.sprayS and leaves a mist for HYD.mistS; if the unit was DESTROYED (the jet
//    itself went through it) the mist flashes once (the M1's fluid is fire-resistant, a hot jet through an atomised spray still flashes)
//  - fire: the same rule as the crew model (crew.js fireOf): bustle ammunition / engine or transmission / fuel cell or hull rack.
//    The crew compartment's Halon bottles fire 0.15 s after a hull fire starts (white blast, HALON.blastS, fog for HALON.fogS);
//    an engine fire is fought by its own bottles behind the bulkhead; nothing puts out burning ammunition, it vents through the roof panels
//  - the ammunition doors are BREACHED (the catastrophic case) only when the damage report says the hit was killing, the bustle
//    ammunition was hit, and the jet came through the crew compartment (it had to pierce the doors to get there), or when the battle's
//    own tank fate says so. A bustle hit from behind or above leaves the doors shut: roar and light behind them, glowing seams.
export const CTX = { battle: null, crew: null, viewer: null, speaking: null, outside: false, S: null, fate: null };   // shared between the interior's own modules (set each frame)
export const BOX = {
  tur: { x0: -1.2, x1: 1.2, y0: -0.98, y1: 0.54, z0: -1.35, z1: 1.0 },
  hul: { x0: -1.14, x1: 1.14, y0: -1.14, y1: -0.24, z0: -1.75, z1: 1.3 },
  drv: { x0: -0.5, x1: 0.5, y0: -1.14, y1: -0.45, z0: -3.3, z1: -1.75 },
};
export const PIVOT_Y = 1.617;   // height of the turret's turning point above the ground in the damage report's frame
export const ELEC = { resetS: 22, arcS: { damaged: 6, destroyed: 24 } };
export const HYD = { sprayS: 9, mistS: 45, flashAt: 0.22, flashS: 0.55 };
export const HALON = { delay: 0.15, blastS: 1.3, fogS: 14 };
export const FIRE_S = { hull: 8, engine: 20, ammo: 15 };   // as crew.js FIRE.outS (used only when the crew model is off)
// where the damage model's components sit in THIS interior (turret items in the turret's frame, hull items in the hull's): [x, y, z, frame]
export const AT = {
  gps: [0.72, 0.36, -1.0, 'tur'], citv: [0.5, 0.42, 0.05, 'tur'], hkoi: [1.05, 0.22, 0.16, 'tur'], radio: [-1.1, 0.12, 0.6, 'tur'], tdrive: [-0.3, -0.62, -0.25, 'tur'], stab: [0, -0.05, -0.95, 'tur'],
  gun: [0, 0.2, -0.45, 'tur'], ammo: [0, 0.24, 1.02, 'tur'], hull_ammo: [-0.5, -0.9, 1.2, 'hul'], fuel_l: [-0.82, -0.8, -1.72, 'hul'], fuel_r: [0.82, -0.8, -1.72, 'hul'], engine: [0, -0.7, 1.3, 'hul'], trans: [0, -0.8, 1.3, 'hul'],
};
const ELECTRICAL = { gps: 1, citv: 1, hkoi: 1, radio: 1, tdrive: 1, stab: 1 };
// which display each broken component takes with it
export const SCREEN_OF = { gps: ['gps', 'gas', 'comp'], citv: ['citv'], hkoi: ['hkoi'], radar: ['hkoi'], tdrive: ['comp'], stab: ['comp'], engine: ['drv'], trans: ['drv'] };
export const hsh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bad = s => !!s && s !== 'spared';
export const fireOf = c => (bad(c.ammo) ? 'ammo' : bad(c.engine) || bad(c.trans) ? 'engine' : bad(c.fuel_l) || bad(c.fuel_r) || bad(c.hull_ammo) ? 'hull' : null);

// a ray against a box: where it comes in, where it would leave, and the faces it does so through
function through(B, o, d) {
  let t0 = -1e9, t1 = 1e9, a0 = 0, a1 = 0;
  for (let k = 0; k < 3; k++) { const lo = k === 0 ? B.x0 : k === 1 ? B.y0 : B.z0, hi = k === 0 ? B.x1 : k === 1 ? B.y1 : B.z1, dk = d[k];
    if (Math.abs(dk) < 1e-6) { if (o[k] < lo || o[k] > hi) return null; continue; }
    let ta = (lo - o[k]) / dk, tb = (hi - o[k]) / dk; if (ta > tb) { const s = ta; ta = tb; tb = s; } if (ta > t0) { t0 = ta; a0 = k; } if (tb < t1) { t1 = tb; a1 = k; } }
  if (t0 > t1 || t1 < 0) return null; return { t0: Math.max(t0, 0), t1, a0, a1 };
}
// Everything about one hit that does not change with time, worked out once and kept on the hit as h.x
export function detail(h) {
  if (h.x) return h.x;
  const x = h.x = { frame: null, hidden: false, pIn: null, nIn: [0, 0, 0], pEnd: null, pFar: null, nFar: [0, 0, 0], len: 0, run: 0, far: false, tIn: 0, o: null, d: null, eT: null, dT: null, eH: null, dH: null, fire: null, breach: false, seen: null, comps: h.comps || {} };
  if (h.minor || !h.e || !h.d) return x;
  const a = h.turA || 0, c = Math.cos(a), s = Math.sin(a), e = [h.e.x, h.e.y, h.e.z], d = [h.d.x, h.d.y, h.d.z];
  x.eH = e; x.dH = d; x.eT = [e[0] * c + e[2] * s, e[1], -e[0] * s + e[2] * c]; x.dT = [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c];   /* the damage report's turret frame: its entry was turned by -turA, so turn it back */
  const z = h.zoneKey || '', tur = z ? z.startsWith('turret') : e[1] > BOX.hul.y1;
  x.frame = tur ? 'tur' : z === 'hull_front' ? 'drv' : 'hul'; x.hidden = z === 'hull_rear' || z === 'engine_deck' || z === 'hull_side_r' || z === 'turret_rear';   /* into the engine bay or the bustle: nothing comes through the crew's walls */
  const B = BOX[x.frame], o = tur ? x.eT : x.eH, dd = tur ? x.dT : x.dH, r = through(B, o, dd); x.o = o; x.d = dd;
  if (!r) { const q = [clamp(o[0], B.x0, B.x1), clamp(o[1], B.y0, B.y1), clamp(o[2], B.z0, B.z1)], far = [Math.abs(o[0] - q[0]), Math.abs(o[1] - q[1]), Math.abs(o[2] - q[2])], k = far[0] >= far[1] && far[0] >= far[2] ? 0 : far[1] >= far[2] ? 1 : 2;
    x.pIn = q; x.nIn[k] = o[k] > q[k] ? -1 : 1; x.len = 0.6; x.pFar = null; x.tIn = Math.hypot(far[0], far[1], far[2]); }   /* the line misses the box (a glancing plate): the mark is put on the nearest point of the wall */
  else { x.pIn = [o[0] + dd[0] * r.t0, o[1] + dd[1] * r.t0, o[2] + dd[2] * r.t0]; x.nIn[r.a0] = dd[r.a0] > 0 ? 1 : -1; x.len = r.t1 - r.t0; x.tIn = r.t0;
    x.pFar = [o[0] + dd[0] * r.t1, o[1] + dd[1] * r.t1, o[2] + dd[2] * r.t1]; x.nFar[r.a1] = dd[r.a1] > 0 ? -1 : 1; }
  // how far the jet runs inside: the report's reach is measured from the outside of the plate (a staged hit without one: by its strength)
  const reach = h.reach != null ? h.reach : h.pen ? (h.kill ? 3.2 : 1.5) : 0; x.run = h.pen ? clamp(reach - x.tIn, 0.25, x.len) : 0; x.far = !!(h.pen && x.pFar && reach - x.tIn >= x.len - 0.02);
  x.pEnd = [x.pIn[0] + dd[0] * x.run, x.pIn[1] + dd[1] * x.run, x.pIn[2] + dd[2] * x.run];
  x.fire = h.pen ? fireOf(x.comps) : null;
  x.breach = !!(h.pen && h.kill && bad(x.comps.ammo) && x.frame === 'tur' && !x.hidden && x.dT[2] > 0.2);   /* the jet crossed the fighting compartment and went on through the doors */
  if (x.hidden && h.pen) x.seen = bad(x.comps.ammo) ? 'doors' : 'bulkhead';   /* what the crew sees of a hit behind a bulkhead */
  return x;
}

// what the battle says became of the tank, if it keeps that: { t, kind } (kind: a word such as catastrophic, blowout, fire, mobility, abandoned)
export function fateOf(battle) {
  if (!battle) return null; const f = battle.tank && battle.tank.fate;
  if (f && typeof f === 'object' && (f.t != null || f.T != null)) return { t: f.t != null ? f.t : f.T, kind: String(f.kind || f.fate || f.type || f.how || '').toLowerCase() };
  const E = battle.events; if (!E || !E.length) return null; if (battle._inFateN === E.length) return battle._inFate; let out = null;
  for (let i = E.length - 1; i >= 0 && i > E.length - 400; i--) { const e = E[i]; if (e.type === 'tank_fate' || e.type === 'blowout') { out = { t: e.t, kind: String(e.fate || e.kind || e.type || '').toLowerCase() }; break; } }
  battle._inFateN = E.length; battle._inFate = out; return out;
}

// The state of the inside at battle time `now`. hits: the list from interior_fx.hitList (time order); crew: battle.crewState() or null.
const ST = { shake: 0, flick: 0, glitch: 0, smoke: 0, dust: 0, flash: 0, fire: false, lightsOut: false, emergency: false, alarm: false, dark: {}, weak: {}, last: null, lastAge: 1e9, blood: {}, pulse: null,
  outside: false, hits: null, now: 0, lastAny: null, lastAnyAge: 1e9, arcs: [], hyd: null, fires: [], halon: null, blow: null, breach: null, cracked: {}, manual: false, powerOut: false, gunHit: null, optics: 0, abandoned: false, rock: 0, quiet: 1e9, engine: null };
export function insideState(hits, now, crew, fate) {
  const S = ST; S.shake = S.flick = S.glitch = S.smoke = S.dust = S.flash = S.optics = S.rock = 0; S.fire = S.lightsOut = S.emergency = S.alarm = S.manual = S.powerOut = false; S.dark = {}; S.weak = {}; S.cracked = {}; S.last = null; S.lastAge = 1e9; S.blood = {}; S.pulse = null;
  S.outside = false; S.hits = hits; S.now = now; S.lastAny = null; S.lastAnyAge = 1e9; S.arcs.length = 0; S.hyd = null; S.fires.length = 0; S.halon = null; S.blow = null; S.breach = null; S.gunHit = null; S.abandoned = !!(crew && crew.abandoned); S.quiet = 1e9; S.engine = null;
  let trips = 0, lastTrip = -1e9, hardDown = 0;
  for (const h of hits) { const age = now - h.T; if (age < 0) break; S.quiet = age;
    if (age < 5) { S.shake += h.s * Math.exp(-2.2 * age); S.rock += h.s * Math.exp(-0.9 * age) * Math.cos(age * 5.2); }   /* the hull rocks on its suspension for a few seconds after a blow: what the swinging things follow */
    S.flick = Math.max(S.flick, (h.pen ? 2.2 : 0.55 * h.s) - age); S.glitch = Math.max(S.glitch, (h.pen ? 1.4 : 0.45 * h.s) - age);
    if (h.minor) { if (!S.pulse || h.T > S.pulse.t) S.pulse = { t: h.T, strength: h.s, penetrated: false }; if (age < 1.2) S.optics = Math.max(S.optics, 0.5 * (1 - age / 1.2)); continue; }   /* a burst close by whites out the sights for a moment */
    const x = detail(h); S.pulse = { t: h.T, strength: h.s, penetrated: h.pen }; S.lastAny = h; S.lastAnyAge = age; if (!x.hidden) { S.last = h; S.lastAge = age; }
    if (age < 1.6) S.optics = Math.max(S.optics, (h.pen ? 1 : 0.8) * (1 - age / 1.6));
    if (h.pen) { if (!x.hidden || x.fire) S.smoke = Math.max(S.smoke, h.kill ? Math.min(1, 0.55 + age * 0.06) : (x.hidden ? 0.35 : 0.8) * Math.exp(-age / 14)); if (age < 0.14 && !x.hidden) S.flash = Math.max(S.flash, 1 - age / 0.14);
      if (h.kill) { S.fire = true; S.lightsOut = true; } if (age < 25 || h.kill) S.alarm = true;
      for (const r in h.crew) if (h.crew[r] !== 'ok') S.blood[r] = S.blood[r] === 'killed' ? 'killed' : h.crew[r];
      // electrical: arcing where a unit was hit, breakers tripping
      let dead = 0; for (const id in x.comps) { const st = x.comps[id]; if (!ELECTRICAL[id] || !bad(st)) continue; const life = ELEC.arcS[st] || 6; if (st === 'destroyed') dead++; if (age < life && AT[id]) S.arcs.push({ id, at: AT[id], age, life, seed: h.idx * 7 + id.length }); }
      if (dead) { trips++; lastTrip = h.T; if (x.comps.radio === 'destroyed' || dead > 1) hardDown++; }
      if (bad(x.comps.tdrive)) { S.hyd = { T: h.T, age, at: AT.tdrive, destroyed: x.comps.tdrive === 'destroyed', seed: h.idx }; S.manual = true; }   /* turret power lost: the gunner goes to the hand crank */
      if (bad(x.comps.gun) || bad(x.comps.stab)) S.gunHit = { T: h.T, age, gun: x.comps.gun || null, stab: x.comps.stab || null, seed: h.idx };
      if (x.comps.engine === 'destroyed' || x.comps.trans === 'destroyed') S.engine = { T: h.T, age };
      if (x.fire) S.fires.push({ where: x.fire, since: h.T, until: h.kill ? 1e9 : h.T + FIRE_S[x.fire], hit: h, side: bad(x.comps.fuel_l) ? -1 : bad(x.comps.fuel_r) ? 1 : 0, age: 0, on: false, out: 0 });
      if (x.breach) S.breach = { T: h.T, age }; }
    else S.dust = Math.max(S.dust, 0.32 * Math.exp(-age / 1.6));
    for (const id in h.comps) for (const scr of SCREEN_OF[id] || []) { if (h.comps[id] === 'destroyed') { S.dark[scr] = true; S.cracked[scr] = h.idx; } else if (bad(h.comps[id])) { S.weak[scr] = true; if (!S.cracked[scr] && hsh(h.idx, scr.length) < 0.6) S.cracked[scr] = h.idx; } } }
  // the crew model's own fire record decides when a fire is out (it also knows about the second bottle)
  const cf = crew && crew.on ? crew.fire : null;
  for (let i = S.fires.length - 1; i >= 0; i--) { const f = S.fires[i]; if (f.until < 1e8 && cf && cf.where === f.where && cf.since <= f.since + 0.5) f.until = cf.until; f.age = now - f.since; f.on = now < f.until; f.out = f.on ? 0 : now - f.until; if (!f.on && f.out > 60) S.fires.splice(i, 1); }
  for (const f of S.fires) { if (f.on) S.fire = true; if (f.where === 'hull' && (!S.halon || f.since > S.halon.T)) S.halon = { T: f.since + HALON.delay, age: now - f.since - HALON.delay, side: f.side }; if (f.where === 'ammo') S.blow = { T: f.since, age: f.age, on: f.on }; }
  if (S.halon && (S.halon.age < 0 || S.halon.age > HALON.fogS)) S.halon = null;
  if (fate && fate.t <= now && /cata|cook|brew|turret|explod/.test(fate.kind)) { if (!S.breach || fate.t < S.breach.T) S.breach = { T: fate.t, age: now - fate.t }; S.fire = true; S.lightsOut = true; }
  if (fate && fate.t <= now && /blow|panel/.test(fate.kind) && !S.blow) S.blow = { T: fate.t, age: now - fate.t, on: now - fate.t < FIRE_S.ammo };
  if (S.breach) { S.smoke = 1; S.alarm = true; }
  // emergency lighting: from the first tripped breaker until someone resets it; for good when the damage is too much
  const able = !crew || !crew.on || ['ldr', 'cdr', 'gnr'].some(r => crew.who[r] && crew.who[r].status === 'ok');
  if (trips && (hardDown || !able || now - lastTrip < ELEC.resetS)) S.emergency = true; S.powerOut = !!S.engine;
  if (S.hyd && S.hyd.age > HYD.mistS) S.hyd = null;
  for (const f of S.fires) if (f.on) S.smoke = Math.max(S.smoke, Math.min(0.85, 0.25 + f.age * (f.where === 'hull' ? 0.07 : 0.025))); else S.smoke = Math.max(S.smoke, 0.5 * Math.exp(-f.out / 18));
  if (S.halon) S.smoke = Math.max(S.smoke, 0.75 * Math.exp(-S.halon.age / 6));   /* the Halon cloud itself */
  return S;
}
// the same, when nothing of the inside is to be shown (seen from outside)
export function noState() { const S = insideState([], 0, null, null); S.outside = true; return S; }

// How hard a hit is felt at a seat, 0 to 1 (for the viewer's ringing ears and for flinching): strength, falling off with the
// distance from where it struck or from the jet's line. seat: [x, y, z]; frame: 'tur' | 'hul' (the driver)
export function felt(h, seat, frame) {
  if (h.minor) return 0.12 * h.s; const x = detail(h); if (!x.pIn) return 0.3 * h.s;
  let d = 2.2; if (seat && ((x.frame === 'tur') === (frame === 'tur'))) { const p = x.pIn, ax = seat[0] - p[0], ay = seat[1] - p[1], az = seat[2] - p[2]; if (h.pen && x.run > 0) { const t = clamp(ax * x.d[0] + ay * x.d[1] + az * x.d[2], 0, x.run); d = Math.hypot(ax - x.d[0] * t, ay - x.d[1] * t, az - x.d[2] * t); } else d = Math.hypot(ax, ay, az); }
  return clamp((h.pen ? 0.55 : 0.3) * h.s * (0.35 + 0.65 / (1 + d * d * 1.6)) * (x.hidden ? 0.6 : 1), 0, 1);
}
// the viewer's concussion at `now`: deaf (0..1 ringing ears, muffled sound), tunnel (vision closing in), blur, shake, flash (white-out)
const CON = { deaf: 0, tunnel: 0, shake: 0, flash: 0, blur: 0 };
export function concussion(hits, now, seat, frame) {
  CON.deaf = CON.tunnel = CON.shake = CON.flash = CON.blur = 0; if (!hits || !seat) return CON;
  for (const h of hits) { const age = now - h.T; if (age < 0) break; if (age > 14) continue; const f = felt(h, seat, frame); if (f < 0.05) continue;
    CON.deaf = Math.max(CON.deaf, f * Math.exp(-age / (2 + 5 * f))); CON.tunnel = Math.max(CON.tunnel, f * Math.exp(-age / (0.8 + 3.2 * f))); CON.blur = Math.max(CON.blur, f * Math.exp(-age / (0.6 + 2.4 * f)));
    CON.shake = Math.max(CON.shake, f * Math.exp(-age / 0.7)); if (age < 0.22 && h.pen) CON.flash = Math.max(CON.flash, f * (1 - age / 0.22)); }
  return CON;
}
