const HK = require('./engine.js'), P = x => (x * 100).toFixed(1), N = +process.argv[2] || 150, DEG = Math.PI / 180;
const rr = (i, s) => { const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
const OFF = [[0, 0], [-150, -105], [150, -105], [0, -210]];
function platoon(total, span, key, seed, share) { const all = Array.from({ length: total }, (_, i) => ({ key: key || (i % 4 === 3 ? 'fpv_fiber' : 'fpv'), R: 2000 + rr(i, 1) * 1800, brg: (rr(i, 10) - .5) * (key ? 240 : 300), t0: i * span / total + rr(i, 4) * 2, tank: i % 4 }));
  const T = OFF.map((off, k) => { const c = HK.defaultConfig(); c.missions = 1; c.seed = seed; c.gun.burst = 6; c.obs.alpha_m2_per_g = 2.0;
    c.enemy.fixed = all.filter(f => f.tank === k).map(f => { const E = f.R * Math.sin(f.brg * DEG) - off[0], Nn = f.R * Math.cos(f.brg * DEG) - off[1]; return { key: f.key, R: Math.hypot(E, Nn), brg: Math.atan2(E, Nn) / DEG, t0: f.t0 }; });
    const rec = { events: [], bursts: [], aps: [], ctx: { hull: 0 } }; HK.runMission(c, new HK.RNG(HK.seedFor(seed, k)), LK, rec); return { rec, cfg: c, off }; });
  const o = HK.platoonShare(T, { share }); return { left: T.filter(t => !t.rec.killed).length, assists: o.assists.length, akills: o.assists.filter(a => a.kill).length, blocked: o.blocked.reduce((a, b) => a + b, 0) }; }
const c0 = HK.defaultConfig(); c0.gun.burst = 6; c0.obs.alpha_m2_per_g = 2.0; const LK = HK.meetLookup(c0);
for (const [nm, total, span, key] of [['16 Kornets / 90 s', 16, 90, 'kornet'], ['40 drones / 2 min', 40, 120, null], ['80 drones / 3 min', 80, 180, null]]) for (const share of [false, true]) { let L = 0, A = 0, K = 0, B = 0, all4 = 0;
  for (let s = 1; s <= N; s++) { const r = platoon(total, span, key, s, share); L += r.left; A += r.assists; K += r.akills; B += r.blocked; if (r.left === 4) all4++; }
  console.log(nm.padEnd(20), share ? 'shared fire ' : 'each alone  ', 'tanks left', (L / N).toFixed(2), 'all4', P(all4 / N), 'assists', (A / N).toFixed(1), 'assist kills', (K / N).toFixed(1), 'smoke-blocked s', (B / N).toFixed(1)); }
