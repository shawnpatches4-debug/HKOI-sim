// One-shot sounds: guns, blasts, launches, strikes, the loading drill. No recorded effects pack has been supplied yet (only
// voices), so every sound here is built in code from the mixer's building blocks, in LAYERS the way a recording is cut:
// transient, body, low end, mechanism, the answer of the surroundings, tail. Every sound first asks the mixer for a recording
// of its SLOT (assets/sfx_index.json) and only synthesises when there is none.
// These functions are mixed into the Sound class (`this` is the Sound object; `d` is metres from the listener).
//
// Listening positions: 'in' (buttoned up: own weapons are felt through the structure, loud mechanics, everything outside
// is a dull thud), 'hatch' (head out in a helmet) and 'out' (open air: delay, loss of highs and level by range).
// ASSUMPTIONS: nobody here has heard these weapons or this build; everything was rendered to files and measured
// (tests/audio/moments.mjs, measure.py). Timings are from open sources: 30 mm M230LF chain gun 200 rounds a minute (one every
// 0.3 s; the page fires them, this file only makes one round); .50 M2 about 8 rounds a second; 7.62 mm M240 about 11 to 14;
// 2A42 on the BMP-2 about 5 a second on its slow setting; Trophy's launcher and its charge go off a few hundredths of a second
// apart; a 120 mm APFSDS round leaves at about 1600 m/s, a 125 mm at about 1700 m/s, so its crack arrives well before its report.

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// names of all slots a recording can replace (one-shots here; the looped beds are listed in sound.js)
export const SLOTS = [
  'gun30_out', 'gun30_in', 'gun120_out', 'gun120_in', 'mg50_out', 'mg50_in', 'mg762_out', 'mg762_in',
  'aps_out', 'aps_in', 'launch_small', 'launch_big', 'flyby', 'crack', 'explosion_small', 'explosion_medium', 'explosion_large',
  'airburst', 'hit_in', 'pen_in', 'nearmiss_in', 'smoke_discharge', 'extinguisher_in', 'load_ram', 'breech_close', 'hatch', 'ricochet', 'blowout',
];
// How hard each kind of weapon strikes the armour, as heard inside (1 = a guided missile's shaped charge). ASSUMED.
const STRIKE = { heat: 1, kornet: 1, saclos: 1, sal: 1, rpg: 0.85, ke: 1.25, t72: 1.25, t90: 1.25, fpv: 0.6, fpv_fiber: 0.6, auto: 0.4, bmp2: 0.4, mg: 0.1 };

export const Effects = {
  _live() { return !!(this.ctx && this.on && this.mix); },
  _shot() { this.lastShot = this.ctx.currentTime; },
  // The common shape of a gun or a blast heard through the air, in layers: the crack (the sharp leading edge, lost with
  // distance), the bark (the mid-range), the body (low mids: the weight), the thump (the push on the chest), the sub (felt
  // more than heard), the slaps (the surroundings answering: mixer ENV) and the tail (what rolls on afterwards; at long range
  // it is most of what is left). `a` is the mixer's distance result for this sound.
  _report(v, a, { at = 0, crack = 1, crackHz = 1200, crackDur = 0.04, bark = 1, barkHz = 900, barkDur = 0.08, body = 0, bodyHz = 420, bodyDur = 0.12, thump = 0.6, thumpHz = 150, thumpDur = 0.11, sub = 0, subHz = 58, subDur = 0.25, tail = 0.12, tailDur = 0.4, tailHz = 600, slap = 0 } = {}) {
    const M = this.mix, t = v.t + at, near = a.near == null ? 1 - a.roll : a.near;
    if (crack && near > 0.02) M.noise(v.in, t, { dur: crackDur, attack: 0.0005, type: 'highpass', f0: crackHz, gain: crack * near });
    if (bark) M.noise(v.in, t, { dur: barkDur, attack: 0.001, type: 'bandpass', f0: barkHz, f1: barkHz * 0.4, q: 0.6, gain: bark });
    if (body) M.noise(v.in, t, { dur: bodyDur, attack: 0.0015, color: 'pink', f0: bodyHz, f1: bodyHz / 3, gain: body });
    if (thump) M.tone(v.in, t, { f0: thumpHz, f1: thumpHz / 3, dur: thumpDur, gain: thump });
    if (sub) M.tone(v.in, t, { f0: subHz, f1: subHz / 2, dur: subDur, gain: sub, attack: 0.006 });
    if (tail) M.noise(v.in, t + 0.015, { dur: tailDur * (1 + 2.5 * a.roll), color: 'brown', f0: tailHz, f1: 70, gain: tail * (1 + 3 * a.roll) });
    if (slap && !this.lite && a.d < 700) for (const [ts, amp] of (slap < 1 ? M.env.slaps.slice(0, 2) : M.env.slaps)) {   /* walls, tree lines, the ground: each answers a little later and duller (small arms: the first two answers only, to keep a long burst cheap) */
      const tt = t + ts * rnd(0.85, 1.15);
      M.noise(v.in, tt, { dur: barkDur * 1.6 + 0.03, attack: 0.003, type: 'bandpass', f0: barkHz * 0.8, f1: barkHz * 0.3, q: 0.5, gain: bark * amp * slap });
      if (thump && slap >= 1) M.tone(v.in, tt, { f0: thumpHz * 0.9, f1: thumpHz / 3, dur: thumpDur, gain: thump * amp * slap * 0.6 });
    }
  },

  // ---------------------------------------------------------------- the 30 mm: the star of the mix
  // One round of the chain gun (the page fires one every 0.3 s). The gun is externally driven: a motor turns a chain that
  // runs the bolt, so between rounds there is the whirr of the drive and four mechanical events: unlock and extract, the
  // case thrown out, the next round fed across and run forward into the chamber.
  // Outside: a hard, tight report with weight under it, the answer of the surroundings, the mechanism if near.
  // Inside: the weapon station is bolted to the turret roof, so each round is a blow on the roof (thud and knock through the
  // structure), the mount ringing, and the mechanism loud and close.
  _mech30(v, loud) {
    const M = this.mix, t = v.t;
    M.tone(v.in, t + 0.02, { f0: 205, f1: 232, dur: 0.26, gain: 0.035 * loud, attack: 0.03, type: 'sawtooth' });                       /* drive motor under load */
    M.noise(v.in, t + 0.055, { dur: 0.02, type: 'bandpass', f0: 2400, q: 4, gain: 0.55 * loud });                                     /* unlock, extract */
    M.noise(v.in, t + 0.16 + rnd(0, 0.01), { dur: 0.045, type: 'bandpass', f0: 1650, q: 3, gain: 0.6 * loud });                       /* feed sprocket turns the next round in */
    M.noise(v.in, t + 0.235, { dur: 0.02, attack: 0.002, type: 'bandpass', f0: 1400, q: 3, gain: 0.3 * loud });                        /* the round run forward into the chamber (the bolt locks as it fires: that click is inside the next report) */
    const tc = t + rnd(0.12, 0.2);                                                                                                   /* the case and link drop clear */
    M.ring(v.in, tc, { freqs: [3350, 5120], dur: 0.07, gain: 0.05 * loud }); M.noise(v.in, tc, { dur: 0.012, type: 'bandpass', f0: 4700, q: 5, gain: 0.25 * loud });
  },
  gun30(d) {
    if (!this._live()) return; const M = this.mix, k = rnd(0.95, 1.05); this._shot();
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.55 }); if (M.sample('gun30_in', v)) return;
      M.tone(v.in, v.t, { f0: 92 * k, f1: 36, dur: 0.17, gain: 0.55 });                                        /* the blow on the roof, through the turret ring */
      M.noise(v.in, v.t, { dur: 0.08, attack: 0.001, f0: 1100, f1: 230, gain: 1.5 });                          /* the report, through steel */
      M.noise(v.in, v.t, { dur: 0.03, attack: 0.0005, type: 'bandpass', f0: 720 * k, q: 1.2, gain: 2.8 });     /* the knock */
      M.noise(v.in, v.t, { dur: 0.1, attack: 0.001, color: 'pink', type: 'bandpass', f0: 300 * k, f1: 170, q: 0.8, gain: 4.6 });   /* the weight of it in the range small loudspeakers can still play */
      M.tone(v.in, v.t, { f0: 184 * k, f1: 80, dur: 0.09, gain: 0.7 });
      M.noise(v.in, v.t, { dur: 0.012, attack: 0.0004, type: 'bandpass', f0: 2300, q: 1.5, gain: 0.6 });       /* its hard edge */
      if (this.lite) return;
      M.ring(v.in, v.t + 0.004, { freqs: [318, 527, 1240, 2090, 3170], dur: 0.24, gain: 0.24 });               /* the mount and the roof plate ring */
      this._mech30(v, 1.4);
      return;
    }
    const a = M.far(d, 1.5), v = M.voice('weapons', { far: a, space: 0.4 }); if (M.sample('gun30_out', v)) return;   /* 1.5: the star of the mix, a little above its true place beside the machine guns */
    this._report(v, a, { crack: 1.4, crackHz: 1500, crackDur: 0.035, bark: 2.3, barkHz: 950 * k, barkDur: 0.09, body: 2.2, bodyHz: 520, bodyDur: 0.12, thump: 0.55, thumpHz: 150 * k, thumpDur: 0.12, sub: 0.25, subHz: 62, subDur: 0.22, tail: 0.12, tailDur: 0.5, slap: 1 });
    if (this.seat === 'hatch' && a.d < 12) { const w = M.voice('weapons', { direct: true, cabin: 0.3 }); M.tone(w.in, w.t, { f0: 92 * k, f1: 36, dur: 0.15, gain: 0.45 }); }   /* felt through the hatch ring */
    if (this.lite || a.d > 140) return;
    M.ring(v.in, v.t + 0.004, { freqs: [1180, 1990, 3050], dur: 0.16, gain: 0.07 });                           /* barrel and mount ring */
    this._mech30(v, 0.5);
  },

  // ---------------------------------------------------------------- the 120 mm
  // Outside: a crack, a blast and a pressure wave you feel more than hear, the dust it throws up, a long roll off the country.
  // Inside: a dull slam and the whole turret ringing, the breech running back, opening and throwing the stub case onto the
  // floor, the fume extractor's hiss; then the loader's drill begins (the ammunition door, the round out of the rack). The ram
  // and the breech closing are played by load() when the loader reports "Up!", so they always belong to his call.
  gun120(d) {
    if (!this._live()) return; const M = this.mix; this._shot();
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.6 }); if (M.sample('gun120_in', v)) return;
      M.tone(v.in, v.t, { f0: 62, f1: 20, dur: 0.7, gain: 1.3 });
      M.tone(v.in, v.t, { f0: 34, f1: 17, dur: 0.9, gain: 0.7, attack: 0.01 });                                                                                             /* the hull rocking back on its suspension */
      M.noise(v.in, v.t, { dur: 0.3, attack: 0.001, f0: 800, f1: 110, gain: 1.6 });
      M.noise(v.in, v.t, { dur: 0.02, attack: 0.0004, type: 'bandpass', f0: 1500, q: 1, gain: 0.9 });
      if (this.lite) return;
      M.ring(v.in, v.t + 0.006, { freqs: [118, 196, 283, 412, 590], dur: 1.5, gain: 0.2, spread: 0.02 });                                                                  /* the turret ring and shell ring like a bell, low */
      M.ring(v.in, v.t + 0.16, { freqs: [520, 870, 1460, 2210], dur: 0.4, gain: 0.22 }); M.noise(v.in, v.t + 0.16, { dur: 0.05, type: 'bandpass', f0: 1200, q: 2, gain: 0.4 });   /* breech at full recoil */
      M.tone(v.in, v.t + 0.42, { f0: 170, f1: 80, dur: 0.1, gain: 0.5 }); M.noise(v.in, v.t + 0.42, { dur: 0.035, type: 'bandpass', f0: 1700, q: 2, gain: 0.5 });            /* back in battery, breech block drops open */
      M.noise(v.in, v.t + 0.3, { dur: 1.1, attack: 0.25, type: 'highpass', f0: 2600, gain: 0.05 });                                                                        /* fume extractor */
      M.ring(v.in, v.t + 0.78, { freqs: [690, 1130, 1840, 2900, 4100], dur: 0.38, gain: 0.2 }); M.noise(v.in, v.t + 0.78, { dur: 0.04, type: 'bandpass', f0: 2100, q: 3, gain: 0.3 });  /* stub case on the floor */
      M.ring(v.in, v.t + 0.97, { freqs: [720, 1180, 1900], dur: 0.2, gain: 0.08 });                                                                                         /* and its bounce */
      this._rattle(v.t + 0.05, 1.4);
      this._loadStart(v.t);
      return;
    }
    const a = M.far(d, 2.2), v = M.voice('weapons', { far: a, space: 0.8 }); if (M.sample('gun120_out', v)) return;
    this._report(v, a, { crack: 1.6, crackHz: 600, crackDur: 0.08, bark: 2.8, barkHz: 620, barkDur: 0.32, body: 2.4, bodyHz: 340, bodyDur: 0.4, thump: 0.75, thumpHz: 82, thumpDur: 0.7, sub: 0.5, subHz: 42, subDur: 0.8, tail: 0.5, tailDur: 2.6, tailHz: 450, slap: 1 });
    if (!this.lite && a.d < 200) M.noise(v.in, v.t + 0.08, { dur: 0.9, attack: 0.12, color: 'pink', f0: 1500, f1: 300, gain: 0.14 });   /* dust and blast wash */
    if (this.seat === 'hatch' && a.d < 12) { const w = M.voice('weapons', { direct: true, cabin: 0.5 }); M.tone(w.in, w.t, { f0: 60, f1: 20, dur: 0.7, gain: 0.8 }); this._rattle(w.t + 0.05, 1); }
  },
  // The human loading drill (the M1 has no autoloader), as far as it can be scheduled from the shot alone: about a second after
  // firing the loader hits the knee switch and the armoured ammunition door slides open (air hiss, slam), he pulls a round from
  // the rack (the base rim scrapes, a grunt of effort is left to the voice pack). ASSUMED times for a trained loader.
  _loadStart(t) {
    if (this.lite || this.seat !== 'in') return; const M = this.mix, v = M.voice('vehicle', { direct: true, cabin: 0.35 }), t0 = Math.max(t, v.t);
    M.noise(v.in, t0 + 1.05, { dur: 0.3, attack: 0.02, type: 'highpass', f0: 3400, gain: 0.16 });                                              /* door: air */
    M.tone(v.in, t0 + 1.3, { f0: 150, f1: 70, dur: 0.09, gain: 0.45 }); M.noise(v.in, t0 + 1.3, { dur: 0.03, type: 'bandpass', f0: 950, q: 1.5, gain: 0.6 });   /* door: open against its stop */
    M.noise(v.in, t0 + 1.75, { dur: 0.4, attack: 0.08, color: 'pink', type: 'bandpass', f0: 1300, f1: 2200, q: 1.5, gain: 0.34 });              /* the round sliding out of its tube */
    M.ring(v.in, t0 + 2.12, { freqs: [1450, 2380, 3900], dur: 0.12, gain: 0.14 }); M.noise(v.in, t0 + 2.12, { dur: 0.02, type: 'bandpass', f0: 1900, q: 3, gain: 0.3 });                                                             /* its rim clears the rack */
  },
  // The end of the drill, called when the loader is about to report (crewtalk.js): he rams the round home with his fist, the
  // breech block rises and slams shut by itself, the ammunition door closes, he flips the safety to FIRE. Heard inside only.
  // Returns how many seconds later the word "Up!" belongs.
  load() {
    if (!this._live() || this.lite || this.seat !== 'in') return 0; const M = this.mix, v = M.voice('vehicle', { direct: true, cabin: 0.45 });
    if (!M.sample('load_ram', v)) {
      M.noise(v.in, v.t, { dur: 0.2, attack: 0.03, color: 'pink', type: 'bandpass', f0: 700, f1: 1700, q: 1.2, gain: 0.3 });                   /* the round runs up the breech ring */
      M.tone(v.in, v.t + 0.17, { f0: 125, f1: 60, dur: 0.1, gain: 0.5 });                                                                     /* seated */
    }
    const w = M.voice('vehicle', { direct: true, cabin: 0.5, delay: 0.3 });
    if (!M.sample('breech_close', w)) {
      M.tone(w.in, w.t, { f0: 185, f1: 68, dur: 0.11, gain: 0.9 }); M.noise(w.in, w.t, { dur: 0.03, attack: 0.0005, type: 'bandpass', f0: 1500, q: 2, gain: 1.2 });   /* the block slams up */
      M.ring(w.in, w.t + 0.003, { freqs: [430, 720, 1180, 1900, 2750], dur: 0.4, gain: 0.2 });
      M.noise(w.in, w.t + 0.22, { dur: 0.012, type: 'bandpass', f0: 3600, q: 5, gain: 0.35 });                                                 /* safety to FIRE */
      M.noise(w.in, w.t + 0.3, { dur: 0.2, attack: 0.02, type: 'highpass', f0: 3400, gain: 0.05 }); M.tone(w.in, w.t + 0.5, { f0: 140, f1: 70, dur: 0.08, gain: 0.3 });   /* the ammunition door closes */
    }
    return 0.55;
  },

  // ---------------------------------------------------------------- machine guns: heavy = the .50, otherwise the 7.62 mm
  // The .50 is slow and heavy: a deep knock with weight behind it. The 7.62 is fast and light: a dry, higher snap.
  // No two rounds are exactly alike (a few percent in pitch and level), or a burst sounds like a machine.
  mg(d, heavy) {
    if (!this._live()) return; const M = this.mix, k = rnd(0.94, 1.06), g = rnd(0.88, 1.08); this._shot();
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.35, gain: g }); if (M.sample(heavy ? 'mg50_in' : 'mg762_in', v)) return;
      if (heavy) {   /* on the roof: thuds through the armour, the receiver's clack */
        M.tone(v.in, v.t, { f0: 125 * k, f1: 55, dur: 0.075, gain: 0.6 }); M.noise(v.in, v.t, { dur: 0.035, f0: 800, f1: 250, gain: 0.8 });
        if (!this.lite) M.noise(v.in, v.t + 0.05, { dur: 0.014, type: 'bandpass', f0: 2100, q: 3, gain: 0.25 });
      } else {       /* the coax is beside the gunner: mechanism and links, close */
        M.tone(v.in, v.t, { f0: 210 * k, f1: 95, dur: 0.035, gain: 0.35 }); M.noise(v.in, v.t, { dur: 0.016, type: 'bandpass', f0: 2600, q: 2.5, gain: 0.8 });
        M.noise(v.in, v.t, { dur: 0.03, f0: 700, f1: 300, gain: 0.4 });
        if (!this.lite) M.noise(v.in, v.t + 0.03, { dur: 0.012, type: 'bandpass', f0: 4700, q: 5, gain: 0.3 });
      }
      return;
    }
    const a = M.far(d, heavy ? 0.75 : 0.45), v = M.voice('weapons', { far: a, space: 0.3, gain: g }); if (M.sample(heavy ? 'mg50_out' : 'mg762_out', v)) return;
    if (heavy) this._report(v, a, { crack: 1.0, crackHz: 1400, crackDur: 0.03, bark: 1.2, barkHz: 850 * k, barkDur: 0.06, body: 0.8, bodyHz: 480, bodyDur: 0.08, thump: 0.7, thumpHz: 165 * k, thumpDur: 0.08, sub: 0.2, subHz: 75, subDur: 0.1, tail: 0.08, tailDur: 0.3, slap: 0.7 });
    else this._report(v, a, { crack: 1.1, crackHz: 2600, crackDur: 0.016, bark: 0.9, barkHz: 1700 * k, barkDur: 0.035, body: 0.4, bodyHz: 700, bodyDur: 0.04, thump: 0.3, thumpHz: 270 * k, thumpDur: 0.035, tail: 0.04, tailDur: 0.16, tailHz: 900, slap: 0.6 });
    if (!this.lite && a.d < 60 && Math.random() < 0.5) M.ring(v.in, v.t + rnd(0.08, 0.2), { freqs: heavy ? [2900, 4600] : [4200, 6300], dur: 0.05, gain: 0.03 });   /* brass on the roof */
  },

  // ---------------------------------------------------------------- Trophy: a hard double bang right at the hull
  // First the launcher throws its charge (a flat, very sharp bang beside the turret), then the charge itself goes off a few
  // metres out (bigger, with weight), and the fragments it threw patter down. Inside: two slams on the turret wall.
  aps(d) {
    if (!this._live()) return; const M = this.mix; this._shot(); const gap = rnd(0.045, 0.065);
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.65 }); if (M.sample('aps_in', v)) return;
      for (const [dt, k] of [[0, 0.85], [gap, 1.15]]) {
        M.tone(v.in, v.t + dt, { f0: 185, f1: 55, dur: 0.11, gain: 1.1 * k }); M.noise(v.in, v.t + dt, { dur: 0.035, attack: 0.0005, color: 'pink', f0: 1200, f1: 300, gain: 1.0 * k });
        M.noise(v.in, v.t + dt, { dur: 0.01, attack: 0.0003, type: 'bandpass', f0: 2600, q: 1, gain: 0.7 * k });
      }
      M.tone(v.in, v.t + gap, { f0: 58, f1: 26, dur: 0.3, gain: 0.7 });
      M.ring(v.in, v.t + gap, { freqs: [760, 1210, 1930, 2840], dur: 0.3, gain: 0.14 }); this._rattle(v.t + gap + 0.02, 1);
      return;
    }
    const a = M.far(d, 1.8), v = M.voice('weapons', { far: a, space: 0.5 }); if (M.sample('aps_out', v)) return;
    this._report(v, a, { crack: 1.5, crackHz: 2600, crackDur: 0.016, bark: 1.1, barkHz: 1800, barkDur: 0.03, body: 0.6, bodyHz: 600, bodyDur: 0.04, thump: 0.6, thumpHz: 230, thumpDur: 0.045, tail: 0 });
    this._report(v, a, { at: gap, crack: 1.6, crackHz: 1700, crackDur: 0.026, bark: 1.9, barkHz: 1000, barkDur: 0.1, body: 1.4, bodyHz: 420, bodyDur: 0.14, thump: 1.0, thumpHz: 160, thumpDur: 0.15, sub: 0.6, subHz: 55, subDur: 0.25, tail: 0.18, tailDur: 0.5, slap: 1 });
    if (!this.lite && a.d < 120) for (let i = 0; i < 9; i++) M.noise(v.in, v.t + gap + rnd(0.12, 0.7), { dur: rnd(0.008, 0.03), type: 'bandpass', f0: rnd(2500, 7000), q: 4, gain: rnd(0.02, 0.07) });   /* fragments landing */
  },

  // ---------------------------------------------------------------- blasts
  // size: about 0.5 (a small charge) to 2.2 (a killing hit). Near: crack, slam, then earth and fragments pattering down.
  // Far: no crack at all, only a low thump that rolls on. opt.ground: a burst on the ground (more earth thrown, a duller slam).
  explosion(d, size = 1, opt = {}) {
    if (!this._live()) return; const M = this.mix; this._shot();
    const a = M.far(d, 0.9 + 0.5 * size, opt.occl), dl = (opt.delay || 0) / M.rate, v = M.voice('explosions', { far: a, space: 0.6, delay: dl }), gr = opt.ground ? 1 : 0;   /* opt.delay: seconds from now (simulation time) */
    if (!M.sample(size >= 1.8 ? 'explosion_large' : size >= 1.1 ? 'explosion_medium' : 'explosion_small', v)) {
      const s = Math.sqrt(size);
      this._report(v, a, { crack: gr ? 0.7 : 1.1, crackHz: 800, crackDur: 0.05, bark: 2.3, barkHz: (gr ? 500 : 620) / s, barkDur: 0.26 + 0.1 * size, body: 1.9 + 0.4 * size, bodyHz: 340 / s, bodyDur: 0.3 + 0.12 * size,
        thump: 0.6, thumpHz: 110 / s, thumpDur: 0.4 + 0.25 * size, sub: 0.16 * size, subHz: 48 / s, subDur: 0.5 + 0.3 * size, tail: 0.38, tailDur: 1.2 + size, tailHz: 400, slap: 1 });
      if (!this.lite && a.d < 220) {   /* earth and fragments coming down */
        const n = Math.round((5 + 7 * size) * (1 + gr));
        for (let i = 0; i < n; i++) M.noise(v.in, v.t + rnd(0.25, 1.1 + 0.6 * size), { dur: rnd(0.015, 0.05), type: 'bandpass', f0: rnd(gr ? 700 : 1400, gr ? 3200 : 5200), q: 3, gain: rnd(0.02, 0.09) });
        if (gr) M.noise(v.in, v.t + 0.06, { dur: 1.0 + 0.4 * size, attack: 0.15, color: 'pink', f0: 1100, f1: 250, gain: 0.16 });   /* the fountain of earth falling back */
      }
    }
    if (this.seat === 'in' && a.d < 45) {   /* close enough to shake the hull */
      const k = Math.min(1, size * 14 / (14 + a.d)), w = M.voice('explosions', { direct: true, cabin: 0.5, delay: a.delay / M.rate + dl });
      M.tone(w.in, w.t, { f0: 55, f1: 22, dur: 0.5, gain: 0.8 * k }); this._rattle(w.t + 0.03, k);
    }
  },
  airburst(d, size = 0.5) {
    if (!this._live()) return; const M = this.mix; this._shot();
    const a = M.far(d, 0.7 + 0.5 * size), v = M.voice('explosions', { far: a, space: 0.5 }); if (M.sample('airburst', v)) return;
    this._report(v, a, { crack: 1.1, crackHz: 1500, crackDur: 0.035, bark: 1.1, barkHz: 1100, barkDur: 0.1, body: 0.7, bodyHz: 500, bodyDur: 0.12, thump: 0.5, thumpHz: 130, thumpDur: 0.18, sub: 0.2, tail: 0.12, tailDur: 0.5, slap: 0.5 });
    if (!this.lite && a.d < 200) M.noise(v.in, v.t + 0.01, { dur: 0.22, attack: 0.02, type: 'highpass', f0: 3200, gain: 0.1 });   /* fragments and powder */
  },
  // A round strikes the listener's own vehicle: heard from inside as a slam and ringing armour; ears ring, the world goes dull.
  // opt.weapon (or opt.key): what struck: 'heat' (a guided missile's shaped charge, the default), 'rpg', 'ke' (a tank's
  // long-rod round: a harder, shorter, higher crack and the longest ring), 'fpv' (a small charge), 'auto' (one autocannon
  // round: a hard clang), 'mg' (a bullet: a tick on the plate). opt.result: 'stopped' (the default: clang and ring) or
  // 'through' (adds penetration(): crack, spall, venting; the alarm follows from the interior's own state).
  hit(killing, opt = {}) {
    if (!this._live()) return; const M = this.mix, w = opt.weapon || opt.key || 'heat', k = STRIKE[w] == null ? 1 : STRIKE[w], ke = w === 'ke' || w === 't72' || w === 't90';
    if (this.seat === 'out') {   /* from outside, close by: the plate rings under the blast (the blast itself is explosion()) */
      const a = M.far(this.camDist || 20, 0.8 * k), v = M.voice('explosions', { far: a, space: 0.4 });
      M.ring(v.in, v.t, { freqs: [410, 667, 1030, 1570, 2250], dur: 0.7, gain: 0.5 }); M.noise(v.in, v.t, { dur: 0.03, attack: 0.0005, type: 'bandpass', f0: 1800, q: 1, gain: 1.0 });
      return;
    }
    const v = M.voice('explosions', { direct: true, cabin: 0.7 });
    if (k <= 0.12) {   /* small arms: ticks and pings, nobody is deafened */
      M.noise(v.in, v.t, { dur: 0.012, attack: 0.0004, type: 'bandpass', f0: rnd(2600, 4200), q: 3, gain: 0.5 }); M.ring(v.in, v.t, { freqs: [rnd(1900, 2600), rnd(3300, 4400)], dur: 0.12, gain: 0.08 }); return;
    }
    if (!M.sample('hit_in', v, { gain: k })) {
      M.tone(v.in, v.t, { f0: ke ? 150 : 108, f1: 21, dur: ke ? 0.5 : 0.7, gain: 1.4 * k });
      M.tone(v.in, v.t, { f0: 44, f1: 20, dur: 0.8, gain: 0.7 * k, attack: 0.008 });
      M.noise(v.in, v.t, { dur: ke ? 0.12 : 0.22, attack: 0.0008, f0: ke ? 7500 : 5200, f1: 260, gain: 1.2 * k });
      M.noise(v.in, v.t, { dur: 0.16, attack: 0.001, color: 'pink', type: 'bandpass', f0: 420, f1: 200, q: 0.7, gain: 2.2 * k });   /* the body of the slam, in the range small loudspeakers play */
      if (ke) M.noise(v.in, v.t, { dur: 0.008, attack: 0.0003, type: 'highpass', f0: 3000, gain: 1.4 });
      M.ring(v.in, v.t + 0.004, { freqs: [410, 667, 1030, 1570, 2250, 3120], dur: (ke ? 1.5 : 0.95) * (0.6 + 0.4 * k), gain: 0.32 * k });
      this._rattle(v.t + 0.05, 2 * k);
    }
    if (k >= 0.5) M.deafen((killing ? 9 : 5) * Math.min(1, k)); else M.deafen(1.2, 0.5);
    if (opt.result === 'through') this.penetration(opt.strength || 1.6);
  },
  // A round has come THROUGH the armour (heard inside, on top of hit()): the sharp crack of the plate failing, spall hissing
  // across the compartment, then air and fluid lines venting. strength: the interior's hit strength (1.6 holed, 2 killing).
  penetration(strength = 1.6) {
    if (!this._live()) return; const M = this.mix, v = M.voice('explosions', { direct: true, cabin: 0.8 }), k = Math.min(1.3, strength / 1.6);
    if (M.sample('pen_in', v)) return;
    M.noise(v.in, v.t, { dur: 0.012, attack: 0.0003, type: 'highpass', f0: 2800, gain: 1.8 * k });                           /* the crack */
    M.noise(v.in, v.t, { dur: 0.05, attack: 0.0005, type: 'bandpass', f0: 1400, q: 0.8, gain: 1.2 * k });                    /* and its body: metal tearing */
    M.ring(v.in, v.t + 0.002, { freqs: [1730, 2950, 4400, 6100], dur: 0.35, gain: 0.25 * k });                              /* the plate rings high where it tore */
    for (let i = 0; i < 22; i++) M.noise(v.in, v.t + 0.008 + 0.4 * Math.pow(Math.random(), 2), { dur: rnd(0.008, 0.03), type: 'bandpass', f0: rnd(2500, 8000), q: 4, gain: rnd(0.1, 0.35) * k });   /* spall striking metal: most of it at once */
    M.noise(v.in, v.t + 0.01, { dur: 0.3, attack: 0.01, type: 'highpass', f0: 4200, gain: 0.3 * k });                        /* the spray of spall itself */
    M.noise(v.in, v.t + 0.15, { dur: 2.6, attack: 0.2, hold: 0.8, type: 'bandpass', f0: 5200, f1: 2600, q: 0.8, gain: 0.08 * k });   /* a line venting */
    this._rattle(v.t + 0.1, 2.5);
  },
  // A fire inside: the automatic fire suppression bottles discharge (a valve bang, then the roar of gas for about a second and a
  // half), heard close inside; from outside only a dull thump and a short hiss. where: 'hull' | 'ammo' | 'engine' (the engine bay is
  // behind a bulkhead: duller inside). Synthesised (slot 'extinguisher_in' takes a recording). ASSUMED sizes; nobody has listened.
  extinguisher(where = 'hull') {
    if (!this._live() || this.lite) return; const M = this.mix, out = this.seat === 'out', far = where === 'engine' || where === 'ammo';
    const v = out ? M.voice('explosions', { far: M.far(Math.max(3, this.camDist || 10), 0.5), cut: 700, delay: 0.25 }) : M.voice('explosions', { direct: true, cabin: 0.6, cut: far ? 1800 : 0, delay: 0.25 });
    if (!out && M.sample('extinguisher_in', v)) return;
    M.tone(v.in, v.t, { f0: 160, f1: 60, dur: 0.12, gain: 0.5 }); M.noise(v.in, v.t, { dur: 0.02, attack: 0.0005, type: 'bandpass', f0: 1800, q: 1.5, gain: 0.6 });   /* the valve */
    M.noise(v.in, v.t + 0.03, { dur: 1.6, attack: 0.03, hold: 0.7, type: 'bandpass', f0: 3800, f1: 1600, q: 0.6, gain: 0.32 });   /* the gas roaring out */
    M.noise(v.in, v.t + 0.03, { dur: 1.2, attack: 0.05, hold: 0.4, color: 'pink', f0: 900, f1: 400, gain: 0.18 });
  },
  // Something burst close by without striking (a near miss, heard inside): a dull thud through the hull, grit on the armour
  nearMiss(strength = 0.22) {
    if (!this._live()) return; const M = this.mix, v = M.voice('explosions', { direct: true, cabin: 0.5 }), k = Math.min(1, strength / 0.22);
    if (M.sample('nearmiss_in', v)) return;
    M.tone(v.in, v.t, { f0: 70, f1: 28, dur: 0.35, gain: 0.6 * k }); M.noise(v.in, v.t, { dur: 0.12, f0: 500, f1: 140, gain: 0.5 * k });
    for (let i = 0; i < 8; i++) M.noise(v.in, v.t + rnd(0.08, 0.7), { dur: rnd(0.01, 0.03), type: 'bandpass', f0: rnd(2200, 6000), q: 5, gain: rnd(0.02, 0.07) * k });
    this._rattle(v.t + 0.05, 0.6);
  },
  // loose kit, spall and fragments rattling on and inside the hull
  _rattle(when, k = 1) {
    if (this.lite) return; const M = this.mix, v = M.voice('vehicle', { direct: true, cabin: 0.3 }), t0 = Math.max(when, v.t);
    for (let i = 0; i < Math.round(7 * k); i++) M.noise(v.in, t0 + rnd(0, 0.5), { dur: rnd(0.02, 0.06), type: 'bandpass', f0: rnd(1800, 5200), q: 5, gain: 0.1 * Math.min(1.5, k) });
  },
  // The ammunition compartment burning off through the blow-out panels on the turret roof: the panels go with a bang, then a
  // roaring jet of flame for several seconds with rounds popping in it. Inside (the doors held): a muffled roar behind the
  // bulkhead. seconds: how long it burns.
  blowout(d, seconds = 5) {
    if (!this._live()) return; const M = this.mix, inside = this.seat === 'in'; this._shot();
    const a = M.far(d, 2), v = inside ? M.voice('explosions', { direct: true, cabin: 0.5, cut: 500 }) : M.voice('explosions', { far: a, space: 0.1 });   /* little into the echo: a steady roar builds up in it far more than a bang does */
    if (M.sample('blowout', v)) return;
    this._report(v, a, { crack: 1.2, crackHz: 900, crackDur: 0.04, bark: 1.6, barkHz: 700, barkDur: 0.2, body: 1.4, bodyHz: 350, bodyDur: 0.3, thump: 1.0, thumpHz: 90, thumpDur: 0.5, sub: 0.6, subHz: 45, subDur: 0.6, tail: 0.3, tailDur: 1.5, slap: inside ? 0 : 1 });
    M.noise(v.in, v.t + 0.05, { dur: seconds * 0.5, attack: 0.25, hold: seconds * 0.5, color: 'pink', type: 'bandpass', f0: 420, f1: 900, q: 0.5, gain: 2.0 });   /* the jet */
    M.noise(v.in, v.t + 0.05, { dur: seconds * 0.5, attack: 0.4, hold: seconds * 0.5, color: 'brown', f0: 260, gain: 0.8 });
    if (!this.lite) for (let i = 0; i < Math.round(seconds * 3); i++) { const t = v.t + rnd(0.3, seconds); M.noise(v.in, t, { dur: rnd(0.03, 0.09), attack: 0.0006, type: 'bandpass', f0: rnd(700, 2400), q: 0.8, gain: rnd(0.3, 0.9) }); M.tone(v.in, t, { f0: rnd(120, 200), f1: 60, dur: 0.07, gain: rnd(0.15, 0.4) }); }   /* rounds cooking off */
    if (inside) this._rattle(v.t + 0.05, 2);
  },

  // ---------------------------------------------------------------- missiles, rockets, drones, incoming fire
  // A launch heard from the listener's distance. big (a guided missile): the thump of the launch motor throwing it out of the
  // tube, then the flight motor's tearing roar, which fades as it flies. Small (an RPG): a hard bang with the back-blast's
  // whoosh, and the rocket motor lighting a tenth of a second later, 11 m out.
  launch(d, big, opt = {}) {
    if (!this._live()) return; const M = this.mix;
    const a = M.far(d, big ? 3 : 2.2, opt.occl), v = M.voice('weapons', { far: a, space: 0.5 }); if (M.sample(big ? 'launch_big' : 'launch_small', v)) return;
    if (big) {
      this._report(v, a, { crack: 0.9, crackHz: 1100, crackDur: 0.03, bark: 1.2, barkHz: 900, barkDur: 0.07, body: 1.0, bodyHz: 380, bodyDur: 0.14, thump: 0.9, thumpHz: 100, thumpDur: 0.26, sub: 0.4, subHz: 50, subDur: 0.3, tail: 0.25, tailDur: 1.2, slap: 0.6 });
      M.noise(v.in, v.t + 0.05, { dur: 1.9, attack: 0.06, hold: 0.3, color: 'pink', type: 'bandpass', f0: 520, f1: 1900, q: 0.9, gain: 0.9 });      /* the flight motor */
      M.noise(v.in, v.t + 0.05, { dur: 1.4, attack: 0.05, color: 'brown', f0: 280, f1: 90, gain: 0.7 });
      if (!this.lite && a.d < 500) for (let i = 0; i < 10; i++) M.noise(v.in, v.t + rnd(0.08, 1.0), { dur: 0.012, type: 'highpass', f0: 2500, gain: rnd(0.05, 0.2) });   /* the motor's crackle */
    } else {
      this._report(v, a, { crack: 1.4, crackHz: 1300, crackDur: 0.03, bark: 1.8, barkHz: 800, barkDur: 0.1, body: 1.3, bodyHz: 380, bodyDur: 0.15, thump: 0.9, thumpHz: 120, thumpDur: 0.2, sub: 0.4, subHz: 55, subDur: 0.25, tail: 0.2, tailDur: 0.8, slap: 1 });
      M.noise(v.in, v.t + 0.01, { dur: 0.35, attack: 0.03, color: 'pink', f0: 2600, f1: 500, gain: 0.5 });                                         /* back-blast */
      M.noise(v.in, v.t + 0.11, { dur: 0.7, attack: 0.02, color: 'pink', type: 'bandpass', f0: 900, f1: 2700, q: 1.1, gain: 0.6 });                /* rocket motor lights */
    }
  },
  // Something fast going past the listener: it rises as it comes, drops in pitch as it goes (Doppler, worked out from the
  // true geometry of the pass), and is gone. dur: roughly how long it is heard; opt.speed m/s (a guided missile about 250,
  // an RPG about 290); opt.miss: how close it passes, metres.
  whoosh(dur = 0.6, gain = 0.5, opt = {}) {
    if (!this._live()) return; const M = this.mix, v = M.voice('weapons', { gain, space: 0.25 }); if (M.sample('flyby', v)) return;
    const speed = opt.speed || 250, miss = opt.miss || 8, span = Math.max(0.35, dur * 1.1);
    M.pass(v.in, v.t, { speed, miss, span, hz: 1500, tone: 0, gain: 3.4, q: 1.1 });                       /* the motor's roar and the air torn open */
    M.pass(v.in, v.t, { speed, miss, span, hz: 420, tone: 310, gain: 1.6, color: 'brown', q: 0.8 });      /* its body, and a pitched part that makes the drop in pitch plain */
    if (!this.lite) M.noise(v.in, v.t + span, { dur: 0.25, attack: 0.03, type: 'highpass', f0: 3500, gain: 0.25 });   /* the hiss as it goes by */
  },
  // a supersonic round passing close: the crack of its shock wave first, the thump of the gun that fired it after
  // (the round outruns its own report). dGun: metres to the gun; speed: the round's speed in m/s; miss: metres it passes by.
  crackThump(dGun, speed = 1100, miss = 10, heavy = true) {
    if (!this._live()) return; const M = this.mix;
    this.snap(miss, heavy, dGun / speed);
    const b = M.far(dGun, heavy ? 1.6 : 0.7), w = M.voice('weapons', { far: b, space: 0.5 });   /* the thump arrives at the speed of sound */
    M.tone(w.in, w.t, { f0: heavy ? 90 : 150, f1: 35, dur: heavy ? 0.5 : 0.15, gain: 1.0 }); M.noise(w.in, w.t, { dur: heavy ? 1.6 : 0.5, color: 'brown', f0: 300, f1: 60, gain: 0.6 });
  },
  // the crack of one supersonic round going past `miss` metres away, `delay` seconds from now (no gun report: see crackThump)
  snap(miss = 6, heavy = false, delay = 0) {
    if (!this._live()) return; const M = this.mix, a = M.far(miss, heavy ? 0.9 : 0.5), v = M.voice('weapons', { gain: a.gain, cut: a.cut, delay: delay / M.rate, space: 0.15, pan: rnd(-0.7, 0.7) });
    if (M.sample('crack', v)) return;
    M.noise(v.in, v.t, { dur: 0.008, attack: 0.0002, type: 'highpass', f0: 3200, gain: 1.6 }); M.noise(v.in, v.t, { dur: 0.03, type: 'bandpass', f0: 1800, q: 0.7, gain: 0.6 });
    if (heavy) M.noise(v.in, v.t, { dur: 0.05, f0: 700, f1: 250, gain: 0.5 });
  },
  // a round glancing off armour or stone and singing away: a tick, then a whine that bends in pitch and fades
  ricochet(d = 10) {
    if (!this._live() || this.lite) return; const M = this.mix, a = M.far(d, 0.5), v = M.voice('weapons', { far: a, space: 0.3, pan: rnd(-0.8, 0.8) }); if (M.sample('ricochet', v)) return;
    const f = rnd(1900, 3600), up = Math.random() < 0.35;
    M.noise(v.in, v.t, { dur: 0.01, attack: 0.0003, type: 'bandpass', f0: 3800, q: 2, gain: 0.6 });
    M.tone(v.in, v.t + 0.004, { f0: f, f1: f * (up ? 1.5 : 0.45), dur: rnd(0.35, 0.7), gain: 0.16, attack: 0.002, type: 'triangle' }); M.tone(v.in, v.t + 0.004, { f0: f * 1.48, f1: f * (up ? 2.1 : 0.7), dur: 0.3, gain: 0.05, attack: 0.002 });
  },
  // An enemy tank or gun fires at the listener's vehicle from dGun metres. A long-rod round flies at about 1700 m/s, five
  // times the speed of sound: its crack is heard first (at dGun / speed), the gun's report long after (dGun / 343).
  // miss: how far the round passes from the listener (0 or a hit: the strike itself is hit() / explosion()).
  tankRound(dGun, speed = 1700, miss = 12) {
    if (!this._live()) return; const M = this.mix;
    if (miss > 0.5) this.snap(miss, true, dGun / speed);
    const a = M.far(dGun, 2.2), v = M.voice('weapons', { far: a, space: 0.8 });
    this._report(v, a, { crack: 1.6, crackHz: 600, crackDur: 0.08, bark: 2.3, barkHz: 600, barkDur: 0.32, body: 1.6, bodyHz: 300, bodyDur: 0.4, thump: 1.1, thumpHz: 74, thumpDur: 0.8, sub: 0.8, subHz: 38, subDur: 0.9, tail: 0.5, tailDur: 2.6, tailHz: 450, slap: 1 });
  },
  // an enemy autocannon burst (BMP-2, 30 mm 2A42) heard from d metres: n rounds about 0.2 s apart, a flatter, harder bark than our gun
  autocannon(d, n = 5, opt = {}) {
    if (!this._live()) return; const M = this.mix, a = M.far(d, 1.1, opt.occl); n = this.lite ? 1 : n;
    for (let i = 0; i < n; i++) {
      const v = M.voice('weapons', { far: a, space: 0.4, delay: (i * 0.2 + rnd(0, 0.015)) / M.rate }), k = rnd(0.95, 1.05);
      this._report(v, a, { crack: 1.5, crackHz: 1700, crackDur: 0.03, bark: 1.8, barkHz: 1150 * k, barkDur: 0.07, body: 1.0, bodyHz: 520, bodyDur: 0.09, thump: 0.6, thumpHz: 170 * k, thumpDur: 0.1, sub: 0.3, subHz: 70, subDur: 0.15, tail: 0.1, tailDur: 0.45, slap: 1 });
    }
  },
  // The vehicle's smoke grenade dischargers: a ripple of sharp pops from the turret sides, then, a second later and 30 m out,
  // the grenades bursting one after another in a string of soft pops, and the hiss of the cloud spreading.
  smoke(d = 0) {
    if (!this._live()) return; const M = this.mix, inside = this.seat === 'in';
    const a = M.far(d, 0.6), v = M.voice('weapons', inside ? { direct: true, cabin: 0.4 } : { far: a, space: 0.3 });
    if (M.sample('smoke_discharge', v)) return;
    for (let i = 0; i < 6; i++) {
      const t = v.t + i * 0.045 + rnd(0, 0.012);
      M.tone(v.in, t, { f0: inside ? 140 : 230, f1: 80, dur: 0.05, gain: 0.7 }); M.noise(v.in, t, { dur: 0.03, type: 'bandpass', f0: inside ? 500 : 1300, q: 1, gain: 0.7 });
    }
    const b = M.far(d + 30, 0.5), w = M.voice('explosions', { far: b, space: 0.4, delay: 1.1 / M.rate });
    for (let i = 0; i < 8; i++) {
      const t = w.t + i * rnd(0.06, 0.11);
      M.tone(w.in, t, { f0: rnd(150, 210), f1: 80, dur: 0.09, gain: 0.5, attack: 0.006 }); M.noise(w.in, t, { dur: 0.16, attack: 0.008, color: 'pink', type: 'bandpass', f0: 800, f1: 300, q: 0.8, gain: 0.55 });
    }
    if (!this.lite) M.noise(w.in, w.t + 0.2, { dur: 2.2, attack: 0.5, type: 'highpass', f0: 2800, gain: 0.04 });
  },
  // a shell coming in on a high arc: a whistle that drops in pitch and swells for `flight` seconds, then the burst
  // (size about 2: a 122 or 152 mm shell on the ground). d: metres from the listener to the point of impact.
  artillery(d, flight = 1.6, size = 2) {
    if (!this._live()) return; const M = this.mix, a = M.far(d, 1);
    if (!this.lite && a.d < 500 && flight > 0.2) {
      const v = M.voice('weapons', { gain: a.gain * 1.2, cut: a.cut, space: 0.3 }), c = this.ctx, o = c.createOscillator(), g = c.createGain(), T = flight / M.rate;
      o.type = 'triangle'; o.frequency.setValueAtTime(2100, v.t); o.frequency.exponentialRampToValueAtTime(620, v.t + T);
      g.gain.setValueAtTime(0, v.t); g.gain.linearRampToValueAtTime(0.02, v.t + T * 0.3); g.gain.exponentialRampToValueAtTime(0.3, v.t + T); g.gain.linearRampToValueAtTime(0, v.t + T + 0.02);
      o.connect(g); g.connect(v.in); o.start(v.t); o.stop(v.t + T + 0.05);
      M.noise(v.in, v.t + T * 0.4, { dur: T * 0.3, attack: T * 0.55, color: 'pink', type: 'bandpass', f0: 2600, f1: 900, q: 1.5, gain: 0.4 });   /* the air tearing */
    }
    this.explosion(d, size, { ground: true, delay: flight });
  },
  // a hatch: opening (hinge, the lid against its stop) or closing (the heavy lid dropping, the latch). Heard from the seats.
  // HKOI's cloud has cut a missile's guidance: a crisp click and two rising notes, short and clean, heard in every seat and outside
  // (it is the simulator's own signal of success, like the cloud's highlight, not a sound the battlefield makes). About 0.25 s.
  cutCue() {
    if (!this._live()) return; const M = this.mix, v = M.voice('ui', { direct: true });
    M.noise(v.in, v.t, { dur: 0.012, attack: 0.0005, type: 'bandpass', f0: 3200, q: 1.5, gain: 0.12 });
    M.tone(v.in, v.t + 0.01, { f0: 1175, dur: 0.07, gain: 0.07, attack: 0.002, type: 'triangle' });
    M.tone(v.in, v.t + 0.09, { f0: 1760, dur: 0.14, gain: 0.07, attack: 0.002, type: 'triangle' });
  },
  hatch(open = true) {
    if (!this._live() || this.lite || this.seat === 'out') return; const M = this.mix, v = M.voice('vehicle', { direct: true, cabin: 0.4 }); if (M.sample('hatch', v)) return;
    if (open) M.tone(v.in, v.t, { f0: 760, f1: 1150, dur: 0.22, gain: 0.03, attack: 0.05, type: 'triangle' });   /* hinge */
    const t = v.t + (open ? 0.3 : 0);
    M.tone(v.in, t, { f0: 150, f1: 62, dur: 0.13, gain: open ? 0.5 : 0.8 }); M.noise(v.in, t, { dur: 0.04, attack: 0.0006, type: 'bandpass', f0: 950, q: 1.2, gain: open ? 0.5 : 0.8 });
    M.ring(v.in, t + 0.003, { freqs: [262, 431, 688, 1120], dur: 0.5, gain: 0.12 });
    M.noise(v.in, t + (open ? 0.12 : 0.2), { dur: 0.012, type: 'bandpass', f0: 3300, q: 5, gain: 0.3 });   /* latch */
  },
};
