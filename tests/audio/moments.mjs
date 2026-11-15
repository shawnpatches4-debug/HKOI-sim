// The scripted moments Shawn can be sent to listen to, and that tests/audio/measure.py measures (nobody can listen in the
// workspace). It runs the REAL sound code on an offline audio context, the way tests/audio/render.mjs does.
//
//   node tests/audio/moments.mjs <folder holding node_modules/node-web-audio-api> <assets folder> <out folder> [--src <root>] [moment ...]
//   --src <root>: take src/audio/*.js from another checkout (an older version, for the BEFORE column); the battle layer
//                 always comes from this checkout, so both versions hear exactly the same battle.
//
// Moments (each writes <name>.wav and <name>.json = what was played and when it must be heard):
//   gun30_burst_inside_0m        six 30 mm rounds at the gun's rate (200 a minute), heard from the gunner's seat
//   gun30_burst_outside_30m      the same burst from 30 m away in the open
//   gun30_burst_far_800m         the same burst from an enemy position 800 m away (2.33 s late)
//   missile_launch_3km           a guided missile launched 3 km away, heard beside the tank (8.75 s after it is seen),
//                                plus ..._weapons_only: the same with the engine and weather off, for the timing measurement
//   penetrating_hit_inside       a round through the armour, heard from the gunner's seat (alarm follows)
//   quiet_minute_inside/_outside one minute with nothing happening
//   busy_town_heavy_gunner_seat / _outside   the first 27 s of the battle "town, map 3, prepared defence ('heavy'), trained,
//                                3 waves, seed 2": its busiest 20 s are 5.1 s to 25.1 s (58 events)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), MODS = argv.shift(), ASSETS = argv.shift().replace(/\/?$/, '/'), OUT = argv.shift();
const require = createRequire(import.meta.url), here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '../..');
let SRC = root; { const i = argv.indexOf('--src'); if (i >= 0) { SRC = path.resolve(argv[i + 1]); argv.splice(i, 2); } }
const WA = require(path.join(MODS, 'node_modules/node-web-audio-api'));
const { Sound } = await import(path.join(SRC, 'src/audio/sound.js'));
const { BUSES, C_SOUND } = await import(path.join(SRC, 'src/audio/mixer.js'));
const SR = 44100, STEP = 1 / 30, LAT = 0.005;   /* LAT: every one-shot is scheduled 5 ms after it is asked for */
fs.mkdirSync(OUT, { recursive: true });

function seedRandom(seed) { let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const readFile = async url => { try { const b = fs.readFileSync(url); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } catch (e) { return null; } };
function writeWav(file, buf) {
  const n = buf.length, ch = buf.numberOfChannels, d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
  const out = Buffer.alloc(44 + n * ch * 2); out.write('RIFF', 0); out.writeUInt32LE(36 + n * ch * 2, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(ch, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * ch * 2, 28); out.writeUInt16LE(ch * 2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * ch * 2, 40);
  let over = 0, o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { let x = d[c][i]; if (Math.abs(x) > 1) { over++; x = Math.sign(x); } out.writeInt16LE(Math.round(x * 32767), o); o += 2; }
  fs.writeFileSync(file, out); return over;
}
// One render: acts = [[seconds, sound => ...]]; state(t, sound) = what update() gets every thirtieth of a second.
async function render(name, seconds, { acts = [], state = null, voices = false, seed = 1, solo = null, setup = null, meta = {} } = {}) {
  seedRandom(seed);
  const ctx = new WA.OfflineAudioContext(2, Math.ceil(seconds * SR), SR), sound = new Sound();
  sound._get = readFile; sound.start(ctx);
  if (voices) await sound.loadVoices(ASSETS);
  if (process.env.SOLO) solo = process.env.SOLO.split(',');   /* SOLO=weapons,explosions: only these buses, to see what each adds */
  if (solo) for (const b of BUSES) if (!solo.includes(b)) sound.mix.setBus(b, 0);
  if (setup) setup(sound);
  if (process.env.VOL && sound.set) sound.set({ master: +process.env.VOL });   /* VOL=1: the master slider at full, to check the ceiling */
  if (process.env.NIGHT && sound.set) sound.set({ night: true });
  const list = acts.slice().sort((a, b) => a[0] - b[0]); let k = 0, refused = 0;
  const frame = t => { try { if (state) { const st = state(t, sound); if (st) sound.update(STEP, st); } while (k < list.length && list[k][0] <= t + 1e-6) list[k++][1](sound, t); } catch (e) { console.log('ERROR in', name, 'at', t.toFixed(2), e.stack || e); process.exitCode = 1; } };
  for (let n = 1; n * STEP < seconds - 2 * STEP; n++) { const t = n * STEP; ctx.suspend(t).then(() => { frame(t); ctx.resume(); }).catch(() => { refused++; }); }
  await new Promise(r => setTimeout(r, 30));
  const buf = await ctx.startRendering(), over = writeWav(path.join(OUT, name + '.wav'), buf);
  if (refused > 3) { console.log('UNRELIABLE RENDER', name, refused, 'pause points refused'); process.exitCode = 2; }
  if (over) console.log('CLIPPED', name, over, 'samples');
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ name, seconds, ...meta, said: sound.icom ? sound.icom.said : [], dropped: sound.icom ? sound.icom.dropped : [] }, null, 1));
  console.log('rendered', name); return sound;
}
// times are kept on the 1/30 s grid, so an act runs at exactly the time written down for it
const grid = t => Math.round(t / STEP) * STEP;
const still = (view, cam, more = {}) => () => ({ view, cond: 'day', biome: 'farmland', speed: 0, heading: 0, turret: 0, alive: true, camDist: cam, rate: 1, drones: [], talking: false, ...more });
const ROF = 0.3;   /* the 30 mm chain gun: 200 rounds a minute */

const moments = {
  async gun30() {
    for (const [name, view, d] of [['gun30_burst_inside_0m', 'in_gnr', 0], ['gun30_burst_outside_30m', 'orbit', 30], ['gun30_burst_far_800m', 'enemy', 800]]) {
      const shots = [0, 1, 2, 3, 4, 5].map(i => grid(1 + i * ROF));
      await render(name, 6 + d / C_SOUND, { state: still(view, d), acts: shots.map(t => [t, x => x.gun30(d)]), seed: 11,
        meta: { expect: shots.map(t => ({ t: t + LAT + (view === 'in_gnr' ? 0 : d / C_SOUND), what: '30 mm round' })), rof: ROF, distance: d, view } });
    }
  },
  async launch() {
    const t0 = grid(1), d = 3000, meta = { expect: [{ t: t0 + LAT + d / C_SOUND, what: 'missile launch 3 km away, fired at ' + t0.toFixed(2) + ' s' }], distance: d, view: 'orbit' };
    await render('missile_launch_3km', 15, { state: still('orbit', 25, { cond: 'night' }), acts: [[t0, x => x.launch(d, true)]], seed: 12, meta });
    await render('missile_launch_3km_weapons_only', 15, { state: still('orbit', 25, { cond: 'night' }), acts: [[t0, x => x.launch(d, true)]], seed: 12, solo: ['weapons'], meta });
  },
  async pen() {
    const I = { inside: true, intercomVol: 0.75, toneOn: true, hitPulse: null, alarm: false, fxS: { fire: false } }, t0 = grid(2);
    await render('penetrating_hit_inside', 11, { voices: true, seed: 13,
      state: t => { I.simT = t; if (t >= t0) { I.hitPulse = { t: t0, strength: 1.6, penetrated: true }; I.alarm = true; } return { view: 'in_gnr', cond: 'day', biome: 'farmland', speed: 0, heading: 0, turret: 0, alive: true, camDist: 2, rate: 1, drones: [], talking: true, battle: null, interior: I }; },
      acts: [[t0, x => x.hit(false)], [t0 + 0.7, x => x.cue('CDR', 'hit', 2, { pri: 3, ttl: 3 })]], meta: { expect: [{ t: t0 + LAT, what: 'the strike' }], view: 'in_gnr' } });
  },
  async quiet() {
    await render('quiet_minute_inside', 60, { state: still('in_gnr', 2), seed: 14, meta: { view: 'in_gnr' } });
    await render('quiet_minute_outside', 60, { state: still('orbit', 25), seed: 14, meta: { view: 'orbit' } });
  },
  async busy() {
    for (const [name, view] of [['busy_town_heavy_gunner_seat', 'in_gnr'], ['busy_town_heavy_outside', 'orbit']]) {
      const sc = battleScene(view), SEC = 27;
      const s = await render(name, SEC, { voices: true, state: sc.state, seed: 5, meta: { view, window: [5.1, 25.1], battle: 'town, map 3, heavy, trained, 3 waves, seed 2' } });
      const j = JSON.parse(fs.readFileSync(path.join(OUT, name + '.json'), 'utf8')); j.events = sc.b.events.filter(e => e.t <= SEC && e.type !== 'crew'); j.played = sc.played; fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(j, null, 1));
      console.log('  ', name, 'lines said', s.icom.said.length, 'dropped', s.icom.dropped.length, 'sounds asked for', sc.played.length);
    }
  },
  // The new sounds of version 1.0, each with what can be checked about it (the older version cannot play most of these).
  async extra() {
    if (!Sound.prototype.event) { console.log('extra: the older sound code has none of these'); return; }
    const T = grid(1), inG = still('in_gnr', 2), out = (d, more) => still('orbit', d, more);
    // the main gun from the gunner's seat, the loader's drill, his call: breech closes 0.3 s after load(), "Up!" 0.55 s after
    await render('main_gun_inside_with_loading_drill', 9, { voices: true, seed: 21, state: inG, acts: [[T, x => x.gun120(2)], [grid(5.5), x => { const dl = x.load(); x.cue('LDR', 'up', 1, { delay: dl, ttl: 2 }); }]],
      meta: { view: 'in_gnr', expect: [{ t: T + LAT, what: '120 mm fires' }, { t: grid(5.5) + 0.3 + LAT, what: 'breech closes' }], after: { ev: 'up', t: grid(5.5) + 0.3 } } });
    await render('main_gun_outside_40m', 8, { seed: 21, state: out(40), acts: [[T, x => x.gun120(40)]], meta: { view: 'orbit', expect: [{ t: T + LAT + 40 / C_SOUND, what: '120 mm fires' }] } });
    // Trophy: two bangs 45 to 65 ms apart
    await render('trophy_outside_15m', 4, { seed: 22, state: out(15), acts: [[T, x => x.aps(15)]], meta: { view: 'orbit', expect: [{ t: T + LAT + 15 / C_SOUND, what: 'Trophy launcher' }], double: { t: T + LAT + 15 / C_SOUND, lo: 0.04, hi: 0.07 } } });
    await render('trophy_inside', 4, { seed: 22, state: inG, acts: [[T, x => x.aps(2)]], meta: { view: 'in_gnr', expect: [{ t: T + LAT, what: 'Trophy launcher' }], double: { t: T + LAT, lo: 0.04, hi: 0.07 } } });
    // an enemy tank fires from 1500 m and misses by 10 m: the crack of the round (1700 m/s) at 0.88 s, the gun's report at 4.37 s
    await render('enemy_tank_round_1500m_crack_then_report', 9, { seed: 23, state: out(25, { cond: 'night' }), solo: ['weapons'], acts: [[T, x => x.event('launch', { d: 1500, key: 't90', miss: 10 })]],
      meta: { view: 'orbit', expect: [{ t: T + LAT + 1500 / 1700, what: 'crack of the round passing' }, { t: T + LAT + 1500 / C_SOUND, what: 'report of the gun' }] } });
    // a missile passing 8 m away at 250 m/s: closest at 1.0 + 0.66 s; the pitch must fall as it passes
    await render('missile_flyby_doppler', 4, { seed: 24, state: out(25, { cond: 'night' }), solo: ['weapons'], acts: [[T, x => x.whoosh(0.6, 0.6, { speed: 250, miss: 8 })]], meta: { view: 'orbit', doppler: { t: T + LAT + 0.66, span: 0.5 } } });
    // RPG and guided missile launches close by
    await render('rpg_launch_150m', 5, { seed: 25, state: out(25), acts: [[T, x => x.launch(150, false)]], meta: { view: 'orbit', expect: [{ t: T + LAT + 150 / C_SOUND, what: 'RPG fires' }] } });
    await render('missile_launch_400m', 6, { seed: 25, state: out(25), acts: [[T, x => x.launch(400, true)]], meta: { view: 'orbit', expect: [{ t: T + LAT + 400 / C_SOUND, what: 'missile leaves the tube' }] } });
    // the same three 30 mm rounds in four kinds of country: what comes back after the last round (0.06 to 0.45 s) against the round itself
    for (const biome of ['farmland', 'desert', 'town', 'forest']) await render('gun30_3_rounds_60m_' + biome, 4, { seed: 26, state: out(60, { biome, cond: 'none', alive: false }), acts: [0, 1, 2].map(i => [grid(1 + i * ROF), x => x.gun30(60)]),
      meta: { view: 'orbit', biome, echo: { t: grid(1 + 2 * ROF) + LAT + 60 / C_SOUND } } });
    // ducking: a steady string of 30 mm rounds from the gunner's seat, weapons only, while the gunner speaks from 3.0 s
    await render('ducking_30mm_under_speech_weapons_only', 9, { voices: true, seed: 27, state: inG, solo: ['weapons'], acts: [...Array.from({ length: 24 }, (_, i) => [grid(1 + i * ROF), x => x.gun30(2)]), [grid(3), x => x.cue('GNR', 'ready', 0, { ttl: 3 })]], meta: { view: 'in_gnr', duck: true, rounds: Array.from({ length: 24 }, (_, i) => grid(1 + i * ROF) + LAT) } });
    // drones: a radio FPV, then a fibre-optic one, each coming in from 700 m at 40 m/s, passing at 5 m and going away
    const fly = (t, t0) => Math.max(5, Math.abs(700 - 40 * (t - t0)));
    await render('drone_radio_then_fibre_passes', 44, { seed: 28, state: t => ({ ...out(25, { cond: 'none', alive: false })(), drones: t < 22 ? [{ id: 'a', d: fly(t, 0) }] : [{ id: 'b', d: fly(t, 22), fiber: true }] }), setup: s => s.mix.setBus('world', 0),
      meta: { view: 'orbit', drone: { radio: [10, 16], fibre: [32, 38], pass: [17.4, 39.4] } } });
    // the vehicle: idle, pull away, cruise at 40 km/h, a turn, brake; the turret traversed at the end
    const drive = t => (t < 3 ? 0 : t < 9 ? (t - 3) / 6 * 11 : t < 14 ? 11 : Math.max(0, 11 - (t - 14) * 3)), turn = t => (t > 9 && t < 13 ? (t - 9) * 25 : t >= 13 ? 100 : 0), tur = t => turn(t) + (t > 19 && t < 22 ? (t - 19) * 30 : t >= 22 ? 90 : 0);
    for (const [name, view, cam] of [['drive_gunner_seat', 'in_gnr', 2], ['drive_commander_head_out', 'cdr', 2], ['drive_outside_25m', 'orbit', 25]]) await render(name, 24, { seed: 29, state: t => ({ ...still(view, cam)(), speed: drive(t), heading: turn(t), turret: tur(t) }), meta: { view } });
    // more of the battle: the ammunition burning off, artillery, the smoke dischargers, hits on the armour by weapon, a ricochet and rounds snapping past
    await render('blowout_panels_outside_60m', 9, { seed: 30, state: out(60), acts: [[T, x => x.event('tank_fate', { fate: 'blowout', d: 60 })]], meta: { view: 'orbit', expect: [{ t: T + LAT + 60 / C_SOUND, what: 'the panels go' }] } });
    await render('artillery_shell_lands_150m', 8, { seed: 31, state: out(25), acts: [[T, x => x.event('artillery', { d: 150, flight: 1.6 })]], meta: { view: 'orbit', expect: [{ t: T + LAT + 1.6 + 150 / C_SOUND, what: 'the shell bursts' }] } });
    await render('smoke_dischargers_outside_20m', 6, { seed: 32, state: out(20), acts: [[T, x => x.smoke(20)]], meta: { view: 'orbit' } });
    await render('armour_hits_inside_mg_autocannon_rpg_missile_tank_round', 22, { seed: 33, state: inG, acts: [...[0, 0.11, 0.2, 0.34, 0.41].map(dt => [grid(1 + dt), x => x.hit(false, { weapon: 'mg' })]), ...[0, 0.2, 0.4].map(dt => [grid(3 + dt), x => x.hit(false, { weapon: 'auto' })]),
      [grid(6), x => x.hit(false, { weapon: 'rpg' })], [grid(11), x => x.hit(false, { weapon: 'kornet' })], [grid(16), x => x.hit(false, { weapon: 'ke' })]], meta: { view: 'in_gnr', expect: [6, 11, 16].map(t => ({ t: grid(t) + LAT, what: 'strike' })) } });
    await render('incoming_rounds_snap_past_and_ricochet', 6, { seed: 34, state: out(25, { cond: 'none', alive: false }), acts: [...[0, 0.12, 0.25, 0.37, 0.5].map(dt => [grid(1 + dt), x => x.crackThump(400, 850, 4 + dt * 10, false)]), [grid(3), x => x.ricochet(8)], [grid(3.4), x => x.ricochet(15)]], meta: { view: 'orbit' } });
    // night mode on the busy battle: the same 27 s with the squeeze on (the range between loud and quiet must shrink)
    { const sc = battleScene('in_gnr'); await render('busy_town_heavy_gunner_seat_night_mode', 27, { voices: true, state: sc.state, seed: 5, setup: s => s.set({ night: true }), meta: { view: 'in_gnr', window: [5.1, 25.1], nightOf: 'busy_town_heavy_gunner_seat' } }); }
    { const sc = battleScene('in_gnr'); await render('busy_town_heavy_gunner_seat_tension_layer_on', 27, { voices: true, state: (t, s) => ({ ...sc.state(t, s), threat: (sc.b.transit || []).length + 1 }), seed: 5, setup: s => s.set({ tension: true }), meta: { view: 'in_gnr', window: [5.1, 25.1] } }); }
  },
};

// The battle's own event list stands in for the 3D scene (as in render.mjs). With the new sound code each event goes through
// sound.event(); with the old code through the calls the old page made.
function battleScene(view) {
  const { HK, Battle } = require(path.join(root, 'tests/battle/load.js')), cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
  const b = new Battle.Battle({ biome: 'town', mapSeed: 3, seed: 2, skill: 'trained', cfg, lookup, mission: 'hold', waves: 3,
    force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] });
  let evN = 0; const pend = [], later = [], played = [], out = view === 'orbit', cam = out ? 30 : 2;
  const at = (t, fn) => later.push([t, fn]);
  const P = (snd, type, info, old) => { played.push({ t: +b.t.toFixed(2), type, d: Math.round(info.d || 0) }); if (snd.event) snd.event(type, info); else old(); };
  const state = (t, snd) => {
    while (b.t < t && !b.over) b.step();
    const E = b.events || []; while (evN < E.length) pend.push(E[evN++]); pend.sort((x, y) => x.t - y.t);
    while (pend.length && pend[0].t <= b.t) {
      const e = pend.shift(), u = e.uid != null ? b.units.find(q => q.id === e.uid) : null, R = e.R || (u ? Math.hypot(u.e - b.tank.e, u.n - b.tank.n) : 800);
      if (e.type === 'launch') P(snd, 'launch', { d: R, key: e.key, big: e.key !== 'rpg' }, () => snd.launch(R, e.key !== 'rpg'));
      else if (e.type === 'hkoi_fire') for (let i = 0; i < 6; i++) at(b.t + i * ROF, () => P(snd, 'gun30', { d: cam }, () => snd.gun30(cam)));
      else if (e.type === 'trophy') P(snd, 'trophy', { d: cam }, () => snd.aps(cam));
      else if (e.type === 'end') {
        if (e.by === 'hit') { P(snd, 'explosion', { d: cam, size: e.killing ? 2.2 : 1.4 }, () => snd.explosion(cam, e.killing ? 2.2 : 1.4)); if (!out) P(snd, 'hit', { killing: e.killing, key: e.key }, () => snd.hit(e.killing)); }
        else if (e.by === 'aps') P(snd, 'explosion', { d: cam + 12, size: 0.9 }, () => snd.explosion(cam + 12, 0.9));
        else if (e.by === 'hkoi_he') P(snd, 'airburst', { d: cam + 250, size: 1 }, () => snd.airburst(cam + 250, 1));
        else P(snd, 'explosion', { d: cam + 80, size: 0.8, ground: true }, () => snd.explosion(cam + 80, 0.8));
      } else if (e.type === 'gun') { P(snd, 'gun120', { d: cam }, () => snd.gun120(cam)); at(b.t + e.tof, () => P(snd, 'explosion', { d: R, size: 1.5, ground: true }, () => snd.explosion(R, 1.5))); }
      else if (e.type === 'team_lost' && e.by !== 'main') for (let i = 0; i < 10; i++) at(b.t - 1.2 + i * (e.by === 'm2' ? 0.125 : 0.08), () => P(snd, 'mg', { d: cam, heavy: e.by === 'm2' }, () => snd.mg(cam, e.by === 'm2')));
    }
    for (let i = later.length - 1; i >= 0; i--) if (later[i][0] <= b.t) later.splice(i, 1)[0][1]();
    const T = b.tank;
    return { view, cond: 'day', biome: 'town', speed: T.v || 0, heading: T.h, turret: T.tur, alive: T.alive, camDist: cam, rate: 1, battle: b, talking: true, mission: 'hold',
      drones: (b.transit || []).map((d, i) => ({ id: 'd' + i + ':' + d.t0, d: Math.max(20, d.R0 * (1 - (b.t - d.t0) / Math.max(1, d.arrive - d.t0))), fiber: d.key === 'fpv_fiber' })) };
  };
  return { b, state, played };
}

for (const name of argv.length ? argv : Object.keys(moments).filter(k => k !== 'extra' || SRC === root)) { const t0 = Date.now(); await moments[name](); console.log('moment set', name, 'done in', ((Date.now() - t0) / 1000).toFixed(1), 's'); }
