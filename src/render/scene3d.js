// The battlefield renderer: ground, scenery, sky and light, the vehicle and the enemy, drawn from a World and a Battle.
import * as THREE from 'three';
import { SkyDome } from './sky.js';
import { GroundCover } from './groundcover.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTerrain } from './terrain.js';
import { buildTrees, buildBuildings } from './scenery.js';
import { Particles, GroundMarks } from './fx.js';
import { ENV, Precipitation, GradeShader } from './env.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AirPass, depthWorks } from './post.js';

// Light and air for each condition: sun height and bearing (degrees), colours, fog, exposure, the colour grade, and the sky.
// fogI and the second number in each sky colour are brightness: the picture is worked out in real light levels and then exposed
// like a camera, so a bright sky needs values above 1. glow = how strongly the haze lights up towards the sun.
// How bright things are against each other is kept near the real thing: on a clear day the sun puts four times as much light on the
// ground as the whole sky does (sunI against the sky's own brightness, which also lights everything through the reflection picture,
// envI), so shade is properly dark and blue, and the picture is exposed for the sunlit ground, which leaves the sky a deeper blue.
// amb = the average brightness of that sky (used to light smoke); gain = how much brighter glowing things (flame, tracers, the
// guidance lines) are drawn so they show as before under the lower exposure. Assumed, by eye against photographs: all of these.
// Under full cloud (overcast, rain) there is no sunlit ground to expose for: the camera opens up for ground in diffuse light, as an
// automatic camera does, so a rainy picture reads grey and wet rather than near black (rain exposure 1.35, overcast 0.88, by eye, 15 Nov).
// Night is exposed like a sight or a dark-adapted eye at full moon (1.6, was 1.3): fields and tree lines read, the sky stays deep blue.
// shaft = colour and strength of the light shafts round a sun that is in the picture (High and Ultra; none under full cloud or at night).
export const CONDITIONS = {
  day: { name: 'Day', shaft: ['#ffe6c0', 0.3], el: 36, az: 150, sun: '#fff0d8', sunI: 12, sky: '#b4cbe8', ground: '#6b644a', hemiI: 0.5, fog: '#bccbdb', fogI: 1.25, fogD: 0.00015, glow: ['#ffe9c4', 0.35], cloudShade: 0.3, exposure: 0.36, tint: '#fff8ee', shadow: '#eef3ff', sat: 1.06, contrast: 1.1, envI: 1, amb: 0.6, gain: 1.67,
    sky: { zenith: ['#2f62b4', 1.7], horizon: ['#a8c6e6', 1.7], disc: ['#fff3dc', 70], halo: ['#ffe8c6', 0.55], cloudLit: ['#ffffff', 2.3], cloudDark: ['#8d9db4', 1.15], cover: 0.3, soft: 0.13, cirrus: 0.16, hazeTop: 9 } },
  dawn: { name: 'Dawn', shaft: ['#ffa25c', 0.6], el: 7, az: 95, sun: '#ffbe8c', sunI: 6, sky: '#8ea2cc', ground: '#4a4038', hemiI: 1.1, fog: '#c9a48e', fogI: 0.8, fogD: 0.00026, glow: ['#ff9440', 1.0], cloudShade: 0.2, exposure: 0.68, tint: '#fff0e0', shadow: '#bccafc', sat: 0.92, contrast: 1.12, envI: 1, amb: 0.5, gain: 1.15,
    sky: { zenith: ['#3a5c9e', 1.25], horizon: ['#e9c0a4', 1.2], disc: ['#ffd9a8', 60], discSize: 0.0003, halo: ['#ff9648', 0.8], cloudLit: ['#ffc4a0', 1.7], cloudDark: ['#5d5e82', 0.8], cover: 0.36, soft: 0.2, cirrus: 0.4, hazeTop: 10 } },
  dusk: { name: 'Dusk', shaft: ['#ff9050', 0.6], el: 5, az: 265, sun: '#ffb27c', sunI: 6, sky: '#8792c2', ground: '#463c37', hemiI: 1.1, fog: '#bf9482', fogI: 0.75, fogD: 0.00028, glow: ['#ff7e36', 1.05], cloudShade: 0.2, exposure: 0.7, tint: '#ffeedd', shadow: '#b6c4fc', sat: 0.88, contrast: 1.12, envI: 1, amb: 0.5, gain: 1.17,
    sky: { zenith: ['#34508c', 1.15], horizon: ['#e6a888', 1.15], disc: ['#ffc890', 55], discSize: 0.0003, halo: ['#ff8040', 0.85], cloudLit: ['#ffa684', 1.6], cloudDark: ['#504e74', 0.75], cover: 0.4, soft: 0.2, cirrus: 0.4, hazeTop: 10 } },
  overcast: { name: 'Overcast', el: 50, az: 180, sun: '#e3e7ec', sunI: 1.6, sky: '#b2bbc4', ground: '#56564e', hemiI: 1, fog: '#aab3bb', fogI: 0.95, fogD: 0.00038, glow: ['#dfe6ee', 0.08], wind: 1.4, exposure: 0.88, tint: '#f2f6fa', shadow: '#eaf0f6', sat: 0.88, contrast: 1.08, envI: 1, amb: 0.55, gain: 1,
    sky: { zenith: ['#9aa3ac', 1.0], horizon: ['#b4bcc4', 1.0], disc: ['#ffffff', 0], halo: ['#e6ebf0', 0.25], cloudLit: ['#ccd2d8', 1.3], cloudDark: ['#8d949c', 1.0], cover: 1.0, soft: 0.6, hazeTop: 6 } },
  rain: { name: 'Rain and mud', el: 48, az: 190, sun: '#c9d0d8', sunI: 1.8, sky: '#939ca4', ground: '#474944', hemiI: 1.1, fog: '#8b949b', fogI: 0.85, fogD: 0.0011, glow: ['#c9d2da', 0.05], wind: 2.0, exposure: 1.35, tint: '#ecf2f6', shadow: '#e2ebf0', sat: 0.76, contrast: 1.08, wet: 1, precip: 'rain', envI: 1.5, amb: 0.4, gain: 1,
    sky: { zenith: ['#737b83', 0.9], horizon: ['#8b949b', 0.9], disc: ['#ffffff', 0], halo: ['#c9d2da', 0.1], cloudLit: ['#a2aab2', 1.05], cloudDark: ['#626a73', 0.9], cover: 1.0, soft: 0.5, speed: 0.008, hazeTop: 3.5 } },
  fog: { name: 'Fog', shaft: ['#fff0d6', 0.45], el: 30, az: 140, sun: '#ece6d8', sunI: 1.6, sky: '#babebd', ground: '#5a5a54', hemiI: 1, fog: '#b4b8b7', fogI: 0.95, fogD: 0.0042, glow: ['#fff2d8', 0.2], wind: 0.4, exposure: 0.85, tint: '#f6f6f2', shadow: '#eef0f0', sat: 0.7, contrast: 1.0, wet: 0.35, envI: 1.2, amb: 0.55, gain: 1,
    sky: { zenith: ['#b4b8b7', 1.0], horizon: ['#b4b8b7', 0.95], disc: ['#fff4e0', 1.2], discSize: 0.0006, halo: ['#fff2d8', 0.3], cloudLit: ['#c2c6c5', 1.0], cloudDark: ['#a4a8a7', 0.95], cover: 1.0, soft: 0.7, hazeTop: 0.9 } },
  snow: { name: 'Snow', el: 22, az: 165, sun: '#eef2f8', sunI: 2.4, sky: '#c6d0dc', ground: '#aab2bd', hemiI: 0.9, fog: '#cdd4dc', fogI: 1.0, fogD: 0.0009, glow: ['#eef2f8', 0.1], exposure: 0.6, tint: '#f2f7ff', shadow: '#dbe6ff', sat: 0.82, contrast: 1.06, snow: 1, precip: 'snow', envI: 1.3, amb: 0.78, gain: 1,
    sky: { zenith: ['#b3bcc7', 1.05], horizon: ['#cdd4dc', 1.0], disc: ['#ffffff', 0], halo: ['#eef2f8', 0.2], cloudLit: ['#d8dee6', 1.2], cloudDark: ['#a9b1bc', 1.05], cover: 1.0, soft: 0.6, hazeTop: 3 } },
  night: { name: 'Night', el: 42, az: 215, sun: '#9db4e6', sunI: 1.5, sky: '#7088bd', ground: '#1a202c', hemiI: 0.6, fog: '#101828', fogI: 1.0, fogD: 0.0003, glow: ['#5a70a8', 0.03], exposure: 1.6, tint: '#e2eaff', shadow: '#c2d0ff', sat: 0.5, contrast: 1.02, grain: 0.07, night: true, envI: 1.5, amb: 0.05, gain: 1,
    sky: { zenith: ['#16264a', 1.3], horizon: ['#22355c', 1.2], disc: ['#eaf0ff', 4.0], discSize: 0.00035, halo: ['#7f98d0', 0.12], cloudLit: ['#4a5c84', 0.8], cloudDark: ['#141c30', 0.8], cover: 0.3, soft: 0.25, stars: 7, hazeTop: 8 } },
};

// Graphics settings. pr = most device pixels drawn per screen pixel; samples = edge smoothing; shadow = shadow map size;
// near/mid/far = distances (m) at which trees drop to simpler shapes and then vanish. ground = close-up ground surfaces (0 none,
// 1 colour only, 2 with relief); cover = grass and crop stalks near the camera (0 none to 3 thick, 4 thick and further out); skyOct = fineness of the clouds.
// air = contact shade and light shafts worked out from the picture's depth (0 off, 1 on, 2 finer; post.js). Minimum to Medium and
// Auto cost what they did before these were added: none of the new passes runs there.
export const QUALITY = {
  min: { name: 'Minimum', pr: 0.75, samples: 0, shadow: 512, shadowEvery: 4, bloom: false, near: 0, mid: 120, far: 450, precip: 1500, plain: true, ground: 0, cover: 0, skyOct: 3 },   // no film pipeline, no shadows: for weak or software graphics
  low: { name: 'Low', pr: 1, samples: 0, shadow: 1024, shadowEvery: 3, bloom: false, near: 50, mid: 220, far: 650, precip: 3000, ground: 1, cover: 1, skyOct: 4 },
  medium: { name: 'Medium', pr: 1, samples: 2, shadow: 2048, shadowEvery: 2, bloom: true, near: 90, mid: 330, far: 950, precip: 6000, ground: 2, cover: 2, skyOct: 5 },
  high: { name: 'High', pr: 1.5, samples: 4, shadow: 4096, shadowEvery: 1, bloom: true, near: 160, mid: 560, far: 1700, precip: 9000, ground: 2, cover: 3, skyOct: 5, air: 1 },
  ultra: { name: 'Ultra', pr: 2, samples: 4, shadow: 4096, shadowEvery: 1, bloom: true, near: 240, mid: 800, far: 2400, precip: 9000, ground: 2, cover: 4, skyOct: 6, air: 2, ss: 1.5 },   // for a strong graphics card: more pixels, trees kept in full shape further out, finer shade
  auto: { name: 'Auto', auto: true, pr: 1.5, samples: 2, shadow: 2048, shadowEvery: 2, bloom: true, near: 110, mid: 380, far: 1100, precip: 6000, ground: 2, cover: 2, skyOct: 5 },
};
export class Scene3D {
  constructor(canvas, world, opt = {}) {
    this.world = world; this.canvas = canvas;
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });   // smoothing is done in the film pipeline's own target, not here
    this.pr = 1; R.setPixelRatio(1); R.shadowMap.autoUpdate = false; this.frameN = 0; this.emaMs = 16; this.prHold = 0; R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.info.autoReset = false;
    /* a shader that fails to build on this machine's graphics card is said on screen, not left as a model that silently is not drawn */
    R.debug.onShaderError = (gl, prog, vs, fs) => { const log = [gl.getProgramInfoLog(prog), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(0, 400); console.error('shader failed to build:', log); this.shaderErrs = (this.shaderErrs || 0) + 1; const c = typeof document !== 'undefined' && document.getElementById('errbar'); if (c) { c.hidden = false; c.textContent = `A drawing program failed to build on this graphics card (${this.shaderErrs}×). Please send this line to Claude: ${log}`; } };
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 30000);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.minDistance = 4; this.controls.maxDistance = 9000;
    // sky and light
    this.skyDome = new SkyDome(); this.sky = this.skyDome.mesh; sc.add(this.sky);
    this.sun = new THREE.DirectionalLight('#ffffff', 3); this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096); const sh = this.sun.shadow.camera; sh.left = sh.bottom = -260; sh.right = sh.top = 260; sh.near = 10; sh.far = 2600; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6; sc.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1); sc.add(this.hemi);
    sc.fog = new THREE.FogExp2('#ffffff', 0.0001);
    // ground and scenery
    this.cover = new GroundCover(); sc.add(this.cover.mesh);
    this.opt = opt; this.setWorld(world);
    this.units = new THREE.Group(); sc.add(this.units);
    this.fx = new Particles(12000); sc.add(this.fx.mesh);
    this.marks = new GroundMarks(); sc.add(this.marks.mesh);
    // a few lights to throw on the scene when something explodes: each flares and dies in a fraction of a second
    this.flares = [0, 1, 2].map(() => { const l = new THREE.PointLight('#ffc98a', 0, 220, 1.6); sc.add(l); return l; }); this.flareI = 0;
    // one steady, flickering light for the fire that burns nearest the camera (a wreck, a tree line): it reddens the ground, the hull and the smoke over it, mostly after dark
    this.fireLight = new THREE.PointLight('#ff8236', 0, 80, 1.8); sc.add(this.fireLight);
    this.precip = new Precipitation(); sc.add(this.precip.mesh);
    // film pipeline: scene -> glow on the brightest parts -> tone mapping -> grade, vignette and grain
    this.post = opt.post !== false;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: opt.samples == null ? 4 : opt.samples });
    this.composer = new EffectComposer(R, rt); this.composer.addPass(new RenderPass(sc, this.camera));
    /* contact shade and light shafts (post.js): only where the graphics level asks for them AND this card reads depth back correctly (tested once, here) */
    this.depthOK = opt.depth !== false && depthWorks(R, 4); this.air = new AirPass(this.camera); this.air.enabled = false; this.composer.addPass(this.air);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 1.0); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass()); this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.clock = 0; this.setQuality(opt.quality || 'auto');
    this.focus = new THREE.Vector3(0, world.h(0, 0), 0);
    this.setCondition(opt.condition || 'day');
    this.camera.position.set(-120, world.h(0, 0) + 70, 170); this.controls.target.copy(this.focus);
    this.resize();
  }
  // Graphics load. 'auto' holds the frame rate by trading resolution: it renders fewer pixels when frames run long and more when there is room.
  setQuality(key) {
    const Q = QUALITY[key] || QUALITY.auto; this.quality = QUALITY[key] ? key : 'auto'; this.Q = Q;
    const dpr = window.devicePixelRatio || 1; this.prMax = Q.ss ? Math.max(dpr, Math.min(Q.pr, dpr * Q.ss)) : Math.min(dpr, Q.pr);   /* ss: draw more pixels than the screen has and scale down (finer edges, calmer grass); applySize keeps the total under about 8.5 million */ this.prMin = Math.min(this.prMax, Q.auto ? 0.55 : this.prMax); this.pr = Q.auto ? Math.min(this.prMax, 1) : this.prMax;
    const wantDepth = !!Q.air && this.depthOK;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== Q.samples || !!rt.depthTexture !== wantDepth) { rt.samples = Q.samples; rt.dispose(); rt.depthTexture = wantDepth ? new THREE.DepthTexture(rt.width, rt.height) : null; rt.resolveDepthBuffer = wantDepth; }
    this.airOn = wantDepth; this.air.setLevel(Q.air || 0); this._air();
    if (this.sun.shadow.mapSize.x !== Q.shadow) { this._shHalf = 0; this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.bloom.enabled = Q.bloom; this.precip.mesh.geometry.setDrawRange(0, Q.precip * 2);
    this.post = !Q.plain || !!this.thermal; this.sun.castShadow = !Q.plain; this.renderer.shadowMap.needsUpdate = true;
    this._detail();
    this.applySize();
  }
  // match the ground surfaces, the clouds and the grass to the graphics setting (called when the setting or the world changes)
  _detail() {
    const Q = this.Q; if (!Q) return;
    if (this.terrain && this.terrain.setDetail) this.terrain.setDetail(Q.ground == null ? 2 : Q.ground);
    if (this.skyDome) this.skyDome.setOctaves(Q.skyOct || 5);
    if (this.grade) { this.grade.uniforms.sharp.value = Q.bloom ? 0.32 : 0; this.grade.uniforms.fringe.value = Q.bloom ? 0.006 : 0; }
    if (this.cover) this.cover.setLevel(Q.cover || 0);
  }
  // contact shade and light shafts: on at High and Ultra, never in the thermal picture; the strength of each comes from the condition
  setAir(on) { this.airUser = on !== false; this._air(); }   /* for a view that wants the plain picture (pass false); true gives it back */
  _air() { const C = CONDITIONS[this.condition] || CONDITIONS.day, on = !!this.airOn && !this.thermal && this.airUser !== false; this.air.enabled = on; this.air.ao = C.ao == null ? 0.8 : C.ao; this.air.shafts = C.shaft ? C.shaft[1] : 0; if (C.shaft) this.air.lay.uniforms.shaftCol.value.set(C.shaft[0]).multiplyScalar(C.shaft[1] > 0 ? 1 : 0); else this.air.lay.uniforms.shaftCol.value.setScalar(0); if (this.sunDir) this.air.sunDir.copy(this.sunDir); }
  // Thermal picture for the sights. mode 0 off, 1 white hot, -1 black hot. Warm things (crews, vehicles, missiles) are made to glow by how
  // warm their group says they are (userData.heat, 0 to 1; assumed values), the sky goes cold, and the picture is shown as brightness only.
  setThermal(mode) {
    mode = mode || 0; const was = this.thermal || 0; this.thermal = mode; this._air(); this.grade.uniforms.thermal.value = mode; this.post = !this.Q.plain || mode !== 0;
    if (!!mode !== !!was) { if (mode) { this._thSky = this.sky.visible; this._thBg = this.scene.background; this._thFog = this.scene.fog.color.clone(); this._thExp = this.renderer.toneMappingExposure; this.sky.visible = false; this.scene.background = new THREE.Color('#1c1f1d'); this.scene.fog.color.set('#3a3e3a'); this.renderer.toneMappingExposure = 0.5 / (this.gain || 1); this._thGlow = ENV.glow.value.clone(); ENV.glow.value.setScalar(0); this._thCloud = ENV.cloud.value; ENV.cloud.value = 0; }
      else { this.sky.visible = this._thSky; this.scene.background = this._thBg; this.scene.fog.color.copy(this._thFog); this.renderer.toneMappingExposure = this._thExp; ENV.glow.value.copy(this._thGlow); ENV.cloud.value = this._thCloud; } }
    this._heat(mode !== 0); this._heatAt = this.clock + 2;
  }
  _heat(on) { const walk = (o, heat) => { if (o.userData && o.userData.heat != null) heat = o.userData.heat; if (o.isMesh && o.material) for (const m of [].concat(o.material)) { if (!m || !m.emissive) continue; if (m.userData.e0 == null) { m.userData.e0 = m.emissive.getHex(); m.userData.ei0 = m.emissiveIntensity; } if (on) { m.emissive.setScalar(1); m.emissiveIntensity = heat * 3.2 * (this.gain || 1); } else { m.emissive.setHex(m.userData.e0); m.emissiveIntensity = m.userData.ei0; } } for (const c of o.children) walk(c, heat); }; walk(this.units, 0.5); }
  // which graphics chip the browser is actually using (a 'SwiftShader', 'llvmpipe' or 'Basic Render' answer means none: it is drawing on the processor)
  gpu() { if (this._gpu) return this._gpu; const gl = this.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); this._gpu = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); return this._gpu; }
  get software() { return /swiftshader|llvmpipe|basic render|software/i.test(this.gpu()); }
  applySize() { const w = this.canvas.clientWidth || 1280, h = this.canvas.clientHeight || 720; if (this.Q && this.Q.ss) this.pr = Math.max(Math.min(window.devicePixelRatio || 1, this.prMax), Math.min(this.prMax, Math.sqrt(8.5e6 / (w * h)))); this.renderer.setPixelRatio(this.pr); this.renderer.setSize(w, h, false); this.composer.setPixelRatio(this.pr); this.composer.setSize(w, h); if (this.grade) this.grade.uniforms.px.value.set(1 / Math.max(1, w * this.pr), 1 / Math.max(1, h * this.pr)); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // build (or rebuild) the ground and scenery for a world, freeing what was there before
  setWorld(world) {
    const sc = this.scene, t0 = performance.now(); this.world = world;
    if (this.terrain) { sc.remove(this.terrain.mesh); this.terrain.dispose(); }
    for (const o of [this.trees, this.buildings]) if (o) { sc.remove(o); if (o.userData.dispose) o.userData.dispose(); else o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) [].concat(m.material).forEach(x => x.dispose()); }); }
    this.terrain = buildTerrain(world, { clear: this.cover.uniforms.hkClear }); sc.add(this.terrain.mesh);
    this.trees = buildTrees(world, { perCell: this.opt.treesPerCell || 2 }); sc.add(this.trees);
    this.buildings = buildBuildings(world); sc.add(this.buildings);
    this.cover.setWorld(world, this.terrain);
    // scenery never moves: work out its placement once and skip the per-frame pass over its thousands of parts
    for (const o of [this.trees, this.buildings]) { o.updateMatrixWorld(true); o.updateMatrixWorld = () => { }; }
    this._detail();
    this.buildMs = Math.round(performance.now() - t0);
    if (this.focus) this.focus.set(0, world.h(0, 0), 0);
  }
  setCondition(key) {
    const C = CONDITIONS[key] || CONDITIONS.day; this.condition = key;
    const el = C.el * Math.PI / 180, az = C.az * Math.PI / 180, dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); this.sunDir = dir;
    ENV.sunDir.value.copy(dir); ENV.wind.value.set(0.94, C.wind == null ? 1 : C.wind, 0.34); ENV.cloud.value = C.cloudShade || 0; ENV.glow.value.set(C.glow[0]).multiplyScalar(C.glow[1]); this.skyDome.set(C.sky, C.fog); this.skyDome.uniforms.fogCol.value.multiplyScalar(C.fogI || 1);
    this.sun.color.set(C.sun); this.sun.intensity = C.sunI; this.hemi.color.set(C.sky); this.hemi.groundColor.set(C.ground); this.hemi.intensity = C.hemiI;
    this.scene.fog.color.set(C.fog).multiplyScalar(C.fogI || 1); this.scene.fog.density = C.fogD; this.renderer.toneMappingExposure = C.exposure;
    this.scene.background = null;
    ENV.snow.value = C.snow || 0; ENV.wet.value = C.wet || 0; if (this.precip) this.precip.set(C.precip || null);
    if (this.grade) { const g = this.grade.uniforms; g.tint.value.set(C.tint || '#ffffff'); g.shadowTint.value.set(C.shadow || '#ffffff'); g.sat.value = C.sat || 1; g.contrast.value = C.contrast || 1.06; g.grain.value = C.grain || 0.035; g.olive.value = C.olive == null ? 0.32 : C.olive; this.bloom.strength = C.night ? 0.7 : 0.3; this.bloom.threshold = C.night ? 0.55 : 1.0; }
    this.night = !!C.night;
    this._env(C, dir); this._shadowAxes(dir); this._air();
    this.bloom.threshold = C.night ? 0.55 : 1.32 / C.exposure;   /* only what is far brighter than sunlit ground glows: flame, flashes, tracers, the sun's disc */
    this.gain = C.gain || 1;
    if (this.fx) { const u2 = this.fx.mat.uniforms; u2.fogColor.value.set(C.fog); u2.fogDensity.value = C.fogD; const sk = new THREE.Color(C.sky), lum = 0.2126 * sk.r + 0.7152 * sk.g + 0.0722 * sk.b; u2.sunColor.value.set(C.sun).multiplyScalar(C.sunI / Math.PI * 0.75); u2.skyColor.value.copy(sk).multiplyScalar((C.amb == null ? 0.5 : C.amb) / Math.max(0.05, lum)); u2.gain.value = C.gain || 1; }   /* smoke and dust take the sun and the sky separately (fx.js): lit on one side, sky-coloured in shade */
  }
  // What shiny and wet things reflect, and the soft light from all round: a small picture of THIS sky (its colours, clouds and the glow
  // round the sun, without the disc itself, which the sun light already supplies) over ground of the condition's colour, blurred.
  // Made once per change of weather. Steel, glass, wet mud and puddles pick up the real sky instead of a plain blue-to-brown wash.
  _env(C, dir) {
    const es = new THREE.Scene(), u = this.skyDome.uniforms, disc = u.sunDisc.value.clone(), par = this.sky.parent, vis = this.sky.visible;
    const gcol = new THREE.Color(C.ground).multiplyScalar(C.sunI * Math.max(0.05, dir.y) / Math.PI + (C.amb == null ? 0.5 : C.amb));   /* the ground as the sun and sky light it: what the underside of things sees */
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 24), new THREE.MeshBasicMaterial({ color: gcol, fog: false })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6;
    u.sunDisc.value.setScalar(0); this.sky.visible = true; es.add(this.sky, ground);
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer); if (this.envRT) this.envRT.dispose();
    const keep = this.renderer.getRenderTarget(); this.envRT = this.pmrem.fromScene(es, 0.035, 0.1, 200); this.renderer.setRenderTarget(keep);
    u.sunDisc.value.copy(disc); this.sky.visible = vis; if (par) par.add(this.sky); ground.geometry.dispose(); ground.material.dispose();
    this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = C.envI == null ? 1 : C.envI;
  }
  // the two directions across the sun's rays, used to keep the shadow picture locked to the ground as the view moves
  _shadowAxes(dir) { const r = this._shR || (this._shR = new THREE.Vector3()), up = this._shU || (this._shU = new THREE.Vector3()); r.set(0, 1, 0).cross(dir).normalize(); up.copy(dir).cross(r).normalize(); this._shHalf = 0; }
  // light the surroundings for an instant (explosions, launches), and leave a scorch mark if on the ground
  blast(p, k = 1, scorch = true) { const l = this.flares[this.flareI++ % this.flares.length]; l.position.copy(p); l.position.y += 2; l.intensity = 900 * k * (this.night ? 1 : 0.5) * (this.gain || 1); l.userData.decay = 7; if (scorch) this.marks.add(p.x, p.z, 2.2 * k, (x, z) => this.world.h(x, -z)); }
  resize() { this.applySize(); }
  // world east/north to scene position on the ground
  at(e, n, up = 0, out = new THREE.Vector3()) { return out.set(e, this.world.h(e, n) + up, -n); }
  setFocus(e, n) { this.at(e, n, 2, this.focus); }
  render(dt = 0.016) {
    this.fx.update(dt, this.wind); for (const l of this.flares) if (l.intensity > 0) { l.intensity *= Math.exp(-dt * (l.userData.decay || 7)); if (l.intensity < 1) l.intensity = 0; } if (this.trees.userData.update) this.trees.userData.update(this.camera.position, this.Q.near, this.Q.mid, this.Q.far); this.fx.mat.uniforms.scale.value = this.renderer.domElement.height * 0.9; this.cover.track(this.focus.x, this.focus.z); this.cover.update(this.camera, this.units);
    { const cp = this.camera.position, f = this.thermal ? null : this.fx.nearestFire(cp.x, cp.y, cp.z), L = this.fireLight;
      if (f) { const t = this.fx.time, fl = 0.78 + 0.22 * Math.sin(t * 17.3 + f.x) * Math.sin(t * 6.1 + f.z); L.position.set(f.x, f.y + 1.2, f.z); L.intensity = (this.night ? 900 : 110 * (this.gain || 1)) * f.k * fl; } else L.intensity = 0; }   /* flicker from the effects clock: the same at any frame rate, still when paused */
    this.clock += dt; ENV.time.value = this.clock; this.renderer.info.reset(); if (this.thermal && this.clock > (this._heatAt || 0)) { this._heat(true); this._heatAt = this.clock + 2; }   /* models that arrived since: make them glow too */
    // shadows are redrawn every frame on the highest setting, every second frame otherwise: the eye does not see the difference at walking pace
    this.frameN++; if (this.Q.shadowEvery <= 1 || this.frameN % this.Q.shadowEvery === 0 || !this._shHalf) { this._fitShadow(); this.renderer.shadowMap.needsUpdate = true; }
    // hold the frame rate by resolution (auto only). rawMs is the true time since the last frame.
    if (this.Q.auto && this.rawMs) { this.emaMs += (Math.min(this.rawMs, 100) - this.emaMs) * 0.08; if (--this.prHold < 0) { let pr = this.pr; if (this.emaMs > 21 && pr > this.prMin) pr = Math.max(this.prMin, pr * (this.emaMs > 30 ? 0.82 : 0.92)); else if (this.emaMs < 17.2 && pr < this.prMax) pr = Math.min(this.prMax, pr * 1.04); if (Math.abs(pr - this.pr) > 0.004) { this.pr = pr; this.applySize(); this.prHold = 45; } else this.prHold = 20; } }
    if (this.post) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  // The shadow picture follows the point of interest and is drawn only as wide as the view needs: a few centimetres a pixel when the
  // camera is close to the vehicle (so the turret shades the hull and the tracks shade the ground under them), wider when it pulls back.
  // It moves in whole pixels of itself, and only on the frames it is redrawn, so shadows do not crawl. The offsets that stop a surface
  // shading itself are sized from the pixel (they used to be about a metre, which lifted every shadow off the thing that cast it).
  _fitShadow() {
    const sh = this.sun.shadow, cam = sh.camera, d = this.camera.position.distanceTo(this.focus), S0 = 60;
    let half = Math.min(260, Math.max(S0, d * 1.5 + 22)); half = Math.min(260, S0 * Math.pow(1.2, Math.ceil(Math.log(half / S0) / Math.log(1.2) - 1e-6)));
    const texel = 2 * half / sh.mapSize.x, back = Math.max(600, half * 1.1 / Math.max(0.08, this.sunDir.y));
    if (half !== this._shHalf || back !== this._shBack) { this._shHalf = half; this._shBack = back; cam.left = cam.bottom = -half; cam.right = cam.top = half; cam.near = 1; cam.far = back * 2; cam.updateProjectionMatrix(); sh.normalBias = texel * 2.2; sh.bias = -texel * 1.2 / (cam.far - cam.near); }
    const c = this._shC || (this._shC = new THREE.Vector3()), f = this.focus, a = Math.round(f.dot(this._shR) / texel) * texel, b = Math.round(f.dot(this._shU) / texel) * texel;
    c.copy(this._shR).multiplyScalar(a).addScaledVector(this._shU, b).addScaledVector(this.sunDir, f.dot(this.sunDir));
    this.sun.target.position.copy(c); this.sun.position.copy(c).addScaledVector(this.sunDir, back);
  }
  stats() { const i = this.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, scale: this.pr, quality: this.quality, trees: this.trees.userData.count, buildings: this.world.buildings.length, buildMs: this.buildMs }; }
}
