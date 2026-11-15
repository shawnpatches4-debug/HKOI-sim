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
    { key: 'r2', name: 'Stand-off raid', brief: 'Three launchers from two kilometres, firing over a few seconds: the fight HKOI was built for.', biome: 'farmland', cond: 'day', map: 3, mission: 'hold', skill: 'trained', waves: 1, force: [K(2), S(1)], raid: { minR: 2000, window: 6 } },   /* map 3: map 5 has no ground beyond 2 km that can see the vehicle's position, and Kornet teams fire only from 2 km out */
    { key: 'r3', name: 'Roadside ambush', brief: 'Missile teams and a rocket team lie along your route. Reach the objective.', biome: 'farmland', cond: 'overcast', map: 8, mission: 'advance', skill: 'green', waves: 1, force: [K(1), S(2), R(1)] },
    { key: 'r4', name: 'Forest road', brief: 'An advance through woodland against trained crews. Short sight lines, little warning.', biome: 'forest', cond: 'fog', map: 4, mission: 'advance', skill: 'trained', waves: 2, force: [S(3), R(2)] },   /* no Kornet teams: woodland gives almost no 2 km sight lines */
    { key: 'r5', name: 'Drone hunt', brief: 'Drone crews somewhere out there, and one Kornet. HE against drones, obscurant against the missile.', biome: 'desert', cond: 'dusk', map: 11, mission: 'hold', skill: 'trained', waves: 1, force: [F(2), FF(1), K(1)] },
    { key: 'r6', name: 'Two waves at dawn', brief: 'A trained ambush, then a second group from another side. Trophy has eight shots: make them last.', biome: 'farmland', cond: 'dawn', map: 3, mission: 'hold', skill: 'trained', waves: 2, force: [K(2), S(2), R(1)] },
    { key: 'r7', name: 'Edge of town', brief: 'Close country, rocket teams working in through the buildings, missiles from the fields beyond.', biome: 'town', cond: 'overcast', map: 7, mission: 'hunt', skill: 'trained', waves: 2, force: [K(1), S(1), R(3)] },
    { key: 'r8', name: 'Prepared defence', brief: 'Ten teams with a laser designator and drones, three waves, expert crews.', biome: 'farmland', cond: 'rain', map: 9, mission: 'hold', skill: 'expert', waves: 3, force: [K(3), S(2), L(1), F(2), R(2)] },
    { key: 'r9', name: 'Night of the veterans', brief: 'Veteran crews at night. They fire together and they do not miss much.', biome: 'desert', cond: 'night', map: 6, mission: 'hold', skill: 'veteran', waves: 3, force: [K(3), S(2), R(1), F(1)] },
    { key: 'r10', name: 'Where it runs out', brief: 'Five waves of veterans with everything they have. Nobody expects you to come back.', biome: 'farmland', cond: 'snow', map: 12, mission: 'hold', skill: 'veteran', waves: 5, force: [K(2), S(2), L(1), F(2), R(1)] },
  ];

  // The debrief: what happened, counted from the finished battle, and a score out of 100.
  //   50 for the vehicle (alive, fewer points for each hit taken), 20 for the crew, 20 for the mission, 10 for what is left in the magazines.
  // That score judges the fight. When the PLAYER commanded (battle option command: 'player', src/battle/orders.js) the debrief also
  // carries `decisions`: a separate mark out of 20 for what he decided, never added to the 100 so that scores stay comparable with
  // battles the crew fought alone. It is null when the crew commanded. What it counts, and what it assumes:
  //   8  staying out of view: the share of the time in contact (a located, live enemy team exists) that no located team had a clear
  //      line to the hull. Assumes a commander should fight hull-down or from cover whenever an enemy is located; it cannot tell a
  //      needed exposure (crossing open ground to the objective) from a needless one.
  //   6  front to the fire: the share of direct-fire shots (missiles and rockets, not drones) that were launched from within 45 degrees
  //      of the hull front. Assumes the frontal arc is where the armour and both Trophy sides do most good. Left to itself the driver
  //      squares up to the main threat; a bearing ordered by the player replaces that.
  //   6  rounds that counted: the share of main gun rounds at teams on foot that knocked their target out. Assumes a round that only
  //      pins a team was a poor use of it; long shots at dug-in teams (under one in five at 2 km) are the player's to hold back.
  // A part with nothing to judge (no contact, no shot at the vehicle, fewer than two rounds fired) is left out and the rest is scaled to 20.
  function decide(b) {
    const st = b.orderStats ? b.orderStats() : null; if (!st) return null;
    const lines = [], ang = (a, c) => Math.abs(((a - c + 540) % 360) - 180); let got = 0, of = 0;
    const add = (name, value, share, max, note) => { const pts = share == null ? null : +(max * share).toFixed(1); if (pts != null) { got += pts; of += max; } lines.push({ name, value, pts, of: max, note: note || '' }); };
    add('Staying out of view', st.contact >= 10 ? `hull in a located team's view for ${st.exposed} s of ${st.contact} s in contact` : 'hardly any time in contact: not judged', st.contact >= 10 ? 1 - st.exposed / st.contact : null, 8, 'hull-down or in cover whenever an enemy is located');
    let shots = 0, front = 0; for (const v of b.volleys) for (const l of v.launches) { if (l.arrival || l.u.spec.indirect) continue; shots++; if (ang(l.brg, v.at.h) <= 45) front++; }
    add('Front to the fire', shots ? `${front} of ${shots} missiles and rockets came from within 45 degrees of the hull front` : 'nothing was fired at the vehicle: not judged', shots ? front / shots : null, 6, 'the thickest armour and both Trophy sides toward the threat');
    const rounds = (b.shots || []).length, hits = (b.shots || []).filter(x => x.hit).length;
    add('Rounds that counted', rounds >= 2 ? `${hits} of ${rounds} main gun rounds at teams knocked their target out` : 'fewer than two main gun rounds at teams: not judged', rounds >= 2 ? hits / rounds : null, 6, 'a round that only pins a team is counted as wasted');
    return { score: of ? Math.round(20 * got / of) : null, max: 20, orders: st.given, smokesUsed: st.smokesUsed, lines,
      assumptions: ['This mark judges decisions by what came of them in this one battle; luck is in it.', 'It is kept apart from the score out of 100, so commanded battles and watched battles can still be compared.', 'Exposure is counted whenever a located, live enemy team has a clear line to the hull, needed or not.', 'Shots from drones are left out of the facing count: a drone picks its own side.', 'The front is taken as 45 degrees either side of the hull\'s nose.'] };
  }
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
    return { result, score, parts: { vehicle, crew: crewPts, mission, stores }, decisions: decide(b), alive, t: Math.round(b.t), waves: s.waves, wave: s.wave, threats, hits, crewDown: down, by, story,
      hkoiStopped: hkoi, trophyStopped: trophy, trophyLeft: (s.apsL || 0) + (s.apsR || 0), obsLeft: s.obs, heLeft: s.he, mainLeft: s.main,
      teams: b.units.length, destroyed: (b.killedByTank || 0) + (b.killedByMg || 0), pulledOut: b.units.filter(u => u.alive && u.gone).length,
      // the point of HKOI in one line: every missile it stops is a Trophy shot not spent
      saved: hkoi ? `HKOI stopped ${hkoi} threat${hkoi === 1 ? '' : 's'} before Trophy had to: that is ${hkoi} of Trophy's eight shots kept for later.` : 'HKOI stopped nothing in this battle: every threat that was stopped fell to Trophy, cover or the enemy\'s own aim.' };
  }
  const grade = score => score >= 90 ? 'Outstanding' : score >= 75 ? 'Good' : score >= 55 ? 'Costly' : score >= 30 ? 'Bad day' : 'Lost';

  const api = { RUNGS, debrief, grade, decide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKLadder = api;
})(typeof window !== 'undefined' ? window : globalThis);
