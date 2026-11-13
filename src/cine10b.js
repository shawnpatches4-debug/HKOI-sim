  // ---- setup
  function init() {
    if (ok) return true; if (failed || typeof THREE === 'undefined') { fail(); return false; }
    try { R = new THREE.WebGLRenderer({ canvas: $('#cineCanvas'), antialias: true, powerPreference: 'high-performance' }); } catch (e) { fail(); return false; }
    R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, .001); cam = new THREE.PerspectiveCamera(46, 2, 1, 9000);
    hemi = new THREE.HemisphereLight(0xffffff, 0x444444, .6); scene.add(hemi);
    sunL = new THREE.DirectionalLight(0xffffff, 2); sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048); const sc = sunL.shadow.camera; sc.left = sc.bottom = -170; sc.right = sc.top = 170; sc.near = 50; sc.far = 1500; sunL.shadow.bias = -.0006; sunL.shadow.normalBias = .7; scene.add(sunL, sunL.target);
    boomL = new THREE.PointLight(0xffb060, 0, 460, 1.5); muzL = new THREE.PointLight(0xffd9a0, 0, 130, 1.8); scene.add(boomL, muzL);
    sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ uniforms: { zen: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunC: { value: new THREE.Color() }, sunD: { value: V3(0, 1, 0) }, cloudC: { value: new THREE.Color() }, cover: { value: .3 }, time: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }', fragmentShader: SKYF, side: THREE.BackSide, depthWrite: false })); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
    root = new THREE.Group(); scene.add(root);
    smoke = Parts(3000, false, puffTex()); fire = Parts(1200, true, glowTex()); ribbons = Ribbons(900); scene.add(smoke.mesh, fire.mesh, ribbons.mesh);
    try { post = makePost(); } catch (e) { post = null; Q = Math.min(Q, 0); }
    const el = $('#cine'); let drag = null;
    el.addEventListener('pointerdown', e => { if (e.target.closest('button,a,input')) return; drag = { x: e.clientX, y: e.clientY, az: orbAz, el: orbEl, moved: false }; });
    window.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return; if (!drag.moved) { drag.moved = true; if (mode !== 'orbit') setMode('orbit', true); $('#cineHint').classList.add('gone'); }
      orbAz = drag.az - dx * .32; orbEl = Math.max(-62, Math.min(190, drag.el + dy * .5)); });
    window.addEventListener('pointerup', () => { drag = null; }); window.addEventListener('pointercancel', () => { drag = null; });
    el.addEventListener('wheel', e => { if (!(e.ctrlKey || document.fullscreenElement)) return; e.preventDefault(); orbZoom = Math.max(.4, Math.min(1.7, orbZoom * Math.exp(e.deltaY * .0015))); if (mode !== 'orbit') setMode('orbit', true); }, { passive: false });
    ok = true; applyQ(); window.addEventListener('resize', () => resize()); document.addEventListener('fullscreenchange', () => setTimeout(resize, 60)); return true;
  }
  function fail() { failed = true; $('#cineCanvas').hidden = true; $('#planSvg').removeAttribute('hidden'); $('#cineModes').hidden = true; $('#cineKey').hidden = true; $('#cineHint').hidden = true; $('#cineOverlayL').hidden = true; }
  function applyQ() { R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q >= 2 ? 1.75 : 1)); sunL.castShadow = Q >= 1; W = 0; resize(); }
  function resize() { if (!ok) return; const el = $('#cine'), w = el.clientWidth, h = el.clientHeight; if (!w || !h || (w === W && h === H)) return; W = w; H = h; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); if (post && Q >= 1) { const s = R.getDrawingBufferSize(new THREE.Vector2()); post.size(s.x, s.y); } }
  const lab = (cls, html) => { const el = document.createElement('div'); el.className = 'c3l ' + cls; el.innerHTML = html; $('#cineLabels').appendChild(el); const o = { el, p: V3(0, 0, 0), on: false, vis: false }; labels.push(o); return o; };
  function placeLabels() { for (const o of labels) { let show = o.on && overlay; if (show) { tA.copy(o.p).project(cam); show = tA.z < 1 && Math.abs(tA.x) < 1.02 && Math.abs(tA.y) < 1.02; if (show) o.el.style.transform = `translate3d(${((tA.x * .5 + .5) * W).toFixed(1)}px,${((-tA.y * .5 + .5) * H).toFixed(1)}px,0) translate(-50%,-50%)`; } if (o.vis !== show) { o.vis = show; o.el.classList.toggle('on', show); } } }
  const phaseAt = (th, tt) => { let m = 'guided'; for (const p of (th.viz.phases || [])) if (p.t <= tt) m = p.mode; return m; };
  // position from the engine's 3D flight physics, when this stretch of flight was simulated in 3D
  function trajAt(th, tt) {
    const L = th.viz.trajs; if (!L || !L.length) return null;
    for (let k = L.length - 1; k >= 0; k--) { const p = L[k].pts; if (!p.length || tt < p[0][0]) continue;
      const last = p[p.length - 1], nextStart = k + 1 < L.length && L[k + 1].pts.length ? L[k + 1].pts[0][0] : Infinity;
      if (tt > last[0]) { if (tt > nextStart) continue; if (p.length < 2 || (k + 1 < L.length)) { if (tt - last[0] > .3) return null; } const q = p[p.length - 2] || last, dtq = Math.max(last[0] - q[0], 1e-3), u = tt - last[0]; return { x: last[1] + (last[1] - q[1]) / dtq * u, y: last[2] + (last[2] - q[2]) / dtq * u, z: last[3] + (last[3] - q[3]) / dtq * u, b: last[4], f: L[k].frame }; }
      let lo = 0, hi = p.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= tt) lo = m; else hi = m; }
      const a = p[lo], b = p[hi], u = b[0] > a[0] ? (tt - a[0]) / (b[0] - a[0]) : 0;
      return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, z: a[3] + (b[3] - a[3]) * u, b: u < .5 ? a[4] : b[4], f: L[k].frame }; }
    return null;
  }
  const zcF = (f, x) => f.hh + (f.LH - f.hh) * x / f.R + (x > 300 ? f.los_off : f.los_off * Math.max(x, 0) / 300);
  function mstate(th, tt) {
    const e = th.viz.end, sev = th.viz.sever; if (tt < th.t0) return null;
    if (tt < e.t) { const q = trajAt(th, tt); if (q) return { d: Math.max(q.x, 0), lat: q.y * 1.8, dz: (q.z - zcF(q.f, q.x)) * 1.8, sag: 0, mode: q.b ? 'blind' : 'guided', alive: true }; }
    const tc = Math.min(tt, e.t); let d = HK.distAt(th, tc), lat = 0, sag = 0; const md = phaseAt(th, tt);
    if (md === 'blind' && sev && tt >= sev.t) {
      const tE = Math.max(e.t, sev.t + .01), f = Math.min(1, (tc - sev.t) / (tE - sev.t)), L = e.type === 'miss' ? e.lat : (th.viz.blind ? th.viz.blind.lat : 0);
      if (e.type === 'miss' || e.type === 'ground') lat = (L >= 0 ? 1 : -1) * Math.min(42, 10 + Math.abs(L) * 2) * f * f + Math.sin((tc - sev.t) * 9 + th.idx) * 1.2 * f;
      if (e.type === 'ground') { d = Math.max(d, e.d); sag = f * f; }
    }
    return { d, lat, sag, mode: md, alive: tt < e.t };
  }
  const mpos = (th, m) => { const p = P(m.d, th.brg, m.lat, 0); p.y = Math.max(hAt(th, m.d) * (1 - .93 * m.sag) + (m.dz || 0), gh(p.x, p.z) + (m.sag > .5 ? .5 : 1.6)); return p; };
  function clearRoot() { root.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) m.dispose(); }); for (const c of root.children.slice()) root.remove(c); $('#cineLabels').innerHTML = ''; labels = []; }
  const ENDTXT = { he_kill: ['HE KILL', 'he'], aps_kill: ['APS KILL', 'aps'], self_destruct: ['SELF-DESTRUCTED', 'good'], hit: ['HIT', 'bad'] };
  function load(r, i) {
    rec = r; idx = i; hold = 0; t0c = Math.max(0, Math.min(...r.threats.map(x => x.t0)) - 1.2); t = t0c; base = Math.max(1, (r.t_end - t0c) / 20); rate = speed === 'cine' ? base : +speed; shotId = ''; camP = null; focus = -1; sightK = 0; lastFire = -1e9;
    clearRoot(); const cfg = run.cfg; wx = WX[cfg.env.weather] || WX.clear; carbon = cfg.obs.alpha_m2_per_g >= 1.5; tOff = (i % 97) * 3.7;
    maxR = Math.max(1000, ...rec.threats.map(x => x.R)) * 1.1;
    bumps = rec.threats.filter(th => { const tt = TH[th.key]; return tt.launch_h > 20 && tt.launch_h < 50 && tt.guidance !== 'drone'; }).map(th => { const p = P(th.R, th.brg, 0, 0); return { x: p.x, z: p.z, h: 17, s2: 1500 }; });
    let sx = 0, sy = 0; for (const th of rec.threats) { sx += Math.sin(th.brg * DEG); sy += Math.cos(th.brg * DEG); } baseA = Math.atan2(sx, sy) / DEG + 180;
    // sky, sun and atmosphere
    const sa = (baseA + 52) * DEG, se = wx.el * DEG; sunDir.set(Math.sin(sa) * Math.cos(se), Math.sin(se), -Math.cos(sa) * Math.cos(se));
    const su = sky.material.uniforms; su.zen.value.set(wx.zen); su.hor.value.set(wx.hor); su.sunC.value.set(wx.sun); su.sunD.value.copy(sunDir); su.cloudC.value.set(wx.cloud); su.cover.value = wx.cover;
    scene.fog.color.set(wx.hor); scene.fog.density = wx.fog; R.toneMappingExposure = wx.exp;
    hemi.color.copy(col(wx.hs)); hemi.groundColor.copy(col(wx.hg)); hemi.intensity = wx.hi; sunL.color.copy(col(wx.sun)); sunL.intensity = wx.light;
    for (const ps of [smoke, fire]) { const u = ps.m.uniforms; u.sunC.value.setRGB(...wx.sc); u.amb.value.setRGB(...wx.amb); u.fogC.value.set(wx.hor); u.fogD.value = wx.fog; } ribbons.m.uniforms.fogD.value = wx.fog;
    // ground
    const gt = groundTex(cfg.env.terrain), gg = new THREE.PlaneGeometry(5200, 5200, 160, 160); gg.rotateX(-Math.PI / 2); const gp = gg.attributes.position, gc = new Float32Array(gp.count * 3);
    for (let k = 0; k < gp.count; k++) { const x = gp.getX(k), z = gp.getZ(k); gp.setY(k, gh(x, z)); const v = .72 + .5 * fbm(x * .0035 + 9, z * .0035, 3), w = .9 + .2 * vn(x * .02, z * .02); gc[k * 3] = v * w; gc[k * 3 + 1] = v; gc[k * 3 + 2] = v * (1.02 - .1 * w); }
    gg.setAttribute('color', new THREE.BufferAttribute(gc, 3)); gg.computeVertexNormals();
    ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.nrm, normalScale: new THREE.Vector2(.4, .4), vertexColors: true, roughness: 1, metalness: 0 })); ground.receiveShadow = true; root.add(ground);
    // dirt track under the vehicle
    { const hull = rec.ctx.hull * DEG, rg = new THREE.PlaneGeometry(15, 1300, 2, 90); rg.rotateX(-Math.PI / 2); const rp = rg.attributes.position, fx = Math.sin(hull), fz = -Math.cos(hull);
      for (let k = 0; k < rp.count; k++) { const lx = rp.getX(k), lz = rp.getZ(k), bend = Math.sin(lz * .008) * 26 * sst(40, 260, Math.abs(lz)), X = (lx + bend) * Math.cos(hull) + (-lz) * fx, Z = (lx + bend) * Math.sin(hull) + (-lz) * fz; rp.setXYZ(k, X, gh(X, Z) + .14, Z); }
      rg.computeVertexNormals(); const am = texCache.road || (texCache.road = canvasTex(64, 4, x => { const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, '#000'); g.addColorStop(.25, '#fff'); g.addColorStop(.42, '#999'); g.addColorStop(.58, '#999'); g.addColorStop(.75, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 64, 4); }));
      const rm = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: col(cfg.env.terrain === 'urban' ? 0x3a3a3a : 0x6a573f), alphaMap: am, transparent: true, opacity: .8, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); rm.receiveShadow = true; rm.renderOrder = 1; root.add(rm); }
    root.add(deco(cfg.env.terrain, i + 1, rec.threats.map(th => ({ brg: th.brg, r: rr(th.R) }))));
    // range rings and labels (overlay)
    const ovl = new THREE.Group(); ovl.name = 'ovl'; root.add(ovl);
    for (const d of [250, 500, 1000, 2000, 4000, 8000]) if (d <= maxR) {
      const pts = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * Math.PI * 2, x = rr(d) * Math.sin(a), z = -rr(d) * Math.cos(a); pts.push(V3(x, gh(x, z) + .6, z)); }
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .2, depthWrite: false })); ovl.add(ln);
      const lb = lab('c3rng', d >= 1000 ? d / 1000 + ' km' : d + ' m'); lb.p.copy(P(d, baseA + 180 + 62, 0, 3)); lb.on = true;
    }
    for (const [lo, hi] of cfg.gun.dead_zones_deg) if (cfg.hkoi_enabled) { const m = new THREE.Mesh(new THREE.CircleGeometry(150, 24, (90 - rec.ctx.hull - hi) * DEG, (hi - lo) * DEG), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .05, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = .5; ovl.add(m); const lb = lab('c3rng', 'gun can’t fire here'); lb.p.copy(P(maxR * .06, rec.ctx.hull + (lo + hi) / 2, 0, 2)); lb.on = true; }
    veh = vehicle(cfg); root.add(veh); gunB = baseA + 180; gunEl = 0;
    calls = []; beats = [];
    const call = (tt, text, cls, pos, beat) => { const o = lab('c3call ' + cls, text); calls.push({ t: tt, o, at: null, base: pos.clone() }); if (beat !== false) beats.push(tt); };
    LPY = [];
    th3 = rec.threats.map(th => {
      const tt = TH[th.key], c = TCOL[th.idx % TCOL.length], gp0 = P(th.R, th.brg, 0, 0), gy = gh(gp0.x, gp0.z), air = tt.launch_h >= 50, drone = tt.guidance === 'drone', hill = !air && !drone && tt.launch_h > 20;
      const ly = gy + (tt.launch_h > 100 ? 62 : air ? 36 : drone ? 20 : 3); LPY[th.idx] = ly; const lp = V3(gp0.x, ly, gp0.z);
      const L = launcherModel(tt, c); L.position.set(gp0.x, air ? ly : gy, gp0.z); L.lookAt(0, L.position.y, 0); root.add(L);
      const missile = missileModel(tt, c); missile.visible = false; root.add(missile);
      const tag = lab('c3tag', `<b style="background:${c}">${th.idx + 1}</b>${tt.short}`); tag.p.set(lp.x, lp.y + (air ? 11 : 9), lp.z); tag.on = true; const mtag = lab('c3m', `<b style="background:${c}">${th.idx + 1}</b>`);
      const fwd = V3(-gp0.x, 0, -gp0.z).normalize(), back = fwd.clone().negate();
      const cuts = rec.bursts.filter(b => b.idx === th.idx && b.kind === 'obs' && b.res && b.res.cut).map(b => ({ t: b.res.t_cut, d: b.res.meet }));
      if (th.viz.sever && !th.viz.sever.smoke && !cuts.length) cuts.push({ t: th.viz.sever.t, d: th.viz.sever.d });
      const o = { th, lp, c, L, missile, tag, mtag, cuts, fwd, back, shots: [] };
      if (th.viz.sever && th.viz.sever.smoke) { const ms = mstate(th, th.viz.sever.t + .001); if (ms) call(th.viz.sever.t, 'LOST IN SMOKE', 'cloud', mpos(th, ms)); }
      for (const cu of cuts) { const ms = mstate(th, cu.t + .001); if (ms) { cu.p = mpos(th, ms); cu.bp = P(cu.d, th.brg, 0, hAt(th, cu.d)); call(cu.t, `BEAM CUT · ${Math.round(HK.distAt(th, cu.t))} m`, 'good', cu.p); o.shots.push({ t: cu.t, kind: 'side', at: cu.p }); } }
      const e = th.viz.end, me = mstate(th, e.t - .001), pe = e.type === 'hit' ? V3(0, HV, 0) : (me ? mpos(th, me) : lp.clone()); o.pe = pe;
      if (e.type === 'miss') call(e.t, e.miss != null ? `MISSED BY ${e.miss.toFixed(0)} m` : 'MISSED', 'good', pe);
      else if (e.type === 'ground') call(e.t, `FELL ${Math.round(e.d)} m SHORT`, 'good', pe);
      else if (ENDTXT[e.type]) call(e.t, ENDTXT[e.type][0], ENDTXT[e.type][1], pe);
      o.shots.push({ t: e.t, kind: (e.type === 'hit' || e.type === 'aps_kill' || e.type === 'miss') ? 'close' : 'side', at: pe });
      return o;
    });
    if (rec.crew) for (const a of rec.crew.acts) call(a.t, a.kind === 'smoke' ? 'SMOKE' : 'DRIVER EVADES', 'crew', V3(0, HV + 6, 0), false);
    if (rain) { scene.remove(rain); rain.geometry.dispose(); rain = null; }
    if (wx.rain) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(700 * 6), 3)); rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfd8dd, transparent: true, opacity: .22, depthWrite: false })); rain.frustumCulled = false; scene.add(rain); }
    $('#cineCrew').hidden = !rec.crew; $('#cineVerdict').hidden = true;
  }
  // ---- effects (all are pure functions of time so that scrubbing works)
  const qA = V3(0, 0, 0), qB = V3(0, 0, 0), qC = V3(0, 0, 0), qD = V3(0, 0, 0);
  function boom(p, age, kind, seed) {
    if (age < 0) return; const air = kind !== 'hit' && kind !== 'ground' && kind !== 'dirt', big = kind === 'hit' ? 1.9 : kind === 'ground' ? 1.15 : kind === 'dirt' ? .8 : kind === 'aps_kill' ? 1.05 : .95, dusty = kind === 'ground' || kind === 'dirt';
    if (age < .14 && kind !== 'dirt') { const k = 1 - age / .14; fire.add(p.x, p.y, p.z, (18 + 34 * (1 - k)) * big, k * .9, 1, .94, .78); if (k * big > boomHot) { boomHot = k * big; boomAt.copy(p); } }
    if (age < .95 && kind !== 'dirt') for (let i = 0; i < 10; i++) { const a = r1(seed, i) * 6.283, e = r1(seed + 1, i) * 2 - (air ? 1 : .15), cy = Math.sqrt(Math.max(0, 1 - Math.min(1, e * e))), k = age / .95, d = (7 + 15 * r1(seed + 2, i)) * big * (1 - Math.exp(-age * 5.5));
      fire.add(p.x + Math.cos(a) * cy * d, p.y + e * d * .85 + (air ? 0 : 1.5), p.z + Math.sin(a) * cy * d, (6 + 11 * k) * big, (1 - k) * (1 - k) * .8, 1, .58 - .32 * k, .18 - .15 * k); }
    if (age < 1.2) for (let i = 0; i < (dusty ? 10 : 20); i++) { const a = r1(seed + 3, i) * 6.283, e = r1(seed + 4, i) * 1.6 - (air ? .8 : 0), cy = Math.sqrt(Math.max(0, 1 - Math.min(1, e * e))), sp = (40 + 70 * r1(seed + 5, i)) * big, life = .5 + .7 * r1(seed + 6, i); if (age > life) continue;
      const f = (tt2, out) => out.set(p.x + Math.cos(a) * cy * sp * tt2, p.y + e * sp * tt2 - 60 * tt2 * tt2, p.z + Math.sin(a) * cy * sp * tt2); f(age, qA); f(Math.max(0, age - .045), qB); if (qA.y < 0) continue; ribbons.add(qB, qA, .7, 1, .74, .38, 0, 1 - age / life); }
    const sl = dusty ? 5 : 7.5; if (age < sl) { const n = kind === 'hit' ? 16 : 11, dr = dusty ? .62 : .2, dg = dusty ? .54 : .2, db = dusty ? .42 : .21;
      for (let i = 0; i < n; i++) { const a = r1(seed + 7, i) * 6.283, e = r1(seed + 8, i), k = age / sl, d = (5 + 13 * r1(seed + 9, i)) * big * (1 - Math.exp(-age * 2.2)) * (dusty ? 1.5 : 1), lift = (dusty ? 2.5 : 5) * age * (.4 + e), g = Math.min(1, .3 + k * 1.2);
        smoke.add(p.x + Math.cos(a) * d, p.y + (air ? (e - .5) * d : e * d * .5) + lift, p.z + Math.sin(a) * d, (9 + 26 * Math.sqrt(k)) * big * (.7 + .5 * r1(seed, i + 40)), Math.min(1, age * 8) * .72 * (1 - k) * (1 - k), dr + g * .3, dg + g * .3, db + g * .3, a + age * .2 * (i % 2 ? 1 : -1), i % 4); } }
  }
  function column(x, y, z, age, tv, seed) { // burning vehicle: flames and a rising black column
    for (let i = 0; i < 7; i++) { const L = .75, a = (tv + i / 7 * L) % L; if (a > age) continue; const k = a / L; fire.add(x + (r1(seed, i) - .5) * 9, y - 2 + a * 14, z + (r1(seed + 1, i) - .5) * 9, 11 * (1 - k) + 4, .9 * (1 - k), 1, .55 - .25 * k, .15); }
    for (let i = 0; i < 22; i++) { const L = 7, a = (tv + i / 22 * L) % L; if (a > age) continue; const k = a / L, wv = rec.ctx.wind * .8; smoke.add(x + (r1(seed + 2, i) - .5) * 6 + Math.sin(rec.ctx.wind_dir * DEG) * wv * a * a * .5 + Math.sin(a * 1.3 + i) * 2, y + 2 + a * 11, z + (r1(seed + 3, i) - .5) * 6 - Math.cos(rec.ctx.wind_dir * DEG) * wv * a * a * .5, 9 + a * 6.5, .8 * Math.min(1, a * 3) * (1 - k), .05 + k * .14, .05 + k * .14, .055 + k * .14, i + a * .25, i % 4); }
    if (1.2 > boomHot) { boomHot = Math.max(boomHot, .28 + .08 * Math.sin(tv * 23)); boomAt.set(x, y + 4, z); }
  }
  function autoShot(fxs) { // the director: pick a close-up around the key moments
    let best = null, bd = 1e9;
    for (const o of th3) for (const s of o.shots) { const a = s.t - (s.kind === 'side' ? 1.15 : .85) * fxs, b = s.t + (s.kind === 'side' ? .5 : .6) * fxs; if (t < a || t > b) continue; const d = Math.abs(t - s.t); if (d < bd) { bd = d; best = { o, s }; } }
    return best;
  }
