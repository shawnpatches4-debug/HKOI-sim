// node tests/battle/maps.js [raids] [force] [skill] [placements] : the Monte Carlo map by map. For each kind of ground the real battle is
// set up 24 times (enemy and tank choose their own positions), the enemy's opening volley is captured, and those openings are replayed
// with fresh dice under the four setups. Each map gets its own result.
const { HK, World, Battle } = require('./load.js'), Study = require('../../src/battle/study.js');
const n = +(process.argv[2] || 2000), fk = process.argv[3] || 'ambush', skill = process.argv[4] || 'trained', K = +(process.argv[5] || 24);
const FORCES = { light: { force: [{ type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] }, ambush: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] }, drones: { force: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }] }, standoff: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], raid: { minR: 2000, window: 6 } }, heavy: { force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] } };
const pc = x => (100 * x).toFixed(1).padStart(5) + '%', t0 = Date.now();
console.log(`${fk} force, ${skill} crews, hold mission: ${K} placements a map, ${n} raids per setup replaying the opening volleys.`);
console.log('map'.padEnd(10), 'both | Trophy | HKOI | neither || +HKOI with Trophy saved/cost (z) || openings, launches each, nearest/median/farthest m, hull-down');
for (const biome of ['farmland', 'desert', 'town', 'forest']) { const world = new World.World({ seed: 3, biome });
  const run = Study.mapStart({ HK, Battle: Battle.Battle }, Object.assign({ world, skill, mission: 'hold', cfg: HK.defaultConfig() }, FORCES[fk]), n, K); while (!Study.raidStep(HK, run, 250));
  const I = Study.mapInfo(run); if (!run.n) { console.log(biome.padEnd(10), `the enemy never got a shot in ${I.placements} placements`); continue; }
  const R = {}; for (const st of Study.SETUPS) R[st.key] = Study.raidSummary(run.S[st.key]); const p = Study.paired(run.S.both, run.S.aps);
  console.log(biome.padEnd(10), `${pc(R.both.survival)} | ${pc(R.aps.survival)} | ${pc(R.hkoi.survival)} | ${pc(R.none.survival)} || ${p.saved}/${p.cost} (${p.z.toFixed(1)}) || ${I.openings} of ${I.placements}, ${I.launchesPerOpening.toFixed(1)}, ${I.nearest}/${I.median}/${I.farthest}, ${Math.round(100 * I.hullDown)}% | ${JSON.stringify(I.keys)}`); }
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
