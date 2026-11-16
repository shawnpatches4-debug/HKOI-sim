// "How HKOI aims": the record of one real engagement, read for the briefing, and the diagrams drawn from it (src/app/tour.js shows
// them beside the 3D replay). Shawn, 15 Nov 2026: "I want a specific page that shows how its targeting is done ... how it gets a LWS
// warning and then the radar ... helps pinpoint a firing corridor and plans the most optimal shot". 16 Nov, after seeing 1.1: "start
// the briefing and aiming explanations from scratch ... they dont really do a good job at explaining". This is that second start.
//
// EVERYTHING here is read from one real engagement in the battle record (what HK.runMission in src/engine.js writes per threat:
// warning time and source, radar pick-up and track, the fire control's planned meeting distance, every round's firing time, meeting
// distance and fate, every obscurant puff, the optical depth on the guidance line, the cut, the blind flight and its end), from the
// fire control's own planning table (battle.lookup) or from the battle's engine settings. Nothing is typed in. Where Shawn's
// description goes beyond what the engine models, the briefing says so:
//   - the laser warner's bearing error (8 degrees) is a setting the engine does not use: the radar is sent straight down the warning
//     bearing and finds the missile 0.15 s later. There is no separate "firing corridor" object.
//   - "an AI to tell threats from clutter" is modelled only as the fire control's AI switch (faster track, smaller track error, fewer
//     shots at false warnings). No classifier exists in the code.
// This file uses no page: the finders and the diagram builders (which return SVG markup as a string) run in node too, so
// `node tests/app/targeting.test.mjs` fights the same battles and checks every number against the record.
//
// Frame rate: a diagram is a function of battle time only; the briefing redraws it when that time changes.

const S = (biome, map, force, skill, waves, seed) => ({ biome, map, force, skill, waves, seed });
// One battle for the whole engagement story, found by tests/app/brief_search.mjs on 16 Nov 2026 (after the 1.1 engine: Kornet spin,
// honest table, smart scheduler) on open desert so that every shot has a clear view: at 0:29 a lone Kornet from 2.93 km, warned by
// the laser warner, cut by HKOI's cloud, falls 170 m short; at 0:05 a volley of four (two Konkurs, a Kornet, an RPG) that HKOI and
// Trophy share. ORDER_SETUP is the same battle.
export const AIM_SETUP = S('desert', 3, 'ambush', 'trained', 1, 6), ORDER_SETUP = AIM_SETUP;

const NAME = { kornet: 'Kornet', vikhr: 'Vikhr', saclos: 'Konkurs', sal: 'laser-homing missile', fpv: 'FPV drone', fpv_fiber: 'fibre-optic FPV drone', rpg: 'RPG', ir: 'infrared missile', ke: 'tank round' };
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'], word = n => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n)), Word = n => { const w = word(n); return w.charAt(0).toUpperCase() + w.slice(1); };
const r0 = x => Math.round(x), r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const f1 = x => r1(x).toFixed(1), f2 = x => r2(x).toFixed(2), km2 = m => (m / 1000).toFixed(2) + ' km', m0 = m => r0(m).toLocaleString('en-GB') + ' m';
const mod360 = a => ((a % 360) + 360) % 360;
// the engine's own round flight (HKOI_SPEC 3.2): distance after time t, time to a distance
const sOf = (t, v0, k) => Math.log1p(k * v0 * t) / k, tOf = (s, v0, k) => Math.expm1(k * s) / (k * v0);
const distAt = (th, t) => th.R - th.v * (t - th.t0);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const evText = e => (typeof e.text === 'string' ? e.text : '');

// ---- reading the record ----------------------------------------------------------------------------------------------------------
function cfgOf(B, v) { return (v && v.cfg) || B.cfg0 || {}; }
// one engagement: a beam-rider cut by HKOI's first obscurant burst, nothing else in the air, warned by the laser warner
function aimOk(v, th, strict) {
  if (th.key !== 'kornet' || th.defeated_by !== 'hkoi_cut' || !th.viz.sever || th.R < 2000 || th.R > 4000) return false;
  const T = v.rec.threats; if (T.some(o => o !== th && o.t0 < th.impact + 0.5 && o.impact > th.t0 - 0.5)) return false;
  const bs = v.rec.bursts.filter(b => b.idx === th.idx); if (!bs.length || bs[0].kind !== 'obs' || !bs[0].res || !bs[0].res.cut) return false;
  return !strict || (th.cue_src === 'lwr' && th.acq_src === 'cued' && !(th.tags || []).includes('unmasked') && bs[0].res.outcome === 'drift_miss');
}
export function findAim(B, HK) {
  let hit = null; for (const strict of [true, false]) { for (const v of B.volleys) { for (const th of v.rec.threats) if (aimOk(v, th, strict)) { hit = { v, th }; break; } if (hit) break; } if (hit) break; }
  if (!hit) return null;
  const { v, th } = hit, rec = v.rec, c = cfgOf(B, v), b = rec.bursts.find(q => q.idx === th.idx && q.kind === 'obs'), res = b.res, T0 = v.t0;
  const g = c.gun || {}, rd = c.rnd || {}, fc = c.fc || {}, lwr = c.lwr || {}, rad = c.radar || {}, ob = c.obs || {}, k = rec.ctx.k, v0 = rd.muzzle_v;
  const cand = (rec.cands || []).find(q => q.idx === th.idx) || {};
  const R = b.rounds.map((r, i) => ({ i, tFire: r.t_fire, tPass: r.t_pass, tBurst: r.t_burst != null ? r.t_burst : r.fate === 'downrange' ? null : r.t_pass, d: r.d, v0: r.v0, fate: r.fate, bx: r.bx, by: r.by, bz: r.bz, extra: !!r.extra, lead: r.lead }));
  const P = b.puffs.map(p => ({ ta: b.t_ref + p.tf, x: p.x, y: p.y, z: p.z, m: p.m, s0: p.s0, wa: p.wa }));
  const want = cand.want, tof = tOf(want, v0, k), ready = th.track + (g.fc_latency_s || 0) + (fc.human_approval_s || 0);
  const ideal = th.t0 + (th.R - want) / th.v - tof, tF = b.rounds[0].t_fire;
  const tauAt = t => { let best = null; for (const q of b.tau_s) if (q[0] <= t + 1e-6) best = q; return best ? best[1] : 0; };
  const tr = (th.viz.trajs && th.viz.trajs[0]) || { pts: b.rounds.length ? [] : [], frame: null };
  const end = th.viz.end, nb = R.filter(r => r.fate === 'bloom').length, nc = R.filter(r => r.fate === 'colocated' || r.fate === 'sustain').length, nd = R.filter(r => r.fate === 'downrange').length;
  const D = {
    id: { v: v.i, idx: th.idx, uid: th.uid, brg: th.brg, R: th.R, key: th.key }, T0, key: th.key, name: NAME[th.key] || th.key,
    R: th.R, brg: mod360(th.brg), speed: th.v, impact: th.impact, flight: th.impact - th.t0, tL: th.t0,
    warn: { t: th.cue, dt: th.cue - th.t0, d: th.cue_d, src: th.cue_src, sigma: lwr.bearing_sigma_deg, latency: lwr.latency_s, half: lwr.beam_rider_range_km_half, fa: lwr.false_alarm_per_min },
    radar: { mode: rad.mode, on: rec.ctx.radar_on, tAcq: th.acq, src: th.acq_src, tTrack: th.track, dTrack: distAt(th, th.track), init: fc.ai ? fc.ai_init_s : rad.track_init_s, search: rad.search_s, ref: rad.acq_range_ref_m, rcsRef: rad.rcs_ref_m2, tracks: rad.max_tracks, tti: th.impact - th.track, closing: th.v, ai: !!fc.ai, faAi: fc.false_track_fire_p_ai, fa: fc.false_track_fire_p },
    plan: { want, p: cand.p, tof, dFireIdeal: want + th.v * tof, ready, ideal, tF, dFire: distAt(th, tF), wait: Math.max(0, tF - ready), meet: b.rounds[0].d, tofAct: b.rounds[0].t_pass - b.rounds[0].t_fire, lead: b.rounds[0].lead, v0, k, latency: g.fc_latency_s, gap: 60 / g.rof_rpm, burst: g.burst, sustainMax: fc.sustain_max, mode: fc.meet_mode },
    rounds: R, n: R.length, nFirst: R.filter(r => !r.extra).length, nExtra: R.filter(r => r.extra).length, nBloom: nb, nCo: nc, nDown: nd, tLastPass: R.length ? R[R.length - 1].tPass : tF,
    puffs: P, K: b.phys.K, wash: b.phys.wash, wc: b.wind_cross || 0, alpha: ob.alpha_m2_per_g, form: ob.form_s, payload: P.length ? P[0].m : rd.payload_g, s0: P.length ? P[0].s0 : ob.sigma0_m,
    tauS: b.tau_s, need: b.tau_need, tFirstPuff: P.length ? Math.min(...P.map(p => p.ta)) : null,
    cut: { t: res.t_cut, d: res.sever, tau: tauAt(res.t_cut), dt: res.t_cut - th.t0 },
    end: { type: end.type, t: end.t, miss: res.miss_m, short: res.short, outcome: res.outcome, gone: end.t - res.t_cut },
    traj: tr.pts, frame: tr.frame || { R: th.R, LH: 1.2, hh: 0.6, los_off: 2.5 },
    events: rec.events.filter(e => e.idx === th.idx).map(e => ({ t: e.t, kind: e.kind, text: evText(e) })),
  };
  D.marks = [['Launch', D.tL], ['Warning', D.warn.t], ['Track', D.radar.tTrack], ['Fire', D.plan.tF], ['First burst', D.tFirstPuff], ['Cut', D.cut.t], ['Passes', D.end.t]];
  return D;
}

// the volley with most threats in which HKOI cut one, and Trophy took at least one (a hand-off): how the fire control shares one gun
export function findOrder(B, HK) {
  let best = null;
  for (const v of B.volleys) { const T = v.rec.threats; if (T.length < 3) continue;
    const cut = T.some(o => o.defeated_by === 'hkoi_cut'), aps = T.some(o => o.defeated_by === 'aps'); if (!cut || !aps) continue;
    if (!best || T.length > best.rec.threats.length) best = v; }
  if (!best) return null;
  const v = best, rec = v.rec, c = cfgOf(B, v), TH = (HK && HK.THREATS) || {};
  const bursts = rec.bursts.filter(b => b.idx >= 0 && b.rounds && b.rounds.length).slice().sort((a, b) => a.tf - b.tf);
  const rows = rec.threats.slice().sort((a, b) => a.t0 - b.t0).map(th => {
    const bs = bursts.filter(b => b.idx === th.idx), aps = (rec.aps || []).filter(q => q.idx === th.idx), tags = th.tags || [];
    const end = th.viz.end || {}, order = bs.length ? bursts.indexOf(bs[0]) + 1 : null;
    const why = th.defeated_by === 'hkoi_cut' ? 'cut' : th.defeated_by === 'hkoi_he' ? 'he' : tags.includes('unguided_ignored') ? 'unguided' : tags.includes('handed_to_aps') ? 'handed'
      : th.skip ? th.skip.why : tags.includes('cloud_thin') ? 'thin' : bs.length ? 'fired' : 'none';
    const res = bs.length ? bs[bs.length - 1].res : null;
    return { idx: th.idx, uid: th.uid, key: th.key, name: NAME[th.key] || th.key, label: `${NAME[th.key] || th.key} #${th.idx + 1}`, R: th.R, brg: mod360(th.brg), speed: th.v, t0: th.t0, impact: th.impact, flight: th.impact - th.t0,
      cue: th.cue, cueSrc: th.cue_src, track: th.track, acqSrc: th.acq_src, guidance: TH[th.key] ? TH[th.key].guidance : null,
      bursts: bs.map(b => ({ tf: b.tf, t1: b.rounds[b.rounds.length - 1].t_pass, n: b.rounds.length, meet: b.rounds[0].d, cut: !!(b.res && b.res.cut), reason: b.res ? b.res.reason : null })), order,
      aps: aps.map(q => ({ t: q.t, side: q.side, kill: q.kill })), by: th.defeated_by || null, why, endT: end.t != null ? end.t : th.impact, endType: end.type || null, cutT: th.viz.sever ? th.viz.sever.t : null, miss: res && res.miss_m != null ? res.miss_m : null,
      events: rec.events.filter(e => e.idx === th.idx).map(e => ({ t: e.t, kind: e.kind, text: evText(e) })) };
  });
  const gunOrder = []; for (const b of bursts) { const r = rows.find(q => q.idx === b.idx); if (r && !gunOrder.includes(r)) gunOrder.push(r); }
  const t0s = rows.map(r => r.t0), aps0 = (c.aps || {}).mag_per_side;
  return { id: { v: v.i, idx: gunOrder.length ? gunOrder[0].idx : rows[0].idx, uid: gunOrder.length ? gunOrder[0].uid : rows[0].uid, brg: gunOrder.length ? gunOrder[0].brg : rows[0].brg, R: 0 }, T0: v.t0, rows, gunOrder,
    n: rows.length, spread: Math.max(...t0s) - Math.min(...t0s), tracked: rows.filter(r => r.track != null).length, lastTrack: Math.max(...rows.filter(r => r.track != null).map(r => r.track)),
    apsUsed: (rec.aps || []).length, aps0, tEnd: Math.max(...rows.map(r => r.endT)), ai: !!(c.fc || {}).ai };
}

// the defence in layers, from the battle's own settings (the "one minute" overview)
export function layerFacts(B, HK) {
  const c = cfgOf(B, B.volleys[0]), rd = c.rnd || {}, aps = c.aps || {}, rad = c.radar || {}, lwr = c.lwr || {}, look = B.lookup || {}, TH = (HK && HK.THREATS) || {};
  const kb = look.kornet || null;
  return { radarRef: rad.acq_range_ref_m, rcsRef: rad.rcs_ref_m2, radarMode: rad.mode, tracks: rad.max_tracks, lwrHalf: lwr.beam_rider_range_km_half, lwrSigma: lwr.bearing_sigma_deg,
    obsMin: kb ? kb.grid[0] : null, obsMax: kb ? kb.grid[kb.grid.length - 1] : 2500, kornetBest: kb ? kb.best_m : null, payload: rd.payload_g, saclos: (c.obs || {}).saclos_effect,
    heDrone: rd.he_meet_drone_m || 800, heMissile: rd.he_meet_missile_m || 700,   /* the engine's own fall-backs when the setting is absent (runMission) */
    hePk: rd.he_pk_drone, apsR: aps.radar_range_m, aps0: aps.mag_per_side, apsPk: aps.pk_cued, apsDrone: aps.pk_drone,
    keSpeed: TH.ke ? TH.ke.speed : null, rpgSpeed: TH.rpg ? TH.rpg.speed : null,
    obs0: (c.gun || {}).obscurant_rounds, he0: (c.gun || {}).he_rounds, rof: (c.gun || {}).rof_rpm, burst: (c.gun || {}).burst, apsReset: aps.reset_s, warnSigma: lwr.bearing_sigma_deg, ai: !!(c.fc || {}).ai, scheduler: (c.fc || {}).scheduler || 'classic', table: (c.fc || {}).table || 'trial' };
}

// the enemy commander's picture at a moment: where he believes the vehicle is, how sure, how old the report is (battle.commanderAt)
export function cdrFacts(B, t) {
  const C = B.commanderAt ? B.commanderAt(t) : null; if (!C || !C.picture || C.e == null) return null;
  return { t, e: C.e, n: C.n, alive: C.alive, pe: C.picture.e, pn: C.picture.n, r: C.picture.r_m, age: C.picture.age, src: C.picture.src, seen: C.picture.t,
    withUid: C.with && C.with.uid != null ? C.with.uid : null };
}

// the fire control's own planning table for one kind of missile (battle.lookup, built by HK.meetLookup from the engine's trials):
// for each meeting distance, the share of trials in which the cloud cut the missile, and the rounds it took
export function tableFacts(B, key) {
  const L = (B.lookup || {})[key]; if (!L) return null; const c = cfgOf(B, B.volleys[0]), fc = c.fc || {};
  return { key, name: NAME[key] || key, grid: L.grid.slice(), p: L.p.slice(), rounds: L.rounds ? L.rounds.slice() : null, best: L.best_m, bestP: L.best_p, honest: fc.table === 'honest', wander: fc.table_wander_mrad || null };
}

// ---- drawing (SVG markup as text). Sized for the briefing's side panel: 360 units wide, letters 13 to 16 units, so that on a
// 960-pixel window (panel about 320 px) the smallest letters are still 11 px. ---------------------------------------------------------
const C = { good: '#39d98a', bad: '#ff6b5e', warn: '#ffb347', dim: '#93a79e', line: 'rgba(255,255,255,.16)', text: '#eef5f0', hk: '#6fd3ff', blind: '#b8c4cc', bg: '#0a1310', ground: '#3b4a42' };
const T = (x, y, s, o) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"${o || ''}>${esc(s)}</text>`;
const LN = (x1, y1, x2, y2, st, o) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${st}"${o || ''}/>`;
const CI = (x, y, r, o) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(0.1, r).toFixed(1)}"${o || ''}/>`;
const RC = (x, y, w, h, o) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"${o || ''}/>`;
const STYLE = `<style>text{font:14px ui-sans-serif,system-ui,sans-serif;fill:${C.text}} .h{font:700 11.5px ui-monospace,monospace;letter-spacing:.06em;fill:${C.dim}} .s{font-size:12.5px;fill:#c3d2ca} .n{font:700 14px ui-monospace,monospace} .b{font-weight:700} .big{font:700 17px ui-sans-serif,system-ui,sans-serif} .g{fill:${C.good}} .r{fill:${C.bad}} .w{fill:${C.warn}} .k{fill:${C.hk}} .d{fill:${C.dim}} .e{text-anchor:end} .m{text-anchor:middle}</style>`;
const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMin meet">${STYLE}${RC(0, 0, w, h, ` rx="10" fill="${C.bg}"`)}${body}</svg>`;
const tankSide = (x, y, s, col) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s})" fill="${col || C.good}"><rect x="-9" y="-5" width="18" height="5" rx="2"/><rect x="-5" y="-9" width="9" height="4" rx="1"/><rect x="3" y="-8" width="10" height="1.4"/></g>`;
const teamIcon = (x, y, s) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s || 1})"><path d="M0,-9 L6,0 L-6,0 Z" fill="${C.bad}"/></g>`;
const arrowHead = (x, y, dx, dy, s, col) => { const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l; return `<path d="M${(x + ux * s).toFixed(1)},${(y + uy * s).toFixed(1)} L${(x - uy * s * 0.6).toFixed(1)},${(y + ux * s * 0.6).toFixed(1)} L${(x + uy * s * 0.6).toFixed(1)},${(y - ux * s * 0.6).toFixed(1)} Z" fill="${col}"/>`; };
const secs = x => (x >= 0 ? '+' : '') + f2(x) + ' s';

// where the missile is at volley time t, in the engagement's own frame: x out from the vehicle along the line, y sideways, z height
function missileAt(D, t) {
  const F = D.frame, P = D.traj; if (t <= D.tL) return { x: D.R, y: 0, z: F.LH, blind: false, flying: false };
  if (!P.length || t < P[0][0]) { const x = Math.max(0, D.R - D.speed * (t - D.tL)); return { x, y: 0, z: F.hh + (F.LH - F.hh) * x / F.R + (x > 300 ? F.los_off : F.los_off * x / 300), blind: false, flying: true }; }
  if (t >= P[P.length - 1][0]) { const q = P[P.length - 1]; return { x: q[1], y: q[2], z: q[3], blind: !!q[4], flying: false }; }
  let i = 1; while (i < P.length && P[i][0] < t) i++; const a = P[i - 1], b = P[i], u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, z: a[3] + (b[3] - a[3]) * u, blind: !!b[4], flying: true };
}
// a round at volley time t: null before it is fired and after its burst; else how far out it is
function roundAt(D, r, t) { if (t < r.tFire) return null; const stop = r.tBurst != null ? r.tBurst : r.tPass + 0.8; if (t > stop) return null; return { x: sOf(t - r.tFire, r.v0, D.plan.k), u: (t - r.tFire) / Math.max(1e-6, stop - r.tFire) }; }
// a puff at volley time t: centre and 1-sigma radius (HKOI_SPEC 3.7), null before it has started to form
function puffAt(D, p, t) { const age = t - p.ta; if (age < -D.form) return null; const a = Math.max(0, age); return { x: p.x + p.wa * a, y: p.y + D.wc * a, z: p.z, s: Math.sqrt(p.s0 * p.s0 + 2 * D.K * a), forming: age < 0 }; }
const tauNow = (D, t) => { let v = 0; for (const q of D.tauS) if (q[0] <= t + 1e-6) v = q[1]; return t < (D.tauS[0] ? D.tauS[0][0] : 1e9) ? 0 : v; };
// stage of the story at volley time t: 0 launch, 1 warned, 2 tracked, 3 planned (waiting to fire), 4 firing, 5 cloud, 6 cut, 7 ended
export const aimStage = (D, t) => (t >= D.end.t ? 7 : t >= D.cut.t ? 6 : D.tFirstPuff != null && t >= D.tFirstPuff - D.form ? 5 : t >= D.plan.tF ? 4 : t >= D.radar.tTrack + 0.05 ? 3 : t >= D.radar.tTrack ? 2 : t >= D.warn.t ? 1 : 0);
// the end of the flight in words, from the record
export const endPhrase = D => (D.end.type === 'ground' ? `fell ${m0(D.end.short)} short` : D.end.miss != null ? `missed by ${f1(D.end.miss)} m` : 'missed');

// The firing geometry of the single engagement, drawn to scale from the record at battle time tb. Top: the line from the tank to the
// launcher seen from the side (distances true, heights stretched by the stated factor). Bottom, by focus: 'chain' the six links of
// the chain with their times, 'table' the fire control's planning table, 'bearing' the warning seen from above, 'light' how much of
// the beam still reaches the missile's tail.
export const GEO_W = 360, GEO_H = 340;
export function geoSVG(D, tb, focus, TB) {
  const t = tb - D.T0, X0 = 34, X1 = 326, xs = d => X0 + (X1 - X0) * Math.max(0, Math.min(1, d / D.R)), yG = 128, VZ = 4.2, hy = z => yG - 10 - z * VZ;
  const ex = Math.round(VZ / ((X1 - X0) / D.R)), st = aimStage(D, t), m = missileAt(D, t), F = D.frame; let o = '';
  o += T(14, 20, 'SIDE VIEW, TO SCALE', ' class="h"') + T(346, 21, secs(t - D.tL), ' class="n e w"');
  // ground, distances
  o += LN(X0 - 16, yG, X1 + 16, yG, C.ground, ' stroke-width="2"');
  for (let k = 0; k * 1000 < D.R - 250; k++) { const x = xs(k * 1000); o += LN(x, yG, x, yG + 5, C.dim) + T(x, yG + 19, k ? k + ' km' : '0', ' class="s m"'); }
  o += T(X1, yG + 19, km2(D.R), ' class="s m"') + T(14, 40, `heights stretched ${ex}×`, ' class="s d" style="font-size:11px"');
  o += tankSide(X0, yG, 1.15) + teamIcon(X1, yG, 1.3);
  // the planned meeting point and, before the gun fires, where the missile will be when it does
  if (st >= 3 || focus === 'table') { const x = xs(D.plan.want); o += `<path d="M${x},${hy(F.los_off + 1.5) - 7} l6,7 l-6,7 l-6,-7 Z" fill="${C.good}"/>`; if (st < 6) o += T(x, 64, `meet ${m0(D.plan.want)}`, ' class="n g m"'); }
  if (st === 3 && focus === 'table') { const x = xs(D.plan.dFire); o += LN(x, hy(4) - 6, x, yG - 2, C.warn, ' stroke-dasharray="3 3"') + T(x, yG - 6, 'fire here', ' class="s w m b"'); }
  // the guidance beam: from the launcher to the missile while guided; once cut, it stops at the cloud
  const lx = xs(D.R), ly = hy(F.LH + F.los_off);
  if (m.flying || t >= D.tL && t < D.end.t) {
    if (st < 6) o += LN(lx, ly, xs(m.x), hy(m.z), C.bad, ' stroke-width="2.4"');
    else { const far = Math.max(...D.puffs.map(p => p.x)); o += LN(lx, ly, xs(far), hy(F.los_off + 2), C.bad, ' stroke-width="2.4"') + LN(xs(far), hy(F.los_off + 2), xs(m.x), hy(m.z), C.blind, ' stroke-width="1.6" stroke-dasharray="4 4"'); }
  }
  // the radar's track and the laser warning
  if (st >= 2 && st < 7 && m.flying) o += LN(X0 + 4, yG - 14, xs(m.x), hy(m.z), C.warn, ' stroke-width="1.3" stroke-dasharray="2 4"');
  if (st >= 1 && t < D.warn.t + 1.2) o += CI(X0, yG - 8, 13 + 10 * Math.max(0, Math.min(1, (t - D.warn.t) / 1.2)), ` fill="none" stroke="${C.warn}" stroke-width="2"`);
  // puffs, rounds
  for (const p of D.puffs) { const q = puffAt(D, p, t); if (!q) continue; o += `<ellipse cx="${xs(q.x).toFixed(1)}" cy="${hy(q.z).toFixed(1)}" rx="${Math.max(2.6, Math.min(7, q.s * (X1 - X0) / D.R * 3)).toFixed(1)}" ry="${Math.max(2.6, Math.min(7, q.s * VZ * 0.5)).toFixed(1)}" fill="${C.hk}" fill-opacity="${q.forming ? 0.3 : 0.55}"/>`; }
  for (const r of D.rounds) { const q = roundAt(D, r, t); if (!q) continue; const z = 2.2 + ((r.bz != null ? r.bz : F.los_off + 1) - 2.2) * q.u; o += CI(xs(q.x), hy(z), 2.6, ` fill="#fff" stroke="${C.hk}" stroke-width="1.5"`); }
  // the missile, the cut, the end
  if (t >= D.tL && t < D.end.t) { const blind = st >= 6, col = blind ? C.blind : C.bad, x = xs(m.x), y = hy(m.z); o += arrowHead(x, y, -1, 0, 8, col) + T(x, y - 12, blind ? 'blind' : D.name, ` class="s m b" fill="${col}" style="fill:${col}"`); }
  if (st >= 6) { const x = xs(D.cut.d); o += LN(x, yG - 4, x, 60, C.hk, ' stroke-width="1.5"') + T(x + 4, 64, `CUT at ${m0(D.cut.d)}`, ' class="n k"'); }
  if (st >= 7) { const x = xs(D.end.type === 'ground' ? D.end.short : 0); o += T(x, yG + 5, '✕', ' class="big w m"') + T(Math.max(x + 8, 64), yG + 36, endPhrase(D), ' class="s w b"'); }
  // the bottom half
  const y0 = 174;
  if (focus === 'table' && TB) o += tablePart(D, TB, y0);
  else if (focus === 'bearing') o += bearingPart(D, t, y0);
  else if (focus === 'light') o += lightPart(D, t, y0);
  else o += chainPart(D, t, y0);
  return wrap(GEO_W, GEO_H, o);
}
// the six links, each with its time after launch; done links green, the current one amber
function chainPart(D, t, y0) {
  const L = [['Laser warning', D.warn.t], ['Radar track', D.radar.tTrack], ['Gun fires', D.plan.tF], ['Cloud forms', D.tFirstPuff], ['Beam cut', D.cut.t], ['Flight ends', D.end.t]];
  let o = T(14, y0 + 4, 'THE CHAIN, TIMES AFTER LAUNCH', ' class="h"'), cur = -1; for (let i = 0; i < L.length; i++) if (t >= L[i][1] - 1e-6) cur = i;
  L.forEach(([name, tt], i) => { const col = i % 3, row = Math.floor(i / 3), x = 12 + col * 114, y = y0 + 14 + row * 74, done = i < cur, now = i === cur;
    o += RC(x, y, 108, 64, ` rx="7" fill="${now ? 'rgba(255,179,71,.18)' : 'rgba(255,255,255,.04)'}" stroke="${now ? C.warn : done ? C.good : C.line}" stroke-width="${now ? 2 : 1.2}"`);
    o += T(x + 8, y + 20, `${i + 1}  ${name}`.slice(0, 19), ` class="s b"${done || now ? '' : ' style="fill:#7d8d86"'}`) + T(x + 8, y + 46, secs(tt - D.tL), ` class="n ${now ? 'w' : done ? 'g' : 'd'}"`); });
  return o;
}
// the planning table: for each meeting distance the share of the fire control's own trials in which the cloud cut the missile
function tablePart(D, TB, y0) {
  const n = TB.grid.length, x0 = 30, w = 316, bw = w / n, h = 96, yb = y0 + 26 + h; let o = T(14, y0 + 4, `THE FIRE CONTROL'S TABLE FOR A ${TB.name.toUpperCase()}`, ' class="h"');
  o += LN(x0, yb, x0 + w, yb, C.dim) + LN(x0, yb - h, x0 + w, yb - h, C.line, ' stroke-dasharray="2 4"') + T(x0 - 4, yb - h + 4, '100%', ' class="s e" style="font-size:10px"') + T(x0 - 4, yb + 4, '0', ' class="s e" style="font-size:10px"');
  TB.grid.forEach((g, i) => { const on = Math.abs(g - D.plan.want) < 1, bh = h * TB.p[i]; o += RC(x0 + i * bw + 1, yb - bh, bw - 2, bh, ` fill="${on ? C.good : 'rgba(180,200,190,.35)'}"`);
    if (g % 500 === 0) o += T(x0 + i * bw + bw / 2, yb + 15, (g / 1000).toFixed(1) + ' km', ' class="s m" style="font-size:11px"'); });
  const bi = TB.grid.findIndex(g => Math.abs(g - D.plan.want) < 1); if (bi >= 0) o += T(Math.min(x0 + w - 4, Math.max(x0 + 60, x0 + bi * bw + bw / 2)), yb - h * TB.p[bi] - 6, `${r0(100 * TB.p[bi])}%: chosen`, ' class="n g m"');
  o += T(14, yb + 34, 'meeting distance; bar: share of trials cut', ' class="s d"');
  if (TB.honest) o += T(14, yb + 52, `trials: gunner wander ${TB.wander ? TB.wander.join(' to ') + ' mrad' : ''}, tank moving (assumed)`, ' class="s d" style="font-size:11px"');
  return o;
}
// the warning from above: the bearing it reports, the bearing error the setting describes (not used by the engine), the radar's look
function bearingPart(D, t, y0) {
  const cx = 92, cy = y0 + 86, R = 70, a = D.brg * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a), sg = (D.warn.sigma || 0) * Math.PI / 180; let o = T(14, y0 + 4, 'SEEN FROM ABOVE, NORTH UP', ' class="h"');
  o += CI(cx, cy, R, ` fill="none" stroke="${C.line}"`) + T(cx, cy - R - 4, 'N', ' class="s m d"');
  if (sg) o += `<path d="M${cx},${cy} L${(cx + Math.sin(a - sg) * R).toFixed(1)},${(cy - Math.cos(a - sg) * R).toFixed(1)} A${R},${R} 0 0 1 ${(cx + Math.sin(a + sg) * R).toFixed(1)},${(cy - Math.cos(a + sg) * R).toFixed(1)} Z" fill="rgba(255,179,71,.12)" stroke="${C.warn}" stroke-dasharray="3 3"/>`;
  if (t >= D.warn.t) o += LN(cx, cy, cx + ux * R, cy + uy * R, C.warn, ' stroke-width="2.5"') + arrowHead(cx + ux * R, cy + uy * R, ux, uy, 7, C.warn);
  if (t >= D.radar.tAcq) { const m = missileAt(D, t), k = Math.min(1, m.x / D.R); o += CI(cx + ux * R * k, cy + uy * R * k, 5, ` fill="${C.bad}"`); if (t >= D.radar.tTrack) o += CI(cx + ux * R * k, cy + uy * R * k, 10, ` fill="none" stroke="${C.good}" stroke-width="2"`); }
  o += tankSide(cx, cy + 4, 0.8);
  const tx = 176; let y = y0 + 30;
  const line = (s, cls) => { o += T(tx, y, s, ` class="${cls || 's'}"`); y += 19; };
  line(`Warning: ${r0(D.brg)}°`, 'n w'); line(`${secs(D.warn.dt)} after launch`, 's');
  y += 6; line(`Radar: found ${secs(D.radar.tAcq - D.warn.t)}`, 'n g'); line('after the warning', 's'); line(`track at ${km2(D.radar.dTrack)}`, 's');
  y += 6; if (sg) { line(`dashed: ${D.warn.sigma}° error setting,`, 's d'); line('not used by the engine', 's d'); }
  return o;
}
// how much of the beam's light still reaches the missile's tail, from the record's optical depth on that line
function lightPart(D, t, y0) {
  const tau = tauNow(D, t), pass = Math.exp(-tau), need = Math.exp(-D.need), x0 = 20, w = 320, yb = y0 + 70, lg = v => Math.max(0, Math.min(1, 1 + Math.log10(Math.max(1e-4, v)) / 3));   /* bar on a log scale: 100% to 0.1% */
  let o = T(14, y0 + 4, "LASER LIGHT REACHING THE MISSILE'S TAIL", ' class="h"');
  o += RC(x0, yb - 18, w, 22, ` rx="4" fill="rgba(255,255,255,.06)"`) + RC(x0, yb - 18, w * lg(pass), 22, ` rx="4" fill="${pass < need ? C.hk : C.bad}"`);
  const xn = x0 + w * lg(need); o += LN(xn, yb - 26, xn, yb + 10, C.warn, ' stroke-width="2"') + T(xn, yb + 26, `it needs ${(100 * need).toFixed(1)}%`, ' class="s w m"');
  o += T(x0, yb - 26, `${pass >= 0.995 ? '100' : (100 * pass).toFixed(pass > 0.1 ? 0 : 1)}% gets through`, ` class="big" style="fill:${pass < need ? C.hk : C.text}"`);
  o += T(x0, yb + 50, t >= D.cut.t ? `Below that at ${secs(D.cut.t - D.tL)}: the missile lost the beam.` : 'Each puff on the line dims it.', ' class="s"');
  o += T(x0, yb + 70, `(optical depth ${f1(tau)}; the model's threshold ${f1(D.need)})`, ' class="s d"');
  return o;
}

// The fire control's queue in a volley of several: for each threat, what it is, and what the fire control did with it, as of tb
export const QUEUE_W = 360;
const KIND_C = { kornet: C.bad, saclos: '#ff9a6b', rpg: '#ffd36b', sal: '#ff7fbf', fpv: '#c39bff', fpv_fiber: '#c39bff', vikhr: C.bad, ir: '#ff7fbf' };
const GUIDE = { beam_rider: 'rides a laser beam', radio_saclos: 'radio command', unguided: 'unguided rocket', sal: 'laser homing', drone: 'drone', ir: 'heat seeking', ke: 'tank round' };
const WHY = { cut: "HKOI's cloud cut it", he: 'shot down by airburst', unguided: 'unguided: left to Trophy', handed: 'handed to Trophy', thin: 'cloud too thin: Trophy', min_range: 'too close for a cloud: Trophy', no_time: 'no time for a cloud: Trophy', fired: 'HKOI fired; Trophy took it', none: 'nothing fired' };
export function orderWhy(r) { if (r.why === 'thin' || (r.why === 'fired' && r.by === 'aps')) return WHY.thin; if (r.why === 'unguided' && r.by !== 'aps') return 'unguided: flew wide by itself'; return WHY[r.why] || r.why; }
export function queueSVG(O, tb) {
  const t = tb - O.T0, rows = O.rows, h = 44 + rows.length * 58; let o = T(14, 22, "WHO GETS THE GUN: THE FIRE CONTROL'S CHOICES", ' class="h"');
  rows.forEach((r, i) => { const y = 38 + i * 58, live = t >= r.t0, over = t >= r.endT, col = KIND_C[r.key] || C.bad, gun = O.gunOrder.indexOf(r);
    o += RC(10, y, 340, 52, ` rx="7" fill="${live && !over ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)'}" stroke="${C.line}"`) + CI(26, y + 18, 6, ` fill="${col}"${live ? '' : ' fill-opacity=".35"'}`);
    o += T(40, y + 23, r.label, ' class="b"') + T(40, y + 42, `${km2(r.R)}, ${GUIDE[r.guidance] || ''}`, ' class="s d"');
    const plan = gun >= 0 ? `gun ${['1st', '2nd', '3rd', '4th', '5th', '6th'][gun] || gun + 1}` : '';
    const now = !live ? 'not yet fired' : !over ? (r.cutT != null && t >= r.cutT ? 'cut: flying blind' : 'in flight') : r.by === 'hkoi_cut' ? (r.endType === 'ground' ? `cut: fell ${m0(r.miss || 0)} short` : r.miss != null ? `cut: missed by ${f1(r.miss)} m` : 'cut') : r.by === 'aps' ? 'destroyed by Trophy' : r.endType === 'hit' ? 'HIT the tank' : 'missed';
    o += T(342, y + 23, gun >= 0 ? `${plan}: ${r.by === 'hkoi_cut' ? 'cut' : orderWhy(r)}`.slice(0, 30) : orderWhy(r).slice(0, 30), ` class="s e b" style="fill:${gun >= 0 ? C.hk : C.good}"`) + T(342, y + 42, now, ` class="s e" style="fill:${over ? (r.endType === 'hit' ? C.bad : C.good) : C.text}"`); });
  return wrap(QUEUE_W, h, o);
}

// The layers, from the battle's own settings (not to scale: the rings are in order, not in proportion)
export const LAYER_W = 360, LAYER_H = 300;
export function layerSVG(L, focus) {
  const cx = 96, cy = 160; let o = T(14, 22, 'THE LAYERS, NOT TO SCALE', ' class="h"');
  const ring = (r, col, dash, on) => CI(cx, cy, r, ` fill="none" stroke="${col}" stroke-width="${on ? 3 : 1.5}"${dash ? ' stroke-dasharray="4 4"' : ''}${on ? '' : ' stroke-opacity=".55"'}`);
  o += ring(84, C.warn, true, focus === 'sense') + `<path d="M${cx},${cy} m-72,0 a72,72 0 1,0 144,0 a72,72 0 1,0 -144,0 M${cx},${cy} m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" fill="${C.hk}" fill-opacity="${focus === 'cloud' ? 0.28 : 0.12}" fill-rule="evenodd"/>` + ring(34, '#ff9a6b', false, focus === 'he') + ring(16, C.good, false, focus === 'trophy') + tankSide(cx, cy + 4, 0.75);
  const tx = 196; let y = 54; const item = (head, sub, col, on) => { o += T(tx, y, head, ` class="b" style="fill:${col}${on ? '' : ';opacity:.7'}"`); y += 18; for (const s of sub) { o += T(tx, y, s, ' class="s"'); y += 16; } y += 10; };
  item('Senses', [`laser warner, radar ${L.radarMode === 'continuous' ? 'always on' : ''}`, `up to ${L.tracks} tracks`], C.warn, focus === 'sense');
  item('Cloud', [`${km2(L.obsMin)} to ${km2(L.obsMax)} out`, `${L.payload} g a round (assumed)`], C.hk, focus === 'cloud');
  item('Airburst', [`drones, near ${m0(L.heDrone)}`], '#ff9a6b', focus === 'he');
  item('Trophy', [`at the hull, ${L.aps0} shots a side`], C.good, focus === 'trophy');
  return wrap(LAYER_W, LAYER_H, o);
}

// How three kinds of guided weapon are steered, and what HKOI does about each (which: the one the text is about)
export const GUIDE_W = 360, GUIDE_H = 356;
export function guideSVG(which) {
  let o = T(14, 22, 'THREE WAYS TO STEER A MISSILE', ' class="h"');
  const panel = (i, key, title, how, hk) => { const y = 34 + i * 106, on = !which || which === key; o += RC(10, y, 340, 98, ` rx="8" fill="${on ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.02)'}" stroke="${on ? C.warn : C.line}"`);
    o += `<g opacity="${on ? 1 : 0.5}">` + teamIcon(30, y + 50, 1.1) + tankSide(326, y + 54, 0.9);
    if (key === 'beam') o += `<path d="M34,${y + 44} L322,${y + 40} L322,${y + 52} Z" fill="${C.bad}" fill-opacity=".25"/>` + arrowHead(170, y + 46, 1, 0, 8, C.bad) + CI(160, y + 46, 3, ` fill="none" stroke="#fff"`);
    if (key === 'radio') o += LN(34, y + 44, 170, y + 46, C.bad, ' stroke-dasharray="2 5" stroke-width="2"') + arrowHead(170, y + 46, 1, 0, 8, C.bad) + CI(162, y + 46, 3.5, ` fill="${C.warn}"`);
    if (key === 'laser') o += LN(34, y + 44, 320, y + 48, C.bad, ' stroke-width="1.4"') + CI(320, y + 48, 4, ` fill="${C.bad}"`) + arrowHead(220, y + 30, 1, 0.12, 8, C.bad) + CI(228, y + 31, 2.4, ` fill="#fff"`);
    o += '</g>' + T(22, y + 20, title, ` class="b"${on ? '' : ' style="opacity:.7"'}`) + T(22, y + 74, how, ' class="s"') + T(22, y + 91, hk, ` class="s b" style="fill:${C.hk}"`); };
  panel(0, 'beam', 'Laser beam-rider (Kornet)', 'eye in its tail looks back at the beam', 'HKOI: cloud on the beam');
  panel(1, 'radio', 'Radio command (Konkurs)', 'launcher watches its flare, radios fixes', 'HKOI: cloud hides flare');
  panel(2, 'laser', 'Laser homing', 'eye in its nose sees a laser spot on you', 'HKOI: airburst rounds');
  return wrap(GUIDE_W, GUIDE_H, o);
}
