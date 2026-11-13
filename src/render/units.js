// The things on the battlefield that move: the vehicle, enemy teams, missiles and drones in flight.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { vehicleFinish } from './env.js';

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
  mgMuzzle(which, out) { if (!this.turret) return null; this.group.updateWorldMatrix(true, true); out.set(which === 'coax' ? -0.32 : -0.75, which === 'coax' ? 0.48 : 1.38, which === 'coax' ? 2.1 : 1.1); return this.turret.localToWorld(out); }
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

// Poses for the soldier figure (a standard 'mixamorig' skeleton that arrives standing with arms straight out, facing +z, left side at +x).
// A pose says which way each limb segment points, in the figure's own frame [right(-x)/left(+x), up, forward]; `tip` rotates the whole body
// forward about the hips first (1.57 = lying face down). The figure is then seated so its lowest joint rests on the ground.
const LIMBS = [['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand']];
export const POSES = {
  // upright with a straight back: loads are fixed to a figure in this pose
  ready: { Spine: [0, 1, 0.05], Spine1: [0, 1, 0.05], Spine2: [0, 1, 0.08], Neck: [0, 1, 0.05], LeftArm: [0.25, -1, 0.1], LeftForeArm: [0.1, -1, 0.3], RightArm: [-0.25, -1, 0.1], RightForeArm: [-0.1, -1, 0.3] },
  stand: { LeftArm: [0.25, -1, 0.1], LeftForeArm: [0.1, -1, 0.3], RightArm: [-0.25, -1, 0.1], RightForeArm: [-0.1, -1, 0.3] },
  // down on the right knee behind a launcher, hands forward on the controls
  kneel: { Spine: [0, 1, 0.12], Spine1: [0, 1, 0.2], Spine2: [0, 1, 0.25], Neck: [0, 1, 0.25], LeftUpLeg: [0.12, -0.12, 1], LeftLeg: [0, -1, 0.05], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.05, -1, 0.18], RightLeg: [0, 0.16, -1], RightFoot: [0, -0.4, -1], LeftArm: [0.2, -0.85, 0.45], LeftForeArm: [-0.35, 0.1, 0.95], RightArm: [-0.2, -0.85, 0.45], RightForeArm: [0.35, 0.1, 0.95] },
  // sitting back on the heels beside a tripod launcher, leaning in to the eyepiece (the hands are put on the controls separately)
  gunner: { Spine: [0, 1, 0.3], Spine1: [0, 1, 0.42], Spine2: [0, 1, 0.5], Neck: [0, 1, 0.3], LeftUpLeg: [0.22, -0.6, 1], LeftLeg: [0, 0.06, -1], LeftFoot: [0, -0.15, -1], RightUpLeg: [-0.22, -0.6, 1], RightLeg: [0, 0.06, -1], RightFoot: [0, -0.15, -1], LeftArm: [0.1, -0.6, 0.8], LeftForeArm: [-0.4, 0.1, 0.9], RightArm: [-0.1, -0.6, 0.8], RightForeArm: [-0.2, 0.1, 0.95] },
  // kneeling with a tube on the right shoulder
  shoulder: { Spine: [0, 1, 0.05], Spine1: [0, 1, 0.05], Spine2: [0, 1, 0.08], Neck: [0, 1, 0.1], LeftUpLeg: [0.12, -0.12, 1], LeftLeg: [0, -1, 0.05], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.05, -1, 0.18], RightLeg: [0, 0.16, -1], RightFoot: [0, -0.4, -1], LeftArm: [-0.35, -0.45, 0.85], LeftForeArm: [-0.95, 0.35, 0.25], RightArm: [-0.55, -0.75, 0.4], RightForeArm: [0.02, 0.8, 0.6] },
  // squatting low, forearms on the knees
  crouch: { Spine: [0, 1, 0.35], Spine1: [0, 1, 0.5], Spine2: [0, 1, 0.55], Neck: [0, 1, 0.1], LeftUpLeg: [0.22, 0.15, 1], LeftLeg: [0, -1, -0.28], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.22, 0.15, 1], RightLeg: [0, -1, -0.28], RightFoot: [0, -0.3, 1], LeftArm: [0.1, -0.5, 0.85], LeftForeArm: [-0.3, -0.2, 0.9], RightArm: [-0.1, -0.5, 0.85], RightForeArm: [0.3, -0.2, 0.9] },
  // lying face down on the elbows, head up, looking forward
  prone: { tip: 1.5, Spine: [0, 0.1, 1], Spine1: [0, 0.2, 1], Spine2: [0, 0.3, 1], Neck: [0, 0.75, 0.7], LeftUpLeg: [0.18, 0, -1], LeftLeg: [0.05, -0.02, -1], LeftFoot: [0.3, -0.5, -1], RightUpLeg: [-0.18, 0, -1], RightLeg: [-0.05, -0.02, -1], RightFoot: [-0.3, -0.5, -1], LeftArm: [0.55, -0.55, 0.6], LeftForeArm: [-0.45, 0, 0.9], RightArm: [-0.55, -0.55, 0.6], RightForeArm: [0.45, 0, 0.9] },
};
// Two halves of a stride (left foot forward, right foot forward) for walking and for running; a moving figure swings between them.
const STRIDE = {
  walk: [{ Spine: [0, 1, 0.1], Spine1: [0, 1, 0.12], Spine2: [0, 1, 0.12], Neck: [0, 1, 0.05], LeftUpLeg: [0.04, -1, 0.42], LeftLeg: [0, -1, 0.08], LeftFoot: [0, -0.25, 1], RightUpLeg: [-0.04, -1, -0.28], RightLeg: [0, -0.78, -0.62], RightFoot: [0, -0.85, 0.5], LeftArm: [0.22, -1, -0.28], LeftForeArm: [0.1, -0.85, 0.25], RightArm: [-0.22, -1, 0.3], RightForeArm: [-0.1, -0.55, 0.8] }],
  run: [{ Spine: [0, 1, 0.3], Spine1: [0, 1, 0.36], Spine2: [0, 1, 0.36], Neck: [0, 1, 0.1], LeftUpLeg: [0.04, -0.8, 0.75], LeftLeg: [0, -1, -0.15], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.04, -1, -0.5], RightLeg: [0, -0.25, -1], RightFoot: [0, -1, 0.1], LeftArm: [0.22, -0.9, -0.5], LeftForeArm: [0.1, -0.2, 0.95], RightArm: [-0.22, -0.9, 0.55], RightForeArm: [-0.1, 0.25, 0.95] }],
};
const SIDE = k => k.startsWith('Left') ? 'Right' + k.slice(4) : k.startsWith('Right') ? 'Left' + k.slice(5) : k;
for (const g of Object.values(STRIDE)) { const A = g[0], B = {}; for (const k in A) B[SIDE(k)] = [-A[k][0], A[k][1], A[k][2]]; g.push(B); }   // the other half is the mirror image
// the pose a fraction f (0..1) of the way from one half-stride to the other; `keep` (optional) is a pose whose arms replace the swinging ones (carrying a weapon)
export function stridePose(gait, f, keep) { const [A, B] = STRIDE[gait] || STRIDE.walk, o = {}; for (const k in A) { const a = A[k], b = B[k]; o[k] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; } if (keep) for (const k of ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']) if (keep[k]) o[k] = keep[k]; return o; }
// --- helpers for fixing loads to a figure and putting his hands on them ---
const boneMap = fig => { let B = fig.userData.B; if (!B) { B = fig.userData.B = {}; fig.traverse(o => { if (o.isBone) B[o.name.replace(/^mixamorig:?/, '')] = o; }); } return B; };
const bone = (fig, name) => boneMap(fig)[name];
// where a joint is, in the frame the figure stands in (its team, or the world if it stands alone)
function jointAt(fig, name, out) { bone(fig, name).getWorldPosition(out); return fig.parent ? fig.parent.worldToLocal(out) : out; }
const home = o => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
// remember how an object sits relative to a bone (it is placed in the figure's frame first), then lift it off again
function ride(obj, b) { const par = obj.parent; b.attach(obj); const r = { bone: b, p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() }; if (par) par.attach(obj); else obj.removeFromParent(); if (obj.userData.home) unmount(obj, par); return r; }
function mount(obj, r) { r.bone.add(obj); obj.position.copy(r.p); obj.quaternion.copy(r.q); obj.scale.copy(r.s); }
function unmount(obj, to) { if (to) to.add(obj); const h = obj.userData.home; if (h) { obj.position.copy(h.p); obj.quaternion.copy(h.q); obj.scale.copy(h.s); } }
// Bend one arm so the hand lands on a point (given in the frame the figure stands in). pole says which way the elbow should point.
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _H = new THREE.Vector3(), _T = new THREE.Vector3(), _P = new THREE.Vector3(), _D = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function turnBone(b, from, to) { _q.setFromUnitVectors(from, to); b.getWorldQuaternion(_wq); b.parent.getWorldQuaternion(_pq); b.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq))); b.updateMatrixWorld(true); }
export function reach(fig, side, target, pole) {
  const B = boneMap(fig), up = B[side + 'Arm'], fo = B[side + 'ForeArm'], ha = B[side + 'Hand']; if (!up || !fo || !ha) return;
  up.getWorldPosition(_S); fo.getWorldPosition(_E); ha.getWorldPosition(_H); const L1 = _E.distanceTo(_S), L2 = _H.distanceTo(_E);
  _T.copy(target); _P.copy(pole); if (fig.parent) { fig.parent.localToWorld(_T); _P.transformDirection(fig.parent.matrixWorld); }
  _D.copy(_T).sub(_S); const len = _D.length() || 1e-6, dist = Math.max(Math.abs(L1 - L2) * 1.02 + 1e-4, Math.min(len, (L1 + L2) * 0.999)); _D.divideScalar(len);
  const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), out = Math.sqrt(Math.max(0, L1 * L1 - along * along)); _P.addScaledVector(_D, -_P.dot(_D)); if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0); _P.normalize();
  _T.copy(_S).addScaledVector(_D, dist);                                    /* where the hand will end up (the target, or as far as the arm goes) */
  _H.copy(_S).addScaledVector(_D, along).addScaledVector(_P, out);          /* the elbow */
  turnBone(up, _E.sub(_S).normalize(), _H.sub(_S).normalize());
  fo.getWorldPosition(_E); ha.getWorldPosition(_H); turnBone(fo, _H.sub(_E).normalize(), _T.sub(_E).normalize());
}
// Apply a pose to a figure that is not yet attached to anything (so its own frame is the world frame).
export function setPose(fig, pose) {
  const B = {}; fig.traverse(o => { if (o.isBone) { B[o.name.replace(/^mixamorig:?/, '')] = o; if (!o.userData.rest) o.userData.rest = o.quaternion.clone(); o.quaternion.copy(o.userData.rest); } });
  if (!B.Hips) return; fig.position.set(0, 0, 0); fig.rotation.set(0, 0, 0); if (fig.parent) fig.parent.updateWorldMatrix(true, false); fig.updateMatrixWorld(true);
  // the figure may already stand inside a team that has been placed and turned: directions are given in the figure's own frame, so carry them into the scene's
  const PQ = fig.parent ? fig.parent.getWorldQuaternion(new THREE.Quaternion()) : null, PI = fig.parent ? fig.parent.matrixWorld.clone().invert() : null;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion(), wq = new THREE.Quaternion();
  const turnWorld = (bone, dq) => { bone.getWorldQuaternion(wq); bone.parent.getWorldQuaternion(pq); bone.quaternion.copy(pq.invert().multiply(dq.multiply(wq))); bone.updateMatrixWorld(true); };
  if (pose.tip) { const ax = new THREE.Vector3(1, 0, 0); if (PQ) ax.applyQuaternion(PQ); turnWorld(B.Hips, new THREE.Quaternion().setFromAxisAngle(ax, pose.tip)); }
  for (const [bn, cn] of LIMBS) { const want = pose[bn], bone = B[bn], child = B[cn]; if (!want || !bone || !child) continue; bone.getWorldPosition(a); child.getWorldPosition(b); b.sub(a).normalize(); turnWorld(bone, q.setFromUnitVectors(b, (PQ ? new THREE.Vector3(want[0], want[1], want[2]).normalize().applyQuaternion(PQ) : new THREE.Vector3(want[0], want[1], want[2]).normalize()))); }
  // seat it: the lowest joint goes to just above the ground (joints sit a few centimetres inside the body)
  let low = 1e9; for (const k in B) { B[k].getWorldPosition(a); if (PI) a.applyMatrix4(PI); if (a.y < low) low = a.y; } fig.userData.seat = -low + (pose.tip ? 0.13 : 0.07);
}

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

// An enemy team: two figures and their launcher, simple shapes for now. Hidden until the vehicle's side has located it (fog of war).
export class TeamView {
  constructor(kind, assetBase) {
    this.kind = kind; if (assetBase) this._load(kind, assetBase);
    const g = this.group = new THREE.Group(), cloth = new THREE.MeshStandardMaterial({ color: '#5a5b45', roughness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: '#2a2c26', roughness: 0.8 });
    const man = (x, z, crouch) => { const m = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, crouch ? 0.45 : 0.75, 3, 8), cloth), head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), dark); body.position.y = crouch ? 0.55 : 0.8; head.position.y = crouch ? 1.05 : 1.48; body.castShadow = head.castShadow = true; m.add(body, head); m.position.set(x, 0, z); g.add(m); return m; };
    this.men = [man(0.15, 0.5, true), man(-0.8, 0.7, true)];
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8), dark); tube.rotation.x = Math.PI / 2; tube.position.set(0, kind === 'rpg' ? 1.25 : 0.95, -0.2); tube.castShadow = true; g.add(tube);
    if (kind !== 'rpg') for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), dark); leg.position.set(Math.sin(k * 2.094) * 0.3, 0.45, -0.2 + Math.cos(k * 2.094) * 0.3); leg.rotation.set(Math.cos(k * 2.094) * 0.35, 0, -Math.sin(k * 2.094) * 0.35); g.add(leg); }
  }
  // swap the stand-in shapes for the real models once they arrive: a gunner at the weapon and a second man beside him
  async _load(kind, base) {
    const atgm = kind === 'kornet' || kind === 'saclos' || kind === 'sal';
    const [sol, kor, rpg] = await Promise.all([loadModel(base + 'enemy/soldier.json'), atgm ? loadModel(base + 'enemy/kornet.json') : null, kind === 'rpg' ? loadModel(base + 'enemy/rpg7.json') : null]); if (!sol) return;
    const fresh = this.inner = new THREE.Group(), keep = [], V = (x, y, z) => new THREE.Vector3(x, y, z);
    // a figure, first standing upright at the origin so loads can be fixed to his body, then put in his pose at his place
    const man = (pose, x, z, yaw, downAt) => { const f = cloneSkinned(sol); setPose(f, POSES.ready); f.updateMatrixWorld(true); f.userData.home = { pose, x, z, yaw, downAt }; keep.push(f); return f; };
    const settle = () => keep.forEach(f => { const h = f.userData.home; setPose(f, POSES[h.pose]); f.position.set(h.x, f.userData.seat, h.z); f.rotation.y = h.yaw; fresh.add(f); });
    if (kor) {
      // The launcher model has four parts: tripod, sight unit, launch tube and a loose display missile. The missile is hidden (a real one
      // stays sealed in its tube). Tripod + sight unit are one load (the gunner's), the tube is the other (the second man's).
      const l = fit(kor.clone(), 1.35); l.rotation.y = TeamView.LAUNCHER_YAW; fresh.add(l); fresh.updateMatrixWorld(true);
      const part = {}; l.traverse(o => { if (o.isMesh) part[o.name] = o; }); const stand = part['стойка'], unit = part['комплекс'], tube = part['ракетница']; if (part.missile) part.missile.visible = false;
      const pivot = (objs, into) => { const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o)); const p = new THREE.Group(); b.getCenter(p.position); if (into) { into.updateMatrixWorld(true); into.worldToLocal(p.position); } (into || fresh).add(p); p.updateMatrixWorld(true); objs.forEach(o => p.attach(o)); p.userData.home = home(p); return p; };
      if (stand && unit) { this.base = pivot([stand, unit]); this.legs = pivot([stand], this.base); }
      if (tube) { if (kind === 'sal') tube.visible = false; else { this.tube = pivot([tube]); this.spare = this.tube.clone(); this.spare.position.set(1.22, 0.1, -0.8); this.spare.rotation.y = 0.12; fresh.add(this.spare); } }
      const g = man('gunner', 0.44, -0.78, 0, { x: 0.8, z: -1.1 }), s = man('prone', 1.75, -0.75, 0.12);
      // where each load rides on the move: the folded launcher on the gunner's back, the tube on the second man's right shoulder
      if (this.base) { const c = jointAt(g, 'Spine2', V()); this.base.position.set(c.x, c.y - 0.2, c.z - 0.25); this.base.rotation.y = Math.PI / 2; this.baseRide = ride(this.base, bone(g, 'Spine2')); }
      if (this.tube) { const c = jointAt(s, 'RightArm', V()); this.tube.position.set(c.x + 0.05, c.y + 0.11, c.z + 0.04); this.tube.rotation.x = 0.04; this.tubeRide = ride(this.tube, bone(s, 'RightArm').parent.parent); }
      this.launcher = l;
    } else if (kind === 'rpg') {
      const g = man('shoulder', 0, 0.2, 0), s = man('crouch', -1.3, 0.9, 0.3);
      if (rpg) {
        // The supplied RPG-7 arrives with its rocket lying beside the launcher. Numbers below were measured on that model after it is laid
        // along z (muzzle forward): where the bore runs, where the muzzle is, and the two ends of the loose rocket.
        const R = TeamView.RPG, w = alongZ(skin(rpg.clone(), { RPG7: base + 'enemy/rpg7_albedo.webp', RPG7Rocket: base + 'enemy/rpg7rocket_albedo.webp' }), 1.34, false), G = this.weapon = new THREE.Group();
        w.position.set(-R.bore[0], -R.bore[1], -R.rest); G.add(w); G.updateMatrixWorld(true);
        let rk = null; w.traverse(o => { if (o.isMesh && o.name === 'rocket') rk = o; });
        if (rk) { const tail = V(R.tail[0] - R.bore[0], R.tail[1] - R.bore[1], R.tail[2] - R.rest), dir = V(R.nose[0] - R.tail[0], R.nose[1] - R.tail[1], R.nose[2] - R.tail[2]).normalize(), P = this.rocket = new THREE.Group(); P.position.copy(tail); G.add(P); P.updateMatrixWorld(true); P.attach(rk);
          P.quaternion.setFromUnitVectors(dir, V(0, 0, 1)); P.position.set(0, 0, R.muzzle - R.rest - R.seated);   /* seated in the muzzle, warhead out in front */
          // the second man carries two more rounds on his back
          const bag = this.bag = new THREE.Group(); for (const dx of [-0.07, 0.07]) { const c = P.clone(); c.position.set(dx, -0.58, 0); c.quaternion.setFromUnitVectors(V(0, 0, 1), V(dx * 1.2, 1, -0.06).normalize()); bag.add(c); } bag.scale.setScalar(R.scale);
          const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.15), new THREE.MeshStandardMaterial({ color: '#3d4031', roughness: 0.95 })); pack.position.set(0, -0.3, 0); pack.castShadow = true; bag.add(pack);
          const c = jointAt(s, 'Spine2', V()); bag.position.set(c.x, c.y, c.z - 0.19); this.bagRide = ride(bag, bone(s, 'Spine2')); }
        G.scale.setScalar(R.scale);   /* the launcher alone is 0.95 m long */
        // on the right shoulder, level, the shoulder about a third of the way from the back
        const c = jointAt(g, 'RightArm', V()); G.position.set(c.x + 0.045, c.y + 0.09, c.z - 0.02); this.weaponRide = ride(G, bone(g, 'Spine2'));
      }
    } else { man('crouch', 0, 0.3, 0); man('kneel', -1.1, 0.5, 0.4); }
    settle();
    if (TeamView.DEBUG) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 'red' })); m.position.set(0, 0.6, 2); fresh.add(m); }
    while (this.group.children.length) this.group.remove(this.group.children[0]); this.group.add(fresh); this.figures = keep; this.mode = null; this.loaded = true;
  }
  // Bring the figures to life. mode: 'still' (at their weapon), 'down' (flat on the ground under fire), 'walk' or 'run' (moving).
  // info.loaded: a round is in the launcher (false between firing and the end of reloading). info.spare: a spare round lies ready.
  // Called every frame; the stride is recomputed at most 30 times a second.
  update(dt, mode, near, info) {
    if (!this.figures) return; const moving = mode === 'walk' || mode === 'run';
    if (info) { if (this.rocket && this.rocket.visible !== info.loaded) this.rocket.visible = info.loaded; if (this.spare) { const on = info.spare && !moving; if (this.spare.visible !== on) this.spare.visible = on; } }
    if (mode !== this.mode) { this.mode = mode; this.phase = 0; this.acc = 1; this._arrange(mode); }
    if (!moving) return; const hz = mode === 'run' ? 2.7 : 1.75; this.phase += dt * hz; this.acc += dt; if (this.acc < (near ? 1 / 30 : 0.25)) return; this.acc = 0;
    this.group.updateWorldMatrix(true, false);
    this.figures.forEach((f, i) => { const ph = this.phase + i * 0.37, tri = Math.abs(((ph % 1) + 1) % 1 * 2 - 1), ease = tri * tri * (3 - 2 * tri);
      setPose(f, stridePose(mode, ease)); f.position.set(i === 0 ? 0 : -0.7, f.userData.seat, i === 0 ? 0.4 : -1.9); f.rotation.y = 0; f.updateMatrixWorld(true); this._hands(f, i, true); });
  }
  // put everything where it belongs for a new mode: who is in which pose, and whether each load is on the ground or on a man
  _arrange(mode) {
    const F = this.figures, moving = mode === 'walk' || mode === 'run', down = mode === 'down'; this.group.updateWorldMatrix(true, false);
    if (this.base) { if (moving) mount(this.base, this.baseRide); else unmount(this.base, this.inner); this.legs.scale.set(moving ? 0.34 : 1, 1, moving ? 0.34 : 1); }   /* tripod legs folded in for the march */
    if (this.tube) { if (moving) mount(this.tube, this.tubeRide); else unmount(this.tube, this.inner); }
    if (this.bag && this.bag.parent !== this.bagRide.bone) mount(this.bag, this.bagRide);
    if (this.weapon) { if (down) { unmount(this.weapon, this.inner); const h = F[0].userData.home; this.weapon.position.set(h.x - 0.38, 0.07, h.z + 0.55); this.weapon.quaternion.identity(); this.weapon.scale.setScalar(TeamView.RPG.scale); } else mount(this.weapon, this.weaponRide); }
    if (moving) return;
    F.forEach((f, i) => { const h = f.userData.home, at = down && h.downAt ? h.downAt : h; setPose(f, POSES[down ? 'prone' : h.pose]); f.position.set(at.x, f.userData.seat, at.z); f.rotation.y = h.yaw; f.updateMatrixWorld(true); if (!down) this._hands(f, i, false); });
  }
  // hands onto the weapon or the load (the arms are bent to reach the exact spot, whatever the body is doing)
  _hands(f, i, moving) {
    const a = this._a || (this._a = new THREE.Vector3()), R = TeamView.RPG, poleR = TeamView.POLE_R, poleL = TeamView.POLE_L;
    const on = (obj, x, y, z) => this.group.worldToLocal(obj.localToWorld(a.set(x, y, z)));
    if (this.weapon && i === 0) { reach(f, 'Right', on(this.weapon, R.grip[0], R.grip[1], R.grip[2]), poleR); if (!moving) reach(f, 'Left', on(this.weapon, R.grip2[0], R.grip2[1], R.grip2[2]), poleL); }
    else if (this.base && i === 0) {
      if (moving) { jointAt(f, 'RightArm', a); a.x += 0.05; a.y -= 0.14; a.z += 0.13; reach(f, 'Right', a, poleR); jointAt(f, 'LeftArm', a); a.x -= 0.05; a.y -= 0.14; a.z += 0.13; reach(f, 'Left', a, poleL); }   /* thumbs in the pack straps */
      else { const h = this.base.userData.home.p; reach(f, 'Right', a.set(h.x - 0.03, h.y + 0.14, h.z - 0.36), poleR); reach(f, 'Left', a.set(h.x + 0.13, h.y + 0.1, h.z - 0.36), poleL); }   /* on the controls at the back of the sight unit */
    }
    else if (this.tube && i === 1 && moving) reach(f, 'Right', on(this.tube, -0.07, -0.05, 0.3), poleR);   /* steadying the tube on his shoulder */
  }
  place(pos, faceDeg) { this.group.position.copy(pos); this.group.rotation.y = Math.PI - faceDeg * DEG; }
}
TeamView.LAUNCHER_YAW = -Math.PI / 2;
// RPG-7 as supplied, after laying it along z: bore centre [x, y], muzzle z, where the shoulder sits (rest), the loose rocket's two ends,
// how far the rocket sits inside the muzzle, the grips (in the weapon's own frame: origin on the bore at the shoulder), and the scale to 0.95 m.
TeamView.RPG = { bore: [0.163, 0.038], muzzle: 0.344, rest: -0.25, tail: [-0.188, -0.112, -0.134], nose: [0.163, -0.089, 0.654], seated: 0.45, grip: [0.0, -0.12, 0.38], grip2: [0.0, -0.1, 0.25], scale: 0.94 };
TeamView.POLE_R = new THREE.Vector3(-0.7, -1, -0.1); TeamView.POLE_L = new THREE.Vector3(0.7, -1, -0.1);   /* which way the elbows point: down and out */ TeamView.DEBUG = new URLSearchParams(location.hash.slice(1)).get('dbg') === '1';

export function missileMesh(drone, assetBase) {
  if (drone && assetBase) { const g = new THREE.Group(), stand = missileMesh(true); g.add(stand); loadModel(assetBase + 'enemy/fpv.json').then(m => { if (!m) return; g.remove(stand); const f = fit(m.clone(), 0.62); f.position.y = -0.1; f.rotation.y = missileMesh.DRONE_YAW; g.add(f); }); return g; }
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: drone ? '#1c1e20' : '#55594f', roughness: 0.6, metalness: 0.3 });
  if (drone) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), m); g.add(b); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 10), new THREE.MeshBasicMaterial({ color: '#aab3b7', transparent: true, opacity: 0.3 })); r.position.set(x * 0.17, 0.04, z * 0.17); g.add(r); } const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.45, 8), new THREE.MeshStandardMaterial({ color: '#4d5638' })); w.rotation.x = Math.PI / 2; w.position.set(0, -0.07, 0.08); g.add(w); g.scale.setScalar(2.2); }
  else { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.2, 10), m); b.rotation.x = Math.PI / 2; const n = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.25, 10), m); n.rotation.x = Math.PI / 2; n.position.z = 0.72; g.add(b, n); const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd9a0' })); glow.position.z = -0.7; g.add(glow); g.scale.setScalar(1.6); }
  return g;
}

missileMesh.DRONE_YAW = 0;
