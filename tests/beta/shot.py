# python3 tests/beta/shot.py <out.png> [hash params] : loads the local beta build headless, waits, takes a screenshot, prints stats and errors
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    out = sys.argv[1]; params = sys.argv[2] if len(sys.argv) > 2 else ''; views = json.loads(os.environ.get('VIEWS', '[]'))
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': os.environ.get('CHROME', '/usr/bin/google-chrome')} if os.path.exists(os.environ.get('CHROME', '/usr/bin/google-chrome')) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))})
        errs = []; pg.on('response', lambda r: r.status >= 400 and errs.append('HTTP %d %s' % (r.status, r.url[-80:]))); pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../build/beta/index.html')
        await pg.goto((os.environ.get('BASE') or 'file://' + os.path.abspath(root)) + ('#' + params if params else ''), timeout=120000)
        try: await pg.wait_for_function('window.__beta && window.__beta.scene', timeout=int(os.environ.get('WAIT', '120000')))
        except Exception as e: print('NOT READY', str(e)[:200], errs[:5]); await b.close(); return
        for cmd in json.loads(os.environ.get('PRE', '[]')): await pg.evaluate(cmd)
        await pg.wait_for_timeout(int(os.environ.get('SETTLE', '4000')))
        if not views: await pg.screenshot(path=out, timeout=120000)
        for i, v in enumerate(views):
            await pg.evaluate(v if isinstance(v, str) else 'window.__beta.view(%s)' % ','.join(str(x) for x in v)); await pg.wait_for_timeout(2500); await pg.screenshot(path=out.replace('.png', f'_{i}.png'), timeout=120000)
        print(json.dumps(await pg.evaluate('window.__beta.scene.stats()')), await pg.evaluate("document.getElementById('hud').textContent.split('\\n').slice(0,3).join(' | ')")); print('errors', errs[:6]); await b.close()
asyncio.run(main())
