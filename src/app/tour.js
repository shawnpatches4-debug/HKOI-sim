// The HKOI briefing, the Scenarios page and the first-run help: the parts of the page that explain the simulator to a newcomer.
//
// THE BRIEFING is a guided demonstration in chapters. Nothing in it is staged. Each chapter loads a real battle (a battle is fully
// decided by its settings and seed), finds the moment it wants in that battle's own record (CHAPTERS[i].find), and then drives
// the page's own replay machinery: jump to a time, play at a chosen rate, stop at the instant that matters. The camera is placed
// by the film director's rigs (director.film), and labels with leader lines are laid over the real objects: the missile, its
// launcher, the cloud, the weapon station. Every number in the text is read from the battle record or from the engine's settings;
// where a setting is an assumption the text says "assumed".
//
// The first half of this file (CHAPTERS and what they need) uses no page and no drawing, so `node tests/app/tour.test.mjs`
// fights every chapter's battle and checks that each moment still exists and each sentence still reads. The second half is
// the page: Guide (made once by main.js), Briefing, Help.
//
// Frame rate: the simulation is advanced by the page as always; this file only reads battle time. The only things it animates
// are label positions (a function of where the objects are this frame) and nothing else, so it looks the same at any frame rate.
import { ScenarioPage, SCENARIOS } from './scenarios.js';
import { AIM_SETUP, ORDER_SETUP, findAim, findOrder, layerFacts, cdrFacts, aimSteps, orderSteps, aimSVG, orderSVG, layerSVG, cdrSVG, aimTimeAt, AIM_W, AIM_H } from './targeting.js';

const S = (biome, map, force, skill, waves, seed) => ({ biome, map, force, skill, waves, seed });
const TOWN = S('town', 6, 'ambush', 'trained', 3, 2), FARM = S('farmland', 6, 'drones', 'trained', 1, 1), DESERT = S('desert', 6, 'heavy', 'trained', 3, 2);
const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
const NAME = { kornet: 'Kornet', vikhr: 'Vikhr', saclos: 'Konkurs', sal: 'laser-homing missile', fpv: 'FPV drone', fpv_fiber: 'fibre-optic FPV drone', rpg: 'RPG', ir: 'infrared missile', ke: 'tank round' };
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = n => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n)), Word = n => { const s = word(n); return s.charAt(0).toUpperCase() + s.slice(1); };
const km = m => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m');
const s1 = x => (Math.round(x * 10) / 10).toFixed(1), cap = s => s.charAt(0).toUpperCase() + s.slice(1), pl = (n, one, many) => (n === 1 ? one : many || one + 's');
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const list = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const CREW = { cdr: 'commander', gnr: 'gunner', ldr: 'loader', drv: 'driver' };

// ---- reading a finished battle ------------------------------------------------------------------------------------------------
function each(B, fn) { for (const v of B.volleys) for (const th of v.rec.threats) { const r = fn(v, th); if (r) return r; } return null; }
const bursts = (v, th, obs) => v.rec.bursts.filter(b => b.idx === th.idx && (b.kind === 'obs') === obs && b.rounds && b.rounds.length).sort((p, q) => p.rounds[0].t_fire - q.rounds[0].t_fire);
const distAt = (th, t) => Math.max(0, th.R - th.v * (t - th.t0));   /* the engine's own rule (HK.distAt): distance from the vehicle at volley time t */
const ident = (v, th) => ({ v: v.i, idx: th.idx, uid: th.uid, brg: th.brg, R: th.R, key: th.key });
// the engine settings the text quotes, read from the battle's own configuration (never typed in here)
function settings(B) {
  const c = (B.volleys[0] && B.volleys[0].cfg) || B.cfg0 || {}, g = c.gun || {}, r = c.rnd || {}, a = c.aps || {}, o = c.obs || {};
  return { payload: r.payload_g, form: o.form_s, obs0: g.obscurant_rounds, he0: g.he_rounds, gap: g.rof_rpm ? 60 / g.rof_rpm : null, hePk: r.he_pk_drone, saclos: o.saclos_effect, aps0: a.mag_per_side, apsR: a.radar_range_m };
}
// what ended the threats of a whole battle, in four heaps
function tally(B) {
  const s = B.summary(), by = s.by || {}, hkoi = (by.hkoi_cut || 0) + (by.hkoi_he || 0) + (by.neighbour_obs || 0) + (by.neighbour_he || 0), aps = by.aps || 0, hits = s.hits || 0;
  let thin = 0; for (const v of B.volleys) for (const b of v.rec.bursts) if (b.kind === 'obs' && b.res && b.res.reason === 'cloud_thin') thin++;
  // what became of the vehicle (src/battle/fate.js: the page fights every battle with it on): how it was lost, and since when it could not move
  const F = B.tank.fate, ev = (B.events || []).filter(e => !e.wing), stuck = ev.find(e => e.type === 'tank_fate' && e.kind === 'mobility_kill'), out = ev.filter(e => e.type === 'bail_out').length;
  const end = !s.alive && F && F.t != null ? { kind: F.kind, by: NAME[F.by] || F.by, t: F.t, out } : null;
  return { fired: s.fired, cut: by.hkoi_cut || 0, he: by.hkoi_he || 0, hkoi, aps, hits, miss: Math.max(0, s.fired - hkoi - aps - hits), thin, obs: s.obs, heLeft: s.he, apsL: s.apsL, apsR: s.apsR, t: s.t, alive: s.alive, result: B.over ? B.over.result : null, end, stuck: stuck ? stuck.t : null };
}
// how the vehicle was lost, in a few words ('' while it is not)
function endWords(e) {
  if (!e) return '';
  const who = e.out === 4 ? 'all four of the crew get out' : e.out ? `${word(e.out)} of the crew get out` : 'nobody gets out';
  return e.kind === 'catastrophic' ? `${clock(e.t)} in, a ${e.by} reaches the ammunition and the crew is lost` : e.kind === 'ammo_vented' ? `${clock(e.t)} in, a ${e.by} sets the turret ammunition burning; the blow-out panels vent it and ${who}` : `${clock(e.t)} in, a ${e.by} knocks it out and ${who}`;
}
// the calm moment before the targeting chapter's launch, and the settings the one-minute overview quotes
const A = (M, u) => M.T0 + u;
function findOverview(B, HK) { const D = findAim(B, HK); if (!D) return null; return { L: layerFacts(B, HK), calm: Math.max(0.5, D.T0 + D.tL - 6), D }; }
// the threat chapter tells the same shot as the targeting chapter, from the enemy's side, with his commander's picture just before launch
function findThreat(B, HK) { const D = findAim(B, HK); if (!D) return null; D.cdr = cdrFacts(B, D.T0 + D.tL - 1.2); return D; }
// drones: one shot down by its first airburst, and one that took several
function findDrones(B) {
  const mk = (v, th) => { const bs = bursts(v, th, false), end = th.viz.end; return { id: ident(v, th), t0: v.t0, tL: v.t0 + th.t0, tF: v.t0 + bs[0].rounds[0].t_fire, tK: v.t0 + end.t, d: end.d, n: bs.length, rounds: bs.reduce((k, b) => k + b.rounds.length, 0), first: bs[0].rounds.length, speed: th.v, name: NAME[th.key] || th.key, fibre: th.key === 'fpv_fiber' }; };
  const ok = (v, th) => /^fpv/.test(th.key) && th.defeated_by === 'hkoi_he' && th.viz.end.type === 'he_kill' && bursts(v, th, false).length > 0;
  const one = each(B, (v, th) => (ok(v, th) && bursts(v, th, false).length === 1 ? mk(v, th) : null)), multi = each(B, (v, th) => (ok(v, th) && bursts(v, th, false).length >= 2 ? mk(v, th) : null));
  if (!one) return null;
  return { one, multi, cfg: settings(B), all: tally(B) };
}
// what HKOI does not stop: a guided missile Trophy had to take, and an unguided rocket
function findLimits(B) {
  const mk = (v, th) => { const a = (v.rec.aps || []).find(q => q.idx === th.idx && q.kill) || {}, tags = th.tags || [];
    const why = th.skip && th.skip.why === 'min_range' ? 'min' : tags.includes('handed_to_aps') ? 'handed' : tags.includes('saclos_unaffected') ? 'saclos' : tags.includes('cloud_thin') ? 'thin' : th.key === 'rpg' ? 'rpg' : 'other';
    return { id: ident(v, th), t0: v.t0, tL: v.t0 + th.t0, tA: v.t0 + (a.t != null ? a.t : th.viz.end.t), side: a.side || 'R', d: th.viz.end.d, flight: th.viz.end.t - th.t0, R: th.R, why, name: NAME[th.key] || th.key }; };
  const guided = w => each(B, (v, th) => (th.defeated_by === 'aps' && (th.key === 'saclos' || th.key === 'kornet') && mk(v, th).why === w ? mk(v, th) : null));
  const close = guided('handed') || guided('min') || guided('saclos') || guided('thin') || guided('other');
  const rpg = each(B, (v, th) => (th.defeated_by === 'aps' && th.key === 'rpg' ? mk(v, th) : null));
  if (!close && !rpg) return null;
  return { close, rpg, cfg: settings(B), all: tally(B) };
}
// saturation: the biggest volley, the first hit on the vehicle and why nothing stopped it, and how the crew stood at the end
function findSaturation(B, HK) {
  let big = null; for (const v of B.volleys) if (!big || v.rec.threats.length > big.rec.threats.length) big = v;
  const mkHit = (v, th) => { const tags = th.tags || [], aps = (v.rec.aps || []).find(q => q.idx === th.idx);
    const hk = tags.includes('no_ammo') ? 'HKOI had no rounds of the right kind left for it' : tags.includes('unguided_ignored') || th.key === 'rpg' ? 'it is unguided, so HKOI held its fire' : tags.includes('handed_to_aps') ? 'it was launched too close for a cloud, so the fire control handed it to Trophy' : tags.includes('gun_busy') ? 'the gun was busy with another threat' : tags.includes('no_time') || tags.includes('min_range') ? 'there was no time for HKOI to engage it' : tags.includes('he_miss') ? 'HKOI\'s airbursts missed it' : tags.includes('drift_hit') ? 'HKOI cut its guidance too late to throw it off' : tags.includes('cloud_thin') ? 'HKOI\'s cloud was too thin to break its guidance' : tags.includes('saclos_unaffected') ? 'the cloud did not blind it' : th.viz.fired != null ? 'HKOI fired at it and did not stop it' : 'HKOI did not get a shot at it';
    const ap = tags.includes('aps_empty') ? 'Trophy had no shot left on that side' : tags.includes('aps_reset') ? 'Trophy on that side had fired a moment before and was not ready again' : aps ? (aps.kill ? 'Trophy fired' : 'Trophy fired and missed') : 'Trophy did not fire';
    const tH = v.t0 + th.viz.end.t, fe = (B.events || []).find(e => !e.wing && e.type === 'tank_fate' && Math.abs(e.t - tH) < 0.5);
    return { id: ident(v, th), t0: v.t0, tL: v.t0 + th.t0, tH, R: th.R, harm: fe && !th.viz.end.killing && fe.kind !== 'ok' ? fe.cause : null, name: NAME[th.key] || th.key, hk, aps: ap, empty: tags.includes('aps_empty'), killing: !!th.viz.end.killing, pk: HK && HK.THREATS && HK.THREATS[th.key] ? HK.THREATS[th.key].kill : null }; };
  const hit = each(B, (v, th) => (th.viz.end.type === 'hit' ? mkHit(v, th) : null)), empty = each(B, (v, th) => (th.viz.end.type === 'hit' && (th.tags || []).includes('aps_empty') ? mkHit(v, th) : null));
  if (!big || !hit) return null;
  const all = tally(B), kinds = {}; for (const th of big.rec.threats) kinds[th.key] = (kinds[th.key] || 0) + 1; const dirs = new Set(big.rec.threats.map(th => Math.round((((th.brg % 360) + 360) % 360) / 45) % 8));
  const cs = B.crewState ? B.crewState() : null, crew = {}; if (cs && cs.who) for (const r of Object.keys(CREW)) if (cs.who[r]) crew[r] = { state: cs.who[r].state, status: cs.who[r].status };
  return { big: { v: big.i, t0: big.t0, n: big.rec.threats.length, spread: Math.max(...big.rec.threats.map(o => o.t0)) - Math.min(...big.rec.threats.map(o => o.t0)), dirs: dirs.size, kinds: Object.entries(kinds).map(([k, n]) => `${word(n)} ${NAME[k] || k}${n > 1 && !/s$/.test(NAME[k] || k) ? 's' : ''}`), brg: big.rec.threats[0].brg },
    hit, empty: empty && hit && empty.tH !== hit.tH ? empty : null, crew, cfg: settings(B), all,
    /* the closing still: a lost vehicle is shown 3.5 s after the hit that decided it, with the first man climbing out (the replay runs 4 s past the end) */
    tEnd: all.end ? Math.min(B.t + 3.5, all.end.t + 3.5) : Math.max(1, B.t - 0.5) };
}

// ---- reading the battle as it stands now (the page hands the live battle; the node test hands the finished one) -----------------
const mags = b => { const st = (b && b.tank && b.tank.st) || {}; return { obs: st.obs, he: st.he, L: st.apsL, R: st.apsR }; };
function crewNow(b) { const cs = b && b.crewState ? b.crewState() : null; if (!cs || !cs.on || !cs.who) return null; const o = {}; for (const r of Object.keys(CREW)) if (cs.who[r]) o[r] = { state: cs.who[r].state, status: cs.who[r].status }; return o; }
const crewLine = c => Object.keys(CREW).filter(r => c[r]).map(r => `${CREW[r]} ${c[r].status === 'down' ? 'out of action' : c[r].status === 'wounded' ? 'wounded and ' + c[r].state : c[r].state}`).join(', ');

// ---- the chapters --------------------------------------------------------------------------------------------------------------
// A step: { head, text(X), from, to, rate, shot, marks, lines, panel }.
//   from, to   battle time in seconds: the replay jumps to `from`, plays at `rate` and stops at `to` (from === to: a still moment)
//   shot       what the film director's rigs are handed (director.film): { rig } or { cam }, completed here with the threat's identity
//   marks      labels with leader lines: { at: 'missile' | 'launcher' | 'tank' | 'station' | 'trophy' | 'cloud' | 'point', id, text, tone }
//              (cloud: x metres out along the threat's bearing, r how far from there a puff may be; point: d metres out along it;
//               after: shown only once battle time has passed it; gone: what a missile's label says, where it was last seen, once it has ended)
//   lines      'beam' (launcher to missile), 'track' (station to this missile), 'tracks' (station to every missile in the air)
//   X          { b: the battle as it stands, inAir: missiles and drones in the air now }
const mk = (at, text, id, more) => Object.assign({ at, text, id }, more || {});
const shotOf = (base, id, more) => Object.assign({}, base, id ? { v: id.v, idx: id.idx, uid: id.uid, brg: id.brg, R: id.R } : null, more || null);

export const CHAPTERS = [
  { key: 'overview', name: 'HKOI in one minute', setup: AIM_SETUP, find: findOverview, steps: M => [
    { head: 'What HKOI is', from: M.calm, to: M.calm, rate: 1, shot: { rig: 'tank' }, diagram: { kind: 'layers', L: M.L, focus: 'all' },
      marks: [mk('station', 'HKOI: 30 mm weapon station and radar', null, { tone: 'good' })],
      text: () => `HKOI is a 30 mm gun on the turret roof with its own radar and a laser warner. It does not try to hit a guided missile: it bursts a small cloud on the line between the missile and the enemy gunner, so the missile loses its guidance. Trophy, at the hull, is the last layer.` },
    { head: 'Four layers, four jobs', from: M.calm, to: M.calm, rate: 1, shot: { rig: 'tank', turn: 120 }, diagram: { kind: 'layers', L: M.L, focus: 'cloud' },
      marks: [mk('station', 'Cloud: out to ' + km(M.L.obsMax), null, { tone: 'good' }), mk('trophy', 'Trophy: at the hull', M.D.id, { tone: 'good', side: 'L' })],
      text: () => `Sensors find the threat. Obscurant rounds blind laser beam-riders and radio-command missiles ${km(M.L.obsMin)} to ${km(M.L.obsMax)} out. Airburst rounds from the same gun shoot down drones. Trophy fires at whatever still comes on, ${word(2 * M.L.aps0)} shots in all.` },
    { head: 'What none of them stop', from: M.calm, to: M.calm, rate: 1, shot: { rig: 'tank', turn: 220 }, diagram: { kind: 'layers', L: M.L, focus: 'none' },
      marks: [mk('tank', 'M1A2 SEPv3', null, { tone: 'warn' })],
      text: () => `Nothing here stops a tank's armour-piercing round. A missile fired from too close leaves no time for a cloud, and too many at once overwhelm one gun and ${word(2 * M.L.aps0)} Trophy shots. The rest of this briefing shows each of these on real battles from the simulator.` },
  ] },
  { key: 'threat', name: 'The threat', setup: AIM_SETUP, find: findThreat, steps: M => [
    !M.cdr ? null : { head: 'Where the enemy thinks you are', from: A(M, M.tL - 1.2), to: A(M, M.tL - 1.2), rate: 1, shot: shotOf({ rig: 'site' }, M.id), diagram: { kind: 'cdr', K: M.cdr },
      marks: [mk('launcher', `${M.name} team`, M.id, { tone: 'bad' })],
      text: () => `The enemy side, through its commander's map. His last word of the tank is a ${M.cdr.src === 'report' ? "team's report" : M.cdr.src === 'sound' ? 'bearing from the sound of its gun' : 'guess'} ${s1(M.cdr.age)} s old, good to about ${km(M.cdr.r)}. He has a ${M.name} team ${km(M.R)} away with the tank in its sight.` },
    { head: 'The missile rides a laser beam', from: A(M, M.tL - 0.4), to: A(M, M.tL + 3), rate: 0.5, shot: shotOf({ rig: 'shoulder' }, M.id), lines: ['beam'],
      marks: [mk('missile', `${M.name} missile, ${Math.round(M.speed)} m/s`, M.id, { tone: 'bad' }), mk('beam', 'Laser guidance beam', M.id, { tone: 'bad' })],
      text: () => `The missile has no eyes of its own. The launcher shines a laser beam at the tank, and the missile steers to stay in the middle of it, reading it through a receiver in its tail. The red line is the beam. This is a real battle, played again: nothing here is staged.` },
    { head: 'The gunner must see the tank all the way', from: A(M, M.tL + 0.6), to: A(M, Math.min(M.plan.tF - 0.2, M.tL + 4)), rate: 1, shot: shotOf({ cam: 'enemy' }, M.id),
      marks: [mk('tank', 'The tank', null, { tone: 'good' })],
      text: () => `The enemy gunner's sight. The flight takes ${s1(M.flight)} s, and for all of it two things must stay true: he can see the tank, and his missile can see the beam. HKOI goes after the second.` },
  ].filter(Boolean) },
  { key: 'aim', name: 'How HKOI aims', setup: AIM_SETUP, find: (B, HK) => findAim(B, HK), steps: D => aimSteps(D), span: D => [D.T0 + D.tL - 0.5, D.T0 + D.end.t + 0.8], zero: D => D.T0 + D.tL },
  { key: 'order', name: 'Many at once', setup: ORDER_SETUP, find: (B, HK) => findOrder(B, HK), steps: O => orderSteps(O), span: O => [O.T0 - 0.3, O.T0 + O.tEnd + 0.5], zero: O => O.T0 },
  { key: 'drones', name: 'Drones', setup: FARM, find: findDrones, steps: M => [
    { head: 'A threat with no beam to cut', from: Math.max(0, M.one.t0 - 2.5), to: Math.max(M.one.t0 + 0.2, M.one.tF - 0.4), rate: 1, shot: shotOf({ rig: 'gun' }, M.one.id), lines: ['track'],
      marks: [mk('missile', cap(M.one.name), M.one.id, { tone: 'bad' }), mk('station', 'HKOI weapon station', null, { tone: 'good' })],
      text: () => `An FPV drone: a small racing aircraft with an anti-tank warhead, flown by a pilot through a video link at about ${Math.round(M.one.speed * 3.6 / 10) * 10} km/h. There is no guidance beam to cut, and a drone on a fibre-optic line cannot be jammed either. It has to be shot down.` },
    { head: 'Airburst', from: Math.max(0, M.one.tF - 1), to: M.one.tK + 0.6, rate: 0.5, shot: shotOf({ rig: 'follow', up: 16, out: 36 }, M.one.id), lines: ['track'],
      marks: [mk('missile', cap(M.one.name), M.one.id, { tone: 'bad', gone: 'Drone destroyed here', goneTone: 'good' }), mk('station', 'HKOI: high-explosive rounds', null, { tone: 'good' })],
      text: () => `The same gun, the other magazine. HKOI fires ${word(M.one.first)} high-explosive rounds set to burst beside the drone, and it is destroyed ${km(M.one.d)} from the vehicle, ${s1(Math.max(0, M.one.tK - M.one.tF))} s after the first round left the gun.` },
    { head: "The pilot's goggles", from: Math.max(0, M.one.tF - 2.5), to: Math.max(M.one.tF, M.one.tK - 0.12), rate: 0.5, shot: shotOf({ cam: 'fpv' }, M.one.id), marks: [],
      text: () => `The same drone through its pilot's video feed: speed, height and distance are the battle's own; the picture noise is representative. He is flying it at the tank; a moment from now, ${km(M.one.d)} out, HKOI's high-explosive rounds burst around it, ${s1(Math.max(0, M.one.tK - M.one.tF))} s after the gun opened, and the feed goes dead.` },
    !M.multi ? null : { head: 'Sometimes it takes more than one burst', from: Math.max(0, M.multi.tF - 1), to: M.multi.tK + 0.6, rate: 1, shot: shotOf({ rig: 'follow', up: 16, out: 36 }, M.multi.id), lines: ['track'],
      marks: [mk('missile', cap(M.multi.name), M.multi.id, { tone: 'bad', gone: 'Drone destroyed here', goneTone: 'good' })],
      text: () => `This ${M.multi.name} took ${word(M.multi.n)} bursts, ${M.multi.rounds} rounds, and came within ${km(M.multi.d)} before it fell. In the model one full burst brings a drone down ${Math.round(100 * M.cfg.hePk)}% of the time before the pilot's dodging is counted (assumed). The magazine holds ${M.cfg.he0} of these rounds; this whole battle used ${M.cfg.he0 - M.all.heLeft}.` },
  ].filter(Boolean) },
  { key: 'limits', name: 'Limits', setup: TOWN, find: findLimits, steps: M => [
    !M.close ? null : { head: M.close.why === 'handed' || M.close.why === 'min' ? 'Too close for a cloud' : 'When the cloud is not enough', from: Math.max(0, M.close.tL - 0.6), to: M.close.tA + 0.7, rate: 0.5, shot: shotOf({ rig: 'replay' }, M.close.id), lines: ['beam'],
      marks: [mk('missile', cap(M.close.name), M.close.id, { tone: 'bad' }), mk('point', 'Destroyed by Trophy here', M.close.id, { tone: 'good', d: M.close.d, h: 1.6, after: M.close.tA }), mk('trophy', 'Trophy launcher', M.close.id, { tone: 'good', side: M.close.side })],
      text: () => (M.close.why === 'handed' ? `This ${M.close.name} was launched from only ${km(M.close.R)}: ${s1(M.close.flight)} s of flight. The fire control judged there was no time for a cloud to form and work, and handed it straight to Trophy, the inner layer, which destroyed it ${Math.round(M.close.d)} m from the armour.`
        : M.close.why === 'min' ? `This ${M.close.name} was launched from only ${km(M.close.R)}, inside the distance HKOI needs to put a cloud on its line. Trophy, the inner layer, destroyed it ${Math.round(M.close.d)} m from the armour.`
        : M.close.why === 'saclos' ? `A ${M.close.name} is steered by commands from its launcher, which watches a flare in the missile's tail. A cloud blinds that kind less surely than a beam-rider: ${Math.round(100 * M.cfg.saclos)}% of the time in the model (assumed), and not this time. Trophy destroyed it ${Math.round(M.close.d)} m from the armour.`
        : M.close.why === 'thin' ? `HKOI fired at this ${M.close.name}, but the cloud was too thin to break its guidance. Trophy, the inner layer, destroyed it ${Math.round(M.close.d)} m from the armour.`
        : `HKOI did not stop this ${M.close.name}. Trophy, the inner layer, destroyed it ${Math.round(M.close.d)} m from the armour.`) },
    !M.rpg ? null : { head: 'Nothing to blind', from: Math.max(0, M.rpg.tL - 1.2), to: M.rpg.tA + 0.6, rate: 0.25, shot: shotOf({ rig: 'replay' }, M.rpg.id),
      marks: [mk('missile', 'RPG rocket', M.rpg.id, { tone: 'bad' }), mk('point', 'Destroyed by Trophy here', M.rpg.id, { tone: 'good', d: M.rpg.d, h: 1.6, after: M.rpg.tA }), mk('trophy', 'Trophy launcher', M.rpg.id, { tone: 'good', side: M.rpg.side })],
      text: () => `An RPG is unguided: once it is fired there is nothing to blind. This one came from ${Math.round(M.rpg.R)} m and was on the vehicle in ${s1(M.rpg.flight)} s. HKOI holds its fire on rockets, and Trophy destroyed it ${Math.round(M.rpg.d)} m from the armour.` },
    { head: 'Eight shots, and what nothing stops', from: (M.rpg || M.close).tA + 2, to: (M.rpg || M.close).tA + 2, rate: 1, shot: shotOf({ rig: 'tank' }, (M.rpg || M.close).id),
      marks: [mk('trophy', 'Trophy: one launcher each side', (M.rpg || M.close).id, { tone: 'good', side: 'L' })],
      text: X => { const m = mags(X.b); return `Trophy carries ${word(2 * M.cfg.aps0)} shots, ${word(M.cfg.aps0)} on each side (Shawn's figure).${m.L != null ? ` At this point in the battle it has ${word(m.L)} left on the left and ${word(m.R)} on the right.` : ''} A tank gun's long-rod round arrives at about 1,700 m/s: in this model neither HKOI nor Trophy does anything against it. Only armour and not being seen help there.`; } },
  ].filter(Boolean) },
  { key: 'saturation', name: 'Saturation', setup: DESERT, find: findSaturation, steps: M => [
    { head: 'Many at once', from: Math.max(0, M.big.t0 - 0.5), to: M.big.t0 + Math.min(5, M.big.spread + 2.5), rate: 0.5, shot: shotOf({ rig: 'wide' }, { v: M.big.v, idx: 0, uid: null, brg: M.big.brg, R: 0 }), lines: ['tracks'],
      marks: [mk('station', 'One gun, one cloud at a time', null, { tone: 'warn' })],
      text: () => `A prepared defence does not fire one missile at a time. In this volley ${word(M.big.n)} threats were launched within ${s1(M.big.spread)} s from ${word(M.big.dirs)} ${pl(M.big.dirs, 'direction')}: ${list(M.big.kinds)}. HKOI has one gun, and Trophy a few shots a side.` },
    { head: 'The first one through', from: Math.max(0, M.hit.tH - 3), to: M.hit.tH + 0.7, rate: 0.5, shot: shotOf({ rig: 'replay' }, M.hit.id),
      marks: [mk('missile', cap(M.hit.name), M.hit.id, { tone: 'bad' }), mk('tank', `Hit by the ${M.hit.name}`, null, { tone: 'bad', after: M.hit.tH })],
      text: () => `${clock(M.hit.tH)} into the battle a ${M.hit.name} fired from ${km(M.hit.R)} hits the vehicle: ${M.hit.hk}, and ${M.hit.aps}. ${M.hit.killing ? 'The vehicle is lost.' : `The vehicle survives it${M.hit.pk != null ? `: in the model a hit from this weapon knocks the vehicle out ${Math.round(100 * M.hit.pk)}% of the time (assumed)` : ''}.${M.hit.harm ? ` But not whole. ${M.hit.harm}` : ''}`}` },
    !M.empty ? null : { head: 'Handed to an empty launcher', from: Math.max(0, M.empty.tH - 3), to: M.empty.tH + 0.7, rate: 0.5, shot: shotOf({ rig: 'replay' }, M.empty.id),
      marks: [mk('missile', cap(M.empty.name), M.empty.id, { tone: 'bad' }), mk('tank', `Hit by the ${M.empty.name}`, null, { tone: 'bad', after: M.empty.tH }), mk('trophy', 'Trophy: empty on this side', M.empty.id, { tone: 'warn', side: 'empty' })],
      text: X => { const m = mags(X.b); return `${clock(M.empty.tH)} into the battle, a ${M.empty.name} from ${km(M.empty.R)}: ${M.empty.hk}, and ${M.empty.aps}. It hits.${m.obs != null ? ` Magazines at this point: obscurant ${m.obs}, airburst ${m.he}, Trophy ${m.L} left and ${m.R} right.` : ''}`; } },
    { head: M.all.alive ? 'Where it runs out' : 'How it ends', from: M.tEnd, to: M.tEnd, rate: 1, shot: shotOf({ rig: 'tank' }, M.hit.id),
      marks: [mk('station', `Obscurant rounds left: ${M.all.obs}`, null, { tone: 'warn' }), mk('trophy', `Trophy shots left: ${M.all.apsL + M.all.apsR}`, M.hit.id, { tone: 'warn', side: 'L' })],
      text: () => `By the end, ${Math.round(M.all.t / 60)} minutes in: ${M.all.fired} threats fired at the vehicle. HKOI stopped ${M.all.hkoi}, Trophy ${M.all.aps}, ${M.all.miss} missed and ${word(M.all.hits)} hit. Obscurant rounds left: ${M.all.obs} of ${M.cfg.obs0}. Trophy shots left: ${M.all.apsL + M.all.apsR} of ${2 * M.cfg.aps0}. ${M.all.alive ? `The vehicle is still alive${M.all.result === 'withdrawn' ? ' and breaks contact, which is the right call' : ''}: the next volley would meet almost no defence.` : `The vehicle is lost${M.all.stuck != null ? `, still where the hit at ${clock(M.all.stuck)} stopped it` : ''}: ${endWords(M.all.end) || 'destroyed'}.`}` },
  ].filter(Boolean) },
  { key: 'crew', name: 'The crew', setup: DESERT, find: findSaturation, steps: M => [
    { head: 'Inside, when it hits', from: Math.max(0, M.hit.tH - 2.2), to: M.hit.tH + 2.5, rate: 0.5, shot: shotOf({ cam: 'in_gnr', inside: true }, M.hit.id), marks: [],
      text: () => `The same hit from the gunner's seat. The simulator carries the crew as four men. Each has his own stress, which rises with near misses, hits, wounds and overload and falls again in quiet spells.` },
    { head: 'Stress', from: M.hit.tH + 6, to: M.hit.tH + 6, rate: 1, shot: shotOf({ rig: 'tank', turn: 180 }, M.hit.id), marks: [mk('tank', 'Four men inside', null, { tone: 'warn' })],
      text: X => { const c = crewNow(X.b); return `${c ? `A few seconds after the hit: ${crewLine(c)}. ` : ''}A shaken man works slower. A panicked one can freeze or get his drill wrong, and a crew can abandon a vehicle that could still fight. How hard stress bites is an assumption in the model, not a measurement.`; } },
    { head: 'What it leaves behind', from: M.tEnd, to: M.tEnd, rate: 1, shot: shotOf({ rig: 'tank' }, M.hit.id), marks: [mk('tank', 'The crew at the end of the battle', null, { tone: 'warn' })],
      text: () => { const C = Object.values(M.crew), hurt = C.some(c => c.status !== 'ok'), spent = C.some(c => c.state !== 'steady');
        return `At the end of this battle: ${C.length ? crewLine(M.crew) : 'crew stress was switched off'}. ${!M.all.hits ? 'No hit landed.' : M.all.alive ? `${Word(M.all.hits)} ${pl(M.all.hits, 'hit')} landed and the vehicle survived them${hurt ? '' : ', nobody was wounded'}${spent ? ', and the crew is still spent' : ''}. Keeping hits off the armour matters even when the armour would have held.` : `${Word(M.all.hits)} ${pl(M.all.hits, 'hit')} landed and the last one ended it: ${endWords(M.all.end) || 'the vehicle is destroyed'}. Being steady is not protection: only the defences and the armour are.`}`; } },
  ] },
  { key: 'evidence', name: 'The evidence', setup: DESERT, find: findSaturation, steps: M => [
    { head: 'One battle proves nothing', from: M.tEnd, to: M.tEnd, rate: 1, shot: shotOf({ rig: 'tank', turn: 90 }, M.hit.id), marks: [], panel: 'numbers',
      text: () => `Everything so far was one battle each, picked to show something. To learn what HKOI is worth, the simulator fights the same raid many times under four setups, on the same dice: both systems, Trophy alone, HKOI alone, neither. A small run is being fought right now, below.` },
    { head: 'Where to go from here', from: M.tEnd, to: M.tEnd, rate: 1, shot: shotOf({ rig: 'tank', turn: 90 }, M.hit.id), marks: [], panel: 'next',
      text: () => `Run the numbers fights thousands of raids, map by map or as whole battles, and lists why hits got through. Scenarios has ${String(NUM[SCENARIOS.length] || SCENARIOS.length).toLowerCase()} battles picked to show one thing each. The Ladder is ten raids of rising difficulty to fight yourself. Every figure in this simulator is a model's answer built on stated assumptions, not a test result.` },
  ] },
];
export const sameSetup = (a, b) => !!a && !!b && a.biome === b.biome && a.map === b.map && a.force === b.force && a.skill === b.skill && a.waves === b.waves && a.seed === b.seed;

// ================================================================================================================================
// The page
const CSS = `
  body.tour-on #status, body.tour-on #sline, body.tour-on #gauges, body.tour-on #warn, body.tour-on #facerow, body.tour-on #threats, body.tour-on #engleft, body.tour-on #engright,
  body.tour-on #logov, body.tour-on #strip, body.tour-on #dock, body.tour-on #hud, body.tour-on #marks, body.tour-on #units, body.tour-on #xr, body.tour-on #dir-tag, body.tour-on #title, body.tour-on #result, body.tour-on #cmd, body.tour-on #cmdmenu { display: none !important; }
  #tour { position: fixed; inset: 0; z-index: 8; pointer-events: none; font-size: clamp(14px, .95vw, 21px); }   /* everything in the briefing is sized in em from this: 14 px on a small window, about 18 px at 1920 wide */
  #tour svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  #tour .tl { position: absolute; left: 0; top: 0; padding: .28em .6em .32em; border-radius: 5px; background: rgba(5, 9, 8, .86); border: 1px solid rgba(255, 255, 255, .5); color: #fff; font-weight: 650; font-size: 1em; line-height: 1.2; white-space: nowrap; will-change: transform; text-shadow: 0 1px 2px #000; }
  #tour .tl.good { border-color: var(--accent); color: #c9ffe4; } #tour .tl.bad { border-color: #ff6b5e; color: #ffd9d4; } #tour .tl.warn { border-color: var(--warn); color: #ffe6c2; }
  #tour .tl.off { opacity: .8; font-weight: 500; }
  #tour-top { position: absolute; left: 0; right: 0; top: 0; display: flex; justify-content: center; gap: .35em; flex-wrap: wrap; padding: .6em .8em; pointer-events: none; background: linear-gradient(180deg, rgba(4, 8, 7, .75), rgba(4, 8, 7, 0)); }
  #tour-top button { pointer-events: auto; cursor: pointer; font-size: .86em; padding: .3em .7em; border-radius: 99px; border: 1px solid rgba(255, 255, 255, .22); background: rgba(5, 9, 8, .78); color: #c6d2cb; white-space: nowrap; }
  #tour-top button:hover { border-color: var(--accent); color: #fff; } #tour-top button.on { background: var(--accent); border-color: var(--accent); color: #05130c; font-weight: 700; } #tour-top button.done { color: var(--accent); border-color: var(--line); }
  #tour-card { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); width: min(1180px, calc(100vw - 24px)); box-sizing: border-box; padding: .7em 1.1em .75em; pointer-events: auto; background: rgba(5, 9, 8, .93); border: 1px solid var(--line); border-top: 2px solid var(--accent); border-radius: 8px; box-shadow: 0 8px 30px rgba(0, 0, 0, .55); max-height: 78vh; overflow-y: auto; }
  #tour-card .th { display: flex; align-items: baseline; gap: .8em; margin-bottom: .25em; } #tour-card .th i { font: 700 .78em/1 var(--mono); font-style: normal; letter-spacing: .12em; color: var(--accent); text-transform: uppercase; white-space: nowrap; }
  #tour-card .th b { font-size: 1.22em; letter-spacing: .01em; } #tour-card .th span { margin-left: auto; font: .78em/1 var(--mono); color: var(--dim); white-space: nowrap; } #tour-card .th span.slow { color: var(--warn); }
  #tour-card p { margin: 0 0 .55em; font-size: 1.06em; line-height: 1.42; color: #e9f1ec; max-width: 110ch; }
  #tour-card .tb { display: flex; gap: .5em; align-items: center; flex-wrap: wrap; } #tour-card .tb .sp { flex: 1; }
  #tour-card .btn { font-size: .95em; padding: .38em .85em; } #tour-card .btn.primary { padding: .42em 1.3em; font-size: 1em; }
  #tour-card .tk { font: .76em var(--mono); color: var(--dim); white-space: nowrap; } @media (max-width: 1100px) { #tour-card .tk { display: none; } }
  #tour-panel { margin: 0 0 .6em; } #tour-panel .pg-tbl { font-size: .86em; } #tour-panel .pg-take { font-size: .98em; margin: .35em 0; } #tour-panel .pg-note { font-size: .84em; margin: .35em 0; } #tour-panel .pg-bar { margin: .3em 0; }
  #tour-diag { position: absolute; left: 12px; top: 3.2em; pointer-events: auto; border-radius: 8px; box-shadow: 0 6px 24px rgba(0, 0, 0, .45); }
  #tour-diag svg { position: static; display: block; width: 100%; height: auto; } #tour-diag[hidden] { display: none; }
  #tour-diag .dt { position: absolute; right: 8px; top: 6px; font: .7em var(--mono); color: var(--dim); }
  #tour-card .sc { display: flex; align-items: center; gap: .6em; margin: 0 0 .5em; } #tour-card .sc[hidden] { display: none; } #tour-card .sc input { flex: 1; accent-color: var(--accent); }
  #tour-card .sc span { font: .78em var(--mono); color: var(--dim); white-space: nowrap; }
  #tour-veil { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(4, 8, 7, .82); font: 1.05em var(--mono); color: var(--dim); letter-spacing: .1em; pointer-events: auto; }
  #t-main .mbtn.big { padding: 15px 18px; } #t-main .mbtn.big b { font-size: 21px; } #t-main .mbtn.second { border-color: var(--accent); }
  #t-main .t-pair { display: flex; gap: 10px; } #t-main .t-pair .mbtn { flex: 1; min-width: 0; } #t-main .t-pair .mbtn small { display: none; }
  @media (max-height: 760px) { #t-main { gap: 7px; } #t-main .mbtn { padding: 7px 14px; } #t-main .mbtn b { font-size: 16px; } #t-main .mbtn small { font-size: 12px; } #t-main .mbtn.big { padding: 9px 14px; } #t-main .mbtn.big b { font-size: 18px; } #t-main .sub { margin-bottom: 4px; } }
  @media (max-height: 600px) { #t-main { padding-top: 10px; padding-bottom: 10px; gap: 6px; } #t-main { justify-content: flex-start; overflow-y: auto; } #t-main h1 { font-size: 30px; } #t-main .mbtn small { font-size: 11.5px; } #t-setup { padding-top: 6px; padding-bottom: 6px; } }
  #help { position: fixed; inset: 0; z-index: 9; display: flex; align-items: center; justify-content: center; padding: 12px; background: rgba(4, 8, 7, .72); }
  #help .card { width: min(980px, 100%); max-height: calc(100vh - 24px); overflow-y: auto; padding: 13px 20px 12px; box-sizing: border-box; }
  #help h2 { margin: 0 0 2px; font-size: clamp(19px, 2.4vw, 28px); letter-spacing: .06em; } #help .sub { color: var(--dim); margin: 0 0 8px; font-size: 13.5px; }
  #help .hg { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
  #help .hi { border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; padding: 7px 11px 8px; background: rgba(255, 255, 255, .03); } #help .hi > b { display: block; font-size: 14.5px; margin-bottom: 3px; color: var(--accent); } #help .hi p b { color: #fff; font-weight: 700; }
  #help .hi p { margin: 0; font-size: 13px; line-height: 1.36; color: #dfe8e2; } #help kbd { font: 11px var(--mono); border: 1px solid rgba(255, 255, 255, .3); border-radius: 4px; padding: 0 5px; margin: 0 1px; background: rgba(255, 255, 255, .07); white-space: nowrap; }
  #help .hf { display: flex; gap: 12px; align-items: center; margin-top: 9px; flex-wrap: wrap; } #help .hf .btn.primary { padding: 8px 20px; } #help .hf span { color: var(--dim); font-size: 12.5px; flex: 1; min-width: 200px; }
  #bartip { position: fixed; z-index: 7; left: 0; top: 0; max-width: 300px; padding: 6px 10px; border-radius: 6px; background: rgba(5, 9, 8, .96); border: 1px solid var(--line); font-size: 12.5px; line-height: 1.35; color: var(--fg); pointer-events: none; box-shadow: 0 6px 20px rgba(0, 0, 0, .5); }
`;
const TONES = { good: '#39d98a', bad: '#ff6b5e', warn: '#ffb347' };
const STATION = { at: 'station' };
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

// What main.js hands over (one object, see the hook lines there):
//   scene, cams, tank, store, el, shown {e, n, h}, director, pages, HK, q (address parameters), names { biome, force, skill }
//   battle, volleys, tNow, state, replay, mapOpen (read); playing, speed (read and set)
//   unitPos(u) where a team is drawn; seek(t); load(setup, 'replay' | 'live'); snapshot() / exit(snapshot); page(on); toTitle()
export class Guide {
  constructor(app) {
    this.app = app; const el = app.el;
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    this.scen = new ScenarioPage({ el, names: app.names, play: u => app.load(u, 'live'), replay: u => app.load(u, 'replay'), back: () => app.page(false), aim: () => { this.scen.close(); this.openAim(); } });
    this.brief = new Briefing(app, this); this.help = new Help(app, this);
    this._title(); this._tips();
    { const a = app.q && app.q.get('aim'); if (a != null && a !== '') { const [c, st] = String(a).split('.').map(Number); setTimeout(() => { this.brief.start(CHAPTERS.findIndex(x => x.key === (c ? 'order' : 'aim')), st || 0, ['aim', 'order']); }, 0); } }
    { const t = app.q && app.q.get('tour'); if (t != null && t !== '') { const [c, st] = String(t).split('.').map(Number); setTimeout(() => { this.brief.start(c || 0, st || 0); }, 0); } }   /* tour=3 or tour=3.2 in the address opens the briefing at that chapter and step (counted from 0): for checks and for sending someone a link */
    if (typeof window !== 'undefined' && window.__beta) window.__beta.guide = this;
    app.director.after = dt => this.update(dt);   /* once a frame, from the director's own update (before the cameras): keeps the frame loop in main.js untouched */
  }
  // the title screen: the briefing first and biggest, then Play, Scenarios, and the two older screens side by side
  _title() {
    const el = this.app.el, go = document.getElementById('go'), main = document.getElementById('t-main'); if (!go || !main) return;
    const mb = (id, cls, head, small, fn) => { const b = el('button', 'mbtn ' + cls); b.id = id; b.append(el('b', null, head), el('small', null, small)); b.onclick = fn; return b; };
    const t = mb('o-tour', 'primary big', 'The HKOI briefing', 'A guided tour: what the threat is, how HKOI beats it, where it stops', () => this.brief.start(0));
    const aim = mb('o-aim', 'second', 'How HKOI aims', 'One real shot, step by step: laser warning, radar, the planned shot, the cloud, the cut', () => this.openAim());
    const sc = mb('o-scen', '', 'Scenarios', `${NUM[SCENARIOS.length] || SCENARIOS.length} chosen battles, to play or to watch as a replay`, () => this.openScenarios());
    go.classList.remove('primary'); go.classList.add('second'); go.before(t); t.after(aim); go.after(sc);
    const lad = document.getElementById('o-ladder'), num = document.getElementById('o-numbers');
    if (lad && num) { const pair = el('div', 't-pair'); sc.after(pair); pair.append(lad, num); }
  }
  openScenarios() { this.app.page(true); this.scen.open(); }
  chapterIndex(key) { return CHAPTERS.findIndex(c => c.key === key); }
  // the targeting page: the briefing's two targeting chapters on their own ("How HKOI aims", then "Many at once")
  openAim() { this.app.page(false); this.brief.start(CHAPTERS.findIndex(c => c.key === 'aim'), 0, ['aim', 'order']); }
  // the control bar's own hints, shown at once instead of after the browser's long wait (the text is each button's own)
  _tips() {
    const tip = this.app.el('div'); tip.id = 'bartip'; tip.hidden = true; document.body.append(tip); let cur = null;
    const hide = () => { if (cur) { if (cur.dataset.tip) cur.title = cur.dataset.tip; cur = null; } tip.hidden = true; };
    document.addEventListener('pointerover', e => {
      const b = e.target && e.target.closest ? e.target.closest('#bar .btn, #replay .btn') : null; if (b === cur) return; hide(); if (!b) return;
      const text = b.title || b.dataset.tip; if (!text) return; b.dataset.tip = text; b.title = ''; cur = b;   /* the browser's own tip would come up as well */
      tip.textContent = text; tip.hidden = false; const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.transform = `translate(${Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)))}px, ${Math.round(Math.max(8, r.top - h - 8))}px)`;
    }, true);
    document.addEventListener('pointerdown', hide, true); document.addEventListener('pointerleave', hide, true);
  }
  helpButton() { return this.help.button(); }
  get busy() { return this.brief.on; }
  // once a frame: the briefing's camera and labels, and the first-run help. It runs just before the page's cameras, so in a sight
  // or a seat (where those place the camera) the labels follow one frame behind while time runs; stopped, they are exact.
  update(dt) {
    if (window.__beta && window.__beta.guide !== this) window.__beta.guide = this;
    this.brief.update(dt); this.help.watch();
  }
}

// ---- the briefing --------------------------------------------------------------------------------------------------------------
class Briefing {
  constructor(app, guide) {
    this.app = app; this.guide = guide; this.on = false; this.ci = 0; this.si = 0; this.steps = []; this.M = null; this.setup = null; this.phase = 'idle'; this.want = null; this.sched = false; this.snap = null; this.seen = new Set(); this.fault = null; this.quick = null; this.frames = 0;
    const el = app.el, V = app.scene.camera.position.constructor;   /* three.js Vector3, without importing three here (the node test loads this file) */
    this.v1 = new V(); this.v2 = new V(); this.v3 = new V(); this.v4 = new V();
    const root = this.root = el('div'); root.id = 'tour'; root.hidden = true;
    this.svg = svg('svg', {}); this.gl = svg('g', {}); this.gm = svg('g', {}); this.svg.append(this.gl, this.gm);
    this.top = el('div'); this.top.id = 'tour-top'; this.pills = CHAPTERS.map((c, i) => { const b = el('button', null, `${i + 1} ${c.name}`); b.title = 'Go to this chapter'; b.onclick = () => this.go(i, 0); this.top.append(b); return b; });
    const card = this.card = el('div'); card.id = 'tour-card';
    const th = el('div', 'th'); this.tag = el('i'); this.head = el('b'); this.rateTag = el('span'); th.append(this.tag, this.head, this.rateTag);
    this.text = el('p'); this.panel = el('div'); this.panel.id = 'tour-panel'; this.panel.hidden = true;
    /* the diagram beside the picture (src/app/targeting.js draws it from the record) and, for the targeting chapters, a time scrubber */
    this.diag = el('div'); this.diag.id = 'tour-diag'; this.diag.hidden = true; this.diagKey = ''; this.diagT = null; this.lx = 6;
    this.diag.addEventListener('pointerdown', e => this._diagClick(e)); this.diag.addEventListener('pointermove', e => { if (e.buttons & 1) this._diagClick(e); });
    this.scr = el('div', 'sc'); this.scr.hidden = true; this.scrIn = el('input'); this.scrIn.type = 'range'; this.scrIn.min = 0; this.scrIn.max = 1000; this.scrIn.title = 'Drag through the engagement: the picture and the diagram follow';
    this.scrLab = el('span'); this.scr.append(el('span', null, 'Time'), this.scrIn, this.scrLab); this.scrIn.addEventListener('input', () => { const sp = this.span; if (sp) this.scrub(sp[0] + (sp[1] - sp[0]) * this.scrIn.value / 1000); });
    const tb = el('div', 'tb'), btn = (text, cls, tip, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), text); b.title = tip; b.onclick = fn; return b; };
    this.bBack = btn('Back', '', 'The step before (left arrow)', () => this.back()); this.bAgain = btn('Watch again', '', 'Play this step again (R)', () => this.again());
    this.bNext = btn('Next', 'primary', 'The next step (right arrow)', () => this.next()); this.bSkip = btn('Skip chapter', '', 'Jump to the next chapter', () => { const n = this._nextCh(this.ci, 1); if (n >= 0) this.go(n, 0); else this.stop(); }); this.bExit = btn('Exit', '', 'Leave the briefing (Esc)', () => this.stop());
    tb.append(this.bBack, this.bAgain, this.bNext, el('span', 'tk', 'arrow keys: back and next · R: again · Esc: exit'), el('span', 'sp'), this.bSkip, this.bExit);
    card.append(th, this.text, this.panel, this.scr, tb);
    this.veil = el('div'); this.veil.id = 'tour-veil'; this.veil.hidden = true;
    root.append(this.svg, this.diag, this.top, card, this.veil); document.body.append(root);
    this.marks = []; this.lines = [];   /* pools: { el, ln, dot, w, h, slot } and svg lines */
    window.addEventListener('keydown', e => {
      if (!this.on || e.ctrlKey || e.metaKey || e.altKey || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      const k = e.code; let used = true;
      if (k === 'ArrowRight' || k === 'Enter' || k === 'PageDown') this.next(); else if (k === 'ArrowLeft' || k === 'PageUp') this.back(); else if (k === 'KeyR') this.again(); else if (k === 'Escape') this.stop();
      else if (k === 'Space') { if (this.phase === 'run') { this.app.playing = !this.app.playing; this._rate(); } else this.again(); } else used = false;
      e.stopImmediatePropagation(); if (used) e.preventDefault();   /* while the briefing is on, no key reaches the battle's own shortcuts */
    }, true);
  }
  get step() { return this.steps[this.si] || null; }

  // ---- moving about -----------------------------------------------------------------------------------------------------------
  start(ci, si, only) { if (this.on) return; this.only = only ? only.map(k => CHAPTERS.findIndex(c => c.key === k)).filter(i => i >= 0) : null; if (this.only && this.only.indexOf(ci) < 0) ci = this.only[0]; this.snap = this.app.snapshot(); this.on = true; this.seen.clear(); this.setup = null; this.fault = null; document.body.classList.add('tour-on'); this.root.hidden = false; this.app.director.setHold(true); this.go(ci || 0, si || 0); }
  stop(then) {
    if (!this.on) return; this.on = false; this.phase = 'idle'; this.diag.hidden = true; this.only = null; if (this.scrWait) { clearTimeout(this.scrWait); this.scrWait = null; } this.want = null; this._quickStop(); document.body.classList.remove('tour-on'); this.root.hidden = true; this.veil.hidden = true; this._hideMarks(); try { this._lift(0); } catch (e) { console.error(e); }
    try { this.app.director.setHold(false); } catch (e) { console.error(e); }
    try { this.app.speed = 1; this.app.exit(this.snap); } catch (e) { console.error(e); try { this.app.toTitle(); } catch (e2) { console.error(e2); } }
    this.snap = null; this.setup = null; if (then) then();
  }
  _allowed(ci) { return ci >= 0 && ci < CHAPTERS.length && (!this.only || this.only.indexOf(ci) >= 0); }
  _nextCh(ci, d) { for (let i = ci + d; i >= 0 && i < CHAPTERS.length; i += d) if (this._allowed(i)) return i; return -1; }
  next() { if (this.si + 1 < this.steps.length) this.go(this.ci, this.si + 1); else { const n = this._nextCh(this.ci, 1); if (n >= 0) this.go(n, 0); else this.stop(); } }
  back() { if (this.si > 0) this.go(this.ci, this.si - 1); else { const n = this._nextCh(this.ci, -1); if (n >= 0) this.go(n, -1); } }
  get span() { const ch = CHAPTERS[this.ci]; return ch && ch.span && this.M && this.Mfor === ch ? ch.span(this.M) : null; }
  // drag through the engagement: the replay jumps (at most a few times a second; a jump back re-runs the battle quietly) and stops
  // there; the step whose window holds that moment becomes the current one, without moving the replay again
  scrub(t) {
    const A = this.app; if (!this.on || this.sched || !A.replay) return; A.playing = false; this.phase = 'hold'; this.scrT = t; this.to = t; this._rate();
    let k = 0; this.steps.forEach((st, i) => { if (st.from <= t + 1e-6) k = i; }); if (k !== this.si) { this.si = k; const st = this.step; this.shot = Object.assign({ t0: st.from }, st.shot); for (const m of st.marks) m._seen = false; this._paint(); }
    if (this.scrWait) return; const go = () => { this.scrWait = null; const tt = this.scrT; try { A.seek(tt); } catch (e) { console.error(e); } if (Math.abs(this.scrT - tt) > 1e-3) this.scrWait = setTimeout(go, 120); };
    this.scrWait = setTimeout(go, 0);
  }
  _diagClick(e) {
    const st = this.step; if (!st || !st.diagram || st.diagram.kind !== 'aim' || st.diagram.compact) return; const svgE = this.diag.querySelector('svg'); if (!svgE) return;
    const r = svgE.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * AIM_W, y = (e.clientY - r.top) / r.height * AIM_H;
    if (y < 470) return; const t = aimTimeAt(st.diagram.D, x); if (t != null) { e.preventDefault(); this.scrub(t); }
  }
  again() { this.go(this.ci, this.si); }
  // ask for chapter ci, step si (-1: its last step). The work is done a moment later so the "setting up" notice is on screen first;
  // asking again before that simply changes what will be done, so hammering Next cannot queue up work or get stuck.
  go(ci, si) {
    if (!this.on) return; if (ci >= CHAPTERS.length || (this.only && !this._allowed(ci))) { this.stop(); return; }
    this.want = { ci: Math.max(0, ci), si }; const heavy = !sameSetup(CHAPTERS[this.want.ci].setup, this.setup);
    this.veil.textContent = heavy ? 'SETTING UP THE BATTLE FOR THIS CHAPTER' : ''; this.veil.hidden = !heavy; this._quickStop();
    if (this.sched) return; this.sched = true;
    const run = () => { this.sched = false; try { this._enter(); } catch (e) { this._fail(e); } };
    if (heavy) requestAnimationFrame(() => requestAnimationFrame(run)); else requestAnimationFrame(run);
  }
  _fail(e) { console.error(e); this.fault = String(e && e.message || e); this.phase = 'hold'; this.veil.hidden = true; this._hideMarks(); try { this._lift(0); } catch (x) { /* no camera to put back */ } try { this.app.playing = false; } catch (x) { /* nothing more to do */ } this._paint(); }
  _enter() {
    const A = this.app, w = this.want; if (!this.on || !w) return; this.want = null; this.fault = null;
    const ch = CHAPTERS[w.ci];
    if (!sameSetup(ch.setup, this.setup) || !A.replay) { A.load(ch.setup, 'replay'); this.setup = ch.setup; this.full = A.replay && A.replay.full; }
    if (w.ci !== this.ci || !this.M || this.Mfor !== ch) { this.M = this.full ? ch.find(this.full, A.HK) : null; this.Mfor = ch; this.steps = this.M ? ch.steps(this.M) : []; }
    this.ci = w.ci; this.si = w.si < 0 ? Math.max(0, this.steps.length - 1) : Math.min(w.si, Math.max(0, this.steps.length - 1));
    A.director.filmEnd(); this._hideMarks(); this.veil.hidden = true; this._lift(0);
    const st = this.step;
    if (!st) { this.fault = 'This chapter\'s battle no longer contains the moment the chapter was built on.'; this.phase = 'hold'; A.playing = false; this._paint(); return; }
    const T = A.replay ? A.replay.T : 1e9, from = Math.max(0, Math.min(T - 0.2, st.from)), to = Math.max(from, Math.min(T - 0.1, st.to));
    this.to = to; this.shot = Object.assign({ t0: from }, st.shot); for (const m of st.marks) m._seen = false;
    { const u = this.shot.uid != null ? A.battle.units.find(x => x.id === this.shot.uid) : null; if (u) { this.shot.le = u.e; this.shot.ln = u.n; if (this.shot.cam === 'fpv' && A.cams.choose) A.cams.choose(u); } }
    this.diagKey = ''; this.scrT = null;   /* where the launcher is: the rigs that frame the guidance line need its height */
    A.seek(from); A.speed = st.rate || 1; A.playing = to > from + 1e-3; this.phase = A.playing ? 'run' : 'hold'; this.frames = 0;
    this.seen.add(this.ci + ':' + this.si); this._paint();
    if (st.panel === 'numbers' && A.pages && A.pages.quick) { try { this.quick = A.pages.quick(this.panel, 600); } catch (e) { console.error(e); } }
  }
  _quickStop() { if (this.quick) { try { this.quick.stop(); } catch (e) { /* already over */ } this.quick = null; } }

  // ---- the card ---------------------------------------------------------------------------------------------------------------
  _ctx() { const A = this.app; return { b: A.battle, inAir: A.volleys && A.volleys.info ? A.volleys.info.length : null }; }
  _paint() {
    const el = this.app.el, ch = CHAPTERS[this.ci], st = this.step, last = this._nextCh(this.ci, 1) < 0 && this.si >= this.steps.length - 1;
    this.pills.forEach((b, i) => { b.className = i === this.ci ? 'on' : this.seen.has(i + ':0') ? 'done' : ''; b.hidden = !this._allowed(i); });
    this.scr.hidden = !this.span || !!this.fault;
    { const list = this.only || CHAPTERS.map((c, i) => i), n = list.indexOf(this.ci); this.tag.textContent = `${this.only ? 'Part' : 'Chapter'} ${n + 1} of ${list.length} · ${ch.name}${this.steps.length > 1 ? ` · step ${this.si + 1} of ${this.steps.length}` : ''}`; }
    let text = ''; if (this.fault) text = `This step could not be shown (${this.fault}). Next carries on.`; else if (st) { try { text = st.text(this._ctx()); } catch (e) { console.error(e); text = 'The text for this step could not be worked out from this battle. Next carries on.'; } }
    this.head.textContent = this.fault ? 'Something went wrong here' : st ? st.head : ch.name; this.text.textContent = text;
    this.bBack.disabled = this.ci === 0 && this.si === 0; this.bNext.textContent = last ? 'Finish' : 'Next'; this.bSkip.hidden = this._nextCh(this.ci, 1) < 0; this.bAgain.hidden = !st || !(st.to > st.from);
    const p = this.panel; p.textContent = ''; p.hidden = !(st && st.panel) || !!this.fault;
    if (st && st.panel === 'next' && !this.fault) { const row = el('div', 'tb'), b = (t, fn) => { const x = el('button', 'btn on', t); x.onclick = fn; return x; };
      row.append(b('Open Run the numbers', () => this.stop(() => { const n = document.getElementById('o-numbers'); if (n) n.click(); })), b('Open Scenarios', () => this.stop(() => this.guide.openScenarios())), b('Start over', () => this.go(0, 0))); p.append(row); }
    this._rate(); this.cardH = 0;
  }
  _rate() { const A = this.app, st = this.step; let t = '', slow = false; if (st && !this.fault) { if (this.phase === 'run') { slow = A.playing && A.speed < 1; t = !A.playing ? 'PAUSED' : A.speed < 1 ? `SLOW MOTION ×${A.speed}` : 'PLAYING'; } else t = st.to > st.from ? 'STOPPED AT THE MOMENT' : 'STILL'; } if (this.rateTag.textContent !== t) this.rateTag.textContent = t; this.rateTag.className = slow ? 'slow' : ''; }

  // ---- once a frame -----------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) return; const A = this.app;
    if (A.state !== 'play') { if (!this.sched && !this.want && this.phase !== 'idle' && !this.fault) this.stop(); return; }   /* the page left the replay by itself: leave with it */
    const st = this.step; if (!st || this.fault || this.sched) return;
    try {
      const t = Math.min(A.tNow, A.battle.t);
      if (this.phase === 'run' && (t >= this.to - 1e-3 || (A.replay && A.battle.t >= A.replay.T - 0.06))) { A.playing = false; this.phase = 'hold'; this._rate(); if (st.text.length) this.text.textContent = st.text(this._ctx()); }
      else if (this.phase === 'run' && !A.playing && this.frames > 2 && this.rateTag.textContent !== 'PAUSED') { /* the page stopped the clock itself (end of the replay) */ this.phase = 'hold'; this._rate(); }
      this.frames++;
      A.director.film(this.shot, t);
      const side = this._diagram(st, t);
      this._lift(A.cams.mode === 'free' && this.shot.rig !== 'cloud' ? Math.round((this.cardH || 150) * 0.42) : 0, A.cams.mode === 'free' ? Math.round(side / 2) : 0);   /* (the side view of the guidance line looks up at it from the ground: it already sits high in the picture) */
      this._draw(st, t);
    } catch (e) { this._fail(e); }
  }

  // The card covers the bottom of the picture, so for the director's own rigs the whole picture is moved up by a little under half
  // the card's height (the camera's view offset: what was aimed at the middle of the window now sits in the middle of what is left).
  // Sights and seats (the enemy's reticle, the HKOI sight) keep their true centre.
  _lift(px, sx) {
    const cam = this.app.scene.camera, cv = this.app.scene.canvas, W = cv.clientWidth || innerWidth, H = cv.clientHeight || innerHeight; sx = sx || 0;
    if (px === this.lift && sx === this.liftX && W === this.liftW && H === this.liftH) return; this.lift = px; this.liftX = sx; this.liftW = W; this.liftH = H;
    if (px || sx) cam.setViewOffset(W, H, -sx, px, W, H); else if (cam.view) cam.clearViewOffset();
  }
  // The diagram panel on the left: drawn from the record for this battle time (only when that time or the step has changed), sized to
  // the room above the card. Over a sight or a seat it is smaller, so the sight's own centre stays clear. Returns its width (0: none).
  _diagram(st, t) {
    const dg = st && st.diagram; if (!dg || this.fault) { if (!this.diag.hidden) this.diag.hidden = true; this.lx = 6; return 0; }
    const A = this.app, W = this.app.scene.canvas.clientWidth || innerWidth, H = this.app.scene.canvas.clientHeight || innerHeight, ch = this.cardH || 150;
    const ratio = dg.kind === 'cdr' ? 440 / 560 : dg.kind === 'aim' ? (dg.compact ? 230 / 560 : 540 / 560) : 520 / 560, sight = A.cams.mode !== 'free', roomH = H - ch - 66;
    const w = Math.round(Math.max(220, Math.min(sight ? W * 0.27 : W * 0.43, roomH / ratio, 760)));
    if (this.diag.hidden) this.diag.hidden = false; if (this.diagW !== w) { this.diagW = w; this.diag.style.width = w + 'px'; }
    const key = this.ci + ':' + this.si + ':' + dg.kind, tq = Math.round(t * 50) / 50;
    if (key !== this.diagKey || (dg.kind === 'aim' || dg.kind === 'order') && tq !== this.diagT) {
      this.diagKey = key; this.diagT = tq; let html = '';
      if (dg.kind === 'aim') html = aimSVG(dg.D, t, { focus: dg.focus, compact: dg.compact }); else if (dg.kind === 'order') html = orderSVG(dg.O, t, { all: dg.all });
      else if (dg.kind === 'layers') html = layerSVG(dg.L, dg.focus); else if (dg.kind === 'cdr') html = cdrSVG(dg.K, { tank: { e: A.battle.tank.e, n: A.battle.tank.n }, units: A.battle.units });
      this.diag.innerHTML = html;
    }
    { const sp = this.span; if (sp && !this.scr.hidden) { const v = Math.round(1000 * Math.max(0, Math.min(1, (t - sp[0]) / (sp[1] - sp[0])))); if (+this.scrIn.value !== v && document.activeElement !== this.scrIn) this.scrIn.value = v; const z = CHAPTERS[this.ci].zero ? CHAPTERS[this.ci].zero(this.M) : sp[0], lab = `${(t - z).toFixed(1)} s after ${CHAPTERS[this.ci].key === 'order' ? 'the first launch' : 'launch'}`; if (this.scrLab.textContent !== lab) this.scrLab.textContent = lab; } }
    this.lx = 12 + w + 10; return w + 12;
  }
  // ---- labels and lines over the picture ----------------------------------------------------------------------------------------
  _hideMarks() { for (const m of this.marks) { m.el.style.display = 'none'; m.ln.style.display = 'none'; m.dot.style.display = 'none'; m.slot = -1; } for (const l of this.lines) l.style.display = 'none'; }
  _mark(i) { let m = this.marks[i]; if (!m) { const e = this.app.el('div', 'tl'); e.style.display = 'none'; this.root.insertBefore(e, this.top); m = this.marks[i] = { el: e, ln: svg('line', { 'stroke-width': 1.5 }), dot: svg('circle', { r: 6, fill: 'none', 'stroke-width': 2 }), text: null, tone: null, w: 0, h: 0, slot: -1, x: 0, y: 0 }; this.gm.append(m.ln, m.dot); } return m; }
  _line(i) { let l = this.lines[i]; if (!l) { l = this.lines[i] = svg('line', { 'stroke-linecap': 'round' }); this.gl.append(l); } return l; }
  _missile(id) { const A = this.app, v = A.battle.volleys[id.v]; if (!v || !A.volleys) return null; for (const m of A.volleys.info) if (m.th && m.th.idx === id.idx && v.rec.threats.indexOf(m.th) >= 0) return m; return null; }
  _unit(uid) { return uid == null ? null : this.app.battle.units.find(u => u.id === uid) || null; }
  // where a thing is in the world this frame (false: it is not there to point at)
  _where(mk, out) {
    const A = this.app, S = A.scene, T = A.shown, id = mk.id;
    if (mk.after != null && Math.min(A.tNow, A.battle.t) < mk.after) return false;   /* a label for something that has not happened yet */
    if (mk.at === 'tank') { S.at(T.e, T.n, 2.3, out); return true; }
    if (mk.at === 'station') { const p = A.tank.hkoiMuzzle ? A.tank.hkoiMuzzle(out) : null; if (!p) S.at(T.e, T.n, 3.3, out); return true; }
    if (mk.at === 'trophy') { const V = A.volleys; let side = mk.side || 'R'; if (side === 'empty') { const st = A.battle.tank.st || {}; side = st.apsR === 0 ? 'R' : 'L'; }   /* 'empty': the side with no shot left */
      if (V && V._apsPort && V.tankView) V._apsPort(side, T, out); else S.at(T.e, T.n, 2.7, out); return true; }
    if (mk.at === 'missile') { const m = this._missile(id); this.gone = false;
      if (m) { (mk._last || (mk._last = out.clone())).copy(m.p); mk._seen = true; out.copy(m.p); return true; }
      if (mk.gone && mk._seen) { this.gone = true; out.copy(mk._last); return true; }   /* it has ended: the label stays where it was last seen and says what became of it */
      return false; }
    if (mk.at === 'launcher') { const u = this._unit(id.uid); if (!u || !u.alive || u.gone) return false; out.copy(A.unitPos(u)); out.y += 0.9; return true; }
    if (mk.at === 'cloud') {   /* the puff that is out now nearest to where this burst was laid: a real puff, never the empty air between two */
      const a = id.brg * Math.PI / 180, ce = T.e + Math.sin(a) * mk.x, cn = T.n + Math.cos(a) * mk.x, C = A.volleys && A.volleys.cloud, t = Math.min(A.tNow, A.battle.t); let best = (mk.r || 80), hit = false;
      if (C && C.puffs) for (const p of C.puffs) { if (!p.on || t < p.tb) continue; const age = Math.max(0, t - p.t0), px = p.x + (p.vx || 0) * age, pz = p.z + (p.vz || 0) * age, d = Math.hypot(px - ce, -pz - cn); if (d >= best) continue; best = d; out.set(px, p.y, pz); hit = true; }
      return hit; }
    if (mk.at === 'point') { const a = id.brg * Math.PI / 180; S.at(T.e + Math.sin(a) * mk.d, T.n + Math.cos(a) * mk.d, mk.h || 0.6, out); return true; }   /* a spot on the ground along the threat's bearing, once it has happened */
    return false;
  }
  // a point in the world to a point on the page; false when it is behind the camera
  _project(p, out) { const cam = this.app.scene.camera; this.v4.copy(p).applyMatrix4(cam.matrixWorldInverse); if (this.v4.z > -cam.near) return false; this.v4.applyMatrix4(cam.projectionMatrix); out.x = (this.v4.x * 0.5 + 0.5) * this.W; out.y = (-this.v4.y * 0.5 + 0.5) * this.H; return true; }
  // a line between two points in the world, cut off where it passes behind the camera
  _segment(a, b, l) {
    const cam = this.app.scene.camera, n = -cam.near - 0.01, A = this.v3.copy(a).applyMatrix4(cam.matrixWorldInverse), B = this.v4.copy(b).applyMatrix4(cam.matrixWorldInverse);
    if (A.z > n && B.z > n) return false;
    if (A.z > n) A.lerp(B, (A.z - n) / (A.z - B.z)); else if (B.z > n) B.lerp(A, (B.z - n) / (B.z - A.z));
    A.applyMatrix4(cam.projectionMatrix); B.applyMatrix4(cam.projectionMatrix);
    this.sx1 = (A.x * 0.5 + 0.5) * this.W; this.sy1 = (-A.y * 0.5 + 0.5) * this.H; this.sx2 = (B.x * 0.5 + 0.5) * this.W; this.sy2 = (-B.y * 0.5 + 0.5) * this.H;
    if (l) { l.setAttribute('x1', this.sx1.toFixed(1)); l.setAttribute('y1', this.sy1.toFixed(1)); l.setAttribute('x2', this.sx2.toFixed(1)); l.setAttribute('y2', this.sy2.toFixed(1)); }
    return true;
  }
  _blind(th, tv) { let md = 'guided'; for (const p of th.viz.phases || []) if (p.t <= tv) md = p.mode; return md === 'blind'; }
  _draw(st, t) {
    const A = this.app, cam = A.scene.camera, cv = A.scene.canvas; cam.updateMatrixWorld(); this.W = cv.clientWidth || innerWidth; this.H = cv.clientHeight || innerHeight;
    if (!this.cardH || this.frames % 30 === 0) this.cardH = this.card.offsetHeight + 18;
    const k = Math.max(0.82, Math.min(1.5, this.W / 1500)), floor = this.H - this.cardH, P = this.v1, Q = this.v2, pt = this.pt || (this.pt = { x: 0, y: 0 });
    // lines first: the guidance beam, the radar's tracks
    let nl = 0; const beamMid = this.bm || (this.bm = { on: false, x: 0, y: 0 }); beamMid.on = false;
    for (const kind of st.lines || []) {
      if (kind === 'beam' || kind === 'track') { const id = st.marks.find(m => m.at === 'missile' || m.at === 'beam'), m = id ? this._missile(id.id) : null; if (!m) continue;
        if (kind === 'beam') { const v = A.battle.volleys[id.id.v], la = v.launches.find(q => q.u && q.u.id === id.id.uid), u0 = la && la.u0, u = this._unit(id.id.uid); if (u0) A.scene.at(u0.e, u0.n, 1.3, P); else if (u) { P.copy(A.unitPos(u)); P.y += 1.3; } else continue;   /* the same end point as the page's own guidance line (volleyview._launcher) */ const l = this._line(nl), blind = this._blind(m.th, t - v.t0);
          if (!this._segment(P, m.p, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', blind ? 'rgba(200,205,202,.75)' : 'rgba(255,70,55,.8)'); l.setAttribute('stroke-width', (1.6 * k).toFixed(2)); l.setAttribute('stroke-dasharray', blind ? '3 7' : '');
          { /* the label for the beam points at the middle of the part of it that is on the page */ let x1 = this.sx1, y1 = this.sy1, x2 = this.sx2, y2 = this.sy2; const cl = (x, y) => x >= 0 && x <= this.W && y >= 40 && y <= floor;
            for (let i = 0; i < 12 && !cl(x1, y1); i++) { x1 += (x2 - x1) * 0.12; y1 += (y2 - y1) * 0.12; } for (let i = 0; i < 12 && !cl(x2, y2); i++) { x2 += (x1 - x2) * 0.12; y2 += (y1 - y2) * 0.12; }
            if (cl(x1, y1) && cl(x2, y2)) { beamMid.on = true; beamMid.x = x1 + (x2 - x1) * 0.45; beamMid.y = y1 + (y2 - y1) * 0.45; } } }
        else { this._where(STATION, P); const l = this._line(nl); if (!this._segment(P, m.p, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(255,190,80,.85)'); l.setAttribute('stroke-width', (1.4 * k).toFixed(2)); l.setAttribute('stroke-dasharray', '7 6'); } }
      else if (kind === 'tracks' && A.volleys) { this._where(STATION, P); for (const m of A.volleys.info) { if (m.tracked === false && !m.drone) continue; Q.copy(P); const l = this._line(nl); if (!this._segment(Q, m.p, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(255,190,80,.85)'); l.setAttribute('stroke-width', (1.4 * k).toFixed(2)); l.setAttribute('stroke-dasharray', '7 6'); } }
    }
    for (let i = nl; i < this.lines.length; i++) this.lines[i].style.display = 'none';
    // labels: each keeps the side of its object it was first given unless that side stops fitting
    const placed = this.placed || (this.placed = []); placed.length = 0; let nm = 0;
    for (const mkv of st.marks) {
      const m = this._mark(nm++); let on, ax, ay, off = false;
      if (mkv.at === 'beam') { on = beamMid.on; ax = beamMid.x; ay = beamMid.y; }
      else { on = this._where(mkv, P) && this._project(P, pt); ax = pt.x; ay = pt.y; if (on && (ax < this.lx || ax > this.W - 6 || ay < 44 || ay > floor - 4)) { if (mkv.at === 'cloud' || mkv.at === 'trophy' || mkv.at === 'station') on = false; else { off = true; ax = Math.max(this.lx + 8, Math.min(this.W - 14, ax)); ay = Math.max(52, Math.min(floor - 12, ay)); } } }
      if (!on) { m.el.style.display = 'none'; m.ln.style.display = 'none'; m.dot.style.display = 'none'; m.slot = -1; continue; }
      const gone = mkv.at === 'missile' && this.gone, text = gone ? mkv.gone : typeof mkv.text === 'function' ? mkv.text(this._ctx()) : mkv.text, tone = ((gone && mkv.goneTone) || mkv.tone || '') + (off ? ' off' : '');
      if (text !== m.text || tone !== m.tone || m.k !== k) { m.text = text; m.tone = tone; m.k = k; m.el.textContent = text; m.el.className = 'tl ' + tone; m.el.style.display = ''; m.w = m.el.offsetWidth; m.h = m.el.offsetHeight; m.slot = -1; const c = TONES[(gone && mkv.goneTone) || mkv.tone] || '#fff'; m.ln.setAttribute('stroke', c); m.dot.setAttribute('stroke', c); }
      const dx = 44 * k, dy = 52 * k, fits = s => { const x = s & 1 ? ax - dx - m.w : ax + dx, y = s & 2 ? ay + dy - m.h / 2 : ay - dy - m.h / 2; if (x < this.lx || x + m.w > this.W - 6 || y < 44 || y + m.h > floor) return false; for (const q of placed) if (x < q[0] + q[2] + 6 && x + m.w + 6 > q[0] && y < q[1] + q[3] + 4 && y + m.h + 4 > q[1]) return false; m.x = x; m.y = y; return true; };
      if (m.slot < 0 || !fits(m.slot)) { m.slot = -1; for (const s of [nm % 2 ? 0 : 1, nm % 2 ? 1 : 0, 2, 3]) if (fits(s)) { m.slot = s; break; } }
      if (m.slot < 0) { m.x = Math.max(this.lx, Math.min(this.W - m.w - 6, ax + dx)); m.y = Math.max(44, Math.min(floor - m.h, ay - dy - m.h / 2 - placed.length * (m.h + 4))); }   /* nowhere free: over the picture, stacked */
      placed.push([m.x, m.y, m.w, m.h]);
      m.el.style.display = ''; m.el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      const lx = ax < m.x ? m.x : ax > m.x + m.w ? m.x + m.w : ax, ly = ay < m.y ? m.y : ay > m.y + m.h ? m.y + m.h : ay, d = Math.hypot(lx - ax, ly - ay) || 1, r = 6 * k;
      m.dot.style.display = off ? 'none' : ''; m.dot.setAttribute('cx', ax.toFixed(1)); m.dot.setAttribute('cy', ay.toFixed(1)); m.dot.setAttribute('r', r.toFixed(1));
      m.ln.style.display = ''; m.ln.setAttribute('x1', (ax + (lx - ax) / d * (off ? 0 : r)).toFixed(1)); m.ln.setAttribute('y1', (ay + (ly - ay) / d * (off ? 0 : r)).toFixed(1)); m.ln.setAttribute('x2', lx.toFixed(1)); m.ln.setAttribute('y2', ly.toFixed(1));
    }
    for (let i = nm; i < this.marks.length; i++) { const m = this.marks[i]; m.el.style.display = 'none'; m.ln.style.display = 'none'; m.dot.style.display = 'none'; m.slot = -1; }
  }
}

// ---- how to watch: one screen, shown by itself on the first battle and again from the bar's "?" -----------------------------------
const HELP = [
  ['Where you watch from', 'The <b>View</b> button at the bottom opens every camera: outside, the crew\'s sights, the seats inside, and the enemy\'s side. Keys <kbd>1</kbd> to <kbd>9</kbd> jump straight to one. In Orbit, drag to look around and use the wheel to zoom.'],
  ['Let the director film it', '<b>Director</b> (key <kbd>F</kbd>) puts the camera where the action is, adds a line of plain words for each event and slows time at the decisive moment. Click the picture to take the camera back.'],
  ['Pause and speed', '<kbd>Space</kbd> pauses. The rate buttons run the battle at a quarter speed, real time, or two and four times faster.'],
  ['The map', '<b>Map</b> (key <kbd>M</kbd>) shows the ground, what can see the vehicle, and every enemy team you have found.'],
  ['What the panels say', 'The display has two forms, switched with <kbd>H</kbd>. <b>Engineer</b> shows the threats in the air, the crew, both magazines and a log (key <kbd>L</kbd>). <b>Simple</b> shows almost nothing.'],
  ['When the vehicle is hit', 'An <b>X-ray</b> panel opens by itself: which plate was struck, whether the round went through and what it damaged. After the battle, click any hit in the result list to see it again, large.'],
  ['See the enemy\'s side', 'Turn on <b>Spectator</b> in the View list to see every enemy team, look through a launcher\'s sight or ride a missile. With it off you only see what the vehicle has found.'],
  ['Afterwards', 'The result screen has a <b>Replay</b> with a time bar. New here? <b>The HKOI briefing</b> on the title screen explains the system step by step.'],
];
class Help {
  constructor(app, guide) {
    this.app = app; this.guide = guide; this.was = false; this.shownOnce = false; this.lastState = app.state;
    const el = app.el, box = this.box = el('div'); box.id = 'help'; box.hidden = true; const c = el('div', 'card panel');
    c.append(el('h2', null, 'HOW TO WATCH'), el('div', 'sub', 'The battle runs by itself: you are the observer. It is paused while this is open.'));
    const g = el('div', 'hg'); for (const [h, t] of HELP) { const i = el('div', 'hi'), p = el('p'); p.innerHTML = t; i.append(el('b', null, h), p); g.append(i); } c.append(g);
    const f = el('div', 'hf'), ok = el('button', 'btn primary', 'Got it'); ok.onclick = () => this.close();
    f.append(ok, el('span', null, 'This opens once. The ? button on the bar, or the ? key, brings it back.')); c.append(f); box.append(c); document.body.append(box);
    box.addEventListener('pointerdown', e => { if (e.target === box) this.close(); });
    this.btn = el('button', 'btn', '?'); this.btn.title = 'How to watch: the views, the director, the map, pause and speed, the X-ray (key ?)'; this.btn.style.fontWeight = '700'; this.btn.onclick = () => this.open();
    window.addEventListener('keydown', e => {
      if (!box.hidden) { if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { this.close(); e.preventDefault(); } e.stopImmediatePropagation(); return; }   /* nothing reaches the battle while the help is open */
      if (e.key === '?' && app.state === 'play' && !guide.busy && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { this.open(); e.stopImmediatePropagation(); }
    }, true);
  }
  button() { return this.btn; }
  get isOpen() { return !this.box.hidden; }
  open() { if (!this.box.hidden) return; this.was = !!this.app.playing; this.app.playing = false; this.box.hidden = false; }
  close() { if (this.box.hidden) return; this.box.hidden = true; this.app.store.set('help1', true); if (this.was && this.app.state === 'play') this.app.playing = true; this.was = false; }
  // called once a frame: the first live battle of someone who has not seen this opens it. Not during the briefing or a replay, and
  // not when the address carries test settings (gfx, speed, play: every automatic check sets one), unless help=1 asks for it.
  watch() {
    const A = this.app, s = A.state; if (s === this.lastState) return; const from = this.lastState; this.lastState = s;
    if (s !== 'play') { if (!this.box.hidden) { this.box.hidden = true; this.was = false; } return; }
    if (from === 'play' || this.shownOnce || this.guide.busy || A.replay) return;
    const q = A.q, forced = q && q.get('help') === '1', test = q && (q.get('help') === '0' || q.get('gfx') || q.get('speed') || q.get('play'));
    if (forced || (!test && !A.store.get('help1', false))) { this.shownOnce = true; this.open(); }
  }
}
