# python3 seq.py <outbase> <kind> : film strip of one enemy team through a movement, to judge animation (single stills cannot show it).
# Run with the CSP server up and BASE set, like sheet.py. The team is taken away from the battle and driven by hand in steps of 1/120 s.
# (The same movements can be measured and drawn as stick figures in seconds, without a browser: tests/motion/harness.mjs and stick.py.)
#   STEPS  = JSON list of stages, each {"mode": "still|down|walk|run", "spd": m/s, "t": seconds between pictures, "shots": pictures, "turn": degrees added to the heading,
#            "info": {...} what the battle tells the team from this stage on (loaded, spare, firing, reload, reloadT, pack, setup, dead)}
#   PRE    = JSON list of stages run before the pictures start, each {"mode", "spd", "t", "info"}; SLOPE = up|down|across: first move the team to sloping ground
#   FIG    = 0 or 1: keep the camera on that man instead of on the team's point; a job may say "fx": true to let smoke, fire and dust run with the team's clock
#   ANG    = camera bearing relative to the team's heading (90 = side-on), DIST, CAMH = camera distance and height, FOLLOW = 1 keeps the camera on the team, BACK = metres behind the team's point the camera looks at
#   EVAL   = no pictures: print the result of this expression (it can use __D)
#   NUM=1  = no pictures: print the measurements of tests/beta/motion_metrics.js (jolts, foot slide, feet on the ground, frame-rate independence, cost per team per frame)
import asyncio, os, sys, json
from playwright.async_api import async_playwright
from PIL import Image
DRIVE = r"""window.__drv = (kind) => { const B = __beta, u = B.battle.units.find(x => x.spec.key === kind), i = B.battle.units.indexOf(u), tv = B.teams()[i], T = B.battle.tank;
  const O = tv.__own || (tv.__own = { place: tv.place.bind(tv), update: tv.update.bind(tv) }), place = O.place, update = O.update; tv.place = () => {}; tv.update = () => {};   /* the page's own frame loop no longer touches this team */
  const toTank = Math.atan2(T.e - u.e, T.n - u.n) * 180 / Math.PI, fresh = { loaded: true, spare: true, firing: false, reload: 0, pack: 0, setup: 0, dead: false, dist: 5, by: '', deadFor: 0, seed: u.id, fireBrg: toTank }, info = Object.assign({}, fresh);
  const D = { tv, u, ground: (x, z) => B.scene.world.h(x, -z), e0: u.e, n0: u.n, e: u.e, n: u.n, hdg: toTank + 90, toTank, info, t: 0,
    reset() { D.e = D.e0; D.n = D.n0; D.hdg = toTank + 90; D.t = 0; Object.assign(info, fresh); tv.ground = D.ground; tv.group.visible = true; if (tv._start) tv._start(); place(B.scene.at(D.e, D.n, 0), toTank); tv._gx = null; update(0.001, 'still', true, info); tv.settle(); },
    step(dt, mode, spd, near) { const mv = mode === 'walk' || mode === 'run', h = D.hdg * Math.PI / 180; if (mv) { D.e += Math.sin(h) * spd * dt; D.n += Math.cos(h) * spd * dt; }
      if (info.reload > 0) info.reload = Math.max(0, info.reload - dt); if (info.pack > 0) info.pack = Math.max(0, info.pack - dt); if (info.setup > 0) info.setup = Math.max(0, info.setup - dt);
      if (!info.loaded && !info.firing && info.reloadT && info.reload <= 2) info.loaded = true;
      place(B.scene.at(D.e, D.n, 0), mv ? D.hdg : toTank); update(dt, mode, near !== false, info); D.t += dt;
      if (tv.fell) { const p = B.scene.at(D.e, D.n, 0.4), fx = B.scene.fx;   /* what the page itself shows when a team is knocked out: the shell's burst and marks, then the small fire; or dust under machine-gun fire */
        if (tv.fell.blast) { fx.explosion(p.x, p.y, p.z, 1.5, {}); B.scene.blast(p, 1.4); B.scene.marks.add(p.x, p.z, 2.4, (x, z) => B.scene.world.h(x, -z), { kind: 1 }); fx.column(p.x, p.y, p.z, 50, 1); fx.fire(p.x, p.y - 0.2, p.z, 6, 0.45); } else fx.dust(p.x, p.y - 0.2, p.z, 0.7); tv.fell = null; }
      if (D.fx) { const fx = B.scene.fx, h = fx.hold; fx.hold = false; fx.step(dt); fx.hold = h; for (const l of B.scene.flares || []) l.intensity *= Math.exp(-dt * 7); } },   /* (the page is paused: move the effects' own clock and let the flash die away) */
    run(sec, mode, spd, fps) { const n = Math.round(sec * (fps || 120)); for (let k = 0; k < n; k++) D.step(1 / (fps || 120), mode, spd); },
    // move the team to the steepest ground within `r` metres (to judge feet on slopes): returns the slope found, in degrees, along and across the heading
    slope(r, want) { let best = null; const W = B.scene.world, h = (toTank + 90) * Math.PI / 180; for (let a = 0; a < 360; a += 15) for (let d = 20; d <= r; d += Math.max(20, r / 25)) { const e = u.e + Math.sin(a * Math.PI / 180) * d, n = u.n + Math.cos(a * Math.PI / 180) * d, s = Math.atan2(W.h(e + Math.sin(h) * 8, n + Math.cos(h) * 8) - W.h(e, n), 8) * 180 / Math.PI, c = Math.atan2(W.h(e + Math.cos(h) * 3, n - Math.sin(h) * 3) - W.h(e, n), 3) * 180 / Math.PI, sc = want === 'across' ? Math.abs(c) - Math.abs(s) : want === 'down' ? -s : s; if (!best || sc > best.sc) best = { e, n, s, c, sc }; }
      D.e0 = best.e; D.n0 = best.n; D.reset(); return { along_deg: +best.s.toFixed(1), across_deg: +best.c.toFixed(1) }; },
    cam(ang, dist, h, follow, back, fig) { const g = tv.group.position.clone(), hh = D.hdg * Math.PI / 180; if (fig >= 0) { const y = g.y; tv.group.updateMatrixWorld(true); tv.figures[fig].getWorldPosition(g); g.y = y; } g.x -= Math.sin(hh) * back; g.z += Math.cos(hh) * back; const a = (D.hdg + ang) * Math.PI / 180, c = B.scene.camera; B.cams.mode = 'free'; c.up.set(0, 1, 0); c.fov = 40; c.updateProjectionMatrix();
      const p = follow ? g : (D.c0 || (D.c0 = g.clone())); c.position.set(p.x + Math.sin(a) * dist, p.y + h, p.z - Math.cos(a) * dist); c.lookAt(p.x, p.y + 0.9, p.z); } };
  return (window.__D = D, 1); }"""
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
        await pg.add_style_tag(content='#bar,#status,#log,#units,#marks,#caption,#hud,#esight,#crew,#replay,#dock,#threats,#engleft,#engright,#logov,#sline,#gauges,#warn,#strip,#facerow{display:none!important}'); await pg.evaluate('void (' + DRIVE + ')'); await pg.evaluate(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'motion_metrics.js')).read()); await pg.evaluate(f"__drv('{kind}')"); await pg.evaluate('__D.reset()')
        if os.environ.get('EVAL'):   # print the result of one expression (it can use __D, the driver) and stop
            print(json.dumps(await pg.evaluate(os.environ['EVAL']))); print('errors', errs[:5]); await b.close(); return
        if os.environ.get('NUM'):
            print(json.dumps(await pg.evaluate('__motion.all(__D, {})'), indent=1)); print('errors', errs[:5]); await b.close(); return
        # one strip, described by the environment, or several in one go (the page takes a minute or two to load): JOBS = a JSON file holding a
        # list of {"out", "kind", "steps", "pre", "slope", "ang", "dist", "camh", "follow", "back", "fig", "cols"} (anything left out is taken from the environment)
        jobs = json.load(open(os.environ['JOBS'])) if os.environ.get('JOBS') else [{}]
        for job in jobs:
            g = lambda k, d: job.get(k, os.environ.get(k.upper(), d))
            jout = job.get('out', out); jkind = job.get('kind', kind); jsteps = job.get('steps', steps); jcols = int(g('cols', cols))
            await pg.evaluate(f"__drv('{jkind}')"); await pg.evaluate('void (__D.c0 = null, __D.reset())')
            if job.get('fx'): await pg.evaluate('void (__D.fx = true)')      # let smoke, fire and dust run on with the team's clock
            if g('slope', ''): print('slope', await pg.evaluate(f"__D.slope(200, '{g('slope', '')}')"))
            pre = job.get('pre', json.loads(os.environ.get('PRE', '[]')))
            for s in pre:
                if s.get('turn'): await pg.evaluate(f"void (__D.hdg += {s['turn']})")
                if s.get('info'): await pg.evaluate(f"void Object.assign(__D.info, {json.dumps(s['info'])})")
                await pg.evaluate(f"__D.run({s['t']}, '{s['mode']}', {s.get('spd', 0)})")
            ims = []
            for s in jsteps:
                if s.get('turn'): await pg.evaluate(f"void (__D.hdg += {s['turn']})")
                if s.get('info'): await pg.evaluate(f"void Object.assign(__D.info, {json.dumps(s['info'])})")
                for k in range(s.get('shots', 1)):
                    await pg.evaluate(f"__D.run({s['t']}, '{s['mode']}', {s.get('spd', 0)}); __D.cam({g('ang', ang)}, {g('dist', dist)}, {g('camh', camh)}, {g('follow', follow)}, {g('back', back)}, {g('fig', '-1')})"); await pg.wait_for_timeout(int(os.environ.get('WAIT', '1800')))
                    f = f'{jout}_{len(ims):02d}.png'; await pg.screenshot(path=f, timeout=120000); ims.append(Image.open(f).copy()); os.remove(f)
            w, h = ims[0].size; rows = (len(ims) + jcols - 1) // jcols; S = Image.new('RGB', (w * jcols, h * rows))
            for i, im in enumerate(ims): S.paste(im, ((i % jcols) * w, (i // jcols) * h))
            S.save(jout + '_seq.png'); print('strip', jout, S.size, 'team error', await pg.evaluate('__D.tv._err ? String(__D.tv._err.stack || __D.tv._err).slice(0, 400) : null'), 'errors', errs[:5]); sys.stdout.flush()
        await b.close()
asyncio.run(main())
