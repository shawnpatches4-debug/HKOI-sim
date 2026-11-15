// What kills an Abrams, and what a crippled one does next.
//
// The engine (src/engine.js) decides whether a hit knocks the vehicle out. The damage model (src/dmg.js, DMG.report) says which plate
// was struck, whether the jet got through and which parts and crewmen lay in its path. This file reads that report at the moment of
// each hit and names the end: it never rolls a die of its own for what the report already decides, and it never contradicts the engine.
// It works for whichever vehicle the battle is looking at (the player's tank, or the wingman of src/battle/support.js).
//
// ============================================================================================================================
// DATA CONTRACT for anything that draws or lists it (read only)
//   battle.tank.fate (also battle.wing.fate) -> {
//     kind       'ok' | 'mobility_kill' | 'firepower_kill' | 'abandoned' | 'knocked_out' | 'ammo_vented' | 'catastrophic'
//                ok            still fighting (mobility and firepower below may still say 'damaged')
//                mobility_kill alive, cannot move: fights from where it stands
//                firepower_kill alive, main gun out or its ammunition burned: breaks contact and withdraws
//                abandoned     alive but can neither move nor fire: the crew leaves it
//                knocked_out   lost: the crew bails out (those the damage report did not kill)
//                ammo_vented   lost: bustle ammunition burns, the blast door holds, the blow-out panels vent it upward; the crew gets out
//                catastrophic  lost: the hull rack was struck by the jet, or the bustle burned with the blast door open; the crew is lost
//     t          battle time of the hit that decided it (null while ok)
//     cause      plain words            zone, zoneName   the plate struck            by   the weapon's key (kornet, rpg, fpv, ke ...)
//     mobility   'ok' | 'damaged' | 'killed'             firepower  'ok' | 'killed'  (why: mobilityWhy, firepowerWhy)
//     blowout    null | { t0, t1 }   the blow-out panels are off and the bustle ammunition burns upward between these times
//     fire       null | { t0, t1, where: 'engine' | 'hull' | 'crew' | 'all' }   flames on the outside of the vehicle
//     crew       { cdr, gnr, ldr, drv }, each { state: 'ok' | 'wounded' | 'killed', out: null | { t0, t1 } }
//                out = the time he starts to climb out and the time he is clear of the vehicle (null: he stays, or never got out)
//     hits       every hit so far: [{ t, key, zone, penetrated, killing, comps: [ids], note }]
//   }
//   events (battle.events): tank_fate { kind, cause, zone, by, wing }, blowout { t1, wing }, bail_out { who, t1, wounded, wing }
//     (wing: true when it is the wingman's). 'tank_fate' fires at the hit; 'blowout' 0.15 s after it; one 'bail_out' per man as he starts out.
//   battle.fateReport() -> { on, tank: fate, wing: fate | null }
// ============================================================================================================================
//
// WHAT IS READ FROM THE DAMAGE REPORT (no new dice)
//   killing hit, hull ammunition rack in the jet ('destroyed')     -> catastrophic
//   killing hit, bustle ammunition in the jet                      -> ammo_vented (door shut) or catastrophic (door open, see below)
//   any other killing hit                                          -> knocked_out; cause from what the jet reached (engine, fuel, crew)
//   surviving hit, engine or transmission in the jet               -> mobility kill          (struck by spall only: mobility damaged, half speed)
//   surviving hit, main gun breech in the jet                      -> firepower kill (gun and coax out)
//   surviving hit, bustle ammunition in the jet                    -> the ready ammunition burns out through the panels: firepower kill
//   crewmen: killed or wounded exactly as the report says
//
// ASSUMPTIONS (Claude, 15 Nov 2026; none from a trial, none tuned to a result; each open to challenge)
// | What | Figure | Why |
// | --- | --- | --- |
// | Blast door open | only while the loader is drawing a round: from 1 s to 3 s into a 6 s (14 s without a loader) load, and never when the gun is loaded, the loader is up on his M240 or down | the door of the bustle rack is knee-switch operated and shut except while a round is pulled; taken from the loader's state in tankai.js, not from a die |
// | Hull rack struck on a surviving hit | recorded as damaged, no explosion | the engine has said the vehicle survives; the model does not overrule it |
// | Bustle ammunition burning through the panels | 12 s | judgement |
// | Fire on a knocked-out vehicle | engine fire 90 s, fuel fire 60 s, otherwise 20 s of smoke | judgement; drawing only |
// | Catastrophic fire | 120 s | judgement; drawing only |
// | Bailing out | the first man starts 3 s after the hit, the next every 1.5 s (commander, loader, gunner, driver), each takes 4 s, a wounded man 8 s | judgement |
// | A tank that can neither move nor fire | the crew leaves it 20 s after the second loss, if no engagement is running | judgement |
// | A firepower-killed tank that can still move | breaks contact at once and withdraws to its start line at 9 m/s (the same drill tankai.js uses when its protection runs out) | task statement |
// | Turret drive, sights, stabiliser destroyed | NOT a firepower kill here (the crew fights on in degraded mode) | judgement |
//
// The naming of the end is always worked out (battle.tank.fate), silently. The events, the log lines and what it makes the crew DO
// (stand still, withdraw, abandon) only happen with `fate: true` in the battle's options, so every stored baseline battle is unchanged
// without it (tests/battle/fate.js part 1). The page switches it on.
(function (root) {
  'use strict';
  let DEPS = null;
  const dmg = () => (DEPS && DEPS.DMG) || root.DMG || (typeof DMG !== 'undefined' ? DMG : null);   /* the damage model (dmg.js) */
  const BURN = { blowout: 12, engine: 90, fuel: 60, smoke: 20, cat: 120 }, BAIL = { first: 3, gap: 1.5, takes: 4, woundedTakes: 8, order: ['cdr', 'ldr', 'gnr', 'drv'] }, ABANDON_S = 20;
  const NAME = { cdr: 'Commander', gnr: 'Gunner', ldr: 'Loader', drv: 'Driver' };
  const fresh = () => ({ kind: 'ok', t: null, cause: null, zone: null, zoneName: null, by: null, mobility: 'ok', mobilityWhy: null, firepower: 'ok', firepowerWhy: null, blowout: null, fire: null,
    crew: { cdr: { state: 'ok', out: null }, gnr: { state: 'ok', out: null }, ldr: { state: 'ok', out: null }, drv: { state: 'ok', out: null } }, hits: [] });

  const methods = {
    /* events and log lines only with fate: true, so a battle without it is exactly the battle from before this file */
    _fev(t, type, o) { if (this.fateOn) this.ev(t, type, o); }, _fsay(t, kind, who, text, why) { if (this.fateOn) this.say(t, kind, who, text, why); },
    _fate(T) { T = T || this.tank; return T.fate || (T.fate = fresh()); },
    // is the bustle's blast door open right now? Read from the loader's work in tankai.js (see the assumptions above).
    _fateDoorOpen(T) { const A = T.ai, L = A && A.ldr; if (!A || !L || T.loaded !== false || L.up || !L.ok || !((T.main || 0) + (T.ap || 0) > 0)) return false; return (T.loadT || 0) >= 1 && (T.loadT || 0) <= 3; },
    // an engagement has just been worked out: note when each hit will land (called from battle.js with the vehicle it was fought for)
    _fateVolley(v, T) {
      const D = dmg(); if (!D) return; const rep = D.report(v.rec, v.cfg); if (!rep.length) return; this._fate(T);
      const q = T.fateQ || (T.fateQ = []); for (const h of rep) q.push({ t: v.t0 + h.t, h, v: v.i }); q.sort((a, b) => a.t - b.t);
      // a hit that will wreck the engine stops the vehicle where it is: the rest of the planned dash does not happen
      if (this.fateOn && !v.rec.killed) { const m = rep.find(h => !h.killing && h.comps.some(c => (c.id === 'engine' || c.id === 'trans') && c.state === 'destroyed')); if (m) { let stop = null; for (const p of v.path) if (p[0] >= m.t) { if (!stop) stop = p.slice(); p[1] = stop[1]; p[2] = stop[2]; p[3] = stop[3]; p[4] = 0; } } }
    },
    // every step: hits whose time has come are named
    _fateStep() {
      const T = this.tank, q = T.fateQ; if (q) while (q.length && this.t >= q[0].t) { const x = q.shift(); this._fateHit(T, x.h, x.t); }
      const F = T.fate; if (!F || !this.fateOn || !T.alive) return;
      if (this.over) { if (this.over.result === 'withdrawn' && F.firepower === 'killed' && T === this._fatePlayer()) this.over.text = 'The vehicle broke contact with its main gun out of action.'; return; }
      if (F.wantWithdraw && T.ai && T.ai.m && !this._volleyActive() && !this._pending) { F.wantWithdraw = false; const M = T.ai.m;
        if (M.phase !== 'withdraw' && F.mobility !== 'killed') { M.phase = 'withdraw'; T.ai.search = null; this._goTo(M.home, 9, { text: `Commander breaks contact: ${F.firepowerWhy}. Pulling back to the start line.`, why: 'a tank that cannot fire its main gun is only a target' }); T.intent = 'Withdrawing: main gun out of action'; } }
      if (F.mobility === 'killed' && F.firepower === 'killed' && F.kind !== 'abandoned' && !this._volleyActive() && !this._pending && this.t >= F.bothAt + ABANDON_S) {
        F.kind = 'abandoned'; F.t = this.t; F.cause = 'the vehicle can neither move nor fire: the crew leaves it'; this._fateBail(T, this.t, true);
        this._fev(this.t, 'tank_fate', this._fateTag(T, { kind: 'abandoned', cause: F.cause, zone: F.zone, by: F.by }));
        this._fsay(this.t, 'result', null, `${this._fateWho(T)}: the crew abandons the vehicle. It can neither move nor fire.`, `${ABANDON_S} s after the second loss with nothing inbound (assumed)`);
        if (T === this._fatePlayer()) { this.over = { result: 'abandoned', text: 'The crew left a vehicle that could neither move nor fire.' }; this._fev(this.t, 'over', { result: 'abandoned' }); } else { T.alive = false; T.out = 'abandoned'; } }
    },
    _fatePlayer() { return this._supPlayer ? this._supPlayer() : this.tank; },
    _fateWho(T) { return T === this._fatePlayer() ? 'The vehicle' : 'Wingman'; },
    _fateTag(T, o) { if (T !== this._fatePlayer()) o.wing = true; return o; },
    _fateBail(T, t, all) {
      const F = T.fate; let k = 0;
      for (const who of BAIL.order) { const c = F.crew[who]; if (c.state === 'killed' || c.out) continue; const t0 = t + BAIL.first + k * BAIL.gap, t1 = t0 + (c.state === 'wounded' ? BAIL.woundedTakes : BAIL.takes); c.out = { t0: +t0.toFixed(2), t1: +t1.toFixed(2) }; k++;
        this._fev(t0, 'bail_out', this._fateTag(T, { who, t1: c.out.t1, wounded: c.state === 'wounded' })); }
      return k;
    },
    _fateHit(T, h, t) {
      const F = this._fate(T), has = (id, st) => h.comps.some(c => c.id === id && (!st || c.state === st)), who = this._fateWho(T);
      const note = { t: +t.toFixed(2), key: h.key, zone: h.zone, penetrated: h.penetrated, killing: h.killing, comps: h.comps.map(c => c.id), note: null }; F.hits.push(note);
      for (const k of ['cdr', 'gnr', 'ldr', 'drv']) { const s = h.crew[k]; if (s === 'killed') F.crew[k].state = 'killed'; else if (s === 'wounded' && F.crew[k].state === 'ok') F.crew[k].state = 'wounded'; }
      if (T.st && T.st.crew) for (const k of ['cdr', 'gnr', 'ldr', 'drv']) if (T.st.crew[k] === 'wounded' && F.crew[k].state === 'ok') F.crew[k].state = 'wounded';   /* a man hurt earlier (the loader in his hatch) */
      if (h.killing) {
        let kind, cause; const door = this._fateDoorOpen(T);
        if (has('hull_ammo', 'destroyed')) { kind = 'catastrophic'; cause = 'the jet reached the hull ammunition rack'; }
        else if (has('ammo', 'destroyed')) { if (door) { kind = 'catastrophic'; cause = 'the bustle ammunition was hit while the loader had the blast door open'; } else { kind = 'ammo_vented'; cause = 'the bustle ammunition was hit: the blast door held and the blow-out panels vented it upward'; } }
        else { kind = 'knocked_out'; cause = has('engine') || has('trans') ? 'engine compartment penetrated and burning' : has('fuel_l') || has('fuel_r') ? 'fuel cell penetrated: fire in the hull' : Object.values(h.crew).some(s => s === 'killed') ? 'crew compartment penetrated' : h.penetrated ? 'penetration and spall inside the vehicle' : 'the vehicle is disabled'; }
        F.kind = kind; F.t = +t.toFixed(2); F.cause = cause; F.zone = h.zone; F.zoneName = h.zoneName; F.by = h.key; note.note = kind;
        if (kind === 'catastrophic') { for (const k in F.crew) F.crew[k].state = 'killed'; F.blowout = { t0: +(t + 0.15).toFixed(2), t1: +(t + BURN.cat).toFixed(2) }; F.fire = { t0: F.t, t1: +(t + BURN.cat).toFixed(2), where: 'all' }; this._fev(t + 0.15, 'blowout', this._fateTag(T, { t1: F.blowout.t1, catastrophic: true })); }
        else if (kind === 'ammo_vented') { F.blowout = { t0: +(t + 0.15).toFixed(2), t1: +(t + 0.15 + BURN.blowout).toFixed(2) }; F.fire = { t0: F.t, t1: F.blowout.t1, where: 'bustle' }; this._fev(t + 0.15, 'blowout', this._fateTag(T, { t1: F.blowout.t1 })); }
        else F.fire = { t0: F.t, t1: +(t + (has('engine') || has('trans') ? BURN.engine : has('fuel_l') || has('fuel_r') ? BURN.fuel : BURN.smoke)).toFixed(2), where: has('engine') || has('trans') ? 'engine' : has('fuel_l') || has('fuel_r') ? 'hull' : 'crew' };
        this._fev(t, 'tank_fate', this._fateTag(T, { kind, cause, zone: h.zone, by: h.key }));
        const out = kind === 'catastrophic' ? 0 : this._fateBail(T, t), dead = Object.values(F.crew).filter(c => c.state === 'killed').length;
        this._fsay(t, 'result', null, `${who} lost: ${kind === 'catastrophic' ? 'catastrophic kill' : kind === 'ammo_vented' ? 'ammunition fire, vented through the blow-out panels' : 'knocked out'}. ${cause[0].toUpperCase() + cause.slice(1)}. ${kind === 'catastrophic' ? 'The crew is lost.' : `${out} of the crew bail${out === 1 ? 's' : ''} out${dead ? `, ${dead} killed` : ''}.`}`, `${h.zoneName}, ${Math.round(h.armor)} mm against ${Math.round(h.pen)} mm of penetration (damage model)`);
        return;
      }
      // the vehicle lives: what has it lost?
      if (has('hull_ammo', 'destroyed')) note.note = 'hull rack struck, no explosion';
      if (F.mobility !== 'killed' && (has('engine', 'destroyed') || has('trans', 'destroyed'))) { F.mobility = 'killed'; F.mobilityWhy = has('engine', 'destroyed') ? 'the engine is destroyed' : 'the transmission is destroyed'; note.note = 'mobility kill';
        if (this.fateOn) { T.goal = null; T.route = null; T.v = 0; } this._fateLive(T, t, h, 'mobility_kill', `Mobility kill: ${F.mobilityWhy}. ${this.fateOn ? 'It fights on from where it stands.' : ''}`); }
      else if (F.mobility === 'ok' && (has('engine') || has('trans'))) { F.mobility = 'damaged'; F.mobilityWhy = 'engine compartment damaged by spall: half speed'; }
      const gun = has('gun', 'destroyed'), burn = has('ammo', 'destroyed');
      if (burn && !F.blowout) { F.blowout = { t0: +(t + 0.15).toFixed(2), t1: +(t + 0.15 + BURN.blowout).toFixed(2) }; this._fev(t + 0.15, 'blowout', this._fateTag(T, { t1: F.blowout.t1 })); if (this.fateOn) { T.main = 0; T.ap = 0; T.loaded = false; } }
      if (F.firepower !== 'killed' && (gun || burn)) { F.firepower = 'killed'; F.firepowerWhy = gun ? 'the main gun is out of action' : 'the main gun ammunition has burned out through the blow-out panels'; F.gunOut = gun; note.note = (note.note ? note.note + ', ' : '') + 'firepower kill';
        if (this.fateOn) F.wantWithdraw = true; this._fateLive(T, t, h, 'firepower_kill', `Firepower kill: ${F.firepowerWhy}.${burn ? ' The blast door held; the crew is unhurt by it.' : ''}`); }
      if (F.mobility === 'killed' && F.firepower === 'killed' && F.bothAt == null) F.bothAt = t;
    },
    _fateLive(T, t, h, kind, text) {
      const F = T.fate; if (F.kind === 'ok' || kind === 'mobility_kill' && F.kind === 'firepower_kill') { /* the first loss names the state; both together are shown through mobility + firepower */ } F.kind = F.kind === 'ok' ? kind : F.kind; F.t = F.t == null ? +t.toFixed(2) : F.t; F.cause = F.cause || text; F.zone = F.zone || h.zone; F.zoneName = F.zoneName || h.zoneName; F.by = F.by || h.key;
      this._fev(t, 'tank_fate', this._fateTag(T, { kind, cause: text, zone: h.zone, by: h.key })); this._fsay(t, T === this._fatePlayer() ? 'tank' : 'wing', T === this._fatePlayer() ? 'CDR' : 'WING', `${this._fateWho(T)}: ${text}`, `${h.zoneName} penetrated (damage model)`);
    },
    fateReport() { const P = this._fatePlayer(); return { on: !!this.fateOn, tank: this._fate(P), wing: this.wing ? this._fate(this.wing) : null }; },
  };

  // what a crippled crew does: wrapped round the drills of tankai.js and battle.js without editing them
  function install(Battle, deps) {
    DEPS = deps || null;
    const P = Battle.prototype; Object.assign(P, methods);
    const immobile = b => b.fateOn && b.tank.fate && b.tank.fate.mobility === 'killed', gunOut = b => b.fateOn && b.tank.fate && b.tank.fate.firepower === 'killed';
    const wrap = (name, f) => { const orig = P[name]; if (typeof orig !== 'function') return; P[name] = function () { return f.call(this, orig, arguments); }; };
    wrap('_goTo', function (orig, a) { if (immobile(this)) return; if (this.fateOn && this.tank.fate && this.tank.fate.mobility === 'damaged' && a[1] != null) a[1] = a[1] * 0.5; return orig.apply(this, a); });
    wrap('_mission', function (orig, a) { if (immobile(this)) { this.tank.intent = 'Immobilised: fighting from where it stands'; return; } return orig.apply(this, a); });
    wrap('_hullDown', function (orig, a) { if (immobile(this)) { this.tank.searched = a[0].i; return; } return orig.apply(this, a); });
    wrap('_moveTank', function (orig, a) { if (immobile(this)) { const T = this.tank, v = this.volleys.length ? this.volleys[this.volleys.length - 1] : null; if (!(v && this.t <= v.tEnd)) { T.goal = null; T.route = null; T.v = 0; if (T.mode === 'moving' || T.mode === 'returning') T.mode = 'overwatch'; T.intent = 'Immobilised: fighting from where it stands'; return; } } return orig.apply(this, a); });   /* a dead engine does not pivot the hull either */
    wrap('_drivePlan', function (orig, a) { if (!immobile(this)) return orig.apply(this, a); const r = orig.call(this, a[0], a[1], [], a[3], a[4], a[5]); this._holdWhy = 'the vehicle cannot move'; return r; });
    wrap('_returnFire', function (orig, a) { if (!gunOut(this)) return orig.apply(this, a); const T = this.tank; T.main = 0; T.ap = 0; if (T.fate.gunOut) T.coax = 0; const r = orig.apply(this, a); if (T.ai && T.ai.w && !/HKOI/.test(T.ai.w.main || '')) T.ai.w.main = T.fate.gunOut ? 'main gun out of action' : 'no main gun ammunition left: it burned out'; return r; });
  }
  const api = { install, BURN, BAIL, ABANDON_S };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKFate = api;
})(typeof window !== 'undefined' ? window : globalThis);
