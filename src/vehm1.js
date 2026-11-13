  // ================================================================ M1A2 SEP v3-style main battle tank, built in code to published dimensions (metres; forward is -z)
  // Hull 7.93 m, width 3.66 m, turret roof about 2.4 m, 120 mm gun, seven dual road wheels a side, rear drive sprocket, Trophy APS, a CROWS-type
  // remote weapon station carrying HKOI, blow-out panels over the bustle ammunition. Not a copy of any existing model.
  function taper(pts, h, k, ky) { // a prism whose top face is the base shrunk toward its centre (sloped armour faces); pts in (x, z)
    const n = pts.length; let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    const top = pts.map(p => [cx + (p[0] - cx) * k, cz + (p[1] - cz) * (ky == null ? k : ky)]), pos = [], idx = [];
    for (const p of pts) pos.push(p[0], 0, p[1]); for (const p of top) pos.push(p[0], h, p[1]);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j, i, n + j, n + i); }
    const tri = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tri) { idx.push(n + t[0], n + t[2], n + t[1]); idx.push(t[0], t[1], t[2]); }
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g = g.toNonIndexed(); g.computeVertexNormals();
    const uv = [], P2 = g.attributes.position; for (let i = 0; i < P2.count; i++) uv.push(P2.getX(i) * .35 + P2.getY(i) * .35, P2.getZ(i) * .35); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
  }
  function vehM1(cfg, hull) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const green = cfg.env.terrain !== 'open', ct = camoTex(green);
    const paint = new THREE.MeshStandardMaterial({ map: ct.map, normalMap: ct.nrm, normalScale: new THREE.Vector2(.35, .35), roughness: .8, metalness: .2 });
    const steel = new THREE.MeshStandardMaterial({ color: col(0x3b3d3a), roughness: .42, metalness: .75 }), dark = new THREE.MeshStandardMaterial({ color: col(0x1a1b19), roughness: .85, metalness: .3 });
    const rubber = new THREE.MeshStandardMaterial({ color: col(0x161616), roughness: .95 }), glass = new THREE.MeshStandardMaterial({ color: col(0x0a1416), roughness: .08, metalness: .9 });
    const canvasM = new THREE.MeshStandardMaterial({ color: col(green ? 0x4a4c34 : 0x7a6a4c), roughness: 1 });
    const tex = trackTex().clone(); tex.needsUpdate = true; const trackM = new THREE.MeshStandardMaterial({ map: tex, roughness: .9, metalness: .45 });
    const add = (geo, m, x, y, z, par, rx, ry, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; if (rz) o.rotation.z = rz; o.castShadow = o.receiveShadow = true; (par || body).add(o); return o; };
    const HT = 1.6;   // hull roof
    // ---- hull: long shallow glacis, flat deck, sloped rear
    add(sideExt([[-3.96, .9], [-3.72, 1.22], [-1.75, HT], [3.75, HT], [3.95, 1.3], [3.8, .58], [-3.55, .48]], 2.2), paint, 0, 0, 0);
    for (const sx of [-1, 1]) add(sideExt([[-3.8, 1.3], [-1.75, HT - .02], [3.82, HT - .02], [3.9, 1.32]], .74), paint, sx * 1.47, 0, 0);
    add(box(.9, .05, .55), dark, 0, HT - .04, -2.35, null, -.1);   // driver's hatch
    for (let i = 0; i < 3; i++) add(box(.16, .07, .06), glass, -.25 + i * .25, HT - .01, -2.66, null, -.3);   // driver's periscopes
    add(box(2.6, .05, 2.2), dark, 0, HT + .005, 2.55); for (let i = 0; i < 9; i++) add(box(2.5, .02, .04), steel, 0, HT + .03, 1.6 + i * .24);   // engine deck grilles
    add(box(2.4, .55, .06), dark, 0, 1.25, 3.93); for (let i = 0; i < 10; i++) add(box(2.3, .025, .05), steel, 0, 1.03 + i * .05, 3.96);   // turbine exhaust
    for (const sx of [-1, 1]) {
      // skirts: heavy armoured front sections, lighter rear
      for (let i = 0; i < 7; i++) { const z = -3.55 + i * 1.04, hv = i < 3; add(box(hv ? .12 : .05, .86, 1.0), paint, sx * (1.86 + (hv ? .04 : 0)), 1.12, z); add(box(.03, .86, .02), dark, sx * (1.9 + (hv ? .05 : 0)), 1.12, z + .5); }
      add(box(.05, .1, 7.3), steel, sx * 1.865, 1.58, -.05);
      // running gear: idler front, seven dual road wheels, two return rollers, drive sprocket at the rear
      for (let i = 0; i < 7; i++) { const z = -2.85 + i * .95; add(cyl(.32, .32, .2, 22), rubber, sx * 1.66, .36, z, null, 0, 0, Math.PI / 2); add(cyl(.32, .32, .2, 22), rubber, sx * 1.36, .36, z, null, 0, 0, Math.PI / 2); add(cyl(.17, .17, .52, 12), steel, sx * 1.51, .36, z, null, 0, 0, Math.PI / 2); }
      for (const z of [-1.45, 1.35]) add(cyl(.12, .12, .5, 10), steel, sx * 1.51, 1.1, z, null, 0, 0, Math.PI / 2);
      add(cyl(.34, .34, .5, 18), steel, sx * 1.51, .62, -3.6, null, 0, 0, Math.PI / 2);
      const spr = add(cyl(.4, .4, .5, 22), steel, sx * 1.51, .78, 3.55, null, 0, 0, Math.PI / 2); for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2; add(box(.5, .09, .07), dark, 0, Math.cos(a) * .42, Math.sin(a) * .42, spr, a); }
      const tr = add(sideExt([[-3.95, .6], [-3.72, .18], [-3.3, .02], [3.4, .02], [3.95, .5], [4.0, .85], [3.62, 1.2], [-3.7, 1.0]], .64), trackM, sx * 1.51, 0, 0); tr.userData.track = true;
      add(box(.28, .14, .1), glass, sx * 1.25, 1.42, -3.82); add(box(.34, .2, .14), dark, sx * 1.25, 1.42, -3.75);   // headlight guards
      add(box(.2, .24, .16), dark, sx * .75, .95, -3.92);   // tow eyes
      add(box(.3, .4, .5), canvasM, sx * 1.3, HT + .2, 3.2); add(box(.06, .3, .9), steel, sx * 1.62, HT + .15, 3.0);   // rear deck stowage
    }
    // ---- turret: long angular faces, recessed mantlet, bustle at the rear
    const tur = new THREE.Group(); tur.position.set(0, HT, -.35); body.add(tur);
    const plan = [[-.62, -2.75], [.62, -2.75], [1.78, -2.25], [1.88, -.7], [1.88, 1.3], [1.72, 3.05], [-1.72, 3.05], [-1.88, 1.3], [-1.88, -.7], [-1.78, -2.25]];
    add(taper(plan, .78, .93, .97), paint, 0, 0, 0, tur);
    add(taper(plan.map(p => [p[0] * .985, p[1] * .985]), .03, .95), dark, 0, .78, 0, tur);
    // bustle rack, stowage, and the ammunition blow-out panels
    for (const sx of [-1, 1]) { add(box(.04, .42, 1.5), steel, sx * 1.8, .55, 2.2, tur); add(box(.04, .04, 1.5), steel, sx * 1.8, .76, 2.2, tur); }
    add(box(3.5, .04, .04), steel, 0, .76, 3.35, tur); for (let i = 0; i < 5; i++) add(box(.04, .45, .04), steel, -1.6 + i * .8, .55, 3.35, tur);
    const bags = []; for (let i = 0; i < 4; i++) { const b = add(lumpy(7 + i, 10, 8, .45), canvasM, -1.2 + i * .8, .5, 3.15, tur); b.scale.set(.42, .26, .24); bags.push(b); }
    const panels = []; for (const sx of [-1, 1]) { const p = new THREE.Group(); p.position.set(sx * .62, .815, 2.15); tur.add(p); add(box(1.0, .04, 1.4), paint, 0, 0, 0, p); for (let i = 0; i < 4; i++) add(box(.06, .03, .06), steel, (i % 2 - .5) * .85, .03, (i < 2 ? -.6 : .6), p); panels.push(p); }
    // gun mantlet and 120 mm gun with thermal shroud, bore evacuator and muzzle reference sensor
    const gun = new THREE.Group(); gun.position.set(0, .45, -2.72); tur.add(gun);
    add(box(1.0, .6, .3), paint, 0, 0, .05, gun); add(cyl(.2, .22, .5, 18), paint, 0, 0, -.25, gun, Math.PI / 2);
    add(cyl(.105, .12, 2.4, 18), paint, 0, 0, -1.65, gun, Math.PI / 2); add(cyl(.17, .17, .65, 18), paint, 0, 0, -3.0, gun, Math.PI / 2);
    add(cyl(.1, .1, 1.95, 18), paint, 0, 0, -4.3, gun, Math.PI / 2); add(cyl(.115, .1, .12, 18), dark, 0, 0, -5.3, gun, Math.PI / 2);
    for (let i = 0; i < 4; i++) add(cyl(.12, .12, .035, 18), dark, 0, 0, -.95 - i * .55, gun, Math.PI / 2);
    add(box(.12, .1, .14), dark, 0, .17, -5.15, gun);
    add(box(.22, .18, .9), paint, .38, .16, -.25, gun); add(cyl(.03, .03, .4, 8), dark, .38, .16, -.85, gun, Math.PI / 2);   // coaxial gun housing
    // gunner's primary sight "doghouse" (right front) and the commander's independent thermal viewer (left front)
    add(taper([[-.33, -.3], [.33, -.3], [.33, .32], [-.33, .32]], .42, .9), paint, .78, .78, -1.75, tur); add(box(.5, .3, .03), glass, .78, 1.0, -2.06, tur, -.35);
    const citv = new THREE.Group(); citv.position.set(-.85, .8, -1.25); tur.add(citv); add(cyl(.16, .2, .55, 14), paint, 0, .27, 0, citv); add(box(.42, .34, .42), paint, 0, .7, 0, citv); add(box(.3, .2, .03), glass, 0, .72, -.215, citv); add(box(.46, .05, .46), dark, 0, .89, 0, citv);
    // commander's cupola (right) under the remote weapon station; loader's hatch and gun shield (left)
    const cup = new THREE.Group(); cup.position.set(.62, .8, .15); tur.add(cup);
    add(cyl(.46, .5, .22, 20), paint, 0, .11, 0, cup); add(cyl(.42, .42, .05, 20), dark, 0, .24, 0, cup);
    for (let i = 0; i < 6; i++) { const a = -Math.PI + i * Math.PI / 3; add(box(.15, .08, .03), glass, Math.sin(a) * .49, .13, -Math.cos(a) * .49, cup, 0, -a); }
    const lh = new THREE.Group(); lh.position.set(-.68, .82, .35); tur.add(lh); add(cyl(.34, .34, .06, 18), paint, 0, .03, 0, lh);
    const shield = new THREE.Group(); shield.position.set(-.68, .82, .0); tur.add(shield);
    add(box(.9, .5, .04), paint, 0, .35, -.25, shield); for (const sx of [-1, 1]) add(box(.04, .5, .5), paint, sx * .45, .35, 0, shield, 0, sx * .25); add(box(.3, .1, .03), glass, 0, .52, -.27, shield);
    add(box(.1, .1, .75), dark, 0, .45, -.45, shield); add(cyl(.025, .025, .5, 8), dark, 0, .45, -1.0, shield, Math.PI / 2);
    // smoke grenade launchers either side of the mantlet, antennas and the wind sensor at the rear
    for (const sx of [-1, 1]) { const sg = new THREE.Group(); sg.position.set(sx * 1.55, .55, -1.95); sg.rotation.y = sx * .7; tur.add(sg); add(box(.38, .28, .2), paint, 0, 0, 0, sg); for (let i = 0; i < 6; i++) { const m = add(cyl(.045, .045, .2, 10), dark, -.14 + (i % 3) * .14, -.06 + Math.floor(i / 3) * .12, -.14, sg, Math.PI / 2 - .5); } }
    for (const sx of [-1, 1]) { const a = add(cyl(.012, .02, 3.0, 5), dark, sx * 1.2, 2.3, 2.6, tur); a.castShadow = false; }
    add(cyl(.02, .02, .55, 6), dark, 0, 1.06, 2.75, tur); add(box(.12, .04, .12), dark, 0, 1.35, 2.75, tur);
    // Trophy APS: launcher and radar housings on both turret sides, counterweight boxes on the bustle
    const trophy = [];
    if (cfg.aps.enabled) for (const sx of [-1, 1]) { const tg = new THREE.Group(); tg.position.set(sx * 1.98, .42, -.35); tur.add(tg); trophy.push(tg);
      add(box(.42, .62, 1.1), new THREE.MeshStandardMaterial({ color: col(green ? 0x4f5536 : 0x8f7f5c), roughness: .7, metalness: .3 }), 0, 0, 0, tg);
      add(new THREE.SphereGeometry(.24, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark, sx * .05, .31, .15, tg);   // countermeasure launcher
      for (const fz of [-1, 1]) { const rp = add(box(.38, .4, .05), new THREE.MeshStandardMaterial({ color: col(0x2b302a), roughness: .5, metalness: .4 }), sx * .05, .02, fz * .57, tg); rp.rotation.y = sx * fz * .45; }
      add(box(.36, .4, .55), paint, sx * -.08, .1, 2.9 - (-.35), tg); }
    // HKOI on a CROWS-type remote weapon station over the commander's hatch
    const rws = new THREE.Group(); rws.position.set(.62, 1.06, .15); tur.add(rws); rws.visible = cfg.hkoi_enabled;
    add(cyl(.3, .36, .18, 16), steel, 0, .09, 0, rws); const piv = new THREE.Group(); piv.position.y = .45; rws.add(piv);
    for (const sx of [-1, 1]) add(box(.06, .5, .45), new THREE.MeshStandardMaterial({ color: col(0x3a3f33), roughness: .55, metalness: .35 }), sx * .3, -.12, 0, rws);
    add(box(.42, .32, .9), new THREE.MeshStandardMaterial({ color: col(0x3a3f33), roughness: .55, metalness: .35 }), 0, 0, .05, piv);
    const brl = add(cyl(.045, .055, 2.0, 12), dark, 0, .03, -1.35, piv, Math.PI / 2); add(cyl(.07, .07, .22, 12), dark, 0, .03, -2.3, piv, Math.PI / 2);
    add(box(.34, .4, .55), paint, .38, -.02, .15, piv);
    add(box(.3, .26, .34), new THREE.MeshStandardMaterial({ color: col(0x2c302a), roughness: .5, metalness: .4 }), -.38, .1, -.15, piv);
    const lens = add(cyl(.085, .085, .03, 16), new THREE.MeshStandardMaterial({ color: 0x050808, emissive: col(0x3cd2c8), emissiveIntensity: 1.2, roughness: .1 }), -.38, .1, -.33, piv, Math.PI / 2);
    add(box(.22, .14, .02), glass, -.38, -.03, -.33, piv);
    g.rotation.y = -hull * DEG;
    const wheels = []; body.traverse(o => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.rotation.z && Math.abs(o.position.x) > 1.3 && o.position.y < .8 && o.parent === body) wheels.push(o); });
    // hatch positions (world offsets inside the vehicle group) for the crew bailing out
    const hatches = { cdr: V3(.62, HT + 1.0, -.2), ldr: V3(-.68, HT + .85, 0), gnr: V3(.62, HT + 1.0, -.2), drv: V3(0, HT, -2.35) };
    return { g, body, tur, rws, gunPivot: piv, gunBarrel: brl, gun, bodyMat: paint, gunZ: HT + 1.06 + .45, wheels, trackTex: tex, cupola: cup, lens, panels, bags, trophy, hatches, HT };
  }
