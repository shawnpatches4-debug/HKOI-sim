// Sound engine: the one object the rest of the simulator talks to.
//
//   mixer.js     buses, limiter, inside/outside treatment, distance, the building blocks, recordings in place of synthesis
//   effects.js   the one-shot sounds (30 mm, 120 mm, machine guns, Trophy, launches, blasts, strikes)
//   intercom.js  the crew's voices: recorded human clips only, queued and keyed like an intercom
//   crewtalk.js  who says what and when, from the battle's events
//   this file    start-up, the continuous layers (engine, tracks, turret, weather, wildlife, far battle, drones,
//                warning tones) and the calls other code uses
//
// Everything except the voices is synthesised until recordings arrive. Nobody has listened to any of it in the
// workspace: it was rendered to files and measured (tests/audio/). Recordings replace a sound by naming a file for its
// slot in assets/sfx_index.json; no code changes are needed (docs/ASSETS.md, "Sound slots").
import { Mixer, C_SOUND } from './mixer.js';
import { Effects, SLOTS } from './effects.js';
import { Intercom } from './intercom.js';
import { CrewTalk, engineLine } from './crewtalk.js';

// where the listener's head is in each camera view: 'in' behind armour, 'hatch' head out in a helmet, otherwise outside.
// Both 'in' and 'hatch' hear the intercom. A view not listed here is outside.
export const SEATS = { cdr: 'hatch', ldr: 'hatch', gnr: 'in', citv: 'in', hkoi: 'in', drv: 'in' };
// looped layers a recording can replace, besides the one-shot slots in effects.js
export const BED_SLOTS = ['turbine_in_loop', 'turbine_out_loop', 'tracks_loop', 'wind_loop', 'rain_loop', 'rain_roof_loop'];
export { SLOTS };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

export class Sound {
  constructor() {
    this.ctx = null; this.on = true; this.vol = 0.8; this.seat = 'out'; this.inside = false; this.lite = false;
    this.drones = new Map(); this.lastShot = -1e9; this.thr = 0.25; this.prev = null; this.next = {};
    this._get = url => fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  }
  // Must be called from a click or key press: browsers do not allow sound before that. (Tests pass their own context.)
  start(ctx) {
    if (this.ctx) { if (this.ctx.resume) this.ctx.resume(); return; }
    if (!ctx) { const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return; ctx = new AC(); }
    this.ctx = ctx; this.mix = new Mixer(ctx, this.vol); this.mix.setVolume(this.vol, this.on);
    this.icom = new Intercom(this.mix);
    this.talk = new CrewTalk(this.icom, { warn: (l, r) => this._warn(l, r), blip: k => this.blip(k), smoke: () => this.smoke(this.camDist || 0) });
    this._beds();
  }
  setOn(v) { this.on = v; if (this.mix) this.mix.setVolume(this.vol, v); }

  // ------------------------------------------------------------------ continuous layers
  _beds() {
    const c = this.ctx, M = this.mix, B = this.bed = {};
    const osc = (type, f, dest, gain = 0) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.value = gain; o.connect(g); g.connect(dest); o.start(); return { o, g }; };
    // --- world
    B.wind = M.bed('world', { color: 'pink', f: 480 }); B.windHi = M.bed('world', { color: 'pink', type: 'bandpass', f: 1500, q: 0.8 });
    B.rain = M.bed('world', { color: 'white', type: 'highpass', f: 2300 });
    B.rainRoof = M.bed('world', { direct: true, color: 'pink', type: 'bandpass', f: 1500, q: 0.7 });
    // --- the vehicle. Inside (direct): rumble through the seat, the turbine's rush and whine. Outside (air): exhaust roar and whine.
    B.rush = M.bed('vehicle', { direct: true, color: 'pink', type: 'bandpass', f: 520, q: 0.6 });
    B.rushOut = M.bed('vehicle', { color: 'pink', type: 'bandpass', f: 900, q: 0.5 });
    B.roarOut = M.bed('vehicle', { color: 'brown', f: 220 });
    B.whine = osc('sine', 2650, M.bus.vehicle.direct); B.whine2 = osc('sine', 3990, M.bus.vehicle.direct);
    B.whineOut = osc('sine', 2650, M.bus.vehicle.air);
    const humLP = c.createBiquadFilter(); humLP.type = 'lowpass'; humLP.frequency.value = 170; humLP.connect(M.bus.vehicle.direct);
    B.hum = osc('sawtooth', 62, humLP);
    // tracks: a low clatter chopped at the rate the track links meet the ground, and a squeal when the vehicle turns
    B.tracks = M.bed('vehicle', { direct: true, color: 'brown', f: 300 }); B.tracksOut = M.bed('vehicle', { color: 'brown', f: 700 });
    B.clat = c.createOscillator(); B.clat.type = 'square'; B.clat.frequency.value = 8; B.clatG = c.createGain(); B.clatG.gain.value = 0; B.clat.connect(B.clatG);
    B.clatG.connect(B.tracks.g.gain); B.clatG2 = c.createGain(); B.clatG2.gain.value = 0; B.clat.connect(B.clatG2); B.clatG2.connect(B.tracksOut.g.gain); B.clat.start();
    B.squeal = M.bed('vehicle', { color: 'white', type: 'bandpass', f: 2400, q: 14 });
    // the turret: traverse drive whir, heard inside
    const whirLP = c.createBiquadFilter(); whirLP.type = 'lowpass'; whirLP.frequency.value = 1400; whirLP.connect(M.bus.vehicle.direct);
    B.whir = osc('sawtooth', 240, whirLP); B.whirN = M.bed('vehicle', { direct: true, color: 'white', type: 'bandpass', f: 3100, q: 3 });
    // --- warning tones in the headset: laser warning (fast beeps), radar or launch warning (slow two-tone)
    B.lwr = osc('square', 1250, M.bus.ui.direct); B.lwrLfo = osc('square', 7, B.lwr.g.gain, 0);
    B.rwr = osc('sine', 820, M.bus.ui.direct); B.rwrLfo = osc('square', 2.5, B.rwr.o.frequency, 0); B.rwrLfo.g.gain.value = 110;
    B.icomFloor = M.bed('ui', { direct: true, color: 'pink', type: 'bandpass', f: 1800, q: 0.4 });
    this.warnL = false; this.warnR = false;
  }
  _swapBeds() {
    const M = this.mix, B = this.bed; if (!B) return;
    M.bedSample('turbine_in_loop', B.rush); M.bedSample('turbine_out_loop', B.rushOut); M.bedSample('tracks_loop', B.tracks);
    M.bedSample('wind_loop', B.wind); M.bedSample('rain_loop', B.rain); M.bedSample('rain_roof_loop', B.rainRoof);
  }
  _warn(laser, radar) { this.warnL = !!laser; this.warnR = !!radar; }
  // a short signal in the headset. kind: 'rf' (the detector has picked up a drone's control link)
  blip(kind = 'rf') {
    if (!this._live() || this.seat === 'out') return; const M = this.mix, v = M.voice('ui', { direct: true });
    for (let i = 0; i < 3; i++) M.tone(v.in, v.t + i * 0.09, { f0: kind === 'rf' ? 1650 : 1100, dur: 0.05, gain: 0.07, attack: 0.002, type: 'triangle' });
  }

  // ------------------------------------------------------------------ every frame
  // st: { view (camera mode) or inside, cond, biome, speed (m/s), heading, turret (degrees), alive, camDist (m to own vehicle),
  //       rate (simulation speed), drones: [{ id, d }], battle, talking, mission }
  update(dt, st) {
    if (!this.ctx || !this.mix) return; st = st || {};
    // The work below runs about 30 times a second however fast the picture is drawn (240 frames a second would otherwise
    // flood the audio engine with parameter changes). The intercom queue is looked at on every call: it is cheap.
    this.acc = (this.acc || 0) + (dt > 0 ? dt : 0);
    if (this.acc < 0.032 && this.prev) { this.icom.update(); return; }
    dt = Math.min(this.acc, 0.25); this.acc = 0;
    const c = this.ctx, M = this.mix, B = this.bed, t = c.currentTime, set = (p, v, tc = 0.12) => p.setTargetAtTime(v, t, tc);
    const seat = st.view != null ? (SEATS[st.view] || 'out') : st.inside ? 'in' : 'out';
    this.seat = seat; this.inside = seat === 'in'; this.lite = (st.rate || 1) > 2.01; this.camDist = st.camDist || 0;
    M.setSeat(seat); this.icom.listen(seat !== 'out');
    const inH = seat === 'in', hatch = seat === 'hatch', heard = seat !== 'out';
    // --- crew talk
    if (st.battle && st.talking && !this.lite) this.talk.update(st.battle, t, { mission: st.mission });
    this.icom.update();
    const lw = this.warnL && heard && st.talking ? 0.035 : 0;   /* the beeper's gain swings between 0 and twice this, 7 times a second */
    set(B.lwr.g.gain, lw, 0.01); set(B.lwrLfo.g.gain, lw, 0.01);
    set(B.rwr.g.gain, this.warnR && !this.warnL && heard && st.talking ? 0.055 : 0, 0.03);
    set(B.icomFloor.g.gain, heard ? 0.006 : 0);
    // --- weather
    const cond = st.cond || 'day', rainy = cond === 'rain', windy = cond === 'snow' || cond === 'fog' ? 0.5 : rainy ? 0.9 : cond === 'night' ? 0.35 : 0.6;
    const gust = 0.75 + 0.25 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1);
    set(B.wind.g.gain, 0.2 * windy * gust, 0.4); set(B.wind.fl.frequency, 380 + 240 * gust, 0.4); set(B.windHi.g.gain, 0.035 * windy * gust * gust, 0.4);
    set(B.rain.g.gain, rainy ? 0.09 : 0); set(B.rainRoof.g.gain, rainy && inH ? 0.05 : rainy && hatch ? 0.02 : 0);
    if (rainy && heard && !this.lite && t >= (this.next.drop || 0)) {   /* single heavy drops on the armour or the helmet */
      this.next.drop = t + rnd(0.02, 0.12); const v = M.voice('world', { direct: true });
      M.noise(v.in, v.t, { dur: 0.012, type: 'bandpass', f0: rnd(1800, 4200), q: 4, gain: rnd(0.01, 0.035) });
    }
    // --- the vehicle
    const sp = clamp(Math.abs(st.speed || 0) / 11, 0, 1), run = st.alive === false ? 0 : 1, P = this.prev || { speed: st.speed || 0, heading: st.heading, turret: st.turret };
    const acc = dt > 0 ? ((st.speed || 0) - P.speed) / dt : 0;
    const want = run * clamp(0.25 + 0.6 * sp + clamp(acc * 0.25, 0, 0.3), 0, 1); this.thr += (want - this.thr) * clamp(dt * 2.2, 0, 1);   /* the turbine spools up and down, it does not jump */
    const thr = this.thr, near = Math.min(1, 28 / (28 + (st.camDist || 20)));
    set(B.rush.g.gain, run * (inH ? 0.1 + 0.1 * thr : hatch ? 0.05 + 0.05 * thr : 0)); set(B.rush.fl.frequency, 420 + 520 * thr);
    set(B.rushOut.g.gain, run * (inH ? 0 : (0.16 + 0.3 * thr) * near)); set(B.rushOut.fl.frequency, 700 + 900 * thr);
    set(B.roarOut.g.gain, run * (inH ? 0 : (0.1 + 0.3 * thr) * near));
    const wf = (1750 + 1500 * thr) * (1 + 0.004 * Math.sin(t * 5.3) + 0.003 * Math.sin(t * 13.1));   /* never a dead-steady tone */
    set(B.whine.o.frequency, wf, 0.05); set(B.whine2.o.frequency, wf * 1.507, 0.05); set(B.whine.g.gain, run * (inH ? 0.003 + 0.005 * thr : 0)); set(B.whine2.g.gain, run * (inH ? 0.001 + 0.002 * thr : 0));
    set(B.whineOut.o.frequency, wf); set(B.whineOut.g.gain, run * (inH ? 0 : (0.004 + 0.012 * thr) * near));
    set(B.hum.o.frequency, 52 + 34 * thr); set(B.hum.g.gain, run * (inH ? 0.1 + 0.06 * thr : hatch ? 0.04 : 0));
    if (B.rush.swapped) B.rush.src.playbackRate.setTargetAtTime(0.8 + 0.5 * thr, t, 0.2);
    if (B.rushOut.swapped) B.rushOut.src.playbackRate.setTargetAtTime(0.8 + 0.5 * thr, t, 0.2);
    // tracks: link pitch 0.19 m, so the clatter rate is speed / 0.19 (capped: above that it blurs into a roar anyway)
    const v = Math.abs(st.speed || 0), moving = run * clamp(v / 2, 0, 1), trk = run * moving * (0.35 + 0.65 * sp);
    set(B.clat.frequency, clamp(v / 0.19, 2, 46)); set(B.tracks.g.gain, trk * (inH ? 0.3 : hatch ? 0.2 : 0)); set(B.clatG.gain, trk * (inH ? 0.2 : hatch ? 0.13 : 0));
    set(B.tracksOut.g.gain, trk * (inH ? 0 : 0.22 * near)); set(B.clatG2.gain, trk * (inH ? 0 : 0.14 * near));
    let turn = 0, slew = 0;
    if (dt > 0 && st.heading != null && P.heading != null) turn = Math.abs(angDiff(st.heading, P.heading)) / dt;
    if (dt > 0 && st.turret != null && P.turret != null) slew = Math.abs(angDiff(st.turret - (st.heading || 0), P.turret - (P.heading || 0))) / dt;
    this.turnS = (this.turnS || 0) + (Math.min(turn, 60) - (this.turnS || 0)) * clamp(dt * 4, 0, 1); this.slewS = (this.slewS || 0) + (Math.min(slew, 60) - (this.slewS || 0)) * clamp(dt * 8, 0, 1);
    set(B.squeal.g.gain, run * moving * clamp((this.turnS - 6) / 25, 0, 1) * (inH ? 0 : 0.05 * near)); set(B.squeal.fl.frequency, 2100 + 600 * Math.sin(t * 3.1));
    const sl = run * clamp(this.slewS / 30, 0, 1);
    set(B.whir.o.frequency, 190 + 260 * sl, 0.05); set(B.whir.g.gain, inH ? 0.035 * sl : 0, 0.05); set(B.whirN.g.gain, inH ? 0.02 * sl : 0, 0.05);
    if (moving > 0.3 && heard && !this.lite && t >= (this.next.creak || 0)) {   /* the suspension and the hull working */
      this.next.creak = t + rnd(1.2, 4.5) / (0.4 + sp); const w = M.voice('vehicle', { direct: true, cabin: 0.3 }), f = rnd(140, 420);
      M.tone(w.in, w.t, { f0: f, f1: f * rnd(0.7, 1.25), dur: rnd(0.12, 0.35), gain: rnd(0.015, 0.05), attack: 0.03, type: 'triangle' });
      if (Math.random() < 0.4) M.noise(w.in, w.t + 0.05, { dur: 0.03, type: 'bandpass', f0: rnd(900, 2600), q: 5, gain: 0.03 });
    }
    this.prev = { speed: st.speed || 0, heading: st.heading, turret: st.turret };
    // --- the living world, when nobody is shooting: birds by day, insects at dusk and night; a battle far away
    if (!this.lite) this._world(t, cond, st.biome || 'farmland', rainy);
    // --- drones: a motor whine per aircraft. It is higher while it closes (Doppler, from its true closing speed) and rises
    // further in the last few hundred metres (ASSUMPTION: full throttle in the terminal dive).
    const seen = new Set();
    for (const dr of st.drones || []) {
      seen.add(dr.id); let q = this.drones.get(dr.id);
      if (!q) {
        const o1 = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
        o1.type = 'sawtooth'; o2.type = 'square'; fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 0.8; lp.type = 'lowpass'; g.gain.value = 0;
        o1.connect(fl); o2.connect(fl); fl.connect(lp); lp.connect(g); g.connect(M.bus.weapons.air); o1.start(); o2.start();
        q = { o1, o2, fl, lp, g, base: rnd(168, 204), d: dr.d, vc: 0 }; this.drones.set(dr.id, q);
      }
      if (dt > 0) q.vc += (clamp((q.d - dr.d) / dt, -80, 80) - q.vc) * clamp(dt * 3, 0, 1); q.d = dr.d;
      const a = M.far(dr.d, 0.5), dop = C_SOUND / (C_SOUND - q.vc), f = q.base * dop * (1 + 0.3 * clamp(1 - dr.d / 300, 0, 1)) * (1 + 0.02 * Math.sin(t * 9 + q.base));
      set(q.o1.frequency, f, 0.05); set(q.o2.frequency, f * 2.01, 0.05); set(q.fl.frequency, clamp(f * 5, 500, 2400), 0.05); set(q.lp.frequency, a.cut, 0.1); set(q.g.gain, Math.min(0.22, a.gain * 0.35), 0.08);
    }
    for (const [id, q] of this.drones) if (!seen.has(id)) { q.g.gain.setTargetAtTime(0, t, 0.03); q.o1.stop(t + 0.2); q.o2.stop(t + 0.2); this.drones.delete(id); }
  }
  _world(t, cond, biome, rainy) {
    const M = this.mix, N = this.next, calm = t - this.lastShot > 14, outside = this.seat !== 'in';
    const day = cond === 'day' || cond === 'dawn' || cond === 'overcast', dark = cond === 'dusk' || cond === 'night';
    if (calm && outside && !rainy && day && biome !== 'desert' && cond !== 'snow' && t >= (N.bird || 0)) {   /* small birds: a few quick falling notes */
      N.bird = t + rnd(1.5, 7) * (biome === 'forest' ? 0.6 : biome === 'town' ? 1.6 : 1) * (cond === 'dawn' ? 0.5 : 1);
      const a = M.far(rnd(25, 120), 0.5), v = M.voice('world', { far: a, space: 0.25, pan: rnd(-0.8, 0.8) }), n = Math.floor(rnd(2, 7)), f = rnd(2600, 5200);
      for (let i = 0; i < n; i++) M.tone(v.in, v.t + i * rnd(0.07, 0.13), { f0: f * rnd(0.9, 1.25), f1: f * rnd(0.6, 0.9), dur: rnd(0.04, 0.09), gain: 0.05, attack: 0.008 });
    }
    if (calm && outside && !rainy && dark && cond !== 'snow' && biome !== 'town' && t >= (N.bug || 0)) {   /* crickets: a train of thin pulses */
      N.bug = t + rnd(0.5, 2.2); const a = M.far(rnd(8, 50), 0.4), v = M.voice('world', { far: a, pan: rnd(-0.9, 0.9) }), f = rnd(4100, 4900), n = Math.floor(rnd(4, 12));
      for (let i = 0; i < n; i++) M.tone(v.in, v.t + i * 0.055, { f0: f, dur: 0.02, gain: 0.025, attack: 0.004 });
    }
    if (t >= (N.far || rnd(4, 12))) {   /* somebody else's battle, kilometres off: only the low end gets here */
      N.far = t + rnd(7, 24); const a = M.far(rnd(4000, 9000), 3), v = M.voice('world', { gain: a.gain, cut: a.cut, space: 0.5, pan: rnd(-0.6, 0.6) }), n = Math.random() < 0.3 ? 3 : 1;
      for (let i = 0; i < n; i++) { const dt = i * rnd(0.25, 0.7); M.tone(v.in, v.t + dt, { f0: rnd(45, 60), f1: 24, dur: 0.6, gain: 1 }); M.noise(v.in, v.t + dt, { dur: rnd(1.5, 3), color: 'brown', f0: 160, f1: 45, gain: 0.9 }); }
    }
  }

  // ------------------------------------------------------------------ voices
  // Loads the crew voice pack, the enemy calls and screams (both human recordings), and the list of recordings for
  // sound slots when there is one. The older machine-made crew voices (voice_cdr / gnr / ldr / drv / panic) are no longer loaded.
  async loadVoices(base) {
    if (this._loading || !base || !this.ctx) return; this._loading = true; this.base = base; this.bufs = {};
    const c = this.ctx, json = async name => { try { const a = await this._get(base + name); return a ? JSON.parse(new TextDecoder().decode(a)) : null; } catch (e) { return null; } };
    const buf = async (k, file) => { try { const a = await this._get(base + file); if (a) this.bufs[k] = await c.decodeAudioData(a); } catch (e) { /* stays silent */ } };
    const jobs = [this.icom.load(base, this._get)];
    jobs.push(json('voice_index.json').then(vi => { this.VI = vi; return vi ? Promise.all([buf('ru', 'voice_ru.mp3'), buf('screams', 'screams.mp3')]) : null; }));
    jobs.push(json('sfx_index.json').then(m => (m ? this.mix.loadSlots(m, base + (m.base || ''), this._get) : 0)).then(() => this._swapBeds()));
    await Promise.all(jobs); this.CV = this.icom.index; this.voicesReady = true;
  }
  // One line by event name (the names are in tools/audio/crew_release.json). opt.delay: seconds from now; opt.queue: may wait
  // longer for the net; opt.low: routine talk. Returns false when the pack has no such line.
  cue(who, ev, level = 1, opt = {}) {
    if (!this._live() || !this.icom) return false;
    return this.icom.request(who, ev, { level, pri: opt.pri != null ? opt.pri : opt.low ? 0 : 1, ttl: opt.ttl != null ? opt.ttl : opt.queue ? 8 : 1.5, delay: opt.delay || 0, group: opt.group || null, needs: opt.needs || null });
  }
  // A line in the engine's wording: lines = [calm, tense, panic] (or just one); level picks one. The crewman says the pack's
  // line for it when there is one that is true of it; otherwise he says nothing (no machine speech any more).
  say(who, lines, level = 0) {
    if (!this._live() || !this.icom || !lines || !lines.length || lines[0] == null) return false;
    const m = engineLine(who, lines[Math.min(level, lines.length - 1)], this.talk.lastOrder);
    if (!m || !m.ev) return false;
    return this.icom.request(who, m.ev, { level, pri: m.pri != null ? m.pri : 1, ttl: m.ttl || 1.5 });
  }
  // a crewman's reaction: 'hit' (the commander calls the hit) or 'wound'. Other kinds have no human recording and stay silent.
  react(who, kind, delay = 0) {
    if (kind === 'hit') return this.cue('CDR', 'hit', 2, { delay, pri: 3, ttl: 2.5 });
    if (kind === 'wound') return this.cue('ANY', 'wound', 2, { delay, pri: 3, ttl: 2 });
    return false;
  }
  _strip(key, start, dur, v, gain) { const b = this.bufs && this.bufs[key]; if (!b) return; const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = gain; s.connect(g); g.connect(v.in); s.start(v.t, start, dur); }
  // the crew's cries on a killing hit (human recordings). Inside they are close; from outside, faint through the hull.
  scream(kind = 'scream', delay = 0, gain = 0.9) {
    const L = this.VI && this.VI.s && this.VI.s[kind]; if (!L || !this._live()) return; const x = L[Math.floor(Math.random() * L.length)];
    const v = this.seat === 'out' ? this.mix.voice('voices', { far: this.mix.far(this.camDist || 20, 0.35), cut: 900, delay }) : this.mix.voice('voices', { direct: true, cabin: 0.4, delay });
    this._strip('screams', x[0], x[1], v, gain);
  }
  // an enemy team's voice (human recordings, Russian), heard in the open beside the listener.
  // kind: spot | fire | track | hit | kill | miss | lost | dlaunch | dspot | dhit | dlost
  enemy(kind, delay = 0) {
    const L = this.VI && this.VI.r && this.VI.r[kind]; if (!L || !this._live()) return; const now = this.ctx.currentTime; if ((this.ruUntil || 0) - now > 0.8) return;
    const x = L[Math.floor(Math.random() * L.length)], v = this.mix.voice('voices', { far: this.mix.far(3, 1), space: 0.12, delay });
    this._strip('ru', x[0], x[1], v, 1); this.ruUntil = v.t + x[1];
  }
}
Object.assign(Sound.prototype, Effects);
