// node tests/study/hkoi_only.js [raids]
// THE reference way to measure survival with no protection, Trophy only, HKOI only and both. Read docs/HKOI_NUMBERS.md first.
// Uses the legacy resolver directly (the standard three-launch raid of defaultConfig), same seeds for every setup, and rebuilds the
// fire-control table for every change of settings. Prints survival with its margin of error, the share of raids with no hit at all,
// and how often an engaged beam-rider had its beam cut.
const { HK } = require('../battle/load.js');
const N = +process.argv[2] || 1000;
const pm = p => (196 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / N)).toFixed(1);
function run(label, mod) {
  const c = HK.defaultConfig(); c.missions = N; c.seed = 1; mod(c);
  const lookup = c.hkoi_enabled ? HK.meetLookup(c) : {};          /* never reuse a table built for other settings */
  const r = HK.runSync(c, lookup);
  const cut = r.f_engaged_obs ? (r.f_cut || r.cut || 0) / r.f_engaged_obs : null;
  console.log(label.padEnd(44), 'survive', (100 * r.P_survive).toFixed(1).padStart(5) + '% ±' + pm(r.P_survive), '| no hit at all', (100 * r.P_no_hits).toFixed(1).padStart(5) + '%', '| hits/raid', (r.hits || 0).toFixed(2), '| obscurant rounds/raid', (r.obs_rounds || 0).toFixed(1), cut == null ? '' : '| beams cut ' + Math.round(100 * cut) + '%');
  return r;
}
const setups = [['No protection', c => { c.hkoi_enabled = false; c.aps.enabled = false; }], ['Trophy only', c => { c.hkoi_enabled = false; }], ['HKOI only', c => { c.aps.enabled = false; }], ['HKOI + Trophy', c => { }]];
for (const [jl, j] of [['enemy gunner 3 mrad (default)', 3], ['enemy gunner 0.5 mrad (expert)', 0.5]]) {
  console.log('\n== ' + jl + ', ' + N + ' raids, crew reacting ==');
  for (const [l, m] of setups) run(l, c => { c.enemy.gunner_jitter_mrad = j; m(c); });
}
console.log('\n== HKOI only, 0.5 mrad: what moves it ==');
const base = c => { c.aps.enabled = false; c.enemy.gunner_jitter_mrad = 0.5; };
run('as above', base);
run('crew does not move the tank', c => { base(c); c.crew.enabled = false; });
run('50 g round', c => { base(c); c.rnd.payload_g = 50; });
run('65 g round', c => { base(c); c.rnd.payload_g = 65; });
run('120 g round', c => { base(c); c.rnd.payload_g = 120; });
run('re-lock allowed (pessimistic)', c => { base(c); c.drift.relock = true; });
if (process.argv[3] === 'keys') { const c = HK.defaultConfig(); c.missions = 50; console.log(Object.keys(HK.runSync(c, HK.meetLookup(c))).join(' ')); }
