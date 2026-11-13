// ================================================================ carry-over between raids: what a surviving vehicle takes into its next fight
// State: ammunition, Trophy rounds per side, each system (ok / damaged / destroyed), each crewman (ok / wounded), fatigue and resting stress.
// applyState turns that into the settings the engine already understands, so a damaged tank fights with what it has left.
const CAMP = (() => {
  const SYS = { hkoi: 'HKOI weapon station', radar: 'HKOI radar', lwr: 'Laser warner', gps: "Gunner's primary sight", citv: "Commander's viewer", stab: 'Gun stabiliser', tdrive: 'Turret drive', gun: 'Main gun', radio: 'Radios', engine: 'Engine', track: 'Tracks' };
  const fresh = cfg => ({ raid: 0, obs: cfg.gun.obscurant_rounds, he: cfg.gun.he_rounds, apsL: cfg.aps.mag_per_side, apsR: cfg.aps.mag_per_side, sys: Object.fromEntries(Object.keys(SYS).map(k => [k, 'ok'])), crew: { cdr: 'ok', gnr: 'ok', ldr: 'ok', drv: 'ok' }, fatigue: 0, stress0: 10, hull: cfg.vehicle.hull_deg || 0, log: [] });
  const lvl = s => s === 'destroyed' ? 2 : s === 'damaged' ? 1 : 0;
  function applyState(c, st) { if (!st) return c; const y = st.sys, w = k => st.crew[k] === 'wounded';
    c.gun.obscurant_rounds = st.obs; c.gun.he_rounds = st.he; c.aps.mag_L = st.apsL; c.aps.mag_R = st.apsR; c.crew.fatigue = st.fatigue; c.crew.stress0 = st.stress0 + 8 * Object.values(st.crew).filter(v => v === 'wounded').length;
    if (lvl(y.hkoi) === 2) c.hkoi_enabled = false; else if (lvl(y.hkoi) === 1) { c.gun.slew_az_dps *= .5; c.gun.slew_el_dps *= .5; c.gun.dispersion_mrad *= 1.5; c.gun.jam_per_burst = Math.min(.5, c.gun.jam_per_burst * 3); }
    if (lvl(y.radar) === 2) c.radar.acq_range_ref_m = 1; else if (lvl(y.radar) === 1) { c.radar.acq_range_ref_m *= .6; c.radar.track_mrad *= 1.6; c.radar.max_tracks = Math.max(2, Math.round(c.radar.max_tracks / 2)); }
    if (lvl(y.lwr) === 2) c.lwr.pd_ref = 0; else if (lvl(y.lwr) === 1) c.lwr.pd_ref *= .5;
    const mob = (lvl(y.engine) === 2 || lvl(y.track) === 2 ? .15 : lvl(y.engine) === 1 || lvl(y.track) === 1 ? .5 : 1) * (w('drv') ? .7 : 1); c.crew.evade_speed *= mob; c.crew.reverse_speed *= mob; c.crew.accel *= mob; if (mob < .2) c.vehicle.speed_ms = 0; else c.vehicle.speed_ms *= mob;
    if (w('cdr')) c.crew.decide_s = Math.max(1.5, c.crew.decide_s - 1.5);
    if (c.duel) { if (lvl(y.gun) === 2) c.duel.max_shots_own = 0; if (lvl(y.gps)) c.duel.own_lay_s *= lvl(y.gps) === 2 ? 2.2 : 1.5; if (lvl(y.gps) === 2) c.duel.own_p_hit_ref -= .25; if (lvl(y.stab)) c.duel.own_p_hit_ref -= lvl(y.stab) === 2 ? .3 : .15; if (lvl(y.tdrive)) c.duel.turret_dps *= lvl(y.tdrive) === 2 ? .15 : .5; if (w('gnr')) c.duel.own_lay_s *= 1.4; if (w('ldr')) c.duel.own_reload_s *= 1.6; }
    if (lvl(y.tdrive)) c.gun.turret_assist_dps = lvl(y.tdrive) === 2 ? 0 : c.gun.turret_assist_dps * .5;
    if (st.hull != null) c.vehicle.hull_deg = st.hull; if (st.contact) c.radar.mode = 'continuous'; c.carry = { raid: st.raid, radio: lvl(y.radio) < 2 }; return c; }
  // what the raid just fought leaves behind
  function nextState(rec, cfg, st, opt) { opt = opt || {}; const n = JSON.parse(JSON.stringify(st)); n.raid++; n.log = [];
    let obs = 0, he = 0; for (const b of rec.bursts) { if (b.kind === 'false') obs += cfg.gun.burst; for (const r of b.rounds || []) { if (b.kind === 'he') he++; else obs++; } } n.obs = Math.max(0, st.obs - obs); n.he = Math.max(0, st.he - he);
    n.apsL = Math.max(0, st.apsL - rec.aps.filter(a => a.side === 'L').length); n.apsR = Math.max(0, st.apsR - rec.aps.filter(a => a.side === 'R').length);
    const MAP = { trans: 'engine', track_l: 'track', track_r: 'track' };
    for (const h of DMG.report(rec, cfg)) { for (const cp of h.comps) { if (cp.crew) { if (n.crew[cp.id] === 'ok') { n.crew[cp.id] = 'wounded'; n.log.push(`${cp.name} wounded`); } continue; } const k = MAP[cp.id] || cp.id; if (!(k in n.sys)) continue; const was = lvl(n.sys[k]), now = Math.max(was, cp.state === 'destroyed' ? 2 : 1); if (now > was) { n.sys[k] = now === 2 ? 'destroyed' : 'damaged'; n.log.push(`${SYS[k]} ${n.sys[k]}`); } } }
    const peak = rec.crew && rec.crew.line ? Math.max(...rec.crew.line.map(p => p.s)) : 10, gapMin = opt.gap_min == null ? 20 : opt.gap_min;
    if (rec.crew && HK.crewPos) { const cp = HK.crewPos(rec.crew, rec.t_end); if (cp && isFinite(cp.h)) n.hull = ((cp.h % 360) + 360) % 360; }
    if (opt.wave && rec.threats.length) n.contact = true;   // once attacked, the crew leaves the fire-control radar on for the rest of the fight
    n.fatigue = Math.min(1, st.fatigue + (opt.wave ? .02 : .06) + (peak > 80 ? .08 : peak > 55 ? .04 : 0) + .05 * rec.hits - Math.min(.08, gapMin / 600));
    n.stress0 = Math.round(Math.max(10, Math.min(60, 10 + (peak - 10) * Math.exp(-gapMin / 25) + 6 * rec.hits)));
    return n; }
  // a day of fighting: raids one after another until the vehicle is lost or the day ends
  function run(cfg, nRaids, seed, lookup, opt) { opt = opt || {}; let st = fresh(cfg); const hist = [];
    for (let r = 0; r < nRaids; r++) { const c = applyState(JSON.parse(JSON.stringify(cfg)), st); if (opt.escalate) c.enemy.raid_size = Math.min(8, cfg.enemy.raid_size + Math.floor(r * opt.escalate)); c.seed = seed;
      const rec = fightOnce(c, () => new HK.RNG(HK.seedFor(seed * 131 + r, r)), lookup);
      if (rec.killed) { hist.push({ r, killed: true, hits: rec.hits }); return { survived: r, lost: true, hist, state: st }; }
      st = nextState(rec, c, st, opt); hist.push({ r, killed: false, hits: rec.hits, st: opt.keep ? JSON.parse(JSON.stringify(st)) : null }); }
    return { survived: nRaids, lost: false, hist, state: st }; }
  // ---- damage that bites inside the raid. The engine fights the raid; the damage model then says what each hit broke. If something that matters
  // (HKOI mount, radar, engine or tracks) stopped working part-way through, the rest of the raid is fought again without it, until the story is consistent.
  function dmgOf(rec, cfg) { const out = {}, MAP = { hkoi: 'hkoi', radar: 'radar', engine: 'mob', trans: 'mob', track_l: 'mob', track_r: 'mob' };
    for (const h of DMG.report(rec, cfg)) { if (h.killing) continue; for (const cp of h.comps) { const k = MAP[cp.id]; if (!k) continue; const o = out[k] || (out[k] = { d: 1e9, x: null }), t = +(h.t + .05).toFixed(2); o.d = Math.min(o.d, t); if (cp.state === 'destroyed') o.x = o.x == null ? t : Math.min(o.x, t); } }
    return out; }
  function fightOnce(c, mkRng, lookup) { let dm = c.dmg0 || null, rec = null; const base = c.dmg0 ? JSON.stringify(c.dmg0) : null; void base;
    for (let pass = 0; pass < 4; pass++) { c.dmg = dm; rec = { events: [], bursts: [], aps: [], ctx: { hull: 0 } }; HK.runMission(c, mkRng(), lookup, rec); const nd = dmgOf(rec, c); if (JSON.stringify(nd) === JSON.stringify(dm || {})) break; dm = nd; }
    rec.dmg = dm && Object.keys(dm).length ? dm : null;
    if (rec.dmg && !rec.killed || (rec.dmg && rec.kill_t != null)) { const NM = { hkoi: ['HKOI mount', 'it jams three times as often', 'HKOI is out of action for the rest of the raid'], radar: ['HKOI radar', 'new tracks come a second late', 'no new threats can be tracked'], mob: ['Engine or tracks', 'the vehicle turns at half rate', 'the vehicle cannot move'] };
      for (const k in rec.dmg) { const o = rec.dmg[k], n = NM[k]; if (!n) continue; if (o.x == null || o.d < o.x - .01) rec.events.push({ t: o.d, kind: 'hit', idx: -1, text: `${n[0]} damaged by the hit: ${n[1]}` }); if (o.x != null) rec.events.push({ t: o.x + .01, kind: 'hit', idx: -1, text: `${n[0]} destroyed by the hit: ${n[2]}` }); }
      const endEv = rec.events.filter(e => e.kind === 'end' || /^Mission result/.test(e.text)); rec.events = rec.events.filter(e => !endEv.includes(e)).sort((a, b) => a.t - b.t).concat(endEv); }
    return rec; }
  return { SYS, fresh, applyState, nextState, run, dmgOf, fightOnce };
})();
