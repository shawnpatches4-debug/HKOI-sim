# python3 seq.py <outbase> <kind> : film strip of one enemy team through a movement, to judge animation (single stills cannot show it).
# Run with the CSP server up and BASE set, like sheet.py. The team is taken away from the battle and driven by hand in steps of 1/120 s.
#   STEPS  = JSON list of stages, each {"mode": "still|down|walk|run", "spd": m/s, "t": seconds between pictures, "shots": pictures, "turn": degrees added to the heading}
#   ANG    = camera bearing relative to the team's heading (90 = side-on), DIST, CAMH = camera distance and height, FOLLOW = 1 keeps the camera on the team, BACK = metres behind the team's point the camera looks at
#   EVAL   = no pictures: print the result of this expression (it can use __D)
#   NUM=1  = no pictures: print measurements instead (foot slide, frame-rate independence, cost per team per frame)
import asyncio, os, sys, json
from playwright.async_api import async_playwright
from PIL import Image
DRIVE = r"""window.__drv = (kind) => { const B = __beta, u = B.battle.units.find(x => x.spec.key === kind), i = B.battle.units.indexOf(u), tv = B.teams()[i], T = B.battle.tank;
  const place = tv.place.bind(tv), update = tv.update.bind(tv); tv.place = () => {}; tv.update = () => {};   /* the page's own frame loop no longer touches this team */
  const toTank = Math.atan2(T.e - u.e, T.n - u.n) * 180 / Math.PI, info = { loaded: true, spare: true, firing: false };
  const D = { tv, u, ground: (x, z) => B.scene.world.h(x, -z), e: u.e, n: u.n, hdg: toTank + 90, toTank, info, t: 0,
    reset() { D.e = u.e; D.n = u.n; D.hdg = toTank + 90; place(B.scene.at(D.e, D.n, 0), toTank); tv._gx = null; update(0.001, 'still', true, info); tv.settle(); },
    step(dt, mode, spd) { const mv = mode === 'walk' || mode === 'run', h = D.hdg * Math.PI / 180; if (mv) { D.e += Math.sin(h) * spd * dt; D.n += Math.cos(h) * spd * dt; }
      place(B.scene.at(D.e, D.n, 0), mv ? D.hdg : toTank); update(dt, mode, true, info); D.t += dt; },
    run(sec, mode, spd, fps) { const n = Math.round(sec * (fps || 120)); for (let k = 0; k < n; k++) D.step(1 / (fps || 120), mode, spd); },
    cam(ang, dist, h, follow, back) { const g0 = tv.group.position, hh = D.hdg * Math.PI / 180, g = g0.clone(); g.x -= Math.sin(hh) * back; g.z += Math.cos(hh) * back; const a = (D.hdg + ang) * Math.PI / 180, c = B.scene.camera; B.cams.mode = 'free'; c.up.set(0, 1, 0); c.fov = 40; c.updateProjectionMatrix();
      const p = follow ? g : (D.c0 || (D.c0 = g.clone())); c.position.set(p.x + Math.sin(a) * dist, p.y + h, p.z - Math.cos(a) * dist); c.lookAt(p.x, p.y + 0.9, p.z); } };
  return (window.__D = D, 1); }"""
NUM = r"""(() => { const D = __D, tv = D.tv, out = {}, THREE_V = D.tv.group.position.constructor;
  const ball = (f, k) => { const b = f.userData.a.rig.bones[k ? 21 : 17]; f.updateWorldMatrix(true, true); return new THREE_V().setFromMatrixPosition(b.matrixWorld); };
  // 1. foot slide: while a foot is down, how far does the ball of the foot really move over the ground (true skeleton positions)
  const slide = (mode, spd, fps) => { D.reset(); D.run(3, mode, spd, fps); let worst = 0, sum = 0, n = 0; const st = {};
    for (let s = 0; s < fps * 4; s++) { const before = tv.figures.map(f => f.userData.a.g.feet.map(x => x.on)); D.step(1 / fps, mode, spd);
      tv.figures.forEach((f, i) => f.userData.a.g.feet.forEach((ft, k) => { const key = i + '_' + k; if (ft.on && before[i][k]) { const p = ball(f, k); if (!st[key]) st[key] = { p0: p, d: 0 }; else st[key].d = Math.max(st[key].d, Math.hypot(p.x - st[key].p0.x, p.z - st[key].p0.z)); } else if (st[key]) { worst = Math.max(worst, st[key].d); sum += st[key].d; n++; st[key] = null; } })); }
    const g = tv.figures[0].userData.a.g; return { worst_cm: +(worst * 100).toFixed(2), mean_cm: +(sum / Math.max(1, n) * 100).toFixed(2), stances: n, stride_m: +g.L.toFixed(2), strides_per_s: +(g.v / g.L).toFixed(2), on_ground_share: +g.beta.toFixed(2), run: +g.run.toFixed(2) }; };
  out.slide = { walk_2_2_60fps: slide('walk', 2.2, 60), walk_2_2_240fps: slide('walk', 2.2, 240), walk_2_0_30fps: slide('walk', 2.0, 30), run_3_5_60fps: slide('run', 3.5, 60), rpg_walk_3_2_144fps: slide('walk', 3.2, 144), run_5_1_60fps: slide('run', 5.1, 60), run_5_1_240fps: slide('run', 5.1, 240) };
  // 2. frame-rate independence: the same 6.5 s story (still, walk, run, still, down) at four frame rates
  const story = fps => { D.reset(); D.run(0.5, 'still', 0, fps); D.run(2.5, 'walk', 2.2, fps); const a = tv.figures[0].userData.a, b = tv.figures[1].userData.a; const mid = { ph0: +a.g.ph.toFixed(3), ph1: +b.g.ph.toFixed(3), hipY: +a.oy.toFixed(4), lag: +tv.lag.length().toFixed(3), z1: +b.z.toFixed(3) };
    D.run(1.5, 'run', 3.5, fps); const r = { ph0: +a.g.ph.toFixed(3), run: +a.g.run.toFixed(3), lag: +tv.lag.length().toFixed(3) }; D.run(0.4, 'still', 0, fps); const s = { x0: +a.x.toFixed(3), z0: +a.z.toFixed(3), x1: +b.x.toFixed(3), psi: +tv._psi.toFixed(3), thighW: +a.cur[14].w.toFixed(3) }; D.run(1.6, 'still', 0, fps); D.run(0.45, 'down', 0, fps);
    return { after_walk: mid, after_run: r, into_still: s, into_down: { spineW: +a.cur[1].w.toFixed(4), y: +a.oy.toFixed(4), ph: tv._ph } }; };
  out.fps = { f30: story(30), f60: story(60), f144: story(144), f240: story(240) };
  // 3. cost per team per frame (near), over 200 calls
  const cost = (mode, spd) => { D.reset(); D.run(1.5, mode, spd, 60); const t0 = performance.now(); for (let k = 0; k < 200; k++) D.step(1 / 240, mode, spd); return +((performance.now() - t0) / 200).toFixed(4); };
  out.cost_ms = { walk: cost('walk', 2.2), run: cost('run', 3.5), still: cost('still', 0) }; D.reset(); D.run(0.3, 'walk', 2.2, 60); { const t0 = performance.now(); for (let k = 0; k < 200; k++) D.step(1 / 240, 'walk', 2.2); out.cost_ms.blending = +((performance.now() - t0) / 200).toFixed(4); }
  out.err = tv._err ? String(tv._err.stack || tv._err).slice(0, 500) : null; D.reset(); return out; })()"""
async def main():
    out, kind = sys.argv[1], sys.argv[2]
    steps = json.loads(os.environ.get('STEPS', '[{"mode":"walk","spd":2.2,"t":0.0875,"shots":8}]')); ang = os.environ.get('ANG', '90'); dist = os.environ.get('DIST', '4.2'); camh = os.environ.get('CAMH', '1.2'); follow = os.environ.get('FOLLOW', '1'); back = os.environ.get('BACK', '0.75')
    cols = int(os.environ.get('COLS', '4')); W, H = int(os.environ.get('W', '420')), int(os.environ.get('H', '330'))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': W, 'height': H}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#gfx=low&spectator=1&speed=1' + os.environ.get('HASH', ''), timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        for i in range(60):
            if await pg.evaluate('__beta.teams().every(t => t.loaded)'): break
            await pg.wait_for_timeout(1000)
        await pg.evaluate('document.getElementById("go").click()'); await pg.wait_for_timeout(1500); await pg.evaluate('__beta.setPlaying(false)')
        await pg.add_style_tag(content='#bar,#status,#log,#units,#marks,#caption,#hud,#esight{display:none!important}'); await pg.evaluate('void (' + DRIVE + ')'); await pg.evaluate(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'motion_metrics.js')).read()); await pg.evaluate(f"__drv('{kind}')"); await pg.evaluate('__D.reset()')
        if os.environ.get('EVAL'):   # print the result of one expression (it can use __D, the driver) and stop
            print(json.dumps(await pg.evaluate(os.environ['EVAL']))); print('errors', errs[:5]); await b.close(); return
        if os.environ.get('NUM'):
            print(json.dumps(await pg.evaluate(NUM), indent=1)); print('errors', errs[:5]); await b.close(); return
        pre = json.loads(os.environ.get('PRE', '[]'))
        for s in pre: await pg.evaluate(f"__D.run({s['t']}, '{s['mode']}', {s.get('spd', 0)})")
        ims = []
        for s in steps:
            if s.get('turn'): await pg.evaluate(f"void (__D.hdg += {s['turn']})")
            for k in range(s.get('shots', 1)):
                await pg.evaluate(f"__D.run({s['t']}, '{s['mode']}', {s.get('spd', 0)}); __D.cam({ang}, {dist}, {camh}, {follow}, {back})"); await pg.wait_for_timeout(int(os.environ.get('WAIT', '1800')))
                f = f'{out}_{len(ims):02d}.png'; await pg.screenshot(path=f, timeout=120000); ims.append(Image.open(f).copy()); os.remove(f)
        w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols; S = Image.new('RGB', (w * cols, h * rows))
        for i, im in enumerate(ims): S.paste(im, ((i % cols) * w, (i // cols) * h))
        S.save(out + '_seq.png'); print('strip', S.size, 'team error', await pg.evaluate('__D.tv._err ? String(__D.tv._err.stack || __D.tv._err).slice(0, 400) : null'), 'errors', errs[:5]); await b.close()
asyncio.run(main())
