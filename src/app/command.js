// The player commands the tank: everything on screen for it.
//
//   the order bar        a row of the orders used most, and a panel ("More orders", key O) with every standing order
//   pointing             right-click the ground (or the map) for a small menu at that spot: move here, face this way, engage
//                        the located team there; or arm an order with its key and click (G move, R face)
//   keys                 G move, X halt, B back to cover, R face, P smoke, C main gun hold / fire at will, N machine guns,
//                        K HKOI mode, U hatches, O the panel, Esc cancels
//   feedback             the order and the crew's answer above the bar with the seconds until it takes effect, the recorded
//                        intercom line where the voice pack has one that says it, a ghost path and marker on the ground and
//                        on the map, and smoke where the grenades burst
//   replays              the orders of the battle on screen are kept as a list (tape) and handed back when it is fought again
//
// It decides nothing: every order goes to battle.order() (src/battle/orders.js) and is refused or delayed there by the battle's
// own rules. Orders can be given while the battle is paused: they are taken at the paused moment and run when it goes on.
import * as THREE from 'three';

const CSS = `
/* The order bar is one item of the bottom stack (#dock), directly above the control bar: it stacks with the ticker, the replay bar,
   the caption and anything else docked there, and is never wider than the gap between the side panels (the ticker's own rule). */
#cmd { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: min(1000px, max(300px, calc(100vw - 560px))); pointer-events: none; font-size: 12px; }
body:not(.hud-eng) #cmd, body.in-seat #cmd { width: min(1000px, calc(100vw - 24px)); }
#cmd[hidden] { display: none; }
#cmd .c-say { pointer-events: none; padding: 2px 10px; border-radius: 6px; background: rgba(9, 13, 12, .72); color: #cfe9dc; text-shadow: 0 1px 2px #000; max-width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 18px; min-height: 18px; }
#cmd .c-say b { color: var(--accent); font-weight: 600; letter-spacing: .08em; margin-right: 6px; } #cmd .c-say.bad { color: #ffb4a8; } #cmd .c-say.arm { color: #ffe08a; } #cmd .c-say i { color: var(--dim); font-style: normal; margin-left: 6px; }
#cmd .c-row { pointer-events: auto; display: flex; flex-wrap: nowrap; justify-content: center; gap: 3px; padding: 4px 5px; max-width: 100%; box-sizing: border-box; background: rgba(9, 13, 12, .82); border: 1px solid rgba(57, 217, 138, .28); border-radius: 8px; }
#cmd .c-grp { display: flex; gap: 3px; align-items: center; padding-right: 5px; margin-right: 2px; border-right: 1px solid rgba(255, 255, 255, .14); } #cmd .c-grp:last-child { border-right: 0; padding-right: 0; margin-right: 0; }
#cmd .btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px; font-size: 12px; color: #c6d2cb; white-space: nowrap; } #cmd .btn:hover { color: var(--fg); } #cmd .btn.on { color: var(--accent); } #cmd .btn.warn { color: #ffcf6b; } #cmd .btn.bad { color: #ff9d8f; } #cmd .btn[disabled] { opacity: .45; cursor: default; }
#cmd kbd { font: 10px var(--mono); color: var(--dim); border: 1px solid rgba(255, 255, 255, .16); border-radius: 3px; padding: 0 3px; }
/* "More": a pop-up above the bar */
#cmd .c-more { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(100% + 6px); pointer-events: auto; width: min(700px, calc(100vw - 24px)); box-sizing: border-box; padding: 8px 10px; background: rgba(9, 13, 12, .96); border: 1px solid rgba(57, 217, 138, .4); border-radius: 8px; display: grid; grid-template-columns: max-content 1fr; gap: 4px 10px; align-items: center; max-height: calc(100vh - 190px); overflow: auto; z-index: 6; }
#cmd .c-more[hidden] { display: none; } #cmd .c-more label { color: var(--dim); font-size: 12px; } #cmd .c-more .seg { display: flex; flex-wrap: wrap; gap: 3px; } #cmd .c-more small { grid-column: 1 / -1; color: var(--dim); font-size: 11.5px; line-height: 1.35; } #cmd .c-more .c-quick { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 3px; padding-bottom: 6px; margin-bottom: 2px; border-bottom: 1px solid rgba(255, 255, 255, .12); }
#cmd.onmap .c-row, #cmd.onmap .c-more { display: none; }
#cmdmenu { position: fixed; z-index: 30; min-width: 190px; padding: 4px; background: rgba(9, 13, 12, .96); border: 1px solid rgba(57, 217, 138, .4); border-radius: 8px; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
#cmdmenu[hidden] { display: none; } #cmdmenu .btn { text-align: left; padding: 6px 9px; } #cmdmenu small { color: var(--dim); padding: 2px 9px 4px; font-size: 11.5px; } #cmdmenu .btn.bad { color: #ff9d8f; }
body.in-seat #cmd .c-say { display: none; } body.hud-none #cmd, body.hud-none #cmdmenu { display: none; }
#r-cmd { margin: 10px 0 2px; padding: 10px 12px; border: 1px solid rgba(57, 217, 138, .28); border-radius: 8px; } #r-cmd[hidden] { display: none; } #r-cmd h4 { margin: 0 0 6px; font-size: 13px; letter-spacing: .08em; } #r-cmd h4 b { color: var(--accent); font-size: 16px; margin-left: 6px; }
#r-cmd table { border-collapse: collapse; width: 100%; font-size: 12.5px; } #r-cmd td { padding: 2px 8px 2px 0; vertical-align: top; } #r-cmd td:last-child { text-align: right; white-space: nowrap; font-family: var(--mono); } #r-cmd small { display: block; color: var(--dim); font-size: 11.5px; margin-top: 6px; line-height: 1.4; }
`;
const KEYS = { KeyG: 'move', KeyX: 'halt', KeyB: 'reverse', KeyR: 'face', KeyP: 'smoke', KeyC: 'main', KeyN: 'mg', KeyK: 'hkoi', KeyU: 'hatch', KeyO: 'more' };
const SHORT = { hkoi: { auto: 'HKOI: auto', obs: 'HKOI: obscurant', he: 'HKOI: airburst', hold: 'HKOI: HOLD' }, main: { free: 'Gun: free', hold: 'Gun: HOLD' }, mg: { free: 'MGs: free', hold: 'MGs: HOLD' } };
const ROW_MIN = 700;   // px the one-row bar needs; in a narrower gap it collapses to a single "Orders" button
const KNAME = { move: 'move', halt: 'halt', reverse: 'back to cover', withdraw: 'break contact', face: 'face the hull', smoke: 'smoke', engage: 'target' };
const MAXP = 384;   // points along the ghost path

export class Command {
  // o: { scene, sound, mapv, canvas, el, ctx } where ctx has live getters: battle, world, state, replay, mapOpen, speed, set, shown
  constructor(o) {
    Object.assign(this, o); this.tape = []; this.mode = 'off'; this.armed = null; this.moreOpen = false; this.sig = ''; this.tDom = 0; this.tGhost = 0; this.ackI = 0; this.ackB = null; this.note = null; this.pick = null; this.down = null;
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    const el = this.el; this.box = el('div'); this.box.id = 'cmd'; this.box.hidden = true; this.say = el('div', 'c-say'); this.more = el('div', 'c-more'); this.more.hidden = true; this.row = el('div', 'c-row'); this.box.append(this.say, this.more, this.row); { const dock = document.getElementById('dock'), bar = document.getElementById('bar'); if (dock && bar) dock.insertBefore(this.box, bar); else document.body.append(this.box); }   /* in the bottom stack, directly above the control bar */
    this.menu = el('div'); this.menu.id = 'cmdmenu'; this.menu.hidden = true; document.body.append(this.menu);
    this._ghost(); this._wire();
  }
  // ---------------------------------------------------------------- the battle's options, the tape, replay codes
  get on() { const c = this.ctx, b = c.battle; return c.state === 'play' && !!b && !!b.cmd; }
  get live() { return this.on && !this.ctx.replay && this.ctx.battle.tank.alive && !this.ctx.battle.over; }
  battleOpts() { if (this.mode === 'off' || this.ctx.set.command !== 'player') return {}; return { command: 'player', orders: this.mode === 'tape' ? this.tape : [] }; }
  off() { this.mode = 'off'; }   // the battle behind the title screen is always the crew's own
  begin() { this.mode = 'live'; this.tape = []; this.note = null; this._disarm(); this.moreOpen = false; this.sig = ''; }                 // a new battle is about to start
  keep() { const b = this.ctx.battle; if (this.mode === 'off') this.tape = []; if (this.mode === 'live' && b && b.cmd) this.tape = b.cmd.log.map(x => Object.assign({}, x)); this.mode = 'tape'; this._disarm(); this.moreOpen = false; }   // a replay is about to start: the orders given so far are the tape
  code() { const b = this.ctx.battle, t = this.mode === 'tape' ? this.tape : b && b.cmd ? b.cmd.log : null; return t && this.ctx.set.command === 'player' ? t.map(o => { const a = [o.t, o.k]; if (o.k === 'move') a.push(o.e, o.n); else if (o.k === 'face') a.push(o.brg); else if (o.k === 'engage') a.push(o.uid); else if (o.v != null) a.push(o.v); return a; }) : null; }
  // from a replay code: o.cmd is the list code() made (absent in codes from before the player could command)
  load(o) { const L = Array.isArray(o && o.cmd) ? o.cmd : null; this.ctx.set.command = L ? 'player' : 'crew'; this.mode = 'tape';
    this.tape = (L || []).filter(a => Array.isArray(a) && typeof a[1] === 'string').map(a => { const r = { t: +a[0], k: a[1] }; if (r.k === 'move') { r.e = +a[2]; r.n = +a[3]; } else if (r.k === 'face') r.brg = a[2] == null ? null : +a[2]; else if (r.k === 'engage') r.uid = a[2] == null ? null : +a[2]; else if (a[2] != null) r.v = a[2]; return r; }); }

  // ---------------------------------------------------------------- giving orders
  give(o) {
    if (!this.live) return; const r = this.ctx.battle.order(o); this.note = { text: r.text, bad: !r.ok, until: performance.now() + (r.ok ? 2500 : 5000) }; this.sig = ''; this.tDom = 0; this.tGhost = 0; return r;
  }
  cycle(k) { const b = this.ctx.battle, O = window.HKOrders.OPTIONS[k], pend = b.cmd.q.find(it => it.o.k === k), cur = pend ? pend.o.v : b.cmd[k], i = O.findIndex(x => x[0] === cur); this.give({ k, v: O[(i + 1) % O.length][0] }); }
  act(name) {
    if (!this.live) return;
    if (name === 'move' || name === 'face') { this.armed = this.armed === name ? null : name; this.moreOpen = false; this._menuOff(); this.sig = ''; this.tDom = 0; return; }
    this._disarm();
    if (name === 'more') { this.moreOpen = !this.moreOpen; this.sig = ''; this.tDom = 0; return; }
    if (name === 'halt' || name === 'reverse' || name === 'smoke' || name === 'withdraw') this.give({ k: name });
    else if (name === 'threat') this.give({ k: 'face', brg: null });
    else if (window.HKOrders.OPTIONS[name]) this.cycle(name);
  }
  _disarm() { if (this.armed) { this.armed = null; this.sig = ''; this.tDom = 0; } this._menuOff(); }
  _menuOff() { if (!this.menu.hidden) { this.menu.hidden = true; this.pick = null; this.tGhost = 0; } }
  // the located team (what the crew knows of it) nearest a point, within reach of a click
  _teamAt(e, n, tol) { const b = this.ctx.battle; let best = null, bd = tol; for (const k of b.tank.known) { if (k.done) continue; const u = b.units.find(q => q.id === k.id); if (!u || !u.alive || u.gone) continue; const d = Math.hypot(k.e - e, k.n - n); if (d < bd) { bd = d; best = u; } } return best; }
  // a menu at the spot pointed at (screen x, y; ground e, n)
  _menuAt(x, y, e, n) {
    const b = this.ctx.battle, T = b.tank, el = this.el, m = this.menu, R = Math.hypot(e - T.e, n - T.n), brg = (Math.atan2(e - T.e, n - T.n) * 180 / Math.PI + 360) % 360, u = this._teamAt(e, n, Math.max(40, R * 0.04));
    const rt = b.orderRoute(Math.round(e), Math.round(n)); m.textContent = ''; this.pick = { e, n, pts: rt.ok ? rt.pts : null };
    const add = (txt, fn, cls) => { const bt = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); bt.onclick = ev => { ev.stopPropagation(); this._menuOff(); fn(); }; m.append(bt); };
    if (u) add(`Engage ${u.spec.name} #${u.id + 1}`, () => this.give({ k: 'engage', uid: u.id }));
    if (rt.ok) add(`Move here · ${Math.round(rt.d / 10) * 10} m by the driver's route`, () => this.give({ k: 'move', e, n })); else m.append(el('small', null, rt.text));
    add(`Face the hull this way · ${String(Math.round(brg)).padStart(3, '0')}`, () => this.give({ k: 'face', brg }));
    add('Cancel', () => {}, 'bad');
    m.hidden = false; const w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 10)) + 'px'; m.style.top = Math.max(8, Math.min(innerHeight - h - 8, y - h / 2)) + 'px'; this.tGhost = 0;
  }
  // where a ray from the camera through a point of the canvas meets the ground: [e, n] or null
  ground(cx, cy) {
    const cv = this.canvas, r = cv.getBoundingClientRect(), W = this.ctx.world, cam = this.scene.camera, v = this._v, d = this._d;
    v.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(cam); d.copy(v).sub(cam.position).normalize(); const o = cam.position;
    let t0 = 0, t = 2; for (let i = 0; i < 400 && t < 9000; i++) { const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; if (!W.inside(x, -z)) { if (y < -50) return null; } else if (y <= W.h(x, -z)) { let a = t0, bb = t; for (let j = 0; j < 10; j++) { const mid = (a + bb) / 2, mx = o.x + d.x * mid, mz = o.z + d.z * mid; if (o.y + d.y * mid <= W.h(mx, -mz)) bb = mid; else a = mid; } const e = o.x + d.x * bb, n = -(o.z + d.z * bb); return W.inside(e, n) ? [e, n] : null; } t0 = t; t += Math.max(2, t * 0.02); }
    return null;
  }
  _point(x, y, e, n, direct) {   // a spot was pointed at: do the armed order, or open the menu
    if (this.armed === 'move' && direct) { this.give({ k: 'move', e, n }); this.armed = null; }
    else if (this.armed === 'face' && direct) { const T = this.ctx.battle.tank; this.give({ k: 'face', brg: (Math.atan2(e - T.e, n - T.n) * 180 / Math.PI + 360) % 360 }); this.armed = null; }
    else this._menuAt(x, y, e, n);
    this.sig = ''; this.tDom = 0;
  }
  _wire() {
    const cv = this.canvas; this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
    cv.addEventListener('pointerdown', e => { this.down = this.live ? [e.clientX, e.clientY, e.button] : null; if (!this.menu.hidden) this._menuOff(); });
    cv.addEventListener('pointerup', e => { const d = this.down; this.down = null; if (!d || !this.live || this.ctx.mapOpen || Math.abs(e.clientX - d[0]) + Math.abs(e.clientY - d[1]) > 5) return;
      if (d[2] === 2 || (d[2] === 0 && this.armed)) { const g = this.ground(e.clientX, e.clientY); if (g) this._point(e.clientX, e.clientY, g[0], g[1], d[2] === 0); else this.note = { text: 'That is not ground the vehicle can be sent to.', bad: true, until: performance.now() + 3000 }; } });
    cv.addEventListener('contextmenu', e => { if (this.live) e.preventDefault(); });
    this.mapv.onClick = (e, n, ev) => { if (!this.live) return; this._point(ev.clientX, ev.clientY, e, n, true); };
    this.mapv.overlay = (x, dpr) => { try { this._mapDraw(x, dpr); } catch (err) { /* a drawing fault here must never stop the map */ } };
    window.addEventListener('keydown', e => { if (!this.live || e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.code === 'Escape') { if (this.armed || !this.menu.hidden || this.moreOpen) { this._disarm(); this.moreOpen = false; this.sig = ''; this.tDom = 0; e.stopImmediatePropagation(); } return; }
      const k = KEYS[e.code]; if (!k || this.scene.camera && this.cams && this.cams.mode === 'fly') return; this.act(k); }, true);
    window.addEventListener('pointerdown', e => { if (this.moreOpen && !(e.target.closest && e.target.closest('#cmd'))) { this.moreOpen = false; this.sig = ''; this.tDom = 0; }
      if (!this.menu.hidden && !(e.target.closest && e.target.closest('#cmdmenu')) && e.target !== cv && e.target !== this.mapv.cv) this._menuOff(); }, true);
  }

  // ---------------------------------------------------------------- the ghost on the ground
  _ghost() {
    const g = this.gh = new THREE.Group(); g.visible = false; g.renderOrder = 20;
    const pos = new Float32Array(MAXP * 2 * 3), idx = new Uint16Array((MAXP - 1) * 6); for (let i = 0; i < MAXP - 1; i++) { const a = i * 2, o = i * 6; idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
    const mat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.62, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.ribbon = new THREE.Mesh(geo, mat(0x39d98a)); this.ribbon.frustumCulled = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.6, 40), mat(0x39d98a)); this.ring.rotation.x = -Math.PI / 2;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 26, 8, 1, true), mat(0x39d98a)); this.beam.material.opacity = 0.34;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 3), mat(0xffe08a)); this.arrow.rotation.order = 'YXZ';
    g.add(this.ribbon, this.ring, this.beam, this.arrow); this.scene.scene.add(g); this.pathN = 0; this.pts = new Float32Array(MAXP * 2);
  }
  // lay the ribbon along a list of ground points [[e, n], ...] starting at (e0, n0)
  _lay(e0, n0, route, from) {
    const W = this.ctx.world, P = this.pts; let n = 0, pe = e0, pn = n0; P[0] = pe; P[1] = pn; n = 1;
    for (let i = from; i < route.length && n < MAXP; i++) { const qe = route[i][0], qn = route[i][1], d = Math.hypot(qe - pe, qn - pn), steps = Math.max(1, Math.ceil(d / 8)); for (let s = 1; s <= steps && n < MAXP; s++) { P[n * 2] = pe + (qe - pe) * s / steps; P[n * 2 + 1] = pn + (qn - pn) * s / steps; n++; } pe = qe; pn = qn; }
    const a = this.ribbon.geometry.attributes.position, A = a.array;
    for (let i = 0; i < n; i++) { const e = P[i * 2], nn = P[i * 2 + 1], j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1); let de = P[j * 2] - P[k * 2], dn = P[j * 2 + 1] - P[k * 2 + 1]; const L = Math.hypot(de, dn) || 1; de /= L; dn /= L; const w = 0.9, y = W.h(e, nn) + 0.45, o = i * 6;
      A[o] = e - dn * w; A[o + 1] = y; A[o + 2] = -(nn + de * w); A[o + 3] = e + dn * w; A[o + 4] = y; A[o + 5] = -(nn - de * w); }
    a.needsUpdate = true; this.ribbon.geometry.setDrawRange(0, Math.max(0, n - 1) * 6); this.ribbon.visible = n > 1;
  }
  _ghostUpdate(now) {
    const c = this.ctx, b = c.battle, g = this.gh; if (!this.on || c.mapOpen) { g.visible = false; return; }
    if (now < this.tGhost) { if (g.visible) { this.ring.rotation.z = now * 0.0006; } return; } this.tGhost = now + 220;
    const S = b.orderState(), W = c.world, T = c.shown || b.tank; let dest = null, col = 0x39d98a, route = null, from = 0, e0 = T.e, n0 = T.n;
    if (this.pick && !this.menu.hidden) { dest = this.pick; col = 0xffe08a; if (this.pick.pts) { route = this.pick.pts; from = 1; } }
    else if (S.goal && S.route && (S.move || b.tank.mode === 'moving')) { dest = S.goal; route = S.route; from = S.routeI; }
    else if (S.move) dest = S.move;   /* an engagement is holding the move up: the marker stays */
    else { const p = S.pending.find(q => q.k === 'move'); if (p) { dest = p; col = 0xffe08a; } }
    const face = S.pending.find(q => q.k === 'face' && q.brg != null), fb = face ? face.brg : S.face;
    this.arrow.visible = fb != null && !route; if (this.arrow.visible) { const a = fb * Math.PI / 180, e = T.e + Math.sin(a) * 14, n = T.n + Math.cos(a) * 14; this.arrow.position.set(e, W.h(e, n) + 1.2, -n); this.arrow.rotation.set(Math.PI / 2, -a + Math.PI, 0); }
    g.visible = !!dest || this.arrow.visible; this.ring.visible = this.beam.visible = !!dest; if (!dest) { this.ribbon.visible = false; return; }
    const y = W.h(dest.e, dest.n); this.ring.position.set(dest.e, y + 0.5, -dest.n); this.beam.position.set(dest.e, y + 13, -dest.n); this.ring.material.color.setHex(col); this.beam.material.color.setHex(col); this.ribbon.material.color.setHex(col);
    if (route) this._lay(e0, n0, route, from); else this.ribbon.visible = false;
  }
  // the same on the map
  _mapDraw(x, dpr) {
    if (!this.on) return; const b = this.ctx.battle, S = b.orderState(), T = b.tank, mv = this.mapv, line = (pts, from, e0, n0, col, dash) => { x.strokeStyle = col; x.lineWidth = 3 * dpr; x.setLineDash(dash ? [7 * dpr, 5 * dpr] : []); x.beginPath(); let [a, c] = mv.toScreen(e0, n0); x.moveTo(a, c); for (let i = from; i < pts.length; i++) { [a, c] = mv.toScreen(pts[i][0], pts[i][1]); x.lineTo(a, c); } x.stroke(); x.setLineDash([]); };
    const mark = (e, n, col, label) => { const [a, c] = mv.toScreen(e, n); x.strokeStyle = col; x.lineWidth = 2.5 * dpr; x.beginPath(); x.arc(a, c, 8 * dpr, 0, 6.283); x.stroke(); x.beginPath(); x.moveTo(a - 12 * dpr, c); x.lineTo(a + 12 * dpr, c); x.moveTo(a, c - 12 * dpr); x.lineTo(a, c + 12 * dpr); x.stroke(); x.font = `600 ${11 * dpr}px ui-monospace, Menlo, monospace`; const tw = x.measureText(label).width; x.fillStyle = 'rgba(0,0,0,.72)'; x.fillRect(a + 12 * dpr, c - 20 * dpr, tw + 8 * dpr, 16 * dpr); x.fillStyle = col; x.fillText(label, a + 16 * dpr, c - 8 * dpr); };
    if (S.goal && S.route && (S.move || T.mode === 'moving')) { line(S.route, S.routeI, T.e, T.n, '#39d98a', false); mark(S.goal.e, S.goal.n, '#39d98a', `${S.move && S.move.rev ? 'REVERSING' : 'MOVING'} · ${Math.round(Math.hypot(S.goal.e - T.e, S.goal.n - T.n) / 10) * 10} m to go`); }
    if (b.mission === 'advance' && b.objective) mark(b.objective.e, b.objective.n, '#7fd4ff', 'OBJECTIVE');
    const p = S.pending.find(q => q.k === 'move'); if (p) mark(p.e, p.n, '#ffe08a', p.left > 0.05 ? `MOVE ORDERED · driver in ${p.left.toFixed(1)} s` : 'MOVE ORDERED · when the engagement is over');
    else if (S.move && !S.goal) mark(S.move.e, S.move.n, '#39d98a', 'MOVE · goes on when the engagement is over');
    if (this.pick && !this.menu.hidden) { if (this.pick.pts) line(this.pick.pts, 1, T.e, T.n, '#ffe08a', true); mark(this.pick.e, this.pick.n, '#ffe08a', 'HERE?'); }
    const fb = S.face; if (fb != null) { const a = fb * Math.PI / 180, [u, v] = mv.toScreen(T.e, T.n); x.strokeStyle = '#ffe08a'; x.lineWidth = 2 * dpr; x.beginPath(); x.moveTo(u, v); x.lineTo(u + Math.sin(a) * 34 * dpr, v - Math.cos(a) * 34 * dpr); x.stroke(); }
    if (this.live) { const txt = this.armed === 'face' ? 'Click the map: the hull will face that way' : 'Click the map to give an order there (move, face, engage a located team)'; x.font = `${12 * dpr}px system-ui, sans-serif`; const tw = x.measureText(txt).width, cx = mv.cv.width / 2; x.fillStyle = 'rgba(0,0,0,.7)'; const y0 = 112 * dpr; x.fillRect(cx - tw / 2 - 10 * dpr, y0, tw + 20 * dpr, 24 * dpr); x.fillStyle = '#ffe08a'; x.fillText(txt, cx - tw / 2, y0 + 17 * dpr); }
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    const c = this.ctx, b = c.battle, now = performance.now(), on = this.on, live = this.live;
    if (this.box.hidden === live) { this.box.hidden = !live; if (!live) { this._disarm(); this.moreOpen = false; } this.sig = ''; }
    if (this.onMap !== !!c.mapOpen) { this.onMap = !!c.mapOpen; this.box.classList.toggle('onmap', this.onMap); }
    if (on) this._acks(b); else this.ackB = null;
    this._ghostUpdate(now);
    if (!live || now < this.tDom) return; this.tDom = now + 200;
    const S = b.orderState(), O = window.HKOrders, pend = S.pending, pk = k => { const p = pend.find(q => q.k === k); return p ? p : null; };
    this.narrow = this.box.clientWidth < ROW_MIN;
    const sig = [this.narrow, this.armed, this.moreOpen, S.prio, S.main, S.round, S.mg, S.hkoi, S.warn, S.smokepol, S.hatch, S.face, S.target, S.smokes, S.smokeLeft > 0, !!S.move, pend.map(p => p.k).join(), S.inVolley].join('|');
    if (sig !== this.sig) { this.sig = sig; this._build(S, O, pend); }
    // the line above the bar: what is armed, the last refusal, the order on its way, or the crew's last answer
    let txt = '', cls = '', extra = '';
    if (this.armed) { txt = this.armed === 'move' ? 'MOVE: click the ground where the vehicle should go (Esc cancels)' : 'FACE: click the ground the hull front should point at (Esc cancels)'; cls = 'arm'; }
    else if (this.note && now < this.note.until) { txt = this.note.text; cls = this.note.bad ? 'bad' : ''; const p = pend[pend.length - 1]; if (p && !this.note.bad) extra = p.left > 0.05 ? `in ${p.left.toFixed(1)} s` : S.inVolley ? 'when the engagement is over' : ''; }
    else if (pend.length) { const p = pend[pend.length - 1]; txt = `Order on its way: ${KNAME[p.k] || O.LABEL[p.k].toLowerCase()}`; extra = p.left > 0.05 ? `in ${p.left.toFixed(1)} s` : S.inVolley ? 'the driver finishes the engagement drill first' : 'waiting'; }
    else if (S.last && b.t - S.last.t < 6) txt = S.last.text;
    else if (!S.given) txt = 'You command. Right-click the ground for orders there, or use the bar. Space pauses: orders can be given while paused.';
    const html = txt + '|' + extra + '|' + cls; if (html !== this.sayS) { this.sayS = html; this.say.textContent = ''; this.say.className = 'c-say' + (cls ? ' ' + cls : ''); if (txt) { this.say.append(this.el('b', null, 'ORDERS'), txt); if (extra) this.say.append(this.el('i', null, extra)); } this.say.style.visibility = txt ? 'visible' : 'hidden'; }
  }
  _build(S, O, pend) {
    const el = this.el, row = this.row; row.textContent = '';
    const btn = (name, label, key, tip, cls) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label); if (key) b.append(el('kbd', null, key)); b.title = tip; b.onclick = e => { e.stopPropagation(); this.act(name); }; return b; };
    const wait = k => pend.some(p => p.k === k), grp = (tag, ...bs) => { const g = el('div', 'c-grp'); if (tag) g.append(el('span', 'c-tag', tag)); g.append(...bs); row.append(g); };
    const quick = [
      [btn('move', 'Move', 'G', 'Then click the ground: the driver takes the most hidden way there', this.armed === 'move' ? 'on' : wait('move') ? 'warn' : ''),
        btn('halt', 'Halt', 'X', 'Driver, stop', wait('halt') ? 'warn' : ''),
        btn('reverse', 'Cover', 'B', 'Back to cover: the nearest ground that hides the hull from the located enemy, front kept toward them where it is close enough to reverse', wait('reverse') ? 'warn' : ''),
        btn('face', S.face == null ? 'Face' : `Face ${String(Math.round(S.face)).padStart(3, '0')}`, 'R', 'Then click the ground: the hull front is turned that way when halted. Without this order the driver squares up to the main threat', this.armed === 'face' ? 'on' : wait('face') ? 'warn' : '')],
      [btn('main', SHORT.main[S.main], 'C', 'Main gun: fire at will, or hold fire', S.main === 'hold' ? 'bad' : wait('main') ? 'warn' : ''), btn('mg', SHORT.mg[S.mg], 'N', 'Machine guns (commander\'s .50, coax, loader\'s M240): free, or hold fire', S.mg === 'hold' ? 'bad' : wait('mg') ? 'warn' : '')],
      [btn('hkoi', SHORT.hkoi[S.hkoi], 'K', 'HKOI mode: automatic, obscurant only, airburst only, or hold (hold is your risk). It applies from the next enemy shot', S.hkoi === 'hold' ? 'bad' : S.hkoi !== 'auto' || wait('hkoi') ? 'warn' : ''),
        (() => { const b = btn('smoke', S.smokeLeft > 0 ? `Smoke ${Math.ceil(S.smokeLeft)} s` : `Smoke ${S.smokes}`, 'P', `Fire a salvo of smoke grenades (${S.smokes} left): the screen stands after 3 s for about 25 s. It does nothing against a missile already in the air`, S.smokeLeft > 0 ? 'on' : ''); if (S.smokes <= 0 || S.smokeLeft > 0) b.disabled = true; return b; })()]];
    if (this.narrow) { const held = S.main === 'hold' || S.mg === 'hold' || S.hkoi === 'hold'; grp('', btn('more', this.armed ? 'Orders: click the ground' : held ? 'Orders (fire held)' : 'Orders', 'O', 'Every order: move, halt, back to cover, face, fire, HKOI, smoke and the standing orders', this.moreOpen || this.armed ? 'on' : held ? 'bad' : '')); }
    else { for (const q of quick) grp('', ...q); grp('', btn('more', 'More', 'O', 'Every standing order: target order, round, what to do on a missile warning, smoke, hatches, break contact', this.moreOpen ? 'on' : '')); }
    const m = this.more; m.hidden = !this.moreOpen; if (!this.moreOpen) return; m.textContent = '';
    if (this.narrow) { const qd = el('div', 'c-quick'); for (const q of quick) qd.append(...q); m.append(qd); }
    const TIP = { prio: 'Which located team the gunner and the machine guns take first', main: '', round: 'Matters when enemy vehicles are about; teams on foot always get multi-purpose', mg: 'Commander\'s .50, coax and the loader\'s M240', hkoi: 'Applies from the next enemy shot. Hold is your risk', warn: 'What the driver does when a missile warning comes. Decided before the shot: it cannot be changed while the missile is in the air', smokepol: `${S.smokes} salvo${S.smokes === 1 ? '' : 's'} left`, hatch: 'Shut: the loader stays inside and loads, the commander sees less' };
    for (const k of ['warn', 'hkoi', 'smokepol', 'prio', 'main', 'round', 'mg', 'hatch']) { const lab = el('label', null, O.LABEL[k]); lab.title = TIP[k]; const sg = el('div', 'seg'), p = pend.find(q => q.k === k); for (const [v, name] of O.OPTIONS[k]) { const bt = el('button', 'btn' + (S[k] === v ? ' on' : ''), name); bt.title = TIP[k]; bt.onclick = e => { e.stopPropagation(); if (S[k] !== v) this.give({ k, v }); }; sg.append(bt); } if (p) sg.append(el('small', null, 'changing...')); m.append(lab, sg); }
    { const lab = el('label', null, 'Target'), sg = el('div', 'seg'), b = this.ctx.battle, u = S.target != null ? b.units.find(q => q.id === S.target) : null; sg.append(el('span', null, u ? `${u.spec.name} #${u.id + 1} first` : 'Gunner\'s own choice. Right-click a located team to point it out.')); if (u) { const bt = el('button', 'btn', 'Gunner\'s own choice'); bt.onclick = e => { e.stopPropagation(); this.give({ k: 'engage', uid: null }); }; sg.append(bt); } m.append(lab, sg); }
    { const lab = el('label', null, 'Hull'), sg = el('div', 'seg'), a = el('button', 'btn' + (S.face == null ? ' on' : ''), 'Front to the main threat'); a.onclick = e => { e.stopPropagation(); if (S.face != null) this.act('threat'); }; const w = el('button', 'btn bad', 'Break contact'); w.title = 'Driver, back to the start line. The mission ends as withdrawn when the vehicle gets there'; w.onclick = e => { e.stopPropagation(); this.act('withdraw'); }; sg.append(a, w); m.append(lab, sg); }
    m.append(el('small', null, 'Orders take effect after the time to say them and the crewman\'s reaction; a shaken crew is slower. While missiles are in the air the driver follows the engagement drill and orders to him wait.'));
  }
  // the crew answers: the recorded line where the pack has one, and the smoke where the grenades burst
  _acks(b) {
    const A = b.cmd.acks; if (this.ackB !== b) { this.ackB = b; this.ackI = A.length; return; }
    if (A.length < this.ackI) this.ackI = A.length;
    for (; this.ackI < A.length; this.ackI++) { const a = A[this.ackI]; if (a.t > b.t + 0.05) break; if (b.t - a.t > 1.5 || this.ctx.speed > 2.01) continue;
      if (a.cue && this.sound && this.sound.cue) { try { this.sound.cue(a.who, a.cue, 0, { queue: true, delay: a.phase === 'done' && a.who === 'DRV' ? 0.3 : 0 }); } catch (e) { /* no voice is no fault */ } }
      if (a.k === 'smoke' && a.phase === 'done') this._smokeFx(b); }
  }
  _smokeFx(b) {
    const fx = this.scene.fx, W = this.ctx.world, T = b.tank; if (!fx || !fx.puff) return; const h0 = (T.tur != null ? T.tur : T.h) * Math.PI / 180;
    for (let i = 0; i < 12; i++) { const a = h0 + (i - 5.5) * 0.19, R = 30 + (i % 3) * 4, e = T.e + Math.sin(a) * R, n = T.n + Math.cos(a) * R, y = W.h(e, n);
      for (let k = 0; k < 4; k++) fx.puff(e + (k - 1.5) * 1.5, y + 1.5 + k * 1.8, -n + (k % 2) * 2, Math.sin(a) * 0.4, 0.35, -Math.cos(a) * 0.4, 26 + k * 2, 5, 15 + k * 2, 0.86, 0.86, 0.84, 0.55, 1.4, 0.05, 1.0 + i * 0.06 + k * 0.5); }
  }
  // the debrief's part for the player's decisions (d = HKLadder.debrief(battle))
  result(d) {
    let box = document.getElementById('r-cmd'); const facts = document.getElementById('r-facts'), el = this.el;
    if (!box && facts) { box = el('div', 'panel'); box.id = 'r-cmd'; facts.after(box); } if (!box) return;
    const D = d && d.decisions; box.hidden = !D; if (!D) return; box.textContent = '';
    const h = el('h4', null, 'YOUR COMMAND'); h.append(el('b', null, D.score == null ? 'not judged' : `${D.score} of ${D.max}`)); box.append(h);
    const tb = el('table'); for (const l of D.lines) { const tr = el('tr'); tr.append(el('td', null, l.name), el('td', null, l.value), el('td', null, l.pts == null ? '-' : `${l.pts} of ${l.of}`)); tb.append(tr); } box.append(tb);
    box.append(el('small', null, `${D.orders} order${D.orders === 1 ? '' : 's'} given, ${D.smokesUsed} smoke salvo${D.smokesUsed === 1 ? '' : 's'} used. Kept apart from the score out of 100. Assumptions: ` + D.assumptions.join(' ')));
  }
}
