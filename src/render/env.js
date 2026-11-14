// Weather and atmosphere shared by every material: snow cover, wet ground, falling rain and snow, and the final colour grade.
import * as THREE from 'three';

// one set of uniforms that the ground, trees and roofs all read, so a change of weather reaches everything at once
export const ENV = { snow: { value: 0 }, wet: { value: 0 }, time: { value: 0 },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },     // towards the sun (or moon), in scene axes
  glow: { value: new THREE.Color(0, 0, 0) },         // how much the haze brightens when you look towards the sun
  wind: { value: new THREE.Vector3(1, 0, 0.3) } };   // wind direction on the ground (x, z) and strength (y unused)

// Haze that brightens towards the sun, for any standard material: the far ground, woods and roofs melt into the same glowing
// air the sky shows near the sun, instead of into one flat fog colour. The sky (sky.js) uses the same sum, so they meet cleanly.
export const HAZE_GLSL = `vec3 hkHaze(vec3 fogCol, vec3 glow, float towardSun){ float s = max(towardSun, 0.0), s2 = s * s, s8 = s2 * s2 * s2 * s2; return fogCol + glow * (0.22 * s2 + 0.78 * s8 * s8); }`;
export function atmosphere(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.hkSunDir = ENV.sunDir; sh.uniforms.hkGlow = ENV.glow;
    if (!/varying vec3 vWp;/.test(sh.vertexShader)) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    if (!/varying vec3 vWp;/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 hkSunDir; uniform vec3 hkGlow;\n' + HAZE_GLSL)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        { float hkF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, hkHaze(fogColor, hkGlow, dot(normalize(vWp - cameraPosition), hkSunDir)), hkF); }
      #endif`);
  };
  mat.customProgramCacheKey = () => 'hkatm' + (prevKey ? prevKey.call(mat) : '');
  return mat;
}

// Adds snow on upward faces and a wet darkening to any standard material. `amount` scales how readily snow settles on it.
export function weatherise(mat, amount = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uSnow = ENV.snow; sh.uniforms.uWet = ENV.wet;
    if (!/varying vec3 vWp;/.test(sh.vertexShader)) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    if (!/varying vec3 vWp;/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uSnow; uniform float uWet;
      float hkw_h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float hkw_n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hkw_h(i), hkw_h(i + vec2(1, 0)), f.x), mix(hkw_h(i + vec2(0, 1)), hkw_h(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      { vec3 wn = normalize(cross(dFdx(vWp), dFdy(vWp)));
        float patchy = hkw_n(vWp.xz * 0.05) * 0.6 + hkw_n(vWp.xz * 0.7) * 0.4;
        float cover = smoothstep(0.55 - uSnow * 0.75, 0.9 - uSnow * 0.6, wn.y * (0.75 + 0.5 * patchy)) * step(0.001, uSnow) * ${amount.toFixed(2)};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.96), clamp(cover, 0.0, 1.0));
        float puddle = uWet * smoothstep(0.55, 0.8, (hkw_n(vWp.xz * 0.21) * 0.7 + hkw_n(vWp.xz * 1.3) * 0.3) * wn.y);
        diffuseColor.rgb *= 1.0 - uWet * 0.32;
        roughnessFactor = mix(roughnessFactor, 0.3, puddle * 0.8) * (1.0 - uWet * 0.25); }`);
  };
  mat.customProgramCacheKey = () => 'hkw' + amount + (prev ? 'p' : '');
  return mat;
}

// The vehicle's finish: paint colour for the theatre, and dirt that builds up from the tracks upward. One set of values, set per battle.
export const FINISH = { tint: { value: new THREE.Color('#4a5238') }, amt: { value: 0 }, dirt: { value: new THREE.Color('#5a4a36') }, dirtAmt: { value: 0 }, ground: { value: 0 } };
export const FINISHES = {
  temperate: { tint: '#4c543a', amt: 0.55, dirt: '#5a4b37', dirtAmt: 0.45 },
  desert: { tint: '#b29c74', amt: 0.85, dirt: '#bda982', dirtAmt: 0.5 },
  mud: { tint: '#4c543a', amt: 0.55, dirt: '#3a3027', dirtAmt: 0.8 },
  winter: { tint: '#c4c5bd', amt: 0.6, dirt: '#8b8377', dirtAmt: 0.35 },   // whitewash over the base coat
};
export function setFinish(biome, cond) { const f = FINISHES[cond === 'snow' ? 'winter' : cond === 'rain' ? 'mud' : biome === 'desert' ? 'desert' : 'temperate']; FINISH.tint.value.set(f.tint); FINISH.amt.value = f.amt; FINISH.dirt.value.set(f.dirt); FINISH.dirtAmt.value = f.dirtAmt; }
// Apply to a vehicle material (after weatherise, which supplies the world position and the noise it uses).
export function vehicleFinish(mat) {
  weatherise(mat, 0.7); const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.uniforms.uFTint = FINISH.tint; sh.uniforms.uFAmt = FINISH.amt; sh.uniforms.uFDirt = FINISH.dirt; sh.uniforms.uFDirtAmt = FINISH.dirtAmt; sh.uniforms.uFGround = FINISH.ground;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uFTint; uniform float uFAmt; uniform vec3 uFDirt; uniform float uFDirtAmt; uniform float uFGround;').replace('#include <map_fragment>', `#include <map_fragment>
      { float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, uFTint * (0.62 + l * 2.6), uFAmt * smoothstep(0.02, 0.09, l));   // repaint, keeping the texture's light and dark; leave black rubber and glass alone
        float low = 1.0 - smoothstep(0.15, 1.9, vWp.y - uFGround), n = hkw_n(vWp.xz * 2.7) * 0.6 + hkw_n(vWp.xz * 9.0) * 0.4;
        diffuseColor.rgb = mix(diffuseColor.rgb, uFDirt * (0.8 + 0.4 * n), clamp(uFDirtAmt * (low * 1.1 + 0.18) * (0.5 + 0.9 * n), 0.0, 0.93)); }`); };
  mat.customProgramCacheKey = () => 'hkfinish'; return mat;
}

// Falling rain or snow: short streaks in a box that travels with the camera, wrapped in the shader so nothing is updated on the CPU.
export class Precipitation {
  constructor(count = 9000) {
    const pos = new Float32Array(count * 6), end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { const x = Math.random(), y = Math.random(), z = Math.random(); pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('end', new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: ENV.time, box: { value: new THREE.Vector3(70, 45, 70) }, vel: { value: new THREE.Vector3(2, -22, 1) }, streak: { value: 0.045 }, color: { value: new THREE.Color('#c9d3dc') }, alpha: { value: 0.35 } },
      vertexShader: `attribute float end; uniform float time; uniform vec3 box; uniform vec3 vel; uniform float streak; varying float vA;
        void main(){ vec3 p = position * box + vel * time; p = mod(p - cameraPosition, box) - box * 0.5 + cameraPosition; p += vel * streak * end; vec4 mv = viewMatrix * vec4(p, 1.0); vA = smoothstep(box.x * 0.5, box.x * 0.25, length(mv.xyz)) * (1.0 - end * 0.6); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float alpha; varying float vA; void main(){ gl_FragColor = vec4(color, alpha * vA); }` });
    this.mesh = new THREE.LineSegments(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 11; this.mesh.visible = false;
  }
  set(kind) {   // 'rain' | 'snow' | null
    this.mesh.visible = !!kind; const u = this.mat.uniforms;
    if (kind === 'rain') { u.vel.value.set(2.2, -10.5, 1.1); u.streak.value = 0.055; u.alpha.value = 0.2; u.color.value.set('#b9c4cf'); u.box.value.set(60, 40, 60); }
    if (kind === 'snow') { u.vel.value.set(1.4, -2.2, 0.6); u.streak.value = 0.03; u.alpha.value = 0.85; u.color.value.set('#ffffff'); u.box.value.set(50, 30, 50); }
  }
}

// The last pass: contrast, colour balance, vignette and film grain for a filmed look. All mild; set per condition.
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: ENV.time, tint: { value: new THREE.Color(1, 1, 1) }, shadowTint: { value: new THREE.Color(1, 1, 1) }, sat: { value: 1 }, contrast: { value: 1.06 }, vignette: { value: 0.35 }, grain: { value: 0.035 }, thermal: { value: 0 } },   /* thermal: 0 off, 1 white hot, -1 black hot */
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec3 tint; uniform vec3 shadowTint; uniform float sat; uniform float contrast; uniform float vignette; uniform float grain; uniform float thermal; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat); c = (c - 0.5) * contrast + 0.5; c *= mix(shadowTint, tint, smoothstep(0.0, 0.6, l));
      vec2 q = vUv - 0.5; c *= 1.0 - vignette * dot(q, q) * 1.6;
      // thermal imager: brightness only, stretched, with the coarse grain and faint line structure of an imager; white or black for hot
      if (thermal != 0.0) { float t = clamp(0.1 + l * 0.75 + smoothstep(0.5, 0.9, l) * 0.5, 0.0, 1.0);   /* the ground and trees stay grey; only what glows (crews, vehicles, fire) goes to white */ if (thermal < 0.0) t = 1.0 - t; t += (h(floor(vUv * vec2(640.0, 360.0)) + fract(time) * 19.0) - 0.5) * 0.07; t *= 0.96 + 0.04 * sin(vUv.y * 720.0 * 3.14159); c = vec3(t) * vec3(0.93, 1.0, 0.94); }
      c += (h(vUv * 911.0 + fract(time) * 37.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
};
