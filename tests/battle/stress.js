// node tests/battle/stress.js [runs] [group] [gap_s] [skill] [max] [fill] : the maximum stress test.
// Every kind of enemy weapon, arriving together in groups, kept up until the vehicle is lost. How many threats does it survive, and what gives out first?
// fill: "engine" = the engine's cloud fill (0.85 m2/g) | "notebook" = Shawn's v11 notebook fill (60% carbon 8.5, 30% graphite 5.0, 10% brass 1.0 = 6.7 m2/g) with its turret figures (180 deg/s2, 45 deg/s in elevation)
const { HK, Battle } = require('./load.js'), Study = require('../../src/battle/study.js');
const n = +(process.argv[2] || 1000), group = +(process.argv[3] || 4), gap = +(process.argv[4] || 10), skill = process.argv[5] || 'trained', max = +(process.argv[6] || 40), fill = process.argv[7] || 'engine';
const SK = Battle.SKILL[skill], tweak = fill === 'notebook' ? c => { c.obs.alpha_m2_per_g = 0.6 * 8.5 + 0.3 * 5.0 + 0.1 * 1.0; c.gun.slew_acc_dps2 = 180; c.gun.slew_el_dps = 45; } : null;
const run = Study.stressStart(HK, HK.defaultConfig(), { group, gap, max, jitter: SK.jitter, pilot: SK.pilot, tweak }, n), t0 = Date.now(); while (!Study.stressStep(HK, run, 100));
console.log(`STRESS TEST: ${n} attacks, up to ${max} threats each, ${group} arriving together every ${gap} s, ${skill} crews, cloud fill: ${fill}. Mix ${JSON.stringify(Study.STRESS_MIX)}. ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
const pc = x => (Math.round(1000 * x) / 10).toFixed(1).padStart(5) + '%';
for (const st of Study.SETUPS) { const r = Study.stressSummary(run, st.key);
  console.log(`\n${st.name}: threats survived before the vehicle is lost: typical ${r.median > max ? 'all ' + max : r.median - 1} (middle half ${r.q1 - 1} to ${r.q3 > max ? max : r.q3 - 1}); survived the whole attack ${pc(r.survivedAll)}`);
  console.log('   still alive after N threats: ' + r.curve.map(c => `${c.k}: ${pc(c.alive).trim()}`).join('  '));
  console.log('   what ended each threat, per 100: ' + Object.entries(r.by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / r.threats).toFixed(1)}`).join(', '));
  if (r.used) console.log(`   spent by the time it was lost (or the attack ended), on average: Trophy shots ${r.used.aps.toFixed(1)} of ${2 * run.S[st.key].cfg.aps.mag_per_side}, obscurant rounds ${r.used.obs.toFixed(0)} of ${run.S[st.key].cfg.gun.obscurant_rounds}, airburst rounds ${r.used.he.toFixed(0)} of ${run.S[st.key].cfg.gun.he_rounds}; hits taken ${r.used.hits.toFixed(1)}`);
  if (r.first.length) console.log('   what gave out, how often, and at which threat on average: ' + r.first.map(f => `${f.what.replace(/_/g, ' ')} in ${pc(f.share).trim()} of attacks at threat ${f.atThreat.toFixed(1)}`).join('; '));
  console.log('   the killing weapon: ' + r.killer.slice(0, 6).map(k => `${k.why} ${Math.round(100 * k.n / Math.max(1, r.lost))}%`).join(', '));
  if (r.whyH.length) console.log('   why HKOI did not stop the killer: ' + r.whyH.slice(0, 5).map(k => `${k.why} ${Math.round(100 * k.n / Math.max(1, r.lost))}%`).join(', '));
  if (r.whyA.length) console.log('   why Trophy did not stop the killer: ' + r.whyA.slice(0, 4).map(k => `${k.why} ${Math.round(100 * k.n / Math.max(1, r.lost))}%`).join(', ')); }
