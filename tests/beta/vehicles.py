# python3 tests/beta/vehicles.py <out dir> [hash params]
# Enemy vehicles in the real page, driven by a made-up vehicle list (tests/beta/vehicles_fake.js; test only): driving in, firing,
# every kind of hit and kill, a rewind. Takes pictures at chosen moments and checks:
#   - the same movement at 30, 60, 144 and 240 frames a second (position, heading, spring pitch, dust puffs),
#   - no fault in the vehicle drawing and nothing on the page's red error bar,
#   - a rewind puts a blown-off turret back and a jump forward shows a settled wreck.
# Env: QUICK=1 pictures only (no frame-rate, rewind or loop checks), SHOTS=comma list of picture names to take (default all), W, H, WAITMS (per picture, default 3500), NOFPS=1 skips the frame-rate check.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
OUT = sys.argv[1]; PARAMS = sys.argv[2] if len(sys.argv) > 2 else 'gfx=high&spectator=1&play=1&biome=desert&force=light&seed=3&speed=1'
HERE = os.path.dirname(os.path.abspath(__file__)); FAKE = open(os.path.join(HERE, 'vehicles_fake.js')).read()
WAIT = int(os.environ.get('WAITMS', '3500')); ONLY = [x for x in os.environ.get('SHOTS', '').split(',') if x]

SETUP = """void (() => {
  const b = window.__beta, B = b.battle, V = b.scene.vehicles; b.setPlaying(false);
  const uid = B.units.length ? B.units[0].id : 1, F = window.__vehFake({ e: B.tank.e, n: B.tank.n }, uid);
  window.__vt = 0; window.__F = F; B.vehicles = () => F(Math.ceil(window.__vt * 10 - 1e-6) / 10);
  const orig = V.update.bind(V); V.update = (bt, o) => orig(bt, Object.assign({}, o, { t: window.__vt, bt: Math.ceil(window.__vt * 10 - 1e-6) / 10, all: true }));   /* the test's own clock (the real battle stays paused) */
  window.__go = (to, fps = 60) => { while (window.__vt < to - 1e-9) { window.__vt = Math.min(to, window.__vt + 1 / fps); V.update(B, { teams: b.teams() }); b.scene.fx.update(1 / fps); } return window.__vt; };
  window.__jump = to => { window.__vt = to; V.update(B, { teams: b.teams() }); };
  /* look at slot i from `back` metres towards the tank, `side` metres along the row, `h` metres up */
  window.__cam = (i, back, side, h) => { const D = Math.PI / 180, p = F.slot(i), be = Math.sin(F.brg * D), bn = Math.cos(F.brg * D); b.view(p[0] - be * back + bn * side, p[1] - bn * back - be * side, 0, h, p[0], p[1]); };
})()"""

# (time in the story, name, camera)
SHOTS = [
    (4.0, 'drive_uaz', '__cam(0, 24, 9, 2.2)'), (4.0, 'drive_bmp', '__cam(1, 28, 10, 2.6)'), (4.0, 'drive_t72', '__cam(2, 30, 11, 2.8)'), (4.0, 'drive_t90', '__cam(3, 30, -11, 2.8)'),
    (9.5, 'close_uaz', '__cam(8, 7, 4.5, 1.7)'), (9.5, 'close_bmp', '__cam(4, 10, 7, 2.3)'), (9.5, 'close_t72', '__cam(5, 11, 8, 2.6)'), (9.5, 'close_t90', '__cam(9, 11, -8, 2.6)'), (9.5, 'rear_t72', '__cam(5, -10, 7, 3.2)'),
    (9.5, 'aboard_uaz', '__cam(0, 7, 4.5, 1.7)'), (9.5, 't72_800', '__cam(5, 800, 0, 5)'),
    (9.5, 'row_800', '__cam(4.5, 800, 0, 6)'), (9.5, 'row_250', '__cam(4.5, 250, 0, 8)'),
    (10.5, 'fire_bmp30', '__cam(1, 14, 9, 2.4)'), (11.03, 'fire_t72', '__cam(2, 16, 12, 2.8)'), (11.2, 'fire_t72_b', '__cam(2, 16, 12, 2.8)'),
    (12.9, 'uaz_dismount_a', '__cam(0, 6, 5, 1.7)'), (13.6, 'uaz_dismount_b', '__cam(0, 6, 5, 1.7)'), (14.8, 'uaz_dismount_c', '__cam(0, 6, 5, 1.7)'),
    (14.4, 'kill_mobility_t90', '__cam(3, 12, -9, 2.6)'), (16.08, 'fire_konkurs', '__cam(1, 14, 9, 2.4)'), (16.9, 'kill_firepower_bmp', '__cam(4, 11, 8, 2.6)'),
    (20.6, 'uaz_mount', '__cam(0, 6, 5, 1.7)'), (21.15, 'hit_sparks_t72', '__cam(2, 16, 12, 2.8)'),
    (22.5, 'cat_t72_a', '__cam(5, 20, 12, 3.5)'), (23.6, 'cat_t72_b', '__cam(5, 20, 12, 3.5)'), (25.6, 'cat_t72_c', '__cam(5, 20, 12, 3.5)'),
    (24.5, 'cat_bmp_rear', '__cam(6, -12, 8, 3)'), (27.5, 'abandoned_t72', '__cam(7, 12, 8, 2.8)'),
    (30.35, 'cat_uaz_a', '__cam(0, 12, 7, 2.4)'), (32.0, 'cat_uaz_b', '__cam(0, 12, 7, 2.4)'),
    (33.0, 'thermal_row', 'void (__beta.scene.setThermal(1), __cam(4.5, 120, 0, 9))'), (33.0, 'thermal_off', 'void (__beta.scene.setThermal(0), __cam(4.5, 120, 0, 9))'),
    (92.0, 'wrecks_60s', '__cam(5.5, 45, 0, 7)'), (92.0, 'wreck_t72_close', '__cam(5, 14, 9, 3)'), (92.0, 'wreck_uaz_close', '__cam(0, 9, 5, 2.2)'), (92.0, 'wrecks_800', '__cam(4.5, 800, 0, 6)'),
]

FPS = """(async () => {
  const b = window.__beta, V = b.scene.vehicles, B = b.battle, F = window.__F, out = {}, fx = b.scene.fx, dust0 = fx.dust;
  for (const fps of [30, 60, 144, 240]) {
    const fb = { t: 0, dt: 0.1, tank: B.tank, units: [], events: [], vehicles: () => F(fb.t) }; let n = 0; fx.dust = () => { n++; };
    const rec = []; let tt = 0, k = 0; const upd = Object.getPrototypeOf(V).update.bind(V);
    upd(fb, { t: 0, all: true }); for (let i = 0; i < 6; i++) await null; upd(fb, { t: 0, all: true });
    while (tt < 10.5) { k++; tt = k / fps; fb.t = Math.ceil(tt * 10 - 1e-6) / 10; upd(fb, { t: tt, all: true });
      if (Math.abs(tt * 2 - Math.round(tt * 2)) < 0.5 / fps) { const row = []; for (const id of [101, 102, 103]) { const w = V.view(id); row.push(w.X.x, w.N.x, w.H.x, w.y, w.A.p, w.P.x); } rec.push(row); } }
    out[fps] = { rec, dust: n, ready: V.status().ready };
  }
  fx.dust = dust0;
  let worst = { pos: 0, hdg: 0, spring: 0, y: 0 }; const a = out[240].rec;
  for (const fps of [30, 60, 144]) { const r = out[fps].rec; for (let i = 0; i < Math.min(a.length, r.length); i++) for (let j = 0; j < a[i].length; j += 6) {
    worst.pos = Math.max(worst.pos, Math.hypot(a[i][j] - r[i][j], a[i][j + 1] - r[i][j + 1])); worst.hdg = Math.max(worst.hdg, Math.abs(a[i][j + 2] - r[i][j + 2])); worst.y = Math.max(worst.y, Math.abs(a[i][j + 3] - r[i][j + 3])); worst.spring = Math.max(worst.spring, Math.abs(a[i][j + 4] - r[i][j + 4])); } }
  return { worst, dust: [30, 60, 144, 240].map(f => out[f].dust), samples: a.length, ready: out[240].ready, errors: V.errors };
})()"""

CHECK = """(() => { const b = window.__beta, V = b.scene.vehicles, e = document.getElementById('errbar'); const s = b.scene.stats();
  return { t: +window.__vt.toFixed(2), status: V.status(), err: V.lastError ? String(V.lastError.stack || V.lastError).slice(0, 400) : null, bar: e && !e.hidden ? e.textContent.slice(0, 300) : '', calls: s.calls, tris: s.triangles, particles: b.scene.fx.n }; })()"""

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        chrome = os.environ.get('CHROME', '/usr/bin/google-chrome')
        b = await p.chromium.launch(**({'executable_path': chrome} if os.path.exists(chrome) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and '404' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#' + PARAMS, timeout=120000)
        for _ in range(240):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready && window.__beta.battle && window.__beta.state() === "play")'): break
            await pg.wait_for_timeout(500)
        else: print('NOT READY', errs[:5]); await b.close(); return
        await pg.evaluate(FAKE); await pg.evaluate(SETUP); await pg.evaluate('__jump(0)')
        for _ in range(120):
            st = await pg.evaluate('__beta.scene.vehicles.status()')
            if st['ready'] == st['vehicles'] and st['vehicles'] > 0: break
            await pg.wait_for_timeout(500)
        print('MODELS', json.dumps(st), errs[:4])
        QUICK = os.environ.get('QUICK')
        if not os.environ.get('NOFPS') and not QUICK:
            r = await pg.evaluate(FPS); print('FRAME RATES', json.dumps(r)); await pg.evaluate('__jump(0)')
            ok = r['worst']['pos'] < 0.05 and r['worst']['hdg'] < 0.01 and r['worst']['spring'] < 0.004 and max(r['dust']) - min(r['dust']) <= 2 and r['errors'] == 0
            print('FRAME RATE CHECK', 'PASS' if ok else 'FAIL')
        for s, name, cam in sorted(SHOTS, key=lambda x: x[0]):
            if ONLY and not any(name.startswith(o) for o in ONLY): continue
            await pg.evaluate('__go(%s)' % s); await pg.evaluate(cam); await pg.wait_for_timeout(WAIT)
            await pg.screenshot(path=os.path.join(OUT, 'veh_%s.png' % name), timeout=120000); print(name, json.dumps(await pg.evaluate(CHECK)))
        if QUICK: print('QUICK', json.dumps(await pg.evaluate(CHECK)), errs[:5]); await b.close(); return
        # rewind and jump: the state must come from the data and the time alone
        rw = await pg.evaluate("""(() => { const V = __beta.scene.vehicles, w = V.view(106), out = {}; __go(Math.max(window.__vt, 26)); out.offY = +w.turret.position.y.toFixed(2); out.offX = +w.turret.position.x.toFixed(2);
          __jump(9.5); out.backY = +(w.turret.position.y - w.turret0.y).toFixed(3); out.backX = +(w.turret.position.x - w.turret0.x).toFixed(3); out.scorchBack = w.scorch; out.settledBack = w.settled;
          __jump(23.0); out.midY = +w.turret.position.y.toFixed(2); __jump(900); out.lateSettled = w.settled; out.lateX = +w.turret.position.x.toFixed(2); out.status = V.status(); out.errors = V.errors; return out; })()""")
        print('REWIND', json.dumps(rw)); ok = abs(rw['backY']) < 1e-3 and abs(rw['backX']) < 1e-3 and rw['lateSettled'] and abs(rw['offX'] - rw['lateX']) < 0.01 and rw['errors'] == 0
        print('REWIND CHECK', 'PASS' if ok else 'FAIL')
        if not ONLY or 'rewind' in ONLY:
            await pg.evaluate('__jump(9.5)'); await pg.evaluate('__cam(5, 20, 12, 3.5)'); await pg.wait_for_timeout(WAIT); await pg.screenshot(path=os.path.join(OUT, 'veh_rewind_t72.png'), timeout=120000)
        # the real frame loop for a few seconds with the vehicles in it
        await pg.evaluate('void (__jump(9.5), __beta.setPlaying(true))'); await pg.wait_for_timeout(6000); await pg.evaluate('__beta.setPlaying(false)')
        c = await pg.evaluate(CHECK); print('LOOP', json.dumps(c), 'page errors', errs[:6])
        print('VEHICLES TEST', 'PASS' if not c['bar'] and not c['err'] and c['status']['errors'] == 0 and not errs else 'FAIL'); await b.close()
asyncio.run(main())
