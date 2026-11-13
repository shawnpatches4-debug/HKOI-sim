// ================================================================ sound: effects synthesised in the browser; crew voices (Kokoro TTS, Apache-2.0) and screams (0 A.D., Wildfire Games, CC-BY-SA 3.0) recorded
const SND = (() => {
  let outG = null, duckG = null, voBus = null, lastBoom = 0, lastAny = -9;
  let whO = null, whO2 = null, whG = null, ac = null, on = true, voices = true, VI = null, VB = {}, playing = {}, breathAt = 0, master, nb, bb, engG, engF, engO, warnG, warnO, beatAt = 0, inside = false, hatch = true, station = 'CDR', trkG = null, trkL = null, inbAt = 0;
  const rnd = () => Math.random() * 2 - 1;
  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; try { ac = new AC(); } catch (e) { ac = null; return; }
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -4; lim.ratio.value = 16; lim.attack.value = .003; lim.release.value = .12; lim.connect(ac.destination); outG = ac.createGain(); outG.gain.value = on ? .9 : 0; outG.connect(lim);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 5; comp.release.value = .2; master = ac.createGain(); master.gain.value = .8; duckG = ac.createGain(); master.connect(comp); comp.connect(duckG); duckG.connect(outG);
    voBus = ac.createGain(); voBus.gain.value = 1.25; voBus.connect(outG);
    nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd();
    bb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const e = bb.getChannelData(0); let b = 0; for (let i = 0; i < e.length; i++) { b = (b + .02 * rnd()) / 1.02; e[i] = b * 3.5; }
    // engine and tracks: brown noise and a low sawtooth through a low-pass filter
    engG = ac.createGain(); engG.gain.value = 0; engF = ac.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 160; engF.connect(engG); engG.connect(master);
    const s = ac.createBufferSource(); s.buffer = bb; s.loop = true; s.connect(engF); s.start();
    whO = ac.createOscillator(); whO.type = 'sine'; whO.frequency.value = 1900; whG = ac.createGain(); whG.gain.value = 0; whO.connect(whG); whG.connect(master); whO.start();
    const wh2 = ac.createOscillator(); wh2.type = 'triangle'; wh2.frequency.value = 3820; const w2g = ac.createGain(); w2g.gain.value = .25; wh2.connect(w2g); w2g.connect(whG); wh2.start(); whO2 = wh2;
    engO = ac.createOscillator(); engO.type = 'sawtooth'; engO.frequency.value = 31; const og = ac.createGain(); og.gain.value = .12; engO.connect(og); og.connect(engF); engO.start();
    // track clatter: band-passed noise chopped at the rate the links hit the sprocket
    { const tn = ac.createBufferSource(); tn.buffer = nb; tn.loop = true; const tf = ac.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 780; tf.Q.value = 1.2; trkG = ac.createGain(); trkG.gain.value = 0; const am = ac.createGain(); am.gain.value = .5; trkL = ac.createOscillator(); trkL.type = 'square'; trkL.frequency.value = 6; const ld = ac.createGain(); ld.gain.value = .5; trkL.connect(ld); ld.connect(am.gain); tn.connect(tf); tf.connect(am); am.connect(trkG); trkG.connect(master); tn.start(); trkL.start(); }
    // laser warner: a warbling tone
    warnG = ac.createGain(); warnG.gain.value = 0; warnO = ac.createOscillator(); warnO.type = 'square'; warnO.frequency.value = 1150; const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 7; const lg = ac.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(warnO.frequency); const wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 1200; wf.Q.value = .8;
    warnO.connect(wf); wf.connect(warnG); warnG.connect(master); warnO.start(); lfo.start();
    loadVoices();
  }
  // recorded crew voices and screams: one MP3 sprite per crew member and one for screams
  async function loadVoices() {
    try { const r = await fetch('assets/voice_index.json?v=37b'); VI = await r.json();
      for (const f of ['cdr', 'gnr', 'ldr', 'drv', 'screams', 'net', 'panic', 'mod', 'ru']) fetch(`assets/${f === 'screams' ? 'screams' : f === 'net' ? 'radio_net' : 'voice_' + f}.mp3${f === 'ru' ? '?v=37b' : ''}`).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => { VB[f] = buf; }).catch(() => {}); } catch (e) { VI = null; }
  }
  // enemy side (heard only in the enemy view): synthesised Russian calls, one at a time, through a radio-ish filter
  let enemyV = false, ruN = 0; function setEnemyView(v) { v = !!v; if (v === enemyV) return; enemyV = v; if (voBus && ac) voBus.gain.setTargetAtTime(v ? 0 : 1.25, ac.currentTime, .05); }
  let ruEnd = 0; function enemySay(tag) { if (!ac || !on || !VI || !VI.r || !VB.ru) return false; const L = VI.r[tag]; if (!L || !L.length) return false; const now = ac.currentTime; if (now < ruEnd) return false; const c = L[Math.floor(Math.random() * L.length)]; clip('ru', c[0], c[1], now + .02, 1.5, 0, 3400, null, 1, .2); ruN++; ruEnd = now + c[1] + .2; return true; }
  // FPV motors, heard only when riding a drone in the enemy view: two detuned saws through a band-pass, pitch follows speed
  // armour taking the shock of a near miss or a hit, heard from inside: a low slam through the hull, then bolts, racks and stowage ringing
  function clank(k) { if (!ac || !on || enemyV) return; const now = ac.currentTime, K = Math.max(.15, Math.min(1.4, k)); { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(70, now); o.frequency.exponentialRampToValueAtTime(28, now + .35); g.gain.setValueAtTime(.9 * K, now); g.gain.exponentialRampToValueAtTime(.001, now + .5); o.connect(g); g.connect(master); o.start(now); o.stop(now + .55); }
    const n = Math.round(4 + K * 9); for (let i = 0; i < n; i++) { const at = now + .02 + Math.random() * (.25 + K * .5), f0 = 900 + Math.random() * 3600, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o2.type = 'square'; o.frequency.value = f0; o2.frequency.value = f0 * 2.76; const g2 = ac.createGain(); g2.gain.value = .25; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.16 * K * (.4 + Math.random() * .8), at + .004); g.gain.exponentialRampToValueAtTime(.0008, at + .08 + Math.random() * .3); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master); o.start(at); o2.start(at); o.stop(at + .5); o2.stop(at + .5); } }
  let fpvN = null; function fpv(level, spd) { if (!ac) return; if (!fpvN) { if (!level) return; const g = ac.createGain(); g.gain.value = 0; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = .8; const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start(); fpvN = { g, o1, o2, f }; } const now = ac.currentTime, hz = 150 + Math.min(60, spd || 0) * 2.4; fpvN.g.gain.setTargetAtTime(on && level ? .16 * level : 0, now, .08); fpvN.o1.frequency.setTargetAtTime(hz, now, .15); fpvN.o2.frequency.setTargetAtTime(hz * 1.507, now, .15); fpvN.f.frequency.setTargetAtTime(hz * 3.2, now, .2); }
  let shaper = null; const shapeCurve = () => { if (shaper) return shaper; const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 3.2) * .82; } return (shaper = c); };
  function clip(file, off, dur, at, gain, pan, lp, key, rate, dist) {
    const b = VB[file]; if (!b || (enemyV && file !== 'ru')) return null; const s = ac.createBufferSource(); s.buffer = b; if (rate) s.playbackRate.value = rate; let n = s;
    if (dist) { const pre = ac.createGain(); pre.gain.value = 1 + dist * 1.6; n.connect(pre); const ws = ac.createWaveShaper(); ws.curve = shapeCurve(); pre.connect(ws); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = .55 + dist * .5; ws.connect(bp); n = bp; }   // an overdriven headset mic: clipped and boxy
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
    const g = ac.createGain(); g.gain.value = gain; n.connect(g); n = g; s.gainNode = g;
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
    n.connect(VOICE[file] && voBus ? voBus : master); s.start(at, off, dur);
    if (key) { if (playing[key]) try { playing[key].stop(at); } catch (e) {} playing[key] = s; }
    return s;
  }
  function squelch(at, g) { noise(at, .07, 3200, 2200, .12 * g, 'bandpass'); }
  function hiss(at, dur, g) { const s = ac.createBufferSource(); s.buffer = nb; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = .7; const a = ac.createGain(); a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(.035 * g, at + .03); a.gain.setValueAtTime(.035 * g, at + dur); a.gain.linearRampToValueAtTime(0, at + dur + .05); s.connect(f); f.connect(a); a.connect(master); s.start(at, Math.random()); s.stop(at + dur + .1); }
  const PAN = { CDR: 0, GNR: .35, LDR: -.4, DRV: -.15 }, VOICE = { cdr: 1, gnr: 1, ldr: 1, drv: 1, panic: 1, mod: 1 };
  // the user's sound pack: used for panic, hits, wounds and screams, and for a few plain calls it has good takes of
  let pack = true; const modClip = (who, tag) => { if (!pack || !VI || !VI.m || !VB.mod) return null; const L = (VI.m[who] || {})[tag]; if (!L || !L.length) return null; const c = L[Math.floor(Math.random() * L.length)]; return ['mod', c[0], c[1]]; };
  const MISC = who => who === 'LDR' ? [[/^Up|^UP|Sabot loaded|SABOT/, 'loaded']] : who === 'CDR' ? [[/^Fire\W*$|^FIRE! FIRE!$/, 'fire'], [/^Target[.!] Cease|BURNING/, 'destroyed']] : who === 'GNR' ? [[/^Target|GOT IT/, 'destroyed'], [/^Identified|I SEE IT|I GOT HIM/, 'enemy']] : [];
  function scream(kind, at, gain, pan, lp) { if (!VI || !VI.s || !VI.s[kind]) return; const L = VI.s[kind], c = L[Math.floor(Math.random() * L.length)]; clip('screams', c[0], c[1], at, gain, pan, lp); }
  const T = () => ac.currentTime;
  let PANNOW = 0;
  function noise(at, dur, f0, f1, g, type, buf) { const s = ac.createBufferSource(); s.buffer = buf || nb; const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur); const a = ac.createGain(); a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(g, at + .006); a.gain.exponentialRampToValueAtTime(.0005, at + dur); s.connect(f); f.connect(a); if (PANNOW && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = PANNOW; a.connect(p); p.connect(master); } else a.connect(master); s.start(at, Math.random() * 1.5); s.stop(at + dur + .05); }
  function tone(at, dur, f0, f1, g, type) { const o = ac.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), at + dur); const a = ac.createGain(); a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(g, at + .01); a.gain.exponentialRampToValueAtTime(.0005, at + dur); o.connect(a); a.connect(master); o.start(at); o.stop(at + dur + .05); }
  // distance sets loudness, muffling and the delay before the sound arrives (343 m/s, scaled by the playback speed)
  function boom(dist, size, rate, pan, delay) { if (!ac || !on) return; if (size < 1 && T() < lastBoom + .22) return; lastBoom = T(); const at = T() + (delay || 0) + Math.min(12, dist / 343 / Math.max(rate, .25)), att = 1 / (1 + dist / 120) * (inside && hatch ? .8 : 1), f = (300 + 4200 * att) * (inside && hatch ? .5 : 1); PANNOW = pan || 0;
    noise(at, .9 + size * 1.4, f * (1 + size), 60, Math.min(1.6, size * (.25 + 2.2 * att)), 'lowpass'); tone(at, .6 + size * .6, 70 + 30 * att, 28, Math.min(1, size * (.3 + 1.6 * att)), 'sine');
    if (att > .2) noise(at, .25, 6000, 900, .5 * att * size, 'highpass'); PANNOW = 0; }
  // HKOI's 30 mm chain gun: a slow, heavy thump with the clatter of the feed, quite unlike the main gun or Trophy
  function gun() { if (!ac || !on) return; const at = T(), k = inside ? .8 : 1; tone(at, .2, 96, 38, .8 * k); noise(at, .07, 3600, 500, .6 * k, 'bandpass'); noise(at + .012, .42, 520, 60, .4 * k); noise(at + .06, .05, 6800, 4200, .22 * k, 'bandpass'); noise(at + .13, .04, 5200, 3000, .14 * k, 'bandpass'); }
  function aps() { if (!ac || !on) return; const at = T(); noise(at, 1.1, 7000, 70, 1.6); tone(at, .5, 95, 30, 1.2); noise(at, .12, 9000, 3000, .8, 'highpass'); }
  function hit(killing) { if (!ac || !on) return; const at = T(); noise(at, killing ? 3.2 : 1.6, 8000, 40, 2.2); tone(at, 1.4, 60, 22, 1.6); noise(at + .05, .5, 3000, 2000, .6, 'bandpass');
    const lp = inside ? 0 : 2600, g = inside ? 1.1 : .75;
    if (killing) { for (let i = 0; i < 9; i++) noise(at + .3 + i * (.15 + Math.random() * .3), .25, 2500 + Math.random() * 3000, 400, .35);
      noise(at + .4, 7, 900, 300, .5, 'lowpass', bb);   // the fire taking hold
      for (const [w, dl] of [['CDR', .35], ['GNR', .9], ['LDR', 1.7]]) { const sc = modClip(w, 'scream'); if (sc) clip('mod', sc[1], sc[2], at + dl, g * .9, PAN[w] || 0, lp, null, 1, .3); }
      scream('pain', at + .12, g, .35, lp); scream('scream', at + .45, g, -.45, lp); scream('scream', at + 1.2, g * .9, .6, lp); scream('pain', at + 2.1, g * .8, -.2, lp); scream('scream', at + 3.0, g * .7, .1, lp); }
    else { scream('grunt', at + .08, g, .3, lp); scream('pain', at + .45, g * .9, -.35, lp); } }
  // what a man blurts out on his own when it gets too much: keyed to that crewman's own stress, not to the script
  const lastCue = {};
  let hotEnd = 0;
  function panicCue(who, tag, stress, delay) { if (!ac || !on || !voices || !VI || !VI.p || !VB.panic) return false; const L = (VI.p[who] || {})[tag] || []; if (!L.length && !modClip(who, tag)) return false; const now = T(), st = stress == null ? 90 : stress;
    const gapMan = tag === 'urge' ? 7 : 3.5, gapAny = tag === 'panic' ? (st >= 90 ? 1.5 : 2.3) : tag === 'urge' ? 4 : .35;
    if ((lastCue[who] || -9) > now - gapMan || (lastCue.any || -9) > now - gapAny) return false;
    const at = Math.max(now + .03 + (delay || 0), hotEnd + .12, (spk[who] || 0) + .1); if (at - now > 1.6 + (delay || 0)) return false;       // one blurt at a time on this layer; the man himself must have finished speaking
    const mc = Math.random() < .8 ? modClip(who, tag === 'urge' ? 'panic' : tag) : null, c0 = L.length ? L[Math.floor(Math.random() * L.length)] : null, c = mc ? [mc[1], mc[2]] : c0, file = mc ? 'mod' : 'panic';
    if (!c) return false;
    const under = chanEnd > at + .15 && chanWho !== who, pr = mc ? 1 : 1.04 + Math.max(0, st - 60) / 40 * .08, d = c[1] / pr;
    lastCue[who] = at; lastCue.any = at; hotEnd = at + d; noise(at - .18, .16, 1500, 900, under ? .08 : .14, 'bandpass');
    const pan = (PAN[who] || 0) + (under ? (who === 'CDR' ? .5 : Math.sign(PAN[who] || 1) * .35) : 0);
    live[who] = clip(file, c[0], c[1], at, (under ? .72 : 1.2) * (who === station ? 1.1 : 1), Math.max(-1, Math.min(1, pan)), under ? 2600 : 0, null, pr, mc ? .3 : st >= 81 || tag === 'wound' ? .8 : .35);
    spk[who] = at + d; if (!under) { chanEnd = Math.max(chanEnd, at + d); chanWho = who; } duckT = Math.max(duckT, at + d); if (tag === 'wound') { const sc = modClip(who, 'scream'); if (sc && st >= 70) { clip('mod', sc[1], sc[2], at + d + .15, inside ? .9 : .5, PAN[who] || 0, inside ? 0 : 2600, null, 1, .3); hotEnd = at + d + .15 + sc[2]; duckT = Math.max(duckT, hotEnd); } else scream('pain', at + d + .1, inside ? .85 : .5, PAN[who] || 0, inside ? 0 : 2600); } return true; }
  function flinch() { if (!ac || !on || Math.random() < .4) return; scream('grunt', T() + .05, inside ? .7 : .45, (Math.random() - .5) * .8, inside ? 0 : 2600); }
  // ragged breathing on the hot mic once the crew is frightened
  function breath(stress) { if (stress < 60) return; const now = T(); if (now < breathAt || now < duckT + .3) return; const k = Math.min(1, (stress - 60) / 35), per = 1.5 - k * .85; breathAt = now + per * (.85 + Math.random() * .3);
    const g = (inside ? .15 : .08) * (.4 + .6 * k); noise(now, per * .38, 1900, 1100, g, 'bandpass'); noise(now + per * .45, per * .42, 1300, 700, g * 1.2, 'bandpass'); }
  function passby(dist, pan, rate) { if (!ac || !on) return; const at = T(), g = Math.min(1, 6 / Math.max(2, dist)); PANNOW = pan || 0;
    noise(at, .55, 5200, 600, .9 * g, 'bandpass'); noise(at + .05, .9, 1400, 120, .6 * g, 'lowpass', bb); tone(at, .4, 420, 140, .25 * g, 'sawtooth'); PANNOW = 0;
    boom(320, .8, rate, -(pan || 0) * .6, 1.2 / Math.max(rate, .25)); }
  function launch(dist, rate, pan) { boom(dist, .55, rate, pan); }
  function heart(stress) { if (!ac || !on || stress < 55) return; const now = T(); if (now < duckT + .3) return; const per = 60 / (66 + (stress - 45) * 1.6); if (now < beatAt) return; beatAt = now + per; const g = .14 + (stress - 45) / 55 * .34; tone(now, .16, 62, 40, g); tone(now + .17, .14, 55, 36, g * .7); }
  function bed(speed, alarm, stress, inCab, tti) { if (!ac) return; const now = T(); inside = inCab; if (duckG) duckG.gain.setTargetAtTime(now < duckT + .1 ? .42 : 1, now, .07); engG.gain.setTargetAtTime(on ? (.12 + Math.min(1, speed / 6) * .22) * (inCab ? 1.6 : 1) * (now < duckT ? .6 : 1) : 0, now, .15); engO.frequency.setTargetAtTime(28 + speed * 4, now, .3); engF.frequency.setTargetAtTime(inCab ? 220 : 140 + speed * 25, now, .3); if (whG) { whG.gain.setTargetAtTime(on ? (inCab ? .012 : .022) * (.6 + Math.min(1, speed / 10)) : 0, now, .2); whO.frequency.setTargetAtTime(1750 + speed * 45, now, .4); whO2.frequency.setTargetAtTime(2 * (1750 + speed * 45) + 20, now, .4); }
    warnG.gain.setTargetAtTime(on && alarm ? (inCab ? .13 : .07) : 0, now, .03); heart(stress); if (on) breath(stress);
    if (trkG) { trkG.gain.setTargetAtTime(on ? Math.min(1, speed / 8) * (inCab ? .1 : .16) * (now < duckT ? .6 : 1) : 0, now, .2); trkL.frequency.setTargetAtTime(4 + speed * 2.6, now, .3); }
    // inbound tone: pips that close up as the nearest threat closes in; louder and higher as the crew's stress climbs
    if (on && tti != null && tti > 0 && tti < 10 && now >= inbAt) { const per = Math.max(.2, Math.min(.8, tti / 7)), g = (inCab ? .05 : .03) * (now < duckT + .1 ? .3 : 1), f0 = 1300 + (10 - tti) * 60; inbAt = now + per; tone(now, Math.min(.08, per * .4), f0, f0 * .98, g, 'sine'); } }
  const keyOf = q => { let t = q.text; if (q.lvl === 0) t = t.replace(/^(\d+) went wide\. .*$/, '$1 went wide.'); return `${q.who}|${q.lvl}|${t}`; };
  // Intercom turn-taking. Calm: a crewman waits for the channel to clear, so it flows like drill.
  // Stressed: people start before the last man has finished. Panic: they talk over each other and cut each other off ("step on" the net),
  // speak a little faster, gasp before they shout. Lines that would come out too late to mean anything are dropped, never queued.
  const spk = {}, live = {}; let chanEnd = 0, chanWho = null, duckT = 0;
  function say(line, rate, stress) {
    if (!ac || !on || !voices || !VI || rate > 2) return; let c = VI.v[keyOf(line)]; if (line.cue && VI.p) { const e = ((VI.p[line.who] || {})[line.cue] || []).find(q => q[2] === line.text); c = e ? ['panic', e[0], e[1]] : null; } else if (c && Math.random() < .7) { for (const [re, tg] of MISC(line.who)) if (re.test(line.text || '')) { const m = modClip(line.who, tg); if (m) c = m; break; } } if (!c || !VB[c[0]]) return;
    const st = stress == null ? [20, 65, 90][line.lvl] : stress, now = T(), lvl = line.lvl, who = line.who, pr = 1 + .045 * lvl + Math.max(0, st - 40) / 60 * .03 + (Math.random() - .5) * .01, d = c[2] / pr;
    const urgent = /o.clock|hit|tank|smoke|fire/i.test(line.text || ''), ack = c[2] < 1.15 && (who === 'DRV' || who === 'LDR' || who === 'GNR');
    if (ack && st > 80 && Math.random() < .3) return;                                   // under heavy stress some short acknowledgements are never said
    const at = Math.max(now + .03, chanEnd + .09);                                       // wait for the channel: one voice at a time
    if (at - now > (urgent ? 2.4 : ack ? .6 : 1.3)) return;                              // too stale to say; warnings wait longest
    if (at - chanEnd > .5 || chanWho !== who) squelch(at - .02, 1);
    hiss(at, d + .05, 1 + lvl * .4);
    live[who] = clip(c[0], c[1], c[2], at + .02, (lvl === 2 ? 1.25 : lvl ? 1.1 : 1.0) * (who === station ? 1.12 : 1), PAN[who] || 0, 0, null, pr, lvl === 2 ? .7 : lvl === 1 ? .25 : 0);
    spk[who] = at + d; chanEnd = at + d; chanWho = who; lastAny = at + d; duckT = Math.max(duckT, at + d);
  }
  // the platoon net: other tanks' radio traffic, quiet and further down in the mix, on the second radio
  function net(i, rate, stress) { if (!ac || !on || !voices || !VI || !VI.n || rate > 2) return; if (stress > 80 && Math.random() < .7) { squelch(T() + .02, .4); return; }   // in a panic nobody hears the other tanks
    const c = VI.n[i]; if (!c || !VB.net) return; const at = T() + .02; squelch(at, .5); hiss(at, c[1] + .1, .7); if (chanEnd > at + .2 && Math.random() < .6) return; clip('net', c[0], c[1], at + .06, at < duckT ? .25 : .42, .45, 0, 'NET'); squelch(at + c[1] + .1, .4); }
  return { set hatch(v) { hatch = v; }, set station(v) { station = v; }, net, start, boom, passby, gun, aps, hit, flinch, panicCue, enemySay, fpv, clank, launch, bed, say, get on() { return on; }, set on(v) { on = v; if (outG) outG.gain.setTargetAtTime(v ? .9 : 0, ac.currentTime, .05); }, set voices(v) { voices = v; }, set enemyView(v) { setEnemyView(v); }, get ruState() { return { index: !!(VI && VI.r), buf: !!VB.ru, said: ruN }; }, set pack(v) { pack = !!v; }, get hasPack() { return !!(VI && VI.m && VB.mod); }, get ready() { return !!ac; } };
})();
