// HKOI Battlefield: what the crew's displays show.
// Each display is a canvas laid out like the real kind of thing: a status line across the top (title, page, state), labels beside the
// bezel keys down the sides, the working area in the middle and an advisory line along the bottom. Everything drawn is read from the
// battle (the data object D is put together in interior.js): nothing here decides or changes anything.
// A display is redrawn only when its signature (the values it shows) changes.

const F = '"DIN Alternate", "Arial Narrow", Arial, sans-serif';
const C = { cy: '#7ff0e6', dim: '#3f968f', am: '#ffb020', rd: '#ff5040', gr: '#5cff7a', g: '#9dffb0', gd: '#4f9a62', bg: '#020806', wh: '#e8fff4' };
const DEG = Math.PI / 180;
const pad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');
const up = s => String(s == null ? '' : s).toUpperCase();
const TONE = { ok: C.gr, busy: C.cy, warn: C.am, bad: C.rd };

// pixel size of each display's canvas; opaque ones are full panels, the others are symbols laid over a live sight picture
export const MFD = {
  gps: { w: 640, h: 400, keys: 4 }, citv: { w: 640, h: 400, keys: 4 }, comp: { w: 640, h: 288, opaque: true, keys: 0 },
  hkoi: { w: 1024, h: 640, opaque: true, keys: 5 }, drv: { w: 768, h: 480, opaque: true, keys: 0, bottom: 5 }, ldr: { w: 640, h: 400, opaque: true, keys: 4 },
};

function text(x, s, px, py, size, col, align = 'left', weight = 700) { x.font = `${weight} ${size}px ${F}`; x.fillStyle = col; x.textAlign = align; x.fillText(s, px, py); }
function line(x, col, w, pts) { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); for (let i = 0; i < pts.length; i += 4) { x.moveTo(pts[i], pts[i + 1]); x.lineTo(pts[i + 2], pts[i + 3]); } x.stroke(); }
function box(x, col, px, py, w, h, fill) { if (fill) { x.fillStyle = col; x.fillRect(px, py, w, h); } else { x.strokeStyle = col; x.lineWidth = 2; x.strokeRect(px, py, w, h); } }

// labels beside the bezel keys: n down each side, at the same heights as the keys on the bezel (interior_build.js puts them there)
function sideKeys(x, W, H, n, left, right, sel, col, size) {
  for (let i = 0; i < n; i++) for (const [list, sx] of [[left, 0], [right, 1]]) {
    const s = list && list[i]; if (!s) continue; const y = H * (i + 0.5) / n, on = sel.includes(s), tw = Math.max(46, s.length * size * 0.58 + 14), px = sx ? W - 8 - tw : 8;
    line(x, col, 2, sx ? [W - 7, y, W, y] : [0, y, 7, y]);
    if (on) { box(x, col, px, y - size * 0.72, tw, size * 1.44, true); text(x, s, px + tw / 2, y + size * 0.36, size, C.bg, 'center'); }
    else { box(x, col, px, y - size * 0.72, tw, size * 1.44); text(x, s, px + tw / 2, y + size * 0.36, size, col, 'center'); }
  }
}
function bottomKeys(x, W, H, list, sel, col, size) {
  const n = list.length; for (let i = 0; i < n; i++) { const s = list[i], cx = W * (i + 0.5) / n, tw = W / n - 16, on = sel.includes(s);
    line(x, col, 2, [cx, H - 6, cx, H]); box(x, col, cx - tw / 2, H - 8 - size * 1.5, tw, size * 1.5, on); text(x, s, cx, H - 8 - size * 0.42, size, on ? C.bg : col, 'center'); }
}
// the line across the top: title at the left, page name in the middle, a state word in a box at the right
function statusLine(x, W, o) {
  const h = o.h || 44, s = o.size || 26; line(x, o.col, 2, [0, h, W, h]);
  text(x, o.title, o.x0 || 12, h - 13, s, o.col); if (o.page) text(x, o.page, W / 2, h - 13, s, o.col, 'center');
  if (o.state) { const tw = Math.max(150, o.state.length * s * 0.62 + 24), px = W - (o.x0 || 12) - tw; box(x, o.stateCol || o.col, px, 6, tw, h - 12, true); text(x, o.state, px + tw / 2, h - 13, s, C.bg, 'center'); }
}
// a bearing tape: the bearing in the middle, ticks every 10 degrees, numbers every 30
function tape(x, cx, y, w, brg, col, size) {
  const ppd = w / 90; x.save(); x.beginPath(); x.rect(cx - w / 2, y - size - 4, w, size + 22); x.clip(); line(x, col, 2, [cx - w / 2, y + 12, cx + w / 2, y + 12]);
  const b0 = Math.floor((brg - 50) / 10) * 10; for (let b = b0; b <= brg + 50; b += 10) { const px = cx + (b - brg) * ppd, big = ((b % 30) + 30) % 30 === 0; line(x, col, 2, [px, y + 12, px, y + (big ? 0 : 6)]); if (big) { const v = ((b % 360) + 360) % 360; text(x, v === 0 ? 'N' : v === 90 ? 'E' : v === 180 ? 'S' : v === 270 ? 'W' : pad(v, 3), px, y - 4, size, col, 'center', 600); } }
  x.restore(); x.fillStyle = col; x.beginPath(); x.moveTo(cx, y + 14); x.lineTo(cx - 7, y + 26); x.lineTo(cx + 7, y + 26); x.fill();
}
// a bar of segments: how much is left of a full load
function bar(x, px, py, w, h, n, max, col, segs = 20) {
  const f = max > 0 ? Math.min(1, n / max) : 0, lit = Math.ceil(f * segs - 1e-6), sw = w / segs; box(x, C.dim, px - 3, py - 3, w + 6, h + 6);
  for (let i = 0; i < segs; i++) { x.fillStyle = i < lit ? col : 'rgba(63,150,143,.18)'; x.fillRect(px + i * sw + 1, py, sw - 3, h); }
}
// a plan of the vehicle from above: hull, gun, and (if given) a second line for a sight; up is the hull's front
function plan(x, cx, cy, s, rel, col, sight) {
  box(x, col, cx - s * 0.5, cy - s, s, s * 2); line(x, col, 2, [cx - s * 0.5, cy - s * 0.7, cx + s * 0.5, cy - s * 0.7]);
  x.strokeStyle = col; x.beginPath(); x.arc(cx, cy, s * 0.36, 0, 6.3); x.stroke(); const a = rel * DEG; line(x, col, 4, [cx, cy, cx + Math.sin(a) * s * 1.35, cy - Math.cos(a) * s * 1.35]);
  if (sight != null) { const b = sight * DEG; x.setLineDash([5, 4]); line(x, C.am, 2, [cx, cy, cx + Math.sin(b) * s * 1.5, cy - Math.cos(b) * s * 1.5]); x.setLineDash([]); }
}
const relWord = rel => (Math.abs(rel) < 2 ? 'OVER THE FRONT' : Math.abs(rel) > 178 ? 'OVER THE REAR' : (rel > 0 ? 'RIGHT ' : 'LEFT ') + pad(Math.abs(rel), 3));

// ---------------------------------------------------------------- the HKOI panel
function hkoi(x, W, H, D) {
  const col = C.cy, hk = D.hk, sc = hk === 'FIRING' ? C.rd : hk === 'SEARCH' ? C.cy : hk === 'OFF' ? '#556677' : C.am, page = ['THREATS', 'ROUNDS AND FAULTS', 'CREW'][D.hkPage] || 'THREATS';
  statusLine(x, W, { title: 'HKOI 30 MM', page, state: hk, stateCol: sc, col, x0: 104, size: 28, h: 48 });
  sideKeys(x, W, H, 5, ['THRT', 'RNDS', 'CREW', 'TEST', 'DIM'], ['AUTO', 'SEMI', 'SAFE', 'RDR', 'BRT'], [['THRT', 'RNDS', 'CREW'][D.hkPage] || 'THRT', D.alive ? 'AUTO' : 'SAFE', D.alive ? 'RDR' : ''], col, 22);
  const X0 = 108, X1 = W - 108, th = D.threats;
  if (D.hkPage === 2) {
    if (!D.crew || !D.crew.on) text(x, 'NO CREW REPORT', X0, 110, 26, col);
    else { text(x, 'STATION      STATE        STRESS                  STATUS', X0, 92, 22, C.dim);
      ['cdr', 'gnr', 'ldr', 'drv'].forEach((r, i) => { const m = D.crew.who[r], y = 140 + i * 62, tc = m.status === 'down' || m.status === 'killed' ? C.rd : m.state === 'panicked' ? C.rd : m.state === 'shaken' || m.status === 'wounded' ? C.am : m.state === 'strained' ? C.cy : C.gr;
        text(x, up(m.name || r), X0, y, 26, tc); text(x, up(m.state), X0 + 190, y, 26, tc); bar(x, X0 + 370, y - 20, 240, 22, m.stress, 1, tc, 12); text(x, up(m.status === 'ok' ? (m.busy || 'AT HIS POST') : m.status).slice(0, 15), X0 + 635, y, 24, tc);
        if (m.why && m.state !== 'steady') text(x, up(m.why).slice(0, 60), X0 + 190, y + 24, 18, C.dim, 'left', 600); });
      text(x, D.crew.abandoned ? 'CREW HAS LEFT THE VEHICLE' : D.crew.buttoned ? 'HATCHES SHUT' : 'COMMANDER\'S HATCH OPEN', X0, 410, 24, D.crew.abandoned ? C.rd : col); }
  } else if (D.hkPage === 1) {
    const rows = [['OBSCURANT', D.st.obs, D.max.obs], ['AIRBURST', D.st.he, D.max.he]];
    rows.forEach(([n, v, m], i) => { const y = 96 + i * 64, low = v != null && v < m * 0.25; text(x, n, X0, y, 26, low ? C.am : col); bar(x, X0, y + 10, 520, 26, v || 0, m, low ? C.am : col, 30); text(x, `${v == null ? '--' : v} / ${m}`, X0 + 540, y + 32, 26, low ? C.am : col); });
    text(x, 'TROPHY', X0, 232, 26, col); pips(x, X0 + 130, 222, 'L', D.st.apsL, D.max.aps); pips(x, X0 + 400, 222, 'R', D.st.apsR, D.max.aps);
    text(x, 'SYSTEM', X0, 290, 22, C.dim); text(x, 'STATE', X0 + 300, 290, 22, C.dim);
    D.faults.forEach(([n, s, tone], i) => { const cx = X0 + (i > 3 ? 420 : 0), y = 322 + (i % 4) * 30; text(x, n, cx, y, 24, col, 'left', 600); text(x, s, cx + 300 - (i > 3 ? 90 : 0), y, 24, TONE[tone] || col); });
  } else {
    // the threat list: what is in the air, and what the station is doing about each
    text(x, 'NO', X0, 82, 20, C.dim); text(x, 'WEAPON', X0 + 40, 82, 20, C.dim); text(x, 'RNG M', X0 + 262, 82, 20, C.dim, 'right'); text(x, 'BRG', X0 + 322, 82, 20, C.dim, 'right'); text(x, 'TTI S', X0 + 396, 82, 20, C.dim, 'right'); text(x, 'HKOI ACTION', X0 + 414, 82, 20, C.dim);
    line(x, C.dim, 1.5, [X0, 90, X0 + 590, 90]);
    if (!th.length) { text(x, D.alive ? 'NO THREATS IN THE AIR' : 'STATION OFF', X0, 124, 26, col); text(x, D.alive ? 'RADAR SEARCHING ALL ROUND' : '', X0, 156, 22, C.dim, 'left', 600); }
    th.slice(0, 6).forEach((m, i) => { const y = 120 + i * 31, tc = TONE[m.tone] || col; if (i === 0) box(x, 'rgba(127,240,230,.10)', X0 - 6, y - 24, 602, 31, true);
      text(x, pad(m.no, 2), X0, y, 25, tc); text(x, up(m.name).slice(0, 11), X0 + 40, y, 25, tc); text(x, pad(m.range, 4), X0 + 262, y, 25, tc, 'right'); text(x, pad(m.brg, 3), X0 + 322, y, 25, tc, 'right');
      text(x, m.tti == null ? '--.-' : m.tti.toFixed(1), X0 + 396, y, 25, m.tti != null && m.tti < 3 ? C.rd : tc, 'right'); text(x, m.act, X0 + 414, y, 23, tc); });
    if (th.length > 6) text(x, `+ ${th.length - 6} MORE`, X0, 120 + 6 * 31, 22, C.am);
    // the scope: north up, the vehicle at the centre, rings at 2 and 4 km, the gun line, a mark for each threat at its bearing
    { const ox = X1 - 108, oy = 208, R = 104; x.strokeStyle = C.dim; x.lineWidth = 1.5; for (const r of [R, R / 2]) { x.beginPath(); x.arc(ox, oy, r, 0, 6.3); x.stroke(); }
      for (let a = 0; a < 360; a += 30) { const s = Math.sin(a * DEG), c = Math.cos(a * DEG); line(x, C.dim, 1.5, [ox + s * R, oy - c * R, ox + s * (R + (a % 90 ? 5 : 10)), oy - c * (R + (a % 90 ? 5 : 10))]); }
      text(x, 'N', ox, oy - R - 13, 20, col, 'center'); text(x, '4', ox + R * 0.72 + 6, oy + R * 0.72 + 4, 16, C.dim, 'left', 600); text(x, '2', ox + R * 0.36 + 4, oy + R * 0.36 + 2, 16, C.dim, 'left', 600);
      x.save(); x.translate(ox, oy); x.rotate(D.hull * DEG); x.strokeStyle = col; x.lineWidth = 2; x.strokeRect(-6, -11, 12, 22); x.restore();
      const tb = D.turBrg * DEG; line(x, col, 2.5, [ox, oy, ox + Math.sin(tb) * R * 0.42, oy - Math.cos(tb) * R * 0.42]);
      if (D.alive) { const sw = D.sweep * DEG; const g = x.createLinearGradient(ox, oy, ox + Math.sin(sw) * R, oy - Math.cos(sw) * R); g.addColorStop(0, 'rgba(127,240,230,0)'); g.addColorStop(1, 'rgba(127,240,230,.55)'); line(x, g, 2, [ox, oy, ox + Math.sin(sw) * R, oy - Math.cos(sw) * R]); }
      for (const m of th) { const b = m.brg * DEG, rr = Math.min(1, m.range / 4000) * R, px = ox + Math.sin(b) * rr, py = oy - Math.cos(b) * rr, tc = TONE[m.tone] || C.rd;
        line(x, tc, 3, [ox + Math.sin(b) * (R - 9), oy - Math.cos(b) * (R - 9), ox + Math.sin(b) * (R + 9), oy - Math.cos(b) * (R + 9)]);
        x.fillStyle = tc; x.beginPath(); x.moveTo(px, py - 7); x.lineTo(px + 6, py + 5); x.lineTo(px - 6, py + 5); x.fill(); text(x, pad(m.no, 2), px + 9, py + 6, 16, tc, 'left', 600); }
      text(x, `GUN ${pad(D.turBrg, 3)}`, ox - R, oy + R + 34, 20, col); text(x, `HULL ${pad(D.hull, 3)}`, ox + R, oy + R + 34, 20, C.dim, 'right'); }
    text(x, `TRACKED ${D.tracks}    IN THE AIR ${th.length}`, X0, 344, 22, col);
    // what is left
    text(x, 'OBSCURANT', X0, 392, 22, D.st.obs < D.max.obs * 0.25 ? C.am : col); bar(x, X0 + 132, 373, 330, 22, D.st.obs || 0, D.max.obs, D.st.obs < D.max.obs * 0.25 ? C.am : col); text(x, pad(D.st.obs || 0, 3), X0 + 474, 392, 24, col);
    text(x, 'AIRBURST', X0, 432, 22, D.st.he < D.max.he * 0.25 ? C.am : col); bar(x, X0 + 132, 413, 330, 22, D.st.he || 0, D.max.he, D.st.he < D.max.he * 0.25 ? C.am : col); text(x, pad(D.st.he || 0, 3), X0 + 474, 432, 24, col);
    text(x, 'TROPHY', X0 + 540, 392, 22, col); pips(x, X0 + 640, 382, 'L', D.st.apsL, D.max.aps); pips(x, X0 + 640, 422, 'R', D.st.apsR, D.max.aps);
    text(x, up(D.hkLine).slice(0, 74), X0, 484, 21, C.dim, 'left', 600); if (D.hkFact) text(x, up(D.hkFact).slice(0, 74), X0, 512, 21, C.dim, 'left', 600);
  }
  advisory(x, W, H, D, D.alive ? (hk === 'SEARCH' ? 'RADAR SEARCHING   AUTOMATIC' : 'ENGAGEMENT IN PROGRESS   AUTOMATIC') : 'STATION OFF', X0, X1, 26);
}
function pips(x, px, py, tag, n, max) { text(x, tag, px, py + 9, 24, C.cy); for (let i = 0; i < max; i++) { x.beginPath(); x.arc(px + 36 + i * 30, py, 10, 0, 6.3); if (i < (n || 0)) { x.fillStyle = C.gr; x.fill(); } else { x.strokeStyle = (n || 0) === 0 ? C.rd : C.dim; x.lineWidth = 2; x.stroke(); } } if (!(n > 0)) text(x, 'EMPTY', px + 44 + max * 30, py + 9, 22, C.rd); }
// the bottom line: a red bar that flashes while a missile is coming; otherwise a quiet note
function advisory(x, W, H, D, quiet, X0, X1, size) {
  const y = H - size * 1.9; line(x, C.dim, 1.5, [X0, y - 6, X1, y - 6]);
  if (D.warning && D.blink) { box(x, C.rd, X0, y, X1 - X0, size * 1.6, true); text(x, 'MISSILE WARNING', (X0 + X1) / 2, y + size * 1.15, size, C.bg, 'center'); }
  else text(x, D.warning ? 'MISSILE WARNING' : quiet, (X0 + X1) / 2, y + size * 1.15, size, D.warning ? C.rd : C.dim, 'center');
}

// ---------------------------------------------------------------- gunner's primary sight (symbols over the thermal picture)
function gps(x, W, H, D) {
  const g = C.g, cx = W / 2, cy = H / 2; x.lineCap = 'butt';
  line(x, g, 2.5, [cx, 96, cx, cy - 34, cx, cy + 34, cx, H - 96, cx - 150, cy, cx - 34, cy, cx + 34, cy, cx + 150, cy]);
  for (const d of [60, 100, 140]) line(x, g, 2, [cx - d, cy - 7, cx - d, cy + 7, cx + d, cy - 7, cx + d, cy + 7]);
  for (const [d, w] of [[50, 26], [84, 18], [112, 12]]) line(x, g, 2, [cx - w, cy + d, cx + w, cy + d]);
  x.fillStyle = g; x.fillRect(cx - 2, cy - 2, 4, 4);
  tape(x, cx, 30, 250, D.turBrg, g, 18);
  text(x, D.rf ? 'RNG ' + pad(Math.round(D.rf.R / 10) * 10, 4) : 'RNG ----', 84, 34, 26, g); text(x, 'AMP', W - 84, 34, 26, g, 'right'); text(x, D.gpsMag + 'X', W - 84, 62, 22, g, 'right'); text(x, 'TIS WHT', 84, 62, 20, C.gd, 'left', 600);
  sideKeys(x, W, H, 4, ['AMP', 'COAX', 'LRF', 'POL'], [D.gpsMag === 10 ? '10X' : '3X', 'TIS', 'DAY', 'BST'], ['AMP', 'TIS', D.gpsMag === 10 ? '10X' : '3X', D.rf && D.wait > 1.2 ? 'LRF' : ''], g, 17);
  text(x, D.gunLine, cx, H - 58, 24, D.gunLine === 'OFF' ? C.rd : g, 'center');
  if (D.loaded && D.main > 0) { box(x, g, cx - 84, H - 46, 168, 30); text(x, 'GUN READY', cx, H - 24, 22, g, 'center'); } else if (D.main > 0) text(x, 'LOADING', cx, H - 24, 22, C.am, 'center'); else text(x, 'NO ROUNDS', cx, H - 24, 22, C.rd, 'center');
  text(x, `MAIN ${pad(D.main, 2)}`, 84, H - 24, 22, g); text(x, Math.abs(D.rel) < 2 ? 'GUN FRONT' : Math.abs(D.rel) > 178 ? 'GUN REAR' : `GUN ${D.rel > 0 ? 'R' : 'L'}${pad(Math.abs(D.rel), 3)}`, W - 84, H - 24, 20, g, 'right');
  if (D.tgt) text(x, up(D.tgt.name) + '  ' + up(D.tgt.range), cx, 92, 20, g, 'center', 600);
  if (!D.gpsLive) text(x, D.liveNote, cx, 120, 18, 'rgba(157,255,176,.75)', 'center', 600);
  if (D.warning && D.blink) text(x, 'MISSILE WARNING', cx, H - 92, 24, C.rd, 'center');
}
// ---------------------------------------------------------------- the commander's display: his own thermal viewer
function citv(x, W, H, D) {
  const g = C.g, cx = W / 2, cy = H / 2;
  line(x, g, 2.5, [cx - 60, cy - 50, cx - 60, cy - 30, cx - 60, cy - 50, cx - 40, cy - 50, cx + 60, cy - 50, cx + 40, cy - 50, cx + 60, cy - 50, cx + 60, cy - 30, cx - 60, cy + 50, cx - 60, cy + 30, cx - 60, cy + 50, cx - 40, cy + 50, cx + 60, cy + 50, cx + 40, cy + 50, cx + 60, cy + 50, cx + 60, cy + 30]);
  line(x, g, 2, [cx, cy - 78, cx, cy - 16, cx, cy + 16, cx, cy + 78, cx - 100, cy, cx - 16, cy, cx + 16, cy, cx + 100, cy]);
  tape(x, cx, 30, 250, D.citvYaw, g, 18);
  text(x, 'CITV', 84, 34, 26, g); text(x, D.citvMag + 'X', W - 84, 34, 26, g, 'right'); text(x, D.citvTgt ? (D.citvOn ? 'TARGET HELD' : 'SLEWING TO TARGET') : 'AUTO SCAN', 84, 62, 20, D.citvTgt ? C.am : g, 'left', 600);
  sideKeys(x, W, H, 4, ['AUTO', 'MAN', 'DESIG', 'GLOS'], [D.citvMag === 10 ? '10X' : '3X', 'WHT', 'STAB', 'BST'], [D.citvTgt ? 'DESIG' : 'AUTO', D.citvMag === 10 ? '10X' : '3X', 'WHT', 'STAB'], g, 17);
  plan(x, 118, H - 74, 22, D.rel, g, ((D.citvYaw - D.hull + 540) % 360) - 180); text(x, 'GUN', 150, H - 78, 17, g, 'left', 600); text(x, 'SIGHT', 150, H - 58, 17, C.am, 'left', 600);
  text(x, `SIGHT ${pad(D.citvYaw, 3)}   GUN ${pad(D.turBrg, 3)}`, W - 84, H - 24, 20, g, 'right');
  if (D.cdrLine) text(x, up(D.cdrLine).slice(0, 46), cx, H - 24 - 30, 18, C.gd, 'center', 600);
  if (!D.citvLive) text(x, D.liveNote, cx, 120, 18, 'rgba(157,255,176,.75)', 'center', 600);
  if (D.warning && D.blink) { box(x, C.rd, cx - 130, 76, 260, 30, true); text(x, 'MISSILE WARNING', cx, 99, 22, C.bg, 'center'); }
}
// ---------------------------------------------------------------- the gunner's fire-control panel
function comp(x, W, H, D) {
  const g = '#7ff0a0'; statusLine(x, W, { title: 'FIRE CONTROL', state: D.solution, stateCol: D.solution === 'SOLUTION' ? C.gr : D.solution === 'OFF' ? C.rd : C.dim, col: g, size: 24, h: 40 });
  const rows = [['RANGE', D.rf ? pad(Math.round(D.rf.R / 10) * 10, 4) + ' M' : '---- M'], ['AMMO', 'AMP   ' + pad(D.main, 2) + ' / ' + pad(D.max.main, 2)], ['BREECH', D.loaded ? 'LOADED' : D.main > 0 ? 'LOADING' : 'EMPTY'], ['GUN', relWord(D.rel)], ['FIRES IN', D.rf && D.wait > 0 ? D.wait.toFixed(1) + ' S' : '--.- S']];
  rows.forEach(([a, b], i) => { const y = 74 + i * 38; text(x, a, 16, y, 24, C.gd, 'left', 600); text(x, b, 150, y, 26, a === 'BREECH' && !D.loaded ? C.am : g); });
  line(x, C.gd, 1.5, [392, 50, 392, H - 12]);
  D.fcs.forEach(([n, s, tone], i) => { const y = 74 + i * 30; text(x, n, 408, y, 21, C.gd, 'left', 600); text(x, s, W - 14, y, 21, TONE[tone] || g, 'right'); });
  if (D.warning && D.blink) { box(x, C.rd, 400, H - 44, W - 412, 32, true); text(x, 'MISSILE WARNING', (400 + W - 12) / 2, H - 21, 21, C.bg, 'center'); }
}
// ---------------------------------------------------------------- the driver's display
function drv(x, W, H, D) {
  const col = C.cy; statusLine(x, W, { title: 'DRIVER', page: 'DRIVE', state: D.alive ? (D.kmh > 0 ? 'MOVING' : 'HALTED') : 'OFF', stateCol: D.alive ? col : C.rd, col, size: 26, h: 44 });
  text(x, String(D.kmh).padStart(2, ' '), 150, 170, 120, col, 'right'); text(x, 'KM/H', 160, 170, 26, C.dim);
  box(x, col, 160, 78, 70, 58); text(x, D.gear, 195, 124, 46, col, 'center');
  text(x, 'RPM', 28, 216, 22, C.dim, 'left', 600); bar(x, 90, 198, 250, 22, D.rpm, 3000, D.rpm > 2700 ? C.am : col, 15); text(x, pad(D.rpm, 4), 352, 217, 24, col);
  text(x, 'STEER', 28, 258, 22, C.dim, 'left', 600); { const bx = 90, bw = 250; box(x, C.dim, bx - 3, 240, bw + 6, 26); line(x, C.dim, 1.5, [bx + bw / 2, 240, bx + bw / 2, 266]); x.fillStyle = col; x.fillRect(bx + bw / 2 + D.steer * (bw / 2 - 8) - 7, 243, 14, 20); }
  tape(x, 590, 84, 300, D.hull, col, 20); text(x, 'HDG ' + pad(D.hull, 3), 590, 136, 26, col, 'center');
  plan(x, 500, 248, 34, D.rel, col); text(x, 'GUN', 566, 232, 22, C.dim, 'left', 600); text(x, relWord(D.rel), 566, 262, 26, Math.abs(D.rel) > 25 ? C.am : col);
  // cautions: only what is true
  text(x, 'CAUTIONS', 28, 318, 22, C.dim, 'left', 600); line(x, C.dim, 1.5, [28, 326, W - 28, 326]);
  const ca = D.cautions.length ? D.cautions : [['NONE', 'ok']]; ca.slice(0, 3).forEach(([s, tone], i) => text(x, s, 28 + (i % 2) * 370, 356 + Math.floor(i / 2) * 30, 24, TONE[tone] || col));
  if (D.warning && D.blink) { box(x, C.rd, 28, 372, W - 56, 40, true); text(x, 'MISSILE WARNING', W / 2, 402, 28, C.bg, 'center'); }
  bottomKeys(x, W, H, ['DRIVE', 'MAINT', 'FUEL', 'NAV', 'THERM'], ['DRIVE'], col, 22);
}
// ---------------------------------------------------------------- the loader's panel
function ldr(x, W, H, D) {
  const col = C.cy; statusLine(x, W, { title: 'LOADER', page: 'AMMUNITION', state: D.ldrUp ? 'UP' : D.loading ? 'LOADING' : D.loaded ? 'LOADED' : D.main > 0 ? 'READY' : 'EMPTY', stateCol: D.ldrUp || D.loading ? C.am : D.main > 0 ? C.gr : C.rd, col, x0: 76, size: 22, h: 40 });
  sideKeys(x, W, H, 4, ['AMMO', 'GUN', 'MG', 'COMM'], ['AMP', 'DOOR', 'SAFE', 'LAMP'], ['AMMO', 'AMP', D.armed ? '' : 'SAFE'], col, 17);
  const X0 = 80; text(x, `READY RACK   ${pad(D.main, 2)} / ${pad(D.max.main, 2)}  AMP`, X0, 70, 22, col);
  { const n = D.max.main, per = Math.ceil(n / 2), w = Math.min(26, 470 / per); for (let i = 0; i < n; i++) { const px = X0 + (i % per) * w, py = 82 + Math.floor(i / per) * 46, on = i < D.main; x.beginPath(); x.moveTo(px + 3, py + 40); x.lineTo(px + 3, py + 14); x.quadraticCurveTo(px + w / 2 - 1, py - 6, px + w - 5, py + 14); x.lineTo(px + w - 5, py + 40); x.closePath(); if (on) { x.fillStyle = col; x.fill(); } else { x.strokeStyle = C.dim; x.lineWidth = 1.5; x.stroke(); } } }
  const rows = [['BREECH', D.loaded ? 'ROUND LOADED' : D.loading ? 'LOADING' : D.main > 0 ? 'OPEN' : 'NO ROUNDS', D.loaded ? 'ok' : D.main > 0 ? 'warn' : 'bad'], ['AMMO DOOR', D.door > 0.5 ? 'OPEN' : 'CLOSED', D.door > 0.5 ? 'warn' : 'ok'], ['GUN', D.armed ? 'ARMED' : 'SAFE', D.armed ? 'warn' : 'ok'], ['M240', up(D.m240State), D.ldrUp ? 'busy' : 'ok']];
  rows.forEach(([a, b, tone], i) => { const y = 208 + i * 30; text(x, a, X0, y, 21, C.dim, 'left', 600); text(x, b, X0 + 150, y, 23, TONE[tone] || col); });
  text(x, 'M240 ROUNDS', X0 + 300, 208, 19, C.dim, 'left', 600); bar(x, X0 + 300, 220, 170, 18, D.m240, D.max.m240, col, 12); text(x, pad(D.m240, 3), X0 + 300, 268, 23, col);
  advisory(x, W, H, D, D.ldrUp ? 'LOADER UP: MAIN GUN CANNOT BE LOADED' : 'TURRET POWER ON', X0, W - 80, 20);
}

const DRAW = { hkoi, gps, citv, comp, drv, ldr };
// what each display shows, as one string: the display is redrawn only when this changes
const SIG = {
  hkoi: D => [D.hk, D.hkPage, D.st.obs, D.st.he, D.st.apsL, D.st.apsR, D.tracks, D.warning && D.blink, D.alive, Math.round(D.turBrg / 2), Math.round(D.hull / 2), D.alive ? D.sweep : 0, D.hkPage === 0 ? D.hkLine + D.hkFact + D.threats.map(m => m.no + m.name + Math.round(m.range / 10) + Math.round(m.brg) + (m.tti == null ? '' : m.tti.toFixed(1)) + m.act).join() : D.hkPage === 1 ? D.faults.join() : D.crew && D.crew.on ? ['cdr', 'gnr', 'ldr', 'drv'].map(r => D.crew.who[r].state + Math.round(D.crew.who[r].stress * 12) + D.crew.who[r].status + D.crew.who[r].busy).join() + D.crew.buttoned + D.crew.abandoned : ''],
  gps: D => [D.gunLine, D.rf ? Math.round(D.rf.R / 10) : '-', D.main, D.gpsMag, Math.round(D.turBrg * 2), D.gpsLive, D.loaded, Math.round(D.rel), D.warning && D.blink, D.tgt ? D.tgt.name + D.tgt.range : '', D.rf && D.wait > 1.2],
  citv: D => [Math.round(D.citvYaw * 2), D.citvMag, D.citvOn, D.citvTgt, D.citvLive, D.warning && D.blink, Math.round(D.rel), Math.round(D.hull), Math.round(D.turBrg), D.cdrLine],
  comp: D => [D.rf ? Math.round(D.rf.R / 10) : '-', D.main, D.loaded, Math.round(D.rel), D.solution, D.rf ? D.wait.toFixed(1) : '', D.fcs.join(), D.warning && D.blink],
  drv: D => [D.kmh, Math.round(D.hull), D.gear, Math.round(D.rpm / 50), Math.round(D.steer * 20), Math.round(D.rel), D.cautions.join(), D.warning && D.blink, D.alive],
  ldr: D => [D.main, D.loaded, D.loading, D.ldrUp, D.door > 0.5, D.armed, D.m240, D.m240State, D.warning && D.blink],
};
// draw one display if what it shows has changed; cv = { c: canvas, x: context, t: texture, key: last signature, opaque }
export function drawMfd(key, cv, D) {
  const sig = SIG[key](D).join('|'); if (cv.key === sig) return false; cv.key = sig;
  const x = cv.x, W = cv.c.width, H = cv.c.height; x.setTransform(1, 0, 0, 1, 0, 0); x.setLineDash([]);
  if (cv.opaque) { x.fillStyle = C.bg; x.fillRect(0, 0, W, H); } else x.clearRect(0, 0, W, H);
  DRAW[key](x, W, H, D); cv.t.needsUpdate = true; return true;
}
