// The HKOI obscurant cloud, drawn from the engine's own figures.
//
// The engine models each burst round as a puff of obscurant: a ball that starts about 2 m across (s0), spreads by turbulent
// mixing (width squared grows by 2 K per second), drifts with the wind and may be washed out by rain. This layer draws exactly
// those puffs: same centres, same drift, same width, and an opacity that falls as the same mass is spread over a bigger ball.
// So when the picture shows the cloud thin or blown off the line, that is what the engine worked with.
//
// "Physically plausible but highlighted": each puff is a sun-lit billow like any smoke, plus a faint cool rim (and a touch of
// its own light) so that the cloud can always be told from dust and smoke, against sky or ground, by day, by night and in the
// thermal picture. One draw call; at most MAXP puffs (the oldest is reused).
import * as THREE from 'three';
import { noiseTexture } from './fx.js';

const MAXP = 96, LOBES_MAX = 5, STRIDE = 12, TAU = Math.PI * 2;
// the engine's figures for one round, read from its own settings (payload in grams x square metres blocked per gram). Looking straight through the middle of one puff of width sh the middle of one puff of width s
// the optical depth is 0.85 x 40 / (2 pi s2): 1.35 when it forms (about a quarter of the light gets through), 0.34 three seconds later.
// That is what is drawn: one puff alone is NOT a wall. It takes several on the same line to blind a missile, as the engine says.
const _hk = typeof window !== 'undefined' && window.HK && window.HK.defaultConfig ? window.HK.defaultConfig() : null, TAU_PUFF = (_hk ? _hk.obs.alpha_m2_per_g * _hk.rnd.payload_g : 0.85 * 75) / (2 * Math.PI * 4);
const LOBES = { min: 2, low: 3, medium: 4, high: 5, auto: 4 };
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const VERT = /* glsl */`
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;   /* aA: centre, half size.  aB: opacity, seed, age, ground height.  aC: strength of the highlight */
uniform float fogDensity;
varying vec2 vUv; varying vec4 vB; varying float vFog; varying vec2 vSoft; varying float vH;
void main() {
  vUv = position.xy; vB = aB;
  vec4 mv = viewMatrix * vec4(aA.xyz, 1.0); float dist = length(mv.xyz);
  vec2 off = position.xy * aA.w; mv.xy += off; gl_Position = projectionMatrix * mv;
  float nearFade = smoothstep(aA.w * 0.15, aA.w * 1.1 + 2.0, dist); vB.x *= nearFade; vH = aC.x * nearFade;
  vFog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  vSoft = vec2(aA.y + viewMatrix[1][0] * off.x + viewMatrix[1][1] * off.y, aA.w);
}`;
const FRAG = /* glsl */`
uniform sampler2D noise; uniform vec3 fogColor; uniform vec3 sunColor; uniform vec3 sunV; uniform float thermal; uniform float night; uniform vec3 tint;
varying vec2 vUv; varying vec4 vB; varying float vFog; varying vec2 vSoft; varying float vH;
vec3 toneOut(vec3 c) { gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  return gl_FragColor.rgb; }
void main() {
  float seed = vB.y, age = vB.z, r = length(vUv);
  float ang = seed * 6.2832 + age * 0.05 * (fract(seed * 7.13) - 0.5), cs = cos(ang), sn = sin(ang);
  vec2 q = vec2(vUv.x * cs - vUv.y * sn, vUv.x * sn + vUv.y * cs) * 0.3 + vec2(seed * 13.7, seed * 7.3 - age * 0.006);
  vec4 n = texture2D(noise, q); float n2 = texture2D(noise, q * 2.7 + 0.37).g;
  float d = r + (n.r - 0.5) * 0.8 + (n2 - 0.5) * 0.36, m = (1.0 - smoothstep(0.3, 1.0, d));
  if (m < 0.004) discard;
  vec3 N = normalize(vec3(vUv * 0.7 + (vec2(n.b, n2) - 0.5) * 1.5, sqrt(max(0.04, 1.0 - r * r))));
  float sun = dot(N, sunV) * 0.5 + 0.5, soft = smoothstep(vB.w - 0.05, vB.w + 0.3 * vSoft.y, vSoft.x);
  float a = vB.x * m * soft, edge = pow(m * (1.0 - m) * 4.0, 1.5);   /* edge: strongest in the soft fringe of the billow, 0 in the middle and outside */
  float sunL = max(max(sunColor.r, sunColor.g), sunColor.b);
  vec3 lit = vec3(0.86, 0.89, 0.92) * sunColor * (0.5 + 0.75 * sun) * (0.84 + 0.28 * n.a);
  lit = mix(lit, fogColor, vFog * 0.8);
  // the highlight: a cool tint in the soft fringe of each billow and a faint wash of the same colour inside it. It is an aid to the eye, not
  // part of the cloud: it stays readable while the real cloud thins, and carries a little light of its own after dark.
  float hA = vH * (edge * 0.36 + m * 0.1) * soft;
  vec3 hC = tint * (0.3 + 0.7 * min(1.0, sunL)) + tint * 0.5 * night;
  if (thermal != 0.0) { lit = vec3(0.3 + 0.12 * sun); hC = vec3(0.6); }
  vec3 L = toneOut(lit), H = toneOut(hC);
  gl_FragColor = vec4(L * a * (1.0 - hA) + H * hA, a + hA - a * hA);
}`;

export class ObscurantCloud {
  constructor() {
    this.puffs = []; this.next = 0; this.lobes = 4; this.live = 0;
    const n = MAXP * LOBES_MAX; this.data = new Float32Array(n * STRIDE); this.key = new Float32Array(n); this.order = []; for (let i = 0; i < n; i++) this.order.push(i);
    this.tmp = new Float32Array(n * STRIDE);
    const geo = this.geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    const ib = this.ib = new THREE.InstancedInterleavedBuffer(this.data, STRIDE); ib.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aA', new THREE.InterleavedBufferAttribute(ib, 4, 0)); geo.setAttribute('aB', new THREE.InterleavedBufferAttribute(ib, 4, 4)); geo.setAttribute('aC', new THREE.InterleavedBufferAttribute(ib, 4, 8)); geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, premultipliedAlpha: true, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { noise: { value: noiseTexture() }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, sunColor: { value: new THREE.Color(1, 1, 1) }, sunV: { value: new THREE.Vector3(0, 1, 0) }, thermal: { value: 0 }, night: { value: 0 }, tint: { value: new THREE.Color(0.22, 0.68, 0.96) } } });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    this.sunW = new THREE.Vector3(0, 1, 0);
    this.mesh.onBeforeRender = (r, s, camera) => { this.mat.uniforms.sunV.value.copy(this.sunW).transformDirection(camera.matrixWorldInverse); };
  }
  // A puff as the engine has it. t0: battle time it has formed; tb: battle time of the burst (it swells from nothing between the
  // two); x, y, z: scene position of its centre when formed; vx, vz: drift in m/s; s0: starting width (1 sigma, m); K: spreading
  // (m2/s); wash: washing out by rain (1/s); gy: height of the ground under it; id: any number, used for the shape
  add(p) { const q = this.puffs[this.next] || (this.puffs[this.next] = {}); Object.assign(q, p); q.on = true; this.next = (this.next + 1) % MAXP; }
  clear() { for (const p of this.puffs) p.on = false; this.next = 0; this.geo.instanceCount = 0; this.live = 0; }
  // width (1 sigma) and opacity of a puff at battle time t: the engine's own spreading law
  static state(p, t, out) {
    const age = t - p.t0;
    if (age < 0) { const f = Math.max(0, 1 - (p.t0 - t) / Math.max(0.05, p.t0 - p.tb)); out.sigma = p.s0 * (0.25 + 0.75 * f * (2 - f)); out.dens = 1; out.age = 0; out.f = f; return out; }
    const s2 = p.s0 * p.s0 + 2 * p.K * age; out.sigma = Math.sqrt(s2); out.dens = p.s0 * p.s0 / s2 * Math.exp(-(p.wash || 0) * age); out.age = age; out.f = 1; return out;
  }
  // centre of a puff at battle time t (scene coordinates)
  static centre(p, t, out) { const age = Math.max(0, t - p.t0); return out.set(p.x + p.vx * age, p.y, p.z + p.vz * age); }
  update(t, s) {
    const u = this.mat.uniforms, cam = s.camera.position, D = this.tmp, st = ObscurantCloud._st; let n = 0;
    this.lobes = LOBES[s.quality] || 4; u.thermal.value = s.thermal || 0; u.night.value = s.night ? 1 : 0; if (s.sunDir) this.sunW.copy(s.sunDir).normalize();
    if (s.fx) { u.fogColor.value.copy(s.fx.mat.uniforms.fogColor.value); u.fogDensity.value = s.fx.mat.uniforms.fogDensity.value; u.sunColor.value.copy(s.fx.mat.uniforms.sunColor.value); }
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i]; if (!p.on || t < p.tb) continue;
      ObscurantCloud.state(p, t, st); const op = 1 - Math.exp(-TAU_PUFF * st.dens), hl = Math.min(1, Math.sqrt(st.dens * 3)) * st.f;
      if (st.dens < 0.035 || st.age > 90) { p.on = false; continue; }
      const age = Math.max(0, t - p.t0), cx = p.x + p.vx * age, cz = p.z + p.vz * age, L = this.lobes, each = 1 - Math.pow(1 - op * st.f, 1 / Math.sqrt(L));
      for (let k = 0; k < L; k++) {
        const o = n * STRIDE, h1 = hash(p.id * 3.1 + k * 17.3), h2 = hash(p.id * 5.7 + k * 29.9), h3 = hash(p.id * 9.3 + k * 7.1);
        const off = k === 0 ? 0 : st.sigma * 1.1, a = h1 * TAU, e = (h2 - 0.5) * 1.6;
        const x = cx + Math.cos(a) * Math.cos(e) * off, y = Math.max(p.y + Math.sin(e) * off * 0.7, p.gy + st.sigma * 0.6), z = cz + Math.sin(a) * Math.cos(e) * off;
        D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = st.sigma * (k === 0 ? 2.4 : 1.5 + h3 * 0.7);
        D[o + 4] = each; D[o + 5] = h3; D[o + 6] = st.age; D[o + 7] = p.gy; D[o + 8] = hl; D[o + 9] = 0; D[o + 10] = 0; D[o + 11] = 0;
        const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z; this.key[n] = dx * dx + dy * dy + dz * dz; n++;
      }
    }
    this.live = n; this.geo.instanceCount = n; if (!n) return;
    // far puffs first, so that near ones are laid over them
    const ord = this.order, key = this.key; for (let i = 0; i < n; i++) ord[i] = i;
    for (let i = 1; i < n; i++) { const v = ord[i], kv = key[v]; let j = i - 1; while (j >= 0 && key[ord[j]] < kv) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = v; }
    const out = this.data; for (let i = 0; i < n; i++) { const a = ord[i] * STRIDE, b = i * STRIDE; for (let k = 0; k < STRIDE; k++) out[b + k] = D[a + k]; }
    this.ib.clearUpdateRanges(); this.ib.addUpdateRange(0, n * STRIDE); this.ib.needsUpdate = true;
  }
}
ObscurantCloud._st = { sigma: 0, dens: 0, age: 0, f: 0 };
