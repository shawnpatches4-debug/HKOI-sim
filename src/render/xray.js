// X-ray of a hit: the vehicle as a see-through shell, its components and the four crew positions as plain solid shapes, the
// incoming line, the point struck, the jet's path inside with its cone of spall, and every component coloured by what happened
// to it. This file only DRAWS. Every figure comes from the damage model in src/dmg.js (DMG.report and DMG.COMPS): the plate, the
// entry point, the direction, how far the jet reached, the turret's angle, what was damaged. Nothing is worked out again here.
//
// It has its own small picture (its own canvas and renderer), made the first time a hit is shown, and it is drawn only while its
// panel is open: closed, it costs nothing. The shell is the vehicle's own model seen through (the same shapes, not a copy of them).
//
// Frame, as in dmg.js: x to the vehicle's right, y up, z to the rear, metres from the hull centre at ground level.
import * as THREE from 'three';

export const XRAY_COLOURS = { ok: '#4b7f8c', damaged: '#ffb020', destroyed: '#ff3b2f', crew_ok: '#5be38f', wounded: '#ff5a2a', killed: '#b00d0d', jet: '#ffd9a0', line: '#fff2a8' };
const SPALL = 35 * Math.PI / 180;   /* the half-angle of the spall cone in dmg.js */
const UP = new THREE.Vector3(0, 1, 0);

// the shape drawn for each component (sizes in metres; the place and the radius come from DMG.COMPS)
function shapeFor(c) {
  const r = c.r, box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  if (c.crew) return null;   /* built separately: a seated figure */
  switch (c.id) {
    case 'engine': return box(1.5, 0.8, 1.3); case 'trans': return box(1.5, 0.6, 0.8); case 'ammo': return box(1.7, 0.6, 1.2); case 'hull_ammo': return box(0.7, 0.6, 0.7);
    case 'fuel_l': case 'fuel_r': return box(0.6, 0.6, 1.0); case 'track_l': case 'track_r': return box(0.55, 0.85, 6.8);
    case 'gun': { const g = new THREE.CylinderGeometry(0.2, 0.24, 1.1, 14); g.rotateX(Math.PI / 2); return g; }
    case 'tdrive': return new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.3, 16);
    default: return box(r * 1.5, r * 1.3, r * 1.5);
  }
}

export class XRayView {
  constructor(canvas) {
    this.canvas = canvas; this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' }); this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#05090b'); this.cam = new THREE.PerspectiveCamera(34, 1.5, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight('#cfeeff', '#0a0f12', 2.2)); const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(4, 8, 3); this.scene.add(sun);
    const grid = new THREE.GridHelper(16, 16, '#1f4a52', '#0f2a30'); this.scene.add(grid);
    this.ghost = new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color('#7ff0e6') } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(c * (0.022 + 0.42 * f), 1.0); }' });
    this.shell = new THREE.Group(); this.shell.rotation.y = Math.PI;   /* the vehicle's model faces +z; the damage model's frame has the front at -z */
    this.shellTurret = new THREE.Group(); this.parts = new THREE.Group(); this.partsTurret = new THREE.Group(); this.hit = new THREE.Group();
    this.scene.add(this.shell, this.parts, this.partsTurret, this.hit); this.shellFrom = null; this.byId = {};
    this.az = 0.9; this.el = 0.4; this.dist = 13.5; this.own = [];   /* geometries and materials made here, to be let go with the view */
  }
  _own(x) { this.own.push(x); return x; }

  // The shell: every visible mesh of the vehicle's model, drawn again with the see-through material. Hull pieces keep their place
  // in the vehicle; turret pieces are hung on a turret of our own, so it can be turned to the angle the damage model used.
  setShell(tank) {
    const key = tank ? (tank.loaded ? 'model' : 'standin') : 'none'; if (this.shellFrom === key) return; this.shellFrom = key;
    this.shell.clear(); this.shellTurret.clear(); this.shell.add(this.shellTurret); this.shellTurret.position.set(0, 0, 0);
    if (!tank) return; const g = tank.group; g.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), tur = tank.turret || null, invT = tur ? new THREE.Matrix4().copy(tur.matrixWorld).invert() : null;
    if (tur) this.shellTurret.position.setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inv, tur.matrixWorld));
    const seen = o => { for (let p = o; p && p !== g.parent; p = p.parent) if (!p.visible) return false; return true; }, under = (o, a) => { for (let p = o; p; p = p.parent) if (p === a) return true; return false; };
    g.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.normal || !seen(o)) return;
      const inT = tur && under(o, tur), m = new THREE.Mesh(o.geometry, this.ghost); m.matrixAutoUpdate = false; m.matrix.multiplyMatrices(inT ? invT : inv, o.matrixWorld); m.frustumCulled = false; (inT ? this.shellTurret : this.shell).add(m);
    });
  }

  // The components, once: plain shapes at the places DMG.COMPS gives.
  _build(DMG) {
    if (this.built) return; this.built = true;
    for (const c of DMG.COMPS) {
      const mat = this._own(new THREE.MeshLambertMaterial({ color: XRAY_COLOURS.ok })), grp = new THREE.Group(); grp.position.fromArray(c.p);
      if (c.crew) {   /* a seated man: body, head */
        const body = new THREE.Mesh(this._own(new THREE.CylinderGeometry(c.r * 0.5, c.r * 0.62, c.r * 1.7, 12)), mat), head = new THREE.Mesh(this._own(new THREE.SphereGeometry(c.r * 0.42, 14, 10)), mat);
        body.position.y = -c.r * 0.35; head.position.y = c.r * 0.92; grp.add(body, head);
      } else grp.add(new THREE.Mesh(this._own(shapeFor(c)), mat));
      (c.turret ? this.partsTurret : this.parts).add(grp); this.byId[c.id] = { c, mat, grp };
    }
    // the gun tube, so the turret's facing can be read at a glance (not a component of its own)
    const tube = new THREE.Mesh(this._own(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 10).rotateX(Math.PI / 2)), this._own(new THREE.MeshLambertMaterial({ color: '#2f5560' }))); tube.position.set(0, 1.9, -3.9); this.partsTurret.add(tube);
  }

  // Show one hit h (an entry of DMG.report).
  setHit(h, DMG) {
    this._build(DMG);
    this.shellTurret.rotation.y = -h.turA; this.partsTurret.rotation.y = -h.turA;
    for (const id in this.byId) { const p = this.byId[id], hit = h.comps.find(x => x.id === id), state = p.c.crew ? (h.crew[id] === 'killed' ? 'killed' : h.crew[id] === 'wounded' ? 'wounded' : 'crew_ok') : hit ? hit.state : 'ok';
      p.mat.color.set(XRAY_COLOURS[state] || XRAY_COLOURS.ok); p.mat.emissive.set(state === 'ok' || state === 'crew_ok' ? '#000000' : XRAY_COLOURS[state]); p.mat.emissiveIntensity = state === 'ok' || state === 'crew_ok' ? 0 : 0.45; }
    for (const o of this.hit.children) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); } this.hit.clear();
    const E = new THREE.Vector3().fromArray(h.entry), D = new THREE.Vector3().fromArray(h.dir).normalize(), q = new THREE.Quaternion().setFromUnitVectors(UP, D);
    const rod = (from, len, r0, r1, colour, opacity) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 12, 1, false), new THREE.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })); m.quaternion.copy(q); m.position.copy(from).addScaledVector(D, len / 2); this.hit.add(m); return m; };
    // the incoming line, with an arrow head at the plate
    rod(E.clone().addScaledVector(D, -7.5), 7.2, 0.022, 0.022, XRAY_COLOURS.line, 1);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 14), new THREE.MeshBasicMaterial({ color: XRAY_COLOURS.line })); tip.quaternion.copy(q); tip.position.copy(E).addScaledVector(D, -0.24); this.hit.add(tip);
    // the point struck: a ring lying on the line
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 28), new THREE.MeshBasicMaterial({ color: h.penetrated ? XRAY_COLOURS.destroyed : XRAY_COLOURS.crew_ok })); ring.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), D)); ring.position.copy(E); this.hit.add(ring);
    if (h.penetrated && h.reach > 0) {
      // the jet, as far as the damage model says it reached, and the cone of spall around it (0.12 m at the plate, opening at 35 degrees)
      rod(E, h.reach, 0.045, 0.02, XRAY_COLOURS.jet, 1);
      const r1 = 0.12 + Math.tan(SPALL) * h.reach, cone = new THREE.Mesh(new THREE.CylinderGeometry(r1, 0.12, h.reach, 28, 1, true), new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
      cone.quaternion.copy(q); cone.position.copy(E).addScaledVector(D, h.reach / 2); this.hit.add(cone);
      const end = new THREE.Mesh(new THREE.RingGeometry(r1 * 0.985, r1, 40), new THREE.MeshBasicMaterial({ color: '#ff9a4a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); end.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), D)); end.position.copy(E).addScaledVector(D, h.reach); this.hit.add(end);
    } else {
      // stopped by the plate: the blast splashes back off it
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.05, 0.55, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
      sp.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(UP, D.clone().negate())); sp.position.copy(E).addScaledVector(D, -0.3); this.hit.add(sp);
    }
    // The crew, shown plainly: a wounded man is marked with blood on and around him; a dead man is slumped over in his seat in a pool of it.
    // (Which man is hurt comes from the damage model; the blood itself is drawn for the eye and is not a measurement.)
    for (const id in this.byId) { const p = this.byId[id]; if (!p.c.crew) continue; const st = h.crew[id]; p.grp.rotation.set(0, 0, 0); if (st !== 'wounded' && st !== 'killed') continue;
      const dead = st === 'killed', r = p.c.r, at = new THREE.Vector3().fromArray(p.c.turret ? DMG.rot(p.c.p, -h.turA) : p.c.p), red = dead ? '#7a0606' : '#b00d0d', rnd = k => { const x = Math.sin((k + 1) * 127.1 + h.idx * 31.7 + id.length * 7.3) * 43758.5453; return x - Math.floor(x); };
      if (dead) p.grp.rotation.set(0.5, 0, 1.05);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r * (dead ? 1.9 : 1.0), 20), new THREE.MeshBasicMaterial({ color: red, side: THREE.DoubleSide })); pool.rotation.x = -Math.PI / 2; pool.position.set(at.x, at.y - r * 1.25, at.z); this.hit.add(pool);
      for (let k = 0; k < (dead ? 16 : 8); k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(r * (0.07 + rnd(k) * 0.13), 8, 6), new THREE.MeshBasicMaterial({ color: '#c81010' })); d.position.set(at.x + (rnd(k + 20) - 0.5) * r * 2.6, at.y + (rnd(k + 40) - 0.6) * r * 2.2, at.z + (rnd(k + 60) - 0.5) * r * 2.6); this.hit.add(d); }
    }
    // look from the side the hit came from, a little above (from straight above for an attack from the top)
    this.az = Math.atan2(-D.x, -D.z) + 0.75; this.el = h.top ? 0.75 : 0.36; this.dist = 13.5;
  }
  resize(w, h) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  render() {
    const c = this.cam, ce = Math.cos(this.el); c.position.set(Math.sin(this.az) * ce * this.dist, 1.5 + Math.sin(this.el) * this.dist, Math.cos(this.az) * ce * this.dist); c.lookAt(0, 1.5, 0);
    this.r.render(this.scene, c);
  }
  dispose() { for (const o of this.hit.children) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); } for (const x of this.own) x.dispose(); this.ghost.dispose(); this.r.dispose(); }
}
