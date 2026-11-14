// node tests/battle/crew.js [battles per setting, default 40] [--rebase]
// The tank crew's stress and panic model (src/battle/crew.js).
//   1. Model switched off: battles must be exactly the battles from before the model existed. Summaries, log length and event count
//      are compared with tests/battle/crew_baseline.json, which was written from the code BEFORE any hook was added.
//      (--rebase rewrites that file from the present code with the model off: only do that after a deliberate change to the battle.)
//   2. Model on, each crew level, two enemy forces: how often each state was reached, panic and bail-outs with their reasons, time added
//      to the drills, and vehicle survival with the model on against off on the same seeds.
//   3. The same battles at three step sizes; and no NaN anywhere.
const fs = require('fs'), path = require('path');
const { HK, Battle } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
const args = process.argv.slice(2), REBASE = args.includes('--rebase'), N = +(args.find(a => /^\d+$/.test(a)) || 40);
const BASE = path.join(__dirname, 'crew_baseline.json');
const BIOMES = ['farmland', 'desert', 'town', 'forest'], SKILLS = ['green', 'trained', 'expert', 'veteran'], MISSIONS = ['hold', 'advance', 'hunt'];
const FORCES = {
  'missile ambush (2 Kornet, 2 Konkurs, 1 RPG)': [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }],
  'close and drones (1 Konkurs, 3 RPG, 2 FPV)': [{ type: 'saclos', n: 1 }, { type: 'rpg', n: 3 }, { type: 'fpv', n: 2 }],
};
let fail = 0;
const bad = (...a) => { fail++; console.log('FAIL', ...a); };

// ---------------------------------------------------------------- 1. model off = the battles from before
const CASES = []; for (let i = 0; i < 16; i++) CASES.push({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 3) * 4, seed: i + 1, skill: SKILLS[(i >> 1) % 4], mission: MISSIONS[i % 3], waves: 1 + (i % 2), force: Object.values(FORCES)[i % 2] });
const digest = b => ({ summary: b.summary(), log: b.log.length, events: (b.events || []).length, over: b.over ? b.over.result : null, last: b.log.length ? b.log[b.log.length - 1].text : '' });
const runCase = (c, extra) => { const b = new Battle.Battle(Object.assign({ cfg, lookup, enemyAI: 'classic' /* the enemy teams' newer judgement (enemycdr.js) is switched off here: these battles are compared with battles stored before it existed */ }, c, extra || {})); b.run(360); return b; };
if (REBASE) { fs.writeFileSync(BASE, JSON.stringify(CASES.map(c => digest(runCase(c, { crewStress: false }))), null, 1)); console.log('baseline rewritten:', BASE); process.exit(0); }
{
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8')); let same = 0;
  CASES.forEach((c, i) => { const d = JSON.stringify(digest(runCase(c, { crewStress: false }))); if (d === JSON.stringify(base[i])) same++; else bad('model off differs from the stored battle', i, c.biome, c.skill, c.mission, '\n   now ', d.slice(0, 300), '\n   was ', JSON.stringify(base[i]).slice(0, 300)); });
  console.log(`1. Model off: ${same} of ${CASES.length} battles identical to the battles from before the model (summary, log length, event count).`);
  const st = runCase(CASES[0], { crewStress: false }).crewState(); if (st.on !== false || st.level !== 0) bad('crewState() with the model off should report off and calm');
}

// ---------------------------------------------------------------- helpers for the counts
const finite = (o, where) => { if (typeof o === 'number') { if (!Number.isFinite(o)) throw new Error('not a finite number at ' + where); } else if (o && typeof o === 'object') for (const k in o) finite(o[k], where + '.' + k); };
const STATES = ['steady', 'strained', 'shaken', 'panicked'], ROLES = ['cdr', 'gnr', 'ldr', 'drv'];
function fight(opt, maxT) {
  const b = new Battle.Battle(Object.assign({ cfg, lookup }, opt)); let n = 0;
  while (b.t < maxT && b.tank.alive && !b.over && n++ < 100000) { b.step(); if (n % 25 === 0) { const s = b.crewState(); finite(s, 'crewState'); for (const r of ROLES) if (s.who[r].stress < 0 || s.who[r].stress > 1) throw new Error('stress out of range'); } }
  finite(b.crewState(), 'crewState'); finite(b.crewReport(), 'crewReport'); finite(b.summary(), 'summary');
  const s = b.summary(); return { b, s, rep: b.crewReport(), result: !b.tank.alive ? 'lost' : b.over ? b.over.result : 'time' };
}
const pc = (x, n) => (n ? Math.round(100 * x / n) : 0) + '%';
const tally = (o, k, n) => { o[k] = (o[k] || 0) + (n == null ? 1 : n); };
function batch(force, quality, n, dt, on) {
  const A = { n: 0, res: {}, worstCrew: [0, 0, 0, 0], worstBy: {}, sec: [0, 0, 0, 0], lay: [0, 0], load: [0, 0], hand: [0, 0], react: [0, 0], freezes: 0, stalls: 0, flinches: 0, holds: 0, buttonUps: 0, nearBail: 0, bail: 0, anyFreeze: 0, anyPanic: 0, hits: 0, fired: 0, why: {}, lines: [], down: 0, wounded: 0, kills: 0 };
  for (const r of ROLES) A.worstBy[r] = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const o = { biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 100 + i, skill: 'trained', mission: 'hold', waves: 2, force, crewQuality: quality, crewStress: on };
    if (dt) o.dt = dt;
    const f = fight(o, 600), R = f.rep; A.n++; tally(A.res, f.result); A.hits += f.s.hits; A.fired += f.s.fired; A.kills += f.s.killedByTank + f.s.killedByMg;
    if (!on) continue;
    let worst = 0; for (const r of ROLES) { const w = STATES.indexOf(R.who[r].worst); A.worstBy[r][w]++; if (w > worst) worst = w; STATES.forEach((s, k) => { A.sec[k] += R.who[r].secondsIn[s]; }); if (R.who[r].status === 'down') A.down++; else if (R.who[r].status === 'wounded') A.wounded++; }
    A.worstCrew[worst]++; if (worst === 3) A.anyPanic++;
    A.lay[0] += R.lay.n; A.lay[1] += R.lay.n * R.lay.meanAddS; A.load[0] += R.load.n; A.load[1] += R.load.totalAddS; A.hand[0] += R.handover.n; A.hand[1] += R.handover.n * R.handover.meanAddS; A.react[0] += R.react.n; A.react[1] += R.react.n * R.react.meanAddS;
    for (const k of ['freezes', 'stalls', 'flinches', 'holds', 'buttonUps', 'nearBail', 'bail']) A[k] += R[k]; if (R.freezes) A.anyFreeze++;
    for (const e of R.events) if (['freeze', 'stall', 'flinch', 'bail_out', 'near_bail'].includes(e.what)) { tally(A.why, e.what + ': ' + String(e.why).split(';')[0].replace(/\d+ m away/, 'N m away')); if (A.lines.length < 4 || e.what === 'bail_out') A.lines.push(`      seed ${100 + i} ${e.t} s  ${e.text}  [${e.why}]`); }
  }
  return A;
}
const resLine = A => ['won', 'time', 'withdrawn', 'objective', 'abandoned', 'lost'].filter(k => A.res[k]).map(k => `${k} ${pc(A.res[k], A.n)}`).join(', ');
const kept = A => A.n - (A.res.lost || 0) - (A.res.abandoned || 0);

// ---------------------------------------------------------------- 2. each crew level, two forces, on against off
console.log(`\n2. ${N} battles per setting (hold mission, trained enemy, 2 waves, up to 600 s, four kinds of ground). "Kept" = vehicle neither destroyed nor abandoned.`);
try {
  for (const [name, force] of Object.entries(FORCES)) {
    const off = batch(force, 'trained', N, null, false);
    console.log(`\n== ${name}`);
    console.log(`   model OFF        kept ${pc(kept(off), off.n)}   (${resLine(off)})   hits ${(off.hits / off.n).toFixed(2)} a battle, enemy teams knocked out ${(off.kills / off.n).toFixed(2)}`);
    for (const q of SKILLS) {
      const A = batch(force, q, N, null, true), men = A.n * 4, tot = A.sec.reduce((a, b) => a + b, 0) || 1;
      console.log(`   ${q.toUpperCase().padEnd(8)} crew    kept ${pc(kept(A), A.n)}   (${resLine(A)})   hits ${(A.hits / A.n).toFixed(2)} a battle, enemy teams knocked out ${(A.kills / A.n).toFixed(2)}`);
      console.log(`      worst state any crewman reached, share of battles: ${STATES.map((s, k) => `${s} ${pc(A.worstCrew[k], A.n)}`).join(', ')}`);
      console.log(`      by seat (worst reached): ${ROLES.map(r => `${r} ${A.worstBy[r].map(x => pc(x, A.n)).join('/')}`).join('   ')}   (steady/strained/shaken/panicked)`);
      console.log(`      share of all crew time: ${STATES.map((s, k) => `${s} ${(100 * A.sec[k] / tot).toFixed(1)}%`).join(', ')}`);
      console.log(`      panic: a man froze in ${pc(A.anyFreeze, A.n)} of battles (${A.freezes} freezes in all); stalls at a warning ${A.stalls}; would not hold for HKOI ${A.flinches} of ${A.flinches + A.holds} times the drill said hold; buttoned up ${A.buttonUps}; near bail-out ${A.nearBail}; BAILED OUT ${A.bail} (${pc(A.bail, A.n)} of battles)`);
      console.log(`      crewmen wounded ${A.wounded}, out of action ${A.down} (of ${men})`);
      console.log(`      mean time added: lay +${(A.lay[0] ? A.lay[1] / A.lay[0] : 0).toFixed(2)} s over ${A.lay[0]} lays; load +${(A.load[0] ? A.load[1] / A.load[0] : 0).toFixed(2)} s over ${A.load[0]} loads; .50 hand-over +${(A.hand[0] ? A.hand[1] / A.hand[0] : 0).toFixed(2)} s over ${A.hand[0]}; warning-to-move +${(A.react[0] ? A.react[1] / A.react[0] : 0).toFixed(2)} s over ${A.react[0]}`);
      const why = Object.entries(A.why).sort((a, b) => b[1] - a[1]).slice(0, 6); if (why.length) console.log('      commonest reasons: ' + why.map(([k, v]) => `${v}x ${k}`).join(' | '));
      for (const l of A.lines.slice(0, 5)) console.log(l);
    }
  }
  // ---------------------------------------------------------------- 3. step size
  const M = Math.min(N, 24), force = Object.values(FORCES)[0];
  console.log(`\n3. Step size (${M} battles, trained crew, first force). The battle itself rolls dice per step, so single battles differ; the shares should be close.`);
  for (const dt of [0.05, 0.1, 0.2]) { const A = batch(force, 'trained', M, dt, true), tot = A.sec.reduce((a, b) => a + b, 0) || 1;
    console.log(`   step ${dt} s: kept ${pc(kept(A), A.n)}; worst state ${STATES.map((s, k) => `${s} ${pc(A.worstCrew[k], A.n)}`).join(', ')}; crew time ${STATES.map((s, k) => `${s} ${(100 * A.sec[k] / tot).toFixed(1)}%`).join(', ')}; freezes ${A.freezes}, bailed ${A.bail}`); }
  // the stress sums themselves must not depend on the step: one fixed set of jolts fed to a crew at three step sizes
  { const peaks = [0.05, 0.1, 0.2].map(dt => { const b = new Battle.Battle({ cfg, lookup, biome: 'desert', mapSeed: 3, seed: 5, force: [], dt }); const C = b._crewInit();
      b._crewLater(C, 2, () => b._crewAll(C, 0.3, 'test jolt')); b._crewLater(C, 2, () => C.air.push({ a: 2, b: 12 })); const out = [];
      while (b.t < 60 - 1e-9) { b.step(); if (Math.abs(b.t - 12) < 1e-6 || Math.abs(b.t - 60) < 1e-6) out.push(+b.crewState().who.gnr.stress.toFixed(3)); } return out; });
    console.log('   fixed jolt, gunner stress at 12 s and 60 s for steps 0.05 / 0.1 / 0.2:', JSON.stringify(peaks));
    for (const p of peaks) for (let k = 0; k < 2; k++) if (Math.abs(p[k] - peaks[1][k]) > 0.01) bad('stress depends on the step size', JSON.stringify(peaks)); }
  console.log('   no NaN and no stress outside 0..1 in any battle above (checked every 25 steps and at the end).');
} catch (e) { bad(e.stack || e.message); }
console.log(fail ? '\nCREW TESTS FAILED' : '\nCREW TESTS PASS'); process.exit(fail ? 1 : 0);
