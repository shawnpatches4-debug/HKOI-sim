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

import { TankView, TeamView } from '../render/units.js';
import { VolleyView } from '../render/volleyview.js';
const tank = new TankView(q.get('assets') === '0' ? null : 'assets/'); scene.units.add(tank.group);
const teams = battle.units.map(u => { const t = new TeamView(u.type); scene.units.add(t.group); return t; });
const volleys = new VolleyView(scene, battle, scene.fx);
const spectator = q.get('spectator') === '1';   // show every enemy team from the start; otherwise only those the vehicle's side has located

let last = performance.now(), frames = 0, fps = 0, fpsT = last, playing = q.get('play') !== '0', speed = +(q.get('speed') || 1);
function place() {
  const T = battle.tank, w = world, d = 2.5, hh = T.h * Math.PI / 180, fe = Math.sin(hh), fn = Math.cos(hh);
  const pitch = Math.atan2(w.h(T.e + fe * d, T.n + fn * d) - w.h(T.e - fe * d, T.n - fn * d), 2 * d), roll = Math.atan2(w.h(T.e + fn * 1.6, T.n - fe * 1.6) - w.h(T.e - fn * 1.6, T.n + fe * 1.6), 3.2);
  tank.place(scene.at(T.e, T.n, 0), T.h, -pitch, roll); scene.setFocus(T.e, T.n);
  battle.units.forEach((u, i) => { teams[i].group.visible = u.alive && (spectator || u.known || u.state === 'guiding' || u.state === 'firing'); teams[i].place(scene.at(u.e, u.n, 0), Math.atan2(T.e - u.e, T.n - u.n) * 180 / Math.PI); });
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && battle.tank.alive) { let acc = dt * speed; while (acc > 1e-6) { battle.step(); acc -= battle.dt; } }
  place(); volleys.update(battle.t, dt * (playing ? speed : 0)); scene.render(dt);
  frames++; if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; const s = scene.stats(), b = battle.summary(); hud.textContent = `${world.biome.name}  map ${mapSeed}  ${condition}\n${fps} fps  ${s.calls} draw calls  ${(s.triangles / 1e6).toFixed(2)} M triangles  ${s.trees} trees  ${s.buildings} buildings\nT+${battle.t.toFixed(0)} s  volleys ${b.volleys}  fired ${b.fired}  hits ${b.hits}  ${b.alive ? 'vehicle alive' : 'VEHICLE DESTROYED'}\n` + battle.log.filter(l => l.t <= battle.t).sort((a, c) => a.t - c.t).slice(-4).map(l => `${String(l.t).padStart(6)}  ${l.text}`).join('\n'); }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => scene.resize());
window.__beta = { world, scene, battle, THREE, tank, setPlaying(v) { playing = v; }, runTo(t) { while (battle.t < t && battle.tank.alive) battle.step(); place(); }, playFor(sec) { const n = Math.round(sec / battle.dt); for (let i = 0; i < n; i++) { battle.step(); place(); volleys.update(battle.t, battle.dt); scene.fx.update(battle.dt); } }, near(dist, height, brg) { const T = battle.tank, a = (brg || 200) * Math.PI / 180; this.view(T.e + Math.sin(a) * dist, T.n + Math.cos(a) * dist, 0, height, T.e, T.n); }, view(e, n, dist, height, lookE, lookN) { scene.camera.position.set(e, world.h(e, n) + height, -n); scene.controls.target.set(lookE, world.h(lookE, lookN) + 2, -lookN); } };
requestAnimationFrame(frame);
hud.textContent = 'Ready';
