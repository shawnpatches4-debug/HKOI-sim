  // split the Abrams model into hull, turret and gun by triangle, so the turret can traverse (model frame: y up, forward +z)
  function splitM1(scene, opt) {
    opt = opt || {}; const TY = opt.ty || 1.78, R2T = opt.r2 || 2.3; scene.updateMatrixWorld(true);
    const H = new THREE.Group(), T = new THREE.Group(), G = new THREE.Group(), meshes = []; scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    const v = V3(0, 0, 0), c = V3(0, 0, 0), tb = new THREE.Box3(), rb = new THREE.Box3(), hb = new THREE.Box3();
    for (const o of meshes) {
      const g = o.geometry, pos = g.attributes.position, idx = g.index, mw = o.matrixWorld, gun = /^Object_(15|7)(\.|_|$)/.test(o.name);
      if (gun) { const m = new THREE.Mesh(g, o.material); m.applyMatrix4(mw); m.castShadow = m.receiveShadow = true; G.add(m); continue; }
      const A = pos.array, den = pos.normalized ? (A instanceof Int16Array ? 32767 : A instanceof Int8Array ? 127 : A instanceof Uint16Array ? 65535 : A instanceof Uint8Array ? 255 : 1) : 1;
      const P = i => v.set(pos.getX(i) / den, pos.getY(i) / den, pos.getZ(i) / den).applyMatrix4(mw), n = idx ? idx.count : pos.count, tri = [[], []];
      for (let k = 0; k < n; k += 3) { const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, d = idx ? idx.getX(k + 2) : k + 2;
        c.copy(P(a)); c.add(P(b)); c.add(P(d)); c.multiplyScalar(1 / 3); const t = c.y > TY && Math.abs(c.x) < R2T && (opt.zmin == null || c.z > opt.zmin) && !(c.z < (opt.deckZ == null ? -2.2 : opt.deckZ) && c.y < (opt.deckY || 1.86)); tri[t ? 1 : 0].push(a, b, d); if (t) tb.expandByPoint(c); if (t && c.y < TY + .12) rb.expandByPoint(c); if (!t && c.y > TY - .1 && Math.abs(c.x) < 1.3) hb.expandByPoint(c); }
      for (const s of [0, 1]) if (tri[s].length) { const ng = new THREE.BufferGeometry(); for (const k in g.attributes) ng.setAttribute(k, g.attributes[k]); ng.setIndex(tri[s]); const m = new THREE.Mesh(ng, o.material); m.applyMatrix4(mw); m.castShadow = m.receiveShadow = true; (s ? T : H).add(m); }
    }
    return { H, T, G, tb, rb, hb };
  }
