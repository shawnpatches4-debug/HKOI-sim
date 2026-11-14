// node tests/battle/standard.js [battles per cell, default 200] [skills, e.g. trained,veteran] [commander: off | auto]
// The five standard forces of the setup screen (src/app/main.js FORCES) at the chosen crew levels, with HKOI + Trophy, Trophy only,
// HKOI only and neither, on the same seeds: share of battles in which the M1 was lost, and how hard the enemy fought.
// Used to compare the enemy's logic before and after a change (run it on both versions of the code and put the tables side by side).
// 200 battles a cell: a margin of about +-7 points on a loss rate.
const { HK, Battle } = require('./load.js');
const args = process.argv.slice(2), N = +(args.find(a => /^\d+$/.test(a)) || 200), SKILLS = (args.find(a => /^[a-z,]+$/.test(a) && !/^(off|auto)$/.test(a)) || 'trained,veteran').split(','), CDR = args.includes('auto') ? 'auto' : false;
const cfg = HK.defaultConfig();
const FORCES = {
  light: { force: [{ type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  ambush: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  drones: { force: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }] },
  standoff: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], raid: { minR: 2000, window: 6 } },
  heavy: { force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] },
};
const BIOMES = ['farmland', 'desert', 'town', 'forest'], MISSIONS = ['hold', 'hold', 'advance', 'hunt'];
function setup(kind) { const c = JSON.parse(JSON.stringify(cfg)); if (kind === 'trophy' || kind === 'neither') c.hkoi_enabled = false; if (kind === 'hkoi' || kind === 'neither') c.aps.enabled = false; return { cfg: c, lookup: c.hkoi_enabled ? HK.meetLookup(c) : {} }; }
const SETUPS = { both: setup('both'), trophy: setup('trophy'), hkoi: setup('hkoi'), neither: setup('neither') };
const pc = (x, n) => (n ? (100 * x / n).toFixed(0) : '0').padStart(3) + '%';
console.log(`Standard forces, ${N} battles a cell (ground and mission mixed: hold, hold, advance, hunt; one wave; up to 600 s), commander ${CDR || 'off'}. M1 lost:`);
console.log('force     crews     both  Trophy  HKOI  neither |  with both defences: launched/battle  hits/battle  teams lost/battle  length s  steps mean ms');
let steps = 0, ms = 0;
for (const key of Object.keys(FORCES)) for (const skill of SKILLS) {
  const row = {}; let fired = 0, hits = 0, kills = 0, len = 0;
  for (const su of ['both', 'trophy', 'hkoi', 'neither']) { let lost = 0;
    for (let i = 0; i < N; i++) {
      const b = new Battle.Battle(Object.assign({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 500 + i, skill, mission: MISSIONS[i % 4], waves: 1, force: FORCES[key].force, raid: FORCES[key].raid, commander: CDR }, SETUPS[su]));
      const t0 = Date.now(); let n = 0; while (b.t < 600 && b.tank.alive && !b.over && n < 100000) { b.step(); n++; } if (su === 'both') { steps += n; ms += Date.now() - t0; }
      if (!b.tank.alive) lost++; if (su === 'both') { const s = b.summary(); fired += s.fired; hits += s.hits; kills += s.killedByTank + s.killedByMg; len += b.t; }
    }
    row[su] = lost; }
  console.log(`${key.padEnd(9)} ${skill.padEnd(8)} ${pc(row.both, N)}   ${pc(row.trophy, N)}  ${pc(row.hkoi, N)}    ${pc(row.neither, N)}  |  ${(fired / N).toFixed(2).padStart(6)}  ${(hits / N).toFixed(2).padStart(5)}  ${(kills / N).toFixed(2).padStart(5)}  ${Math.round(len / N).toString().padStart(4)}  ${(ms / Math.max(1, steps)).toFixed(3)}`);
}
