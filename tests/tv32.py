import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        for fr, pre in [('0', 'think_section'), ('2', 'think_platoon'), ('1', 'think_company')]:
            await pg.evaluate(f"document.querySelector('#sbxFriends').value='{fr}'")
            await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(3500)
            for i in range(3):
                await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(3000)
                v = await pg.evaluate("document.querySelector('#sbxVerdict').textContent")
                if await pg.evaluate("document.querySelector('#sbxNext').hidden"): break
                await pg.evaluate("document.querySelector('#sbxNext').click()"); await pg.wait_for_timeout(3000)
            print(pre, 'friends', fr, '|', v, '|', errs[:2], flush=True)
        try:
            await pg.wait_for_function("document.querySelectorAll('#takeaways li').length > 2", timeout=200000)
            print('takeaway 1:', (await pg.evaluate("document.querySelector('#takeaways li').textContent"))[:330])
        except Exception as e: print('takeaways not ready', str(e)[:60])
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
