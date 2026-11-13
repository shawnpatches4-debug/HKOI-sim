// ================================================================ credibility: measured data, confidence notes, assumption-stress runs, verification checks, reproducibility
// ---- measured data: replace assumed cloud and laser-warner numbers with test results; every result made with them is labelled
const MEAS = { data: null,
  keys: { cloud_blocking_m2_per_g: ['obs', 'alpha_m2_per_g', 1, 'Blocking power at 1.06 μm'], cloud_radius_at_burst_m: ['obs', 'sigma0_m', 1, 'Cloud size and spreading'], cloud_spread_m2_per_s: ['obs', 'eddy_K_m2s', 1, 'Cloud size and spreading'],
    obscurant_per_round_g: ['rnd', 'payload_g', 1, 'Obscurant per round'], lock_break_optical_depth: ['obs', 'tau_lock_margin', 2.303, 'Lock-break threshold'], cloud_form_time_s: ['obs', 'form_s', 1, 'Cloud size and spreading'],
    lwr_detect_probability: ['lwr', 'pd_ref', 1, 'Laser warner'], lwr_half_range_km: ['lwr', 'beam_rider_range_km_half', 1, 'Laser warner'], lwr_bearing_sigma_deg: ['lwr', 'bearing_sigma_deg', 1, 'Laser warner'],
    fuze_radius_m: ['rnd', 'fuze_radius_m', 1, 'Proximity fuze'], fuze_reliability: ['rnd', 'fuze_reliability', 1, 'Proximity fuze'], gun_dispersion_mrad: ['gun', 'dispersion_mrad', 1, 'Dispersion'], enemy_gunner_jitter_mrad: ['enemy', 'gunner_jitter_mrad', 1, 'Enemy gunner jitter'] },
  template: 'parameter,value,source\n# Delete the lines you have no data for. Keep the parameter names exactly as written.\ncloud_blocking_m2_per_g,0.85,"chamber test, date, report number"\ncloud_radius_at_burst_m,2.0,"live burst test"\ncloud_spread_m2_per_s,2.0,"live burst test"\ncloud_form_time_s,0.3,"live burst test"\nobscurant_per_round_g,40,"shell design"\nlock_break_optical_depth,2.0,"seeker bench test"\nlwr_detect_probability,0.95,"range test"\nlwr_half_range_km,4,"range test"\nlwr_bearing_sigma_deg,8,"datasheet"\nfuze_radius_m,5,"fuze test"\nfuze_reliability,0.97,"fuze test"\ngun_dispersion_mrad,2,"firing table"\nenemy_gunner_jitter_mrad,3,"tracking data"' };
function parseMeasured(text) { const out = {}, errs = []; for (const raw of String(text || '').split(/\r?\n/)) { const line = raw.trim(); if (!line || line[0] === '#' || /^parameter\s*,/i.test(line)) continue; const m = line.match(/^([a-z0-9_]+)\s*,\s*([-+0-9.eE]+)\s*(?:,\s*(.*))?$/); if (!m) { errs.push(`Could not read: "${line.slice(0, 60)}"`); continue; }
    const k = m[1], v = +m[2]; if (!MEAS.keys[k]) { errs.push(`Unknown parameter: ${k}`); continue; } if (!isFinite(v) || v < 0) { errs.push(`Bad value for ${k}`); continue; } out[k] = { v, src: (m[3] || '').replace(/^"|"$/g, '').trim() || 'no source given' }; } return { out, errs }; }
function applyMeasured(c) { if (!MEAS.data) return c; c.measured = {}; for (const k in MEAS.data) { const [sec, f, mul, row] = MEAS.keys[k]; if (c[sec]) { c[sec][f] = MEAS.data[k].v * mul; c.measured[row] = (c.measured[row] ? c.measured[row] + '; ' : '') + `${k.replace(/_/g, ' ')} = ${MEAS.data[k].v} (${MEAS.data[k].src})`; } } return c; }
// ---- confidence note for each row of the assumptions table
const CONF = { 'Gun': ['High', 'Published by the maker'], 'Muzzle velocity': ['High', 'Published for the round family'], 'Dispersion': ['Medium', 'Spec figure, not yet fired from this mount'], 'Burst': ['Medium', 'A design choice the sim can vary'], 'Belt': ['Medium', 'A design choice; weight and feed not yet engineered'],
  'Obscurant per round': ['Low', 'No shell design exists yet'], 'Blocking power at 1.06 μm': ['Medium', 'Lab literature for the material, not for a burst from this shell'], 'Lock-break threshold': ['Low', 'No seeker bench data'], 'Cloud size and spreading': ['Low', 'No live burst data; among the inputs that move the result most'],
  'Kornet-class missile': ['Medium', 'Open-source averages'], 'Vikhr-class missile': ['Medium', 'Open-source averages'], 'Laser warner': ['Low', 'Range against a weak guidance beam is unmeasured'], 'Fire-control radar': ['Low', 'Assumed fire-control grade, no unit selected'], 'Proximity fuze': ['Medium', 'By analogy with a fielded fuze'],
  'Missile after the cut': ['Low', 'No flight data for a blinded missile'], 'APS': ['Medium', 'Magazine from open sources, kill chances assumed'], 'Crew': ['Low', 'Illustrative behaviour model, not measured'], 'Costs': ['Medium', 'Order-of-magnitude open figures'],
  'Enemy gunner jitter': ['Medium', 'Designer’s data for a mounted launcher; the source should be cited beside it. Moves every survival number'], 'Vehicle target size': ['High', 'Published dimensions'], 'Airburst HE against drones': ['Low', 'Assumed kill chance and drone evasion'], 'Radar tracks at once': ['Low', 'Assumed'], 'Enemy tank duel': ['Low', 'Illustrative gunnery model'], 'Platoon shared fire': ['Low', 'Simple reach and free-gun rule'] };
function credRows(c) { return [
  ['Enemy gunner jitter', `${c.enemy.gunner_jitter_mrad || 0} mrad (1-sigma): half slow wander, half 8–12 Hz tremor`, 'asm', 'Designer’s data, measured on a mounted launcher. At this value many missiles miss with no protection, so compare with a lower value before quoting a result'],
  ['Vehicle target size', `${(c.vehicle.half_w * 2).toFixed(1)} m wide, ${((c.vehicle.half_len || c.vehicle.half_w) * 2).toFixed(1)} m long, ${(c.vehicle.half_h * 2).toFixed(1)} m high`, 'open', 'M1-class dimensions; a flank shot sees the length'],
  ['Airburst HE against drones', `${pct0(c.rnd.he_pk_drone)} per burst at short range, falling as the drone jinks (${c.enemy.drone_jink_g} g); opens fire at about 800 m`, 'asm', 'Open-fire range chosen by study: 800 m beat 1,000–1,500 m'],
  ['Radar tracks at once', `${c.radar.max_tracks}`, 'asm', 'Limits how much of a large wave is engaged'],
  ['Enemy tank duel', c.duel && c.duel.on ? `on, ${(c.duel.R / 1000).toFixed(1)} km` : 'off', 'asm', 'Lay time, reload and hit chance worsen with each inbound missile the crew is tracking'],
  ['Platoon shared fire', 'Sandbox only: a free HKOI gun within 600 m shoots airburst HE for a neighbour', 'asm', 'No shared obscurant shots; smoke blocking between tanks is measured but not fed back'],
]; }
// ---- one-click assumption stress: the same raids again with one critical assumption 30% worse
const STRESS = [
  ['Fill blocks 30% less light', c => { c.obs.alpha_m2_per_g *= .7; }], ['30% less obscurant in each round', c => { c.rnd.payload_g *= .7; }], ['Cloud spreads and thins 30% faster', c => { c.obs.eddy_K_m2s *= 1.3; }],
  ['Seeker needs a 30% thicker cloud to lose lock', c => { c.obs.tau_lock_margin *= 1.3; }], ['Missile finds its beam again 30% sooner', c => { c.drift.reacquire_s *= .7; c.drift.recapture_min_m *= .7; }],
  ['Laser warner sees the beam at 30% less range', c => { c.lwr.beam_rider_range_km_half *= .7; }], ['Laser warner detects 30% less often', c => { c.lwr.pd_ref *= .7; }], ['Radar picks missiles up at 30% less range', c => { c.radar.acq_range_ref_m *= .7; }],
  ['Radar track 30% less accurate', c => { c.radar.track_mrad *= 1.3; }], ['Fire control reacts 30% slower', c => { c.gun.fc_latency_s *= 1.3; c.radar.track_init_s *= 1.3; }], ['Gun scatters rounds 30% wider', c => { c.gun.dispersion_mrad *= 1.3; }],
  ['Fuze triggers at 30% less range', c => { c.rnd.fuze_radius_m *= .7; }], ['Fuze fails 30% more often', c => { c.rnd.fuze_reliability = 1 - (1 - c.rnd.fuze_reliability) * 1.3; }], ['Airburst kills drones 30% less often', c => { c.rnd.he_pk_drone *= .7; }],
  ['Trophy kills 30% less often', c => { c.aps.pk_cued *= .7; c.aps.pk_uncued *= .7; }], ['Enemy gunner 30% steadier', c => { c.enemy.gunner_jitter_mrad *= .7; }],
];
let stressBusy = false;
async function runStress() {
  if (stressBusy || !LAST) return; stressBusy = true; const btn = $('#stressBtn'), st = $('#stressStatus'), base = JSON.parse(JSON.stringify(LAST.cfg)), n = Math.min(800, base.missions); btn.disabled = true;
  const p0 = await sensRun(JSON.parse(JSON.stringify(base)), n), rows = [];
  for (let i = 0; i < STRESS.length + 1; i++) { st.textContent = `Re-running the same ${n} raids: ${i + 1} of ${STRESS.length + 1}…`; const c = JSON.parse(JSON.stringify(base)); let label;
    if (i < STRESS.length) { label = STRESS[i][0]; STRESS[i][1](c); } else { label = 'Everything above at once'; for (const s of STRESS) s[1](c); }
    rows.push({ label, p: await sensRun(c, n), all: i === STRESS.length }); drawStress(rows, p0, n); }
  st.textContent = `${n.toLocaleString()} raids per run, the same enemy launches each time. With HKOI ${base.hkoi_enabled ? 'fitted' : 'not fitted'}.`; stressBusy = false; btn.disabled = false;
}
function drawStress(rows, p0, n) { const noise = 1.96 * Math.sqrt(2 * Math.max(p0 * (1 - p0), .01) / n) * 100 * .6, rs = rows.filter(r => !r.all).sort((a, b) => a.p - b.p).concat(rows.filter(r => r.all));
  $('#stressTable').innerHTML = `<tr><th>Assumption made worse</th><th>Survival</th><th>Change</th><th></th></tr><tr><td><b>As configured</b></td><td><b>${(p0 * 100).toFixed(1)}%</b></td><td></td><td></td></tr>` + rs.map(r => { const d = (r.p - p0) * 100, big = Math.abs(d) > noise;
    return `<tr${r.all ? ' class="st-all"' : ''}><td>${r.label}</td><td>${(r.p * 100).toFixed(1)}%</td><td class="${d < -noise ? 'bad' : d > noise ? 'good' : ''}">${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pts${big ? '' : ' <span class="cap">(within noise)</span>'}</td><td><span class="st-bar" style="width:${Math.min(160, Math.abs(d) * 6).toFixed(0)}px;background:${d < 0 ? 'var(--laser)' : 'var(--good)'}"></span></td></tr>`; }).join('');
  $('#stressNote').textContent = `Changes smaller than about ${noise.toFixed(1)} points are run-to-run noise at this raid count.`; }
// ---- verification checks: rules every simulated raid must obey, run on a sample after every batch
function verifyRun() {
  if (!LAST) return; const c = JSON.parse(JSON.stringify(LAST.cfg)), N = 40, F = {}, fail = (k, msg) => { (F[k] = F[k] || []).push(msg); };
  const RULES = [['outcome', 'Every threat ends exactly once, after it was launched'], ['track', 'HKOI never fires at a threat before the radar is tracking it'], ['ammo', 'Rounds fired never exceed the magazines'], ['aps', 'Trophy never fires more interceptors than it carries on a side'],
    ['hits', 'The hit count equals the threats that ended in a hit, and the vehicle is only destroyed by a killing hit'], ['cut', 'A beam is only cut after a cloud has been fired at that missile, or by the crew’s smoke'], ['time', 'No event happens before time zero or after the end of the raid'], ['repeat', 'The same seed replays to the identical raid'], ['prob', 'Batch probabilities lie between 0 and 1 and survival plus loss equals 1']];
  let first = null;
  for (let i = 0; i < N; i++) { const rec = { events: [], bursts: [], aps: [], ctx: { hull: 0 } }; try { HK.runMission(c, new HK.RNG(HK.seedFor(c.seed, i)), LAST.lookup, rec); } catch (e) { fail('outcome', `raid ${i}: ${e.message}`); continue; }
    for (const th of rec.threats) { const e = th.viz.end; if (!e || !(e.t >= th.t0 - 1e-6)) fail('outcome', `raid ${i} threat ${th.idx + 1}`); if (th.viz.sever && !th.viz.sever.smoke && !rec.bursts.some(b => b.idx === th.idx && b.tf <= th.viz.sever.t + 1e-6) && !th.tags.includes('cut_by_leader_cloud')) fail('cut', `raid ${i} threat ${th.idx + 1}`); }
    let obs = 0, he = 0; for (const b of rec.bursts) { const nr = (b.rounds || []).length; if (b.kind === 'he') he += nr; else obs += b.kind === 'false' ? c.gun.burst : nr; if (b.idx >= 0) { const th = rec.threats[b.idx]; if (th && (th.track == null || b.tf < th.track - 1e-6)) fail('track', `raid ${i} burst at ${b.tf.toFixed(2)} s`); } }
    if (obs > c.gun.obscurant_rounds || he > c.gun.he_rounds) fail('ammo', `raid ${i}: ${obs} obscurant, ${he} HE`);
    for (const sd of ['L', 'R']) if (rec.aps.filter(a => a.side === sd).length > c.aps.mag_per_side) fail('aps', `raid ${i} side ${sd}`);
    const nh = rec.threats.filter(o => o.viz.end && o.viz.end.type === 'hit').length; if (nh !== rec.hits || (rec.killed && !rec.threats.some(o => o.viz.end.type === 'hit' && o.viz.end.killing))) fail('hits', `raid ${i}`);
    if (rec.events.some(e => e.t < -1e-6 || e.t > rec.t_end + 1e-6)) fail('time', `raid ${i}`);
    if (i === 0) first = JSON.stringify(rec.threats.map(o => [o.viz.end.type, +o.viz.end.t.toFixed(4)])); }
  { const rec = { events: [], bursts: [], aps: [], ctx: { hull: 0 } }; HK.runMission(c, new HK.RNG(HK.seedFor(c.seed, 0)), LAST.lookup, rec); if (JSON.stringify(rec.threats.map(o => [o.viz.end.type, +o.viz.end.t.toFixed(4)])) !== first) fail('repeat', 'raid 0 differed on replay'); }
  for (const k of ['main', 'aps', 'none']) { const r = LAST.res[k]; if (!r) continue; if (!(r.P_survive >= 0 && r.P_survive <= 1) || Math.abs(r.P_survive + (r.killed || 0) - 1) > 1e-9) fail('prob', k); }
  const bad = Object.keys(F).length;
  $('#verifyList').innerHTML = RULES.map(([k, t]) => `<li class="${F[k] ? 'vf-bad' : 'vf-ok'}"><b>${F[k] ? 'FAIL' : 'PASS'}</b> ${t}${F[k] ? ` <span class="cap">(${F[k].length} case${F[k].length > 1 ? 's' : ''}, first: ${F[k][0]})</span>` : ''}</li>`).join('');
  $('#verifyStatus').textContent = `${RULES.length - bad} of ${RULES.length} rules pass on a sample of ${N} raids from this batch (seed ${c.seed}).`; $('#verifyStatus').className = 'cap ' + (bad ? 'bad' : 'good');
  const chip = $('#verifyChip'); if (chip) { chip.textContent = bad ? `${bad} check${bad > 1 ? 's' : ''} failing` : `${RULES.length} checks pass`; chip.className = 'vchip ' + (bad ? 'bad' : 'ok'); }
}
// ---- reproducibility: everything needed to run this exact result again
function reproText() { if (!LAST) return ''; const d = HK.defaultConfig(), c = LAST.cfg, diff = {}; for (const sec in c) { if (c[sec] && typeof c[sec] === 'object' && !Array.isArray(c[sec]) && d[sec]) { for (const k in c[sec]) if (JSON.stringify(c[sec][k]) !== JSON.stringify(d[sec][k])) (diff[sec] = diff[sec] || {})[k] = c[sec][k]; } else if (JSON.stringify(c[sec]) !== JSON.stringify(d[sec])) diff[sec] = c[sec]; }
  const r = LAST.res, ci = p => (1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-6) / c.missions) * 100).toFixed(1);
  return JSON.stringify({ simulator: 'HKOI mission simulator v18', seed: c.seed, raids: c.missions, scenario: LAST.scen, design: LAST.design, measured_data: !!c.measured, result: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${(v.P_survive * 100).toFixed(1)}% survive, plus or minus ${ci(v.P_survive)} points`])), settings_changed_from_default: diff }, null, 1); }
function credAfterRun() { try { verifyRun(); } catch (e) { $('#verifyStatus').textContent = 'Checks could not run: ' + e.message; } const rp = $('#reproText'); if (rp) rp.value = reproText(); const mb = $('#measBadge'); if (mb) mb.hidden = !LAST.cfg.measured; }
function credInit() {
  $('#measText').value = MEAS.template;
  $('#measApply').addEventListener('click', () => { const { out, errs } = parseMeasured($('#measText').value), n = Object.keys(out).length; if (errs.length) { $('#measStatus').textContent = errs.slice(0, 3).join(' · '); $('#measStatus').className = 'cap bad'; return; }
    MEAS.data = n ? out : null; $('#measStatus').textContent = n ? `${n} measured value${n > 1 ? 's' : ''} loaded. Press Run: results will be labelled “measured data”.` : 'No values found.'; $('#measStatus').className = 'cap ' + (n ? 'good' : ''); markStale(); });
  $('#measClear').addEventListener('click', () => { MEAS.data = null; $('#measText').value = MEAS.template; $('#measStatus').textContent = 'Back to the assumed values. Press Run.'; $('#measStatus').className = 'cap'; markStale(); });
  $('#stressBtn').addEventListener('click', runStress); $('#verifyBtn').addEventListener('click', verifyRun);
  $('#reproCopy').addEventListener('click', () => { const t = $('#reproText'); t.select(); const done = () => { $('#reproMsg').textContent = 'Copied.'; }, fb = () => { $('#reproMsg').textContent = 'Select the text and copy it.'; }; try { navigator.clipboard.writeText(t.value).then(done, fb); } catch (e) { fb(); } });
}

