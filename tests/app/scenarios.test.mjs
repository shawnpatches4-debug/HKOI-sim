// node tests/app/scenarios.test.mjs [show] : every battle on the Scenarios page (src/app/scenarios.js) is fought here, built exactly
// as the page builds it, and compared with what its card says. Fails when a card has stopped being true, so a later change to
// the battle code cannot leave the page describing battles that no longer happen. `show` prints every card and its facts.
import { createRequire } from 'module';
import fs from 'fs';
import { SCENARIOS, runToEnd, facts, mismatches, cardText } from '../../src/app/scenarios.js';
const require = createRequire(import.meta.url);
const { HK, World, Battle, EnemyVeh, Support } = require('../battle/load.js');
const show = process.argv[2] === 'show';
// the page's own list of enemy forces, read out of main.js so that this test and the page can never disagree about a force
const mainSrc = fs.readFileSync(new URL('../../src/app/main.js', import.meta.url), 'utf8'), fm = mainSrc.match(/const FORCES = \{[\s\S]*?\n\};/);
if (!fm) { console.log('FAIL cannot find FORCES in src/app/main.js'); process.exit(1); }
const FORCES = Object.assign(new Function(fm[0] + '; return FORCES;')(), EnemyVeh.FORCES, Support.FORCES);
// the page fights every battle with fate on (src/battle/fate.js) and the force's own support with every support choice on 'Auto' (supportOf in main.js)
const supportOf = F => { const S = F.support || {}, o = {}; if (S.wingman) o.wingman = S.wingman; if (S.artillery) o.artillery = S.artillery; if (S.scout) o.scout = true; if (S.air) o.air = S.air; return Object.keys(o).length ? o : undefined; };
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
let bad = 0; const fail = (...a) => { bad++; console.log('FAIL', ...a); };
const keys = new Set();
for (const sc of SCENARIOS) {
  const u = sc.setup, F = FORCES[u.force];
  if (keys.has(sc.key)) fail(sc.key, 'listed twice'); keys.add(sc.key);
  if (!F) { fail(sc.key, 'unknown force', u.force); continue; }
  // as battleOpts() in main.js builds it for a scenario: hold, own crew trained with stress on, armour off, day, default position
  const B = new Battle.Battle({ support: supportOf(F), fate: true, world: new World.World({ seed: u.map, biome: u.biome }), seed: u.seed, cfg, lookup, skill: u.skill, cond: 'day', mission: 'hold', waves: u.waves, commander: 'auto', raid: F.raid, force: F.force, crewQuality: 'trained', crewStress: true, armour: false, tank: undefined });
  const f = facts(runToEnd(B)), miss = mismatches(sc, f), t = cardText(sc);
  for (const m of miss) fail(sc.key, m);
  for (const line of t.lines.concat(t.watch, sc.name)) { if (/undefined|NaN|—/.test(line)) fail(sc.key, 'bad text:', line); if (!line || line.length > 240) fail(sc.key, 'text missing or too long:', line); }
  if (t.lines.length !== 2) fail(sc.key, 'a card has two lines');
  if (show) console.log(`\n${sc.name} [${sc.key}] ${JSON.stringify(u)}\n  ${t.lines[0]}\n  ${t.lines[1]}\n  ${t.watch}\n  ${JSON.stringify(f)}`);
  else console.log(miss.length ? 'FAIL' : 'ok  ', sc.key.padEnd(11), `${f.secs} s, fired ${f.fired}, hits ${f.hits}, cut ${f.cut}, airburst ${f.airburst}, Trophy ${f.trophy}`);
}
console.log(bad ? `SCENARIO TESTS FAILED: ${bad}` : `SCENARIO TESTS PASS (${SCENARIOS.length} battles match their cards)`);
process.exit(bad ? 1 : 0);
