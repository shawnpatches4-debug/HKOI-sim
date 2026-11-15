// node tests/battle/support_off.js [--rebase]
// Friendly support, the bomber drone (src/battle/support.js) and the acting-out of a crippled tank (src/battle/fate.js) are OFF
// unless a battle asks for them. With them off every battle must be exactly the battle from before those files and their hooks in
// battle.js existed: 32 battles (four kinds of ground, four crew levels, three missions, one or two waves, five forces of which two
// have enemy vehicles and a commander, crew stress on and off, the armour option on and off) are compared with
// tests/battle/support_off_baseline.json, which was written from the code as it stood after merging claude/loving-newton-czylil on
// 15 Nov 2026, BEFORE any of this work. Compared: the summary, the result, and a checksum over every log line, every event and
// every team's and vehicle's end state.
// (--rebase rewrites the file from the present code: only after a deliberate change to the battle.)
const fs = require('fs'), path = require('path');
const { HK, Battle, EnemyVeh } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), REBASE = process.argv.includes('--rebase');
const BASE = path.join(__dirname, 'support_off_baseline.json');
const BIOMES = ['farmland', 'desert', 'town', 'forest'], SKILLS = ['green', 'trained', 'expert', 'veteran'], MISSIONS = ['hold', 'advance', 'hunt'];
const FORCES = [
  [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }],
  [{ type: 'saclos', n: 1 }, { type: 'rpg', n: 3 }, { type: 'fpv', n: 2 }],
  [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv_fiber', n: 1 }],
  EnemyVeh.FORCES.mech_ambush.force, EnemyVeh.FORCES.armoured_counter.force,
];
const CASES = []; for (let i = 0; i < 32; i++) CASES.push({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 3) * 4, seed: i + 1, skill: SKILLS[(i >> 1) % 4], mission: MISSIONS[i % 3], waves: 1 + (i % 2), force: FORCES[i % 5], crewStress: i % 4 < 2, commander: i % 5 >= 3 ? 'auto' : false, armour: i % 7 === 0 });
const sum = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const digest = b => ({ summary: b.summary(), over: b.over ? b.over.result : null, log: b.log.length, events: (b.events || []).length, logSum: sum(b.log.map(l => l.t + '|' + l.text + '|' + (l.why || '')).join('\n')), evSum: sum(JSON.stringify(b.events || [])), units: sum(JSON.stringify(b.units.map(u => [u.id, u.type, +u.e.toFixed(2), +u.n.toFixed(2), u.state, u.ammo, u.alive]))), vehs: sum(JSON.stringify(b.vehicles ? b.vehicles().map(v => [v.id, v.kind, +v.e.toFixed(2), +v.n.toFixed(2), v.state, v.alive]) : [])) });
const runCase = c => { const b = new Battle.Battle(Object.assign({ cfg, lookup }, c)); let n = 0; while (b.t < 360 && n++ < 100000 && !b.over && b.tank.alive) b.step(); return b; };
if (REBASE) { fs.writeFileSync(BASE, JSON.stringify(CASES.map(c => digest(runCase(c))), null, 1)); console.log('baseline rewritten'); process.exit(0); }
const base = JSON.parse(fs.readFileSync(BASE, 'utf8')); let same = 0, fail = 0;
CASES.forEach((c, i) => { const d = JSON.stringify(digest(runCase(c))); if (d === JSON.stringify(base[i])) same++; else { fail++; console.log('FAIL battle', i, c.biome, c.skill, c.mission, '\n   now ', d.slice(0, 400), '\n   was ', JSON.stringify(base[i]).slice(0, 400)); } });
console.log(`Support, bomber drone and fate off: ${same} of ${CASES.length} battles identical to the battles from before the modules existed (summary, result, every log line, every event, every team's and vehicle's end state).`);
console.log(fail ? 'FAILED' : 'SUPPORT OFF: IDENTICAL'); process.exit(fail ? 1 : 0);
