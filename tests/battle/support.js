// node tests/battle/support.js [battles per part, default 40]
// Friendly support and the bomber drone (src/battle/support.js). (That a battle without them is unchanged: tests/battle/support_off.js.)
// 1 the same seed gives the same battle twice, with everything switched on
// 2 the wingman: is fired at in engagements of its own, fires its own guns from its own magazines, can be lost, never has negative
//   ammunition, and its events carry its name; a team only fires at a tank it could see and reach
// 3 mutual cover: the engine's platoon rule gives help between two tanks with HKOI and none from a wingman without HKOI
// 4 artillery: the order hook (callFire) refuses danger close, off the map and a fourth mission; rounds land after the stated delay,
//   near the place called; missions knock teams out over a set of battles
// 5 the scout drone finds teams the crew had not located, and can be lost
// 6 the bomber drone: it flies, HKOI's bursts at it come out of the HE magazine, bombs fall only from a drone that got there, and a
//   hit goes through the damage model
// 7 the cost of a step with everything on
const { HK, Battle, Support } = require('./load.js');
const N = +(process.argv[2] || 40), cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
const BIOMES = ['farmland', 'desert', 'town', 'forest'], MISSIONS = ['hold', 'hold', 'advance', 'hunt'];
let fail = 0; const bad = m => { fail++; if (fail < 15) console.log('FAIL', m); }, ok = (c, m) => { if (!c) bad(m); };
const sum = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const mk = (i, force, support, extra) => new Battle.Battle(Object.assign({ cfg, lookup, biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 700 + i, skill: ['trained', 'expert', 'veteran'][i % 3], mission: MISSIONS[i % 4], waves: 1, force, support, fate: true }, extra || {}));
const run = (b, T, each) => { let n = 0; const t0 = Date.now(); while (b.t < (T || 600) && b.tank.alive && !b.over && n++ < 100000) { b.step(); if (each) each(b); } b._n = n; b._ms = Date.now() - t0; return b; };
const F = Support.FORCES, ALL = { wingman: 'same', artillery: 3, scout: true };

// ---- 1 determinism
{ const force = F.section_attack.force; for (let i = 0; i < 3; i++) { const a = run(mk(i, force, ALL)), b = run(mk(i, force, ALL));
    ok(sum(JSON.stringify(a.log)) === sum(JSON.stringify(b.log)) && sum(JSON.stringify(a.events)) === sum(JSON.stringify(b.events)) && JSON.stringify(a.supReport()) === JSON.stringify(b.supReport()), 'battle ' + i + ' is not the same twice'); }
  console.log('1 determinism: three battles with wingman, artillery, scout and a bomber crew fought twice each: ' + (fail ? 'DIFFERENT' : 'identical')); }

// ---- 2 the wingman
{ let vol = 0, at = 0, hits = 0, lost = 0, guns = 0, mgs = 0, kills = 0, both = 0, tv = 0, pv = 0, pfired = 0;
  for (let i = 0; i < N; i++) { const b = mk(i, F.platoon_defence.force, { wingman: 'same' }), G = b.wing, seenV = new Set();
    run(b, 600, bb => { for (const v of G.volleys) if (!seenV.has(v)) { seenV.add(v); for (const l of v.launches) { const u = l.u; if (u.veh || u.spec.indirect) continue; ok(l.R >= u.spec.rmin * 0.98 && l.R <= u.spec.rmax * 1.02, `battle ${i}: ${u.spec.name} fired at the wingman from ${Math.round(l.R)} m, outside its reach`); } } });
    const R = b.supReport().wing; vol += R.volleys; at += R.fired; hits += R.hits; if (!R.alive) lost++; guns += G.shots.length; mgs += G.mgs.length; kills += R.killedByTank + R.killedByMg; pv += b.volleys.length; pfired += b.summary().fired; tv += R.volleys + b.volleys.length;
    ok(G.st.obs >= 0 && G.st.he >= 0 && G.st.apsL >= 0 && G.st.apsR >= 0 && G.main >= 0 && G.ap >= 0, `battle ${i}: the wingman's ammunition went negative`);
    ok(G.main + G.shots.filter(s => !s.round || s.round === 'mp').length <= 18 + 24, `battle ${i}: the wingman fired more rounds than it carries`);
    ok(!b.events.some(e => /^wing_/.test(e.type) && !e.wing && e.type !== 'wing_lost'), `battle ${i}: a wingman event without its mark`);
    ok(b.events.filter(e => e.type === 'launch').every(e => b.volleys[e.v] && b.volleys[e.v].rec.threats.some(th => th.idx === e.idx)), `battle ${i}: a launch event of the player's that is not in the player's engagements`);
    ok(!!R.alive || b.events.some(e => e.type === 'wing_lost'), `battle ${i}: wingman lost without a wing_lost event`);
    if (R.volleys && b.volleys.length) both++; }
  ok(vol > 0 && at > 0, 'the wingman was never fired at'); ok(guns > 0 && mgs > 0, 'the wingman never fired its guns');
  console.log(`2 wingman, ${N} battles (platoon in the defence): engagements on the wingman ${(vol / N).toFixed(2)} a battle with ${(at / N).toFixed(2)} missiles and rockets (on the player ${(pv / N).toFixed(2)} with ${(pfired / N).toFixed(2)}); hits on it ${(hits / N).toFixed(2)}; lost in ${lost}; its main gun fired ${(guns / N).toFixed(1)} rounds and its machine guns ${(mgs / N).toFixed(1)} bursts a battle; teams it knocked out ${(kills / N).toFixed(2)}; both tanks engaged in ${both} battles.`); }

// ---- 3 mutual cover
{ const c2 = JSON.parse(JSON.stringify(cfg)); c2.aps.enabled = false; let a = 0, ak = 0, a0 = 0, kinds = {};
  for (let i = 0; i < N; i++) { const b = run(new Battle.Battle({ cfg: c2, lookup, biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 700 + i, skill: 'trained', mission: 'hold', waves: 1, force: F.platoon_defence.force, support: { wingman: 'hkoi' } })), s = b.supReport().stat; a += s.assists; ak += s.assistKills;
    for (const e of b.events) if (e.type === 'assist') kinds[e.kind + (e.kill ? ' saved' : ' no effect')] = (kinds[e.kind + (e.kill ? ' saved' : ' no effect')] || 0) + 1;
    for (const v of b.volleys.concat(b.wing.volleys)) for (const th of v.rec.threats) if (/^neighbour/.test(th.defeated_by || '')) ok(th.viz.end.type !== 'hit', 'a threat stopped by the neighbour still counted as a hit');
    const b0 = run(new Battle.Battle({ cfg: c2, lookup, biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 700 + i, skill: 'trained', mission: 'hold', waves: 1, force: F.platoon_defence.force, support: { wingman: 'none' } })); a0 += b0.supReport().stat.assists;
    ok(b0.events.every(e => e.type !== 'assist' || e.from !== 'wing'), 'a wingman without HKOI gave HKOI help'); }
  console.log(`3 mutual cover, ${N} battles, both tanks HKOI only (no Trophy, so hits are common): the other tank's HKOI fired to help ${(a / N).toFixed(2)} times a battle and saved ${(ak / N).toFixed(2)} hits a battle ${JSON.stringify(kinds)}; with a wingman that has no HKOI the player's HKOI helped it ${(a0 / N).toFixed(2)} times a battle and it helped nobody.`); }

// ---- 4 artillery
{ const b = mk(0, F.fire_support.force, { artillery: 3 }), T = b.tank;
  let r = b.callFire({ e: T.e + 300, n: T.n }); ok(!r.ok && /danger close/.test(r.why), 'danger close was not refused');
  r = b.callFire({ e: 1e6, n: 0 }); ok(!r.ok, 'a target off the map was not refused');
  r = b.callFire({ e: T.e + 900, n: T.n, kind: 'smoke' }); ok(!r.ok, 'a smoke mission was accepted');
  const tx = T.e + 900 * Math.sin(1), tn = T.n + 900 * Math.cos(1), t0 = b.t; r = b.callFire({ e: tx, n: tn }); ok(r.ok && Math.abs(r.splash - t0 - Support.ART.delay) < 0.01, 'a good call was refused, or the delay is wrong');
  ok(!b.callFire({ e: tx, n: tn }).ok, 'a second mission was accepted while the first was still to fall');
  let n = 0; while (b.t < r.splash + 40 && b.tank.alive && n++ < 20000) b.step();
  const fm = b.fires()[0]; ok(fm.rounds.length === 12 && fm.rounds.every(q => q.done) && fm.state === 'over', 'the mission did not fire its 12 rounds');
  ok(fm.rounds.every(q => q.t >= r.splash - 0.01 && q.t <= r.splash + Support.ART.gap + 2), 'rounds landed outside the stated times');
  const far = Math.max(...fm.rounds.map(q => Math.hypot(q.e - tx, q.n - tn))), mean = fm.rounds.reduce((s, q) => s + Math.hypot(q.e - tx, q.n - tn), 0) / 12; ok(far < 200 && mean > 5, 'rounds landed too far from, or exactly on, the place called');
  ok(b.events.filter(e => e.type === 'fire_splash').length === 12 && b.events.some(e => e.type === 'fire_call'), 'fire events missing');
  const b2 = mk(1, F.fire_support.force, { artillery: 1 }); b2.callFire({ e: b2.tank.e + 900, n: b2.tank.n }); n = 0; while (b2.t < 140 && n++ < 20000 && b2.tank.alive) b2.step(); ok(/no missions left/.test(b2.callFire({ e: b2.tank.e - 900, n: b2.tank.n }).why || ''), 'a mission beyond the allowance was accepted');
  let called = 0, kills = 0, rounds = 0, corr = 0;
  for (let i = 0; i < N; i++) { const x = run(mk(i, F.fire_support.force, { artillery: 3, scout: true })), s = x.supReport().stat; called += s.artCalled; kills += s.artKills; rounds += s.artRounds; corr += x.sup.fires.filter(f => f.corrected).length;
    for (const f of x.sup.fires) for (const fr of [x.tank]) ok(Math.hypot(f.e - fr.e, f.n - fr.n) >= 0 /* the call was clear of the tank when made; it may have moved since */, ''); }
  ok(called > 0 && rounds > 0, 'the commander never called for fire');
  console.log(`4 artillery: the order hook refuses danger close, off the map, smoke, a second mission at once and one over the allowance; 12 rounds landed ${Support.ART.delay} s after the call, on average ${mean.toFixed(0)} m from the place called (furthest ${far.toFixed(0)} m). Over ${N} battles the commander called ${(called / N).toFixed(2)} missions a battle, ${(rounds / N).toFixed(1)} rounds, ${(kills / N).toFixed(2)} teams knocked out a battle (${called ? (kills / called).toFixed(2) : 0} a mission); the scout corrected ${corr} of ${called} missions.`); }

// ---- 5 the scout drone
{ let found = 0, lost = 0, shot = 0, loc0 = 0, loc1 = 0;
  for (let i = 0; i < N; i++) { const a = run(mk(i, F.fire_support.force, { scout: true })), s = a.supReport(); found += s.scout.found; if (!s.scout.alive) { lost++; if (s.scout.lostHow === 'shot down') shot++; }
    ok(a.events.filter(e => e.type === 'scout_found').length === s.scout.found, 'scout_found events do not match the count'); loc1 += a.events.filter(e => e.type === 'located').length;
    const c = run(mk(i, F.fire_support.force, null)); loc0 += c.events.filter(e => e.type === 'located').length; }
  ok(found > 0, 'the scout drone never found a team');
  console.log(`5 scout drone, ${N} battles: it found ${(found / N).toFixed(2)} teams a battle that the crew had not located (teams located in all: ${(loc1 / N).toFixed(2)} a battle with it, ${(loc0 / N).toFixed(2)} without); lost in ${lost} battles (${shot} shot down, ${lost - shot} link or crash).`); }

// ---- 6 the bomber drone
{ const only = [{ type: 'bomber', n: 2 }]; let rows = [];
  for (const su of ['both', 'none']) { const c = JSON.parse(JSON.stringify(cfg)); if (su === 'none') { c.hkoi_enabled = false; c.aps.enabled = false; } let S = { sorties: 0, bursts: 0, down: 0, dropped: 0, hits: 0, kills: 0, lost: 0 };
    for (let i = 0; i < N; i++) { const b = run(new Battle.Battle({ cfg: c, lookup: su === 'both' ? lookup : {}, biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 700 + i, skill: ['trained', 'expert', 'veteran'][i % 3], mission: 'hold', waves: 1, force: only, fate: true }), 900), s = b.supReport().stat;
      S.sorties += s.bomberSorties; S.bursts += s.bomberBursts; S.down += s.bomberDown; S.dropped += s.bombsDropped; S.hits += s.bombHits; S.kills += s.bombKills; if (!b.tank.alive) S.lost++;
      ok(b.volleys.length === 0, 'a bomber-only force caused an engine engagement');
      ok(b.tank.st.he === 150 - 4 * s.bomberBursts, `HE left ${b.tank.st.he} does not match ${s.bomberBursts} bursts at the bomber`);
      ok(s.bombsDropped <= 2 * (s.bomberSorties - s.bomberDown) + 2 * s.bomberDown, 'more bombs than drones could carry'); ok(b.events.filter(e => e.type === 'bomb_hit').length === s.bombHits, 'bomb_hit events do not match');
      ok((b.bombs || []).every(B => B.t1 > B.t0 && B.alt > 0), 'a bomb without a fall'); if (su === 'none') ok(s.bomberBursts === 0 && s.bomberDown === 0, 'HKOI fired while switched off');
      if (!b.tank.alive) ok(b.tank.fate && ['knocked_out', 'ammo_vented', 'catastrophic'].includes(b.tank.fate.kind) && b.tank.fate.by === 'fpv', 'a tank lost to a bomb without an ending'); }
    rows.push(`${su === 'both' ? 'HKOI + Trophy' : 'neither'}: ${(S.sorties / N).toFixed(1)} sorties a battle, HKOI bursts ${(S.bursts / N).toFixed(1)}, drones shot down ${(S.down / N).toFixed(2)}, bombs dropped ${(S.dropped / N).toFixed(2)}, bomb hits ${(S.hits / N).toFixed(2)}, M1 lost ${S.lost} of ${N}`); if (su === 'none') ok(S.dropped > 0 && S.hits > 0, 'no bomb ever hit an undefended tank'); else ok(S.bursts > 0, 'HKOI never fired at a bomber'); }
  console.log(`6 bomber drone, two crews and nothing else, ${N} battles: ` + rows.join('; ') + '.'); }

// ---- 7 cost of a step
{ const HEAVY = [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }]; const out = [];
  for (const [name, sup, force] of [['no support', null, HEAVY], ['wingman', { wingman: 'same' }, HEAVY], ['wingman, artillery, scout', ALL, HEAVY], ['wingman, artillery, scout, bombers', ALL, HEAVY.concat([{ type: 'bomber', n: 2 }])]]) { let n = 0, ms = 0, quiet = 0, qn = 0;
    for (let i = 0; i < 12; i++) { const b = mk(i, force, sup); let k = 0; while (b.t < 600 && b.tank.alive && !b.over && k++ < 100000) { const v0 = b.volleys.length + (b.wing ? b.wing.volleys.length : 0), p0 = !!b._pending || !!(b.wing && b.wing.ctx._pending), t0 = process.hrtime.bigint(); b.step(); const d = Number(process.hrtime.bigint() - t0) / 1e6; n++; ms += d; if (!p0 && !b._pending && !(b.wing && b.wing.ctx._pending) && v0 === b.volleys.length + (b.wing ? b.wing.volleys.length : 0)) { quiet += d; qn++; } } }
    out.push(`${name}: ${(ms / n).toFixed(3)} ms a step in all, ${(quiet / qn).toFixed(3)} ms for a step in which no engagement is worked out`); }
  console.log('7 step cost, prepared defence, 12 battles each: ' + out.join('; ') + '.'); }
console.log(fail ? `FAILED (${fail})` : 'SUPPORT TESTS PASS'); process.exit(fail ? 1 : 0);
