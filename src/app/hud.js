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
const PANELS = [['def', 'Defences', 'defences'], ['crew', 'Crew', 'crewmen'], ['wpn', 'Weapons', 'crew'], ['enemy', 'Enemy', 'enemybox']];   // key, title, id of the body
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const brg3 = d => String(Math.round(((d % 360) + 360) % 360) % 360).padStart(3, '0');
const SK = t => t.length > 14 ? t.replace(/[\d.]+/g, '#') : t;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export class Hud {
  // $: element by id, el: element maker (tag, class, text), store: { get, set } for the folded panels
  constructor($, el, store) {
    this.$ = $; this.el = el; this.store = store;
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
    const row = (body, label, kind, wide) => {   // label | middle (text, bar or pips) | value at the right (wide: the text takes the value's place too)
      const r = el('div', wide ? 'r wide' : 'r'), mid = el(kind === 'text' ? 'span' : 'div', kind === 'text' ? 'm' : kind), v = el('b');
      r.append(el('label', null, label), mid, v); this.$(body).append(r); return { r, mid, v };
    };
    n.hkoi = row('defences', 'HKOI', 'text', true); n.obs = row('defences', 'Obscurant', 'gbar'); n.he = row('defences', 'Airburst', 'gbar');
    n.obs.fill = el('i'); n.obs.mid.append(n.obs.fill); n.he.fill = el('i'); n.he.mid.append(n.he.fill);
    n.aps = row('defences', 'Trophy', 'pips'); n.radar = row('defences', 'Radar', 'text', true);
    n.orders = row('crewmen', 'Orders', 'text', true); n.men = {};
    for (const r of ['cdr', 'gnr', 'ldr', 'drv']) {
      const x = row('crewmen', ROLE[r.toUpperCase()], 'gbar'); x.fill = el('i'); x.mid.append(x.fill); x.dot = el('u'); x.v.before(x.dot); n.men[r] = x;
    }
    n.why = el('div', 'why'); this.$('crewmen').append(n.why);
    n.main = row('crew', 'Main gun', 'text'); n.coax = row('crew', 'Coax', 'text'); n.m2 = row('crew', '.50', 'text'); n.m240 = row('crew', 'M240', 'text');
    n.group = row('enemybox', 'Group', 'text', true); n.teams = row('enemybox', 'Teams', 'text', true); n.near = row('enemybox', 'Nearest', 'text', true); n.fired = row('enemybox', 'Fired at us', 'text', true);
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
    this.$('subs').style.opacity = 0;
  }
  _put(id, sig, build) { if (this.sig[id] === sig) return; this.sig[id] = sig; const box = this.$(id); box.textContent = ''; build(box); }
  _show(id, on) { const e = this.$(id); if (e.hidden === on) e.hidden = !on; }

  // s: { on, mode: 'simple' | 'engineer', seat, sight, battle, volleys, now (battle time drawn), shown: { e, n, h }, spectator, sound, frameMs }
  update(dt, s) {
    const simple = s.mode === 'simple', on = s.on, panels = on && !simple && !s.seat && !s.sight;
    this._show('sline', on && simple && !s.seat);
    this._show('gauges', on && simple && !s.seat);
    this._show('engleft', panels);
    this._show('engright', panels);
    this._show('threats', on && !simple && !s.seat);
    this._show('strip', on && !simple && s.seat);
    if (!on) { this._show('warn', false); return; }
    this.subtitles(s);
    this.tFast -= dt; this.tSlow -= dt;
    if (this.tFast <= 0) {
      this.tFast = 0.12;
      const list = this.threatList(s);
      if (simple) this.warning(list); else { this._show('warn', false); if (!s.seat) this.headline(list); }
    }
    if (this.tSlow > 0) return;
    this.tSlow = 0.3;
    const B = s.battle, sum = B.summary(), rows = B.tankStatus ? B.tankStatus() : [], crew = B.crewState ? B.crewState() : null;
    if (simple) { if (!s.seat) { this.line(B, sum, rows, crew); this.gauges(sum); } }
    else if (s.seat) this.strip(B, sum, s);
    else if (panels) { this.defences(sum, rows, s); this.crewPanel(crew, rows, sum); this.weapons(B, sum, rows); this.enemy(B, sum, s); }
  }

  // ---- what is in the air, nearest first. The crew is warned only of what the sensors have picked up; with fog of war off
  // (spectator) the rest is listed too, marked as not yet seen.
  threatList(s) {
    const out = [], T = s.shown, now = s.battle.t, v = s.battle.volleys[s.battle.volleys.length - 1], tv = v ? (s.now == null ? now : s.now) - v.t0 : 0;
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
  defences(sum, rows, s) {
    const n = this.n, M = this.max, hk = rows.find(r => r[0] === 'HKOI'), tracks = s.volleys.info.filter(m => m.tracked).length, tot = sum.apsL + sum.apsR;
    this.put(n.hkoi.mid, sum.alive ? (hk ? hk[1] : '-') : 'vehicle destroyed', 'm');
    this.put(n.obs.v, sum.obs, sum.obs === 0 ? 'bad' : sum.obs < 40 ? 'warn' : ''); this.width(n.obs.fill, sum.obs / M.obs);
    this.put(n.he.v, sum.he, sum.he === 0 ? 'bad' : sum.he < 40 ? 'warn' : ''); this.width(n.he.fill, sum.he / M.he);
    this.put(n.aps.v, `L ${sum.apsL}  R ${sum.apsR}`, tot === 0 ? 'bad' : tot < 3 ? 'warn' : '');
    const psig = sum.apsL + ',' + sum.apsR; if (n.aps._p !== psig) { n.aps._p = psig; const p = n.aps.mid; p.textContent = '';
      for (let i = 0; i < M.aps; i++) p.append(this.el('i', i < sum.apsL ? 'on' : null)); p.append(this.el('u')); for (let i = 0; i < M.aps; i++) p.append(this.el('i', i < sum.apsR ? 'on' : null)); }
    this.put(n.radar.mid, tracks ? `tracking ${tracks}` : 'no tracks', 'm' + (tracks ? ' hk' : ''));
    this.put(n.defNote, tot === 0 ? 'Trophy empty' : sum.obs === 0 ? 'no obscurant' : '', 'bad');
  }
  crewPanel(crew, rows, sum) {
    const n = this.n, cdr = rows.find(r => r[0] === 'CDR');
    this.put(n.orders.mid, cdr ? cdr[1] : sum.alive ? '-' : 'vehicle destroyed', 'm'); n.orders.mid.title = cdr ? cdr[1] : '';
    if (!crew) return;
    this.put(n.crewNote, !crew.on ? 'stress off' : crew.quality + (crew.abandoned ? ', left the vehicle' : crew.buttoned ? ', buttoned up' : ', hatches open'), crew.abandoned ? 'bad' : '');
    let worst = null;
    for (const r of ['cdr', 'gnr', 'ldr', 'drv']) {
      const m = crew.who[r], x = n.men[r], down = m.status === 'down', k = down ? 3 : Math.max(0, STATES.indexOf(m.state)), word = down ? 'out of action' : m.state + (m.status === 'wounded' ? ', wounded' : '');
      this.put(x.v, word, 's' + k); if (x.dot._c !== 's' + k) { x.dot._c = 's' + k; x.dot.className = 's' + k; }
      this.width(x.fill, down ? 0 : m.stress); if (x.fill._c !== 's' + k) { x.fill._c = 's' + k; x.fill.className = 's' + k; }
      const tip = down ? (m.busy || 'out of action') : `stress ${Math.round(m.stress * 100)}%` + (m.busy ? ', ' + m.busy : '') + (m.why ? ': ' + m.why : ''); if (x.r.title !== tip) x.r.title = tip;
      if (this.crewWas[r] !== undefined && this.crewWas[r] !== word) this.crewLast = r; this.crewWas[r] = word;
      if (!down && k > 0 && (!worst || m.stress > crew.who[worst].stress)) worst = r;
    }
    const who = this.crewLast || worst, m = who && crew.who[who];   /* the reason is shown for one man only: the one who changed most recently */
    this.put(n.why, !crew.on ? 'The crew never tires or breaks.' : m && (m.why || m.busy) ? `${m.name}: ${m.status === 'down' ? (m.busy || 'out of action') : (m.why || m.busy)}` : 'All steady.', 'why');
  }
  weapons(B, sum, rows) {
    const n = this.n, split = (key, node) => {   /* "target · 18 MP rounds, loading" becomes the target or state in the middle and the rounds at the right */
      const r = rows.find(x => x[0] === key); if (!r) { this.put(node.mid, sum.alive ? '-' : 'vehicle destroyed', 'm'); this.put(node.v, ''); return; }
      const parts = String(r[1]).split(' · '), last = parts.length > 1 ? parts.pop() : '', num = (last.match(/\d+/) || [''])[0], extra = /loading/.test(last) ? ', loading' : '';
      this.put(node.mid, parts.join(' · ') + extra, 'm'); node.mid.title = r[1]; this.put(node.v, num, num === '0' ? 'bad' : '');
    };
    split('MAIN', n.main); split('.50', n.m2); split('M240', n.m240);
    const g = B._mg, coax = g && (g.w === 'coax' || g.coax) && B.t < g.t + g.dur;
    this.put(n.coax.mid, !sum.alive ? 'vehicle destroyed' : coax ? `firing at a team, ${Math.round(g.R / 10) * 10} m` : 'ready', 'm'); this.put(n.coax.v, sum.coax == null ? '' : sum.coax, sum.coax === 0 ? 'bad' : '');
  }
  enemy(B, sum, s) {
    const n = this.n, T = s.shown; let known = 0, dead = 0, near = null, nd = 1e9;
    for (const u of B.units) { if (!u.alive) { dead++; continue; } if (u.gone || !u.known) continue; known++; const d = Math.hypot(u.e - T.e, u.n - T.n); if (d < nd) { nd = d; near = u; } }
    this.put(n.group.mid, sum.waves > 1 ? `${sum.wave} of ${sum.waves}` + (B.waveAt != null ? ', beaten: lull' : '') : 'one group', 'm');
    this.put(n.teams.mid, `${known} located, ${dead} destroyed` + (s.spectator ? `, ${B.units.filter(u => u.alive && !u.gone).length} alive` : ''), 'm');
    this.put(n.near.mid, near ? `${near.spec.name}, ${Math.round(nd / 10) * 10} m, ${brg3(Math.atan2(near.e - T.e, near.n - T.n) * 180 / Math.PI)}°` : 'none located', 'm');
    this.put(n.fired.mid, `${sum.fired}, ${sum.hits} hit${sum.hits === 1 ? '' : 's'}`, 'm' + (sum.hits ? ' bad' : ''));
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
