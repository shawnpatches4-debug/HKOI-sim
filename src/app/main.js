// Beta entry point: title and setup, the battle loop, cameras, the on-screen information and the result screen.
import * as THREE from 'three';
import { Scene3D, CONDITIONS, QUALITY } from '../render/scene3d.js';
import { TankView, TeamView, PropView } from '../render/units.js';
import { VolleyView } from '../render/volleyview.js';
import { Cameras, CAMERA_MODES } from '../render/cameras.js';
import { EnemyViews } from './enemyviews.js';
import { MapView } from './mapview.js';
import { Sound } from '../audio/sound.js';
import { FINISH, setFinish } from '../render/env.js';

const VERSION = '0.28';
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
const MISSIONS = [['hold', 'Hold a position'], ['advance', 'Advance to an objective'], ['hunt', 'Hunt the ambush']];
const SKILLS = [['green', 'Green'], ['trained', 'Trained'], ['expert', 'Expert'], ['veteran', 'Veteran']];
const set = Object.assign({ biome: 'farmland', cond: 'day', force: 'ambush', skill: 'trained', map: 3, spectator: false, seed: 1, gfx: 'auto', mission: 'hold' }, store.get('setup', {}));
for (const k of ['biome', 'cond', 'force', 'skill', 'gfx', 'mission']) if (q.get(k)) set[k] = q.get(k);
if (q.get('map')) set.map = +q.get('map'); if (q.get('seed')) set.seed = +q.get('seed'); if (q.get('spectator')) set.spectator = q.get('spectator') === '1';

const canvas = $('view'), hud = $('hud');
const sound = new Sound(); sound.on = store.get('sound', true);
const camDist = p => scene.camera.position.distanceTo(p);
function onVolleyEvent(type, p, o) { if (!sound.ctx || speed > 2.01) return; voiceEvent(type, o); const d = camDist(p); if (type === 'gun') sound.gun30(d); else if (type === 'explosion') sound.explosion(d, o.size); else if (type === 'airburst') sound.airburst(d, o.size); else if (type === 'aps') sound.aps(d); else if (type === 'launch') sound.launch(d, o.big); else if (type === 'pass') sound.whoosh(0.5, Math.min(0.6, 30 / (30 + d))); else if (type === 'hit') { sound.explosion(d, o.killing ? 2.2 : 1.4); if (cams.mode === 'cdr' || cams.mode === 'gnr' || d < 25) sound.hit(o.killing); } }
let world = new HKWorld.World({ seed: set.map, biome: set.biome });
const scene = new Scene3D(canvas, world, { condition: set.cond, quality: set.gfx });
const cams = new Cameras(scene);
const BattleAPI = HKBattle.create({ HK, CAMP, World: HKWorld, TankAI: window.HKTankAI });
const cfg0 = HK.defaultConfig(); let lookup = null;
const ASSETS = q.get('assets') === '0' ? null : 'assets/';
const tank = new TankView(ASSETS); scene.units.add(tank.group);
const props = [];
let battle = null, teams = [], volleys = null, state = 'title', playing = false, speed = +(q.get('speed') || 1), logShown = 0, capT = -9, capW = 0, ended = false, showLog = store.get('log', true), showPerf = store.get('perf', q.get('perf') === '1');

function newBattle() {
  if (!lookup) lookup = cfg0.hkoi_enabled ? HK.meetLookup(cfg0) : {};
  for (const t of teams) scene.units.remove(t.group); if (volleys) volleys.dispose();
  const pos = tankPos();
  battle = new BattleAPI.Battle({ world, seed: set.seed, cfg: cfg0, lookup, skill: set.skill, cond: set.cond, mission: set.mission, force: FORCES[set.force].force, tank: pos ? { e: pos.e, n: pos.n, hull: pos.h || 0 } : undefined });
  teams = battle.units.map(u => { const t = new TeamView(u.type, ASSETS); scene.units.add(t.group); return t; });
  // enemy transport parked in dead ground behind some of the teams: seen only when the team it belongs to is
  for (const p of props) scene.units.remove(p.view.group); props.length = 0;
  { const T = battle.tank, kinds = ['bmp2', 'uaz', 'bmp2']; let k = 0; for (const u of battle.units) { if (k >= 3 || u.spec.indirect || u.type === 'rpg') continue; const a = Math.atan2(u.e - T.e, u.n - T.n), side = (u.id % 2 ? 1 : -1) * 18;
      for (const back of [70, 95, 50, 120]) { const e = u.e + Math.sin(a) * back + Math.cos(a) * side, n = u.n + Math.cos(a) * back - Math.sin(a) * side; if (!world.inside(e, n) || !world.passable(e, n, true) || world.slope(e, n) > 0.25) continue;
        const view = new PropView(kinds[k++], ASSETS), face = (a * 180 / Math.PI + 180 + (u.id * 37) % 50 - 25 + 360) % 360, hh = face * Math.PI / 180, d = 2, pitch = Math.atan2(world.h(e + Math.sin(hh) * d, n + Math.cos(hh) * d) - world.h(e - Math.sin(hh) * d, n - Math.cos(hh) * d), 2 * d);
        view.place(scene.at(e, n, 0), face, -pitch, 0); scene.units.add(view.group); props.push({ view, u, e, n }); break; } } }
  scene.marks.clear(); scene.fx.n = 0;
  volleys = new VolleyView(scene, battle, scene.fx); volleys.assetBase = ASSETS; volleys.emit = onVolleyEvent; volleys.tankView = tank; logShown = 0; ended = false; simBank = 0; tNow = 0; prevT.e = battle.tank.e; prevT.n = battle.tank.n; prevT.h = battle.tank.h; voiceV = null; voiceHits = 0; shotI = 0; mgI = 0; prevU.length = 0; landing.length = 0; $('log').textContent = ''; $('caption').textContent = '';
  api.battle = battle; place();
}
// the player's chosen start position for this map (none = the default at the map centre)
function tankPos() { const p = set.pos && set.pos[set.biome + ':' + set.map]; return p && world.passable(p.e, p.n, true) ? p : null; }
// ---------------------------------------------------------------- map screen
const mapv = new MapView($('mapcv')); let mapOpen = false, mapFrom = 'title';
function mapState() { const T = battle.tank; return { tank: T, showAll: set.spectator, units: battle.units.map(u => ({ e: u.e, n: u.n, name: `${u.spec.name} #${u.id + 1}`, state: u.state, known: u.known, alive: u.alive })), missiles: state === 'play' ? volleys.info.map(m => ({ e: m.p.x, n: -m.p.z })) : [] }; }
function openMap() { mapOpen = true; mapFrom = state; $('map').hidden = false; mapv.setWorld(world); $('map-place').hidden = $('map-reset').hidden = state !== 'title'; mapv.pickMode = false; $('map').classList.remove('pick'); $('map-place').classList.remove('on'); mapv.fit(); refreshShed(); }
function refreshShed() { const T = battle.tank; mapv.viewshedFor(T.e, T.n); $('map-info').textContent = `${world.biome.name} · map ${set.map} · ${(mapv.shed.share * 100).toFixed(0)}% of the ground within 4.5 km can see the vehicle here`; }
function closeMap() { mapOpen = false; $('map').hidden = true; }
$('map-close').onclick = closeMap; $('map-fit').onclick = () => mapv.fit(); $('o-mapbtn').onclick = () => { ensureWorld(); openMap(); };
$('map-place').onclick = () => { mapv.pickMode = !mapv.pickMode; $('map').classList.toggle('pick', mapv.pickMode); $('map-place').classList.toggle('on', mapv.pickMode); };
$('map-reset').onclick = () => { if (set.pos) delete set.pos[set.biome + ':' + set.map]; store.set('setup', set); newBattle(); refreshShed(); };
mapv.onPick = (e, n) => { if (!world.passable(e, n, true)) { $('map-info').textContent = 'The vehicle cannot stand there (building, dense wood or off the map).'; return; } set.pos = set.pos || {}; set.pos[set.biome + ':' + set.map] = { e: Math.round(e), n: Math.round(n), h: 0 }; store.set('setup', set); newBattle(); refreshShed(); };
function ensureWorld() { if (world.seed !== set.map || world.biomeKey !== set.biome) { world = new HKWorld.World({ seed: set.map, biome: set.biome }); scene.setWorld(world); api.world = world; } if (scene.condition !== set.cond) scene.setCondition(set.cond); setFinish(set.biome, set.cond); }

// ---------------------------------------------------------------- drawing the battle state
const prevU = []; let frameDt = 0;   // where each enemy team was one step ago; the last frame's length
const shown = { e: 0, n: 0, h: 0 };   // where the vehicle is drawn this frame
function place() {
  const T0 = battle.tank, lastV = battle.volleys[battle.volleys.length - 1], inVolley = lastV && tNow >= lastV.t0 && tNow <= lastV.tEnd; let P = T0;
  if (state === 'play' && tNow < battle.t) { if (inVolley) P = battle.tankAt(tNow); else { const f = Math.max(0, Math.min(1, simBank / battle.dt)), dh = ((T0.h - prevT.h + 540) % 360) - 180; if (Math.hypot(T0.e - prevT.e, T0.n - prevT.n) < 3) P = { e: prevT.e + (T0.e - prevT.e) * f, n: prevT.n + (T0.n - prevT.n) * f, h: prevT.h + dh * f }; } }
  const T = { e: P.e, n: P.n, h: P.h }, w = world, d = 2.5, hh = T.h * Math.PI / 180, fe = Math.sin(hh), fn = Math.cos(hh);
  const pitch = Math.atan2(w.h(T.e + fe * d, T.n + fn * d) - w.h(T.e - fe * d, T.n - fn * d), 2 * d), roll = Math.atan2(w.h(T.e + fn * 1.6, T.n - fe * 1.6) - w.h(T.e - fn * 1.6, T.n + fe * 1.6), 3.2);
  tank.place(scene.at(T.e, T.n, 0), T.h, -pitch, roll); scene.setFocus(T.e, T.n); FINISH.ground.value = w.h(T.e, T.n); shown.e = T.e; shown.n = T.n; shown.h = T.h;
  for (const p of props) p.view.group.visible = set.spectator || p.u.known;
  // enemy teams: drawn between simulation steps like the vehicle, facing the way they walk when moving and the vehicle when in position
  const fU = state === 'play' ? Math.max(0, Math.min(1, simBank / battle.dt)) : 1;
  battle.units.forEach((u, i) => { const tv = teams[i]; const show = u.alive && !u.gone && (set.spectator || u.known || u.state === 'guiding' || u.state === 'firing'); tv.group.visible = show && !(cams.mode === 'enemy' && cams.unit === u);   /* looking through a team's own eyes, its figures would only block the picture */ if (!show) return;
    const p = prevU[i], moving = u.state === 'moving' && (u.spd || 0) > 0.2, tw = p && moving && Math.hypot(u.e - p[0], u.n - p[1]) < 1.5, e = tw ? p[0] + (u.e - p[0]) * fU : u.e, n = tw ? p[1] + (u.n - p[1]) * fU : u.n, pos = scene.at(e, n, 0);
    tv.place(pos, moving && u.hdg != null ? u.hdg : Math.atan2(T.e - u.e, T.n - u.n) * 180 / Math.PI); tv.update(frameDt * (state === 'play' && playing ? speed : 0), moving ? (u.gait || 'walk') : u.down ? 'down' : 'still', pos.distanceToSquared(scene.camera.position) < 300 * 300, teamInfo(u)); });
}
// what the drawing of a team needs to know about its weapon: is a round in the launcher (not between firing and the end of reloading), is a spare ready
const _ti = { loaded: true, spare: true, firing: false };
function teamInfo(u) { const busy = u.state === 'guiding' || u.state === 'firing'; _ti.loaded = u.ammo > 0 && !busy && battle.t >= (u.readyAt || 0) - 2 || busy && u.spec.key !== 'rpg'; _ti.spare = u.ammo > 1; _ti.firing = busy; return _ti; }
// markers: what the vehicle's sensors hold (threats cued and tracked, launch sites located); in spectator mode every team, faintly
const marks = $('marks'), pool = [], v3 = new THREE.Vector3();
function mark(i, cls, p, text) { let m = pool[i]; if (!m) { m = el('div', 'mk'); m.append(el('i'), el('span')); marks.append(m); pool.push(m); } v3.copy(p).project(scene.camera); const on = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05; m.hidden = !on; if (!on) return; m.className = 'mk ' + cls; m.style.transform = `translate(${((v3.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v3.y) / 2 * innerHeight).toFixed(1)}px)`; if (m.lastChild.textContent !== text) m.lastChild.textContent = text; }
function drawMarks() {
  let i = 0; if (state === 'play') {
    for (const m of volleys.info) { if (!m.cued && !set.spectator) continue; mark(i++, m.tracked ? 'threat tracked' : m.cued ? 'threat' : 'ghost', m.p, `${m.tt.name || m.th.key}  ${(m.range / 1000).toFixed(2)} km`); }
    battle.units.forEach(u => { if (!u.alive || u.gone) return; if (u.known) mark(i++, 'site', scene.at(u.e, u.n, 1.5, new THREE.Vector3()), `${u.spec.name} located`); else if (set.spectator && cams.mode !== 'enemy' && u !== cams.unit) mark(i++, 'ghost', scene.at(u.e, u.n, 1.5, new THREE.Vector3()), `${u.spec.name} #${u.id + 1} · ${u.state}`); });
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
  const out = !s.alive ? 'lost' : battle.over && quiet ? battle.over.result : (s.teamsLeft === 0 && quiet) ? 'won' : battle.t >= 900 ? 'time' : null; if (!out) return;
  ended = true; setTimeout(() => { if (state !== 'play') return; playing = false; state = 'result';
    $('r-head').innerHTML = out === 'lost' ? 'VEHICLE <em style="color:var(--bad)">DESTROYED</em>' : out === 'won' ? 'AMBUSH <em>DEFEATED</em>' : out === 'objective' ? 'OBJECTIVE <em>REACHED</em>' : out === 'withdrawn' ? 'CONTACT <em style="color:var(--warn)">BROKEN</em>' : 'TIME <em>EXPIRED</em>';
    $('r-sub').textContent = `${world.biome.name}, map ${set.map}, ${CONDITIONS[set.cond].name.toLowerCase()} · ${FORCES[set.force].name}, ${set.skill} crews · ${Math.floor(battle.t / 60)} min ${Math.floor(battle.t % 60)} s`;
    const tb = $('r-table'); tb.textContent = ''; const NAMES = { HIT: 'Hit the vehicle', aps: 'Stopped by Trophy', hkoi_obs: 'Guidance cut by HKOI cloud', hkoi_cut: 'Guidance cut by HKOI cloud', counter_fire: 'Gunner driven off his missile by machine-gun fire', suppressed_aim: 'Missed: gunner\'s aim shaken by machine-gun fire', hkoi_he: 'Shot down by HKOI', terrain_mask: 'Lost behind terrain or cover', gunner_jitter: 'Enemy gunner missed', unguided_miss: 'Unguided miss', jammer: 'Jammed' };
    const rows = [['Enemy volleys', s.volleys], ['Missiles and drones launched', s.fired]].concat(Object.entries(s.by).sort((a, b) => b[1] - a[1]).map(([k, n]) => ['· ' + (NAMES[k] || k.replace(/_/g, ' ')), n])).concat([['HKOI rounds used', `${cfg0.rnd ? '' : ''}${150 - s.obs} obscurant, ${150 - s.he} HE`], ['Trophy charges left', `${s.apsL} left, ${s.apsR} right`], ['Crew', Object.entries(s.crew || {}).map(([k, x]) => `${k.toUpperCase()} ${x}`).join('  ')], ['Enemy teams destroyed by return fire', s.killedByTank], ['Enemy teams knocked out by machine guns', s.killedByMg], ['Main gun rounds left (of 10 multi-purpose)', s.main], ['Enemy teams still able to fire', s.teamsLeft]]);
    for (const [a, b] of rows) { const tr = el('tr'); tr.append(el('td', null, a), el('td', null, String(b))); tb.append(tr); }
    show(); }, out === 'lost' ? 5000 : 2500);
}

// ---------------------------------------------------------------- screens and controls
function show() { if (state !== 'play') { $('crew').hidden = true; $('esight').hidden = true; $('units').hidden = true; } $('title').hidden = state !== 'title'; $('result').hidden = state !== 'result'; const p = state === 'play'; $('status').hidden = !p; $('bar').hidden = !p; $('log').hidden = !(p && showLog); hud.hidden = !showPerf; if (!p) $('caption').textContent = ''; }
function seg(id, items, key, after) { const box = $(id); box.textContent = ''; for (const [v, name] of items) { const b = el('button', 'btn' + (set[key] === v ? ' on' : ''), name); b.onclick = () => { set[key] = v; store.set('setup', set); seg(id, items, key, after); if (after) after(); }; box.append(b); } }
function note() { $('o-note').textContent = FORCES[set.force].note + '. ' + (set.spectator ? 'Spectator: every enemy team is shown and you can look through their sights.' : 'Fog of war: you see only what the vehicle\'s sensors and crew have found.'); }
function buildTitle() {
  $('ver').textContent = VERSION;
  seg('o-biome', BIOMES, 'biome', preview); seg('o-cond', Object.entries(CONDITIONS).map(([k, c]) => [k, c.name]), 'cond', preview); seg('o-force', Object.entries(FORCES).map(([k, f]) => [k, f.name]), 'force', note); seg('o-skill', SKILLS, 'skill'); seg('o-mission', MISSIONS, 'mission'); seg('o-spec', [[false, 'Fog of war'], [true, 'Spectator']], 'spectator', note); seg('o-gfx', Object.entries(QUALITY).sort((a, b) => (b[1].auto ? 1 : 0) - (a[1].auto ? 1 : 0)).map(([k, v]) => [k, v.name]), 'gfx', () => scene.setQuality(set.gfx));
  $('o-map').value = set.map; $('o-map').onchange = () => { set.map = Math.max(1, Math.min(9999, Math.round(+$('o-map').value || 1))); store.set('setup', set); preview(); };
  $('o-rand').onclick = () => { set.map = 1 + Math.floor(Math.random() * 9999); $('o-map').value = set.map; store.set('setup', set); preview(); };
  $('go').onclick = start; note();
  if (scene.software) { const w = el('div', null, 'Warning: this browser is drawing without your graphics card ("' + scene.gpu() + '"), so it will be very slow. Turn on hardware acceleration in the browser settings, or open the link in Chrome or Edge directly.'); w.style.cssText = 'margin-top:14px;color:#ffb347;font-size:13px'; document.querySelector('#title .card').append(w); }
}
let previewTimer = 0; function preview() { clearTimeout(previewTimer); previewTimer = setTimeout(() => { ensureWorld(); newBattle(); }, 60); }
function start() { sound.start(); sound.loadVoices(ASSETS); ensureWorld(); newBattle(); state = 'play'; playing = true; cams.set(store.get('cam', 'orbit')); if (cams.mode === 'orbit') { const T = battle.tank; scene.camera.position.copy(scene.at(T.e - 26, T.n - 34, 13)); } buildBar(); show(); }
function buildBar() {
  const bar = $('bar'); bar.textContent = ''; const grp = () => { const g = el('div', 'grp'); bar.append(g); return g; };
  let g = grp(); const pp = el('button', 'btn', playing ? 'Pause' : 'Play'); pp.onclick = () => { playing = !playing; buildBar(); }; g.append(pp);
  for (const s of [0.25, 1, 2, 4]) { const b = el('button', 'btn' + (speed === s ? ' on' : ''), s === 0.25 ? '¼×' : s + '×'); b.title = 'Time rate'; b.onclick = () => { speed = s; buildBar(); }; g.append(b); }
  g = grp(); for (const m of CAMERA_MODES) { if (m.spectator && !set.spectator) continue; const b = el('button', 'btn' + (m.spectator ? ' spec' : '') + (cams.mode === m.key ? ' on' : ''), m.name); b.title = m.hint; b.onclick = () => { cams.set(m.key); store.set('cam', m.spectator ? 'orbit' : m.key); buildBar(); }; g.append(b); }
  g = grp(); const sp = el('button', 'btn spec' + (set.spectator ? ' on' : ''), 'Spectator'); sp.title = 'Show every enemy team and allow enemy views'; sp.onclick = () => { set.spectator = !set.spectator; if (!set.spectator && (cams.mode === 'enemy' || cams.mode === 'troops' || cams.mode === 'missile')) cams.set('orbit'); store.set('setup', set); buildBar(); }; g.append(sp);
  const mp = el('button', 'btn', 'Map'); mp.title = 'Topographic map (M)'; mp.onclick = openMap; g.append(mp);
  const sd = el('button', 'btn' + (sound.on ? ' on' : ''), 'Sound'); sd.onclick = () => { sound.start(); sound.setOn(!sound.on); store.set('sound', sound.on); buildBar(); }; g.append(sd);
  const lg = el('button', 'btn' + (showLog ? ' on' : ''), 'Log'); lg.onclick = () => { showLog = !showLog; store.set('log', showLog); buildBar(); show(); }; g.append(lg);
  const pf = el('button', 'btn' + (showPerf ? ' on' : ''), 'FPS'); pf.title = 'Frame rate and scene load'; pf.onclick = () => { showPerf = !showPerf; store.set('perf', showPerf); buildBar(); show(); }; g.append(pf);
  const mn = el('button', 'btn', 'Menu'); mn.onclick = () => { state = 'title'; playing = false; cams.set('orbit'); show(); }; g.append(mn);
}
$('r-again').onclick = start; $('r-next').onclick = () => { set.seed++; store.set('setup', set); start(); }; $('r-menu').onclick = () => { state = 'title'; cams.set('orbit'); show(); };
window.addEventListener('keydown', e => { if (state !== 'play' || e.target.tagName === 'INPUT') return; if (e.code === 'KeyM') { mapOpen ? closeMap() : openMap(); } if (e.code === 'Space') { playing = !playing; buildBar(); e.preventDefault(); } if (e.key === '[' || e.key === ']') { if (cams.mode === 'enemy' || cams.mode === 'troops') cams.cycle(battle.units, e.key === ']' ? 1 : -1); } const n = '12345678'.indexOf(e.key); if (n >= 0) { const m = CAMERA_MODES[n]; if (!m.spectator || set.spectator) { cams.set(m.key); buildBar(); } } });

// crew talk: each volley's record carries the lines the crew spoke and when; play them as their moment comes.
// From an enemy sight the crew cannot be heard; the enemy team's own calls are heard instead.
let voiceV = null, voiceI = 0, voiceHits = 0;
function voices() {
  const v = battle.volleys[battle.volleys.length - 1]; if (!v || !v.rec || !v.rec.radio) return; if (v !== voiceV) { voiceV = v; voiceI = 0; v.rec.radio.sort((a, b) => a.t - b.t); }
  const R = v.rec.radio, tv = battle.t - v.t0, enemyView = cams.mode === 'enemy' || cams.mode === 'troops' || cams.mode === 'missile';
  while (voiceI < R.length && R[voiceI].t <= tv) { const r = R[voiceI++]; if (tv - r.t > 1.2 || enemyView) continue; sound.say(r.who, [r.text], r.lvl || 0); }   /* the engine has already chosen the wording for the crew's stress at that moment */
}
function voiceEvent(type, o) { const enemyView = cams.mode === 'enemy' || cams.mode === 'troops' || cams.mode === 'missile';
  if (enemyView) { if (type === 'launch') sound.enemy(o.drone ? 'dlaunch' : 'fire', 0.15); else if (type === 'hit') sound.enemy(o.killing ? 'kill' : 'hit', 0.8); else if (type === 'pass' || type === 'explosion') sound.enemy('miss', 1.0); else if (type === 'airburst' && o.size >= 1) sound.enemy('lost', 0.8); return; }
  if (type === 'hit') { voiceHits++; if (o.killing) { sound.scream('scream', 0.25); sound.scream('scream', 0.9, 0.7); } else { sound.react('CDR', 'hit', 0.5); sound.react(['GNR', 'LDR', 'DRV'][voiceHits % 3], 'panic', 2.2); } } }
// the vehicle's own main gun: flash, dust and report at the muzzle, then the round arriving
let shotI = 0; const landing = [];
// machine-gun bursts: tracers from the coax and the commander's .50 to the target, strikes kicking up dust there, and the sound
let mgI = 0, mgAcc = { coax: 0, m2: 0, dust: 0 }; const mgV = new THREE.Vector3(), mgW = new THREE.Vector3();
function machineGuns(dt) {
  const L = battle.mgs || []; if (!(state === 'play' && playing)) return; while (mgI < L.length && battle.t > L[mgI].t + L[mgI].dur) mgI++;
  const sdt = dt * speed, quiet = speed > 2.01;
  for (let i = mgI; i < L.length && i < mgI + 6; i++) {   /* every burst going on right now: each gun has its own target */
    const b = L[i]; if (battle.t < b.t || battle.t > b.t + b.dur) continue; const key = b.w || (b.coax ? 'coax' : 'm2'), heavy = key === 'm2', rate = heavy ? 8 : 12, tgt = scene.at(b.e, b.n, 0.5, mgW);
    mgAcc[key] = (mgAcc[key] || 0) + sdt * rate; let n = Math.floor(mgAcc[key]); mgAcc[key] -= n; n = Math.min(n, 4);
    const m = tank.mgMuzzle(key, mgV) || scene.at(shown.e, shown.n, 2.6, mgV);
    for (let k = 0; k < n; k++) { if (!quiet) sound.mg(camDist(m), heavy); scene.fx.flash(m.x, m.y, m.z, heavy ? 0.35 : 0.22);
      if (Math.random() < (heavy ? 0.5 : 0.25)) { const dx = tgt.x - m.x + (Math.random() - 0.5) * b.R * 0.012, dy = tgt.y - m.y + (Math.random() - 0.5) * b.R * 0.006, dz = tgt.z - m.z + (Math.random() - 0.5) * b.R * 0.012, d = Math.hypot(dx, dy, dz), v = heavy ? 880 : 840; scene.fx.add({ x: m.x, y: m.y, z: m.z, vx: dx / d * v, vy: dy / d * v, vz: dz / d * v, size: heavy ? 0.5 : 0.36, life: d / v, r: 1, g: 0.42, b: 0.16, a: 1, glow: 1, drag: 0 }); } }
    mgAcc.dust = (mgAcc.dust || 0) + sdt * 3; while (mgAcc.dust >= 1) { mgAcc.dust -= 1; scene.fx.dust(tgt.x + (Math.random() - 0.5) * 5, tgt.y, tgt.z + (Math.random() - 0.5) * 5, 0.5); } }
}
// what the crew is doing, one line per crewman or weapon (refreshed a few times a second)
let crewT = 0, crewSig = '';
function drawCrew(dt) { const box = $('crew'), on = state === 'play' && !mapOpen && cams.mode !== 'gnr' && cams.mode !== 'enemy'; if (box.hidden === on) box.hidden = !on; if (!on || !battle.tankStatus) return; crewT -= dt; if (crewT > 0) return; crewT = 0.3;
  const rows = battle.tankStatus(), sig = rows.map(r => r.join(':')).join('|'); if (sig === crewSig) return; crewSig = sig; box.textContent = ''; for (const [who, text] of rows) { const d = el('div'); d.append(el('b', null, who), text); box.append(d); } }
function trackDust(dt) { const T = battle.tank; if (!(state === 'play' && playing) || !T.alive || Math.abs(T.v || 0) < 1.2 || Math.random() > dt * 14 * Math.min(1, Math.abs(T.v) / 6)) return; const h = shown.h * Math.PI / 180, side = Math.random() < 0.5 ? 1.5 : -1.5, p = scene.at(shown.e - Math.sin(h) * 3.6 + Math.cos(h) * side, shown.n - Math.cos(h) * 3.6 - Math.sin(h) * side, 0.2); scene.fx.dust(p.x, p.y, p.z, set.cond === 'rain' || set.cond === 'snow' ? 0.35 : 1); }
function mainGun() {
  const S = battle.shots || []; const live = state === 'play' && playing;
  while (shotI < S.length && S[shotI].t <= battle.t) { const sh = S[shotI++]; if (battle.t - sh.t > 2) continue; const T = battle.tank, a = Math.atan2(sh.to.e - sh.from.e, sh.to.n - sh.from.n), m = scene.at(T.e + Math.sin(a) * 6.5, T.n + Math.cos(a) * 6.5, 2.3);
    scene.fx.flash(m.x, m.y, m.z, 3.2); scene.fx.backblast(m.x, m.y, m.z, -Math.sin(a), Math.cos(a), 1.6); const g = scene.at(T.e, T.n, 0.3); scene.fx.dust(g.x, g.y, g.z, 3.5); scene.blast(m, 1.4, false); tank.kick(); if (live && speed <= 2.01) { sound.gun120(camDist(m)); sound.say('CDR', ['Fire!'], 1); } landing.push(sh); }
  for (let i = landing.length - 1; i >= 0; i--) { const sh = landing[i]; if (battle.t < sh.t + sh.tof) continue; landing.splice(i, 1); const p = scene.at(sh.to.e, sh.to.n, 0.4); scene.fx.explosion(p.x, p.y, p.z, 1.5); scene.blast(p, 1.4); if (live && speed <= 2.01) { sound.explosion(camDist(p), 1.5); if (sh.hit) sound.say('CDR', ['Target! Cease fire!'], 1); } }
}
// Simulated time. The battle moves in fixed steps of battle.dt (0.1 s); frames come far more often than that, so time is banked
// and a step is taken only when a full step's worth has built up. What is drawn sits between steps (tNow) so motion stays smooth.
let simBank = 0, tNow = 0; const prevT = { e: 0, n: 0, h: 0 };   // where the vehicle was one step ago, to draw it between steps
function advance(sec) {
  simBank = Math.min(Math.max(0, simBank) + Math.max(0, sec), 1.5); let n = 0;
  while (simBank >= battle.dt && n++ < 20) { const T = battle.tank; prevT.e = T.e; prevT.n = T.n; prevT.h = T.h; for (let i = 0; i < battle.units.length; i++) { const u = battle.units[i], q = prevU[i] || (prevU[i] = [0, 0]); q[0] = u.e; q[1] = u.n; } battle.step(); if (battle._pending) break; simBank -= battle.dt; }   // a volley half worked out is finished next frame
  tNow = Math.max(0, battle.t - battle.dt + Math.min(simBank, battle.dt));
}
// ---------------------------------------------------------------- the frame
let simMs = 0, cpuMs = 0, last = performance.now(), frames = 0, fps = 0, fpsT = last, worst = 0, slow = 0, titleA = 0;
function ctx() { const T = shown, m = volleys.info; let brg = null; if (m.length) { const c = m.filter(x => x.cued); if (c.length) brg = c.sort((a, b) => a.range - b.range)[0].brg; } const rf = battle._rf, fl = landing[landing.length - 1], mg = battle._mg && battle.t < battle._mg.t + battle._mg.dur + 1.5 ? battle._mg : null, aim = rf ? rf.k : fl ? fl.to : mg ? mg : null; return { tank: T, units: battle.units, missiles: m, threatBrg: brg, aim, unitPos }; }
const unitPos = u => teams[battle.units.indexOf(u)].group.position;   /* where the team is drawn this frame (smoothed between simulation steps) */
const enemyViews = new EnemyViews(u => cams.choose(u));
// One bad frame must never freeze the whole simulator: an error is shown on screen (so it can be reported) and the loop carries on.
let frameErrs = 0;
function frame(now) {
  try { frameBody(now); } catch (e) { frameErrs++; console.error(e); const c = $('errbar'); c.hidden = false; c.textContent = `Something went wrong inside the simulator (${frameErrs}×). Please send this line to Claude: ${e && e.message} ${String(e && e.stack || '').split('\n').slice(1, 3).map(x => x.trim().replace(/https?:\/\/[^ )]*\//g, '')).join(' < ')}`; }
  requestAnimationFrame(frame);
}
function frameBody(now) {
  const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.1, raw); last = now; scene.rawMs = raw * 1000;   /* raw is never negative: the first frame's clock can read earlier than the page's */ worst = Math.max(worst, raw * 1000); if (raw > 0.05) slow++;
  frameDt = dt;
  const tSim = performance.now(), tCpu = tSim;
  if (state === 'play' && playing && !(!battle.tank.alive && ended && battle.t > battle.volleys[battle.volleys.length - 1].tEnd + 8)) advance(dt * speed);
  if (state !== 'play') tNow = battle.t; place(); volleys.update(Math.min(tNow, battle.t), dt * (state === 'play' && playing ? speed : 0)); mainGun(); machineGuns(dt); trackDust(dt); { const c = ctx(), b = c.aim ? Math.atan2(c.aim.e - shown.e, c.aim.n - shown.n) * 180 / Math.PI : c.threatBrg != null ? c.threatBrg : shown.h; const sdt = state === 'play' && playing ? dt * speed : dt; tank.aim(b, shown.h, sdt); tank.animate(state === 'play' && playing ? dt * speed : 0, battle.tank.v); tank.aimStation(volleys.aimAt, sdt); } simMs = Math.max(simMs * 0.98, performance.now() - tSim);
  { const on = state === 'play' && cams.mode === 'gnr' && !mapOpen, sg = $('sight'); if (sg.hidden === on) sg.hidden = !on; tank.group.visible = !on;   /* the sight looks out from the turret roof: the vehicle's own model would only block it */
    if (on) { const rf = battle._rf, fl = landing[landing.length - 1], T = battle.tank, R = rf ? rf.R : fl ? Math.hypot(fl.to.e - fl.from.e, fl.to.n - fl.from.n) : null, wait = rf ? Math.max(0, rf.at - battle.t) : 0;
      const line = rf ? (cams.onTarget ? (wait > 1.2 ? 'LASING' : 'ON THE WAY IN ' + wait.toFixed(1)) : 'TRAVERSING') : fl ? 'ROUND IN FLIGHT' : battle.t < (T.mainReady || 0) ? 'LOADING' : 'SCANNING';
      const txt = `${R ? 'RNG ' + String(Math.round(R / 10) * 10).padStart(4, '0') : 'RNG ----'}   MPAT   ${String(T.main).padStart(2, '0')} RDS\n${line}`; if ($('sight-data').textContent !== txt) $('sight-data').textContent = txt; const sym = (cams.gYaw == null ? 0 : Math.round(cams.gYaw)).toString().padStart(3, '0') + '°   ' + (scene.camera.fov < 10 ? '10×' : '3×'); if ($('sight-sym').textContent !== sym) $('sight-sym').textContent = sym; } }
  drawCrew(dt);
  if (state === 'play') { cams.update(dt, ctx()); { const ev = !mapOpen && set.spectator; enemyViews.update({ sightOn: ev && cams.mode === 'enemy' && !!cams.unit, menuOn: ev && (cams.mode === 'enemy' || cams.mode === 'troops'), cams, battle, tank: shown, world, dt }); } drawLog(); checkEnd(); if (performance.now() - capT > 5200) $('caption').style.opacity = 0; }
  else { /* slow turn around the vehicle behind the menus */ titleA += dt * 0.05; const T = battle.tank, r = 60; scene.camera.up.set(0, 1, 0); scene.camera.fov = 45; scene.camera.updateProjectionMatrix(); scene.camera.position.copy(scene.at(T.e + Math.sin(titleA) * r, T.n + Math.cos(titleA) * r, 0)); scene.camera.position.y = Math.max(scene.camera.position.y + 3, world.h(T.e, T.n) + 16); scene.camera.lookAt(scene.at(T.e, T.n, 2)); }
  if (sound.ctx && state === 'play' && playing && speed <= 2.01) voices();
  if (sound.ctx) { const T = battle.tank, tp = scene.at(T.e, T.n, 2), act = state === 'play' && playing; sound.update(dt, { inside: cams.mode === 'cdr' || cams.mode === 'gnr', cond: set.cond, speed: act ? T.v : 0, alive: T.alive && state === 'play', camDist: camDist(tp), drones: act ? volleys.info.filter(m => m.drone).map(m => ({ id: m.th.idx + ':' + m.th.t0, d: camDist(m.p), closing: cams.mode === 'cdr' || cams.mode === 'chase' || cams.mode === 'orbit' ? 25 : 0 })) : [] }); }
  if (mapOpen) { mapv.draw(mapState()); if (state === 'play') { drawLog(); } } else { scene.render(dt); drawMarks(); }
  cpuMs = Math.max(cpuMs * 0.97, performance.now() - tCpu);
  frames++; if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; if (state === 'play') drawStatus();
    if (showPerf) { const s = scene.stats(); hud.textContent = `${fps} fps   worst frame ${worst.toFixed(0)} ms   slow frames ${slow}\n${QUALITY[s.quality].name} graphics   ${Math.round(canvas.width)}×${Math.round(canvas.height)} (${Math.round(s.scale * 100)}% scale)\nsim ${simMs.toFixed(1)} ms   whole frame on the processor ${cpuMs.toFixed(1)} ms\nModels: tank ${tank.loaded ? (tank.variant || 'M1A2 SEPv2') : tank.failed ? 'FAILED (boxes)' : 'loading'}, enemy teams ${teams.filter(t => t.loaded).length}/${teams.length}, vehicles ${props.filter(p => p.view.loaded).length}/${props.length}\nGraphics chip: ${scene.gpu()}${scene.software ? '   << SOFTWARE DRAWING: the graphics card is not being used' : ''}\n${s.calls} draw calls   ${(s.triangles / 1e6).toFixed(2)} M triangles\n${s.trees} trees   ${s.buildings} buildings   particles ${scene.fx.n}`; } worst = 0; slow = 0; }
}
window.addEventListener('resize', () => scene.resize());
const api = window.__beta = { props, prof(n = 30) { const T = {}, tm = (k, f) => { const a = performance.now(); for (let i = 0; i < n; i++) f(); T[k] = +((performance.now() - a) / n).toFixed(3); }; tm('step', () => battle.step()); tm('place', place); tm('volleys', () => volleys.update(battle.t, 0.016)); tm('cams', () => cams.update(0.016, ctx())); tm('log', drawLog); tm('end', () => { const e = ended; checkEnd(); ended = e; }); tm('sound', () => sound.ctx && sound.update(0.016, { drones: [] })); tm('marks', drawMarks); tm('status', drawStatus); tm('fx', () => scene.fx.update(0.016, scene.wind)); tm('trees', () => scene.trees.userData.update(scene.camera.position)); tm('matrices', () => scene.scene.updateMatrixWorld()); let nodes = 0; scene.scene.traverse(() => nodes++); T.nodes = nodes; T.logLen = battle.log.length; return T; }, bank: () => [simBank, tNow, battle === api.battle, battle.t], advance, sound, teams: () => teams, openMap, mapv, world, scene, battle: null, THREE, tank, cams, set, ready: false, start, setPlaying(v) { playing = v; }, state: () => state,
  runTo(t) { while (battle.t < t && battle.tank.alive) battle.step(); tNow = battle.t; place(); }, playFor(sec) { const n = Math.round(sec / battle.dt); for (let i = 0; i < n; i++) { battle.step(); if (battle._pending) battle.step(); tNow = battle.t; place(); volleys.update(battle.t, battle.dt); scene.fx.update(battle.dt); } },
  near(dist, height, brg) { const T = battle.tank, a = (brg || 200) * Math.PI / 180; this.view(T.e + Math.sin(a) * dist, T.n + Math.cos(a) * dist, 0, height, T.e, T.n); },
  view(e, n, dist, height, lookE, lookN) { cams.mode = 'free'; scene.controls.enabled = false; scene.camera.up.set(0, 1, 0); scene.camera.position.set(e, world.h(e, n) + height, -n); scene.camera.lookAt(lookE, world.h(lookE, lookN) + 2, -lookN); } };
setFinish(set.biome, set.cond); buildTitle(); newBattle(); if (q.get('play') === '1') start(); else { state = 'title'; show(); }
api.ready = true; $('veil').hidden = true; requestAnimationFrame(frame);
