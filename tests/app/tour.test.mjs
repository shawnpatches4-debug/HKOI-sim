// node tests/app/tour.test.mjs [show] : the briefing's chapters (src/app/tour.js) against the real battles they are built on.
// Each chapter's battle is fought here as the page fights it; the chapter must find its moments in the record, every step must lie
// inside the battle with its times in order, every sentence must read (no missing number, no dash, not too long), and EVERY STEP'S
// CAMERA must frame what it is about: the step's subject, placed where the record says it is, projected through the step's own shot
// (src/app/briefcam.js, the same code the page runs) at the start, middle and end of the step, must be in front of the camera,
// inside the free part of the screen (not under the text panel or the top bar) at 1920 x 1080 and 960 x 540, at least the step's
// minimum size, and in sight of the camera over the ground and through the trees (world.los).
// `show` prints the whole briefing as text with each step's framing.
import { createRequire } from 'module';
import fs from 'fs';
import { CHAPTERS, sameSetup, REFERENCE } from '../../src/app/tour.js';
import { SHOTS, chooseSide, frameOf, clearArea, project, sightClear, treesClear, vec } from '../../src/app/briefcam.js';
const require = createRequire(import.meta.url);
const { HK, World, Battle, EnemyVeh, Support } = require('../battle/load.js');
const show = process.argv[2] === 'show';
const mainSrc = fs.readFileSync(new URL('../../src/app/main.js', import.meta.url), 'utf8'), fm = mainSrc.match(/const FORCES = \{[\s\S]*?\n\};/);
const FORCES = Object.assign(new Function(fm[0] + '; return FORCES;')(), EnemyVeh.FORCES, Support.FORCES);
const supportOf = F => { const S = F.support || {}, o = {}; if (S.wingman) o.wingman = S.wingman; if (S.artillery) o.artillery = S.artillery; if (S.scout) o.scout = true; if (S.air) o.air = S.air; return Object.keys(o).length ? o : undefined; };
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
let bad = 0, nSteps = 0, nFrames = 0; const fail = (...a) => { bad++; console.log('FAIL', ...a); };
const AT = ['missile', 'launcher', 'tank', 'station', 'trophy', 'pt', 'bearing', 'beamtag'], LINES = ['bearing', 'track', 'tracks', 'path', 'round', 'ticks'], DIAG = ['geo', 'queue', 'layers', 'guide'];
// the battle as the page fights it (scenarios.js runToEnd), keeping where the tank was at every step
function fight(u) {
  const F = FORCES[u.force], B = new Battle.Battle({ support: supportOf(F), fate: true, world: new World.World({ seed: u.map, biome: u.biome }), seed: u.seed, cfg, lookup, skill: u.skill, cond: 'day', mission: 'hold', waves: u.waves, commander: 'auto', raid: F.raid, force: F.force, crewQuality: 'trained', crewStress: true });
  const hist = [{ t: 0, e: B.tank.e, n: B.tank.n, h: B.tank.h }]; let n = 0;
  while (B.t < 1800 - 1e-6 && n++ < 20000) { if (!B.tank.alive || B.over || (n % 20 === 0 && B.summary().teamsLeft === 0 && !B._volleyActive())) break; B.step(); hist.push({ t: B.t, e: B.tank.e, n: B.tank.n, h: B.tank.h }); }
  if (B._pending) B.step();
  B.hist = hist; return B;
}
function tankAt(B, t) { for (const v of B.volleys) if (t >= v.t0 && t <= v.tEnd && B.tankAt) { const p = B.tankAt(t); if (p) return p; } let best = B.hist[0]; for (const q of B.hist) { if (q.t > t + 1e-6) break; best = q; } return best; }
// where things are at battle time t, from the record (the page uses the drawn objects; these agree to a few metres)
function subjects(B, st, t) {
  const W = B.world, g = (x, z) => W.h(x, -z), T = tankAt(B, t), at = (e, n, h) => vec.V(e, W.h(e, n) + h, -n), tank = at(T.e, T.n, 1.6);
  const v = st.id ? B.volleys[st.id.v] : null, T0 = v ? tankAt(B, v.t0) : T;   /* the engine's frame: the launcher is R metres out on bearing brg from where the tank stood when the volley began */
  const a = ((st.id && st.id.brg) || 0) * Math.PI / 180, R0 = (st.id && st.id.R) || 2000, launcher = at(T0.e + Math.sin(a) * R0, T0.n + Math.cos(a) * R0, 1.3);
  const F = frameOf(tank, launcher, g), S = { g, tank, launcher, b: F.b, p: F.p, R: F.R, at: F.at, station: vec.add(tank, vec.V(0, 1, 0), 1.7), trophy: vec.add(tank, vec.V(0, 1, 0), 1.0), pts: {} };
  const th = v ? v.rec.threats.find(o => o.idx === st.id.idx) : null;
  if (th) { const tv = t - v.t0, end = th.viz.end; if (tv >= th.t0 && tv < end.t) { const x = Math.max(0, HK.distAt(th, tv)); S.missile = F.at(x, /^fpv/.test(th.key) ? 25 * Math.min(1, x / 300) + 3 : 2 + (x > 300 ? 2.5 : 2.5 * x / 300)); S.mdir = vec.V(-F.b.x, 0, -F.b.z); }
    const xe = Math.max(0, HK.distAt(th, Math.min(tv, end.t))); S.pts.last = F.at(xe, 2); }
  for (const k in st.pts || {}) S.pts[k] = F.at(st.pts[k][0], st.pts[k][1]);
  return S;
}
let last = null, B = null;
for (const ch of CHAPTERS) {
  const u = ch.setup;
  if (!sameSetup(u, last)) { B = fight(u); last = u; }
  const T = Math.max(5, B.t + 4), M = ch.find(B, HK);
  if (!M) { fail(ch.key, 'the battle no longer holds the moment this chapter needs'); continue; }
  const steps = ch.steps(M); if (!steps.length) fail(ch.key, 'no steps');
  if (show) console.log(`\n=== ${ch.name} (${u.biome} ${u.map}, ${u.force}, ${u.skill}, ${u.waves} waves, seed ${u.seed}; battle ${B.t.toFixed(0)} s) ===`);
  steps.forEach((st, i) => {
    nSteps++; const tag = `${ch.key} step ${i + 1} (${st.key})`;
    if (!(st.from >= 0 && st.to >= st.from - 1e-9 && st.to <= T)) fail(tag, 'times out of order or outside the battle', st.from, st.to, T);
    let watch = 0; { const R = (st.rates || []).slice().sort((a, b) => a[0] - b[0]); for (let k = 0; k < 400; k++) { const a = st.from + (st.to - st.from) * k / 400, b = st.from + (st.to - st.from) * (k + 1) / 400; let r = 1; for (const q of R) if (q[0] <= a + 1e-6) r = q[1]; watch += (b - a) / r; } }
    if (watch > 26) fail(tag, 'takes more than 26 s to watch', watch.toFixed(1));
    for (const q of st.rates || []) if (!(q[1] > 0 && q[1] <= 2)) fail(tag, 'rate', q[1]);
    if (!st.shot || !SHOTS[st.shot.kind]) fail(tag, 'camera', JSON.stringify(st.shot));
    if (!st.id) fail(tag, 'no threat identity for the camera');
    for (const l of st.lines || []) if (!LINES.includes(l)) fail(tag, 'unknown line', l);
    if (st.diagram && !DIAG.includes(st.diagram.kind)) fail(tag, 'unknown diagram', st.diagram.kind);
    for (const m of st.marks) { if (!AT.includes(m.at)) fail(tag, 'unknown mark', m.at); if (m.at === 'pt' && !(st.pts && st.pts[m.pt])) fail(tag, 'mark at an unknown point', m.pt); if (!m.text || /undefined|NaN|null/.test(m.text) || m.text.length > 40) fail(tag, 'label', m.text); }
    let text = ''; try { text = st.text({ b: B }); } catch (e) { fail(tag, 'text threw', e.message); }
    if (!text || /undefined|NaN|null|—|Infinity/.test(text)) fail(tag, 'text has a hole in it:', text);
    if (text.length > 440) fail(tag, 'text too long for the panel:', text.length);
    if ((text.match(/[.!?](\s|$)/g) || []).length > 5) fail(tag, 'more than five sentences');
    for (const f of st.facts || []) if (!f[1] || /undefined|NaN|null/.test(f[1])) fail(tag, 'fact has a hole', f);
    if (!st.head || st.head.length > 40) fail(tag, 'heading', st.head);
    // the framing, at three moments of the step, on two window sizes
    const fr = [];
    if (st.shot && SHOTS[st.shot.kind]) for (const f of [0, 0.5, 1]) {
      const t = st.from + (st.to - st.from) * f, S = subjects(B, st, t), subj = S[st.shot.subj] || S.pts[st.shot.subj];
      if (!subj) { if (st.shot.subj === 'missile' && f > 0) continue; fail(tag, 'no subject', st.shot.subj, 'at', t.toFixed(2)); continue; }
      const side = chooseSide(st.shot.kind, subjects(B, st, st.from), st.shot.o, null, B.world), cam = SHOTS[st.shot.kind](S, side, t - st.from, st.shot.o || {});
      for (const [Wd, Hd] of [[1920, 1080], [960, 540]]) { nFrames++;
        const C = clearArea(Wd, Hd), q = project(cam, subj, Wd, Hd);
        if (!q) { fail(tag, 'subject behind the camera', st.shot.subj, 'at', t.toFixed(2)); continue; }
        const mx = (C.x1 - C.x0) * 0.04, my = (C.y1 - C.y0) * 0.04;
        if (q.x < C.x0 + mx || q.x > C.x1 - mx || q.y < C.y0 + my || q.y > C.y1 - my) fail(tag, `${st.shot.subj} outside the clear picture at ${Wd}x${Hd}, t ${t.toFixed(2)}:`, Math.round(q.x), Math.round(q.y), 'clear', C.x0, C.x1, C.y0, C.y1);
        const size = (st.shot.size || 0) * q.px / Hd; if (st.shot.min && size < st.shot.min) fail(tag, `${st.shot.subj} too small: ${(100 * size).toFixed(1)}% of the screen height, wants ${(100 * st.shot.min).toFixed(0)}%`);
        if (Wd === 960) fr.push(`${f}: ${Math.round(q.x)},${Math.round(q.y)} ${(100 * size).toFixed(0)}%`);
      }
      for (const extra of st.shot.also || []) { const e = S[extra] || S.pts[extra], q = e && project(cam, e, 960, 540), C = clearArea(960, 540); if (!q || q.x < C.x0 || q.x > C.x1 || q.y < C.y0 || q.y > C.y1) fail(tag, `${extra} outside the clear picture`, q && Math.round(q.x), q && Math.round(q.y)); }
      const L = sightClear(B.world, cam, st.shot.kind === 'tail' ? cam.look : subj); if (!L.clear && st.shot.kind !== 'plan') fail(tag, `the view of the ${st.shot.subj} is blocked by ${L.kind} at ${Math.round(L.d)} m, t ${t.toFixed(2)}`);
      if (st.shot.kind !== 'plan' && st.shot.kind !== 'overhead' && !treesClear(B.world, cam, st.shot.kind === 'tail' ? cam.look : subj)) fail(tag, `trees between the camera and the ${st.shot.subj}, t ${t.toFixed(2)}`);
      { const gc = B.world.h(cam.pos.x, -cam.pos.z); if (cam.pos.y < gc + 0.7) fail(tag, 'camera under or at the ground'); }
    }
    if (show) console.log(`\n[${i + 1}] ${st.head}   (${st.from.toFixed(1)} to ${st.to.toFixed(1)} s, ${watch.toFixed(1)} s to watch, ${st.shot.kind} on ${st.shot.subj}: ${fr.join(' | ')})\n    ${text}\n    labels: ${st.marks.map(m => m.text).join(' | ')}${st.facts ? '\n    facts: ' + st.facts.map(f => f[0] + ' ' + f[1]).join(' | ') : ''}`);
  });
  if (ch.key === 'aim') { const D = M.D; if (!(D.tL < D.warn.t && D.warn.t < D.radar.tTrack && D.radar.tTrack < D.plan.tF && D.plan.tF < D.tFirstPuff && D.tFirstPuff < D.cut.t && D.cut.t < D.end.t)) fail('aim', 'launch, warning, track, fire, puff, cut and end are not in that order'); }
  if (ch.key === 'many' && !M.O.rows.some(r => r.by === 'aps')) fail('many', 'no hand-off to Trophy in the volley');
  if (ch.key === 'drones' && !(M.one.tF < M.one.tK)) fail(ch.key, 'the drone is not shot down after the burst');
  if (ch.key === 'limits' && !(M.close && M.rpg)) fail(ch.key, 'needs both a guided missile and a rocket that Trophy stopped');
  if (!show) console.log('ok  ', ch.key.padEnd(9), steps.length, 'steps');
}
// the reference table must be the one in docs/HKOI_NUMBERS.md (16 Nov addendum), figure for figure
{ const doc = fs.readFileSync(new URL('../../docs/HKOI_NUMBERS.md', import.meta.url), 'utf8');
  for (const r of REFERENCE.rows) { const re = new RegExp(`\\| \\**${r[0].replace('HKOI and Trophy', 'HKOI \\+ Trophy')}\\** \\| \\**${r[1].toFixed(1)}%[^|]*\\| \\**${r[2].toFixed(1)}%`); if (!re.test(doc)) fail('reference row not found in docs/HKOI_NUMBERS.md:', r.join(' ')); } }
console.log(bad ? `TOUR TESTS FAILED: ${bad}` : `TOUR TESTS PASS (${CHAPTERS.length} chapters, ${nSteps} steps, ${nFrames} framings checked)`);
process.exit(bad ? 1 : 0);
