# Real frame loop with each inside view on (four crew seats and the cutaway) for at least 30 simulated seconds each, through volleys.
# Operates every clickable control once, drags the head round and clicks with the real mouse. Reports frame errors.
# Use: BASE=http://localhost:<port>/index.html python3 tests/beta/interior_loop.py <out.png> ["hash params"]
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    params = sys.argv[2] if len(sys.argv) > 2 else 'gfx=min&speed=4&force=heavy'; need = float(os.environ.get('SIM_S', '30'))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '480')), 'height': int(os.environ.get('H', '270'))}); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'] + '#' + params, timeout=120000)
        for i in range(160):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        await pg.evaluate('document.getElementById("go").click()'); await pg.wait_for_timeout(1000); bad = 0
        for k, mode in enumerate(['in_gnr', 'in_cdr', 'in_ldr', 'in_drv', 'cut']):
            await pg.evaluate(f"__beta.cams.set('{mode}')"); t0 = await pg.evaluate('__beta.battle.t'); n = 0
            while True:
                await pg.wait_for_timeout(3000); n += 1
                if n == 1 and mode != 'cut':
                    await pg.mouse.move(200, 130); await pg.mouse.down(); await pg.mouse.move(260, 150); await pg.mouse.move(150, 110); await pg.mouse.up(); await pg.mouse.click(240, 135)
                    await pg.evaluate('void (__beta.interior.controls.forEach(c => __beta.interior.operate(c)))')
                r = json.loads(await pg.evaluate('JSON.stringify({t: +__beta.battle.t.toFixed(1), alive: __beta.battle.tank.alive, v: __beta.battle.volleys.length, mode: __beta.cams.mode, inside: __beta.interior.inside, active: __beta.interior.active, hk: __beta.interior.hkState, warn: __beta.interior.warning, calls: __beta.scene.stats().calls, err: !document.getElementById("errbar").hidden && document.getElementById("errbar").textContent.slice(0, 300)})'))
                if r['err']: bad += 1
                if r['t'] - t0 >= need or n > 60 or r['err'] or (not r['alive'] and n > 6): break
            print(mode, 'simulated', round(r['t'] - t0, 1), 's', json.dumps(r))
            if k == 1: await pg.screenshot(path=sys.argv[1], timeout=120000)
        await pg.evaluate("__beta.cams.set('orbit')"); await pg.wait_for_timeout(2500)
        print('after leaving:', await pg.evaluate('JSON.stringify({active: __beta.interior.active, inScene: !!(__beta.interior.tur && __beta.interior.tur.parent), calls: __beta.scene.stats().calls})'))
        print('frame errors', bad, 'errors', errs[:6]); await b.close()
asyncio.run(main())
