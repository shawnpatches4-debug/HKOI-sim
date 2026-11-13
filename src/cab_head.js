  // ================================================================ inside the turret: the commander's station
  const GFX = window.__gfx = { sky: null, cloud: null, crew_gunner: null, crew_loader: null, crew_driver: null, m1: null, loader: !!THREE.GLTFLoader, t0: Date.now() }, G = (k, v) => { GFX[k] = v; };
  const ASSET = { base: 'assets/', env: null, cloud: null, crew: {}, started: false, cbs: [] };
  function loadAssets(R, q) {
    if (ASSET.started) return; ASSET.started = true; const done = () => ASSET.cbs.forEach(f => { try { f(); } catch (e) {} });
    try { new THREE.TextureLoader().load(ASSET.base + 'sky_field.png', tx => { G('sky', 1); tx.encoding = THREE.sRGBEncoding; tx.mapping = THREE.EquirectangularReflectionMapping; try { const pm = new THREE.PMREMGenerator(R); ASSET.env = pm.fromEquirectangular(tx).texture; pm.dispose(); tx.dispose(); done(); } catch (e) {} }, undefined, () => { G('sky', 0); }); } catch (e) {}
    try { new THREE.TextureLoader().load(ASSET.base + 'cloud.webp', tx => { ASSET.cloud = tx; G('cloud', 1); done(); }, undefined, () => { G('cloud', 0); }); } catch (e) {}
    if (THREE.GLTFLoader && q >= 1) loadM1();
    if (THREE.GLTFLoader) for (const k of ['gunner', 'loader', 'driver']) { try { new THREE.GLTFLoader().load(ASSET.base + `crew_${k}.json`, gl => { gl.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) { const m = o.material, n = m.name || ''; m.envMapIntensity = .5;
      // tank crew, not infantry: coveralls instead of camouflage, a dark crewman's helmet, no knife or sidearm on show
      if (/_body$/.test(n)) { m.color.setHex(0x9aa07c); m.roughness = .95; } else if (/_helmet$/.test(n)) { m.color.setHex(0x4a4d42); m.roughness = .6; } else if (/_equipment$/.test(n)) { m.color.setHex(0x8d8468); } else if (/knife|pistol/.test(n)) o.visible = false; } } }); ASSET.crew[k] = gl.scene; G('crew_' + k, 1); done(); }, undefined, () => { G('crew_' + k, 0); }); } catch (e) {} }
  }
  function loadM1() { if (ASSET.m1 || ASSET.m1Started || !THREE.GLTFLoader) return; ASSET.m1Started = true;
    try { new THREE.GLTFLoader().load(ASSET.base + 'm1/m1.json', gl => { gl.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); ASSET.m1 = gl.scene; G('m1', 1); ASSET.cbs.forEach(f => { try { f(); } catch (e) {} }); }, undefined, () => { G('m1', 0); }); } catch (e) {} }
  const SEAT = { 'L_Thigh': [[0, 0, 1], 90], 'R_Thigh': [[0, 0, 1], 90], 'L_Calf': [[0, 0, 1], -90], 'R_Calf': [[0, 0, 1], -90], 'L_UpperArm': [[0, 0, 1], -55], 'R_UpperArm': [[0, 0, 1], -55], 'L_Forearm': [[0, 0, 1], -45], 'R_Forearm': [[0, 0, 1], -45] };
  function Avatar(src, extra) {
    const g = new THREE.Group(), m = src; g.add(m); const B = {};
    m.traverse(o => { if (o.isBone) B[o.name.replace(/^Bip01_/, '')] = o; });
    const pose = Object.assign({}, SEAT, extra || {});
    for (const [k, [ax, a]] of Object.entries(pose)) if (B[k]) B[k].rotateOnAxis(V3(...ax).normalize(), a * DEG);
    const base = {}; for (const k in B) base[k] = B[k].quaternion.clone();
    const qa = new THREE.Quaternion();
    return { g, B, hide(k) { if (B[k]) B[k].scale.setScalar(.001); }, place(head) { g.updateMatrixWorld(true); const h = new THREE.Vector3(); B.Head.getWorldPosition(h); g.position.add(head.clone().sub(h)); },
      pose(dyn) { for (const k in base) B[k].quaternion.copy(base[k]); for (const [k, ax, a] of dyn) if (B[k] && a) { qa.setFromAxisAngle(ax, a); B[k].quaternion.multiply(qa); } } };
  }
