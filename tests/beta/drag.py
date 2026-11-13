# python3 tests/beta/drag.py [hash params]: can the player look around? Starts a battle, drags the mouse across the view and turns the
# wheel, and reports how far the camera moved, what element is under the pointer, and whether the controls are enabled.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    params = sys.argv[1] if len(sys.argv) > 1 else ''
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../build/', os.environ.get('BUILD', 'beta'), 'index.html')
        await pg.goto('file://' + os.path.abspath(root) + ('#' + params if params else ''), timeout=120000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=180000)
        await pg.evaluate("document.getElementById('go').click()"); await pg.wait_for_timeout(4000)
        cam = "JSON.stringify(__beta.scene.camera.position.toArray().map(v => +v.toFixed(1)))"
        print('mode', await pg.evaluate('__beta.cams.mode'), 'controls enabled', await pg.evaluate('__beta.scene.controls.enabled'), 'under pointer:', await pg.evaluate("(e => e.tagName + '#' + e.id)(document.elementFromPoint(500, 300))"))
        before = await pg.evaluate(cam)
        await pg.mouse.move(500, 300); await pg.mouse.down(); 
        for i in range(8): await pg.mouse.move(500 + 30 * (i + 1), 300 + 5 * i); await pg.wait_for_timeout(700)
        await pg.mouse.up(); await pg.wait_for_timeout(3000); mid = await pg.evaluate(cam)
        await pg.mouse.wheel(0, 600); await pg.wait_for_timeout(4000); after = await pg.evaluate(cam)
        print('camera before', before, 'after drag', mid, 'after wheel', after, '| t', await pg.evaluate('__beta.battle.t'))
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
