import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0; window.__wiN = 12')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        pre = os.environ.get('PRE', 'mixed')
        await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(4000)
        await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.querySelector('.f-tabs [data-ft=whatif]').click(); document.querySelector('#wiGo').click()")
        for k in range(40):
            await pg.wait_for_timeout(5000); m = await pg.evaluate("document.querySelector('#wiMsg').textContent")
            if k % 4 == 0 or 'per row' in m: print(k*5, m[:60], errs[:2])
            if 'per row' in m or errs: break
        print(await pg.evaluate("[...document.querySelectorAll('#wiOut tbody tr')].map(r=>[...r.children].map(c=>c.innerText.trim()).filter(Boolean).join(' | ')).join('\\n')"))
        await pg.evaluate("document.querySelector('.f-lower').scrollIntoView()"); await pg.wait_for_timeout(800); await pg.screenshot(path='wi.png', timeout=200000)
        print(errs[:6]); await b.close()
asyncio.run(main())
