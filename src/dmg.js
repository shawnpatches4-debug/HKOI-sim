// ================================================================ damage model: where each hit lands, whether it penetrates, what it destroys
// Deterministic from the recorded raid. It never contradicts the engine: a hit the engine scored as killing always penetrates
// somewhere that kills; a hit it scored as survivable either fails to penetrate or only wrecks components.
// Vehicle frame: x right, y up, z rearward (forward is -z), metres from the hull centre at ground level.
const DMG = (() => {
  // line-of-sight armour against shaped charges (mm RHA equivalent), open-source estimates for an Abrams-class tank
  const ZONES = {
    turret_front: { name: 'Turret front', mm: 1300, turret: true }, turret_side: { name: 'Turret side', mm: 450, turret: true }, turret_rear: { name: 'Turret bustle', mm: 120, turret: true },
    turret_roof: { name: 'Turret roof', mm: 60, turret: true }, hull_front: { name: 'Hull front (glacis)', mm: 750 }, hull_side_f: { name: 'Hull side, front (heavy skirts)', mm: 420 },
    hull_side_r: { name: 'Hull side, rear', mm: 180 }, hull_rear: { name: 'Hull rear (engine)', mm: 90 }, engine_deck: { name: 'Engine deck', mm: 45 },
  };
  // shaped-charge penetration after any reactive armour layer (mm RHA), open-source estimates
  const PEN = { ke: 700, kornet: 1150, vikhr: 900, saclos: 650, sal: 750, fpv: 400, fpv_fiber: 400, rpg: 500, ir: 760 };
  // internal components (hull frame; turret items are given in the turret frame and rotated by the turret angle)
  const COMPS = [
    { id: 'drv', name: 'Driver', crew: true, p: [0, 1.0, -2.3], r: .35 }, { id: 'gnr', name: 'Gunner', crew: true, turret: true, p: [.35, 1.55, -.6], r: .3 },
    { id: 'cdr', name: 'Commander', crew: true, turret: true, p: [.55, 1.95, .2], r: .3 }, { id: 'ldr', name: 'Loader', crew: true, turret: true, p: [-.6, 1.8, .1], r: .3 },
    { id: 'ammo', name: 'Bustle ammunition (behind blast doors)', turret: true, p: [0, 2.1, 1.9], r: .7 }, { id: 'hull_ammo', name: 'Hull ammunition rack', p: [0, 1.0, .9], r: .4 },
    { id: 'gun', name: 'Main gun breech', turret: true, p: [0, 1.9, -.6], r: .35 }, { id: 'gps', name: "Gunner's primary sight", turret: true, p: [.75, 2.3, -1.4], r: .25 },
    { id: 'citv', name: "Commander's thermal viewer", turret: true, p: [-.85, 2.6, -.9], r: .2 }, { id: 'tdrive', name: 'Turret drive and hydraulics', turret: true, p: [-.3, 1.5, -.2], r: .35 },
    { id: 'hkoi', name: 'HKOI weapon station', turret: true, p: [.45, 2.8, 1.0], r: .3 }, { id: 'radio', name: 'Radios and intercom', turret: true, p: [.7, 1.8, .8], r: .25 },
    { id: 'fuel_l', name: 'Fuel cell (left)', p: [-1.2, .9, -1.8], r: .4 }, { id: 'fuel_r', name: 'Fuel cell (right)', p: [1.2, .9, -1.8], r: .4 },
    { id: 'engine', name: 'Turbine engine', p: [0, 1.0, 2.6], r: .7 }, { id: 'trans', name: 'Transmission', p: [0, .8, 3.4], r: .5 },
    { id: 'track_l', name: 'Left track and running gear', p: [-1.5, .5, 0], r: .5, ext: true }, { id: 'track_r', name: 'Right track and running gear', p: [1.5, .5, 0], r: .5, ext: true },
    { id: 'radar', name: 'HKOI radar panel', turret: true, p: [.95, 2.5, .3], r: .2, ext: true }, { id: 'lwr', name: 'Laser warning head', turret: true, p: [-.95, 2.5, .7], r: .15, ext: true }, { id: 'stab', name: 'Gun stabiliser', turret: true, p: [0, 1.7, -.9], r: .25 },
  ];
  const hsh = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const rot = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };   // rotate about y like three.js rotation.y = a (positive turns forward toward the left); turret angle turA is clockwise, so callers pass -turA
  // pick the zone the warhead strikes from the attack direction (relative to hull and turret) and the attack profile
  function zoneFor(key, relHull, relTur, killing, k) {
    const top = key === 'fpv' || key === 'fpv_fiber' || key === 'ir', ah = Math.abs(((relHull + 540) % 360) - 180), at = Math.abs(((relTur + 540) % 360) - 180);
    const pen = PEN[key] || 600, cands = [];
    if (top) { cands.push(['turret_roof', 3], ['engine_deck', 2]); if (key === 'ir') cands.push(['turret_roof', 2]); }
    else { // direct fire: the turret is the larger target seen from most angles
      cands.push([at < 35 ? 'turret_front' : at > 140 ? 'turret_rear' : 'turret_side', 3]);
      cands.push([ah < 35 ? 'hull_front' : ah > 145 ? 'hull_rear' : ah < 90 ? 'hull_side_f' : 'hull_side_r', 2]); }
    // keep only zones consistent with the engine's verdict when we can
    let ok = cands.filter(([z]) => killing ? pen > ZONES[z].mm : true); if (killing && !ok.length) ok = [['hull_side_r', 2], ['engine_deck', 1], ['turret_rear', 1], ['hull_rear', 1]].filter(([z]) => pen > ZONES[z].mm); const pool = ok.length ? ok : cands, tot = pool.reduce((s, c) => s + c[1], 0);
    let u = k * tot; for (const [z, w] of pool) { if ((u -= w) <= 0) return z; } return pool[0][0];
  }
  function report(rec, cfg) {
    const out = [], hits = rec.threats.filter(th => th.viz.end && th.viz.end.type === 'hit').sort((a, b) => a.viz.end.t - b.viz.end.t);
    for (const th of hits) {
      const e = th.viz.end, t = e.t, cp = rec.crew ? HK.crewPos(rec.crew, t) : { h: rec.ctx.hull }, relHull = th.brg - cp.h;
      // the commander slews the turret onto warned threats; an unwarned shot finds the turret wherever it was last pointed
      const warned = th.cue != null && th.cue < t - 1.5, relTur = warned ? (hsh(th.idx, 3) - .5) * 30 : relHull + 60 + hsh(th.idx, 4) * 120;
      const turA = (relHull - relTur) * Math.PI / 180, k = hsh(th.idx + (cfg.seed || 1) * 7, 11), zone = zoneFor(th.key, relHull, relTur, !!e.killing, k), Z = ZONES[zone];
      const pen = PEN[th.key] || 600, residual = Math.max(0, pen - Z.mm), penetrated = residual > 0;
      // geometry: the jet comes in along the attack line; top attacks come down steeply
      const top = th.key === 'fpv' || th.key === 'fpv_fiber' || th.key === 'ir', b = relHull * Math.PI / 180, dir = top ? [-Math.sin(b) * .45, -.89, Math.cos(b) * .45] : [-Math.sin(b), -.03, Math.cos(b)];
      const zc = { turret_front: [0, 2.0, -2.4], turret_side: [1.7, 2.0, -.2], turret_rear: [0, 2.0, 2.4], turret_roof: [.2, 2.42, .3], hull_front: [0, 1.2, -3.6], hull_side_f: [1.8, 1.1, -1.4], hull_side_r: [1.8, 1.1, 1.6], hull_rear: [0, 1.1, 3.9], engine_deck: [0, 1.62, 2.6] }[zone];
      let entry = zc.slice(); if (zone.includes('side')) { const s = Math.sin(b) >= 0 ? 1 : -1; entry[0] *= s; } if (Z.turret) entry = rot(entry, -turA);
      // the jet reaches about 1 m per 250 mm of residual penetration; spall fans out in a 35 degree cone behind the armour
      const reach = penetrated ? Math.min(3.2, .35 + residual / 250) * (e.killing ? 1 : .55) : 0, comps = [], crew = { cdr: 'ok', gnr: 'ok', ldr: 'ok', drv: 'ok' };
      if (penetrated) for (const c of COMPS) { if (c.ext) continue; const p = c.turret ? rot(c.p, -turA) : c.p, v = [p[0] - entry[0], p[1] - entry[1], p[2] - entry[2]], along = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
        if (along < -.2 || along > reach + c.r) continue; const off = Math.hypot(v[0] - dir[0] * along, v[1] - dir[1] * along, v[2] - dir[2] * along), cone = .12 + Math.tan(35 * Math.PI / 180) * Math.max(0, along);
        if (off > cone + c.r) continue; const inJet = off < .15 + c.r * .6, sev = inJet ? 'destroyed' : hsh(th.idx * 13 + COMPS.indexOf(c), 7) < .55 ? 'damaged' : 'spared';
        if (sev === 'spared') continue; comps.push({ id: c.id, name: c.name, state: sev, crew: !!c.crew }); if (c.crew) crew[c.id] = inJet && e.killing ? 'killed' : 'wounded'; }
      else if (zone.startsWith('hull_side') || zone === 'hull_front') { const tr = (entry[0] < 0 ? 'track_l' : 'track_r'); if (hsh(th.idx, 9) < .6) comps.push({ id: tr, name: COMPS.find(c => c.id === tr).name, state: 'damaged', crew: false }); }
      else if (Z.turret) { for (const id of ['gps', 'citv', 'hkoi', 'radar', 'lwr']) if (hsh(th.idx + id.length * 3 + (id === 'radar' ? 7 : 0), 21) < .35) comps.push({ id, name: COMPS.find(c => c.id === id).name, state: 'damaged', crew: false }); }
      // what it means
      const has = id => comps.some(c => c.id === id && c.state !== 'spared'), dead = Object.values(crew).filter(s => s === 'killed').length;
      let effect = !penetrated ? 'No penetration. The armour held; external fittings damaged.' : !e.killing && !comps.length ? 'Penetrated, but the jet spent itself in empty space and stowage. The vehicle fights on.' : has('ammo') ? 'Bustle ammunition hit. Blast doors held and the blow-out panels vented the explosion upward, away from the crew.' : has('engine') || has('trans') ? 'Mobility kill: engine compartment penetrated and burning.' : has('fuel_l') || has('fuel_r') ? 'Fuel cell penetrated; fire in the hull.' : dead ? 'Crew compartment penetrated.' : 'Penetration with spall inside the vehicle.';
      if (e.killing && penetrated) effect += ' Vehicle knocked out.';
      out.push({ t, idx: th.idx, key: th.key, name: HK.THREATS[th.key].name, zone, zoneName: Z.name, armor: Z.mm, pen, residual, penetrated, killing: !!e.killing, entry, dir, reach, turA, comps, crew, effect, top });
    }
    return out;
  }
  return { report, COMPS, ZONES, PEN, rot };
})();
