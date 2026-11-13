// Trees, tree lines and buildings, instanced from the World's cells.
import * as THREE from 'three';
import { weatherise } from './env.js';

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// one low-polygon tree: a trunk and three stacked, slightly irregular crowns. About 60 triangles.
function treeGeometry(conifer) {
  const parts = [], trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.6, 5); trunk.translate(0, 0.3, 0); parts.push([trunk, new THREE.Color('#4a3b2a')]);
  if (conifer) { for (let k = 0; k < 3; k++) { const c = new THREE.ConeGeometry(0.42 - k * 0.1, 0.5, 7); c.translate(0, 0.45 + k * 0.25, 0); parts.push([c, new THREE.Color('#2f4a2c').offsetHSL(0, 0, k * 0.02)]); } }
  else { const blobs = [[0, 0.72, 0, 0.36], [0.16, 0.6, 0.1, 0.27], [-0.15, 0.62, -0.08, 0.28], [0.02, 0.9, -0.04, 0.24]]; for (const [bx, by, bz, r] of blobs) { const s = new THREE.IcosahedronGeometry(r, 0); s.translate(bx, by, bz); parts.push([s, new THREE.Color('#3f6a34').offsetHSL(0, 0, (by - 0.7) * 0.25)]); } }
  let nv = 0; for (const [g] of parts) nv += g.attributes.position.count; const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = []; let o = 0;
  for (const [g0, c] of parts) { const g = g0.index ? g0 : g0.toNonIndexed(); g.computeVertexNormals(); const p = g.attributes.position, nn = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.set([p.getX(i), p.getY(i), p.getZ(i)], (o + i) * 3); nor.set([nn.getX(i), nn.getY(i), nn.getZ(i)], (o + i) * 3); col.set([c.r, c.g, c.b], (o + i) * 3); } if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(o + g.index.getX(i)); else for (let i = 0; i < p.count; i++) idx.push(o + i); o += p.count; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); return geo;
}

// Trees are grouped into square chunks so the graphics card can skip the ones out of view.
export function buildTrees(world, opt = {}) {
  const group = new THREE.Group(); group.name = 'trees'; const n = world.n, c = world.cell, half = world.half, CH = opt.chunk || 32, conifer = world.biomeKey === 'forest';
  const geoA = treeGeometry(conifer), geoB = treeGeometry(false), mat = weatherise(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 0.55);
  const perCell = opt.perCell || 2, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color(); let total = 0;
  for (let cj = 0; cj < n; cj += CH) for (let ci = 0; ci < n; ci += CH) {
    const list = [];
    for (let j = cj; j < Math.min(n, cj + CH); j++) for (let i = ci; i < Math.min(n, ci + CH); i++) { const k = j * n + i, v = world.V[k]; if (v !== 4 && v !== 5) continue; const cnt = v === 5 ? 2 : perCell; for (let q = 0; q < cnt; q++) { const e = i * c - half + (hash(i, j, 11 + q) - 0.5) * c, nn = j * c - half + (hash(i, j, 23 + q) - 0.5) * c, h = world.VH[k] * (0.7 + 0.5 * hash(i, j, 31 + q)); list.push([e, nn, h, hash(i, j, 41 + q), v]); } }
    if (!list.length) continue;
    for (const [geo, pick] of [[geoA, t => t[3] < 0.6], [geoB, t => t[3] >= 0.6]]) { const sub = list.filter(pick); if (!sub.length) continue; const im = new THREE.InstancedMesh(geo, mat, sub.length); im.castShadow = true; im.receiveShadow = false;
      sub.forEach((t, q) => { P.set(t[0], world.h(t[0], t[1]) - 0.2, -t[1]); Q.setFromAxisAngle(up, t[3] * 6.283); const w = t[2] * (0.75 + 0.5 * t[3]); S.set(w, t[2], w); M.compose(P, Q, S); im.setMatrixAt(q, M); tint.setHSL(0, 0, 0.82 + 0.3 * hash(q, 7, 3)); im.setColorAt(q, tint); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); group.add(im); total += sub.length; }
  }
  group.userData.count = total; return group;
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
