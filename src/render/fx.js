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
        void main(){ vC = pcolor; vG = pglow; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * scale / max(-mv.z, 0.1); float d = length(mv.xyz); vFog = 1.0 - exp(-fogDensity * fogDensity * d * d); }`,
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
  // ready-made effects
  explosion(x, y, z, k = 1) { for (let i = 0; i < 26 * k; i++) { const a = Math.random() * 6.283, e = Math.random() * 1.2, s = (4 + Math.random() * 10) * k; this.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 2, vz: Math.sin(a) * Math.cos(e) * s, size: 2.5 * k, grow: 5 * k, life: 0.5 + Math.random() * 0.5, r: 1, g: 0.72, b: 0.35, a: 0.9, glow: 1, drag: 3 }); }
    for (let i = 0; i < 34 * k; i++) { const a = Math.random() * 6.283, s = (1 + Math.random() * 5) * k; this.add({ x: x + (Math.random() - 0.5) * 2 * k, y: y + Math.random() * 2 * k, z: z + (Math.random() - 0.5) * 2 * k, vx: Math.cos(a) * s, vy: 1 + Math.random() * 4 * k, vz: Math.sin(a) * s, size: 3 * k, grow: 2.2 * k, life: 4 + Math.random() * 5, r: 0.16, g: 0.15, b: 0.14, a: 0.75, drag: 1.2, rise: 0.6 }); } }
  dust(x, y, z, k = 1) { for (let i = 0; i < 14 * k; i++) { const a = Math.random() * 6.283, s = 1 + Math.random() * 4 * k; this.add({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: 0.5 + Math.random() * 2, vz: Math.sin(a) * s, size: 2 * k, grow: 2.5 * k, life: 3 + Math.random() * 3, r: 0.62, g: 0.55, b: 0.43, a: 0.5, drag: 1.5, rise: 0.2 }); } }
  cloud(x, y, z, k = 1) { for (let i = 0; i < 9; i++) this.add({ x: x + (Math.random() - 0.5) * 3 * k, y: y + (Math.random() - 0.5) * 3 * k, z: z + (Math.random() - 0.5) * 3 * k, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 3, size: 4 * k, grow: 3.2 * k, life: 9 + Math.random() * 5, r: 0.86, g: 0.87, b: 0.88, a: 0.6, drag: 2.2, rise: 0.05 }); }
  trail(x, y, z) { this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.6, vy: 0.3, vz: (Math.random() - 0.5) * 0.6, size: 0.9, grow: 1.6, life: 2.2 + Math.random(), r: 0.8, g: 0.8, b: 0.78, a: 0.4, drag: 1, rise: 0.1 }); }
  flash(x, y, z, k = 1) { this.add({ x, y, z, size: 9 * k, grow: 30 * k, life: 0.12, r: 1, g: 0.9, b: 0.6, a: 1, glow: 1 }); }
}
