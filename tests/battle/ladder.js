// node tests/battle/ladder.js [battles per rung] : fights every rung of the ladder several times (battle seeds 1..n) with both defences and with
// Trophy only, and prints how often the vehicle survives and the mean score. Used to put the rungs in order of difficulty honestly.
const { HK, World, Battle } = require('./load.js'), Ladder = require('../../src/battle/ladder.js'), Study = require('../../src/battle/study.js');
const n = +(process.argv[2] || 12), worlds = {};
for (const [i, r] of Ladder.RUNGS.entries()) {
  const wk = r.biome + ':' + r.map, world = worlds[wk] || (worlds[wk] = new World.World({ seed: r.map, biome: r.biome })), out = [];
  for (const st of [Study.SETUPS[0], Study.SETUPS[1]]) { const cfg = Study.cfgFor(HK, HK.defaultConfig(), st), lookup = st.hkoi ? HK.meetLookup(cfg) : {}; let surv = 0, sc = 0, T = 0, res = {};
    for (let seed = 1; seed <= n; seed++) { const b = new Battle.Battle({ world, seed, cfg, lookup, cond: r.cond, mission: r.mission, skill: r.skill, waves: r.waves, force: r.force, raid: r.raid }); let k = 0; while (b.t < 1800 && b.tank.alive && !b.over && k++ < 40000) b.step(); const d = Ladder.debrief(b); if (d.alive) surv++; sc += d.score; T += d.t; res[d.result] = (res[d.result] || 0) + 1; }
    out.push(`${st.name}: survives ${String(Math.round(100 * surv / n)).padStart(3)}%  score ${String(Math.round(sc / n)).padStart(2)}  ${String(Math.round(T / n)).padStart(4)} s  ${JSON.stringify(res)}`); }
  console.log(String(i + 1).padStart(2), r.name.padEnd(22), out.join('  ||  '));
}
