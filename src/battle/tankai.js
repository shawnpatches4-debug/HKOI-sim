// The tank crew's fighting drills: who shoots at what, with which weapon, and how the crew finds the enemy.
// (docs/AI_SPEC.md holds the decisions this follows. Numbers marked "assumed" are open to challenge.)
//
// Each weapon has its own operator and picks its own target at the same moment:
//   HKOI station      missiles and drones only (resolved by the engine). It has first call on the main turret, always.
//   main gun + coax   the gunner. The coax points where the main gun points.
//   CROWS .50         the commander's remote station: swings on its own, and is the gun that suppresses a team while the others are busy.
//   loader's M240     only while the loader is up in his hatch; while he is up the main gun cannot be reloaded.
// Target order for every gun: most dangerous first (a team guiding a missile now, then a team that can fire, then one reloading,
// then teams moving or out of sight); nearest breaks ties.
(function (root) {
  'use strict';
  const DEG = Math.PI / 180, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const brgOf = (e0, n0, e1, n1) => (Math.atan2(e1 - e0, n1 - n0) / DEG + 360) % 360, angDiff = (a, b) => ((a - b + 540) % 360) - 180;

  // How fire on a team affects it, by crew level (assumed; approved by Shawn 13 Nov 2026). light/heavy multiply a missile gunner's aim
  // wander; duck is his chance each second under heavy fire of ducking and losing the missile; recover is how long after the fire
  // lifts before the team can aim again.
  const SUPP = {
    green: { light: 2.0, heavy: 4.0, duck: 0.35, recover: 20 },
    trained: { light: 1.5, heavy: 3.0, duck: 0.20, recover: 12 },
    expert: { light: 1.2, heavy: 2.0, duck: 0.08, recover: 6 },
    veteran: { light: 1.1, heavy: 1.5, duck: 0.03, recover: 3 },
  };
  // Machine guns: reach, the range inside which their fire counts as heavy, rounds used per 3 s burst, and the chance per burst of
  // knocking out a dug-in team at point-blank (falls off with range by `fall` metres). All assumed.
  const MG = {
    m2: { name: 'Commander\'s .50', key: 'm2', rmax: 914, heavy: 900, rounds: 24, kill: 0.34, fall: 520, slew: 60, acquire: 1.5 },
    coax: { name: 'Coax', key: 'coax', rmax: 800, heavy: 600, rounds: 40, kill: 0.42, fall: 330 },
    m240: { name: 'Loader\'s M240', key: 'm240', rmax: 800, heavy: 600, rounds: 36, kill: 0.36, fall: 330 },
  };
  const BURST = 3, PAUSE = 1, TURRET_RATE = 40, LOAD_S = 6, LOAD_S_NO_LOADER = 14, LDR_UP_S = 4, LDR_DOWN_S = 2;
  // thermal scanning: how much each condition cuts the chance of picking a team out (assumed)
  const SEEING = { day: 1, dawn: 1, dusk: 1, night: 1, overcast: 1, rain: 0.6, snow: 0.7, fog: 0.35 };

  const methods = {
    // set up the crew's state the first time it is needed
    _crew() {
      const T = this.tank; if (T.ai) return T.ai;
      T.main = 18; T.ap = 24; T.m240 = 800;                  /* a real load of 42 main gun rounds: 18 multi-purpose (used on teams), 24 anti-armour kept for tanks (assumed split) */
      T.tur = T.h; T.loaded = true; T.loadT = 0;
      T.ai = { crows: { brg: T.h, tgt: null, readyAt: 0, busyUntil: 0, said: -1 }, ldr: { up: false, ok: true, busyUntil: 0, upAt: [], said: -1, busyGun: 0 }, coax: { busyUntil: 0, said: -1 }, scanAt: 0, cfq: [], intent: 'Watching from position', w: {} };
      return T.ai;
    },
    // Located enemy teams, most dangerous first. Each: { k (what the crew knows: place), u, R, los, danger }
    _targets() {
      if (this._tgT === this.t) return this._tg; const T = this.tank, W = this.world, out = [], v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null, live = v && this.t <= v.tEnd;
      for (const k of T.known) { if (k.done) continue; const u = this.units.find(q => q.id === k.id); if (!u || !u.alive) { k.done = true; continue; }
        const R = Math.hypot(k.e - T.e, k.n - T.n), los = W.los(T.e, T.n, 2.5, k.e, k.n, 0.8).clear; let danger = 1;
        const guiding = live && v.launches.some(l => l.u === u && u.spec.needsLos && this.t >= v.t0 + l.t0 && (u.state === 'guiding'));
        const moving = u.state === 'moving' && this.t >= (u.packUntil || 0), recent = u.fired > 0 && this.t - (u.lastShotT || -1e9) < u.spec.reload;
        if (guiding) danger = 4; else if (los && !moving) danger = recent ? 2 : 3;
        out.push({ k, u, R, los, danger, moving }); }
      out.sort((a, b) => b.danger - a.danger || a.R - b.R); this._tg = out; this._tgT = this.t; return out;
    },
    // the bearing HKOI needs the main turret on right now (it is engaging a threat), or null
    _hkoiTurret() {
      const v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null; if (!v || this.t > v.tEnd) return null; const tv = this.t - v.t0;
      for (const b of v.rec.bursts || []) { if (b.idx < 0 || !b.rounds || !b.rounds.length) continue; const r0 = b.rounds[0], r1 = b.rounds[b.rounds.length - 1], end = r1.t_burst != null ? r1.t_burst : r1.t_pass;
        if (tv >= r0.t_fire - 2 && tv <= end) { const th = v.rec.threats[b.idx], l = v.launches.find(q => q.u.id === th.uid); if (l) return l.brg; } }
      return null;
    },
    // put fire on a team: the level it now feels, and what that does to it
    _suppress(u, heavy, dur) {
      const S = SUPP[this.skill] || SUPP.trained;
      if (heavy) { u.heavySince = this.t <= (u.heavyUntil || -1) + 1.5 ? u.heavySince : this.t; u.heavyUntil = this.t + dur; u.suppressedUntil = Math.max(u.suppressedUntil || 0, this.t + dur + S.recover); u.sight = 0; }
      else u.lightUntil = this.t + dur + 2;
    },
    // one burst from a machine gun at a located team
    _burst(wKey, tg, opt) {
      const T = this.tank, M = MG[wKey], u = tg.u, R = tg.R, moving = (T.v || 0) > 1.5, heavy = R <= M.heavy;
      T[wKey] = Math.max(0, (T[wKey] || 0) - M.rounds); this._suppress(u, heavy, BURST);
      const p = Math.min(0.6, M.kill * Math.exp(-R / M.fall)) * (moving ? 0.6 : 1) * (u.down && !(opt && opt.first) ? 0.6 : 1), hit = !(opt && opt.noKill) && this.rng.random() < p;
      const rec = { t: this.t, dur: BURST, id: u.id, e: tg.k.e, n: tg.k.n, R, w: wKey, coax: wKey === 'coax', m2: wKey === 'm2', m240: wKey === 'm240', hit }; this._mg = rec; (this.mgs = this.mgs || []).push(rec);
      if (opt && opt.first) this.say(this.t, 'tank', wKey === 'm2' ? 'CDR' : wKey === 'm240' ? 'LDR' : 'GNR', `${M.name} engages ${u.spec.name} #${u.id + 1} at ${Math.round(R / 10) * 10} m.`, opt.why || `located team in view inside ${M.rmax} m; ${heavy ? 'accurate fire: the team is pinned' : 'long range: harassing fire only'}`);
      if (hit) { u.alive = false; u.state = 'dead'; this.killedByMg = (this.killedByMg || 0) + 1; tg.k.done = true; this.say(this.t + BURST, 'tank', 'GNR', `${u.spec.name} #${u.id + 1} knocked out by ${M.name.toLowerCase()} fire at ${Math.round(R / 10) * 10} m.`, `about ${Math.round(p * 100)}% per burst at this range${moving ? ', firing on the move' : ''}`); }
      return rec;
    },

    // ---- thermal scanning: the gunner watches the sector his sight is on, the commander sweeps all round ----
    _scan() {
      const T = this.tank, W = this.world, A = this._crew(); if (this.t < A.scanAt) return; A.scanAt = this.t + 1;
      const see = SEEING[this.cond] == null ? 1 : SEEING[this.cond];
      for (const u of this.units) { if (!u.alive || u.known) continue; const R = Math.hypot(u.e - T.e, u.n - T.n); if (R > 4000) continue; if (!W.los(T.e, T.n, 2.6, u.e, u.n, 0.9).clear) continue;
        const veg = W.veg(u.e, u.n).cls, cover = veg >= 4 ? 0.15 : veg >= 2 ? 0.4 : 1, moving = u.state === 'moving' && this.t >= (u.packUntil || 0), busy = u.state === 'setup' || (u.state === 'moving' && !moving);
        const inSector = Math.abs(angDiff(brgOf(T.e, T.n, u.e, u.n), T.tur)) < 30;
        const p = 0.03 * Math.exp(-R / 1500) * cover * (moving ? 6 : busy ? 2 : 1) * (inSector ? 2 : 1) * see * ((T.v || 0) > 1.5 ? 0.5 : 1);   /* chance per second (assumed) */
        if (this.rng.random() < p) { u.known = true; if (!T.known.some(k => k.id === u.id)) T.known.push({ id: u.id, e: u.e, n: u.n, t: this.t });
          this.say(this.t, 'tank', inSector ? 'GNR' : 'CDR', `${inSector ? 'Gunner' : 'Commander'} picks up a heat signature: ${u.spec.name} #${u.id + 1} at ${Math.round(R / 10) * 10} m${veg >= 4 ? ' in the trees' : veg >= 2 ? ' in scrub' : ' in the open'}.`, `thermal scan, about ${(p * 100).toFixed(1)}% a second for this team here`); } }
      // a located team that is still in view stays tracked as it moves
      for (const k of T.known) { if (k.done) continue; const u = this.units.find(q => q.id === k.id); if (u && u.alive && (u.e !== k.e || u.n !== k.n) && W.los(T.e, T.n, 2.6, u.e, u.n, 0.9).clear) { k.e = u.e; k.n = u.n; k.t = this.t; } }
    },

    // ---- machine guns: the commander's .50 and the loader's M240 (the coax fires with the gunner, below) ----
    _machineGuns() {
      const T = this.tank; if (!T.alive || this._pending) return; const A = this._crew(), tg = this._targets(); this._scan();
      // CROWS .50
      { const C = A.crows, M = MG.m2; while (A.cfq.length && this.t > A.cfq[0].until) A.cfq.shift();
        const forced = A.cfq.length && this.t >= A.cfq[0].t ? A.cfq[0] : null;   /* fire at a launcher whose missile is in the air (decided when the engagement was worked out) */
        let pick = null; if (forced && forced.u.alive) pick = { k: forced.k, u: forced.u, R: forced.R, los: true, danger: 4, forced: true };
        else pick = tg.find(q => q.los && q.R <= M.rmax && q.R > 15 && !q.moving) || tg.find(q => q.los && q.R <= M.rmax && q.R > 15) || null;
        if (T.m2 <= 0) pick = null;
        if (!pick) { C.tgt = null; A.w.m2 = T.m2 > 0 ? 'scanning' : 'out of ammunition'; }
        else { const want = brgOf(T.e, T.n, pick.k.e, pick.k.n), d = angDiff(want, C.brg); C.brg = (C.brg + clamp(d, -M.slew * this.dt, M.slew * this.dt) + 360) % 360;
          if (C.tgt !== pick.u.id) { C.tgt = pick.u.id; C.readyAt = this.t + (pick.forced ? 0 : M.acquire); }
          A.w.m2 = `${pick.u.spec.name} #${pick.u.id + 1}, ${Math.round(pick.R / 10) * 10} m: ${pick.danger === 4 ? 'its missile is in the air' : pick.danger === 3 ? 'it can fire on us' : pick.danger === 2 ? 'reloading' : 'moving'}`;
          if (Math.abs(d) <= 2 && this.t >= C.readyAt && this.t >= C.busyUntil) { const first = C.said !== pick.u.id; C.said = pick.u.id; this._burst('m2', pick, { first, noKill: pick.forced, why: pick.forced ? 'fires at the launch signature to shake the gunner\'s aim while his missile is in flight' : null }); C.busyUntil = this.t + BURST + PAUSE; } } }
      // the loader and his M240
      { const L = A.ldr, M = MG.m240, inbound = this._volleyActive(), near = tg.filter(q => q.los && q.R <= M.rmax && q.R > 15), close = near.filter(q => q.R <= 600);
        const gunNeedsHim = !T.loaded && T.main > 0 && tg.some(q => q.los && q.R > M.rmax && q.danger >= 3);   /* a round is needed for a target the machine guns cannot reach */
        const want = L.ok && T.m240 > 0 && (close.length > 0 || (near.length > 0 && !inbound && !gunNeedsHim));
        if (this.t >= L.busyUntil) {
          if (want && !L.up) { L.up = true; L.busyUntil = this.t + LDR_UP_S; L.upAt.push([this.t, 1e9]); this.say(this.t, 'tank', 'CDR', `Loader up on the M240: ${close.length ? 'enemy team inside 600 m' : 'located team inside 800 m and nothing inbound'}.`, 'while he is up the main gun cannot be reloaded'); }
          else if (!want && L.up) { L.up = false; L.busyUntil = this.t + LDR_DOWN_S; if (L.upAt.length) L.upAt[L.upAt.length - 1][1] = this.t; this.say(this.t, 'tank', 'CDR', `Loader down${inbound ? ': incoming' : gunNeedsHim ? ': main gun needs loading' : ''}.`); } }
        if (L.up && this.t >= L.busyUntil && this.t >= L.busyGun && T.m240 > 0 && near.length) { const pick = near.find(q => q.u.id !== A.crows.tgt) || near[0], first = L.said !== pick.u.id; L.said = pick.u.id; this._burst('m240', pick, { first }); L.busyGun = this.t + BURST + PAUSE; A.w.m240 = `${pick.u.spec.name} #${pick.u.id + 1}, ${Math.round(pick.R / 10) * 10} m`; }
        else A.w.m240 = !L.ok ? 'loader is a casualty' : L.up ? 'loader up, scanning' : 'loader inside';
        // loading the main gun: only while the loader is inside (or by another crewman, slowly, if he is a casualty)
        if (!T.loaded && T.main > 0 && !L.up) { T.loadT += this.dt; if (T.loadT >= (L.ok ? LOAD_S : LOAD_S_NO_LOADER)) { T.loaded = true; T.loadT = 0; } }
        T.mainReady = T.loaded ? 0 : this.t + (L.up ? 99 : Math.max(0, (L.ok ? LOAD_S : LOAD_S_NO_LOADER) - T.loadT)); }
    },

    // ---- the gunner: main gun and coax ----
    _returnFire() {
      const T = this.tank, W = this.world; if (!T.alive || this._pending) return; const A = this._crew(), S = this.skillOf();
      const hk = this._hkoiTurret();
      if (hk != null) { const d = angDiff(hk, T.tur); T.tur = (T.tur + clamp(d, -TURRET_RATE * this.dt, TURRET_RATE * this.dt) + 360) % 360; if (this._rf) { this._rf = null; } A.w.main = 'turret given to HKOI'; A.w.hkoi = 'engaging an incoming threat'; return; }
      A.w.hkoi = this._volleyActive() ? 'tracking' : 'radar silent, waiting for a warning';
      const tg = this._targets(), pick = tg.find(q => q.los && q.R <= 4200 && q.R >= 60 && !(q.moving && q.R > 800)) || null;
      if (!pick) { this._rf = null; A.w.main = T.main > 0 ? 'no target in view' : 'no multi-purpose rounds left'; return; }
      const { k, u, R } = pick, want = brgOf(T.e, T.n, k.e, k.n), d = angDiff(want, T.tur); T.tur = (T.tur + clamp(d, -TURRET_RATE * this.dt, TURRET_RATE * this.dt) + 360) % 360;
      const why = pick.danger === 4 ? 'its missile is in the air' : pick.danger === 3 ? 'it can fire on us' : pick.danger === 2 ? 'reloading' : 'moving';
      A.w.main = `${u.spec.name} #${u.id + 1}, ${(R / 1000).toFixed(2)} km: ${why}`;
      if (!this._rf || this._rf.k !== k) {   /* a new target: time to swing on and lay */
        this._rf = { k, R, at: this.t + Math.abs(d) / TURRET_RATE + 2.5 + R / 1000 * 1.3 };
        this.say(this.t, 'tank', 'GNR', `Gunner lays on ${u.spec.name} #${u.id + 1}, ${(R / 1000).toFixed(2)} km, bearing ${Math.round(want).toString().padStart(3, '0')}: ${why}.`, 'most dangerous located team in view');
        if (u.state === 'hidden' && u.ammo > 0 && this.rng.random() < S.notice) this._displace(u, 'sees the tank\'s gun turning onto it');
        this.shots = this.shots || []; return; }
      this._rf.R = R; if (Math.abs(d) > 1.5) return;
      // on target. Coax inside 800 m; the main gun when the target is worth a round.
      const C = A.coax; if (R <= MG.coax.rmax && T.coax > 0 && this.t >= C.busyUntil) { const first = C.said !== u.id; C.said = u.id; this._burst('coax', pick, { first }); C.busyUntil = this.t + BURST + PAUSE; if (!u.alive) { this._rf = null; return; } }
      const worth = T.main > 0 && T.loaded && (pick.danger >= 3 || R > 600) && !pick.moving;
      if (!worth || this.t < this._rf.at) return;
      const there = u.alive && (u.state !== 'moving' || this.t < (u.packUntil || 0)) && Math.hypot(u.e - k.e, u.n - k.n) < 25;
      if (!there) { k.done = true; u.known = false; this._rf = null; this.say(this.t, 'tank', 'GNR', `Gunner holds fire on the ${u.spec.name} #${u.id + 1} site: the position is empty.`, 'the team has gone; no round wasted'); return; }
      const moving = (T.v || 0) > 1.5, tof = R / 1140, p = Math.max(0.4, Math.min(0.88, 0.92 - R / 5000)) * (moving ? 0.6 : 1), roll = this.rng.random();
      T.main--; T.loaded = false; T.loadT = 0; k.shots = (k.shots || 0) + 1; this._rf = null; let hit = false, text, wtxt;
      if (roll < p) { hit = true; u.alive = false; u.state = 'dead'; k.done = true; this.killedByTank = (this.killedByTank || 0) + 1; text = `Main gun round on ${u.spec.name} #${u.id + 1} at ${(R / 1000).toFixed(2)} km: position destroyed.`; wtxt = `aimed fire at a located position (about ${Math.round(p * 100)}% at this range${moving ? ', on the move' : ''})`; }
      else { this._suppress(u, true, 6); if (u.ammo > 0 && this._displace(u, 'a tank round has just landed beside it')) { /* it packs up; the crew will see it go if it stays in view */ } else if (k.shots >= 3) k.done = true; text = `Main gun round lands close to ${u.spec.name} #${u.id + 1}: team pinned${u.state === 'moving' ? ' and pulling out' : ''}.`; wtxt = 'a near miss: a dug-in team is a small target at this range'; }
      this.say(this.t + tof, 'tank', 'GNR', text, wtxt); this.shots.push({ t: this.t, tof, from: { e: T.e, n: T.n }, to: { e: k.e + (hit ? 0 : (this.rng.random() - 0.5) * 14), n: k.n + (hit ? 0 : (this.rng.random() - 0.5) * 14) }, hit, there: true });
    },

    // ---- counter-fire while a missile is in flight ----
    // Called when an engagement is worked out. For each guided missile whose launcher the crew can place and reach with the .50, decide
    // when the fire starts and what it does to the gunner: either he ducks and the missile is lost (mask), or his aim is shakier (jit_k).
    _counterFire(launches, rec1, plan, at, masks) {
      const T = this.tank, W = this.world, A = this._crew(), S = SUPP[this.skill] || SUPP.trained, M = MG.m2; if (T.m2 <= 0) return;
      const order = launches.map((l, i) => ({ l, i, th: rec1.threats.find(q => q.uid === l.u.id && Math.abs(q.t0 - l.t0) < 1e-6) || rec1.threats[i] })).filter(o => o.th && o.l.u.spec.needsLos && o.l.R <= M.rmax).sort((a, b) => a.th.impact - b.th.impact);
      let free = 0;
      for (const o of order) { const { l, i, th } = o, u = l.u, placed = u.known ? l.t0 + 1.0 : th.track != null ? th.track + 0.5 : null; if (placed == null) continue;
        if (!W.los(at.e, at.n, 2.5, u.e, u.n, 0.8).clear) continue;
        const slew = Math.abs(angDiff(l.brg, A.crows.brg)) / M.slew, ts = Math.max(placed + M.acquire + slew, free); if (ts >= th.impact - 0.5) continue;
        const heavy = l.R <= M.heavy, rate = heavy ? S.duck : S.duck * 0.3; let td = null; for (let t = ts + 1; t < th.impact - 0.2; t += 1) if (this.rng.random() < rate) { td = t; break; }
        const frac = clamp((th.impact - ts) / Math.max(0.5, th.impact - l.t0), 0, 1), v = (root.HK || {}).THREATS ? root.HK.THREATS[l.key].speed : 250;
        if (td != null && masks[i] == null) { masks[i] = Math.max(10, (th.impact - td) * v * 0.55); l.mask_by = 'counter_fire'; this.say(this.t + td, 'enemy', u.id, `${u.spec.name} #${u.id + 1}: gunner ducks under .50 fire and loses his missile.`, `accurate machine-gun fire on a ${this.skill} crew: about ${Math.round(rate * 100)}% a second`); }
        else l.jit_k = 1 + ((heavy ? S.heavy : S.light) - 1) * frac;
        const until = td != null ? td : th.impact; A.cfq.push({ t: this.t + ts, until: this.t + until, u, k: { e: u.e, n: u.n }, R: l.R }); free = until; }
      A.cfq.sort((a, b) => a.t - b.t);
    },
    // after an engagement: was the loader up when something went off beside him?
    _loaderRisk(v) {
      const A = this._crew(), L = A.ldr, T = this.tank; if (!L.ok) return; const upAt = t => L.upAt.some(iv => t >= iv[0] && t <= iv[1]);
      let p = 0; for (const a of v.rec.aps || []) if (upAt(v.t0 + a.t)) p = 1 - (1 - p) * (1 - 0.08);   /* Trophy firing with a man in the hatch (assumed 8% each) */
      if ((v.rec.hits || 0) > 0 && upAt(v.tEnd - 1)) p = 1 - (1 - p) * (1 - 0.5);                          /* a hit on the vehicle with a man in the hatch (assumed 50%) */
      if (p > 0 && this.rng.random() < p) { L.ok = false; L.up = false; if (T.st && T.st.crew) T.st.crew.ldr = 'wounded'; this.say(this.t, 'tank', 'CDR', 'Loader hit while up in his hatch. The commander will have to load.', `exposed during the engagement (about ${Math.round(p * 100)}% this time); the main gun now takes ${LOAD_S_NO_LOADER} s to load and the M240 is silent`); }
    },
    skillOf() { return this._SK[this.skill] || this._SK.trained; },
    // what the crew is doing, for the screen: [[who, text], ...]
    tankStatus() {
      const T = this.tank, A = this._crew(), w = A.w; if (!T.alive) return [['VEHICLE', 'destroyed']];
      return [['CDR', T.intent || A.intent], ['HKOI', w.hkoi || 'radar silent'], ['MAIN', `${w.main || 'no target'} · ${T.main} MP rounds${T.loaded ? '' : ', loading'}`], ['.50', `${w.m2 || 'scanning'} · ${T.m2} rounds`], ['M240', `${w.m240 || 'loader inside'} · ${T.m240} rounds`]];
    },
  };

  function install(Battle, SKILL) { Battle.prototype._SK = SKILL; Object.assign(Battle.prototype, methods); }
  const api = { install, SUPP, MG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKTankAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
