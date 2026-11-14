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
// After a hit: at most this many crew calls asked for in the first HIT_WINDOW seconds (screams are not counted: they are not calls).
// The intercom plays one line at a time as well, so fewer than this are heard in that time.
export const HIT_CALLS = 4, HIT_WINDOW = 4;
// a hit that got through: does it start a fire inside, and where? (the same rule as fireOf in src/battle/crew.js)
export function fireOf(h) {
  if (!h || !h.penetrated) return null; const hit = id => (h.comps || []).some(c => c.id === id && c.state !== 'spared');
  return hit('ammo') ? 'ammo' : hit('engine') || hit('trans') ? 'engine' : hit('fuel_l') || hit('fuel_r') || hit('hull_ammo') ? 'hull' : null;
}
// lines that are shouted whatever the man's own stress (urgent by nature)
const URGENT = /^(hit|wound|scream|loader_down|contact|bail|freeze|(cdr|gnr|drv)_down|fire_engine|fire_ammo|smoke_turret|engine_fire)$/;

// The engine's own crew lines (written as sentences by src/engine.js, which is not to be edited) mapped to what the pack
// can say. Returns { ev, pri, ttl } for a pack line, { cue } for a sound that is not speech, or null (silent).
// The engine has already decided who speaks and how tense he is; only the wording comes from here.
export function engineLine(who, s, lastOrder) {
  if (!s) return null;
  if (who === 'CDR') {
    if (/^we.re hit/i.test(s)) return { ev: 'hit', pri: 3, ttl: 2.5 };
    if (/^fire[,!] fire/i.test(s)) return null;                       /* the killing hit: no line is honest here; the crew goes quiet */
    if (/smoke/i.test(s)) return { ev: 'smoke', pri: 2, ttl: 1.5, cue: 'smoke' };
    { const m = /^(missile|drone)[,!]?\s+(\d+)\s+o.clock/i.exec(s); if (m) return { ev: m[1].toLowerCase() + '_' + (+m[2]), pri: 3, ttl: 1.5 }; }
    if (/hold here|^Nothing to hide|^NOWHERE TO GO/i.test(s)) return { ev: 'hold', pri: 1, ttl: 2 };
    if (/^All stations, report|^Everyone okay/i.test(s)) return { ev: 'report', report: true };
    if (/^Good work|^That was close/i.test(s)) return { ev: 'good', pri: 0, ttl: 4 };
    if (/^It went wide|^It missed/i.test(s)) return { ev: 'wide', pri: 1, ttl: 1.5 };
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
    return null;
  }
  if (who === 'GNR') {
    if (/on the way/i.test(s)) return { ev: 'ontheway', pri: 1, ttl: 0.8 };
    if (/^Target|^GOT IT/.test(s)) return { ev: 'target', pri: 1, ttl: 1.2 };
    if (/gunner up|^Gunner.s good/i.test(s)) return { ev: 'ready', report: true };
    if (/jam/i.test(s)) return { ev: 'misfire', pri: 2, ttl: 2 };
    if (/^Gun.s clear|^CLEAR!/.test(s)) return { ev: 'gun_back', pri: 1, ttl: 2 };
    if (/^Identified|^I SEE IT/i.test(s)) return { ev: 'identified', pri: 1, ttl: 1.2 };
    if (/steady/i.test(s)) return { ev: 'steady', pri: 1, ttl: 1.2 };
    if (/^No cut|DIDN.T WORK/i.test(s)) return { ev: 'nocut', pri: 2, ttl: 1.5 };
    if (/back on the beam|^IT.S BACK/i.test(s)) return { ev: 'back', pri: 2, ttl: 1.5 };
    if (/^Beam.s cut|^Cut!|^It.s cut/i.test(s)) return { ev: 'cut', pri: 1, ttl: 1.5 };
    if (/^Obscurant.*fifty|FIFTY ROUNDS OF SMOKE/i.test(s)) return { ev: 'obs50', pri: 0, ttl: 4 };
    if (/^HE.*fifty/i.test(s)) return { ev: 'he50', pri: 0, ttl: 4 };
    if (/^HE.*out/i.test(s)) return { ev: 'heout', pri: 0, ttl: 4 };
    return null;
  }
  if (who === 'LDR') {
    if (/^up[.!]/i.test(s)) return { ev: 'up', pri: 1, ttl: 1.2 };
    if (/^Loader( up|.s good)|I.m up/i.test(s)) return { ev: 'ready', report: true };
    if (/^Trophy, kill|^Trophy got it|TROPHY GOT IT/i.test(s)) return { ev: 'trophy_kill', pri: 1, ttl: 1.5 };
    if (/no kill|^Trophy missed|^IT MISSED/i.test(s)) return { ev: 'trophy_miss', pri: 2, ttl: 1.5 };
    if (/left side/i.test(s)) return { ev: 'left_empty', pri: 0, ttl: 4 };
    if (/right side/i.test(s)) return { ev: 'right_empty', pri: 0, ttl: 4 };
    return null;
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
    this.lastOrder = null; this.lastOrderEv = null; this.lastReport = -1e9; this.reportOpen = -1e9; this.started = false; this.dead = false;
    this.loaded = null; this.rfKey = null; this.ldrUp = null; this.coaxSaid = null; this.moving = null;
    this.hitWin = null; this.fireOn = null; this.hitPen = false;
    this.dmgSeen = new Set(); this.miss = new Map(); this.lastHit = -1e9; this.lastContact = -1e9; this.lastEnemyCall = -1e9; this.later = []; this.smoked = new Set();
    this.trace = [];   // what was asked for: [sim time, who, event, heard or 'silent'] (tests, and the list of silent events)
  }
  // can this man speak at all? Not when he is down (dead or out of action), and not while he is frozen with fear.
  _mute(who) {
    const b = this.battle; if (!b || !b.crewState || who === 'HQ' || who === 'ANY') return null;
    const s = b.crewState(); if (!s.on) return null; const m = s.who[who.toLowerCase()]; if (!m) return null;
    return m.status === 'down' ? 'down' : /^frozen/.test(m.busy || '') ? 'frozen' : null;
  }
  // a wounded man's cry, in his own voice when the strips have it (crew4), otherwise the pack's
  // and before it, where the pack overlay has it (tools/audio/build_panic.py), his scream on the open intercom
  _wound(t, who) {
    const o = { level: 2, pri: 3, ttl: 2 }; if (this.net.has(who, 'scream')) this._ask(t, who, 'scream', { level: 2, pri: 3, ttl: 1 });
    return this.net.has(who, 'wound') ? this._ask(t, who, 'wound', o) : this._ask(t, 'ANY', 'wound', o);
  }
  // A hit that does not destroy the vehicle. Straight after the impact: the commander calls the hit; if it started a fire, the man
  // who sees it calls the fire (the pack's own words for where it is) and the extinguishers fire; the wounded cry out (crew events,
  // below); then the commander tries to get the crew back: "Everyone okay? Report!", and each man still at his post answers in turn.
  // A hit the armour held gets the call and the check too, a little calmer. What the hit did comes from the damage model.
  _downAlive(b, who) { const S = b.crewState ? b.crewState() : null, m = S && S.on ? S.who[String(who || '').toLowerCase()] : null; return !!(m && m.status === 'down' && m.busy === 'out of action'); }
  _hitCalls(b, e, t) {
    this.hitWin = { t, n: 0, keys: new Set() };
    let h = null; const D = typeof DMG !== 'undefined' ? DMG : null, v = b.volleys[e.v] && b.volleys[e.v].i === e.v ? b.volleys[e.v] : b.volleys.find(x => x.i === e.v);
    if (D && v && v.rec && v.cfg) { try { h = D.report(v.rec, v.cfg).find(x => x.idx === e.idx) || null; } catch (err) { h = null; } }
    const pen = !!(h && h.penetrated), fire = fireOf(h), g = 'hit' + e.v + '.' + e.idx; this.hitPen = pen;
    this._ask(t, 'CDR', 'hit', { level: 2, pri: 3, ttl: 2.5 });
    if (fire) {
      this.fireOn = fire; if (this.fx.extinguisher) this.fx.extinguisher(fire);
      const drv = fire === 'engine' && this.net.has('DRV', 'engine_fire') && !this._mute('DRV');   /* the driver has the engine bay's second shot */
      const [who, ev] = drv ? ['DRV', 'engine_fire'] : fire === 'engine' ? ['CDR', 'fire_engine'] : fire === 'ammo' ? ['CDR', 'fire_ammo'] : ['CDR', 'smoke_turret'];   /* a hull fire: smoke fills the fighting compartment (assumption: the pack has no "fire in the hull") */
      if (!this._ask(t, who, ev, { level: 2, pri: 3, ttl: 3, delay: 0.2 })) this._silent(t, who, 'fire inside: no line in the pack');
    }
    this.later.push({ t: t + (pen ? 1.2 : 1.8), run: () => {
      const S = b.crewState ? b.crewState() : null; if (S && S.on && (S.abandoned || S.who.cdr.status === 'down')) return;   /* the gunner taking command has his own line */
      if (!this._ask(b.t, 'CDR', 'report', { level: pen ? 2 : 1, pri: 2, ttl: 4, group: g })) return;
      for (const who of ['GNR', 'LDR', 'DRV']) {   /* the answers, each after the call, in turn; a man who is down or has just cried out does not answer */
        const m = S && S.on ? S.who[who.toLowerCase()] : null; if (m && m.status !== 'ok') continue;
        if (who === 'LDR' && !b.tank.loaded) { this._silent(b.t, who, 'report: gun not loaded, "Loader ready, gun armed" would be untrue'); continue; }
        this._ask(b.t, who, 'ready', { level: pen ? 2 : 1, pri: 1, ttl: 9, needs: 'CDR.report', group: g });
      }
    } });
  }
  _ask(t, who, ev, opt) { opt = opt || {};
    { const why = opt.evenDown ? null : opt.evenFrozen ? (this._mute(who) === 'down' ? 'down' : null) : this._mute(who); if (why) { this.trace.push([+t.toFixed(2), who, ev + ' (' + why + ': he says nothing)', 'silent']); return false; } }
    /* each man's own stress (src/battle/crew.js) picks his take: a shaken loader sounds shaken while a steady commander does not. The battle-wide level still applies up to 'tense'; lines that are urgent by nature (hit, wounded) keep their own level. */
    { const b = this.battle; if (who !== 'HQ' && opt.level != null && b && b.crewVoiceLevel && b.crewState && b.crewState().on) opt = Object.assign({}, opt, { level: Math.max(opt.level >= 2 && URGENT.test(ev) ? 2 : Math.min(1, opt.level), b.crewVoiceLevel(who) || 0) }); }
    /* his stress itself pushes the delivery (src/audio/intercom.js: faster, louder, breaking) */
    { const b = this.battle, S = who !== 'HQ' && who !== 'ANY' && b && b.crewState ? b.crewState() : null, m = S && S.on ? S.who[who.toLowerCase()] : null; if (m) opt = Object.assign({}, opt, { stress: m.stress }); }
    /* the first seconds after a hit: a few calls, not a pile of them */
    /* (screams are cries, not calls; an answer waits for the call it answers, so it is heard after it; routine talk leaves the last
       slot for the commander's check) */
    { const W = this.hitWin; if (W && t - W.t < HIT_WINDOW && ev !== 'scream' && who !== 'HQ' && !opt.needs) { const key = who + '.' + ev;
      if (!W.keys.has(key)) { if (W.n >= HIT_CALLS - ((opt.pri || 0) < 2 ? 1 : 0)) { this.trace.push([+t.toFixed(2), who, ev + ' (after a hit: enough calls already)', 'silent']); return false; } W.n++; W.keys.add(key); } } }
    const ok = this.net.request(who, ev, opt); this.trace.push([+t.toFixed(2), who, ev, ok ? 'said' : 'silent']); if (this.trace.length > 600) this.trace.splice(0, 200); return ok; }
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
    if (b !== this.battle || b.t < this.lastT - 0.5) { const first = !this.battle; this.reset(b); if (!first && this.net.flush) this.net.flush('another battle, or time wound back'); }
    const t = b.t, jumped = t - this.lastT > 3; this.lastT = t;   /* a jump in time (skipping ahead): say nothing about what was skipped */
    if (this.dead) { this.fx.warn && this.fx.warn(false, false); return; }
    const T = b.tank, lvl = this.stress(b, now);
    // ---- the structured events
    const E = b.events || []; while (this.evN < E.length) this.pending.push(E[this.evN++]);
    if (this.pending.length > 1) this.pending.sort((x, y) => x.t - y.t);
    while (this.pending.length && this.pending[0].t <= t) { const e = this.pending.shift(); this._event(b, e, t - e.t > 2 || jumped, now, lvl, opts); }
    for (let i = this.later.length - 1; i >= 0; i--) if (this.later[i].t <= t) { const l = this.later.splice(i, 1)[0]; if (t - l.t < 2 && !jumped) l.run(); }
    if (this.dead) { this.fx.warn && this.fx.warn(false, false); return; }   /* lost in this very step: nothing more is said */
    // ---- the mission start: the radio net sends the vehicle off, then the crew reports (once the sound files are in)
    if (!this.started && t < 8 && this.net.ready !== false && this.net.has('GNR', 'ready')) {
      this.started = true; const g = 'start';
      const adv = opts.mission === 'advance' || opts.mission === 'hunt';
      this._ask(t, 'HQ', adv ? 'start_advance' : 'start', { level: 0, pri: 0, ttl: 6, group: g }) || this._ask(t, 'HQ', 'start', { level: 0, pri: 0, ttl: 6, group: g });
      this._report(t, now, g, T.mode === 'moving', 0);
    } else if (!this.started && t >= 8) this.started = true;
    // ---- the engine's crew talk for the engagements in progress
    const V = b.volleys; let laser = false, radar = false;
    for (let i = Math.max(0, V.length - 3); i < V.length; i++) {
      const v = V[i]; if (!v.rec) continue; const tv = t - v.t0;
      const R = v.rec.radio || []; let k = this.volleyI.get(v) || 0;
      while (k < R.length && R[k].t <= tv) { const r = R[k++]; if (tv - r.t <= 1.5 && !jumped) this._engine(b, v, r, t, now); }
      this.volleyI.set(v, k);
      if (!this.dmgSeen.has(v)) { this.dmgSeen.add(v); this._damage(b, v); }
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
      if (ai.ldr && this.ldrUp === false && ai.ldr.up) { this._ask(t, 'LDR', 'going_up', { level: lvl, pri: 1, ttl: 2 }); this._ask(t, 'LDR', 'mg_ready', { level: lvl, pri: 1, ttl: 5, delay: 2.5 }); }   /* he climbs to his machine gun */
      if (ai.ldr && this.ldrUp === true && !ai.ldr.up && ai.ldr.ok) this._ask(t, 'LDR', 'coming_down', { level: lvl, pri: 1, ttl: 2 });
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

  // Damage reports. The damage model (src/dmg.js, the same report the interior draws from) says what each hit broke. After a
  // hit that holes the armour without killing the vehicle, the man whose equipment it is reports it, when the pack has the
  // words: the driver for tracks, engine, transmission and fuel, the gunner for the gun, the traverse drive, the fire control
  // and the electronics. At most two reports a hit, the gravest first.
  _damage(b, v) {
    const D = typeof DMG !== 'undefined' ? DMG : null; if (!D || !v.cfg || !v.rec) return; let rep = [];
    try { rep = D.report(v.rec, v.cfg); } catch (e) { return; }
    const LINE = [['track_l', 'DRV', 'track'], ['track_r', 'DRV', 'track'], ['trans', 'DRV', 'trans'], ['gun', 'GNR', 'gun_out'], ['tdrive', 'GNR', 'trav_out'], ['fuel_l', 'DRV', 'fuel'], ['fuel_r', 'DRV', 'fuel'],
      ['engine', 'DRV', 'power'], ['gps', 'GNR', 'fcs_out'], ['radio', 'GNR', 'elec_out'], ['radar', 'GNR', 'elec_out'], ['lwr', 'GNR', 'elec_out'], ['citv', 'GNR', 'elec_out']];
    for (const h of rep) {
      if (!h.penetrated || h.killing) continue; const hurt = {}; for (const c of h.comps || []) hurt[c.id] = c.state; let n = 0; const done = {};
      for (const [id, who, ev] of LINE) {
        if (!hurt[id] || n >= 2 || done[who + ev]) continue; if (ev === 'trans' && hurt[id] !== 'destroyed') continue;   /* "transmission is gone" only when it is */
        done[who + ev] = 1; const k = n++;
        this.later.push({ t: v.t0 + h.t + 4.5 + k * 2.4,   /* after the first calls of the hit (_hitCalls) */ run: () => this._ask(b.t, who, ev, { level: 2, pri: 2, ttl: 6 }) });
      }
    }
  }

  _engine(b, v, r, t, now) {
    const m = engineLine(r.who, r.text, this.lastOrder), lvl = r.lvl || 0;
    if (!m) { this._silent(t, r.who, 'engine: ' + r.text); return; }
    if (m.cue === 'smoke') { if (this.smoked.has(v)) return; this.smoked.add(v); this.fx.smoke && this.fx.smoke(); }
    if (m.order) { this.lastOrder = m.order; this.lastOrderEv = m.ev; }
    if (m.report) {   /* "X's good": part of a crew report. Not after every single engagement. */
      if (now > this.reportOpen) { if (now - this.lastReport < REPORT_EVERY) return; this.lastReport = now; this.reportOpen = now + 9; }
      this._ask(t, r.who, m.ev, { level: lvl, pri: 0, ttl: 10, group: 'report' + v.i });
      if (r.who === 'DRV') this._ask(t, 'CDR', b.tank.mode === 'moving' ? 'oscar_mike' : 'redcon', { level: lvl, pri: 0, ttl: 12, group: 'report' + v.i });
      return;
    }
    const needs = r.who === 'DRV' && this.lastOrderEv ? 'CDR.' + this.lastOrderEv : null;   /* the driver answers an order: only if it was spoken */
    this._ask(t, r.who, m.ev, { level: lvl, pri: m.pri, ttl: needs ? 5 : m.ttl, needs });
  }

  _event(b, e, stale, now, lvl, opts) {
    const t = b.t, T = b.tank;
    switch (e.type) {
      case 'ambush': this.lastContact = t; break;
      case 'vehicle_lost': this.dead = true; this.net.flush('vehicle lost'); break;
      case 'end':
        if (e.by === 'hit') { this.lastHit = t; if (e.killing) { this.dead = true; this.net.flush('vehicle lost'); } else if (!stale) this._hitCalls(b, e, t); }
        break;
      case 'loader_hit':
        if (!stale) { this._wound(t, 'LDR'); this._ask(t, 'CDR', 'loader_down', { level: 2, pri: 2, ttl: 5 }); }
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
          this.later.push({ t: t + e.tof + 0.2, run: () => this._ask(b.t, 'GNR', 'miss', { level: lvl, pri: 1, ttl: 1.2 }) });   /* the gunner senses the round */
          this.later.push({ t: t + e.tof + 0.9, run: () => {   /* the commander says they will fire again only if they are in fact going to */
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
        const order = ahead && Math.random() < 0.5 ? 'drv_fwd' : 'moveout';
        this.lastOrder = ahead ? 'fwd' : 'any'; this.lastOrderEv = order;
        if (this._ask(t, 'CDR', order, { level: Math.min(1, lvl), pri: 1, ttl: 2.5 })) this._ask(t, 'DRV', ahead ? 'ack_fwd' : 'onmove', { level: lvl, pri: 1, ttl: 6, delay: 0.9, needs: 'CDR.' + order });
        break;
      }
      case 'drone_launch': if (!stale && e.R < 3500 && this.fx.blip) { this.fx.blip('rf'); this.trace.push([+t.toFixed(2), 'SYS', 'drone control link tone (no voice)', 'cue']); } break;
      case 'lull':
        if (!stale && now - this.lastReport > REPORT_EVERY) this._report(t, now, 'lull' + e.wave, T.mode === 'moving', 0);
        break;
      case 'over':
        if (!stale && e.result === 'won') this._ask(t, 'HQ', opts.mission === 'advance' ? 'end_secure' : 'end_won', { level: 0, pri: 1, ttl: 10, delay: 1.5 }) || this._ask(t, 'HQ', 'end_won', { level: 0, pri: 1, ttl: 10, delay: 1.5 });
        break;
      case 'crew':   /* the crew model (src/battle/crew.js): a man wounded, a man down, the crew bailing out */
        if (e.what === 'bail_out') { this.net.flush('crew bails out'); if (!stale) this._ask(t, 'CDR', 'bail', { level: 2, pri: 3, ttl: 2 }); this.dead = true; break; }
        if (stale) break;
        if (e.what === 'down' && this._downAlive(b, e.who)) this._ask(t, String(e.who).toUpperCase(), 'scream', { level: 2, pri: 3, ttl: 1, evenDown: true });   /* badly wounded, not killed: he screams once; the call about him follows */
        if (e.what === 'wounded') this._wound(t, String(e.who || '').toUpperCase());   /* he is hit but stays at his post: his own cry, in his own voice */
        else if (e.what === 'freeze') this._ask(t, String(e.who || '').toUpperCase(), 'freeze', { level: 2, pri: 2, ttl: 1.5, evenFrozen: true });   /* the moment he locks up; after it he says nothing */
        else if (e.what === 'fire_out' && this.fireOn) { this.fireOn = null; this._ask(t, 'CDR', 'fire_out', { level: 1, pri: 2, ttl: 4 }); }   /* crew.js: the fire inside is out */
        else if (e.what === 'down' && e.who === 'ldr') this._ask(t, 'CDR', 'loader_down', { level: 2, pri: 2, ttl: 5, delay: 0.8 });
        else if (e.what === 'down' && e.who === 'cdr') this._ask(t, 'GNR', 'cdr_down', { level: 2, pri: 3, ttl: 5, delay: 1.0 });   /* crew.js: with the commander down the gunner gives the orders */
        else if (e.what === 'down') this._ask(t, 'CDR', e.who === 'gnr' ? 'gnr_down' : 'drv_down', { level: 2, pri: 2, ttl: 5, delay: 0.8 });
        break;
      default: break;   /* launch, hkoi_fire, trophy, move, wave: heard as sounds, not as speech */
    }
  }
}
