// The HKOI briefing, the Scenarios page and the first-run help: the parts of the page that explain the simulator to a newcomer.
//
// Rewritten from scratch on 16 Nov 2026 after Shawn's verdict on 1.1: "go back and start the briefing and aiming explanations from
// scratch. make them 100 times better. they have bad camera angles and dont really do a good job at explaining."
//
// THE BRIEFING tells one story in seven chapters: the problem (guided missiles; Trophy's few shots; how a beam-rider is steered and
// why blinding it works), what HKOI is, one engagement from launch to the blind missile's end ("How HKOI aims" on the title screen is
// that chapter and the next on their own), several threats at once, drones, what HKOI cannot do, and what it adds in numbers.
// Nothing in it is staged. Each chapter loads a real battle (fully decided by its settings and seed; the battles were picked by an
// honest seed search, tests/app/brief_search.mjs), finds its moments in that battle's record, and drives the page's own replay: jump
// to a time, play with slow motion into the key instant, stop there. Every number in the text is read from the record, the engine's
// settings or the fire control's own table; an assumed figure says "assumed". The camera shots are the briefing's own
// (src/app/briefcam.js) and the node test checks every step's framing.
//
// The first half of this file (CHAPTERS and what they need) uses no page, so `node tests/app/tour.test.mjs` fights every chapter's
// battle and checks each moment, sentence and framing. The second half is the page: Guide (made once by main.js), Briefing, Help.
//
// Frame rate: the simulation is advanced by the page as always; this file only reads battle time. The camera and the labels are
// functions of where things are this frame and of battle time, so they look the same at any frame rate.
import { ScenarioPage, SCENARIOS } from './scenarios.js';
import { AIM_SETUP, findAim, findOrder, layerFacts, tableFacts, geoSVG, queueSVG, layerSVG, guideSVG, droneSVG, closeSVG, endPhrase } from './targeting.js';
import { SHOTS, chooseSide, frameOf, clearArea } from './briefcam.js';

const S = (biome, map, force, skill, waves, seed) => ({ biome, map, force, skill, waves, seed });
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
  return { payload: r.payload_g, form: o.form_s, obs0: g.obscurant_rounds, he0: g.he_rounds, gap: g.rof_rpm ? 60 / g.rof_rpm : null, hePk: r.he_pk_drone, saclos: o.saclos_effect, aps0: a.mag_per_side, apsR: a.radar_range_m, apsDrone: a.pk_drone };
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
function findDrones(B) {
  const mk = (v, th) => { const bs = bursts(v, th, false), end = th.viz.end; return { id: ident(v, th), t0: v.t0, tL: v.t0 + th.t0, tF: v.t0 + bs[0].rounds[0].t_fire, tK: v.t0 + end.t, d: end.d, n: bs.length, rounds: bs.reduce((k, b) => k + b.rounds.length, 0), first: bs[0].rounds.length, speed: th.v, name: NAME[th.key] || th.key, fibre: th.key === 'fpv_fiber', R: th.R, t0th: v.t0 + th.t0, rds: bs[0].rounds.map(r => ({ tf: v.t0 + r.t_fire, tp: v.t0 + r.t_pass, d: r.d })) }; };
  const ok = (v, th) => /^fpv/.test(th.key) && th.defeated_by === 'hkoi_he' && th.viz.end.type === 'he_kill' && bursts(v, th, false).length > 0;
  const one = each(B, (v, th) => (ok(v, th) && bursts(v, th, false).length === 1 ? mk(v, th) : null)), multi = each(B, (v, th) => (ok(v, th) && bursts(v, th, false).length >= 2 ? mk(v, th) : null));
  if (!one) return null;
  return { one, multi, cfg: settings(B), all: tally(B) };
}
// what HKOI does not stop: a guided missile Trophy had to take, and an unguided rocket
function findLimits(B) {
  const mk = (v, th) => { const a = (v.rec.aps || []).find(q => q.idx === th.idx && q.kill) || {}, tags = th.tags || [];
    const why = th.skip && th.skip.why === 'min_range' ? 'min' : tags.includes('handed_to_aps') ? 'handed' : tags.includes('saclos_unaffected') ? 'saclos' : tags.includes('cloud_thin') ? 'thin' : th.key === 'rpg' ? 'rpg' : 'other';
    const c = v.cfg || {}, k = v.rec.ctx && v.rec.ctx.k, v0 = c.rnd && c.rnd.muzzle_v, L = (B.lookup || {})[th.key], g0 = L ? L.grid[0] : null;
    return { id: ident(v, th), t0: v.t0, tL: v.t0 + th.t0, tA: v.t0 + (a.t != null ? a.t : th.viz.end.t), side: a.side || 'R', d: th.viz.end.d, flight: th.viz.end.t - th.t0, R: th.R, why, name: NAME[th.key] || th.key,
      track: th.track != null ? v.t0 + th.track : null, g0, tof: g0 && k && v0 ? Math.expm1(k * g0) / (k * v0) : null, form: c.obs ? c.obs.form_s : null }; };
  const guided = w => each(B, (v, th) => (th.defeated_by === 'aps' && (th.key === 'saclos' || th.key === 'kornet') && mk(v, th).why === w ? mk(v, th) : null));
  const close = guided('handed') || guided('min') || guided('saclos') || guided('thin') || guided('other');
  const rpg = each(B, (v, th) => (th.defeated_by === 'aps' && th.key === 'rpg' ? mk(v, th) : null));
  if (!close && !rpg) return null;
  return { close, rpg, cfg: settings(B), all: tally(B) };
}
// saturation: the biggest volley, the first hit on the vehicle and why nothing stopped it, and how the crew stood at the end
// ---- reading the battle as it stands now (the page hands the live battle; the node test hands the finished one) -----------------
const mags = b => { const st = (b && b.tank && b.tank.st) || {}; return { obs: st.obs, he: st.he, L: st.apsL, R: st.apsR }; };
function crewNow(b) { const cs = b && b.crewState ? b.crewState() : null; if (!cs || !cs.on || !cs.who) return null; const o = {}; for (const r of Object.keys(CREW)) if (cs.who[r]) o[r] = { state: cs.who[r].state, status: cs.who[r].status }; return o; }
const crewLine = c => Object.keys(CREW).filter(r => c[r]).map(r => `${CREW[r]} ${c[r].status === 'down' ? 'out of action' : c[r].status === 'wounded' ? 'wounded and ' + c[r].state : c[r].state}`).join(', ');

// ---- the chapters --------------------------------------------------------------------------------------------------------------
// A step: { key, head, text(X), facts, from, to, rates, freeze, shot, id, pts, marks, lines, diagram, panel }
//   from, to   battle time: the replay jumps to `from`, plays and stops at `to` (from === to: a still picture)
//   rates      [[battle time, playback rate], ...]: the rate changes as play passes each time (slow motion into the key instant)
//   freeze     what the stopped picture is, in a few words ("frozen at the cut")
//   shot       { kind, o, subj, size, min }: a camera from src/app/briefcam.js (SHOTS[kind] with options o), and the framing the
//              node test holds it to: the subject `subj` must be inside the clear picture and at least `min` of the screen height
//              tall for an object `size` metres high (min 0: only inside)
//   id         the threat the step is about: { v: volley, idx, uid: launching team, brg, R }
//   pts        named points out along that threat's line: { name: [metres from the tank, metres above the ground] }
//   marks      labels with leader lines: { at: 'missile' | 'launcher' | 'tank' | 'station' | 'trophy' | 'pt', text, tone, pt, after, gone }
//   lines      'track' (radar: station to the missile), 'bearing' (the warning's bearing, out from the tank)
//   diagram    { kind: 'geo' | 'queue' | 'layers' | 'guide', focus }
//   X          { b: the battle as it stands }
const mk = (at, text, more) => Object.assign({ at, text }, more || {});
const MAIN = AIM_SETUP, DRONES = S('desert', 3, 'drones', 'trained', 1, 3), LIMITS = S('desert', 6, 'light', 'trained', 2, 3);
const pct = p => Math.round(100 * p) + '%';
const f2 = x => (Math.round(x * 100) / 100).toFixed(2), m0 = m => Math.round(m).toLocaleString('en-GB') + ' m', km2 = m => (m / 1000).toFixed(2) + ' km';
// the whole battle's story for chapters 1 to 4 (one battle): the lone Kornet, the volley of four, the settings, the planning table
function findMain(B, HK) {
  const D = findAim(B, HK), O = findOrder(B, HK); if (!D || !O) return null;
  const kill = HK && HK.THREATS && HK.THREATS[D.key] ? HK.THREATS[D.key].kill : null;
  return { D, O, L: layerFacts(B, HK), TB: tableFacts(B, D.key), cfg: settings(B), kill, calm: Math.max(1, D.T0 + D.tL - 7), all: tally(B) };
}
const lineH = 4;   /* metres above the ground for a point on a missile's line: a beam-rider flies 2 to 2.5 m above its gunner's sight line (engine los_off) */

export const CHAPTERS = [
  { key: 'problem', name: 'The problem', setup: MAIN, find: findMain, steps: M => { const D = M.D, A = u => D.T0 + D.tL + u, id = D.id; return [
    { key: 'team', head: 'A missile team, 3 km away', from: A(-2.2), to: A(0.06), rates: [[A(-2.2), 1], [A(-0.5), 0.2]], freeze: 'at launch', id,
      shot: { kind: 'team', subj: 'launcher', size: 1.8, min: 0.07 }, marks: [mk('launcher', `${D.name} team`, { tone: 'bad' }), mk('missile', `${D.name} missile`, { tone: 'bad' })],
      facts: [['Range', km2(D.R)], ['Speed', `${Math.round(D.speed)} m/s`], ['Flight', `${f2(D.flight)} s`]],
      text: () => `This is a real battle from the simulator, played back. A ${D.name} anti-tank missile team fires at the tank from ${km2(D.R)}. The missile needs ${f2(D.flight)} s to get there.${M.kill != null ? ` In the model one hit knocks the tank out ${pct(M.kill)} of the time (assumed).` : ''}` },
    { key: 'beam', head: 'It rides a laser beam', from: A(2.2), to: A(4.6), rates: [[A(2.2), 0.4]], freeze: 'in flight', id,
      shot: { kind: 'line', o: { track: true, span: 46, back: 0.35, up: 0.12 }, subj: 'missile', size: 1.2, min: 0 }, diagram: { kind: 'guide', focus: 'beam' },
      marks: [mk('missile', 'Missile', { tone: 'bad' }), mk('beamtag', 'Laser beam from the launcher', { tone: 'bad' })],
      text: () => `The missile has no eyes at the front. The team's sight shines a laser beam at the tank. A receiver in the missile's tail looks back at that beam and steers to stay in its middle. As long as the gunner keeps his sight on the tank, the missile follows it.` },
    { key: 'weak', head: 'Its weak point: the tail looks back', from: A(4.6), to: A(5.6), rates: [[A(4.6), 0.4]], freeze: 'in flight', id,
      shot: { kind: 'tail', subj: 'missile', size: 1.2, min: 0 }, diagram: { kind: 'guide', focus: 'beam' },
      marks: [mk('missile', 'Receiver in its tail', { tone: 'bad' }), mk('beamtag', 'It looks back along the beam', { tone: 'bad' })],
      text: () => `The receiver in the missile's tail looks back along the beam towards the launcher. Put a cloud anywhere on that line and the beam no longer reaches the receiver. With nothing to steer by, the missile flies on blind and misses. That is HKOI's whole idea: blind the missile, do not try to hit it.` },
    { key: 'trophy', head: 'Trophy: the last line, few shots', from: M.calm, to: M.calm, freeze: 'before the shot', id,
      shot: { kind: 'trophy', subj: 'trophy', size: 1, min: 0.1 }, marks: [mk('trophy', 'Trophy launcher', { tone: 'good', side: 'L' })],
      facts: [['Shots a side', String(M.cfg.aps0)], ['Reaches out', m0(M.cfg.apsR)]],
      text: () => `The tank already has Trophy: a radar and a launcher on each side of the turret that fire a charge at a missile in the last metres. It works well, but it has only ${word(M.cfg.aps0)} shots a side before it must be reloaded. A defence that stops missiles further out saves those shots for what nothing else can stop.` },
  ]; } },
  { key: 'hkoi', name: 'Meet HKOI', setup: MAIN, find: findMain, steps: M => { const D = M.D, L = M.L, id = D.id, t = M.calm; return [
    { key: 'station', head: 'A 30 mm gun on the roof', from: t, to: t + 3, rates: [[t, 1]], freeze: 'waiting', id, shot: { kind: 'station', subj: 'station', size: 1, min: 0.12 },
      marks: [mk('station', 'HKOI weapon station', { tone: 'good' })], facts: [['Obscurant rounds', String(L.obs0)], ['Airburst rounds', String(L.he0)], ['Rate of fire', `${L.rof} a minute`]],
      text: () => `HKOI is this remote weapon station: a 30 mm cannon on the turret roof, aimed by a computer. It carries two kinds of round: ${L.obs0} obscurant rounds that burst into a small cloud, and ${L.he0} airburst rounds that explode beside a drone.` },
    { key: 'senses', head: 'What tells it where to look', from: t + 3, to: t + 6, rates: [[t + 3, 1]], freeze: 'waiting', id, shot: { kind: 'tank', subj: 'tank', size: 3, min: 0.18 }, diagram: { kind: 'layers', focus: 'sense' },
      marks: [mk('station', 'Radar and gun', { tone: 'good' }), mk('tank', 'Laser warning receivers', { tone: 'warn' })],
      text: () => `A laser warning receiver feels a guidance beam touch the tank and reports its direction. A radar, always on, then finds the missile in that direction and tracks it. Trophy's own short radar also passes on what it sees inside ${m0(L.apsR)}. A computer, the fire control, decides when and where to fire.` },
    { key: 'layers', head: 'Layers, from far to near', from: t + 6, to: t + 6, freeze: 'waiting', id, shot: { kind: 'overhead', o: { h: 75 }, subj: 'tank', size: 3, min: 0.04 }, diagram: { kind: 'layers', focus: 'cloud' },
      marks: [mk('tank', 'The tank', { tone: 'good' })],
      text: () => `So the defence is in layers. HKOI lays its cloud ${m0(L.obsMin)} to ${m0(L.obsMax)} out, where its planning table goes. Its airburst meets drones near ${m0(L.heDrone)}. Trophy at the hull takes whatever is left. Next: one missile, start to finish.` },
  ]; } },
  { key: 'aim', name: 'One shot, start to finish', setup: MAIN, find: findMain, steps: M => { const D = M.D, A = u => D.T0 + u, id = D.id, geo = focus => ({ kind: 'geo', focus });
    const far = Math.max(...D.puffs.map(p => p.x)), r1 = D.rounds[0], fates = [D.nBloom ? `${D.nBloom} burst` : '', D.nDown ? `${D.nDown} flew on without bursting` : '', D.nCo ? `${D.nCo} were timed to burst` : ''].filter(Boolean).join(', ');
    const pts = { meet: [D.plan.want, lineH], k1: [1000, 0], k2: [2000, 0], fire: [D.plan.dFire, lineH], cut: [D.cut.d, lineH], end: [D.end.type === 'ground' ? D.end.short : 4, 2] };
    return [
    { key: 'launch', head: '1. Launch', from: A(D.tL - 1.2), to: A(D.tL + 0.05), rates: [[A(D.tL - 1.2), 0.5], [A(D.tL - 0.3), 0.1]], freeze: 'at launch', id, pts,
      shot: { kind: 'team', subj: 'launcher', size: 1.8, min: 0.07 }, diagram: geo('chain'), marks: [mk('launcher', `${D.name} team, ${km2(D.R)}`, { tone: 'bad' })],
      facts: [['Range', km2(D.R)], ['Bearing', `${Math.round(D.brg)}°`], ['Speed', `${Math.round(D.speed)} m/s`]],
      text: () => `The same shot, now step by step. The clock starts at launch. The team fires from ${km2(D.R)} away, from bearing ${Math.round(D.brg)}° (the compass direction seen from the tank). Every number on these pages comes from the simulator's record of this one shot.` },
    { key: 'warn', head: '2. The laser warning', from: A(D.warn.t), to: A(D.warn.t), freeze: 'at the warning', id, pts, lines: ['bearing'],
      shot: { kind: 'bearing', subj: 'tank', size: 3, min: 0.06 }, diagram: geo('bearing'), marks: [mk('bearing', `Warning from ${Math.round(D.brg)}°`, { tone: 'warn' })],
      text: () => `${f2(D.warn.dt)} s after launch the laser warning receiver feels the beam and reports its direction: ${Math.round(D.brg)}°. It cannot tell the range. Its ${D.warn.sigma}° bearing error is a setting the simulator does not use yet: the radar is pointed exactly down the reported bearing.` },
    { key: 'radar', head: '3. The radar finds it', from: A(D.warn.t), to: A(D.radar.tTrack + 0.2), rates: [[A(D.warn.t), 0.1]], freeze: 'track formed', id, pts, lines: ['bearing', 'track'],
      shot: { kind: 'bearing', subj: 'tank', size: 3, min: 0.06 }, diagram: geo('bearing'), marks: [mk('missile', `Track: ${km2(D.radar.dTrack)}, ${Math.round(D.radar.closing)} m/s`, { tone: 'bad', after: A(D.radar.tTrack) })],
      facts: [['Found', `${f2(D.radar.tAcq - D.warn.t)} s after warning`], ['Track at', km2(D.radar.dTrack)], ['To impact', `${f2(D.radar.tti)} s`]],
      text: () => `The radar looks down that bearing and finds the missile ${f2(D.radar.tAcq - D.warn.t)} s after the warning. ${f2(D.radar.init)} s later it holds a track: ${km2(D.radar.dTrack)} out, closing at ${Math.round(D.radar.closing)} m/s. Shawn's "firing corridor" is, in this model, simply that bearing.` },
    { key: 'plan', head: '4. Planning where to meet it', from: A(D.plan.tF - 0.6), to: A(D.plan.tF - 0.6), freeze: 'before firing', id, pts,
      shot: { kind: 'plan', subj: 'meet', also: ['tank', 'launcher'], size: 0, min: 0 }, lines: ['path', 'round', 'ticks'], diagram: geo('table'),
      marks: [mk('tank', 'Tank', { tone: 'good' }), mk('pt', `Meet here: ${m0(D.plan.want)}`, { tone: 'good', pt: 'meet' }), mk('missile', `${D.name} now`, { tone: 'bad' }), mk('launcher', `Launcher, ${km2(D.R)}`, { tone: 'bad' })],
      facts: [['Meet at', m0(D.plan.want)], ['Table says', pct(D.plan.p)], ['Round flies', `${f2(D.plan.tof)} s`]],
      text: () => `The fire control looks up its table, made beforehand from many trial engagements (gunner's wander and the tank's own movement included, assumed figures). A cloud ${m0(D.plan.want)} out cut a ${D.name} in ${pct(D.plan.p)} of trials, the best distance. A round takes ${f2(D.plan.tof)} s to get there, so the gun waits ${f2(D.plan.wait)} s.` },
    { key: 'fire', head: '5. Fire', from: A(D.plan.tF - 0.35), to: A(D.plan.tF + (D.nFirst - 1) * D.plan.gap + 0.25), rates: [[A(D.plan.tF - 0.35), 0.25]], freeze: 'burst fired', id, pts,
      shot: { kind: 'station', subj: 'station', size: 1, min: 0.1 }, diagram: geo('chain'), marks: [mk('station', `${D.nFirst} rounds, ${f2(D.plan.gap)} s apart`, { tone: 'good' })],
      facts: [['Fired at', `${f2(D.plan.tF - D.tL)} s`], ['Missile then', m0(D.plan.dFire)], ['Muzzle speed', `${Math.round(D.plan.v0)} m/s`]],
      text: () => `${f2(D.plan.tF - D.tL)} s after launch, with the missile ${m0(D.plan.dFire)} out, the gun fires ${word(D.nFirst)} obscurant rounds, ${f2(D.plan.gap)} s apart. They are not aimed to hit the missile. They are timed to arrive beside its path and burst just behind it.` },
    { key: 'meet', head: '6. Overtake and bloom', from: A(r1.tPass - 0.45), to: A(D.tFirstPuff + 0.1), rates: [[A(r1.tPass - 0.45), 0.12]], freeze: 'first puff', id, pts,
      shot: { kind: 'tail', subj: 'missile', size: 1.2, min: 0 }, diagram: geo('chain'),
      marks: [mk('missile', D.name, { tone: 'bad' })],
      text: () => `${f2(r1.tPass - r1.tFire)} s later the first round reaches the missile, ${m0(r1.d)} out. The rounds pass it and burst just behind it, on the line back to the launcher: overtake and bloom. Of ${D.n} rounds, ${fates}. The radar saw it still guiding after the first ${D.nFirst}, so ${D.nExtra} more followed.` },
    { key: 'cloud', head: '7. The cloud on the line', from: A(D.tFirstPuff), to: A(D.cut.t - 0.05), rates: [[A(D.tFirstPuff), 0.25]], freeze: 'just before the cut', id, pts,
      shot: { kind: 'tail', subj: 'missile', size: 1.2, min: 0 }, diagram: geo('light'), marks: [mk('missile', D.name, { tone: 'bad' }), mk('beamtag', 'Beam back to the launcher', { tone: 'bad' })],
      text: () => `Beside the missile, looking back along its beam. Each round leaves a puff about ${Math.round(2 * D.s0)} m across (${D.payload} g of obscurant, an assumed round). Puffs between the missile and the launcher dim the beam. The panel shows how much light still gets through.` },
    { key: 'cut', head: '8. Cut', from: A(D.cut.t - 0.35), to: A(D.cut.t + 0.04), rates: [[A(D.cut.t - 0.35), 0.1]], freeze: 'frozen at the cut', id, pts,
      shot: { kind: 'tail', subj: 'missile', size: 1.2, min: 0 }, diagram: geo('light'), marks: [mk('missile', 'CUT: blind', { tone: 'hk' })],
      facts: [['Cut at', m0(D.cut.d)], ['After launch', `${f2(D.cut.dt)} s`], ['Light left', `under ${(100 * Math.exp(-D.need)).toFixed(1)}%`]],
      text: () => `${f2(D.cut.dt)} s after launch the light reaching the tail drops below ${(100 * Math.exp(-D.need)).toFixed(1)}%, the level the model says the receiver needs. The missile, ${m0(D.cut.d)} from the tank, has lost its guidance. The cloud took ${f2(D.cut.t - D.tFirstPuff)} s from the first puff to get thick enough.` },
    { key: 'blind', head: '9. Blind flight', from: A(D.cut.t + 0.04), to: A(D.end.t + 0.35), rates: [[A(D.cut.t + 0.04), 0.4]], freeze: 'where it ended', id, pts,
      shot: { kind: 'chase', o: { back: 22 }, subj: 'end', size: 0, min: 0 }, diagram: geo('chain'), marks: [mk('missile', 'Blind', { tone: 'hk', gone: endPhrase(D), goneTone: 'warn', goneAt: 'end' }), mk('tank', 'The tank', { tone: 'good' })],
      text: () => `With no beam, the ${D.name} keeps rolling but gets no more corrections. In the model it leaves its corkscrew along a straight line and, with no steering lift, sinks: this one ${endPhrase(D)} of the tank, ${f2(D.end.gone)} s after the cut. Trophy never had to fire.` },
  ]; } },
  { key: 'many', name: 'Several at once', setup: MAIN, find: findMain, steps: M => { const O = M.O, A = u => O.T0 + u, idOf = r => ({ v: O.id.v, idx: r.idx, uid: r.uid, brg: r.brg, R: r.R });
    const kinds = {}; for (const r of O.rows) kinds[r.name] = (kinds[r.name] || 0) + 1; const kl = Object.entries(kinds).map(([k, n]) => `${word(n)} ${k}${n > 1 && !/s$/.test(k) ? 's' : ''}`);
    const first = O.gunOrder[0], toAps = O.rows.filter(r => r.by === 'aps'), h = toAps[0], cuts = O.rows.filter(r => r.by === 'hkoi_cut'), skim = cuts.filter(r => r.endType === 'miss' && r.miss != null).sort((a, b) => a.miss - b.miss)[0];
    const hits = O.rows.filter(r => r.endType === 'hit'), skimCut = skim && skim.cutT != null ? Math.max(0, skim.R - skim.speed * (skim.cutT - skim.t0)) : 0;
    const steps = [
    { key: 'many', head: `${Word(O.n)} at once`, from: A(-0.3), to: A(Math.min(2.4, O.lastTrack + 0.4)), rates: [[A(-0.3), 0.4]], freeze: 'all tracked', id: idOf(first),
      shot: { kind: 'overhead', o: { h: 130, fov: 50 }, subj: 'tank', size: 3, min: 0.015 }, lines: ['tracks'], diagram: { kind: 'queue' }, marks: [mk('tank', 'The tank', { tone: 'good' })].concat(O.rows.map(r => mk('missile', r.label, { tone: 'bad', id: idOf(r) }))),
      text: () => `${Math.round(O.T0)} s into the same battle, ${list(kl)} were fired within ${(Math.round(O.spread * 10) / 10).toFixed(1)} s from different directions. The radar tracks them all within ${(Math.round(O.lastTrack * 10) / 10).toFixed(1)} s. But there is one gun: the fire control has to choose.` },
    { key: 'queue', head: 'Who gets the gun', from: A(first.bursts[0].tf - 0.3), to: A(first.bursts[0].tf + 0.6), rates: [[A(first.bursts[0].tf - 0.3), 0.25]], freeze: 'first burst', id: idOf(first),
      shot: { kind: 'station', subj: 'station', size: 1, min: 0.1 }, diagram: { kind: 'queue' }, marks: [mk('station', `Firing at ${first.label}`, { tone: 'good' })],
      text: () => `It plans with what it knows at each moment: when each one will arrive, where a cloud could meet it, and how many Trophy shots are left on that side. ${first.label} gets the gun first.${h ? ` ${h.label}, fired from only ${km2(h.R)}, arrives too soon for a cloud to work: it is left to Trophy.` : ''}` },
  ];
    if (h) steps.push({ key: 'trophy', head: 'Trophy takes what HKOI cannot', from: A(h.endT - 1.1), to: A(h.endT + 0.25), rates: [[A(h.endT - 1.1), 0.25]], freeze: 'Trophy fires', id: idOf(h),
      shot: { kind: 'trophy', subj: 'trophy', size: 1, min: 0.08 }, diagram: { kind: 'queue' }, marks: [mk('trophy', 'Trophy fires', { tone: 'good', side: (h.aps[0] || {}).side || 'L' }), mk('missile', h.label, { tone: 'bad' })],
      text: () => `Trophy destroys ${h.label} in the last metres. ${toAps.length > 1 ? `It took ${word(toAps.length)} in this volley. ` : ''}That is the point of sharing the work: Trophy's few shots go where a cloud has no time to work, and HKOI saves them everywhere else.` });
    steps.push({ key: 'result', head: hits.length ? 'How the volley ended' : 'None of them hit', from: A(O.tEnd + 0.4), to: A(O.tEnd + 0.4), freeze: 'after the volley', id: idOf(skim || first),
      shot: { kind: 'tank', subj: 'tank', size: 3, min: 0.18 }, diagram: { kind: 'queue' }, marks: [mk('tank', hits.length ? 'Hit' : 'Unhurt', { tone: hits.length ? 'bad' : 'good' })],
      text: () => `HKOI's clouds cut ${word(cuts.length)}, Trophy took ${word(toAps.length)}${hits.length ? `, and ${word(hits.length)} hit` : ', none hit'}.${skim ? ` A cut missile still flies on: ${skim.label} lost its guidance ${m0(skimCut)} out and passed ${(Math.round(skim.miss * 10) / 10).toFixed(1)} m from the hull's centre. A late cut is not a safe cut.` : ''}` });
    return steps; } },
  { key: 'drones', name: 'Drones', setup: DRONES, find: findDrones, steps: M => { const o = M.one, kmh = Math.round(o.speed * 3.6 / 10) * 10; return [
    { key: 'drone', head: 'A drone has no beam to cut', from: Math.max(o.tL + 0.4, o.tF - 3), to: o.tF - 0.2, rates: [[0, 0.5]], freeze: 'before firing', id: o.id, pts: { kill: [o.d, 30] },
      shot: { kind: 'drone', o: { dist: 6 }, subj: 'missile', size: 0.5, min: 0.06 }, diagram: { kind: 'drone' }, marks: [mk('missile', cap(o.name), { tone: 'bad' })],
      text: () => `An FPV drone: a small racing aircraft with an anti-tank charge, flown by a pilot through a video link at about ${kmh} km/h. It has no guidance beam to cut, so HKOI uses its other magazine: airburst rounds that explode beside it.` },
    { key: 'airburst', head: 'Airburst', from: o.tF - 0.2, to: o.tK + 0.5, rates: [[o.tF - 0.2, 0.25]], freeze: 'shot down', id: o.id, pts: { kill: [o.d, 30] },
      shot: { kind: 'drone', o: { dist: 16 }, subj: 'missile', size: 0.5, min: 0.02 }, diagram: { kind: 'drone' }, marks: [mk('missile', cap(o.name), { tone: 'bad' })],   /* once it is down the explosion is the mark; the panel gives the distance */
      facts: [['Rounds', String(o.first)], ['Down at', m0(o.d)], ['After firing', `${f2(o.tK - o.tF)} s`]],
      text: () => `The gun fires ${word(o.first)} airburst rounds set to explode beside the drone. It falls ${m0(o.d)} from the tank, ${f2(o.tK - o.tF)} s after the first round left the gun. In the model one full burst brings a drone down ${pct(M.cfg.hePk)} of the time before it can dodge (assumed).` },
  ]; } },
  { key: 'limits', name: 'What HKOI cannot do', setup: LIMITS, find: (B, HK) => { const r = findLimits(B); if (r) r.keSpeed = HK && HK.THREATS && HK.THREATS.ke ? HK.THREATS.ke.speed : null; return r; }, steps: M => [
    !M.rpg ? null : { key: 'rpg', head: 'Unguided: nothing to blind', from: Math.max(0, M.rpg.tL - 0.8), to: M.rpg.tA + 0.08, rates: [[Math.max(0, M.rpg.tL - 0.8), 0.25]], freeze: 'Trophy fired', id: M.rpg.id, pts: { site: [M.rpg.R, 1], kill: [M.rpg.d + 2, 1.8] },
      shot: { kind: 'line', o: { at: 'kill', span: 34, back: 0.35, up: 0.22 }, subj: 'kill', size: 0, min: 0, also: ['tank'] }, diagram: { kind: 'close', which: 'rpg' }, marks: [mk('missile', 'RPG rocket', { tone: 'bad' }), mk('pt', `Trophy hit it here, ${m0(M.rpg.d)} out`, { tone: 'good', pt: 'kill', after: M.rpg.tA })],
      text: () => `An RPG is an unguided rocket: once it is fired there is nothing to blind. This one came from ${m0(M.rpg.R)} and arrived in ${f2(M.rpg.flight)} s. HKOI holds its fire on rockets. Trophy destroyed it ${m0(M.rpg.d)} from the armour.` },
    !M.close ? null : { key: 'close', head: 'Too close for a cloud', from: Math.max(0, M.close.tL - 0.5), to: M.close.tA + 0.08, rates: [[Math.max(0, M.close.tL - 0.5), 0.5], [M.close.tA - 0.8, 0.2]], freeze: 'Trophy fired', id: M.close.id, pts: { site: [M.close.R, 1], kill: [M.close.d + 2, 2.5] },
      shot: { kind: 'line', o: { at: 'kill', span: 34, back: 0.35, up: 0.22 }, subj: 'kill', size: 0, min: 0, also: ['tank'] }, diagram: { kind: 'close', which: 'close' }, marks: [mk('missile', cap(M.close.name), { tone: 'bad' }), mk('pt', `Trophy hit it here, ${m0(M.close.d)} out`, { tone: 'good', pt: 'kill', after: M.close.tA })],
      text: () => `This ${M.close.name} came from ${km2(M.close.R)}: ${f2(M.close.flight)} s of flight. A cloud needs time: the rounds must fly out, burst, and the puffs must form on the line. The fire control judged there was not enough and left it to Trophy, which destroyed it ${m0(M.close.d)} from the armour.` },
    { key: 'none', head: 'What nothing here stops', from: (M.rpg || M.close).tA + 2, to: (M.rpg || M.close).tA + 2, freeze: 'after', id: (M.rpg || M.close).id, shot: { kind: 'tank', subj: 'tank', size: 3, min: 0.18 },
      marks: [mk('tank', 'M1A2 SEPv3', { tone: 'warn' })],
      text: X => { const m = mags(X.b); return `A tank's armour-piercing round flies at ${M.keSpeed ? M.keSpeed.toLocaleString('en-GB') + ' m/s' : 'well over 1,000 m/s'}: nothing in this simulator stops it. And many missiles at once can use up both Trophy's shots and the gun's time.${m.L != null ? ` Trophy shots left here: ${m.L} left side, ${m.R} right.` : ''}` } },
  ].filter(Boolean) },
  { key: 'numbers', name: 'What it adds', setup: MAIN, find: findMain, steps: M => [
    { key: 'table', head: 'One battle proves nothing', from: M.calm, to: M.calm, freeze: '', id: M.D.id, shot: { kind: 'overhead', o: { h: 45 }, subj: 'tank', size: 3, min: 0.06 }, panel: 'ref', marks: [],
      text: () => `Each chapter showed one picked battle. To learn what HKOI is worth, the simulator fights the same raid a thousand times under four setups, on the same dice. ${gain()}` },
    { key: 'next', head: 'Try it yourself', from: M.calm, to: M.calm, freeze: '', id: M.D.id, shot: { kind: 'station', subj: 'station', size: 1, min: 0.1 }, panel: 'numbers', marks: [],
      text: () => `Below, a small run of ${600} raids starts now in your browser, so you can see the spread for yourself. Run the numbers on the title screen fights thousands, map by map. Scenarios has ${String(NUM[SCENARIOS.length] || SCENARIOS.length).toLowerCase()} battles picked to show one thing each.` },
  ] },
];
// the reference run quoted on the last chapter: docs/HKOI_NUMBERS.md, addendum of 16 Nov 2026, `node tests/study/hkoi_only.js 1000`
// (1,000 raids per row, the same dice for every setup, the 1.1 engine). A measured record, not a setting; the page says where it is from.
const gain = () => { const R = REFERENCE.rows, d = (a, b, k) => Math.round(R[a][k] - R[b][k]); return `Measured that way, HKOI adds ${d(2, 0, 1)} points of survival alone and ${d(3, 1, 1)} on top of Trophy against average gunners; against the best gunners ${d(2, 0, 2)} and ${d(3, 1, 2)}.`; };
export const REFERENCE = { src: 'Measured 16 Nov 2026: 1,000 raids per row, same dice for each setup (tests/study/hkoi_only.js)', head: ['Setup', 'Average gunner (3 mrad)', 'Best gunner (0.5 mrad)'],
  rows: [['No protection', 81.2, 32.6], ['Trophy only', 92.9, 72.8], ['HKOI only', 86.1, 48.1], ['HKOI and Trophy', 96.7, 87.2]], cut: 'Beams cut per missile engaged: 17 to 18% (average gunner), 49 to 53% (best gunner).' };
export const sameSetup = (a, b) => !!a && !!b && a.biome === b.biome && a.map === b.map && a.force === b.force && a.skill === b.skill && a.waves === b.waves && a.seed === b.seed;

// ================================================================================================================================
// The page
// The panel's width and the top bar's height are briefcam.js PANEL (the camera framing and the node test use the same figures).
const CSS = `
  #tour { position: fixed; inset: 0; z-index: 8; pointer-events: none; font-size: clamp(13px, 1vw, 20px); }   /* everything is sized in em from this */
  #tour > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  #tour .tl { position: absolute; left: 0; top: 0; padding: .3em .65em .34em; border-radius: 6px; background: rgba(5, 9, 8, .88); border: 2px solid rgba(255, 255, 255, .55); color: #fff; font-weight: 700; font-size: 1.02em; line-height: 1.2; white-space: nowrap; will-change: transform; }
  #tour .tl.good { border-color: #39d98a; color: #d2ffe8; } #tour .tl.bad { border-color: #ff6b5e; color: #ffe0dc; } #tour .tl.warn { border-color: #ffb347; color: #ffecc9; } #tour .tl.hk { border-color: #6fd3ff; color: #d9f4ff; } #tour .tl.off { opacity: .85; }
  #tour-top { position: absolute; left: 0; right: 0; top: 0; height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: .35em; padding: 0 .7em; pointer-events: none; background: linear-gradient(180deg, rgba(4, 8, 7, .85), rgba(4, 8, 7, .35)); overflow: hidden; }
  #tour-top button { pointer-events: auto; cursor: pointer; font-size: .8em; padding: .3em .75em; border-radius: 99px; border: 1px solid rgba(255, 255, 255, .22); background: rgba(5, 9, 8, .8); color: #c6d2cb; white-space: nowrap; }
  #tour-top button:hover { border-color: var(--accent); color: #fff; } #tour-top button.on { background: var(--accent); border-color: var(--accent); color: #05130c; font-weight: 700; } #tour-top button.done { color: var(--accent); border-color: var(--line); }
  #tour-card { position: absolute; left: 0; top: 44px; bottom: 0; width: clamp(330px, 33vw, 640px); box-sizing: border-box; display: flex; flex-direction: column; pointer-events: auto; background: rgba(6, 11, 9, .95); border-right: 1px solid var(--line); box-shadow: 6px 0 30px rgba(0, 0, 0, .35); }
  #tour-card .tp-body { flex: 1; min-height: 0; overflow-y: auto; padding: .8em 1.05em .4em; display: flex; flex-direction: column; } #tour-card .tp-body > * { flex: none; }
  #tour-card .tp-tag { font: 700 .74em/1.2 var(--mono); letter-spacing: .1em; color: var(--accent); text-transform: uppercase; }
  #tour-card .tp-dots { display: flex; align-items: center; gap: .32em; margin: .45em 0 .2em; flex-wrap: wrap; }
  #tour-card .tp-dots button { width: .8em; height: .8em; padding: 0; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, .35); background: transparent; cursor: pointer; }
  #tour-card .tp-dots button.done { background: rgba(57, 217, 138, .45); border-color: var(--accent); } #tour-card .tp-dots button.on { background: var(--accent); border-color: var(--accent); transform: scale(1.25); }
  #tour-card .tp-dots span { margin-left: .5em; font: .74em var(--mono); color: var(--dim); }
  #tour-card h2 { margin: .25em 0 .3em; font-size: 1.5em; line-height: 1.15; letter-spacing: .005em; }
  #tour-card .tp-text { margin: 0 0 .6em; font-size: 1.08em; line-height: 1.45; color: #eef5f0; }
  #tour-card .tp-facts { display: flex; gap: .5em; margin: 0 0 .7em; flex-wrap: wrap; } #tour-card .tp-facts[hidden] { display: none; }
  #tour-card .tp-facts div { flex: 1 1 0; min-width: 6.5em; padding: .35em .55em .4em; border-radius: 7px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .1); }
  #tour-card .tp-facts b { display: block; font: 700 1.12em/1.15 var(--mono); color: #fff; } #tour-card .tp-facts span { display: block; font-size: .78em; color: var(--dim); margin-top: .1em; }
  #tour-card .tp-body > #tour-diag { flex: 1 1 auto; min-height: 9em; max-height: 34em; display: flex; } #tour-diag svg { display: block; width: 100%; height: 100%; } #tour-diag[hidden] { display: none !important; }
  #tour-panel table { width: 100%; border-collapse: collapse; font-size: .9em; margin: .2em 0 .4em; } #tour-panel th, #tour-panel td { padding: .3em .4em; border-bottom: 1px solid rgba(255, 255, 255, .1); text-align: right; } #tour-panel th:first-child, #tour-panel td:first-child { text-align: left; }
  #tour-panel th { font-size: .82em; color: var(--dim); font-weight: 600; } #tour-panel tr.hk td { color: #9fe3ff; font-weight: 700; } #tour-panel .tp-cap { font-weight: 700; } #tour-panel .tp-note { font-size: .8em; color: var(--dim); margin: .3em 0; }
  #tour-panel .pg-tbl { font-size: .82em; } #tour-panel .pg-take { font-size: .95em; margin: .35em 0; } #tour-panel .pg-note { font-size: .8em; margin: .35em 0; } #tour-panel .tp-row { display: flex; gap: .4em; flex-wrap: wrap; margin-top: .6em; }
  #tour-card .tp-btns { display: flex; gap: .5em; padding: .6em 1.05em .3em; border-top: 1px solid rgba(255, 255, 255, .08); } #tour-card .tp-btns .btn { flex: 1; font-size: 1em; padding: .55em .5em; } #tour-card .tp-btns .btn.primary { flex: 1.6; font-size: 1.08em; font-weight: 700; }
  #tour-card .tp-foot { display: flex; align-items: center; gap: .6em; padding: .2em 1.05em .6em; } #tour-card .tp-foot .btn { font-size: .82em; padding: .3em .8em; margin-left: auto; }
  #tour-card .tp-rate { font: 700 .72em var(--mono); letter-spacing: .06em; color: var(--dim); } #tour-card .tp-rate.slow { color: var(--warn); }
  #tour-card .tp-keys { font: .68em var(--mono); color: rgba(150, 165, 158, .7); white-space: nowrap; } @media (max-width: 1250px) { #tour-card .tp-keys { display: none; } }
  #tour-veil { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(4, 8, 7, .82); font: 1.05em var(--mono); color: var(--dim); letter-spacing: .1em; pointer-events: auto; }
  body.tour-on #status, body.tour-on #sline, body.tour-on #gauges, body.tour-on #warn, body.tour-on #facerow, body.tour-on #threats, body.tour-on #engleft, body.tour-on #engright,
  body.tour-on #logov, body.tour-on #strip, body.tour-on #dock, body.tour-on #hud, body.tour-on #marks, body.tour-on #units, body.tour-on #xr, body.tour-on #dir-tag, body.tour-on #title, body.tour-on #result, body.tour-on #cmd, body.tour-on #cmdmenu { display: none !important; }
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
const TONES = { good: '#39d98a', bad: '#ff6b5e', warn: '#ffb347', hk: '#6fd3ff' };
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
    { const a = app.q && app.q.get('aim'); if (a != null && a !== '') { const [c, st] = String(a).split('.').map(Number); setTimeout(() => { this.brief.start(CHAPTERS.findIndex(x => x.key === (c ? 'many' : 'aim')), st || 0, ['aim', 'many']); }, 0); } }
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
  // the targeting page: the briefing's two engagement chapters on their own ("One shot, start to finish", then "Several at once")
  openAim() { this.app.page(false); this.brief.start(CHAPTERS.findIndex(c => c.key === 'aim'), 0, ['aim', 'many']); }
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
// The text panel sits down the left side; the picture is the rest. The camera is the briefing's own (src/app/briefcam.js), with the
// view offset that centres the picture in the free part. Labels with leader lines are laid over the real objects, kept inside the
// free part. Nothing here changes the battle: it only reads it and moves the camera.
class Briefing {
  constructor(app, guide) {
    this.app = app; this.guide = guide; this.on = false; this.ci = 0; this.si = 0; this.steps = []; this.M = null; this.setup = null; this.phase = 'idle'; this.want = null; this.sched = false; this.snap = null; this.seen = new Set(); this.fault = null; this.quick = null; this.only = null;
    const el = app.el, Vc = app.scene.camera.position.constructor;   /* three.js Vector3, without importing three here (the node test loads this file) */
    this.v1 = new Vc(); this.v2 = new Vc(); this.v3 = new Vc(); this.v4 = new Vc(); this.vm = new Vc(); this.vs = new Vc(); this.vt = new Vc(); this.vl = new Vc(); this.vlast = null;
    const root = this.root = el('div'); root.id = 'tour'; root.hidden = true;
    this.svg = svg('svg', {}); this.gl = svg('g', {}); this.gm = svg('g', {}); this.svg.append(this.gl, this.gm);
    this.top = el('div'); this.top.id = 'tour-top'; this.pills = CHAPTERS.map((c, i) => { const b = el('button', null, `${i + 1}  ${c.name}`); b.title = 'Go to this chapter'; b.onclick = () => this.go(i, 0); this.top.append(b); return b; });
    const card = this.card = el('div'); card.id = 'tour-card';
    this.tag = el('div', 'tp-tag'); this.dots = el('div', 'tp-dots'); this.head = el('h2'); this.text = el('p', 'tp-text'); this.facts = el('div', 'tp-facts');
    this.diag = el('div'); this.diag.id = 'tour-diag'; this.diag.hidden = true; this.diagKey = ''; this.diagT = null;
    this.panel = el('div'); this.panel.id = 'tour-panel'; this.panel.hidden = true;
    this.rateTag = el('div', 'tp-rate');
    const body = el('div', 'tp-body'); body.append(this.tag, this.dots, this.head, this.text, this.facts, this.diag, this.panel);
    const tb = el('div', 'tp-btns'), btn = (text, cls, tip, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), text); b.title = tip; b.onclick = fn; return b; };
    this.bBack = btn('Back', '', 'The step before (left arrow)', () => this.back()); this.bAgain = btn('Replay step', '', 'Play this step again (R)', () => this.again());
    this.bNext = btn('Next', 'primary', 'The next step (right arrow)', () => this.next()); this.bExit = btn('Exit', '', 'Leave the briefing (Esc)', () => this.stop());
    tb.append(this.bBack, this.bAgain, this.bNext);
    const foot = el('div', 'tp-foot'); foot.append(this.rateTag, el('span', 'tp-keys', 'arrows: back, next · R: replay · Space: pause'), this.bExit);
    card.append(body, tb, foot);
    this.veil = el('div'); this.veil.id = 'tour-veil'; this.veil.hidden = true;
    root.append(this.svg, this.top, card, this.veil); document.body.append(root);
    this.marks = []; this.lines = [];
    window.addEventListener('keydown', e => {
      if (!this.on || e.ctrlKey || e.metaKey || e.altKey || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      const k = e.code; let used = true;
      if (k === 'ArrowRight' || k === 'Enter' || k === 'PageDown') this.next(); else if (k === 'ArrowLeft' || k === 'PageUp') this.back(); else if (k === 'KeyR') this.again(); else if (k === 'Escape') this.stop();
      else if (k === 'Space') { if (this.phase === 'run') { this.app.playing = !this.app.playing; this._rate(); } else this.again(); } else used = false;
      e.stopImmediatePropagation(); if (used) e.preventDefault();   /* while the briefing is on, no key reaches the battle's own shortcuts */
    }, true);
  }
  get step() { return this.steps[this.si] || null; }
  get span() { return null; }   /* (the time scrubber of the earlier briefing is gone: Replay step plays a step again) */

  // ---- moving about -----------------------------------------------------------------------------------------------------------
  start(ci, si, only) { if (this.on) return; this.only = only ? only.map(k => CHAPTERS.findIndex(c => c.key === k)).filter(i => i >= 0) : null; if (this.only && this.only.indexOf(ci) < 0) ci = this.only[0]; this.snap = this.app.snapshot(); this.on = true; this.seen.clear(); this.setup = null; this.fault = null; document.body.classList.add('tour-on'); this.root.hidden = false; this.app.director.setHold(true); this.go(ci || 0, si || 0); }
  stop(then) {
    if (!this.on) return; this.on = false; this.phase = 'idle'; this.diag.hidden = true; this.only = null; this.want = null; this._quickStop(); document.body.classList.remove('tour-on'); this.root.hidden = true; this._hideMarks(); this._lift(0, 0);
    try { this.app.director.setHold(false); } catch (e) { console.error(e); }
    try { this.app.speed = 1; this.app.exit(this.snap); } catch (e) { console.error(e); try { this.app.toTitle(); } catch (e2) { console.error(e2); } }
    this.snap = null; this.setup = null; if (then) then();
  }
  _allowed(ci) { return ci >= 0 && ci < CHAPTERS.length && (!this.only || this.only.indexOf(ci) >= 0); }
  _nextCh(ci, d) { for (let i = ci + d; i >= 0 && i < CHAPTERS.length; i += d) if (this._allowed(i)) return i; return -1; }
  next() { if (this.si + 1 < this.steps.length) this.go(this.ci, this.si + 1); else { const n = this._nextCh(this.ci, 1); if (n >= 0) this.go(n, 0); else this.stop(); } }
  back() { if (this.si > 0) this.go(this.ci, this.si - 1); else { const n = this._nextCh(this.ci, -1); if (n >= 0) this.go(n, -1); } }
  again() { this.go(this.ci, this.si); }
  // ask for chapter ci, step si (-1: its last step). The work is done a frame later so the "setting up" notice is on screen first;
  // asking again before that only changes what will be done, so hammering Next cannot queue up work.
  go(ci, si) {
    if (!this.on) return; if (ci >= CHAPTERS.length || (this.only && !this._allowed(ci))) { this.stop(); return; }
    this.want = { ci: Math.max(0, ci), si }; const heavy = !sameSetup(CHAPTERS[this.want.ci].setup, this.setup);
    this.veil.textContent = heavy ? 'SETTING UP THE BATTLE FOR THIS CHAPTER' : ''; this.veil.hidden = !heavy; this._quickStop();
    if (this.sched) return; this.sched = true;
    const run = () => { this.sched = false; try { this._enter(); } catch (e) { this._fail(e); } };
    if (heavy) requestAnimationFrame(() => requestAnimationFrame(run)); else requestAnimationFrame(run);
  }
  _fail(e) { console.error(e); this.fault = String(e && e.message || e); this.phase = 'hold'; this.veil.hidden = true; this._hideMarks(); try { this.app.playing = false; } catch (x) { /* nothing to stop */ } this._paint(); }
  _enter() {
    const A = this.app, w = this.want; if (!this.on || !w) return; this.want = null; this.fault = null;
    const ch = CHAPTERS[w.ci];
    if (!sameSetup(ch.setup, this.setup) || !A.replay) { A.load(ch.setup, 'replay'); this.setup = ch.setup; this.full = A.replay && A.replay.full; }
    if (w.ci !== this.ci || !this.M || this.Mfor !== ch) { this.M = this.full ? ch.find(this.full, A.HK) : null; this.Mfor = ch; this.steps = this.M ? ch.steps(this.M) : []; }
    this.ci = w.ci; this.si = w.si < 0 ? Math.max(0, this.steps.length - 1) : Math.min(w.si, Math.max(0, this.steps.length - 1));
    A.director.filmEnd(); this._hideMarks(); this.veil.hidden = true; this.vlast = null;
    const st = this.step;
    if (!st) { this.fault = 'This chapter\'s battle no longer contains the moment the chapter was built on.'; this.phase = 'hold'; A.playing = false; this._paint(); return; }
    const T = A.replay ? A.replay.T : 1e9, from = Math.max(0, Math.min(T - 0.2, st.from)), to = Math.max(from, Math.min(T - 0.1, st.to));
    this.from = from; this.to = to; this.hurry = false; for (const m of st.marks) { m._seen = false; m._last = null; }
    A.seek(from); this._free(); this.side = null;   /* chosen on the first frame, once the page has placed everything at the new time */
    A.speed = this._rateAt(st, from); A.playing = to > from + 1e-3; this.phase = A.playing ? 'run' : 'hold'; this.frames = 0;
    this.seen.add(this.ci + ':' + this.si); this.diagKey = ''; this._paint();
    if (st.panel === 'numbers' && A.pages && A.pages.quick) { try { this.quick = A.pages.quick(this.qbox || this.panel, 600); }   /* the run's table goes above the buttons, which stay */ catch (e) { console.error(e); } }
  }
  _quickStop() { if (this.quick) { try { this.quick.stop(); } catch (e) { /* already over */ } this.quick = null; } }
  _rateAt(st, t) { let r = 1; for (const q of st.rates || []) if (q[0] <= t + 1e-6) r = q[1]; return r; }
  // the camera is the briefing's: free mode, the page's own orbit control off (as the film director does it)
  _free() { const A = this.app; if (A.cams._near0 != null) A.cams.set('orbit'); A.cams.mode = 'free'; A.scene.controls.enabled = false; A.cams.unit = null; }

  // ---- where things are this frame, for the camera and the labels -------------------------------------------------------------
  _missile(id) { const A = this.app, v = id && A.battle.volleys[id.v]; if (!v || !A.volleys) return null; for (const m of A.volleys.info) if (m.th && m.th.idx === id.idx && v.rec.threats.indexOf(m.th) >= 0) return m; return null; }
  // where the launching team stood: the engine's own frame, R metres out on bearing brg from where the tank was when the volley began
  _launchAt(id, out) { const A = this.app, v = id && A.battle.volleys[id.v], T0 = (v && A.battle.tankAt && A.battle.tankAt(v.t0)) || A.shown, a = ((id && id.brg) || 0) * Math.PI / 180, R = (id && id.R) || 2000;
    return A.scene.at(T0.e + Math.sin(a) * R, T0.n + Math.cos(a) * R, 1.3, out); }
  _subjects(st) {
    const A = this.app, sc = A.scene, T = A.shown, W = sc.world, S = this.S || (this.S = { pts: {} });
    S.g = (x, z) => W.h(x, -z); S.tank = sc.at(T.e, T.n, 1.6, this.vt); S.launcher = this._launchAt(st.id, this.vl);
    S.station = (A.tank.hkoiMuzzle && A.tank.hkoiMuzzle(this.vs)) || sc.at(T.e, T.n, 3.3, this.vs);
    const F = frameOf(S.tank, S.launcher, S.g); S.b = F.b; S.p = F.p; S.R = F.R; S.at = F.at;
    const tm = st.marks.find(m => m.at === 'trophy'), side = tm ? (tm.side || 'L') : (Math.sin(((st.id && st.id.brg) || 0) * Math.PI / 180 - T.h * Math.PI / 180) < 0 ? 'L' : 'R');
    const V = A.volleys; S.trophy = V && V._apsPort && V.tankView ? V._apsPort(side, T, this.v3) : sc.at(T.e, T.n, 2.6, this.v3);
    const m = this._missile(st.id); S.missile = m ? this.vm.copy(m.p) : null; S.mdir = m ? m.dir : null;
    if (m) { if (!this.vlast) this.vlast = this.vm.clone(); this.vlast.copy(m.p); }
    S.pts = {}; for (const k in st.pts || {}) S.pts[k] = F.at(st.pts[k][0], st.pts[k][1]); if (this.vlast) S.pts.last = this.vlast;
    return S;
  }
  _side(st, t) { if (!st.shot || !st.shot.kind) return 1; try { const S = this._subjects(st), sub = S[st.shot.subj] || S.pts[st.shot.subj] || null; return chooseSide(st.shot.kind, S, st.shot.o, sub, this.app.scene.world); } catch (e) { console.error(e); return 1; } }
  _camera(st, t) {
    const A = this.app, cam = A.scene.camera, S = this._subjects(st), c = SHOTS[st.shot.kind](S, this.side, Math.max(0, t - this.from), st.shot.o || {});
    if (A.cams.mode !== 'free') this._free();
    cam.position.set(c.pos.x, c.pos.y, c.pos.z); cam.up.set(0, 1, 0); cam.lookAt(c.look.x, c.look.y, c.look.z); if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    this.cam = c; return S;
  }

  // ---- the panel ----------------------------------------------------------------------------------------------------------------
  _ctx() { return { b: this.app.battle }; }
  _paint() {
    const el = this.app.el, ch = CHAPTERS[this.ci], st = this.step, last = this._nextCh(this.ci, 1) < 0 && this.si >= this.steps.length - 1;
    this.pills.forEach((b, i) => { b.className = i === this.ci ? 'on' : this.seen.has(i + ':0') ? 'done' : ''; b.hidden = !this._allowed(i); });
    { const list = this.only || CHAPTERS.map((c, i) => i), n = list.indexOf(this.ci); this.tag.textContent = `${this.only ? 'Part' : 'Chapter'} ${n + 1} of ${list.length}: ${ch.name}`; }
    this.dots.textContent = ''; this.steps.forEach((s, i) => { const d = el('button', i === this.si ? 'on' : this.seen.has(this.ci + ':' + i) ? 'done' : ''); d.title = s.head; d.onclick = () => this.go(this.ci, i); this.dots.append(d); });
    if (this.steps.length) this.dots.append(el('span', null, `step ${this.si + 1} of ${this.steps.length}`));
    let text = ''; if (this.fault) text = `This step could not be shown (${this.fault}). Next carries on.`; else if (st) { try { text = st.text(this._ctx()); } catch (e) { console.error(e); text = 'The text for this step could not be worked out from this battle.'; } }
    this.head.textContent = this.fault ? 'Something went wrong here' : st ? st.head : ch.name; this.text.textContent = text;
    this.facts.textContent = ''; this.facts.hidden = !(st && st.facts && !st.diagram && !this.fault);   /* with a diagram the numbers are in it, and the room is its */ if (!this.facts.hidden) for (const [k, v] of st.facts) { const f = el('div'); f.append(el('b', null, v), el('span', null, k)); this.facts.append(f); }
    this.bBack.disabled = this._nextCh(this.ci, -1) < 0 && this.si === 0; this.bNext.textContent = last ? 'Finish' : 'Next'; this.bAgain.hidden = !st || !(st.to > st.from);
    const p = this.panel; p.textContent = ''; p.hidden = !(st && st.panel) || !!this.fault;
    if (st && st.panel === 'ref' && !this.fault) { const R = REFERENCE, tbl = el('table'), hr = el('tr'); for (const h of R.head) hr.append(el('th', null, h)); tbl.append(hr);
      for (const r of R.rows) { const tr = el('tr', /HKOI/.test(r[0]) ? 'hk' : ''); tr.append(el('td', null, r[0]), el('td', null, r[1].toFixed(1) + '%'), el('td', null, r[2].toFixed(1) + '%')); tbl.append(tr); }
      p.append(el('div', 'tp-cap', 'Share of raids the tank survives'), tbl, el('div', 'tp-note', R.cut), el('div', 'tp-note', R.src)); }
    if (st && st.panel === 'numbers' && !this.fault) { this.qbox = el('div'); p.append(this.qbox); const row = el('div', 'tp-row'), b = (t, fn) => { const x = el('button', 'btn on', t); x.onclick = fn; return x; };
      row.append(b('Open Run the numbers', () => this.stop(() => { const n = document.getElementById('o-numbers'); if (n) n.click(); })), b('Open Scenarios', () => this.stop(() => this.guide.openScenarios())), b('Start over', () => this.go(this.only ? this.only[0] : 0, 0))); p.append(row); }
    this._rate();
  }
  _rate() { const A = this.app, st = this.step; let t = '', slow = false; if (st && !this.fault) { if (this.phase === 'run') { slow = A.playing && A.speed < 1; t = !A.playing ? 'PAUSED' : A.speed < 1 ? `SLOW MOTION ×${A.speed}` : 'PLAYING'; } else t = st.to > st.from ? `STOPPED: ${(st.freeze || '').toUpperCase()}` : st.freeze ? `STILL: ${st.freeze.toUpperCase()}` : 'STILL'; }
    this.rateTag.textContent = t; this.rateTag.className = 'tp-rate' + (slow ? ' slow' : ''); }

  // ---- once a frame -----------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) return; const A = this.app;
    if (A.state !== 'play') { if (!this.sched && !this.want && this.phase !== 'idle' && !this.fault) this.stop(); return; }   /* the page left the replay by itself: leave with it */
    const st = this.step; if (!st || this.fault || this.sched) return;
    try {
      const t = Math.min(A.tNow, A.battle.t);
      if (this.phase === 'run') {
        if (t >= this.to - 1e-3 || (A.replay && A.battle.t >= A.replay.T - 0.06)) { A.playing = false; this.phase = 'hold'; this._rate(); if (st.text.length) this.text.textContent = st.text(this._ctx()); }
        else { const r = this._rateAt(st, t); if (A.playing && A.speed !== r && !this.hurry) { A.speed = r; this._rate(); } else if (!A.playing && this.frames > 2 && this.rateTag.textContent !== 'PAUSED') this._rate(); }
      }
      this.frames++;
      const W = A.scene.canvas.clientWidth || innerWidth, H = A.scene.canvas.clientHeight || innerHeight, C = clearArea(W, H); this.W = W; this.H = H; this.C = C;
      if (this.side == null) this.side = this._side(st, t); const S = this._camera(st, t); this._lift(C.sx, C.sy);
      this._diagram(st, t);
      this._draw(st, t, S);
    } catch (e) { this._fail(e); }
  }
  // the picture's centre moved to the middle of the free part (the camera's view offset), so nothing the text names sits behind it
  _lift(sx, sy) {
    const cam = this.app.scene.camera, cv = this.app.scene.canvas, W = cv.clientWidth || innerWidth, H = cv.clientHeight || innerHeight;
    if (sx === this.liftX && sy === this.liftY && W === this.liftW && H === this.liftH && (!!cam.view) === !!(sx || sy)) return; this.liftX = sx; this.liftY = sy; this.liftW = W; this.liftH = H;
    if (sx || sy) cam.setViewOffset(W, H, -sx, -sy, W, H); else if (cam.view) cam.clearViewOffset();
  }
  // the diagram in the panel, redrawn only when the step or the battle time (to 1/50 s) changes
  _diagram(st, t) {
    const dg = st && st.diagram; if (!dg || this.fault) { if (!this.diag.hidden) this.diag.hidden = true; return; }
    if (this.diag.hidden) this.diag.hidden = false;
    const live = dg.kind === 'geo' || dg.kind === 'queue' || dg.kind === 'drone' || dg.kind === 'close', key = this.ci + ':' + this.si + ':' + dg.kind, tq = Math.round(t * 50) / 50;
    if (key === this.diagKey && (!live || tq === this.diagT)) return; this.diagKey = key; this.diagT = tq; const M = this.M; let html = '';
    if (dg.kind === 'geo') html = geoSVG(M.D, t, dg.focus, M.TB, this.W < 1150);   /* a narrow window: the panel shows only the lower diagram, large enough to read */ else if (dg.kind === 'queue') html = queueSVG(M.O, t); else if (dg.kind === 'layers') html = layerSVG(M.L, dg.focus); else if (dg.kind === 'guide') html = guideSVG(dg.focus); else if (dg.kind === 'drone') html = droneSVG(M.one, t, M.cfg); else if (dg.kind === 'close') html = closeSVG(M[dg.which], t);
    this.diag.innerHTML = html;
  }
  // where the step's subject is on the screen now, through the real camera (tests/beta/tour.py reads this; the node test does the same
  // from the record): inside the free part, and how many pixels a metre is there
  framing() {
    const st = this.step; if (!this.on || !st || !st.shot || !this.S || !this.C) return null; const p = this.S[st.shot.subj] || this.S.pts[st.shot.subj]; if (!p) return { subj: st.shot.subj, ok: st.shot.subj === 'missile', none: true };
    const cam = this.app.scene.camera; cam.updateMatrixWorld(); const q = { x: 0, y: 0 }; if (!this._project(p, q)) return { subj: st.shot.subj, ok: false, behind: true };
    const C = this.C, d = cam.position.distanceTo(p), px = this.H / (2 * Math.tan(cam.fov * Math.PI / 360) * d), size = (st.shot.size || 0) * px / this.H;
    return { subj: st.shot.subj, x: Math.round(q.x), y: Math.round(q.y), size: Math.round(size * 1000) / 1000, ok: q.x >= C.x0 && q.x <= C.x1 && q.y >= C.y0 && q.y <= C.y1 && (!st.shot.min || size >= st.shot.min * 0.8) };
  }
  // ---- labels and lines over the picture ----------------------------------------------------------------------------------------
  _hideMarks() { for (const m of this.marks) { m.el.style.display = 'none'; m.ln.style.display = 'none'; m.dot.style.display = 'none'; m.slot = -1; } for (const l of this.lines) l.style.display = 'none'; }
  _mark(i) { let m = this.marks[i]; if (!m) { const e = this.app.el('div', 'tl'); e.style.display = 'none'; this.root.insertBefore(e, this.top); m = this.marks[i] = { el: e, ln: svg('line', { 'stroke-width': 2 }), dot: svg('circle', { r: 7, fill: 'none', 'stroke-width': 2.5 }), slot: -1 }; this.gm.append(m.ln, m.dot); } return m; }
  _line(i) { let l = this.lines[i]; if (!l) { l = this.lines[i] = svg('line', { 'stroke-linecap': 'round' }); this.gl.append(l); } return l; }
  // where a label's object is this frame (false: not there to point at)
  _where(mk, S, out) {
    const A = this.app, t = Math.min(A.tNow, A.battle.t);
    if (mk.after != null && t < mk.after) return false;
    if (mk.at === 'tank') { out.copy(S.tank); out.y += 0.9; return true; }
    if (mk.at === 'station') { out.copy(S.station); return true; }
    if (mk.at === 'trophy') { out.copy(S.trophy); return true; }
    if (mk.at === 'launcher') { out.copy(S.launcher); return true; }
    if (mk.at === 'pt') { const p = S.pts[mk.pt]; if (!p) return false; out.copy(p); return true; }
    if (mk.at === 'bearing') { const p = S.at(60, 3); out.copy(p); return true; }
    if (mk.at === 'missile' && mk.id) { const m = this._missile(mk.id); if (!m) return false; out.copy(m.p); return true; }   /* one of several in the air */
    if (mk.at === 'missile' || mk.at === 'beamtag') { mk._gone = false;
      if (S.missile) { out.copy(S.missile); if (!mk._last) mk._last = S.missile.clone(); mk._last.copy(S.missile); mk._seen = true; if (mk.at === 'beamtag') { out.x += S.b.x * 14; out.z += S.b.z * 14; out.y += 0.6; } return true; }
      if (mk.gone && mk._seen && mk._last) { mk._gone = true; out.copy(mk.goneAt && S.pts[mk.goneAt] ? S.pts[mk.goneAt] : mk._last); return true; }
      return false; }
    return false;
  }
  _project(p, out) { const cam = this.app.scene.camera; this.v4.copy(p).applyMatrix4(cam.matrixWorldInverse); if (this.v4.z > -cam.near) return false; this.v4.applyMatrix4(cam.projectionMatrix); out.x = (this.v4.x * 0.5 + 0.5) * this.W; out.y = (-this.v4.y * 0.5 + 0.5) * this.H; return true; }
  _segment(a, b, l) {
    const cam = this.app.scene.camera, n = -cam.near - 0.01, P = this.v3.copy(a).applyMatrix4(cam.matrixWorldInverse), Q = this.v4.copy(b).applyMatrix4(cam.matrixWorldInverse);
    if (P.z > n && Q.z > n) return false;
    if (P.z > n) P.lerp(Q, (P.z - n) / (P.z - Q.z)); else if (Q.z > n) Q.lerp(P, (Q.z - n) / (Q.z - P.z));
    P.applyMatrix4(cam.projectionMatrix); Q.applyMatrix4(cam.projectionMatrix);
    l.setAttribute('x1', ((P.x * 0.5 + 0.5) * this.W).toFixed(1)); l.setAttribute('y1', ((-P.y * 0.5 + 0.5) * this.H).toFixed(1)); l.setAttribute('x2', ((Q.x * 0.5 + 0.5) * this.W).toFixed(1)); l.setAttribute('y2', ((-Q.y * 0.5 + 0.5) * this.H).toFixed(1));
    return true;
  }
  _draw(st, t, S) {
    const A = this.app, cam = A.scene.camera; cam.updateMatrixWorld(); const C = this.C, k = Math.max(0.9, Math.min(1.6, this.W / 1400)), P = this.v1, Q = this.v2, pt = this.pt || (this.pt = { x: 0, y: 0 });
    // lines: the warning's bearing, the radar's track(s)
    let nl = 0;
    for (const kind of st.lines || []) {
      if (kind === 'bearing') { const l = this._line(nl); P.copy(S.tank); P.y += 1.4; Q.copy(S.at(Math.min(S.R, 1500), 3)); if (!this._segment(P, Q, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(255,179,71,.9)'); l.setAttribute('stroke-width', (3 * k).toFixed(1)); l.setAttribute('stroke-dasharray', `${(10 * k).toFixed(0)} ${(7 * k).toFixed(0)}`); }
      else if (kind === 'track') { if (!S.missile || t < (this.M && this.M.D ? this.M.D.T0 + this.M.D.radar.tTrack : 0)) continue; const l = this._line(nl); if (!this._segment(S.station, S.missile, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(57,217,138,.9)'); l.setAttribute('stroke-width', (2.2 * k).toFixed(1)); l.setAttribute('stroke-dasharray', `${(3 * k).toFixed(0)} ${(5 * k).toFixed(0)}`); }
      else if (kind === 'path') { const l = this._line(nl); P.copy(S.launcher); P.y += 2; Q.copy(S.tank); Q.y += 2; if (!this._segment(P, Q, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(255,107,94,.85)'); l.setAttribute('stroke-width', (2.4 * k).toFixed(1)); l.setAttribute('stroke-dasharray', `${(8 * k).toFixed(0)} ${(6 * k).toFixed(0)}`); }
      else if (kind === 'round') { if (!S.pts.meet) continue; const l = this._line(nl); if (!this._segment(S.station, S.pts.meet, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(111,211,255,.95)'); l.setAttribute('stroke-width', (3 * k).toFixed(1)); l.setAttribute('stroke-dasharray', ''); }
      else if (kind === 'ticks') { for (const key of ['k1', 'k2']) { const c = S.pts[key]; if (!c) continue; const l = this._line(nl); P.set(c.x + S.p.x * 60, c.y + 1, c.z + S.p.z * 60); Q.set(c.x - S.p.x * 60, c.y + 1, c.z - S.p.z * 60); if (!this._segment(P, Q, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(255,255,255,.75)'); l.setAttribute('stroke-width', (2 * k).toFixed(1)); l.setAttribute('stroke-dasharray', ''); } }
      else if (kind === 'tracks' && A.volleys) { for (const m of A.volleys.info) { if (m.tracked === false && !m.drone) continue; const l = this._line(nl); if (!this._segment(S.tank, m.p, l)) continue; nl++; l.style.display = ''; l.setAttribute('stroke', 'rgba(57,217,138,.85)'); l.setAttribute('stroke-width', (2 * k).toFixed(1)); l.setAttribute('stroke-dasharray', `${(3 * k).toFixed(0)} ${(5 * k).toFixed(0)}`); } }
    }
    for (let i = nl; i < this.lines.length; i++) this.lines[i].style.display = 'none';
    // labels: each keeps the side of its object it was first given unless that side stops fitting; all inside the free part
    const placed = this.placed || (this.placed = []); placed.length = 0; let nm = 0; const x0 = C.x0, x1 = C.x1, y0 = C.y0, y1 = C.y1;
    for (const mkv of st.marks) {
      const m = this._mark(nm++); let on = this._where(mkv, S, P) && this._project(P, pt), ax = pt.x, ay = pt.y, off = false;
      if (on && (ax < x0 || ax > x1 || ay < y0 || ay > y1)) { if (mkv.at === 'missile' || mkv.at === 'launcher' || mkv.at === 'pt') { off = true; ax = Math.max(x0 + 8, Math.min(x1 - 8, ax)); ay = Math.max(y0 + 8, Math.min(y1 - 8, ay)); } else on = false; }
      if (!on) { m.el.style.display = 'none'; m.ln.style.display = 'none'; m.dot.style.display = 'none'; m.slot = -1; continue; }
      const gone = mkv._gone, text = gone ? mkv.gone : mkv.text, tone = ((gone && mkv.goneTone) || mkv.tone || '') + (off ? ' off' : '');
      if (text !== m.text || tone !== m.tone || m.k !== k) { m.text = text; m.tone = tone; m.k = k; m.el.textContent = (off ? '→ ' : '') + text; m.el.className = 'tl ' + tone; m.el.style.display = ''; m.w = m.el.offsetWidth; m.h = m.el.offsetHeight; m.slot = -1; const c = TONES[(tone || '').split(' ')[0]] || '#ffffff'; m.ln.setAttribute('stroke', c); m.dot.setAttribute('stroke', c); }
      const dx = 46 * k, dy = 54 * k, fits = s => { const x = s & 1 ? ax - dx - m.w : ax + dx, y = s & 2 ? ay + dy - m.h / 2 : ay - dy - m.h / 2; if (x < x0 || x + m.w > x1 || y < y0 || y + m.h > y1) return false; for (const q of placed) if (x < q[0] + q[2] + 6 && x + m.w + 6 > q[0] && y < q[1] + q[3] + 6 && y + m.h + 6 > q[1]) return false; m.x = x; m.y = y; return true; };
      if (m.slot < 0 || !fits(m.slot)) { m.slot = -1; for (const s of [nm % 2 ? 0 : 1, nm % 2 ? 1 : 0, 2, 3]) if (fits(s)) { m.slot = s; break; } }
      if (m.slot < 0) { m.x = Math.max(x0, Math.min(x1 - m.w, ax + dx)); m.y = Math.max(y0, Math.min(y1 - m.h, ay - dy - m.h / 2 - placed.length * (m.h + 4))); }
      placed.push([m.x, m.y, m.w, m.h]);
      m.el.style.display = ''; m.el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      const lx = ax < m.x ? m.x : ax > m.x + m.w ? m.x + m.w : ax, ly = ay < m.y ? m.y : ay > m.y + m.h ? m.y + m.h : ay, d = Math.hypot(lx - ax, ly - ay) || 1, r = 7 * k;
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
