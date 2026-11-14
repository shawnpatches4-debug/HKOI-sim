// Commander view: the map as the ENEMY commander sees it, drawn like a staff officer's overlay.
//   his own position, every team and vehicle of his with a tactical symbol and what it is doing,
//   an arrow for every standing order (styled by the kind of order, with a label and a time of arrival that counts down),
//   where he believes the tank is (with a circle for how unsure he is, fading as the report goes stale),
//   and where he expects it to go (a broken line and his reason).
// In spectator mode only, the true tank is drawn too, with a thin line showing how far off his picture is, and wrong orders are flagged.
// With fog of war on, the true tank is never drawn here.
//
// Everything shown comes from battle.commander() (src/battle/enemycdr.js), battle.units and battle.vehicles(). Nothing is worked out
// here except how to draw it. If the battle has no commander the view says so and draws nothing else.
// Used by MapView (mapview.js), which owns the canvas, the pan and zoom, and the base map.

const DEG = Math.PI / 180;
const CSS = `
  #map.cdr #maplegend { display: none; }
  #cdr-list { position: absolute; left: 12px; top: 66px; width: min(310px, calc(100vw - 24px)); max-height: calc(100vh - 150px); overflow: auto; padding: 8px; font-size: 12px; }
  #cdr-list[hidden] { display: none; }
  #cdr-list h3 { margin: 0 0 4px 2px; font: 11px/1.2 var(--mono); color: var(--dim); letter-spacing: .1em; text-transform: uppercase; font-weight: 400; }
  #cdr-list .cdr-head { margin: 0 2px 8px; line-height: 1.45; } #cdr-list .cdr-head b { color: #ffb4aa; font-weight: 600; } #cdr-list .cdr-head .bad { color: var(--bad, #ff6b5e); }
  #cdr-rows { display: flex; flex-direction: column; gap: 4px; }
  .btn.cdr-row { text-align: left; white-space: normal; padding: 5px 8px; display: grid; grid-template-columns: 58px 1fr auto; gap: 2px 8px; align-items: baseline; font-size: 12px; }
  .cdr-row i { font-style: normal; font: 600 10px var(--mono); letter-spacing: .06em; text-transform: uppercase; color: #ffb4aa; } .cdr-row em { font-style: normal; font: 11px var(--mono); color: var(--dim); white-space: nowrap; }
  .cdr-row.done { opacity: .5; } .cdr-row .wrong { grid-column: 2 / 4; color: #ffb020; font-size: 11px; }
  #map-cdrkey[hidden] { display: none; }
  #cdr-none { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 14px 20px; font-size: 15px; } #cdr-none[hidden] { display: none; }
`;
const KIND = { watch: 'Watch', hold_fire: 'Hold fire', strike: 'Strike', relocate: 'Move', fix: 'Fix', commit: 'Commit', break: 'Break' };
const INK = { own: '#c62419', ownDark: '#5a0d08', ride: '#9a4a00', strike: '#8a0f0a', fix: '#6a2c91', brk: '#44556b', believed: '#1746c9', truth: '#12a15f', wrong: '#e08a00', paper: 'rgba(250,246,230,.92)' };
// how fast things ease, per second (the same result at any frame rate: each step moves by 1 - exp(-rate * dt))
const EASE_POS = 5, EASE_IN = 4, EASE_OUT = 3;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const ago = s => s < 120 ? Math.round(s) + ' s' : Math.round(s / 60) + ' min';
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window: not remembered */ } } };

// which symbol a team or vehicle gets
function symbolOf(kind) {
  if (kind === 'rpg') return 'rocket';
  if (kind === 'fpv' || kind === 'fpv_fiber') return 'drone';
  if (kind === 'bmp2' || kind === 'bmp' || kind === 'ifv') return 'bmp';
  if (kind === 't72' || kind === 't90' || kind === 'tank') return 'tank';
  if (kind === 'uaz' || kind === 'light' || kind === 'truck') return 'light';
  return 'missile';
}
// Who an order or a sector is for: { uid } or { vid }, or a bare id (under 100 a team, 100 and up a vehicle). 'all' gives null.
function refKey(r) {
  if (r == null || r === 'all') return null;
  if (typeof r === 'object') return r.uid != null ? 'u' + r.uid : r.vid != null ? 'v' + r.vid : null;
  return +r >= 100 ? 'v' + r : 'u' + r;
}
const shortName = n => String(n).replace(/ (team|crew)\b/i, '').replace(' #', ' ');
// an order in words: his own text, with the name of who it is for in front when the text does not say
function orderText(o, who) {
  const short = String(who).replace(/ #(\d+)$/, ' $1'), t = o.text ? String(o.text) : (KIND[o.kind] || o.kind).toLowerCase();
  const names = t.toLowerCase(), w = short.toLowerCase().replace(/ \d+$/, '');
  return names.includes(w) || names.includes('all teams') ? t : `${short}: ${t}`;
}
// his hold on the teams' fire, in one line (optional field: older battles do not have it)
function fireText(f) {
  if (!f || !f.state) return '';
  if (f.state === 'ambush_hold') return 'Holding the ambush' + (f.want ? `: ${f.ready || 0} of ${f.want} ready.` : '.');
  if (f.state === 'salvo_hold') return 'Holding for a salvo' + (f.want ? `: ${f.ready || 0} of ${f.want} ready.` : '.');
  return f.state === 'free' ? 'Teams are free to fire.' : '';
}
// how his belief of the tank's position came about, in plain words
function sourceText(src, age) {
  if (src === 'plan') return 'the ambush was laid for this spot, nothing seen yet';
  if (src === 'sound') return `heard the gun ${ago(age)} ago`;
  return `reported ${ago(age)} ago`;
}

export class CommanderView {
  constructor(map) {
    this.map = map; this.on = !!store.get('hkoi.cdrview', false); this.sel = null;
    this.anim = new Map();      /* order id -> eased arrow: { a, g, sx, sn, dx, dn, o, live } */
    this.pos = new Map();       /* 'u3' / 'v1' -> eased position { e, n } */
    this.bel = null;            /* eased believed position of the tank { e, n, r, a } */
    this.lastT = null; this.listSig = ''; this.headSig = ''; this.eta = new Map(); this.labels = [];
    this.keyOpen = !!store.get('hkoi.cdrkey', false);   /* the key to the symbols: closed until asked for */
    this.mouse = null; this.hover = null;               /* the team or vehicle under the pointer: its label is given in full */
    this._dom();
  }

  _dom() {
    const host = this.map.cv.parentElement; if (!host) return;
    if (!document.getElementById('cdr-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'cdr-css', textContent: CSS }));
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    this.host = host;
    this.btn = mk('button', 'btn', 'Commander view'); this.btn.id = 'map-cdr'; this.btn.title = 'The map as the enemy commander sees it: his teams, his orders, where he thinks the tank is and where he expects it to go';
    this.btn.onclick = () => this.setOn(!this.on);
    this.keyBtn = mk('button', 'btn', 'Key'); this.keyBtn.id = 'map-cdrkey'; this.keyBtn.title = 'What the symbols and arrows of the commander view mean'; this.keyBtn.hidden = true;
    this.keyBtn.onclick = () => { this.keyOpen = !this.keyOpen; store.set('hkoi.cdrkey', this.keyOpen); this._show(); };
    this.map.cv.addEventListener('pointermove', e => { const r = this.map.cv.getBoundingClientRect(), k = this.map.cv.width / (r.width || 1); this.mouse = [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; });
    this.map.cv.addEventListener('pointerleave', () => { this.mouse = null; });
    const top = host.querySelector('#maptop'), before = host.querySelector('#map-place') || host.querySelector('#map-fit');
    { const ref = before && before.parentElement === top ? before : null; if (top) { top.insertBefore(this.btn, ref); top.insertBefore(this.keyBtn, ref); } else host.append(this.btn, this.keyBtn); }
    this.list = mk('div', 'panel'); this.list.id = 'cdr-list'; this.list.hidden = true;
    this.head = mk('div', 'cdr-head'); this.rows = mk('div'); this.rows.id = 'cdr-rows';
    this.list.append(mk('h3', '', 'Enemy commander'), this.head, mk('h3', '', 'His standing orders, newest first'), this.rows);
    this.none = mk('div', 'panel', 'No enemy commander in this battle'); this.none.id = 'cdr-none'; this.none.hidden = true;
    host.append(this.list, this.none); this._show();
  }
  setOn(v) { this.on = !!v; store.set('hkoi.cdrview', this.on); this.lastT = null; this.seenAt = 0; this._show(); }
  _show() { if (!this.host) return; this.host.classList.toggle('cdr', this.on); this.btn.classList.toggle('on', this.on); this.keyBtn.hidden = !this.on; this.keyBtn.classList.toggle('on', this.keyOpen); if (!this.on) { this.list.hidden = true; this.none.hidden = true; } }

  // the commander's record for this moment, or null
  _read(battle) { try { return battle && typeof battle.commander === 'function' ? battle.commander() || null : null; } catch (e) { return null; } }

  // every team and vehicle of his, in one list
  _forces(battle, C) {
    const out = [], cdrKey = C.with ? refKey(C.with) : null;
    for (const u of battle.units || []) {
      if (u.gone) continue;
      let doing = ''; try { doing = battle.intentOf ? battle.intentOf(u) : (u.state || ''); } catch (e) { doing = u.state || ''; }
      const k = 'u' + u.id; out.push({ key: k, sym: symbolOf(u.spec && u.spec.key || u.type), name: `${u.spec ? u.spec.name : 'Team'} #${u.id + 1}`, e: u.e, n: u.n, alive: !!u.alive, doing: u.alive ? doing : 'destroyed', riding: u.mounted ? 'v' + u.rideId : null, cdr: k === cdrKey });
    }
    let V = []; try { V = typeof battle.vehicles === 'function' ? battle.vehicles() || [] : []; } catch (e) { V = []; }
    for (const v of V) { const k = 'v' + v.id; out.push({ key: k, sym: symbolOf(v.kind), name: v.name || String(v.kind).toUpperCase(), e: v.e, n: v.n, alive: v.alive !== false && v.state !== 'burning' && v.state !== 'abandoned', doing: v.alive === false ? (v.state === 'abandoned' ? 'abandoned' : 'destroyed') : v.intent || v.state || '', riding: null, cdr: k === cdrKey, hull: v.hull }); }
    return out;
  }

  // Draw the overlay. x: canvas context, st: { battle, t, dt, showAll (spectator) }, dpr: device pixels per CSS pixel.
  draw(x, st, dpr) {
    const battle = st.battle, C = this._read(battle), t = st.t != null ? st.t : battle ? battle.t : 0;
    if (!C) { if (this.none.hidden) this.none.hidden = false; if (!this.list.hidden) this.list.hidden = true; this.anim.clear(); this.pos.clear(); this.bel = null; this.lastT = null; return; }
    if (!this.none.hidden) this.none.hidden = true; if (this.list.hidden) this.list.hidden = false;
    // a jump in time (rewind, scrubbing a replay, a new battle): nothing eases across it
    const jump = this.lastT == null || t < this.lastT - 0.05 || t > this.lastT + 3 || this.battle !== battle; this.battle = battle; this.lastT = t;
    const dt = jump ? 1e3 : Math.max(0, st.dt || 0), kp = 1 - Math.exp(-EASE_POS * dt), ki = 1 - Math.exp(-EASE_IN * dt), ko = 1 - Math.exp(-EASE_OUT * dt);
    if (jump) { this.anim.clear(); this.pos.clear(); this.bel = null; }
    const F = this._forces(battle, C), spectator = !!st.showAll, M = this.map, P = (e, n) => M.toScreen(e, n);
    // When the view comes up (the button, or the map opened with the view already on) the map closes in on his forces and his
    // picture of the tank, clear of the list on the left. "Whole map" still shows everything.
    if (!this.seenAt) { this.seenAt = 1; if (st.fit !== false) this._fit(F, C, spectator ? st.tank : null, dpr); }

    // Positions ease toward where the battle has them (it moves them in steps). Every eased value first moves toward the target it
    // had LAST frame for this frame's time, and only then takes the new target: so a change is followed from the frame it was seen in,
    // and the result does not depend on how long the frames are.
    const byKey = new Map();
    for (const f of F) { let p = this.pos.get(f.key); if (!p) { p = { e: f.e, n: f.n, te: f.e, tn: f.n }; this.pos.set(f.key, p); } p.e += (p.te - p.e) * kp; p.n += (p.tn - p.n) * kp; p.te = f.e; p.tn = f.n; f.pe = p.e; f.pn = p.n; byKey.set(f.key, f); }
    for (const f of F) if (f.riding && byKey.has(f.riding)) { const v = byKey.get(f.riding); f.pe = v.pe; f.pn = v.pn; }

    // orders: each has an eased arrow that grows out when the order is given and fades when it is done or withdrawn
    const plan = Array.isArray(C.plan) ? C.plan : [], lost = C.alive === false || C.radio === false;
    for (const [id, a] of this.anim) {   /* this frame's step, toward last frame's targets */
      if (a.live) { a.a += (1 - a.a) * ki; a.g += (1 - a.g) * ki; } else { a.a += (0 - a.a) * ko; if (a.a < 0.02) { this.anim.delete(id); continue; } }
      a.sx += (a.tsx - a.sx) * kp; a.sn += (a.tsn - a.sn) * kp; a.dx += (a.tdx - a.dx) * kp; a.dn += (a.tdn - a.dn) * kp; a.live = false; }
    for (const o of plan) {              /* this frame's targets */
      const id = String(o.id), who = byKey.get(refKey(o.to)), src = who ? [who.pe, who.pn] : o.to === 'all' && C.e != null ? [C.e, C.n] : (o.from || [C.e, C.n]), dst = o.dest || src;
      let a = this.anim.get(id); if (!a) { if (o.done && !jump) continue; a = { a: jump && !o.done ? 1 : 0, g: jump ? 1 : 0, sx: src[0], sn: src[1], dx: dst[0], dn: dst[1] }; this.anim.set(id, a); }
      a.o = o; a.who = who; a.live = !o.done; a.tsx = src[0]; a.tsn = src[1]; a.tdx = dst[0]; a.tdn = dst[1];
    }
    if (jump) for (const [id, a] of this.anim) if (!a.live) this.anim.delete(id);

    // his picture of the tank eases too, so a new report slides the marker instead of jumping it
    const pic = C.picture;
    if (pic) { const age = !lost && pic.t != null ? Math.max(0, t - pic.t) : (pic.age || 0), fresh = Math.max(0.32, 1 - Math.max(0, age - 30) / 220); if (!this.bel) this.bel = { e: pic.e, n: pic.n, r: pic.r_m || 0, a: fresh, te: pic.e, tn: pic.n, tr: pic.r_m || 0, ta: fresh };
      const b = this.bel; b.e += (b.te - b.e) * kp; b.n += (b.tn - b.n) * kp; b.r += (b.tr - b.r) * kp; b.a += (b.ta - b.a) * kp; b.te = pic.e; b.tn = pic.n; b.tr = pic.r_m || 0; b.ta = fresh; b.age = age; } else this.bel = null;

    this.labels.length = 0; x.save(); x.lineCap = x.lineJoin = 'round';
    this.hover = null; if (this.mouse) { let bd = 24 * dpr; for (const f of F) { const [a, b] = P(f.pe, f.pn), d = Math.hypot(a - this.mouse[0], b - this.mouse[1]); if (d < bd) { bd = d; this.hover = f.key; } } }
    this.newest = new Set(plan.filter(o => !o.done).sort((p, q) => (q.t_order || 0) - (p.t_order || 0)).slice(0, 3).map(o => String(o.id)));
    this._sectors(x, C, byKey, P, dpr);
    const sel = this.sel != null && this.anim.has(String(this.sel)) ? String(this.sel) : null;
    for (const [id, a] of this.anim) if (id !== sel) this._order(x, a, C, byKey, t, P, dpr, sel ? 0.45 : 1, false, spectator);
    if (sel) this._order(x, this.anim.get(sel), C, byKey, t, P, dpr, 1, true, spectator);
    this._belief(x, C, st, t, P, dpr, spectator);   /* after the arrows, so his mark for the tank is never buried under them */
    for (const f of F) { if (f.riding && byKey.has(f.riding)) continue; const [a, b] = P(f.pe, f.pn), held = plan.some(o => !o.done && o.kind === 'hold_fire' && (o.to === 'all' ? f.key[0] === 'u' : refKey(o.to) === f.key)), riders = F.filter(q => q.riding === f.key).map(q => q.name);
      this._symbol(x, a, b, f.sym, dpr, { dead: !f.alive || f.cdr && C.alive === false, cdr: f.cdr, hold: held });
      // a short tag under each symbol (dropped where it would sit on another label); the full line only for the one under the pointer
      if (f.key === this.hover) this._label(a, b + 17 * dpr, f.name + (f.doing ? ' · ' + String(f.doing).split(':')[0] : '') + (riders.length ? ' · carrying ' + riders.join(', ') : ''), '#ffffff', 3);
      else if (f.alive) this._label(a, b + 17 * dpr, shortName(f.name), '#ffd9d3', 0); }
    if (!C.with && C.e != null) { const [a, b] = P(C.e, C.n); this._symbol(x, a, b, 'cdr', dpr, { dead: C.alive === false, cdr: true }); this._label(a, b + 15 * dpr, 'Commander' + (C.alive === false ? ' · killed' : C.radio === false ? ' · radio out' : ''), '#ffd9d3', 0); }
    if (lost) { const cv = this.map.cv; this._banner(x, cv.width / 2, 78 * dpr, C.alive === false ? 'Commander lost: teams act on their own' : 'Commander has lost his radio: teams act on their own', dpr); }
    for (const L of (C.intel && C.intel.lost) || []) { const [a, b] = P(L[0], L[1]), r = 5 * dpr; x.strokeStyle = 'rgba(20,20,20,.85)'; x.lineWidth = 2.2 * dpr; x.beginPath(); x.moveTo(a - r, b - r); x.lineTo(a + r, b + r); x.moveTo(a - r, b + r); x.lineTo(a + r, b - r); x.stroke(); }   /* where he knows he lost a team */
    this._labels(x, dpr); if (this.keyOpen) this._legend(x, dpr, spectator); x.restore();
    this._list(C, plan, byKey, t, spectator, battle);
  }

  _fit(F, C, T, dpr) {
    const M = this.map, cv = M.cv, pts = F.filter(f => f.alive).map(f => [f.e, f.n]); if (C.picture) pts.push([C.picture.e, C.picture.n]); if (C.predict && C.predict.to) pts.push(C.predict.to); if (T) pts.push([T.e, T.n]); if (pts.length < 2) return;
    let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity; for (const p of pts) { e0 = Math.min(e0, p[0]); e1 = Math.max(e1, p[0]); n0 = Math.min(n0, p[1]); n1 = Math.max(n1, p[1]); }
    const left = Math.min(340, cv.width / dpr * 0.3), wpx = cv.width / dpr - left - 60, hpx = cv.height / dpr - 70 - 90,   /* clear of the top bar and of the control bar at the bottom */ sc = Math.max(0.02, Math.min(1.2, wpx / Math.max(400, e1 - e0), hpx / Math.max(400, n1 - n0)));
    M.scale = sc; M.k = sc * dpr; M.cx = (e0 + e1) / 2 - (left / 2) / sc; M.cn = (n0 + n1) / 2 - 30 / sc;
    // no empty strip beside the map: where the map is bigger than the window its edge stays at or beyond the window's edge
    // (the list is see-through and may lie over map), and where it is smaller it sits in the middle
    const half = M.world ? M.world.half : 4000, hw = cv.width / dpr / 2 / sc, hh = cv.height / dpr / 2 / sc;
    M.cx = hw - left / sc / 2 >= half ? -left / sc / 2 : Math.max(-half + hw - left / sc, Math.min(half - hw, M.cx));   /* the map's west edge may come in as far as the list's edge, no further */ M.cn = hh >= half ? 0 : Math.max(-half + hh, Math.min(half - hh, M.cn));
  }

  // ------------------------------------------------------------------ pieces of the picture
  _sectors(x, C, byKey, P, dpr) {
    for (const s of C.sectors || []) { const f = byKey.get(refKey(s)); if (!f || !f.alive) continue; const [a, b] = P(f.pe, f.pn); this._fan(x, a, b, s.brg_from, s.brg_to, Math.min(1200 * this.map.k, 150 * dpr), 'rgba(198,36,25,.07)', 'rgba(140,20,12,.45)', 1 * dpr, dpr); }
  }
  _fan(x, a, b, from, to, R, fill, stroke, w, dpr) {
    let span = ((to - from) % 360 + 360) % 360; if (span === 0 && to !== from) span = 360; const a0 = from * DEG - Math.PI / 2, a1 = a0 + span * DEG;
    x.beginPath(); x.moveTo(a, b); x.arc(a, b, R, a0, a1); x.closePath(); x.fillStyle = fill; x.fill(); x.strokeStyle = stroke; x.lineWidth = w; x.setLineDash([5 * dpr, 4 * dpr]); x.stroke(); x.setLineDash([]);
  }

  _belief(x, C, st, t, P, dpr, spectator) {
    const b = this.bel, pic = C.picture, T = st.tank, M = this.map;
    if (b) {
      const [a, c] = P(b.e, b.n), R = Math.max(7 * dpr, b.r * M.k);
      x.globalAlpha = b.a; x.beginPath(); x.arc(a, c, R, 0, 6.283); x.fillStyle = 'rgba(23,70,201,.10)'; x.fill(); x.strokeStyle = INK.believed; x.lineWidth = 2 * dpr; x.setLineDash([7 * dpr, 5 * dpr]); x.stroke(); x.setLineDash([]);
      // the marker: a diamond with the armour oval inside, the way a staff map marks an enemy tank
      x.beginPath(); x.moveTo(a, c - 12 * dpr); x.lineTo(a + 14 * dpr, c); x.lineTo(a, c + 12 * dpr); x.lineTo(a - 14 * dpr, c); x.closePath(); x.fillStyle = 'rgba(235,242,255,.92)'; x.fill(); x.lineWidth = 2.2 * dpr; x.stroke();
      x.beginPath(); x.ellipse(a, c, 6.5 * dpr, 3.6 * dpr, 0, 0, 6.283); x.lineWidth = 1.6 * dpr; x.stroke(); x.globalAlpha = 1;
      this._label(a, c - 22 * dpr, `Tank believed here · ${sourceText(pic.src, b.age)}${b.r ? ' · within about ' + Math.round(b.r / 10) * 10 + ' m' : ''}`, '#cfe0ff', 4);
    } else { const [a, c] = P(C.e != null ? C.e : 0, C.n != null ? C.n : 0); this._label(a, c - 30 * dpr, 'He has no report of the tank', '#cfe0ff', 1); }
    const pr = C.predict;
    if (pr && (pr.path && pr.path.length || pr.to)) {
      const pts = (pr.path && pr.path.length ? pr.path : [b ? [b.e, b.n] : pr.to, pr.to]).map(p => P(p[0], p[1])); if (b && pr.path && pr.path.length) pts[0] = P(b.e, b.n);
      x.globalAlpha = b ? Math.max(0.5, b.a) : 0.8; this._path(x, pts, { w: 2.6 * dpr, col: INK.believed, dash: [9 * dpr, 6 * dpr], head: 11 * dpr, dpr }); x.globalAlpha = 1;
      const end = pts[pts.length - 1];
      if (pr.r_m > 0) { x.globalAlpha = b ? Math.max(0.4, b.a * 0.8) : 0.6; x.beginPath(); x.arc(end[0], end[1], Math.max(5 * dpr, pr.r_m * M.k), 0, 6.283); x.fillStyle = 'rgba(23,70,201,.07)'; x.fill(); x.strokeStyle = INK.believed; x.lineWidth = 1.4 * dpr; x.setLineDash([3 * dpr, 5 * dpr]); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }   /* the forecast widens: how unsure he is of where it will be */
      const near = b ? Math.hypot(end[0] - P(b.e, b.n)[0], end[1] - P(b.e, b.n)[1]) < 40 * dpr : false;   /* a forecast of "stays where it is" is said in the list, not written on top of his mark for the tank */
      if (!near) this._label(end[0], end[1] + 14 * dpr, (pr.kind === 'staying' ? 'He expects it to stay' : 'He expects it here') + (pr.eta_s > 0 && pr.kind !== 'staying' ? ' in about ' + ago(pr.eta_s) : '') + (pr.why ? ': ' + pr.why : ''), '#cfe0ff', 2);
    }
    // the truth, for the spectator only
    if (spectator && T) {
      const [a, c] = P(T.e, T.n), h = (T.h || 0) * DEG;
      if (b) { const [p, q] = P(b.e, b.n), off = Math.hypot(T.e - b.e, T.n - b.n); x.strokeStyle = 'rgba(10,10,10,.75)'; x.lineWidth = 1.2 * dpr; x.setLineDash([3 * dpr, 3 * dpr]); x.beginPath(); x.moveTo(p, q); x.lineTo(a, c); x.stroke(); x.setLineDash([]); }
      x.save(); x.translate(a, c); x.rotate(h); x.fillStyle = '#39d98a'; x.strokeStyle = '#03130b'; x.lineWidth = 1.5 * dpr; x.beginPath(); x.moveTo(0, -11 * dpr); x.lineTo(7 * dpr, 8 * dpr); x.lineTo(0, 4 * dpr); x.lineTo(-7 * dpr, 8 * dpr); x.closePath(); x.fill(); x.stroke(); x.restore();
      const off = b ? Math.hypot(T.e - b.e, T.n - b.n) : null;
      this._label(a, c + 16 * dpr, 'Tank (true position)' + (off != null ? ` · his picture is ${Math.round(off)} m off` : ''), off != null && off > Math.max(150, b.r) ? '#ffcf70' : '#c8f5dd', 5);
    }
  }
  _nameOf(ref) { const k = refKey(ref), B = this.battle; if (!k || !B) return null; if (k[0] === 'u') { const u = (B.units || []).find(q => q.id === +k.slice(1)); return u ? `${u.spec ? u.spec.name : 'Team'} #${u.id + 1}` : null; } let V = []; try { V = B.vehicles ? B.vehicles() : []; } catch (e) { V = []; } const v = V.find(q => String(q.id) === k.slice(1)); return v ? v.name || String(v.kind).toUpperCase() : null; }

  // one order's arrow and label
  _order(x, a, C, byKey, t, P, dpr, dim, picked, spectator) {
    const o = a.o, M = this.map, kind = o.kind, alpha = clamp01(a.a) * dim, s = [a.sx, a.sn], d = [a.dx, a.dn];
    if (alpha <= 0.01) return;
    const w0 = (picked ? 5.2 : 3.6) * dpr, D = Math.hypot(d[0] - s[0], d[1] - s[1]);
    let pts = null, mid = null; x.globalAlpha = alpha;
    if (picked) { const [p, q] = P(s[0], s[1]); x.beginPath(); x.arc(p, q, 20 * dpr, 0, 6.283); x.strokeStyle = '#fff'; x.lineWidth = 2 * dpr; x.stroke(); }
    const mine = refKey(o.to) === this.hover && this.hover != null, loud = picked || mine || this.newest.has(String(o.id));
    if (kind === 'watch') {
      const [p, q] = P(s[0], s[1]), sec = (C.sectors || []).find(z => refKey(z) === refKey(o.to)); if (sec && !loud) { x.globalAlpha = 1; return; }   /* an older order to watch: the thin sector fan already shows it */
      const mb = Math.atan2(d[0] - s[0], d[1] - s[1]) / DEG, from = sec ? sec.brg_from : mb - 20, to = sec ? sec.brg_to : mb + 20, R = Math.min((D > 50 ? D : 1500) * M.k, 260 * dpr) * a.g;
      this._fan(x, p, q, from, to, R, picked ? 'rgba(198,36,25,.26)' : 'rgba(198,36,25,.16)', INK.own, (picked ? 2.6 : 1.8) * dpr, dpr);
      const ang = (from + (((to - from) % 360 + 360) % 360) / 2) * DEG; mid = [p + Math.sin(ang) * R * 0.62, q - Math.cos(ang) * R * 0.62];
    } else if (kind === 'hold_fire') {
      const [p, q] = P(s[0], s[1]); mid = [p, q - 24 * dpr];   /* the mark itself is drawn on the symbol */
    } else if (kind === 'fix') {
      // short pinning arrows: three stubby arrows toward the target, ending in a bar, none of them reaching it
      const L = Math.min(D * 0.38, 420), ue = D ? (d[0] - s[0]) / D : 0, un = D ? (d[1] - s[1]) / D : 1;
      for (const off of [-1, 0, 1]) { const be = s[0] - un * off * 55, bn = s[1] + ue * off * 55, A = P(be + ue * 40, bn + un * 40), B = P(be + ue * (40 + L * a.g), bn + un * (40 + L * a.g)); this._path(x, [A, B], { w: w0 * 0.8, col: INK.fix, head: 9 * dpr, bar: true, dpr }); }
      mid = P(s[0] + ue * (40 + L * 0.5), s[1] + un * (40 + L * 0.5));
    } else {
      // an arrow from where the team is now to where he wants it, along the route when he gave one
      let wp = [s];
      if (o.route && o.route.length > 1) { let best = 0, bd = Infinity; for (let i = 0; i < o.route.length; i++) { const r = o.route[i], dd = (r[0] - s[0]) ** 2 + (r[1] - s[1]) ** 2; if (dd < bd) { bd = dd; best = i; } } for (let i = best + 1; i < o.route.length - 1; i++) wp.push(o.route[i]); }
      wp.push(d); wp = this._grow(wp, a.g); pts = wp.map(p => P(p[0], p[1]));
      const ride = o.by === 'uaz';
      if (kind === 'strike') { this._path(x, pts, { w: w0 * 1.25, col: INK.strike, head: 15 * dpr, taper: true, dpr }); const e = pts[pts.length - 1]; x.strokeStyle = INK.strike; x.lineWidth = 1.6 * dpr; x.beginPath(); x.arc(e[0], e[1], 9 * dpr, 0, 6.283); x.moveTo(e[0] - 14 * dpr, e[1]); x.lineTo(e[0] + 14 * dpr, e[1]); x.moveTo(e[0], e[1] - 14 * dpr); x.lineTo(e[0], e[1] + 14 * dpr); x.stroke(); }
      else if (kind === 'break') this._path(x, pts, { w: w0 * 0.9, col: INK.brk, dash: [10 * dpr, 6 * dpr], head: 12 * dpr, dpr });
      else if (kind === 'commit') this._path(x, pts, { w: w0 * 1.9, col: INK.own, head: 19 * dpr, hollow: true, dpr });
      else if (ride) this._path(x, pts, { w: w0 * 1.5, col: INK.ride, head: 14 * dpr, hollow: true, wheels: true, dpr });
      else this._path(x, pts, { w: w0, col: INK.own, head: 13 * dpr, dpr });
      mid = this._midOf(pts);
    }
    x.globalAlpha = 1;
    if (mid && alpha > 0.3 && loud && !(o.to === 'all' && kind === 'hold_fire' && !picked)) {   /* an order to everyone is marked on every symbol and written in the list */
      const who = a.who ? a.who.name : o.to === 'all' ? 'All teams' : 'Team', left = o.t_eta != null ? o.t_eta - t : null;
      let text = orderText(o, who); if (left != null) text = text.replace(/,?\s*(about\s*)?\d+(\.\d+)?\s*(min|s|sec)\.?$/i, '');
      if (o.done) text += ' · done'; else if (left != null) text += left > 0.5 ? ` · ${o.by === 'uaz' ? 'by UAZ, ' : ''}arrives in ${mmss(left)}` : ' · arriving';
      if (spectator && o.wrong) text += ` · WRONG${o.off_m != null ? ', ' + Math.round(o.off_m) + ' m off' : ''}`;
      this._label(mid[0], mid[1], text, spectator && o.wrong ? '#ffcf70' : picked || mine ? '#ffffff' : '#ffe3df', picked || mine ? 3 : 1);
    }
  }
  // the first share g (0 to 1) of a line of points, by length
  _grow(wp, g) {
    if (g >= 0.995 || wp.length < 2) return wp; let L = 0; for (let i = 1; i < wp.length; i++) L += Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]);
    let left = L * Math.max(0.02, g); const out = [wp[0]];
    for (let i = 1; i < wp.length; i++) { const seg = Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]); if (seg <= left) { out.push(wp[i]); left -= seg; } else { const f = seg ? left / seg : 0; out.push([wp[i - 1][0] + (wp[i][0] - wp[i - 1][0]) * f, wp[i - 1][1] + (wp[i][1] - wp[i - 1][1]) * f]); break; } }
    return out;
  }
  _midOf(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); let h = L / 2; for (let i = 1; i < pts.length; i++) { const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (seg >= h) { const f = seg ? h / seg : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; } h -= seg; } return pts[pts.length - 1]; }

  // A line of screen points ending in an arrow head. o: { w, col, dash, head, hollow (a wide outlined arrow), taper, bar (a bar across the tip), wheels }
  _path(x, pts, o) {
    if (pts.length < 2) return; const n = pts.length, e = pts[n - 1]; let p = pts[n - 2], L = Math.hypot(e[0] - p[0], e[1] - p[1]);
    for (let i = n - 3; i >= 0 && L < 2; i--) { p = pts[i]; L = Math.hypot(e[0] - p[0], e[1] - p[1]); } if (L < 0.5) return;
    const ux = (e[0] - p[0]) / L, uy = (e[1] - p[1]) / L, hd = Math.min(o.head || 0, L * 0.9), bx = e[0] - ux * hd, by = e[1] - uy * hd, hw = hd * 0.55;
    const line = (w, col) => { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n - 1; i++) x.lineTo(pts[i][0], pts[i][1]); x.lineTo(bx, by); x.strokeStyle = col; x.lineWidth = w; x.stroke(); };
    const tip = (grow, col, fill) => { const g = grow; x.beginPath(); x.moveTo(e[0] + ux * g, e[1] + uy * g); x.lineTo(bx - uy * (hw + g) - ux * g * 0.5, by + ux * (hw + g) - uy * g * 0.5); x.lineTo(bx + uy * (hw + g) - ux * g * 0.5, by - ux * (hw + g) - uy * g * 0.5); x.closePath(); if (fill) { x.fillStyle = col; x.fill(); } else { x.strokeStyle = col; x.lineWidth = g; x.stroke(); } };
    if (o.dash) x.setLineDash(o.dash);
    if (o.hollow) { line(o.w + 3 * o.dpr, 'rgba(20,8,6,.8)'); line(o.w, o.col); x.setLineDash([]); line(Math.max(1, o.w - 3.2 * o.dpr), INK.paper); tip(1.5 * o.dpr, 'rgba(20,8,6,.8)', true); tip(0, o.col, true); }
    else { line(o.w + 2.4 * o.dpr, 'rgba(20,8,6,.7)'); line(o.w, o.col); x.setLineDash([]); if (hd > 0) { tip(1.3 * o.dpr, 'rgba(20,8,6,.7)', true); tip(0, o.col, true); } }
    if (o.bar) { x.beginPath(); x.moveTo(e[0] - uy * hw * 1.5, e[1] + ux * hw * 1.5); x.lineTo(e[0] + uy * hw * 1.5, e[1] - ux * hw * 1.5); x.strokeStyle = o.col; x.lineWidth = o.w * 0.8; x.stroke(); }
    if (o.wheels) { const m = this._midOf(pts); x.fillStyle = o.col; x.strokeStyle = INK.paper; x.lineWidth = 1.2 * o.dpr; for (const s of [-1, 1]) { x.beginPath(); x.arc(m[0] + ux * s * 5 * o.dpr, m[1] + uy * s * 5 * o.dpr, 3.4 * o.dpr, 0, 6.283); x.fill(); x.stroke(); } }
  }

  // Tactical symbols: a frame with the mark for the kind of unit inside.
  _symbol(x, a, b, sym, dpr, o = {}) {
    const w = 13 * dpr, h = 9 * dpr, col = o.dead ? '#6d6d6d' : INK.own;
    x.save(); x.translate(a, b); x.lineWidth = 1.8 * dpr; x.strokeStyle = o.dead ? '#3a3a3a' : INK.ownDark; x.fillStyle = o.dead ? 'rgba(215,215,215,.9)' : 'rgba(255,228,222,.95)';
    x.beginPath(); x.rect(-w, -h, 2 * w, 2 * h); x.fill(); x.stroke(); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1.7 * dpr; x.beginPath();
    if (sym === 'missile') { x.moveTo(-w * 0.72, h * 0.8); x.lineTo(0, -h * 0.72); x.lineTo(w * 0.72, h * 0.8); x.stroke(); x.beginPath(); x.arc(0, h * 0.25, 2 * dpr, 0, 6.283); x.fill(); }                 /* anti-tank: the upturned V, with a dot for a guided missile */
    else if (sym === 'rocket') { x.moveTo(0, h * 0.8); x.lineTo(0, -h * 0.75); x.moveTo(-w * 0.3, -h * 0.25); x.lineTo(0, -h * 0.78); x.lineTo(w * 0.3, -h * 0.25); x.moveTo(-w * 0.4, h * 0.3); x.lineTo(w * 0.4, h * 0.3); x.stroke(); }   /* a rocket launcher: an arrow with one bar */
    else if (sym === 'drone') { x.moveTo(-w * 0.78, -h * 0.35); x.lineTo(0, h * 0.5); x.lineTo(w * 0.78, -h * 0.35); x.lineTo(0, -h * 0.02); x.closePath(); x.fill(); }                                         /* unmanned aircraft: the swept wing */
    else if (sym === 'tank') { x.ellipse(0, 0, w * 0.66, h * 0.52, 0, 0, 6.283); x.stroke(); }                                                                                                             /* armour: the track oval */
    else if (sym === 'bmp') { x.ellipse(0, 0, w * 0.66, h * 0.52, 0, 0, 6.283); x.moveTo(-w, -h); x.lineTo(w, h); x.moveTo(-w, h); x.lineTo(w, -h); x.stroke(); }                                           /* armoured infantry: the oval over the infantry cross */
    else if (sym === 'light') { x.moveTo(-w * 0.6, -h * 0.1); x.lineTo(w * 0.6, -h * 0.1); x.stroke(); for (const s of [-1, 1]) { x.beginPath(); x.arc(s * w * 0.42, h * 0.42, 2.3 * dpr, 0, 6.283); x.stroke(); } } /* a light wheeled vehicle */
    else { x.font = `700 ${9 * dpr}px ui-monospace, Menlo, monospace`; x.textAlign = 'center'; x.fillText('CDR', 0, 3.2 * dpr); x.textAlign = 'left'; }
    if (o.cdr) { x.strokeStyle = o.dead ? '#3a3a3a' : INK.ownDark; x.lineWidth = 2 * dpr; x.beginPath(); x.moveTo(-w, -h); x.lineTo(-w, -h - 11 * dpr); x.stroke(); x.fillStyle = o.dead ? '#6d6d6d' : INK.own; x.beginPath(); x.moveTo(-w, -h - 11 * dpr); x.lineTo(-w + 9 * dpr, -h - 8 * dpr); x.lineTo(-w, -h - 5 * dpr); x.closePath(); x.fill(); }   /* the commander's pennant */
    if (o.dead) { x.strokeStyle = '#1c1c1c'; x.lineWidth = 2.2 * dpr; x.beginPath(); x.moveTo(-w - 3 * dpr, -h - 3 * dpr); x.lineTo(w + 3 * dpr, h + 3 * dpr); x.moveTo(-w - 3 * dpr, h + 3 * dpr); x.lineTo(w + 3 * dpr, -h - 3 * dpr); x.stroke(); }
    if (o.hold && !o.dead) { x.strokeStyle = 'rgba(17,17,17,.8)'; x.lineWidth = 1.8 * dpr; x.beginPath(); x.arc(0, 0, w * 1.42, 0, 6.283); x.moveTo(-w * 1.0, w * 1.0); x.lineTo(w * 1.0, -w * 1.0); x.stroke(); }   /* hold fire: ringed and barred */
    x.restore();
  }

  // labels are collected first and placed afterwards so they do not sit on top of each other
  _label(a, b, text, col, rank) { this.labels.push({ a, b, text, col, rank }); }
  _labels(x, dpr) {
    const L = this.labels, placed = []; L.sort((p, q) => q.rank - p.rank || p.b - q.b); x.font = `600 ${11 * dpr}px ui-monospace, Menlo, monospace`; x.textBaseline = 'middle';
    for (const l of L) { const w = x.measureText(l.text).width + 10 * dpr, h = 16 * dpr; let bx = l.a - w / 2, by = l.b - h / 2;
      bx = Math.max(4 * dpr, Math.min(this.map.cv.width - w - 4 * dpr, bx)); let free = false;
      for (let k = 0; k < (l.rank === 0 ? 1 : 6); k++) { const hit = placed.find(p => bx < p.x + p.w + 2 * dpr && bx + w > p.x - 2 * dpr && by < p.y + p.h + 1 && by + h > p.y - 1); if (!hit) { free = true; break; } by = hit.y + hit.h + 2 * dpr; }
      if (!free && l.rank < 4) { l.dropped = true; continue; }
      placed.push({ x: bx, y: by, w, h }); x.fillStyle = 'rgba(8,10,12,.78)'; x.fillRect(bx, by, w, h); x.fillStyle = l.col; x.fillText(l.text, bx + 5 * dpr, by + h / 2 + 0.5 * dpr); }
    x.textBaseline = 'alphabetic';
  }

  _banner(x, a, b, text, dpr) { x.font = `700 ${14 * dpr}px ui-monospace, Menlo, monospace`; const w = x.measureText(text).width + 24 * dpr; x.fillStyle = 'rgba(60,8,4,.9)'; x.fillRect(a - w / 2, b - 14 * dpr, w, 28 * dpr); x.strokeStyle = '#ff8a7a'; x.lineWidth = 1.5 * dpr; x.strokeRect(a - w / 2, b - 14 * dpr, w, 28 * dpr); x.fillStyle = '#ffd9d3'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, a, b + 1 * dpr); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; }

  // a small key, bottom right
  _legend(x, dpr, spectator) {
    const rows = [['sym', 'missile', 'Missile team'], ['sym', 'rocket', 'Rocket team'], ['sym', 'drone', 'Drone crew'], ['sym', 'bmp', 'BMP'], ['sym', 'tank', 'Tank'], ['sym', 'light', 'Light vehicle'], ['sym', 'cdrflag', 'Commander is here'], ['sym', 'hold', 'Ordered to hold fire'],
      ['arr', 'move', 'Move on foot'], ['arr', 'ride', 'Ride in the UAZ'], ['arr', 'strike', 'Strike'], ['arr', 'fix', 'Fix (pin it)'], ['arr', 'break', 'Break contact'], ['arr', 'watch', 'Watch a sector'], ['arr', 'bel', 'Tank, where he thinks it is'], ['arr', 'pred', 'Where he expects it to go']];
    if (spectator) rows.push(['arr', 'true', 'True tank and his error']);
    const cv = this.map.cv, cols = 2, per = Math.ceil(rows.length / cols), cw = 222 * dpr, rh = 19 * dpr, W = cols * cw + 14 * dpr, H = per * rh + 14 * dpr, x0 = cv.width - W - 12 * dpr, y0 = cv.height - H - 66 * dpr;   /* clear of the control bar along the bottom of the battle screen */
    x.fillStyle = 'rgba(8,10,12,.93)'; x.fillRect(x0, y0, W, H); x.font = `${11 * dpr}px ui-monospace, Menlo, monospace`; x.textBaseline = 'middle';
    rows.forEach((r, i) => { const cx = x0 + 10 * dpr + Math.floor(i / per) * cw + 16 * dpr, cy = y0 + 7 * dpr + (i % per + 0.5) * rh, k = r[1], A = [cx - 15 * dpr, cy], B = [cx + 15 * dpr, cy];
      x.save();
      if (r[0] === 'sym') { x.translate(cx, cy); x.scale(0.72, 0.72); this._symbol(x, 0, 0, k === 'cdrflag' || k === 'hold' ? 'missile' : k, dpr, { cdr: k === 'cdrflag', hold: k === 'hold' }); }
      else if (k === 'move') this._path(x, [A, B], { w: 3 * dpr, col: INK.own, head: 9 * dpr, dpr });
      else if (k === 'ride') this._path(x, [A, B], { w: 4.6 * dpr, col: INK.ride, head: 10 * dpr, hollow: true, dpr });
      else if (k === 'strike') { this._path(x, [A, [cx + 8 * dpr, cy]], { w: 3.6 * dpr, col: INK.strike, head: 10 * dpr, dpr }); x.strokeStyle = INK.strike; x.lineWidth = 1.3 * dpr; x.beginPath(); x.arc(cx + 10 * dpr, cy, 5 * dpr, 0, 6.283); x.stroke(); }
      else if (k === 'fix') this._path(x, [[cx - 9 * dpr, cy], [cx + 9 * dpr, cy]], { w: 2.8 * dpr, col: INK.fix, head: 7 * dpr, bar: true, dpr });
      else if (k === 'break') this._path(x, [A, B], { w: 2.8 * dpr, col: INK.brk, dash: [6 * dpr, 4 * dpr], head: 9 * dpr, dpr });
      else if (k === 'watch') this._fan(x, cx - 12 * dpr, cy + 6 * dpr, 50, 100, 26 * dpr, 'rgba(198,36,25,.35)', INK.own, 1.4 * dpr, dpr);
      else if (k === 'bel') { x.strokeStyle = INK.believed; x.lineWidth = 1.6 * dpr; x.setLineDash([4 * dpr, 3 * dpr]); x.beginPath(); x.arc(cx, cy, 8 * dpr, 0, 6.283); x.stroke(); x.setLineDash([]); x.fillStyle = 'rgba(235,242,255,.92)'; x.beginPath(); x.moveTo(cx, cy - 5 * dpr); x.lineTo(cx + 6 * dpr, cy); x.lineTo(cx, cy + 5 * dpr); x.lineTo(cx - 6 * dpr, cy); x.closePath(); x.fill(); x.stroke(); }
      else if (k === 'pred') this._path(x, [A, B], { w: 2.2 * dpr, col: INK.believed, dash: [6 * dpr, 4 * dpr], head: 8 * dpr, dpr });
      else if (k === 'true') { x.strokeStyle = '#ddd'; x.lineWidth = 1 * dpr; x.setLineDash([3 * dpr, 3 * dpr]); x.beginPath(); x.moveTo(cx - 14 * dpr, cy); x.lineTo(cx + 4 * dpr, cy); x.stroke(); x.setLineDash([]); x.fillStyle = '#39d98a'; x.beginPath(); x.moveTo(cx + 9 * dpr, cy - 7 * dpr); x.lineTo(cx + 14 * dpr, cy + 6 * dpr); x.lineTo(cx + 9 * dpr, cy + 3 * dpr); x.lineTo(cx + 4 * dpr, cy + 6 * dpr); x.closePath(); x.fill(); }
      x.restore(); x.fillStyle = '#e6efe9'; x.fillText(r[2], cx + 24 * dpr, cy + 0.5 * dpr); });
    x.textBaseline = 'alphabetic';
  }

  // ------------------------------------------------------------------ the list beside the map
  _list(C, plan, byKey, t, spectator, battle) {
    const b = this.bel, T = battle && battle.tank, off = spectator && b && T ? Math.round(Math.hypot(T.e - b.e, T.n - b.n)) : null, withName = C.with ? this._nameOf(C.with) : null;
    const fire = fireText(C.fire), hs = [fire, C.picture && C.picture.src, C.alive === false ? 'x' : 'a', C.radio === false ? 'x' : 'r', withName, b ? Math.round(b.age) : '-', b ? Math.round(b.r / 10) : '-', off != null ? Math.round(off / 10) : '', C.predict && C.predict.why].join('|');
    if (hs !== this.headSig) { this.headSig = hs; const h = this.head; h.textContent = ''; const add = (text, cls) => { const s = document.createElement(cls === 'b' ? 'b' : 'span'); if (cls && cls !== 'b') s.className = cls; s.textContent = text; h.append(s); };
      if (C.alive === false) add('Commander lost: teams act on their own. ', 'bad'); else { add(withName ? `With ${withName}. ` : 'In the field. ', 'b'); add(C.radio === false ? 'Radio lost: teams act on their own. ' : 'Radio working. ', C.radio === false ? 'bad' : ''); }
      h.append(document.createElement('br'));
      add(b ? `His picture of the tank: ${sourceText(C.picture.src, b.age)}${b.r ? ', within about ' + Math.round(b.r / 10) * 10 + ' m' : ''}. ` : 'He has no report of the tank. ');
      if (off != null) add(`His picture is ${Math.round(off / 10) * 10} m off. `, off > Math.max(150, b.r) ? 'bad' : '');
      if (C.predict && C.predict.why) { h.append(document.createElement('br')); add('He expects: ' + C.predict.why + '.'); }
      if (fire) { h.append(document.createElement('br')); add(fire, 'b'); } }
    const sorted = plan.slice().sort((p, q) => (p.done ? 1 : 0) - (q.done ? 1 : 0) || (q.t_order || 0) - (p.t_order || 0));
    const sig = sorted.map(o => o.id + (o.done ? 'd' : '') + (spectator && o.wrong ? 'w' : '') + (String(o.id) === String(this.sel) ? '*' : '') + o.kind + (o.text || '')).join('|');
    if (sig !== this.listSig) { this.listSig = sig; this.rows.textContent = ''; this.eta.clear();
      if (!sorted.length) { const e = document.createElement('div'); e.className = 'cdr-head'; e.textContent = 'No orders standing.'; this.rows.append(e); }
      for (const o of sorted) { const r = document.createElement('button'); r.className = 'btn cdr-row' + (o.done ? ' done' : '') + (String(o.id) === String(this.sel) ? ' on' : ''); r.dataset.id = o.id;
        const who = byKey.get(refKey(o.to)), k = document.createElement('i'), tx = document.createElement('span'), em = document.createElement('em'); k.textContent = KIND[o.kind] || o.kind; tx.textContent = orderText(o, who ? who.name : o.to === 'all' ? 'All teams' : 'Team'); r.append(k, tx, em); this.eta.set(String(o.id), em);
        if (spectator && o.wrong) { const w = document.createElement('span'); w.className = 'wrong'; w.textContent = `Wrong: aimed at where he thinks the tank is${o.off_m != null ? ', ' + Math.round(o.off_m) + ' m from where it really is' : ''}`; r.append(w); }
        r.onclick = () => { this.sel = String(this.sel) === String(o.id) ? null : o.id; this.listSig = ''; }; this.rows.append(r); } }
    for (const o of sorted) { const em = this.eta.get(String(o.id)); if (!em) continue; const left = o.t_eta != null ? o.t_eta - t : null, s = o.done ? 'done' : left == null ? `given ${mmss(Math.max(0, t - (o.t_order || 0)))} ago` : left > 0.5 ? mmss(left) : 'arriving'; if (em.textContent !== s) em.textContent = s; }
  }

  // what the eased picture holds right now (used by the tests to prove the motion is the same at any frame rate)
  state() { const r = v => Math.round(v * 1000) / 1000; return { orders: [...this.anim].map(([id, a]) => [id, r(a.a), r(a.g), r(a.sx), r(a.sn), r(a.dx), r(a.dn)]), units: [...this.pos].map(([k, p]) => [k, r(p.e), r(p.n)]), believed: this.bel ? [r(this.bel.e), r(this.bel.n), r(this.bel.r), r(this.bel.a)] : null, labels: this.labels.filter(l => !l.dropped).map(l => l.text), hover: this.hover }; }
}
