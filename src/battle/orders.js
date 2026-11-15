// The player commands the tank.
//
// With the battle option command: 'player' the crew still runs every drill (the gunner lays and fires, the loader loads, HKOI and
// Trophy work on their own) but the decisions the commander takes in src/battle/tankai.js come from the player instead:
//   where the vehicle goes (move to a point, halt, back to cover, which way the hull faces, break contact),
//   what the guns do (fire at will or hold, which target first, which round, machine guns free or held),
//   how the protection is used (HKOI mode, what the driver does on a missile warning, smoke, hatches).
// Without that option `battle.cmd` is null, no line of this file runs inside a battle, and every battle is exactly as before
// (tests/battle/orders.js compares 24 battles with a stored baseline).
//
// Honest consequences. An order goes through the same rules as the crew's own decisions: the same routes over the same ground, the
// same sight lines, speeds and drill times. Nothing here helps the player.
//   - An order takes effect after the time it takes to say it plus the crewman's reaction. The reaction uses the crew stress model
//     (src/battle/crew.js): a shaken or frozen man is slower, a frozen commander passes nothing on until he comes back.
//   - An engagement is worked out the moment the enemy fires (src/engine.js decides it, with the vehicle's path fixed). So while
//     missiles are in the air the driver follows the engagement drill and orders to the driver wait until it is over; what the
//     player CAN decide is the drill itself, beforehand: hold still for HKOI or make for cover, and when the smoke goes.
//   - Smoke changes nothing for a missile already in flight when it is ordered, for the same reason. It counts for shots fired
//     while the screen stands (see _ordSmoke).
//
// Orders are battle inputs. Every order given is kept in battle.cmd.log as { t, k, ... } and a battle built with the same seed
// and opt.orders = that list is the same battle again (this is how replays and replay codes carry a commanded battle).
//
// Every figure marked "assumed" is open to challenge; they are listed in docs/AI_SPEC.md under "The player commands".
(function (root) {
  'use strict';
  const DEG = Math.PI / 180, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const brgOf = (e0, n0, e1, n1) => (Math.atan2(e1 - e0, n1 - n0) / DEG + 360) % 360, angDiff = (a, b) => ((a - b + 540) % 360) - 180;
  const r2 = x => Math.round(x * 100) / 100, m10 = d => Math.max(10, Math.round(d / 10) * 10), b3 = b => String(Math.round(((b % 360) + 360) % 360)).padStart(3, '0');

  // Times and limits (all assumed unless a source is named)
  const K = {
    issue: 1.0,       // s: the commander says a short order over the intercom
    drv: 1.6,         // s: the driver's reaction to an order (the same figure as his reaction to a missile warning in battle.js)
    halt: 0.8,        // s: stopping is the simplest thing he does
    gnr: 1.0,         // s: the gunner takes in a fire order
    mg: 0.5,          // s: "machine guns hold" / "free"
    own: 1.0,         // s: the commander works a switch of his own (HKOI mode, standing instructions)
    smokeBtn: 0.5,    // s: the smoke discharger button is under his hand
    hatch: 1.5,       // s: the order to shut or open up (the hatch itself takes the times in tankai.js)
    speed: 8.3,       // m/s (30 km/h): a move across country, the same as the crew's own bounds
    revSpeed: 6,      // m/s: in reverse (the same as the engagement drill in battle.js)
    revMax: 150,      // m: further than this he turns round and drives forward
    coverR: 220,      // m: how far "back to cover" looks for a place that hides the hull
    smokes: 2,        // salvos in the dischargers (two six-tube launchers fired one side at a time; assumed)
    smokeForm: 3, smokeLast: 25, smokeEff: 0.75,   // the engine's own figures for the crew's smoke (src/engine.js crew.smoke_*)
    smokeR: 35,       // m: once the vehicle is this far from where the grenades burst it is out of its own screen
  };
  const OPTIONS = {
    prio: [['danger', 'Most dangerous first'], ['missile', 'Missile teams first'], ['vehicle', 'Vehicles first'], ['nearest', 'Nearest first']],
    main: [['free', 'Fire at will'], ['hold', 'Hold fire']],
    round: [['auto', 'Gunner\'s choice'], ['ap', 'Sabot'], ['mp', 'Multi-purpose']],
    mg: [['free', 'Free'], ['hold', 'Hold']],
    hkoi: [['auto', 'Automatic'], ['obs', 'Obscurant only'], ['he', 'Airburst only'], ['hold', 'Hold']],
    warn: [['judge', 'Crew\'s judgement'], ['hold', 'Hold still for HKOI'], ['cover', 'Make for cover']],
    smokepol: [['crew', 'Crew\'s judgement'], ['now', 'At once'], ['never', 'Only on my order']],
    hatch: [['auto', 'Open, crew decides'], ['shut', 'Keep shut']],
  };
  const LABEL = { prio: 'Target order', main: 'Main gun', round: 'Next round', mg: 'Machine guns', hkoi: 'HKOI', warn: 'On a missile warning', smokepol: 'Smoke on a warning', hatch: 'Hatches' };
  const nameOf = (k, v) => (OPTIONS[k].find(x => x[0] === v) || ['', String(v)])[1];
  const DRIVE = { move: 1, halt: 1, reverse: 1, withdraw: 1 };   // orders to the driver: the newest one replaces any still waiting
  const GUIDED = { kornet: 1, saclos: 1, sal: 1 };

  const methods = {
    _ordFresh(opt) { return fresh(opt); },
    // ------------------------------------------------------------------ giving an order
    // o: { k: 'move', e, n } | { k: 'halt' } | { k: 'reverse' } | { k: 'face', brg } (brg null = toward the main threat, the crew's drill)
    //    | { k: 'withdraw' } | { k: 'smoke' } | { k: 'engage', uid } (uid null = no particular team)
    //    | { k: 'prio' | 'main' | 'round' | 'mg' | 'hkoi' | 'warn' | 'smokepol' | 'hatch', v }
    // Returns { ok, text, at } (at = battle time it takes effect) or { ok: false, text } with the reason in plain words.
    order(o) {
      if (!this.cmd) return { ok: false, text: 'The crew is in command in this battle.' };
      return this._ordIssue(o || {});
    },
    _ordIssue(o) {
      const C = this.cmd, T = this.tank, W = this.world, no = text => ({ ok: false, text });
      if (!T.alive || this.over) return no('The battle is over.');
      const cs = this.crewState ? this.crewState() : null; if (cs && cs.abandoned) return no('The crew has left the vehicle.');
      const k = o.k, rec = { t: r2(this.t), k }; let who = 'CDR', delay = K.issue, text = '', cue = null;
      const drvDelay = base => { const add = this._crewAdd('react', base); return add > 1e5 ? null : K.issue + base + (T.st.fatigue || 0) * 2 + add; };
      if (k === 'move') {
        const e = Math.round(+o.e), n = Math.round(+o.n); if (!isFinite(e) || !isFinite(n)) return no('No point given.');
        if (!W.inside(e, n) || !W.passable(e, n, true)) return no('The vehicle cannot stand there (building, dense wood, steep ground or off the map).');
        const d = Math.hypot(e - T.e, n - T.n); if (d < 5) return no('The vehicle is already there.');
        if (!this._ordRoute(e, n, false)) return no('The driver has no way for a tank to that point.');
        delay = drvDelay(K.drv); if (delay == null) return no('The driver is down: the vehicle cannot move.');
        rec.e = e; rec.n = n; who = 'DRV'; cue = ['CDR', 'drv_fwd']; text = `You order: driver, move ${m10(d)} m, bearing ${b3(brgOf(T.e, T.n, e, n))}.`;
      } else if (k === 'halt') {
        delay = drvDelay(K.halt); if (delay == null) return no('The driver is down.'); who = 'DRV'; cue = ['CDR', 'drv_stop']; text = 'You order: driver, halt.';
      } else if (k === 'reverse') {
        delay = drvDelay(K.drv); if (delay == null) return no('The driver is down: the vehicle cannot move.'); who = 'DRV'; cue = ['CDR', 'drv_back']; text = 'You order: driver, back to cover.';
      } else if (k === 'withdraw') {
        delay = drvDelay(K.drv); if (delay == null) return no('The driver is down: the vehicle cannot move.'); who = 'DRV'; cue = ['CDR', 'moveout']; text = 'You order: break contact. Driver, back to the start line.';
      } else if (k === 'face') {
        const brg = o.brg == null ? null : ((Math.round(+o.brg) % 360) + 360) % 360; if (brg != null && !isFinite(brg)) return no('No bearing given.');
        delay = drvDelay(K.halt); if (delay == null) return no('The driver is down.'); rec.brg = brg; who = 'DRV';
        text = brg == null ? 'You order: driver, keep the front toward the main threat.' : `You order: driver, face the hull to ${b3(brg)}.`;
      } else if (k === 'smoke') {
        if (C.smokes <= 0) return no('The smoke dischargers are empty.');
        if (this._ordSmokeLeft() > 0) return no('The smoke screen is still standing.');
        delay = K.smokeBtn + this._crewAdd('handover', K.smokeBtn); cue = ['CDR', 'smoke']; text = 'You fire the smoke grenades.';
      } else if (k === 'engage') {
        const uid = o.uid == null ? null : +o.uid;
        if (uid != null) { const kk = T.known.find(q => q.id === uid && !q.done), u = this.units.find(q => q.id === uid); if (!kk || !u || !u.alive) return no('That team has not been located, or is already out of the fight.'); text = `You order: gunner, engage ${u.spec.name} #${u.id + 1}.`; cue = ['GNR', 'identified']; }
        else text = 'You order: gunner, your own choice of target again.';
        rec.uid = uid; who = 'GNR'; delay = K.issue + K.gnr + this._crewAdd('lay', K.gnr);
      } else if (OPTIONS[k]) {
        const v = o.v; if (!OPTIONS[k].some(x => x[0] === v)) return no('That is not one of the choices.');
        rec.v = v; text = `You order: ${LABEL[k].toLowerCase()}: ${nameOf(k, v).toLowerCase()}.`;
        if (k === 'main') { who = 'GNR'; delay = K.issue + (v === 'hold' ? 0 : K.gnr + this._crewAdd('lay', K.gnr)); cue = ['CDR', v === 'hold' ? 'cease' : 'reengage']; }   /* "cease fire" is obeyed as it is heard */
        else if (k === 'prio') { who = 'GNR'; delay = K.issue + K.gnr + this._crewAdd('lay', K.gnr); }
        else if (k === 'round') { who = 'LDR'; delay = K.issue + K.gnr; if (v === 'ap') cue = ['CDR', 'load_sabot']; }
        else if (k === 'mg') { delay = K.issue + K.mg; if (v === 'hold') cue = ['CDR', 'cease']; }
        else if (k === 'hatch') { who = 'LDR'; delay = K.issue + K.hatch; }
        else { delay = K.own + this._crewAdd('handover', K.own); if (k === 'warn' && v === 'hold') cue = ['CDR', 'hold']; }
      } else return no('Unknown order.');
      // the newest order of a kind replaces one still on its way to the crew
      C.q = C.q.filter(it => !(it.o.k === k || (DRIVE[k] && DRIVE[it.o.k])));
      const at = this.t + delay; C.log.push(rec); C.q.push({ at, o: rec, who }); C.given++;
      this.say(this.t, 'tank', 'CDR', text, `takes effect in about ${delay.toFixed(1)} s: the time to say it and the ${who === 'DRV' ? 'driver' : who === 'GNR' ? 'gunner' : who === 'LDR' ? 'loader' : 'commander'}'s reaction${DRIVE[k] && this._volleyActive() ? '; the driver finishes the engagement drill first' : ''}`);
      this.ev(this.t, 'order', { k, at: r2(at) }); C.acks.push({ t: this.t, k, phase: 'given', who: cue ? cue[0] : null, cue: cue ? cue[1] : null, text });
      return { ok: true, text, at };
    },

    // ------------------------------------------------------------------ every step, before anything else moves
    _ordFeed() {
      const C = this.cmd, T = this.tank; if (!T.alive) return;
      while (C.si < C.sched.length && C.sched[C.si].t <= this.t + 1e-6) this._ordIssue(C.sched[C.si++]);   /* a recorded battle: the orders come back at the moments they were given */
      if (C.q.length) {
        const frozen = this._crewOut('orders'), inVolley = this._volleyActive(), keep = [];
        for (const it of C.q) {
          if (it.at > this.t + 1e-9 || (frozen && frozen !== 'crew has left the vehicle') || (inVolley && (DRIVE[it.o.k] || it.o.k === 'face'))) {
            if (frozen && it.at <= this.t && !it.said) { it.said = true; this.say(this.t, 'tank', 'CDR', 'The order is not passed on: the commander has frozen.', frozen); }
            keep.push(it); continue; }
          if (!frozen) this._ordDo(it);
        }
        C.q = keep;
      }
      // once a second: hatches kept shut, the trail of halts, and the figures the debrief judges the player by
      if (this.t + 1e-6 >= C.tick) {
        C.tick = Math.floor(this.t + 1e-6) + 1;
        if (C.hatch === 'shut') { const cr = this._crewInit ? this._crewInit() : null; if (cr && cr.on) { if (!cr.buttoned && this._crewButton) this._crewButton(cr, 'your order'); cr.quietSince = this.t;   /* crew.js opens up again after a quiet spell: not while the order stands */ } }
        if (Math.abs(T.v || 0) < 0.3 && !T.goal) { C.haltT++; if (C.haltT === 5 && !C.halts.some(h => Math.hypot(h.e - T.e, h.n - T.n) < 25)) { C.halts.push({ e: T.e, n: T.n }); if (C.halts.length > 4) C.halts.shift(); } } else C.haltT = 0;
        const S = C.stats, W = this.world; S.t++; let contact = false, seen = false;
        for (const kk of T.known) { if (kk.done) continue; const u = this.units.find(q => q.id === kk.id); if (!u || !u.alive || u.gone) continue; contact = true; if (W.los(kk.e, kk.n, 1.3, T.e, T.n, 1.0).clear) { seen = true; break; } }
        if (contact) { S.contact++; if (seen) S.exposed++; }
        if (C.target != null) { const kk = T.known.find(q => q.id === C.target), u = this.units.find(q => q.id === C.target); if (!kk || kk.done || !u || !u.alive || u.gone) { C.target = null; this.say(this.t, 'tank', 'GNR', 'The team you pointed out is out of the fight or gone: the gunner picks his own targets again.'); } }
      }
    },
    // an order reaches the man it is for
    _ordDo(it) {
      const C = this.cmd, T = this.tank, W = this.world, o = it.o, k = o.k, ack = (who, text, cue, why) => { this.say(this.t, 'tank', who, text, why || null); C.acks.push({ t: this.t, k, phase: 'done', who: cue ? who : null, cue: cue || null, text }); C.last = { t: this.t, k, text }; };
      this.ev(this.t, 'order_done', { k });
      if (k === 'move') {
        C.move = { e: o.e, n: o.n, rev: false };
        if (!this._ordGo(C.move, K.speed, false)) { C.move = null; ack('DRV', 'Driver: no way through to that point from here.'); return; }
        ack('DRV', `Driver: moving, ${m10(Math.hypot(o.e - T.e, o.n - T.n))} m.`, 'ack_fwd', 'the route keeps out of the located enemy\'s view where the ground allows, as the crew\'s own moves do');
      } else if (k === 'halt') {
        C.move = null; T.goal = null; T.route = null; T.rev = false; T.v = 0; T.mode = 'overwatch'; T.modeSince = this.t; const A = this._crew(); if (A.m && A.m.phase === 'withdraw') A.m.phase = 'start';
        ack('DRV', 'Driver: halted.', 'ack_stop');
      } else if (k === 'reverse') {
        const th = this._threats(); let spot = null, how = '';
        if (th.length) { const c = W.coverFrom(T.e, T.n, th.map(q => ({ e: q.e, n: q.n, agl: 1.3 })), { radius: K.coverR, step: 20 }).filter(q => this._drivable(T.e, T.n, q.e, q.n));
          if (c.length && c[0].d < 8) { ack('DRV', 'Driver: we are in cover here.', null, `the hull is hidden here from ${c[0].full + c[0].hull} of ${th.length} known firing points`); return; }
          if (c.length) { spot = c[0]; how = `hull hidden there from ${spot.full + spot.hull} of ${th.length} known firing points${spot.all ? '' : ' (nothing in reach hides it from all of them)'}`; } }
        if (!spot) { const h = C.halts.slice().reverse().find(q => Math.hypot(q.e - T.e, q.n - T.n) > 25); if (h && this._drivable(T.e, T.n, h.e, h.n)) { spot = { e: h.e, n: h.n, d: Math.hypot(h.e - T.e, h.n - T.n) }; how = th.length ? 'no cover in reach: back to the last place the vehicle stood' : 'no enemy located: back to the last place the vehicle stood'; } }
        if (!spot) { ack('DRV', 'Driver: no cover in reach and nowhere to back to.', null, `nothing within ${K.coverR} m hides the hull from a known firing point`); return; }
        const rev = spot.d <= K.revMax && Math.abs(angDiff(brgOf(T.e, T.n, spot.e, spot.n), T.h)) > 90;
        C.move = { e: spot.e, n: spot.n, rev }; if (!this._ordGo(C.move, rev ? K.revSpeed : K.speed, rev, true)) { C.move = null; ack('DRV', 'Driver: cannot get there.'); return; }
        ack('DRV', `Driver: ${rev ? 'reversing' : 'moving'} ${m10(spot.d)} m to cover.`, rev ? null : 'ack_fwd', how);
      } else if (k === 'withdraw') {
        const A = this._crew(), M = A.m; if (M) { M.phase = 'withdraw'; C.move = null; if (!this._ordGo(M.home, 9, false)) { this.over = { result: 'withdrawn', text: 'You broke contact.' }; return; } }
        ack('DRV', 'Driver: pulling back to the start line.', 'ack_fwd', 'the mission ends as withdrawn when the vehicle gets there');
      } else if (k === 'face') {
        C.face = o.brg; const d = o.brg == null ? 0 : angDiff(o.brg, T.h);
        ack('DRV', o.brg == null ? 'Driver: front to the main threat.' : `Driver: turning ${d >= 0 ? 'right' : 'left'} to ${b3(o.brg)}.`, o.brg == null ? null : d >= 0 ? 'ack_right' : 'ack_left', 'the hull turns when the vehicle is halted');
      } else if (k === 'smoke') {
        if (C.smokes <= 0) return; C.smokes--; C.smokeAt = this.t; C.smokeXY = { e: T.e, n: T.n }; this.ev(this.t, 'smoke', { left: C.smokes });
        ack('CDR', `Smoke grenades fired: the screen stands in ${K.smokeForm} s and lasts about ${K.smokeLast} s. ${C.smokes} salvo${C.smokes === 1 ? '' : 's'} left.`, null, this._volleyActive() ? 'missiles already in the air were aimed before the smoke: it counts for shots fired from now on' : 'enemy gunners lose the vehicle while it stands, and so does the crew: the guns cannot see out of it');
      } else if (k === 'engage') {
        C.target = o.uid; const u = o.uid == null ? null : this.units.find(q => q.id === o.uid);
        ack('GNR', u ? `Gunner: ${u.spec.name} #${u.id + 1}, identified.` : 'Gunner: my own targets.', null, u ? 'he takes it before anything else while it is in view; out of view he fights what he can see' : null);
      } else {
        const v = o.v, was = C[k]; C[k] = v;
        if (k === 'hatch' && v === 'shut') { const cr = this._crewInit ? this._crewInit() : null; if (cr && cr.on && this._crewButton) this._crewButton(cr, 'your order'); }
        const who = k === 'main' || k === 'prio' ? 'GNR' : k === 'round' || k === 'hatch' ? 'LDR' : 'CDR';
        const why = k === 'hkoi' ? (v === 'hold' ? 'HKOI will not fire at anything until you change this: the risk is yours' : v === 'obs' ? 'no airburst rounds: drones and seeker missiles are left to Trophy' : v === 'he' ? 'no obscurant: beam riders and wire-guided missiles are left to Trophy' : 'it picks the round for each threat itself') + '. It applies from the next enemy shot.'
          : k === 'warn' ? (v === 'hold' ? 'the driver keeps still on a warning so HKOI gets a clean engagement, even with cover in reach' : v === 'cover' ? 'the driver makes for cover on a warning if it hides the hull and can be reached in time, and leaves HKOI\'s cloud behind' : 'the crew weighs HKOI against cover each time, as it does on its own')
          : k === 'smokepol' ? (v === 'now' ? `a salvo goes at the first warning (${C.smokes} left)` : v === 'never' ? 'no smoke unless you fire it' : 'the crew fires smoke when it doubts the missile will be stopped')
          : k === 'hatch' ? (v === 'shut' ? 'the loader stays inside and loads; the commander sees less from under the hatch' : 'the loader may come up to his machine gun')
          : k === 'round' ? 'it matters when enemy vehicles are about: teams on foot always get multi-purpose' : null;
        ack(who, `${who === 'CDR' ? '' : who === 'GNR' ? 'Gunner: ' : 'Loader: '}${LABEL[k]}: ${nameOf(k, v).toLowerCase()}.`, null, why);
        if (k === 'mg' && v === 'hold') { const A = this._crew(); A.cfq.length = 0; }
        void was;
      }
    },

    // ------------------------------------------------------------------ driving
    // the way to a point for a tank: [[e, n], ...] or null. The same route search as the crew's own moves (tankai.js _goTo).
    _ordRoute(e, n, direct) {
      const T = this.tank, W = this.world; if (direct && this._drivable(T.e, T.n, e, n)) return [[e, n]];
      const top = this._threats().sort((p, q) => q.w - p.w).slice(0, 3), memo = new Map();
      const cost = (ce, cn) => { const key = Math.round(ce / 50) * 100003 + Math.round(cn / 50); let x = memo.get(key); if (x == null) { x = 0; for (const o of top) if (W.los(o.e, o.n, 1.3, ce, cn, 1.6).clear) x += 1.2 * o.w; memo.set(key, x); } return x; };
      const route = W.path(T.e, T.n, e, n, { grid: 50, tank: true, cost: top.length ? cost : null });
      if (route && route.length > 1) return route.slice(1).concat([[e, n]]);
      return this._drivable(T.e, T.n, e, n) ? [[e, n]] : null;
    },
    _ordGo(c, vmax, rev, direct) {
      const T = this.tank, pts = this._ordRoute(c.e, c.n, direct); if (!pts) return false;
      T.route = pts; T.routeI = 0; T.vmax = vmax; T.rev = !!rev; T.mode = 'moving'; T.modeSince = this.t; T.goal = { e: c.e, n: c.n }; this.ev(this.t, 'tank_move', { to: [Math.round(c.e), Math.round(c.n)] }); return true;
    },
    // for the screen: the way the driver would take to a point if ordered now (nothing is changed)
    orderRoute(e, n) {
      const T = this.tank, W = this.world; if (!W.inside(e, n) || !W.passable(e, n, true)) return { ok: false, text: 'The vehicle cannot stand there.' };
      const pts = this._ordRoute(e, n, false); if (!pts) return { ok: false, text: 'No way for a tank to that point.' };
      let d = 0, pe = T.e, pn = T.n; for (const p of pts) { d += Math.hypot(p[0] - pe, p[1] - pn); pe = p[0]; pn = p[1]; }
      return { ok: true, pts: [[T.e, T.n]].concat(pts), d };
    },
    // the commander's part of tankai.js _mission when the player commands: nothing moves unless ordered
    _ordMission(M) {
      const C = this.cmd, T = this.tank; if (this.over) return;
      if (M.type === 'advance' && this.objective && Math.hypot(this.objective.e - T.e, this.objective.n - T.n) < 60) { this.over = { result: 'objective', text: 'The vehicle reached its objective.' }; return; }
      if (M.phase === 'withdraw') { const d = Math.hypot(M.home.e - T.e, M.home.n - T.n);
        if (!T.goal) { if (d < 30 || !this._ordGo(M.home, 9, false)) { this.over = { result: 'withdrawn', text: 'You broke contact and pulled the vehicle back.' }; return; } }
        T.intent = `Withdrawing on your order: ${m10(d)} m to the start line`; return; }
      if (C.move && !T.goal) {   /* arrived, or an engagement stopped the move */
        const d = Math.hypot(C.move.e - T.e, C.move.n - T.n);
        if (d < 4) { C.move = null; const text = 'Driver: in position.'; this.say(this.t, 'tank', 'DRV', text); C.acks.push({ t: this.t, k: 'move', phase: 'arrived', who: null, cue: null, text }); C.last = { t: this.t, k: 'move', text }; }
        else if (!this._ordGo(C.move, C.move.rev ? K.revSpeed : K.speed, C.move.rev)) { C.move = null; this.say(this.t, 'tank', 'DRV', 'Driver: no way on to the point you gave from here.'); }
      }
      // what the crew tells the commander once, when it matters
      const st = T.st || {};
      if (!C.told.low && st.obs != null && (st.obs <= 0 || (st.apsL || 0) + (st.apsR || 0) <= 1)) { C.told.low = true; this.say(this.t, 'tank', 'GNR', `Gunner: ${st.obs <= 0 ? 'HKOI is out of obscurant' : 'Trophy is down to its last shot'}. Whether we break contact is your call.`, 'on its own the crew would pull back now'); }
      const wait = C.q.find(it => DRIVE[it.o.k] || it.o.k === 'face'), stand = [];
      if (C.main === 'hold') stand.push('main gun holding fire'); if (C.mg === 'hold') stand.push('machine guns held'); if (C.hkoi !== 'auto') stand.push('HKOI ' + nameOf('hkoi', C.hkoi).toLowerCase());
      const tail = stand.length ? ' (' + stand.join(', ') + ')' : '';
      if (T.goal && C.move) T.intent = `Your order: ${C.move.rev ? 'reversing' : 'moving'} to the marked point, ${m10(Math.hypot(C.move.e - T.e, C.move.n - T.n))} m to go${tail}`;
      else if (wait) T.intent = `Your order is on its way to the driver (${Math.max(0, wait.at - this.t).toFixed(1)} s)${tail}`;
      else T.intent = `Holding position: waiting for your orders${tail}`;
    },
    // after an engagement
    _ordAfterVolley(v) {
      const C = this.cmd;
      if ((v.rec.events || []).some(e => /fires the smoke grenades/i.test(e.text || ''))) { C.smokes = Math.max(0, C.smokes - 1); this.say(this.t, 'tank', 'CDR', `The crew fired smoke in that engagement: ${C.smokes} salvo${C.smokes === 1 ? '' : 's'} left.`); }
      if (C.move && v.plan && v.plan.cover) { C.move = null; this.say(this.t, 'tank', 'DRV', 'Driver: we took cover in that engagement. Your move order is dropped: give it again when you want to go on.', 'the crew will not drive back into the open on an old order'); }
    },

    // ------------------------------------------------------------------ guns
    // the player's target order, on top of the crew's list (most dangerous first); then the team he pointed out, if it is in view
    _ordSort(out) {
      const C = this.cmd;
      if (C.prio === 'missile') out.sort((a, b) => (GUIDED[b.u.spec.key] ? 1 : 0) - (GUIDED[a.u.spec.key] ? 1 : 0) || b.danger - a.danger || a.R - b.R);
      else if (C.prio === 'nearest') out.sort((a, b) => a.R - b.R);
      if (C.target != null) { const i = out.findIndex(q => q.u.id === C.target); if (i > 0 && out[i].los) out.unshift(out.splice(i, 1)[0]); }
      if (this._ordSmokeLeft() > 0 && this._ordInSmoke()) for (const q of out) q.los = false;   /* behind its own smoke the crew sees no more than the enemy does */
    },
    // main gun against vehicles (enemyveh.js _gunVeh) under the player's fire orders. Returns true when the gun is taken by a vehicle.
    _ordGunVeh(A, tg, hold) {
      const C = this.cmd, X = this._vxs, sys = (this.tank.st || {}).sys || {}; let r = false; if (!this._gunVeh) return false;
      if (hold) { if (X) X.rfv = null; }
      else if (C.target != null && tg.length && tg[0].u.id === C.target && tg[0].los && sys.gun !== 'destroyed') { if (X) X.rfv = null; }
      else if (C.prio === 'vehicle') { this._ordNoTeams = true; try { r = this._gunVeh(A); } finally { this._ordNoTeams = false; } }
      else r = this._gunVeh(A);
      if (C.round !== 'auto' && X) X.want = C.round;
      return r;
    },

    // ------------------------------------------------------------------ protection
    // seconds the screen still stands (0 when there is none)
    _ordSmokeLeft() { const C = this.cmd; return C.smokeAt == null ? 0 : Math.max(0, C.smokeAt + K.smokeForm + K.smokeLast - this.t); },
    _ordInSmoke() { const C = this.cmd, T = this.tank; return C.smokeAt != null && this.t >= C.smokeAt + K.smokeForm && Math.hypot(T.e - C.smokeXY.e, T.n - C.smokeXY.n) <= K.smokeR; },
    // settings of one engagement (called from battle.js as the engine's settings for it are made)
    _ordCfg(c) {
      const C = this.cmd; if (!C) return;
      if (C.hkoi === 'hold') c.hkoi_enabled = false; else if (C.hkoi === 'obs') c.gun.he_rounds = 0; else if (C.hkoi === 'he') c.gun.obscurant_rounds = 0;
      if (C.smokepol !== 'crew' || C.smokes <= 0 || this._ordSmokeLeft() > 0) c.crew.smoke = 'never';   /* the screen is the player's, or already up, or there is nothing left to fire */
    },
    // The player's smoke in an engagement. Called as the engagement is worked out, with the vehicle's planned path. It follows the
    // engine's own rule for the crew's smoke (src/engine.js): the screen stands K.smokeForm seconds after the grenades go, for
    // K.smokeLast seconds. A guided missile that arrives while it stands is flown at where the vehicle was when it vanished: it
    // misses only if the vehicle has since moved more than its own half width plus a metre across the line of fire, and then
    // 75% of the time. A rocket cannot be aimed at a vehicle nobody can see. Drones are not affected.
    _ordSmoke(launches, rec1, plan, at, masks) {
      const C = this.cmd, HKx = root.HK || {}; let pop = null;
      if (this._ordSmokeLeft() > 0) pop = C.smokeAt - this.t;
      else if (C.smokepol === 'now' && C.smokes > 0) { const cues = rec1.threats.map(th => th.cue).filter(x => x != null);
        if (cues.length) { pop = Math.min(...cues) + K.smokeBtn + this._crewAdd('handover', K.smokeBtn); C.smokes--; C.smokeAt = this.t + pop; C.smokeXY = { e: at.e, n: at.n }; this.ev(this.t + pop, 'smoke', { left: C.smokes });
          this.say(this.t + pop, 'tank', 'CDR', `Smoke grenades fired on the warning: ${C.smokes} salvo${C.smokes === 1 ? '' : 's'} left.`, 'your standing order: smoke at once on a warning'); C.acks.push({ t: this.t + pop, k: 'smoke', phase: 'done', who: 'CDR', cue: 'smoke', text: 'Smoke.' }); } }
      if (pop == null) return;
      const up = pop + K.smokeForm, end = up + K.smokeLast, half = ((this.cfg0.vehicle || {}).half_w || 1.8) + 1, P = plan.path, at0 = P[0][0];
      const posAt = t => P[clamp(Math.round((t - at0) / 0.1), 0, P.length - 1)];
      launches.forEach((l, i) => {
        if (masks[i] != null || l.u.spec.indirect) return; const th = rec1.threats.find(q => q.uid === l.u.id && Math.abs(q.t0 - l.t0) < 1e-6) || rec1.threats[i]; if (!th || th.impact == null || th.impact <= up + 0.2 || th.impact > end) return;
        const v = HKx.THREATS && HKx.THREATS[l.key] ? HKx.THREATS[l.key].speed : 250, tA = Math.max(up, l.t0), name = `${l.u.spec.name} #${l.u.id + 1}`;
        if (!GUIDED[l.key]) { if (l.t0 > up) { masks[i] = 15; l.mask_by = 'crew_smoke'; this.say(this.t + l.t0, 'enemy', l.u.id, `${name} fires blind into the smoke.`, 'a rocket cannot be aimed at a vehicle nobody can see'); } return; }
        const a = posAt(tA), b = posAt(th.impact), br = l.brg * DEG, side = Math.abs((b[1] - a[1]) * Math.cos(br) - (b[2] - a[2]) * Math.sin(br));
        if (side > half && this.rng.random() < K.smokeEff) { masks[i] = Math.max(10, (th.impact - tA) * v * 0.55); l.mask_by = 'crew_smoke'; this.say(this.t + tA, 'enemy', l.u.id, `${name} loses the vehicle in the smoke: the missile is flown at where it was.`, `the vehicle moved ${side.toFixed(1)} m across the line of fire behind the screen`); }
      });
    },

    // ------------------------------------------------------------------ for the screen and the debrief
    orderState() {
      const C = this.cmd, T = this.tank; if (!C) return { on: false };
      return { on: true, prio: C.prio, main: C.main, round: C.round, mg: C.mg, hkoi: C.hkoi, warn: C.warn, smokepol: C.smokepol, hatch: C.hatch, face: C.face, target: C.target,
        smokes: C.smokes, smokeLeft: this._ordSmokeLeft(), move: C.move, goal: T.goal, route: T.goal && T.route ? T.route : null, routeI: T.routeI || 0, inVolley: this._volleyActive(),
        pending: C.q.map(it => ({ k: it.o.k, e: it.o.e, n: it.o.n, brg: it.o.brg, left: Math.max(0, it.at - this.t) })), last: C.last, given: C.given };
    },
    // what the debrief judges (src/battle/ladder.js): seconds in contact, seconds of those with the hull in a located team's view
    orderStats() { const C = this.cmd; return C ? { given: C.given, t: C.stats.t, contact: C.stats.contact, exposed: C.stats.exposed, smokesUsed: K.smokes - C.smokes } : null; },
  };

  function install(Battle) {
    const P = Battle.prototype; Object.assign(P, methods);
    const step0 = P.step, plan0 = P._drivePlan, fin0 = P._finishVolleys;
    P.step = function () { if (this.cmd) this._ordFeed(); return step0.call(this); };
    // the standing order for a missile warning decides the driver's plan for the engagement
    P._drivePlan = function (at, warnT, observers, tEnd, firstImpact, holdForHkoi) {
      const C = this.cmd; if (!C) return plan0.call(this, at, warnT, observers, tEnd, firstImpact, holdForHkoi);
      let r;
      if (C.warn === 'judge') r = plan0.call(this, at, warnT, observers, tEnd, firstImpact, holdForHkoi);
      else if (C.warn === 'cover') r = plan0.call(this, at, warnT, observers, tEnd, firstImpact, false);
      else { const flinch = !holdForHkoi && this._crewFlinch();   /* a shaken crew may still bolt (crew.js) */
        r = plan0.call(this, at, warnT, observers, tEnd, firstImpact, !flinch); if (!flinch && !r.cover && warnT != null) this._holdWhy = 'your standing order: hold still on a warning'; }
      // Caught on the move by the player's order with no dash for cover planned: the vehicle brakes to a halt along its heading
      // (4 m/s2, the same braking as everywhere else) instead of stopping dead. Its speed is real: HKOI and the enemy gunners meet a moving target for those seconds.
      if (!r.cover && Math.abs(at.v || 0) > 0.3) { let v = at.v, e = 0, n = 0; const sh = Math.sin(at.h * DEG), ch = Math.cos(at.h * DEG);
        for (const p of r.path) { if (p[0] > 0) { v = v > 0 ? Math.max(0, v - 4 * 0.1) : Math.min(0, v + 4 * 0.1); e += sh * v * 0.1; n += ch * v * 0.1; } p[1] = +e.toFixed(2); p[2] = +n.toFixed(2); p[4] = +(p[0] > 0 ? v : at.v).toFixed(2); } }
      return r;
    };
    P._finishVolleys = function () {
      if (!this.cmd) return fin0.call(this);
      const v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null, was = !v || v.done; fin0.call(this); if (v && v.done && !was && this.tank.alive) this._ordAfterVolley(v);
    };
  }
  // the player's standing orders at the start of a battle (opt.command === 'player'), or null when the crew commands
  function fresh(opt) {
    if (!opt || opt.command !== 'player') return null;
    const sched = (opt.orders || []).filter(o => o && typeof o.k === 'string' && isFinite(+o.t)).map(o => Object.assign({}, o, { t: +o.t })).sort((a, b) => a.t - b.t);
    return { q: [], log: [], sched, si: 0, acks: [], last: null, given: 0, tick: 0, haltT: 0, halts: [], told: {}, move: null, face: null, target: null,
      prio: 'danger', main: 'free', round: 'auto', mg: 'free', hkoi: 'auto', warn: 'judge', smokepol: 'crew', hatch: 'auto', smokes: K.smokes, smokeAt: null, smokeXY: null, stats: { t: 0, contact: 0, exposed: 0 } };
  }
  const api = { install, fresh, OPTIONS, LABEL, K };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKOrders = api;
})(typeof window !== 'undefined' ? window : globalThis);
