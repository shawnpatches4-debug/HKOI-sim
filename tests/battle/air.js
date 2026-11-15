// node tests/battle/air.js [battles, default 40]
// Air strikes (src/battle/support.js) and the player's fire-support orders (src/battle/orders.js hooks).
// 1 the hook battle.callAir: refuses danger close, off the map, an unknown kind, a second strike while one is inbound, and one over the
//   allowance; weapons arrive 75 to 105 s (gun run) or 90 to 120 s (bomb) after the call; a gun run strikes a strip, a bomb one point
// 2 a bomb called on a halted located vehicle and a gun run on a team that stays put do what the tables say (many trials of one case)
// 3 over a set of battles against armour: strikes are called, some are waved off, vehicles are knocked out; the same seed twice is
//   the same battle; events air_inbound / air_release / air_impact / air_off are complete
// 4 the player's orders { k: 'fire' } and { k: 'air' }: refused without support, accepted with it, replayed from the order list to
//   the same battle; supportMenu offers them only when the player commands
const { HK, Battle, Support, EnemyVeh } = require('./load.js');
const N = +(process.argv[2] || 40), cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), AIR = Support.AIR;
const BIOMES = ['farmland', 'desert', 'town', 'forest'];
let fail = 0; const bad = m => { fail++; if (fail < 15) console.log('FAIL', m); }, ok = (c, m) => { if (!c) bad(m); };
const sum = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const HEAVY = [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }], ARM = EnemyVeh.FORCES.armoured_counter.force;
const mk = (i, force, support, extra) => new Battle.Battle(Object.assign({ cfg, lookup, biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 800 + i, skill: 'trained', mission: 'hold', waves: 1, force, support, fate: true, commander: 'auto' }, extra || {}));
const run = (b, T) => { let n = 0; while (b.t < (T || 600) && b.tank.alive && !b.over && n++ < 100000) b.step(); return b; };

// ---- 1 the hook
{ const b = mk(0, [{ type: 'saclos', n: 1 }], { air: 2 }), T = b.tank; b.sup.air.at = 1e9;   /* the commander's own calls off: only ours */
  ok(!b.callAir({ e: T.e + 200, n: T.n, kind: 'gun' }).ok, 'danger close (gun, 200 m) not refused'); ok(!b.callAir({ e: T.e + 400, n: T.n, kind: 'bomb' }).ok, 'danger close (bomb, 400 m) not refused');
  ok(!b.callAir({ e: 1e6, n: 0 }).ok, 'off the map not refused'); ok(!b.callAir({ e: T.e + 900, n: T.n, kind: 'napalm' }).ok, 'an unknown kind not refused');
  const t0 = b.t, r = b.callAir({ e: T.e + 900, n: T.n, kind: 'gun' }); ok(r.ok && r.tot - t0 >= AIR.gun.delay[0] && r.tot - t0 <= AIR.gun.delay[1], 'gun run refused or its time is outside 75 to 105 s');
  ok(!b.callAir({ e: T.e - 900, n: T.n, kind: 'gun' }).ok, 'a second strike accepted while one is inbound');
  let n = 0; while (b.t < r.tot + 8 && n++ < 20000 && b.tank.alive) b.step(); const k = b.air()[0];
  ok(['done', 'waved_off'].includes(k.state), 'the gun run neither struck nor was waved off: ' + k.state);
  if (k.state === 'done') { ok(k.impacts.length === 14, 'a gun run without its 14 strikes'); const far = Math.max(...k.impacts.map(q => Math.hypot(q.e - k.aim[0], q.n - k.aim[1]))); ok(far <= 102 && far > 60, 'the strip is not about 200 m long: ' + far.toFixed(0)); }
  const t1 = b.t, r2 = b.callAir({ e: T.e, n: T.n + 1200, kind: 'bomb' }); ok(r2.ok && r2.tot - t1 >= AIR.bomb.delay[0] && r2.tot - t1 <= AIR.bomb.delay[1], 'bomb refused or its time is outside 90 to 120 s');
  n = 0; while (b.t < r2.tot + 8 && n++ < 20000 && b.tank.alive) b.step(); const k2 = b.air()[1];
  if (k2.state === 'done') ok(k2.impacts.length === 1 && Math.hypot(k2.impacts[0].e - T.e, k2.impacts[0].n - (T.n + 1200)) < 40, 'the bomb did not land near the place called');
  ok(/no strikes left/.test(b.callAir({ e: T.e + 900, n: T.n + 900, kind: 'gun' }).why || ''), 'a third strike accepted');
  const types = new Set(b.events.map(e => e.type)); ok(types.has('air_inbound') && types.has('air_off'), 'air events missing');
  const f = mk(1, [{ type: 'saclos', n: 1 }], { air: 2 }, { cond: 'fog' }); ok(/fog/.test(f.callAir({ e: f.tank.e + 900, n: f.tank.n }).why || ''), 'a strike was flown in fog');
  console.log('1 the hook: refusals (danger close, off the map, unknown kind, one at a time, allowance, fog) and timing as stated; first strike ' + k.state + ', second ' + k2.state + '.'); }

// ---- 2 one case many times: a bomb on a halted enemy tank the crew has located; a gun run on a team that stays
{ let done = 0, waved = 0, lost = 0, killed = 0, mob = 0, tdone = 0, tkill = 0, M = Math.max(60, N * 3);
  for (let i = 0; i < M; i++) { const b = mk(i, [{ type: 't72', n: 1 }], { air: 1 }); b.sup.air.at = 1e9; const v = b.vehs[0], T = b.tank; if (!v || Math.hypot(v.e - T.e, v.n - T.n) < 520) continue;
    v.known = true; v.kv = { e: v.e, n: v.n, t: 0 }; const r = b.callAir({ e: v.e, n: v.n, vid: v.id, kind: 'bomb' }); if (!r.ok) continue;
    /* hold everything still: this part measures the weapon, not the battle */ const e0 = v.e, n0 = v.n; let n = 0; while (b.t < r.tot + 1 && n++ < 20000) { b.t += b.dt; v.e = e0; v.n = n0; b._airStep(); }
    const k = b.air()[0]; if (k.state === 'done') { done++; if (!v.alive) killed++; else if (!v.mobile) mob++; } else if (k.state === 'waved_off') waved++; else if (k.state === 'lost') lost++; }
  for (let i = 0; i < M; i++) { const b = mk(i, [{ type: 'saclos', n: 1 }], { air: 1 }); b.sup.air.at = 1e9; const u = b.units[0], T = b.tank; if (!u || Math.hypot(u.e - T.e, u.n - T.n) < 320) continue;
    const r = b.callAir({ e: u.e, n: u.n, uid: u.id, kind: 'gun' }); if (!r.ok) continue; let n = 0; while (b.t < r.tot + 1 && n++ < 20000) { b.t += b.dt; b._airStep(); }
    if (b.air()[0].state === 'done') { tdone++; if (!u.alive) tkill++; } }
  ok(done > 20 && killed / done > 0.3 && killed / done < 0.8, `bomb on a halted tank: ${killed} destroyed of ${done} dropped is outside what a 5 m error and 85% inside 6 m should give`);
  ok(waved > 0 && lost === 0, 'no bomb strike was ever waved off, or one was lost (bombs are not lost in the model)');
  ok(tdone > 20 && Math.abs(tkill / tdone - AIR.gun.team) < 0.2, `gun run on a team that stays: ${tkill} of ${tdone} is far from ${AIR.gun.team}`);
  console.log(`2 one case many times: a bomb on a halted, located T-72 with nothing else on the field: ${done} dropped (${waved} waved off), tank destroyed ${Math.round(100 * killed / Math.max(1, done))}%, mobility kill ${Math.round(100 * mob / Math.max(1, done))}%; a gun run on a team that stays put: knocked out ${Math.round(100 * tkill / Math.max(1, tdone))}% of ${tdone}.`); }

// ---- 3 battles against armour
{ let S = { called: 0, done: 0, waved: 0, lost: 0, veh: 0, team: 0, follow: 0 };
  for (let i = 0; i < N; i++) { const b = run(mk(i, ARM, { air: 2 })), s = b.supReport().stat; S.called += s.airCalled; S.done += s.airDone; S.waved += s.airWaved; S.lost += s.airLost; S.veh += s.airVehKills; S.team += s.airTeamKills; S.follow += s.airFollowed;
    const E = t => b.events.filter(e => e.type === t).length; ok(E('air_inbound') === s.airCalled, 'air_inbound events do not match the calls'); ok(E('air_impact') === s.airDone, 'air_impact events do not match the strikes');
    ok(E('air_off') === b.sup.strikes.filter(k => k.state !== 'inbound' && k.state !== 'attacking').length, 'air_off events do not match the strikes that ended');
    ok(b.sup.air.left >= 0 && s.airCalled <= 2, 'more strikes than the allowance');
    for (const k of b.sup.strikes) if (k.aim) for (const F of [b.tank]) ok(true, '');
    if (i < 3) { const c = run(mk(i, ARM, { air: 2 })); ok(sum(JSON.stringify(c.log)) === sum(JSON.stringify(b.log)) && sum(JSON.stringify(c.events)) === sum(JSON.stringify(b.events)), 'battle ' + i + ' is not the same twice'); } }
  ok(S.called > 0 && S.done > 0, 'no strike was ever called or flown');
  console.log(`3 armoured counter-attack with two strikes, ${N} battles: called ${(S.called / N).toFixed(2)} a battle, weapons released ${(S.done / N).toFixed(2)}, waved off ${(S.waved / N).toFixed(2)}, aircraft lost in ${S.lost}; vehicles destroyed ${(S.veh / N).toFixed(2)} and teams knocked out ${(S.team / N).toFixed(2)} a battle; the aircraft followed a target that had moved ${S.follow} times.`); }

// ---- 4 the player's orders
{ const b0 = mk(2, HEAVY, undefined, { command: 'player' }); let r = b0.order({ k: 'air', e: b0.tank.e + 900, n: b0.tank.n, kind: 'gun' }); ok(!r.ok && /no aircraft/.test(r.text), 'an air strike was ordered in a battle without aircraft'); ok(b0.supportMenu(0, 0).length === 0, 'the menu offers support in a battle without any');
  // a battle that lasts long enough to see both orders through (the first of these seeds whose battle is still going at 300 s with these orders)
  const sup = { artillery: 2, air: 2 }; let shown = false;
  for (let i = 0; i < 12 && !shown; i++) { const b = mk(i, [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }], sup, { command: 'player', waves: 3 }); b.sup.air.at = 1e9; b.sup.art.at = 1e9; const T = b.tank;
    if (i === 0) { ok(b.supportMenu(T.e + 900, T.n).length === 3, 'the menu does not offer a fire mission and the two kinds of strike'); ok(mk(0, HEAVY, sup).supportMenu(0, 0).length === 0, 'the menu offers orders when the crew is in command'); }
    for (let q = 0; q < 30; q++) b.step(); if (!b.tank.alive || b.over) continue;
    let r = b.order({ k: 'fire', e: T.e + 300, n: T.n }); ok(!r.ok && /danger close/.test(r.text), 'a danger-close fire mission order was accepted');
    r = b.order({ k: 'fire', e: T.e + 900, n: T.n + 300 }); ok(r.ok && r.at > b.t + 8, 'the fire mission order was refused, or passed at once');
    for (let q = 0; q < 200; q++) b.step(); if (!b.tank.alive || b.over) continue; ok(b.fires().length === 1 && b.fires()[0].by === 'player', 'the ordered fire mission was not called');
    r = b.order({ k: 'air', e: T.e - 1000, n: T.n + 200, kind: 'bomb' }); if (!r.ok) continue; run(b, 300); if (!b.air().length || b.air()[0].state === 'inbound') continue;
    ok(b.air()[0].by === 'player' && b.air()[0].kind === 'bomb', 'the ordered air strike is not the one flown');
    const again = mk(i, [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }], sup, { command: 'player', waves: 3, orders: b.cmd.log.map(x => Object.assign({}, x)) }); again.sup.air.at = 1e9; again.sup.art.at = 1e9; run(again, 300);
    ok(sum(JSON.stringify(again.events)) === sum(JSON.stringify(b.events)), 'the battle replayed from its order list is not the same battle'); shown = true; }
  ok(shown, 'no battle lasted long enough to see an ordered fire mission and air strike through');
  console.log('4 the player\'s orders: refused without support and when danger close; a fire mission and a guided bomb ordered, passed on after the radio call, flown, and the same again from the recorded orders.'); }
console.log(fail ? `FAILED (${fail})` : 'AIR TESTS PASS'); process.exit(fail ? 1 : 0);
