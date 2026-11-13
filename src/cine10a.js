// ================================================================ 3D replay (shared by Overview and Watch a mission)
const VIEW_NAME = { main: 'your setup', aps: 'APS alone', none: 'no protection' };
const Cine = (() => {
  const S3 = 300, DEG = Math.PI / 180, V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // ---- player state
  let rec = null, run = null, view = 'main', idx = -1, t = 0, t0c = 0, base = 1, rate = 1, speed = 'cine', playing = true, hold = 0, raf = 0, last = 0, dragging = false, beats = [], overlay = true, wall = 0;
  const hooks = { load: null, frame: null };
  // ---- renderer state
  let ok = false, failed = false, R, scene, cam, root, sky, sunL, hemi, ground, post = null, Q = (window.__hkq != null ? window.__hkq : (Math.min(window.innerWidth, window.innerHeight) < 520 ? 1 : 2)), qLock = window.__hkq != null, slowT = 0, W = 0, H = 0;
  let maxR = 5000, HV = 9, baseA = 0, gunB = 0, gunEl = 0, veh, rws, gunPivot, gunBarrel, th3 = [], calls = [], labels = [], chipTxt = [], tank = true, tOff = 0, LPY = [];
  let mode = 'auto', camP = null, camL = null, camF = 46, orbAz = 0, orbEl = 0, orbZoom = 1, drift = 0, shotId = '', fadeT = 0, focus = -1, rideSel = null;
  let sightK = 0, obst = [], smoke, fire, ribbons, rain = null, boomL, muzL, wx, sunDir = V3(0, 1, 0), boomHot = 0, boomAt = V3(0, 0, 0), carbon = true, bodyMat = null, bodyCol = null, lastFire = -1e9;
  const tA = V3(0, 0, 0), tB = V3(0, 0, 0), tC = V3(0, 0, 0), tD = V3(0, 0, 0);
  // ---- noise and scale helpers
  const hsh = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, y, o) => { let s = 0, a = .5, f = 1; for (let i = 0; i < (o || 4); i++) { s += a * vn(x * f, y * f); f *= 2.03; a *= .5; } return s; };
  const sst = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const r1 = (i, k) => hsh(i * 12.9898 + 3.1, k * 78.233 + 1.7);
  const col = h => new THREE.Color(h).convertSRGBToLinear();
  const rr = d => S3 * Math.sqrt(Math.max(d, 0) / maxR);
  const P = (d, brg, lat, h) => { const r = rr(d), a = brg * DEG; return V3(r * Math.sin(a) + (lat || 0) * Math.cos(a), h, -r * Math.cos(a) + (lat || 0) * Math.sin(a)); };
  let bumps = []; const gh = (x, z) => { const r = Math.hypot(x, z), far = sst(330, 1000, r), near = sst(14, 70, r); let bh = 0; for (const b of bumps) { const dx = x - b.x, dz = z - b.z, d2 = dx * dx + dz * dz; if (d2 < 22500) bh += b.h * Math.exp(-d2 / b.s2); } return bh + near * ((fbm(x * .011 + tOff, z * .011, 3) - .47) * 5 * (1 - far) + far * (fbm(x * .0019 + tOff, z * .0019 + 7, 4) * 230 - 30)); };
  const hAt = (th, d) => HV + (LPY[th.idx] - HV) * Math.min(1, d / th.R);
  // ---- textures
  function canvasTex(w, h, fn, srgb) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), c); const tx = new THREE.CanvasTexture(c); if (srgb) tx.encoding = THREE.sRGBEncoding; return tx; }
  function glowTex() { return canvasTex(128, 128, x => { const g = x.createRadialGradient(64, 64, 1, 64, 64, 63); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.75)'); g.addColorStop(.45, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }); }
  function puffTex() { // 2 x 2 atlas of billowing puffs with wispy edges
    return canvasTex(512, 512, x => { const im = x.createImageData(512, 512), d = im.data;
      for (let q = 0; q < 4; q++) { const ox = (q % 2) * 256, oy = (q >> 1) * 256, s = q * 37.7;
        for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const u = (i - 127.5) / 127.5, v = (j - 127.5) / 127.5, r = Math.hypot(u, v), n = fbm(i * .022 + s, j * .022 + s * .6, 5), n2 = fbm(i * .05 + s + 11, j * .05, 4), e = 1 - sst(.3, .96, r + (n - .5) * .85), o = ((oy + j) * 512 + ox + i) * 4, l = 150 + 105 * sst(.25, .8, n2) * (1 - .3 * r);
          d[o] = d[o + 1] = d[o + 2] = l; d[o + 3] = Math.max(0, Math.min(255, e * (.62 + .5 * n2) * 255 * (1 - sst(.92, 1, r)))); } }
      x.putImageData(im, 0, 0); });
  }
  const GT = { open: [[124, 108, 74], [88, 92, 54], [108, 90, 64]], mixed: [[88, 98, 54], [58, 76, 40], [98, 84, 58]], urban: [[96, 93, 86], [72, 72, 68], [104, 94, 78]] }, texCache = {};
  function groundTex(kind) {
    if (texCache[kind]) return texCache[kind];
    const N = 512, hf = new Float32Array(N * N), cs = GT[kind] || GT.open;
    const map = canvasTex(N, N, x => { const im = x.createImageData(N, N), d = im.data;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = fbm(i * .012, j * .012, 4), b = fbm(i * .06 + 40, j * .06, 3), g = hsh(i, j), k = sst(.38, .62, a), m = sst(.55, .75, b), o = (j * N + i) * 4; hf[j * N + i] = a * .5 + b * .35 + g * .15;
        for (let c = 0; c < 3; c++) { let v = cs[0][c] + (cs[1][c] - cs[0][c]) * k; v += (cs[2][c] - v) * m * .7; d[o + c] = Math.max(0, Math.min(255, v * (.9 + .16 * g * b + .08 * a))); } d[o + 3] = 255; }
      x.putImageData(im, 0, 0); }, true);
    const nrm = canvasTex(N, N, x => { const im = x.createImageData(N, N), d = im.data; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const l = hf[j * N + ((i + N - 1) % N)], r = hf[j * N + ((i + 1) % N)], u = hf[((j + N - 1) % N) * N + i], dn = hf[((j + 1) % N) * N + i], nx = (l - r) * 2.2, ny = (u - dn) * 2.2, il = 1 / Math.hypot(nx, ny, 1), o = (j * N + i) * 4; d[o] = (nx * il * .5 + .5) * 255; d[o + 1] = (ny * il * .5 + .5) * 255; d[o + 2] = (il * .5 + .5) * 255; d[o + 3] = 255; } x.putImageData(im, 0, 0); });
    for (const tx of [map, nrm]) { tx.wrapS = tx.wrapT = THREE.MirroredRepeatWrapping; tx.repeat.set(20, 20); tx.anisotropy = 8; }
    return (texCache[kind] = { map, nrm });
  }
  function paintTex(base) { return texCache['p' + base] || (texCache['p' + base] = canvasTex(256, 256, x => { const im = x.createImageData(256, 256), d = im.data, c = new THREE.Color(base); for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const a = fbm(i * .03, j * .03, 4), g = hsh(i + 9, j), k = .78 + .34 * a + .08 * g, o = (j * 256 + i) * 4; d[o] = Math.min(255, c.r * 255 * k); d[o + 1] = Math.min(255, c.g * 255 * k); d[o + 2] = Math.min(255, c.b * 255 * k * .97); d[o + 3] = 255; } x.putImageData(im, 0, 0); }, true)); }
  function facadeTex() { return texCache.fac || (texCache.fac = canvasTex(128, 256, x => { x.fillStyle = '#8b867c'; x.fillRect(0, 0, 128, 256); for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) { const lit = r1(i, j) > .86; x.fillStyle = lit ? '#e8c98a' : (r1(i + 7, j) > .5 ? '#2c3136' : '#3a4046'); x.fillRect(10 + i * 30, 10 + j * 31, 18, 20); } x.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 40; i++) x.fillRect(r1(i, 50) * 128, r1(i, 51) * 256, 2 + r1(i, 52) * 5, 20 + r1(i, 53) * 60); }, true)); }
  // ---- particle systems (instanced camera-facing quads)
  const PV = `attribute vec3 off; attribute vec4 col; attribute vec3 prm; varying vec2 vN; varying vec2 vTc; varying vec4 vCol; varying float vFog; uniform float fogD;
    void main(){ vec4 mv = modelViewMatrix * vec4(off, 1.0); float c = cos(prm.y), s = sin(prm.y); vec2 rp = vec2(position.x * c - position.y * s, position.x * s + position.y * c); mv.xy += rp * prm.x; gl_Position = projectionMatrix * mv;
      vN = rp * 2.0; vec2 cell = vec2(mod(prm.z, 2.0), floor(prm.z * 0.5)); vTc = (cell + position.xy + 0.5) * 0.5; vCol = col; float d = -mv.z; vFog = 1.0 - exp(-fogD * fogD * d * d); }`;
  const PFS = `uniform sampler2D map; uniform vec3 sunV; uniform vec3 sunC; uniform vec3 amb; uniform vec3 fogC; varying vec2 vN; varying vec2 vTc; varying vec4 vCol; varying float vFog;
    void main(){ vec4 tx = texture2D(map, vTc); float a = tx.a * vCol.a; if (a < 0.004) discard; float z = sqrt(max(0.0, 1.0 - dot(vN, vN))); vec3 n = normalize(vec3(vN, z * 0.8 + 0.2)); float d = dot(n, sunV) * 0.5 + 0.5;
      vec3 c = min(vCol.rgb * (amb + sunC * d * d) * (0.7 + 0.3 * tx.r), vec3(0.93)); gl_FragColor = vec4(mix(c, fogC, vFog), a); }`;
  const PFA = `uniform sampler2D map; varying vec2 vN; varying vec4 vCol; varying float vFog; void main(){ float a = texture2D(map, vN * 0.5 + 0.5).a * vCol.a * (1.0 - vFog); gl_FragColor = vec4(vCol.rgb * a, 1.0); }`;
  function Parts(n, additive, map, camF) {
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0], 3)); g.setIndex([0, 1, 2, 2, 1, 3]);
    const off = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), cl = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), prm = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (const a of [off, cl, prm]) a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('off', off); g.setAttribute('col', cl); g.setAttribute('prm', prm);
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, sunV: { value: V3(0, 1, 0) }, sunC: { value: new THREE.Color() }, amb: { value: new THREE.Color() }, fogC: { value: new THREE.Color() }, fogD: { value: 0 } }, vertexShader: PV, fragmentShader: additive ? PFA : PFS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = additive ? 6 : 5;
    const st = new Float32Array(n * 10), key = new Float32Array(n), order = new Uint16Array(n); let cnt = 0;
    return { mesh, m, begin() { cnt = 0; },
      add(x, y, z, size, a, r, g2, b, rot, tx) { if (cnt >= n || a <= .003 || size <= 0) return; const o = cnt * 10; st[o] = x; st[o + 1] = y; st[o + 2] = z; st[o + 3] = size; st[o + 4] = a > 1 ? 1 : a; st[o + 5] = r; st[o + 6] = g2; st[o + 7] = b; st[o + 8] = rot || 0; st[o + 9] = tx || 0; cnt++; },
      flush() {
        const CM = camF ? camF() : cam, cp = CM.position; CM.getWorldDirection(tA);
        for (let i = 0; i < cnt; i++) { order[i] = i; key[i] = (st[i * 10] - cp.x) * tA.x + (st[i * 10 + 1] - cp.y) * tA.y + (st[i * 10 + 2] - cp.z) * tA.z; }
        const ord = additive ? order : Array.prototype.slice.call(order, 0, cnt).sort((a, b) => key[b] - key[a]);
        for (let i = 0; i < cnt; i++) { const o = ord[i] * 10; off.array[i * 3] = st[o]; off.array[i * 3 + 1] = st[o + 1]; off.array[i * 3 + 2] = st[o + 2]; cl.array[i * 4] = st[o + 5]; cl.array[i * 4 + 1] = st[o + 6]; cl.array[i * 4 + 2] = st[o + 7]; cl.array[i * 4 + 3] = st[o + 4]; prm.array[i * 3] = st[o + 3]; prm.array[i * 3 + 1] = st[o + 8]; prm.array[i * 3 + 2] = st[o + 9]; }
        g.instanceCount = cnt; off.needsUpdate = cl.needsUpdate = prm.needsUpdate = true; mesh.visible = cnt > 0;
      } };
  }
  function Ribbons(n, camF) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 12), cl = new Float32Array(n * 16), uv = new Float32Array(n * 8), ix = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) { uv.set([0, 0, 0, 1, 1, 0, 1, 1], i * 8); ix.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6); }
    const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(cl, 4); pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa); g.setAttribute('col', ca); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(ix, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { fogD: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute vec4 col; varying vec4 vCol; varying vec2 vUv; varying float vFog; uniform float fogD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vCol = col; vUv = uv; float d = -mv.z; vFog = 1.0 - exp(-fogD * fogD * d * d); }`,
      fragmentShader: `varying vec4 vCol; varying vec2 vUv; varying float vFog; void main(){ float e = 1.0 - abs(vUv.y * 2.0 - 1.0); gl_FragColor = vec4(vCol.rgb * vCol.a * pow(e, 1.7) * (1.0 - vFog * 0.7), 1.0); }` });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; let cnt = 0;
    return { mesh, m, begin() { cnt = 0; },
      add(a, b, w, r, g2, bl, a0, a1) { if (cnt >= n) return; tA.subVectors(b, a); tB.addVectors(a, b).multiplyScalar(.5); tC.subVectors((camF ? camF() : cam).position, tB); tD.crossVectors(tA, tC); const l = tD.length(); if (l < 1e-6) return; tD.multiplyScalar(w * .5 / l);
        const o = cnt * 12, c = cnt * 16; pos[o] = a.x - tD.x; pos[o + 1] = a.y - tD.y; pos[o + 2] = a.z - tD.z; pos[o + 3] = a.x + tD.x; pos[o + 4] = a.y + tD.y; pos[o + 5] = a.z + tD.z; pos[o + 6] = b.x - tD.x; pos[o + 7] = b.y - tD.y; pos[o + 8] = b.z - tD.z; pos[o + 9] = b.x + tD.x; pos[o + 10] = b.y + tD.y; pos[o + 11] = b.z + tD.z;
        for (let k = 0; k < 4; k++) { cl[c + k * 4] = r; cl[c + k * 4 + 1] = g2; cl[c + k * 4 + 2] = bl; cl[c + k * 4 + 3] = k < 2 ? a0 : a1; } cnt++; },
      flush() { g.setDrawRange(0, cnt * 6); pa.needsUpdate = ca.needsUpdate = true; mesh.visible = cnt > 0; } };
  }
  // ---- post-processing: bloom, vignette, grain
  function makePost(RX) { RX = RX || R;
    const gl2 = RX.capabilities.isWebGL2, fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), fs = new THREE.Scene(), fc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); fs.add(fsq); fsq.frustumCulled = false;
    const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', mk = (fr, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fr, depthTest: false, depthWrite: false });
    const bright = mk('uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(0.8, 1.0, l), 1.0); }', { t: { value: null } });
    const blur = mk('uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227; c += (texture2D(t, vUv + d * 1.385).rgb + texture2D(t, vUv - d * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + d * 3.231).rgb + texture2D(t, vUv - d * 3.231).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }', { t: { value: null }, d: { value: new THREE.Vector2() } });
    const comp = mk(`uniform sampler2D t; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform float time; uniform float grain; uniform float vig; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
      void main(){ vec3 c = texture2D(t, vUv).rgb; vec3 b = texture2D(b1, vUv).rgb * 0.55 + texture2D(b2, vUv).rgb * 0.5 + texture2D(b3, vUv).rgb * 0.45; c = c + b * 0.5; vec2 q = vUv - 0.5; c *= 1.0 - vig * dot(q, q) * 1.5; c = c * (1.0 + 0.06 * (c - 0.5)); c += (h(vUv * 917.0) - 0.5) * grain; gl_FragColor = vec4(c, 1.0); }`, { t: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, time: { value: 0 }, grain: { value: .035 }, vig: { value: .55 } });
    let rt = null, half = [], qtr = [], eig = [];
    const rtx = (w, h) => new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    const pass = (m, to) => { fsq.material = m; RX.setRenderTarget(to); RX.render(fs, fc); };
    return {
      size(w, h) { for (const x of [rt, ...half, ...qtr, ...eig]) if (x) x.dispose();
        rt = gl2 ? (THREE.WebGLMultisampleRenderTarget ? new THREE.WebGLMultisampleRenderTarget(w, h, { encoding: THREE.sRGBEncoding }) : new THREE.WebGLRenderTarget(w, h, { encoding: THREE.sRGBEncoding, samples: 4 })) : new THREE.WebGLRenderTarget(w, h, { encoding: THREE.sRGBEncoding, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); if (gl2) rt.samples = 4;
        half = [rtx(w >> 1, h >> 1), rtx(w >> 1, h >> 1)]; qtr = [rtx(w >> 2, h >> 2), rtx(w >> 2, h >> 2)]; eig = [rtx(w >> 3, h >> 3), rtx(w >> 3, h >> 3)]; },
      render(sc, cm, time) { RX.setRenderTarget(rt); RX.render(sc, cm);
        bright.uniforms.t.value = rt.texture; pass(bright, half[0]);
        const bl = (src, a, b) => { blur.uniforms.t.value = src.texture; blur.uniforms.d.value.set(1 / a.width, 0); pass(blur, a); blur.uniforms.t.value = a.texture; blur.uniforms.d.value.set(0, 1 / a.height); pass(blur, b); };
        bl(half[0], half[1], half[0]); bl(half[0], qtr[1], qtr[0]); bl(qtr[0], eig[1], eig[0]);
        comp.uniforms.t.value = rt.texture; comp.uniforms.b1.value = half[0].texture; comp.uniforms.b2.value = qtr[0].texture; comp.uniforms.b3.value = eig[0].texture; comp.uniforms.time.value = time % 10; pass(comp, null); } };
  }
  // ---- weather and light presets (display colours)
  const WX = {
    clear: { zen: '#2a5c9e', hor: '#c5d3dc', sun: '#ffe2bd', el: 21, light: 3.0, hs: '#a9c0dd', hg: '#6f6048', hi: .75, fog: .0008, cover: .3, cloud: '#ffffff', exp: .78, amb: [.42, .46, .56], sc: [1.0, .78, .52] },
    haze: { zen: '#5f7d9c', hor: '#d9d0bf', sun: '#fff0d8', el: 26, light: 2.3, hs: '#b9c6d2', hg: '#6e6654', hi: .8, fog: .0017, cover: .22, cloud: '#efe9de', exp: .9, amb: [.52, .55, .58], sc: [.8, .74, .62] },
    rain: { zen: '#3a4249', hor: '#7c868d', sun: '#b9c2c9', el: 42, light: .95, hs: '#a4afb8', hg: '#4d4c46', hi: 1.15, fog: .0023, cover: 1, cloud: '#5c656d', exp: .82, amb: [.44, .47, .5], sc: [.3, .31, .33], rain: true },
    dust: { zen: '#907049', hor: '#cba56f', sun: '#ffd08c', el: 20, light: 1.9, hs: '#d3b488', hg: '#7a623f', hi: .9, fog: .0031, cover: .08, cloud: '#d0b07e', exp: .9, amb: [.56, .47, .34], sc: [.7, .52, .3] },
    fog: { zen: '#8f999e', hor: '#b6bec2', sun: '#e9eef0', el: 32, light: .85, hs: '#c8d0d4', hg: '#5e605a', hi: 1.2, fog: .0038, cover: .9, cloud: '#aeb7bc', exp: .86, amb: [.55, .57, .59], sc: [.3, .3, .3] } };
  const SKYF = `varying vec3 vD; uniform vec3 zen; uniform vec3 hor; uniform vec3 sunC; uniform vec3 sunD; uniform vec3 cloudC; uniform float cover; uniform float time;
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
    void main(){ vec3 d = normalize(vD); float y = max(d.y, 0.0); vec3 c = mix(hor, zen, pow(y, 0.42)); float sd = max(dot(d, sunD), 0.0);
      c += sunC * (pow(sd, 900.0) * 4.0 + pow(sd, 40.0) * 0.32 + pow(sd, 5.0) * 0.16) * smoothstep(-0.02, 0.03, d.y);
      vec2 uv = d.xz / (d.y + 0.14) * 1.1 + time * 0.006; float n = fb(uv), m = smoothstep(1.0 - cover - 0.12, 1.0 - cover + 0.3, n) * mix(smoothstep(0.0, 0.16, d.y), 1.0, smoothstep(0.7, 1.0, cover));
      vec3 cc = mix(cloudC * 0.7, cloudC * 0.96 + sunC * 0.12 * pow(sd, 2.0), smoothstep(0.3, 0.85, fb(uv + 0.31)));
      float hz = mix(smoothstep(0.0, 0.1, d.y), 1.0, smoothstep(0.7, 1.0, cover)); c = mix(c, mix(hor, cc, smoothstep(0.0, 0.2, d.y)), m * 0.9 * hz); if (d.y < 0.0) c = hor; gl_FragColor = vec4(c, 1.0); }`;
  // ---- models
  const M = (c, rough, metal, map) => new THREE.MeshStandardMaterial({ color: map ? 0xffffff : col(c), map: map || null, roughness: rough == null ? .85 : rough, metalness: metal || 0 });
  function mesh(g, m, x, y, z, parent) { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o; }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r0, r1v, l, s) => new THREE.CylinderGeometry(r0, r1v, l, s || 12);
  function sideExt(pts, w) { const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))), g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0); return g; }   // profile in (z, y), width along x
  function prism(pts, h) { const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1]))), g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; }   // profile in (x, z), height along y
  function vehicle(cfg) {
    const g = new THREE.Group(), green = cfg.env.terrain !== 'open'; bodyCol = green ? 0x56603f : 0xa39069; bodyMat = M(0, .82, .08, paintTex(bodyCol));
    const dark = M(0x1b1c1a, .95), steel = M(0x3a3c3a, .55, .6), glass = M(0x0c1114, .15, .8);
    tank = cfg.vehicle.half_w > 1.6;
    if (tank) {
      mesh(sideExt([[-10.6, 2.1], [-9.3, 4.3], [-4.4, 4.95], [10.3, 4.95], [10.6, 2.8], [9.6, 1.5], [-9.5, 1.5]], 9.2), bodyMat, 0, 0, 0, g);
      for (const sx of [-1, 1]) {
        mesh(sideExt([[-10.3, 2.5], [-9.6, .7], [-8.6, 0], [8.8, 0], [9.9, 1], [10.5, 2.6], [9.7, 3.3], [-9.6, 3.3]], 2.5), dark, sx * 5.75, 0, 0, g);
        for (let i = 0; i < 7; i++) { const w = mesh(cyl(1.08, 1.08, 2.7, 14), steel, sx * 5.8, 1.1, -7.6 + i * 2.5, g); w.rotation.z = Math.PI / 2; }
        const sp = mesh(cyl(1.0, 1.0, 2.7, 10), steel, sx * 5.8, 2.1, -9.5, g); sp.rotation.z = Math.PI / 2; const idl = mesh(cyl(1.0, 1.0, 2.7, 10), steel, sx * 5.8, 2.1, 9.6, g); idl.rotation.z = Math.PI / 2;
        mesh(box(.35, 1.9, 19.4), bodyMat, sx * 7.05, 3.25, 0, g);
        mesh(box(1.5, .5, 1.1), M(0x15171a, .3, .2), sx * 3.4, 4.2, -9.75, g);
      }
      const tur = new THREE.Group(); tur.position.set(0, 4.95, .6); g.add(tur);
      mesh(prism([[-3.1, -5.2], [3.1, -5.2], [4.7, -1.2], [4.7, 4.4], [3.5, 5.8], [-3.5, 5.8], [-4.7, 4.4], [-4.7, -1.2]], 2.45), bodyMat, 0, 0, 0, tur);
      mesh(box(3.2, 1.9, 1.6), bodyMat, 0, 1.3, -5.6, tur);
      const br = mesh(cyl(.42, .46, 15, 14), bodyMat, 0, 1.35, -13.6, tur); br.rotation.x = Math.PI / 2;
      const ev = mesh(cyl(.66, .66, 2.4, 14), bodyMat, 0, 1.35, -12.2, tur); ev.rotation.x = Math.PI / 2; const mz = mesh(cyl(.52, .52, .7, 14), dark, 0, 1.35, -20.9, tur); mz.rotation.x = Math.PI / 2;
      mesh(cyl(1.25, 1.35, .7, 14), bodyMat, -2.2, 2.75, 1.4, tur); mesh(cyl(1.0, 1.0, .35, 14), bodyMat, 2.3, 2.6, 2.2, tur);
      mesh(box(7.6, 1.5, 2.2), M(0x2a2d25, .95), 0, 1.3, 6.9, tur);
      for (const sx of [-1, 1]) { for (let k = 0; k < 4; k++) { const d = mesh(cyl(.26, .26, 1.3, 8), dark, sx * (4.2 + (k % 2) * .6), 1.6 + (k >> 1) * .6, -2.6, tur); d.rotation.x = Math.PI / 2 - .5; d.rotation.z = -sx * .5; }
        const an = mesh(cyl(.05, .07, 9, 5), dark, sx * 3.6, 6.8, 5, tur); an.castShadow = false;
        if (cfg.aps.enabled) { const l = mesh(box(1.5, 1.3, 3.2), M(0x3b3f38, .7, .3), sx * 5.5, 1.5, 2.2, tur); l.rotation.y = sx * .25; mesh(box(.25, 1.5, 1.5), glass, sx * 4.85, 1.4, -1.1, tur).rotation.y = sx * .6; } }
      HV = 9.2;
    } else {
      mesh(sideExt([[-10.6, 3.3], [-8.6, 5.9], [-3.2, 6.7], [10.2, 6.7], [10.2, 2.5], [-9.6, 2.1]], 9.4), bodyMat, 0, 0, 0, g);
      for (const sx of [-1, 1]) { for (const z of [-7.4, -3.1, 2.2, 6.6]) { const w = mesh(cyl(1.75, 1.75, 1.7, 16), dark, sx * 4.9, 1.75, z, g); w.rotation.z = Math.PI / 2; const hb = mesh(cyl(.8, .8, 1.8, 10), steel, sx * 4.9, 1.75, z, g); hb.rotation.z = Math.PI / 2; }
        mesh(box(1.4, .5, 1.0), M(0x15171a, .3, .2), sx * 3.2, 4.6, -9.6, g); }
      mesh(box(4, .5, 3), bodyMat, -1.5, 6.9, -4, g); mesh(box(6, 1.2, 4), M(0x2a2d25, .95), 0, 7.2, 6, g); HV = 8.4;
    }
    // remote weapon station carrying the HKOI gun
    rws = new THREE.Group(); rws.position.set(0, HV - 1.7, tank ? 1.6 : -1); g.add(rws); rws.visible = cfg.hkoi_enabled;
    mesh(cyl(.9, 1.1, 1.3, 12), steel, 0, .65, 0, rws); gunPivot = new THREE.Group(); gunPivot.position.y = 1.7; rws.add(gunPivot);
    mesh(box(1.5, 1.3, 3.2), M(0x2f3330, .6, .4), 0, 0, .2, gunPivot); gunBarrel = mesh(cyl(.2, .24, 7.5, 10), dark, 0, .1, -5.1, gunPivot); gunBarrel.rotation.x = Math.PI / 2;
    mesh(box(1.1, 1.5, 2), bodyMat, 1.35, -.1, .6, gunPivot); mesh(box(1.0, 1.0, 1.2), M(0x2f3330, .6, .4), -1.3, .2, -.4, gunPivot);
    const lens = mesh(cyl(.34, .34, .1, 12), new THREE.MeshStandardMaterial({ color: 0x050808, emissive: col(0x3cd2c8), emissiveIntensity: .9, roughness: .2 }), -1.3, .2, -1.02, gunPivot); lens.rotation.x = Math.PI / 2;
    g.rotation.y = -rec.ctx.hull * DEG; return g;
  }
  function missileModel(tt, c) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
    if (tt.guidance === 'drone') { const d = M(0x202326, .7); mesh(box(1.1, .5, 1.8), d, 0, 0, 0, body); for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const a = mesh(box(.2, .15, 2.2), d, x / 2, 0, z / 2, body); a.rotation.y = Math.atan2(x, z); const r = mesh(new THREE.CircleGeometry(1.1, 14), new THREE.MeshBasicMaterial({ color: 0x9aa4a8, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false }), x, .25, z, body); r.rotation.x = -Math.PI / 2; r.castShadow = false; } mesh(cyl(.3, .22, 1.6, 8), M(0x6a5a3a, .8), 0, -.5, .2, body).rotation.x = Math.PI / 2; g.scale.setScalar(1.5); return g; }
    const m = M(0x5a5f55, .5, .5), big = tt.speed > 500 ? 1.2 : 1; const b = mesh(cyl(.36, .36, 4.4, 10), m, 0, 0, 0, body); b.rotation.x = Math.PI / 2; const n = mesh(new THREE.ConeGeometry(.36, 1.3, 10), M(0x2a2c2a, .4, .6), 0, 0, 2.85, body); n.rotation.x = Math.PI / 2;
    for (let k = 0; k < 4; k++) { const f = mesh(box(.06, 1.5, .9), m, 0, 0, -1.7, body); f.rotation.z = k * Math.PI / 2 + Math.PI / 4; f.position.x = Math.cos(f.rotation.z + Math.PI / 2) * .6; f.position.y = Math.sin(f.rotation.z + Math.PI / 2) * .6; }
    g.scale.setScalar(1.05 * big); return g;
  }
  function launcherModel(tt, c) {
    const g = new THREE.Group(), olive = M(0x3d4433, .9), dark = M(0x1c1e1b, .9);
    if (tt.launch_h >= 50) { // attack helicopter
      const f = mesh(new THREE.SphereGeometry(1, 14, 10), olive, 0, 0, 0, g); f.scale.set(2.3, 2.7, 7.5); const cn = mesh(new THREE.SphereGeometry(1, 12, 8), M(0x0b1014, .1, .9), 0, 1.0, 3.6, g); cn.scale.set(1.5, 1.5, 3.2);
      const tb = mesh(cyl(.9, .35, 12, 8), olive, 0, .6, -11.5, g); tb.rotation.x = Math.PI / 2; mesh(box(.3, 4.2, 2.2), olive, 0, 2.6, -17, g); mesh(box(9.5, .35, 2), olive, 0, -.6, .5, g);
      for (const sx of [-1, 1]) { const pd = mesh(cyl(.55, .55, 3.4, 8), dark, sx * 4, -1.2, .8, g); pd.rotation.x = Math.PI / 2; }
      mesh(cyl(.3, .3, 1.6, 6), dark, 0, 3.2, 0, g); const rot = new THREE.Group(); rot.position.y = 4.1; g.add(rot);
      const disc = mesh(new THREE.CircleGeometry(12, 28), new THREE.MeshBasicMaterial({ color: 0x20262a, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, rot); disc.rotation.x = -Math.PI / 2; disc.castShadow = false;
      for (let k = 0; k < 4; k++) { const bl = mesh(box(.5, .08, 12), dark, 0, 0, 0, rot); bl.geometry.translate(0, 0, 6); bl.rotation.y = k * Math.PI / 2; bl.castShadow = false; }
      g.userData.rotor = rot; g.userData.air = true; return g;
    }
    if (tt.guidance === 'drone') { mesh(box(2.2, 1.4, 1.6), olive, 0, .7, 0, g); mesh(cyl(.05, .05, 5, 5), dark, .8, 3, 0, g); const s = mesh(cyl(.5, .6, 2.6, 8), olive, -1.8, 1.3, .4, g); mesh(new THREE.SphereGeometry(.55, 8, 6), M(0x54463a, .9), -1.8, 3, .4, g); s.userData.k = 1; return g; }
    for (const a of [0, 2.1, 4.2]) { const lg = mesh(cyl(.09, .09, 3, 5), dark, Math.cos(a) * .9, 1.3, Math.sin(a) * .9, g); lg.rotation.z = Math.cos(a) * .55; lg.rotation.x = -Math.sin(a) * .55; }
    const tube = mesh(cyl(.5, .5, 5, 10), olive, 0, 2.9, 0, g); tube.rotation.x = Math.PI / 2; mesh(box(.8, .9, 1.2), dark, .9, 3.1, -.4, g);
    for (const sx of [-1.9, 2.1]) { const s = mesh(cyl(.6, .75, 2.2, 8), olive, sx, 1.1, -1.2, g); s.rotation.x = .5; mesh(new THREE.SphereGeometry(.55, 8, 6), M(0x4a4f3c, .9), sx, 2.5, -.4, g); }
    const berm = mesh(new THREE.SphereGeometry(1, 12, 8), M(0x6b5a40, 1), 0, -.2, 2.6, g); berm.scale.set(5.5, 1.4, 2.2); return g;
  }
  function lumpy(seed, ws, hs, amt) { const g = new THREE.SphereGeometry(1, ws, hs), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (fbm(x * 1.9 + seed, y * 1.9 + z * 1.4, 3) - .5) * amt; p.setXYZ(i, x * k, y * k, z * k); } g.computeVertexNormals(); return g; }
  function deco(terrain, seed, clear) {
    obst = []; let s = seed * 7919 + 13; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, g = new THREE.Group(), o = new THREE.Object3D(), c = new THREE.Color();
    const free = (x, z) => { const r = Math.hypot(x, z); if (r < 52) return false; const b = Math.atan2(x, -z) / DEG; for (const cb of clear) { const d = Math.abs(((b - cb.brg + 540) % 360) - 180); if (d < 5 + 600 / r && r < cb.r + 30) return false; } return true; };
    const urban = terrain === 'urban', nT = urban ? 26 : terrain === 'mixed' ? 230 : 34, nB = urban ? 120 : 0, nR = urban ? 0 : terrain === 'mixed' ? 40 : 90;
    const trunk = new THREE.InstancedMesh(cyl(.5, .7, 1, 6), M(0x3b2e22, 1), nT), f1 = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9), M(0xffffff, .95), nT * 3), f2 = new THREE.InstancedMesh(lumpy(seed, 12, 9, .7), M(0xffffff, .95), nT * 3);
    let it = 0, i2 = 0, i1 = 0;
    for (let i = 0; i < nT * 3 && it < nT; i++) { const r = 60 + Math.pow(rnd(), .8) * 620, a = rnd() * 6.283, x = r * Math.sin(a), z = -r * Math.cos(a); if (!free(x, z)) continue; if (terrain === 'mixed' && fbm(x * .006 + 3, z * .006, 2) < .46) continue;
      obst.push({ x, z, r: 11 }); const y = gh(x, z), h = 15 + rnd() * 13, conifer = rnd() < (terrain === 'mixed' ? .6 : .25);
      o.position.set(x, y + h * .2, z); o.scale.set(1, h * .4, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); trunk.setMatrixAt(it++, o.matrix);
      c.setHSL(.22 + rnd() * .08, .3 + rnd() * .14, .2 + rnd() * .09).convertSRGBToLinear();
      if (conifer) for (let k = 0; k < 3; k++) { o.position.set(x, y + h * (.42 + k * .22), z); o.scale.set(h * (.3 - k * .07), h * .42, h * (.3 - k * .07)); o.rotation.set(0, rnd() * 6, 0); o.updateMatrix(); f1.setMatrixAt(i1, o.matrix); f1.setColorAt(i1++, c); }
      else for (let k = 0; k < 3; k++) { const s = k ? .22 + rnd() * .08 : .34; o.position.set(x + (k ? (rnd() - .5) * h * .34 : 0), y + h * (k ? .52 + rnd() * .2 : .7), z + (k ? (rnd() - .5) * h * .34 : 0)); o.scale.set(h * s, h * s * .86, h * s); o.rotation.set(rnd(), rnd() * 6, rnd()); o.updateMatrix(); f2.setMatrixAt(i2, o.matrix); f2.setColorAt(i2++, c); } }
    trunk.count = it; f1.count = i1; f2.count = i2; for (const m of [trunk, f1, f2]) { m.castShadow = true; m.receiveShadow = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; g.add(m); }
    if (nR) { const rock = new THREE.InstancedMesh(lumpy(seed + 5, 9, 7, .8), M(0xffffff, 1), nR); let k = 0;
      for (let i = 0; i < nR * 2 && k < nR; i++) { const r = 34 + rnd() * 520, a = rnd() * 6.283, x = r * Math.sin(a), z = -r * Math.cos(a), bush = rnd() < .65, sc = bush ? 1.6 + rnd() * 2.4 : .8 + rnd() * 2.2; if (r < 40) continue; o.position.set(x, gh(x, z) + sc * .35, z); o.scale.set(sc * (1 + rnd() * .6), sc * (bush ? .8 : .6), sc); o.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3); o.updateMatrix(); rock.setMatrixAt(k, o.matrix); if (bush) c.setHSL(.2 + rnd() * .07, .3, .26 + rnd() * .1); else c.setHSL(.09, .1, .42 + rnd() * .15); rock.setColorAt(k++, c.convertSRGBToLinear()); }
      rock.count = k; rock.castShadow = true; rock.receiveShadow = true; rock.instanceColor.needsUpdate = true; g.add(rock); }
    if (nB) { const ft = facadeTex(), bl = new THREE.InstancedMesh(box(1, 1, 1), new THREE.MeshStandardMaterial({ map: ft, roughness: .9 }), nB); let k = 0;
      for (let i = 0; i < nB * 4 && k < nB; i++) { const gx = Math.round((rnd() * 2 - 1) * 14), gz = Math.round((rnd() * 2 - 1) * 14), x = gx * 44 + (rnd() - .5) * 8, z = gz * 44 + (rnd() - .5) * 8; if (!free(x, z) || Math.hypot(x, z) > 640) continue; const w = 20 + rnd() * 14, d = 20 + rnd() * 14, h = 14 + rnd() * rnd() * 46; obst.push({ x, z, r: Math.max(w, d) * .75 }); o.position.set(x, gh(x, z) + h / 2 - 1, z); o.scale.set(w, h, d); o.rotation.set(0, 0, 0); o.updateMatrix(); bl.setMatrixAt(k, o.matrix); c.setHSL(.08 + rnd() * .04, .08 + rnd() * .1, .5 + rnd() * .25); bl.setColorAt(k++, c.convertSRGBToLinear()); }
      bl.count = k; bl.castShadow = true; bl.receiveShadow = true; bl.instanceColor.needsUpdate = true; g.add(bl); }
    return g;
  }
