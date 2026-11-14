// node tests/battle/raids.js [raids] [force|all] [skill|all] : the Monte Carlo behind "run the numbers".
// Every raid is fought under the four setups on the same random draws; the paired count says what adding HKOI changed.
// Nothing here is tuned: a row where HKOI makes no difference, or a worse one, is printed like any other and counted at the end.
const { HK, Battle } = require('./load.js'), Study = require('../../src/battle/study.js');
const n = +(process.argv[2] || 2000), fArg = process.argv[3] || 'all', sArg = process.argv[4] || 'all';
const FORCES = { old: null, light: { force: [{ type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] }, ambush: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] }, drones: { force: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }] }, standoff: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], raid: { minR: 2000, window: 6 } }, heavy: { force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] } };
const pc = x => (100 * x).toFixed(1).padStart(5) + '%', t0 = Date.now(); let worse = 0, flat = 0, rows = 0;
console.log(`${n} raids per setup, same raids for all four. Columns: both | Trophy only | HKOI only | neither || HKOI added to Trophy: saved/cost (z) || HKOI alone vs nothing: saved/cost (z)`);
for (const fk of Object.keys(FORCES)) { if (fArg !== 'all' && fArg !== fk) continue;
  for (const sk of fk === 'old' ? ['-'] : Object.keys(Battle.SKILL)) { if (fk !== 'old' && sArg !== 'all' && sArg !== sk) continue;
    const sc = fk === 'old' ? { preset: 'old' } : Object.assign({ preset: 'setup', jitter: Battle.SKILL[sk].jitter, pilot: Battle.SKILL[sk].pilot }, FORCES[fk]);
    const run = Study.raidStart(HK, HK.defaultConfig(), sc, n); while (!Study.raidStep(HK, run, 500));
    const R = {}; for (const st of Study.SETUPS) R[st.key] = Study.raidSummary(run.S[st.key]); const p1 = Study.paired(run.S.both, run.S.aps), p2 = Study.paired(run.S.hkoi, run.S.none);
    rows++; if (p1.z <= -2 || p2.z <= -2) worse++; else if (p1.z < 2) flat++;
    console.log(`${fk.padEnd(9)}${sk.padEnd(8)} ${pc(R.both.survival)} | ${pc(R.aps.survival)} | ${pc(R.hkoi.survival)} | ${pc(R.none.survival)} || ${String(p1.saved).padStart(4)}/${String(p1.cost).padEnd(4)} (${p1.z.toFixed(1).padStart(5)}) || ${String(p2.saved).padStart(4)}/${String(p2.cost).padEnd(4)} (${p2.z.toFixed(1).padStart(5)})`); } }
console.log(`${rows} scenarios in ${((Date.now() - t0) / 1000).toFixed(0)} s. HKOI made things worse beyond chance in ${worse}; added to Trophy it made no difference beyond chance in ${flat}.`);
