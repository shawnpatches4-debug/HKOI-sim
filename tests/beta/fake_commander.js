// TESTS ONLY: a made-up enemy commander for tests/beta/cdrview.py, in the form battle.commander() returns (src/battle/enemycdr.js).
// The test puts it on the battle's prototype so that it survives the rewind a replay does. Never loaded by the simulator itself.
// Knobs on window: __fakeT (use this time instead of the battle's), __fakeStale (extra age of his report, seconds),
// __fakeSrc ('report' | 'sound' | 'plan'), __fakeLost (commander killed), __fakeNone (no commander in the group).
void (window.__fakeCommander = function () {
  if (window.__fakeNone) return null;
  const B = this, U = B.units, T = B.tank, t = window.__fakeT != null ? window.__fakeT : B.t, u = i => U[i % U.length];
  const be = T.e + 260, bn = T.n - 180, stale = window.__fakeStale || 0, c = u(0), lost = !!window.__fakeLost;
  const side = (a, de, dn) => [a.e + de, a.n + dn], nm = i => `${u(i).spec.name} ${u(i).id + 1}`;
  const all = [
    { id: 1, to: u(0).id, kind: 'watch', dest: [be, bn], by: 'foot', t_order: 5, t_eta: null, text: `${nm(0)} watch the valley road` },
    { id: 2, to: u(1).id, kind: 'hold_fire', dest: null, by: 'foot', t_order: 10, t_eta: null, text: `${nm(1)} hold fire until the drone is in` },
    { id: 3, to: u(2).id, kind: 'strike', dest: [be, bn], by: 'foot', t_order: 15, t_eta: null, text: `${nm(2)} strike the tank`, wrong: true, off_m: 316 },
    { id: 4, to: u(3).id, kind: 'strike', dest: [be, bn], by: 'foot', t_order: 15, t_eta: null, text: `${nm(3)} strike the tank`, wrong: true, off_m: 316 },
    { id: 5, to: u(4).id, kind: 'relocate', dest: side(u(4), 520, 380), route: [side(u(4), 0, 0), side(u(4), 160, 40), side(u(4), 340, 260), side(u(4), 520, 380)], by: 'foot', t_order: 20, t_eta: 20 + 240, text: `${nm(4)} to the north ridge, 4 min` },
    { id: 6, to: u(5).id, kind: 'relocate', dest: side(u(5), -700, 300), route: [side(u(5), 0, 0), side(u(5), -300, -60), side(u(5), -700, 300)], by: 'uaz', t_order: 25, t_eta: 25 + 95, text: `${nm(5)} to the west wood` },
    { id: 7, to: 101, kind: 'fix', dest: [be, bn], by: 'own', t_order: 30, t_eta: null, text: 'BMP-2 fix the tank from the east' },
    { id: 8, to: 102, kind: 'commit', dest: [T.e + 1500 + (be - T.e - 1500) * 0.6, T.n + 900 + (bn - T.n - 900) * 0.6], by: 'own', t_order: 35, t_eta: 35 + 150, text: 'T-72B3 commit down the road' },
    { id: 9, to: u(6).id, kind: 'break', dest: side(u(6), (u(6).e - be) * 0.4, (u(6).n - bn) * 0.4), by: 'foot', t_order: 40, t_eta: 40 + 120, text: `${nm(6)} break contact` },
    { id: 10, to: u(7).id, kind: 'relocate', dest: side(u(7), 200, -200), by: 'foot', t_order: 2, t_eta: 60, done: true, text: `${nm(7)} to the farm` },
  ];
  const fromOf = o => { const w = o.to < 100 ? U.find(q => q.id === o.to) : null; return w ? [w.e, w.n] : [T.e + 1500, T.n + 900]; };
  const plan = lost ? [] : all.filter(o => o.t_order <= t).map(o => Object.assign({ from: fromOf(o), route: null, done: false, wrong: false, off_m: null }, o));
  const bb = (Math.atan2(be - c.e, bn - c.n) * 180 / Math.PI + 360) % 360;
  return { alive: !lost, radio: !lost, with: { uid: c.id }, e: c.e, n: c.n,
    picture: { e: be, n: bn, t: t - 38 - stale, age: 38 + stale, off_m: 316, r_m: 150 + stale * 2, src: window.__fakeSrc || 'report' },
    predict: { path: [[be, bn], [be - 300, bn + 250], [be - 420, bn + 700]], to: [be - 420, bn + 700], why: 'it has been moving north and will go on to the high ground' },
    sectors: [{ uid: c.id, brg_from: (bb + 340) % 360, brg_to: (bb + 20) % 360 }, { vid: 101, brg_from: 200, brg_to: 260 }],
    plan, orders: plan };
});
void (window.__fakeVehicles = function () {
  const T = this.tank, v = (id, kind, name, de, dn, hull, state, intent) => ({ id, kind, name, e: T.e + de, n: T.n + dn, hull, turret: hull, speed: 0, state, alive: true, mobile: true, canFire: kind !== 'uaz', known: false, hullDown: false, wave: 1, riders: [], lastShot: null, damage: 0, intent, order: null });
  return [v(100, 'uaz', 'UAZ', -900, 1300, 120, 'parked', 'waiting for its passengers'), v(101, 'bmp2', 'BMP-2', 1400, -500, 250, 'parked', 'in a firing position'), v(102, 't72', 'T-72B3', 1500, 900, 230, 'moving', 'moving up'), v(103, 't90', 'T-90M', 1900, 300, 240, 'parked', 'watching')];
});
