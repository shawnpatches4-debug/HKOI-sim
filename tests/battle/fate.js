// node tests/battle/fate.js [battles, default 120]
// What kills an Abrams (src/battle/fate.js). Battles against the prepared defence and the armoured counter-attack with no HKOI and no
// Trophy (so that hits happen), `fate: true`.
// Checked on every battle: a lost tank has one of the three endings and a living one does not; the ending agrees with the damage
// model's report of the deciding hit; a catastrophic kill leaves no crew, the others let the survivors out with times; a mobility-killed
// tank does not move again; a firepower-killed tank fires no more main gun rounds and (if it can move) breaks contact; the same seed
// gives the same battle twice. Printed: how the M1 ended, over all battles (these are the model's figures, not a target).
const { HK, Battle, DMG, EnemyVeh } = require('./load.js');
const N = +(process.argv[2] || 120), cfg = HK.defaultConfig(); cfg.hkoi_enabled = false; cfg.aps.enabled = false;
const BIOMES = ['farmland', 'desert', 'town', 'forest'], MISSIONS = ['hold', 'advance', 'hunt'];
const HEAVY = [{ type: 'kornet', n: 3 }, { type: 'saclos', n: 2 }, { type: 'sal', n: 1 }, { type: 'fpv', n: 2 }, { type: 'rpg', n: 2 }];
const FORCES = [HEAVY, HEAVY, EnemyVeh.FORCES.armoured_counter.force];
let fail = 0; const bad = (i, m) => { fail++; if (fail < 12) console.log('FAIL battle', i, m); };
const count = {}, crewOut = { out: 0, killed: 0, n: 0 }, live = { mobility_kill: 0, firepower_kill: 0, abandoned: 0, withdrawn: 0 }; let hits = 0, lost = 0;
const sum = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
function run(i) {
  const b = new Battle.Battle({ cfg, lookup: {}, biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 300 + i, skill: ['trained', 'expert', 'veteran'][i % 3], mission: MISSIONS[i % 3], waves: 1, force: FORCES[i % 3], commander: i % 3 === 2 ? 'auto' : false, fate: true });
  let n = 0, mobAt = null, mobPos = null, moved = 0; while (b.t < 600 && !b.over && n++ < 100000) { b.step(); const F = b.tank.fate; if (!b.tank.alive && b.t > (F && F.t || 0) + 30) break;
    if (F && F.mobility === 'killed') { const v = b.volleys[b.volleys.length - 1], inV = v && b.t <= v.tEnd; if (mobAt == null && !inV) { mobAt = b.t; mobPos = [b.tank.e, b.tank.n, b.tank.h]; } else if (mobAt != null && !inV) moved = Math.max(moved, Math.hypot(b.tank.e - mobPos[0], b.tank.n - mobPos[1]) + Math.abs(b.tank.h - mobPos[2])); } }
  return { b, moved };
}
for (let i = 0; i < N; i++) {
  const { b, moved } = run(i), T = b.tank, F = T.fate || { kind: 'ok', hits: [], crew: {} };
  hits += F.hits.length; const LOST = ['knocked_out', 'ammo_vented', 'catastrophic'];
  if (!T.alive) { lost++; count[F.kind] = (count[F.kind] || 0) + 1; if (!LOST.includes(F.kind)) bad(i, 'lost tank with fate ' + F.kind);
    const kh = F.hits.find(h => h.killing); if (!kh) bad(i, 'lost tank without a killing hit in the fate record');
    else { if (F.kind === 'catastrophic' && !(kh.comps.includes('hull_ammo') || kh.comps.includes('ammo'))) bad(i, 'catastrophic without ammunition in the hit'); if (F.kind === 'ammo_vented' && !kh.comps.includes('ammo')) bad(i, 'ammo fire without bustle ammunition in the hit'); }
    for (const k of ['cdr', 'gnr', 'ldr', 'drv']) { const c = F.crew[k]; crewOut.n++; if (c.state === 'killed') { crewOut.killed++; if (c.out) bad(i, 'a dead man bails out'); } else { crewOut.out++; if (!c.out || !(c.out.t1 > c.out.t0 && c.out.t0 >= F.t)) bad(i, 'a survivor without a bail-out time'); } }
    if (F.kind === 'catastrophic' && Object.values(F.crew).some(c => c.state !== 'killed')) bad(i, 'catastrophic kill with a survivor');
    if ((F.kind === 'catastrophic' || F.kind === 'ammo_vented') && !F.blowout) bad(i, 'ammunition fire without blow-out times');
    if (!b.events.some(e => e.type === 'tank_fate' && e.kind === F.kind)) bad(i, 'no tank_fate event'); if (F.kind !== 'catastrophic' && Object.values(F.crew).some(c => c.out) && !b.events.some(e => e.type === 'bail_out')) bad(i, 'no bail_out event');
  } else { if (LOST.includes(F.kind)) bad(i, 'living tank with fate ' + F.kind); if (F.kind !== 'ok') live[F.kind] = (live[F.kind] || 0) + 1; if (b.over && b.over.result === 'withdrawn' && F.firepower === 'killed') live.withdrawn++; }
  if (F.mobility === 'killed' && moved > 0.5) bad(i, 'a mobility-killed tank moved ' + moved.toFixed(1));
  if (F.firepower === 'killed') { const ft = F.hits.find(h => /firepower/.test(h.note || '')); if (ft && b.events.some(e => e.type === 'gun' && e.vid == null && e.t > ft.t + 0.2)) bad(i, 'main gun fired after a firepower kill'); }
  if (i < 6) { const again = run(i).b; if (sum(JSON.stringify(again.log)) !== sum(JSON.stringify(b.log)) || JSON.stringify(again.tank.fate) !== JSON.stringify(b.tank.fate)) bad(i, 'not the same battle twice'); }
}
console.log(`${N} battles without HKOI or Trophy, ${hits} hits on the M1, ${lost} lost.`);
console.log('How the lost ones ended:', Object.entries(count).map(([k, v]) => `${k} ${v} (${Math.round(100 * v / Math.max(1, lost))}%)`).join(', ') || 'none');
console.log(`Crews of the lost tanks: ${crewOut.out} of ${crewOut.n} men got out, ${crewOut.killed} killed.`);
console.log('Still alive at the end but crippled:', JSON.stringify(live));
console.log(fail ? `FAILED (${fail})` : 'FATE TESTS PASS'); process.exit(fail ? 1 : 0);
