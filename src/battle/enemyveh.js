// Enemy vehicles: a light truck that carries a missile team, the BMP-2, the T-72B3 and the T-90M; and how the tank's gunner fights them.
// Installed onto the battle layer the way tankai.js and crew.js are. With no vehicle in the force nothing here runs and every battle
// is exactly as before (tests/battle/vehicles_off.js proves it against battles recorded before the hooks existed).
//
// ============================================================================================================================
// DATA CONTRACT for anything that draws or lists the vehicles (read only; rebuilt on every call)
//   battle.vehicles() -> [ {
//     id        number, 100 and up (never a team's id; shown as "BMP-2 #101")
//     kind      'uaz' | 'bmp2' | 't72' | 't90'           name  'UAZ-469' | 'BMP-2' | 'T-72B3' | 'T-90M'
//     e, n      metres, the map frame of battle.units
//     hull      hull bearing, degrees clockwise from north
//     turret    turret bearing, degrees clockwise from north, absolute (equals hull for the UAZ)
//     speed     m/s (0 when halted)
//     state     'parked' | 'moving' | 'firing' | 'hit' | 'burning' | 'abandoned'
//               firing = a weapon fired in the last 1.5 s; hit = struck in the last 4 s and still crewed
//     alive     false once burning or abandoned         gone  true once it has pulled out of the fight
//     mobile, canFire   a mobility kill leaves canFire true, a firepower kill leaves mobile true
//     known     the tank crew has located it            hullDown  ground hides its hull from the tank
//     wave      the wave it came with
//     riders    [{ uid, mounted }]   UAZ only. mounted: the team is aboard (its unit sits at the vehicle's e, n: do not draw the men)
//     lastShot  null | { t, weapon: '30mm' | 'konkurs' | '125mm' | 'coax', at: [e, n], dur, hit: true | false | null }
//     damage    null | { t, zone, through, effect: 'none' | 'mobility' | 'firepower' | 'catastrophic', by: 'main_ap' | 'main_mp' | 'm2', aspect }
//     intent    plain words                              order  null | the enemy commander's order to it, plain words
//   } ]
//   zone: turret_front, turret_side, turret_rear, turret_ring, hull_front, lower_front, hull_side, hull_rear, track (UAZ: body)
//   battle.units[i].mounted (bool), .rideId (vehicle id or null)
//   events: veh_located { vid }, veh_move { vid, to }, veh_shot { vid, weapon, at, dur, hit } (30 mm bursts, coax, 125 mm rounds that
//     miss; 125 mm hits and every Konkurs go through the usual launch / end events with uid = the vehicle's id), gun { vid, R, tof,
//     hit, round: 'ap' | 'mp', zone }, veh_hit { vid, zone, through, effect, by }, veh_lost { vid, how: 'burning' | 'abandoned' },
//     mount { uid, vid }, dismount { uid, vid }, tank_damage { what, by }
//   battle.shots and battle.mgs entries carry vid when the target was a vehicle.
//   battle.vehReport() -> counts for tests and a debrief (see the function).
// ============================================================================================================================
//
// ASSUMPTIONS. Every figure below was chosen by Claude on 14 Nov 2026 from open-source estimates or plain judgement. None is data
// from a trial and none was tuned to make a result come out. Each is open to challenge.
//
// | What | Figure | Where it comes from |
// | --- | --- | --- |
// | UAZ-469 speed | 50 km/h on a road, 25 km/h across fields, 12 km/h in scrub, trees or on a slope | well under its 100 km/h road maximum: a loaded vehicle on tracks and fields |
// | BMP-2 speed | 40 / 25 / 12 km/h (road / fields / rough) | tactical speeds; maximum is 65 km/h |
// | T-72B3, T-90M speed | 36 / 25 / 12 km/h | tactical speeds; maximum is 60 km/h |
// | Loading a missile team into the UAZ | 20 s after the usual pack-up (15 s); 15 s to dismount | judgement |
// | A team walks back to its vehicle | only if it is within 400 m | judgement |
// | Dismount point | 80 to 260 m from the firing point, out of the tank's believed view or in cover | judgement |
// | Vehicle heat signature against a man (thermal scan, same formula as for teams) | UAZ 5 (2 parked, engine off), BMP-2 10, tanks 12; moving x4; just fired x5; x0.25 while it lies in its first position and has neither moved nor fired (engine off, camouflaged) | judgement: a hot engine fills the sight |
// | Vehicle sights, range at which a halted crew can pick the tank out | BMP-2 3,000 m by day, 1,000 m at night (image intensifier); T-72B3 4,000 / 3,000 m (Sosna-U thermal); T-90M 4,000 / 3,500 m (Kalina); rain x0.6, snow x0.7, fog x0.35 | published sight ranges, rounded |
// | BMP-2 30 mm | 8-round bursts every 4 s, effective to 2,000 m, 20 armour-piercing bursts then 40 high-explosive | 2A42, 160 AP + 340 HE carried |
// | 30 mm burst puts rounds on the tank | 85% minus 1% per 25 m of range (45% at 1,000 m), x0.6 hull-down, x0.7 tank moving, by crew level, floor 8% | judgement |
// | 30 mm against the M1 | CANNOT perforate front or side armour. Per burst on target (AP / HE): gunner's sight 5 / 4%, commander's viewer 5 / 4%, HKOI station 8 / 6%, HKOI radar 5 / 4%, Trophy launcher or panel on the struck side 5 / 3% (that side's rounds are lost), laser warner 4 / 4%, radio aerials 6 / 8%, track 3 / 1% (hull exposed only), loader if up in his hatch 25 / 35% | judgement; the first strike on a system damages it, the second destroys it |
// | BMP-2 Konkurs | 4 missiles, 100 to 3,800 m, 5 s to lay, 30 s to reload, flown by the engine exactly as a Konkurs team's | 9M113M; reload from the hatch is slower than a ground team's 26 s |
// | T-72B3 / T-90M gun | 12 sabot rounds for the M1, 200 to 3,000 m, 6 s first lay, 7.5 s autoloader, fires from the halt only (moving up, it halts when the M1 comes into view) | engine duel figures (first shot 3 to 7 s, reload 7.5 s) |
// | Tank gun hit chance on the M1 | the engine's duel rule: 75% minus 1% per 60 m, minus 15 if the M1 moves (45% at 1,800 m); x0.6 if the M1 is hull-down; green x0.8, expert x1.1, veteran x1.15; T-90M x1.08 | src/engine.js duel.p_hit_ref; the rest judgement. A hit is handed to the engine as its `ke` threat: the engine decides the kill (35% flat, or by plate with the armour option) and nothing on the M1 can stop it |
// | Tank coax | fires only at a loader up in his hatch inside 800 m: 5% a burst | judgement |
// | The M1's rounds | sabot: M829A4 class, about 800 mm at 2 km (850 mm minus 25 per km), 1,650 m/s. Multi-purpose: M830A1 class shaped charge, about 500 mm at any range, 1,140 m/s. Each round varies 10% either way | open-source estimates; the real figures are not public |
// | Reactive armour | the sabot is built to beat it: only half the reactive armour's nominal gain counts against it. Full gain against the shaped charge | M829A4's stated purpose; the half is a guess |
// | Armour, mm of steel equivalent (sabot / shaped charge) | see ZONES below | open-source estimates (Fofanov, Zaloga, Steel Beasts tables), rounded; real values vary across each plate |
// | What a perforating 120 mm round does inside | see FX below: chances of catastrophic / firepower / mobility kill by zone | judgement: the T-72 family keeps its ammunition in the hull floor under the turret |
// | A 120 mm round that does not get through a tank | 15% knocks out sights or gun (firepower kill); the crew loses its lay | judgement |
// | Crew abandons a crippled vehicle | chance = (1 - nerve) for a mobility or firepower kill, +0.3 when it has lost both | nerve from the SKILL table |
// | Main gun dispersion, one standard deviation | sabot 0.35 mrad + 0.05 per km; multi-purpose 0.40 + 0.10 per km; x2.5 from a moving M1; up to x2 against a crossing target; x crew stress; sight damaged x1.5, destroyed x2.5 | set so a frontal tank at 2 km is hit about 70% of the time, the engine's duel figure (own_p_hit_ref 0.92 minus R/9000); circular normal spread, zones treated as discs of the same area |
// | Lay time on a vehicle | as for a team: turret swing + 2.5 s + 1.3 s per km, crew stress added; 1.5 s to re-lay on the same vehicle after a round. On the move he fires only if the chance to hit the vehicle at all is 30% or better, unless an enemy tank is laying on him | tankai.js |
// | Battle-carry | the round in the breech at the start is multi-purpose; the loader loads sabot only while a tank is the gunner's target; a round already loaded is fired at the target rather than unloaded | US practice is to fire the round in the tube; the starting round is a guess |
// | .50 against the UAZ | 70% per 3 s burst at point-blank, falling by half every 485 m, x0.7 if it is moving, x0.6 from a moving tank; a hit: 25% burns, 60% disabled and abandoned, 15% holes only | judgement |
// | Riders when their vehicle is destroyed | by the main gun 85% lost, burning after .50 fire 60%, disabled by .50 fire 35%; survivors are pinned and go on foot | judgement |
// | Group morale | a tank counts as three teams and a BMP as two when the group judges how much of it is left (the battle layer's break rule and the commander's) | judgement |
// | Vehicle changes position | after 3 shots from one spot, or when struck and still mobile (trained crews and better); 60 to 220 m | judgement |
(function (root) {
  'use strict';
  const DEG = Math.PI / 180, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const brgOf = (e0, n0, e1, n1) => (Math.atan2(e1 - e0, n1 - n0) / DEG + 360) % 360, angDiff = (a, b) => ((a - b + 540) % 360) - 180;
  const km = R => R >= 1000 ? (R / 1000).toFixed(2) + ' km' : Math.round(R / 10) * 10 + ' m';
  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const compass = b => COMPASS[Math.round((((b % 360) + 360) % 360) / 45) % 8];

  // what each kind is. spec is the part the battle layer and the engine read for the weapon that goes through the engine.
  const KINDS = {
    uaz: { name: 'UAZ-469', dims: [4.0, 1.8, 2.0], road: 13.9, cross: 6.9, rough: 3.3, sig: 5, sigCold: 2, agl: 1.6, armed: false, turn: 60,
      spec: { name: 'UAZ-469', key: 'uaz', agl: 1.6 } },
    bmp2: { name: 'BMP-2', dims: [6.7, 3.15, 2.45], road: 11.1, cross: 6.9, rough: 3.3, sig: 10, agl: 2.0, armed: true, weight: 2, turn: 40, turret: 30, sight: { day: 3000, night: 1000 }, lo: 800, hi: 1800,
      spec: { name: 'BMP-2', key: 'saclos', rmin: 100, rmax: 3800, aim: 5, needsLos: true, reload: 30, agl: 2.0, setup: 0, move: 0 }, msl: 4, apBursts: 20, heBursts: 40, cannonR: 2000 },
    t72: { name: 'T-72B3', dims: [6.9, 3.6, 2.2], road: 10, cross: 6.9, rough: 3.3, sig: 12, agl: 2.2, armed: true, weight: 3, turn: 35, turret: 24, sight: { day: 4000, night: 3000 }, lo: 1200, hi: 2500, hitK: 1,
      spec: { name: 'T-72B3', key: 'ke', rmin: 200, rmax: 3000, aim: 6, needsLos: false, reload: 7.5, agl: 2.2, setup: 0, move: 0 }, rounds: 12 },
    t90: { name: 'T-90M', dims: [6.9, 3.8, 2.25], road: 10, cross: 6.9, rough: 3.3, sig: 12, agl: 2.2, armed: true, weight: 3, turn: 35, turret: 30, sight: { day: 4000, night: 3500 }, lo: 1200, hi: 2500, hitK: 1.08,
      spec: { name: 'T-90M', key: 'ke', rmin: 200, rmax: 3000, aim: 6, needsLos: false, reload: 7.5, agl: 2.2, setup: 0, move: 0 }, rounds: 12 },
  };
  const isTank = v => v.kind === 't72' || v.kind === 't90';
  const SEEING = { rain: 0.6, snow: 0.7, fog: 0.35 };
  const HITK = { green: 0.8, trained: 1, expert: 1.1, veteran: 1.15 };
  const LOAD_S = 20, UNLOAD_S = 15, WALK_BACK = 400;

  // What a perforating 120 mm round does inside: chances of [catastrophic kill, firepower kill, mobility kill]; the rest is no effect.
  const FX = {
    turret: [0.35, 0.50, 0], ring: [0.50, 0.35, 0], glacis: [0.45, 0.05, 0.30], lower: [0.50, 0, 0.35], side: [0.55, 0.05, 0.25], rear: [0.25, 0, 0.70], track: [0, 0, 0.9],
    lturret: [0.45, 0.50, 0], lhull: [0.70, 0.10, 0.15], lrear: [0.60, 0, 0.35], ltrack: [0.1, 0, 0.85], soft: [1, 0, 0],
  };
  // Armour zones. on: which facing decides how much of it shows. A: square metres presented [from the front, from the side, from the
  // rear]; what shows at an angle is front x cos + side x sin (or rear x cos from behind). ke / heat: mm of steel equivalent against a
  // long-rod sabot / a shaped charge, WITHOUT reactive armour. era: what reactive armour adds, nominal [against sabot, against shaped
  // charge]. low: hidden when the vehicle is hull-down. All ESTIMATES (see the table at the top).
  const TANK_ZONES = (tf, gl, era, sideEra, tside, trear, ring, lower) => [
    { key: 'turret_front', label: 'turret front', on: 'turret', A: [1.6, 0, 0], ke: tf[0], heat: tf[1], era, fx: FX.turret },
    { key: 'turret_side', label: 'turret side', on: 'turret', A: [0, 1.9, 0], ke: tside[0], heat: tside[1], fx: FX.turret },
    { key: 'turret_rear', label: 'turret rear', on: 'turret', A: [0, 0, 1.3], ke: trear, heat: trear, fx: FX.turret },
    { key: 'turret_ring', label: 'turret ring', on: 'hull', A: [0.35, 0.35, 0.35], ke: ring[0], heat: ring[1], low: true, fx: FX.ring },
    { key: 'hull_front', label: 'glacis', on: 'hull', A: [2.2, 0, 0], ke: gl[0], heat: gl[1], era, low: true, fx: FX.glacis },
    { key: 'lower_front', label: 'lower hull front', on: 'hull', A: [1.4, 0, 0], ke: lower, heat: lower, low: true, fx: FX.lower },
    { key: 'hull_side', label: 'hull side', on: 'hull', A: [0, 3.4, 0], ke: 80, heat: 80, era: sideEra, low: true, fx: FX.side },
    { key: 'hull_rear', label: 'hull rear', on: 'hull', A: [0, 0, 2.6], ke: 45, heat: 45, low: true, fx: FX.rear },
    { key: 'track', label: 'tracks', on: 'hull', A: [0.5, 4.0, 0.5], ke: 0, heat: 0, low: true, fx: FX.track },
  ];
  const ZONES = {
    // T-72B3: cast turret with a composite insert, Kontakt-5 on the turret front and glacis, light side skirts with some reactive tiles
    t72: TANK_ZONES([540, 650], [500, 600], [130, 400], [0, 150], [280, 320], 70, [250, 280], 250),
    // T-90M: welded turret, Relikt on the front arc and the hull sides
    t90: TANK_ZONES([620, 750], [550, 650], [250, 600], [0, 350], [320, 380], 80, [300, 330], 260),
    // BMP-2: proof against 23 mm from the front and rifle-calibre from the sides; anything a tank fires goes through
    bmp2: [
      { key: 'turret_front', label: 'turret front', on: 'turret', A: [0.7, 0, 0], ke: 30, heat: 30, fx: FX.lturret },
      { key: 'turret_side', label: 'turret side', on: 'turret', A: [0, 0.9, 0], ke: 20, heat: 20, fx: FX.lturret },
      { key: 'turret_rear', label: 'turret rear', on: 'turret', A: [0, 0, 0.6], ke: 16, heat: 16, fx: FX.lturret },
      { key: 'hull_front', label: 'hull front', on: 'hull', A: [1.6, 0, 0], ke: 35, heat: 35, low: true, fx: FX.lhull },
      { key: 'lower_front', label: 'lower hull front', on: 'hull', A: [1.6, 0, 0], ke: 30, heat: 30, low: true, fx: FX.lhull },
      { key: 'hull_side', label: 'hull side', on: 'hull', A: [0, 5.0, 0], ke: 18, heat: 18, low: true, fx: FX.lhull },
      { key: 'hull_rear', label: 'hull rear', on: 'hull', A: [0, 0, 3.5], ke: 16, heat: 16, low: true, fx: FX.lrear },
      { key: 'track', label: 'tracks', on: 'hull', A: [0.4, 3.5, 0.4], ke: 0, heat: 0, low: true, fx: FX.ltrack },
    ],
    uaz: [{ key: 'body', label: 'body', on: 'hull', A: [2.9, 6.4, 2.9], ke: 0, heat: 0, fx: FX.soft }],
  };
  // The M1's two kinds of main gun round (ESTIMATES: see the table at the top)
  const ROUNDS = {
    ap: { key: 'ap', name: 'sabot', label: 'M829A4 class sabot', kind: 'ke', v: 1650, pen: R => 850 - 25 * R / 1000, eraK: 0.5, sig0: 0.35, sig1: 0.05 },
    mp: { key: 'mp', name: 'multi-purpose', label: 'M830A1 class multi-purpose', kind: 'heat', v: 1140, pen: () => 500, eraK: 1, sig0: 0.40, sig1: 0.10 },
  };
  const VALUE = [1, 0.75, 0.35];   /* what the gunner thinks a catastrophic, firepower and mobility kill are worth when choosing where to aim */
  const TURRET_RATE = 40;
  // 30 mm strikes on the M1: [key, what the log calls it, chance per AP burst on target, per HE burst]
  const STRIP = [['gps', 'gunner\'s primary sight', 0.05, 0.04], ['citv', 'commander\'s viewer', 0.05, 0.04], ['hkoi', 'HKOI weapon station', 0.08, 0.06], ['radar', 'HKOI radar', 0.05, 0.04],
    ['aps', 'Trophy launcher', 0.05, 0.03], ['lwr', 'laser warner', 0.04, 0.04], ['radio', 'radio aerials', 0.06, 0.08], ['track', 'track', 0.03, 0.01]];

  // Forces the setup screen can offer. commander: 'auto' gives the group a commander (src/battle/enemycdr.js).
  const FORCES = {
    mech_ambush: { name: 'Mechanised ambush', note: 'Two Kornet teams with light trucks, a BMP-2 and two rocket teams.', commander: 'auto',
      force: [{ type: 'kornet', n: 2, ride: 'uaz' }, { type: 'bmp2', n: 1 }, { type: 'rpg', n: 2 }] },
    armoured_counter: { name: 'Armoured counter-attack', note: 'A T-90M leading two T-72B3, two BMP-2 and a Konkurs team.', commander: 'auto',
      force: [{ type: 't90', n: 1 }, { type: 't72', n: 2 }, { type: 'bmp2', n: 2 }, { type: 'saclos', n: 1 }] },
    sprawling_defence: { name: 'Sprawling defence', note: 'Nine teams under one commander, three of them with trucks, and a BMP-2.', commander: 'auto',
      force: [{ type: 'kornet', n: 2, ride: 'uaz' }, { type: 'kornet', n: 1 }, { type: 'saclos', n: 1, ride: 'uaz' }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 3 }, { type: 'bmp2', n: 1 }] },
  };

  let HK = null, TEAMS = null, SKILL = null, PACK = null;

  // ---- geometry of a shot at a vehicle: what shows, how likely the round is to land on each zone, and whether it would go through ----
  function protection(z, rd) { return rd.kind === 'ke' ? z.ke + (z.era ? z.era[0] * rd.eraK : 0) : z.heat + (z.era ? z.era[1] : 0); }
  // the zones a firer sees: aspH / aspT = how far round from the nose of the hull / the turret front the firer stands (0 = dead ahead of it)
  function zonesSeen(kind, aspH, aspT, hullDown) {
    const out = [];
    for (const z of ZONES[kind]) {
      if (hullDown && z.low) continue;
      const a = (z.on === 'turret' ? aspT : aspH) * DEG, c = Math.cos(a), s = Math.abs(Math.sin(a));
      const area = z.A[0] * Math.max(c, 0) + z.A[1] * s + z.A[2] * Math.max(-c, 0);
      if (area > 0.08) out.push({ z, area });
    }
    return out;
  }
  function sigmaMrad(rd, R) { return rd.sig0 + rd.sig1 * R / 1000; }
  // the table the gunner works from: for each zone in view, the chance of landing on it if he aims there, the chance the round goes
  // through, and what he expects to get from aiming there (a round that misses the zone may still strike a neighbour)
  function aimTable(kind, rd, R, sMetres, aspH, aspT, hullDown) {
    const seen = zonesSeen(kind, aspH, aspT, hullDown), pen = rd.pen(R), k = 2 * Math.PI * sMetres * sMetres;
    let total = 0; for (const q of seen) total += q.area;
    const pVeh = 1 - Math.exp(-total / k);
    for (const q of seen) {
      q.prot = protection(q.z, rd); q.pThrough = clamp((1.1 * pen - q.prot) / (0.2 * pen), 0, 1);
      q.worth = q.pThrough * (q.z.fx[0] * VALUE[0] + q.z.fx[1] * VALUE[1] + q.z.fx[2] * VALUE[2]) + (1 - q.pThrough) * 0.04;
      q.pz = 1 - Math.exp(-q.area / k);
    }
    for (const q of seen) { let other = 0; if (total > q.area) for (const o of seen) if (o !== q) other += o.area / (total - q.area) * o.worth; q.ev = q.pz * q.worth + Math.max(0, pVeh - q.pz) * other; }
    seen.sort((a, b) => b.ev - a.ev);
    return { seen, pVeh, pen, total };
  }

  const methods = {
    // ================================================================ setting up
    _vx() {
      if (!this._vxs) this._vxs = { rng: new HK.RNG(HK.seedFor(this.seed, 9002)), locQ: [], loadedType: 'mp', wasLoaded: true, fired: false, scanAt: 0, mgUntil: 0,
        stat: { shots: {}, bursts30: 0, bursts30On: 0, strips: {}, gunShots: { ap: 0, mp: 0 }, gunHits: 0, rides: [], m2AtVeh: 0, coax: 0 } };
      return this._vxs;
    },
    // called at the end of _place: give the teams that have one their truck, and put the armour on the ground
    _vehPlace(force, side) {
      this.vehs = this.vehs || [];
      const fresh = this.units.filter(u => !u._vSeen); for (const u of fresh) u._vSeen = true;
      if (!(this.wave > 0) && this.force0) force = this.force0;   /* the first wave's force as it was chosen: the copy handed to _place has lost the ride field. Later waves come without trucks. */
      const wants = force.some(f => f && (f.ride || (KINDS[f.type] && KINDS[f.type].armed)));
      if (this._cdrWanted && this._cdrWanted(force)) this._vx();
      if (wants) {
        const X = this._vx(), W = this.world, T = this.tank, r = X.rng, O = this.objective;
        const anchor = O && side == null ? { e: (T.e + O.e) / 2, n: (T.n + O.n) / 2 } : { e: T.e, n: T.n };
        const cdrOn = this._cdrWanted ? this._cdrWanted(force) : false;
        const taken = this.units.filter(u => u.alive && !u.gone).map(u => ({ e: u.e, n: u.n })).concat(this.vehs.filter(v => v.alive).map(v => ({ e: v.e, n: v.n })));
        const apart = (s, d) => taken.every(q => Math.hypot(q.e - s.e, q.n - s.n) > d);
        const inSide = s => side == null || Math.abs(angDiff(brgOf(T.e, T.n, s.e, s.n), side)) < 75;
        const claimed = new Set();
        for (const f of force) {
          if (!f) continue;
          if (f.ride === 'uaz' && TEAMS[f.type]) {
            let n = 0;
            for (const u of fresh) {
              if (n >= (f.n || 1)) break; if (u.type !== f.type || claimed.has(u)) continue; claimed.add(u); n++;
              // the truck stands close behind the team, out of the tank's view where the ground allows
              let best = null;
              for (let q = 0; q < 14; q++) {
                const a = r.random() * 6.283, d = 40 + r.random() * 120, e = u.e + Math.sin(a) * d, nn = u.n + Math.cos(a) * d;
                if (!W.inside(e, nn) || !W.passable(e, nn, true)) continue;
                const hid = !W.los(T.e, T.n, 2.6, e, nn, 1.6).clear, veg = W.veg(e, nn).cls, s = (hid ? 2 : 0) + (veg >= 3 && veg <= 5 ? 1 : 0) - d / 200;
                if (!best || s > best.s) best = { e, n: nn, s };
              }
              if (!best) best = { e: u.e, n: u.n };
              const v = this._vehNew('uaz', best.e, best.n, brgOf(best.e, best.n, u.e, u.n));
              v.team = u; u.rideVeh = v; u.rideId = v.id; u.mounted = false;
            }
            continue;
          }
          const K = KINDS[f.type]; if (!K || !K.armed) continue;
          for (let k = 0; k < (f.n || 1); k++) {
            const reserve = cdrOn && isTank({ kind: f.type });   /* with a commander the tanks wait out of sight until he commits them */
            let pick = null;
            if (!reserve) {
              const sites = W.ambushSites(anchor.e, anchor.n, { rmin: K.lo, rmax: K.hi + 400, agl: K.agl, salt: this.seed * 17 + this.vehs.length * 3 + 5 }).filter(s => W.passable(s.e, s.n, true) && inSide(s) && Math.hypot(s.e - T.e, s.n - T.n) >= K.lo * 0.8);
              pick = sites.find(s => apart(s, 250)) || sites.find(s => apart(s, 120)) || null;
            }
            if (!pick) {
              for (let q = 0; q < 300 && !pick; q++) {
                const a = side == null ? r.random() * 360 : side + (r.random() - 0.5) * 140, d = (reserve ? 1100 : K.lo) + r.random() * (reserve ? 900 : K.hi - K.lo + 600);
                const e = anchor.e + Math.sin(a * DEG) * d, nn = anchor.n + Math.cos(a * DEG) * d;
                if (!W.inside(e, nn) || !W.passable(e, nn, true) || !apart({ e, n: nn }, 100) || Math.hypot(e - T.e, nn - T.n) < K.lo * 0.8) continue;
                if (W.los(T.e, T.n, 2.6, e, nn, K.agl).clear) continue;
                if (q < 200 && reserve && k > 0 && this._vReserveAt && Math.hypot(e - this._vReserveAt.e, nn - this._vReserveAt.n) > 400) continue;   /* the tanks of a platoon wait together */
                pick = { e, n: nn };
              }
            }
            if (!pick) continue;
            taken.push(pick); if (reserve && !this._vReserveAt) this._vReserveAt = { e: pick.e, n: pick.n };
            const v = this._vehNew(f.type, pick.e, pick.n, brgOf(pick.e, pick.n, anchor.e, anchor.n)); v.reserve = reserve;
          }
        }
        this._vReserveAt = null;
        const nv = this.vehs.filter(v => v.wave === (this.wave || 0)).length;
        if (nv) this.say(this.t, 'setup', null, `The enemy group has ${nv} vehicle${nv === 1 ? '' : 's'}: ${this.vehs.filter(v => v.wave === (this.wave || 0)).map(v => v.K.name).join(', ')}.`);
      }
      if (this._cdrInit) this._cdrInit(force, side);
    },
    _vehNew(kind, e, n, hull) {
      const K = KINDS[kind], S = SKILL[this.skill];
      const v = { id: 100 + this.vehs.length, veh: true, kind, K, spec: K.spec, type: kind, e, n, hull, tur: hull, spd: 0, state: 'hidden', since: this.t, alive: true, gone: false,
        ammo: K.armed ? (K.msl || K.rounds) + 1 : 0, fired: 0, firedSeen: 0, readyAt: 0, sight: 0, hasShot: false, known: false, kv: null, wave: this.wave || 0, suppressedUntil: 0,
        mobile: true, canFire: !!K.armed, burning: false, abandoned: false, route: null, routeI: 0, lastShot: null, damage: null, hitAt: -1e9, shotsHere: 0, lastSeen: null, lastShotT: 0,
        msl: K.msl || 0, ap: K.apBursts || 0, he: K.heBursts || 0, cannonAt: 0, coaxAt: 0, losAt: 0, sees: false, lookAt: 0, order: null, reserve: false, stat: { gun: 0, gunHit: 0, msl: 0, bursts: 0, moved: 0, killed: null } };
      if (K.armed && !K.msl) v.ammo = K.rounds;
      void S; this.vehs.push(v); return v;
    },
    // armed vehicles as the battle layer's morale rule counts them: a tank weighs as three teams and a BMP as two in the group's
    // sense of its own strength (so the loss of two BMPs does not send an untouched tank platoon home)
    _vehMorale() { const out = []; if (this.vehs) for (const v of this.vehs) if (v.K.armed && v.wave === this.wave) for (let k = 0; k < v.K.weight; k++) out.push(v); return out; },

    // ================================================================ one step
    _vehStep(dt) {
      if (!this._vxs) return;
      const X = this._vxs, T = this.tank;
      // launches by a vehicle that the tank crew places from the flash or the radar track: keep them off the list of located TEAMS
      if (this._locQ && this._locQ.length && this._locQ.some(q => q.u.veh)) { for (const q of this._locQ) if (q.u.veh) X.locQ.push({ t: q.t, v: q.u, how: q.how }); this._locQ = this._locQ.filter(q => !q.u.veh); }
      if (X.locQ.length) X.locQ = X.locQ.filter(q => { if (this.t < q.t) return true; this._vehLocate(q.v, q.how); return false; });
      this._vehAmmoTick(dt);
      for (const v of this.vehs) this._veh(v, dt);
      if (this.t >= X.scanAt) { X.scanAt = this.t + 1; this._vehScan(); }
      if (T.alive) this._vehMg();
      if (this._cdrStep) this._cdrStep(dt);
    },
    _vehLocate(v, how) {
      const T = this.tank; if (!v.alive || v.gone || v.known) return;
      v.known = true; v.kv = { e: v.e, n: v.n, t: this.t }; this.ev(this.t, 'veh_located', { vid: v.id });
      this.say(this.t, 'tank', 'CDR', `${v.K.name} #${v.id + 1} located at ${km(Math.hypot(v.e - T.e, v.n - T.n))}.`, how);
    },
    // how far a vehicle's crew can pick the tank out in this light and weather
    _vehSight(v) { const s = v.K.sight; return (this.cond === 'night' ? s.night : s.day) * (SEEING[this.cond] || 1); },
    _veh(v, dt) {
      if (!v.alive) { v.spd = 0; return; }
      const W = this.world, T = this.tank, S = SKILL[this.skill], K = v.K, X = this._vxs;
      // keep the count the battle layer reads in step with what is really left
      if (v.kind === 'bmp2') { const d = v.fired - v.firedSeen; if (d > 0) { v.msl = Math.max(0, v.msl - d); v.firedSeen = v.fired; v.stat.msl += d; } v.ammo = v.canFire ? v.msl + (v.ap + v.he > 0 ? 1 : 0) : 0; if (v.state === 'spent' && v.ammo > 0) v.state = 'hidden'; }
      else if (K.armed) { const d = v.fired - v.firedSeen; if (d > 0) { v.firedSeen = v.fired; v.stat.gun += d; } if (!v.canFire) v.ammo = 0; }
      if (K.armed && v._inVolley && v.state !== 'guiding' && v.state !== 'firing') {   /* its shot has been resolved: reload from the moment it fired, and re-lay on the same target in half the time */
        v._inVolley = false; v.readyAt = Math.max(this.t, (v.lastShotT || this.t) + v.spec.reload); if (v.sees) v.sight = v.spec.aim * S.aim * 0.5; }
      if (v.state === 'guiding' || v.state === 'firing') { v._inVolley = true; v.spd = 0; return; }
      // pulled out of the fight (morale, the commander's order, or nothing left to fire): drive away
      if (K.armed && !v.gone && v.ammo <= 0 && v.state !== 'moving') { if (v.spentAt == null) v.spentAt = this.t; if (this.t - v.spentAt > 10) { v.gone = true; this.say(this.t, 'enemy', v.id, `${K.name} #${v.id + 1} ${v.canFire ? 'has nothing left to fire' : 'cannot fire'} and pulls back.`, 'no use staying'); } }
      if (v.gone && !v.leaving) { v.leaving = true; v.hasShot = false; if (v.mobile) { const a = brgOf(T.e, T.n, v.e, v.n) * DEG; this._vehGo(v, { e: clamp(v.e + Math.sin(a) * 1500, -W.half + 50, W.half - 50), n: clamp(v.n + Math.cos(a) * 1500, -W.half + 50, W.half - 50) }, 'pulling out', true); } }
      if (v.state === 'moving') { this._vehMove(v, dt); return; }
      v.spd = 0; if (v.gone || !K.armed) return;
      // in position: can the crew see the tank?
      const R = Math.hypot(T.e - v.e, T.n - v.n);
      if (this.t >= v.losAt) { v.losAt = this.t + 0.5; v.sees = T.alive && R <= this._vehSight(v) && W.los(v.e, v.n, K.agl, T.e, T.n, 2.2).clear; }
      if (v.sees) { v.lastSeen = this.t; const B = this.belief || (this.belief = {}); B.e = T.e; B.n = T.n; B.t = this.t;
        const want = brgOf(v.e, v.n, T.e, T.n), d = angDiff(want, v.tur); v.tur = (v.tur + clamp(d, -K.turret * dt, K.turret * dt) + 360) % 360; v.onTarget = Math.abs(d) < 2;
        if (v.mobile) { const dh = angDiff(want, v.hull); if (Math.abs(dh) > 3) v.hull = (v.hull + clamp(dh, -K.turn * 0.5 * dt, K.turn * 0.5 * dt) + 360) % 360; } }   /* halted with the tank in sight, it turns its front to it */
      else v.onTarget = false;
      const stunned = this.t < v.suppressedUntil;
      v.sight = v.sees && !stunned ? v.sight + dt : 0;
      const laid = v.sees && v.onTarget && v.canFire && !stunned && !v.reserve;
      if (isTank(v)) {
        v.hasShot = laid && v.ammo > 0 && R >= v.spec.rmin && R <= v.spec.rmax && this.t >= v.readyAt && v.sight >= v.spec.aim * S.aim;
        // coax: only worth firing at a man standing in a hatch
        const A = T.ai; if (laid && this.opened && R <= 800 && A && A.ldr && A.ldr.up && A.ldr.ok && this.t >= v.coaxAt) { v.coaxAt = this.t + 4; X.stat.coax++; v.lastShot = { t: this.t, weapon: 'coax', at: [T.e, T.n], dur: 2, hit: null }; this.ev(this.t, 'veh_shot', { vid: v.id, weapon: 'coax', at: [Math.round(T.e), Math.round(T.n)], dur: 2, hit: null }); if (X.rng.random() < 0.05) this._vehLoaderHit(v, 'coax fire from the tank'); }
      } else {
        v.hasShot = laid && v.msl > 0 && R >= Math.max(v.spec.rmin, 400) && R <= v.spec.rmax && this.t >= v.readyAt && v.sight >= v.spec.aim * S.aim;
        if (laid && this.opened && R <= K.cannonR && v.ap + v.he > 0 && this.t >= v.cannonAt && v.sight >= 2 && !this._pending) this._bmpBurst(v, R);
      }
      // no view of the tank for a while: move for one (on its own judgement, unless the commander is holding it back or has it under orders)
      if (!v.sees && v.mobile && !v.reserve && v.canFire && this.t >= v.lookAt && this.t - Math.max(v.lastSeen || 0, v.since) > S.lost + 5) {
        v.lookAt = this.t + 15; const B = this.belief; if (B && (this.opened || this.pressing)) this._vehSeek(v, B, 'no view of the vehicle from here', { advance: true }); }
    },
    // drive along the route. Speed by the ground under the wheels or tracks.
    _vehMove(v, dt) {
      const W = this.world, K = v.K;
      if (!v.mobile) { v.state = 'hidden'; v.spd = 0; v.route = null; return; }
      const wp = v.route && v.route[v.routeI]; if (!wp) { v.state = 'hidden'; v.since = this.t; v.spd = 0; v.route = null; v.losAt = 0; return; }
      const dx = wp[0] - v.e, dn = wp[1] - v.n, d = Math.hypot(dx, dn), last = v.routeI >= v.route.length - 1;
      if (d < (last ? 3 : 14)) { if (last) { v.state = 'hidden'; v.since = this.t; v.spd = 0; v.route = null; v.losAt = 0; v.sight = 0; v.shotsHere = 0; if (v.leaving) v.offMap = true; return; } v.routeI++; return; }
      const veg = W.veg(v.e, v.n).cls, vmax0 = veg === 7 ? K.road : (veg >= 3 && veg <= 6) || W.slope(v.e, v.n) > 0.2 ? K.rough : K.cross;
      const want = brgOf(v.e, v.n, wp[0], wp[1]), dh = angDiff(want, v.hull); v.hull = (v.hull + clamp(dh, -K.turn * dt, K.turn * dt) + 360) % 360;
      const vmax = Math.abs(dh) > 50 ? 1.5 : Math.min(vmax0, last ? 1 + d * 0.5 : 99);
      // armour moving up to engage halts as soon as it has the tank in sight inside its weapon's reach
      if (v.haltOnSight && K.armed && v.canFire && !v.gone && this.t >= v.losAt) { v.losAt = this.t + 1; const T = this.tank, R = Math.hypot(T.e - v.e, T.n - v.n);
        if (T.alive && R <= Math.min(this._vehSight(v), K.hi + 300) && R >= K.lo * 0.4 && W.los(v.e, v.n, K.agl, T.e, T.n, 2.2).clear) { v.state = 'hidden'; v.since = this.t; v.route = null; v.haltOnSight = false; v.sight = 0; v.shotsHere = 0; v.losAt = 0; this.say(this.t, 'enemy', v.id, `${K.name} #${v.id + 1} halts: it has the vehicle in sight at ${km(R)}.`, 'fires from the halt'); return; } }
      v.spd += clamp(vmax - v.spd, -4 * dt, 2 * dt); v.e += Math.sin(v.hull * DEG) * v.spd * dt; v.n += Math.cos(v.hull * DEG) * v.spd * dt; v.stat.moved += v.spd * dt;
      if (K.armed) { const dt2 = angDiff(v.hull, v.tur); v.tur = (v.tur + clamp(dt2, -K.turret * dt, K.turret * dt) + 360) % 360; } else v.tur = v.hull;
    },
    // send a vehicle to a place by a route that keeps to roads and out of the believed view of the tank where it can
    _vehGo(v, to, why, direct) {
      const W = this.world, B = this.belief || this.tank, memo = new Map();
      const cost = (e, n) => { const key = Math.round(e / 120) * 100003 + Math.round(n / 120); let x = memo.get(key); if (x == null) { x = Math.hypot(B.e - e, B.n - n) < 3500 && W.los(B.e, B.n, 2.6, e, n, v.K.agl).clear ? 1.5 : 0; memo.set(key, x); } return x; };
      const d = Math.hypot(to.e - v.e, to.n - v.n), route = direct || d < 160 ? null : W.path(v.e, v.n, to.e, to.n, { grid: 80, tank: true, cost });
      v.route = route && route.length > 1 ? route.slice(1) : [[to.e, to.n]]; v.routeI = 0; v.haltOnSight = false; v.state = 'moving'; v.since = this.t; v.hasShot = false; v.sight = 0; v.moveWhy = why;
      this.ev(this.t, 'veh_move', { vid: v.id, to: [Math.round(to.e), Math.round(to.n)] });
    },
    // look for ground near the vehicle with a sight line onto a place, hull-down if it can be had. A handful of samples, never a map-wide search.
    _vehSeek(v, B, why, opt) {
      const W = this.world, r = this._vxs.rng, K = v.K; opt = opt || {}; let best = null;
      const far = Math.hypot(B.e - v.e, B.n - v.n), lo = Math.max(150, opt.lo || K.lo * 0.6), hi = Math.max(lo + 200, opt.hi || K.hi), reach = opt.reach || 400, brg0 = brgOf(B.e, B.n, v.e, v.n);
      for (let q = 0; q < 30; q++) {
        let e, n;
        if (opt.local || q % 2) { const a = r.random() * 6.283, d = 60 + r.random() * reach; e = v.e + Math.sin(a) * d; n = v.n + Math.cos(a) * d; }
        else { const a = (brg0 + (r.random() - 0.5) * 110) * DEG, d = lo + r.random() * (Math.min(hi, Math.max(far, lo + 200)) - lo); e = B.e + Math.sin(a) * d; n = B.n + Math.cos(a) * d; }
        if (!W.inside(e, n) || !W.passable(e, n, true)) continue;
        const R = Math.hypot(B.e - e, B.n - n); if (R < lo || R > hi) continue;
        if (!W.los(e, n, K.agl, B.e, B.n, 2.2).clear) continue;
        const df = W.defilade(B.e, B.n, 2.4, e, n), veg = W.veg(e, n).cls;
        const s = (df === 'hull' ? 1.5 : 0) + (veg >= 3 && veg <= 5 ? 0.6 : 0) - Math.hypot(e - v.e, n - v.n) / 1500 + r.random() * 0.3;
        if (!best || s > best.s) best = { e, n, s, df };
      }
      if (!best && opt.advance && far > lo + 150) {   /* nothing found from the map: drive toward the place and halt when the vehicle comes into view */
        const f = (far - (lo + hi) / 2) / far, e = v.e + (B.e - v.e) * Math.max(0.15, f), n = v.n + (B.n - v.n) * Math.max(0.15, f);
        if (W.inside(e, n) && W.passable(e, n, true)) { this._vehGo(v, { e, n }, why); v.haltOnSight = true; this.say(this.t, 'enemy', v.id, `${K.name} #${v.id + 1} advances toward where the vehicle is reported, to fire from the halt when it comes into view.`, why); return true; }
      }
      if (!best) return false;
      this._vehGo(v, best, why); v.haltOnSight = !opt.local;
      this.say(this.t, 'enemy', v.id, `${K.name} #${v.id + 1} moves ${km(Math.hypot(best.e - v.e, best.n - v.n))} to a ${best.df === 'hull' ? 'hull-down ' : ''}position that looks onto the vehicle.`, why);
      return true;
    },
    // the battle layer's "displace" for a vehicle or for a team that owns a truck. Returns null to let the ordinary rule decide.
    _vehDisplaceHook(u, why, text, cand) {
      if (u.veh) {
        const S = SKILL[this.skill]; if (!u.alive || u.gone || !u.mobile || u.state === 'moving' || S.adapt < 1) return false;
        if (/gave the position away|nerves/.test(why || '') && u.shotsHere < 3) return false;   /* armour does not run after one shot */
        return this._vehSeek(u, this.belief || this.tank, why, { local: true, reach: 220, lo: Math.min(u.K.lo * 0.6, Math.hypot(this.tank.e - u.e, this.tank.n - u.n) - 250), hi: 4000 });
      }
      if (cand || u.ride || !u.rideVeh) return null;
      if (/gun turning|landed beside|gave the position away|nerves|two shots|pinned/.test(why || '')) return null;   /* a quick shift to an alternate is done on foot */
      return this._rideDisplace(u, why) ? true : null;
    },

    // ================================================================ transport: a team and its truck
    // Find a firing point kilometres away and the way there: pack up, walk to the truck, load, drive, dismount short, carry the weapon
    // the last stretch, set up. B is where the tank is believed to be (the radio net's belief, or the commander's picture).
    _rideDisplace(u, why, opt) {
      opt = opt || {}; const v = u.rideVeh, W = this.world, T = this.tank, sp = u.spec, r = this._vx().rng, B = opt.B || this.belief || T;
      if (!v || !v.alive || !v.mobile || u.ride || !u.alive || u.gone || u.ammo <= 0 || u.state === 'guiding' || u.state === 'firing') return false;
      if (Math.hypot(v.e - u.e, v.n - u.n) > WALK_BACK) return false;
      if (!opt.force) {   /* one of its own prepared positions already looks onto that place: a short move on foot will do */
        for (let j = 0; j < u.sites.length; j++) { if (j === u.site) continue; const c = u.sites[j], R = Math.hypot(B.e - c.e, B.n - c.n); if (R >= sp.rmin && R <= sp.rmax && W.los(c.e, c.n, sp.agl, B.e, B.n, 2.2).clear) return false; } }
      const lo = sp.rmin >= 1000 ? sp.rmin * 1.03 : Math.max(sp.rmin * 1.2, 600), hi = Math.min(sp.rmax * 0.85, 3800), brg0 = opt.brg != null ? opt.brg : brgOf(B.e, B.n, u.e, u.n), spread = opt.brg != null ? 25 : 70;
      const located = T.known.filter(k => !k.done || this.t - k.t < 120); let best = null;
      for (let q = 0; q < 22; q++) {
        const a = (brg0 + (r.random() - 0.5) * 2 * spread) * DEG, d = lo + r.random() * (hi - lo), e = B.e + Math.sin(a) * d, n = B.n + Math.cos(a) * d, dMe = Math.hypot(e - u.e, n - u.n);
        if (!W.inside(e, n) || !W.passable(e, n, false) || dMe < 300 || dMe > 4500) continue;
        if (!W.los(e, n, sp.agl, B.e, B.n, 2.2).clear) continue;
        const veg = W.veg(e, n).cls, hot = located.length ? Math.min(...located.map(k => Math.hypot(k.e - e, k.n - n))) : 1e9;
        const s = (veg >= 3 && veg <= 5 ? 1 : veg === 2 ? 0.5 : 0) + (hot > 150 ? 1 : -2) - dMe / 2500 + r.random() * 0.3;
        if (!best || s > best.s) best = { e, n, s, dMe };
      }
      if (!best) return false;
      // where the truck stops: behind the firing point, hidden from where the tank is believed to be
      let dp = null;
      for (let q = 0; q < 12; q++) {
        const a = (brgOf(B.e, B.n, best.e, best.n) + (r.random() - 0.5) * 120) * DEG, d = 80 + r.random() * 180, e = best.e + Math.sin(a) * d, n = best.n + Math.cos(a) * d;
        if (!W.inside(e, n) || !W.passable(e, n, true)) continue;
        const hid = !W.los(B.e, B.n, 2.6, e, n, 1.6).clear, veg = W.veg(e, n).cls, s = (hid ? 2 : 0) + (veg >= 3 && veg <= 5 ? 1 : 0) - d / 300;
        if (!dp || s > dp.s) dp = { e, n, s };
      }
      if (!dp) { if (!W.passable(best.e, best.n, true)) return false; dp = { e: best.e, n: best.n }; }
      u.ride = { phase: 'pack', until: this.t + (PACK[sp.key] || 8), fp: { e: best.e, n: best.n }, dp, from: { e: u.e, n: u.n }, t0: this.t, why, ordered: !!opt.ordered, flank: opt.flank || null };
      u.state = 'moving'; u.since = this.t; u.packUntil = u.ride.until + 1e6; u.down = false; u.moveWhy = why; u.shotsHere = 0; u.spd = 0; u.sight = 0; u.hasShot = false; u.route = null; u.watching = false;
      this.ev(this.t, 'move', { uid: u.id, to: [Math.round(best.e), Math.round(best.n)], ride: v.id });
      this.say(this.t, 'enemy', u.id, `${sp.name} #${u.id + 1} packs up to move ${km(best.dMe)} by ${v.K.name} to ground that looks onto the vehicle${opt.flank ? ' from the ' + opt.flank : ''}.`, why);
      return true;
    },
    // a team that is using its truck: the stages of the move. Returns true while this code has the team.
    _rideUnit(u, dt) {
      const R = u.ride; if (!R) return false;
      const v = u.rideVeh, W = this.world, T = this.tank, sp = u.spec, X = this._vxs;
      const walkOn = why => {   /* the rest of the way on foot, by the ordinary rules */
        u.ride = null; u.mounted = false; const d = Math.hypot(R.fp.e - u.e, R.fp.n - u.n);
        if (d > 900) { u.state = 'setup'; u.since = this.t; u.packUntil = 0; u.setupK = 1; this.say(this.t, 'enemy', u.id, `${sp.name} #${u.id + 1} is left on foot ${km(d)} short of its new position and sets up where it stands.`, why); return true; }
        const route = W.path(u.e, u.n, R.fp.e, R.fp.n, { grid: 30, tank: false });
        u.sites.push({ e: R.fp.e, n: R.fp.n }); u.site = u.sites.length - 1; u.route = route && route.length > 1 ? route.slice(1) : null; u.routeI = 0; u.state = 'moving'; u.packUntil = 0; u.setupK = 1; u.seek = true; u.since = this.t - (PACK[sp.key] || 8) - 7;
        return true;
      };
      if (!v || !v.alive || (!v.mobile && R.phase !== 'unload')) { if (u.alive) { u.rideVeh = v && v.alive ? v : null; if (!u.rideVeh) u.rideId = null; return walkOn('its vehicle is lost'); } return true; }
      if (R.phase === 'pack') { u.spd = 0; if (this.t >= R.until) R.phase = 'toVeh'; return true; }
      if (R.phase === 'toVeh') {
        const dx = v.e - u.e, dn = v.n - u.n, d = Math.hypot(dx, dn);
        if (d < 5) { R.phase = 'load'; R.until = this.t + LOAD_S; u.spd = 0; return true; }
        const Rt = Math.hypot(T.e - u.e, T.n - u.n), cover = W.veg(u.e, u.n).cls >= 2;
        if (this.t >= (R.losAt || 0)) { R.losAt = this.t + 0.5; u.inView = T.alive && Rt < 2500 && W.los(T.e, T.n, 2.6, u.e, u.n, 1.2).clear; }
        u.gait = u.inView && !cover ? 'run' : 'walk'; u.spd = sp.move * (u.gait === 'run' ? 1.6 : 1); u.hdg = brgOf(u.e, u.n, v.e, v.n); u.e += dx / d * u.spd * dt; u.n += dn / d * u.spd * dt;
        if (u.inView && !u.known && X.rng.random() < (cover ? 0.05 : 0.3) * Math.exp(-Rt / 800) * dt) { u.known = true; T.known.push({ id: u.id, e: u.e, n: u.n, t: this.t }); this.say(this.t, 'tank', 'CDR', `Crew spots movement: ${sp.name} #${u.id + 1} making for a vehicle at ${km(Rt)}.`, 'a team in the vehicle\'s view while moving'); }
        if (u.known) { const k = T.known.find(q => q.id === u.id); if (k && u.inView) { k.e = u.e; k.n = u.n; k.t = this.t; } }
        return true;
      }
      if (R.phase === 'load') {
        u.spd = 0; if (this.t < R.until) return true;
        u.mounted = true; u.e = v.e; u.n = v.n; R.phase = 'drive'; this.ev(this.t, 'mount', { uid: u.id, vid: v.id });
        { const k = T.known.find(q => q.id === u.id); if (k) k.done = true; u.known = false; }   /* the men are in the truck now: the truck is what there is to see */
        this._vehGo(v, R.dp, 'carrying ' + sp.name + ' #' + (u.id + 1));
        return true;
      }
      if (R.phase === 'drive') {
        u.e = v.e; u.n = v.n; u.spd = v.spd; u.hdg = v.hull;
        if (v.state !== 'moving') { R.phase = 'unload'; R.until = this.t + UNLOAD_S; }
        return true;
      }
      if (R.phase === 'unload') {
        u.e = v.e; u.n = v.n; u.spd = 0; if (this.t < R.until) return true;
        u.mounted = false; this.ev(this.t, 'dismount', { uid: u.id, vid: v.id });
        const moved = Math.hypot(u.e - R.from.e, u.n - R.from.n); X.stat.rides.push({ uid: u.id, m: Math.round(moved), s: Math.round(this.t - R.t0), ordered: R.ordered });
        this.say(this.t, 'enemy', u.id, `${sp.name} #${u.id + 1} dismounts ${km(Math.hypot(R.fp.e - u.e, R.fp.n - u.n))} short of its firing point and carries the weapon forward; the ${v.K.name} stays hidden behind.`, `${km(moved)} from its last position in ${Math.round(this.t - R.t0)} s`);
        return walkOn('');
      }
      return false;
    },
    _xIntent(u) {
      if (u.ride) { const R = u.ride, o = R.ordered ? `ordered to ${R.flank ? 'the ' + R.flank + ' flank' : 'new ground'} by the commander; ` : ''; return o + ({ pack: 'packing up to ride', toVeh: 'walking back to the vehicle', load: 'loading the vehicle', drive: 'riding', unload: 'dismounting' })[R.phase]; }
      if (u.cdrOrder && this._cdrIntent) return this._cdrIntent(u);
      return null;
    },

    // ================================================================ what the vehicles do to the tank
    // called by the battle layer's commander: vehicles that have a shot join the teams that are ready
    _vehReady(ready) {
      if (this.vehs) for (const v of this.vehs) if (v.alive && !v.gone && v.K.armed && v.state === 'hidden' && v.hasShot) { v._lead = 0; ready.push(v); }
      if (this._cdrGate) this._cdrGate(ready);
    },
    // called as an engagement is put together. A tank's round is a draw: a miss is settled here and now, a hit goes to the engine as its
    // `ke` threat (the engine has no way to make a `ke` round from a fixed launcher miss). Everything else passes through untouched.
    _vehVolley(teams) {
      if (!this._vxs || !teams.some(u => u.veh)) return teams;
      const X = this._vxs, T = this.tank, W = this.world, out = [];
      for (const u of teams) {
        if (!u.veh || !isTank(u)) { out.push(u); continue; }
        const R = Math.hypot(T.e - u.e, T.n - u.n), moving = (T.v || 0) > 1.5, df = W.defilade(u.e, u.n, u.K.agl, T.e, T.n);
        const p = clamp((0.75 - R / 6000 - (moving ? 0.15 : 0)) * (df === 'hull' ? 0.6 : 1) * (HITK[this.skill] || 1) * u.K.hitK * (u.sightsHit ? 0.5 : 1), 0.05, 0.92);
        X.stat.shots[u.kind] = (X.stat.shots[u.kind] || 0) + 1;
        this._vehFlash(u);
        if (X.rng.random() < p) { u.stat.gunHit++; u.lastShot = { t: this.t, weapon: '125mm', at: [T.e, T.n], dur: 0, hit: true }; out.push(u); continue; }
        u.shotsHere++; u.ammo--; u.fired++; u.lastShotT = this.t; u.readyAt = this.t + u.spec.reload; u.sight = u.spec.aim * SKILL[this.skill].aim * 0.5; u.hasShot = false;
        const tof = R / 1700; u.lastShot = { t: this.t, weapon: '125mm', at: [T.e, T.n], dur: 0, hit: false };
        this.ev(this.t, 'veh_shot', { vid: u.id, weapon: '125mm', at: [Math.round(T.e), Math.round(T.n)], dur: 0, hit: false });
        this.say(this.t + tof, 'enemy', u.id, `${u.K.name} #${u.id + 1} fires its main gun from ${km(R)}: the round cracks past, a miss.`, `about ${Math.round(p * 100)}% to hit ${moving ? 'a moving' : df === 'hull' ? 'a hull-down' : 'a halted'} vehicle at this range`);
        if (u.shotsHere >= 3) this._vehDisplaceHook(u, 'three rounds from one spot');
      }
      return out;
    },
    // a vehicle that fires shows itself: the tank crew places it from the flash if it has a line to it
    _vehFlash(v) { const T = this.tank, X = this._vxs; v.firedAt = this.t; if (!v.known && this.world.los(T.e, T.n, 2.6, v.e, v.n, v.K.agl).clear && X.rng.random() < 0.85) X.locQ.push({ t: this.t + 1, v, how: 'muzzle flash seen' }); },
    _vehLoaderHit(v, how) {
      const T = this.tank, A = T.ai, L = A && A.ldr; if (!L || !L.ok || !L.up) return;
      L.ok = false; L.up = false; if (L.upAt.length) L.upAt[L.upAt.length - 1][1] = this.t; this.ev(this.t, 'loader_hit', {}); this.ev(this.t, 'tank_damage', { what: 'loader', by: v.id }); if (T.st && T.st.crew) T.st.crew.ldr = 'wounded';
      this._vxs.stat.strips.loader = (this._vxs.stat.strips.loader || 0) + 1;
      this.say(this.t, 'tank', 'CDR', 'Loader hit while up in his hatch. The commander will have to load.', `${how}; the main gun now takes much longer to load and the M240 is silent`);
    },
    // one burst of 30 mm at the tank. It cannot get through the armour; what it can do is strip what is bolted to the outside.
    _bmpBurst(v, R) {
      const T = this.tank, X = this._vxs, W = this.world, ap = v.ap > 0 && (R <= 1500 || v.he <= 0); if (ap) v.ap--; else v.he--;
      v.cannonAt = this.t + 4; v.lastShotT = this.t; v.stat.bursts++; X.stat.bursts30++; this._vehFlash(v);
      const df = W.defilade(v.e, v.n, v.K.agl, T.e, T.n), moving = (T.v || 0) > 1.5;
      const p = clamp((0.85 - R / 2500) * (df === 'hull' ? 0.6 : 1) * (moving ? 0.7 : 1) * (HITK[this.skill] || 1), 0.08, 0.9), on = X.rng.random() < p;
      v.lastShot = { t: this.t, weapon: '30mm', at: [T.e, T.n], dur: 1.5, hit: on }; this.ev(this.t, 'veh_shot', { vid: v.id, weapon: '30mm', at: [Math.round(T.e), Math.round(T.n)], dur: 1.5, hit: on });
      if (!v.saidCannon) { v.saidCannon = true; this.say(this.t, 'enemy', v.id, `${v.K.name} #${v.id + 1} opens up with its 30 mm cannon from ${km(R)}.`, 'it cannot get through the tank\'s armour: it is shooting off sights, aerials and the weapon stations'); }
      if (!on) return;
      X.stat.bursts30On++; const st = T.st, sys = st.sys, rel = angDiff(brgOf(T.e, T.n, v.e, v.n), T.h), side = rel > 0 ? 'R' : 'L';
      for (const [key, label, pa, ph] of STRIP) {
        if (key === 'track' && df === 'hull') continue;
        if (X.rng.random() >= (ap ? pa : ph)) continue;
        let what = key, text;
        if (key === 'aps') { const f = side === 'R' ? 'apsR' : 'apsL'; if (!st[f]) continue; st[f] = 0; what = 'aps_' + side; text = `Trophy launcher on the ${side === 'R' ? 'right' : 'left'} side knocked out: its rounds are lost.`; }
        else { if (sys[key] === 'destroyed') continue; sys[key] = sys[key] === 'damaged' ? 'destroyed' : 'damaged'; text = `${label[0].toUpperCase() + label.slice(1)} ${sys[key]} by 30 mm fire.`; }
        X.stat.strips[what] = (X.stat.strips[what] || 0) + 1; this.ev(this.t + 0.8, 'tank_damage', { what, by: v.id });
        this.say(this.t + 0.8, 'tank', 'CDR', text, `${v.K.name} #${v.id + 1}, ${ap ? 'armour-piercing' : 'high-explosive'} burst from ${km(R)}; about ${Math.round((ap ? pa : ph) * 100)}% per burst on target`);
      }
      if (X.rng.random() < (ap ? 0.25 : 0.35)) this._vehLoaderHit(v, '30 mm fire on the turret');
    },

    // ================================================================ what the tank does to the vehicles
    // thermal scan for vehicles (once a second), and keeping track of the ones already found
    _vehScan() {
      const T = this.tank, W = this.world, X = this._vxs; if (!T.alive) return;
      const see = (SEEING[this.cond] || 1) * ((T.v || 0) > 1.5 ? 0.5 : 1) * (T.st.sys.citv === 'destroyed' ? 0.6 : 1);
      for (const v of this.vehs) {
        if (!v.alive || v.offMap) continue;
        const R = Math.hypot(v.e - T.e, v.n - T.n); if (R > 5000) continue;
        const los = W.los(T.e, T.n, 2.6, v.e, v.n, v.K.agl * 0.7).clear; v.inView = los;
        if (v.known) { if (los) { v.kv = { e: v.e, n: v.n, t: this.t }; } continue; }
        if (!los) continue;
        const veg = W.veg(v.e, v.n).cls, cover = veg === 4 ? 0.3 : veg >= 2 && veg <= 6 ? 0.5 : 1, moving = v.state === 'moving' && v.spd > 0.5, hot = this.t - (v.firedAt || -1e9) < 6;
        const sig = (!v.K.armed && !moving && this.t - v.since > 120 ? v.K.sigCold : v.K.sig) * (v.stat.moved < 1 && !v.firedAt ? 0.25 : 1);   /* lying in ambush, engine off, camouflaged: until it moves or fires */
        const p = Math.min(0.9, 0.03 * Math.exp(-R / 1500) * sig * cover * (moving ? 4 : 1) * (hot ? 5 : 1) * see * this._crewMul('scan_cdr'));
        if (X.rng.random() < p) this._vehLocate(v, `thermal scan: ${moving ? 'a vehicle moving' : 'a vehicle halted'} ${cover < 1 ? 'in cover' : 'in the open'}, about ${(p * 100).toFixed(0)}% a second`);
      }
    },
    // how dangerous a located vehicle is to the tank right now (teams run 1 to 4 on the same scale: see tankai.js _targets)
    _vehDanger(v) {
      if (isTank(v)) return v.canFire ? (v.sees ? 5 : 3.4) : 1.2;
      if (v.kind === 'bmp2') return !v.canFire ? 1.2 : v.state === 'guiding' ? 4.2 : this.t - (v.lastShotT || -1e9) < 6 && v.fired + v.stat.bursts > 0 ? 3.5 : v.sees ? 3.2 : 2.2;
      return v.state === 'moving' ? (v.team && v.team.mounted ? 1.8 : 1.5) : 0.8;
    },
    _vehWhy(v) { return isTank(v) ? (v.canFire ? (v.sees ? 'a tank laying on us' : 'an enemy tank') : 'a tank that cannot fire') : v.kind === 'bmp2' ? (v.state === 'guiding' ? 'its missile is in the air' : v.canFire ? 'its cannon is on us' : 'it cannot fire') : (v.team && v.team.mounted ? 'a truck carrying a missile team' : 'a truck'); },
    _vehTargets() {
      const T = this.tank, W = this.world, out = [];
      for (const v of this.vehs) {
        if (!v.alive || v.gone || !v.known || !v.kv || v.offMap) continue;
        if (!v.inView || this.t - v.kv.t > 3) continue;   /* a vehicle is engaged only while it is in view */
        const R = Math.hypot(v.e - T.e, v.n - T.n); if (R < 40 || R > 4000) continue;
        out.push({ v, R, danger: this._vehDanger(v) });
      }
      void W; out.sort((a, b) => b.danger - a.danger || a.R - b.R); return out;
    },
    // the loader and the kind of round. Runs every step; does nothing a battle without vehicles could notice.
    _vehAmmoTick(dt) {
      const T = this.tank, X = this._vxs, A = T.ai; if (!A || !this.vehs.length) return;
      if (X.wasLoaded && !T.loaded && !X.fired && X.loadedType === 'ap' && T.ap > 0) { T.ap--; T.main++; }   /* the gunner fired the sabot in the breech at a team: count the right round */
      X.fired = false;
      // the ordinary loading drill stops when the multi-purpose rounds are gone; sabot can still be loaded
      if (!T.loaded && T.main <= 0 && T.ap > 0 && !A.ldr.up) { T.loadT += dt * this._crewMul('load'); if (T.loadT >= (A.ldr.ok ? 6 : 14)) { T.loaded = true; T.loadT = 0; } }
      if (T.loaded && !X.wasLoaded) { const want = X.want === 'ap' && T.ap > 0 ? 'ap' : T.main > 0 ? 'mp' : T.ap > 0 ? 'ap' : 'mp'; X.loadedType = want; }
      X.wasLoaded = T.loaded;
    },
    // The gunner and a vehicle. Called from the gunner's drill before he looks at teams; returns true when a vehicle has the gun.
    _gunVeh(A) {
      if (!this._vxs || !this.vehs.length) return false;
      const T = this.tank, X = this._vxs, W = this.world, sys = T.st.sys;
      if (sys.gun === 'destroyed') { this._rf = null; X.rfv = null; A.w.main = 'main gun out of action'; return true; }
      const vt = this._vehTargets(); let pick = null;
      for (const q of vt) { if (q.v.kind === 'uaz' && ((q.R <= 914 && T.m2 > 0) || T.main <= 0)) continue; pick = q; break; }   /* a truck inside machine-gun reach is the .50's */
      if (pick) { const tg = this._targets(), bt = tg.find(q => q.los && q.R <= 4200 && q.R >= 60 && !(q.moving && q.R > 800)); if (bt && bt.danger >= pick.danger) pick = null; }
      if (pick && T.ap + T.main <= 0 && !T.loaded) pick = null;
      X.want = pick && isTank(pick.v) ? 'ap' : 'mp';
      if (!pick) { X.rfv = null; return false; }
      this._rf = null;
      const v = pick.v, R = pick.R, want = brgOf(T.e, T.n, v.e, v.n), rate = TURRET_RATE * (sys.tdrive === 'destroyed' ? 0.15 : sys.tdrive === 'damaged' ? 0.5 : 1), d = angDiff(want, T.tur);
      T.tur = (T.tur + clamp(d, -rate * this.dt, rate * this.dt) + 360) % 360;
      const why = this._vehWhy(v); A.w.main = `${v.K.name} #${v.id + 1}, ${(R / 1000).toFixed(2)} km: ${why}`;
      if (!X.rfv || X.rfv.v !== v) {
        const lay = (2.5 + R / 1000 * 1.3) * (sys.gps === 'destroyed' ? 2.2 : sys.gps === 'damaged' ? 1.5 : 1);
        X.rfv = { v, at: this.t + Math.abs(d) / rate + lay + this._crewAdd('lay', lay) };
        this.say(this.t, 'tank', 'GNR', `Gunner lays on ${v.K.name} #${v.id + 1}, ${(R / 1000).toFixed(2)} km, bearing ${Math.round(want).toString().padStart(3, '0')}: ${why}.`, 'the most dangerous thing in view');
        return true;
      }
      if (Math.abs(d) > 1.5 || !T.loaded || this.t < X.rfv.at) return true;
      if (this._gunFire(v, R) === false) A.w.main += ' (holding fire until the halt)';
      return true;
    },
    // one main gun round at a vehicle: choose the aim point from what shows, see where the round lands, and what it does there
    _gunFire(v, R) {
      const T = this.tank, X = this._vxs, W = this.world, sys = T.st.sys;
      let type = X.loadedType; if (type === 'ap' && T.ap <= 0) type = 'mp'; if (type === 'mp' && T.main <= 0) type = 'ap';
      const rd = ROUNDS[type], tof = R / rd.v, moving = (T.v || 0) > 1.5;
      const toMe = brgOf(v.e, v.n, T.e, T.n), aspH = Math.abs(angDiff(toMe, v.hull)), aspT = Math.abs(angDiff(toMe, v.K.armed ? v.tur : v.hull)), hullDown = W.defilade(T.e, T.n, 2.4, v.e, v.n) === 'hull';
      const cross = v.state === 'moving' ? Math.abs(Math.sin(angDiff(toMe, v.hull) * DEG)) * v.spd : 0;
      const sig = sigmaMrad(rd, R) * (moving ? 2.5 : 1) * (1 + Math.min(1, cross / 10)) / Math.max(0.2, this._crewMul('aim_main')) * (sys.gps === 'destroyed' ? 2.5 : sys.gps === 'damaged' ? 1.5 : 1) * (moving && sys.stab && sys.stab !== 'ok' ? 2 : 1);
      const s = sig * R / 1000, tab = aimTable(v.kind, rd, R, s, aspH, aspT, hullDown), aim = tab.seen[0];
      if (!aim) return false;
      if (moving && tab.pVeh < 0.3 && !(isTank(v) && v.sees)) return false;   /* on the move at this range the round would be thrown away: he waits for the halt (unless a tank is laying on him) */
      if (type === 'ap') T.ap--; else T.main--; T.loaded = false; T.loadT = 0; X.fired = true; X.wasLoaded = false; X.rfv = { v, at: this.t + 1.5 }; X.stat.gunShots[type]++;
      const name = `${v.K.name} #${v.id + 1}`, face = aspH < 20 ? 'front' : aspH > 160 ? 'rear' : aspH < 70 ? 'front quarter' : aspH > 110 ? 'rear quarter' : 'side';
      const head = `Gunner aims at the ${v.K.name}'s ${aim ? aim.z.label : 'outline'}, ${Math.round(R / 10) * 10} m, ${rd.name}`;
      const whyAim = aim ? `he sees its ${face}${hullDown ? ', hull-down' : ''}: about ${Math.round(aim.pz * 100)}% to land on the ${aim.z.label}, ${Math.round(tab.pVeh * 100)}% to hit the vehicle at all${moving ? ' (firing on the move)' : ''}` : 'nothing of it shows';
      this.shots = this.shots || [];
      let hitZone = null; const u = X.rng.random();
      if (aim && u < aim.pz) hitZone = aim;
      else if (aim && u < tab.pVeh && tab.seen.length > 1) { let w = X.rng.random() * (tab.total - aim.area); for (const o of tab.seen) { if (o === aim) continue; w -= o.area; if (w <= 0) { hitZone = o; break; } } if (!hitZone) hitZone = tab.seen[1]; }
      this.ev(this.t, 'gun', { vid: v.id, R: Math.round(R), tof: +tof.toFixed(2), hit: !!hitZone, round: type, zone: hitZone ? hitZone.z.key : null });
      const off = hitZone ? 0 : 1.5 + X.rng.random() * 3 * Math.max(1, s);
      this.shots.push({ t: this.t, tof, from: { e: T.e, n: T.n }, to: { e: v.e + (X.rng.random() - 0.5) * off * 2, n: v.n + (X.rng.random() - 0.5) * off * 2 }, hit: !!hitZone, there: true, vid: v.id });
      if (!hitZone) { this.say(this.t + tof, 'tank', 'GNR', `${head}: miss.`, whyAim); if (v.K.armed && X.rng.random() < SKILL[this.skill].notice) v.suppressedUntil = Math.max(v.suppressedUntil, this.t + tof + 1); return; }
      X.stat.gunHits++;
      const z = hitZone.z, pen = rd.pen(R) * (0.9 + 0.2 * X.rng.random()), prot = hitZone.prot, through = pen > prot;
      let effect = 'none';
      if (through) { const q = X.rng.random(); effect = q < z.fx[0] ? 'catastrophic' : q < z.fx[0] + z.fx[1] ? 'firepower' : q < z.fx[0] + z.fx[1] + z.fx[2] ? 'mobility' : 'none'; }
      else if (isTank(v) && X.rng.random() < 0.15) effect = 'firepower';
      const where = hitZone === aim ? 'hit' : `strikes the ${z.label} instead`;
      const armour = z.ke + z.heat > 0 ? `about ${Math.round(prot)} mm of protection there against about ${Math.round(pen)} mm` : 'nothing there to stop it';
      this._vehStruck(v, { zone: z.key, through, effect, by: 'main_' + type, aspect: Math.round(aspH), tof, head, where, armour, whyAim, name });
    },
    // a vehicle has been struck: apply it, say it, and let the crew react
    _vehStruck(v, h) {
      const X = this._vxs, S = SKILL[this.skill], t = this.t + (h.tof || 0); let effect = h.effect, tail;
      v.damage = { t: +t.toFixed(2), zone: h.zone, through: h.through, effect, by: h.by, aspect: h.aspect }; v.hitAt = t;
      if (effect === 'catastrophic') { v.alive = false; v.burning = true; v.state = 'dead'; v.canFire = false; v.mobile = false; v.ammo = 0; tail = v.kind === 'uaz' ? 'vehicle destroyed' : 'through, vehicle burning'; }
      else {
        if (effect === 'firepower') { v.canFire = false; v.hasShot = false; v.ammo = 0; }
        if (effect === 'mobility') { v.mobile = false; }
        if (effect === 'none' && !h.through && v.K.armed) v.sightsHit = v.sightsHit || X.rng.random() < 0.2;
        v.suppressedUntil = Math.max(v.suppressedUntil, t + 4 + (1 - S.nerve) * 10); v.sight = 0; v.hasShot = false;
        tail = !h.through ? (effect === 'firepower' ? 'no penetration, but its sights and gun are wrecked: it cannot fire' : 'no penetration: no effect') : effect === 'firepower' ? 'through: it cannot fire' : effect === 'mobility' ? (h.zone === 'track' ? 'track broken: it cannot move' : 'through: it cannot move') : 'through, but nothing vital struck';
        if (effect !== 'none') { const pOut = (1 - S.nerve) + (!v.canFire && !v.mobile ? 0.3 : 0) + (v.K.armed ? 0 : 0.6); if (X.rng.random() < pOut) { v.alive = false; v.abandoned = true; v.state = 'dead'; v.ammo = 0; v.canFire = false; tail += '; the crew bails out'; } }
      }
      v.stat.killed = v.alive ? v.stat.killed : { by: h.by, zone: h.zone, aspect: h.aspect, how: v.burning ? 'burning' : 'abandoned', t: +t.toFixed(1) };
      if (!v.stat.hits) v.stat.hits = []; v.stat.hits.push({ by: h.by, zone: h.zone, through: h.through, effect, aspect: h.aspect });
      this.ev(t, 'veh_hit', { vid: v.id, zone: h.zone, through: h.through, effect, by: h.by });
      if (!v.alive) this.ev(t, 'veh_lost', { vid: v.id, how: v.burning ? 'burning' : 'abandoned' });
      this.say(t, 'tank', 'GNR', `${h.head}: ${h.where}, ${tail}.`, `${h.whyAim}; ${h.armour}`);
      // the men riding in it
      if (v.team && v.team.alive && v.team.mounted && (effect !== 'none' || !v.alive)) {
        const u = v.team, pLost = h.by === 'm2' ? (v.burning ? 0.6 : 0.35) : 0.85;
        if (X.rng.random() < pLost) { u.alive = false; u.state = 'dead'; u.mounted = false; this.ev(t, 'team_lost', { uid: u.id, by: h.by === 'm2' ? 'm2' : 'main' }); this.say(t, 'tank', 'GNR', `${u.spec.name} #${u.id + 1} is lost with its vehicle.`, `riders in a ${v.K.name} struck by ${h.by === 'm2' ? '.50 fire' : 'a tank round'}: about ${Math.round(pLost * 100)}%`); if (h.by === 'm2') this.killedByMg = (this.killedByMg || 0) + 1; else this.killedByTank = (this.killedByTank || 0) + 1; }
        else { u.suppressedUntil = Math.max(u.suppressedUntil || 0, t + 20); if (!v.alive || !v.mobile) u.mounted = false; }   /* the survivors are out of it and pinned beside it */
      }
      if (v.alive && v.mobile && v.K.armed && effect !== 'catastrophic' && S.adapt >= 1 && v.state !== 'moving') {
        if (!v.canFire) { v.gone = true; this.say(t, 'enemy', v.id, `${h.name} cannot fire and pulls out.`, 'a vehicle that cannot shoot is only a target'); }
        else this._vehDisplaceHook(v, 'struck by a tank round: it will not sit there for the next');
      }
      if (this._cdrVehHit) this._cdrVehHit(v);
    },
    // the commander's .50 and a truck: a cheap kill inside machine-gun reach when nothing more dangerous needs the gun
    _vehMg() {
      const T = this.tank, X = this._vxs, A = T.ai; if (!A || this._pending || T.m2 <= 0 || this.t < A.crows.busyUntil || this._crewOut('crows')) return;
      let pick = null; for (const q of this._vehTargets()) if (q.v.kind === 'uaz' && q.R <= 914) { pick = q; break; }
      if (!pick) return;
      const tg = this._targets(); if (A.cfq.length || tg.some(q => q.los && q.R <= 914 && q.danger >= 3)) return;   /* a team that can fire on us comes first */
      const v = pick.v, R = pick.R, C = A.crows, want = brgOf(T.e, T.n, v.e, v.n), d = angDiff(want, C.brg);
      C.brg = (C.brg + clamp(d, -60 * this.dt, 60 * this.dt) + 360) % 360; C.tgt = v.id; A.w.m2 = `${v.K.name} #${v.id + 1}, ${Math.round(R / 10) * 10} m: ${this._vehWhy(v)}`;
      if (Math.abs(d) > 2) { C.busyUntil = this.t; return; }
      if (X.mgV !== v) { X.mgV = v; C.busyUntil = this.t + 1.5 + this._crewAdd('handover', 1.5); this.say(this.t, 'tank', 'CDR', `Commander's .50 swings onto ${v.K.name} #${v.id + 1} at ${Math.round(R / 10) * 10} m.`, 'a soft vehicle inside machine-gun reach: no main gun round needed'); return; }
      const moving = (T.v || 0) > 1.5, tm = v.state === 'moving' && v.spd > 1, p = Math.min(0.8, 0.7 * Math.exp(-R / 700)) * (tm ? 0.7 : 1) * (moving ? 0.6 : 1) * this._crewMul('aim_m2'), hit = X.rng.random() < p;
      T.m2 = Math.max(0, T.m2 - 24); C.busyUntil = this.t + 4; X.stat.m2AtVeh++;
      const rec = { t: this.t, dur: 3, id: v.id, vid: v.id, e: v.e, n: v.n, R, w: 'm2', coax: false, m2: true, m240: false, hit }; this._mg = rec; (this.mgs = this.mgs || []).push(rec);
      if (!hit) return;
      const q = X.rng.random(), effect = q < 0.25 ? 'catastrophic' : q < 0.85 ? 'mobility' : 'none', toMe = brgOf(v.e, v.n, T.e, T.n);
      this._vehStruck(v, { zone: 'body', through: true, effect, by: 'm2', aspect: Math.round(Math.abs(angDiff(toMe, v.hull))), tof: 3, head: `Commander's .50 on the ${v.K.name}, ${Math.round(R / 10) * 10} m`, where: 'hits', armour: 'a soft vehicle', whyAim: `about ${Math.round(p * 100)}% per burst at this range${tm ? ' against a moving truck' : ''}`, name: `${v.K.name} #${v.id + 1}` });
    },

    // ================================================================ for the display and the tests
    vehicles() {
      if (!this.vehs) return [];
      const T = this.tank, W = this.world, t = this.t;
      return this.vehs.map(v => ({
        id: v.id, kind: v.kind, name: v.K.name, e: v.e, n: v.n, hull: v.hull, turret: v.K.armed ? v.tur : v.hull, speed: v.spd,
        state: v.burning ? 'burning' : v.abandoned ? 'abandoned' : t - v.hitAt < 4 && t >= v.hitAt ? 'hit' : v.lastShot && t - v.lastShot.t < 1.5 && t >= v.lastShot.t ? 'firing' : v.state === 'guiding' || v.state === 'firing' ? 'firing' : v.state === 'moving' && v.spd > 0.2 ? 'moving' : 'parked',
        alive: v.alive, gone: !!v.gone, mobile: v.mobile, canFire: v.canFire, known: v.known, hullDown: v.alive && W.defilade(T.e, T.n, 2.4, v.e, v.n) === 'hull', wave: v.wave,
        riders: v.team ? [{ uid: v.team.id, mounted: !!v.team.mounted }] : [],
        lastShot: v.lastShot ? { t: v.lastShot.t, weapon: v.lastShot.weapon, at: [v.lastShot.at[0], v.lastShot.at[1]], dur: v.lastShot.dur, hit: v.lastShot.hit } : null,
        damage: v.damage ? Object.assign({}, v.damage) : null, intent: this.vehIntent(v), order: v.order ? v.order.text : null,
      }));
    },
    vehIntent(v) {
      if (v.burning) return 'burning'; if (v.abandoned) return 'abandoned by its crew'; if (v.gone) return v.state === 'moving' ? 'pulling out of the fight' : 'out of the fight';
      const o = v.order && this.cdr && this.cdr.alive ? ' (commander\'s order)' : '';
      if (v.state === 'moving') return `moving: ${v.moveWhy || 'new position'}${o}`;
      if (v.state === 'guiding') return 'guiding a missile'; if (v.state === 'firing') return 'firing its main gun';
      if (!v.K.armed) return v.team && v.team.alive ? 'parked in cover, waiting for its team' : 'parked';
      if (!v.canFire) return 'cannot fire'; if (this.t < v.suppressedUntil) return 'crew shaken by a hit';
      if (v.reserve) return 'held in reserve out of sight' + o;
      if (v.hasShot) return this.opened ? 'has a shot: firing' : 'has a shot: waiting for the ambush signal';
      if (v.sees) return this.t < v.readyAt ? `reloading (${Math.ceil(v.readyAt - this.t)} s)` : 'laying on the vehicle';
      return (v.mobile ? 'no view of the vehicle' : 'immobilised, no view of the vehicle') + o;
    },
    // counts for tests and for a debrief
    vehReport() {
      const X = this._vxs; if (!X) return { on: false, vehicles: [], stat: null };
      return { on: true, stat: JSON.parse(JSON.stringify(X.stat)), ap: this.tank.ap, mp: this.tank.main,
        vehicles: this.vehs.map(v => ({ id: v.id, kind: v.kind, alive: v.alive, gone: !!v.gone, mobile: v.mobile, canFire: v.canFire, known: v.known, gun: v.stat.gun, gunHit: v.stat.gunHit, msl: v.stat.msl, bursts: v.stat.bursts, moved: Math.round(v.stat.moved), killed: v.stat.killed, hits: v.stat.hits || [] })) };
    },
  };

  function install(Battle, deps) { HK = deps.HK; TEAMS = deps.TEAMS; SKILL = deps.SKILL; PACK = deps.PACK; Object.assign(Battle.prototype, methods); }
  const api = { install, KINDS, ZONES, ROUNDS, FX, FORCES, STRIP, aimTable, zonesSeen, protection, sigmaMrad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKEnemyVeh = api;
})(typeof window !== 'undefined' ? window : globalThis);
