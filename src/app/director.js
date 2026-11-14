// The film director: a mode in which the simulator films its own battle, so that someone who has never seen HKOI can follow it.
// The planning (which shot when, which caption, where slow motion falls) is in director_plan.js and is pure logic on battle time.
// This file carries it out on the page: it switches the existing cameras (src/render/cameras.js), places the camera itself for
// the angles those do not have, shows the caption line, and lowers the page's speed setting around the decisive moment.
//
// It never touches the battle. It hands the camera straight back when the viewer clicks or wheels on the picture, or picks a
// camera with a key or a button; the captions stay. Press the Director key or button again to let it film again.
import * as THREE from 'three';
import { Plan } from './director_plan.js';

const DEG = Math.PI / 180, SLOW = 0.25, AGAIN = 0.5, KEY = 'KeyF';
const CSS = `
  #dir-cap { position: fixed; left: 50%; bottom: 112px; transform: translateX(-50%); max-width: min(980px, calc(100vw - 48px)); padding: 9px 20px 10px; z-index: 3;
    background: linear-gradient(90deg, rgba(4, 8, 7, 0), rgba(4, 8, 7, .78) 12%, rgba(4, 8, 7, .78) 88%, rgba(4, 8, 7, 0)); border-top: 1px solid rgba(57, 217, 138, .35);
    font-size: clamp(16px, 1.75vw, 23px); font-weight: 600; letter-spacing: .01em; text-align: center; text-shadow: 0 1px 3px #000; pointer-events: none; transition: opacity .25s; }
  #dir-cap.docked { position: static; transform: none; left: auto; bottom: auto; }   /* in the page's dock: stacked above the replay bar and the control bar, never over them */
  @media (max-width: 1700px) { body.hud-eng #dir-cap.docked { max-width: max(300px, calc(100vw - 850px)); } }
  #dir-tag { position: fixed; right: 16px; top: 64px; z-index: 3; display: flex; gap: 6px; pointer-events: none; font: 700 12px/1 var(--mono, monospace); letter-spacing: .08em; }
  #dir-tag span { padding: 5px 8px; border-radius: 5px; background: rgba(4, 8, 7, .8); border: 1px solid var(--line, #2a5); color: var(--accent, #39d98a); }
  #dir-tag span.slow { color: #05130c; background: var(--warn, #ffb347); border-color: var(--warn, #ffb347); }
  #dir-tag span.idle { color: var(--dim, #93a39a); }
`;

export class Director {
  // app: what the page lets the director read and set (see the one line in main.js):
  //   scene, cams, tank, store, el, shown {e, n, h}; battle, volleys, tNow, state, playing, mapOpen (read); speed (read and set); refresh()
  constructor(app) {
    this.app = app; this.on = !!app.store.get('director', false); this.yielded = false; this.ctrl = false; this.slow = false; this.slowSkip = false; this.saved = 1;
    this.plan = new Plan({ HK: typeof HK !== 'undefined' ? HK : window.HK, DMG: typeof DMG !== 'undefined' ? DMG : window.DMG });   /* the engine and the damage model are page globals, not properties of window */ this.b = null; this.shot = null; this.modeSet = null; this.userMode = 'orbit'; this.capText = null; this.side = 1; this.az = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.v1 = new THREE.Vector3(); this.lastP = new THREE.Vector3(); this.hasLast = false;
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    this.cap = app.el('div'); this.cap.id = 'dir-cap'; this.cap.style.opacity = 0; this.tag = app.el('div'); this.tag.id = 'dir-tag'; this.tag.hidden = true;
    this.tagOn = app.el('span', null, 'DIRECTOR'); this.tagSlow = app.el('span', 'slow', '×' + SLOW); this.tagSlow.hidden = true; this.tagRp = app.el('span', 'slow', 'REPLAY \u00d7' + AGAIN); this.tagRp.hidden = true; this.rp = null; this.replayed = new Set(); this.mine = false; this.rpSaved = 1; this.tag.append(this.tagOn, this.tagSlow, this.tagRp); document.body.append(this.cap, this.tag);
    { const dock = document.getElementById('dock'); if (dock) { this.cap.classList.add('docked'); this.cap.style.display = 'none'; dock.insertBefore(this.cap, document.getElementById('replay') || document.getElementById('bar') || null); } }
    this.btn = app.el('button', 'btn', 'Director'); this.btn.title = 'The simulator films its own battle: automatic camera, captions, slow motion at the decisive moment (F)'; this.btn.onclick = () => this.toggle(); this._paint();
    window.addEventListener('keydown', e => { if (e.code === KEY && app.state === 'play' && !(e.target && e.target.tagName === 'INPUT') && !e.ctrlKey && !e.metaKey) this.toggle(); });
    // a click or the wheel on the picture: the viewer wants the camera
    const cv = app.scene.canvas, take = () => { if (this.ctrl) { this.yielded = true; this._release(true); } };
    cv.addEventListener('pointerdown', take, true); cv.addEventListener('wheel', take, { capture: true, passive: true });
  }
  // the button for the page's control bar (one element, kept up to date here)
  button() { return this.btn; }
  _paint() { this.btn.className = 'btn' + (this.on ? ' on' : ''); this.btn.textContent = this.on && this.yielded ? 'Director (paused)' : 'Director'; this.tagOn.textContent = this.yielded ? 'DIRECTOR: CAPTIONS ONLY' : 'DIRECTOR'; this.tagOn.className = this.yielded ? 'idle' : ''; }
  // off -> on; on but the viewer has the camera -> filming again; filming -> off
  toggle() {
    if (this.on && this.yielded) this.yielded = false; else { this.on = !this.on; this.yielded = false; this.app.store.set('director', this.on); if (!this.on) this._release(true); }
    this._paint();
  }
  // give the camera (and the speed) back
  _release(restoreView) {
    const A = this.app; if (this.slow) { if (A.speed === SLOW) A.speed = this.saved; this.slow = false; } this.tagSlow.hidden = true; this.slowSkip = false;
    if (this.rp) { if (A.speed === AGAIN) A.speed = this.rpSaved; this.rp = null; this.tagRp.hidden = true; }
    if (!this.ctrl) { this._paint(); return; } this.ctrl = false; this.shot = null;
    if (restoreView || A.cams.mode === 'free') { A.cams.set(this.userMode); if (this.userMode === 'orbit' || this.userMode === 'cut') { const T = A.shown; A.scene.camera.position.copy(A.scene.at(T.e - 26, T.n - 34, 13, this.v1)); } }
    this.modeSet = null; this._paint(); A.refresh();
  }

  // once a frame, before the cameras are updated
  update(dt) {
    const A = this.app, b = A.battle, live = this.on && A.state === 'play' && !!b && !!A.volleys;
    if (window.__beta && window.__beta.director !== this) window.__beta.director = this;
    for (const id of ['caption', 'subs']) { const o = document.getElementById(id); if (o) { const v = live ? 'none' : ''; if (o.style.display !== v) o.style.display = v; } }   /* the page's own caption line and the crew subtitles give way to the director's captions */
    if (this.tag.hidden === live) this.tag.hidden = !live;
    if (!live) { if (this.capText !== null) { this.capText = null; this.cap.style.opacity = 0; if (this.cap.classList.contains('docked')) this.cap.style.display = 'none'; } if (this.ctrl || this.slow) this._release(false); return; }
    if (b !== this.b) {   /* a new battle, or the same one started over for a rewind */
      this.b = b; this.shot = null;
      if (!this.mine) { this.replayed.clear(); if (this.rp) this._again(null); }   /* the viewer jumped in time: replays may be shown again */
      this.mine = false;
      if (this.ctrl && A.cams.mode !== this.modeSet) { this.ctrl = false; this.modeSet = null; }   /* the page has reset the camera for a new battle */
      if (b.t < 0.5 && this.yielded) { this.yielded = false; this._paint(); }
    }
    this.plan.sync(b);
    const t = Math.min(A.tNow, b.t);
    // the caption line
    const c = this.plan.captionAt(t), text = c ? c.text : '';
    if (text !== this.capText) { this.capText = text; if (text) this.cap.textContent = text; this.cap.style.opacity = text ? 1 : 0;
      if (this.cap.classList.contains('docked')) this.cap.style.display = text ? '' : 'none'; else {
      const bar = document.getElementById('bar'), top = bar && !bar.hidden ? bar.getBoundingClientRect().top : 0; if (top > 0) this.cap.style.bottom = Math.round(innerHeight - top + 12) + 'px'; } }   /* no dock on this page: sit just above the control bar, however tall it is */
    // Instant replay of the engagement's decisive moment from another angle. Only while the battle is being watched again (the page's
    // Replay), where jumping in time is the page's own, tested machinery: the director asks it to go back, films, and asks it to return.
    if (this.rp) { if (!this.ctrl || !A.review) this._again(null); else if (t >= this.rp.to) { const r = this.rp; this._again(null); A.seek(r.at + 0.05); return; } }   /* forward again: the same battle carries on */
    else if (this.ctrl && A.review && A.playing && !this.slow) { const r = this.plan.replayAt(t); if (r && !this.replayed.has(r.v)) { this.replayed.add(r.v); this._again(r); this.mine = true; A.seek(r.from); return; } }
    // the camera
    if (this.ctrl && A.cams.mode !== this.modeSet) { this.yielded = true; this._release(false); }   /* the viewer picked a camera: it is his */
    if (!this.yielded && !A.mapOpen) {
      const s = this.rp ? this.rp.shot : this.plan.shotAt(t);
      if (s) { if (s !== this.shot) this._enter(s, t); this._drive(s, t); }
    }
    // slow motion around the decisive moment, by the page's own speed setting
    const ahead = dt * (this.slow ? this.saved : A.speed);   /* one frame ahead at the viewer's own speed, so the window is entered on time and not left again at once */
    const want = this.ctrl && !this.rp && A.playing && (this.plan.slowAt(t + ahead) || this.slow && this.plan.slowAt(t));
    if (this.slow) { if (A.speed !== SLOW) { this.slow = false; this.slowSkip = true; } else if (!want) { A.speed = this.saved; this.slow = false; } }
    else if (want && !this.slowSkip && A.speed > SLOW) { this.saved = A.speed; A.speed = SLOW; this.slow = true; }
    if (!want) this.slowSkip = false;
    if (this.tagSlow.hidden === this.slow) this.tagSlow.hidden = !this.slow;
  }

  // start (r) or end (null) an instant replay: half speed while it runs
  _again(r) { const A = this.app; if (r) { this.rpSaved = A.speed; if (A.speed !== AGAIN) A.speed = AGAIN; this.rp = r; } else { if (this.rp && A.speed === AGAIN) A.speed = this.rpSaved; this.rp = null; } this.shot = null; this.tagRp.hidden = !this.rp; }

  // ---- carrying out a shot ------------------------------------------------------------------------------------------------
  _unit(uid) { return this.b.units.find(u => u.id === uid) || null; }
  _free() { const A = this.app; A.cams.mode = 'free'; A.scene.controls.enabled = false; A.cams.unit = null; this.modeSet = 'free'; }
  _enter(s, t) {
    const A = this.app, cams = A.cams;
    if (!this.ctrl) { this.userMode = cams.mode === 'free' || !cams.mode ? 'orbit' : cams.mode; this.ctrl = true; }
    this.shot = s; this.hasLast = false; this.fall = null;
    const u0 = s.uid != null ? this._unit(s.uid) : null, secret = !A.spectator && u0 && u0.alive && !u0.gone && !u0.known;   /* fog of war: a team the vehicle has not located is not shown */
    if (s.cam === 'troops') { if (secret) { this.fall = s.brg != null ? 'gun' : 'tank'; this._free(); } else if (u0 && u0.alive && !u0.gone) { cams.choose(u0); cams.set('troops'); this.modeSet = 'troops'; } else { this.fall = 'site'; this._free(); } }
    else if (s.inside) { if (cams.interior && cams.interior.owns(s.cam) && A.tank.loaded) { cams.set(s.cam); this.modeSet = s.cam; } else { this.fall = 'low'; this._free(); } }   /* no interior to show: stay outside */
    else if ((s.rig === 'site' || s.rig === 'downrange') && secret) { this.fall = s.brg != null ? 'gun' : 'tank'; this._free(); }
    else if (s.cam) { cams.set(s.cam); this.modeSet = s.cam; }
    else this._free();
    // which side of the line to stand on, and for the calm shots which way round: the first choice with a clear view
    const T = A.shown, W = A.scene.world, brg = (s.brg != null ? s.brg : 0) * DEG; this.side = 1; this.az = s.brg != null ? s.brg + 110 : [35, 145, 215, 325][Math.round(s.t0 * 10) % 4] + (s.turn || 0);
    const rig = this.fall || s.rig;
    if (rig === 'low' || rig === 'gun') { for (const sd of [1, -1]) { const k = rig === 'low' ? [-12, 4.5, 1.25] : [-9, 6, 4.2], e = T.e + Math.sin(brg) * k[0] + Math.cos(brg) * k[1] * sd, n = T.n + Math.cos(brg) * k[0] - Math.sin(brg) * k[1] * sd; if (this._clear(W, e, n, k[2], T.e, T.n, 2.4)) { this.side = sd; break; } } }
    else if (rig === 'tank' || rig === 'wide' || rig === 'hold') { const r = rig === 'tank' ? 24 : rig === 'wide' ? 75 : 48, h = rig === 'tank' ? 6.5 : rig === 'wide' ? 24 : 8; for (const off of [0, 50, -50, 100, -100, 180]) { const a = (this.az + off) * DEG; if (this._clear(W, T.e + Math.sin(a) * r, T.n + Math.cos(a) * r, h, T.e, T.n, 2.4)) { this.az += off; break; } } }
    A.refresh();
  }
  _clear(W, e1, n1, h1, e2, n2, h2) { try { return W.inside(e1, n1) && W.los(e1, n1, h1, e2, n2, h2).clear; } catch (err) { return true; } }
  _set(fov) { const cam = this.app.scene.camera; cam.position.copy(this.pos); cam.up.set(0, 1, 0); cam.lookAt(this.look); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); } }
  // the missile or drone this shot is about, if it is in the air now
  _missile(s) { const v = this.b.volleys[s.v]; if (!v) return null; for (const m of this.app.volleys.info) if (m.th && m.th.idx === s.idx && v.rec.threats.indexOf(m.th) >= 0) return m; return null; }
  _drive(s, t) {
    const A = this.app, S = A.scene, T = A.shown, age = t - s.t0; let rig = this.fall || s.rig;
    if (s.cam === 'troops' && !this.fall && this.modeSet === 'troops') { const u = this._unit(s.uid); if (!u || !u.alive || u.gone) { this.fall = rig = 'site'; this._free(); A.refresh(); } }   /* the team is gone: look at where it was */
    if (!rig) return;
    const P = this.pos, L = this.look;
    if (rig === 'tank' || rig === 'wide' || rig === 'hold') {
      const r = rig === 'tank' ? 24 : rig === 'wide' ? 75 : 48, h = rig === 'tank' ? 6.5 : rig === 'wide' ? 24 : 8, a = (this.az + age * (rig === 'tank' ? 2 : rig === 'wide' ? 1 : 0.8)) * DEG;
      S.at(T.e + Math.sin(a) * r, T.n + Math.cos(a) * r, h, P); S.at(T.e, T.n, rig === 'hold' ? 3 : 2, L); if (P.y < L.y + 2) P.y = L.y + 2; this._set(rig === 'tank' ? 45 : 40);
    } else if (rig === 'low' || rig === 'gun') {
      let brg = s.brg || 0;
      if (s.marks && s.marks.length > 1) {   /* several endings in one shot: turn from each to the next between them */
        const M = s.marks; let i = 0; while (i < M.length - 1 && t > M[i].t + 0.5) i++;
        if (i > 0) { const f = Math.max(0, Math.min(1, (t - (M[i - 1].t + 0.5)) / Math.max(0.3, Math.min(0.9, M[i].t - M[i - 1].t - 0.2)))), g = f * f * (3 - 2 * f), d = ((M[i].brg - M[i - 1].brg + 540) % 360) - 180; brg = M[i - 1].brg + d * g; } else brg = M[0].brg;
      }
      const a = brg * DEG, se = Math.sin(a), sn = Math.cos(a), low = rig === 'low', back = low ? 12 : 9, out = (low ? 4.5 : 6) * this.side;
      S.at(T.e - se * back + sn * out, T.n - sn * back - se * out, low ? 1.25 : 4.2, P); S.at(T.e + se * (low ? 30 : 60), T.n + sn * (low ? 30 : 60), 0, L); L.y = S.world.h(T.e, T.n) + (low ? 4.5 : 5.5); this._set(low ? 62 : 50);
    } else if (rig === 'cloud') {
      const a = (s.brg || 0) * DEG, se = Math.sin(a), sn = Math.cos(a), D = Math.max(38, (s.span || 0) * 0.55 + 22), ce = T.e + se * s.x, cn = T.n + sn * s.x, W = S.world;
      const far = s.high ? -1.3 : 1; S.at(ce + sn * D * far, cn - se * D * far, s.high ? 20 : 4, P);   /* the replay looks from the other side, higher and further back */ const f = s.R ? Math.min(1, s.x / s.R) : 0, hl = s.le != null ? W.h(s.le, s.ln) + 1.3 : W.h(ce, cn) + 2, y = (W.h(T.e, T.n) + 2) * (1 - f) + hl * f;
      L.set(ce, Math.max(W.h(ce, cn) + 2.5, y + 1), -cn); this._set(Math.max(30, Math.min(52, 2 * Math.atan(((s.span || 0) * 0.5 + 14) / D) / DEG)));
    } else if (rig === 'replay') {   /* from above and to one side of the vehicle, the incoming line running across the picture */
      const a = (s.brg || 0) * DEG, se = Math.sin(a), sn = Math.cos(a); S.at(T.e - se * 9 - sn * 30 * this.side, T.n - sn * 9 + se * 30 * this.side, 15, P); S.at(T.e + se * 9, T.n + sn * 9, 2, L); this._set(48);
    } else if (rig === 'ride' || rig === 'follow') {
      const m = this._missile(s);
      if (m) { this.lastP.copy(m.p); this.hasLast = true;
        if (rig === 'ride') { P.copy(m.p).addScaledVector(m.dir, -16); P.y += 4.5; S.at(T.e, T.n, 2, L); }   /* behind and above it, so its flame sits low in the picture and the way ahead is clear */
        else { const a = (s.brg || 0) * DEG; P.copy(m.p); P.x += Math.cos(a) * 30; P.z += Math.sin(a) * 30; P.y += 5; L.copy(m.p); }
        const g = S.world.h(P.x, -P.z) + 1; if (P.y < g) P.y = g; this._set(rig === 'ride' ? 55 : 45);
      } else if (this.hasLast) { if (rig === 'follow') { L.copy(this.lastP); this._set(45); } }
      else { const a = (s.brg || 0) * DEG; S.at(T.e - Math.sin(a) * 14, T.n - Math.cos(a) * 14, 5, P); S.at(T.e + Math.sin(a) * 80, T.n + Math.cos(a) * 80, 6, L); this._set(50); }   /* not in the air yet, or the view jumped here late */
    } else if (rig === 'site' || rig === 'downrange') {
      const u = this._unit(s.uid), e = u && rig === 'site' && s.e == null ? u.e : s.e != null ? s.e : u ? u.e : T.e, n = u && rig === 'site' && s.n == null ? u.n : s.n != null ? s.n : u ? u.n : T.n;
      const far = rig === 'downrange', a = Math.atan2(T.e - e, T.n - n) + (35 + age * 3) * DEG, r = far ? 28 : 10;
      S.at(e + Math.sin(a) * r, n + Math.cos(a) * r, far ? 6 : 3.2, P); S.at(e, n, 1, L); this._set(far ? 45 : 48);
    }
  }
}
