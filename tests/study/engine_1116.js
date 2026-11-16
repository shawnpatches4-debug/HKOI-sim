// node tests/study/engine_1116.js [raids per row, default 3000] [variant,variant,...]
// Shawn's orders of 16 Nov 2026, measured one at a time and together on the same seeds (the standard raid of defaultConfig, crew reacting):
//   old     Kornet spin off, no re-lock, classic scheduler (the engine before 16 Nov)
//   spin    + Kornet blind flight along the spiral tangent (THREATS.kornet.blind_spin)
//   relock  + Kornet re-lock with the real correction flown by the autopilot (drift.relock_kornet)
//   smart   + the smart scheduler (fc.scheduler = 'smart')
//   all     all three (the new default)
// For each: survival with no protection / Trophy / HKOI / both at 3 mrad and 0.5 mrad enemy gunner, hits a raid, beams cut per missile engaged
// with obscurant, Trophy shots a raid, hits by cause (why HKOI did not stop it), and what happened to cut Kornets.
// The fire-control table is rebuilt for every setting. Margin of a survival figure at 3,000 raids: about +-1.4 points at 85%.
const { HK } = require('../battle/load.js');
const N = +process.argv[2] || 3000;
const VAR = {
  old: c => { c.blind_spin = false; c.drift.relock_kornet = false; c.fc.scheduler = 'classic'; },
  spin: c => { c.blind_spin = true; c.drift.relock_kornet = false; c.fc.scheduler = 'classic'; },
  relock: c => { c.blind_spin = false; c.drift.relock_kornet = true; c.fc.scheduler = 'classic'; },
  spin_relock: c => { c.blind_spin = true; c.drift.relock_kornet = true; c.fc.scheduler = 'classic'; },
  smart: c => { c.blind_spin = false; c.drift.relock_kornet = false; c.fc.scheduler = 'smart'; },
  all: c => { c.blind_spin = true; c.drift.relock_kornet = true; c.fc.scheduler = 'smart'; },
};
const pick = (process.argv[3] || 'old,spin,relock,spin_relock,smart,all').split(',');
const SETUPS = [['none', c => { c.hkoi_enabled = false; c.aps.enabled = false; }], ['Trophy', c => { c.hkoi_enabled = false; }], ['HKOI', c => { c.aps.enabled = false; }], ['both', c => { }]];
const pm = p => (196 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / N)).toFixed(1);
const out = {};
for (const v of pick) {
  out[v] = {};
  for (const j of [3, 0.5]) for (const [sl, sf] of SETUPS) {
    if (!(sl === 'HKOI' || sl === 'both') && v !== 'old' && v !== pick[0]) continue;   // no HKOI fitted: the changes cannot move these rows
    const c = HK.defaultConfig(); c.missions = N; c.seed = 1; c.enemy.gunner_jitter_mrad = j; VAR[v](c); sf(c); if (process.env.RAID) { c.enemy.raid_size = +process.env.RAID; c.enemy.window_s = +(process.env.WIN || 8); }   /* RAID=6 WIN=8: a bigger volley, where the order of the gun's work matters more */
    const r = HK.runSync(c, c.hkoi_enabled ? HK.meetLookup(c) : {});
    const causes = {}; for (const k in r) if (k.startsWith('leakH_')) causes[k.slice(6)] = +(r[k] * N).toFixed(0);
    const row = { survive: +(100 * r.P_survive).toFixed(1), pm: +pm(r.P_survive), hits: +(r.hits || 0).toFixed(3), cut: r.f_engaged_obs ? +(100 * (r.f_cut || 0) / r.f_engaged_obs).toFixed(1) : null, trophy: +(r.aps_used || 0).toFixed(3), obs_rounds: +(r.obs_rounds || 0).toFixed(1),
      k_cut: Math.round((r.k_cut || 0) * N), k_relock: Math.round((r.k_relock || 0) * N), k_relock_on_target: Math.round((r.k_relock_on_target || 0) * N), k_relock_hit: Math.round((r.k_relock_hit || 0) * N), k_relock_could: Math.round((r.k_relock_could || 0) * N), causes };
    out[v][sl + '@' + j] = row;
    console.log(v.padEnd(12), (sl + ' ' + j + ' mrad').padEnd(16), 'survive', String(row.survive).padStart(5) + '% ±' + row.pm, '| hits/raid', row.hits.toFixed(3), '| cut', row.cut == null ? '  -' : row.cut + '%', '| Trophy shots/raid', row.trophy.toFixed(2), '| obs rounds/raid', row.obs_rounds,
      row.k_cut ? `| Kornets cut ${row.k_cut}, re-locked ${row.k_relock} (back on target ${row.k_relock_on_target}, hit ${row.k_relock_hit}), could have re-locked ${row.k_relock_could}` : '', '| hits by cause', JSON.stringify(causes));
  }
}
if (process.argv[4]) require('fs').writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
