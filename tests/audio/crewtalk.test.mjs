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
const { CrewTalk, engineLine } = await import(path.join(root, 'src/audio/crewtalk.js'));
const { HK, Battle } = require(path.join(root, 'tests/battle/load.js'));
const REL = JSON.parse(fs.readFileSync(path.join(root, 'tools/audio/crew_release.json'), 'utf8')).e;
let fail = 0; const bad = (...a) => { fail++; if (fail < 25) console.log('FAIL', ...a); };

// ---- 1. the engine's sentences
const LINES = [
  ['CDR', 'Driver, back up.', 'drv_back'], ['CDR', 'GO! GO! JUST GO!', 'drv_back'], ['CDR', 'Driver, get us into the low ground! Back up! Now!', 'drv_back'], ['CDR', 'THE LOW GROUND! BEHIND US! GO GO GO!', 'drv_back'],
  ['CDR', 'Driver, get us into the low ground! Left! Now!', 'left'], ['CDR', 'Driver, the scrub, right, 120 metres. Go.', 'right'], ['CDR', 'THE LOW GROUND! AHEAD! GO GO GO!', 'drv_fwd'], ['CDR', 'Driver, hard left.', 'left'],
  ['CDR', 'Driver, move out! Now!', 'drv_fwd'], ['CDR', 'Driver, stop.', 'drv_stop'], ['CDR', 'Radar’s been up too long. Driver, find us a new position.', 'moveout'],
  ['CDR', 'We’re hit. Crew report.', 'hit'], ['CDR', 'WE’RE HIT! IS EVERYONE OKAY?!', 'hit'], ['CDR', 'Target. Cease fire.', 'cease'], ['CDR', 'Miss. Re-engage.', 'reengage_doubt'], ['CDR', 'Gunner, sabot, tank.', 'load_sabot'],
  ['GNR', 'On the way.', 'ontheway'], ['GNR', 'ON THE WAY! ON THE WAY!', 'ontheway'], ['GNR', 'Target! It’s down!', 'target'], ['GNR', 'Gunner’s good.', 'ready'], ['GNR', 'I’m okay— gunner up!', 'ready'], ['GNR', 'Gun’s jammed. Clearing.', 'misfire'], ['GNR', 'Gun’s clear!', 'gun_back'],
  ['LDR', 'Up.', 'up'], ['LDR', 'Loader’s good.', 'ready'], ['DRV', 'Driver’s good.', 'ready'], ['DRV', 'Driver up! Still running!', 'ready'],
  // the pack has nothing that says these: the crewman must stay silent (no machine speech, no line that says something else)
  ['CDR', 'Missile, 3 o\'clock.', null], ['CDR', 'Drone! 11 o\'clock!', null], ['CDR', 'No cover in reach. Hold here.', null], ['CDR', 'All stations, report.', null], ['CDR', 'Good work. Stay sharp.', null], ['CDR', 'It went wide.', null],
  ['CDR', 'FIRE! FIRE! GET OUT! GET OUT!', null], ['CDR', 'Fire!', null], ['CDR', 'It’s blind. Hold your position.', null],
  ['GNR', 'Identified.', null], ['GNR', 'Driver, steady.', null], ['GNR', 'No cut. Still guiding.', null], ['GNR', 'IT DIDN’T WORK! IT’S STILL COMING!', null], ['GNR', 'Beam’s cut. It’s blind.', null], ['GNR', 'HE at fifty rounds.', null],
  ['LDR', 'Trophy, kill.', null], ['LDR', 'Left side’s empty!', null], ['LDR', 'I CAN’T— THE HATCH—', null],
];
for (const [who, s, want] of LINES) { const m = engineLine(who, s, 'fwd'); if ((m && m.ev || null) !== want) bad('engine line', who, JSON.stringify(s), '->', m && m.ev, 'expected', want); }
if (!(engineLine('CDR', 'SMOKE! SMOKE! SMOKE!', null) || {}).cue) bad('smoke must be a sound, not speech');
for (const [order, want] of [['fwd', 'ack_fwd'], ['left', 'ack_left'], ['right', 'ack_right'], ['back', 'onmove'], [null, 'onmove']]) if (engineLine('DRV', 'On it!', order).ev !== want) bad('driver answer after order', order);

// ---- 2. whole battles
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), counts = {}, silent = {}; let lines = 0, minutes = 0, battles = 0;
const forces = [[{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }], [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'sal', n: 1 }, { type: 'rpg', n: 2 }], [{ type: 'rpg', n: 4 }, { type: 'kornet', n: 1 }]];
for (const biome of ['farmland', 'desert', 'town', 'forest']) for (const seed of [1, 2, 3]) for (const [fi, force] of forces.entries()) {
  const mission = ['hold', 'advance', 'hunt'][(seed + fi) % 3];
  const b = new Battle.Battle({ biome, mapSeed: 3, seed, skill: seed % 2 ? 'green' : 'expert', cfg, lookup, force, mission, waves: 2 });
  const asked = [], net = { ready: true, has: (who, ev) => !!(REL[who] && REL[who][ev]), request(who, ev, o) { if (!this.has(who, ev)) return false; asked.push({ t: b.t, who, ev, o: o || {} }); return true; }, flush() { asked.push({ t: b.t, flush: true }); } };
  const cues = [], talk = new CrewTalk(net, { warn() {}, blip: k => cues.push([b.t, k]), smoke: () => cues.push([b.t, 'smoke']) });
  let lost = null, n0 = 0;
  while (b.t < 600 && !(b.over && b.t > (b._overT || (b._overT = b.t)) + 5)) {
    const was = { loaded: b.tank.loaded, mode: b.tank.mode }; b.step(); talk.update(b, b.t, { mission });
    const T = b.tank, E = b.events || [], near = (type, f, w = 0.35) => E.some(e => e.type === type && Math.abs(e.t - b.t) <= w && (!f || f(e)));
    const radio = re => b.volleys.slice(-3).some(v => v.rec && (v.rec.radio || []).some(r => Math.abs(v.t0 + r.t - b.t) <= 1.7 && re.test(r.text)));
    for (const a of asked.slice(n0)) {
      if (a.flush) { lost = lost == null ? b.t : lost; continue; }
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
      if (k === 'LDR.mg_ready' && !(T.ai && T.ai.ldr && T.ai.ldr.up)) bad(biome, seed, '"MG ready" but the loader is not up');
      if (!(REL[a.who] && REL[a.who][a.ev])) bad('asked for a line that is not in the release list', k);
    }
    n0 = asked.length;
  }
  for (const x of talk.trace) if (x[3] === 'silent') { const key = x[1] + ': ' + String(x[2]).replace(/\d+/g, 'N'); silent[key] = (silent[key] || 0) + 1; }
  minutes += b.t / 60; battles++;
}
// ---- 3. report
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
console.log(`${battles} battles, ${minutes.toFixed(0)} minutes of battle, ${lines} lines asked for (${(lines / minutes).toFixed(1)} a minute before the intercom drops the stale ones)`);
console.log('lines:', top(counts).map(([k, n]) => k + ' x' + n).join(', '));
console.log('silent (the pack has no line):'); for (const [k, n] of top(silent).slice(0, 40)) console.log('  ', String(n).padStart(4), k);
console.log(fail ? `CREW TALK TESTS FAILED (${fail})` : 'CREW TALK TESTS PASS'); process.exit(fail ? 1 : 0);
