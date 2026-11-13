// Sound engine. Everything here is synthesised (no recordings needed): the 30 mm gun, explosions, launches, drones, the turbine,
// tracks, wind and rain. Recordings can replace any of these later through `samples`. Two listening positions:
// outside (open air, sounds arrive late and dull with distance) and inside the hull (the world heavily muffled, the vehicle's
// own machinery and the gun felt through the armour).
const C_SOUND = 343;

export class Sound {
  constructor() { this.ctx = null; this.on = true; this.inside = false; this.drones = new Map(); this.vol = 0.8; this.cond = 'day'; this.speed = 0; this.ring = 0; }
  // must be called from a click or key press: browsers do not allow sound before that
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.on ? this.vol : 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.22; this.master.connect(comp); comp.connect(c.destination);
    this.world = c.createGain(); this.worldLP = c.createBiquadFilter(); this.worldLP.type = 'lowpass'; this.worldLP.frequency.value = 18000; this.world.connect(this.worldLP); this.worldLP.connect(this.master);   // everything outside the hull
    this.own = c.createGain(); this.own.connect(this.master);   // the vehicle's own machinery, heard directly
    // two seconds of noise, reused by every effect
    const n = c.sampleRate * 2, buf = this.noise = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); let b = 0; for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const bb = this.brown = c.createBuffer(1, n, c.sampleRate), e = bb.getChannelData(0); for (let i = 0; i < n; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = b * 3.5; }
    this._beds();
  }
  setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? this.vol : 0, this.ctx.currentTime, 0.05); }
  _loop(buffer, dest, { type = 'lowpass', f = 800, q = 0.7, gain = 0 } = {}) { const c = this.ctx, s = c.createBufferSource(); s.buffer = buffer; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = gain; s.connect(fl); fl.connect(g); g.connect(dest); s.start(0, Math.random() * 1.5); return { s, fl, g }; }
  // continuous layers: wind, rain, turbine, tracks
  _beds() {
    const c = this.ctx; this.wind = this._loop(this.brown, this.world, { f: 420, gain: 0.0 }); this.rain = this._loop(this.noise, this.world, { type: 'highpass', f: 2400, gain: 0 }); this.rainIn = this._loop(this.noise, this.own, { type: 'bandpass', f: 1800, q: 0.8, gain: 0 });
    // turbine: a broadband rush plus a thin high whine; both rise a little with speed
    this.rush = this._loop(this.noise, this.own, { type: 'bandpass', f: 520, q: 0.6, gain: 0 }); this.rushOut = this._loop(this.noise, this.world, { type: 'bandpass', f: 900, q: 0.5, gain: 0 });
    this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 2650; this.whineG = c.createGain(); this.whineG.gain.value = 0; this.whine.connect(this.whineG); this.whineG.connect(this.own); this.whine.start();
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 62; const hl = c.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 160; this.humG = c.createGain(); this.humG.gain.value = 0; this.hum.connect(hl); hl.connect(this.humG); this.humG.connect(this.own); this.hum.start();
    this.tracks = this._loop(this.brown, this.own, { f: 240, gain: 0 }); this.trackLfo = c.createOscillator(); this.trackLfo.frequency.value = 6; const lg = c.createGain(); lg.gain.value = 0; this.trackLfoG = lg; this.trackLfo.connect(lg); lg.connect(this.tracks.g.gain); this.trackLfo.start();
    this.earRing = c.createOscillator(); this.earRing.frequency.value = 4300; this.earG = c.createGain(); this.earG.gain.value = 0; this.earRing.connect(this.earG); this.earG.connect(this.master); this.earRing.start();
  }
  // a shaped burst of noise: the building block for cracks, blasts and whooshes
  _burst(dest, when, { dur = 0.3, f0 = 4000, f1 = 300, gain = 0.5, type = 'lowpass', q = 0.7, attack = 0.002, brown = false }) { const c = this.ctx, s = c.createBufferSource(); s.buffer = brown ? this.brown : this.noise; const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(Math.max(30, f0), when); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), when + dur); const g = c.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + attack); g.gain.exponentialRampToValueAtTime(0.0001, when + dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(when, Math.random() * 1.5, dur + 0.05); }
  _thump(dest, when, { f0 = 90, f1 = 35, dur = 0.4, gain = 0.6 }) { const c = this.ctx, o = c.createOscillator(); o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + dur); const g = c.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, when + dur); o.connect(g); g.connect(dest); o.start(when); o.stop(when + dur + 0.05); }
  // how loud and how dull a sound is after travelling `d` metres, and how late it arrives
  _far(d, size = 1) { return { delay: d / C_SOUND, gain: Math.min(1, size * 26 / (26 + d)), cut: Math.max(220, 9000 / (1 + d / 260)) }; }
  // ------------------------------------------------------------------ one-shot events (d = metres from the listener)
  explosion(d, size = 1) { if (!this.ctx || !this.on) return; const c = this.ctx, a = this._far(d, size * 1.6), t = c.currentTime + a.delay, out = this.world;
    this._burst(out, t, { dur: 0.09, f0: Math.min(9000, a.cut * 2), f1: a.cut * 0.5, gain: a.gain * 0.9 });   // the crack
    this._thump(out, t, { f0: 75, f1: 26, dur: 0.7 * Math.sqrt(size), gain: a.gain * 1.1 });                   // the body
    this._burst(out, t + 0.03, { dur: 1.6 + size, f0: a.cut * 0.6, f1: 60, gain: a.gain * 0.5, brown: true }); // the roll-off
    if (d > 300) this._burst(out, t + 0.5 + d / 2000, { dur: 1.2, f0: 300, f1: 60, gain: a.gain * 0.2, brown: true });   // a late echo off the ground
    if (this.inside && d < 40) { this._thump(this.own, c.currentTime + a.delay, { f0: 55, f1: 24, dur: 0.5, gain: 0.7 * size }); this._rattle(c.currentTime + a.delay + 0.03, Math.min(1, size * 14 / (14 + d))); } }
  // fragments and loose kit rattling on and inside the hull
  _rattle(when, k = 1) { for (let i = 0; i < 7 * k; i++) this._burst(this.own, when + Math.random() * 0.5, { dur: 0.03 + Math.random() * 0.05, f0: 2500 + Math.random() * 3500, f1: 900, gain: 0.12 * k, type: 'bandpass', q: 5 }); }
  hit(killing) { if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime; this._thump(this.own, t, { f0: 110, f1: 22, dur: 1.1, gain: 1.2 }); this._burst(this.own, t, { dur: 0.25, f0: 6000, f1: 300, gain: 1 }); this._burst(this.own, t + 0.01, { dur: 0.6, f0: 3200, f1: 1800, gain: 0.5, type: 'bandpass', q: 9 }); this._rattle(t + 0.05, 2);
    // ears ring and the world goes dull for a few seconds
    this.earG.gain.cancelScheduledValues(t); this.earG.gain.setValueAtTime(0.11, t + 0.05); this.earG.gain.exponentialRampToValueAtTime(0.0001, t + (killing ? 9 : 5)); this.world.gain.cancelScheduledValues(t); this.world.gain.setValueAtTime(0.12, t); this.world.gain.linearRampToValueAtTime(1, t + (killing ? 8 : 4)); }
  // one 30 mm round leaving the gun. Outside: a hard crack and a chesty thump. Inside: a thud through the armour and the feed clacking.
  gun30(d) { if (!this.ctx || !this.on) return; const c = this.ctx;
    if (this.inside) { const t = c.currentTime; this._thump(this.own, t, { f0: 95, f1: 38, dur: 0.16, gain: 0.85 }); this._burst(this.own, t, { dur: 0.05, f0: 900, f1: 250, gain: 0.35 }); this._burst(this.own, t + 0.035, { dur: 0.03, f0: 3800, f1: 2200, gain: 0.16, type: 'bandpass', q: 6 }); this._burst(this.own, t + 0.085, { dur: 0.035, f0: 2600, f1: 1500, gain: 0.12, type: 'bandpass', q: 6 }); return; }
    const a = this._far(d, 2.6), t = c.currentTime + a.delay; this._burst(this.world, t, { dur: 0.05, f0: Math.min(12000, a.cut * 2.2), f1: a.cut * 0.7, gain: a.gain * 1.0, attack: 0.001 }); this._thump(this.world, t, { f0: 150, f1: 48, dur: 0.14, gain: a.gain * 1.0 }); this._burst(this.world, t + 0.02, { dur: 0.5, f0: a.cut * 0.5, f1: 90, gain: a.gain * 0.28, brown: true }); }
  airburst(d, size = 0.5) { if (!this.ctx || !this.on) return; const a = this._far(d, size * 1.4), t = this.ctx.currentTime + a.delay; this._burst(this.world, t, { dur: 0.07, f0: Math.min(10000, a.cut * 2), f1: a.cut * 0.6, gain: a.gain * 0.8 }); this._thump(this.world, t, { f0: 120, f1: 45, dur: 0.22, gain: a.gain * 0.5 }); this._burst(this.world, t + 0.02, { dur: 0.7, f0: a.cut * 0.5, f1: 80, gain: a.gain * 0.22, brown: true }); }
  // Trophy: a very sharp double report right on the turret
  aps(d) { if (!this.ctx || !this.on) return; const c = this.ctx, a = this._far(d, 3), t = c.currentTime + a.delay, out = this.inside ? this.own : this.world, k = this.inside ? 0.7 : a.gain; this._burst(out, t, { dur: 0.04, f0: 11000, f1: 2500, gain: k, attack: 0.001 }); this._thump(out, t, { f0: 170, f1: 50, dur: 0.18, gain: k }); this._burst(out, t + 0.045, { dur: 0.3, f0: 5000, f1: 200, gain: k * 0.6 }); if (this.inside) this._rattle(t + 0.03, 0.8); }
  launch(d, big) { if (!this.ctx || !this.on) return; const a = this._far(d, big ? 2 : 1.2), t = this.ctx.currentTime + a.delay; this._burst(this.world, t, { dur: 0.08, f0: a.cut * 1.5, f1: a.cut * 0.5, gain: a.gain * 0.7 }); this._burst(this.world, t + 0.03, { dur: big ? 1.6 : 0.9, f0: Math.min(2400, a.cut), f1: 240, gain: a.gain * 0.5, type: 'bandpass', q: 0.8 }); this._thump(this.world, t, { f0: 80, f1: 40, dur: 0.3, gain: a.gain * 0.5 }); }
  // a missile going past or arriving: a rising tearing rush, cut off at the end
  whoosh(dur = 0.6, gain = 0.5) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this._burst(this.world, t, { dur, f0: 500, f1: 3600, gain, type: 'bandpass', q: 1.4, attack: dur * 0.7 }); }
  // ------------------------------------------------------------------ every frame
  // st: { inside, cond, speed (m/s), alive, drones: [{ id, d (m), closing (m/s) }] }
  update(dt, st) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, tc = 0.12, set = (p, v) => p.setTargetAtTime(v, t, tc);
    this.inside = !!st.inside; set(this.worldLP.frequency, this.inside ? 380 : 18000);
    const rainy = st.cond === 'rain', windy = st.cond === 'snow' || st.cond === 'fog' ? 0.5 : rainy ? 0.9 : st.cond === 'night' ? 0.35 : 0.6;
    set(this.wind.g.gain, 0.16 * windy * (this.inside ? 0.6 : 1)); set(this.rain.g.gain, rainy ? 0.07 : 0); set(this.rainIn.g.gain, rainy && this.inside ? 0.035 : 0);
    const sp = Math.min(1, Math.abs(st.speed || 0) / 11), run = st.alive ? 1 : 0;
    set(this.rush.g.gain, run * (this.inside ? 0.11 + 0.07 * sp : 0)); set(this.rush.fl.frequency, 480 + 380 * sp); set(this.rushOut.g.gain, run * (this.inside ? 0 : (0.2 + 0.2 * sp) * Math.min(1, 30 / (30 + (st.camDist || 20))))); set(this.rushOut.fl.frequency, 800 + 700 * sp);
    set(this.whineG.gain, run * (this.inside ? 0.012 + 0.008 * sp : 0)); set(this.whine.frequency, 2500 + 900 * sp); set(this.humG.gain, run * (this.inside ? 0.09 + 0.05 * sp : 0)); set(this.hum.frequency, 58 + 26 * sp);
    set(this.tracks.g.gain, run * sp * (this.inside ? 0.3 : 0.14)); set(this.trackLfoG.gain, run * sp * 0.12); set(this.trackLfo.frequency, 3 + 14 * sp);
    // drones: an angry buzz per aircraft, pitch bent by how fast it is closing
    const seen = new Set();
    for (const dr of st.drones || []) { seen.add(dr.id); let v = this.drones.get(dr.id); if (!v) { const o1 = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(); o1.type = 'sawtooth'; o2.type = 'square'; fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 0.9; g.gain.value = 0; o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.world); o1.start(); o2.start(); v = { o1, o2, g, base: 172 + Math.random() * 30 }; this.drones.set(dr.id, v); }
      const dop = C_SOUND / Math.max(200, C_SOUND - (dr.closing || 0)), f = v.base * dop * (1 + 0.03 * Math.sin(t * 9 + v.base)); set(v.o1.frequency, f); set(v.o2.frequency, f * 2.01); set(v.g.gain, Math.min(0.2, 5 / (12 + dr.d))); }
    for (const [id, v] of this.drones) if (!seen.has(id)) { v.g.gain.setTargetAtTime(0, t, 0.03); v.o1.stop(t + 0.2); v.o2.stop(t + 0.2); this.drones.delete(id); }
  }
}
