// The map screen: a topographic map of the battlefield with contours, woods, fields, roads and buildings; shading that shows
// from where the vehicle can be seen; the vehicle, and whatever enemy positions the viewer is allowed to know.
const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const INK = { open: [226, 224, 204], field: [[232, 226, 190], [222, 228, 196], [236, 222, 184]], plough: [214, 200, 178], wood: [168, 200, 150], scrub: [204, 214, 176], built: [200, 196, 190], contour: [150, 110, 70], water: [150, 190, 220] };

export class MapView {
  constructor(canvas) { this.cv = canvas; this.x = canvas.getContext('2d'); this.scale = 0; this.cx = 0; this.cn = 0; this.shed = null; this.shedKey = ''; this.onPick = null; this.pickMode = false; this._wire(); }
  setWorld(world) { if (this.world === world) return; this.world = world; this.base = this._bake(world); this.shed = null; this.shedKey = ''; this.fit(); }
  fit() { const r = this.cv.getBoundingClientRect(); this.scale = Math.min(r.width, r.height) / this.world.size * 0.98; this.cx = 0; this.cn = 0; }
  // one pixel per ~4 m: land cover, hill shading from the north-west, a contour every 10 m with every fifth one heavier
  _bake(w) {
    const S = 2048, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, m = w.size / S, half = w.half, n = w.n, V = w.V, interval = w.biome.relief > 60 ? 20 : 10;
    let prevRow = new Float32Array(S), row = new Float32Array(S);
    for (let py = 0; py < S; py++) { const nn = half - (py + 0.5) * m; for (let px = 0; px < S; px++) { const e = (px + 0.5) * m - half, h = w.h(e, nn); row[px] = h;
        const k = Math.min(n - 1, Math.max(0, Math.round((nn + half) / w.cell))) * n + Math.min(n - 1, Math.max(0, Math.round((e + half) / w.cell))), v = V[k]; let col = INK.open; const F = w.fieldAt(e, nn);
        if (v === 4 || v === 5) col = INK.wood; else if (v === 3) col = INK.scrub; else if (v === 6) col = INK.built; else if (F) col = F.t < 0.4 ? (F.id % 3 === 0 ? INK.plough : INK.open) : INK.field[F.id % 3];
        const hw = px ? row[px - 1] : h, hn = py ? prevRow[px] : h, sh = Math.max(0.72, Math.min(1.16, 1 + ((h - hw) + (h - hn)) / m * 0.9));
        let r = col[0] * sh, g = col[1] * sh, b = col[2] * sh;
        const ci = Math.floor(h / interval), edge = (px && Math.floor(hw / interval) !== ci) || (py && Math.floor(hn / interval) !== ci);
        if (edge) { const idx = Math.max(ci, Math.floor((px ? hw : hn) / interval)) % 5 === 0, a = idx ? 0.75 : 0.38; r = r * (1 - a) + INK.contour[0] * a; g = g * (1 - a) + INK.contour[1] * a; b = b * (1 - a) + INK.contour[2] * a; }
        const o = (py * S + px) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; } const t = prevRow; prevRow = row; row = t; }
    x.putImageData(img, 0, 0);
    const P = (e, nn) => [(e + half) / m, (half - nn) / m]; x.lineCap = x.lineJoin = 'round';
    for (const r of w.roads) { for (const [col, wd] of [['#6b5a48', r.w * 1.6 / m + 2.2], ['#f4ecd6', r.w * 1.6 / m + 0.8]]) { x.strokeStyle = col; x.lineWidth = wd; x.beginPath(); r.pts.forEach((p, i) => { const [a, b] = P(p[0], p[1]); if (i) x.lineTo(a, b); else x.moveTo(a, b); }); x.stroke(); } }
    x.fillStyle = '#3d3a36'; for (const b of w.buildings) { const [a, bb] = P(b.e, b.n); x.save(); x.translate(a, bb); x.rotate(-b.rot);   /* north is up on the map, so a turn that is anticlockwise on the ground is a negative canvas turn (matches world.buildingAt) */ x.fillRect(-b.w / m / 2, -b.d / m / 2, Math.max(1.5, b.w / m), Math.max(1.5, b.d / m)); x.restore(); }
    // grid every kilometre
    x.strokeStyle = 'rgba(40,60,90,.28)'; x.lineWidth = 1; for (let g = -half; g <= half; g += 1000) { const [a] = P(g, 0), [, b] = P(0, g); x.beginPath(); x.moveTo(a, 0); x.lineTo(a, S); x.moveTo(0, b); x.lineTo(S, b); x.stroke(); }
    return c;
  }
  // where could someone standing in the open see (and so shoot at) a vehicle at this spot? Worked out once per spot.
  viewshedFor(e, n) { const key = `${Math.round(e)},${Math.round(n)}`; if (key === this.shedKey) return; this.shedKey = key; const w = this.world, st = 80, R = 4500, c = document.createElement('canvas'), N = Math.ceil(2 * R / st); c.width = c.height = N; const x = c.getContext('2d'), img = x.createImageData(N, N); let seen = 0, tot = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const oe = e - R + (i + 0.5) * st, on = n + R - (j + 0.5) * st, dd = Math.hypot(oe - e, on - n); if (dd > R || dd < 60 || !w.inside(oe, on)) continue; tot++; if (w.los(oe, on, 1.3, e, n, 2.2).clear) { seen++; const o = (j * N + i) * 4; img.data[o] = 215; img.data[o + 1] = 40; img.data[o + 2] = 30; img.data[o + 3] = 86; } }
    x.putImageData(img, 0, 0); this.shed = { c, e, n, R, share: tot ? seen / tot : 0 }; }
  toScreen(e, n) { const r = this.cv; return [r.width / 2 + (e - this.cx) * this.k, r.height / 2 - (n - this.cn) * this.k]; }
  toWorld(sx, sy) { const r = this.cv; return [this.cx + (sx - r.width / 2) / this.k, this.cn - (sy - r.height / 2) / this.k]; }
  // st: { tank: {e,n,h}, home: {e,n} | null, units: [{e,n,name,state,known,alive}], showAll, missiles: [{e,n}], route }
  draw(st) {
    const cv = this.cv, r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const x = this.x, w = this.world, k = this.k = this.scale * dpr; x.fillStyle = '#0b0f0e'; x.fillRect(0, 0, cv.width, cv.height);
    const [x0, y0] = this.toScreen(-w.half, w.half); x.imageSmoothingQuality = 'high'; x.drawImage(this.base, x0, y0, w.size * k, w.size * k);
    if (this.shed) { const s = this.shed, [a, b] = this.toScreen(s.e - s.R, s.n + s.R); x.imageSmoothingEnabled = true; x.drawImage(s.c, a, b, 2 * s.R * k, 2 * s.R * k); }
    const dot = (e, n, col, rad, label, ring) => { const [a, b] = this.toScreen(e, n); x.beginPath(); x.arc(a, b, rad * dpr, 0, 6.283); if (ring) { x.strokeStyle = col; x.lineWidth = 2 * dpr; x.setLineDash([4 * dpr, 3 * dpr]); x.stroke(); x.setLineDash([]); } else { x.fillStyle = col; x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.2 * dpr; x.stroke(); } if (label) { x.font = `${600} ${11 * dpr}px ui-monospace, Menlo, monospace`; const tw = x.measureText(label).width; x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(a + 9 * dpr, b - 8 * dpr, tw + 8 * dpr, 16 * dpr); x.fillStyle = col; x.fillText(label, a + 13 * dpr, b + 4 * dpr); } };
    for (const u of st.units || []) { if (!u.alive) continue; if (u.known) dot(u.e, u.n, '#ff5a4d', 6, u.name); else if (st.showAll) dot(u.e, u.n, '#ff9d8f', 6, `${u.name} · ${u.state}`, true); }
    for (const m of st.missiles || []) dot(m.e, m.n, '#ffb347', 3.5);
    if (st.tank) { const T = st.tank, [a, b] = this.toScreen(T.e, T.n), h = T.h * Math.PI / 180; x.save(); x.translate(a, b); x.rotate(h); x.fillStyle = '#39d98a'; x.strokeStyle = '#03130b'; x.lineWidth = 1.5 * dpr; x.beginPath(); x.moveTo(0, -11 * dpr); x.lineTo(7 * dpr, 8 * dpr); x.lineTo(0, 4 * dpr); x.lineTo(-7 * dpr, 8 * dpr); x.closePath(); x.fill(); x.stroke(); x.restore(); }
    // scale bar and north arrow
    const bar = [100, 200, 500, 1000, 2000].find(v => v * k > 90 * dpr) || 2000, bx = 18 * dpr, by = cv.height - 22 * dpr; x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(bx - 8 * dpr, by - 20 * dpr, bar * k + 16 * dpr, 30 * dpr); x.strokeStyle = '#e6efe9'; x.lineWidth = 2 * dpr; x.beginPath(); x.moveTo(bx, by - 5 * dpr); x.lineTo(bx, by); x.lineTo(bx + bar * k, by); x.lineTo(bx + bar * k, by - 5 * dpr); x.stroke(); x.fillStyle = '#e6efe9'; x.font = `${11 * dpr}px ui-monospace, Menlo, monospace`; x.fillText(bar >= 1000 ? bar / 1000 + ' km' : bar + ' m', bx + 4 * dpr, by - 7 * dpr);
  }
  _wire() { const cv = this.cv; let drag = null, moved = 0;
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr, [we, wn] = this.toWorld(sx, sy), f = Math.exp(-e.deltaY * 0.0015); this.scale = Math.max(0.02, Math.min(3, this.scale * f)); this.k = this.scale * dpr; const [we2, wn2] = this.toWorld(sx, sy); this.cx += we - we2; this.cn += wn - wn2; }, { passive: false });
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; moved = 0; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy); this.cx -= dx / this.scale; this.cn += dy / this.scale; drag = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', e => { if (drag && moved < 5 && this.pickMode && this.onPick) { const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, [we, wn] = this.toWorld((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr); this.onPick(we, wn); } drag = null; });
  }
}
