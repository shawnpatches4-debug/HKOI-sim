// Terrain: the ground mesh and its baked colour map, built from a World.
// Scene axes: x = east, y = up, z = south (so north is -z). One unit = one metre.
import * as THREE from 'three';
import { weatherise } from './env.js';

// base ground colours per setting: [open ground, plough, low crop, tall crop, scrub, forest floor, built-up, road]
export const GROUND = {
  farmland: { open: '#8f9a5b', plough: '#7a6247', low: ['#a9a85a', '#93a654', '#b5ab6a'], high: ['#5f7f3a', '#6d8a3e'], scrub: '#74804c', forest: '#3c5230', built: '#8a8378', road: '#a89c82' },
  desert: { open: '#c9ac7c', plough: '#c0a070', low: ['#c4ab78'], high: ['#b09a66'], scrub: '#9c9360', forest: '#7d7a4e', built: '#b9a788', road: '#d2bb94' },
  town: { open: '#8c965c', plough: '#7b654b', low: ['#a6a65c', '#94a456'], high: ['#617f3c'], scrub: '#73804c', forest: '#3d5231', built: '#86807a', road: '#9a958c' },
  forest: { open: '#7d8f52', plough: '#6f5b43', low: ['#93a055'], high: ['#5c7a39'], scrub: '#647646', forest: '#2f4529', built: '#847d72', road: '#8f8468' },
};

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// Paint the whole map into one texture: fields, woods, roads, villages, with a little mottling so it does not look flat.
export function bakeGroundMap(world, size = 4096) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const x = cv.getContext('2d'), G = GROUND[world.biomeKey] || GROUND.farmland, n = world.n, px = size / (n - 1);
  x.fillStyle = G.open; x.fillRect(0, 0, size, size);
  const img = x.getImageData(0, 0, size, size), d = img.data, col = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = { open: col(G.open), plough: col(G.plough), low: G.low.map(col), high: G.high.map(col), scrub: col(G.scrub), forest: col(G.forest), built: col(G.built), road: col(G.road) };
  // smooth value noise for natural edges and mottling
  const vn = (u, v, sd) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = fu * fu * (3 - 2 * fu), b = fv * fv * (3 - 2 * fv); return (hash(i, j, sd) * (1 - a) + hash(i + 1, j, sd) * a) * (1 - b) + (hash(i, j + 1, sd) * (1 - a) + hash(i + 1, j + 1, sd) * a) * b; };
  const cell = world.cell, half = world.half, V = world.V, mpp = world.size / size, isWood = v => v === 4 || v === 5, cls = (i, j) => V[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  for (let py = 0; py < size; py++) { const nn = half - (py + 0.5) * mpp, gj = (nn + half) / cell, j0 = Math.floor(gj), fj = gj - j0;
    for (let pxx = 0; pxx < size; pxx++) { const e = (pxx + 0.5) * mpp - half, gi = (e + half) / cell, i0 = Math.floor(gi), fi = gi - i0;
      const v00 = cls(i0, j0), v10 = cls(i0 + 1, j0), v01 = cls(i0, j0 + 1), v11 = cls(i0 + 1, j0 + 1), vN = fi < 0.5 ? (fj < 0.5 ? v00 : v01) : (fj < 0.5 ? v10 : v11);
      const mix4 = f => (f(v00) * (1 - fi) + f(v10) * fi) * (1 - fj) + (f(v01) * (1 - fi) + f(v11) * fi) * fj;
      const rag = (vn(e * 0.11, nn * 0.11, 21) - 0.5) * 0.7 + (vn(e * 0.5, nn * 0.5, 22) - 0.5) * 0.25;   // ragged edges for woods and scrub
      let c = C.open, row = 0;
      const F = world.fieldAt(e, nn);
      if (F && vN !== 6) { if (F.t < 0.4) { c = (F.id % 3 === 0) ? C.plough : C.open; if (F.id % 3 === 0) row = Math.sin(F.x * 1.05) * 0.05; } else if (F.t < 0.84) { c = C.low[F.id % C.low.length]; row = Math.sin(F.x * 0.52) * 0.035; } else { c = C.high[F.id % C.high.length]; row = Math.sin(F.x * 0.52) * 0.05; } }
      const wood = mix4(v => isWood(v) ? 1 : 0) + rag, scrub = mix4(v => v === 3 ? 1 : 0) + rag, built = mix4(v => v === 6 ? 1 : 0) + rag * 0.4;
      if (built > 0.5) { c = C.built; row = 0; } else if (wood > 0.5) { c = C.forest; row = 0; } else if (scrub > 0.5) { c = C.scrub; row = 0; }
      const m = 0.88 + row + 0.14 * vn(e * 0.06, nn * 0.06, 3) + 0.1 * vn(e * 0.011, nn * 0.011, 5) + 0.06 * hash(pxx, py, 7) + (F ? (hash(F.id, 1, 9) - 0.5) * 0.16 : 0), o = (py * size + pxx) * 4; d[o] = Math.min(255, c[0] * m); d[o + 1] = Math.min(255, c[1] * m); d[o + 2] = Math.min(255, c[2] * m); d[o + 3] = 255; } }
  x.putImageData(img, 0, 0);
  // plough lines and crop rows inside fields, roads on top
  const P = (e, nn) => [(e + world.half) / world.size * size, (1 - (nn + world.half) / world.size) * size];
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const r of world.roads) { x.strokeStyle = 'rgba(60,52,40,.35)'; x.lineWidth = Math.max(3, r.w * 1.9 * size / world.size); x.beginPath(); r.pts.forEach((p, i) => { const [a, b] = P(p[0], p[1]); if (i) x.lineTo(a, b); else x.moveTo(a, b); }); x.stroke(); x.strokeStyle = G.road; x.lineWidth = Math.max(2, r.w * 1.2 * size / world.size); x.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; return tex;
}

export function buildTerrain(world) {
  const n = world.n, geo = new THREE.PlaneGeometry(world.size, world.size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  // PlaneGeometry rows run from -z (north) to +z (south); world rows run from south (j = 0) to north
  for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) pos.setY(r * n + i, world.H[(n - 1 - r) * n + i]);
  geo.computeVertexNormals();
  const map = bakeGroundMap(world);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
  // close-up detail the baked map cannot hold: world-space noise breaks up the colour and roughens the lighting near the camera
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp;
      float hk_h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hk_n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hk_h(i), hk_h(i + vec2(1, 0)), f.x), mix(hk_h(i + vec2(0, 1)), hk_h(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { float dC = length(cameraPosition - vWp); float near = 1.0 - smoothstep(60.0, 600.0, dC);
        float g = hk_n(vWp.xz * 0.9) * 0.5 + hk_n(vWp.xz * 3.7) * 0.3 + hk_n(vWp.xz * 0.12) * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.72 + 0.5 * g, 0.55 * near + 0.25); }`);
  };
  weatherise(mat, 1);
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.name = 'terrain';
  return { mesh, map };
}
