// node tests/battle/battle.test.js : runs battles on each setting; checks determinism and prints what happened
const { HK, World, Battle } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg); let fail = 0;
const run = (biome, mapSeed, seed, skill, verbose) => { const b = new Battle.Battle({ biome, mapSeed, seed, skill, cfg, lookup, force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] }); b.run(360); if (verbose) for (const l of b.log) console.log('  ' + String(l.t).padStart(6), (l.kind + '      ').slice(0, 7), l.text, l.why ? '[' + l.why + ']' : ''); return b; };
for (const biome of ['farmland', 'desert', 'town', 'forest']) for (const skill of ['green', 'expert']) {
  const t0 = Date.now(), b = run(biome, 3, 1, skill, biome === 'farmland' && skill === 'expert'), s = b.summary(), b2 = run(biome, 3, 1, skill, false);
  if (JSON.stringify(b2.summary()) !== JSON.stringify(s)) { fail++; console.log('FAIL not deterministic', biome, skill); }
  console.log(biome.padEnd(9), skill.padEnd(7), JSON.stringify(s), Date.now() - t0, 'ms', 'units', b.units.length, 'masked', b.volleys.reduce((n, v) => n + v.masks.filter(m => m != null).length, 0));
}
console.log(fail ? 'FAILED' : 'BATTLE TESTS PASS'); process.exit(fail ? 1 : 0);
