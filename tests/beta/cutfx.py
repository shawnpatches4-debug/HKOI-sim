# python3 tests/beta/cutfx.py <out folder> [prefix] : pictures of the moment HKOI's cloud cuts a missile's guidance (stream cutfx).
# Needs the restricted test server (BASE); run it as  PORT=<port> bash tools/run_test.sh tests/beta/cutfx.py <out folder> after
# PORT=<port> bash tools/dev.sh build. The battle is the page's own (standoff, desert, map 3, seed 6); the cut picked is the longest
# blind flight of the first engagement. Pictures (prefix + name):
#   orbit_a   side view about 350 m from the point of the cut, 0.25 s after it        orbit_b  the same 1.5 s after it
#   cdr       the commander's view 0.25 s after it                                       director the director filming it, captions on
#   enemy     the enemy gunner's sight 0.8 s after it                                     map      the map 1.5 s after it
#   endlabel  side view of where it ended, 1 s after the end
# Prints what the page said about the cut and any page errors. W, H, GFX from the environment (960, 540, medium).
import asyncio, os, sys, json
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; PRE = sys.argv[2] if len(sys.argv) > 2 else ''
HASH = 'gfx=%s&speed=1&force=standoff&biome=desert&map=3&seed=6&skill=trained&mission=hold&waves=1' % os.environ.get('GFX', 'medium')

SETUP = r'''(() => { const B = __beta; B.start(); B.setPlaying(false); B.set.spectator = true;
  let n = 0; const pick = () => { for (const v of B.battle.volleys) { let best = null; for (const th of v.rec.threats) { const s = th.viz.sever; if (!s || s.smoke) continue; if (!best || th.viz.end.t - s.t > best.viz.end.t - best.viz.sever.t) best = th; } if (best) return [v, best]; } return null; };
  while (!pick() && n++ < 200) B.playFor(1);
  const [v, th] = pick(); window.__cut = { v: v.i, idx: th.idx }; const s = th.viz.sever, e = th.viz.end;
  return JSON.stringify({ t: +B.battle.t.toFixed(2), v: v.i, t0: v.t0, key: th.key, idx: th.idx, cut: s, end: e, tCut: v.t0 + s.t, tEnd: v.t0 + e.t, R: th.R }); })()'''

# play on to battle time T (absolute) with the real per-step drawing calls
PLAY = r'''(T => { const B = __beta; if (B.battle.t < T) B.playFor(T - B.battle.t); return +B.battle.t.toFixed(2); })'''

# put the camera beside the point P (the missile at volley time tv, or at the cut), `side` m off the line, `up` m above
CAM = r'''(([tv, side, up]) => { const B = __beta, C = window.__cut, v = B.battle.volleys[C.v], th = v.rec.threats[C.idx], l = v.launches.find(q => q.u.id === th.uid) || v.launches[C.idx];
  const V = B.scene.camera.position.constructor, P = B.volleys.pos(v, th, l, Math.min(tv, th.viz.end.t), new V()), T = B.battle.tankAt(v.t0 + tv), L = l.u0 || l.u;
  const dE = L.e - T.e, dN = L.n - T.n, d = Math.hypot(dE, dN), pe = dN / d, pn = -dE / d;   /* to the right of the line */
  B.cams.set('orbit'); B.cams.mode = 'free'; B.scene.controls.enabled = false; const cam = B.scene.camera; cam.up.set(0, 1, 0);
  cam.position.set(P.x + pe * side - dE / d * side * 0.35, P.y + up, P.z - pn * side + dN / d * side * 0.35); cam.lookAt(P); if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); }
  return [+P.x.toFixed(1), +P.y.toFixed(1), +P.z.toFixed(1)]; })'''

INFO = r'''(() => { const B = __beta, m = document.getElementById('marks'), lab = [...m.children].filter(x => !x.hidden && !x.classList.contains('mk')).map(x => x.textContent);
  return JSON.stringify({ t: +B.battle.t.toFixed(2), mode: B.cams.mode, headline: (document.getElementById('threats') || {}).textContent, labels: lab, cap: (document.getElementById('dir-cap') || {}).textContent, esight: (document.getElementById('esight-data') || {}).textContent, err: document.getElementById('errbar').hidden ? '' : document.getElementById('errbar').textContent.slice(0, 300) }); })()'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': os.environ.get('CHROME', '/usr/bin/google-chrome')} if os.path.exists(os.environ.get('CHROME', '/usr/bin/google-chrome')) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '960')), 'height': int(os.environ.get('H', '540'))}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:400])); pg.on('console', lambda m: m.type in ('error',) and '404' not in m.text and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'] + '#' + HASH, timeout=180000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=240000)
        info = json.loads(await pg.evaluate(SETUP)); print('cut', json.dumps(info)); tC, tE, t0 = info['tCut'], info['tEnd'], info['t0']
        async def shot(name, settle=4500):
            await pg.wait_for_timeout(settle); await pg.screenshot(path=os.path.join(OUT, PRE + name + '.png'), timeout=90000); print(name, await pg.evaluate(INFO))
        await pg.evaluate(PLAY, tC + 0.25)
        await pg.evaluate(CAM, [tC - t0, 330, 60]); await shot('orbit_a')
        await pg.evaluate("void (__beta.cams.set('cdr'))"); await shot('cdr')
        await pg.evaluate(PLAY, tC + 0.5)
        await pg.evaluate("void ((() => { const D = __beta.director; if (!D.on) D.toggle(); D.yielded = false; for (let i = 0; i < 3; i++) D.update(0.02); })())"); await shot('director')
        await pg.evaluate("void ((() => { const D = __beta.director; if (D.on) D.toggle(); })())")
        await pg.evaluate(PLAY, tC + 0.8)
        await pg.evaluate("void ((() => { const B = __beta, C = window.__cut, v = B.battle.volleys[C.v], th = v.rec.threats[C.idx], u = B.battle.units.find(x => x.id === th.uid); B.cams.choose(u); B.cams.set('enemy'); })())"); await shot('enemy', 6000)
        await pg.evaluate(PLAY, tC + 1.5)
        await pg.evaluate(CAM, [tC - t0 + 1.5, 330, 60]); await shot('orbit_b')
        await pg.evaluate("void (__beta.openMap())"); await shot('map'); await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(500)
        await pg.evaluate("void ((() => { const m = document.getElementById('map'); if (m && !m.hidden) document.getElementById('map-close').click(); })())")
        await pg.evaluate(PLAY, tE + 1.0)
        await pg.evaluate(CAM, [tE - t0, 160, 25]); await shot('endlabel')
        print('errors', json.dumps(errs[:10])); await b.close()
asyncio.run(main())
