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
        pre = os.environ.get('PRE', 'combined')
        await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(5000)
        for i in range(int(os.environ.get('N', '4'))):
            await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(3500)
            print(i, await pg.evaluate("document.querySelector('#sbxVerdict').textContent"), '| next hidden:', await pg.evaluate("document.querySelector('#sbxNext').hidden"))
            print('   veh:', await pg.evaluate("[...document.querySelectorAll('#stVeh i:not(.v-ok)')].map(e=>e.title).join('; ')"), '| mags:', await pg.evaluate("document.querySelector('#mags').innerText.replace(/\\n/g,' ')"))
            if await pg.evaluate("document.querySelector('#sbxNext').hidden"): break
            await pg.evaluate("document.querySelector('#sbxNext').click()"); await pg.wait_for_timeout(4000)
            print('   msg:', await pg.evaluate("document.querySelector('#sbxCarryMsg').textContent"))
        await pg.evaluate("document.querySelector('.station').scrollIntoView()"); await pg.screenshot(path='carry.png')
        print('errors', errs[:8]); await b.close()
asyncio.run(main())
