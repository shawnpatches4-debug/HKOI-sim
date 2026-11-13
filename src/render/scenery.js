// Trees, tree lines and buildings, instanced from the World's cells.
import * as THREE from 'three';
import { weatherise } from './env.js';

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// Tree shapes. Each is built once at unit height and instanced; foliage normals point outward from the crown so the light wraps
// around it softly instead of picking out every facet. `fine` is the close-up version.
function merge(parts) {
  for (const p of parts) if (p.g.index) p.g = p.g.toNonIndexed();
  let nv = 0; for (const p of parts) nv += p.g.attributes.position.count; const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3); let o = 0;
  for (const { g: g0, c, centre, shade } of parts) { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); const p = g.attributes.position, nn = g.attributes.normal, v = new THREE.Vector3(), k = new THREE.Color();
    for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)); pos.set([v.x, v.y, v.z], (o + i) * 3);
      if (centre) { const r = v.clone().sub(centre).normalize().multiplyScalar(0.75).add(new THREE.Vector3(nn.getX(i), nn.getY(i), nn.getZ(i)).multiplyScalar(0.25)).add(new THREE.Vector3(0, 0.25, 0)).normalize(); nor.set([r.x, r.y, r.z], (o + i) * 3); const lit = shade ? 0.62 + 0.5 * Math.max(0, Math.min(1, (v.y - shade[0]) / (shade[1] - shade[0]))) : 1; k.copy(c).multiplyScalar(lit); }
      else { nor.set([nn.getX(i), nn.getY(i), nn.getZ(i)], (o + i) * 3); k.copy(c); }
      col.set([k.r, k.g, k.b], (o + i) * 3); } o += p.count; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}
function lump(r, detail, seed) { const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.82 + 0.36 * hash(Math.round(x * 97), Math.round(y * 89 + z * 61), seed); p.setXYZ(i, x * k, y * k * 0.9, z * k); } return g; }
function broadleaf(fine, seed) {
  const parts = [], bark = new THREE.Color('#4b3d2e'), leaf = new THREE.Color('#47702f'), trunk = new THREE.CylinderGeometry(0.03, 0.055, 0.5, fine ? 7 : 5, 1, true); trunk.translate(0, 0.25, 0); parts.push({ g: trunk, c: bark });
  if (fine) for (const [a, l, y] of [[0.5, 0.3, 0.42], [2.6, 0.28, 0.46], [4.4, 0.26, 0.4]]) { const b = new THREE.CylinderGeometry(0.012, 0.022, l, 5, 1, true); b.translate(0, l / 2, 0); b.rotateZ(0.9); b.rotateY(a); b.translate(0, y, 0); parts.push({ g: b, c: bark }); }
  const centre = new THREE.Vector3(0, 0.66, 0), blobs = fine ? [[0, 0.7, 0, 0.3], [0.2, 0.6, 0.12, 0.22], [-0.2, 0.62, -0.08, 0.23], [0.04, 0.88, -0.05, 0.2], [-0.08, 0.58, 0.2, 0.2], [0.1, 0.62, -0.2, 0.2], [-0.02, 0.5, 0.02, 0.22]] : [[0, 0.7, 0, 0.31], [0.18, 0.6, 0.1, 0.23], [-0.17, 0.62, -0.1, 0.24], [0.02, 0.88, -0.04, 0.2]];
  blobs.forEach(([x, y, z, r], q) => { const g = lump(r, fine ? 1 : 0, seed + q); g.translate(x, y, z); parts.push({ g, c: leaf.clone().offsetHSL((hash(q, seed, 5) - 0.5) * 0.03, 0, (hash(q, seed, 6) - 0.5) * 0.05), centre, shade: [0.4, 1.0] }); });
  return merge(parts);
}
function conifer(fine, seed) {
  const parts = [], bark = new THREE.Color('#463a2c'), leaf = new THREE.Color('#2c4a2e'), trunk = new THREE.CylinderGeometry(0.02, 0.045, 1, 5, 1, true); trunk.translate(0, 0.5, 0); parts.push({ g: trunk, c: bark });
  const tiers = fine ? 7 : 4, centre = new THREE.Vector3(0, 0.55, 0);
  for (let k = 0; k < tiers; k++) { const f = k / (tiers - 1), r = 0.3 * (1 - f * 0.82), hgt = 0.9 / tiers * 1.7, c = new THREE.ConeGeometry(r, hgt, fine ? 9 : 6, 1, true); c.translate(0, 0.2 + f * 0.68 + hgt / 2, 0); c.rotateY(hash(k, seed, 3) * 6.28); parts.push({ g: c, c: leaf.clone().offsetHSL(0, 0, (hash(k, seed, 4) - 0.5) * 0.03), centre, shade: [0.15, 1.0] }); }
  return merge(parts);
}
function bush(seed) { const parts = [], leaf = new THREE.Color('#5d6f3a'), centre = new THREE.Vector3(0, 0.3, 0); [[0, 0.4, 0, 0.42], [0.3, 0.3, 0.1, 0.3], [-0.28, 0.32, -0.12, 0.32]].forEach(([x, y, z, r], q) => { const g = lump(r, 0, seed + q); g.translate(x, y, z); parts.push({ g, c: leaf, centre, shade: [0, 0.8] }); }); return merge(parts); }

// Trees and bushes are grouped into square chunks so the graphics card can skip the ones out of view, and each chunk
// switches to the close-up shapes only when the camera is near.
export function buildTrees(world, opt = {}) {
  const group = new THREE.Group(); group.name = 'trees'; const n = world.n, c = world.cell, half = world.half, CH = opt.chunk || 16, bk = world.biomeKey, pConifer = bk === 'forest' ? 0.62 : bk === 'desert' ? 0 : 0.08;
  const mat = weatherise(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), 0.55);
  const KIND = { leafA: [broadleaf(false, 1), broadleaf(true, 1)], leafB: [broadleaf(false, 9), broadleaf(true, 9)], fir: [conifer(false, 3), conifer(true, 3)], bush: [bush(4), bush(4)] };
  const perCell = opt.perCell || 2, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color(); let total = 0;
  const lods = [];
  for (let cj = 0; cj < n; cj += CH) for (let ci = 0; ci < n; ci += CH) {
    const list = [];
    for (let j = cj; j < Math.min(n, cj + CH); j++) for (let i = ci; i < Math.min(n, ci + CH); i++) { const k = j * n + i, v = world.V[k]; if (v !== 4 && v !== 5 && v !== 3) continue; const cnt = v === 5 ? 2 : v === 3 ? 1 : perCell;
      for (let q = 0; q < cnt; q++) { const e = i * c - half + (hash(i, j, 11 + q) - 0.5) * c, nn = j * c - half + (hash(i, j, 23 + q) - 0.5) * c, r = hash(i, j, 41 + q); if (v === 3) { if (r < 0.45) list.push([e, nn, 1.2 + r * 2.2, r, 'bush']); continue; } const h = world.VH[k] * (0.7 + 0.5 * hash(i, j, 31 + q)); list.push([e, nn, h, r, hash(i, j, 51 + q) < pConifer ? 'fir' : r < 0.5 ? 'leafA' : 'leafB']); } }
    if (!list.length) continue;
    const ce = (ci + CH / 2) * c - half, cn = (cj + CH / 2) * c - half, centre = new THREE.Vector3(ce, world.h(ce, cn), -cn), near = new THREE.Group(), far = new THREE.Group();
    for (const kind of Object.keys(KIND)) { const sub = list.filter(t => t[4] === kind); if (!sub.length) continue;
      for (const lv of [0, 1]) { const im = new THREE.InstancedMesh(KIND[kind][lv], mat, sub.length); im.castShadow = true; im.receiveShadow = false;
        sub.forEach((t, q) => { P.set(t[0], world.h(t[0], t[1]) - 0.15, -t[1]); Q.setFromAxisAngle(up, t[3] * 6.283); const w = t[2] * (kind === 'fir' ? 0.8 + 0.3 * t[3] : kind === 'bush' ? 1.3 : 0.85 + 0.5 * t[3]); S.set(w, t[2], w); M.compose(P, Q, S); im.setMatrixAt(q, M); tint.setHSL(0.26 + (hash(q, 7, ci + cj) - 0.5) * 0.08, 0.1 + 0.25 * hash(q, 9, ci), 0.8 + 0.25 * hash(q, 7, 3)); tint.r = 0.75 + tint.r * 0.4; tint.g = 0.75 + tint.g * 0.4; tint.b = 0.7 + tint.b * 0.4; im.setColorAt(q, tint); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); (lv ? near : far).add(im); } }
    near.visible = false; group.add(near, far); lods.push({ centre, near, far }); total += list.length;
  }
  group.userData.count = total; group.userData.lods = lods;
  // call each frame: chunks within `dist` metres of the camera show the close-up shapes
  group.userData.update = (camPos, dist = 230) => { for (const l of lods) { const nearNow = l.centre.distanceTo(camPos) < dist + 180; if (l.near.visible !== nearNow) { l.near.visible = nearNow; l.far.visible = !nearNow; } } };
  return group;
}

// Buildings: plain walls with a pitched roof for houses and a flat roof for larger blocks.
export function buildBuildings(world) {
  const group = new THREE.Group(); group.name = 'buildings'; const B = world.buildings; if (!B.length) return group;
  const wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, 0.5, 0);
  const roofG = new THREE.BufferGeometry(); { const v = new Float32Array([-0.55, 0, -0.55, 0.55, 0, -0.55, 0.55, 0, 0.55, -0.55, 0, 0.55, 0, 1, -0.55, 0, 1, 0.55]); roofG.setAttribute('position', new THREE.BufferAttribute(v, 3)); roofG.setIndex([0, 4, 1, 3, 2, 5, 0, 3, 5, 0, 5, 4, 1, 4, 5, 1, 5, 2]); roofG.computeVertexNormals(); }
  const wallM = weatherise(new THREE.MeshStandardMaterial({ roughness: 0.9 }), 0.25), roofM = weatherise(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), 1.2);
  const walls = new THREE.InstancedMesh(wallG, wallM, B.length), roofs = new THREE.InstancedMesh(roofG, roofM, B.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const WALL = ['#d8d2c4', '#c9c0ae', '#b8b2a6', '#d9cdb5', '#a9a49b', '#c7b9a2'], ROOF = ['#7a4a3a', '#6b5a50', '#8a5644', '#55504c', '#7d6a58'];
  B.forEach((b, q) => { const g = world.h(b.e, b.n) - 0.3, flat = b.kind === 'block'; P.set(b.e, g, -b.n); Q.setFromAxisAngle(up, -b.rot); S.set(b.w, b.h * (flat ? 1 : 0.68), b.d); M.compose(P, Q, S); walls.setMatrixAt(q, M); c.set(WALL[q % WALL.length]).offsetHSL(0, 0, (hash(q, 1, 2) - 0.5) * 0.08); walls.setColorAt(q, c);
    P.set(b.e, g + b.h * (flat ? 1 : 0.68), -b.n); S.set(b.w, flat ? 0.4 : b.h * 0.42, b.d); M.compose(P, Q, S); roofs.setMatrixAt(q, M); c.set(flat ? '#6b6964' : ROOF[q % ROOF.length]); roofs.setColorAt(q, c); });
  for (const m of [walls, roofs]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); group.add(m); }
  return group;
}
