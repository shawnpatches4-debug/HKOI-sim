# python3 tests/beta/evaljs.py "<hash params>" "<js expression>" ... : load the build headless, evaluate each expression in the page
# and print the results, then any page errors and warnings (shader compile errors show up here). Env: BASE, W, H, SETTLE (ms).
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': os.environ.get('CHROME', '/usr/bin/google-chrome')} if os.path.exists(os.environ.get('CHROME', '/usr/bin/google-chrome')) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '480')), 'height': int(os.environ.get('H', '270'))}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:400])); pg.on('console', lambda m: m.type in ('error', 'warning') and '404' not in m.text and 'GPU stall' not in m.text and errs.append(m.text[:900]))
        await pg.goto(os.environ['BASE'] + '#' + sys.argv[1], timeout=180000)
        for _ in range(240):
            try:
                if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            except Exception: pass
            await pg.wait_for_timeout(1000)
        await pg.wait_for_timeout(int(os.environ.get('SETTLE', '6000')))
        for js in sys.argv[2:]:
            try: print(json.dumps(await pg.evaluate(js))[:3000])
            except Exception as e: print('ERR', str(e)[:500])
        print('errors', errs[:8]); await b.close()
asyncio.run(main())
