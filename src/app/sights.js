// HKOI Battlefield: the three sight pictures the player watches the crew through.
//   gunner's primary sight (camera 'gnr'): day channel and thermal channel (white hot / black hot, shown green as in the eyepiece),
//     3x and 10x, a reticle with a centre gap and stadia, the laser's flash and the range it returns, the round in the breech, the
//     lead the computer has put on a crossing target (a pip shows where the gun points; the reticle stays on the target, as in the
//     real sight), the jolt and the blast cloud when the gun fires. Everything is read from the crew AI's own lay (battle._rf for a
//     team, battle._vxs.rfv for a vehicle, battle.tank.tur, the 'gun' events): the picture shows what the gunner is doing.
//   commander's independent viewer (camera 'citv'): thermal picture, its own cross, a bearing tape with the hull and the gun on it.
//   HKOI sight (camera 'hkoi'): the station's own thermal camera with its tracker's gate (the only automatic tracker on the tank, so
//     the only target box), the gun line, time to go, and the warning when its own tank masks the shot (station.js elevation tables).
// Nothing here changes the battle. The frame code allocates nothing; every DOM write is guarded by a comparison.
// ASSUMED optics (open sources): gunner's sight 3x / 21 degrees and 10x / 6.5 degrees; viewer 13 and 3.4 degrees; HKOI camera 14 and 4.
import { elevationFloor } from '../render/station.js';
const DEG = Math.PI / 180, $ = id => document.getElementById(id), pad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');
const CSS = `
#sight > .ring, #sight > .h, #sight > .v, #sight > .tick, #sight > .data, #sight > .sym { display: none; }
#sight { color: #ff5a3a; font: 600 15px/1.25 var(--mono, monospace); }
#sight.tis { color: #d6ffd0; }
.sg-full { position: absolute; inset: 0; pointer-events: none; }
.sg-round { -webkit-mask: radial-gradient(circle at 50% 50%, #000 min(41vh, 41vw), transparent calc(min(41vh, 41vw) + 1px)); mask: radial-gradient(circle at 50% 50%, #000 min(41vh, 41vw), transparent calc(min(41vh, 41vw) + 1px)); }
#sg-tint { background: #63ff7c; mix-blend-mode: multiply; display: none; } #sight.tis #sg-tint { display: block; }
.sg-lines { background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px); display: none; } .tis .sg-lines, #tsight.th .sg-lines { display: block; }
.sg-grain { width: 100%; height: 100%; image-rendering: pixelated; opacity: .10; mix-blend-mode: overlay; } .tis .sg-grain, #tsight.th .sg-grain { opacity: .34; }
#sg-blast { background: radial-gradient(ellipse at 50% 62%, rgba(214,196,160,.98) 0, rgba(150,132,104,.96) 38%, rgba(96,84,68,.9) 75%); opacity: 0; } #sight.tis #sg-blast { background: radial-gradient(ellipse at 50% 62%, #fff 0, #dfe 45%, #9b9 85%); }
#sg-edge { box-shadow: inset 0 0 0 100vmax transparent; } #sg-edge::after { content: ''; position: absolute; left: 50%; top: 50%; width: min(82vh, 82vw); height: min(82vh, 82vw); transform: translate(-50%, -50%); border-radius: 50%; box-shadow: inset 0 0 70px 26px rgba(0,0,0,.62), inset 0 0 6px 2px rgba(0,0,0,.9); }
#sg-ret, #ts-ret { position: absolute; left: 50%; top: 50%; width: min(82vh, 82vw); height: min(82vh, 82vw); transform: translate(-50%, -50%); overflow: visible; filter: drop-shadow(0 0 1.5px rgba(0,0,0,.9)); }
#sg-top, #sg-rng, #sg-ammo, #sg-rdy, #sg-lead, #sg-line { position: absolute; left: 50%; white-space: pre; text-shadow: 0 0 5px #000, 0 0 2px #000; letter-spacing: .08em; }
#sg-top { top: calc(50% - min(37vh, 37vw)); transform: translateX(-50%); font-size: 13px; opacity: .9; }
#sg-rng { top: calc(50% + min(27vh, 27vw)); transform: translateX(-50%); font-size: 26px; letter-spacing: .14em; }
#sg-ammo { top: calc(50% + min(28vh, 28vw)); transform: translateX(calc(-50% - min(15vh, 15vw))); font-size: 14px; }
#sg-rdy { top: calc(50% + min(28vh, 28vw)); transform: translateX(calc(-50% + min(15vh, 15vw))); font-size: 14px; }
#sg-lead { top: calc(50% + min(33vh, 33vw)); transform: translateX(-50%); font-size: 12px; opacity: .85; }
#sg-line { top: calc(50% + min(43vh, 43vw)); transform: translateX(-50%); font: 600 13px/1.3 var(--mono, monospace); color: #d8dccf; letter-spacing: .04em; }
#sg-lase { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 22px 12px currentColor; opacity: 0; }
#tsight > .frame, #tsight > .ch, #tsight > .cv { display: none; }
#tsight { --l: 12vw; --t: 6vh; --b: 16vh; }
#ts-mask { box-shadow: none; background: #000; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 var(--t), var(--l) var(--t), var(--l) calc(100% - var(--b)), calc(100% - var(--l)) calc(100% - var(--b)), calc(100% - var(--l)) var(--t), 0 var(--t)); }
.ts-pic { clip-path: inset(var(--t) var(--l) var(--b) var(--l)); }
#ts-vig { box-shadow: none; } #ts-vig::after { content: ''; position: absolute; left: var(--l); right: var(--l); top: var(--t); bottom: var(--b); box-shadow: inset 0 0 90px 30px rgba(0,0,0,.6); border: 2px solid #1c241d; border-radius: 10px; }
#ts-ret { top: calc(var(--t) + (100vh - var(--t) - var(--b)) / 2); width: min(60vh, 60vw); height: min(60vh, 60vw); color: #d9ffe0; }
#tsight #ts-top { top: calc(var(--t) + 12px); } #tsight #ts-bot { top: auto; bottom: calc(var(--b) + 14px); }
#ts-tape { position: absolute; left: 50%; top: calc(var(--t) + 40px); width: min(46vw, 560px); height: 30px; transform: translateX(-50%); overflow: visible; color: #d9ffe0; }
#ts-side { position: absolute; left: calc(var(--l) + 16px); top: 50%; transform: translateY(-50%); white-space: pre; line-height: 1.6; } #ts-warn { position: absolute; left: 50%; top: calc(var(--t) + (100vh - var(--t) - var(--b)) * .72); transform: translateX(-50%); color: #ffb04a; letter-spacing: .12em; white-space: nowrap; }
#ts-box { border-color: #d9ffe0 !important; background: linear-gradient(#d9ffe0, #d9ffe0) 0 0 / 10px 1.5px no-repeat; border-style: dashed !important; }
`;
const RET_GNR = `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="butt">
<line x1="-310" y1="0" x2="-24" y2="0"/><line x1="24" y1="0" x2="310" y2="0"/><line x1="0" y1="24" x2="0" y2="250"/><line x1="0" y1="-24" x2="0" y2="-110"/>
<circle r="2.4" fill="currentColor" stroke="none"/><circle r="11" stroke-width="1.1"/>
${[-225, -150, -75, 75, 150, 225].map(x => `<line x1="${x}" y1="-9" x2="${x}" y2="9"/>`).join('')}${[[70, 30], [130, 22], [190, 15]].map(([y, w]) => `<line x1="${-w}" y1="${y}" x2="${w}" y2="${y}"/>`).join('')}
<g id="sg-pip" stroke-width="1.5"><path d="M0 -9 L8 0 L0 9 L-8 0 Z"/><line x1="0" y1="-18" x2="0" y2="-9"/></g></g>`;
const RET_CITV = `<g fill="none" stroke="currentColor" stroke-width="1.6"><line x1="-200" y1="0" x2="-36" y2="0"/><line x1="36" y1="0" x2="200" y2="0"/><line x1="0" y1="36" x2="0" y2="200"/><line x1="0" y1="-36" x2="0" y2="-200"/><circle r="2.5" fill="currentColor" stroke="none"/>
<path d="M-90 -70 L-90 -90 L-70 -90 M70 -90 L90 -90 L90 -70 M90 70 L90 90 L70 90 M-70 90 L-90 90 L-90 70"/></g>`;
const RET_HKOI = `<g fill="none" stroke="currentColor" stroke-width="1.6"><line x1="-160" y1="0" x2="-20" y2="0"/><line x1="20" y1="0" x2="160" y2="0"/><line x1="0" y1="20" x2="0" y2="160"/><line x1="0" y1="-20" x2="0" y2="-160"/>
<circle r="60" stroke-dasharray="6 10" stroke-width="1.1"/><g id="ts-gun" stroke="#ffd27a" stroke-width="1.8"><circle r="13"/><line x1="-24" y1="0" x2="-13" y2="0"/><line x1="13" y1="0" x2="24" y2="0"/><line x1="0" y1="13" x2="0" y2="24"/></g></g>`;

export class Sights {
  constructor() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const mk = (par, tag, id, cls, html) => { const e = document.createElementNS(tag === 'svg' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag); if (id) e.id = id; if (cls) e.setAttribute('class', cls); if (tag === 'svg') e.setAttribute('viewBox', '-500 -500 1000 1000'); if (html) e.innerHTML = html; par.insertBefore(e, par.firstChild); return e; };
    const sg = this.sg = $('sight'), ts = this.ts = $('tsight'); this.ok = !!(sg && ts); if (!this.ok) return;
    // gunner's sight (inserted first to last = top to bottom)
    for (const id of ['sg-line', 'sg-lead', 'sg-rdy', 'sg-ammo', 'sg-rng', 'sg-top']) mk(sg, 'div', id); mk(sg, 'div', 'sg-lase'); mk(sg, 'svg', 'sg-ret', null, RET_GNR); mk(sg, 'div', 'sg-edge', 'sg-full');
    mk(sg, 'div', 'sg-blast', 'sg-full sg-round'); this.gGrain = mk(mk(sg, 'div', null, 'sg-full sg-round'), 'canvas', null, 'sg-grain'); mk(sg, 'div', null, 'sg-full sg-round sg-lines'); mk(sg, 'div', 'sg-tint', 'sg-full sg-round');
    // sensor displays
    mk(ts, 'div', 'ts-warn'); mk(ts, 'div', 'ts-side'); mk(ts, 'svg', 'ts-tape'); $('ts-tape').setAttribute('viewBox', '-280 0 560 30'); mk(ts, 'svg', 'ts-ret'); mk(ts, 'div', 'ts-vig', 'sg-full'); mk(ts, 'div', 'ts-mask', 'sg-full');
    this.tGrain = mk(mk(ts, 'div', null, 'sg-full ts-pic'), 'canvas', null, 'sg-grain'); mk(ts, 'div', null, 'sg-full ts-pic sg-lines');
    // four frames of grain, made once; one is drawn each 1/25 s at a shifted place
    this.noise = []; let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let f = 0; f < 4; f++) { const c = document.createElement('canvas'); c.width = 256; c.height = 144; const x = c.getContext('2d'), im = x.createImageData(256, 144), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (rnd() + rnd()) * 127.5 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } x.putImageData(im, 0, 0); this.noise.push(c); }
    for (const c of [this.gGrain, this.tGrain]) { c.width = 224; c.height = 126; } this.gx = this.gGrain.getContext('2d'); this.tx = this.tGrain.getContext('2d');
    this.sig = {}; this.nf = -1; this.lase = { k: null, t: -99 }; this.shot = { n: -1, t: -99 }; this.tsMode = ''; this.tape = '';
  }
  set(id, txt) { if (this.sig[id] !== txt) { this.sig[id] = txt; $(id).textContent = txt; } }
  sty(id, prop, val) { const k = id + '.' + prop; if (this.sig[k] !== val) { this.sig[k] = val; $(id).style[prop] = val; } }
  // what the gunner is laid on, from the crew AI
  lay(B) { const T = B.tank, X = B._vxs, rv = X && X.rfv, rf = B._rf, L = this._lay || (this._lay = {}); L.type = (X && X.loadedType) || 'mp';
    if (rv && rv.v && rv.v.alive !== false && T.alive) { const v = rv.v; L.e = v.e; L.n = v.n; L.agl = 1.2; L.at = rv.at; L.key = 'v' + v.id; L.name = (v.K ? v.K.name : 'vehicle') + ' #' + (v.id + 1); const sp = v.state === 'moving' ? (v.spd || 0) : 0, h = (v.hull || 0) * DEG, R = Math.hypot(v.e - T.e, v.n - T.n) || 1, le = (v.e - T.e) / R, ln = (v.n - T.n) / R; L.cross = sp * (Math.sin(h) * ln - Math.cos(h) * le); return L; }
    if (rf && rf.k && T.alive) { const k = rf.k, u = B.units && B.units.find(q => q.id === k.id); L.e = k.e; L.n = k.n; L.agl = 1; L.at = rf.at; L.key = 'u' + k.id; L.name = u ? u.spec.name + ' #' + (u.id + 1) : 'located site'; L.cross = 0; return L; }
    return null; }
  // S: { on, dt, battle, cams, scene, tank, volleys, now }
  update(S) {
    if (!this.ok) return; const B = S.battle, T = B.tank, cams = S.cams, mode = S.on ? cams.mode : '', now = S.now, th = S.scene.thermal || 0;
    // the last main gun round fired at or before `now` (the list only grows; after a rewind it is searched again)
    { const ev = B.events || []; if (this.shot.n !== ev.length || now < this.shot.t) { this.shot.n = ev.length; this.shot.t = -99; for (let i = ev.length - 1; i >= 0; i--) if (ev[i].type === 'gun' && ev[i].t <= now) { this.shot.t = ev[i].t; this.shot.R = ev[i].R; this.shot.tof = ev[i].tof; this.shot.hit = ev[i].hit; break; } } }
    const L = this.lay(B), age = now - this.shot.t; cams.lay = L; cams.shotAge = age; if (S.tank.hkoiSight) cams.hkoiEye = S.tank.hkoiSight(cams._hkEye || (cams._hkEye = S.scene.camera.position.clone()));
    if (mode !== 'gnr' && mode !== 'citv' && mode !== 'hkoi') return;
    const nf = Math.floor(performance.now() / 40); if (nf !== this.nf) { this.nf = nf; const x = mode === 'gnr' ? this.gx : this.tx; x.drawImage(this.noise[nf & 3], -((nf * 37) % 32), -((nf * 53) % 18)); }
    const fov = S.scene.camera.fov;
    if (mode === 'gnr') {
      const tis = th !== 0; if (this.sig.tis !== tis) { this.sig.tis = tis; this.sg.classList.toggle('tis', tis); }
      const R = L ? Math.hypot(L.e - T.e, L.n - T.n) : 0, on = !!(L && cams.onTarget), wait = L ? L.at - now : 0;
      if (!L || !on) { if (!L) this.lase.k = null; } else if (this.lase.k !== L.key) { this.lase.k = L.key; this.lase.t = now; this.lase.R = R; }   /* the laser is fired once the reticle is on: the range appears then */
      const lased = !!(L && this.lase.k === L.key), la = lased ? now - this.lase.t : 9, flash = la >= 0 && la < 0.18 ? 1 - la / 0.18 : 0;
      this.sty('sg-lase', 'opacity', flash.toFixed(2));
      const rounds = L && L.type === 'ap' ? (T.ap || 0) : T.main, v = L && L.type === 'ap' ? 1650 : 1140, lead = L && lased ? L.cross / v * 1000 : 0;   /* mils: crossing speed over the round's speed (ASSUMED 1,650 m/s sabot, 1,140 m/s multi-purpose, as the battle uses) */
      this.set('sg-top', `${pad(T.tur == null ? 0 : ((T.tur % 360) + 360) % 360, 3)}°   ${tis ? (th > 0 ? 'TIS WHT' : 'TIS BLK') : 'DAY'}   ${fov < 10 ? '10×' : '3×'}`);
      this.set('sg-rng', lased && la > 0.18 ? pad(Math.round(R / 10) * 10, 4) : age >= 0 && age < 4 && this.shot.R ? pad(Math.round(this.shot.R / 10) * 10, 4) : '----');
      this.set('sg-ammo', (L ? L.type : (B._vxs && B._vxs.loadedType) || 'mp') === 'ap' ? 'SABOT' : 'MPAT'); this.set('sg-rdy', T.loaded && on && lased ? '■ ' + pad(rounds, 2) : T.loaded ? '□ ' + pad(rounds, 2) : '– ' + pad(rounds, 2));
      this.set('sg-lead', Math.abs(lead) >= 0.3 ? `LEAD ${Math.abs(lead).toFixed(1)} ${lead > 0 ? 'R' : 'L'}` : '');
      { const upm = fov * 0.82 * 17.453 / 1000, px = Math.max(-300, Math.min(300, lead / upm)), vis = Math.abs(lead) >= 0.3; this.sty('sg-pip', 'display', vis ? '' : 'none'); if (vis) { const tr = `translate(${px.toFixed(1)}px, 0px)`; this.sty('sg-pip', 'transform', tr); } }
      // the gun fires: a flash, then the blast cloud drifting off (longer at 10x, where the cloud fills the picture). Battle time, so a replay shows the same.
      const blast = age < 0 || age > 5 ? 0 : age < 0.07 ? 1 : Math.min(0.97, 1.25 * Math.exp(-age / (fov < 10 ? 0.85 : 0.55))); this.sty('sg-blast', 'opacity', blast < 0.012 ? '0' : blast.toFixed(2));
      const obs = age >= 0 && age < (this.shot.tof || 0) + 2.5;
      this.set('sg-line', !T.alive ? 'SIGHT DEAD' : age >= 0 && age < (this.shot.tof || 0) ? `ON THE WAY   ${pad(this.shot.R, 4)} m   splash in ${Math.max(0, this.shot.tof - age).toFixed(1)} s` : obs ? (this.shot.hit ? 'TARGET' : 'LOST: OVER OR SHORT') :
        L ? `${L.name.toUpperCase()}   ${!on ? 'TRAVERSING' : !lased || la < 0.18 ? 'LASING' : !T.loaded ? 'LAID, WAITING FOR THE LOADER' : wait > 0.05 ? 'LAID, FIRES IN ' + wait.toFixed(1) + ' s' : 'FIRING'}` : !T.loaded && (T.main > 0 || T.ap > 0) ? 'LOADING   scanning' : 'SCANNING');
    } else {
      const hk = mode === 'hkoi'; if (this.tsMode !== mode) { this.tsMode = mode; $('ts-ret').innerHTML = hk ? RET_HKOI : RET_CITV; this.sig['ts-gun.transform'] = this.sig['ts-gun.display'] = null; }
      if (this.sig.th !== (th !== 0)) { this.sig.th = th !== 0; this.ts.classList.toggle('th', th !== 0); }
      if (!hk) {   // bearing tape: 10 degrees to a division, H = hull front, G = where the gun points
        const b = ((cams.citvYaw || 0) % 360 + 360) % 360, hull = S.hull == null ? T.h : S.hull, key = Math.round(b) + '|' + Math.round(T.tur || 0) + '|' + Math.round(hull); if (this.tape !== key) { this.tape = key; let h = '<g fill="none" stroke="currentColor" stroke-width="1.3" font-size="11" font-family="monospace">';
          for (let d = -40; d <= 40; d += 5) { const a = Math.round((b + d) / 5) * 5, x = (a - b) * 6.5; if (Math.abs(x) > 270) continue; const big = ((a % 10) + 10) % 10 === 0; h += `<line x1="${x.toFixed(1)}" y1="${big ? 6 : 11}" x2="${x.toFixed(1)}" y2="16"/>`; if (big && ((a % 30) + 30) % 30 === 0) h += `<text x="${x.toFixed(1)}" y="28" text-anchor="middle" fill="currentColor" stroke="none">${pad(((a % 360) + 360) % 360, 3)}</text>`; }
          const mark = (brg, ch) => { const d = ((brg - b + 540) % 360) - 180, x = Math.max(-270, Math.min(270, d * 6.5)); return `<text x="${x.toFixed(1)}" y="4" text-anchor="middle" fill="${Math.abs(d) > 41 ? '#8fa894' : '#ffd27a'}" stroke="none">${Math.abs(d) > 41 ? (d < 0 ? '‹' + ch : ch + '›') : ch}</text>`; };
          h += mark(T.tur || 0, 'G') + mark(hull, 'H') + '<path d="M0 17 L-5 24 L5 24 Z" fill="currentColor" stroke="none"/></g>'; $('ts-tape').innerHTML = h; }
        this.sty('ts-tape', 'display', ''); this.set('ts-side', ''); const same = L && cams.citvOn; this.set('ts-warn', same ? 'GUNNER IS ON THIS TARGET' : '');
      } else {
        this.sty('ts-tape', 'display', 'none'); const k = S.tank, vol = S.volleys, aim = vol && vol.aimAt, m = vol && vol.info ? vol.info.reduce((a, x) => x.cued && (!a || x.range < a.range) ? x : a, null) : null;
        const fl = k.rwsY != null ? elevationFloor(k.rwsY, k.stationCrewUp) : -10, st = T.st || {}; let warn = '';
        if (m && m.p) { const e = cams.hkoiEye, dy = m.p.y - e.y, dh = Math.hypot(m.p.x - e.x, m.p.z - e.z), el = Math.atan2(dy, dh) / DEG; if (el < fl - 0.5) warn = 'MASKED BY OWN TANK: GUN HELD AT ' + fl.toFixed(0) + '°'; }
        this.set('ts-warn', warn);
        this.set('ts-side', `STN BRG ${k.rwsY == null ? '---' : pad(((k.rwsY % 360) + 360) % 360, 3)}\nGUN EL  ${k.rwsP == null ? '--' : (k.rwsP >= 0 ? '+' : '−') + pad(Math.abs(k.rwsP), 2)}\nLIMIT   ${(fl >= 0 ? '+' : '−') + pad(Math.abs(fl), 2)}\n${m ? 'TTG ' + (m.tti != null ? m.tti.toFixed(1) : m.speed ? (m.range / m.speed).toFixed(1) : '--') + ' s' : 'NO TRACK'}\n${aim ? 'FIRING' : m ? 'TRACKING' : 'SEARCH'}`);
        // where the gun points, against the camera's cross: the station's own bearing and elevation, projected
        if (k.muzzle && k.rwsPitch) { const v = this._v || (this._v = S.scene.camera.position.clone()), q = this._q || (this._q = S.scene.camera.position.clone()); k.rwsPitch.getWorldPosition(q); k.muzzle.getWorldPosition(v); v.sub(q).multiplyScalar(600).add(q).project(S.scene.camera); const vis = v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9; this.sty('ts-gun', 'display', vis ? '' : 'none');
          if (vis) { const w = Math.min(innerWidth, innerHeight) * 0.6, cx = v.x / 2 * innerWidth, cy = (1 - v.y) / 2 * innerHeight - innerHeight * 0.45, u = 1000 / (w || 1);   /* the reticle's box: see the CSS above (centred at 45% of the height, 60% of the shorter side across) */ this.sty('ts-gun', 'transform', `translate(${(cx * u).toFixed(0)}px, ${(cy * u).toFixed(0)}px)`); } }
      }
    }
  }
}
