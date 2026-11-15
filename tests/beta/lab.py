# python3 tests/beta/lab.py <out dir> [hash params]   (through tools/run_test.sh, like every browser test)
# Quick pictures for judging the look: loads tests/beta/lab.html (the real renderer, ground, sky, trees, effects and tank model, but
# no battle, crew or interior, so it is ready in seconds instead of minutes), sets places, weathers, cameras and staged effects by
# hand and saves a picture of each. Test only: the lab page is not part of what is published.
# Env: SET = comma list of set names or picture names (default env); W, H (default 960x540); MAXS seconds budget (default 540);
#      GFX = graphics level for the whole run (default high); OLD = a commit: draw with src/render as it was then (the BEFORE pictures).
import asyncio, os, sys, json, time, shutil
from playwright.async_api import async_playwright
OUT = sys.argv[1]; GFX = os.environ.get('GFX', 'high'); PARAMS = (sys.argv[2] if len(sys.argv) > 2 else 'gfx=%s' % GFX) + ('&r=render_old' if os.environ.get('OLD') else '')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '../..')); T0 = time.time()
# staged effects: p = a point 45 m in front and to the right of the tank
EXPL = "void (() => { const L = __lab, S = L.scene, p = L.pt(L.T.h + 70, 38, 0.4); window.__p = p; S.fx.seed(11); S.fx.explosion(p.x, p.y, p.z, 1.5, {}); S.blast(p, 1.4); L.cam(215, 60, 9, 3); })()"
MUZ = "void (() => { const L = __lab, S = L.scene, a = (L.T.h + 25) * Math.PI / 180, m = L.pt(L.T.h + 25, 6.5, 2.3), g = L.pt(0, 0, 0.3); S.fx.seed(5); S.fx.muzzleBlast(m.x, m.y, m.z, Math.sin(a), 0, -Math.cos(a), 1.5); S.fx.dustRing(g.x, g.y, g.z, 1.3, 11); S.blast(m, 1.4, false); L.cam(L.T.h + 25 + 62, 26, 4.5, 2.2); })()"
CLOUD = "void (() => { const L = __lab; for (let i = 0; i < 7; i++) { const d = 55 + i * 9, p = L.pt(L.T.h + 25, d, 3.2 + (i % 3) * 0.6); L.cloud.add({ id: 100 + i * 7, t0: L.bt + 0.3 + i * 0.12, tb: L.bt + i * 0.12, x: p.x, y: p.y, z: p.z, vx: 1.2, vz: 0.6, s0: 2, K: 2, wash: 0, gy: p.y - 3.2 - (i % 3) * 0.6 }); L.scene.fx.seed(i + 1); L.scene.fx.cloudPop(p.x, p.y, p.z); } const c = L.pt(L.T.h + 25 + 152, 24, 5.5), t = L.pt(L.T.h + 25, 70, 4); L.look(c.x, c.y, c.z, t.x, t.y, t.z, 46); })()"
FIRE = "void (() => { const L = __lab, S = L.scene, p = L.pt(L.T.h + 70, 30, 0.3); S.fx.seed(3); S.fx.fire(p.x, p.y, p.z, 60, 1.2); S.fx.column(p.x, p.y, p.z, 60, 1); L.cam(215, 55, 8, 4); })()"
ENV = [('farm_day_orbit', ["__lab.place('farmland','day')", "__lab.cam(215, 42, 13)"]), ('farm_day_close', ["__lab.cam(160, 13, 2.4, 1.6)"]), ('farm_day_side', ["__lab.cam(60, 16, 3, 1.6)"]), ('farm_day_wide', ["__lab.cam(200, 160, 40)"]), ('farm_day_ground', ["__lab.cam(250, 22, 1.6, 1.2)"])]
SETS = {
 'env': ENV,
 'dusk': [('desert_dusk', ["__lab.place('desert','dusk')", "__lab.cam(100, 30, 5)"]), ('desert_dusk_wide', ["__lab.cam(70, 110, 22)"]), ('desert_dusk_sun', ["__lab.cam(85, 28, 3, 3)"])],
 'rain': [('town_rain', ["__lab.place('town','rain')", "__lab.cam(215, 30, 6)"]), ('town_rain_close', ["__lab.cam(150, 12, 2.2, 1.5)"])],
 'fog': [('forest_fog', ["__lab.place('forest','fog')", "__lab.cam(215, 34, 7)"]), ('forest_dawn', ["__lab.place('forest','dawn')", "__lab.cam(275, 30, 4, 4)"]), ('forest_day', ["__lab.place('forest','day')", "__lab.cam(215, 34, 7)"])],
 'snow': [('farm_snow', ["__lab.place('farmland','snow')", "__lab.cam(215, 34, 7)"]), ('farm_overcast', ["__lab.place('farmland','overcast')", "__lab.cam(215, 34, 7)"])],
 'night': [('farm_night', ["__lab.place('farmland','night')", "__lab.cam(215, 42, 13)"]), ('farm_night_thermal', ["void __lab.scene.setThermal(1)"]), ('farm_night_fire', ["void __lab.scene.setThermal(0)", FIRE, "__lab.step(6)"])],
 'fx': [('fx_muzzle_a', ["__lab.place('farmland','day')", MUZ, "__lab.step(0.06)"]), ('fx_muzzle_b', ["__lab.step(0.5)"]), ('fx_muzzle_c', ["__lab.step(2.0)"]),
        ('fx_expl_a', ["__lab.place('farmland','day')", EXPL, "__lab.step(0.07)"]), ('fx_expl_b', ["__lab.step(0.45)"]), ('fx_expl_c', ["__lab.step(2.0)"]), ('fx_expl_d', ["__lab.step(7)"]),
        ('fx_cloud_a', ["__lab.place('farmland','day')", CLOUD, "__lab.step(1.4)"]), ('fx_cloud_b', ["__lab.step(4)"]),
        ('fx_fire', ["__lab.place('farmland','day')", FIRE, "__lab.step(8)"])],
 'fxdusk': [('fxd_expl_b', ["__lab.place('desert','dusk')", EXPL, "__lab.step(0.5)"]), ('fxd_expl_c', ["__lab.step(3)"]), ('fxd_cloud', ["__lab.place('desert','dusk')", CLOUD, "__lab.step(2.5)"]), ('fxd_fire', ["__lab.place('desert','dusk')", FIRE, "__lab.step(8)"])],
}
async def main():
    os.makedirs(OUT, exist_ok=True); want = os.environ.get('SET', 'env').split(',')
    shots = [(n, s) for k, v in SETS.items() for n, s in v if k in want or n in want]
    extra = os.environ.get('JS')   # a file of extra pictures: one per line, "name | javascript ; javascript"
    if extra:
        for line in open(extra):
            if '|' in line: n, s = line.split('|', 1); shots.append((n.strip(), [x.strip() for x in s.split(' ;; ') if x.strip()]))
    shutil.copy(os.path.join(HERE, 'lab.html'), os.path.join(ROOT, 'build/beta_http/lab.html'))
    old = os.environ.get('OLD')
    if old:
        import subprocess, tempfile
        tmp = tempfile.mkdtemp(); subprocess.run('git -C "%s" archive %s src/render | tar -x -C "%s"' % (ROOT, old, tmp), shell=True, check=True)
        dst = os.path.join(ROOT, 'build/beta_http/render_old'); shutil.rmtree(dst, ignore_errors=True); shutil.copytree(os.path.join(tmp, 'src/render'), dst)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '960')), 'height': int(os.environ.get('H', '540'))})
        errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'].replace('index.html', 'lab.html') + '#' + PARAMS, timeout=120000)
        while time.time() - T0 < 300 and not await pg.evaluate('!!(window.__lab && window.__lab.up && window.__lab.ready())'): await pg.wait_for_timeout(500)
        if not await pg.evaluate('!!(window.__lab && window.__lab.up)'): print('NOT READY', json.dumps(errs[:8], indent=1)); await b.close(); return
        print('ready at %.0f s' % (time.time() - T0), json.dumps(await pg.evaluate('({ depth: __lab.scene.depthOK, air: __lab.scene.air ? __lab.scene.air.enabled : null, gpu: __lab.scene.gpu().slice(0, 40), shaderErrs: __lab.scene.shaderErrs || 0 })')), flush=True)
        for name, steps in shots:
            if time.time() - T0 > int(os.environ.get('MAXS', '540')): print('out of time before', name); break
            try:
                for s in steps: await pg.evaluate(s)
                st = await pg.evaluate('__lab.frame(2)'); await pg.wait_for_timeout(300)
                await pg.screenshot(path=os.path.join(OUT, name + '.png'), timeout=120000)
                print('%-18s %5.0f s  calls %d  tris %d' % (name, time.time() - T0, st['calls'], st['triangles']), (await pg.evaluate('__lab.err()'))[:400], flush=True)
            except Exception as e: print(name, 'FAILED', str(e)[:400], flush=True)
        print('errors', json.dumps(errs[:8], indent=1)); await b.close()
asyncio.run(main())
