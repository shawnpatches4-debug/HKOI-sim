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
    kornet: { name: 'Kornet team', key: 'kornet', rmin: 400, rmax: 5000, aim: 5, needsLos: true, ammo: 3, reload: 22, setup: 35, move: 2.2, agl: 1.1 },
    saclos: { name: 'Konkurs team', key: 'saclos', rmin: 300, rmax: 3800, aim: 5, needsLos: true, ammo: 3, reload: 26, setup: 40, move: 2.0, agl: 1.1 },
    rpg: { name: 'RPG team', key: 'rpg', rmin: 60, rmax: 420, aim: 2.5, needsLos: false, ammo: 4, reload: 9, setup: 6, move: 3.2, agl: 1.3 },
    sal: { name: 'Laser designator team', key: 'sal', rmin: 800, rmax: 6000, aim: 8, needsLos: true, ammo: 2, reload: 45, setup: 50, move: 2.0, agl: 1.4 },
    fpv: { name: 'FPV drone crew', key: 'fpv', rmin: 300, rmax: 4000, aim: 3, needsLos: false, indirect: true, ammo: 6, reload: 14, setup: 60, move: 2.2, agl: 1.2 },
    fpv_fiber: { name: 'Fibre FPV crew', key: 'fpv_fiber', rmin: 300, rmax: 7000, aim: 3, needsLos: false, indirect: true, ammo: 4, reload: 18, setup: 60, move: 2.2, agl: 1.2 },
  };
  const SKILL = {
    green: { aim: 1.5, patience: 25, coord: 0.3, misfire: 0.1, nerve: 0.5, scoot: 0.5 },
    trained: { aim: 1.0, patience: 60, coord: 0.7, misfire: 0.04, nerve: 0.75, scoot: 0.8 },
    expert: { aim: 0.8, patience: 140, coord: 0.95, misfire: 0.02, nerve: 0.9, scoot: 1.0 },
  };

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
        this.skill = SKILL[opt.skill] ? opt.skill : 'trained';
        this.dt = opt.dt || 0.1;
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
        this.units = [];
        this._place(opt.force || [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }]);
        this.say(0, 'setup', null, `Battle on ${this.world.biome.name}, map seed ${this.world.seed}. ${this.units.length} enemy teams in position.`);
      }

      say(t, kind, who, text, why) { this.log.push({ t: +t.toFixed(2), kind, who, text, why: why || null }); }

      // ---------------------------------------------------------------- setting up the enemy
      // Each team gets a primary firing position and two alternates, chosen for a clear shot at where the vehicle starts,
      // concealment, and a covered way out. Teams are spread so one burst of return fire cannot catch two.
      _place(force) {
        const W = this.world, T = this.tank, taken = [];
        for (const f of force) {
          const spec = TEAMS[f.type]; if (!spec) continue;
          const sites = W.ambushSites(T.e, T.n, { rmin: Math.max(spec.rmin * 1.3, spec.indirect ? 900 : 0), rmax: Math.min(spec.rmax * 0.8, 3800), agl: spec.agl, salt: this.seed * 13 + this.units.length });
          const pool = spec.indirect ? this._hiddenSites(spec) : sites;
          for (let k = 0; k < (f.n || 1); k++) {
            const pick = pool.find(s => taken.every(q => Math.hypot(q.e - s.e, q.n - s.n) > 350));
            if (!pick) break;
            taken.push(pick);
            const alts = pool.filter(s => { const d = Math.hypot(s.e - pick.e, s.n - pick.n); return d > 120 && d < 700; }).slice(0, 2);
            this.units.push({
              id: this.units.length, type: f.type, spec, e: pick.e, n: pick.n, sites: [pick].concat(alts), site: 0,
              state: 'hidden', since: 0, ammo: spec.ammo, readyAt: 0, sight: 0, lastSeen: null, alive: true, known: false, fired: 0, path: null, suppressedUntil: 0,
            });
          }
        }
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
        this._moveTank(dt);
        for (const u of this.units) this._unit(u, dt);
        this._commander();
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
      _drivePlan(at, warnT, observers, tEnd) {
        const W = this.world, path = [], T0 = -3, PDT = 0.1; let e = 0, n = 0, h = at.h, v = at.v || 0, goal = null, reached = false;
        const react = warnT == null ? 1e9 : warnT + 1.6 + (this.tank.st.fatigue || 0) * 2;
        let cover = null;
        if (warnT != null && observers.length) { const c = W.coverFrom(at.e, at.n, observers, { radius: 260, step: 24 }).filter(q => this._drivable(at.e, at.n, q.e, q.n)); cover = c.length ? c[0] : null; }
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
        if (!u.alive) return;
        const W = this.world, T = this.tank, S = SKILL[this.skill], sp = u.spec;
        if (u.state === 'moving') {   // displacing to the next prepared position
          const g = u.sites[u.site], dx = g.e - u.e, dn = g.n - u.n, d = Math.hypot(dx, dn);
          if (d < 3) { u.state = 'setup'; u.since = this.t; u.known = false; }
          else { u.e += dx / d * sp.move * dt; u.n += dn / d * sp.move * dt; }
          return;
        }
        if (u.state === 'setup') { if (this.t - u.since > sp.setup) { u.state = 'hidden'; u.since = this.t; u.sight = 0; } return; }
        if (u.state === 'guiding' || u.state === 'firing') return;
        if (u.ammo <= 0) { u.state = 'spent'; return; }
        // watching: does this team have a shot right now?
        const d = Math.hypot(T.e - u.e, T.n - u.n);
        const seen = sp.indirect ? this._spotted() : (d >= sp.rmin && d <= sp.rmax && W.los(u.e, u.n, sp.agl, T.e, T.n, 2.2).clear);
        u.sight = seen ? u.sight + dt : 0;
        u.hasShot = seen && this.t >= u.readyAt && this.t >= u.suppressedUntil && u.sight >= sp.aim * S.aim;
        if (seen) u.lastSeen = this.t;
        // A direct-fire team that has lost its view of the vehicle does not sit blind for ever. After a wait (shorter for green crews, who
        // fidget; longer for experts, who expect the vehicle to come back up) it moves to whichever of its prepared positions looks onto
        // where the vehicle now is, provided someone on its side can see the vehicle to tell it so.
        if (!sp.indirect && !seen && u.state === 'hidden' && u.sites.length > 1 && this.t - Math.max(u.lastSeen || 0, u.since) > 40 + S.patience * 0.6 && this.t >= (u.nextLook || 0)) {
          u.nextLook = this.t + 20; if (!this._spotted()) return;
          let best = -1; for (let j = 0; j < u.sites.length; j++) { if (j === u.site) continue; const g = u.sites[j], dd = Math.hypot(T.e - g.e, T.n - g.n); if (dd < sp.rmin || dd > sp.rmax) continue; if (W.los(g.e, g.n, sp.agl, T.e, T.n, 2.2).clear) { best = j; break; } }
          if (best >= 0) { u.site = best; u.state = 'moving'; u.since = this.t; u.known = false; this.say(this.t, 'enemy', u.id, `${sp.name} #${u.id + 1} has lost sight of the vehicle: moves to another prepared position that looks onto it.`, 'told where the vehicle is by a team that can still see it'); }
        }
      }
      // can anyone on the enemy side see the vehicle (so that crews firing over a hill can be given its position)?
      _spotted() { const T = this.tank; return this.units.some(o => o.alive && !o.spec.indirect && o.state !== 'moving' && this.world.los(o.e, o.n, o.spec.agl, T.e, T.n, 2.2).clear); }

      // The enemy commander assembles a volley. Skilled crews wait until several teams have a shot and fire together;
      // green crews fire as soon as one of them can. Nobody waits for ever.
      _commander() {
        if (this._volleyActive()) return;
        const S = SKILL[this.skill], ready = this.units.filter(u => u.alive && u.state === 'hidden' && u.hasShot), able = this.units.filter(u => u.alive && u.ammo > 0 && (u.state === 'hidden' || u.state === 'setup'));
        if (!ready.length) { this._waitSince = null; return; }
        if (this._waitSince == null) this._waitSince = this.t;
        const want = Math.max(1, Math.round(able.length * S.coord)), waited = this.t - this._waitSince;
        const exposed = this._exposure();
        // hold fire while the vehicle is hull-down if there is patience left: a full target is worth waiting for
        if (exposed === 'hull' && waited < S.patience * 0.5) return;
        if (ready.length < want && waited < Math.min(S.patience, 12 + 10 * S.coord)) return;
        this._fireVolley(ready, exposed, waited);
        this._waitSince = null;
      }
      _exposure() { const T = this.tank, obs = this.units.filter(u => u.alive && u.state === 'hidden' && !u.spec.indirect); let hull = 0, none = 0; for (const u of obs) { const d = this.world.defilade(u.e, u.n, u.spec.agl, T.e, T.n); if (d === 'hull') hull++; else if (d === 'none') none++; } return none ? 'none' : hull ? 'hull' : 'full'; }
      _volleyActive() { const v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null; return !!v && this.t <= v.tEnd; }

      _fireVolley(teams, exposed, waited) {
        const W = this.world, T = this.tank, S = SKILL[this.skill], r = this.rng, at = { e: T.e, n: T.n, h: T.h, v: T.v }, launches = [];
        for (const u of teams) {
          if (r.random() < S.misfire) { u.readyAt = this.t + 8 + r.random() * 6; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1}: misfire, clearing the launcher.`, 'friction'); continue; }
          const d = Math.hypot(T.e - u.e, T.n - u.n), brg = brgOf(T.e, T.n, u.e, u.n);
          // coordinated crews time their shots to arrive together; the rest fire when ready
          const jitter = (1 - S.coord) * 6 * r.random();
          launches.push({ u, R: d, brg, t0: jitter, key: u.spec.key });
        }
        if (!launches.length) return;
        let v_mode = 'fired as each team was ready';
        // How the teams time their shots. Expert crews know their ranges and stagger launches so the missiles arrive together (to within a second or so:
        // it is done by stopwatch over a radio net). Trained crews fire on a signal, so they launch together and the missiles arrive spread out by range.
        // Green crews fire as each gets a sight picture (the jitter set above).
        if (S.coord > 0.9) { const tof = l => l.R / HK.THREATS[l.key].speed, latest = Math.max(...launches.map(tof)); for (const l of launches) l.t0 = Math.max(0, latest - tof(l)) + (r.random() - 0.5) * 2.4; const m = Math.min(...launches.map(l => l.t0)); for (const l of launches) l.t0 -= m; v_mode = 'timed to arrive together'; }
        else if (S.coord > 0.6) { for (const l of launches) l.t0 = r.random() * 2.2; const m = Math.min(...launches.map(l => l.t0)); for (const l of launches) l.t0 -= m; v_mode = 'fired on a signal'; }
        // pass 1: the engine tells us when the crew is warned; the driver plans from that
        let order = null;
        const mk = (path, masks) => {
          const c = CAMP.applyState(JSON.parse(JSON.stringify(this.cfg0)), T.st);
          c.seed = this.seed * 1000 + this.volleys.length;
          c.vehicle.hull_deg = at.h;
          if (exposed === 'hull') c.vehicle.half_h *= 0.5;   // hull-down: only the turret is there to hit (approximation: the target is half as tall)
          c.enemy.fixed = launches.map((l, i) => ({ key: l.key, R: Math.max(60, l.R), brg: l.brg, t0: l.t0, id: l.u.id, uid: l.u.id, los_clear: l.los, mask: masks ? masks[i] : null }));
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
        const plan = this._drivePlan(at, warnT, observers, tEnd);
        // which guided missiles lose their gunner's sight line because the vehicle got behind something
        const masks = launches.map((l, i) => {
          if (!l.u.spec.needsLos) return null;
          const th = p1.rec.threats.find(q => q.uid === l.u.id && Math.abs(q.t0 - l.t0) < 1e-6) || p1.rec.threats[i], v = HK.THREATS[l.key].speed; let lost = 0;
          for (const p of plan.path) { if (p[0] < l.t0 + 0.5 || p[0] > th.impact) continue; const clear = W.los(l.u.e, l.u.n, l.u.spec.agl, at.e + p[1], at.n + p[2], 2.2).clear; lost = clear ? 0 : lost + 0.1; if (lost >= 1.0) return Math.max(10, (th.impact - p[0]) * v * 0.55); }
          return null;
        });
        if (plan.cover) {   // what the commander tells the driver, in terms of the ground
          const c = plan.cover, vg = W.veg(c.e, c.n).cls, what = W.buildingAt(c.e, c.n) || vg === 6 ? 'the buildings' : vg === 4 ? 'the wood' : vg === 5 ? 'the tree line' : vg === 3 ? 'the scrub' : 'the low ground';
          const rel = angDiff((Math.atan2(c.e - at.e, c.n - at.n) / DEG + 360) % 360, at.h), side = Math.abs(rel) < 30 ? 'ahead' : Math.abs(rel) > 150 ? 'behind us' : rel > 0 ? 'right' : 'left', dm = Math.max(10, Math.round(c.d / 10) * 10);
          plan.what = what; plan.side = side;
          order = { ev: `Warning: driver makes for ${what}, ${dm} m ${side}${c.all ? '' : ' (covers some of the launchers)'}`, cdr: [`Driver, ${what}, ${side}, ${dm} metres. Go.`, `Driver, get us into ${what}! ${side === 'behind us' ? 'Back up' : side[0].toUpperCase() + side.slice(1)}! Now!`, `${what.toUpperCase()}! ${side.toUpperCase()}! GO GO GO!`], drv: ['Moving.', 'On it!', 'GOING!'] };
        } else if (warnT != null) order = { ev: 'Warning: no cover within reach, the vehicle holds and fights from where it is', cdr: ['No cover in reach. Hold here.', 'Nothing to hide behind! Hold!', 'NOWHERE TO GO!'], drv: null };
        const res = mk(plan.path, masks), rec = res.rec;
        // a destroyed vehicle stops where it was hit
        if (rec.killed && rec.kill_t != null) { let stop = null; for (const p of plan.path) { if (p[0] >= rec.kill_t) { if (!stop) stop = p.slice(); p[1] = stop[1]; p[2] = stop[2]; p[3] = stop[3]; p[4] = 0; } } }
        const v = { i: this.volleys.length, t0: this.t, tEnd: this.t + rec.t_end, at, path: plan.path, rec, cfg: res.c, launches, exposed, plan, masks };
        this.volleys.push(v);
        const names = launches.map(l => `${l.u.spec.name} #${l.u.id + 1} at ${(l.R / 1000).toFixed(2)} km, ${Math.round(l.brg).toString().padStart(3, '0')}`).join('; ');
        this.say(this.t, 'volley', null, `Enemy volley ${v.i + 1}: ${names}.`, `${teams.length} of the teams had a shot after ${waited.toFixed(0)} s, ${v_mode}; vehicle ${exposed === 'none' ? 'fully exposed' : exposed === 'hull' ? 'hull-down' : 'in cover'}`);
        masks.forEach((m, i) => { if (m != null) this.say(this.t + launches[i].t0 + 1, 'enemy', launches[i].u.id, `${launches[i].u.spec.name} #${launches[i].u.id + 1} loses sight of the vehicle behind cover.`, 'sight line broken'); });
        for (const e of rec.events) { this.say(this.t + e.t, 'engine', e.idx, e.text); this.log[this.log.length - 1].sub = e.kind; }
        for (const l of launches) { l.u.state = l.u.spec.needsLos ? 'guiding' : 'firing'; l.u.since = this.t; l.u.ammo--; l.u.fired++; l.u.volley = v.i; }
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
        const T = this.tank, W = this.world; if (!T.alive || T.main <= 0 || this._volleyActive() || this._pending || T.goal) return;   // fires from the halt only
        if (!this._rf) {
          let best = null; for (const k of T.known) { if (k.done) continue; const R = Math.hypot(k.e - T.e, k.n - T.n); if (R > 4200 || R < 60) continue; if (!W.los(T.e, T.n, 2.4, k.e, k.n, 1.0).clear) continue; if (!best || R < best.R) best = { k, R }; }
          if (!best) return; const u = this.units.find(q => q.id === best.k.id), brg = (Math.atan2(best.k.e - T.e, best.k.n - T.n) / DEG + 360) % 360;
          this._rf = { k: best.k, R: best.R, at: Math.max(this.t + 3.5 + best.R / 1000 * 1.3, T.mainReady) };
          this.say(this.t, 'tank', 'CDR', `Commander lays the main gun on the located ${u.spec.name} site, ${(best.R / 1000).toFixed(2)} km, bearing ${Math.round(brg).toString().padStart(3, '0')}.`, 'launch site fixed by the radar track at launch; clear line of sight from here');
          this.shots = this.shots || []; return;
        }
        if (this.t < this._rf.at) return;
        const { k, R } = this._rf, u = this.units.find(q => q.id === k.id), there = u.alive && u.state !== 'moving' && Math.hypot(u.e - k.e, u.n - k.n) < 25, tof = R / 1140, p = Math.max(0.4, Math.min(0.88, 0.92 - R / 5000)), roll = this.rng.random();
        T.main--; T.mainReady = this.t + 6; k.shots = (k.shots || 0) + 1; this._rf = null; let hit = false, text, why;
        if (!there) { k.done = true; u.known = false; text = `Main gun round strikes the ${u.spec.name} #${u.id + 1} launch site: nobody there.`; why = 'the team had already moved to its next position'; }
        else if (roll < p) { hit = true; u.alive = false; u.state = 'dead'; k.done = true; this.killedByTank = (this.killedByTank || 0) + 1; text = `Main gun round on ${u.spec.name} #${u.id + 1} at ${(R / 1000).toFixed(2)} km: position destroyed.`; why = `aimed fire from a halted vehicle at a fixed, located position (about ${Math.round(p * 100)}% at this range)`; }
        else { if (u.sites.length > 1 && u.ammo > 0) { u.site = (u.site + 1) % u.sites.length; u.state = 'moving'; u.since = this.t; k.done = true; u.known = false; } else { u.readyAt = Math.max(u.readyAt || 0, this.t + 45); if (k.shots >= 2) k.done = true; } text = `Main gun round lands close to ${u.spec.name} #${u.id + 1}: team shaken${u.state === 'moving' ? ', pulls out for its next position' : ', head down'}.`; why = 'a near miss: a dug-in team is a small target at this range'; }
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
        for (const th of rec.threats) { const u = this.units.find(q => q.id === th.uid); if (!u) continue; if (th.track != null && !u.spec.indirect) { u.known = true; if (!T.known.some(k => k.id === u.id)) T.known.push({ id: u.id, e: u.e, n: u.n, t: this.t }); } }
        for (const l of v.launches) { const u = l.u; u.readyAt = this.t + u.spec.reload; if (u.ammo > 0 && r.random() < S.scoot && u.sites.length > 1) { u.site = (u.site + 1) % u.sites.length; u.state = 'moving'; u.since = this.t; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1} breaks down and moves to its next position.`, 'shoot and scoot'); } else { u.state = u.ammo > 0 ? 'hidden' : 'spent'; u.sight = 0; } }
        const hits = rec.hits || 0; this.say(this.t, 'result', null, `Volley ${v.i + 1} over: ${rec.threats.length} fired, ${hits} hit${hits === 1 ? '' : 's'}. HKOI rounds left ${T.st.obs} obscurant, ${T.st.he} HE; Trophy ${T.st.apsL} left, ${T.st.apsR} right.`);
      }

      summary() {
        const T = this.tank, fired = this.volleys.reduce((s, v) => s + v.rec.threats.length, 0), hits = this.volleys.reduce((s, v) => s + (v.rec.hits || 0), 0), by = {};
        for (const v of this.volleys) for (const th of v.rec.threats) { const k = th.defeated_by || (th.viz.end.type === 'hit' ? 'HIT' : th.state); by[k] = (by[k] || 0) + 1; }
        return { t: +this.t.toFixed(1), alive: T.alive, volleys: this.volleys.length, fired, hits, by, obs: T.st.obs, he: T.st.he, apsL: T.st.apsL, apsR: T.st.apsR, crew: T.st.crew, teamsLeft: this.units.filter(u => u.alive && u.ammo > 0).length, main: T.main, killedByTank: this.killedByTank || 0, killedByMg: this.killedByMg || 0, coax: T.coax, m2: T.m2 };
      }
    }
    return { Battle, TEAMS, SKILL };
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKBattle = api;
})(typeof window !== 'undefined' ? window : globalThis);
