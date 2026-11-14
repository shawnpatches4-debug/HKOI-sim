// The enemy commander of a large group. He builds a picture of where the tank is ONLY from what his teams and vehicles report
// over the radio (late, and off by tens of metres) and from the sound of the tank's main gun; he works out where it is going from
// successive reports; and he gives orders from that picture: who watches where, who relocates (by truck when the team has one),
// who fixes the tank meanwhile, when the missile teams hold fire to strike together from two directions, when the tanks held in
// reserve are committed, and when the group breaks contact. He can be wrong, and the log says so when he is. If he is killed or
// loses his radio the teams go on by their own judgement, exactly as a group without a commander does.
// Installed onto the battle layer by enemyveh.js's hooks (it needs that module). Off unless the battle is created with
// commander: true, or commander: 'auto' and the group has 5 or more teams or any vehicle.
//
// ============================================================================================================================
// DATA CONTRACT (read only; rebuilt on every call)
//   battle.commander() -> null (this group has no commander) | {
//     alive, radio     false once he is killed / his radio is gone (then picture, predict and plan stay as they were at that moment)
//     with             { uid } | { vid }: the team or vehicle he is with;  e, n: where that is
//     picture          { e, n, t, age, r_m, off_m, src }   where he BELIEVES the tank is. t = when it was seen, age = seconds since,
//                      r_m = how uncertain he takes it to be (a radius to draw), src = 'report' | 'sound' | 'plan'.
//                      off_m = how far the belief is from the truth: the ONLY figure here that comes from the truth; show it in
//                      spectator views only.
//     predict          null | { path: [[e, n], ...], to: [e, n], why }   where he expects the tank to go, from his reports alone
//     sectors          [{ uid | vid, brg_from, brg_to }]   who he has told to watch which arc (bearings from that team, degrees)
//     plan             his CURRENT standing orders: [{ id, to: uid | vid | 'all', kind: 'watch' | 'hold_fire' | 'strike' | 'relocate' |
//                      'fix' | 'commit' | 'break', from: [e, n], dest: [e, n] | null, route: [[e, n], ...] | null, by: 'foot' | 'uaz' | 'own',
//                      t_order, t_eta | null, done, text, wrong, off_m }]   (ids of teams are below 100, of vehicles 100 and up)
//     orders           the last 12 order events
//   }
//   battle.commanderAt(t) -> the same shape for an earlier time, rebuilt from what was recorded (picture.off_m is null there; routes
//     are as last known). A replay that re-runs the battle to time t gets the same answer from commander().
//   event: order { id, to, kind, text, wrong, off_m, from: [e, n], dest: [e, n] | null }   kind also 'cdr_lost'
//   battle.cdrReport() -> counts for tests and a debrief.
// ============================================================================================================================
//
// ASSUMPTIONS (Claude, 14 Nov 2026; judgement, not data; nothing tuned to a result)
// | What | Green | Trained | Expert | Veteran |
// | --- | --- | --- | --- | --- |
// | A sighting reaches him after (s, x0.7 to x1.3) | 12 | 7 | 4 | 3 |
// | Error of a reported position at 2 km (m, one standard deviation; scales with range, 0.3x to 2x) | 90 | 50 | 30 | 20 |
// | He reviews the situation every (s) | 30 | 20 | 12 | 10 |
// | An order takes this long to pass and be acted on (s) | 15 | 8 | 5 | 4 |
// | Longest he holds the missile teams for a strike from two directions (s) | never orders one | 25 | 40 | 45 |
// Other figures: a team in sight of the tank reports every 8 s; a report is stale after 60 s; he hears the main gun out to 4 km and
// places it to within 8% of the distance (bearing and a rough range), after the sound's travel time; a strike needs two launchers
// at least 40 degrees apart as seen from the tank, both loaded or within 10 s of it; when three or more launchers cover the tank
// and all stand within 40 degrees of each other, one that has a truck is sent 75 degrees round to a flank; one relocation order per review and never more than half the missile teams on
// the move; a team is not moved again within 120 s; tanks in reserve are committed when the ambush is open and either the picture
// is fresh (under 25 s) with the tank's gun heard or his teams firing, or two minutes have passed, or nobody has had a shot for
// 90 s; he breaks contact when the share of teams and vehicles still able to fight falls to the crews' own breaking point plus 5
// points, a tank counting as three teams and a BMP as two (an ordered withdrawal comes a little before a rout); his radio is lost 30% of the time when his vehicle is struck and
// survives, and is silent while his team is pinned; his picture counts as "wrong" when it is more than 150 m from the truth.
(function (root) {
  'use strict';
  const DEG = Math.PI / 180, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const brgOf = (e0, n0, e1, n1) => (Math.atan2(e1 - e0, n1 - n0) / DEG + 360) % 360, angDiff = (a, b) => ((a - b + 540) % 360) - 180;
  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const compass = b => COMPASS[Math.round((((b % 360) + 360) % 360) / 45) % 8];
  const km = R => R >= 1000 ? (R / 1000).toFixed(2) + ' km' : Math.round(R / 10) * 10 + ' m';
  const P2 = (e, n) => [Math.round(e), Math.round(n)];

  const CSK = {
    green: { delay: 12, err: 90, think: 30, pass: 15, strike: 0, open: 0, tot: 0 },
    trained: { delay: 7, err: 50, think: 20, pass: 8, strike: 25, open: 40, tot: 0 },
    expert: { delay: 4, err: 30, think: 12, pass: 5, strike: 40, open: 60, tot: 1 },
    veteran: { delay: 3, err: 20, think: 10, pass: 4, strike: 45, open: 75, tot: 0.5 },
  };
  // The teams' own judgement by crew level (works with or without a commander; green crews do none of it). partner: how long a
  // team whose last missile was blinded by HKOI waits for another launcher to fire with it (s); rpgOpen: a rocket team will not start
  // a stalk from further than 350 m unless at least this share of the way is in cover; flee: chance that a team moves when the team
  // beside it (within 150 m) is destroyed; tot: expert and veteran crews firing together time their launches so the missiles ARRIVE
  // together even without a commander (ranges are known from the ambush plan), to within this many seconds; trained crews do not.
  // Assumed values.
  const TSK = { green: null, trained: { partner: 15, rpgOpen: 0.5, flee: 0.5, tot: 0 }, expert: { partner: 25, rpgOpen: 0.5, flee: 1, tot: 1.5 }, veteran: { partner: 30, rpgOpen: 0.6, flee: 1, tot: 1 } };
  const SALVO = 3, STAY_S = 60, DRONE_LEAD = 1.5, DEAD_R = 150, DEAD_S = 90, PLAN_AHEAD = 240;
  const quad = b => Math.floor((((b % 360) + 360 + 45) % 360) / 90);   /* which quarter of the compass a bearing lies in: 0 north, 1 east, 2 south, 3 west */
  const REPORT_EVERY = 8, STALE = 60, HEAR = 4000, WRONG_M = 150, SEP = 40, NO_MOVE_AGAIN = 120;
  const MISSILE = { kornet: 1, saclos: 1, sal: 1 };

  let HK = null, TEAMS = null, SKILL = null;

  const methods = {
    _cdrWanted(force) {
      const o = this.xOpt && this.xOpt.commander; if (!o) return false; if (o === true) return true;
      let teams = 0, veh = false; for (const f of force || []) { if (!f) continue; if (TEAMS[f.type]) teams += f.n || 1; else veh = true; if (f.ride) veh = true; }
      return teams >= 5 || veh;
    },
    _cdrInit(force, side) {
      const old = this.cdr; if (old && old.alive) this._cdrClose(old);
      if (!this._cdrWanted(force)) { this.cdr = null; return; }
      const T = this.tank, K = CSK[this.skill] || CSK.trained, wave = this.wave || 0;
      const teams = this.units.slice(this.waveFrom || 0).filter(u => u.alive && !u.gone), vehs = (this.vehs || []).filter(v => v.wave === wave && v.K.armed && v.alive);
      // where he is: with the missile team furthest from the tank when the group has three or more teams (a command post behind the
      // line); otherwise in the senior tank if there is one, else in a BMP
      const far = teams.filter(u => !u.spec.indirect && u.spec.key !== 'rpg').sort((a, b) => Math.hypot(b.e - T.e, b.n - T.n) - Math.hypot(a.e - T.e, a.n - T.n));
      let host = teams.length >= 3 && far.length ? far[0] : vehs.find(v => v.kind === 't90') || vehs.find(v => v.kind === 't72') || vehs[0] || far[0] || teams[0] || null;
      if (!host) { this.cdr = null; return; }
      const st = this._cdrStat || (this._cdrStat = { groups: 0, orders: 0, wrong: 0, byKind: {}, wrongByKind: {}, reviews: 0, reviewsWrong: 0, reviewsStale: 0, offSum: 0, ageSum: 0, strikes: 0, strikesTimedOut: 0, lost: 0, lostWhy: {}, reports: 0, heard: 0, decided: 0, heldSec: 0, firstOrderT: [], picByAge: [[0, 0], [0, 0], [0, 0], [0, 0]], salvos: 0, salvoN: 0, salvoTwo: 0, openHeld: 0, openWhy: {}, tot: 0, pulled: 0, rpgHeld: 0, scout: 0 });
      st.groups++;
      const C = this.cdr = { on: true, alive: true, radio: true, host, K, wave, rng: new HK.RNG(HK.seedFor(this.seed, 9003 + wave)), seq: (old ? old.seq : 0), pic: { e: T.e, n: T.n, t: this.t, r: 60, src: 'plan' }, track: [], predict: null,
        reports: [], queue: [], plan: new Map(), log: old ? old.log : [], hist: old ? old.hist : [], events: old ? old.events : [], nextThink: this.t + K.think, tickAt: 0, strike: null, strikeCool: 0, shotsSeen: (this.shots || []).length, gunHeardAt: -1e9, lostAt: null, st, holdSince: null, salvoSince: null, fire: { state: 'free', since: this.t, until: null, want: 0, ready: 0 }, volSeen: this.volleys.length, radioOk: true,
        intel: this._cdrIntel || (this._cdrIntel = { aps: [0, 0, 0, 0], hit: [0, 0, 0, 0], dead: [] }) };
      C.hist.push({ t: this.t, picture: { e: C.pic.e, n: C.pic.n, t: C.pic.t, r_m: C.pic.r, src: 'plan' }, predict: null, host: host.id });
      this.say(this.t, 'enemy', host.id, `The enemy group has a commander, with ${host.veh ? host.K.name : host.spec.name} #${host.id + 1}.`, 'he gets his teams\' reports by radio and gives the orders; without him each team fights on its own judgement');
      // first orders: who watches where
      for (const u of teams.concat(vehs)) { if (u.spec && u.spec.indirect) continue; const b = brgOf(u.e, u.n, T.e, T.n); this._cdrOrder(u, 'watch', `watch the ground to the ${compass(b)}`, { dest: null, by: u.veh ? 'own' : 'foot', sector: [(b + 340) % 360, (b + 20) % 360], quiet: true }); }
      void side;
    },
    _cdrClose(C) {
      C.on = false; for (const o of C.plan.values()) if (o.t_end == null) o.t_end = this.t;
      // what he passes to the next group: come from the side where Trophy has been seen to run dry, or else from behind the way the
      // tank has been made to face (opposite the middle of this group's firing points). The battle layer brings the next wave in
      // within 80 degrees of the bearing set here.
      if (C.alive && this.wave < this.nWaves - 1 && C.K.strike > 0) {
        const I = C.intel, T = this.tank; let want = null, why = '';
        for (let q = 0; q < 4; q++) if (I.aps[q] >= 4) { want = q * 90; why = `Trophy has been seen to fire ${I.aps[q]} times toward the ${compass(q * 90)}: he takes that side to be empty`; }
        if (want == null) { let se = 0, sn = 0, n = 0; for (let i = this.waveFrom || 0; i < this.units.length; i++) { const u = this.units[i]; if (u.spec.indirect) continue; const b = brgOf(T.e, T.n, u.e, u.n) * DEG; se += Math.sin(b); sn += Math.cos(b); n++; } if (n) { want = (Math.atan2(-se, -sn) / DEG + 360) % 360; why = 'the tank has turned to face this group: the next comes from behind it'; } }
        if (want != null) { this.waveBrg = (want + 180) % 360; this.say(this.t, 'enemy', null, `The commander's word to the next group: come in from the ${compass(want)}.`, why); }
      }
    },
    _cdrMembers(C) {
      const teams = [], vehs = [];
      for (let i = this.waveFrom || 0; i < this.units.length; i++) { const u = this.units[i]; if (u.alive && !u.gone) teams.push(u); }
      for (const v of this.vehs || []) if (v.wave === C.wave && v.K.armed && v.alive && !v.gone) vehs.push(v);
      return { teams, vehs };
    },
    // issue one order: it goes into the event list, the log, the standing plan, and onto the unit so the team menu can show it
    _cdrOrder(u, kind, text, o) {
      const C = this.cdr, T = this.tank; o = o || {}; const id = ++C.seq, all = u === 'all', to = all ? 'all' : u.id, h = C.host;
      const off = o.off != null ? o.off : Math.hypot(C.pic.e - T.e, C.pic.n - T.n), wrong = o.wrong != null ? o.wrong : off > WRONG_M;
      const from = all ? P2(h.e, h.n) : P2(u.e, u.n), dest = o.dest ? P2(o.dest.e, o.dest.n) : null;
      const ent = { id, to, kind, from, dest, route: o.route || null, by: o.by || 'foot', t_order: +this.t.toFixed(1), t_eta: o.eta != null ? +(this.t + o.eta).toFixed(0) : null, done: false, text, wrong, off_m: Math.round(off), t_end: null, sector: o.sector || null };
      const prev = C.plan.get(to); if (prev && prev.t_end == null) prev.t_end = this.t;
      C.plan.set(to, ent); C.log.push(ent);
      if (!all) { if (u.veh) u.order = ent; else u.cdrOrder = ent; }
      const e = { id, to, kind, text, wrong, off_m: Math.round(off), from, dest }; this.ev(this.t, 'order', e); C.events.push(Object.assign({ t: +this.t.toFixed(2), type: 'order' }, e));
      C.st.orders++; C.st.byKind[kind] = (C.st.byKind[kind] || 0) + 1; if (wrong) { C.st.wrong++; C.st.wrongByKind[kind] = (C.st.wrongByKind[kind] || 0) + 1; }
      if (kind !== 'watch' && C.st.firstOrderT.length < C.st.groups) C.st.firstOrderT.push(+this.t.toFixed(1));
      if (!o.quiet) { const name = all ? 'the group' : `${u.veh ? u.K.name : u.spec.name} #${u.id + 1}`, age = Math.round(this.t - C.pic.t);
        this.say(this.t, 'enemy', all ? null : u.id, `Commander orders ${name}: ${text}.`, (o.why ? o.why + '; ' : '') + (wrong ? `HE IS WRONG: his last word of the vehicle is ${age} s old and it is in fact ${Math.round(off / 10) * 10} m from where he thinks` : `his picture of the vehicle is ${age} s old`)); }
      return ent;
    },
    _cdrLost(why, key) {
      const C = this.cdr; if (!C || !C.alive) return; C.alive = false; C.lostAt = this.t; C.strike = null; C.queue.length = 0; C.st.lost++; C.st.lostWhy[key] = (C.st.lostWhy[key] || 0) + 1;
      for (const o of C.plan.values()) if (o.t_end == null) o.t_end = this.t;
      for (const u of this.units) u.cdrOrder = null;
      for (const v of this.vehs || []) { v.order = null; if (v.reserve) { v.reserve = false; v.lookAt = this.t + 30; } }   /* tanks in reserve come up on their own judgement after a while */
      const id = ++C.seq, h = C.host, e = { id, to: 'all', kind: 'cdr_lost', text: why, wrong: false, off_m: 0, from: P2(h.e, h.n), dest: null }; this.ev(this.t, 'order', e); C.events.push(Object.assign({ t: +this.t.toFixed(2), type: 'order' }, e));
      this.say(this.t, 'enemy', null, `The enemy commander is out of it: ${why}.`, 'from now on every team and vehicle acts on its own judgement');
    },
    _cdrVehHit(v) { const C = this.cdr; if (!C || !C.alive || C.host !== v || !v.alive) return; if (C.rng.random() < 0.3) { C.radio = false; this._cdrLost(`the radio in his ${v.K.name} is knocked out by the hit`, 'radio'); } },

    // ---------------------------------------------------------------- every step (cheap), reports once a second, a review every 10 to 30 s
    _cdrStep(dt) {
      const C = this.cdr; if (!C || !C.on || !C.alive) return; void dt;
      const T = this.tank, h = C.host;
      if (h.alive && h.gone) { this._cdrClose(C); return; }   /* the group has pulled out and he has gone with it */
      if (!h.alive) { this._cdrLost(h.veh ? `his ${h.K.name} #${h.id + 1} is ${h.burning ? 'burning' : h.gone ? 'out of the fight' : 'abandoned'}` : `${h.spec.name} #${h.id + 1}, the team he was with, is ${h.gone ? 'out of the fight' : 'destroyed'}`, h.gone ? 'withdrew' : 'killed'); return; }
      while (C.queue.length && C.queue[0].at <= this.t) { const q = C.queue.shift(); q.run(); if (!C.alive) return; }
      if (this.t < C.tickAt) return; C.tickAt = this.t + 1;
      { const b = this.t < 30 ? 0 : this.t < 60 ? 1 : this.t < 120 ? 2 : 3, q = C.st.picByAge[b]; q[0]++; q[1] += Math.hypot(C.pic.e - T.e, C.pic.n - T.n); }   /* for the tests: how far off his picture is as the battle goes on */
      const radio = !(h.veh ? false : this.t < (h.suppressedUntil || 0) || h.mounted);   /* a commander flat on his face, or bouncing in a truck, is not on the net */
      // 1. sightings by his teams and vehicles, each sent with a delay and an error
      const M = this._cdrMembers(C), K = C.K, r = C.rng;
      const report = (u, sees) => { if (!sees || this.t < (u._repAt || 0)) return; u._repAt = this.t + REPORT_EVERY; const R = Math.hypot(T.e - u.e, T.n - u.n), sig = K.err * clamp(R / 2000, 0.3, 2);
        C.reports.push({ at: this.t + (u === h ? 0.5 : K.delay * (0.7 + 0.6 * r.random())), e: T.e + r.normal(0, sig), n: T.n + r.normal(0, sig), obs: this.t, r: sig * 1.5, src: 'report' }); C.st.reports++; };
      for (const u of M.teams) if (!u.spec.indirect && u.state !== 'moving' && !(this.t < (u.suppressedUntil || 0))) report(u, u.lastSeen != null && this.t - u.lastSeen < 1.05);
      for (const v of M.vehs) report(v, v.sees && v.state !== 'moving');
      // 1b. a drone on its way in sees the tank and its pilot passes it on (good to about 15 m, every 5 s inside 2.5 km)
      for (const d of this.transit || []) { if ((d.u.wave || 0) !== C.wave || this.t < (d._rep || 0)) continue; const left = d.R0 - (this.t - d.t0) * ((HK.THREATS[d.key] || {}).speed || 30); if (left > 2500) continue; d._rep = this.t + 5;
        C.reports.push({ at: this.t + K.delay * 0.5, e: T.e + r.normal(0, 15), n: T.n + r.normal(0, 15), obs: this.t, r: 25, src: 'report' }); C.st.reports++; C.st.scout++; }
      // 2. the sound of the tank's main gun
      const S = this.shots || []; for (; C.shotsSeen < S.length; C.shotsSeen++) { const s = S[C.shotsSeen], R = Math.hypot(s.from.e - h.e, s.from.n - h.n); if (R > HEAR) continue; const sig = 0.08 * R; C.reports.push({ at: s.t + R / 340, e: s.from.e + r.normal(0, sig), n: s.from.n + r.normal(0, sig), obs: s.t, r: sig * 1.5, src: 'sound' }); C.st.heard++; }
      // 3. what has reached him
      if (radio && C.reports.length) {
        let changed = false; C.reports.sort((a, b) => a.at - b.at);
        while (C.reports.length && C.reports[0].at <= this.t) { const q = C.reports.shift(); if (q.src === 'sound') { C.gunHeardAt = q.obs; if (C.pic.src === 'report' && q.obs - C.pic.t < 20) continue; }   /* a fresh sighting beats a sound */
          if (q.obs <= C.pic.t) continue; C.pic = { e: q.e, n: q.n, t: q.obs, r: q.r, src: q.src }; if (q.src === 'report') { C.track.push({ e: q.e, n: q.n, t: q.obs, r: q.r }); if (C.track.length > 8) C.track.shift(); } changed = true; }
        if (changed) { this._cdrPredict(C); C.hist.push({ t: +this.t.toFixed(1), picture: { e: C.pic.e, n: C.pic.n, t: C.pic.t, r_m: Math.round(C.pic.r), src: C.pic.src }, predict: C.predict, host: h.id }); }
      } else if (!radio) C.reports = C.reports.filter(q => q.at > this.t - 5);
      C.radioOk = radio;
      // 3b. what the last engagements showed: where Trophy fired (he counts its shots by quarter of the compass), where missiles got through
      for (; C.volSeen < this.volleys.length && this.volleys[C.volSeen].done; C.volSeen++) { const v = this.volleys[C.volSeen];
        for (const th of v.rec.threats) { const l = v.launches.find(q => q.u.id === th.uid); if (!l) continue; const q = quad(l.brg), I = C.intel;
          if (th.defeated_by === 'aps') { I.aps[q]++; if (I.aps[q] > 4) I.aps[q] = 1; }   /* a fifth shot from a side he had written off: he was wrong, or the tank has turned; he starts the count again */
          else if (th.state === 'hit') I.hit[q]++; } }
      // 3c. teams lost: the ground around them is ground the tank's sights and guns dominate. A team lying close by is ordered out.
      if (K.strike > 0) {
        for (let i = this.waveFrom || 0; i < this.units.length; i++) { const u = this.units[i]; if (!u.alive && !u._cdrDead) { u._cdrDead = true; C.intel.dead.push({ e: u.e, n: u.n, t: this.t }); } }
        const dead = C.intel.dead.filter(d => this.t - d.t < DEAD_S);
        if (dead.length && radio) for (const u of M.teams) { if (u.state !== 'hidden' || u.hasShot || u.ammo <= 0 || u.spec.indirect || this.t - (u._cdrMoved || -1e9) < NO_MOVE_AGAIN) continue;
          if (!dead.some(d => Math.hypot(d.e - u.e, d.n - u.n) < DEAD_R)) continue; u._cdrMoved = this.t; C.st.decided++;
          C.queue.push({ at: this.t + K.pass, run: () => { if (!u.alive || u.gone || u.state !== 'hidden') return; if (this._displace(u, 'ordered out by the commander: a team has just been destroyed beside it')) { const g = u.sites[u.site]; C.st.pulled++; this._cdrOrder(u, 'relocate', 'get off that ground: the tank has shown it can reach it', { dest: g, by: 'foot', why: `a team was destroyed within ${DEAD_R} m of it`, eta: Math.hypot(g.e - u.e, g.n - u.n) / u.spec.move + 15 + u.spec.setup, route: this._cdrRoute(u) }); } } }); break; }
        // 3d. rocket teams stay hidden until the tank is coming inside their reach: no walking 500 m across the front of a thermal sight
        const P = C.predict && C.predict.moving ? C.predict.path : [[C.pic.e, C.pic.n]];
        for (const u of M.teams) { if (u.spec.key !== 'rpg' || u.state !== 'hidden') continue; let dmin = 1e9; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[Math.min(P.length - 1, k + 1)], dx = b[0] - a[0], dn = b[1] - a[1], L2 = dx * dx + dn * dn, f = L2 ? clamp(((u.e - a[0]) * dx + (u.n - a[1]) * dn) / L2, 0, 1) : 0; dmin = Math.min(dmin, Math.hypot(u.e - a[0] - dx * f, u.n - a[1] - dn * f)); }
          if (dmin > 450) { u.nextLook = Math.max(u.nextLook || 0, this.t + 3); if (!u._cdrHeld) { u._cdrHeld = true; C.st.rpgHeld++; this._cdrOrder(u, 'watch', 'stay hidden and wait: fire only when it comes inside 300 m', { dest: null, by: 'foot', sector: [(brgOf(u.e, u.n, C.pic.e, C.pic.n) + 340) % 360, (brgOf(u.e, u.n, C.pic.e, C.pic.n) + 20) % 360], quiet: true }); } u.waitAmbush = true; }
          else { u.waitAmbush = false; u._cdrHeld = false; } }
      }
      // 4. standing orders that have been carried out
      for (const o of C.plan.values()) { if (o.done || o.t_end != null) continue; const u = o.to === 'all' ? null : o.to >= 100 ? (this.vehs || []).find(v => v.id === o.to) : this.units[o.to];
        if (u && (!u.alive || u.gone)) { o.t_end = this.t; continue; }
        if (u && (o.kind === 'relocate' || o.kind === 'fix' || o.kind === 'commit')) { const rt = this._cdrRoute(u); if (rt) o.route = rt; if (this.t - o.t_order > 3 && u.state !== 'moving' && !u.ride) { o.done = true; o.t_done = this.t; } }
        else if (o.kind === 'hold_fire' && C.fire.state === 'free') { o.done = true; o.t_done = this.t; } else if ((o.kind === 'strike' || o.kind === 'break') && this.t - o.t_order > 10) { o.done = true; o.t_done = this.t; } }
      for (const [k, o] of C.plan) if ((o.done && this.t - o.t_done > 15) || o.t_end != null) { if (o.t_end == null) o.t_end = this.t; C.plan.delete(k); }
      if (radio && this.t >= C.nextThink) { C.nextThink = this.t + K.think; this._cdrThink(C, M); }
    },
    // the way a unit under orders is going, for an arrow on a map: [[e, n], ...] from where it is now
    _cdrRoute(u) {
      const out = [[Math.round(u.e), Math.round(u.n)]], add = p => out.push([Math.round(p[0]), Math.round(p[1])]);
      if (u.veh) { if (u.state !== 'moving' || !u.route) return null; for (let i = u.routeI; i < u.route.length; i++) add(u.route[i]); return out; }
      if (u.ride) { const R = u.ride, v = u.rideVeh; if (v) { if (R.phase === 'pack' || R.phase === 'toVeh' || R.phase === 'load') add([v.e, v.n]); if (v.state === 'moving' && v.route) for (let i = v.routeI; i < v.route.length; i++) add(v.route[i]); } add([R.dp.e, R.dp.n]); add([R.fp.e, R.fp.n]); return out; }
      if (u.state !== 'moving') return null; if (u.route) for (let i = u.routeI || 0; i < u.route.length; i++) add(u.route[i]); const g = u.sites[u.site]; if (g) add([g.e, g.n]); return out;
    },
    // Where he expects the tank to go, from his own reports only. Has it moved at least 250 m (and well beyond the reports' error)
    // between the first and the last report of the past two and a half minutes, and is it still moving the same way? Then he extends its track to where it will be in about four minutes (the time a team needs to
    // move and set up): along a road if one runs its way within 200 m, toward a village or town if one lies ahead within 30 degrees
    // and 3 km (the obvious objective on the map), otherwise straight on. He never reads the tank's real objective.
    _cdrPredict(C) {
      const tr = C.track.filter(p => C.pic.t - p.t < 150), p = C.pic, W = this.world;
      if (tr.length < 2) { C.predict = null; return; }
      const a = tr[0], b = tr[tr.length - 1], dt = b.t - a.t, d = Math.hypot(b.e - a.e, b.n - a.n);
      const c = tr[tr.length - 2], dl = Math.hypot(b.e - c.e, b.n - c.n), tl = Math.max(1, b.t - c.t), still = tr.length >= 3 && (dl < (b.r + c.r) / 3 || dl / tl < 1);
      // real movement, not a shuffle between fighting positions: at least 250 m and three times the reports' error, and the last leg
      // still going the same way
      const along = dl > 0 && d > 0 ? ((b.e - c.e) * (b.e - a.e) + (b.n - c.n) * (b.n - a.n)) / (dl * d) : 0;
      if (!(dt >= 8 && d > Math.max(250, 2 * (a.r + b.r)) && !still && (tr.length < 3 || along > 0.3))) {
        C.predict = { path: [P2(p.e, p.n)], to: P2(p.e, p.n), why: `${tr.length} reports over ${Math.round(dt)} s show no real movement: he expects it to stay where it is`, moving: false, kind: 'staying', v: 0, eta_s: 0, r_m: Math.round(p.r) }; return; }
      const v = Math.min(12, d / dt), brg = brgOf(a.e, a.n, b.e, b.n), reach = clamp(v * PLAN_AHEAD, 150, 1500);
      let path = null, kind = 'heading', how = 'he expects it to keep going that way';
      // a road going its way?
      for (const rd of W.roads || []) { const pts = rd.pts; let bi = -1, bd = 200; for (let i = 0; i < pts.length; i++) { const q = Math.hypot(pts[i][0] - p.e, pts[i][1] - p.n); if (q < bd) { bd = q; bi = i; } }
        if (bi < 0) continue; const dir = bi < pts.length - 1 && Math.abs(angDiff(brgOf(pts[bi][0], pts[bi][1], pts[bi + 1][0], pts[bi + 1][1]), brg)) < 35 ? 1 : bi > 0 && Math.abs(angDiff(brgOf(pts[bi][0], pts[bi][1], pts[bi - 1][0], pts[bi - 1][1]), brg)) < 35 ? -1 : 0; if (!dir) continue;
        path = [P2(p.e, p.n)]; let left = reach, pe = p.e, pn = p.n; for (let i = bi + dir; i >= 0 && i < pts.length && left > 0; i += dir) { const seg = Math.hypot(pts[i][0] - pe, pts[i][1] - pn), f = Math.min(1, left / Math.max(1, seg)); pe += (pts[i][0] - pe) * f; pn += (pts[i][1] - pn) * f; left -= seg; path.push(P2(pe, pn)); }
        kind = 'road'; how = 'it is on a road going that way: he expects it to follow the road'; break; }
      // a village or town ahead?
      if (!path) for (const pl of W.places || []) { const R = Math.hypot(pl.e - p.e, pl.n - p.n); if (R < 200 || R > 3000 || Math.abs(angDiff(brgOf(p.e, p.n, pl.e, pl.n), brg)) > 30) continue; const f = Math.min(1, reach / R); path = [P2(p.e, p.n), P2(p.e + (pl.e - p.e) * f, p.n + (pl.n - p.n) * f)]; kind = 'objective'; how = `${pl.kind === 'town' ? 'the town' : 'a village'} lies ${Math.round(R / 100) * 100} m ahead on that line: he takes it for the objective`; break; }
      if (!path) path = [P2(p.e, p.n), P2(p.e + Math.sin(brg * DEG) * reach, p.n + Math.cos(brg * DEG) * reach)];
      const to = path[path.length - 1];
      C.predict = { path, to, why: `${tr.length} reports over ${Math.round(dt)} s put it ${Math.round(d / 10) * 10} m further ${compass(brg)} (about ${Math.round(v * 3.6)} km/h with its halts); ${how}. The far end is where he expects it in about ${Math.round(PLAN_AHEAD / 60)} minutes`, moving: true, kind, v, eta_s: PLAN_AHEAD, r_m: Math.round(p.r + reach * 0.35) };
    },
    // how wide his uncertainty is now: the report's own error, growing with every second since (faster if he thinks the tank is moving)
    _cdrSpread(C, t) { const p = C.pic, age = Math.max(0, t - p.t), rate = C.predict && C.predict.moving ? clamp(C.predict.v, 2, 8) : 1.5; return Math.round(Math.min(1200, p.r + age * rate)); },
    // ground near a team from which it can cover a place: a handful of samples inside a walk, away from where teams have just been lost
    _cdrSite(u, P, C) {
      const W = this.world, r = C.rng, sp = u.spec, dead = C.intel.dead.filter(d => this.t - d.t < DEAD_S * 2); let best = null;
      const lo = sp.rmin >= 1000 ? sp.rmin * 1.03 : sp.rmin * 1.2, hi = Math.min(sp.rmax * 0.85, 3800);
      for (let q = 0; q < 16; q++) { const a = r.random() * 6.283, d = 60 + r.random() * 540, e = u.e + Math.sin(a) * d, n = u.n + Math.cos(a) * d; if (!W.inside(e, n) || !W.passable(e, n, false)) continue;
        const R = Math.hypot(P.e - e, P.n - n); if (R < lo || R > hi || !W.los(e, n, sp.agl, P.e, P.n, 2.2).clear) continue;
        const veg = W.veg(e, n).cls, s = (veg >= 3 && veg <= 5 ? 1 : veg === 2 ? 0.5 : 0) - d / 400 - (dead.some(k => Math.hypot(k.e - e, k.n - n) < DEAD_R) ? 3 : 0) + r.random() * 0.3; if (!best || s > best.s) best = { e, n, s, sees: true }; }
      return best;
    },
    // the review: look at the picture and give orders. A few sight lines per team; nothing map-wide.
    _cdrThink(C, M) {
      const T = this.tank, W = this.world, S = SKILL[this.skill], K = C.K, pic = C.pic, age = this.t - pic.t, off = Math.hypot(pic.e - T.e, pic.n - T.n);
      C.st.reviews++; C.st.offSum += off; C.st.ageSum += age; if (off > WRONG_M) C.st.reviewsWrong++; if (age > STALE) C.st.reviewsStale++;
      const ahead = !!(C.predict && C.predict.moving), P = ahead ? { e: C.predict.to[0], n: C.predict.to[1] } : { e: pic.e, n: pic.n };   /* the place he plans against: where the tank is, or where he expects it in four minutes */
      const ctx = { off, wrong: off > WRONG_M };   /* wrong is judged on where he thinks the vehicle IS; a forecast cannot be checked against the present */
      const later = (run) => { C.st.decided++; C.queue.push({ at: this.t + K.pass, run }); };
      const armed = M.teams.concat(M.vehs), wt = u => (u.veh ? u.K.weight : 1), sumW = a => a.reduce((x, u) => x + wt(u), 0), all = this.units.slice(this.waveFrom || 0).concat((this.vehs || []).filter(v => v.wave === C.wave && v.K.armed)), able = armed.filter(u => u.ammo > 0), nAll = sumW(all), nAble = sumW(able);
      // ---- break contact
      if (this.opened && all.length >= 2 && able.length > 0 && able.length < all.length && nAble / nAll <= S.breakAt + 0.05 && !this._volleyActive() && !this._pending && !C.breaking) {
        C.breaking = true;
        later(() => { if (this._volleyActive() || this._pending) { C.breaking = false; return; } this._cdrOrder('all', 'break', `break contact: ${Math.round(100 * nAble / nAll)}% of the group's strength is left (${able.length} of ${all.length} teams and vehicles)`, { by: 'own', off: ctx.off, wrong: false, why: 'an ordered withdrawal before the group is destroyed' });
          for (const u of this._cdrMembers(C).teams) { u.gone = true; u.known = false; } for (const v of this._cdrMembers(C).vehs) v.gone = true; for (const k of T.known) k.done = true; });
        return;
      }
      if (!this.opened && !this.pressing) return;   /* until the ambush is sprung the plan stands */
      // ---- commit the tanks held in reserve
      const reserve = M.vehs.filter(v => v.reserve);
      if (reserve.length) {
        const firing = armed.some(u => this.t - (u.lastShotT || -1e9) < 20 && (u.fired || 0) > 0), why = age < 25 && (this.t - C.gunHeardAt < 30 || firing) ? (this.t - C.gunHeardAt < 30 ? 'the vehicle is fixed and its gun is busy' : 'the vehicle is fixed by his teams\' fire') : this.t - (this.openedAt || this.t) > 120 ? 'two minutes into the fight' : this.pressing ? 'nobody has had a shot for a minute and a half' : null;
        // from the flank, not at the tank's front: the tank faces his firing teams, so the armour comes in about 80 degrees round from
        // the middle of them, on whichever side it already stands
        let se = 0, sn = 0; for (const u of M.teams) if (!u.spec.indirect) { const b = brgOf(P.e, P.n, u.e, u.n) * DEG; se += Math.sin(b); sn += Math.cos(b); }
        const mid = se || sn ? (Math.atan2(se, sn) / DEG + 360) % 360 : null, flankBrg = v => { const mine = brgOf(P.e, P.n, v.e, v.n); if (mid == null || K.strike <= 0) return null; const d = angDiff(mine, mid); return (mid + (d >= 0 ? 80 : -80) + 360) % 360; };
        if (why) for (const v of reserve) { v.reserve = false; v.lookAt = this.t + K.pass + 20; later(() => { if (!v.alive || v.gone) return; const ok = this._vehSeek(v, P, 'committed by the commander, from the flank', { advance: true, brg0: flankBrg(v) }); this._cdrOrder(v, 'commit', ok ? 'move up on the flank, hull-down, and engage the vehicle' : 'engage the vehicle as soon as it shows', { dest: ok ? { e: v.route[v.route.length - 1][0], n: v.route[v.route.length - 1][1] } : null, by: 'own', off: ctx.off, wrong: ctx.wrong, why, eta: ok ? Math.hypot(v.route[v.route.length - 1][0] - v.e, v.route[v.route.length - 1][1] - v.n) / 6 : null }); }); }
      }
      // ---- who can cover the place he plans against?
      const shooters = [], blind = [];
      for (const u of M.teams) { if (!MISSILE[u.spec.key] || u.ammo <= 0) continue; if (u.state === 'moving') { shooters.push({ u, brg: brgOf(P.e, P.n, u.sites[u.site] ? u.sites[u.site].e : u.e, u.sites[u.site] ? u.sites[u.site].n : u.n), moving: true }); continue; }
        const R = Math.hypot(P.e - u.e, P.n - u.n), covers = R >= u.spec.rmin && R <= u.spec.rmax && W.los(u.e, u.n, u.spec.agl, P.e, P.n, 2.2).clear;
        const now = ahead && (() => { const R0 = Math.hypot(pic.e - u.e, pic.n - u.n); return R0 >= u.spec.rmin && R0 <= u.spec.rmax && W.los(u.e, u.n, u.spec.agl, pic.e, pic.n, 2.2).clear; })();   /* it still has the tank in its sights: leave it be */
        if (covers) shooters.push({ u, brg: brgOf(P.e, P.n, u.e, u.n) }); else if (now) shooters.push({ u, brg: brgOf(P.e, P.n, u.e, u.n), passing: true }); else if (u.state === 'hidden' && !(this.t < (u.suppressedUntil || 0))) blind.push(u); }
      for (const v of M.vehs) if (v.kind === 'bmp2' && v.msl > 0 && v.canFire && v.state !== 'moving') { const R = Math.hypot(P.e - v.e, P.n - v.n); if (R <= v.spec.rmax && R >= 400 && W.los(v.e, v.n, v.K.agl, P.e, P.n, 2.2).clear) shooters.push({ u: v, brg: brgOf(P.e, P.n, v.e, v.n) }); }
      // ---- relocate one team that cannot cover it, to a flank away from the launchers that can
      const nMissile = M.teams.filter(u => MISSILE[u.spec.key] && u.ammo > 0).length, nMoving = M.teams.filter(u => MISSILE[u.spec.key] && u.state === 'moving').length;
      let relocating = false;
      if (blind.length && nMoving * 2 < nMissile) {
        blind.sort((a, b) => (b.rideVeh && b.rideVeh.alive ? 1 : 0) - (a.rideVeh && a.rideVeh.alive ? 1 : 0));
        const u = blind.find(q => this.t - (q._cdrMoved || -1e9) > NO_MOVE_AGAIN && this.t - q.since > 15);
        if (u) {
          u._cdrMoved = this.t; relocating = true;
          const b0 = brgOf(P.e, P.n, u.e, u.n); let brg = b0, bs = -1;
          for (const dB of [0, 45, -45, 90, -90]) { const b = (b0 + dB + 360) % 360, sep = shooters.length ? Math.min(...shooters.map(s => Math.abs(angDiff(b, s.brg)))) : 90 - Math.abs(dB) * 0.1; const sc = Math.min(sep, 90) - Math.abs(dB) * 0.25; if (sc > bs) { bs = sc; brg = b; } }
          const flank = compass(brg), why0 = P === pic || !C.predict || !C.predict.moving ? 'it cannot cover where he believes the vehicle is' : 'it cannot cover where he expects the vehicle to go';
          later(() => {
            if (!u.alive || u.gone || u.state !== 'hidden' || u.ammo <= 0) return;
            const rode = u.rideVeh && this._rideDisplace(u, 'ordered by the commander to the ' + flank, { B: P, brg, ordered: true, flank, force: true });
            if (rode) { const R = u.ride, d = Math.hypot(R.fp.e - u.e, R.fp.n - u.n); this._cdrOrder(u, 'relocate', `go by vehicle to the ${flank} flank, ${km(d)}, and set up with a line onto the vehicle`, { dest: R.fp, by: 'uaz', off: ctx.off, wrong: ctx.wrong, why: why0, eta: 15 + 20 + Math.hypot(u.rideVeh.e - u.e, u.rideVeh.n - u.n) / 2.2 + d / 6 + 15 + 80 + u.spec.setup, route: this._cdrRoute(u) }); return; }
            const site = this._cdrSite(u, P, C);   /* his own choice of ground, onto the place he plans against; failing that the team's own */
            if (this._displace(u, ahead ? 'ordered by the commander to ground ahead of the vehicle' : 'ordered by the commander to ground that looks onto the vehicle', null, site || undefined)) { const g = u.sites[u.site]; this._cdrOrder(u, 'relocate', ahead ? `move ${km(Math.hypot(g.e - u.e, g.n - u.n))} on foot and lie in wait ahead of the vehicle` : `move ${km(Math.hypot(g.e - u.e, g.n - u.n))} on foot to ground that looks onto the vehicle`, { dest: g, by: 'foot', off: ctx.off, wrong: ctx.wrong, why: why0, eta: Math.hypot(g.e - u.e, g.n - u.n) / u.spec.move + 15 + u.spec.setup, route: this._cdrRoute(u) }); }
          });
        }
      }
      // ---- every launcher that covers the place stands on one side of it: send one that has a truck round to a flank (trained crews and better)
      if (!relocating && K.strike > 0 && nMoving === 0) {
        const still = shooters.filter(s => !s.moving && !s.u.veh); let spread = 0; for (const a of still) for (const b of still) spread = Math.max(spread, Math.abs(angDiff(a.brg, b.brg)));
        const cand = still.filter(s => s.u.rideVeh && s.u.rideVeh.alive && s.u.rideVeh.mobile && s.u.state === 'hidden' && this.t - (s.u._cdrMoved || -1e9) > NO_MOVE_AGAIN && !(this.t < (s.u.suppressedUntil || 0)));
        if (still.length >= 3 && spread < SEP && cand.length) {
          const s0 = cand[0], u = s0.u, mean = still.reduce((x, s) => x + angDiff(s.brg, still[0].brg), 0) / still.length + still[0].brg, sideSign = C.rng.random() < 0.5 ? 1 : -1, brg = (mean + sideSign * 75 + 360) % 360, flank = compass(brg);
          u._cdrMoved = this.t; relocating = true;
          later(() => {
            if (!u.alive || u.gone || u.state !== 'hidden' || u.ammo <= 0) return;
            if (this._rideDisplace(u, 'ordered by the commander to the ' + flank + ' flank', { B: P, brg, ordered: true, flank, force: true })) { const R = u.ride, d = Math.hypot(R.fp.e - u.e, R.fp.n - u.n); this._cdrOrder(u, 'relocate', `go by vehicle to the ${flank} flank, ${km(d)}, so the vehicle can be struck from two directions`, { dest: R.fp, by: 'uaz', off: ctx.off, wrong: ctx.wrong, why: `all ${still.length} launchers that cover the vehicle stand within ${Math.round(spread)} degrees of each other`, eta: 15 + 20 + Math.hypot(u.rideVeh.e - u.e, u.rideVeh.n - u.n) / 2.2 + d / 6 + 15 + 80 + u.spec.setup, route: this._cdrRoute(u) }); }
          });
        }
      }
      // ---- while a missile team shifts, the BMP keeps the tank busy (rocket teams are NOT sent across the open: see 3d in the step)
      if (relocating && !C.fixAt || relocating && this.t - C.fixAt > 60) {
        C.fixAt = this.t;
        for (const v of M.vehs) if (v.kind === 'bmp2' && v.canFire && v.state === 'hidden') later(() => { if (!v.alive || v.gone || v.state !== 'hidden') return; if (v.sees) { this._cdrOrder(v, 'fix', 'keep the cannon on the vehicle while the missile teams shift', { dest: null, by: 'own', off: ctx.off, wrong: ctx.wrong }); return; }
          if (v.mobile && this._vehSeek(v, P, 'ordered to fix the vehicle', { advance: true })) { const g = v.route[v.route.length - 1]; this._cdrOrder(v, 'fix', 'move to where the cannon bears and keep the vehicle busy', { dest: { e: g[0], n: g[1] }, by: 'own', off: ctx.off, wrong: ctx.wrong, eta: Math.hypot(g[0] - v.e, g[1] - v.n) / 6, route: this._cdrRoute(v) }); } });
      }
    },
    // ================================================================ fire control
    // Called while the battle layer gathers the teams that are ready to fire (every step, cheap: no sight lines).
    // First the teams' own rule (a team whose last missile was blinded waits for a partner), then the commander's:
    //   before the first shot   he holds the whole ambush until every missile launcher that has the tank in sight is laid, from
    //                           two bearings 40 degrees apart when his ground offers that; he lets go at once if a team comes under fire
    //                           or is lost, and in any case after his patience runs out (40 / 60 / 75 s trained / expert / veteran);
    //   after it                missile launchers fire by salvo, not singly: three ready, or two after half his wait, or whoever is
    //                           ready when the wait runs out (25 / 40 / 45 s); a launcher on a side where he has counted four Trophy
    //                           shots fires at once; with a drone on its way and due inside the wait, the salvo goes with the drone.
    //   between the first and the second salvo the missile teams that fired stay where they are and reload (for 60 s at most):
    //                           they do not scoot after one shot unless they are shot at. Trophy has eight rounds; the first salvo
    //                           uses most of them and the second arrives before the tank can do anything about it.
    // Rocket teams and tank guns are never held after the first shot. A green commander does none of this.
    _cdrGate(ready) {
      this._cdrArr = (this.transit || []).filter(d => d.arrive <= this.t);
      if (this._teamGate) this._teamGate(ready);
      const C = this.cdr; if (!C || !C.on || !C.alive || C.K.strike <= 0 || !C.radioOk) { if (C && C.fire) C.fire.state = 'free'; return; }
      const K = C.K, p = C.pic, F = C.fire, msl = ready.filter(u => MISSILE[u.spec.key]);
      let live = 0; const lb = [];
      for (let i = this.waveFrom || 0; i < this.units.length; i++) { const u = this.units[i]; if (u.alive && !u.gone && MISSILE[u.spec.key] && u.ammo > 0 && u.state !== 'moving' && u.state !== 'setup' && u.lastSeen != null && this.t - u.lastSeen < 20) { live++; lb.push(brgOf(p.e, p.n, u.e, u.n)); } }
      for (const v of this.vehs || []) if (v.wave === C.wave && v.alive && !v.gone && v.kind === 'bmp2' && v.msl > 0 && v.canFire && v.sees) { live++; lb.push(brgOf(p.e, p.n, v.e, v.n)); }
      const spreadOf = a => { let s = 0; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) s = Math.max(s, Math.abs(angDiff(a[i], a[j]))); return s; };
      const mb = msl.map(u => brgOf(p.e, p.n, u.e, u.n)), spread = spreadOf(mb), want = Math.max(1, this.opened ? Math.min(SALVO, live) : live);   /* the opening waits for every launcher that has the tank in sight; later salvos for three */
      const hold = (all) => { for (let i = ready.length - 1; i >= 0; i--) if (all || MISSILE[ready[i].spec.key]) { ready.splice(i, 1); C.st.heldSec += this.dt; } };
      const go = (text, why, n) => { F.state = 'free'; F.since = this.t; F.until = null; C.st.salvos++; C.st.salvoN += n; if (n >= 2 && spread >= SEP) C.st.salvoTwo++; this._cdrOrder('all', 'strike', text, { by: 'own', why, quiet: C.st.salvos > 2 }); };
      if (!this.opened) {
        if (!ready.length) return;
        if (C.holdAlive == null) C.holdAlive = this._cdrMembers(C).teams.length;
        F.ready = msl.length;
        const waited = C.holdSince == null ? 0 : this.t - C.holdSince, M = this._cdrMembers(C).teams, blown = M.length < C.holdAlive || M.some(u => this.t < (u.suppressedUntil || 0));
        const ok = live === 0 || (msl.length >= want && (spreadOf(lb) < SEP || spread >= SEP));
        if (!(ok || blown || waited >= K.open)) {
          if (C.holdSince == null) { C.holdSince = this.t; F.state = 'ambush_hold'; F.since = this.t; F.until = this.t + K.open; F.want = want;
            this._cdrOrder('all', 'hold_fire', `hold the ambush until ${want} missile launcher${want === 1 ? ' is' : 's are'} laid${spreadOf(lb) >= SEP ? ', from two directions' : ''} (he will wait up to ${K.open} s)`, { by: 'own', why: 'the first salvo is the one the tank is least ready for' }); }
          hold(true); C.st.openHeld += this.dt; return; }
        const why = ok ? `${msl.length} launcher${msl.length === 1 ? '' : 's'} laid${spread >= SEP ? ', ' + Math.round(spread) + ' degrees apart' : ''}` : blown ? 'a team is under fire: the ambush is blown' : `he has held for ${Math.round(waited)} s and will not wait longer`;
        C.st.openWhy[ok ? 'ready' : blown ? 'blown' : 'timeout'] = (C.st.openWhy[ok ? 'ready' : blown ? 'blown' : 'timeout'] || 0) + 1;
        this.opened = true; this.openedAt = this.t; this.ev(this.t, 'ambush', { wave: this.wave, teams: ready.map(u => u.id) });
        this.say(this.t, 'enemy', null, `The enemy commander springs the ambush: ${why}.`, 'from now on the missile teams fire by salvo on his word; rocket teams fire when they can');
        for (const u of msl) u.cdrStay = this.t + STAY_S;   /* reload where you are: the second salvo, while Trophy is still short of rounds, matters more than the move */
        C.stayUntil = this.t + STAY_S;
        go(`open fire: ${why}; missile teams reload where they are for a second salvo, then move`, 'the opening salvo', msl.length); return;
      }
      if (!msl.length) { if (F.state !== 'free' && C.salvoSince == null) F.state = 'free'; return; }
      F.ready = msl.length;
      const waited = C.salvoSince == null ? 0 : this.t - C.salvoSince, I = C.intel, dry = msl.find(u => I.aps[quad(brgOf(p.e, p.n, u.e, u.n))] >= 4);
      const drone = (this.transit || []).some(d => d.arrive > this.t && d.arrive - this.t <= Math.min(20, K.strike - waited)), here = this._cdrArr.length > 0;
      let why = null;
      if (here) why = 'the drone is arriving: the missiles go with it';
      else if (drone) why = null;
      else if (msl.length >= want) why = `${msl.length} launchers ready${spread >= SEP ? ', ' + Math.round(spread) + ' degrees apart' : ''}`;
      else if (dry) why = `Trophy has been seen to fire four times toward the ${compass(quad(brgOf(p.e, p.n, dry.e, dry.n)) * 90)}: he takes that side to be empty and lets that launcher fire`;
      else if (msl.length >= 2 && waited >= K.strike / 2) why = `two launchers ready after ${Math.round(waited)} s`;
      else if (waited >= K.strike) why = 'the wait ran out';
      if (!why) {
        if (C.salvoSince == null) { C.salvoSince = this.t; F.state = 'salvo_hold'; F.since = this.t; F.until = this.t + K.strike; F.want = want;
          this._cdrOrder('all', 'hold_fire', `missile teams hold for a salvo of ${want} (he will wait up to ${K.strike} s)`, { by: 'own', quiet: C.st.salvos > 2, why: 'missiles that arrive together swamp HKOI and Trophy; missiles fed in one at a time are picked off' }); }
        hold(false); return; }
      if (C.stayUntil) { C.stayUntil = 0; for (let i = this.waveFrom || 0; i < this.units.length; i++) this.units[i].cdrStay = 0; }   /* the second salvo is away: every team is free to move again */
      if (C.salvoSince != null) { C.salvoSince = null; go(`fire: ${why}`, 'salvo fire', msl.length); }
      else { C.st.salvos++; C.st.salvoN += msl.length; if (msl.length >= 2 && spread >= SEP) C.st.salvoTwo++; }   /* nothing was held: no order needed */
    },
    // Called as an engagement is put together: the commander times the launches so the missiles ARRIVE together (a far launcher
    // fires first, a near one waits), to within his crews' timing error (expert 1 s, veteran 0.5 s), using the ranges he believes. A trained commander does NOT
    // try it: measured with a 2 s timing error it did the enemy no good (200 battles: M1 lost 30% with it against 34% without),
    // because the near launchers' wait gives the tank's crew time to pop smoke and move while the arrivals are still too ragged
    // to beat Trophy's 0.6 s between shots. His launchers fire together on the signal, as trained crews always did. Without a
    // commander, expert and veteran crews do the same among themselves to within 1.5 / 1 s (TSK.tot); trained and green crews do not. A drone
    // arriving with the salvo is given a lead of 1.5 s so that Trophy and HKOI's airburst are spent on it first.
    _cdrTot(teams) {
      const C = this.cdr; let sig = 0, p = null, rng = null;
      if (C && C.on && C.alive && C.K.tot > 0 && C.radioOk) { sig = C.K.tot; p = C.pic; rng = C.rng; }
      else if (this.xOpt && this.xOpt.ai !== 'classic' && TSK[this.skill] && TSK[this.skill].tot > 0) { sig = TSK[this.skill].tot; p = this.belief || this.tank; rng = this._tx().rng; }   /* no commander: expert and veteran crews do it among themselves, less exactly */
      if (!sig) return;
      const arr = this._cdrArr || [], shooters = teams.filter(u => !u.spec.indirect); if (shooters.length + arr.length < 2) return;
      const F = shooters.map(u => Math.hypot(p.e - u.e, p.n - u.n) / ((HK.THREATS[u.spec.key] || {}).speed || 250)); let tgt = 0;
      shooters.forEach((u, i) => { tgt = Math.max(tgt, F[i] + (u._lead || 0)); });
      for (const d of arr) tgt = Math.max(tgt, Math.min(d.R0, 900) / ((HK.THREATS[d.key] || {}).speed || 30) + DRONE_LEAD);
      shooters.forEach((u, i) => { u._lead = clamp(Math.max(u._lead || 0, tgt - F[i] + rng.normal(0, sig)), 0, 40); });
      if (C && C.on && C.alive) C.st.tot++; else this._tx().stat.tot++;
    },
    _tx() { return this._teamX || (this._teamX = { rng: new HK.RNG(HK.seedFor(this.seed, 9010)), vol: 0, stat: { blinded: 0, waited: 0, fled: 0, rpgWait: 0, tot: 0 } }); },

    // ================================================================ the teams' own judgement (no commander needed)
    // Once a second. Skill decides how much of it a crew does (TSK above): green crews none.
    //   a team whose missile was blinded by HKOI's cloud remembers it (see _teamGate);
    //   when a team is destroyed, a team lying within 150 m of it moves: the tank has the range of that ground;
    //   a rocket team does not set out on a long stalk across open ground: it lies in wait unless half the way is in cover or the
    //   tank is within 350 m.
    _teamStep(dt) {
      void dt; if (!this.xOpt || this.xOpt.ai === 'classic') return; const S = TSK[this.skill]; if (!S) return;
      if (this.t < (this._teamAt || 0)) return; this._teamAt = this.t + 1;
      const X = this._tx(), W = this.world;
      for (; X.vol < this.volleys.length && this.volleys[X.vol].done; X.vol++) for (const th of this.volleys[X.vol].rec.threats) if (th.defeated_by === 'hkoi_cut') { const u = this.units.find(q => q.id === th.uid); if (u && u.alive) { u.blindedAt = this.t; X.stat.blinded++; } }
      for (const u of this.units) {
        if (!u.alive && !u._tDead) { u._tDead = true; if (u.gone) continue;
          for (const o of this.units) { if (o === u || !o.alive || o.gone || o.state !== 'hidden' || o.hasShot || o.ammo <= 0 || o.spec.indirect || Math.hypot(o.e - u.e, o.n - u.n) > DEAD_R) continue;
            if (X.rng.random() < S.flee && this._displace(o, 'the team beside it has just been destroyed: the tank has the range of this ground')) X.stat.fled++; } }
        if (u.alive && !u.gone && u.spec.key === 'rpg' && u.state === 'hidden' && !(u.sight > 0) && this.t >= (u.nextLook || 0) - 1 && this.t >= (u._rpgAt || 0)) {
          u._rpgAt = this.t + 8; const B = this.belief; if (!B) continue; const d = Math.hypot(B.e - u.e, B.n - u.n); let cov = 0;
          if (d > 350) { for (let k = 1; k <= 8; k++) { const f = k / 9, e = u.e + (B.e - u.e) * f, n = u.n + (B.n - u.n) * f, vg = W.veg(e, n).cls; if ((vg >= 3 && vg <= 6) || W.buildingAt(e, n)) cov++; }
            if (cov / 8 < S.rpgOpen) { u.nextLook = Math.max(u.nextLook || 0, this.t + 9); u.waitAmbush = true; if (!u._tWaitSaid) { u._tWaitSaid = true; X.stat.rpgWait++; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1} lies in wait: ${Math.round(d / 10) * 10} m of mostly open ground to the vehicle.`, `${this.skill} crews do not walk across the front of a thermal sight; it will fire if the vehicle comes to it`); } continue; } }
          u.waitAmbush = false; }
      }
    },
    // a team whose last missile HKOI blinded does not fire alone again if another launcher can fire with it within its patience
    _teamGate(ready) {
      if (!this.xOpt || this.xOpt.ai === 'classic' || !this.opened) return; const S = TSK[this.skill]; if (!S || ready.length !== 1) { for (const u of ready) u._partnerSince = null; return; }
      const u = ready[0]; if (!MISSILE[u.spec.key] || u.blindedAt == null || this.t - u.blindedAt > 120) return;
      if (!this.units.some(o => o !== u && o.alive && !o.gone && o.ammo > 0 && !o.spec.indirect && o.spec.key !== 'rpg' && (o.state === 'hidden' || o.state === 'setup'))) return;
      if (u._partnerSince == null) { u._partnerSince = this.t; if (this._teamX) this._teamX.stat.waited++; this.say(this.t, 'enemy', u.id, `${u.spec.name} #${u.id + 1} holds its shot for another team to fire with it (up to ${S.partner} s).`, 'its last missile was blinded by the vehicle\'s smoke rounds: two at once are harder to stop'); }
      if (this.t - u._partnerSince < S.partner) ready.length = 0; else u._partnerSince = null;
    },
    _teamIntent(u) { if (u.waitAmbush && u.state === 'hidden' && !(u.sight > 0)) return 'lying in wait for the vehicle to come within reach'; if (u._partnerSince != null && u.hasShot) return 'has a shot: waiting for another team to fire with it'; return null; },
    teamReport() { return this._teamX ? Object.assign({ on: true }, this._teamX.stat) : { on: false }; },
    _cdrIntent(u) {
      const o = u.cdrOrder, C = this.cdr; if (!o || !C || !C.alive) return null;
      if (C.fire.state !== 'free' && u.state === 'hidden' && u.ammo > 0 && (MISSILE[u.spec.key] || C.fire.state === 'ambush_hold') && u.hasShot) return C.fire.state === 'ambush_hold' ? 'has a shot: holding for the commander\'s signal to open fire' : 'has a shot: holding for the commander\'s salvo';
      if (o.t_end != null) return null;
      if (o.kind === 'relocate' && u.state === 'moving') return 'ordered to new ground by the commander; ' + (this.t < (u.packUntil || 0) ? 'packing up' : 'moving');
      if (o.kind === 'fix' && u.state === 'moving') return 'ordered by the commander to close in and fix the vehicle';
      return null;
    },

    // ================================================================ for the display and the tests
    commander() {
      const C = this.cdr; if (!C) return null; const T = this.tank, h = C.host, p = C.pic, t = C.alive ? this.t : C.lostAt;
      const live = o => ({ id: o.id, to: o.to, kind: o.kind, from: o.from, dest: o.dest, route: o.route, by: o.by, t_order: o.t_order, t_eta: o.t_eta, done: o.done, text: o.text, wrong: o.wrong, off_m: o.off_m });
      const plan = [], sectors = []; for (const o of C.plan.values()) { if (o.t_end != null) continue; plan.push(live(o)); }
      for (const o of C.log) if (o.sector && o.to !== 'all') { const u = o.to >= 100 ? (this.vehs || []).find(v => v.id === o.to) : this.units[o.to]; if (u && u.alive && !u.gone && C.alive && u.state !== 'moving') sectors.push(Object.assign(o.to >= 100 ? { vid: o.to } : { uid: o.to }, { brg_from: Math.round(o.sector[0]), brg_to: Math.round(o.sector[1]) })); }
      return { alive: C.alive, radio: C.radio, with: h.veh ? { vid: h.id } : { uid: h.id }, e: h.e, n: h.n,
        picture: { e: p.e, n: p.n, t: +p.t.toFixed(1), age: +(t - p.t).toFixed(1), r_m: this._cdrSpread(C, t), off_m: Math.round(Math.hypot(p.e - T.e, p.n - T.n)), src: p.src },
        predict: C.predict ? { path: C.predict.path, to: C.predict.to, why: C.predict.why, kind: C.predict.kind, r_m: C.predict.r_m, eta_s: C.predict.eta_s } : null, sectors, plan, orders: C.events.slice(-12),
        fire: { state: C.alive ? C.fire.state : 'free', since: +C.fire.since.toFixed(1), until: C.fire.until, want: C.fire.want, ready: C.fire.ready },
        intel: { trophy: C.intel.aps.map((n, q) => ({ brg: q * 90, intercepts: n, dry: n >= 4 })), lost: C.intel.dead.map(d => [Math.round(d.e), Math.round(d.n), +d.t.toFixed(0)]) } };
    },
    commanderAt(t) {
      const C = this.cdr; if (!C) return null; let s = null; for (const q of C.hist) { if (q.t <= t) s = q; else break; } if (!s) return null;
      const alive = C.lostAt == null || t < C.lostAt, tt = alive ? t : C.lostAt, h = s.host >= 100 ? (this.vehs || []).find(v => v.id === s.host) : this.units[s.host];
      const plan = C.log.filter(o => o.t_order <= tt && (o.t_end == null || o.t_end > tt)).map(o => ({ id: o.id, to: o.to, kind: o.kind, from: o.from, dest: o.dest, route: o.route, by: o.by, t_order: o.t_order, t_eta: o.t_eta, done: o.t_done != null && o.t_done <= tt, text: o.text, wrong: o.wrong, off_m: o.off_m }));
      const sectors = plan.filter(o => o.kind === 'watch').map(o => { const e = C.log.find(q => q.id === o.id); return Object.assign(o.to >= 100 ? { vid: o.to } : { uid: o.to }, { brg_from: Math.round(e.sector[0]), brg_to: Math.round(e.sector[1]) }); });
      return { alive, radio: alive, with: s.host >= 100 ? { vid: s.host } : { uid: s.host }, e: h ? h.e : null, n: h ? h.n : null,
        picture: { e: s.picture.e, n: s.picture.n, t: s.picture.t, age: +(tt - s.picture.t).toFixed(1), r_m: Math.round(s.picture.r_m + Math.max(0, tt - s.picture.t) * 2), off_m: null, src: s.picture.src },
        predict: s.predict ? { path: s.predict.path, to: s.predict.to, why: s.predict.why, kind: s.predict.kind, r_m: s.predict.r_m, eta_s: s.predict.eta_s } : null, sectors, plan, orders: C.events.filter(e => e.t <= t).slice(-12), fire: null, intel: null };
    },
    cdrReport() { const s = this._cdrStat; if (!s) return { on: false }; return Object.assign({ on: true, alive: !!(this.cdr && this.cdr.alive) }, JSON.parse(JSON.stringify(s))); },
  };

  function install(Battle, deps) { HK = deps.HK; TEAMS = deps.TEAMS; SKILL = deps.SKILL; Object.assign(Battle.prototype, methods); }
  const api = { install, CSK, TSK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKEnemyCdr = api;
})(typeof window !== 'undefined' ? window : globalThis);
