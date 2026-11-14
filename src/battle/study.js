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

  // ================= Raids by the thousand (the old simulator's method) =================
  // A raid is ONE engagement: a few threats launched within a few seconds at the vehicle in its position, resolved by the engine alone.
  // It takes a few thousandths of a second, so 5,000 or 10,000 per setup are practical, and with that many the ranges are narrow enough
  // to say whether a difference is real. All four setups fight the SAME raids (same seed for raid number i), so they can also be compared
  // raid by raid: in how many did adding HKOI save the vehicle, in how many did it cost it.
  const TYPE = { kornet: 'kornet', saclos: 'saclos', sal: 'sal', fpv: 'fpv', fpv_fiber: 'fpv', rpg: 'rpg' };
  // sc: { preset: 'old' } for the old simulator's raid exactly as it was, or { preset: 'setup', force, raid, jitter, pilot } for the enemy
  // of the battle set up on the title screen: its weapons in their proportions, its crews' steadiness, launched together (an ambush) or
  // over about six seconds from long range (a stand-off raid), with the vehicle keeping still for HKOI as the Battlefield commander does.
  function raidConfig(HK, base, sc, setup) {
    const c = cfgFor(HK, base, setup); if (!sc || sc.preset === 'old') return c;
    const mix = {}; let teams = 0; for (const f of sc.force || []) { const k = TYPE[f.type]; if (!k || !HK.THREATS[k]) continue; mix[k] = (mix[k] || 0) + (f.n || 1); teams += f.n || 1; }
    if (teams) { c.enemy.mix = mix; c.enemy.raid_size = Math.max(1, Math.min(6, teams)); }
    c.enemy.window_s = sc.raid ? sc.raid.window : 3; c.enemy.kornet_min_m = Math.max(2000, sc.raid ? sc.raid.minR : 0);   /* Shawn: Kornet teams fire from 2 to 5 km, never close */ if (sc.jitter != null) c.enemy.gunner_jitter_mrad = sc.jitter; if (sc.pilot) c.enemy.drone_skill = sc.pilot;
    if (c.crew) c.crew.enabled = false;
    return c;
  }
  function raidStart(HK, base, sc, n) { const S = {}; for (const st of SETUPS) { const cfg = raidConfig(HK, base, sc, st); cfg.seed = 1; S[st.key] = { cfg, lookup: st.hkoi ? HK.meetLookup(cfg) : {}, n: 0, surv: 0, killed: new Uint8Array(n), sums: {} }; } return { S, n, i: 0 }; }
  // fight raids i .. i + count - 1 under all four setups
  function raidStep(HK, run, count) {
    const end = Math.min(run.n, run.i + count);
    for (; run.i < end; run.i++) for (const st of SETUPS) { const A = run.S[st.key], m = HK.runMission(A.cfg, new HK.RNG(HK.seedFor(A.cfg.seed, run.i)), A.lookup, null); A.n++; if (m.killed) A.killed[run.i] = 1; else A.surv++; for (const k in m) if (typeof m[k] === 'number') A.sums[k] = (A.sums[k] || 0) + m[k]; }
    return run.i >= run.n;
  }
  const BY = [['hkoi', 'Stopped by HKOI'], ['aps', 'Stopped by Trophy'], ['gunner', 'Enemy gunner missed'], ['smoke', 'Crew smoke'], ['other', 'Other'], ['hit', 'Hit the vehicle']];
  const LEAK = { cloud_thin: 'cloud too thin to cut the guidance', no_time: 'no time to engage', no_time_second: 'no time for a second burst', aps_inhibited: 'Trophy held back (friendly infantry close)', aps_miss: 'Trophy missed', aps_empty: 'Trophy out of interceptors on that side', aps_reset: 'Trophy still resetting from its last shot', lwr_miss: 'warning receiver did not pick it up', min_range: 'launched inside minimum range', jam: 'gun jammed', fuze_miss: 'fuzes did not trigger', no_track: 'radar never got a track', track_too_late: 'track came too late', no_cue_emcon: 'radar silent and no warning', blind_arc: 'came from behind the turret', not_obs: 'not a missile obscurant works on', drift_hit: 'blinded but still drifted into the vehicle', stab_upset: 'vehicle movement upset the lay', cdr_busy: 'commander busy' };
  function raidSummary(A) {
    const n = A.n, s = A.sums, th = s.threats || 0, out = { n, survived: A.surv, survival: n ? A.surv / n : 0, range: range95(A.surv, n), hitsPerRaid: n ? (s.hits || 0) / n : 0, threatsPerRaid: n ? th / n : 0, obsPerRaid: n ? (s.obs_rounds || 0) / n : 0, hePerRaid: n ? (s.he_rounds || 0) / n : 0, apsPerRaid: n ? (s.aps_used || 0) / n : 0, by: {}, leaks: [], threats: th };
    for (const k in s) { if (k.indexOf('by_') !== 0) continue; const d = k.slice(3), b = /^hkoi/.test(d) || d === 'self_destruct' ? 'hkoi' : d === 'aps' ? 'aps' : d === 'gunner_jitter' ? 'gunner' : d === 'crew_smoke' ? 'smoke' : d === 'hit' ? 'hit' : 'other'; out.by[b] = (out.by[b] || 0) + s[k]; }
    if (!out.by.hit && s.f_hit) out.by.hit = s.f_hit;
    for (const k in s) { const m = /^leak([HA])_(.+)$/.exec(k); if (m) out.leaks.push({ why: (m[1] === 'H' ? 'HKOI: ' : 'Trophy: ') + (LEAK[m[2]] || m[2].replace(/_/g, ' ')), n: s[k] }); }
    out.leaks.sort((a, b) => b.n - a.n); return out;
  }
  // raid by raid: where did adding HKOI change the outcome? z is how many standard errors the net effect is from zero (over 2 is clear, over 3 is beyond doubt)
  function paired(withH, without) { let saved = 0, cost = 0; const n = Math.min(withH.n, without.n); for (let i = 0; i < n; i++) { if (without.killed[i] && !withH.killed[i]) saved++; else if (!without.killed[i] && withH.killed[i]) cost++; } return { n, saved, cost, net: n ? (saved - cost) / n : 0, z: saved + cost ? (saved - cost) / Math.sqrt(saved + cost) : 0 }; }

  const api = { SETUPS, BUCKETS, run, one, summarise, range95, cfgFor, bucketOf, raidConfig, raidStart, raidStep, raidSummary, paired, BY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKStudy = api;
})(typeof window !== 'undefined' ? window : globalThis);
