// node tests/app/tour.test.mjs [show] : the briefing's chapters (src/app/tour.js) against the real battles they are built on.
// Each chapter's battle is fought here as the page fights it; the chapter must find its moment in the record, every step must
// lie inside the battle with its times in order, and every sentence must read (no missing number, no dash, not too long).
// `show` prints the whole briefing as text.
import { createRequire } from 'module';
import fs from 'fs';
import { CHAPTERS, sameSetup } from '../../src/app/tour.js';
import { runToEnd } from '../../src/app/scenarios.js';
const require = createRequire(import.meta.url);
const { HK, World, Battle, EnemyVeh, Support } = require('../battle/load.js');
const show = process.argv[2] === 'show';
const mainSrc = fs.readFileSync(new URL('../../src/app/main.js', import.meta.url), 'utf8'), fm = mainSrc.match(/const FORCES = \{[\s\S]*?\n\};/);
const FORCES = Object.assign(new Function(fm[0] + '; return FORCES;')(), EnemyVeh.FORCES, Support.FORCES);
// the page fights every battle with fate on (src/battle/fate.js) and the force's own support with every support choice on 'Auto' (supportOf in main.js)
const supportOf = F => { const S = F.support || {}, o = {}; if (S.wingman) o.wingman = S.wingman; if (S.artillery) o.artillery = S.artillery; if (S.scout) o.scout = true; if (S.air) o.air = S.air; return Object.keys(o).length ? o : undefined; };
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
let bad = 0, nSteps = 0; const fail = (...a) => { bad++; console.log('FAIL', ...a); };
const RIGS = ['tank', 'wide', 'hold', 'low', 'gun', 'cloud', 'replay', 'ride', 'follow', 'site', 'downrange', 'shoulder'], CAMS = ['enemy', 'hkoi', 'in_gnr', 'in_cdr', 'in_ldr', 'in_drv', 'troops', 'cut', 'fpv'];
const AT = ['missile', 'launcher', 'tank', 'station', 'trophy', 'cloud', 'beam', 'point'], LINES = ['beam', 'track', 'tracks'];
let last = null, B = null;
for (const ch of CHAPTERS) {
  const u = ch.setup, F = FORCES[u.force];
  if (!sameSetup(u, last)) { B = runToEnd(new Battle.Battle({ support: supportOf(F), fate: true, world: new World.World({ seed: u.map, biome: u.biome }), seed: u.seed, cfg, lookup, skill: u.skill, cond: 'day', mission: 'hold', waves: u.waves, commander: 'auto', raid: F.raid, force: F.force, crewQuality: 'trained', crewStress: true, armour: false })); last = u; }
  const T = Math.max(5, B.t + 4), M = ch.find(B, HK);
  if (!M) { fail(ch.key, 'the battle no longer holds the moment this chapter needs'); continue; }
  const steps = ch.steps(M); if (!steps.length) fail(ch.key, 'no steps');
  if (show) console.log(`\n=== ${ch.name} (${u.biome} ${u.map}, ${u.force}, ${u.skill}, ${u.waves} waves, seed ${u.seed}; battle ${B.t.toFixed(0)} s) ===`);
  steps.forEach((st, i) => {
    nSteps++; const tag = `${ch.key} step ${i + 1}`;
    if (!(st.from >= 0 && st.to >= st.from - 1e-9 && st.to <= T)) fail(tag, 'times out of order or outside the battle', st.from, st.to, T);
    if (st.to - st.from > 16) fail(tag, 'plays for more than 16 s of battle', (st.to - st.from).toFixed(1));
    if (!(st.rate > 0 && st.rate <= 2)) fail(tag, 'rate', st.rate);
    if ((st.to - st.from) / st.rate > 24) fail(tag, 'takes more than 24 s to watch', ((st.to - st.from) / st.rate).toFixed(1));
    if (!st.shot || !(RIGS.includes(st.shot.rig) || CAMS.includes(st.shot.cam))) fail(tag, 'camera', JSON.stringify(st.shot));
    for (const l of st.lines || []) if (!LINES.includes(l)) fail(tag, 'unknown line', l);
    for (const m of st.marks) { if (!AT.includes(m.at)) fail(tag, 'unknown mark', m.at); if (['missile', 'launcher', 'cloud', 'beam', 'trophy', 'point'].includes(m.at) && !m.id) fail(tag, 'mark without its threat', m.at); const t = typeof m.text === 'function' ? m.text({ b: B, inAir: 2 }) : m.text; if (!t || /undefined|NaN|null|—/.test(t) || t.length > 44) fail(tag, 'label', t); if (m.gone != null && (!m.gone || /undefined|NaN|null|—/.test(m.gone) || m.gone.length > 44)) fail(tag, 'label once the missile is gone', m.gone); }
    if ((st.lines || []).some(l => l === 'beam' || l === 'track') && !st.marks.some(m => m.at === 'missile' || m.at === 'beam')) fail(tag, 'a beam or track line needs a missile to follow');
    let text = ''; try { text = st.text({ b: B, inAir: 3 }); } catch (e) { fail(tag, 'text threw', e.message); }
    if (!text || /undefined|NaN|null|—|Infinity/.test(text)) fail(tag, 'text has a hole in it:', text);
    if (text.length > 470) fail(tag, 'text too long for the card:', text.length);
    if (!st.head || st.head.length > 46) fail(tag, 'heading', st.head);
    if (show) console.log(`\n[${i + 1}] ${st.head}   (${st.from.toFixed(1)} to ${st.to.toFixed(1)} s at x${st.rate}, ${st.shot.rig || st.shot.cam}${st.lines ? ', lines ' + st.lines.join('+') : ''}${st.panel ? ', panel ' + st.panel : ''})\n    ${text}\n    labels: ${st.marks.map(m => `${m.at}: ${typeof m.text === 'function' ? m.text({ b: B, inAir: 2 }) : m.text}`).join(' | ') || '-'}`);
  });
  // the moment itself must be what the chapter says it is
  if (ch.key === 'bloom') { const th = B.volleys[M.id.v].rec.threats.find(o => o.idx === M.id.idx); if (th.defeated_by !== 'hkoi_cut' || !(M.tF < M.tPass && M.tPass <= M.tB + 1e-6 && M.tB < M.tCut && M.tCut < M.tE)) fail(ch.key, 'fire, overtake, bloom, cut and ending are not in that order', M.tF, M.tPass, M.tB, M.tCut, M.tE); }
  if (ch.key === 'drones' && !(M.one.tF < M.one.tK)) fail(ch.key, 'the drone is not shot down after the burst');
  if (ch.key === 'limits' && !(M.close && M.rpg)) fail(ch.key, 'needs both a guided missile and a rocket that Trophy stopped');
  if (!show) console.log('ok  ', ch.key.padEnd(11), steps.length, 'steps');
}
console.log(bad ? `TOUR TESTS FAILED: ${bad}` : `TOUR TESTS PASS (${CHAPTERS.length} chapters, ${nSteps} steps)`);
process.exit(bad ? 1 : 0);
