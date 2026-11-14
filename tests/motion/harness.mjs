// Runs the enemy team figures without a browser, to measure and to draw how they move (fast: seconds, not minutes).
//   node tests/motion/harness.mjs metrics <kornet|rpg> [flat|slope|bumpy] [quick]     numbers (the same ones tests/beta/seq.py prints in the browser)
//   node tests/motion/harness.mjs dump <kind> '<story json>' <out.json> [ground] [fps] [every]   joint positions over time, for tests/motion/stick.py
//   node tests/motion/harness.mjs check                                                 a few hard checks; exits 1 if one fails
// The models are read from assets/enemy/*.json as skeletons and boxes only (no pictures, no drawing), which is all the movement needs.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nm = path.join(ROOT, 'node_modules'); if (!fs.existsSync(path.join(nm, 'three'))) { fs.mkdirSync(nm, { recursive: true }); fs.symlinkSync(path.join(ROOT, '.cache/package'), path.join(nm, 'three')); }
const THREE = await import('three');
const { TeamView } = await import('../../src/render/teamview.js');
await import('../beta/motion_metrics.js');

// a model file as plain objects: joints as bones, every mesh as a box of the same size
function readModel(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8')), joints = new Set(); (d.skins || []).forEach(s => s.joints.forEach(j => joints.add(j)));
  const make = i => {
    const n = d.nodes[i]; let o;
    if (n.mesh != null && n.skin == null) {
      const b = new THREE.Box3(); for (const p of d.meshes[n.mesh].primitives) { const a = d.accessors[p.attributes.POSITION]; b.expandByPoint(new THREE.Vector3(...a.min)); b.expandByPoint(new THREE.Vector3(...a.max)); }
      const sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), g = new THREE.BoxGeometry(sz.x, sz.y, sz.z); g.translate(c.x, c.y, c.z); o = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    } else o = joints.has(i) ? new THREE.Bone() : new THREE.Object3D();
    o.name = (n.name || '').replace(/[:.]/g, m => m === ':' ? '' : m); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale);
    if (n.matrix) { new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale); }
    for (const c of n.children || []) o.add(make(c)); return o;
  };
  const g = new THREE.Group(); for (const i of d.scenes[d.scene || 0].nodes) g.add(make(i)); g.updateMatrixWorld(true); return g;
}
const cache = {};
const fit = (obj, len) => { const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3()), k = len / Math.max(sz.x, sz.y, sz.z), g = new THREE.Group(); obj.scale.multiplyScalar(k); const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3()); obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y; g.add(obj); return g; };
const alongZ = (obj, len, flip) => { const g = fit(obj, len), b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()), h = new THREE.Group(); h.add(g); const c = b.getCenter(new THREE.Vector3()); g.position.sub(c); if (sz.x >= sz.y && sz.x >= sz.z) h.rotation.y = Math.PI / 2; else if (sz.y >= sz.x && sz.y >= sz.z) h.rotation.x = Math.PI / 2; if (flip) { const w = new THREE.Group(); w.add(h); w.rotation.y = Math.PI; return w; } return h; };
TeamView.use({ loadModel: async url => cache[url] || (cache[url] = readModel(url)), skin: o => o, fit, alongZ, cloneSkinned: o => o.clone(true) });

export const GROUNDS = {
  flat: () => 0,
  slope: (x, z) => 0.2 * x,                                              /* 11 degrees, rising to the east (the way the test team walks) */
  down: (x, z) => -0.2 * x,
  across: (x, z) => 0.2 * z,
  bumpy: (x, z) => 0.12 * x + 0.35 * Math.sin(x * 0.45) + 0.25 * Math.sin(z * 0.6 + x * 0.2),
};
export async function makeDriver(kind, groundName = 'flat') {
  const tv = new TeamView(kind, path.join(ROOT, 'assets') + '/'); for (let k = 0; k < 50 && !tv.loaded; k++) await new Promise(r => setTimeout(r, 5));
  if (!tv.loaded) throw new Error('team did not load');
  const scene = new THREE.Group(); scene.add(tv.group); const ground = GROUNDS[groundName]; tv.ground = ground;
  const D = { tv, kind, ground, info: { loaded: true, spare: true, firing: false, reload: 0, pack: 0, setup: 0, dead: false, dist: 5 }, e: 0, n: 0, hdg: 90, t: 0,
    pos() { return new THREE.Vector3(D.e, ground(D.e, -D.n), -D.n); },
    reset() { D.e = 0; D.n = 0; D.hdg = 90; D.t = 0; Object.assign(D.info, { loaded: true, spare: true, firing: false, reload: 0, pack: 0, setup: 0, dead: false, dist: 5 }); tv._start(); tv.place(D.pos(), 0); tv._gx = null; tv.update(0.001, 'still', true, D.info); tv.settle(); },
    step(dt, mode, spd, near) { const mv = mode === 'walk' || mode === 'run', h = D.hdg * Math.PI / 180; if (mv) { D.e += Math.sin(h) * spd * dt; D.n += Math.cos(h) * spd * dt; }
      if (D.info.reload > 0) D.info.reload = Math.max(0, D.info.reload - dt); if (D.info.pack > 0) D.info.pack = Math.max(0, D.info.pack - dt); if (D.info.setup > 0) D.info.setup = Math.max(0, D.info.setup - dt);
      if (!D.info.loaded && !D.info.firing && D.info.reloadT && D.info.reload <= 2) D.info.loaded = true;
      tv.place(D.pos(), mv ? D.hdg : 0); tv.update(dt, mode, near !== false, D.info); D.t += dt; if (tv._err) throw tv._err; } };
  D.reset(); return D;
}

const [cmd, kind, a3, a4, a5, a6, a7] = process.argv.slice(2);
if (cmd === 'metrics') {
  const D = await makeDriver(kind || 'kornet', a3 || 'flat'); console.log(JSON.stringify(globalThis.__motion.all(D, { quick: a4 === 'quick' }), null, 1));
} else if (cmd === 'dump') {
  const D = await makeDriver(kind, a5 || 'flat'), story = JSON.parse(a3), fps = +(a6 || 120), every = +(a7 || 12), frames = [], v = new THREE.Vector3();
  const snap = () => { D.tv.group.updateMatrixWorld(true); frames.push({ t: +D.t.toFixed(3), figs: D.tv.figures.map(f => f.userData.a.rig.bones.map(b => v.setFromMatrixPosition(b.matrixWorld).toArray().map(x => +x.toFixed(4)))),
    loads: D.tv.loads.filter(l => l.obj.visible).map(l => { const m = l.obj.matrixWorld, len = l.name === 'base' ? 0.3 : l.name === 'round' ? 0.35 : 0.55; return { name: l.name, a: v.set(0, 0, -len).applyMatrix4(m).toArray(), b: v.set(0, 0, len).applyMatrix4(m).toArray(), c: v.set(0, 0, 0).applyMatrix4(m).toArray() }; }),
    map: [D.e, D.ground(D.e, -D.n), -D.n], feet: D.tv.figures.map(f => f.userData.a.g.feet.map(x => x.on)), act: D.tv.act }); };
  let i = 0;
  for (const s of story) { if (s.turn) D.hdg += s.turn; if (s.info) Object.assign(D.info, s.info); const n = Math.round(s.t * fps); for (let k = 0; k < n; k++) { D.step(1 / fps, s.mode, s.spd || 0); if (++i % every === 0) snap(); } }
  const gl = []; if (frames.length) { const x0 = Math.min(...frames.map(f => f.map[0])) - 4, x1 = Math.max(...frames.map(f => f.map[0])) + 4, z = frames[0].map[2]; for (let x = x0; x <= x1; x += 0.25) gl.push([x, D.ground(x, z), z]); }
  fs.writeFileSync(a4, JSON.stringify({ kind, frames, parents: D.tv.figures[0].userData.a.rig.parent, ground: gl, groundName: a5 || 'flat' })); console.log('frames', frames.length, 'to', a4);
} else if (cmd === 'check') {
  let bad = 0; const fail = (m) => { console.log('FAIL ' + m); bad++; };
  for (const k of ['kornet', 'rpg']) for (const gnd of ['flat', 'bumpy']) {
    const D = await makeDriver(k, gnd), M = globalThis.__motion, r = M.play(D, M.STORIES.walk_run_stop, 60);
    if (r.err) fail(k + ' error ' + r.err); if (r.foot_slide_cm.worst > 1.5) fail(`${k} ${gnd} foot slide ${r.foot_slide_cm.worst} cm`);
    if (r.dvel.Hips > 0.6) fail(`${k} ${gnd} hips jolt ${r.dvel.Hips} m/s in one frame`);
    if (r.low_foot_cm && (r.low_foot_cm.lowest < -2.5 || r.low_foot_cm.highest > 2.5)) fail(`${k} ${gnd} feet off the ground ${JSON.stringify(r.low_foot_cm)}`);
  }
  console.log(bad ? 'MOTION CHECKS FAILED' : 'MOTION CHECKS PASS'); process.exit(bad ? 1 : 0);
} else if (cmd === 'look') {   /* node harness.mjs look <kind> <file.js or js text using D, M, THREE> [ground] : for looking into one thing */
  const D = await makeDriver(kind, a4 || 'flat'), M = globalThis.__motion, src = a3.endsWith('.js') ? fs.readFileSync(a3, 'utf8') : a3;
  const r = await (new Function('D', 'M', 'THREE', src))(D, M, THREE); if (r !== undefined) console.log(typeof r === 'string' ? r : JSON.stringify(r));
}
