// ================================================================ the enemy commander: an anti-tank force that watches what happens to its shots and changes how it attacks
// It keeps a belief about each thing it cannot see directly (how often a beam is cut, how often the APS stops a round, how often a drone is shot down)
// as a count of times it happened against times it did not, draws a plausible value from each belief, scores every attack it still has the
// weapons for, and fires the best one. It only learns from what an observer at the firing post could see: a missile wandering off after a
// cloud blooms on its line, a flash at the vehicle, a drone feed going dark, a hit.
const TAC = (() => {
  const mod = a => ((a % 360) + 360) % 360;
  const FORCES = {
    section: { name: 'Anti-tank section (2 Kornet posts, 4 drones)', posts: [['kornet', 2400, -25, 4], ['kornet', 2100, 30, 4]], rpg: [], fpv: 4, fiber: 0, sal: 0 },
    platoon: { name: 'Anti-tank platoon (3 missile posts, 2 RPG teams, 12 drones, laser-guided shells)', posts: [['kornet', 2600, -35, 4], ['kornet', 2200, 20, 4], ['saclos', 1800, 60, 3]], rpg: [[250, -70, 3], [300, 80, 3]], fpv: 8, fiber: 4, sal: 2 },
    company: { name: 'Reinforced anti-tank company (5 missile posts, 3 RPG teams, 24 drones, laser-guided shells)', posts: [['kornet', 3200, -50, 4], ['kornet', 2600, -15, 4], ['kornet', 2300, 25, 4], ['kornet', 2900, 65, 4], ['saclos', 1700, -80, 3]], rpg: [[220, -60, 3], [280, 75, 3], [350, 150, 3]], fpv: 16, fiber: 8, sal: 4 },
  };
  const SKILL = { fixed: 'Scripted: repeats the same salvo', adaptive: 'Adaptive: learns from each attack', expert: 'Expert: adaptive, and briefed on HKOI beforehand' };
  const TACTICS = {
    probe: ['Single missile', 'one missile to see how the vehicle defends itself'], pair: ['Paired launch', 'two missiles on one beam half a second apart, so the second arrives while the APS is still resetting'],
    salvo: ['Simultaneous salvo', 'every post fires so the missiles arrive together from different directions'], late: ['Late lasing', 'the gunner holds the beam off the vehicle and swings on for the last seconds, so the warning comes too late to react'],
    drones: ['Drone attack', 'drones have no beam to cut'], rear: ['Drones from behind', "drones circle to the rear arc, where the HKOI gun cannot point"],
    strip: ['Strip the APS, then strike', 'cheap rockets or drones draw the last APS rounds on one side a moment before a missile arrives there'],
    rockets: ['Close assault with rockets', 'the RPG teams close in and fire together; nothing on the vehicle but the APS can stop an unguided rocket'],
    combined: ['Combined attack', 'drones from behind and late-lased missiles from the front, timed to arrive together'],
  };
  function gamma(rng, k) { if (k < 1) return gamma(rng, k + 1) * Math.pow(Math.max(rng.random(), 1e-12), 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = rng.normal(0, 1); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = Math.max(rng.random(), 1e-12); if (Math.log(u) < .5 * x * x + d - d * v + d * Math.log(v)) return d * v; } }
  const draw = (rng, ab) => { const x = gamma(rng, ab[0]), y = gamma(rng, ab[1]); return x / (x + y); }, mean = ab => ab[0] / (ab[0] + ab[1]);
  function open(force, skill) { const F = FORCES[force] || FORCES.platoon;
    return { force, skill: skill || 'adaptive', posts: F.posts.map(([key, R, brg, n], i) => ({ id: 'p' + i, key, R, brg, n })), rpg: F.rpg.map(([R, brg, n], i) => ({ id: 'r' + i, R, brg, n })), fpv: F.fpv, fiber: F.fiber, sal: F.sal,
      // beliefs: [times it happened, times it did not]
      B: skill === 'expert' ? { cut: [3, 2], cutLate: [1, 4], cutSalvo: [2, 3], aps: [4, 1.5], dk: [2, 2], dkRear: [1, 5], acc: [4, 1], dacc: [2, 2] } : { cut: [1, 4], cutLate: [1, 6], cutSalvo: [1, 5], aps: [4, 1.5], dk: [1, 3], dkRear: [1, 5], acc: [4, 1], dacc: [2, 2] },
      apsUsed: { L: 0, R: 0 }, wave: 0, log: [], seen: '', quit: false }; }
  const left = E => ({ missiles: E.posts.reduce((s, p) => s + p.n, 0), rockets: E.rpg.reduce((s, p) => s + p.n, 0), drones: E.fpv + E.fiber, shells: E.sal });
  const sideOf = (brg, hull) => { const r = mod(brg - hull); return r > 0 && r < 180 ? 'R' : 'L'; };
  // ---- choose the next attack
  function plan(E, hull, rng) {
    if (E.quit) return null; const b = {}, fixed = E.skill === 'fixed'; for (const k in E.B) b[k] = fixed ? mean(E.B[k]) : draw(rng, E.B[k]);
    const posts = E.posts.filter(p => p.n > 0), nDr = E.fpv + E.fiber, apsAt = brg => E.apsUsed[sideOf(brg, hull)] >= 3 ? .05 : b.aps, W = E.wave, tac = (m, id) => ({ w: W, m, id });
    const fl = p => p.R / ({ kornet: 250, saclos: 400 }[p.key]), bestPost = () => posts.slice().sort((x, y) => apsAt(x.brg) - apsAt(y.brg) || y.n - x.n)[0];
    const drone = (brg, R, t0, m) => { const key = E.fiber > 0 && (m === 'rear' || E.fpv === 0) ? 'fpv_fiber' : 'fpv'; return { key, R, brg, t0, tac: tac(m, key) }; };
    const C = [];
    if (posts.length) { const p = bestPost();
      C.push({ id: 'probe', n: 1, e: b.acc * (1 - b.cut) * (1 - apsAt(p.brg)), L: () => [{ key: p.key, R: p.R, brg: p.brg, t0: 1, tac: tac('n', p.id) }] });
      const pp = posts.filter(q => q.key === 'kornet' && q.n >= 2).sort((x, y) => y.n - x.n)[0];
      if (pp) C.push({ id: 'pair', n: 2, e: b.acc * (1 - b.cut) * (1 - apsAt(pp.brg) * .15), L: () => [{ key: 'kornet', R: pp.R, brg: pp.brg, t0: 1, pair: true, pair_gap: .5, tac: tac('n', pp.id) }] });
      if (posts.length >= 2) { const T = 2 + Math.max(...posts.map(fl)); C.push({ id: 'salvo', n: posts.length, e: posts.reduce((s, q) => s + b.acc * (1 - b.cutSalvo) * (1 - apsAt(q.brg)), 0), L: () => posts.map((q, i) => ({ key: q.key, R: q.R, brg: q.brg, t0: T - fl(q) + .25 * i, tac: tac('salvo', q.id) })) }); }
      const lp = posts.slice().sort((x, y) => apsAt(x.brg) - apsAt(y.brg)).slice(0, 2), T2 = 2 + Math.max(...lp.map(fl));
      C.push({ id: 'late', n: lp.length + (E.sal > 0 ? 1 : 0), e: lp.reduce((s, q) => s + .82 * b.acc * (1 - b.cutLate) * (1 - apsAt(q.brg)), 0) + (E.sal > 0 ? .7 * (1 - b.cutLate) * (1 - b.aps) : 0),
        L: () => lp.map((q, i) => ({ key: q.key, R: q.R, brg: q.brg, t0: T2 - fl(q) + .4 * i, late: 2.5, tac: tac('late', q.id) })).concat(E.sal > 0 ? [{ key: 'sal', R: 4500, brg: lp[0].brg + 8, t0: Math.max(0, T2 - 15), late: 3, tac: tac('late', 'sal') }] : []) });
      // strip: two cheap shots on the side of a missile post, then the missile
      const st = posts.map(q => { const sd = sideOf(q.brg, hull), team = E.rpg.find(r => r.n >= 2 && sideOf(r.brg, hull) === sd); return { q, sd, team }; }).filter(o => (o.team || nDr >= 2) && E.apsUsed[o.sd] < 3).sort((x, y) => E.apsUsed[y.sd] - E.apsUsed[x.sd])[0];
      if (st) { const rem = Math.max(0, 3 - E.apsUsed[st.sd] - 2), T = 3 + fl(st.q);
        C.push({ id: 'strip', n: 3, e: b.acc * (1 - b.cut) * (1 - (rem ? b.aps * .3 : .05)) + (st.team ? 2 * .3 * (1 - b.aps) : 2 * b.dacc * (1 - b.dk) * .7), L: () => (st.team ? [0, 1].map(i => ({ key: 'rpg', R: st.team.R, brg: st.team.brg + 3 * i, t0: T - 1.3 + .6 * i - st.team.R / 250, tac: tac('rpg', st.team.id) }))
          : [0, 1].map(i => drone(st.q.brg + (st.sd === 'R' ? 25 : -25) + 6 * i, 900, T - 1.3 + .6 * i - 30, 'drone'))).concat([{ key: st.q.key, R: st.q.R, brg: st.q.brg, t0: T - fl(st.q), tac: tac('n', st.q.id) }]) }); }
    }
    if (nDr > 0) { const n = Math.min(4, nDr), apsD = .3 * b.aps;
      C.push({ id: 'drones', n, e: n * b.dacc * (1 - b.dk) * (1 - apsD), L: () => Array.from({ length: n }, (_, i) => drone(hull - 45 + 90 * i / Math.max(1, n - 1), 1500, 1 + 1.2 * i, 'drone')) });
      C.push({ id: 'rear', n, e: n * b.dacc * (1 - b.dkRear) * (1 - apsD), L: () => Array.from({ length: n }, (_, i) => drone(hull + 180 - 15 + 30 * i / Math.max(1, n - 1), 1200, 12 + .8 * i, 'rear')) });
      if (posts.length) { const lp = posts.slice().sort((x, y) => apsAt(x.brg) - apsAt(y.brg)).slice(0, 2), T = 12 + 1200 / 30 + 1;
        C.push({ id: 'combined', n: n + lp.length, e: 1.1 * (n * b.dacc * (1 - b.dkRear) * (1 - apsD) + lp.reduce((s, q) => s + .82 * b.acc * (1 - b.cutLate) * (1 - apsAt(q.brg)), 0)),
          L: () => Array.from({ length: n }, (_, i) => drone(hull + 180 - 15 + 30 * i / Math.max(1, n - 1), 1200, 12 + .8 * i, 'rear')).concat(lp.map((q, i) => ({ key: q.key, R: q.R, brg: q.brg, t0: T - fl(q) + .5 * i, late: 2.5, tac: tac('late', q.id) }))) }); }
    }
    { const tm = E.rpg.filter(r => r.n > 0); if (tm.length) C.push({ id: 'rockets', n: tm.reduce((s, r) => s + Math.min(2, r.n), 0), e: tm.reduce((s, r) => s + Math.min(2, r.n) * .3 * (1 - apsAt(r.brg)), 0), L: () => tm.flatMap(r => Array.from({ length: Math.min(2, r.n) }, (_, i) => ({ key: 'rpg', R: r.R, brg: r.brg + 3 * i, t0: 1 + .8 * i, tac: tac('rpg', r.id) }))) }); }
    if (!C.length) { E.quit = true; E.log.push({ w: W, quit: true, text: `${E.seen ? E.seen + ' ' : ''}Nothing left to fire. The enemy breaks contact.` }); return null; }
    let pick; if (fixed) pick = C.find(c => c.id === 'salvo') || C.find(c => c.id === 'probe') || C.find(c => c.id === 'drones') || C.find(c => c.id === 'rockets') || C[0];
    else { for (const c of C) c.v = c.e - .08 * c.n; const pool = W === 0 && posts.length ? C.filter(c => ['probe', 'pair', 'salvo', 'late'].includes(c.id)) : C; pick = pool.slice().sort((x, y) => y.v - x.v)[0];
      if (W >= 2 && pick.e < .12) { E.quit = true; E.log.push({ w: W, quit: true, text: `${E.seen ? E.seen + ' ' : ''}Nothing it has left is likely to get through. The enemy breaks contact.` }); return null; } }
    const L = pick.L().map(l => Object.assign(l, { t0: Math.max(0, +l.t0.toFixed(2)), brg: +mod(l.brg + 180).toFixed(1) - 180, id: 'w' + W + '_' + (l.tac.id || '') }));
    // spend what was fired
    for (const l of L) { if (l.key === 'fpv') E.fpv--; else if (l.key === 'fpv_fiber') E.fiber--; else if (l.key === 'sal') E.sal--; else if (l.key === 'rpg') { const r = E.rpg.find(q => q.id === l.tac.id); if (r) r.n--; } else { const p = E.posts.find(q => q.id === l.tac.id); if (p) p.n -= l.pair ? 2 : 1; } }
    const T = TACTICS[pick.id], nm = T[0][0].toLowerCase() + T[0].slice(1), text = fixed ? `Wave ${W + 1}: ${nm} again.` : `Wave ${W + 1}: ${nm}. ${E.seen ? E.seen + ' So: ' : 'Opening move: '}${T[1]}.`;
    E.log.push({ w: W, tac: pick.id, name: T[0], text, est: +pick.e.toFixed(2), n: L.length, scores: fixed ? null : C.map(c => [c.id, +c.e.toFixed(2)]) }); E.wave++;
    return { tac: pick.id, name: T[0], text, L }; }
  // ---- watch the result and update the beliefs
  function learn(E, rec, hull) { const n = { cut: 0, aps: 0, shot: 0, wide: 0, hit: 0, beam: 0, dr: 0, lateCut: 0, late: 0 }, bump = (k, yes, w) => { E.B[k][yes ? 0 : 1] += w || 1; };
    for (const a of rec.aps) E.apsUsed[a.side]++;
    for (const th of rec.threats) { if (!th.tac) continue; const hit = th.viz.end && th.viz.end.type === 'hit', d = th.defeated_by, m = th.tac.m, drone = th.key === 'fpv' || th.key === 'fpv_fiber';
      const out = hit ? 'hit' : d === 'aps' ? 'aps' : d === 'hkoi_cut' || d === 'self_destruct' || d === 'crew_smoke' ? 'cut' : d === 'hkoi_he' || d === 'neighbour_he' ? 'shot' : d === 'gunner_jitter' ? 'wide' : 'miss';
      if (hit) n.hit++; if (out === 'aps') n.aps++;
      if (drone) { n.dr++; if (out === 'shot') n.shot++; if (E.skill !== 'fixed') { bump(m === 'rear' ? 'dkRear' : 'dk', out === 'shot'); if (out === 'hit' || out === 'miss') bump('dacc', hit); } }
      else if (th.key !== 'rpg') { n.beam++; if (m === 'late') n.late++; if (out === 'cut') { n.cut++; if (m === 'late') n.lateCut++; } if (out === 'wide') n.wide++;
        if (E.skill !== 'fixed') { const k = m === 'late' ? 'cutLate' : m === 'salvo' ? 'cutSalvo' : 'cut'; bump(k, out === 'cut'); if (k === 'cut') bump('cutSalvo', out === 'cut', .5); if (k === 'cutSalvo') bump('cut', out === 'cut', .5); if (out !== 'cut') bump('acc', out !== 'wide' && out !== 'miss'); } }
      if (E.skill !== 'fixed' && (out === 'aps' || hit)) bump('aps', out === 'aps'); }
    const bits = []; if (n.hit) bits.push(`${n.hit} hit${n.hit > 1 ? 's' : ''}`); if (n.cut) bits.push(`${n.cut} of ${n.beam} missile${n.beam > 1 ? 's' : ''} lost guidance in a cloud on the beam${n.late ? (n.lateCut ? ', even lased late' : ', none of the late-lased ones') : ''}`); if (n.aps) bits.push(`${n.aps} stopped by the APS at the vehicle`); if (n.shot) bits.push(`${n.shot} of ${n.dr} drone${n.dr > 1 ? 's' : ''} shot down`); if (n.wide) bits.push(`${n.wide} flew wide`);
    const emp = ['L', 'R'].filter(s => E.apsUsed[s] >= 3).map(s => s === 'L' ? 'left' : 'right'); if (emp.length) bits.push(`the APS on the ${emp.join(' and ')} has fired three times and should be empty`);
    E.seen = bits.length ? 'Seen: ' + bits.join('; ') + '.' : 'Seen: nothing got through and nothing was learned.'; return n; }
  // ---- a whole fight: wave after wave against the same vehicle, which carries its ammunition, damage and stress forward
  function fight(cfg, opt, seed, lookup) { opt = opt || {}; const E = open(opt.force || 'platoon', opt.skill || 'adaptive'), rngE = new HK.RNG(HK.seedFor(seed * 977 + 5, 77)); let st = CAMP.fresh(cfg); const waves = [];
    for (let w = 0; w < (opt.max_waves || 8); w++) { const pl = plan(E, st.hull, rngE); if (!pl) break;
      const c = CAMP.applyState(JSON.parse(JSON.stringify(cfg)), st); c.enemy.fixed = pl.L; c.enemy.no_dismounts = true; c.seed = seed;
      const rec = { events: [], bursts: [], aps: [], ctx: { hull: 0 } }; HK.runMission(c, new HK.RNG(HK.seedFor(seed * 131 + w, w)), lookup, rec); const seen = learn(E, rec, st.hull);
      waves.push({ w, tac: pl.tac, n: pl.L.length, hits: rec.hits, killed: !!rec.killed, seen, rec: opt.keep ? rec : null, cfg: opt.keep ? c : null });
      if (rec.killed) return { lost: true, waves, E, state: st };
      st = CAMP.nextState(rec, c, st, { gap_min: opt.gap_min == null ? .5 : opt.gap_min, wave: true }); }
    return { lost: false, waves, E, state: st }; }
  return { FORCES, SKILL, TACTICS, open, plan, learn, fight, left, mean };
})();
