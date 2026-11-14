// The first-person drone camera: the pilot's goggle feed of an attacking FPV drone, made to look and behave like the one in the
// original simulator (src/sbx_ui14.js, "enemy view: unit menu, weapon sights, FPV video feed"), with live values from the battle.
//
// What is REAL (read from the battle, never invented here):
//   where the drone is and where it is heading (the engagement view's own list, volleys.info: drones flying in and in their attack run),
//   its speed, height above the ground, distance to the vehicle, distance back to its pilot, time since launch,
//   how its flight ended and when (the battle's 'end' event: shot down, stopped by Trophy, flew into the ground, hit the vehicle),
//   HKOI's rounds: they are drawn in the 3D scene by the engagement view, so the camera simply sees them; the picture jolts as
//   each one the record lists passes the drone.
// What is REPRESENTATIVE (the engine has no video link; it only knows a radio drone can be jammed and a fibre drone cannot):
//   the link quality number and the picture noise. Same rule as the original: quality falls with distance from the pilot
//   (38 points per 3 km), with flying low (2.5 points per metre under 14 m), and, ONLY when the vehicle's drone jammer is switched
//   on in this battle's settings, with closing inside 450 m of it (up to 70 points). One addition: 15 points while the ground hides
//   the drone from its pilot (the battle's own line-of-sight check). The fibre-optic drone always has a clean picture.
//   Battery voltage and capacity used are the original's simple function of flight time. The caption says the feed is representative.
// Everything shown is a function of battle time, so it is the same at any frame rate; only the snow is random (redrawn 30 times a second).

const DEG = Math.PI / 180;
const CSS = `
  #fpv { position: fixed; inset: 0; pointer-events: none; z-index: 2; overflow: hidden; font: 700 15px/1.35 var(--mono, ui-monospace, Menlo, monospace); letter-spacing: .1em; color: #fff; }
  #fpv[hidden] { display: none; }
  #fpv canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  #fpv-snow { image-rendering: pixelated; opacity: 0; mix-blend-mode: screen; }
  #fpv-freeze { display: none; filter: saturate(.6) contrast(1.2) blur(.6px); } #fpv.frozen #fpv-freeze { display: block; }
  #fpv .lines { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0, 0, 0, .13) 2px 3px), radial-gradient(ellipse at center, transparent 52%, rgba(0, 0, 0, .68) 100%); }
  #fpv .rollbar { position: absolute; left: 0; right: 0; height: 18%; top: -20%; background: linear-gradient(180deg, transparent, rgba(0, 0, 0, .5) 40%, rgba(255, 255, 255, .08) 55%, transparent); opacity: 0; animation: fpvroll 2.7s linear infinite; }
  @keyframes fpvroll { from { top: -20%; } to { top: 102%; } }
  #fpv.black .lines { background: #000; } #fpv.wait .lines, #fpv.wait .rollbar { display: none; }
  #fpv .t { position: absolute; white-space: pre; text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 0 0 4px #000; }
  #fpv .tl { left: 5.5%; top: 15%; } #fpv .tr { right: 5.5%; top: 15%; text-align: right; } #fpv .bl { left: 5.5%; bottom: 21%; } #fpv .br { right: 5.5%; bottom: 21%; text-align: right; }
  #fpv .tc { left: 50%; top: 15%; transform: translateX(-50%); text-align: center; font-size: 12px; opacity: .9; }
  #fpv .bc { left: 50%; bottom: 21%; transform: translateX(-50%); text-align: center; }
  #fpv .warn { left: 50%; top: 62%; transform: translateX(-50%); text-align: center; font-size: 17px; color: #ffd24a; }
  #fpv .warn.alarm { color: #ff5a4a; animation: fpvblink .5s steps(2) infinite; } @keyframes fpvblink { 50% { opacity: .25; } }
  #fpv .cap { position: absolute; left: 50%; bottom: 16.5%; transform: translateX(-50%); font: 500 11px var(--mono, monospace); letter-spacing: .06em; color: #d6dbd0; opacity: .85; white-space: nowrap; text-shadow: 0 0 3px #000, 0 0 2px #000; }
  #fpv svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  #fpv .bars { display: inline-block; vertical-align: -1px; margin-left: 8px; } #fpv .bars i { display: inline-block; width: 4px; margin-right: 2px; background: #fff; box-shadow: 1px 1px 0 #000; opacity: .25; } #fpv .bars i.on { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { #fpv .warn.alarm, #fpv .rollbar { animation: none; } }
`;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pad2 = n => String(n).padStart(2, '0');
// a small repeatable shake: a few sines of the battle time (no memory, so it is the same at any frame rate)
const shake = (t, k) => Math.sin(t * 91.7 + k * 1.3) * 0.5 + Math.sin(t * 57.3 + k * 2.9) * 0.3 + Math.sin(t * 143.1 + k * 0.7) * 0.2;

export const isDroneCrew = u => !!(u && u.spec && (u.spec.indirect || u.spec.key === 'fpv' || u.spec.key === 'fpv_fiber'));

export class FpvFeed {
  constructor() { this.on = false; this.unit = null; this.snowT = 0; this.tear = 0; this.rs = 12345; this.last = null; this.sig = {}; this.frozenKey = null; this.grabKey = null; this.info = null; this.losKey = ''; this.masked = false; this._v = null; }

  _dom() {
    if (this.el) return; if (window.__beta) window.__beta.fpvFeed = this;   /* for the page tests */ const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    const el = this.el = mk('div'); el.id = 'fpv'; el.hidden = true;
    this.freeze = mk('canvas'); this.freeze.id = 'fpv-freeze'; this.freeze.width = 640; this.freeze.height = 360;
    this.snow = mk('canvas'); this.snow.id = 'fpv-snow'; this.snow.width = 192; this.snow.height = 108;
    this.rollbar = mk('div', 'rollbar');
    const NS = 'http://www.w3.org/2000/svg', svg = this.svg = document.createElementNS(NS, 'svg');
    svg.innerHTML = '<g id="fpv-cross" stroke="#fff" stroke-width="2" fill="none"><path d="M-16,0 H-5 M5,0 H16 M0,-16 V-5 M0,5 V16"/></g><rect id="fpv-gate" x="-18" y="-14" width="36" height="28" fill="none" stroke="#ffd24a" stroke-width="1.5" stroke-dasharray="6 4"/>';
    this.T = {}; for (const k of ['tl', 'tr', 'bl', 'br', 'tc', 'bc', 'warn']) this.T[k] = mk('div', 't ' + k);
    this.cap = mk('div', 'cap'); this.cap.textContent = 'Representative FPV goggle feed';
    el.append(this.freeze, this.snow, mk('div', 'lines'), this.rollbar, svg, ...Object.values(this.T), this.cap); document.body.append(el);
  }
  _text(k, s) { if (this.sig[k] !== s) { this.sig[k] = s; this.T[k].textContent = s; } }

  // Which drone crew the camera belongs to: the team chosen in the menu if it flies drones, else one with a drone in the air, else any.
  pick(o) {
    const U = o.battle.units, crews = U.filter(isDroneCrew); if (!crews.length) return null;
    let u = crews.find(x => x.id === o.cams.enemyId);
    if (!u) { const flying = this._flying(o); u = crews.find(x => flying.has(x.id) && x.alive) || crews.find(x => x.alive && !x.gone) || crews[0]; o.cams.enemyId = u.id; }
    return u;
  }
  _flying(o) { const s = new Set(), L = o.volleys ? o.volleys.info : []; for (const m of L) if (m.drone) s.add(typeof m.th.idx === 'string' ? +m.th.idx.slice(2) : m.th.uid); return s; }

  // The drone of team u at battle time t: { phase: 'none' | 'wait' | 'fly' | 'end', ... } with everything the feed shows.
  status(o, u) {
    const B = o.battle, t = o.t, E = B.events || [], key = u.spec.key, fiber = key === 'fpv_fiber';
    // the battle writes a whole engagement into its event list at once (with times still to come), so the list is not in time order
    let launch = null, first = null;
    for (const e of E) if (e.uid === u.id && e.type === 'drone_launch' && e.t <= t && (!launch || e.t > launch.t)) launch = e;
    if (launch) for (const e of E) if (e.uid === u.id && e.type === 'end' && (e.key === 'fpv' || e.key === 'fpv_fiber') && e.t >= launch.t && (!first || e.t < first.t)) first = e;
    const end = first && first.t <= t ? first : null, endNext = first && first.t > t ? first : null;
    const m = (o.volleys ? o.volleys.info : []).find(x => x.drone && (x.th.uid === u.id || x.th.idx === 'tr' + u.id)) || null;
    const st = { u, key, fiber, t, launch, end, endNext, m, ta: launch ? t - launch.t : 0, sortie: launch ? u.id + ':' + launch.t : null };
    if (m && !end) st.phase = 'fly';
    else if (end) { st.te = t - end.t; st.phase = st.te > 6 && u.alive && !u.gone && u.ammo > 0 ? 'wait' : 'end'; }
    else if (launch) st.phase = u.alive && !u.gone ? 'hold' : 'end';      /* 'hold': between the fly-in and the attack run the lists are empty for an instant; pilot killed: the link is gone */
    else st.phase = 'wait';
    if (st.phase === 'end' && !end) { st.te = 99; st.pilotLost = true; }
    return st;
  }

  // Called every frame by EnemyViews. o: { cams, battle, volleys, world, tank (as drawn), t (battle time shown), dt }, on: is this view the one showing
  update(o, on) {
    if (!on) { if (this.on) this._off(); return; }
    this._dom(); const cams = o.cams, S = cams.s, cam = S.camera, W = o.world, T = o.tank;
    if (!this.on) { this.on = true; this.el.hidden = false; this.sig = {}; this.last = null; this._watch = setInterval(() => { if (performance.now() - this.seen > 400) this._off(); }, 250); }
    this.seen = performance.now();
    const u = this.unit = this.pick(o), tp = S.at(T.e, T.n, 2.2, this._tp || (this._tp = cam.position.clone())); if (!this._v) this._v = cam.position.clone();
    if (!u) { this._show({ phase: 'none' }, 0, false, 'В ЭТОМ БОЮ НЕТ ДРОНОВ · no drone crew in this battle', false, o); cam.position.set(tp.x - 40, tp.y + 18, tp.z + 40); cam.up.set(0, 1, 0); cam.lookAt(tp); this._fov(cam, 60); return; }
    const st = this.status(o, u), m = st.m, tt = m ? m.tt : (window.HK && window.HK.THREATS[st.key]) || { speed: 30, range_max: 4000 }; this.info = st;
    let q = 100, noise = 0, warn = '', alarm = false, dead = false, frozen = false;

    if (st.phase === 'fly') {
      // ---- the camera, on the drone: just ahead of its nose, looking mostly along the flight path but keeping the vehicle in frame the
      // closer it gets (the pilot flies the path and watches the target), banked a little with the airframe, and shaking with the motors.
      const p = m.p, d = m.dir, tx = tp.x - p.x, ty = tp.y - p.y, tz = tp.z - p.z, tn = Math.hypot(tx, ty, tz) || 1, w = clamp(1.3 - tn / 1500, 0.6, 0.97);
      let lx = d.x * (1 - w) + tx / tn * w, ly = d.y * (1 - w) + ty / tn * w, lz = d.z * (1 - w) + tz / tn * w;
      const alt = Math.max(0, p.y - W.h(p.x, -p.z)), spd = this._speed(o, st, tt), jolt = this._jolt(o, st), tt0 = st.t;
      const amp = (0.0035 + 0.0025 * Math.min(1.5, spd / 30)) * (1 + 7 * jolt);
      lx += shake(tt0, 1) * amp; ly += shake(tt0, 2) * amp; lz += shake(tt0, 3) * amp;
      cam.position.set(p.x + d.x * 0.5 + shake(tt0, 4) * 0.012, p.y + 0.25 + shake(tt0, 5) * 0.012, p.z + d.z * 0.5 + shake(tt0, 6) * 0.012);
      const roll = 0.085 * Math.sin(tt0 * 4.3 + u.id) + 0.05 * Math.sin(tt0 * 1.7 + u.id * 2) + shake(tt0, 7) * 0.006 * (1 + 10 * jolt), rx = -lz, rz = lx, rn = Math.hypot(rx, rz) || 1;
      cam.up.set(-rx / rn * Math.sin(roll), Math.cos(roll), -rz / rn * Math.sin(roll)); cam.lookAt(cam.position.x + lx * 60, cam.position.y + ly * 60, cam.position.z + lz * 60); this._fov(cam, 76);
      // ---- the link (representative: see the top of this file)
      const home = Math.hypot(p.x - u.e, -p.z - u.n), jamOn = !!(B_ew(o.battle) && !st.fiber), jam = jamOn && m.range < 450 ? 70 * (1 - m.range / 450) : 0;
      const lk = Math.floor(st.t * 4) + ':' + st.sortie; if (lk !== this.losKey) { this.losKey = lk; this.masked = !st.fiber && !W.los(u.e, u.n, 1.5, p.x, -p.z, Math.max(0.5, alt)).clear; }
      q = st.fiber ? 100 : clamp(99 - 38 * home / 3000 - (alt < 14 ? (14 - alt) * 2.5 : 0) - jam - (this.masked ? 15 : 0), 0, 99);
      const en = st.endNext, left = en ? en.t - st.t : 99;
      if (!st.fiber && en && en.how !== 'hit' && left < 0.35) q *= Math.max(0, left / 0.35);       /* the picture breaks up in the last instant before the drone is destroyed */
      noise = st.fiber ? 0 : Math.pow(1 - q / 100, 1.4); if (jolt > 0.05 && !st.fiber) noise = Math.max(noise, Math.min(0.6, jolt * 0.5));
      if (q < 35 && !st.fiber) { warn = 'RXLOSS'; alarm = true; } else if (q < 60 && !st.fiber) warn = 'LOW LINK';
      if (en && en.how === 'hit' && left < 0.3 && left > 0) this._grab(S, st.sortie);                 /* keep the last picture before impact */
      const mm = Math.floor(st.ta / 60), ss = pad2(Math.floor(st.ta % 60));
      this._text('tl', st.fiber ? `ОПТОВОЛОКНО · FIBRE LINK\nКАБЕЛЬ ${Math.max(0, Math.round(((tt.range_max || 10000) - home) / 10) * 10)} m` : `RSSI ${pad2(Math.round(q))}  LQ ${Math.round(q > 50 ? 100 : q * 2)}`);
      this._text('tr', `${mm}:${ss}\nARMED · ACRO`);
      this._text('bl', `${(24.9 - Math.min(3, st.ta * 0.012) - (spd > 25 ? 0.5 : 0)).toFixed(1)}V  ${Math.round(st.ta * 11 / 10) * 10} mAh`);
      this._text('br', `${Math.round(spd * 3.6)} km/h\nALT ${Math.round(alt)} m\nDST ${Math.round(m.range / 5) * 5} m`);
      this._text('bc', `HOME ${Math.round(home / 10) * 10} m`);
      this.last = { q, sortie: st.sortie };
      // the box on the vehicle, when it is in the picture
      const v = this._v.copy(tp).project(cam), gate = this.svg.lastChild, Wd = this.el.clientWidth, Hd = this.el.clientHeight;
      if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) gate.setAttribute('transform', `translate(${((v.x * 0.5 + 0.5) * Wd).toFixed(1)} ${((-v.y * 0.5 + 0.5) * Hd).toFixed(1)})`); else gate.setAttribute('transform', 'translate(-999 -999)');
      this.svg.firstChild.setAttribute('transform', `translate(${Wd / 2} ${Hd / 2})`);
    } else if (st.phase === 'hold') {
      /* nothing new to show for an instant: the camera and the display stay as they were */
      q = this.last ? this.last.q : 100; noise = st.fiber ? 0 : Math.pow(1 - q / 100, 1.4);
    } else if (st.phase === 'wait') {
      // not launched yet: the picture from the drone sitting beside its pilot, motors off
      const de = T.e - u.e, dn = T.n - u.n, R = Math.hypot(de, dn) || 1; cam.position.copy(S.at(u.e + de / R * 1.5, u.n + dn / R * 1.5, 0.35, this._v)); cam.up.set(0, 1, 0); cam.lookAt(tp.x, cam.position.y + 6, tp.z); this._fov(cam, 76);
      this._text('tl', st.fiber ? 'ОПТОВОЛОКНО · FIBRE LINK' : 'RSSI 99  LQ 100'); this._text('tr', '0:00\nDISARMED'); this._text('bl', '25.1V  0 mAh'); this._text('br', `ЦЕЛЬ ${Math.round(R / 10) * 10} m`); this._text('bc', '');
      warn = !u.alive || u.gone ? 'РАСЧЁТ УНИЧТОЖЕН · crew destroyed' : u.ammo > 0 ? 'ОЖИДАНИЕ · waiting to launch' : 'ДРОНОВ НЕТ · no drones left'; this.svg.lastChild.setAttribute('transform', 'translate(-999 -999)'); this.svg.firstChild.setAttribute('transform', 'translate(-999 -999)');
    } else {
      // the flight is over. A drone that reached the vehicle: the picture freezes on its last frame. Anything else: the picture is gone.
      dead = true; q = 0; alarm = true; const hit = st.end && st.end.how === 'hit'; frozen = hit && this.frozenKey === st.sortie;
      noise = st.fiber ? 0 : frozen ? 0.5 : 1; warn = st.fiber ? 'СВЯЗЬ ПОТЕРЯНА · LINK LOST' : 'НЕТ СИГНАЛА · NO SIGNAL';
      if (!st.fiber) this._text('tl', 'RSSI 00  LQ 0'); this.svg.lastChild.setAttribute('transform', 'translate(-999 -999)');
      this._text('bc', st.pilotLost ? 'ОПЕРАТОР ПОТЕРЯН · pilot lost' : hit ? (st.end.killing ? 'ПОПАДАНИЕ · impact, target destroyed' : 'ПОПАДАНИЕ · impact') : st.end && st.end.how === 'ground' ? 'ПАДЕНИЕ · flew into the ground' : 'ДРОН УНИЧТОЖЕН · drone destroyed');
    }
    this._show(st, noise, dead, warn, alarm, o, frozen);
  }

  _fov(cam, f) { if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); } }
  // metres per second along its path: the engine's own distance-to-go for the attack run, the drone's cruise speed on the way in
  _speed(o, st, tt) { const th = st.m.th, HKe = window.HK, v = o.battle.volleys && o.battle.volleys[o.battle.volleys.length - 1]; if (typeof th.idx === 'number' && HKe && HKe.distAt && v) { const tv = st.t - v.t0, a = HKe.distAt(th, tv), b = HKe.distAt(th, tv + 0.2); if (isFinite(a) && isFinite(b) && a > b) return (a - b) / 0.2; } return th.v || tt.speed || 30; }
  // HKOI's rounds going past this drone (from the engagement record): 1 at the instant a round passes, fading over a third of a second
  _jolt(o, st) { const th = st.m.th, V = o.battle.volleys, v = V && V[V.length - 1]; if (typeof th.idx !== 'number' || !v || !v.rec) return 0; const tv = st.t - v.t0; let j = 0;
    for (const b of v.rec.bursts || []) { if (b.idx !== th.idx || b.kind !== 'he') continue; for (const r of b.rounds || []) { const tb = r.t_burst != null ? r.t_burst : r.t_pass, a = tv - tb; if (a >= 0 && a < 0.35) j = Math.max(j, 1 - a / 0.35); } } return j; }
  // copy the picture just drawn (after this frame's render) so it can stay on screen once the drone has hit
  _grab(S, key) { if (this.grabKey === key + ':q') return; this.grabKey = key + ':q'; queueMicrotask(() => { this.grabKey = null; try { const x = this.freeze.getContext('2d'); x.drawImage(S.canvas, 0, 0, this.freeze.width, this.freeze.height); this.frozenKey = key; } catch (e) { /* no picture to keep: the feed goes to snow instead */ } }); }

  // the look of the picture: wash, snow, tearing, roll bar, warnings
  _show(st, noise, dead, warn, alarm, o, frozen) {
    const el = this.el, cv = o.cams.s.canvas, fly = st.phase === 'fly' || st.phase === 'hold', cls = (dead ? 'dead ' : '') + (frozen ? 'frozen ' : '') + (st.phase === 'wait' || st.phase === 'none' ? 'wait ' : '') + (dead && !frozen && st.fiber ? 'black' : '');
    if (this.sig.cls !== cls) { this.sig.cls = cls; el.className = cls; }
    if (st.phase === 'none') { for (const k of ['tl', 'tr', 'bl', 'br', 'bc', 'tc']) this._text(k, ''); this.svg.style.display = 'none'; } else { this.svg.style.display = ''; this._text('tc', `${st.u.spec.name.toUpperCase()} #${st.u.id + 1}`); }
    if (this.sig.warn !== warn + alarm) { this.sig.warn = warn + alarm; this.T.warn.textContent = warn; this.T.warn.className = 't warn' + (alarm ? ' alarm' : ''); }
    // the 3D picture under the overlay: washed out like a cheap analogue camera, greyer as the link weakens; black once it is gone
    const sat = st.fiber ? 0.8 : Math.max(0.05, 0.6 - 0.55 * noise), f = dead && !frozen ? 'brightness(0)' : fly ? (st.fiber ? `saturate(${sat}) contrast(1.08) blur(.35px)` : `saturate(${sat.toFixed(2)}) contrast(1.25) blur(.45px)`) : '';
    if (this.sig.f !== f) { this.sig.f = f; cv.style.filter = f; }
    this.snowT += o.dt || 0.016; const tick = this.snowT >= 1 / 30; if (tick) this.snowT = 0;
    const so = noise > 0.02 ? Math.min(1, 0.25 + noise) : 0; if (this.sig.so !== so) { this.sig.so = so; this.snow.style.opacity = so; this.rollbar.style.opacity = Math.min(0.9, noise * 1.6); }
    if (tick && noise > 0.02) this._snow(noise);
    // tearing: now and then the whole picture slips sideways for a thirtieth of a second, more often the weaker the link
    if (tick) { const slip = fly && !dead && noise > 0.12 && this._rnd() < noise * 0.5 ? (this._rnd() - 0.5) * 60 * noise : 0, tr = slip ? `translateX(${slip.toFixed(1)}px) skewX(${(slip * 0.12).toFixed(2)}deg)` : ''; if (this.sig.tr !== tr) { this.sig.tr = tr; cv.style.transform = tr; } }
  }
  _rnd() { let s = this.rs; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.rs = s; return (s >>> 0) / 4294967296; }
  _snow(noise) {
    const x = this.snow.getContext('2d'), w = this.snow.width, h = this.snow.height, im = this._im || (this._im = x.createImageData(w, h)), d = im.data, band = this._rnd() * h, bh = 6 + this._rnd() * 20 * noise, base = noise * noise;
    for (let y = 0; y < h; y++) { const strong = (y > band && y < band + bh) || this._rnd() < noise * 0.12, a0 = strong ? 0.9 : base; let s = this.rs;
      for (let i = 0, k = y * w * 4; i < w; i++, k += 4) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const v = s & 255, a = a0 * (102 + ((s >>> 8) & 127) * 1.2); d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = a; } this.rs = s; }
    x.putImageData(im, 0, 0);
  }
  _off() { this.on = false; clearInterval(this._watch); if (!this.el) return; this.el.hidden = true; const cv = document.getElementById('view'); if (cv) { cv.style.filter = ''; cv.style.transform = ''; } this.sig = {}; this.last = null; }
}
// is the vehicle's drone jammer switched on in this battle's settings? (engine: cfg.ew.drone_jammer; off by default)
function B_ew(battle) { const c = battle && battle.cfg0; return !!(c && c.ew && c.ew.drone_jammer); }
