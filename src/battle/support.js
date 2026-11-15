// Friendly support (a wingman tank, artillery, a scout drone, air strikes) and the enemy's bomber drone.
// Installed onto the battle layer the way tankai.js, crew.js and enemyveh.js are. All of it is OFF unless the battle's options ask for
// it (`support: { wingman, artillery, scout, air }`) or the enemy force has a `bomber` crew: without them nothing here runs and every battle
// is exactly as before (tests/battle/support.js part 1 proves it against the stored battles of tests/battle/vehicles_off_baseline.json).
//
// ============================================================================================================================
// DATA CONTRACT for anything that draws or lists these (read only)
//   battle.wing            null, or the wingman: the same fields as battle.tank (e, n, h, v, tur, alive, st, ai, fate, main, ap, coax, m2 ...)
//                          plus .volleys (its own engagements, same shape as battle.volleys), .shots and .mgs (its main gun rounds and
//                          machine-gun bursts, same shape as battle.shots / battle.mgs), .intent (plain words), .setup ('both' | 'trophy' | 'hkoi' | 'none')
//   battle.wingAt(t)       where the wingman is at battle time t (follows its engagement path), { e, n, h, v }
//   battle.wingView()      an object a VolleyView can be given in place of the battle: { volleys, world, transit: [], tankAt(t) }
//   battle.fires()         artillery missions: [{ id, e, n, by: 'ai' | 'player', t0 (called), splash (first round lands), state: 'called' | 'falling' | 'over' | 'cancelled',
//                          rounds: [{ t, e, n, done }] }]
//   battle.callFire({ e, n, kind: 'he' })  -> { ok, id, splash } or { ok: false, why }   the hook for an order system; same rules as the AI's own calls
//   battle.callAir({ e, n, kind: 'gun' | 'bomb' })  -> { ok, id, tot } or { ok: false, why }   an air strike; same rules as the AI's own calls
//   battle.air()           air strikes: [{ id, kind, e, n (called point), by, t0, tot (weapons on target), hdg (the run's heading), state: 'inbound' | 'attacking' |
//                          'done' | 'waved_off' | 'lost', release (time the bomb leaves, or the guns open), aim: [e, n] | null, v, alt, impacts: [{ t, e, n }] }]
//                          The aircraft is over the aim (or called) point at time tot, flying along hdg at v m/s, alt metres up: position = point + (t - tot) x v along hdg.
//   battle.supportMenu(e, n)  what a player may order at a point: [{ text, order: { k: 'fire' | 'air', e, n, kind } }] (empty without support or without `command: 'player'`)
//   battle.supportState()  { art, air (left), airLost, firing, inbound } or null
//   battle.scout()         null, or { alive, e, n, alt, hdg, found, lostHow }
//   battle.bombers()       enemy bomber drones in the air: [{ id, uid (its crew), e, n, alt, hdg, phase: 'inbound' | 'over' | 'outbound' | 'down', bombs, target: 'tank' | 'wing' }]
//   battle.bombs           every bomb dropped: [{ id, t0, t1 (lands), e0, n0, alt, e1, n1, hit, target }]
//   battle.supReport()     counts for tests and a debrief
//   events: wing_* (every event of the wingman's own fight carries the usual name with wing_ in front and wing: true: wing_launch, wing_end,
//     wing_hkoi_fire, wing_trophy, wing_gun, wing_vehicle_lost ...; their `v` is an index into battle.wing.volleys), wing_lost,
//     assist { from: 'tank' | 'wing', to, key, kind: 'obs' | 'he', kill, t }, fire_call { id, e, n, splash, by }, fire_splash { id, e, n }
//     (one per round, at the time it lands), fire_refused { why }, fire_cancel { id }, scout_found { uid | vid }, scout_lost { how },
//     air_inbound { id, kind, e, n, tot, hdg, by }, air_release { id, kind } (the bomb leaves / the guns open), air_impact { id, kind, e, n }
//     (at the time the weapons strike), air_off { id, why: 'done' | 'waved_off' | 'lost', e, n }, air_refused { why },
//     bomber_launch { id, uid, arrive }, bomber_hkoi { id, from, R, kill }, bomber_down { id, by }, bomb_drop { id, land, hit, target },
//     bomb_hit { id, zone, penetrated, killing, target }; team_lost carries by: 'artillery' | 'wing_main' | 'wing_m2' ...
//   log lines of the wingman have kind 'wing' (its crew, its engagements' start and end) or 'wingx' (the engine's blow-by-blow of an
//   engagement on it, kept out of the on-screen log).
// ============================================================================================================================
//
// HOW THE WINGMAN FIGHTS, AND WHAT IS NOT MODELLED
// - It is a second M1 with its own magazines, Trophy, HKOI (by setup choice), damage state and fate. Its crew uses the SAME drills as
//   the player's (tankai.js: thermal scan, target order, main gun, coax, .50, loader's M240, counter-fire on a launcher whose missile is
//   in the air), run with the battle looking at the wingman instead of the player's tank. tankai.js is not edited.
// - The enemy's volleys at it are resolved by the engine (HK.runMission) exactly like the player's: one raid on one vehicle, with the
//   wingman's own configuration and state.
// - Mutual cover uses the engine's own HK.platoonShare (the 'neighbour_obs' / 'neighbour_he' outcomes): when an engagement would end
//   in a hit, the other tank's HKOI, if it is within 600 m, switched on, has rounds and is not busy, may take that threat.
//   Limits: the engine fights one vehicle at a time, so the neighbour's help is worked out after the fact from the hits (as the engine's
//   platoon rule does); the smoke of one tank blinding the other is NOT carried between two separate engagements.
// - Limits of the enemy's choice: a team picks its target when it fires (see TARGET below). Enemy vehicles' guns, their missiles and FPV
//   drones still go for the player's tank only. Both tanks can be engaged at once when the teams fire together, but while one tank's
//   engagement runs no second one on the SAME tank starts, and once the player's is running no new one on the wingman starts until it ends. The battle still ends when the PLAYER's tank is lost.
// - The wingman's crew has no stress model (it works steadily) and does not pick hull-down positions of its own: it keeps station on
//   the player (150 m off his right rear, assumed) and turns its front to the located enemy.
//
// ASSUMPTIONS (Claude, 15 Nov 2026; judgement or open sources, none from a trial, none tuned to a result)
// | What | Figure | Why |
// | --- | --- | --- |
// | Wingman station | 150 m from the player, right rear first, on ground a tank can stand on | a tank section's usual spacing in the defence is 100 to 200 m |
// | Wingman moves | when it is more than 80 m off station, by the map's route finder, at up to 8 m/s | judgement |
// | TARGET: which tank a team fires at | the only one it has a shot at; if both, the one showing more of itself (not hull-down beats hull-down); if equal, the nearer one 60% of the time | judgement: gunners take the better target |
// | Mutual cover reach | 600 m, the engine's default | HK.platoonShare |
// | Artillery | 3 missions a battle; one at a time; 90 s from the call to the first round (45 s for a repeat within 200 m of the last mission); 12 rounds of 155 mm HE in two volleys 10 s apart | a direct-support battery answering a priority call; Shawn: "artillery (minutes)" |
// | Where the rounds land | aim point off by 15 m (1 sigma) from the reported place; each round a further 30 m (1 sigma) | laser-ranged target location; 155 mm dispersion at mid range |
// | Scout drone correcting | with the scout alive and able to see the target, the second volley's aim point error is 5 m | Shawn: "friendly drone overhead (finds sites, corrects fire)" |
// | Effect on a team (men lying in position) | knocked out 80% within 10 m of a round, 35% within 25 m, 10% within 40 m; pinned for 30 s within 100 m; survivors within 100 m move when the mission ends | 155 mm HE against prone troops: judgement |
// | Effect on vehicles | light truck: destroyed 70% within 15 m, 25% within 30 m. BMP-2: mobility kill 40% within 6 m. Tanks: mobility kill 25% within 3 m | fragments do not harm armour; a near-direct hit breaks tracks |
// | Check fire | a mission the commander called himself is stopped, and not used up, if before the guns fire (25 s before the first round lands) his crew sees that the target has moved more than 60 m, gone or been knocked out | time of flight of a 155 mm round at mid range; judgement |
// | Danger close | no mission within 600 m of a friendly tank; a mission is stopped (and not used up) if a friendly tank comes within 600 m of its target before the guns fire | the usual danger-close distance for artillery |
// | The AI's call | a located team that is not moving, located at least 3 s, at least 600 m from both tanks, and that the tank cannot deal with itself (no line of sight; or no multi-purpose rounds left; or beyond 1,500 m while the gunner is laying on another target); most dangerous first; not twice on the same place within 2 minutes | judgement |
// | Air strikes | 2 sorties a battle, one at a time; none in fog | Shawn: "attack helicopter/aircraft (rare, long battles)" |
// | Gun and rocket run (attack helicopter or A-10 class) | weapons on target 75 to 105 s after the call; strikes a strip 200 m long and 30 m wide through the target, flown across the front (at right angles to the line from the player to the target) at 120 m/s, 120 m up | judgement |
// | ... its effect | a team in the strip knocked out 45%, the rest pinned 30 s; light truck destroyed 70%; BMP-2 destroyed 40%; tank mobility kill 10% | 30 mm and rockets against men lying down and thin roofs; judgement |
// | Guided bomb (250 kg class) | weapons on target 90 to 120 s after the call; lands within 5 m (1 sigma) of the aim point; dropped from 1,200 m up at 200 m/s, 10 s to fall | judgement |
// | ... its effect | vehicle within 6 m destroyed 85%, within 15 m mobility kill 40%; team within 25 m knocked out 90%, within 50 m 40%, pinned within 100 m | judgement |
// | Where the aircraft aims | at the located team or vehicle it was called on, where that is NOW, if at weapons release the tank or the scout drone can see it, or (gun run) it lies in the open within 150 m of the called point, or it is a vehicle outside trees and buildings (the aircraft's own targeting pod holds a vehicle it has been handed); otherwise at the called point. A bomb is steered onto a target still held this way while it falls. A target that has moved more than 400 m is not followed | the pilot or the bomb's seeker needs someone's eyes on the target; this is what artillery lacks |
// | Danger close for air | 300 m for a gun run, 500 m for a bomb, from any friendly tank, at the call and again at release (waved off if broken) | judgement |
// | Wave-off | 10% of strikes for any reason (target not identified, another task); +15% (gun run) or +5% (bomb) for every enemy BMP-2 able to fire within 3 km of the target. A waved-off sortie is used up | the 30 mm cannon is the only anti-aircraft-capable weapon among the modelled enemy units; shoulder-fired missiles are not modelled as units, the 10% stands in for everything else |
// | Aircraft lost | 4% for every such BMP-2, gun run only; after a loss no more strikes are flown | judgement |
// | The AI's call for air | a bomb on a located enemy tank or BMP-2 that is halted; otherwise a gun run on a located team under the same rule as the artillery call | judgement |
// | A player's fire mission or air strike order | takes 8 s to pass on the radio after the usual time to give an order | judgement |
// | Scout drone | flies circles round the player at 20 m/s and 150 m up, 800 m out widening to 2,400 m and back; sees 800 m (slant) | a small quadcopter or fixed-wing scout |
// | Scout finds a team | 6% a second in the open, x0.5 in scrub or crops, x0.25 under trees, x3 if moving, x2 if setting up, x the weather factor of the tank's thermal scan; vehicles 20% a second | judgement |
// | Scout lost | 0.08% a second to jamming, link loss or a crash (about one in three over a 7 minute battle); +0.2% a second while within 600 m of an enemy team that is not pinned (small arms) | judgement |
// | Bomber drone | heavy multirotor: 16 m/s, 90 m up, radio-linked, 2 shaped-charge bombs a sortie, 3 sorties and 2 drones a crew, 75 s to rearm, settles 4 s over the target, drops one bomb every 3 s | open-source descriptions of heavy "bomber" multirotors |
// | Bomb hits the tank | green 20%, trained 35%, expert 50%, veteran 55% on a halted tank; x0.3 on a moving one | judgement; reports vary widely |
// | What a bomb hit does | the engine's FPV figures: 15% knocks the tank out (HK.THREATS.fpv.kill); the plate, penetration and parts come from DMG.report as a top attack of the FPV class (400 mm) | the bombs are the same class of warhead |
// | HKOI against the bomber | the engine's own drone rules (docs/HKOI_SPEC.md 3.11), copied: first burst to meet at 800 m, the next after it has closed 120 m, at most 4 bursts, never under 100 m or above 60 degrees, not in the rear blind arc, 2% jam; kill = 0.70 x 144 / (144 + dj^2) with dj from the pilot's jink (novice x0.4, trained x1, expert x1.7 and a 25% feint), x1.6 on follow-up bursts | src/engine.js resolveHE. A heavy multirotor probably jinks less than an FPV: this may understate HKOI |
// | HKOI busy | it does not fire at a bomber while an engagement with missiles is running | the engine cannot interleave them; missiles come first |
// | Trophy against bombs | nothing: a bomb falling from straight above at about 40 m/s is taken to be outside what Trophy engages | honest unknown; said plainly |
// | Machine guns against the bomber | not modelled | |
//
// THE BOMBER IS RESOLVED HERE, OUTSIDE THE REFEREE. The engine has no threat that hovers and drops. Its approach is fought with the
// engine's own airburst formula and its bombs' effect with the engine's FPV kill chance and the damage model, as listed above.
(function (root) {
  'use strict';
  let HK, CAMP, TEAMS, SKILL, DEPS;
  const DEG = Math.PI / 180, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const brgOf = (e0, n0, e1, n1) => (Math.atan2(e1 - e0, n1 - n0) / DEG + 360) % 360, angDiff = (a, b) => ((a - b + 540) % 360) - 180;
  const dmg = () => (DEPS && DEPS.DMG) || root.DMG || (typeof DMG !== 'undefined' ? DMG : null);
  const WING = { off: 150, slack: 80, vmax: 8, reach: 600, nearer: 0.6 };
  const ART = { missions: 3, delay: 90, repeat: 45, repeatR: 200, volleys: 2, guns: 6, gap: 10, flight: 25, aim: 15, aimScout: 5, disp: 30, danger: 600, again: 120,
    team: [[10, 0.8], [25, 0.35], [40, 0.1]], pin: 100, pinS: 30, truck: [[15, 0.7], [30, 0.25]], bmp: [6, 0.4], tank: [3, 0.25] };
  const AIR = { sorties: 2, abort: 0.1, threatR: 3000, reacq: 150, follow: 400, radio: 8,
    gun: { delay: [75, 105], danger: 300, len: 200, wid: 30, team: 0.45, pinS: 30, truck: 0.7, bmp: 0.4, tank: 0.1, v: 120, alt: 120, lead: 0, waveVeh: 0.15, lossVeh: 0.04 },
    bomb: { delay: [90, 120], danger: 500, cep: 5, veh: [6, 0.85], vehMob: [15, 0.4], team: [[25, 0.9], [50, 0.4]], pin: 100, pinS: 30, v: 200, alt: 1200, lead: 10, waveVeh: 0.05, lossVeh: 0 } };
  const SCOUT = { v: 20, alt: 150, r0: 800, r1: 2400, see: 800, p: 0.06, pVeh: 0.2, lose: 0.0008, shot: 0.002, shotR: 600 };
  const BOMB = { v: 16, alt: 90, bombs: 2, drones: 2, settle: 4, gap: 3, hit: { green: 0.2, trained: 0.35, expert: 0.5, veteran: 0.55 }, moving: 0.3, close: 120, minR: 100 };
  const SEEING = { day: 1, dawn: 1, dusk: 1, night: 1, overcast: 1, rain: 0.6, snow: 0.7, fog: 0.35 };
  const SWAP = ['volleys', '_rf', '_mg', '_tg', '_tgT', '_hd', '_pending', 'cfg0', 'lookup', 'seed', 'rng', '_holdWhy', 'shots', 'mgs', 'killedByTank', 'killedByMg'], XSWAP = ['rfv', 'want', 'loadedType', 'wasLoaded', 'fired'];
  const PASS = /^(team_lost|located|move|veh_|mount|dismount|over|tank_fate|blowout|bail_out|assist|fire_|scout_|bomb|air_)/;
  const gauss = r => { let u = 0; for (let i = 0; i < 6; i++) u += r.random(); return (u - 3) / 0.7071; };   /* about a standard normal */

  const methods = {
    _sx() { return this.sup || (this.sup = { rng: new HK.RNG(HK.seedFor(this.seed, 9003)), brng: new HK.RNG(HK.seedFor(this.seed, 9004)), art: null, scout: null, air: null, strikes: [], fires: [], flights: [], at: 0, player: this.tank, pVolleys: this.volleys,
      stat: { wingVolleys: 0, wingFiredAt: 0, wingHits: 0, assists: 0, assistKills: 0, artCalled: 0, artRefused: 0, artRounds: 0, artKills: 0, artVehKills: 0, scoutFound: 0, airCalled: 0, airRefused: 0, airWaved: 0, airLost: 0, airDone: 0, airTeamKills: 0, airVehKills: 0, airFollowed: 0, bomberSorties: 0, bomberBursts: 0, bomberDown: 0, bombsDropped: 0, bombHits: 0, bombKills: 0 } }); },
    _supPlayer() { return this.sup ? this.sup.player : this.tank; },
    _friends() { const S = this.sup, out = [S ? S.player : this.tank]; if (this.wing && this.wing.alive) out.push(this.wing); return out; },
    _supInit(s, opt) {
      if (!s || !(s.wingman || s.artillery || s.scout || s.air)) return;
      const S = this._sx();
      if (s.wingman) this._wingInit(s.wingman === true ? 'same' : s.wingman, s);
      if (s.artillery) S.art = { left: typeof s.artillery === 'number' ? s.artillery : ART.missions, at: 0, last: null };
      if (s.scout) { const T = this.tank; S.scout = { alive: true, ang: S.rng.random() * 6.283, e: T.e, n: T.n + SCOUT.r0, alt: SCOUT.alt, hdg: 90, found: 0, lostHow: null, at: 0 }; }
      if (s.air) S.air = { left: typeof s.air === 'number' ? s.air : AIR.sorties, at: 0, lost: false };
      const parts = []; if (this.wing) parts.push(`a wingman (${this.wing.setup === 'both' ? 'HKOI and Trophy' : this.wing.setup === 'trophy' ? 'Trophy only' : this.wing.setup === 'hkoi' ? 'HKOI only' : 'no HKOI, no Trophy'})`); if (S.art) parts.push(`${S.art.left} artillery missions`); if (S.scout) parts.push('a scout drone'); if (S.air) parts.push(`${S.air.left} air strike${S.air.left === 1 ? '' : 's'}`);
      this.say(0, 'setup', null, `Support: ${parts.join(', ')}.`);
    },

    // ================================================================ the wingman
    _wingInit(setup, s) {
      const S = this._sx(), T = this.tank, W = this.world; let cfg = this.cfg0, lookup = this.lookup;
      if (setup !== 'same') { cfg = JSON.parse(JSON.stringify(this.cfg0)); cfg.hkoi_enabled = setup === 'both' || setup === 'hkoi'; if (cfg.aps) cfg.aps.enabled = setup === 'both' || setup === 'trophy'; lookup = cfg.hkoi_enabled ? (this.cfg0.hkoi_enabled ? this.lookup : (s.lookup || HK.meetLookup(cfg))) : {}; }
      else setup = cfg.hkoi_enabled ? (cfg.aps && cfg.aps.enabled === false ? 'hkoi' : 'both') : (cfg.aps && cfg.aps.enabled === false ? 'none' : 'trophy');
      // a place to stand: right rear, left rear, right, left, behind (assumed order), 150 m off, on ground a tank can hold
      let at = null; for (const d of [WING.off, WING.off * 0.7, WING.off * 1.3]) { for (const rel of [120, 240, 90, 270, 180, 60, 300, 0]) { const a = (T.h + rel) * DEG, e = T.e + Math.sin(a) * d, n = T.n + Math.cos(a) * d; if (W.inside(e, n) && W.passable(e, n, true) && W.slope(e, n) <= 0.3) { at = { e, n, rel, d }; break; } } if (at) break; }
      if (!at) at = { e: T.e + 40, n: T.n, rel: 90, d: 40 };
      const volleys = [], shots = [], mgs = [];
      const G = this.wing = { isWing: true, setup, e: at.e, n: at.n, h: T.h, v: 0, alive: true, main: 10, mainReady: 0, coax: 2400, m2: 600, home: { e: at.e, n: at.n }, route: null, goal: null, mode: 'overwatch', modeSince: 0,
        st: CAMP.fresh(cfg), known: T.known /* one radio net: what either crew has located, both know */, volleys, shots, mgs, rel: at.rel, off: at.d, intent: 'On station',
        ctx: { volleys, _rf: null, _mg: null, _tg: null, _tgT: -1, _hd: null, _pending: null, cfg0: cfg, lookup, seed: this.seed * 7919 + 17, rng: new HK.RNG(HK.seedFor(this.seed, 9005)), _holdWhy: null, shots, mgs, killedByTank: 0, killedByMg: 0 },
        x: { rfv: null, want: 'mp', loadedType: 'mp', wasLoaded: true, fired: false } };
      // while the battle is looking at the wingman: its crew has no stress model, and its log lines and events carry its name
      const P = Object.getPrototypeOf(this), self = this;
      this._crewStep = function () { return self._sw ? undefined : P._crewStep.apply(this, arguments); }; this._crewAdd = function () { return self._sw ? 0 : P._crewAdd.apply(this, arguments); };
      this._crewMul = function () { return self._sw ? 1 : P._crewMul.apply(this, arguments); }; this._crewOut = function () { return self._sw ? false : P._crewOut.apply(this, arguments); }; this._crewFlinch = function () { return self._sw ? false : P._crewFlinch.apply(this, arguments); };
      this.say = function (t, kind, who, text, why) { if (self._sw && kind !== 'enemy') { kind = kind === 'engine' ? 'wingx' : 'wing'; if (typeof who === 'string') who = 'WING'; text = 'Wingman: ' + text; } return P.say.call(this, t, kind, who, text, why); };
      this.ev = function (t, type, o) { if (self._sw) { if (type === 'team_lost' && o && o.by) o.by = 'wing_' + o.by; if (!PASS.test(type)) { type = 'wing_' + type; o = Object.assign({ wing: true }, o || {}); } } return P.ev.call(this, t, type, o); };
      if (this._crew) this._asWing(() => this._crew());   /* tankai.js: magazines and crew state */
      void S;
    },
    // run something with the battle looking at the wingman instead of the player's tank
    _asWing(fn) {
      const G = this.wing; if (this._sw) return fn();
      const C = G.ctx, save = {}, X = this._vxs, xs = {};
      for (const k of SWAP) { save[k] = this[k]; this[k] = C[k]; } if (X) for (const k of XSWAP) { xs[k] = X[k]; X[k] = G.x[k]; }
      const P = this.tank; this.tank = G; this._sw = true;
      try { return fn(); }
      finally { this._sw = false; this.tank = P; for (const k of SWAP) { C[k] = this[k]; this[k] = save[k]; } if (X) for (const k of XSWAP) { G.x[k] = X[k]; X[k] = xs[k]; } }
    },
    wingAt(t) { const G = this.wing; if (!G) return null; return this.tankAt.call(G.atCtx || (G.atCtx = { volleys: G.volleys, tank: G }), t); },   /* the battle's own tankAt, looking at the wingman's engagements */
    wingView() { const b = this; return this.wing ? (this.wing.view || (this.wing.view = { volleys: this.wing.volleys, world: this.world, transit: [], tankAt: t => b.wingAt(t), tank: this.wing })) : null; },
    // can this team hit the wingman from where it lies? (looked at twice a second)
    _wingSeen(u, seen) {
      const G = this.wing; if (!G.alive || u.spec.indirect || u.veh) return false;
      if (this.t >= (u._wAt || 0)) { u._wAt = this.t + 0.5; const d = Math.hypot(G.e - u.e, G.n - u.n); u._wCan = d >= u.spec.rmin && d <= u.spec.rmax && this.world.los(u.e, u.n, u.spec.agl, G.e, G.n, 2.2).clear; }
      return !seen && !!u._wCan;
    },
    // the teams about to fire: who takes which tank? Those that take the wingman fire at it as an engagement of its own.
    _wingSplit(teams, exposed, waited, how) {
      const G = this.wing, S = this.sup, T = this.tank, W = this.world; if (!G.alive) return teams;
      const mine = [], his = [], rank = { none: 2, hull: 1, full: 0 };
      for (const u of teams) {
        if (u.veh || u.spec.indirect) { mine.push(u); continue; }
        const dP = Math.hypot(T.e - u.e, T.n - u.n), canP = dP >= u.spec.rmin && dP <= u.spec.rmax && W.los(u.e, u.n, u.spec.agl, T.e, T.n, 2.2).clear;
        const dW = Math.hypot(G.e - u.e, G.n - u.n), canW = dW >= u.spec.rmin && dW <= u.spec.rmax && W.los(u.e, u.n, u.spec.agl, G.e, G.n, 2.2).clear;
        let tgt = u._tgt || null;
        if (!canW && !canP) { u._tgt = null; continue; }   /* its view has just closed: no shot this time */
        if (!canW) tgt = 'p'; else if (!canP) tgt = 'w';
        else if (!tgt) { const xp = rank[W.defilade(u.e, u.n, u.spec.agl, T.e, T.n)], xw = rank[W.defilade(u.e, u.n, u.spec.agl, G.e, G.n)]; tgt = xw > xp ? 'w' : xp > xw ? 'p' : (S.rng.random() < WING.nearer) === (dW < dP) ? 'w' : 'p'; }
        u._tgt = tgt; (tgt === 'w' ? his : mine).push(u);
      }
      if (his.length) {
        const busy = G.ctx._pending || (G.volleys.length && this.t <= G.volleys[G.volleys.length - 1].tEnd);
        if (!busy) { for (const u of his) u._tgt = null; S.stat.wingVolleys++; S.stat.wingFiredAt += his.length; this._inWing = true;
          try { this._asWing(() => this._fireVolley(his, this._exposure(), waited, { atWill: how.atWill, why: how.why })); } finally { this._inWing = false; } }
        /* else: the wingman is already being engaged; these teams hold their shot until that is over */
      }
      for (const u of mine) u._tgt = null;
      return mine;
    },
    // the engine's own platoon rule: the other tank's HKOI may take a threat that is about to hit this one
    _supShare(rec, c, at, T) {
      const S = this.sup, G = this.wing, P = S.player, other = T === G ? P : G; if (!other.alive || !rec.threats.some(th => th.viz.end && th.viz.end.type === 'hit')) return;
      const off = [other.e - at.e, other.n - at.n]; if (Math.hypot(off[0], off[1]) > WING.reach) return;
      const oc = CAMP.applyState(JSON.parse(JSON.stringify(other === G ? G.ctx.cfg0 : (this._sw ? S.pCfg0 : this.cfg0))), other.st); oc.vehicle.hull_deg = other.h; if (!oc.hkoi_enabled) return;
      // what the other tank's own gun is doing right now, in this engagement's clock
      const bursts = [], ovs = other === G ? G.volleys : S.pVolleys, ov = ovs.length ? ovs[ovs.length - 1] : null;
      if (ov && this.t <= ov.tEnd) for (const b of ov.rec.bursts || []) bursts.push({ kind: b.kind === 'he' ? 'he' : 'busy', tf: b.tf + ov.t0 - this.t, rounds: (b.rounds || []).map(() => 0), idx: -1 });
      const lookup = other === G ? G.ctx.lookup : (this._sw ? S.pLookup : this.lookup), was = !!rec.killed;
      const out = HK.platoonShare([{ rec, cfg: c, off: [0, 0] }, { rec: { threats: [], bursts }, cfg: oc, off }], { share: true, reach_m: WING.reach, lookup });
      if (!out.assists.length) return;
      const burst = oc.gun.burst, name = other === G ? 'The wingman\'s' : 'The lead tank\'s'; let saved = 0;
      for (const a of out.assists) { if (a.from !== 1) continue; S.stat.assists++; if (a.kind === 'obs') other.st.obs = Math.max(0, other.st.obs - burst); else other.st.he = Math.max(0, other.st.he - burst);
        const th = rec.threats.find(q => q.idx === a.idx) || rec.threats[a.idx], tt = HK.THREATS[a.key] || {};
        P_ev(this, this.t + a.tf, 'assist', { from: other === G ? 'wing' : 'tank', to: other === G ? 'tank' : 'wing', key: a.key, kind: a.kind || 'he', kill: !!a.kill, brg: th ? Math.round(th.brg) : null });
        if (a.kill && th) { saved++; S.stat.assistKills++; rec.events = rec.events.filter(e => !(e.idx === th.idx && (e.kind === 'hit' || /HITS/.test(e.text || ''))));
          rec.events.push({ t: th.viz.end.t, kind: 'kill', idx: th.idx, text: `${name} HKOI ${a.kind === 'obs' ? 'lays a cloud on the beam of' : 'airbursts'} the ${tt.short || a.key} that was about to hit: ${a.kind === 'obs' ? 'it goes wide' : 'destroyed'}` }); }
        else rec.events.push({ t: a.tf, kind: 'fire', idx: a.idx, text: `${name} HKOI fires at the ${tt.short || a.key} to help: no effect` }); }
      if (saved) { const kts = rec.threats.filter(o => o.viz.end && o.viz.end.type === 'hit' && o.viz.end.killing).map(o => o.viz.end.t); if (kts.length) rec.kill_t = Math.min(...kts); else delete rec.kill_t;
        const last = rec.events.find(e => /^Mission result/.test(e.text || '')); if (last) { last.kind = rec.killed ? 'hit' : 'end'; last.text = rec.killed ? 'Mission result: vehicle destroyed' : rec.hits ? `Mission result: vehicle survives ${rec.hits} hit${rec.hits > 1 ? 's' : ''}` : 'Mission result: every threat defeated, no hits'; }
        if (was && !rec.killed) rec.saved_by_neighbour = true; }
      rec.events.sort((p, q) => p.t - q.t);
    },
    _wingStep(dt) {
      const G = this.wing, S = this.sup; if (!G.alive) { if (!G.lostSaid) { G.lostSaid = true; this.ev(this.t, 'wing_lost', { how: G.out || (G.fate && G.fate.kind) || 'destroyed' }); } return; }
      this._asWing(() => {
        if (this._pending) { const f = this._pending; this._pending = null; f(); }   /* the second half of an engagement on the wingman, one step after the first (no hitch) */
        this._wingMove(dt);
        const n0 = this.volleys.length ? this.volleys[this.volleys.length - 1] : null, wasDone = n0 ? n0.done : true;
        this._finishVolleys(); if (n0 && !wasDone && n0.done) S.stat.wingHits += n0.rec.hits || 0;
        if (this._fateStep) this._fateStep();
        if (!G.alive) return;
        this._returnFire(); this._machineGuns();
        const A = G.ai; G.intent = G.fate && G.fate.mobility === 'killed' ? 'Immobilised: fighting from where it stands' : G.goal ? 'Moving to keep station on the lead tank' : this._volleyActive() ? 'Under fire' : A && A.w && A.w.main && !/no target|no multi/.test(A.w.main) ? 'Engaging: ' + A.w.main : 'On station, watching';
      });
      if (!G.alive && !G.lostSaid) { G.lostSaid = true; this.ev(this.t, 'wing_lost', { how: G.out || (G.fate && G.fate.kind) || 'destroyed' }); }
    },
    // keep station on the player; follow the path of its own engagement while one runs
    _wingMove(dt) {
      const G = this.tank, S = this.sup, P = S.player, v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null;
      if (v && this.t <= v.tEnd) { const p = this.tankAt(this.t); G.e = p.e; G.n = p.n; G.h = p.h; G.v = p.v; G.goal = null; G.route = null; return; }
      if (this.fateOn && G.fate && G.fate.mobility === 'killed') { G.v = 0; G.goal = null; G.route = null; return; }
      if (!G.goal && this.t >= (G.stnAt || 0)) { G.stnAt = this.t + 2; const a = (P.h + G.rel) * DEG, se = P.e + Math.sin(a) * G.off, sn = P.n + Math.cos(a) * G.off, moving = (P.v || 0) > 1 || !!P.goal;
        if (!moving && Math.hypot(se - G.e, sn - G.n) > WING.slack && Math.hypot(P.e - G.e, P.n - G.n) > G.off + WING.slack * 0.5) {
          let c = null; for (const k of [1, 0.75, 1.25]) for (const rel of [G.rel, 360 - G.rel, 180, 90, 270]) { if (c) break; const b = (P.h + rel) * DEG, e = P.e + Math.sin(b) * G.off * k, n = P.n + Math.cos(b) * G.off * k; if (this.world.inside(e, n) && this.world.passable(e, n, true) && this.world.slope(e, n) <= 0.3) c = { e, n }; }
          if (c) { const route = this.world.path(G.e, G.n, c.e, c.n, { grid: 50, tank: true }); G.route = route && route.length > 1 ? route.slice(1).concat([[c.e, c.n]]) : [[c.e, c.n]]; G.routeI = 0; G.goal = c; G.mode = 'moving'; this.ev(this.t, 'tank_move', { to: [Math.round(c.e), Math.round(c.n)] }); } } }
      if (G.goal && G.route) {
        let wp = G.route[G.routeI], dx = wp[0] - G.e, dn = wp[1] - G.n, d = Math.hypot(dx, dn); const last = G.routeI >= G.route.length - 1;
        if (d < (last ? 2 : 12)) { if (last) { G.goal = null; G.route = null; G.v = 0; G.mode = 'overwatch'; G.modeSince = this.t; return; } G.routeI++; wp = G.route[G.routeI]; dx = wp[0] - G.e; dn = wp[1] - G.n; d = Math.hypot(dx, dn); }
        const want = brgOf(G.e, G.n, wp[0], wp[1]), dh = angDiff(want, G.h); G.h = (G.h + clamp(dh, -35 * dt, 35 * dt) + 360) % 360;
        const vmax = Math.abs(dh) > 50 ? 2 : Math.min(WING.vmax * (this.fateOn && G.fate && G.fate.mobility === 'damaged' ? 0.5 : 1), last ? 1 + d * 0.5 : 99); G.v += clamp(vmax - G.v, -4 * dt, 2.4 * dt); G.e += Math.sin(G.h * DEG) * G.v * dt; G.n += Math.cos(G.h * DEG) * G.v * dt;
      } else { G.v = 0; const f = this._facing ? this._facing() : null; if (f != null) { const dh = angDiff(f, G.h); if (Math.abs(dh) > 4) G.h = (G.h + clamp(dh, -20 * dt, 20 * dt) + 360) % 360; } }
    },

    // ================================================================ one step of everything here
    _supStep(dt) {
      const S = this.sup; if (!S.pCfg0) { S.pCfg0 = this.cfg0; S.pLookup = this.lookup; }
      if (this.wing) this._wingStep(dt);
      if (S.fires.length) this._artStep();
      if (S.art && S.art.left > 0 && this.t >= S.art.at) { S.art.at = this.t + 2; this._artThink(); }
      if (S.scout && S.scout.alive) this._scoutStep(dt);
      if (S.strikes.length) this._airStep();
      if (S.air && S.air.left > 0 && !S.air.lost && this.t >= S.air.at) { S.air.at = this.t + 2; this._airThink(); }
      if (S.flights.length) this._bomberStep(dt);
    },

    // ================================================================ artillery
    callFire(o) { return this._artCall(o || {}, 'player'); },
    _artCall(o, by) {
      const S = this._sx(), A = S.art, refuse = why => { S.stat.artRefused++; this.ev(this.t, 'fire_refused', { why }); if (by === 'player') this.say(this.t, 'tank', 'CDR', `Fire mission refused: ${why}.`); return { ok: false, why }; };
      if (!A) return { ok: false, why: 'no artillery is in support of this battle' };
      if (o.kind && o.kind !== 'he') return refuse('only high-explosive missions are available');
      if (!(typeof o.e === 'number' && typeof o.n === 'number') || !this.world.inside(o.e, o.n)) return refuse('the target is off the map');
      if (A.left <= 0) return refuse('no missions left');
      if (S.fires.some(f => f.state !== 'over' && f.state !== 'cancelled')) return refuse('the battery is still firing the last mission');
      for (const F of this._friends()) if (Math.hypot(F.e - o.e, F.n - o.n) < ART.danger) return refuse(`danger close: the target is within ${ART.danger} m of ${F === S.player ? 'the vehicle' : 'the wingman'}`);
      const r = S.rng, rep = A.last && this.t - A.last.t < 600 && Math.hypot(A.last.e - o.e, A.last.n - o.n) < ART.repeatR, delay = rep ? ART.repeat : ART.delay, splash = this.t + delay;
      const F = { id: S.fires.length, e: o.e, n: o.n, by, t0: +this.t.toFixed(2), splash: +splash.toFixed(2), state: 'called', rounds: [], uid: o.uid == null ? null : o.uid, vid: o.vid == null ? null : o.vid, kills: 0 };
      for (let vI = 0; vI < ART.volleys; vI++) { F.aim = F.aim || []; F.aim.push(null); for (let g = 0; g < ART.guns; g++) F.rounds.push({ t: +(splash + vI * ART.gap + r.random() * 1.5).toFixed(2), vol: vI, e: 0, n: 0, done: false, gx: gauss(r), gy: gauss(r) }); }
      F.ax = [gauss(r), gauss(r)]; F.rounds.sort((a, b) => a.t - b.t);
      A.left--; A.last = { e: o.e, n: o.n, t: this.t }; S.fires.push(F); S.stat.artCalled++;
      this.ev(this.t, 'fire_call', { id: F.id, e: Math.round(o.e), n: Math.round(o.n), splash: F.splash, by });
      const T = S.player, R = Math.hypot(o.e - T.e, o.n - T.n), brg = brgOf(T.e, T.n, o.e, o.n);
      this.say(this.t, 'tank', 'CDR', `Fire mission${by === 'player' ? ' (ordered)' : ''}: ${o.what || 'enemy position'}, ${(R / 1000).toFixed(2)} km, bearing ${Math.round(brg).toString().padStart(3, '0')}. ${ART.volleys * ART.guns} rounds, splash in about ${Math.round(delay)} s. ${A.left} mission${A.left === 1 ? '' : 's'} left.`, o.why || (rep ? 'a repeat on a target the battery is already laid on' : 'the battery has to work out the data and lay the guns'));
      return { ok: true, id: F.id, splash: F.splash };
    },
    // the tank commander's own judgement: call it on a located position the tank cannot deal with itself
    _artThink() {
      const S = this.sup, T = S.player, A = S.art; if (!T.alive || S.fires.some(f => f.state !== 'over' && f.state !== 'cancelled') || !this._targets) return;
      const clearOf = (e, n) => this._friends().every(F => Math.hypot(F.e - e, F.n - n) >= ART.danger), fresh = (e, n) => !S.fires.some(f => f.state !== 'cancelled' && this.t - f.t0 < ART.again && Math.hypot(f.e - e, f.n - n) < 60);
      for (const q of this._targets()) { if (q.moving || this.t - q.k.t < 3 || !clearOf(q.k.e, q.k.n) || !fresh(q.k.e, q.k.n)) continue;
        const why = !q.los ? 'the tank cannot see the position from here' : T.main <= 0 ? 'no multi-purpose rounds left' : q.R > 1500 && this._rf && this._rf.k !== q.k ? 'beyond 1,500 m and the gunner is busy with another target' : null; if (!why) continue;
        this._artCall({ e: q.k.e, n: q.k.n, uid: q.u.id, what: `${q.u.spec.name} #${q.u.id + 1}`, why: `${why}; the battery needs time to work out the data and lay the guns` }, 'ai'); return; }
      for (const v of this.vehs || []) { if (!v.known || !v.alive || v.gone || !v.kv || v.state === 'moving' || v.K.armed && !/bmp/.test(v.kind) || !clearOf(v.kv.e, v.kv.n) || !fresh(v.kv.e, v.kv.n)) continue;
        if (this.world.los(T.e, T.n, 2.5, v.kv.e, v.kv.n, 1.5).clear && Math.hypot(v.kv.e - T.e, v.kv.n - T.n) <= 2500) continue;
        this._artCall({ e: v.kv.e, n: v.kv.n, vid: v.id, what: `${v.K.name} #${v.id + 1}`, why: 'a vehicle the tank cannot engage from here' }, 'ai'); return; }
      void A;
    },
    _artStep() {
      const S = this.sup, W = this.world, r = S.rng, SC = S.scout;
      for (const F of S.fires) { if (F.state === 'over' || F.state === 'cancelled') continue;
        // check fire: if the crew learns before the guns fire that the target has gone or is dead, the mission is stopped and not used up
        if (F.state === 'called' && this.t < F.splash - ART.flight && this._friends().some(X => Math.hypot(X.e - F.e, X.n - F.n) < ART.danger)) { F.state = 'cancelled'; S.art.left++; S.stat.artCancelled = (S.stat.artCancelled || 0) + 1; this.ev(this.t, 'fire_cancel', { id: F.id }); this.say(this.t, 'tank', 'CDR', `Check fire: a friendly tank is now within ${ART.danger} m of the target. Mission cancelled, ${S.art.left} left.`, 'danger close'); continue; }
        if (F.state === 'called' && F.by === 'ai' && F.uid != null && this.t < F.splash - ART.flight) { const k = (S.player.known || []).find(q => q.id === F.uid);
          if (k && (k.done || Math.hypot(k.e - F.e, k.n - F.n) > 60)) { F.state = 'cancelled'; S.art.left++; S.stat.artCancelled = (S.stat.artCancelled || 0) + 1; this.ev(this.t, 'fire_cancel', { id: F.id }); this.say(this.t, 'tank', 'CDR', `Check fire: the target of the fire mission has ${k.done ? 'gone or been dealt with' : 'moved'}. Mission cancelled, ${S.art.left} left.`, 'the guns had not fired yet'); continue; } }
        for (const rd of F.rounds) { if (rd.done || this.t < rd.t) continue; rd.done = true; F.state = 'falling';
          if (F.aim[rd.vol] == null) { const seen = rd.vol > 0 && SC && SC.alive && Math.hypot(SC.e - F.e, SC.n - F.n) < SCOUT.r1 + SCOUT.see && W.los(SC.e, SC.n, SC.alt, F.e, F.n, 1).clear, k = seen ? ART.aimScout : ART.aim; F.aim[rd.vol] = [F.e + F.ax[0] * k, F.n + F.ax[1] * k]; if (seen) { F.corrected = true; this.say(this.t, 'tank', 'CDR', 'The scout drone corrects the fall of shot: the second volley is on the target.', 'it can see the position from above'); } }
          rd.e = F.aim[rd.vol][0] + rd.gx * ART.disp; rd.n = F.aim[rd.vol][1] + rd.gy * ART.disp; S.stat.artRounds++; this.ev(this.t, 'fire_splash', { id: F.id, e: Math.round(rd.e), n: Math.round(rd.n) });
          for (const u of this.units) { if (!u.alive || u.gone || u.mounted) continue; const d = Math.hypot(u.e - rd.e, u.n - rd.n); if (d > ART.pin) continue;
            let p = 0; for (const [R, q] of ART.team) if (d <= R) { p = q; break; }
            if (p && r.random() < p) { u.alive = false; u.state = 'dead'; F.kills++; S.stat.artKills++; const k = (S.player.known || []).find(q => q.id === u.id); if (k) k.done = true; this.ev(this.t, 'team_lost', { uid: u.id, by: 'artillery' }); this.say(this.t, 'tank', 'CDR', `${u.spec.name} #${u.id + 1} is knocked out by the artillery.`, `a 155 mm round ${Math.round(d)} m from men lying in position: about ${Math.round(p * 100)}%`); }
            else { u.suppressedUntil = Math.max(u.suppressedUntil || 0, this.t + ART.pinS); u.sight = 0; u._artHit = F.id; } }
          for (const v of this.vehs || []) { if (!v.alive || v.gone) continue; const d = Math.hypot(v.e - rd.e, v.n - rd.n); let p = 0, effect = 'mobility';
            if (v.kind === 'uaz') { for (const [R, q] of ART.truck) if (d <= R) { p = q; break; } effect = 'catastrophic'; } else if (/bmp/.test(v.kind)) { if (d <= ART.bmp[0]) p = ART.bmp[1]; } else if (d <= ART.tank[0]) p = ART.tank[1];
            if (p && r.random() < p && this._vehStruck) { if (effect === 'catastrophic') S.stat.artVehKills++; this._vehStruck(v, { effect, zone: v.kind === 'uaz' ? 'body' : 'track', through: effect === 'catastrophic', by: 'artillery', aspect: null, tof: 0, name: `${v.K.name} #${v.id + 1}`, head: `Artillery round ${Math.round(d)} m from ${v.K.name} #${v.id + 1}`, where: v.kind === 'uaz' ? 'fragments through the body' : 'running gear', whyAim: 'area fire on a reported position', armour: `about ${Math.round(p * 100)}% at this distance (assumed)` }); } }
        }
        if (F.rounds.every(q => q.done)) { F.state = 'over'; const S2 = SKILL[this.skill];
          for (const u of this.units) if (u.alive && !u.gone && u._artHit === F.id && u.ammo > 0 && u.state === 'hidden') { u._artHit = null; this._displace(u, 'artillery has just fallen on the position'); }
          this.say(this.t, 'tank', 'CDR', `Fire mission over: ${F.kills ? `${F.kills} team${F.kills === 1 ? '' : 's'} knocked out` : 'no team seen knocked out'}.`, F.corrected ? 'second volley corrected by the scout drone' : null); void S2; } }
    },
    fires() { return this.sup ? this.sup.fires.map(F => ({ id: F.id, e: F.e, n: F.n, by: F.by, t0: F.t0, splash: F.splash, state: F.state, rounds: F.rounds.map(r => ({ t: r.t, e: r.e, n: r.n, done: r.done })) })) : []; },

    // ================================================================ air strikes
    callAir(o) { return this._airCall(o || {}, 'player'); },
    _airBusy() { return this.sup.strikes.some(k => k.state === 'inbound' || k.state === 'attacking'); },
    // can this be flown? (no side effects: also used before a player's order is passed on)
    _airCheck(o) {
      const S = this.sup, A = S && S.air; if (!A) return 'no aircraft are in support of this battle';
      const kind = o.kind || (o.vid != null ? 'bomb' : 'gun'), K = AIR[kind]; if (kind !== 'gun' && kind !== 'bomb') return 'that kind of strike is not available (a gun run or a guided bomb)';
      if (!(typeof o.e === 'number' && typeof o.n === 'number') || !this.world.inside(o.e, o.n)) return 'the target is off the map';
      if (A.lost) return 'the aircraft was lost: no more strikes'; if (A.left <= 0) return 'no strikes left';
      if (this.cond === 'fog') return 'the pilots cannot see the ground in this fog';
      if (this._airBusy()) return 'an aircraft is already on its way in';
      for (const F of this._friends()) if (Math.hypot(F.e - o.e, F.n - o.n) < K.danger) return `danger close: the target is within ${K.danger} m of ${F === S.player ? 'the vehicle' : 'the wingman'}`;
      return null;
    },
    _airCall(o, by) {
      const S = this._sx(), why = this._airCheck(o);
      if (why) { S.stat.airRefused++; this.ev(this.t, 'air_refused', { why }); if (by === 'player') this.say(this.t, 'tank', 'CDR', `Air strike refused: ${why}.`); return { ok: false, why }; }
      const A = S.air, r = S.rng, kind = o.kind || (o.vid != null ? 'bomb' : 'gun'), K = AIR[kind], T = S.player, tot = this.t + K.delay[0] + r.random() * (K.delay[1] - K.delay[0]);
      const k = { id: S.strikes.length, kind, e: o.e, n: o.n, by, t0: +this.t.toFixed(2), tot: +tot.toFixed(2), hdg: (brgOf(T.e, T.n, o.e, o.n) + (r.random() < 0.5 ? 90 : 270)) % 360, state: 'inbound', uid: o.uid == null ? null : o.uid, vid: o.vid == null ? null : o.vid,
        release: +(tot - K.lead).toFixed(2), aim: null, v: K.v, alt: K.alt, impacts: [], dice: [r.random(), r.random(), gauss(r), gauss(r)], what: o.what || null, kills: 0 };
      A.left--; S.strikes.push(k); S.stat.airCalled++;
      this.ev(this.t, 'air_inbound', { id: k.id, kind, e: Math.round(o.e), n: Math.round(o.n), tot: k.tot, hdg: Math.round(k.hdg), by });
      this.say(this.t, 'tank', 'CDR', `Air strike${by === 'player' ? ' (ordered)' : ''}: ${kind === 'gun' ? 'gun and rocket run' : 'guided bomb'} on ${o.what || 'the enemy position'}, ${(Math.hypot(o.e - T.e, o.n - T.n) / 1000).toFixed(2)} km, bearing ${Math.round(brgOf(T.e, T.n, o.e, o.n)).toString().padStart(3, '0')}. Weapons on target in about ${Math.round(tot - this.t)} s. ${A.left} strike${A.left === 1 ? '' : 's'} left.`, o.why || 'the aircraft has to be handed the target and fly in');
      return { ok: true, id: k.id, tot: k.tot };
    },
    // the tank commander's own judgement: a bomb for located armour that is halted, a gun run for a team he cannot deal with himself
    _airThink() {
      const S = this.sup, T = S.player; if (!T.alive || this._airBusy() || this.cond === 'fog' || !this._targets) return;
      const fresh = (e, n) => !S.strikes.some(k => this.t - k.t0 < ART.again && Math.hypot(k.e - e, k.n - n) < 80) && !S.fires.some(f => f.state !== 'cancelled' && this.t - f.t0 < ART.again && Math.hypot(f.e - e, f.n - n) < 80);
      const vs = (this.vehs || []).filter(v => v.known && v.alive && !v.gone && v.kv && v.state !== 'moving' && v.K.armed && fresh(v.kv.e, v.kv.n)).sort((a, b) => (/^t/.test(b.kind) ? 1 : 0) - (/^t/.test(a.kind) ? 1 : 0));
      for (const v of vs) { const o = { e: v.kv.e, n: v.kv.n, vid: v.id, kind: 'bomb', what: `${v.K.name} #${v.id + 1}`, why: 'located armour, halted: a job for a guided bomb' }; if (!this._airCheck(o)) { this._airCall(o, 'ai'); return; } }
      for (const q of this._targets()) { if (q.moving || this.t - q.k.t < 3 || !fresh(q.k.e, q.k.n)) continue;
        const why = !q.los ? 'the tank cannot see the position from here' : T.main <= 0 ? 'no multi-purpose rounds left' : q.R > 1500 && this._rf && this._rf.k !== q.k ? 'beyond 1,500 m and the gunner is busy with another target' : null; if (!why) continue;
        const o = { e: q.k.e, n: q.k.n, uid: q.u.id, kind: 'gun', what: `${q.u.spec.name} #${q.u.id + 1}`, why }; if (!this._airCheck(o)) { this._airCall(o, 'ai'); return; } }
    },
    _airKillTeam(u, k, d, p) { const S = this.sup; u.alive = false; u.state = 'dead'; k.kills++; S.stat.airTeamKills++; const kn = (S.player.known || []).find(q => q.id === u.id); if (kn) kn.done = true; this.ev(this.t, 'team_lost', { uid: u.id, by: 'air' }); this.say(this.t, 'tank', 'CDR', `${u.spec.name} #${u.id + 1} is knocked out by the air strike.`, `${k.kind === 'gun' ? 'in the strip the aircraft strafed' : `a bomb ${Math.round(d)} m away`}: about ${Math.round(p * 100)}%`); },
    // does anyone have eyes on the target the strike was called on (the tank, the scout drone, the pilot, the aircraft's pod)?
    _airEyes(k, tg) {
      const S = this.sup, W = this.world, T = S.player, D = S.scout; if (!tg || !tg.alive || tg.gone || Math.hypot(tg.e - k.e, tg.n - k.n) >= AIR.follow) return false;
      return W.los(T.e, T.n, 2.6, tg.e, tg.n, 1).clear || !!(D && D.alive && Math.hypot(Math.hypot(D.e - tg.e, D.n - tg.n), D.alt) < SCOUT.see && W.los(D.e, D.n, D.alt, tg.e, tg.n, 1).clear) || (k.kind === 'gun' && W.veg(tg.e, tg.n).cls < 2 && Math.hypot(tg.e - k.e, tg.n - k.n) < AIR.reacq)
        || (k.vid != null && W.veg(tg.e, tg.n).cls < 3 && !(W.buildingAt && W.buildingAt(tg.e, tg.n)));   /* a vehicle outside trees and buildings: the aircraft's own targeting pod holds it */
    },
    _airStep() {
      const S = this.sup, W = this.world, r = S.rng, T = S.player;
      for (const k of S.strikes) { const K = AIR[k.kind];
        if (k.state === 'inbound' && this.t >= k.release - 4) {
          // the run-in: is anything shooting back, and does the pilot have his target?
          const n = (this.vehs || []).filter(v => v.alive && !v.gone && v.canFire && /bmp/.test(v.kind) && Math.hypot(v.e - k.e, v.n - k.n) < AIR.threatR).length, pLoss = 1 - Math.pow(1 - K.lossVeh, n), pWave = 1 - (1 - AIR.abort) * Math.pow(1 - K.waveVeh, n);
          // where to aim: the target itself if someone has eyes on it
          let aim = [k.e, k.n]; const tg = k.uid != null ? this.units.find(u => u.id === k.uid) : k.vid != null ? (this.vehs || []).find(v => v.id === k.vid) : null;
          if (this._airEyes(k, tg)) { if (Math.hypot(tg.e - k.e, tg.n - k.n) > 15) S.stat.airFollowed++; aim = [tg.e, tg.n]; k.held = tg; }
          const close = this._friends().some(F => Math.hypot(F.e - aim[0], F.n - aim[1]) < K.danger);
          if (k.dice[0] < pLoss) { k.state = 'lost'; S.air.lost = true; S.stat.airLost++; this.ev(this.t + 2, 'air_off', { id: k.id, why: 'lost', e: Math.round(k.e), n: Math.round(k.n) }); this.say(this.t + 2, 'tank', 'CDR', 'The aircraft is hit on its run-in and goes down. No more air strikes.', `${n} enemy vehicle${n === 1 ? '' : 's'} with cannon within 3 km of the target: about ${Math.round(pLoss * 100)}% (assumed)`); }
          else if (close || k.dice[1] < pWave) { k.state = 'waved_off'; S.stat.airWaved++; this.ev(this.t, 'air_off', { id: k.id, why: 'waved_off', e: Math.round(k.e), n: Math.round(k.n) }); this.say(this.t, 'tank', 'CDR', `The air strike is waved off${close ? ': a friendly tank is too close to the target' : n ? ': cannon fire from the enemy vehicles, or the target not made out' : ': the pilot cannot make out the target'}. ${S.air.left} left.`, close ? 'danger close' : `about ${Math.round(pWave * 100)}% this time (assumed)`); }
          else { k.state = 'attacking'; k.aim = k.kind === 'bomb' ? [aim[0] + k.dice[2] * K.cep, aim[1] + k.dice[3] * K.cep] : aim; this.ev(Math.max(this.t, k.release), 'air_release', { id: k.id, kind: k.kind }); }
        }
        if (k.state === 'attacking' && this.t >= k.tot) { k.state = 'done'; S.stat.airDone++;
          if (k.kind === 'bomb' && k.held && this._airEyes(k, k.held)) k.aim = [k.held.e + k.dice[2] * K.cep, k.held.n + k.dice[3] * K.cep];   /* a guided bomb is steered onto a target that is still held while it falls */
          const ae = k.aim[0], an = k.aim[1], a = k.hdg * DEG, se = Math.sin(a), sn = Math.cos(a);
          this.ev(this.t, 'air_impact', { id: k.id, kind: k.kind, e: Math.round(ae), n: Math.round(an) });
          if (k.kind === 'gun') { for (let i = 0; i < 14; i++) { const f = (i / 13 - 0.5) * K.len, x = (r.random() - 0.5) * K.wid; k.impacts.push({ t: +(k.tot + i * 0.11).toFixed(2), e: ae + se * f + sn * x, n: an + sn * f - se * x }); } }
          else k.impacts.push({ t: k.tot, e: ae, n: an });
          const hitBy = (e, n) => { if (k.kind === 'bomb') return Math.hypot(e - ae, n - an); const de = e - ae, dn = n - an, along = de * se + dn * sn, across = Math.abs(de * sn - dn * se); return Math.abs(along) <= K.len / 2 && across <= K.wid / 2 ? 0 : 1e9; };
          for (const u of this.units) { if (!u.alive || u.gone || u.mounted) continue; const d = hitBy(u.e, u.n); let p = 0;
            if (k.kind === 'gun') { if (d > 0) continue; p = K.team; } else { if (d > K.pin) continue; for (const [R, q] of K.team) if (d <= R) { p = q; break; } }
            if (p && r.random() < p) this._airKillTeam(u, k, d, p); else { u.suppressedUntil = Math.max(u.suppressedUntil || 0, this.t + K.pinS); u.sight = 0; if (u.ammo > 0 && u.state === 'hidden') this._displace(u, 'an aircraft has just attacked the position'); } }
          for (const v of this.vehs || []) { if (!v.alive || v.gone) continue; const d = hitBy(v.e, v.n); let p = 0, effect = 'catastrophic';
            if (k.kind === 'gun') { if (d > 0) continue; if (v.kind === 'uaz') p = K.truck; else if (/bmp/.test(v.kind)) p = K.bmp; else { p = K.tank; effect = 'mobility'; } }
            else if (d <= K.veh[0]) p = K.veh[1]; else if (d <= K.vehMob[0]) { p = K.vehMob[1]; effect = v.kind === 'uaz' ? 'catastrophic' : 'mobility'; }
            if (p && r.random() < p && this._vehStruck) { if (effect === 'catastrophic') { S.stat.airVehKills++; k.kills++; } this._vehStruck(v, { effect, zone: effect === 'mobility' ? 'track' : v.kind === 'uaz' ? 'body' : 'turret_rear', through: effect === 'catastrophic', by: 'air', aspect: null, tof: 0, name: `${v.K.name} #${v.id + 1}`, head: `${k.kind === 'gun' ? 'Gun run on' : 'Bomb ' + Math.round(d) + ' m from'} ${v.K.name} #${v.id + 1}`, where: effect === 'mobility' ? 'running gear' : 'through the roof', whyAim: k.kind === 'gun' ? 'strafed from the air' : 'a guided bomb', armour: `about ${Math.round(p * 100)}% (assumed)` }); } }
          this.ev(this.t + 6, 'air_off', { id: k.id, why: 'done', e: Math.round(ae), n: Math.round(an) });
          this.say(this.t + 3, 'tank', 'CDR', `Air strike over: ${k.kills ? `${k.kills} knocked out` : 'nothing seen knocked out'}.`, k.aim[0] !== k.e || k.aim[1] !== k.n ? (k.kind === 'bomb' ? 'aimed where the target was seen at release (plus the bomb\'s own error)' : 'the pilot followed the target') : 'aimed at the place called'); }
      }
    },
    air() { return this.sup ? this.sup.strikes.map(k => ({ id: k.id, kind: k.kind, e: k.e, n: k.n, by: k.by, t0: k.t0, tot: k.tot, hdg: k.hdg, state: k.state, release: k.release, aim: k.aim, v: k.v, alt: k.alt, impacts: k.impacts })) : []; },
    // ---- the player's orders (src/battle/orders.js passes them on): { k: 'fire', e, n } and { k: 'air', e, n, kind }
    _supCheck(o) { const S = this.sup; if (o.k === 'air') return this._airCheck(o); const A = S && S.art; if (!A) return 'no artillery is in support of this battle'; if (!(typeof o.e === 'number' && typeof o.n === 'number') || !this.world.inside(o.e, o.n)) return 'the target is off the map'; if (A.left <= 0) return 'no missions left'; if (S.fires.some(f => f.state !== 'over' && f.state !== 'cancelled')) return 'the battery is still firing the last mission'; for (const F of this._friends()) if (Math.hypot(F.e - o.e, F.n - o.n) < ART.danger) return `danger close: the target is within ${ART.danger} m of a friendly tank`; return null; },
    _supOrderDo(o) { return o.k === 'air' ? this._airCall({ e: o.e, n: o.n, kind: o.kind, uid: o.uid, vid: o.vid, what: o.what }, 'player') : this._artCall({ e: o.e, n: o.n, uid: o.uid, what: o.what }, 'player'); },
    supportMenu(e, n) {
      const S = this.sup, out = []; if (!S || !this.cmd) return out;
      let near = null, nd = Math.max(40, Math.hypot(e - S.player.e, n - S.player.n) * 0.04); for (const v of this.vehs || []) if (v.known && v.alive && !v.gone && v.kv) { const d = Math.hypot(v.kv.e - e, v.kv.n - n); if (d < nd) { nd = d; near = { vid: v.id, e: Math.round(v.kv.e), n: Math.round(v.kv.n), what: `${v.K.name} #${v.id + 1}` }; } }
      if (!near) for (const q of S.player.known) { if (q.done) continue; const u = this.units.find(x => x.id === q.id), d = Math.hypot(q.e - e, q.n - n); if (u && d < nd) { nd = d; near = { uid: u.id, e: Math.round(q.e), n: Math.round(q.n), what: `${u.spec.name} #${u.id + 1}` }; } }
      const at = near || { e: Math.round(e), n: Math.round(n) }, on = near ? ` on ${near.what}` : ' here';
      if (S.art) out.push({ text: `Fire mission${on} · artillery, ${S.art.left} left`, order: Object.assign({ k: 'fire' }, at) });
      if (S.air && !S.air.lost) { out.push({ text: `Air strike${on} · gun run, ${S.air.left} left`, order: Object.assign({ k: 'air', kind: 'gun' }, at) }); out.push({ text: `Air strike${on} · guided bomb, ${S.air.left} left`, order: Object.assign({ k: 'air', kind: 'bomb' }, at) }); }
      return out;
    },
    supportState() { const S = this.sup; return S ? { art: S.art ? S.art.left : null, air: S.air ? (S.air.lost ? 0 : S.air.left) : null, airLost: !!(S.air && S.air.lost), firing: S.fires.some(f => f.state === 'called' || f.state === 'falling'), inbound: this._airBusy() } : null; },

    // ================================================================ the scout drone
    _scoutStep(dt) {
      const S = this.sup, D = S.scout, T = S.player, W = this.world, r = S.rng;
      // circles round the lead tank, out and back in between 800 and 2,400 m (one sweep out and back about every seven minutes)
      const ph = (this.t / 420) % 1, R = SCOUT.r0 + (SCOUT.r1 - SCOUT.r0) * (ph < 0.5 ? ph * 2 : 2 - ph * 2); D.ang = (D.ang + SCOUT.v / R * dt) % 6.2832;
      const e = T.e + Math.sin(D.ang) * R, n = T.n + Math.cos(D.ang) * R; D.hdg = brgOf(D.e, D.n, e, n); D.e = e; D.n = n; D.alt = SCOUT.alt;
      if (this.t < D.at) return; D.at = this.t + 1;
      const see = SEEING[this.cond] == null ? 1 : SEEING[this.cond]; let near = false;
      for (const u of this.units) { if (!u.alive || u.gone || u.mounted) continue; const d = Math.hypot(u.e - D.e, u.n - D.n); if (d < SCOUT.shotR && this.t >= (u.suppressedUntil || 0)) near = true;
        if (Math.hypot(d, D.alt) > SCOUT.see || !W.los(D.e, D.n, D.alt, u.e, u.n, 0.9).clear) continue;
        const k = T.known.find(q => q.id === u.id);
        if (u.known) { if (k && !k.done && (k.e !== u.e || k.n !== u.n)) { k.e = u.e; k.n = u.n; k.t = this.t; } continue; }   /* a located team it can see stays tracked as it moves */
        const veg = W.veg(u.e, u.n).cls, moving = u.state === 'moving' && this.t >= (u.packUntil || 0), p = SCOUT.p * (veg >= 4 ? 0.25 : veg >= 2 ? 0.5 : 1) * (moving ? 3 : u.state === 'setup' ? 2 : 1) * see;
        if (r.random() < p) { u.known = true; D.found++; S.stat.scoutFound++; if (!k) T.known.push({ id: u.id, e: u.e, n: u.n, t: this.t }); else { k.e = u.e; k.n = u.n; k.t = this.t; k.done = false; }
          this.ev(this.t, 'located', { uid: u.id, how: 'scout' }); this.ev(this.t, 'scout_found', { uid: u.id });
          this.say(this.t, 'tank', 'CDR', `Scout drone finds ${u.spec.name} #${u.id + 1}, ${Math.round(Math.hypot(u.e - T.e, u.n - T.n) / 10) * 10} m from the vehicle${veg >= 4 ? ', under trees' : veg >= 2 ? ', in low cover' : ', in the open'}.`, `seen from above, about ${(p * 100).toFixed(1)}% a second here`); } }
      for (const v of this.vehs || []) { if (!v.alive || v.gone || v.known || Math.hypot(Math.hypot(v.e - D.e, v.n - D.n), D.alt) > SCOUT.see || !W.los(D.e, D.n, D.alt, v.e, v.n, 1.5).clear) continue;
        if (r.random() < SCOUT.pVeh * see && this._vehLocate) { this._vehLocate(v, 'seen by the scout drone'); D.found++; S.stat.scoutFound++; this.ev(this.t, 'scout_found', { vid: v.id }); } }
      const pl = SCOUT.lose + (near ? SCOUT.shot : 0);
      if (r.random() < pl) { D.alive = false; D.lostHow = near && r.random() < SCOUT.shot / pl ? 'shot down' : 'link lost'; this.ev(this.t, 'scout_lost', { how: D.lostHow, e: Math.round(D.e), n: Math.round(D.n) }); this.say(this.t, 'tank', 'CDR', `Scout drone lost: ${D.lostHow === 'shot down' ? 'shot down over the enemy' : 'the link went and it came down'}.`, 'no more eyes overhead'); }
    },
    scout() { const D = this.sup && this.sup.scout; return D ? { alive: D.alive, e: D.e, n: D.n, alt: D.alt, hdg: D.hdg, found: D.found, lostHow: D.lostHow } : null; },

    // ================================================================ the enemy's bomber drone (resolved here, not by the engine: see the top of the file)
    // Bomber crews do not wait for the ambush signal for ever: the drone needs minutes to arrive. They launch once the fight is open (battle.js),
    // or here: at once when their group has no direct-fire team to wait for, otherwise after 30 s without an ambush (assumed).
    _bomberOpen() {
      for (const u of this.units) { if (!u.spec.bomber || !u.alive || u.gone || u.state !== 'hidden' || !u.hasShot || (u.wave || 0) !== this.wave) continue;
        const others = this.units.some(o => (o.wave || 0) === this.wave && o.alive && !o.gone && !o.spec.indirect && o.ammo > 0) || (this._vehMorale ? this._vehMorale().some(v => v.alive && !v.gone) : false);
        if (others && this.t - (this.waveT0 || 0) < 30) continue;
        this._bomberLaunch(u); }
    },
    _bomberLaunch(u) {
      const S = this._sx(), r = S.brng, Sk = SKILL[this.skill];
      if (u.drones == null) u.drones = BOMB.drones;
      if (r.random() < Sk.misfire) { u.readyAt = this.t + 8 + r.random() * 6; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1}: the drone fails to lift.`, 'friction'); return; }
      const F = this._friends().filter(x => x.alive).sort((a, b) => Math.hypot(a.e - u.e, a.n - u.n) - Math.hypot(b.e - u.e, b.n - u.n))[0]; if (!F) return;
      const R = Math.hypot(F.e - u.e, F.n - u.n), fl = { id: S.flights.length, u, tgt: F, e: u.e, n: u.n, alt: BOMB.alt, hdg: brgOf(u.e, u.n, F.e, F.n), phase: 'inbound', bombs: BOMB.bombs, t0: this.t, bursts: 0, nextAt: 800, overAt: null, dropAt: null, tracked: false, jam: 0 };
      u.fired++; u.lastShotT = this.t; u.state = 'guiding'; u.since = this.t; u.sight = 0; u.hasShot = false; S.flights.push(fl); S.stat.bomberSorties++;   /* the sortie is counted off when the drone is back or lost, so a crew with its last drone in the air is still in the fight */
      this.ev(this.t, 'bomber_launch', { id: fl.id, uid: u.id, arrive: +(this.t + R / BOMB.v).toFixed(1) });
      this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1} sends a bomber drone: ${(R / 1000).toFixed(1)} km to fly, about ${Math.round(R / BOMB.v)} s, ${BOMB.bombs} bombs.`, 'it flies over and drops them on the roof');
    },
    // HKOI of one friendly tank against one bomber: the engine's drone rules (src/engine.js resolveHE; docs/HKOI_SPEC.md 3.11)
    _bomberHkoi(fl, F) {
      const S = this.sup, r = S.brng, isW = F === this.wing, cfg0 = isW ? F.ctx.cfg0 : S.pCfg0 || this.cfg0; if (!cfg0.hkoi_enabled || !F.alive) return;
      const sys = F.st.sys || {}; if (sys.hkoi === 'destroyed' || sys.radar === 'destroyed') return;
      const g = cfg0.gun, rd = cfg0.rnd, fc = cfg0.fc || {}, dh = Math.hypot(fl.e - F.e, fl.n - F.n), slant = Math.hypot(dh, fl.alt), el = Math.atan2(fl.alt, Math.max(1, dh)) / DEG;
      if (fl.bursts >= (fc.max_bursts || 4) || this.t < fl.jam || (F.st.he || 0) < g.burst) return;
      const vs = isW ? F.volleys : S.pVolleys, lv = vs.length ? vs[vs.length - 1] : null; if (lv && this.t <= lv.tEnd) return;   /* busy with missiles */
      const want = rd.he_meet_drone_m || 800; if (slant > want || slant < (rd.arm_distance_m || 60) + 40 || el > g.el_max_deg) return;
      if (fl.phase === 'inbound' ? slant > fl.nextAt : this.t < fl.nextT) return;   /* after a miss: again once it has closed 120 m (inbound), or after the same time going away */
      const rel = ((brgOf(F.e, F.n, fl.e, fl.n) - F.h) % 360 + 360) % 360; if ((g.dead_zones_deg || []).some(([lo, hi]) => rel >= lo && rel <= hi)) return;
      if (!this.world.los(F.e, F.n, 3, fl.e, fl.n, fl.alt, { ignoreVeg: true }).clear) return;
      if (!fl.tracked) { fl.tracked = true; this.say(this.t, isW ? 'wing' : 'tank', isW ? 'WING' : 'CDR', `${isW ? 'Wingman: ' : ''}HKOI tracks a bomber drone at ${Math.round(slant / 10) * 10} m, ${Math.round(fl.alt)} m up.`, 'radio-linked: picked up by the passive detector, then the radar'); }
      const second = fl.bursts > 0, SK = ({ novice: { jink: 0.4, feint: 0 }, trained: { jink: 1, feint: 0 }, expert: { jink: 1.7, feint: 0.25 } })[SKILL[this.skill].pilot] || { jink: 1, feint: 0 };
      const tau = HK.tauOfS(slant, rd.muzzle_v, rd.drag_k_ref), feint = SK.feint > 0 && r.random() < SK.feint, evOn = !cfg0.enemy || cfg0.enemy.drone_evasion !== false;
      const jg = evOn ? (cfg0.enemy && cfg0.enemy.drone_jink_g != null ? cfg0.enemy.drone_jink_g : 1.2) * SK.jink * (second ? 1.6 : 1) : 0, dj = 0.5 * jg * 9.81 * tau * tau * 0.6, Rk = rd.he_drone_radius_m != null ? rd.he_drone_radius_m : rd.fuze_radius_m + 3, pk = rd.he_pk_drone * Rk * Rk / (Rk * Rk + dj * dj);
      F.st.he -= g.burst; fl.bursts++; S.stat.bomberBursts++; fl.nextAt = slant - BOMB.close; fl.nextT = this.t + BOMB.close / BOMB.v;
      if (r.random() < (g.jam_per_burst || 0)) fl.jam = this.t + (g.jam_clear_s || 4);
      const kill = !feint && r.random() < pk; this.ev(this.t, 'bomber_hkoi', { id: fl.id, from: isW ? 'wing' : 'tank', R: Math.round(slant), kill, tof: +tau.toFixed(2) });
      (fl.shots = fl.shots || []).push({ t: this.t, tof: tau, from: isW ? 'wing' : 'tank', kill });
      if (kill) { fl.phase = 'down'; fl.downAt = this.t + tau; fl.by = isW ? 'wing' : 'tank'; S.stat.bomberDown++; fl.u.drones--; this.ev(this.t + tau, 'bomber_down', { id: fl.id, by: fl.by, e: Math.round(fl.e), n: Math.round(fl.n) });
        this.say(this.t + tau, 'engine', null, `${isW ? 'Wingman: ' : ''}HKOI airburst destroys the bomber drone at ${Math.round(slant / 10) * 10} m.`, `burst ${fl.bursts}: about ${Math.round(pk * 100)}% (the engine's rule for drones; flight time ${tau.toFixed(1)} s)`); }
      else this.say(this.t + tau, 'engine', null, `${isW ? 'Wingman: ' : ''}HKOI airburst misses the bomber drone at ${Math.round(slant / 10) * 10} m${feint ? ': the pilot feinted' : ''}.`, `about ${Math.round(pk * 100)}% for this burst`);
    },
    _bomberStep(dt) {
      const S = this.sup, r = S.brng;
      for (const fl of S.flights) { if (fl.phase === 'gone') continue; const u = fl.u;
        if (fl.phase === 'down') { if (this.t >= fl.downAt) { fl.phase = 'gone'; this._bomberBack(fl, true); } continue; }
        let F = fl.tgt; if (!F.alive && fl.phase !== 'outbound') { const o = this._friends().find(x => x.alive); if (o) F = fl.tgt = o; else fl.phase = 'outbound'; }
        const to = fl.phase === 'outbound' ? u : F, dx = to.e - fl.e, dn = to.n - fl.n, d = Math.hypot(dx, dn);
        if (fl.phase === 'inbound') { if (d < 6) { fl.phase = 'over'; fl.overAt = this.t; fl.dropAt = this.t + BOMB.settle; } else { fl.hdg = brgOf(fl.e, fl.n, to.e, to.n); const st = Math.min(d, BOMB.v * dt); fl.e += dx / d * st; fl.n += dn / d * st; } }
        else if (fl.phase === 'over') {
          if (d > 2) { const st = Math.min(d, Math.max(BOMB.v, (F.v || 0) + 2) * dt); fl.e += dx / d * st; fl.n += dn / d * st; }   /* it keeps over a tank that moves */
          if (this.t >= fl.dropAt && fl.bombs > 0) { fl.bombs--; fl.dropAt = this.t + BOMB.gap; this._bombDrop(fl, F); }
          if (fl.bombs <= 0 && this.t >= fl.dropAt - BOMB.gap + 1) fl.phase = 'outbound';
        } else if (fl.phase === 'outbound') { if (d < 8 || !u.alive) { fl.phase = 'gone'; this._bomberBack(fl, false); continue; } fl.hdg = brgOf(fl.e, fl.n, to.e, to.n); const st = Math.min(d, BOMB.v * dt); fl.e += dx / d * st; fl.n += dn / d * st; }
        if (fl.phase !== 'gone' && fl.phase !== 'down') for (const X of this._friends()) { if (fl.phase === 'down') break; this._bomberHkoi(fl, X); }
      }
      void r;
    },
    _bomberBack(fl, lost) {
      const u = fl.u; u.ammo = Math.max(0, u.ammo - 1); if (!u.alive || u.gone) return; if (u.drones <= 0) { u.ammo = 0; u.state = 'spent'; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1} has lost its last drone.`, 'nothing left to fly'); return; }
      u.state = u.ammo > 0 ? 'hidden' : 'spent'; u.sight = 0; u.readyAt = this.t + u.spec.reload * (lost ? 0.6 : 1);   /* a fresh drone is ready sooner than one that has to come back and be rearmed (assumed) */
    },
    _bombDrop(fl, F) {
      const S = this.sup, r = S.brng, fall = Math.sqrt(2 * fl.alt / 9.81), moving = (F.v || 0) > 1.5, p = (BOMB.hit[this.skill] || 0.35) * (moving ? BOMB.moving : 1), hit = r.random() < p, isW = F === this.wing;
      const a = r.random() * 6.283, off = hit ? r.random() * 1.2 : 3.5 + r.random() * 9, B = { id: fl.id, t0: +this.t.toFixed(2), t1: +(this.t + fall).toFixed(2), e0: fl.e, n0: fl.n, alt: fl.alt, e1: F.e + Math.sin(a) * off, n1: F.n + Math.cos(a) * off, hit, target: isW ? 'wing' : 'tank', done: false, F, kd: r.random(), k2: r.random(), k3: r.random() };
      (this.bombs = this.bombs || []).push(B); S.stat.bombsDropped++; (S.falling = S.falling || []).push(B);
      this.ev(this.t, 'bomb_drop', { id: fl.id, land: B.t1, hit, target: B.target });
      this.say(this.t, 'enemy', fl.u.id, `Bomber drone over ${isW ? 'the wingman' : 'the vehicle'} drops a bomb.`, `about ${Math.round(p * 100)}% to hit a ${moving ? 'moving' : 'halted'} tank from ${Math.round(fl.alt)} m (assumed, ${this.skill} crew)`);
    },
    _bombLand(B) {
      const S = this.sup, F = B.F, isW = F === this.wing, who = isW ? 'Wingman' : 'The vehicle'; B.done = true;
      if (!B.hit || !F.alive) { if (F.alive) this.say(this.t, 'engine', null, `The bomb bursts on the ground ${Math.round(Math.hypot(B.e1 - F.e, B.n1 - F.n))} m from ${isW ? 'the wingman' : 'the vehicle'}.`, 'a miss'); return; }
      S.stat.bombHits++; const D = dmg(), killing = B.kd < (HK.THREATS.fpv.kill || 0.15), cfg0 = isW ? F.ctx.cfg0 : S.pCfg0 || this.cfg0;
      // the damage model reads the hit as a top attack of the FPV class; the campaign carry-over takes what it broke into the tank's state
      const rec = { threats: [{ idx: 900 + (this.bombs.indexOf(B) % 90), key: 'fpv', brg: (F.h + B.k2 * 360) % 360, cue: null, viz: { end: { t: 0, type: 'hit', killing } } }], bursts: [], aps: [], hits: 1, killed: killing, t_end: 0, ctx: { hull: F.h }, crew: null };
      const cfg = CAMP.applyState(JSON.parse(JSON.stringify(cfg0)), F.st); cfg.seed = this.seed * 1000 + 700 + this.bombs.indexOf(B); const rep = D ? D.report(rec, cfg) : [], h = rep[0] || null;
      F.st = CAMP.nextState(rec, cfg, F.st, { wave: true, gap_min: 0.5 }); (B.report = h);
      this.ev(this.t, 'bomb_hit', { id: B.id, zone: h ? h.zone : 'turret_roof', penetrated: h ? h.penetrated : true, killing, target: B.target });
      this.say(this.t, 'engine', null, `${who} is hit by a bomb from the drone: ${h ? h.zoneName + '. ' + h.effect : 'roof.'}`, `the engine's figure for this class of warhead: ${Math.round((HK.THREATS.fpv.kill || 0.15) * 100)}% to knock the tank out; plate and parts from the damage model`);
      const L = F.ai && F.ai.ldr; if (L && L.ok && L.up && B.k3 < 0.5) { L.ok = false; L.up = false; if (F.st.crew) F.st.crew.ldr = 'wounded'; this.ev(this.t, isW ? 'wing_loader_hit' : 'loader_hit', {}); this.say(this.t, isW ? 'wing' : 'tank', isW ? 'WING' : 'CDR', `${isW ? 'Wingman: ' : ''}Loader hit while up in his hatch.`, 'a hit on the vehicle with a man in the hatch (50%, the figure tankai.js uses)'); }
      if (h && this._fateHit) { if (isW) this._asWing(() => this._fateHit(F, h, this.t)); else this._fateHit(F, h, this.t); }
      if (killing) { S.stat.bombKills++; F.alive = false; F.killedBy = 'bomb';
        if (isW) { F.out = 'bomb'; this.say(this.t, 'wing', 'WING', 'Wingman: Vehicle destroyed.'); } else { this.ev(this.t, 'vehicle_lost', { by: 'bomb' }); this.say(this.t, 'result', null, 'Vehicle destroyed.'); } }
    },
    _bomberBusy() { const S = this.sup; return S.flights.some(f => f.phase === 'inbound' || f.phase === 'over') || !!(S.falling && S.falling.length); },
    bombers() { return this.sup ? this.sup.flights.filter(f => f.phase !== 'gone').map(f => ({ id: f.id, uid: f.u.id, e: f.e, n: f.n, alt: f.alt, hdg: f.hdg, phase: f.phase, bombs: f.bombs, target: f.tgt === this.wing ? 'wing' : 'tank' })) : []; },

    supReport() {
      const S = this.sup; if (!S) return { on: false };
      const G = this.wing, A = S.art, D = S.scout;
      return { on: true, stat: Object.assign({}, S.stat), wing: G ? { alive: G.alive, setup: G.setup, volleys: G.volleys.length, hits: G.volleys.reduce((s, v) => s + (v.rec.hits || 0), 0), fired: G.volleys.reduce((s, v) => s + v.rec.threats.length, 0), killedByTank: G.ctx.killedByTank || 0, killedByMg: G.ctx.killedByMg || 0, obs: G.st.obs, he: G.st.he, apsL: G.st.apsL, apsR: G.st.apsR, main: G.main, fate: G.fate ? G.fate.kind : 'ok', out: G.out || null } : null,
        art: A ? { left: A.left, missions: S.fires.length } : null, air: S.air ? { left: S.air.left, lost: S.air.lost, strikes: S.strikes.map(k => ({ kind: k.kind, state: k.state, kills: k.kills, by: k.by })) } : null, scout: D ? { alive: D.alive, found: D.found, lostHow: D.lostHow } : null };
    },
  };
  const P_ev = (b, t, type, o) => Object.getPrototypeOf(b).ev.call(b, t, type, o);   /* an event that keeps its own name whichever tank the battle is looking at */

  // forces of the setup screen that use the support (merged into the page's list like HKEnemyVeh.FORCES)
  const FORCES = {
    platoon_defence: { name: 'Platoon in the defence', note: 'You and a wingman hold against three Kornet, two Konkurs, two RPG teams and an FPV crew', support: { wingman: 'same' },
      force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 2 }, { type: 'fpv', n: 1 }] },
    section_attack: { name: 'Section attack', note: 'You, a wingman and a scout drone against two Kornet, two Konkurs, two RPG teams and a bomber drone crew', support: { wingman: 'same', scout: true },
      force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 2 }, { type: 'bomber', n: 1 }] },
    fire_support: { name: 'With fire support', note: 'Alone, with three artillery missions and a scout drone, against two Kornet, two Konkurs, a laser designator and an RPG team', support: { artillery: 3, scout: true },
      force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'rpg', n: 1 }] },
    bombers: { name: 'Bomber drones', note: 'Two bomber drone crews, a Konkurs team and an RPG team', force: [{ type: 'bomber', n: 2 }, { type: 'saclos', n: 1 }, { type: 'rpg', n: 1 }] },
  };

  function install(Battle, deps) {
    HK = deps.HK; CAMP = deps.CAMP; TEAMS = deps.TEAMS; SKILL = deps.SKILL; DEPS = deps; Object.assign(Battle.prototype, methods);
    // bombs in the air are part of the step even with no friendly support: wrap the support step so it lands them
    const step0 = Battle.prototype._supStep; Battle.prototype._supStep = function (dt) { step0.call(this, dt); const S = this.sup; if (S.falling && S.falling.length) S.falling = S.falling.filter(B => { if (this.t < B.t1) return true; this._bombLand(B); return false; }); };
    void TEAMS;
  }
  const api = { install, FORCES, WING, ART, SCOUT, BOMB, AIR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKSupport = api;
})(typeof window !== 'undefined' ? window : globalThis);
