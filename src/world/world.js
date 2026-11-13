// Battlefield model: a generated 8 km map with heights, vegetation, buildings and roads, and the sight-line maths that
// everything else asks questions of. Pure logic: no rendering, no engine. Same seed and biome always give the same ground.
//
// Coordinates: e = metres east, n = metres north, origin at the map centre. Heights in metres. "agl" = above ground level.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- deterministic noise
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash2(ix, iz, seed) { let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  const smooth = t => t * t * (3 - 2 * t);
  function vnoise(x, z, seed) { const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz); const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }
  function fbm(x, z, seed, oct, gain) { let s = 0, a = 1, f = 1, norm = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f, seed + i * 101); norm += a; a *= gain || 0.5; f *= 2.03; } return s / norm; }          // 0..1
  function ridged(x, z, seed, oct) { let s = 0, a = 1, f = 1, norm = 0; for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(2 * vnoise(x * f, z * f, seed + i * 53) - 1); s += a * v * v; norm += a; a *= 0.5; f *= 2.1; } return s / norm; } // 0..1, sharp crests
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------- what each setting is made of
  // relief = typical height range (m); scale = size of the big landforms (m); ridge = how much of the relief is sharp crests.
  const BIOMES = {
    farmland: { name: 'Eastern European farmland', relief: 26, scale: 2600, ridge: 0.2, rough: 0.6, forest: 0.08, fields: 1, treeLines: 0.2, villages: 4, town: 0, scrub: 0.02 },
    desert: { name: 'Desert', relief: 55, scale: 1900, ridge: 0.55, rough: 1.1, forest: 0, fields: 0, treeLines: 0, villages: 1, town: 0, scrub: 0.06, dunes: 1 },
    town: { name: 'Town edge', relief: 12, scale: 3200, ridge: 0.1, rough: 0.4, forest: 0.05, fields: 0.7, treeLines: 0.18, villages: 2, town: 1, scrub: 0.02 },
    forest: { name: 'Forest and hills', relief: 110, scale: 2300, ridge: 0.45, rough: 1.0, forest: 0.52, fields: 0.25, treeLines: 0.2, villages: 2, town: 0, scrub: 0.04 },
  };
  // vegetation classes stored per cell
  const VEG = { OPEN: 0, CROP_LOW: 1, CROP_HIGH: 2, SCRUB: 3, FOREST: 4, TREELINE: 5, BUILT: 6, ROAD: 7 };
  // how far you can see through each class before sight is lost, when the sight line passes below its top (m)
  const SEE_THROUGH = { 1: 400, 2: 60, 3: 250, 4: 45, 5: 14 };

  class World {
    constructor(opt) {
      opt = opt || {}; this.seed = (opt.seed == null ? 1 : opt.seed) | 0; this.biomeKey = BIOMES[opt.biome] ? opt.biome : 'farmland'; this.biome = BIOMES[this.biomeKey];
      this.size = opt.size || 8000; this.n = opt.n || 513; this.cell = this.size / (this.n - 1); this.half = this.size / 2;
      const N = this.n * this.n; this.H = new Float32Array(N); this.V = new Uint8Array(N); this.VH = new Float32Array(N); this.F = new Uint16Array(N);
      this.buildings = []; this.treeLines = []; this.roads = []; this.places = []; this.fields = [];
      this._gen();
    }

    // ---------------------------------------------------------------- generation
    _gen() {
      const B = this.biome, S = this.seed, n = this.n, c = this.cell, half = this.half, rnd = mulberry(S * 7919 + 13);
      // 1. landform
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const e = i * c - half, nn = j * c - half, u = e / B.scale, v = nn / B.scale;
        let h = (fbm(u, v, S, 5, 0.5) - 0.5) * 2 * B.relief * (1 - B.ridge) + (ridged(u * 0.8 + 7, v * 0.8 - 3, S + 9, 4) - 0.35) * B.relief * B.ridge * 1.6;
        if (B.dunes) { const w = fbm(u * 0.7, v * 0.7, S + 31, 3) * 6; h += Math.pow(0.5 + 0.5 * Math.sin((e * 0.9 + nn * 0.35) / 210 + w), 3) * 9 * fbm(u * 0.5 + 3, v * 0.5, S + 5, 2); }
        h += (fbm(e / 180, nn / 180, S + 77, 3) - 0.5) * 3.2 * B.rough + (fbm(e / 45, nn / 45, S + 78, 2) - 0.5) * 0.8 * B.rough;
        this.H[j * n + i] = h; }
      // 2. settlements: a town in the middle distance for the town setting, villages elsewhere
      const place = (kind, e, nn, r) => { this.places.push({ kind, e, n: nn, r, rot: rnd() * Math.PI, name: kind === 'town' ? 'Town' : 'Village ' + (this.places.length + 1) }); };
      if (B.town) place('town', (rnd() - 0.5) * 1200, 900 + rnd() * 900, 950);
      for (let k = 0; k < B.villages; k++) { for (let tries = 0; tries < 40; tries++) { const e = (rnd() - 0.5) * (this.size - 1400), nn = (rnd() - 0.5) * (this.size - 1400), r = 190 + rnd() * 150; if (Math.hypot(e, nn) < 900) continue; if (this.places.some(p => Math.hypot(p.e - e, p.n - nn) < p.r + r + 900)) continue; place('village', e, nn, r); break; } }
      for (const p of this.places) this._flatten(p.e, p.n, p.r * 1.25, 0.85);
      // 3. roads: each settlement to its nearest neighbour and to a map edge
      const pts = this.places.map(p => [p.e, p.n]);
      for (let a = 0; a < pts.length; a++) { let best = -1, bd = 1e9; for (let b = 0; b < pts.length; b++) if (b !== a) { const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]); if (d < bd && !this.roads.some(r => r.a === b && r.b === a)) { bd = d; best = b; } } if (best >= 0) this._road(pts[a], pts[best], a, best, rnd); }
      if (pts.length) { const p0 = pts[0], side = rnd() < 0.5 ? -1 : 1; this._road(p0, [side * half, p0[1] + (rnd() - 0.5) * 1500], 0, -1, rnd); this._road(pts[pts.length - 1], [pts[pts.length - 1][0] + (rnd() - 0.5) * 1500, -half], pts.length - 1, -1, rnd); }
      else this._road([-half, (rnd() - 0.5) * 2000], [half, (rnd() - 0.5) * 2000], -1, -1, rnd);
      this._road([(rnd() - 0.5) * 1200, -half], [(rnd() - 0.5) * 1200, half], -1, -1, rnd);   // a track that passes near the centre, where the tank starts
      // 4. fields, with tree lines along some of their edges
      if (B.fields > 0) { const fr = rnd() * Math.PI, cs = Math.cos(fr), sn = Math.sin(fr), FW = 560, FD = 400, edge = new Map();
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const e = i * c - half, nn = j * c - half, x = e * cs + nn * sn, z = -e * sn + nn * cs, fi = Math.floor(x / FW + (hash2(Math.floor(z / FD), 7, S) - 0.5) * 0.6), fj = Math.floor(z / FD), id = ((fi + 64) & 127) * 128 + ((fj + 64) & 127) + 1, k = j * n + i;
          if (hash2(fi, fj, S + 3) > B.fields) continue; this.F[k] = id; const t = hash2(fi, fj, S + 4); this.V[k] = t < 0.4 ? VEG.OPEN : t < 0.84 ? VEG.CROP_LOW : VEG.CROP_HIGH; this.VH[k] = t < 0.4 ? 0 : t < 0.84 ? 0.6 + hash2(fi, fj, S + 5) * 0.5 : 1.9 + hash2(fi, fj, S + 5) * 0.5;   // plough or pasture, a low crop, or maize and sunflowers tall enough to hide a man
          if (!edge.has(id)) edge.set(id, { fi, fj, crop: this.V[k], h: this.VH[k] }); }
        this.fields = [...edge.entries()].map(([id, f]) => Object.assign({ id }, f));
        // a tree line where two different fields meet, on a share of the boundaries
        for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) { const k = j * n + i, a = this.F[k]; if (!a) continue; const b = this.F[k + 1] || 0, d = this.F[k + n] || 0; for (const o of [b, d]) { if (o && o !== a && hash2(Math.min(a, o), Math.max(a, o), S + 11) < B.treeLines) { this.V[k] = VEG.TREELINE; this.VH[k] = 9 + hash2(i, j, S + 12) * 7; } } } }
      // 5. woods: low-frequency patches; the forest setting is mostly trees with clearings
      const fThr = 0.5 + 0.105 * 4.91 * (Math.pow(1 - B.forest, 0.14) - Math.pow(Math.max(B.forest, 1e-4), 0.14));   // noise level that gives roughly the asked-for share of woodland
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const e = i * c - half, nn = j * c - half, k = j * n + i, w = fbm(e / 900 + 11, nn / 900 - 5, S + 201, 4, 0.55) - 0.16 * Math.exp(-(e * e + nn * nn) / (2 * 420 * 420));   // the centre, where the tank starts, sits in open ground
        if (B.forest > 0 && w > fThr) { this.V[k] = VEG.FOREST; this.VH[k] = 13 + hash2(i, j, S + 21) * 9; this.F[k] = 0; }
        else if (this.V[k] === VEG.OPEN && hash2(i, j, S + 22) < B.scrub) { this.V[k] = VEG.SCRUB; this.VH[k] = 1.2 + hash2(i, j, S + 23) * 2.2; } }
      // 6. buildings, then roads cut through everything
      for (const p of this.places) this._buildPlace(p, rnd);
      for (const r of this.roads) this._rasterRoad(r);
      // keep the centre clear enough to start a tank on: no building or forest within 60 m
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const e = i * c - half, nn = j * c - half; if (Math.hypot(e, nn) < 60) { const k = j * n + i; if (this.V[k] === VEG.FOREST || this.V[k] === VEG.TREELINE) { this.V[k] = VEG.OPEN; this.VH[k] = 0; } } }
      this.buildings = this.buildings.filter(b => Math.hypot(b.e, b.n) > 70);
      this._indexBuildings();
      let lo = 1e9, hi = -1e9; for (let k = 0; k < this.H.length; k++) { if (this.H[k] < lo) lo = this.H[k]; if (this.H[k] > hi) hi = this.H[k]; } this.minH = lo; this.maxH = hi;
    }
    _flatten(e0, n0, r, k) { const n = this.n, c = this.cell, half = this.half, h0 = this.h(e0, n0), i0 = Math.max(0, Math.floor((e0 - r + half) / c)), i1 = Math.min(n - 1, Math.ceil((e0 + r + half) / c)), j0 = Math.max(0, Math.floor((n0 - r + half) / c)), j1 = Math.min(n - 1, Math.ceil((n0 + r + half) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(i * c - half - e0, j * c - half - n0) / r; if (d >= 1) continue; const w = k * smooth(1 - d); this.H[j * n + i] = lerp(this.H[j * n + i], h0, w); } }
    _road(a, b, ia, ib, rnd) { const pts = [], L = Math.hypot(b[0] - a[0], b[1] - a[1]), segs = Math.max(2, Math.round(L / 260)), px = -(b[1] - a[1]) / L, pz = (b[0] - a[0]) / L, ph = rnd() * 6.28; for (let s = 0; s <= segs; s++) { const t = s / segs, w = Math.sin(t * Math.PI) * (Math.sin(t * 5 + ph) * 90 + Math.sin(t * 11 + ph * 2) * 35); pts.push([a[0] + (b[0] - a[0]) * t + px * w, a[1] + (b[1] - a[1]) * t + pz * w]); } this.roads.push({ a: ia, b: ib, pts, w: 7 }); }
    _rasterRoad(r) { const n = this.n, c = this.cell, half = this.half; for (let s = 0; s < r.pts.length - 1; s++) { const [e0, n0] = r.pts[s], [e1, n1] = r.pts[s + 1], L = Math.hypot(e1 - e0, n1 - n0), steps = Math.ceil(L / (c * 0.5)); for (let q = 0; q <= steps; q++) { const e = lerp(e0, e1, q / steps), nn = lerp(n0, n1, q / steps), i = Math.round((e + half) / c), j = Math.round((nn + half) / c); if (i < 0 || j < 0 || i >= n || j >= n) continue; const k = j * n + i; if (this.V[k] !== VEG.BUILT) { this.V[k] = VEG.ROAD; this.VH[k] = 0; } } } }
    _buildPlace(p, rnd) { const town = p.kind === 'town', step = town ? 46 : 58, cs = Math.cos(p.rot), sn = Math.sin(p.rot), n = this.n, c = this.cell, half = this.half;
      for (let x = -p.r; x <= p.r; x += step) for (let z = -p.r; z <= p.r; z += step) { const d = Math.hypot(x, z) / p.r; if (d > 1) continue; const street = (Math.round(x / step) % 3 === 0) || (Math.round(z / step) % 4 === 0); if (street) continue; if (rnd() < (town ? 0.12 : 0.3) + d * 0.35) continue;
        const jx = x + (rnd() - 0.5) * step * 0.3, jz = z + (rnd() - 0.5) * step * 0.3, e = p.e + jx * cs - jz * sn, nn = p.n + jx * sn + jz * cs, big = town && d < 0.5 && rnd() < 0.5;
        const b = { e, n: nn, w: big ? 22 + rnd() * 16 : 9 + rnd() * 7, d: big ? 14 + rnd() * 10 : 7 + rnd() * 5, h: big ? 11 + Math.floor(rnd() * 3) * 3 : 4.5 + rnd() * 3.5, rot: p.rot + (rnd() < 0.5 ? 0 : Math.PI / 2), kind: big ? 'block' : 'house', place: this.places.indexOf(p) }; b.r = Math.hypot(b.w, b.d) / 2; this.buildings.push(b);
        const i = Math.round((e + half) / c), j = Math.round((nn + half) / c); if (i >= 0 && j >= 0 && i < n && j < n) { this.V[j * n + i] = VEG.BUILT; this.VH[j * n + i] = 0; this.F[j * n + i] = 0; } } }
    _indexBuildings() { this.bcell = 125; this.bgrid = new Map(); for (let q = 0; q < this.buildings.length; q++) { const b = this.buildings[q], i0 = Math.floor((b.e - b.r) / this.bcell), i1 = Math.floor((b.e + b.r) / this.bcell), j0 = Math.floor((b.n - b.r) / this.bcell), j1 = Math.floor((b.n + b.r) / this.bcell); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const key = i * 4096 + j; if (!this.bgrid.has(key)) this.bgrid.set(key, []); this.bgrid.get(key).push(q); } } }

    // ---------------------------------------------------------------- questions about a point
    inside(e, n) { return Math.abs(e) <= this.half && Math.abs(n) <= this.half; }
    h(e, n) { const c = this.cell, N = this.n, x = clamp((e + this.half) / c, 0, N - 1.001), z = clamp((n + this.half) / c, 0, N - 1.001), i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, k = j * N + i, H = this.H; return H[k] * (1 - fx) * (1 - fz) + H[k + 1] * fx * (1 - fz) + H[k + N] * (1 - fx) * fz + H[k + N + 1] * fx * fz; }
    _k(e, n) { const N = this.n, i = clamp(Math.round((e + this.half) / this.cell), 0, N - 1), j = clamp(Math.round((n + this.half) / this.cell), 0, N - 1); return j * N + i; }
    veg(e, n) { const k = this._k(e, n); return { cls: this.V[k], h: this.VH[k], field: this.F[k] }; }
    slope(e, n) { const d = this.cell; return Math.hypot(this.h(e + d, n) - this.h(e - d, n), this.h(e, n + d) - this.h(e, n - d)) / (2 * d); }
    buildingAt(e, n, pad) { const list = this.bgrid.get(Math.floor(e / this.bcell) * 4096 + Math.floor(n / this.bcell)); if (!list) return null; for (const q of list) { const b = this.buildings[q], dx = e - b.e, dz = n - b.n, cs = Math.cos(-b.rot), sn = Math.sin(-b.rot), x = dx * cs - dz * sn, z = dx * sn + dz * cs; if (Math.abs(x) <= b.w / 2 + (pad || 0) && Math.abs(z) <= b.d / 2 + (pad || 0)) return b; } return null; }
    // can something that size stand here (not inside a building or dense trees, not too steep)
    passable(e, n, forTank) { if (!this.inside(e, n)) return false; if (this.buildingAt(e, n, forTank ? 4 : 1)) return false; const k = this._k(e, n), v = this.V[k]; if (forTank && v === VEG.FOREST && this.VH[k] > 18.5) return false; return this.slope(e, n) < (forTank ? 0.55 : 0.9); }

    // ---------------------------------------------------------------- sight lines
    // Is there a clear line from A to B? Heights are above ground at each end. Returns { clear, kind, e, n, d } where kind is what
    // blocked it ('terrain', 'building', 'forest', 'treeline', 'crop', 'scrub') and d is how far from A. opt.ignoreVeg skips vegetation
    // (radar sees through leaves poorly but a missile does not care about a sight line); opt.endPad leaves vegetation at the ends
    // out of the count, because a team at a wood's edge can see out of it.
    los(e1, n1, a1, e2, n2, a2, opt) {
      opt = opt || {}; const D = Math.hypot(e2 - e1, n2 - n1); if (D < 1) return { clear: true, d: 0 };
      const z1 = this.h(e1, n1) + a1, z2 = this.h(e2, n2) + a2, step = Math.max(6, Math.min(this.cell * 0.6, D / 24)), steps = Math.ceil(D / step), pad = opt.endPad == null ? 12 : opt.endPad; const through = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (let s = 1; s < steps; s++) { const t = s / steps, d = D * t, e = lerp(e1, e2, t), n = lerp(n1, n2, t), z = lerp(z1, z2, t), g = this.h(e, n);
        if (z < g + 0.15) return { clear: false, kind: 'terrain', e, n, d };
        const b = this.buildingAt(e, n, 0); if (b && z < this.h(b.e, b.n) + b.h && d > 2 && D - d > 2) return { clear: false, kind: 'building', e, n, d, building: b };
        if (opt.ignoreVeg || d < pad || D - d < pad) continue;
        const k = this._k(e, n), v = this.V[k]; if (v >= 1 && v <= 5 && z < g + this.VH[k]) { through[v] += D / steps; if (through[v] > SEE_THROUGH[v]) return { clear: false, kind: v === 4 ? 'forest' : v === 5 ? 'treeline' : v === 3 ? 'scrub' : 'crop', e, n, d }; } }
      return { clear: true, d: D, veg: through[1] + through[2] + through[3] + through[4] + through[5] };
    }
    // does a straight flight from A to B (heights above ground at each end) strike the ground, a building or tall trees, and where
    flightClear(e1, n1, a1, e2, n2, a2) { const D = Math.hypot(e2 - e1, n2 - n1), z1 = this.h(e1, n1) + a1, z2 = this.h(e2, n2) + a2, steps = Math.ceil(D / 8); for (let s = 1; s < steps; s++) { const t = s / steps, e = lerp(e1, e2, t), n = lerp(n1, n2, t), z = lerp(z1, z2, t), g = this.h(e, n), d = D * t; if (z < g + 0.3) return { clear: false, kind: 'terrain', e, n, d }; const b = this.buildingAt(e, n, 0); if (b && z < this.h(b.e, b.n) + b.h && d > 3 && D - d > 6) return { clear: false, kind: 'building', e, n, d }; const k = this._k(e, n), v = this.V[k]; if ((v === 4 || v === 5) && z < g + this.VH[k] * 0.8 && d > 25 && D - d > 25) return { clear: false, kind: 'trees', e, n, d }; } return { clear: true, d: D }; }
    // how much of a vehicle standing at T is hidden from an observer at O: 'none', 'hull' (hull-down: only the turret shows) or 'full'
    defilade(oe, on, oa, te, tn) { const turret = this.los(oe, on, oa, te, tn, 2.4, { endPad: 6 }); if (!turret.clear) return 'full'; const hull = this.los(oe, on, oa, te, tn, 1.0, { endPad: 6 }); return hull.clear ? 'none' : 'hull'; }

    // ---------------------------------------------------------------- analysis for planners
    // every point on a coarse grid around C that has a sight line to a target standing at C. Used for the map shading and by the enemy.
    viewshed(ce, cn, targetAgl, radius, step, observerAgl) { const out = [], R = radius || 4500, st = step || 125; for (let n = cn - R; n <= cn + R; n += st) for (let e = ce - R; e <= ce + R; e += st) { const d = Math.hypot(e - ce, n - cn); if (d > R || d < 80 || !this.inside(e, n)) continue; if (this.los(e, n, observerAgl || 1.3, ce, cn, targetAgl || 2.2).clear) out.push([e, n, d]); } return out; }
    // firing positions against a target at T: a clear shot inside the weapon's range band, something to hide in or behind, and a way out.
    ambushSites(te, tn, opt) { opt = opt || {}; const rmin = opt.rmin || 600, rmax = opt.rmax || 4000, st = opt.step || 110, sites = [], rnd = mulberry(this.seed * 31 + (opt.salt || 0));
      for (let n = tn - rmax; n <= tn + rmax; n += st) for (let e = te - rmax; e <= te + rmax; e += st) { const ee = e + (rnd() - 0.5) * st * 0.6, nn = n + (rnd() - 0.5) * st * 0.6, d = Math.hypot(ee - te, nn - tn); if (d < rmin || d > rmax || !this.inside(ee, nn) || !this.passable(ee, nn, false)) continue;
        if (!this.los(ee, nn, opt.agl || 1.2, te, tn, 2.2).clear) continue; const v = this.veg(ee, nn); let s = 0.2;
        const conceal = v.cls === VEG.TREELINE ? 1 : v.cls === VEG.FOREST ? 0.9 : v.cls === VEG.CROP_HIGH ? 0.6 : v.cls === VEG.SCRUB ? 0.45 : this._near(ee, nn, 30, [VEG.FOREST, VEG.TREELINE, VEG.BUILT]) ? 0.7 : 0; s += conceal * 0.9;
        const bx = (ee - te) / d, bn = (nn - tn) / d, back = this.los(ee + bx * 70, nn + bn * 70, 1.2, te, tn, 2.2); if (!back.clear) s += 0.7;                         // a few steps back and you are out of sight: a covered way out
        const up = this.h(ee, nn) - this.h(te, tn); s += clamp(up / 25, -0.3, 0.4);                                                                                     // looking down on the target helps
        if (this.h(ee, nn) > this.h(ee + bx * 60, nn + bn * 60) + 3 && conceal < 0.4) s -= 0.5;                                                                         // on a bare crest: skylined
        s += 0.3 * (1 - Math.abs(d - (rmin + rmax) / 2) / ((rmax - rmin) / 2));
        sites.push({ e: ee, n: nn, d, brg: (Math.atan2(ee - te, nn - tn) * 180 / Math.PI + 360) % 360, score: s, conceal, covered: !back.clear, veg: v.cls }); }
      sites.sort((a, b) => b.score - a.score); return sites; }
    _near(e, n, r, classes) { for (let a = 0; a < 8; a++) { const k = this._k(e + Math.cos(a * 0.785) * r, n + Math.sin(a * 0.785) * r); if (classes.includes(this.V[k])) return true; } return false; }
    // places within reach of P where a vehicle is hidden (hull-down or fully) from every listed observer. Nearest and best-hidden first.
    coverFrom(pe, pn, observers, opt) { opt = opt || {}; const R = opt.radius || 400, st = opt.step || 28, out = []; for (let n = pn - R; n <= pn + R; n += st) for (let e = pe - R; e <= pe + R; e += st) { const d = Math.hypot(e - pe, n - pn); if (d > R || !this.passable(e, n, true)) continue; let full = 0, hull = 0; for (const o of observers) { const df = this.defilade(o.e, o.n, o.agl || 1.3, e, n); if (df === 'full') full++; else if (df === 'hull') hull++; } if (full + hull === 0) continue; const score = (full + hull * 0.6) / observers.length - d / R * 0.5; out.push({ e, n, d, full, hull, all: full + hull === observers.length, score }); } out.sort((a, b) => (b.all - a.all) || (b.score - a.score)); return out; }
    // a drivable route from A to B on a coarse grid (A*). cost(e, n) lets a planner add exposure to known threats.
    path(ae, an, be, bn, opt) { opt = opt || {}; const g = opt.grid || 60, tank = opt.tank !== false, W = Math.ceil(this.size / g), key = (i, j) => j * W + i, ci = e => clamp(Math.round((e + this.half) / g), 0, W - 1), ce = i => i * g - this.half;
      const si = ci(ae), sj = ci(an), ti = ci(be), tj = ci(bn), open = [[0, si, sj]], G = new Map([[key(si, sj), 0]]), from = new Map(); let found = false, guard = 0;
      while (open.length && guard++ < 60000) { let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q; const [, i, j] = open.splice(bi, 1)[0]; if (i === ti && j === tj) { found = true; break; }
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue; const e = ce(ni), n = ce(nj); if (!this.passable(e, n, tank) && !(ni === ti && nj === tj)) continue;
          const v = this.V[this._k(e, n)], stepC = Math.hypot(di, dj) * g * (v === VEG.ROAD ? 0.7 : v === VEG.FOREST ? 5 : 1) * (1 + this.slope(e, n) * 2.5) + (opt.cost ? opt.cost(e, n) * g : 0), ng = G.get(key(i, j)) + stepC, kk = key(ni, nj); if (G.has(kk) && G.get(kk) <= ng) continue; G.set(kk, ng); from.set(kk, key(i, j)); open.push([ng + Math.hypot(ti - ni, tj - nj) * g, ni, nj]); } }
      if (!found) return null; const pts = []; let k = key(ti, tj); while (k != null) { pts.push([ce(k % W), ce(Math.floor(k / W))]); k = from.get(k); } pts.reverse(); pts[0] = [ae, an]; pts[pts.length - 1] = [be, bn]; return pts; }
    stats() { const c = [0, 0, 0, 0, 0, 0, 0, 0]; for (let k = 0; k < this.V.length; k++) c[this.V[k]]++; const N = this.V.length; return { biome: this.biomeKey, seed: this.seed, minH: +this.minH.toFixed(1), maxH: +this.maxH.toFixed(1), open: +(c[0] / N).toFixed(2), crops: +((c[1] + c[2]) / N).toFixed(2), forest: +(c[4] / N).toFixed(2), treeLineCells: c[5], buildings: this.buildings.length, places: this.places.length, roads: this.roads.length }; }
  }

  const api = { World, BIOMES, VEG, SEE_THROUGH, mulberry, fbm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
