// node tests/battle/waves.js [waves] [mission] : how battles in several waves go. For each crew level: how they end, how long they last,
// the longest stretch with nothing fired by anyone (apart from the planned lulls), and what stopped the guided missiles.
const { HK, World, Battle } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), waves = +(process.argv[2] || 3), mission = process.argv[3] || 'hold';
for (const skill of ['green', 'trained', 'expert', 'veteran']) {
  const A = { n: 0, lost: 0, won: 0, wd: 0, obj: 0, time: 0, T: 0, quiet: [], fired: 0, by: {}, g: 0, killed: 0, wavesSeen: 0, worst: 0 };
  for (const biome of ['farmland', 'desert', 'town', 'forest']) for (const mapSeed of [3, 7]) for (const seed of [1, 2]) {
    const b = new Battle.Battle({ biome, mapSeed, seed, skill, mission, waves, cfg, lookup, force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] });
    let lastEvt = 0, quiet = 0, nv = 0, ns = 0, nm = 0;
    while (b.t < 1800 && b.tank.alive && !b.over) { const t0 = Date.now(), p = !!b._pending, v0 = b.volleys.length; b.step(); const d = Date.now() - t0; if (!p && !b._pending && v0 === b.volleys.length) A.worst = Math.max(A.worst, d);
      const evt = b.volleys.length !== nv || (b.shots || []).length !== ns || (b.mgs || []).length !== nm || b._volleyActive() || b.waveAt != null; nv = b.volleys.length; ns = (b.shots || []).length; nm = (b.mgs || []).length;
      if (evt) lastEvt = b.t; else quiet = Math.max(quiet, b.t - lastEvt); }
    A.n++; A.T += b.t; A.quiet.push(quiet); A.wavesSeen += b.wave + 1; A.killed += (b.killedByTank || 0) + (b.killedByMg || 0);
    if (!b.tank.alive) A.lost++; else if (b.over) { if (b.over.result === 'won') A.won++; else if (b.over.result === 'objective') A.obj++; else A.wd++; } else A.time++;
    for (const v of b.volleys) for (const th of v.rec.threats) { A.fired++; const l = v.launches.find(q => q.u.id === th.uid); if (!l || (l.key !== 'kornet' && l.key !== 'saclos')) continue; let d = th.defeated_by || (th.state === 'hit' ? 'HIT' : th.state); if (/^hkoi/.test(d)) d = 'HKOI'; A.by[d] = (A.by[d] || 0) + 1; A.g++; }
  }
  const g = k => String(Math.round(100 * (A.by[k] || 0) / Math.max(1, A.g))).padStart(3) + '%', q = A.quiet.sort((x, y) => x - y);
  console.log(skill.padEnd(8), `vehicle lost ${String(A.lost).padStart(2)}/${A.n} | enemy beaten ${String(A.won).padStart(2)} | objective ${A.obj} | withdrew ${A.wd} | timed out ${A.time} | mean length ${String(Math.round(A.T / A.n)).padStart(4)} s | waves reached ${(A.wavesSeen / A.n).toFixed(1)} | threats ${(A.fired / A.n).toFixed(1)} | teams destroyed ${(A.killed / A.n).toFixed(1)} | longest dead time: median ${Math.round(q[q.length >> 1])} s, worst ${Math.round(q[q.length - 1])} s`);
  console.log('         guided missiles: HKOI', g('HKOI'), '| Trophy', g('aps'), '| gunner missed', g('gunner_jitter'), '| behind cover', g('terrain_mask'), '| HIT', g('HIT'), '| worst step', A.worst, 'ms');
}
