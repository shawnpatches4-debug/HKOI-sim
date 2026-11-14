// node tests/battle/crew_hit.js [quality ...]
// Replays battles until a missile hits the vehicle without destroying it (the owner's report of 14 Nov 2026: a Konkurs through the
// hull side, fuel cell hit, fire in the hull, a veteran crew still "steady"), and prints each man's stress just before the hit and
// at 1, 3, 6, 10, 20 and 40 s after it, for three kinds of hit: through the armour with a fire, through without a fire, armour held.
// Each crew level is searched on its own (the crew's state changes the fight, so the same seed can play out differently).
const { HK, DMG, Battle } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
const QUALS = process.argv.slice(2).filter(a => /^[a-z]+$/.test(a)); if (!QUALS.length) QUALS.push('green', 'veteran');
const ROLES = ['cdr', 'gnr', 'ldr', 'drv'], AFTER = [1, 3, 6, 10, 20, 40];
const FORCE = [{ type: 'saclos', n: 3 }, { type: 'kornet', n: 1 }, { type: 'rpg', n: 1 }];
const BIOMES = ['farmland', 'desert', 'town', 'forest'];
const opt = (seed, q) => ({ cfg, lookup, biome: BIOMES[seed % 4], mapSeed: 3 + (seed % 5) * 2, seed, skill: 'trained', mission: 'hold', waves: 2, force: FORCE, crewQuality: q });
const FIRE = h => h.comps.some(c => /^fuel|^engine|^trans/.test(c.id));
const KINDS = {
  'through the armour, fire inside (fuel cell or engine)': h => h.penetrated && FIRE(h),
  'through the armour, no fire': h => h.penetrated && !FIRE(h) && !h.comps.some(c => c.id === 'ammo'),
  'armour held': h => !h.penetrated,
};
// the first hit in a battle that is not killing; returned only if it is the battle's first hit and the battle runs on 40 s after it
function firstHit(seed, q) {
  const b = new Battle.Battle(opt(seed, q)); let n = 0;
  while (b.t < 600 && b.tank.alive && !b.over && n++ < 20000) b.step();
  const all = [];
  for (const v of b.volleys) { let rep; try { rep = DMG.report(v.rec, v.cfg); } catch (e) { continue; } for (const h of rep) all.push({ t: v.t0 + h.t, h }); }
  all.sort((a, b) => a.t - b.t);
  return all.length && !all[0].h.killing && all[0].t + 41 < b.t && (!all[1] || all[1].t > all[0].t + 41) ? all[0] : null;
}
function trace(seed, q, t) {
  const b = new Battle.Battle(opt(seed, q)), rows = [], at = [t - 0.2, ...AFTER.map(a => t + a)]; let k = 0, n = 0;
  while (k < at.length && n++ < 20000) {
    b.step();
    if (b.t >= at[k] - 1e-9) { const s = b.crewState(); rows.push([k ? '+' + AFTER[k - 1] + ' s' : 'before', ROLES.map(r => `${r} ${s.who[r].stress.toFixed(2)} ${s.who[r].state.padEnd(8)}${s.who[r].status !== 'ok' ? '/' + s.who[r].status : ''}`).join('  ')]); k++; }
  }
  return rows;
}
module.exports = { firstHit, trace, KINDS };
if (require.main === module) {
  for (const [kind, want] of Object.entries(KINDS)) {
    console.log(`\n== ${kind}`);
    for (const q of QUALS) {
      let found = null; for (let seed = 1; seed < 300 && !found; seed++) { const f = firstHit(seed, q); if (f && want(f.h)) found = { seed, ...f }; }
      if (!found) { console.log(`  ${q}: none found`); continue; }
      const crew = Object.entries(found.h.crew).filter(([, s]) => s !== 'ok').map(([r, s]) => r + ' ' + s).join(', ') || 'nobody hurt';
      console.log(`  ${q}: seed ${found.seed}, ${found.h.name} at ${found.t.toFixed(1)} s on the ${found.h.zoneName}; ${found.h.effect} (${crew})`);
      for (const [w, line] of trace(found.seed, q, found.t)) console.log(`    ${w.padEnd(7)} ${line}`);
    }
  }
}
