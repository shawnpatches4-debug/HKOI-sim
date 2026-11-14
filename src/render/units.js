// The things on the battlefield that move: the vehicle, enemy teams, missiles and drones in flight.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { vehicleFinish } from './env.js';
import { POSES, setPose, reach } from './figure.js';
import { TeamView } from './teamview.js';

const DEG = Math.PI / 180;

// The vehicle: the detailed model if its files can be loaded, a plain stand-in until then (or if they cannot).
// Loading a model file. The hosting page only lets a page read its own files: it refuses the 'data:' and 'blob:' reads the 3D library
// would otherwise make for a model's embedded geometry and pictures. So the file is read as plain text here, its embedded geometry is
// unpacked in memory, and pictures are loaded as ordinary image elements. Nothing else touches the network.
function b64bytes(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export async function loadGLTF(url) {
  const res = await fetch(url); if (!res.ok) throw new Error('missing ' + url); const json = await res.json(); let bin = new Uint8Array(0);
  if (json.buffers && json.buffers.length) { if (json.buffers.length > 1) throw new Error('model with several buffers: ' + url); const u = json.buffers[0].uri || ''; const k = u.indexOf('base64,'); if (k < 0) throw new Error('model buffer is not embedded: ' + url); bin = b64bytes(u.slice(k + 7)); delete json.buffers[0].uri; json.buffers[0].byteLength = bin.length; }
  const pad = n => (4 - n % 4) % 4, enc = new TextEncoder().encode(JSON.stringify(json)), jl = enc.length + pad(enc.length), bl = bin.length + pad(bin.length), glb = new ArrayBuffer(12 + 8 + jl + (bl ? 8 + bl : 0)), dv = new DataView(glb), u8 = new Uint8Array(glb);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.byteLength, true); dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(enc, 20); u8.fill(0x20, 20 + enc.length, 20 + jl);
  if (bl) { dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004E4942, true); u8.set(bin, 28 + jl); }
  const base = url.slice(0, url.lastIndexOf('/') + 1), keep = self.createImageBitmap;
  return await new Promise((ok, bad) => { try { self.createImageBitmap = undefined; new GLTFLoader().parse(glb, base, g => ok(g.scene), bad); } catch (e) { bad(e); } finally { self.createImageBitmap = keep; } });   // without createImageBitmap the library uses image elements for pictures
}

export class TankView {
  constructor(assetBase) {
    this.group = new THREE.Group(); this.group.name = 'tank';
    const stand = this.standIn = new THREE.Group(), olive = new THREE.MeshStandardMaterial({ color: '#6b6a4c', roughness: 0.85 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.66, 1.1, 7.9), olive); hull.position.y = 1.0; const tur = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.8, 4.4), olive); tur.position.set(0, 1.95, 0.3); const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.3, 8), olive); gun.rotation.x = Math.PI / 2; gun.position.set(0, 2.0, 5.0);
    for (const m of [hull, tur, gun]) { m.castShadow = true; m.receiveShadow = true; stand.add(m); } this.group.add(stand); this.loaded = false; this.failed = false;
    this.turretYaw = 0;
    if (assetBase) this._loadV3(assetBase).catch(() => false).then(ok => { if (!ok) this._loadOld(assetBase); });
  }
  // The M1A2 SEPv3 with Trophy: hull and turret are separate files, the turret centred on its turning point.
  async _loadV3(base) {
    const d = base + 'm1v3/', load = loadGLTF, json = async f => { const r = await fetch(d + f); if (!r.ok) throw new Error('missing ' + f); return r.json(); };
    // The newer set of files has the wheels as their own file (so they can turn) and the two tracks as separate pieces. If it has not been
    // published yet, use the first set: the tracks still run and the hull still rocks, but the wheels stay fused to the hull.
    let meta, hull, tur, wheels = null;
    try { meta = await json('m1v3_meta2.json'); if (!meta.wheels) throw new Error('no wheels listed'); [hull, wheels, tur] = await Promise.all([load(d + 'm1v3_hull2.json'), load(d + 'm1v3_wheels.json'), load(d + 'm1v3_turret.json')]); }
    catch (e) { wheels = null; meta = await json('m1v3_meta.json'); [hull, tur] = await Promise.all([load(d + 'm1v3_hull.json'), load(d + 'm1v3_turret.json')]); }
    const TEX = { US_1M1_ABRAMS: { map: d + 'abrams_c.webp', normal: d + 'abrams_n.webp', rough: 0.7, metal: 0.2 }, US_2Abrams_armor: { map: d + 'armor_c.webp', normal: d + 'armor_n.webp', rough: 0.75 }, US_HeavyTrack: { map: d + 'track_c.webp', rough: 0.85, metal: 0.3 }, M2: { map: d + 'm2_c.webp', rough: 0.6, metal: 0.25 }, M240L: { map: d + 'm240_c.webp', rough: 0.6, metal: 0.25 }, US_3Abrams_armor_glass: { color: '#0d1414', rough: 0.15, metal: 0.4 } };
    const mats = {}, byName = o => o.traverse(m => { if (!m.isMesh) return; const tag = (m.name + ' ' + (m.parent ? m.parent.name : '')).toLowerCase(), key = Object.keys(TEX).find(k => tag.includes(k.toLowerCase())) || (/m240/.test(tag) ? 'M240L' : /^m2|_m2|browning/.test(tag) ? 'M2' : 'US_1M1_ABRAMS'); if (key) m.material = mats[key] || (mats[key] = new THREE.MeshStandardMaterial({ name: key })); });   // the part files name each piece after its material
    const done = new Set(), prep = o => { byName(o); skin(o, TEX); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; for (const mt of [].concat(m.material)) if (mt && !done.has(mt)) { done.add(mt); if (mt.name === 'US_1M1_ABRAMS' || mt.name === 'US_2Abrams_armor') vehicleFinish(mt); } } }); return o; };
    // Two groups: the running gear (tracks and wheels), which stays on the ground, and the body (hull and turret), which rocks on its suspension.
    const g = new THREE.Group(), gear = new THREE.Group(), body = this.body = new THREE.Group(); g.add(gear, body);
    body.add(prep(hull)); this.turret = new THREE.Group(); this.turret.position.fromArray(meta.pivot); this.turret.add(prep(tur)); body.add(this.turret);
    this._runningGear(gear, hull, wheels && prep(wheels), meta);
    this._station(); this.model = g; this.group.add(g); this.standIn.visible = false; this.loaded = true; this.variant = 'M1A2 SEPv3 TUSK with Trophy'; return true;
  }
  // The HKOI weapon station: a remote weapon station carrying an M230LF 30 mm chain gun, laid out after the real thing: a pedestal,
  // a trunnion drum that elevates the gun, a boxy sight unit on the left, a large ammunition box on the right and a flexible feed
  // chute arching from the box over into the gun. Built from simple shapes. It is seated on the turret roof by measuring the roof
  // under it, and turns and elevates on its own, independent of the main turret.
  _station() {
    const paint = vehicleFinish(new THREE.MeshStandardMaterial({ color: '#3f4234', roughness: 0.72, metalness: 0.2 })), dark = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.5, metalness: 0.55 }), steel = new THREE.MeshStandardMaterial({ color: '#8a8c8c', roughness: 0.4, metalness: 0.75 }), glass = new THREE.MeshStandardMaterial({ color: '#081018', roughness: 0.06, metalness: 0.8 });
    const M = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; par.add(m); return m; }, cyl = (r0, r1, len, seg, mat, x, y, z, par) => { const m = M(new THREE.CylinderGeometry(r0, r1, len, seg), mat, x, y, z, par); m.rotation.x = Math.PI / 2; return m; };
    // where on the roof: left rear, behind the loader's hatch. Find the roof under the pedestal by looking straight down at five points.
    const px = 0.55, pz = -0.95; this.turret.updateMatrixWorld(true); const ray = new THREE.Raycaster(), o = this.turret.position, hs = [];
    for (const [dx, dz] of [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) { ray.set(new THREE.Vector3(o.x + px + dx, o.y + 6, o.z + pz + dz), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(this.turret, true)[0]; if (h) hs.push(h.point.y - o.y); }
    hs.sort((a, b) => a - b); const roof = hs.length ? hs[Math.floor(hs.length / 2)] : 0.75;
    const base = this.rws = new THREE.Group(); base.position.set(px, roof - 0.03, pz); this.turret.add(base); this.rwsRoof = roof;
    M(new THREE.CylinderGeometry(0.36, 0.4, 0.07, 24), paint, 0, 0.035, 0, base); M(new THREE.CylinderGeometry(0.27, 0.3, 0.1, 24), dark, 0, 0.12, 0, base);       // mounting ring bolted to the roof, slew bearing
    const yaw = this.rwsYaw = new THREE.Group(); yaw.position.y = 0.17; base.add(yaw);
    M(new THREE.BoxGeometry(0.34, 0.3, 0.36), dark, 0, 0.15, -0.02, yaw);                                                         // drive housing
    M(new THREE.BoxGeometry(0.5, 0.06, 0.5), paint, 0, 0.32, 0, yaw);                                                             // deck
    M(new THREE.BoxGeometry(0.42, 0.46, 0.9), paint, 0.47, 0.5, -0.12, yaw); M(new THREE.BoxGeometry(0.44, 0.03, 0.92), paint, 0.47, 0.745, -0.12, yaw);   // ammunition box and its lid (right side)
    M(new THREE.BoxGeometry(0.2, 0.18, 0.22), paint, 0.42, 0.85, -0.2, yaw);                                                      // feed motor on top of the box
    M(new THREE.BoxGeometry(0.07, 0.36, 0.3), paint, -0.2, 0.52, 0, yaw); M(new THREE.BoxGeometry(0.07, 0.36, 0.3), paint, 0.2, 0.52, 0, yaw);            // trunnion cheeks
    const mast = M(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), paint, -0.05, 0.95, -0.3, yaw); M(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 10), dark, 0, 0.29, 0, mast);   // small mast with a sensor on top
    const pitch = this.rwsPitch = new THREE.Group(); pitch.position.set(0, 0.6, 0); yaw.add(pitch);
    const drum = M(new THREE.CylinderGeometry(0.15, 0.15, 0.72, 20), paint, -0.1, 0, 0, pitch); drum.rotation.z = Math.PI / 2;    // elevation drum running across
    // sight unit: a box on the left with one large and three small windows
    const sight = M(new THREE.BoxGeometry(0.36, 0.34, 0.42), paint, -0.62, 0.02, 0.1, pitch);
    for (const [lx, ly, lr] of [[0.02, 0.05, 0.085], [-0.11, -0.09, 0.04], [0.02, -0.11, 0.04], [0.12, -0.06, 0.03]]) { const l = M(new THREE.CylinderGeometry(lr, lr, 0.02, 18), glass, lx, ly, 0.215, sight); l.rotation.x = Math.PI / 2; }
    // the gun: receiver, barrel with its recoil sleeve, and the big slotted muzzle brake
    M(new THREE.BoxGeometry(0.24, 0.24, 0.82), dark, 0.05, 0.2, -0.08, pitch); M(new THREE.BoxGeometry(0.16, 0.12, 0.3), dark, 0.05, 0.36, -0.2, pitch);
    const slide = new THREE.Group(); pitch.add(slide); this.rwsSlide = slide;
    cyl(0.06, 0.06, 0.5, 14, dark, 0.05, 0.2, 0.55, slide); cyl(0.034, 0.04, 1.6, 12, dark, 0.05, 0.2, 1.55, slide);
    cyl(0.075, 0.075, 0.42, 16, steel, 0.05, 0.2, 2.5, slide); for (let k = 0; k < 5; k++) M(new THREE.BoxGeometry(0.17, 0.03, 0.035), dark, 0.05, 0.2, 2.36 + k * 0.07, slide); cyl(0.085, 0.07, 0.05, 16, steel, 0.05, 0.2, 2.72, slide);
    // flexible feed chute: an arch of links from the top of the ammunition box up, over and down into the receiver
    const chute = new THREE.Group(); yaw.add(chute); this.rwsChute = chute; const link = new THREE.BoxGeometry(0.16, 0.03, 0.06);
    for (let k = 0; k <= 14; k++) { const f = k / 14, a = Math.PI * f, x = 0.47 - 0.42 * f, y = 0.93 + Math.sin(a) * 0.17, z = -0.2 + 0.1 * f, m = M(link, dark, x, y, z, chute); m.rotation.z = Math.PI / 2 - Math.cos(a) * 1.15; m.rotation.y = 0.2; }
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0.05, 0.2, 2.78); pitch.add(this.muzzle); this.rwsY = 0; this.rwsP = 0; this.recoil = 0;
  }
  // point the station at a place in the scene (or stow it forward when there is nothing to shoot at). Traverse 90 and elevation 60 degrees a second.
  aimStation(point, dt) { if (!this.rws) return; let wy = 0, wp = 0; if (point) { const o = this.rwsYaw.getWorldPosition(new THREE.Vector3()), dx = point.x - o.x, dy = point.y - o.y - 0.8, dz = point.z - o.z, brg = Math.atan2(dx, -dz) / DEG, facing = (this.heading || 0) + this.turretYaw; wy = ((brg - facing + 540) % 360) - 180; wp = Math.max(-10, Math.min(65, Math.atan2(dy, Math.hypot(dx, dz)) / DEG)); }
    const d = ((wy - this.rwsY + 540) % 360) - 180; this.rwsY += Math.max(-90 * dt, Math.min(90 * dt, d)); this.rwsP += Math.max(-60 * dt, Math.min(60 * dt, wp - this.rwsP)); this.rwsYaw.rotation.y = -this.rwsY * DEG; this.rwsPitch.rotation.x = -this.rwsP * DEG;
    this.recoil = Math.max(0, this.recoil - dt * 1.4); this.rwsSlide.position.z = -this.recoil; }
  // where the coaxial machine gun (beside the main gun) and the commander's .50 are in the scene
  mgMuzzle(which, out) { if (!this.turret) return null; this.group.updateWorldMatrix(true, true); if (which === 'm240') out.set(0.78, 1.3, 0.55); else out.set(which === 'coax' ? -0.32 : -0.75, which === 'coax' ? 0.48 : 1.38, which === 'coax' ? 2.1 : 1.1); return this.turret.localToWorld(out); }   /* m240: the loader's hatch, left of the turret roof (place assumed) */
  // where the 30 mm muzzle is in the scene right now; kick = true when a round has just left
  hkoiMuzzle(out, kick) { if (!this.muzzle) return null; this.group.updateWorldMatrix(true, true); if (kick) this.recoil = 0.12; return this.muzzle.getWorldPosition(out); }
  // swing the turret toward a compass bearing at traverse speed (40 degrees a second); hullDeg is the hull's heading
  aim(bearingDeg, hullDeg, dt) { if (!this.turret) return; const want = ((bearingDeg - hullDeg + 540) % 360) - 180, d = ((want - this.turretYaw + 540) % 360) - 180; this.turretYaw += Math.max(-40 * dt, Math.min(40 * dt, d)); this.turret.rotation.y = -this.turretYaw * DEG; }
  // ---- Moving parts: tracks, wheels and suspension ----
  // Take the tracks (and the wheels, when they came as their own file) out of the hull so they stay on the ground while the hull rocks.
  _runningGear(gear, hull, wheels, meta) {
    this.tracks = []; this.wheels = []; this.gauge = 1.38;                           // gauge: distance from the centre line to the middle of a track, metres
    const tm = []; hull.updateMatrixWorld(true); hull.traverse(m => { if (m.isMesh && m.material && m.material.name === 'US_HeavyTrack') tm.push(m); });
    for (const m of tm) { gear.attach(m); m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox, both = bb.min.x < -0.5 && bb.max.x > 0.5;
      if (m.material.map) m.material.map.wrapS = m.material.map.wrapT = THREE.RepeatWrapping;                // so the picture of the links can slide round and round
      this.tracks.push({ mesh: m, side: both ? 0 : bb.min.x + bb.max.x > 0 ? 1 : -1, off: 0 }); if (!both) this.gauge = Math.abs(bb.min.x + bb.max.x) / 2; }   // side: +1 left (+x), -1 right, 0 one piece holding both tracks
    if (!wheels) return;
    const by = {}, ms = []; for (const w of meta.wheels) by[w.name] = w; wheels.traverse(m => { if (m.isMesh) ms.push(m); });
    for (const m of ms) { const w = by[m.name.slice(0, 8)]; if (!w) continue;                                 // pieces are named wheel_00, wheel_01, ... like the list in the meta file
      m.geometry.translate(-w.c[0], -w.c[1], -w.c[2]); m.position.set(w.c[0], w.c[1], w.c[2]); gear.add(m);   // re-centre each wheel on its own axle so it turns about it
      this.wheels.push({ mesh: m, perM: 1 / w.r, side: w.c[0] > 0 ? 1 : -1, a: 0 }); }                        // perM: radians turned per metre the track moves
  }
  // Call once per frame. dt in seconds (0 while paused); speedMps is the ground speed (give it negative when reversing; if it is positive
  // the direction is taken from the way place() has actually moved the vehicle); yawRateDegPerSec is how fast the hull is turning, clockwise
  // positive (leave it out and it is measured from the headings given to place()).
  //   Tracks: the picture of the links slides along the track by the distance covered (one repeat of the picture is 0.5646 m of track).
  //   Wheels: each turns by distance / its radius. In a turn the outer track and its wheels run faster than the inner ones.
  //   Body: squats back when speeding up, dips when braking, leans out a little in turns, rocks back from the main gun (see kick) and
  //   settles like a heavy vehicle on stiff springs. It is worked out in fixed steps of 1/240 s, so it looks the same at any frame rate.
  animate(dt, speedMps = 0, yawRateDegPerSec) {
    const A = this._anim || (this._anim = { dir: 1, fwd: 0, turn: 0, bank: 0, vf: 0, p: 0, pv: 0, r: 0, rv: 0, y: 0, yv: 0, dist: 0, kp: 0, kr: 0, ky: 0 });
    if (!(dt > 0)) { A.fwd = 0; A.turn = 0; return; } dt = Math.min(dt, 0.25);
    if (A.fwd > 1e-4) A.dir = 1; else if (A.fwd < -1e-4) A.dir = -1;                                           // which way place() moved the vehicle since the last call
    const v = speedMps < 0 ? speedMps : speedMps * A.dir, yaw = (yawRateDegPerSec != null ? yawRateDegPerSec : Math.max(-60, Math.min(60, A.turn / dt))) * DEG; A.fwd = 0; A.turn = 0;
    // tracks and wheels
    const dL = (v + yaw * this.gauge) * dt, dR = (v - yaw * this.gauge) * dt;
    if (this.tracks) { const T = this.tracks;
      if (T.length === 2 && !this._trackSplit && T[0].mesh.material.map && T[0].mesh.material.map.image) { this._trackSplit = true; const m = T[1].mesh, mat = m.material.clone(); mat.map = m.material.map.clone(); mat.map.needsUpdate = true; m.material = mat; }   // a second copy of the picture (same image) so the two tracks can run at different speeds
      for (const t of T) { const map = t.mesh.material.map; if (!map) continue; map.wrapT = THREE.RepeatWrapping; t.off = (t.off + (t.side > 0 ? dL : t.side < 0 ? dR : v * dt) / 0.5646) % 1; if (this._trackSplit || t === T[0]) map.offset.y = t.off; } }
    if (this.wheels) for (const w of this.wheels) { w.a = (w.a + (w.side > 0 ? dL : dR) * w.perM) % (Math.PI * 2); w.mesh.rotation.x = w.a; }
    if (!this.body) return;
    // body on its springs
    const h = 1 / 240, W = 7.5, Z = 0.85, lag = 0.3, kf = 1 - Math.exp(-h / lag); A.bank += dt; let n = Math.min(60, Math.floor(A.bank / h + 1e-6)); A.bank -= n * h; if (A.bank > h) A.bank = 0;
    while (n-- > 0) {
      A.vf += (v - A.vf) * kf; const acc = (v - A.vf) / lag;                                                   // smoothed acceleration, m/s2 (the battle changes speed in steps)
      const pt = Math.max(-0.022, Math.min(0.03, -acc * 0.0075)), rt = Math.max(-0.014, Math.min(0.014, v * yaw * 0.004));   // where the springs want to be: nose up when speeding up, lean to the outside of a turn
      A.pv += A.kp; A.rv += A.kr; A.yv += A.ky; A.kp = A.kr = A.ky = 0;                                         // a shot from the main gun arrives as a shove
      A.pv += (-(A.p - pt) * W * W - A.pv * 2 * Z * W) * h; A.p += A.pv * h;
      A.rv += (-(A.r - rt) * W * W * 1.6 - A.rv * 2 * Z * W * 1.26) * h; A.r += A.rv * h;                      // stiffer side to side
      A.yv += (-A.y * W * W * 1.3 - A.yv * 2 * Z * W * 1.14) * h; A.y += A.yv * h;
      A.dist += v * h; A.amp = Math.min(1, Math.abs(A.vf) / 7);
    }
    // a very small bounce from the ground that grows with speed (a pattern tied to distance covered, so it stops when the vehicle stops)
    const amp = A.amp || 0, bp = amp * (Math.sin(A.dist * 1.37) * 0.0022 + Math.sin(A.dist * 0.61 + 1) * 0.0016), by = amp * (Math.sin(A.dist * 1.05 + 2) * 0.006 + Math.sin(A.dist * 2.3) * 0.003);
    const P = A.p + bp, R = A.r + amp * Math.sin(A.dist * 0.83 + 0.5) * 0.0015, cy = 0.9;                       // the body turns about a point 0.9 m up, roughly where the suspension holds it
    this.body.rotation.set(P, 0, R); this.body.position.set(cy * Math.sin(R), A.y + by, -cy * Math.sin(P));
  }
  // The main gun has fired: the body rocks away from the direction the gun points (back on its haunches when firing ahead, sideways when
  // firing over the side) and sinks a little, then settles. strength 1 is a full-charge 120 mm round.
  kick(strength = 1) { const A = this._anim; if (!A) return; const ty = (this.turretYaw || 0) * DEG; A.kp -= 0.3 * strength * Math.cos(ty); A.kr -= 0.2 * strength * Math.sin(ty); A.ky -= 0.2 * strength; }
  _loadOld(assetBase) {
    const stand = this.standIn;
    loadGLTF(assetBase + 'm1/m1.json').then(scene => { const g = { scene }; const done = new Set(); g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) if (m && m.isMeshStandardMaterial && !done.has(m) && !m.transparent) { done.add(m); vehicleFinish(m); } } }); this.model = g.scene; this.group.add(g.scene); stand.visible = false; this.loaded = true; }).catch(e => { this.failed = true; console.warn('tank model not loaded', e && e.message); });
  }
  // heading in degrees clockwise from north; the model's nose points along +z, scene north is -z
  place(pos, headingDeg, pitch = 0, roll = 0) { const A = this._anim, g = this.group.position; if (A && this.heading != null) { const hr = headingDeg * DEG, f = (pos.x - g.x) * Math.sin(hr) - (pos.z - g.z) * Math.cos(hr); if (Math.abs(f) < 5) { A.fwd += f; A.turn += ((headingDeg - this.heading + 540) % 360) - 180; } }   // note how far forward it moved and turned, for animate()
    this.heading = headingDeg; this.group.position.copy(pos); this.group.rotation.set(pitch, Math.PI - headingDeg * DEG, roll, 'YXZ'); }
}

// Models supplied for the enemy: each file is fetched once and copied for every use. If a file is missing the plain stand-in shapes stay.
const cache = new Map();
export function loadModel(url) { if (!cache.has(url)) cache.set(url, new Promise(res => loadGLTF(url).then(scene => { const g = { scene }; g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) { const m = o.material; m.metalness = Math.min(m.metalness, 0.4); m.transparent = false; m.opacity = 1; m.alphaTest = 0; m.depthWrite = true; m.side = THREE.DoubleSide; m.needsUpdate = true; } } }); res(g.scene); }).catch(e => { console.warn('model not loaded', url, e && e.message); res(null); }))); return cache.get(url); }
// Some supplied models come without their pictures attached: put a colour picture on each named material. tex: { materialName: url }
const texLoader = new THREE.TextureLoader();
export function skin(obj, tex) { obj.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { let u = m && tex[m.name]; if (!u || m.userData.skinned) continue; m.userData.skinned = true; if (typeof u === 'string') u = { map: u }; if (u.map) { const t = texLoader.load(u.map); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4; m.map = t; m.color.set('#ffffff'); } if (u.color) m.color.set(u.color); if (u.normal) { const n = texLoader.load(u.normal); n.flipY = false; m.normalMap = n; } m.roughness = u.rough == null ? 0.75 : u.rough; m.metalness = u.metal == null ? 0.15 : u.metal; m.needsUpdate = true; } }); return obj; }
// turn a long thin model (a launcher, a gun) so its length lies along the direction the figure faces
function alongZ(obj, len, flip) { const g = fit(obj, len), b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()), h = new THREE.Group(); h.add(g); const c = b.getCenter(new THREE.Vector3()); g.position.sub(c); if (sz.x >= sz.y && sz.x >= sz.z) h.rotation.y = Math.PI / 2; else if (sz.y >= sz.x && sz.y >= sz.z) h.rotation.x = Math.PI / 2; if (flip) { const w = new THREE.Group(); w.add(h); w.rotation.y = Math.PI; return w; } return h; }
// scale and seat a model so its longest side is `len` metres, it sits on the ground and is centred
function fit(obj, len) { const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3()), k = len / Math.max(sz.x, sz.y, sz.z), g = new THREE.Group(); obj.scale.multiplyScalar(k); const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3()); obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y; g.add(obj); return g; }

// The soldier figures and the enemy teams live in their own files: figure.js (how one figure moves) and teamview.js (the team,
// its weapon and loads). They are handed the model loading helpers from here, so models still load only through loadModel.
export { POSES, setPose, reach, TeamView };
TeamView.use({ loadModel, skin, fit, alongZ, cloneSkinned });

// A tank crewman: the supplied soldier with his infantry kit removed, wearing the supplied CVC helmet. Returns a group 1.8 m tall
// standing at the origin facing +z. The helmet is fixed to the head bone so it follows any pose.
export const CREW = { helmetYaw: 0, helmetScale: 0.36, helmetUp: -0.13, helmetFwd: 0.0 };
export async function crewFigure(base) {
  const [body, cvc] = await Promise.all([loadModel(base + 'crew/crew.json'), loadModel(base + 'crew/cvc.json')]); if (!body) return null;
  const fig = cloneSkinned(body), g = new THREE.Group(); g.add(fig); fig.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.metalness = 0; o.material.roughness = 0.85; o.material.emissive.set(0); if (/Eye/i.test(o.material.name)) { o.material.color.set('#ffffff'); o.material.opacity = 1; o.material.transparent = false; o.material.roughness = 0.25; } } }); skin(fig, { Mark_Eye: { map: base + 'crew/eye_c.webp', rough: 0.25, metal: 0 } }); fig.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(fig); const k = 1.8 / (b.max.y - b.min.y); fig.scale.multiplyScalar(k); fig.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(fig); fig.position.y -= b.min.y; fig.position.x -= (b.min.x + b.max.x) / 2; fig.position.z -= (b.min.z + b.max.z) / 2; fig.updateMatrixWorld(true);
  let head = null; fig.traverse(o => { if (o.isBone && /CC_Base_Head$/.test(o.name)) head = o; });
  if (cvc && head) { const h = skin(cvc.clone(), { NormalTest_01: { map: base + 'crew/cvc_c.webp', rough: 0.6, metal: 0.05 } }), hb = new THREE.Box3().setFromObject(h), sz = hb.getSize(new THREE.Vector3()), c = hb.getCenter(new THREE.Vector3()), w = new THREE.Group(); h.position.sub(c); w.add(h); w.scale.setScalar(CREW.helmetScale / Math.max(sz.x, sz.y, sz.z)); w.rotation.y = CREW.helmetYaw;
    const hp = head.getWorldPosition(new THREE.Vector3()), top = new THREE.Box3().setFromObject(fig).max.y; w.position.set(hp.x, top + CREW.helmetUp, hp.z + CREW.helmetFwd); g.add(w); g.updateMatrixWorld(true); head.attach(w); g.userData.helmet = w; }
  g.userData.figure = fig; return g;
}

// Parked vehicles (enemy transport and support). len = real length in metres; flip = the file's nose points the other way.
export const VEHICLES = {
  bmp2: { name: 'BMP-2M', file: 'veh/bmp2.json', len: 6.74 },
  uaz: { name: 'UAZ-469', file: 'veh/uaz.json', len: 4.03, tex: { 'UAZ-469': { map: 'veh/uaz_c.webp', rough: 0.7 }, Glass: { color: '#10181a', rough: 0.1, metal: 0.5 } } },
};
export class PropView {
  constructor(kind, base) { this.kind = kind; this.group = new THREE.Group(); const V = VEHICLES[kind]; if (!V || !base) return;
    loadModel(base + V.file).then(m => { if (!m) return; const o = m.clone(); if (V.tex) { const t = {}; for (const k in V.tex) t[k] = Object.assign({}, V.tex[k], V.tex[k].map ? { map: base + V.tex[k].map } : {}); o.traverse(x => { if (x.isMesh) x.material = x.material.clone(); }); skin(o, t); }
      const g = fit(o, V.len), b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()), h = new THREE.Group(); h.add(g); if (sz.x > sz.z) h.rotation.y = Math.PI / 2; if (V.flip) h.rotation.y += Math.PI; o.traverse(x => { if (x.isMesh) { x.frustumCulled = true; x.receiveShadow = true; } }); this.group.add(h); this.loaded = true; }); }
  place(pos, faceDeg, pitch = 0, roll = 0) { this.group.position.copy(pos); this.group.rotation.set(pitch, Math.PI - faceDeg * DEG, roll, 'YXZ'); }
}

export function missileMesh(drone, assetBase) {
  if (drone && assetBase) { const g = new THREE.Group(), stand = missileMesh(true); g.add(stand); loadModel(assetBase + 'enemy/fpv.json').then(m => { if (!m) return; g.remove(stand); const f = fit(m.clone(), 0.62); f.position.y = -0.1; f.rotation.y = missileMesh.DRONE_YAW; g.add(f); }); return g; }
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: drone ? '#1c1e20' : '#55594f', roughness: 0.6, metalness: 0.3 });
  if (drone) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), m); g.add(b); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 10), new THREE.MeshBasicMaterial({ color: '#aab3b7', transparent: true, opacity: 0.3 })); r.position.set(x * 0.17, 0.04, z * 0.17); g.add(r); } const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.45, 8), new THREE.MeshStandardMaterial({ color: '#4d5638' })); w.rotation.x = Math.PI / 2; w.position.set(0, -0.07, 0.08); g.add(w); g.scale.setScalar(2.2); }
  else {
    // A missile, in four draw calls: body with nose (one turned shape), four fins (one cross-shaped slab), the motor flame, and a
    // soft glow that can be seen from far off. Shapes and materials are made once and shared by every missile.
    // userData.flame and userData.glow let the view of the engagement flicker them and switch them off when the motor has burnt out.
    const S = missileMesh.shared || (missileMesh.shared = (() => {
      const V2 = (x, y) => new THREE.Vector2(x, y), body = new THREE.LatheGeometry([V2(0, 0.85), V2(0.03, 0.8), V2(0.075, 0.6), V2(0.075, -0.6), V2(0.05, -0.62), V2(0, -0.62)], 10); body.rotateX(Math.PI / 2);
      const sh = new THREE.Shape(), w = 0.008, r = 0.24; sh.moveTo(-w, -r); sh.lineTo(w, -r); sh.lineTo(w, -w); sh.lineTo(r, -w); sh.lineTo(r, w); sh.lineTo(w, w); sh.lineTo(w, r); sh.lineTo(-w, r); sh.lineTo(-w, w); sh.lineTo(-r, w); sh.lineTo(-r, -w); sh.lineTo(-w, -w); sh.closePath();
      const fins = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); fins.translate(0, 0, -0.58);
      const flame = new THREE.ConeGeometry(0.1, 1.5, 8, 1, true); flame.rotateX(-Math.PI / 2); flame.translate(0, 0, -0.75);
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,225,170,.85)'); gr.addColorStop(0.45, 'rgba(255,150,60,.25)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      return { body, fins, flame, skin: new THREE.MeshStandardMaterial({ color: '#55594f', roughness: 0.6, metalness: 0.3 }), hot: new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 3.6, 1.4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        glow: new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: new THREE.Color(5, 4, 3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }) }; })());
    g.add(new THREE.Mesh(S.body, S.skin), new THREE.Mesh(S.fins, S.skin));
    const flame = new THREE.Mesh(S.flame, S.hot); flame.position.z = -0.6; g.add(flame);
    const glow = new THREE.Sprite(S.glow); glow.position.z = -0.75; g.add(glow);
    g.userData.flame = flame; g.userData.glow = glow; g.scale.setScalar(1.6); }
  return g;
}

missileMesh.DRONE_YAW = 0;
