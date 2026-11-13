import asyncio, os, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto(sys.argv[1], timeout=180000, wait_until='commit')
        for i in range(12):
            await pg.wait_for_timeout(10000)
            ok = await pg.evaluate("(()=>{try{return !!(window.__SB && window.__SB().rec)}catch(e){return String(e)}})()"); print(i, ok, errs[:4], flush=True)
            if ok is True: break
        await b.close()
asyncio.run(main())
