// node tests/app/targeting.test.mjs [out dir] : the targeting page ("How HKOI aims", src/app/targeting.js) against the battles it is
// built on. Both battles are fought here as the page fights them. Then every number the page shows is re-read from the battle
// record HERE, independently (straight from v.rec, the engine's own fields), and compared with what the page's finder made of it;
// the order of events must be the engine's (launch, warning, radar, track, fire, overtake, bloom, cut, end); each diagram is drawn at
// many moments and must contain no hole (NaN, undefined, Infinity). With an out dir the diagrams are written there as .svg files.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { AIM_SETUP, ORDER_SETUP, findAim, findOrder, layerFacts, cdrFacts, aimSteps, orderSteps, aimSVG, orderSVG, layerSVG, cdrSVG, aimStage, orderWhy } from '../../src/app/targeting.js';
import { runToEnd } from '../../src/app/scenarios.js';
const require = createRequire(import.meta.url);
const { HK, World, Battle, EnemyVeh, Support } = require('../battle/load.js');
const OUT = process.argv[2] || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const mainSrc = fs.readFileSync(new URL('../../src/app/main.js', import.meta.url), 'utf8'), fm = mainSrc.match(/const FORCES = \{[\s\S]*?\n\};/);
const FORCES = Object.assign(new Function(fm[0] + '; return FORCES;')(), EnemyVeh.FORCES, Support.FORCES);
const supportOf = F => { const S = F.support || {}, o = {}; if (S.wingman) o.wingman = S.wingman; if (S.artillery) o.artillery = S.artillery; if (S.scout) o.scout = true; if (S.air) o.air = S.air; return Object.keys(o).length ? o : undefined; };
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
let bad = 0, nChk = 0; const fail = (...a) => { bad++; console.log('FAIL', ...a); };
const eq = (what, a, b, tol) => { nChk++; if (!(Math.abs(a - b) <= (tol == null ? 1e-9 : tol))) fail(what, 'page', a, 'record', b); };
const fight = u => { const F = FORCES[u.force]; return runToEnd(new Battle.Battle({ support: supportOf(F), fate: true, world: new World.World({ seed: u.map, biome: u.biome }), seed: u.seed, cfg, lookup, skill: u.skill, cond: 'day', mission: 'hold', waves: u.waves, commander: 'auto', raid: F.raid, force: F.force, crewQuality: 'trained', crewStress: true })); };
const hole = s => /NaN|undefined|Infinity|null/.test(s);
const save = (name, svg) => { if (OUT) fs.writeFileSync(path.join(OUT, name + '.svg'), svg); };
const textCheck = (tag, st, B) => { let text = ''; try { text = st.text({ b: B, inAir: 1 }); } catch (e) { fail(tag, 'text threw', e.message); } if (!text || /undefined|NaN|null|—|Infinity/.test(text)) fail(tag, 'text has a hole:', text); if (text.length > 470) fail(tag, 'text too long', text.length); return text; };

// ---- 1. one engagement, step by step ---------------------------------------------------------------------------------------------
{
  const B = fight(AIM_SETUP), D = findAim(B, HK);
  if (!D) { fail('aim', 'the battle no longer holds a lone Kornet cut by HKOI'); }
  else {
    // the record, read directly
    const v = B.volleys[D.id.v], rec = v.rec, th = rec.threats.find(o => o.idx === D.id.idx), b = rec.bursts.find(q => q.idx === th.idx && q.kind === 'obs'), c = v.cfg;
    nChk++; if (rec.threats.some(o => o !== th && o.t0 < th.impact && o.impact > th.t0)) fail('aim', 'another threat is in the air during the engagement');
    nChk++; if (th.key !== 'kornet' || th.defeated_by !== 'hkoi_cut' || th.cue_src !== 'lwr' || th.acq_src !== 'cued') fail('aim', 'not a Kornet warned by the laser warner, cued radar, cut by HKOI', th.key, th.defeated_by, th.cue_src, th.acq_src);
    nChk++; if (!(th.R >= 2000 && th.R <= 4000)) fail('aim', 'launch range outside 2 to 4 km', th.R);
    eq('battle time of the volley', D.T0, v.t0); eq('launch range', D.R, th.R); eq('missile speed', D.speed, th.v); eq('flight time', D.flight, th.impact - th.t0);
    eq('bearing', D.brg, ((th.brg % 360) + 360) % 360);
    eq('warning time', D.warn.t, th.cue); eq('warning distance', D.warn.d, th.cue_d); eq('warner bearing setting', D.warn.sigma, c.lwr.bearing_sigma_deg); eq('warner half range', D.warn.half, c.lwr.beam_rider_range_km_half);
    eq('radar acquisition', D.radar.tAcq, th.acq); eq('radar track', D.radar.tTrack, th.track); eq('track range', D.radar.dTrack, th.R - th.v * (th.track - th.t0)); eq('time to impact at track', D.radar.tti, th.impact - th.track);
    eq('track set-up time', D.radar.init, c.fc.ai ? c.fc.ai_init_s : c.radar.track_init_s); eq('own search time', D.radar.search, c.radar.search_s);
    eq('the radar was sent down the bearing: found 0.15 s after the warning (engine rule)', D.radar.tAcq - D.warn.t, 0.15, 1e-6);
    eq('track = acquisition + set-up', D.radar.tTrack - D.radar.tAcq, D.radar.init, 1e-9);
    nChk++; if (c.radar.mode !== 'continuous' || D.radar.mode !== 'continuous') fail('aim', 'the text says the radar scans all the time; the battle has it', c.radar.mode);
    const cand = rec.cands.find(q => q.idx === th.idx);
    eq('planned meeting distance', D.plan.want, cand.want); eq('planned meeting distance is the trial table best', D.plan.want, B.lookup.kornet.best_m); eq('table rating', D.plan.p, cand.p);
    const k = rec.ctx.k, v0 = c.rnd.muzzle_v, tof = Math.expm1(k * cand.want) / (k * v0);
    eq('round time of flight to the meet', D.plan.tof, tof);
    eq('first round fired', D.plan.tF, b.rounds[0].t_fire); eq('missile distance when the gun fires', D.plan.dFire, th.R - th.v * (b.rounds[0].t_fire - th.t0));
    eq('the gun fired on the plan: missile at meet + its flight during the round flight', D.plan.dFire, cand.want + th.v * tof, 3);
    eq('actual meet', D.plan.meet, b.rounds[0].d); eq('actual meet is the planned one', D.plan.meet, cand.want, 15);
    eq('wait for the moment', D.plan.wait, Math.max(0, b.rounds[0].t_fire - (th.track + c.gun.fc_latency_s + c.fc.human_approval_s)));
    eq('round gap', D.plan.gap, 60 / c.gun.rof_rpm);
    eq('rounds', D.n, b.rounds.length); eq('first burst', D.nFirst, b.rounds.filter(r => !r.extra).length); eq('sustain', D.nExtra, b.rounds.filter(r => r.extra).length);
    eq('proximity blooms', D.nBloom, b.rounds.filter(r => r.fate === 'bloom').length); eq('time-fuzed', D.nCo, b.rounds.filter(r => r.fate === 'colocated' || r.fate === 'sustain').length); eq('flew on', D.nDown, b.rounds.filter(r => r.fate === 'downrange').length);
    D.rounds.forEach((r, i) => { eq(`round ${i + 1} fired`, r.tFire, b.rounds[i].t_fire); eq(`round ${i + 1} meets`, r.d, b.rounds[i].d); });
    eq('puffs', D.puffs.length, b.puffs.length); D.puffs.forEach((p, i) => { eq(`puff ${i + 1} forms`, p.ta, b.t_ref + b.puffs[i].tf); eq(`puff ${i + 1} x`, p.x, b.puffs[i].x); });
    eq('payload', D.payload, c.rnd.payload_g); eq('puff size', D.s0, c.obs.sigma0_m); eq('lock threshold', D.need, b.tau_need);
    eq('cut time', D.cut.t, b.res.t_cut); eq('cut distance', D.cut.d, b.res.sever); eq('cut time is the battle\'s', D.cut.t, th.viz.sever.t);
    eq('end', D.end.t, th.viz.end.t); eq('miss', D.end.miss, b.res.miss_m);
    nChk++; if (D.end.type === 'ground' ? !(D.end.short > 0) : b.res.outcome !== 'drift_miss') fail('aim', 'the ending is not what the text says', D.end.type, b.res.outcome);
    // the engine's own order of things
    const seq = [['launch', D.tL], ['warning', D.warn.t], ['radar', D.radar.tAcq], ['track', D.radar.tTrack], ['fire', D.plan.tF], ['overtake', D.rounds[0].tPass], ['bloom', D.tFirstPuff], ['cut', D.cut.t], ['end', D.end.t]];
    for (let i = 1; i < seq.length; i++) { nChk++; if (!(seq[i][1] > seq[i - 1][1])) fail('aim', `${seq[i][0]} is not after ${seq[i - 1][0]}`, seq[i][1], seq[i - 1][1]); }
    nChk++; if (!(D.tauS.some(q => q[0] >= D.cut.t - 0.15 && q[1] >= 0.6 * D.need))) fail('aim', 'the optical depth samples do not climb toward the threshold before the cut');
    // every event the engine logged for this threat lies inside the timeline
    for (const e of D.events) { nChk++; if (e.t < D.tL - 1e-6 || e.t > D.end.t + 15) fail('aim', 'event outside the time line', e.t, e.text); }
    // the steps: in order, each inside the battle, each text whole, and each diagram drawn at its start, middle and end
    const steps = aimSteps(D); let prev = -1;
    steps.forEach((st, i) => { const tag = `aim step ${i + 1} (${st.key})`; textCheck(tag, st, B);
      nChk++; if (!(st.from <= st.to && st.from >= 0)) fail(tag, 'times', st.from, st.to);
      nChk++; if (st.from < prev - 3) fail(tag, 'goes back in time', st.from, prev); prev = st.from;
      for (const u of [st.from, (st.from + st.to) / 2, st.to]) { const svg = aimSVG(D, u, { focus: st.diagram.focus }); if (hole(svg)) fail(tag, 'diagram has a hole at', u.toFixed(2)); }
      save(`aim_${i + 1}_${st.key}`, aimSVG(D, st.to, { focus: st.diagram.focus })); });
    // the stage the diagram shows at the end of each step
    const want = { launch: 0, warn: 1, radar: 3, plan: 3, burst: 5, bloom: 5, cut: 7 };
    steps.forEach(st => { nChk++; const g = aimStage(D, st.to - D.T0); if (want[st.key] != null && g !== want[st.key]) fail(`aim step ${st.key}`, 'diagram stage at its end', g, 'expected', want[st.key]); });
    for (let u = D.T0 + D.tL - 0.5; u < D.T0 + D.end.t + 0.8; u += 0.05) if (hole(aimSVG(D, u, {}))) { fail('aim diagram hole at', u); break; }
    // the steps' wording against the record (the words that carry a number)
    const txt = Object.fromEntries(steps.map(st => [st.key, st.text()]));
    const has = (k, s) => { nChk++; if (!txt[k].includes(s)) fail(`aim step ${k}`, 'does not say', JSON.stringify(s), '|', txt[k]); };
    has('launch', (th.R / 1000).toFixed(2) + ' km'); has('warn', (th.cue - th.t0).toFixed(2) + ' s'); has('warn', (th.cue_d / 1000).toFixed(2) + ' km');
    has('radar', ((th.R - th.v * (th.track - th.t0)) / 1000).toFixed(2) + ' km'); has('radar', (Math.round((th.impact - th.track) * 10) / 10).toFixed(1) + ' s to impact');
    has('plan', Math.round(cand.want).toLocaleString('en-GB') + ' m'); has('plan', (Math.round(tof * 100) / 100).toFixed(2) + ' s');
    has('burst', `${b.rounds.filter(r => r.extra).length} more`); has('cut', Math.round(b.res.sever).toLocaleString('en-GB') + ' m');
    has('cut', D.end.type === 'ground' ? Math.round(b.res.short).toLocaleString('en-GB') + ' m short' : (Math.round(b.res.miss_m * 10) / 10).toFixed(1) + ' m wide');
    console.log(`ok   aim: ${D.name} from ${(D.R / 1000).toFixed(2)} km, volley at ${D.T0.toFixed(1)} s; warning +${D.warn.dt.toFixed(2)} s, track +${(D.radar.tTrack - D.tL).toFixed(2)} s, fire +${(D.plan.tF - D.tL).toFixed(2)} s, meet ${Math.round(D.plan.meet)} m, ${D.n} rounds, cut +${D.cut.dt.toFixed(2)} s at ${Math.round(D.cut.d)} m, ${D.end.type === 'ground' ? 'ground ' + Math.round(D.end.short) + ' m short' : 'missed by ' + D.end.miss.toFixed(1) + ' m'}`);
    // the overview and the commander's picture from the same battle
    const L = layerFacts(B, HK); for (const [k, x] of Object.entries(L)) { nChk++; if (x == null || Number.isNaN(x)) fail('layers', k, 'is missing'); }
    eq('layers: radar reference', L.radarRef, c.radar.acq_range_ref_m); eq('layers: Trophy shots a side', L.aps0, c.aps.mag_per_side); eq('layers: Kornet best meet', L.kornetBest, B.lookup.kornet.best_m);
    for (const f of ['all', 'sense', 'cloud', 'air', 'trophy', 'none']) { const svg = layerSVG(L, f); if (hole(svg)) fail('layer diagram hole', f); if (f === 'all') save('layers', svg); }
    const K = cdrFacts(B, D.T0 + D.tL - 1.2); if (!K) fail('cdr', 'no commander picture before the launch'); else { const C = B.commanderAt(D.T0 + D.tL - 1.2); eq('cdr belief radius', K.r, C.picture.r_m); eq('cdr report age', K.age, C.picture.age); const svg = cdrSVG(K, { tank: { e: B.tank.e, n: B.tank.n }, units: B.units }); if (hole(svg)) fail('cdr diagram hole'); save('cdr', svg); }
  }
}
// ---- 2. many at once ---------------------------------------------------------------------------------------------------------------
{
  const B = fight(ORDER_SETUP), O = findOrder(B, HK);
  if (!O) fail('order', 'no volley with several threats, a cut and a Trophy hand-off');
  else {
    const v = B.volleys[O.id.v], rec = v.rec;
    eq('threats in the volley', O.n, rec.threats.length); nChk++; if (O.n < 4) fail('order', 'fewer than four at once', O.n);
    // the gun's order is the order of the record's bursts
    const seen = []; for (const b of rec.bursts.filter(q => q.idx >= 0 && q.rounds && q.rounds.length).sort((a, b) => a.tf - b.tf)) if (!seen.includes(b.idx)) seen.push(b.idx);
    nChk++; if (JSON.stringify(O.gunOrder.map(r => r.idx)) !== JSON.stringify(seen)) fail('order', 'gun order', O.gunOrder.map(r => r.idx), 'record', seen);
    // most urgent first: the threat the gun took first is due before every other one it fired at
    nChk++; if (O.gunOrder.some(r => r.impact < O.gunOrder[0].impact - 1e-9)) fail('order', 'the first one engaged is not the most urgent of those engaged');
    for (const r of O.rows) { const th = rec.threats.find(o => o.idx === r.idx);
      eq(`#${r.idx + 1} range`, r.R, th.R); eq(`#${r.idx + 1} launch`, r.t0, th.t0); eq(`#${r.idx + 1} impact`, r.impact, th.impact);
      nChk++; if ((r.by || null) !== (th.defeated_by || null)) fail('order', `#${r.idx + 1} defeated by`, r.by, th.defeated_by);
      eq(`#${r.idx + 1} Trophy shots`, r.aps.length, (rec.aps || []).filter(q => q.idx === r.idx).length);
      // the reason given matches the engine's tags
      const tags = th.tags || [], w = orderWhy(r);
      if (/handed/.test(w)) { nChk++; if (!tags.includes('handed_to_aps')) fail('order', `#${r.idx + 1} said handed to Trophy, tags`, tags); }
      if (/unguided/.test(w)) { nChk++; if (!tags.includes('unguided_ignored')) fail('order', `#${r.idx + 1} said unguided, tags`, tags); }
      if (/too thin/.test(w)) { nChk++; if (!tags.includes('cloud_thin')) fail('order', `#${r.idx + 1} said cloud too thin, tags`, tags); }
      if (/cut/.test(w)) { nChk++; if (th.defeated_by !== 'hkoi_cut') fail('order', `#${r.idx + 1} said cut`); } }
    eq('Trophy shots in the volley', O.apsUsed, (rec.aps || []).length);
    const steps = orderSteps(O);
    steps.forEach((st, i) => { const tag = `order step ${i + 1} (${st.key})`; textCheck(tag, st, B);
      nChk++; if (!(st.from <= st.to && st.from >= 0 && (st.to - st.from) / st.rate <= 24)) fail(tag, 'times', st.from, st.to);
      for (const u of [st.from, (st.from + st.to) / 2, st.to]) if (hole(orderSVG(O, u, { all: st.diagram.all }))) fail(tag, 'diagram hole at', u);
      save(`order_${i + 1}_${st.key}`, orderSVG(O, st.to, { all: st.diagram.all })); });
    console.log(`ok   order: ${O.n} threats in ${O.spread.toFixed(1)} s at ${O.T0.toFixed(1)} s; gun order ${O.gunOrder.map(r => r.label).join(', ')}; Trophy ${O.apsUsed}; ${O.rows.map(r => `${r.label}: ${orderWhy(r)}`).join('; ')}`);
  }
}
console.log(bad ? `TARGETING TESTS FAILED: ${bad} of ${nChk} checks` : `TARGETING TESTS PASS (${nChk} checks against the battle record)`);
process.exit(bad ? 1 : 0);
