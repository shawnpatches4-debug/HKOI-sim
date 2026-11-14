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
    m2: { name: 'Commander\'s .50', key: 'm2', rmax: 914, heavy: 900, rounds: 24, kill: 0.6, fall: 750, slew: 60, acquire: 1.5 },
    coax: { name: 'Coax', key: 'coax', rmax: 800, heavy: 600, rounds: 40, kill: 0.55, fall: 450 },
    m240: { name: 'Loader\'s M240', key: 'm240', rmax: 800, heavy: 600, rounds: 36, kill: 0.45, fall: 450 },
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
      for (const k of T.known) { if (k.done) continue; const u = this.units.find(q => q.id === k.id); if (!u || !u.alive) { k.done = true; continue; } if (u.gone) { if (W.los(T.e, T.n, 2.5, k.e, k.n, 0.8).clear) k.done = true; continue; }   /* gone: the crew sees the position is empty if it can see it */
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
      const open = this.world.veg(u.e, u.n).cls < 2, caught = u.state === 'moving' || u.state === 'setup';   /* a team caught moving or setting up, or lying in the open, is far easier to hit than one dug in under trees */
      const p = Math.min(0.8, M.kill * Math.exp(-R / M.fall) * (caught ? 1.6 : 1) * (open ? 1.25 : 0.8)) * (moving ? 0.6 : 1), hit = !(opt && opt.noKill) && this.rng.random() < p;
      const rec = { t: this.t, dur: BURST, id: u.id, e: tg.k.e, n: tg.k.n, R, w: wKey, coax: wKey === 'coax', m2: wKey === 'm2', m240: wKey === 'm240', hit }; this._mg = rec; (this.mgs = this.mgs || []).push(rec);
      if (opt && opt.first) this.say(this.t, 'tank', wKey === 'm2' ? 'CDR' : wKey === 'm240' ? 'LDR' : 'GNR', `${M.name} engages ${u.spec.name} #${u.id + 1} at ${Math.round(R / 10) * 10} m.`, opt.why || `located team in view inside ${M.rmax} m; ${heavy ? 'accurate fire: the team is pinned' : 'long range: harassing fire only'}`);
      if (hit) { u.alive = false; u.state = 'dead'; this.killedByMg = (this.killedByMg || 0) + 1; tg.k.done = true; this.say(this.t + BURST, 'tank', 'GNR', `${u.spec.name} #${u.id + 1} knocked out by ${M.name.toLowerCase()} fire at ${Math.round(R / 10) * 10} m.`, `about ${Math.round(p * 100)}% per burst at this range${moving ? ', firing on the move' : ''}`); }
      return rec;
    },

    // ---- thermal scanning: the gunner watches the sector his sight is on, the commander sweeps all round ----
    _scan() {
      const T = this.tank, W = this.world, A = this._crew(); if (this.t < A.scanAt) return; A.scanAt = this.t + 1;
      const see = SEEING[this.cond] == null ? 1 : SEEING[this.cond];
      for (const u of this.units) { if (!u.alive || u.gone || u.known) continue; const R = Math.hypot(u.e - T.e, u.n - T.n); if (R > 4000) continue; if (!W.los(T.e, T.n, 2.6, u.e, u.n, 0.9).clear) continue;
        const veg = W.veg(u.e, u.n).cls, cover = veg >= 4 ? 0.3 : veg >= 2 ? 0.5 : 1, close = R < 400 ? 6 : R < 800 ? 3 : R < 1500 ? 1.5 : 1,   /* men a few hundred metres away fill the thermal sight: far easier to pick out than at two kilometres */ moving = u.state === 'moving' && this.t >= (u.packUntil || 0), busy = u.state === 'setup' || (u.state === 'moving' && !moving);
        const inSector = Math.abs(angDiff(brgOf(T.e, T.n, u.e, u.n), T.tur)) < 30;
        const p = Math.min(0.6, 0.03 * Math.exp(-R / 1500) * cover * close * (moving ? 6 : busy ? 2 : 1) * (inSector ? 2 : 1) * see * ((T.v || 0) > 1.5 ? 0.5 : 1));   /* chance per second (assumed) */
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
      A.w.hkoi = this._volleyActive() ? 'tracking' : (this.transit || []).some(d => d.R0 < 3500) ? 'drone control link picked up: waiting for it to come within reach' : 'radar silent, waiting for a warning';
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
        const onIt = A.crows.tgt === u.id, slew = Math.abs(angDiff(l.brg, A.crows.brg)) / M.slew, ts = Math.max(placed + (onIt ? 0.3 : M.acquire) + slew, free);   /* a gun already laid on that team answers almost at once */ if (ts >= th.impact - 0.5) continue;
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
    // ================= the commander: mission, where to fight from, when to move =================
    // Missions (chosen at setup): 'hold' a battle position with two alternates, 'advance' to an objective in bounds between covered
    // positions, 'hunt' the located enemy. All three use the same judgement of ground (_scorePos).

    // what the commander believes threatens him: located teams (weight 2), where recent launches came from (weight 1)
    _threats() {
      const T = this.tank, out = []; for (const k of T.known) if (!k.done) out.push({ e: k.e, n: k.n, w: 2 });
      for (const vv of this.volleys.slice(-2)) for (const l of vv.launches) { if (l.u.spec.indirect) continue; const a = l.brg * DEG, R = Math.min(l.R, 2500), e = vv.at.e + Math.sin(a) * R, n = vv.at.n + Math.cos(a) * R; if (out.some(o => Math.hypot(o.e - e, o.n - n) < 80)) continue; out.push({ e, n, w: 1 }); }
      return out;
    },
    // How good is this spot to fight from? Higher is better. Hull hidden from threats, turret able to see them, long open ground toward
    // them (HKOI needs room: it is weak inside about 700 m), and no cover close by that an RPG team could use to creep up.
    _scorePos(c, threats, look) {
      const W = this.world; if (!W.inside(c.e, c.n) || !W.passable(c.e, c.n, true)) return -9; if (W.slope(c.e, c.n) > 0.3) return -9;
      let s = 0, sw = 0, hid = 0, see = 0;
      for (const o of threats) { const hull = W.los(o.e, o.n, 1.3, c.e, c.n, 1.0).clear, tur = hull || W.los(o.e, o.n, 1.3, c.e, c.n, 2.6).clear; s += o.w * ((hull ? 0 : 1) + (tur ? 0.6 : 0)); sw += o.w; if (!hull) hid++; if (tur) see++; }
      s = sw ? s / sw : 0.6;
      // open ground toward the enemy (or the way we are looking when no enemy is known): how much of the first 1,000 m is in view
      const dirs = threats.length ? threats.slice(0, 4).map(o => Math.atan2(o.e - c.e, o.n - c.n)) : look != null ? [look * DEG - 0.5, look * DEG, look * DEG + 0.5] : [0, 1.57, 3.14, 4.71];
      let open = 0, on = 0; for (const a of dirs) for (const r of [250, 500, 750, 1000]) { on++; if (W.los(c.e, c.n, 2.6, c.e + Math.sin(a) * r, c.n + Math.cos(a) * r, 1.0).clear) open++; }
      // cover within 300 m that would hide an RPG team
      let rpg = 0, rn = 0; for (let a = 0; a < 6.28; a += 0.785) for (const r of [100, 200, 300]) { rn++; const e = c.e + Math.sin(a) * r, n = c.n + Math.cos(a) * r; if (W.veg(e, n).cls >= 3 || W.buildingAt(e, n)) rpg++; }
      c.hid = hid; c.see = see; c.open = open / on; c.rpg = rpg / rn;
      return s + 0.6 * c.open - 0.8 * c.rpg - (c.d || 0) / 400 * 0.4;
    },
    // Look over the ground around a point for the best positions, a few candidates per step so it never stalls a frame.
    // Returns null while still looking, then the candidates sorted best first.
    _search(key, centre, rMax, threats, look, extra) {
      const T = this.tank, A = this._crew(); let Q = A.search;
      if (!Q || Q.key !== key) { const cands = [], st = rMax > 220 ? 40 : 25; for (let de = -rMax; de <= rMax; de += st) for (let dn = -rMax; dn <= rMax; dn += st) { if (Math.hypot(de, dn) > rMax) continue; const e = centre.e + de, n = centre.n + dn; cands.push({ e, n, d: Math.hypot(e - T.e, n - T.n) }); } Q = A.search = { key, cands, i: 0 }; }
      for (let k = 0; k < 6 && Q.i < Q.cands.length; k++, Q.i++) { const c = Q.cands[Q.i]; c.s = this._scorePos(c, threats, look); if (c.s > -9 && extra) c.s += extra(c); }
      if (Q.i < Q.cands.length) return null;
      A.search = null; return Q.cands.filter(c => c.s > -9).sort((a, b) => b.s - a.s);
    },
    // drive to a place by a route that keeps out of the threats' view where it can
    _goTo(c, vmax, why) {
      const T = this.tank, W = this.world, th = this._threats();
      // exposure to the three heaviest threats, remembered per grid square so each square is only looked at once
      const top = th.slice().sort((p, q) => q.w - p.w).slice(0, 3), memo = new Map();
      const cost = (e, n) => { const key = Math.round(e / 50) * 100003 + Math.round(n / 50); let x = memo.get(key); if (x == null) { x = 0; for (const o of top) if (W.los(o.e, o.n, 1.3, e, n, 1.6).clear) x += 1.2 * o.w; memo.set(key, x); } return x; };
      const route = W.path(T.e, T.n, c.e, c.n, { grid: 50, tank: true, cost: top.length ? cost : null });
      T.route = route && route.length > 1 ? route.slice(1).concat([[c.e, c.n]]) : [[c.e, c.n]]; T.routeI = 0; T.vmax = vmax; T.mode = 'moving'; T.modeSince = this.t; T.goal = { e: c.e, n: c.n };
      if (why) this.say(this.t, 'tank', 'CDR', why.text, why.why);
    },
    // which way the hull should face when halted: front to the worst threat, turned a little to show the side that still has Trophy shots
    _facing() {
      const T = this.tank, th = this._threats(); if (!th.length) return null; let fe = 0, fn = 0; for (const o of th) { fe += (o.e - T.e) * o.w; fn += (o.n - T.n) * o.w; }
      let f = (Math.atan2(fe, fn) / DEG + 360) % 360; const st = T.st || {}; if (st.apsL === 0 && st.apsR > 0) f -= 30; else if (st.apsR === 0 && st.apsL > 0) f += 30; return (f + 360) % 360;
    },
    _mission() {
      const T = this.tank, A = this._crew(), M = A.m || (A.m = { type: this.mission || 'hold', phase: 'start', since: 0, arrived: 0, rounds0: T.main, home: { e: T.home.e, n: T.home.n }, pos: null, cur: -1, lastVolley: -1, clearSince: null });
      if (this.over) return; const st = T.st || {}, tg = this._targets(), th = this._threats(), moving = !!T.goal, v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null;
      const inView = tg.filter(q => q.los), low = st.obs != null && (st.obs <= 0 || (st.apsL || 0) + (st.apsR || 0) <= 1), careful = st.obs != null && (st.obs < 50 || st.apsL === 0 || st.apsR === 0);
      // protection nearly gone: break contact (decision 12)
      if (low && M.phase !== 'withdraw') { M.phase = 'withdraw'; A.search = null; this._goTo(M.home, 9, { text: `Commander breaks contact: ${st.obs <= 0 ? 'HKOI is out of obscurant' : 'Trophy is down to its last shot'}. Pulling back to the start line.`, why: 'he will not fight on without his protection' }); T.intent = 'Withdrawing: protection nearly gone'; return; }
      if (M.phase === 'withdraw') { if (!moving) this.over = { result: 'withdrawn', text: 'The vehicle broke contact with its protection nearly gone.' }; return; }
      if (moving) { M.clearSince = null; return; }
      if (M.arrivedGoal !== T.modeSince) { M.arrivedGoal = T.modeSince; M.arrived = this.t; M.rounds0 = T.main; M.lastVolley = v ? v.i : -1; }
      const here = { e: T.e, n: T.n, d: 0 }, settled = this.t - M.arrived;
      if (M.type === 'hold') this._hold(M, tg, th, inView, settled, v);
      else if (M.type === 'advance') this._advance(M, tg, th, inView, settled, v, careful);
      else this._hunt(M, tg, th, inView, settled, v, careful);
    },
    // HOLD: a primary position and two alternates; shift after being fired on, after several rounds from one spot, or to see a team
    _hold(M, tg, th, inView, settled, v) {
      const T = this.tank;
      if (!M.pos) { const r = this._search('hold', M.home, 200, th, T.h); T.intent = 'Hold: choosing a primary position and two alternates'; if (!r) return;
        const pos = []; for (const c of r) { if (pos.every(p => Math.hypot(p.e - c.e, p.n - c.n) >= 50)) pos.push(c); if (pos.length === 3) break; } if (!pos.length) pos.push({ e: T.e, n: T.n, s: 0, hid: 0, see: 0 });
        M.pos = pos; M.cur = 0; if (Math.hypot(pos[0].e - T.e, pos[0].n - T.n) > 15) this._goTo(pos[0], 7, { text: `Commander takes up his primary position ${Math.round(Math.hypot(pos[0].e - T.e, pos[0].n - T.n) / 5) * 5} m away, with ${pos.length - 1} alternate${pos.length === 2 ? '' : 's'} picked.`, why: 'hull-down where the ground allows, long open view, no cover close by for an RPG team' }); return; }
      if (M.pos.length < 2 || settled < 8 || this._volleyActive()) { T.intent = `Hold: fighting from ${M.cur === 0 ? 'the primary' : 'an alternate'} position`; return; }
      const firedOn = v && v.done && v.i > M.lastVolley, rounds = M.rounds0 - T.main >= 3, blind = tg.find(q => !q.los && !q.moving); let why = null;
      if (firedOn) why = 'he has just been fired on here'; else if (rounds) why = 'three main gun rounds fired from this spot'; else if (blind && settled > 10) why = `${blind.u.spec.name} #${blind.u.id + 1} cannot be seen from here`;
      if (!why) { T.intent = `Hold: fighting from ${M.cur === 0 ? 'the primary' : 'an alternate'} position`; return; }
      let best = -1, bs = -1e9; M.pos.forEach((p, i) => { if (i === M.cur) return; p.d = Math.hypot(p.e - T.e, p.n - T.n); const s = this._scorePos(p, th, T.h) + (blind && this.world.los(p.e, p.n, 2.6, blind.k.e, blind.k.n, 1.0).clear ? 0.8 : 0); if (s > bs) { bs = s; best = i; } });
      M.lastVolley = v ? v.i : -1; M.rounds0 = T.main; if (best < 0) return; M.cur = best; const p = M.pos[best];
      this._goTo(p, 7, { text: `Commander shifts ${Math.round(p.d / 5) * 5} m to ${best === 0 ? 'his primary' : 'an alternate'} position: ${why}.`, why: `hull hidden from ${p.hid} of ${th.length} known threats there, turret sees ${p.see}` }); T.intent = `Hold: shifting position (${why})`;
    },
    // ADVANCE: bounds between covered positions toward the objective, a halt to scan at each; fight from cover when ambushed, then go on
    _advance(M, tg, th, inView, settled, v, careful) {
      const T = this.tank, O = this.objective, dist = Math.hypot(O.e - T.e, O.n - T.n);
      if (dist < 60) { this.over = { result: 'objective', text: 'The vehicle reached its objective.' }; return; }
      const contact = this.volleys.length > 0 || T.known.length > 0, fight = this._volleyActive() || inView.some(q => q.danger >= 2);
      if (fight) { M.clearSince = null; T.intent = 'Advance halted: fighting the teams in view'; return; }
      if (M.clearSince == null) M.clearSince = this.t; const halt = contact ? 40 : 20, quiet = this.t - M.clearSince;
      if (settled < halt || (contact && quiet < 20)) { T.intent = `Advance: halted to scan (${Math.max(0, Math.ceil(Math.max(halt - settled, contact ? 20 - quiet : 0)))} s), ${Math.round(dist / 10) * 10} m to the objective`; return; }
      if (careful && th.length) { T.intent = 'Advance held: protection is low, he will not cross open ground under threat'; return; }
      const brg = brgOf(T.e, T.n, O.e, O.n), step = Math.min(contact ? 200 : 300, dist), centre = { e: T.e + Math.sin(brg * DEG) * step, n: T.n + Math.cos(brg * DEG) * step };
      T.intent = 'Advance: picking the next covered position'; const r = dist < 150 ? [{ e: O.e, n: O.n, d: dist, hid: 0, see: 0 }] : this._search('adv:' + Math.round(T.e) + ':' + Math.round(T.n), centre, 130, th, brg, c => (dist - Math.hypot(O.e - c.e, O.n - c.n) < 100 ? -5 : 0));
      if (!r) return; const p = r.find(c => this._drivable(T.e, T.n, c.e, c.n)) || r[0] || { e: centre.e, n: centre.n, d: step, hid: 0, see: 0 };
      this._goTo(p, careful ? 5 : 8.3, { text: `Commander bounds ${Math.round(p.d / 10) * 10} m toward the objective to ${p.hid > 0 ? 'a hull-down' : 'the next'} position.`, why: th.length ? `hull hidden from ${p.hid} of ${th.length} known threats there; route kept out of their view where possible` : 'no enemy found yet: long open view, away from close cover' }); T.intent = 'Advance: bounding to the next position';
    },
    // HUNT: get a clear shot at the most dangerous located team from a covered position, never close to ground that hides RPG teams
    _hunt(M, tg, th, inView, settled, v, careful) {
      const T = this.tank, W = this.world, top = tg[0];
      if (!top) { if (settled > 45 && this.belief2) { /* nothing located: nothing to hunt yet */ } T.intent = 'Hunt: scanning for the enemy'; return; }
      if (this._volleyActive() || settled < 6) { T.intent = `Hunt: engaging ${top.u.spec.name} #${top.u.id + 1}`; return; }
      if (top.los) { T.intent = `Hunt: ${top.u.spec.name} #${top.u.id + 1} in view at ${Math.round(top.R / 10) * 10} m, engaging from here`; return; }
      if (careful) { T.intent = 'Hunt held: protection is low, he will not close'; return; }
      T.intent = `Hunt: looking for a position with a shot at ${top.u.spec.name} #${top.u.id + 1}`;
      const r = this._search('hunt:' + top.u.id + ':' + Math.round(top.k.e) + ':' + Math.round(T.e), { e: T.e, n: T.n }, 280, th, null, c => { const R = Math.hypot(top.k.e - c.e, top.k.n - c.n); return (W.los(c.e, c.n, 2.6, top.k.e, top.k.n, 1.0).clear ? 1.2 : -0.6) + (R < 300 ? -3 : 0) + (top.R - R) / 280 * 0.3; });
      if (!r) return; const p = r.find(c => c.d > 20 && this._drivable(T.e, T.n, c.e, c.n)); if (!p) { top.k.t = this.t; T.intent = 'Hunt: no position with a shot within reach'; M.arrived = this.t; return; }
      this._goTo(p, 7, { text: `Commander moves ${Math.round(p.d / 10) * 10} m for a shot at ${top.u.spec.name} #${top.u.id + 1}.`, why: `the most dangerous located team; hull hidden from ${p.hid} of ${th.length} known threats at the new spot` });
    },
    // the driver: inside an engagement follow the planned path; otherwise follow the commander's route, and face the threat when halted
    _moveTank(dt) {
      const T = this.tank, v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null;
      if (v && this.t <= v.tEnd) { const p = this.tankAt(this.t); T.e = p.e; T.n = p.n; T.h = p.h; T.v = p.v; T.goal = null; T.route = null; return; }
      this._mission();
      if (T.goal && T.route) {
        let wp = T.route[T.routeI]; let dx = wp[0] - T.e, dn = wp[1] - T.n, d = Math.hypot(dx, dn); const last = T.routeI >= T.route.length - 1;
        if (d < (last ? 2 : 12)) { if (last) { T.goal = null; T.route = null; T.v = 0; T.mode = 'overwatch'; T.modeSince = this.t; return; } T.routeI++; wp = T.route[T.routeI]; dx = wp[0] - T.e; dn = wp[1] - T.n; d = Math.hypot(dx, dn); }
        const want = brgOf(T.e, T.n, wp[0], wp[1]), dh = angDiff(want, T.h); T.h = (T.h + clamp(dh, -35 * dt, 35 * dt) + 360) % 360;
        const vmax = Math.abs(dh) > 50 ? 2 : Math.min(T.vmax || 7, last ? 1 + d * 0.5 : 99); T.v += clamp(vmax - T.v, -4 * dt, 2.4 * dt); T.e += Math.sin(T.h * DEG) * T.v * dt; T.n += Math.cos(T.h * DEG) * T.v * dt;
      } else { T.v = 0; const f = this._facing(); if (f != null) { const dh = angDiff(f, T.h); if (Math.abs(dh) > 4) T.h = (T.h + clamp(dh, -20 * dt, 20 * dt) + 360) % 360; } }
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
