// TEST ONLY. A made-up `battle.vehicles()` in exactly the shape the battle layer promises (see src/render/vehicles.js and the
// battle helper's contract), so the drawing of enemy vehicles can be exercised before the real battle logic exists.
// window.__vehFake(tank, uid) returns f(s): the list of vehicles s seconds into a fixed little story:
//   everything drives in for 8 s and halts in a row 300 m from the tank; then firing, hits of every kind, kills.
// tank: { e, n }; uid: the id of a real missile team that "rides" the first UAZ.
window.__vehFake = function (tank, uid, range) {
  const D = Math.PI / 180, brg = 40, R = range || 300, be = Math.sin(brg * D), bn = Math.cos(brg * D), pe = bn, pn = -be, face = (brg + 180) % 360;
  const slot = i => [tank.e + be * R + pe * (i - 4.5) * 28, tank.n + bn * R + pn * (i - 4.5) * 28];
  const run = s => s < 6 ? 10 * s : s < 8 ? 60 + 10 * (s - 6) - 2.5 * (s - 6) * (s - 6) : 70, spd = s => s < 6 ? 10 : s < 8 ? 10 - 5 * (s - 6) : 0;   /* 70 m driven, braking over the last 2 s */
  const NAME = { uaz: 'UAZ-469', bmp2: 'BMP-2', t72: 'T-72B3', t90: 'T-90M' };
  const shot = (t, weapon, hit, dur) => ({ t, weapon, at: [tank.e, tank.n], dur: dur || (weapon === '30mm' ? 1.6 : weapon === 'coax' ? 1.5 : 0), hit });
  const dmg = (t, zone, through, effect, by) => ({ t, zone, through, effect, by: by || 'main_ap', aspect: 0 });
  // id, kind, slot, drives in, shots [[t, weapon, hit]], hits { mob, fp, cat, ab, spark }, riders
  const DEF = [
    { id: 101, kind: 'uaz', drive: true, riders: true, out: [12, 20], cat: 30 },
    { id: 102, kind: 'bmp2', drive: true, shots: [[10, '30mm', true], [13, '30mm', false], [16, 'konkurs', null], [18, 'coax', false]] },
    { id: 103, kind: 't72', drive: true, shots: [[11, '125mm', false], [15, 'coax', true], [19, '125mm', null]], spark: 21 },
    { id: 104, kind: 't90', drive: true, mob: 14, shots: [[17, '125mm', false]] },
    { id: 105, kind: 'bmp2', fp: 16 },
    { id: 106, kind: 't72', cat: 22 },
    { id: 107, kind: 'bmp2', cat: 24 },
    { id: 108, kind: 't72', mob: 12, fp: 20, ab: 26 },
    { id: 109, kind: 'uaz' },
    { id: 110, kind: 't90', fp: 18, turret: 35 },
  ];
  const f = function (s) {
    return DEF.map((d, i) => {
      const p = slot(i), far = d.drive ? 70 - run(Math.max(0, s)) : 0, curve = d.kind === 'uaz' && d.drive, wob = curve ? Math.sin(far / 11) * 4 : 0, c = curve ? Math.cos(far / 11) * 4 / 11 : 0;
      const e = p[0] + be * far + pe * wob, n = p[1] + bn * far + pn * wob, speed = d.drive ? spd(Math.max(0, s)) : 0, hull = curve && speed > 0 ? Math.atan2(-be - pe * c, -bn - pn * c) / D : face;
      const cat = d.cat != null && s >= d.cat, ab = d.ab != null && s >= d.ab, mobile = !(d.mob != null && s >= d.mob) && !cat && !ab, canFire = !(d.fp != null && s >= d.fp) && !cat && !ab;
      let last = null; for (const q of d.shots || []) if (s >= q[0] - 0.05) last = shot(q[0], q[1], q[2]);
      let damage = null;
      if (d.mob != null && s >= d.mob) damage = dmg(d.mob, 'track', true, 'mobility');
      if (d.spark != null && s >= d.spark) damage = dmg(d.spark, 'turret_front', false, 'none');
      if (d.fp != null && s >= d.fp) damage = dmg(d.fp, 'turret_side', true, 'firepower');
      if (cat) damage = dmg(d.cat, d.kind === 'uaz' ? 'body' : 'hull_side', true, 'catastrophic', 'main_mp');
      const state = cat ? 'burning' : ab ? 'abandoned' : damage && s - damage.t < 4 ? 'hit' : last && s - last.t < 1.5 ? 'firing' : speed > 0.2 ? 'moving' : 'parked';
      const turret = d.kind === 'uaz' ? hull : hull + (d.turret || 0);
      return { id: d.id, kind: d.kind, name: NAME[d.kind], e, n, hull: (hull + 360) % 360, turret: (turret + 360) % 360, speed, state, alive: !cat && !ab, mobile, canFire, known: true, hullDown: false, wave: 0,
        riders: d.riders ? [{ uid, mounted: !(s >= d.out[0] && s < d.out[1]) }] : [], lastShot: last, damage, intent: 'test', order: null };
    });
  };
  f.slot = slot; f.brg = brg; f.face = face; f.ids = DEF.map(d => d.id); return f;
};
