// The film director's planning. Pure logic: no page, no drawing, so it runs in node for the tests (tests/app/director.test.mjs).
//
// It reads the battle's event list and the record of each engagement and lays out, against BATTLE TIME:
//   shots     which camera films what, each with a priority, a shortest and a longest length, so the picture never flickers;
//   captions  one plain sentence at a time; every number is taken from the battle record;
//   slow      the short windows around the decisive moment (the cut, the Trophy intercept, the hit).
//
// Why it gives the same film at any frame rate, and after a rewind or a scrub: the plan is worked out in fixed steps of 0.1 s of
// battle time, and at each step it may use only what the battle had already made known by then. The battle works an engagement
// out when it starts, so its launches, bursts and endings are known a few seconds ahead (the camera can be in place before the
// thing happens); everything else becomes known as it happens. Nothing here depends on frames or on the clock on the wall.

const DEG = Math.PI / 180;
const NAME = { kornet: 'Kornet', vikhr: 'Vikhr', saclos: 'Konkurs', sal: 'Laser-homing missile', fpv: 'FPV drone', fpv_fiber: 'Fibre FPV drone', rpg: 'RPG', ir: 'Infrared missile', ke: 'Tank round' };
const DRONE = { fpv: true, fpv_fiber: true };
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export const word = n => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
export const ordinal = n => (n > 0 && n < ORDINALS.length ? ORDINALS[n] : n + 'th');
export const compass = brg => POINTS[Math.round((((brg % 360) + 360) % 360) / 45) % 8];
export const range = m => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m');
const metres = m => (m < 1 ? 'less than a metre' : Math.round(m) + ' m');
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const tick = t => Math.floor(t * 10 + 1e-6);

// how long a shot or a caption may be, in seconds of battle time
export const LIMITS = { floor: 0.8, shotMin: 1.5, idle: 10, capFloor: 0.8, capMin: 1.4, capLen: 2.8, capBusy: 2.0 };
// the calm shots between engagements, in turn
const IDLE = [
  { rig: 'tank', len: 10, label: 'the vehicle' },
  { rig: 'wide', len: 10, label: 'the ground around it' },
  { cam: 'cdr', len: 7, label: 'the commander' },
  { rig: 'tank', len: 10, turn: 180, label: 'the vehicle, other side' },
  { cam: 'top', len: 6, label: 'from overhead' },
];

export class Plan {
  // opts: { HK, DMG } (the engine and the damage model, for the names of things and the plate a hit struck)
  constructor(opts = {}) { this.o = opts; this.reset(null); }

  reset(battle) {
    this.b = battle; this.nEv = 0; this.k = 0; this.seenV = new Set(); this.aps = 0; this.apsTotal = null; this.gunKill = null; this.lostAt = null; this.seq = 0;
    this.cands = [];      /* shots that want the camera: { a, b, known, pri, min, cam | rig, ... } */
    this.caps = [];       /* captions waiting or shown: { t, known, pri, text, v, idx } */
    this.slows = [];      /* [from, to, known] */
    this.replays = [];    /* one per engagement worth seeing twice: { v, at, from, to, known, shot } */
    this.shots = [];      /* what the camera did: { t0, t1, ...shot } in time order */
    this.shown = [];      /* what the caption line did: { t0, t1, text } */
    this.cur = null; this.capCur = null; this.idleN = 0; this.iS = 0; this.iC = 0;
  }

  // Bring the plan up to the battle's present. Call it as often as you like; it does work only when the battle has moved on.
  sync(battle) {
    if (battle !== this.b || tick(battle.t) < this.k - 1) this.reset(battle);
    const E = battle.events || [];
    for (; this.nEv < E.length; this.nEv++) this._event(E[this.nEv], this.nEv);
    if (battle._pending) return;   /* an engagement half worked out: its events are not all there yet */
    const K = tick(battle.t);
    while (this.k <= K) { this._step(this.k / 10); this.k++; }
  }

  // ---- what is on at battle time t ----------------------------------------------------------------------------------------
  shotAt(t) {
    const S = this.shots; if (!S.length) return null; let i = Math.min(this.iS, S.length - 1);
    while (i > 0 && S[i].t0 > t) i--; while (i < S.length - 1 && S[i + 1].t0 <= t) i++;
    this.iS = i; return S[i];
  }
  captionAt(t) {
    const S = this.shown; if (!S.length) return null; let i = Math.min(this.iC, S.length - 1);
    while (i > 0 && S[i].t0 > t) i--; while (i < S.length - 1 && S[i + 1].t0 <= t) i++;
    this.iC = i; const c = S[i]; return c.t0 <= t && t < c.t1 ? c : null;
  }
  // the instant replay that is due at battle time t (within a second after its moment), if any
  replayAt(t) { for (const r of this.replays) if (t >= r.at && t < r.at + 1 && t >= r.known) return r; return null; }
  slowAt(t) { for (const s of this.slows) if (t >= s[0] && t >= s[2] && t < s[1]) return true; return false; }

  // ---- reading the battle -------------------------------------------------------------------------------------------------
  _unitName(uid) { const u = this.b.units.find(x => x.id === uid); return u ? u.spec.name : 'enemy team'; }
  // once the vehicle is lost the film ends on it: nothing new is filmed or said after that
  _late(t) { return this.lostAt != null && t > this.lostAt + 2.5; }
  _cand(c) { c.id = this.seq++; c.min = c.min || LIMITS.shotMin; if (c.b - Math.max(c.a, c.known) >= c.min && (c.rig === 'hold' || !this._late(c.a))) this.cands.push(c); return c; }
  _cap(t, known, pri, text, v, idx) { if (this._late(t) && pri < 9) return;   /* after the loss only a further hit is still told */ this.caps.push({ t, known: Math.max(known, t), pri, text, v, idx, id: this.seq++ }); }

  _event(e, i) {
    if (e.v != null) { if (!this.seenV.has(e.v)) { this.seenV.add(e.v); this._volley(this.b.volleys[e.v]); } return; }
    const K = e.t + 0.15, B = this.b;   /* known just after it happens */
    if (e.type === 'ambush') { const n = (e.teams || []).length; this._cap(e.t, K, 4, n > 1 ? `Ambush: ${word(n)} enemy teams open fire` : 'An enemy team opens fire'); }
    else if (e.type === 'drone_launch') {
      this._cap(e.t, K, 4, `Drone launched ${range(e.R)} away: it will be here in about ${Math.max(1, Math.round(e.arrive - e.t))} s`);
      this._cand({ a: K, b: e.t + 3.2, known: K, pri: 3, min: 2, cam: 'troops', uid: e.uid, label: 'the drone crew launching' });
    }
    else if (e.type === 'gun') {
      const u = B.units.find(x => x.id === e.uid), name = this._unitName(e.uid), tI = e.t + (e.tof || 0);
      this._cap(e.t, K, 3, `Main gun fires at the ${name}, ${range(e.R)}`);
      if (!e.hit) this._cap(tI + 0.3, tI + 0.3, 2, 'The round misses');
      if (u) this._cand({ a: Math.max(K, tI - 1.5), b: tI + (e.hit ? 3.2 : 1.6), known: K, pri: e.hit ? 5 : 3, min: e.hit ? 2 : 1.5, rig: e.hit ? 'site' : 'downrange', uid: e.uid, e: u.e, n: u.n, label: 'where the round lands' });
      if (e.hit) this.gunKill = { uid: e.uid, t: tI };
    }
    else if (e.type === 'team_lost') {
      const u = B.units.find(x => x.id === e.uid), name = this._unitName(e.uid), main = e.by === 'main';
      this._cap(e.t, K, 5, main ? `The main gun destroys the ${name}` : `Machine-gun fire knocks out the ${name}`);
      const dup = this.gunKill && this.gunKill.uid === e.uid && Math.abs(this.gunKill.t - e.t) < 4;
      if (u && !dup) this._cand({ a: K, b: e.t + 3.4, known: K, pri: 5, min: 2, rig: 'site', uid: e.uid, e: u.e, n: u.n, label: 'the position that was knocked out' });
    }
    else if (e.type === 'located') this._cap(e.t, K, 1, `${cap1(this._unitName(e.uid))} located${e.how === 'thermal' ? ' on the thermal viewer' : ''}`);
    else if (e.type === 'tank_move') { this._cap(e.t, K, 2, 'The vehicle moves to another position'); this._cand({ a: K, b: e.t + 9, known: K, pri: 2, min: 3, cam: 'chase', label: 'the vehicle on the move' }); }
    else if (e.type === 'lull') this._cap(e.t, K, 6, `This enemy group is beaten. Quiet for about ${Math.max(1, Math.round((e.until - e.t) / 5) * 5)} s`);
    else if (e.type === 'wave') { if (e.wave > 0) this._cap(e.t, K, 6, `Enemy group ${word(e.wave + 1)} moves in`); }
    else if (e.type === 'loader_hit') this._cap(e.t, K, 6, 'The loader is hit at his machine gun');
    else if (e.type === 'over') this._cap(e.t, K, 6, e.result === 'won' ? 'The enemy breaks contact' : e.result === 'abandoned' ? 'The crew abandons the vehicle' : e.result === 'objective' ? 'Objective reached' : e.result === 'withdrawn' ? 'The vehicle breaks contact' : 'The battle is over');
  }

  // One engagement, known in full the moment it starts: every launch, HKOI burst, cut, Trophy shot and ending.
  _volley(v) {
    if (!v) return; const rec = v.rec, t0 = v.t0, K = t0 + 0.25, HK = this.o.HK, DMG = this.o.DMG;
    if (rec.killed) this.lostAt = t0 + (rec.kill_t != null ? rec.kill_t : rec.t_end);
    let hits = []; try { if (DMG) hits = DMG.report(rec, v.cfg); } catch (err) { hits = []; }
    if (this.apsTotal == null) { const a = v.cfg && v.cfg.aps; this.apsTotal = a && a.mag_L != null ? a.mag_L + a.mag_R : a && a.mag_per_side ? 2 * a.mag_per_side : 0; }
    let slowed = false;   /* slow motion once per engagement for the missile being followed (its cut, or its Trophy intercept), and at every hit */
    let again = null;   /* the moment of this engagement worth an instant replay: a hit first, else a cut by the cloud, else a Trophy intercept */
    const out = [];   /* the endings near the vehicle, to be merged into one low wide shot when they come close together */
    // which missile the film follows from launch to ending when several are in the air: the one with the most to show
    const score = th => (th.state === 'hit' ? 5 : 0) + (/^hkoi/.test(th.defeated_by || '') ? 4 : 0) + (th.viz.fired != null ? 2 : 0) + (th.defeated_by === 'aps' ? 1 : 0) + Math.min(0.9, th.viz.end.t / 100);
    let star = null; for (const th of rec.threats) if (!star || score(th) > score(star)) star = th;
    for (const th of rec.threats) {
      const l = v.launches.find(q => q.u.id === th.uid) || v.launches[th.idx] || {}, end = th.viz.end, tL = t0 + th.t0, tE = t0 + end.t, name = NAME[th.key] || th.key, drone = !!DRONE[th.key];
      const by = th.state === 'hit' ? 'hit' : (th.defeated_by || th.state), bonus = th === star ? 1 : 0, id = { v: v.i, idx: th.idx, uid: th.uid, brg: th.brg, R: th.R, le: l.u ? l.u.e : null, ln: l.u ? l.u.n : null };
      const guide = HK && HK.THREATS[th.key] ? HK.THREATS[th.key].guidance : '';
      // launch
      if (l.arrival || drone) this._cap(tL, K, 3 + 3 * bonus, `${name} closing in, ${range(th.R)}, from the ${compass(th.brg)}`, v.i, th.idx);
      else {
        this._cap(tL, K, 3 + 3 * bonus, `${name} ${th.key === 'rpg' ? 'fired' : 'launched'}, ${range(th.R)}, from the ${compass(th.brg)}`, v.i, th.idx);
        this._cand(Object.assign({ a: Math.max(K, tL - 1.2), b: tL + 1.8, known: K, pri: 5 + bonus, min: 1.6, cam: 'troops', label: `the ${name} team launching` }, id));
      }
      // its own view
      this._cand(Object.assign({ a: tL + 1.2, b: Math.min(tE - 1.7, tL + (drone ? 9 : 6.5)), known: K, pri: 4 + bonus, min: 1.6, rig: 'ride', label: `the ${name}'s own view` }, id));
      // HKOI: the bursts fired at this one
      const bursts = rec.bursts.filter(b => b.idx === th.idx && b.rounds && b.rounds.length).sort((p, q) => p.rounds[0].t_fire - q.rounds[0].t_fire);
      bursts.forEach((b, j) => {
        const first = b.rounds.filter(r => !r.extra), more = b.rounds.filter(r => r.extra), tF = t0 + b.rounds[0].t_fire, res = b.res || {};
        if (b.kind === 'obs') {
          this._cap(tF, K, 4 + 2 * bonus, `HKOI fires ${word(first.length || b.rounds.length)} obscurant round${(first.length || b.rounds.length) === 1 ? '' : 's'}`, v.i, th.idx);
          if (more.length && first.length) this._cap(t0 + more[0].t_fire, K, 2 + 2 * bonus, `HKOI fires ${word(more.length)} more obscurant round${more.length === 1 ? '' : 's'} to thicken the cloud`, v.i, th.idx);
        } else this._cap(tF, K, 4 + 2 * bonus, `HKOI fires ${word(b.rounds.length)} high-explosive round${b.rounds.length === 1 ? '' : 's'} at the ${name}`, v.i, th.idx);
        this._cand(Object.assign({ a: tF - 1.0, b: tF + 1.3, known: K, pri: 6 + bonus * 0.5, min: 1.5, rig: 'gun', label: 'HKOI firing' }, id));
        if (b.kind !== 'obs' || !b.puffs || !b.puffs.length) return;
        let x0 = 1e9, x1 = -1e9, xs = 0; for (const p of b.puffs) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); xs += p.x; }
        const tB = t0 + (b.t_ref != null ? b.t_ref : b.rounds[0].t_pass), tCut = res.cut && res.t_cut != null ? t0 + res.t_cut : null, tLast = t0 + (res.t_last != null ? res.t_last : b.rounds[b.rounds.length - 1].t_pass);
        this._cand(Object.assign({ a: tB - 0.3, b: Math.min(tE - 0.9, (tCut != null ? tCut : tLast) + 1.3, tB + 7), known: K, pri: (tCut != null ? 7.5 : 6) + bonus * 0.4, min: 1.5, rig: 'cloud', x: xs / b.puffs.length, span: x1 - x0, label: 'the cloud across the guidance line' }, id));
        if (tCut != null && res.outcome === 'drift_hit') this._cap(tCut, K, 5, `The cloud cuts its guidance only ${range(res.sever || 0)} out: too late to throw it off`, v.i, th.idx);
        else if (tCut != null) {
          this._cap(tCut, K, 8, guide === 'radio_saclos' ? 'The cloud hides the missile from its launcher: it is blind' : 'The cloud cuts the guidance beam: the missile is blind', v.i, th.idx);
          if (th === star && !slowed) { slowed = true; this.slows.push([tCut - 0.2, tCut + 0.3, K]); }
          if (!again || again.w < 2) again = { w: 2, from: tCut - 2.4, to: Math.min(tE + 1.2, tCut + 5), shot: Object.assign({ rig: 'cloud', high: true, x: xs / b.puffs.length, span: x1 - x0, label: 'the cut again, from the other side' }, id) };
        } else if (j === bursts.length - 1 && by !== 'hkoi_he') {
          const why = res.reason === 'cloud_thin' ? 'The cloud is too thin to break the beam' : res.reason === 'fuze_miss' ? 'The rounds burst off the line of sight: the beam stays clear' : res.reason === 'saclos_unaffected' ? 'The cloud does not blind this missile' : null;
          if (why) this._cap(tLast + 0.6, K, 3 + 2 * bonus, why, v.i, th.idx);
        }
      });
      // the ending
      const hkoi = /^hkoi/.test(by); let text = null, pri = 4;
      if (by === 'hit') {
        const h = hits.find(x => x.idx === th.idx), tried = (rec.aps || []).some(a => a.idx === th.idx && !a.kill) ? 'Trophy misses it. ' : ''; pri = 9;
        const wreck = this.lostAt != null && tE > this.lostAt + 0.5;   /* the vehicle was already lost when this one arrived */
        if (wreck) text = `${name} hits the burning vehicle`; else text = tried + (h ? `${name} hits the ${h.zoneName.replace(/ \(.*/, '').toLowerCase()}: ${!h.penetrated ? 'the armour holds' : end.killing ? 'it goes through and the vehicle is lost' : 'it goes through, the vehicle fights on'}` : `${name} hits the vehicle`);
        this.slows.push([tE - 0.3, tE + 0.4, K]);
        if (h && DMG && DMG.COMPS && !wreck) {
          let seat = null, best = 1e9; for (const c of DMG.COMPS) { if (!c.crew) continue; const p = c.turret ? DMG.rot(c.p, -h.turA) : c.p, d = Math.hypot(p[0] - h.entry[0], p[1] - h.entry[1], p[2] - h.entry[2]); if (d < best) { best = d; seat = c.id; } }
          if (seat) this._cand(Object.assign({ a: tE + 0.05, b: tE + 1.45, known: K, pri: 12, min: 1.2, cam: 'in_' + seat, inside: true, label: 'inside, at the seat nearest the hit' }, id));
        }
        if (!again || again.w < 3) again = { w: 3, from: tE - 3.2, to: tE + 1.4, shot: Object.assign({ rig: 'replay', label: 'the hit again, from above' }, id) };
      }
      else if (by === 'aps') text = null;   /* told with the Trophy shot below */
      else if (by === 'hkoi_he') { text = `HKOI shoots the ${name} down`; pri = 7; }
      else if (hkoi) { pri = 7; text = end.type === 'ground' && end.d != null ? `Blind, it flies into the ground ${range(end.d)} short of the vehicle` : end.miss != null ? `It flies wide by ${metres(end.miss)}` : 'Blind, it misses'; }
      else if (by === 'gunner_jitter') text = end.short != null ? `The enemy gunner's aim wanders: it falls ${metres(end.short)} short` : end.miss != null ? `The enemy gunner's aim wanders: it misses by ${metres(Math.abs(end.miss))}` : 'The enemy gunner misses';
      else if (by === 'suppressed_aim') text = 'Machine-gun fire shakes the enemy gunner: his missile misses';
      else if (by === 'counter_fire') text = 'Machine-gun fire drives the gunner off his sight: his missile flies on unguided';
      else if (by === 'terrain_mask') text = 'The vehicle is behind cover: the gunner loses it and the missile goes astray';
      else if (by === 'unguided_miss') text = end.miss != null ? `The ${name} misses by ${metres(Math.abs(end.miss))}` : `The ${name} misses`;
      else if (by === 'jammer') text = `Jammed: the ${name} loses its control link`;
      else if (by === 'crew_smoke') text = 'Lost in the crew\'s own smoke';
      else text = `${name}: ${String(by).replace(/_/g, ' ')}`;
      if (text) this._cap(tE + 0.05, K, pri, text, v.i, th.idx);
      const far = end.type === 'ground' && (end.d || 0) > 150;
      if (far) this._cand(Object.assign({ a: tE - 2.2, b: tE + 1.8, known: K, pri: hkoi ? 7 : 5, min: 2, rig: 'follow', label: `the ${name} coming down` }, id));
      else out.push({ t: tE, brg: th.brg, idx: th.idx, pri: by === 'hit' ? 9 : by === 'aps' ? 8 : hkoi ? 7 : 5, tail: by === 'hit' ? 2.6 : 2.0, what: by });
    }
    // Trophy: each shot, counted over the whole battle
    for (const a of (rec.aps || []).slice().sort((p, q) => p.t - q.t)) {
      this.aps++; const th = rec.threats.find(x => x.idx === a.idx), name = th ? NAME[th.key] || th.key : 'missile', d = th && th.viz.end.type === 'aps_kill' ? th.viz.end.d : null;
      const count = `Trophy fires: ${ordinal(this.aps)}${this.apsTotal ? ' of ' + word(this.apsTotal) : ''} shot${this.apsTotal ? 's' : ''}`;
      if (!a.kill && th && th.state === 'hit') continue;   /* told with the hit that followed */
      this._cap(t0 + a.t, K, 8, a.kill ? `${count}. ${name} destroyed${d != null ? ' ' + metres(d) + ' out' : ''}` : `${count}. It misses the ${name}`, v.i, a.idx);
      if (th === star && !slowed) { slowed = true; this.slows.push([t0 + a.t - 0.25, t0 + a.t + 0.3, K]); }
      if (a.kill && th && !again) again = { w: 1, from: t0 + a.t - 3, to: t0 + a.t + 1.3, shot: { rig: 'replay', v: v.i, idx: th.idx, brg: th.brg, label: 'the intercept again, from above' } };
    }
    // endings close together share one shot that turns from one to the next
    out.sort((p, q) => p.t - q.t); let g = null;
    const flush = () => { if (g) this._cand({ a: g.marks[0].t - 1.7, b: g.end, known: K, pri: g.pri, min: 2, rig: 'low', marks: g.marks, v: v.i, idx: g.marks[0].idx, brg: g.marks[0].brg, label: g.what === 'hit' ? 'the hit' : g.what === 'aps' ? 'the Trophy intercept' : 'the miss' }); g = null; };
    for (const o of out) {
      if (g && (o.t - 1.7 > g.end - 0.3 || o.t + o.tail - g.marks[0].t > 8)) flush();
      if (!g) g = { marks: [], end: 0, pri: 0, what: o.what };
      g.marks.push({ t: o.t, brg: o.brg, idx: o.idx }); g.end = Math.max(g.end, o.t + o.tail); if (o.pri > g.pri) { g.pri = o.pri; g.what = o.what; }
    }
    flush();
    if (again) { let last = 0; for (const th of rec.threats) last = Math.max(last, t0 + th.viz.end.t); again.shot.pri = 9; again.shot.min = 1.5; again.shot.t0 = again.from; this.replays.push({ v: v.i, at: Math.max(again.to + 1, last + 2.2), from: Math.max(t0 + 0.4, again.from), to: again.to, known: K, shot: again.shot }); }
    if (rec.killed) {
      const tK = t0 + (rec.kill_t != null ? rec.kill_t : rec.t_end);
      this._cap(tK + 2.4, K, 10, 'The vehicle is destroyed');
      this._cand({ a: tK + 2.4, b: tK + 600, known: K, pri: 9.5, min: 4, rig: 'hold', brg: star ? star.brg : 0, v: v.i, label: 'the vehicle, lost' });
    }
  }

  // ---- one step of 0.1 s --------------------------------------------------------------------------------------------------
  _step(t) {
    // the camera
    let best = null; const C = this.cands;
    for (let i = C.length - 1; i >= 0; i--) {
      const c = C[i]; if (c.used || c.b <= t) { C.splice(i, 1); continue; }   /* taken already, or its moment has passed */
      if (c.known > t || c.a > t || c.b - t < c.min) continue;   /* not known yet, not due yet, or too little of it left to be worth a cut */
      if (!best || c.pri > best.pri || c.pri === best.pri && (c.a < best.a || c.a === best.a && c.id < best.id)) best = c;
    }
    const cur = this.cur, age = cur ? t - cur.t0 : 1e9, over = !cur || t >= cur.end;
    let take = null;
    if (over && !best && cur && !cur.idle && !cur.inside && t - cur.t0 < 9) {   /* nothing due this instant, but something is within 2.5 s: hold the picture rather than cut away and back */
      let nx = null; for (const c of C) if (c.known <= t && c.a > t && c.a - t <= 2.5 && c.b - c.a >= c.min && (!nx || c.a < nx.a)) nx = c;
      if (nx) { cur.end = nx.a; cur.t1 = nx.a; }
    }
    if (t >= (cur ? cur.end : 0)) take = best || 'idle';
    else if (best && best.pri > cur.pri && (age >= cur.min || best.pri >= cur.pri + 3 && age >= LIMITS.floor)) take = best;
    if (take === 'idle') {
      const d = IDLE[this.idleN % IDLE.length]; this.idleN++;
      this._shot(t, Object.assign({ pri: 0, min: LIMITS.shotMin, idle: true }, d), t + d.len, null);
    } else if (take) { take.used = true; this.idleN = 0; this._shot(t, take, take.b, take); }
    // the caption line
    const cc = this.capCur, P = this.caps; let top = null, waiting = 0, soon = 0;
    for (const c of P) if (c.known <= t && c.t > t && c.t - t < LIMITS.capMin && c.pri > soon) soon = c.pri;   /* the most important line due within the next moment (known ahead) */
    for (let i = P.length - 1; i >= 0; i--) {
      const c = P[i]; if (c.known > t || c.t > t) continue;
      if (t - c.t > (c.pri >= 9 ? 4 : c.pri >= 5 ? 2 : 1.2) || c.pri < 9 && this._late(t)) { P.splice(i, 1); continue; }   /* too late to say now */
      if (soon >= c.pri + 1) continue;   /* a more important line is about to be due: do not start this one in its way */
      waiting++; const w = c.pri + (this.cur && c.v != null && this.cur.v === c.v && this.cur.idx === c.idx ? 1.5 : 0);
      if (!top || w > top.w || w === top.w && (c.t < top.c.t || c.t === top.c.t && c.id < top.c.id)) top = { c, w };
    }
    if (cc && waiting && t - cc.t0 >= LIMITS.capBusy) cc.t1 = Math.min(cc.t1, t);   /* others are waiting: do not linger */
    const capAge = cc ? t - cc.t0 : 1e9;   /* a decisive line (the cut, the intercept, the hit) may cut in early; others wait for the shortest reading time */
    if (top && (!cc || t >= cc.t1 || top.c.pri > cc.pri && (capAge >= LIMITS.capMin || top.c.pri >= 7 && capAge >= LIMITS.capFloor))) {
      if (cc && t < cc.t1) cc.t1 = t;
      P.splice(P.indexOf(top.c), 1);
      this.capCur = { t0: t, t1: t + LIMITS.capLen, text: top.c.text, pri: top.c.pri }; this.shown.push(this.capCur);
    }
  }
  _shot(t, spec, end, c) {
    if (this.cur) this.cur.t1 = t;
    const s = Object.assign({}, spec, { t0: t, t1: end, end, c }); delete s.a; delete s.b; delete s.known; delete s.used; delete s.id;
    this.cur = s; this.shots.push(s);
  }

  // a plain list for tests and for looking at what the director did
  list() { return this.shots.map(s => `${s.t0.toFixed(1)} ${s.cam || s.rig}${s.idx != null ? ' #' + s.idx : ''}${s.uid != null && s.idx == null ? ' u' + s.uid : ''} p${s.pri}`); }
}
