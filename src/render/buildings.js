// Buildings: village houses with pitched tiled roofs and chimneys, panel-built blocks with flat roofs, and the fences and
// walls around house plots. Everything is two instanced shapes (a box and a roof), and the surface detail (windows, doors,
// plaster, brick, panel seams, roof tiles, grime) is drawn by the material from each face's size in metres, so it stays
// crisp at any distance and costs no pictures. Fences are for looks only: the battle model does not know them.
import * as THREE from 'three';
import { weatherise, atmosphere } from './env.js';

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// kinds of box (aStyle.y): 0 plastered house, 1 brick house, 2 panel block, 3 chimney, 4 picket fence, 5 concrete fence, 6 flat roof slab
const NOISE = /* glsl */`
  float hb(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float nb(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hb(i), hb(i + vec2(1, 0)), f.x), mix(hb(i + vec2(0, 1)), hb(i + vec2(1, 1)), f.x), f.y); }
  float box1(float x, float hw, float aa){ return clamp((hw - abs(x)) / aa + 0.5, 0.0, 1.0); }
`;
const VERT = /* glsl */`
  vBox = position; vBoxN = normal; vStyle = aStyle;
  #ifdef USE_INSTANCING
    vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #else
    vScale = vec3(1.0);
  #endif
`;
const WALL = /* glsl */`
  #include <color_fragment>
  float hkGlass = 0.0;
  {
    vec3 an = abs(vBoxN); bool top = an.y > 0.5; float seed = vStyle.x, kind = vStyle.y;
    float faceW = an.x > 0.5 ? vScale.z : vScale.x, u = (an.x > 0.5 ? vBox.z + 0.5 : vBox.x + 0.5) * faceW, v = vBox.y * vScale.y;
    float faceId = (an.x > 0.5 ? 1.0 : 0.0) + (vBoxN.x + vBoxN.z > 0.0 ? 2.0 : 0.0);
    float aa = max(fwidth(u), fwidth(v)) + 0.004, far = smoothstep(0.25, 0.9, aa);   /* far: detail smaller than a pixel is blended to its average */
    vec3 wall = diffuseColor.rgb;
    float grain = nb(vec2(u, v) * 9.0) * 0.5 + nb(vec2(u, v) * 2.3 + seed * 31.0) * 0.5;
    float streak = nb(vec2(u * 2.2 + seed * 17.0, v * 0.22));
    // brick: courses with mortar, each brick its own shade
    vec2 bq = vec2(u / 0.26, v / 0.085); bq.x += 0.5 * mod(floor(bq.y), 2.0); vec2 bf = fract(bq);
    float mortar = max(1.0 - box1(bf.x - 0.5, 0.46, aa / 0.26), 1.0 - box1(bf.y - 0.5, 0.42, aa / 0.085)) * (1.0 - far);
    vec3 brick = mix(vec3(0.33, 0.13, 0.085), vec3(0.50, 0.23, 0.15), hb(floor(bq) + seed)) * (0.8 + 0.4 * grain); brick = mix(brick, vec3(0.50, 0.47, 0.42), mortar * 0.8);
    if (kind < 2.5 && !top) {
      bool panel = kind > 1.5;
      float nF = max(1.0, floor(vScale.y / (panel ? 2.8 : 2.9) + 0.35)), fh = vScale.y / nF, fl = min(floor(v / fh), nF - 1.0), fv = (v - fl * fh);
      float nB = max(1.0, floor(faceW / (panel ? 3.3 : 3.1) + 0.5)), bw = faceW / nB, bi = min(floor(u / bw), nB - 1.0), bu = u - (bi + 0.5) * bw;
      float r = hb(vec2(bi + faceId * 17.0 + seed * 91.0, fl * 7.0 + seed * 53.0));
      // the wall itself
      if (kind > 0.5 && !panel) wall = brick * (0.9 + 0.2 * wall);
      else {
        wall *= 0.86 + 0.22 * grain;
        if (panel) { float tone = hb(vec2(bi + faceId * 5.0, fl) + seed * 3.0); wall *= 0.9 + 0.16 * tone;   /* each concrete panel a little different, with a dark joint around it */
          float seam = max(1.0 - box1(bu, bw * 0.5 - 0.03, aa), 1.0 - box1(fv - fh * 0.5, fh * 0.5 - 0.03, aa)); wall *= 1.0 - 0.45 * seam * (1.0 - far); }
        else { float bare = smoothstep(0.74, 0.82, nb(vec2(u, v) * 0.45 + seed * 77.0) + (0.25 - min(v, 1.2) * 0.2)); wall = mix(wall, brick, bare * 0.9); }   /* plaster fallen away, mostly low down */
      }
      // windows and the door
      float gable = (!panel && an.x > 0.5) ? 1.0 : 0.0;
      float has = step(mix(0.1, 0.55, gable), r);
      float ww = panel ? 0.78 : 0.58, w0 = panel ? 0.95 : 0.95, w1 = panel ? 2.3 : 2.15;
      float doorBay = floor(hb(vec2(seed * 13.0, 2.0)) * nB), isDoor = (fl < 0.5 && faceId < 0.5 && abs(bi - doorBay) < 0.5) ? 1.0 : 0.0;
      float wx = box1(bu, ww, aa), wy = box1(fv - (w0 + w1) * 0.5, (w1 - w0) * 0.5, aa), win = wx * wy * has * (1.0 - isDoor);
      float frame = box1(bu, ww + 0.07, aa) * box1(fv - (w0 + w1) * 0.5, (w1 - w0) * 0.5 + 0.07, aa) * has * (1.0 - isDoor);
      float bars = min(box1(bu, 0.025, aa) + box1(fv - (w0 + (w1 - w0) * 0.62), 0.025, aa), 1.0);
      float sill = box1(bu, ww + 0.12, aa) * box1(fv - (w0 - 0.09), 0.05, aa) * has * (1.0 - isDoor);
      float fk = hb(vec2(seed * 7.0, 5.0)); vec3 frameCol = fk < 0.4 ? vec3(0.72, 0.71, 0.66) : fk < 0.6 ? vec3(0.2, 0.12, 0.07) : fk < 0.82 ? vec3(0.10, 0.22, 0.36) : vec3(0.12, 0.28, 0.16);   /* white, brown, or the painted blue and green of village houses */
      vec3 glassCol = mix(vec3(0.025, 0.03, 0.035), vec3(0.16, 0.15, 0.12), step(0.72, hb(vec2(bi + seed * 3.0, fl + faceId))) * 0.8);   /* a pale curtain behind some panes */
      wall *= 1.0 - 0.3 * has * (1.0 - isDoor) * box1(bu, ww + 0.1, aa) * smoothstep(0.9, 0.0, w0 - fv) * step(fv, w0) * streak;   /* dirt run-off under the sill */
      wall = mix(wall, frameCol, frame * (1.0 - far * 0.6)); wall = mix(wall, vec3(0.6, 0.59, 0.55), sill * (1.0 - far));
      wall = mix(wall, mix(glassCol, frameCol, bars * (1.0 - far)), win); hkGlass = win * (1.0 - bars) * (1.0 - far * 0.5);
      float door = isDoor * box1(bu, 0.5, aa) * step(fv, 2.05);
      vec3 doorCol = mix(vec3(0.16, 0.2, 0.26), vec3(0.24, 0.13, 0.07), step(0.5, hb(vec2(seed * 5.0, 9.0)))) * (0.8 + 0.3 * step(0.06, abs(fract(bu * 4.0 + 0.5) - 0.5)));
      wall = mix(wall, doorCol, door); wall = mix(wall, frameCol * 0.8, isDoor * box1(bu, 0.58, aa) * step(fv, 2.13) * (1.0 - door));
      // weather: a darker foot, splash-back from the ground, streaks from the eaves
      float plinth = step(v, 0.5); wall = mix(wall, wall * vec3(0.52, 0.52, 0.54), plinth * (panel ? 0.8 : 0.6));
      wall *= 1.0 - 0.28 * smoothstep(1.6, 0.0, v) * (0.5 + 0.5 * grain);
      wall *= 1.0 - 0.22 * smoothstep(0.55, 0.9, streak) * smoothstep(vScale.y - 2.5, vScale.y, v);
      wall *= 1.0 - 0.38 * smoothstep(vScale.y - 0.55, vScale.y - 0.05, v) * (panel ? 0.3 : 1.0);   /* shade under the eaves */
      if (!panel) { float trim = box1(bu, ww + 0.2, aa) * box1(fv - (w0 + w1) * 0.5, (w1 - w0) * 0.5 + 0.2, aa) * has * (1.0 - isDoor) * (1.0 - frame); wall = mix(wall, mix(wall, frameCol, 0.55) * 1.1, trim * step(0.6, fk) * (1.0 - far)); }   /* a painted surround on the coloured ones */
    } else if (top && kind < 2.5) { wall = vec3(0.16, 0.16, 0.165) * (0.75 + 0.5 * grain);
    } else if (kind < 3.5) { wall = brick * (1.0 - 0.5 * smoothstep(vScale.y - 0.5, vScale.y, v));   /* chimney, sooty at the top */
    } else if (kind < 4.5) {   /* picket fence: upright boards with gaps and pointed tops, on two rails */
      float pk = fract(u / 0.14) - 0.5, tipH = vScale.y - abs(pk) * 0.4, picket = step(abs(pk), 0.34) * step(v, tipH - 0.12 * step(0.5, an.y));
      float rail = step(abs(v - 0.3), 0.04) + step(abs(v - vScale.y + 0.3), 0.04);
      if (picket + rail < 0.5 && far < 0.6) discard;
      wall *= (0.7 + 0.5 * hb(vec2(floor(u / 0.14), seed * 9.0))) * (0.85 + 0.3 * grain) * mix(1.0, 0.62, far * (1.0 - step(0.5, picket + rail)));
    } else if (kind < 5.5) {   /* concrete fence slabs between posts */
      float slab = fract(u / 2.5) - 0.5; wall *= 0.85 + 0.25 * grain; wall *= 1.0 - 0.3 * step(0.46, abs(slab)) * (1.0 - far);
      vec2 dq = abs(fract(vec2(u / 0.5, v / 0.5)) - 0.5); wall *= 1.0 + 0.1 * (dq.x + dq.y - 0.5) * step(0.25, v) * step(v, vScale.y - 0.2) * (1.0 - far);
      wall *= 1.0 - 0.25 * smoothstep(0.7, 0.0, v) - 0.2 * smoothstep(0.5, 0.9, streak);
    } else { wall = top ? vec3(0.085, 0.085, 0.09) * (0.7 + 0.6 * grain) + vec3(0.05) * step(0.75, nb(vec2(u, vBox.z * vScale.z) * 0.3 + seed)) : vec3(0.36, 0.36, 0.35) * (0.8 + 0.3 * grain) * (1.0 - 0.3 * smoothstep(0.6, 0.9, streak)); }
    diffuseColor.rgb = wall;
  }
`;
const ROOF = /* glsl */`
  #include <color_fragment>
  {
    vec3 pm = vBox * vScale, on = normalize(cross(dFdx(pm), dFdy(pm))); float seed = vStyle.x, kind = vStyle.y;
    vec3 col = diffuseColor.rgb;
    if (abs(on.z) > 0.9) {   /* the gable end under the roof: upright boards */
      float bd = fract(pm.x / 0.16); col = mix(vec3(0.30, 0.22, 0.15), vec3(0.42, 0.33, 0.24), hb(vec2(floor(pm.x / 0.16), seed * 7.0))) * (0.75 + 0.25 * step(0.08, bd)) * (0.8 + 0.3 * nb(pm.xy * vec2(6.0, 0.6)));
    } else {
      float run = pm.z, slope = length(vec2(0.55 * vScale.x, vScale.y)), down = (1.0 - vBox.y) * slope, aa = max(fwidth(run), fwidth(down)) + 0.004, far = smoothstep(0.12, 0.5, aa);
      float tone = nb(vec2(run, down) * 0.7 + seed * 50.0), moss = smoothstep(0.62, 0.8, nb(vec2(run * 0.5, down * 0.9) + seed * 21.0) + down / slope * 0.15);
      if (kind < 0.5) {   /* clay tiles in overlapping courses */
        float course = down / 0.33, ci = floor(course), cf = fract(course), tx = run / 0.24 + 0.5 * mod(ci, 2.0), ti = floor(tx), tf = fract(tx);
        float shadeC = mix(0.72, 1.08, smoothstep(0.0, 0.35, cf)) * (1.0 - 0.25 * smoothstep(0.9, 1.0, cf)), gapT = 1.0 - 0.22 * step(abs(tf - 0.5), 0.06 + aa);
        float each = hb(vec2(ti, ci) + seed * 9.0); col *= mix(1.0, shadeC * gapT * (0.82 + 0.36 * each), 1.0 - far);
      } else if (kind < 1.5) {   /* corrugated sheets */
        float rib = 0.5 + 0.5 * cos(run / 0.18 * 6.2832), sheet = step(0.97, fract(down / 1.75)); col *= mix(1.0, (0.82 + 0.3 * rib) * (1.0 - 0.3 * sheet), 1.0 - far);
        col = mix(col, vec3(0.34, 0.17, 0.09), smoothstep(0.62, 0.9, nb(vec2(run * 0.9, down * 0.4) + seed * 33.0)) * 0.35);   /* rust */
      } else {   /* tarred felt or slate */
        float course = down / 0.3, tx = run / 0.5 + 0.5 * mod(floor(course), 2.0); col *= mix(1.0, (0.85 + 0.25 * hb(vec2(floor(tx), floor(course)) + seed)) * (1.0 - 0.3 * step(0.93, fract(course))), 1.0 - far);
      }
      col *= 0.82 + 0.3 * tone; col = mix(col, vec3(0.16, 0.2, 0.1), moss * 0.45);
      col *= 1.0 - 0.3 * smoothstep(0.985, 1.0, vBox.y) + 0.0;   /* ridge */
    }
    diffuseColor.rgb = col;
  }
`;

function styled(mat, body, glass) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aStyle; varying vec3 vBox; varying vec3 vBoxN; varying vec3 vScale; varying vec4 vStyle;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBox; varying vec3 vBoxN; varying vec3 vScale; varying vec4 vStyle;\n' + NOISE).replace('#include <color_fragment>', body);
    if (glass) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, hkGlass);');
  };
  const m = atmosphere(weatherise(mat, glass ? 0.25 : 1.2)); m.customProgramCacheKey = () => 'hkbuilding' + (glass ? 'w' : 'r'); return m;
}

const WALLS = ['#d9d4c7', '#cfc6b0', '#c5cace', '#d8cfae', '#b4c4c8', '#bdc8ac', '#c7b8a0', '#d6d0c4'], PANEL = ['#a9a8a2', '#b3aea2', '#9ba1a3', '#aaa596'];
const ROOFS = [['#8a4a36', 0], ['#7d4433', 0], ['#96553c', 0], ['#6f7376', 1], ['#7d8284', 1], ['#5a5350', 1], ['#3c3b3c', 2], ['#4a4442', 2]];
const DESERT_WALLS = ['#c9b48f', '#bfa983', '#d1bf9c', '#b8a07a'];

export function buildBuildings(world) {
  const group = new THREE.Group(); group.name = 'buildings'; const B = world.buildings; if (!B.length) return group;
  const desert = world.biomeKey === 'desert';
  // every box in the place: walls, chimneys, roof slabs, fence pieces
  const boxes = [], roofs = [];   /* [e, n, y, rot, sx, sy, sz, colour, seed, kind] */
  B.forEach((b, q) => {
    const g = world.h(b.e, b.n) - 0.35, block = b.kind === 'block', flat = block || desert, seed = hash(q, 3, 5), wallH = flat ? b.h : b.h * 0.66;
    const kind = block ? 2 : (!desert && hash(q, 4, 5) < 0.2) ? 1 : 0;
    const colour = new THREE.Color(block ? PANEL[q % PANEL.length] : desert ? DESERT_WALLS[q % DESERT_WALLS.length] : WALLS[Math.floor(hash(q, 6, 5) * WALLS.length)]).offsetHSL(0, 0, (hash(q, 1, 2) - 0.5) * 0.06);
    boxes.push([b.e, b.n, g, b.rot, b.w, wallH, b.d, colour, seed, kind]);
    if (flat) boxes.push([b.e, b.n, g + wallH, b.rot, b.w + 0.5, 0.45, b.d + 0.5, new THREE.Color('#777777'), seed, 6]);
    else {
      const [rc, rk] = ROOFS[Math.floor(hash(q, 7, 5) * ROOFS.length)], roofH = b.h * 0.42;
      // the ridge runs along the longer side
      const turn = b.w >= b.d; roofs.push([b.e, b.n, g + wallH, b.rot + (turn ? Math.PI / 2 : 0), turn ? b.d : b.w, roofH, turn ? b.w : b.d, new THREE.Color(rc).offsetHSL(0, 0, (hash(q, 8, 5) - 0.5) * 0.06), seed, rk, turn]);
      if (hash(q, 9, 5) < 0.75) { const along = (hash(q, 10, 5) - 0.5) * 0.5, cs = Math.cos(b.rot), sn = Math.sin(b.rot), off = along * (turn ? b.w : b.d), dx = turn ? off : 0, dz = turn ? 0 : off;
        boxes.push([b.e + dx * cs - dz * sn, b.n + dx * sn + dz * cs, g + wallH + roofH * 0.55, b.rot, 0.62, roofH * 0.45 + 0.9, 0.62, new THREE.Color('#8a5a48'), seed, 3]); }
    }
    // a fenced plot around most houses: straight runs cut into short pieces that step with the ground, with a gap for the gate
    if (!block && !desert && hash(q, 11, 5) < 0.72) {
      const concrete = hash(q, 12, 5) < 0.3, fh = concrete ? 1.7 : 1.05 + hash(q, 13, 5) * 0.25, px = b.w / 2 + 4 + hash(q, 14, 5) * 5, pz = b.d / 2 + 4 + hash(q, 15, 5) * 6, cs = Math.cos(b.rot), sn = Math.sin(b.rot);
      const fc = new THREE.Color(concrete ? '#9c9a94' : ['#6a5642', '#8f8674', '#4f5d49', '#7b6a55'][Math.floor(hash(q, 16, 5) * 4)]);
      const sides = [[-px, -pz, px, -pz], [px, -pz, px, pz], [px, pz, -px, pz], [-px, pz, -px, -pz]];
      sides.forEach(([x0, z0, x1, z1], si) => {
        if (hash(q, 20 + si, 5) < 0.14) return;
        const L = Math.hypot(x1 - x0, z1 - z0), nSeg = Math.max(1, Math.round(L / 5)), gate = si === 0 ? Math.floor(hash(q, 30, 5) * nSeg) : -1;
        for (let k = 0; k < nSeg; k++) {
          if (k === gate) continue;
          const t = (k + 0.5) / nSeg, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, e = b.e + x * cs - z * sn, nn = b.n + x * sn + z * cs;
          if (world.veg(e, nn).cls === 7 || world.buildingAt(e, nn, 1.5)) continue;
          boxes.push([e, nn, world.h(e, nn) - 0.25, b.rot + (si % 2 ? Math.PI / 2 : 0), L / nSeg + 0.02, fh + 0.25, concrete ? 0.14 : 0.07, fc, hash(q, 40 + si, k), concrete ? 5 : 4]);
        }
      });
    }
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const fill = (geo, mat, list) => {
    const g = geo.clone(), im = new THREE.InstancedMesh(g, mat, list.length), style = new Float32Array(list.length * 4);
    list.forEach((o, q) => { P.set(o[0], o[2], -o[1]); Q.setFromAxisAngle(up, o[3]);   /* a turn of +rot here puts the walls where the battle model's footprint is (east = x, north = -z) */ S.set(o[4], o[5], o[6]); M.compose(P, Q, S); im.setMatrixAt(q, M); im.setColorAt(q, o[7]); style.set([o[8], o[9], 0, 0], q * 4); });
    g.setAttribute('aStyle', new THREE.InstancedBufferAttribute(style, 4));
    im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); group.add(im); return im;
  };
  const wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, 0.5, 0);
  const roofG = new THREE.BufferGeometry(); { const v = new Float32Array([-0.55, 0, -0.55, 0.55, 0, -0.55, 0.55, 0, 0.55, -0.55, 0, 0.55, 0, 1, -0.55, 0, 1, 0.55]); roofG.setAttribute('position', new THREE.BufferAttribute(v, 3)); roofG.setIndex([0, 4, 1, 3, 2, 5, 0, 3, 5, 0, 5, 4, 1, 4, 5, 1, 5, 2]); roofG.computeVertexNormals(); }
  const wallM = styled(new THREE.MeshStandardMaterial({ roughness: 0.9 }), WALL, true), roofM = styled(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, side: THREE.DoubleSide }), ROOF, false);
  fill(wallG, wallM, boxes); if (roofs.length) fill(roofG, roofM, roofs);
  wallG.dispose(); roofG.dispose();
  addPoles(world, group);
  group.userData.dispose = () => group.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); if (m.isInstancedMesh) m.dispose(); });
  return group;
}

// A line of wooden power poles beside each road, with two sagging wires. For looks and for a sense of scale only.
function addPoles(world, group) {
  if (world.biomeKey === 'desert') return;
  const SPAN = 62, SIDE = 6.5, TOP = 8.2, spots = [], wires = [];
  for (const road of world.roads) {
    let carry = SPAN / 2, prev = null;
    for (let s = 0; s < road.pts.length - 1; s++) {
      const [e0, n0] = road.pts[s], [e1, n1] = road.pts[s + 1], L = Math.hypot(e1 - e0, n1 - n0), ux = (e1 - e0) / L, uz = (n1 - n0) / L;
      for (let d = carry; d < L; d += SPAN) {
        const e = e0 + ux * d - uz * SIDE, n = n0 + uz * d + ux * SIDE;
        if (!world.inside(e, n) || world.buildingAt(e, n, 2)) { prev = null; continue; }
        const p = { e, n, y: world.h(e, n), a: Math.atan2(-ux, uz) };   /* turned so the cross-arm lies across the road */
        if (prev && Math.hypot(prev.e - e, prev.n - n) < SPAN * 1.6) wires.push([prev, p]);
        spots.push(p); prev = p;
      }
      carry = (carry + Math.ceil((L - carry) / SPAN) * SPAN) - L;
    }
    prev = null;
  }
  if (!spots.length) return;
  // one pole: a tapering post and a short cross-arm near the top
  const post = new THREE.CylinderGeometry(0.09, 0.14, TOP + 0.6, 6).toNonIndexed(), arm = new THREE.BoxGeometry(1.7, 0.1, 0.1).toNonIndexed(); post.translate(0, (TOP + 0.6) / 2 - 0.3, 0); arm.translate(0, TOP, 0);
  const g = new THREE.BufferGeometry(), pos = new Float32Array((post.attributes.position.count + arm.attributes.position.count) * 3), nor = new Float32Array(pos.length);
  pos.set(post.attributes.position.array, 0); pos.set(arm.attributes.position.array, post.attributes.position.count * 3); nor.set(post.attributes.normal.array, 0); nor.set(arm.attributes.normal.array, post.attributes.normal.count * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); post.dispose(); arm.dispose();
  const mat = atmosphere(weatherise(new THREE.MeshStandardMaterial({ color: '#4d4033', roughness: 0.95 }), 0.3));
  const im = new THREE.InstancedMesh(g, mat, spots.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, q) => { P.set(p.e, p.y, -p.n); Q.setFromAxisAngle(up, p.a + (hash(q, 5, 77) - 0.5) * 0.08); M.compose(P, Q, S); im.setMatrixAt(q, M); });
  im.castShadow = true; im.receiveShadow = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im);
  // the wires hang in a shallow curve from arm end to arm end
  const lp = [], end = (p, side, out) => { const c = Math.cos(p.a), s = Math.sin(p.a); return out.set(p.e + c * side * 0.78, p.y + TOP + 0.08, -p.n - s * side * 0.78); }, A = new THREE.Vector3(), B = new THREE.Vector3();
  for (const [p, q] of wires) for (const side of [-1, 1]) { end(p, side, A); end(q, side, B); let px = A.x, py = A.y, pz = A.z;
    for (let k = 1; k <= 6; k++) { const t = k / 6, x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t - 4 * t * (1 - t) * 0.9, z = A.z + (B.z - A.z) * t; lp.push(px, py, pz, x, y, z); px = x; py = y; pz = z; } }
  if (lp.length) { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#232326', transparent: true, opacity: 0.45 })); lines.name = 'wires'; group.add(lines); }
}
