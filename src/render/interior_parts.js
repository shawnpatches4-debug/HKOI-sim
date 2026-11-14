// Building kit for the vehicle interior: paint and metal looks, the label sheet, the display and lamp materials, and a collector
// that welds hundreds of small shapes into a handful of meshes so the whole interior costs only a few draw calls.
//
// The interior has its own lighting (its dome lamps, the glow of its displays, daylight through open hatches and vision blocks):
// the sun and sky of the battlefield must not light the inside of a closed armoured box, so these materials ignore the scene's
// lights and take a short list of lamps instead.
//
// Seen from a seat, the interior must always be drawn in front of the vehicle's outside model (the hull roof under the turret would
// otherwise cover the basket floor). The materials do that by packing their depth into the very front of the depth range, with
// their own very short near distance, so consoles a hand's width from the eye are not cut away either.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const NLAMP = 8;        // lamps the interior shader takes
export const NIND = 48;        // indicator lights (small coloured lamps on the panels)

// kinds of surface: how shiny, and which worn pattern
export const K = { PAINT: 0.0, METAL: 0.25, RUBBER: 0.5, TREAD: 0.75, CLOTH: 1.0 };

// values every interior material shares (one object, so one update per frame reaches them all)
export const SHARED = {
  uInside: { value: 1 },                                   // 1 from a seat (drawn in front of the outside model), 0 in the cutaway
  uExpo: { value: 1 },                                     // undoes the outside exposure, so the inside looks the same in every weather
  uLampPos: { value: Array.from({ length: NLAMP }, () => new THREE.Vector3()) },
  uLampCol: { value: Array.from({ length: NLAMP }, () => new THREE.Vector3()) },
  uLampR: { value: new Float32Array(NLAMP).fill(1) },
  uAmb: { value: new THREE.Vector3(0.05, 0.05, 0.05) },
  uClip: { value: new THREE.Vector4(0, 1, 0, 0) },         // cutting plane of the cutaway view (world space)
  uClipOn: { value: 0 },
  uInd: { value: new Float32Array(NIND) },                 // brightness of each indicator light, 0 to 1
  uBack: { value: 0.35 },                                  // panel legend lighting
  uTime: { value: 0 },
};

const DEPTH_VS = /* glsl */`
  uniform float uInside;
  void cabDepth(in vec4 mv) {
    gl_Position = projectionMatrix * mv;
    // from a seat: own near distance NI and far distance FI, squeezed into the nearest fiftieth of the depth range, so that nothing of
    // the outside model can come in front of the interior (it shows only where the interior has an opening)
    if (uInside > 0.5) { float zv = -mv.z; const float NI = 0.03; const float FI = 40.0; const float E = 0.02; gl_Position.z = -zv + 2.0 * E * (zv - NI) * FI / (FI - NI); }
  }`;
const CLIP_FS = /* glsl */`
  uniform vec4 uClip; uniform float uClipOn;
  void cabClip(in vec3 w, in float shell) { if (uClipOn > 0.5 && shell > 0.5 && dot(w, uClip.xyz) + uClip.w > 0.0) discard; }`;

const VS = /* glsl */`
  attribute vec4 color;
  varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec3 vON; varying vec4 vC; varying vec2 vUv;
  ${DEPTH_VS}
  void main() {
    vec4 p = vec4(position, 1.0); vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
    #endif
    vO = p.xyz; vON = n; vC = color; vUv = uv;
    vec4 w = modelMatrix * p; vW = w.xyz; vN = normalize(mat3(modelMatrix) * n);
    cabDepth(viewMatrix * w);
  }`;

const FS = /* glsl */`
  uniform vec3 uLampPos[${NLAMP}]; uniform vec3 uLampCol[${NLAMP}]; uniform float uLampR[${NLAMP}];
  uniform vec3 uAmb; uniform float uExpo; uniform float uBack; uniform float uShell;
  uniform sampler2D uWear; uniform sampler2D uTread;
  #ifdef LABELS
    uniform sampler2D uAtlas;
  #endif
  varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec3 vON; varying vec4 vC; varying vec2 vUv;
  ${CLIP_FS}
  vec3 tri(sampler2D t, vec3 p, vec3 n, float s) {
    vec3 a = abs(n); a = a * a; a /= (a.x + a.y + a.z + 1e-4);
    return texture2D(t, p.zy * s).rgb * a.x + texture2D(t, p.xz * s).rgb * a.y + texture2D(t, p.xy * s).rgb * a.z;
  }
  void main() {
    cabClip(vW, uShell);
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vW);
    float kind = vC.a; vec3 alb = vC.rgb; float specK = 0.10; float shin = 18.0; float glow = 0.0;
    #ifdef LABELS
      vec4 t = texture2D(uAtlas, vUv); if (t.a < 0.45) discard; alb = t.rgb; specK = 0.05; glow = uBack * 0.22;
    #else
      vec3 w3 = tri(uWear, vO, vON, 1.6);
      if (kind < 0.12) { alb *= 0.62 + 0.5 * w3.r; alb = mix(alb, vec3(0.16, 0.14, 0.12), (1.0 - w3.g) * 0.55); specK = 0.10 + 0.10 * w3.b; shin = 14.0; }
      else if (kind < 0.37) { alb *= 0.7 + 0.45 * w3.r; specK = 0.55; shin = 38.0; }
      else if (kind < 0.62) { alb *= 0.8 + 0.3 * w3.r; specK = 0.03; shin = 6.0; }
      else if (kind < 0.87) { vec3 tr = tri(uTread, vO, vON, 5.0); alb *= 0.45 + 0.8 * tr.r; specK = 0.35 * tr.r; shin = 24.0; }
      else { alb *= 0.75 + 0.35 * w3.r; specK = 0.0; }
    #endif
    vec3 dif = uAmb; vec3 spc = vec3(0.0);
    float low = mix(0.62, 1.0, smoothstep(-1.1, 0.3, vO.y));   /* less light reaches the floor and the corners under the consoles */
    for (int i = 0; i < ${NLAMP}; i++) {
      vec3 L = uLampPos[i] - vW; float d = length(L); L /= max(d, 1e-3);
      float r = d / uLampR[i]; float att = 1.0 / (1.0 + 6.0 * r * r) * clamp(1.6 - r * 0.8, 0.0, 1.0);
      float ndl = dot(n, L); float wrap = clamp(ndl * 0.72 + 0.28, 0.0, 1.0);
      dif += uLampCol[i] * att * wrap;
      vec3 h = normalize(L + v); spc += uLampCol[i] * att * pow(max(dot(n, h), 0.0), shin) * step(0.0, ndl);
    }
    vec3 col = alb * dif * low + spc * specK * low + alb * glow;
    gl_FragColor = vec4(col * uExpo, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ---- generated pictures (canvas only: the hosting page allows no fetched data: or blob: files) ----
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }

// Worn paint. Red = brightness mottle, green = chips and scuffs (dark where the paint is gone), blue = how polished by hands and boots.
function wearTexture() {
  const N = 256, c = canvas(N, N), x = c.getContext('2d'), R = rnd(7);
  x.fillStyle = 'rgb(150,255,90)'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) { const px = R() * N, py = R() * N, r = 6 + R() * 26, v = 110 + R() * 90; x.fillStyle = `rgba(${v | 0},255,${(60 + R() * 120) | 0},0.07)`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); for (const [ox, oy] of [[N, 0], [-N, 0], [0, N], [0, -N]]) { x.beginPath(); x.arc(px + ox, py + oy, r, 0, 7); x.fill(); } }
  for (let i = 0; i < 70; i++) { const px = R() * N, py = R() * N, a = R() * 6.28, l = 4 + R() * 30; x.strokeStyle = `rgba(190,${(40 + R() * 120) | 0},160,${0.25 + R() * 0.4})`; x.lineWidth = 0.6 + R() * 1.2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  for (let i = 0; i < 120; i++) { const px = R() * N, py = R() * N; x.fillStyle = `rgba(120,${(R() * 90) | 0},200,${0.5 + R() * 0.4})`; x.beginPath(); x.ellipse(px, py, 0.8 + R() * 2.6, 0.6 + R() * 1.6, R() * 3, 0, 7); x.fill(); }
  for (let i = 0; i < 26; i++) { const px = R() * N, py = R() * N; x.fillStyle = `rgba(90,235,60,${0.10 + R() * 0.12})`; x.fillRect(px, py, 1 + R() * 3, 20 + R() * 60); }   /* runs of grime */
  return tex(c, true);
}
// Anti-slip floor plate: raised diamonds.
function treadTexture() {
  const N = 128, c = canvas(N, N), x = c.getContext('2d'), R = rnd(3); x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, N, N);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { x.save(); x.translate(i * 16 + 8, j * 16 + 8); x.rotate((i + j) % 2 ? 0.78 : -0.78); x.fillStyle = '#d8d8d8'; x.fillRect(-5.5, -1.6, 11, 3.2); x.fillStyle = '#ffffff'; x.fillRect(-4.5, -0.8, 9, 1); x.restore(); }
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(30,26,22,${0.05 + R() * 0.14})`; x.beginPath(); x.arc(R() * N, R() * N, 3 + R() * 12, 0, 7); x.fill(); }
  return tex(c, true);
}

let _wear = null, _tread = null;
// The painted-and-worn material every solid part of the interior uses. shell = true for the walls, roof and hull tub (the parts
// the cutaway view slices away); labels = the label sheet for the mesh that carries the placards.
export function cabMaterial({ shell = false, labels = null, side = THREE.FrontSide } = {}) {
  _wear = _wear || wearTexture(); _tread = _tread || treadTexture();
  const u = { ...SHARED, uWear: { value: _wear }, uTread: { value: _tread }, uShell: { value: shell ? 1 : 0 } };
  if (labels) u.uAtlas = { value: labels };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, side, defines: labels ? { LABELS: 1 } : {} });
}

// Glass of a display. map = what the interior draws on it (legends, reticle, numbers); live = an optional picture of the outside
// rendered each frame; mode 0 colour picture, 1 green one-colour picture, -1 the same with light and dark swapped.
export function screenMaterial(map, live = null) {
  const u = { uInside: SHARED.uInside, uExpo: SHARED.uExpo, uClip: SHARED.uClip, uClipOn: SHARED.uClipOn, uTime: SHARED.uTime,
    uMap: { value: map }, uLive: { value: live }, uHasLive: { value: live ? 1 : 0 }, uBright: { value: 1 }, uMode: { value: 1 }, uGain: { value: 1 }, uTint: { value: new THREE.Vector3(0.55, 1.0, 0.62) } };
  return new THREE.ShaderMaterial({ uniforms: u,
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; ${DEPTH_VS}
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; cabDepth(viewMatrix * w); }`,
    fragmentShader: /* glsl */`uniform sampler2D uMap; uniform sampler2D uLive; uniform float uHasLive; uniform float uBright; uniform float uMode; uniform float uGain; uniform float uExpo; uniform float uTime; uniform vec3 uTint;
      varying vec2 vUv; varying vec3 vW; ${CLIP_FS}
      void main() {
        cabClip(vW, 0.0);
        vec3 c = vec3(0.004, 0.008, 0.006);
        if (uHasLive > 0.5) {
          vec3 l = texture2D(uLive, vUv).rgb * uGain; l = l / (l + vec3(0.6));
          if (abs(uMode) > 0.5) { float g = dot(l, vec3(0.3, 0.55, 0.15)); g = smoothstep(0.02, 0.85, g); if (uMode < 0.0) g = 1.0 - g; l = uTint * g; }
          c = l * (0.92 + 0.08 * sin(vUv.y * 420.0));
        }
        vec4 o = texture2D(uMap, vUv); c = mix(c, o.rgb, o.a);
        gl_FragColor = vec4(c * uBright * 1.25 * uExpo, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}

// Indicator lights: every small lamp on every panel is one welded mesh; each lamp has a number and the shader looks up how bright it is.
export function lampMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { uInside: SHARED.uInside, uExpo: SHARED.uExpo, uInd: SHARED.uInd, uClip: SHARED.uClip, uClipOn: SHARED.uClipOn },
    vertexShader: /* glsl */`attribute vec4 color; uniform float uInd[${NIND}]; varying vec3 vC; varying float vOn; varying vec3 vW; ${DEPTH_VS}
      void main() { int i = int(color.a + 0.5); vOn = uInd[i]; vC = color.rgb; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; cabDepth(viewMatrix * w); }`,
    fragmentShader: /* glsl */`uniform float uExpo; varying vec3 vC; varying float vOn; varying vec3 vW; ${CLIP_FS}
      void main() { cabClip(vW, 0.0); vec3 c = vC * (0.035 + 2.4 * vOn) + vec3(vOn * vOn * 0.5);
        gl_FragColor = vec4(c * uExpo, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}

// Dirty glass of a vision block: a faint streaked film in front of the real world outside.
export function glassMaterial() {
  const c = canvas(128, 64), x = c.getContext('2d'), R = rnd(11); x.clearRect(0, 0, 128, 64);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(205,215,200,${0.03 + R() * 0.07})`; x.fillRect(R() * 128, 0, 1 + R() * 5, 64); }
  for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(60,55,45,${0.08 + R() * 0.15})`; x.beginPath(); x.arc(R() * 128, R() * 64, 0.5 + R() * 1.6, 0, 7); x.fill(); }
  const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(120,150,140,0.20)'); g.addColorStop(0.3, 'rgba(120,150,140,0.03)'); g.addColorStop(1, 'rgba(120,150,140,0.12)'); x.fillStyle = g; x.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.ShaderMaterial({ uniforms: { uInside: SHARED.uInside, uMap: { value: t }, uExpo: SHARED.uExpo, uDay: { value: new THREE.Vector3(1, 1, 1) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec2 vUv; ${DEPTH_VS} void main() { vUv = uv; cabDepth(modelViewMatrix * vec4(position, 1.0)); }`,
    fragmentShader: /* glsl */`uniform sampler2D uMap; uniform vec3 uDay; varying vec2 vUv;
      void main() { vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(t.rgb * uDay, t.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}

// ---- the label sheet: every placard and stencil is drawn once into one picture ----
export class Labels {
  constructor(size = 2048) { this.c = canvas(size, size); this.x = this.c.getContext('2d'); this.size = size; this.px = 4; this.py = 4; this.rowH = 0; this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8; this.cache = new Map(); this.full = false; }
  // style: 'plate' (dark letters on a cream plate), 'panel' (white letters engraved on black), 'warn' (black on yellow),
  // 'danger' (white on red), 'stencil' (letters only, straight on the paint), 'cyan' (the HKOI panel's own colour)
  // Returns { u0, v0, u1, v1, aspect }; lines are separated by \n.
  add(text, style = 'plate', opts = {}) {
    const key = style + '|' + text + '|' + (opts.color || '') + '|' + (opts.size || ''); if (this.cache.has(key)) return this.cache.get(key);
    const x = this.x, lines = String(text).split('\n'), fs = opts.size || 30, font = `700 ${fs}px "DIN Alternate", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; x.font = font;
    const pad = style === 'stencil' ? 4 : 10, tw = Math.ceil(Math.max(...lines.map(l => x.measureText(l).width))) + pad * 2, th = Math.ceil(lines.length * fs * 1.12 + pad * 1.6);
    if (this.px + tw + 4 > this.size) { this.px = 4; this.py += this.rowH + 4; this.rowH = 0; }
    if (this.py + th + 4 > this.size) { this.full = true; const r = { u0: 0, v0: 0, u1: 0.01, v1: 0.01, aspect: tw / th }; this.cache.set(key, r); return r; }
    const X = this.px, Y = this.py; const S = { plate: ['#d9d5bf', '#1d1e1a', '#8d8a78'], panel: ['#0c0d0e', '#e9ebe6', '#55585a'], warn: ['#d9a81c', '#111111', '#111111'], danger: ['#a4160f', '#ffffff', '#ffffff'], cyan: ['#0d1a1c', '#7ff0e6', '#2c6f6a'], stencil: [null, opts.color || '#23241f', null], amber: ['#141006', '#ffb020', '#6b4a10'] }[style] || [null, '#111', null];
    if (S[0]) { x.fillStyle = S[0]; x.fillRect(X, Y, tw, th); x.strokeStyle = S[2]; x.lineWidth = 2; x.strokeRect(X + 2, Y + 2, tw - 4, th - 4); }
    x.fillStyle = S[1]; x.font = font; x.textBaseline = 'middle'; x.textAlign = 'center';
    lines.forEach((l, i) => x.fillText(l, X + tw / 2, Y + pad * 0.8 + fs * 0.56 + i * fs * 1.12));
    if (style === 'plate') { x.fillStyle = 'rgba(60,50,30,0.10)'; for (let i = 0; i < 6; i++) x.fillRect(X + ((i * 37 + tw * 0.3) % tw), Y + ((i * 13) % th), 3 + (i % 3) * 3, 1); }   /* a little wear on the plate */
    this.px += tw + 4; this.rowH = Math.max(this.rowH, th); this.tex.needsUpdate = true;
    const r = { u0: X / this.size, v0: 1 - (Y + th) / this.size, u1: (X + tw) / this.size, v1: 1 - Y / this.size, aspect: tw / th }; this.cache.set(key, r); return r;
  }
}

// ---- the collector ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
export class Kit {
  // rec: one entry for every solid box, cylinder or ball (its place and size), kept for the overlap check in tests/interior; tag names the assembly it belongs to
  constructor(labels) { this.b = new Map(); this.labels = labels; this.frame = new THREE.Matrix4(); this.stack = []; this.tris = 0; this.rec = []; this.tag = 'misc'; this._solid = false; }
  // work inside a moved and turned frame (a console, a seat): everything added until pop() is placed relative to it
  push(x, y, z, rx = 0, ry = 0, rz = 0) { this.stack.push(this.frame.clone()); _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(1, 1, 1)); this.frame.multiply(_m); return this; }
  pop() { this.frame.copy(this.stack.pop()); return this; }
  // where a point of the current frame lies in the group (for controls and lamps that are placed with the same numbers)
  at(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.frame); }
  quat(out = new THREE.Quaternion()) { return out.setFromRotationMatrix(this.frame); }
  // add any geometry: bucket name, colour [hex, kind], place and turn
  geo(bucket, g, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    g = g.index ? g.toNonIndexed() : g.clone();   /* every piece in the same plain form, so they can be welded */
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)); _m.premultiply(this.frame);
    if (this._solid) { g.computeBoundingBox(); this.rec.push({ tag: this.tag, bucket, m: _m.clone(), c: g.boundingBox.getCenter(new THREE.Vector3()), h: g.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5) }); this._solid = false; }
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, a = new Float32Array(n * 4); _c.setHex(col[0], THREE.SRGBColorSpace); for (let i = 0; i < n; i++) { a[i * 4] = _c.r; a[i * 4 + 1] = _c.g; a[i * 4 + 2] = _c.b; a[i * 4 + 3] = col[1]; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 4)); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!this.b.has(bucket)) this.b.set(bucket, []); this.b.get(bucket).push(g); this.tris += (g.index ? g.index.count : n) / 3; return this;
  }
  box(b, w, h, d, col, x, y, z, rx, ry, rz) { this._solid = true; return this.geo(b, new THREE.BoxGeometry(w, h, d), col, x, y, z, rx, ry, rz); }
  // cylinder along the y axis unless turned; seg sides
  cyl(b, r0, r1, len, col, x, y, z, rx, ry, rz, seg = 12, open = false) { this._solid = !open; return this.geo(b, new THREE.CylinderGeometry(r0, r1, len, seg, 1, open), col, x, y, z, rx, ry, rz); }
  ball(b, r, col, x, y, z, sx = 1, sy = 1, sz = 1) { this._solid = true; return this.geo(b, new THREE.SphereGeometry(r, 10, 7), col, x, y, z, 0, 0, 0, sx, sy, sz); }
  ring(b, R, r, col, x, y, z, rx, ry, rz, seg = 28, arc = Math.PI * 2) { return this.geo(b, new THREE.TorusGeometry(R, r, 6, seg, arc), col, x, y, z, rx, ry, rz); }
  plane(b, w, h, col, x, y, z, rx, ry, rz) { return this.geo(b, new THREE.PlaneGeometry(w, h), col, x, y, z, rx, ry, rz); }
  // a pipe or cable through the given points
  tube(b, pts, r, col, seg = 5) { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))); return this.geo(b, new THREE.TubeGeometry(c, Math.max(6, pts.length * 4), r, seg), col); }
  // a placard: text drawn on the label sheet, placed as a small plate facing +z of the current frame at x, y, z (h = plate height in metres)
  label(text, h, x, y, z, rx = 0, ry = 0, rz = 0, style = 'plate', opts = {}) {
    const r = this.labels.add(text, style, opts), w = h * r.aspect, g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    return this.geo('label', g, [0xffffff, 0], x, y, z, rx, ry, rz);
  }
  // an indicator light: a small lit rectangle (or round lens) with number id, colour hex
  lamp(id, w, h, hex, x, y, z, rx = 0, ry = 0, rz = 0, round = false) { return this.geo('lamp', round ? new THREE.CircleGeometry(w / 2, 10) : new THREE.PlaneGeometry(w, h), [hex, id], x, y, z, rx, ry, rz); }
  // weld one bucket into a mesh
  mesh(bucket, material) { const list = this.b.get(bucket); if (!list || !list.length) return null; const g = mergeGeometries(list, false); for (const x of list) x.dispose(); this.b.delete(bucket); g.computeBoundingSphere(); const m = new THREE.Mesh(g, material); m.name = 'cab-' + bucket; m.frustumCulled = false; m.matrixAutoUpdate = false; return m; }
}

// a single loose part (something that moves on its own): same paint, own mesh
export function part(kit, material, build) { const k = new Kit(kit.labels); build(k); const m = k.mesh('p', material) || new THREE.Mesh(new THREE.BufferGeometry(), material); kit.tris += k.tris; m.matrixAutoUpdate = true; m.frustumCulled = false; return m; }
