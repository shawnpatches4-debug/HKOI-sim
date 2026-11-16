// node tests/app/scenario_search.mjs <card key> [max seeds, default 40] [maps, e.g. 3,6]
// Finds a battle that tells the same story as a scenario card when a change to the battle code has made the card untrue
// (16 Nov 2026: Kornet spin, honest planning table). It fights the battles exactly as tests/app/scenarios.test.mjs does,
// on the card's own ground, force and crew level, trying seeds (and maps when given), and prints each battle whose facts
// satisfy the card's story (STORY below, written from the card's two lines and its "watch for"), with those facts, so the
// card's setup and `expect` can be set to what the battle really does. Nothing is tuned: the battle code is not touched.
import { createRequire } from 'module';
import fs from 'fs';
import { SCENARIOS, runToEnd, facts } from '../../src/app/scenarios.js';
const require = createRequire(import.meta.url);
const { HK, World, Battle, EnemyVeh, Support } = require('../battle/load.js');
const key = process.argv[2], MAXS = +(process.argv[3] || 40), MAPS = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
const mainSrc = fs.readFileSync(new URL('../../src/app/main.js', import.meta.url), 'utf8'), fm = mainSrc.match(/const FORCES = \{[\s\S]*?\n\};/);
const FORCES = Object.assign(new Function(fm[0] + '; return FORCES;')(), EnemyVeh.FORCES, Support.FORCES);
const supportOf = F => { const S = F.support || {}, o = {}; if (S.wingman) o.wingman = S.wingman; if (S.artillery) o.artillery = S.artillery; if (S.scout) o.scout = true; if (S.air) o.air = S.air; return Object.keys(o).length ? o : undefined; };
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
// the story each card tells, as conditions on the battle's facts
const STORY = {
  aim: f => f.alive && f.result === 'won' && f.hits === 0 && f.cut >= 2 && f.trophy === 0,
  ambush: f => f.alive && f.result === 'won' && f.hits === 0 && f.cut >= 4 && f.trophy >= 1,
  drones: f => f.alive && f.result === 'won' && f.hits === 0 && f.airburst >= 8 && f.cut >= 1 && f.trophy === 0 && f.maxHeBursts >= 2,
  layers: f => f.alive && f.hits === 0 && f.cut >= 3 && f.airburst >= 3 && f.trophy >= 2 && f.obsLeft === 0 && f.result === 'withdrawn',
  armour: f => f.alive && f.result === 'won' && f.hits === 0 && f.vehLost >= 3 && f.trophy + f.cut >= 1 && f.secs <= 300,
  stuck: f => !f.alive && f.end === 'knocked_out' && f.stuckSecs != null && f.stuckSecs <= 15 && f.lostSecs - f.stuckSecs >= 120 && f.cut >= 2 && f.trophy >= 1 && f.bailed === 4,
  laststand: f => !f.alive && f.wave >= 2 && f.stuckSecs != null && f.lostSecs > f.stuckSecs && f.cut >= 2 && f.airburst >= 2 && f.trophy >= 1,
  laststand2: f => !f.alive && f.end === 'knocked_out' && f.stuckSecs != null && f.stuckSecs <= 30 && f.lostSecs - f.stuckSecs >= 300 && f.cut >= 2,   /* 16 Nov: Trophy no longer always runs dry; the card says what it does */
  alone: f => f.alive && f.result === 'won' && f.down >= 1 && f.cdr === 'ok',   /* 16 Nov: three crew down with the vehicle still fighting no longer happens in about 600 battles searched; the card now shows one crewman down */
  open: f => !f.alive && f.end === 'knocked_out' && f.secs <= 90 && f.fired >= 10 && f.cut >= 1 && f.trophy >= 2 && f.bailed === 4,
  expert: f => !f.alive && f.end === 'catastrophic' && f.stuckSecs != null && f.lostSecs > f.stuckSecs && f.lostSecs <= 60 && f.trophy >= 1 && f.cut >= 1,   /* 16 Nov: rewritten as the quick loss most of these battles now are (30 of 40 seeds lost) */
  platoon: f => f.alive && f.result === 'won' && f.wing === 'ok' && f.hits === 0 && f.wingHits === 0 && f.assistKills >= 1 && f.cut >= 1 && f.trophy >= 1,
  bombers: f => f.alive && f.result === 'won' && f.bombersDown >= 1 && f.bombHits >= 1 && f.end === 'mobility_kill' && f.hits === 0,
};
const sc = SCENARIOS.find(s => s.key === key); if (!sc || !STORY[key]) { console.log('unknown card', key); process.exit(1); }
const u0 = Object.assign({}, sc.setup, process.env.WAVES ? { waves: +process.env.WAVES } : {}, process.env.FORCE ? { force: process.env.FORCE } : {}, process.env.SKILL ? { skill: process.env.SKILL } : {}, process.env.BIOME ? { biome: process.env.BIOME } : {}), F = FORCES[u0.force];   /* WAVES=, FORCE=, SKILL=, BIOME= widen the search when the card's own setup no longer tells its story */
let found = 0;
for (const map of MAPS || [u0.map]) for (let seed = 1; seed <= MAXS; seed++) {
  const u = Object.assign({}, u0, { map, seed });
  const B = new Battle.Battle({ support: supportOf(F), fate: true, world: new World.World({ seed: u.map, biome: u.biome }), seed: u.seed, cfg, lookup, skill: u.skill, cond: 'day', mission: 'hold', waves: u.waves, commander: 'auto', raid: F.raid, force: F.force, crewQuality: 'trained', crewStress: true, armour: false, tank: undefined });
  const f = facts(runToEnd(B));
  if (process.env.SHOW) console.log(seed, map, JSON.stringify({ alive: f.alive, result: f.result, secs: f.secs, fired: f.fired, hits: f.hits, cut: f.cut, trophy: f.trophy, vehLost: f.vehLost, end: f.end, stuck: f.stuckSecs, lost: f.lostSecs, wave: f.wave, down: f.down, tl: f.trophyLeft }));
  if (STORY[key](f)) { found++; console.log(JSON.stringify({ key, map, seed, waves: u.waves, force: u.force, skill: u.skill, biome: u.biome }), JSON.stringify(f)); if (found >= 3) process.exit(0); }
}
console.log(key, 'found', found);
