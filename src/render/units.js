// The things on the battlefield that move: the vehicle, enemy teams, missiles and drones in flight.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEG = Math.PI / 180;

// The vehicle: the detailed model if its files can be loaded, a plain stand-in until then (or if they cannot).
export class TankView {
  constructor(assetBase) {
    this.group = new THREE.Group(); this.group.name = 'tank';
    const stand = this.standIn = new THREE.Group(), olive = new THREE.MeshStandardMaterial({ color: '#6b6a4c', roughness: 0.85 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.66, 1.1, 7.9), olive); hull.position.y = 1.0; const tur = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.8, 4.4), olive); tur.position.set(0, 1.95, 0.3); const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.3, 8), olive); gun.rotation.x = Math.PI / 2; gun.position.set(0, 2.0, 5.0);
    for (const m of [hull, tur, gun]) { m.castShadow = true; m.receiveShadow = true; stand.add(m); } this.group.add(stand); this.loaded = false; this.failed = false;
    if (assetBase) new GLTFLoader().load(assetBase + 'm1/m1.json', g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); this.model = g.scene; this.group.add(g.scene); stand.visible = false; this.loaded = true; }, undefined, () => { this.failed = true; });
  }
  // heading in degrees clockwise from north; the model's nose points along +z, scene north is -z
  place(pos, headingDeg, pitch = 0, roll = 0) { this.group.position.copy(pos); this.group.rotation.set(pitch, Math.PI - headingDeg * DEG, roll, 'YXZ'); }
}

// An enemy team: two figures and their launcher, simple shapes for now. Hidden until the vehicle's side has located it (fog of war).
export class TeamView {
  constructor(kind) {
    const g = this.group = new THREE.Group(), cloth = new THREE.MeshStandardMaterial({ color: '#5a5b45', roughness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: '#2a2c26', roughness: 0.8 });
    const man = (x, z, crouch) => { const m = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, crouch ? 0.45 : 0.75, 3, 8), cloth), head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), dark); body.position.y = crouch ? 0.55 : 0.8; head.position.y = crouch ? 1.05 : 1.48; body.castShadow = head.castShadow = true; m.add(body, head); m.position.set(x, 0, z); g.add(m); return m; };
    this.men = [man(0.15, 0.5, true), man(-0.8, 0.7, true)];
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8), dark); tube.rotation.x = Math.PI / 2; tube.position.set(0, kind === 'rpg' ? 1.25 : 0.95, -0.2); tube.castShadow = true; g.add(tube);
    if (kind !== 'rpg') for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), dark); leg.position.set(Math.sin(k * 2.094) * 0.3, 0.45, -0.2 + Math.cos(k * 2.094) * 0.3); leg.rotation.set(Math.cos(k * 2.094) * 0.35, 0, -Math.sin(k * 2.094) * 0.35); g.add(leg); }
  }
  place(pos, faceDeg) { this.group.position.copy(pos); this.group.rotation.y = Math.PI - faceDeg * DEG; }
}

export function missileMesh(drone) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: drone ? '#1c1e20' : '#55594f', roughness: 0.6, metalness: 0.3 });
  if (drone) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), m); g.add(b); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 10), new THREE.MeshBasicMaterial({ color: '#aab3b7', transparent: true, opacity: 0.3 })); r.position.set(x * 0.17, 0.04, z * 0.17); g.add(r); } const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.45, 8), new THREE.MeshStandardMaterial({ color: '#4d5638' })); w.rotation.x = Math.PI / 2; w.position.set(0, -0.07, 0.08); g.add(w); g.scale.setScalar(2.2); }
  else { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.2, 10), m); b.rotation.x = Math.PI / 2; const n = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.25, 10), m); n.rotation.x = Math.PI / 2; n.position.z = 0.72; g.add(b, n); const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd9a0' })); glow.position.z = -0.7; g.add(glow); g.scale.setScalar(1.6); }
  return g;
}
