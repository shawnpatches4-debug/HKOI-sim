const HK = require('./engine.js'); const c = HK.defaultConfig(); c.seed = 3; c.enemy.fixed = [{ key: 'kornet', R: 2400, brg: -32, t0: 0 }, { key: 'kornet', R: 3100, brg: 4, t0: 2.5 }]; c.enemy.no_dismounts = true; c.vehicle.hull_deg = 0; c.missions = 1;
const L = HK.meetLookup(c, 30), run = cc => { const r = { events: [], bursts: [], aps: [], ctx: { hull: 0 } }; HK.runMission(cc, new HK.RNG(HK.seedFor(1, 0)), L, r); return r; };
const a = run(c), c2 = JSON.parse(JSON.stringify(c)); c2.player = { on: true, orders: [{ t: 2, kind: 'left' }, { t: 5, kind: 'smoke' }, { t: 7, kind: 'back' }], hold: [[0, 6]] };
const b = run(c2);
console.log('AI crew:', a.threats.map(t => t.viz.end.type), a.crew && a.crew.acts.map(x => x.why + '@' + x.t.toFixed(1)).join(' '));
console.log('player :', b.threats.map(t => t.viz.end.type), b.crew && b.crew.acts.map(x => x.why + '@' + x.t.toFixed(1)).join(' '), 'smoke', b.crew && b.crew.smoke);
console.log(b.events.filter(e => /hold|Commander/.test(e.text)).map(e => e.t.toFixed(1) + ' ' + e.text).join('\n'));
const p = b.crew.path; console.log('pos@4', p.find(x => x[0] >= 4), 'pos@9', p.find(x => x[0] >= 9));
