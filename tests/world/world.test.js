// node tests/world/world.test.js  — checks the battlefield model: determinism, sight-line symmetry, planners return sane results.
const { World, BIOMES } = require('../../src/world/world.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
for (const biome of Object.keys(BIOMES)) for (const seed of [1, 2, 7]) {
  const t0 = Date.now(), w = new World({ seed, biome }), tg = Date.now() - t0, s = w.stats();
  const w2 = new World({ seed, biome }); let same = true; for (let k = 0; k < w.H.length; k += 97) if (w.H[k] !== w2.H[k] || w.V[k] !== w2.V[k]) same = false; ok(same, 'deterministic ' + biome + seed);
  // sight lines are symmetric when both ends are at the same height above ground
  let asym = 0, clear = 0, N = 300; const r = w.constructor ? require('../../src/world/world.js').mulberry(seed) : null;
  for (let q = 0; q < N; q++) { const a = [(r() - .5) * 7000, (r() - .5) * 7000], b = [(r() - .5) * 7000, (r() - .5) * 7000], l1 = w.los(a[0], a[1], 2, b[0], b[1], 2).clear, l2 = w.los(b[0], b[1], 2, a[0], a[1], 2).clear; if (l1 !== l2) asym++; if (l1) clear++; }
  ok(asym <= N * 0.03, 'los symmetric ' + biome + seed + ' asym ' + asym);
  const t1 = Date.now(), sites = w.ambushSites(0, 0, { rmin: 800, rmax: 4000 }), ta = Date.now() - t1; ok(sites.length > 5, 'ambush sites ' + biome + seed + ' ' + sites.length);
  const t2 = Date.now(), vs = w.viewshed(0, 0, 2.2, 4000, 125), tv = Date.now() - t2;
  const obs = sites.slice(0, 3).map(s => ({ e: s.e, n: s.n })), cov = obs.length ? w.coverFrom(0, 0, obs, { radius: 400 }) : [];
  const t3 = Date.now(), p = w.path(0, 0, 2500, 2500), tp = Date.now() - t3; ok(!!p || biome === 'forest', 'path ' + biome + seed);
  ok(w.passable(0, 0, true), 'centre passable ' + biome + seed);
  console.log(biome.padEnd(9), 'seed', seed, JSON.stringify(s), '| gen', tg, 'ms | clear pairs', Math.round(100 * clear / N) + '% | sites', sites.length, 'best', sites[0] && sites[0].score.toFixed(2), ta, 'ms | visible cells', vs.length, tv, 'ms | cover spots', cov.length, 'all-hidden', cov.filter(c => c.all).length, '| path', p ? p.length : null, tp, 'ms');
}
console.log(fail ? fail + ' FAILED' : 'WORLD TESTS PASS'); process.exit(fail ? 1 : 0);
