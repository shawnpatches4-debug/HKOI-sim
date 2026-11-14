// The mixing desk under every sound in the simulator.
//
// Six buses (voices, weapons, explosions, vehicle, world, ui) run into one master with a limiter, so nothing can clip however
// much happens at once. Each bus has two inputs:
//   air     sound that reaches the listener through the open air. When the listener sits inside the hull this path is
//           low-passed and turned down (armour lets only the low thump through); with the head out of a hatch, a little.
//   direct  sound that reaches him some other way: through the structure of his own vehicle, or in his headset.
// Two "spaces" are made in code (no recordings): the open country (a long dark tail with a few slaps off the ground and
// tree lines) and the steel box of the turret (short and ringing).
//
// Recordings: assets/sfx_index.json can name a recording for any sound "slot". When a slot has one, it is played in place
// of the synthesised sound, through the same distance and inside/outside treatment. See docs/ASSETS.md.

export const C_SOUND = 343;   // speed of sound, m/s
export const BUSES = ['voices', 'weapons', 'explosions', 'vehicle', 'world', 'ui'];

// how the hull changes what arrives through the air, by where the listener's head is
const SEAT = {
  out: { cut: 20000, gain: 1.0 },
  hatch: { cut: 3200, gain: 0.8 },     // head out, in a crewman's helmet with ear cups
  in: { cut: 300, gain: 0.5 },         // buttoned up behind armour
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Mixer {
  constructor(ctx, volume = 0.8) {
    const c = this.ctx = ctx;
    this.volume = volume; this.seat = 'out'; this.slots = {}; this.sampleBufs = {};
    // master: sum -> limiter -> soft clip (a hard guarantee that the output stays inside full scale) -> volume
    // Quiet and middling sounds pass through untouched; only what would go over full scale is held back.
    this.sum = c.createGain(); this.sum.gain.value = 0.7;
    const lim = this.limiter = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.14;
    const trim = c.createGain(); trim.gain.value = 0.86;   /* takes back the gain the compressor adds by itself */
    const clip = c.createWaveShaper(), curve = new Float32Array(2049);
    for (let k = 0; k < 2049; k++) curve[k] = Math.tanh(k / 1024 - 1);   /* gentle below, flat at the top: the ceiling */
    clip.curve = curve;
    const lift = c.createGain(); lift.gain.value = 1.25;   /* ceiling tanh(1) x 1.25 = 0.95 of full scale */
    this.master = c.createGain(); this.master.gain.value = volume;
    this.sum.connect(lim); lim.connect(trim); trim.connect(clip); clip.connect(lift); lift.connect(this.master); this.master.connect(c.destination);
    // the air path shared by all buses: hull filter (two stages, steep), hull loss, and the "ears ringing" dip after a hit
    this.airMix = c.createGain();
    this.hull1 = c.createBiquadFilter(); this.hull1.type = 'lowpass'; this.hull1.frequency.value = 20000; this.hull1.Q.value = 0.6;
    this.hull2 = c.createBiquadFilter(); this.hull2.type = 'lowpass'; this.hull2.frequency.value = 20000; this.hull2.Q.value = 0.6;
    this.hullGain = c.createGain(); this.shock = c.createGain();
    this.airMix.connect(this.hull1); this.hull1.connect(this.hull2); this.hull2.connect(this.hullGain); this.hullGain.connect(this.shock); this.shock.connect(this.sum);
    this.bus = {};
    for (const name of BUSES) {
      const air = c.createGain(), direct = c.createGain(), airLevel = c.createGain(), directLevel = c.createGain();
      air.connect(airLevel); airLevel.connect(this.airMix); direct.connect(directLevel); directLevel.connect(this.sum);
      this.bus[name] = { air, direct, airLevel, directLevel, level: 1 };
    }
    this._buffers();
    // the two spaces
    this.space = c.createConvolver(); this.space.buffer = this._countryIR(); this.spaceOut = c.createGain(); this.spaceOut.gain.value = 0.5;
    this.space.connect(this.spaceOut); this.spaceOut.connect(this.bus.world.air);
    this.cabin = c.createConvolver(); this.cabin.buffer = this._cabinIR(); this.cabinOut = c.createGain(); this.cabinOut.gain.value = 0;
    this.cabin.connect(this.cabinOut); this.cabinOut.connect(this.bus.vehicle.direct);
    // ringing ears
    this.earTone = c.createOscillator(); this.earTone.frequency.value = 4300; this.earGain = c.createGain(); this.earGain.gain.value = 0;
    this.earTone.connect(this.earGain); this.earGain.connect(this.bus.ui.direct); this.earTone.start();
  }

  // ---------------------------------------------------------------- buffers made in code
  _buffers() {
    const c = this.ctx, sr = c.sampleRate, n = sr * 2;
    const white = this.white = c.createBuffer(1, n, sr), w = white.getChannelData(0);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    // pink: equal energy per octave (Paul Kellet's filter); the natural colour of wind, rain and engine rush
    const pink = this.pink = c.createBuffer(1, n, sr), p = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    }
    // brown: falls 6 dB per octave; rumble and distant blasts
    const m = sr * 4, brown = this.brown = c.createBuffer(1, m, sr), d = brown.getChannelData(0); let b = 0;
    for (let i = 0; i < m; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
  }
  // open country: nothing near to reflect, so a thin, dark, long tail with a few distinct slaps (ground, tree lines, far slopes)
  _countryIR() {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 2.4), ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0, slow = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, k = clamp(0.9 * Math.exp(-t * 2.6) + 0.05, 0.05, 1);   /* bright at first, duller as it dies */
        lp += k * ((Math.random() * 2 - 1) - lp); slow += 0.012 * (lp - slow);   /* `slow` is the boom under about 90 Hz: left out, or tails turn to mud */
        d[i] = (lp - slow) * Math.exp(-t * 2.5) * (t < 0.03 ? t / 0.03 : 1) * (0.35 + 0.9 * (1 - k));
      }
      const slaps = ch ? [0.071, 0.163, 0.297, 0.52, 0.83] : [0.058, 0.181, 0.262, 0.47, 0.91];
      slaps.forEach((ts, j) => {
        const i0 = Math.floor(ts * sr), w = Math.floor(sr * (0.004 + 0.004 * j)), amp = 0.55 * Math.pow(0.62, j);
        for (let i = 0; i < w && i0 + i < len; i++) d[i0 + i] += amp * (Math.random() * 2 - 1) * (1 - i / w) * (j > 1 ? 0.6 : 1);
      });
    }
    return ir;
  }
  // the turret: a small steel box. Very dense early reflections and a handful of ringing modes.
  _cabinIR() {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 0.42), ir = c.createBuffer(2, len, sr);
    const modes = [163, 287, 441, 612, 905, 1340, 1870, 2630];
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / sr; let s = (Math.random() * 2 - 1) * Math.exp(-t * 26) * 0.5;
        for (let m = 0; m < modes.length; m++) s += Math.sin(2 * Math.PI * modes[m] * (1 + 0.004 * ch) * t + m * 1.7 + ch) * Math.exp(-t * (9 + m * 2.2)) * 0.09;
        d[i] = s * (t < 0.002 ? t / 0.002 : 1);
      }
    }
    return ir;
  }

  // ---------------------------------------------------------------- state
  setVolume(v, on = true) { this.volume = v; this.master.gain.setTargetAtTime(on ? v : 0, this.ctx.currentTime, 0.05); }
  setBus(name, level) { const b = this.bus[name]; if (!b) return; const t = this.ctx.currentTime; b.level = level; b.airLevel.gain.setTargetAtTime(level, t, 0.02); b.directLevel.gain.setTargetAtTime(level, t, 0.02); }
  // where the listener's head is: 'out' | 'hatch' | 'in'
  setSeat(seat) {
    if (!SEAT[seat]) seat = 'out'; if (seat === this.seat) return; this.seat = seat;
    const s = SEAT[seat], t = this.ctx.currentTime;
    this.hull1.frequency.setTargetAtTime(s.cut, t, 0.06); this.hull2.frequency.setTargetAtTime(Math.min(20000, s.cut * 1.6), t, 0.06);
    this.hullGain.gain.setTargetAtTime(s.gain, t, 0.06); this.cabinOut.gain.setTargetAtTime(seat === 'in' ? 0.55 : seat === 'hatch' ? 0.15 : 0, t, 0.06);
  }
  // after a hit: the world goes dull and the ears ring for a few seconds
  deafen(seconds, depth = 0.12) {
    const t = this.ctx.currentTime, g = this.shock.gain, e = this.earGain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(depth, t); g.linearRampToValueAtTime(1, t + seconds);
    e.cancelScheduledValues(t); e.setValueAtTime(0.0001, t); e.exponentialRampToValueAtTime(0.05, t + 0.06); e.exponentialRampToValueAtTime(0.0001, t + seconds * 1.15); e.setValueAtTime(0, t + seconds * 1.15 + 0.01);
  }

  // ---------------------------------------------------------------- distance
  // What `d` metres of air do to a sound: it arrives late (speed of sound), quieter, and with its highs gone
  // (air soaks up high frequencies; past a kilometre or two only the low thump is left). `size` scales loudness.
  far(d, size = 1) {
    d = Math.max(0, d || 0);
    return {
      d, delay: d / C_SOUND,
      gain: size * Math.pow(18 / (18 + d), 0.85),
      cut: clamp(17000 / (1 + Math.pow(d / 170, 1.25)), 170, 17000),
      roll: clamp((d - 150) / 1200, 0, 1),   // how much of what is heard is the low rolling tail
    };
  }
  // One sound event's own little channel: level and loss of highs for its distance, into a bus, with a send to a space.
  // Returns { in, t } : connect sources to `in`, schedule them from time `t` (now + the travel time).
  voice(busName, { far = null, direct = false, gain = 1, cut = 0, space = 0, cabin = 0, delay = 0, pan = 0 } = {}) {
    const c = this.ctx, b = this.bus[busName], g = c.createGain(); let out = g;
    const t = c.currentTime + 0.005 + delay + (far ? far.delay : 0);
    g.gain.value = gain * (far ? far.gain : 1);
    const fc = cut || (far ? far.cut : 0);
    if (fc && fc < 16000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc; f.Q.value = 0.5; g.connect(f); out = f; }
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); out.connect(p); out = p; }
    out.connect(direct ? b.direct : b.air);
    if (space > 0) { const s = c.createGain(); s.gain.value = space; out.connect(s); s.connect(this.space); }
    if (cabin > 0) { const s = c.createGain(); s.gain.value = cabin; out.connect(s); s.connect(this.cabin); }
    return { in: g, t };
  }

  // ---------------------------------------------------------------- building blocks
  // a shaped burst of noise. color: white | pink | brown. The filter can sweep from f0 to f1 over the burst.
  noise(dest, when, { dur = 0.3, attack = 0.002, hold = 0, gain = 0.5, color = 'white', type = 'lowpass', f0 = 4000, f1 = 0, q = 0.7 } = {}) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), buf = this[color] || this.white;
    s.buffer = buf; s.loop = true; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(clamp(f0, 20, 20000), when);
    if (f1) fl.frequency.exponentialRampToValueAtTime(clamp(f1, 20, 20000), when + attack + hold + dur);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + attack);
    g.gain.setTargetAtTime(0, when + attack + hold, dur / 4.6);   /* down 40 dB after `dur` */
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(when, Math.random() * (buf.duration - 0.1)); s.stop(when + attack + hold + dur * 1.5 + 0.02);
    return g;
  }
  // a pitched body: a sine (or other wave) falling from f0 to f1. The chest thump of a gun, the slam of a blast.
  tone(dest, when, { f0 = 90, f1 = 0, dur = 0.4, gain = 0.6, attack = 0.004, type = 'sine' } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, when); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(8, f1), when + dur);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + attack); g.gain.setTargetAtTime(0, when + attack, dur / 4.6);
    o.connect(g); g.connect(dest); o.start(when); o.stop(when + attack + dur * 1.5 + 0.02);
    return g;
  }
  // struck metal: several partials that are not in tune with each other, each dying at its own rate
  ring(dest, when, { freqs = [820, 1310, 2140], dur = 0.3, gain = 0.2, spread = 0.03 } = {}) {
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i] * (1 + (Math.random() - 0.5) * spread);
      this.tone(dest, when, { f0: f, dur: dur * (1 - 0.5 * i / freqs.length), gain: gain / (1 + i * 0.6), attack: 0.0008 });
    }
  }
  // a continuous layer: looped noise through a filter into a gain that update() moves
  bed(busName, { direct = false, color = 'pink', type = 'lowpass', f = 800, q = 0.7 } = {}) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), b = this.bus[busName];
    s.buffer = this[color]; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(direct ? b.direct : b.air); s.start(0, Math.random() * 1.5);
    return { s, fl, g, src: s };
  }

  // ---------------------------------------------------------------- recordings in place of synthesis
  // manifest: { base (optional folder), slots: { name: [ { file, start, len, gain, ref, loop } ... ] } }
  // get(url) returns a promise of an ArrayBuffer (or null). Unknown or failed files simply leave the synthesised sound in place.
  async loadSlots(manifest, base, get) {
    if (!manifest || !manifest.slots) return 0; let n = 0;
    for (const name in manifest.slots) {
      const list = (manifest.slots[name] || []).filter(e => e && e.file);
      for (const e of list) {
        if (!(e.file in this.sampleBufs)) {
          this.sampleBufs[e.file] = null;
          try { const a = await get(base + e.file); if (a) this.sampleBufs[e.file] = await this.ctx.decodeAudioData(a); } catch (err) { /* stays synthesised */ }
        }
      }
      const ok = list.filter(e => this.sampleBufs[e.file]); if (ok.length) { this.slots[name] = ok; n++; }
    }
    return n;
  }
  has(slot) { return !!this.slots[slot]; }
  // play the recording of a slot into a voice (see voice()). Returns false when the slot has no recording.
  sample(slot, v, { gain = 1, rate = 1 } = {}) {
    const L = this.slots[slot]; if (!L) return false;
    const e = L[Math.floor(Math.random() * L.length)], c = this.ctx, s = c.createBufferSource(), g = c.createGain(), buf = this.sampleBufs[e.file];
    s.buffer = buf; s.playbackRate.value = rate * (0.97 + Math.random() * 0.06); g.gain.value = gain * (e.gain == null ? 1 : e.gain);
    s.connect(g); g.connect(v.in); s.start(v.t, e.start || 0, e.len || Math.max(0.01, buf.duration - (e.start || 0)));
    return true;
  }
  // swap a bed's looping noise for a looping recording (turbine, tracks, wind, rain ...)
  bedSample(slot, bed) {
    const L = this.slots[slot]; if (!L || bed.swapped) return false;
    const e = L[0], c = this.ctx, s = c.createBufferSource(), buf = this.sampleBufs[e.file], pre = c.createGain();
    s.buffer = buf; s.loop = true; if (e.start != null) { s.loopStart = e.start; s.loopEnd = e.start + (e.len || buf.duration - e.start); }
    pre.gain.value = e.gain == null ? 1 : e.gain; s.connect(pre); pre.connect(bed.g); try { bed.s.stop(); } catch (err) { /* already stopped */ }
    s.start(0, e.start || 0); bed.src = s; bed.swapped = true; return true;
  }
}
