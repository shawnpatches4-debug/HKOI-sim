// Enemy views: the picture drawn over the 3D scene when looking through an enemy weapon's sight (a reticle for each weapon),
// and the menu that picks which enemy team the "Enemy sight" and "Enemy close-up" cameras follow.
// Sight data (magnification and field of view) lives in render/cameras.js (ENEMY_SIGHTS) because the camera needs it too.
import { ENEMY_SIGHTS, SIGHT_RING } from '../render/cameras.js';

const NS = 'http://www.w3.org/2000/svg';
const MIL_PER_DEG = 6000 / 360;          // Soviet sights are graduated in 1/6000 of a circle
const $ = id => document.getElementById(id);

// What a team is doing, in plain words
export function unitDoing(u) {
  if (!u.alive) return 'destroyed';
  if (u.state === 'moving') return u.gait === 'run' ? 'running to a new position' : 'moving to a new position';
  if (u.down) return 'pinned down';
  if (u.state === 'setup') return 'setting up';
  if (u.state === 'guiding') return u.spec.indirect ? 'flying a drone' : 'guiding a missile';
  if (u.state === 'firing') return 'firing';
  if (u.state === 'spent' || u.ammo <= 0) return 'out of ammunition';
  return 'watching';
}

// PG-7V sight angle (mils above the line of sight) for a range in metres. APPROXIMATE: read off the general shape of the PGO-7
// range scale, not a firing table. Only used to draw the range lines and to put the right line on the target.
const RPG_DROP = [[100, 0], [200, 7], [300, 15], [400, 25], [500, 37]];
function rpgDrop(R) {
  const T = RPG_DROP; if (R <= T[0][0]) return T[0][1]; if (R >= T[T.length - 1][0]) return T[T.length - 1][1];
  for (let i = 1; i < T.length; i++) if (R <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + (b[1] - a[1]) * (R - a[0]) / (b[0] - a[0]); }
  return 0;
}

// Small SVG helpers. All reticles are drawn in a square 1000 units wide that exactly covers the round field of view,
// so "u" below (units per mil) makes every mark the true angular size for that sight.
function svgEl(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
const line = (g, x1, y1, x2, y2, w) => g.append(svgEl('line', { x1, y1, x2, y2, 'stroke-width': w || 2 }));
const label = (g, x, y, t, size, anchor) => g.append(svgEl('text', { x, y, 'font-size': size || 22, 'text-anchor': anchor || 'middle', stroke: 'none', fill: 'currentColor' }, t));

const RETICLES = {
  // Kornet: laser beam rider. Open cross, a small ring for the beam, mil ticks on the horizontal line.
  kornet(g, u) {
    line(g, -420, 0, -3 * u, 0); line(g, 3 * u, 0, 420, 0); line(g, 0, 3 * u, 0, 380); line(g, 0, -3 * u, 0, -8 * u);
    g.append(svgEl('circle', { cx: 0, cy: 0, r: 1.5 * u, fill: 'none', 'stroke-width': 2 }));
    for (let m = 5; m <= 30; m += 5) for (const s of [-1, 1]) { const h = m % 10 ? 8 : 16; line(g, s * m * u, -h, s * m * u, h); if (m % 10 === 0) label(g, s * m * u, -24, String(m / 10), 20); }
    for (let m = 5; m <= 25; m += 5) line(g, -10, m * u, 10, m * u);
  },
  // Konkurs: wire-guided. Full cross with ticks on both lines and stadia brackets for a 2.7 m target.
  saclos(g, u) {
    line(g, -440, 0, -1 * u, 0); line(g, 1 * u, 0, 440, 0); line(g, 0, -300, 0, -1 * u); line(g, 0, 1 * u, 0, 440);
    for (let m = 2; m <= 34; m += 2) for (const s of [-1, 1]) { const h = m % 10 === 0 ? 18 : 8; line(g, s * m * u, -h, s * m * u, h); line(g, -h, s * m * u, h, s * m * u); }
    for (const s of [-1, 1]) { label(g, s * 10 * u, 44, '10', 20); label(g, s * 20 * u, 44, '20', 20); label(g, s * 30 * u, 44, '30', 20); }
  },
  // RPG-7 optical sight: the grid. Horizontal lines are ranges in hundreds of metres, vertical lines are lead in steps of 10 mils,
  // and the curve at lower left is the rangefinder for a target 2.7 m high. The whole grid is shifted so the line for the real
  // range lies on the target, which is how the gunner holds it.
  rpg(g, u, R) {
    const shift = -rpgDrop(R || 300) * u, G = svgEl('g', { transform: `translate(0 ${shift.toFixed(1)})` }); g.append(G);
    const top = rpgDrop(200) * u, bot = rpgDrop(500) * u;
    for (let k = -5; k <= 5; k++) { line(G, k * 10 * u, top - 14, k * 10 * u, bot + 14, k ? 1.6 : 2.4); if (k) label(G, k * 10 * u, top - 24, String(Math.abs(k)), 20); }
    for (const r of [200, 300, 400, 500]) { const y = rpgDrop(r) * u; line(G, -52 * u, y, 52 * u, y, 2); label(G, -56 * u, y + 7, String(r / 100), 22, 'end'); label(G, 56 * u, y + 7, String(r / 100), 22, 'start'); }
    line(G, -12, -6 * u, 12, -6 * u, 2.4); line(G, 0, -6 * u - 12, 0, -6 * u + 12, 2.4);      /* the cross above the grid used to zero the sight */
    const x0 = -46 * u, y0 = bot + 34 * u, pts = [];                                          /* rangefinder */
    for (let r = 200; r <= 1000; r += 100) { const x = x0 + (r - 200) / 800 * 44 * u, y = y0 - 2700 / r * u; pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); if (r % 200 === 0) label(G, x, y0 + 26, String(r / 100), 18); line(G, x, y0, x, y0 - 5, 1.4); }
    G.append(svgEl('polyline', { points: pts.join(' '), fill: 'none', 'stroke-width': 2 })); line(G, x0, y0, x0 + 44 * u, y0, 2); label(G, x0 + 22 * u, y0 - 15 * u, '2,7', 18);
  },
  // Laser designator: gapped cross, a small aiming box, mil ticks.
  sal(g, u) {
    line(g, -400, 0, -4 * u, 0); line(g, 4 * u, 0, 400, 0); line(g, 0, -400, 0, -4 * u); line(g, 0, 4 * u, 0, 400);
    g.append(svgEl('rect', { x: -1.5 * u, y: -1.5 * u, width: 3 * u, height: 3 * u, fill: 'none', 'stroke-width': 2 }));
    for (let m = 10; m <= 40; m += 10) for (const s of [-1, 1]) { line(g, s * m * u, -12, s * m * u, 12); line(g, -12, s * m * u, 12, s * m * u); }
  },
  // FPV crews have no weapon sight: an observer's binocular scale.
  fpv(g, u) {
    line(g, -40 * u, 0, 40 * u, 0, 1.6); line(g, 0, -14, 0, 14);
    for (let m = 5; m <= 40; m += 5) for (const s of [-1, 1]) { const h = m % 10 ? 10 : 20; line(g, s * m * u, -h, s * m * u, 0); if (m % 10 === 0) label(g, s * m * u, -28, String(m / 10), 20); }
    for (let m = 5; m <= 20; m += 5) line(g, -8, -m * u, 8, -m * u);
  },
};
RETICLES.fpv_fiber = RETICLES.fpv;

export class EnemyViews {
  // onPick(unit) is called when a team is chosen in the menu
  constructor(onPick) { this.onPick = onPick; this.sig = ''; this.retSig = ''; this.menuSig = ''; this.t = 0; this.los = true; this.svg = $('esight-ret'); }

  // Called every frame. o: { sightOn, menuOn, cams, battle, tank: {e,n}, world, dt }
  update(o) {
    const sg = $('esight'), mn = $('units');
    if (sg.hidden === o.sightOn) sg.hidden = !o.sightOn;
    if (mn.hidden === o.menuOn) mn.hidden = !o.menuOn;
    if (!o.sightOn && !o.menuOn) return;
    const u = o.cams.unit, T = o.tank;
    this.t -= o.dt; const slow = this.t <= 0; if (slow) this.t = 0.25;        /* text and sight-line checks four times a second are plenty */
    if (o.sightOn && u) {
      const R = Math.hypot(T.e - u.e, T.n - u.n), up = o.cams.sightUp, key = u.spec.key, S = ENEMY_SIGHTS[key] || ENEMY_SIGHTS.fpv;
      if (sg.classList.contains('eye') === up) sg.classList.toggle('eye', !up);     /* on the move nobody is at the sight: plain view, no ring */
      // the reticle is redrawn only when the weapon changes (or, for the RPG grid, when the range changes by 10 m)
      const rs = up ? key + (key === 'rpg' ? ':' + Math.round(R / 10) : '') : 'none';
      if (rs !== this.retSig) { this.retSig = rs; this.svg.textContent = ''; if (up) { const g = svgEl('g', { stroke: 'currentColor', 'stroke-linecap': 'butt' }); (RETICLES[key] || RETICLES.fpv)(g, 1000 / (S.fov * MIL_PER_DEG), R); this.svg.append(g); } }
      if (slow) {
        this.los = o.world.los(u.e, u.n, u.spec.agl, T.e, T.n, 2.2).clear;
        const top = up ? `${S.name}   ${S.mag}×   field ${S.fov}°` : 'NOT AT THE SIGHT';
        const txt = `${u.spec.name.toUpperCase()} #${u.id + 1}   RNG ${String(Math.round(R / 10) * 10).padStart(4, '0')} m   ${u.spec.indirect ? 'DRONES' : 'ROUNDS'} ${u.ammo}\n${(o.battle.intentOf ? o.battle.intentOf(u) : unitDoing(u)).toUpperCase()}${up ? (this.los ? '' : '   ·   NO LINE OF SIGHT TO THE VEHICLE') : ''}`;
        if ($('esight-sym').textContent !== top) $('esight-sym').textContent = top;
        if ($('esight-data').textContent !== txt) $('esight-data').textContent = txt;
      }
    }
    if (o.menuOn && slow) this.menu(o, u);
  }

  menu(o, cur) {
    const T = o.tank, rows = o.battle.units.map(u => ({ u, name: `${u.spec.name} #${u.id + 1}`, sub: u.alive ? `${o.battle.intentOf ? o.battle.intentOf(u) : unitDoing(u)} · ${Math.round(Math.hypot(T.e - u.e, T.n - u.n) / 10) * 10} m` : 'destroyed' }));
    const sig = rows.map(r => r.name + r.sub + (r.u === cur ? '*' : '')).join('|'); if (sig === this.menuSig) return; this.menuSig = sig;
    const box = $('units-list'); box.textContent = '';
    for (const r of rows) {
      const b = document.createElement('button'); b.className = 'btn urow' + (r.u === cur ? ' on' : ''); b.disabled = !r.u.alive;
      const n = document.createElement('b'); n.textContent = r.name; const s = document.createElement('small'); s.textContent = r.sub; b.append(n, s);
      b.onclick = () => { this.onPick(r.u); this.menuSig = ''; }; box.append(b);
    }
  }
}

