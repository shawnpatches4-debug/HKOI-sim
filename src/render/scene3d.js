// The battlefield renderer: ground, scenery, sky and light, the vehicle and the enemy, drawn from a World and a Battle.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTerrain } from './terrain.js';
import { buildTrees, buildBuildings } from './scenery.js';
import { Particles } from './fx.js';
import { ENV, Precipitation, GradeShader } from './env.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// light and air for each condition: sun elevation and azimuth (degrees), colours, fog density, exposure
export const CONDITIONS = {
  day: { name: 'Day', el: 38, az: 150, sun: '#fff1dc', sunI: 3.2, sky: '#bcd0e6', ground: '#5d5a44', hemiI: 0.9, fog: '#c3d0da', fogD: 0.00011, exposure: 0.62, turbidity: 6, rayleigh: 1.6, tint: '#fffaf2', shadow: '#f2f6ff', sat: 1.05, contrast: 1.08, envI: 0.9 },
  dawn: { name: 'Dawn', el: 5, az: 95, sun: '#ffb37a', sunI: 2.4, sky: '#9fb0c8', ground: '#4d463c', hemiI: 0.8, fog: '#d7b7a0', fogD: 0.00022, exposure: 0.8, turbidity: 10, rayleigh: 2.8, tint: '#ffe9d2', shadow: '#dfe6ff', sat: 1.05, contrast: 1.1, envI: 0.7 },
  dusk: { name: 'Dusk', el: 4, az: 265, sun: '#ff9b62', sunI: 2.2, sky: '#8f9fc0', ground: '#473f38', hemiI: 0.8, fog: '#c9a48e', fogD: 0.00024, exposure: 0.85, turbidity: 12, rayleigh: 3.0, tint: '#ffe2cc', shadow: '#d9ddff', sat: 1.05, contrast: 1.1, envI: 0.7 },
  overcast: { name: 'Overcast', el: 50, az: 180, sun: '#dfe4ea', sunI: 1.1, sky: '#aab3bb', ground: '#55554e', hemiI: 1.25, fog: '#aeb6bc', fogD: 0.00035, exposure: 0.58, turbidity: 18, rayleigh: 0.6, flatSky: '#a9b1b8', tint: '#f4f7fa', shadow: '#eef2f6', sat: 0.86, contrast: 1.04, envI: 1.0 },
  rain: { name: 'Rain and mud', el: 48, az: 190, sun: '#c9d0d8', sunI: 0.9, sky: '#8f989f', ground: '#484a45', hemiI: 1.5, fog: '#8d969c', fogD: 0.0011, exposure: 0.85, flatSky: '#878f95', tint: '#eef3f6', shadow: '#e6eef2', sat: 0.74, contrast: 1.05, wet: 1, precip: 'rain', envI: 0.9 },
  fog: { name: 'Fog', el: 30, az: 140, sun: '#e6e2d8', sunI: 0.8, sky: '#b9bdbd', ground: '#5a5a54', hemiI: 1.2, fog: '#b6bab9', fogD: 0.0042, exposure: 0.7, flatSky: '#b4b8b7', tint: '#f6f6f2', shadow: '#eef0f0', sat: 0.7, contrast: 0.98, wet: 0.35, envI: 0.9 },
  snow: { name: 'Snow', el: 22, az: 165, sun: '#eef2f8', sunI: 1.5, sky: '#c6d0dc', ground: '#aab2bd', hemiI: 1.25, fog: '#cfd6dd', fogD: 0.0009, exposure: 0.55, flatSky: '#c5ccd4', tint: '#f4f8ff', shadow: '#dfe8ff', sat: 0.8, contrast: 1.04, snow: 1, precip: 'snow', envI: 1.0 },
  night: { name: 'Night', el: 42, az: 215, sun: '#9db4e6', sunI: 1.5, sky: '#7088bd', ground: '#1a202c', hemiI: 0.7, fog: '#0a0e18', fogD: 0.0003, exposure: 1.3, flatSky: '#05070d', tint: '#e2eaff', shadow: '#c2d0ff', sat: 0.5, contrast: 1.0, grain: 0.07, night: true, envI: 0.5 },
};

export class Scene3D {
  constructor(canvas, world, opt = {}) {
    this.world = world; this.canvas = canvas;
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, opt.maxPixelRatio || 2)); R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.info.autoReset = false;
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 30000);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.minDistance = 4; this.controls.maxDistance = 9000;
    // sky and light
    this.sky = new Sky(); this.sky.scale.setScalar(25000); sc.add(this.sky);
    this.sun = new THREE.DirectionalLight('#ffffff', 3); this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096); const sh = this.sun.shadow.camera; sh.left = sh.bottom = -260; sh.right = sh.top = 260; sh.near = 10; sh.far = 2600; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6; sc.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1); sc.add(this.hemi);
    sc.fog = new THREE.FogExp2('#ffffff', 0.0001);
    // ground and scenery
    this.opt = opt; this.setWorld(world);
    this.units = new THREE.Group(); sc.add(this.units);
    this.fx = new Particles(8000); sc.add(this.fx.mesh);
    this.precip = new Precipitation(); sc.add(this.precip.mesh);
    // film pipeline: scene -> glow on the brightest parts -> tone mapping -> grade, vignette and grain
    this.post = opt.post !== false;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: opt.samples == null ? 4 : opt.samples });
    this.composer = new EffectComposer(R, rt); this.composer.addPass(new RenderPass(sc, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 1.0); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass()); this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.clock = 0;
    this.focus = new THREE.Vector3(0, world.h(0, 0), 0);
    this.setCondition(opt.condition || 'day');
    this.camera.position.set(-120, world.h(0, 0) + 70, 170); this.controls.target.copy(this.focus);
    this.resize();
  }
  // build (or rebuild) the ground and scenery for a world, freeing what was there before
  setWorld(world) {
    const sc = this.scene, t0 = performance.now(); this.world = world;
    for (const o of [this.terrain && this.terrain.mesh, this.trees, this.buildings]) if (o) { sc.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } }); }
    this.terrain = buildTerrain(world); sc.add(this.terrain.mesh);
    this.trees = buildTrees(world, { perCell: this.opt.treesPerCell || 2 }); sc.add(this.trees);
    this.buildings = buildBuildings(world); sc.add(this.buildings);
    this.buildMs = Math.round(performance.now() - t0);
    if (this.focus) this.focus.set(0, world.h(0, 0), 0);
  }
  setCondition(key) {
    const C = CONDITIONS[key] || CONDITIONS.day; this.condition = key;
    const el = C.el * Math.PI / 180, az = C.az * Math.PI / 180, dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); this.sunDir = dir;
    const u = this.sky.material.uniforms; u.turbidity.value = C.turbidity; u.rayleigh.value = C.rayleigh; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(dir);
    this.sun.color.set(C.sun); this.sun.intensity = C.sunI; this.hemi.color.set(C.sky); this.hemi.groundColor.set(C.ground); this.hemi.intensity = C.hemiI;
    this.scene.fog.color.set(C.fog); this.scene.fog.density = C.fogD; this.renderer.toneMappingExposure = C.exposure;
    this.sky.visible = !C.flatSky; this.scene.background = C.flatSky ? new THREE.Color(C.flatSky) : null;
    ENV.snow.value = C.snow || 0; ENV.wet.value = C.wet || 0; if (this.precip) this.precip.set(C.precip || null);
    if (this.grade) { const g = this.grade.uniforms; g.tint.value.set(C.tint || '#ffffff'); g.shadowTint.value.set(C.shadow || '#ffffff'); g.sat.value = C.sat || 1; g.contrast.value = C.contrast || 1.06; g.grain.value = C.grain || 0.035; this.bloom.strength = C.night ? 0.7 : 0.3; this.bloom.threshold = C.night ? 0.55 : 1.0; }
    this.night = !!C.night;
    { const es = new THREE.Scene(), top = new THREE.Color(C.sky), bot = new THREE.Color(C.ground), g = new THREE.SphereGeometry(50, 24, 12), col = new Float32Array(g.attributes.position.count * 3), k = C.night ? 0.25 : 1;
      for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i) / 50, c = bot.clone().lerp(top, Math.min(1, Math.max(0, y * 2.5 + 0.5))); col.set([c.r * k, c.g * k, c.b * k], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const blob = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.sun).multiplyScalar(C.sunI * 2.2) })); blob.position.copy(dir).multiplyScalar(44); es.add(blob);
      if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer); if (this.envRT) this.envRT.dispose(); this.envRT = this.pmrem.fromScene(es, 0.04); this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = C.envI == null ? 0.8 : C.envI; g.dispose(); }
    this.bloom.threshold = C.night ? 0.55 : 2.2;
    if (this.fx) { const u2 = this.fx.mat.uniforms; u2.fogColor.value.set(C.fog); u2.fogDensity.value = C.fogD; u2.sunColor.value.set(C.sun).multiplyScalar(0.5 + C.sunI * 0.2); }
  }
  resize() { const w = this.canvas.clientWidth || 1280, h = this.canvas.clientHeight || 720; this.renderer.setSize(w, h, false); if (this.composer) this.composer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // world east/north to scene position on the ground
  at(e, n, up = 0, out = new THREE.Vector3()) { return out.set(e, this.world.h(e, n) + up, -n); }
  setFocus(e, n) { this.at(e, n, 2, this.focus); }
  render(dt = 0.016) {
    this.fx.update(dt, this.wind); if (this.trees.userData.update) this.trees.userData.update(this.camera.position); this.fx.mat.uniforms.scale.value = this.renderer.domElement.height * 0.9;
    // the shadow map follows the point of interest so that detail stays sharp where the camera is looking
    this.sun.target.position.copy(this.focus); this.sun.position.copy(this.focus).addScaledVector(this.sunDir, 1200);
    this.clock += dt; ENV.time.value = this.clock; this.renderer.info.reset();
    if (this.post) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  stats() { const i = this.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, trees: this.trees.userData.count, buildings: this.world.buildings.length, buildMs: this.buildMs }; }
}
