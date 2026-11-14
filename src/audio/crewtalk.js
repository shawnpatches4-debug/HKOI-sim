// Who says what, and when. This turns what HAPPENS in the battle into intercom lines; it never matches log sentences.
//
// Sources, all facts of the simulation:
//   battle.events          the structured list published by the battle layer ({ t, type, ... })
//   each engagement record the crew talk the engine wrote for that engagement (rec.radio) and what the vehicle's
//                          warning receivers detected, and when (rec.threats[].cue / cue_src / viz.end)
//   the tank's own state   gun loaded or not, what the gunner is laying on, loader up, moving or halted
//
// Rule: a line must be true of the thing that triggers it. Where the voice pack has no line that says it, the crewman
// says nothing and, where it matters, a sound that is not speech carries the information (a warning tone while a
// detected threat is in the air; the smoke dischargers firing). Nothing here makes or synthesises speech.
//
// `net` is the intercom (src/audio/intercom.js: request, has, flush); `fx` receives the non-voice cues
// ({ warn(laser, radar), blip(kind), smoke() }). This file has no browser code in it, so tests can run it in node.

const RANGES = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
const REPORT_EVERY = 45;      // seconds of real time between crew reports ("fewer repeats")
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

// The engine's own crew lines (written as sentences by src/engine.js, which is not to be edited) mapped to what the pack
// can say. Returns { ev, pri, ttl } for a pack line, { cue } for a sound that is not speech, or null (silent).
// The engine has already decided who speaks and how tense he is; only the wording comes from here.
export function engineLine(who, s, lastOrder) {
  if (!s) return null;
  if (who === 'CDR') {
    if (/^we.re hit/i.test(s)) return { ev: 'hit', pri: 3, ttl: 2.5 };
    if (/^fire[,!] fire/i.test(s)) return null;                       /* the killing hit: no line is honest here; the crew goes quiet */
    if (/smoke/i.test(s)) return { cue: 'smoke' };
    if (/cease fire|BURNING/i.test(s)) return { ev: 'cease', pri: 1, ttl: 3 };
    if (/^Miss[.!]|^MISSED/.test(s)) return { ev: 'reengage_doubt', pri: 1, ttl: 2 };
    if (/Re-engage|HIT HIM AGAIN/i.test(s)) return { ev: 'reengage', pri: 1, ttl: 2 };
    if (/sabot/i.test(s)) return { ev: 'load_sabot', pri: 1, ttl: 2 };
    if (/find us a new position/i.test(s)) return { ev: 'moveout', pri: 1, ttl: 2.5, order: 'any' };
    if (/driver|GO GO GO|JUST GO|Get us out|^(FORWARD|MOVE OUT|MOVE|BACK UP|HARD LEFT|HARD RIGHT)!/i.test(s)) {
      if (/steady/i.test(s)) return null;
      if (/behind us|back up|JUST GO|Get us out/i.test(s)) return { ev: 'drv_back', pri: 2, ttl: 1.5, order: 'back' };
      if (/\bleft\b/i.test(s)) return { ev: 'left', pri: 2, ttl: 1.5, order: 'left' };
      if (/\bright\b/i.test(s)) return { ev: 'right', pri: 2, ttl: 1.5, order: 'right' };
      if (/\bstop\b/i.test(s)) return { ev: 'drv_stop', pri: 2, ttl: 1.5, order: 'stop' };
      if (/ahead|forward|move/i.test(s)) return { ev: 'drv_fwd', pri: 2, ttl: 1.5, order: 'fwd' };
    }
    return null;   /* "Missile, 3 o'clock", "Hold here", "All stations, report", "Good work": the pack has no such lines */
  }
  if (who === 'GNR') {
    if (/on the way/i.test(s)) return { ev: 'ontheway', pri: 1, ttl: 0.8 };
    if (/^Target|^GOT IT/.test(s)) return { ev: 'target', pri: 1, ttl: 1.2 };
    if (/gunner up|^Gunner.s good/i.test(s)) return { ev: 'ready', report: true };
    if (/jam/i.test(s)) return { ev: 'misfire', pri: 2, ttl: 2 };
    if (/^Gun.s clear|^CLEAR!/.test(s)) return { ev: 'gun_back', pri: 1, ttl: 2 };
    return null;   /* "Identified", "Beam's cut", "No cut", "Steady", ammunition counts */
  }
  if (who === 'LDR') {
    if (/^up[.!]/i.test(s)) return { ev: 'up', pri: 1, ttl: 1.2 };
    if (/^Loader( up|.s good)|I.m up/i.test(s)) return { ev: 'ready', report: true };
    return null;   /* the Trophy calls: the double crack itself is the news */
  }
  if (who === 'DRV') {
    if (/^Driver(.s good| up)/.test(s)) return { ev: 'ready', report: true };
    if (/^Moving|^On it|GOING|Going|left|right|Backing/i.test(s)) {
      const ev = lastOrder === 'fwd' ? 'ack_fwd' : lastOrder === 'left' ? 'ack_left' : lastOrder === 'right' ? 'ack_right' : 'onmove';
      return { ev, pri: 1, ttl: 2 };
    }
    return null;
  }
  return null;
}

export class CrewTalk {
  constructor(net, fx) { this.net = net; this.fx = fx || {}; this.reset(null); }
  reset(battle) {
    this.battle = battle; this.evN = 0; this.pending = []; this.volleyI = new Map(); this.lastT = -1;
    this.lastOrder = null; this.lastReport = -1e9; this.reportOpen = -1e9; this.started = false; this.dead = false;
    this.loaded = null; this.rfKey = null; this.ldrUp = null; this.coaxSaid = null; this.moving = null;
    this.miss = new Map(); this.lastHit = -1e9; this.lastContact = -1e9; this.lastEnemyCall = -1e9; this.later = []; this.smoked = new Set();
    this.trace = [];   // what was asked for: [sim time, who, event, heard or 'silent'] (tests, and the list of silent events)
  }
  _ask(t, who, ev, opt) { const ok = this.net.request(who, ev, opt || {}); this.trace.push([+t.toFixed(2), who, ev, ok ? 'said' : 'silent']); if (this.trace.length > 600) this.trace.splice(0, 200); return ok; }
  _silent(t, who, what) { this.trace.push([+t.toFixed(2), who, what, 'silent']); }

  // how tense the crew is right now: 0 calm, 1 in contact, 2 under fire / just hit
  stress(b, now) {
    const t = b.t; if (t - this.lastHit < 25) return 2;
    let air = 0; for (const v of b.volleys.slice(-3)) if (v.rec && v.rec.threats && t >= v.t0 && t <= v.tEnd) for (const th of v.rec.threats) { const e = th.viz && th.viz.end; if (t >= v.t0 + th.t0 && (!e || t <= v.t0 + e.t)) air++; }
    if (air >= 2) return 2;
    return air || t - this.lastContact < 15 ? 1 : 0;
  }

  // now: a real-time clock in seconds (the sound clock). opts: { mission }
  update(b, now, opts = {}) {
    if (!b) return;
    if (b !== this.battle || b.t < this.lastT - 0.5) this.reset(b);
    const t = b.t, jumped = t - this.lastT > 3; this.lastT = t;   /* a jump in time (skipping ahead): say nothing about what was skipped */
    if (this.dead) { this.fx.warn && this.fx.warn(false, false); return; }
    const T = b.tank, lvl = this.stress(b, now);
    // ---- the structured events
    const E = b.events || []; while (this.evN < E.length) this.pending.push(E[this.evN++]);
    if (this.pending.length > 1) this.pending.sort((x, y) => x.t - y.t);
    while (this.pending.length && this.pending[0].t <= t) { const e = this.pending.shift(); this._event(b, e, t - e.t > 2 || jumped, now, lvl, opts); }
    for (let i = this.later.length - 1; i >= 0; i--) if (this.later[i].t <= t) { const l = this.later.splice(i, 1)[0]; if (t - l.t < 2 && !jumped) l.run(); }
    // ---- the mission start: the radio net sends the vehicle off, then the crew reports (once the sound files are in)
    if (!this.started && t < 8 && this.net.ready !== false && this.net.has('GNR', 'ready')) {
      this.started = true; const g = 'start';
      const adv = opts.mission === 'advance' || opts.mission === 'hunt';
      this._ask(t, 'HQ', adv ? 'start_advance' : 'start', { level: 0, pri: 0, ttl: 6, delay: 0.8, group: g }) || this._ask(t, 'HQ', 'start', { level: 0, pri: 0, ttl: 6, delay: 0.8, group: g });
      this._report(t, now, g, T.mode === 'moving', 0);
    } else if (!this.started && t >= 8) this.started = true;
    // ---- the engine's crew talk for the engagements in progress
    const V = b.volleys; let laser = false, radar = false;
    for (let i = Math.max(0, V.length - 3); i < V.length; i++) {
      const v = V[i]; if (!v.rec) continue; const tv = t - v.t0;
      const R = v.rec.radio || []; let k = this.volleyI.get(v) || 0;
      while (k < R.length && R[k].t <= tv) { const r = R[k++]; if (tv - r.t <= 1.5 && !jumped) this._engine(b, v, r, t, now); }
      this.volleyI.set(v, k);
      for (const th of v.rec.threats || []) {   /* a warning receiver has this one, and it is still in the air */
        const end = th.viz && th.viz.end ? th.viz.end.t : th.impact;
        if (th.cue != null && tv >= th.cue && tv <= end) { if (/^lwr/.test(th.cue_src || '')) laser = true; else radar = true; }
      }
    }
    if (this.fx.warn) this.fx.warn(laser, radar);
    if (laser || radar || (V.length && t <= V[V.length - 1].tEnd)) this.lastContact = t;
    // ---- the tank's own state: what changed since the last look
    const ai = T.ai || {}, rf = b._rf || null;
    if (!jumped && T.alive) {
      if (rf && rf.k !== this.rfKey) {   /* the gunner swings onto a new target: he calls the range (when the pack has that number) */
        const uid = rf.k && rf.k.id, m = this.miss.get(uid);
        if (!(m != null && t - m < 30)) { const R = rf.R, near = RANGES.reduce((a, r) => Math.abs(r - R) < Math.abs(a - R) ? r : a, RANGES[0]); if (R <= 2050 && Math.abs(near - R) <= 60) this._ask(t, 'GNR', 'range_' + near, { level: 1, pri: 1, ttl: 2 }); else this._silent(t, 'GNR', 'range beyond the recorded calls'); }
      }
      if (this.loaded === false && T.loaded && ai.ldr && ai.ldr.ok) this._ask(t, 'LDR', 'up', { level: lvl, pri: 1, ttl: 1.2 });
      if (ai.ldr && this.ldrUp === false && ai.ldr.up) this._ask(t, 'LDR', 'mg_ready', { level: lvl, pri: 1, ttl: 2 });
      if (ai.coax && this.coaxSaid != null && ai.coax.said !== this.coaxSaid && ai.coax.said >= 0) this._ask(t, 'GNR', 'mg', { level: lvl, pri: 1, ttl: 1.5 });
      if (this.moving === true && T.mode !== 'moving' && !(V.length && t <= V[V.length - 1].tEnd)) this._ask(t, 'CDR', 'drv_stop', { level: Math.min(1, lvl), pri: 0, ttl: 2 });
    }
    this.rfKey = rf ? rf.k : null; this.loaded = !!T.loaded; this.ldrUp = !!(ai.ldr && ai.ldr.up); this.coaxSaid = ai.coax ? ai.coax.said : -1; this.moving = T.mode === 'moving';
  }

  // one crew report: gunner, loader, driver, then the commander closes it. At most one every REPORT_EVERY seconds.
  _report(t, now, group, moving, lvl) {
    this.lastReport = now; this.reportOpen = now + 9;
    const o = { level: lvl, pri: 0, ttl: 22, group };
    this._ask(t, 'GNR', 'ready', o); this._ask(t, 'LDR', 'ready', o); this._ask(t, 'DRV', 'ready', o);
    this._ask(t, 'CDR', moving ? 'oscar_mike' : 'redcon', o);
  }

  _engine(b, v, r, t, now) {
    const m = engineLine(r.who, r.text, this.lastOrder), lvl = r.lvl || 0;
    if (!m) { this._silent(t, r.who, 'engine: ' + r.text); return; }
    if (m.cue === 'smoke') { if (!this.smoked.has(v)) { this.smoked.add(v); this.fx.smoke && this.fx.smoke(); this.trace.push([+t.toFixed(2), r.who, 'smoke dischargers (no voice)', 'cue']); } return; }
    if (m.order) this.lastOrder = m.order;
    if (m.report) {   /* "X's good": part of a crew report. Not after every single engagement. */
      if (now > this.reportOpen) { if (now - this.lastReport < REPORT_EVERY) return; this.lastReport = now; this.reportOpen = now + 9; }
      this._ask(t, r.who, m.ev, { level: lvl, pri: 0, ttl: 10, group: 'report' + v.i });
      if (r.who === 'DRV') this._ask(t, 'CDR', b.tank.mode === 'moving' ? 'oscar_mike' : 'redcon', { level: lvl, pri: 0, ttl: 12, group: 'report' + v.i });
      return;
    }
    this._ask(t, r.who, m.ev, { level: lvl, pri: m.pri, ttl: m.ttl });
  }

  _event(b, e, stale, now, lvl, opts) {
    const t = b.t, T = b.tank;
    switch (e.type) {
      case 'ambush': this.lastContact = t; break;
      case 'vehicle_lost': this.dead = true; this.net.flush('vehicle lost'); break;
      case 'end':
        if (e.by === 'hit') { this.lastHit = t; if (e.killing) { this.dead = true; this.net.flush('vehicle lost'); } else if (!stale) this._ask(t, 'CDR', 'hit', { level: 2, pri: 3, ttl: 2.5 }); }
        break;
      case 'loader_hit':
        if (!stale) { this._ask(t, 'ANY', 'wound', { level: 2, pri: 3, ttl: 2 }); this._ask(t, 'CDR', 'loader_down', { level: 2, pri: 2, ttl: 5 }); }
        break;
      case 'located':
        this.lastContact = t;
        if (!stale && now - this.lastEnemyCall > 20) { this.lastEnemyCall = now; this._ask(t, 'GNR', 'contact', { level: 2, pri: 1, ttl: 1.5 }); }
        break;
      case 'gun': {
        if (stale) break;
        this._ask(t, 'GNR', 'ontheway', { level: Math.max(1, lvl), pri: 2, ttl: 0.7 });
        if (!e.hit) {
          this.miss.set(e.uid, t);
          this.later.push({ t: t + e.tof + 0.4, run: () => {   /* a miss: the commander says so only if they are in fact going to fire again */
            const u = b.units.find(q => q.id === e.uid), k = T.known.find(q => q.id === e.uid);
            if (u && u.alive && u.state !== 'moving' && k && !k.done && T.main > 0) this._ask(b.t, 'CDR', 'reengage_doubt', { level: lvl, pri: 1, ttl: 2 });
            else this._silent(b.t, 'CDR', 'miss, target gone: nothing said');
          } });
        }
        break;
      }
      case 'team_lost':
        if (stale) break;
        if (e.by === 'main' || e.by === 'coax') this._ask(t, 'GNR', 'target', { level: lvl, pri: 1, ttl: 1.5 });
        this._ask(t, 'CDR', 'cease', { level: lvl, pri: 1, ttl: 3.5 });
        break;
      case 'tank_move': {
        if (stale) break;
        const brg = (Math.atan2(e.to[0] - T.e, e.to[1] - T.n) * 180 / Math.PI + 360) % 360, ahead = Math.abs(angDiff(brg, T.h || 0)) < 60;
        this.lastOrder = ahead ? 'fwd' : 'any';
        this._ask(t, 'CDR', ahead && Math.random() < 0.5 ? 'drv_fwd' : 'moveout', { level: Math.min(1, lvl), pri: 1, ttl: 2.5 });
        this._ask(t, 'DRV', ahead ? 'ack_fwd' : 'onmove', { level: lvl, pri: 1, ttl: 5, delay: 0.9 });
        break;
      }
      case 'drone_launch': if (!stale && e.R < 3500 && this.fx.blip) { this.fx.blip('rf'); this.trace.push([+t.toFixed(2), 'SYS', 'drone control link tone (no voice)', 'cue']); } break;
      case 'lull':
        if (!stale && now - this.lastReport > REPORT_EVERY) this._report(t, now, 'lull' + e.wave, T.mode === 'moving', 0);
        break;
      case 'over':
        if (!stale && e.result === 'won') this._ask(t, 'HQ', opts.mission === 'advance' ? 'end_secure' : 'end_won', { level: 0, pri: 1, ttl: 10, delay: 1.5 }) || this._ask(t, 'HQ', 'end_won', { level: 0, pri: 1, ttl: 10, delay: 1.5 });
        break;
      default: break;   /* launch, hkoi_fire, trophy, move, wave: heard as sounds, not as speech */
    }
  }
}
