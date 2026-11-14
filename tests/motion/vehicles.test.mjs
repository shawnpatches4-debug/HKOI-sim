// Enemy vehicles without a browser (seconds, not minutes):  node tests/motion/vehicles.test.mjs [cost]
// Runs src/render/vehicles.js on the made-up vehicle list of tests/beta/vehicles_fake.js with a stand-in scene (real models, no drawing):
//   - the same movement at 30, 60, 144 and 240 frames a second,
//   - every state reached without a fault, effects asked for when they should be,
//   - a rewind and a jump forward give the state the data and the time call for,
//   - with `cost`: pieces drawn (draw calls before shadows) and triangles per vehicle at each level of detail.
// Prints VEHICLE MOTION PASS or FAIL; exits 1 on FAIL.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nm = path.join(ROOT, 'node_modules'); if (!fs.existsSync(path.join(nm, 'three'))) { fs.mkdirSync(nm, { recursive: true }); fs.symlinkSync(path.join(ROOT, '.cache/package'), path.join(nm, 'three')); }
// just enough of a browser for the model loader: files from disk, pictures that "load" at once and are never looked at
globalThis.self = globalThis; globalThis.window = globalThis;
const img = () => { const L = {}, o = { style: {}, onload: null, addEventListener(k, f) { (L[k] = L[k] || []).push(f); }, removeEventListener() { }, set src(v) { setTimeout(() => { (L.load || []).forEach(f => f()); if (o.onload) o.onload(); }, 0); }, width: 1, height: 1 }; return o; };
globalThis.Image = function () { return img(); };
globalThis.document = { createElementNS: () => img(), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => { } }), width: 0, height: 0 }) };
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => { };
globalThis.fetch = async url => { const f = path.join(ROOT, String(url)); return fs.existsSync(f) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) } : { ok: false }; };
const THREE = await import('three');
const { Vehicles, vehicleInfo } = await import('../../src/render/vehicles.js');
(0, eval)(fs.readFileSync(path.join(ROOT, 'tests/beta/vehicles_fake.js'), 'utf8'));

const fails = []; const need = (ok, what) => { if (!ok) fails.push(what); console.log((ok ? '  ok    ' : '  FAIL  ') + what); };
// a stand-in scene: rolling ground, an effects layer that only counts what it is asked for
function makeScene() {
  const calls = {}; let s = 1;
  const fx = new Proxy({ n: 0, time: 0 }, { get: (o, k) => k in o ? o[k] : k === 'R' ? () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; } : k === 'seed' ? v => { s = (Math.floor(v * 1000) ^ 0x9e3779b9) >>> 0 || 1; } : (...a) => { calls[k] = (calls[k] || 0) + 1; } });
  const world = { h: (e, n) => 3 * Math.sin(e / 37) + 2 * Math.cos(n / 29) + 0.4 * Math.sin((e + n) / 6) };
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 20000); camera.position.set(0, 30, 0);
  return { units: new THREE.Group(), camera, fx, world, calls, quality: 'high', thermal: 0, marks: { add() { calls.mark = (calls.mark || 0) + 1; } }, blast() { calls.blast = (calls.blast || 0) + 1; },
    at(e, n, up = 0, out = new THREE.Vector3()) { return out.set(e, world.h(e, n) + up, -n); } };
}
const tank = { e: 500, n: 500, h: 0 }, F = window.__vehFake(tank, 7);
const settle = () => new Promise(r => setTimeout(r, 30));
async function ready(V, fb) { for (let i = 0; i < 200; i++) { V.update(fb, { t: fb.t, all: true }); await settle(); const st = V.status(); if (st.vehicles && st.ready === st.vehicles && V.soldier) return true; } return false; }
const battleAt = () => { const fb = { t: 0, dt: 0.1, tank, units: [{ id: 7, alive: true }], events: [], vehicles: () => F(fb.t) }; return fb; };
// look at the row from close by so every vehicle is at its closest level of detail
const lookAtRow = (sc, back = 60) => { const p = F.slot(4.5), D = Math.PI / 180; sc.camera.position.set(p[0] - Math.sin(F.brg * D) * back, sc.world.h(p[0], p[1]) + 5, -(p[1] - Math.cos(F.brg * D) * back)); sc.camera.lookAt(p[0], sc.world.h(p[0], p[1]), -p[1]); sc.camera.updateMatrixWorld(true); };

// ---- 1. the same movement at any frame rate ----
console.log('frame rates');
const runs = {};
for (const fps of [30, 60, 144, 240]) {
  const sc = makeScene(), V = new Vehicles(sc, 'assets/'), fb = battleAt(); lookAtRow(sc);
  need(await ready(V, fb), fps + ' fps: all models prepared'); V.update(fb, { t: -1, all: true }); V.update(fb, { t: 0, all: true });
  const rec = []; let k = 0, tt = 0;
  while (tt < 10.5) { k++; tt = k / fps; fb.t = Math.ceil(tt * 10 - 1e-6) / 10; V.update(fb, { t: tt, all: true });
    if (Math.abs(tt * 2 - Math.round(tt * 2)) < 0.5 / fps) rec.push([101, 102, 103, 104].map(id => { const w = V.view(id); return [w.X.x, w.N.x, w.H.x, w.y, w.A.p, w.P.x, w.wheels[0] ? w.wheels[0].a : 0]; })); }
  runs[fps] = { rec, dust: sc.calls.dust || 0, errors: V.errors, last: V.lastError };
  if (V.errors) console.log(V.lastError);
}
{ const a = runs[240].rec, worst = { pos: 0, hdg: 0, y: 0, spring: 0 };
  for (const fps of [30, 60, 144]) { const r = runs[fps].rec; for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].length; j++) { const p = a[i][j], q = r[i][j];
    worst.pos = Math.max(worst.pos, Math.hypot(p[0] - q[0], p[1] - q[1])); worst.hdg = Math.max(worst.hdg, Math.abs(p[2] - q[2])); worst.y = Math.max(worst.y, Math.abs(p[3] - q[3])); worst.spring = Math.max(worst.spring, Math.abs(p[4] - q[4])); } }
  const d = [30, 60, 144, 240].map(f => runs[f].dust);
  console.log('  largest difference from 240 fps: position ' + (worst.pos * 100).toFixed(1) + ' cm, heading ' + (worst.hdg * 57.3).toFixed(2) + ' deg, height ' + (worst.y * 100).toFixed(1) + ' cm, spring pitch ' + (worst.spring * 57.3).toFixed(3) + ' deg; dust puffs ' + d.join(' / '));
  need(worst.pos < 0.06, 'position within 6 cm'); need(worst.hdg < 0.01, 'heading within 0.6 degrees'); need(worst.spring < 0.004, 'spring pitch within 0.25 degrees'); need(Math.max(...d) - Math.min(...d) <= 2 && d[0] > 20, 'dust by distance, not by frames');
  need([30, 60, 144, 240].every(f => runs[f].errors === 0), 'no faults');
  const end = a[a.length - 1][0], p = F(10.5)[0]; need(Math.hypot(end[0] - p.e, end[1] - p.n) < 0.05, 'halts where the battle says (within 5 cm)'); }

// ---- 2. the whole story at 60 fps: firing, hits, kills ----
console.log('story');
const sc = makeScene(), V = new Vehicles(sc, 'assets/'), fb = battleAt(); lookAtRow(sc); await ready(V, fb); V.update(fb, { t: -1, all: true }); V.update(fb, { t: 0, all: true });
const teams = [{ group: { visible: true } }], seen = {}; let tt = 0, k = 0;
const go = to => { while (tt < to - 1e-9) { k++; tt = k / 60; fb.t = Math.ceil(tt * 10 - 1e-6) / 10; teams[0].group.visible = true; V.update(fb, { t: tt, all: true, teams }); } };
go(9); need(V.view(101).owns(7) && teams[0].group.visible === false, 'team aboard the UAZ: its own figures are not drawn');
go(11.5); need((sc.calls.mgFlash || 0) >= 6 && (sc.calls.tracer || 0) >= 6, '30 mm burst: flashes and tracers (' + (sc.calls.mgFlash || 0) + ', ' + (sc.calls.tracer || 0) + ')'); need((sc.calls.muzzleBlast || 0) === 1 && (sc.calls.dustRing || 0) >= 1, 'main gun: blast and dust ring');
{ const w = V.view(103); need(w.gun.position.z < w.gun0.z - 0.02, 'main gun still run back half a second after firing'); }
go(13.5); { const r = V.view(101).riders.get(7); need(r.state === 'leaving' && r.figs && r.figs[0].visible, 'team getting out: figures shown beside the UAZ'); }
go(15); need(!V.view(101).owns(7), 'team out: handed back to its own view'); teams[0].group.visible = true; V.update(fb, { t: tt, all: true, teams }); need(teams[0].group.visible, 'team view left alone once out');
{ const w = V.view(104); need(w.trackOff != null && w.strip && Math.abs(w.fwd) < 0.2, 'mobility kill: track thrown, halted'); }
go(17); need((sc.calls.backblast || 0) === 1, 'missile launch: backblast');
go(21); { const w = V.view(110); need(Math.abs(w.turret.rotation.y) > 0.3 && w.lid.visible, 'firepower kill: turret off its line, hatch open'); }
go(21.5); need((sc.calls.sparks || 0) > 0, 'hit without effect: sparks');
go(23.2); { const w = V.view(106); need(w.turret.position.y > w.turret0.y + 2, 'catastrophic kill of a tank: turret in the air a second later (' + (w.turret.position.y - w.turret0.y).toFixed(1) + ' m up)'); need((sc.calls.secondary || 0) >= 1 && (sc.calls.burn || 0) > 10, 'fire and secondary explosions'); }
go(26); { const w = V.view(106), p = w.turret.position; need(Math.abs(p.x - w.turret0.x) > 2.2 && p.y < 0.9 && Math.abs(Math.abs(w.turret.rotation.z) - Math.PI) < 0.4, 'turret lies beside the hull, on its roof (' + (p.x - w.turret0.x).toFixed(1) + ' m to the side)');
  const b = V.view(107); need(b.doors.length === 2 && Math.abs(b.doors[0].rotation.y) > 1.5, 'BMP: rear doors blown open'); }
go(28); need(V.view(108).lid.visible, 'abandoned tank: hatch open');
go(32); { const w = V.view(101), r = w.riders.get(7); need(r.state === 'thrown' && w.owns(7) && Math.abs(w.group.rotation.z) > 1.3, 'UAZ thrown on its side, riders thrown out'); const f = r.figs[0]; f.updateWorldMatrix(true, true); const hp = f.userData.rig.bones[0].getWorldPosition(new THREE.Vector3()), up = hp.y - sc.world.h(hp.x, -hp.z); need(f.parent !== w.group && up > 0.03 && up < 0.45, 'a thrown rider lies on the ground (hips ' + up.toFixed(2) + ' m above it)'); }
sc.thermal = 1; go(33); { const w = V.view(102), t = V.view(106); need(w.hots.engine[0].visible && w.hots.engine.mat.emissiveIntensity > 2.5, 'thermal: a running engine glows'); need(t.mats[0].emissiveIntensity > 3, 'thermal: a burning wreck is saturated'); need(V.view(103).hots.gun.mat.emissiveIntensity > V.view(105).hots.gun.mat.emissiveIntensity, 'thermal: a barrel that has fired is warmer than one that has not'); }
sc.thermal = 0; go(33.1); need(!V.view(102).hots.engine[0].visible, 'thermal off: heat patches hidden');
const burnAt = sc.calls.burn; go(400); const n400 = { ...sc.calls }; go(420);
need(V.view(106).settled && V.view(107).settled && V.view(101).settled, 'wrecks settled after burning out'); need(sc.calls.burn === n400.burn && sc.calls.puff === n400.puff, 'a settled wreck asks for no more effects');
need(V.errors === 0, 'no faults in the story' + (V.lastError ? ': ' + V.lastError.stack : ''));

// ---- 3. rewind and jump ----
console.log('rewind');
const jump = to => { tt = to; k = Math.round(to * 60); fb.t = Math.ceil(tt * 10 - 1e-6) / 10; V.update(fb, { t: tt, all: true, teams }); };
jump(9.5); { const w = V.view(106); need(!w.settled && w.turret.position.distanceTo(w.turret0) < 1e-6 && w.scorch <= 0, 'back before the kill: turret on, paint clean'); need(Math.abs(V.view(101).group.rotation.z) < 0.3 && V.view(101).riders.get(7).state === 'in', 'UAZ upright again, team aboard'); need(V.view(104).trackOff == null, 'track back on'); }
jump(23.0); { const w = V.view(106); need(w.turret.position.y > w.turret0.y + 2, 'jump into the middle of the kill: turret in the air'); }
const before = { ...sc.calls }; jump(900); need(V.view(106).settled && Math.abs(V.view(106).turret.position.x - V.view(106).turret0.x) > 2.2, 'jump far ahead: settled wreck, turret beside it'); need((sc.calls.secondary || 0) === (before.secondary || 0) && (sc.calls.vehicleHit || 0) === (before.vehicleHit || 0), 'no explosions replayed by a jump');
need(V.errors === 0, 'no faults');
{ const i = F(18.2).map(vehicleInfo); console.log('  for the map and menu, e.g.: ' + i.slice(0, 5).map(x => x.name + ' [' + x.icon + '] ' + x.line).join(' | ')); need(i.every(x => x.name && x.line && x.icon), 'name, state line and icon for every vehicle'); }

// ---- 4. what they cost ----
if (process.argv[2] === 'cost') {
  console.log('cost (pieces drawn = draw calls before shadows; triangles)');
  const tri = m => { const g = m.geometry, n = g.index ? g.index.count : g.attributes.position.count; return n / 3 * (m.isInstancedMesh ? m.count : 1); };
  jump(9.5); for (const [id, name] of [[109, 'UAZ-469'], [105, 'BMP-2'], [106, 'T-72B3'], [110, 'T-90M']]) { const w = V.view(id), out = [];
    for (const lod of [0, 1, 2]) { w.lod = lod; for (const p of w.pieces) { const q = p.userData.lod; p.visible = q === 'near' ? lod === 0 : q === 'detail' ? lod < 2 : q === 'mid' ? lod === 1 : lod === 2; } let n = 0, t = 0; w.group.traverse(o => { if (o.isMesh && o.visible && !o.userData.hot) { let v = true; for (let p = o.parent; p; p = p.parent) if (!p.visible) v = false; if (v) { n++; t += tri(o); } } }); out.push(n + ' pieces, ' + Math.round(t) + ' triangles'); }
    console.log('  ' + name.padEnd(8) + ' close: ' + out[0] + '   middle: ' + out[1] + '   far: ' + out[2]); w.lod = -1; }
}
console.log(fails.length ? 'VEHICLE MOTION FAIL (' + fails.length + ')' : 'VEHICLE MOTION PASS'); process.exit(fails.length ? 1 : 0);
