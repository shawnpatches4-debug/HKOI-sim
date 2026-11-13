# python3 tests/beta/click.py <out.png> [hash params]: the real path a player takes. Loads the title screen, clicks Start with the
# mouse, lets the battle run in real time, and reports whether simulated time advanced, any errors, and what the page shows.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    out = sys.argv[1]; params = sys.argv[2] if len(sys.argv) > 2 else ''
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))})
        errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(getattr(e, 'stack', e))[:900])); pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.type + ' ' + m.text[:300]))
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../build/', os.environ.get('BUILD', 'beta'), 'index.html')
        await pg.goto('file://' + os.path.abspath(root) + ('#' + params if params else ''), timeout=120000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=180000)
        print('title up; state', await pg.evaluate('__beta.state()'))
        for sel in json.loads(os.environ.get('CLICKS', '[]')): await pg.evaluate('document.querySelector(%s).click()' % json.dumps(sel)); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.getElementById('go').click()"); await pg.wait_for_timeout(1000)
        for i in range(int(os.environ.get('LOOPS', '6'))):
            await pg.wait_for_timeout(5000)
            try: print('after', (i + 1) * 5, 's:', await asyncio.wait_for(pg.evaluate('JSON.stringify({state: __beta.state(), t: __beta.battle.t, alive: __beta.battle.tank.alive, volleys: __beta.battle.volleys.length, audio: __beta.sound.ctx && __beta.sound.ctx.state, veil: !document.getElementById("veil").hidden, title: !document.getElementById("title").hidden})'), 60))
            except Exception as e: print('PAGE NOT RESPONDING', str(e)[:100]); break
        try: await pg.screenshot(path=out, timeout=60000)
        except Exception as e: print('no screenshot', str(e)[:80])
        print('errors', json.dumps(errs[:12], indent=1)); await b.close()
asyncio.run(main())
