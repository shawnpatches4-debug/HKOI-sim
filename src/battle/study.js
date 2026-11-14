// Run the numbers: fight the same battles many times, without drawing them, under four setups of the vehicle's defences
// (HKOI + Trophy, Trophy only, HKOI only, neither), and count what happened. This is the old simulator's "Run" page for the
// Battlefield build: it says what HKOI adds, where it fails, and why hits got through.
//
// Nothing here changes a battle. A battle is decided by its settings and seed; each setup fights battle seeds 1..n on the same ground
// against the same enemy force. The setups part company after the first engagement, because surviving or not changes what follows.
(function (root) {
  'use strict';
  const SETUPS = [
    { key: 'both', name: 'HKOI + Trophy', hkoi: true, aps: true },
    { key: 'aps', name: 'Trophy only', hkoi: false, aps: true },
    { key: 'hkoi', name: 'HKOI only', hkoi: true, aps: false },
    { key: 'none', name: 'Neither', hkoi: false, aps: false },
  ];
  // what ended a threat, in the reader's words. Anything the engine names that is not listed counts as 'other'.
  const BUCKET = {
    HIT: 'hit', aps: 'trophy', gunner_jitter: 'gunner', suppressed_aim: 'counter', counter_fire: 'counter', terrain_mask: 'cover',
    unguided_miss: 'missed', crew_smoke: 'smoke', self_destruct: 'hkoi', drone_crash: 'missed',
  };
  const BUCKETS = [['hkoi', 'Stopped by HKOI'], ['trophy', 'Stopped by Trophy'], ['gunner', 'Enemy gunner missed'], ['cover', 'Lost behind cover'],
    ['counter', 'Machine-gun fire on the launcher'], ['smoke', 'Crew smoke'], ['missed', 'Missed on its own'], ['other', 'Other'], ['hit', 'Hit the vehicle']];
  const bucketOf = th => { const d = th.defeated_by || (th.state === 'hit' ? 'HIT' : null); if (!d) return th.state === 'hit' ? 'hit' : 'other'; if (/^hkoi/.test(d)) return 'hkoi'; return BUCKET[d] || 'other'; };

  // 95% range for a share k of n (Wilson): honest about small batches
  function range95(k, n) { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; }

  function cfgFor(HK, base, setup) { const c = JSON.parse(JSON.stringify(base)); c.hkoi_enabled = !!setup.hkoi; if (c.aps) c.aps.enabled = !!setup.aps; return c; }

  // fight one battle to its end; returns one row of facts
  function one(deps, opts, setup, seed, lookups) {
    const { HK, Battle } = deps, cfg = cfgFor(HK, opts.cfg || HK.defaultConfig(), setup);
    const lookup = setup.hkoi ? (lookups.on || (lookups.on = HK.meetLookup(cfg))) : {};
    const b = new Battle(Object.assign({}, opts, { cfg, lookup, seed, world: opts.world }));
    const maxT = opts.maxT || 1800; let n = 0; while (b.t < maxT && b.tank.alive && !b.over && n++ < 40000) b.step();
    const s = b.summary(), threats = [];
    for (const v of b.volleys) for (const th of v.rec.threats) { const l = v.launches.find(q => q.u.id === th.uid) || {}; threats.push({ key: th.key, R: Math.round(l.R || th.R || 0), by: bucketOf(th), fired: !!(th.viz && th.viz.fired != null), tags: (th.tags || []).slice(0, 6), together: v.rec.threats.filter(q => q.impact != null && th.impact != null && Math.abs(q.impact - th.impact) < 3).length }); }   /* together: how many arrive within three seconds of this one, itself included */
    const crew = s.crew || {};
    return { seed, survived: b.tank.alive, result: !b.tank.alive ? 'lost' : b.over ? b.over.result : 'time', t: Math.round(b.t), wave: s.wave, hits: s.hits, crewDown: Object.values(crew).filter(x => x !== 'ok').length,
      obsUsed: (cfg.gun ? cfg.gun.obscurant_rounds : 150) - (s.obs == null ? 0 : s.obs), heUsed: (cfg.gun ? cfg.gun.he_rounds : 150) - (s.he == null ? 0 : s.he), apsLeft: (s.apsL || 0) + (s.apsR || 0),
      destroyed: (b.killedByTank || 0) + (b.killedByMg || 0), threats };
  }

  // add up the rows of one setup
  function summarise(rows, setup) {
    const hk = !setup || setup.hkoi, ap = !setup || setup.aps;
    const n = rows.length, surv = rows.filter(r => r.survived).length, out = { n, survived: surv, survival: n ? surv / n : 0, range: range95(surv, n), results: {}, chain: {}, byType: {}, why: {}, threats: 0 };
    let hits = 0, crew = 0, T = 0, obs = 0, he = 0, dest = 0;
    for (const r of rows) { out.results[r.result] = (out.results[r.result] || 0) + 1; hits += r.hits; crew += r.crewDown; T += r.t; obs += r.obsUsed; he += r.heUsed; dest += r.destroyed;
      for (const th of r.threats) { out.threats++; out.chain[th.by] = (out.chain[th.by] || 0) + 1; const bt = out.byType[th.key] || (out.byType[th.key] = { n: 0 }); bt.n++; bt[th.by] = (bt[th.by] || 0) + 1;
        if (th.by === 'hit') { const w = !hk && !ap ? 'nothing to stop it' : th.together >= 3 ? 'three or more arriving within three seconds' : !hk ? (th.together >= 2 ? 'two arriving together: Trophy took one' : 'Trophy missed it or had no shot left on that side') : th.R < 700 ? 'launched inside 700 m: no time for HKOI' : !th.fired ? 'HKOI never fired at it' : th.tags.includes('cloud_thin') ? 'cloud too thin to cut the guidance' : th.tags.includes('no_time') || th.tags.includes('no_time_second') ? 'no time for another burst' : ap ? 'got past both defences' : 'got past HKOI'; out.why[w] = (out.why[w] || 0) + 1; } } }
    out.hitsPerBattle = n ? hits / n : 0; out.crewPerBattle = n ? crew / n : 0; out.meanT = n ? T / n : 0; out.obsPerBattle = n ? obs / n : 0; out.hePerBattle = n ? he / n : 0; out.destroyedPerBattle = n ? dest / n : 0; out.threatsPerBattle = n ? out.threats / n : 0;
    return out;
  }

  // The whole study in one go (node, tests). In the page use `one` in small batches so the screen stays alive.
  function run(deps, opts, n, onRow) {
    const lookups = {}, res = {}; for (const st of SETUPS) { const rows = []; for (let seed = 1; seed <= n; seed++) { const r = one(deps, opts, st, seed, lookups); rows.push(r); if (onRow) onRow(st, r); } res[st.key] = summarise(rows, st); res[st.key].rows = rows; }
    return res;
  }

  const api = { SETUPS, BUCKETS, run, one, summarise, range95, cfgFor, bucketOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKStudy = api;
})(typeof window !== 'undefined' ? window : globalThis);
