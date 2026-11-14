// The shapes of the enemy vehicles: the supplied UAZ-469 and BMP-2 models cut into their moving parts, and a T-72 class tank
// built here in code as a STAND-IN (no T-72 model has been supplied). vehicles.js moves them; nothing here knows about the battle.
//
// Every vehicle comes out the same way: nose along +z, standing on y = 0, centred, with these named parts
//   gear        what stays on the ground: wheels ('wheel:0', 'wheel:1', ...), tracks ('track:0', 'track:1'), 'gearMid' (all wheels as one piece)
//   body        what rides on the springs: hull pieces, 'door:0' / 'door:1' (BMP rear doors), heat patches, and
//   turret      turning about its ring (rotation.y), holding 'gun' (rotation.x), 'muzzle', 'coax' and 'rail' (where a missile leaves)
// Pieces are merged by material so a vehicle is a handful of draw calls. userData.lod on a piece says when it is drawn:
//   'near' only close up (single wheels that turn), 'detail' close and middle distance, 'mid' middle distance only, 'far' the plain far shape.
// userData.hot marks a heat patch: drawn only in the thermal sights (engine, exhaust, gun barrel, running gear).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel, skin } from './units.js';

// Real sizes in metres. len/wid/hgt: overall. half: half the wheelbase or track on the ground (for following the ground). gauge: centre
// line to the middle of a wheel or track. mass: how heavily it sits on its springs (1 = a tank).
export const SPEC = {
  uaz: { name: 'UAZ-469', icon: 'truck', file: 'veh/uaz.json', len: 4.03, wid: 1.8, hgt: 2.0, half: 1.2, gauge: 0.72, mass: 0.25, wheeled: true, closed: true, floor: 0.62,
    tex: { 'UAZ-469': { map: 'veh/uaz_c.webp', rough: 0.7 }, Glass: { color: '#10181a', rough: 0.1, metal: 0.5 } } },
  bmp2: { name: 'BMP-2', icon: 'ifv', file: 'veh/bmp2.json', len: 6.74, wid: 3.15, hgt: 2.45, half: 2.0, gauge: 1.3, mass: 0.6 },
  t72: { name: 'T-72B3', icon: 'tank', file: 'veh/t72.json', len: 6.9, wid: 3.6, hgt: 2.2, half: 2.2, gauge: 1.38, mass: 1, tank: true,
    tex: { body: { map: 'veh/t72_c.webp', normal: 'veh/t72_n.webp', rm: 'veh/t72_rm.webp' }, track: { map: 'veh/t72_track_c.webp', cut: true }, kord: { map: 'veh/kord_c.webp' } } },
  t90: { name: 'T-90M', icon: 'tank', file: 'veh/t90.json', len: 6.9, wid: 3.8, hgt: 2.2, half: 2.2, gauge: 1.38, mass: 1, tank: true,
    tex: { body: { map: 'veh/t90_c.webp', normal: 'veh/t90_n.webp', rm: 'veh/t90_rm.webp', cut: true }, track: { map: 'veh/t90_track_c.webp', cut: true }, kord: { map: 'veh/kord_c.webp' } } },
};

// ---------------------------------------------------------------------------------------------------------------------
// Small tools for building and merging shapes
// ---------------------------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// A geometry as plain separate triangles with position, normal, uv (and colour if given), moved by `matrix`: the one form everything is merged in.
function plain(geom, matrix, col) {
  if (!geom.attributes.normal && geom.index) { geom = geom.clone(); geom.computeVertexNormals(); }   /* smooth across joined corners */
  const g = geom.index ? geom.toNonIndexed() : geom.clone(), n = g.attributes.position.count, out = new THREE.BufferGeometry();
  const copy = (a, size) => { const f = new Float32Array(n * size); if (a) for (let i = 0; i < n; i++) { f[i * size] = a.getX(i); f[i * size + 1] = a.getY(i); if (size > 2) f[i * size + 2] = a.getZ(i); } return new THREE.BufferAttribute(f, size); };
  out.setAttribute('position', copy(g.attributes.position, 3)); out.setAttribute('uv', copy(g.attributes.uv, 2));
  if (g.attributes.normal) out.setAttribute('normal', copy(g.attributes.normal, 3)); else out.computeVertexNormals();
  if (matrix) out.applyMatrix4(matrix);
  if (col) { const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; } out.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  return out;
}

// Collects coloured boxes, cylinders and prisms and merges them into one geometry.
class Bits {
  constructor() { this.list = []; }
  add(geom, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)); this.list.push(plain(geom, _m, col)); geom.dispose(); return this;
  }
  box(w, h, d, x, y, z, col, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), col, x, y, z, rx, ry, rz); }
  // a cylinder of radius r and length len lying along `axis` ('x', 'y' or 'z'), centred on x, y, z; r2 = radius at the far end
  cyl(r, len, x, y, z, col, axis = 'y', seg = 10, r2 = r, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(r2, r, len, seg); if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    return this.add(g, col, x, y, z, rx, ry, rz);
  }
  // a slab with the side outline pts = [[z, y], ...] (anticlockwise seen from the vehicle's left), running from x0 to x1
  prism(pts, x0, x1, col) {
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))), g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false });
    _m.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(x1, 0, 0); this.list.push(plain(g, _m, col)); g.dispose(); return this;
  }
  merge() { const g = mergeGeometries(this.list, false); for (const p of this.list) p.dispose(); this.list = []; g.computeBoundingSphere(); g.computeBoundingBox(); return g; }
}

const group = (name, parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); if (parent) parent.add(g); return g; };
const piece = (name, geom, mat, parent, lod, shadow = true) => { const m = new THREE.Mesh(geom, mat); m.name = name; m.userData.lod = lod; m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
const point = (name, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
// a heat patch: a plain box hugging something hot, drawn only in the thermal sights
const HOT = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1, roughness: 1 }); HOT.name = 'hot';
function hot(what, parent, w, h, d, x, y, z, geom) { const m = new THREE.Mesh(geom || new THREE.BoxGeometry(w, h, d), HOT); m.name = 'hot:' + what; m.position.set(x, y, z); m.userData.hot = what; m.visible = false; m.castShadow = false; parent.add(m); return m; }

// Paint: the colour under the theatre's finish. The pieces carry their own shade per corner (paint 1, rubber and steel dark).
const paintMat = () => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.15, 0.185, 0.1), roughness: 0.82, metalness: 0.12, vertexColors: true }); m.name = 'paint'; return m; };
const PAINT = [1, 1, 1], PAINT2 = [0.86, 0.88, 0.84], PAINT3 = [1.12, 1.1, 1.05], RUBBER = [0.1, 0.1, 0.1], STEEL = [0.33, 0.32, 0.3], DARK = [0.05, 0.05, 0.05], WOOD = [1.7, 1.05, 0.5], GLASS = [0.12, 0.2, 0.25], CANVAS = [1.25, 1.3, 1.0];

// ---------------------------------------------------------------------------------------------------------------------
// The far shape: a few boxes with the right outline, for a vehicle that is a dozen dots wide on the screen
// ---------------------------------------------------------------------------------------------------------------------
function farShape(kind, P, body, turret, mat, roof) {
  const S = SPEC[kind], L = S.len, W = S.wid, b = new Bits();
  if (kind === 'uaz') {
    b.box(W * 0.94, 0.62, L, 0, 0.78, 0, PAINT).box(W * 0.9, 0.72, L * 0.56, 0, 1.44, -L * 0.14, CANVAS).box(W * 0.8, 0.3, 0.06, 0, 1.4, L * 0.15, GLASS, -0.2);
    for (const sx of [-1, 1]) for (const z of [-1.2, 1.25]) b.cyl(0.38, 0.24, sx * 0.76, 0.38, z, RUBBER, 'x', 8);
    piece('farHull', b.merge(), mat, body, 'far');
    return;
  }
  const tank = kind === 't72', top = tank ? (roof || 1.16) : 2.05, nose = tank ? 0.8 : 1.35;
  b.prism([[-L / 2, 0.45], [L / 2 - 0.5, 0.45], [L / 2, nose], [L / 2 - (tank ? 1.6 : 2.3), top], [-L / 2, top]], -W / 2 + 0.3, W / 2 - 0.3, PAINT);
  for (const sx of [-1, 1]) b.box(0.5, tank ? 0.95 : 1.0, L * 0.96, sx * (W / 2 - 0.3), tank ? 0.5 : 0.52, 0, sx > 0 ? DARK : RUBBER);
  if (tank) { b.cyl(0.3, 0.9, 0.6, 1.0, -L / 2 - 0.3, PAINT2, 'x', 6).cyl(0.3, 0.9, -0.6, 1.0, -L / 2 - 0.3, PAINT2, 'x', 6); }
  piece('farHull', b.merge(), mat, body, 'far');
  const t = new Bits();
  if (tank) { t.cyl(1.36, 0.5, 0, 0.27, 0, PAINT, 'y', 10, 0.9).cyl(0.09, 4.5, 0, 0.4, 3.5, PAINT2, 'z', 5).cyl(0.14, 0.7, 0, 0.4, 3.9, PAINT2, 'z', 5); }
  else { t.cyl(0.95, 0.45, 0, 0.25, 0, PAINT, 'y', 8, 0.7).cyl(0.05, 2.6, 0.1, 0.3, 1.9, DARK, 'z', 4).box(0.5, 0.3, 1.2, 0.95, 0.4, -0.2, PAINT2).box(0.5, 0.3, 1.2, -0.95, 0.4, -0.2, PAINT2); }
  piece('farTurret', t.merge(), mat, turret, 'far');
}

// ---------------------------------------------------------------------------------------------------------------------
// A tank built in code: the outline and proportions of a T-72B with reactive armour blocks. It is ONLY the fallback shown if the
// supplied tank file (assets/veh/t72.json or t90.json) cannot be loaded; with the files in place it is never seen.
// ---------------------------------------------------------------------------------------------------------------------
function trackTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#2c2a27'; g.fillRect(0, 0, 32, 64);
  for (let k = 0; k < 4; k++) { g.fillStyle = '#131211'; g.fillRect(0, k * 16, 32, 3); g.fillStyle = '#4a4640'; g.fillRect(2, k * 16 + 6, 28, 5); g.fillStyle = '#1a1917'; g.fillRect(13, k * 16 + 3, 6, 13); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// one track as a band round the wheels. pts = [[z, y], ...] once round; the picture repeats every `rep` metres along it
function trackBand(pts, width, rep) {
  const pos = [], uv = []; let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), v0 = run / rep, v1 = (run + len) / rep, h = width / 2; run += len;
    pos.push(-h, a[1], a[0], h, a[1], a[0], h, b[1], b[0], -h, a[1], a[0], h, b[1], b[0], -h, b[1], b[0]); uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function arc(cz, cy, r, a0, a1, n, out) { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } }

function buildT72() {
  const P = group('t72'), gear = group('gear', P), body = group('body', P), mat = paintMat(), S = SPEC.t72;
  const TX = S.gauge, TW = 0.58, WR = 0.375, WY = 0.06 + WR;                       /* track centre and width, road wheel radius and axle height */
  // ---- running gear: six road wheels a side, idler at the front, drive sprocket at the back ----
  const wb = new Bits();                                                           /* one wheel of radius 1 lying along x, copied for every wheel */
  wb.cyl(1, 0.42, 0, 0, 0, RUBBER, 'x', 14).cyl(0.84, 0.46, 0, 0, 0, PAINT2, 'x', 14).cyl(0.3, 0.52, 0, 0, 0, STEEL, 'x', 8);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; wb.cyl(0.13, 0.5, 0, Math.cos(a) * 0.58, Math.sin(a) * 0.58, DARK, 'x', 5); }
  const wheelZ = [1.95, 1.05, 0.15, -0.75, -1.65, -2.55], list = [];
  for (const sx of [1, -1]) { for (const z of wheelZ) list.push({ x: sx * TX, y: WY, z, r: WR, side: sx }); list.push({ x: sx * TX, y: 0.7, z: 2.9, r: 0.29, side: sx }, { x: sx * TX, y: 0.72, z: -3.12, r: 0.32, side: sx }); }
  const wm = new THREE.InstancedMesh(wb.merge(), mat, list.length); wm.name = 'wheels'; wm.userData.lod = 'detail'; wm.castShadow = false; wm.receiveShadow = true; wm.frustumCulled = false;
  list.forEach((w, i) => { _m.compose(_v.set(w.x, w.y, w.z), _q.identity(), _s.set(1, w.r, w.r)); wm.setMatrixAt(i, _m); }); gear.add(wm);
  const loop = []; arc(2.9, 0.7, 0.33, Math.PI * 0.5, -Math.PI * 0.35, 5, loop); loop.push([1.95, 0.02], [-2.55, 0.02]); arc(-3.12, 0.72, 0.36, -Math.PI * 0.65, -Math.PI * 1.5, 5, loop); loop.push([-1.2, 0.95], [1.0, 0.95]);
  const band = trackBand(loop, TW, 0.64), tex = trackTexture(), tm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide }); tm.name = 'track';
  [1, -1].forEach((sx, i) => { const t = piece('track:' + i, band, tm, gear, 'detail', false); t.position.x = sx * TX; t.userData.side = sx; t.userData.slide = { axis: 'y', perM: 1 / 0.64 }; });
  hot('gear', gear, 0.6, 0.9, 6.3, TX, 0.5, -0.1); hot('gear', gear, 0.6, 0.9, 6.3, -TX, 0.5, -0.1);

  // ---- hull ----
  const h = new Bits();
  h.prism([[-3.3, 0.52], [-3.1, 0.45], [2.95, 0.45], [3.42, 0.8], [2.58, 1.0], [-3.45, 1.0]], -1.14, 1.14, PAINT2);                  /* the tub between the tracks, with the beak of the nose */
  h.prism([[-3.45, 0.98], [2.6, 0.98], [3.42, 0.8], [1.72, 1.19], [-3.45, 1.16]], -1.72, 1.72, PAINT);                                /* the upper hull over the tracks and the long glacis */
  const gl = Math.atan2(1.19 - 0.8, 3.42 - 1.72);                                                                                    /* slope of the glacis */
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) { const u = 0.22 + r * 0.4, x = -1.33 + c * 0.38; if (r === 0 && (c === 3 || c === 4)) continue; h.box(0.32, 0.075, 0.3, x, 1.19 - Math.sin(gl) * u + 0.045, 1.72 + Math.cos(gl) * u, r % 2 ? PAINT2 : PAINT3, gl); }   /* reactive armour blocks on the glacis */
  h.box(1.5, 0.14, 0.04, 0.72, 1.2, 1.5, PAINT2, 0, 0.42).box(1.5, 0.14, 0.04, -0.72, 1.2, 1.5, PAINT2, 0, -0.42);                    /* the V of the splash board */
  h.cyl(0.3, 0.07, 0, 1.2, 1.25, PAINT2, 'y', 10).box(0.24, 0.1, 0.1, 0, 1.25, 1.52, GLASS);                                          /* driver's hatch and periscope */
  h.box(0.2, 0.2, 0.16, 1.2, 1.02, 3.0, STEEL, gl).box(0.2, 0.2, 0.16, -1.2, 1.02, 3.0, STEEL, gl);                                  /* headlights */
  for (const sx of [1, -1]) {
    h.box(0.62, 0.035, 6.8, sx * 1.47, 1.0, -0.05, PAINT2);                                                                           /* track guard */
    h.box(0.03, 0.46, 6.2, sx * 1.79, 0.77, -0.2, RUBBER);                                                                            /* rubber side skirt */
    for (let k = 0; k < 9; k++) h.box(0.075, 0.26, 0.34, sx * 1.83, 0.84, 2.55 - k * 0.42, k % 2 ? PAINT2 : PAINT3);                  /* reactive armour blocks on the skirt */
    h.box(0.5, 0.2, 1.3, sx * 1.44, 1.12, -0.6, PAINT2).box(0.5, 0.2, 1.15, sx * 1.44, 1.12, 0.85, PAINT).box(0.5, 0.16, 0.9, sx * 1.44, 1.1, -1.9, PAINT2);   /* fuel cells and stowage boxes on the track guards */
    h.box(0.62, 0.035, 0.5, sx * 1.47, 0.9, 3.33, PAINT2, 0.5);                                                                       /* front mudguard */
  }
  h.box(2.5, 0.05, 1.75, 0, 1.19, -2.5, PAINT2).box(1.3, 0.03, 0.75, -0.3, 1.225, -2.9, DARK).box(0.9, 0.03, 0.5, 0.5, 1.225, -2.0, DARK);   /* engine deck with its grilles */
  h.box(0.3, 0.2, 0.75, 1.62, 1.12, -2.55, STEEL);                                                                                   /* exhaust outlet on the left */
  h.cyl(0.29, 0.92, 0.62, 1.02, -3.72, PAINT2, 'x', 12).cyl(0.29, 0.92, -0.62, 1.02, -3.72, PAINT, 'x', 12);                          /* the two fuel drums */
  h.box(0.06, 0.5, 0.06, 1.12, 1.0, -3.55, STEEL).box(0.06, 0.5, 0.06, -1.12, 1.0, -3.55, STEEL).box(0.06, 0.5, 0.06, 0, 1.0, -3.55, STEEL);
  h.cyl(0.13, 2.7, 0, 0.66, -3.58, WOOD, 'x', 8);                                                                                    /* unditching log */
  piece('hull', h.merge(), mat, body, 'detail');
  hot('engine', body, 2.4, 0.1, 1.8, 0, 1.22, -2.5); hot('exhaust', body, 0.4, 0.3, 0.9, 1.66, 1.12, -2.55);

  // ---- turret: a low round casting, widest near the bottom ----
  const turret = group('turret', body, 0, 1.19, 0.3), t = new Bits();
  const prof = [[1.28, 0], [1.4, 0.1], [1.36, 0.28], [1.18, 0.46], [0.88, 0.6], [0.45, 0.68], [0.01, 0.7]].map(p => new THREE.Vector2(p[0], p[1]));
  t.add(new THREE.LatheGeometry(prof, 22), PAINT, 0, 0, -0.05, 0, 0, 0, 1, 1, 1.1);
  for (let k = -5; k <= 5; k++) { if (k === 0) continue; const a = k * 0.2 + (k > 0 ? -0.04 : 0.04), sn = Math.sin(a), cs = Math.cos(a);                     /* the collar of reactive armour blocks round the front */
    t.box(0.3, 0.2, 0.09, sn * 1.5, 0.3, cs * 1.6 - 0.05, k % 2 ? PAINT3 : PAINT2, -0.5, a).box(0.3, 0.2, 0.09, sn * 1.34, 0.5, cs * 1.44 - 0.05, k % 2 ? PAINT2 : PAINT3, -0.85, a); }
  for (let r = 0; r < 2; r++) for (let c = -2; c <= 2; c++) { if (c === 0 && r === 0) continue; t.box(0.3, 0.07, 0.22, c * 0.36, 0.69 - Math.abs(c) * 0.03 - r * 0.02, 0.35 - r * 0.3, c % 2 ? PAINT2 : PAINT3, -0.1 - r * 0.02, 0, -c * 0.09); }   /* blocks on the roof */
  t.cyl(0.36, 0.2, -0.52, 0.72, -0.25, PAINT2, 'y', 12).cyl(0.3, 0.05, -0.52, 0.84, -0.25, PAINT, 'y', 12);                           /* commander's cupola (he sits on the right) */
  t.box(0.16, 0.16, 0.5, -0.52, 1.0, -0.05, STEEL).cyl(0.022, 1.25, -0.52, 1.02, 0.75, DARK, 'z', 5).box(0.1, 0.2, 0.2, -0.36, 0.95, -0.1, PAINT2);   /* anti-aircraft machine gun */
  t.cyl(0.29, 0.05, 0.55, 0.66, -0.2, PAINT2, 'y', 12).box(0.22, 0.2, 0.26, 0.56, 0.7, 0.42, PAINT2).box(0.18, 0.12, 0.02, 0.56, 0.72, 0.56, GLASS);     /* gunner's hatch and sight head */
  t.cyl(0.19, 0.22, -0.62, 0.42, 1.33, PAINT2, 'z', 10).cyl(0.17, 0.02, -0.62, 0.42, 1.45, GLASS, 'z', 10);                           /* searchlight to the right of the gun */
  for (const sx of [1, -1]) for (let k = 0; k < 4; k++) { const a = sx * (0.95 + k * 0.13); t.cyl(0.045, 0.3, Math.sin(a) * 1.42, 0.5, Math.cos(a) * 1.5, STEEL, 'z', 5, 0.045, -0.75, a); }   /* smoke grenade dischargers */
  t.box(0.9, 0.3, 0.42, 0.55, 0.36, -1.55, PAINT2, 0, 0.35).box(0.9, 0.3, 0.42, -0.55, 0.36, -1.55, PAINT, 0, -0.35);                 /* stowage boxes on the back */
  t.cyl(0.13, 1.9, 0, 0.5, -1.86, PAINT2, 'x', 8);                                                                                   /* snorkel tube carried across the back */
  t.cyl(0.012, 2.2, 0.75, 1.6, -0.9, DARK, 'y', 4).cyl(0.03, 0.4, -0.2, 0.85, -0.95, STEEL, 'y', 5);                                 /* aerial and wind sensor */
  piece('turretShell', t.merge(), mat, turret, 'detail');
  { const lid = new Bits(); lid.cyl(0.3, 0.05, 0, 0.3, 0, PAINT2, 'y', 12, 0.3, 0, 0, 0); const m = piece('lid', lid.merge(), mat, turret, 'detail'); m.position.set(-0.52, 0.86, -0.55); m.rotation.x = -1.35; m.visible = false; m.userData.lid = true; }   /* an open hatch, shown when the crew has gone */

  // ---- gun: 125 mm smoothbore with its fume extractor a little forward of the middle ----
  const gun = group('gun', turret, 0, 0.36, 1.12), g = new Bits();
  g.box(0.62, 0.5, 0.5, 0, 0, 0.2, PAINT2).cyl(0.16, 0.5, 0, 0, 0.62, PAINT, 'z', 10, 0.11);                                           /* mantlet and its sleeve */
  g.cyl(0.095, 4.3, 0, 0, 2.95, PAINT, 'z', 10, 0.085).cyl(0.145, 0.8, 0, 0, 3.0, PAINT2, 'z', 12).cyl(0.105, 0.12, 0, 0, 1.5, PAINT2, 'z', 10).cyl(0.105, 0.12, 0, 0, 4.2, PAINT2, 'z', 10).cyl(0.095, 0.16, 0, 0, 5.02, DARK, 'z', 10);
  g.cyl(0.03, 0.5, -0.33, 0.02, 0.6, DARK, 'z', 5);                                                                                  /* coaxial machine gun */
  piece('gunTube', g.merge(), mat, gun, 'detail');
  point('muzzle', gun, 0, 0, 5.12); point('coax', gun, -0.33, 0.02, 0.9); point('rail', gun, 0, 0, 5.12);
  hot('gun', gun, 0, 0, 0, 0, 0, 2.9, new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6).rotateX(Math.PI / 2));
  farShape('t72', P, body, turret, mat);
  P.userData = { kind: 't72', wheels: list, wheelMesh: 'wheels', turretAt: [0, 1.19, 0.3], roof: 2.0, hatch: [[-0.52, 2.05, 0.05], [0.55, 2.0, 0.1]], deck: [0, 1.3, -2.5] };
  return P;
}

// ---------------------------------------------------------------------------------------------------------------------
// Supplied models: stood straight, cut into parts by the names of their pieces, merged by material
// ---------------------------------------------------------------------------------------------------------------------
// which way the picture on a track runs and how many repeats there are to the metre, measured from the model itself
function trackFlow(geom) {
  const p = geom.attributes.position, uv = geom.attributes.uv; let su = 0, sv = 0, sl = 0;
  for (let i = 0; i + 2 < p.count; i += 3) for (let k = 0; k < 3; k++) { const a = i + k, b = i + (k + 1) % 3, dz = Math.abs(p.getZ(a) - p.getZ(b)), dy = Math.abs(p.getY(a) - p.getY(b)), dx = Math.abs(p.getX(a) - p.getX(b)); if (dx > 0.02 || dz + dy < 0.03) continue; su += Math.abs(uv.getX(a) - uv.getX(b)); sv += Math.abs(uv.getY(a) - uv.getY(b)); sl += Math.hypot(dz, dy); }
  if (!(sl > 1)) return null; const big = Math.max(su, sv), small = Math.min(su, sv); if (!(big > small * 2.5) || big / sl < 0.05) return null;       /* the picture is not laid along the track: leave it still */
  return { axis: su > sv ? 'x' : 'y', perM: big / sl };
}
function straighten(src, V, noseOf) {
  const o = src.clone(), box = new THREE.Box3(), sz = new THREE.Vector3(), c = new THREE.Vector3(), root = new THREE.Group(), turn = new THREE.Group(); turn.add(o); root.add(turn);
  root.updateMatrixWorld(true); box.setFromObject(root).getSize(sz); o.scale.multiplyScalar(V.len / Math.max(sz.x, sz.y, sz.z)); if (sz.x > sz.z) turn.rotation.y = Math.PI / 2;
  root.updateMatrixWorld(true); box.setFromObject(root).getCenter(c);
  let nose = null; o.traverse(m => { if (m.isMesh && noseOf.test(m.name)) nose = m; });
  if (nose) { const nc = new THREE.Box3().setFromObject(nose).getCenter(new THREE.Vector3()); if (nc.z < c.z) turn.rotation.y += Math.PI; }           /* a piece known to be ahead of the middle says which end is the nose */
  root.updateMatrixWorld(true); box.setFromObject(root).getCenter(c); turn.position.set(-c.x, -box.min.y, -c.z); root.updateMatrixWorld(true);
  const meshes = []; o.traverse(m => { if (m.isMesh) { const g = plain(m.geometry, m.matrixWorld); g.computeBoundingBox(); meshes.push({ name: m.name, mat: m.material, g, box: g.boundingBox }); } });
  return meshes;
}
// merge pieces by material into `parent`, shifted so `parent` (standing at ox, oy, oz in the vehicle) holds them where they were
function mergeInto(parent, items, name, lod, ox = 0, oy = 0, oz = 0, shadow = true) {
  const by = new Map(); for (const it of items) { if (!by.has(it.mat)) by.set(it.mat, []); by.get(it.mat).push(it.g); }
  let k = 0; const out = [];
  for (const [mat, gs] of by) { const g = gs.length > 1 ? mergeGeometries(gs, false) : gs[0].clone(); g.translate(-ox, -oy, -oz); g.computeBoundingSphere(); out.push(piece(name + ':' + mat.name + ':' + k++, g, mat, parent, lod, shadow)); }
  return out;
}
const unite = items => { const b = new THREE.Box3(); for (const it of items) b.union(it.box); return b; };

async function buildLoaded(kind, base) {
  const V = SPEC[kind], src = await loadModel(base + V.file); if (!src) return null;
  let model = src;
  if (V.tex) { model = src.clone(); const t = {}; for (const k in V.tex) t[k] = Object.assign({}, V.tex[k], V.tex[k].map ? { map: base + V.tex[k].map } : {}); model.traverse(x => { if (x.isMesh) x.material = x.material.clone(); }); skin(model, t); }
  const all = straighten(model, V, kind === 'uaz' ? /^helm/ : /_weapon$/), P = group(kind), gear = group('gear', P), body = group('body', P), far = paintMat();
  const short = n => n.replace(/^bmp-2m(-lod-3)?_/, ''), is = (it, re) => re.test(short(it.name));
  const wheelItems = all.filter(it => is(it, /^(wheel|tyre)/)), wheels = [];
  // each wheel on its own axle: pieces that share a centre (a wheel and its tyre) turn together
  for (const it of wheelItems) { const c = it.box.getCenter(new THREE.Vector3()); let w = wheels.find(q => Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z) < 0.12); if (!w) wheels.push(w = { x: c.x, y: c.y, z: c.z, r: 0, side: c.x > 0 ? 1 : -1, items: [] }); w.items.push(it); w.r = Math.max(w.r, (it.box.max.y - it.box.min.y) / 2); }
  const frontZ = Math.max(...wheels.map(w => w.z));
  wheels.forEach((w, i) => { const g = group('wheel:' + i, gear, w.x, w.y, w.z); mergeInto(g, w.items, 'w', 'near', w.x, w.y, w.z, false); w.steer = kind === 'uaz' && w.z > frontZ - 0.3; delete w.items; });
  if (kind === 'uaz') { for (const w of wheels) gear.getObjectByName('wheel:' + wheels.indexOf(w)).traverse(m => { if (m.isMesh) m.userData.lod = 'detail'; }); }   /* four wheels: they stay single at every distance */
  else mergeInto(gear, wheelItems, 'gearMid', 'mid', 0, 0, 0, false);
  const rest = all.filter(it => !wheelItems.includes(it));
  if (kind === 'uaz') {
    mergeInto(body, rest, 'hull', 'detail');
    const top = unite(rest).max.y; farShape('uaz', P, body, null, far);
    hot('engine', body, 1.3, 0.5, 1.0, 0, 0.95, 1.45); hot('exhaust', body, 0.2, 0.2, 0.5, -0.5, 0.4, -1.8); for (const w of wheels) hot('gear', gear, 0.3, w.r * 2, w.r * 2, w.x, w.y, w.z);
    P.userData = { kind, wheels, roof: top, deck: [0, 1.1, 1.4], hatch: [[0, 1.2, 0.2]] };
    return P;
  }
  // BMP-2: tracks, rear doors, turret and gun
  const tracks = rest.filter(it => is(it, /^track/)).sort((a, b) => b.box.min.x - a.box.min.x);
  tracks.forEach((it, i) => { const m = piece('track:' + i, it.g, it.mat, gear, 'detail', false); m.userData.side = i ? -1 : 1; m.userData.slide = trackFlow(it.g); });
  const gunItems = rest.filter(it => is(it, /^weapon2?$/)), turItems = rest.filter(it => is(it, /^(turret|hatch2?|lens02|mount\d?|antenna2?|container|extras1|object0[2-6]|smoke.*|ammo\d|weapon[3-7]|interior)$/));
  const doors = rest.filter(it => is(it, /^hatch[78]$/)), hullItems = rest.filter(it => !tracks.includes(it) && !gunItems.includes(it) && !turItems.includes(it) && !doors.includes(it) && !is(it, /^object01$/));
  mergeInto(body, hullItems, 'hull', 'detail');
  doors.forEach((it, i) => { const c = it.box.getCenter(new THREE.Vector3()), sx = c.x > 0 ? 1 : -1, hx = sx > 0 ? it.box.max.x : it.box.min.x, g = group('door:' + i, body, hx, 0, it.box.max.z); g.userData.side = sx; mergeInto(g, [it], 'door', 'detail', hx, 0, it.box.max.z); });
  const shell = turItems.find(it => is(it, /^turret$/)) || turItems[0], tb = shell.box, tc = tb.getCenter(new THREE.Vector3()), turret = group('turret', body, tc.x, tb.min.y, tc.z);
  mergeInto(turret, turItems, 'turret', 'detail', tc.x, tb.min.y, tc.z);
  const barrel = gunItems.find(it => is(it, /^weapon$/)), bb = barrel.box, bc = bb.getCenter(new THREE.Vector3()), gz = bb.min.z + 0.15, gun = group('gun', turret, bc.x - tc.x, bc.y - tb.min.y, gz - tc.z);
  mergeInto(gun, gunItems, 'gun', 'detail', bc.x, bc.y, gz);
  point('muzzle', gun, 0, 0, bb.max.z - gz); const co = gunItems.find(it => is(it, /^weapon2$/)); if (co) { const cc = co.box.getCenter(new THREE.Vector3()); point('coax', gun, cc.x - bc.x, cc.y - bc.y, co.box.max.z - gz); } else point('coax', gun, 0.2, 0, 0.5);
  const tubes = turItems.filter(it => is(it, /^weapon[4-7]$/)); if (tubes.length) { const ub = unite([tubes.sort((a, b) => b.box.max.x - a.box.max.x)[0]]), uc = ub.getCenter(new THREE.Vector3()); point('rail', turret, uc.x - tc.x, uc.y - tb.min.y, ub.max.z - tc.z); } else point('rail', turret, 0, tb.max.y - tb.min.y + 0.2, 0);
  hot('gun', gun, 0, 0, 0, 0, 0, (bb.max.z - gz) / 2, new THREE.CylinderGeometry(0.07, 0.07, bb.max.z - gz, 6).rotateX(Math.PI / 2));
  const grill = hullItems.find(it => is(it, /^grill/)), hb = unite(hullItems);
  if (grill) { const gb = grill.box, gc = gb.getCenter(new THREE.Vector3()); hot('engine', body, gb.max.x - gb.min.x, 0.08, gb.max.z - gb.min.z, gc.x, gb.max.y + 0.03, gc.z); hot('exhaust', body, 0.25, 0.3, 0.7, gc.x < 0 ? hb.min.x + 0.2 : hb.max.x - 0.2, gb.max.y - 0.25, gc.z); P.userData.deck = [gc.x, gb.max.y + 0.1, gc.z]; }
  for (const sx of [1, -1]) hot('gear', gear, 0.45, 0.9, 5.6, sx * V.gauge, 0.5, 0.2);
  farShape('bmp2', P, body, turret, far);
  P.userData = Object.assign(P.userData, { kind, wheels, turretAt: [tc.x, tb.min.y, tc.z], roof: tb.max.y, hatch: [[tc.x - 0.4, tb.max.y, tc.z - 0.3], [tc.x + 0.4, tb.max.y, tc.z - 0.3]], rear: [0, 1.2, hb.min.z] });
  if (!P.userData.deck) P.userData.deck = [-0.6, hb.max.y, 1.6];
  return P;
}

// ---------------------------------------------------------------------------------------------------------------------
// Supplied tanks (T-72B3, T-90M), packed by tools/vehicle_join.py: the pieces are already straight and named, and the file says where
// the turret and the gun turn and where every wheel's axle is. A full copy for close up and a light copy for the middle distance.
// ---------------------------------------------------------------------------------------------------------------------
const texLoader = new THREE.TextureLoader();
function picture(url, colour) { const t = texLoader.load(url); t.flipY = false; t.anisotropy = 4; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function tankMaterial(name, T, base) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.15, side: THREE.DoubleSide }); m.name = name; if (!T) return m;
  if (T.map) m.map = picture(base + T.map, true);
  if (T.normal) { m.normalMap = picture(base + T.normal, false); m.normalScale.set(0.8, 0.8); }
  if (T.rm) { m.roughnessMap = m.metalnessMap = picture(base + T.rm, false); m.roughness = 1; m.metalness = 0.6; }
  if (T.cut) m.alphaTest = 0.5;
  return m;
}
async function buildTank(kind, base) {
  const V = SPEC[kind], src = await loadModel(base + V.file); if (!src) return null;
  const X = src.userData || {}; if (!X.turret || !X.wheels) throw new Error('tank file without its measurements: ' + V.file);
  const mats = { body: tankMaterial('body', V.tex.body, base), track: tankMaterial('track', V.tex.track, base), kord: tankMaterial('kord', V.tex.kord, base) };
  const P = group(kind), gear = group('gear', P), body = group('body', P), items = {}; src.updateMatrixWorld(true);
  src.traverse(m => { if (m.isMesh) { const g = plain(m.geometry, m.matrixWorld); g.computeBoundingBox(); items[m.name] = { name: m.name, g, box: g.boundingBox, mat: /track/i.test(m.name) ? mats.track : /kord/i.test(m.name) ? mats.kord : mats.body }; } });
  const tp = X.turret, gp = X.gun ? X.gun.pivot : [tp[0], tp[1] + 0.2, tp[2] + 0.8], mz = X.gun ? X.gun.muzzle : [tp[0], tp[1] + 0.2, tp[2] + 5.5];
  const turret = group('turret', body, tp[0], tp[1], tp[2]), gun = group('gun', turret, gp[0] - tp[0], gp[1] - tp[1], gp[2] - tp[2]);
  const put = (name, parent, lod, o, shadow = true) => { const it = items[name]; if (!it) return null; return mergeInto(parent, [it], name, lod, o[0], o[1], o[2], shadow)[0]; };
  put('hull', body, 'near', [0, 0, 0]); put('lod1_hull', body, 'mid', [0, 0, 0]);
  put('turret', turret, 'near', tp); put('kord', turret, 'near', tp); put('lod1_turret', turret, 'mid', tp);
  put('gun', gun, 'near', gp); put('lod1_gun', gun, 'mid', gp);
  ['trackL', 'trackR'].forEach((n, i) => { const m = put(n, gear, 'near', [0, 0, 0], false); if (m) { m.name = 'track:' + i; m.userData.side = items[n].box.max.x + items[n].box.min.x > 0 ? 1 : -1; m.userData.slide = trackFlow(items[n].g); } });
  put('lod1_track', gear, 'mid', [0, 0, 0], false); put('lod1_gear', gear, 'mid', [0, 0, 0], false);
  const wheels = X.wheels.map((w, i) => { const g = group('wheel:' + i, gear, w.c[0], w.c[1], w.c[2]); put(w.name, g, 'near', w.c, false); return { x: w.c[0], y: w.c[1], z: w.c[2], r: w.r, side: w.c[0] > 0 ? 1 : -1 }; });
  point('muzzle', gun, mz[0] - gp[0], mz[1] - gp[1], mz[2] - gp[2]); point('coax', gun, -0.35, 0.02, (X.gun ? X.gun.root : gp[2] + 0.7) - gp[2] + 0.1); point('rail', gun, mz[0] - gp[0], mz[1] - gp[1], mz[2] - gp[2]);
  const hb = items.hull.box, len = mz[2] - (X.gun ? X.gun.root : gp[2]);
  hot('gun', gun, 0, 0, 0, 0, 0, mz[2] - gp[2] - len / 2, new THREE.CylinderGeometry(0.15, 0.15, len, 6).rotateX(Math.PI / 2));
  hot('engine', body, 2.3, 0.1, 1.7, 0, tp[1] - 0.12, hb.min.z + 1.75); hot('exhaust', body, 0.4, 0.3, 0.9, hb.max.x - 0.25, tp[1] - 0.3, hb.min.z + 1.6);
  for (const sx of [1, -1]) hot('gear', gear, 0.6, 0.9, 6.2, sx * V.gauge, 0.5, 0.3);
  farShape('t72', P, body, turret, paintMat(), tp[1]);
  P.userData = { kind, wheels, turretAt: tp, roof: tp[1] + 0.8, hatch: [[tp[0] - 0.5, tp[1] + 0.8, tp[2] - 0.2], [tp[0] + 0.5, tp[1] + 0.8, tp[2] - 0.2]], deck: [0, tp[1], hb.min.z + 1.75] };
  return P;
}

// One prepared vehicle per kind, made once; every vehicle on the field is a copy of it (see VehicleView). Resolves to null if a
// supplied model is missing.
const ready = new Map();
export function vehicleProto(kind, base) {
  if (!SPEC[kind]) return Promise.resolve(null);
  if (!ready.has(kind)) ready.set(kind, (SPEC[kind].tank ? buildTank(kind, base) : buildLoaded(kind, base)).catch(e => { console.warn('vehicle model not prepared', kind, e && e.message); return null; })
    .then(p => p || (SPEC[kind].tank ? (console.warn('tank file missing: showing the plain built-in tank shape for', kind), buildT72()) : null)));
  return ready.get(kind);
}
