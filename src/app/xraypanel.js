// The X-ray panel: a small view of a hit on the vehicle with a short readout beside it (plate struck, armour against the warhead,
// through or not, what was damaged, the result). It opens by itself after a hit during a battle (top right, does not stop the
// battle) and from the debrief by clicking a row of "Hits on the vehicle" (large, in the middle).
// The drawing is src/render/xray.js; the figures are DMG.report() from src/dmg.js, the old simulator's damage model, which never
// contradicts the engine's verdict on a hit. They are open-source ESTIMATES and are labelled so.
import { XRayView, XRAY_COLOURS } from '../render/xray.js';

const CSS = `
  #xr { position: fixed; z-index: 6; right: 12px; top: 96px; width: 392px; max-width: calc(100vw - 24px); padding: 10px 12px 10px; font-size: 13px; box-shadow: 0 8px 30px rgba(0, 0, 0, .5); }
  #xr.big { right: auto; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(1000px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; }
  #xr .xr-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; } #xr .xr-head b { font: 700 12px/1 var(--mono); letter-spacing: .1em; color: var(--accent); }
  #xr .xr-head span { color: var(--dim); font: 12px var(--mono); flex: 1; } #xr .xr-head .btn { padding: 3px 9px; }
  #xr .xr-body { display: block; } #xr.big .xr-body { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(250px, 1fr); gap: 14px; align-items: start; }
  #xr canvas { display: block; width: 100%; aspect-ratio: 3 / 2; border-radius: 6px; background: #05090b; cursor: grab; touch-action: none; }
  #xr .xr-title { font-weight: 700; font-size: 15px; margin: 8px 0 6px; } #xr.big .xr-title { margin-top: 0; font-size: 17px; }
  #xr table { border-collapse: collapse; width: 100%; } #xr td { padding: 2px 0; vertical-align: top; } #xr td:first-child { color: var(--dim); white-space: nowrap; padding-right: 12px; }
  #xr .xr-res { margin: 8px 0 6px; padding: 6px 9px; border-left: 3px solid var(--accent); background: rgba(57, 217, 138, .07); } #xr .xr-res.bad { border-color: var(--bad); background: rgba(255, 90, 77, .09); } #xr .xr-res.warn { border-color: var(--warn); background: rgba(255, 179, 71, .08); }
  #xr .xr-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: baseline; }
  #xr .xr-crew span, #xr .xr-key span { display: inline-block; margin-right: 11px; white-space: nowrap; } #xr .xr-key { margin-top: 6px; color: var(--dim); font-size: 11.5px; }
  #xr .xr-note { color: var(--dim); font-size: 11.5px; margin-top: 6px; line-height: 1.35; } #xr .xr-foot { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: var(--dim); font-size: 12px; } #xr .xr-foot input { accent-color: var(--accent); }
  @media (max-width: 760px) { #xr.big .xr-body { display: block; } }
`;
const WEAPON = { kornet: 'Kornet missile', vikhr: 'Vikhr missile', saclos: 'Konkurs missile', sal: 'Laser-homing missile', fpv: 'FPV drone', fpv_fiber: 'Fibre FPV drone', rpg: 'RPG rocket', ir: 'Infrared missile', ke: 'Tank round' };
const CREW = [['cdr', 'Commander'], ['gnr', 'Gunner'], ['ldr', 'Loader'], ['drv', 'Driver']];
const REPORTS = new WeakMap(), TIMES = new WeakMap();   /* per engagement: the damage model's report, and when each hit landed */
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

// every hit on the vehicle in a battle, in time order: [{ t (battle time), v (engagement number), h (the damage model's report) }]
export function hitsOf(battle, DMG) {
  const out = []; if (!battle || !DMG) return out;
  for (const v of battle.volleys) { let R = REPORTS.get(v); if (!R) { try { R = DMG.report(v.rec, v.cfg); } catch (e) { R = []; } REPORTS.set(v, R); } for (const h of R) out.push({ t: v.t0 + h.t, v: v.i, h }); }
  return out;
}

export class XRayPanel {
  // app: the same object the film director gets (tank, store, el, battle, tNow, state)
  constructor(app) {
    this.app = app; this.view = null; this.open_ = false; this.list = []; this.i = 0; this.auto = app.store.get('xrayAuto', true); this.seen = 0; this.b = null; this.lastT = 0; this.hideAt = 0; this.touched = false; this.raf = 0; this.drag = null; this.spin = 0;
    const el = app.el; document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    const box = this.box = el('div', 'panel'); box.id = 'xr'; box.hidden = true;
    const head = el('div', 'xr-head'); this.count = el('span'); const prev = el('button', 'btn', '‹'), next = el('button', 'btn', '›'), close = el('button', 'btn', 'Close');
    prev.title = 'Earlier hit'; next.title = 'Later hit'; prev.onclick = () => this.show(this.i - 1); next.onclick = () => this.show(this.i + 1); close.onclick = () => this.close(); this.prev = prev; this.next = next;
    head.append(el('b', null, 'X-RAY OF THE HIT'), this.count, prev, next, close);
    const body = el('div', 'xr-body'), left = el('div'), right = el('div'); this.cv = document.createElement('canvas'); this.read = el('div');
    const key = el('div', 'xr-key'); for (const [k, name] of [['ok', 'untouched'], ['damaged', 'damaged'], ['destroyed', 'destroyed'], ['crew_ok', 'crew unhurt'], ['wounded', 'wounded'], ['killed', 'killed']]) { const s = el('span'), d = el('i', 'xr-dot'); d.style.background = XRAY_COLOURS[k]; s.append(d, name); key.append(s); }
    left.append(this.cv, key); const foot = el('label', 'xr-foot'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = this.auto; cb.onchange = () => { this.auto = cb.checked; app.store.set('xrayAuto', this.auto); }; foot.append(cb, 'Show this after every hit');
    right.append(this.read, el('div', 'xr-note', 'Armour and warhead figures are open-source estimates in millimetres of steel, not data. Places of the crew and components are approximate. Drag the picture to turn it.'), foot);
    body.append(left, right); box.append(head, body); document.body.append(box);
    box.addEventListener('pointerdown', () => { this.touched = true; });
    this.cv.addEventListener('pointerdown', e => { this.drag = [e.clientX, e.clientY]; this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', e => { if (!this.drag || !this.view) return; this.view.az -= (e.clientX - this.drag[0]) * 0.008; this.view.el = Math.max(-0.1, Math.min(1.45, this.view.el + (e.clientY - this.drag[1]) * 0.006)); this.drag = [e.clientX, e.clientY]; });
    this.cv.addEventListener('pointerup', () => { this.drag = null; });
    this.cv.addEventListener('wheel', e => { if (this.view) { this.view.dist = Math.max(5, Math.min(26, this.view.dist * (e.deltaY > 0 ? 1.1 : 0.91))); e.preventDefault(); } }, { passive: false });
    // the debrief's table of hits asks for a hit by its number in the battle (src/app/pages.js)
    window.addEventListener('hkoi-xray', e => { const d = e.detail || {}; this.open(d.battle || this.app.battle, d.i || 0, true); });
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && this.open_) this.close(); });
  }

  // open on hit number i of the battle; big = in the middle of the page (debrief), otherwise the small panel at the top right
  open(battle, i, big) {
    this.list = hitsOf(battle, typeof DMG !== 'undefined' ? DMG : window.DMG);   /* dmg.js declares DMG as a page global, which is not a property of window */ if (!this.list.length) return false;
    if (!this.view) { try { this.view = new XRayView(this.cv); } catch (e) { console.error(e); return false; } }
    this.box.classList.toggle('big', !!big); this.box.hidden = false; this.open_ = true; this.big = !!big; this.touched = !!big;
    this.view.setShell(this.app.tank); this.show(i);
    if (!this.raf) { const loop = () => { this.raf = this.open_ ? requestAnimationFrame(loop) : 0; if (this.open_) this._draw(); }; this.raf = requestAnimationFrame(loop); }
    return true;
  }
  close() { this.open_ = false; this.box.hidden = true; }
  show(i) {
    const n = this.list.length; if (!n) return; this.i = i = Math.max(0, Math.min(n - 1, i)); const x = this.list[i], h = x.h, el = this.app.el;
    this.view.setHit(h, (typeof DMG !== 'undefined' ? DMG : window.DMG)); this.spin = 0;
    this.count.textContent = `Hit ${i + 1} of ${n}`; this.prev.disabled = i === 0; this.next.disabled = i === n - 1; this.prev.style.opacity = i === 0 ? 0.35 : 1; this.next.style.opacity = i === n - 1 ? 0.35 : 1;
    const R = this.read; R.textContent = ''; R.append(el('div', 'xr-title', `${WEAPON[h.key] || h.name} at ${clock(x.t)}`));
    const tb = el('table'), row = (a, b) => { const tr = el('tr'), td = el('td'); if (typeof b === 'string') td.textContent = b; else td.append(b); tr.append(el('td', null, a), td); tb.append(tr); };
    row('Plate struck', h.zoneName + (h.top ? ' (attack from above)' : ''));
    row('Armour there', `about ${h.armor} mm against this kind of warhead`);
    row('Warhead', `pierces about ${h.pen} mm`);
    row('Through?', h.penetrated ? `Yes, with about ${h.residual} mm to spare` : `No: about ${h.armor - h.pen} mm short`);
    if (h.penetrated) row('Jet inside', `reaches about ${h.reach.toFixed(1)} m, with spall around it`);
    const dm = el('div'); const hurt = h.comps.filter(c => c.state !== 'spared' && !c.crew);
    if (!hurt.length) dm.textContent = 'nothing'; for (const c of hurt) { const d = el('div'), dot = el('i', 'xr-dot'); dot.style.background = XRAY_COLOURS[c.state] || XRAY_COLOURS.damaged; d.append(dot, `${c.name}: ${c.state}`); dm.append(d); }
    row('Damaged', dm);
    const cr = el('div', 'xr-crew'); for (const [k, name] of CREW) { const st = h.crew[k] || 'ok', s = el('span'), dot = el('i', 'xr-dot'); dot.style.background = XRAY_COLOURS[st === 'ok' ? 'crew_ok' : st]; s.append(dot, `${name} ${st === 'ok' ? 'unhurt' : st}`); cr.append(s); }
    row('Crew', cr); R.append(tb);
    R.append(el('div', 'xr-res ' + (h.killing ? 'bad' : h.penetrated ? 'warn' : ''), h.effect));
  }
  _draw() {
    const w = this.cv.clientWidth, hh = this.cv.clientHeight; if (!w || !hh) return; if (this.w !== w || this.h !== hh) { this.w = w; this.h = hh; this.view.resize(w, hh); }
    if (!this.drag) { this.spin += 1 / 60; this.view.az += Math.cos(this.spin * 0.5) * 0.0022; }   /* a slow sway, so the depth can be read */
    this.view.render();
  }

  // once a frame during a battle: a new hit opens the small panel for a while (unless the viewer has switched that off)
  update() {
    const A = this.app, b = A.battle; if (window.__beta && window.__beta.xray !== this) window.__beta.xray = this;
    if (A.state !== 'play' || !b) { if (this.open_ && !this.big) this.close(); this.b = null; return; }
    const t = Math.min(A.tNow, b.t); let n = 0;
    for (const v of b.volleys) { let L = TIMES.get(v); if (!L) { L = (v.rec.threats || []).filter(th => th.viz.end && th.viz.end.type === 'hit').map(th => v.t0 + th.viz.end.t); TIMES.set(v, L); } for (const x of L) if (x <= t) n++; }
    if (b !== this.b || t < this.lastT - 0.3) { this.b = b; this.seen = n; }   /* a new battle or a jump back in time: nothing to announce */
    this.lastT = t;
    if (n > this.seen) { this.seen = n; if (this.auto && this.open(b, n - 1, false)) { this.hideAt = performance.now() + 14000; this.touched = false; } }
    else if (n < this.seen) this.seen = n;
    if (this.open_ && !this.big && !this.touched && performance.now() > this.hideAt) this.close();
  }
}
