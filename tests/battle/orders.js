// node tests/battle/orders.js [--rebase]
// The player's orders (src/battle/orders.js, the hooks in src/battle/tankai.js).
//  1. With the crew in command (the default) every battle is exactly the battle from before the orders existed: the 24 battles of
//     tests/battle/vehicles_off.js (same cases, same checksum, but with the teams' present judgement left on) against
//     tests/battle/orders_off_baseline.json, which was written from the code BEFORE any orders hook went in.
//     (--rebase rewrites it from the present code: only after a deliberate change.)
//  2. The same seed and the same orders give the same battle twice, also when the orders come back as a recorded list (a replay).
//  3. Each order does what it says.
const fs = require('fs'), path = require('path');
const { HK, Battle } = require('./load.js');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), REBASE = process.argv.includes('--rebase');
const BASE = path.join(__dirname, 'orders_off_baseline.json');
const BIOMES = ['farmland', 'desert', 'town', 'forest'], SKILLS = ['green', 'trained', 'expert', 'veteran'], MISSIONS = ['hold', 'advance', 'hunt'];
const FORCES = [
  [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }],
  [{ type: 'saclos', n: 1 }, { type: 'rpg', n: 3 }, { type: 'fpv', n: 2 }],
  [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv_fiber', n: 1 }],
];
const CASES = []; for (let i = 0; i < 24; i++) CASES.push({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 3) * 4, seed: i + 1, skill: SKILLS[(i >> 1) % 4], mission: MISSIONS[i % 3], waves: 1 + (i % 2), force: FORCES[i % 3], crewStress: i % 4 < 2 });
const sum = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const digest = b => ({ summary: b.summary(), over: b.over ? b.over.result : null, log: b.log.length, events: (b.events || []).length, logSum: sum(b.log.map(l => l.t + '|' + l.text + '|' + (l.why || '')).join('\n')), evSum: sum(JSON.stringify(b.events || [])), units: sum(JSON.stringify(b.units.map(u => [u.id, u.type, +u.e.toFixed(2), +u.n.toFixed(2), u.state, u.ammo, u.alive]))) });
const mk = (c, extra) => new Battle.Battle(Object.assign({ cfg, lookup }, c, extra || {}));
if (REBASE) { fs.writeFileSync(BASE, JSON.stringify(CASES.map(c => digest(mk(c).run(360))), null, 1)); console.log('baseline rewritten:', BASE); process.exit(0); }
let fail = 0; const ok = (cond, what, detail) => { if (cond) console.log('  ok    ' + what); else { fail++; console.log('  FAIL  ' + what + (detail ? '\n        ' + detail : '')); } };

// ---- 1. the crew in command: nothing has changed
console.log('1. crew in command (orders off): 24 battles against the stored baseline');
{ const base = JSON.parse(fs.readFileSync(BASE, 'utf8')); let same = 0;
  CASES.forEach((c, i) => { const b = mk(c).run(360), d = JSON.stringify(digest(b)); if (d === JSON.stringify(base[i]) && b.cmd === null) same++; else console.log('        differs: battle', i, c.biome, c.skill, c.mission); });
  ok(same === CASES.length, `${same} of ${CASES.length} battles identical (summary, result, every log line, every event, every team's end state)`); }

// ---- 2. the same seed and the same orders: the same battle
const F1 = FORCES[0], angDiff = (a, b) => ((a - b + 540) % 360) - 180;
const P = extra => Object.assign({ biome: 'desert', mapSeed: 11, seed: 2, skill: 'trained', mission: 'hold', force: F1, command: 'player' }, extra || {});
// a point the tank can stand on, about d metres from it, that the driver has a way to
const pointNear = (b, d) => { const T = b.tank; for (let a = 0; a < 360; a += 30) { const e = Math.round(T.e + Math.sin(a * Math.PI / 180) * d), n = Math.round(T.n + Math.cos(a * Math.PI / 180) * d); if (b.orderRoute(e, n).ok) return { e, n }; } return null; };
const full = b => JSON.stringify([digest(b), b.cmd ? b.cmd.log : null, +b.tank.e.toFixed(2), +b.tank.n.toFixed(2), +b.tank.h.toFixed(1)]);
console.log('2. the same seed and the same orders give the same battle');
{ const play = () => { const b = mk(P()), pt = pointNear(b, 180), script = [[1, { k: 'move', e: pt.e, n: pt.n }], [3, { k: 'prio', v: 'nearest' }], [12, { k: 'warn', v: 'cover' }], [14, { k: 'smokepol', v: 'now' }], [20, { k: 'hkoi', v: 'obs' }], [33, { k: 'reverse' }], [50, { k: 'face', brg: 200 }], [70, { k: 'main', v: 'hold' }], [90, { k: 'main', v: 'free' }], [100, { k: 'smoke' }]];
    let si = 0; while (b.t < 240 && b.tank.alive && !b.over) { while (si < script.length && b.t >= script[si][0] - 1e-6) b.order(script[si++][1]); b.step(); } return b; };
  const a = play(), b = play();
  ok(a.cmd.log.length >= 8, `a battle with ${a.cmd.log.length} orders was fought (ended ${a.over ? a.over.result : a.tank.alive ? 'on time' : 'lost'} at ${a.t.toFixed(0)} s, ${a.volleys.length} engagements)`);
  ok(full(a) === full(b), 'fought twice with the orders given at the same moments: identical');
  const c = mk(P({ orders: JSON.parse(JSON.stringify(a.cmd.log)) })); while (c.t < a.t - 1e-6 && c.tank.alive && !c.over) c.step(); if (c._pending) c.step();
  ok(full(a) === full(c), 'fought again from the recorded list of orders (a replay): identical', full(a).slice(0, 300) + '\n        ' + full(c).slice(0, 300));
  const d = mk(P()); d.run(a.t); ok(full(a) !== full(d), 'and it is not the battle fought without orders (the orders did something)'); }

// ---- 3. each order does what it says
console.log('3. each order does what it says');
const runUntil = (b, t) => { while (b.t < t - 1e-6 && b.tank.alive && !b.over) b.step(); return b; };
{ const b = mk(P({ command: undefined })); const r = b.order({ k: 'halt' }); ok(!r.ok && b.cmd === null, 'crew in command: an order is refused and nothing is recorded'); }
{ // move, delay, halt. A vehicle that starts to move is usually fired on within seconds, so the move is judged by its arriving in the end.
  let did = false;
  for (let seed = 1; seed <= 24 && !did; seed++) { const base = P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4 });
    const b = mk(base), T = b.tank, pt = pointNear(b, 150), e0 = T.e, n0 = T.n; if (!pt) continue; runUntil(b, 1); const r = b.order({ k: 'move', e: pt.e, n: pt.n }); if (!r.ok) continue;
    runUntil(b, r.at - 0.2); const still = T.e === e0 && T.n === n0 && !T.goal; runUntil(b, r.at + 1.5); const going = !!T.goal && Math.hypot(T.e - e0, T.n - n0) > 0.3, st = b.orderState(); if (b.volleys.length) continue;
    { const t = b.t; while (b.t < t + 300 && b.orderState().move && T.alive && !b.over) b.step(); } if (!T.alive || Math.hypot(T.e - pt.e, T.n - pt.n) > 4) continue;   /* knocked out, or took cover and dropped the order: try the next battle */
    const c = mk(base), Tc = c.tank, p2 = pointNear(c, 400); if (!p2) continue; runUntil(c, 1); c.order({ k: 'move', e: p2.e, n: p2.n }); runUntil(c, 5.5); const moving = Math.abs(Tc.v) > 1; const h = c.order({ k: 'halt' }); if (c.volleys.length) continue; runUntil(c, h.at + 0.3); const at = [Tc.e, Tc.n]; runUntil(c, h.at + 4); if (c.volleys.length) continue;
    did = true;
    ok(r.ok && Math.abs(r.at - 1 - 2.6) < 0.11, `move (seed ${seed}): takes effect ${(r.at - 1).toFixed(1)} s after it is given (1.0 s to say it, 1.6 s for a steady driver to react)`);
    ok(still, 'move: the vehicle has not stirred before the order reaches the driver');
    ok(going, 'move: then it is on its way');
    ok(st.move && st.route && st.route.length >= 1, 'move: the state for the screen carries the destination and the route');
    ok(b.orderState().move === null, `move: it arrives (${Math.hypot(T.e - pt.e, T.n - pt.n).toFixed(1)} m from the point after ${b.t.toFixed(0)} s and ${b.volleys.length} engagement(s) on the way) and the driver reports in position`);
    const bad = b.order({ k: 'move', e: 99999, n: 0 }); ok(!bad.ok, 'move: a point off the map is refused: "' + bad.text + '"');
    ok(moving && Tc.e === at[0] && Tc.n === at[1] && !Tc.goal && c.orderState().move === null, 'halt: a moving vehicle stops and stays'); }
  if (!did) ok(false, 'move and halt: no battle among the tried seeds gave a clean case to test'); }
{ // a missile warning while moving on an order: the vehicle brakes to a halt (it does not stop dead), then goes on when the engagement is over
  let did = false;
  for (let seed = 1; seed <= 24 && !did; seed++) { const b = mk(P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4 })), T = b.tank, pt = pointNear(b, 600); if (!pt) continue; runUntil(b, 1); b.order({ k: 'move', e: pt.e, n: pt.n });
    while (b.t < 120 && T.alive && !b.over && !b.volleys.length) b.step(); const v = b.volleys[0]; if (!v || Math.abs(v.at.v) < 2 || v.plan.cover) continue;
    const p0 = v.path.find(q => q[0] >= 0), p1 = v.path.find(q => q[0] >= 1), pe = v.path[v.path.length - 1], roll = Math.hypot(pe[1], pe[2]);
    runUntil(b, v.tEnd + 6); did = true;
    ok(roll > 0.5 && roll < 30 && Math.abs(pe[4]) < 0.01 && Math.abs(p1[4]) < Math.abs(p0[4]), `fired on while moving at ${(Math.abs(v.at.v) * 3.6).toFixed(0)} km/h (seed ${seed}): the vehicle brakes over ${roll.toFixed(1)} m to a halt`);
    ok(!T.alive || !!T.goal || Math.hypot(T.e - pt.e, T.n - pt.n) < 4 || b._volleyActive(), 'and the move goes on when the engagement is over'); }
  if (!did) ok(false, 'braking: no battle among the tried seeds fired on the vehicle while it moved'); }
{ // back to cover
  let done = false;
  for (const seed of [2, 5, 6, 3, 9, 10, 11, 12]) { const b = mk(P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4 })), T = b.tank, W = b.world; let th = null;
    while (b.t < 200 && T.alive && !b.over) { b.step(); if (!b._volleyActive() && T.known.some(k => !k.done)) { const x = b._threats(); if (x.some(o => W.los(o.e, o.n, 1.3, T.e, T.n, 1.0).clear)) { th = x; break; } } }
    if (!th) continue; const seen = () => th.filter(o => W.los(o.e, o.n, 1.3, T.e, T.n, 1.0).clear).length, before = seen(), e0 = T.e, n0 = T.n, r = b.order({ k: 'reverse' }); if (!r.ok) continue;
    runUntil(b, r.at + 0.15); if (!T.goal) continue; const rev = T.rev; while (b.t < r.at + 80 && T.goal && T.alive && !b.over && !b._volleyActive()) b.step(); if (T.goal || !T.alive) continue;
    const after = seen(), d = Math.hypot(T.e - e0, T.n - n0);
    ok(after < before && d > 5, `back to cover (seed ${seed}): ${rev ? 'reversed' : 'drove'} ${d.toFixed(0)} m; the hull was in view of ${before} of ${th.length} known firing points, now ${after}`); done = true; break; }
  if (!done) ok(false, 'back to cover: no battle among the tried seeds gave a case to test'); }
{ // face
  let did = false;
  for (let seed = 1; seed <= 24 && !did; seed++) { const b = mk(P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4 })), T = b.tank; runUntil(b, 1); const want = (Math.round(T.h) + 70) % 360, r = b.order({ k: 'face', brg: want }); runUntil(b, r.at + 6); if (b.volleys.length) continue;
    did = true; ok(Math.abs(angDiff(T.h, want)) < 5, `face (seed ${seed}): the hull turns to the bearing ordered (${want}, now ${T.h.toFixed(0)})`); }
  if (!did) ok(false, 'face: no battle among the tried seeds stayed quiet for the eight seconds needed'); }
{ // hold fire
  const free = mk(P({ seed: 3, biome: 'forest', mapSeed: 3 })).run(200), b = mk(P({ seed: 3, biome: 'forest', mapSeed: 3 })); b.order({ k: 'main', v: 'hold' }); b.order({ k: 'mg', v: 'hold' }); const m0 = b.tank.main + (b.tank.ap || 0); b.run(200); b._crew();
  ok((free.shots || []).length + (free.mgs || []).length > 0, `without the order the guns fire in this battle (${(free.shots || []).length} main gun rounds, ${(free.mgs || []).length} bursts)`);
  ok((b.shots || []).length === 0 && (b.mgs || []).length === 0 && b.tank.main + (b.tank.ap || 0) === 18 + 24 && b.tank.m2 === 600 && b.tank.coax === 2400, 'hold fire (main gun and machine guns): not one round is fired'); void m0; }
{ // HKOI modes
  const base = P({ seed: 4, biome: 'farmland', mapSeed: 7, force: FORCES[2], waves: 2 });
  const a = mk(base).run(300), fa = (a.events || []).filter(e => e.type === 'hkoi_fire').length;
  const h = mk(base); h.order({ k: 'hkoi', v: 'hold' }); h.run(300); const fh = (h.events || []).filter(e => e.type === 'hkoi_fire').length, sh = h.summary();
  ok(fa > 0 && fh === 0 && sh.obs === 150 && sh.he === 150, `HKOI hold: it fires at nothing (automatic fired at ${fa} threats in the same battle; held: 0, no round used)`);
  const o = mk(base); o.order({ k: 'hkoi', v: 'obs' }); o.run(300); const so = o.summary();
  const e = mk(base); e.order({ k: 'hkoi', v: 'he' }); e.run(300); const se = e.summary();
  ok(so.he === 150 && se.obs === 150, `HKOI obscurant only uses no airburst (${150 - so.obs} obscurant, ${150 - so.he} airburst); airburst only uses no obscurant (${150 - se.obs} obscurant, ${150 - se.he} airburst)`); }
{ // the drill on a missile warning
  let cov = 0, covJ = 0, heldWithCover = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) { const base = P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4 });
    const c = mk(base); c.order({ k: 'warn', v: 'cover' }); c.run(150); const h = mk(base); h.order({ k: 'warn', v: 'hold' }); h.run(150); const j = mk(base); j.run(150);
    n += c.volleys.length; cov += c.volleys.filter(v => v.plan.cover).length; covJ += j.volleys.filter(v => v.plan.cover).length; heldWithCover += h.volleys.filter(v => v.plan.cover).length; }
  ok(cov > 0 && heldWithCover === 0, `on a warning: "make for cover" sent the driver to cover in ${cov} engagements of ten battles, "hold still" in ${heldWithCover} (the crew's own judgement: ${covJ})`); }
{ // smoke
  const b = mk(P()); runUntil(b, 1); const r1 = b.order({ k: 'smoke' }); runUntil(b, r1.at + 0.2); const st = b.orderState(), again = b.order({ k: 'smoke' });
  ok(r1.ok && st.smokes === 1 && st.smokeLeft > 20 && (b.events || []).some(e => e.type === 'smoke') && !again.ok, 'smoke: a salvo goes, one is left, the screen stands; a second while it stands is refused');
  runUntil(b, r1.at + 40); const r2 = b.order({ k: 'smoke' }); runUntil(b, r2.at + 30); const r3 = b.order({ k: 'smoke' });
  ok(r2.ok && !r3.ok && b.orderState().smokes === 0, 'smoke: two salvos, then the dischargers are empty: "' + r3.text + '"');
  let never = 0, crewSm = 0, nowMask = 0, nowUsed = 0; const byKey = {};
  for (let seed = 1; seed <= 12; seed++) { const base = P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4, skill: 'expert', force: FORCES[2] });
    const cnt = x => x.volleys.reduce((s, v) => s + (v.rec.events || []).filter(e => /fires the smoke grenades/.test(e.text || '')).length, 0);
    const a = mk(base); a.run(150); crewSm += cnt(a); const nv = mk(base); nv.order({ k: 'smokepol', v: 'never' }); nv.run(150); never += cnt(nv);
    const nw = mk(base); nw.order({ k: 'smokepol', v: 'now' }); nw.order({ k: 'warn', v: 'cover' }); nw.run(150); nowUsed += nw.orderStats().smokesUsed; for (const v of nw.volleys) for (const th of v.rec.threats) if (th.defeated_by === 'crew_smoke') { nowMask++; byKey[th.key] = (byKey[th.key] || 0) + 1; } }
  ok(never === 0, `smoke "only on my order": the crew never fires it by itself (it did ${crewSm} times in the same twelve battles when left to judge)`);
  ok(nowUsed > 0, `smoke "at once" with "make for cover": ${nowUsed} salvos went on warnings in twelve battles; ${nowMask} missiles or rockets were lost in the smoke (${JSON.stringify(byKey)})`); }
{ // hatches
  const base = P({ seed: 8, biome: 'farmland', mapSeed: 9, force: [{ type: 'rpg', n: 3 }, { type: 'saclos', n: 1 }] });
  const a = mk(base).run(200), b = mk(base); b.order({ k: 'hatch', v: 'shut' }); let open = 0, up = 0; while (b.t < 200 && b.tank.alive && !b.over) { b.step(); if (b.t > 3 && !b.crewState().buttoned) open++; if (b.t > 8 && b._crew().ldr.up) up++; }
  const upA = a._crew().ldr.upAt.reduce((s, iv) => s + Math.min(iv[1], a.t) - iv[0], 0);
  ok(upA > 0 && up === 0 && open === 0, `hatches kept shut: the loader stays inside (he was up for ${upA.toFixed(0)} s of the same battle without the order) and the crew stays buttoned up`); }
{ // target order and a pointed-out team
  let did = false;
  for (let seed = 1; seed <= 16 && !did; seed++) { const b = mk(P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4, force: FORCES[2] })), T = b.tank; b.order({ k: 'main', v: 'hold' }); b.order({ k: 'mg', v: 'hold' });
    while (b.t < 150 && T.alive && !b.over) { b.step(); const tg = b._targets().filter(q => q.los); if (tg.length >= 2 && !b._volleyActive()) {
        const pick = tg[tg.length - 1], r = b.order({ k: 'engage', uid: pick.u.id }); if (!r.ok) break; runUntil(b, r.at + 0.2); const now = b._targets();
        const first = now.length && now[0].u.id === pick.u.id, inView = now.some(q => q.u.id === pick.u.id && q.los);
        if (inView) { ok(first, `engage (seed ${seed}): the team pointed out (${pick.u.spec.name} #${pick.u.id + 1}, last of ${tg.length} in the gunner's own order) is now first`);
          b.order({ k: 'engage', uid: null }); const n = b.order({ k: 'prio', v: 'nearest' }); runUntil(b, n.at + 0.2); const l = b._targets(); ok(l.every((q, i) => !i || l[i - 1].R <= q.R), 'target order "nearest first": the list runs from the nearest outward'); did = true; }
        break; } } }
  if (!did) ok(false, 'engage: no battle among the tried seeds had two teams in view at once'); }
{ // withdraw
  let did = false;
  for (let seed = 1; seed <= 24 && !did; seed++) { const b = mk(P({ seed, biome: BIOMES[seed % 4], mapSeed: 3 + seed % 3 * 4 })), T = b.tank, pt = pointNear(b, 200); if (!pt) continue; runUntil(b, 1); b.order({ k: 'move', e: pt.e, n: pt.n }); runUntil(b, 4);
    { const t = b.t; while (b.t < t + 200 && b.orderState().move && T.alive && !b.over) b.step(); } const far = Math.hypot(T.e - T.home.e, T.n - T.home.n); if (!T.alive || b.over || far < 100) continue;
    b.order({ k: 'withdraw' }); { const t = b.t; while (b.t < t + 300 && T.alive && !b.over) b.step(); } if (!T.alive) continue;
    did = true; ok(b.over && b.over.result === 'withdrawn' && Math.hypot(T.e - T.home.e, T.n - T.home.n) < 30, `withdraw (seed ${seed}): from ${far.toFixed(0)} m out the vehicle goes back to the start line and the mission ends as "${b.over ? b.over.result : 'not over'}"`); }
  if (!did) ok(false, 'withdraw: no battle among the tried seeds gave a case to test'); }
{ // the debrief's part for decisions
  const L = require('../../src/battle/ladder.js'), a = mk(P()).run(240), c = mk(P({ command: undefined })).run(240), da = L.debrief(a), dc = L.debrief(c);
  ok(dc.decisions === null && da.decisions && da.decisions.max === 20 && da.decisions.lines.length > 0 && da.decisions.assumptions.length > 0, `debrief: a commanded battle gets a decisions mark (${da.decisions ? da.decisions.score : '-'} of 20, ${da.decisions ? da.decisions.lines.length : 0} lines, assumptions stated); a watched battle gets none`);
  ok(da.score <= 100 && dc.score <= 100, 'debrief: the score of the fight is still out of 100 either way'); }

console.log(fail ? `\nFAILED: ${fail}` : '\nORDERS TEST PASSED'); process.exit(fail ? 1 : 0);
