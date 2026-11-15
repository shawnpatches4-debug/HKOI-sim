// The mixing desk under every sound in the simulator.
//
// Six buses (voices, weapons, explosions, vehicle, world, ui) run into one master with a limiter, so nothing can clip however
// much happens at once. Each bus has two inputs:
//   air     sound that reaches the listener through the open air. When the listener sits inside the hull this path is
//           low-passed and turned down (armour lets only the low thump through); with the head out of a hatch, a little.
//   direct  sound that reaches him some other way: through the structure of his own vehicle, or in his headset.
//
// ONE model of space for every sound (version 1.0):
//   distance     far(d): the sound arrives d / 343 seconds late (scaled by the simulation speed, so it stays in step with the
//                picture in slow motion), quieter, and with its highs gone. 343 m/s is the speed of sound at 20 degrees C:
//                a launch 3 km away is heard 8.75 s after it is seen.
//   occlusion    far(d, size, occl): something solid between the source and the listener (a building, a crest) takes away
//                level and most of the highs.
//   seat         setSeat('in' | 'hatch' | 'out'): the hull between the listener and the air.
//   environment  setEnv(biome, cond): what the country does to a loud sound. Open farmland: a thin long tail and one weak slap
//                off the ground. Desert: almost nothing comes back. Town: hard, bright echoes off the walls within a third
//                of a second. Forest: no clear echo, a short dull scatter, and the trees soak up highs with range.
//   ducking      duck(t0, t1): while somebody talks on the intercom, weapons, blasts, engine and weather are held back
//                (7 dB before the limiter) so the words stay clear.
//   master       limiter + ceiling: the output never goes above -3.3 dB of full scale (true peak under -1 dB). Night mode squeezes loud and quiet
//                together (for playing late). Volume groups: master, voices, effects, ambience.
// LOUDNESS TARGET at the default volume (the master slider at 100%): the busiest 20 s of a heavy battle about -16 LUFS (+-2), true peak under -1 dBTP;
// measured by tests/audio/measure.py.
//
// Recordings: assets/sfx_index.json can name a recording for any sound "slot". When a slot has one, it is played in place
// of the synthesised sound, through the same distance and inside/outside treatment. See docs/ASSETS.md.

export const C_SOUND = 343;   // speed of sound, m/s, at 20 degrees C
export const BUSES = ['voices', 'weapons', 'explosions', 'vehicle', 'world', 'ui'];
// the volume sliders in the menu, and the buses each one moves
export const GROUPS = { voices: ['voices', 'ui'], effects: ['weapons', 'explosions'], ambience: ['vehicle', 'world'] };
const DUCKED = { weapons: 1, explosions: 1, vehicle: 1, world: 1 };
// Fixed balance between the buses. Measured on the busy battle from the gunner's seat: the intercom alone was -16.6 LUFS and the
// guns 5 dB under it; the voices come down 1.5 dB so that the guns have more room (voices stay first: they also duck everything).
// Weapons and blasts are trimmed so that ONE gun or blast close by arrives at about full scale before the limiter (measured:
// 30 mm at 30 m -1.5 dB, 120 mm at 40 m +3 dB, Trophy at 15 m +2 dB): the limiter then only works when several things coincide.
// Driven 9 dB harder, as a first pass was, every shot was flattened and the voices pumped with it.
const TRIM = { voices: 0.84, weapons: 0.6, explosions: 0.6 };

// how the hull changes what arrives through the air, by where the listener's head is
const SEAT = {
  out: { cut: 20000, gain: 1.0 },
  hatch: { cut: 3200, gain: 0.8 },     // head out, in a crewman's helmet with ear cups
  in: { cut: 300, gain: 0.5 },         // buttoned up behind armour
};
// What the surroundings give back. len / decay: length (s) and decay rate of the diffuse tail; bright: how much treble the tail
// keeps; slaps: [seconds, level] of distinct echoes; send: how strongly sounds feed the space; cutK: extra loss of highs with
// range (1 = air only). ASSUMED by ear-less reasoning from geometry (a wall 30 m away answers after 0.17 s); nobody has listened.
export const ENV = {
  farmland: { len: 2.4, decay: 2.5, bright: 0.9, tail: 1, slaps: [[0.31, 0.22]], send: 1, cutK: 1 },
  desert: { len: 2.0, decay: 3.4, bright: 0.7, tail: 0.6, slaps: [], send: 0.7, cutK: 1 },
  town: { len: 1.6, decay: 3.0, bright: 1.5, tail: 1.3, slaps: [[0.085, 0.5], [0.17, 0.42], [0.29, 0.3], [0.44, 0.18]], send: 1.5, cutK: 0.9 },
  forest: { len: 0.9, decay: 6.0, bright: 0.45, tail: 1.1, slaps: [], send: 0.9, cutK: 0.55 },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Mixer {
  constructor(ctx, volume = 0.8) {
    const c = this.ctx = ctx;
    this.volume = volume; this.seat = 'out'; this.slots = {}; this.sampleBufs = {}; this.rate = 1; this.night = false;
    this.group = { voices: 1, effects: 1, ambience: 1 }; this.envName = ''; this.env = ENV.farmland; this.irs = {};
    // master: sum -> night-mode squeeze -> limiter -> soft clip (a hard guarantee that the output stays inside full scale) -> volume
    // Quiet and middling sounds pass through untouched; only what would go over full scale is held back.
    this.sum = c.createGain(); this.sum.gain.value = 0.8;
    const nc = this.nightComp = c.createDynamicsCompressor();   /* does nothing until night mode: threshold at full scale, ratio 1 */
    nc.threshold.value = 0; nc.knee.value = 0; nc.ratio.value = 1; nc.attack.value = 0.008; nc.release.value = 0.3;
    this.nightGain = c.createGain(); this.nightGain.gain.value = 1;
    const lim = this.limiter = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.14;
    const trim = c.createGain(); trim.gain.value = 0.86;   /* takes back the gain the compressor adds by itself */
    const clip = c.createWaveShaper(), curve = new Float32Array(2049);
    for (let k = 0; k < 2049; k++) curve[k] = Math.tanh(k / 1024 - 1);   /* gentle below, flat at the top: the ceiling */
    clip.curve = curve; clip.oversample = '4x';   /* oversampled, or the bend makes peaks between the samples */
    const lift = c.createGain(); lift.gain.value = 0.9;   /* ceiling tanh(1) x 0.9 = 0.69 of full scale = -3.3 dB at full volume. Measured: peaks between the samples overshoot the ceiling by up to 1.7 dB, so the true peak stays under -1 dB */
    this.master = c.createGain(); this.master.gain.value = volume;
    this.sum.connect(nc); nc.connect(this.nightGain); this.nightGain.connect(lim); lim.connect(trim); trim.connect(clip); clip.connect(lift); lift.connect(this.master); this.master.connect(c.destination);
    // the air path shared by all buses: hull filter (two stages, steep), hull loss, and the "ears ringing" dip after a hit
    this.airMix = c.createGain();
    this.hull1 = c.createBiquadFilter(); this.hull1.type = 'lowpass'; this.hull1.frequency.value = 20000; this.hull1.Q.value = 0.6;
    this.hull2 = c.createBiquadFilter(); this.hull2.type = 'lowpass'; this.hull2.frequency.value = 20000; this.hull2.Q.value = 0.6;
    this.hullGain = c.createGain(); this.shock = c.createGain();
    this.airMix.connect(this.hull1); this.hull1.connect(this.hull2); this.hull2.connect(this.hullGain); this.hullGain.connect(this.shock); this.shock.connect(this.sum);
    // ducking under speech: everything except the voices and the headset tones passes through these two gains
    this.duckAir = c.createGain(); this.duckDirect = c.createGain(); this.duckAir.connect(this.airMix); this.duckDirect.connect(this.sum); this.duckUntil = 0;
    this.bus = {};
    for (const name of BUSES) {
      const air = c.createGain(), direct = c.createGain(), airLevel = c.createGain(), directLevel = c.createGain();
      air.connect(airLevel); airLevel.connect(DUCKED[name] ? this.duckAir : this.airMix); direct.connect(directLevel); directLevel.connect(DUCKED[name] ? this.duckDirect : this.sum);
      this.bus[name] = { air, direct, airLevel, directLevel, level: 1, group: 1, trim: TRIM[name] || 1 }; airLevel.gain.value = directLevel.gain.value = TRIM[name] || 1;
    }
    this._buffers();
    // the two spaces: the country around (changes with the map: setEnv) and the steel box of the turret
    this.space = c.createConvolver(); this.spaceOut = c.createGain(); this.spaceOut.gain.value = 0.5;
    this.space.connect(this.spaceOut); this.spaceOut.connect(this.bus.world.air); this.setEnv('farmland');
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
  // The surroundings as an impulse response: a diffuse tail that gets duller as it dies, plus the distinct slaps of ENV.
  _envIR(E) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * E.len), ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0, slow = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, k = clamp(E.bright * Math.exp(-t * 2.6) + 0.05, 0.05, 1);   /* bright at first, duller as it dies */
        lp += k * ((Math.random() * 2 - 1) - lp); slow += 0.012 * (lp - slow);   /* `slow` is the boom under about 90 Hz: left out, or tails turn to mud */
        d[i] = E.tail * (lp - slow) * Math.exp(-t * E.decay) * (t < 0.03 ? t / 0.03 : 1) * (0.35 + 0.9 * (1 - k));
      }
      E.slaps.forEach(([ts, amp], j) => {
        const i0 = Math.floor(ts * (ch ? 1.09 : 0.94) * sr), w = Math.floor(sr * (0.004 + 0.003 * j));   /* each ear gets the slap at a slightly different time */
        for (let i = 0; i < w && i0 + i < len; i++) d[i0 + i] += amp * (Math.random() * 2 - 1) * (1 - i / w);
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
  _level(name) { const b = this.bus[name], t = this.ctx.currentTime, v = b.level * b.group * b.trim; b.airLevel.gain.setTargetAtTime(v, t, 0.02); b.directLevel.gain.setTargetAtTime(v, t, 0.02); }
  setBus(name, level) { const b = this.bus[name]; if (!b) return; b.level = level; this._level(name); }
  // a volume slider: group = 'voices' | 'effects' | 'ambience', v = 0 to 1 (1 = as mixed)
  setGroup(group, v) { const L = GROUPS[group]; if (!L) return; v = clamp(+v || 0, 0, 1.5); this.group[group] = v; for (const n of L) { this.bus[n].group = v; this._level(n); } }
  // Night mode: loud things come down, quiet things come up (a 3:1 squeeze above -30 dB with make-up gain), and the sub-bass
  // that carries through walls stays as it is mixed (the squeeze works on it hardest, because it is the loudest part).
  setNight(on) {
    on = !!on; if (on === this.night) return; this.night = on; const t = this.ctx.currentTime, n = this.nightComp;
    n.threshold.setTargetAtTime(on ? -30 : 0, t, 0.05); n.ratio.setTargetAtTime(on ? 3 : 1, t, 0.05); n.knee.setTargetAtTime(on ? 10 : 0, t, 0.05);
    this.nightGain.gain.setTargetAtTime(on ? 0.62 : 1, t, 0.05);   /* the compressor adds make-up gain of its own; this brings a busy battle out about 4 LU quieter than normal (measured) */
  }
  // where the listener's head is: 'out' | 'hatch' | 'in'
  setSeat(seat) {
    if (!SEAT[seat]) seat = 'out'; if (seat === this.seat) return; this.seat = seat;
    const s = SEAT[seat], t = this.ctx.currentTime;
    this.hull1.frequency.setTargetAtTime(s.cut, t, 0.06); this.hull2.frequency.setTargetAtTime(Math.min(20000, s.cut * 1.6), t, 0.06);
    this.hullGain.gain.setTargetAtTime(s.gain, t, 0.06); this.cabinOut.gain.setTargetAtTime(seat === 'in' ? 0.55 : seat === 'hatch' ? 0.15 : 0, t, 0.06);
  }
  // the country around the listener: biome = farmland | desert | town | forest; snow on the ground swallows echoes and highs
  setEnv(biome, cond) {
    const name = (ENV[biome] ? biome : 'farmland') + (cond === 'snow' ? '+snow' : ''); if (name === this.envName) return; this.envName = name;
    const E = ENV[biome] || ENV.farmland; this.env = cond === 'snow' ? { ...E, tail: E.tail * 0.6, send: E.send * 0.7, cutK: E.cutK * 0.8, slaps: E.slaps.map(s => [s[0], s[1] * 0.6]) } : E;
    if (!this.irs[name]) this.irs[name] = this._envIR(this.env);
    this.space.buffer = this.irs[name];
  }
  // after a hit: the world goes dull and the ears ring for a few seconds
  deafen(seconds, depth = 0.12) {
    const t = this.ctx.currentTime, g = this.shock.gain, e = this.earGain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(depth, t); g.linearRampToValueAtTime(1, t + seconds);
    e.cancelScheduledValues(t); e.setValueAtTime(0.0001, t); e.exponentialRampToValueAtTime(0.05, t + 0.06); e.exponentialRampToValueAtTime(0.0001, t + seconds * 1.15); e.setValueAtTime(0, t + seconds * 1.15 + 0.01);
  }
  // Hold everything but the voices back from t0 to t1 (somebody is talking in the headset). depth 0.45 = 7 dB down before the
  // limiter; measured after it, a 30 mm round under speech peaks about 4 dB lower than one in the clear.
  // Explicit ramps only: down in 60 ms, back up over 300 ms. A second line before the first has ended just extends the hold.
  duck(t0, t1, depth = 0.45) {
    const now = this.ctx.currentTime; t0 = Math.max(t0, now); if (t1 <= t0) return;
    for (const g of [this.duckAir.gain, this.duckDirect.gain]) {
      g.cancelScheduledValues(t0);
      if (t0 >= this.duckUntil) { g.setValueAtTime(1, t0); g.linearRampToValueAtTime(depth, t0 + 0.06); } else g.setValueAtTime(depth, t0);
      g.setValueAtTime(depth, Math.max(t1, t0 + 0.07)); g.linearRampToValueAtTime(1, Math.max(t1, t0 + 0.07) + 0.3);
    }
    this.duckUntil = Math.max(t1, t0 + 0.07) + 0.3;
  }

  // ---------------------------------------------------------------- distance
  // What `d` metres of air do to a sound: it arrives late (speed of sound), quieter, and with its highs gone
  // (air soaks up high frequencies; past a kilometre or two only the low thump is left). `size` scales loudness.
  // occl: 0 (clear line) to 1 (solid ground or buildings in between).
  // The level law is deliberately gentler than nature's (a real gun is 40 dB quieter at 3 km than at 30 m; here it is 21 dB):
  // otherwise a distant battle would be inaudible on loudspeakers. ASSUMED, the usual practice in game sound.
  far(d, size = 1, occl = 0) {
    d = Math.max(0, d || 0); occl = clamp(occl || 0, 0, 1); const E = this.env;
    return {
      d, delay: d / C_SOUND,
      gain: size * Math.pow(25 / (25 + d), 0.6) * (1 - 0.6 * occl),
      cut: clamp(17000 / (1 + Math.pow(d / (170 * E.cutK), 1.25)) * (1 - 0.8 * occl), 170, 17000),
      roll: clamp((d - 150) / 1200, 0, 1),   // how much of what is heard is the low rolling tail
      near: clamp(1 - (d - 150) / 1200, 0, 1) * (1 - occl),
    };
  }
  // One sound event's own little channel: level and loss of highs for its distance, into a bus, with a send to a space.
  // Returns { in, t } : connect sources to `in`, schedule them from time `t` (now + the travel time).
  voice(busName, { far = null, direct = false, gain = 1, cut = 0, space = 0, cabin = 0, delay = 0, pan = 0 } = {}) {
    const c = this.ctx, b = this.bus[busName], g = c.createGain(); let out = g;
    const t = c.currentTime + 0.005 + delay + (far ? far.delay / this.rate : 0);
    g.gain.value = gain * (far ? far.gain : 1);
    const fc = cut || (far ? far.cut : 0);
    if (fc && fc < 16000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc; f.Q.value = 0.5; g.connect(f); out = f; }
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); out.connect(p); out = p; }
    out.connect(direct ? b.direct : b.air);
    if (space > 0) { const s = c.createGain(); s.gain.value = space * this.env.send; out.connect(s); s.connect(this.space); }
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
    if (hold > 0) g.gain.linearRampToValueAtTime(gain, when + attack + hold);   /* an explicit flat stretch: the offline engine used for the measurements kept climbing through a gap (measured: +19 dB over 2.5 s) */
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
  // Something passing the listener at speed: a band of noise and a tone whose pitch and level follow the true geometry of
  // the pass (Doppler). speed m/s, miss = closest distance in metres, span = seconds either side of the closest moment.
  // hz: the centre of the noise band at rest; tone: a pitched part at rest (0 = none). Returns the time of closest approach.
  pass(dest, when, { speed = 250, miss = 10, span = 1.2, hz = 1100, tone = 0, gain = 1, color = 'pink', q = 1.2 } = {}) {
    const c = this.ctx, N = 48, F = new Float32Array(N), G = new Float32Array(N), T = new Float32Array(N), dur = 2 * span;
    for (let i = 0; i < N; i++) {
      const tau = -span + dur * i / (N - 1), x = speed * tau, r = Math.hypot(miss, x), vr = speed * x / r;   /* vr > 0: going away */
      const dop = C_SOUND / (C_SOUND + clamp(vr, -0.92 * C_SOUND, 3 * C_SOUND)), edge = Math.min(1, i / 3, (N - 1 - i) / 3);
      F[i] = clamp(hz * dop, 60, 16000); T[i] = clamp(tone * dop, 20, 16000); G[i] = gain * edge * Math.pow(miss / r, 0.9);
    }
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), buf = this[color] || this.pink;
    s.buffer = buf; s.loop = true; fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueCurveAtTime(F, when, dur); g.gain.setValueAtTime(0, Math.max(0, when - 0.001)); g.gain.setValueCurveAtTime(G, when, dur);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(when, Math.random() * (buf.duration - 0.1)); s.stop(when + dur + 0.05);
    if (tone) {
      const o = c.createOscillator(), lp = c.createBiquadFilter(), og = c.createGain(), GT = G.map(v => v * 0.25);
      o.type = 'sawtooth'; o.frequency.setValueCurveAtTime(T, when, dur); lp.type = 'lowpass'; lp.frequency.value = Math.max(600, tone * 4); og.gain.setValueAtTime(0, Math.max(0, when - 0.001)); og.gain.setValueCurveAtTime(GT, when, dur);
      o.connect(lp); lp.connect(og); og.connect(dest); o.start(when); o.stop(when + dur + 0.05);
    }
    return when + span;
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
