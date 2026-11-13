// Beta entry point: builds a battlefield, starts a battle on it and draws it.
import * as THREE from 'three';
import { Scene3D } from '../render/scene3d.js';

const q = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
const biome = q.get('biome') || 'farmland', mapSeed = +(q.get('map') || 3), seed = +(q.get('seed') || 1), condition = q.get('cond') || 'day';
const hud = document.getElementById('hud'), canvas = document.getElementById('view');

const world = new HKWorld.World({ seed: mapSeed, biome });
const scene = new Scene3D(canvas, world, { condition });
const BattleAPI = HKBattle.create({ HK, CAMP, World: HKWorld });
const battle = new BattleAPI.Battle({ world, seed, cfg: HK.defaultConfig(), force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] });

// placeholder markers until the real models are brought across: the vehicle and each enemy team
const tank = new THREE.Mesh(new THREE.BoxGeometry(3.7, 2.4, 9.8), new THREE.MeshStandardMaterial({ color: '#6b6a4c', roughness: 0.8 })); tank.castShadow = true; scene.units.add(tank);
const teamMarks = battle.units.map(() => { const m = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 8), new THREE.MeshStandardMaterial({ color: '#c0392b' })); scene.units.add(m); return m; });

let last = performance.now(), frames = 0, fps = 0, fpsT = last, playing = q.get('play') !== '0';
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && battle.tank.alive) { let acc = dt; while (acc > 0) { battle.step(); acc -= battle.dt; } }
  const T = battle.tank; scene.at(T.e, T.n, 1.2, tank.position); tank.rotation.y = -T.h * Math.PI / 180; scene.setFocus(T.e, T.n);
  battle.units.forEach((u, i) => { scene.at(u.e, u.n, 1.5, teamMarks[i].position); teamMarks[i].visible = u.alive; });
  scene.render();
  frames++; if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; const s = scene.stats(), b = battle.summary(); hud.textContent = `${world.biome.name}  map ${mapSeed}  ${condition}\n${fps} fps  ${s.calls} draw calls  ${(s.triangles / 1e6).toFixed(2)} M triangles  ${s.trees} trees  ${s.buildings} buildings\nT+${battle.t.toFixed(0)} s  volleys ${b.volleys}  fired ${b.fired}  hits ${b.hits}  ${b.alive ? 'vehicle alive' : 'VEHICLE DESTROYED'}\n` + battle.log.slice(-4).map(l => `${String(l.t).padStart(6)}  ${l.text}`).join('\n'); }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => scene.resize());
window.__beta = { world, scene, battle, THREE, setPlaying(v) { playing = v; }, view(e, n, dist, height, lookE, lookN) { scene.camera.position.set(e, world.h(e, n) + height, -n); scene.controls.target.set(lookE, world.h(lookE, lookN) + 2, -lookN); } };
requestAnimationFrame(frame);
hud.textContent = 'Ready';
