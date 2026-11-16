// node tests/render/cutfx.test.mjs [show] : how a missile that HKOI's cloud has cut is DRAWN (src/render/volleyview.js), against the
// engine's record, in whole battles fought in node.
//   1. Where a missile that flies past is drawn passing the vehicle must be the record's miss (th.viz.end.lat / miss / over, and
//      the recorded blind path), never closer. Shawn, 16 Nov: "you'll often see a missile fly like 1 meter above the tank".
//      Measured: the drawn miss vector at the vehicle's plane against the record's, for every missile that flew past.
//   2. The cut highlight (beam break, ring, labels) is a function of battle time only: the same at 30, 60, 144 and 240 frames a second.
// Exits 1 on a failure.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nm = path.join(ROOT, 'node_modules'); if (!fs.existsSync(path.join(nm, 'three'))) { fs.mkdirSync(nm, { recursive: true }); fs.symlinkSync(path.join(ROOT, '.cache/package'), path.join(nm, 'three')); }
const require = createRequire(import.meta.url);
const { HK, Battle } = require('../battle/load.js');
globalThis.window = globalThis.window || {}; window.HK = HK;
const THREE = await import('three');
const { VolleyView, cutState } = await import('../../src/render/volleyview.js');
const show = process.argv[2] === 'show';
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), HH = cfg.vehicle.half_h;
const F = { standoff: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], raid: { minR: 2000, window: 6 } }, ambush: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] } };
let bad = 0; const fail = (...a) => { bad++; console.log('FAIL', ...a); };

// a VolleyView with only what pos() needs (no scene, no drawing)
const V = Object.create(VolleyView.prototype); V._ae = 0; V._an = 1; V._oy = 0; V._oz = 0; V._ot = false;
const rows = []; let fps = null;
for (const mission of ['hold', 'advance']) for (const force of ['standoff', 'ambush']) for (const biome of ['desert', 'farmland', 'forest']) for (let seed = 1; seed <= (mission === 'hold' ? 9 : 5); seed++) {
  const b = new Battle.Battle({ biome, mapSeed: 3, seed, skill: 'trained', mission, waves: 1, cfg, lookup, force: F[force].force, raid: F[force].raid });
  let k = 0; while (b.t < 240 && b.tank.alive && k++ < 5000) b.step();
  V.b = b;
  for (const v of b.volleys) {
    for (const l of v.launches) if (!l.u0) l.u0 = { e: l.u.e, n: l.u.n };
    v.rec.threats.forEach((th, i) => {
      const e = th.viz.end, l = v.launches.find(q => q.u.id === th.uid) || v.launches[i]; if (!l || e.type !== 'miss' || HK.THREATS[th.key].guidance === 'drone') return;
      const p = V.pos(v, th, l, e.t, new THREE.Vector3()), T = b.tankAt(v.t0 + e.t), g = b.world.h(T.e, T.n);
      // the drawn pass: to the right of the line (seen from the vehicle) and up from the hull centre
      const dE = l.u0.e - T.e, dN = l.u0.n - T.n, d = Math.hypot(dE, dN), ae = dE / d, an = dN / d, rx = p.x - T.e, rn = -p.z - T.n;
      const lat = rx * an - rn * ae, up = p.y - (g + HH), drawn = Math.hypot(lat, up);
      const recUp = th.blind ? th.blind.z : e.over != null ? e.over : Math.sqrt(Math.max(0, e.miss * e.miss - (e.lat || 0) * (e.lat || 0)));
      const r = { tag: `${mission}/${force}/${biome}/${seed} v${v.i} #${th.idx} ${th.key}`, cut: !!(th.viz.sever && !th.viz.sever.smoke), by: th.defeated_by, rec: +e.miss.toFixed(2), recLat: +(e.lat || 0).toFixed(2), recUp: +recUp.toFixed(2), drawn: +drawn.toFixed(2), drawnLat: +lat.toFixed(2), drawnUp: +up.toFixed(2), ownMove: th.blind ? +(th.blind.y - (e.lat || 0)).toFixed(2) : null, tankSide: (() => { const T0 = b.tankAt(v.t0 + th.t0); return +((T.e - T0.e) * an - (T.n - T0.n) * ae).toFixed(2); })() };
      rows.push(r);
      // the drawn pass must be the record's verdict: closer than the record by more than 0.1 m is a fault
      if (drawn < e.miss - 0.1) fail('drawn closer than the record', JSON.stringify(r));
      if (!fps && r.cut && th.blind && e.t - th.blind.tCut > 1.5) fps = { b, v, th };
    });
  }
}
const cuts = rows.filter(r => r.cut), other = rows.filter(r => !r.cut);
const err = rs => rs.length ? Math.max(...rs.map(r => Math.abs(r.drawn - r.rec))) : 0;
console.log(`missiles that flew past: ${rows.length} (${cuts.length} cut by HKOI). Largest |drawn - record| at the vehicle: cut ${err(cuts).toFixed(2)} m, others ${err(other).toFixed(2)} m`);
if (show) for (const r of rows) console.log(JSON.stringify(r));
else for (const r of cuts.slice(0, 20)) console.log(`  ${r.tag.padEnd(34)} record ${String(r.rec).padStart(6)} m (lat ${r.recLat}, up ${r.recUp})   drawn ${String(r.drawn).padStart(6)} m (lat ${r.drawnLat}, up ${r.drawnUp})`);

// 2. the cut highlight against battle time only: sample cutState at the same battle times reached by 30, 60, 144 and 240 fps stepping
if (fps && cutState) {
  const { v, th } = fps, t0 = th.viz.sever.t - 0.5, t1 = th.viz.end.t + 4, sig = {};
  for (const hz of [30, 60, 144, 240]) { const out = []; for (let n = 0; t0 + n / hz <= t1; n++) { const t = t0 + n / hz, c = cutState(th, t); if ((n * 6) % hz === 0) out.push(c ? [c.phase, c.text, +c.ring.toFixed(4), +c.beam.toFixed(4), +c.mark.toFixed(4), +c.pulse.toFixed(4)] : null); } sig[hz] = JSON.stringify(out); }   /* common instants of all four rates: every 1/6 s */
  if (new Set(Object.values(sig)).size !== 1) fail('cut highlight differs between frame rates'); else console.log(`cut highlight: identical at 30, 60, 144 and 240 fps (${JSON.parse(sig[30]).length} samples)`);
} else if (!fps) fail('no long blind flight found for the frame-rate check');
console.log(bad ? `${bad} FAILED` : 'PASS'); process.exit(bad ? 1 : 0);
