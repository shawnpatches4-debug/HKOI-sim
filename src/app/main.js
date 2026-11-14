// Beta entry point: title and setup, the battle loop, cameras, the on-screen information and the result screen.
import * as THREE from 'three';
import { Scene3D, CONDITIONS, QUALITY } from '../render/scene3d.js';
import { TankView, TeamView, PropView } from '../render/units.js';
import { Vehicles } from '../render/vehicles.js';
import { VolleyView } from '../render/volleyview.js';
import { Cameras, CAMERA_MODES } from '../render/cameras.js';
import { Interior } from '../render/interior.js';
import { EnemyViews } from './enemyviews.js';
import { initPages } from './pages.js';
import { Director } from './director.js';
import { XRayPanel } from './xraypanel.js';
import { MapView } from './mapview.js';
import { Hud } from './hud.js';
import { TitleShow } from './title.js';
import { Faces } from './faces.js';
import { Sound } from '../audio/sound.js';
import { FINISH, setFinish } from '../render/env.js';

const VERSION = '0.90';
const $ = id => document.getElementById(id), el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const q = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
const store = { get(k, d) { try { const v = localStorage.getItem('hkoi.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('hkoi.' + k, JSON.stringify(v)); } catch (e) { } } };

const BIOMES = [['farmland', 'Farmland'], ['desert', 'Desert'], ['town', 'Town edge'], ['forest', 'Forest and hills']];
const FORCES = {
  light: { name: 'Light ambush', note: 'Two wire-guided launchers and an RPG team', force: [{ type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  ambush: { name: 'Missile ambush', note: 'Two Kornet, two Konkurs, one RPG team', force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  drones: { name: 'Drone hunt', note: 'Two radio FPV crews, one fibre FPV crew, one Kornet', force: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }] },
  standoff: { name: 'Stand-off raid', note: 'The old simulator\'s kind of raid: three launchers from 2 km or more, firing over about 6 seconds', force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], raid: { minR: 2000, window: 6 } },
  heavy: { name: 'Prepared defence', note: 'Three Kornet, two Konkurs, a laser designator, two FPV crews, two RPG teams', force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] },
};
if (typeof HKEnemyVeh !== 'undefined') Object.assign(FORCES, HKEnemyVeh.FORCES);   /* enemy vehicles: mechanised ambush, armoured counter-attack, sprawling defence */
const MISSIONS = [['hold', 'Hold a position'], ['advance', 'Advance to an objective'], ['hunt', 'Hunt the ambush']];
const LENGTHS = [[1, 'One ambush'], [3, 'Three waves'], [5, 'Long fight, five waves']];
const SKILLS = [['green', 'Green'], ['trained', 'Trained'], ['expert', 'Expert'], ['veteran', 'Veteran']];
const set = Object.assign({ biome: 'farmland', cond: 'day', force: 'ambush', skill: 'trained', map: 3, spectator: false, seed: 1, gfx: 'auto', mission: 'hold', waves: 3, crew: 'trained', stress: true, figures: true, armour: false }, store.get('setup', {}));
if (q.get('waves')) set.waves = +q.get('waves') || 1;
for (const k of ['biome', 'cond', 'force', 'skill', 'gfx', 'mission']) if (q.get(k)) set[k] = q.get(k);
if (q.get('owncrew')) set.crew = q.get('owncrew');   /* (the hash word crew=1 belongs to the interior's trial figures) */
if (q.get('stress')) set.stress = q.get('stress') !== '0';
if (q.get('map')) set.map = +q.get('map'); if (q.get('seed')) set.seed = +q.get('seed'); if (q.get('spectator')) set.spectator = q.get('spectator') === '1';

const canvas = $('view'), hud = $('hud');
const sound = new Sound(); sound.on = store.get('sound', true);
const camDist = p => scene.camera.position.distanceTo(p);
function onVolleyEvent(type, p, o) { if (!sound.ctx || speed > 2.01 || state !== 'play') return;   /* the battle behind the title screen is silent */ voiceEvent(type, o); const d = camDist(p); if (type === 'gun') sound.gun30(d); else if (type === 'explosion') sound.explosion(d, o.size); else if (type === 'airburst') sound.airburst(d, o.size); else if (type === 'aps') sound.aps(d); else if (type === 'launch') sound.launch(d, o.big); else if (type === 'pass') sound.whoosh(0.5, Math.min(0.6, 30 / (30 + d))); else if (type === 'hit') { sound.explosion(d, o.killing ? 2.2 : 1.4); if (cams.mode === 'cdr' || cams.mode === 'gnr' || interior.inside || d < 25) sound.hit(o.killing); } }   /* a hit heard from any seat inside (interior.inside) */
let world = new HKWorld.World({ seed: set.map, biome: set.biome });
const scene = new Scene3D(canvas, world, { condition: set.cond, quality: set.gfx });
const cams = new Cameras(scene);
const BattleAPI = HKBattle.create({ HK, CAMP, World: HKWorld, TankAI: window.HKTankAI });
const cfg0 = HK.defaultConfig(); let lookup = null;
const ASSETS = q.get('assets') === '0' ? null : 'assets/';
const tank = new TankView(ASSETS); tank.group.userData.heat = 0.5; scene.units.add(tank.group);
const interior = new Interior(scene, tank, cams);   // turret and hull interior with the crew seats: in the scene only while an inside or cutaway view is on
const props = [];
const vehicles = new Vehicles(scene, ASSETS);   /* enemy vehicles (UAZ, BMP-2, tanks): drawn from battle.vehicles(), nothing if the battle has none */
let battle = null, teams = [], volleys = null, state = 'title', playing = false, speed = +(q.get('speed') || 1), logShown = 0, capT = -9, capW = 0, ended = false, logOpen = false, logFilter = 'all', showPerf = store.get('perf', q.get('perf') === '1');

// ---------------------------------------------------------------- the display and the title screen's own state
// Two displays, remembered: 'simple' (almost nothing on screen) and 'engineer' (everything). Key H or the bar's button switches.
let hudMode = q.get('hud') === 'engineer' || q.get('hud') === 'simple' ? q.get('hud') : store.get('hud', 'engineer');   /* engineer is the default; a stored choice is respected */
const faces = q.get('faces') === '0' || !ASSETS ? null : new Faces(ASSETS);   // crew portraits (the supplied crew models); faces=0 in the address switches them off
const hudBox = new Hud($, el, store, faces);
const SEATV = { in_cdr: 1, in_gnr: 1, in_ldr: 1, in_drv: 1, cut: 1 };   // views in which the display gets out of the way of the interior
const SIGHTV = { gnr: 1, citv: 1, hkoi: 1, enemy: 1, troops: 1 };       // views through a sight, or with the enemy team menu on the left: no boxes at the left
let setupOpen = false, pagesOpen = false, pagesFrom = 'title', lastOutside = 'orbit', barOpen = false, lastMode = '';
// The battle behind the title screen. It is a real battle with the current setup, on its own seeds, fought at normal speed and
// started again a few seconds after it ends. On Minimum graphics, or when the browser draws without a graphics card, it is a
// still picture instead (the hash parameter demo=1 forces it on, demo=0 off).
const demo = { seed: 0, endT: 0, chk: 0, done: false, forced: q.get('demo'), manual: false };
const demoLive = () => state === 'title' && !mapOpen && !pagesOpen && (demo.manual || demo.forced === '1' || demo.forced !== '0' && scene.quality !== 'min' && !scene.software);
const simRate = () => state === 'play' ? (playing ? speed : 0) : demoLive() ? 1 : 0;   // how fast simulated time runs right now
const seeAll = () => set.spectator || state === 'title';                               // behind the title every team is shown
// the tank's own crew: its level and whether stress acts on it. Ladder raids always use a trained crew with stress on, so scores compare.
function crewOf() { return set.custom && set.custom.rung ? { quality: 'trained', stress: true } : { quality: SKILLS.some(x => x[0] === set.crew) ? set.crew : 'trained', stress: set.stress !== false }; }
function battleOpts(seed) { const pos = tankPos(), F = forceOf(), c = crewOf(); return { world, seed, cfg: cfg0, lookup, skill: set.skill, cond: set.cond, mission: set.mission, waves: set.waves, commander: 'auto', raid: F.raid, force: F.force, crewQuality: c.quality, crewStress: c.stress, armour: !!set.armour, tank: pos ? { e: pos.e, n: pos.n, hull: pos.h || 0 } : undefined }; }


function newBattle(seed = set.seed) {
  if (!lookup) lookup = cfg0.hkoi_enabled ? HK.meetLookup(cfg0) : {};
  for (const t of teams) scene.units.remove(t.group); if (volleys) volleys.dispose();
  battle = new BattleAPI.Battle(battleOpts(seed));
  teams = battle.units.map(u => { const t = new TeamView(u.type, ASSETS); t.group.userData.heat = 0.9; scene.units.add(t.group); return t; });   /* heat: how warm it looks in a thermal sight (men are the warmest things out there) */
  // enemy transport parked in dead ground behind some of the teams: seen only when the team it belongs to is
  for (const p of props) scene.units.remove(p.view.group); props.length = 0;
  { const T = battle.tank, kinds = ['bmp2', 'uaz', 'bmp2']; let k = 0; for (const u of battle.units) { if (k >= 3 || u.spec.indirect || u.type === 'rpg') continue; const a = Math.atan2(u.e - T.e, u.n - T.n), side = (u.id % 2 ? 1 : -1) * 18;
      for (const back of [70, 95, 50, 120]) { const e = u.e + Math.sin(a) * back + Math.cos(a) * side, n = u.n + Math.cos(a) * back - Math.sin(a) * side; if (!world.inside(e, n) || !world.passable(e, n, true) || world.slope(e, n) > 0.25) continue;
        const view = new PropView(kinds[k++], ASSETS), face = (a * 180 / Math.PI + 180 + (u.id * 37) % 50 - 25 + 360) % 360, hh = face * Math.PI / 180, d = 2, pitch = Math.atan2(world.h(e + Math.sin(hh) * d, n + Math.cos(hh) * d) - world.h(e - Math.sin(hh) * d, n - Math.cos(hh) * d), 2 * d);
        view.place(scene.at(e, n, 0), face, -pitch, 0); view.group.userData.heat = 0.3; scene.units.add(view.group); props.push({ view, u, e, n }); break; } } }
  scene.marks.clear(); scene.fx.n = 0;
  volleys = new VolleyView(scene, battle, scene.fx); volleys.assetBase = ASSETS; volleys.emit = onVolleyEvent; volleys.tankView = tank; logShown = 0; ended = false; simBank = 0; tNow = 0; prevT.e = battle.tank.e; prevT.n = battle.tank.n; prevT.h = battle.tank.h; voiceV = null; voiceHits = 0; shotI = 0; mgI = 0; prevU.length = 0; landing.length = 0; $('log').textContent = ''; $('ticker').textContent = ''; $('caption').textContent = '';
  api.battle = battle; hudBox.reset(battle, sound); place();
}
// the player's chosen start position for this map (none = the default at the map centre)
// ---------------------------------------------------------------- replay
// A battle is fully decided by its settings and seed, so a replay is the same battle run again: nothing is recorded. Jumping back in time
// means starting it over and running forward (without drawing) to the moment asked for; that takes a fraction of a second.
let replay = null;   // { T: length in seconds, ev: [{ t, text, k }], specWas }
function rewind() {
  battle = new BattleAPI.Battle(battleOpts(set.seed));
  if (volleys) volleys.dispose(); scene.marks.clear(); scene.fx.n = 0;
  volleys = new VolleyView(scene, battle, scene.fx); volleys.assetBase = ASSETS; volleys.emit = onVolleyEvent; volleys.tankView = tank; logShown = 0; simBank = 0; tNow = 0; prevT.e = battle.tank.e; prevT.n = battle.tank.n; prevT.h = battle.tank.h; voiceV = null; voiceHits = 0; shotI = 0; mgI = 0; prevU.length = 0; landing.length = 0; $('log').textContent = ''; $('ticker').textContent = ''; $('caption').textContent = '';
  props.forEach((p, i) => { p.u = battle.units.find(u => u.id === p.u.id) || p.u; }); api.battle = battle; hudBox.reset(battle, sound);
}
function runQuiet(t, toEnd) { let n = 0; while (battle.t < t - 1e-6 && n++ < 20000) { if (toEnd && (!battle.tank.alive || battle.over || (n % 20 === 0 && battle.summary().teamsLeft === 0 && !battle._volleyActive()))) break; battle.step(); } if (battle._pending) battle.step(); }
function seek(t) {
  if (!replay) return; t = Math.max(0, Math.min(replay.T, t)); if (t < battle.t - 0.05) rewind(); runQuiet(t);
  shotI = (battle.shots || []).length; landing.length = 0; mgI = (battle.mgs || []).length; simBank = 0; tNow = battle.t; volleys.skipTo(battle.t); $('log').textContent = ''; $('ticker').textContent = ''; logShown = 0; capT = -9; $('caption').textContent = ''; place();
}
function replayEvents() { const ev = []; for (const l of battle.log) { const k = l.kind === 'volley' ? 'v' : /knocked out|position destroyed/.test(l.text) ? 'k' : /Vehicle destroyed|hits the vehicle|We.re hit|HIT/.test(l.text) && l.kind !== 'tank' ? 'h' : /springs the ambush|breaks contact|changes tactics|launches a drone/.test(l.text) ? 'v' : null; if (k && (!ev.length || l.t - ev[ev.length - 1].t > 0.4)) ev.push({ t: l.t, text: l.text, k }); } return ev; }
function replayStart() {
  sound.start(); sound.loadVoices(ASSETS); ensureWorld(); if (!battle || !ended || replay) { newBattle(); runQuiet(1800, true); }   /* a battle not yet fought (from a replay code): play it through once, unseen, to learn its length and its events */
  const T = Math.max(5, battle.t + 4), ev = replayEvents(), specWas = replay ? replay.specWas : set.spectator; replay = { T, ev, specWas }; set.spectator = true; ended = true;
  rewind(); state = 'play'; playing = true; setupOpen = false; pagesOpen = false; cams.set('orbit'); { const T0 = battle.tank; scene.camera.position.copy(scene.at(T0.e - 26, T0.n - 34, 13)); }
  const tk = $('rp-ticks'); tk.textContent = ''; for (const e of ev) { const i = el('i', e.k === 'k' ? 'k' : e.k === 'h' ? 'h' : ''); i.style.left = (e.t / T * 100).toFixed(2) + '%'; i.title = e.text; tk.append(i); }
  buildBar(); show();
}
function replayStop() { if (!replay) return; set.spectator = replay.specWas; replay = null; $('replay').hidden = true; }
function replayCode() { const p = tankPos(); return btoa(JSON.stringify({ v: VERSION, b: set.biome, c: set.cond, f: set.force, s: set.skill, m: set.mission, w: set.waves, r: set.custom && set.custom.rung, q: crewOf().quality, cs: crewOf().stress ? 1 : 0, a: set.armour ? 1 : 0, map: set.map, seed: set.seed, pos: p ? [Math.round(p.e), Math.round(p.n), Math.round(p.h || 0)] : null })); }
function replayLoad(code) { let o; try { o = JSON.parse(atob(String(code).trim())); } catch (e) { return 'That is not a replay code.'; } if (!o || !BIOMES.some(b => b[0] === o.b) || !FORCES[o.f]) return 'That replay code does not fit this version.';
  set.biome = o.b; set.cond = CONDITIONS[o.c] ? o.c : 'day'; set.force = o.f; set.skill = o.s; set.mission = o.m || 'hold'; set.waves = +o.w || 1; set.crew = SKILLS.some(x => x[0] === o.q) ? o.q : 'trained'; set.stress = o.cs !== 0; set.armour = o.a === 1; { const rg = o.r && window.HKLadder.RUNGS.find(x => x.key === o.r); set.custom = rg ? { force: rg.force, raid: rg.raid, name: rg.name, note: rg.brief, rung: rg.key } : null; } set.map = +o.map || 1; set.seed = +o.seed || 1; if (o.pos) { set.pos = set.pos || {}; set.pos[set.biome + ':' + set.map] = { e: o.pos[0], n: o.pos[1], h: o.pos[2] }; }
  battle = null; ended = false; ensureWorld(true); replayStart(); return o.v !== VERSION ? `Made with version ${o.v}; this is ${VERSION}, so the battle may not run the same way.` : ''; }
let rpT = 0, rpSig = '';
function drawReplay(dt) { const box = $('replay'), on = !!replay && state === 'play' && !mapOpen; if (box.hidden === on) box.hidden = !on; if (!on) return;
  if (playing && battle.t >= replay.T - 0.05) { playing = false; buildBar(); }
  rpT -= dt; if (rpT > 0) return; rpT = 0.15; const t = Math.min(battle.t, replay.T), f = m => Math.floor(m / 60) + ':' + String(Math.floor(m % 60)).padStart(2, '0');
  let cur = null; for (const e of replay.ev) if (e.t <= t + 0.2) cur = e; const sig = f(t) + '|' + (cur ? cur.t : '') + '|' + playing; if (sig === rpSig) return; rpSig = sig;
  $('rp-time').textContent = `${f(t)} / ${f(replay.T)}`; $('rp-what').textContent = cur ? cur.text : ''; $('rp-play').textContent = playing ? 'Pause' : 'Play'; if (document.activeElement !== $('rp-bar')) $('rp-bar').value = Math.round(t / replay.T * 1000); }
$('rp-bar').addEventListener('input', e => { if (replay) { seek(+e.target.value / 1000 * replay.T); rpSig = ''; } });
$('rp-start').onclick = () => { seek(0); playing = true; buildBar(); };
$('rp-prev').onclick = () => { if (!replay) return; const p = replay.ev.filter(e => e.t < battle.t - 1.5).pop(); seek(p ? Math.max(0, p.t - 1) : 0); rpSig = ''; };
$('rp-next').onclick = () => { if (!replay) return; const n = replay.ev.find(e => e.t > battle.t + 1.2); seek(n ? Math.max(0, n.t - 1) : replay.T); rpSig = ''; };
$('rp-play').onclick = () => { if (replay && battle.t >= replay.T - 0.1) seek(0); playing = !playing; rpSig = ''; buildBar(); };
$('rp-result').onclick = () => { playing = false; state = 'result'; titleShow.reset(); show(); };
// the enemy force in play: the one picked on the setup screen, or a ladder rung's own force
function forceOf() { return set.custom || FORCES[set.force] || FORCES.ambush; }
// the debrief, the ladder and the run-the-numbers screens
const pages = initPages({ el, store, deps: { HK, Battle: BattleAPI.Battle, Study: window.HKStudy, Ladder: window.HKLadder },
  scenario() { ensureWorld(); const p = tankPos(), F = forceOf(); const SK = BattleAPI.SKILL[set.skill] || {}, nT = F.force.reduce((k, f) => k + (f.n || 1), 0); return { maps: BIOMES.map(([k, name]) => ({ key: k, name, make: () => new HKWorld.World({ seed: set.map, biome: k }) })), mapOpts: { skill: set.skill, cond: set.cond, mission: 'hold', raid: F.raid, force: F.force, cfg: cfg0, crewQuality: crewOf().quality, crewStress: crewOf().stress }, mapText: `${F.name}, ${set.skill} crews, map ${set.map} of each kind of ground, vehicle holding a position of its own choosing`, cfg: cfg0, raid: { force: F.force, raid: F.raid, jitter: SK.jitter, pilot: SK.pilot }, raidText: `${F.name.toLowerCase()} (${Math.min(6, nT)} threats ${F.raid ? 'over about ' + F.raid.window + ' s from ' + (F.raid.minR / 1000) + ' km or more' : 'launched together'}), ${set.skill} crews, vehicle halted in position`, opts: Object.assign(battleOpts(1), { lookup: undefined }), text: `${world.biome.name}, map ${set.map}, ${F.name}, ${set.skill} crews, ${(MISSIONS.find(m => m[0] === set.mission) || ['', set.mission])[1].toLowerCase()}, ${set.waves} wave${set.waves === 1 ? '' : 's'}, own crew ${crewOf().quality}${crewOf().stress ? '' : ' with stress off'}` }; },
  playRung,
  back() { pagesOpen = false; if (pagesFrom === 'result' && battle && ended && state === 'result') show(); else toTitle(); } });
function playRung(r) { replayStop(); set.biome = r.biome; set.cond = r.cond; set.map = r.map; set.mission = r.mission; set.skill = r.skill; set.waves = r.waves; set.seed = 1; set.custom = { force: r.force, raid: r.raid, name: r.name, note: r.brief, rung: r.key }; store.set('setup', set); start(); }
function openPage(which) { pagesFrom = state; pagesOpen = true; show(); if (which === 'ladder') pages.openLadder(); else pages.openNumbers(); }
function tankPos() { const p = set.pos && set.pos[set.biome + ':' + set.map]; return p && world.passable(p.e, p.n, true) ? p : null; }
// ---------------------------------------------------------------- map screen
const mapv = new MapView($('mapcv')); let mapOpen = false, mapFrom = 'title';
function mapState() { const T = battle.tank; return { tank: T, showAll: set.spectator, units: battle.units.map(u => ({ e: u.e, n: u.n, name: `${u.spec.name} #${u.id + 1}`, state: u.state, known: u.known, alive: u.alive })), missiles: state === 'play' ? volleys.info.map(m => ({ e: m.p.x, n: -m.p.z })) : [], battle, t: Math.min(tNow, battle.t), dt: frameDt }; }
function openMap() { if (state === 'title' && battle.t > 0) titleBattle();   /* the map shows the start position, not where the battle behind the title has got to */ mapOpen = true; mapFrom = state; $('map').hidden = false; mapv.setWorld(world); $('map-place').hidden = $('map-reset').hidden = state !== 'title'; mapv.pickMode = false; $('map').classList.remove('pick'); $('map-place').classList.remove('on'); mapv.fit(); refreshShed(); }
function refreshShed() { const T = battle.tank; mapv.viewshedFor(T.e, T.n); $('map-info').textContent = `${world.biome.name} · map ${set.map} · ${(mapv.shed.share * 100).toFixed(0)}% of the ground within 4.5 km can see the vehicle here`; }
function closeMap() { mapOpen = false; $('map').hidden = true; }
$('map-close').onclick = closeMap; $('map-fit').onclick = () => mapv.fit(); $('o-mapbtn').onclick = () => { ensureWorld(); openMap(); };
$('o-ladder').onclick = () => openPage('ladder'); $('o-numbers').onclick = () => openPage('numbers');
$('map-place').onclick = () => { mapv.pickMode = !mapv.pickMode; $('map').classList.toggle('pick', mapv.pickMode); $('map-place').classList.toggle('on', mapv.pickMode); };
$('map-reset').onclick = () => { if (set.pos) delete set.pos[set.biome + ':' + set.map]; store.set('setup', set); titleBattle(); refreshShed(); };
mapv.onPick = (e, n) => { if (!world.passable(e, n, true)) { $('map-info').textContent = 'The vehicle cannot stand there (building, dense wood or off the map).'; return; } set.pos = set.pos || {}; set.pos[set.biome + ':' + set.map] = { e: Math.round(e), n: Math.round(n), h: 0 }; store.set('setup', set); titleBattle(); refreshShed(); };
function ensureWorld() { if (world.seed !== set.map || world.biomeKey !== set.biome) { world = new HKWorld.World({ seed: set.map, biome: set.biome }); scene.setWorld(world); api.world = world; } if (scene.condition !== set.cond) scene.setCondition(set.cond); setFinish(set.biome, set.cond); }

// ---------------------------------------------------------------- drawing the battle state
const prevU = []; let frameDt = 0;   // where each enemy team was one step ago; the last frame's length
const shown = { e: 0, n: 0, h: 0 };   // where the vehicle is drawn this frame
function place() {
  const T0 = battle.tank, lastV = battle.volleys[battle.volleys.length - 1], inVolley = lastV && tNow >= lastV.t0 && tNow <= lastV.tEnd; let P = T0;
  if ((state === 'play' || demoLive()) && tNow < battle.t) { if (inVolley) P = battle.tankAt(tNow); else { const f = Math.max(0, Math.min(1, simBank / battle.dt)), dh = ((T0.h - prevT.h + 540) % 360) - 180; if (Math.hypot(T0.e - prevT.e, T0.n - prevT.n) < 3) P = { e: prevT.e + (T0.e - prevT.e) * f, n: prevT.n + (T0.n - prevT.n) * f, h: prevT.h + dh * f }; } }
  const T = { e: P.e, n: P.n, h: P.h }, w = world, d = 2.5, hh = T.h * Math.PI / 180, fe = Math.sin(hh), fn = Math.cos(hh);
  const pitch = Math.atan2(w.h(T.e + fe * d, T.n + fn * d) - w.h(T.e - fe * d, T.n - fn * d), 2 * d), roll = Math.atan2(w.h(T.e + fn * 1.6, T.n - fe * 1.6) - w.h(T.e - fn * 1.6, T.n + fe * 1.6), 3.2);
  tank.place(scene.at(T.e, T.n, 0), T.h, -pitch, roll); scene.setFocus(T.e, T.n); FINISH.ground.value = w.h(T.e, T.n); shown.e = T.e; shown.n = T.n; shown.h = T.h;
  for (const p of props) p.view.group.visible = seeAll() || p.u.known;
  // enemy teams: drawn between simulation steps like the vehicle, facing the way they walk when moving and the vehicle when in position
  const fU = state === 'play' || demoLive() ? Math.max(0, Math.min(1, simBank / battle.dt)) : 1;
  while (teams.length < battle.units.length) { const t = new TeamView(battle.units[teams.length].type, ASSETS); t.group.userData.heat = 0.9; scene.units.add(t.group); teams.push(t); }   /* a new enemy group has arrived */
  battle.units.forEach((u, i) => { const tv = teams[i]; const show = (u.alive || !tv.done) && !u.gone && (seeAll() || u.known || u.state === 'guiding' || u.state === 'firing'); tv.group.visible = show && !(cams.mode === 'enemy' && cams.unit === u);   /* looking through a team's own eyes, its figures would only block the picture */ if (!show) return;
    const p = prevU[i], moving = u.state === 'moving' && (u.spd || 0) > 0.2, tw = p && moving && Math.hypot(u.e - p[0], u.n - p[1]) < 1.5, e = tw ? p[0] + (u.e - p[0]) * fU : u.e, n = tw ? p[1] + (u.n - p[1]) * fU : u.n, pos = scene.at(e, n, 0);
    tv.place(pos, moving && u.hdg != null ? u.hdg : Math.atan2(T.e - u.e, T.n - u.n) * 180 / Math.PI); if (!tv.ground) tv.ground = teamGround; const far = pos.distanceTo(scene.camera.position) * scene.camera.fov / 40;   /* how far away the team looks (a zoomed sight brings it close) */ tv.update(frameDt * simRate(), moving ? (u.gait || 'walk') : u.down ? 'down' : 'still', far < 330, teamInfo(u, far));
    if (tv.fell) { if (tv.fell.blast) scene.fx.fire(pos.x, pos.y + 0.2, pos.z, 6, 0.45); else scene.fx.dust(pos.x, pos.y + 0.2, pos.z, 0.7); tv.fell = null; } });   /* a team has just been knocked out: a small fire for a few seconds where a shell burst (the burst, smoke and scorch mark come with the shell itself), a puff of dust under machine-gun fire */
  vehicles.update(battle, { t: tNow, all: seeAll(), teams });
}
// what the drawing of a team needs to know about its weapon: is a round in the launcher (not between firing and the end of reloading), is a spare ready
// reload: seconds until it can fire again; pack: seconds of packing up left before it moves off; setup: seconds of setting up left; dead: knocked out; dist: how far away it looks
// by: what knocked it out ('main' = main gun, otherwise a machine gun); deadFor: seconds since; fireBrg: compass bearing from the team to the vehicle; seed: a number of its own
const _ti = { loaded: true, spare: true, firing: false, reload: 0, pack: 0, setup: 0, dead: false, dist: 0, by: '', deadFor: 0, fireBrg: 0, seed: 0 }, teamGround = (x, z) => scene.world.h(x, -z), _lost = { E: null, n: 0, m: new Map() };
// the battle's own record of a team being knocked out (when the round landed and what fired it)
function teamLost(u) { const E = battle.events || []; if (_lost.E !== E || E.length < _lost.n) { _lost.E = E; _lost.n = 0; _lost.m.clear(); } for (; _lost.n < E.length; _lost.n++) { const e = E[_lost.n]; if (e.type === 'team_lost') _lost.m.set(e.uid, e); } return _lost.m.get(u.id); }
function teamInfo(u, dist) {
  const busy = u.state === 'guiding' || u.state === 'firing'; _ti.loaded = u.ammo > 0 && !busy && battle.t >= (u.readyAt || 0) - 2 || busy && u.spec.key !== 'rpg'; _ti.spare = u.ammo > 1; _ti.firing = busy;
  _ti.reload = u.ammo > 0 && !busy ? Math.max(0, (u.readyAt || 0) - battle.t) : 0; _ti.pack = u.state === 'moving' && !((u.spd || 0) > 0.2) ? Math.max(0.05, (u.packUntil || 0) - battle.t) : 0;
  _ti.setup = u.state === 'setup' ? Math.max(0, u.spec.setup * (u.setupK || 1) - (battle.t - u.since)) : 0; { const e = u.alive ? null : teamLost(u), T = battle.tank; _ti.dead = !u.alive && (!e || battle.t >= e.t); _ti.by = e ? e.by : ''; _ti.deadFor = _ti.dead ? (e ? battle.t - e.t : 99) : 0; _ti.fireBrg = Math.atan2(T.e - u.e, T.n - u.n) * 180 / Math.PI; _ti.seed = u.id; }
  _ti.dist = dist || 0; return _ti;
}
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
// the top strip of the engineer display: time, time rate, frame time. Everything else is in the panels.
let stripSig = '';
function drawStatus() {
  const st = $('status'), t = `T+ ${Math.floor(battle.t / 60)}:${String(Math.floor(battle.t % 60)).padStart(2, '0')}`, r = playing ? (speed === 0.25 ? '¼×' : speed + '×') : 'paused', f = fps ? `${(1000 / fps).toFixed(1)} ms · ${fps} fps` : `${Math.round(scene.rawMs || 0)} ms · under 1 fps`;
  const sig = t + r + f; if (sig === stripSig && st.childElementCount) return; stripSig = sig;
  if (!st.childElementCount) { const fr = el('span', 'chip'); fr.title = 'Frame time and frames a second. Click for the full figures'; fr.onclick = () => { showPerf = !showPerf; store.set('perf', showPerf); show(); }; st.append(el('span', 'chip'), el('span', 'chip'), fr); }
  const c = st.children; if (c[0].textContent !== t) c[0].textContent = t; if (c[1].textContent !== r) { c[1].textContent = r; c[1].className = 'chip' + (playing ? '' : ' warn'); } if (c[2].textContent !== f) { c[2].textContent = f; c[2].className = 'chip' + (fps && fps < 30 ? ' warn' : ''); }
}
// The battle's lines use a few of the engine's own words; on screen they are put in plain ones (wording only, nothing else changes).
const PLAIN = [[/\bSACLOS\b/g, 'Konkurs'], [/\bAPS\b/g, 'Trophy'], [/\(cued by HKOI track\)/g, '(warned by HKOI\'s radar track)'], [/\bSAL\b/g, 'Laser-guided missile'], [/\bHE\b/g, 'airburst'], [/ — /g, ': ']];
const plain = t => { let x = String(t == null ? '' : t); for (const [a, b] of PLAIN) x = x.replace(a, b); return x; };
const LOG_FILTERS = [['all', 'All'], ['threats', 'Threats'], ['crew', 'Crew'], ['enemy', 'Enemy']];
function setLog(open, filter) {
  if (filter) logFilter = filter; logOpen = !!open && state === 'play'; const ov = $('logov'), box = $('log'); ov.hidden = !logOpen; box.className = 'f-' + logFilter;
  const f = $('lo-filters'); f.textContent = ''; for (const [k, name] of LOG_FILTERS) { const b = el('button', 'btn' + (logFilter === k ? ' on' : ''), name); b.onclick = () => setLog(true, k); f.append(b); }
  if (logOpen) box.scrollTop = box.scrollHeight;
}
$('lo-close').onclick = () => setLog(false); $('ticker').onclick = () => setLog(!logOpen);
// the ticker: the latest three lines, newest brightest, one line each (the full log opens on a click or key L)
let tickT = 0;
function tick(l, when) {
  const box = $('ticker'), d = el('div', 'k-' + l.kind); d.append(el('i', null, when), el('b', null, plain(l.text))); if (l.why) d.append(el('small', null, plain(l.why))); d.title = plain(l.text) + (l.why ? ' (' + plain(l.why) + ')' : '');
  box.append(d); while (box.childElementCount > 3) box.firstChild.remove(); box.classList.remove('old'); tickT = performance.now();
}
function drawLog() {
  const due = battle.log.filter(l => l.t <= battle.t); if (due.length === logShown) return; due.sort((a, b) => a.t - b.t);
  const box = $('log'), fresh = due.slice(logShown); logShown = due.length;
  for (const l of fresh) { if (!set.spectator && (l.kind === 'volley' || l.kind === 'enemy' && !/loses sight/.test(l.text))) continue; if (l.kind === 'engine' && (l.sub === 'track' || l.sub === 'handoff') && !set.spectator) continue; const d = el('div', 'k-' + l.kind); const mm = Math.floor(l.t / 60), ss = (l.t % 60).toFixed(0).padStart(2, '0'); d.append(`${mm}:${ss}  `); d.append(el('b', null, plain(l.text))); if (l.why && (l.kind === 'crew' || l.kind === 'engine')) d.append(el('small', null, plain(l.why))); box.append(d); tick(l, `${mm}:${ss}`); }
  while (box.childElementCount > 400) box.firstChild.remove(); if (logOpen) box.scrollTop = box.scrollHeight;
  // the caption carries the most important new line, not merely the newest; the log keeps the lesser detail only in spectator view
  const W8 = l => l.kind === 'engine' ? ({ hit: 9, kill: 7, miss: 5, launch: 6, cue: 6, crew: 5, fire: 4, track: 2, handoff: 2 }[l.sub] || 3) : ({ volley: 8, result: 8, enemy: 5, tank: 6, crew: 6 }[l.kind] || 0);
  const top = fresh.filter(l => l.kind !== 'setup' && (set.spectator || l.kind !== 'volley' && l.kind !== 'enemy')).sort((a, b) => W8(a) - W8(b) || a.t - b.t).pop(); if (top && (W8(top) >= capW || performance.now() - capT > 1800)) { capW = W8(top); const c = $('caption'); c.textContent = plain(top.text); c.style.opacity = 1; capT = performance.now(); }
}
function checkEnd() {
  if (ended) return; const s = battle.summary(), last = battle.volleys[battle.volleys.length - 1], quiet = !last || battle.t > last.tEnd + 6;
  const out = !s.alive ? 'lost' : battle.over && quiet ? battle.over.result : (s.teamsLeft === 0 && quiet) ? 'won' : battle.t >= 1800 ? 'time' : null; if (!out) return;
  ended = true; setTimeout(() => { if (state !== 'play') return; playing = false; state = 'result'; titleShow.reset(); showResult(out); show(); }, out === 'lost' ? 5000 : 2500);
}
// The result screen: the outcome, the score and what HKOI saved in one look; the full debrief folds away under it.
const RESULTS = { lost: ['VEHICLE', 'DESTROYED', 'bad', 'Vehicle destroyed', 'poor'], won: ['AMBUSH', 'DEFEATED', '', 'Enemy beaten off', 'good'], objective: ['OBJECTIVE', 'REACHED', '', 'Objective reached', 'good'], withdrawn: ['CONTACT', 'BROKEN', 'warn', 'Broke contact', 'mid'], abandoned: ['VEHICLE', 'ABANDONED', 'bad', 'Crew abandoned the vehicle', 'poor'], time: ['TIME', 'EXPIRED', '', 'Time ran out', 'mid'] };
function showResult(out) {
  const s = battle.summary(), R = RESULTS[out] || RESULTS.time, c = crewOf();
  { const h = $('r-head'), em = el('em', null, R[1]); if (R[2]) em.style.color = `var(--${R[2]})`; h.textContent = R[0] + ' '; h.append(em); }
  $('r-sub').textContent = `${world.biome.name}, map ${set.map}, ${CONDITIONS[set.cond].name.toLowerCase()} · ${forceOf().name}, ${set.skill} enemy crews · own crew ${c.quality}${c.stress ? '' : ', stress off'} · ${Math.floor(battle.t / 60)} min ${Math.floor(battle.t % 60)} s`;
  const tb = $('r-table'); tb.textContent = ''; const NAMES = { HIT: 'Hit the vehicle', aps: 'Stopped by Trophy', hkoi_obs: 'Guidance cut by HKOI cloud', hkoi_cut: 'Guidance cut by HKOI cloud', counter_fire: 'Gunner driven off his missile by machine-gun fire', suppressed_aim: 'Missed: gunner\'s aim shaken by machine-gun fire', hkoi_he: 'Shot down by HKOI', terrain_mask: 'Lost behind terrain or cover', gunner_jitter: 'Enemy gunner missed', unguided_miss: 'Unguided miss', jammer: 'Jammed' };
  const rows = [['Enemy volleys', s.volleys], ['Missiles and drones launched', s.fired]].concat(Object.entries(s.by).sort((a, b) => b[1] - a[1]).map(([k, n]) => ['· ' + (NAMES[k] || k.replace(/_/g, ' ')), n])).concat([['HKOI rounds used', `${hudBox.max.obs - s.obs} obscurant, ${hudBox.max.he - s.he} HE`], ['Trophy charges left', `${s.apsL} left, ${s.apsR} right`], ['Crew', Object.entries(s.crew || {}).map(([k, x]) => `${k.toUpperCase()} ${x}`).join('  ')], ['Enemy teams destroyed by return fire', s.killedByTank], ['Enemy teams knocked out by machine guns', s.killedByMg], ['Main gun rounds left (of 10 multi-purpose)', s.main], ['Enemy teams still able to fire', s.teamsLeft]]);
  for (const [a, b] of rows) { const tr = el('tr'); tr.append(el('td', null, a), el('td', null, String(b))); tb.append(tr); }
  let d = null; try { d = pages.debrief(battle, $('r-debrief'), set.custom && set.custom.rung); tb.hidden = true; } catch (e) { console.error(e); $('r-debrief').textContent = ''; tb.hidden = false; }   /* the debrief replaces the plain table; if it fails the table is still there */
  $('r-res').textContent = R[3]; $('r-t-res').className = 'tile ' + R[4]; $('r-why').textContent = (battle.over && battle.over.text) || `after ${Math.floor(battle.t / 60)} min ${Math.floor(battle.t % 60)} s`;
  const L = window.HKLadder, rungI = set.custom && set.custom.rung ? L.RUNGS.findIndex(x => x.key === set.custom.rung) : -1;
  $('r-score').textContent = d ? String(d.score) : '-'; $('r-t-score').className = 'tile ' + (!d ? '' : d.score >= 75 ? 'good' : d.score >= 55 ? 'mid' : 'poor'); $('r-score').style.color = !d ? '' : d.score >= 75 ? 'var(--accent)' : d.score >= 55 ? 'var(--warn)' : 'var(--bad)';
  $('r-grade').textContent = d ? `out of 100 · ${L.grade(d.score)}` + (rungI >= 0 ? ` · rung ${rungI + 1} of ${L.RUNGS.length}` : '') : 'no score for this battle';
  const hk = (s.by.hkoi_obs || 0) + (s.by.hkoi_cut || 0) + (s.by.hkoi_he || 0);
  $('r-saved').textContent = d ? d.saved : hk ? `HKOI stopped ${hk} of the ${s.fired} threats fired at the vehicle.` : 'HKOI stopped nothing in this battle.';
  const facts = d ? [['Fired at the vehicle', d.threats, ''], ['Stopped by HKOI', d.hkoiStopped, 'hk'], ['Stopped by Trophy', d.trophyStopped, ''], ['Hits taken', d.hits, d.hits ? 'bad' : ''], ['Crew hurt', d.crewDown, d.crewDown ? 'bad' : ''], ['Enemy teams destroyed', `${d.destroyed} of ${d.teams}`, ''], ['Trophy shots left', d.trophyLeft, '']]
    : [['Fired at the vehicle', s.fired, ''], ['Stopped by HKOI', hk, 'hk'], ['Stopped by Trophy', s.by.aps || 0, ''], ['Hits taken', s.hits, s.hits ? 'bad' : '']];
  const fb = $('r-facts'); fb.textContent = ''; for (const [name, v, cls] of facts) { const x = el('div', cls || null); x.append(el('b', null, String(v)), name); fb.append(x); }
  $('r-more').open = false; const nextR = rungI >= 0 ? L.RUNGS[rungI + 1] : null; $('r-nextrung').hidden = !nextR; $('r-next').hidden = rungI >= 0; $('r-nextrung').onclick = () => { if (nextR) playRung(nextR); };
}

// ---------------------------------------------------------------- screens and controls
// Which boxes are on screen follows from four things: the screen (title, play, result), the display (simple or engineer),
// whether the view is a crew seat, and whether another page (ladder, numbers, map) is open on top.
function show() {
  const p = state === 'play', eng = hudMode === 'engineer', seat = p && !!SEATV[cams.mode];
  if (!p) { $('tsight').hidden = true; $('dsight').hidden = true; $('replay').hidden = true; $('esight').hidden = true; $('units').hidden = true; $('caption').textContent = ''; $('subs').style.opacity = 0; }
  $('title').hidden = state !== 'title' || pagesOpen; $('setup').hidden = !(state === 'title' && setupOpen && !pagesOpen); $('result').hidden = state !== 'result' || pagesOpen;
  document.body.classList.toggle('setup-open', state === 'title' && setupOpen); document.body.classList.toggle('in-seat', seat); document.body.classList.toggle('hud-eng', p && eng); document.body.classList.toggle('hud-none', q.get('hud') === 'none');
  $('status').hidden = !(p && eng && !seat); $('bar').hidden = !p; $('ticker').hidden = !(p && eng && !seat); if (!p && logOpen) setLog(false);
  hud.hidden = !(showPerf && (p ? eng && !seat : q.get('perf') === '1'));
  lastMode = cams.mode; stillT = 0;
}
function setHud(mode) { hudMode = mode === 'engineer' ? 'engineer' : 'simple'; store.set('hud', hudMode); barOpen = false; if (hudMode === 'simple') setLog(false); hudBox.sig = {}; hudBox.tSlow = hudBox.tFast = 0; if (state === 'play') { buildBar(); drawStatus(); } show(); if ($('o-hud').childElementCount) seg('o-hud', HUDS, 'hud'); }
function seg(id, items, key, after) { const box = $(id); box.textContent = ''; const cur = key === 'hud' ? hudMode : set[key]; for (const [v, name, tip] of items) { const b = el('button', 'btn' + (cur === v ? ' on' : ''), name); if (tip) b.title = tip; b.onclick = () => { if (key === 'hud') { setHud(v); return; } set[key] = v; store.set('setup', set); seg(id, items, key, after); if (after) after(); }; box.append(b); } }
const HUDS = [['simple', 'Simple', 'Almost nothing on screen: a status line, two gauges, a warning when something is inbound'], ['engineer', 'Engineer', 'Everything: crew states and reasons, weapons, every threat in the air, the event log, frame time']];
const nameOf = (list, k) => (list.find(x => x[0] === k) || ['', String(k)])[1];
// the setup in one sentence (title screen), and the note under the setup panel's heading
function note() {
  const F = forceOf(), c = crewOf(), sum = $('t-sum'); sum.textContent = '';
  const parts = [`${nameOf(BIOMES, set.biome)}, map ${set.map}`, CONDITIONS[set.cond] ? CONDITIONS[set.cond].name : set.cond, set.custom ? `Ladder: ${set.custom.name}` : F.name, `${nameOf(SKILLS, set.skill)} enemy crews`, nameOf(MISSIONS, set.mission), LENGTHS.some(x => x[0] === set.waves) ? nameOf(LENGTHS, set.waves) : `${set.waves} waves`, `Your crew: ${c.quality}${c.stress ? '' : ', stress off'}`];
  parts.forEach((t, i) => { if (i) sum.append(' · '); sum.append(i === 2 ? el('b', null, t) : t); });
  $('s-note').textContent = (set.custom ? `Ladder raid "${set.custom.name}": ${set.custom.note} Ladder raids always use a trained crew with stress on. Pick an enemy force to leave the ladder. ` : F.note + '. ') + (set.spectator ? 'Spectator: every enemy team is shown and you can look through their sights.' : 'Fog of war: you see only what the vehicle\'s sensors and crew have found.');
  const live = $('t-live'), on = demoLive() || state === 'title' && (demo.forced === '1' || demo.forced !== '0' && scene.quality !== 'min' && !scene.software); live.className = on ? '' : 'still'; live.textContent = ''; live.append(el('i'), on ? 'LIVE: a battle with this setup is being fought behind the menu' : 'Still picture (Minimum graphics): the battle starts when you press Play');
}
// the setting that belongs to the interior: the crew figures in the seats (the address can still switch them off: crew=0)
function inside() { interior.graphic = q.get('graphic') !== '0';   /* graphic effects are always on (the owner's decision); only the address can switch them off, for pictures */ interior.crewOn = set.figures !== false && q.get('crew') !== '0'; }
function buildTitle() {
  $('ver').textContent = VERSION;
  const again = () => { note(); preview(); };
  seg('o-biome', BIOMES, 'biome', again); seg('o-cond', Object.entries(CONDITIONS).map(([k, c]) => [k, c.name]), 'cond', again);
  seg('o-force', Object.entries(FORCES).map(([k, f]) => [k, f.name, f.note]), 'force', () => { set.custom = null; store.set('setup', set); again(); });
  seg('o-skill', SKILLS, 'skill', again); seg('o-mission', MISSIONS, 'mission', again); seg('o-waves', LENGTHS, 'waves', again);
  seg('o-crew', SKILLS, 'crew', again); seg('o-stress', [[true, 'On', 'Fear, wounds and overload slow the crew and can break it'], [false, 'Off', 'The crew works like a machine: never slower, never breaks']], 'stress', again);
  seg('o-figures', [[true, 'On', 'The crew sit in their seats inside the vehicle'], [false, 'Off', 'Empty seats']], 'figures', inside);
  seg('o-armour', [[false, 'Flat chance by weapon', 'A hit knocks the vehicle out with a fixed chance for each kind of weapon'], [true, 'The armour decides', 'The plate that is struck decides whether a hit knocks the vehicle out']], 'armour', again);
  seg('o-hud', HUDS, 'hud'); seg('o-spec', [[false, 'Fog of war'], [true, 'Spectator']], 'spectator', note);
  seg('o-gfx', Object.entries(QUALITY).sort((a, b) => (b[1].auto ? 1 : 0) - (a[1].auto ? 1 : 0)).map(([k, v]) => [k, v.name]), 'gfx', () => { scene.setQuality(set.gfx); note(); stillT = 0; });
  $('o-map').value = set.map; $('o-map').onchange = () => { set.map = Math.max(1, Math.min(9999, Math.round(+$('o-map').value || 1))); store.set('setup', set); again(); };
  $('o-rand').onclick = () => { set.map = 1 + Math.floor(Math.random() * 9999); $('o-map').value = set.map; store.set('setup', set); again(); };
  $('go').onclick = start; $('s-play').onclick = start; note();
  $('o-setup').onclick = () => { setupOpen = true; $('s-msg').textContent = ''; show(); }; $('s-done').onclick = () => { setupOpen = false; show(); };
  const w = $('t-warn'); w.hidden = !scene.software; if (scene.software) w.textContent = 'Warning: this browser is drawing without your graphics card ("' + scene.gpu() + '"), so it will be very slow. Turn on hardware acceleration in the browser settings, or open the link in Chrome or Edge directly.';
}
// the battle behind the title screen (also what the map screen reads the start position from)
function titleBattle(next) { ensureWorld(); if (!demo.seed) demo.seed = set.seed + 100; if (next) demo.seed++; newBattle(demo.seed); demo.endT = 0; demo.chk = 0; demo.done = false; titleShow.reset(); stillT = 0; }
function toTitle() { replayStop(); state = 'title'; playing = false; setupOpen = false; pagesOpen = false; cams.set('orbit'); titleBattle(); buildTitle(); show(); }
// one step of the battle behind the title: fought at normal speed, started again on a new seed a few seconds after it is decided
function demoTick(dt, live) {
  if (!live) return;
  demo.chk -= dt; if (demo.chk <= 0) { demo.chk = 1; demo.done = !battle.tank.alive || !!battle.over || battle.t > 300 || battle.t > 20 && battle.summary().teamsLeft === 0 && !battle._volleyActive(); }
  if (demo.done) { demo.endT += dt; if (demo.endT > 7) { titleBattle(true); return; } }
  advance(dt);
}
let previewTimer = 0; function preview() { clearTimeout(previewTimer); previewTimer = setTimeout(() => { if (state === 'title') titleBattle(); }, 60); }
function start() { clearTimeout(previewTimer); demo.manual = false; sound.start(); sound.loadVoices(ASSETS); ensureWorld(); setupOpen = false; pagesOpen = false; state = 'play'; newBattle(); playing = true; barOpen = false; { let c = store.get('cam', 'orbit'); if (c === 'drv') c = 'in_drv'; cams.set(VIEW_OF[c] ? c : 'orbit'); } if (cams.mode === 'orbit') { const T = battle.tank; scene.camera.position.copy(scene.at(T.e - 26, T.n - 34, 13)); } buildBar(); show(); }

// ---- the control bar: one row. Views are grouped (outside, crew views, inside, enemy); a group opens a second row with its views.
// The old overlay driver view is gone from the bar: the driver's seat inside replaces it. The head-out commander and loader views stay.
const HINT = Object.fromEntries(CAMERA_MODES.map(m => [m.key, m.hint]));
const VIEW_GROUPS = [
  { key: 'out', name: 'Outside', views: [['orbit', 'Orbit'], ['chase', 'Chase'], ['top', 'Overhead'], ['fly', 'Free look']] },
  { key: 'crew', name: 'Crew views', views: [['cdr', 'Commander, head out'], ['ldr', 'Loader, head out'], ['gnr', 'Gunner sight'], ['citv', 'CITV'], ['hkoi', 'HKOI sight']] },
  { key: 'in', name: 'Inside', views: [['in_cdr', 'Commander seat'], ['in_gnr', 'Gunner seat'], ['in_ldr', 'Loader seat'], ['in_drv', 'Driver seat'], ['cut', 'Cutaway']] },
  { key: 'enemy', name: 'Enemy', spectator: true, views: [['enemy', 'Enemy sight'], ['troops', 'Enemy close-up'], ['missile', 'Missile'], ['fpv', 'Drone camera']] },
];
const VIEW_OF = {}; for (const g of VIEW_GROUPS) for (const [k, name] of g.views) VIEW_OF[k] = { g, name };
const KEY_VIEWS = VIEW_GROUPS.filter(g => !g.spectator).flatMap(g => g.views.map(v => v[0])).slice(0, 9);   // keys 1 to 9
function setView(key) { const v = VIEW_OF[key]; if (!v || v.g.spectator && !set.spectator) return; if (!SEATV[key] && !v.g.spectator) lastOutside = key; cams.set(key); store.set('cam', v.g.spectator ? 'orbit' : key); barOpen = false; buildBar(); show(); }
function setSpectator(on) { set.spectator = on; if (!on && VIEW_OF[cams.mode] && VIEW_OF[cams.mode].g.spectator) cams.set('orbit'); store.set('setup', set); hudBox.sig = {}; buildBar(); show(); }
// small line drawings for the bar's buttons (16 x 16, drawn in the button's own colour)
const ICONS = {
  pause: '<path d="M5 3v10M11 3v10"/>', play: '<path d="M5 3l8 5-8 5z"/>',
  view: '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.500 8 14.500 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>',
  map: '<path d="M1.500 3.500l4-1.500 5 1.500 4-1.500v10.500l-4 1.500-5-1.500-4 1.500zM5.500 2v10.500M10.500 3.500V14"/>',
  sound: '<path d="M2 6h2.500l3.500-3v10l-3.500-3H2zM10.500 5.500a3.500 3.500 0 010 5M12.500 3.500a6 6 0 010 9"/>', mute: '<path d="M2 6h2.500l3.500-3v10l-3.500-3H2zM10.500 6l4 4M14.500 6l-4 4"/>',
  display: '<path d="M1.500 3h13v8.500h-13zM5.500 14h5M4 6h4M4 8.500h6"/>', menu: '<path d="M2 8l6-5.500L14 8M4 7v6.500h8V7"/>', out: '<path d="M6 2.500H2.500v11H6M6 8h8M11 5l3 3-3 3"/>',
};
function icon(name) { const sp = el('span', 'ic'); sp.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`; return sp; }
// The bar is six things: time (pause and rate), the view (one button that opens the view picker), map, sound, display, menu.
function buildBar() {
  const bar = $('bar'); bar.textContent = ''; const eng = hudMode === 'engineer', seat = !!SEATV[cams.mode], slim = seat && !eng, cur = VIEW_OF[cams.mode];
  const btn = (ic, text, cls, tip, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : '')); if (ic) b.append(icon(ic)); if (text) b.append(el('span', null, text)); if (tip) b.title = tip; b.onclick = fn; return b; };
  // the view picker: every view, grouped, with its key
  if (barOpen) { const pick = el('div', 'pick');
    for (const vg of VIEW_GROUPS) { const row = el('div', 'barrow'); row.append(el('span', 'lbl', vg.name));
      if (vg.spectator) row.append(btn(null, set.spectator ? 'Spectator: on' : 'Spectator: off', 'spec' + (set.spectator ? ' on' : ''), 'Show every enemy team and allow the enemy views. Off: fog of war, you see only what the vehicle has found', () => setSpectator(!set.spectator)));
      for (const [k, name] of vg.views) { const n = KEY_VIEWS.indexOf(k), b = btn(null, name, (vg.spectator ? 'spec' : '') + (cams.mode === k ? ' on' : ''), (HINT[k] || name) + (n >= 0 ? ` (key ${n + 1})` : ''), () => setView(k)); if (n >= 0) b.append(el('kbd', null, String(n + 1))); if (vg.spectator && !set.spectator) b.disabled = true; row.append(b); }
      pick.append(row); }
    bar.append(pick); }
  const row = el('div', 'barrow'); bar.append(row); const grp = () => { const g = el('div', 'grp'); row.append(g); return g; };
  let g = grp(); g.append(btn(playing ? 'pause' : 'play', playing ? 'Pause' : 'Play', '', 'Pause or carry on (space bar)', () => { playing = !playing; buildBar(); }));
  if (!slim) { const rates = el('div', 'rates'); rates.title = 'Time rate'; for (const sp of [0.25, 1, 2, 4]) rates.append(btn(null, sp === 0.25 ? '¼×' : sp + '×', speed === sp ? 'on' : '', sp === 0.25 ? 'Quarter speed' : sp === 1 ? 'Real time' : sp + ' times faster', () => { speed = sp; buildBar(); })); g.append(rates); }
  g = grp(); { const vb = btn('view', 'View: ' + (cur ? cur.name : 'free'), (barOpen ? 'open' : ''), 'Choose where you watch from: opens the list of views (keys 1 to 9)', () => { barOpen = !barOpen; buildBar(); }); vb.id = 'viewbtn'; vb.append(el('span', 'chev', barOpen ? '▾' : '▴')); g.append(vb); }
  if (seat) g.append(btn('out', 'Back outside', '', 'Leave the inside view (Esc)', () => setView(lastOutside)));
  if (SENSOR[cams.mode] || cams.mode === 'gnr') g.append(btn(null, 'Thermal: ' + (wantThermal() === 1 ? 'white hot' : wantThermal() === -1 ? 'black hot' : 'off'), 'on', 'Thermal picture for this sight (T)', cycleThermal));
  if (!slim) { g = grp(); g.append(btn('map', 'Map', '', 'Topographic map (M)', openMap));
    g.append(btn(sound.on ? 'sound' : 'mute', 'Sound', sound.on ? 'on' : '', 'Sound on or off', () => { sound.start(); sound.setOn(!sound.on); store.set('sound', sound.on); buildBar(); })); }
  g = grp(); g.append(btn('display', eng ? 'Engineer' : 'Simple', '', 'Display: engineer shows everything, simple shows almost nothing (H)', () => setHud(eng ? 'simple' : 'engineer')));
  if (!slim) g.append(director.button());   /* film director on or off (key F) */
  if (!slim) g.append(btn('menu', 'Menu', '', 'Back to the title screen', toTitle));
}
// the view picker is a pop-up: a click anywhere else closes it
window.addEventListener('pointerdown', e => { if (barOpen && !(e.target.closest && e.target.closest('#bar'))) { barOpen = false; buildBar(); } }, true);
$('r-replay').onclick = replayStart; $('r-code').onclick = () => { const c = replayCode(), box = $('r-codebox'); box.value = c; box.select(); if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => { $('r-code').textContent = 'Copied'; setTimeout(() => { $('r-code').textContent = 'Copy replay code'; }, 1500); }).catch(() => {}); };
$('o-codebtn').onclick = () => { const msg = replayLoad($('o-code').value); if (msg) { $('o-note').textContent = msg; $('s-msg').textContent = msg; } };
$('r-again').onclick = () => { replayStop(); start(); }; $('r-next').onclick = () => { replayStop(); set.seed++; store.set('setup', set); start(); }; $('r-menu').onclick = toTitle; $('r-numbers').onclick = () => openPage('numbers');
window.addEventListener('keydown', e => { if (state !== 'play' || e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return; if (e.code === 'KeyM') { mapOpen ? closeMap() : openMap(); } if (e.code === 'Space') { playing = !playing; buildBar(); e.preventDefault(); } if (e.key === '[' || e.key === ']') { if (cams.mode === 'enemy' || cams.mode === 'troops') cams.cycle(battle.units, e.key === ']' ? 1 : -1); } if (e.code === 'KeyT') cycleThermal();
  if (e.code === 'KeyH') setHud(hudMode === 'engineer' ? 'simple' : 'engineer'); if (e.code === 'KeyL' && hudMode === 'engineer') setLog(!logOpen);
  if (e.code === 'Escape') { if (logOpen) setLog(false); else if (barOpen) { barOpen = false; buildBar(); } else if (SEATV[cams.mode]) setView(lastOutside); }
  const n = '123456789'.indexOf(e.key); if (n >= 0 && KEY_VIEWS[n]) setView(KEY_VIEWS[n]); });

// Crew talk. The crew's lines are chosen by the sound engine itself (src/audio/crewtalk.js) from what happens in the battle:
// its event list, the engine's crew talk for each engagement, and the tank's own state. Only human recordings are used; where
// the voice pack has no line, the crewman says nothing. voices() is what the frame loop hands to sound.update for this.
// From outside the vehicle the intercom is not heard; from an enemy sight the enemy team's own calls are heard instead.
let voiceV = null, voiceHits = 0;
function voices() { return { battle, talking: state === 'play' && playing && speed <= 2.01, mission: set.mission }; }
function voiceEvent(type, o) { const enemyView = cams.mode === 'enemy' || cams.mode === 'troops' || cams.mode === 'missile';
  if (enemyView) { if (type === 'launch') sound.enemy(o.drone ? 'dlaunch' : 'fire', 0.15); else if (type === 'hit') sound.enemy(o.killing ? 'kill' : 'hit', 0.8); else if (type === 'pass' || type === 'explosion') sound.enemy('miss', 1.0); else if (type === 'airburst' && o.size >= 1) sound.enemy('lost', 0.8); return; }
  if (type === 'hit') { voiceHits++; if (o.killing) { sound.scream('scream', 0.25); sound.scream('scream', 0.9, 0.7); } else sound.react('CDR', 'hit', 0.5); } }
// the vehicle's own main gun: flash, dust and report at the muzzle, then the round arriving
let shotI = 0; const landing = [];
// machine-gun bursts: tracers from the coax and the commander's .50 to the target, strikes kicking up dust there, and the sound
let mgI = 0, mgAcc = { coax: 0, m2: 0, dust: 0 }; const mgV = new THREE.Vector3(), mgW = new THREE.Vector3();
const MG_RED = [1, 0.22, 0.1];
function machineGuns(dt) {
  const L = battle.mgs || []; if (!simRate()) return; while (mgI < L.length && battle.t > L[mgI].t + L[mgI].dur) mgI++;
  const sdt = dt * simRate(), quiet = speed > 2.01 || state !== 'play';
  for (let i = mgI; i < L.length && i < mgI + 6; i++) {   /* every burst going on right now: each gun has its own target */
    const b = L[i]; if (battle.t < b.t || battle.t > b.t + b.dur) continue; const key = b.w || (b.coax ? 'coax' : 'm2'), heavy = key === 'm2', rate = heavy ? 8 : 12, tgt = scene.at(b.e, b.n, 0.5, mgW);
    mgAcc[key] = (mgAcc[key] || 0) + sdt * rate; let n = Math.floor(mgAcc[key]); mgAcc[key] -= n; n = Math.min(n, 4);
    const m = tank.mgMuzzle(key, mgV) || scene.at(shown.e, shown.n, 2.6, mgV);
    /* effects: a flash for every round, a red tracer every fifth (the usual belt), each round's own strike in the dust, the burst walking onto the target */
    const fx = scene.fx, walk = Math.max(0, 1 - (battle.t - b.t) / Math.min(1.2, b.dur || 1)) * b.R * 0.03;
    for (let k = 0; k < n; k++) { if (!quiet) sound.mg(camDist(m), heavy);
      const ax = tgt.x - m.x, az = tgt.z - m.z, al = Math.hypot(ax, az) || 1, ix = tgt.x + (fx.R() - 0.5) * b.R * 0.012 - ax / al * walk, iz = tgt.z + (fx.R() - 0.5) * b.R * 0.012 - az / al * walk, iy = world.h(ix, -iz) + 0.1;
      const dx = ix - m.x, dy = iy - m.y, dz = iz - m.z, d = Math.hypot(dx, dy, dz) || 1, v = heavy ? 880 : 840, tr = (mgAcc['n' + key] = (mgAcc['n' + key] || 0) + 1) % 5 === 0;
      fx.mgFlash(m.x, m.y, m.z, dx / d, dy / d, dz / d, heavy);
      if (tr) fx.tracer(m.x, m.y, m.z, ix, iy, iz, d / v, 1, 0.22, 0.1, heavy ? 0.14 : 0.1, heavy ? 12 : 9, 6);
      fx.bulletStrike(ix, iy, iz, heavy ? 1.3 : 0.8, d / v, tr && fx.R() < 0.4 ? MG_RED : null); } }
}
// ---- sensor views: thermal picture and the displays drawn over CITV, the HKOI sight and the driver's vision blocks ----
let thSensor = 1, thGunner = 0;   // thermal setting for the sensor displays and for the gunner's sight: 0 off, 1 white hot, -1 black hot
const SENSOR = { citv: true, hkoi: true }, thName = m => m === 1 ? 'WHT HOT' : m === -1 ? 'BLK HOT' : 'DAY TV';
function wantThermal() { if (state !== 'play' || mapOpen) return 0; return SENSOR[cams.mode] ? thSensor : cams.mode === 'gnr' ? thGunner : 0; }
function cycleThermal() { if (SENSOR[cams.mode]) thSensor = thSensor === 1 ? -1 : thSensor === -1 ? 0 : 1; else if (cams.mode === 'gnr') thGunner = thGunner === 0 ? 1 : thGunner === 1 ? -1 : 0; else return; buildBar(); }
let tsSig = '';
function drawSensors() {
  const th = wantThermal(); if ((scene.thermal || 0) !== th) scene.setThermal(th);
  const sens = state === 'play' && !mapOpen && SENSOR[cams.mode], drv = state === 'play' && !mapOpen && cams.mode === 'drv', ts = $('tsight'), ds = $('dsight'); if (ts.hidden === !!sens) ts.hidden = !sens; if (ds.hidden === drv) ds.hidden = !drv;
  if (drv) { const T = battle.tank, t = `DRIVER   HDG ${String(Math.round(shown.h) % 360).padStart(3, '0')}   ${Math.round(Math.abs(T.v || 0) * 3.6)} km/h`; if ($('ds-text').textContent !== t) $('ds-text').textContent = t; }
  if (!sens) return; const T = battle.tank, st = battle.tankStatus ? battle.tankStatus() : null, box = $('ts-box'); let top, bot, bx = null;
  if (cams.mode === 'citv') { const q = battle._targets ? battle._targets().find(x => x.los) : null; top = `CITV   ${thName(th)}   ${scene.camera.fov < 6 ? '10×' : '3×'}   BRG ${String(Math.round(cams.citvYaw || 0) % 360).padStart(3, '0')}`;
    bot = q ? `${q.u.spec.name.toUpperCase()} #${q.u.id + 1}   RNG ${String(Math.round(q.R / 10) * 10).padStart(4, '0')} m\n${q.danger === 4 ? 'ITS MISSILE IS IN THE AIR' : q.danger === 3 ? 'CAN FIRE ON US' : q.danger === 2 ? 'RELOADING' : 'MOVING'}` : 'SWEEPING\nNOTHING LOCATED IN VIEW'; }
  else { const m = volleys.info.filter(x => x.cued).sort((a, b) => a.range - b.range)[0], s = T.st || {}; top = `HKOI SIGHT   ${thName(th)}   ${scene.camera.fov < 8 ? 'NARROW' : 'WIDE'}   OBSCURANT ${s.obs == null ? '-' : s.obs}   HE ${s.he == null ? '-' : s.he}`;
    bot = (m ? `TRACK ${m.tt.short.toUpperCase()}   RNG ${String(Math.round(m.range / 10) * 10).padStart(4, '0')} m\n` : '') + (st ? st[1][1].toUpperCase() : ''); if (m) bx = m.p; }
  if (bx) { v3.copy(bx).project(scene.camera); const on = v3.z < 1 && Math.abs(v3.x) < 1 && Math.abs(v3.y) < 1; box.hidden = !on; if (on) box.style.transform = `translate(${((v3.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v3.y) / 2 * innerHeight).toFixed(1)}px)`; } else if (!box.hidden) box.hidden = true;
  const sig = top + '|' + bot; if (sig !== tsSig) { tsSig = sig; $('ts-top').textContent = top; $('ts-bot').textContent = bot; }
}
function trackDust(dt) {
  /* dust behind the tracks by distance driven (the same at any frame rate), and a pair of track marks every 3 m */
  const T = battle.tank, sp = Math.abs(T.v || 0), rate = simRate(); if (!rate || !T.alive || sp < 0.5) return;
  const h = shown.h * Math.PI / 180, sh = Math.sin(h), ch = Math.cos(h), wet = set.cond === 'rain' || set.cond === 'snow', D = trackDust, hf = (x, z) => world.h(x, -z);
  D.d = (D.d || 0) + sp * dt * rate; D.m = (D.m || 0) + sp * dt * rate;
  while (D.d >= 0.9) { D.d -= 0.9; if (sp < 1.2) continue; D.side = -(D.side || 1); const side = D.side * 1.5, p = scene.at(shown.e - sh * 3.6 + ch * side, shown.n - ch * 3.6 - sh * side, 0.2); scene.fx.dust(p.x, p.y, p.z, (wet ? 0.35 : 1) * Math.min(1, sp / 6)); }
  while (D.m >= 3) { D.m -= 3; for (const side of [1.45, -1.45]) scene.marks.add(shown.e - sh * 2.2 + ch * side, -(shown.n - ch * 2.2 - sh * side), 0.33, hf, { kind: 2, rot: Math.PI - h, len: 3.15 }); } }
function mainGun() {
  const S = battle.shots || []; const live = state === 'play' && playing;
  while (shotI < S.length && S[shotI].t <= battle.t) { const sh = S[shotI++]; if (battle.t - sh.t > 2) continue; const T = battle.tank, a = Math.atan2(sh.to.e - sh.from.e, sh.to.n - sh.from.n), m = scene.at(T.e + Math.sin(a) * 6.5, T.n + Math.cos(a) * 6.5, 2.3);
    scene.fx.seed(sh.t); scene.fx.muzzleBlast(m.x, m.y, m.z, Math.sin(a), 0, -Math.cos(a), 1.5); const g = scene.at(T.e, T.n, 0.3); scene.fx.dustRing(g.x, g.y, g.z, 1.3, 11); { const q = scene.at(sh.to.e, sh.to.n, 0.6); scene.fx.tracer(m.x, m.y, m.z, q.x, q.y, q.z, Math.max(0.05, sh.tof), 1, 0.7, 0.35, 0.28, 34, 8); } scene.blast(m, 1.4, false); tank.kick(); if (live && speed <= 2.01) { sound.gun120(camDist(m)); sound.say('CDR', ['Fire!'], 1); } landing.push(sh); }
  for (let i = landing.length - 1; i >= 0; i--) { const sh = landing[i]; if (battle.t < sh.t + sh.tof) continue; landing.splice(i, 1); const p = scene.at(sh.to.e, sh.to.n, 0.4); scene.fx.seed(sh.t + 1); scene.fx.explosion(p.x, p.y, p.z, 1.5, { surface: world.buildingAt(sh.to.e, sh.to.n, 2) ? 'wall' : world.veg(sh.to.e, sh.to.n).cls === 4 || world.veg(sh.to.e, sh.to.n).cls === 5 ? 'trees' : null }); scene.blast(p, 1.4); scene.marks.add(p.x, p.z, 2.4, (x, z) => world.h(x, -z), { kind: 1 }); if (sh.hit) { scene.fx.sparks(p.x, p.y + 0.5, p.z, 0, 1, 0, 40, 22, 1.4, 1.2); scene.fx.column(p.x, p.y, p.z, 50, 1); } if (live && speed <= 2.01) { sound.explosion(camDist(p), 1.5); if (sh.hit) sound.say('CDR', ['Target! Cease fire!'], 1); } }
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
let simMs = 0, cpuMs = 0, last = performance.now(), frames = 0, fps = 0, fpsT = last, worst = 0, slow = 0, stillT = 0;
const titleShow = new TitleShow(scene, cams);
function ctx() { const T = shown, m = volleys.info; let brg = null; if (m.length) { const c = m.filter(x => x.cued); if (c.length) brg = c.sort((a, b) => a.range - b.range)[0].brg; } const rf = battle._rf, fl = landing[landing.length - 1], mg = battle._mg && battle.t < battle._mg.t + battle._mg.dur + 1.5 ? battle._mg : null, aim = rf ? rf.k : fl ? fl.to : mg ? mg : null; let cdrLook = null, hkoiAt = null; if (cams.mode === 'citv' && battle._targets) { const q = battle._targets().find(x => x.los); if (q) cdrLook = q.k; } if (cams.mode === 'hkoi') hkoiAt = tank.hkoiMuzzle(hkV);
  return { tank: T, units: battle.units, missiles: m, threatBrg: brg, aim, unitPos, turret: battle.tank.tur, hkoiAim: volleys.aimAt, hkoiAt, cdrLook }; }
const hkV = new THREE.Vector3();
const unitPos = u => (teams[battle.units.indexOf(u)] || teams[0]).group.position;   /* where the team is drawn this frame (smoothed between simulation steps) */
const enemyViews = new EnemyViews(u => cams.choose(u));
// the film director and the X-ray of a hit: what they may read here, and the one thing they may set (the speed)
const film = { scene, cams, tank, store, el, shown, get battle() { return battle; }, get volleys() { return volleys; }, get tNow() { return tNow; }, get state() { return state; }, get playing() { return playing; }, get mapOpen() { return mapOpen; }, get speed() { return speed; }, set speed(v) { speed = v; buildBar(); }, get review() { return !!replay; }, get spectator() { return !!set.spectator; }, seek(t) { if (replay) { seek(t); rpSig = ''; } }, refresh() { if (state === 'play') buildBar(); } };
const director = new Director(film), xray = new XRayPanel(film);
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
  if (state === 'play' && playing && !(!replay && !battle.tank.alive && ended && battle.t > battle.volleys[battle.volleys.length - 1].tEnd + 8)) advance(replay ? Math.max(0, Math.min(dt * speed, replay.T - battle.t)) : dt * speed);
  else if (state === 'title' && !demo.manual) demoTick(dt, demoLive());
  const rate = simRate(); if (state !== 'play' && !rate) tNow = battle.t; place(); volleys.update(Math.min(tNow, battle.t), dt * rate); mainGun(); machineGuns(dt); trackDust(dt); { const c = ctx(), b = c.aim ? Math.atan2(c.aim.e - shown.e, c.aim.n - shown.n) * 180 / Math.PI : c.threatBrg != null ? c.threatBrg : shown.h; const sdt = rate ? dt * rate : dt; tank.aim(b, shown.h, sdt); tank.animate(dt * rate, battle.tank.v); tank.aimStation(volleys.aimAt, sdt); } simMs = Math.max(simMs * 0.98, performance.now() - tSim);
  { const on = state === 'play' && cams.mode === 'gnr' && !mapOpen, sg = $('sight'); if (sg.hidden === on) sg.hidden = !on; tank.group.visible = !(on || state === 'play' && (cams.mode === 'citv' || cams.mode === 'hkoi' || cams.mode === 'drv'));   /* the sight looks out from the turret roof: the vehicle's own model would only block it */
    if (on) { const rf = battle._rf, fl = landing[landing.length - 1], T = battle.tank, R = rf ? rf.R : fl ? Math.hypot(fl.to.e - fl.from.e, fl.to.n - fl.from.n) : null, wait = rf ? Math.max(0, rf.at - battle.t) : 0;
      const line = rf ? (cams.onTarget ? (wait > 1.2 ? 'LASING' : 'ON THE WAY IN ' + wait.toFixed(1)) : 'TRAVERSING') : fl ? 'ROUND IN FLIGHT' : battle.t < (T.mainReady || 0) ? 'LOADING' : 'SCANNING';
      const txt = `${R ? 'RNG ' + String(Math.round(R / 10) * 10).padStart(4, '0') : 'RNG ----'}   MPAT   ${String(T.main).padStart(2, '0')} RDS\n${line}`; if ($('sight-data').textContent !== txt) $('sight-data').textContent = txt; const sym = (cams.gYaw == null ? 0 : Math.round(cams.gYaw)).toString().padStart(3, '0') + '°   ' + (scene.camera.fov < 10 ? '10×' : '3×'); if ($('sight-sym').textContent !== sym) $('sight-sym').textContent = sym; } }
  if (cams.mode !== lastMode && state === 'play') { buildBar(); show(); }   /* the view changed (a key, a button, or the camera falling back by itself): the bar and the boxes follow */
  hudBox.update(dt, { on: state === 'play' && !mapOpen, mode: hudMode, seat: !!SEATV[cams.mode], sight: !!SIGHTV[cams.mode], battle, volleys, shown, now: Math.min(tNow, battle.t), playing: playing && state === 'play', graphic: q.get('graphic') !== '0', spectator: set.spectator, sound, frameMs: fps ? 1000 / fps : 0 });
  if (tickT && performance.now() - tickT > 9000) { tickT = 0; $('ticker').classList.add('old'); }   /* nothing new for a while: the ticker goes quiet */
  drawReplay(dt); drawSensors();
  interior.update(dt, { on: state === 'play' && !mapOpen, battle, shown, volleys, cond: set.cond, playing: state === 'play' && playing, speed });
  director.update(dt); xray.update();
  if (state === 'play') { cams.update(dt, ctx()); { const ev = !mapOpen && set.spectator; enemyViews.update({ sightOn: ev && cams.mode === 'enemy' && !!cams.unit, menuOn: ev && (cams.mode === 'enemy' || cams.mode === 'troops' || cams.mode === 'fpv'), fpvOn: ev && cams.mode === 'fpv', volleys, t: Math.min(tNow, battle.t), cams, battle, tank: shown, world, dt }); } drawLog(); checkEnd(); if (performance.now() - capT > 5200) $('caption').style.opacity = 0; }
  else if (!demo.manual) { /* behind the menus: the title's own director (a live battle, or a still picture on Minimum graphics); behind the result, a slow turn */
    titleShow.side = state === 'title' ? 0.17 : 0; titleShow.update(dt, ctx(), state === 'title' ? demoLive() : scene.quality !== 'min'); }
  if (sound.ctx) { const T = battle.tank, tp = scene.at(T.e, T.n, 2), act = state === 'play' && playing; sound.update(dt, { view: state === 'play' ? cams.mode : 'title', cond: set.cond, biome: set.biome, speed: act ? T.v : 0, heading: T.h, turret: T.tur, alive: T.alive && state === 'play', camDist: camDist(tp), rate: speed, interior, drones: act ? volleys.info.filter(m => m.drone).map(m => ({ id: m.th.idx + ':' + m.th.t0, d: camDist(m.p) })) : [], ...voices() }); }
  if (mapOpen) { mapv.draw(mapState()); if (state === 'play') { drawLog(); } }
  else if (state !== 'play' && (pagesOpen || state === 'title' && !demoLive())) { stillT -= raw; if (stillT <= 0) { stillT = 0.5; scene.render(dt); drawMarks(); } }   /* a still picture behind a menu is redrawn twice a second, not every frame */
  else { scene.render(dt); drawMarks(); }
  cpuMs = Math.max(cpuMs * 0.97, performance.now() - tCpu);
  frames++; if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; if (state === 'play' && hudMode === 'engineer') drawStatus();
    if (showPerf) { const s = scene.stats(); hud.textContent = `${fps} fps   worst frame ${worst.toFixed(0)} ms   slow frames ${slow}\n${QUALITY[s.quality].name} graphics   ${Math.round(canvas.width)}×${Math.round(canvas.height)} (${Math.round(s.scale * 100)}% scale)\nsim ${simMs.toFixed(1)} ms   whole frame on the processor ${cpuMs.toFixed(1)} ms\nModels: tank ${tank.loaded ? (tank.variant || 'M1A2 SEPv2') : tank.failed ? 'FAILED (boxes)' : 'loading'}, enemy teams ${teams.filter(t => t.loaded).length}/${teams.length}, vehicles ${props.filter(p => p.view.loaded).length}/${props.length}\nGraphics chip: ${scene.gpu()}${scene.software ? '   << SOFTWARE DRAWING: the graphics card is not being used' : ''}\n${s.calls} draw calls   ${(s.triangles / 1e6).toFixed(2)} M triangles\n${s.trees} trees   ${s.buildings} buildings   particles ${scene.fx.n}`; } worst = 0; slow = 0; }
}
window.addEventListener('resize', () => scene.resize());
const api = window.__beta = { props, get volleys() { return volleys; }, prof(n = 30) { const T = {}, tm = (k, f) => { const a = performance.now(); for (let i = 0; i < n; i++) f(); T[k] = +((performance.now() - a) / n).toFixed(3); }; tm('step', () => battle.step()); tm('place', place); tm('volleys', () => volleys.update(battle.t, 0.016)); tm('cams', () => cams.update(0.016, ctx())); tm('log', drawLog); tm('end', () => { const e = ended; checkEnd(); ended = e; }); tm('sound', () => sound.ctx && sound.update(0.016, { drones: [] })); tm('marks', drawMarks); tm('status', drawStatus); tm('fx', () => scene.fx.update(0.016, scene.wind)); tm('trees', () => scene.trees.userData.update(scene.camera.position)); tm('matrices', () => scene.scene.updateMatrixWorld()); let nodes = 0; scene.scene.traverse(() => nodes++); T.nodes = nodes; T.logLen = battle.log.length; return T; }, bank: () => [simBank, tNow, battle === api.battle, battle.t], advance, sound, teams: () => teams, openMap, mapv, world, scene, battle: null, THREE, tank, cams, interior, set, ready: false, start, setPlaying(v) { playing = v; }, state: () => state, hud: () => hudMode, faces, hudBox, setHud, setView, toTitle, titleShow,
  /* the title's show, stepped by hand for tests: titleReset(seed) starts it, titleTick(dt) is one frame of dt seconds, titleInfo() says where it is */
  titleReset(seed) { demo.manual = true; demo.seed = seed; titleBattle(); }, titleTick(dt) { demo.manual = true; demoTick(dt, true); place(); volleys.update(Math.min(tNow, battle.t), dt); titleShow.side = 0.17; titleShow.update(dt, ctx(), true); }, titleAuto() { demo.manual = false; },
  titleInfo() { const c = scene.camera, T = battle.tank; return { t: +battle.t.toFixed(2), tNow: +tNow.toFixed(3), showT: +titleShow.t.toFixed(3), shot: titleShow.shot.key, live: demoLive(), seed: demo.seed, cam: [c.position.x - T.e, c.position.y, c.position.z + T.n].map(v => +v.toFixed(2)), alive: T.alive }; },
  runTo(t) { while (battle.t < t && battle.tank.alive) battle.step(); tNow = battle.t; place(); }, playFor(sec) { const n = Math.round(sec / battle.dt); for (let i = 0; i < n; i++) { battle.step(); if (battle._pending) battle.step(); tNow = battle.t; place(); volleys.update(battle.t, battle.dt); scene.fx.update(battle.dt); } },
  near(dist, height, brg) { const T = battle.tank, a = (brg || 200) * Math.PI / 180; this.view(T.e + Math.sin(a) * dist, T.n + Math.cos(a) * dist, 0, height, T.e, T.n); },
  view(e, n, dist, height, lookE, lookN) { cams.mode = 'free'; scene.controls.enabled = false; scene.camera.up.set(0, 1, 0); scene.camera.position.set(e, world.h(e, n) + height, -n); scene.camera.lookAt(lookE, world.h(lookE, lookN) + 2, -lookN); } };
inside(); setFinish(set.biome, set.cond); state = 'title'; titleBattle(); buildTitle(); if (q.get('play') === '1') start(); else show();
api.ready = true; $('veil').hidden = true; requestAnimationFrame(frame);
