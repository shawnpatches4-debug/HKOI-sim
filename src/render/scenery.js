// Trees, tree lines and buildings, instanced from the World's cells.
import * as THREE from 'three';
import { ENV, weatherise, atmosphere } from './env.js';
import { treeShapes, treeMaterials, KIND_INFO } from './flora.js';

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// The top of a wood seen from far off: a bumpy green surface at tree-top height over the wooded cells of one chunk, with sides down to
// the ground where the wood ends.
function canopyFor(world, ci, cj, CH, mat, pConifer) {
  const n = world.n, c = world.cell, half = world.half, V = world.V, VH = world.VH, wood = (i, j) => i >= 0 && j >= 0 && i < n && j < n && V[j * n + i] === 4, pos = [], col = [], nor = [];
  const top = (i, j) => { let m = 0; for (const [a, b] of [[i, j], [i - 1, j], [i, j - 1], [i - 1, j - 1]]) if (wood(a, b)) m = Math.max(m, VH[b * n + a]); const e = i * c - half - c / 2, nn = j * c - half - c / 2; return [e, world.h(e, nn) + m * (0.78 + 0.3 * hash(i, j, 77)), -nn, world.h(e, nn)]; };
  const base = new THREE.Color(pConifer > 0.4 ? '#2a4429' : '#3f632c'), k = new THREE.Color();
  const tri = (A, B, C, shade) => { const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L; for (const P of [A, B, C]) { pos.push(P[0], P[1], P[2]); nor.push(nx * 0.5, ny * 0.5 + 0.5, nz * 0.5); k.copy(base).multiplyScalar(shade); col.push(k.r, k.g, k.b); } };
  for (let j = cj; j < Math.min(n, cj + CH); j++) for (let i = ci; i < Math.min(n, ci + CH); i++) { if (!wood(i, j)) continue; const a = top(i, j), b = top(i + 1, j), d = top(i, j + 1), e = top(i + 1, j + 1), sh = 0.8 + 0.3 * hash(i, j, 78);
    tri(a, b, e, sh); tri(a, e, d, sh);
    const side = (P, Q) => { const p0 = [P[0], P[3], P[2]], q0 = [Q[0], Q[3], Q[2]]; tri(P, p0, q0, 0.6); tri(P, q0, Q, 0.6); };
    if (!wood(i, j - 1)) side(a, b); if (!wood(i + 1, j)) side(b, e); if (!wood(i, j + 1)) side(e, d); if (!wood(i - 1, j)) side(d, a); }
  if (!pos.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; return m;
}

// Which trees grow where. Each wood or tree line is mostly one kind (a stand), with others mixed in.
const MIX = {
  farmland: { wood: [['broad', 0.4], ['broadB', 0.3], ['birch', 0.18], ['spruce', 0.12]], line: [['poplar', 0.42], ['broad', 0.2], ['broadB', 0.18], ['birch', 0.2]], scrub: [['bush', 1]] },
  town: { wood: [['broad', 0.4], ['broadB', 0.3], ['birch', 0.2], ['spruce', 0.1]], line: [['poplar', 0.4], ['broad', 0.25], ['broadB', 0.15], ['birch', 0.2]], scrub: [['bush', 1]] },
  forest: { wood: [['spruce', 0.46], ['pine', 0.2], ['broad', 0.14], ['broadB', 0.1], ['birch', 0.1]], line: [['birch', 0.4], ['broadB', 0.3], ['spruce', 0.3]], scrub: [['bush', 1]] },
  desert: { wood: [['acacia', 1]], line: [['acacia', 1]], scrub: [['shrub', 0.93], ['acacia', 0.07]] },
};
const pick = (list, r) => { for (const [k, w] of list) { if (r < w) return k; r -= w; } return list[list.length - 1][0]; };

// Trees and bushes are grouped into square chunks so the graphics card can skip the ones out of view, and each chunk
// switches to the close-up shapes only when the camera is near.
export function buildTrees(world, opt = {}) {
  const group = new THREE.Group(); group.name = 'trees'; const n = world.n, c = world.cell, half = world.half, CH = opt.chunk || 16, bk = world.biomeKey, mix = MIX[bk] || MIX.farmland, pConifer = bk === 'forest' ? 0.62 : bk === 'desert' ? 0 : 0.08;
  const { mat, depth } = treeMaterials();
  // the far-off top of a wood is its own simple surface: leaf-coloured, mottled crown by crown
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  canopyMat.onBeforeCompile = sh => {
    sh.uniforms.uSnow = ENV.snow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp; uniform float uSnow;
      float hkc_h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hkc_cells(vec2 p){ vec2 i = floor(p), f = fract(p); float d = 1.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = vec2(hkc_h(i + g), hkc_h(i + g + 31.7)); d = min(d, length(g + o - f)); } return d; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float crown = hkc_cells(vWp.xz * 0.11), tone = hkc_h(floor(vWp.xz * 0.11) + 3.0);
        diffuseColor.rgb *= (1.15 - 0.75 * smoothstep(0.25, 0.75, crown)) * (0.85 + 0.3 * tone);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.83, 0.88), uSnow * 0.55 * (1.0 - smoothstep(0.2, 0.7, crown))); }`);
  };
  canopyMat.customProgramCacheKey = () => 'hkcanopy'; atmosphere(canopyMat);
  const perCell = opt.perCell || 2, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color(); let total = 0;
  const lods = [], meshes = [], STAND = 190;
  for (let cj = 0; cj < n; cj += CH) for (let ci = 0; ci < n; ci += CH) {
    const list = [];
    for (let j = cj; j < Math.min(n, cj + CH); j++) for (let i = ci; i < Math.min(n, ci + CH); i++) { const k = j * n + i, v = world.V[k]; if (v !== 4 && v !== 5 && v !== 3) continue; const cnt = v === 5 ? 2 : v === 3 ? 3 : perCell;
      /* undergrowth: a bush under most tree-line cells and many woodland cells, so you cannot see straight through at eye height */
      if (v !== 3 && bk !== 'desert' && hash(i, j, 97) < (v === 5 ? 0.7 : 0.5)) { const r = hash(i, j, 98); list.push([i * c - half + (hash(i, j, 95) - 0.5) * c, j * c - half + (hash(i, j, 96) - 0.5) * c, 1.6 + r * 2.2, r, 'bush', false]); }
      for (let q = 0; q < cnt; q++) { const e = i * c - half + (hash(i, j, 11 + q) - 0.5) * c, nn = j * c - half + (hash(i, j, 23 + q) - 0.5) * c, r = hash(i, j, 41 + q);
        if (v === 3) { if (r < 0.62) { const kind = pick(mix.scrub, hash(i, j, 61 + q)); list.push([e, nn, kind === 'acacia' ? Math.min(5, world.VH[k] * 1.6) : world.VH[k] * (0.45 + r * 0.9), r, kind, false]); } continue; }
        const h = world.VH[k] * (0.7 + 0.5 * hash(i, j, 31 + q)), table = v === 4 ? mix.wood : mix.line, si = Math.floor(e / STAND), sj = Math.floor(nn / STAND);
        const kind = hash(i, j, 51 + q) < 0.72 ? pick(table, hash(si, sj, 71 + v)) : pick(table, hash(i, j, 81 + q));
        list.push([e, nn, h, r, kind, v === 4]); } }
    if (!list.length) continue;
    const ce = (ci + CH / 2) * c - half, cn = (cj + CH / 2) * c - half, centre = new THREE.Vector3(ce, world.h(ce, cn), -cn), near = new THREE.Group(), far = new THREE.Group(), tiny = new THREE.Group(), tinyLine = new THREE.Group(), canopy = canopyFor(world, ci, cj, CH, canopyMat, pConifer);
    const kinds = [...new Set(list.map(t => t[4]))];
    for (const kind of kinds) { const all = list.filter(t => t[4] === kind), shapes = treeShapes(kind), wide = KIND_INFO[kind].width, low = kind === 'bush' || kind === 'shrub';
      // levels: 0 middle distance, 1 close up, 2 far (trees inside woods, and bushes), 3 far (tree lines and lone trees, which stay visible further out)
      for (const lv of [0, 1, 2, 3]) { const geo = shapes[lv === 1 ? 0 : lv === 0 ? 1 : 2], sub = lv === 2 ? all.filter(t => t[5] || low) : lv === 3 ? all.filter(t => !t[5] && !low) : all; if (!sub.length) continue;
        const im = new THREE.InstancedMesh(geo, mat, sub.length); im.castShadow = lv < 2; im.receiveShadow = lv < 2; im.customDepthMaterial = depth;
        sub.forEach((t, q) => { const sink = low ? 0.05 : 0.15; P.set(t[0], world.h(t[0], t[1]) - sink, -t[1]); Q.setFromAxisAngle(up, t[3] * 6.283); const w = t[2] * wide * (0.82 + 0.36 * t[3]); S.set(w, t[2], w); M.compose(P, Q, S); im.setMatrixAt(q, M);
          const hq = hash(Math.round(t[0] * 3), Math.round(t[1] * 3), 7), hl = hash(Math.round(t[0] * 3), Math.round(t[1] * 3), 9); tint.setRGB(0.86 + 0.26 * hl + 0.16 * hq, 0.9 + 0.22 * hl, 0.78 + 0.26 * hl - 0.14 * hq); im.setColorAt(q, tint); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); meshes.push(im); (lv === 1 ? near : lv === 0 ? far : lv === 2 ? tiny : tinyLine).add(im); } }
    near.visible = false; tiny.visible = false; tinyLine.visible = false; group.add(near, far, tiny, tinyLine); if (canopy) { canopy.visible = false; group.add(canopy); } lods.push({ centre, near, far, tiny, tinyLine, canopy }); total += list.length;
  }
  group.userData.count = total; group.userData.lods = lods;
  // the tree shapes, their picture sheet and the material are shared between worlds and kept; only this world's placements are freed
  group.userData.dispose = () => { for (const m of meshes) m.dispose(); for (const l of lods) if (l.canopy) l.canopy.geometry.dispose(); canopyMat.dispose(); };
  // call each frame. Close: detailed trees. Middle: simple trees. Far: two crossed pictures per tree. Beyond that a wood is drawn as a single
  // canopy surface (a wood of twenty thousand trees costs a few hundred triangles) and only tree lines keep their pictures.
  group.userData.update = (camPos, dNear = 110, dMid = 380, dFar = 1100) => { for (const l of lods) { const d = l.centre.distanceTo(camPos) - 180, lv = d < dNear ? 1 : d < dMid ? 0 : d < dFar ? 2 : d < dFar * 5 ? 3 : 4; if (l.lv !== lv) { l.lv = lv; l.near.visible = lv === 1; l.far.visible = lv === 0; l.tiny.visible = lv === 2; l.tinyLine.visible = lv === 2 || lv === 3; if (l.canopy) l.canopy.visible = lv >= 3; } } };
  return group;
}

export { buildBuildings } from './buildings.js';
