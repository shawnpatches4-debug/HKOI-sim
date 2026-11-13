  // ================================================================ detailed main battle tank, true scale (metres; forward is -z)
  function camoTex(green) {
    const key = 'camo' + green; if (texCache[key]) return texCache[key];
    const N = 1024, tones = green ? ['#4d5636', '#3a4128', '#2c2a20', '#5d5a3f'] : ['#a8956b', '#8b7a55', '#6f604a', '#b9a77d'];
    const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d');
    x.fillStyle = tones[0]; x.fillRect(0, 0, N, N);
    for (let k = 1; k < 3; k++) { x.fillStyle = tones[k]; for (let i = 0; i < 26; i++) { x.beginPath(); const cx = r1(i, k * 9) * N, cy = r1(i + 40, k * 9) * N, rr0 = 50 + r1(i, k * 9 + 3) * 110; for (let a = 0; a <= 12; a++) { const an = a / 12 * 6.283, rad = rr0 * (.6 + .5 * r1(i * 13 + a, k)); x.lineTo(cx + Math.cos(an) * rad * 1.5, cy + Math.sin(an) * rad); } x.closePath(); x.fill(); } }
    const im = x.getImageData(0, 0, N, N), d = im.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const o = (j * N + i) * 4, nz = fbm(i * .02, j * .02, 4), g = hsh(i, j), dirt = sst(.55, 1, j / N) * .35 + sst(.62, .9, fbm(i * .006 + 3, j * .006, 3)) * .25, k = .82 + .3 * nz + .06 * g;
      for (let c = 0; c < 3; c++) { let v = d[o + c] * k; v = v * (1 - dirt) + [96, 82, 62][c] * dirt; d[o + c] = Math.max(0, Math.min(255, v)); } }
    x.putImageData(im, 0, 0);
    x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(0, i * N / 9 + 20); x.lineTo(N, i * N / 9 + 20); x.stroke(); }
    x.fillStyle = 'rgba(30,22,14,.35)'; for (let i = 0; i < 400; i++) x.fillRect(r1(i, 77) * N, r1(i, 78) * N, 1 + r1(i, 79) * 3, 2 + r1(i, 80) * 18);
    const map = new THREE.CanvasTexture(cv); map.encoding = THREE.sRGBEncoding; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
    const nc = document.createElement('canvas'); nc.width = nc.height = 256; const nx = nc.getContext('2d'), ni = nx.createImageData(256, 256), nd = ni.data;
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const h = q => fbm(q[0] * .08, q[1] * .08, 3); const a = h([i - 1, j]) - h([i + 1, j]), b = h([i, j - 1]) - h([i, j + 1]), o = (j * 256 + i) * 4; nd[o] = 128 + a * 300; nd[o + 1] = 128 + b * 300; nd[o + 2] = 255; nd[o + 3] = 255; }
    nx.putImageData(ni, 0, 0); const nrm = new THREE.CanvasTexture(nc); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set(4, 4);
    return (texCache[key] = { map, nrm });
  }
  function trackTex() {
    if (texCache.track) return texCache.track;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = '#1d1d1b'; x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 16; i++) { const y = i * 16; x.fillStyle = '#2f2e2a'; x.fillRect(2, y + 2, 60, 11); x.fillStyle = '#4a463e'; x.fillRect(4, y + 3, 56, 3); x.fillStyle = '#111'; x.fillRect(28, y + 4, 8, 7); x.fillStyle = 'rgba(110,90,60,.35)'; x.fillRect(0, y + 10, 64, 3); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 18); return (texCache.track = t);
  }
  function vehicleHD(cfg, hull) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const green = cfg.env.terrain !== 'open', ct = camoTex(green);
    const paint = new THREE.MeshStandardMaterial({ map: ct.map, normalMap: ct.nrm, normalScale: new THREE.Vector2(.35, .35), roughness: .78, metalness: .22 });
    const steel = new THREE.MeshStandardMaterial({ color: col(0x3b3d3a), roughness: .42, metalness: .75 }), dark = new THREE.MeshStandardMaterial({ color: col(0x1a1b19), roughness: .85, metalness: .3 });
    const rubber = new THREE.MeshStandardMaterial({ color: col(0x161616), roughness: .95 }), glass = new THREE.MeshStandardMaterial({ color: col(0x0a1416), roughness: .08, metalness: .9 });
    const tex = trackTex().clone(); tex.needsUpdate = true; const trackM = new THREE.MeshStandardMaterial({ map: tex, roughness: .9, metalness: .45 });
    const add = (geo, m, x, y, z, par, rx, ry, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; if (rz) o.rotation.z = rz; o.castShadow = o.receiveShadow = true; (par || body).add(o); return o; };
    // hull: lower hull between the tracks, glacis, and the decks over the tracks
    add(sideExt([[-3.95, .78], [-3.35, 1.42], [-2.1, 1.92], [3.7, 1.92], [3.95, 1.55], [3.75, .55], [-3.45, .45]], 2.3), paint, 0, 0, 0);
    for (const sx of [-1, 1]) {
      add(sideExt([[-3.75, 1.38], [-3.3, 1.5], [3.85, 1.5], [3.9, 1.38]], .72), paint, sx * 1.48, .0, 0);
      add(box(.05, .82, 7.3), paint, sx * 1.86, 1.04, -.05);   // side skirt
      for (let i = 0; i < 6; i++) add(box(.06, .8, .03), dark, sx * 1.89, 1.04, -3.4 + i * 1.25);
      add(box(.05, .2, 7.3), steel, sx * 1.865, .58, -.05);
      // running gear
      for (let i = 0; i < 7; i++) { const z = -2.75 + i * .94; add(cyl(.38, .38, .22, 22), rubber, sx * 1.62, .4, z, null, 0, 0, Math.PI / 2); add(cyl(.38, .38, .22, 22), rubber, sx * 1.38, .4, z, null, 0, 0, Math.PI / 2); add(cyl(.2, .2, .5, 12), steel, sx * 1.5, .4, z, null, 0, 0, Math.PI / 2); }
      for (let i = 0; i < 3; i++) add(cyl(.11, .11, .5, 10), steel, sx * 1.5, 1.0, -1.9 + i * 1.9, null, 0, 0, Math.PI / 2);
      add(cyl(.4, .4, .55, 14), steel, sx * 1.5, .74, 3.45, null, 0, 0, Math.PI / 2); add(cyl(.36, .36, .55, 16), steel, sx * 1.5, .62, -3.48, null, 0, 0, Math.PI / 2);
      const tr = add(sideExt([[-3.88, .62], [-3.65, .2], [-3.2, .03], [3.25, .03], [3.8, .45], [3.88, .82], [3.55, 1.17], [-3.6, 1.12]], .64), trackM, sx * 1.5, 0, 0); tr.userData.track = true;
      add(box(.25, .06, .4), steel, sx * 1.1, 1.93, -3.55); add(box(.22, .14, .1), glass, sx * 1.2, 1.7, -3.86);   // lights
      add(box(.18, .22, .14), dark, sx * .7, .9, -3.98);   // tow hooks
    }
    add(box(2.2, .5, .06), dark, 0, 1.55, 3.93); for (let i = 0; i < 8; i++) add(box(2.0, .03, .05), steel, 0, 1.36 + i * .05, 3.95);   // exhaust grille
    add(box(1.2, .06, .9), dark, 0, 1.95, 2.6);
    // turret
    const tur = new THREE.Group(); tur.position.set(0, 1.92, -.15); body.add(tur);
    add(prism([[-1.05, -2.55], [1.05, -2.55], [1.78, -1.15], [1.82, 1.35], [1.55, 2.2], [-1.55, 2.2], [-1.82, 1.35], [-1.78, -1.15]], .8), paint, 0, 0, 0, tur);
    add(prism([[-.95, -2.45], [.95, -2.45], [1.6, -1.2], [1.65, 1.3], [1.4, 2.1], [-1.4, 2.1], [-1.65, 1.3], [-1.6, -1.2]], .08), dark, 0, .8, 0, tur);
    for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) add(box(.12, .17, .3), paint, sx * (1.12 + i * .17), .22 + r * .22, -2.0 + i * .22, tur, 0, sx * .48);   // reactive armour bricks
    // bustle rack and stowage
    for (const sx of [-1, 1]) add(box(.04, .45, 1.0), steel, sx * 1.5, .55, 2.65, tur);
    add(box(3.0, .04, 1.0), steel, 0, .35, 2.65, tur); add(box(3.0, .04, .04), steel, 0, .78, 3.15, tur);
    const tarp = add(lumpy(5, 12, 8, .5), new THREE.MeshStandardMaterial({ color: col(green ? 0x3d4029 : 0x6b5e45), roughness: 1 }), -.6, .62, 2.6, tur); tarp.scale.set(.85, .3, .42);
    add(box(.6, .4, .45), new THREE.MeshStandardMaterial({ color: col(0x3e4430), roughness: .8 }), .7, .58, 2.6, tur);
    for (let i = 0; i < 2; i++) add(box(.35, .5, .18), new THREE.MeshStandardMaterial({ color: col(0x45502e), roughness: .7 }), 1.25, .62, 2.35 + i * .25, tur);
    // main gun
    const gun = new THREE.Group(); gun.position.set(0, .42, -2.55); tur.add(gun);
    add(box(.95, .55, .45), paint, 0, 0, 0, gun);
    add(cyl(.11, .12, 2.1, 18), paint, 0, 0, -1.25, gun, Math.PI / 2); add(cyl(.17, .17, .7, 18), paint, 0, 0, -2.6, gun, Math.PI / 2);
    add(cyl(.1, .1, 2.6, 18), paint, 0, 0, -4.25, gun, Math.PI / 2); add(cyl(.11, .1, .2, 18), dark, 0, 0, -5.55, gun, Math.PI / 2);
    for (let i = 0; i < 3; i++) add(cyl(.115, .115, .04, 18), dark, 0, 0, -1.0 - i * .7, gun, Math.PI / 2);
    // commander's cupola with vision blocks, loader's hatch, sights
    const cup = new THREE.Group(); cup.position.set(.65, .8, .45); tur.add(cup);
    add(cyl(.45, .5, .32, 20), paint, 0, .16, 0, cup); add(cyl(.42, .42, .06, 20), dark, 0, .35, 0, cup);
    for (let i = 0; i < 6; i++) { const a = -Math.PI * .75 + i * Math.PI * .3; add(box(.16, .1, .03), glass, Math.sin(a) * .47, .22, -Math.cos(a) * .47, cup, 0, -a); }
    add(cyl(.32, .32, .07, 18), paint, -.68 * 2, .84, .45, tur);
    add(box(.4, .38, .45), paint, -.75, .99, -1.65, tur); add(box(.3, .24, .03), glass, -.75, 1.0, -1.88, tur);   // gunner's sight
    add(box(.36, .32, .38), paint, .7, 1.1, -.6, tur); add(box(.24, .18, .03), glass, .7, 1.12, -.8, tur);
    // smoke dischargers and antennas
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const m = add(cyl(.06, .06, .34, 10), dark, sx * (1.55 + (i % 2) * .1), .62 + (i >> 1) * .14, -1.05, tur); m.rotation.x = -.55; m.rotation.z = sx * .45; }
    for (const sx of [-1, 1]) { const a = add(cyl(.012, .02, 2.8, 5), dark, sx * 1.35, 2.2, 1.9, tur); a.castShadow = false; }
    // APS: radar panels and launchers on the turret sides
    if (cfg.aps.enabled) for (const sx of [-1, 1]) { add(box(.12, .55, .9), new THREE.MeshStandardMaterial({ color: col(0x343a30), roughness: .6, metalness: .3 }), sx * 1.86, .45, .3, tur); add(box(.03, .42, .5), glass, sx * 1.93, .45, -.6, tur, 0, sx * .2); add(box(.36, .3, .5), dark, sx * 1.55, 1.0, 1.4, tur); }
    // HKOI weapon station on the roof
    const rws = new THREE.Group(); rws.position.set(-.35, .88, 1.15); tur.add(rws); rws.visible = cfg.hkoi_enabled;
    add(cyl(.32, .38, .22, 16), steel, 0, .11, 0, rws); const piv = new THREE.Group(); piv.position.y = .5; rws.add(piv);
    add(box(.42, .36, .9), new THREE.MeshStandardMaterial({ color: col(0x3a3f33), roughness: .55, metalness: .35 }), 0, 0, .05, piv);
    const brl = add(cyl(.045, .055, 2.0, 12), dark, 0, .03, -1.35, piv, Math.PI / 2); add(cyl(.07, .07, .22, 12), dark, 0, .03, -2.3, piv, Math.PI / 2);
    add(box(.34, .42, .6), paint, .4, -.02, .15, piv);   // ammunition box
    add(box(.3, .26, .34), new THREE.MeshStandardMaterial({ color: col(0x2c302a), roughness: .5, metalness: .4 }), -.38, .08, -.15, piv);
    const lens = add(cyl(.085, .085, .03, 16), new THREE.MeshStandardMaterial({ color: 0x050808, emissive: col(0x3cd2c8), emissiveIntensity: 1.2, roughness: .1 }), -.38, .08, -.33, piv, Math.PI / 2);
    add(box(.22, .14, .02), glass, -.38, -.05, -.33, piv);
    g.rotation.y = -hull * DEG;
    const wheels = []; body.traverse(o => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.rotation.z && Math.abs(o.position.x) > 1.3 && o.position.y < .8) wheels.push(o); });
    return { g, body, tur, rws, gunPivot: piv, gunBarrel: brl, bodyMat: paint, gunZ: 1.92 + .88 + .5 + .03, wheels, trackTex: tex, cupola: cup, lens };
  }
