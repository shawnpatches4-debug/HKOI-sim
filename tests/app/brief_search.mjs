// node tests/app/brief_search.mjs <what> [max seeds] [biomes] [maps] [force] : an honest seed search for the briefing's battles.
// It fights battles exactly as the page does (tests/app/tour.test.mjs) and prints those whose record holds the moment a chapter needs.
// Nothing is tuned: the battle code is not touched; this only chooses which real battle to show.
//   aim     a lone Kornet, warned by the laser warner, tracked by the cued radar, cut by HKOI's first burst (src/app/targeting.js findAim)
//   limits  an RPG stopped by Trophy, a guided missile handed to Trophy, and a cut missile that still passed within 2.5 m
//   order   a volley of 4 or more in which HKOI cut one and Trophy took at least one
//   drones  an FPV drone shot down by HKOI's airburst
import { createRequire } from 'module';
import fs from 'fs';
import { findAim, findOrder } from '../../src/app/targeting.js';
import { runToEnd } from '../../src/app/scenarios.js';
const require = createRequire(import.meta.url);
const { HK, World, Battle, EnemyVeh, Support } = require('../battle/load.js');
const what = process.argv[2] || 'aim', MAXS = +(process.argv[3] || 20), BIOMES = (process.argv[4] || 'farmland,desert').split(','), MAPS = (process.argv[5] || '1,2,3,4,5,6').split(',').map(Number), FORCE = process.argv[6] || 'ambush';
const mainSrc = fs.readFileSync(new URL('../../src/app/main.js', import.meta.url), 'utf8'), fm = mainSrc.match(/const FORCES = \{[\s\S]*?\n\};/);
const FORCES = Object.assign(new Function(fm[0] + '; return FORCES;')(), EnemyVeh.FORCES, Support.FORCES);
const supportOf = F => { const S = F.support || {}, o = {}; if (S.wingman) o.wingman = S.wingman; if (S.artillery) o.artillery = S.artillery; if (S.scout) o.scout = true; if (S.air) o.air = S.air; return Object.keys(o).length ? o : undefined; };
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
const fight = u => { const F = FORCES[u.force]; return runToEnd(new Battle.Battle({ support: supportOf(F), fate: true, world: new World.World({ seed: u.map, biome: u.biome }), seed: u.seed, cfg, lookup, skill: u.skill, cond: 'day', mission: 'hold', waves: u.waves, commander: 'auto', raid: F.raid, force: F.force, crewQuality: 'trained', crewStress: true })); };
for (const biome of BIOMES) for (const map of MAPS) for (let seed = 1; seed <= MAXS; seed++) {
  const u = { biome, map, force: FORCE, skill: process.env.SKILL || 'trained', waves: +(process.env.WAVES || 1), seed };
  let B; try { B = fight(u); } catch (e) { console.log('error', JSON.stringify(u), e.message); continue; }
  if (what === 'aim') {
    const D = findAim(B, HK); if (!D) continue;
    const strict = D.warn.src === 'lwr' && D.radar.src === 'cued';
    console.log(JSON.stringify(u), JSON.stringify({ R: Math.round(D.R), warn: +D.warn.dt.toFixed(2), meet: Math.round(D.plan.want), cutAt: Math.round(D.cut.d), end: D.end.type, miss: D.end.miss && +D.end.miss.toFixed(1), n: D.n, strict, t: Math.round(D.T0 + D.tL) }));
  } else if (what === 'limits') {
    let rpg = null, handed = null, skim = null;
    for (const v of B.volleys) for (const th of v.rec.threats) { const tags = th.tags || [], e = th.viz.end || {};
      if (!rpg && th.key === 'rpg' && th.defeated_by === 'aps') rpg = { t: Math.round(v.t0 + th.t0), R: Math.round(th.R) };
      if (!handed && th.defeated_by === 'aps' && th.key !== 'rpg' && (tags.includes('handed_to_aps') || (th.skip && th.skip.why === 'min_range'))) handed = { t: Math.round(v.t0 + th.t0), R: Math.round(th.R), key: th.key };
      if (!skim && th.defeated_by === 'hkoi_cut' && e.type === 'miss' && e.miss != null && e.miss < 2.5) skim = { t: Math.round(v.t0 + th.t0), R: Math.round(th.R), key: th.key, miss: +e.miss.toFixed(1), cut: th.viz.sever ? Math.round(HK.distAt(th, th.viz.sever.t)) : null }; }
    if (rpg || handed || skim) console.log(JSON.stringify(u), JSON.stringify({ rpg, handed, skim }), B.tank.alive ? 'alive' : 'lost');
  } else if (what === 'order') {
    const O = findOrder(B, HK); if (!O || O.n < 4) continue;
    console.log(JSON.stringify(u), JSON.stringify({ n: O.n, spread: +O.spread.toFixed(1), kinds: O.rows.map(r => r.key + ':' + r.why).join(' '), aps: O.apsUsed, t: Math.round(O.T0) }));
  } else if (what === 'drones') {
    let one = null; for (const v of B.volleys) for (const th of v.rec.threats) if (!one && /^fpv/.test(th.key) && th.defeated_by === 'hkoi_he') one = { t: Math.round(v.t0 + th.t0), R: Math.round(th.R), d: Math.round(th.viz.end.d) };
    if (one) console.log(JSON.stringify(u), JSON.stringify(one));
  }
}
