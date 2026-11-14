// node tests/app/cdrview.test.mjs [out folder] : the commander view of the map, without a browser.
// The real MapView and CommanderView draw a real battlefield into an offline canvas, driven by a made-up commander
// (tests/beta/fake_commander.js) on a real battle. Checks every kind of order, a stale report, the three sources of his picture,
// spectator against fog of war, a lost commander, no commander, the same easing at 30/60/144/240 frames a second, and a jump back
// in time. Writes pictures to the out folder. Needs a canvas for node: CANVAS_MODULE=<path to @napi-rs/canvas> (npm i @napi-rs/canvas
// in any scratch folder); without it the test says so and stops.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = process.argv[2] || '/tmp/cdrview';
let CV; try { CV = require(process.env.CANVAS_MODULE || '@napi-rs/canvas'); } catch (e) { console.log('CDRVIEW NODE CHECK SKIPPED: no canvas module (set CANVAS_MODULE)'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
const W = 1280, H = 720, bad = [];
// ---- just enough of a page for the two modules
const mkEl = tag => { const o = { tag, hidden: false, style: {}, dataset: {}, children: [], className: '', _t: '', classList: { s: new Set(), toggle(c, v) { v ? this.s.add(c) : this.s.delete(c); }, add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
  append(...a) { o.children.push(...a); }, insertBefore(a) { o.children.push(a); }, querySelector() { return null; }, setAttribute() {}, addEventListener() {}, click() { if (o.onclick) o.onclick(); } };
  Object.defineProperty(o, 'textContent', { get() { return o._t + o.children.map(c => c.textContent).join(' '); }, set(v) { o._t = v; o.children.length = 0; } }); return o; };
globalThis.document = { head: mkEl('head'), body: mkEl('body'), getElementById: () => null, createElement: tag => tag === 'canvas' ? CV.createCanvas(4, 4) : mkEl(tag) };
const mem = {}; globalThis.localStorage = { getItem: k => k in mem ? mem[k] : null, setItem(k, v) { mem[k] = String(v); } };
globalThis.window = globalThis; window.devicePixelRatio = 1;
const { HK, Battle } = require(path.join(ROOT, 'tests/battle/load.js'));
const { MapView } = await import(path.join(ROOT, 'src/app/mapview.js'));
// ---- a real battle, one minute in
const cfg = HK.defaultConfig(), B = new Battle.Battle({ biome: 'farmland', mapSeed: 3, seed: 1, skill: 'trained', cfg, lookup: HK.meetLookup(cfg), force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 1 }, { type: 'fpv_fiber', n: 1 }] });
B.run(60); const realCdr = typeof B.commander;
const cv = CV.createCanvas(W, H), host = mkEl('div'); cv.getBoundingClientRect = () => ({ width: W, height: H, left: 0, top: 0 }); cv.addEventListener = () => {}; cv.parentElement = host;
const M = new MapView(cv); M.setWorld(B.world); M.fit(); M.scale *= 2.6; M.cx = B.tank.e + 150; M.cn = B.tank.n + 250;     /* zoomed on the fight, as a player would */
const mapState = (spectator, t, dt) => ({ tank: B.tank, showAll: spectator, units: B.units.map(u => ({ e: u.e, n: u.n, name: `${u.spec.name} #${u.id + 1}`, state: u.state, known: u.known, alive: u.alive })), missiles: [], battle: B, t: t == null ? B.t : t, dt: dt == null ? 0.016 : dt, fit: FIT });
let FIT = false;   /* the pictures below use the test's own zoom; the automatic one is checked at the end */
const save = name => fs.writeFileSync(path.join(OUT, name + '.png'), cv.toBuffer('image/png'));
const labels = () => M.cdr.state().labels, has = w => labels().some(l => l.includes(w));
const rows = () => M.cdr.rows.children.filter(r => r.tag === 'button').map(r => r.textContent);

// 1. the ordinary map is as before, and the view is off until asked for
M.viewshedFor(B.tank.e, B.tank.n); M.draw(mapState(true)); save('map_normal');
if (M.cdr.on || !M.cdr.list.hidden) bad.push('the commander view is on before anyone asked');
// 2. a battle with no commander function at all
M.cdr.setOn(true); M.draw(mapState(true));
if (realCdr !== 'function') { if (M.cdr.none.hidden || !M.cdr.list.hidden || M.cdr.none.textContent !== 'No enemy commander in this battle') bad.push('a battle without a commander does not say so'); }
if (mem['hkoi.cdrview'] !== 'true') bad.push('the choice is not remembered');
// 3. the made-up commander: every kind of order
(0, eval)(fs.readFileSync(path.join(ROOT, 'tests/beta/fake_commander.js'), 'utf8'));
B.commander = window.__fakeCommander; B.vehicles = window.__fakeVehicles;
M.draw(mapState(true)); save('cdr_spectator');
const L = labels(); console.log('labels:\n  ' + L.join('\n  ')); console.log('list:\n  ' + rows().join('\n  ')); console.log('head: ' + M.cdr.head.textContent);
for (const w of ['watch the valley', 'strike the tank', 'north ridge', 'by UAZ', 'fix the tank', 'commit down', 'break contact', 'hold fire', 'Tank believed here', 'reported 38 s ago', 'He expects it here', 'his picture is', 'Tank (true position)', 'WRONG', 'BMP-2', 'T-72B3', 'T-90M', 'UAZ', 'arrives in 3:20']) if (!has(w)) bad.push(`nothing on the map says "${w}"`);
if (rows().length !== 10 || !rows()[0].startsWith('Break') || !rows()[9].includes('done')) bad.push('the list is not ten orders, newest first, the finished one last');
if (rows().filter(r => r.includes('Wrong:')).length !== 2) bad.push('wrong orders are not flagged in the list for the spectator');
// the countdown counts
B.t += 10; M.draw(mapState(true)); if (!has('arrives in 3:10')) bad.push('the time of arrival did not count down'); B.t -= 10; M.cdr.lastT = null;
// 4. click an order
M.draw(mapState(true)); M.cdr.rows.children.find(r => r.textContent.includes('north ridge')).click(); M.draw(mapState(true)); save('cdr_picked');
if (M.cdr.sel !== 5 || M.cdr.rows.children.filter(r => / on$/.test(r.className)).length !== 1) bad.push('clicking an order does not pick it'); M.cdr.sel = null; M.cdr.listSig = '';
// 5. a stale report
const a0 = M.cdr.state().believed; window.__fakeStale = 400; M.cdr.lastT = null; M.draw(mapState(true)); save('cdr_stale'); const a1 = M.cdr.state().believed; window.__fakeStale = 0;
console.log('believed [e, n, radius, strength]: fresh', a0, 'stale', a1); if (!(a0[3] > 0.95 && a1[3] < 0.45 && a1[2] > a0[2] + 200)) bad.push('a stale report does not fade and widen');
// 6. where his picture came from
window.__fakeSrc = 'sound'; M.draw(mapState(true)); if (!has('heard the gun 38 s ago')) bad.push('a picture from sound is not said so');
window.__fakeSrc = 'plan'; M.draw(mapState(true)); if (!has('laid for this spot, nothing seen yet')) bad.push('a picture from the plan is not said so'); window.__fakeSrc = null;
// 7. fog of war: nothing of the truth
M.cdr.lastT = null; M.draw(mapState(false)); save('cdr_fog');
if (labels().some(l => /true position|WRONG| off/.test(l)) || rows().some(r => r.includes('Wrong:')) || / off/.test(M.cdr.head.textContent)) bad.push('with fog of war on, the view gives away the true tank or his error');
// 8. commander lost
window.__fakeLost = true; M.cdr.lastT = null; M.draw(mapState(true)); save('cdr_lost');
if (!M.cdr.head.textContent.includes('Commander lost: teams act on their own') || rows().length || M.cdr.state().orders.length) bad.push('a lost commander is not shown plainly with his orders gone'); window.__fakeLost = false;
// 9. no commander
window.__fakeNone = true; M.draw(mapState(true)); if (M.cdr.none.hidden || !M.cdr.list.hidden) bad.push('a null commander does not show the note alone'); window.__fakeNone = false;
// 10. the same easing at any frame rate: 2 s of frames, an order given at 0.5 s, the report and a destination moving at 1 s
const fake = B.commander, res = {};
for (const fps of [30, 60, 144, 240]) { let shift = 0; B.commander = function () { const C = fake.call(this); if (shift) { C.picture.e += 400; C.picture.n += 300; C.plan[4].dest = [C.plan[4].dest[0] + 300, C.plan[4].dest[1]]; } return C; };
  window.__fakeT = 38; M.cdr.lastT = null; M.draw(mapState(true, 38, 0));
  for (let i = 1; i <= 2 * fps; i++) { const t = 38 + i / fps; window.__fakeT = t + 1.5 + 1e-9; if (i >= fps) shift = 1; M.draw(mapState(true, t, 1 / fps)); if (fps === 60 && i === 66) save('cdr_easing'); }
  res[fps] = M.cdr.state(); }
B.commander = fake; let worst = 0;
for (const fps of [60, 144, 240]) { res[30].orders.forEach((a, i) => { const b = res[fps].orders[i]; if (!b || a[0] !== b[0]) bad.push('different orders at ' + fps + ' fps'); else for (let k = 1; k < a.length; k++) worst = Math.max(worst, Math.abs(a[k] - b[k])); }); res[30].believed.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - res[fps].believed[k])); }); }
const o9 = res[30].orders.find(o => o[0] === '9'), o5 = res[30].orders.find(o => o[0] === '5');
console.log(`frame rates: largest difference in any eased value across 30/60/144/240 fps = ${worst.toFixed(4)} (metres, or shares of 1); order 9 given during the run: shown ${o9 && o9[1]}, grown ${o9 && o9[2]}; believed position still sliding: ${res[30].believed.slice(0, 2)}`);
if (worst > 0.02) bad.push('the easing is not the same at every frame rate'); if (!o9 || !(o9[1] > 0.9 && o9[1] < 1)) bad.push('the order given during the run was not caught easing in');
// 11. a jump back in time leaves nothing over
window.__fakeT = 100; M.cdr.lastT = null; M.draw(mapState(true, 100)); const n100 = M.cdr.state().orders.length; window.__fakeT = 12; M.draw(mapState(true, 12)); const back = M.cdr.state().orders; window.__fakeT = null;
console.log('jump back from 100 s to 12 s: arrows', n100, '->', back.map(o => o[0]).join(','), '; list rows', rows().length);
if (n100 !== 9 || back.map(o => o[0]).sort().join() !== '1,2' || back.some(o => o[1] !== 1 || o[2] !== 1) || rows().length !== 3) bad.push('a jump back in time left orders from the later moment');
// 11b. switching the view on closes the map in on his forces: everything of his is inside the picture, clear of the list
M.fit(); FIT = true; M.cdr.setOn(false); M.cdr.setOn(true); M.draw(mapState(true)); M.draw(mapState(true)); save('cdr_autofit'); FIT = false;
{ const out = B.units.filter(u => u.alive && !u.gone).map(u => M.toScreen(u.e, u.n)).filter(p => p[0] < 300 || p[0] > W - 10 || p[1] < 60 || p[1] > H - 60); console.log('automatic zoom: scale', M.scale.toFixed(3), 'px per metre; teams outside the clear part of the picture:', out.length); if (out.length) bad.push('the automatic zoom leaves teams outside the picture or under the list'); }
// 12. switched off again: the ordinary map, nothing of the commander's on the page
M.cdr.setOn(false); M.draw(mapState(true)); save('map_normal_after'); if (!M.cdr.list.hidden || !M.cdr.none.hidden || mem['hkoi.cdrview'] !== 'false') bad.push('switching the view off leaves its panels up');
console.log('battle.commander on this branch before the fake: ' + realCdr + '. Pictures in ' + OUT);
console.log('CDRVIEW NODE CHECK ' + (bad.length ? 'FAILED: ' + bad.join('; ') : 'PASSED'));
process.exit(bad.length ? 1 : 0);
