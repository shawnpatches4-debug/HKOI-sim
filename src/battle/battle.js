// Battle layer: a time-stepped fight on a generated battlefield.
//
// This layer owns the map, where everything is, who can see whom, how the vehicle and the enemy move and what they decide.
// It does not re-implement the engagement physics. When the enemy fires a volley, the volley is handed to the engine
// (HK.runMission) as a set of launches with their true range and bearing; the engine resolves HKOI's fire control, the
// obscurant cloud, Trophy, crew stress and damage, and the result is carried into the next volley.
//
// Everything is deterministic from (map seed, battle seed).
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const brgOf = (e0, n0, e1, n1) => ((Math.atan2(e1 - e0, n1 - n0) / DEG) + 360) % 360;   // bearing from point 0 to point 1, clockwise from north
  const angDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

  // Enemy weapon teams. key = the engine's threat type. aim = seconds of steady sight needed before firing.
  // needsLos = the gunner must keep seeing the target until impact (the missile is lost if the target gets behind cover).
  const TEAMS = {
    kornet: { name: 'Kornet team', key: 'kornet', rmin: 2000, rmax: 5000, aim: 5, needsLos: true, ammo: 3, reload: 22, setup: 35, move: 2.2, agl: 1.1 },
    saclos: { name: 'Konkurs team', key: 'saclos', rmin: 100, rmax: 3800, aim: 5, needsLos: true, ammo: 3, reload: 26, setup: 40, move: 2.0, agl: 1.1 },
    rpg: { name: 'RPG team', key: 'rpg', rmin: 60, rmax: 420, aim: 2.5, needsLos: false, ammo: 4, reload: 9, setup: 6, move: 3.2, agl: 1.3 },
    sal: { name: 'Laser designator team', key: 'sal', rmin: 800, rmax: 6000, aim: 8, needsLos: true, ammo: 2, reload: 45, setup: 50, move: 2.0, agl: 1.4 },
    fpv: { name: 'FPV drone crew', key: 'fpv', rmin: 300, rmax: 4000, aim: 3, needsLos: false, indirect: true, ammo: 6, reload: 14, setup: 60, move: 2.2, agl: 1.2 },
    fpv_fiber: { name: 'Fibre FPV crew', key: 'fpv_fiber', rmin: 300, rmax: 7000, aim: 3, needsLos: false, indirect: true, ammo: 4, reload: 18, setup: 60, move: 2.2, agl: 1.2 },
  };
  // Enemy crew levels. aim = multiplier on the time to acquire and fire; open = longest the leader holds the opening ambush after the first
  // clean shot (s); coord = share of the teams he wants ready before opening, and how well shots are timed; misfire = chance per launch;
  // nerve = steadiness (low nerve: bolts after one shot); notice = chance of seeing the tank's gun turn onto the team; lost = how long a
  // team sits without a view of the vehicle before it moves to get one (s); scoot = chance it judges that its own launch has given it away and
  // moves after a single shot; jitter = how unsteadily a missile gunner holds his aim, in mrad (the old simulator used 3 for everyone, which
  // makes most long shots miss on their own; better crews are steadier: assumed 3 / 2 / 1 / 0.6); adapt = how far the force changes tactics once it sees missiles
  // beaten (0 never, 1 fires in pairs, 2 also times rockets and drones with missiles); breakAt = share of teams still able to fight at which
  // the force breaks contact; pilot = FPV pilot level handed to the engine. All assumed values.
  const SKILL = {
    green: { aim: 1.5, open: 15, coord: 0.3, misfire: 0.1, nerve: 0.5, notice: 0.35, lost: 30, scoot: 0.1, jitter: 3, adapt: 0, breakAt: 0.6, pilot: 'novice' },
    trained: { aim: 1.0, open: 25, coord: 0.7, misfire: 0.04, nerve: 0.75, notice: 0.6, lost: 15, scoot: 0.4, jitter: 2, adapt: 1, breakAt: 0.5, pilot: 'trained' },
    expert: { aim: 0.8, open: 35, coord: 0.95, misfire: 0.02, nerve: 0.9, notice: 0.8, lost: 10, scoot: 0.7, jitter: 1, adapt: 2, breakAt: 0.35, pilot: 'expert' },
    veteran: { aim: 0.7, open: 40, coord: 1.0, misfire: 0.01, nerve: 0.97, notice: 0.9, lost: 8, scoot: 0.85, jitter: 0.6, adapt: 2, breakAt: 0.25, pilot: 'expert' },
  };
  // seconds to pack up before a team can leave its position (assumed), and how far ahead a team that is about to have its shot joins an engagement
  const PACK = { kornet: 15, saclos: 15, rpg: 2, sal: 10, fpv: 8, fpv_fiber: 8 }, JOIN_WINDOW = 6;
  // A drone takes a minute or more to fly in. Its flight is not an engagement: the engine only takes over for the last DRONE_TERMINAL metres,
  // so nobody else has to hold fire while it is on its way (assumed hand-over range; HKOI's best meeting ranges are around this).
  const DRONE_TERMINAL = 900;
  const AREA = [[130, 0], [-130, 0], [0, 130], [0, -130]];   /* points around the vehicle's reported place, used to judge how much of its ground a firing point overlooks */

  function create(deps) {
    const HK = deps.HK, CAMP = deps.CAMP, WorldAPI = deps.World;

    class Battle {
      // opt: { world | { mapSeed, biome }, seed, cfg (engine settings), force: [{ type, n }], skill, tank: { e, n, hull }, dt }
      constructor(opt) {
        opt = opt || {};
        this.world = opt.world || new WorldAPI.World({ seed: opt.mapSeed == null ? 1 : opt.mapSeed, biome: opt.biome || 'farmland' });
        this.seed = opt.seed == null ? 1 : opt.seed;
        this.rng = new HK.RNG(HK.seedFor(this.seed, 9001));
        this.cfg0 = opt.cfg || HK.defaultConfig();
        this.lookup = opt.lookup || (this.cfg0.hkoi_enabled ? HK.meetLookup(this.cfg0) : {});
        /* the weather of the chosen conditions reaches the engine's cloud and sensor physics (rain washes the cloud out and brings wind, fog and falling snow cut what lasers and sensors see). Snow as haze is an assumption. */
        { const wx = ({ fog: 'fog', rain: 'rain', snow: 'haze' })[opt.cond]; if (wx && this.cfg0.env && this.cfg0.env.weather !== wx) { this.cfg0 = JSON.parse(JSON.stringify(this.cfg0)); this.cfg0.env.weather = wx; this.lookup = this.cfg0.hkoi_enabled ? HK.meetLookup(this.cfg0) : {}; } }
        this.skill = SKILL[opt.skill] ? opt.skill : 'trained'; this.cond = opt.cond || 'day';
        this.dt = opt.dt || 0.1;
        this.crewOpt = { on: opt.crewStress !== false, quality: opt.crewQuality };   /* crew.js: the tank crew's stress model (crewStress: false switches it off; crewQuality: green, trained, expert or veteran) */
        this.t = 0;
        this.log = [];          // { t, kind, who, text, why }
        this.volleys = [];      // resolved volleys, each with the engine's record
        this.pending = null;    // a volley being assembled by the enemy commander
        const tk = opt.tank || {};
        this.tank = {
          e: tk.e || 0, n: tk.n || 0, h: tk.hull == null ? 0 : tk.hull, v: 0, alive: true, main: 10, mainReady: 0, coax: 2400, m2: 600,
          home: { e: tk.e || 0, n: tk.n || 0 }, route: null, goal: null, mode: 'overwatch', modeSince: 0,
          st: CAMP.fresh(this.cfg0), known: [],   // known = enemy positions the crew has located: { id, e, n, t }
        };
        this.mission = ['hold', 'advance', 'hunt'].includes(opt.mission) ? opt.mission : 'hold';
        this.raid = opt.raid || null;   /* { minR, window }: the old simulator's kind of raid: launchers no closer than minR metres, shots spread over window seconds */
        // Advance: the objective lies 2 km ahead of the hull (assumed), pulled in to the nearest ground a tank can stand on inside the map
        if (this.mission === 'advance') { const W = this.world, T = this.tank, a = T.h * DEG; let o = null; for (let R = 2000; R >= 600 && !o; R -= 100) { const e = T.e + Math.sin(a) * R, n = T.n + Math.cos(a) * R; if (W.inside(e, n) && W.passable(e, n, true)) o = { e, n }; } this.objective = o || { e: T.e, n: T.n + 600 }; }
        this.units = [];
        // The enemy comes in waves with lulls between them (opt.waves = how many: 1 is a single ambush). The first wave is the force as chosen;
        // later waves are built from it (see _waveForce) and come from another direction once the wave before has been beaten.
        const force0 = opt.force || [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }];
        this.force0 = force0; this.nWaves = Math.max(1, Math.min(6, opt.waves | 0 || 1)); this.wave = 0; this.waveAt = null; this.waveFrom = 0;
        if (this.mission === 'hold' && !opt.tank && this._pickStart) this._pickStart();
        this._place(this._waveForce(0));
        this.say(0, 'setup', null, `Battle on ${this.world.biome.name}, map seed ${this.world.seed}. ${this.units.length} enemy teams in position.`);
      }

      // Events, for anything that wants to follow the fight without reading sentences (film director, captions, voices, debrief):
      // { t, type, ... }. Engagements are worked out when they start, so events can lie a few seconds in the FUTURE: a camera can be in
      // place before the thing happens. Types: ambush, launch, drone_launch, hkoi_fire, trophy, end (a threat's end: by = what ended it,
      // killing), gun (main gun shot: hit), team_lost, located, move, wave, lull, loader_hit, vehicle_lost, over.
      ev(t, type, o) { (this.events = this.events || []).push(Object.assign({ t: +t.toFixed(2), type }, o || {})); }
      say(t, kind, who, text, why) { this.log.push({ t: +t.toFixed(2), kind, who, text, why: why || null }); }

      // ---------------------------------------------------------------- setting up the enemy
      // Each team gets a primary firing position and two alternates, chosen for a clear shot at where the vehicle starts,
      // concealment, and a covered way out. Teams are spread so one burst of return fire cannot catch two.
      // what each wave brings. Wave 1 as chosen. Later waves vary it so the fight changes character: a stand-off wave of missile teams from
      // far out (the case HKOI is built for), a close wave with extra rocket teams, a wave with drones timed in. (Assumed pattern.)
      _waveForce(i) {
        const base = this.force0.map(f => ({ type: f.type, n: f.n })); if (i === 0) return base;
        const count = t => base.filter(f => f.type === t).reduce((n, f) => n + f.n, 0), kind = (i - 1) % 3;
        if (kind === 0) return [{ type: 'kornet', n: Math.max(2, count('kornet')) }, { type: 'saclos', n: Math.max(1, count('saclos')) }];
        if (kind === 1) return base.concat([{ type: 'rpg', n: 2 }]);
        return base.concat([{ type: 'fpv', n: 1 + (i > 3 ? 1 : 0) }]);
      }
      // the lull is over: the next wave moves into position on another side of the vehicle and sets up
      _nextWave() {
        const T = this.tank, n0 = this.units.length; this.wave++; this.waveFrom = n0; this.waveT0 = this.t; this.ev(this.t, 'wave', { wave: this.wave }); this.opened = false; this.openedAt = null; this._waitSince = null; this.tactic = this.tactic || null;
        const side = (this.waveBrg == null ? this.rng.random() * 360 : this.waveBrg + 100 + this.rng.random() * 160) % 360; this.waveBrg = side;
        const kind = (this.wave - 1) % 3; this._waveRaid = kind === 0 ? { minR: 1500, window: 6 } : null;
        this._place(this._waveForce(this.wave), side);
        for (let i = n0; i < this.units.length; i++) { const u = this.units[i]; u.state = 'setup'; u.since = this.t - u.spec.setup * 0.5; u.wave = this.wave; }   /* they have just arrived: half their set-up still to do */
        for (const k of T.known) k.done = true; this.belief = { e: T.e, n: T.n, t: this.t };
        this.say(this.t, 'enemy', null, `A new enemy group moves in from the ${['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(side / 45) % 8]}: wave ${this.wave + 1} of ${this.nWaves}, ${this.units.length - n0} teams.`, kind === 0 ? 'missile teams standing off at long range' : kind === 1 ? 'a close assault with extra rocket teams' : 'missile teams with drones');
      }
      _place(force, side) {
        // Where the ambush is laid: around the vehicle, or along its route on an advance. Every team asked for is placed: first on ground
        // that looks onto one of those points, and if the country is too close for that (thick forest), in concealment within reach of it,
        // from where the team will have to move to get its shot.
        const W = this.world, T0 = this.tank, O = this.objective, taken = this.units.filter(u => u.alive && !u.gone).map(u => ({ e: u.e, n: u.n })), r = this.rng, raid = side == null ? this.raid : this._waveRaid;
        const anchors = O && side == null ? [0.5, 0.35, 0.65, 0.2, 0.8, 1].map(f => ({ e: T0.e + (O.e - T0.e) * f, n: T0.n + (O.n - T0.n) * f })) : [{ e: T0.e, n: T0.n }];
        const inSide = s => side == null || Math.abs(angDiff(brgOf(T0.e, T0.n, s.e, s.n), side)) < 75;   /* a later wave comes from one side */
        const apart = (s, d) => taken.every(q => Math.hypot(q.e - s.e, q.n - s.n) > d);
        const concealed = (spec, A) => { const out = [], lo = Math.max(spec.rmin * 1.3, spec.indirect ? 900 : 80, raid && spec.key !== 'rpg' ? raid.minR * 0.5 : 0), hi = Math.max(lo + 100, Math.min(spec.rmax * 0.8, 2200)); for (let q = 0; q < 300 && out.length < 8; q++) { const a = r.random() * 6.283, d = lo + r.random() * (hi - lo), e = A.e + Math.sin(a) * d, n = A.n + Math.cos(a) * d; if (!W.inside(e, n) || !W.passable(e, n, false)) continue; if (q < 200 && W.veg(e, n).cls < 2) continue; out.push({ e, n, d, score: 0 }); } return out; };
        for (const f of force) {
          const spec = TEAMS[f.type]; if (!spec) continue;
          let pool = []; if (spec.indirect) pool = this._hiddenSites(spec).filter(inSide);
          else for (const far of (raid && spec.key !== 'rpg' ? [raid.minR, raid.minR * 0.75, raid.minR * 0.5, 0] : [0])) { if (pool.length >= 4) break; for (const A of anchors) { pool = pool.concat(W.ambushSites(A.e, A.n, { rmin: Math.max(spec.rmin * 1.3, far), rmax: Math.min(spec.rmax * 0.8, 3800), agl: spec.agl, salt: this.seed * 13 + this.units.length + pool.length })); if (pool.length >= 12) break; } }   /* a stand-off group that finds no firing point that far out comes closer in steps rather than giving up its sight line */
          if (side != null) { const p2 = pool.filter(inSide); if (p2.length) pool = p2; }
          for (let k = 0; k < (f.n || 1); k++) {
            let pick = pool.find(s => apart(s, 350)) || pool.find(s => apart(s, 200)) || pool.find(s => apart(s, 120));
            if (!pick) { let extra = concealed(spec, anchors[k % anchors.length]); if (side != null) { const e2 = extra.filter(inSide); if (e2.length) extra = e2; } pick = extra.find(s => apart(s, 200)) || extra.find(s => apart(s, 80)) || extra[0]; if (pick) pool = pool.concat(extra); }
            if (!pick) continue;
            taken.push(pick);
            const alts = pool.filter(s => { const d = Math.hypot(s.e - pick.e, s.n - pick.n); return d > 120 && d < 700; }).slice(0, 2);
            this.units.push({
              id: this.units.length, type: f.type, spec, e: pick.e, n: pick.n, sites: [pick].concat(alts), site: 0,
              state: 'hidden', since: 0, ammo: spec.ammo, readyAt: 0, sight: 0, lastSeen: null, alive: true, known: false, fired: 0, path: null, suppressedUntil: 0,
            });
          }
        }
        if (side == null) this.belief = { e: T0.e, n: T0.n, t: 0 };   /* the ambush was laid for this vehicle: the enemy starts out knowing roughly where it is */
      }
      // positions for crews that do not need to see the target themselves: out of sight of the vehicle, in concealment
      _hiddenSites(spec) {
        const W = this.world, T = this.tank, out = [], r = this.rng;
        for (let q = 0; q < 400 && out.length < 12; q++) {
          const a = r.random() * 6.283, d = 1200 + r.random() * 2200, e = T.e + Math.sin(a) * d, n = T.n + Math.cos(a) * d;
          if (!W.inside(e, n) || !W.passable(e, n, false)) continue;
          if (W.los(e, n, spec.agl, T.e, T.n, 2.2).clear) continue;
          out.push({ e, n, d, score: 1 });
        }
        return out;
      }

      // ---------------------------------------------------------------- one step of the fight
      step() {
        if (this._pending) { const f = this._pending; this._pending = null; f(); this._finishVolleys(); return; }
        const dt = this.dt; this.t += dt;
        if (!this.tank.alive) return;
        this._crewStep(dt);   /* crew.js: the crew's stress moves on one step */
        this._moveTank(dt);
        for (const u of this.units) this._unit(u, dt);
        this._commander();
        this._morale();
        if (this._locQ && this._locQ.length) this._locQ = this._locQ.filter(q => { if (this.t < q.t) return true; const u = q.u, T = this.tank; if (u.alive && !u.gone && !u.known) { u.known = true; if (!T.known.some(k => k.id === u.id)) T.known.push({ id: u.id, e: u.e, n: u.n, t: this.t }); this.ev(this.t, 'located', { uid: u.id }); this.say(this.t, 'tank', 'CDR', `${u.spec.name} #${u.id + 1} located at ${Math.round(Math.hypot(u.e - T.e, u.n - T.n) / 10) * 10} m.`, q.how); } return false; });
        this._finishVolleys();
        this._returnFire();
        this._machineGuns();
      }
      run(seconds) { const end = this.t + seconds - 1e-6; while (this.t < end && this.tank.alive) this.step(); return this; }

      // ---------------------------------------------------------------- the vehicle
      tankAt(t) {   // where the vehicle is at battle time t, following the volley it is in (the engine fixed its path when the volley was resolved)
        const v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null;
        if (v && t >= v.t0 && t <= v.tEnd && v.path) { const x = clamp((t - v.t0 - v.path[0][0]) / 0.1, 0, v.path.length - 1), i = Math.min(v.path.length - 2, Math.floor(x)), f = x - i, p = v.path[Math.max(0, i)], q = v.path[Math.min(v.path.length - 1, i + 1)], dh = ((q[3] - p[3] + 540) % 360) - 180; return { e: v.at.e + p[1] + (q[1] - p[1]) * f, n: v.at.n + p[2] + (q[2] - p[2]) * f, h: (p[3] + dh * f + 360) % 360, v: p[4] + (q[4] - p[4]) * f }; }   // between samples, so drawing is smooth
        return { e: this.tank.e, n: this.tank.n, h: this.tank.h, v: this.tank.v };
      }
      _moveTank(dt) {
        const T = this.tank, v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null;
        if (v && this.t <= v.tEnd) { const p = this.tankAt(this.t); T.e = p.e; T.n = p.n; T.h = p.h; T.v = p.v; return; }   // inside a volley: follow its path
        // between volleys: after a quiet spell in cover, come back up to the overwatch position (the berm drill)
        // between volleys the commander looks for a better place to fight from (see _hullDown) rather than going back to where he was seen
        if (v && v.done && T.alive && !T.goal && T.searched !== v.i && this.t > v.tEnd + (T.mode === 'cover' ? 30 : 5)) this._hullDown(v);
        if (T.goal) {
          const dx = T.goal.e - T.e, dn = T.goal.n - T.n, d = Math.hypot(dx, dn);
          if (d < 2) { T.goal = null; T.v = 0; if (T.mode === 'returning' || T.mode === 'moving') { T.mode = 'overwatch'; T.modeSince = this.t; if (T.goalFace != null) T.h = T.goalFace; } }
          else { const want = brgOf(T.e, T.n, T.goal.e, T.goal.n), dh = angDiff(want, T.h); T.h = (T.h + clamp(dh, -35 * dt, 35 * dt) + 360) % 360; const vmax = Math.abs(dh) > 50 ? 2 : Math.min(9, 1 + d * 0.5); T.v += clamp(vmax - T.v, -4 * dt, 2.4 * dt); T.e += Math.sin(T.h * DEG) * T.v * dt; T.n += Math.cos(T.h * DEG) * T.v * dt; }
        }
      }
      // The driver's plan for a volley: hold until the first warning plus a reaction time, then make for the nearest ground that
      // hides the vehicle from where the warnings point. Returns the path the engine will use: [[t, east, north, heading, speed], ...]
      _drivePlan(at, warnT, observers, tEnd, firstImpact, holdForHkoi) {
        const W = this.world, path = [], T0 = -3, PDT = 0.1; let e = 0, n = 0, h = at.h, v = at.v || 0, goal = null, reached = false;
        const react = warnT == null ? 1e9 : warnT + 1.6 + (this.tank.st.fatigue || 0) * 2 + this._crewAdd('react', 1.6);   /* crew.js: stress slows the order and the driver */
        let cover = null;
        if (warnT != null && observers.length) { const c = W.coverFrom(at.e, at.n, observers, { radius: 260, step: 24 }).filter(q => this._drivable(at.e, at.n, q.e, q.n)); cover = c.length ? c[0] : null;
          // Go only for cover that hides the hull from every firer AND can be reached before the first missile arrives. Otherwise hold still:
          // HKOI gets a long clean engagement and Trophy's good side stays toward the threat (Shawn's decision 9).
          // HKOI builds its cloud on the line between the launcher and the vehicle. If the vehicle drives off that line the cloud is in the wrong
          // place: measured in the engine, one Kornet from 2,500 m is stopped by HKOI 43% of the time from the halt and 4% if the vehicle dashes.
          // So when HKOI can do its work the commander keeps still and lets it.
          if (cover && holdForHkoi) { this._holdWhy = 'HKOI can blind this missile only if the vehicle keeps still'; cover = null; }
          else if (cover && firstImpact != null && (!cover.all || react + 2 + cover.d / 5 > firstImpact)) { this._holdWhy = cover.all ? 'cover is too far to reach before impact' : 'no cover in reach hides the hull from every firer'; cover = null; } else this._holdWhy = null; }
        for (let t = T0; t <= tEnd + 8; t += PDT) {
          if (!goal && cover && t >= react) goal = { e: cover.e - at.e, n: cover.n - at.n };
          if (goal && !reached) {
            const dx = goal.e - e, dn = goal.n - n, d = Math.hypot(dx, dn);
            if (d < 1.5) { reached = true; v = 0; }
            else { const want = (Math.atan2(dx, dn) / DEG + 360) % 360, rev = Math.abs(angDiff(want, h)) > 110 && d < 60, face = rev ? (want + 180) % 360 : want, dh = angDiff(face, h); h = (h + clamp(dh, -40 * PDT, 40 * PDT) + 360) % 360; const vmax = Math.abs(dh) > 50 ? 1.5 : Math.min(rev ? 6 : 11, 1.2 + d * 0.6), tgt = rev ? -vmax : vmax; v += clamp(tgt - v, -4 * PDT, 2.6 * PDT); e += Math.sin(h * DEG) * v * PDT; n += Math.cos(h * DEG) * v * PDT; }
          }
          path.push([+t.toFixed(2), +e.toFixed(2), +n.toFixed(2), +h.toFixed(1), +v.toFixed(2)]);
        }
        return { path, cover, react: cover ? react : null, reachT: reached ? path.find(p => Math.hypot(p[1] - goal.e, p[2] - goal.n) < 1.6)[0] : null };
      }
      _drivable(e0, n0, e1, n1) { const d = Math.hypot(e1 - e0, n1 - n0), steps = Math.ceil(d / 12); for (let s = 1; s <= steps; s++) if (!this.world.passable(e0 + (e1 - e0) * s / steps, n0 + (n1 - n0) * s / steps, true)) return false; return true; }

      // ---------------------------------------------------------------- enemy teams
      _unit(u, dt) {
        if (!u.alive || u.gone) return;
        const W = this.world, T = this.tank, S = SKILL[this.skill], sp = u.spec;
        if (u.state === 'moving') {   // displacing to the next prepared position
          if (this.t < (u.packUntil || 0)) { u.spd = 0; return; }   /* still packing up: the team has not left yet */
          // moving to get a shot, and here is one: stop and set up on the spot rather than walk on to the planned place
          if (u.seek && !sp.indirect && this.t >= (u.seekAt || 0)) { u.seekAt = this.t + 1; const R0 = Math.hypot(T.e - u.e, T.n - u.n);
            if (R0 >= sp.rmin && R0 <= sp.rmax * (sp.key === 'rpg' ? 0.75 : 1) && this.t - u.since > (PACK[sp.key] || 8) + 6 && (sp.key === 'rpg' || W.veg(u.e, u.n).cls >= 2) && W.los(u.e, u.n, sp.agl, T.e, T.n, 2.2).clear && W.defilade(u.e, u.n, sp.agl, T.e, T.n) !== 'full') {
              u.state = 'setup'; u.since = this.t; u.route = null; u.spd = 0; u.sites.push({ e: u.e, n: u.n }); u.site = u.sites.length - 1; this.say(this.t, 'enemy', u.id, `${sp.name} #${u.id + 1} stops short: it has a shot at the vehicle from here.`, 'no point walking on to the planned spot'); return; } }
          // follow the chosen route one corner at a time. In the open and in the vehicle's view the team runs; in cover it walks.
          const goal = u.sites[u.site], wp = u.route && u.route[u.routeI] ? u.route[u.routeI] : [goal.e, goal.n], dx = wp[0] - u.e, dn = wp[1] - u.n, d = Math.hypot(dx, dn), R = Math.hypot(T.e - u.e, T.n - u.n);
          const cover = W.veg(u.e, u.n).cls >= 2, inView = T.alive && R < 2500 && W.los(T.e, T.n, 2.6, u.e, u.n, 1.2).clear; u.inView = inView; u.gait = inView && !cover ? 'run' : 'walk'; u.spd = sp.move * (u.gait === 'run' ? 1.6 : 1);
          if (d < 3) { if (u.route && u.routeI < u.route.length - 1) u.routeI++; else { u.state = 'setup'; u.since = this.t; u.route = null; u.spd = 0; if (!inView) u.known = false; } }
          else { u.hdg = (Math.atan2(dx, dn) / DEG + 360) % 360; u.e += dx / d * u.spd * dt; u.n += dn / d * u.spd * dt; }
          // a team on the move can be seen: the crew is scanning with thermal sights, and movement in the open at short range rarely goes unnoticed
          if (inView) { const pSee = (cover ? 0.05 : 0.3) * Math.exp(-R / 800) * dt; if (!u.known && this.rng.random() < pSee) { u.known = true; this.say(this.t, 'tank', 'CDR', `Crew spots movement: ${sp.name} #${u.id + 1} ${cover ? 'in cover' : 'crossing open ground'} at ${Math.round(R / 10) * 10} m.`, 'a team in the vehicle\'s view while moving'); }
            if (u.known) { let k = T.known.find(q => q.id === u.id); if (!k) { k = { id: u.id, e: u.e, n: u.n, t: this.t }; T.known.push(k); } k.e = u.e; k.n = u.n; k.t = this.t; k.done = false; } }
          return;
        }
        if (u.state === 'setup') { if (this.t - u.since > sp.setup * (u.setupK || 1)) { u.state = 'hidden'; u.since = this.t; u.sight = 0; } return; }
        if (u.state === 'guiding' || u.state === 'firing') return;
        // under fire: flat on the ground. When the fire lifts, a team that knows it has been found does not stay there.
        const pinned = this.t < (u.suppressedUntil || 0); if (pinned) { u.down = true; u.wasPinned = true; } else if (u.down) { u.down = false; if (u.wasPinned && u.known && u.state === 'hidden') { u.wasPinned = false; if (this._displace(u, 'pinned by fire and located: staying means being hit')) return; } u.wasPinned = false; }
        if (u.ammo <= 0) { u.state = 'spent'; return; }
        // watching: does this team have a shot right now?
        const d = Math.hypot(T.e - u.e, T.n - u.n);
        let seen = sp.indirect ? this._spotted() : (d >= sp.rmin && d <= sp.rmax && W.los(u.e, u.n, sp.agl, T.e, T.n, 2.2).clear);
        // Crews that know their trade do not waste a missile on a sliver of turret showing over a crest: the vehicle only has to roll back a
        // metre to break the guidance. They hold fire until more of it shows (checked twice a second), and move if it never does.
        if (seen && !sp.indirect && S.adapt >= 2 && sp.needsLos) { if (this.t >= (u.defAt || 0)) { u.defAt = this.t + 0.5; const sl = W.defilade(u.e, u.n, sp.agl, T.e, T.n) === 'full'; if (sl && !u.sliver) u.sliverSince = this.t; u.sliver = sl; } if (u.sliver && this.t - u.sliverSince < 10) seen = false; else u.sliver = false; } else u.sliver = false;   /* at most ten seconds: after that a poor shot is better than none */
        u.sight = seen ? u.sight + dt * (this.t < (u.lightUntil || 0) ? 0.5 : 1) : 0;   /* harassing fire slows the lay */
        u.hasShot = seen && this.t >= u.readyAt && this.t >= u.suppressedUntil && u.sight >= sp.aim * S.aim;
        if (seen) { u.lastSeen = this.t; if (!sp.indirect) { const B = this.belief || (this.belief = {}); B.e = T.e; B.n = T.n; B.t = this.t; } }   /* reported on the radio net: where the vehicle was last seen */
        // A direct-fire team that has lost its view of the vehicle does not sit blind for ever. After a wait (shorter for green crews, who
        // fidget; longer for experts, who expect the vehicle to come back up) it moves to whichever of its prepared positions looks onto
        // where the vehicle now is, provided someone on its side can see the vehicle to tell it so.
        if (!sp.indirect && !seen && u.state === 'hidden' && this.t - Math.max(u.lastSeen || 0, u.since) > (sp.key === 'rpg' ? Math.min(S.lost, 12) : S.lost) && this.t >= (u.nextLook || 0)) {
          u.nextLook = this.t + 10; const B = this.belief; if (!B) return;
          // Move only for a reason. If this spot looks onto where the vehicle was last reported, stay and watch: it has to come out again.
          // If the report is newer than our arrival and we cannot see that place from here, move. With no news at all, try another angle after a long wait.
          const R = Math.hypot(B.e - u.e, B.n - u.n), covers = R >= sp.rmin && R <= sp.rmax && W.los(u.e, u.n, sp.agl, B.e, B.n, 2.2).clear, fresh = B.t > u.since, stale = this.t - Math.max(u.lastSeen || 0, u.since) > 90 + S.lost * 2;
          const pressing = this.pressing;   /* nothing fired for a while: stop waiting, go and find a shot */
          if (covers && !stale && !pressing) { u.watching = true; return; }
          if (sp.key === 'rpg') { u.watching = false; this._stalk(u); return; }   /* a rocket team has to get close: it works its way in through cover */
          const never = u.lastSeen == null;   /* placed without a view (close country): it has to move to get a shot at all */
          if (!fresh && !stale && !never && !pressing) return;
          u.watching = false; this._displace(u, fresh ? (this._spotted() ? 'cannot see the vehicle from here; another team reports where it is' : `cannot see where the vehicle was last reported ${Math.round(this.t - B.t)} s ago`) : 'long wait with no sight of the vehicle: trying another angle');
        }
      }
      // Where to go next, and how to get there. Candidates are the team's own prepared positions plus other good firing points near it.
      // A site scores for seeing the vehicle from within range, for concealment, for being well away from anywhere the vehicle has located,
      // and against the distance to walk. The route prefers vegetation and ground the vehicle cannot see.
      _displace(u, why, text, cand) {
        if (!u.alive || u.gone) return false;
        const W = this.world, T = this.tank, sp = u.spec, Bv = this.belief || T; if (u.ammo <= 0) { u.state = 'spent'; return false; }
        if (u.state === 'moving') return true;   /* already packing up or on the way: one decision at a time */
        // other firing points near the team: ground within 450 m of it that looks onto where the vehicle is believed to be, from inside the weapon's reach
        const near = []; if (!sp.indirect && !cand) for (let de = -450; de <= 450; de += 75) for (let dn = -450; dn <= 450; dn += 75) { const e = u.e + de + (this.rng.random() - 0.5) * 40, n = u.n + dn + (this.rng.random() - 0.5) * 40, dm = Math.hypot(e - u.e, n - u.n); if (dm < 60 || dm > 450 || !W.inside(e, n)) continue; const R = Math.hypot(Bv.e - e, Bv.n - n); if (R < sp.rmin * 1.2 || R > Math.min(sp.rmax * 0.85, 3800)) continue; if (W.veg(e, n).cls < 2 && this.rng.random() < 0.6) continue; if (W.los(e, n, sp.agl, Bv.e, Bv.n, 2.2).clear) near.push({ e, n }); if (near.length >= 10) break; }
        const cands = u.sites.filter((q, j) => j !== u.site).concat(near), located = T.known.filter(k => !k.done || this.t - k.t < 120); let best = cand ? { c: cand, score: 9, sees: !!cand.sees, dMe: Math.hypot(cand.e - u.e, cand.n - u.n) } : null;
        if (!cand) for (const c of cands) { const dMe = Math.hypot(c.e - u.e, c.n - u.n); if (dMe < 60 || dMe > 600 || !W.passable(c.e, c.n, false)) continue; const R = Math.hypot(Bv.e - c.e, Bv.n - c.n), inRange = R >= sp.rmin && R <= sp.rmax, sees = sp.indirect ? false : inRange && W.los(c.e, c.n, sp.agl, Bv.e, Bv.n, 2.2).clear;
          let area = 0; if (inRange && !sp.indirect) for (const [de, dn] of AREA) if (W.los(c.e, c.n, sp.agl, Bv.e + de, Bv.n + dn, 2.2).clear) area++;   /* the vehicle shifts about: a site that overlooks the ground around it keeps its shot */
          const hot = located.length ? Math.min(...located.map(k => Math.hypot(k.e - c.e, k.n - c.n))) : 1e9, veg = W.veg(c.e, c.n).cls, score = (sees ? 2 : sp.indirect ? 1 : 0) + area * 0.5 + (veg >= 3 ? 1 : veg === 2 ? 0.5 : 0) + (hot > 150 ? 1 : hot > 80 ? 0 : -3) - dMe / 250 + this.rng.random() * 0.4;
          if (!best || score > best.score) best = { c, score, sees, dMe }; }
        if (!best) { u.state = 'hidden'; u.sight = 0; return false; }
        const memo = new Map(), seenCost = (e, n) => { const key = Math.round(e / 30) * 100003 + Math.round(n / 30); let x = memo.get(key); if (x == null) { const v = W.veg(e, n).cls, R = Math.hypot(T.e - e, T.n - n); x = (v >= 4 ? 0 : v >= 2 ? 0.15 : 0.6) + (R < 2500 && W.los(T.e, T.n, 2.6, e, n, 1.2).clear ? 2.5 : 0); memo.set(key, x); } return x; };   /* each square is looked at once */
        const route = W.path(u.e, u.n, best.c.e, best.c.n, { grid: 30, tank: false, cost: seenCost });
        let j = u.sites.indexOf(best.c); if (j < 0) { u.sites.push(best.c); j = u.sites.length - 1; }
        u.site = j; u.route = route && route.length > 1 ? route.slice(1) : null; u.routeI = 0; u.state = 'moving'; u.since = this.t; u.down = false; { const hop = best.dMe < 150, prepared = u.sites.indexOf(best.c) >= 0 && u.sites.indexOf(best.c) < 3; this.ev(this.t, 'move', { uid: u.id, to: [Math.round(best.c.e), Math.round(best.c.n)] }); u.packUntil = this.t + (PACK[sp.key] || 8) * (hop ? 0.4 : 1); u.setupK = hop ? 0.4 : prepared ? 0.6 : 1; }   /* a short hop is carried assembled; a prepared alternate needs less setting up (assumed) */ u.moveWhy = why; u.shotsHere = 0; u.spd = 0; u.seek = !/gun turning|landed beside|gave the position away|nerves|two shots|pinned/.test(why || '');
        this.say(this.t, 'enemy', u.id, text || `${sp.name} #${u.id + 1} moves ${Math.round(best.dMe / 10) * 10} m to ${best.sees ? 'a position that looks onto the vehicle' : 'a covered position'}${route ? ', keeping to cover' : ''}.`, why); return true;
      }
      // A rocket team closes on the vehicle: a spot 150 to 300 m from where it was last reported, in cover, with a view of it, on its
      // flank or rear for crews good enough to think of that, reached by a route out of the vehicle's sight.
      _stalk(u) {
        const W = this.world, T = this.tank, B = this.belief || T, S = SKILL[this.skill]; let best = null;
        for (let a = 0; a < 360; a += 30) for (const r of [150, 220, 300]) { const e = B.e + Math.sin(a * DEG) * r, n = B.n + Math.cos(a * DEG) * r; if (!W.inside(e, n) || !W.passable(e, n, false)) continue;
          const veg = W.veg(e, n).cls, sees = W.los(e, n, u.spec.agl, B.e, B.n, 2.2).clear, rel = Math.abs(angDiff(a, T.h)), side = S.coord > 0.6 ? (rel > 135 ? 1.2 : rel > 60 ? 0.8 : 0) : 0;
          const score = (sees ? 2 : 0) + (veg >= 3 ? 1.5 : veg === 2 ? 0.7 : 0) + side - Math.hypot(e - u.e, n - u.n) / 300 - (W.los(T.e, T.n, 2.6, e, n, 1.2).clear && veg < 3 ? 0.8 : 0) + this.rng.random() * 0.3;
          if (!best || score > best.score) best = { e, n, score, sees, rel }; }
        if (!best || Math.hypot(best.e - u.e, best.n - u.n) < 25) { u.nextLook = this.t + 15; return false; }
        return this._displace(u, `closing in for a ${best.rel > 135 ? 'rear' : best.rel > 60 ? 'flank' : 'close'} shot`, `${u.spec.name} #${u.id + 1} works its way ${Math.round(Math.hypot(best.e - u.e, best.n - u.n) / 10) * 10} m through cover toward the vehicle's ${best.rel > 135 ? 'rear' : best.rel > 60 ? 'flank' : 'front'}.`, best);
      }
      // Morale. A team with nothing left to fire pulls out. When too few teams can still fight (how few depends on the crews), the whole
      // force breaks contact and the battle is over.
      _morale() {
        if (this.over || this.t < (this._moraleAt || 0)) return; this._moraleAt = this.t + 1; const S = SKILL[this.skill];
        for (const u of this.units) if (u.alive && !u.gone && (u.state === 'spent' || u.ammo <= 0) && u.state !== 'guiding' && u.state !== 'firing') { if (u.spentAt == null) u.spentAt = this.t; if (this.t - u.spentAt > (PACK[u.spec.key] || 8)) { u.gone = true; u.known = false; const k = this.tank.known.find(q => q.id === u.id); if (k) k.done = true; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1} is out of ammunition and pulls back.`, 'nothing left to fire'); } }
        // this wave: its teams still able to fight, out of those it brought
        const mine = this.units.filter(u => (u.wave || 0) === this.wave), able = mine.filter(u => u.alive && !u.gone && u.ammo > 0), n = mine.length, last = this.wave >= this.nWaves - 1;
        if (this.waveAt != null) {   /* a lull: the next wave is on its way */
          if (this.t >= this.waveAt && !this._volleyActive() && !this._pending && this.tank.alive) { this.waveAt = null; this._nextWave(); } return; }
        if (this._volleyActive() || this._pending) return;
        // a later wave that never gets a shot does not hang about for ever
        // stalemate: how long since this group last got a missile, rocket or drone away (or since it arrived). After 90 s its teams press in for a shot;
        // after 300 s it gives the attempt up.
        const lastShot = Math.max(this.waveT0 || 0, ...mine.map(u => u.lastShotT || 0)), quietFor = this.t - lastShot; this.pressing = quietFor > 90;
        const stuck = quietFor > 300;
        let done = null;
        if (able.length === 0) done = 'No team of this group is left able to fight.';
        else if (stuck || this.opened && able.length / n <= S.breakAt && able.length < n) { for (const u of able) { u.gone = true; u.known = false; } for (const k of this.tank.known) k.done = true; done = stuck ? 'The group could not get a shot and pulls back.' : `Enemy breaks contact: ${able.length} of ${n} teams still able to fight, and they pull out.`; }
        if (!done) return;
        if (last) { this.say(this.t, 'enemy', null, done, `${this.skill} crews give up at this point`); this.ev(this.t, 'over', { result: 'won' }); this.over = { result: 'won', text: this.nWaves > 1 ? `All ${this.nWaves} enemy groups were beaten off.` : 'The enemy broke contact.' }; return; }
        const lull = 35 + this.rng.random() * 30; this.waveAt = this.t + lull; this.ev(this.t, 'lull', { wave: this.wave, until: +(this.t + lull).toFixed(1) });
        this.say(this.t, 'enemy', null, `${done} A lull: about ${Math.round(lull / 5) * 5} s before the next group can be in position.`, `wave ${this.wave + 1} of ${this.nWaves} is over`);
      }
      // can anyone on the enemy side see the vehicle (so that crews firing over a hill can be given its position)?
      _spotted() { const T = this.tank; return this.units.some(o => o.alive && !o.spec.indirect && o.state !== 'moving' && this.world.los(o.e, o.n, o.spec.agl, T.e, T.n, 2.2).clear); }

      // The enemy commander assembles a volley. Skilled crews wait until several teams have a shot and fire together;
      // green crews fire as soon as one of them can. Nobody waits for ever.
      _commander() {
        const S = SKILL[this.skill], T = this.tank; this.transit = (this.transit || []).filter(d => d.u.alive && !d.u.gone);
        // drone crews launch whenever they are ready once the fight is open: a drone on its way does not stop anyone else firing
        if (this.opened) for (const u of this.units) if (u.alive && !u.gone && u.spec.indirect && u.state === 'hidden' && u.hasShot) this._launchDrone(u);
        if (this._volleyActive() || this._pending) return;
        const arrivals = this.transit.filter(d => d.arrive <= this.t), ready = this.units.filter(u => u.alive && !u.gone && !u.spec.indirect && u.state === 'hidden' && u.hasShot);
        if (!ready.length && !arrivals.length) { this._waitSince = null; return; }
        if (this._waitSince == null) this._waitSince = this.t;
        const waited = this.t - this._waitSince, exposed = this._exposure();
        if (this.opened) {
          // once the enemy has watched its missiles being beaten it stops feeding them in one at a time (crews good enough to adapt)
          const tac = this.tactic, teams = ready.concat(this._soon(ready, tac ? 10 : JOIN_WINDOW)), partners = this.units.filter(u => u.alive && !u.gone && u.ammo > 0 && u.state === 'hidden' && !u.spec.indirect && (tac === 'combined' || u.spec.key !== 'rpg')).length;
          if (tac && !arrivals.length && teams.length < 2 && partners >= 2 && waited < 8) return;
          this.transit = this.transit.filter(d => !arrivals.includes(d));
          this._fireVolley(teams, exposed, waited, { atWill: true, arrivals, why: teams.length + arrivals.length > 1 ? (arrivals.length && teams.length ? 'timed together: missiles as the drone arrives' : tac ? 'fired as a pair to overload the defences' : 'each team fires as soon as it has its shot') : 'each team fires as soon as it has its shot' }); this._waitSince = null; return; }
        // The opening ambush. The leader wants several teams ready and the vehicle in the open, but he fires at once if the vehicle has
        // found one of his teams or is on the move, and he never holds longer than his crews' level allows.
        const able = this.units.filter(u => u.alive && !u.gone && u.ammo > 0 && !u.spec.indirect && (u.state === 'hidden' || u.state === 'setup')), want = Math.max(1, Math.round(able.length * Math.min(S.coord, 0.7)));   /* even the best leader does not wait for every last team: the longer he waits, the more of them the vehicle finds */
        let why = null;
        if (exposed === 'none' && (T.v || 0) > 1.5 && ready.length >= Math.min(2, able.length)) why = `the vehicle is caught moving in the open with ${ready.length} teams laid on it`;
        else if (ready.length >= want && exposed !== 'hull') why = `${ready.length} of ${able.length} teams have a clean shot and the vehicle is exposed`;
        else if (T.known.some(k => !k.done)) why = 'the vehicle has found one of the teams, so the leader fires now';
        else if ((T.v || 0) > 1.5 && waited > S.open / 3) why = 'the vehicle is moving and may leave the kill zone, so the leader will not wait for more teams';
        else if (waited >= S.open) why = `the leader has held fire for ${Math.round(waited)} s and will not wait longer`;
        else if (ready.length >= want && waited >= S.open * 0.5) why = 'enough teams are ready; the vehicle is hull-down but the leader will not wait for better';
        if (!why) return;
        this.opened = true; this.openedAt = this.t; this.ev(this.t, 'ambush', { wave: this.wave, teams: ready.map(u => u.id) });
        this.say(this.t, 'enemy', null, `Enemy leader springs the ambush: ${why}.`, 'from now on every team fights on its own');
        this._fireVolley(ready.concat(this._soon(ready)), exposed, waited, { atWill: false, why });
        this._waitSince = null;
      }
      // a drone crew sends one off. It flies in on its own; the engine takes over when it is DRONE_TERMINAL metres out.
      _launchDrone(u) {
        const T = this.tank, S = SKILL[this.skill], r = this.rng, tt = HK.THREATS[u.spec.key] || { speed: 30 }; let R = Math.hypot(T.e - u.e, T.n - u.n), brg = brgOf(T.e, T.n, u.e, u.n), how = 'straight in';
        if (r.random() < S.misfire) { u.readyAt = this.t + 8 + r.random() * 6; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1}: drone fails to launch.`, 'friction'); return; }
        // expert pilots swing round to come from behind the hull, where HKOI's mount is masked (assumed 70% of the time, 25% further to fly)
        if (S.pilot === 'expert' && r.random() < 0.7) { brg = (T.h + 180 + (r.random() - 0.5) * 40 + 360) % 360; R *= 1.25; how = 'swinging round to come from behind'; } else if (S.pilot === 'trained') how = 'low, using the ground';
        const fly = Math.max(0, R - DRONE_TERMINAL) / tt.speed; u.ammo--; u.fired++; u.lastShotT = this.t; u.state = 'guiding'; u.since = this.t; u.sight = 0; u.hasShot = false;
        this.transit.push({ u, key: u.spec.key, brg, R0: R, t0: this.t, arrive: this.t + fly }); this.ev(this.t, 'drone_launch', { uid: u.id, R: Math.round(R), arrive: +(this.t + fly).toFixed(1) });
        this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1} launches a drone, ${how}: ${(R / 1000).toFixed(1)} km to fly, about ${Math.round(R / tt.speed)} s.`, 'the other teams do not wait for it');
      }
      // Teams that do not have their shot yet but will within a few seconds (they can see the vehicle and are nearly laid on, or nearly
      // reloaded). They join the same engagement with their own, later, launch time. u._lead is that delay in seconds.
      _soon(ready, window) {
        const S = SKILL[this.skill], out = []; window = window || JOIN_WINDOW; for (const u of ready) u._lead = 0;
        for (const u of this.units) { if (!u.alive || u.gone || u.spec.indirect || u.state !== 'hidden' || u.ammo <= 0 || u.hasShot || !(u.sight > 0)) continue;
          const lead = Math.max(u.readyAt - this.t, (u.suppressedUntil || 0) - this.t, u.spec.aim * S.aim - u.sight, 0); if (lead <= window) { u._lead = lead; out.push(u); } }
        return out;
      }
      // What a team is doing and why, in a few plain words (for the team menu and the log)
      intentOf(u) {
        if (!u.alive) return 'destroyed'; if (u.gone) return 'pulled out of the fight'; const S = SKILL[this.skill];
        if (u.state === 'spent' || u.ammo <= 0) return 'out of ammunition';
        if (u.state === 'moving') return (this.t < (u.packUntil || 0) ? 'packing up: ' : (u.gait === 'run' ? 'running: ' : 'moving: ')) + (u.moveWhy || 'new position');
        if (u.state === 'setup') return 'setting up the weapon';
        if (u.state === 'guiding') return u.spec.indirect ? 'flying a drone at the vehicle' : 'guiding a missile';
        if (u.state === 'firing') return 'firing';
        if (u.down) return 'pinned down by fire';
        if (this.t < u.readyAt) return `reloading (${Math.ceil(u.readyAt - this.t)} s)`;
        if (u.hasShot) return this.opened ? 'has a shot: firing' : 'has a shot: waiting for the ambush signal';
        if (u.sight > 0) return `laying on the vehicle (${Math.max(0, u.spec.aim * S.aim - u.sight).toFixed(0)} s)`;
        if (u.sliver) return 'only the top of the turret shows: holding fire';
        return u.watching ? 'watching where the vehicle was last seen' : 'no view of the vehicle';
      }
      _exposure() { const T = this.tank, obs = this.units.filter(u => u.alive && u.state === 'hidden' && !u.spec.indirect); let hull = 0, none = 0; for (const u of obs) { const d = this.world.defilade(u.e, u.n, u.spec.agl, T.e, T.n); if (d === 'hull') hull++; else if (d === 'none') none++; } return none ? 'none' : hull ? 'hull' : 'full'; }
      _volleyActive() { const v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null; return !!v && this.t <= v.tEnd; }

      _fireVolley(teams, exposed, waited, how) {
        how = how || { atWill: false, why: '' };
        const W = this.world, T = this.tank, S = SKILL[this.skill], r = this.rng, at = { e: T.e, n: T.n, h: T.h, v: T.v }, launches = [];
        for (const u of teams) {
          if (r.random() < S.misfire) { u.readyAt = this.t + 8 + r.random() * 6; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1}: misfire, clearing the launcher.`, 'friction'); continue; }
          let d = Math.hypot(T.e - u.e, T.n - u.n), brg = brgOf(T.e, T.n, u.e, u.n), u0 = null;
          // expert drone pilots do not fly straight in: they swing round to come from behind the hull, where HKOI's mount is masked (assumed 70% of the time, 25% further to fly)
          if (u.spec.indirect && S.pilot === 'expert' && r.random() < 0.7) { brg = (T.h + 180 + (r.random() - 0.5) * 40 + 360) % 360; d *= 1.25; u0 = { e: T.e + Math.sin(brg * DEG) * d, n: T.n + Math.cos(brg * DEG) * d }; }
          // coordinated crews time their shots to arrive together; the rest fire when ready
          const jitter = how.atWill ? (u._lead || 0) + r.random() * 0.8 : (u._lead || 0) + (1 - S.coord) * 6 * r.random();
          launches.push({ u, R: d, brg, t0: jitter, key: u.spec.key, lead: u._lead || 0, u0 });
        }
        for (const d of how.arrivals || []) { const R = Math.min(d.R0, DRONE_TERMINAL); launches.push({ u: d.u, R, brg: d.brg, t0: 0, key: d.key, lead: 0, arrival: true, u0: { e: T.e + Math.sin(d.brg * DEG) * R, n: T.n + Math.cos(d.brg * DEG) * R } }); }
        if (!launches.length) return;
        let v_mode = 'fired as each team was ready';
        // How the teams time their shots. Expert crews know their ranges and stagger launches so the missiles arrive together (to within a second or so:
        // it is done by stopwatch over a radio net). Trained crews fire on a signal, so they launch together and the missiles arrive spread out by range.
        // Green crews fire as each gets a sight picture (the jitter set above).
        if (how.atWill) { const m = Math.min(...launches.map(l => l.t0)); for (const l of launches) l.t0 -= m; v_mode = 'each team firing on its own'; }
        else if (S.coord > 0.9) { for (const l of launches) l.t0 = (l.lead || 0) + r.random() * 0.6; const m = Math.min(...launches.map(l => l.t0)); for (const l of launches) l.t0 -= m; v_mode = 'launched together on the signal, to the second'; }   /* not timed to ARRIVE together: holding the near shots back only gives the vehicle warning and time to reach cover */
        else if (S.coord > 0.6) { for (const l of launches) l.t0 = r.random() * 2.2; const m = Math.min(...launches.map(l => l.t0)); for (const l of launches) l.t0 -= m; v_mode = 'fired on a signal'; }
        const raidNow = this.wave > 0 ? this._waveRaid : this.raid;
        if (raidNow && !how.atWill) { for (const l of launches) l.t0 = r.random() * raidNow.window; const m = Math.min(...launches.map(l => l.t0)); for (const l of launches) l.t0 -= m; v_mode = `spread over about ${raidNow.window} s`; }
        // pass 1: the engine tells us when the crew is warned; the driver plans from that
        let order = null;
        const mk = (path, masks) => {
          const c = CAMP.applyState(JSON.parse(JSON.stringify(this.cfg0)), T.st);
          c.seed = this.seed * 1000 + this.volleys.length;
          c.vehicle.hull_deg = at.h; c.enemy.drone_skill = S.pilot; c.enemy.gunner_jitter_mrad = S.jitter;
          if (exposed === 'hull') c.vehicle.half_h *= 0.5;   // hull-down: only the turret is there to hit (approximation: the target is half as tall)
          c.enemy.fixed = launches.map((l, i) => ({ key: l.key, R: Math.max(60, l.R), brg: l.brg, t0: l.t0, id: l.u.id, uid: l.u.id, los_clear: l.los, mask: masks ? masks[i] : null, jit_k: masks ? l.jit_k : null, mask_by: masks ? l.mask_by : null }));
          if (path) { c.ext = { path }; if (order) c.ext.order = order; }
          const rec = { events: [], bursts: [], aps: [], ctx: {} };
          HK.runMission(c, new HK.RNG(HK.seedFor(c.seed, 0)), this.lookup, rec);
          return { c, rec };
        };
        // how far out each missile becomes visible to the vehicle's own sensors (terrain between them)
        for (const l of launches) { const tt = HK.THREATS[l.key], hgt = Math.max(1.5, tt.launch_h || 2); let vis = l.R; for (let x = l.R; x > 100; x -= 100) { const f = x / l.R, e = T.e + (l.u.e - T.e) * f, n = T.n + (l.u.n - T.n) * f; if (W.los(T.e, T.n, 3, e, n, hgt, { ignoreVeg: true }).clear) { vis = x; break; } vis = x - 100; } l.los = Math.max(150, vis); }
        const p1 = mk(null, null), cues = p1.rec.threats.map(th => th.cue).filter(c => c != null), warnT = cues.length ? Math.min(...cues) : null, tEnd = p1.rec.t_end;
        // The second half is heavy too, so it is done on the next call to step() (no simulated time passes in between):
        // the display gets a frame in between and the launch does not cause a visible pause.
        this._pending = () => {
        const observers = launches.map(l => ({ e: l.u.e, n: l.u.n, agl: l.u.spec.agl }));
        const imp = p1.rec.threats.map(th => th.impact).filter(x => x != null);
        // can HKOI handle this on its own terms? Missiles it can blind (beam riders and command-guided), launched from far enough out to give it time,
        // and no more than two arriving close together (three at once swamp it: 2% stopped in the engine against 44% when six seconds apart)
        const blindable = launches.filter(l => (l.key === 'kornet' || l.key === 'saclos') && l.R >= 1000), others = launches.filter(l => !blindable.includes(l) && l.key !== 'rpg');
        const holdForHkoi = this.cfg0.hkoi_enabled !== false && (T.st.obs == null || T.st.obs >= 12) && blindable.length >= 1 && blindable.length <= 2 && others.length === 0 && !this._crewFlinch();   /* crew.js: a shaken commander may not hold still */
        const plan = this._drivePlan(at, warnT, observers, tEnd, imp.length ? Math.min(...imp) : null, holdForHkoi);
        // which guided missiles lose their gunner's sight line because the vehicle got behind something
        const masks = launches.map((l, i) => {
          if (!l.u.spec.needsLos) return null;
          const th = p1.rec.threats.find(q => q.uid === l.u.id && Math.abs(q.t0 - l.t0) < 1e-6) || p1.rec.threats[i], v = HK.THREATS[l.key].speed; let lost = 0;
          for (const p of plan.path) { if (p[0] < l.t0 + 0.5 || p[0] > th.impact) continue; const clear = W.los(l.u.e, l.u.n, l.u.spec.agl, at.e + p[1], at.n + p[2], 2.2).clear; lost = clear ? 0 : lost + 0.1; if (lost >= 1.0) return Math.max(10, (th.impact - p[0]) * v * 0.55); }
          return null;
        });
        if (this._counterFire) this._counterFire(launches, p1.rec, plan, at, masks);   /* machine-gun fire on launchers whose missiles are in the air */
        if (plan.cover) {   // what the commander tells the driver, in terms of the ground
          const c = plan.cover, vg = W.veg(c.e, c.n).cls, what = W.buildingAt(c.e, c.n) || vg === 6 ? 'the buildings' : vg === 4 ? 'the wood' : vg === 5 ? 'the tree line' : vg === 3 ? 'the scrub' : 'the low ground';
          const rel = angDiff((Math.atan2(c.e - at.e, c.n - at.n) / DEG + 360) % 360, at.h), side = Math.abs(rel) < 30 ? 'ahead' : Math.abs(rel) > 150 ? 'behind us' : rel > 0 ? 'right' : 'left', dm = Math.max(10, Math.round(c.d / 10) * 10);
          plan.what = what; plan.side = side;
          order = { ev: `Warning: driver makes for ${what}, ${dm} m ${side}${c.all ? '' : ' (covers some of the launchers)'}`, cdr: [`Driver, ${what}, ${side}, ${dm} metres. Go.`, `Driver, get us into ${what}! ${side === 'behind us' ? 'Back up' : side[0].toUpperCase() + side.slice(1)}! Now!`, `${what.toUpperCase()}! ${side.toUpperCase()}! GO GO GO!`], drv: ['Moving.', 'On it!', 'GOING!'] };
        } else if (warnT != null) order = { ev: `Warning: the commander holds position${this._holdWhy ? ' (' + this._holdWhy + ')' : ''}: HKOI gets a clean engagement`, cdr: ['No cover in reach. Hold here.', 'Nothing to hide behind! Hold!', 'NOWHERE TO GO!'], drv: null };
        const res = mk(plan.path, masks), rec = res.rec;
        for (const th of rec.threats) { const l = launches.find(q => q.u.id === th.uid); if (l && l.jit_k > 1.15 && th.defeated_by === 'gunner_jitter') th.defeated_by = 'suppressed_aim'; }   /* a miss by a gunner under fire is credited to the counter-fire, not to ordinary unsteadiness */
        // a destroyed vehicle stops where it was hit
        if (rec.killed && rec.kill_t != null) { let stop = null; for (const p of plan.path) { if (p[0] >= rec.kill_t) { if (!stop) stop = p.slice(); p[1] = stop[1]; p[2] = stop[2]; p[3] = stop[3]; p[4] = 0; } } }
        const v = { i: this.volleys.length, t0: this.t, tEnd: this.t + rec.t_end, at, path: plan.path, rec, cfg: res.c, launches, exposed, plan, masks };
        this.volleys.push(v);
        for (const th of rec.threats) { const l = launches.find(q => q.u.id === th.uid) || {}, end = th.viz.end, by = th.state === 'hit' ? 'hit' : (th.defeated_by || th.state);
          this.ev(this.t + th.t0, 'launch', { v: v.i, idx: th.idx, uid: th.uid, key: th.key, R: Math.round(l.R || 0), brg: Math.round(l.brg || 0), arrival: !!l.arrival });
          if (th.viz.fired != null) this.ev(this.t + th.viz.fired, 'hkoi_fire', { v: v.i, idx: th.idx, key: th.key });
          this.ev(this.t + end.t, 'end', { v: v.i, idx: th.idx, uid: th.uid, key: th.key, by, how: end.type, killing: !!end.killing }); }
        for (const a of rec.aps || []) this.ev(this.t + a.t, 'trophy', { v: v.i, brg: Math.round(a.brg) });
        if (rec.killed) this.ev(this.t + (rec.kill_t != null ? rec.kill_t : rec.t_end), 'vehicle_lost', { v: v.i });
        const names = launches.map(l => `${l.u.spec.name} #${l.u.id + 1} at ${(l.R / 1000).toFixed(2)} km, ${Math.round(l.brg).toString().padStart(3, '0')}`).join('; ');
        this.say(this.t, 'volley', null, `${how.atWill ? 'Enemy fire' : 'Enemy ambush'} (engagement ${v.i + 1}): ${names}.`, `${v_mode}${how.why && !how.atWill ? '; ' + how.why : ''}; vehicle ${exposed === 'none' ? 'fully exposed' : exposed === 'hull' ? 'hull-down' : 'in cover'}`);
        masks.forEach((m, i) => { if (m != null) this.say(this.t + launches[i].t0 + 1, 'enemy', launches[i].u.id, `${launches[i].u.spec.name} #${launches[i].u.id + 1} loses sight of the vehicle behind cover.`, 'sight line broken'); });
        for (const e of rec.events) { this.say(this.t + e.t, 'engine', e.idx, e.text); this.log[this.log.length - 1].sub = e.kind; }
        for (const l of launches) { l.u.state = l.u.spec.needsLos ? 'guiding' : 'firing'; l.u.since = this.t; l.u.volley = v.i; if (!l.arrival) { l.u.ammo--; l.u.fired++; l.u.lastShotT = this.t + l.t0; } }
        // B: the crew places a launcher from its launch flash if it can see the spot, or from the radar track, as it happens (not when the engagement ends)
        this._locQ = this._locQ || []; for (const l of launches) { if (l.arrival || l.u.spec.indirect) continue; const th = rec.threats.find(q => q.uid === l.u.id); const flash = l.R < 3000 && W.los(at.e, at.n, 2.6, l.u.e, l.u.n, 1.0).clear && r.random() < 0.85; if (flash) this._locQ.push({ t: this.t + l.t0 + 1.0, u: l.u, how: 'launch flash and smoke seen' }); else if (th && th.track != null) this._locQ.push({ t: this.t + th.track, u: l.u, how: 'placed from the radar track of its missile' }); }
        };
      }

      // Choosing where to fight from. After a volley the commander knows roughly where fire came from (located launch sites, and the bearings
      // of launches he saw). He looks at the ground within 200 m for a spot where the hull is hidden from as many of those as possible while the
      // turret can still see them (hull-down), prefers near over far, and moves only if it is clearly better than where he is. The search is
      // spread over several steps so it never stalls a frame.
      _hullDown(v) {
        const T = this.tank, W = this.world;
        if (!this._hd || this._hd.v !== v.i) {
          const obs = []; for (const k of T.known) if (!k.done) obs.push({ e: k.e, n: k.n, w: 2, known: true });
          for (const vv of this.volleys.slice(-2)) for (const l of vv.launches) { if (l.u.spec.indirect) continue; const a = l.brg * DEG, le = vv.at.e + Math.sin(a) * l.R, ln = vv.at.n + Math.cos(a) * l.R; if (obs.some(o => o.known && Math.hypot(o.e - le, o.n - ln) < 60)) continue; const R = Math.min(l.R, 2500); obs.push({ e: vv.at.e + Math.sin(a) * R, n: vv.at.n + Math.cos(a) * R, w: 1 }); }
          if (!obs.length) { T.searched = v.i; return; }
          const cands = [{ e: T.e, n: T.n, here: true }]; for (let de = -200; de <= 200; de += 25) for (let dn = -200; dn <= 200; dn += 25) { const d = Math.hypot(de, dn); if (d < 20 || d > 205) continue; const e = T.e + de, n = T.n + dn; if (!W.inside(e, n) || !W.passable(e, n, true) || W.slope(e, n) > 0.32) continue; cands.push({ e, n, d }); }
          this._hd = { v: v.i, obs, cands, i: 0, best: null, here: null };
        }
        const H = this._hd, cost = c => { let s = 0, hid = 0, see = 0; for (const o of H.obs) { const hull = W.los(o.e, o.n, 1.3, c.e, c.n, 1.0).clear, tur = hull || W.los(o.e, o.n, 1.3, c.e, c.n, 2.6).clear; s += o.w * (hull ? 1 : tur ? 0.15 : 0.4); if (!hull) hid++; if (tur) see++; } return { s: s + (c.d || 0) * 0.0025, hid, see }; };
        for (let k = 0; k < 24 && H.i < H.cands.length; k++, H.i++) { const c = H.cands[H.i]; if (!c.here) { let ok = true; for (let f = 0.15; f < 1 && ok; f += 0.15) ok = W.passable(T.e + (c.e - T.e) * f, T.n + (c.n - T.n) * f, true); if (!ok) continue; } const r = cost(c); c.s = r.s; c.hid = r.hid; c.see = r.see; if (c.here) H.here = c; else if (!H.best || c.s < H.best.s) H.best = c; }
        if (H.i < H.cands.length) return;
        T.searched = v.i; const N = H.obs.length, b = H.best, h = H.here; this._hd = null;
        if (!b || !h || b.s > h.s - 0.3 * Math.max(1, N * 0.25)) { if (T.mode === 'cover') { T.mode = 'overwatch'; T.modeSince = this.t; } this.say(this.t, 'tank', 'CDR', `Commander stays put: no clearly better position within 200 m (hull hidden here from ${h ? h.hid : 0} of ${N} known firing directions).`, 'position search after the volley'); return; }
        let fe = 0, fn = 0; for (const o of H.obs) { fe += (o.e - b.e) * o.w; fn += (o.n - b.n) * o.w; }
        T.goal = { e: b.e, n: b.n }; T.goalFace = (Math.atan2(fe, fn) / DEG + 360) % 360; T.mode = 'moving'; T.modeSince = this.t;
        this.say(this.t, 'tank', 'CDR', `Commander moves ${Math.round(b.d / 5) * 5} m to a ${b.hid > 0 && b.see > 0 ? 'hull-down' : b.hid === N ? 'covered' : 'better'} position: hull hidden from ${b.hid} of ${N} known firing directions (was ${h.hid}), turret sees ${b.see} of them (was ${h.see}).`, 'he will not sit where he has just been shot at; frontal armour turned toward the threat');
      }
      // Machine guns. A located enemy team within 1000 yards (914 m) and in view is engaged at once: the coaxial 7.62 mm out to 800 m, the
      // commander's .50 calibre out to the full 914 m (both together inside 800 m). Bursts of about three seconds with a second's pause.
      // Fire on a dug-in team mostly suppresses it (heads down, cannot aim or fire for a while); each burst has a modest chance of
      // knocking the team out, falling with range, and less from a moving vehicle. Limit of the model: a missile already in flight
      // when its gunner is suppressed is NOT thrown off; the volley was worked out when it was fired.
      _machineGuns() {
        const T = this.tank, W = this.world; if (!T.alive || this._pending) return;
        if (this._mg && this.t < this._mg.t + this._mg.dur + 1.0) return;
        let best = null; for (const u of this.units) { if (!u.alive || !u.known) continue; const R = Math.hypot(u.e - T.e, u.n - T.n); if (R > 914 || R < 15) continue; if (!W.los(T.e, T.n, 2.5, u.e, u.n, 0.8).clear) continue; if (!best || R < best.R) best = { u, R }; }
        if (!best) { this._mg = null; return; }
        const { u, R } = best, coax = R <= 800 && T.coax > 0, m2 = T.m2 > 0; if (!coax && !m2) return;
        const dur = 3, moving = (T.v || 0) > 1.5, base = (coax ? 0.42 * Math.exp(-R / 330) : 0) + (m2 ? 0.34 * Math.exp(-R / 520) : 0), p = Math.min(0.6, base) * (moving ? 0.6 : 1), first = !this._mg || this._mg.id !== u.id;
        if (coax) T.coax -= 40; if (m2) T.m2 -= 24;
        const hit = this.rng.random() < p; u.suppressedUntil = Math.max(u.suppressedUntil || 0, this.t + dur + 12); u.sight = 0;
        this._mg = { t: this.t, dur, id: u.id, e: u.e, n: u.n, R, coax, m2, hit }; (this.mgs = this.mgs || []).push(this._mg);
        const who = coax && m2 ? 'Coax and commander\'s .50' : coax ? 'Coax' : 'Commander\'s .50';
        if (first) this.say(this.t, 'tank', 'GNR', `${who} engage${coax && m2 ? '' : 's'} ${u.spec.name} #${u.id + 1} at ${Math.round(R / 10) * 10} m.`, 'located team inside 1000 yards with a clear line of sight');
        if (hit) { u.alive = false; u.state = 'dead'; this.killedByMg = (this.killedByMg || 0) + 1; const k = T.known.find(q => q.id === u.id); if (k) k.done = true; this.say(this.t + dur, 'tank', 'GNR', `${u.spec.name} #${u.id + 1} knocked out by machine-gun fire at ${Math.round(R / 10) * 10} m.`, `about ${Math.round(p * 100)}% per burst against a dug-in team at this range${moving ? ', firing on the move' : ''}`); }
        else if (first) this.say(this.t + dur, 'tank', 'GNR', `${u.spec.name} #${u.id + 1} suppressed: heads down, cannot aim or fire.`, 'machine-gun fire on a dug-in team mostly pins it');
      }
      // Return fire. Between volleys the crew engages launch sites it has located (seen on the HKOI track at launch) with the main gun:
      // nearest first, only with a clear line of sight, one aimed multi-purpose round at a time. A team that has already moved is not
      // there to be hit; a near miss makes a team pull out. Ten such rounds are carried.
      _returnFire() {
        const T = this.tank, W = this.world, S_ = SKILL[this.skill]; if (!T.alive || T.main <= 0 || this._volleyActive() || this._pending || T.goal) return;   // fires from the halt only
        if (!this._rf) {
          let best = null; for (const k of T.known) { if (k.done) continue; const R = Math.hypot(k.e - T.e, k.n - T.n); if (R > 4200 || R < 60) continue; if (!W.los(T.e, T.n, 2.4, k.e, k.n, 1.0).clear) continue; if (!best || R < best.R) best = { k, R }; }
          if (!best) return; const u = this.units.find(q => q.id === best.k.id), brg = (Math.atan2(best.k.e - T.e, best.k.n - T.n) / DEG + 360) % 360;
          this._rf = { k: best.k, R: best.R, at: Math.max(this.t + 3.5 + best.R / 1000 * 1.3, T.mainReady) };
          this.say(this.t, 'tank', 'CDR', `Commander lays the main gun on the located ${u.spec.name} site, ${(best.R / 1000).toFixed(2)} km, bearing ${Math.round(brg).toString().padStart(3, '0')}.`, 'launch site fixed by the radar track at launch; clear line of sight from here');
          if (u.alive && u.state === 'hidden' && u.ammo > 0 && this.rng.random() < S_.notice) this._displace(u, 'sees the tank\'s gun turning onto it');
          this.shots = this.shots || []; return;
        }
        if (this.t < this._rf.at) return;
        const { k, R } = this._rf, u = this.units.find(q => q.id === k.id), there = u.alive && (u.state !== 'moving' || this.t < (u.packUntil || 0)) && Math.hypot(u.e - k.e, u.n - k.n) < 25, tof = R / 1140, p = Math.max(0.4, Math.min(0.88, 0.92 - R / 5000)), roll = this.rng.random();
        T.main--; T.mainReady = this.t + 6; k.shots = (k.shots || 0) + 1; this._rf = null; let hit = false, text, why;
        if (!there) { k.done = true; u.known = false; text = `Main gun round strikes the ${u.spec.name} #${u.id + 1} launch site: nobody there.`; why = 'the team had already moved to its next position'; }
        else if (roll < p) { hit = true; u.alive = false; u.state = 'dead'; k.done = true; this.killedByTank = (this.killedByTank || 0) + 1; text = `Main gun round on ${u.spec.name} #${u.id + 1} at ${(R / 1000).toFixed(2)} km: position destroyed.`; why = `aimed fire from a halted vehicle at a fixed, located position (about ${Math.round(p * 100)}% at this range)`; }
        else { if (u.ammo > 0 && this._displace(u, 'a tank round has just landed beside it')) { k.done = true; u.known = false; } else { u.readyAt = Math.max(u.readyAt || 0, this.t + 45); if (k.shots >= 2) k.done = true; } text = `Main gun round lands close to ${u.spec.name} #${u.id + 1}: team shaken${u.state === 'moving' ? ', pulls out for its next position' : ', head down'}.`; why = 'a near miss: a dug-in team is a small target at this range'; }
        this.say(this.t + tof, 'tank', 'GNR', text, why); this.shots.push({ t: this.t, tof, from: { e: T.e, n: T.n }, to: { e: k.e + (hit || !there ? 0 : (this.rng.random() - 0.5) * 14), n: k.n + (hit || !there ? 0 : (this.rng.random() - 0.5) * 14) }, hit, there });
      }
      // when a volley is over: carry the vehicle's state forward, let the crew locate who fired, and send the firers to their next position
      _finishVolleys() {
        const v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null;
        if (!v || v.done || this.t < v.tEnd) return;
        v.done = true;
        const T = this.tank, S = SKILL[this.skill], r = this.rng, rec = v.rec;
        T.st = CAMP.nextState(rec, v.cfg, T.st, { wave: true, gap_min: 0.5 });
        const p = v.path[v.path.length - 1]; T.e = v.at.e + p[1]; T.n = v.at.n + p[2]; T.h = p[3]; T.v = 0;
        if (v.plan.cover) { T.mode = 'cover'; T.modeSince = this.t; }
        if (rec.killed) { T.alive = false; this.say(this.t, 'result', null, 'Vehicle destroyed.'); return; }
        if (this._loaderRisk) this._loaderRisk(v);
        for (const th of rec.threats) { const u = this.units.find(q => q.id === th.uid); if (!u) continue; if (th.track != null && !u.spec.indirect) { u.known = true; if (!T.known.some(k => k.id === u.id)) T.known.push({ id: u.id, e: u.e, n: u.n, t: this.t }); } }
        for (const l of v.launches) { const u = l.u; if (!u.alive || u.gone) continue;   /* a team knocked out during the engagement does nothing more */ u.readyAt = this.t + u.spec.reload; u.state = u.ammo > 0 ? 'hidden' : 'spent'; u.sight = 0; u.shotsHere = (u.shotsHere || 0) + 1; if (u.ammo > 0) { if (u.shotsHere >= 2) this._displace(u, 'two shots from one spot: time to move'); else if (!u.spec.indirect && r.random() < S.scoot) this._displace(u, 'its launch gave the position away: moves before the tank answers'); else if (r.random() < (1 - S.nerve) * 0.5) this._displace(u, 'nerves: leaves after one shot'); } }
        { const S2 = SKILL[this.skill]; this.beaten = (this.beaten || 0) + rec.threats.filter(th => /^hkoi|^aps$/.test(th.defeated_by || '')).length; const want = S2.adapt >= 2 ? 'combined' : S2.adapt >= 1 ? 'pairs' : null;
          if (want && !this.tactic && this.beaten >= 2) { this.tactic = want; this.say(this.t, 'enemy', null, `Enemy changes tactics: ${this.beaten} of its missiles have been stopped, so teams now ${want === 'combined' ? 'time missiles, rockets and drones to arrive together' : 'hold their shots to fire in pairs'}.`, `${this.skill} crews adapt to the vehicle's defences`); } }
        const hits = rec.hits || 0; this.say(this.t, 'result', null, `Volley ${v.i + 1} over: ${rec.threats.length} fired, ${hits} hit${hits === 1 ? '' : 's'}. HKOI rounds left ${T.st.obs} obscurant, ${T.st.he} HE; Trophy ${T.st.apsL} left, ${T.st.apsR} right.`);
      }

      summary() {
        const T = this.tank, fired = this.volleys.reduce((s, v) => s + v.rec.threats.length, 0), hits = this.volleys.reduce((s, v) => s + (v.rec.hits || 0), 0), by = {};
        for (const v of this.volleys) for (const th of v.rec.threats) { const k = th.defeated_by || (th.viz.end.type === 'hit' ? 'HIT' : th.state); by[k] = (by[k] || 0) + 1; }
        return { t: +this.t.toFixed(1), alive: T.alive, volleys: this.volleys.length, fired, hits, by, obs: T.st.obs, he: T.st.he, apsL: T.st.apsL, apsR: T.st.apsR, crew: T.st.crew, wave: this.wave + 1, waves: this.nWaves, teamsLeft: this.units.filter(u => u.alive && !u.gone && u.ammo > 0).length + (this.wave < this.nWaves - 1 ? 1 : 0), main: T.main, killedByTank: this.killedByTank || 0, killedByMg: this.killedByMg || 0, coax: T.coax, m2: T.m2 };
      }
    }
    const TA = deps.TankAI || (typeof HKTankAI !== 'undefined' ? HKTankAI : null); if (TA) TA.install(Battle, SKILL);   /* the tank crew's drills live in tankai.js */
    /* the crew's stress and panic live in crew.js; without that file every hook answers "no change" */
    const CW = deps.Crew || (typeof HKCrew !== 'undefined' ? HKCrew : null); if (CW) CW.install(Battle, { HK, DMG: deps.DMG }); else Object.assign(Battle.prototype, { _crewStep() {}, _crewAdd() { return 0; }, _crewMul() { return 1; }, _crewOut() { return false; }, _crewFlinch() { return false; } });
    return { Battle, TEAMS, SKILL };
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKBattle = api;
})(typeof window !== 'undefined' ? window : globalThis);
