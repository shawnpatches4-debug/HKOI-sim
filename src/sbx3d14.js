  // ================================================================ true-scale sandbox renderer (1 unit = 1 m)
  function vehicleFor(cfg, hull) {
    const keep = [bodyMat, bodyCol, rws, gunPivot, gunBarrel, HV, tank], r0 = rec;
    rec = { ctx: { hull } }; const g = vehicle(cfg); const out = { g, bodyMat, rws, gunPivot, gunBarrel, HV, tank };
    [bodyMat, bodyCol, rws, gunPivot, gunBarrel, HV, tank] = keep; rec = r0; return out;
  }
  const FOGM = { clear: .00009, haze: .00026, rain: .00045, dust: .0008, fog: .0019 };
  function Sandbox3D(canvas, labelsEl) {
    let R2, sc, cm, gc, lc, sky2, sun2, hemi2, bl2, post2 = null, root2, smk, fir, rib, q2 = window.__hkq != null ? window.__hkq : (Math.min(innerWidth, innerHeight) < 520 ? 1 : 2), W2 = 0, H2 = 0, ok2 = false, cur = null;
    let rc = null, cf = null, V = null, Lm = [], Ms = [], labs = [], bumps2 = [], wxs = null, sunD = V3(0, 1, 0), maxRS = 3000, carbonS = true, camP2 = null, camL2 = null, camF2 = 50, gunB2 = 0, gunE2 = 0, wallS = 0;
    let orbA = 0, orbE = 22, orbD = 70, dragS = null, pip = true, overlay2 = true, ovUser = true, vol = null, cab = null, bail = null, dmg = null, turB = null, grass = null, lookY = 0, lookP = 0, wheelA = 0, tPrev = null, pcam = null;
    const tmpA = V3(0, 0, 0), tmpB = V3(0, 0, 0), tmpC = V3(0, 0, 0);
    const hS = (x, z) => { const r = Math.hypot(x, z); let h = (fbm(x * .0035 + 5, z * .0035, 3) - .5) * 1.4 * sst(25, 120, r) + sst(5500, 11000, r) * (fbm(x * .00035 + 2, z * .00035, 4) * 520 - 90); for (const b of bumps2) { const dx = x - b.x, dz = z - b.z, d2 = dx * dx + dz * dz; if (d2 < 9 * b.s2) h = Math.max(h, b.h * Math.exp(-d2 / b.s2)); } return h; };
    function init() {
      if (ok2) return true; if (typeof THREE === 'undefined') return false;
      try { R2 = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
      R2.outputEncoding = THREE.sRGBEncoding; R2.toneMapping = THREE.ACESFilmicToneMapping; R2.shadowMap.enabled = true; R2.shadowMap.type = THREE.PCFSoftShadowMap;
      sc = new THREE.Scene(); sc.fog = new THREE.FogExp2(0, .0001);
      cm = new THREE.PerspectiveCamera(50, 2, .3, 40000); gc = new THREE.PerspectiveCamera(6, 4 / 3, .5, 40000); lc = cm; cur = cm;
      hemi2 = new THREE.HemisphereLight(0xffffff, 0x444444, .6); sun2 = new THREE.DirectionalLight(0xffffff, 2); sun2.castShadow = true; sun2.shadow.mapSize.set(2048, 2048);
      const s = sun2.shadow.camera; s.left = s.bottom = -45; s.right = s.top = 45; s.near = 10; s.far = 600; sun2.shadow.bias = -.0005; sun2.shadow.normalBias = .3;
      bl2 = new THREE.PointLight(0xffb060, 0, 120, 1.6); sc.add(hemi2, sun2, sun2.target, bl2);
      sky2 = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ uniforms: { zen: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunC: { value: new THREE.Color() }, sunD: { value: V3(0, 1, 0) }, cloudC: { value: new THREE.Color() }, cover: { value: .3 }, time: { value: 0 } },
        vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }', fragmentShader: SKYF, side: THREE.BackSide, depthWrite: false }));
      sky2.frustumCulled = false; sky2.renderOrder = -10; sc.add(sky2);
      root2 = new THREE.Group(); sc.add(root2);
      const cF = () => cur; smk = Parts(4000, false, puffTex(), cF); fir = Parts(1600, true, glowTex(), cF); rib = Ribbons(1400, cF); sc.add(smk.mesh, fir.mesh, rib.mesh);
      try { post2 = makePost(R2); } catch (e) { post2 = null; }
      try { vol = VolCloud(); sc.add(vol.mesh); } catch (e) { vol = null; }
      try { cab = Cabin(R2); } catch (e) { cab = null; }
      pcam = new THREE.PerspectiveCamera(95, 1024 / 300, .3, 40000);
      loadAssets(R2, q2); ASSET.cbs.push(envUp); ASSET.cbs.push(() => { if (V && !V.model && q2 >= 1) useModel(); if (rc && !bail) bail = bailBuild(); if (rc && !teams.length) teamsBuild(); });
      canvas.addEventListener('pointerdown', e => { dragS = { x: e.clientX, y: e.clientY, a: orbA, e: orbE, ly: lookY, lp: lookP, a0x: XR ? XR.az : 0, e0x: XR ? XR.el : 0, moved: false }; });
      window.addEventListener('pointermove', e => { if (!dragS) return; const dx = e.clientX - dragS.x, dy = e.clientY - dragS.y; if (!dragS.moved && Math.abs(dx) + Math.abs(dy) < 5) return; dragS.moved = true; if (api.mode === 'xray' && XR) { XR.az = dragS.a0x - dx * .008; XR.el = Math.max(.05, Math.min(1.4, dragS.e0x + dy * .006)); return; } if (api.mode === 'cdr' || api.mode === 'citv') { lookY = Math.max(-160, Math.min(160, dragS.ly - dx * .25)); lookP = Math.max(-40, Math.min(60, dragS.lp + dy * .2)); return; } if (api.mode !== 'free') api.setMode('free'); orbA = dragS.a - dx * .3; orbE = Math.max(2, Math.min(88, dragS.e + dy * .25)); });
      window.addEventListener('pointerup', () => { dragS = null; });
      canvas.addEventListener('wheel', e => { if (api.mode === 'xray' && XR) { e.preventDefault(); XR.dist = Math.max(6, Math.min(30, XR.dist * Math.exp(e.deltaY * .0015))); return; } if (api.mode === 'cdr') return; e.preventDefault(); if (api.mode !== 'free') api.setMode('free'); orbD = Math.max(12, Math.min(9000, orbD * Math.exp(e.deltaY * .0016))); }, { passive: false });
      ok2 = true; size(); return true;
    }
    function envUp() { if (!ok2) return; sc.environment = ASSET.env && q2 >= 1 ? ASSET.env : null; if (wxs) hemi2.intensity = wxs.hi * (sc.environment ? .45 : 1); }
    function size() { if (!ok2) return; const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h || (w === W2 && h === H2)) return; W2 = w; H2 = h; R2.setPixelRatio(Math.min(devicePixelRatio || 1, q2 >= 2 ? 1.75 : 1)); R2.setSize(w, h, false); cm.aspect = w / h; cm.updateProjectionMatrix(); if (post2 && q2 >= 1) { const s = R2.getDrawingBufferSize(new THREE.Vector2()); post2.size(s.x, s.y); } }
    // threat frame -> world
    // FPV drones do not fly down the launch bearing: in the last few hundred metres they hook round the tank to come in from the flank or rear. Range to the tank is unchanged, only the bearing swings, so the engine's timing still holds.
    const HOOK = { novice: [0, 1], trained: [.6, 260], expert: [1.4, 360] };
    const hookA = (th, x) => { if (th.key !== 'fpv' && th.key !== 'fpv_fiber') return 0; const h = HOOK[api.droneSkill] || HOOK.trained; if (!h[0] || x >= h[1]) return 0; const u = 1 - Math.max(0, x) / h[1]; return (th.idx % 2 ? 1 : -1) * h[0] * u * u * (3 - 2 * u); };
    const Wp = (th, x, y, z, out) => { const a = th.brg * DEG, a2 = a + hookA(th, x), s = Math.sin(a), c = Math.cos(a), kc = th._cx != null ? Math.max(0, 1 - x / 400) : 0, X = x * Math.sin(a2) + y * c + (kc ? th._cx * kc : 0), Z = -x * Math.cos(a2) + y * s + (kc ? th._cz * kc : 0); return (out || V3(0, 0, 0)).set(X, z + hS(X, Z), Z); };
    const fr = th => { const tt = TH[th.key], hh = cf.vehicle.half_h; return { R: th.R, LH: Math.max(tt.launch_h, hh), hh, los_off: tt.los_off, g: tt.guidance }; };
    const zLine = (F, x) => F.g === 'drone' ? (x > 600 ? F.LH : F.hh + (F.LH - F.hh) * x / 600) : F.hh + (F.LH - F.hh) * x / F.R + (F.g === 'beam_rider' ? (x > 300 ? F.los_off : F.los_off * Math.max(x, 0) / 300) : 0);
    const latV = (th, t) => { const b = th.brg * DEG; let y = (rc.ctx.speed || 0) * Math.sin((rc.ctx.hull - th.brg) * DEG) * Math.max(0, t); if (rc.crew) { const p = HK.crewPos(rc.crew, t); y += p.x * Math.cos(b) - p.n * Math.sin(b); } return y; };
    const yBeam = (th, x, t) => latV(th, t) * (1 - x / th.R);
    function mS(th, t) { // missile position in its own frame
      const e = th.viz.end; if (t < th.t0) return null; const F = fr(th);
      if (t < e.t) { const q = trajAt(th, t); if (q) return { x: q.x, y: q.y, z: q.z, blind: !!q.b, alive: true };
        const x = Math.max(HK.distAt(th, t), 0); let y = yBeam(th, x, t), z = zLine(F, x); const md = phaseAt(th, t);
        if (F.g === 'drone') { // FPV attack run, flown to the operator's skill: novice high and steady; trained weaves and jinks under fire; expert comes in low, breaks hard, feints, then pops up and dives on the roof
          const sk = api.droneSkill || 'trained', evd = api.droneEvade !== false, fired = evd && rc.bursts.some(b => b.idx === th.idx && b.tf <= t), jg = th.viz.jink || 1.2, ph = th.idx * 1.7, ta = t - th.t0, cv = Math.min(1, x / 140), roof = 2.7; let yy = yBeam(th, x, t), zz;
          const tw = .08 * Math.sin(ta * 3.1 + ph) + .05 * Math.sin(ta * 5.3 + ph * 3);   // stick twitch: a hand-flown quad is never still
          const fz = (th.viz.feints || []).reduce((acc, tf) => { const q = (t - tf + .5) / 1.8; return q > 0 && q < 1 ? acc + Math.pow(Math.sin(Math.PI * q), 2) : acc; }, 0);
          if (sk === 'novice') { const cv2 = Math.min(1, x / 200), A = (fired ? 7 : 5) * cv2; yy += A * Math.sin(.5 * ta + ph) + tw * cv2; zz = x > 340 ? F.LH + 2 * Math.sin(ta * .45 + ph) + tw : roof + (F.LH - roof) * Math.pow(x / 340, 1.15); }
          else if (sk === 'expert') { const cv2 = Math.min(1, x / 300), w = fired ? 1.3 : .8, A = (fired ? 18 : 16) * cv2, sq = Math.tanh(1.6 * Math.sin(w * ta + ph)) / .92; yy += A * (sq + .22 * Math.sin(2.7 * w * ta + ph * 2)) + tw * cv2;
            const low = 7 + 2.5 * Math.sin(ta * 1.1 + ph) + (fired ? 2.5 * Math.sin(ta * 2.9 + ph) : 0) + tw, climb = Math.min(1, (th.R - x) / 200), u = Math.min(1, x / 220);
            zz = x > 220 ? F.LH + (low - F.LH) * climb * climb * (3 - 2 * climb) : roof + (low - roof) * u + 26 * Math.pow(Math.sin(Math.PI * Math.pow(u, .6)), 2);
            yy += 16 * fz * (th.idx % 2 ? 1 : -1) * cv2; zz += 10 * fz * Math.min(1, x / 220); }
          else { const cv2 = Math.min(1, x / 260), w = fired ? 1.2 : .7, A = (fired ? 14 : 12) * cv2; yy += A * (Math.sin(w * ta + ph) + .3 * Math.sin(2.3 * w * ta + ph * 2)) + tw * cv2;
            const cr = 26 + 5 * Math.sin(ta * .6 + ph) + (fired ? 5 * Math.sin(ta * 1.9 + ph) : 0) + tw, climb = Math.min(1, (th.R - x) / 200), u = Math.min(1, x / 200);
            zz = x > 200 ? F.LH + (cr - F.LH) * climb : roof + (cr - roof) * Math.pow(u, 1.5) + 5 * Math.pow(Math.sin(Math.PI * u), 2); }
          return { x, y: yy, z: zz, blind: md === 'blind', alive: true }; }
        if (e.type === 'miss' && md === 'blind') { const f = Math.min(1, (t - th.t0) / Math.max(e.t - th.t0, .1)); y += (e.lat || 4) * f * f; }
        else if (e.jit) { const f = Math.min(1, (t - th.t0) / Math.max(e.t - th.t0, .1)), w = f * f * (3 - 2 * f); if (e.type === 'miss') { y += (e.lat || 0) * w; z = Math.max(.4, z + (e.over || 0) * w); } else z = Math.max(.3, z * (1 - w * .9)); }
        return { x, y, z, blind: md === 'blind', alive: true }; }
      return null;
    }
    const endPos = th => { const e = th.viz.end; if (e.type === 'hit') return V3(0, 0, cf.vehicle.half_h); const m = mS(th, e.t - .002); return m ? V3(m.x, m.y, m.z) : V3(0, 0, cf.vehicle.half_h); };
    function lab(cls, html) { const el = document.createElement('div'); el.className = 'c3l ' + cls; el.innerHTML = html; labelsEl.appendChild(el); const o = { el, p: V3(0, 0, 0), on: false, vis: false }; labs.push(o); return o; }
    function place(cam2) { { const live = labs.filter(o => o.on && o.d != null); if (live.length > 12) { live.sort((a, b) => a.d - b.d); for (let i = 10; i < live.length; i++) live[i].on = false; } } for (const o of labs) { let show = o.on && overlay2; if (show) { tmpA.copy(o.p).project(cam2); show = tmpA.z < 1 && Math.abs(tmpA.x) < 1.02 && Math.abs(tmpA.y) < 1.02; if (show) o.el.style.transform = `translate3d(${((tmpA.x * .5 + .5) * W2).toFixed(1)}px,${((-tmpA.y * .5 + .5) * H2).toFixed(1)}px,0) translate(-50%,-50%)`; } if (o.vis !== show) { o.vis = show; o.el.classList.toggle('on', show); } } }
    function build(r, c) {
      rc = r; cf = c; craters = new Map(); wxs = WX[c.env.weather] || WX.clear;
      // time of day (display only): dusk lowers and reddens the sun; night is moonlight, where only the thermal sights see far
      const tod = api.tod || 'day'; if (tod !== 'day') { const k = tod === 'dusk', mix = (a, b, f) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), f).getHexString();
        wxs = Object.assign({}, wxs, k ? { zen: mix(wxs.zen, '#3b4a7a', .55), hor: mix(wxs.hor, '#f0a463', .6), sun: '#ff9a52', el: 5, light: wxs.light * .7, hs: mix(wxs.hs, '#7f86b0', .5), hg: mix(wxs.hg, '#3a2c24', .5), hi: wxs.hi * .6, exp: wxs.exp * 1.05, amb: wxs.amb.map(v => v * .55), sc: [1, .55, .3], cloud: mix(wxs.cloud, '#f2a26a', .45) }
          : { zen: '#03060d', hor: '#0e1522', sun: '#9fb4d8', el: 32, light: .22, hs: '#2a3956', hg: '#0b0c10', hi: .22, exp: .95, amb: [.05, .065, .09], sc: [.1, .12, .16], cloud: '#171d28', cover: Math.max(.25, wxs.cover) }); } carbonS = c.obs.alpha_m2_per_g >= 1.5;
      root2.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const ch of root2.children.slice()) root2.remove(ch); labelsEl.innerHTML = ''; labs = [];
      maxRS = Math.max(1500, ...r.threats.map(t => t.R));
      bumps2 = []; for (const th of r.threats) { const tt = TH[th.key]; if (tt.launch_h > 20 && tt.launch_h < 100 && tt.guidance !== 'drone') { const p = Wp(th, th.R, 0, 0); bumps2.push({ x: p.x, z: p.z, h: tt.launch_h - 1.4, s2: 140 * 140 }); } }
      // light and sky
      const hull = r.ctx.hull, sa = (hull + 140) * DEG, se = wxs.el * DEG; sunD.set(Math.sin(sa) * Math.cos(se), Math.sin(se), -Math.cos(sa) * Math.cos(se));
      const su = sky2.material.uniforms; su.zen.value.set(wxs.zen); su.hor.value.set(wxs.hor); su.sunC.value.set(wxs.sun); su.sunD.value.copy(sunD); su.cloudC.value.set(wxs.cloud); su.cover.value = wxs.cover;
      sc.fog.color.set(wxs.hor); sc.fog.density = FOGM[c.env.weather] || .0001; R2.toneMappingExposure = wxs.exp;
      hemi2.color.copy(col(wxs.hs)); hemi2.groundColor.copy(col(wxs.hg)); hemi2.intensity = wxs.hi * (sc.environment ? .45 : 1); sun2.color.copy(col(wxs.sun)); sun2.intensity = wxs.light;
      for (const ps of [smk, fir]) { const u = ps.m.uniforms; u.sunC.value.setRGB(...wxs.sc); u.amb.value.setRGB(...wxs.amb); u.fogC.value.set(wxs.hor); u.fogD.value = sc.fog.density; } rib.m.uniforms.fogD.value = sc.fog.density;
      // ground: fine detail near the vehicle, coarse far out
      const gt = groundTex(c.env.terrain), mat = new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.nrm, normalScale: new THREE.Vector2(.5, .5), vertexColors: true, roughness: 1 });
      const mk = (size, seg, rep, hole) => { const gg = new THREE.PlaneGeometry(size, size, seg, seg); gg.rotateX(-Math.PI / 2); const gp = gg.attributes.position, gcl = new Float32Array(gp.count * 3), uv = gg.attributes.uv;
        for (let k = 0; k < gp.count; k++) { const x = gp.getX(k), z = gp.getZ(k); gp.setY(k, hS(x, z) - (hole && Math.max(Math.abs(x), Math.abs(z)) < hole ? 1.5 : 0)); const v = .74 + .48 * fbm(x * .0012 + 9, z * .0012, 3), w = .92 + .16 * vn(x * .01, z * .01); gcl[k * 3] = v * w; gcl[k * 3 + 1] = v; gcl[k * 3 + 2] = v * (1.02 - .1 * w); uv.setXY(k, x / 34, z / 34); }
        gg.setAttribute('color', new THREE.BufferAttribute(gcl, 3)); gg.computeVertexNormals(); const m = new THREE.Mesh(gg, mat); m.receiveShadow = true; return m; };
      const gm = mat.map.clone(); gm.needsUpdate = true; gm.repeat.set(1, 1); mat.map = gm; const gn = mat.normalMap.clone(); gn.needsUpdate = true; gn.repeat.set(1, 1); mat.normalMap = gn;
      const near = mk(3000, 300, 1, 0), far = mk(36000, 220, 1, 1500); near.position.y = .02; root2.add(near, far);
      // scenery that does not block the firing lines
      const lines = r.threats.map(th => ({ a: th.brg * DEG, R: th.R }));
      const freeAt = (x, z, pad) => { const rr0 = Math.hypot(x, z); if (rr0 < 40) return false; for (const l of lines) { const along = x * Math.sin(l.a) - z * Math.cos(l.a), side = Math.abs(x * Math.cos(l.a) + z * Math.sin(l.a)); if (along > -30 && along < l.R + 60 && side < pad + along * .012) return false; } return true; };
      let s = (r.threats.length * 7919 + 13) | 0; const rnd = () => { s = (s * 16807) % 2147483647; if (s <= 0) s += 2147483646; return s / 2147483647; }, o = new THREE.Object3D(), cc = new THREE.Color();
      const kind = c.env.terrain, nT = kind === 'mixed' ? 2600 : kind === 'urban' ? 260 : 420;
      const trunk = new THREE.InstancedMesh(cyl(.5, .7, 1, 6), M(0x3b2e22, 1), nT), crown = new THREE.InstancedMesh(lumpy(3, 10, 8, .7), M(0xffffff, .95), nT * 2), cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9), M(0xffffff, .95), nT * 2); let it = 0, ic = 0, io = 0;
      for (let i = 0; i < nT * 4 && it < nT; i++) { const rr0 = 60 + Math.pow(rnd(), .7) * 4200, a = rnd() * 6.283, x = rr0 * Math.sin(a), z = -rr0 * Math.cos(a); if (!freeAt(x, z, 14)) continue; if (kind === 'mixed' && fbm(x * .0022 + 3, z * .0022, 2) < .45) continue; if (kind === 'open' && fbm(x * .003 + 8, z * .003, 2) < .55) continue;
        const y = hS(x, z), h = 9 + rnd() * 12, con = rnd() < (kind === 'mixed' ? .55 : .2); o.position.set(x, y + h * .2, z); o.scale.set(h * .035, h * .4, h * .035); o.rotation.set(0, 0, 0); o.updateMatrix(); trunk.setMatrixAt(it++, o.matrix);
        cc.setHSL(.22 + rnd() * .08, .3 + rnd() * .14, .18 + rnd() * .08).convertSRGBToLinear();
        if (con) for (let k = 0; k < 2; k++) { o.position.set(x, y + h * (.45 + k * .25), z); o.scale.set(h * (.22 - k * .06), h * .5, h * (.22 - k * .06)); o.rotation.set(0, rnd() * 6, 0); o.updateMatrix(); cone.setMatrixAt(io, o.matrix); cone.setColorAt(io++, cc); }
        else for (let k = 0; k < 2; k++) { const s0 = k ? .2 : .3; o.position.set(x + (k ? (rnd() - .5) * h * .3 : 0), y + h * (k ? .55 : .7), z + (k ? (rnd() - .5) * h * .3 : 0)); o.scale.set(h * s0, h * s0 * .85, h * s0); o.rotation.set(rnd(), rnd() * 6, rnd()); o.updateMatrix(); crown.setMatrixAt(ic, o.matrix); crown.setColorAt(ic++, cc); } }
      trunk.count = it; crown.count = ic; cone.count = io; for (const m of [trunk, crown, cone]) { m.castShadow = true; m.receiveShadow = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; root2.add(m); }
      if (kind === 'urban') { const bl = new THREE.InstancedMesh(box(1, 1, 1), new THREE.MeshStandardMaterial({ map: facadeTex(), roughness: .9 }), 420); let k = 0;
        for (let i = 0; i < 4000 && k < 420; i++) { const gx = Math.round((rnd() * 2 - 1) * 40), gz = Math.round((rnd() * 2 - 1) * 40), x = gx * 34, z = gz * 34; if (!freeAt(x, z, 26) || Math.hypot(x, z) > 1500) continue; const w = 14 + rnd() * 12, d = 14 + rnd() * 12, h = 8 + rnd() * rnd() * 34; o.position.set(x, hS(x, z) + h / 2 - .5, z); o.scale.set(w, h, d); o.rotation.set(0, 0, 0); o.updateMatrix(); bl.setMatrixAt(k, o.matrix); cc.setHSL(.08 + rnd() * .04, .08 + rnd() * .1, .5 + rnd() * .25); bl.setColorAt(k++, cc.convertSRGBToLinear()); }
        bl.count = k; bl.castShadow = true; bl.receiveShadow = true; bl.instanceColor.needsUpdate = true; root2.add(bl); }
      const rocks = new THREE.InstancedMesh(lumpy(9, 9, 7, .8), M(0xffffff, 1), 500); let kr = 0;
      for (let i = 0; i < 1500 && kr < 500; i++) { const rr0 = 15 + Math.pow(rnd(), 1.4) * 1800, a = rnd() * 6.283, x = rr0 * Math.sin(a), z = -rr0 * Math.cos(a); if (!freeAt(x, z, 3)) continue; const bush = rnd() < .6, s0 = bush ? .6 + rnd() * 1.4 : .3 + rnd() * .9; o.position.set(x, hS(x, z) + s0 * .3, z); o.scale.set(s0 * (1 + rnd() * .5), s0 * .7, s0); o.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3); o.updateMatrix(); rocks.setMatrixAt(kr, o.matrix); if (bush) cc.setHSL(.17 + rnd() * .06, .22, .2 + rnd() * .08); else cc.setHSL(.09, .08, .38 + rnd() * .14); rocks.setColorAt(kr++, cc.convertSRGBToLinear()); }
      rocks.count = kr; rocks.castShadow = true; rocks.receiveShadow = true; rocks.instanceColor.needsUpdate = true; root2.add(rocks);
      // range rings (overlay)
      const ovl = new THREE.Group(); ovl.name = 'ovl'; root2.add(ovl);
      for (const d of [500, 1000, 2000, 3000, 4000, 5000, 6000, 8000]) if (d <= maxRS * 1.15) { const pts = []; for (let k = 0; k <= 256; k++) { const a = k / 256 * Math.PI * 2, x = d * Math.sin(a), z = -d * Math.cos(a); pts.push(V3(x, hS(x, z) + 1.2, z)); } ovl.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .22, depthWrite: false }))); const lb = lab('c3rng', d >= 1000 ? d / 1000 + ' km' : d + ' m'); lb.p.set(d * Math.sin((hull + 180) * DEG) * .999, 2, -d * Math.cos((hull + 180) * DEG)); lb.on = true; }
      // vehicle
      V = vehM1(c, hull); root2.add(V.g); V.rws.visible = c.hkoi_enabled; wheelA = 0; tPrev = null; if (ASSET.m1 && q2 >= 1) useModel();
      bail = bailBuild(); dmg = null; turB = null;
      // wind-swayed grass around the vehicle
      grass = null; if (c.env.terrain !== 'urban') { try { grass = grassField(c.env.terrain === 'open'); root2.add(grass.mesh); grass.mesh.visible = q2 >= 2; } catch (e) { grass = null; } }
      // launchers, missiles and labels
      Lm = []; Ms = [];
      for (const th of r.threats) {
        const tt = TH[th.key], F = fr(th), color = TCOL[th.idx % TCOL.length];
        let L = Lm.find(l => l.lid === th.lid && th.lid != null);
        if (!L) { const lp = Wp(th, th.R, 0, 0), air = tt.launch_h >= 50; const gy = hS(lp.x, lp.z), model = launcherModel(tt, color); model.scale.setScalar(air ? 1 : tt.guidance === 'drone' ? .5 : .42); model.position.set(lp.x, air ? F.LH : gy, lp.z); model.lookAt(0, model.position.y, 0); root2.add(model);
          L = { lid: th.lid, model, air, sight: V3(lp.x, gy + Math.max(1.2, F.LH), lp.z), tag: lab('c3tag', `<b style="background:${color}">${th.idx + 1}</b>${tt.short}`) }; L.tag.p.copy(L.sight); L.tag.p.y += air ? 14 : 7; L.tag.on = true; Lm.push(L); }
        const mm = tt.guidance === 'drone' ? fpvModel(tt) : missileModel(tt, color); if (tt.guidance !== 'drone') mm.scale.multiplyScalar(.2); mm.visible = false; root2.add(mm);
        Ms.push({ th, L, mm, F, tag: lab('c3m', `<b style="background:${color}">${th.idx + 1}</b><em></em>`), color });
      }
      teamsBuild(); wingBuild(r, c); duelBuild(r); camP2 = null;
    }
    // ================================================================ platoon: the other three tanks, each fighting its own share of the raid
    let Wg = [], me1 = null;
    function wingBuild(r, c) {
      Wg = []; me1 = null; if (!r.platoon) return;
      const ring = cc2 => { const m = new THREE.Mesh(new THREE.RingGeometry(11, 15, 40), new THREE.MeshBasicMaterial({ color: cc2, transparent: true, opacity: .8, depthWrite: false })); m.rotation.x = -Math.PI / 2; root2.getObjectByName('ovl').add(m); return m; };
      me1 = { ring: ring(0x7ff0e6), tag: lab('c3tag', `<b style="background:#2f6f69">1</b>Tank 1 (you)`) };
      for (const p of r.platoon) {
        const g = new THREE.Group(); root2.add(g);
        if (ASSET.m1 && q2 >= 1) { const hold = new THREE.Group(); hold.rotation.y = Math.PI; hold.add(ASSET.m1.clone(true)); g.add(hold); } else { const v = vehM1(c, 0); g.add(v.g); }
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const O = V3(p.off[0], 0, -p.off[1]), W = { p, g, O, ring: ring(0xd8e0c0), tag: lab('c3tag', `<b style="background:#4b5a3a">${p.k + 1}</b>Tank ${p.k + 1}`), ms: [] };
        for (const th of p.rec.threats) { const tt = TH[th.key], color = TCOL[(th.idx + p.k * 5) % TCOL.length];
          const lp = Wp(th, th.R, 0, 0).add(O); lp.y = hS(lp.x, lp.z);
          if (!Lm.some(L => L.model.position.distanceTo(lp) < 40) && !W.ms.some(m => m.lp.distanceTo(lp) < 40)) { const lm = launcherModel(tt, color); lm.scale.setScalar(tt.guidance === 'drone' ? .5 : .42); lm.position.copy(lp); lm.lookAt(O.x, lp.y, O.z); root2.add(lm); }
          const mm = tt.guidance === 'drone' ? fpvModel(tt) : missileModel(tt, color); if (tt.guidance !== 'drone') mm.scale.multiplyScalar(.2); mm.visible = false; root2.add(mm);
          W.ms.push({ th, tt, mm, lp, tag: lab('c3m', `<b style="background:${color}">T${p.k + 1}</b><em></em>`) }); }
        Wg.push(W);
      }
    }
    function wingFrame(t, vp, gy0, dead1) {
      if (me1) { me1.ring.position.set(vp.x, gy0 + .4, vp.z); me1.tag.on = true; me1.tag.p.set(vp.x, gy0 + 9, vp.z); const em = me1.tag.el.lastChild, st = dead1 ? 'Tank 1 (you) · knocked out' : 'Tank 1 (you)'; if (em.textContent !== st) em.textContent = st; me1.ring.material.color.setHex(dead1 ? 0xff5040 : 0x7ff0e6); }
      for (const W of Wg) {
        const rk = W.p.rec, cp = rk.crew ? HK.crewPos(rk.crew, t) : { x: 0, n: 0, h: 0 }, tp = V3(W.O.x + cp.x, 0, W.O.z - cp.n); tp.y = hS(tp.x, tp.z);
        W.g.position.copy(tp); W.g.rotation.y = -cp.h * DEG; W.ring.position.set(tp.x, tp.y + .4, tp.z);
        let dead = -1; for (const th of rk.threats) { const e = th.viz.end; if (e.type === 'hit' && e.killing && t >= e.t) dead = dead < 0 ? e.t : Math.min(dead, e.t); }
        W.ring.material.color.setHex(dead >= 0 ? 0xff5040 : 0xd8e0c0); W.tag.on = true; W.tag.p.set(tp.x, tp.y + 9, tp.z); const em = W.tag.el.lastChild; const st = dead >= 0 ? `Tank ${W.p.k + 1} · knocked out` : `Tank ${W.p.k + 1}`; if (em.textContent !== st) em.textContent = st;
        if (dead >= 0) { const age = t - dead; for (let i = 0; i < 6; i++) { const L = .7, a = (wallS + i / 6 * L) % L; fir.add(tp.x + (r1(93, i) - .5) * 3, tp.y + 2 + a * 6, tp.z + (r1(94, i) - .5) * 3, 5 * (1 - a / L) + 1.5, .9 * (1 - a / L), 1, .55, .15); }
          for (let i = 0; i < 8; i++) { const a = (age * .12 + i / 8) % 1; smk.add(tp.x + (r1(95, i) - .5) * 4 + a * 6, tp.y + 3 + a * 30, tp.z + (r1(96, i) - .5) * 4, 4 + a * 14, .6 * (1 - a), .12, .11, .1, i + age * .1, i & 3); } }
        for (const m of W.ms) { const th = m.th, e = th.viz.end, tt = m.tt, k = th.idx + 50 * W.p.k; m.mm.visible = false; m.tag.on = false; m.tag.d = null;
          const dirX = m.lp.x - W.O.x, dirZ = m.lp.z - W.O.z, L0 = Math.hypot(dirX, dirZ) || 1, ux = dirX / L0, uz = dirZ / L0, LH = Math.max(tt.launch_h, 2);
          const at = tq => { const q = trajAt(th, tq); let x = Math.max(0, Math.min(th.R, th.R - th.v * (tq - th.t0))), yl = 0, zz = null; if (q) { x = Math.max(0, q.x); yl = q.y; zz = Math.max(.2, q.z); } else if (e.type === 'ground' && th.viz.sever && tq > th.viz.sever.t) { const f2 = Math.min(1, (tq - th.viz.sever.t) / Math.max(.1, e.t - th.viz.sever.t)); zz = Math.max(.2, (1.5 + (LH - 1.5) * x / th.R) * (1 - f2 * f2)); } else if (e.type === 'miss' && th.viz.sever && tq > th.viz.sever.t) { const f2 = Math.min(1, (tq - th.viz.sever.t) / Math.max(.1, e.t - th.viz.sever.t)); yl = (e.lat || 5) * f2 * f2; }
            const f = x / th.R, X = tp.x + ux * x - uz * yl, Z = tp.z + uz * x + ux * yl; return V3(X, hS(X, Z) + (zz != null ? zz : 1.5 + (LH - 1.5) * f), Z); };
          if (t >= th.t0 && t < e.t) { const P = at(t); m.mm.visible = true; m.mm.position.copy(P); m.mm.lookAt(tp.x, P.y, tp.z); fir.add(P.x + ux * 1.2, P.y, P.z + uz * 1.2, 1.2, .9, 1, .8, .5);
            m.tag.on = true; m.tag.d = th.R - th.v * (t - th.t0); m.tag.p.set(P.x, P.y + 4, P.z); const em2 = m.tag.el.lastChild, s2 = Math.round(m.tag.d) + ' m'; if (em2.textContent !== s2) em2.textContent = s2; }
          else if (t >= e.t && t - e.t < 9) { const P = e.type === 'hit' ? V3(tp.x, tp.y + (tt.guidance === 'drone' ? 2.8 : 2), tp.z) : at(e.t); if (e.type === 'miss' || e.type === 'ground') { P.y = hS(P.x, P.z) + .2; blast(P, t - e.t, 'ground', k * 7 + 1); } else blast(P, t - e.t, e.type, k * 7 + 1); }
          // the obscurant cloud that cut the guidance
          const sv = th.viz.sever; if (sv && sv.t != null && t >= sv.t && t < sv.t + 20) { const C = at(sv.t), ag = t - sv.t; for (let i = 0; i < 5; i++) smk.add(C.x + (r1(k, i) - .5) * 8 + ag * .8, C.y + (r1(k + 1, i) - .3) * 5, C.z + (r1(k + 2, i) - .5) * 8, 6 + ag * 1.2, .55 * Math.min(1, ag * 3) * (1 - ag / 20), .82, .8, .76, i + ag * .1, i & 3); }
        }
      }
    }
    // ================================================================ combined arms: the enemy tank and the gunnery duel
    let DU = null;
    function enemyTankModel() {   // T-72B3-style: low hull, round cast turret under reactive-armour tiles, long 125 mm gun, skirts, rear fuel drums
      const g = new THREE.Group(), camT = canvasTex(256, 256, x => { x.fillStyle = '#434c35'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 26; i++) { x.fillStyle = ['#2c3325', '#57593c', '#3a4230', '#6a6548'][i % 4]; x.beginPath(); x.ellipse(r1(i, 1) * 256, r1(i, 2) * 256, 18 + r1(i, 3) * 46, 10 + r1(i, 4) * 26, r1(i, 5) * 3, 0, 7); x.fill(); } for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${90 + r1(i, 6) * 50 | 0},${80 + r1(i, 7) * 40 | 0},${55 + r1(i, 8) * 30 | 0},.18)`; x.fillRect(r1(i, 9) * 256, r1(i, 10) * 256, 2 + r1(i, 11) * 5, 1 + r1(i, 12) * 3); } }, true);
      camT.wrapS = camT.wrapT = THREE.RepeatWrapping; const grn = new THREE.MeshStandardMaterial({ map: camT, roughness: .88, metalness: .1 }), dk = new THREE.MeshStandardMaterial({ color: col(0x1b1d19), roughness: .92 }), rub = new THREE.MeshStandardMaterial({ color: col(0x121210), roughness: 1 }), stl = new THREE.MeshStandardMaterial({ color: col(0x4a4c46), roughness: .6, metalness: .6 });
      const P = (geo, m, x, y, z, par, rx, ry, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = o.receiveShadow = true; o.userData.therm = 'veh'; (par || g).add(o); return o; };
      // hull: tub, sloped glacis with tile rows, fenders, skirts with rubber panels
      P(box(2.3, .62, 6.4), grn, 0, .92, 0); P(box(3.4, .12, 6.7), grn, 0, 1.2, 0); P(box(3.3, .5, 1.9), grn, 0, 1.02, -3.55, null, .98); P(box(2.3, .5, 1.0), grn, 0, .74, -3.6, null, -.9);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) P(box(.46, .1, .28), grn, -1.25 + i * .5, 1.22 - r * .2, -3.62 - r * .3, null, .98);
      for (const sx of [-1, 1]) { P(box(.1, .62, 5.4), rub, sx * 1.72, .78, -.3); for (let i = 0; i < 4; i++) P(box(.14, .5, .9), grn, sx * 1.76, .88, -2.2 + i * 1.0); P(box(.7, .34, 6.5), dk, sx * 1.4, .34, 0);
        for (let i = 0; i < 6; i++) { const w = P(cyl(.37, .37, .46, 14), dk, sx * 1.42, .38, -2.55 + i * 1.02, null, 0, 0, Math.PI / 2); P(cyl(.16, .16, .5, 8), stl, sx * 1.42, .38, -2.55 + i * 1.02, null, 0, 0, Math.PI / 2); }
        P(cyl(.3, .3, .46, 12), dk, sx * 1.42, .62, -3.2, null, 0, 0, Math.PI / 2); P(cyl(.3, .3, .46, 12), dk, sx * 1.42, .62, 3.15, null, 0, 0, Math.PI / 2); P(box(.6, .16, .9), grn, sx * 1.4, 1.34, 1.4); }
      // engine deck, exhaust, unditching log, two fuel drums
      P(box(2.6, .12, 2.0), dk, 0, 1.3, 2.2); P(box(.3, .3, .5), dk, -1.55, 1.2, 1.8); P(cyl(.11, .11, 2.9, 10), new THREE.MeshStandardMaterial({ color: col(0x5a4630), roughness: 1 }), 0, 1.02, 3.5, null, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) { const d = P(cyl(.3, .3, .95, 14), grn, sx * .7, 1.5, 3.25, null, 0, 0, Math.PI / 2); P(cyl(.31, .31, .05, 14), dk, sx * .7 - .2, 1.5, 3.25, null, 0, 0, Math.PI / 2); P(cyl(.31, .31, .05, 14), dk, sx * .7 + .2, 1.5, 3.25, null, 0, 0, Math.PI / 2); }
      // turret
      const tur = new THREE.Group(); tur.position.set(0, 1.28, -.55); g.add(tur);
      const dome = P(new THREE.SphereGeometry(1.38, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), grn, 0, 0, 0, tur); dome.scale.set(1.02, .52, 1.12);
      for (let i = 0; i < 9; i++) { const a = (-64 + i * 16) * DEG; P(box(.34, .2, .38), grn, Math.sin(a) * 1.36, .3, -Math.cos(a) * 1.5, tur, .55, -a, 0); }   // reactive armour wedges across the turret front
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) P(box(.3, .12, .3), grn, sx * (.35 + i * .2), .66 - i * .02, -.5 + i * .22, tur);
      const mant = P(box(.5, .42, .4), dk, 0, .33, -1.42, tur); const brl = P(cyl(.075, .085, 5.5, 12), dk, 0, .34, -4.35, tur, Math.PI / 2); P(cyl(.11, .11, 1.3, 12), grn, 0, .34, -3.4, tur, Math.PI / 2); P(cyl(.1, .1, .9, 12), grn, 0, .34, -5.6, tur, Math.PI / 2); P(cyl(.13, .13, .5, 12), dk, 0, .34, -4.45, tur, Math.PI / 2);
      P(box(.36, .3, .4), dk, .55, .78, -.2, tur); P(cyl(.03, .03, .9, 6), dk, .2, 1.2, .2, tur); const mg = P(cyl(.025, .025, 1.3, 6), dk, .55, 1.0, -.6, tur, Math.PI / 2); P(box(.3, .26, .5), dk, -.62, .72, -1.0, tur); P(box(.26, .2, .3), stl, -.62, .74, -1.28, tur);
      P(box(1.3, .32, .5), grn, 0, .34, 1.45, tur); P(cyl(.1, .1, 2.2, 10), grn, -.2, .42, 1.78, tur, 0, 0, Math.PI / 2);   // stowage bin and snorkel on the turret rear
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) P(cyl(.04, .04, .2, 6), dk, sx * (1.05 + i * .06), .5, -.9 + i * .12, tur, .9, 0, sx * -.5);   // smoke dischargers
      g.userData.tur = tur; return g;
    }
    function duelBuild(r) {
      DU = null; if (!r.duel) return; const du = r.duel, a = du.brg * DEG, p = V3(du.R * Math.sin(a), 0, -du.R * Math.cos(a)); p.y = hS(p.x, p.z);
      const m = enemyTankModel(); m.position.copy(p); m.lookAt(0, p.y, 0); m.rotateY(Math.PI); root2.add(m);
      DU = { du, m, p, tag: lab('c3tag', `<b style="background:#b3160f">T</b>Enemy tank`) }; DU.tag.p.set(p.x, p.y + 7, p.z); DU.tag.on = true;
      const L = Lm.find(l => l.lid === 'duel'); if (L) { L.model.visible = false; L.tag.on = false; L.sight.set(p.x, p.y + 2.2, p.z); }
    }
    const duelAim = t => DU && t >= DU.du.spot && (DU.du.deadT == null || t < DU.du.deadT + .5) ? DU.du.brg : null;
    function duelFrame(t, vp, gy0, dead1) {
      if (!DU) return; const du = DU.du, p = DU.p, a = du.brg * DEG, ux = Math.sin(a), uz = -Math.cos(a), tof = du.R / 1650, mz = V3(vp.x + ux * 6.5, gy0 + 2.25, vp.z + uz * 6.5), em = V3(p.x - ux * 6, p.y + 1.9, p.z - uz * 6);
      DU.m.visible = t >= du.t0 - 1; DU.tag.on = DU.m.visible; const eDead = du.deadT != null && t >= du.deadT; const emt = DU.tag.el.lastChild, st = eDead ? 'Enemy tank · destroyed' : 'Enemy tank'; if (emt.textContent !== st) emt.textContent = st;
      // enemy shots: flash, dust kicked up in front of the muzzle
      for (const e of du.enemy) { const ag = t - e.t; if (ag >= 0 && ag < .14) fir.add(em.x, em.y, em.z, 9 * (1 - ag / .14) + 3, 1, 1, .9, .7); if (ag >= 0 && ag < 4) for (let i = 0; i < 5; i++) smk.add(em.x - ux * i * 1.5 + (r1(i, 71) - .5) * 4, em.y + ag * (.6 + r1(i, 72)), em.z - uz * i * 1.5 + (r1(i, 73) - .5) * 4, 3 + ag * 3, .5 * (1 - ag / 4), .62, .56, .46, i + ag * .2, i & 3); }
      // our main gun: flash, the tracer of the sabot, strike or miss
      for (let k = 0; k < du.shots.length; k++) { const q = du.shots[k], ag = t - q.t; if (ag < 0 || ag > tof + 8) continue;
        if (ag < .16) { fir.add(mz.x, mz.y, mz.z, 11 * (1 - ag / .16) + 4, 1, 1, .92, .75); api.mainFlash = t; }
        if (ag < 3.5) for (let i = 0; i < 6; i++) smk.add(mz.x + ux * i * 1.2 + (r1(i + k, 74) - .5) * 5, mz.y + ag * (.5 + r1(i, 75)) - .6, mz.z + uz * i * 1.2 + (r1(i + k, 76) - .5) * 5, 3.5 + ag * 3.5, .5 * (1 - ag / 3.5), .7, .64, .52, i + ag * .2, i & 3);
        if (ag < tof) { const f = ag / tof; fir.add(mz.x + (p.x - mz.x) * f, mz.y + (p.y + 1.6 - mz.y) * f + Math.sin(f * Math.PI) * du.R * .0012, mz.z + (p.z - mz.z) * f, 1.6, 1, 1, .6, .35); }
        else { const ia = ag - tof; if (q.hit) { tmpA.set(p.x, p.y + 1.6, p.z); blast(tmpA, ia, 'hit', 900 + k * 7); } else { tmpA.set(p.x + (r1(k, 77) - .5) * 14, p.y + .2, p.z + (r1(k, 78) - .5) * 14 + 12 * uz); blast(tmpA, ia, 'dirt', 900 + k * 7); } } }
      if (eDead) { const ag = t - du.deadT; DU.m.userData.tur.rotation.set(Math.min(.25, ag * .5), Math.min(.6, ag), 0); DU.m.userData.tur.position.y = 1.28 + Math.min(.5, ag * 2) * Math.max(0, 1 - ag * .4);
        for (let i = 0; i < 6; i++) { const L = .7, aa = (wallS + i / 6 * L) % L; fir.add(p.x + (r1(97, i) - .5) * 3, p.y + 2 + aa * 6, p.z + (r1(98, i) - .5) * 3, 5 * (1 - aa / L) + 1.5, .9 * (1 - aa / L), 1, .55, .15); }
        for (let i = 0; i < 8; i++) { const aa = (ag * .12 + i / 8) % 1; smk.add(p.x + (r1(99, i) - .5) * 4 + aa * 6, p.y + 3 + aa * 30, p.z + (r1(100, i) - .5) * 4, 4 + aa * 14, .6 * (1 - aa), .12, .11, .1, i + ag * .1, i & 3); } }
      else DU.m.userData.tur.rotation.set(0, 0, 0);
    }
    // ---- one frame of the world at time t
    function frame(t, dt, opt) {
      if (!rc) return; wallS += dt; tNow = t; for (const c of craters.values()) c.m.visible = t >= c.t0; const fxs = 1; smk.begin(); fir.begin(); rib.begin(); let hot = 0; const hotAt = tmpC;
      root2.getObjectByName('ovl').visible = overlay2 && api.mode !== 'gun' && api.mode !== 'enemy';
      const hull = rc.ctx.hull * DEG, cp = rc.crew ? HK.crewPos(rc.crew, t) : { x: 0, n: 0, h: rc.ctx.hull, v: 0 }, vp = V3(cp.x, 0, -cp.n), gy0 = hS(vp.x, vp.z); V.g.position.set(vp.x, gy0, vp.z); V.g.rotation.y = -cp.h * DEG;
      const tStep = tPrev == null ? 0 : Math.max(-.3, Math.min(.3, t - tPrev)); tPrev = t; wheelA += cp.v * tStep / .38; for (const w of V.wheels) w.rotation.x = wheelA; if (V.trackTex) V.trackTex.offset.y = -wheelA * .38 / 1.6;
      if (V.body) { const pitch = rc.crew ? Math.max(-.05, Math.min(.05, (HK.crewPos(rc.crew, t + .3).v - cp.v) * .03)) : 0; V.body.rotation.x = pitch; }
      const gunW = V3(vp.x, gy0 + V.gunZ + .2, vp.z); api.vstate = { cp, vp };
      const distC = p => Math.max(1, cur.position.distanceTo(p)), px = p => distC(p) * Math.tan(cur.fov * DEG / 2) * 2 / Math.max(H2, 1); // metres per pixel at p
      const segA = V3(0, 0, 0), segB = V3(0, 0, 0), segM = V3(0, 0, 0);
      const beam = (A, B, wpx, minW, r, g, bl, al) => { const n = 14; for (let i = 0; i < n; i++) { const f0 = (i / n) ** 2, f1 = ((i + 1) / n) ** 2; segA.lerpVectors(A, B, f0); segB.lerpVectors(A, B, f1); segM.lerpVectors(segA, segB, .5); const w = Math.max(minW, px(segM) * wpx); rib.add(segA, segB, w, r, g, bl, al, al); } };
      const beamC = (A, B, wpx, minW, r, g, bl, al) => { // finer near the camera end
        const da = distC(A), db = distC(B); if (da > db) beam(B, A, wpx, minW, r, g, bl, al); else beam(A, B, wpx, minW, r, g, bl, al); };
      let deadT = -1, focusM = null, near = 1e9;
      for (const o of Ms) {
        const th = o.th, e = th.viz.end, tt = TH[th.key], k = th.idx;
        if (tt.guidance === 'drone') { const yb = latV(th, Math.min(t, e.t)), ab = th.brg * DEG, tv = t > e.t && rc.crew ? HK.crewPos(rc.crew, e.t) : null, tx = tv ? tv.x : vp.x, tz = tv ? -tv.n : vp.z; th._cx = tx - yb * Math.cos(ab); th._cz = tz - yb * Math.sin(ab); }   // a drone is flown onto the tank where it actually is, not where it was at launch o.mm.visible = false; o.tag.on = false; o.tag.d = null;
        if (o.L.model.userData.rotor) o.L.model.userData.rotor.rotation.y = wallS * 40;
        const la = t - th.t0;
        if (la >= 0 && la < 4 && tt.guidance !== 'drone') { if (la < .12) { fir.add(o.L.sight.x, o.L.sight.y, o.L.sight.z, 6 * (1 - la / .12) + 2, 1, 1, .85, .55); }
          for (let i = 0; i < 6; i++) { const a = r1(k * 13 + i, 5) * 6.283, d = (1.5 + 5 * r1(k * 13 + i, 6)) * (1 - Math.exp(-la * 2)); tmpA.set(o.L.sight.x + Math.cos(a) * d, o.L.sight.y - .5 + la * .8, o.L.sight.z + Math.sin(a) * d); smk.add(tmpA.x, tmpA.y, tmpA.z, 2 + la * 3, .5 * (1 - la / 4), .74, .7, .62, a, i & 3); } }
        const m = mS(th, t);
        if (m) {
          const P0 = Wp(th, m.x, m.y, m.z), m2 = mS(th, t + .03) || m, P1 = Wp(th, m2.x, m2.y, m2.z);
          o.mm.visible = true; o.mm.position.copy(P0); if (P1.distanceToSquared(P0) > 1e-6) o.mm.lookAt(P1); if (tt.guidance === 'drone') { const ma = mS(th, t - .12) || m, mb = mS(th, t + .12) || m, acc = (mb.y - 2 * m.y + ma.y) / .0144, roll = Math.max(-1.1, Math.min(1.1, Math.atan(acc / 9.81))); o.roll = (o.roll || 0) + (roll - (o.roll || 0)) * .06; o.mm.userData.body.rotation.z = -o.roll; for (const p of o.mm.userData.props) p.rotation.y = wallS * 70 + p.position.x * 9; o.fp = o.fp || { P: V3(), D: V3() }; o.fp.P.copy(P0); tmpC.subVectors(P1, P0).normalize(); if (o.fp.D.lengthSq() < .5 || api.cut) o.fp.D.copy(tmpC); else o.fp.D.lerp(tmpC, .07).normalize(); o.fp.x = m.x; o.fp.alt = P0.y - hS(P0.x, P0.z); o.fp.spd = P1.distanceTo(P0) / .03; } else o.mm.userData.body.rotation.z = wallS * 9;
          o.tag.on = true; o.tag.d = m.blind ? 1e6 + m.x : m.x; o.tag.p.copy(P0); o.tag.p.y += Math.max(2, px(P0) * 18); const em = o.tag.el.lastChild, st = m.blind ? 'BLIND' : (m.x >= 1000 ? (m.x / 1000).toFixed(1) + ' km' : Math.round(m.x) + ' m'); if (em.textContent !== st) { em.textContent = st; o.tag.el.classList.toggle('blind', m.blind); }
          if (tt.guidance !== 'drone') { tmpA.subVectors(P0, P1).normalize(); const sz = Math.max(.9, px(P0) * 5), fl = .8 + .4 * hsh(Math.floor(wallS * 40), k);
            fir.add(P0.x + tmpA.x * .7, P0.y + tmpA.y * .7, P0.z + tmpA.z * .7, sz * fl, 1, 1, .85, .55); fir.add(P0.x + tmpA.x, P0.y + tmpA.y, P0.z + tmpA.z, sz * 2.4, .35, 1, .55, .25);
            const K = 30, step = .1, n0 = Math.floor(t / step); for (let q = 1; q < K; q++) { const tq = (n0 - q) * step; if (tq < th.t0) break; const mq = mS(th, tq); if (!mq) continue; const pq = Wp(th, mq.x, mq.y, mq.z, tmpB), f = (t - tq) / (K * step); smk.add(pq.x + (r1(k, n0 - q) - .5) * f * 3, pq.y + f * 1.2, pq.z + (r1(k + 5, n0 - q) - .5) * f * 3, .8 + f * 5, .42 * (1 - f) * (1 - f), .86, .85, .83, q * 1.7, q & 3); } }
          if (overlay2 && (tt.guidance === 'beam_rider' || tt.guidance === 'radio_saclos')) { if (!m.blind) beamC(o.L.sight, P0, 1.6, .03, 1, .14, .09, .9); }
          if (overlay2 && tt.guidance === 'sal' && !m.blind) beamC(o.L.sight, gunW, 1.4, .03, 1, .14, .09, .5);
          if (th.track !== null && t >= th.track && overlay2) beamC(gunW, P0, 1, .02, .24, .82, .78, .22);
          const dd = m.x; if (opt.focus === k || (opt.focus == null && dd < near)) { near = opt.focus === k ? -1 : dd; focusM = { o, P: P0, dir: tmpA.clone(), m }; }
        } else if (t >= e.t) {
          const ea = t - e.t, P = Wp(th, ...endPos(th).toArray());
          if (e.type === 'miss') { const fwd = Wp(th, -1, 0, 0).sub(Wp(th, 0, 0, 0)).normalize(); const fa = Math.min(ea, 1.2); tmpA.copy(P).addScaledVector(fwd, fa * th.v); const gy = hS(tmpA.x, tmpA.z) + .3; tmpA.y = P.y + (gy - P.y) * Math.min(1, fa / 1.2) ** 2;
            if (ea < 1.2) { o.mm.visible = true; o.mm.position.copy(tmpA); tmpB.copy(tmpA).add(fwd); o.mm.lookAt(tmpB); fir.add(tmpA.x - fwd.x, tmpA.y, tmpA.z - fwd.z, Math.max(.9, px(tmpA) * 5), 1, 1, .8, .5); }
            else if (ea < 7) blast(tmpA, ea - 1.2, 'ground', k * 7 + 1); }
          else if (e.type === 'ground') { const gp2 = P.clone(); gp2.y = hS(gp2.x, gp2.z) + .2; blast(gp2, ea, 'ground', k * 7 + 1); }
          else if (ea < 9) { if (e.type === 'hit') P.set(vp.x, tt.guidance === 'drone' ? 2.8 : 2, vp.z); blast(P, ea, e.type, k * 7 + 1); if (e.type === 'hit' && e.killing) deadT = deadT < 0 ? e.t : Math.min(deadT, e.t); }
          if (ea < .2) { const hv = e.type === 'hit' ? 1.5 : .8; if (hv > hot) { hot = hv; hotAt.copy(P); } }
        }
      }
      // gun, rounds and clouds
      const vols = [], useVol = vol && q2 >= 2; let vFloor = 1e9;
      let gb = null, gel = 0; const cr = carbonS ? .2 : .8, cb = carbonS ? .215 : .78, k0 = rc.ctx.k || cf.rnd.drag_k_ref, v0 = cf.rnd.muzzle_v; let muz = 0;
      for (const b of rc.bursts) {
        if (b.idx < 0) continue; const th = rc.threats[b.idx], F = fr(th);
        if (b.tf <= t + .8 && b.tf > t - 6) { gb = th.brg; const r0 = b.rounds[0]; if (r0) gel = Math.atan2(zLine(F, r0.d) - V.gunZ, Math.max(30, r0.d)); }
        for (const r of b.rounds) {
          if (t < r.t_fire) continue; const fa = t - r.t_fire; if (fa < .07) muz = Math.max(muz, 1 - fa / .07);
          if (fa < 1.6) smk.add(gunW.x + Math.sin(th.brg * DEG) * (4 + fa * 3), gunW.y + fa * 1.2, gunW.z - Math.cos(th.brg * DEG) * (4 + fa * 3), 1 + fa * 3.5, .32 * (1 - fa / 1.6), .8, .8, .78, r.t_fire * 9, 1);
          const tb = r.t_burst != null ? r.t_burst : r.t_pass, mq = r.bx != null ? null : mS(th, Math.min(tb, th.viz.end.t - .01)), tgt = r.bx != null ? [r.bx, r.by, r.bz] : [r.d, (mq ? mq.y : yBeam(th, r.d, tb)) + (r.ey || (b.kind === 'he' && r.fate !== 'he_kill' ? (r1(Math.floor(r.t_fire * 17), 3) - .5) * 14 : 0)), (mq ? mq.z : zLine(F, r.d)) + (r.ez || 0)], s1 = HK.sOfTau(fa, v0, k0), down = r.fate === 'downrange' || r.fate === 'false_trigger' && false;
          if (t <= tb || (down && s1 < tgt[0] + 900)) { const f = s1 / Math.max(tgt[0], 1), f0 = HK.sOfTau(Math.max(0, fa - .012), v0, k0) / Math.max(tgt[0], 1);
            const TP = Wp(th, tgt[0], tgt[1], tgt[2]), A = gunW.clone().lerp(TP, f0), B = gunW.clone().lerp(TP, f);
            rib.add(A, B, Math.max(.06, px(B) * 1.8), 1, b.kind === 'he' ? .45 : .85, b.kind === 'he' ? .2 : .5, 0, 1); fir.add(B.x, B.y, B.z, Math.max(.3, px(B) * 4), 1, 1, .9, .6); continue; }
          const xa = t - tb; if (r.fate === 'downrange') continue;
          const BP = Wp(th, tgt[0], tgt[1], tgt[2]);
          if (b.kind === 'he') { if (xa < 2.5) { if (xa < .08) fir.add(BP.x, BP.y, BP.z, 7 * (1 - xa / .08) + 2, 1, 1, .8, .5); for (let i = 0; i < 4; i++) { const a = r1(r.t_fire * 3, i) * 6.283; smk.add(BP.x + Math.cos(a) * xa * 1.5, BP.y + xa * .6, BP.z + Math.sin(a) * xa * 1.5, 2 + xa * 3, .55 * (1 - xa / 2.5), .14, .14, .15, a, i); } } continue; }
          if (xa < .1) { fir.add(BP.x, BP.y, BP.z, 9 * (1 - xa / .1) + 2, 1, 1, .86, .62); if (.6 > hot) { hot = .6; hotAt.copy(BP); } for (let j = 0; j < 6; j++) { const a = r1(r.t_fire * 7, j) * 6.283, e2 = r1(r.t_fire * 7 + 1, j) * 2 - 1; tmpA.set(BP.x + Math.cos(a) * xa * 60, BP.y + e2 * xa * 40, BP.z + Math.sin(a) * xa * 60); tmpB.set(BP.x + Math.cos(a) * xa * 35, BP.y + e2 * xa * 23, BP.z + Math.sin(a) * xa * 35); rib.add(tmpB, tmpA, .15, 1, .8, .5, 0, 1 - xa / .1); } }
        }
        if (b.kind === 'obs' && b.puffs) for (let pi = 0; pi < b.puffs.length; pi++) {
          const p = b.puffs[pi], age = t - (b.t_ref + p.tf); if (age < 0 || age > 16 || p.x == null) continue;
          const sig = Math.sqrt(p.s0 * p.s0 + 2 * rc.ctx.K * age), tauC = cf.obs.alpha_m2_per_g * p.m / (2 * Math.PI * sig * sig), op = Math.min(.95, .25 + tauC * .35) * Math.min(1, age * 5) * Math.min(1, (16 - age) / 4);
          const C = Wp(th, p.x + (p.wa || 0) * age, p.y + (b.wind_cross || 0) * age, p.z + .08 * age); const sd = Math.floor(b.tf * 31) + pi * 7;
          if (useVol) { const fadeV = Math.min(1, age * 4) * Math.min(1, (16 - age) / 4); vols.push({ x: C.x, y: C.y, z: C.z, s: sig, k: fadeV * cf.obs.alpha_m2_per_g * p.m / (15.75 * sig * sig * sig) }); vFloor = Math.min(vFloor, hS(C.x, C.z) - .3); }
          for (let j = 0; j < (useVol ? 3 : 9); j++) { if (useVol && !j) continue; const a = r1(sd, j) * 6.283, e2 = r1(sd + 1, j) * 2 - 1, rad = j ? sig * 1.1 * (.4 + .6 * r1(sd + 2, j)) : 0, cy2 = Math.sqrt(1 - e2 * e2), sh = .8 + .5 * r1(sd + 4, j);
            smk.add(C.x + Math.cos(a) * cy2 * rad * (useVol ? 1.4 : 1), C.y + e2 * rad * .7, C.z + Math.sin(a) * cy2 * rad * (useVol ? 1.4 : 1), sig * (j ? 1.5 + .7 * r1(sd + 3, j) : 2.3), op * (j ? .75 : .85) * (useVol ? .3 : 1), cr * sh, cr * sh, cb * sh, a + age * .08 * (j % 2 ? 1 : -1), (j + pi) & 3); }
        }
      }
      if (vol) { if (useVol && vols.length) { const u = vol.m.uniforms; u.uSun.value.copy(sunD); u.uSunC.value.setRGB(...wxs.sc); u.uAmb.value.setRGB(...wxs.amb); u.uAlb.value.setRGB(cr, cr, cb); u.uTime.value = wallS; u.uFogC.value.set(wxs.hor); u.uFogD.value = sc.fog.density; vol.set(vols, vFloor); } else vol.mesh.visible = false; }
      // turret: the commander slews it onto the warning bearing at once (override handle); HKOI's mount slews on top of it
      const dead = deadT >= 0 && t >= deadT, ts = tStep > 0 && tStep <= .25 ? tStep : 0, jumped = tStep < 0 || tStep > .25;
      let aim = gb; if (aim === null) { let bd = 1e9; for (const th of rc.threats) { const kn = Math.min(th.cue != null ? th.cue : 1e9, th.track != null ? th.track : 1e9); if (t >= kn && t < th.viz.end.t) { const d = HK.distAt(th, t); if (d < bd) { bd = d; aim = th.brg; } } } }
      if (turB == null || api.cut || jumped) { turB = aim !== null ? aim : (turB == null ? cp.h : turB); if (aim !== null) gunB2 = aim; }
      else if (!dead && duelAim(t) !== null) { const TR = 40, dT = ((duelAim(t) - turB + 540) % 360) - 180; turB += Math.sign(dT) * Math.min(Math.abs(dT), TR * ts); if (aim !== null) { const d = ((aim - gunB2 + 540) % 360) - 180; gunB2 += Math.sign(d) * Math.min(Math.abs(d), cf.gun.slew_az_dps * ts); } }
      else if (!dead && aim !== null) { const TR = cf.gun.turret_assist_dps || 40, dT = ((aim - turB + 540) % 360) - 180; turB += Math.sign(dT) * Math.min(Math.abs(dT), TR * ts);
        const want = aim, d = ((want - gunB2 + 540) % 360) - 180; gunB2 += Math.sign(d) * Math.min(Math.abs(d), (cf.gun.slew_az_dps + TR) * ts); }
      if (!dead && gb !== null) gunE2 += (gel - gunE2) * (1 - Math.exp(-Math.max(ts, dt * .2) * 7));
      api.turRel = ((turB - cp.h + 540) % 360) - 180; V.tur.rotation.y = -api.turRel * DEG; if (V.model && V.model.tp) V.model.tp.rotation.y = -api.turRel * DEG;
      V.rws.rotation.y = -(gunB2 - turB) * DEG; V.gunPivot.rotation.x = gunE2;
      if (muz > 0) { tmpA.set(gunW.x + Math.sin(gunB2 * DEG) * 2.6, gunW.y + .1, gunW.z - Math.cos(gunB2 * DEG) * 2.6); fir.add(tmpA.x, tmpA.y, tmpA.z, 2.2 + 2 * hsh(Math.floor(wallS * 60), 3), muz, 1, .9, .62); if (muz * .7 > hot) { hot = muz * .7; hotAt.copy(tmpA); } }
      // APS
      for (const ap of rc.aps) { const aa = t - ap.t; if (aa < -.05 || aa > 3) continue; const th = rc.threats[ap.idx], a = th.brg * DEG, dx = Math.sin(a), dz = -Math.cos(a); tmpA.set(vp.x + dx * 2, 2.2, vp.z + dz * 2); tmpB.set(vp.x + dx * 14, 2.4, vp.z + dz * 14);
        if (aa < .05) { tmpC.lerpVectors(tmpA, tmpB, Math.max(0, aa + .05) / .1); rib.add(tmpA, tmpC, .5, .82, .72, 1, .2, 1); }
        else { const ba = aa - .05; if (ba < .1) { fir.add(tmpB.x, tmpB.y, tmpB.z, 8 + 10 * ba / .1, 1 - ba / .1, .86, .8, 1); if (1 > hot) { hot = 1; hotAt.copy(tmpB); } }
          for (let i = 0; i < 6; i++) { const an = r1(ap.idx + 33, i) * 6.283; smk.add(tmpB.x + Math.cos(an) * ba * 2, tmpB.y + ba * 1.2, tmpB.z + Math.sin(an) * ba * 2, 2 + ba * 4, .5 * (1 - ba / 2.95), .45, .45, .48, an, i & 3); } } }
      // vehicle damage, dust and smoke screen
      teamsFrame(t); duelFrame(t, vp, gy0, deadT >= 0 && t >= deadT); wingFrame(t, vp, gy0, deadT >= 0 && t >= deadT); damageFrame(t, deadT, null, vp); { let rel = null, kt = 1e9; for (const th of rc.threats) { const e = th.viz.end; if (e.type === 'hit' && e.killing && e.t < kt) { kt = e.t; rel = th.brg - cp.h; } } bailFrame(t, deadT, rel); }
      if (deadT >= 0) { const age = t - deadT; for (let i = 0; i < 6; i++) { const L = .7, a = (wallS + i / 6 * L) % L; fir.add(vp.x + (r1(91, i) - .5) * 3, 2 + a * 6, vp.z + (r1(92, i) - .5) * 3, 5 * (1 - a / L) + 1.5, .9 * (1 - a / L), 1, .55, .15); }
        for (let i = 0; i < 24; i++) { const L = 9, a = (wallS + i / 24 * L) % L; if (a > age) continue; const kq = a / L; smk.add(vp.x + (r1(93, i) - .5) * 3 + rc.ctx.wind * Math.sin(rc.ctx.wind_dir * DEG) * a * .4, 3 + a * 5, vp.z + (r1(94, i) - .5) * 3 - rc.ctx.wind * Math.cos(rc.ctx.wind_dir * DEG) * a * .4, 3 + a * 2.6, .8 * Math.min(1, a * 3) * (1 - kq), .05 + kq * .14, .05 + kq * .14, .055 + kq * .14, i + a * .2, i & 3); }
        if (.5 > hot) { hot = .5 + .1 * Math.sin(wallS * 20); hotAt.set(vp.x, 3, vp.z); } }
      if (rc.crew && rc.crew.evade !== null && t > rc.crew.evade) for (let i = 0; i < 22; i++) { const L = 2.6, a = (wallS + i / 22 * L) % L, tb = t - a; if (tb < rc.crew.evade) continue; const q = HK.crewPos(rc.crew, tb); if (Math.abs(q.v) < .4) continue; const hh = q.h * DEG, fx = Math.sin(hh), fz = -Math.cos(hh), sgn = q.v > 0 ? -1 : 1, kq = a / L, sd = (i % 2 ? 1 : -1) * 1.7, x0 = q.x, z0 = -q.n;
        smk.add(x0 + fx * sgn * 4 + fz * -sd + (r1(i, 71) - .5) * a * 3, hS(x0, z0) + .5 + a * 1.4, z0 + fz * sgn * 4 + fx * sd + (r1(i, 72) - .5) * a * 3, 1.6 + a * 4, .5 * (1 - kq) * Math.min(1, a * 6) * Math.min(1, Math.abs(q.v) / 3), .66, .58, .45, i + a * .3, i & 3); }
      if (rc.crew && rc.crew.smoke !== null && t >= rc.crew.smoke) { const c = rc.crew, sa = t - c.smoke, grow = Math.max(0, Math.min(1, sa / c.form)), fade = Math.max(0, Math.min(1, (c.smoke + c.form + c.dur + 3 - t) / 3)), q0 = HK.crewPos(c, c.smoke), bx = q0.x, bz = -q0.n, hs = q0.h * DEG;
        for (let i = 0; i < 9; i++) { const a = hs + (i - 4) * .38, rx = Math.sin(a), rz = -Math.cos(a), R0 = 22 + (i % 2) * 4, fl = Math.min(1, sa / .5);
          if (sa < .5) { tmpA.set(bx + rx * R0 * fl, 3 + 6 * Math.sin(fl * Math.PI), bz + rz * R0 * fl); smk.add(tmpA.x, tmpA.y, tmpA.z, .8, .8, .9, .9, .9, 0, 0); }
          else for (let j = 0; j < 4; j++) { const s = i * 5 + j, rad = (2 + 7 * grow) * (.4 + r1(s, 60)), an = r1(s, 61) * 6.283; smk.add(bx + rx * R0 + Math.cos(an) * rad, 1.5 + grow * (2 + 6 * r1(s, 62)), bz + rz * R0 + Math.sin(an) * rad, (4 + 14 * grow) * (.7 + .5 * r1(s, 63)), .7 * Math.min(1, (sa - .5) * 4) * fade, .72, .73, .74, an + sa * .05, s & 3); } } }
      // cameras
      const mode = api.mode; let want, look, fov = 50, stiff = 4;
      const cen = (() => { let sx = 0, sz = 0; for (const th of rc.threats) { sx += Math.sin(th.brg * DEG); sz += -Math.cos(th.brg * DEG); } const a = Math.atan2(sx, -sz); return { a, x: Math.sin(a), z: -Math.cos(a) }; })();
      if (mode === 'cmd' || mode === 'cdr') { want = V3(vp.x - cen.x * 26 + cen.z * 7, gy0 + 8.5, vp.z - cen.z * 26 - cen.x * 7); look = V3(vp.x + cen.x * 600, 0, vp.z + cen.z * 600); fov = 46; }
      else if (mode === 'platoon') { let cx = vp.x, cz = vp.z, n = 1; for (const W of Wg) { cx += W.g.position.x; cz += W.g.position.z; n++; } cx /= n; cz /= n; let sp = 60; for (const W of Wg) sp = Math.max(sp, Math.hypot(W.g.position.x - cx, W.g.position.z - cz)); let ax2 = 0, az2 = 0; for (const W of Wg) for (const m of W.ms) if (t < m.th.viz.end.t + 3) { ax2 += m.lp.x - cx; az2 += m.lp.z - cz; } for (const o of Ms) if (t < o.th.viz.end.t + 3) { const lp = Wp(o.th, o.th.R, 0, 0, tmpB); ax2 += lp.x - cx; az2 += lp.z - cz; }
        const hh2 = rc.ctx.hull * DEG, al = Math.hypot(ax2, az2), bx = al > 1 ? -ax2 / al : -Math.sin(hh2), bz = al > 1 ? -az2 / al : Math.cos(hh2), D = sp * 1.5 + 110;
        want = V3(cx + bx * D * 1.05, hS(cx, cz) + D * .42, cz + bz * D * 1.05); look = V3(cx - bx * sp * 1.6, 2, cz - bz * sp * 1.6); fov = 52; stiff = 2.5; }
      else if (mode === 'top') { const D = Math.min(maxRS, 9000) * 1.25; want = V3(vp.x + cen.x * D * .45 - cen.x * 1, D * 1.05, vp.z + cen.z * D * .45 + 1); look = V3(vp.x + cen.x * D * .45, 0, vp.z + cen.z * D * .45); fov = 50; stiff = 3; }
      else if (mode === 'chase' && focusM) { const P = focusM.P, d = focusM.dir; want = V3(P.x + d.x * 16 + d.z * 3, P.y + 3.5, P.z + d.z * 16 - d.x * 3); look = V3(P.x - d.x * 120, P.y - 2, P.z - d.z * 120); fov = 55; stiff = 12; }
      else if (mode === 'enemy') { const o = Ms.find(x => x.th.idx === api.enemyIdx) || Ms.find(x => x.th.idx === opt.focus) || (focusM && focusM.o) || Ms[0]; fpvUp = null; api.enemyInfo = null;
        if (o) { const th = o.th, tt = TH[th.key], e = th.viz.end, drone = tt.guidance === 'drone', ph = t < th.t0 ? 'wait' : t < e.t ? 'fly' : 'end', inf = api.enemyInfo = { idx: th.idx, key: th.key, drone, phase: ph, end: e.type, d: Math.max(0, HK.distAt(th, Math.min(t, e.t))), R: th.R, ta: t - th.t0, te: t - e.t };
          if (drone && ph !== 'wait' && o.fp) { const P = o.fp.P, D = o.fp.D; want = V3(P.x + D.x * .5, P.y + .25, P.z + D.z * .5); { const tx = vp.x - P.x, ty = 2.2 - P.y, tz = vp.z - P.z, tn = Math.hypot(tx, ty, tz) || 1, w = ph === 'fly' ? Math.max(.6, Math.min(.97, 1.3 - tn / 1500)) : 0, lx = D.x * (1 - w) + tx / tn * w, ly = D.y * (1 - w) + ty / tn * w, lz = D.z * (1 - w) + tz / tn * w; look = V3(P.x + lx * 60, P.y + .25 + ly * 60, P.z + lz * 60); }   // the pilot flies the path but keeps the tank in frame
            fov = 62; stiff = 30; tmpA.set(vp.x, 2, vp.z).project(cm); if (tmpA.z < 1 && Math.abs(tmpA.x) < 1 && Math.abs(tmpA.y) < 1) { inf.tx = tmpA.x * .5 + .5; inf.ty = -tmpA.y * .5 + .5; } if (ph === 'fly') { o.mm.visible = false; const r = (o.roll || 0) * .55, rx = -D.z, rz = D.x, n = Math.hypot(rx, rz) || 1; fpvUp = [-rx / n * Math.sin(r), Math.cos(r), -rz / n * Math.sin(r)]; } inf.alt = o.fp.alt; inf.spd = o.fp.spd; inf.roll = o.roll || 0; }
          else { want = o.L.sight.clone(); want.y += .3; look = V3(vp.x, 1.6, vp.z); const D = want.distanceTo(look), sf = SFOV[th.key] || (drone ? 40 : 5); fov = sf; stiff = 20; inf.D = D; inf.fov = sf;
            if (!drone && ph === 'fly') { const a = (api.enemyJit == null ? 3 : api.enemyJit) * .001 * D * .5; look.x += a * (Math.sin(wallS * 2.1 + th.idx) + .5 * Math.sin(wallS * 5.3)); look.y += a * (Math.sin(wallS * 1.7 + 2 + th.idx) + .5 * Math.sin(wallS * 6.1)); } tmpA.set(vp.x, 2, vp.z).project(cm); inf.tx = (tmpA.x * .5 + .5); inf.ty = (-tmpA.y * .5 + .5); } } }
      else if (mode === 'bail') { const c = bail && bail.find(q => q.who === (api.povRole || 'cdr')); api.bailInfo = null;   // the escape through the eyes of the man getting out
        if (c && c.g.visible && c.ph) { const P = c.g.position, ry = c.g.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry), ph = c.ph, hy = ph === 'prone' ? .38 : ph === 'wait' ? 1.0 : ph === 'rise' ? .75 : 1.6, bobv = ph === 'run' ? Math.abs(Math.sin(c.gait)) * .09 : 0, sway = ph === 'run' ? Math.sin(c.gait) * .05 : 0;
          want = V3(P.x - fz * sway, P.y + hy + bobv, P.z + fx * sway);
          if (ph === 'prone' || ph === 'wait') look = V3(vp.x, gy0 + 2.2, vp.z); else if (ph === 'rise') look = V3(P.x + fx * 6, P.y + 9, P.z + fz * 6); else if (ph === 'jump') look = V3(P.x + fx * 6, P.y - 1.5, P.z + fz * 6); else if (ph === 'run' && c.dir) look = V3(P.x + c.dir.x * 20, P.y + hy - .6 + Math.sin(c.gait * .5) * .4, P.z + c.dir.z * 20); else look = V3(P.x + fx * 8, P.y + .6, P.z + fz * 8);
          fov = ph === 'run' ? 84 : 76; stiff = ph === 'prone' ? 3 : 14; c.g.visible = false; api.bailInfo = { ph, hurt: !!c.hurt, help: !!c.helpOf, who: c.who }; }
        else { want = V3(vp.x - cen.x * 26 + cen.z * 7, gy0 + 8.5, vp.z - cen.z * 26 - cen.x * 7); look = V3(vp.x, 2, vp.z); fov = 46; } }
      else if (mode === 'gun') { const tgt = gunTarget(t, focusM); want = gunW.clone(); look = tgt.p; fov = tgt.fov; stiff = 9; }
      if (!want) { const a = (cen.a / DEG + orbA) * DEG, e = orbE * DEG; want = V3(vp.x - Math.sin(a) * Math.cos(e) * orbD, 2 + Math.sin(e) * orbD, vp.z + Math.cos(a) * Math.cos(e) * orbD); look = V3(vp.x, gy0 + 2, vp.z); fov = 50; stiff = 10; }
      if (window.__sbxDbg) { const d = window.__sbxDbg; want = V3(vp.x + d.p[0], gy0 + d.p[1], vp.z + d.p[2]); look = V3(vp.x + d.l[0], gy0 + d.l[1], vp.z + d.l[2]); fov = d.fov || 50; api.cut = true; }
      if (window.__sbxDbgT != null && teams[window.__sbxDbgT]) { const T = teams[window.__sbxDbgT], d = window.__sbxDbgTp || [6, 3, 6]; tmpA.set(d[0], d[1], d[2]); T.g.localToWorld(tmpA); want = tmpA.clone(); look = T.g.position.clone(); look.y += .8; fov = 45; api.cut = true; }
      if (!camP2 || api.cut) { camP2 = want.clone(); camL2 = look.clone(); camF2 = fov; api.cut = false; }
      else { const kk = 1 - Math.exp(-dt * stiff); camP2.lerp(want, kk); camL2.lerp(look, kk); camF2 += (fov - camF2) * kk; }
      cm.position.copy(camP2); cm.position.y = Math.max(cm.position.y, hS(cm.position.x, cm.position.z) + 1.5); cm.up.set(0, 1, 0); if (mode === 'top') cm.up.set(cen.x, 0, cen.z); if (mode === 'enemy' && fpvUp) cm.up.set(fpvUp[0], fpvUp[1], fpvUp[2]); cm.lookAt(camL2); if (Math.abs(cm.fov - camF2) > .001) { cm.fov = camF2; cm.updateProjectionMatrix(); }
      // gun camera picture-in-picture
      const gtg = gunTarget(t, focusM); gc.position.copy(gunW); gc.lookAt(gtg.p); gc.fov = gtg.fov; gc.updateProjectionMatrix(); api.gunInfo = gtg;
      bl2.intensity = Math.min(2, hot) * 18; bl2.position.copy(hotAt); bl2.position.y += 2;
      sun2.position.copy(vp).addScaledVector(sunD, 300); sun2.target.position.copy(vp); sky2.material.uniforms.time.value = wallS;
      cur = cm; cm.updateMatrixWorld(); cm.matrixWorldInverse.copy(cm.matrixWorld).invert(); smk.m.uniforms.sunV.value.copy(sunD).transformDirection(cm.matrixWorldInverse);
      if (grass) grass.m.userData.u && (grass.m.userData.u.uT.value = wallS, grass.m.userData.u.uW.value = Math.min(1.5, .3 + rc.ctx.wind * .12));
      if (mode === 'xray') { xrayRender(dt); return; }
      if (mode === 'cdr' && cab) { inside(t, dt, cp, vp, gy0, focusM, deadT, muz); return; }
      if (mode === 'gps' || mode === 'citv' || mode === 'hsight') { tagTherm(); sightView(mode, t, focusM, cp, vp, gy0, deadT); return; }
      SIGHT.info = null;
      labelsEl.style.visibility = '';
      smk.flush(); fir.flush(); rib.flush(); place(cm);
      if (post2 && q2 >= 1) post2.render(sc, cm, wallS); else { R2.setRenderTarget(null); R2.render(sc, cm); }
      api.pipOn = pip && mode !== 'gun' && mode !== 'enemy' && mode !== 'bail' && cf.hkoi_enabled && W2 > 520;
      if (api.pipOn) { const pw = Math.round(W2 * .28), ph = Math.round(pw * .66), x0 = W2 - pw - 14, y0 = 14; gc.aspect = pw / ph; gc.updateProjectionMatrix(); cur = gc; gc.updateMatrixWorld(); smk.flush(); fir.flush(); rib.flush();
        R2.setRenderTarget(null); R2.setScissorTest(true); R2.setScissor(x0, H2 - y0 - ph, pw, ph); R2.setViewport(x0, H2 - y0 - ph, pw, ph); R2.render(sc, gc); R2.setScissorTest(false); R2.setViewport(0, 0, W2, H2); cur = cm; api.pipRect = [x0, y0, pw, ph]; }
    }
    // ---- the commander's station: the outside world through the vision blocks and the gun camera, the crew around you
    function inside(t, dt, cp, vp, gy0, focusM, deadT, muz) {
      if (window.__look) { lookY = window.__look.y || 0; lookP = window.__look.p || 0; }
      labelsEl.style.visibility = 'hidden'; api.pipOn = false;
      const hh = (cp.h + (api.turRel || 0)) * DEG, fx = Math.sin(hh), fz = -Math.cos(hh);
      // the outside as the cupola sees it: two 120-degree views, left and right of the turret's axis, vibrating with the vehicle
      { const vib = Math.min(.012, Math.abs(cp.v) * .001) + (muz > 0 ? .006 : 0), jx = Math.sin(wallS * 9.1) * vib, jy = Math.sin(wallS * 7.3 + 1) * vib, RT = cab.periRT; RT.scissorTest = true; pcam.fov = 2 * Math.atan(Math.tan(60 * DEG) / 4) / DEG; pcam.aspect = 4; pcam.near = 3.4; pcam.updateProjectionMatrix();
        for (let hf = 0; hf < 2; hf++) { const a2 = hh + (hf ? 60 : -60) * DEG, ax = Math.sin(a2), az = -Math.cos(a2); pcam.position.set(vp.x + fx * .1 - fz * .7, gy0 + 2.95 + jy, vp.z + fz * .1 + fx * .7); pcam.up.set(0, 1, 0); pcam.lookAt(pcam.position.x + ax * 100, pcam.position.y + jx * 30, pcam.position.z + az * 100); pcam.updateMatrixWorld();
          RT.viewport.set(hf * 1024, 0, 1024, 256); RT.scissor.set(hf * 1024, 0, 1024, 256); cur = pcam; smk.flush(); fir.flush(); rib.flush(); R2.setRenderTarget(RT); R2.render(sc, pcam); } }
      if (cf.hkoi_enabled) { gc.aspect = 640 / 400; gc.updateProjectionMatrix(); cur = gc; gc.updateMatrixWorld(); smk.flush(); fir.flush(); rib.flush(); R2.setRenderTarget(cab.gunRT); R2.render(sc, gc); }
      else { R2.setRenderTarget(cab.gunRT); R2.setClearColor(0x050808, 1); R2.clear(); }
      if (cab.view === 'drv') { pcam.near = .3; const h0 = cp.h * DEG, dx = Math.sin(h0), dzz = -Math.cos(h0); pcam.position.set(vp.x + dx * 3.2, gy0 + 1.3, vp.z + dzz * 3.2); pcam.up.set(0, 1, 0); pcam.fov = 34; pcam.aspect = 4; pcam.updateProjectionMatrix(); pcam.position.y += Math.sin(wallS * 8.3) * Math.min(.015, Math.abs(cp.v) * .0012); pcam.lookAt(pcam.position.x + dx * 100, pcam.position.y - 3, pcam.position.z + dzz * 100); pcam.updateMatrixWorld(); cur = pcam; smk.flush(); fir.flush(); rib.flush(); R2.setRenderTarget(cab.drvRT); R2.render(sc, pcam); }
      R2.setRenderTarget(null); cur = cm;
      // what the crew feels
      let alarm = false, rel = null, bestD = 1e9, hitAge = null, apsAge = null;
      for (const th of rc.threats) { const e = th.viz.end; if (th.cue != null && t >= th.cue && t < e.t) { alarm = true; const d = HK.distAt(th, t); if (d < bestD) { bestD = d; rel = th.brg - cp.h; } }
        if (e.type === 'hit' && t >= e.t) { const a = t - e.t; if (hitAge == null || a < hitAge) hitAge = a; } }
      for (const ap of rc.aps) if (t >= ap.t) { const a = t - ap.t; if (apsAge == null || a < apsAge) apsAge = a; }
      const stress = rc.crew ? HK.crewStress(rc.crew, t) : 10, killed = deadT >= 0 && t >= deadT;
      api.inside = { stress, alarm, rel, killed };
      cab.cam.aspect = W2 / Math.max(H2, 1); let armNow = false;
      { let obs = 0, he = 0, arm = false; for (const b of rc.bursts) { if (b.kind === 'false' && b.tf <= t) obs += cf.gun.burst; for (const r of b.rounds || []) if (r.t_fire <= t) { if (b.kind === 'he') he++; else obs++; } if (b.idx >= 0 && t >= b.tf - .8 && t <= b.tf + 2.5) arm = true; } armNow = arm;
        cab.setStatus({ on: cf.hkoi_enabled, arm: arm && cf.hkoi_enabled, obs: Math.max(0, cf.gun.obscurant_rounds - obs), he: Math.max(0, cf.gun.he_rounds - he), az: gunB2 - cp.h, tur: api.turRel || 0 }); }
      const hr = inside.h0 == null ? 0 : ((cp.h - inside.h0 + 540) % 360 - 180) / Math.max(dt, 1e-3); inside.h0 = cp.h;
      { let bK = 0, bA = null; for (const th of rc.threats) { const e = th.viz.end, a = t - e.t; if (a < 0 || a > 2.5) continue; const K = e.type === 'miss' ? Math.max(0, 1 - (e.miss || 12) / 25) : e.type === 'aps_kill' ? .9 : e.type === 'ground' ? Math.max(0, 1 - (e.short || 60) / 120) : e.type === 'he_kill' ? Math.max(0, 1 - (e.d || 500) / 400) * .6 : 0; if (K * Math.exp(-a) > bK) { bK = K * Math.exp(-a); bA = a; api.nearK = K; } } api.nearAge = bA; if (bA == null) api.nearK = 0; }
      cab.update(wallS, dt, { nearAge: api.nearAge, nearK: api.nearK, health: api.crewHealth, stress, killed, killAge: killed ? t - deadT : 0, hitAge, apsAge, alarm, alarmRel: rel, speed: Math.abs(cp.v), firing: muz > 0, mainShots: rc.duel ? rc.duel.shots.filter(q => q.t <= t).length : 0, talk: (() => { const o = {}; for (const q of rc.radio || []) { if (q.t > t) continue; if (t < q.t + .35 + .3 * String(q.text || '').split(' ').length) o[{ CDR: 'cdr', GNR: 'gnr', LDR: 'ldr', DRV: 'drv' }[q.who]] = 1; } return o; })(), hitCount: rc.threats.filter(o => o.viz.end.type === 'hit' && t >= o.viz.end.t).length, hitRel: (() => { let b = null, bt = -1; for (const o of rc.threats) { const e = o.viz.end; if (e.type === 'hit' && t >= e.t && e.t > bt) { bt = e.t; b = o.brg - cp.h - (api.turRel || 0); } } return b; })(), engaged: armNow, tur: api.turRel || 0, hull: cp.h, rev: cp.v < -.2, loadIn: (() => { if (!rc.duel) return null; const i = rc.duel.shots.findIndex(q => q.t > t); return i > 0 ? rc.duel.shots[i].t - .5 - t : null; })(), mainFire: !!(rc.duel && rc.duel.shots.some(q => t >= q.t && t < q.t + .3)), hullRate: hr, narrow: W2 / H2 < 1, lookYaw: lookY, lookPitch: lookP });
      if (cab.view === 'blk' || cab.view === 'hat') { const out = cab.view === 'hat'; const yaw = (cp.h + (api.turRel || 0) + lookY) * DEG, pit = Math.max(-12, Math.min(25, -lookP)) * DEG, sh = (hitAge != null && hitAge < .8 ? (1 - hitAge / .8) * .5 : 0) + (rc.duel && rc.duel.shots.some(q => t >= q.t && t < q.t + .4) ? .25 : 0);
        { const th0 = (cp.h + (api.turRel || 0)) * DEG; cm.position.set(vp.x + Math.cos(th0) * .75 - Math.sin(th0) * .3, 0, vp.z + Math.sin(th0) * .75 + Math.cos(th0) * .3); } cm.position.set(cm.position.x + Math.sin(yaw) * .3 + (r1(Math.floor(wallS * 40), 5) - .5) * sh, gy0 + (out ? 3.55 : 3.05) + (r1(Math.floor(wallS * 40), 6) - .5) * sh, cm.position.z - Math.cos(yaw) * .3); cm.up.set(0, 1, 0); cm.lookAt(cm.position.x + Math.sin(yaw) * Math.cos(pit) * 100, cm.position.y + Math.sin(pit) * 100, cm.position.z - Math.cos(yaw) * Math.cos(pit) * 100);
        const near0 = cm.near; cm.near = out ? near0 : 3.4; cm.fov = out ? 62 : 46; cm.aspect = W2 / Math.max(H2, 1); cm.updateProjectionMatrix(); cm.updateMatrixWorld(); cur = cm; smk.flush(); fir.flush(); rib.flush(); R2.render(sc, cm); cm.near = near0; cm.updateProjectionMatrix(); camP2 = null; return; }
      R2.render(cab.sc, cab.cam);
    }
    // ================================================================ sights: gunner's primary sight, commander's CITV, HKOI's own sight; day and thermal
    // Thermal: every mesh is drawn with a material that outputs apparent temperature (0 cold .. 1 hot), then a post pass maps it to
    // white-hot or black-hot with sensor noise, slight blur and vignette. Heat: sky cold, vegetation cool, ground by sun and slope,
    // our own engine deck and exhaust hot, missile motors and blasts very hot, people warm.
    const SIGHT = { zoom: { gps: 0, citv: 0, hsight: 1 }, thermal: { gps: false, citv: true, hsight: true }, black: false, info: null };
    const ZOOMS = { gps: [15, 4.5, 1.8], citv: [16, 5, 2], hsight: [9, 3, 1.2] };   // field of view (deg) for each magnification step
    let thermMats = null, sightRT = null, thermPost = null, sightCam = null;
    const TV = 'varying vec3 vW; varying vec3 vN;\n#include <common>\n#include <skinning_pars_vertex>\nvoid main(){\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <beginnormal_vertex>\n#include <skinnormal_vertex>\n#include <skinning_vertex>\nvec4 p = vec4(transformed, 1.0); vec3 n = objectNormal;\n#ifdef USE_INSTANCING\np = instanceMatrix * p; n = mat3(instanceMatrix) * n;\n#endif\nvec4 w = modelMatrix * p; vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); gl_Position = projectionMatrix * viewMatrix * w; }';
    const TF = `uniform float base; uniform float sunK; uniform vec3 sunD; uniform float kind; uniform vec3 hotP; uniform vec3 hotF; uniform float hotK; uniform float tme; varying vec3 vW; varying vec3 vN;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main(){ vec3 n = normalize(vN); float sun = max(dot(n, sunD), 0.0); float T = base + sunK * sun;
        if (kind < 0.5) T += 0.08 * (n2(vW.xz * 0.05) - 0.5) + 0.04 * (n2(vW.xz * 0.7) - 0.5);        // ground: patchy soil temperature
        else if (kind < 1.5) T += 0.05 * (n2(vW.xz * 0.3 + vW.y) - 0.5);                               // vegetation
        else if (kind < 2.5) { vec3 d = vW - hotP; float along = dot(d.xz, hotF.xz); float rear = smoothstep(1.2, 3.6, -along);  // our vehicle: engine and exhaust at the rear, warm running gear
          T += hotK * (0.45 * rear + 0.18 * smoothstep(0.9, 0.2, d.y) + 0.06); }
        else if (kind < 3.5) T = 0.98;                                                                    // missile motor, flare
        else if (kind < 4.5) T = 0.72 + 0.05 * sun;                                                      // people
        gl_FragColor = vec4(vec3(clamp(T, 0.0, 1.0)), 1.0); }`;
    function makeTherm() {
      const mk = (base, sunK, kind, skin) => { const m = new THREE.ShaderMaterial({ uniforms: { base: { value: base }, sunK: { value: sunK }, sunD: { value: V3(0, 1, 0) }, kind: { value: kind }, hotP: { value: V3(0, 0, 0) }, hotF: { value: V3(0, 0, -1) }, hotK: { value: 1 }, tme: { value: 0 } }, vertexShader: TV, fragmentShader: TF }); m.skinning = !!skin; return m; };
      thermMats = { ground: mk(.3, .12, 0), veg: mk(.22, .05, 1), rock: mk(.34, .14, 0), bld: mk(.3, .1, 0), veh: mk(.36, .06, 2), vehDead: mk(.75, 0, 2), hot: mk(1, 0, 3), body: mk(.7, 0, 4, true), bodyStatic: mk(.7, 0, 4), launcher: mk(.42, .06, 1), sky: new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide }) };
      sightRT = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true }); sightCam = new THREE.PerspectiveCamera(10, 1, .5, 40000);
      const fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: null }, black: { value: 0 }, tme: { value: 0 }, px: { value: new THREE.Vector2(1, 1) }, gain: { value: 1.6 }, lvl: { value: .22 } }, depthTest: false, depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `uniform sampler2D t; uniform float black; uniform float tme; uniform vec2 px; uniform float gain; uniform float lvl; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + tme) * 43758.5453); }
          void main(){ float c = texture2D(t, vUv).r * 0.4 + (texture2D(t, vUv + vec2(px.x, 0)).r + texture2D(t, vUv - vec2(px.x, 0)).r + texture2D(t, vUv + vec2(0, px.y)).r + texture2D(t, vUv - vec2(0, px.y)).r) * 0.15;
            float v = clamp((c - lvl) * gain, 0.0, 1.0); v = pow(v, 0.85); if (black > 0.5) v = 1.0 - v;
            v += (h(gl_FragCoord.xy) - 0.5) * 0.07 + 0.015 * sin(vUv.y * 900.0 + tme * 3.0);
            vec2 q = vUv - 0.5; v *= 1.0 - 0.55 * dot(q, q) * 2.0;
            gl_FragColor = vec4(vec3(v) * vec3(0.93, 1.0, 0.96), 1.0); }` }));
      fsq.frustumCulled = false; const fs = new THREE.Scene(); fs.add(fsq); thermPost = { fs, fsq, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    }
    // which thermal class each object belongs to (set once per build)
    function tagTherm() {
      root2.traverse(o => { if (!o.isMesh && !o.isInstancedMesh) return; if (o.userData.therm) return;
        const g = o.geometry && o.geometry.type; if (o.isSkinnedMesh) o.userData.therm = 'body';
        else if (o.isInstancedMesh) o.userData.therm = /Cone|Sphere|Polyhedron/.test(g) || o.material && o.material.color && o.material.color.g > .5 ? 'veg' : 'rock';
        else o.userData.therm = 'ground'; });
      const veh = new Set(); V.g.traverse(o => veh.add(o)); for (const o of veh) if (o.isMesh) o.userData.therm = 'veh';
      for (const L of Lm) L.model.traverse(o => { if (o.isMesh) o.userData.therm = 'launcher'; });
      for (const o of Ms) o.mm.traverse(o2 => { if (o2.isMesh) o2.userData.therm = 'hot'; });
      if (bail) for (const c of bail) c.g.traverse(o => { if (o.isMesh) o.userData.therm = 'body'; });
    }
    function renderThermal(cam, target, w, h, dead) {
      if (!thermMats) makeTherm(); if (sightRT.width !== w || sightRT.height !== h) sightRT.setSize(w, h);
      for (const k in thermMats) if (thermMats[k].uniforms) { thermMats[k].uniforms.sunD.value.copy(sunD); thermMats[k].uniforms.tme.value = wallS; }
      const hv = thermMats.veh.uniforms; hv.hotP.value.copy(V.g.position); hv.hotF.value.set(-Math.sin(V.g.rotation.y), 0, -Math.cos(V.g.rotation.y)); hv.hotK.value = dead ? 1.6 : 1;
      const swaps = []; root2.traverse(o => { if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return; const k = o.userData.therm || 'ground'; const m = k === 'body' && !o.isSkinnedMesh ? thermMats.bodyStatic : (k === 'veh' && dead ? thermMats.vehDead : thermMats[k] || thermMats.ground); swaps.push([o, o.material]); o.material = m; });
      const bg = sc.background, skyV = sky2.visible, fogC = sc.fog.color.clone(); sc.background = new THREE.Color(0x060606); sky2.visible = false; sc.fog.color.setRGB(.12, .12, .12);
      const su = [smk.m.uniforms.sunC.value.clone(), smk.m.uniforms.amb.value.clone(), smk.m.uniforms.fogC.value.clone()]; smk.m.uniforms.sunC.value.setRGB(.1, .1, .1); smk.m.uniforms.amb.value.setRGB(.42, .42, .42); smk.m.uniforms.fogC.value.setRGB(.12, .12, .12);
      R2.setRenderTarget(sightRT); R2.setClearColor(0x060606, 1); R2.clear(); R2.render(sc, cam);
      for (const [o, m] of swaps) o.material = m; sc.background = bg; sky2.visible = skyV; sc.fog.color.copy(fogC); smk.m.uniforms.sunC.value.copy(su[0]); smk.m.uniforms.amb.value.copy(su[1]); smk.m.uniforms.fogC.value.copy(su[2]);
      const pu = thermPost.fsq.material.uniforms; pu.t.value = sightRT.texture; pu.black.value = SIGHT.black ? 1 : 0; pu.tme.value = wallS % 100; pu.px.value.set(1 / w, 1 / h);
      R2.setRenderTarget(target || null); R2.render(thermPost.fs, thermPost.cam);
    }
    // laser range along the sight line: the first threat near the line, else the ground
    function lase(cam) {
      const o = cam.position, d = V3(0, 0, -1).applyQuaternion(cam.quaternion); let best = null;
      for (const m of Ms) if (m.mm.visible) { const v = m.mm.position.clone().sub(o), along = v.dot(d); if (along < 0) continue; const off = v.clone().addScaledVector(d, -along).length(); if (off < Math.max(4, along * .004) && (!best || along < best.r)) best = { r: along, what: m }; }
      if (best) return best;
      for (let r = 20; r < 9000; r *= 1.04) { const p = o.clone().addScaledVector(d, r); if (p.y < hS(p.x, p.z)) return { r, what: null }; }
      return { r: null, what: null };
    }
    function sightView(mode, t, focusM, cp, vp, gy0, deadT) {
      if (!thermMats) makeTherm();
      const zi = SIGHT.zoom[mode] || 0, fov = ZOOMS[mode][zi], th = SIGHT.thermal[mode], c = sightCam, tb = (turB != null ? turB : cp.h) * DEG;
      c.aspect = W2 / Math.max(H2, 1); c.fov = fov; c.updateProjectionMatrix();
      let tgtInfo = null;
      if (mode === 'hsight') { const gt = gunTarget(t, focusM); c.position.set(vp.x, gy0 + V.gunZ + .25, vp.z); c.position.x += Math.sin(gunB2 * DEG) * .4; c.position.z -= Math.cos(gunB2 * DEG) * .4; c.lookAt(gt.p); tgtInfo = gt; }
      else { const off = mode === 'gps' ? [.75, 2.95, -1.2] : [-.85, 3.25, -.6], s = Math.sin(tb), co = Math.cos(tb); c.position.set(vp.x + off[0] * co - off[2] * s, gy0 + off[1], vp.z + off[0] * s + off[2] * co);
        const yaw = mode === 'citv' ? tb + (lookY || 0) * DEG : tb, pit = mode === 'citv' ? (lookP || 0) * DEG * .6 : -.004; c.up.set(0, 1, 0); c.lookAt(c.position.x + Math.sin(yaw) * 1000, c.position.y + Math.tan(pit) * 1000, c.position.z - Math.cos(yaw) * 1000); }
      c.updateMatrixWorld(); cur = c; smk.flush(); fir.flush(); rib.flush();
      const dead = deadT >= 0 && t >= deadT;
      if (th) renderThermal(c, null, W2 * (R2.getPixelRatio() || 1) | 0, H2 * (R2.getPixelRatio() || 1) | 0, dead);
      else { R2.setRenderTarget(null); R2.render(sc, c); }
      cur = cm;
      // overlay data for the reticles
      const L = lase(c); let box = null, aim = null;
      if (mode === 'hsight') for (const b of rc.bursts) if (b.idx >= 0 && b.kind === 'obs') for (const r of b.rounds || []) { const tb = r.t_burst != null ? r.t_burst : r.t_pass; if (t >= r.t_fire && t < tb && r.bx != null) { tmpA.copy(Wp(rc.threats[b.idx], r.bx, r.by, r.bz)).project(c); if (tmpA.z < 1) aim = [(tmpA.x * .5 + .5) * W2, (-tmpA.y * .5 + .5) * H2, r.lead || 0, r.vOwn || 0]; } }
      if (tgtInfo && tgtInfo.th) { const o = Ms.find(m => m.th === tgtInfo.th); if (o && o.mm.visible) { tmpA.copy(o.mm.position).project(c); if (tmpA.z < 1) box = [(tmpA.x * .5 + .5) * W2, (-tmpA.y * .5 + .5) * H2]; } }
      SIGHT.info = { mode, fov, zoom: zi, thermal: th, black: SIGHT.black, range: L.r, rangeWhat: L.what ? L.what.th.idx + 1 : null, az: (((mode === 'hsight' ? gunB2 : turB + (mode === 'citv' ? lookY || 0 : 0)) % 360) + 360) % 360, rel: ((((mode === 'hsight' ? gunB2 : turB) - cp.h) % 360) + 540) % 360 - 180, box, aim, target: tgtInfo && tgtInfo.th ? tgtInfo.th.idx + 1 : null, tgtRange: tgtInfo ? tgtInfo.d : null, dead };
      labelsEl.style.visibility = 'hidden'; api.pipOn = false;
    }
    // ================================================================ x-ray replay of a hit: ghosted hull, components by state, the jet and its spall cone
    let XR = null;
    function xrayBuild() {
      const sc3 = new THREE.Scene(); sc3.background = new THREE.Color(0x05090b); const cam3 = new THREE.PerspectiveCamera(36, 1, .1, 200);
      sc3.add(new THREE.HemisphereLight(0xbfe9ff, 0x0a0f12, .9)); const dl = new THREE.DirectionalLight(0xffffff, .7); dl.position.set(4, 8, 3); sc3.add(dl);
      const grid = new THREE.GridHelper(14, 28, 0x1f4a52, 0x0f2a30); sc3.add(grid);
      const ghostM = new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color(0x7ff0e6) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(c * (0.05 + 0.75 * f), 1.0); }' });
      const v = vehM1(Object.assign({}, cf, { hkoi_enabled: true }), 0); v.g.traverse(o => { if (o.isMesh) { o.material = ghostM; o.castShadow = false; } }); sc3.add(v.g);
      const zoneM = new THREE.MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide });
      const dyn = new THREE.Group(); sc3.add(dyn);
      XR = { sc3, cam3, v, dyn, zoneM, az: .9, el: .42, dist: 13, sel: 0, hits: [] };
    }
    const XCOL = { ok: 0x3a6f78, damaged: 0xffb020, destroyed: 0xff3b2f, killed: 0x9b0d0d, wounded: 0xffb020, crewok: 0x5be38f };
    function xraySet(hits, i) {
      if (!XR) xrayBuild(); XR.hits = hits; XR.sel = i; const h = hits[i]; if (!h) return; const D = XR.dyn; while (D.children.length) { const o = D.children.pop(); if (o.geometry) o.geometry.dispose(); }
      XR.v.tur.rotation.y = -h.turA; XR.v.rws.rotation.y = 0;
      const st = {}; for (const c of h.comps) st[c.id] = c.state;
      for (const c of DMG.COMPS) { const p = c.turret ? DMG.rot(c.p, -h.turA) : c.p; let col, op = .55;
        if (c.crew) { const s = h.crew[c.id]; col = s === 'killed' ? XCOL.killed : s === 'wounded' ? XCOL.wounded : XCOL.crewok; const m = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .55, 12), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .45, transparent: true, opacity: .9 })); m.position.set(p[0], p[1] - .1, p[2]); D.add(m);
          const hd = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), m.material); hd.position.set(p[0], p[1] + .27, p[2]); D.add(hd); continue; }
        const s = st[c.id] || 'ok'; col = XCOL[s]; if (s !== 'ok') op = .85;
        const m = new THREE.Mesh(c.id.startsWith('track') ? new THREE.BoxGeometry(.6, .7, 7.2) : new THREE.SphereGeometry(c.r, 16, 12), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: s === 'ok' ? .15 : .6, transparent: true, opacity: op, depthWrite: s !== 'ok' }));
        m.position.set(p[0], p[1], p[2]); D.add(m); }
      // the warhead's path: in from outside, then the jet through the armour and into the vehicle
      const e = V3(...h.entry), d = V3(...h.dir).normalize(), out = e.clone().addScaledVector(d, -3.5), inEnd = e.clone().addScaledVector(d, Math.max(.25, h.reach));
      D.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(out, e), 4, .035, 8), new THREE.MeshBasicMaterial({ color: 0xffe39a })));
      if (h.penetrated) { D.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(e, inEnd), 4, .05, 8), new THREE.MeshBasicMaterial({ color: 0xff3b2f })));
        const L = Math.max(.3, h.reach), cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(35 * DEG) * L, L, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide }));
        cone.position.copy(e).addScaledVector(d, L / 2); cone.quaternion.setFromUnitVectors(V3(0, -1, 0), d); D.add(cone); }
      const mk = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), new THREE.MeshBasicMaterial({ color: h.penetrated ? 0xff3b2f : 0xffe39a })); mk.position.copy(e); D.add(mk);
      const plate = new THREE.Mesh(new THREE.CircleGeometry(.55, 24), XR.zoneM); plate.position.copy(e); plate.lookAt(e.clone().sub(d)); D.add(plate);
      XR.az = Math.atan2(-d.x, d.z) + .6; XR.el = h.top ? .9 : .38;
    }
    function xrayRender(dt) {
      if (!XR) return; XR.az += dt * .12; const c = XR.cam3; c.aspect = W2 / Math.max(H2, 1); c.updateProjectionMatrix();
      c.position.set(Math.sin(XR.az) * Math.cos(XR.el) * XR.dist, 1.4 + Math.sin(XR.el) * XR.dist, Math.cos(XR.az) * Math.cos(XR.el) * XR.dist); c.lookAt(0, 1.3, 0);
      R2.setRenderTarget(null); R2.render(XR.sc3, c); labelsEl.style.visibility = 'hidden'; api.pipOn = false;
    }
    // ================================================================ visible enemy teams: who fires each threat, what they do, what they leave behind
    // Ground missiles: a two-man team (gunner kneeling at the tripod, assistant beside him) dug in behind a scrape of earth, camouflage net.
    // Drones: an operator crouched with goggles and a controller, a second man with spare airframes. Helicopters keep their model.
    // Launch: backblast cloud and dust behind the tube, muzzle flash, the gunner flinches. Guiding: the gunner stays on the sight.
    const TEAM = { kneel: { L_Thigh: 80, L_Calf: -85, R_Thigh: -15, R_Calf: -100, L_UpperArm: -60, R_UpperArm: -60, L_Forearm: -40, R_Forearm: -40, Spine1: 20 },
      crouch: { L_Thigh: 100, R_Thigh: 100, L_Calf: -150, R_Calf: -150, Spine1: 30, L_UpperArm: -70, R_UpperArm: -70, L_Forearm: -60, R_Forearm: -60 } };
    let teams = [];
    function soldier(src, pose, rotY) {
      const m = THREE.SkeletonUtils.clone(src), B = {}; m.traverse(x => { if (x.isBone) B[x.name.replace(/^Bip01_/, '')] = x; if (x.isMesh) { x.castShadow = true; x.frustumCulled = false; x.userData.therm = 'body'; } });
      for (const [k, a] of Object.entries(pose)) if (B[k]) B[k].rotateOnAxis(V3(0, 0, 1), a * DEG); const base = {}; for (const k in B) base[k] = B[k].quaternion.clone();
      const g = new THREE.Group(); g.add(m); m.updateMatrixWorld(true); let mn = 1e9; m.traverse(x => { if (x.isBone) { const p = new THREE.Vector3(); x.getWorldPosition(p); mn = Math.min(mn, p.y); } }); m.position.y = -mn + .06; g.rotation.y = rotY || 0; return { g, B, base };
    }
    function tripod(c) {
      const g = new THREE.Group(), olive = new THREE.MeshStandardMaterial({ color: col(0x48503a), roughness: .8 }), dark = new THREE.MeshStandardMaterial({ color: col(0x1c1e1b), roughness: .7, metalness: .3 });
      for (const a of [0, 2.1, 4.2]) { const l = new THREE.Mesh(cyl(.02, .02, .9, 6), dark); l.position.set(Math.sin(a) * .28, .38, Math.cos(a) * .28); l.rotation.set(Math.cos(a) * .35, 0, -Math.sin(a) * .35); g.add(l); }
      const head = new THREE.Group(); head.position.y = .78; g.add(head);
      const tube = new THREE.Mesh(cyl(.075, .075, 1.2, 12), olive); tube.rotation.x = Math.PI / 2; tube.position.set(0, .1, -.1); head.add(tube);
      const sight = new THREE.Mesh(box(.22, .2, .32), dark); sight.position.set(.16, .02, .25); head.add(sight); const tg = new THREE.Mesh(box(.12, .1, .2), olive); tg.position.set(-.15, .02, .3); head.add(tg);
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.therm = 'launcher'; } }); g.userData.tube = tube; g.userData.head = head; return g;
    }
    // FPV attack quad, built in metres then enlarged 2.2x so it can be seen from the tank: 10-inch X frame, 4 motors, top battery, tilted camera, PG-7 type warhead slung under the frame with contact-fuze whiskers; fibre version carries a cable spool
    function fpvModel(tt) {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body; const fiber = tt.rf === false;
      const carbon = M(0x15171a, .55, .3), motor = M(0x2b2f36, .4, .7), olive = M(0x4d5638, .8), copper = M(0xb87333, .4, .8), lipo = M(0x1b1d22, .7), label = M(0xd9b21c, .7), tpu = M(0xc8451c, .8), white = M(0xe8e6dc, .6);
      const fr = new THREE.Group(); fr.rotation.x = .38; body.add(fr);   // the frame flies nose-down; the camera is tilted up to compensate
      mesh(box(.07, .006, .24), carbon, 0, 0, 0, fr); mesh(box(.06, .004, .2), carbon, 0, .034, .0, fr); for (const [x, z] of [[-.025, -.08], [.025, -.08], [-.025, .08], [.025, .08]]) mesh(cyl(.003, .003, .034, 5), motor, x, .017, z, fr);
      const props = []; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const a = mesh(box(.026, .008, .26), carbon, sx * .085, 0, sz * .085, fr); a.rotation.y = Math.atan2(sx, sz); const mx = sx * .175, mz = sz * .175; mesh(cyl(.016, .018, .026, 10), motor, mx, .017, mz, fr);
        const d = mesh(new THREE.CircleGeometry(.127, 18), new THREE.MeshBasicMaterial({ color: 0xb8c0c4, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }), mx, .036, mz, fr); d.rotation.x = -Math.PI / 2; d.castShadow = false;
        const bl = mesh(box(.25, .003, .022), carbon, mx, .035, mz, fr); bl.castShadow = false; props.push(bl); }
      mesh(box(.048, .04, .15), lipo, 0, .058, -.01, fr); mesh(box(.05, .012, .05), label, 0, .058, -.01, fr).scale.set(1.01, 3.4, 1); mesh(box(.056, .044, .02), tpu, 0, .058, .03, fr);   // battery, label wrap, strap
      const cam = mesh(box(.03, .03, .03), tpu, 0, .022, .125, fr); cam.rotation.x = -.6; const lens = mesh(cyl(.009, .009, .016, 8), motor, 0, .03, .143, fr); lens.rotation.x = Math.PI / 2 - .6;
      const vtx = mesh(cyl(.002, .002, .11, 4), motor, .012, .08, -.12, fr); vtx.rotation.x = -.5; mesh(new THREE.SphereGeometry(.012, 8, 6), fiber ? motor : white, .012, .128, -.148, fr).visible = !fiber;
      if (!fiber) for (const sx of [-1, 1]) { const w = mesh(cyl(.0012, .0012, .09, 3), copper, sx * .03, .03, -.13, fr); w.rotation.z = sx * .9; }
      // warhead: PG-7 type shaped charge, ogive nose forward, strapped under the frame
      const wh = new THREE.Group(); wh.position.set(0, -.06, .03); fr.add(wh); const rx = o => { o.rotation.x = Math.PI / 2; return o; };
      rx(mesh(cyl(.0465, .0465, .16, 14), olive, 0, 0, 0, wh)); rx(mesh(cyl(.02, .0465, .2, 14), olive, 0, 0, .18, wh)); rx(mesh(cyl(.011, .02, .05, 10), motor, 0, 0, .305, wh)); rx(mesh(cyl(.0465, .02, .09, 14), olive, 0, 0, -.125, wh)); rx(mesh(cyl(.02, .02, .09, 10), olive, 0, 0, -.2, wh));
      for (const z of [-.05, .06]) mesh(box(.1, .004, .012), white, 0, .03, z, wh).scale.set(1, 16, 1);   // cable ties round frame and warhead
      for (const sx of [-1, 1]) { const w = mesh(cyl(.0015, .0015, .2, 4), copper, sx * .03, .03, .26, wh); w.rotation.x = Math.PI / 2 - .12; w.rotation.z = -sx * .12; }
      if (fiber) { const sp = rx(mesh(cyl(.05, .05, .16, 14), white, 0, -.055, -.2, fr)); rx(mesh(cyl(.055, .055, .012, 14), carbon, 0, -.055, -.115, fr)); rx(mesh(cyl(.02, .05, .05, 12), carbon, 0, -.055, -.3, fr));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(0, -.07, -.33), V3(0, -.6, -14)]), new THREE.LineBasicMaterial({ color: 0xf2f4f6, transparent: true, opacity: .55 })); body.add(line); }
      g.userData.props = props; g.userData.fr = fr; g.traverse(o => { if (o.isMesh) { o.userData.therm = 'launcher'; } }); g.scale.setScalar(2.2); return g;
    }
    let fpvUp = null; const SFOV = { kornet: 5, vikhr: 1.6, saclos: 5, sal: 4, rpg: 13, ir: 6 };
    function droneKit() {
      const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: col(0x1c1e1b), roughness: .7 }), case_ = new THREE.MeshStandardMaterial({ color: col(0x3d4433), roughness: .8 });
      const c1 = new THREE.Mesh(box(.6, .25, .45), case_); c1.position.set(.7, .12, .4); g.add(c1); const c2 = new THREE.Mesh(box(.5, .22, .38), case_); c2.position.set(.9, .11, -.2); c2.rotation.y = .4; g.add(c2);
      const ant = new THREE.Mesh(cyl(.012, .012, 1.6, 5), dark); ant.position.set(-.5, .8, .3); g.add(ant); const pan = new THREE.Mesh(box(.3, .2, .03), dark); pan.position.set(-.5, 1.6, .3); g.add(pan);
      for (let i = 0; i < 2; i++) { const d = new THREE.Group(); d.position.set(.6 + i * .3, .27, .4); const b = new THREE.Mesh(box(.18, .05, .18), dark); d.add(b); for (const [x, z] of [[-.13, -.13], [.13, -.13], [-.13, .13], [.13, .13]]) { const r = new THREE.Mesh(cyl(.07, .07, .01, 10), dark); r.position.set(x, .03, z); d.add(r); } g.add(d); }
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.therm = 'launcher'; } }); return g;
    }
    function scrape(w) { const m = new THREE.Mesh(lumpy(3, 14, 8, .5), new THREE.MeshStandardMaterial({ color: col(0x6b5a40), roughness: 1 })); m.scale.set(w, .28, .5); m.receiveShadow = m.castShadow = true; return m; }
    function net() { const tx = canvasTex(128, 128, x => { x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, 128, 128); for (let i = 0; i < 260; i++) { x.fillStyle = ['#4d5636', '#3a4128', '#5d5a3f', '#2c2a20'][i % 4]; x.beginPath(); x.arc(r1(i, 1) * 128, r1(i, 2) * 128, 3 + r1(i, 3) * 6, 0, 7); x.fill(); } }, true);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6, 6, 4), new THREE.MeshStandardMaterial({ map: tx, transparent: true, alphaTest: .3, side: THREE.DoubleSide, roughness: 1 })); const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -Math.abs(p.getX(i)) * .25 + (r1(i, 9) - .5) * .15); m.geometry.computeVertexNormals(); m.castShadow = true; m.userData.therm = 'veg'; return m; }
    function teamsBuild() {
      teams = []; if (!THREE.SkeletonUtils || !ASSET.crew.gunner || !ASSET.crew.loader) return;
      for (const L of Lm) {
        const th = Ms.find(o => o.L === L).th, tt = TH[th.key]; if (L.air || tt.guidance === 'ke') continue;
        const air = tt.launch_h > 20, drone = tt.guidance === 'drone'; L.model.visible = false;
        const g = new THREE.Group(), lp = L.model.position, gy = hS(lp.x, lp.z); g.position.set(lp.x, gy, lp.z); g.lookAt(0, gy, 0); g.rotateY(Math.PI); root2.add(g);   // forward (-z) faces the vehicle
        const T = { g, L, th, drone, men: [], kit: null };
        if (drone) { const op = soldier(ASSET.crew.gunner, TEAM.crouch, Math.PI); op.g.position.set(0, 0, 0); g.add(op.g); const as = soldier(ASSET.crew.loader, TEAM.kneel, Math.PI * .7); as.g.position.set(1.1, 0, .5); g.add(as.g); T.men.push(op, as); T.kit = droneKit(); g.add(T.kit); }
        else { const tp = tripod(); tp.position.set(0, 0, -.25); g.add(tp); T.kit = tp; const gn = soldier(ASSET.crew.gunner, TEAM.kneel, Math.PI); gn.g.position.set(.05, 0, .6); g.add(gn.g); const as = soldier(ASSET.crew.loader, TEAM.crouch, Math.PI * 1.15); as.g.position.set(-1.0, 0, .85); g.add(as.g); T.men.push(gn, as);
          for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(cyl(.09, .09, 1.25, 10), new THREE.MeshStandardMaterial({ color: col(0x48503a), roughness: .8 })); c.rotation.set(Math.PI / 2, 0, .3 + i * .15); c.position.set(-1.6 - i * .22, .1, .3); c.castShadow = true; c.userData.therm = 'launcher'; g.add(c); } }
        const s = scrape(2.2); s.position.set(0, -.05, -1.25); g.add(s); s.material.color.copy(col(0x5a4a33));
        // raise the team onto its firing position (a rise for SACLOS/SAL posts) so the engine's launch height is respected
        if (air) g.position.y = L.sight.y - 1.2;
        teams.push(T);
      }
    }
    function teamsFrame(t) {
      for (const T of teams) {
        const la = t - T.th.t0, e = T.th.viz.end, guiding = la >= 0 && t < e.t, gb = Math.max(...Ms.filter(o => o.L === T.L).map(o => o.th.t0)), done = t > e.t + 1 && t > gb + 1;
        const [gn, as] = T.men;
        // the gunner stays hunched on the sight while he guides; flinches at launch; afterwards he gets up to leave
        const fl = la >= 0 && la < .5 ? (1 - la / .5) : 0, aim = !T.drone && T.kit.userData.head;
        if (aim) { const m = Ms.find(o => o.th === T.th); if (m && m.mm.visible) { tmpA.copy(m.mm.position); T.g.worldToLocal(tmpA); const yaw = Math.atan2(-tmpA.x, -tmpA.z), pit = Math.atan2(tmpA.y - .8, Math.hypot(tmpA.x, tmpA.z)); aim.rotation.set(Math.max(-.3, Math.min(.5, pit)), Math.max(-.6, Math.min(.6, yaw)), 0); } }
        const q = (c, L) => { for (const k in c.base) c.B[k].quaternion.copy(c.base[k]); for (const [k, ax, d] of L) if (c.B[k] && d) { const qq = new THREE.Quaternion().setFromAxisAngle(ax, d * DEG); c.B[k].quaternion.multiply(qq); } };
        q(gn, [['Spine1', V3(0, 0, 1), guiding ? 12 : 0], ['Spine', V3(1, 0, 0), fl * -10], ['Head', V3(0, 0, 1), guiding ? 18 : 0]]);
        q(as, [['Head', V3(1, 0, 0), Math.sin(t * .7 + T.th.idx) * 25], ['Spine1', V3(0, 0, 1), fl * 15]]);
        // backblast: a burst of dust and white smoke thrown out behind the tube
        if (!T.drone && la >= 0 && la < 3.5) { tmpB.set(0, .9, 1.6); T.g.localToWorld(tmpB); tmpC.set(0, 0, 1).applyQuaternion(T.g.quaternion);
          if (la < .15) fir.add(tmpB.x - tmpC.x * 2.2, tmpB.y, tmpB.z - tmpC.z * 2.2, 2.2 * (1 - la / .15) + .8, 1, 1, .85, .55);
          for (let i = 0; i < 10; i++) { const a = (r1(T.th.idx * 10 + i, 31) - .5) * 1.1, sp = (2 + 7 * r1(i, 32)) * (1 - Math.exp(-la * 3)), up = .3 + 1.4 * r1(i, 33) * la; smk.add(tmpB.x + (tmpC.x * Math.cos(a) - tmpC.z * Math.sin(a)) * sp, tmpB.y + up, tmpB.z + (tmpC.z * Math.cos(a) + tmpC.x * Math.sin(a)) * sp, 1.2 + la * 2.2, .55 * (1 - la / 3.5), .76, .7, .6, i + la, i & 3); } }
        T.g.visible = !(done && t > e.t + 8);   // the team packs up and slips away some seconds after its last shot
      }
    }
    function gunTarget(t, focusM) {
      // the gun camera looks at the threat the gun is working, else the nearest tracked missile
      let best = null;
      for (const b of rc.bursts) if (b.idx >= 0 && b.tf <= t + 1.2 && t < b.tf + 6) best = rc.threats[b.idx];
      if (!best) { let bd = 1e9; for (const th of rc.threats) { if (th.track === null || t < th.track || t >= th.viz.end.t) continue; const d = HK.distAt(th, t); if (d < bd) { bd = d; best = th; } } }
      const gunW = V3(V.g.position.x, V.g.position.y + V.gunZ + .2, V.g.position.z);
      if (!best) { const th = rc.threats[0]; const p = th ? Wp(th, Math.min(th.R, 2500), 0, 3) : V3(0, 3, -2000); return { p, fov: 9, th: null, d: p.distanceTo(gunW) }; }
      let m = mS(best, Math.min(t, best.viz.end.t - .01)); if (!m) m = { x: best.R, y: 0, z: fr(best).LH };
      const p = Wp(best, m.x, m.y, m.z), d = p.distanceTo(gunW); return { p, fov: Math.max(.35, Math.min(25, 2 * Math.atan(45 / Math.max(d, 1)) / DEG)), th: best, d };
    }
    // swap the built-in tank for the Abrams model, keeping HKOI's weapon station and the blow-out panels
    function useModel() {
      if (!V || V.model || !ASSET.m1) return; const keep = new Set(); V.rws.traverse(o => keep.add(o)); for (const p of V.panels) p.traverse(o => keep.add(o));
      V.g.traverse(o => { if (o.isMesh && !keep.has(o)) o.visible = false; });
      // split by triangle into hull / turret / gun in the model's own frame (forward +z), then turn the whole thing to face -z
      const m = ASSET.m1.clone(true), sp = splitM1(m, { ty: 1.62 }), hold = new THREE.Group(); hold.rotation.y = Math.PI; V.body.add(hold);
      const RING = V3(0, 1.62, -.35);   // turret ring centre, measured from the hatches and the hull (model frame)
      hold.add(sp.H); const tp = new THREE.Group(); tp.position.copy(RING); hold.add(tp); sp.T.position.copy(RING).negate(); tp.add(sp.T);
      const gbx = new THREE.Box3().setFromObject(sp.G), tr = V3(0, (gbx.min.y + gbx.max.y) / 2, Math.max(gbx.min.z + .9, RING.z + 1.2));
      const gp = new THREE.Group(); gp.position.copy(tr).sub(RING); tp.add(gp); sp.G.position.copy(tr).negate(); gp.add(sp.G);
      const mats = []; for (const grp of [sp.H, sp.T, sp.G]) grp.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); mats.push({ m: o.material, c: o.material.color.clone() }); } });
      // the built-in turret group carries HKOI's weapon station and the blow-out panels: put it on the same ring
      V.tur.position.set(0, V.HT, -RING.z); V.rws.position.set(.45, 1.0, 1.35); V.gunZ = V.HT + 1.0 + .45;
      for (const p of V.panels) { p.position.y = .8; p.visible = false; }
      V.hatches = { cdr: V3(.42, 2.45, .7), ldr: V3(-.6, 2.4, .75), gnr: V3(.42, 2.45, .7), drv: V3(0, 1.62, -2.6) }; V.ring = V3(0, 0, -RING.z);
      V.model = { m, mats, piv: gp, tp, droopSign: 1 }; V.wheels = []; V.trackTex = null;
    }
    // the crew: clones of the avatars that climb out when the vehicle is knocked out
    function bailBuild() {
      if (!THREE.SkeletonUtils || !ASSET.crew.gunner || !ASSET.crew.loader || !ASSET.crew.driver) return null;
      const mk = (src, o) => { const m = THREE.SkeletonUtils.clone(src), B = {}; m.traverse(x => { if (x.isBone) B[x.name.replace(/^Bip01_/, '')] = x; if (x.isMesh) { x.castShadow = true; x.frustumCulled = false; } });
        const base = {}; for (const k in B) base[k] = B[k].quaternion.clone(); const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.add(m); g.visible = false; root2.add(g); return Object.assign({ g, B, base }, o); };
      return [mk(ASSET.crew.gunner, { who: 'cdr', t0: 1.3, hatch: 'cdr', side: 1, ang: 20, spd: 4.4 }), mk(ASSET.crew.loader, { who: 'ldr', t0: 1.8, hatch: 'ldr', side: -1, ang: -25, spd: 4.0 }),
        mk(ASSET.crew.driver, { who: 'gnr', t0: 3.1, hatch: 'cdr', side: 1, ang: 45, spd: 4.2 }), mk(ASSET.crew.driver, { who: 'drv', t0: 2.4, hatch: 'drv', side: -1, ang: -50, spd: 4.6 })];
    }
    const AXZ = V3(0, 0, 1), AXX = V3(1, 0, 0), qT = new THREE.Quaternion();
    function poseC(c, L) { for (const k in c.base) c.B[k].quaternion.copy(c.base[k]); for (const [k, ax, d] of L) if (c.B[k] && d) { qT.setFromAxisAngle(ax, d * DEG); c.B[k].quaternion.multiply(qT); } }
    const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
    function turnHatch(h, hull) { if (hull || !V.ring) return h; const a = -(api.turRel || 0) * DEG, dx = h.x - V.ring.x, dz = h.z - V.ring.z; return V3(V.ring.x + dx * Math.cos(a) + dz * Math.sin(a), h.y, V.ring.z - dx * Math.sin(a) + dz * Math.cos(a)); }
    function bailFrame(t, deadT, threatRel) {
      if (!bail) return; const age = t - deadT, HL = api.bailHealth || {};
      // the dead stay inside; the wounded are slower out of the hatch and an unhurt crewman waits for each of them and helps him clear
      const wnd = bail.filter(c => HL[c.who] === 'wounded'), okc = bail.filter(c => (HL[c.who] || 'ok') === 'ok');
      for (const c of bail) { c.hurt = HL[c.who] === 'wounded'; c.helpOf = null; c.T0 = c.t0 + (c.hurt ? 1.2 : 0); c.riseD = c.hurt ? 2.0 : 1.0; c.runAt = c.T0 + c.riseD + 1.5; }
      wnd.forEach((w, i) => { if (okc[i]) okc[i].helpOf = w; });
      for (const c of bail) {
        const a = age - c.T0, rD = c.riseD; if (deadT < 0 || a < 0 || HL[c.who] === 'killed') { c.g.visible = false; continue; } c.g.visible = true;
        const Hr = turnHatch(V.hatches[c.hatch], c.hatch === 'drv');
        const side = threatRel != null ? (Math.sin(threatRel * DEG) > 0 ? -1 : 1) * (c.who === 'gnr' || c.who === 'cdr' ? 1 : 1) : c.side, H = Hr, roof = H.y;
        let p = tmpA, phase, run = 0;
        if (a < rD) { phase = 'rise'; p.set(H.x, roof - 1.0 + ease(a / rD) * 1.0, H.z); }
        else if (a < rD + .9) { phase = 'cross'; const k = ease((a - rD) / .9); p.set(H.x + (side * 1.95 - H.x) * k, roof - (c.hatch === 'drv' ? 0 : .02), H.z + (c.hatch === 'drv' ? -.2 * k : .3 * k)); }
        else if (a < rD + 1.5) { phase = 'jump'; const k = (a - rD - .9) / .6; p.set(side * (1.95 + 1.3 * k), roof * (1 - k) + .6 * Math.sin(k * Math.PI), H.z + (c.hatch === 'drv' ? -.2 : .3)); }
        else { phase = 'run'; run = Math.max(0, age - (c.helpOf ? Math.max(c.runAt, c.helpOf.runAt) : c.runAt)); if (!c.p0 || c.pSide !== side) { tmpB.set(side * 3.25, 0, H.z + (c.hatch === 'drv' ? -.2 : .3)); V.g.localToWorld(tmpB); c.p0 = tmpB.clone(); c.p0.y = hS(c.p0.x, c.p0.z); c.dir = null; c.pSide = side; } }
        if (phase !== 'run') { V.g.localToWorld(p); c.g.position.copy(p); if (phase === 'jump' || phase === 'cross') c.g.position.y = Math.max(c.g.position.y, hS(p.x, p.z)); const th0 = V.g.rotation.y; c.g.rotation.set(0, Math.atan2(side * Math.cos(th0), -side * Math.sin(th0)), 0); c.p0 = null; c.dir = null; }
        else { if (!c.dir) { const away = threatRel != null ? (-V.g.rotation.y * 1 / DEG + threatRel + 180 + c.ang) * DEG : (-V.g.rotation.y / DEG + 90 * side + c.ang) * DEG; c.dir = V3(Math.sin(away), 0, -Math.cos(away)); }
          const slow = c.hurt || c.helpOf, spd = slow ? 2.0 : c.spd, D = slow ? 14 : 24 + (c.ang % 7), tRun = D / spd, s = Math.min(run, tRun) * spd; if (c.helpOf && c.helpOf.dir) c.dir.copy(c.helpOf.dir); c.g.position.copy(c.p0).addScaledVector(c.dir, s); if (c.helpOf && c.helpOf.p0 && c.helpOf.g.visible && run > 0) { const w = c.helpOf, k2 = Math.min(1, run / 1.2); tmpB.copy(w.g.position); tmpB.x += -c.dir.z * .62; tmpB.z += c.dir.x * .62; c.g.position.lerp(tmpB, k2); } c.tRun = tRun; c.g.position.y = hS(c.g.position.x, c.g.position.z); c.g.rotation.set(0, Math.atan2(c.dir.x, c.dir.z), 0);
          if (run > tRun) { const k = ease((run - tRun) / .6); c.g.rotation.x = k * Math.PI / 2 * .98; c.g.position.y += .12 * k; } }
        c.ph = phase === 'run' ? (run <= 0 ? 'wait' : run > (c.tRun || 1) ? 'prone' : 'run') : phase; c.gait = (phase === 'run' ? run : a) * ((c.hurt || c.helpOf) ? 5 : 9.5);
        // body pose
        const slow2 = c.hurt || c.helpOf, ph = (phase === 'run' ? run : a) * (slow2 ? 5 : 9.5), sw = Math.sin(ph), wait = phase === 'run' && run <= 0, ru = phase === 'run' && run > 0 && run < (c.tRun || 1);
        if (phase === 'rise') poseC(c, [['L_Thigh', AXZ, 60 * (1 - a / rD)], ['R_Thigh', AXZ, 60 * (1 - a / rD)], ['L_Calf', AXZ, -80 * (1 - a / rD)], ['R_Calf', AXZ, -80 * (1 - a / rD)], ['Spine1', AXZ, c.hurt ? 45 : 25], ['L_UpperArm', AXZ, -70], ['R_UpperArm', AXZ, -70]]);
        else if (phase === 'cross') poseC(c, [['L_Thigh', AXZ, 35 + sw * 25], ['R_Thigh', AXZ, 35 - sw * 25], ['L_Calf', AXZ, -60], ['R_Calf', AXZ, -60], ['Spine1', AXZ, 35], ['L_UpperArm', AXZ, -40], ['R_UpperArm', AXZ, -40]]);
        else if (phase === 'jump') poseC(c, [['L_Thigh', AXZ, 55], ['R_Thigh', AXZ, 30], ['L_Calf', AXZ, -80], ['R_Calf', AXZ, -50], ['Spine1', AXZ, 20], ['L_UpperArm', AXZ, -90], ['R_UpperArm', AXZ, -90]]);
        else if (wait) poseC(c, [['L_Thigh', AXZ, 75], ['R_Thigh', AXZ, 55], ['L_Calf', AXZ, -115], ['R_Calf', AXZ, -100], ['Spine1', AXZ, 30], ['L_UpperArm', AXZ, -75], ['L_Forearm', AXZ, -30], ['Head', AXZ, -15]]);   // crouched by the track, reaching up for the wounded man
        else if (ru) { const k = slow2 ? .55 : 1; poseC(c, [['L_Thigh', AXZ, 38 * sw * k + (c.hurt ? 10 : 0)], ['R_Thigh', AXZ, -38 * sw * k * (c.hurt ? .4 : 1)], ['L_Calf', AXZ, -(15 + 65 * Math.max(0, -Math.cos(ph))) * k], ['R_Calf', AXZ, -(15 + 65 * Math.max(0, Math.cos(ph))) * k],
            ['L_UpperArm', AXZ, c.helpOf ? -75 : 35 * sw * k - (c.hurt ? 40 : 0)], ['R_UpperArm', AXZ, -35 * sw * k], ['L_Forearm', AXZ, -70], ['R_Forearm', AXZ, -70], ['Spine1', AXZ, c.hurt ? 38 : 18], ['Spine', AXX, c.hurt ? 8 * Math.sin(ph * .5) : 0]]);
          if (!c.hurt) c.g.position.y += Math.abs(Math.cos(ph)) * .06; }
        else poseC(c, [['L_UpperArm', AXZ, -150], ['R_UpperArm', AXZ, -150], ['L_Forearm', AXZ, -30], ['R_Forearm', AXZ, -30], ['Head', AXZ, -40]]);   // prone, hands over the head
      }
    }
    // what a penetrating hit does: ammunition cooks off through the blow-out panels, the hull burns, the paint scorches, the gun droops
    function damageFrame(t, deadT, hitT, vp) {
      const killed = deadT >= 0 && t >= deadT, age = killed ? t - deadT : -1;
      if (V.model) for (const q of V.model.mats) q.m.color.copy(q.c).multiplyScalar(killed ? 1 - .82 * ease(age / 6) : 1);
      else V.bodyMat.color.setScalar(killed ? 1 - .75 * ease(age / 6) : 1);
      const gp = V.model ? V.model.piv : V.gun; if (gp) gp.rotation.x = (killed ? -.12 * ease(age / 2.5) : 0) * (V.model ? -1 : 1);
      if (!V.model) for (const b of V.bags || []) b.visible = !(killed && age > 1.5);
      V.panels.forEach((p, i) => { const pa = age - .25 - i * .12; if (!killed || pa < 0) { p.visible = !V.model; p.position.set((i ? 1 : -1) * .62, V.model ? .86 : .815, 2.15); p.rotation.set(0, 0, 0); return; }
        p.visible = true; const v0 = 22 + i * 5, y = (V.model ? .86 : .815) + v0 * pa - 4.9 * pa * pa, gy = -V.HT + .05; p.position.set((i ? 1 : -1) * (.62 + 2.4 * pa), Math.max(gy, y), 2.15 + 1.2 * pa); if (y > gy) p.rotation.set(pa * (5 + i), pa * 3, pa * (2 - i * 4)); });
      if (!killed) return;
      // venting jets from the bustle (tall, roaring, pulsing), then a burning hull
      const jetT = 9;
      if (age < jetT) for (const sx of [-1, 1]) { tmpB.set(sx * .62, V.HT + .9, 1.8); V.g.localToWorld(tmpB); const H = 16 * Math.pow(1 - age / jetT, .5) * (.75 + .25 * Math.sin(age * 17 + sx)) * Math.min(1, age * 6);
        for (let i = 0; i < 18; i++) { const f = i / 18, wob = (r1(i, 31 + sx) - .5) * (.6 + f * 2.5); fir.add(tmpB.x + wob * .6, tmpB.y + f * H, tmpB.z + (r1(i, 33) - .5) * (.4 + f * 1.2), (.9 + f * 2.2) * (1 + .3 * Math.sin(wallS * 30 + i)), (1 - f) * .45, 1, .55 - .3 * f, .12); }
        for (let i = 0; i < 8; i++) { const f = ((wallS * .6 + i / 8) % 1); smk.add(tmpB.x + (r1(i, 35) - .5) * 4 * f, tmpB.y + H * (.8 + f), tmpB.z + (r1(i, 36) - .5) * 4 * f, 4 + 10 * f, .7 * (1 - f) * Math.min(1, age * 3), .08, .08, .085, i + f, i & 3); } }
      // fire through the hatches and engine deck, sparks, secondary pops
      const fireK = Math.min(1, Math.max(0, (age - 1.2) / 3));
      for (let i = 0; i < 16; i++) { const L = .9, a = (wallS * (1 + (i % 3) * .2) + i / 16 * L) % L, loc = [[.62, V.HT + 1.0, -.2], [-.68, V.HT + .9, 0], [0, V.HT, 2.6], [.9, V.HT, 2.9], [-.9, V.HT, 2.9]][i % 5];
        tmpB.set(loc[0] + (r1(i, 41) - .5) * .8, loc[1], loc[2] + (r1(i, 42) - .5) * .8); V.g.localToWorld(tmpB); fir.add(tmpB.x, tmpB.y + a * (3 + 2 * fireK), tmpB.z, (.7 + 1.4 * fireK) * (1 - a / L) + .3, (.5 * (1 - a / L)) * (i % 5 < 2 ? Math.max(.25, fireK) : fireK), 1, .5 - .2 * a, .12); }
      if (age < 12) for (let i = 0; i < 4; i++) { const st = 2 + i * 2.3 + r1(i, 51) * 1.5, pa = age - st; if (pa < 0 || pa > .5) continue; tmpB.set((r1(i, 52) - .5) * 2, V.HT + .8, 1 + r1(i, 53) * 1.5); V.g.localToWorld(tmpB); fir.add(tmpB.x, tmpB.y, tmpB.z, 4 * (1 - pa / .5) + 1, 1 - pa / .5, 1, .85, .5);
        for (let j = 0; j < 10; j++) { const an = r1(i * 10 + j, 54) * 6.283, up = 6 + r1(i * 10 + j, 55) * 10; tmpC.set(tmpB.x + Math.cos(an) * 5 * pa, tmpB.y + up * pa - 4.9 * pa * pa, tmpB.z + Math.sin(an) * 5 * pa); rib.add(tmpB, tmpC, .07, 1, .8, .4, 0, 1 - pa / .5); } }
    }
    function grassField(dry) {
      const N = 14000, cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const x = cv.getContext('2d');
      for (let i = 0; i < 26; i++) { const bx = 6 + r1(i, 1) * 116, lean = (r1(i, 2) - .5) * 40, h = 120 + r1(i, 3) * 130, w = 3 + r1(i, 4) * 4, l = 55 + r1(i, 5) * 60;
        x.fillStyle = dry ? `hsl(${44 + r1(i, 6) * 14},${30 + r1(i, 7) * 18}%,${l * .78}%)` : `hsl(${78 + r1(i, 6) * 24},${30 + r1(i, 7) * 22}%,${l * .42}%)`; x.beginPath(); x.moveTo(bx - w, 256); x.quadraticCurveTo(bx + lean * .3, 256 - h * .6, bx + lean, 256 - h); x.quadraticCurveTo(bx + lean * .3 + w * .4, 256 - h * .6, bx + w, 256); x.fill(); }
      const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding;
      const g0 = new THREE.PlaneGeometry(1, 1, 1, 3); g0.translate(0, .5, 0); const g1 = g0.clone(); g1.rotateY(Math.PI / 2); const g2 = g0.clone(); g2.rotateY(Math.PI / 4);
      const merge = [g0, g1, g2], pos = [], uv = [], nrm = [], idx = []; let off = 0; for (const g of merge) { const p = g.attributes.position, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); nrm.push(0, 1, 0); } for (const k of g.index.array) idx.push(k + off); off += p.count; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx);
      const m = new THREE.MeshStandardMaterial({ map: tx, alphaTest: .45, side: THREE.DoubleSide, roughness: .95 });
      m.onBeforeCompile = sh => { sh.uniforms.uT = { value: 0 }; sh.uniforms.uW = { value: .6 }; m.userData.u = sh.uniforms;
        sh.vertexShader = 'uniform float uT; uniform float uW;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float k = uv.y * uv.y; float sw = sin(uT * 1.9 + wp.x * 0.21 + wp.z * 0.17) * 0.6 + sin(uT * 3.7 + wp.x * 0.5) * 0.25;
          transformed.x += sw * uW * k * 0.22; transformed.z += cos(uT * 1.3 + wp.z * 0.3) * uW * k * 0.08;`); };
      const im = new THREE.InstancedMesh(geo, m, N), o = new THREE.Object3D(), cc = new THREE.Color(); let n = 0;
      for (let i = 0; i < N * 2 && n < N; i++) { const rr0 = 3.5 + Math.pow(r1(i, 20), .6) * 70, a = r1(i, 21) * 6.283, px = rr0 * Math.sin(a), pz = -rr0 * Math.cos(a); if (fbm(px * .05 + 4, pz * .05, 2) < .38) continue;
        const s0 = (.3 + r1(i, 22) * .45) * (1 - sst(40, 72, rr0) * .85); o.position.set(px, hS(px, pz) - .03, pz); o.scale.set(s0 * 1.1, s0 * (.8 + r1(i, 23) * .7), s0 * 1.1); o.rotation.set(0, r1(i, 24) * 6.283, 0); o.updateMatrix(); im.setMatrixAt(n, o.matrix); cc.setScalar(.75 + r1(i, 25) * .4); im.setColorAt(n++, cc); }
      im.count = n; im.instanceColor.needsUpdate = true; im.receiveShadow = true; im.frustumCulled = false; return { mesh: im, m };
    }
    // scorched craters stay on the ground where rounds and missiles struck
    let craters = new Map(), craterT = null, tNow = 0;
    function crater(p, age, size, seed) { if (hS(p.x, p.z) < p.y - 2.5) return; let c = craters.get(seed);
      if (!c) { if (craters.size > 120) return; if (!craterT) craterT = canvasTex(128, 128, x => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(18,15,12,.9)'); g.addColorStop(.45, 'rgba(40,32,24,.62)'); g.addColorStop(.8, 'rgba(70,58,44,.25)'); g.addColorStop(1, 'rgba(70,58,44,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 40; i++) { const a = r1(i, 1) * 6.283, d = 20 + r1(i, 2) * 40; x.fillStyle = `rgba(25,20,15,${.2 + r1(i, 3) * .3})`; x.beginPath(); x.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r1(i, 4) * 5, 1 + r1(i, 5) * 2, a, 0, 7); x.fill(); } }, true);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: craterT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.rotation.z = r1(seed, 9) * 6.283; m.position.set(p.x, hS(p.x, p.z) + .06, p.z); m.scale.setScalar(size); m.renderOrder = 2; root2.add(m); c = { m, t0: tNow - age }; craters.set(seed, c); } }
    function blast(p, age, kind, seed) {
      if (age < 0) return; if (age > .05 && (kind === 'dirt' || kind === 'hit' || kind === 'ground')) crater(p, age, kind === 'hit' ? 9 : 5.5, seed); const big = kind === 'hit' ? 2.4 : kind === 'dirt' ? .9 : kind === 'aps_kill' ? 1.1 : 1, dusty = kind === 'dirt';
      if (age < .14 && !dusty) fir.add(p.x, p.y, p.z, (5 + 10 * age / .14) * big, (1 - age / .14) * .95, 1, .92, .75);
      if (age < .9 && !dusty) for (let i = 0; i < 9; i++) { const a = r1(seed, i) * 6.283, e = r1(seed + 1, i) * 2 - .3, d = (2 + 4 * r1(seed + 2, i)) * big * (1 - Math.exp(-age * 5)), kq = age / .9; fir.add(p.x + Math.cos(a) * d, p.y + e * d * .6, p.z + Math.sin(a) * d, (2 + 4 * kq) * big, (1 - kq) ** 2 * .8, 1, .58 - .3 * kq, .18); }
      if (age < 1.1) for (let i = 0; i < 14; i++) { const a = r1(seed + 3, i) * 6.283, e = r1(seed + 4, i) * 1.4, sp = (14 + 26 * r1(seed + 5, i)) * big, life = .5 + .6 * r1(seed + 6, i); if (age > life) continue; const f = (tq, out) => out.set(p.x + Math.cos(a) * sp * tq, p.y + e * sp * tq - 4.9 * tq * tq, p.z + Math.sin(a) * sp * tq); f(age, tmpA); f(Math.max(0, age - .04), tmpB); rib.add(tmpB, tmpA, .12 * big, 1, .74, .38, 0, 1 - age / life); }
      const sl = dusty ? 6 : 8; if (age < sl) for (let i = 0; i < 12; i++) { const a = r1(seed + 7, i) * 6.283, e = r1(seed + 8, i), kq = age / sl, d = (1.5 + 4 * r1(seed + 9, i)) * big * (1 - Math.exp(-age * 2)) * (dusty ? 1.4 : 1), g = Math.min(1, .3 + kq * 1.2), cr2 = dusty ? .6 : .18, cg2 = dusty ? .52 : .18, cb2 = dusty ? .4 : .19;
        smk.add(p.x + Math.cos(a) * d, p.y + e * d * .5 + age * (dusty ? .7 : 1.4) * (.4 + e), p.z + Math.sin(a) * d, (2.5 + 8 * Math.sqrt(kq)) * big, Math.min(1, age * 8) * .75 * (1 - kq) ** 2, cr2 + g * .3, cg2 + g * .3, cb2 + g * .3, a + age * .2, i & 3); }
    }
    const api = { nearAge: null, nearK: 0, povRole: 'cdr', bailInfo: null, bailOutT(who) { const t0 = { cdr: 1.3, ldr: 1.8, gnr: 3.1, drv: 2.4 }[who] || 1.3, h = (api.bailHealth || {})[who]; return h === 'wounded' ? t0 + 1.2 + 2.0 : t0 + 1.0; }, crewHealth: null, bailHealth: null, enemyIdx: null, enemyInfo: null, enemyJit: 3, droneSkill: 'trained', droneEvade: true, mode: 'cmd', cut: false, gunInfo: null, pipOn: false, pipRect: null, inside: null, vstate: null, init, size, build, frame, setMode(m) { api.mode = m; api.cut = false; if (m === 'cdr' || m === 'citv') { lookY = 0; lookP = 0; } overlay2 = ovUser && m !== 'enemy' && m !== 'bail' && m !== 'xray' && m !== 'cdr' && m !== 'gps' && m !== 'citv' && m !== 'hsight'; },
      setPanel(cv) { if (cab) cab.setPanel(cv); }, setScreens(o) { if (cab && cab.setScreens) cab.setScreens(o); }, cabView(v) { if (cab) cab.setView(v); lookY = 0; lookP = 0; }, get cabViewNow() { return cab ? cab.view : null; }, crewState() { return cab ? cab.crewState() : []; }, get gunAz() { return gunB2; }, get sight() { return SIGHT.info; }, swap(r, c) { rc = r; cf = c; if (r.platoon) for (const W of Wg) { const q = r.platoon.find(z => z.k === W.p.k); if (q) { W.p = q; W.ms.forEach((m, i) => { if (q.rec.threats[i]) m.th = q.rec.threats[i]; }); } } for (const o of Ms) o.th = r.threats[o.th.idx]; for (const T of teams) T.th = r.threats[T.th.idx]; }, xraySet(h, i) { xraySet(h, i); },
      sightZoom(m, d) { const n = ZOOMS[m].length; SIGHT.zoom[m] = Math.max(0, Math.min(n - 1, (SIGHT.zoom[m] || 0) + d)); }, sightThermal(m, v) { SIGHT.thermal[m] = v == null ? !SIGHT.thermal[m] : v; }, sightBlack(v) { SIGHT.black = v == null ? !SIGHT.black : v; }, sightState(m) { return { zoom: SIGHT.zoom[m] || 0, zooms: ZOOMS[m], thermal: SIGHT.thermal[m], black: SIGHT.black }; }, get q() { return q2; }, setQ(v) { q2 = v; W2 = 0; if (v >= 1) loadM1(); size(); envUp(); if (grass) grass.mesh.visible = q2 >= 2; R2.shadowMap.enabled = q2 >= 1; if (sun2) sun2.castShadow = q2 >= 1; }, setOverlay(v) { ovUser = v; overlay2 = v && api.mode !== 'cdr'; }, setPip(v) { pip = v; }, get ready() { return ok2; }, worldOf: (th, x, y, z) => Wp(th, x, y, z), mState: (th, t) => mS(th, t), hS };
    return api;
  }
