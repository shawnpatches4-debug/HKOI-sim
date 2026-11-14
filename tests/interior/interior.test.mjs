// dry run of the interior in node (no drawing): builds it, then runs the per-frame update, the seat cameras, picking and every control
// through made-up battle states at several frame rates. Catches exceptions and bad numbers; proves the timing is frame-rate independent.
const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? (s => ({ width: String(s).length * 14 })) : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : k === 'createImageData' ? ((w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })) : (typeof k === 'string' ? (() => {}) : undefined), set: () => true });
const el = () => ({ width: 0, height: 0, getContext: () => ctx, style: {}, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
globalThis.document = { createElement: el, body: { appendChild() {} }, getElementById: () => el() };
const THREE = await import('three');
const { Interior } = await import('./render/interior.js');
const { SEATS, DIM, IND } = await import('./render/interior_build.js');
function rig() {
  const tank = { group: new THREE.Group(), body: new THREE.Group(), turret: new THREE.Group(), model: new THREE.Group(), turretYaw: 0, recoil: 0 };
  tank.group.add(tank.model); tank.model.add(tank.body); tank.body.add(tank.turret); tank.turret.position.set(0, 1.617, -0.025);
  const ext = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()); tank.body.add(ext);
  const renderer = { toneMappingExposure: 0.62, localClippingEnabled: false, info: { render: { calls: 0 } }, _rt: null, getRenderTarget() { return this._rt; }, setRenderTarget(t) { this._rt = t; }, render() { this.info.render.calls += 50; } };
  const scene = { canvas: el(), renderer, camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 30000), world: { h: () => 0 }, quality: 'medium', scene: new THREE.Scene(), fx: { mat: { uniforms: { scale: { value: 600 } } } } };
  scene.scene.add(tank.group);
  const cams = { mode: 'orbit', snap: true };
  const T = { e: 100, n: 200, h: 30, v: 0, alive: true, main: 18, ap: 24, loaded: true, loadT: 0, st: { obs: 150, he: 150, apsL: 3, apsR: 3 }, ai: { ldr: { up: false } } };
  const battle = { t: 0, tank: T, _rf: null, _volleyActive: () => battle.va, va: false, _targets: () => battle.tg || [] };
  const volleys = { info: [], aimAt: null, assetBase: 'assets/' };
  // made-up hits: a Trophy shot, a hit the armour stops, a penetration that wounds the gunner and breaks his sight, a killing hit
  battle.interiorHits = [{ T: 16, minor: true, pen: false, kill: false, s: 0.3, comps: {}, crew: {}, idx: 1 }, { T: 21, pen: false, kill: false, minor: false, s: 1, e: new THREE.Vector3(1.7, 0.4, -0.2), d: new THREE.Vector3(-1, 0, 0), comps: {}, crew: {}, idx: 2 },
    { T: 36, pen: true, kill: false, minor: false, s: 1.6, e: new THREE.Vector3(1.7, 0.4, -0.4), d: new THREE.Vector3(-1, -0.03, 0.1).normalize(), comps: { gps: 'destroyed', citv: 'damaged', gnr: 'damaged' }, crew: { gnr: 'wounded', cdr: 'ok', ldr: 'ok', drv: 'ok' }, idx: 3 },
    { T: 55, pen: true, kill: true, minor: false, s: 2, e: new THREE.Vector3(0, 0.4, -2.4), d: new THREE.Vector3(0, -0.03, 1).normalize(), comps: { ldr: 'destroyed' }, crew: { ldr: 'killed', gnr: 'ok', cdr: 'ok', drv: 'ok' }, idx: 4 }];
  // a made-up crew: steady, then strained, shaken, the driver panicked, the gunner wounded, the loader down, then bailed out
  battle.crewState = () => { const t = battle.t, st = t < 12 ? 'steady' : t < 20 ? 'strained' : t < 30 ? 'shaken' : 'steady', who = {}; for (const r of ['cdr', 'gnr', 'ldr', 'drv']) who[r] = { name: r, stress: Math.min(1, t / 60), state: r === 'drv' && t > 30 && t < 40 ? 'panicked' : st, stress_level: 0, why: null, busy: null, status: r === 'gnr' && t > 36 ? 'wounded' : r === 'ldr' && t > 55 ? 'down' : 'ok' };
    return { on: true, quality: 'trained', buttoned: t > 10 && t < 44, abandoned: t > 58.5, level: 0, who }; };
  const I = new Interior(scene, tank, cams);
  return { I, tank, scene, cams, battle, T, volleys };
}
// one scripted minute: lay, fire, reload with the door, a volley with HKOI firing, the loader up, a knock-out
function script(R, t) {
  const { battle: B, T, volleys: V, tank } = R; B.t = t; tank.turretYaw = Math.min(60, t * 40); T.v = t > 30 && t < 40 ? 6 : 0; T.h = 30 + (t > 32 && t < 36 ? (t - 32) * 20 : 0);
  B._rf = t > 2 && t < 6 ? { k: { e: 900, n: 700 }, R: 1280, at: 6 } : null; B.tg = t > 1 ? [{ los: true, k: { e: 900, n: 700 } }] : [];
  if (t >= 6 && T.main === 18) { T.main = 17; T.loaded = false; T.loadT = 0; }
  if (!T.loaded && t >= 6) { T.loadT = Math.min(6, t - 6); if (T.loadT >= 6) { T.loaded = true; T.loadT = 0; } }
  B.va = t > 14 && t < 24; V.info = B.va ? [{ tt: { short: 'Kornet' }, range: 2400 - (t - 14) * 200, brg: 134, cued: t > 15, tracked: t > 16 }, { tt: { short: 'FPV' }, range: 900, brg: 350, drone: true }] : [];
  V.aimAt = t > 17 && t < 20 ? new THREE.Vector3(300, 20, -400) : null; tank.recoil = t > 18 && t < 19 ? 0.12 * ((t * 7) % 1) : 0;
  T.ai.ldr.up = t > 42 && t < 48; T.alive = t < 55;
}
// the crew: bone trees read straight from the model files (no drawing needed to test how they move)
const fs = await import('node:fs'), ASSETS = process.env.HK_ASSETS || '';
function boneTree(file) { const d = JSON.parse(fs.readFileSync(file, 'utf8')), N = d.nodes.map(n => { const b = new THREE.Bone(); b.name = (n.name || '').replace(/ /g, '_'); if (n.translation) b.position.fromArray(n.translation); if (n.rotation) b.quaternion.fromArray(n.rotation); if (n.scale) b.scale.fromArray(n.scale); if (n.matrix) { new THREE.Matrix4().fromArray(n.matrix).decompose(b.position, b.quaternion, b.scale); } return b; });
  d.nodes.forEach((n, i) => (n.children || []).forEach(c => N[i].add(N[c]))); const root = new THREE.Group(); for (const i of d.scenes[d.scene || 0].nodes) root.add(N[i]); return root; }
const haveCrew = ASSETS && ['gunner', 'loader', 'driver'].every(k => fs.existsSync(`${ASSETS}/crew/crew_${k}.json`));
const { CrewFigures } = await import('./render/interior_crewfig.js');
const crewOf = I => { const m = k => boneTree(`${ASSETS}/crew/crew_${k}.json`); const c = new CrewFigures(null, { tur: I.tur, hul: I.hul }, null, { gunner: m('gunner'), loader: m('loader'), driver: m('driver'), gunner2: m('gunner') }); c.measure = true; return c; };
const SAMPLE = [9.5, 18.5, 26, 37.5, 47, 56.5], samples = {}, LSAMPLE = [42.3, 42.9, 43.4, 43.9, 44.4, 45, 45.8, 47, 48.3, 48.9, 49.6, 50.5], lsamp = {};
let fails = 0; const finals = [];
for (const fps of [30, 60, 144, 240]) {
  const R = rig(), { I, cams } = R, dt = 1 / fps, modes = ['in_gnr', 'in_cdr', 'in_ldr', 'in_drv', 'cut']; const crew = { jump: 0, hand: 0, bad: 0 }; let shakeMax = 0, smoke37 = null, smoke45 = null, crewBad = 0, crewInst = 0, bloodEnd = '', flick21 = null; let maxDoor = 0, maxRec = 0, maxHatch = 0, sawFire = 0, sawWarn = 0, nb = 0, sight = 0, at8 = null, maxThr = 0, maxSteer = 0, maxCup = 0, gearD = 0;
  for (let i = 0, t = 0; t < 60; i++, t = i * dt) {
    cams.mode = t > 41 && t < 51.5 ? 'in_ldr' : modes[Math.floor(t / 4) % 5]; script(R, t);   /* the loader's climb to his machine gun and back (t 42 to 48 and after) is watched from his own seat */
    try { I.update(dt, { on: true, battle: R.battle, shown: { e: 100, n: 200, h: R.T.h }, volleys: R.volleys, cond: t > 50 ? 'night' : 'day', playing: true, speed: 1 }); if (I.owns(cams.mode)) I.drive(cams, dt); cams.snap = false; }
    catch (e) { fails++; if (fails < 4) console.log('EXCEPTION at t', t.toFixed(2), cams.mode, e.stack.split('\n').slice(0, 3).join(' | ')); }
    if (!I.built) continue;
    for (const st of LSAMPLE) if (Math.abs(t - st) < dt / 2) (lsamp[st] = lsamp[st] || {})[fps] = [R.scene.camera.position.clone(), I.st.ldrU, I.st.hatch];
    if (haveCrew && (!I.crewFig || !I.crewFig.measure)) { I.crewFig = crewOf(I); if (fps === 30 && !globalThis._said) { globalThis._said = 1; console.log('crew skeletons ready:', I.crewFig.ready, 'failed:', I.crewFig.failed, 'men:', Object.keys(I.crewFig.men).join(',')); } }
    if (haveCrew && I.crewFig.ready && t > 0.5) { for (const k in I.crewFig.men) { const m = I.crewFig.men[k]; if (!m.g.visible) continue; crew.jump = Math.max(crew.jump, m.speedJump * (fps / 60)); if (k === 'gnr' || k === 'drv') crew.hand = Math.max(crew.hand, m.handErr[0], m.handErr[1]); for (const q of m.draw) if (!Number.isFinite(q.x + q.y + q.z + q.w)) crew.bad++; }
      for (const st of SAMPLE) if (Math.abs(t - st) < dt / 2) (samples[st] = samples[st] || {})[fps] = Object.values(I.crewFig.men).map(m => m.draw.map(q => q.clone())); }
    maxDoor = Math.max(maxDoor, I.st.door); maxRec = Math.max(maxRec, I.part.breech.position.z - I.part.breech.userData.home.z); maxHatch = Math.max(maxHatch, I.st.hatch); if (I.hkState === 'FIRING') sawFire++; if (I.warning) sawWarn++;
    maxThr = Math.max(maxThr, I.st.thr); maxSteer = Math.max(maxSteer, Math.abs(I.st.steer)); maxCup = Math.max(maxCup, I.st.cup1 + I.st.cup2); if (I.st.gear > 0.9) gearD++;
    if (Math.abs(t - 26) < dt / 2) I.setCupolaHatch(1); if (Math.abs(t - 28) < dt / 2) I.setCupolaHatch(2); if (Math.abs(t - 30) < dt / 2) I.setCupolaHatch(0);
    if (I.fxS) { shakeMax = Math.max(shakeMax, I.fxS.shake); if (Math.abs(t - 37) < dt / 2) smoke37 = +I.smoke.toFixed(3); if (Math.abs(t - 45) < dt / 2) smoke45 = +I.smoke.toFixed(3); if (Math.abs(t - 21.2) < dt / 2) flick21 = +I.fxS.flick.toFixed(2); bloodEnd = Object.keys(I.fxS.blood).sort().join('+') + (I.fx.stains.gnr.visible ? ':gnrStain' : '') + (I.fx.stains.ldr.visible ? ':ldrStain' : ''); }
    if (I.crewFig && i % 7 === 0) for (const k in I.crewFig.mesh) { const m = I.crewFig.mesh[k]; crewInst = Math.max(crewInst, m.count); const a = m.instanceMatrix.array; for (let q = 0; q < m.count * 16; q++) if (!Number.isFinite(a[q])) crewBad++; }
    if (Math.abs(t - 8) < dt / 2) at8 = [I.st.door.toFixed(2), I.part.round.visible, I.part.block.position.y.toFixed(2)];
    const c = R.scene.camera; for (const v of [c.position.x, c.position.y, c.position.z, c.quaternion.w, I.head.z, I.head.x]) if (!Number.isFinite(v)) nb++;
    if (i % 97 === 0 && I.inside) { const p = I.pick(0, 0); if (p) I.describe(p); }
  }
  for (const c of I.controls) { const s = I.operate(c); if (typeof s !== 'string') fails++; }
  for (let i = 0; i < 40; i++) I.update(dt, { on: true, battle: R.battle, shown: { e: 100, n: 200, h: 30 }, volleys: R.volleys, cond: 'night', playing: false, speed: 1 });
  I.turnHead(500, -300); I.zoomBy(-900); cams.mode = 'in_cdr'; I.update(dt, { on: true, battle: R.battle, shown: { e: 100, n: 200, h: 30 }, volleys: R.volleys, cond: 'day', playing: true, speed: 1 }); I.drive(cams, dt);
  cams.mode = 'orbit'; I.update(dt, { on: true, battle: R.battle, shown: { e: 100, n: 200, h: 30 }, volleys: R.volleys, cond: 'day', playing: true, speed: 1 });
  const out = { fps, doorMax: +maxDoor.toFixed(3), recoilMax: +maxRec.toFixed(3), hatchMax: +maxHatch.toFixed(3), throttleMax: +maxThr.toFixed(2), steerMax: +maxSteer.toFixed(2), cupolaHatchMax: +maxCup.toFixed(2), inGearS: +(gearD * dt).toFixed(1), sightDraws: I.stats.sightDraws, shakeMax: +shakeMax.toFixed(2), flickAfterStoppedHit: flick21, smoke1sAfterPenetration: smoke37, smoke9sAfter: smoke45, blood: bloodEnd, crewTriangles: I.stats.crewTriangles, crewJointSpeedJump60: +crew.jump.toFixed(3), crewHandOffControlMm: +(crew.hand * 1000).toFixed(1), crewBad: crew.bad, crewBadNumbers: crewBad, alarmAtEnd: I.alarm, firingS: +(sawFire * dt).toFixed(2), warningS: +(sawWarn * dt).toFixed(2), at8, badNumbers: nb, sightCalls: I.stats.sightCalls, leftScene: !I.tur.parent && !I.hul.parent && !I.active, near: R.scene.camera.near };
  finals.push(out); console.log(JSON.stringify(out));
}
if (haveCrew) { let worst = 0; for (const st of SAMPLE) { const S = samples[st]; if (!S || !S[30] || !S[240]) continue; for (const f of [60, 144, 240]) if (S[f]) S[f].forEach((man, mi) => man.forEach((q, j) => { const a = q.angleTo(S[30][mi][j]); if (a > worst) worst = a; })); }
  console.log(`crew: largest difference of any joint between 30 and 60/144/240 frames a second at ${SAMPLE.length} sampled moments: ${(worst * 180 / Math.PI).toFixed(2)} degrees`); } else console.log('crew: model files not on this machine (set HK_ASSETS): crew motion NOT tested');
{ let worst = 0, path = []; for (const st of LSAMPLE) { const S = lsamp[st]; if (!S || !S[30]) continue; path.push(`${st}s U=${S[30][1].toFixed(2)} lid=${S[30][2].toFixed(2)}`); for (const f of [60, 144, 240]) if (S[f]) worst = Math.max(worst, S[f][0].distanceTo(S[30][0])); }
  console.log(`loader's climb, his own eyes: largest difference of the camera's place between 30 and 60/144/240 frames a second at ${LSAMPLE.length} moments: ${(worst * 1000).toFixed(1)} mm   (${path.join(', ')})`); }
const I = rig().I; I._build();
console.log('stats', JSON.stringify(I.stats), 'exceptions/failures', fails, 'indicator lights', Object.keys(IND).length, 'labels full', I.labels.full);
if (process.env.LIST) for (const c of I.controls) console.log((c.locked ? 'crew ' : 'FREE ') + c.g + ' ' + c.type.padEnd(7) + c.name);
