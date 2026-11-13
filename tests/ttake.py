import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.evaluate("document.querySelector('.ui2-modes [data-mode=study]').click()")
        await pg.wait_for_function("document.querySelectorAll('#takeaways li').length > 2", timeout=480000)
        print('takeaway 1:', (await pg.evaluate("document.querySelector('#takeaways li').textContent"))[:420]); print(await pg.evaluate("document.querySelector('#answer').textContent"))
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
