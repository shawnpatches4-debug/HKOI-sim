// The tank crew's nerves: stress and panic for the commander, gunner, loader and driver in the time-stepped battle.
//
// Taken from the old one-raid simulator (src/engine.js: stressNow, crewDecide, planMove) and rebuilt:
//   old: one number for the crew, rebuilt from the raid's events each time it was asked for, falling back to rest in about 6 s;
//        it picked the voice level (calm / tense / panicked), stretched the commander's decision time, made him trust the display
//        less, and at "panic" could make him freeze for 1 to 2 s or make the driver stall or run straight down the line of fire.
//   new: each man has his own stress from 0 to 1 that carries on through the whole battle, rises with what happens to the vehicle,
//        falls in quiet spells, is steadied (or not) by the commander, and is changed by wounds. Every effect on the fight is a
//        stated number, is counted, and is written to the battle log with its reason.
//
// EVERY NUMBER IN THE TABLES BELOW IS AN ASSUMPTION (Claude's, 14 Nov 2026). None comes from trials or from Shawn. They were set once
// from the old simulator's sizes and common sense and were NOT tuned to make HKOI or the vehicle look better or worse.
//
// Switch the whole model off with opt.crewStress === false when making a Battle: every hook then returns "no change" and the battle
// runs exactly as it did before this file existed (tests/battle/crew.js proves it against stored summaries).
//
// The model rolls its own dice (its own random stream from the battle seed), so it never disturbs the battle's other dice.
(function (root) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ROLES = ['cdr', 'gnr', 'ldr', 'drv'];
  const NAME = { cdr: 'Commander', gnr: 'Gunner', ldr: 'Loader', drv: 'Driver' };
  const TAG = { cdr: 'CDR', gnr: 'GNR', ldr: 'LDR', drv: 'DRV' };

  // ---------------------------------------------------------------------------------------------------------------- the tables
  // States. Stress runs from 0 (asleep) to 1 (cannot function). A man is "steady" below 0.35, "strained" to 0.60, "shaken" to 0.85
  // and "panicked" above. To drop back a state he has to fall 0.05 below the line, so he does not flicker between two states.
  const STATE = { strained: 0.35, shaken: 0.60, panicked: 0.85, back: 0.05 };
  const STATES = ['steady', 'strained', 'shaken', 'panicked'];
  // Which of the three recorded voice levels (0 calm, 1 tense, 2 panicked) each state uses.
  const VOICE = { steady: 0, strained: 1, shaken: 1, panicked: 2 };

  // What RAISES stress: size of each jolt for a TRAINED crewman of average nerves (green crews feel 1.4 times this, veterans 0.55).
  const RISE = {
    inbound: 0.07,        // a missile, rocket or drone is seen coming (radar or laser warning, or the HKOI track)
    inAir: 0.005,         // per second, for each seen threat still in the air (the wait)
    near: 0.10,           // a round that misses: this much for one that passes at 0 m, falling to nothing at nearM
    trophy: 0.08,         // Trophy fires: a bang on the turret roof and a warhead defeated a few metres away (was 0.04 until 14 Nov 2026: too small for a missile stopped that close)
    trophyHatch: 0.10,    // ... for a man with his head out of the hatch on that occasion (instead of the 0.04)
    hit: 0.20,            // any hit on the vehicle, armour held or not: the jolt
    // The shock of a hit that gets INSIDE (14 Nov 2026, after Shawn's report of a veteran crew left "steady" by a Konkurs through the
    // hull side into a fuel cell: the jolt was then 0.20 + 0.15 for the hole, times the veteran gain 0.55 = +0.17, not enough to leave
    // "steady"). These four are scaled by QUALITY.shock, not QUALITY.gain: experience damps the routine fright of a fight much more
    // than the fright of a jet through the hull or a fire inside, which few men have ever lived through.
    through: 0.30,        // added for all four when the damage report says the plate was holed (was 0.15)
    nearEntry: 0.20,      // more for a man close to where the jet came in: all of it within ENTRY.fullM, none beyond ENTRY.noneM
    fire: 0.25,           // more for all four when the hit starts a fire inside (fuel cell, hull ammunition, engine, bustle ammunition)
    selfWounded: 0.30,    // the man himself is wounded (was 0.25)
    mateWounded: 0.15,    // another crewman is wounded: screams on the intercom (was 0.12)
    mateDown: 0.30,       // another crewman is killed or cannot go on (was 0.20)
    sides: 0.08,          // fired on from two directions more than 90 degrees apart within 45 s
    trophyEmpty: 0.10,    // Trophy has no shots left on one side (once per side)
    hkoiEmpty: 0.12,      // HKOI has no obscurant rounds left (once), or no HE rounds left (once)
    gunMiss: 0.03,        // the main gun misses: the gunner (the commander feels half)
    newWave: 0.05,        // a fresh enemy group is reported
  };
  // What LOWERS it. Sizes are the same for every crew level (relief is relief).
  const FALL = {
    blinded: 0.03,        // HKOI's display shows the missile cut off from its launcher
    stopped: 0.05,        // a seen threat is stopped by HKOI or Trophy
    missed: 0.03,         // a seen threat misses for any other reason
    kill: 0.08,           // an enemy team is knocked out
  };
  // The resting level stress settles back to. It starts at the crew level's own figure (QUALITY.rest) and is pushed up by:
  const REST = {
    trophyEmpty: 0.05,    // for each Trophy side that is empty
    hkoiEmpty: 0.06,      // HKOI out of obscurant
    wounded: 0.05,        // for each crewman wounded
    down: 0.08,           // for each crewman killed or out of action
    selfWounded: 0.10,    // the wounded man's own resting level
    fatiguePerMin: 0.03,  // for each minute spent under fire without a lull ...
    fatigueMax: 0.15,     // ... up to this much; a quiet spell pays it back second for second
  };
  // How near the entry point a man must be to get RISE.nearEntry (metres, seat to the point where the jet came through).
  const ENTRY = { fullM: 1.0, noneM: 3.5 };
  // A fire inside. While it burns nobody's stress can fall below `floor` (just over the "shaken" line, so every crew level is at least
  // shaken), and the resting level is raised by `rest`. It burns until the extinguishers have put it out (outS) or the crew leaves.
  // The M1's automatic fire suppression fires within a fraction of a second in the crew compartment; the times below are how long
  // until the fire is out AND the crew believes it: alarm off, smoke thinning, a second bottle if it flares again. Assumptions.
  const FIRE = {
    floor: 0.62, rest: 0.25,
    outS: { hull: 8, engine: 20, ammo: 15 },   // fuel cell or hull rack / engine compartment (the driver pulls the second shot) / bustle ammunition burning behind the blast doors
    where: { hull: 'fire in the hull', engine: 'fire in the engine compartment', ammo: 'the bustle ammunition is burning' },
  };
  const TIMING = {
    nearM: 15,            // a miss inside this many metres counts as a near miss
    contactS: 20,         // the crew counts itself "under fire" for this long after the last threat ended
    sidesWindowS: 45,     // how far back "from several directions at once" looks
    sidesAngle: 90,       // degrees apart
    calmInContact: 0.25,  // stress falls at only this share of the normal rate while under fire
    calmInLull: 1.5,      // and this much faster in the lull between enemy waves
    driftUpS: 20,         // seconds for stress below the resting level to climb to it
  };
  // The tank crew's level (setting opt.crewQuality; default trained), in the manner of the enemy SKILL table in battle.js.
  //   gain    multiplies every rise in stress (except the shock of a hit that gets inside: see shock)
  //   shock   multiplies RISE.through, nearEntry, fire and the three wound jolts (14 Nov 2026; a veteran feels 0.8 of a trained man's)
  //   calm    seconds for stress above the resting level to fall by about two thirds when nothing is happening
  //   rest    resting level
  //   freeze  chance that a man who reaches "panicked" stops doing his job for a spell (4 to 10 s)
  //   stall   chance, when a warning comes, that a shaken commander loses 1 to 3 s before ordering (doubled if panicked), and that a
  //           panicked driver loses 1.2 to 2.6 s before moving (the old simulator's sizes)
  //   flinch  chance that a shaken commander will not hold still for HKOI when the drill says hold (doubled if panicked)
  //   bail    chance the crew abandons a vehicle that can still fight, each time the breaking point is reached (see BAIL)
  const QUALITY = {
    green: { gain: 1.4, shock: 1.2, calm: 45, rest: 0.12, freeze: 0.60, stall: 0.45, flinch: 0.50, bail: 0.40 },
    trained: { gain: 1.0, shock: 1.0, calm: 28, rest: 0.08, freeze: 0.20, stall: 0.25, flinch: 0.25, bail: 0.10 },   /* freeze was 0.30 in the first run; lowered once so that a trained man freezing stays rare (the brief asks for that). Nothing else was adjusted after seeing results. */
    expert: { gain: 0.75, shock: 0.9, calm: 20, rest: 0.05, freeze: 0.15, stall: 0.12, flinch: 0.10, bail: 0.04 },
    veteran: { gain: 0.55, shock: 0.8, calm: 14, rest: 0.03, freeze: 0.06, stall: 0.05, flinch: 0.04, bail: 0.01 },
  };
  // How strongly each seat feels the same event: the commander sees the whole picture; the loader sees nothing and hears everything.
  const SEAT = { cdr: 0.9, gnr: 1.0, ldr: 1.15, drv: 1.1 };
  // Leadership: what the commander's state does to the other three (their rises are multiplied by gain, their calming-down by calm).
  // If the commander is out of action the gunner takes over and the crew is treated as led by a panicked man.
  const LEAD = {
    steady: { gain: 0.9, calm: 1.3 },
    strained: { gain: 1.0, calm: 1.0 },
    shaken: { gain: 1.1, calm: 0.8 },
    panicked: { gain: 1.25, calm: 0.6 },
  };
  // What stress DOES. Nothing at all below "strained" (0.35). From there each effect grows in a straight line to the figure given
  // here at stress 1.0. (So at "shaken", 0.60, a man has about 40% of the full effect; at "panicked", 0.85, about 77%.)
  const EFFECT = {
    lay: 0.6,             // gunner: time to lay the main gun on a target, +60%
    load: 0.5,            // loader: time to load a round, +50%
    handover: 0.8,        // commander: time to get the .50 onto a new target, +80%
    react: 0.5,           // commander and driver: time from a warning to the vehicle moving (1.6 s), +50%
    aim: 1.0,             // aim error of the main gun and each machine gun +100% (hit chance divided by 1 + this)
    arc: 0.5,             // gunner's tunnel vision: the 30 degree sector he watches closely shrinks by half
    notice: 0.6,          // chance each second of picking a hidden team out on the thermal sight, down by 60%
    cdrSwitchS: 0.6,      // the commander does one thing at a time: a warning that comes while he is firing the .50 costs this long
    scanOut: 0.3,         // a man who has frozen or is down still leaves this share of his scanning (the others glance his way)
  };
  // Wounds. A crewman the damage report wounds stays at his post, slower and jumpier; some wounds put him out of action.
  const WOUND = {
    downShare: 0.3,       // share of wounds that put the man out of action (a second wound always does; "killed" always does)
    slow: 1.5,            // a wounded man's drills take this many times as long
    aim: 1.3,             // and his aim error is this many times as wide
    gain: 1.3,            // and every rise in his stress is this many times as big
    cdrOnGun: 1.8,        // gunner down: the commander fires the main gun from his own station, this many times slower, and the .50 falls silent
    loadByOther: 14 / 6,  // loader down: another man loads; 14 s instead of 6 s (the figure already used in tankai.js)
    gnrLeads: 1.5,        // commander down: the gunner gives the orders; his chance of flinching is this many times a commander's
  };
  // Panic. A man who reaches "panicked" may freeze (QUALITY.freeze). A frozen gunner does not lay or fire, a frozen loader does not
  // load or man his gun, a frozen commander gives no orders and does not fire the .50, a frozen driver does not move the vehicle.
  const PANIC = { spellMin: 4, spellMax: 10, restS: 30 };   // length of a spell (s); he cannot freeze again for restS after it
  // Buttoning up: the hatches are shut when the vehicle is hit, when Trophy fires with a man in a hatch, or when the commander or the
  // loader is shaken with a threat in the air. Buttoned up, the loader does not man his M240 and the commander's all-round scanning
  // is cut to scan. The hatches open again after openS without a threat, once neither of them is shaken.
  const BUTTON = { scan: 0.6, openS: 30 };
  // Bailing out of a vehicle that can still fight. Only weighed at a breaking point: one second after a hit that did not destroy the
  // vehicle, or after a crewman goes down. It needs ALL of: the armour holed at least once or a crewman hurt; at least `need` of the
  // men still at their posts panicked; and the man in command panicked (or the commander down). Then the dice: QUALITY.bail.
  const BAIL = { need: 2, afterS: 1 };

  // ---------------------------------------------------------------------------------------------------------------- helpers
  const over = s => clamp((s - STATE.strained) / (1 - STATE.strained), 0, 1);   /* how far into the stressed range: 0 below "strained", 1 at stress 1.0 */
  const stateOf = (s, was) => {
    let i = s >= STATE.panicked ? 3 : s >= STATE.shaken ? 2 : s >= STATE.strained ? 1 : 0;
    if (was != null && i < was) {   /* coming down: must clear the line by a margin */
      const line = [0, STATE.strained, STATE.shaken, STATE.panicked][was];
      if (s > line - STATE.back) i = was;
    }
    return i;
  };
  const pct = x => Math.round(x * 100) + '%';
  const sideOf = rel => { const a = ((rel % 360) + 360) % 360; return a < 45 || a >= 315 ? 'the front' : a < 135 ? 'the right' : a < 225 ? 'the rear' : 'the left'; };
  const angDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
  const OFF = Object.freeze({ on: false });
  // does a hit that got through start a fire inside, and where (the damage model's components)? null if not
  const fireOf = h => { const hit = id => (h.comps || []).some(c => c.id === id && c.state !== 'spared');
    return hit('ammo') ? 'ammo' : hit('engine') || hit('trans') ? 'engine' : hit('fuel_l') || hit('fuel_r') || hit('hull_ammo') ? 'hull' : null; };

  function install(Battle, deps) {
    deps = deps || {};
    const HK = deps.HK || root.HK || (typeof globalThis !== 'undefined' ? globalThis.HK : null);
    const dmg = () => deps.DMG || root.DMG || (typeof DMG !== 'undefined' ? DMG : null);   /* the damage model (which plate, holed or not, who is hurt) */

    const methods = {
      // ---- set-up, the first time anything asks ----
      _crewInit() {
        if (this._crewC) return this._crewC;
        const o = this.crewOpt || {};
        if (o.on === false) return (this._crewC = OFF);
        const quality = QUALITY[o.quality] ? o.quality : 'trained', Q = QUALITY[quality];
        const m = {};
        for (const r of ROLES) m[r] = { role: r, s: Q.rest, st: 0, peak: Q.rest, top: 0, why: 'nothing yet', whyT: 0, status: 'ok', outUntil: 0, noFreezeUntil: 0, busy: null, timeIn: [0, 0, 0, 0], wasBad: false };
        const C = this._crewC = {
          on: true, quality, Q, m, rng: new HK.RNG(HK.seedFor(this.seed, 9107)),
          q: [],                /* jolts still to come: { t, fn } in time order (engagements are worked out when they start) */
          air: [],              /* seen threats in the air: { a, b, brg } battle times */
          dirs: [],             /* where recent fire came from: { t, brg } */
          nv: 0, ne: 0, lastFire: -1e9, lastSides: -1e9, underFire: 0, buttoned: false, quietSince: 0, breakAt: null, breakWhy: '',
          pen: 0, abandoned: false, flags: {}, wasLoaded: true, fire: null,
          stats: { lay: { n: 0, add: 0 }, handover: { n: 0, add: 0 }, react: { n: 0, add: 0, noDriver: 0 }, load: { n: 0, add: 0 }, freezes: 0, stalls: 0, flinches: 0, holds: 0, buttonUps: 0, nearBail: 0, bail: 0, fires: 0, events: [] },
        };
        return C;
      },
      // who is doing a job right now: { m, k (how many times slower than the proper man) } or null if nobody can
      _crewDoer(C, job) {
        const m = C.m, able = r => m[r].status !== 'down';
        if (C.abandoned) return null;
        if (job === 'gnr') return able('gnr') ? { m: m.gnr, k: 1 } : able('cdr') ? { m: m.cdr, k: WOUND.cdrOnGun } : null;
        if (job === 'crows') return able('cdr') && able('gnr') ? { m: m.cdr, k: 1 } : null;
        if (job === 'orders') return able('cdr') ? { m: m.cdr, k: 1 } : able('gnr') ? { m: m.gnr, k: WOUND.gnrLeads } : null;
        if (job === 'load') { const A = this.tank.ai, slowAlready = A && A.ldr && A.ldr.ok === false;   /* tankai already charges 14 s when its own loader flag is down */
          return able('ldr') && !slowAlready ? { m: m.ldr, k: 1 } : able('cdr') ? { m: m.cdr, k: slowAlready ? 1 : WOUND.loadByOther } : able('gnr') ? { m: m.gnr, k: slowAlready ? 1 : WOUND.loadByOther } : null; }
        if (job === 'm240') return able('ldr') ? { m: m.ldr, k: 1 } : null;
        if (job === 'drv') return able('drv') ? { m: m.drv, k: 1 } : null;
        return null;
      },
      _crewSlow(m, key) { return (1 + EFFECT[key] * over(m.s)) * (m.status === 'wounded' ? WOUND.slow : 1); },
      _crewLeadState(C) { const c = C.m.cdr; return c.status === 'down' || this.t < c.outUntil ? 'panicked' : STATES[c.st]; },
      _crewNote(C, who, what, text, why, extra) {
        const t = this.t; C.stats.events.push({ t: +t.toFixed(1), who, what, text, why });
        this.ev(t, 'crew', Object.assign({ who, what, why }, extra || {}));
        this.say(t, 'crew', who ? TAG[who] : null, text, why);
      },
      // a jolt (d > 0) or a relief (d < 0) for one man
      _crewBump(C, role, d, why, shock) {
        const m = C.m[role]; if (m.status === 'down') return;
        if (d > 0) {
          d *= (shock ? C.Q.shock : C.Q.gain) * SEAT[role] * (m.status === 'wounded' ? WOUND.gain : 1);
          if (role !== 'cdr') d *= LEAD[this._crewLeadState(C)].gain;
          if (why && d >= 0.02) { m.why = why; m.whyT = this.t; }
        }
        m.s = clamp(m.s + d, 0, 1);
      },
      _crewAll(C, d, why, shock) { for (const r of ROLES) this._crewBump(C, r, d, why, shock); },
      _crewLater(C, t, fn) { C.q.push({ t, fn }); },
      // a crewman is hurt
      _crewWound(C, role, killed, how) {
        const m = C.m[role]; if (m.status === 'down') return;
        const down = killed || m.status === 'wounded' || how === 'hatch' || C.rng.random() < WOUND.downShare;
        m.status = down ? 'down' : 'wounded'; if (down) { m.dead = !!killed; m.busy = killed ? 'killed' : 'out of action'; }
        for (const r of ROLES) if (r !== role) this._crewBump(C, r, down ? RISE.mateDown : RISE.mateWounded, `${NAME[role].toLowerCase()} ${killed ? 'killed' : down ? 'badly wounded' : 'wounded'}`, true);
        if (!down) this._crewBump(C, role, RISE.selfWounded, 'wounded', true);
        const sub = !down ? `he stays at his post: drills ${WOUND.slow} times slower, aim ${WOUND.aim} times wider`
          : role === 'gnr' ? `the commander takes over the main gun (${WOUND.cdrOnGun} times slower) and the .50 falls silent`
            : role === 'ldr' ? 'another man loads: 14 s a round instead of 6 s, and the M240 is silent'
              : role === 'cdr' ? 'the gunner takes command; nobody is on the .50'
                : 'nobody can drive: the vehicle cannot move';
        this._crewNote(C, role, down ? 'down' : 'wounded', `${NAME[role]} ${killed ? 'killed' : down ? 'badly wounded and out of action' : 'wounded'}.`, sub);
        if (down) { C.breakAt = this.t + BAIL.afterS; C.breakWhy = `${NAME[role].toLowerCase()} ${killed ? 'killed' : 'out of action'}`; }
      },

      // ---- a new engagement has been worked out: line up what the crew will see and feel, at the moment each thing happens ----
      _crewVolley(C, v) {
        const rec = v.rec, t0 = v.t0, tKill = rec.killed ? (rec.kill_t != null ? rec.kill_t : rec.t_end) : 1e9, hull = v.at.h;
        for (const th of rec.threats || []) {
          const end = th.viz && th.viz.end, tEnd = end ? end.t : th.impact, kn = Math.max(0, Math.min(th.cue != null ? th.cue : 1e9, th.track != null ? th.track : 1e9));
          const seen = kn < tEnd, tt = HK.THREATS[th.key] || {}, what = tt.guidance === 'drone' ? 'drone' : th.key === 'rpg' ? 'rocket' : 'missile', from = sideOf(th.brg - hull);
          if (seen && kn < tKill) {
            this._crewLater(C, t0 + kn, () => {
              this._crewAll(C, RISE.inbound, `${what} inbound from ${from}`);
              C.air.push({ a: this.t, b: t0 + tEnd });
              const other = C.dirs.find(d => this.t - d.t <= TIMING.sidesWindowS && Math.abs(angDiff(d.brg, th.brg)) > TIMING.sidesAngle);
              C.dirs.push({ t: this.t, brg: th.brg });
              if (other && this.t - C.lastSides > TIMING.sidesWindowS) { C.lastSides = this.t; this._crewAll(C, RISE.sides, `fired on from two sides (${from} and ${sideOf(other.brg - hull)})`); }
            });
            for (const p of (th.viz && th.viz.phases) || []) if (p.mode === 'blind' && p.t >= kn && p.t < tEnd && p.t < tKill) this._crewLater(C, t0 + p.t, () => this._crewAll(C, -FALL.blinded));
          }
          if (!end || end.t >= tKill) continue;
          if (end.type === 'hit') continue;   /* hits come from the damage report below */
          const stopped = /^hkoi|^aps$/.test(th.defeated_by || ''), near = end.type === 'miss' && end.miss != null && end.miss < TIMING.nearM ? end.miss : null;
          this._crewLater(C, t0 + end.t, () => {
            C.lastFire = this.t;
            if (near != null) this._crewAll(C, RISE.near * (1 - near / TIMING.nearM), `${what} passed ${Math.round(near)} m away`);
            if (seen) this._crewAll(C, -(stopped ? FALL.stopped : FALL.missed));
          });
        }
        for (const a of rec.aps || []) if (a.t < tKill) this._crewLater(C, t0 + a.t, () => {
          C.lastFire = this.t; const A = this.tank.ai, ldrUp = !!(A && A.ldr && A.ldr.up), side = a.side === 'L' ? 'left' : 'right';
          for (const r of ROLES) this._crewBump(C, r, r === 'ldr' && ldrUp ? RISE.trophyHatch : RISE.trophy, r === 'ldr' && ldrUp ? `Trophy fired beside his open hatch (${side} side)` : `Trophy fired on the ${side} side`);
          if (ldrUp) this._crewButton(C, 'Trophy fired with the loader up in his hatch');
        });
        // hits: which plate, holed or not, who was hurt
        const D = dmg(); let rep = null; try { rep = D && rec.hits ? D.report(rec, v.cfg) : null; } catch (e) { rep = null; }
        const hits = rep || (rec.threats || []).filter(th => th.viz && th.viz.end && th.viz.end.type === 'hit').map(th => ({ t: th.viz.end.t, zoneName: 'vehicle', penetrated: false, crew: {} }));
        for (const h of hits) if (h.t < tKill && !h.killing) this._crewLater(C, t0 + h.t, () => {
          C.lastFire = this.t; const plate = String(h.zoneName || 'vehicle').toLowerCase(), fire = h.penetrated ? fireOf(h) : null;
          const why = `hit on the ${plate}, ${h.penetrated ? 'through the armour' : 'armour held'}${fire ? '; ' + FIRE.where[fire] : ''}`;
          this._crewAll(C, RISE.hit, why);   /* the jolt: every hit */
          if (h.penetrated) {   /* the shock: a hit that gets inside (QUALITY.shock), most for the men nearest the hole */
            C.pen++; const near = this._crewNear(h);
            for (const r of ROLES) this._crewBump(C, r, RISE.through + RISE.nearEntry * near[r] + (fire ? RISE.fire : 0), why, true);
            if (fire) this._crewFire(C, fire, plate);
          }
          for (const r of ROLES) if (h.crew && h.crew[r] && h.crew[r] !== 'ok') this._crewWound(C, r, h.crew[r] === 'killed', 'hit');
          this._crewButton(C, `hit on the ${plate}`);
          if (C.breakAt == null) { C.breakAt = this.t + BAIL.afterS; C.breakWhy = `hit on the ${plate}${h.penetrated ? ', through the armour' : ''}`; }
        });
        C.q.sort((a, b) => a.t - b.t);
      },
      // how near each seat is to the point where the jet came in: 1 within ENTRY.fullM, 0 beyond ENTRY.noneM (the seat positions of
      // the damage model, turret seats turned with the turret as it was at the hit)
      _crewNear(h) {
        const D = dmg(), out = { cdr: 0, gnr: 0, ldr: 0, drv: 0 }; if (!D || !D.COMPS || !h.entry) return out;
        for (const c of D.COMPS) if (c.crew && out[c.id] != null) {
          const p = c.turret && D.rot ? D.rot(c.p, -(h.turA || 0)) : c.p, d = Math.hypot(p[0] - h.entry[0], p[1] - h.entry[1], p[2] - h.entry[2]);
          out[c.id] = clamp((ENTRY.noneM - d) / (ENTRY.noneM - ENTRY.fullM), 0, 1);
        }
        return out;
      },
      // a fire inside starts (or flares again): it holds every man at least shaken until it is out
      _crewFire(C, where, plate) {
        const until = this.t + FIRE.outS[where];
        if (C.fire && C.fire.until > this.t) { C.fire.until = Math.max(C.fire.until, until); return; }
        C.fire = { where, since: this.t, until }; C.stats.fires++;
        this._crewNote(C, null, 'fire', `Fire inside: ${FIRE.where[where]}. The extinguishers fire.`, `hit on the ${plate}; every man is held at least shaken until it is out (about ${FIRE.outS[where]} s)`, { where });
      },
      _crewButton(C, why) {
        if (C.buttoned || C.abandoned) return; C.buttoned = true; C.stats.buttonUps++;
        this._crewNote(C, null, 'button_up', 'Crew buttons up: hatches shut.', `${why}; the loader will not man the M240 and the commander's all-round scan is cut to ${pct(BUTTON.scan)}`);
      },

      // ---- every battle step ----
      _crewStep(dt) {
        const C = this._crewInit(); if (!C.on || C.abandoned) return;
        const T = this.tank, t = this.t, Q = C.Q;
        while (C.nv < this.volleys.length) this._crewVolley(C, this.volleys[C.nv++]);
        // things the battle reports as they are decided (they can lie a moment in the future: a shell's time of flight)
        const E = this.events || [];
        for (; C.ne < E.length; C.ne++) {
          const e = E[C.ne];
          if (e.type === 'gun' && !e.hit) this._crewLater(C, e.t + (e.tof || 0), () => { this._crewBump(C, 'gnr', RISE.gunMiss, 'main gun missed'); this._crewBump(C, 'cdr', RISE.gunMiss / 2, 'main gun missed'); });
          else if (e.type === 'team_lost') this._crewLater(C, e.t, () => this._crewAll(C, -FALL.kill));
          else if (e.type === 'loader_hit') this._crewLater(C, e.t, () => this._crewWound(C, 'ldr', false, 'hatch'));
          else if (e.type === 'wave' && e.wave > 0) this._crewLater(C, e.t, () => this._crewAll(C, RISE.newWave, 'a new enemy group reported'));
          else continue;
          C.q.sort((a, b) => a.t - b.t);
        }
        // the defences' counters
        const st = T.st || {}, F = C.flags;
        if (st.apsL === 0 && !F.apsL) { F.apsL = true; this._crewAll(C, RISE.trophyEmpty, 'Trophy empty on the left'); }
        if (st.apsR === 0 && !F.apsR) { F.apsR = true; this._crewAll(C, RISE.trophyEmpty, 'Trophy empty on the right'); }
        if (st.obs != null && st.obs <= 0 && !F.obs && this.cfg0.hkoi_enabled !== false) { F.obs = true; this._crewAll(C, RISE.hkoiEmpty, 'HKOI out of obscurant rounds'); }
        if (st.he != null && st.he <= 0 && !F.he && this.cfg0.hkoi_enabled !== false) { F.he = true; this._crewAll(C, RISE.hkoiEmpty, 'HKOI out of HE rounds'); }
        // jolts that are due
        while (C.q.length && C.q[0].t <= t + 1e-9) C.q.shift().fn();
        if (C.abandoned) return;
        // the wait while threats are in the air; time under fire; time since the last lull
        C.air = C.air.filter(a => a.b > t); const inAir = C.air.length; if (inAir) C.lastFire = t;
        C.dirs = C.dirs.filter(d => t - d.t <= TIMING.sidesWindowS);
        const contact = inAir > 0 || t - C.lastFire < TIMING.contactS, lull = this.waveAt != null;
        C.underFire = Math.max(0, C.underFire + (contact ? dt : -dt)); if (contact) C.quietSince = t;
        const fatigue = Math.min(REST.fatigueMax, REST.fatiguePerMin * C.underFire / 60);
        let hurt = 0, down = 0; for (const r of ROLES) { if (C.m[r].status === 'wounded') hurt++; else if (C.m[r].status === 'down') down++; }
        if (C.fire && t >= C.fire.until) { const f = C.fire; C.fire = null; this._crewNote(C, null, 'fire_out', 'Fire out.', `${FIRE.where[f.where]} put out after ${Math.round(t - f.since)} s`, { where: f.where }); }
        const burning = !!C.fire;
        const restAll = (burning ? FIRE.rest : 0) + Q.rest + (F.apsL ? REST.trophyEmpty : 0) + (F.apsR ? REST.trophyEmpty : 0) + (F.obs ? REST.hkoiEmpty : 0) + hurt * REST.wounded + down * REST.down + fatigue;
        const lead = LEAD[this._crewLeadState(C)], calmK = (contact ? TIMING.calmInContact : lull ? TIMING.calmInLull : 1);
        for (const r of ROLES) {
          const m = C.m[r]; if (m.status === 'down') continue;
          if (inAir) this._crewBump(C, r, RISE.inAir * inAir * dt, inAir > 1 && t - m.whyT > 4 ? `${inAir} threats in the air at once` : null);
          const rest = Math.min(burning ? 0.75 : 0.5, restAll + (m.status === 'wounded' ? REST.selfWounded - REST.wounded : 0));
          if (m.s > rest) m.s = rest + (m.s - rest) * Math.exp(-dt * calmK * (r === 'cdr' ? 1 : lead.calm) / Q.calm);
          else m.s = rest + (m.s - rest) * Math.exp(-dt / TIMING.driftUpS);
          if (burning && m.s < FIRE.floor) m.s = FIRE.floor;   /* nobody is calm in a burning vehicle */
          if (fatigue >= 0.05 && m.s <= rest + 0.01 && t - m.whyT > 30) { m.why = `${Math.round(C.underFire / 60)} min under fire without a lull`; m.whyT = t; }
          if (m.s > m.peak) m.peak = m.s;
          // state, and what happens when a man reaches the far end
          const was = m.st, now = stateOf(m.s, was); m.timeIn[now] += dt;
          if (now !== was) {
            m.st = now; if (now > m.top) m.top = now;
            this.ev(t, 'crew', { who: r, what: 'state', state: STATES[now], level: VOICE[STATES[now]], why: m.why });
            if (now > was && now >= 2) {
              m.wasBad = true;
              if (now === 3 && t >= m.noFreezeUntil && t >= m.outUntil) {
                const p = Q.freeze;
                if (C.rng.random() < p) {
                  const dur = +(C.rng.uniform(PANIC.spellMin, PANIC.spellMax)).toFixed(1); m.outUntil = t + dur; m.noFreezeUntil = t + dur + PANIC.restS; C.stats.freezes++;
                  const job = r === 'cdr' ? 'gives no orders and leaves the .50' : r === 'gnr' ? 'stops laying and firing' : r === 'ldr' ? 'stops loading' : 'will not move the vehicle';
                  this._crewNote(C, r, 'freeze', `${NAME[r]} panics: he ${job} for ${dur} s.`, `${m.why}; stress ${pct(m.s)}; a ${C.quality} crewman freezes ${pct(p)} of the times he gets this far`, { dur });
                } else this._crewNote(C, r, 'panic_held', `${NAME[r]} is at breaking point but keeps working.`, `${m.why}; stress ${pct(m.s)}`);
              } else if (now === 2) this._crewNote(C, r, 'shaken', `${NAME[r]} is shaken.`, `${m.why}; stress ${pct(m.s)}`);
            } else if (now < was && now <= 1 && m.wasBad) { m.wasBad = false; this._crewNote(C, r, 'steadied', `${NAME[r]} has steadied.`, `stress back to ${pct(m.s)}`); }
          }
          m.busy = t < m.outUntil ? `frozen for ${Math.ceil(m.outUntil - t)} s more` : null;
        }
        // hatches
        if (!C.buttoned && inAir && (C.m.cdr.st >= 2 || C.m.ldr.st >= 2)) this._crewButton(C, `${C.m.cdr.st >= 2 ? 'commander' : 'loader'} shaken with a threat in the air`);
        if (C.buttoned && t - C.quietSince > BUTTON.openS && C.m.cdr.st < 2 && C.m.ldr.st < 2) { C.buttoned = false; this._crewNote(C, null, 'hatches_open', 'Hatches open again.', `${BUTTON.openS} s without a threat`); }
        // main gun loads, for the count of added loading time
        if (T.loaded !== undefined) { if (T.loaded && !C.wasLoaded) C.stats.load.n++; C.wasLoaded = !!T.loaded; }
        // breaking point
        if (C.breakAt != null && t >= C.breakAt) { C.breakAt = null; this._crewBreak(C); }
      },
      _crewBreak(C) {
        if (!this.tank.alive || this.over) return;
        const m = C.m, atPost = ROLES.filter(r => m[r].status !== 'down'), panicked = atPost.filter(r => m[r].st === 3);
        const leader = m.cdr.status !== 'down' ? m.cdr : m.gnr.status !== 'down' ? m.gnr : null, hurt = ROLES.filter(r => m[r].status !== 'ok');
        if (!(C.pen > 0 || hurt.length > 0)) return;
        if (panicked.length < Math.min(BAIL.need, atPost.length)) return;
        if (leader && leader.st !== 3 && m.cdr.status !== 'down') return;
        const p = C.Q.bail, why = `${C.breakWhy}; ${panicked.map(r => NAME[r].toLowerCase()).join(' and ') || 'nobody'} panicked${hurt.length ? '; ' + hurt.map(r => NAME[r].toLowerCase() + (m[r].status === 'down' ? ' down' : ' wounded')).join(', ') : ''}${C.pen ? `; armour holed ${C.pen === 1 ? 'once' : C.pen + ' times'}` : ''}`;
        if (C.rng.random() < p) {
          C.abandoned = true; C.stats.bail++; for (const r of atPost) m[r].busy = 'left the vehicle';
          this.over = { result: 'abandoned', text: 'The crew abandoned a vehicle that could still fight.', why };
          this._crewNote(C, null, 'bail_out', 'The crew abandons the vehicle.', `${why} (a ${C.quality} crew goes ${pct(p)} of the times it gets this far)`);
          this.ev(this.t, 'over', { result: 'abandoned' });
        } else { C.stats.nearBail++; this._crewNote(C, null, 'near_bail', 'The crew is close to abandoning the vehicle, but stays.', `${why} (a ${C.quality} crew goes ${pct(p)} of the times it gets this far)`); }
      },

      // ---- the hooks called from tankai.js and battle.js ----
      // extra seconds on a drill: 'lay' (gunner lays the main gun), 'handover' (commander gets the .50 onto a new target),
      // 'react' (warning to the vehicle moving). base = the drill's normal time. 0 when the model is off or the man is steady.
      _crewAdd(what, base) {
        const C = this._crewInit(); if (!C.on) return 0;
        const S = C.stats, t = this.t;
        if (what === 'lay') { const d = this._crewDoer(C, 'gnr'); if (!d) return 0; const add = base * (this._crewSlow(d.m, 'lay') * d.k - 1); S.lay.n++; S.lay.add += add; return add; }
        if (what === 'handover') { const d = this._crewDoer(C, 'crows'); if (!d) return 0; const add = base * (this._crewSlow(d.m, 'handover') - 1); S.handover.n++; S.handover.add += add; return add; }
        if (what === 'react') {
          const drv = this._crewDoer(C, 'drv'); if (!drv) { S.react.noDriver++; return 1e6; }
          const led = this._crewDoer(C, 'orders'), Q = C.Q, A = this.tank.ai;
          let add = base * (Math.max(this._crewSlow(drv.m, 'react'), led ? this._crewSlow(led.m, 'react') : 1) - 1);
          if (!led) add += 1;   /* nobody to give the order: the driver moves on his own after a second */
          add += Math.max(0, drv.m.outUntil - t, led ? led.m.outUntil - t : 0);   /* a man who has frozen comes back first */
          if (led && led.m.role === 'cdr' && A && A.crows && A.crows.busyUntil > t && A.crows.tgt != null) add += EFFECT.cdrSwitchS;
          if (led && led.m.st >= 2 && t >= led.m.outUntil) { const p = Math.min(0.9, Q.stall * (led.m.st === 3 ? 2 : 1));
            if (C.rng.random() < p) { const x = +C.rng.uniform(1, 3).toFixed(1); add += x; S.stalls++; this._crewNote(C, led.m.role, 'stall', `${NAME[led.m.role]} freezes for ${x} s before giving the order.`, `${led.m.why}; ${STATES[led.m.st]}, stress ${pct(led.m.s)}; ${pct(p)} chance for a ${C.quality} crew`, { dur: x }); } }
          if (drv.m.st === 3 && t >= drv.m.outUntil) { const p = Q.stall;
            if (C.rng.random() < p) { const x = +C.rng.uniform(1.2, 2.6).toFixed(1); add += x; S.stalls++; this._crewNote(C, 'drv', 'stall', `Driver freezes for ${x} s before moving.`, `${drv.m.why}; panicked, stress ${pct(drv.m.s)}; ${pct(p)} chance for a ${C.quality} crew`, { dur: x }); } }
          S.react.n++; S.react.add += add; return add;
        }
        return 0;
      },
      // a multiplier: 'load' (how fast the round goes in: 1 normal, 0 nobody loading), 'aim_main' 'aim_coax' 'aim_m2' 'aim_m240'
      // (hit chance), 'arc' (width of the sector the gunner watches closely), 'scan_gnr' 'scan_cdr' (chance of picking a team out).
      // Exactly 1 when the model is off or the man is steady.
      _crewMul(what) {
        const C = this._crewInit(); if (!C.on) return 1;
        const t = this.t, out = m => t < m.outUntil;
        if (what === 'load') {
          const d = this._crewDoer(C, 'load'); let k = 0;
          if (d && !out(d.m)) k = 1 / (this._crewSlow(d.m, 'load') * d.k);
          C.stats.load.add += (1 - k) * this.dt; return k;
        }
        if (what === 'aim_main' || what === 'aim_coax') { const d = this._crewDoer(C, 'gnr'); if (!d) return 1; return 1 / ((1 + EFFECT.aim * over(d.m.s)) * (d.m.status === 'wounded' ? WOUND.aim : 1)); }
        if (what === 'aim_m2' || what === 'aim_m240') { const m = C.m[what === 'aim_m2' ? 'cdr' : 'ldr']; return 1 / ((1 + EFFECT.aim * over(m.s)) * (m.status === 'wounded' ? WOUND.aim : 1)); }
        if (what === 'arc') { const m = C.m.gnr; return m.status === 'down' ? 1 : 1 - EFFECT.arc * over(m.s); }
        if (what === 'scan_gnr' || what === 'scan_cdr') {
          const m = C.m[what === 'scan_gnr' ? 'gnr' : 'cdr'], gone = C.abandoned || m.status === 'down' || out(m);
          return (gone ? EFFECT.scanOut : 1 - EFFECT.notice * over(m.s)) * (what === 'scan_cdr' && C.buttoned ? BUTTON.scan : 1);
        }
        return 1;
      },
      // is a job NOT being done right now? 'gnr' (main gun and coax), 'crows' (the commander's .50), 'orders' (the commander's
      // decisions), 'm240' (the loader will not come up), 'drv' (the vehicle will not move). Returns false, or a few words saying why.
      _crewOut(what) {
        const C = this._crewInit(); if (!C.on) return false;
        if (C.abandoned) return 'crew has left the vehicle';
        const d = this._crewDoer(C, what);
        if (!d) return what === 'crows' ? (C.m.cdr.status === 'down' ? 'commander down' : 'commander is on the main gun') : what === 'drv' ? 'driver down: cannot move' : what === 'm240' ? 'loader down' : 'nobody at this post';
        if (this.t < d.m.outUntil) return `${NAME[d.m.role].toLowerCase()} frozen`;
        if (what === 'm240' && C.buttoned) return 'buttoned up';
        return false;
      },
      // The drill says hold still so HKOI gets a clean engagement. Does the man in command do it? true = he will NOT hold (he sends the
      // driver for cover if there is any). Called once per engagement, only when the drill would hold.
      _crewFlinch() {
        const C = this._crewInit(); if (!C.on || C.abandoned) return false;
        const d = this._crewDoer(C, 'orders'); if (!d) return false;
        if (this.t < d.m.outUntil || d.m.st < 2) { C.stats.holds++; return false; }
        const p = Math.min(0.9, C.Q.flinch * (d.m.st === 3 ? 2 : 1) * d.k);
        if (C.rng.random() >= p) { C.stats.holds++; return false; }
        C.stats.flinches++;
        this._crewNote(C, d.m.role, 'flinch', `${NAME[d.m.role]} will not sit still for HKOI: he orders the driver to make for cover if any is in reach.`, `${d.m.why}; ${STATES[d.m.st]}, stress ${pct(d.m.s)}; ${pct(p)} chance for a ${C.quality} crew (a steady commander holds)`);
        return true;
      },

      // ---- for the page, the sound and the debrief ----
      // { on, quality, buttoned, abandoned, level, who: { cdr: { name, stress 0..1, state, stress_level 0|1|2, why, busy, status }, gnr, ldr, drv } }
      // stress_level picks the recorded voice level: 0 calm, 1 tense, 2 panicked. level = the highest among the men still at their posts.
      crewState() {
        const C = this._crewInit(), who = {}; let level = 0;
        for (const r of ROLES) {
          const m = C.on ? C.m[r] : null, state = m ? STATES[m.st] : 'steady', lv = m && m.status !== 'down' ? VOICE[state] : 0;
          who[r] = { name: NAME[r], stress: m ? +m.s.toFixed(3) : 0, state, stress_level: lv, why: m ? m.why : null, busy: m ? m.busy : null, status: m ? m.status : 'ok' };
          if (lv > level) level = lv;
        }
        const fire = C.on && C.fire ? { where: C.fire.where, since: C.fire.since, until: C.fire.until } : null;
        return { on: !!C.on, quality: C.on ? C.quality : null, buttoned: !!C.buttoned, abandoned: !!C.abandoned, fire, level, who };
      },
      // rows for the crew box, in the same form as tankStatus(): [[who, text], ...]
      crewStatus() {
        const s = this.crewState(); if (!s.on) return [];
        const rows = [['CREW', `${s.quality}${s.abandoned ? ' · has left the vehicle' : s.buttoned ? ' · buttoned up' : ''}`]];
        for (const r of ROLES) { const m = s.who[r]; rows.push([TAG[r], m.status === 'down' ? (m.busy || 'out of action') : `${m.state} ${Math.round(m.stress * 100)}%${m.status === 'wounded' ? ' · wounded' : ''}${m.busy ? ' · ' + m.busy : ''}${m.state !== 'steady' && m.why ? ' · ' + m.why : ''}`]); }
        return rows;
      },
      // voice level for a speaker tag as used in the battle log ('CDR', 'GNR', 'LDR', 'DRV'); 0 when the model is off
      crewVoiceLevel(tag) { const C = this._crewInit(); if (!C.on) return 0; const r = String(tag || '').toLowerCase(), m = C.m[r]; return m && m.status !== 'down' ? VOICE[STATES[m.st]] : 0; },
      // the whole battle, for the debrief: worst state and peak stress per man, seconds in each state, every panic event with its reason,
      // and the time stress and wounds added to the drills
      crewReport() {
        const C = this._crewInit(); if (!C.on) return { on: false };
        const S = C.stats, who = {}, mean = x => (x.n ? x.add / x.n : 0);
        for (const r of ROLES) { const m = C.m[r]; who[r] = { name: NAME[r], status: m.status, worst: STATES[m.top], peak: +m.peak.toFixed(3), secondsIn: { steady: +m.timeIn[0].toFixed(1), strained: +m.timeIn[1].toFixed(1), shaken: +m.timeIn[2].toFixed(1), panicked: +m.timeIn[3].toFixed(1) } }; }
        return { on: true, quality: C.quality, abandoned: C.abandoned, who,
          lay: { n: S.lay.n, meanAddS: +mean(S.lay).toFixed(3) }, load: { n: S.load.n, meanAddS: +mean(S.load).toFixed(3), totalAddS: +S.load.add.toFixed(2) },
          handover: { n: S.handover.n, meanAddS: +mean(S.handover).toFixed(3) }, react: { n: S.react.n, meanAddS: +mean(S.react).toFixed(3), noDriver: S.react.noDriver },
          fires: S.fires, freezes: S.freezes, stalls: S.stalls, flinches: S.flinches, holds: S.holds, buttonUps: S.buttonUps, nearBail: S.nearBail, bail: S.bail, events: S.events.slice() };
      },
    };
    Object.assign(Battle.prototype, methods);
  }

  const api = { install, fireOf, ENTRY, FIRE, STATE, STATES, VOICE, RISE, FALL, REST, TIMING, QUALITY, SEAT, LEAD, EFFECT, WOUND, PANIC, BUTTON, BAIL, ROLES, NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKCrew = api;
})(typeof window !== 'undefined' ? window : globalThis);
