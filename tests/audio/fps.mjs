// The sound's continuous layers must come out the same whatever the picture's frame rate: drive the same 12 seconds
// (pull away, turn, traverse the turret, a drone closing, threats in the air) through Sound.update at 30, 60, 144 and 240
// frames a second and compare where the smoothed values end up (turbine throttle, turn and traverse rates, tension, the
// drone's closing speed) and how often the audio engine was given new values.
//   node tests/audio/fps.mjs <folder holding node_modules/node-web-audio-api>
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WA = require(path.join(process.argv[2], 'node_modules/node-web-audio-api'));
const { Sound } = await import(path.join(root, 'src/audio/sound.js'));
const SEC = 12, out = [];
for (const fps of [30, 60, 144, 240]) {
  const ctx = new WA.OfflineAudioContext(2, 44100, 44100), s = new Sound(); s.start(ctx); s.set({ tension: true });
  let works = 0; const orig = s.mix.setSeat.bind(s.mix); s.mix.setSeat = x => { works++; orig(x); };   /* setSeat is called once per real pass through update */
  const dt = 1 / fps, n = Math.round(SEC * fps);
  for (let i = 1; i <= n; i++) { const t = i * dt; s.update(dt, { view: 'in_gnr', cond: 'day', biome: 'town', speed: Math.min(11, t * 2), heading: t > 4 ? (t - 4) * 20 : 0, turret: t > 6 ? (t - 6) * 25 : 0, alive: true, camDist: 2, rate: 1, talking: true, threat: 3, drones: [{ id: 'a', d: Math.max(5, 600 - 40 * t) }] }); }
  const q = s.drones.get('a');
  out.push({ fps, thr: s.thr, turn: s.turnS, slew: s.slewS, tension: s.tension, vc: q.vc, works });
  console.log(String(fps).padStart(3), 'fps: throttle', s.thr.toFixed(3), ' turn', s.turnS.toFixed(2), ' traverse', s.slewS.toFixed(2), ' tension', s.tension.toFixed(3), ' drone closing', q.vc.toFixed(1), 'm/s  engine updates', works);
}
const bad = [], A = out[0];
for (const o of out.slice(1)) {
  for (const [k, tol] of [['thr', 0.02], ['turn', 0.8], ['slew', 1.0], ['tension', 0.03], ['vc', 1.5]]) if (Math.abs(o[k] - A[k]) > tol) bad.push(k + ' at ' + o.fps + ' fps: ' + o[k].toFixed(3) + ' against ' + A[k].toFixed(3) + ' at 30 fps');
  if (o.works > SEC * 34) bad.push('the audio engine was updated ' + o.works + ' times in ' + SEC + ' s at ' + o.fps + ' fps (must stay near 30 a second)');
}
console.log(bad.length ? 'SOUND FRAME RATE TEST FAIL: ' + bad.join('; ') : 'SOUND FRAME RATE TEST PASS');
process.exit(bad.length ? 1 : 0);
