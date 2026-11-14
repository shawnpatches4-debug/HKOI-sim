// Close-up ground surfaces, painted in code: grass (or sand), bare soil, crop stubble, forest litter and gravel.
// Each is a square picture that repeats without a seam. The ground material lays them over the map's broad colours, so a field
// keeps its own colour but shows blades, clods and stones when the camera is near. Nothing here is downloaded.
import * as THREE from 'three';

const SIZE = 512;
export const LAYERS = ['open', 'soil', 'crop', 'litter', 'gravel'];

// small repeatable random source, so every visit paints the same ground
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%,${a})`;

// draw something at (x, y) and again across the edges it overlaps, so the picture wraps
function wrap(x, y, r, draw) {
  for (let dx = -SIZE; dx <= SIZE; dx += SIZE) {
    if (x + dx < -r || x + dx > SIZE + r) continue;
    for (let dy = -SIZE; dy <= SIZE; dy += SIZE) {
      if (y + dy < -r || y + dy > SIZE + r) continue;
      draw(x + dx, y + dy);
    }
  }
}
function blotches(c, R, n, rMin, rMax, colour) {
  for (let i = 0; i < n; i++) {
    const x = R() * SIZE, y = R() * SIZE, r = rMin + R() * (rMax - rMin), col = colour(R);
    wrap(x, y, r, (px, py) => {
      const g = c.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, 6.2832); c.fill();
    });
  }
}
// thin strokes: grass blades, straw, twigs
function strokes(c, R, n, opt) {
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = R() * SIZE, y = R() * SIZE, len = opt.len[0] + R() * (opt.len[1] - opt.len[0]);
    const ang = opt.flow ? opt.flow(x, y) + (R() - 0.5) * opt.spread : R() * 6.2832, bend = (R() - 0.5) * len * 0.5;
    const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len, col = opt.colour(R, i / n), w = opt.width[0] + R() * (opt.width[1] - opt.width[0]);
    wrap(x, y, len, (px, py) => {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(px, py);
      c.quadraticCurveTo(px + ex * 0.5 - ey / len * bend, py + ey * 0.5 + ex / len * bend, px + ex, py + ey); c.stroke();
    });
  }
}
// rounded lumps with a lit side and a shadow: clods, stones, fallen leaves
function lumps(c, R, n, opt) {
  for (let i = 0; i < n; i++) {
    const x = R() * SIZE, y = R() * SIZE, r = opt.r[0] + Math.pow(R(), opt.skew || 2) * (opt.r[1] - opt.r[0]), q = opt.squash ? opt.squash[0] + R() * (opt.squash[1] - opt.squash[0]) : 0.7 + R() * 0.3, rot = R() * 3.1416;
    const [h, s, l] = opt.colour(R);
    wrap(x, y, r + 3, (px, py) => {
      if (opt.shadow !== 0) { c.fillStyle = `rgba(0,0,0,${opt.shadow || 0.35})`; c.beginPath(); c.ellipse(px + r * 0.25 + 0.8, py + r * 0.3 + 0.8, r, r * q, rot, 0, 6.2832); c.fill(); }
      c.fillStyle = hsl(h, s, l); c.beginPath(); c.ellipse(px, py, r, r * q, rot, 0, 6.2832); c.fill();
      if (r > 1.6) { c.fillStyle = hsl(h, s, Math.min(92, l + 11), 0.55); c.beginPath(); c.ellipse(px - r * 0.22, py - r * 0.25, r * 0.55, r * q * 0.5, rot, 0, 6.2832); c.fill(); }
    });
  }
}
// fine per-pixel grain, the same in every channel
function grain(c, R, amount) {
  const im = c.getImageData(0, 0, SIZE, SIZE), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const g = (R() - 0.5) * amount; d[i] += g; d[i + 1] += g; d[i + 2] += g; }
  c.putImageData(im, 0, 0);
}
// a smooth repeating field of directions, so blades lean together in clumps
function flowField(R, cells = 6) {
  const g = []; for (let i = 0; i < cells * cells; i++) g.push(R() * 6.2832);
  return (x, y) => {
    const u = x / SIZE * cells, v = y / SIZE * cells, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, at = (a, b) => g[((b % cells + cells) % cells) * cells + ((a % cells + cells) % cells)];
    const sx = Math.cos(at(i, j)) * (1 - fu) * (1 - fv) + Math.cos(at(i + 1, j)) * fu * (1 - fv) + Math.cos(at(i, j + 1)) * (1 - fu) * fv + Math.cos(at(i + 1, j + 1)) * fu * fv;
    const sy = Math.sin(at(i, j)) * (1 - fu) * (1 - fv) + Math.sin(at(i + 1, j)) * fu * (1 - fv) + Math.sin(at(i, j + 1)) * (1 - fu) * fv + Math.sin(at(i + 1, j + 1)) * fu * fv;
    return Math.atan2(sy, sx);
  };
}

const PAINT = {
  grass(c, R) {
    c.fillStyle = '#34401f'; c.fillRect(0, 0, SIZE, SIZE);
    blotches(c, R, 50, 30, 90, r => hsl(70 + r() * 40, 30, 12 + r() * 14, 0.5));
    const flow = flowField(R);
    strokes(c, R, 5200, { len: [10, 22], width: [1.2, 2.4], flow, spread: 2.2, colour: (r, f) => hsl(66 + r() * 34, 26 + r() * 20, 15 + f * 9 + r() * 7) });
    strokes(c, R, 5200, { len: [12, 28], width: [1.0, 2.0], flow, spread: 1.6, colour: (r, f) => hsl(62 + r() * 36, 28 + r() * 22, 25 + f * 12 + r() * 8) });
    strokes(c, R, 700, { len: [10, 24], width: [0.8, 1.5], flow, spread: 2.5, colour: r => hsl(46 + r() * 10, 30 + r() * 15, 44 + r() * 14, 0.9) });   /* dry blades */
    strokes(c, R, 1600, { len: [8, 20], width: [0.8, 1.4], flow, spread: 1.4, colour: r => hsl(70 + r() * 30, 34 + r() * 18, 40 + r() * 10, 0.85) });   /* lit tips */
  },
  sand(c, R) {
    c.fillStyle = '#b89b6d'; c.fillRect(0, 0, SIZE, SIZE);
    blotches(c, R, 40, 40, 130, r => hsl(30 + r() * 10, 30 + r() * 12, 44 + r() * 22, 0.35));
    // wind ripples: faint light and dark bands that wander
    for (let k = 0; k < 26; k++) {
      const y0 = (k + R() * 0.4) * SIZE / 26, ph = R() * 6.28, light = k % 2 === 0;
      for (const dy of [-SIZE, 0, SIZE]) {
        c.strokeStyle = light ? 'rgba(236,214,170,0.20)' : 'rgba(88,66,40,0.22)'; c.lineWidth = 3 + R() * 4; c.beginPath();
        for (let x = -8; x <= SIZE + 8; x += 8) { const y = y0 + dy + Math.sin(x / SIZE * 6.2832 * 2 + ph) * 7 + Math.sin(x / SIZE * 6.2832 * 5 + ph * 2) * 3; if (x < 0) c.moveTo(x, y); else c.lineTo(x, y); }
        c.stroke();
      }
    }
    lumps(c, R, 900, { r: [0.6, 2.4], skew: 2, colour: r => [28 + r() * 14, 12 + r() * 16, 34 + r() * 30], shadow: 0.3 });
    lumps(c, R, 46, { r: [3, 9], skew: 2.5, colour: r => [26 + r() * 12, 10 + r() * 14, 36 + r() * 22], shadow: 0.4 });
    grain(c, R, 26);
  },
  soil(c, R) {
    c.fillStyle = '#43342a'; c.fillRect(0, 0, SIZE, SIZE);
    blotches(c, R, 40, 30, 100, r => hsl(22 + r() * 10, 22 + r() * 10, 12 + r() * 16, 0.5));
    lumps(c, R, 2600, { r: [2, 13], skew: 2.2, colour: r => [20 + r() * 12, 18 + r() * 14, 17 + r() * 15], shadow: 0.45 });
    lumps(c, R, 1500, { r: [1, 4], skew: 1.5, colour: r => [22 + r() * 12, 16 + r() * 12, 22 + r() * 16], shadow: 0.4 });
    lumps(c, R, 110, { r: [1, 3], skew: 1.5, colour: r => [35 + r() * 10, 6 + r() * 8, 46 + r() * 22], shadow: 0.4 });   /* small stones */
    strokes(c, R, 150, { len: [6, 22], width: [0.8, 1.6], spread: 6, colour: r => hsl(44 + r() * 8, 30, 46 + r() * 16, 0.8) });   /* old straw and roots */
    grain(c, R, 16);
  },
  crop(c, R) {
    c.fillStyle = '#4f4130'; c.fillRect(0, 0, SIZE, SIZE);
    blotches(c, R, 40, 30, 90, r => hsl(40 + r() * 12, 26, 16 + r() * 18, 0.45));
    const flow = flowField(R, 4);
    strokes(c, R, 4200, { len: [12, 34], width: [1.2, 2.6], flow, spread: 1.5, colour: (r, f) => hsl(44 + r() * 12, 22 + r() * 22, 28 + f * 12 + r() * 10) });
    strokes(c, R, 4200, { len: [14, 40], width: [1.0, 2.2], flow, spread: 1.1, colour: (r, f) => hsl(44 + r() * 12, 26 + r() * 22, 44 + f * 14 + r() * 10) });
    strokes(c, R, 1200, { len: [10, 26], width: [0.8, 1.4], flow, spread: 0.9, colour: r => hsl(48 + r() * 8, 34 + r() * 16, 66 + r() * 10, 0.9) });
  },
  litter(c, R) {
    c.fillStyle = '#32271d'; c.fillRect(0, 0, SIZE, SIZE);
    blotches(c, R, 40, 30, 110, r => hsl(24 + r() * 14, 24, 9 + r() * 12, 0.5));
    blotches(c, R, 16, 30, 80, r => hsl(84 + r() * 20, 30, 18 + r() * 8, 0.5));   /* moss */
    lumps(c, R, 3600, { r: [3, 8], skew: 1.3, squash: [0.35, 0.6], colour: r => [18 + r() * 26, 24 + r() * 28, 15 + r() * 20], shadow: 0.4 });
    strokes(c, R, 240, { len: [18, 70], width: [1, 2.6], spread: 6, colour: r => hsl(24 + r() * 10, 18, 9 + r() * 12) });   /* twigs */
    lumps(c, R, 900, { r: [2, 6], skew: 1.3, squash: [0.35, 0.6], colour: r => [26 + r() * 22, 30 + r() * 26, 26 + r() * 18], shadow: 0.35 });
    grain(c, R, 12);
  },
  gravel(c, R) {
    c.fillStyle = '#7d7568'; c.fillRect(0, 0, SIZE, SIZE);
    blotches(c, R, 40, 30, 110, r => hsl(32 + r() * 10, 10 + r() * 8, 34 + r() * 26, 0.4));
    lumps(c, R, 5200, { r: [1, 5.5], skew: 2, colour: r => [28 + r() * 16, 5 + r() * 13, 36 + r() * 30], shadow: 0.4 });
    lumps(c, R, 60, { r: [5, 11], skew: 2, colour: r => [28 + r() * 16, 5 + r() * 10, 40 + r() * 24], shadow: 0.45 });
    grain(c, R, 20);
  },
};

// which painter fills each layer, per setting
const RECIPE = {
  farmland: ['grass', 'soil', 'crop', 'litter', 'gravel'],
  town: ['grass', 'soil', 'crop', 'litter', 'gravel'],
  forest: ['grass', 'soil', 'crop', 'litter', 'gravel'],
  desert: ['sand', 'soil', 'crop', 'litter', 'gravel'],
};
const cache = new Map(), painted = new Map();

function paintLayer(name, seed) {
  if (painted.has(name)) return painted.get(name);
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE; const c = cv.getContext('2d', { willReadFrequently: true });
  PAINT[name](c, rng(seed));
  const d = c.getImageData(0, 0, SIZE, SIZE).data, N = SIZE * SIZE;
  // height from brightness (lit tops are high, dark gaps are low), smoothed a little
  const lum = new Float32Array(N), h = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15) / 255;
  let lo = 1, hi = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += lum[((y + b + SIZE) % SIZE) * SIZE + ((x + a + SIZE) % SIZE)];
    s /= 9; h[y * SIZE + x] = s; if (s < lo) lo = s; if (s > hi) hi = s;
  }
  const col = new Uint8Array(N * 4), nrm = new Uint8Array(N * 4), mean = [0, 0, 0];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x, hh = (h[i] - lo) / (hi - lo + 1e-6);
    const dx = (h[y * SIZE + (x + 1) % SIZE] - h[y * SIZE + (x + SIZE - 1) % SIZE]) / (hi - lo + 1e-6), dy = (h[((y + 1) % SIZE) * SIZE + x] - h[((y + SIZE - 1) % SIZE) * SIZE + x]) / (hi - lo + 1e-6);
    col[i * 4] = d[i * 4]; col[i * 4 + 1] = d[i * 4 + 1]; col[i * 4 + 2] = d[i * 4 + 2]; col[i * 4 + 3] = Math.round(hh * 255);
    mean[0] += d[i * 4]; mean[1] += d[i * 4 + 1]; mean[2] += d[i * 4 + 2];
    nrm[i * 4] = Math.max(0, Math.min(255, 127.5 - dx * 420)); nrm[i * 4 + 1] = Math.max(0, Math.min(255, 127.5 - dy * 420)); nrm[i * 4 + 2] = Math.round(hh * 255); nrm[i * 4 + 3] = 255;
  }
  const out = { col, nrm, mean: mean.map(v => v / N / 255) };
  painted.set(name, out); return out;
}

// The set of surfaces for one setting: two stacked textures (colour + height, and slope) and the average colour of each layer.
export function groundDetail(biomeKey) {
  const key = RECIPE[biomeKey] ? biomeKey : 'farmland';
  if (cache.has(key)) return cache.get(key);
  const names = RECIPE[key], N = SIZE * SIZE * 4, col = new Uint8Array(N * names.length), nrm = new Uint8Array(N * names.length), means = [];
  names.forEach((nm, q) => { const L = paintLayer(nm, 1000 + q * 77 + nm.length); col.set(L.col, q * N); nrm.set(L.nrm, q * N); means.push(new THREE.Vector3(L.mean[0], L.mean[1], L.mean[2])); });
  const make = data => {
    const t = new THREE.DataArrayTexture(data, SIZE, SIZE, names.length);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
  };
  const out = { det: make(col), nrm: make(nrm), means };
  cache.set(key, out); return out;
}
