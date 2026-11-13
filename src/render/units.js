// The things on the battlefield that move: the vehicle, enemy teams, missiles and drones in flight.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { vehicleFinish } from './env.js';

const DEG = Math.PI / 180;

// The vehicle: the detailed model if its files can be loaded, a plain stand-in until then (or if they cannot).
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
    const d = base + 'm1v3/', meta = await (await fetch(d + 'm1v3_meta.json')).json(), load = u => new Promise((res, rej) => new GLTFLoader().load(u, g => res(g.scene), undefined, rej));
    const [hull, tur] = await Promise.all([load(d + 'm1v3_hull.json'), load(d + 'm1v3_turret.json')]);
    const TEX = { US_1M1_ABRAMS: { map: d + 'abrams_c.webp', normal: d + 'abrams_n.webp', rough: 0.7, metal: 0.2 }, US_2Abrams_armor: { map: d + 'armor_c.webp', normal: d + 'armor_n.webp', rough: 0.75 }, US_HeavyTrack: { map: d + 'track_c.webp', rough: 0.85, metal: 0.3 }, M2: { map: d + 'm2_c.webp', rough: 0.6, metal: 0.25 }, M240L: { map: d + 'm240_c.webp', rough: 0.6, metal: 0.25 }, US_3Abrams_armor_glass: { color: '#0d1414', rough: 0.15, metal: 0.4 } };
    const mats = {}, byName = o => o.traverse(m => { if (!m.isMesh) return; const tag = (m.name + ' ' + (m.parent ? m.parent.name : '')).toLowerCase(), key = Object.keys(TEX).find(k => tag.includes(k.toLowerCase())) || (/m240/.test(tag) ? 'M240L' : /^m2|_m2|browning/.test(tag) ? 'M2' : 'US_1M1_ABRAMS'); if (key) m.material = mats[key] || (mats[key] = new THREE.MeshStandardMaterial({ name: key })); });   // the part files name each piece after its material
    const done = new Set(), prep = o => { byName(o); skin(o, TEX); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; for (const mt of [].concat(m.material)) if (mt && !done.has(mt)) { done.add(mt); if (mt.name === 'US_1M1_ABRAMS' || mt.name === 'US_2Abrams_armor') vehicleFinish(mt); } } }); return o; };
    const g = new THREE.Group(); g.add(prep(hull)); this.turret = new THREE.Group(); this.turret.position.fromArray(meta.pivot); this.turret.add(prep(tur)); g.add(this.turret);
    this.model = g; this.group.add(g); this.standIn.visible = false; this.loaded = true; this.variant = 'M1A2 SEPv3 TUSK with Trophy'; return true;
  }
  // swing the turret toward a compass bearing at traverse speed (40 degrees a second); hullDeg is the hull's heading
  aim(bearingDeg, hullDeg, dt) { if (!this.turret) return; const want = ((bearingDeg - hullDeg + 540) % 360) - 180, d = ((want - this.turretYaw + 540) % 360) - 180; this.turretYaw += Math.max(-40 * dt, Math.min(40 * dt, d)); this.turret.rotation.y = -this.turretYaw * DEG; }
  _loadOld(assetBase) {
    const stand = this.standIn;
    new GLTFLoader().load(assetBase + 'm1/m1.json', g => { const done = new Set(); g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) if (m && m.isMeshStandardMaterial && !done.has(m) && !m.transparent) { done.add(m); vehicleFinish(m); } } }); this.model = g.scene; this.group.add(g.scene); stand.visible = false; this.loaded = true; }, undefined, () => { this.failed = true; });
  }
  // heading in degrees clockwise from north; the model's nose points along +z, scene north is -z
  place(pos, headingDeg, pitch = 0, roll = 0) { this.group.position.copy(pos); this.group.rotation.set(pitch, Math.PI - headingDeg * DEG, roll, 'YXZ'); }
}

// Models supplied for the enemy: each file is fetched once and copied for every use. If a file is missing the plain stand-in shapes stay.
const cache = new Map();
export function loadModel(url) { if (!cache.has(url)) cache.set(url, new Promise(res => new GLTFLoader().load(url, g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) { const m = o.material; m.metalness = Math.min(m.metalness, 0.4); m.transparent = false; m.opacity = 1; m.alphaTest = 0; m.depthWrite = true; m.side = THREE.DoubleSide; m.needsUpdate = true; } } }); res(g.scene); }, undefined, () => res(null)))); return cache.get(url); }
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
  stand: { LeftArm: [0.25, -1, 0.1], LeftForeArm: [0.1, -1, 0.3], RightArm: [-0.25, -1, 0.1], RightForeArm: [-0.1, -1, 0.3] },
  // down on the right knee behind a launcher, hands forward on the controls
  kneel: { Spine: [0, 1, 0.12], Spine1: [0, 1, 0.2], Spine2: [0, 1, 0.25], Neck: [0, 1, 0.25], LeftUpLeg: [0.12, -0.12, 1], LeftLeg: [0, -1, 0.05], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.05, -1, 0.18], RightLeg: [0, -0.12, -1], RightFoot: [0, -1, -0.3], LeftArm: [0.2, -0.85, 0.45], LeftForeArm: [-0.35, 0.1, 0.95], RightArm: [-0.2, -0.85, 0.45], RightForeArm: [0.35, 0.1, 0.95] },
  // kneeling with a tube on the right shoulder
  shoulder: { Spine: [0, 1, 0.05], Spine1: [0, 1, 0.05], Spine2: [0, 1, 0.08], Neck: [0, 1, 0.1], LeftUpLeg: [0.12, -0.12, 1], LeftLeg: [0, -1, 0.05], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.05, -1, 0.18], RightLeg: [0, -0.12, -1], RightFoot: [0, -1, -0.3], LeftArm: [-0.35, -0.45, 0.85], LeftForeArm: [-0.95, 0.35, 0.25], RightArm: [-0.55, -0.75, 0.4], RightForeArm: [0.02, 0.8, 0.6] },
  // squatting low, forearms on the knees
  crouch: { Spine: [0, 1, 0.35], Spine1: [0, 1, 0.5], Spine2: [0, 1, 0.55], Neck: [0, 1, 0.1], LeftUpLeg: [0.22, 0.15, 1], LeftLeg: [0, -1, -0.28], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.22, 0.15, 1], RightLeg: [0, -1, -0.28], RightFoot: [0, -0.3, 1], LeftArm: [0.1, -0.5, 0.85], LeftForeArm: [-0.3, -0.2, 0.9], RightArm: [-0.1, -0.5, 0.85], RightForeArm: [0.3, -0.2, 0.9] },
  // lying face down on the elbows, head up, looking forward
  prone: { tip: 1.5, Spine: [0, 0.1, 1], Spine1: [0, 0.2, 1], Spine2: [0, 0.3, 1], Neck: [0, 0.75, 0.7], LeftUpLeg: [0.18, 0, -1], LeftLeg: [0.05, -0.02, -1], LeftFoot: [0.3, -0.5, -1], RightUpLeg: [-0.18, 0, -1], RightLeg: [-0.05, -0.02, -1], RightFoot: [-0.3, -0.5, -1], LeftArm: [0.55, -0.55, 0.6], LeftForeArm: [-0.45, 0, 0.9], RightArm: [-0.55, -0.55, 0.6], RightForeArm: [0.45, 0, 0.9] },
};
// Apply a pose to a figure that is not yet attached to anything (so its own frame is the world frame).
export function setPose(fig, pose) {
  const B = {}; fig.traverse(o => { if (o.isBone) { B[o.name.replace(/^mixamorig:?/, '')] = o; if (!o.userData.rest) o.userData.rest = o.quaternion.clone(); o.quaternion.copy(o.userData.rest); } });
  if (!B.Hips) return; fig.position.set(0, 0, 0); fig.rotation.set(0, 0, 0); fig.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion(), wq = new THREE.Quaternion();
  const turnWorld = (bone, dq) => { bone.getWorldQuaternion(wq); bone.parent.getWorldQuaternion(pq); bone.quaternion.copy(pq.invert().multiply(dq.multiply(wq))); bone.updateMatrixWorld(true); };
  if (pose.tip) turnWorld(B.Hips, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.tip));
  for (const [bn, cn] of LIMBS) { const want = pose[bn], bone = B[bn], child = B[cn]; if (!want || !bone || !child) continue; bone.getWorldPosition(a); child.getWorldPosition(b); b.sub(a).normalize(); turnWorld(bone, q.setFromUnitVectors(b, new THREE.Vector3(want[0], want[1], want[2]).normalize())); }
  // seat it: the lowest joint goes to just above the ground (joints sit a few centimetres inside the body)
  let low = 1e9; for (const k in B) { B[k].getWorldPosition(a); if (a.y < low) low = a.y; } fig.userData.seat = -low + (pose.tip ? 0.13 : 0.07);
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
  // swap the stand-in shapes for the real models once they arrive: a gunner at the launcher and a second man beside him
  async _load(kind, base) {
    const [sol, kor, rpg] = await Promise.all([loadModel(base + 'enemy/soldier.json'), kind === 'rpg' || kind.startsWith('fpv') ? null : loadModel(base + 'enemy/kornet.json'), kind === 'rpg' ? loadModel(base + 'enemy/rpg7.json') : null]); if (!sol) return;
    const keep = []; const man = (pose, x, z, yaw) => { const f = cloneSkinned(sol); setPose(f, POSES[pose]); f.position.set(x, f.userData.seat, z); f.rotation.y = yaw; keep.push(f); return f; };
    const fresh = new THREE.Group();
    if (kor) { const l = fit(kor.clone(), 1.35); l.rotation.y = this.constructor.LAUNCHER_YAW; fresh.add(l); fresh.add(man('kneel', 0.3, -0.85, 0), man('prone', -1.5, -0.6, 0.12)); }
    else if (kind === 'rpg' && rpg) { const w = alongZ(skin(rpg.clone(), { RPG7: base + 'enemy/rpg7_albedo.webp', RPG7Rocket: base + 'enemy/rpg7rocket_albedo.webp' }), 1.34, TeamView.RPG_FLIP); w.position.set(-0.26, 1.1, 0.22); w.rotation.z = TeamView.RPG_ROLL; fresh.add(w, man('shoulder', 0, 0.2, 0), man('crouch', -1.3, 0.9, 0.3)); }
    else if (kind === 'rpg') { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 8), new THREE.MeshStandardMaterial({ color: '#3a3d33', roughness: 0.7 })); tube.rotation.x = Math.PI / 2; tube.position.set(-0.26, 1.1, 0.1); const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 8), tube.material); head.rotation.x = -Math.PI / 2; head.position.set(-0.26, 1.1, 0.75); head.rotation.x = Math.PI / 2; fresh.add(tube, head, man('shoulder', 0, 0.2, 0), man('crouch', -1.3, 0.9, 0.3)); }
    else fresh.add(man('crouch', 0, 0.3, 0), man('kneel', -1.1, 0.5, 0.4));
    if (TeamView.DEBUG) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 'red' })); m.position.set(0, 0.6, 2); fresh.add(m); }
    while (this.group.children.length) this.group.remove(this.group.children[0]); this.group.add(fresh); this.figures = keep; this.loaded = true;
  }
  place(pos, faceDeg) { this.group.position.copy(pos); this.group.rotation.y = Math.PI - faceDeg * DEG; }
}
TeamView.LAUNCHER_YAW = -Math.PI / 2; TeamView.RPG_FLIP = false; TeamView.RPG_ROLL = 0; TeamView.DEBUG = new URLSearchParams(location.hash.slice(1)).get('dbg') === '1';

export function missileMesh(drone, assetBase) {
  if (drone && assetBase) { const g = new THREE.Group(), stand = missileMesh(true); g.add(stand); loadModel(assetBase + 'enemy/fpv.json').then(m => { if (!m) return; g.remove(stand); const f = fit(m.clone(), 0.62); f.position.y = -0.1; f.rotation.y = missileMesh.DRONE_YAW; g.add(f); }); return g; }
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: drone ? '#1c1e20' : '#55594f', roughness: 0.6, metalness: 0.3 });
  if (drone) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), m); g.add(b); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 10), new THREE.MeshBasicMaterial({ color: '#aab3b7', transparent: true, opacity: 0.3 })); r.position.set(x * 0.17, 0.04, z * 0.17); g.add(r); } const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.45, 8), new THREE.MeshStandardMaterial({ color: '#4d5638' })); w.rotation.x = Math.PI / 2; w.position.set(0, -0.07, 0.08); g.add(w); g.scale.setScalar(2.2); }
  else { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.2, 10), m); b.rotation.x = Math.PI / 2; const n = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.25, 10), m); n.rotation.x = Math.PI / 2; n.position.z = 0.72; g.add(b, n); const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd9a0' })); glow.position.z = -0.7; g.add(glow); g.scale.setScalar(1.6); }
  return g;
}

missileMesh.DRONE_YAW = 0;
