// Numbers for judging how the enemy figures move (used by tests/beta/seq.py in the browser and tests/motion/harness.mjs in node).
// A "driver" D moves one team by hand: D.reset(), D.step(dt, mode, spd), D.hdg (degrees), D.info, D.tv, D.ground(x, z) or null.
// A pop or a snap shows up as a spike in the change of a joint's velocity from one frame to the next.
(function (root) {
  const WATCH = { Hips: 0, Head: 5, LeftHand: 9, RightHand: 13, LeftFoot: 16, RightFoot: 20 }, BALL = [17, 21];
  const STORIES = {
    walk_run_stop: [{ t: 1, mode: 'still' }, { t: 4, mode: 'walk', spd: 2.2 }, { t: 3, mode: 'run', spd: 3.5 }, { t: 4, mode: 'still' }],
    down_and_up: [{ t: 1, mode: 'still' }, { t: 3, mode: 'down' }, { t: 3.5, mode: 'still' }],
    turn_120: [{ t: 0.5, mode: 'still' }, { t: 4, mode: 'walk', spd: 2.2 }, { t: 4, mode: 'walk', spd: 2.2, turn: 120 }],
    run_stop: [{ t: 0.5, mode: 'still' }, { t: 4, mode: 'run', spd: 4.5 }, { t: 4, mode: 'still' }],
    drop_on_the_move: [{ t: 0.5, mode: 'still' }, { t: 4, mode: 'walk', spd: 2.2 }, { t: 3, mode: 'down' }, { t: 4, mode: 'walk', spd: 2.2 }],
    fire: [{ t: 1, mode: 'still' }, { t: 1.5, mode: 'still', info: { firing: true } }, { t: 3, mode: 'still', info: { firing: false, loaded: false, reload: 9, reloadT: 9 } }],
  };
  const pos = (f, k, out) => { const m = f.userData.a.rig.bones[k].matrixWorld.elements; out[0] = m[12]; out[1] = m[13]; out[2] = m[14]; return out; };
  // play one story at a fixed frame rate; returns the worst frame-to-frame jump (cm) and worst change of velocity (m/s per frame) per joint,
  // how far a foot that is down slid (cm), and how far the lower foot was from the ground (cm, + above / - below)
  function play(D, story, fps, sample) {
    const tv = D.tv, dt = 1 / fps, names = Object.keys(WATCH), F = tv.figures, res = { jump_cm: {}, dvel: {}, where: {} };
    const last = F.map(() => names.map(() => null)), vel = F.map(() => names.map(() => null)), st = {}, p = [0, 0, 0];
    let slideAt = 0, slide = 0, slideSum = 0, stances = 0, floatMax = -1e9, floatMin = 1e9, t = 0;
    names.forEach(n => { res.jump_cm[n] = 0; res.dvel[n] = 0; res.where[n] = 0; });
    D.reset(); Object.assign(D.info, { loaded: true, spare: true, firing: false, reload: 0, pack: 0, setup: 0, dead: false, by: '', deadFor: 0 });
    for (const s of story) {
      if (s.turn) D.hdg += s.turn; if (s.info) Object.assign(D.info, s.info);
      const n = Math.round(s.t * fps);
      for (let i = 0; i < n; i++) {
        const before = F.map(f => f.userData.a.g.feet.map(x => x.on));
        D.step(dt, s.mode, s.spd || 0); t += dt; tv.group.updateMatrixWorld(true);
        F.forEach((f, fi) => {
          names.forEach((nm, j) => {
            pos(f, WATCH[nm], p); const L = last[fi][j];
            if (L) { const vx = (p[0] - L[0]) / dt, vy = (p[1] - L[1]) / dt, vz = (p[2] - L[2]) / dt, V = vel[fi][j], d = Math.hypot(p[0] - L[0], p[1] - L[1], p[2] - L[2]) * 100;
              if (d > res.jump_cm[nm]) res.jump_cm[nm] = d;
              if (V) { const a = Math.hypot(vx - V[0], vy - V[1], vz - V[2]); if (a > res.dvel[nm]) { res.dvel[nm] = a; res.where[nm] = +t.toFixed(2); } }
              vel[fi][j] = [vx, vy, vz]; }
            last[fi][j] = [p[0], p[1], p[2]];
          });
          const g = f.userData.a.g, moving = s.mode === 'walk' || s.mode === 'run'; let low = 1e9;
          g.feet.forEach((ft, k) => {
            const key = fi + '_' + k; pos(f, BALL[k], p);
            if (D.ground && moving && f.userData.a.gen === 'stride') { const h = p[1] - D.ground(p[0], p[2]) - f.userData.a.rig.ballH; if (h < low) low = h; }
            if (ft.on && before[fi][k] && moving && f.userData.a.gen === 'stride' && (!f.userData.a.kw || f.userData.a.kw.x >= 1)) { if (!st[key]) st[key] = { x: p[0], z: p[2], d: 0 }; else st[key].d = Math.max(st[key].d, Math.hypot(p[0] - st[key].x, p[2] - st[key].z)); }
            else if (st[key]) { if (st[key].d > slide) slideAt = t; slide = Math.max(slide, st[key].d); slideSum += st[key].d; stances++; st[key] = null; }
          });
          if (low < 1e8 && t > 2.5 && (g.feet[0].on || g.feet[1].on) && (!f.userData.a.kw || f.userData.a.kw.x >= 1)) { floatMax = Math.max(floatMax, low); floatMin = Math.min(floatMin, low); }
        });
        if (sample) sample(t, s, i === n - 1);
      }
    }
    const r2 = x => +x.toFixed(2);
    names.forEach(n => { res.jump_cm[n] = r2(res.jump_cm[n]); res.dvel[n] = r2(res.dvel[n]); });
    res.foot_slide_cm = { worst: r2(slide * 100), mean: r2(slideSum / Math.max(1, stances) * 100), stances, when: r2(slideAt) };
    if (floatMax > -1e8) res.low_foot_cm = { highest: r2(floatMax * 100), lowest: r2(floatMin * 100) };
    res.err = tv._err ? String(tv._err.stack || tv._err).slice(0, 300) : null;
    return res;
  }
  // the same story at several frame rates: where are the hips, head, hands and feet at the end of each stage? (largest difference from the 240 fps run, cm)
  function rates(D, story, list) {
    const names = Object.keys(WATCH), runs = {}, p = [0, 0, 0];
    for (const fps of list) { const marks = []; play(D, story, fps, (t, s, end) => { if (end) marks.push(snap()); }); runs[fps] = marks; }
    function snap() { D.tv.group.updateMatrixWorld(true); return D.tv.figures.map(f => names.map(n => pos(f, WATCH[n], p).slice())); }
    const ref = runs[list[list.length - 1]], out = {};
    for (const fps of list) { let worst = 0; runs[fps].forEach((m, si) => m.forEach((f, fi) => f.forEach((q, j) => { const r = ref[si] && ref[si][fi][j]; if (r) worst = Math.max(worst, Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2])); }))); out['fps' + fps + '_cm'] = +(worst * 100).toFixed(1); }
    return out;
  }
  // cost of one team for one frame, in thousandths of a second, averaged over 200 calls
  function cost(D, mode, spd, dist, pre) {
    D.reset(); Object.assign(D.info, { loaded: true, spare: true, firing: false, reload: 0, pack: 0, setup: 0, dead: false, by: '', deadFor: 0, dist: dist }); const near = dist < 300;
    for (let k = 0; k < (pre || 150); k++) D.step(1 / 60, mode, spd, near);
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t0 = now();
    for (let k = 0; k < 200; k++) D.step(1 / 240, mode, spd, near);
    const ms = (now() - t0) / 200; D.info.dist = 5; return +ms.toFixed(4);
  }
  function all(D, opt) {
    opt = opt || {}; const fps = opt.fps || 60, out = { stories: {}, rates: {}, cost_ms: {} };
    for (const k in STORIES) if (!opt.only || opt.only.includes(k)) out.stories[k] = play(D, STORIES[k], fps);
    if (!opt.quick) {
      out.rates.walk_run_stop = rates(D, STORIES.walk_run_stop, [30, 60, 144, 240]); out.rates.down_and_up = rates(D, STORIES.down_and_up, [30, 60, 144, 240]);
      for (const d of [10, 150, 1000]) out.cost_ms['dist_' + d] = { walk: cost(D, 'walk', 2.2, d), run: cost(D, 'run', 3.5, d), still: cost(D, 'still', 0, d), getting_up: cost(D, 'walk', 2.2, d, 18) };
    }
    D.reset(); return out;
  }
  root.__motion = { STORIES, WATCH, play, rates, cost, all };
})(typeof window !== 'undefined' ? window : globalThis);
