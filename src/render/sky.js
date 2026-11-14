// The sky: colour from horizon to overhead, the sun (or moon) with its glow, drifting clouds lit from the sun's side,
// stars at night, and haze along the horizon that matches the fog on the ground. One big inside-out ball around the camera.
import * as THREE from 'three';
import { ENV, HAZE_GLSL } from './env.js';

// a small picture of smooth random values the cloud shapes are built from (made once, in code)
function noiseTexture(size = 256) {
  const d = new Uint8Array(size * size * 4); let a = 12345;
  const R = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < size * size; i++) { d[i * 4] = R() * 255; d[i * 4 + 1] = R() * 255; d[i * 4 + 2] = R() * 255; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}

const FRAG = /* glsl */`
  uniform sampler2D noise; uniform float time;
  uniform vec3 sunDir; uniform vec3 hkGlow; uniform vec3 fogCol;
  uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDisc; uniform float discSize; uniform vec3 sunHalo;
  uniform vec3 cloudLit; uniform vec3 cloudDark; uniform float cover; uniform float soft; uniform float cirrus; uniform float cloudSpeed; uniform float hazeTop; uniform float stars;
  varying vec3 vDir;
  ${HAZE_GLSL}
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return texture2D(noise, (i + f + 0.5) / 256.0).r; }
  float fbm(vec2 p){ float s = 0.0, a = 0.5;
    for (int i = 0; i < OCT; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0; a *= 0.5; }
    return s; }
  float fbm3(vec2 p){ return 0.5 * vnoise(p) + 0.25 * vnoise(mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0) + 0.125 * vnoise(mat2(0.56, 3.84, -3.84, 0.56) * p + 31.0); }
  float hash3(vec3 p){ p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
  void main(){
    vec3 dir = normalize(vDir); float y = dir.y, up = max(y, 0.0), sd = dot(dir, sunDir);
    vec3 col = mix(horizon, zenith, pow(up, 0.5));
    // the glow of the air around the sun, and the disc itself
    float s = max(sd, 0.0), s2 = s * s, s8 = s2 * s2 * s2 * s2, s64 = s8 * s8 * s8 * s8 * s8 * s8 * s8 * s8;
    col += sunHalo * (0.16 * s2 * s2 + 0.5 * s8 * s8 + 1.4 * s64 * s64 * s64 * s64);
    float disc = smoothstep(1.0 - discSize, 1.0 - discSize * 0.55, sd);
    // stars: sharp points on a fine grid of directions, each with its own brightness and a slow flicker
    if (stars > 0.0 && y > 0.0) { vec3 g = dir * 190.0, c = floor(g); float h = hash3(c), d = length(fract(g) - 0.5);
      col += stars * smoothstep(0.9965, 1.0, h) * smoothstep(0.34, 0.05, d) * (0.6 + 0.4 * sin(time * (1.0 + h * 3.0) + h * 40.0)) * vec3(0.9, 0.95, 1.1) * smoothstep(0.0, 0.25, y); }
    // clouds live on a flat layer far overhead; looking lower you see further along it
    float fade = smoothstep(0.015, 0.2, y);
    vec3 sky = col; float cl = 0.0;
    if (y > 0.0 && cover > 0.0) {
      vec2 cp = dir.xz / (y + 0.11) * 1.5 + vec2(time * cloudSpeed, time * cloudSpeed * 0.35);
      float base = fbm(cp + 3.0 * vec2(fbm3(cp * 0.4 + 9.0), fbm3(cp * 0.4 - 4.0)) * 0.35);
      float thr = 0.485 + (0.5 - cover) * 0.5, sf = 0.02 + soft * 0.3;
      float dens = smoothstep(thr - sf, thr + sf, base);
      /* light: thicker towards the sun means this spot is in the cloud's own shade */
      vec2 toSun = normalize(sunDir.xz + 1e-4) * 0.35;
      float shade = fbm3(cp + toSun + 3.0 * vec2(fbm3(cp * 0.4 + 9.0), fbm3(cp * 0.4 - 4.0)) * 0.35) / 0.875;
      float lit = clamp(0.62 + (base - shade) * 3.2 + (1.0 - dens) * 0.45, 0.0, 1.0);
      float thick = smoothstep(thr, thr + 0.22, base);
      vec3 cc = mix(cloudDark, cloudLit, lit * (1.0 - 0.45 * thick * cover));
      cc += sunHalo * (0.25 * s2 * s2 + 0.9 * s8 * s8) * (1.0 - thick * 0.75);   /* thin edges near the sun shine through */
      cl = dens * fade;
      col = mix(col, cc, cl);
      /* thin high streaks */
      if (cirrus > 0.0) { vec2 hp = dir.xz / (y + 0.25) * vec2(0.9, 2.0) + time * cloudSpeed * 0.2; float hc = smoothstep(0.5, 0.95, fbm3(hp) * 1.9) * fbm3(hp * 5.0 + 2.0); col = mix(col, cloudLit, hc * cirrus * fade * (1.0 - cl)); }
    }
    col += sunDisc * disc * (1.0 - cl * 0.97);
    // haze along the horizon, the same colour the ground fades into; below the horizon there is only haze
    float hz = exp(-up * hazeTop);
    vec3 haze = hkHaze(fogCol, hkGlow, sd);
    col = mix(col, haze, y > 0.0 ? hz : 1.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyDome {
  constructor() {
    this.uniforms = {
      noise: { value: noiseTexture() }, time: ENV.time, sunDir: ENV.sunDir, hkGlow: ENV.glow, fogCol: { value: new THREE.Color() },
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDisc: { value: new THREE.Color() }, discSize: { value: 0.00012 }, sunHalo: { value: new THREE.Color() },
      cloudLit: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() }, cover: { value: 0.4 }, soft: { value: 0.25 }, cirrus: { value: 0 }, cloudSpeed: { value: 0.004 }, hazeTop: { value: 9 }, stars: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, defines: { OCT: 5 },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`,   /* always at the far limit, centred on the camera */
      fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -10; this.mesh.name = 'sky';
  }
  // S: the sky part of a condition (see CONDITIONS in scene3d.js). Colours are written as [hex, brightness].
  set(S, fogHex) {
    const u = this.uniforms, c = (t, [hex, k]) => t.value.set(hex).multiplyScalar(k);
    c(u.zenith, S.zenith); c(u.horizon, S.horizon); c(u.sunDisc, S.disc); c(u.sunHalo, S.halo); c(u.cloudLit, S.cloudLit); c(u.cloudDark, S.cloudDark);
    u.fogCol.value.set(fogHex); u.cover.value = S.cover; u.soft.value = S.soft == null ? 0.25 : S.soft; u.cirrus.value = S.cirrus || 0; u.cloudSpeed.value = S.speed == null ? 0.004 : S.speed;
    u.hazeTop.value = S.hazeTop == null ? 9 : S.hazeTop; u.stars.value = S.stars || 0; u.discSize.value = S.discSize || 0.00012;
  }
  setOctaves(n) { if (this.material.defines.OCT !== n) { this.material.defines.OCT = n; this.material.needsUpdate = true; } }
}
