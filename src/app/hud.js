// What is written on the screen during a battle, in two displays:
//   ENGINEER  (the default) one headline at the top centre: what is in the air and what HKOI and Trophy are doing about it;
//             four quiet panels in fixed places (Defences, Crew at the left; Weapons, Enemy at the right), each of which
//             folds to its title with a click; in a crew seat, one thin strip instead.
//   SIMPLE    a slim status line, two small gauges, a warning with a bearing while something is inbound.
// Both show the crew's words as subtitles. The top strip, the log ticker, the full log and the control bar belong to main.js.
//
// This module only reads the battle; it changes nothing in it. Every box keeps its elements and rewrites a piece of text only
// when that text has changed, so a quiet battle costs nothing here. A value that has just changed lights up for a moment.

const ROLE = { CDR: 'Commander', GNR: 'Gunner', LDR: 'Loader', DRV: 'Driver' };
const WEAPON = { kornet: 'Kornet missile', saclos: 'Konkurs missile', rpg: 'RPG rocket', sal: 'Laser-guided missile', fpv: 'FPV drone', fpv_fiber: 'Fibre FPV drone' };
// why HKOI is not engaging a threat it tracks, in plain words (the engine's own reasons)
const SKIP = { min_range: 'too close for HKOI', gun_los: 'HKOI has no clear line', dead_zone: 'HKOI gun masked by the turret', elevation_limit: 'outside HKOI gun elevation', hkoi_down: 'HKOI knocked out', no_time: 'no time for HKOI', unguided: 'unguided rocket, nothing to blind', ke: 'gun round, nothing to blind' };
const STATES = ['steady', 'strained', 'shaken', 'panicked'];
const PANELS = [['crew', 'Crew', 'crewmen'], ['def', 'Defences', 'defences'], ['wpn', 'Weapons', 'crew'], ['enemy', 'Enemy', 'enemybox']];   // key, title, id of the body
const MEN = ['cdr', 'gnr', 'ldr', 'drv'];
const STATION = { def: ['HKOI', 'APS'], wpn: ['MAIN', 'M2', 'M240'] };   // which of battle.tankBoard()'s stations go in which panel
// what a frozen man stops doing, and what the crew does without a man who is out of action (the rules of src/battle/crew.js)
const FROZEN = { cdr: 'gives no orders, .50 silent', gnr: 'does not lay or fire', ldr: 'does not load or man his gun', drv: 'does not move the vehicle' };
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const brg3 = d => String(Math.round(((d % 360) + 360) % 360) % 360).padStart(3, '0');
const SK = t => t.length > 14 ? t.replace(/[\d.]+/g, '#') : t;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export class Hud {
  // $: element by id, el: element maker (tag, class, text), store: { get, set } for the folded panels
  // faces: the portraits (src/app/faces.js), or null
  constructor($, el, store, faces) {
    this.$ = $; this.el = el; this.store = store; this.faces = faces || null;
    this.sig = {};               // last text written to each rebuilt box
    this.tSlow = 0; this.tFast = 0;
    this.max = { obs: 150, he: 150, aps: 4 };
    this.rate = new WeakMap();   // per threat: last range and time, for the time to impact
    this.said = 0;               // how many spoken crew lines have been shown
    this.subUntil = 0;
    this.shut = (store && store.get('panels', {})) || {};
    this.crewWas = {}; this.crewLast = null;   // each man's last state, and who changed most recently
    this.n = {};                 // the panels' elements, by name
    this.build();
  }

  // ---- the four panels are built once; later only their texts and bar widths change
  build() {
    const el = this.el, n = this.n;
    for (const [key, title, bodyId] of PANELS) {
      const body = this.$(bodyId), pan = body.parentNode, head = pan.querySelector('h3');
      head.textContent = ''; head.append(el('span', null, title), n[key + 'Note'] = el('em'));
      head.title = 'Click to fold or unfold this panel';
      head.onclick = () => { this.shut[key] = !this.shut[key]; pan.classList.toggle('shut', !!this.shut[key]); if (this.store) this.store.set('panels', this.shut); };
      pan.classList.toggle('shut', !!this.shut[key]); body.textContent = '';
    }
    const row = (body, label) => {   // label | text
      const r = el('div', 'r wide'), mid = el('span', 'm'); r.append(el('label', null, label), mid); this.$(body).append(r); return { r, mid };
    };
    // CREW: a portrait of each man with, beside it, his state, what he is doing, what stress is doing to him, and the reason
    n.men = {};
    for (const r of MEN) {
      const x = { row: el('div', 'man'), face: el('canvas', 'face'), tag: el('span', 'tag'), name: el('b', null, ROLE[r.toUpperCase()]), dot: el('u'), word: el('i'), fill: el('i'), doing: el('div', 'do'), fx: el('div', 'fx'), why: el('div', 'why') };
      x.face.width = 160; x.face.height = 200; const pic = el('div', 'pic'), mt = el('div', 'mt'), who = el('div', 'who'), bar = el('div', 'gbar');
      pic.append(x.face, x.tag); who.append(x.name, x.dot, x.word); bar.append(x.fill); mt.append(who, bar, x.doing, x.fx, x.why); x.row.append(pic, mt); this.$('crewmen').append(x.row); n.men[r] = x;
      if (this.faces) this.faces.attach(r, x.face);
    }
    // the compact form: four small faces in a row, each with a dot and one word (simple display and seat views)
    n.mini = {}; const fr = this.$('facerow');
    for (const r of MEN) { const x = { box: el('div', 'mf'), face: el('canvas'), dot: el('u'), word: el('i') }; x.face.width = 64; x.face.height = 72; const cap = el('span'); cap.append(x.dot, x.word); x.box.append(x.face, cap); x.box.title = ROLE[r.toUpperCase()]; fr.append(x.box); n.mini[r] = x; if (this.faces) this.faces.attach(r, x.face, true); }
    // DEFENCES and WEAPONS: one card for each station of battle.tankBoard()
    n.st = {};
    for (const [pan, keys] of Object.entries(STATION)) for (const k of keys) {
      const c = { card: el('div', 'st'), title: el('b'), tag: el('i', 'tag'), line: el('div', 'sl'), mags: el('div', 'sa'), fact: el('div', 'sf'), mag: [] }, sh = el('div', 'sh');
      sh.append(c.title, c.tag); c.card.append(sh, c.line, c.mags, c.fact); this.$(pan === 'def' ? 'defences' : 'crew').append(c.card); n.st[k] = c;
    }
    n.common = el('div', 'why'); this.$('crewmen').append(n.common);   /* the reason the whole crew shares, said once */
    n.radar = row('defences', 'Radar');
    n.group = row('enemybox', 'Group'); n.teams = row('enemybox', 'Teams'); n.near = row('enemybox', 'Nearest'); n.fired = row('enemybox', 'Fired');
  }
  // write a text (and a class) into an element only if it changed; a change after the first lights the element up for a moment
  put(node, text, cls, quiet) {
    text = String(text); let changed = false;
    if (node._t !== text) { const old = node._t; node._t = text; node.textContent = text; changed = old !== undefined && SK(old) !== SK(text); }   /* in a long line a number ticking over is not news */
    if (cls !== undefined && node._c !== cls) { node._c = cls; node.className = cls; changed = changed || !!node._seen; }
    node._seen = true;
    if (changed && !quiet) { node.classList.remove('fl'); void node.offsetWidth; node.classList.add('fl'); }
  }
  width(node, f) { const w = (100 * Math.max(0, Math.min(1, f))).toFixed(0) + '%'; if (node._w !== w) { node._w = w; node.style.width = w; } }

  // a new battle: forget what was shown, take the full magazines as the gauges' 100%
  reset(battle, sound) {
    this.sig = {}; this.rate = new WeakMap(); this.tSlow = 0; this.tFast = 0; this.crewWas = {}; this.crewLast = null;
    const st = battle.tank.st || {};
    this.max = { obs: Math.max(1, st.obs || 150), he: Math.max(1, st.he || 150), aps: Math.max(1, st.apsL || 0, st.apsR || 0) };
    this.said = sound && sound.icom ? sound.icom.said.length : 0;
    this.$('subs').style.opacity = 0; if (this.faces) this.faces.reset();
  }
  // the crew's state from the battle. `fake` (set only by tests and picture sessions, never by the page) overrides single men, so a
  // wounded, frozen or dead man can be looked at without waiting for a battle to produce one.
  crewNow(B) { const c = B.crewState ? B.crewState() : null; if (c && this.fake) for (const r of Object.keys(this.fake)) if (c.who[r]) Object.assign(c.who[r], this.fake[r]); return c; }
  _put(id, sig, build) { if (this.sig[id] === sig) return; this.sig[id] = sig; const box = this.$(id); box.textContent = ''; build(box); }
  _show(id, on) { const e = this.$(id); if (e.hidden === on) e.hidden = !on; }

  // s: { on, mode: 'simple' | 'engineer', seat, sight, battle, volleys, now (battle time drawn), shown: { e, n, h }, spectator, sound, frameMs }
  update(dt, s) {
    const simple = s.mode === 'simple', on = s.on, panels = on && !simple && !s.seat && !s.sight;
    this._show('sline', on && simple && !s.seat);
    this._show('gauges', on && simple && !s.seat);
    this._show('engleft', panels);
    this._show('engright', panels);
    this._show('threats', on && !simple && !s.seat && !s.enemy);
    this._show('strip', on && !simple && s.seat);
    this._show('facerow', on && (simple || s.seat) && !!this.faces && !this.faces.failed);
    document.body.classList.toggle('faces-on', on && (simple || s.seat) && !!this.faces && !this.faces.failed);
    if (!on) { this._show('warn', false); if (this.faces) this.faces.update(dt, { on: false }); return; }
    this.subtitles(s);
    if (this.faces) {   /* the portraits are drawn only while something shows them: the open crew panel, or the compact row */
      const shown = simple || s.seat ? !this.faces.failed : panels && !this.shut.crew, ic = s.sound && s.sound.icom;
      this.faces.update(dt, { on: shown, playing: s.playing, battle: s.battle, now: s.now == null ? s.battle.t : s.now, crew: shown ? this.crewNow(s.battle) : null, speaking: ic && ic.cur ? ic.cur.who : null, graphic: s.graphic !== false });
    }
    this.tFast -= dt; this.tSlow -= dt;
    if (this.tFast <= 0) {
      this.tFast = 0.12;
      const list = this.threatList(s);
      if (simple) this.warning(list); else { this._show('warn', false); if (!s.seat && !s.enemy) this.headline(list); }
    }
    if (this.tSlow > 0) return;
    this.tSlow = 0.3;
    const B = s.battle, sum = B.summary(), rows = B.tankStatus ? B.tankStatus() : [], crew = this.crewNow(B);
    if (simple) { if (!s.seat) { this.line(B, sum, rows, crew); this.gauges(sum); } }
    else if (s.seat) this.strip(B, sum, s);
    else if (panels) { const board = {}; if (B.tankBoard) for (const e of B.tankBoard()) board[e.key] = e; this.stations(board, sum, s); this.crewPanel(crew, board, sum); this.enemy(B, sum, s); }
    if (crew && (simple || s.seat)) this.miniFaces(crew);
  }

  // ---- what is in the air, nearest first. The crew is warned only of what the sensors have picked up; with fog of war off
  // (spectator) the rest is listed too, marked as not yet seen.
  threatList(s) {
    const out = [], T = s.shown, now = s.battle.t, v = s.battle.volleys[s.battle.volleys.length - 1], tv = v ? (s.now == null ? now : s.now) - v.t0 : 0;
    if (!s.battle.tank.alive || s.battle.over) return out;   /* nothing to warn a destroyed or abandoned vehicle of: the banner goes */
    for (const m of s.volleys.info) {
      if (!m.cued && !s.spectator) continue;
      const brg = Math.atan2(m.p.x - T.e, -m.p.z - T.n) * 180 / Math.PI, rel = ((brg - T.h) % 360 + 360) % 360;
      let r = this.rate.get(m.th), tti = null;
      if (!r) { r = { R: m.range, t: now, v: 0 }; this.rate.set(m.th, r); }
      else if (now - r.t > 0.25) { r.v = (r.R - m.range) / (now - r.t); r.R = m.range; r.t = now; }
      if (r.v > 5) tti = m.range / r.v;
      const [doing, kind] = this.response(m, tv);
      out.push({ name: (m.th && WEAPON[m.th.key]) || (m.tt && (m.tt.short || m.tt.name)) || (m.drone ? 'Drone' : 'Missile'), range: m.range, brg, hour: Math.round(rel / 30) % 12 || 12, cued: m.cued, tracked: m.tracked, drone: m.drone, tti, doing, kind });
    }
    return out.sort((a, b) => a.range - b.range);
  }
  // What the defences are doing about one threat right now, in plain words, from the engine's own record of the engagement.
  // Only what has already happened by this moment is read: when HKOI opened fire, where its rounds meet the missile, where
  // the engine says guidance was lost, when Trophy fired. Returns [text, kind] with kind hk (HKOI), aps (Trophy), wait or none.
  response(m, tv) {
    const th = m.th || {}, viz = th.viz || {};
    if (!m.cued) return ['not seen by the vehicle yet', 'none'];
    if (viz.aps && tv >= viz.aps.t) return ['Trophy has fired', 'aps'];
    if (viz.fired != null && tv >= viz.fired) {
      if (m.drone) return ['HKOI firing airburst', 'hk'];
      if (th.sever_m != null && /^hkoi/.test(th.defeated_by || '') && m.range <= th.sever_m) return ['cloud placed, guidance cut', 'hk'];
      if (th.meet != null && m.range <= th.meet) return ['HKOI cloud placed in its path', 'hk'];
      return ['HKOI firing obscurant', 'hk'];
    }
    if (!m.tracked) return ['warning received, radar searching', 'wait'];
    if (th.skip && SKIP[th.skip.why]) return [SKIP[th.skip.why] + ': left to Trophy', 'aps'];
    return ['tracked, HKOI laying on', 'wait'];
  }

  // ---- engineer display: the headline
  headline(list) {
    const sig = list.map(x => `${x.name},${Math.round(x.range / 10)},${Math.round(x.brg)},${x.doing},${x.tti == null ? '' : x.tti.toFixed(1)}`).join('|') || 'none';
    this._put('threats', sig, box => {
      const el = this.el;
      if (!list.length) { box.className = 'quiet'; box.append(el('span', null, 'No threats in the air')); return; }
      box.className = list.some(x => x.tracked) ? 'hot' : 'warm';
      box.append(el('h3', null, list.length === 1 ? 'Inbound' : `Inbound: ${list.length}`));
      for (const x of list.slice(0, 3)) {
        const d = el('div', 't' + (x.cued ? '' : ' unk'));
        d.append(el('b', null, x.name), el('span', 'num', `${(x.range / 1000).toFixed(2)} km`), el('span', 'num', `${x.hour} o'clock · ${brg3(x.brg)}°`), el('span', 'num', x.tti != null ? `${x.tti.toFixed(1)} s` : ''), el('span', 'do ' + x.kind, x.doing));
        box.append(d);
      }
      if (list.length > 3) box.append(el('div', 'more', `and ${list.length - 3} more`));
    });
  }

  // ---- engineer display: the four panels
  // DEFENCES (HKOI, Trophy) and WEAPONS (main gun, .50, M240): for each station its state as a coloured word, what it is doing
  // or what it is laid on with the range, a small bar for each magazine (amber under a quarter, red at zero), and one or two facts.
  stations(board, sum, s) {
    const n = this.n;
    for (const k of Object.keys(n.st)) {
      const c = n.st[k], e = board[k]; if (!e) { this.put(c.title, k); this.put(c.tag, sum.alive ? '-' : 'out', 'tag bad'); continue; }
      this.put(c.title, e.title, undefined, true); this.put(c.tag, e.state, 'tag ' + (e.tone || 'ok'));
      const what = e.target ? `${e.target.name}, ${e.target.range}` + (e.target.note ? ': ' + e.target.note : '') : String(e.line || '').replace(/\.$/, '');
      this.put(c.line, what, 'sl' + (e.target ? ' tgt' : '')); if (c.line.title !== what) c.line.title = what;
      const ammo = e.ammo || [];
      while (c.mag.length < ammo.length) { const m = { box: this.el('span', 'mag'), lab: this.el('label'), bar: this.el('div', 'gbar'), fill: this.el('i'), v: this.el('b') }; m.bar.append(m.fill); m.box.append(m.lab, m.bar, m.v); c.mags.append(m.box); c.mag.push(m); }
      ammo.forEach((a, i) => { const m = c.mag[i], cls = a.n <= 0 ? 'bad' : a.n < a.max / 4 ? 'warn' : ''; this.put(m.lab, a.label, undefined, true); this.put(m.v, a.n, cls); this.width(m.fill, a.n / Math.max(1, a.max)); if (m.fill._c !== cls) { m.fill._c = cls; m.fill.className = cls; } if (m.box.title !== `${a.n} of ${a.max}`) m.box.title = `${a.n} of ${a.max}`; });
      const facts = (e.facts || []).slice(0, 2).join(' · '); this.put(c.fact, facts, 'sf', true); if (c.fact.title !== (e.facts || []).join(' · ')) c.fact.title = (e.facts || []).join(' · '); if (c.fact.hidden !== !facts) c.fact.hidden = !facts;
    }
    const tracks = s.volleys.info.filter(m => m.tracked).length; this.put(n.radar.mid, tracks ? `tracking ${tracks}` : 'no tracks', 'm' + (tracks ? ' hk' : ''));
    const tot = sum.apsL + sum.apsR; this.put(n.defNote, tot === 0 ? 'Trophy empty' : sum.obs === 0 ? 'no obscurant' : '', 'bad');
  }
  // what stress, a wound or a freeze is doing to one man's work right now, with the crew model's own numbers
  effect(r, m, crew) {
    const C = typeof window !== 'undefined' && window.HKCrew; if (!crew.on) return ['stress off: no effect', ''];
    if (crew.abandoned) return ['has left the vehicle', 'bad'];
    const W = C ? C.WOUND : { cdrOnGun: 1.8, slow: 1.5, aim: 1.3 }, E = C ? C.EFFECT : { lay: 0.6, load: 0.5, handover: 0.8, react: 0.5, aim: 1, arc: 0.5, notice: 0.6 }, lo = C ? C.STATE.strained : 0.35;
    if (m.status === 'down') return [{ cdr: 'the gunner gives the orders', gnr: `commander fires the main gun, ${W.cdrOnGun} times slower; .50 silent`, ldr: 'another man loads: 14 s a round, not 6', drv: 'the vehicle cannot move' }[r], 'bad'];
    if (/frozen/.test(m.busy || '')) return [`${m.busy}: ${FROZEN[r]}`, 'bad'];
    const o = Math.max(0, Math.min(1, (m.stress - lo) / (1 - lo))), hurt = m.status === 'wounded', pc = x => Math.round(100 * x) + '%', out = [];
    if (hurt) out.push(`wounded: drills ${W.slow} times slower`);
    if (o > 0.005 || hurt) {
      if (r === 'gnr') { if (o > 0.005) out.push(`lay time +${pc(E.lay * o)}`); out.push(`aim spread x${((1 + E.aim * o) * (hurt ? W.aim : 1)).toFixed(1)}`); if (o > 0.005) out.push(`watch sector -${pc(E.arc * o)}`); }
      else if (r === 'ldr') { if (o > 0.005) out.push(`loading +${pc(E.load * o)}`); }
      else if (r === 'cdr') { if (o > 0.005) out.push(`.50 onto a new target +${pc(E.handover * o)}`, `reaction +${pc(E.react * o)}`, `spotting -${pc(E.notice * o)}`); }
      else if (o > 0.005) out.push(`reaction to an order +${pc(E.react * o)}`);
    }
    if (crew.buttoned && r === 'ldr') out.push('will not man the M240'); if (crew.buttoned && r === 'cdr') out.push('all-round scan cut to 60%');
    return out.length ? [out.join(', '), o > 0.4 || hurt ? 'warn' : ''] : ['steady: no effect', ''];
  }
  crewPanel(crew, board, sum) {
    const n = this.n; if (!crew) return;
    this.put(n.crewNote, !crew.on ? 'stress off' : crew.quality + (crew.abandoned ? ', left the vehicle' : crew.buttoned ? ', buttoned up' : ', hatches open'), crew.abandoned ? 'bad' : '');
    const B = board, doing = {
      cdr: B.CDR ? B.CDR.line : '', drv: B.DRV ? [B.DRV.line.replace(/\.$/, '')].concat((B.CDR && B.CDR.facts || []).filter(f => /facing/.test(f))).join(', ') : '',
      gnr: B.MAIN ? `${B.MAIN.state}: ` + (B.MAIN.target ? `${B.MAIN.target.name}, ${B.MAIN.target.range}` : B.MAIN.line) : '', ldr: B.M240 ? ((B.M240.facts || [])[0] || B.M240.line) : '' };
    // the reason for a man's state is shown under him only when it is his own; one that the whole crew shares is said once, under the four
    const seen = {}; for (const r of MEN) { const m = crew.who[r]; if (crew.on && m.status !== 'down' && m.why && m.why !== 'nothing yet') seen[m.why] = (seen[m.why] || 0) + 1; }
    const shared = Object.keys(seen).filter(w => seen[w] > 1).sort((a, b) => seen[b] - seen[a])[0] || '';
    this.put(n.common, shared ? `Whole crew: ${shared}` : '', 'why', true); if (n.common.hidden !== !shared) n.common.hidden = !shared;
    for (const r of MEN) {
      const m = crew.who[r], x = n.men[r], down = m.status === 'down', dead = down && /killed/.test(m.busy || ''), k = down ? 3 : Math.max(0, STATES.indexOf(m.state));
      const word = dead ? 'killed' : down ? 'out of action' : /frozen/.test(m.busy || '') ? 'frozen' : m.state + (m.status === 'wounded' ? ', wounded' : '');
      this.put(x.word, word, 's' + k); if (x.dot._c !== 's' + k) { x.dot._c = 's' + k; x.dot.className = 's' + k; }
      this.width(x.fill, down ? 0 : m.stress); if (x.fill._c !== 's' + k) { x.fill._c = 's' + k; x.fill.className = 's' + k; }
      this.put(x.tag, dead ? 'KILLED' : down ? 'OUT OF ACTION' : '', 'tag', true); const rc = 'man m' + k + (down ? ' down' : '') + (/frozen/.test(m.busy || '') ? ' frozen' : ''); if (x.row._c !== rc) { x.row._c = rc; x.row.className = rc; }
      const d = !sum.alive ? 'vehicle destroyed' : down ? (m.busy || 'out of action') : doing[r] || '-'; this.put(x.doing, d, 'do', true); if (x.doing.title !== d) x.doing.title = d;
      const [fx, tone] = this.effect(r, m, crew); this.put(x.fx, fx, 'fx ' + tone); if (x.fx.title !== fx) x.fx.title = fx;
      const why = !crew.on || down ? '' : m.why && m.why !== 'nothing yet' && m.why !== shared ? `His own: ${m.why}` : ''; this.put(x.why, why, 'why', true); if (x.why.hidden !== !why) x.why.hidden = !why; if (x.why.title !== `stress ${Math.round(m.stress * 100)}%` + (m.why ? ': ' + m.why : '')) x.why.title = `stress ${Math.round(m.stress * 100)}%` + (m.why ? ': ' + m.why : '');
    }
  }
  miniFaces(crew) {
    for (const r of MEN) { const m = crew.who[r], x = this.n.mini[r], down = m.status === 'down', k = down ? 3 : Math.max(0, STATES.indexOf(m.state));
      this.put(x.word, down ? (/killed/.test(m.busy || '') ? 'killed' : 'out') : /frozen/.test(m.busy || '') ? 'frozen' : m.status === 'wounded' ? 'wounded' : m.state, 's' + k); if (x.dot._c !== 's' + k) { x.dot._c = 's' + k; x.dot.className = 's' + k; } }
  }
  enemy(B, sum, s) {
    const n = this.n, T = s.shown; let known = 0, dead = 0, near = null, nd = 1e9;
    for (const u of B.units) { if (!u.alive) { dead++; continue; } if (u.gone || !u.known) continue; known++; const d = Math.hypot(u.e - T.e, u.n - T.n); if (d < nd) { nd = d; near = u; } }
    this.put(n.group.mid, sum.waves > 1 ? `${sum.wave} of ${sum.waves}` + (B.waveAt != null ? ', beaten: lull' : '') : 'one group', 'm');
    this.put(n.teams.mid, `${known} located, ${dead} destroyed` + (s.spectator ? `, ${B.units.filter(u => u.alive && !u.gone).length} alive` : ''), 'm');
    this.put(n.near.mid, near ? `${near.spec.name}, ${Math.round(nd / 10) * 10} m, bearing ${brg3(Math.atan2(near.e - T.e, near.n - T.n) * 180 / Math.PI)}°` : 'none located', 'm');
    this.put(n.fired.mid, `${sum.fired} at us, ${sum.hits} hit${sum.hits === 1 ? '' : 's'}`, 'm' + (sum.hits ? ' bad' : ''));
  }
  // inside a seat the engineer display shrinks to one line
  strip(B, sum, s) {
    const down = Object.values(sum.crew || {}).filter(x => x !== 'ok').length;
    const parts = [['T+', clock(B.t)], ['Obscurant', sum.obs], ['Airburst', sum.he], ['Trophy', `L${sum.apsL} R${sum.apsR}`], ['Crew', `${4 - down}/4`], ['Fired at us', `${sum.fired}, ${sum.hits} hit`], ['In the air', s.volleys.info.filter(m => m.cued || s.spectator).length], ['Frame', `${s.frameMs.toFixed(1)} ms`]];
    this._put('strip', parts.map(p => p.join(' ')).join('|'), box => { parts.forEach(([k, v], i) => { box.append((i ? '   ' : '') + k + ' ', this.el('b', null, String(v))); }); });
  }

  // ---- simple display
  warning(list) {
    const known = list.filter(x => x.cued), w = this.$('warn'); this._show('warn', known.length > 0); if (!known.length) return;
    const x = known[0], head = `${x.name.toUpperCase()} INBOUND`, more = known.length > 1 ? `   +${known.length - 1} more` : '';
    const sub = `${x.hour} o'clock · bearing ${brg3(x.brg)} · ${(x.range / 1000).toFixed(1)} km${more}`, cls = x.tracked ? 'trk' : '';
    if (w.className !== cls) w.className = cls;
    if (this.sig.warn !== head + sub) { this.sig.warn = head + sub; w.firstChild.textContent = head; w.lastChild.textContent = sub; }
  }
  line(B, sum, rows, crew) {
    const parts = [['T+ ' + clock(B.t), '']];
    if (sum.waves > 1) parts.push([B.waveAt != null ? `Enemy group ${sum.wave} of ${sum.waves} beaten, lull` : `Enemy group ${sum.wave} of ${sum.waves}`, '']);
    const down = Object.values(sum.crew || {}).filter(x => x !== 'ok').length;
    if (!sum.alive) parts.push(['Vehicle destroyed', 'b']);
    else {
      if (crew && crew.abandoned) parts.push(['Crew has left the vehicle', 'b']);
      else if (rows[0]) parts.push([`${ROLE[rows[0][0]] || cap(String(rows[0][0]).toLowerCase())}: ${rows[0][1]}`, 'act']);
      if (down) parts.push([`Crew ${4 - down} of 4`, 'b']);
      const worst = crew && crew.on ? Object.values(crew.who).filter(m => m.status !== 'down').map(m => m.state) : [];
      const st = worst.includes('panicked') ? 'panicked' : worst.includes('shaken') ? 'shaken' : worst.includes('strained') ? 'strained' : null;
      if (st && !(crew && crew.abandoned)) parts.push([`Crew ${st}`, st === 'strained' ? 'w' : 'b']);
    }
    this._put('sline', parts.map(p => p.join('/')).join('|'), box => {
      for (const [text, cls] of parts) { const sp = this.el('span', cls === 'act' ? null : cls || null); if (cls === 'act') sp.append(this.el('b', null, text)); else sp.textContent = text; box.append(sp); }
    });
  }
  gauges(sum) {
    const M = this.max, hk = this.$('g-hkoi'), ap = this.$('g-aps'), tot = sum.apsL + sum.apsR;
    const hkCls = 'gauge panel' + (sum.obs + sum.he === 0 ? ' bad' : sum.obs < 40 || sum.he < 40 ? ' warn' : ''), apCls = 'gauge panel' + (tot === 0 ? ' bad' : tot < 3 ? ' warn' : '');
    const sig = [sum.obs, sum.he, sum.apsL, sum.apsR].join(','); if (this.sig.gauges === sig) return; this.sig.gauges = sig;
    hk.className = hkCls; hk.children[1].textContent = `${sum.obs} + ${sum.he}`; hk.title = 'HKOI rounds left: obscurant + airburst';
    const bars = hk.querySelectorAll('.gbar i'); bars[0].style.width = (50 * sum.obs / M.obs).toFixed(1) + '%'; bars[1].style.width = (50 * sum.he / M.he).toFixed(1) + '%';
    ap.className = apCls; ap.children[1].textContent = `L ${sum.apsL}  R ${sum.apsR}`;
    const pips = ap.querySelector('.pips'); pips.textContent = '';
    for (let i = 0; i < M.aps; i++) pips.append(this.el('i', i < sum.apsL ? 'on' : null));
    pips.append(this.el('u'));
    for (let i = 0; i < M.aps; i++) pips.append(this.el('i', i < sum.apsR ? 'on' : null));
  }
  // the crew's words as they are spoken on the intercom (the sound engine's own list of what it played)
  subtitles(s) {
    const box = this.$('subs'), now = performance.now(), said = s.sound && s.sound.icom ? s.sound.icom.said : null;
    if (said) {
      if (this.said > said.length) this.said = said.length;
      while (this.said < said.length) {
        const x = said[this.said++]; if (!x || !x.text) continue;
        box.textContent = ''; box.append(this.el('b', null, ROLE[x.who] || x.who || 'Crew'), String(x.text));
        box.style.opacity = 1; this.subUntil = now + 1000 * Math.max(2.2, Math.min(6, (x.end - x.t || 0) + 1.2));
      }
    }
    if (this.subUntil && now > this.subUntil) { this.subUntil = 0; box.style.opacity = 0; }
  }
}
