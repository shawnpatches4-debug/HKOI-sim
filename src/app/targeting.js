// "How HKOI aims": the targeting page and its diagrams. Shawn, 15 Nov 2026: "I want a specific page that shows how its targeting is
// done ... how it gets a LWS warning and then the radar ... helps pinpoint a firing corridor and plans the most optimal shot."
//
// EVERYTHING here is read from one real engagement in the battle record (what HK.runMission in src/engine.js writes per threat:
// warning time and source, radar pick-up and track, the fire control's planned meeting distance, every round's firing time, meeting
// distance and fate, every obscurant puff, the optical depth on the guidance line, the cut, the blind flight and its end) or from the
// battle's own engine settings. Nothing is typed in. Where Shawn's description goes beyond what the engine models, the text says so:
//   - the laser warner's bearing error (8 degrees) is a setting the engine does not use: the radar is sent straight down the warning
//     bearing. The "search corridor" drawn here is that bearing with the setting's width, labelled as such.
//   - "an AI to tell threats from clutter" is modelled only as the fire control's AI switch: a faster track, half the track error,
//     and a lower chance of firing at a false warning (3% against 20%). No classifier exists in the code.
//   - the ELM-2133's 150 m high-resolution zone is not modelled.
// This file uses no page: the finders and the diagram builders (which return SVG markup as a string) run in node too, so
// `node tests/app/targeting.test.mjs` fights the same battles and checks every number the page shows against the record.
//
// Frame rate: a diagram is a function of battle time only; the briefing redraws it when that time changes.

const S = (biome, map, force, skill, waves, seed) => ({ biome, map, force, skill, waves, seed });
// the two battles, found by a seed search on 15 Nov (scratchpad v2/briefing/search.mjs): a lone Kornet from 3.2 km cut by the first
// burst and flying past blind; and a volley of five weapons at once (two Kornet, two Konkurs, an RPG)
export const AIM_SETUP = S('forest', 3, 'ambush', 'trained', 1, 2), ORDER_SETUP = S('farmland', 3, 'ambush', 'trained', 1, 2);

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
    obsMin: 350, obsMax: kb ? kb.grid[kb.grid.length - 1] : 2500, kornetBest: kb ? kb.best_m : null, payload: rd.payload_g, saclos: (c.obs || {}).saclos_effect,
    heDrone: rd.he_meet_drone_m || 800, heMissile: rd.he_meet_missile_m || 700,   /* the engine's own fall-backs when the setting is absent (runMission) */
    hePk: rd.he_pk_drone, apsR: aps.radar_range_m, aps0: aps.mag_per_side, apsPk: aps.pk_cued, apsDrone: aps.pk_drone,
    keSpeed: TH.ke ? TH.ke.speed : null, rpgSpeed: TH.rpg ? TH.rpg.speed : null };
}

// the enemy commander's picture at a moment: where he believes the vehicle is, how sure, how old the report is (battle.commanderAt)
export function cdrFacts(B, t) {
  const C = B.commanderAt ? B.commanderAt(t) : null; if (!C || !C.picture || C.e == null) return null;
  return { t, e: C.e, n: C.n, alive: C.alive, pe: C.picture.e, pn: C.picture.n, r: C.picture.r_m, age: C.picture.age, src: C.picture.src, seen: C.picture.t,
    withUid: C.with && C.with.uid != null ? C.with.uid : null };
}

// ---- drawing (SVG markup as text) ---------------------------------------------------------------------------------------------------
const C = { good: '#39d98a', bad: '#ff6b5e', warn: '#ffb347', dim: '#8fa39a', line: 'rgba(255,255,255,.18)', text: '#e9f1ec', puff: '#cfe6ff', blind: '#b8beba', sky: '#0b1411' };
const T = (x, y, s, o) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"${o || ''}>${esc(s)}</text>`;
const LN = (x1, y1, x2, y2, st, o) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${st}"${o || ''}/>`;
const CI = (x, y, r, o) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(0.1, r).toFixed(1)}"${o || ''}/>`;
const head = (x, y, s) => T(x, y, s, ` class="h"`);
const STYLE = `<style>text{font:13px ui-sans-serif,system-ui,sans-serif;fill:${C.text}} .h{font:600 11px ui-monospace,monospace;letter-spacing:.08em;fill:${C.dim}} .s{font-size:11.5px;fill:#b9c8c0} .n{font:600 12.5px ui-monospace,monospace} .big{font:700 24px ui-sans-serif,system-ui,sans-serif} .b{font-weight:700} .g{fill:${C.good}} .r{fill:${C.bad}} .a{fill:${C.warn}} .m{text-anchor:middle} .e{text-anchor:end}</style>`;
const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMin meet">${STYLE}${body}</svg>`;
// a little tank (seen from above, pointing right) and a launcher mark
const tankIcon = (x, y, s) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s})"><rect x="-7" y="-4.5" width="14" height="9" rx="1.5" fill="${C.good}"/><rect x="-3" y="-2.6" width="6" height="5.2" rx="1" fill="#0b1411"/><rect x="2" y="-0.7" width="9" height="1.4" fill="${C.good}"/></g>`;
const teamIcon = (x, y) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><path d="M0,-6 L6,5 L-6,5 Z" fill="${C.bad}"/></g>`;

// where the missile is at volley time t, in the engagement's own frame: x out from the vehicle along the bearing, y sideways, z height
function missileAt(D, t) {
  const F = D.frame, P = D.traj; if (t <= D.tL) return { x: D.R, y: 0, z: F.LH, blind: false, flying: false };
  if (!P.length || t < P[0][0]) { const x = Math.max(0, D.R - D.speed * (t - D.tL)); return { x, y: 0, z: F.hh + (F.LH - F.hh) * x / F.R + (x > 300 ? F.los_off : F.los_off * x / 300), blind: false, flying: true }; }
  if (t >= P[P.length - 1][0]) { const q = P[P.length - 1]; return { x: q[1], y: q[2], z: q[3], blind: !!q[4], flying: false }; }
  let i = 1; while (i < P.length && P[i][0] < t) i++; const a = P[i - 1], b = P[i], u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, z: a[3] + (b[3] - a[3]) * u, blind: !!b[4], flying: true };
}
// a round at volley time t: null before it is fired and after its burst; else how far out it is
function roundAt(D, r, t) {
  if (t < r.tFire) return null; const stop = r.tBurst != null ? r.tBurst : r.tPass + 0.8; if (t > stop) return null;
  return { x: sOf(t - r.tFire, r.v0, D.plan.k), arrive: stop };
}
// a puff at volley time t: centre and 1-sigma radius (HKOI_SPEC 3.7), null before it has formed
function puffAt(D, p, t) { const age = t - p.ta; if (age < -D.form) return null; const a = Math.max(0, age); return { x: p.x + p.wa * a, y: p.y + D.wc * a, z: p.z, s: Math.sqrt(p.s0 * p.s0 + 2 * D.K * a), forming: age < 0, dens: p.m * D.alpha * Math.exp(-D.wash * a) / (2 * Math.PI * (p.s0 * p.s0 + 2 * D.K * a)) }; }
const tauNow = (D, t) => { let v = 0; for (const q of D.tauS) if (q[0] <= t + 1e-6) v = q[1]; return t < (D.tauS[0] ? D.tauS[0][0] : 1e9) ? 0 : v; };

// stage of the story at volley time t (what the diagram shows): 0 launch, 1 warned, 2 tracked, 3 planned, 4 firing, 5 puffs, 6 cut, 7 ended
export const aimStage = (D, t) => (t >= D.end.t ? 7 : t >= D.cut.t ? 6 : D.tFirstPuff != null && t >= D.tFirstPuff - D.form ? 5 : t >= D.plan.tF ? 4 : t >= D.radar.tTrack + 0.05 ? 3 : t >= D.radar.tTrack ? 2 : t >= D.warn.t ? 1 : 0);

// The single engagement. Panels: plan view along the bearing (true scale), a close-up of the meeting zone from the side (height
// stretched), the optical depth on the guidance line against the threshold, and the time line. W x H = 560 x 520.
export const AIM_W = 560, AIM_H = 540, AIM_TL = { x0: 30, x1: 540, y0: 482, y1: 524 };
export const AIM_CW = 560, AIM_CH = 230;
export function aimSVG(D, tb, opt) {
  const t = tb - D.T0, st = aimStage(D, t), F = D.frame, o = opt || {}, focus = o.focus || '';
  if (o.compact) {   /* over the enemy's sight: just how much of his beam still gets through, big */
    const tv = t >= D.end.t ? 0 : tauNow(D, t), gx0 = 20, gx1 = 540, gy0 = 112, gy1 = 210, ta = D.tauS.length ? D.tauS[0][0] - 0.2 : D.plan.tF, tbb = Math.max(ta + 1, D.cut.t + 0.6), tmx = D.need * 1.25;
    const GX = u => gx0 + (u - ta) / (tbb - ta) * (gx1 - gx0), GY = v => gy1 - Math.min(v, tmx) / tmx * (gy1 - gy0);
    let c = `<rect width="${AIM_CW}" height="${AIM_CH}" rx="8" fill="${C.sky}" fill-opacity=".9" stroke="${C.line}"/>` + head(16, 24, 'HIS BEAM THROUGH THE CLOUD (FROM THE RECORD)');
    c += T(16, 62, t < ta ? 'no cloud yet' : `${(100 * Math.exp(-tv)).toFixed(tv > 3 ? 1 : 0)}% gets through`, ` class="big${t >= D.cut.t ? ' g' : ''}"`) + T(16, 88, t >= D.cut.t ? `cut ${f2(D.cut.dt)} s after launch: the missile is blind` : `lost below ${(100 * Math.exp(-D.need)).toFixed(1)}%  ·  optical depth ${f2(tv)} of ${f2(D.need)}`, ' class="s"');
    c += `<rect x="${gx0}" y="${gy0}" width="${gx1 - gx0}" height="${gy1 - gy0}" fill="#000" fill-opacity=".25" stroke="${C.line}"/>` + LN(gx0, GY(D.need), gx1, GY(D.need), C.warn, ' stroke-dasharray="5 3" stroke-width="1.5"');
    let gp = ''; for (const q of D.tauS) { if (q[0] > Math.min(t, tbb)) break; gp += `${GX(q[0]).toFixed(1)},${GY(q[1]).toFixed(1)} `; } if (gp) c += `<polyline points="${gp}" fill="none" stroke="${C.puff}" stroke-width="3"/>`;
    return wrap(AIM_CW, AIM_CH, c);
  }
  let s = `<rect width="${AIM_W}" height="${AIM_H}" rx="8" fill="${C.sky}" fill-opacity=".92" stroke="${C.line}"/>`;
  // ---- plan view
  const px0 = 46, px1 = 524, py = 100, sc = (px1 - px0) / (D.R * 1.03), X = x => px0 + x * sc, Y = y => py - y * sc;
  s += head(14, 20, 'FROM ABOVE: TANK TO LAUNCHER, TRUE SCALE');
  s += T(546, 20, `bearing ${r0(D.brg)}°`, ' class="s e"');
  for (let k = 500; k <= D.R; k += 500) s += LN(X(k), py - 3, X(k), py + 3, C.line) + (k % 1000 === 0 ? T(X(k), py - 8, `${k / 1000} km`, ' class="s m"') : '');
  s += LN(X(0), py, X(D.R), py, C.line);
  if (st >= 1) { const a = D.warn.sigma * Math.PI / 180, L = D.R * 1.02; s += `<path d="M${X(0)},${py} L${(X(0) + L * sc * Math.cos(a)).toFixed(1)},${(py - L * sc * Math.sin(a)).toFixed(1)} L${(X(0) + L * sc * Math.cos(a)).toFixed(1)},${(py + L * sc * Math.sin(a)).toFixed(1)} Z" fill="${C.warn}" fill-opacity="${focus === 'warn' || focus === 'radar' ? 0.16 : 0.08}" stroke="${C.warn}" stroke-opacity=".5" stroke-dasharray="4 3"/>`;
    s += T(X(D.R * 0.62), py - D.R * 0.62 * sc * Math.tan(a) - 5, `warning bearing ±${D.warn.sigma}° (setting)`, ' class="s a m"'); }
  const M = missileAt(D, t);
  if (st >= 2 && st < 7) s += LN(X(0), py, X(M.x), Y(M.y), C.warn, ` stroke-width="${focus === 'radar' ? 2.2 : 1.2}"`) + (focus === 'radar' ? T(X(M.x * 0.5), py - 6, 'radar track', ' class="s a m"') : '');
  // planned and actual meeting point
  if (st >= 3) { const xw = X(D.plan.want); s += `<path d="M${xw},${py - 7} l6,7 l-6,7 l-6,-7 Z" fill="none" stroke="${C.good}" stroke-width="1.5"/>` + T(xw, py + 24, `meet ${m0(D.plan.want)}`, ' class="s g m"');
    if (st === 3 && focus === 'plan') { const xf = X(D.plan.dFireIdeal); s += LN(xw, py + 12, xf, py + 12, C.bad, ' stroke-dasharray="3 3"') + T((xw + xf) / 2, py + 44, `missile flies ${m0(D.speed * D.plan.tof)} while the round flies ${m0(D.plan.want)}`, ' class="s m"'); } }
  for (const r of D.rounds) { const q = roundAt(D, r, t); if (q) s += CI(X(q.x), py, 2.2, ` fill="${C.good}"`); }
  for (const p of D.puffs) { const q = puffAt(D, p, t); if (q) s += CI(X(q.x), Y(q.y), Math.max(2.5, q.s * sc * 4), ` fill="${C.puff}" fill-opacity="${q.forming ? 0.25 : 0.55}"`); }
  s += tankIcon(X(0), py, 1.1) + teamIcon(X(D.R), py) + T(X(D.R) - 4, py - 22, `${D.name} team`, ' class="s r e"');
  if (M.flying || st < 7) s += CI(X(M.x), Y(M.y), 3.6, ` fill="${M.blind ? C.blind : C.bad}" stroke="#000" stroke-width=".6"`);
  if (st >= 7) s += T(X(0) + 4, py - 24, D.end.type === 'ground' ? `blind: into the ground ${m0(D.end.short)} short` : `blind: passed ${f1(D.end.miss)} m wide`, ' class="s"');
  // ---- close-up of the meeting zone, seen from the side
  const xs = D.puffs.map(p => p.x).concat([D.cut.d]), xa = Math.max(0, Math.min(...xs) - 160), xb = Math.max(...xs) + 220, cy0 = 200, cy1 = 318, cx0 = 46, cx1 = 524;
  const zMax = Math.max(10, ...D.puffs.map(p => p.z + 4)), sx = (cx1 - cx0) / (xb - xa), sz = (cy1 - cy0 - 14) / zMax, CX = x => cx0 + (x - xa) * sx, CZ = z => cy1 - 6 - z * sz;
  s += head(14, cy0 - 6, 'CLOSE-UP OF THE MEETING ZONE, FROM THE SIDE');
  s += T(546, cy0 - 6, `height stretched ×${r0(sz / sx)}`, ' class="s e"');
  s += `<rect x="${cx0}" y="${cy0}" width="${cx1 - cx0}" height="${cy1 - cy0}" fill="#000" fill-opacity=".25" stroke="${C.line}"/>`;
  s += LN(cx0, CZ(0), cx1, CZ(0), C.line);
  for (let k = Math.ceil(xa / 100) * 100; k <= xb; k += 100) s += LN(CX(k), CZ(0), CX(k), CZ(0) + 4, C.line) + (k % 200 === 0 ? T(CX(k), cy1 + 11, m0(k), ' class="s m"') : '');
  s += T(cx0 + 2, cy1 + 22, '← to the tank', ' class="s"') + T(cx1 - 2, cy1 + 22, `to the launcher, ${km2(D.R)} →`, ' class="s e"');
  const zb = x => F.hh + (F.LH - F.hh) * x / F.R;
  s += LN(CX(xa), CZ(zb(xa)), CX(xb), CZ(zb(xb)), C.bad, ' stroke-dasharray="5 4" stroke-opacity=".7"') + T(CX(xa) + 4, CZ(zb(xa)) + 11, "gunner's aim line", ' class="s r"');
  s += `<clipPath id="cz"><rect x="${cx0}" y="${cy0}" width="${cx1 - cx0}" height="${cy1 - cy0}"/></clipPath><g clip-path="url(#cz)">`;
  for (const p of D.puffs) { const q = puffAt(D, p, t); if (!q) continue; s += `<ellipse cx="${CX(q.x).toFixed(1)}" cy="${CZ(q.z).toFixed(1)}" rx="${Math.max(1.5, q.s * sx * 2).toFixed(1)}" ry="${(q.s * sz).toFixed(1)}" fill="${C.puff}" fill-opacity="${q.forming ? 0.15 : Math.min(0.75, 0.2 + q.dens * 0.25).toFixed(2)}"${q.forming ? ` stroke="${C.puff}" stroke-dasharray="2 2"` : ''}/>`; }
  // the missile's path so far (red guided, grey blind) and the line from its tail back to the launcher
  let path = '', pathB = ''; for (const q of D.traj) { if (q[0] > t) break; if (q[1] > xb + 50 || q[1] < xa - 50) continue; const pt = `${CX(q[1]).toFixed(1)},${CZ(q[3]).toFixed(1)} `; if (q[4]) pathB += pt; else path += pt; }
  if (path) s += `<polyline points="${path}" fill="none" stroke="${C.bad}" stroke-width="1.6"/>`; if (pathB) s += `<polyline points="${pathB}" fill="none" stroke="${C.blind}" stroke-width="1.6" stroke-dasharray="3 2"/>`;
  for (const r of D.rounds) { const q = roundAt(D, r, t); if (q && q.x >= xa) { const zr = (F.hh + 1.2) + ((r.bz != null ? r.bz : zb(r.d)) - F.hh - 1.2) * q.x / Math.max(1, r.bx != null ? r.bx : r.d); s += CI(CX(q.x), CZ(zr), 2.4, ` fill="${C.good}"`) + LN(CX(q.x) - 9, CZ(zr), CX(q.x), CZ(zr), C.good, ' stroke-opacity=".6"'); } }
  if (M.flying && M.x <= xb && M.x >= xa) { const blind = M.blind; s += LN(CX(M.x), CZ(M.z), CX(xb + 40), CZ(zb(xb + 40) + (F.LH - zb(xb + 40)) * 0), blind ? C.blind : C.bad, ` stroke-width="${blind ? 1 : 1.4}" stroke-dasharray="${blind ? '2 4' : '6 3'}" stroke-opacity=".9"`);
    s += CI(CX(M.x), CZ(M.z), 4, ` fill="${blind ? C.blind : C.bad}" stroke="#000"`); }
  s += `</g>`;
  if (M.flying && M.x <= xb && M.x >= xa) s += T(Math.min(cx1 - 6, CX(M.x) + 8), CZ(M.z) - 8, M.blind ? 'missile: blind' : 'missile, guided', ` class="s ${M.blind ? '' : 'r'}"`);
  if (st >= 5 && st < 6) s += T(cx1 - 6, cy0 + 13, 'its tail receiver looks back at the launcher through the puffs', ' class="s e"');
  if (st >= 6) s += T(cx1 - 6, cy0 + 13, `beam lost at ${m0(D.cut.d)}`, ' class="s e b"');
  // ---- optical depth on the line from the missile's tail to the launcher (the record's own samples)
  const gy0 = 372, gy1 = 440, gx0 = 46, gx1 = 524, ta = D.tauS.length ? D.tauS[0][0] - 0.2 : D.plan.tF, tbb = Math.max(ta + 1, D.end.t), tmx = Math.max(D.need * 1.25, ...D.tauS.map(q => q[1]));
  const GX = u => gx0 + (u - ta) / (tbb - ta) * (gx1 - gx0), GY = v => gy1 - v / tmx * (gy1 - gy0);
  s += head(14, gy0 - 8, 'HOW MUCH THE PUFFS BLOCK THE BEAM (OPTICAL DEPTH, FROM THE RECORD)');
  s += `<rect x="${gx0}" y="${gy0}" width="${gx1 - gx0}" height="${gy1 - gy0}" fill="#000" fill-opacity=".25" stroke="${C.line}"/>`;
  s += LN(gx0, GY(D.need), gx1, GY(D.need), C.warn, ' stroke-dasharray="5 3"') + T(gx0 + 4, GY(D.need) - 4, `beam lost above ${f2(D.need)}`, ' class="s a"');
  let gp = ''; for (const q of D.tauS) { if (q[0] > t) break; gp += `${GX(q[0]).toFixed(1)},${GY(q[1]).toFixed(1)} `; }
  if (gp) s += `<polyline points="${gp}" fill="none" stroke="${C.puff}" stroke-width="1.8"/>`;
  if (t >= D.cut.t) s += CI(GX(D.cut.t), GY(D.need), 4, ` fill="none" stroke="${C.good}" stroke-width="2"`) + T(GX(D.cut.t) + 7, GY(D.need) + 13, `cut at ${f2(D.cut.dt)} s`, ' class="s g"');
  for (let k = Math.ceil(ta - D.tL); k <= tbb - D.tL; k++) s += LN(GX(D.tL + k), gy1, GX(D.tL + k), gy1 + 4, C.line) + T(GX(D.tL + k), gy1 + 13, `${k} s`, ' class="s m"');
  if (t >= ta && t < D.end.t) { const tv = tauNow(D, t); s += T(gx1 - 4, gy0 + 12, `now ${f2(tv)} · light through ${tv > 0 ? (100 * Math.exp(-tv)).toFixed(tv > 4 ? 1 : 0) : 100}%`, ' class="s e"'); }
  // ---- time line (clickable: the briefing seeks to the time under the pointer)
  const L = AIM_TL, tl0 = D.tL - 0.5, tl1 = D.end.t + 0.8, TX = u => L.x0 + (u - tl0) / (tl1 - tl0) * (L.x1 - L.x0);
  s += head(14, L.y0 - 10, `TIME AFTER LAUNCH (S)  ·  NOW ${f2(Math.max(0, t - D.tL))} S`);
  s += `<rect x="${L.x0}" y="${L.y0}" width="${L.x1 - L.x0}" height="${L.y1 - L.y0}" rx="4" fill="#000" fill-opacity=".3" stroke="${C.line}"/>`;
  for (let k = 0; k <= tl1 - D.tL; k += 1) s += LN(TX(D.tL + k), L.y1 - 5, TX(D.tL + k), L.y1, C.line) + (k % 2 === 0 ? T(TX(D.tL + k), L.y1 + 10, String(k), ' class="s m"') : '');
  D.marks.forEach(([nm, u], i) => { if (u == null) return; const x = TX(u), on = t >= u - 1e-6, last = i === D.marks.length - 1; s += LN(x, L.y0 + 3, x, L.y1 - 4, on ? C.good : C.dim, ' stroke-width="1.5"') + T(last ? x - 3 : x + 3, L.y0 + 12 + (i % 3) * 12.5, nm, ` class="s${on ? ' g' : ''}${last ? ' e' : ''}"`); });
  const cx = TX(Math.max(tl0, Math.min(tl1, t))); s += `<path d="M${cx.toFixed(1)},${L.y0 - 5} l-4,-6 h8 Z" fill="${C.text}"/>` + LN(cx, L.y0 - 2, cx, L.y1, C.text, ' stroke-width="1.5"');
  return wrap(AIM_W, AIM_H, s);
}
// the time under a point on the aim diagram's time line (viewBox units), or null
export function aimTimeAt(D, x) { const L = AIM_TL, tl0 = D.tL - 0.5, tl1 = D.end.t + 0.8; if (x < L.x0 - 6 || x > L.x1 + 6) return null; return D.T0 + tl0 + Math.max(0, Math.min(1, (x - L.x0) / (L.x1 - L.x0))) * (tl1 - tl0); }

// Many at once: a plan of where each came from (bearing and range, not to scale near the tank) and one row per threat in time.
export const ORDER_W = 560, ORDER_H = 520;
const KIND_C = { kornet: C.bad, saclos: '#ff9a6b', rpg: '#ffd36b', sal: '#ff7fbf', fpv: '#c39bff', fpv_fiber: '#c39bff', vikhr: C.bad, ir: '#ff7fbf' };
const WHY = { cut: "cut by HKOI's cloud", he: 'shot down by airburst', unguided: 'unguided: left to Trophy', handed: 'handed to Trophy: gun busy', thin: 'cloud too thin: Trophy', min_range: 'too close: Trophy', no_time: 'no time for a cloud: Trophy', dead_zone: 'behind the gun: Trophy', fired: 'engaged by HKOI', none: 'not engaged by HKOI' };
export function orderWhy(r) { if (r.why === 'thin' || (r.why === 'fired' && r.by === 'aps')) return WHY.thin; if (r.why === 'unguided' && r.by !== 'aps') return 'unguided: flew wide by itself'; return WHY[r.why] || r.why; }
export function orderSVG(O, tb, opt) {
  const t = tb - O.T0, o = opt || {}; let s = `<rect width="${ORDER_W}" height="${ORDER_H}" rx="8" fill="${C.sky}" fill-opacity=".92" stroke="${C.line}"/>`;
  // plan: tank in the middle, north up, each threat on its true bearing at a range drawn on a square-root scale (labelled)
  const cx = 116, cy = 134, Rm = Math.max(...O.rows.map(r => r.R)), rad = d => 86 * Math.sqrt(Math.max(0, d) / Rm);
  s += head(14, 20, 'WHERE THEY CAME FROM');
  for (const d of [500, 1000, 2000, 3000]) if (d <= Rm * 1.05) s += CI(cx, cy, rad(d), ` fill="none" stroke="${C.line}"`) + T(cx + rad(d) * 0.71 + 2, cy + rad(d) * 0.71 + 8, d >= 1000 ? `${d / 1000} km` : `${d} m`, ' class="s"');
  for (const r of O.rows) { const a = r.brg * Math.PI / 180, ex = cx + Math.sin(a) * rad(r.R), ey = cy - Math.cos(a) * rad(r.R), col = KIND_C[r.key] || C.bad;
    s += LN(cx, cy, ex, ey, col, ' stroke-opacity=".35" stroke-dasharray="3 3"') + teamIcon(ex, ey).replace(C.bad, col);
    const fly = t >= r.t0 && t < r.endT, d = Math.max(0, r.R - r.speed * (t - r.t0));
    if (fly) s += CI(cx + Math.sin(a) * rad(d), cy - Math.cos(a) * rad(d), 3.4, ` fill="${col}" stroke="#000"`);
    s += T(ex + (Math.sin(a) >= 0 ? 7 : -7), ey + 4, `#${r.idx + 1}`, ` class="s b${Math.sin(a) >= 0 ? '' : ' e'}"`); }
  s += tankIcon(cx, cy, 1);
  s += T(cx, cy + 104, 'north up; range on a square-root scale', ' class="s m"');
  // the gun's order and the outcome list
  s += head(244, 20, "THE GUN'S ORDER");
  O.gunOrder.forEach((r, i) => { const on = t >= r.bursts[0].tf; s += T(244, 42 + i * 17, `${i + 1}. ${r.label}`, ` class="n${on ? ' g' : ''}"`) + T(352, 42 + i * 17, `fires at ${f1(r.bursts[0].tf)} s, due ${f1(r.impact)} s`, ' class="s"'); });
  const ly = 52 + O.gunOrder.length * 17; s += head(244, ly, 'WHO DEALS WITH EACH');
  O.rows.forEach((r, i) => { const done = t >= r.endT - 0.01; s += T(244, ly + 18 + i * 16, `#${r.idx + 1} ${r.name}`, ` class="b" fill="${KIND_C[r.key] || C.bad}" style="fill:${KIND_C[r.key] || C.bad}"`) + T(330, ly + 18 + i * 16, orderWhy(r), ` class="s"${done || o.all ? '' : ' opacity=".45"'}`); });
  // rows in time: flight bar, warning, track, the gun's bursts, Trophy's shot, the end
  const gy = 284, rh = Math.min(36, 196 / O.rows.length), gx0 = 170, gx1 = 540, tmax = Math.ceil(O.tEnd + 0.5), GX = u => gx0 + u / tmax * (gx1 - gx0);
  s += head(14, gy - 10, 'SECONDS AFTER THE FIRST LAUNCH');
  for (let k = 0; k <= tmax; k++) s += LN(GX(k), gy, GX(k), gy + rh * O.rows.length, k % 5 === 0 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.05)') + (k % 2 === 0 ? T(GX(k), gy + rh * O.rows.length + 12, String(k), ' class="s m"') : '');
  O.rows.forEach((r, i) => { const y = gy + i * rh + rh / 2, col = KIND_C[r.key] || C.bad, e = Math.min(t, r.endT);
    s += T(14, y + 4, `#${r.idx + 1} ${r.name}`, ` style="fill:${col}" class="b"`) + T(gx0 - 8, y + 4, km2(r.R), ' class="s e"');
    s += `<rect x="${GX(r.t0).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="${Math.max(0, GX(r.endT) - GX(r.t0)).toFixed(1)}" height="6" fill="${col}" fill-opacity=".18"/>`;
    if (e > r.t0) s += `<rect x="${GX(r.t0).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="${Math.max(0, GX(e) - GX(r.t0)).toFixed(1)}" height="6" fill="${col}" fill-opacity=".7"/>`;
    if (r.cue != null && t >= r.cue) s += `<path d="M${GX(r.cue).toFixed(1)},${(y - 8).toFixed(1)} l3,-5 h-6 Z" fill="${C.warn}"/>`;
    if (r.track != null && t >= r.track) s += LN(GX(r.track), y - 9, GX(r.track), y + 9, C.warn, ' stroke-width="1.6"');
    for (const b of r.bursts) if (t >= b.tf) s += `<rect x="${GX(b.tf).toFixed(1)}" y="${(y + 5).toFixed(1)}" width="${Math.max(2, GX(Math.min(t, b.t1)) - GX(b.tf)).toFixed(1)}" height="5" fill="${C.good}"/>`;
    if (r.order && t >= r.bursts[0].tf) s += T(GX(r.bursts[0].tf) - 2, y + 15, String(r.order), ' class="s g e b"');
    for (const q of r.aps) if (t >= q.t) s += `<path d="M${GX(q.t).toFixed(1)},${(y - 7).toFixed(1)} l2,5 5,0 -4,3 2,5 -5,-3 -5,3 2,-5 -4,-3 5,0 Z" fill="${q.kill ? '#7fd1ff' : C.dim}"/>`;
    if (r.cutT != null && t >= r.cutT) s += CI(GX(r.cutT), y, 4, ` fill="none" stroke="${C.good}" stroke-width="2"`);
  });
  const ky = gy + rh * O.rows.length + 28; s += `<path d="M14,${ky - 4} l3,-5 h-6 Z" fill="${C.warn}"/>` + T(22, ky, 'warning', ' class="s"') + LN(84, ky - 9, 84, ky + 1, C.warn, ' stroke-width="1.6"') + T(90, ky, 'radar track', ' class="s"') + `<rect x="172" y="${ky - 6}" width="14" height="5" fill="${C.good}"/>` + T(190, ky, 'HKOI firing, in order', ' class="s"') + `<path d="M330,${ky - 9} l2,5 5,0 -4,3 2,5 -5,-3 -5,3 2,-5 -4,-3 5,0 Z" fill="#7fd1ff"/>` + T(342, ky, 'Trophy shot', ' class="s"') + CI(428, ky - 4, 4, ` fill="none" stroke="${C.good}" stroke-width="2"`) + T(437, ky, 'beam cut', ' class="s"');
  const cxT = GX(Math.max(0, Math.min(tmax, t))); s += LN(cxT, gy - 4, cxT, gy + rh * O.rows.length, C.text, ' stroke-width="1.2"');
  return wrap(ORDER_W, ORDER_H, s);
}

// The defence in one picture: rings out from the tank (NOT to scale: 15 km and 20 m do not fit one drawing; every figure is written on it).
export const LAYER_W = 560, LAYER_H = 520;
export function layerSVG(L, focus) {
  const f = focus || 'all', on = k => f === 'all' || f === k, op = k => (on(k) ? 1 : 0.28);
  let s = `<rect width="${LAYER_W}" height="${LAYER_H}" rx="8" fill="${C.sky}" fill-opacity=".92" stroke="${C.line}"/>`;
  s += head(14, 20, 'HKOI AND TROPHY IN LAYERS  ·  NOT TO SCALE, FIGURES FROM THE SETTINGS');
  const cx = 120, cy = 262;
  const ring = (r0_, col, k, dash) => { const r = r0_ * 0.85; return `<g opacity="${op(k)}">${CI(cx, cy, r, ` fill="${col}" fill-opacity=".07" stroke="${col}" stroke-width="1.6"${dash ? ' stroke-dasharray="5 4"' : ''}`)}</g>`; };
  s += ring(132, C.warn, 'sense', true) + ring(100, C.good, 'cloud') + ring(64, '#c39bff', 'air') + ring(30, '#7fd1ff', 'trophy');
  s += tankIcon(cx, cy, 1.4);
  const lab = (y, col, k, h, lines) => `<g opacity="${op(k)}">${CI(252, y - 4, 5, ` fill="${col}"`)}${T(263, y, h, ' class="b"')}${lines.map((l, i) => T(263, y + 15 + i * 13, l, ' class="s"')).join('')}</g>`;
  s += lab(54, C.warn, 'sense', 'Radar and laser warner', [`Radar always on (${L.radarMode}): sees a ${L.rcsRef} m² target`, `about ${r0(L.radarRef / 1000)} km out (assumed); up to ${L.tracks} tracks.`, `Laser warner feels a guidance beam:`, `even odds at ${L.lwrHalf} km, surer as it closes (assumed).`]);
  s += lab(148, C.good, 'cloud', 'HKOI obscurant (30 mm)', [`Meets a missile ${m0(L.obsMin)} to ${m0(L.obsMax)} out`, `(Kornet: ${m0(L.kornetBest)}), bursts ${L.payload} g puffs on`, `its line back to the launcher. Blinds beam-riders;`, `radio-command missiles ${r0(100 * L.saclos)}% of the time (assumed).`]);
  s += lab(242, '#c39bff', 'air', 'HKOI airburst (30 mm)', [`High-explosive rounds burst beside drones`, `(planned at ${m0(L.heDrone)}) and laser-homing missiles.`, `${r0(100 * L.hePk)}% a burst on a drone before it dodges (assumed).`]);
  s += lab(322, '#7fd1ff', 'trophy', 'Trophy, at the hull', [`Radar out to ${m0(L.apsR)}; ${L.aps0} shots a side, ${2 * L.aps0} in all.`, `Fires at what still comes: missiles, RPGs,`, `drones (${r0(100 * L.apsPk)}% with HKOI's track, ${r0(100 * L.apsDrone)}% on a drone).`]);
  s += `<g opacity="${on('none') ? 1 : 0.28}">${CI(252, 404, 5, ` fill="${C.bad}"`)}${T(263, 408, 'What none of them stop', ' class="b r"')}${T(263, 423, `A tank's armour-piercing round (${m0(L.keSpeed)}/s).`, ' class="s"')}${T(263, 436, 'Too close for the gun: Trophy alone.', ' class="s"')}${T(263, 449, `More at once than one gun and ${2 * L.aps0} shots can take.`, ' class="s"')}</g>`;
  s += T(14, 496, 'Every figure is a simulator setting, read from this battle.', ' class="s"') + T(14, 510, 'None of this equipment has been built or tested.', ' class="s"');
  return wrap(LAYER_W, LAYER_H, s);
}

// The enemy commander's map: his position, his teams, where he believes the tank is and how sure he is; the true tank too (the
// briefing is a replay, so the spectator's view applies). tank: { e, n } where the vehicle is.
export const CDR_W = 560, CDR_H = 440;
// live: { tank: { e, n }, units: [{ id, e, n, alive }] } as the replay has them at this moment (unit positions are not in the commander's history)
export function cdrSVG(K, live) {
  const tank = live.tank, units = (live.units || []).filter(u => u.alive !== false), host = units.find(u => u.id === K.withUid), ke = host ? host.e : K.e, kn = host ? host.n : K.n;
  let s = `<rect width="${CDR_W}" height="${CDR_H}" rx="8" fill="#14120c" fill-opacity=".94" stroke="${C.line}"/>`;
  s += head(14, 20, "THE ENEMY COMMANDER'S MAP (WHAT HE BELIEVES)");
  const pts = [[ke, kn], [K.pe, K.pn], [tank.e, tank.n]].concat(units.map(u => [u.e, u.n]));
  const e0 = Math.min(...pts.map(p => p[0])) - 300, e1 = Math.max(...pts.map(p => p[0])) + 300, n0 = Math.min(...pts.map(p => p[1])) - 300, n1 = Math.max(...pts.map(p => p[1])) + 300;
  const sc = Math.min((CDR_W - 40) / (e1 - e0), (CDR_H - 90) / (n1 - n0)), X = e => 20 + (e - e0) * sc, Y = n => 34 + (n1 - n) * sc;
  for (let g = Math.ceil(e0 / 1000) * 1000; g <= e1; g += 1000) s += LN(X(g), Y(n1), X(g), Y(n0), 'rgba(255,230,180,.08)');
  for (let g = Math.ceil(n0 / 1000) * 1000; g <= n1; g += 1000) s += LN(X(e0), Y(g), X(e1), Y(g), 'rgba(255,230,180,.08)');
  for (const u of units) s += teamIcon(X(u.e), Y(u.n));
  s += `<rect x="${(X(ke) - 7).toFixed(1)}" y="${(Y(kn) - 7).toFixed(1)}" width="14" height="14" fill="none" stroke="${C.bad}" stroke-width="2"/>` + T(X(ke) + 10, Y(kn) - 9, 'commander', ' class="s r"');
  s += CI(X(K.pe), Y(K.pn), Math.max(4, K.r * sc), ` fill="${C.warn}" fill-opacity=".14" stroke="${C.warn}" stroke-dasharray="4 3"`) + `<path d="M${X(K.pe) - 6},${Y(K.pn)} h12 M${X(K.pe)},${Y(K.pn) - 6} v12" stroke="${C.warn}" stroke-width="2"/>`;
  s += T(X(K.pe) + 10, Y(K.pn) + 22, `he thinks the tank is here (±${m0(K.r)})`, ' class="s a"');
  s += tankIcon(X(tank.e), Y(tank.n), 0.9) + T(X(tank.e) + 10, Y(tank.n) - 10, 'where it really is', ' class="s g"');
  const off = Math.hypot(K.pe - tank.e, K.pn - tank.n);
  s += T(14, CDR_H - 30, `His picture: a ${K.src === 'report' ? "team's report" : K.src === 'sound' ? 'sound bearing' : 'guess from his plan'} ${f1(K.age)} s old, ${m0(off)} from the truth.`, '') + T(14, CDR_H - 14, 'Grid squares 1 km. From the battle record (battle.commanderAt).', ' class="s"');
  return wrap(CDR_W, CDR_H, s);
}

// ---- the steps (the briefing's format, see tour.js: head, text, from, to, rate, shot, marks, lines; plus diagram) ----------------------
const mk = (at, text, id, more) => Object.assign({ at, text, id }, more || {});
const shotOf = (base, id, more) => Object.assign({}, base, id ? { v: id.v, idx: id.idx, uid: id.uid, brg: id.brg, R: id.R } : null, more || null);

export function aimSteps(D) {
  const A = u => D.T0 + u, id = D.id, dg = focus => ({ kind: 'aim', focus, D });
  /* the cut steps say what the diagram says: the depth on the line from the missile's tail to the launcher passes the threshold */
  const fates = [D.nBloom ? `${D.nBloom} burst by proximity fuze` : '', D.nCo ? `${D.nCo} time-fuzed onto the first burst point` : '', D.nDown ? `${D.nDown} flew on` : ''].filter(Boolean).join(', ');
  return [
    { key: 'launch', head: 'Launch', from: A(D.tL - 2.2), to: A(D.tL + Math.min(0.6, 0.8 * D.warn.dt)), rate: 0.5, shot: shotOf({ cam: 'troops' }, id), diagram: dg('launch'),
      marks: [mk('launcher', `${D.name} team`, id, { tone: 'bad' })],
      text: () => `A ${D.name} team fires at the tank from ${km2(D.R)}, bearing ${r0(D.brg)}°. The missile flies at ${r0(D.speed)} m/s: ${f1(D.flight)} s to reach the tank. Every number on this page is read from the simulator's record of this one shot.` },
    { key: 'warn', head: 'Laser warning', from: A(D.tL - 0.1), to: A(D.warn.t + 0.25), rate: 0.25, shot: shotOf({ rig: 'tank' }, id), diagram: dg('warn'),
      marks: [mk('tank', `Laser warning: bearing ${r0(D.brg)}°`, null, { tone: 'warn', after: A(D.warn.t) })],
      text: () => `${f2(D.warn.dt)} s after launch the laser warning receiver feels the guidance beam, with the missile ${km2(D.warn.d)} out, and reports its bearing. Modelled: the warner's chance of noticing a beam grows as it closes (even odds at ${D.warn.half} km, assumed); its ${D.warn.sigma}° bearing error is a setting the model does not use.` },
    { key: 'radar', head: 'The radar looks down that bearing', from: A(D.warn.t - 0.05), to: A(D.radar.tTrack + 0.4), rate: 0.5, shot: shotOf({ rig: 'gun' }, id), lines: ['track'], diagram: dg('radar'),
      marks: [mk('station', 'Radar on the HKOI station', null, { tone: 'good' }), mk('missile', `${D.name}: ${km2(D.radar.dTrack)}, ${r0(D.radar.closing)} m/s closing`, id, { tone: 'bad', after: A(D.radar.tTrack) })],
      text: () => `The radar scans all the time. Sent down the warning bearing it finds the missile ${f2(D.radar.tAcq - D.warn.t)} s after the warning and holds a track ${f2(D.radar.init)} s later: ${km2(D.radar.dTrack)} out, closing at ${r0(D.radar.closing)} m/s, ${f1(D.radar.tti)} s to impact. Its own search would take ${f1(D.radar.search)} s. That is all the "corridor" is in this model: look straight down the bearing.` },
    { key: 'plan', head: 'Planning the shot', from: A(D.radar.tTrack + 0.05), to: A(D.plan.tF - 0.02), rate: 1, shot: shotOf({ rig: 'gun' }, id), lines: ['track'], diagram: dg('plan'),
      marks: [mk('station', `Waits ${f2(D.plan.wait)} s, then fires`, null, { tone: 'good' }), mk('missile', D.name, id, { tone: 'bad' }), mk('point', `Meet here: ${m0(D.plan.want)}`, id, { tone: 'good', d: D.plan.want, h: 4 })],
      text: () => `The fire control picks where its rounds will meet the missile: ${m0(D.plan.want)} out, the best distance in its own trial table for a ${D.name} (it rates it ${r0(100 * D.plan.p)}%, an optimistic table: tested with a still tank and a steady enemy gunner). A round takes ${f2(D.plan.tof)} s to get there, so the gun waits until the missile is ${m0(D.plan.dFire)} out, ${f2(D.plan.tF - D.tL)} s after launch.` },
    { key: 'burst', head: 'Overtake: the burst', from: A(D.plan.tF - 0.15), to: A(D.rounds[Math.min(D.rounds.length - 1, D.nFirst)].tPass + 0.1), rate: 0.5, shot: shotOf({ rig: 'gun' }, id), lines: ['track'], diagram: dg('burst'),
      marks: [mk('station', 'HKOI: obscurant rounds', null, { tone: 'good' }), mk('missile', D.name, id, { tone: 'bad' })],
      text: () => `${Word(D.nFirst)} rounds leave ${f2(D.plan.gap)} s apart; the first meets the missile ${m0(D.plan.meet)} out, ${f2(D.plan.tofAct)} s after leaving the gun. The radar still sees it guiding, so ${D.nExtra} more follow. Of the ${D.n}: ${fates}. They are not trying to hit it.` },
    { key: 'bloom', head: 'Bloom: the cloud on his line of sight', from: A(D.tFirstPuff - 0.4), to: A(D.cut.t - 0.05), rate: 0.5, shot: shotOf({ cam: 'enemy' }, id), diagram: Object.assign(dg('bloom'), { compact: true }),
      marks: [mk('cloud', 'Obscurant puffs', id, { tone: 'good', x: (D.puffs.reduce((a, p) => a + p.x, 0) / Math.max(1, D.puffs.length)), r: 400 }), mk('missile', 'His missile', id, { tone: 'bad' })],
      text: () => `Through the enemy gunner's sight. Each round lets go ${D.payload} g of obscurant (assumed: no such round exists yet), a puff about ${r0(2 * D.s0)} m across that grows as it drifts. The missile's tail receiver looks back at the launcher through them. The record's optical depth on that line climbs toward ${f2(D.need)}.` },
    { key: 'cut', head: 'The cut', from: A(D.cut.t - 1.2), to: A(Math.min(D.end.t - 0.2, D.cut.t + 0.4)), rate: 0.25, shot: shotOf({ rig: 'cloud', x: (D.cut.d + Math.max(...D.puffs.map(p => p.x))) / 2, span: Math.max(160, Math.max(...D.puffs.map(p => p.x)) - D.cut.d + 140) }, id), lines: ['beam'], diagram: dg('cut'),
      marks: [mk('missile', () => `${D.name}`, id, { tone: 'warn' }), mk('cloud', 'Obscurant puffs', id, { tone: 'good', x: (D.cut.d + Math.max(...D.puffs.map(p => p.x))) / 2, r: 260 }), mk('beam', 'Line back to the launcher', id, { tone: 'bad' })],
      text: () => `From the side: the puffs lie behind the missile, on the line from its tail back to the launcher. ${f2(D.cut.dt)} s after launch the depth on that line passes ${f2(D.need)}: less than ${(100 * Math.exp(-D.need)).toFixed(1)}% of the beam gets through, and the missile, ${m0(D.cut.d)} out, loses it.` },
    { key: 'blind', head: 'Riding the blind missile', from: A(D.cut.t + 0.3), to: A(Math.min(D.end.t - 0.3, D.cut.t + 3.3)), rate: 0.5, shot: shotOf({ rig: 'ride' }, id), diagram: dg('cut'),
      marks: [mk('missile', D.name + ': blind', id, { tone: 'warn' }), mk('tank', 'The tank', null, { tone: 'good' })],
      text: () => `Riding behind the missile after the cut. With no beam it gets no more steering: it holds whatever course it had, and the enemy gunner can no longer correct it. This one ${D.end.type === 'ground' ? `hit the ground ${m0(D.end.short)} short of the tank` : `passed ${f1(D.end.miss)} m wide of the tank`}, ${f1(D.end.gone)} s after the cut.` },
  ];
}
export function orderSteps(O) {
  const A = u => O.T0 + u, first = O.gunOrder[0], cutR = O.rows.find(r => r.why === 'cut'), handed = O.rows.filter(r => r.by === 'aps' || r.why === 'unguided'), dg = (f, all) => ({ kind: 'order', focus: f, O, all });
  const idOf = r => ({ v: O.id.v, idx: r.idx, uid: r.uid, brg: r.brg, R: r.R });
  const kinds = {}; for (const r of O.rows) kinds[r.name] = (kinds[r.name] || 0) + 1;
  const kl = Object.entries(kinds).map(([k, n]) => `${n === 1 ? 'one' : n === 2 ? 'two' : n} ${k}${n > 1 && !/s$/.test(k) ? 's' : ''}`), list = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const steps = [
    { key: 'many', head: `${Word(O.n)} at once`, from: A(-0.2), to: A(Math.min(O.lastTrack + 0.3, 2.4)), rate: 0.5, shot: shotOf({ rig: 'wide' }, O.id), lines: ['tracks'], diagram: dg('many'),
      marks: [mk('station', 'One gun, one radar', null, { tone: 'warn' })],
      text: () => `Another battle: ${list(kl)} fired within ${f1(O.spread)} s from different directions. The radar is modelled holding up to dozens of tracks at once, and every weapon here is tracked within ${f1(O.lastTrack)} s. The gun can only fire at one at a time.` },
    { key: 'first', head: 'Most urgent first', from: A(first.bursts[0].tf - 0.6), to: A(first.bursts[0].tf + 0.4), rate: 0.5, shot: shotOf({ rig: 'gun' }, idOf(first)), lines: ['track'], diagram: dg('first'),
      marks: [mk('missile', `${first.label}: first`, idOf(first), { tone: 'bad' })],
      text: () => `The fire control sorts the threats by the last moment it could still fire at each, most urgent first, then tries swaps and drops that save more. ${first.label} came from ${km2(first.R)} at ${r0(first.speed)} m/s, due in ${f1(first.impact - first.t0)} s: it gets the gun first.${O.gunOrder.length > 1 ? ` Then ${list(O.gunOrder.slice(1).map(r => r.label))}.` : ''}` },
    { key: 'trophy', head: 'What goes to Trophy, and why', from: A(Math.max(0, Math.min(...handed.map(r => r.endT)) - 1.2)), to: A(Math.min(Math.max(...handed.map(r => r.endT)), Math.min(...handed.map(r => r.endT)) + 6) + 0.4), rate: 0.5, shot: shotOf({ rig: 'tank' }, O.id), diagram: dg('trophy', true),
      marks: [mk('trophy', `Trophy shots used here: ${O.apsUsed} of ${2 * O.aps0}`, idOf(handed[0]), { tone: 'good', side: 'L' })],
      text: () => `Trophy, the inner layer, takes what HKOI cannot: ${list(handed.map(r => `${r.label} (${orderWhy(r)})`))}. It fired ${O.apsUsed} of its ${2 * O.aps0} shots in this volley.` },
  ];
  if (cutR) steps.push({ key: 'after', head: 'The other side, after the miss', from: A(cutR.endT + 0.3), to: A(cutR.endT + 2.3), rate: 1, shot: shotOf({ cam: 'enemy' }, idOf(cutR)), diagram: dg('after', true),
    marks: [mk('tank', 'The tank, unhurt', null, { tone: 'good' })],
    text: () => `Through the sight of the ${cutR.name} team whose beam was cut, ${f1(cutR.endT - cutR.t0)} s after it fired: the tank is still there. Its missile ${cutR.miss != null && cutR.endType === 'ground' ? `hit the ground ${m0(cutR.miss)} short` : cutR.miss != null ? `missed by ${f1(cutR.miss)} m` : 'missed'}. ${cutR.label} is the only one the gun stopped by itself in this volley: one gun cannot hold ${word(O.n)} at once.` });
  return steps;
}
