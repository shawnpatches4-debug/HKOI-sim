// Trees and bushes: their pictures (leaves, needles, bark, and a whole-tree picture for far away) are painted in code onto one
// sheet, and their shapes are built from a trunk, a few limbs and many small leaf cards. Three versions of each kind:
// close up (limbs and many cards), middle distance (few big cards), far (two crossed whole-tree pictures).
// Nothing here is downloaded. Shapes are one unit tall with the foot at the origin; the scenery scales them per tree.
import * as THREE from 'three';
import { ENV, atmosphere } from './env.js';

const CS = 512, GRID = 4;   // each picture is 512 px; the sheet holds 4 x 4 of them
// places on the sheet
export const CELLS = { leaf: 0, small: 1, needle: 2, twig: 3, bush: 4, bark: 5, birchBark: 6, pineBark: 7, iBroad: 8, iPoplar: 9, iSpruce: 10, iBirch: 11, iPine: 12, iAcacia: 13, iBush: 14, iShrub: 15 };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(0)},${Math.max(0, s).toFixed(0)}%,${Math.max(0, Math.min(100, l)).toFixed(0)}%,${a})`;

// ---------------------------------------------------------------- painting
function leafShape(c, x, y, len, wid, ang, fill, rib) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.45, -wid, len, 0); c.quadraticCurveTo(len * 0.45, wid, 0, 0); c.fillStyle = fill; c.fill();
  if (rib) { c.strokeStyle = rib; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(len * 0.9, 0); c.stroke(); }
  c.restore();
}
// a spray of twigs growing up from the bottom middle, clothed in leaves. S = picture size; o = { n, len, wid, hue, sat, lit, gaps, twig }
function paintCluster(c, R, S, o) {
  const tips = [], twig = o.twig || '#3b3024';
  const grow = (x, y, ang, len, w, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    c.strokeStyle = twig; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    tips.push([(x + x2) / 2, (y + y2) / 2, ang], [x2, y2, ang]);
    if (depth > 0) { const kids = 2 + (R() < 0.5 ? 1 : 0); for (let k = 0; k < kids; k++) grow(x2, y2, ang + (k - (kids - 1) / 2) * 0.75 + (R() - 0.5) * 0.5, len * (0.62 + R() * 0.2), Math.max(1, w * 0.6), depth - 1); }
  };
  grow(S / 2, S * 0.99, -Math.PI / 2, S * 0.27, S * 0.022, 3);
  const k = S / 512, m = o.len[1] * k * 0.6, list = [];
  // a soft dark mass behind the leaves, so the middle of the spray is solid and only its rim is ragged
  for (const [tx, ty] of tips) { const r = S * (o.mass || 0.12), g = c.createRadialGradient(tx, ty, 0, tx, ty, r), dark = hsl((o.hue[0] + o.hue[1]) / 2, o.sat[0], o.lit[0] + 2, 0.8);
    g.addColorStop(0, dark); g.addColorStop(0.4, dark); g.addColorStop(1, dark.replace(/[\d.]+\)$/, '0)')); c.fillStyle = g; c.beginPath(); c.arc(tx, ty, r, 0, 6.2832); c.fill(); }
  for (let i = 0; i < o.n; i++) {
    const t = tips[Math.floor(R() * tips.length)], rr = S * (o.spread || 0.11) * Math.sqrt(-2 * Math.log(1 - R() * 0.98)) * 0.6, a = R() * 6.2832;
    const x = Math.max(m, Math.min(S - m, t[0] + Math.cos(a) * rr)), y = Math.max(m, Math.min(S - m, t[1] + Math.sin(a) * rr));
    list.push([x, y, t[2] + (R() - 0.5) * 2.6, R()]);
  }
  list.sort((p, q) => p[3] - q[3]);   // dark leaves first, light ones on top
  for (const [x, y, ang, f] of list) {
    const len = (o.len[0] + R() * (o.len[1] - o.len[0])) * k, lit = o.lit[0] + f * (o.lit[1] - o.lit[0]), hue = o.hue[0] + R() * (o.hue[1] - o.hue[0]), sat = o.sat[0] + R() * (o.sat[1] - o.sat[0]);
    c.globalAlpha = 0.62 + 0.38 * R();   /* thin leaves are the first to go in winter (the material raises its cut-off in snow) */
    leafShape(c, x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2, len, len * o.wid, ang, hsl(hue, sat, lit), hsl(hue, sat, lit + 8, 0.6));
  }
  c.globalAlpha = 1;
}
// a conifer bough seen flat: a stem from the left edge to the right with side shoots, all covered in needles
function paintBough(c, R, S, o) {
  const shoots = [[0, S / 2, S * 0.96, S / 2, S * 0.014]];
  for (let k = 0; k < 15; k++) { const t = 0.08 + k / 15 * 0.86, x = t * S * 0.96, side = k % 2 ? 1 : -1, len = S * (0.34 * (1 - t * 0.75) + 0.05), ang = side * (0.75 + R() * 0.3); shoots.push([x, S / 2, x + Math.cos(ang) * len, S / 2 + Math.sin(ang) * len, S * 0.008]); }
  for (const [x1, y1, x2, y2, w] of shoots) { c.strokeStyle = o.twig || '#33291f'; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  c.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) for (const [x1, y1, x2, y2] of shoots) {
    const L = Math.hypot(x2 - x1, y2 - y1), n = Math.round(L / S * 150), a0 = Math.atan2(y2 - y1, x2 - x1);
    for (let i = 0; i < n; i++) {
      const t = R(), x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, side = R() < 0.5 ? 1 : -1, a = a0 + side * (0.5 + R() * 0.7), len = S * (0.03 + R() * 0.035);
      c.strokeStyle = hsl(o.hue[0] + R() * (o.hue[1] - o.hue[0]), o.sat[0] + R() * (o.sat[1] - o.sat[0]), o.lit[0] + (pass ? 0.55 + 0.45 * R() : 0.4 * R()) * (o.lit[1] - o.lit[0])); c.lineWidth = S * 0.006 * (0.8 + R() * 0.8);
      c.beginPath(); c.moveTo(x, y); c.lineTo(Math.max(3, Math.min(S - 3, x + Math.cos(a) * len)), Math.max(3, Math.min(S - 3, y + Math.sin(a) * len))); c.stroke();
    }
  }
}
// bare, tangled twigs with a few small leaves: dry scrub and thorn
function paintTwigs(c, R, S, o) {
  const grow = (x, y, ang, len, w, depth) => {
    const x2 = Math.max(4, Math.min(S - 4, x + Math.cos(ang) * len)), y2 = Math.max(4, Math.min(S - 4, y + Math.sin(ang) * len));
    c.strokeStyle = hsl(30 + R() * 10, 14 + R() * 8, 22 + R() * 16); c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + x2) / 2 + (R() - 0.5) * len * 0.3, (y + y2) / 2, x2, y2); c.stroke();
    if (depth < 3) for (let q = 0; q < o.leaves; q++) { const t = R(), a = R() * 6.28, l = S * (0.022 + R() * 0.02); leafShape(c, x + (x2 - x) * t, y + (y2 - y) * t, l, l * 0.3, a, hsl(o.hue[0] + R() * (o.hue[1] - o.hue[0]), o.sat, o.lit[0] + R() * (o.lit[1] - o.lit[0]))); }
    if (depth > 0) { const kids = 2 + (R() < 0.6 ? 1 : 0); for (let k = 0; k < kids; k++) grow(x2, y2, ang + (k - (kids - 1) / 2) * 0.7 + (R() - 0.5) * 0.6, len * (0.6 + R() * 0.25), Math.max(1, w * 0.62), depth - 1); }
  };
  for (let k = 0; k < 3; k++) grow(S * (0.4 + k * 0.1), S * 0.99, -Math.PI / 2 + (k - 1) * 0.5, S * 0.26, S * 0.018, 4);
}
function paintBark(c, R, S, o) {
  c.fillStyle = hsl(o.hue, o.sat, o.lit); c.fillRect(0, 0, S, S);
  if (o.birch) {
    for (let i = 0; i < 260; i++) { const x = R() * S, y = R() * S, w = S * (0.02 + R() * 0.09); c.strokeStyle = hsl(30, 8, 8 + R() * 16, 0.7 + R() * 0.3); c.lineWidth = 1 + R() * 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + (R() - 0.5) * 3); c.stroke(); }
    for (let i = 0; i < 26; i++) { const x = R() * S, y = R() * S, r = S * (0.02 + R() * 0.05); c.fillStyle = hsl(28, 10, 10 + R() * 10, 0.85); c.beginPath(); c.ellipse(x, y, r * 1.6, r * 0.7, (R() - 0.5) * 0.5, 0, 6.28); c.fill(); }
    return;
  }
  for (let i = 0; i < 520; i++) {
    const x = R() * S, y0 = R() * S, len = S * (0.08 + R() * 0.3), dark = R() < 0.55;
    c.strokeStyle = hsl(o.hue + (R() - 0.5) * 8, o.sat, dark ? o.lit * (0.35 + R() * 0.3) : o.lit * (1.2 + R() * 0.5), 0.8); c.lineWidth = 1.5 + R() * (dark ? 5 : 3); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y0); for (let k = 1; k <= 4; k++) c.lineTo(x + (R() - 0.5) * 9, y0 + len * k / 4); c.stroke();
  }
}
// small copies of a leaf picture in three brightnesses, for stamping whole-tree pictures
function stamps(paint, seed, o) {
  return [-9, 0, 9].map((shift, q) => { const cv = document.createElement('canvas'); cv.width = cv.height = 160; const c = cv.getContext('2d'); paint(c, rng(seed + q * 13), 160, Object.assign({}, o, { lit: [o.lit[0] + shift, o.lit[1] + shift], n: Math.round((o.n || 100) * 0.45) })); return cv; });
}
// A whole tree from the side. crown(R) returns a point [x, y, size] in the picture (0..1, y up) for each clump of leaves.
function paintTree(c, R, S, o) {
  const X = x => x * S, Y = y => (1 - y) * S;
  if (o.trunk) { const [w0, w1, top, col, lean] = o.trunk; c.fillStyle = col; c.beginPath(); c.moveTo(X(0.5 - w0), Y(0)); c.lineTo(X(0.5 + w0), Y(0)); c.lineTo(X(0.5 + (lean || 0) + w1), Y(top)); c.lineTo(X(0.5 + (lean || 0) - w1), Y(top)); c.fill();
    if (o.birch) for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(25,22,20,0.8)'; const y = R() * top; c.fillRect(X(0.5 - w0 + R() * w0 * 1.6), Y(y), S * 0.012, S * 0.004); }
    for (const [x1, y1, x2, y2, w] of o.limbs || []) { c.strokeStyle = col; c.lineWidth = w * S; c.lineCap = 'round'; c.beginPath(); c.moveTo(X(x1), Y(y1)); c.lineTo(X(x2), Y(y2)); c.stroke(); } }
  const pts = []; for (let i = 0; i < o.n; i++) pts.push(o.crown(R));
  // far clumps first and dark, near clumps last and lit from the upper left
  pts.forEach(p => { p[3] = (p[1] - o.lo) / (o.hi - o.lo) * 0.7 + (0.5 - p[0]) * 0.5 + R() * 0.35; }); pts.sort((a, b) => a[3] - b[3]);
  pts.forEach((p, i) => { const f = i / pts.length, img = o.stamps[f < 0.4 ? 0 : f < 0.78 ? 1 : 2], s = p[2] * S; c.save(); c.translate(X(p[0]), Y(p[1])); c.rotate(o.rot == null ? (R() - 0.5) * 2.4 : o.rot(p, R)); c.drawImage(img, -s / 2, -s / 2, s, s); c.restore(); });
}
const inEllipse = (R, cx, cy, rx, ry, size) => { const a = R() * 6.2832, r = Math.sqrt(R()); return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, size * (0.8 + R() * 0.5)]; };

let sheet = null;
// Paint the sheet once. Returns the texture.
export function floraSheet() {
  if (sheet) return sheet;
  const W = CS * GRID, cv = document.createElement('canvas'); cv.width = cv.height = W; const c = cv.getContext('2d', { willReadFrequently: true });
  const cell = (k, f) => { c.save(); c.translate((k % GRID) * CS, Math.floor(k / GRID) * CS); c.beginPath(); c.rect(0, 0, CS, CS); c.clip(); f(); c.restore(); };
  const LEAF = { n: 1300, len: [17, 29], wid: 0.36, hue: [84, 112], sat: [30, 46], lit: [15, 37], spread: 0.13 };
  const SMALL = { n: 1500, len: [10, 17], wid: 0.44, hue: [70, 100], sat: [34, 50], lit: [20, 42], spread: 0.15, mass: 0.12, twig: '#4a4036' };
  const BUSH = { n: 1300, mass: 0.2, len: [14, 25], wid: 0.4, hue: [78, 108], sat: [26, 40], lit: [14, 34], spread: 0.2 };
  const NEEDLE = { hue: [118, 150], sat: [22, 36], lit: [9, 30] }, PINE = { hue: [95, 125], sat: [24, 36], lit: [13, 36] };
  const TWIG = { leaves: 3, hue: [62, 84], sat: 22, lit: [30, 46] };
  cell(CELLS.leaf, () => paintCluster(c, rng(11), CS, LEAF));
  cell(CELLS.small, () => paintCluster(c, rng(12), CS, SMALL));
  cell(CELLS.needle, () => paintBough(c, rng(13), CS, NEEDLE));
  cell(CELLS.twig, () => paintTwigs(c, rng(14), CS, TWIG));
  cell(CELLS.bush, () => paintCluster(c, rng(15), CS, BUSH));
  cell(CELLS.bark, () => paintBark(c, rng(16), CS, { hue: 28, sat: 16, lit: 22 }));
  cell(CELLS.birchBark, () => paintBark(c, rng(17), CS, { hue: 45, sat: 10, lit: 68, birch: true }));
  cell(CELLS.pineBark, () => paintBark(c, rng(18), CS, { hue: 20, sat: 32, lit: 30 }));
  // whole trees
  const sLeaf = stamps(paintCluster, 21, LEAF), sSmall = stamps(paintCluster, 22, SMALL), sBush = stamps(paintCluster, 23, BUSH), sNeedle = stamps(paintBough, 24, NEEDLE), sPine = stamps(paintBough, 25, PINE), sTwig = stamps(paintTwigs, 26, TWIG);
  cell(CELLS.iBroad, () => { const R = rng(31), lobes = [[0.5, 0.66, 0.3, 0.26], [0.3, 0.6, 0.2, 0.18], [0.7, 0.6, 0.2, 0.18], [0.5, 0.84, 0.2, 0.14], [0.38, 0.5, 0.16, 0.12], [0.63, 0.5, 0.16, 0.12]];
    paintTree(c, R, CS, { trunk: [0.035, 0.022, 0.5, '#3a2f25'], limbs: [[0.5, 0.36, 0.32, 0.56, 0.018], [0.5, 0.38, 0.68, 0.58, 0.018]], n: 150, lo: 0.36, hi: 0.98, stamps: sLeaf, crown: r => { const L = lobes[Math.floor(r() * lobes.length)]; return inEllipse(r, L[0], L[1], L[2] * 0.82, L[3] * 0.82, 0.2); } }); });
  cell(CELLS.iPoplar, () => { const R = rng(32); paintTree(c, R, CS, { trunk: [0.03, 0.012, 0.6, '#4a4238'], n: 170, lo: 0.1, hi: 0.98, stamps: sSmall, crown: r => { const y = 0.12 + r() * 0.82, w = 0.13 * Math.sin(Math.min(1, (y - 0.08) / 0.5) * 1.5708) * (y > 0.6 ? 1 - (y - 0.6) / 0.42 * 0.8 : 1); return [0.5 + (r() - 0.5) * 2 * w, y, 0.11 * (0.8 + r() * 0.5)]; }, rot: (p, r) => (p[0] - 0.5) * 3 + (r() - 0.5) * 0.6 }); });
  cell(CELLS.iSpruce, () => { const R = rng(33); paintTree(c, R, CS, { trunk: [0.022, 0.006, 0.96, '#30271f'], n: 150, lo: 0.1, hi: 0.98, stamps: sNeedle, crown: r => { const y = 0.14 + Math.pow(r(), 0.8) * 0.84, w = 0.3 * (1 - (y - 0.14) / 0.9) + 0.01, side = r() < 0.5 ? -1 : 1, x = side * (0.03 + r() * w); return [0.5 + x, y - Math.abs(x) * 0.35, Math.max(0.07, Math.abs(x) * 1.1 + 0.07)]; }, rot: p => (p[0] < 0.5 ? Math.PI - 0.35 : 0.35) }); });
  cell(CELLS.iBirch, () => { const R = rng(34); paintTree(c, R, CS, { trunk: [0.02, 0.008, 0.9, '#d8d4c8'], birch: true, limbs: [[0.5, 0.45, 0.36, 0.66, 0.01], [0.5, 0.52, 0.64, 0.72, 0.01]], n: 85, lo: 0.36, hi: 0.98, stamps: sSmall, crown: r => inEllipse(r, 0.5, 0.68, 0.2, 0.27, 0.15), rot: (p, r) => Math.PI + (r() - 0.5) * 0.9 }); });
  cell(CELLS.iPine, () => { const R = rng(35); paintTree(c, R, CS, { trunk: [0.026, 0.014, 0.8, '#6a4630', 0.02], limbs: [[0.51, 0.62, 0.34, 0.76, 0.014], [0.52, 0.66, 0.7, 0.8, 0.014]], n: 80, lo: 0.6, hi: 0.98, stamps: sPine, crown: r => inEllipse(r, 0.52, 0.82, 0.25, 0.13, 0.19) }); });
  cell(CELLS.iAcacia, () => { const R = rng(36); paintTree(c, R, CS, { trunk: [0.03, 0.016, 0.55, '#4b3f33', 0.03], limbs: [[0.53, 0.5, 0.2, 0.82, 0.016], [0.53, 0.5, 0.8, 0.84, 0.016], [0.53, 0.55, 0.5, 0.86, 0.014]], n: 110, lo: 0.7, hi: 0.98, stamps: sSmall, crown: r => inEllipse(r, 0.5, 0.86, 0.42, 0.09, 0.15) }); });
  cell(CELLS.iBush, () => { const R = rng(37); paintTree(c, R, CS, { n: 110, lo: 0.0, hi: 0.9, stamps: sBush, crown: r => { const p = inEllipse(r, 0.5, 0.36, 0.4, 0.36, 0.3); p[1] = Math.max(0.16, p[1]); return p; } }); });
  cell(CELLS.iShrub, () => { const R = rng(38); paintTree(c, R, CS, { n: 26, lo: 0.0, hi: 0.9, stamps: sTwig, crown: r => [0.5 + (r() - 0.5) * 0.5, 0.42 + r() * 0.1, 0.8], rot: (p, r) => (p[0] - 0.5) * 2.2 + (r() - 0.5) * 0.3 }); });
  // clear pixels carry the colour of their picture, so no dark fringe appears where leaves are cut out
  const im = c.getImageData(0, 0, W, W), d = im.data;
  for (let k = 0; k < GRID * GRID; k++) {
    const x0 = (k % GRID) * CS, y0 = Math.floor(k / GRID) * CS; let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y0 + CS; y += 2) for (let x = x0; x < x0 + CS; x += 2) { const o = (y * W + x) * 4; if (d[o + 3] > 200) { r += d[o]; g += d[o + 1]; b += d[o + 2]; n++; } }
    if (!n) continue; r /= n; g /= n; b /= n;
    for (let y = y0; y < y0 + CS; y++) for (let x = x0; x < x0 + CS; x++) { const o = (y * W + x) * 4, a = d[o + 3]; if (a < 255) { const f = a / 255; d[o] = d[o] * f + r * (1 - f); d[o + 1] = d[o + 1] * f + g * (1 - f); d[o + 2] = d[o + 2] * f + b * (1 - f); } }
  }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer), W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  sheet = t; return t;
}

// ---------------------------------------------------------------- shapes
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
class Shape {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.l = []; }
  vert(p, n, col, u, v, flutter, leafy) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(col.r, col.g, col.b); this.uv.push(u, v); this.l.push(flutter, leafy); }
  // where (s, t) of a picture lands on the sheet (t runs up the picture)
  static uv(cellK, s, t) { const pad = 0.012; s = pad + s * (1 - 2 * pad); t = pad + t * (1 - 2 * pad); return [((cellK % GRID) + s) / GRID, (Math.floor(cellK / GRID) + 1 - t) / GRID]; }
  // a flat card: centre, half-width vector, half-height vector. `centre` of the crown gives it rounded shading.
  card(mid, right, up, cellK, o) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => mid.clone().addScaledVector(right, a).addScaledVector(up, b)), flip = o.flip ? 1 : 0;
    const st = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([s, t]) => [flip ? 1 - s : s, t]);
    const face = right.clone().cross(up).normalize();
    const put = q => { const P = corners[q], nrm = o.centre ? P.clone().sub(o.centre).multiply(o.squash || V(1, 1, 1)).normalize().multiplyScalar(0.8).addScaledVector(UP, 0.35).normalize() : face;
      const [u, v] = Shape.uv(cellK, st[q][0], st[q][1]), lit = o.shade ? o.shade(P) : 1; this.vert(P, nrm, o.col.clone().multiplyScalar(lit), u, v, o.flutter == null ? 1 : o.flutter * (o.pin ? st[q][o.pin === 'u' ? 0 : 1] : 1), o.leafy == null ? 1 : o.leafy); };
    for (const q of [0, 1, 2, 0, 2, 3]) put(q);
  }
  // a tapering branch from a to b
  tube(a, b, r0, r1, sides, cellK, col, v0 = 0, v1 = 1) {
    const ax = b.clone().sub(a).normalize(), side = Math.abs(ax.y) > 0.9 ? V(1, 0, 0) : UP, x = ax.clone().cross(side).normalize(), z = ax.clone().cross(x).normalize();
    const ring = (c, r, k) => { const ang = k / sides * 6.2832, d = x.clone().multiplyScalar(Math.cos(ang)).addScaledVector(z, Math.sin(ang)); return [c.clone().addScaledVector(d, r), d]; };
    for (let k = 0; k < sides; k++) {
      const [p0, n0] = ring(a, r0, k), [p1, n1] = ring(a, r0, k + 1), [p2, n2] = ring(b, r1, k + 1), [p3, n3] = ring(b, r1, k), s0 = k / sides, s1 = (k + 1) / sides;
      const put = (P, N, s, t) => { const [u, v] = Shape.uv(cellK, s, t); this.vert(P, N, col, u, v, 0, 0); };
      put(p0, n0, s0, v0); put(p1, n1, s1, v0); put(p2, n2, s1, v1); put(p0, n0, s0, v0); put(p2, n2, s1, v1); put(p3, n3, s0, v1);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.l, 2));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
}
const WHITE = new THREE.Color(1, 1, 1);
// clumps of leaf cards over the surface and inside of a rounded crown
function crownCards(S, R, o) {
  const { centre, radii, n, size, cellK } = o;
  for (let i = 0; i < n; i++) {
    const th = R() * 6.2832, cz = R() * 2 - 1, sr = Math.sqrt(1 - cz * cz), depth = o.fill ? 0.45 + 0.55 * Math.pow(R(), 0.5) : 1;
    const dir = V(Math.cos(th) * sr, cz, Math.sin(th) * sr), p = centre.clone().add(V(dir.x * radii.x, dir.y * radii.y, dir.z * radii.z).multiplyScalar(depth));
    const out = V(dir.x, 0, dir.z).normalize(), tan = V(-out.z, 0, out.x), s = size * (0.8 + R() * 0.45), col = o.col.clone().multiplyScalar(0.62 + 0.38 * depth);
    const common = { centre, squash: V(1, radii.x / radii.y, 1), col, shade: P => 0.6 + 0.5 * Math.max(0, Math.min(1, (P.y - (centre.y - radii.y)) / (2 * radii.y))), leafy: o.leafy == null ? 1 : o.leafy };
    // one card standing, facing outward; one lying across it
    const tilt = (R() - 0.5) * 0.9, upv = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt));
    S.card(p, tan.clone().multiplyScalar(s * (o.aspect || 1)), upv.multiplyScalar(s * (o.droop ? -1 : 1)), cellK, Object.assign({ flip: R() < 0.5 }, common));
    if (!o.single) { const la = 0.45 + R() * 0.5, lay = out.clone().multiplyScalar(Math.cos(la)).addScaledVector(UP, Math.sin(la) * (R() < 0.5 ? 1 : -1)); S.card(p, tan.clone().multiplyScalar(s * 0.8), lay.multiplyScalar(s * 0.8), cellK, Object.assign({ flip: R() < 0.5 }, common)); }
  }
}
// far away: two crossed pictures of the whole tree, and a flat tuft of leaves on top so it does not vanish seen from above
function impostor(cellK, width, o = {}) {
  const S = new Shape(), centre = V(0, o.cy == null ? 0.6 : o.cy, 0), col = o.col || WHITE;
  for (const a of [0.4, 0.4 + Math.PI / 2]) S.card(V(0, 0.5, 0), V(Math.cos(a) * width / 2, 0, Math.sin(a) * width / 2), V(0, 0.5, 0), cellK, { centre, col, flutter: 0.35, pin: 'v', leafy: o.leafy == null ? 1 : o.leafy, shade: P => 0.8 + 0.25 * P.y });
  if (o.top) S.card(V(0, o.top[0], 0), V(o.top[1], 0, 0), V(0, 0, o.top[1]), o.top[2], { centre: V(0, o.top[0] - 0.3, 0), col: col.clone().multiplyScalar(0.95), flutter: 0.3, leafy: o.leafy == null ? 1 : o.leafy });
  return S.build();
}

const BARK = new THREE.Color(1, 1, 1), LEAFC = new THREE.Color(1, 1, 1);
const KINDS = {
  // a round-crowned broadleaf (oak, lime, ash)
  broad(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0, 0.66, 0), radii = V(0.3, 0.3, 0.3);
    if (lod === 2) return impostor(CELLS.iBroad, 0.74, { top: [0.72, 0.3, CELLS.leaf] });
    S.tube(V(0, -0.02, 0), V(0.01, 0.42, 0), 0.036, 0.024, lod ? 5 : 7, CELLS.bark, BARK, 0, 1);
    if (!lod) for (let k = 0; k < 5; k++) { const a = k / 5 * 6.2832 + R(), r = 0.16 + R() * 0.08, y0 = 0.3 + R() * 0.12; S.tube(V(0, y0, 0), V(Math.cos(a) * r, y0 + 0.2 + R() * 0.12, Math.sin(a) * r), 0.016, 0.006, 4, CELLS.bark, BARK, 0, 0.5); }
    crownCards(S, R, { centre, radii, n: lod ? 10 : 38, size: lod ? 0.26 : 0.15, cellK: CELLS.leaf, col: LEAFC, fill: true });
    return S.build();
  },
  // a tall narrow poplar
  poplar(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0, 0.56, 0), radii = V(0.105, 0.43, 0.105);
    if (lod === 2) return impostor(CELLS.iPoplar, 0.34, { top: [0.8, 0.09, CELLS.small], cy: 0.55 });
    S.tube(V(0, -0.02, 0), V(0, 0.5, 0), 0.022, 0.012, lod ? 4 : 6, CELLS.bark, BARK, 0, 1);
    crownCards(S, R, { centre, radii, n: lod ? 10 : 26, size: lod ? 0.15 : 0.115, cellK: CELLS.small, col: LEAFC, fill: true, aspect: 0.9 });
    return S.build();
  },
  // a birch: white stem, light open crown
  birch(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0, 0.68, 0), radii = V(0.19, 0.29, 0.19), white = new THREE.Color(1, 1, 1);
    if (lod === 2) return impostor(CELLS.iBirch, 0.52, { top: [0.78, 0.17, CELLS.small], cy: 0.66 });
    S.tube(V(0, -0.02, 0), V(0.012, 0.5, 0), 0.02, 0.012, lod ? 4 : 6, CELLS.birchBark, white, 0, 1); S.tube(V(0.012, 0.5, 0), V(0, 0.92, 0), 0.012, 0.003, 4, CELLS.birchBark, white, 0, 1);
    if (!lod) for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2832 + R(), y0 = 0.45 + R() * 0.2; S.tube(V(0, y0, 0), V(Math.cos(a) * 0.14, y0 + 0.16, Math.sin(a) * 0.14), 0.008, 0.003, 3, CELLS.birchBark, white, 0, 0.4); }
    crownCards(S, R, { centre, radii, n: lod ? 8 : 20, size: lod ? 0.19 : 0.14, cellK: CELLS.small, col: LEAFC, fill: true, droop: true });
    return S.build();
  },
  // a spruce: whorls of drooping boughs down a straight stem
  spruce(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0, 0.5, 0), col = new THREE.Color(1, 1, 1);
    if (lod === 2) return impostor(CELLS.iSpruce, 0.64, { top: [0.4, 0.2, CELLS.needle], cy: 0.45, leafy: 0 });
    S.tube(V(0, -0.02, 0), V(0, 0.9, 0), 0.022, 0.004, lod ? 4 : 5, CELLS.bark, BARK, 0, 1);
    const tiers = lod ? 4 : 8;
    for (let k = 0; k < tiers; k++) {
      const f = k / (tiers - 1), y = 0.16 + f * 0.74, r = 0.31 * (1 - f * 0.86) + 0.02, per = lod ? 3 : 5, a0 = R() * 6.28, gap = 0.74 / (tiers - 1);
      for (let q = 0; q < per; q++) {
        const a = a0 + q / per * 6.2832, out = V(Math.cos(a), 0, Math.sin(a)), tan = V(-out.z, 0, out.x), shade = P => (0.55 + 0.45 * f) * (0.75 + 0.25 * Math.min(1, Math.hypot(P.x, P.z) / r));
        // a bough lying outward and drooping, and a fin hanging under it so the tree has body seen from the side
        const reach = out.clone().multiplyScalar(r / 2).addScaledVector(UP, -r * 0.22);
        S.card(V(0, y, 0).add(reach), reach, tan.clone().multiplyScalar(r * 0.42), CELLS.needle, { centre, squash: V(1, 0.5, 1), col, shade, leafy: 0, flutter: 0.6, pin: 'u' });
        if (!lod || q % 2 === 0) S.card(V(0, y - gap * 0.35, 0).add(reach.clone().multiplyScalar(0.9)), reach.clone().multiplyScalar(0.9), V(0, gap * 0.75, 0), CELLS.needle, { centre, squash: V(1, 0.5, 1), col, shade, leafy: 0, flutter: 0.6, pin: 'u' });
      }
    }
    S.card(V(0, 0.93, 0), V(0.035, 0, 0), V(0, 0.07, 0), CELLS.needle, { centre, col, leafy: 0, flutter: 0.5 }); S.card(V(0, 0.93, 0), V(0, 0, 0.035), V(0, 0.07, 0), CELLS.needle, { centre, col, leafy: 0, flutter: 0.5 });
    return S.build();
  },
  // a pine: bare reddish stem, a flat crown high up
  pine(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0.02, 0.82, 0), radii = V(0.25, 0.14, 0.25), bark = new THREE.Color(1, 1, 1);
    if (lod === 2) return impostor(CELLS.iPine, 0.62, { top: [0.86, 0.22, CELLS.needle], cy: 0.8, leafy: 0 });
    S.tube(V(0, -0.02, 0), V(0.02, 0.8, 0), 0.028, 0.014, lod ? 4 : 6, CELLS.pineBark, bark, 0, 1);
    if (!lod) for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2832 + R(), y0 = 0.62 + R() * 0.12; S.tube(V(0.015, y0, 0), V(Math.cos(a) * 0.17, y0 + 0.12, Math.sin(a) * 0.17), 0.012, 0.005, 4, CELLS.pineBark, bark, 0, 0.4); }
    crownCards(S, R, { centre, radii, n: lod ? 7 : 16, size: lod ? 0.2 : 0.14, cellK: CELLS.needle, col: new THREE.Color(1.15, 1.2, 0.95), fill: true, leafy: 0 });
    return S.build();
  },
  // a bush or hedge plant
  bush(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0, 0.38, 0), radii = V(0.44, 0.4, 0.44);
    if (lod === 2) return impostor(CELLS.iBush, 1.0, { top: [0.6, 0.36, CELLS.bush], cy: 0.3 });
    crownCards(S, R, { centre, radii, n: lod ? 5 : 11, size: lod ? 0.36 : 0.27, cellK: CELLS.bush, col: LEAFC, fill: true });
    return S.build();
  },
  // desert: a dry thorny shrub
  shrub(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0, 0.2, 0);
    if (lod === 2) return impostor(CELLS.iShrub, 1.1, { cy: 0.2, leafy: 0 });
    const n = lod ? 3 : 5;
    for (let k = 0; k < n; k++) { const a = k / n * 3.1416 + R() * 0.4, lean = (R() - 0.5) * 0.5; S.card(V(0, 0.5, 0), V(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55), V(-Math.sin(a) * lean, 0.5, Math.cos(a) * lean), CELLS.twig, { centre, col: LEAFC, leafy: 0, flutter: 0.5, pin: 'v', flip: R() < 0.5 }); }
    return S.build();
  },
  // desert: a flat-topped thorn tree
  acacia(lod, seed) {
    const R = rng(seed), S = new Shape(), centre = V(0, 0.84, 0), radii = V(0.46, 0.1, 0.46);
    if (lod === 2) return impostor(CELLS.iAcacia, 1.0, { top: [0.88, 0.4, CELLS.small], cy: 0.7, leafy: 0 });
    S.tube(V(0, -0.02, 0), V(0.03, 0.5, 0), 0.03, 0.02, lod ? 4 : 6, CELLS.bark, BARK, 0, 1);
    for (let k = 0; k < (lod ? 2 : 4); k++) { const a = k / 4 * 6.2832 + R(), r = 0.3; S.tube(V(0.03, 0.48, 0), V(Math.cos(a) * r, 0.82, Math.sin(a) * r), 0.016, 0.006, 4, CELLS.bark, BARK, 0, 0.6); }
    crownCards(S, R, { centre, radii, n: lod ? 8 : 18, size: lod ? 0.26 : 0.18, cellK: CELLS.small, col: new THREE.Color(0.95, 0.92, 0.75), fill: true, leafy: 0 });
    return S.build();
  },
};
// which kinds have leaves that fall (thin out in snow) is carried in the shapes; widths here scale the instance (w = height * width)
export const KIND_INFO = { broad: { width: 1.05 }, broadB: { width: 1.2 }, poplar: { width: 1.0 }, birch: { width: 0.95 }, spruce: { width: 0.85 }, pine: { width: 0.95 }, bush: { width: 1.35 }, shrub: { width: 1.5 }, acacia: { width: 1.5 } };
const shapeCache = new Map();
// [close up, middle distance, far] for a kind
export function treeShapes(kind) {
  if (shapeCache.has(kind)) return shapeCache.get(kind);
  const f = KINDS[kind === 'broadB' ? 'broad' : kind], seed = kind === 'broadB' ? 91 : 7 + kind.length * 13;
  const out = [f(0, seed), f(1, seed + 1), f(2, seed + 2)]; shapeCache.set(kind, out); return out;
}

// ---------------------------------------------------------------- material
const WIND_VERT = /* glsl */`
  #ifdef USE_INSTANCING
    { mat3 hkM = mat3(instanceMatrix); vec3 hkO = instanceMatrix[3].xyz; float hkH = length(hkM[1]);
      float ph = hkO.x * 0.071 + hkO.z * 0.053, gust = sin(hkTime * 0.7 + ph) * 0.6 + sin(hkTime * 1.63 + ph * 1.7) * 0.4;
      float bend = position.y * position.y * (0.010 + 0.009 * gust) * hkWind.y * hkH;
      vec3 d = vec3(hkWind.x, 0.0, hkWind.z) * bend;
      float fl = aLeaf.x * 0.035 * hkWind.y; vec3 q = position * 23.0 + hkO * 0.37;
      d += fl * vec3(sin(hkTime * 3.1 + q.x + q.y), sin(hkTime * 2.3 + q.y + q.z) * 0.6, sin(hkTime * 2.7 + q.z + q.x));
      transformed += vec3(dot(hkM[0], d) / dot(hkM[0], hkM[0]), dot(hkM[1], d) / dot(hkM[1], hkM[1]), dot(hkM[2], d) / dot(hkM[2], hkM[2])); }
  #endif
`;
let mats = null;
// One material for every tree and bush (and its partner for casting shadows).
export function treeMaterials() {
  if (mats) return mats;
  const map = floraSheet();
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, alphaTest: 0.4 });
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = sh => {
    sh.uniforms.hkTime = ENV.time; sh.uniforms.hkWind = ENV.wind; sh.uniforms.uSnow = ENV.snow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aLeaf; uniform float hkTime; uniform vec3 hkWind; varying vec2 vLeaf; varying vec3 vWp; varying float vUpN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERT + `
        vLeaf = aLeaf; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vUpN = normal.y;
        #ifdef USE_INSTANCING
          vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLeaf; varying vec3 vWp; varying float vUpN; uniform float uSnow;')
      /* in snow the leaf trees stand nearly bare: only the thickest clumps and the twigs remain, and what remains turns brown */
      .replace('#include <alphatest_fragment>', `
        { vec2 tx = vMapUv * 2048.0; float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx))))); diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + 0.35 * lod)); }   /* keep crowns full as they shrink with distance */
        if (uSnow > 0.0 && vLeaf.y > 0.5) { if (diffuseColor.a < 0.4 + 0.47 * uSnow) discard; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.6, 0.3, 0.1))) * vec3(1.5, 1.0, 0.6), 0.85 * uSnow); diffuseColor.a = 1.0; }
        #include <alphatest_fragment>
        { float snow = uSnow * smoothstep(0.25, 0.8, vUpN + (fract(sin(dot(floor(vWp.xz * 3.0), vec2(12.9, 78.2))) * 43758.5) - 0.5) * 0.5) * (vLeaf.y > 0.5 ? 0.35 : 0.8) * step(0.001, vLeaf.x + vLeaf.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.94), snow); }`)
      /* cards are lit as part of a rounded crown whichever way they face */
      .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;')
      /* sunlight coming through the leaves when you look towards the sun */
      .replace('#include <opaque_fragment>', `
        #if NUM_DIR_LIGHTS > 0
          { float through = pow(max(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0), 3.0) * step(0.5, vLeaf.x);
            outgoingLight += diffuseColor.rgb * directionalLights[0].color * vec3(0.9, 1.0, 0.45) * through * 0.16; }
        #endif
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'hktree';
  atmosphere(mat);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.4, side: THREE.DoubleSide });
  depth.onBeforeCompile = sh => {
    sh.uniforms.hkTime = ENV.time; sh.uniforms.hkWind = ENV.wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aLeaf; uniform float hkTime; uniform vec3 hkWind;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERT);
  };
  depth.customProgramCacheKey = () => 'hktreedepth';
  mats = { mat, depth }; return mats;
}
