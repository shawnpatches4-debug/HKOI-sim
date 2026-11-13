import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.type+': '+m.text[:200]))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        try: await pg.goto('file://' + os.path.abspath('test.html'), wait_until='commit', timeout=20000)
        except Exception as e: print('goto', str(e)[:100])
        await asyncio.sleep(25); print(errs[:8]); await b.close()
asyncio.run(main())
