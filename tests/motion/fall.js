// node tests/motion/harness.mjs look <kornet|rpg|fpv> tests/motion/fall.js [flat|bumpy]
// A team being knocked out, measured: is there a jolt going from the live pose into the fall, do the bodies end up on the ground
// (not in it, not above it), is the result the same at 30, 60, 144 and 240 frames a second, do they cost nothing once still,
// and does a replay moved to a later time (or wound back) show the right thing.
const F = await import(process.cwd() + '/src/render/figure.js'), names = Object.keys(M.WATCH), out = {};
const HIT = { main: { dead: true, by: 'main', fireBrg: 0, seed: 3, pack: 0 }, mg: { dead: true, by: 'm2', fireBrg: 0, seed: 5, pack: 0 } };
const SCENES = {
  shell_at_the_weapon: [{ t: 1, mode: 'still' }, { t: 6, mode: 'still', info: HIT.main }],
  machine_gun_at_the_weapon: [{ t: 1, mode: 'still' }, { t: 6, mode: 'still', info: HIT.mg }],
  shell_while_moving: [{ t: 4.8, mode: 'still', info: { pack: 9 } }, { t: 3, mode: 'walk', spd: 2.2 }, { t: 6, mode: 'still', info: HIT.main }],
  machine_gun_while_pinned: [{ t: 1, mode: 'still' }, { t: 2.5, mode: 'down' }, { t: 6, mode: 'down', info: HIT.mg }],
};
const joints = () => { D.tv.group.updateMatrixWorld(true); return D.tv.figures.map(f => f.userData.a.rig.bones.map(b => { const m = b.matrixWorld.elements; return [m[12], m[13], m[14]]; })); };
const gap = J => { let lo = 9, hi = -9; J.forEach(f => { let low = 9; f.forEach((p, j) => { low = Math.min(low, p[1] - D.ground(p[0], p[2]) - F.BODY[j]); }); lo = Math.min(lo, low); hi = Math.max(hi, low); }); return [+(lo * 100).toFixed(1), +(hi * 100).toFixed(1)]; };
const far = (A, B) => { let w = 0; A.forEach((f, i) => f.forEach((p, j) => { w = Math.max(w, Math.hypot(p[0] - B[i][j][0], p[1] - B[i][j][1], p[2] - B[i][j][2])); })); return +(w * 100).toFixed(1); };
for (const k in SCENES) {
  const r = M.play(D, SCENES[k], 60), end = {}, o = out[k] = { worst_change_of_speed_in_a_frame_m_s: Math.max(r.dvel.Hips, r.dvel.Head), hands_m_s: Math.max(r.dvel.LeftHand, r.dvel.RightHand), at_s: r.where.Hips };
  for (const fps of [30, 60, 144, 240]) { M.play(D, SCENES[k], fps); end[fps] = joints(); }
  o.lowest_part_of_each_body_above_ground_cm = gap(end[240]); o.frozen = D.tv.frozen;
  o.difference_from_240fps_cm = { fps30: far(end[30], end[240]), fps60: far(end[60], end[240]), fps144: far(end[144], end[240]) };
  o.the_two_men_lie_differently_cm = far([end[240][0].map((p, j) => [p[0] - end[240][0][0][0], p[1], p[2] - end[240][0][0][2]])], [end[240][1].map((p, j) => [p[0] - end[240][1][0][0], p[1], p[2] - end[240][1][0][2]])]);
  const hips = end[240].map(f => f[0]); o.men_apart_m = +Math.hypot(hips[0][0] - hips[1][0], hips[0][2] - hips[1][2]).toFixed(2);
  o.kit_on_the_ground = D.tv.loads.filter(l => l.obj.visible).map(l => l.name + ':' + l.at + (l.mounted ? ' (still on a man!)' : ''));
  // cost once still
  const t0 = performance.now(); for (let i = 0; i < 2000; i++) D.step(1 / 240, 'still', 0); o.cost_once_still_ms = +((performance.now() - t0) / 2000).toFixed(5);
  // a replay moved straight to a minute later: the same bodies, at once
  D.reset(); D.step(1 / 60, 'still', 0); Object.assign(D.info, SCENES[k][SCENES[k].length - 1].info, { deadFor: 60 }); for (const s of SCENES[k].slice(0, -1)) { /* (not replayed: the team is simply found dead) */ }
  D.step(1 / 60, 'still', 0); const jumped = joints(); o.replay_moved_on_bodies_down_at_once = gap(jumped)[1] < 8 && Math.max(...jumped.map(f => f[5][1] - D.ground(f[5][0], f[5][2]))) < 0.45;
  // and wound back: alive again
  D.info.dead = false; D.info.deadFor = 0; for (let i = 0; i < 5; i++) D.step(1 / 60, 'still', 0); o.wound_back_alive_again = D.tv.act !== 'dead' && !D.tv.frozen;
  // another team (another seed) falls another way
  M.play(D, SCENES[k].map(s => s.info && s.info.dead ? Object.assign({}, s, { info: Object.assign({}, s.info, { seed: 11 }) }) : s), 240); o.another_team_falls_differently_cm = far(joints(), end[240]);
}
return JSON.stringify(out, null, 1);
