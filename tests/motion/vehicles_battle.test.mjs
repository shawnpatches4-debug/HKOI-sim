// The REAL battle's vehicles drawn without a browser:  node tests/motion/vehicles_battle.test.mjs [battles per force, default 3]
// Runs whole battles of each vehicle force (src/battle/enemyveh.js) and feeds battle.vehicles() to src/render/vehicles.js every
// sixtieth of a second with a stand-in scene (real models, nothing drawn). Checks that the drawing takes everything the battle
// sends without a fault, and counts what it was asked to show. Then a rewind: the same battle run again to an earlier time.
// Prints VEHICLE BATTLE PASS or FAIL.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), require = createRequire(import.meta.url);
const nm = path.join(ROOT, 'node_modules'); if (!fs.existsSync(path.join(nm, 'three'))) { fs.mkdirSync(nm, { recursive: true }); fs.symlinkSync(path.join(ROOT, '.cache/package'), path.join(nm, 'three')); }
const { HK, Battle, EnemyVeh } = require('../battle/load.js');
globalThis.self = globalThis; globalThis.window = globalThis;
const img = () => { const L = {}, o = { style: {}, onload: null, addEventListener(k, f) { (L[k] = L[k] || []).push(f); }, removeEventListener() { }, set src(v) { setTimeout(() => { (L.load || []).forEach(f => f()); if (o.onload) o.onload(); }, 0); }, width: 1, height: 1 }; return o; };
globalThis.Image = function () { return img(); };
globalThis.document = { createElementNS: () => img(), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => { } }), width: 0, height: 0 }) };
globalThis.fetch = async url => { const f = path.join(ROOT, String(url)); return fs.existsSync(f) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) } : { ok: false }; };
const THREE = await import('three');
const { Vehicles, vehicleInfo } = await import('../../src/render/vehicles.js');
const N = +(process.argv[2] || 3), cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg); let fail = 0;
const bad = (...a) => { fail++; console.log('  FAIL', ...a); };

function makeScene(world) {
  const calls = {}; let s = 1;
  const fx = new Proxy({ n: 0, time: 0 }, { get: (o, k) => k in o ? o[k] : k === 'R' ? () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; } : k === 'seed' ? v => { s = (Math.floor(v * 1000) ^ 0x9e3779b9) >>> 0 || 1; } : () => { calls[k] = (calls[k] || 0) + 1; } });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 20000);
  return { units: new THREE.Group(), camera, fx, world, calls, quality: 'high', thermal: 0, marks: { add() { calls.mark = (calls.mark || 0) + 1; } }, blast() { calls.blast = (calls.blast || 0) + 1; }, at(e, n, up = 0, out = new THREE.Vector3()) { return out.set(e, world.h(e, n) + up, -n); } };
}
const wait = () => new Promise(r => setTimeout(r, 20));
for (const force of Object.keys(EnemyVeh.FORCES)) {
  const sum = { vehicles: 0, kinds: {}, states: {}, effects: {}, weapons: {}, mounted: 0, hidden: 0, maxStep: 0, calls: {}, faults: 0, settled: 0 };
  for (let i = 0; i < N; i++) {
    const opt = Object.assign({ biome: 'desert', mapSeed: 3 + i * 2, seed: 900 + i, skill: 'trained', mission: i % 2 ? 'advance' : 'hold', waves: 1, force: EnemyVeh.FORCES[force].force, commander: 'auto' }, { cfg, lookup });
    const b = new Battle.Battle(opt), sc = makeScene(b.world), V = new Vehicles(sc, 'assets/');
    const teams = b.units.map(() => ({ group: { visible: true } }));
    // camera near the first vehicle so the closest level of detail and the riders are exercised
    const v0 = b.vehicles()[0]; if (!v0) { bad(force, 'has no vehicles'); continue; }
    const look = () => { const v = b.vehicles()[0]; sc.camera.position.set(v.e + 25, b.world.h(v.e, v.n) + 6, -(v.n - 25)); sc.camera.lookAt(v.e, b.world.h(v.e, v.n) + 1, -v.n); sc.camera.updateMatrixWorld(true); };
    look(); for (let k = 0; k < 150; k++) { V.update(b, { t: 0, all: true, teams }); await wait(); const st = V.status(); if (st.ready === st.vehicles && V.soldier) break; }
    let tt = 0, k = 0, prev = new Map();
    while (b.t < 240 && b.tank.alive && !b.over) {
      b.step(); while (teams.length < b.units.length) teams.push({ group: { visible: true } });
      for (let f = 0; f < 6; f++) { tt = b.t - b.dt + b.dt * (f + 1) / 6; for (const t of teams) t.group.visible = true; V.update(b, { t: tt, all: true, teams }); }
      if (++k % 20 === 0) look();
      for (const v of b.vehicles()) { const w = V.view(v.id), p = prev.get(v.id), d = p ? Math.hypot(w.X.x - p[0], w.N.x - p[1]) : 0; if (d > sum.maxStep) sum.maxStep = d; prev.set(v.id, [w.X.x, w.N.x, v.lastShot ? v.lastShot.t : null]);
        sum.states[v.state] = (sum.states[v.state] || 0) + 1; if (v.damage) sum.effects[v.damage.effect] = (sum.effects[v.damage.effect] || 0) + 0.1; if (v.lastShot && (!p || p[2] !== v.lastShot.t)) sum.weapons[v.lastShot.weapon] = (sum.weapons[v.lastShot.weapon] || 0) + 1;
        if (!Number.isFinite(w.X.x + w.N.x + w.y + w.H.x + w.A.p)) bad(force, 'a number went wrong for vehicle', v.id);
        for (const r of v.riders || []) if (r.mounted) { sum.mounted++; const ui = b.units.findIndex(u => u.id === r.uid); if (ui >= 0 && teams[ui].group.visible === false) sum.hidden++; } }
    }
    for (const v of b.vehicles()) { sum.vehicles++; sum.kinds[v.kind] = (sum.kinds[v.kind] || 0) + 1; const i = vehicleInfo(v); if (!i.name || !i.line) bad(force, 'no name or state line for', v.id); }
    // a rewind: the same battle from the start to half way, drawn by the same views' owner
    const b2 = new Battle.Battle(opt), half = Math.max(1, b.t / 2); while (b2.t < half && b2.tank.alive && !b2.over) b2.step(); V.update(b2, { t: b2.t, all: true, teams: [] });
    for (const v of b2.vehicles()) { const w = V.view(v.id); if (!w || Math.hypot(w.X.x - v.e, w.N.x - v.n) > 1.5) bad(force, 'after a rewind vehicle', v.id, 'is not where the battle has it'); if ((v.state === 'burning') !== (w.tCat != null)) bad(force, 'after a rewind vehicle', v.id, 'wreck state wrong'); }
    sum.faults += V.errors; if (V.errors) console.log(V.lastError); for (const c in sc.calls) sum.calls[c] = (sum.calls[c] || 0) + sc.calls[c]; sum.settled += V.status().settled;
  }
  const show = o => Object.entries(o).map(([k, v]) => k + ' ' + Math.round(v)).join(', ') || 'none';
  console.log(force + ': ' + sum.vehicles + ' vehicles in ' + N + ' battles (' + show(sum.kinds) + ')');
  console.log('  vehicle-steps by state: ' + show(sum.states) + '\n  shots drawn by weapon: ' + show(sum.weapons) + '\n  effects asked for: ' + show(sum.calls));
  console.log('  steps with a team aboard: ' + sum.mounted + ', of which its own figures were hidden: ' + sum.hidden + '; largest move of a drawn vehicle in one battle step: ' + sum.maxStep.toFixed(2) + ' m; faults: ' + sum.faults);
  if (sum.faults) bad(force, 'faults in the drawing'); if (sum.mounted !== sum.hidden) bad(force, 'a mounted team was left to its own view'); if (sum.maxStep > 4) bad(force, 'a drawn vehicle jumped');
}
console.log(fail ? 'VEHICLE BATTLE FAIL (' + fail + ')' : 'VEHICLE BATTLE PASS'); process.exit(fail ? 1 : 0);
