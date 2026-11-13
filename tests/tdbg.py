import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='think_platoon'; e.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(5000)
        await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(3000)
        print(await pg.evaluate("(()=>{const S=window.__SB(); const n=document.querySelector('#sbxNext'); return {hidden:n.hidden, attr:n.getAttribute('hidden'), txt:n.textContent, t:S.t, tend:S.rec.t_end, killed:S.rec.killed, plat:!!S.rec.platoon, keys:Object.keys(S)}})()"))
        print(errs[:10]); await b.close()
asyncio.run(main())
