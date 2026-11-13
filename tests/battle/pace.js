// node tests/battle/pace.js [seconds] : how fast and how hard the two sides fight. Runs a set of battles and prints, per setting:
// first shot time, engagements, missiles fired, mean wait between "a team first has the vehicle in sight" and its launch, hits, vehicle lost.
const { HK, World, Battle } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), secs = +(process.argv[2] || 360), mission = process.argv[3] || 'hold';
const rows = [];
for (const biome of ['farmland', 'desert', 'town', 'forest']) for (const skill of ['green', 'trained', 'expert']) {
  const A = { first: [], vol: 0, fired: 0, hits: 0, lost: 0, wait: [], n: 0, kt: 0, km: 0 };
  for (const seed of [1, 2, 3]) for (const mapSeed of [3, 7]) {
    const b = new Battle.Battle({ biome, mapSeed, seed, skill, mission, cfg, lookup, force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] });
    const seenAt = {}; let tPrev = 0;
    while (b.t < secs && b.tank.alive && !b.over) { b.step(); for (const u of b.units) { if (u.sight > 0 && seenAt[u.id] == null) seenAt[u.id] = b.t; if (u.sight === 0 && u.state === 'hidden') delete seenAt[u.id]; }
      for (const v of b.volleys) if (!v._seen) { v._seen = 1; for (const l of v.launches) { if (seenAt[l.u.id] != null) A.wait.push(v.t0 + l.t0 - seenAt[l.u.id]); delete seenAt[l.u.id]; } } }
    A.n++; if (b.volleys.length) A.first.push(b.volleys[0].t0); A.vol += b.volleys.length; A.fired += b.volleys.reduce((n, v) => n + v.launches.length, 0); A.hits += b.volleys.reduce((n, v) => n + (v.rec.hits || 0), 0); if (!b.tank.alive) A.lost++; A.kt += b.killedByTank || 0; A.km += b.killedByMg || 0;
  }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '-';
  console.log(biome.padEnd(9), skill.padEnd(8), `first shot ${avg(A.first).padStart(3)} s | engagements ${(A.vol / A.n).toFixed(1)} | missiles ${(A.fired / A.n).toFixed(1)} | sight-to-launch ${avg(A.wait).padStart(3)} s | hits ${(A.hits / A.n).toFixed(2)} | vehicle lost ${A.lost}/${A.n} | teams killed gun ${(A.kt / A.n).toFixed(1)} mg ${(A.km / A.n).toFixed(1)}`);
}
