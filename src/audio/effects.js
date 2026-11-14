// One-shot sounds: guns, blasts, launches, strikes. All synthesised with the mixer's building blocks until recordings
// arrive; every sound first asks the mixer for a recording of its SLOT (assets/sfx_index.json) and only synthesises when
// there is none. These functions are mixed into the Sound class (`this` is the Sound object; `d` is metres from the listener).
//
// Listening positions: 'in' (buttoned up: own weapons are felt through the structure, loud mechanics, everything outside
// is a dull thud), 'hatch' (head out in a helmet) and 'out' (open air: delay, loss of highs and level by range).
// ASSUMPTIONS: nobody here has heard these weapons or this build. Timings are from open sources: 30 mm chain gun about
// 200 rounds a minute; .50 M2 about 8 rounds a second; 7.62 mm M240 about 11 to 14; Trophy's launcher and its charge
// go off a few hundredths of a second apart.

const rnd = (a, b) => a + Math.random() * (b - a);

// names of all slots a recording can replace (one-shots here; the looped beds are listed in sound.js)
export const SLOTS = [
  'gun30_out', 'gun30_in', 'gun120_out', 'gun120_in', 'mg50_out', 'mg50_in', 'mg762_out', 'mg762_in',
  'aps_out', 'aps_in', 'launch_small', 'launch_big', 'flyby', 'crack', 'explosion_small', 'explosion_medium', 'explosion_large',
  'airburst', 'hit_in', 'pen_in', 'nearmiss_in', 'smoke_discharge',
];

export const Effects = {
  _live() { return !!(this.ctx && this.on && this.mix); },
  _shot() { this.lastShot = this.ctx.currentTime; },
  // The common shape of a gun or a blast heard through the air, in four layers: the crack (the sharp leading edge, lost
  // with distance), the bark (the mid-range body), the thump (the low push on the chest) and the tail (what rolls on
  // afterwards; at long range it is most of what is left). `a` is the mixer's distance result for this sound.
  _report(v, a, { at = 0, crack = 1, crackHz = 1200, crackDur = 0.04, bark = 1, barkHz = 900, barkDur = 0.08, thump = 0.6, thumpHz = 150, thumpDur = 0.11, tail = 0.12, tailDur = 0.4, tailHz = 600 } = {}) {
    const M = this.mix, t = v.t + at, near = 1 - a.roll;
    if (crack) M.noise(v.in, t, { dur: crackDur, attack: 0.0005, type: 'highpass', f0: crackHz, gain: crack * near });
    if (bark) M.noise(v.in, t, { dur: barkDur, attack: 0.001, type: 'bandpass', f0: barkHz, f1: barkHz * 0.4, q: 0.6, gain: bark });
    if (thump) M.tone(v.in, t, { f0: thumpHz, f1: thumpHz / 3, dur: thumpDur, gain: thump });
    if (tail) M.noise(v.in, t + 0.015, { dur: tailDur * (1 + 2.5 * a.roll), color: 'brown', f0: tailHz, f1: 70, gain: tail * (1 + 3 * a.roll) });
  },

  // ---------------------------------------------------------------- the 30 mm: the star of the mix
  // One round. Outside: a hard, tight report (crack, bark and a chest thump inside a tenth of a second), the bolt and feed
  // working, the link and case, a short ring off the mount, and a tail off the country. Inside: a thud through the turret
  // ring with the mechanism loud and close.
  gun30(d) {
    if (!this._live()) return; const M = this.mix; this._shot();
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.5 }); if (M.sample('gun30_in', v)) return;
      M.tone(v.in, v.t, { f0: 96, f1: 38, dur: 0.15, gain: 0.6 });
      M.noise(v.in, v.t, { dur: 0.07, attack: 0.001, f0: 1000, f1: 240, gain: 1.1 });
      if (this.lite) return;
      M.noise(v.in, v.t + 0.011, { dur: 0.02, type: 'bandpass', f0: 2900, q: 4, gain: 1.0 });          /* bolt home */
      M.ring(v.in, v.t + 0.012, { freqs: [1240, 2090, 3170], dur: 0.14, gain: 0.1 });                 /* the mount rings */
      M.noise(v.in, v.t + 0.07, { dur: 0.035, type: 'bandpass', f0: 1650, q: 3, gain: 0.9 });          /* chain drive and feed sprocket */
      M.noise(v.in, v.t + rnd(0.12, 0.17), { dur: 0.02, type: 'bandpass', f0: 4300, q: 6, gain: 0.4 }); /* link into the chute */
      return;
    }
    const a = M.far(d, 1), v = M.voice('weapons', { far: a, space: 0.4 }); if (M.sample('gun30_out', v)) return;
    this._report(v, a, { crack: 1.35, crackHz: 1300, crackDur: 0.04, bark: 1.9, barkHz: 950, barkDur: 0.09, thump: 0.45, thumpHz: 150, thumpDur: 0.1, tail: 0.08, tailDur: 0.35 });
    if (this.lite || a.d > 140) return;
    M.noise(v.in, v.t + 0.05, { dur: 0.022, type: 'bandpass', f0: 2500, q: 4, gain: 0.3 });             /* bolt and feed */
    M.ring(v.in, v.t + 0.004, { freqs: [1180, 1990, 3050], dur: 0.16, gain: 0.07 });                   /* barrel and mount ring */
    const tc = v.t + rnd(0.16, 0.3);                                                                  /* the case and link drop clear */
    M.ring(v.in, tc, { freqs: [3350, 5120], dur: 0.07, gain: 0.05 }); M.noise(v.in, tc, { dur: 0.012, type: 'bandpass', f0: 5200, q: 5, gain: 0.1 });
  },

  // ---------------------------------------------------------------- the 120 mm
  // Outside: a crack, a blast and a pressure wave you feel more than hear, then a long roll off the country.
  // Inside: a dull slam, the breech running back and closing, the stub case hitting the floor, the fume extractor's hiss.
  gun120(d) {
    if (!this._live()) return; const M = this.mix; this._shot();
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.6 }); if (M.sample('gun120_in', v)) return;
      M.tone(v.in, v.t, { f0: 62, f1: 20, dur: 0.7, gain: 1.2 });
      M.noise(v.in, v.t, { dur: 0.3, attack: 0.001, f0: 700, f1: 110, gain: 1.4 });
      if (this.lite) return;
      M.ring(v.in, v.t + 0.16, { freqs: [520, 870, 1460, 2210], dur: 0.4, gain: 0.2 }); M.noise(v.in, v.t + 0.16, { dur: 0.05, type: 'bandpass', f0: 1200, q: 2, gain: 0.3 });   /* breech at full recoil */
      M.noise(v.in, v.t + 0.3, { dur: 1.1, attack: 0.25, type: 'highpass', f0: 2600, gain: 0.045 });                                                                         /* fume extractor */
      M.ring(v.in, v.t + 0.8, { freqs: [690, 1130, 1840, 2900], dur: 0.3, gain: 0.13 }); M.noise(v.in, v.t + 0.8, { dur: 0.04, type: 'bandpass', f0: 2100, q: 3, gain: 0.16 });  /* stub case on the floor */
      this._rattle(v.t + 0.05, 1);
      return;
    }
    const a = M.far(d, 2.2), v = M.voice('weapons', { far: a, space: 0.8 }); if (M.sample('gun120_out', v)) return;
    this._report(v, a, { crack: 1.5, crackHz: 600, crackDur: 0.08, bark: 2.2, barkHz: 620, barkDur: 0.32, thump: 0.9, thumpHz: 78, thumpDur: 0.8, tail: 0.45, tailDur: 2.4, tailHz: 450 });
    M.tone(v.in, v.t + 0.02, { f0: 40, f1: 17, dur: 0.8, gain: 0.5 });                                                    /* the pressure wave */
    if (!this.lite && a.d < 200) M.noise(v.in, v.t + 0.08, { dur: 0.9, attack: 0.12, color: 'pink', f0: 1500, f1: 300, gain: 0.12 });   /* dust and blast wash */
  },

  // ---------------------------------------------------------------- machine guns: heavy = the .50, otherwise the 7.62 mm
  // The .50 is slow and heavy: a deep knock with weight behind it. The 7.62 is fast and light: a dry, higher snap.
  mg(d, heavy) {
    if (!this._live()) return; const M = this.mix; this._shot();
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.35 }); if (M.sample(heavy ? 'mg50_in' : 'mg762_in', v)) return;
      if (heavy) {   /* on the roof: thuds through the armour */
        M.tone(v.in, v.t, { f0: 125, f1: 55, dur: 0.075, gain: 0.45 }); M.noise(v.in, v.t, { dur: 0.035, f0: 800, f1: 250, gain: 0.6 });
      } else {       /* the coax is beside the gunner: mechanism and links, close */
        M.tone(v.in, v.t, { f0: 210, f1: 95, dur: 0.035, gain: 0.25 }); M.noise(v.in, v.t, { dur: 0.016, type: 'bandpass', f0: 2600, q: 2.5, gain: 0.7 });
        if (!this.lite) M.noise(v.in, v.t + 0.03, { dur: 0.012, type: 'bandpass', f0: 4700, q: 5, gain: 0.3 });
      }
      return;
    }
    const a = M.far(d, heavy ? 0.75 : 0.45), v = M.voice('weapons', { far: a, space: 0.3 }); if (M.sample(heavy ? 'mg50_out' : 'mg762_out', v)) return;
    if (heavy) this._report(v, a, { crack: 0.9, crackHz: 1400, crackDur: 0.03, bark: 1.0, barkHz: 850, barkDur: 0.06, thump: 0.5, thumpHz: 165, thumpDur: 0.08, tail: 0.07, tailDur: 0.28 });
    else this._report(v, a, { crack: 1.0, crackHz: 2600, crackDur: 0.016, bark: 0.8, barkHz: 1700, barkDur: 0.035, thump: 0.2, thumpHz: 270, thumpDur: 0.035, tail: 0.04, tailDur: 0.16, tailHz: 900 });
  },

  // ---------------------------------------------------------------- Trophy: a very sharp double crack on the turret
  // first the launcher, then the charge going off a few metres out
  aps(d) {
    if (!this._live()) return; const M = this.mix; this._shot(); const gap = rnd(0.045, 0.065);
    if (this.seat === 'in') {
      const v = M.voice('weapons', { direct: true, cabin: 0.6 }); if (M.sample('aps_in', v)) return;
      for (const [dt, k] of [[0, 0.8], [gap, 1]]) { M.tone(v.in, v.t + dt, { f0: 185, f1: 60, dur: 0.09, gain: 0.9 * k }); M.noise(v.in, v.t + dt, { dur: 0.03, color: 'pink', f0: 950, f1: 300, gain: 0.7 * k }); }
      M.ring(v.in, v.t + gap, { freqs: [760, 1210, 1930, 2840], dur: 0.25, gain: 0.1 }); this._rattle(v.t + gap + 0.02, 0.8);
      return;
    }
    const a = M.far(d, 1.4), v = M.voice('weapons', { far: a, space: 0.45 }); if (M.sample('aps_out', v)) return;
    this._report(v, a, { crack: 1.3, crackHz: 2600, crackDur: 0.016, bark: 0.6, barkHz: 1800, barkDur: 0.03, thump: 0.3, thumpHz: 240, thumpDur: 0.04, tail: 0 });
    this._report(v, a, { at: gap, crack: 1.4, crackHz: 1700, crackDur: 0.026, bark: 1.3, barkHz: 1000, barkDur: 0.1, thump: 0.7, thumpHz: 170, thumpDur: 0.14, tail: 0.12, tailDur: 0.35 });
  },

  // ---------------------------------------------------------------- blasts
  // size: about 0.5 (a small charge) to 2.2 (a killing hit). Near: crack, slam, then earth and fragments pattering down.
  // Far: no crack at all, only a low thump that rolls on.
  explosion(d, size = 1) {
    if (!this._live()) return; const M = this.mix; this._shot();
    const a = M.far(d, 0.9 + 0.5 * size), v = M.voice('explosions', { far: a, space: 0.6 });
    if (!M.sample(size >= 1.8 ? 'explosion_large' : size >= 1.1 ? 'explosion_medium' : 'explosion_small', v)) {
      const s = Math.sqrt(size);
      this._report(v, a, { crack: 1.0, crackHz: 800, crackDur: 0.05, bark: 1.8, barkHz: 620 / s, barkDur: 0.26 + 0.1 * size, thump: 0.8, thumpHz: 95 / s, thumpDur: 0.45 + 0.3 * size, tail: 0.35, tailDur: 1.2 + size, tailHz: 400 });
      if (!this.lite && a.d < 160) {   /* earth and fragments coming down */
        const n = Math.round(5 + 7 * size);
        for (let i = 0; i < n; i++) M.noise(v.in, v.t + rnd(0.25, 1.1 + 0.6 * size), { dur: rnd(0.015, 0.05), type: 'bandpass', f0: rnd(1400, 5200), q: 3, gain: rnd(0.02, 0.09) });
      }
    }
    if (this.seat === 'in' && a.d < 45) {   /* close enough to shake the hull */
      const k = Math.min(1, size * 14 / (14 + a.d)), w = M.voice('explosions', { direct: true, cabin: 0.5, delay: a.delay });
      M.tone(w.in, w.t, { f0: 55, f1: 22, dur: 0.5, gain: 0.8 * k }); this._rattle(w.t + 0.03, k);
    }
  },
  airburst(d, size = 0.5) {
    if (!this._live()) return; const M = this.mix; this._shot();
    const a = M.far(d, 0.7 + 0.5 * size), v = M.voice('explosions', { far: a, space: 0.5 }); if (M.sample('airburst', v)) return;
    this._report(v, a, { crack: 1.0, crackHz: 1500, crackDur: 0.035, bark: 1.0, barkHz: 1100, barkDur: 0.1, thump: 0.4, thumpHz: 130, thumpDur: 0.18, tail: 0.1, tailDur: 0.5 });
    if (!this.lite && a.d < 200) M.noise(v.in, v.t + 0.01, { dur: 0.22, attack: 0.02, type: 'highpass', f0: 3200, gain: 0.1 });   /* fragments and powder */
  },
  // a round strikes the listener's own vehicle: heard from inside as a slam and ringing armour; ears ring, the world goes dull
  hit(killing) {
    if (!this._live()) return; const M = this.mix, v = M.voice('explosions', { direct: true, cabin: 0.7 });
    if (!M.sample('hit_in', v)) {
      M.tone(v.in, v.t, { f0: 108, f1: 21, dur: 1.0, gain: 1.3 });
      M.noise(v.in, v.t, { dur: 0.22, attack: 0.0008, f0: 5200, f1: 260, gain: 1.1 });
      M.ring(v.in, v.t + 0.004, { freqs: [410, 667, 1030, 1570, 2250, 3120], dur: 0.95, gain: 0.3 });
      this._rattle(v.t + 0.05, 2);
    }
    M.deafen(killing ? 9 : 5);
  },
  // A round has come THROUGH the armour (heard inside, on top of hit()): the sharp crack of the plate failing, spall hissing
  // across the compartment, then air and fluid lines venting. strength: the interior's hit strength (1.6 holed, 2 killing).
  penetration(strength = 1.6) {
    if (!this._live()) return; const M = this.mix, v = M.voice('explosions', { direct: true, cabin: 0.8 }), k = Math.min(1.3, strength / 1.6);
    if (M.sample('pen_in', v)) return;
    M.noise(v.in, v.t, { dur: 0.012, attack: 0.0003, type: 'highpass', f0: 2800, gain: 1.6 * k });                           /* the crack */
    M.ring(v.in, v.t + 0.002, { freqs: [1730, 2950, 4400, 6100], dur: 0.35, gain: 0.25 * k });                              /* the plate rings high where it tore */
    for (let i = 0; i < 14; i++) M.noise(v.in, v.t + 0.01 + rnd(0, 0.35), { dur: rnd(0.008, 0.03), type: 'bandpass', f0: rnd(2500, 8000), q: 4, gain: rnd(0.08, 0.3) * k });   /* spall striking metal */
    M.noise(v.in, v.t + 0.15, { dur: 2.6, attack: 0.2, hold: 0.8, type: 'bandpass', f0: 5200, f1: 2600, q: 0.8, gain: 0.07 * k });   /* a line venting */
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
    M.tone(v.in, v.t, { f0: 70, f1: 28, dur: 0.35, gain: 0.5 * k }); M.noise(v.in, v.t, { dur: 0.12, f0: 500, f1: 140, gain: 0.4 * k });
    for (let i = 0; i < 8; i++) M.noise(v.in, v.t + rnd(0.08, 0.7), { dur: rnd(0.01, 0.03), type: 'bandpass', f0: rnd(2200, 6000), q: 5, gain: rnd(0.02, 0.07) * k });
    this._rattle(v.t + 0.05, 0.6);
  },
  // loose kit, spall and fragments rattling on and inside the hull
  _rattle(when, k = 1) {
    if (this.lite) return; const M = this.mix, v = M.voice('vehicle', { direct: true, cabin: 0.3 }), t0 = Math.max(when, v.t);
    for (let i = 0; i < Math.round(7 * k); i++) M.noise(v.in, t0 + rnd(0, 0.5), { dur: rnd(0.02, 0.06), type: 'bandpass', f0: rnd(1800, 5200), q: 5, gain: 0.1 * Math.min(1.5, k) });
  },

  // ---------------------------------------------------------------- missiles
  // a launch seen from the listener's distance: the pop of the booster, then the motor's tearing rush
  launch(d, big) {
    if (!this._live()) return; const M = this.mix;
    const a = M.far(d, big ? 3 : 2), v = M.voice('weapons', { far: a, space: 0.5 }); if (M.sample(big ? 'launch_big' : 'launch_small', v)) return;
    M.noise(v.in, v.t, { dur: 0.06, attack: 0.001, type: 'bandpass', f0: 900, q: 0.8, gain: 1.0 });
    M.tone(v.in, v.t, { f0: 98, f1: 42, dur: 0.24, gain: 0.7 });
    M.noise(v.in, v.t + 0.02, { dur: big ? 1.5 : 0.8, attack: 0.07, color: 'pink', type: 'bandpass', f0: 520, f1: big ? 1900 : 2700, q: 0.9, gain: 0.8 });
    if (big) M.noise(v.in, v.t + 0.02, { dur: 1.1, attack: 0.05, color: 'brown', f0: 260, f1: 90, gain: 0.5 });
  },
  // something fast going past the listener: it rises as it comes, drops in pitch as it goes (Doppler), and is gone
  whoosh(dur = 0.6, gain = 0.5) {
    if (!this._live()) return; const M = this.mix, v = M.voice('weapons', { gain, space: 0.25 }); if (M.sample('flyby', v)) return;
    const up = dur * 0.62;
    M.noise(v.in, v.t, { dur: dur * 0.5, attack: up, color: 'pink', type: 'bandpass', f0: 650, f1: 3600, q: 1.3, gain: 1.6 });
    M.noise(v.in, v.t + up, { dur: dur * 0.9, attack: 0.02, color: 'pink', type: 'bandpass', f0: 2500, f1: 500, q: 1.1, gain: 1.0 });
    M.noise(v.in, v.t, { dur: dur * 0.6, attack: up, color: 'brown', f0: 300, gain: 0.5 });
  },
  // a supersonic round passing close: the crack of its shock wave first, the thump of the gun that fired it after
  // (the round outruns its own report). dGun: metres to the gun; speed: the round's speed in m/s; miss: metres it passes by.
  crackThump(dGun, speed = 1100, miss = 10, heavy = true) {
    if (!this._live()) return; const M = this.mix;
    const tRound = dGun / speed, a = M.far(miss, heavy ? 0.9 : 0.5), v = M.voice('weapons', { gain: a.gain, cut: a.cut, delay: tRound, space: 0.15 });
    if (!M.sample('crack', v)) { M.noise(v.in, v.t, { dur: 0.008, attack: 0.0002, type: 'highpass', f0: 3200, gain: 1.4 }); M.noise(v.in, v.t, { dur: 0.03, type: 'bandpass', f0: 1800, q: 0.7, gain: 0.5 }); }
    const b = M.far(dGun, heavy ? 1.6 : 0.7), w = M.voice('weapons', { far: b, space: 0.5 });   /* the thump arrives at the speed of sound */
    M.tone(w.in, w.t, { f0: heavy ? 90 : 150, f1: 35, dur: heavy ? 0.5 : 0.15, gain: 1.0 }); M.noise(w.in, w.t, { dur: heavy ? 1.6 : 0.5, color: 'brown', f0: 300, f1: 60, gain: 0.6 });
  },
  // the vehicle's smoke grenade dischargers: a ripple of sharp pops, then the grenades bursting a second later out front
  smoke(d = 0) {
    if (!this._live()) return; const M = this.mix, inside = this.seat === 'in';
    const a = M.far(d, 0.6), v = M.voice('weapons', inside ? { direct: true, cabin: 0.4 } : { far: a, space: 0.3 });
    if (M.sample('smoke_discharge', v)) return;
    for (let i = 0; i < 6; i++) {
      const t = v.t + i * 0.045 + rnd(0, 0.012);
      M.tone(v.in, t, { f0: inside ? 140 : 230, f1: 80, dur: 0.05, gain: 0.6 }); M.noise(v.in, t, { dur: 0.03, type: 'bandpass', f0: inside ? 500 : 1300, q: 1, gain: 0.6 });
    }
    const b = M.far(d + 30, 0.4), w = M.voice('explosions', { far: b, space: 0.4, delay: 1.1 });
    for (let i = 0; i < 6; i++) M.noise(w.in, w.t + rnd(0, 0.35), { dur: 0.12, color: 'pink', type: 'bandpass', f0: 900, f1: 300, q: 0.8, gain: 0.5 });
  },
};
