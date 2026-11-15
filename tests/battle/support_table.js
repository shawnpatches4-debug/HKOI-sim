// node tests/battle/support_table.js [battles per cell, default 200] [support | bombers | platoon | air] [skills, e.g. trained,veteran] [only=ambush,heavy]
// Honest numbers for the friendly support and the bomber drone, on paired seeds (every cell of a row fights the same 200 battles:
// same ground, same enemy placement seed). As in the page: enemy commander 'auto', fate on, one wave, up to 600 s; ground and mission
// mixed (hold, hold, advance, hunt). 200 battles a cell: a margin of about +-7 points on a loss rate.
//   support : the five standard forces of the setup screen, M1 with HKOI + Trophy (and with neither), with no support, a wingman,
//             artillery, a scout drone, and all three. M1 lost = destroyed or abandoned.
//   bombers : the "Bomber drones" force and a force of two bomber crews alone, under the four defence setups.
//   air     : the armoured counter-attack, the mechanised ambush and the prepared defence with and without two air strikes.
//   platoon : the three new forces as the setup screen plays them, against the same enemy without the support.
const { HK, Battle, Support, EnemyVeh } = require('./load.js');
const args = process.argv.slice(2), N = +(args.find(a => /^\d+$/.test(a)) || 200), WHAT = args.find(a => /^(support|bombers|platoon|air)$/.test(a)) || 'support', SKILLS = (args.find(a => /^(green|trained|expert|veteran)(,|$)/.test(a)) || 'trained').split(',');
const ONLY = (args.find(a => /^only=/.test(a)) || '').slice(5).split(',').filter(Boolean);
const cfg = HK.defaultConfig();
const FORCES = {
  light: { force: [{ type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  ambush: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }] },
  drones: { force: [{ type: 'fpv', n: 2 }, { type: 'fpv_fiber', n: 1 }, { type: 'kornet', n: 1 }] },
  standoff: { force: [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], raid: { minR: 2000, window: 6 } },
  heavy: { force: [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }] },
};
const BIOMES = ['farmland', 'desert', 'town', 'forest'], MISSIONS = ['hold', 'hold', 'advance', 'hunt'];
function setup(kind) { const c = JSON.parse(JSON.stringify(cfg)); if (kind === 'trophy' || kind === 'neither') c.hkoi_enabled = false; if (kind === 'hkoi' || kind === 'neither') c.aps.enabled = false; return { cfg: c, lookup: c.hkoi_enabled ? HK.meetLookup(c) : {} }; }
const SETUPS = { both: setup('both'), trophy: setup('trophy'), hkoi: setup('hkoi'), neither: setup('neither') };
const pc = (x, n) => (n ? (100 * x / n).toFixed(0) : '0').padStart(3) + '%';
function fight(i, skill, F, su, support, mission) {
  const b = new Battle.Battle(Object.assign({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 500 + i, skill, mission: mission || MISSIONS[i % 4], waves: 1, force: F.force, raid: F.raid, commander: 'auto', fate: true, support }, SETUPS[su]));
  let n = 0; while (b.t < 600 && b.tank.alive && !b.over && n++ < 100000) b.step(); return b;
}
const lostP = b => !b.tank.alive || (b.over && b.over.result === 'abandoned');
if (WHAT === 'support') {
  const VAR = [['none', undefined], ['wingman', { wingman: 'same' }], ['artillery', { artillery: 3 }], ['scout', { scout: true }], ['all three', { wingman: 'same', artillery: 3, scout: true }]];
  console.log(`Standard forces, ${N} battles a cell, same seeds across a row. M1 (the player's tank) lost:`);
  console.log('force     crews    defences   none  wingman  artillery  scout  all three |  with a wingman: wingman lost, missiles at it / at the player, hits saved by the other tank\'s HKOI a battle |  artillery: missions, teams knocked out a battle |  scout: teams found a battle, lost');
  for (const key of Object.keys(FORCES).filter(k => !ONLY.length || ONLY.includes(k))) for (const skill of SKILLS) for (const su of ['both', 'neither']) {
    const row = [], x = {};
    for (const [name, sup] of VAR) { let lost = 0, wl = 0, wf = 0, pf = 0, as = 0, am = 0, ak = 0, sf = 0, sl = 0;
      for (let i = 0; i < N; i++) { const b = fight(i, skill, FORCES[key], su, sup); if (lostP(b)) lost++; const r = b.supReport();
        if (r.on) { if (r.wing) { if (!r.wing.alive) wl++; wf += r.wing.fired; } as += r.stat.assistKills; am += r.stat.artCalled - (r.stat.artCancelled || 0); ak += r.stat.artKills; sf += r.stat.scoutFound; if (r.scout && !r.scout.alive) sl++; } pf += b.summary().fired; }
      row.push(lost); x[name] = { wl, wf, pf, as, am, ak, sf, sl }; }
    const w = x.wingman, a = x.artillery, s = x.scout;
    console.log(`${key.padEnd(9)} ${skill.padEnd(8)} ${su.padEnd(8)} ${row.map(v => pc(v, N)).join('     ')}  |  ${pc(w.wl, N)}, ${(w.wf / N).toFixed(2)} / ${(w.pf / N).toFixed(2)} (alone ${(x.none.pf / N).toFixed(2)}), ${(w.as / N).toFixed(2)}  |  ${(a.am / N).toFixed(2)}, ${(a.ak / N).toFixed(2)}  |  ${(s.sf / N).toFixed(2)}, ${pc(s.sl, N)}`);
  }
} else if (WHAT === 'bombers') {
  const FB = { 'bomber drones (2 crews, Konkurs, RPG)': Support.FORCES.bombers, 'two bomber crews alone': { force: [{ type: 'bomber', n: 2 }] } };
  console.log(`Bomber drone, ${N} battles a cell, same seeds across a row (hold). M1 lost:`);
  console.log('force                                   crews     both  Trophy  HKOI  neither |  with both: sorties, HKOI bursts, drones shot down, bombs dropped, bomb hits a battle; M1 lost to a bomb  |  with neither: bombs dropped, bomb hits a battle; M1 lost to a bomb');
  for (const [name, F] of Object.entries(FB)) for (const skill of SKILLS) { const row = {}, st = {};
    for (const su of ['both', 'trophy', 'hkoi', 'neither']) { let lost = 0; const S = { so: 0, bu: 0, dn: 0, dr: 0, hi: 0, kb: 0 };
      for (let i = 0; i < N; i++) { const b = fight(i, skill, F, su, undefined, 'hold'); if (lostP(b)) lost++; const r = b.supReport(); if (r.on) { S.so += r.stat.bomberSorties; S.bu += r.stat.bomberBursts; S.dn += r.stat.bomberDown; S.dr += r.stat.bombsDropped; S.hi += r.stat.bombHits; S.kb += r.stat.bombKills; } }
      row[su] = lost; st[su] = S; }
    const B = st.both, Z = st.neither, f = v => (v / N).toFixed(2);
    console.log(`${name.padEnd(39)} ${skill.padEnd(8)} ${pc(row.both, N)}   ${pc(row.trophy, N)}  ${pc(row.hkoi, N)}    ${pc(row.neither, N)}  |  ${f(B.so)}, ${f(B.bu)}, ${f(B.dn)}, ${f(B.dr)}, ${f(B.hi)}; ${pc(B.kb, N)}  |  ${f(Z.dr)}, ${f(Z.hi)}; ${pc(Z.kb, N)}   (Trophy only: bombs ${f(st.trophy.dr)}, hits ${f(st.trophy.hi)}, lost to a bomb ${pc(st.trophy.kb, N)}; HKOI only: shot down ${f(st.hkoi.dn)}, bombs ${f(st.hkoi.dr)}, lost to a bomb ${pc(st.hkoi.kb, N)})`); }
} else if (WHAT === 'air') {
  const FA = { 'armoured counter-attack': EnemyVeh.FORCES.armoured_counter, 'mechanised ambush': EnemyVeh.FORCES.mech_ambush, 'prepared defence': FORCES.heavy };
  console.log(`Air strikes (two a battle), ${N} battles a cell, same seeds with and without. M1 lost:`);
  console.log('force                     crews    defences  without  with air |  called  weapons released  waved off  aircraft lost (battles)  enemy vehicles destroyed by air  teams knocked out by air (a battle)  followed a moved target | enemy vehicles lost in all: without / with');
  for (const [name, F] of Object.entries(FA)) for (const skill of SKILLS) for (const su of ['both', 'neither']) { let a = 0, z = 0, vz = 0, va = 0; const S = { c: 0, d: 0, w: 0, l: 0, v: 0, t: 0, f: 0 };
    for (let i = 0; i < N; i++) { const b0 = fight(i, skill, F, su, undefined), b = fight(i, skill, F, su, { air: 2 }), r = b.supReport().stat; if (lostP(b0)) z++; if (lostP(b)) a++;
      S.c += r.airCalled; S.d += r.airDone; S.w += r.airWaved; S.l += r.airLost; S.v += r.airVehKills; S.t += r.airTeamKills; S.f += r.airFollowed;
      vz += b0.vehicles ? b0.vehicles().filter(v => !v.alive && v.kind !== 'uaz').length : 0; va += b.vehicles ? b.vehicles().filter(v => !v.alive && v.kind !== 'uaz').length : 0; }
    const f = v => (v / N).toFixed(2);
    console.log(`${name.padEnd(25)} ${skill.padEnd(8)} ${su.padEnd(8)}  ${pc(z, N)}     ${pc(a, N)}   |  ${f(S.c)}  ${f(S.d)}  ${f(S.w)}  ${pc(S.l, N)}  ${f(S.v)}  ${f(S.t)}  ${f(S.f)}  |  ${f(vz)} / ${f(va)}`); }
} else {
  console.log(`The three new forces, ${N} battles a cell, HKOI + Trophy, same seeds with and without their support. M1 lost:`);
  console.log('force             crews     with support  without  |  wingman lost  hits saved by the other HKOI  artillery kills  scout finds  bomb hits (a battle)');
  for (const key of ['platoon_defence', 'section_attack', 'fire_support']) for (const skill of SKILLS) { const F = Support.FORCES[key]; let a = 0, z = 0, wl = 0, as = 0, ak = 0, sf = 0, bh = 0, hasW = false;
    for (let i = 0; i < N; i++) { const b = fight(i, skill, F, 'both', F.support), r = b.supReport(); if (lostP(b)) a++; if (r.wing) { hasW = true; if (!r.wing.alive) wl++; } as += r.stat.assistKills; ak += r.stat.artKills; sf += r.stat.scoutFound; bh += r.stat.bombHits; if (lostP(fight(i, skill, F, 'both', undefined))) z++; }
    console.log(`${key.padEnd(17)} ${skill.padEnd(8)}     ${pc(a, N)}        ${pc(z, N)}   |  ${hasW ? pc(wl, N) : '   -'}   ${(as / N).toFixed(2)}   ${(ak / N).toFixed(2)}   ${(sf / N).toFixed(2)}   ${(bh / N).toFixed(2)}`); }
}
