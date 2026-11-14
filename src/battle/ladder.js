// The ladder: ten raids of rising difficulty, all open from the start, and the debrief that scores a finished battle out of 100.
// The top rungs are meant to be nearly impossible: they show where HKOI and Trophy run out.
//
// A rung is only a set of battle settings (ground, light, mission, enemy force, crew level, number of waves, battle seed), so a rung
// can be replayed, shared as a replay code and studied with "run the numbers" like any other battle.
(function (root) {
  'use strict';
  const K = (n) => ({ type: 'kornet', n }), S = (n) => ({ type: 'saclos', n }), R = (n) => ({ type: 'rpg', n }), F = (n) => ({ type: 'fpv', n }), FF = (n) => ({ type: 'fpv_fiber', n }), L = (n) => ({ type: 'sal', n });
  // Ordered by how often the vehicle survived in 12 trial battles with both defences (see tests/battle/ladder.js): easiest first.
  const RUNGS = [
    { key: 'r1', name: 'First contact', brief: 'Two green wire-guided teams at long range. Hold your ground.', biome: 'desert', cond: 'day', map: 3, mission: 'hold', skill: 'green', waves: 1, force: [S(2)], raid: { minR: 1800, window: 6 } },
    { key: 'r2', name: 'Stand-off raid', brief: 'Three launchers from two kilometres, firing over a few seconds: the fight HKOI was built for.', biome: 'farmland', cond: 'day', map: 5, mission: 'hold', skill: 'trained', waves: 1, force: [K(2), S(1)], raid: { minR: 2000, window: 6 } },
    { key: 'r3', name: 'Roadside ambush', brief: 'Missile teams and a rocket team lie along your route. Reach the objective.', biome: 'farmland', cond: 'overcast', map: 8, mission: 'advance', skill: 'green', waves: 1, force: [K(1), S(2), R(1)] },
    { key: 'r4', name: 'Forest road', brief: 'An advance through woodland against trained crews. Short sight lines, little warning.', biome: 'forest', cond: 'fog', map: 4, mission: 'advance', skill: 'trained', waves: 2, force: [K(2), S(1), R(2)] },
    { key: 'r5', name: 'Drone hunt', brief: 'Drone crews somewhere out there, and one Kornet. HE against drones, obscurant against the missile.', biome: 'desert', cond: 'dusk', map: 11, mission: 'hold', skill: 'trained', waves: 1, force: [F(2), FF(1), K(1)] },
    { key: 'r6', name: 'Two waves at dawn', brief: 'A trained ambush, then a second group from another side. Trophy has eight shots: make them last.', biome: 'farmland', cond: 'dawn', map: 3, mission: 'hold', skill: 'trained', waves: 2, force: [K(2), S(2), R(1)] },
    { key: 'r7', name: 'Edge of town', brief: 'Close country, rocket teams working in through the buildings, missiles from the fields beyond.', biome: 'town', cond: 'overcast', map: 7, mission: 'hunt', skill: 'trained', waves: 2, force: [K(1), S(1), R(3)] },
    { key: 'r8', name: 'Prepared defence', brief: 'Ten teams with a laser designator and drones, three waves, expert crews.', biome: 'farmland', cond: 'rain', map: 9, mission: 'hold', skill: 'expert', waves: 3, force: [K(3), S(2), L(1), F(2), R(2)] },
    { key: 'r9', name: 'Night of the veterans', brief: 'Veteran crews at night. They fire together and they do not miss much.', biome: 'desert', cond: 'night', map: 6, mission: 'hold', skill: 'veteran', waves: 3, force: [K(3), S(2), R(1), F(1)] },
    { key: 'r10', name: 'Where it runs out', brief: 'Five waves of veterans with everything they have. Nobody expects you to come back.', biome: 'farmland', cond: 'snow', map: 12, mission: 'hold', skill: 'veteran', waves: 5, force: [K(2), S(2), L(1), F(2), R(1)] },
  ];

  // The debrief: what happened, counted from the finished battle, and a score out of 100.
  //   50 for the vehicle (alive, fewer points for each hit taken), 20 for the crew, 20 for the mission, 10 for what is left in the magazines.
  // The player gives no orders in this build, so there is no score for decisions yet: the score judges the fight, not the player.
  function debrief(b) {
    const s = b.summary(), crew = s.crew || {}, down = Object.values(crew).filter(x => x !== 'ok').length, alive = !!b.tank.alive;
    const result = !alive ? 'lost' : b.over ? b.over.result : 'time';
    const by = {}; let threats = 0, hkoi = 0, trophy = 0, hits = 0;
    const story = [];
    for (const v of b.volleys) for (const th of v.rec.threats) { threats++; const l = v.launches.find(q => q.u.id === th.uid) || {}, d = th.state === 'hit' ? 'hit' : (th.defeated_by || th.state || 'other');
      const kind = /^hkoi/.test(d) ? 'hkoi' : d === 'aps' ? 'trophy' : d === 'hit' ? 'hit' : d; by[kind] = (by[kind] || 0) + 1; if (kind === 'hkoi') hkoi++; if (kind === 'trophy') trophy++; if (kind === 'hit') hits++;
      story.push({ t: +(v.t0 + th.t0).toFixed(1), tEnd: +(v.t0 + th.viz.end.t).toFixed(1), key: th.key, from: l.u ? `${l.u.spec.name} #${l.u.id + 1}` : th.key, R: Math.round(l.R || 0), brg: Math.round(l.brg || 0), ended: kind, killing: !!th.viz.end.killing, hkoiFired: th.viz.fired != null }); }
    story.sort((a, c) => a.t - c.t);
    const vehicle = alive ? Math.max(20, 50 - hits * 10) : 0, crewPts = alive ? Math.max(0, 20 - down * 7) : Math.max(0, 8 - down * 3);
    const mission = result === 'won' || result === 'objective' ? 20 : result === 'withdrawn' ? 10 : result === 'time' ? 8 : 0;
    const stores = alive ? Math.round(10 * (0.5 * Math.min(1, (s.obs || 0) / 150) + 0.5 * Math.min(1, ((s.apsL || 0) + (s.apsR || 0)) / 8))) : 0;
    const score = vehicle + crewPts + mission + stores;
    return { result, score, parts: { vehicle, crew: crewPts, mission, stores }, alive, t: Math.round(b.t), waves: s.waves, wave: s.wave, threats, hits, crewDown: down, by, story,
      hkoiStopped: hkoi, trophyStopped: trophy, trophyLeft: (s.apsL || 0) + (s.apsR || 0), obsLeft: s.obs, heLeft: s.he, mainLeft: s.main,
      teams: b.units.length, destroyed: (b.killedByTank || 0) + (b.killedByMg || 0), pulledOut: b.units.filter(u => u.alive && u.gone).length,
      // the point of HKOI in one line: every missile it stops is a Trophy shot not spent
      saved: hkoi ? `HKOI stopped ${hkoi} threat${hkoi === 1 ? '' : 's'} before Trophy had to: that is ${hkoi} of Trophy's eight shots kept for later.` : 'HKOI stopped nothing in this battle: every threat that was stopped fell to Trophy, cover or the enemy\'s own aim.' };
  }
  const grade = score => score >= 90 ? 'Outstanding' : score >= 75 ? 'Good' : score >= 55 ? 'Costly' : score >= 30 ? 'Bad day' : 'Lost';

  const api = { RUNGS, debrief, grade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKLadder = api;
})(typeof window !== 'undefined' ? window : globalThis);
