// The shapes of the M1A2 interior: turret fighting compartment (gunner, commander, loader), the ammunition bustle, the turret
// basket, the hull tub and the driver's station. Laid out after the old simulator's cabin (src/cab.js) and public photographs and
// cutaway drawings; controls and placards are representative, not copied from any manual.
//
// Frame used while building (the same as the old cabin): metres, origin at the centre of the turret ring, x to the vehicle's RIGHT,
// y up, and the gun pointing along -z. The two groups this returns are turned half a circle when hung on the vehicle model, whose
// own frame has x to the left and z forward.
//
// ASSUMPTIONS: heights are fitted to the supplied outside model (its turret roof is 0.60 m above the turning point and its
// cupola 0.91 m), not to drawings of the real vehicle. The HKOI control panel is the owner's own system: its place (right wall, at the
// commander's right hand) and its layout are invented here.
import * as THREE from 'three';
import { Kit, K, part } from './interior_parts.js';

export const DIM = {
  FL: -0.98,      // turret basket floor
  HF: -1.07,      // hull floor
  HR: -0.07,      // underside of the hull roof (the turret ring sits in it)
  RF: 0.54,       // underside of the turret roof
  RFF: 0.43,      // the same at the front wall (the roof slopes down toward the gun)
  GY: 0.20,       // height of the gun's axis
  CUP: [0.52, 0.36], CUPR: 0.40,     // commander's cupola: centre (x, z) and inner radius
  HAT: [-0.60, 0.15], HATR: 0.33,    // loader's hatch
  BZ: 1.0,        // the bustle bulkhead (blast doors) is at this z
  DZ: -2.75,      // the driver sits here
  DRF: -0.22,     // underside of the hull roof over the driver
};

const P = K.PAINT, M = K.METAL;
export const COL = {
  cream: [0xc6cdbd, P], creamD: [0xa7b1a0, P], hull: [0xcfcdbb, P], black: [0x1b1c1e, M], blackP: [0x232527, P], rubber: [0x111111, K.RUBBER],
  olive: [0x4f5640, P], oliveD: [0x3b4232, P], steel: [0x8b8f8d, M], gunm: [0x3c3f40, M], red: [0xb3160f, P], yellow: [0xd8ab2c, P],
  brass: [0xb8913e, M], floor: [0x9c9a92, K.TREAD], cloth: [0x25261f, K.CLOTH], tan: [0x6b6247, K.CLOTH], case: [0x2c2d29, P], glass: [0x06090a, M], white: [0xe8e8e2, P],
};

// names of the indicator lights (the number is the slot in the shader's list)
export const IND = {};
let nInd = 0; const ind = name => (IND[name] != null ? IND[name] : (IND[name] = nInd++));

export function buildInterior(labels) {
  nInd = 0; for (const k of Object.keys(IND)) delete IND[k];
  const D = DIM, C = COL, T = new Kit(labels), H = new Kit(labels), controls = [], screens = [], moving = {};
  const { FL, HF, HR, RF, RFF, GY, BZ, DZ, DRF } = D, [CX, CZ] = D.CUP, [HX, HZ] = D.HAT;

  // a control the viewer can click: placed in the current frame of kit k at (u, v) on the panel face
  const ctl = (k, g, type, u, v, name, o = {}) => {
    const c = { g, type, pos: k.at(u, v, 0.003), quat: k.quat(), name, n: o.n || 2, state: o.state || 0, locked: !!o.locked, key: o.key || null, lamp: o.lamp != null ? o.lamp : null, r: o.r || 0.024, big: o.big || 1 };
    controls.push(c);
    if (o.label) k.label(o.label, o.lh || 0.016, u, v + (o.above ? 0.03 : -0.03) * c.big, 0.0015, 0, 0, 0, o.style || 'panel', { size: 26 });
    if (type === 'button' && o.lampHex) { c.lamp = ind(o.key || name); k.lamp(c.lamp, 0.016, 0.006, o.lampHex, u, v + 0.014, 0.002); }
    return c;
  };
  // a display: the glass is its own mesh (made by the caller); here only the bezel and where it goes
  const screen = (k, g, key, w, h, u, v) => {
    k.box('fit', w + 0.022, h + 0.022, 0.012, C.black, u, v, -0.004); k.box('fit', w + 0.004, h + 0.004, 0.004, C.glass, u, v, 0.0015);
    screens.push({ g, key, w, h, pos: k.at(u, v, 0.0045), quat: k.quat() });
  };
  // a console: a box whose face is the working plane z = 0 of the frame that fn draws in
  const console_ = (k, x, y, z, rx, ry, w, h, d, col, fn) => { k.push(x, y, z, rx, ry, 0); k.box('fit', w, h, d, col, 0, 0, -d / 2 - 0.0005); k.box('fit', w - 0.012, h - 0.012, 0.002, C.blackP, 0, 0, 0); fn(); k.pop(); };
  const wall = (k, b, a0, a1, y0, y1, col) => { const L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]); k.plane(b, L, y1 - y0, col, (a0[0] + a1[0]) / 2, (y0 + y1) / 2, (a0[1] + a1[1]) / 2, 0, -Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), 0); };
  // an intercom box: two knobs and a talk lamp
  const intercom = (k, g, x, y, z, ry, who) => console_(k, x, y, z, 0, ry, 0.15, 0.10, 0.05, C.olive, () => {
    k.label('INTERCOM', 0.014, -0.03, 0.036, 0.0015, 0, 0, 0, 'panel', { size: 24 });
    ctl(k, g, 'knob', -0.045, -0.004, `${who} intercom volume`, { n: 5, state: 3, key: 'icomVol', label: 'VOL', lh: 0.012 });
    ctl(k, g, 'knob', 0.005, -0.004, `${who} intercom channel (the crew stays on the vehicle net)`, { n: 4, state: 1, locked: true, label: 'CHAN', lh: 0.012 });
    k.lamp(ind('icom' + who), 0.012, 0.012, 0x30ff60, 0.052, 0.012, 0.002, 0, 0, 0, true);
  });
  // a dome lamp on the roof with its switch
  const dome = (k, g, x, y, z, name) => { k.box('fit', 0.17, 0.035, 0.11, C.creamD, x, y - 0.018, z); k.lamp(ind(name + 'w'), 0.062, 0.07, 0xfff1d6, x - 0.034, y - 0.037, z, Math.PI / 2); k.lamp(ind(name + 'r'), 0.03, 0.07, 0xff2a1a, x + 0.016, y - 0.037, z, Math.PI / 2); k.lamp(ind(name + 'b'), 0.03, 0.07, 0x30e0c0, x + 0.05, y - 0.037, z, Math.PI / 2); k.push(x + 0.115, y - 0.02, z, Math.PI / 2, 0, 0); ctl(k, g, 'knob', 0, 0, 'Dome lamp: off, white, red, blue-green', { n: 4, key: 'dome', state: 0 }); k.pop(); };

  // ================================================================ TURRET
  // ---- shell: walls, sloped front roof, flat roof with the two hatch openings, the bustle
  const plan = [[-0.92, -1.35], [0.92, -1.35], [1.2, -0.75], [1.2, BZ], [-1.2, BZ], [-1.2, -0.75]];
  wall(T, 'shell', plan[0], plan[1], HR, RFF, C.cream);
  for (const i of [1, 5]) { const a = plan[i], b = plan[(i + 1) % 6]; wall(T, 'shell', a, b, HR, RF, C.cream); }
  for (const i of [2, 4]) { const a = plan[i], b = plan[(i + 1) % 6]; wall(T, 'shell', a, b, HR, RF, C.cream); }
  { // the roof: flat behind z = -0.6 with the hatch holes, sloping down to the front wall ahead of that
    const rs = new THREE.Shape([[-1.2, -0.6], [1.2, -0.6], [1.2, BZ], [-1.2, BZ]].map(p => new THREE.Vector2(p[0], -p[1])));
    for (const [hx, hz, hr] of [[CX, CZ, D.CUPR + 0.02], [HX, HZ, D.HATR]]) { const h = new THREE.Path(); h.absarc(hx, -hz, hr, 0, Math.PI * 2, true); rs.holes.push(h); }
    T.geo('shell', new THREE.ShapeGeometry(rs, 20), C.cream, 0, RF, 0, -Math.PI / 2, 0, 0);
    const L = Math.hypot(0.75, RF - RFF); T.plane('shell', 2.4, L, C.cream, 0, (RF + RFF) / 2, -0.975, Math.PI / 2 - Math.atan2(RF - RFF, 0.75), 0, 0);
  }
  // bustle box behind the bulkhead: floor, back, sides, roof
  T.plane('shell', 2.4, 1.1, C.creamD, 0, 0.0, BZ + 0.55, -Math.PI / 2); T.plane('shell', 2.4, 1.1, C.creamD, 0, RF, BZ + 0.55, Math.PI / 2);
  T.plane('shell', 2.4, RF, C.creamD, 0, RF / 2, BZ + 1.1, 0, Math.PI, 0); for (const s of [-1, 1]) T.plane('shell', 1.1, RF, C.creamD, s * 1.2, RF / 2, BZ + 0.55, 0, -s * Math.PI / 2, 0);
  // weld seams and stiffeners on walls and roof
  for (const z of [-0.45, 0.25, 0.8]) for (const s of [-1, 1]) T.box('fit', 0.014, RF - HR, 0.028, C.creamD, s * 1.193, (RF + HR) / 2, z);
  for (const x of [-0.95, -0.2, 0.05, 1.0]) T.box('fit', 0.03, 0.02, 1.5, C.creamD, x, RF - 0.011, 0.22);
  // the ring the turret turns on, and the basket below it
  T.ring('fit', 1.09, 0.03, C.creamD, 0, HR + 0.02, 0, Math.PI / 2, 0, 0, 48); T.ring('fit', 1.06, 0.018, C.steel, 0, HR - 0.03, 0, Math.PI / 2, 0, 0, 48);
  T.cyl('fit', 1.0, 1.0, 0.025, C.floor, 0, FL - 0.012, 0, 0, 0, 0, 40); T.cyl('fit', 1.0, 1.0, 0.05, C.creamD, 0, FL - 0.05, 0, 0, 0, 0, 40, true);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.4 && Math.cos(a) > 0) continue; T.box('fit', 0.035, HR - FL, 0.035, C.creamD, Math.sin(a) * 1.0, (FL + HR) / 2, -Math.cos(a) * 1.0, 0, -a, 0); }
  for (const y of [FL + 0.3, FL + 0.6]) T.ring('fit', 1.0, 0.012, C.creamD, 0, y, 0, Math.PI / 2, 0, 0, 40, Math.PI * 1.55);
  T.cyl('fit', 0.13, 0.15, 0.16, C.gunm, 0, FL + 0.08, -0.25, 0, 0, 0, 16); T.label('SLIP RING\nNO STEP', 0.05, 0, FL + 0.165, -0.25, -Math.PI / 2, 0, 0, 'warn');

  // ---- main gun: mount, cradle and recoil cylinders (fixed), breech (slides back on firing), recoil guard, case catcher, coax
  T.box('fit', 1.0, 0.5, 0.26, C.gunm, 0, GY, -1.24); for (const s of [-1, 1]) T.box('fit', 0.12, 0.6, 0.4, C.creamD, s * 0.5, GY, -1.2);
  T.cyl('fit', 0.23, 0.23, 0.36, C.gunm, 0, GY, -0.98, Math.PI / 2, 0, 0, 18);
  for (const s of [-1, 1]) for (const t of [-1, 1]) T.cyl('fit', 0.05, 0.05, 0.62, C.steel, s * 0.19, GY + t * 0.24, -0.95, Math.PI / 2, 0, 0, 10);
  const GW = 0.36;   // half width of the recoil guard
  for (const s of [-1, 1]) { T.box('fit', 0.02, 0.5, 1.26, C.blackP, s * GW, GY - 0.13, 0.16); for (let i = 0; i < 4; i++) T.box('fit', 0.024, 0.03, 1.26, C.black, s * GW, GY - 0.36 + i * 0.155, 0.16); }
  T.box('fit', GW * 2, 0.02, 1.26, C.blackP, 0, GY - 0.38, 0.16); T.box('fit', GW * 2, 0.36, 0.02, C.blackP, 0, GY - 0.2, 0.79);
  T.geo('fit', new THREE.CylinderGeometry(GW, GW, 0.5, 14, 1, true, 0, Math.PI), C.blackP, 0, GY - 0.13, 0.79, 0, Math.PI / 2, 0, 1, 1, 0.3);
  T.label('CAUTION\nRECOIL PATH', 0.07, 0, GY - 0.12, 0.777, 0, Math.PI, 0, 'warn'); T.label('KEEP CLEAR OF BREECH', 0.035, -GW - 0.013, GY - 0.02, 0.2, 0, -Math.PI / 2, 0, 'warn'); T.label('KEEP CLEAR OF BREECH', 0.035, GW + 0.013, GY - 0.02, 0.3, 0, Math.PI / 2, 0, 'warn');
  T.ball('fit', 0.16, C.tan, 0, GY - 0.47, 0.45, 1.5, 0.5, 1.6);   /* the bag that catches the base caps of fired rounds */
  T.box('fit', 0.11, 0.13, 0.7, C.black, 0.47, GY + 0.04, -1.0); T.box('fit', 0.2, 0.2, 0.3, C.olive, 0.52, GY - 0.3, -1.08); T.tube('fit', [[0.52, GY - 0.2, -1.05], [0.5, GY - 0.08, -0.98], [0.47, GY - 0.02, -0.92]], 0.028, C.black);
  T.label('COAX 7.62', 0.022, 0.52, GY - 0.3, -0.928, 0, 0, 0, 'plate');
  // the breech: ring, sliding block, chamber mouth, operating handle. Its own part so that it can recoil.
  moving.breech = { g: 'tur', build: k => {
    k.box('p', 0.5, 0.46, 0.4, C.steel, 0, 0, -0.2); k.cyl('p', 0.17, 0.17, 0.3, C.gunm, 0, 0, -0.5, Math.PI / 2, 0, 0, 16); k.cyl('p', 0.21, 0.21, 0.05, C.gunm, 0, 0, 0.0, Math.PI / 2, 0, 0, 18);
    k.cyl('p', 0.066, 0.066, 0.012, C.glass, 0, 0.0, 0.03, Math.PI / 2, 0, 0, 16); k.box('p', 0.06, 0.2, 0.04, C.red, 0.28, 0.02, -0.1, 0, 0, -0.45); k.cyl('p', 0.022, 0.022, 0.09, C.red, 0.34, 0.11, -0.1, Math.PI / 2, 0, 0, 8);
    k.box('p', 0.16, 0.09, 0.12, C.olive, -0.2, 0.275, -0.2); k.label('FIRING CIRCUIT', 0.018, -0.2, 0.275, -0.138, 0, 0, 0, 'plate'); }, pos: [0, GY, -0.42] };
  moving.block = { g: 'tur', parent: 'breech', build: k => { k.box('p', 0.25, 0.32, 0.045, C.gunm, 0, 0, 0); k.box('p', 0.21, 0.03, 0.05, C.steel, 0, 0.13, 0.003); }, pos: [0, 0, 0.045] };
  // loader's safe / armed handle on the guard
  T.push(-GW - 0.012, GY + 0.16, 0.36, 0, -Math.PI / 2, 0); T.box('fit', 0.2, 0.09, 0.03, C.olive, 0, 0, -0.016); T.label('SAFE', 0.016, -0.06, 0.028, 0.0015, 0, 0, 0, 'panel'); T.label('ARMED', 0.016, 0.055, 0.028, 0.0015, 0, 0, 0, 'danger');
  T.lamp(ind('ldrSafe'), 0.014, 0.014, 0x30ff60, -0.06, 0.004, 0.002, 0, 0, 0, true); T.lamp(ind('ldrArmed'), 0.014, 0.014, 0xff3020, 0.055, 0.004, 0.002, 0, 0, 0, true);
  moving.armLever = { g: 'tur', build: k => { k.cyl('p', 0.008, 0.008, 0.09, C.steel, 0, 0.045, 0, 0, 0, 0, 8); k.ball('p', 0.016, C.red, 0, 0.095, 0); }, pos: T.at(0, -0.03, 0.012).toArray(), quat: T.quat() };
  T.pop();

  // ---- gunner's station (right of the gun, forward)
  const gx = 0.66;
  // primary sight housing with the eyepiece display, its hood and brow pad
  T.box('fit', 0.42, 0.44, 0.4, C.cream, gx, 0.2, -1.1); T.box('fit', 0.36, 0.36, 0.07, C.creamD, gx, 0.24, -0.875);
  T.push(gx, 0.19, -0.838); screen(T, 'tur', 'gps', 0.2, 0.125, 0, 0);
  for (const s of [-1, 1]) T.box('fit', 0.008, 0.15, 0.07, C.rubber, s * 0.112, 0, 0.035); T.box('fit', 0.232, 0.008, 0.07, C.rubber, 0, 0.079, 0.035); T.box('fit', 0.232, 0.008, 0.045, C.rubber, 0, -0.079, 0.022);
  T.geo('fit', new THREE.TorusGeometry(0.075, 0.022, 6, 14, Math.PI), C.rubber, 0, 0.085, 0.06);
  T.label('GUNNER\'S PRIMARY SIGHT', 0.02, 0, 0.2, -0.0005, 0, 0, 0, 'plate'); T.lamp(ind('gnrWarn'), 0.07, 0.022, 0xff2a1a, -0.105, 0.125, -0.0005); T.label('MISSILE', 0.012, -0.105, 0.148, -0.0005, 0, 0, 0, 'danger', { size: 22 });
  T.lamp(ind('gunReady'), 0.045, 0.02, 0x30ff60, 0.125, 0.125, -0.0005); T.label('READY', 0.012, 0.125, 0.148, -0.0005, 0, 0, 0, 'panel', { size: 22 });
  T.pop();
  // the panel under the sight: ammunition select and sight switches
  console_(T, gx, -0.01, -0.86, -0.5, 0, 0.42, 0.13, 0.06, C.olive, () => {
    const am = ['SABOT', 'HEAT', 'MPAT', 'CAN']; am.forEach((a, i) => { const u = -0.165 + i * 0.05; T.box('fit', 0.036, 0.022, 0.006, C.black, u, 0.018, 0.003); T.lamp(ind('ammo' + i), 0.03, 0.008, 0xffb020, u, 0.04, 0.002); T.label(a, 0.011, u, 0.052, 0.0015, 0, 0, 0, 'panel', { size: 22 });
      ctl(T, 'tur', 'button', u, 0.018, `Ammunition select ${a} (the gunner sets this: the crew is firing multi-purpose rounds)`, { locked: true }); });
    T.label('AMMUNITION SELECT', 0.011, -0.09, -0.008, 0.0015, 0, 0, 0, 'panel', { size: 22 });
    ctl(T, 'tur', 'toggle', 0.06, 0.02, 'Picture polarity of the gunner\'s display: light and dark swapped', { key: 'gpsPol', label: 'POLARITY', lh: 0.011 });
    ctl(T, 'tur', 'knob', 0.115, 0.02, 'Gunner\'s display brightness', { n: 4, state: 2, key: 'gpsBrt', label: 'BRT', lh: 0.011 });
    ctl(T, 'tur', 'toggle', 0.168, 0.02, 'Laser rangefinder arm (the gunner arms and fires the laser himself)', { locked: true, state: 1, label: 'LASER', lh: 0.011 });
    T.lamp(ind('laser'), 0.012, 0.012, 0xffb020, 0.168, 0.048, 0.002, 0, 0, 0, true);
    ctl(T, 'tur', 'toggle', -0.165, -0.035, 'Gun select: main gun or coax (the gunner sets this)', { locked: true, label: 'MAIN / COAX', lh: 0.011 });
    ctl(T, 'tur', 'toggle', -0.085, -0.035, 'Fire control mode: normal, emergency or manual (the crew stays in normal)', { locked: true, label: 'FC MODE', lh: 0.011 });
    ctl(T, 'tur', 'toggle', 0.0, -0.035, 'Sight magnification 3x or 10x (the gunner changes it as he lays)', { locked: true, label: 'MAG 3X / 10X', lh: 0.011 });
    ctl(T, 'tur', 'button', 0.09, -0.035, 'Lamp test: lights every indicator for a moment', { key: 'lampTest', label: 'LAMP TEST', lh: 0.011 });
  });
  // the control handles ("Cadillacs") on their pedestal
  T.box('fit', 0.16, 0.5, 0.16, C.creamD, gx, -0.6, -0.98); T.box('fit', 0.2, 0.1, 0.2, C.olive, gx, -0.32, -0.95); T.label('GUNNER\'S CONTROL HANDLES', 0.014, gx, -0.3, -0.848, 0, 0, 0, 'plate', { size: 22 });
  moving.yoke = { g: 'tur', build: k => { k.box('p', 0.3, 0.045, 0.08, C.black, 0, 0, 0); k.cyl('p', 0.035, 0.035, 0.12, C.steel, 0, -0.05, -0.06, 0.5, 0, 0, 10);
    for (const s of [-1, 1]) { k.cyl('p', 0.026, 0.03, 0.15, C.rubber, s * 0.155, 0.055, 0.0, 0, 0, s * -0.3, 10); k.box('p', 0.02, 0.022, 0.03, C.red, s * 0.18, 0.135, -0.012); k.box('p', 0.012, 0.05, 0.012, C.steel, s * 0.14, 0.06, -0.03); } }, pos: [gx, -0.25, -0.74] };
  // auxiliary sight, a plain telescope beside the gun
  T.cyl('fit', 0.036, 0.036, 0.5, C.black, gx - 0.25, GY + 0.1, -1.08, Math.PI / 2, 0, 0, 10); T.ring('fit', 0.036, 0.012, C.rubber, gx - 0.25, GY + 0.1, -0.83, 0, 0, 0, 12); T.label('AUX SIGHT', 0.013, gx - 0.25, GY + 0.16, -0.9, 0, 0, 0, 'plate', { size: 22 });
  // ballistic computer panel on the right wall, turned toward the gunner
  console_(T, 1.07, 0.06, -0.72, -0.1, -1.05, 0.3, 0.26, 0.09, C.olive, () => {
    T.label('COMPUTER CONTROL PANEL', 0.016, 0, 0.112, 0.0015, 0, 0, 0, 'panel'); screen(T, 'tur', 'comp', 0.2, 0.09, -0.03, 0.045);
    for (let i = 0; i < 12; i++) T.box('fit', 0.024, 0.02, 0.006, C.black, -0.115 + (i % 6) * 0.034, -0.045 - Math.floor(i / 6) * 0.032, 0.003);
    ['RNG', 'AMMO', 'WIND', 'CANT', 'LEAD', 'TEST', '1', '2', '3', '4', '5', 'ENT'].forEach((s, i) => T.label(s, 0.008, -0.115 + (i % 6) * 0.034, -0.045 - Math.floor(i / 6) * 0.032, 0.0065, 0, 0, 0, 'panel', { size: 20 }));
    ctl(T, 'tur', 'knob', 0.115, 0.05, 'Computer display brightness', { n: 4, state: 2, key: 'compBrt', label: 'BRT', lh: 0.011 });
    ctl(T, 'tur', 'toggle', 0.115, -0.045, 'Computer power (left on: the crew needs the ballistic solution)', { locked: true, state: 1, label: 'PWR', lh: 0.011 });
  });
  intercom(T, 'tur', 1.172, 0.36, -0.45, -Math.PI / 2, 'Gunner');
  // gunner's seat, footrest and chest rest
  T.box('fit', 0.4, 0.06, 0.36, C.cloth, gx, -0.62, -0.58); T.box('fit', 0.4, 0.44, 0.06, C.cloth, gx, -0.36, -0.38, -0.12); T.cyl('fit', 0.04, 0.04, 0.33, C.steel, gx, -0.81, -0.55, 0, 0, 0, 10); T.box('fit', 0.3, 0.02, 0.2, C.floor, gx, -0.9, -0.98, 0.3);
  T.label('GUNNER', 0.03, 1.19, 0.44, -0.3, 0, -Math.PI / 2, 0, 'stencil');

  // ---- commander's station (right, behind and above the gunner)
  T.box('fit', 0.42, 0.06, 0.4, C.cloth, CX, -0.36, CZ + 0.16); T.box('fit', 0.42, 0.46, 0.06, C.cloth, CX, -0.1, CZ + 0.4, 0.12); T.cyl('fit', 0.045, 0.045, 0.6, C.steel, CX, -0.68, CZ + 0.18, 0, 0, 0, 10); T.box('fit', 0.36, 0.025, 0.26, C.floor, CX + 0.02, -0.78, CZ - 0.2);
  // commander's display unit: the picture from his independent viewer
  console_(T, 0.6, 0.12, -0.22, -0.4, 0.06, 0.32, 0.25, 0.14, C.olive, () => {
    screen(T, 'tur', 'citv', 0.22, 0.14, -0.02, 0.022); T.label('COMMANDER\'S DISPLAY', 0.014, -0.02, 0.108, 0.0015, 0, 0, 0, 'panel');
    for (let i = 0; i < 6; i++) T.box('fit', 0.026, 0.016, 0.006, C.black, -0.115 + i * 0.038, -0.075, 0.003); ['SCAN', 'DESIG', 'MAG', 'MAP', 'NAV', 'MENU'].forEach((s, i) => T.label(s, 0.008, -0.115 + i * 0.038, -0.095, 0.0015, 0, 0, 0, 'panel', { size: 20 }));
    ctl(T, 'tur', 'button', -0.115, -0.075, 'Viewer scan (the commander\'s viewer sweeps by itself and stops on what it finds)', { locked: true });
    ctl(T, 'tur', 'button', -0.077, -0.075, 'Designate: hand the target to the gunner (the commander does this himself)', { locked: true });
    ctl(T, 'tur', 'toggle', 0.128, 0.06, 'Picture polarity of the commander\'s display', { key: 'citvPol', label: 'POL', lh: 0.011 });
    ctl(T, 'tur', 'knob', 0.128, -0.01, 'Commander\'s display brightness', { n: 4, state: 2, key: 'citvBrt', label: 'BRT', lh: 0.011 });
    T.lamp(ind('cdrWarn'), 0.05, 0.02, 0xff2a1a, 0.11, 0.108, 0.002);
  });
  // extension of the gunner's sight: an eyepiece the commander can lean to
  T.cyl('fit', 0.034, 0.034, 0.56, C.cream, 0.93, 0.3, -0.6, Math.PI / 2 - 0.08, 0, 0, 10); T.ring('fit', 0.034, 0.014, C.rubber, 0.93, 0.278, -0.325, 0, 0, 0, 12); T.label('SIGHT EXTENSION', 0.013, 0.93, 0.35, -0.45, -0.2, 0, 0, 'plate', { size: 22 });
  // ---- the HKOI control panel: the 30 mm station's display, state lights and switches, on the right wall at the commander's hand
  console_(T, 1.085, 0.12, 0.08, -0.32, -1.12, 0.46, 0.36, 0.1, C.oliveD, () => {
    T.label('HKOI  30 MM STATION', 0.024, -0.075, 0.158, 0.0015, 0, 0, 0, 'cyan', { size: 34 }); screen(T, 'tur', 'hkoi', 0.27, 0.17, -0.075, 0.045);
    [['hkRadar', 'RADAR', 0xffb020], ['hkTrack', 'TRACK', 0x30ff60], ['hkFire', 'FIRE', 0xff2a1a], ['hkArmed', 'ARMED', 0x30ff60]].forEach(([id, s, hex], i) => { const v = 0.115 - i * 0.045; T.lamp(ind(id), 0.05, 0.022, hex, 0.135, v, 0.002); T.label(s, 0.012, 0.19, v, 0.0015, 0, 0, 0, 'panel', { size: 22 }); });
    ctl(T, 'tur', 'toggle', -0.19, -0.085, 'HKOI master arm (the system is armed for the mission; the crew does not safe it in contact)', { locked: true, state: 1, label: 'MASTER ARM', lh: 0.012 });
    ctl(T, 'tur', 'knob', -0.115, -0.085, 'HKOI mode: safe, commander\'s consent, automatic (set to automatic for the mission)', { n: 3, state: 2, locked: true, label: 'SAFE-SEMI-AUTO', lh: 0.012 });
    ctl(T, 'tur', 'toggle', -0.04, -0.085, 'HKOI radar: silent until a warning, or always on (the system decides: it stays silent to hide)', { locked: true, label: 'RADAR SIL / ON', lh: 0.012 });
    ctl(T, 'tur', 'button', 0.035, -0.085, 'HKOI display page: status, threats, rounds', { key: 'hkPage', label: 'PAGE', lh: 0.012 });
    ctl(T, 'tur', 'knob', 0.105, -0.085, 'HKOI display brightness', { n: 4, state: 2, key: 'hkBrt', label: 'BRT', lh: 0.012 });
    ctl(T, 'tur', 'toggle', 0.175, -0.085, 'HKOI warning tone in the headsets: on or off', { state: 1, key: 'hkTone', label: 'TONE', lh: 0.012 });
    T.label('OBSCURANT / HE AIRBURST  ·  FIRES WITHOUT CREW ACTION IN AUTO', 0.012, -0.01, -0.148, 0.0015, 0, 0, 0, 'warn', { size: 22 });
  });
  // commander's control handle (he can take the turret from the gunner) and his switch panel
  T.box('fit', 0.1, 0.34, 0.1, C.creamD, 0.9, -0.3, -0.12); T.box('fit', 0.13, 0.07, 0.15, C.black, 0.9, -0.1, -0.12); T.label('OVERRIDE', 0.014, 0.9, -0.062, -0.07, -Math.PI / 2, 0, 0, 'plate', { size: 22 });
  moving.override = { g: 'tur', build: k => { k.cyl('p', 0.024, 0.028, 0.16, C.rubber, 0, 0.08, 0, 0, 0, 0, 10); k.box('p', 0.02, 0.02, 0.03, C.red, 0, 0.165, -0.012); k.box('p', 0.012, 0.05, 0.012, C.steel, 0, 0.08, -0.03); }, pos: [0.9, -0.065, -0.14] };
  console_(T, 1.172, 0.22, 0.66, 0, -Math.PI / 2, 0.36, 0.2, 0.05, C.olive, () => {
    T.label('COMMANDER\'S PANEL', 0.014, -0.05, 0.082, 0.0015, 0, 0, 0, 'panel');
    ctl(T, 'tur', 'toggle', -0.14, 0.02, 'Turret power (on for the whole mission)', { locked: true, state: 1, label: 'TURRET PWR', lh: 0.011 }); T.lamp(ind('turPwr'), 0.012, 0.012, 0x30ff60, -0.14, 0.05, 0.002, 0, 0, 0, true);
    ctl(T, 'tur', 'toggle', -0.07, 0.02, 'Smoke grenades, left bank (the commander fires them; guarded)', { locked: true, label: 'SMOKE L', lh: 0.011 }); T.lamp(ind('smkL'), 0.012, 0.012, 0x30ff60, -0.07, 0.05, 0.002, 0, 0, 0, true);
    ctl(T, 'tur', 'toggle', 0.0, 0.02, 'Smoke grenades, right bank (the commander fires them; guarded)', { locked: true, label: 'SMOKE R', lh: 0.011 }); T.lamp(ind('smkR'), 0.012, 0.012, 0x30ff60, 0.0, 0.05, 0.002, 0, 0, 0, true);
    T.label('TROPHY', 0.012, 0.105, 0.05, 0.0015, 0, 0, 0, 'panel', { size: 22 }); T.lamp(ind('apsL'), 0.03, 0.016, 0x30ff60, 0.085, 0.022, 0.002); T.lamp(ind('apsR'), 0.03, 0.016, 0x30ff60, 0.125, 0.022, 0.002); T.label('L        R', 0.01, 0.105, 0.002, 0.0015, 0, 0, 0, 'panel', { size: 20 });
    ctl(T, 'tur', 'knob', -0.14, -0.055, 'Panel legend lighting', { n: 4, state: 1, key: 'backlight', label: 'PANEL LTS', lh: 0.011 });
    ctl(T, 'tur', 'toggle', -0.05, -0.055, 'Trophy active protection (armed for the mission)', { locked: true, state: 1, label: 'APS ARM', lh: 0.011 });
    ctl(T, 'tur', 'toggle', 0.04, -0.055, 'Vision block heaters: clears mist from the glass', { key: 'heater', label: 'VB HEAT', lh: 0.011 });
  });
  intercom(T, 'tur', 1.172, 0.4, 0.3, -Math.PI / 2, 'Commander');
  T.label('CDR', 0.03, 1.19, 0.47, 0.62, 0, -Math.PI / 2, 0, 'stencil');
  // the cupola: a ring of eight vision blocks. The gaps between the posts are open: the real world is seen through them.
  { const y0 = RF, yb = RF + 0.11, yt = RF + 0.24, R = D.CUPR;
    T.cyl('shell', R + 0.02, R + 0.02, yb - y0, C.cream, CX, (y0 + yb) / 2, CZ, 0, 0, 0, 32, true); T.cyl('shell', R + 0.02, R + 0.02, 0.07, C.cream, CX, yt + 0.035, CZ, 0, 0, 0, 32, true);
    T.geo('shell', new THREE.CircleGeometry(R + 0.02, 32), C.cream, CX, yt + 0.07, CZ, Math.PI / 2); T.ring('fit', R + 0.02, 0.022, C.steel, CX, RF, CZ, Math.PI / 2, 0, 0, 32);
    for (let i = 0; i < 8; i++) { const a = (i * 45 + 22.5) * Math.PI / 180, px = CX + Math.sin(a) * R, pz = CZ - Math.cos(a) * R;
      T.box('shell', 0.115, yt - yb + 0.004, 0.05, C.blackP, px, (yb + yt) / 2, pz, 0, -a, 0);                                   /* post between two blocks */
      const b = i * 45 * Math.PI / 180, bx = CX + Math.sin(b) * (R - 0.012), bz = CZ - Math.cos(b) * (R - 0.012);
      T.box('fit', 0.21, 0.018, 0.04, C.rubber, bx, yt - 0.003, bz, 0, -b, 0); T.box('fit', 0.21, 0.014, 0.05, C.black, bx, yb + 0.004, bz, 0, -b, 0); }
    T.box('fit', 0.05, 0.03, 0.16, C.steel, CX, yt + 0.05, CZ + 0.18); T.cyl('fit', 0.012, 0.012, 0.12, C.yellow, CX - 0.1, yt + 0.045, CZ - 0.1, 0, 0, Math.PI / 2, 8);
    T.label('HATCH LOCK', 0.014, CX, yt + 0.066, CZ + 0.02, Math.PI / 2, 0, 0, 'plate', { size: 22 }); }
  moving.glass = { g: 'tur', R: D.CUPR + 0.012, y: RF + 0.175, h: 0.13, c: [CX, CZ] };

  // ---- loader's station (left of the gun)
  T.ring('fit', D.HATR, 0.028, C.steel, HX, RF, HZ, Math.PI / 2, 0, 0, 28); T.cyl('shell', D.HATR, D.HATR, 0.05, C.cream, HX, RF + 0.025, HZ, 0, 0, 0, 24, true);
  moving.hatch = { g: 'tur', build: k => { k.cyl('p', D.HATR + 0.03, D.HATR + 0.03, 0.03, C.cream, 0, 0, -D.HATR, 0, 0, 0, 24); k.cyl('p', 0.014, 0.014, 0.18, C.yellow, 0, -0.04, -D.HATR + 0.05, 0, 0, Math.PI / 2, 8); k.box('p', 0.06, 0.03, 0.05, C.steel, 0.2, -0.02, -D.HATR - 0.05); }, pos: [HX, RF + 0.06, HZ + D.HATR] };
  T.box('fit', 0.24, 0.09, 0.12, C.black, HX, RF - 0.045, HZ - D.HATR - 0.14); T.box('fit', 0.19, 0.055, 0.004, C.glass, HX, RF - 0.05, HZ - D.HATR - 0.078); T.label('PERISCOPE', 0.012, HX, RF - 0.1, HZ - D.HATR - 0.079, 0, 0, 0, 'plate', { size: 22 });
  for (const s of [-1, 1]) T.geo('fit', new THREE.TorusGeometry(0.05, 0.011, 6, 10, Math.PI), C.yellow, HX + s * 0.25, RF - 0.012, HZ - 0.38, Math.PI, 0, 0);
  // seat that folds from the wall, and his knee switch for the ammunition door
  T.box('fit', 0.36, 0.05, 0.34, C.cloth, -0.84, -0.42, 0.5); T.box('fit', 0.05, 0.3, 0.05, C.steel, -1.1, -0.55, 0.5, 0, 0, 0.6); T.box('fit', 0.34, 0.3, 0.05, C.cloth, -1.15, -0.12, 0.5, 0, Math.PI / 2, 0);
  T.box('fit', 0.05, 0.42, 0.05, C.creamD, -0.42, FL + 0.21, 0.82); T.box('fit', 0.15, 0.1, 0.12, C.yellow, -0.42, FL + 0.46, 0.8); T.label('AMMO DOOR\nKNEE SWITCH', 0.04, -0.42, FL + 0.46, 0.738, 0, Math.PI, 0, 'warn');
  moving.knee = { g: 'tur', build: k => { k.box('p', 0.11, 0.03, 0.09, C.black, 0, 0, -0.045); }, pos: [-0.42, FL + 0.46, 0.74] };
  // turret network box, radios, intercom on the left wall
  console_(T, -1.172, 0.26, -0.2, 0, Math.PI / 2, 0.42, 0.26, 0.07, C.olive, () => {
    T.label('TURRET NETWORK BOX', 0.018, 0, 0.1, 0.0015, 0, 0, 0, 'panel'); for (let i = 0; i < 6; i++) { T.cyl('fit', 0.017, 0.017, 0.03, C.black, -0.15 + i * 0.06, -0.07, 0.015, Math.PI / 2, 0, 0, 8); T.lamp(ind('net' + (i % 3)), 0.01, 0.01, i % 3 === 2 ? 0xffb020 : 0x30ff60, -0.15 + i * 0.06, -0.025, 0.002, 0, 0, 0, true); }
    ['UTILITY', 'GPS', 'CITV', 'HKOI', 'RADIO', 'DRIVER'].forEach((s, i) => T.label(s, 0.011, -0.15 + i * 0.06, 0.0, 0.0015, 0, 0, 0, 'panel', { size: 20 }));
    ctl(T, 'tur', 'toggle', -0.15, 0.055, 'Circuit breaker reset, turret bus (nothing has tripped)', { locked: true, state: 1 }); ctl(T, 'tur', 'toggle', 0.15, 0.055, 'Utility outlet power: harmless', { key: 'utility' });
  });
  for (let r = 0; r < 2; r++) console_(T, -1.172, 0.3 - r * 0.2, 0.52, 0, Math.PI / 2, 0.36, 0.17, 0.1, C.oliveD, () => {
    T.label(r ? 'RADIO  B  ·  COMPANY NET' : 'RADIO  A  ·  PLATOON NET', 0.014, -0.03, 0.066, 0.0015, 0, 0, 0, 'panel'); T.label(r ? '41.250' : '38.650', 0.03, -0.09, 0.012, 0.0015, 0, 0, 0, 'amber', { size: 40 });
    ctl(T, 'tur', 'knob', 0.03, 0.012, `Radio ${r ? 'B' : 'A'} volume`, { n: 5, state: 3, key: 'radioVol' + r, label: 'VOL', lh: 0.011 });
    ctl(T, 'tur', 'knob', 0.09, 0.012, `Radio ${r ? 'B' : 'A'} channel (the commander keeps the net he was given)`, { n: 6, state: 2 + r, locked: true, label: 'CHAN', lh: 0.011 });
    ctl(T, 'tur', 'toggle', 0.145, 0.012, `Radio ${r ? 'B' : 'A'} squelch: harmless`, { key: 'squelch' + r, state: 1, label: 'SQL', lh: 0.011 });
    T.lamp(ind('radio' + r), 0.012, 0.012, 0x30ff60, 0.145, 0.055, 0.002, 0, 0, 0, true); for (let i = 0; i < 5; i++) T.box('fit', 0.02, 0.012, 0.005, C.black, -0.14 + i * 0.028, -0.055, 0.003);
  });
  intercom(T, 'tur', -1.172, 0.4, -0.62, Math.PI / 2, 'Loader');
  T.label('LOADER', 0.03, -1.19, 0.47, 0.1, 0, Math.PI / 2, 0, 'stencil'); T.lamp(ind('ldrWarn'), 0.07, 0.025, 0xff2a1a, -1.19, 0.47, -0.3, 0, Math.PI / 2, 0); T.label('MISSILE WARNING', 0.013, -1.19, 0.44, -0.3, 0, Math.PI / 2, 0, 'danger', { size: 22 });
  // turret lock, fire extinguisher, stowage: ammunition cans, water can, tool roll, first aid box, flashlight, map case
  T.box('fit', 0.1, 0.1, 0.16, C.creamD, -1.0, HR + 0.02, -0.72); T.label('TURRET LOCK', 0.016, -0.95, HR + 0.075, -0.72, -Math.PI / 2, 0, 0, 'danger', { size: 22 });
  moving.lock = { g: 'tur', build: k => { k.box('p', 0.03, 0.2, 0.03, C.red, 0, 0.1, 0); k.ball('p', 0.024, C.red, 0, 0.2, 0); }, pos: [-1.0, HR + 0.07, -0.72] };
  T.cyl('fit', 0.062, 0.062, 0.46, C.red, -1.05, -0.5, -0.5, 0, 0, 0, 12); T.cyl('fit', 0.022, 0.03, 0.08, C.steel, -1.05, -0.23, -0.5, 0, 0, 0, 8); T.box('fit', 0.05, 0.1, 0.03, C.black, -1.03, -0.16, -0.48); T.label('FIRE EXT\nPULL', 0.045, -0.985, -0.5, -0.5, 0, Math.PI / 2, 0, 'danger');
  for (let i = 0; i < 4; i++) { T.box('fit', 0.15, 0.185, 0.28, C.olive, -1.04 + (i > 1 ? 0.16 : 0), FL + 0.095 + (i % 2) * 0.19, -0.12); T.box('fit', 0.05, 0.012, 0.1, C.steel, -1.04 + (i > 1 ? 0.16 : 0), FL + 0.194 + (i % 2) * 0.19, -0.12); }
  T.label('7.62 MM\n200 CTG LINKED', 0.05, -0.88, FL + 0.28, 0.022, 0, 0, 0, 'plate'); T.label('7.62 MM\n200 CTG LINKED', 0.05, -1.04, FL + 0.28, 0.022, 0, 0, 0, 'plate');
  T.box('fit', 0.17, 0.44, 0.33, C.oliveD, -1.05, FL + 0.22, 0.24); T.cyl('fit', 0.03, 0.03, 0.04, C.black, -1.05, FL + 0.46, 0.14, 0, 0, 0, 8); T.label('WATER', 0.03, -0.963, FL + 0.3, 0.24, 0, Math.PI / 2, 0, 'stencil', { color: '#d9d5bf' });
  T.geo('fit', new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10), C.tan, 0.98, HR + 0.1, -0.2, Math.PI / 2, 0, 0, 1, 1, 0.7); T.label('STOW EQUIPMENT HERE', 0.02, 1.19, 0.44, -0.05, 0, -Math.PI / 2, 0, 'stencil');
  T.box('fit', 0.05, 0.2, 0.26, C.white, 1.17, -0.3, 0.7); T.label('FIRST AID', 0.03, 1.143, -0.3, 0.7, 0, -Math.PI / 2, 0, 'danger'); T.cyl('fit', 0.022, 0.022, 0.2, C.oliveD, -1.15, 0.02, -0.5, 0, 0, 0, 8); T.box('fit', 0.03, 0.3, 0.24, C.tan, -1.175, -0.3, 0.1);
  T.box('fit', 0.14, 0.09, 0.2, C.olive, 0.3, FL + 0.05, 0.6); T.box('fit', 0.3, 0.12, 0.2, C.olive, -0.05, FL + 0.06, 0.78);   /* tool boxes on the floor */
  // cables and hoses along the walls and roof, the heater hose
  for (let i = 0; i < 4; i++) { const p = []; for (let k = 0; k <= 7; k++) p.push([-1.18, RF - 0.06 - i * 0.03 + Math.sin(k * 1.7 + i) * 0.008, -0.7 + k * 0.24]); T.tube('fit', p, 0.007 + (i % 2) * 0.003, i % 3 ? C.black : C.gunm); }
  for (let i = 0; i < 3; i++) { const p = []; for (let k = 0; k <= 7; k++) p.push([1.18, RF - 0.05 - i * 0.03 + Math.sin(k * 1.3 + i) * 0.008, -0.7 + k * 0.24]); T.tube('fit', p, 0.008, C.black); }
  T.tube('fit', [[1.17, RF - 0.07, -0.5], [1.14, 0.3, -0.62], [1.1, 0.19, -0.74]], 0.008, C.black); T.tube('fit', [[1.17, RF - 0.06, 0.1], [1.15, 0.36, 0.1], [1.12, 0.28, 0.1]], 0.008, C.black); T.tube('fit', [[0.62, 0.3, -0.33], [0.7, 0.42, -0.5], [0.76, RFF + 0.02, -0.9]], 0.008, C.black);
  T.tube('fit', [[-1.1, FL + 0.05, -0.6], [-1.15, -0.4, -0.72], [-1.12, 0.1, -0.86], [-0.9, RFF - 0.04, -1.2]], 0.035, C.rubber, 7);
  for (const [x, z] of [[-0.25, -0.45], [0.2, 0.9], [-1.0, 0.75]]) T.geo('fit', new THREE.TorusGeometry(0.055, 0.011, 6, 10, Math.PI), C.yellow, x, RF - 0.012, z, Math.PI, 0, 0);
  dome(T, 'tur', 0.1, RF, 0.62, 'domeR'); dome(T, 'tur', -0.75, RF, -0.42, 'domeL');

  // ---- the bustle bulkhead: frame, the ready-rack door (slides aside for a reload), the second door, the racks behind
  { const y0 = 0.0, y1 = 0.48; T.box('fit', 2.4, RF - y1, 0.04, C.cream, 0, (RF + y1) / 2, BZ); T.box('fit', 2.4, y0 - HR, 0.04, C.cream, 0, (y0 + HR) / 2, BZ); for (const x of [-1.15, 0, 1.15]) T.box('fit', x ? 0.1 : 0.2, y1 - y0, 0.04, C.cream, x, (y0 + y1) / 2, BZ);
    T.box('fit', 1.0, y1 - y0, 0.035, C.steel, 0.6, (y0 + y1) / 2, BZ - 0.03); for (let i = 0; i < 4; i++) T.box('fit', 0.98, 0.012, 0.015, C.gunm, 0.6, y0 + 0.06 + i * 0.12, BZ - 0.052);
    T.label('SEMI-READY RACK   18 RDS', 0.03, 0.6, 0.36, BZ - 0.049, 0, Math.PI, 0, 'plate'); T.label('KEEP DOOR CLOSED', 0.04, 0.6, 0.15, BZ - 0.049, 0, Math.PI, 0, 'danger');
    moving.door = { g: 'tur', build: k => { k.box('p', 1.0, y1 - y0, 0.035, C.steel, 0, 0, 0); for (let i = 0; i < 4; i++) k.box('p', 0.98, 0.012, 0.015, C.gunm, 0, -0.18 + i * 0.12, -0.022); k.box('p', 0.04, 0.16, 0.03, C.yellow, 0.42, 0, -0.03);
      k.label('READY RACK   18 RDS', 0.03, 0, 0.12, -0.0195, 0, Math.PI, 0, 'plate'); k.label('KEEP DOOR CLOSED', 0.04, 0, -0.09, -0.0195, 0, Math.PI, 0, 'danger'); }, pos: [-0.6, (y0 + y1) / 2, BZ - 0.03] };
    // the rack faces: a dark plate with a ring at every tube
    for (const s of [-1, 1]) { T.box('fit', 1.0, y1 - y0, 0.02, C.case, s * 0.6, (y0 + y1) / 2, BZ + 0.1); for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) T.ring('fit', 0.066, 0.008, C.gunm, s * 0.6 - 0.4 + i * 0.16, y0 + 0.085 + r * 0.155, BZ + 0.088, 0, 0, 0, 12); }
    moving.rack = { g: 'tur', slot: (side, i) => [side * 0.6 - 0.4 + (i % 6) * 0.16, y0 + 0.085 + Math.floor(i / 6) * 0.155, BZ + 0.075] }; }
  // the round in the loader's hands is not shown without a loader figure; the round is shown leaving its tube and on the loading tray
  moving.round = { g: 'tur', build: k => { k.cyl('p', 0.058, 0.058, 0.56, C.case, 0, 0, 0.2, Math.PI / 2, 0, 0, 12); k.cyl('p', 0.062, 0.062, 0.02, C.brass, 0, 0, 0.49, Math.PI / 2, 0, 0, 12); k.cyl('p', 0.02, 0.058, 0.36, C.gunm, 0, 0, -0.26, Math.PI / 2, 0, 0, 12); k.cyl('p', 0.006, 0.02, 0.06, C.steel, 0, 0, -0.47, Math.PI / 2, 0, 0, 8); } };

  // ================================================================ HULL
  // ---- tub round the basket, roof plate with the ring opening, engine bulkhead
  { const hw = 1.14, z0 = -1.75, z1 = 1.3;
    H.plane('shell', hw * 2, z1 - z0, C.hull, 0, HF, (z0 + z1) / 2, -Math.PI / 2); for (const s of [-1, 1]) H.plane('shell', z1 - z0, HR - HF, C.hull, s * hw, (HF + HR) / 2, (z0 + z1) / 2, 0, -s * Math.PI / 2, 0);
    H.plane('shell', hw * 2, HR - HF, C.hull, 0, (HF + HR) / 2, z1, 0, Math.PI, 0);
    const rs = new THREE.Shape([[-hw, z0], [hw, z0], [hw, z1], [-hw, z1]].map(p => new THREE.Vector2(p[0], -p[1]))); const h = new THREE.Path(); h.absarc(0, 0, 1.1, 0, Math.PI * 2, true); rs.holes.push(h);
    H.geo('shell', new THREE.ShapeGeometry(rs, 28), C.hull, 0, HR, 0, -Math.PI / 2, 0, 0);
    // front wall of the tub with the opening to the driver's compartment
    for (const s of [-1, 1]) H.plane('shell', hw - 0.5, HR - HF, C.hull, s * (hw + 0.5) / 2, (HF + HR) / 2, z0); H.plane('shell', 1.0, HR - DRF, C.hull, 0, (HR + DRF) / 2, z0);
    // on the engine bulkhead: hull ammunition box, battery box, fire bottles, placards
    H.box('fit', 0.9, 0.5, 0.3, C.creamD, -0.5, HF + 0.25, z1 - 0.16); H.label('HULL AMMUNITION   6 RDS', 0.035, -0.5, HF + 0.38, z1 - 0.312, 0, Math.PI, 0, 'plate'); H.label('KEEP DOOR CLOSED', 0.04, -0.5, HF + 0.2, z1 - 0.312, 0, Math.PI, 0, 'danger');
    H.box('fit', 0.7, 0.34, 0.26, C.olive, 0.62, HF + 0.17, z1 - 0.14); H.label('BATTERIES  24 V', 0.035, 0.62, HF + 0.2, z1 - 0.272, 0, Math.PI, 0, 'warn');
    for (const x of [0.25, 0.42]) { H.cyl('fit', 0.06, 0.06, 0.4, C.red, x, HF + 0.75, z1 - 0.08, 0, 0, 0, 10); H.cyl('fit', 0.02, 0.03, 0.06, C.steel, x, HF + 0.98, z1 - 0.08, 0, 0, 0, 8); }
    H.label('ENGINE COMPARTMENT\nFIRE BOTTLES', 0.06, 0.33, HF + 0.48, z1 - 0.006, 0, Math.PI, 0, 'danger'); H.label('NO SMOKING', 0.05, -0.5, HF + 0.72, z1 - 0.006, 0, Math.PI, 0, 'danger');
    for (const s of [-1, 1]) { H.box('fit', 0.12, 0.3, 1.6, C.creamD, s * (hw - 0.06), HF + 0.15, -0.3); H.tube('fit', [[s * (hw - 0.02), HR - 0.1, z0 + 0.1], [s * (hw - 0.02), HR - 0.12, -0.2], [s * (hw - 0.02), HR - 0.1, z1 - 0.1]], 0.014, C.black); H.tube('fit', [[s * (hw - 0.02), HR - 0.16, z0 + 0.1], [s * (hw - 0.025), HR - 0.18, 0.1], [s * (hw - 0.02), HR - 0.16, z1 - 0.1]], 0.01, C.gunm); }
    H.ring('fit', 1.1, 0.03, C.steel, 0, HR - 0.02, 0, Math.PI / 2, 0, 0, 48);
    for (let i = 0; i < 5; i++) H.box('fit', hw * 2 - 0.3, 0.012, 0.04, C.creamD, 0, HF + 0.006, z0 + 0.4 + i * 0.6); }
  // ---- driver's compartment: a narrow box between the two front fuel tanks, three vision blocks ahead of his face
  { const w = 0.5, z0 = -1.75, zb = DZ - 0.19, yb = DRF - 0.125;   // zb: plane of the vision blocks; yb: their lower edge
    H.plane('shell', w * 2, z0 - (DZ - 1.0), C.hull, 0, HF, (z0 + DZ - 1.0) / 2, -Math.PI / 2); for (const s of [-1, 1]) H.plane('shell', z0 - (DZ - 1.0), DRF - HF, C.hull, s * w, (HF + DRF) / 2, (z0 + DZ - 1.0) / 2, 0, -s * Math.PI / 2, 0);
    { const rs = new THREE.Shape([[-w, zb], [w, zb], [w, z0], [-w, z0]].map(p => new THREE.Vector2(p[0], -p[1]))); H.geo('shell', new THREE.ShapeGeometry(rs), C.hull, 0, DRF, 0, -Math.PI / 2, 0, 0); }
    // below the vision blocks the front plate slopes away to the floor
    { const dy = yb - HF, dzs = (DZ - 1.0) - zb, L = Math.hypot(dy, dzs); H.plane('shell', w * 2, L, C.hull, 0, (yb + HF) / 2, (zb + DZ - 1.0) / 2, Math.atan2(-dzs, dy), 0, 0); }
    // posts and bars round the three blocks (the gaps are open: the real world is seen through them)
    H.box('shell', w * 2, 0.012, 0.06, C.blackP, 0, yb - 0.006, zb + 0.03); H.box('shell', w * 2, 0.03, 0.05, C.blackP, 0, DRF - 0.012, zb + 0.02);
    for (const x of [-0.455, -0.167, 0.167, 0.455]) H.box('shell', Math.abs(x) > 0.3 ? 0.1 : 0.036, 0.13, 0.05, C.blackP, x, (yb + DRF) / 2, zb + 0.02);
    for (const x of [-0.31, 0, 0.31]) H.box('fit', 0.25, 0.022, 0.035, C.rubber, x, DRF - 0.03, zb + 0.06);
    moving.dglass = { g: 'hul', z: zb + 0.004, y: (yb + DRF) / 2 - 0.006, h: 0.1, xs: [-0.31, 0, 0.31], w: 0.25 };
    H.label('DRIVER', 0.03, -w + 0.004, DRF - 0.1, DZ + 0.5, 0, Math.PI / 2, 0, 'stencil'); H.label('FUEL TANK BEHIND THIS PANEL', 0.022, w - 0.004, HF + 0.5, DZ + 0.2, 0, -Math.PI / 2, 0, 'warn'); H.label('FUEL TANK BEHIND THIS PANEL', 0.022, -w + 0.004, HF + 0.5, DZ + 0.2, 0, Math.PI / 2, 0, 'warn');
    // hatch ring above and behind his head
    H.ring('fit', 0.3, 0.022, C.steel, 0, DRF - 0.005, DZ + 0.42, Math.PI / 2, 0, 0, 24); H.cyl('fit', 0.012, 0.012, 0.2, C.yellow, 0.18, DRF - 0.05, DZ + 0.42, Math.PI / 2, 0, 0, 8); H.label('HATCH', 0.014, 0.18, DRF - 0.004, DZ + 0.6, Math.PI / 2, 0, 0, 'plate', { size: 22 });
    // reclined seat with headrest
    H.box('fit', 0.44, 0.07, 0.46, C.cloth, 0, HF + 0.2, DZ + 0.42, 0.18); H.box('fit', 0.44, 0.66, 0.07, C.cloth, 0, HF + 0.42, DZ + 0.92, -0.95); H.box('fit', 0.22, 0.14, 0.07, C.cloth, 0, DRF - 0.33, DZ + 1.22, -0.8); H.box('fit', 0.3, 0.14, 0.5, C.creamD, 0, HF + 0.07, DZ + 0.5);
    // steering column; the T-bar itself turns with the steering
    H.cyl('fit', 0.028, 0.034, 0.5, C.steel, 0, HF + 0.36, DZ - 0.42, -0.5, 0, 0, 10); H.box('fit', 0.12, 0.08, 0.1, C.black, 0, HF + 0.57, DZ - 0.3, -0.5);
    moving.tbar = { g: 'hul', build: k => { k.box('p', 0.4, 0.045, 0.055, C.black, 0, 0, 0); for (const s of [-1, 1]) k.cyl('p', 0.024, 0.024, 0.13, C.rubber, s * 0.25, 0, 0, 0, 0, Math.PI / 2, 10); k.box('p', 0.06, 0.03, 0.08, C.gunm, 0, 0.03, -0.02); }, pos: [0, HF + 0.62, DZ - 0.26], rx: -0.5 };
    moving.gear = { g: 'hul', build: k => { k.cyl('p', 0.007, 0.007, 0.07, C.steel, 0, 0.035, 0, 0, 0, 0, 6); k.ball('p', 0.014, C.black, 0, 0.075, 0); }, pos: [0, HF + 0.66, DZ - 0.29] };
    H.label('R  N  D  L', 0.012, 0, HF + 0.632, DZ - 0.232, -1.0, 0, 0, 'panel', { size: 22 });
    // pedals
    H.box('fit', 0.2, 0.02, 0.14, C.floor, 0, HF + 0.16, DZ - 0.72, 0.9); H.box('fit', 0.04, 0.2, 0.03, C.steel, 0, HF + 0.08, DZ - 0.68, 0.5); H.box('fit', 0.09, 0.02, 0.2, C.floor, -0.28, HF + 0.1, DZ - 0.6, 0.5);
    // driver's display, right of the column
    console_(H, 0.33, HF + 0.58, DZ - 0.44, -0.45, -0.55, 0.3, 0.2, 0.08, C.olive, () => { screen(H, 'hul', 'drv', 0.2, 0.125, -0.035, 0.012); H.label('DRIVER\'S DISPLAY', 0.012, -0.035, 0.086, 0.0015, 0, 0, 0, 'panel', { size: 22 });
      ctl(H, 'hul', 'knob', 0.115, 0.045, 'Driver\'s display brightness', { n: 4, state: 2, key: 'drvBrt', label: 'BRT', lh: 0.011 }); ctl(H, 'hul', 'button', 0.115, -0.03, 'Driver\'s display page (one page here: speed, heading, gear, engine)', { key: 'drvPage', label: 'PAGE', lh: 0.011 }); H.lamp(ind('drvWarn'), 0.05, 0.016, 0xff2a1a, -0.105, -0.075, 0.002); });
    // master panel, left of the column
    console_(H, -0.33, HF + 0.58, DZ - 0.44, -0.45, 0.55, 0.3, 0.2, 0.08, C.olive, () => { H.label('DRIVER\'S MASTER PANEL', 0.012, 0, 0.086, 0.0015, 0, 0, 0, 'panel', { size: 22 });
      ctl(H, 'hul', 'toggle', -0.11, 0.035, 'Master power (on: the vehicle is running)', { locked: true, state: 1, label: 'MASTER', lh: 0.011 }); H.lamp(ind('drvPwr'), 0.012, 0.012, 0x30ff60, -0.11, 0.064, 0.002, 0, 0, 0, true);
      ctl(H, 'hul', 'button', -0.05, 0.035, 'Engine start (the turbine is already running)', { locked: true, label: 'START', lh: 0.011 }); H.lamp(ind('drvEng'), 0.012, 0.012, 0x30ff60, -0.05, 0.064, 0.002, 0, 0, 0, true);
      ctl(H, 'hul', 'knob', 0.015, 0.035, 'Lights: off, blackout markers, blackout drive, service (the driver keeps them off in contact)', { n: 4, locked: true, label: 'LIGHTS', lh: 0.011 });
      ctl(H, 'hul', 'toggle', 0.08, 0.035, 'Tactical idle: holds engine speed up for a quick start (the driver sets it)', { locked: true, state: 1, label: 'TAC IDLE', lh: 0.011 });
      ctl(H, 'hul', 'toggle', -0.11, -0.04, 'Parking brake (the driver sets it at the halt)', { locked: true, key: 'park', label: 'PARK BRAKE', lh: 0.011 }); H.lamp(ind('drvPark'), 0.012, 0.012, 0xffb020, -0.11, -0.012, 0.002, 0, 0, 0, true);
      ctl(H, 'hul', 'knob', -0.035, -0.04, 'Panel legend lighting', { n: 4, state: 1, key: 'backlight', label: 'PANEL LTS', lh: 0.011 });
      ctl(H, 'hul', 'toggle', 0.04, -0.04, 'Vision block wiper and washer: cosmetic here', { key: 'wiper', label: 'WIPER', lh: 0.011 });
      ctl(H, 'hul', 'toggle', 0.11, -0.04, 'Smoke generator: engine exhaust smoke (not modelled; the driver leaves it off)', { locked: true, label: 'SMOKE GEN', lh: 0.011 }); });
    for (const s of [-1, 1]) { H.box('fit', 0.03, 0.03, 0.12, C.red, s * 0.44, DRF - 0.1, DZ + 0.1); }
    H.label('FIRE EXT\n1ST SHOT', 0.035, -0.494, DRF - 0.16, DZ + 0.1, 0, Math.PI / 2, 0, 'danger'); H.label('FIRE EXT\n2ND SHOT', 0.035, 0.494, DRF - 0.16, DZ + 0.1, 0, -Math.PI / 2, 0, 'danger');
    intercom(H, 'hul', 0.474, DRF - 0.33, DZ - 0.02, -Math.PI / 2, 'Driver');
    dome(H, 'hul', -0.25, DRF, DZ + 0.75, 'domeD');
    for (let i = 0; i < 3; i++) { const p = []; for (let k = 0; k <= 5; k++) p.push([-0.485, DRF - 0.04 - i * 0.03, DZ - 0.1 + k * 0.22 + Math.sin(k + i) * 0.01]); H.tube('fit', p, 0.008, C.black); } }

  return { T, H, controls, screens, moving, part };
}

// where each crewman's eyes are (frame as above) and how far his head turns. yaw 0 looks along the gun (or along the hull for the driver); positive yaw is to the right.
export const SEATS = {
  in_cdr: { g: 'tur', name: 'Commander', eye: [DIM.CUP[0], 0.38, DIM.CUP[1] + 0.02], yaw0: -8, pitch0: -16, yawLim: 175, pitch: [-62, 28], fov: 76, up: DIM.RF + 0.175 - 0.38 },
  in_gnr: { g: 'tur', name: 'Gunner', eye: [0.66, 0.2, -0.5], yaw0: 0, pitch0: -3, yawLim: 115, pitch: [-55, 35], fov: 70 },
  in_ldr: { g: 'tur', name: 'Loader', eye: [-0.66, 0.34, 0.3], yaw0: 52, pitch0: -14, yawLim: 175, pitch: [-60, 50], fov: 80 },
  in_drv: { g: 'hul', name: 'Driver', eye: [0, DIM.DRF - 0.07, DIM.DZ + 0.03], yaw0: 0, pitch0: -1, yawLim: 80, pitch: [-58, 20], fov: 72 },
};
