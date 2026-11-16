// node tests/study/cut_pass.js [raids|battles] [N] [spin=0|1] [relock=0|1] [jit=3] [sched=classic|smart] [table=still|honest] [detail] [list]
// How close does a missile whose beam was CUT pass the tank? (Shawn, 16 Nov 2026: "you'll often see a missile fly like 1 metre above the tank".)
// For every cut missile (HKOI cloud, not crew smoke) it reads the engine's own record: where it crosses the vehicle plane (sideways after the
// crew's own move, and height relative to the hull centre), or how far short it hits the ground. Distance is measured to the hull box
// (half width from the bearing, half height, plus the roof equipment 0.9 m high over the middle 2.5 m). Grouped by kind and by cut range.
// raids: the standard raid of defaultConfig (HKOI + Trophy, crew reacting). battles: the five standard forces of tests/battle/standard.js.
const { HK, Battle } = require('../battle/load.js');
const A = process.argv.slice(2), MODE = A.find(a => a === 'raids' || a === 'battles') || 'raids', N = +(A.find(a => /^\d+$/.test(a)) || 500);
const opt = k => { const a = A.find(x => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : null; };
const SPIN = opt('spin'), RELOCK = opt('relock'), JIT = opt('jit'), SCHED = opt('sched'), TABLE = opt('table');
function tune(c) {
  if (SPIN != null) c.blind_spin = SPIN === '1';
  if (RELOCK != null) { if (c.drift.relock_kornet !== undefined) c.drift.relock_kornet = RELOCK === '1'; else c.drift.relock = RELOCK === '1'; }
  if (JIT != null) c.enemy.gunner_jitter_mrad = +JIT;
  if (SCHED != null) c.fc.scheduler = SCHED;
  if (TABLE != null) c.fc.table = TABLE;   // 'still' (old planning table) or 'honest'
  return c;
}
const KIND = k => (k === 'kornet' || k === 'saclos' || k === 'sal' || k === 'vikhr') ? k : 'other';
const RB = d => d < 300 ? '<300' : d < 600 ? '300-600' : d < 1000 ? '600-1000' : d < 1500 ? '1000-1500' : '>=1500';
const BINS = ['hit', '<1', '1-2', '2-5', '5-10', '10-30', '>=30', 'ground'];
const tab = {}, addRow = (key, b) => { const r = tab[key] || (tab[key] = { n: 0 }); r.n++; r[b] = (r[b] || 0) + 1; };
const over = []; let relocks = 0, relockHit = 0, cutK = 0; const meets = [], cuts = [];
function take(rec, veh) {
  for (const b of rec.bursts) if (b.kind === 'obs' && b.res && b.res.meet != null && rec.threats[b.idx] && rec.threats[b.idx].key === 'kornet') { meets.push(b.res.meet); if (b.res.cut) cuts.push(b.res.sever); }
  for (const th of rec.threats) {
    const sv = th.viz.sever; if (!sv || sv.smoke) continue;
    const e = th.viz.end || {}, k = KIND(th.key), d = sv.d;
    if (th.key === 'kornet') { cutK++; if (th.viz.relock) { relocks++; if (e.type === 'hit') relockHit++; } }
    let bin;
    if (e.type === 'hit') bin = 'hit';
    else if (e.type === 'ground' || e.type === 'self_destruct') bin = 'ground';
    else if (e.type === 'aps_kill' || e.type === 'he_kill') bin = null;   // taken by Trophy or HE after the cut: never passes
    else {
      const yr = e.lat != null ? e.lat : (th.viz.blind ? th.viz.blind.lat : 6), z = th.blind ? th.blind.z : (e.over != null ? e.over : 0);
      const a = (th.rel_brg || 0) * Math.PI / 180, hw = Math.abs(Math.cos(a)) * veh.half_w + Math.abs(Math.sin(a)) * (veh.half_len || veh.half_w), hh = veh.half_h;
      const top = Math.abs(yr) <= (veh.top_half_w || 1.25) ? hh + (veh.top_h || 0.9) : hh;
      const dy = Math.max(0, Math.abs(yr) - hw), dz = z > top ? z - top : z < -hh ? -hh - z : 0, dist = Math.hypot(dy, dz);
      bin = dist < 1 ? '<1' : dist < 2 ? '1-2' : dist < 5 ? '2-5' : dist < 10 ? '5-10' : dist < 30 ? '10-30' : '>=30';
      if (dist < 2) over.push({ k, d: Math.round(d), y: +yr.toFixed(1), z_above_roof: +(z - hh).toFixed(1) });
    }
    if (!bin) continue;
    addRow('all', bin); addRow('kind ' + k, bin); addRow('cut at ' + RB(d), bin); addRow(' ' + k + ' ' + RB(d), bin);
  }
}
if (MODE === 'raids') {
  const c = tune(HK.defaultConfig()); c.seed = 1; const lookup = HK.meetLookup(c);
  for (let i = 0; i < N; i++) { const rec = HK.replayMission(c, lookup, i); take(rec, c.vehicle); }
} else {
  const FORCES = { light: [{ type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }], ambush: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }], drones: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }], standoff: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], heavy: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] };
  const RAID = { standoff: { minR: 2000, window: 6 } }, BIOMES = ['farmland', 'desert', 'town', 'forest'], MISSIONS = ['hold', 'hold', 'advance', 'hunt'];
  const cfg = tune(HK.defaultConfig()), lookup = HK.meetLookup(cfg);
  for (const key of Object.keys(FORCES)) for (const skill of ['trained', 'veteran']) for (let i = 0; i < N; i++) {
    const b = new Battle.Battle({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 500 + i, skill, mission: MISSIONS[i % 4], waves: 1, force: FORCES[key], raid: RAID[key], commander: false, cfg: JSON.parse(JSON.stringify(cfg)), lookup });
    let n = 0; while (b.t < 600 && b.tank.alive && !b.over && n < 100000) { b.step(); n++; }
    for (const v of b.volleys) take(v.rec, (v.cfg || cfg).vehicle);
  }
}
const pc = (x, n) => (n ? (100 * (x || 0) / n).toFixed(0) : '-').padStart(4) + '%';
console.log(`${MODE}, ${N}${MODE === 'battles' ? ' battles per force and crew level' : ' raids'}, spin ${SPIN == null ? 'default' : SPIN}, relock ${RELOCK == null ? 'default' : RELOCK}, gunner ${JIT == null ? 'default' : JIT + ' mrad'}. Cut missiles: where they end, distance to the hull box (m)`);
console.log('group'.padEnd(16) + '   n ' + BINS.map(b => b.padStart(6)).join(''));
const order = ['all', 'kind kornet', 'kind vikhr', 'kind saclos', 'kind sal', 'kind other', 'cut at <300', 'cut at 300-600', 'cut at 600-1000', 'cut at 1000-1500', 'cut at >=1500'];
const ranges = ['<300', '300-600', '600-1000', '1000-1500', '>=1500']; if (A.includes('detail')) for (const k of ['kornet', 'vikhr', 'saclos', 'sal', 'other']) for (const r of ranges) order.push(' ' + k + ' ' + r);
for (const k of order) { const r = tab[k]; if (!r) continue; console.log(k.padEnd(16) + String(r.n).padStart(5) + ' ' + BINS.map(b => pc(r[b], r.n).padStart(6)).join('')); }
const med = a => { const q = a.slice().sort((x, y) => x - y); return q.length ? Math.round(q[q.length >> 1]) : '-'; };
console.log(`Kornet bursts ${meets.length}: median meeting range ${med(meets)} m; Kornet cuts ${cuts.length}: median range at the cut ${med(cuts)} m`);
console.log(`Kornets cut ${cutK}, re-locked ${relocks}, of those hit ${relockHit}`);
if (A.includes('list')) console.log(JSON.stringify(over.slice(0, 40)));
