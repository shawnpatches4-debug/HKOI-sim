// node tests/battle/orders.js [--rebase]
// The player's orders (src/battle/orders.js, the hooks in src/battle/tankai.js).
//  1. With the crew in command (the default) every battle is exactly the battle from before the orders existed: the 24 battles of
//     tests/battle/vehicles_off.js (same cases, same checksum, but with the teams' present judgement left on) against
//     tests/battle/orders_off_baseline.json, which was written from the code BEFORE any orders hook went in.
//     (--rebase rewrites it from the present code: only after a deliberate change.)
//  2. The same seed and the same orders give the same battle twice, also when the orders come back as a recorded list (a replay).
//  3. Each order does what it says.
const fs = require('fs'), path = require('path');
const { HK, Battle } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), REBASE = process.argv.includes('--rebase');
const BASE = path.join(__dirname, 'orders_off_baseline.json');
const BIOMES = ['farmland', 'desert', 'town', 'forest'], SKILLS = ['green', 'trained', 'expert', 'veteran'], MISSIONS = ['hold', 'advance', 'hunt'];
const FORCES = [
  [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }],
  [{ type: 'saclos', n: 1 }, { type: 'rpg', n: 3 }, { type: 'fpv', n: 2 }],
  [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv_fiber', n: 1 }],
];
const CASES = []; for (let i = 0; i < 24; i++) CASES.push({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 3) * 4, seed: i + 1, skill: SKILLS[(i >> 1) % 4], mission: MISSIONS[i % 3], waves: 1 + (i % 2), force: FORCES[i % 3], crewStress: i % 4 < 2 });
const sum = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const digest = b => ({ summary: b.summary(), over: b.over ? b.over.result : null, log: b.log.length, events: (b.events || []).length, logSum: sum(b.log.map(l => l.t + '|' + l.text + '|' + (l.why || '')).join('\n')), evSum: sum(JSON.stringify(b.events || [])), units: sum(JSON.stringify(b.units.map(u => [u.id, u.type, +u.e.toFixed(2), +u.n.toFixed(2), u.state, u.ammo, u.alive]))) });
const mk = (c, extra) => new Battle.Battle(Object.assign({ cfg, lookup }, c, extra || {}));
if (REBASE) { fs.writeFileSync(BASE, JSON.stringify(CASES.map(c => digest(mk(c).run(360))), null, 1)); console.log('baseline rewritten:', BASE); process.exit(0); }
let fail = 0; const ok = (cond, what, detail) => { if (cond) console.log('  ok    ' + what); else { fail++; console.log('  FAIL  ' + what + (detail ? '\n        ' + detail : '')); } };

// ---- 1. the crew in command: nothing has changed
console.log('1. crew in command (orders off): 24 battles against the stored baseline');
{ const base = JSON.parse(fs.readFileSync(BASE, 'utf8')); let same = 0;
  CASES.forEach((c, i) => { const b = mk(c).run(360), d = JSON.stringify(digest(b)); if (d === JSON.stringify(base[i]) && b.cmd === null) same++; else console.log('        differs: battle', i, c.biome, c.skill, c.mission); });
  ok(same === CASES.length, `${same} of ${CASES.length} battles identical (summary, result, every log line, every event, every team's end state)`); }
