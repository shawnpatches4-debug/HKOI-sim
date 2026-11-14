// node tests/battle/armour.js [n] : what the optional armour rule (cfg.vehicle.armour) does. Chance that a HIT knocks the vehicle out, by
// weapon and by the direction it comes from, against the engine's one flat chance; then the standard raid and a stress attack both ways.
const { HK } = require('./load.js'), Study = require('../../src/battle/study.js'), N = +(process.argv[2] || 600);
const R = { kornet: 2500, saclos: 1500, sal: 3000, rpg: 250, fpv: 1500 }, dirs = [['front', 0], ['front quarter', 40], ['side', 90], ['rear quarter', 140], ['rear', 180]];
function pk(key, rel, armour, hullDown) { const c = HK.defaultConfig(); c.hkoi_enabled = false; c.aps.enabled = false; c.crew.enabled = false; c.enemy.gunner_jitter_mrad = 0; c.enemy.mix = { [key]: 1 }; c.vehicle.armour = armour; c.vehicle.hull_deg = 0; if (hullDown) c.vehicle.half_h *= 0.5;
  c.enemy.fixed = [{ key, R: R[key], brg: rel, t0: 0, id: 0, uid: 0 }]; let hit = 0, kill = 0; for (let i = 0; i < N; i++) { const m = HK.runMission(c, new HK.RNG(HK.seedFor(5, i)), {}, null); if (m.hits > 0) { hit++; if (m.killed) kill++; } } return hit ? Math.round(100 * kill / hit) : NaN; }
console.log(`Chance a hit knocks the vehicle out (${N} shots each). "flat" is the engine's rule today.`);
console.log('weapon'.padEnd(9), 'flat', dirs.map(d => d[0].padStart(14)).join(''), '   hull-down, front');
for (const k of Object.keys(R)) console.log(k.padEnd(9), String(pk(k, 0, false) + '%').padStart(4), dirs.map(([, d]) => String(pk(k, d, true) + '%').padStart(14)).join(''), String(pk(k, 0, true, true) + '%').padStart(19));
const pc = x => (100 * x).toFixed(1) + '%';
for (const armour of [false, true]) { const base = HK.defaultConfig(); base.vehicle.armour = armour;
  const run = Study.raidStart(HK, base, { preset: 'old' }, 1500); while (!Study.raidStep(HK, run, 500));
  const st = Study.stressStart(HK, base, { group: 4, gap: 10, max: 60, jitter: 2, pilot: 'trained' }, 800); while (!Study.stressStep(HK, st, 200));
  console.log(`\n${armour ? 'ARMOUR DECIDES' : 'FLAT CHANCE (today)'}: standard raid, vehicle survives: ` + Study.SETUPS.map(s => `${s.name} ${pc(Study.raidSummary(run.S[s.key]).survival)}`).join(' | '));
  console.log('   stress attack (groups of 4, trained), threats survived, typical: ' + Study.SETUPS.map(s => { const r = Study.stressSummary(st, s.key); return `${s.name} ${r.median - 1}`; }).join(' | ')); }
