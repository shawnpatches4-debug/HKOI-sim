/* HKOI mission engine: browser port of hkoi_sim (engine.py, physics.py, config.py). */
(function (root) {
'use strict';
const G = 9.81, DEG = Math.PI / 180;
const OBS_G = { beam_rider: 1, radio_saclos: 1 };

// FPV operator skill (assumed, not measured): jink = multiplier on the unpredictable manoeuvre while rounds are in flight; feint = chance a burst is drawn by a break-away and wasted
const DRONE_SKILL = { novice: { jink: 0.4, feint: 0 }, trained: { jink: 1, feint: 0 }, expert: { jink: 1.7, feint: 0.25 } };
const THREATS = {
  kornet:    { name: 'Kornet-class ATGM', short: 'Kornet', guidance: 'beam_rider', speed: 250, range_min: 300, range_max: 5500, rcs: 0.02, laser: true, strength: 0.25, los_off: 2.5, weave: 0, launch_h: 1.2, kill: 0.5, loss: 'drift', sd_s: 2, rf: true },
  vikhr:     { name: 'Vikhr-class (helicopter)', short: 'Vikhr', guidance: 'beam_rider', speed: 610, range_min: 1500, range_max: 8000, rcs: 0.02, laser: true, strength: 0.25, los_off: 2.0, weave: 7.0, launch_h: 140, kill: 0.5, loss: 'drift', sd_s: 2, rf: true },
  saclos:    { name: 'Radio-command SACLOS', short: 'SACLOS', guidance: 'radio_saclos', speed: 400, range_min: 400, range_max: 6000, rcs: 0.02, laser: false, strength: 0, los_off: 2.0, weave: 0, launch_h: 30, kill: 0.5, loss: 'drift', sd_s: 2, rf: true },
  sal:       { name: 'Semi-active laser missile', short: 'SAL', guidance: 'sal', speed: 300, range_min: 500, range_max: 8000, rcs: 0.02, laser: true, strength: 1.0, los_off: 0, weave: 0, launch_h: 60, kill: 0.55, loss: 'drift', sd_s: 2, rf: true },
  fpv:       { name: 'FPV drone (radio)', short: 'FPV', guidance: 'drone', speed: 30, range_min: 300, range_max: 4000, rcs: 0.03, laser: false, strength: 0, los_off: 0, weave: 0, launch_h: 40, kill: 0.15, loss: 'drift', sd_s: 2, rf: true },
  rpg:       { name: 'RPG (unguided rocket)', short: 'RPG', guidance: 'unguided', speed: 250, range_min: 80, range_max: 500, rcs: 0.01, laser: false, strength: 0, los_off: 0, weave: 0, launch_h: 1.2, kill: 0.3, loss: 'drift', sd_s: 2, rf: false },
  ir:        { name: 'Fire-and-forget IR missile', short: 'IR F&F', guidance: 'ir', speed: 200, range_min: 300, range_max: 4000, rcs: 0.02, laser: false, strength: 0, los_off: 0, weave: 0, launch_h: 1.2, kill: 0.6, loss: 'drift', sd_s: 2, rf: false },
  ke:        { name: 'Tank main-gun round (APFSDS)', short: 'Tank round', guidance: 'ke', speed: 1700, range_min: 300, range_max: 4000, rcs: 0.001, laser: false, strength: 0, los_off: 0, weave: 0, launch_h: 2.2, kill: 0.35, loss: 'drift', sd_s: 2, rf: false },
  fpv_fiber: { name: 'Fiber-optic FPV drone', short: 'Fiber FPV', guidance: 'drone', speed: 30, range_min: 300, range_max: 10000, rcs: 0.03, laser: false, strength: 0, los_off: 0, weave: 0, launch_h: 40, kill: 0.15, loss: 'drift', sd_s: 2, rf: false },
};
const TERRAIN = {
  open:  { range_scale: 1.00, los_clear_m: 8000, clutter: 1.00, dismounts: 0.10, ground_clutter: 0.5 },
  mixed: { range_scale: 0.60, los_clear_m: 2500, clutter: 0.80, dismounts: 0.30, ground_clutter: 1.0 },
  urban: { range_scale: 0.25, los_clear_m: 700,  clutter: 0.55, dismounts: 0.70, ground_clutter: 2.0 },
};
const WEATHER = {
  clear: { beta: 0.1, washout: 0.00, wind: 3 },
  haze:  { beta: 0.5, washout: 0.00, wind: 3 },
  rain:  { beta: 1.0, washout: 0.20, wind: 6 },
  dust:  { beta: 2.5, washout: 0.00, wind: 8 },
  fog:   { beta: 4.0, washout: 0.05, wind: 1 },
};

function defaultConfig() {
  return {
    seed: 1, missions: 1000, hkoi_enabled: true, loss_behavior: null,
    env: { terrain: 'open', weather: 'clear', wind_ms: null, gust_sigma_ms: 1, temp_c: 15, altitude_m: 0 },
    vehicle: { speed_ms: 0, half_w: 1.85, half_h: 1.2, half_len: 3.95 },
    enemy: { gunner_jitter_mrad: 3, jitter_tremor_frac: 0.5, drone_jink_g: 1.2, drone_skill: 'trained', drone_evasion: true, raid_size: 3, mix: { kornet: 0.55, vikhr: 0.2, saclos: 0.1, sal: 0.05, fpv: 0.1 }, window_s: 6, same_beam_pair_prob: 0.15, same_beam_gap_s: 1.5, decoys: 0, close_range_bias: 0, range_cap_m: null, kornet_min_m: 2000 },
    fc: { ai: true, track_aim: false, own_lead: true, lead_mode: 'steering', lead_horizon_s: 1.2, lead_frac: 0.3, human_approval_s: 0, meet_mode: 'optimal', fixed_meet_m: 1000, ai_track_factor: 0.5, ai_weave_removal: 0.8, ai_init_s: 0.25, reengage: true, max_bursts: 4, sustain: true, sustain_max: 8, false_track_fire_p: 0.2, false_track_fire_p_ai: 0.03, motion_pred_m_per_mps: 0.4 },
    lwr: { bearing_sigma_deg: 8, latency_s: 0.1, pd_ref: 0.95, beam_rider_range_km_half: 4, false_alarm_per_min: 0.6, sal_designation_lead_s: 4, maws: false },
    radar: { mode: 'emcon', acq_range_ref_m: 3000, rcs_ref_m2: 0.02, rcs_log_sigma: 0.5, track_mrad: 2, track_init_s: 0.5, max_tracks: 8, search_s: 1.0, motion_mrad_per_mps: 0.08, sigint_time_const_s: 30 },
    eo: { enabled: true, angle_mrad: 0.3, max_range_m: 3000, max_extinction_per_km: 1.2 },
    gun: { obscurant_rounds: 150, he_rounds: 150, burst: 4, rof_rpm: 200, dispersion_mrad: 2, heat_mrad_per_round: 0.015, pointing_mrad: 0.5, stab_mrad_per_mps: 0.12, boresight_bias_mrad: 0.7, slew_az_dps: 90, turret_assist_dps: 40, slew_el_dps: 60, slew_acc_dps2: 400, stab_upset_mrad: 2, settle_s: 0.2, el_min_deg: -10, el_max_deg: 60, dead_zones_deg: [[155, 205]], jam_per_burst: 0.02, jam_clear_s: 4, fc_latency_s: 0.3 },
    rnd: { muzzle_v: 805, muzzle_v_sigma: 5, drag_k_ref: 2.4e-4, arm_distance_m: 60, fuze_radius_m: 5, he_drone_radius_m: 12, fuze_reliability: 0.97, ground_false_trigger: 0.04, payload_g: 75, colocate: true, colocate_timing_sigma_s: 0.004, upwind_offset: true, he_pk_drone: 0.7, he_pk_missile: 0.2, wind_estimate_sigma_ms: 1.5, density_estimate_sigma: 0.02 },
    obs: { alpha_m2_per_g: 0.85, sigma0_m: 2, eddy_K_m2s: 2, form_s: 0.3, tau_lock_margin: 4.6, own_sight_tau: 1, saclos_effect: 0.6 },
    drift: { relock: false, heading_mrad: 3, trim_acc: 1, lift_lo: 0, lift_hi: 1, beam_field_m: 4, recapture_min_m: 200, reacquire_s: 0.3 },
    crew: { enabled: true, experience: 'trained', trust: 0.7, need: 0.75, doctrine: 'unsure', smoke: 'last', decide_s: 4, drill: true, accel: 2.4, evade_speed: 12, reverse_speed: 8, smoke_form_s: 3, smoke_s: 25, smoke_eff: 0.75 },
    // combined arms: an enemy tank the crew must fight with the main gun while missiles and drones come in (off by default)
    duel: { on: false, R: 1800, brg: 15, t0: 2, first_shot_s: [3, 7], reload_s: 7.5, p_hit_ref: 0.75, own_lay_s: 2.2, own_reload_s: 6, own_p_hit_ref: 0.92, own_p_kill: 0.75, turret_dps: 40, max_shots: 8 },
    ew: { drone_jammer: false, jam_p: 0.6 },
    aps: { enabled: true, radar_cue: true, radar_range_m: 1000, mag_per_side: 4, reset_s: 0.6, pk_cued: 0.9, pk_uncued: 0.85, pk_drone: 0.3, inhibit_with_dismounts: 0.5 },
  };
}

// ------------------------------------------------------------------ seeded RNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFor(base, i) {
  let h = (Math.imul(base | 0, 0x9E3779B1) ^ Math.imul(i + 1, 0x85EBCA77)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}
class RNG {
  constructor(seed) { this.r = mulberry32(seed); this.spare = null; }
  random() { return this.r(); }
  uniform(a, b) { return a + (b - a) * this.r(); }
  normal(m, s) {
    let z;
    if (this.spare !== null) { z = this.spare; this.spare = null; }
    else {
      let u = 0; while (u === 0) u = this.r();
      const v = this.r(), R = Math.sqrt(-2 * Math.log(u));
      z = R * Math.cos(2 * Math.PI * v); this.spare = R * Math.sin(2 * Math.PI * v);
    }
    return m + s * z;
  }
  poisson(l) {
    if (l <= 0) return 0;
    if (l > 30) return Math.max(0, Math.round(this.normal(l, Math.sqrt(l))));
    const L = Math.exp(-l); let k = 0, p = 1;
    do { k++; p *= this.r(); } while (p > L);
    return k - 1;
  }
}

// ------------------------------------------------------------------ physics
const densityRatio = (T, alt) => Math.pow(1 - 2.25577e-5 * alt, 5.25588) * 288.15 / (273.15 + T);
const sOfTau = (t, v0, k) => Math.log1p(k * v0 * t) / k;
const vOfTau = (t, v0, k) => v0 / (1 + k * v0 * t);
const tauOfS = (s, v0, k) => Math.expm1(k * s) / (k * v0);
function solveMeet(rem, vm, v0, k) {
  if (rem <= 0) return 0;
  let tau = rem / (v0 + vm);
  for (let i = 0; i < 10; i++) {
    const f = sOfTau(tau, v0, k) + vm * tau - rem, fp = vOfTau(tau, v0, k) + vm;
    tau = Math.max(0, tau - f / fp);
  }
  return tau;
}
const windDrift = (s, tau, v0, w) => w * Math.max(tau - s / v0, 0);
function puffTau(p, t, alpha, K, wash, wc) {
  const age = t - p.tf; if (age < 0) return 0;
  const sig2 = p.s0 * p.s0 + 2 * K * age, dy = p.y0 + wc * age, d2 = dy * dy + p.z0 * p.z0;
  return alpha * p.m * Math.exp(-wash * age) / (2 * Math.PI * sig2) * Math.exp(-d2 / (2 * sig2));
}
function tauAt(t, puffs, alpha, K, wash, wc) {
  let s = 0; for (const p of puffs) s += puffTau(p, t, alpha, K, wash, wc); return s;
}
// First time the beam is blocked, and the first time after that it has been clear long enough
// (reacq_s) for the missile's receiver to lock on again. Brief flickers below threshold do not count.
function blockWindow(puffs, alpha, K, wash, wc, need, tmax, ownTau, reacq_s) {
  const dt = 0.02, n = Math.ceil((Math.max(tmax, dt) + dt) / dt), need_clear = Math.max(1, Math.round((reacq_s || 0) / dt));
  let i0 = -1, i1 = -1, own = 0, clearRun = 0;
  for (let i = 0; i < n; i++) {
    const tau = tauAt(i * dt, puffs, alpha, K, wash, wc);
    if (tau >= ownTau) own++;
    const on = tau >= need;
    if (on && i0 < 0) i0 = i;
    else if (i0 >= 0 && i1 < 0) {
      clearRun = on ? 0 : clearRun + 1;
      if (clearRun >= need_clear) i1 = i;
    }
  }
  const win = i0 < 0 ? null : [i0 * dt, i1 < 0 ? Infinity : i1 * dt];
  return { win, own_s: n > 1 ? own * dt : 0 };
}
function drawDrift(rng, d, loss) {
  const lift = loss === 'hold_last' ? 1 : loss === 'free_fall' ? 0 : rng.uniform(d.lift_lo, d.lift_hi);
  return { hy: rng.normal(0, d.heading_mrad * 1e-3), hz: rng.normal(0, d.heading_mrad * 1e-3), ay: rng.normal(0, d.trim_acc), az: -G * (1 - lift) + rng.normal(0, d.trim_acc) };
}
const driftPos = (p, y0, z0, v, tau) => [y0 + v * tau * p.hy + 0.5 * p.ay * tau * tau, z0 + v * tau * p.hz + 0.5 * p.az * tau * tau];
function blindFlight(p, y0, z0, v, D, hw, hh, slope, vlat) {
  const tT = D / v, steps = 40;
  for (let i = 1; i <= steps; i++) {
    const tau = tT * i / steps; const [y, z] = driftPos(p, y0, z0, v, tau); const rem = D - v * tau;
    if (z + hh + rem * slope < 0) return { hit: false, ground: true, tau, y, z, short: rem };
  }
  const [y, z] = driftPos(p, y0, z0, v, tT); const yr = y - vlat * tT;
  return { hit: Math.abs(yr) <= hw && Math.abs(z) <= hh, ground: false, tau: tT, y: yr, z, short: 0 };
}

// ------------------------------------------------------------------ helpers
const distAt = (th, t) => th.R - th.v * (t - th.t0);
const timeAt = (th, d) => th.t0 + (th.R - d) / th.v;
const angdiff = (a, b) => Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
const mod360 = a => ((a % 360) + 360) % 360;
const lossOf = (cfg, tt) => cfg.loss_behavior || tt.loss;
const burstDur = g => (g.burst - 1) * 60 / g.rof_rpm + 0.1;

function newCtx(cfg, rng) {
  const terr = TERRAIN[cfg.env.terrain], wx = WEATHER[cfg.env.weather];
  const wind = cfg.env.wind_ms != null ? cfg.env.wind_ms : wx.wind;
  const rho = densityRatio(cfg.env.temp_c, cfg.env.altitude_m);
  const dism = rng.random() < terr.dismounts;
  const ctx = {
    cfg, rng, terrain: terr, weather: wx, beta: wx.beta, washout: wx.washout, wind,
    wind_dir: rng.uniform(0, 360), rho, k: cfg.rnd.drag_k_ref * rho,
    hull: cfg.vehicle.speed_ms === 0 ? rng.normal(0, 25) : rng.uniform(-120, 120),
    // (sandbox: a fixed hull heading and wind direction override the random ones below)
    speed: cfg.vehicle.speed_ms,
    bias_y: rng.normal(0, cfg.gun.boresight_bias_mrad), bias_z: rng.normal(0, cfg.gun.boresight_bias_mrad),
    eo_ok: cfg.eo.enabled && wx.beta <= cfg.eo.max_extinction_per_km && !cfg.enemy.dazzle,
    dismounts: dism, aps_inhibited: false, rounds_fired: 0,
    // turbulent spreading grows with wind: the reference value applies at 3 m/s
    K: cfg.obs.eddy_K_m2s * Math.max(0.15, 0.25 + 0.25 * wind),
  };
  ctx.aps_inhibited = dism && rng.random() < cfg.aps.inhibit_with_dismounts;
  if (cfg.vehicle.hull_deg != null) ctx.hull = cfg.vehicle.hull_deg;
  if (cfg.env.wind_dir_deg != null) ctx.wind_dir = cfg.env.wind_dir_deg;
  if (cfg.enemy.no_dismounts) { ctx.dismounts = false; ctx.aps_inhibited = false; }
  return ctx;
}
function newThreat(idx, key, t0, R, brg, v, pair_of) {
  return { idx, key, t0, R, brg, v, pair_of: pair_of == null ? null : pair_of, impact: 0, los_slope: 0, v_lat: 0, wind_cross: 0, rel_brg: 0,
    cue: null, acq: null, track: null, state: 'inbound', tags: [], defeated_by: null, drift_hit: false, meet: null, sever_m: null, viz: {} };
}

// ------------------------------------------------------------------ raid
function makeRaid(ctx) {
  const { cfg, rng } = ctx, en = cfg.enemy;
  const keys = Object.keys(en.mix).filter(k => en.mix[k] > 0 && THREATS[k]);
  const tot = keys.reduce((s, k) => s + en.mix[k], 0);
  const visM = 3000 / Math.max(ctx.beta, 0.05);
  const out = [];
  // sandbox: launchers placed by hand
  if (en.fixed) for (const f of en.fixed) {
    const tt = THREATS[f.key]; if (!tt) continue;
    const th = newThreat(out.length, f.key, f.t0 || 0, Math.max(50, f.R), f.brg, tt.speed); th.lid = f.id; if (f.late) th.late = f.late; if (f.tac) th.tac = f.tac; if (f.los_clear != null) th.los_fixed = f.los_clear; if (f.uid != null) th.uid = f.uid; if (f.mask != null) th.masked = f.mask; if (f.jit_k) th.jit_k = f.jit_k; if (f.mask_by) th.mask_by = f.mask_by; out.push(th);   /* jit_k: the gunner's aim is this many times shakier (he is under fire); mask_by: why guidance was lost, if not terrain */
    if (f.pair && tt.guidance === 'beam_rider') { const p2 = newThreat(out.length, f.key, (f.t0 || 0) + (f.pair_gap != null ? f.pair_gap : en.same_beam_gap_s), Math.max(50, f.R), f.brg, tt.speed, th.idx); p2.lid = f.id; if (f.late) p2.late = f.late; if (f.tac) p2.tac = f.tac; out.push(p2); }
  }
  for (let n = 0; n < (en.fixed ? 0 : en.raid_size); n++) {
    let u0 = rng.random() * tot, key = keys[keys.length - 1];
    for (const k of keys) { if (u0 < en.mix[k]) { key = k; break; } u0 -= en.mix[k]; }
    const tt = THREATS[key];
    let rmax = tt.range_max * ctx.terrain.range_scale;
    if (en.range_cap_m) rmax = Math.min(rmax, en.range_cap_m);
    if (tt.guidance !== 'drone') rmax = Math.min(rmax, visM);
    // closest launch range: the weapon's own minimum, or the scenario floor for Kornet-class launches
    const rmin = key === 'kornet' ? Math.max(tt.range_min, en.kornet_min_m || 0) : tt.range_min;
    rmax = Math.max(rmax, rmin * 1.2);
    const u = Math.pow(rng.random(), 1 + 3 * en.close_range_bias);
    let R = rmin + (rmax - rmin) * u;
    // study hook: force the launch range into a band (still inside the weapon's own limits)
    if (en.range_band) { const lo = Math.max(en.range_band[0], tt.range_min), hi = Math.max(lo, Math.min(en.range_band[1], tt.range_max)); R = lo + (hi - lo) * u; }
    const brg = rng.uniform(-70, 70), t0 = rng.uniform(0, en.window_s), v = tt.speed * (1 + rng.normal(0, 0.05));
    const th = newThreat(out.length, key, t0, R, brg, v);
    out.push(th);
    if (tt.guidance === 'beam_rider' && rng.random() < en.same_beam_pair_prob)
      out.push(newThreat(out.length, key, t0 + en.same_beam_gap_s, R, brg, v * (1 + rng.normal(0, 0.02)), th.idx));
  }
  // ---- combined arms: the gunnery duel. Both crews see each other; each shot is a draw. The enemy's rounds become threats nothing can intercept.
  const D = cfg.duel;
  if (D && D.on) {
    const xp = (CREW_XP[(cfg.crew || {}).experience] || CREW_XP.trained), RO2 = (cfg.crew || {}).roles || {}, gG = (RO2.gnr && RO2.gnr.gain) || 1, lG = (RO2.ldr && RO2.ldr.gain) || 1, R = Math.max(300, D.R), relT = Math.abs(((D.brg - ctx.hull + 540) % 360) - 180);
    // how busy the crew is with missiles at a given moment (each inbound in the next 8 s slows the lay and spoils the shot)
    const load = t => out.filter(o => o.t0 <= t + 1 && o.t0 + o.R / o.v > t && o.t0 + o.R / o.v < t + 8).length;
    const du = { R, brg: D.brg, t0: D.t0, shots: [], enemy: [], deadT: null, spot: D.t0 + rng.uniform(0.8, 2.5) * xp.k };
    let tUs = du.spot + relT / (D.turret_dps || 40) + D.own_lay_s * xp.k * (1 + 0.25 * load(du.spot) * gG), tEn = D.t0 + rng.uniform(D.first_shot_s[0], D.first_shot_s[1]), n = 0;
    du.lay = [du.spot, tUs];
    const ownMax = D.max_shots_own != null ? D.max_shots_own : D.max_shots;
    while (n++ < 2 * D.max_shots && du.deadT === null && (du.shots.length < ownMax || du.enemy.length < D.max_shots)) {
      if (tUs <= tEn && du.shots.length < ownMax) { const ld = load(tUs), p = Math.max(0.15, Math.min(0.95, D.own_p_hit_ref - R / 9000 - 0.08 * ld * gG - (ctx.speed > 0 ? 0.12 : 0))), hit = rng.random() < p, kill = hit && rng.random() < D.own_p_kill, tof = R / 1650;
        du.shots.push({ t: tUs, hit, kill, p: +p.toFixed(2), load: ld }); if (kill) du.deadT = tUs + tof; tUs += D.own_reload_s * (0.9 + 0.2 * rng.random()) * (1 + 0.12 * ld * lG) * (xp.k > 1 ? 1.15 : 1); }
      else if (du.enemy.length < D.max_shots) { const p = Math.max(0.1, Math.min(0.9, D.p_hit_ref - R / 6000 - (ctx.speed > 0 ? 0.15 : 0))), miss = rng.random() > p;
        const th = newThreat(out.length, 'ke', tEn, R, D.brg, 1700); th.duel = true; th.lid = 'duel'; if (miss) th.will_miss = true; out.push(th); du.enemy.push({ t: tEn, idx: th.idx, miss }); tEn += D.reload_s * (0.9 + 0.2 * rng.random()); }
      else tUs = Math.min(tUs, tEn + 0.01);
    }
    // rounds the enemy would have fired after it was knocked out never leave the barrel
    if (du.deadT !== null) for (let i = out.length - 1; i >= 0; i--) if (out[i].duel && out[i].t0 > du.deadT) { out.splice(i, 1); du.enemy = du.enemy.filter(e => e.t <= du.deadT); }
    out.forEach((o, i) => { if (o.duel) { const e = du.enemy.find(q => q.idx === o.idx); o.idx = i; if (e) e.idx = i; } });
    ctx.duel = du;
  }
  for (const th of out) {
    const tt = THREATS[th.key];
    th.impact = th.t0 + th.R / th.v;
    th.los_slope = Math.max(tt.launch_h - 1.2, 0) / th.R;
    th.rel_brg = mod360(th.brg - ctx.hull);
    th.v_lat = ctx.speed * Math.sin((ctx.hull - th.brg) * DEG);
    th.wind_cross = ctx.wind * Math.sin((ctx.wind_dir - th.brg) * DEG) + rng.normal(0, cfg.env.gust_sigma_ms);
    // Line-of-sight guided missiles (beam riders, SACLOS) need the gunner to see the vehicle, so their
    // flight path is in clear view of the vehicle. Drones and lofted SAL missiles can stay hidden behind
    // terrain or buildings until they are this close.
    // unguided rockets fly wide on their own: hit chance falls with range (about 70% at 100 m, 25% at 500 m)
    if (tt.guidance === 'unguided') th.will_miss = rng.random() > Math.min(0.8, Math.max(0.2, 0.82 - th.R / 870));
    if (th.late && JHUMAN[tt.guidance] && rng.random() < 0.18) { th.will_miss = true; th.jitter_miss = true; th.jit_miss = [(rng.random() < .5 ? -1 : 1) * (3 + rng.random() * 4), 0.5]; }
    if (JHUMAN[tt.guidance] && (cfg.enemy.gunner_jitter_mrad || 0) > 0) { th.jit = jitDraw(rng, cfg.enemy.gunner_jitter_mrad * (th.jit_k || 1), cfg.enemy.jitter_tremor_frac == null ? 0.5 : cfg.enemy.jitter_tremor_frac); if (!jitFly(th, aspectHW(cfg, th), cfg.vehicle.half_h, cfg.vehicle.top_half_w || 1.25, cfg.vehicle.top_h || 0.9)) { th.will_miss = true; th.jitter_miss = true; } }
    th.los_clear = (tt.guidance === 'beam_rider' || tt.guidance === 'radio_saclos' || tt.guidance === 'unguided' || tt.guidance === 'ir') ? Infinity
      : -ctx.terrain.los_clear_m * Math.log(Math.max(rng.random(), 1e-9));
  }
  return out;
}

// ------------------------------------------------------------------ detection
function detect(ctx, threats) {
  const { cfg, rng } = ctx, lwr = cfg.lwr, rad = cfg.radar;
  // a threat can be cued by several sensors; keep the earliest
  const cueBy = (th, t, d, src) => { if (th.cue === null || t < th.cue) { th.cue = t; th.cue_d = d; th.cue_src = src; } };
  for (const th of threats) {
    const tt = THREATS[th.key]; if (tt.guidance === 'ke') continue;
    // 1. laser warner: guidance beams (weak, improves as the missile closes) and SAL designators
    if (tt.laser) {
      if (tt.guidance === 'sal') {
        const pd = lwr.pd_ref * Math.exp(-ctx.beta * th.R / 1000 * 0.5);
        if (rng.random() < pd) { const tc = Math.max(th.t0 - lwr.sal_designation_lead_s, 0) + lwr.latency_s, tl = th.late ? Math.max(tc, th.impact - th.late) : tc; cueBy(th, tl, Math.max(distAt(th, tl), 1), 'lwr_sal'); }
        else th.tags.push('lwr_miss');
      } else {
        const u = rng.random(); let found = null;
        for (let i = 0; i < 120; i++) {
          const d = th.R + (50 - th.R) * i / 119;
          let pd = lwr.pd_ref * tt.strength / 0.25 * Math.exp(-ctx.beta * d / 1000) / (1 + Math.pow(d / 1000 / lwr.beam_rider_range_km_half, 2));
          pd = Math.min(Math.max(pd, 0), 0.995);
          if (pd >= u) { found = d; break; }
        }
        if (found !== null) { const tc = timeAt(th, found) + lwr.latency_s, tl = th.late ? Math.max(tc, th.impact - th.late) : tc; cueBy(th, tl, Math.max(distAt(th, tl), 1), th.late && tl > tc ? 'lwr_late' : 'lwr'); }
        else th.tags.push('lwr_miss');
      }
    }
    // 2. passive RF detector: radio-linked drones
    if (tt.guidance === 'drone' && tt.rf) { const d = Math.min(3500, th.R); cueBy(th, timeAt(th, d) + 0.5, d, 'rf'); }
    // 3. optional missile launch warner (UV/IR plume): sees the launch of any missile, not drones
    if (lwr.maws && tt.guidance !== 'drone') {
      if (rng.random() < 0.9 * Math.exp(-ctx.beta * th.R / 1000 * 0.3)) cueBy(th, th.t0 + 0.3, th.R, 'maws');
    }
    // 4. the APS's own always-on short-range radar hands its detections to HKOI
    if (cfg.aps.enabled && cfg.aps.radar_cue && cfg.aps.radar_range_m > 0) {
      const d = Math.min(cfg.aps.radar_range_m * ctx.terrain.clutter, th.R);
      cueBy(th, timeAt(th, d) + 0.1, d, 'aps_radar');
    }
  }
  const cues = threats.filter(t => t.cue !== null).map(t => t.cue);
  const firstCue = cues.length ? Math.min(...cues) : null;
  // EMCON: fire-control radar switches on at the first cue; continuous: always on
  const radarOn = rad.mode === 'continuous' ? -1e9 : firstCue;
  ctx.radar_on_t = radarOn;
  for (const th of threats) {
    const tt = THREATS[th.key]; if (tt.guidance === 'ke') continue;
    if (radarOn === null) { th.tags.push('no_cue_emcon'); continue; }
    let rAcq = rad.acq_range_ref_m * Math.pow(tt.rcs / rad.rcs_ref_m2, 0.25) * Math.exp(rng.normal(0, rad.rcs_log_sigma)) * ctx.terrain.clutter * (1 - 0.5 * (cfg.enemy.jam_radar || 0));
    if (cfg.fc.ai) rAcq *= 1.1;
    if (th.los_fixed != null) th.los_clear = th.los_fixed;   // battle layer: the terrain between the vehicle and this threat is known, so the sight line opens at this range
    const tIn = timeAt(th, Math.min(rAcq, th.R, th.los_clear));
    // cued: radar slews straight to the bearing. Uncued: found by the radar's own search once it is emitting.
    const tCued = th.cue !== null ? Math.max(th.cue + 0.15, tIn, radarOn) : Infinity;
    const tSearch = Math.max(tIn, radarOn, th.t0) + rad.search_s;
    th.acq = Math.min(tCued, tSearch);
    th.acq_src = tCued <= tSearch ? 'cued' : 'search';
    th.track = th.acq + (cfg.fc.ai ? cfg.fc.ai_init_s : rad.track_init_s);
    if (th.track >= th.impact) { th.track = null; th.tags.push('track_too_late'); }
    { const d = cfg.dmg && cfg.dmg.radar; if (d && th.track !== null && th.track >= d.d) { if (d.x != null && th.track >= d.x) { th.track = null; th.tags.push('radar_down'); } else { th.track += 1.0; if (th.track >= th.impact) { th.track = null; th.tags.push('track_too_late'); } } } }
  }
  const tr = threats.filter(t => t.track !== null).sort((a, b) => a.track - b.track);
  for (let i = 0; i < tr.length; i++) {
    const th = tr[i];
    // a track channel is released when its target arrives or, for a slow drone, about when the gun has dealt with it at its planned meeting range
    const rel = o => THREATS[o.key].guidance === 'drone' && cfg.hkoi_enabled ? Math.min(o.impact, Math.max(o.track + 2, timeAt(o, cfg.rnd.he_meet_drone_m || 800) + 2.5)) : o.impact;
    const active = tr.slice(0, i).filter(o => o.track !== null && rel(o) > th.track);
    if (active.length >= rad.max_tracks) {
      th.track = Math.min(...active.map(rel)) + 0.2;
      th.tags.push('radar_saturated');
      if (th.track >= th.impact) th.track = null;
    }
  }
}

// ------------------------------------------------------------------ 3D flight physics (v10)
// Frame for one threat: x = ground range from the vehicle towards the launcher, y = sideways, z = height
// above flat ground at the vehicle. The vehicle's aim point is (0, 0, half_h); the gunner's sight is at
// (R, 0, launch_h). A beam rider flies los_off above the sight line (tapering in over the last 300 m).
// Missiles steer with a second-order autopilot (natural frequency 2.5 rad/s, damping 0.7, 0.12 s lag,
// 15 g limit) and gravity acts on them all the time. The beam is lost when the obscurant column between
// the missile's tail receiver and the launcher exceeds the lock margin, judged every 20 ms from the true
// 3D positions of the drifting, spreading puffs. A blind missile keeps its last velocity and flies on
// under gravity, lift and trim; it reacquires only if the beam clears long enough while it is still
// inside the beam field.
// ---- enemy gunner hand jitter: the aim line wanders about the target (1-sigma, mrad). Half the variance is slow wander (0.3-3 Hz),
// half is hand tremor (8-12 Hz). The beam, wire command or laser spot moves with it; the missile follows through its own guidance lag.
// the width the vehicle presents to a missile: its beam from the front, its length from the flank
const aspectHW = (cfg, th) => { const a = (th.rel_brg || 0) * DEG, v = cfg.vehicle; return Math.abs(Math.cos(a)) * v.half_w + Math.abs(Math.sin(a)) * (v.half_len || v.half_w); };
const JF = [0.3, 0.7, 1.5, 2.6, 8.3, 9.7, 11.2], JHUMAN = { beam_rider: 1, radio_saclos: 1, sal: 1 };
function jitDraw(rng, mrad, tf) { const slow = Math.sqrt((1 - tf) / 4), fast = Math.sqrt(tf / 3), w = JF.map((f, i) => (i < 4 ? slow : fast) * Math.SQRT2 * mrad * 1e-3); return { w, py: JF.map(() => rng.random() * 6.2832), pz: JF.map(() => rng.random() * 6.2832) }; }
function jitAt(j, t, ph) { if (!j) return 0; let a = 0; for (let i = 0; i < JF.length; i++) a += j.w[i] * Math.cos(6.2832 * JF[i] * t + ph[i]); return a; }
// free guided flight under jitter alone: where the missile crosses the vehicle plane, relative to its aim point
function jitFly(th, hw, hh, topW, topH) { const j = th.jit; if (!j) return true; const dt = PH.dt, Kp = PH.wn * PH.wn, Kd = 2 * PH.zeta * PH.wn, R = th.R, v = th.v; let y = 0, z = 0, vy = 0, vz = 0, ay = 0, az = 0;
  for (let t = th.t0, x = R; x > 0; t += dt, x -= v * dt) { const s = R - x, yT = jitAt(j, t, j.py) * s, zT = jitAt(j, t, j.pz) * s; let cy = Kp * (yT - y) - Kd * vy, cz = Kp * (zT - z) - Kd * vz; const am = Math.hypot(cy, cz); if (am > PH.amax) { cy *= PH.amax / am; cz *= PH.amax / am; }
    ay += (cy - ay) * dt / PH.lag; az += (cz - az) * dt / PH.lag; vy += ay * dt; vz += az * dt; y += vy * dt; z += vz * dt; }
  th.jit_miss = [+y.toFixed(2), +z.toFixed(2)]; return (Math.abs(y) <= hw && Math.abs(z) <= hh) || (Math.abs(y) <= topW && z > hh && z <= hh + topH); }
const PH = { dt: 0.02, wn: 2.5, zeta: 0.7, lag: 0.12, amax: 15 * 9.81, sample: 0.05 };
function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
// obscurant column (optical depth) along the segment A->B through a set of 3D Gaussian puffs at time t
function columnTau(ax, ay, az, bx, by, bz, puffs, t, alpha, K, wash) {
  const ux0 = bx - ax, uy0 = by - ay, uz0 = bz - az, L = Math.hypot(ux0, uy0, uz0); if (L < 1e-6) return 0;
  const ux = ux0 / L, uy = uy0 / L, uz = uz0 / L; let s = 0;
  for (const p of puffs) {
    const age = t - p.ta; if (age < 0) continue;
    const sig2 = p.s0 * p.s0 + 2 * K * age, cx = p.x + p.wa * age - ax, cy = p.y + p.wc * age - ay, cz = p.z - az;
    const along = cx * ux + cy * uy + cz * uz, b2 = cx * cx + cy * cy + cz * cz - along * along;
    if (b2 > 30 * sig2) continue;
    const sg = Math.sqrt(2 * sig2), frac = 0.5 * (erf((L - along) / sg) + erf(along / sg));
    s += alpha * p.m * Math.exp(-wash * age) / (2 * Math.PI * sig2) * Math.exp(-b2 / (2 * sig2)) * frac;
  }
  return s;
}
function engageObscurant(ctx, th, tf, nRounds, partner, rec, maxExtra) {
  const { cfg, rng } = ctx, g = cfg.gun, rd = cfg.rnd, ob = cfg.obs, fc = cfg.fc, tt = THREATS[th.key], dr = cfg.drift;
  const v0 = rd.muzzle_v, hh = cfg.vehicle.half_h, hw = aspectHW(cfg, th), R = th.R, LH = Math.max(tt.launch_h, hh);
  const zb = x => hh + (LH - hh) * x / R, off = x => x > 300 ? tt.los_off : tt.los_off * Math.max(x, 0) / 300, zc = x => zb(x) + off(x);
  const kEst = ctx.k * (1 + rng.normal(0, rd.density_estimate_sigma));
  const rem = distAt(th, tf), tauEst = solveMeet(rem, th.v, v0, kEst), dEst = sOfTau(tauEst, v0, kEst);
  let trk = cfg.radar.track_mrad * (fc.ai ? fc.ai_track_factor : 1) * (1 + 1.5 * (cfg.enemy.jam_radar || 0));
  const spd = ctx.speedNow != null ? ctx.speedNow : ctx.speed, eoOk = ctx.eoNow != null ? ctx.eoNow : ctx.eo_ok;
  if (eoOk && dEst <= cfg.eo.max_range_m) trk = Math.min(trk, cfg.eo.angle_mrad);
  trk += cfg.radar.motion_mrad_per_mps * spd;
  const upset = ctx.upsetNow ? (g.stab_upset_mrad || 0) : 0; if (upset && !th.tags.includes('stab_upset')) th.tags.push('stab_upset');
  const point = g.pointing_mrad + g.stab_mrad_per_mps * spd + upset, sAng = Math.hypot(trk, point) * 1e-3;
  const weaveRes = tt.weave * (fc.ai ? 1 - fc.ai_weave_removal : 1) * 0.7, mot = fc.motion_pred_m_per_mps * spd * (fc.ai ? 0.5 : 1);
  const cy = rng.normal(0, sAng) * dEst + ctx.bias_y * 1e-3 * dEst + rng.normal(0, weaveRes) + rng.normal(0, mot);
  const cz = rng.normal(0, sAng) * dEst + ctx.bias_z * 1e-3 * dEst + rng.normal(0, mot * 0.5);
  const wErr = rng.normal(0, rd.wind_estimate_sigma_ms), wy = rng.normal(0, 0.5), wz = rng.normal(0, 0.5);
  const wa = ctx.wind * Math.cos((ctx.wind_dir - th.brg) * DEG), wc = th.wind_cross, rof = 60 / g.rof_rpm;
  const loss = lossOf(cfg, tt), low = tt.launch_h < 10, gunZ = hh + 1.2;
  const Yv = ctx.vehY || (t => th.v_lat * (t - tf)), yB = (x, t) => Yv(t) * (1 - x / R);
  // fire control: the vehicle's own lateral velocity from its navigation unit, measured over the last 0.3 s, extrapolated forward
  const lead = fc.own_lead !== false, vYat = t => (Yv(t) - Yv(t - 0.3)) / 0.3;
  // 'velocity': extrapolate measured motion. 'steering': the fire control also reads the driver's steering and throttle, so it knows the path
  // for the next lead_horizon_s (less 0.2 s latency) and extrapolates only beyond that.
  const LH0 = fc.lead_mode === 'velocity' ? 0 : (fc.lead_horizon_s == null ? 1.2 : fc.lead_horizon_s), fr0 = fc.lead_frac == null ? 0.6 : fc.lead_frac;
  const bp = (d, T, t0) => { const tk = Math.min(T, t0 + LH0); return (Yv(tk) + (tk === T ? 0 : vYat(tk) * (T - tk)) + rng.normal(0, 0) ) * (1 - d / R); };
  const res = { rounds: 0, downrange: 0, cut: false, reason: null, own_block_s: 0, partner_cut: false, meet: null };
  // ---- missiles in flight (the target, and a second missile on the same beam if there is one)
  const mk = (thr, t) => { const x = distAt(thr, t); return { th: thr, x, y: yB(x, t) + rng.normal(0, 0.3), z: zc(x) + rng.normal(0, 0.3), vy: 0, vz: -(LH - hh) / R * thr.v, ay: 0, az: G, mode: 'guided', tLoss: null, clear: 0, end: null, drift: null, traj: rec ? [] : null, tS: -1 }; };
  const bodies = [mk(th, tf)]; if (partner) { const pb = mk(partner, Math.max(tf, partner.t0)); pb.wait = partner.t0; bodies.push(pb); }
  const M = bodies[0];
  // ---- rounds
  const disp0 = (g.dispersion_mrad + g.heat_mrad_per_round * ctx.rounds_fired) * 1e-3;
  const rounds = [], puffs = [];
  let first = null, extraLeft = maxExtra || 0, extra = 0, stopExtra = false, tRef = null, tauNeed = null, lastFire = tf;
  const L_km = d => Math.max(R - d, 100) / 1000;
  function fire(tfi, isExtra) {
    const remI = distAt(th, tfi); if (remI <= 0) return false;
    const v0i = v0 + rng.normal(0, rd.muzzle_v_sigma), tauI = solveMeet(remI, th.v, v0i, ctx.k), dI = sOfTau(tauI, v0i, ctx.k);
    const tauPlan = solveMeet(remI, th.v, v0, kEst), dropErr = 0.5 * G * (tauI * tauI - tauPlan * tauPlan), wdr = windDrift(dI, tauI, v0i, wErr);
    const disp = disp0 + g.heat_mrad_per_round * 1e-3 * rounds.length;
    const ey = cy + wdr + rng.normal(0, disp) * dI, ez = cz - dropErr + rng.normal(0, disp) * dI;
    // lateral aim: with lead, where the radar track and own-motion data say the missile and its beam will be when the round arrives,
    // pushed a little toward where the beam is heading so the cloud is waiting for it; without lead, where the missile is now
    const tP = tfi + tauI, yNow = yB(distAt(th, tfi), tfi), fr = rd.fuze_radius_m * fr0;
    const yAim = lead ? bp(dI, tP, tfi) + Math.max(-fr, Math.min(fr, bp(dI, tP + ob.form_s + 1.0, tfi) - bp(dI, tP, tfi))) : yNow;
    rounds.push({ t_fire: tfi, t_pass: tP, d: dI, ey, ez, yAim, lead: +(yAim - yNow).toFixed(2), vOwn: +vYat(tfi).toFixed(2), r: null, off: off(dI), fate: null, v0: v0i, extra: !!isExtra, done: false });
    return true;
  }
  for (let i = 0; i < nRounds; i++) if (!fire(tf + i * rof, false)) break;
  ctx.rounds_fired += rounds.length;
  res.rounds = rounds.length; res.meet = rounds.length ? rounds[0].d : null;
  if (!rounds.length) { res.reason = 'too_late'; if (rec) { rec.rounds = rounds; rec.res = res; rec.puffs = puffs; } return res; }
  lastFire = rounds[rounds.length - 1].t_fire;
  const holdEst = Math.max(rounds[0].d / th.v, 0.5);
  const alpha = ob.alpha_m2_per_g, K = ctx.K, wash = ctx.washout, tauS = []; let dimT = null;
  // a round reaches the missile: proximity fuze, or a time fuze onto the first burst point
  function passRound(r, b) {
    const armed = r.d >= rd.arm_distance_m;
    const rx = r.d, ry = r.ey + r.yAim, rz = zc(r.d) + r.ez + (b.z - zc(b.x));
    r.r = Math.hypot(ry - b.y, rz - b.z);
    if (armed && low && rng.random() < rd.ground_false_trigger * ctx.terrain.ground_clutter) { r.fate = 'false_trigger'; r.bx = rx * 0.6; r.by = ry * 0.6; r.bz = 1; return; }
    if (armed && r.r <= rd.fuze_radius_m && rng.random() < rd.fuze_reliability) { r.fate = 'bloom'; r.bx = rx; r.by = ry + wy; r.bz = rz + wz; if (!first) { first = r; tRef = r.t_pass + ob.form_s; tauNeed = Math.max(0.5, ob.tau_lock_margin - ctx.beta * L_km(r.d)); } }
    else if (rd.colocate && first && armed) {
      r.fate = r.extra ? 'sustain' : 'colocated';
      r.t_burst = r.t_fire + tauOfS(first.d, r.v0, ctx.k);
      // follow the beam: each later round is set where the beam is predicted to be while its cloud is thickest
      const sweep = lead ? bp(first.d, r.t_burst + ob.form_s + 1.0, r.t_fire) - bp(first.d, (first.t_burst != null ? first.t_burst : first.t_pass) + ob.form_s + 1.0, first.t_fire) : 0;
      let y0 = first.by + sweep + rng.normal(0, disp0 * first.d) + rng.normal(0, 1.0); if (rd.upwind_offset) y0 -= Math.min(6, Math.max(-6, wc * holdEst / 2));
      r.bx = first.bx; r.by = y0; r.bz = first.bz + rng.normal(0, disp0 * first.d);
    } else { r.fate = 'downrange'; res.downrange++; return; }
    puffs.push({ ta: (r.t_burst != null ? r.t_burst : r.t_pass) + ob.form_s, m: rd.payload_g, s0: ob.sigma0_m, x: r.bx, y: r.by, z: r.bz, wa, wc });
  }
  // ---- step the world
  const dt = PH.dt, Kp = PH.wn * PH.wn, Kd = 2 * PH.zeta * PH.wn;
  let t = tf, ownS = 0, win0 = null, win1 = null, guard = 0;
  const tStop = Math.max(...bodies.map(b => b.th.impact)) + 0.5;
  const sample = (b, tt0) => { if (b.traj && tt0 - b.tS >= PH.sample - 1e-9) { b.traj.push([+tt0.toFixed(3), +b.x.toFixed(2), +b.y.toFixed(3), +b.z.toFixed(3), b.mode === 'blind' ? 1 : 0]); b.tS = tt0; } };
  while (t < tStop && guard++ < 6000) {
    // rounds that pass the missile in this step (in firing order)
    // the radar tracks the missile itself, so each round is laid on where the missile is flying (it wanders with the enemy gunner's aim), not on the ideal line
    if (fc.track_aim !== false) for (const r of rounds) if (!r.aimed && r.t_fire <= t + dt) { r.aimed = true; if (M.mode === 'guided' && !M.end) { const dev = M.y - yB(M.x, t) + M.vy * 0 ; r.yAim += dev; r.dev = +dev.toFixed(2); } }
    for (const r of rounds) if (!r.done && r.t_pass <= t + dt) { r.done = true; passRound(r, M); }
    // adaptive burst: keep feeding the cloud while the missile still guides or could still recover
    if (extraLeft > 0 && !stopExtra && t >= lastFire + rof - 1e-9) {
      const near = M.mode === 'guided' || (Math.hypot(M.y - yB(M.x, t), M.z - zc(M.x)) <= dr.beam_field_m * 1.2 && M.x >= dr.recapture_min_m);
      const tArr = lastFire + rof + tauOfS(first ? first.d : rounds[0].d, v0, ctx.k);
      if (!near || M.end || distAt(th, tArr) < 120) stopExtra = true;
      else if (fire(lastFire + rof, true)) { extra++; extraLeft--; lastFire += rof; ctx.rounds_fired++; } else stopExtra = true;
    }
    const tn = t + dt;
    for (const b of bodies) {
      if (b.end) continue;
      if (b.wait != null && tn < b.wait) continue;
      sample(b, t);
      const v = b.th.v, x1 = distAt(b.th, tn);
      // guidance or blind flight
      let acy, acz;
      if (b.mode === 'guided') {
        const ex = zc(b.x), vzT = -(zb(R) - zb(0)) / R * v - (b.x <= 300 ? tt.los_off / 300 * v : 0);
        const jt = b.th.jit, jy = jt ? jitAt(jt, t, jt.py) * (R - b.x) : 0, jz = jt ? jitAt(jt, t, jt.pz) * (R - b.x) : 0;
        const yT = yB(b.x, t) + jy, vyT = (Yv(t + dt) - Yv(t)) / dt * (1 - b.x / R) + Yv(t) * v / R;
        acy = Kp * (yT - b.y) + Kd * (vyT - b.vy); acz = Kp * (ex + jz - b.z) + Kd * (vzT - b.vz) + G;
        // a thinning signal: as the cloud takes the beam toward the lock threshold the receiver's error signal gets noisy, and the missile wanders before it goes blind
        if (b.dimW > 0.02) { const an = (ob.dim_noise_ms2 == null ? 0.5 * PH.amax : ob.dim_noise_ms2) * b.dimW; acy += an * rng.normal(0, 1); acz += an * rng.normal(0, 1); if (rec && b === M && b.dimW > 0.2 && dimT == null) dimT = tn; }
        const am = Math.hypot(acy, acz); if (am > PH.amax) { acy *= PH.amax / am; acz *= PH.amax / am; }
      } else { acy = b.drift.ay; acz = b.drift.az + G; }
      b.ay += (acy - b.ay) * dt / PH.lag; b.az += (acz - b.az) * dt / PH.lag;
      b.vy += b.ay * dt; b.vz += (b.az - G) * dt;
      const y1 = b.y + b.vy * dt, z1 = b.z + b.vz * dt;
      // vehicle plane reached?
      if (x1 <= 0) {
        const f = b.x / Math.max(b.x - x1, 1e-9), yH = b.y + (y1 - b.y) * f, zH = b.z + (z1 - b.z) * f, tH = t + dt * f;
        const yr = yH - Yv(tH);
        b.x = 0; b.y = yH; b.z = zH; sample(b, tH + PH.sample);
        b.end = { type: 'plane', t: tH, y: yr, z: zH - hh, hit: (Math.abs(yr) <= hw && Math.abs(zH - hh) <= hh) || (Math.abs(yr) <= (cfg.vehicle.top_half_w || 1.25) && zH - hh > hh && zH - hh <= hh + (cfg.vehicle.top_h || 0.9)) }; continue;   // the roof equipment (sights, weapon station) stands about 0.9 m above the armour
      }
      if (z1 <= 0) { const f = b.z / Math.max(b.z - z1, 1e-9), xG = b.x + (x1 - b.x) * f; b.x = xG; b.y = b.y + (y1 - b.y) * f; b.z = 0; sample(b, t + dt * f + PH.sample); b.end = { type: 'ground', t: t + dt * f, short: xG }; continue; }
      b.x = x1; b.y = y1; b.z = z1;
      // can the missile still see its launcher?
      if (puffs.length && tauNeed != null) {
        const tau = columnTau(b.x, b.y, b.z, R, 0, LH, puffs, tn, alpha, K, wash), blocked = tau >= tauNeed;
        b.dimW = ob.partial ? Math.min(1, Math.exp(tau - tauNeed)) : 0;   // off unless asked for: the size of this effect is a guess, and it made cuts come later
        if (rec && b === M && (!tauS.length || tn - tauS[tauS.length - 1][0] >= 0.1 - 1e-9)) tauS.push([+tn.toFixed(2), +tau.toFixed(2), +yB(puffs[0].x + puffs[0].wa * Math.max(0, tn - puffs[0].ta), tn).toFixed(2)]);
        if (b.mode === 'guided' && blocked) {
          if (b === M && tt.guidance === 'radio_saclos' && b.saclos == null) b.saclos = rng.random() > ob.saclos_effect;
          if (!b.saclos) {
            b.mode = 'blind'; b.tLoss = tn; b.clear = 0; b.lossX = b.x;
            b.drift = drawDrift(rng, dr, loss); b.vy += v * b.drift.hy; b.vz += v * b.drift.hz;
            if (b === M && win0 == null) win0 = tn;
          }
        } else if (b.mode === 'blind') {
          b.clear = blocked ? 0 : b.clear + dt;
          if (b === M && blocked) win1 = null;
          if (b === M && !blocked && b.clear >= (dr.reacquire_s || 0) && win1 == null) win1 = tn;
          if (loss === 'self_destruct' && tn - b.tLoss >= tt.sd_s) { b.end = { type: 'sd', t: b.tLoss + tt.sd_s }; continue; }
          if (dr.relock && b.clear >= (dr.reacquire_s || 0) && Math.hypot(b.y - yB(b.x, tn), b.z - zc(b.x)) <= dr.beam_field_m && b.x >= dr.recapture_min_m) { b.end = { type: 'relock', t: tn }; b.mode = 'guided'; continue; }
        }
      }
      if (b === M && b.mode === 'blind' && loss === 'self_destruct' && tn - b.tLoss >= tt.sd_s) { b.end = { type: 'sd', t: b.tLoss + tt.sd_s }; continue; }
    }
    if (puffs.length && (ob.own_sight_tau || 0) > 0 && !M.end) { if (columnTau(0, Yv(tn), gunZ, M.x, M.y, M.z, puffs, tn, alpha, K, wash) >= ob.own_sight_tau) ownS += dt; }
    t = tn;
    // the main missile is settled once it has ended, or stayed guided past every round with no cloud on its line
    if (M.end && bodies.every(b => b.end || (b.wait != null && b.wait > t + 8))) break;
    if (M.mode === 'guided' && !M.end && first == null && rounds.every(r => r.done) && extraLeft === 0) break;
  }
  if (extra) res.extra = extra;
  res.rounds = rounds.length; res.t_last = rounds[rounds.length - 1].t_pass; res.own_block_s = ownS;
  for (const r of rounds) if (!r.done) { r.done = true; r.fate = 'downrange'; res.downrange++; }
  if (rec) {
    rec.rounds = rounds; rec.res = res; rec.t_ref = tRef != null ? tRef : rounds[0].t_pass + ob.form_s; rec.tau_need = tauNeed; rec.tau_s = tauS; rec.dim_t = dimT; rec.phys = { K, wash }; rec.wind_cross = wc; rec.d_first = first ? first.d : null;
    rec.puffs = puffs.map(p => ({ tf: p.ta - rec.t_ref, m: p.m, s0: p.s0, y0: p.y, z0: p.z - zc(p.x), d: p.x, x: p.x, y: p.y, z: p.z, wa: p.wa }));
    rec.win = win0 != null ? [win0 - rec.t_ref, win1 != null ? win1 - rec.t_ref : Infinity] : null;
    rec.traj = M.traj; rec.traj2 = bodies[1] ? bodies[1].traj : null; rec.frame = { R, LH, hh, los_off: tt.los_off };
  }
  if (!first) { res.reason = rounds.some(r => r.fate === 'downrange') ? 'fuze_miss' : 'false_trigger'; return res; }
  if (M.tLoss == null) { res.reason = M.saclos ? 'saclos_unaffected' : 'cloud_thin'; return res; }
  const tCut = M.tLoss;
  if (distAt(th, tCut) <= 5) { res.reason = 'too_late'; return res; }
  res.cut = true; res.sever = Math.max(M.lossX, 1); res.t_cut = tCut;
  const e = M.end || { type: 'plane', t: th.impact, y: M.y, z: M.z - hh, hit: false };
  if (e.type === 'sd') { res.outcome = 'self_destruct'; res.t_end = e.t; }
  else if (e.type === 'relock') { res.outcome = 'relock'; res.reason = 'relock'; res.t_relock = e.t; }
  else if (e.type === 'ground') { res.outcome = 'ground_short'; res.t_end = e.t; res.short = e.short; res.miss_m = e.short; res.miss_y = M.y; res.miss_z = -hh; }
  else { res.outcome = e.hit ? 'drift_hit' : 'drift_miss'; res.miss_m = Math.hypot(e.y, e.z); res.miss_y = e.y; res.miss_z = e.z; res.t_end = e.t; res.short = 0; }
  const P = bodies[1];
  if (P && P.tLoss != null && P.end && P.end.type !== 'relock') {
    res.partner_cut = true; res.partner_sever = Math.max(P.lossX, 1); res.partner_t = P.tLoss;
    const pe = P.end;
    if (pe.type === 'plane') { res.partner_outcome = pe.hit ? 'drift_hit' : 'drift_miss'; res.partner_miss_y = pe.y; res.partner_miss_z = pe.z; }
    else { res.partner_outcome = 'drift_miss'; res.partner_miss_y = P.y; res.partner_miss_z = pe.type === 'ground' ? -hh - 5 : 50; }
    res.partner_miss_m = Math.hypot(res.partner_miss_y, res.partner_miss_z);
  }
  return res;
}

// ------------------------------------------------------------------ meet-distance lookup (what the fire control learned)
const LOOKUP_GRID = []; for (let d = 400; d <= 2500; d += 100) LOOKUP_GRID.push(d);
function meetLookup(cfg, n) {
  n = n || 160;
  const rng = new RNG(99);
  const out = {};
  for (const key of Object.keys(cfg.enemy.mix)) {
    const tt = THREATS[key];
    if (!tt || !(cfg.enemy.mix[key] > 0) || !OBS_G[tt.guidance]) continue;
    const probs = [], rds = [];
    for (const d of LOOKUP_GRID) {
      let ok = 0, used = 0;
      for (let i = 0; i < n; i++) {
        const ctx = newCtx(cfg, rng);
        const R = Math.min(Math.max(d + 1500, 3000), tt.range_max);
        const th = newThreat(0, key, 0, R, 0, tt.speed);
        th.impact = R / tt.speed;
        th.los_slope = Math.max(tt.launch_h - 1.2, 0) / R;
        th.v_lat = ctx.speed * Math.sin(rng.uniform(0, 2 * Math.PI));
        th.wind_cross = ctx.wind * Math.sin(rng.uniform(0, 2 * Math.PI));
        if (d >= R) continue;
        const tf = timeAt(th, d) - tauOfS(d, cfg.rnd.muzzle_v, ctx.k);
        const mx = cfg.fc.sustain ? cfg.fc.sustain_max : 0, fcc = cfg.fc;
        let r = engageObscurant(ctx, th, tf, cfg.gun.burst, null, null, mx), bursts = 1, tPrev = tf;
        used += r.rounds;
        // same follow-up rule as the mission: fire again after a failed cut or when the missile recovers
        while (fcc.reengage && bursts < fcc.max_bursts) {
          let tReady;
          if (!r.cut) tReady = (r.t_last != null ? r.t_last : tPrev + 1) + (fcc.ai ? 0.6 : 1.0);
          else if (r.outcome === 'relock') tReady = r.t_relock + (fcc.ai ? 0.3 : 0.8);
          else break;
          const tf2 = tReady + cfg.gun.fc_latency_s + fcc.human_approval_s + cfg.gun.settle_s;
          if (tf2 >= Math.min(timeAt(th, 350) - tauOfS(350, cfg.rnd.muzzle_v, ctx.k), timeAt(th, 0) - 0.5)) break;
          r = engageObscurant(ctx, th, tf2, cfg.gun.burst, null, null, mx); bursts++; tPrev = tf2; used += r.rounds;
        }
        if (r.cut && (r.outcome === 'drift_miss' || r.outcome === 'ground_short' || r.outcome === 'self_destruct')) ok++;
      }
      probs.push(ok / n); rds.push(used / n);
    }
    // best = highest defeat chance, with a small charge for ammunition (10 extra rounds = 3 points)
    const sc = i => probs[i] - 0.003 * rds[i];
    let b = 0; for (let i = 1; i < probs.length; i++) if (sc(i) > sc(b)) b = i;
    out[key] = { grid: LOOKUP_GRID.slice(), p: probs, rounds: rds, best_m: LOOKUP_GRID[b], best_p: probs[b] };
  }
  return out;
}
function lookupKey(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  delete c.seed; delete c.missions; delete c.hkoi_enabled; delete c.aps; delete c.crew;
  const mix = c.enemy.mix; c.enemy = { mix };
  delete c.gun.obscurant_rounds; delete c.gun.he_rounds;
  return JSON.stringify(c);
}
function pEst(lookup, key, meet) {
  const tab = lookup[key];
  if (!tab || meet == null) return 0;
  const gr = tab.grid, p = tab.p;
  if (meet < gr[0]) return p[0] * Math.max(0, (meet - 300) / (gr[0] - 300));
  if (meet >= gr[gr.length - 1]) return p[p.length - 1];
  for (let i = 0; i < gr.length - 1; i++) if (meet <= gr[i + 1]) return p[i] + (p[i + 1] - p[i]) * (meet - gr[i]) / (gr[i + 1] - gr[i]);
  return 0;
}

// ------------------------------------------------------------------ mission
// the hull turret traverses with the weapon station on big slews, so their rates add (Abrams-class turret about 40 deg/s, short spin-up)
// the mount has inertia: it takes time to spin up and to stop, so a short slew is slower than rate alone suggests
function slewTime(g, az0, el0, az1, el1) { const acc = g.slew_acc_dps2 || 0, mv = (th, w) => acc > 0 ? (th < w * w / acc ? 2 * Math.sqrt(th / acc) : th / w + w / acc) : th / w;
  const da = angdiff(az0, az1), ta = g.turret_assist_dps || 0, az = da > 15 && ta > 0 ? mv(da, g.slew_az_dps + ta) + 0.1 : mv(da, g.slew_az_dps); return Math.max(az, mv(Math.abs(el1 - el0), g.slew_el_dps)) + g.settle_s; }

function runMission(cfg, rng, lookup, rec) {
  const ctx = newCtx(cfg, rng);
  const trng = th => th._rng || (th._rng = new RNG(seedFor(Math.floor(Math.abs(th.wind_cross || 0) * 1e6) % 2000000000 + th.idx * 7919 + Math.round(th.R), 4242)));
  // damage taken earlier in this raid (found by the damage model on a first pass): a destroyed system stops working from that moment on
  const DM = cfg.dmg || {}, dmT = k => (DM[k] && DM[k].x != null ? DM[k].x : 1e9), dmD = k => (DM[k] ? DM[k].d : 1e9);
  const g = cfg.duel && cfg.duel.on ? Object.assign({}, cfg.gun, { turret_assist_dps: 0 }) : cfg.gun, rd = cfg.rnd, fc = cfg.fc;   // in a gunnery duel the main turret cannot be lent to HKOI
  const threats = makeRaid(ctx);
  detect(ctx, threats);
  const followers = {};
  for (const t of threats) if (t.pair_of !== null) followers[t.pair_of] = t;
  const m = {};
  const add = (k, v) => { m[k] = (m[k] || 0) + (v === undefined ? 1 : v); };
  m.threats = threats.length;
  const ev = rec ? (t, kind, idx, text) => rec.events.push({ t, kind, idx, text }) : null;
  const lbl = th => `${THREATS[th.key].short} #${th.idx + 1}`;

  // false cues and decoys
  const dur = (threats.length ? Math.max(...threats.map(t => t.impact)) : 10) + 2;
  const nFalse = rng.poisson(cfg.lwr.false_alarm_per_min * dur / 60 + cfg.enemy.decoys);
  const pFire = fc.ai ? fc.false_track_fire_p_ai : fc.false_track_fire_p;
  const forced = [];
  for (let i = 0; i < nFalse; i++) { const t = rng.uniform(0, dur) + 1.5; if (cfg.hkoi_enabled && rng.random() < pFire) forced.push(t); }
  forced.sort((a, b) => a - b);
  m.false_cues = nFalse; m.wasted_bursts = 0;

  // candidates
  const cands = [];
  if (cfg.hkoi_enabled) {
    for (const th of threats) {
      const tt = THREATS[th.key];
      if (tt.guidance === 'ke') { th.skip = { why: 'ke' }; continue; }
      if (th.track === null) { th.tags.push('no_track'); continue; }
      if (tt.guidance === 'unguided') { th.tags.push('unguided_ignored'); th.skip = { why: 'unguided' }; continue; }
      const kind = OBS_G[tt.guidance] ? 'obs' : 'he';
      // behind the vehicle the mount is masked. If the main gun is not fighting, the crew swings the turret to bring the HKOI gun to bear, which costs time.
      let unmask = 0; { const dz = g.dead_zones_deg.find(([lo, hi]) => lo <= th.rel_brg && th.rel_brg <= hi);
        if (dz) { const ta = g.turret_assist_dps || 0; if (g.dead_zone_unmask === false || !ta || (cfg.duel && cfg.duel.on)) { th.tags.push('dead_zone'); th.skip = { why: 'dead_zone' }; continue; }
          unmask = (Math.min(th.rel_brg - dz[0], dz[1] - th.rel_brg) + 10) / ta + 1.5; th.tags.push('unmasked'); if (rec) ev(th.track, 'crew', th.idx, `${lbl(th)} is behind the vehicle, where the HKOI gun is masked: the turret swings to bring it to bear (${unmask.toFixed(1)} s)`); } }
      let want, dMin;
      if (kind === 'obs') { want = (fc.meet_mode === 'optimal' && lookup[th.key]) ? lookup[th.key].best_m : fc.fixed_meet_m; dMin = 350; }
      else { want = tt.guidance === 'drone' ? (rd.he_meet_drone_m || 800) : (rd.he_meet_missile_m || 700); dMin = rd.arm_distance_m + 40; }
      const want0 = want;
      const losClear = th.los_clear;
      want = Math.min(want, losClear, th.R - 1);
      if (want < dMin) { const w = losClear < dMin ? 'gun_los' : 'min_range'; th.tags.push(w); th.skip = { why: w, d: losClear < dMin ? losClear : th.R }; continue; }
      const el = Math.atan2(th.los_slope * want + 0.4, want) / DEG;
      if (!(g.el_min_deg <= el && el <= g.el_max_deg)) { th.tags.push('elevation_limit'); th.skip = { why: 'elevation_limit', el }; continue; }
      const ready = th.track + g.fc_latency_s + fc.human_approval_s + unmask;
      if (ready >= dmT('hkoi')) { th.tags.push('hkoi_down'); th.skip = { why: 'hkoi_down' }; if (rec) ev(Math.max(ready, dmT('hkoi')), 'miss', th.idx, `HKOI was knocked out by the earlier hit: nothing fires at ${lbl(th)}`); continue; }
      const ideal = timeAt(th, want) - tauOfS(want, rd.muzzle_v, ctx.k);
      let latest = timeAt(th, dMin) - tauOfS(dMin, rd.muzzle_v, ctx.k);
      latest = Math.min(latest, timeAt(th, 0) - 0.5);
      if (ready > latest) { const w = th.R < 1500 ? 'min_range' : 'no_time'; th.tags.push(w); th.skip = { why: w, t: ready, d: distAt(th, ready), dMin }; continue; }
      const pe = kind === 'obs' ? pEst(lookup, th.key, want) : (tt.guidance === 'drone' ? rd.he_pk_drone : rd.he_pk_missile);
      if (rec && kind === 'he' && ideal - ready > 2) ev(ready, 'cue', th.idx, `HKOI is tracking ${lbl(th)} at ${Math.round(distAt(th, ready))} m and holding fire until about ${Math.round(want)} m: at longer range a jinking ${tt.guidance === 'drone' ? 'drone' : 'target'} dodges the burst`);
      cands.push({ th, kind, ready, ideal, latest, az: th.brg, el, p: Math.max(pe, 0.01), dMin, want, want0, losClear });
    }
  }

  const BD = burstDur(g);
  function timing(order) {
    let gunT = -1e9, az = 0, el = 0; const fq = forced.slice(); const out = [];
    for (let j = 0; j < order.length; j++) {
      const c = order[j];
      const sl = slewTime(g, az, el, c.az, c.el);
      let tf = Math.max(c.ready, gunT + sl);
      while (fq.length && fq[0] <= tf) { const ft = Math.max(fq.shift(), gunT); gunT = ft + BD; tf = Math.max(tf, gunT + sl); }
      if (tf < c.ideal) {
        let tw = c.ideal;
        if (j + 1 < order.length) {
          const nx = order[j + 1], nsl = slewTime(g, c.az, c.el, nx.az, nx.el);
          if (tw + BD + nsl > nx.latest) tw = Math.max(tf, Math.min(c.ideal, nx.latest - nsl - 0.1 - (g.burst - 1) * 60 / g.rof_rpm));
        }
        tf = tw;
      }
      if (tf > c.latest) { out.push([c, null]); continue; }
      out.push([c, tf]);
      gunT = tf + BD; az = c.az; el = c.el;
    }
    return out;
  }
  const score = plan => plan.reduce((s, [c, tf]) => s + (tf !== null ? c.p : 0), 0);

  let planOrder;
  if (fc.ai && cands.length) {
    let order = cands.slice().sort((a, b) => a.latest - b.latest);
    let bestPlan = timing(order), best = score(bestPlan), improved = true;
    while (improved) {
      improved = false;
      const trials = [];
      for (let i = 0; i < order.length; i++) {
        trials.push(order.slice(0, i).concat(order.slice(i + 1)));
        if (i + 1 < order.length) { const o = order.slice(); [o[i], o[i + 1]] = [o[i + 1], o[i]]; trials.push(o); }
      }
      for (const o of trials) {
        const pl = timing(o), sc = score(pl);
        if (sc > best + 1e-9) { best = sc; bestPlan = pl; order = o; improved = true; break; }
      }
    }
    planOrder = bestPlan.filter(([c, tf]) => tf !== null).map(([c]) => c);
    const inPlan = new Set(planOrder);
    for (const c of cands) if (!inPlan.has(c)) c.th.tags.push('handed_to_aps');
  } else {
    planOrder = cands.slice().sort((a, b) => (a.th.cue !== null ? a.th.cue : a.ready) - (b.th.cue !== null ? b.th.cue : b.ready));
  }

  if (rec) {
    for (const th of threats) {
      const tt = THREATS[th.key];
      ev(th.t0, 'launch', th.idx, `${lbl(th)} launched at ${(th.R / 1000).toFixed(2)} km, bearing ${Math.round(mod360(th.brg))}°${th.pair_of !== null ? ` (same beam as #${th.pair_of + 1})` : ''}`);
      const km = d => (d / 1000).toFixed(2) + ' km';
      if (th.cue !== null && (th.track === null || th.cue <= th.track + 1e-6)) ev(th.cue, 'cue', th.idx, {
        lwr: `Laser warner detects ${lbl(th)}'s guidance beam at ${km(th.cue_d)}`,
        lwr_sal: `Laser warner detects the designator laser aimed at the vehicle (${lbl(th)})`,
        rf: `RF detector hears ${lbl(th)}'s radio link at ${km(th.cue_d)}`,
        maws: `Launch warner sees ${lbl(th)}'s motor ignite at ${km(th.cue_d)}`,
        aps_radar: `APS radar detects ${lbl(th)} at ${km(th.cue_d)} and hands it to HKOI`,
      }[th.cue_src]);
      if (th.track !== null) ev(th.track, 'track', th.idx, th.acq_src === 'search' ? `Radar search finds ${lbl(th)} (no warning) and tracks it at ${km(distAt(th, th.track))}` : `Radar track on ${lbl(th)} at ${km(distAt(th, th.track))}`);
      else if (th.tags.includes('no_cue_emcon')) ev(th.t0 + 0.05, 'miss', th.idx, `${lbl(th)} gives no warning and the radar is silent: HKOI never sees it`);
      else if (th.tags.includes('radar_down')) ev(Math.max(th.t0, cfg.dmg.radar.x) + 0.1, 'miss', th.idx, `The HKOI radar was knocked out by the earlier hit: ${lbl(th)} is never tracked`);
      else if (th.tags.includes('track_too_late')) ev(th.impact - 0.3, 'miss', th.idx, `Radar could not lock on to ${lbl(th)} before impact`);
      const sk = th.skip;
      if (sk && th.track !== null) {
        const tS = th.track + 0.05;
        const txt = {
          dead_zone: `${lbl(th)} is coming from behind, inside the arc the gun can't fire into: left to the APS`,
          gun_los: `Buildings or terrain hide ${lbl(th)} from the gun until about ${Math.round(sk.d)} m, too close to engage: left to the APS`,
          min_range: `${lbl(th)} was launched only ${km(th.R)} away: no time to fire before it is inside HKOI's ${th.skip.dMin || 350} m minimum. Left to the APS`,
          no_time: `${lbl(th)} was tracked too late (at ${km(sk.d || distAt(th, th.track))}): no time to fire before it is inside ${sk.dMin || 350} m. Left to the APS`,
          elevation_limit: `${lbl(th)} is too high above the vehicle for the gun to elevate: left to the APS`,
          unguided: `${lbl(th)} has no laser and no guidance link: nothing for a cloud to cut. HKOI holds fire and leaves it to the APS`,
        }[sk.why];
        if (txt) ev(tS, 'handoff', th.idx, txt);
      }
    }
    if (ctx.aps_inhibited) ev(0, 'miss', -1, 'Friendly troops are close to the vehicle, so the APS is held for this whole mission');
    if (!cfg.hkoi_enabled) ev(0, 'miss', -1, 'HKOI is not fitted in this run');
    for (const c of cands) if (c.th.tags.includes('handed_to_aps')) ev(c.ready, 'handoff', c.th.idx, `Fire control hands ${lbl(c.th)} to APS (better use of the gun elsewhere)`);
    rec.cands = cands.map(c => ({ idx: c.th.idx, kind: c.kind, want: c.want, p: c.p }));
  }

  // ---------------------------------------------------------------- crew
  // The crew watches the fire-control display. For each threat they judge, a few seconds before impact,
  // how sure they are it will miss. If not sure enough they act: the driver moves the vehicle, and as a
  // last resort the commander fires the smoke grenades. Moving and smoke also affect HKOI (see below).
  const CR = cfg.crew || {}, crewOn = !!CR.enabled, XP0 = CREW_XP[CR.experience] || CREW_XP.trained, FT = Math.max(0, Math.min(1, CR.fatigue || 0)), S0 = Math.max(10, Math.min(90, CR.stress0 || 10)),
    XP = FT ? { delay: XP0.delay * (1 + 0.6 * FT), noise: XP0.noise * (1 + FT), k: XP0.k * (1 + 0.5 * FT) } : XP0;   // a tired crew reacts slower, judges worse and frightens more easily
  const crew = { evade: null, smoke: null, dir: 1, acts: [], plan: [] };
  const radio = [];   // intercom: { t, who, txt: [calm, stressed, panic] }; the line used depends on the stress at that moment
  const say = (t, who, calm, stressed, panic) => { if (rec) radio.push({ t, who, txt: [calm, stressed || calm, panic || stressed || calm] }); };
  const DRVACK = {"hard left": ["Hard left.", "Hard left!", "Going left! Going!"], "hard right": ["Hard right.", "Hard right!", "Going right! Going!"], "back up": ["Backing up.", "Backing up!", "Backing! Backing!"], "move out": ["Moving out.", "Moving out!", "Going! Going!"], "forward": ["Moving out.", "Moving out!", "Going! Going!"], "stop": ["Stopping.", "Stopping!", "Stopped! Stopped!"], "weave": ["Weaving.", "Weaving!", "Weaving! I’m weaving!"], "reverse": ["Backing up.", "Backing up!", "Backing! Backing!"]};
  const kindW = th => THREATS[th.key].guidance === 'drone' ? 'Drone' : 'Missile';
  const clock = brg => { const c = Math.round(mod360(brg - ctx.hull) / 30) % 12; return (c === 0 ? 12 : c) + " o'clock"; };
  // ---- the vehicle's own path once the driver moves: it turns square to the threat, reverses or weaves (east, north in metres)
  const PDT = 0.1; let path = null; const steadyWin = []; if (ctx.duel) for (const q of ctx.duel.shots) steadyWin.push([q.t - 1.2, q.t + 0.1]);   // HKOI firing windows: the gunner calls 'driver, steady' and the driver eases off
  const EXT = cfg.ext && cfg.ext.path && cfg.ext.path.length > 1 ? cfg.ext.path : null;   // battle layer: the vehicle's movement comes from outside (driver AI on real terrain), sampled every PDT seconds
  if (EXT) crew.evade = EXT[0][0];
  function buildPath() {
    if (EXT) { path = EXT; return; }
    path = []; if (crew.evade === null) return;
    const plan = crew.plan.slice().sort((a, b) => a.t - b.t), tEnd = Math.max(...threats.map(o => o.impact)) + 6;
    let x = 0, n = 0, h = ctx.hull, v = 0, k = 0, seg = null;
    for (let t = crew.evade; t <= tEnd + 1e-9; t += PDT) {
      while (k < plan.length && plan[k].t <= t + 1e-9) seg = plan[k++];
      if (seg) {
        let hd = seg.hdg; if (seg.zig) hd += seg.zig * (Math.floor((t - seg.t) / seg.zp) % 2 ? 1 : -1);
        // Abrams-class mobility: pivot steer at low speed, about 45 deg/s; 30 deg/s at speed; strong turbine pull from a standstill
        const face = seg.rev ? hd + 180 : hd, dh = ((face - h + 540) % 360) - 180, rate = seg.stall || t >= dmT('mob') ? 0 : (Math.abs(v) < 3 ? 45 : 30) * PDT * (t >= dmD('mob') ? .5 : 1);
        h += Math.max(-rate, Math.min(rate, dh));
        const steady = cfg.hkoi_enabled && steadyWin.some(w => t >= w[0] - 0.8 && t <= w[1] + 0.3);
        const vmax = seg.stall || t >= dmT('mob') ? 0 : Math.min(steady ? (CR.steady_speed == null ? 4 : CR.steady_speed) : 1e9, (seg.rev ? Math.min(CR.reverse_speed || 8, CR.evade_speed) : CR.evade_speed) * (Math.abs(dh) > 60 ? 0.7 : 1)), want = seg.rev ? -vmax : vmax;
        const acc = (CR.accel || 2.4) * Math.max(0.25, 1 - Math.abs(v) / 15), brake = 4;
        const dv = want - v, aa = (v === 0 || Math.sign(dv) === Math.sign(v)) ? acc : brake; v += Math.sign(dv) * Math.min(Math.abs(dv), aa * PDT);
      }
      path.push([t, x, n, h, v]);
      x += v * Math.sin(h * DEG) * PDT; n += v * Math.cos(h * DEG) * PDT;
    }
  }
  const posAt = t => { if (crew.evade === null || t <= crew.evade) return [0, 0, ctx.hull, 0]; if (!path) buildPath(); const p = path[Math.min(path.length - 1, Math.max(0, Math.floor((t - crew.evade) / PDT)))]; return [p[1], p[2], p[3], p[4]]; };
  const latOf = (th, t) => { const [x, n] = posAt(t), b = th.brg * DEG; return x * Math.cos(b) - n * Math.sin(b); };
  const vEv = t => Math.abs(posAt(t)[3]);
  const smokeUp = t => crew.smoke !== null && t >= crew.smoke + CR.smoke_form_s && t <= crew.smoke + CR.smoke_form_s + CR.smoke_s;
  const sideY = (th, t) => Math.sin((ctx.hull - th.brg) * DEG) * ctx.speed * t + latOf(th, t);
  const modeAt = (th, t) => { let md = 'guided'; for (const p of (th.viz.phases || [])) if (p.t <= t) md = p.mode; return md; };
  const knownT = th => Math.min(th.cue !== null ? th.cue : 1e9, th.track !== null ? th.track : 1e9);
  const planP = new Map(planOrder.map(c => [c.th, c.p]));
  // stress from what the crew has seen and heard so far (used for their decisions; the display uses the full raid)
  // each crewman can react to the same events more or less strongly, recover faster or slower, and be more or less prone to freezing
  const RO = CR.roles || {}, rg = r => (r && RO[r] && RO[r].gain) || 1, rr = r => (r && RO[r] && RO[r].recover) || 1, rf = r => (r && RO[r] && RO[r].freeze != null) ? RO[r].freeze : 1;
  // the commander does one thing at a time: orders and judgements queue up behind each other
  const cdrTasks = [], cdrSlot = (tw, dur, what, idx) => { let t0 = tw; if (CR.queue !== false) { cdrTasks.sort((a, b) => a.t0 - b.t0); for (const q of cdrTasks) if (t0 + dur > q.t0 && t0 < q.t1) t0 = q.t1; } cdrTasks.push({ who: 'cdr', t0, t1: t0 + dur, what, idx, wait: t0 - tw }); return t0; };
  function stressNow(t, role) {
    const E = [], k = XP.k, tr = 0.4 + 0.6 * CR.trust, gR = rg(role), TAU = 6 / rr(role);
    for (const th of threats) {
      const kn = knownT(th); if (kn > t || kn >= th.impact) continue;
      E.push([Math.max(kn, 0), 14 * k]);
      const tc = timeAt(th, 800); if (kn < tc && tc <= t && tc > th.t0 && modeAt(th, tc) === 'guided' && !(th.viz.end && th.viz.end.t <= tc)) E.push([tc, 16 * k]);
      for (const p of th.viz.phases || []) if (p.t <= t) E.push([p.t, p.mode === 'blind' ? -16 * tr : 18 * k]);
      if (th.viz.fail_t != null && th.viz.fail_t <= t) E.push([th.viz.fail_t, 10 * k]);
      if (th.viz.end && th.viz.end.t <= t) E.push([th.viz.end.t, -14]);
    }
    let inb = 0; for (const o of threats) if (knownT(o) <= t && o.impact > t && o.impact - t < 6 && !(o.viz.end && o.viz.end.t <= t) && modeAt(o, t) === 'guided') inb++;
    if (inb >= 2) E.push([t, 8 * (inb - 1) * k]);
    if (ctx.duel) { const du = ctx.duel; if (du.spot <= t) E.push([du.spot, 14 * k]); for (const e of du.enemy) if (e.t + 1 <= t) E.push([e.t + 1, 9 * k]); if (du.deadT !== null && du.deadT <= t) E.push([du.deadT, -18]); }
    for (const a of crew.acts) if (a.t <= t) E.push([a.t, a.kind === 'smoke' ? 6 : a.stall ? 12 : a.why === 'drill' ? 2 : 8]);
    E.sort((a, b) => a[0] - b[0]); let s = S0, tl = 0;
    for (const [tt, d] of E) { s = S0 + (s - S0) * Math.exp(-Math.max(tt - tl, 0) / TAU); s = Math.max(0, Math.min(100, s + (d > 0 ? d * gR : d))); tl = tt; }
    return S0 + (s - S0) * Math.exp(-Math.max(t - tl, 0) / TAU);
  }
  // choose a direction square to the threat line, keeping clear of the other threats' lines; panic can wreck the choice
  function planMove(t, th, panic) {
    const [, , h] = posAt(t), b = th ? th.brg : ctx.hull;
    const live = threats.filter(o => o !== th && knownT(o) <= t && o.impact > t && !(o.viz.end && o.viz.end.t <= t));
    let best = null;
    for (const side of [90, -90]) for (const rev of [false, true]) {
      const hd = mod360(b + side), face = rev ? hd + 180 : hd;
      let cost = angdiff(face, h) / 90 + (rev ? 0.3 : 0) + rng.uniform(0, 0.15);
      for (const o of live) cost += 0.8 * Math.abs(Math.cos((hd - o.brg) * DEG)) / Math.max(1, (o.impact - t) / 4);
      if (!best || cost < best.cost) best = { hd, rev, cost };
    }
    const pBad = panic ? Math.min(0.9, (CR.experience === 'veteran' ? 0.12 : CR.experience === 'green' ? 0.45 : 0.3) * rf('drv')) : 0;
    let seg = { t, hdg: best.hd, rev: best.rev, zig: best.rev ? 0 : rng.uniform(22, 34), zp: rng.uniform(2.4, 3.8), why: 'square' };
    if (rng.random() < pBad) {
      if (rng.random() < 0.5) { seg = { t, hdg: mod360(b + 180 + rng.normal(0, 12)), rev: angdiff(mod360(b + 180), h) > 100, zig: 0, zp: 3, why: 'flee' }; }
      else { const st = rng.uniform(1.2, 2.6); crew.plan.push({ t, hdg: h, rev: false, stall: true, why: 'stall' }); seg.t = t + st; seg.why = 'stall'; }
    }
    if (panic && seg.zig) { seg.zig = rng.uniform(30, 48); seg.zp = rng.uniform(1.4, 2.4); }
    crew.plan.push(seg); path = null;
    return seg;
  }
  function crewAct(t, why, th, wantSmoke, panic) {
    if (!crewOn) return;
    const first = crew.evade === null;
    if (first || t < crew.evade) crew.evade = first ? t : Math.min(crew.evade, t);
    const seg = planMove(t, th, !!panic);
    crew.acts.push({ t, kind: 'evade', why, idx: th ? th.idx : -1, stall: seg.why === 'stall' });
    const turn = ((seg.hdg - posAt(t)[2] + 540) % 360) - 180, dirTxt = seg.rev ? 'back up' : (Math.abs(turn) < 25 ? 'move out' : turn > 0 ? 'hard right' : 'hard left');
    if (rec && EXT) {   // battle layer drives: its own order replaces the legacy drill lines, voiced once
      const o = cfg.ext.order; if (o && !crew._extSaid) { crew._extSaid = true; ev(t, 'crew', th ? th.idx : -1, o.ev); if (o.cdr) say(t, 'CDR', ...o.cdr); if (o.drv) say(t + 0.55, 'DRV', ...o.drv); }
    } else if (rec) {
      ev(t, 'crew', th ? th.idx : -1, seg.why === 'flee' ? `Crew panics: the driver runs straight away from ${th ? lbl(th) : 'the threat'}, along its line of fire` : seg.why === 'stall' ? 'Crew panics: the driver freezes for a moment before moving' :
        { drill: `Warning on ${th ? lbl(th) : 'a threat'}: driver moves at once and turns square to its line`, unsure: `Crew is only ${Math.round((th && th.crew ? th.crew.felt : 0) * 100)}% sure ${th ? lbl(th) : 'the threat'} will miss: driver turns square to its line and ${seg.rev ? 'reverses' : 'weaves'}`, cut: `HKOI calls the cut on ${th ? lbl(th) : 'the missile'}: driver sidesteps out of its path`, warning: 'Laser warning: driver moves off at once' }[why]);
      if (seg.why === 'stall') { say(t, 'CDR', 'Driver, move!', 'Driver! MOVE!', 'MOVE! MOVE! WHY AREN’T WE MOVING?!'); say(t + 0.6, 'DRV', 'Moving.', 'I’m trying—', 'I can’t— it won’t— hold on!'); }
      else if (seg.why === 'flee') { say(t, 'CDR', 'Driver, back up!', 'Get us out of here!', 'GO! GO! JUST GO!'); say(t + 0.55, 'DRV', ...DRVACK['back up']); }
      else { say(t, 'CDR', `Driver, ${dirTxt}.`, `Driver, ${dirTxt}! Now!`, `${dirTxt.toUpperCase()}! ${dirTxt.toUpperCase()}! IT’S COMING IN!`); const ak = DRVACK[dirTxt]; if (ak) say(t + 0.55, 'DRV', ...ak); };
    }
    if (wantSmoke && CR.smoke !== 'never' && crew.smoke === null) {
      crew.smoke = t; crew.acts.push({ t, kind: 'smoke', why });
      if (rec) { ev(t, 'crew', th ? th.idx : -1, 'Commander fires the smoke grenades'); ev(t + CR.smoke_form_s, 'crew', -1, `Smoke screen is up: enemy gunners lose sight of the vehicle, and so do the crew and HKOI's camera, for ${CR.smoke_s} s`); say(t, 'CDR', 'Smoke, smoke, smoke.', 'Popping smoke!', 'SMOKE! SMOKE! SMOKE!'); }
    }
  }
  function crewDecide(th) {
    th.crew_done = true;
    if (!crewOn) return;
    let td = th.tdec; const e = th.viz.end;
    if (e && e.t <= td) return;
    if (knownT(th) > td) { th.crew = { t: td, unaware: true }; return; }
    { const sc = stressNow(td, 'cdr'); let dur = 1.2 * XP.k * (1 + Math.max(0, sc - 30) / 100); const frz = sc >= 80 && rng.random() < Math.min(0.9, 0.25 * rf('cdr')); if (frz) dur += rng.uniform(1, 2);
      const t0 = cdrSlot(td, dur, 'Judging ' + lbl(th), th.idx); if (frz && rec) ev(t0, 'crew', th.idx, 'The commander freezes for a moment before deciding');
      if (t0 > td + 0.05) { if (t0 >= th.impact - 0.2 || (e && e.t <= t0)) { th.crew = { t: td, busy: true }; if (!th.tags.includes('cdr_busy')) th.tags.push('cdr_busy'); if (rec) ev(td, 'crew', th.idx, `The commander is still busy with the last threat: no decision on ${lbl(th)} in time`); return; } td = t0; } }
    const tt = THREATS[th.key], drone = tt.guidance === 'drone';
    const fired = th.viz.fired != null && th.viz.fired <= td, blind = modeAt(th, td) === 'blind';
    const failed = (th.viz.fail_t != null && th.viz.fail_t <= td) || (th.viz.relock && th.viz.relock.t <= td);
    const p = planP.has(th) ? planP.get(th) : 0;
    let cH = 0;
    if (cfg.hkoi_enabled) cH = blind ? 0.85 : (failed && !blind) ? 0.15 : fired ? p : 0.8 * p;
    const cA = (cfg.aps.enabled && !ctx.aps_inhibited) ? (drone ? cfg.aps.pk_drone : cfg.aps.pk_uncued) : 0;
    let pressure = 0; for (const o of threats) if (o !== th && knownT(o) <= td && o.impact > td && !(o.viz.end && o.viz.end.t <= td)) pressure++;
    const s = stressNow(td, 'cdr'), panic = s >= 80, stressed = s >= 55;
    const shown = 1 - (1 - cH) * (1 - cA);
    // a frightened crew trusts the display less and judges worse
    const felt = Math.max(0, Math.min(1, 1 - (1 - cH * (0.4 + 0.6 * CR.trust) * (panic ? 0.7 : 1)) * (1 - cA) - 0.06 * XP.k * pressure + rng.normal(0, XP.noise * (panic ? 2 : stressed ? 1.4 : 1))));
    th.crew = { t: td, shown, felt, stress: s };
    const delay = XP.delay * (panic ? 1.25 : stressed ? 1.1 : 1);
    const smokeWanted = CR.smoke === 'always' || (CR.smoke === 'last' && (felt < CR.need - 0.3 || (panic && rng.random() < 0.6)));
    if (CR.doctrine !== 'hold' && felt < CR.need) crewAct(td + delay, 'unsure', th, smokeWanted, stressNow(td + delay, 'drv') >= 80);
    else if (rec && cfg.hkoi_enabled && blind) { ev(td, 'crew', th.idx, `Display shows ${lbl(th)} severed. Crew is ${Math.round(felt * 100)}% sure it will miss and holds position`); say(td, 'CDR', 'It’s blind. Hold your position.', `It’s blind— hold, hold!`, `It says it’s blind— is it? IS IT?`); }
  }
  const PL = cfg.player && cfg.player.on ? cfg.player : null;
  for (const th of threats) th.tdec = Math.min(th.impact, Math.max(th.impact - (CR.decide_s || 4), knownT(th)));
  if (PL && crewOn) {
    for (const o of (PL.orders || []).slice().sort((a, b) => a.t - b.t)) {
      if (o.kind === 'smoke') { if (crew.smoke === null && CR.smoke !== 'never_player') { crew.smoke = o.t; crew.acts.push({ t: o.t, kind: 'smoke', why: 'player' }); if (rec) { ev(o.t, 'crew', -1, 'Commander fires the smoke grenades'); say(o.t, 'CDR', 'Smoke, smoke, smoke.', 'Popping smoke!', 'SMOKE! SMOKE! SMOKE!'); ev(o.t + CR.smoke_form_s, 'crew', -1, `Smoke screen is up for ${CR.smoke_s} s`); } } continue; }
      if (crew.evade === null) crew.evade = o.t;
      const h = posAt(o.t)[2], hd = o.kind === 'left' ? mod360(h - 90) : o.kind === 'right' ? mod360(h + 90) : o.kind === 'hdg' ? o.hdg : h;
      const seg = { t: o.t, hdg: hd, rev: o.kind === 'back', zig: o.kind === 'weave' ? 30 : 0, zp: 2.2, stall: o.kind === 'stop', why: 'player' };
      crew.plan.push(seg); path = null; crew.acts.push({ t: o.t, kind: 'evade', why: 'player', idx: -1, stall: false });
      const txt = { left: 'hard left', right: 'hard right', back: 'back up', fwd: 'forward', stop: 'stop', weave: 'weave', hdg: 'turn' }[o.kind] || o.kind;
      if (rec) { ev(o.t, 'crew', -1, `Commander orders the driver: ${txt}`); { say(o.t, 'CDR', `Driver, ${txt}.`, `Driver, ${txt}! Now!`, `${txt.toUpperCase()}! ${txt.toUpperCase()}!`); const ak = DRVACK[txt]; if (ak) say(o.t + 0.55, 'DRV', ...ak); }; }
    }
  }
  // drill: a trained crew does not wait to judge the odds. On the warning the commander calls it and the driver moves at once.
  if (crewOn && !PL && CR.drill !== false && CR.doctrine !== 'hold') for (const th of threats.slice().sort((a, b) => knownT(a) - knownT(b))) {
    const kn = knownT(th); if (kn >= th.impact - 0.3 || kn > 1e8) continue; const td = cdrSlot(Math.max(kn, 0) + XP.delay * 0.8, 0.8 * XP.k, 'Ordering the driver: ' + lbl(th), th.idx);
    if (td >= th.impact - 0.3) { if (rec) ev(Math.max(kn, 0), 'crew', th.idx, `The commander is still giving the last order: no move ordered for ${lbl(th)}`); continue; }
    if (th.viz.end && th.viz.end.t <= td) continue;
    const s0 = stressNow(td, 'drv'); th.drill_t = td; crewAct(td, 'drill', th, false, s0 >= 80);
  }
  const crewOrder = threats.slice().sort((a, b) => a.tdec - b.tdec);
  const crewPending = tNow => { if (crewOn && !PL) for (const th of crewOrder) if (!th.crew_done && th.tdec < tNow) crewDecide(th); };
  // the stabiliser is knocked off for a moment when the driver throws the vehicle into a move, and when the main gun fires
  const crewClock = tf => { crewPending(tf); ctx.speedNow = ctx.speed + vEv(tf); ctx.eoNow = ctx.eo_ok && !smokeUp(tf); ctx.upsetNow = crew.acts.some(a => a.kind === 'evade' && tf >= a.t && tf < a.t + 1.2) || !!(ctx.duel && ctx.duel.shots.some(q => tf >= q.t && tf < q.t + 0.8)); };
  if (crewOn && CR.doctrine === 'warning') { const k0 = Math.min(...threats.map(knownT)); if (k0 < 1e8) { const th0 = threats.reduce((a, o) => knownT(o) < knownT(a) ? o : a); crewAct(Math.max(k0, 0) + XP.delay, 'warning', th0, CR.smoke === 'always', false); } }
  // intercom: first word of each threat
  if (rec) for (const th of threats) { const kn = knownT(th); if (kn < th.impact) { say(Math.max(kn, 0) + 0.15, 'CDR', `${kindW(th)}, ${clock(th.brg)}.`, `${kindW(th)}! ${clock(th.brg)}!`, `${kindW(th).toUpperCase()}! ${clock(th.brg).toUpperCase()}!`); if (cfg.hkoi_enabled) say(Math.max(kn, 0) + 1.5, 'GNR', 'Identified.', 'Identified!', 'I SEE IT! I SEE IT!'); }; }
  const relocked = [];
  const retry = [];
  // proximity HE burst (drones, SAL missiles). On a miss, queue a follow-up if re-engagement is on.
  function resolveHE(th, tf, nr, second) {
    add('he_rounds', nr);
    const drone = THREATS[th.key].guidance === 'drone', pk = drone ? rd.he_pk_drone : rd.he_pk_missile;
    const tau = solveMeet(distAt(th, tf), th.v, rd.muzzle_v, ctx.k), d = sOfTau(tau, rd.muzzle_v, ctx.k);
    // an evasive drone pilot jinks while the rounds are in flight; the part of that the fire control cannot predict moves the drone away from the burst
    // operator skill scales the jink and adds feints: an expert breaks away just as the gun opens, which wastes that burst outright (assumed figures, see DRONE_SKILL)
    const SK = DRONE_SKILL[cfg.enemy.drone_skill] || DRONE_SKILL.trained, evOn = cfg.enemy.drone_evasion !== false;
    th.viz.skill = cfg.enemy.drone_skill || 'trained';
    const feint = drone && evOn && SK.feint > 0 && trng(th).random() < SK.feint;
    if (feint) { th.viz.feints = (th.viz.feints || []); th.viz.feints.push(tf); if (!th.tags.includes('feinted')) th.tags.push('feinted'); add('drone_feints'); }
    const jg = drone && evOn ? (cfg.enemy.drone_jink_g == null ? 1.2 : cfg.enemy.drone_jink_g) * SK.jink * (second ? 1.6 : 1) : 0, dj = 0.5 * jg * 9.81 * tau * tau * 0.6, Rk = drone && rd.he_drone_radius_m != null ? rd.he_drone_radius_m : rd.fuze_radius_m + 3, fj = Rk * Rk / (Rk * Rk + dj * dj);
    if (drone && jg > 0) { th.viz.jink = jg; if (!th.tags.includes('jinked')) th.tags.push('jinked'); }
    const kill = !feint && trng(th).random() < pk * fj * nr / g.burst * (ctx.upsetNow && (g.stab_upset_mrad || 0) > 0 ? 0.8 : 1);
    if (kill) { th.state = 'destroyed'; th.defeated_by = 'hkoi_he'; th.viz.end = { t: tf + tau, type: 'he_kill', d }; }
    else { if (!th.tags.includes('he_miss')) th.tags.push('he_miss'); add('downrange', nr); { const dn = d - (rd.he_step_m || 120), dm = rd.arm_distance_m + 60; retry.push({ th, t: drone && dn > dm ? Math.max(tf + tau + 0.3, timeAt(th, dn) - tauOfS(dn, rd.muzzle_v, ctx.k) - g.fc_latency_s) : tf + tau + 0.3, kind: 'he' }); } }
    if (rec) {
      const rounds = []; for (let i = 0; i < nr; i++) { const tfi = tf + i * 60 / g.rof_rpm; if (distAt(th, tfi) <= 0) break; const ti = solveMeet(distAt(th, tfi), th.v, rd.muzzle_v, ctx.k); rounds.push({ t_fire: tfi, t_pass: tfi + ti, d: sOfTau(ti, rd.muzzle_v, ctx.k), fate: kill && i === 0 ? 'he_kill' : 'downrange', ey: 0 }); }
      rec.bursts.push({ idx: th.idx, kind: 'he', tf, rounds });
      ev(tf, 'fire', th.idx, `${second ? 'Follow-up burst: ' : ''}${nr} × proximity HE at ${lbl(th)}, meeting it at ${Math.round(d)} m`);
      if (kill) { ev(tf + tau, 'kill', th.idx, `HE burst destroys ${lbl(th)} at ${Math.round(d)} m`); say(tf + tau + 0.1, 'GNR', 'Target.', 'Target! It’s down!', 'GOT IT! GOT IT!'); }
      else ev(tf + tau, 'miss', th.idx, `HE burst misses ${lbl(th)}`);
    }
  }
  function resolveObs(c, th, tf, nr, second, slack) {
    const lateBy = tf - c.ideal;
    const lateWhy = c.want0 != null && c.want < c.want0 - 100 ? (c.want < c.losClear + 1 && c.losClear < c.want0 ? 'terrain' : 'launch') : lateBy > 0.05 ? (c.ready > c.ideal + 0.05 ? 'track' : 'gun') : null;
    let partner = followers[th.idx];
    if (partner && partner.state !== 'inbound') partner = null;
    const er = {};  // always collected so batch runs and replays take identical decisions
    const mx = fc.sustain ? Math.max(0, Math.min(fc.sustain_max, obsLeft, Math.floor((slack == null ? 1e9 : slack) / (60 / g.rof_rpm)))) : 0;
    ctx.vehY = t => sideY(th, t); const R0 = ctx.rng; ctx.rng = trng(th); const r = engageObscurant(ctx, th, tf, nr, partner || null, er, mx); ctx.rng = R0; ctx.vehY = null;
    if (r.extra) {
      obsLeft -= r.extra; add('obs_rounds', r.extra); add('sustain_rounds', r.extra);
      const tEndFire = tf + (nr - 1 + r.extra) * 60 / g.rof_rpm + 0.1;
      if (!second) gunT = Math.max(gunT, tEndFire);
      busyPush([tf, tEndFire]);
      if (rec) ev(tf + nr * 60 / g.rof_rpm, 'fire', th.idx, `Radar shows ${lbl(th)} could still recover: gun keeps firing, ${r.extra} more round${r.extra > 1 ? 's' : ''} to hold the cloud`);
    }
    th.meet = r.meet;
    add('downrange', r.downrange); add('own_block_s', r.own_block_s);
    if (r.meet != null) {
      const plan = c.want0 != null ? c.want0 : c.want;
      if (!second) { add('meet_n'); add('meet_plan_sum', plan); add('meet_act_sum', r.meet); }
      if (!second && r.meet < plan - 150) { add('meet_short'); add('meet_short_' + (lateWhy || 'other')); }
    }
    if (rec) {
      rec.bursts.push({ idx: th.idx, kind: 'obs', tf, lead_mode: cfg.fc.own_lead === false ? 'none' : (cfg.fc.lead_mode || 'steering'), rounds: er.rounds, puffs: er.puffs, t_ref: er.t_ref, tau_need: er.tau_need, tau_s: er.tau_s, dim_t: er.dim_t, phys: er.phys, win: er.win, wind_cross: er.wind_cross, res: r });
      if (er.traj) (th.viz.trajs = th.viz.trajs || []).push({ pts: er.traj, frame: er.frame }); if (er.traj2 && partner) (partner.viz.trajs = partner.viz.trajs || []).push({ pts: er.traj2, frame: er.frame });
      const am = r.meet != null ? Math.round(r.meet) : null;
      if (second) ev(tf, 'fire', th.idx, `Radar sees ${lbl(th)} steering back onto its beam: second burst of ${nr} × obscurant, meeting it at ${am} m`);
      else if (lateWhy && am != null && am < (c.want0 || c.want) - 100) {
        const plan = Math.round(c.want0 || c.want);
        const why = { track: `the radar track only came at ${(distAt(th, th.track) / 1000).toFixed(2)} km, too late to reach ${plan} m`, gun: 'the gun was still busy with another threat', terrain: `the ground hides the missile from the gun until about ${Math.round(c.losClear)} m`, launch: `it was launched only ${(th.R / 1000).toFixed(2)} km away` }[lateWhy];
        ev(tf, 'fire', th.idx, `${nr} × obscurant at ${lbl(th)}. Planned to meet it at ${plan} m, but ${why}, so the rounds meet it at ${am} m`);
      } else ev(tf, 'fire', th.idx, `${nr} × obscurant at ${lbl(th)}, rounds meet it at ${am != null ? am : Math.round(c.want)} m`);
      say(tf, 'GNR', second ? 'Re-engaging. On the way.' : 'On the way.', second ? 'Again! On the way!' : 'On the way!', 'ON THE WAY! ON THE WAY!');
      const nb = er.rounds.filter(x => x.fate === 'bloom').length, nc = er.rounds.filter(x => x.fate === 'colocated').length;
      const nd = er.rounds.filter(x => x.fate === 'downrange').length, nfalse = er.rounds.filter(x => x.fate === 'false_trigger').length;
      if (er.rounds.length) ev(er.rounds[0].t_pass, 'fuze', th.idx, `Rounds pass ${lbl(th)}: ${nb} proximity bloom${nb === 1 ? '' : 's'}${nc ? `, ${nc} co-located` : ''}${nd ? `, ${nd} flew on downrange` : ''}${nfalse ? `, ${nfalse} burst early over clutter` : ''}`);
    }
    if (!r.cut) {
      if (!th.tags.includes(r.reason)) th.tags.push(r.reason);
      // the radar sees the missile still flying true: try again if time allows
      const lastPass = er.rounds && er.rounds.length ? er.rounds[er.rounds.length - 1].t_pass : tf + 1;
      retry.push({ th, t: lastPass + (fc.ai ? 0.6 : 1.0), kind: 'obs' });
      th.viz.fail_t = lastPass + 0.4;
      if (rec) {
        const why = { too_late: 'too late, no round reached it', fuze_miss: 'no fuze triggered near the missile', false_trigger: 'fuzes triggered on ground clutter', cloud_thin: 'cloud too thin to break the beam', saclos_unaffected: 'SACLOS tracker saw through the cloud' }[r.reason] || r.reason;
        ev(er.rounds.length ? er.rounds[er.rounds.length - 1].t_pass + 0.4 : tf + 1, 'miss', th.idx, `${lbl(th)} keeps guidance: ${why}`);
        say(er.rounds.length ? er.rounds[er.rounds.length - 1].t_pass + 0.5 : tf + 1.1, 'GNR', 'No cut. Still guiding.', 'No cut! It’s still guiding!', `IT DIDN\u2019T WORK! IT\u2019S STILL COMING!`);
      }
      return;
    }
    th.sever_m = r.sever;
    th.viz.sever = { t: r.t_cut, d: r.sever }; (th.viz.phases = th.viz.phases || []).push({ t: r.t_cut, mode: 'blind' });
    if (rec) ev(r.t_cut, 'cut', th.idx, `Cloud blocks ${lbl(th)}'s beam at ${Math.round(r.sever)} m, guidance lost`);
    if (crewOn && CR.doctrine === 'cut') crewAct(r.t_cut + 0.6 * XP.delay, 'cut', th, false, false);
    say(r.t_cut + 0.1, 'GNR', 'Beam’s cut. It’s blind.', 'Cut! It’s blind!', `It\u2019s cut\u2014 it\u2019s cut! Is it still coming?!`);
    const oc = r.outcome;
    if (oc === 'self_destruct') {
      th.state = 'destroyed'; th.defeated_by = 'self_destruct';
      th.viz.end = { t: r.t_end, type: 'self_destruct', d: distAt(th, r.t_end) };
      if (rec) ev(r.t_end, 'kill', th.idx, `${lbl(th)} self-destructs after ${THREATS[th.key].sd_s} s blind`);
    } else if (oc === 'relock') {
      th.tags.push('relock'); th.viz.relock = { t: r.t_relock }; th.viz.phases.push({ t: r.t_relock, mode: 'guided' }); retry.push({ th, t: r.t_relock + (fc.ai ? 0.3 : 0.8), kind: 'obs' });
      if (rec) ev(r.t_relock, 'miss', th.idx, `Cloud clears, ${lbl(th)} reacquires the beam at ${Math.round(distAt(th, r.t_relock))} m`);
      say(r.t_relock + 0.1, 'GNR', 'It’s back on the beam.', 'It’s back on the beam!', `IT\u2019S BACK! IT\u2019S GUIDING AGAIN!`);
    } else if (oc === 'ground_short') {
      th.state = 'missed'; th.defeated_by = 'hkoi_cut';
      add('sev_miss_sum', r.sever); add('sev_miss_n'); add('ground_short');
      th.viz.end = { t: r.t_end, type: 'ground', d: r.short };
      if (rec) ev(r.t_end, 'kill', th.idx, `${lbl(th)} sags into the ground ${Math.round(r.short)} m short`);
    } else {
      // blind and flying on: whether it hits is settled later, once the crew's own moves are known
      th.state = 'blind_pending';
      th.blind = { y: r.miss_y, z: r.miss_z, tCut: r.t_cut, tEnd: r.t_end, hit0: oc === 'drift_hit', sever: r.sever };
    }
    if (r.partner_cut && partner) {
      partner.tags.push('cut_by_leader_cloud');
      partner.viz.sever = { t: r.partner_t, d: r.partner_sever }; (partner.viz.phases = partner.viz.phases || []).push({ t: r.partner_t, mode: 'blind' });
      if (rec) ev(r.partner_t, 'cut', partner.idx, `${lbl(partner)} flies into the same cloud and loses the beam`);
      partner.state = 'blind_pending';
      partner.blind = { y: r.partner_miss_y, z: r.partner_miss_z, tCut: r.partner_t, tEnd: partner.impact, hit0: r.partner_outcome === 'drift_hit', sever: r.partner_sever, partner: true };
    }
  }
  const busy = []; let lastSteady = -1e9; const busyPush = w => { busy.push(w); steadyWin.push(w); path = null; if (crew.evade !== null && w[0] >= crew.evade && w[0] - lastSteady > 4) { lastSteady = w[0]; if (stressNow(w[0]) <= 80) say(Math.max(0, w[0] - 0.7), 'GNR', 'Driver, steady.', 'Steady! Steady!', 'Steady! Steady!'); } };
  // execute
  let gunT = -1e9, az = 0, el = 0; const fq = forced.slice();
  let obsLeft = g.obscurant_rounds, heLeft = g.he_rounds; const amSaid = {}, ammoCall = t => { if (heLeft <= 50 && heLeft > 0 && g.he_rounds > 50 && !amSaid.h50) { amSaid.h50 = 1; say(t + 1.2, 'GNR', 'HE at fifty rounds.', 'HE’s at fifty!', 'FIFTY ROUNDS OF HE LEFT!'); } if (heLeft <= 0 && !amSaid.h0) { amSaid.h0 = 1; say(t + 1.2, 'GNR', 'HE is out.', 'HE’s out!', 'NO HE! WE’RE OUT!'); if (rec) ev(t + 1.2, 'crew', -1, 'HKOI has fired its last HE round'); } if (obsLeft <= 50 && obsLeft > 0 && g.obscurant_rounds > 50 && !amSaid.o50) { amSaid.o50 = 1; say(t + 1.2, 'GNR', 'Obscurant at fifty rounds.', 'Obscurant’s at fifty!', 'FIFTY ROUNDS OF SMOKE LEFT!'); } };
  for (let j = 0; j < planOrder.length; j++) {
    const c = planOrder[j], th = c.th;
    if (th.state !== 'inbound') continue;
    const sl = slewTime(g, az, el, c.az, c.el);
    let tf = Math.max(c.ready, gunT + sl);
    while (fq.length && fq[0] <= tf) {
      const ft = Math.max(fq.shift(), gunT);
      if (obsLeft >= g.burst) {
        obsLeft -= g.burst; add('wasted_bursts'); add('obs_rounds', g.burst); add('downrange', g.burst);
        if (rec) { ev(ft, 'false', -1, `False cue: ${g.burst} obscurant rounds fired at nothing`); rec.bursts.push({ idx: -1, kind: 'false', tf: ft, az: rec.ctx.hull + ((ft * 37.3) % 120) - 60, rounds: [] }); }
      }
      busyPush([ft, ft + BD]); gunT = ft + BD; tf = Math.max(tf, gunT + sl);
    }
    if (tf < c.ideal) {
      let tw = c.ideal;
      if (j + 1 < planOrder.length) {
        const nx = planOrder[j + 1], nsl = slewTime(g, c.az, c.el, nx.az, nx.el);
        if (tw + BD + nsl > nx.latest) tw = Math.max(tf, Math.min(c.ideal, nx.latest - nsl - 0.1 - (g.burst - 1) * 60 / g.rof_rpm));
      }
      tf = tw;
    }
    for (const w of (cfg.player && cfg.player.hold) || []) if (tf >= w[0] && tf < (w[1] == null ? 1e9 : w[1])) tf = w[1] == null ? 1e9 : w[1];
    if (tf >= dmT('hkoi')) { if (!th.tags.includes('hkoi_down')) th.tags.push('hkoi_down'); if (rec) ev(dmT('hkoi'), 'miss', th.idx, `HKOI was knocked out before it could fire at ${lbl(th)}`); continue; }
    if (tf > c.latest) { if (tf >= 1e9 || ((cfg.player && cfg.player.hold) || []).some(w => c.latest >= w[0] && c.latest < (w[1] == null ? 1e9 : w[1]))) { th.tags.push('held'); if (rec) ev(c.latest, 'miss', th.idx, `Weapons hold: commander keeps HKOI from engaging ${lbl(th)}`); continue; }
      th.tags.push('gun_busy'); if (rec) ev(c.latest, 'miss', th.idx, `Gun busy: no time left to engage ${lbl(th)}`); continue; }
    if (c.kind === 'obs' && obsLeft <= 0) { th.tags.push('no_ammo'); if (rec) ev(tf, 'miss', th.idx, `Out of obscurant rounds for ${lbl(th)}`); continue; }
    if (c.kind === 'he' && heLeft <= 0) { th.tags.push('no_ammo'); if (rec) ev(tf, 'miss', th.idx, `Out of HE rounds for ${lbl(th)}`); continue; }
    crewClock(tf);
    if (trng(th).random() < g.jam_per_burst * (tf >= dmD('hkoi') ? 3 : 1)) {
      th.tags.push('jam'); add('jams');
      if (rec) ev(tf, 'miss', th.idx, `Gun jams while engaging ${lbl(th)} (${g.jam_clear_s} s to clear)`); say(tf + 0.2, 'GNR', 'Gun’s jammed. Clearing.', 'Jam! Clearing it!', 'IT’S JAMMED! IT’S JAMMED!'); say(tf + g.jam_clear_s, 'GNR', 'Gun’s clear.', 'Gun’s clear!', 'CLEAR! IT’S CLEAR!');
      gunT = tf + g.jam_clear_s; az = c.az; el = c.el; busyPush([tf - sl, gunT]); retry.push({ th, t: gunT, kind: c.kind === 'obs' ? 'obs' : 'he', jam: true }); continue;
    }
    const nr = Math.min(g.burst, c.kind === 'obs' ? obsLeft : heLeft);
    gunT = tf + (nr - 1) * 60 / g.rof_rpm + 0.1; az = c.az; el = c.el;
    th.viz.fired = tf;
    if (c.kind === 'he') {
      busyPush([tf - sl, gunT]);
      heLeft -= nr; ammoCall(tf);
      resolveHE(th, tf, nr, false);
      continue;
    }
    obsLeft -= nr; add('obs_rounds', nr); ammoCall(tf);
    busyPush([tf - sl, gunT]);
    // time the gun can spend holding this cloud before it must turn to the next planned threat
    let slack = 1e9;
    for (let q = j + 1; q < planOrder.length; q++) { const nx = planOrder[q]; if (nx.th.state !== 'inbound') continue; slack = nx.ideal + 0.4 * (nx.latest - nx.ideal) - slewTime(g, c.az, c.el, nx.az, nx.el) - 0.1 - gunT; break; }
    resolveObs(c, th, tf, nr, false, slack);
  }
  // Follow-up bursts: at missiles that steered back onto their beam after the cloud cleared, and at
  // drones or SAL missiles that an HE burst missed. Fits into gaps in the gun's schedule.
  if (cfg.hkoi_enabled && fc.reengage) {
    let guard = 0;
    while (retry.length && guard++ < 40) {
      retry.sort((a, b) => a.t - b.t);
      const { th, t, kind } = retry.shift();
      if (th.state !== 'inbound') continue;
      th.n_bursts = (th.n_bursts || 1) + 1;
      if (th.n_bursts > (THREATS[th.key].guidance === 'drone' ? (fc.max_bursts_drone || 12) : fc.max_bursts)) continue;
      const dMin = kind === 'obs' ? 350 : rd.arm_distance_m + 40;
      const ready = t + g.fc_latency_s + fc.human_approval_s;
      const latest = Math.min(timeAt(th, dMin) - tauOfS(dMin, rd.muzzle_v, ctx.k), timeAt(th, 0) - 0.5);
      const sl = g.settle_s + 0.5;
      let tf = ready;
      busy.sort((a, b) => a[0] - b[0]);
      for (const [a, b] of busy) if (tf + BD > a && tf - sl < b) tf = b + sl;
      if (tf >= dmT('hkoi')) { if (!th.tags.includes('hkoi_down')) th.tags.push('hkoi_down'); continue; }
      if (tf > latest) { th.tags.push('no_time_second'); if (rec) ev(Math.min(ready, th.impact - 0.2), 'miss', th.idx, `No time left for another burst at ${lbl(th)}`); continue; }
      const left = kind === 'obs' ? obsLeft : heLeft;
      if (left <= 0) { if (!th.tags.includes('no_ammo')) th.tags.push('no_ammo'); if (rec) ev(tf, 'miss', th.idx, `Out of ${kind === 'obs' ? 'obscurant' : 'HE'} rounds for another burst at ${lbl(th)}`); continue; }
      crewClock(tf);
      if (trng(th).random() < g.jam_per_burst * (tf >= dmD('hkoi') ? 3 : 1)) { th.tags.push('jam'); add('jams'); busyPush([tf - sl, tf + g.jam_clear_s]); if (rec) ev(tf, 'miss', th.idx, `Gun jams on the follow-up burst at ${lbl(th)}`); th.n_bursts--; retry.push({ th, t: tf + g.jam_clear_s, kind, jam: true }); continue; }
      const nr = Math.min(g.burst, left);
      busyPush([tf - sl, tf + (nr - 1) * 60 / g.rof_rpm + 0.1]);
      add('second_bursts'); if (!th.tags.includes('reengaged')) th.tags.push('reengaged');
      (th.viz.extra = th.viz.extra || []).push(tf);
      if (kind === 'he') { heLeft -= nr; ammoCall(tf); resolveHE(th, tf, nr, true); }
      else { obsLeft -= nr; add('obs_rounds', nr); if (th.viz.fired == null) th.viz.fired = tf; th.viz.fired2 = tf; let sk = 1e9; for (const [a0] of busy) if (a0 > tf) sk = Math.min(sk, a0 - (tf + (nr - 1) * 60 / g.rof_rpm + 0.1) - 0.05); resolveObs({ want: distAt(th, tf), ideal: tf, ready: tf }, th, tf, nr, true, sk); }
    }
  }
  // ---------------------------------------------------------------- settle blind missiles and the crew's moves
  crewPending(Infinity);
  for (const th of threats) {
    const b = th.blind; if (!b) continue;
    const dY = crewOn ? latOf(th, b.tEnd) - latOf(th, b.tCut) : 0;
    const yr = b.y - dY, hit = Math.abs(yr) <= aspectHW(cfg, th) && Math.abs(b.z) <= cfg.vehicle.half_h, miss = Math.hypot(yr, b.z);
    if (hit) {
      th.state = 'inbound'; th.tags.push('drift_hit'); th.drift_hit = true; th.viz.blind = { lat: yr };
      if (!b.partner) { add('sev_hit_sum', b.sever); add('sev_hit_n'); }
      if (rec) ev(b.tCut + 0.3, 'miss', th.idx, b.hit0 ? `${lbl(th)} is blind but still on course for the hull` : `${lbl(th)} is blind, but the vehicle's own move has carried it into the missile's path`);
    } else {
      th.state = 'missed'; th.defeated_by = b.hit0 ? 'hkoi_evade' : (b.partner ? 'hkoi_shared_cloud' : 'hkoi_cut');
      if (!b.partner) { add('sev_miss_sum', b.sever); add('sev_miss_n'); add('miss_m_sum', miss); add('miss_n'); }
      th.viz.end = { t: th.impact, type: 'miss', lat: yr, miss };
      say(th.impact + 0.15, 'CDR', 'It went wide.', `It missed! It went past!`, `It missed\u2014 oh God, it missed\u2014`);
      if (rec) ev(th.impact, 'kill', th.idx, b.hit0 ? `${lbl(th)} flies past blind, missing by ${miss.toFixed(1)} m because the driver moved the vehicle` : `${lbl(th)} flies past blind, missing by ${miss.toFixed(1)} m`);
    }
  }
  if (crewOn && crew.smoke !== null) {
    const up = crew.smoke + CR.smoke_form_s;
    for (const th of threats) {
      if (th.state !== 'inbound' || th.drift_hit || th.impact <= up + 0.2 || th.impact > up + CR.smoke_s) continue;
      const gd = THREATS[th.key].guidance; let lost = false;
      if (gd === 'ir') lost = rng.random() < 0.5;                          // multispectral smoke can break a seeker's lock
      else if (gd === 'unguided' || gd === 'ke') lost = th.t0 > up;                        // cannot be aimed at a vehicle nobody can see
      else if (rng.random() < CR.smoke_eff) { const tA = Math.max(up, th.t0); lost = Math.abs(sideY(th, th.impact) - sideY(th, tA)) > cfg.vehicle.half_w + 1; }
      if (lost) {
        th.state = 'missed'; th.defeated_by = 'crew_smoke';
        (th.viz.phases = th.viz.phases || []).push({ t: Math.max(up, th.t0), mode: 'blind' });
        if (!th.viz.sever) th.viz.sever = { t: Math.max(up, th.t0), d: Math.max(distAt(th, Math.max(up, th.t0)), 1), smoke: true };
        th.viz.end = { t: th.impact, type: 'miss', lat: (th.idx % 2 ? 6 : -6), miss: 5 + (th.idx * 5 % 7) };
        if (rec) ev(th.impact, 'kill', th.idx, `${lbl(th)} is flown at where the vehicle was before the smoke went up, and misses`);
      }
    }
  }
  // leftover false cues before the end of the raid still waste rounds
  // (Python leaves them unfired once the plan is done; kept identical)

  // APS
  const aps = cfg.aps;
  const mag = { L: aps.mag_L != null ? aps.mag_L : aps.mag_per_side, R: aps.mag_R != null ? aps.mag_R : aps.mag_per_side }, last = { L: -1e9, R: -1e9 };
  // battle layer: the vehicle got behind ground or buildings while this missile was still being guided, so it lost its guidance and came down short
  for (const th of threats) if (th.state === 'inbound' && th.masked != null) { const short = Math.max(8, th.masked); th.state = 'missed'; th.defeated_by = th.mask_by || 'terrain_mask'; th.tags.push(th.mask_by || 'terrain_mask'); th.viz.end = { t: th.t0 + Math.max(th.R - short, 1) / th.v, type: 'ground', short, mask: true }; add('by_terrain'); if (rec) ev(th.viz.end.t, 'kill', th.idx, `${lbl(th)} loses its guidance when the vehicle drops out of the gunner's sight, and flies into the ground ${Math.round(short)} m short`); }
  for (const th of threats) if (th.state === 'inbound' && th.will_miss) {
    if (th.jitter_miss) { const jm = th.jit_miss || [3, 0], d = Math.hypot(jm[0], jm[1]); th.state = 'missed'; th.defeated_by = 'gunner_jitter'; th.tags.push('gunner_jitter'); th.viz.end = jm[1] <= -cfg.vehicle.half_h ? { t: th.t0 + Math.max(th.R - 14, 1) / th.v, type: 'ground', short: 14, jit: true } : { t: th.impact, type: 'miss', lat: Math.abs(jm[0]) < 0.6 ? 0 : jm[0], over: +jm[1].toFixed(2), miss: +d.toFixed(1), jit: true };
      if (rec) ev(th.impact, 'kill', th.idx, jm[1] <= -cfg.vehicle.half_h ? `${lbl(th)} flies into the ground short of the vehicle: the enemy gunner's aim dipped` : `${lbl(th)} misses on its own: the enemy gunner's aim wandered ${d.toFixed(1)} m off the vehicle`); continue; }
    th.state = 'missed'; th.defeated_by = th.duel ? 'enemy_gunnery_miss' : 'unguided_miss'; th.viz.end = { t: th.impact, type: 'miss', lat: (th.idx % 2 ? 1 : -1) * (th.duel ? 3 : 5), miss: 4 + (th.idx * 7 % 9) };
    if (rec) ev(th.impact, 'kill', th.idx, th.duel ? 'Enemy tank round cracks past: a miss' : `${lbl(th)} flies wide on its own (unguided)`);
  }
  const inbound = threats.filter(t => t.state === 'inbound').sort((a, b) => a.impact - b.impact);
  add('f_reach_aps', inbound.length);
  for (const th of inbound) {
    // the vehicle's own drone jammer: a radio-controlled drone that loses its link close in usually flies into the ground; fibre-optic drones are immune
    if (cfg.ew && cfg.ew.drone_jammer && th.key === 'fpv' && trng(th).random() < (cfg.ew.jam_p == null ? 0.6 : cfg.ew.jam_p)) { th.state = 'missed'; th.defeated_by = 'jammer'; th.tags.push('link_jammed'); th.viz.end = { t: th.t0 + Math.max(th.R - 25, 1) / th.v, type: 'ground', short: 25 }; add('by_jammer'); if (rec) ev(th.viz.end.t, 'kill', th.idx, `${lbl(th)} loses its radio link to the vehicle's jammer and flies into the ground`); continue; }
    const side = (th.rel_brg > 0 && th.rel_brg < 180) ? 'R' : 'L';
    const sideName = side === 'R' ? 'right' : 'left';
    if (THREATS[th.key].guidance === 'ke') { th.state = 'hit'; th.tags.push('ke_unstoppable'); continue; }   // nothing on the vehicle stops a long-rod penetrator
    if (!aps.enabled) { th.state = 'hit'; continue; }
    if (ctx.aps_inhibited) { th.tags.push('aps_inhibited'); th.state = 'hit'; continue; }
    if (mag[side] <= 0 || th.impact - last[side] < aps.reset_s) {
      th.tags.push(mag[side] <= 0 ? 'aps_empty' : 'aps_reset'); th.state = 'hit';
      if (rec) ev(th.impact - 0.06, 'miss', th.idx, mag[side] <= 0 ? `APS ${sideName} side is empty` : `APS ${sideName} side still resetting`);
      continue;
    }
    mag[side]--; last[side] = th.impact; add('aps_used'); if (mag[side] === 0) { if (side === 'L') say(th.impact + 0.9, 'LDR', 'Trophy left side empty.', 'Left side’s empty!', 'LEFT SIDE’S OUT!'); else say(th.impact + 0.9, 'LDR', 'Trophy right side empty.', 'Right side’s empty!', 'RIGHT SIDE’S OUT!'); if (rec) ev(th.impact + 0.9, 'crew', -1, `Trophy ${sideName} magazine is empty`); }
    // cue = HKOI's fire-control radar track handed to the APS; only exists when HKOI is fitted
    const cued = cfg.hkoi_enabled && th.track !== null;
    const pk = THREATS[th.key].guidance === 'drone' ? aps.pk_drone : (cued ? aps.pk_cued : aps.pk_uncued);
    const kill = trng(th).random() < pk;
    if (kill) { th.state = 'destroyed'; th.defeated_by = 'aps'; th.viz.end = { t: th.impact - 0.05, type: 'aps_kill', d: 12 }; }
    else { th.tags.push('aps_miss'); th.state = 'hit'; }
    th.viz.aps = { t: th.impact - 0.05, kill };
    say(th.impact - 0.02, 'LDR', kill ? 'Trophy, kill.' : 'Trophy fired, no kill!', kill ? 'Trophy got it!' : 'Trophy missed!', kill ? 'TROPHY! TROPHY GOT IT!' : 'IT MISSED! BRACE! BRACE!');
    if (rec) { rec.aps.push({ t: th.impact - 0.05, idx: th.idx, side, kill, brg: th.brg }); ev(th.impact - 0.05, kill ? 'kill' : 'miss', th.idx, `APS ${sideName} fires${cued ? ' (cued by HKOI track)' : ''}: ${kill ? `${lbl(th)} destroyed` : `misses ${lbl(th)}`}`); }
  }

  // damage
  let killed = false, hits = 0;
  for (const th of threats) {
    if (th.state === 'hit') {
      hits++;
      const k = trng(th).random() < (th.duel ? (Math.abs(((th.rel_brg + 180) % 360) - 180) > 50 ? 0.6 : THREATS.ke.kill) : THREATS[th.key].kill);
      if (k) killed = true;
      th.viz.end = { t: th.impact, type: 'hit', killing: k };
      if (k) { say(th.impact + 0.1, 'CDR', 'Fire, fire, fire! Evacuate!', 'FIRE! FIRE! EVACUATE!', 'FIRE! FIRE! GET OUT! GET OUT!'); say(th.impact + 0.7, 'LDR', 'Loader evacuating!', 'Hatch! Get the hatch!', 'I CAN\u2019T\u2014 THE HATCH\u2014'); }
      else { say(th.impact + 0.1, 'CDR', 'We’re hit. Crew report.', 'We’re hit! Crew report!', 'WE’RE HIT! IS EVERYONE OKAY?!'); say(th.impact + 1.0, 'GNR', 'Gunner up.', 'Gunner up!', 'I’m okay— gunner up!'); say(th.impact + 1.7, 'LDR', 'Loader up.', 'Loader up!', 'Loader— I’m up, I’m up!'); say(th.impact + 2.4, 'DRV', 'Driver up. Engine’s good.', 'Driver up! Still running!', 'Driver up— still running— I think!'); }
      if (rec) ev(th.impact, 'hit', th.idx, `${lbl(th)} HITS the vehicle${k ? ' — vehicle destroyed' : ' — vehicle damaged, still in the fight'}`);
    }
    if (!th.viz.end) th.viz.end = { t: th.impact, type: 'miss', lat: 6 };
  }
  m.hits = hits; m.killed = killed ? 1 : 0; m.all_defeated = hits === 0 ? 1 : 0;
  const cueList = threats.filter(t => t.cue !== null).map(t => t.cue);
  let on = 0;
  if (cfg.radar.mode === 'continuous') on = dur + 60;
  else if (cueList.length) on = Math.max(...threats.map(t => t.impact)) - Math.min(...cueList);
  m.radar_on_s = on;
  m.p_geolocated = 1 - Math.exp(-on / cfg.radar.sigint_time_const_s);
  if (rec) { const u = mulberry32(((cfg.seed || 1) * 7919 + threats.length * 31) >>> 0), u1 = u(), u2 = u(); rec.geo = { on_s: +on.toFixed(1), p: +m.p_geolocated.toFixed(3), located: u1 < m.p_geolocated, eta_s: Math.round(120 + 120 * u2) }; }
  for (const th of threats) {
    add('by_' + (th.defeated_by || (th.state === 'hit' ? 'hit' : 'other')));
    for (const tg of new Set(th.tags)) add('tag_' + tg);
    add('type_' + th.key);
    if (th.state === 'hit') add('hit_' + th.key);
    // kill-chain funnel
    if (th.cue !== null || th.track !== null) add('f_detected');
    if (th.track !== null) add('f_tracked');
    if (th.viz.fired != null) add('f_engaged');
    if (th.viz.fired != null && OBS_G[THREATS[th.key].guidance]) add('f_engaged_obs');
    if (th.viz.sever && !th.viz.sever.smoke) add('f_cut');
    if (th.viz.sever && !th.viz.sever.smoke && th.viz.fired != null && !th.tags.includes('cut_by_leader_cloud')) add('f_cut_direct');
    if (th.defeated_by === 'hkoi_cut' || th.defeated_by === 'hkoi_shared_cloud' || th.defeated_by === 'self_destruct' || th.defeated_by === 'hkoi_he' || th.defeated_by === 'hkoi_evade') add('f_hkoi_stop');
    if (th.defeated_by === 'aps') add('f_aps_stop');
    if (th.state === 'hit') { add('f_hit'); add('leakH_' + leakHKOI(cfg, th)); add('leakA_' + leakAPS(cfg, th)); }
  }
  if (crewOn) {
    // stress over the raid, from what the crew sees and hears; used for the display and the summary
    const E = [], k = XP.k, tr = 0.4 + 0.6 * CR.trust;
    for (const th of threats) {
      const kn = knownT(th), e = th.viz.end;
      if (kn < th.impact) E.push([Math.max(kn, 0), 14 * k]);
      const tc = timeAt(th, 800); if (kn < tc && tc > th.t0 && tc < e.t && modeAt(th, tc) === 'guided') E.push([tc, 16 * k]);
      for (const p of th.viz.phases || []) E.push([p.t, p.mode === 'blind' ? -16 * tr : 18 * k]);
      if (th.viz.fail_t != null) E.push([th.viz.fail_t, 10 * k]);
      if (th.viz.aps) E.push([th.viz.aps.t, 12 * k]);
      if (e.type === 'hit') E.push([e.t, 45 * k]); else if (kn < e.t) E.push([e.t, -14]);
    }
    if (ctx.duel) { const du = ctx.duel; E.push([du.spot, 16 * k]); for (const q of du.shots) E.push([q.t, 4 * k]); for (const e of du.enemy) E.push([e.t + du.R / 1700, (e.miss ? 12 : 0) * k]); if (du.deadT !== null) E.push([du.deadT, -22]); }
    for (const a of crew.acts) E.push([a.t, a.kind === 'smoke' ? 6 : a.stall ? 12 : a.why === 'drill' ? 2 : 8]);
    for (const th of threats) { const e = th.viz.end; if (e.type === 'miss' && e.miss != null && e.miss < 15 && knownT(th) < e.t) E.push([e.t, (15 - e.miss) * 1.2 * k]); }
    { let inb = []; for (const th of threats) if (knownT(th) < th.impact) inb.push([Math.max(th.impact - 5, knownT(th)), th.viz.end.t]); for (const [a] of inb) { const n2 = inb.filter(([a2, b2]) => a2 <= a && b2 > a).length; if (n2 >= 2) E.push([a, 7 * (n2 - 1) * k]); } }
    E.sort((a, b) => a[0] - b[0]);
    let s = S0, tl = 0, peak = S0; const line = [{ t: 0, s: S0 }];
    for (const [t, d] of E) { s = S0 + (s - S0) * Math.exp(-Math.max(t - tl, 0) / 6); s = Math.max(0, Math.min(100, s + d)); line.push({ t, s }); tl = t; if (s > peak) peak = s; }
    m.crew_peak = peak; add('crew_' + crewState(peak).toLowerCase());
    const lines = {}, taus = {}; for (const r of ['cdr', 'gnr', 'ldr', 'drv']) { const g = rg(r), TAU = 6 / rr(r); let s2 = S0, t2 = 0; const L2 = [{ t: 0, s: S0 }]; for (const [t, d] of E) { s2 = S0 + (s2 - S0) * Math.exp(-Math.max(t - t2, 0) / TAU); s2 = Math.max(0, Math.min(100, s2 + (d > 0 ? d * g : d))); L2.push({ t, s: s2 }); t2 = t; } lines[r] = L2; taus[r] = TAU; }
    crew.lines = lines; crew.taus = taus;
    m.crew_evade = crew.evade !== null ? 1 : 0; m.crew_smoke = crew.smoke !== null ? 1 : 0; m.crew_blind_s = crew.smoke !== null ? CR.smoke_s : 0; m.crew_steady = crew.acts.length ? 0 : 1;
    // after the last threat: the crew report, and the order to move if the radar has been transmitting long enough to be found
    if (rec && !killed && threats.some(o => knownT(o) < o.impact)) { const tA = Math.max(...threats.map(o => o.viz.end ? o.viz.end.t : o.impact), ctx.duel && ctx.duel.deadT || 0) + 2.2;
      say(tA, 'CDR', 'All stations, report.', 'Everyone okay? Report!', 'Everyone okay? Report!'); say(tA + 1.5, 'GNR', 'Gunner’s good.', 'Gunner’s good. Still shaking.', 'Gunner’s good. Still shaking.'); say(tA + 2.7, 'LDR', 'Loader’s good.'); say(tA + 3.6, 'DRV', 'Driver’s good.', 'Driver’s good. Engine’s good.', 'Driver’s good. Engine’s good.');
      if (cfg.hkoi_enabled && m.p_geolocated > 0.5) say(tA + 5.2, 'CDR', 'Radar’s been up too long. Driver, find us a new position.', 'They’ve got our radar. Driver, move us. Now.', 'They’ve got our radar. Driver, move us. Now.'); else say(tA + 5.2, 'CDR', 'Good work. Stay sharp.', 'That was close. Stay on it.', 'That was close. Stay on it.');
      ev(tA, 'crew', -1, 'Engagement over: the commander calls for a crew report'); ev(tA + 8, 'crew', -1, 'Crew report complete'); }
    if (ctx.duel) { const du = ctx.duel, kT0 = Math.min(1e9, ...threats.filter(o => o.viz.end && o.viz.end.type === 'hit' && o.viz.end.killing).map(o => o.viz.end.t));
      du.shots = du.shots.filter(q => q.t < kT0); if (du.deadT !== null && !du.shots.some(q => q.kill)) du.deadT = null;
      m.duel_won = du.deadT !== null ? 1 : 0; m.duel_shots = du.shots.length; m.duel_enemy_shots = du.enemy.length; m.duel_enemy_hits = threats.filter(o => o.duel && o.state === 'hit').length;
      if (rec) { ev(du.t0, 'crew', -1, `Enemy tank appears at ${(du.R / 1000).toFixed(1)} km`); ev(du.spot, 'crew', -1, 'Commander spots the enemy tank and orders the gunner onto it; the main turret is no longer free to help HKOI');
        say(du.spot - 0.2, 'CDR', 'Tank, front.', 'Tank! Front!', 'TANK FRONT! TANK FRONT!'); say(du.spot + 0.9, 'CDR', 'Gunner, sabot, tank.', 'Gunner! Sabot! Tank!', 'TANK! TANK! SHOOT IT!'); say(du.spot + 2.0, 'LDR', 'Up.', 'Up!', 'UP! UP!');
        du.shots.forEach((q, i) => { say(q.t - (i ? 1.6 : 1.4), 'GNR', 'Identified.', 'Identified!', 'I GOT HIM! IDENTIFIED!'); if (i) { say(q.t - 3.1, 'LDR', 'Sabot loaded.', 'Sabot loaded!', 'SABOT’S IN!'); say(q.t - 2.2, 'LDR', 'Up.', 'Up!', 'UP! UP!'); } say(q.t - 0.5, 'CDR', 'Fire.', 'Fire!', 'FIRE! FIRE!'); say(q.t, 'GNR', 'On the way.');
          const tof = du.R / 1650; ev(q.t, 'fire', -1, `Main gun fires at the enemy tank (${Math.round(q.p * 100)}% chance${q.load ? `, crew also tracking ${q.load} inbound` : ''})`);
          if (q.kill) { say(q.t + tof + 0.5, 'CDR', 'Target. Cease fire.', 'Target! Cease fire!', 'TARGET! HE\u2019S BURNING!'); ev(q.t + tof, 'kill', -1, 'Enemy tank destroyed'); }
          else if (q.hit) { say(q.t + tof + 0.5, 'CDR', 'Target. Re-engage.', 'Target! Re-engage!', 'HIT HIM AGAIN!'); ev(q.t + tof, 'miss', -1, 'Hit on the enemy tank, but it is still fighting'); }
          else { say(q.t + tof + 0.5, 'CDR', 'Miss. Re-engage.', 'Miss! Re-engage!', 'MISSED! AGAIN! AGAIN!'); ev(q.t + tof, 'miss', -1, 'Main gun round misses the enemy tank'); } });
        for (const e of du.enemy) ev(e.t, 'crew', e.idx, 'Enemy tank fires');
        rec.duel = du; } }
    if (rec) { if (crew.evade !== null && !path) buildPath(); const kT = Math.min(1e9, ...threats.filter(o => o.viz.end && o.viz.end.type === 'hit' && o.viz.end.killing).map(o => o.viz.end.t)); rec.radio = radio.filter(r => r.t <= kT + 1.2).map(r => { const sv = crewStress({ line }, r.t); return { t: r.t, who: r.who, lvl: sv >= 80 ? 2 : sv >= 55 ? 1 : 0, text: r.txt[sv >= 80 ? 2 : sv >= 55 ? 1 : 0] }; }).sort((a, b) => a.t - b.t); }
    if (rec) rec.crew = { base: S0, lines: crew.lines, taus: crew.taus, tasks: cdrTasks.slice().sort((a, b) => a.t0 - b.t0), path: path ? path.filter((p, i) => i % 2 === 0).map(p => [+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(2), +p[3].toFixed(1), +p[4].toFixed(2)]) : [], line, evade: crew.evade, dir: crew.dir, smoke: crew.smoke, accel: CR.accel, vmax: CR.evade_speed, form: CR.smoke_form_s, dur: CR.smoke_s, acts: crew.acts, peak, hull: ctx.hull };
  }
  if (rec) {
    rec.threats = threats; rec.metrics = m; rec.killed = killed; rec.hits = hits;
    rec.ctx = Object.assign(rec.ctx || {}, { radar_on: ctx.radar_on_t, k: ctx.k, wind_along: ctx.wind, K: ctx.K, hull: ctx.hull, wind: ctx.wind, wind_dir: ctx.wind_dir, speed: ctx.speed, aps_inhibited: ctx.aps_inhibited, dismounts: ctx.dismounts, eo_ok: ctx.eo_ok });
    // a knocked-out vehicle does nothing more: the crew is bailing out or dead, so from the killing hit on it does not fire, launch or move
    if (killed) { const kT = Math.min(...threats.filter(o => o.viz.end && o.viz.end.type === 'hit' && o.viz.end.killing).map(o => o.viz.end.t)); rec.kill_t = kT;
      rec.bursts = rec.bursts.filter(b => b.tf <= kT); for (const b of rec.bursts) if (b.rounds) b.rounds = b.rounds.filter(r => r.t_fire <= kT);
      rec.aps = rec.aps.filter(q => q.t <= kT + 0.01); if (rec.duel) rec.duel.shots = rec.duel.shots.filter(q => q.t <= kT);
      if (rec.crew && rec.crew.path) { let last = null; for (const p of rec.crew.path) { if (p[0] <= kT) last = p; else if (last) { p[1] = last[1]; p[2] = last[2]; p[3] = last[3]; p[4] = 0; } } }
      rec.events = rec.events.filter(e => e.t <= kT + 0.05 || e.kind === 'launch' || e.kind === 'hit' || (e.idx >= 0 && threats[e.idx] && threats[e.idx].t0 <= kT && /HITS|flies past|ground|misses/i.test(e.text))); }
    rec.events.sort((a, b) => a.t - b.t);
    const tEnd = Math.max(...threats.map(t => t.impact), ...rec.events.map(x => x.t)) + 0.3;
    rec.events.push({ t: tEnd, kind: killed ? 'hit' : 'end', idx: -1, text: killed ? 'Mission result: vehicle destroyed' : (hits ? `Mission result: vehicle survives ${hits} hit${hits > 1 ? 's' : ''}` : 'Mission result: every threat defeated, no hits') });
    rec.t_end = tEnd;
  }
  return m;
}

const FIRE_TAGS = ['drift_hit', 'relock', 'saclos_unaffected', 'cloud_thin', 'false_trigger', 'fuze_miss', 'too_late', 'he_miss'];
const PRE_TAGS = ['hkoi_down', 'radar_down', 'unguided_ignored', 'lwr_miss', 'no_cue_emcon', 'track_too_late', 'radar_saturated', 'no_track', 'dead_zone', 'gun_los', 'min_range', 'no_time', 'elevation_limit', 'handed_to_aps', 'gun_busy', 'no_ammo', 'jam'];
function leakHKOI(cfg, th) {
  if (!cfg.hkoi_enabled) return 'hkoi_off';
  for (const t of FIRE_TAGS) if (th.tags.includes(t)) return t;
  for (const t of th.tags) {
    if (!PRE_TAGS.includes(t)) continue;
    if (th.track !== null && (t === 'lwr_miss' || t === 'no_cue_emcon')) continue;
    return t;
  }
  return 'other';
}
function leakAPS(cfg, th) {
  if (!cfg.aps.enabled) return 'aps_off';
  for (const t of ['aps_inhibited', 'aps_empty', 'aps_reset', 'aps_miss']) if (th.tags.includes(t)) return t;
  return 'other';
}

// crew helpers shared with the display
const CREW_XP = { green: { delay: 1.6, noise: 0.15, k: 1.35 }, trained: { delay: 0.9, noise: 0.08, k: 1 }, veteran: { delay: 0.5, noise: 0.04, k: 0.7 } };
const crewState = s => s >= 80 ? 'PANIC' : s >= 55 ? 'STRESSED' : s >= 30 ? 'ALERT' : 'CALM';
function crewStress(c, t, role) { if (!c) return 10; const b = c.base || 10, L = role && c.lines && c.lines[role] ? c.lines[role] : c.line, TAU = role && c.taus && c.taus[role] ? c.taus[role] : 6; let p = L[0]; for (const q of L) { if (q.t <= t) p = q; else break; } return b + (p.s - b) * Math.exp(-Math.max(t - p.t, 0) / TAU); }
// where the vehicle is (east, north in metres from the start), which way the hull points, and its speed
function crewPos(c, t) {
  if (!c || c.evade === null || !c.path || !c.path.length || t <= c.path[0][0]) return { x: 0, n: 0, h: c ? c.hull : 0, v: 0 };
  const P = c.path; let lo = 0, hi = P.length - 1; if (t >= P[hi][0]) { const p = P[hi]; return { x: p[1], n: p[2], h: p[3], v: p[4] }; }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][0] <= t) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], u = (t - a[0]) / (b[0] - a[0]), dh = ((b[3] - a[3] + 540) % 360) - 180;
  return { x: a[1] + (b[1] - a[1]) * u, n: a[2] + (b[2] - a[2]) * u, h: a[3] + dh * u, v: a[4] + (b[4] - a[4]) * u };
}
function crewDisp(c, t) { const p = crewPos(c, t); if (!c) return 0; const hd = c.hull * Math.PI / 180; return p.x * Math.sin(hd) + p.n * Math.cos(hd); }
const crewSmoke = (c, t) => !!c && c.smoke !== null && t >= c.smoke + c.form && t <= c.smoke + c.form + c.dur;

function replayMission(cfg, lookup, i) {
  const rng = new RNG(seedFor(cfg.seed, i));
  const rec = { events: [], bursts: [], aps: [], ctx: {} };
  // ctx hull is needed for false-cue display before ctx is copied; peek a fresh ctx
  const peek = newCtx(cfg, new RNG(seedFor(cfg.seed, i)));
  rec.ctx.hull = peek.hull;
  runMission(cfg, rng, lookup, rec);
  return rec;
}

function aggregate(list, n) {
  const agg = {};
  for (const m of list) for (const k in m) agg[k] = (agg[k] || 0) + m[k];
  const out = {};
  for (const k in agg) out[k] = agg[k] / n;
  out.P_survive = 1 - (out.killed || 0);
  out.P_no_hits = out.all_defeated || 0;
  out.mean_miss_m = agg.miss_n ? agg.miss_m_sum / agg.miss_n : null;
  return out;
}

// batch run; calls onChunk(done) between chunks. Returns a promise.
function runBatch(cfg, lookup, opts) {
  opts = opts || {};
  const n = cfg.missions, chunk = opts.chunk || 100;
  const sums = {}; const per = { killed: new Uint8Array(n), hits: new Uint8Array(n), leak: new Uint8Array(n), crew: new Uint8Array(n) };
  let i = 0;
  return new Promise(resolve => {
    function step() {
      const end = Math.min(n, i + chunk);
      for (; i < end; i++) {
        const m = runMission(cfg, new RNG(seedFor(cfg.seed, i)), lookup, null);
        for (const k in m) sums[k] = (sums[k] || 0) + m[k];
        per.killed[i] = m.killed; per.hits[i] = m.hits;
        per.crew[i] = m.crew_peak >= 80 ? 3 : m.crew_peak >= 55 ? 2 : m.crew_peak >= 30 ? 1 : 0;
        per.leak[i] = (m.tag_drift_hit || 0) + (m.tag_relock || 0) + (m.tag_cloud_thin || 0) + (m.tag_fuze_miss || 0) > 0 ? 1 : 0;
      }
      if (opts.onChunk) opts.onChunk(i / n);
      if (i < n) (opts.schedule || setTimeout)(step, 0);
      else {
        const out = {}; for (const k in sums) out[k] = sums[k] / n;
        out.P_survive = 1 - (out.killed || 0); out.P_no_hits = out.all_defeated || 0;
        out.mean_miss_m = sums.miss_n ? sums.miss_m_sum / sums.miss_n : null;
        out.per = per; out.n = n;
        resolve(out);
      }
    }
    step();
  });
}

function runSync(cfg, lookup) {
  const list = [];
  for (let i = 0; i < cfg.missions; i++) list.push(runMission(cfg, new RNG(seedFor(cfg.seed, i)), lookup, null));
  return aggregate(list, cfg.missions);
}

// ------------------------------------------------------------------ platoon: shared fire control and smoke interference between tanks
// T = [{ rec, cfg, off: [east, north] }], tank 0 first. Each tank has already fought its own share of the raid.
// 1. Shared fire control: a threat about to hit one tank can be taken by a neighbour whose HKOI gun is free, has HE left and is within reach.
//    Only airburst HE can be shared (drones, and with a low chance other missiles): a cloud laid for one tank's beam does not sit on another's.
// 2. Smoke interference: an obscurant cloud fired by one tank that drifts across a neighbour's line of sight to its own threats blinds that neighbour.
function platoonShare(T, opt) {
  opt = opt || {}; const share = opt.share !== false, reach = opt.reach_m || 600, out = { assists: [], blocked: T.map(() => 0) };
  const killT = r => Math.min(1e9, ...r.threats.filter(o => o.viz.end && o.viz.end.type === 'hit' && o.viz.end.killing).map(o => o.viz.end.t));
  const S = T.map((k, i) => { const g = k.cfg.gun, rof = 60 / g.rof_rpm; let he = 0, ob = 0; const busy = []; for (const b of k.rec.bursts) { const n = (b.rounds || []).length || g.burst; if (b.kind === 'he') he += n; else ob += n; busy.push([b.tf - 0.8, b.tf + n * rof + 0.3]); }
    return { i, he: g.he_rounds - he, obs: g.obscurant_rounds - ob, hull: k.cfg.vehicle.hull_deg || 0, dz: (k.cfg.duel && k.cfg.duel.on) ? [] : (g.dead_zones_deg || []), busy, dead: 1e9, on: !!k.cfg.hkoi_enabled, burst: g.burst, rof, pos: k.off }; });
  const leak = []; T.forEach((k, i) => { for (const th of k.rec.threats) if (th.viz.end && th.viz.end.type === 'hit') leak.push({ i, th }); }); leak.sort((a, b) => a.th.viz.end.t - b.th.viz.end.t);
  for (const { i, th } of leak) { const e = th.viz.end, tt = THREATS[th.key], me = S[i]; if (e.t >= me.dead) continue;
    let saved = false;
    // where the shot comes from, seen from each neighbour: a neighbour can only help if the threat is outside its own masked arc; the one whose sector it is goes first
    const lp = [me.pos[0] + th.R * Math.sin(th.brg * DEG), me.pos[1] + th.R * Math.cos(th.brg * DEG)], relOf = j => mod360(Math.atan2(lp[0] - j.pos[0], lp[1] - j.pos[1]) / DEG - j.hull), off = j => { const r = relOf(j); return Math.min(r, 360 - r); };
    const near = S.filter(j => j.i !== i && j.on && j.dead > e.t - 1.5 && Math.hypot(j.pos[0] - me.pos[0], j.pos[1] - me.pos[1]) <= reach && !j.dz.some(([lo, hi]) => { const r = relOf(j); return lo <= r && r <= hi; })).sort((a, b) => off(a) - off(b));
    // a neighbour puts its own cloud on the beam of a missile aimed at this vehicle (needs the shared track in time)
    if (share && OBS_G[tt.guidance] && opt.lookup && opt.lookup[th.key] && th.cue != null) {
      for (const j of near.filter(q => q.obs >= q.burst)) { const BD = j.burst * j.rof, lo = Math.max(th.cue + 1.0, e.t - 6), hi = e.t - 2.0; let tf = null;
        for (let t = lo; t <= hi; t += 0.25) if (!j.busy.some(w => t - 1.0 < w[1] && t + BD > w[0])) { tf = t; break; }
        if (tf === null) continue;
        const rng = new RNG(seedFor((T[0].cfg.seed || 1) * 37 + i * 11 + j.i, 7000 + th.idx)), pk = pEst(opt.lookup, th.key, opt.lookup[th.key].best_m) * 0.75, kill = rng.random() < pk;
        j.obs -= j.burst; j.busy.push([tf - 1.0, tf + BD + 0.3]); out.assists.push({ from: j.i, to: i, idx: th.idx, tf, kill, key: th.key, kind: 'obs' });
        if (kill) { th.viz.end = { t: th.impact, type: 'miss', lat: (th.idx % 2 ? 6 : -6), miss: 6, by: j.i }; th.state = 'missed'; th.defeated_by = 'neighbour_obs'; th.tags.push('neighbour_assist'); saved = true; }
        break; }
    }
    if (!saved && share && tt.guidance !== 'ke' && tt.guidance !== 'unguided') {
      const cands = near.filter(j => j.he >= j.burst);
      for (const j of cands) { const BD = j.burst * j.rof, lo = Math.max(th.t0 + 1.5, e.t - (tt.guidance === 'drone' ? 8 : 3)), hi = e.t - 1.2; let tf = null;
        for (let t = lo; t <= hi; t += 0.25) if (!j.busy.some(w => t - 1.0 < w[1] && t + BD > w[0])) { tf = t; break; }
        if (tf === null) continue;
        const rng = new RNG(seedFor((T[0].cfg.seed || 1) * 31 + i * 7 + j.i, 5000 + th.idx)), pk = (tt.guidance === 'drone' ? T[j.i].cfg.rnd.he_pk_drone : T[j.i].cfg.rnd.he_pk_missile) * 0.85, kill = rng.random() < pk;
        j.he -= j.burst; j.busy.push([tf - 1.0, tf + BD + 0.3]); out.assists.push({ from: j.i, to: i, idx: th.idx, tf, kill, key: th.key });
        if (kill) { th.viz.end = { t: Math.min(e.t - 0.3, tf + BD + 0.4), type: 'he_kill', by: j.i }; th.state = 'killed'; th.defeated_by = 'neighbour_he'; th.tags.push('neighbour_assist'); saved = true; }
        break; }
    }
    if (!saved && e.killing) me.dead = Math.min(me.dead, e.t);
  }
  T.forEach((k, i) => { const r = k.rec; r.hits = r.threats.filter(o => o.viz.end && o.viz.end.type === 'hit').length; r.killed = killT(r) < 1e9; r.assist_in = out.assists.filter(a => a.to === i); r.assist_out = out.assists.filter(a => a.from === i); });
  // smoke interference
  const W = (off, brg, d, y) => { const a = brg * DEG, s = Math.sin(a), c = Math.cos(a); return [off[0] + d * s + (y || 0) * c, off[1] + d * c - (y || 0) * s]; };
  T.forEach((src, j) => { for (const b of src.rec.bursts) { if (b.kind !== 'obs' || !b.puffs || !b.puffs.length) continue; const th = src.rec.threats[b.idx]; if (!th) continue;
    const p0 = b.puffs[0], c = W(src.off, th.brg, p0.d != null ? p0.d : p0.x, p0.y0 != null ? p0.y0 : 0), ta = (b.t_ref || b.tf) + (p0.tf || 0), n = b.puffs.length, life = Math.min(14, 5 + n * 1.2), rad = 6 + n * 0.8;
    T.forEach((k, i) => { if (i === j) return; const dead = Math.min(1e9, ...k.rec.threats.filter(o => o.viz.end && o.viz.end.type === 'hit' && o.viz.end.killing).map(o => o.viz.end.t)); let blk = 0;
      for (let t = ta; t < ta + life; t += 0.5) { if (t > dead) break; let hit = false;
        for (const o of k.rec.threats) { if (hit) break; if (t < o.t0 || t > o.viz.end.t || THREATS[o.key].guidance === 'ke') continue; const d = Math.max(0, o.R - o.v * (t - o.t0)), q = W(k.off, o.brg, d, 0), ax = k.off[0], ay = k.off[1], vx = q[0] - ax, vy = q[1] - ay, L2 = vx * vx + vy * vy; if (L2 < 2500) continue;
          const u = ((c[0] - ax) * vx + (c[1] - ay) * vy) / L2; if (u < 0.03 || u > 0.97) continue; if (Math.hypot(c[0] - ax - u * vx, c[1] - ay - u * vy) <= rad + (t - ta) * 0.6) hit = true; }
        if (hit) blk += 0.5; }
      if (blk) { out.blocked[i] += blk; (k.rec.nbr_block = k.rec.nbr_block || []).push({ from: j, t: ta, s: blk }); } }); } });
  T.forEach((k, i) => { k.rec.nbr_block_s = out.blocked[i]; });
  return out;
}

const API = { platoonShare, crewPos, crewState, crewStress, crewDisp, crewSmoke, THREATS, TERRAIN, WEATHER, defaultConfig, RNG, seedFor, meetLookup, lookupKey, pEst, runMission, replayMission, runBatch, runSync,
  distAt, timeAt, tauOfS, sOfTau, solveMeet, puffTau, tauAt, densityRatio, LOOKUP_GRID, columnTau, PH };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.HK = API;
})(typeof window !== 'undefined' ? window : globalThis);
