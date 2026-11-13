import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        for i, tt in enumerate([7.2, 9.5, 14]):
            await pg.evaluate(f"window.__SB().seek({tt})"); await pg.wait_for_timeout(1500)
            if i == 0: await pg.evaluate("document.querySelector('#sbxInspBtn').click()")
            await pg.wait_for_timeout(2500)
            print(tt, await pg.evaluate("document.querySelector('#sbxInsp .in-b').innerText.replace(/\\n+/g,' | ')"))
            if i < 2: await pg.screenshot(path=f'insp{i}.png', timeout=200000)
        print(errs[:6]); await b.close()
asyncio.run(main())
