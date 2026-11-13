// Beta entry point: title and setup, the battle loop, cameras, the on-screen information and the result screen.
import * as THREE from 'three';
import { Scene3D, CONDITIONS } from '../render/scene3d.js';
import { TankView, TeamView } from '../render/units.js';
import { VolleyView } from '../render/volleyview.js';
import { Cameras, CAMERA_MODES } from '../render/cameras.js';

const VERSION = '0.3';
const $ = id => document.getElementById(id), el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const q = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
const store = { get(k, d) { try { const v = localStorage.getItem('hkoi.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('hkoi.' + k, JSON.stringify(v)); } catch (e) { } } };

const BIOMES = [['farmland', 'Farmland'], ['desert', 'Desert'], ['town', 'Town edge'], ['forest', 'Forest and hills']];
const FORCES = {
  light: { name: 'Light ambush', note: 'Two wire-guided launchers and an RPG team', force: [{ type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  ambush: { name: 'Missile ambush', note: 'Two Kornet, two Konkurs, one RPG team', force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  drones: { name: 'Drone hunt', note: 'Two radio FPV crews, one fibre FPV crew, one Kornet', force: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }] },
  heavy: { name: 'Prepared defence', note: 'Three Kornet, two Konkurs, a laser designator, two FPV crews, two RPG teams', force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] },
};
const SKILLS = [['green', 'Green'], ['trained', 'Trained'], ['expert', 'Expert']];
const set = Object.assign({ biome: 'farmland', cond: 'day', force: 'ambush', skill: 'trained', map: 3, spectator: false, seed: 1 }, store.get('setup', {}));
for (const k of ['biome', 'cond', 'force', 'skill']) if (q.get(k)) set[k] = q.get(k);
if (q.get('map')) set.map = +q.get('map'); if (q.get('seed')) set.seed = +q.get('seed'); if (q.get('spectator')) set.spectator = q.get('spectator') === '1';

const canvas = $('view'), hud = $('hud');
let world = new HKWorld.World({ seed: set.map, biome: set.biome });
const scene = new Scene3D(canvas, world, { condition: set.cond });
const cams = new Cameras(scene);
const BattleAPI = HKBattle.create({ HK, CAMP, World: HKWorld });
const cfg0 = HK.defaultConfig(); let lookup = null;
const tank = new TankView(q.get('assets') === '0' ? null : 'assets/'); scene.units.add(tank.group);
let battle = null, teams = [], volleys = null, state = 'title', playing = false, speed = +(q.get('speed') || 1), logShown = 0, capT = -9, capW = 0, ended = false, showLog = store.get('log', true), showPerf = store.get('perf', q.get('perf') === '1');

function newBattle() {
  if (!lookup) lookup = cfg0.hkoi_enabled ? HK.meetLookup(cfg0) : {};
  for (const t of teams) scene.units.remove(t.group); if (volleys) volleys.dispose();
  battle = new BattleAPI.Battle({ world, seed: set.seed, cfg: cfg0, lookup, skill: set.skill, force: FORCES[set.force].force });
  teams = battle.units.map(u => { const t = new TeamView(u.type); scene.units.add(t.group); return t; });
  scene.marks.clear(); scene.fx.n = 0;
  volleys = new VolleyView(scene, battle, scene.fx); logShown = 0; ended = false; $('log').textContent = ''; $('caption').textContent = '';
  api.battle = battle; place();
}
function ensureWorld() { if (world.seed !== set.map || world.biomeKey !== set.biome) { world = new HKWorld.World({ seed: set.map, biome: set.biome }); scene.setWorld(world); api.world = world; } if (scene.condition !== set.cond) scene.setCondition(set.cond); }

// ---------------------------------------------------------------- drawing the battle state
function place() {
  const T = battle.tank, w = world, d = 2.5, hh = T.h * Math.PI / 180, fe = Math.sin(hh), fn = Math.cos(hh);
  const pitch = Math.atan2(w.h(T.e + fe * d, T.n + fn * d) - w.h(T.e - fe * d, T.n - fn * d), 2 * d), roll = Math.atan2(w.h(T.e + fn * 1.6, T.n - fe * 1.6) - w.h(T.e - fn * 1.6, T.n + fe * 1.6), 3.2);
  tank.place(scene.at(T.e, T.n, 0), T.h, -pitch, roll); scene.setFocus(T.e, T.n);
  battle.units.forEach((u, i) => { teams[i].group.visible = u.alive && (set.spectator || u.known || u.state === 'guiding' || u.state === 'firing'); teams[i].place(scene.at(u.e, u.n, 0), Math.atan2(T.e - u.e, T.n - u.n) * 180 / Math.PI); });
}
// markers: what the vehicle's sensors hold (threats cued and tracked, launch sites located); in spectator mode every team, faintly
const marks = $('marks'), pool = [], v3 = new THREE.Vector3();
function mark(i, cls, p, text) { let m = pool[i]; if (!m) { m = el('div', 'mk'); m.append(el('i'), el('span')); marks.append(m); pool.push(m); } v3.copy(p).project(scene.camera); const on = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05; m.hidden = !on; if (!on) return; m.className = 'mk ' + cls; m.style.transform = `translate(${((v3.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v3.y) / 2 * innerHeight).toFixed(1)}px)`; if (m.lastChild.textContent !== text) m.lastChild.textContent = text; }
function drawMarks() {
  let i = 0; if (state === 'play') {
    for (const m of volleys.info) { if (!m.cued && !set.spectator) continue; mark(i++, m.tracked ? 'threat tracked' : m.cued ? 'threat' : 'ghost', m.p, `${m.tt.name || m.th.key}  ${(m.range / 1000).toFixed(2)} km`); }
    battle.units.forEach(u => { if (!u.alive) return; if (u.known) mark(i++, 'site', scene.at(u.e, u.n, 1.5, new THREE.Vector3()), `${u.spec.name} located`); else if (set.spectator && cams.mode !== 'enemy') mark(i++, 'ghost', scene.at(u.e, u.n, 1.5, new THREE.Vector3()), `${u.spec.name} #${u.id + 1} · ${u.state}`); });
  }
  for (; i < pool.length; i++) pool[i].hidden = true;
}
function chip(label, value, cls) { const c = el('div', 'chip panel' + (cls ? ' ' + cls : '')); c.append(label + ' '); c.append(el('b', null, value)); return c; }
function drawStatus() {
  const s = battle.summary(), T = battle.tank.st, st = $('status'); st.textContent = '';
  const mm = Math.floor(battle.t / 60), ss = Math.floor(battle.t % 60);
  st.append(chip('T+', `${mm}:${String(ss).padStart(2, '0')}`), chip('OBSCURANT', s.obs, s.obs < 40 ? 'warn' : ''), chip('HE', s.he, s.he < 40 ? 'warn' : ''), chip('TROPHY', `L${s.apsL} R${s.apsR}`, s.apsL + s.apsR === 0 ? 'bad' : s.apsL + s.apsR < 3 ? 'warn' : ''));
  const crew = s.crew || {}, down = Object.values(crew).filter(x => x !== 'ok').length; st.append(chip('CREW', down ? `${4 - down}/4` : '4/4', down ? 'bad' : ''), chip('INCOMING', `${s.fired} fired · ${s.hits} hit`, s.hits ? 'bad' : ''));
  if (!s.alive) st.append(chip('VEHICLE', 'DESTROYED', 'bad'));
}
function drawLog() {
  const due = battle.log.filter(l => l.t <= battle.t); if (due.length === logShown) return; due.sort((a, b) => a.t - b.t);
  const box = $('log'), fresh = due.slice(logShown); logShown = due.length;
  for (const l of fresh) { if (!set.spectator && (l.kind === 'volley' || l.kind === 'enemy' && !/loses sight/.test(l.text))) continue; if (l.kind === 'engine' && (l.sub === 'track' || l.sub === 'handoff') && !set.spectator) continue; const d = el('div', 'k-' + l.kind); const mm = Math.floor(l.t / 60), ss = (l.t % 60).toFixed(0).padStart(2, '0'); d.append(`${mm}:${ss}  `); d.append(el('b', null, l.text)); box.append(d); }
  while (box.childElementCount > 120) box.firstChild.remove(); box.scrollTop = box.scrollHeight;
  // the caption carries the most important new line, not merely the newest; the log keeps the lesser detail only in spectator view
  const W8 = l => l.kind === 'engine' ? ({ hit: 9, kill: 7, miss: 5, launch: 6, cue: 6, crew: 5, fire: 4, track: 2, handoff: 2 }[l.sub] || 3) : ({ volley: 8, result: 8, enemy: 5, tank: 6 }[l.kind] || 0);
  const top = fresh.filter(l => l.kind !== 'setup' && (set.spectator || l.kind !== 'volley' && l.kind !== 'enemy')).sort((a, b) => W8(a) - W8(b) || a.t - b.t).pop(); if (top && (W8(top) >= capW || performance.now() - capT > 1800)) { capW = W8(top); const c = $('caption'); c.textContent = top.text; if (top.why) c.append(el('small', null, top.why)); c.style.opacity = 1; capT = performance.now(); }
}
function checkEnd() {
  if (ended) return; const s = battle.summary(), last = battle.volleys[battle.volleys.length - 1], quiet = !last || battle.t > last.tEnd + 6;
  const out = !s.alive ? 'lost' : (s.teamsLeft === 0 && quiet) ? 'won' : battle.t >= 900 ? 'time' : null; if (!out) return;
  ended = true; setTimeout(() => { if (state !== 'play') return; playing = false; state = 'result';
    $('r-head').innerHTML = out === 'lost' ? 'VEHICLE <em style="color:var(--bad)">DESTROYED</em>' : out === 'won' ? 'AMBUSH <em>DEFEATED</em>' : 'TIME <em>EXPIRED</em>';
    $('r-sub').textContent = `${world.biome.name}, map ${set.map}, ${CONDITIONS[set.cond].name.toLowerCase()} · ${FORCES[set.force].name}, ${set.skill} crews · ${Math.floor(battle.t / 60)} min ${Math.floor(battle.t % 60)} s`;
    const tb = $('r-table'); tb.textContent = ''; const NAMES = { HIT: 'Hit the vehicle', aps: 'Stopped by Trophy', hkoi_obs: 'Guidance cut by HKOI cloud', hkoi_cut: 'Guidance cut by HKOI cloud', hkoi_he: 'Shot down by HKOI', terrain_mask: 'Lost behind terrain or cover', gunner_jitter: 'Enemy gunner missed', unguided_miss: 'Unguided miss', jammer: 'Jammed' };
    const rows = [['Enemy volleys', s.volleys], ['Missiles and drones launched', s.fired]].concat(Object.entries(s.by).sort((a, b) => b[1] - a[1]).map(([k, n]) => ['· ' + (NAMES[k] || k.replace(/_/g, ' ')), n])).concat([['HKOI rounds used', `${cfg0.rnd ? '' : ''}${150 - s.obs} obscurant, ${150 - s.he} HE`], ['Trophy charges left', `${s.apsL} left, ${s.apsR} right`], ['Crew', Object.entries(s.crew || {}).map(([k, x]) => `${k.toUpperCase()} ${x}`).join('  ')], ['Enemy teams still able to fire', s.teamsLeft]]);
    for (const [a, b] of rows) { const tr = el('tr'); tr.append(el('td', null, a), el('td', null, String(b))); tb.append(tr); }
    show(); }, out === 'lost' ? 5000 : 2500);
}

// ---------------------------------------------------------------- screens and controls
function show() { $('title').hidden = state !== 'title'; $('result').hidden = state !== 'result'; const p = state === 'play'; $('status').hidden = !p; $('bar').hidden = !p; $('log').hidden = !(p && showLog); hud.hidden = !showPerf; if (!p) $('caption').textContent = ''; }
function seg(id, items, key, after) { const box = $(id); box.textContent = ''; for (const [v, name] of items) { const b = el('button', 'btn' + (set[key] === v ? ' on' : ''), name); b.onclick = () => { set[key] = v; store.set('setup', set); seg(id, items, key, after); if (after) after(); }; box.append(b); } }
function note() { $('o-note').textContent = FORCES[set.force].note + '. ' + (set.spectator ? 'Spectator: every enemy team is shown and you can look through their sights.' : 'Fog of war: you see only what the vehicle\'s sensors and crew have found.'); }
function buildTitle() {
  $('ver').textContent = VERSION;
  seg('o-biome', BIOMES, 'biome', preview); seg('o-cond', Object.entries(CONDITIONS).map(([k, c]) => [k, c.name]), 'cond', preview); seg('o-force', Object.entries(FORCES).map(([k, f]) => [k, f.name]), 'force', note); seg('o-skill', SKILLS, 'skill'); seg('o-spec', [[false, 'Fog of war'], [true, 'Spectator']], 'spectator', note);
  $('o-map').value = set.map; $('o-map').onchange = () => { set.map = Math.max(1, Math.min(9999, Math.round(+$('o-map').value || 1))); store.set('setup', set); preview(); };
  $('o-rand').onclick = () => { set.map = 1 + Math.floor(Math.random() * 9999); $('o-map').value = set.map; store.set('setup', set); preview(); };
  $('go').onclick = start; note();
}
let previewTimer = 0; function preview() { clearTimeout(previewTimer); previewTimer = setTimeout(() => { ensureWorld(); newBattle(); }, 60); }
function start() { ensureWorld(); newBattle(); state = 'play'; playing = true; cams.set(store.get('cam', 'orbit')); if (cams.mode === 'orbit') { const T = battle.tank; scene.camera.position.copy(scene.at(T.e - 26, T.n - 34, 13)); } buildBar(); show(); }
function buildBar() {
  const bar = $('bar'); bar.textContent = ''; const grp = () => { const g = el('div', 'grp'); bar.append(g); return g; };
  let g = grp(); const pp = el('button', 'btn', playing ? 'Pause' : 'Play'); pp.onclick = () => { playing = !playing; buildBar(); }; g.append(pp);
  for (const s of [0.25, 1, 2, 4]) { const b = el('button', 'btn' + (speed === s ? ' on' : ''), s === 0.25 ? '¼×' : s + '×'); b.title = 'Time rate'; b.onclick = () => { speed = s; buildBar(); }; g.append(b); }
  g = grp(); for (const m of CAMERA_MODES) { if (m.spectator && !set.spectator) continue; const b = el('button', 'btn' + (m.spectator ? ' spec' : '') + (cams.mode === m.key ? ' on' : ''), m.name); b.title = m.hint; b.onclick = () => { cams.set(m.key); store.set('cam', m.spectator ? 'orbit' : m.key); buildBar(); }; g.append(b); }
  g = grp(); const sp = el('button', 'btn spec' + (set.spectator ? ' on' : ''), 'Spectator'); sp.title = 'Show every enemy team and allow enemy views'; sp.onclick = () => { set.spectator = !set.spectator; if (!set.spectator && (cams.mode === 'enemy' || cams.mode === 'missile')) cams.set('orbit'); store.set('setup', set); buildBar(); }; g.append(sp);
  const lg = el('button', 'btn' + (showLog ? ' on' : ''), 'Log'); lg.onclick = () => { showLog = !showLog; store.set('log', showLog); buildBar(); show(); }; g.append(lg);
  const pf = el('button', 'btn' + (showPerf ? ' on' : ''), 'FPS'); pf.title = 'Frame rate and scene load'; pf.onclick = () => { showPerf = !showPerf; store.set('perf', showPerf); buildBar(); show(); }; g.append(pf);
  const mn = el('button', 'btn', 'Menu'); mn.onclick = () => { state = 'title'; playing = false; cams.set('orbit'); show(); }; g.append(mn);
}
$('r-again').onclick = start; $('r-next').onclick = () => { set.seed++; store.set('setup', set); start(); }; $('r-menu').onclick = () => { state = 'title'; cams.set('orbit'); show(); };
window.addEventListener('keydown', e => { if (state !== 'play' || e.target.tagName === 'INPUT') return; if (e.code === 'Space') { playing = !playing; buildBar(); e.preventDefault(); } const n = '123456'.indexOf(e.key); if (n >= 0) { const m = CAMERA_MODES[n]; if (!m.spectator || set.spectator) { cams.set(m.key); buildBar(); } } });

// ---------------------------------------------------------------- the frame
let last = performance.now(), frames = 0, fps = 0, fpsT = last, worst = 0, slow = 0, titleA = 0;
function ctx() { const T = battle.tank, m = volleys.info; let brg = null; if (m.length) { const c = m.filter(x => x.cued); if (c.length) brg = c.sort((a, b) => a.range - b.range)[0].brg; } return { tank: T, units: battle.units, missiles: m, threatBrg: brg }; }
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.1, raw); last = now; worst = Math.max(worst, raw * 1000); if (raw > 0.05) slow++;
  if (state === 'play' && playing && !(!battle.tank.alive && ended && battle.t > battle.volleys[battle.volleys.length - 1].tEnd + 8)) { let acc = dt * speed, n = 0; while (acc > 1e-6 && n++ < 60) { battle.step(); acc -= battle.dt; } }
  place(); volleys.update(battle.t, dt * (state === 'play' && playing ? speed : 0));
  if (state === 'play') { cams.update(dt, ctx()); drawLog(); checkEnd(); if (performance.now() - capT > 5200) $('caption').style.opacity = 0; }
  else { /* slow turn around the vehicle behind the menus */ titleA += dt * 0.05; const T = battle.tank, r = 60; scene.camera.up.set(0, 1, 0); scene.camera.fov = 45; scene.camera.updateProjectionMatrix(); scene.camera.position.copy(scene.at(T.e + Math.sin(titleA) * r, T.n + Math.cos(titleA) * r, 0)); scene.camera.position.y = Math.max(scene.camera.position.y + 3, world.h(T.e, T.n) + 16); scene.camera.lookAt(scene.at(T.e, T.n, 2)); }
  scene.render(dt); drawMarks();
  frames++; if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; if (state === 'play') drawStatus();
    if (showPerf) { const s = scene.stats(); hud.textContent = `${fps} fps   worst frame ${worst.toFixed(0)} ms   slow frames ${slow}\n${s.calls} draw calls   ${(s.triangles / 1e6).toFixed(2)} M triangles\n${s.trees} trees   ${s.buildings} buildings   particles ${scene.fx.n}`; } worst = 0; slow = 0; }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => scene.resize());
const api = window.__beta = { world, scene, battle: null, THREE, tank, cams, set, ready: false, start, setPlaying(v) { playing = v; }, state: () => state,
  runTo(t) { while (battle.t < t && battle.tank.alive) battle.step(); place(); }, playFor(sec) { const n = Math.round(sec / battle.dt); for (let i = 0; i < n; i++) { battle.step(); place(); volleys.update(battle.t, battle.dt); scene.fx.update(battle.dt); } },
  near(dist, height, brg) { const T = battle.tank, a = (brg || 200) * Math.PI / 180; this.view(T.e + Math.sin(a) * dist, T.n + Math.cos(a) * dist, 0, height, T.e, T.n); },
  view(e, n, dist, height, lookE, lookN) { cams.mode = 'free'; scene.controls.enabled = false; scene.camera.up.set(0, 1, 0); scene.camera.position.set(e, world.h(e, n) + height, -n); scene.camera.lookAt(lookE, world.h(lookE, lookN) + 2, -lookN); } };
buildTitle(); newBattle(); if (q.get('play') === '1') start(); else { state = 'title'; show(); }
api.ready = true; $('veil').hidden = true; requestAnimationFrame(frame);
