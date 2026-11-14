// The crew's intercom and the radio net: recorded human voices only (no machine speech), played the way a crew talks.
//
//  - One line at a time. Lines wait their turn in a queue; each has a priority and a time after which it is stale.
//    A stale line is dropped, never played late. A warning cuts in over routine talk.
//  - Every transmission is keyed: a click as the microphone opens, the hiss of an open line, a click as it closes
//    (the radio net ends with a short burst of squelch noise instead).
//  - Voices are band-limited and slightly saturated like a vehicle intercom; the radio net is narrower and rougher.
//  - The same take is never used twice running when another exists; the take is chosen by how tense the moment is.
//  - Heard only from the crew's own seats. From outside the vehicle the net is silent (the queue still runs, so the
//    conversation is in the right place when the view changes).
//
// The clips come from the owner's crew voice pack through tools/audio/build_crew.py: one sound file per speaker and
// assets/crew3_index.json = { strips: { key: file }, e: { WHO: { event: [[strip, start s, length s, level 0..2, clip, words], ...] } } }.

// Playback speed per speaker. ASSUMPTION: measurements could not separate distinct voice actors in the pack (it may be
// one or two people), so each crewman is played a few percent slower or faster to help tell them apart. 1 = untouched.
export const VOICE_RATE = { CDR: 1.0, GNR: 0.975, LDR: 1.03, DRV: 0.955, ANY: 1.0, HQ: 1.0 };

const rnd = (a, b) => a + Math.random() * (b - a);
// how much a frightened man's delivery is pushed at stress 1 (see Intercom._start): speed, level, and the tremble from "shaken" up
export const STRESS = { rate: 0.06, gain: 0.41, tremble: 0.25, breakFrom: 0.38 };   /* gain 0.41 = +3 dB; breakFrom 0.38 = stress 0.60, the "shaken" line */

export class Intercom {
  constructor(mix) {
    const c = this.ctx = mix.ctx; this.mix = mix;
    this.index = null; this.bufs = {}; this.ready = false;
    this.queue = []; this.cur = null; this.freeAt = 0; this.lastClip = {}; this.lastAsk = {};
    this.said = []; this.dropped = [];        // what was spoken and what was dropped (for tests and for the report)
    this.listening = false; this.vol = 1;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(mix.bus.voices.direct);
    // What gets out of the vehicle: a listener standing close hears the men's own voices (not the intercom) low and dull
    // through the armour. A shout carries about 40 m, a calm word about 16 m; beyond that, nothing. The radio net is in
    // their headsets only and does not leak at all.
    this.leakIn = c.createGain(); this.leakGain = c.createGain(); this.leakGain.gain.value = 0;
    { const a = c.createBiquadFilter(), b = c.createBiquadFilter(); a.type = 'lowpass'; a.frequency.value = 520; b.type = 'lowpass'; b.frequency.value = 800; this.leakIn.connect(a); a.connect(b); b.connect(this.leakGain); this.leakGain.connect(mix.bus.voices.air); }
    this.crew = this._chain({ lo: 300, hi: 3300, peakF: 1900, peakDb: 5, drive: 1.5, level: 0.65 });
    this.radio = this._chain({ lo: 480, hi: 2600, peakF: 1300, peakDb: 6, drive: 2.4, level: 0.6 });
    // the hiss of an open line: only while somebody is keyed
    this.hiss = mix.bed('voices', { direct: true, color: 'white', type: 'bandpass', f: 2100, q: 0.5 });
    this.hiss.g.disconnect(); this.hiss.g.connect(this.out);
  }
  // high-pass, presence peak, low-pass, a fast compressor (a throat microphone has no dynamics), soft saturation
  _chain({ lo, hi, peakF, peakDb, drive, level }) {
    const c = this.ctx, mk = (type, f, q = 0.7, gain = 0) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
    const input = c.createGain(), hp1 = mk('highpass', lo), hp2 = mk('highpass', lo * 0.9), pk = mk('peaking', peakF, 1.1, peakDb), lp1 = mk('lowpass', hi), lp2 = mk('lowpass', hi * 1.15);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.12;
    const sh = c.createWaveShaper(), cv = new Float32Array(513);
    for (let k = 0; k < 513; k++) { const x = k / 256 - 1; cv[k] = Math.tanh(x * drive) / Math.tanh(drive); }
    sh.curve = cv; const post = mk('lowpass', hi * 1.3), g = c.createGain(); g.gain.value = level;
    input.connect(hp1); hp1.connect(hp2); hp2.connect(pk); pk.connect(lp1); lp1.connect(lp2); lp2.connect(comp); comp.connect(sh); sh.connect(post); post.connect(g); g.connect(this.out);
    return { in: input };
  }

  // get(url) -> promise of an ArrayBuffer or null
  async load(base, get) {
    if (this.index || !base) return;
    let idx = null;
    for (const name of ['crew4_index.json', 'crew3_index.json']) {   /* crew4: four re-voiced men and the made lines; crew3: the pack as it is */   /* the second is the first cut of the same human pack */
      try { const a = await get(base + name); if (a) { const j = JSON.parse(new TextDecoder().decode(a)); if (j && j.e && j.strips) { idx = j; break; } } } catch (e) { /* try the next */ }
    }
    if (!idx) return; this.index = idx;
    /* the overlay of hit calls (tools/audio/build_panic.py: the pack's fire calls and each man's scream, in the crew4 voices) */
    if (idx.revoiced) try { const a = await get(base + 'crewpanic_index.json'), o = a ? JSON.parse(new TextDecoder().decode(a)) : null;
      if (o && o.e && o.strips) { Object.assign(idx.strips, o.strips); for (const w in o.e) { const E = idx.e[w] || (idx.e[w] = {}); for (const ev in o.e[w]) E[ev] = (E[ev] || []).concat(o.e[w][ev]); } } } catch (e) { /* no overlay: those lines stay silent */ }
    await Promise.all(Object.keys(idx.strips).map(async k => {
      try { const a = await get(base + idx.strips[k]); if (a) this.bufs[k] = await this.ctx.decodeAudioData(a); } catch (e) { /* that speaker stays silent */ }
    }));
    this.ready = true;
  }
  takes(who, ev) { const L = this.index && this.index.e[who] && this.index.e[who][ev]; return L && L.length && this.bufs[L[0][0]] ? L : null; }
  has(who, ev) { return !!this.takes(who, ev); }
  // from the crew's seats the net is heard; from anywhere else it is not
  listen(on) { if (on === this.listening) return; this.listening = on; this.out.gain.setTargetAtTime(on ? this.vol : 0, this.ctx.currentTime, 0.04); }
  // from an outside view `dist` metres from the vehicle (on = an outside view near enough to matter)
  leak(dist, on) {
    const lv = this.cur ? this.cur.level || 0 : 0, range = 16 + 12 * lv, k = on ? Math.max(0, 1 - dist / range) : 0, v = Math.pow(k, 1.5) * (0.3 + 0.2 * lv);
    if (Math.abs(v - (this._leak || 0)) < 0.002) return; this._leak = v; this.leakGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  // the intercom volume knob inside the vehicle: 1 = the normal setting
  level(v) { v = Math.max(0, Math.min(1.4, v)); if (Math.abs(v - this.vol) < 0.01) return; this.vol = v; if (this.listening) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04); }

  // Ask for a line. pri: 0 routine (reports), 1 normal, 2 urgent, 3 warning or casualty. ttl: seconds it may wait before it is stale.
  // delay: seconds before it may start. group: lines that belong together (when one is cut or dropped, the rest go too).
  // Returns false when the pack has no such line (the caller then knows the crewman stays silent).
  // needs: 'WHO.event' of the line this one answers (a driver's "Roger" is only said if the order was in fact spoken).
  // stress: the man's own stress 0..1 (src/battle/crew.js); above "strained" his delivery is pushed (see _start).
  request(who, ev, { level = 1, pri = 1, ttl = 1.5, delay = 0, group = null, gap = null, needs = null, stress = 0 } = {}) {
    if (!this.takes(who, ev)) return false;
    const now = this.ctx.currentTime, key = who + '.' + ev;
    if (this.lastAsk[key] != null && now - this.lastAsk[key] < 4) return true;   /* just asked for: once is enough */
    this.lastAsk[key] = now;
    this.queue.push({ who, ev, level, pri, due: now + delay, dead: now + delay + ttl, group, gap, needs, asked: now, stress });
    return true;
  }
  flush(note = 'flushed') { for (const q of this.queue) this.dropped.push({ who: q.who, ev: q.ev, why: note }); this.queue.length = 0; if (this.cur) this._cut(this.ctx.currentTime); }
  _dropGroup(group, why) { if (!group) return; this.queue = this.queue.filter(q => { if (q.group !== group) return true; this.dropped.push({ who: q.who, ev: q.ev, why }); return false; }); }

  // every frame
  update() {
    const now = this.ctx.currentTime;
    if (this.cur && now >= this.cur.end) { this.freeAt = this.cur.end + (this.cur.gapAfter || 0.3); this.cur = null; }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]; if (!q || now <= q.dead) continue;   /* dropping a group below can shorten the queue under this loop */
      this.queue.splice(i, 1); this.dropped.push({ who: q.who, ev: q.ev, why: 'stale' }); this._dropGroup(q.group, 'stale group');
    }
    let best = null;
    for (let i = this.queue.length - 1; i >= 0; i--) {   /* an answer waits for the line it answers; if that line was never spoken, the answer goes too */
      const q = this.queue[i]; if (!q.needs) continue;
      const waiting = (this.cur && this.cur.who + '.' + this.cur.ev === q.needs) || this.queue.some(x => x.who + '.' + x.ev === q.needs);
      if (waiting) { q.hold = true; continue; }
      q.hold = false;
      if (!this.said.some(x => x.who + '.' + x.ev === q.needs && !x.cut && now - x.end < 8)) { this.queue.splice(i, 1); this.dropped.push({ who: q.who, ev: q.ev, why: 'the line it answers was not spoken' }); }
    }
    for (const q of this.queue) if (q.due <= now && !q.hold && (!best || q.pri > best.pri || (q.pri === best.pri && q.asked < best.asked))) best = q;
    if (!best) return;
    if (this.cur) { if (best.pri - this.cur.pri >= 2) { this._dropGroup(this.cur.group, 'cut'); this._cut(now); } return; }   /* the new line starts on a later frame, after a breath */
    if (now < this.freeAt && best.pri < 2) return;
    this.queue.splice(this.queue.indexOf(best), 1); this._start(best, now);
  }
  // which take: nearest to how tense the moment is, never the one used last time, and not the one before that either
  // when there are three or more to choose from
  _pick(who, ev, level) {
    const L = this.takes(who, ev), key = who + '.' + ev, used = this.lastClip[key] || (this.lastClip[key] = []);
    const fresh = L.filter(x => x[4] !== used[0] && (L.length < 3 || x[4] !== used[1]));
    let pool = fresh.length ? fresh : L, d = 9;
    for (const x of pool) d = Math.min(d, Math.abs(x[3] - level));
    pool = pool.filter(x => Math.abs(x[3] - level) === d);
    const x = pool[Math.floor(Math.random() * pool.length)]; used.unshift(x[4]); used.length = Math.min(used.length, 2); return x;
  }
  _start(q, now) {
    const c = this.ctx, x = this._pick(q.who, q.ev, q.level), net = q.who === 'HQ' ? this.radio : this.crew, isRadio = q.who === 'HQ';
    // Stress in the delivery, on top of the take chosen for his level. k: 0 at "strained" (0.35) and below, 1 at stress 1.
    // ASSUMPTIONS (nobody has listened): a frightened man talks faster and higher (up to +6% speed, which also raises the pitch about
    // one semitone), louder (up to +3 dB) and his voice breaks (a 7 to 11 Hz tremble in level, up to +-25%, from "shaken" up).
    const k = Math.max(0, Math.min(1, ((q.stress || 0) - 0.35) / 0.65)), push = q.who === 'HQ' ? 0 : k;
    const rate = (this.index.revoiced ? 1 : VOICE_RATE[q.who] || 1) * (1 + STRESS.rate * push),   /* re-voiced strips already differ per man */
      t0 = now + 0.02, tClip = t0 + 0.07, len = x[2] / rate, tEnd = tClip + len;
    const line = c.createGain(); line.gain.value = 1; line.connect(net.in);
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = this.bufs[x[0]]; s.playbackRate.value = rate; g.gain.value = rnd(0.9, 1.1) * (1 + STRESS.gain * push);
    s.connect(g); g.connect(line); if (!isRadio) g.connect(this.leakIn); s.start(tClip, x[1], x[2]);
    if (push > STRESS.breakFrom) { const lfo = c.createOscillator(), d = c.createGain(); lfo.frequency.value = rnd(7, 11); d.gain.value = STRESS.tremble * (push - STRESS.breakFrom) / (1 - STRESS.breakFrom) * g.gain.value; lfo.connect(d); d.connect(g.gain); lfo.start(tClip); lfo.stop(tClip + len + 0.1); }
    this._click(line, t0, isRadio ? 0.5 : 0.35, isRadio);                         /* key down */
    if (isRadio) this.mix.noise(line, tEnd + 0.03, { dur: 0.09, attack: 0.004, hold: 0.05, type: 'bandpass', f0: 1700, q: 0.4, gain: 0.5 });   /* squelch tail */
    else this._click(line, tEnd + 0.05, 0.25, false);                             /* key up */
    const h = this.hiss.g.gain, hv = isRadio ? 0.03 : 0.012, tOff = tEnd + (isRadio ? 0.12 : 0.06);   /* the open line hisses; explicit ramps only (one audio engine mishandles chained targets here) */
    h.cancelScheduledValues(t0); h.setValueAtTime(0, t0); h.linearRampToValueAtTime(hv, t0 + 0.02); h.setValueAtTime(hv, tOff); h.linearRampToValueAtTime(0, tOff + 0.04);
    const end = tEnd + (isRadio ? 0.2 : 0.1);
    this.cur = { who: q.who, ev: q.ev, pri: q.pri, level: q.level, group: q.group, line, src: s, end, gapAfter: q.gap != null ? q.gap : rnd(0.22, 0.5) };
    this.said.push({ t: tClip, end: tEnd, who: q.who, ev: q.ev, clip: x[4], text: x[5], made: x[6] || '', pri: q.pri, level: q.level, stress: +(q.stress || 0).toFixed(2), waited: +(now - q.asked).toFixed(2) });
    if (this.said.length > 400) this.said.splice(0, 100);
  }
  // somebody more important keys his microphone: the speaker is cut off in mid-word
  _cut(now) {
    const k = this.cur; if (!k) return;
    k.line.gain.cancelScheduledValues(now); k.line.gain.setValueAtTime(1, now); k.line.gain.linearRampToValueAtTime(0, now + 0.04);
    try { k.src.stop(now + 0.08); } catch (e) { /* already ended */ }
    this.hiss.g.gain.cancelScheduledValues(now); this.hiss.g.gain.setValueAtTime(0, now + 0.04);
    const last = this.said[this.said.length - 1]; if (last && last.end > now) { last.end = now; last.cut = true; }
    this.cur = null; this.freeAt = now + 0.12;
  }
  _click(dest, when, gain, radio) {
    this.mix.noise(dest, when, { dur: 0.012, attack: 0.0005, type: 'bandpass', f0: radio ? 1500 : 2300, q: 2.5, gain });
    this.mix.tone(dest, when, { f0: radio ? 900 : 1400, f1: 500, dur: 0.01, gain: gain * 0.5, attack: 0.0005 });
  }
}
