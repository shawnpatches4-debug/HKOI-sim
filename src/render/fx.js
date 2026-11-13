// Particles: one pool of soft camera-facing sprites for smoke, dust, fire and flashes, updated on the CPU and drawn in one call.
import * as THREE from 'three';

function softTexture() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(0.7, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // break the perfect disc up a little so overlapping puffs read as billowing smoke
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, r = 18 + Math.random() * 34, s = 10 + Math.random() * 20, gg = x.createRadialGradient(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 0, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s); gg.addColorStop(0, 'rgba(255,255,255,.22)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.fillRect(0, 0, 128, 128); }
  const t = new THREE.CanvasTexture(c); return t; }

export class Particles {
  constructor(max = 6000) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.life = new Float32Array(max); this.age = new Float32Array(max); this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.rise = new Float32Array(max); this.glow = new Float32Array(max); this.a0 = new Float32Array(max);
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('pglow', new THREE.BufferAttribute(this.glow, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { map: { value: softTexture() }, scale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, sunColor: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `attribute vec4 pcolor; attribute float psize; attribute float pglow; varying vec4 vC; varying float vG; varying float vFog; uniform float scale; uniform float fogDensity;
        void main(){ vC = pcolor; vG = pglow; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(psize * scale / max(-mv.z, 0.1), scale * 0.55); float d = length(mv.xyz); vC.a *= smoothstep(psize * 0.25, psize * 1.4 + 2.0, d); vFog = 1.0 - exp(-fogDensity * fogDensity * d * d); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform vec3 sunColor; varying vec4 vC; varying float vG; varying float vFog;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vC.a; if (a < 0.004) discard; vec3 c = mix(vC.rgb * sunColor, vC.rgb * 3.0, vG); c = mix(c, fogColor, vFog * (1.0 - vG)); gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    this.mesh = new THREE.Points(geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
  }
  // o: { x, y, z, vx, vy, vz, size, grow (m/s), life (s), r, g, b, a, glow (0 smoke .. 1 fire), drag, rise }
  add(o) { if (this.n >= this.max) return; const i = this.n++; this.p[i * 3] = o.x; this.p[i * 3 + 1] = o.y; this.p[i * 3 + 2] = o.z; this.v[i * 3] = o.vx || 0; this.v[i * 3 + 1] = o.vy || 0; this.v[i * 3 + 2] = o.vz || 0; this.col[i * 4] = o.r; this.col[i * 4 + 1] = o.g; this.col[i * 4 + 2] = o.b; this.col[i * 4 + 3] = this.a0[i] = o.a == null ? 1 : o.a; this.size[i] = o.size || 1; this.grow[i] = o.grow || 0; this.life[i] = o.life || 1; this.age[i] = 0; this.drag[i] = o.drag || 0; this.rise[i] = o.rise || 0; this.glow[i] = o.glow || 0; }
  update(dt, wind) {
    const wx = wind ? wind.x : 0, wz = wind ? wind.z : 0; let i = 0;
    while (i < this.n) { this.age[i] += dt; if (this.age[i] >= this.life[i]) { const l = --this.n; if (i !== l) { for (const [arr, k] of [[this.p, 3], [this.v, 3], [this.col, 4]]) for (let q = 0; q < k; q++) arr[i * k + q] = arr[l * k + q]; for (const arr of [this.size, this.grow, this.life, this.age, this.drag, this.rise, this.glow, this.a0]) arr[i] = arr[l]; } continue; }
      const d = Math.exp(-this.drag[i] * dt), f = this.age[i] / this.life[i]; this.v[i * 3] = this.v[i * 3] * d + wx * (1 - d); this.v[i * 3 + 1] = this.v[i * 3 + 1] * d + this.rise[i] * dt; this.v[i * 3 + 2] = this.v[i * 3 + 2] * d + wz * (1 - d);
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt; this.size[i] += this.grow[i] * dt; this.col[i * 4 + 3] = this.a0[i] * (f < 0.1 ? f / 0.1 : 1 - (f - 0.1) / 0.9) ; this.glow[i] *= Math.exp(-dt * 2.5); i++; }
    this.geo.setDrawRange(0, this.n); for (const k of ['position', 'pcolor', 'psize', 'pglow']) this.geo.attributes[k].needsUpdate = true;
  }
  // ready-made effects. k scales the size: 1 is roughly an anti-tank warhead on open ground.
  explosion(x, y, z, k = 1, o = {}) {
    const R = Math.random, dirt = o.dirt == null ? 1 : o.dirt;
    this.add({ x, y: y + 0.5 * k, z, size: 7 * k, grow: 26 * k, life: 0.14, r: 1, g: 0.93, b: 0.75, a: 1, glow: 1 });   // the flash
    for (let i = 0; i < 16 * k; i++) { const a = R() * 6.283, e = R() * 1.3, s = (3 + R() * 7) * k; this.add({ x, y: y + 0.4, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1.5, vz: Math.sin(a) * Math.cos(e) * s, size: 1.6 * k, grow: 3.4 * k, life: 0.35 + R() * 0.35, r: 1, g: 0.62 + R() * 0.2, b: 0.22, a: 0.95, glow: 1, drag: 4 }); }   // fireball
    for (let i = 0; i < 22 * k; i++) { const a = R() * 6.283, e = 0.2 + R() * 1.2, s = (9 + R() * 22) * Math.sqrt(k); this.add({ x, y: y + 0.3, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s, size: 0.16 + R() * 0.16, life: 0.5 + R() * 0.9, r: 1, g: 0.75, b: 0.35, a: 1, glow: 1, drag: 0.6, rise: -9.8 }); }   // sparks and hot fragments
    for (let i = 0; i < 18 * k * dirt; i++) { const a = R() * 6.283, e = 0.6 + R() * 0.9, s = (5 + R() * 10) * Math.sqrt(k); this.add({ x, y: y + 0.2, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s, size: 0.7 * k, grow: 1.2 * k, life: 1.2 + R() * 1.2, r: 0.33, g: 0.28, b: 0.21, a: 0.85, drag: 0.8, rise: -9.8 }); }   // thrown earth
    for (let i = 0; i < 20 * k; i++) { const a = R() * 6.283, s = (0.6 + R() * 2.6) * k; this.add({ x: x + (R() - 0.5) * 1.6 * k, y: y + 0.4 + R() * 1.6 * k, z: z + (R() - 0.5) * 1.6 * k, vx: Math.cos(a) * s, vy: 1.4 + R() * 3.2 * k, vz: Math.sin(a) * s, size: 1.8 * k, grow: 1.1 * k, life: 5 + R() * 6, r: 0.13, g: 0.125, b: 0.12, a: 0.6, drag: 1.1, rise: 0.5 }); }   // dark smoke that rises and drifts
    if (dirt) for (let i = 0; i < 12 * k; i++) { const a = R() * 6.283, s = (3 + R() * 6) * k; this.add({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: 0.3 + R(), vz: Math.sin(a) * s, size: 1.4 * k, grow: 1.8 * k, life: 2.5 + R() * 2.5, r: 0.55, g: 0.49, b: 0.4, a: 0.32, drag: 2.2, rise: 0.1 }); }   // ring of dust along the ground
  }
  // an air burst: flash, a few sparks, a small grey puff; no earth
  airburst(x, y, z, k = 1) { const R = Math.random; this.add({ x, y, z, size: 3 * k, grow: 16 * k, life: 0.1, r: 1, g: 0.92, b: 0.7, a: 1, glow: 1 }); for (let i = 0; i < 10 * k; i++) { const a = R() * 6.283, e = (R() - 0.5) * 3, s = 8 + R() * 16; this.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s, size: 0.14, life: 0.3 + R() * 0.4, r: 1, g: 0.8, b: 0.4, a: 1, glow: 1, drag: 1, rise: -9.8 }); } for (let i = 0; i < 6 * k; i++) this.add({ x: x + (R() - 0.5) * k, y: y + (R() - 0.5) * k, z: z + (R() - 0.5) * k, vx: (R() - 0.5) * 3, vy: (R() - 0.5) * 2, vz: (R() - 0.5) * 3, size: 1.2 * k, grow: 1.4 * k, life: 2.5 + R() * 2, r: 0.3, g: 0.3, b: 0.3, a: 0.5, drag: 2 }); }
  dust(x, y, z, k = 1) { const R = Math.random; for (let i = 0; i < 10 * k; i++) { const a = R() * 6.283, s = 1 + R() * 3 * k; this.add({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: 0.4 + R() * 1.4, vz: Math.sin(a) * s, size: 1.2 * k, grow: 1.5 * k, life: 2.5 + R() * 2.5, r: 0.6, g: 0.54, b: 0.43, a: 0.3, drag: 1.8, rise: 0.15 }); } }
  // launch signature: backblast behind the tube and a puff at the muzzle
  backblast(x, y, z, dx, dz, k = 1) { const R = Math.random; this.add({ x, y, z, size: 2.5 * k, grow: 12, life: 0.1, r: 1, g: 0.9, b: 0.7, a: 1, glow: 1 }); for (let i = 0; i < 14 * k; i++) { const s = 6 + R() * 14, j = (R() - 0.5) * 0.7; this.add({ x, y: y + 0.2, z, vx: -(dx + j * dz) * s, vy: 0.3 + R() * 1.5, vz: -(dz - j * dx) * s, size: 1.1, grow: 2.6, life: 2.5 + R() * 3, r: 0.72, g: 0.69, b: 0.63, a: 0.42, drag: 2.4, rise: 0.2 }); } }
  // one puff of the HKOI obscurant: pale, dense, slow to thin. A faint cool tint keeps it readable against smoke and dust.
  cloud(x, y, z, k = 1) { const R = Math.random; for (let i = 0; i < 7; i++) this.add({ x: x + (R() - 0.5) * 2.4 * k, y: y + (R() - 0.5) * 2 * k, z: z + (R() - 0.5) * 2.4 * k, vx: (R() - 0.5) * 2.4, vy: (R() - 0.5) * 1.2, vz: (R() - 0.5) * 2.4, size: 2.6 * k, grow: 2.3 * k, life: 9 + R() * 6, r: 0.84, g: 0.89, b: 0.93, a: 0.5, drag: 2.4, rise: 0.04 }); this.add({ x, y, z, size: 1.6, grow: 9, life: 0.09, r: 0.9, g: 0.95, b: 1, a: 0.9, glow: 0.8 }); }
  trail(x, y, z) { this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.5, vy: 0.25, vz: (Math.random() - 0.5) * 0.5, size: 0.55, grow: 1.1, life: 2 + Math.random() * 1.2, r: 0.8, g: 0.8, b: 0.78, a: 0.3, drag: 1, rise: 0.1 }); }
  flash(x, y, z, k = 1) { this.add({ x, y, z, size: 3.5 * k, grow: 22 * k, life: 0.09, r: 1, g: 0.9, b: 0.6, a: 1, glow: 1 }); }
  // steady burning: call every frame with the elapsed time; makes flame and a tall smoke column
  burn(x, y, z, dt, k = 1) { const R = Math.random; if (R() < dt * 26) this.add({ x: x + (R() - 0.5) * 2.2 * k, y: y + R() * 0.8, z: z + (R() - 0.5) * 3 * k, vy: 2 + R() * 2.5, size: 1.1 * k, grow: 0.8, life: 0.5 + R() * 0.5, r: 1, g: 0.55 + R() * 0.2, b: 0.15, a: 0.9, glow: 1, drag: 0.5 }); if (R() < dt * 9) this.add({ x: x + (R() - 0.5) * 2 * k, y: y + 1.5, z: z + (R() - 0.5) * 2 * k, vx: (R() - 0.5), vy: 3 + R() * 2, vz: (R() - 0.5), size: 2 * k, grow: 1.5 * k, life: 9 + R() * 7, r: 0.07, g: 0.07, b: 0.07, a: 0.7, drag: 0.25, rise: 0.25 }); }
}

// Marks left on the ground: scorch and shallow craters, drawn as dark soft discs laid on the terrain. They stay for the whole battle.
export class GroundMarks {
  constructor(max = 240) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(12,10,8,.92)'); g.addColorStop(0.3, 'rgba(18,15,12,.8)'); g.addColorStop(0.62, 'rgba(30,25,20,.4)'); g.addColorStop(1, 'rgba(30,25,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, r0 = 14 + Math.random() * 18, r1 = 40 + Math.random() * 24; x.strokeStyle = 'rgba(15,12,10,.25)'; x.lineWidth = 1 + Math.random() * 2.5; x.beginPath(); x.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); x.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1); x.stroke(); }
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true }), max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.max = max; this.M = new THREE.Matrix4(); }
  // lay a mark at scene position (x, z) of radius r on a surface with height function h(x, z) -> y
  add(x, z, r, h) { const i = this.mesh.count < this.max ? this.mesh.count++ : Math.floor(Math.random() * this.max), y = h(x, z), sx = (h(x + 1, z) - h(x - 1, z)) / 2, sz = (h(x, z + 1) - h(x, z - 1)) / 2, n = new THREE.Vector3(-sx, 1, -sz).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.283)); this.M.compose(new THREE.Vector3(x, y + 0.06, z), q, new THREE.Vector3(r * 2, 1, r * 2)); this.mesh.setMatrixAt(i, this.M); this.mesh.instanceMatrix.needsUpdate = true; }
  clear() { this.mesh.count = 0; }
}
