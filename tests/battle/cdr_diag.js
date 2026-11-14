// node tests/battle/cdr_diag.js [battles per row, default 200] [skill, default trained] [rows: all | quick]
// Does the enemy commander change the fight, and if not, why not? The same force on the same seeds with and without him.
// Per row: M1 lost, hits, launches, how the shots were grouped (launchers per engagement, engagements fired from two bearings 40
// degrees or more apart, engagements that emptied a Trophy side), and for the commander: when his first real order took effect
// against how long the battle lasted, how many decisions became orders, how long launchers were held, how wrong his picture was
// as the battle went on. 200 battles a row: a margin of about +-7 points on a loss rate (paired seeds make the gap a little firmer).
const { HK, Battle, EnemyVeh } = require('./load.js');
const args = process.argv.slice(2), N = +(args.find(a => /^\d+$/.test(a)) || 200), skill = args.find(a => /^(green|trained|expert|veteran)$/.test(a)) || 'trained', QUICK = args.includes('quick');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
const BIOMES = ['farmland', 'desert', 'town', 'forest'];
const HEAVY = [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }];
const ROWS = [
  ['Prepared defence, hold, 1 wave', HEAVY, 'hold', 1], ['Prepared defence, advance, 1 wave', HEAVY, 'advance', 1], ['Prepared defence, hunt, 1 wave', HEAVY, 'hunt', 1], ['Prepared defence, hold, 3 waves', HEAVY, 'hold', 3],
  ['Sprawling defence, hold, 1 wave', EnemyVeh.FORCES.sprawling_defence.force, 'hold', 1], ['Sprawling defence, advance, 1 wave', EnemyVeh.FORCES.sprawling_defence.force, 'advance', 1],
  ['Armoured counter-attack, hold, 1 wave', EnemyVeh.FORCES.armoured_counter.force, 'hold', 1],
].filter((r, i) => !QUICK || i === 0 || i === 1 || i === 3 || i === 4);
const angDiff = (a, b) => ((a - b + 540) % 360) - 180, avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
function run(force, mission, waves, commander, i) {
  const b = new Battle.Battle({ cfg, lookup, biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 900 + i, skill, mission, waves, force, commander });
  let n = 0; while (b.t < 900 && b.tank.alive && !b.over && n < 100000) { b.step(); n++; } return b;
}
console.log(`${skill} crews, ${N} battles a row, same seeds with and without the commander.`);
for (const [name, force, mission, waves] of ROWS) {
  const R = {};
  for (const mode of ['with', 'without']) {
    const A = { lost: 0, hits: 0, fired: 0, vol: 0, per: [], two: 0, dry: 0, len: [], first: [], kills: 0, cdr: null, firstShot: [], moves: 0 };
    for (let i = 0; i < N; i++) {
      const b = run(force, mission, waves, mode === 'with' ? 'auto' : false, i), s = b.summary();
      if (!b.tank.alive) A.lost++; A.hits += s.hits; A.fired += s.fired; A.len.push(b.t); A.kills += s.killedByTank + s.killedByMg; A.moves += (b.events || []).filter(e => e.type === 'move').length;
      if (b.volleys.length) A.firstShot.push(b.volleys[0].t0);
      for (const v of b.volleys) { A.vol++; A.per.push(v.launches.length); let sp = 0; for (const a of v.launches) for (const c of v.launches) sp = Math.max(sp, Math.abs(angDiff(a.brg, c.brg))); if (v.launches.length >= 2 && sp >= 40) A.two++;
        const L = (v.rec.aps || []).filter(a => a.side === 'L').length, Rr = (v.rec.aps || []).filter(a => a.side === 'R').length; if (L >= 4 || Rr >= 4) A.dry++; }
      const C = b.cdrReport(); if (C.on) { if (!A.cdr) A.cdr = { orders: 0, watch: 0, byKind: {}, decided: 0, held: 0, first: [], pic: [[0, 0], [0, 0], [0, 0], [0, 0]], lost: 0, reviews: 0, wrongRev: 0, salvos: 0, salvoN: 0, salvoTwo: 0, openHeld: 0, openWhy: {}, tot: 0, pulled: 0, rpgHeld: 0, scout: 0 };
        for (const k of ['salvos', 'salvoN', 'salvoTwo', 'openHeld', 'tot', 'pulled', 'rpgHeld', 'scout']) A.cdr[k] += C[k] || 0; for (const k in C.openWhy || {}) A.cdr.openWhy[k] = (A.cdr.openWhy[k] || 0) + C.openWhy[k];
        const D = A.cdr; D.orders += C.orders; D.watch += C.byKind.watch || 0; for (const k in C.byKind) D.byKind[k] = (D.byKind[k] || 0) + C.byKind[k]; D.decided += C.decided; D.held += C.heldSec; D.lost += C.lost; D.reviews += C.reviews; D.wrongRev += C.reviewsWrong;
        if (C.firstOrderT.length) D.first.push(C.firstOrderT[0]); C.picByAge.forEach((q, k) => { D.pic[k][0] += q[0]; D.pic[k][1] += q[1]; }); }
    }
    R[mode] = A;
  }
  const w = R.with, o = R.without, f = (A) => `M1 lost ${(100 * A.lost / N).toFixed(0)}%, hits ${(A.hits / N).toFixed(2)}, launched ${(A.fired / N).toFixed(1)}, engagements ${(A.vol / N).toFixed(1)} of ${avg(A.per).toFixed(2)} launchers, from two bearings ${(100 * A.two / Math.max(1, A.vol)).toFixed(0)}%, emptied a Trophy side ${(100 * A.dry / Math.max(1, A.vol)).toFixed(0)}%, first shot ${Math.round(med(A.firstShot))} s, length median ${Math.round(med(A.len))} s, team moves ${(A.moves / N).toFixed(1)}, teams lost ${(A.kills / N).toFixed(1)}`;
  console.log(`\n${name}`); console.log(`   with:    ${f(w)}`); console.log(`   without: ${f(o)}`);
  if (w.cdr) { const D = w.cdr, real = D.orders - D.watch, kinds = Object.entries(D.byKind).filter(([k]) => k !== 'watch').map(([k, v]) => `${k} ${(v / N).toFixed(2)}`).join(', ');
    console.log(`   commander: real orders ${(real / N).toFixed(2)} a battle (${kinds || 'none'}); decisions ${(D.decided / N).toFixed(2)} a battle, so ${D.decided ? Math.round(100 * real / D.decided) : 0}% of decisions became an order; battles with any real order ${(100 * D.first.length / N).toFixed(0)}%, the first taking effect at ${Math.round(med(D.first))} s (median); launcher-seconds held ${(D.held / N).toFixed(1)} a battle; reviews ${(D.reviews / N).toFixed(1)} a battle; lost in ${(100 * D.lost / N).toFixed(0)}%.`);
    if (D.salvos) console.log(`   fire control: ${(D.salvos / N).toFixed(1)} salvos a battle of ${(D.salvoN / D.salvos).toFixed(2)} missile launchers, ${Math.round(100 * D.salvoTwo / D.salvos)}% from two bearings; opening held ${(D.openHeld / N).toFixed(1)} s on average and let go because: ${Object.entries(D.openWhy).map(([k, v]) => k + ' ' + v).join(', ')}; launches timed to arrive together ${(D.tot / N).toFixed(1)} a battle; teams ordered off dominated ground ${(D.pulled / N).toFixed(2)}, rocket teams told to lie in wait ${(D.rpgHeld / N).toFixed(2)}, drone sightings passed on ${(D.scout / N).toFixed(1)} a battle.`);
    console.log(`   his picture, mean metres off the truth: first 30 s ${Math.round(D.pic[0][1] / Math.max(1, D.pic[0][0]))}, 30 to 60 s ${Math.round(D.pic[1][1] / Math.max(1, D.pic[1][0]))}, 60 to 120 s ${Math.round(D.pic[2][1] / Math.max(1, D.pic[2][0]))}, after 120 s ${Math.round(D.pic[3][1] / Math.max(1, D.pic[3][0]))}; wrong (over 150 m) at ${(100 * D.wrongRev / Math.max(1, D.reviews)).toFixed(0)}% of reviews.`); }
}
