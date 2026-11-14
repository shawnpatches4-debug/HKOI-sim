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

// Light and air for each condition: sun height and bearing (degrees), colours, fog, exposure, the colour grade, and the sky.
// fogI and the second number in each sky colour are brightness: the picture is worked out in real light levels and then exposed
// like a camera, so a bright sky needs values above 1. glow = how strongly the haze lights up towards the sun.
export const CONDITIONS = {
  day: { name: 'Day', el: 36, az: 150, sun: '#fff0d8', sunI: 3.4, sky: '#b4cbe8', ground: '#6b644a', hemiI: 0.85, fog: '#bccbdb', fogI: 1.25, fogD: 0.00015, glow: ['#ffe9c4', 0.35], cloudShade: 0.3, exposure: 0.6, tint: '#fff8ee', shadow: '#eef3ff', sat: 1.06, contrast: 1.1, envI: 0.9,
    sky: { zenith: ['#2f62b4', 1.7], horizon: ['#a8c6e6', 1.7], disc: ['#fff3dc', 70], halo: ['#ffe8c6', 0.55], cloudLit: ['#ffffff', 2.3], cloudDark: ['#8d9db4', 1.15], cover: 0.3, soft: 0.13, cirrus: 0.16, hazeTop: 9 } },
  dawn: { name: 'Dawn', el: 7, az: 95, sun: '#ff9c58', sunI: 3.6, sky: '#8ea2cc', ground: '#4a4038', hemiI: 0.6, fog: '#c9a48e', fogI: 0.8, fogD: 0.00026, glow: ['#ff9440', 1.6], cloudShade: 0.2, exposure: 0.78, tint: '#ffe6cc', shadow: '#d6def8', sat: 1.08, contrast: 1.12, envI: 0.75,
    sky: { zenith: ['#35548f', 0.9], horizon: ['#f2b98c', 1.25], disc: ['#ffd9a8', 60], halo: ['#ff9648', 1.5], cloudLit: ['#ffbd92', 1.7], cloudDark: ['#59587a', 0.75], cover: 0.45, soft: 0.25, cirrus: 0.7, hazeTop: 7 } },
  dusk: { name: 'Dusk', el: 5, az: 265, sun: '#ff8748', sunI: 3.4, sky: '#8792c2', ground: '#463c37', hemiI: 0.6, fog: '#bf9482', fogI: 0.75, fogD: 0.00028, glow: ['#ff7e36', 1.7], cloudShade: 0.2, exposure: 0.82, tint: '#ffdfc6', shadow: '#d0d4f6', sat: 1.08, contrast: 1.12, envI: 0.75,
    sky: { zenith: ['#30477f', 0.85], horizon: ['#ee9f78', 1.2], disc: ['#ffc890', 55], halo: ['#ff8040', 1.6], cloudLit: ['#ff9f7c', 1.6], cloudDark: ['#4c4a6e', 0.7], cover: 0.5, soft: 0.25, cirrus: 0.7, hazeTop: 7 } },
  overcast: { name: 'Overcast', el: 50, az: 180, sun: '#e3e7ec', sunI: 1.0, sky: '#b2bbc4', ground: '#56564e', hemiI: 1.35, fog: '#aab3bb', fogI: 0.95, fogD: 0.00038, glow: ['#dfe6ee', 0.08], wind: 1.4, exposure: 0.62, tint: '#f2f6fa', shadow: '#eaf0f6', sat: 0.88, contrast: 1.08, envI: 1.0,
    sky: { zenith: ['#9aa3ac', 1.0], horizon: ['#b4bcc4', 1.0], disc: ['#ffffff', 0], halo: ['#e6ebf0', 0.25], cloudLit: ['#c9d0d7', 1.25], cloudDark: ['#727a84', 0.9], cover: 1.0, soft: 0.6, hazeTop: 6 } },
  rain: { name: 'Rain and mud', el: 48, az: 190, sun: '#c9d0d8', sunI: 0.8, sky: '#939ca4', ground: '#474944', hemiI: 1.5, fog: '#8b949b', fogI: 0.85, fogD: 0.0011, glow: ['#c9d2da', 0.05], wind: 2.0, exposure: 0.82, tint: '#ecf2f6', shadow: '#e2ebf0', sat: 0.76, contrast: 1.08, wet: 1, precip: 'rain', envI: 0.9,
    sky: { zenith: ['#737b83', 0.9], horizon: ['#8b949b', 0.9], disc: ['#ffffff', 0], halo: ['#c9d2da', 0.1], cloudLit: ['#9da5ad', 1.0], cloudDark: ['#4f565e', 0.85], cover: 1.0, soft: 0.5, speed: 0.008, hazeTop: 3.5 } },
  fog: { name: 'Fog', el: 30, az: 140, sun: '#ece6d8', sunI: 0.9, sky: '#babebd', ground: '#5a5a54', hemiI: 1.2, fog: '#b4b8b7', fogI: 0.95, fogD: 0.0042, glow: ['#fff2d8', 0.2], wind: 0.4, exposure: 0.7, tint: '#f6f6f2', shadow: '#eef0f0', sat: 0.7, contrast: 1.0, wet: 0.35, envI: 0.9,
    sky: { zenith: ['#b4b8b7', 1.0], horizon: ['#b4b8b7', 0.95], disc: ['#fff4e0', 1.2], discSize: 0.0006, halo: ['#fff2d8', 0.3], cloudLit: ['#c2c6c5', 1.0], cloudDark: ['#a4a8a7', 0.95], cover: 1.0, soft: 0.7, hazeTop: 0.9 } },
  snow: { name: 'Snow', el: 22, az: 165, sun: '#eef2f8', sunI: 1.4, sky: '#c6d0dc', ground: '#aab2bd', hemiI: 1.25, fog: '#cdd4dc', fogI: 1.0, fogD: 0.0009, glow: ['#eef2f8', 0.1], exposure: 0.56, tint: '#f2f7ff', shadow: '#dbe6ff', sat: 0.82, contrast: 1.06, snow: 1, precip: 'snow', envI: 1.0,
    sky: { zenith: ['#b3bcc7', 1.05], horizon: ['#cdd4dc', 1.0], disc: ['#ffffff', 0], halo: ['#eef2f8', 0.2], cloudLit: ['#d6dce4', 1.15], cloudDark: ['#9099a5', 0.95], cover: 1.0, soft: 0.6, hazeTop: 3 } },
  night: { name: 'Night', el: 42, az: 215, sun: '#9db4e6', sunI: 1.5, sky: '#7088bd', ground: '#1a202c', hemiI: 0.7, fog: '#0a0e18', fogI: 1.0, fogD: 0.0003, glow: ['#5a70a8', 0.03], exposure: 1.3, tint: '#e2eaff', shadow: '#c2d0ff', sat: 0.5, contrast: 1.02, grain: 0.07, night: true, envI: 0.5,
    sky: { zenith: ['#0b1730', 0.5], horizon: ['#15233f', 0.45], disc: ['#eaf0ff', 3.0], discSize: 0.00035, halo: ['#7f98d0', 0.1], cloudLit: ['#3b4c70', 0.4], cloudDark: ['#0a0f1c', 0.4], cover: 0.32, soft: 0.25, stars: 2.2, hazeTop: 8 } },
};

// Graphics settings. pr = most device pixels drawn per screen pixel; samples = edge smoothing; shadow = shadow map size;
// near/mid/far = distances (m) at which trees drop to simpler shapes and then vanish. ground = close-up ground surfaces (0 none,
// 1 colour only, 2 with relief); cover = grass and crop stalks near the camera (0 none to 3 thick); skyOct = fineness of the clouds.
export const QUALITY = {
  min: { name: 'Minimum', pr: 0.75, samples: 0, shadow: 512, shadowEvery: 4, bloom: false, near: 0, mid: 120, far: 450, precip: 1500, plain: true, ground: 0, cover: 0, skyOct: 3 },   // no film pipeline, no shadows: for weak or software graphics
  low: { name: 'Low', pr: 1, samples: 0, shadow: 1024, shadowEvery: 3, bloom: false, near: 50, mid: 220, far: 650, precip: 3000, ground: 1, cover: 1, skyOct: 4 },
  medium: { name: 'Medium', pr: 1, samples: 2, shadow: 2048, shadowEvery: 2, bloom: true, near: 90, mid: 330, far: 950, precip: 6000, ground: 2, cover: 2, skyOct: 5 },
  high: { name: 'High', pr: 1.5, samples: 4, shadow: 4096, shadowEvery: 1, bloom: true, near: 160, mid: 560, far: 1700, precip: 9000, ground: 2, cover: 3, skyOct: 5 },
  auto: { name: 'Auto', auto: true, pr: 1.5, samples: 2, shadow: 2048, shadowEvery: 2, bloom: true, near: 110, mid: 380, far: 1100, precip: 6000, ground: 2, cover: 2, skyOct: 5 },
};
export class Scene3D {
  constructor(canvas, world, opt = {}) {
    this.world = world; this.canvas = canvas;
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });   // smoothing is done in the film pipeline's own target, not here
    this.pr = 1; R.setPixelRatio(1); R.shadowMap.autoUpdate = false; this.frameN = 0; this.emaMs = 16; this.prHold = 0; R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.info.autoReset = false;
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
    this.precip = new Precipitation(); sc.add(this.precip.mesh);
    // film pipeline: scene -> glow on the brightest parts -> tone mapping -> grade, vignette and grain
    this.post = opt.post !== false;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: opt.samples == null ? 4 : opt.samples });
    this.composer = new EffectComposer(R, rt); this.composer.addPass(new RenderPass(sc, this.camera));
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
    const dpr = window.devicePixelRatio || 1; this.prMax = Math.min(dpr, Q.pr); this.prMin = Math.min(this.prMax, Q.auto ? 0.55 : this.prMax); this.pr = Q.auto ? Math.min(this.prMax, 1) : this.prMax;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== Q.samples) { rt.samples = Q.samples; rt.dispose(); }
    if (this.sun.shadow.mapSize.x !== Q.shadow) { this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
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
  // Thermal picture for the sights. mode 0 off, 1 white hot, -1 black hot. Warm things (crews, vehicles, missiles) are made to glow by how
  // warm their group says they are (userData.heat, 0 to 1; assumed values), the sky goes cold, and the picture is shown as brightness only.
  setThermal(mode) {
    mode = mode || 0; const was = this.thermal || 0; this.thermal = mode; this.grade.uniforms.thermal.value = mode; this.post = !this.Q.plain || mode !== 0;
    if (!!mode !== !!was) { if (mode) { this._thSky = this.sky.visible; this._thBg = this.scene.background; this._thFog = this.scene.fog.color.clone(); this._thExp = this.renderer.toneMappingExposure; this.sky.visible = false; this.scene.background = new THREE.Color('#1c1f1d'); this.scene.fog.color.set('#3a3e3a'); this.renderer.toneMappingExposure = 0.5; this._thGlow = ENV.glow.value.clone(); ENV.glow.value.setScalar(0); this._thCloud = ENV.cloud.value; ENV.cloud.value = 0; }
      else { this.sky.visible = this._thSky; this.scene.background = this._thBg; this.scene.fog.color.copy(this._thFog); this.renderer.toneMappingExposure = this._thExp; ENV.glow.value.copy(this._thGlow); ENV.cloud.value = this._thCloud; } }
    this._heat(mode !== 0); this._heatAt = this.clock + 2;
  }
  _heat(on) { const walk = (o, heat) => { if (o.userData && o.userData.heat != null) heat = o.userData.heat; if (o.isMesh && o.material) for (const m of [].concat(o.material)) { if (!m || !m.emissive) continue; if (m.userData.e0 == null) { m.userData.e0 = m.emissive.getHex(); m.userData.ei0 = m.emissiveIntensity; } if (on) { m.emissive.setScalar(1); m.emissiveIntensity = heat * 3.2; } else { m.emissive.setHex(m.userData.e0); m.emissiveIntensity = m.userData.ei0; } } for (const c of o.children) walk(c, heat); }; walk(this.units, 0.5); }
  // which graphics chip the browser is actually using (a 'SwiftShader', 'llvmpipe' or 'Basic Render' answer means none: it is drawing on the processor)
  gpu() { if (this._gpu) return this._gpu; const gl = this.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); this._gpu = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); return this._gpu; }
  get software() { return /swiftshader|llvmpipe|basic render|software/i.test(this.gpu()); }
  applySize() { const w = this.canvas.clientWidth || 1280, h = this.canvas.clientHeight || 720; this.renderer.setPixelRatio(this.pr); this.renderer.setSize(w, h, false); this.composer.setPixelRatio(this.pr); this.composer.setSize(w, h); if (this.grade) this.grade.uniforms.px.value.set(1 / Math.max(1, w * this.pr), 1 / Math.max(1, h * this.pr)); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // build (or rebuild) the ground and scenery for a world, freeing what was there before
  setWorld(world) {
    const sc = this.scene, t0 = performance.now(); this.world = world;
    if (this.terrain) { sc.remove(this.terrain.mesh); this.terrain.dispose(); }
    for (const o of [this.trees, this.buildings]) if (o) { sc.remove(o); if (o.userData.dispose) o.userData.dispose(); else o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) [].concat(m.material).forEach(x => x.dispose()); }); }
    this.terrain = buildTerrain(world); sc.add(this.terrain.mesh);
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
    if (this.grade) { const g = this.grade.uniforms; g.tint.value.set(C.tint || '#ffffff'); g.shadowTint.value.set(C.shadow || '#ffffff'); g.sat.value = C.sat || 1; g.contrast.value = C.contrast || 1.06; g.grain.value = C.grain || 0.035; this.bloom.strength = C.night ? 0.7 : 0.3; this.bloom.threshold = C.night ? 0.55 : 1.0; }
    this.night = !!C.night;
    { const es = new THREE.Scene(), top = new THREE.Color(C.sky), bot = new THREE.Color(C.ground), g = new THREE.SphereGeometry(50, 24, 12), col = new Float32Array(g.attributes.position.count * 3), k = C.night ? 0.25 : 1;
      for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i) / 50, c = bot.clone().lerp(top, Math.min(1, Math.max(0, y * 2.5 + 0.5))); col.set([c.r * k, c.g * k, c.b * k], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const blob = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.sun).multiplyScalar(C.sunI * 2.2) })); blob.position.copy(dir).multiplyScalar(44); es.add(blob);
      if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer); if (this.envRT) this.envRT.dispose(); this.envRT = this.pmrem.fromScene(es, 0.04); this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = C.envI == null ? 0.8 : C.envI; g.dispose(); }
    this.bloom.threshold = C.night ? 0.55 : 2.2;
    if (this.fx) { const u2 = this.fx.mat.uniforms; u2.fogColor.value.set(C.fog); u2.fogDensity.value = C.fogD; u2.sunColor.value.set(C.sun).lerp(new THREE.Color(C.sky), 0.4).multiplyScalar(C.night ? 0.13 : 0.5 + C.sunI * 0.2); }
  }
  // light the surroundings for an instant (explosions, launches), and leave a scorch mark if on the ground
  blast(p, k = 1, scorch = true) { const l = this.flares[this.flareI++ % this.flares.length]; l.position.copy(p); l.position.y += 2; l.intensity = 900 * k * (this.night ? 1 : 0.5); l.userData.decay = 7; if (scorch) this.marks.add(p.x, p.z, 2.2 * k, (x, z) => this.world.h(x, -z)); }
  resize() { this.applySize(); }
  // world east/north to scene position on the ground
  at(e, n, up = 0, out = new THREE.Vector3()) { return out.set(e, this.world.h(e, n) + up, -n); }
  setFocus(e, n) { this.at(e, n, 2, this.focus); }
  render(dt = 0.016) {
    this.fx.update(dt, this.wind); for (const l of this.flares) if (l.intensity > 0) { l.intensity *= Math.exp(-dt * (l.userData.decay || 7)); if (l.intensity < 1) l.intensity = 0; } if (this.trees.userData.update) this.trees.userData.update(this.camera.position, this.Q.near, this.Q.mid, this.Q.far); this.fx.mat.uniforms.scale.value = this.renderer.domElement.height * 0.9; this.cover.update(this.camera, this.units);
    // the shadow map follows the point of interest so that detail stays sharp where the camera is looking
    this.sun.target.position.copy(this.focus); this.sun.position.copy(this.focus).addScaledVector(this.sunDir, 1200);
    this.clock += dt; ENV.time.value = this.clock; this.renderer.info.reset(); if (this.thermal && this.clock > (this._heatAt || 0)) { this._heat(true); this._heatAt = this.clock + 2; }   /* models that arrived since: make them glow too */
    // shadows are redrawn every frame on the highest setting, every second frame otherwise: the eye does not see the difference at walking pace
    this.frameN++; if (this.Q.shadowEvery <= 1 || this.frameN % this.Q.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
    // hold the frame rate by resolution (auto only). rawMs is the true time since the last frame.
    if (this.Q.auto && this.rawMs) { this.emaMs += (Math.min(this.rawMs, 100) - this.emaMs) * 0.08; if (--this.prHold < 0) { let pr = this.pr; if (this.emaMs > 21 && pr > this.prMin) pr = Math.max(this.prMin, pr * (this.emaMs > 30 ? 0.82 : 0.92)); else if (this.emaMs < 17.2 && pr < this.prMax) pr = Math.min(this.prMax, pr * 1.04); if (Math.abs(pr - this.pr) > 0.004) { this.pr = pr; this.applySize(); this.prHold = 45; } else this.prHold = 20; } }
    if (this.post) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  stats() { const i = this.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, scale: this.pr, quality: this.quality, trees: this.trees.userData.count, buildings: this.world.buildings.length, buildMs: this.buildMs }; }
}
