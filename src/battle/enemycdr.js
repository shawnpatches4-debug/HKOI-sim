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
    green: { delay: 12, err: 90, think: 30, pass: 15, strike: 0 },
    trained: { delay: 7, err: 50, think: 20, pass: 8, strike: 25 },
    expert: { delay: 4, err: 30, think: 12, pass: 5, strike: 40 },
    veteran: { delay: 3, err: 20, think: 10, pass: 4, strike: 45 },
  };
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
      const st = this._cdrStat || (this._cdrStat = { groups: 0, orders: 0, wrong: 0, byKind: {}, wrongByKind: {}, reviews: 0, reviewsWrong: 0, reviewsStale: 0, offSum: 0, ageSum: 0, strikes: 0, strikesTimedOut: 0, lost: 0, lostWhy: {}, reports: 0, heard: 0 });
      st.groups++;
      const C = this.cdr = { on: true, alive: true, radio: true, host, K, wave, rng: new HK.RNG(HK.seedFor(this.seed, 9003 + wave)), seq: (old ? old.seq : 0), pic: { e: T.e, n: T.n, t: this.t, r: 60, src: 'plan' }, track: [], predict: null,
        reports: [], queue: [], plan: new Map(), log: old ? old.log : [], hist: old ? old.hist : [], events: old ? old.events : [], nextThink: this.t + K.think, tickAt: 0, strike: null, strikeCool: 0, shotsSeen: (this.shots || []).length, gunHeardAt: -1e9, lostAt: null, st };
      C.hist.push({ t: this.t, picture: { e: C.pic.e, n: C.pic.n, t: C.pic.t, r_m: C.pic.r, src: 'plan' }, predict: null, host: host.id });
      this.say(this.t, 'enemy', host.id, `The enemy group has a commander, with ${host.veh ? host.K.name : host.spec.name} #${host.id + 1}.`, 'he gets his teams\' reports by radio and gives the orders; without him each team fights on its own judgement');
      // first orders: who watches where
      for (const u of teams.concat(vehs)) { if (u.spec && u.spec.indirect) continue; const b = brgOf(u.e, u.n, T.e, T.n); this._cdrOrder(u, 'watch', `watch the ground to the ${compass(b)}`, { dest: null, by: u.veh ? 'own' : 'foot', sector: [(b + 340) % 360, (b + 20) % 360], quiet: true }); }
      void side;
    },
    _cdrClose(C) { C.on = false; for (const o of C.plan.values()) if (o.t_end == null) o.t_end = this.t; },
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
      const radio = !(h.veh ? false : this.t < (h.suppressedUntil || 0) || h.mounted);   /* a commander flat on his face, or bouncing in a truck, is not on the net */
      // 1. sightings by his teams and vehicles, each sent with a delay and an error
      const M = this._cdrMembers(C), K = C.K, r = C.rng;
      const report = (u, sees) => { if (!sees || this.t < (u._repAt || 0)) return; u._repAt = this.t + REPORT_EVERY; const R = Math.hypot(T.e - u.e, T.n - u.n), sig = K.err * clamp(R / 2000, 0.3, 2);
        C.reports.push({ at: this.t + (u === h ? 0.5 : K.delay * (0.7 + 0.6 * r.random())), e: T.e + r.normal(0, sig), n: T.n + r.normal(0, sig), obs: this.t, r: sig * 1.5, src: 'report' }); C.st.reports++; };
      for (const u of M.teams) if (!u.spec.indirect && u.state !== 'moving' && !(this.t < (u.suppressedUntil || 0))) report(u, u.lastSeen != null && this.t - u.lastSeen < 1.05);
      for (const v of M.vehs) report(v, v.sees && v.state !== 'moving');
      // 2. the sound of the tank's main gun
      const S = this.shots || []; for (; C.shotsSeen < S.length; C.shotsSeen++) { const s = S[C.shotsSeen], R = Math.hypot(s.from.e - h.e, s.from.n - h.n); if (R > HEAR) continue; const sig = 0.08 * R; C.reports.push({ at: s.t + R / 340, e: s.from.e + r.normal(0, sig), n: s.from.n + r.normal(0, sig), obs: s.t, r: sig * 1.5, src: 'sound' }); C.st.heard++; }
      // 3. what has reached him
      if (radio && C.reports.length) {
        let changed = false; C.reports.sort((a, b) => a.at - b.at);
        while (C.reports.length && C.reports[0].at <= this.t) { const q = C.reports.shift(); if (q.src === 'sound') { C.gunHeardAt = q.obs; if (C.pic.src === 'report' && q.obs - C.pic.t < 20) continue; }   /* a fresh sighting beats a sound */
          if (q.obs <= C.pic.t) continue; C.pic = { e: q.e, n: q.n, t: q.obs, r: q.r, src: q.src }; if (q.src === 'report') { C.track.push({ e: q.e, n: q.n, t: q.obs, r: q.r }); if (C.track.length > 8) C.track.shift(); } changed = true; }
        if (changed) { this._cdrPredict(C); C.hist.push({ t: +this.t.toFixed(1), picture: { e: C.pic.e, n: C.pic.n, t: C.pic.t, r_m: Math.round(C.pic.r), src: C.pic.src }, predict: C.predict, host: h.id }); }
      } else if (!radio) C.reports = C.reports.filter(q => q.at > this.t - 5);
      // 4. standing orders that have been carried out
      for (const o of C.plan.values()) { if (o.done || o.t_end != null) continue; const u = o.to === 'all' ? null : o.to >= 100 ? (this.vehs || []).find(v => v.id === o.to) : this.units[o.to];
        if (u && (!u.alive || u.gone)) { o.t_end = this.t; continue; }
        if (u && (o.kind === 'relocate' || o.kind === 'fix' || o.kind === 'commit')) { const rt = this._cdrRoute(u); if (rt) o.route = rt; if (this.t - o.t_order > 3 && u.state !== 'moving' && !u.ride) { o.done = true; o.t_done = this.t; } }
        else if (o.kind === 'hold_fire' && !C.strike) { o.done = true; o.t_done = this.t; } else if ((o.kind === 'strike' || o.kind === 'break') && this.t - o.t_order > 10) { o.done = true; o.t_done = this.t; } }
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
    // where he expects the tank to go, from his own reports: has it moved further than the reports' error between the first and the last?
    _cdrPredict(C) {
      const tr = C.track.filter(p => C.pic.t - p.t < 150), p = C.pic;
      if (tr.length >= 2) {
        const a = tr[0], b = tr[tr.length - 1], dt = b.t - a.t, d = Math.hypot(b.e - a.e, b.n - a.n);
        // is it still moving? the last two reports must differ as well, or it has stopped
        const c = tr[tr.length - 2], dl = Math.hypot(b.e - c.e, b.n - c.n), tl = Math.max(1, b.t - c.t), still = tr.length >= 3 && (dl < (b.r + c.r) / 3 || dl / tl < 1);
        if (dt >= 8 && d > 1.2 * (a.r + b.r) / 1.5 + 30 && !still) {
          const v = Math.min(12, d / dt), ue = (b.e - a.e) / d, un = (b.n - a.n) / d, steady = tr.length >= 3, reach = Math.min(900, Math.max(100, v * (steady ? 90 : 60)));
          const to = [Math.round(p.e + ue * reach), Math.round(p.n + un * reach)], brg = brgOf(a.e, a.n, b.e, b.n);
          C.predict = { path: [P2(p.e, p.n), to], to, why: `${tr.length} reports over ${Math.round(dt)} s put it ${Math.round(d / 10) * 10} m further ${compass(brg)}: he expects it to keep going that way at about ${Math.round(v * 3.6)} km/h`, moving: true }; return;
        }
        C.predict = { path: [P2(p.e, p.n)], to: P2(p.e, p.n), why: `${tr.length} reports over ${Math.round(dt)} s show no real movement: he expects it to stay where it is`, moving: false }; return;
      }
      C.predict = null;
    },
    // the review: look at the picture and give orders. A few sight lines per team; nothing map-wide.
    _cdrThink(C, M) {
      const T = this.tank, W = this.world, S = SKILL[this.skill], K = C.K, pic = C.pic, age = this.t - pic.t, off = Math.hypot(pic.e - T.e, pic.n - T.n);
      C.st.reviews++; C.st.offSum += off; C.st.ageSum += age; if (off > WRONG_M) C.st.reviewsWrong++; if (age > STALE) C.st.reviewsStale++;
      const P = C.predict && C.predict.moving ? { e: C.predict.to[0], n: C.predict.to[1] } : { e: pic.e, n: pic.n };   /* the place he plans against */
      const ctx = { off, wrong: off > WRONG_M };   /* wrong is judged on where he thinks the vehicle IS; a forecast cannot be checked against the present */
      const later = (run) => { C.queue.push({ at: this.t + K.pass, run }); };
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
        if (why) for (const v of reserve) { v.reserve = false; v.lookAt = this.t + K.pass + 20; later(() => { if (!v.alive || v.gone) return; const ok = this._vehSeek(v, P, 'committed by the commander', { advance: true }); this._cdrOrder(v, 'commit', ok ? 'move up and engage the vehicle' : 'engage the vehicle as soon as it shows', { dest: ok ? { e: v.route[v.route.length - 1][0], n: v.route[v.route.length - 1][1] } : null, by: 'own', off: ctx.off, wrong: ctx.wrong, why, eta: ok ? Math.hypot(v.route[v.route.length - 1][0] - v.e, v.route[v.route.length - 1][1] - v.n) / 6 : null }); }); }
      }
      // ---- who can cover the place he plans against?
      const shooters = [], blind = [];
      for (const u of M.teams) { if (!MISSILE[u.spec.key] || u.ammo <= 0) continue; if (u.state === 'moving') { shooters.push({ u, brg: brgOf(P.e, P.n, u.sites[u.site] ? u.sites[u.site].e : u.e, u.sites[u.site] ? u.sites[u.site].n : u.n), moving: true }); continue; }
        const R = Math.hypot(P.e - u.e, P.n - u.n), covers = R >= u.spec.rmin && R <= u.spec.rmax && W.los(u.e, u.n, u.spec.agl, P.e, P.n, 2.2).clear;
        if (covers) shooters.push({ u, brg: brgOf(P.e, P.n, u.e, u.n) }); else if (u.state === 'hidden' && !(this.t < (u.suppressedUntil || 0))) blind.push(u); }
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
            if (this._displace(u, 'ordered by the commander to ground that looks onto the vehicle')) { const g = u.sites[u.site]; this._cdrOrder(u, 'relocate', `move ${km(Math.hypot(g.e - u.e, g.n - u.n))} on foot to ground that looks onto the vehicle`, { dest: g, by: 'foot', off: ctx.off, wrong: ctx.wrong, why: why0, eta: Math.hypot(g.e - u.e, g.n - u.n) / u.spec.move + 15 + u.spec.setup, route: this._cdrRoute(u) }); }
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
      // ---- while a missile team shifts, the rocket teams and the BMP keep the tank busy
      if (relocating && !C.fixAt || relocating && this.t - C.fixAt > 60) {
        C.fixAt = this.t;
        for (const u of M.teams) if (u.spec.key === 'rpg' && u.state === 'hidden' && u.ammo > 0 && !(this.t < (u.suppressedUntil || 0))) later(() => { if (!u.alive || u.gone || u.state !== 'hidden') return; if (this._stalk(u)) { const g = u.sites[u.site]; this._cdrOrder(u, 'fix', 'close in and keep the vehicle busy while the missile teams shift', { dest: g, by: 'foot', off: ctx.off, wrong: ctx.wrong, eta: Math.hypot(g.e - u.e, g.n - u.n) / u.spec.move, route: this._cdrRoute(u) }); } });
        for (const v of M.vehs) if (v.kind === 'bmp2' && v.canFire && v.state === 'hidden') later(() => { if (!v.alive || v.gone || v.state !== 'hidden') return; if (v.sees) { this._cdrOrder(v, 'fix', 'keep the cannon on the vehicle while the missile teams shift', { dest: null, by: 'own', off: ctx.off, wrong: ctx.wrong }); return; }
          if (v.mobile && this._vehSeek(v, P, 'ordered to fix the vehicle', { advance: true })) { const g = v.route[v.route.length - 1]; this._cdrOrder(v, 'fix', 'move to where the cannon bears and keep the vehicle busy', { dest: { e: g[0], n: g[1] }, by: 'own', off: ctx.off, wrong: ctx.wrong, eta: Math.hypot(g[0] - v.e, g[1] - v.n) / 6, route: this._cdrRoute(v) }); } });
      }
      // ---- a strike from two directions: the missile teams hold their fire until two of them, well apart, have their shots
      if (K.strike > 0 && this.opened && !C.strike && this.t >= C.strikeCool && !relocating) {
        const still = shooters.filter(s => !s.moving && (s.u.readyAt || 0) - this.t < 10 && !(this.t < (s.u.suppressedUntil || 0))); let pair = false;
        for (let i = 0; i < still.length && !pair; i++) for (let j = i + 1; j < still.length; j++) if (Math.abs(angDiff(still[i].brg, still[j].brg)) >= SEP) { pair = true; break; }
        if (pair) later(() => { if (C.strike) return; const ent = this._cdrOrder('all', 'hold_fire', `missile teams hold fire: strike together from two directions (he will wait up to ${K.strike} s)`, { by: 'own', off: ctx.off, wrong: ctx.wrong, why: `${still.length} launchers can cover the vehicle from bearings at least ${SEP} degrees apart` }); C.strike = { until: this.t + K.strike, id: ent.id }; for (const s of still) { if (s.u.veh) s.u.order = ent; else s.u.cdrOrder = ent; } });
      }
    },
    // called while the battle layer gathers the teams that are ready to fire: under a hold-fire order the missile launchers wait
    _cdrGate(ready) {
      const C = this.cdr; if (!C || !C.on || !C.alive || !C.strike) return;
      const msl = ready.filter(u => MISSILE[u.spec.key]); if (!msl.length) return;
      const p = C.pic; let spread = 0; for (let i = 0; i < msl.length; i++) for (let j = i + 1; j < msl.length; j++) spread = Math.max(spread, Math.abs(angDiff(brgOf(p.e, p.n, msl[i].e, msl[i].n), brgOf(p.e, p.n, msl[j].e, msl[j].n))));
      const ok = msl.length >= 2 && spread >= SEP, late = this.t >= C.strike.until;
      if (ok || late) { C.strike = null; C.strikeCool = this.t + 45; C.st.strikes++; if (!ok) C.st.strikesTimedOut++;
        this._cdrOrder('all', 'strike', ok ? `fire now: ${msl.length} launchers have their shots, ${Math.round(spread)} degrees apart` : 'fire: he will not wait longer for a second launcher', { by: 'own', why: ok ? 'the strike he was holding for' : 'the wait ran out' }); return; }
      for (let i = ready.length - 1; i >= 0; i--) if (MISSILE[ready[i].spec.key]) ready.splice(i, 1);
    },
    _cdrIntent(u) {
      const o = u.cdrOrder, C = this.cdr; if (!o || !C || !C.alive || o.t_end != null) return null;
      if (o.kind === 'hold_fire' && C.strike && u.state === 'hidden' && u.ammo > 0) return u.hasShot ? 'has a shot: holding fire for the commander\'s strike' : 'holding fire for the commander\'s strike';
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
        picture: { e: p.e, n: p.n, t: +p.t.toFixed(1), age: +(t - p.t).toFixed(1), r_m: Math.round(p.r + Math.max(0, t - p.t) * 2), off_m: Math.round(Math.hypot(p.e - T.e, p.n - T.n)), src: p.src },
        predict: C.predict ? { path: C.predict.path, to: C.predict.to, why: C.predict.why } : null, sectors, plan, orders: C.events.slice(-12) };
    },
    commanderAt(t) {
      const C = this.cdr; if (!C) return null; let s = null; for (const q of C.hist) { if (q.t <= t) s = q; else break; } if (!s) return null;
      const alive = C.lostAt == null || t < C.lostAt, tt = alive ? t : C.lostAt, h = s.host >= 100 ? (this.vehs || []).find(v => v.id === s.host) : this.units[s.host];
      const plan = C.log.filter(o => o.t_order <= tt && (o.t_end == null || o.t_end > tt)).map(o => ({ id: o.id, to: o.to, kind: o.kind, from: o.from, dest: o.dest, route: o.route, by: o.by, t_order: o.t_order, t_eta: o.t_eta, done: o.t_done != null && o.t_done <= tt, text: o.text, wrong: o.wrong, off_m: o.off_m }));
      const sectors = plan.filter(o => o.kind === 'watch').map(o => { const e = C.log.find(q => q.id === o.id); return Object.assign(o.to >= 100 ? { vid: o.to } : { uid: o.to }, { brg_from: Math.round(e.sector[0]), brg_to: Math.round(e.sector[1]) }); });
      return { alive, radio: alive, with: s.host >= 100 ? { vid: s.host } : { uid: s.host }, e: h ? h.e : null, n: h ? h.n : null,
        picture: { e: s.picture.e, n: s.picture.n, t: s.picture.t, age: +(tt - s.picture.t).toFixed(1), r_m: Math.round(s.picture.r_m + Math.max(0, tt - s.picture.t) * 2), off_m: null, src: s.picture.src },
        predict: s.predict ? { path: s.predict.path, to: s.predict.to, why: s.predict.why } : null, sectors, plan, orders: C.events.filter(e => e.t <= t).slice(-12) };
    },
    cdrReport() { const s = this._cdrStat; if (!s) return { on: false }; return Object.assign({ on: true, alive: !!(this.cdr && this.cdr.alive) }, JSON.parse(JSON.stringify(s))); },
  };

  function install(Battle, deps) { HK = deps.HK; TEAMS = deps.TEAMS; SKILL = deps.SKILL; Object.assign(Battle.prototype, methods); }
  const api = { install, CSK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKEnemyCdr = api;
})(typeof window !== 'undefined' ? window : globalThis);
