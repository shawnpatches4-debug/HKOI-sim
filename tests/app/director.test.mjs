// node tests/app/director.test.mjs [show] : the film director's planning (src/app/director_plan.js) against whole battles fought in node.
// Checks that the film is the SAME however often the director is asked (every step, every few steps as at low frame rates and
// high speed, once after a jump in time, after a rewind), that no shot is shorter than allowed, that captions come one at a time
// and read as plain sentences. `show` prints one film in full.
import { createRequire } from 'module';
import { Plan, LIMITS, compass, word, ordinal, range } from '../../src/app/director_plan.js';
const require = createRequire(import.meta.url);
const { HK, DMG, Battle } = require('../battle/load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), show = process.argv[2] === 'show';
const FORCES = {
  standoff: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], raid: { minR: 2000, window: 6 } },
  ambush: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  drones: { force: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }] },
  heavy: { force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] },
};
const make = s => new Battle.Battle({ biome: s.biome, mapSeed: 3, seed: s.seed, skill: 'trained', mission: s.mission || 'hold', waves: s.waves || 1, cfg, lookup, force: FORCES[s.force].force, raid: FORCES[s.force].raid });
const done = b => !b.tank.alive && b.volleys.length && b.t > b.volleys[b.volleys.length - 1].tEnd + 8 || b.over && b.t > b.over.t + 6 || b.t > 420;
// one frame of the page: at most `n` steps, stopping when an engagement is half worked out (as main.js does)
function frame(b, n) { for (let i = 0; i < n; i++) { b.step(); if (b._pending) return; } }
function run(s, every, plan, until) { const b = make(s); let n = 0; while (!done(b) && (until == null || b.t < until) && n++ < 9000) { frame(b, every); if (plan) plan.sync(b); } if (b._pending) b.step(); return b; }
const film = (p, upTo) => JSON.stringify([p.shots.filter(s => s.t0 <= upTo).map(s => [s.t0, s.cam || s.rig, s.idx, s.uid]), p.shown.filter(c => c.t0 <= upTo).map(c => [c.t0, c.text])]);

let bad = 0, shotsAll = 0, capsAll = 0; const fail = (...a) => { bad++; console.log('FAIL', ...a); };
const cases = [];
for (const [force, biome, seed] of [['standoff', 'farmland', 1], ['standoff', 'desert', 1], ['standoff', 'desert', 2], ['ambush', 'farmland', 6], ['ambush', 'farmland', 7], ['ambush', 'desert', 2], ['drones', 'farmland', 7], ['heavy', 'farmland', 6], ['heavy', 'desert', 7]]) cases.push({ force, biome, seed });
cases.push({ force: 'ambush', biome: 'forest', seed: 3, waves: 3 }, { force: 'ambush', biome: 'town', seed: 2, mission: 'advance' });
for (const s of cases) {
  const tag = `${s.force}/${s.biome}/${s.seed}`;
  const ref = new Plan({ HK, DMG }), b0 = run(s, 1, ref), T = b0.t - 0.5, want = film(ref, T);
  if (b0.over && b0.over.t == null) b0.over.t = b0.t;
  // the same film at other rates of asking (2 to 13 steps between looks), and when asked once after the whole battle
  for (const every of [3, 13]) { const p = new Plan({ HK, DMG }); const b = run(s, every, p); p.sync(b); if (film(p, Math.min(T, b.t - 1.5)) !== film(ref, Math.min(T, b.t - 1.5))) fail(tag, 'film differs when looked at every', every, 'steps'); }
  { const p = new Plan({ HK, DMG }), b = run(s, 1, null); p.sync(b); if (film(p, Math.min(T, b.t - 0.5)) !== film(ref, Math.min(T, b.t - 0.5))) fail(tag, 'film differs when planned once at the end (jump in time)'); }
  // a jump into the middle, then playing on; and a rewind (a new battle object, earlier in time) into a plan already made
  { const mid = Math.max(3, T * 0.45); const p = new Plan({ HK, DMG }); let b = run(s, 1, null, mid); p.sync(b); let n = 0; while (!done(b) && n++ < 9000) { frame(b, 1); p.sync(b); } if (film(p, Math.min(T, b.t - 0.5)) !== film(ref, Math.min(T, b.t - 0.5))) fail(tag, 'film differs after a jump into the middle'); }
  { const p = new Plan({ HK, DMG }); run(s, 1, p); const b = run(s, 1, null, T * 0.3); p.sync(b); let n = 0; while (!done(b) && n++ < 9000) { frame(b, 2); p.sync(b); } if (film(p, Math.min(T, b.t - 1)) !== film(ref, Math.min(T, b.t - 1))) fail(tag, 'film differs after a rewind'); }
  // the shots: none shorter than the floor; shorter than the usual minimum only when something far more important cut in
  const S = ref.shots; shotsAll += S.length;
  for (let i = 0; i < S.length - 1; i++) { const len = S[i + 1].t0 - S[i].t0, nx = S[i + 1];
    if (len < LIMITS.floor - 1e-6) fail(tag, 'shot shorter than the floor', S[i].t0, S[i].rig || S[i].cam, len.toFixed(2));
    else if (len < Math.min(S[i].min, LIMITS.shotMin) - 1e-6 && !(nx.pri >= S[i].pri + 3)) fail(tag, 'shot cut short by something no more important', S[i].t0, S[i].rig || S[i].cam, len.toFixed(2), '->', nx.rig || nx.cam);
    if (len > 12 && S[i].rig !== 'hold') fail(tag, 'shot longer than 12 s', S[i].t0, S[i].rig || S[i].cam, len.toFixed(1)); }
  // the captions: one at a time, plain text, numbers present
  const C = ref.shown; capsAll += C.length;
  for (let i = 0; i < C.length; i++) { const c = C[i];
    if (/[–—]|undefined|NaN|null|  /.test(c.text)) fail(tag, 'caption text', JSON.stringify(c.text));
    if (i && c.t0 < C[i - 1].t1 - 1e-6) fail(tag, 'two captions at once', c.t0, c.text);
    const gap = i < C.length - 1 ? C[i + 1].t0 - c.t0 : 9; if (gap < LIMITS.capFloor - 1e-6 || gap < LIMITS.capMin - 1e-6 && !/blind|Trophy fires| hits the |destroyed|shoots the|flies wide|into the ground/.test(C[i + 1].text)) fail(tag, 'caption shown too briefly', c.t0, c.text, gap.toFixed(1), '->', C[i + 1] && C[i + 1].text); }
  // every hit, every Trophy shot and every cut by the cloud is told, and filmed
  for (const v of b0.volleys) {
    for (const th of v.rec.threats) if (th.state === 'hit' && v.t0 + th.viz.end.t < T - 3) { const t = v.t0 + th.viz.end.t, sh = ref.shotAt(t);
      if (!C.some(c => / hits the /.test(c.text) && c.t0 - t > -0.1 && c.t0 - t < 1.6)) fail(tag, 'a hit with no caption within 1.5 s at', t.toFixed(1));
      if (!sh || sh.rig !== 'low' && sh.rig !== 'hold') fail(tag, 'a hit not filmed from the low wide angle at', t.toFixed(1), sh && (sh.rig || sh.cam));
      { const lost = b0.volleys.filter(x => x.rec.killed).map(x => x.t0 + (x.rec.kill_t != null ? x.rec.kill_t : x.rec.t_end)).sort((a, c) => a - c)[0], ins = ref.shotAt(t + 0.7); if (!(lost != null && t > lost + 0.5) && !(ins && ins.inside && /^in_(cdr|gnr|ldr|drv)$/.test(ins.cam))) fail(tag, 'no cut to a crew seat after the hit at', t.toFixed(1), ins && (ins.cam || ins.rig)); }
      if (!ref.slowAt(t)) fail(tag, 'no slow motion at the hit', t.toFixed(1)); }
    for (const bu of v.rec.bursts) if (bu.res && bu.res.cut && bu.res.outcome !== 'drift_hit' && bu.res.t_cut != null && v.t0 + bu.res.t_cut < T - 3 && !C.some(c => /blind/.test(c.text) && c.t0 - v.t0 - bu.res.t_cut > -0.1 && c.t0 - v.t0 - bu.res.t_cut < 2.1)) fail(tag, 'a cut by the cloud with no caption within 2 s at', (v.t0 + bu.res.t_cut).toFixed(1));
  }
  const nT = b0.volleys.reduce((n, v) => n + (v.rec.aps || []).length, 0), cT = C.filter(c => /^Trophy fires/.test(c.text)).length; if (cT > nT) fail(tag, 'more Trophy captions than Trophy shots', cT, nT);
  if (show && s.force === 'standoff' && s.biome === 'farmland' && s.seed === 1) {
    console.log('--- the film of', tag, '(battle', b0.t.toFixed(0), 's) ---'); const L = [];
    for (const x of S) L.push([x.t0, `  camera   ${(x.cam ? 'view:' + x.cam : x.rig).padEnd(12)} ${x.label || ''}${x.idle ? ' (calm)' : ''}`]);
    for (const c of C) L.push([c.t0 + 0.001, `  caption  "${c.text}"`]);
    for (const w of ref.slows) L.push([w[0] + 0.002, `  slow motion for ${(w[1] - w[0]).toFixed(2)} s of battle time`]);
    L.sort((a, b) => a[0] - b[0]); for (const [t, x] of L.filter(l => l[0] < 45)) console.log(t.toFixed(1).padStart(6), x);
  }
}
// the small helpers
if (compass(0) !== 'north' || compass(44) !== 'north-east' || compass(172) !== 'south' || compass(262) !== 'west' || compass(-10) !== 'north') fail('compass');
if (word(4) !== 'four' || ordinal(2) !== 'second' || range(3164) !== '3.2 km' || range(854) !== '850 m') fail('words');
console.log(`${cases.length} battles, ${shotsAll} shots, ${capsAll} captions`);
console.log(bad ? `DIRECTOR TESTS FAIL (${bad})` : 'DIRECTOR TESTS PASS');
process.exit(bad ? 1 : 0);
