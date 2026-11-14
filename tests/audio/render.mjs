// Render the simulator's sound to WAV files without a browser or loudspeakers, so it can be measured (nobody can listen
// in the workspace). It runs the REAL sound code (src/audio/*.js) on an offline audio context.
//
//   node tests/audio/render.mjs <folder holding node_modules/node-web-audio-api> <assets folder> <out folder> [scene ...]
//   (npm install node-web-audio-api  in any scratch folder; it is not a dependency of the simulator itself)
//
// Scenes: fx       every one-shot sound alone, at several distances, inside and outside  -> fx_<name>.wav
//         beds     the continuous layers: engine by speed, tracks, turret, weather, drones  -> bed_<name>.wav
//         talk     scripted intercom exchanges                                             -> talk_<name>.wav + .json (what was said, when)
//         compare  a short scene that tests/beta/sound.py renders in Chrome too         -> node_compare.wav
//         battle   three minutes of a real battle (the battle layer run in node), heard from the gunner's seat and from
//                  outside, plus one render per bus on its own                              -> battle_<view>[_<bus>].wav + .json
// tests/audio/analyse.py measures the files and draws the spectrograms.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const [, , MODS, ASSETS, OUT, ...want] = process.argv;
const require = createRequire(import.meta.url), here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '../..');
const WA = require(path.join(MODS, 'node_modules/node-web-audio-api'));
const { Sound } = await import(path.join(root, 'src/audio/sound.js'));
const { BUSES } = await import(path.join(root, 'src/audio/mixer.js'));
const SR = 44100, STEP = 1 / 30;
fs.mkdirSync(OUT, { recursive: true });

// repeatable "random" numbers, so two renders of a scene differ only where the scene differs
function seedRandom(seed) { let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const readFile = async url => { try { const b = fs.readFileSync(url); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } catch (e) { return null; } };

function writeWav(file, buf) {
  const n = buf.length, ch = buf.numberOfChannels, d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
  const out = Buffer.alloc(44 + n * ch * 2); out.write('RIFF', 0); out.writeUInt32LE(36 + n * ch * 2, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(ch, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * ch * 2, 28); out.writeUInt16LE(ch * 2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * ch * 2, 40);
  let over = 0, o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { let x = d[c][i]; if (Math.abs(x) > 1) { over++; x = Math.sign(x); } out.writeInt16LE(Math.round(x * 32767), o); o += 2; }
  fs.writeFileSync(file, out); return over;
}

// One render. setup(sound) runs before time starts; acts = [[seconds, sound => ...]]; state(t) = what update() is given
// each thirtieth of a second (null: update is not called, so no continuous layer sounds).
async function render(name, seconds, { setup, prepare, acts = [], state = null, voices = false, seed = 1, solo = null } = {}) {
  seedRandom(seed);
  const ctx = new WA.OfflineAudioContext(2, Math.ceil(seconds * SR), SR), sound = new Sound();
  sound._get = readFile; sound.start(ctx);
  if (voices) await sound.loadVoices(ASSETS.replace(/\/?$/, '/'));
  if (solo) for (const b of BUSES) if (b !== solo) sound.mix.setBus(b, 0);
  if (prepare) await prepare(sound);
  if (setup) setup(sound);
  if (process.env.RAW) { sound.mix.sum.disconnect(); sound.mix.sum.connect(ctx.destination); }   /* RAW=1: skip the limiter, to see how hard it would have to work */
  const list = acts.slice().sort((a, b) => a[0] - b[0]); let k = 0, refused = 0;   /* the offline context refuses a few pause points; that frame's update is simply skipped */
  // Pause the render every thirtieth of a second and do what the page's frame loop would do. All pauses are booked before
  // the render starts. The offline engine can refuse a pause on a busy machine; such a frame's actions run at the next one,
  // so a render with many refusals is not trustworthy: it is reported, and tests/audio/check.py reads the report.
  const frame = t => {
    try { while (k < list.length && list[k][0] <= t) list[k++][1](sound, t); if (state) { const st = state(t, sound); if (st) sound.update(STEP, st); } } catch (e) { console.log('ERROR in scene', name, 'at', t.toFixed(2), e.stack || e); process.exitCode = 1; }
  };
  for (let n = 1; n * STEP < seconds - 2 * STEP; n++) { const t = n * STEP; ctx.suspend(t).then(() => { frame(t); ctx.resume(); }).catch(() => { refused++; }); }
  await new Promise(r => setTimeout(r, 30));
  const buf = await ctx.startRendering();
  if (process.env.RAW) { let pk = 0; for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); } console.log('raw peak before the limiter', name.padEnd(36), (20 * Math.log10(pk + 1e-9)).toFixed(1), 'dB'); return sound; }
  const over = writeWav(path.join(OUT, name + '.wav'), buf);
  if (refused) { console.log('NOTE', name, ':', refused, 'pause points were refused by the offline engine (those frames ran late)'); if (refused > 3) { console.log('UNRELIABLE RENDER', name); process.exitCode = 2; } }
  if (over) console.log('CLIPPED', name, over, 'samples over full scale');
  return sound;
}

// ------------------------------------------------------------------ fx: each sound alone
const seat = s => snd => { snd.seat = s; snd.inside = s === 'in'; snd.mix.setSeat(s); snd.icom.listen(s !== 'out'); };
async function fx() {
  const one = (name, sec, s, fn) => render('fx_' + name, sec, { setup: seat(s), acts: [[0.1, fn]] });
  for (const d of [10, 100, 300, 1000, 3000]) await one('gun30_out_' + d + 'm', 2.5 + d / 343 + 2, 'out', x => x.gun30(d));
  await render('fx_gun30_burst_out_10m', 4, { setup: seat('out'), acts: [0, 1, 2, 3, 4].map(i => [0.1 + i * 0.3, x => x.gun30(10)]) });
  await render('fx_gun30_burst_in', 4, { setup: seat('in'), acts: [0, 1, 2, 3, 4].map(i => [0.1 + i * 0.3, x => x.gun30(3)]) });
  await render('fx_gun30_burst_hatch', 4, { setup: seat('hatch'), acts: [0, 1, 2, 3, 4].map(i => [0.1 + i * 0.3, x => x.gun30(3)]) });
  for (const d of [15, 1000]) await one('gun120_out_' + d + 'm', 6 + d / 343, 'out', x => x.gun120(d));
  await one('gun120_in', 4, 'in', x => x.gun120(3));
  await render('fx_mg50_out_20m', 3, { setup: seat('out'), acts: Array.from({ length: 8 }, (_, i) => [0.1 + i * 0.125, x => x.mg(20, true)]) });
  await render('fx_mg762_out_20m', 3, { setup: seat('out'), acts: Array.from({ length: 12 }, (_, i) => [0.1 + i * 0.08, x => x.mg(20, false)]) });
  await render('fx_mg50_in', 3, { setup: seat('in'), acts: Array.from({ length: 8 }, (_, i) => [0.1 + i * 0.125, x => x.mg(3, true)]) });
  await render('fx_mg762_in', 3, { setup: seat('in'), acts: Array.from({ length: 12 }, (_, i) => [0.1 + i * 0.08, x => x.mg(3, false)]) });
  await one('aps_out_12m', 3, 'out', x => x.aps(12)); await one('aps_in', 3, 'in', x => x.aps(3));
  for (const [d, size] of [[30, 0.8], [30, 1.5], [30, 2.2], [600, 1.5], [3000, 1.5]]) await one('explosion_' + d + 'm_size' + size, 5 + d / 343 + 3, 'out', x => x.explosion(d, size));
  await one('explosion_30m_size1.5_inside', 6, 'in', x => x.explosion(30, 1.5));
  await one('airburst_60m', 4, 'out', x => x.airburst(60, 0.5));
  await one('launch_small_400m', 5, 'out', x => x.launch(400, false)); await one('launch_big_2000m', 10, 'out', x => x.launch(2000, true));
  await one('whoosh', 3, 'out', x => x.whoosh(0.5, 0.5));
  await one('hit_inside', 8, 'in', x => x.hit(false));
  await one('hit_penetration_inside', 8, 'in', x => { x.hit(false); x.penetration(1.6); }); await one('nearmiss_inside', 3, 'in', x => x.nearMiss(0.22));
  await one('smoke_out', 4, 'out', x => x.smoke(20)); await one('crackthump_800m', 5, 'out', x => x.crackThump(800, 1100, 8, true));
}

// ------------------------------------------------------------------ beds: the continuous layers
async function beds() {
  const base = { cond: 'day', biome: 'farmland', alive: true, camDist: 25, drones: [], talking: false };
  const drive = t => (t < 3 ? 0 : t < 9 ? (t - 3) / 6 * 11 : t < 14 ? 11 : Math.max(0, 11 - (t - 14) * 3));     /* idle, pull away, cruise, brake */
  const turn = t => (t > 9 && t < 13 ? (t - 9) * 25 : t >= 13 ? 100 : 0);
  for (const view of ['gnr', 'cdr', 'orbit']) await render('bed_drive_' + view, 20, { state: t => ({ ...base, view, speed: drive(t), heading: turn(t), turret: turn(t) }) });
  await render('bed_turret_gnr', 8, { state: t => ({ ...base, view: 'gnr', speed: 0, heading: 0, turret: t > 2 && t < 5 ? (t - 2) * 30 : t >= 5 ? 90 : 0 }) });
  for (const [cond, view] of [['rain', 'gnr'], ['rain', 'orbit'], ['day', 'orbit'], ['night', 'orbit']]) await render('bed_world_' + cond + '_' + view, 30, { seed: 3, state: () => ({ ...base, view, cond, alive: false, speed: 0, heading: 0, turret: 0 }) });
  // a drone coming in from 1200 m at 40 m/s, passing at 5 m and going away
  await render('bed_drone_orbit', 40, { state: t => ({ ...base, view: 'orbit', cond: 'none', alive: false, speed: 0, drones: [{ id: 'a', d: Math.max(5, Math.abs(1200 - 40 * t)) }] }), setup: s => { s.mix.setBus('world', 0); } });
}

// ------------------------------------------------------------------ talk: scripted exchanges on the intercom
async function talk() {
  const st = view => () => ({ view, cond: 'none', alive: false, speed: 0, drones: [], talking: false });
  const save = (name, s) => fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ said: s.icom.said, dropped: s.icom.dropped }, null, 1));
  // a main gun engagement, as the events would drive it
  let s = await render('talk_engagement', 22, { voices: true, state: st('gnr'), setup: x => x.mix.setBus('world', 0), acts: [
    [0.5, x => x.cue('GNR', 'contact', 2)], [2.2, x => x.cue('GNR', 'range_1200', 1)], [4.6, x => x.cue('LDR', 'up', 1)],
    [6.2, x => { x.cue('GNR', 'ontheway', 1, { pri: 2, ttl: 0.7 }); x.gun120(3); }], [8.0, x => x.cue('CDR', 'reengage_doubt', 1)],
    [11.0, x => x.cue('LDR', 'up', 1)], [12.5, x => { x.cue('GNR', 'ontheway', 1, { pri: 2, ttl: 0.7 }); x.gun120(3); }],
    [14.2, x => { x.cue('GNR', 'target', 1); x.cue('CDR', 'cease', 1, { ttl: 3.5 }); }], [17.0, x => { x.cue('CDR', 'moveout', 1, { ttl: 2.5 }); x.cue('DRV', 'ack_fwd', 1, { delay: 0.9, ttl: 6, needs: 'CDR.moveout' }); }],
  ] }); save('talk_engagement', s);
  // the same exchange with no gun, for the speech recogniser
  s = await render('talk_engagement_clean', 22, { voices: true, state: st('gnr'), setup: x => x.mix.setBus('world', 0), acts: [
    [0.5, x => x.cue('GNR', 'contact', 2)], [2.2, x => x.cue('GNR', 'range_1200', 1)], [4.6, x => x.cue('LDR', 'up', 1)], [6.2, x => x.cue('GNR', 'ontheway', 1, { pri: 2, ttl: 0.7 })], [8.0, x => x.cue('CDR', 'reengage_doubt', 1)],
    [11.0, x => x.cue('LDR', 'up', 1)], [12.5, x => x.cue('GNR', 'ontheway', 1, { pri: 2, ttl: 0.7 })], [14.2, x => { x.cue('GNR', 'target', 1); x.cue('CDR', 'cease', 1, { ttl: 3.5 }); }],
    [17.0, x => { x.cue('CDR', 'moveout', 1, { ttl: 2.5 }); x.cue('DRV', 'ack_fwd', 1, { delay: 0.9, ttl: 6, needs: 'CDR.moveout' }); }],
  ] }); save('talk_engagement_clean', s);
  // mission start: the radio net, then the crew report; a hit cuts into a second report
  s = await render('talk_start_and_cut', 40, { voices: true, state: st('gnr'), setup: x => x.mix.setBus('world', 0), acts: [
    [0.5, x => { const o = { pri: 0, ttl: 22, group: 'start' }; x.cue('HQ', 'start', 0, { ...o, ttl: 6 }); x.cue('GNR', 'ready', 0, o); x.cue('LDR', 'ready', 0, o); x.cue('DRV', 'ready', 0, o); x.cue('CDR', 'redcon', 0, o); }],
    [24, x => { const o = { pri: 0, ttl: 22, group: 'again' }; x.cue('GNR', 'ready', 0, o); x.cue('LDR', 'ready', 0, o); x.cue('DRV', 'ready', 0, o); x.cue('CDR', 'redcon', 0, o); }],
    [25.2, x => { x.react('CDR', 'hit'); x.cue('ANY', 'wound', 2, { pri: 3, ttl: 3 }); x.cue('CDR', 'loader_down', 2, { pri: 2, ttl: 6 }); }],
    [33, x => x.cue('HQ', 'end_won', 0, { ttl: 8 })],
  ] }); save('talk_start_and_cut', s);
  // the same line asked for again and again: the take must change
  s = await render('talk_repeats', 30, { voices: true, state: st('gnr'), setup: x => x.mix.setBus('world', 0), acts: Array.from({ length: 6 }, (_, i) => [0.5 + i * 4.6, x => { x.cue('GNR', 'ontheway', 1); x.cue('LDR', 'up', 1, { delay: 2, ttl: 3 }); }]) }); save('talk_repeats', s);
  // from outside the vehicle the crew is not heard
  s = await render('talk_from_outside', 8, { voices: true, state: st('orbit'), setup: x => x.mix.setBus('world', 0), acts: [[0.5, x => x.cue('GNR', 'ready', 0)], [4, x => x.cue('CDR', 'cease', 1)]] }); save('talk_from_outside', s);
  // every clip of the release list once, one a second and a half apart, for the speech recogniser (crew3_index.json)
  const idx = JSON.parse(fs.readFileSync(path.join(ASSETS, 'crew3_index.json'), 'utf8')), all = [];
  for (const who in idx.e) for (const ev in idx.e[who]) idx.e[who][ev].forEach((x, i) => all.push([who, ev, i, x]));
  let tt = 0.3; const plan = all.map(a => { const at = tt; tt += a[3][2] / 0.95 + 0.9; return [at, a]; });
  s = await render('talk_every_clip', tt + 1, { voices: true, state: st('gnr'), setup: x => x.mix.setBus('world', 0), acts: plan.map(([at, a]) => [at, x => { x.icom.lastAsk = {}; const L = x.icom.index.e[a[0]][a[1]]; x.icom.lastClip[a[0] + '.' + a[1]] = []; const keep = L.slice(); L.length = 0; L.push(keep[a[2]]); x.cue(a[0], a[1], keep[a[2]][3], { ttl: 0.5 }); x.icom.update(); L.length = 0; keep.forEach(k => L.push(k)); }]) });
  save('talk_every_clip', s);
}

// ------------------------------------------------------------------ battle: the real battle layer driving the sound
// The page turns what the 3D scene shows into sound calls (src/app/main.js, src/render/volleyview.js). Here the battle's own
// event list stands in for the scene: close enough to measure the mix, the intercom and the limiter under a real load.
function battleScene(view, seed = 2) {
  const { HK, Battle } = require(path.join(root, 'tests/battle/load.js')), cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
  const b = new Battle.Battle({ biome: 'farmland', mapSeed: 3, seed, skill: 'expert', cfg, lookup, mission: 'hold', waves: 2, force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }, { type: 'rpg', n: 2 }, { type: 'fpv', n: 1 }] });
  let evN = 0; const pend = [], later = [], out = view !== 'gnr' && view !== 'cdr', cam = out ? 30 : 3;
  const at = (t, fn) => later.push([t, fn]);
  const state = (t, snd) => {
    while (b.t < t && !(b.over && b.t > (b.overT || (b.overT = b.t)) + 6)) b.step();
    const E = b.events || []; while (evN < E.length) pend.push(E[evN++]); pend.sort((x, y) => x.t - y.t);
    while (pend.length && pend[0].t <= b.t) {
      const e = pend.shift(), u = e.uid != null ? b.units.find(q => q.id === e.uid) : null, R = e.R || (u ? Math.hypot(u.e - b.tank.e, u.n - b.tank.n) : 800);
      if (e.type === 'launch') snd.launch(R, e.key !== 'rpg');
      else if (e.type === 'hkoi_fire') for (let i = 0; i < 6; i++) at(b.t + i * 0.3, () => snd.gun30(cam));
      else if (e.type === 'trophy') snd.aps(cam);
      else if (e.type === 'end') { if (e.by === 'hit') { snd.explosion(cam, e.killing ? 2.2 : 1.4); if (!out) snd.hit(e.killing); } else if (e.by === 'aps') snd.explosion(cam + 12, 0.9); else if (e.by === 'hkoi_he') snd.airburst(cam + 250, 1); else snd.explosion(cam + 80, 0.8); }
      else if (e.type === 'gun') { snd.gun120(cam); at(b.t + e.tof, () => snd.explosion(R, 1.5)); }
      else if (e.type === 'team_lost' && e.by !== 'main') for (let i = 0; i < 10; i++) at(b.t - 1.2 + i * (e.by === 'm2' ? 0.125 : 0.08), () => snd.mg(cam, e.by === 'm2'));
    }
    for (let i = later.length - 1; i >= 0; i--) if (later[i][0] <= b.t) later.splice(i, 1)[0][1]();
    const T = b.tank;
    return { view, cond: 'day', biome: 'farmland', speed: T.v || 0, heading: T.h, turret: T.tur, alive: T.alive, camDist: cam, rate: 1, drones: (b.transit || []).map((d, i) => ({ id: 'd' + i + ':' + d.t0, d: Math.max(20, d.R0 * (1 - (b.t - d.t0) / Math.max(1, d.arrive - d.t0))) })), battle: b, talking: true, mission: 'hold' };
  };
  return { b, state };
}
async function battle() {
  const SEC = 180;
  for (const view of ['gnr', 'orbit']) {
    const sc = battleScene(view), s = await render('battle_' + view, SEC, { voices: true, state: sc.state, seed: 5 });
    fs.writeFileSync(path.join(OUT, 'battle_' + view + '.json'), JSON.stringify({ said: s.icom.said, dropped: s.icom.dropped, trace: s.talk.trace, events: sc.b.events.filter(e => e.t <= SEC) }, null, 1));
    console.log('battle', view, 'sim time reached', sc.b.t.toFixed(1), 'lines said', s.icom.said.length, 'dropped', s.icom.dropped.length);
  }
  for (const bus of BUSES) { const sc = battleScene('gnr'); await render('battle_gnr_' + bus, SEC, { voices: true, state: sc.state, seed: 5, solo: bus }); }
}

// the short scene that tests/beta/sound.py also renders with Chrome's own audio engine: the two must agree
async function compare() {
  const s = await render('node_compare', 9, { voices: true, setup: x => x.mix.setBus('world', 0), state: () => ({ view: 'gnr', cond: 'day', speed: 0, heading: 0, turret: 0, alive: true, camDist: 3, drones: [], talking: false }),
    acts: [[0.4, x => x.cue('GNR', 'ontheway', 1)], [2.0, x => x.gun30(3)], [2.3, x => x.gun30(3)], [2.6, x => x.gun30(3)], [3.6, x => x.cue('LDR', 'up', 1)], [4.6, x => x.gun120(3)], [6.4, x => x.cue('CDR', 'cease', 1)]] });
  fs.writeFileSync(path.join(OUT, 'node_compare.json'), JSON.stringify({ said: s.icom.said, dropped: s.icom.dropped }, null, 1));
}

// recordings in place of synthesis: any sound file stands in for a recording here (a strip of the loader's voice as the
// "30 mm" and as the "wind"): the point is that the slot list is honoured and the distance treatment still applies
async function slots() {
  const manifest = { slots: { gun30_out: [{ file: 'crew2_ldr.mp3', start: 0, len: 0.5 }], wind_loop: [{ file: 'crew2_any.mp3', gain: 0.5 }], aps_out: [{ file: 'no_such_file.mp3' }] } };
  const prepare = async s => { const n = await s.mix.loadSlots(manifest, ASSETS.replace(/\/?$/, '/'), readFile); s._swapBeds(); console.log('slots with a recording:', n, '(gun30_out', s.mix.has('gun30_out'), ', wind_loop', s.mix.has('wind_loop'), ', aps_out with a missing file', s.mix.has('aps_out'), ')'); };
  await render('slot_gun30_300m', 4, { prepare, setup: seat('out'), acts: [[0.1, x => x.gun30(300)], [2.5, x => x.aps(10)]] });
  await render('slot_wind_loop', 4, { prepare, state: () => ({ view: 'orbit', cond: 'day', alive: false, speed: 0, drones: [], talking: false }) });
}

// what the interior reports after a penetration (hitPulse, alarm) and a fire, fed to update() the way the page does
async function inside() {
  const I = { inside: true, intercomVol: 0.75, toneOn: true, hitPulse: null, alarm: false, fxS: { fire: false } }, b = { t: 0 };
  const s = await render('inside_penetration_alarm_fire', 20, { voices: true, setup: x => x.mix.setBus('world', 0),
    state: t => { b.t = t; I.simT = t; if (t >= 2) { I.hitPulse = { t: 2, strength: 1.6, penetrated: true }; I.alarm = t < 12; } I.fxS.fire = t > 13; return { view: 'in_gnr', cond: 'day', speed: 0, heading: 0, turret: 0, alive: true, camDist: 2, drones: [], talking: true, battle: null, interior: I }; },
    acts: [[2.0, x => x.hit(false)], [2.6, x => x.cue('CDR', 'hit', 2, { pri: 3, ttl: 3 })], [4.4, x => x.cue('ANY', 'wound', 2, { pri: 3, ttl: 3 })], [6.5, x => x.cue('DRV', 'track', 2, { pri: 2, ttl: 4 })]] });
  fs.writeFileSync(path.join(OUT, 'inside_penetration_alarm_fire.json'), JSON.stringify({ said: s.icom.said, dropped: s.icom.dropped }, null, 1));
}

// the same half minute from every kind of view the page has: the crew talking while the 30 mm, the main gun, Trophy and
// a blast go off. tests/audio/check.py: nothing clips, inside is dull and outside is not, the crew is heard only from seats.
async function views() {
  for (const view of ['orbit', 'chase', 'cdr', 'in_cdr', 'in_gnr', 'in_ldr', 'in_drv', 'cut', 'enemy']) {
    const cam = view === 'enemy' ? 1500 : view === 'orbit' || view === 'chase' || view === 'cut' ? 25 : 3, g30 = t0 => [0, 1, 2, 3, 4, 5].map(i => [t0 + i * 0.3, x => x.gun30(cam)]);
    const s = await render('view_' + view, 26, { voices: true, seed: 7, state: () => ({ view, cond: 'day', biome: 'farmland', speed: 4, heading: 0, turret: 0, alive: true, camDist: cam, rate: 1, drones: [], talking: false }),
      acts: [[1.0, x => x.cue('GNR', 'ready', 0, { ttl: 4 })], [4.0, x => x.cue('LDR', 'ready', 0, { ttl: 4 })], ...g30(4.2), [7.0, x => x.cue('DRV', 'ready', 0, { ttl: 4 })], [7.6, x => x.gun120(cam)],
        [10.5, x => x.cue('CDR', 'redcon', 0, { ttl: 4 })], ...g30(11.0), [13.2, x => x.aps(cam)], [14.5, x => x.cue('CDR', 'cease', 1, { ttl: 4 })], [15.0, x => x.explosion(cam + 20, 1.4)], ...g30(15.4),
        [18.5, x => x.cue('GNR', 'ontheway', 1, { ttl: 4 })], [18.6, x => { for (let i = 0; i < 8; i++) x.mg(cam, true); }], [21, x => x.cue('DRV', 'ack_fwd', 1, { ttl: 4 })], ...g30(21.2)] });
    fs.writeFileSync(path.join(OUT, 'view_' + view + '.json'), JSON.stringify({ said: s.icom.said, dropped: s.icom.dropped }, null, 1));
  }
}

const scenes = { fx, beds, talk, battle, compare, slots, inside, views };
for (const name of want.length ? want : Object.keys(scenes)) { const t0 = Date.now(); await scenes[name](); console.log('scene', name, 'rendered in', ((Date.now() - t0) / 1000).toFixed(1), 's'); }
