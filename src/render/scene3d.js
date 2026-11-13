// The battlefield renderer: ground, scenery, sky and light, the vehicle and the enemy, drawn from a World and a Battle.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTerrain } from './terrain.js';
import { buildTrees, buildBuildings } from './scenery.js';
import { Particles } from './fx.js';

// light and air for each condition: sun elevation and azimuth (degrees), colours, fog density, exposure
export const CONDITIONS = {
  day: { el: 38, az: 150, sun: '#fff1dc', sunI: 3.2, sky: '#bcd0e6', ground: '#5d5a44', hemiI: 0.9, fog: '#c3d0da', fogD: 0.00011, exposure: 0.62, turbidity: 6, rayleigh: 1.6 },
  dawn: { el: 5, az: 95, sun: '#ffb37a', sunI: 2.4, sky: '#9fb0c8', ground: '#4d463c', hemiI: 0.55, fog: '#d7b7a0', fogD: 0.00022, exposure: 0.6, turbidity: 10, rayleigh: 2.8 },
  dusk: { el: 4, az: 265, sun: '#ff9b62', sunI: 2.2, sky: '#8f9fc0', ground: '#473f38', hemiI: 0.5, fog: '#c9a48e', fogD: 0.00024, exposure: 0.6, turbidity: 12, rayleigh: 3.0 },
  overcast: { el: 50, az: 180, sun: '#dfe4ea', sunI: 1.1, sky: '#aab3bb', ground: '#55554e', hemiI: 1.25, fog: '#aeb6bc', fogD: 0.00035, exposure: 0.58, turbidity: 18, rayleigh: 0.6 },
};

export class Scene3D {
  constructor(canvas, world, opt = {}) {
    this.world = world; this.canvas = canvas;
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, opt.maxPixelRatio || 2)); R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 30000);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.minDistance = 4; this.controls.maxDistance = 9000;
    // sky and light
    this.sky = new Sky(); this.sky.scale.setScalar(25000); sc.add(this.sky);
    this.sun = new THREE.DirectionalLight('#ffffff', 3); this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096); const sh = this.sun.shadow.camera; sh.left = sh.bottom = -260; sh.right = sh.top = 260; sh.near = 10; sh.far = 2600; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6; sc.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1); sc.add(this.hemi);
    sc.fog = new THREE.FogExp2('#ffffff', 0.0001);
    // ground and scenery
    const t0 = performance.now(); this.terrain = buildTerrain(world); sc.add(this.terrain.mesh);
    this.trees = buildTrees(world, { perCell: opt.treesPerCell || 2 }); sc.add(this.trees);
    this.buildings = buildBuildings(world); sc.add(this.buildings);
    this.buildMs = Math.round(performance.now() - t0);
    this.units = new THREE.Group(); sc.add(this.units);
    this.fx = new Particles(8000); sc.add(this.fx.mesh);
    this.focus = new THREE.Vector3(0, world.h(0, 0), 0);
    this.setCondition(opt.condition || 'day');
    this.camera.position.set(-120, world.h(0, 0) + 70, 170); this.controls.target.copy(this.focus);
    this.resize();
  }
  setCondition(key) {
    const C = CONDITIONS[key] || CONDITIONS.day; this.condition = key;
    const el = C.el * Math.PI / 180, az = C.az * Math.PI / 180, dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); this.sunDir = dir;
    const u = this.sky.material.uniforms; u.turbidity.value = C.turbidity; u.rayleigh.value = C.rayleigh; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(dir);
    this.sun.color.set(C.sun); this.sun.intensity = C.sunI; this.hemi.color.set(C.sky); this.hemi.groundColor.set(C.ground); this.hemi.intensity = C.hemiI;
    this.scene.fog.color.set(C.fog); this.scene.fog.density = C.fogD; this.renderer.toneMappingExposure = C.exposure;
    if (this.fx) { const u2 = this.fx.mat.uniforms; u2.fogColor.value.set(C.fog); u2.fogDensity.value = C.fogD; u2.sunColor.value.set(C.sun).multiplyScalar(0.5 + C.sunI * 0.2); }
  }
  resize() { const w = this.canvas.clientWidth || 1280, h = this.canvas.clientHeight || 720; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // world east/north to scene position on the ground
  at(e, n, up = 0, out = new THREE.Vector3()) { return out.set(e, this.world.h(e, n) + up, -n); }
  setFocus(e, n) { this.at(e, n, 2, this.focus); }
  render(dt = 0.016) {
    this.controls.update(); this.fx.update(dt, this.wind); this.fx.mat.uniforms.scale.value = this.renderer.domElement.height * 0.9;
    // the shadow map follows the point of interest so that detail stays sharp where the camera is looking
    this.sun.target.position.copy(this.focus); this.sun.position.copy(this.focus).addScaledVector(this.sunDir, 1200);
    this.renderer.render(this.scene, this.camera);
  }
  stats() { const i = this.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, trees: this.trees.userData.count, buildings: this.world.buildings.length, buildMs: this.buildMs }; }
}
