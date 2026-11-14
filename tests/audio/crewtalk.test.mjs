// node tests/audio/crewtalk.test.mjs : the crew's lines against the battles that trigger them (no browser, no sound).
// 1. The engine's sentences map to the intended pack line, or to silence where the pack has nothing true to say.
// 2. Whole battles are run and every line the crew director asks for is checked against the facts of that moment:
//    "Up!" only when the gun has just been loaded, the range call only within 60 m of the true range, "cease fire" only when a
//    team was in fact knocked out, nothing at all after the vehicle is lost, and so on.
// 3. Every event the director can ask for exists in the release clip list (tools/audio/crew_release.json).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '../..');
const { CrewTalk, engineLine, fireOf, HIT_CALLS, HIT_WINDOW } = await import(path.join(root, 'src/audio/crewtalk.js'));
const { HK, DMG, Battle } = require(path.join(root, 'tests/battle/load.js'));
const REL = JSON.parse(fs.readFileSync(path.join(root, 'tools/audio/crew_release.json'), 'utf8')).e;
// plus the lines that are made (tools/audio/made_lines.json: synthesised) or cut out of the pack (tools/audio/splice.py), and each man's own wound cry
{ const made = JSON.parse(fs.readFileSync(path.join(root, 'tools/audio/made_lines.json'), 'utf8')).lines;
  for (const who in made) for (const ev in made[who]) for (let n = 1; n <= (ev.includes('{N}') ? 12 : 1); n++) (REL[who] || (REL[who] = {}))[ev.replace('{N}', n)] = [[0, 1, 'made']];
  REL.CDR.smoke = REL.GNR.identified = REL.GNR.miss = [[0, 1, 'splice']]; for (const who of ['CDR', 'GNR', 'LDR', 'DRV']) REL[who].wound = REL.ANY.wound; }
// plus the hit calls of the overlay (tools/audio/build_panic.py: the pack's fire calls, each man's scream). The splice "Fire! Fire!"
// was not kept (the speech recogniser did not read it on its own), so CDR.fire is not in the list.
for (const [who, ev] of [['CDR', 'fire_engine'], ['CDR', 'smoke_turret'], ['CDR', 'fire_ammo'], ['CDR', 'fire_out'], ['DRV', 'engine_fire'], ['CDR', 'scream'], ['GNR', 'scream'], ['LDR', 'scream'], ['DRV', 'scream']]) (REL[who] || (REL[who] = {}))[ev] = [[0, 1, 'panic']];
let fail = 0; const bad = (...a) => { fail++; if (fail < 25) console.log('FAIL', ...a); };

// ---- 1. the engine's sentences
const LINES = [
  ['CDR', 'Driver, back up.', 'drv_back'], ['CDR', 'GO! GO! JUST GO!', 'drv_back'], ['CDR', 'Driver, get us into the low ground! Back up! Now!', 'drv_back'], ['CDR', 'THE LOW GROUND! BEHIND US! GO GO GO!', 'drv_back'],
  ['CDR', 'Driver, get us into the low ground! Left! Now!', 'left'], ['CDR', 'Driver, the scrub, right, 120 metres. Go.', 'right'], ['CDR', 'THE LOW GROUND! AHEAD! GO GO GO!', 'drv_fwd'], ['CDR', 'Driver, hard left.', 'left'],
  ['CDR', 'Driver, move out! Now!', 'drv_fwd'], ['CDR', 'Driver, stop.', 'drv_stop'], ['CDR', 'Radar’s been up too long. Driver, find us a new position.', 'moveout'],
  ['CDR', 'We’re hit. Crew report.', 'hit'], ['CDR', 'WE’RE HIT! IS EVERYONE OKAY?!', 'hit'], ['CDR', 'Target. Cease fire.', 'cease'], ['CDR', 'Miss. Re-engage.', 'reengage_doubt'], ['CDR', 'Gunner, sabot, tank.', 'load_sabot'],
  ['GNR', 'On the way.', 'ontheway'], ['GNR', 'ON THE WAY! ON THE WAY!', 'ontheway'], ['GNR', 'Target! It’s down!', 'target'], ['GNR', 'Gunner’s good.', 'ready'], ['GNR', 'I’m okay— gunner up!', 'ready'], ['GNR', 'Gun’s jammed. Clearing.', 'misfire'], ['GNR', 'Gun’s clear!', 'gun_back'],
  ['LDR', 'Up.', 'up'], ['LDR', 'Loader’s good.', 'ready'], ['DRV', 'Driver’s good.', 'ready'], ['DRV', 'Driver up! Still running!', 'ready'],
  // lines the pack does not have: made (synthesised or spliced), each still tied to the engine's own line
  ['CDR', 'Missile, 3 o\'clock.', 'missile_3'], ['CDR', 'Drone! 11 o\'clock!', 'drone_11'], ['CDR', 'MISSILE! 12 O\'CLOCK!', 'missile_12'], ['CDR', 'No cover in reach. Hold here.', 'hold'], ['CDR', 'NOWHERE TO GO!', 'hold'],
  ['CDR', 'All stations, report.', 'report'], ['CDR', 'Good work. Stay sharp.', 'good'], ['CDR', 'It went wide.', 'wide'], ['CDR', 'SMOKE! SMOKE! SMOKE!', 'smoke'],
  ['GNR', 'Identified.', 'identified'], ['GNR', 'Driver, steady.', 'steady'], ['GNR', 'No cut. Still guiding.', 'nocut'], ['GNR', 'IT DIDN’T WORK! IT’S STILL COMING!', 'nocut'], ['GNR', 'Beam’s cut. It’s blind.', 'cut'],
  ['GNR', 'It’s back on the beam.', 'back'], ['GNR', 'HE at fifty rounds.', 'he50'], ['GNR', 'HE’s out!', 'heout'], ['GNR', 'Obscurant at fifty rounds.', 'obs50'],
  ['LDR', 'Trophy, kill.', 'trophy_kill'], ['LDR', 'TROPHY! TROPHY GOT IT!', 'trophy_kill'], ['LDR', 'Trophy missed!', 'trophy_miss'], ['LDR', 'Left side’s empty!', 'left_empty'], ['LDR', 'RIGHT SIDE’S OUT!', 'right_empty'],
  // still nothing true to say: silence
  ['CDR', 'FIRE! FIRE! GET OUT! GET OUT!', null], ['CDR', 'Fire!', null], ['CDR', 'It’s blind. Hold your position.', null], ['LDR', 'I CAN’T— THE HATCH—', null],
];
for (const [who, s, want] of LINES) { const m = engineLine(who, s, 'fwd'); if ((m && m.ev || null) !== want) bad('engine line', who, JSON.stringify(s), '->', m && m.ev, 'expected', want); }
if (!(engineLine('CDR', 'SMOKE! SMOKE! SMOKE!', null) || {}).cue) bad('smoke must fire the dischargers as well as the word');
for (const [order, want] of [['fwd', 'ack_fwd'], ['left', 'ack_left'], ['right', 'ack_right'], ['back', 'onmove'], [null, 'onmove']]) if (engineLine('DRV', 'On it!', order).ev !== want) bad('driver answer after order', order);

// ---- 2. whole battles
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), counts = {}, silent = {}; let lines = 0, minutes = 0, battles = 0;
const forces = [[{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }], [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'sal', n: 1 }, { type: 'rpg', n: 2 }], [{ type: 'rpg', n: 4 }, { type: 'kornet', n: 1 }]];
for (const biome of ['farmland', 'desert', 'town', 'forest']) for (const seed of [1, 2, 3]) for (const [fi, force] of forces.entries()) {
  const mission = ['hold', 'advance', 'hunt'][(seed + fi) % 3];
  const b = new Battle.Battle({ biome, mapSeed: 3, seed, skill: seed % 2 ? 'green' : 'expert', cfg, lookup, force, mission, waves: 2 });
  const asked = [], net = { ready: true, has: (who, ev) => !!(REL[who] && REL[who][ev]), request(who, ev, o) { if (!this.has(who, ev)) return false; asked.push({ t: b.t, who, ev, o: o || {} }); return true; }, flush() { asked.push({ t: b.t, flush: true }); } };
  const cues = [], talk = new CrewTalk(net, { warn() {}, blip: k => cues.push([b.t, k]), smoke: () => cues.push([b.t, 'smoke']) });
  let lost = null, n0 = 0; const hitCount = new Map();
  while (b.t < 600 && !(b.over && b.t > (b._overT || (b._overT = b.t)) + 5)) {
    const was = { loaded: b.tank.loaded, mode: b.tank.mode }; b.step(); talk.update(b, b.t, { mission });
    const T = b.tank, E = b.events || [], near = (type, f, w = 0.35) => E.some(e => e.type === type && Math.abs(e.t - b.t) <= w && (!f || f(e)));
    const radio = re => b.volleys.slice(-3).some(v => v.rec && (v.rec.radio || []).some(r => Math.abs(v.t0 + r.t - b.t) <= 1.7 && re.test(r.text)));
    const hitsNow = E.filter(e => e.type === 'end' && e.by === 'hit' && !e.killing && Math.abs(e.t - b.t) <= 0.5);
    const fireNow = hitsNow.map(e => { const v = b.volleys.find(x => x.i === e.v); let h = null; try { h = DMG.report(v.rec, v.cfg).find(x => x.idx === e.idx); } catch (err) { h = null; } return fireOf(h); }).filter(Boolean);
    for (const a of asked.slice(n0)) {
      if (a.flush) { lost = lost == null ? b.t : lost; continue; }
      const k0 = a.who + '.' + a.ev;
      if (/^(CDR\.(fire_engine|fire_ammo|smoke_turret)|DRV\.engine_fire)$/.test(k0)) { const want = k0 === 'CDR.fire_ammo' ? 'ammo' : k0 === 'CDR.smoke_turret' ? 'hull' : 'engine'; if (!fireNow.includes(want)) bad(biome, seed, 'a fire call with no such fire', k0, JSON.stringify(fireNow), b.t.toFixed(1)); }
      if (/\.scream$/.test(k0) && !(near('crew', e => (e.what === 'wounded' || e.what === 'down') && String(e.who).toUpperCase() === a.who, 0.5) || (a.who === 'LDR' && near('loader_hit', null, 0.5)))) bad(biome, seed, 'a scream from a man who was not hurt', k0, b.t.toFixed(1));
      if (k0 === 'CDR.fire_out' && !near('crew', e => e.what === 'fire_out', 0.5)) bad(biome, seed, '"Fire extinguished" with no fire put out', b.t.toFixed(1));
      if (k0 === 'CDR.report' && !(E.some(e => e.type === 'end' && e.by === 'hit' && b.t - e.t >= 0 && b.t - e.t < 3.5) || radio(/report|everyone okay/i))) bad(biome, seed, '"Everyone okay? Report!" with no hit', b.t.toFixed(1));
      if (a.who !== 'HQ' && a.ev !== 'scream' && !a.o.needs) { const h = E.filter(e => e.type === 'end' && e.by === 'hit' && !e.killing && b.t - e.t >= 0 && b.t - e.t < HIT_WINDOW).pop(); if (h) { const ks = hitCount.get(h) || new Set(); ks.add(k0); hitCount.set(h, ks); const n = ks.size; /* the same line asked twice is one call (the intercom plays it once) */ if (n > HIT_CALLS) bad(biome, seed, `more than ${HIT_CALLS} calls in the first ${HIT_WINDOW} s after a hit`, k0, b.t.toFixed(1)); } }
      const k = a.who + '.' + a.ev; counts[k] = (counts[k] || 0) + 1; lines++;
      if (lost != null) bad(biome, seed, 'a line after the vehicle was lost', k, 't', b.t.toFixed(1));
      if (k === 'LDR.up' && !(T.loaded || radio(/^up/i))) bad(biome, seed, '"Up!" but the gun is not loaded', b.t.toFixed(1));
      if (k === 'CDR.cease' && !(near('team_lost') || radio(/cease fire|BURNING/i))) bad(biome, seed, '"cease fire" with no team knocked out', b.t.toFixed(1));
      if (k === 'GNR.target' && !(near('team_lost') || radio(/^Target|GOT IT/))) bad(biome, seed, '"Target" with nothing hit', b.t.toFixed(1));
      if (k === 'GNR.ontheway' && !(near('gun') || radio(/on the way/i))) bad(biome, seed, '"On the way" with no round fired', b.t.toFixed(1));
      if (/^GNR\.range_/.test(k) && !(b._rf && Math.abs(b._rf.R - +a.ev.slice(6)) <= 60)) bad(biome, seed, 'range call does not match the true range', k, b._rf && b._rf.R);
      if (k === 'CDR.drv_stop' && T.mode === 'moving' && !radio(/stop/i)) bad(biome, seed, '"Driver, stop" while still moving', b.t.toFixed(1));
      if (k === 'CDR.loader_down' && !near('loader_hit', null, 0.5)) bad(biome, seed, 'loader call with no loader hit');
      if (k === 'ANY.wound' && !near('loader_hit', null, 0.5)) bad(biome, seed, 'wound cry with nobody hit');
      if (k === 'CDR.hit' && !(near('end', e => e.by === 'hit', 0.5) || radio(/^we.re hit/i))) bad(biome, seed, '"We have been hit" with no hit', b.t.toFixed(1));
      if (k === 'CDR.reengage_doubt' && !(E.some(e => e.type === 'gun' && !e.hit && b.t - (e.t + e.tof) < 1.5 && b.t >= e.t + e.tof) || radio(/^Miss/))) bad(biome, seed, '"Doubtful" with no miss', b.t.toFixed(1));
      if (/^HQ\.end/.test(k) && !(b.over && b.over.result === 'won')) bad(biome, seed, 'the net announces a win that did not happen');
      if (k === 'GNR.contact' && !near('located')) bad(biome, seed, '"Enemy!" with nothing located');
      if (k === 'LDR.going_up' && !(T.ai && T.ai.ldr && T.ai.ldr.up)) bad(biome, seed, '"Going up" but the loader is not up');
      if (k === 'LDR.coming_down' && T.ai.ldr.up) bad(biome, seed, '"Coming down" but the loader is still up');
      if (k === 'GNR.miss' && !E.some(e => e.type === 'gun' && !e.hit && b.t - (e.t + e.tof) < 1.5 && b.t >= e.t + e.tof)) bad(biome, seed, '"Miss" with no miss');
      if (/^CDR\.(missile|drone)_/.test(k) && !radio(/o.clock/i)) bad(biome, seed, 'a clock call with no warning from the engine');
      if (!(REL[a.who] && REL[a.who][a.ev])) bad('asked for a line that is not in the release list', k);
    }
    n0 = asked.length;
  }
  for (const x of talk.trace) if (x[3] === 'silent') { const key = x[1] + ': ' + String(x[2]).replace(/\d+/g, 'N'); silent[key] = (silent[key] || 0) + 1; }
  minutes += b.t / 60; battles++;
}
// ---- 2b. each man's own stress picks his take (src/battle/crew.js), and a man who is down or frozen says nothing
console.log('share of crew lines by delivery (calm / tense / shouted), and what a man in each state was given:');
for (const quality of ['green', 'trained', 'expert']) {
  const byLevel = [0, 0, 0], byState = {}; let mixed = 0, engagements = 0, mutedAsk = 0, mutes = 0;
  for (const biome of ['farmland', 'town']) for (const seed of [1, 2, 3, 4]) for (const force of forces) {
    const b = new Battle.Battle({ biome, mapSeed: 3, seed, skill: 'expert', cfg, lookup, force, mission: 'hold', waves: 2, crewQuality: quality });
    const asked = [], net = { ready: true, has: (who, ev) => !!(REL[who] && REL[who][ev]), request(who, ev, o) { if (!this.has(who, ev)) return false; asked.push({ t: b.t, who, ev, level: o.level, v: b.volleys.length }); return true; }, flush() {} };
    const talk = new CrewTalk(net, { warn() {}, blip() {}, smoke() {} }); let n0 = 0;
    while (b.t < 600 && !(b.over && b.t > (b._overT || (b._overT = b.t)) + 5)) {
      const S0 = b.crewState(); b.step(); talk.update(b, b.t, { mission: 'hold' }); const S = b.crewState();   /* S0: the states before this step (a man's state can change in the very step he speaks) */
      for (const a of asked.slice(n0)) {
        if (a.who === 'HQ' || a.who === 'ANY') continue; const m = S.who[a.who.toLowerCase()], lv = a.level == null ? 1 : a.level;
        byLevel[lv]++; const st = byState[m.state] || (byState[m.state] = [0, 0, 0]); st[lv]++;
        if ((m.status === 'down' && !(a.ev === 'scream' && m.busy === 'out of action')) || (/^frozen/.test(m.busy || '') && a.ev !== 'freeze')) {   /* his one line as he locks up is allowed, and the scream of a man badly wounded as he goes down */ mutedAsk++; bad(quality, 'a man who is', m.status === 'down' ? 'down' : 'frozen', 'speaks:', a.who, a.ev, 't', b.t.toFixed(1)); }
        if (m.state === 'panicked' && lv !== 2) bad(quality, 'a panicked man was not given his shouted take', a.who, a.ev, lv);
        if (m.state === 'steady' && S0.who[a.who.toLowerCase()].state === 'steady' && lv === 2 && !['hit', 'wound', 'loader_down', 'contact', 'cdr_down', 'gnr_down', 'drv_down', 'bail', 'freeze'].includes(a.ev)) bad(quality, 'a steady man shouts', a.who, a.ev);
      }
      n0 = asked.length;
    }
    mutes += talk.trace.filter(x => /he says nothing/.test(String(x[2]))).length;
    const perV = {}; for (const a of asked) if (a.level != null && a.who !== 'HQ' && a.who !== 'ANY') (perV[a.v] || (perV[a.v] = new Set())).add(a.level);
    for (const k in perV) { engagements++; if (perV[k].has(2) && (perV[k].has(0) || perV[k].has(1))) mixed++; }
  }
  const tot = byLevel[0] + byLevel[1] + byLevel[2] || 1, pc = a => a.map(x => Math.round(100 * x / (a[0] + a[1] + a[2] || 1)) + '%').join(' / ');
  console.log(`  ${quality.padEnd(8)} ${pc(byLevel)}   by state: ` + ['steady', 'strained', 'shaken', 'panicked'].filter(k => byState[k]).map(k => `${k} ${pc(byState[k])}`).join('; ') + `   | lines withheld because the man was down or frozen: ${mutes}; engagements with a shouting man and a calmer one together: ${mixed} of ${engagements}`);
}
// ---- 3. report
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
console.log(`${battles} battles, ${minutes.toFixed(0)} minutes of battle, ${lines} lines asked for (${(lines / minutes).toFixed(1)} a minute before the intercom drops the stale ones)`);
console.log('lines:', top(counts).map(([k, n]) => k + ' x' + n).join(', '));
console.log('silent (the pack has no line):'); for (const [k, n] of top(silent).slice(0, 40)) console.log('  ', String(n).padStart(4), k);
console.log(fail ? `CREW TALK TESTS FAILED (${fail})` : 'CREW TALK TESTS PASS'); process.exit(fail ? 1 : 0);
