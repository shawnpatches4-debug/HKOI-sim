# python3 tests/beta/tankvis.py <out dir> [hash params]: is the vehicle drawn in the outside views while the loader is up in his
# hatch? Forces the loader up, looks from the orbit camera, saves a picture and reports what the interior did to the outside model.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
REP = """JSON.stringify((() => { const I = __beta.interior, T = __beta.tank, root = T.model || T.group; let meshes = 0, clipped = 0, hidden = 0;
  root.traverse(o => { if (!o.isMesh) return; meshes++; let v = true, p = o; while (p) { if (!p.visible) v = false; p = p.parent; } if (!v) hidden++; for (const m of [].concat(o.material)) if (m && m.clippingPlanes && m.clippingPlanes.length) { clipped++; break; } });
  return { mode: I.mode, active: I.active, boxed: I.boxed ? I.boxed.length : 0, ext: I.ext ? I.ext.length : 0, planes: I.boxPl ? I.boxPl.map(p => [+p.normal.x.toFixed(2), +p.normal.y.toFixed(2), +p.normal.z.toFixed(2), +p.constant.toFixed(1)]) : null,
    meshes, clipped, hidden, ldrU: +I.st.ldrU.toFixed(2), hatch: +I.st.hatch.toFixed(2), cam: __beta.cams.mode, tankVisible: T.group.visible, turParent: !!(I.tur && I.tur.parent), local: __beta.scene.renderer.localClippingEnabled }; })())"""
async def main():
    out = sys.argv[1]; params = sys.argv[2] if len(sys.argv) > 2 else 'gfx=low&speed=1'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 960, 'height': 540}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto(os.environ['BASE'] + '#' + params, timeout=120000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=300000)
        await pg.evaluate("document.getElementById('go').click()"); await pg.wait_for_timeout(3000)
        print('before', await pg.evaluate(REP)); await pg.screenshot(path=os.path.join(out, 'vis_0_before.png'))
        await pg.evaluate("void (() => { const L = __beta.battle.tank.ai.ldr; Object.defineProperty(L, 'up', { get: () => true, set() {}, configurable: true }); })()")
        await pg.wait_for_timeout(int(os.environ.get('WAIT', '25')) * 1000)
        print('loader up, orbit', await pg.evaluate(REP)); await pg.screenshot(path=os.path.join(out, 'vis_1_ldrup.png'))
        await pg.evaluate("void __beta.setView('in_gnr')"); await pg.wait_for_timeout(8000); await pg.evaluate("void __beta.setView('orbit')"); await pg.wait_for_timeout(12000)
        print('after a seat, orbit', await pg.evaluate(REP)); await pg.screenshot(path=os.path.join(out, 'vis_2_afterseat.png'))
        print('errors', errs[:5]); await b.close()
asyncio.run(main())
