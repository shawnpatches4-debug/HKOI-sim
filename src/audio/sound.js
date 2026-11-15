// Sound engine: the one object the rest of the simulator talks to.
//
//   mixer.js     buses, limiter, inside/outside treatment, distance, surroundings, ducking, the building blocks, recordings in place of synthesis
//   effects.js   the one-shot sounds (30 mm, 120 mm and the loading drill, machine guns, Trophy, launches, blasts, strikes ...)
//   intercom.js  the crew's voices: recorded human clips only, queued and keyed like an intercom
//   crewtalk.js  who says what and when, from the battle's events
//   panel.js     the sound menu (volume sliders, night mode, tension layer, mute)
//   this file    start-up, the continuous layers (engine, tracks, turret, weather, wildlife, far battle, drones,
//                warning tones, the optional tension layer), the settings, and the calls other code uses
//
// ONE CALL FOR ANY EVENT: sound.event(type, info). info.d = metres from the listener (left out: the distance to the own vehicle).
// The types are listed at EVENTS below; an unknown type is ignored and counted in sound.unknown. (`sound.on` is the on/off
// switch the page already uses, so the call could not be named on().)
//
// Everything except the voices is synthesised until recordings arrive. Nobody has listened to any of it in the
// workspace: it was rendered to files and measured (tests/audio/). Recordings replace a sound by naming a file for its
// slot in assets/sfx_index.json; no code changes are needed (docs/ASSETS.md, "Sound slots").
import { Mixer, C_SOUND, GROUPS } from './mixer.js';
import { Effects, SLOTS } from './effects.js';
import { Intercom } from './intercom.js';
import { CrewTalk, engineLine } from './crewtalk.js';

// where the listener's head is in each camera view: 'in' behind armour, 'hatch' head out in a helmet, otherwise outside.
// Both 'in' and 'hatch' hear the intercom. A view not listed here is outside.
export const SEATS = { cdr: 'hatch', ldr: 'hatch', gnr: 'in', citv: 'in', hkoi: 'in', drv: 'in', in_cdr: 'in', in_gnr: 'in', in_ldr: 'in', in_drv: 'in' };   /* in_*: the seats inside the turret and hull (interior.js) */
// looped layers a recording can replace, besides the one-shot slots in effects.js
export const BED_SLOTS = ['turbine_in_loop', 'turbine_out_loop', 'tracks_loop', 'wind_loop', 'rain_loop', 'rain_roof_loop'];
export { SLOTS, GROUPS };
// the settings the sound menu keeps (panel.js): volumes 0 to 1, night mode, the tension layer
export const DEFAULTS = { master: 0.8, voices: 1, effects: 1, ambience: 1, night: false, tension: false };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const p_set = (p, v, t) => p.setTargetAtTime(v, t, 0.08);
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

// sound.event(type, info): every kind of event the simulator can hand to the sound, one line each. `s` is the Sound object,
// `i` the info, `d` the distance in metres. Fields besides d are named in each line.
const TANK_GUN = { t72: 1, t90: 1, t80: 1, tank: 1 };
export const EVENTS = {
  gun30: (s, i, d) => s.gun30(d), gun: (s, i, d) => s.gun30(d),                                 // one 30 mm round of the weapon station
  gun120: (s, i, d) => s.gun120(d), wingman_gun: (s, i, d) => s.gun120(d),                      // a 120 mm (ours, or a wingman's at his distance)
  mg: (s, i, d) => s.mg(d, !!i.heavy),                                                          // one machine-gun round; heavy: the .50
  trophy: (s, i, d) => s.aps(d), aps: (s, i, d) => s.aps(d),
  // a launch. key: the weapon (kornet, saclos, sal, rpg, fpv ...; t72 / t90: a tank gun firing at us, with speed and miss;
  // bmp2: an autocannon burst of n rounds); big: a guided missile rather than an RPG; occl: 0 to 1, how much is in the way
  launch: (s, i, d) => (TANK_GUN[i.key] ? s.tankRound(d, i.speed || 1700, i.miss == null ? 12 : i.miss) : i.key === 'bmp2' ? s.autocannon(d, i.n || 5, i) : s.launch(d, i.big == null ? i.key !== 'rpg' : !!i.big, i)),
  tank_round: (s, i, d) => s.tankRound(d, i.speed || 1700, i.miss == null ? 12 : i.miss),
  autocannon: (s, i, d) => s.autocannon(d, i.n || 5, i),
  pass: (s, i, d) => s.whoosh(i.dur || 0.5, i.gain == null ? Math.min(0.6, 30 / (30 + d)) : i.gain, i), flyby: (s, i, d) => s.whoosh(i.dur || 0.5, i.gain == null ? Math.min(0.6, 30 / (30 + d)) : i.gain, i),
  explosion: (s, i, d) => s.explosion(d, i.size || 1, i),                                        // size 0.5 to 2.6; ground: a burst on the ground; delay: seconds from now
  ground_burst: (s, i, d) => s.explosion(d, i.size || 1, { ...i, ground: true }),
  airburst: (s, i, d) => s.airburst(d, i.size || 0.5),
  artillery: (s, i, d) => s.artillery(d, i.flight == null ? 1.6 : i.flight, i.size || 2),        // call it `flight` seconds before the shell lands
  hit: (s, i) => s.hit(!!i.killing, i),                                                         // weapon or key; result: 'stopped' | 'through'
  penetration: (s, i) => s.penetration(i.strength || 1.6), near_miss: (s, i) => s.nearMiss(i.strength || 0.22),
  snap: (s, i) => s.snap(i.miss || 6, !!i.heavy), crack_thump: (s, i, d) => s.crackThump(d, i.speed || 1100, i.miss || 10, i.heavy !== false),
  ricochet: (s, i, d) => s.ricochet(d),
  smoke: (s, i, d) => s.smoke(d), obscurant: (s, i, d) => s.smoke(d),
  hatch: (s, i) => s.hatch(i.open !== false), load: s => s.load(), extinguisher: (s, i) => s.extinguisher(i.where || 'hull'),
  blowout: (s, i, d) => s.blowout(d, i.seconds || 5),
  // what became of a tank (ours or another at distance d). fate (or kind): a word containing blow / panel (ammunition burning
  // off through the roof panels), cata / cook / brew / turret (it blows up), fire / burn, mobil / track (a thrown track), abandon / bail
  tank_fate: (s, i, d) => {
    const f = String(i.fate || i.kind || i.by || '').toLowerCase();
    if (/blow|panel/.test(f)) s.blowout(d, i.seconds || 5);
    else if (/cata|cook|brew|turret|explod/.test(f)) { s.explosion(d, 2.6, i); s.explosion(d, 1.6, { ...i, delay: 0.35 }); s.blowout(d, 3); }
    else if (/fire|burn/.test(f)) { s.explosion(d, 1.0, i); s.blowout(d, 2.5); }
    else if (/mobil|track/.test(f)) s.trackBreak(d);
    else if (/abandon|bail/.test(f)) { s.hatch(true); }
    else s.explosion(d, 1.6, i);
  },
  order: s => s.blip('order'),                                                                  // the player gave an order: a short tone in the headset
};

export class Sound {
  constructor() {
    this.ctx = null; this.on = true; this.vol = DEFAULTS.master; this.seat = 'out'; this.inside = false; this.lite = false;
    this.levels = { ...DEFAULTS }; this.unknown = {};
    this.drones = new Map(); this.lastShot = -1e9; this.thr = 0.25; this.prev = null; this.next = {};
    this._get = url => fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  }
  // Must be called from a click or key press: browsers do not allow sound before that. (Tests pass their own context.)
  start(ctx) {
    if (this.ctx) { if (this.ctx.resume) this.ctx.resume(); return; }
    if (!ctx) { const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return; ctx = new AC(); }
    this.ctx = ctx; this.mix = new Mixer(ctx, this.vol); this.mix.setVolume(this.vol, this.on);
    this.icom = new Intercom(this.mix);
    this.talk = new CrewTalk(this.icom, { warn: (l, r) => this._warn(l, r), blip: k => this.blip(k), smoke: () => this.smoke(this.camDist || 0), extinguisher: w => this.extinguisher(w), load: () => this.load(), hatch: o => this.hatch(o) });
    this._beds(); this.set(this.levels);
  }
  setOn(v) { this.on = v; if (this.mix) this.mix.setVolume(this.vol, v); }
  // The sound menu's settings, any subset of DEFAULTS: { master, voices, effects, ambience (0 to 1), night, tension (true / false) }.
  // Safe to call before start(); returns the settings now in force.
  set(o = {}) {
    const L = this.levels; for (const k in DEFAULTS) if (o[k] != null) L[k] = typeof DEFAULTS[k] === 'boolean' ? !!o[k] : clamp(+o[k] || 0, 0, 1);
    this.vol = L.master;
    if (this.mix) { this.mix.setVolume(this.vol, this.on); for (const g in GROUPS) this.mix.setGroup(g, L[g]); this.mix.setNight(L.night); }
    return { ...L };
  }
  // One call for any event (see EVENTS). Returns false when the type is unknown or the sound is off.
  event(type, info) {
    const h = EVENTS[type]; if (!h) { this.unknown[type] = (this.unknown[type] || 0) + 1; return false; }
    if (!this._live()) return false; info = info || {};
    h(this, info, info.d == null ? this.camDist || 0 : info.d); return true;
  }

  // ------------------------------------------------------------------ continuous layers
  _beds() {
    const c = this.ctx, M = this.mix, B = this.bed = {};
    const osc = (type, f, dest, gain = 0) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.value = gain; o.connect(g); g.connect(dest); o.start(); return { o, g }; };
    // --- world
    B.wind = M.bed('world', { color: 'pink', f: 480 }); B.windHi = M.bed('world', { color: 'pink', type: 'bandpass', f: 1500, q: 0.8 });
    B.windHatch = M.bed('world', { direct: true, color: 'pink', type: 'bandpass', f: 600, q: 0.5 });   /* head out of the hatch: the wind of the vehicle's own movement on the helmet */
    B.rain = M.bed('world', { color: 'white', type: 'highpass', f: 2300 });
    B.rainRoof = M.bed('world', { direct: true, color: 'pink', type: 'bandpass', f: 1500, q: 0.7 });
    // --- the vehicle. Inside (direct): rumble through the seat, the turbine's rush and whine. Outside (air): exhaust roar and whine.
    B.rush = M.bed('vehicle', { direct: true, color: 'pink', type: 'bandpass', f: 520, q: 0.6 });
    B.rushOut = M.bed('vehicle', { color: 'pink', type: 'bandpass', f: 900, q: 0.5 });
    B.roarOut = M.bed('vehicle', { color: 'brown', f: 220 });
    B.whine = osc('sine', 2650, M.bus.vehicle.direct); B.whine2 = osc('sine', 3990, M.bus.vehicle.direct);
    B.whineOut = osc('sine', 2650, M.bus.vehicle.air); B.whineOut2 = osc('sine', 3990, M.bus.vehicle.air);
    B.howl = M.bed('vehicle', { color: 'white', type: 'bandpass', f: 2650, q: 18 });   /* the airy part of the turbine's whine: a narrow band of rush that follows its pitch */
    const humLP = c.createBiquadFilter(); humLP.type = 'lowpass'; humLP.frequency.value = 170; humLP.connect(M.bus.vehicle.direct);
    B.hum = osc('sawtooth', 62, humLP);
    // the turret's stabiliser and power drive standing by: a faint steady electrical hum inside (400 Hz supply and its harmonic)
    B.stab = osc('sine', 400, M.bus.vehicle.direct); B.stab2 = osc('triangle', 800, M.bus.vehicle.direct);
    // tracks: a low clatter chopped at the rate the track links meet the ground, the sprocket's whine, a squeal when the vehicle turns
    B.tracks = M.bed('vehicle', { direct: true, color: 'brown', f: 300 }); B.tracksOut = M.bed('vehicle', { color: 'brown', f: 700 });
    B.clat = c.createOscillator(); B.clat.type = 'square'; B.clat.frequency.value = 8; B.clatG = c.createGain(); B.clatG.gain.value = 0; B.clat.connect(B.clatG);
    B.clatG.connect(B.tracks.g.gain); B.clatG2 = c.createGain(); B.clatG2.gain.value = 0; B.clat.connect(B.clatG2); B.clatG2.connect(B.tracksOut.g.gain); B.clat.start();
    B.link = M.bed('vehicle', { color: 'white', type: 'bandpass', f: 1900, q: 2.5 }); B.clatG3 = c.createGain(); B.clatG3.gain.value = 0; B.clat.connect(B.clatG3); B.clatG3.connect(B.link.g.gain);   /* the metallic part of each link landing, heard outside */
    B.sprocket = osc('triangle', 120, M.bus.vehicle.direct);
    B.squeal = M.bed('vehicle', { color: 'white', type: 'bandpass', f: 2400, q: 14 }); B.squealIn = M.bed('vehicle', { direct: true, color: 'white', type: 'bandpass', f: 1700, q: 10 });
    B.rattle = M.bed('vehicle', { direct: true, color: 'white', type: 'bandpass', f: 3300, q: 1.2 });   /* loose kit and stowage shaking while moving */
    // the turret: traverse drive whir, heard inside
    const whirLP = c.createBiquadFilter(); whirLP.type = 'lowpass'; whirLP.frequency.value = 1400; whirLP.connect(M.bus.vehicle.direct);
    B.whir = osc('sawtooth', 240, whirLP); B.whirN = M.bed('vehicle', { direct: true, color: 'white', type: 'bandpass', f: 3100, q: 3 });
    // --- warning tones in the headset: laser warning (fast beeps), radar or launch warning (slow two-tone)
    B.lwr = osc('square', 1250, M.bus.ui.direct); B.lwrLfo = osc('square', 7, B.lwr.g.gain, 0);
    B.rwr = osc('sine', 820, M.bus.ui.direct); B.rwrLfo = osc('square', 2.5, B.rwr.o.frequency, 0); B.rwrLfo.g.gain.value = 110;
    B.icomFloor = M.bed('ui', { direct: true, color: 'pink', type: 'bandpass', f: 1800, q: 0.4 });
    // --- inside, after the armour has been holed: the fire and penetration alarm (two notes, over and over), and a fire burning
    B.alarm = osc('square', 960, M.bus.ui.direct); B.alarmLfo = osc('square', 1.6, B.alarm.o.frequency, 0); B.alarmLfo.g.gain.value = 160;
    B.fire = M.bed('vehicle', { direct: true, color: 'brown', f: 900 }); B.fireHi = M.bed('vehicle', { direct: true, color: 'white', type: 'bandpass', f: 3200, q: 0.7 });
    // --- the tension layer (not music; OFF unless switched on in the sound menu): a low drone of two notes beating against
    // each other and a slow pulse, both rising with the number of threats in the air. It goes under speech like everything else.
    B.tenOut = c.createGain(); B.tenOut.gain.value = 0; B.tenOut.connect(M.duckDirect);
    B.tenA = osc('sine', 55, B.tenOut, 0.5); B.tenB = osc('sine', 55.7, B.tenOut, 0.5); B.tenC = osc('triangle', 82.6, B.tenOut, 0.12);
    B.tenPulse = osc('sine', 41, B.tenOut, 0); B.tenLfo = osc('sine', 0.9, B.tenPulse.g.gain, 0);
    this.warnL = false; this.warnR = false; this.pulseT = null; this.tension = 0;
  }
  _swapBeds() {
    const M = this.mix, B = this.bed; if (!B) return;
    M.bedSample('turbine_in_loop', B.rush); M.bedSample('turbine_out_loop', B.rushOut); M.bedSample('tracks_loop', B.tracks);
    M.bedSample('wind_loop', B.wind); M.bedSample('rain_loop', B.rain); M.bedSample('rain_roof_loop', B.rainRoof);
  }
  _warn(laser, radar) { this.warnL = !!laser; this.warnR = !!radar; }
  // a short signal in the headset. kind: 'rf' (the detector has picked up a drone's control link), 'order' (an order was given)
  blip(kind = 'rf') {
    if (!this._live() || (this.seat === 'out' && kind !== 'order')) return; const M = this.mix, v = M.voice('ui', { direct: true });
    if (kind === 'order') { M.tone(v.in, v.t, { f0: 880, dur: 0.045, gain: 0.05, attack: 0.002, type: 'triangle' }); M.tone(v.in, v.t + 0.07, { f0: 1320, dur: 0.06, gain: 0.05, attack: 0.002, type: 'triangle' }); return; }
    for (let i = 0; i < 3; i++) M.tone(v.in, v.t + i * 0.09, { f0: kind === 'rf' ? 1650 : 1100, dur: 0.05, gain: 0.07, attack: 0.002, type: 'triangle' });
  }
  // a track breaks and runs off the sprocket: a bang of the pin shearing, then the links slapping round slower and slower
  trackBreak(d = 0) {
    if (!this._live()) return; const M = this.mix, inside = this.seat === 'in', v = inside ? M.voice('vehicle', { direct: true, cabin: 0.5 }) : M.voice('vehicle', { far: M.far(d, 1), space: 0.3 });
    M.noise(v.in, v.t, { dur: 0.03, attack: 0.0005, type: 'bandpass', f0: 1600, q: 1, gain: 1.2 }); M.ring(v.in, v.t, { freqs: [540, 910, 1480, 2300], dur: 0.5, gain: 0.3 });
    let t = v.t + 0.08; for (let i = 0; i < 12; i++) { M.noise(v.in, t, { dur: 0.03, type: 'bandpass', f0: rnd(900, 1900), q: 2, gain: 0.6 * (1 - i / 14) }); M.tone(v.in, t, { f0: 150, f1: 70, dur: 0.05, gain: 0.4 * (1 - i / 14) }); t += 0.06 + i * 0.022; }
  }

  // ------------------------------------------------------------------ every frame
  // st: { view (camera mode) or inside, cond, biome, speed (m/s), heading, turret (degrees), alive, camDist (m to own vehicle),
  //       rate (simulation speed), drones: [{ id, d, fiber }], threat (missiles and drones in the air, for the tension layer),
  //       battle, talking, mission, interior (the Interior object, read only) }
  // Slow motion (rate under 1): sounds are not slowed or lowered in pitch; each still plays at its own moment (the delay of
  // sound over distance is stretched to stay in step with the picture), and the crew talks at normal speed. Above 2x the crew
  // is silent and most detail is skipped.
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
    M.rate = clamp(st.rate || 1, 0.1, 4); M.setEnv(st.biome || 'farmland', st.cond);
    M.setSeat(seat); this.icom.listen(seat !== 'out'); this.icom.leak(st.camDist || 0, seat === 'out' && st.view !== 'title' && (st.camDist || 0) < 45 && st.alive !== false);
    // --- what the interior reports (src/render/interior.js, read only): the intercom volume knob, the warning-tone switch,
    // and what a hit did inside. Heard only from a seat inside.
    const I = st.interior && st.interior.inside ? st.interior : null, FX = I && I.fxS;
    this.icom.level(I && I.intercomVol != null ? I.intercomVol / 0.75 : 1);
    const toneOn = !(I && I.toneOn === false);
    { const hp = I && I.hitPulse;
      if (hp && hp.t !== this.pulseT) {
        const fresh = I.simT != null && Math.abs(I.simT - hp.t) < 1.2 && st.talking;   /* a hit that has only just happened, not one found on entering the seat later */ this.pulseT = hp.t;
        if (fresh && !this.lite) { if (hp.penetrated) this.penetration(hp.strength); else if (hp.strength < 0.26) this.nearMiss(hp.strength); }   /* the hull strike itself is hit(); Trophy's own crack is aps() */
      } else if (!hp) this.pulseT = null; }
    const alarm = I && I.alarm && st.talking ? 0.02 : 0, burning = FX && FX.fire && st.talking ? 1 : 0;
    p_set(B.alarm.g.gain, alarm, t); p_set(B.fire.g.gain, burning * 0.25 * (0.8 + 0.2 * Math.sin(t * 7.3) * Math.sin(t * 2.9)), t); p_set(B.fireHi.g.gain, burning * 0.03, t);
    if (burning && !this.lite && t >= (this.next.crackle || 0)) { this.next.crackle = t + rnd(0.03, 0.25); const w = M.voice('vehicle', { direct: true, cabin: 0.2 }); M.noise(w.in, w.t, { dur: rnd(0.004, 0.02), type: 'highpass', f0: rnd(1500, 5000), gain: rnd(0.03, 0.14) }); }
    const inH = seat === 'in', hatch = seat === 'hatch', heard = seat !== 'out';
    // --- crew talk
    if (st.battle && st.talking && !this.lite) this.talk.update(st.battle, t, { mission: st.mission });
    this.icom.update();
    const lw = this.warnL && heard && toneOn && st.talking ? 0.035 : 0;   /* the beeper's gain swings between 0 and twice this, 7 times a second */
    set(B.lwr.g.gain, lw, 0.01); set(B.lwrLfo.g.gain, lw, 0.01);
    set(B.rwr.g.gain, this.warnR && !this.warnL && heard && toneOn && st.talking ? 0.055 : 0, 0.03);
    set(B.icomFloor.g.gain, heard ? 0.006 : 0);
    // --- weather. Trees and houses break the wind near the ground; open desert and farmland do not.
    const cond = st.cond || 'day', rainy = cond === 'rain', windy = (cond === 'snow' || cond === 'fog' ? 0.5 : rainy ? 0.9 : cond === 'night' ? 0.35 : 0.6) * (st.biome === 'forest' ? 0.8 : st.biome === 'town' ? 0.7 : 1);
    const gust = 0.75 + 0.25 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1);
    set(B.wind.g.gain, 0.14 * windy * gust, 0.4); set(B.wind.fl.frequency, 380 + 240 * gust, 0.4); set(B.windHi.g.gain, (st.biome === 'forest' ? 0.06 : 0.03) * windy * gust * gust, 0.4);   /* forest: the leaves */
    set(B.rain.g.gain, rainy ? 0.09 : 0); set(B.rainRoof.g.gain, rainy && inH ? 0.05 : rainy && hatch ? 0.02 : 0);
    if (rainy && heard && !this.lite && t >= (this.next.drop || 0)) {   /* single heavy drops on the armour or the helmet */
      this.next.drop = t + rnd(0.02, 0.12); const v = M.voice('world', { direct: true });
      M.noise(v.in, v.t, { dur: 0.012, type: 'bandpass', f0: rnd(1800, 4200), q: 4, gain: rnd(0.01, 0.035) });
    }
    // --- the vehicle
    const sp = clamp(Math.abs(st.speed || 0) / 11, 0, 1), run = st.alive === false ? 0 : 1, P = this.prev || { speed: st.speed || 0, heading: st.heading, turret: st.turret };
    const acc = dt > 0 ? ((st.speed || 0) - P.speed) / dt : 0;
    // The turbine spools up and down, it does not jump: about a second to answer the throttle, twice that to wind down
    // (ASSUMED from descriptions of the AGT1500; nobody has measured one here).
    const want = run * clamp(0.25 + 0.6 * sp + clamp(acc * 0.25, 0, 0.3), 0, 1); this.thr += (want - this.thr) * clamp(dt * (want > this.thr ? 1.5 : 0.7), 0, 1);
    const thr = this.thr, near = Math.min(1, 28 / (28 + (st.camDist || 20)));
    set(B.windHatch.g.gain, hatch ? 0.012 * windy + 0.07 * sp : 0, 0.3); set(B.windHatch.fl.frequency, 500 + 500 * sp, 0.3);
    set(B.rush.g.gain, run * (inH ? 0.13 + 0.12 * thr : hatch ? 0.05 + 0.05 * thr : 0)); set(B.rush.fl.frequency, 420 + 520 * thr);
    set(B.rushOut.g.gain, run * (inH ? 0 : (0.16 + 0.3 * thr) * near)); set(B.rushOut.fl.frequency, 700 + 900 * thr);
    set(B.roarOut.g.gain, run * (inH ? 0 : (0.1 + 0.3 * thr) * near));
    const wf = (1750 + 1500 * thr) * (1 + 0.004 * Math.sin(t * 5.3) + 0.003 * Math.sin(t * 13.1));   /* never a dead-steady tone */
    set(B.whine.o.frequency, wf, 0.05); set(B.whine2.o.frequency, wf * 1.507, 0.05); set(B.whine.g.gain, run * (inH ? 0.004 + 0.006 * thr : 0)); set(B.whine2.g.gain, run * (inH ? 0.0015 + 0.0025 * thr : 0));
    set(B.whineOut.o.frequency, wf); set(B.whineOut.g.gain, run * (inH ? 0 : (0.004 + 0.012 * thr) * near)); set(B.whineOut2.o.frequency, wf * 1.507); set(B.whineOut2.g.gain, run * (inH ? 0 : (0.0015 + 0.005 * thr) * near));
    set(B.howl.fl.frequency, wf, 0.05); set(B.howl.g.gain, run * (inH ? 0 : (0.05 + 0.12 * thr) * near));
    set(B.hum.o.frequency, 52 + 34 * thr); set(B.hum.g.gain, run * (inH ? 0.05 + 0.045 * thr : hatch ? 0.04 : 0));
    set(B.stab.g.gain, run * (inH ? 0.0035 : 0)); set(B.stab2.g.gain, run * (inH ? 0.0012 : 0));
    if (B.rush.swapped) B.rush.src.playbackRate.setTargetAtTime(0.8 + 0.5 * thr, t, 0.2);
    if (B.rushOut.swapped) B.rushOut.src.playbackRate.setTargetAtTime(0.8 + 0.5 * thr, t, 0.2);
    // tracks: link pitch 0.19 m, so the clatter rate is speed / 0.19 (capped: above that it blurs into a roar anyway)
    const v = Math.abs(st.speed || 0), moving = run * clamp(v / 2, 0, 1), trk = run * moving * (0.35 + 0.65 * sp);
    set(B.clat.frequency, clamp(v / 0.19, 2, 46)); set(B.tracks.g.gain, trk * (inH ? 0.3 : hatch ? 0.2 : 0)); set(B.clatG.gain, trk * (inH ? 0.2 : hatch ? 0.13 : 0));
    set(B.tracksOut.g.gain, trk * (inH ? 0 : 0.22 * near)); set(B.clatG2.gain, trk * (inH ? 0 : 0.14 * near));
    set(B.link.g.gain, trk * (inH ? 0 : 0.035 * near)); set(B.clatG3.gain, trk * (inH ? 0 : 0.035 * near));
    set(B.sprocket.o.frequency, clamp(v / 0.19 * 2, 20, 400), 0.1); set(B.sprocket.g.gain, trk * (inH ? 0.012 : hatch ? 0.006 : 0));   /* two teeth to a link */
    set(B.rattle.g.gain, trk * (inH ? 0.012 : hatch ? 0.006 : 0) * (0.6 + 0.4 * Math.sin(t * 11.3) * Math.sin(t * 4.1)), 0.05);
    let turn = 0, slew = 0;
    if (dt > 0 && st.heading != null && P.heading != null) turn = Math.abs(angDiff(st.heading, P.heading)) / dt;
    if (dt > 0 && st.turret != null && P.turret != null) slew = Math.abs(angDiff(st.turret - (st.heading || 0), P.turret - (P.heading || 0))) / dt;
    this.turnS = (this.turnS || 0) + (Math.min(turn, 60) - (this.turnS || 0)) * clamp(dt * 4, 0, 1); this.slewS = (this.slewS || 0) + (Math.min(slew, 60) - (this.slewS || 0)) * clamp(dt * 8, 0, 1);
    const sq = run * moving * clamp((this.turnS - 6) / 25, 0, 1);
    set(B.squeal.g.gain, sq * (inH ? 0 : 0.05 * near)); set(B.squeal.fl.frequency, 2100 + 600 * Math.sin(t * 3.1)); set(B.squealIn.g.gain, sq * (inH ? 0.012 : hatch ? 0.02 : 0)); set(B.squealIn.fl.frequency, 1500 + 400 * Math.sin(t * 3.1));
    const sl = run * clamp(this.slewS / 30, 0, 1);
    set(B.whir.o.frequency, 190 + 260 * sl, 0.05); set(B.whir.g.gain, inH ? 0.04 * sl : 0, 0.05); set(B.whirN.g.gain, inH ? 0.022 * sl : 0, 0.05);
    if (inH && run && !this.lite) {   /* the turret drive taking up and stopping: a small clunk of the gear train at each end of a traverse */
      const slewing = sl > 0.12; if (this.slewing != null && slewing !== this.slewing) { const w = M.voice('vehicle', { direct: true, cabin: 0.3 }); M.tone(w.in, w.t, { f0: slewing ? 170 : 130, f1: 80, dur: 0.05, gain: 0.12 }); M.noise(w.in, w.t, { dur: 0.015, type: 'bandpass', f0: 1300, q: 2, gain: 0.1 }); }
      this.slewing = slewing;
    }
    if (moving > 0.3 && heard && !this.lite && t >= (this.next.creak || 0)) {   /* the suspension and the hull working */
      this.next.creak = t + rnd(1.2, 4.5) / (0.4 + sp); const w = M.voice('vehicle', { direct: true, cabin: 0.3 }), f = rnd(140, 420);
      M.tone(w.in, w.t, { f0: f, f1: f * rnd(0.7, 1.25), dur: rnd(0.12, 0.35), gain: rnd(0.015, 0.05), attack: 0.03, type: 'triangle' });
      if (Math.random() < 0.4) M.noise(w.in, w.t + 0.05, { dur: 0.03, type: 'bandpass', f0: rnd(900, 2600), q: 5, gain: 0.03 });
    }
    this.prev = { speed: st.speed || 0, heading: st.heading, turret: st.turret };
    // --- the living world, when nobody is shooting: birds by day, insects at dusk and night; a battle far away
    if (!this.lite) this._world(t, cond, st.biome || 'farmland', rainy);
    // --- drones: a motor whine per aircraft. It is higher while it closes (Doppler, from its true closing speed) and rises
    // further in the last few hundred metres (ASSUMPTION: full throttle in the terminal dive). A radio-controlled FPV is a
    // small, fast, high buzz. A fibre-optic drone carries its spool and a bigger battery on larger propellers: a lower,
    // heavier drone with a slow flutter (ASSUMED from footage descriptions).
    const seen = new Set();
    for (const dr of st.drones || []) {
      seen.add(dr.id); let q = this.drones.get(dr.id);
      if (!q) {
        const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator(), fl = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain(), fib = !!dr.fiber;
        o1.type = 'sawtooth'; o2.type = fib ? 'sawtooth' : 'square'; o3.type = fib ? 'triangle' : 'sawtooth'; fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = fib ? 0.6 : 0.8; lp.type = 'lowpass'; g.gain.value = 0;
        o1.connect(fl); o2.connect(fl); o3.connect(fl); fl.connect(lp); lp.connect(g); g.connect(M.bus.weapons.air); o1.start(); o2.start(); o3.start();
        q = { o1, o2, o3, fl, lp, g, fib, base: fib ? rnd(96, 118) : rnd(168, 204), d: dr.d, vc: 0 }; this.drones.set(dr.id, q);
      }
      if (dt > 0) q.vc += (clamp((q.d - dr.d) / dt, -80, 80) - q.vc) * clamp(dt * 3, 0, 1); q.d = dr.d;
      const a = M.far(dr.d, 0.5), dop = C_SOUND / (C_SOUND - q.vc), wob = q.fib ? 1 + 0.035 * Math.sin(t * 2 * Math.PI * 6.5) : 1 + 0.02 * Math.sin(t * 9 + q.base);
      const f = q.base * dop * (1 + 0.3 * clamp(1 - dr.d / 300, 0, 1)) * wob;
      set(q.o1.frequency, f, 0.05); set(q.o2.frequency, f * (q.fib ? 1.5 : 2.01), 0.05); set(q.o3.frequency, f * (q.fib ? 0.5 : 1.013), 0.05);   /* unsynchronised motors beat against each other */
      set(q.fl.frequency, clamp(f * (q.fib ? 3.2 : 5), 300, 2400), 0.05); set(q.lp.frequency, a.cut, 0.1); set(q.g.gain, Math.min(0.2, a.gain * 0.22), 0.08);
    }
    for (const [id, q] of this.drones) if (!seen.has(id)) { q.g.gain.setTargetAtTime(0, t, 0.03); q.o1.stop(t + 0.2); q.o2.stop(t + 0.2); q.o3.stop(t + 0.2); this.drones.delete(id); }
    // --- the tension layer: follows the number of threats in the air (missiles, drones) and the warning receivers
    const threat = this.levels.tension && st.talking && st.alive !== false ? clamp(((st.threat != null ? st.threat : (st.drones || []).length) + (this.warnL || this.warnR ? 1 : 0)) / 4, 0, 1) : 0;
    this.tension += (threat - this.tension) * clamp(dt * (threat > this.tension ? 0.8 : 0.25), 0, 1);
    const tn = this.tension; set(B.tenOut.gain, this.levels.tension ? 0.02 + 0.1 * tn : 0, 0.3); set(B.tenLfo.o.frequency, 0.8 + 0.9 * tn, 0.5); set(B.tenLfo.g.gain, 0.9 * tn, 0.3); set(B.tenC.g.gain, 0.05 + 0.25 * tn, 0.5);
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
