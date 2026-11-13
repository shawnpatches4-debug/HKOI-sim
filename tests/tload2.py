import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        try:
            await pg.goto('file://' + os.path.abspath('test.html'), timeout=60000); print('loaded OK')
        except Exception as e: print('HANG', str(e)[:60])
        print(errs[:5]); await b.close()
asyncio.run(main())
