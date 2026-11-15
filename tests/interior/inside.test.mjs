// What goes wrong inside, and the crew's wounds: checks without a browser (run by tests/interior/run.sh).
//   1. every effect has its cause: staged hits in the damage report's own form, and what interior_events.js makes of each
//   2. wounds agree with the damage report: a man it calls killed has a wound through the trunk or head, a man it calls wounded has
//      none; a man it does not name has no wound at all; nothing but limbs is ever taken off
//   3. REAL battles: every hit of several whole battles goes through the same code (no bad numbers, the hole lies on a wall of the
//      compartment the plate belongs to, each hurt man gets wounds), and the drawing stays inside its pools at every moment
//   4. the same moment gives the same answer whatever came before it (asked twice, asked after a later moment: a rewind)
import * as THREE from 'three';
import { createRequire } from 'module';
const el = () => ({ getContext: () => null, style: {}, width: 0, height: 0 });
globalThis.document = globalThis.document || { createElement: el, body: { appendChild() {} }, getElementById: () => el() };
const EV = await import('./render/interior_events.js'), GORE = await import('./render/interior_gore.js'), FXM = await import('./render/interior_fx.js');
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL: ' + msg); } };
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const hit = o => ({ T: o.T, pen: !!o.pen, kill: !!o.kill, minor: !!o.minor, s: o.s || (o.kill ? 2 : o.pen ? 1.6 : 1), e: o.e ? V(o.e) : undefined, d: o.d ? V(o.d).normalize() : undefined, comps: o.comps || {}, crew: o.crew || {}, idx: o.idx || 7, zoneKey: o.zone, turA: o.turA || 0, reach: o.reach });

// ---- 1. causes
{ const S = EV.insideState([hit({ T: 10, zone: 'turret_side', e: [1.7, 0.38, -0.3], d: [-1, -0.03, 0.05] })], 10.5, null, null);
  ok(!S.emergency && !S.fire && !S.halon && !S.hyd && S.arcs.length === 0 && Object.keys(S.blood).length === 0 && S.flash === 0, 'armour held: nothing but dust and shake'); ok(S.dust > 0 && S.shake > 0, 'armour held: dust and shake'); }
{ const h = hit({ T: 10, pen: 1, zone: 'turret_side', e: [1.7, 0.36, -0.22], d: [-1, -0.05, -0.03], reach: 2.2, comps: { gps: 'destroyed' }, crew: { gnr: 'wounded' } }), x = EV.detail(h);
  ok(Math.abs(x.pIn[0] - 1.2) < 1e-6 && x.nIn[0] === -1, 'turret side: the hole is on the right wall'); ok(!x.far && x.run > 1.5 && x.run < 1.8, 'reach 2.2 m from the plate: the jet ends in the air, ' + x.run.toFixed(2));
  let S = EV.insideState([h], 11, null, null); ok(S.emergency && S.dark.gps && S.cracked.gps != null && S.arcs.length === 1, 'sight destroyed: display dark and cracked, arcing, breakers trip');
  S = EV.insideState([h], 10 + EV.ELEC.resetS + 1, null, null); ok(!S.emergency, 'one unit lost: breakers reset after ' + EV.ELEC.resetS + ' s');
  S = EV.insideState([h], 40, { on: true, who: { cdr: { status: 'down' }, gnr: { status: 'down' }, ldr: { status: 'down' }, drv: { status: 'ok' } } }, null); ok(S.emergency, 'nobody left in the turret to reset them: it stays red'); }
{ const h = hit({ T: 10, pen: 1, zone: 'turret_side', e: [-1.7, 0.1, 0.55], d: [1, -0.3, -0.45], reach: 1.9, comps: { radio: 'destroyed', tdrive: 'destroyed' } });
  let S = EV.insideState([h], 10.4, null, null); ok(S.hyd && S.hyd.destroyed && S.manual && S.emergency && S.tripAge < 0.5, 'turret drive destroyed: fluid, manual traverse, breakers');
  S = EV.insideState([h], 200, null, null); ok(S.emergency && !S.hyd, 'radio rack and drive destroyed: red for good; the mist is gone after ' + EV.HYD.mistS + ' s'); }
{ const h = hit({ T: 10, pen: 1, zone: 'hull_side_f', e: [1.8, -0.52, -1.4], d: [-1, -0.03, -0.12], reach: 1.3, comps: { fuel_r: 'destroyed' } });
  let S = EV.insideState([h], 10.5, null, null); ok(S.fire && S.fires[0].where === 'hull' && S.fires[0].side === 1 && S.halon && S.halon.age > 0.3, 'fuel cell: hull fire on the right, Halon fired');
  S = EV.insideState([h], 10 + EV.FIRE_S.hull + 1, null, null); ok(!S.fire && S.smoke > 0.2, 'hull fire out after ' + EV.FIRE_S.hull + ' s, smoke stays');
  S = EV.insideState([h], 30, { on: true, who: {}, fire: { where: 'hull', since: 10, until: 60 } }, null); ok(S.fire, 'the crew model says the fire still burns: it burns'); }
{ const front = hit({ T: 10, pen: 1, kill: 1, zone: 'turret_front', e: [0.25, 0.36, -2.4], d: [0.02, -0.03, 1], reach: 3.2, comps: { ammo: 'destroyed' } }), rear = hit({ T: 10, pen: 1, zone: 'turret_rear', e: [0, 0.38, 2.4], d: [0, -0.03, -1], reach: 0.9, comps: { ammo: 'damaged' } });
  ok(EV.detail(front).breach, 'bustle ammunition hit through the fighting compartment by a killing hit: doors breached'); ok(!EV.detail(rear).breach && EV.detail(rear).hidden, 'bustle hit from behind: doors hold');
  const S = EV.insideState([rear], 12, null, null); ok(S.blow && S.blow.on && !S.breach && S.last == null, 'bustle hit from behind: burning behind the doors, no hole in the crew space'); }
{ const S = EV.insideState([hit({ T: 5, minor: 1, s: 0.3 })], 5.2, null, { t: 5.1, _k: 'catastrophic' }); ok(S.breach && S.fire && S.lightsOut, 'the battle says catastrophic: the doors are breached'); }
{ const f = { t: 5, kind: 'ammo_vented', blowout: { t0: 5, t1: 17 }, fire: { t0: 6, t1: 40, where: 'engine' } }, S = EV.insideState([], 8, null, EV.fateOf({ tank: { fate: f } })); ok(S.blow && S.blow.on && !S.breach && S.fires.length === 1 && S.fires[0].where === 'engine', 'the battle\'s own tank fate: blow-out and engine fire'); }

// ---- 2. wounds follow the report
{ const hs = [hit({ T: 10, pen: 1, zone: 'turret_side', e: [1.7, 0.36, -0.22], d: [-1, -0.05, -0.03], reach: 2.2, crew: { gnr: 'wounded', cdr: 'ok' }, idx: 11 }), hit({ T: 20, pen: 1, kill: 1, zone: 'turret_side', e: [-1.7, 0.2, 0.3], d: [1, -0.03, 0], reach: 1.6, crew: { ldr: 'killed' }, idx: 12 })];
  const W = GORE.woundsOf(hs, null);
  ok(W.gnr.list.length >= 2 && !W.gnr.list.some(w => w.kind === 'trauma') && W.gnr.Tk == null, 'wounded gunner: fragment wounds, none through the trunk');
  ok(W.ldr.list.some(w => w.kind === 'trauma' && /head|chest|belly/.test(w.part)) && W.ldr.Tk === 20, 'killed loader: a wound through the head or trunk'); ok(W.cdr.list.length === 0 && W.drv.list.length === 0, 'the men the report does not name have no wounds');
  ok([...W.gnr.list, ...W.ldr.list].filter(w => w.kind === 'sever').every(w => /^(fore|shin)/.test(w.part)), 'only forearms and lower legs are ever taken off');
  const L1 = { ...GORE.lookOf('ldr', W, null, 19, null) }, L2 = { ...GORE.lookOf('ldr', W, null, 25, null) }, L3 = { ...GORE.lookOf('ldr', W, null, 90, null) }; ok(!L1.down && L1.n === 0 && L2.dead && L2.downAt === 20 && L3.bleed > L2.bleed, 'the loader: unhurt before, dead after, blood still spreading');
  const G = { ...GORE.lookOf('gnr', W, { status: 'wounded' }, 15, null) }; ok(G.hurt && !G.down && G.since === 10, 'the gunner: hurt at his post since the hit'); console.log('  wounds, gunner: ' + GORE.describe('gnr', W, 30) + ' | loader: ' + GORE.describe('ldr', W, 30)); }

// ---- 3. real battles
let real = { battles: 0, hits: 0, pen: 0, hurt: 0, killed: 0, fires: 0, breach: 0, emergency: 0, hyd: 0, maxMarks: 0, maxSmoke: 0, maxGlow: 0, maxBits: 0, bad: 0 };
try {
  const req = createRequire(import.meta.url), { HK, DMG, Battle } = req((process.env.HK_ROOT || '../..') + '/tests/battle/load.js'); globalThis.DMG = DMG;
  const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg), FORCE = [{ type: 'saclos', n: 3 }, { type: 'kornet', n: 2 }, { type: 'rpg', n: 2 }, { type: 'fpv', n: 2 }];
  const tur = new THREE.Group(), hul = new THREE.Group(), root = new THREE.Group(); root.add(tur, hul); tur.rotation.y = 0.7; root.updateMatrixWorld(true);
  const planes = r => ({ g: r === 'drv' ? 'hul' : 'tur', planes: [[0.6, -0.36, -0.336, 0.12, Math.PI, 0, 0.3, 0.34], [1.196, 0.12, -0.36, 0, -Math.PI / 2, 0, 0.46, 0.36], [0.6, -0.588, -0.5, -Math.PI / 2, 0, 0, 0.3, 0.28]] });
  const fx = new FXM.InteriorFx(() => new THREE.MeshBasicMaterial(), { tur, hul }, { gnr: planes('gnr'), cdr: planes('cdr'), ldr: planes('ldr'), drv: planes('drv') });
  const finite = m => { const a = m.instanceMatrix.array; for (let i = 0; i < m.count * 16; i++) if (!Number.isFinite(a[i])) return false; return true; };
  for (let seed = 1; seed <= 10; seed++) { const b = new Battle.Battle({ cfg, lookup, biome: ['farmland', 'desert', 'town', 'forest'][seed % 4], mapSeed: 3 + (seed % 5) * 2, seed, skill: 'expert', mission: 'hold', waves: 2, force: FORCE, crewQuality: 'trained', setup: seed % 2 ? 'none' : undefined }); let n = 0;
    while (b.t < 500 && b.tank.alive && !b.over && n++ < 20000) b.step(); real.battles++;
    const hits = FXM.hitList(b), W = GORE.woundsOf(hits, b);
    for (const h of hits) { if (h.minor) continue; real.hits++; const x = EV.detail(h), B = EV.BOX[x.frame]; if (h.pen) real.pen++;
      ok(x.pIn && x.pIn.every(Number.isFinite) && x.pEnd.every(Number.isFinite), 'a real hit gives a place'); ok(x.pIn[0] >= B.x0 - 1e-6 && x.pIn[0] <= B.x1 + 1e-6 && x.pIn[1] >= B.y0 - 1e-6 && x.pIn[1] <= B.y1 + 1e-6 && x.pIn[2] >= B.z0 - 1e-6 && x.pIn[2] <= B.z1 + 1e-6, 'the mark lies on the compartment (' + h.zoneKey + ')');
      for (const r of GORE.ROLES) { const st = h.crew[r]; if (st && st !== 'ok') { st === 'killed' ? real.killed++ : real.hurt++; ok(W[r].list.some(w => w.idx === h.idx), 'a man the report hurt has a wound from that hit'); } }
      if (x.fire) real.fires++; if (x.breach) real.breach++; }
    for (const r of GORE.ROLES) ok(W[r].list.every(w => hits.some(h => h.idx === w.idx && h.crew[r] && h.crew[r] !== 'ok') || w.idx >= 900), 'no wound without a report (' + r + ')');
    // the drawing, through the whole battle in steps, as the interior drives it
    for (let t = 0; t <= b.t + 3; t += 0.37) { const keep = b.t; b.t = t; const c0 = performance.now(); const S = FXM.fxState(hits, t); b.t = keep; if (S.emergency) real.emergency++; if (S.hyd) real.hyd++; fx.update(S, true); const ms = performance.now() - c0; real.steps = (real.steps || 0) + 1; real.ms = (real.ms || 0) + ms; real.msMax = Math.max(real.msMax || 0, ms); const c = fx.cost();
      real.maxMarks = Math.max(real.maxMarks, c.marks); real.maxSmoke = Math.max(real.maxSmoke, c.smoke); real.maxGlow = Math.max(real.maxGlow, c.glow); real.maxBits = Math.max(real.maxBits, c.bits);
      if (!finite(fx.decals.mesh) || !finite(fx.bits.mesh) || !finite(fx.kit) || fx._err) real.bad++; for (const P of [fx.lit, fx.glow]) { const a = P.aP.array; for (let i = 0; i < P.mesh.count * 4; i++) if (!Number.isFinite(a[i])) { real.bad++; break; } } } }
  ok(real.bad === 0, 'drawing: bad numbers or a fault in ' + real.bad + ' steps'); ok(real.maxMarks <= 96 && real.maxSmoke <= 360 && real.maxGlow <= 220 && real.maxBits <= 160, 'drawing stays inside its pools'); ok(real.hits > 0, 'the battles produced hits');
  real.ms = +(real.ms / real.steps).toFixed(3); real.msMax = +real.msMax.toFixed(2);   /* processor time of the state and the drawing lists for one frame, in node (no graphics card work) */
  console.log('  real battles: ' + JSON.stringify(real));
} catch (e) { console.log('  real battles NOT checked: ' + (e && e.message)); fails++; }

// ---- 4. the same moment, the same answer
{ const hs = [hit({ T: 10, pen: 1, zone: 'turret_side', e: [1.7, 0.36, -0.22], d: [-1, -0.05, -0.03], reach: 2.2, comps: { gps: 'destroyed', tdrive: 'damaged' }, crew: { gnr: 'wounded' }, idx: 11 }), hit({ T: 30, pen: 1, zone: 'hull_side_f', e: [1.8, -0.52, -1.4], d: [-1, -0.03, -0.12], reach: 1.3, comps: { fuel_r: 'destroyed' }, idx: 13 })];
  const snap = t => { const S = EV.insideState(hs, t, null, null); return JSON.stringify([S.shake, S.flick, S.smoke, S.flash, S.fire, S.emergency, S.arcs.length, S.hyd && S.hyd.age, S.halon && S.halon.age, S.fires.map(f => [f.on, f.age]), S.rock, S.optics]); };
  const a = snap(12.3), b = snap(33.1), c = snap(12.3), d = snap(33.1); ok(a === c && b === d, 'the same battle time gives the same state after a later one was asked (a rewind)'); }
console.log(fails ? 'INSIDE EVENTS: ' + fails + ' FAILED' : 'INSIDE EVENTS: all checks passed'); process.exit(fails ? 1 : 0);
