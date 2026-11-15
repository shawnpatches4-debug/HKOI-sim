// Two things a camera sees that a plain drawing misses, worked out from the depth of the finished picture (High and Ultra only):
//
//   contact shade : corners, the gap under a hull, the foot of a wall or a tree get darker because less of the sky reaches them.
//                   This is what makes a vehicle sit ON the ground instead of floating over it.
//   light shafts  : at a low sun the air between the camera and the land glows, and anything that stands in front of the sun
//                   (trees, a turret, a ridge) cuts dark streaks through that glow.
//
// Cost: one pass at half resolution (a handful of depth look-ups per pixel) and one at full resolution that lays the result
// over the picture before the glow and the film grade. No second drawing of the scene. Both are skipped in the thermal picture.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const COMMON = /* glsl */`
  uniform highp sampler2D tDepth; uniform vec4 proj;   /* tan(half the view) across and up, near, far */
  varying vec2 vUv;
  float lin(float d){ return proj.z * proj.w / (proj.w - d * (proj.w - proj.z)); }   /* metres in front of the camera */
  vec3 vpos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * proj.xy * z, -z); }
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;
const AIR = /* glsl */`
  ${COMMON}
  uniform vec2 px; uniform float radius; uniform float aoOn; uniform float aspect; uniform vec4 sun;   /* sun: where it is on the screen (uv), strength, tightness */
  void main(){
    float d = texture2D(tDepth, vUv).x, z = lin(d), ao = 1.0;
    if (aoOn > 0.5 && d < 0.99999 && z < AO_FAR) {
      vec3 P = vpos(vUv, z);
      /* which way the surface faces, from the nearer neighbour on each side (so edges do not get a false slope) */
      vec2 ex = vec2(px.x, 0.0), ey = vec2(0.0, px.y);
      float zl = lin(texture2D(tDepth, vUv - ex).x), zr = lin(texture2D(tDepth, vUv + ex).x), zd = lin(texture2D(tDepth, vUv - ey).x), zu = lin(texture2D(tDepth, vUv + ey).x);
      vec3 dx = abs(zl - z) < abs(zr - z) ? P - vpos(vUv - ex, zl) : vpos(vUv + ex, zr) - P;
      vec3 dy = abs(zd - z) < abs(zu - z) ? P - vpos(vUv - ey, zd) : vpos(vUv + ey, zu) - P;
      vec3 N = normalize(cross(dx, dy));
      float rad = min(radius, z * 0.3 + 0.08);   /* things right in front of the lens (the inside of the turret) are shaded over centimetres, not over a metre */
      float rr = min(rad / (z * proj.y * 2.0), 0.11), a0 = ign(gl_FragCoord.xy) * 6.2832, sum = 0.0, R2 = rad * rad;
      for (int i = 0; i < TAPS; i++) {
        float t = (float(i) + 0.5) / float(TAPS), r = sqrt(t) * rr, a = a0 + float(i) * 2.39996;
        vec2 uv = vUv + vec2(cos(a) / aspect, sin(a)) * r; float zs = lin(texture2D(tDepth, uv).x);
        vec3 v = vpos(uv, zs) - P; float vv = dot(v, v);
        sum += clamp((dot(v, N) / sqrt(vv + 1e-4) - 0.14) * 1.35, 0.0, 1.0) * clamp(1.0 - vv / R2, 0.0, 1.0);
      }
      ao = 1.0 - clamp(sum / float(TAPS) * 2.1, 0.0, 1.0);
      ao = mix(ao, 1.0, smoothstep(AO_FAR * 0.55, AO_FAR, z));
    }
    float sh = 0.0;
    if (sun.z > 0.0) {
      vec2 stp = (sun.xy - vUv) / float(RAYS); float j = ign(gl_FragCoord.xy + 31.0), acc = 0.0;
      for (int i = 0; i < RAYS; i++) {
        vec2 uv = vUv + stp * (float(i) + j), q = (uv - sun.xy) * vec2(aspect, 1.0);
        float open = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? 1.0 : step(0.99999, texture2D(tDepth, uv).x);   /* off the edge of the picture: taken as open sky */
        acc += open * exp(-dot(q, q) * sun.w);
      }
      sh = acc / float(RAYS) * mix(smoothstep(4.0, 160.0, z), 0.6, step(0.99999, d));   /* little air between the camera and something close; the sky has its own glow already */
    }
    gl_FragColor = vec4(ao, sh, 0.0, 1.0);
  }`;
const LAY = /* glsl */`
  ${COMMON}
  uniform sampler2D tDiffuse; uniform sampler2D tAir; uniform vec2 hpx; uniform float aoK; uniform vec3 shaftCol; uniform vec3 aoTint;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb; float d = texture2D(tDepth, vUv).x, z = lin(d);
    /* the half-size result is brought up to full size from the neighbours that lie at the same depth, so shade does not bleed across an outline */
    vec2 acc = vec2(0.0); float ws = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(i == 0 || i == 3 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0), uv = vUv + o * hpx;
      float zi = lin(texture2D(tDepth, uv).x), w = 1.0 / (0.03 + abs(zi - z) / z * 40.0);
      acc += texture2D(tAir, uv).xy * w; ws += w;
    }
    acc /= ws;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float ao = d >= 0.99999 ? 1.0 : mix(1.0, acc.x, aoK * (1.0 - smoothstep(2.5, 7.0, lum)));   /* never dim something that is itself a light (flame, flash) */
    c *= mix(aoTint, vec3(1.0), ao);
    c += shaftCol * acc.y;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class AirPass extends Pass {
  constructor(camera) {
    super(); this.camera = camera; this.needsSwap = true; this.ao = 1; this.shafts = 0; this.sunDir = new THREE.Vector3(0, 1, 0); this._v = new THREE.Vector3();
    this.half = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.air = new THREE.ShaderMaterial({ defines: { TAPS: 8, RAYS: 20, AO_FAR: '240.0' }, depthTest: false, depthWrite: false, vertexShader: VERT, fragmentShader: AIR,
      uniforms: { tDepth: { value: null }, proj: { value: new THREE.Vector4() }, px: { value: new THREE.Vector2() }, radius: { value: 1.3 }, aoOn: { value: 1 }, aspect: { value: 1 }, sun: { value: new THREE.Vector4(0.5, 0.5, 0, 5) } } });
    this.lay = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: VERT, fragmentShader: LAY,
      uniforms: { tDepth: { value: null }, proj: this.air.uniforms.proj, tDiffuse: { value: null }, tAir: { value: this.half.texture }, hpx: { value: new THREE.Vector2() }, aoK: { value: 0.9 }, shaftCol: { value: new THREE.Color(0, 0, 0) }, aoTint: { value: new THREE.Color(0.34, 0.37, 0.43) }   /* the deepest shade keeps about a third of its light, a little blue: thick grass and crops must not go black */ } });
    this.fsq = new FullScreenQuad(this.air);
  }
  // level 1 (High) or 2 (Ultra): how many depth look-ups each pixel gets
  setLevel(lv) { const taps = lv >= 2 ? 14 : 8, rays = lv >= 2 ? 32 : 20, d = this.air.defines; if (d.TAPS !== taps || d.RAYS !== rays) { d.TAPS = taps; d.RAYS = rays; this.air.needsUpdate = true; } }
  setSize(w, h) { const hw = Math.max(2, Math.ceil(w / 2)), hh = Math.max(2, Math.ceil(h / 2)); this.half.setSize(hw, hh); this.air.uniforms.px.value.set(1 / w, 1 / h); this.lay.uniforms.hpx.value.set(1 / hw, 1 / hh); this.air.uniforms.aspect.value = w / h; }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, A = this.air.uniforms, Lu = this.lay.uniforms, ty = Math.tan(cam.fov * Math.PI / 360), depth = readBuffer.depthTexture;
    A.proj.value.set(ty * cam.aspect, ty, cam.near, cam.far); A.tDepth.value = depth; Lu.tDepth.value = depth; Lu.tDiffuse.value = readBuffer.texture; A.aoOn.value = this.ao > 0 ? 1 : 0; Lu.aoK.value = this.ao;
    /* where the sun is on the screen; the shafts fade out as it leaves the picture and are off when it is behind the camera */
    let s = 0; const v = this._v.copy(this.sunDir).transformDirection(cam.matrixWorldInverse);
    if (this.shafts > 0 && v.z < -0.02) { const u = 0.5 + 0.5 * v.x / (-v.z) / (ty * cam.aspect), w = 0.5 + 0.5 * v.y / (-v.z) / ty, out = Math.max(Math.abs(u - 0.5), Math.abs(w - 0.5)); s = this.shafts * Math.min(1, Math.max(0, (-v.z - 0.02) / 0.25)) * Math.min(1, Math.max(0, (1.25 - out) / 0.6)); A.sun.value.set(u, w, s, 5.5); }
    if (s <= 0) A.sun.value.z = 0;
    const auto = renderer.autoClear; renderer.autoClear = false;
    this.fsq.material = this.air; renderer.setRenderTarget(this.half); this.fsq.render(renderer);
    this.fsq.material = this.lay; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsq.render(renderer);
    renderer.autoClear = auto;
  }
  dispose() { this.half.dispose(); this.air.dispose(); this.lay.dispose(); this.fsq.dispose(); }
}

// Does this graphics card hand back the depth of a smoothed picture correctly? Draws one flat sheet at a known depth into a small
// smoothed target, reads the depth back through a second small picture, and compares. If the answer is wrong (or anything throws)
// the scene does without the depth effects rather than risk a broken picture.
export function depthWorks(renderer, samples = 4) {
  let ok = false; const keep = renderer.getRenderTarget();
  try {
    const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, samples, depthTexture: new THREE.DepthTexture(8, 8) }), out = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: false });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sc = new THREE.Scene(), sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })); sheet.position.z = -0.25; sc.add(sheet);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam);
    const m = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { t: { value: rt.depthTexture } }, vertexShader: VERT, fragmentShader: 'uniform highp sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).x, 0.0, 0.0, 1.0); }' }), q = new FullScreenQuad(m);
    renderer.setRenderTarget(out); q.render(renderer);
    const buf = new Uint8Array(4); renderer.readRenderTargetPixels(out, 4, 4, 1, 1, buf);
    ok = Math.abs(buf[0] / 255 - 0.25) < 0.03 && renderer.getContext().getError() === 0;
    rt.dispose(); out.dispose(); m.dispose(); q.dispose(); sheet.geometry.dispose(); sheet.material.dispose();
  } catch (e) { ok = false; }
  renderer.setRenderTarget(keep); return ok;
}
