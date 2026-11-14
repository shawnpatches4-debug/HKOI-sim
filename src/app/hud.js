// What is written on the screen during a battle, in two displays:
//   SIMPLE    a slim status line, two small gauges (HKOI rounds, Trophy charges), a warning with a bearing while
//             something is inbound, and the crew's words as subtitles;
//   ENGINEER  everything: each crewman's state and the reason, the weapons, a line per threat in the air, and (in a
//             seat) one thin strip so the interior stays visible.
// The status chips, the event log and the control bar belong to main.js; this module owns the boxes listed above.
// It only reads the battle; it changes nothing in it. Boxes are rewritten only when their text changes.

const ROLE = { CDR: 'Commander', GNR: 'Gunner', LDR: 'Loader', DRV: 'Driver' };
const WEAPON = { kornet: 'Kornet missile', saclos: 'Konkurs missile', rpg: 'RPG rocket', sal: 'Laser-guided missile', fpv: 'FPV drone', fpv_fiber: 'Fibre FPV drone' };
const STATE_CLASS = { steady: 's0', strained: 's1', shaken: 's2', panicked: 's3' };
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const brg3 = d => String(Math.round(((d % 360) + 360) % 360) % 360).padStart(3, '0');
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export class Hud {
  // $: element by id, el: element maker (tag, class, text)
  constructor($, el) {
    this.$ = $; this.el = el;
    this.sig = {};               // last text written to each box
    this.tSlow = 0; this.tFast = 0;
    this.max = { obs: 150, he: 150, aps: 4 };
    this.rate = new WeakMap();   // per threat: last range and time, for the time to impact
    this.said = 0;               // how many spoken crew lines have been shown
    this.subUntil = 0;
  }
  // a new battle: forget what was shown, take the full magazines as the gauges' 100%
  reset(battle, sound) {
    this.sig = {}; this.rate = new WeakMap(); this.tSlow = 0; this.tFast = 0;
    const st = battle.tank.st || {};
    this.max = { obs: Math.max(1, st.obs || 150), he: Math.max(1, st.he || 150), aps: Math.max(1, st.apsL || 0, st.apsR || 0) };
    this.said = sound && sound.icom ? sound.icom.said.length : 0;
    this.$('subs').style.opacity = 0;
  }
  _put(id, sig, build) { if (this.sig[id] === sig) return; this.sig[id] = sig; const box = this.$(id); box.textContent = ''; build(box); }
  _show(id, on) { const e = this.$(id); if (e.hidden === on) e.hidden = !on; }

  // s: { on, mode: 'simple' | 'engineer', seat, sight, battle, volleys, shown: { e, n, h }, spectator, sound, fps, frameMs }
  update(dt, s) {
    const simple = s.mode === 'simple', on = s.on;
    this._show('sline', on && simple && !s.seat);
    this._show('gauges', on && simple && !s.seat);
    this._show('engleft', on && !simple && !s.seat && !s.sight);
    this._show('engright', on && !simple && !s.seat);
    this._show('strip', on && !simple && s.seat);
    if (!on) { this._show('warn', false); return; }
    this.subtitles(s);
    this.tFast -= dt; this.tSlow -= dt;
    if (this.tFast <= 0) {
      this.tFast = 0.12;
      const list = this.threatList(s);
      if (simple) this.warning(list); else { this._show('warn', false); if (!s.seat) this.threats(list, s); }
    }
    if (this.tSlow > 0) return;
    this.tSlow = 0.3;
    const B = s.battle, sum = B.summary(), rows = B.tankStatus ? B.tankStatus() : [], crew = B.crewState ? B.crewState() : null;
    if (simple) { if (!s.seat) { this.line(B, sum, rows, crew); this.gauges(sum); } }
    else if (s.seat) this.strip(B, sum, s);
    else if (!s.sight) { this.crewBox(B, crew); this.weapons(rows); }
  }

  // ---- what is in the air, nearest first. The crew is warned only of what the sensors have picked up; with fog of war off
  // (spectator) the rest is listed too, marked as not yet seen.
  threatList(s) {
    const out = [], T = s.shown, now = s.battle.t;
    for (const m of s.volleys.info) {
      if (!m.cued && !s.spectator) continue;
      const brg = Math.atan2(m.p.x - T.e, -m.p.z - T.n) * 180 / Math.PI, rel = ((brg - T.h) % 360 + 360) % 360;
      let r = this.rate.get(m.th), tti = null;
      if (!r) { r = { R: m.range, t: now, v: 0 }; this.rate.set(m.th, r); }
      else if (now - r.t > 0.25) { r.v = (r.R - m.range) / (now - r.t); r.R = m.range; r.t = now; }
      if (r.v > 5) tti = m.range / r.v;
      out.push({ name: (m.th && WEAPON[m.th.key]) || (m.tt && (m.tt.short || m.tt.name)) || (m.drone ? 'Drone' : 'Missile'), range: m.range, brg, hour: Math.round(rel / 30) % 12 || 12, cued: m.cued, tracked: m.tracked, drone: m.drone, tti });
    }
    return out.sort((a, b) => a.range - b.range);
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
    hk.className = hkCls; hk.children[1].textContent = `${sum.obs} + ${sum.he}`; hk.title = 'HKOI rounds left: obscurant + high explosive';
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

  // ---- engineer display
  crewBox(B, crew) {
    if (!crew) { this._put('crewmen', 'none', box => box.append(this.el('h3', null, 'Crew'))); return; }
    const rows = [];
    if (!crew.on) rows.push(['', 'stress model off: the crew never tires or breaks', '', '']);
    else for (const [r, m] of Object.entries(crew.who)) {
      const down = m.status === 'down';
      rows.push([r.toUpperCase(), down ? (m.busy || 'out of action') : `${m.state} ${Math.round(m.stress * 100)}%`, down ? 'down' : STATE_CLASS[m.state] || 's0',
        down ? '' : (m.status === 'wounded' ? ' · wounded' : '') + (m.busy ? ' · ' + m.busy : '') + (m.why ? ' · ' + m.why : '')]);
    }
    const head = 'Crew' + (crew.on ? ` · ${crew.quality}` + (crew.abandoned ? ' · has left the vehicle' : crew.buttoned ? ' · buttoned up' : ' · hatches open') : '');
    this._put('crewmen', head + rows.map(r => r.join(':')).join('|'), box => {
      box.append(this.el('h3', null, head));
      for (const [who, state, cls, rest] of rows) { const d = this.el('div'); if (who) d.append(this.el('b', null, who)); d.append(this.el('i', cls || null, state), rest); box.append(d); }
    });
  }
  weapons(rows) {
    this._put('crew', rows.map(r => r.join(':')).join('|'), box => {
      box.append(this.el('h3', null, 'Weapons and orders'));
      for (const [who, text] of rows) { const d = this.el('div'); d.append(this.el('b', null, who), text); box.append(d); }
    });
  }
  threats(list, s) {
    const sig = list.map(x => `${x.name},${Math.round(x.range / 10)},${Math.round(x.brg)},${x.cued},${x.tracked},${x.tti == null ? '' : x.tti.toFixed(1)}`).join('|') || 'none';
    this._put('threats', sig, box => {
      box.append(this.el('h3', null, list.length ? `In the air: ${list.length}` : 'In the air: nothing'));
      for (const x of list) {
        const d = this.el('div', x.tracked ? 'trk' : x.cued ? null : 'unk');
        d.append(this.el('b', null, x.name), this.el('span', null, `${(x.range / 1000).toFixed(2)} km`), this.el('span', null, `brg ${brg3(x.brg)}`), this.el('span', null, x.tracked ? 'tracked' : x.cued ? 'cued' : 'not seen'));
        if (x.tti != null) d.lastChild.textContent += ` ${x.tti.toFixed(1)} s`;
        box.append(d);
      }
    });
  }
  // inside a seat the engineer display shrinks to one line
  strip(B, sum, s) {
    const down = Object.values(sum.crew || {}).filter(x => x !== 'ok').length;
    const parts = [['T+', clock(B.t)], ['OBS', sum.obs], ['HE', sum.he], ['TROPHY', `L${sum.apsL} R${sum.apsR}`], ['CREW', `${4 - down}/4`], ['INCOMING', `${sum.fired} fired, ${sum.hits} hit`], ['IN THE AIR', s.volleys.info.filter(m => m.cued || s.spectator).length], ['FRAME', `${s.frameMs.toFixed(1)} ms`]];
    this._put('strip', parts.map(p => p.join(' ')).join('|'), box => { parts.forEach(([k, v], i) => { box.append((i ? '   ' : '') + k + ' ', this.el('b', null, String(v))); }); });
  }
}
