// Effects: smoke, dust, fire, sparks, flashes, tracers and flying debris, all drawn in ONE call.
//
// How it works. Every particle is a small camera-facing card. When it is created its start point, start speed, life, colour and
// kind are written once into a ring of fixed size; after that the graphics card works out where it is from the clock alone
// (start + speed with air drag, wind, buoyancy or gravity). Nothing is updated on the processor each frame, so sixty thousand
// particles cost the same there as none. The pictures (billowing smoke lit by the sun, flame that cools to smoke, streaks) are
// drawn by formula in the shader from one small noise picture made in code: no picture files.
//
// The clock is simulated time (the view of the engagement steps it), so effects keep pace with the battle at any speed and
// freeze on pause. Everything random comes from a seeded generator: call seed(n) with a number taken from the event itself
// and the same event always looks the same in a replay.
import * as THREE from 'three';

export const KIND = { SMOKE: 0, FIRE: 1, SPARK: 2, DEBRIS: 3, FLASH: 4, TRACER: 5 };
const STRIDE = 20, TAU = Math.PI * 2;
// how many particles each graphics level may keep alive, and how much each effect is thinned out
const BUDGET = { min: [9000, 0.3], low: [20000, 0.5], medium: [36000, 0.75], high: [60000, 1], auto: [36000, 0.75] };

// One small tiling noise picture (four different layers in the four colour channels), made in code.
let NOISE = null;
export function noiseTexture() {
  if (NOISE) return NOISE;
  const N = 128, d = new Uint8Array(N * N * 4);
  for (let ch = 0; ch < 4; ch++) {
    let s = 1234567 + ch * 7919;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const acc = new Float32Array(N * N);
    let amp = 1, tot = 0;
    for (let cells = 4; cells <= 32; cells *= 2) {
      const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rnd();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = x / N * cells, fy = y / N * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], e = g[y1 * cells + x1];
        acc[y * N + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy);
      }
      tot += amp; amp *= 0.55;
    }
    for (let i = 0; i < N * N; i++) d[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(acc[i] / tot * 255)));
  }
  NOISE = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping;
  NOISE.magFilter = THREE.LinearFilter; NOISE.minFilter = THREE.LinearMipmapLinearFilter; NOISE.generateMipmaps = true; NOISE.needsUpdate = true;
  return NOISE;
}

const VERT = /* glsl */`
attribute vec4 aP; attribute vec4 aV; attribute vec4 aC; attribute vec4 aS; attribute vec4 aK;
uniform float time; uniform float pix; uniform vec3 wind; uniform vec4 flare[3]; uniform float fogDensity;
varying vec2 vUv; varying vec4 vCol; varying vec4 vI; varying vec3 vFlare; varying float vFog; varying vec3 vSoft; varying float vHeat;
void main() {
  float age = time - aP.w, life = aV.w, f = age / life, kind = aK.x;
  vUv = position.xy; vCol = aC; vI = vec4(kind, aK.y, f, age); vFlare = vec3(0.0); vFog = 0.0; vSoft = vec3(0.0); vHeat = aK.z;
  if (age < 0.0 || f >= 1.0) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  vec3 p; vec3 vel; float k = aS.z;
  if (k < 0.0001) { p = aP.xyz + aV.xyz * age + vec3(0.0, 0.5 * aS.w * age * age, 0.0); vel = aV.xyz + vec3(0.0, aS.w * age, 0.0); }
  else { float wk = kind < 1.5 ? 1.0 : 0.0; vec3 vInf = vec3(wind.x * wk, aS.w / k, wind.z * wk); float e = exp(-k * age);
    p = aP.xyz + vInf * age + (aV.xyz - vInf) * (1.0 - e) / k; vel = vInf + (aV.xyz - vInf) * e; }
  if (kind > 1.5 && kind < 3.5 && p.y < aK.w) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }   /* sparks and clods stop at the ground */
  float g = 1.0 - (1.0 - f) * (1.0 - f), size = kind > 4.5 ? aS.x : mix(aS.x, aS.y, g);
  vec4 mv = viewMatrix * vec4(p, 1.0); float dist = length(mv.xyz), px = pix * max(-mv.z, 0.5);
  vec2 c = position.xy; vec2 off;
  if (kind > 4.5 || (kind > 1.5 && kind < 2.5)) {   /* tracers and sparks: a streak along the direction of flight */
    vec3 a3 = (viewMatrix * vec4(vel, 0.0)).xyz; float sp = length(a3), s2 = length(a3.xy); vec2 ax = s2 > 0.0001 ? a3.xy / s2 : vec2(1.0, 0.0);
    float w = max(size, px * (kind > 4.5 ? 2.2 : 1.4)), len = kind > 4.5 ? aS.y : clamp(sp * 0.03, size, size * 16.0);
    len = max(len * s2 / max(sp, 0.0001), w);
    off = ax * c.x * len * 0.5 + vec2(-ax.y, ax.x) * c.y * w * 0.5;
  } else { float s = size; if (kind > 2.5) s = max(s, px * (kind > 3.5 ? 3.0 : 1.6)); off = c * s * 0.5; }
  mv.xy += off; gl_Position = projectionMatrix * mv;
  if (kind < 1.5) vCol.a *= smoothstep(size * 0.2, size * 1.2 + 2.0, dist);   /* do not fill the screen when the camera sits inside a puff */
  vFog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  vSoft = vec3(p.y + (viewMatrix[0][1] * off.x + viewMatrix[1][1] * off.y), aK.w, size);
  for (int i = 0; i < 3; i++) { vec3 d = flare[i].xyz - p; vFlare += vec3(1.0, 0.72, 0.42) * flare[i].w / (1.0 + dot(d, d) / 500.0); }
}`;

const FRAG = /* glsl */`
uniform sampler2D noise; uniform vec3 fogColor; uniform vec3 sunColor; uniform vec3 sunV; uniform float thermal;
varying vec2 vUv; varying vec4 vCol; varying vec4 vI; varying vec3 vFlare; varying float vFog; varying vec3 vSoft; varying float vHeat;
vec3 toneOut(vec3 c) { gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  return gl_FragColor.rgb; }
void main() {
  float kind = vI.x, seed = vI.y, f = vI.z, age = vI.w, r = length(vUv);
  vec3 lit = vec3(0.0), emi = vec3(0.0); float a = 0.0;
  if (kind < 1.5) {   /* smoke, dust, and flame that cools into smoke */
    float ang = seed * 6.2832 + age * 0.22 * (fract(seed * 7.13) - 0.5), cs = cos(ang), sn = sin(ang);
    vec2 q = vec2(vUv.x * cs - vUv.y * sn, vUv.x * sn + vUv.y * cs) * 0.34 + vec2(seed * 13.7, seed * 7.3 - age * 0.018);
    vec4 n = texture2D(noise, q); float n2 = texture2D(noise, q * 2.6 + 0.37).g;
    float d = r + (n.r - 0.5) * 0.62 + (n2 - 0.5) * 0.3, m = smoothstep(1.0, 0.22, d);
    if (m < 0.004) discard;
    vec3 N = normalize(vec3(vUv + (vec2(n.b, n2) - 0.5) * 0.9, sqrt(max(0.04, 1.0 - r * r))));
    float sun = dot(N, sunV) * 0.5 + 0.5, fadeIn = smoothstep(0.0, 0.05, f), fadeOut = pow(1.0 - f, 1.25);
    float soft = smoothstep(vSoft.y - 0.05, vSoft.y + 0.3 * vSoft.z + 0.05, vSoft.x);
    a = vCol.a * m * fadeIn * fadeOut * soft;
    lit = vCol.rgb * (sunColor * (0.5 + 0.75 * sun) * (0.82 + 0.3 * n.a) + vFlare);
    lit = mix(lit, fogColor, vFog);
    if (thermal != 0.0) { lit = vec3(0.2 + 0.1 * sun); a *= 0.6; }
    if (kind > 0.5) {
      float h = clamp(1.0 - f / max(vHeat, 0.001), 0.0, 1.0), core = smoothstep(0.95, 0.0, d + (1.0 - h) * 0.35);
      vec3 fc = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.78, 0.4), h * h) * (1.2 + 5.0 * h);
      if (thermal != 0.0) fc = vec3(6.0);
      emi = fc * core * smoothstep(0.0, 0.25, h) * fadeIn * soft * (0.7 + 0.6 * n.r);
      a *= 1.0 - 0.85 * h;
    }
  } else if (kind < 2.5) {   /* spark: a hot streak */
    float m = (1.0 - smoothstep(0.2, 1.0, abs(vUv.y))) * (1.0 - smoothstep(0.5, 1.0, abs(vUv.x)));
    emi = (thermal != 0.0 ? vec3(1.0) : vCol.rgb) * vHeat * m * (1.0 - f) * vCol.a;
  } else if (kind < 3.5) {   /* flying earth, fragments, cartridge cases */
    float n = texture2D(noise, vUv * 0.21 + seed * 9.1).r; if (r + (n - 0.5) * 0.7 > 0.8) discard;
    a = vCol.a * (1.0 - smoothstep(0.85, 1.0, f));
    lit = vCol.rgb * (sunColor * (0.55 + 0.7 * n) + vFlare); lit = mix(lit, fogColor, vFog);
    if (thermal != 0.0) lit = vec3(0.3 + vHeat);
    emi = vCol.rgb * vHeat * (1.0 - f);
  } else if (kind < 4.5) {   /* flash: a bright core with a soft glow and a few rays */
    float ang = atan(vUv.y, vUv.x), rays = 0.5 + 0.5 * cos(ang * 5.0 + seed * 40.0) * cos(ang * 3.0 - seed * 17.0);
    float glow = exp(-r * r * 5.0) + 0.35 * exp(-r * 2.6) * (0.55 + 0.45 * rays);
    glow *= 1.0 - smoothstep(0.75, 1.0, r);
    emi = (thermal != 0.0 ? vec3(1.0) : vCol.rgb) * vHeat * glow * (1.0 - f) * (1.0 - f) * vCol.a;
  } else {   /* tracer: a bright core with a coloured glow, longer than it is wide */
    float across = abs(vUv.y), along = vUv.x, tail = smoothstep(-1.0, 0.6, along) * (1.0 - smoothstep(0.82, 1.0, along));
    float core = (1.0 - smoothstep(0.0, 0.3, across)) * tail, halo = (1.0 - smoothstep(0.1, 1.0, across)) * tail * 0.4;
    emi = (thermal != 0.0 ? vec3(1.0) : mix(vCol.rgb, vec3(1.0, 0.95, 0.85), core * 0.7)) * vHeat * (core + halo) * vCol.a * smoothstep(0.0, 0.02, f);
  }
  emi *= 1.0 - vFog * 0.7;
  vec3 L = toneOut(lit), E = toneOut(emi);
  gl_FragColor = vec4(L * a + E, a);
}`;

export class Particles {
  constructor(max = 12000) {
    const cap = this.capMax = Math.max(max, BUDGET.high[0]);
    this.cap = BUDGET.medium[0]; this.q = BUDGET.medium[1]; this.quality = 'medium';
    this.data = new Float32Array(cap * STRIDE); this.dies = new Float32Array(cap);
    this.head = 0; this.count = 0; this.time = 0; this.lastDeath = 0; this.lo = 1e9; this.hi = -1; this.wrapped = false;
    this.driven = false;   /* true once the view of the engagement steps the clock in simulated time */
    this.hold = false;     /* test hook: stop the clock so stills can be taken at exact moments */
    this.ground = null;    /* (x, z) -> height of the ground there; set by the view of the engagement */
    this._s = 12345; this._acc = { burn: 0, smoke: 0 };
    this.emitters = [];    /* fires and smoke columns that keep going: at most 10, the oldest is dropped */
    const geo = this.geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    const ib = this.ib = new THREE.InstancedInterleavedBuffer(this.data, STRIDE); ib.setUsage(THREE.DynamicDrawUsage);
    ['aP', 'aV', 'aC', 'aS', 'aK'].forEach((n, i) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(ib, 4, i * 4)));
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.NormalBlending, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        noise: { value: noiseTexture() }, time: { value: 0 }, pix: { value: 0.001 }, wind: { value: new THREE.Vector3() },
        flare: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, sunColor: { value: new THREE.Color(1, 1, 1) }, sunV: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
        thermal: { value: 0 }, scale: { value: 600 },   /* 'scale' is no longer used; the scene still sets it */
      },
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    this.sunW = new THREE.Vector3(0.3, 0.8, 0.5);
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      const u = this.mat.uniforms, h = renderer.getDrawingBufferSize(Particles._v2).y || 720;
      u.pix.value = 2 * Math.tan((camera.fov || 50) * Math.PI / 360) / h;
      u.sunV.value.copy(this.sunW).transformDirection(camera.matrixWorldInverse);
      if (this.lo <= this.hi) this._upload();
    };
  }
  // ---- the ring ---------------------------------------------------------------------------------------------------------
  setQuality(key) { const b = BUDGET[key] || BUDGET.medium; if (this.quality === key) return; this.quality = key; this.q = b[1]; if (b[0] !== this.cap) { this.cap = Math.min(b[0], this.capMax); this.clear(); } }
  clear() { this.head = 0; this.count = 0; this.lastDeath = 0; this.geo.instanceCount = 0; this.lo = 1e9; this.hi = -1; this.wrapped = false; this._acc.burn = 0; this._acc.smoke = 0; this.emitters.length = 0; }
  // number of particles alive now (counted only when somebody asks). Setting it to 0 clears everything, as the old pool allowed.
  get n() { let c = 0; for (let i = 0; i < this.count; i++) if (this.dies[i] > this.time) c++; return c; }
  set n(v) { if (!v) this.clear(); }
  _upload() {
    const ib = this.ib; ib.clearUpdateRanges();
    if (this.wrapped) ib.addUpdateRange(0, this.count * STRIDE); else ib.addUpdateRange(this.lo * STRIDE, (this.hi - this.lo + 1) * STRIDE);
    ib.needsUpdate = true; this.lo = 1e9; this.hi = -1; this.wrapped = false;
  }
  seed(n) { this._s = (Math.floor(n * 1000) ^ 0x9e3779b9) >>> 0 || 1; }
  R() { let t = this._s = (this._s + 0x6d2b79f5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  // how many particles an effect may use at this graphics level (never fewer than one)
  cnt(c) { const x = c * this.q, n = Math.floor(x); return Math.max(1, n + (this.R() < x - n ? 1 : 0)); }
  // the one way in: kind, start point, start speed, life, size at birth and at death, colour, strength (alpha), air drag, vertical
  // push (negative = gravity), heat (flame: share of the life spent glowing; sparks, flashes, tracers: brightness), delay before it appears
  spawn(kind, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, acc, heat, delay) {
    if (!(life > 0)) return;
    const i = this.head, o = i * STRIDE, d = this.data, t0 = this.time + (delay || 0);
    this.head = (i + 1) % this.cap; if (this.count < this.cap) this.count++;
    if (i < this.lo) this.lo = i; if (i > this.hi) this.hi = i; if (this.head === 0) this.wrapped = true;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = t0;
    d[o + 4] = vx; d[o + 5] = vy; d[o + 6] = vz; d[o + 7] = life;
    d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
    d[o + 12] = s0; d[o + 13] = s1; d[o + 14] = drag || 0; d[o + 15] = acc || 0;
    d[o + 16] = kind; d[o + 17] = this.R(); d[o + 18] = heat || 0; d[o + 19] = this.ground ? this.ground(x, z) : y - 1000;
    this.dies[i] = t0 + life; if (t0 + life > this.lastDeath) this.lastDeath = t0 + life;
    this.geo.instanceCount = this.count;
  }
  // the old way in, kept for callers that still use it: { x, y, z, vx, vy, vz, size, grow (m/s), life, r, g, b, a, glow, drag, rise }
  add(o) { const life = o.life || 1, s0 = o.size || 1; this.spawn(o.kind != null ? o.kind : o.glow ? KIND.FLASH : KIND.SMOKE, o.x, o.y, o.z, o.vx || 0, o.vy || 0, o.vz || 0, life, s0, s0 + (o.grow || 0) * life, o.r, o.g, o.b, o.a == null ? 1 : o.a, o.drag || 0, o.rise || 0, o.glow ? 5 : 0, o.delay || 0); }
  // Called by the scene every frame. Once the view of the engagement drives the clock (step), this only takes the wind.
  update(dt, wind) { if (wind) this.mat.uniforms.wind.value.set(wind.x || 0, 0, wind.z || 0); if (!this.driven) this.step(dt); }
  step(dt) {
    if (this.hold || !(dt > 0)) return;
    this.time += dt;
    if (this.count && !this.emitters.length && this.time > this.lastDeath + 0.5) { const t = this.time; this.clear(); this.time = t; }   /* everything has died: start the ring again */
    this.mat.uniforms.time.value = this.time;
    for (let i = this.emitters.length - 1; i >= 0; i--) { const e = this.emitters[i]; if (this.time > e.until) { this.emitters.splice(i, 1); continue; } this._emit(e, Math.min(dt, 0.5)); }
  }
  // take the sun, the explosion lights, the thermal picture and the graphics level from the scene (cheap; once a frame)
  sync(s) {
    const u = this.mat.uniforms; if (s.sunDir) this.sunW.copy(s.sunDir).normalize();
    if (s.flares) for (let i = 0; i < 3; i++) { const l = s.flares[i]; if (l) u.flare.value[i].set(l.position.x, l.position.y, l.position.z, Math.min(3, l.intensity / 450)); }
    u.thermal.value = s.thermal || 0; if (s.quality && BUDGET[s.quality]) this.setQuality(s.quality);
  }

  // ---- ready-made effects. k scales the size: 1 is roughly an anti-tank warhead on open ground. ---------------------------
  // a puff of smoke or dust
  puff(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1.2, rise = 0.2, delay = 0) { this.spawn(KIND.SMOKE, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, rise, 0, delay); }
  flash(x, y, z, k = 1, delay = 0) { this.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 0.09 + 0.02 * k, 3.5 * k, 16 * k, 1, 0.86, 0.6, 1, 0, 0, 9, delay); }
  // a ring of dust rolling outward over the ground
  dustRing(x, y, z, k = 1, speed = 9, col = null) {
    const n = this.cnt(22 * Math.sqrt(k)), a0 = this.R() * TAU, c = col || [0.6, 0.53, 0.42];
    for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU + (this.R() - 0.5) * 0.25, s = speed * (0.75 + this.R() * 0.5) * Math.sqrt(k);
      this.spawn(KIND.SMOKE, x + Math.cos(a) * 0.8 * k, y + 0.35 * k, z + Math.sin(a) * 0.8 * k, Math.cos(a) * s, 0.3 + this.R() * 0.5, Math.sin(a) * s, 2.6 + this.R() * 2.2, 1.2 * k, 5.5 * k, c[0], c[1], c[2], 0.34, 2.0, 0.12, 0, 0); }
  }
  dust(x, y, z, k = 1) {
    const n = this.cnt(7 * k);
    for (let i = 0; i < n; i++) { const a = this.R() * TAU, s = (0.6 + this.R() * 2.2) * Math.sqrt(k);
      this.spawn(KIND.SMOKE, x, y + 0.3, z, Math.cos(a) * s, 0.5 + this.R() * 1.4, Math.sin(a) * s, 2.8 + this.R() * 2.6, 0.9 * k, 4.2 * k, 0.61, 0.54, 0.43, 0.3, 1.8, 0.15, 0, 0); }
  }
  // sparks thrown in a cone about direction (dx, dy, dz); spread 0 = a jet, 1 = a hemisphere, 2 = every way
  sparks(x, y, z, dx, dy, dz, n, speed, spread = 1, life = 0.7, col = null, bright = 5) {
    const c = col || [1, 0.7, 0.32]; n = this.cnt(n);
    for (let i = 0; i < n; i++) { let ux = dx + (this.R() - 0.5) * 2 * spread, uy = dy + (this.R() - 0.5) * 2 * spread, uz = dz + (this.R() - 0.5) * 2 * spread; const l = Math.hypot(ux, uy, uz) || 1, s = speed * (0.35 + this.R() * 0.9) / l;
      this.spawn(KIND.SPARK, x, y, z, ux * s, uy * s, uz * s, life * (0.5 + this.R()), 0.07, 0.03, c[0], c[1] * (0.8 + this.R() * 0.3), c[2], 1, 0.9, -9.8, bright, 0); }
  }
  // lumps of earth or metal thrown up, falling back
  clods(x, y, z, n, speed, size, col, up = 1, heat = 0) {
    n = this.cnt(n);
    for (let i = 0; i < n; i++) { const a = this.R() * TAU, e = 0.5 + this.R() * 1.0 * up, s = speed * (0.4 + this.R() * 0.8);
      this.spawn(KIND.DEBRIS, x, y + 0.2, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, 2.5 + this.R() * 2, size * (0.5 + this.R()), size * 0.5, col[0], col[1], col[2], 1, 0.25, -9.8, heat, 0); }
  }
  // a ball of flame that cools into rolling smoke
  fireball(x, y, z, k, n, speed, life, smoke = [0.12, 0.115, 0.11], hot = 0.3, up = 1.5) {
    n = this.cnt(n);
    for (let i = 0; i < n; i++) { const a = this.R() * TAU, e = (this.R() - 0.25) * 1.5, s = speed * (0.3 + this.R() * 0.9);
      this.spawn(KIND.FIRE, x + Math.cos(a) * 0.4 * k, y + 0.5 * k + this.R() * 0.6 * k, z + Math.sin(a) * 0.4 * k, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.sin(a) * Math.cos(e) * s, life * (0.7 + this.R() * 0.6), 1.6 * k, 5.2 * k, smoke[0], smoke[1], smoke[2], 0.78, 2.6, 1.1, hot * (0.7 + this.R() * 0.6), 0); }
  }
  // a shell or warhead bursting on the ground: flash, fireball that turns to smoke, a fountain of earth, a dust ring, drifting smoke
  explosion(x, y, z, k = 1, o = {}) {
    const dirt = o.dirt == null ? 1 : o.dirt, soil = o.soil || [0.3, 0.25, 0.18];
    this.spawn(KIND.FLASH, x, y + 0.8 * k, z, 0, 0, 0, 0.12, 6 * k, 30 * k, 1, 0.9, 0.7, 1, 0, 0, 14, 0);
    this.fireball(x, y, z, k, 12 * k, 7 * Math.sqrt(k), 5.5, [0.13, 0.125, 0.12], 0.2);
    this.sparks(x, y + 0.4, z, 0, 0.8, 0, 26 * k, 26 * Math.sqrt(k), 1.3, 0.9);
    if (dirt > 0) {
      const n = this.cnt(14 * k * dirt);   /* the fountain: jets of earth thrown up that fall back */
      for (let i = 0; i < n; i++) { const a = this.R() * TAU, e = 0.75 + this.R() * 0.7, s = (8 + this.R() * 11) * Math.sqrt(k);
        this.spawn(KIND.SMOKE, x, y + 0.3, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, 1.5 + this.R() * 1.3, 0.9 * k, 3.6 * k, soil[0], soil[1], soil[2], 0.85, 1.5, -11, 0, 0); }
      this.clods(x, y, z, 26 * k * dirt, 17 * Math.sqrt(k), 0.22 * Math.sqrt(k), soil, 1);
      this.dustRing(x, y, z, k, 10);
    }
    const n2 = this.cnt(9 * k);   /* smoke that hangs and drifts off on the wind */
    for (let i = 0; i < n2; i++) { const a = this.R() * TAU, s = this.R() * 1.6 * k;
      this.spawn(KIND.SMOKE, x + Math.cos(a) * s, y + 0.8 + this.R() * 1.8 * k, z + Math.sin(a) * s, Math.cos(a) * 0.8, 1.2 + this.R() * 2.2, Math.sin(a) * 0.8, 9 + this.R() * 9, 2.2 * k, 9 * k, 0.2, 0.19, 0.18, 0.42, 0.9, 0.55, 0, 0.25); }
  }
  // a burst in the air: flash, a grey puff, fragments streaking away; those that go down kick dust off the ground
  airburst(x, y, z, k = 1, o = {}) {
    this.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 0.1, 3 * k, 16 * k, 1, 0.9, 0.68, 1, 0, 0, 10, 0);
    const n = this.cnt(7 * k), col = o.smoke || [0.3, 0.3, 0.3];
    for (let i = 0; i < n; i++) this.spawn(KIND.FIRE, x + (this.R() - 0.5) * k, y + (this.R() - 0.5) * k, z + (this.R() - 0.5) * k, (this.R() - 0.5) * 7, (this.R() - 0.5) * 5, (this.R() - 0.5) * 7, 3.5 + this.R() * 3, 1.1 * k, 4.6 * k, col[0], col[1], col[2], 0.6, 2.4, 0.1, 0.06, 0);
    this.sparks(x, y, z, 0, -0.25, 0, 22 * k, 60, 2, 0.5, [1, 0.8, 0.45], 4);
    if (this.ground) { const gy = this.ground(x, z), h = y - gy; if (h > 0.5 && h < 40) { const m = this.cnt(5 * k);
      for (let i = 0; i < m; i++) { const a = this.R() * TAU, d = h * (0.2 + this.R() * 1.1), gx = x + Math.cos(a) * d, gz = z + Math.sin(a) * d;
        this.spawn(KIND.SMOKE, gx, this.ground(gx, gz) + 0.2, gz, 0, 1.2, 0, 1.6 + this.R(), 0.4, 2.2, 0.58, 0.52, 0.42, 0.4, 2, 0.1, 0, Math.hypot(h, d) / 60); } } }
  }
  // launch signature of a shoulder or tripod launcher: flash, a jet of flame and smoke out of the back, dust kicked up behind, a puff at the muzzle
  backblast(x, y, z, dx, dz, k = 1) {
    this.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 0.12, 2.5 * k, 13 * k, 1, 0.88, 0.62, 1, 0, 0, 11, 0);
    const n = this.cnt(12 * k);
    for (let i = 0; i < n; i++) { const s = 9 + this.R() * 24, j = (this.R() - 0.5) * 0.55;
      this.spawn(KIND.FIRE, x - dx * 0.6, y + 0.1, z - dz * 0.6, -(dx + j * dz) * s, 0.4 + this.R() * 2.2, -(dz - j * dx) * s, 3 + this.R() * 3.5, 0.9 * k, 4.6 * k, 0.72, 0.7, 0.66, 0.5, 2.6, 0.25, 0.07, 0); }
    const m = this.cnt(9 * k);   /* dust lifted off the ground behind the tube */
    for (let i = 0; i < m; i++) { const d = 2 + this.R() * 7 * k, j = (this.R() - 0.5) * 0.6, gx = x - (dx + j * dz) * d, gz = z - (dz - j * dx) * d, gy = this.ground ? this.ground(gx, gz) : y - 1.2;
      this.spawn(KIND.SMOKE, gx, gy + 0.3, gz, -dx * (2 + this.R() * 4), 0.8 + this.R() * 1.6, -dz * (2 + this.R() * 4), 4 + this.R() * 4, 1.2 * k, 5.5 * k, 0.6, 0.54, 0.44, 0.36, 1.6, 0.15, 0, 0.03 + d * 0.012); }
    for (let i = 0; i < this.cnt(4 * k); i++) this.spawn(KIND.SMOKE, x + dx * 1.2, y, z + dz * 1.2, dx * (3 + this.R() * 5), 0.4 + this.R(), dz * (3 + this.R() * 5), 2.5 + this.R() * 2, 0.7 * k, 3.4 * k, 0.78, 0.77, 0.74, 0.4, 2.2, 0.2, 0, 0);
    this.sparks(x, y, z, -dx, 0.1, -dz, 8 * k, 30, 0.4, 0.35);
  }
  // the tank's main gun: a long tongue of flame, a ball of smoke rolling forward, and (dustRing, called by the app) dust off the ground
  muzzleBlast(x, y, z, dx, dy, dz, k = 1) {
    this.spawn(KIND.FLASH, x + dx * 1.5, y + dy * 1.5, z + dz * 1.5, 0, 0, 0, 0.11, 7 * k, 26 * k, 1, 0.86, 0.6, 1, 0, 0, 16, 0);
    const n = this.cnt(14 * k);
    for (let i = 0; i < n; i++) { const s = 12 + this.R() * 55, j = 0.16; this.spawn(KIND.FIRE, x, y, z, (dx + (this.R() - 0.5) * j) * s, (dy + (this.R() - 0.5) * j) * s + 0.5, (dz + (this.R() - 0.5) * j) * s, 2.8 + this.R() * 3, 1.0 * k, 5.2 * k, 0.5, 0.48, 0.45, 0.5, 3.2, 0.3, 0.09 + this.R() * 0.05, 0); }
    const px = -dz, pz = dx;   /* gas spilling sideways at the muzzle */
    for (let i = 0; i < this.cnt(8 * k); i++) { const sd = i % 2 ? 1 : -1, s = 4 + this.R() * 9; this.spawn(KIND.FIRE, x, y, z, px * sd * s + dx * 3, (this.R() - 0.3) * 3, pz * sd * s + dz * 3, 2 + this.R() * 2, 0.8 * k, 3.6 * k, 0.55, 0.53, 0.5, 0.42, 3, 0.25, 0.05, 0); }
    this.sparks(x, y, z, dx, dy, dz, 14 * k, 70, 0.22, 0.3, [1, 0.8, 0.5], 4);
  }
  // one 30 mm round leaving the weapon station: a small sharp flash, a wisp of smoke, the empty case thrown out to the side
  muzzle30(x, y, z, dx, dy, dz, sx, sz) {
    this.spawn(KIND.FLASH, x + dx * 0.5, y + dy * 0.5, z + dz * 0.5, 0, 0, 0, 0.07, 1.6, 5.5, 1, 0.85, 0.55, 1, 0, 0, 9, 0);
    for (let i = 0; i < this.cnt(3); i++) { const s = 4 + this.R() * 10; this.spawn(KIND.SMOKE, x, y, z, dx * s + (this.R() - 0.5) * 2, dy * s + 0.4, dz * s + (this.R() - 0.5) * 2, 1.4 + this.R() * 1.4, 0.35, 2.4, 0.66, 0.65, 0.63, 0.34, 3, 0.3, 0, 0); }
    this.sparks(x, y, z, dx, dy, dz, 4, 40, 0.18, 0.18, [1, 0.8, 0.5], 3);
    this.spawn(KIND.DEBRIS, x - dx * 1.3, y - dy * 1.3 - 0.1, z - dz * 1.3, sx * (2.5 + this.R() * 1.5) - dx, 1.6 + this.R() * 1.2, sz * (2.5 + this.R() * 1.5) - dz, 2.2, 0.09, 0.09, 0.85, 0.66, 0.26, 1, 0.3, -9.8, 0.25, 0);
  }
  // machine-gun muzzle flash
  mgFlash(x, y, z, dx, dy, dz, heavy) {
    this.spawn(KIND.FLASH, x + dx * 0.3, y + dy * 0.3, z + dz * 0.3, 0, 0, 0, 0.05, heavy ? 0.9 : 0.6, heavy ? 2.6 : 1.8, 1, 0.82, 0.5, 1, 0, 0, 7, 0);
    if (this.R() < 0.35) this.spawn(KIND.SMOKE, x, y, z, dx * 3, 0.4, dz * 3, 1.2, 0.2, 1.3, 0.7, 0.69, 0.67, 0.22, 3, 0.3, 0, 0);
  }
  // a tracer flying in a straight line from A to B in 'life' seconds. width and length in metres.
  tracer(x0, y0, z0, x1, y1, z1, life, r, g, b, width = 0.12, len = 9, bright = 6, delay = 0) {
    if (!(life > 0)) return; this.spawn(KIND.TRACER, x0, y0, z0, (x1 - x0) / life, (y1 - y0) / life, (z1 - z0) / life, life, width, len, r, g, b, 1, 0, 0, bright, delay);
  }
  // a bullet striking earth: a spurt of dust, now and then a tracer skipping off
  bulletStrike(x, y, z, k = 1, delay = 0, tr = null) {
    this.spawn(KIND.SMOKE, x, y + 0.1, z, (this.R() - 0.5) * 1.5, 2.2 + this.R() * 2.5 * k, (this.R() - 0.5) * 1.5, 1.1 + this.R() * 0.9, 0.25 * k, 1.9 * k, 0.6, 0.53, 0.42, 0.5, 2.6, -1.5, 0, delay);
    this.spawn(KIND.DEBRIS, x, y + 0.1, z, (this.R() - 0.5) * 5, 3 + this.R() * 4, (this.R() - 0.5) * 5, 1.5, 0.06, 0.04, 0.3, 0.26, 0.2, 1, 0.3, -9.8, 0, delay);
    if (tr) { const a = this.R() * TAU, e = 0.2 + this.R() * 0.9, s = 180 + this.R() * 160, l = 0.5 + this.R() * 0.6;
      this.spawn(KIND.TRACER, x, y + 0.2, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, l, 0.09, 5, tr[0], tr[1], tr[2], 0.8, 0.5, -9.8, 4, delay); }
  }
  // a warhead striking the vehicle: flash, sparks and spall thrown back the way it came, grey-black smoke
  vehicleHit(x, y, z, dx, dz, k = 1) {
    this.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 0.14, 5 * k, 24 * k, 1, 0.9, 0.7, 1, 0, 0, 15, 0);
    this.fireball(x, y, z, 0.8 * k, 10 * k, 6, 4.5, [0.1, 0.1, 0.1], 0.22, 2);
    this.sparks(x, y, z, -dx, 0.5, -dz, 60 * k, 34, 0.9, 1.0, [1, 0.74, 0.36], 6);
    this.sparks(x, y, z, 0, 1, 0, 24 * k, 20, 1.6, 1.4, [1, 0.6, 0.25], 5);
    this.clods(x, y, z, 14 * k, 12, 0.14, [0.16, 0.16, 0.15], 0.8, 0.5);
    for (let i = 0; i < this.cnt(8 * k); i++) this.spawn(KIND.SMOKE, x + (this.R() - 0.5) * 2, y + this.R() * 1.5, z + (this.R() - 0.5) * 2, (this.R() - 0.5) * 2, 1.5 + this.R() * 2.5, (this.R() - 0.5) * 2, 7 + this.R() * 7, 1.8 * k, 8 * k, 0.1, 0.1, 0.1, 0.5, 0.8, 0.6, 0, 0.15);
  }
  // ammunition or fuel going up after a kill: a jet of flame out of the roof, a shower of sparks, a ball of fire
  secondary(x, y, z, k = 1, delay = 0) {
    this.spawn(KIND.FLASH, x, y + 1, z, 0, 0, 0, 0.16, 6 * k, 26 * k, 1, 0.84, 0.55, 1, 0, 0, 14, delay);
    for (let i = 0; i < this.cnt(12 * k); i++) { const s = 8 + this.R() * 20; this.spawn(KIND.FIRE, x + (this.R() - 0.5), y + 0.5, z + (this.R() - 0.5), (this.R() - 0.5) * 5, s, (this.R() - 0.5) * 5, 3.5 + this.R() * 3, 1.3 * k, 6 * k, 0.07, 0.07, 0.07, 0.75, 1.8, 1.2, 0.3 + this.R() * 0.15, delay + this.R() * 0.25); }
    const n = this.cnt(70 * k);
    for (let i = 0; i < n; i++) { const a = this.R() * TAU, e = 0.5 + this.R() * 1.05, s = 12 + this.R() * 30; this.spawn(KIND.SPARK, x, y + 1, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, 1 + this.R() * 1.6, 0.09, 0.04, 1, 0.66 + this.R() * 0.2, 0.3, 1, 0.5, -9.8, 6, delay + this.R() * 0.5); }
  }
  // A fire that stays (flame at the base, a tall black column leaning with the wind) for 'dur' seconds, or with flame = false a
  // smoke column only. Kept in a short list; the scene's clock feeds them, at the same rate whatever the frame rate.
  fire(x, y, z, dur = 60, k = 1, flame = true) { if (this.emitters.length >= 10) this.emitters.shift(); this.emitters.push({ x, y, z, k, flame, until: this.time + dur, a: 0, b: 0, born: this.time }); }
  column(x, y, z, dur = 40, k = 1) { this.fire(x, y, z, dur, k, false); }
  _emit(e, dt) {
    const k = e.k, left = e.until - this.time, fade = left < 8 ? Math.max(0.15, left / 8) : 1;
    if (e.flame) { e.a += dt * 16 * this.q * fade; while (e.a >= 1) { e.a -= 1; this.spawn(KIND.FIRE, e.x + (this.R() - 0.5) * 2.4 * k, e.y + this.R() * 0.8, e.z + (this.R() - 0.5) * 3 * k, (this.R() - 0.5) * 1.2, 2.2 + this.R() * 3, (this.R() - 0.5) * 1.2, 0.7 + this.R() * 0.6, 1.5 * k, 0.5 * k, 0, 0, 0, 0, 0.6, 1.5, 1, 0); } }
    e.b += dt * (e.flame ? 5 : 3.2) * this.q * fade; const dark = e.flame ? 0.045 : 0.11;
    while (e.b >= 1) { e.b -= 1; this.spawn(KIND.SMOKE, e.x + (this.R() - 0.5) * 2 * k, e.y + 1.2, e.z + (this.R() - 0.5) * 2 * k, (this.R() - 0.5), 3.2 + this.R() * 2, (this.R() - 0.5), 16 + this.R() * 10, 2.2 * k, 13 * k, dark, dark, dark, e.flame ? 0.78 : 0.5, 0.22, 0.5, 0, 0); }
  }
  // steady burning: call every frame with the elapsed time; flame at the base and a tall black column that leans with the wind
  burn(x, y, z, dt, k = 1) {
    const A = this._acc; A.burn += dt * 16 * this.q; A.smoke += dt * 5.5 * this.q;
    while (A.burn >= 1) { A.burn -= 1; this.spawn(KIND.FIRE, x + (this.R() - 0.5) * 2.4 * k, y + this.R() * 0.8, z + (this.R() - 0.5) * 3 * k, (this.R() - 0.5) * 1.2, 2.2 + this.R() * 3, (this.R() - 0.5) * 1.2, 0.7 + this.R() * 0.6, 1.3 * k, 0.5 * k, 0, 0, 0, 0, 0.6, 1.5, 1, 0); }
    while (A.smoke >= 1) { A.smoke -= 1; this.spawn(KIND.SMOKE, x + (this.R() - 0.5) * 2 * k, y + 1.6, z + (this.R() - 0.5) * 2 * k, (this.R() - 0.5), 3.5 + this.R() * 2, (this.R() - 0.5), 16 + this.R() * 10, 2.2 * k, 13 * k, 0.045, 0.045, 0.045, 0.78, 0.22, 0.5, 0, 0); }
  }
  // the proximity fuze of an obscurant round going off: a small cold-white pop with a few fast streaks (the cloud itself is drawn
  // from the engine's own figures by the obscurant layer)
  cloudPop(x, y, z) {
    this.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 0.1, 2.2, 9, 0.85, 0.95, 1, 1, 0, 0, 7, 0);
    this.sparks(x, y, z, 0, 0, 0, 7, 26, 2, 0.3, [0.85, 0.95, 1], 3);
  }
  // Trophy's shot leaving its launcher: a sharp flash and a tight fan of fragments toward the threat, a ring of smoke at the launcher
  apsLaunch(x, y, z, dx, dy, dz) {
    this.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 0.08, 2.4, 9, 1, 0.92, 0.75, 1, 0, 0, 12, 0);
    this.sparks(x, y, z, dx, dy, dz, 46, 190, 0.1, 0.09, [1, 0.9, 0.7], 5);
    for (let i = 0; i < this.cnt(6); i++) { const s = 3 + this.R() * 8; this.spawn(KIND.SMOKE, x, y, z, dx * s + (this.R() - 0.5) * 5, dy * s + (this.R() - 0.5) * 3 + 0.5, dz * s + (this.R() - 0.5) * 5, 1.8 + this.R() * 1.6, 0.5, 3, 0.75, 0.74, 0.72, 0.4, 3, 0.3, 0, 0); }
  }
  // a missile broken up in the air: flash, burning pieces that carry on along its path (vx, vy, vz) and fall, a dark puff
  breakup(x, y, z, vx, vy, vz, k = 1) {
    this.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 0.11, 3.5 * k, 16 * k, 1, 0.9, 0.7, 1, 0, 0, 12, 0);
    const sp = Math.hypot(vx, vy, vz) || 1, n = this.cnt(9 * k);
    for (let i = 0; i < n; i++) { const c = 0.12 + this.R() * 0.4, j = sp * 0.12; this.spawn(KIND.FIRE, x, y, z, vx * c + (this.R() - 0.5) * j, vy * c + (this.R() - 0.5) * j + 2, vz * c + (this.R() - 0.5) * j, 1.6 + this.R() * 1.6, 0.7 * k, 2.6 * k, 0.15, 0.15, 0.15, 0.55, 1.6, -5, 0.55, 0); }
    for (let i = 0; i < this.cnt(26 * k); i++) { const c = 0.1 + this.R() * 0.55, j = sp * 0.16; this.spawn(KIND.SPARK, x, y, z, vx * c + (this.R() - 0.5) * j, vy * c + (this.R() - 0.5) * j + 3, vz * c + (this.R() - 0.5) * j, 0.8 + this.R() * 1.2, 0.1, 0.05, 1, 0.65 + this.R() * 0.2, 0.3, 1, 0.8, -9.8, 6, 0); }
    this.clods(x, y, z, 8 * k, sp * 0.12, 0.13, [0.2, 0.2, 0.19], 0.5, 0.6);
    for (let i = 0; i < this.cnt(6 * k); i++) this.spawn(KIND.SMOKE, x + (this.R() - 0.5) * k, y + (this.R() - 0.5) * k, z + (this.R() - 0.5) * k, vx * 0.03 + (this.R() - 0.5) * 4, (this.R() - 0.5) * 3, vz * 0.03 + (this.R() - 0.5) * 4, 4 + this.R() * 4, 1.2 * k, 6 * k, 0.16, 0.16, 0.16, 0.55, 2, 0.15, 0, 0);
  }
  // one puff of a missile's smoke trail
  trail(x, y, z, k = 1, c = 0.8) { this.spawn(KIND.SMOKE, x, y, z, (this.R() - 0.5) * 0.6, 0.15, (this.R() - 0.5) * 0.6, 3.2 + this.R() * 2.2 + k, 0.45 * k, (1.9 + this.R()) * k, c, c, c * 0.98, 0.34, 1, 0.12, 0, 0); }
  // old name kept for callers that still use it: the cloud is now drawn by the obscurant layer, so this is only the fuze pop
  cloud(x, y, z) { this.cloudPop(x, y, z); }
}
Particles._v2 = new THREE.Vector2();

// Marks left on the ground: scorch, shallow craters and track marks. A ring of fixed size: when it is full the oldest mark
// is reused, so a long battle never slows down. One draw call.
export const MARK = { SCORCH: 0, CRATER: 1, TRACK: 2 };
function markAtlas() {
  const S = 128, c = document.createElement('canvas'); c.width = S * 4; c.height = S; const x = c.getContext('2d');
  let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  { const g = x.createRadialGradient(64, 64, 0, 64, 64, 60); g.addColorStop(0, 'rgba(12,10,8,.9)'); g.addColorStop(0.3, 'rgba(18,15,12,.78)'); g.addColorStop(0.62, 'rgba(30,25,20,.4)'); g.addColorStop(1, 'rgba(30,25,20,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { const a = rnd() * TAU, r0 = 14 + rnd() * 18, r1 = 36 + rnd() * 22; x.strokeStyle = 'rgba(15,12,10,.25)'; x.lineWidth = 1 + rnd() * 2.5; x.beginPath(); x.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); x.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1); x.stroke(); } }
  { const o = S, g = x.createRadialGradient(o + 64, 64, 0, o + 64, 64, 60);   /* crater: dark bowl, a paler ring of thrown earth, streaks of spoil */
    g.addColorStop(0, 'rgba(10,8,6,.95)'); g.addColorStop(0.22, 'rgba(24,19,14,.9)'); g.addColorStop(0.3, 'rgba(96,82,62,.75)'); g.addColorStop(0.4, 'rgba(70,58,44,.6)'); g.addColorStop(0.7, 'rgba(40,33,26,.32)'); g.addColorStop(1, 'rgba(40,33,26,0)'); x.fillStyle = g; x.fillRect(o, 0, S, S);
    for (let i = 0; i < 46; i++) { const a = rnd() * TAU, r0 = 16 + rnd() * 8, r1 = 34 + rnd() * 24; x.strokeStyle = rnd() < 0.5 ? 'rgba(88,74,56,.3)' : 'rgba(18,14,10,.3)'; x.lineWidth = 1 + rnd() * 3; x.beginPath(); x.moveTo(o + 64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); x.lineTo(o + 64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1); x.stroke(); } }
  { const o = S * 2;   /* a length of track mark: pressed earth with the bars of the track across it */
    const g = x.createLinearGradient(o + 8, 0, o + 120, 0); g.addColorStop(0, 'rgba(34,28,22,0)'); g.addColorStop(0.18, 'rgba(34,28,22,.5)'); g.addColorStop(0.82, 'rgba(34,28,22,.5)'); g.addColorStop(1, 'rgba(34,28,22,0)'); x.fillStyle = g; x.fillRect(o + 8, 4, 112, 120);
    for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(16,13,10,.42)'; x.fillRect(o + 26, 8 + i * 15, 76, 6); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export class GroundMarks {
  constructor(max = 480, burns = 180) {   /* the first 'burns' places are for scorch and craters, the rest for track marks: neither pushes the other out */
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.kind = new Float32Array(max); geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.MeshBasicMaterial({ map: markAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
    mat.onBeforeCompile = sh => { sh.vertexShader = 'attribute float aKind;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.x = (vMapUv.x + aKind) * 0.25;'); };
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.max = max; this.burns = burns; this.next = 0; this.nextT = 0; this.used = 0;
    this.M = new THREE.Matrix4(); this.P = new THREE.Vector3(); this.N = new THREE.Vector3(); this.S = new THREE.Vector3(); this.Q = new THREE.Quaternion(); this.Q2 = new THREE.Quaternion(); this.UP = new THREE.Vector3(0, 1, 0);
    this.clear();
  }
  // lay a mark at scene position (x, z) of radius r on a surface with height function h(x, z) -> y.
  // o: { kind: MARK.*, rot: turn about the vertical in radians (default: taken from the position), len: length in metres (track marks) }
  add(x, z, r, h, o) {
    const kind = o && o.kind || 0; let i;
    if (kind === MARK.TRACK) { i = this.burns + this.nextT; this.nextT = (this.nextT + 1) % (this.max - this.burns); } else { i = this.next; this.next = (this.next + 1) % this.burns; }
    this.used++;
    const y = h(x, z), sx = (h(x + 1, z) - h(x - 1, z)) / 2, sz = (h(x, z + 1) - h(x, z - 1)) / 2;
    const rot = o && o.rot != null ? o.rot : ((x * 12.9898 + z * 78.233) % TAU);
    this.N.set(-sx, 1, -sz).normalize(); this.Q.setFromUnitVectors(this.UP, this.N).multiply(this.Q2.setFromAxisAngle(this.UP, rot));
    this.M.compose(this.P.set(x, y + 0.06, z), this.Q, this.S.set(r * 2, 1, o && o.len ? o.len : r * 2));
    this.mesh.setMatrixAt(i, this.M); this.kind[i] = kind; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.geometry.attributes.aKind.needsUpdate = true;
  }
  clear() { this.M.makeScale(0, 0, 0); for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this.M); this.mesh.instanceMatrix.needsUpdate = true; this.next = 0; this.nextT = 0; this.used = 0; }
}
