# python3 tests/beta/enemyall.py <out dir> [hash params]: every enemy view, one after another, in a battle that has had time to
# start. For each: does the camera stay in that view or fall back, which unit it follows, the red error bar, page errors, and a
# picture after a few real frames. Then the same views after stepping to the next enemy unit with the view's own step.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
STATE = """JSON.stringify({ want: window.__want, mode: __beta.cams.mode, unit: __beta.cams.unit ? (__beta.cams.unit.spec ? __beta.cams.unit.spec.name + ' #' + (__beta.cams.unit.id + 1) : String(__beta.cams.unit.id)) : null,
  t: +__beta.battle.t.toFixed(1), err: (document.getElementById('errbar').hidden ? '' : document.getElementById('errbar').textContent.slice(0, 300)),
  fpv: (() => { const e = document.getElementById('fpv'); return e ? { cls: e.className, shown: !!e.offsetParent } : null; })(),
  sight: (() => { const e = document.getElementById('esight'); return e ? { shown: !!e.offsetParent } : null; })(),
  units: document.querySelectorAll('#units button, #units .u').length, cap: (document.getElementById('seatcap') || {}).textContent || '',
  cam: __beta.scene.camera.position.toArray().map(v => +v.toFixed(1)), teams: __beta.battle.units.filter(u => u.alive).length,
  inAir: (__beta.volleys && __beta.volleys.info || []).length })"""
async def main():
    out = sys.argv[1]; params = sys.argv[2] if len(sys.argv) > 2 else 'gfx=low&speed=1&spectator=1&force=heavy'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 960, 'height': 540}); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append('CONSOLE ' + m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#' + params, timeout=120000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=300000)
        await pg.evaluate("document.getElementById('go').click()"); await pg.wait_for_timeout(2000)
        T = float(os.environ.get('T', '25'))
        await pg.evaluate(f"void __beta.runTo({T})"); await pg.wait_for_timeout(1500)
        for v in os.environ.get('VIEWS', 'enemy,troops,missile,fpv').split(','):
            for step in range(int(os.environ.get('STEPS', '2'))):
                if step == 0: await pg.evaluate(f"void (window.__want = '{v}', __beta.setView('{v}'))")
                else: await pg.keyboard.press(']')   # the next enemy unit
                await pg.wait_for_timeout(int(os.environ.get('WAIT', '9')) * 1000)
                s = json.loads(await pg.evaluate(STATE)); print(v, step, json.dumps(s))
                try: await pg.screenshot(path=os.path.join(out, f'ev_{v}_{step}.png'), timeout=90000)
                except Exception as e: print('  no picture', str(e)[:80])
        print('errors', json.dumps(errs[:12], indent=1)); await b.close()
asyncio.run(main())
