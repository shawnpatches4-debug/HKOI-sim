import asyncio, os, sys
from playwright.async_api import async_playwright
async def main():
    W = int(os.environ.get('W', '1440')); H = int(os.environ.get('H', '900')); tag = os.environ.get('TAG', '')
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': W, 'height': H})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("window.__SB().setSpeed(0.02); window.__SB().seek(7)"); await pg.wait_for_timeout(5000)
        await pg.screenshot(path=f'u2_fight{tag}.png', timeout=200000)
        for k in os.environ.get('TABS', 'enemy,mission,settings').split(','):
            await pg.evaluate(f"(()=>{{document.querySelector('.f-tabs [data-ft={k}]').click(); document.querySelector('.f-lower').scrollIntoView()}})()"); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f'u2_{k}{tag}.png', timeout=200000)
        if os.environ.get('MODES', '1') == '1':
            for m in ['study', 'ref']:
                await pg.evaluate(f"document.querySelector('.ui2-modes [data-mode={m}]').click()"); await pg.wait_for_timeout(4000)
                await pg.screenshot(path=f'u2_{m}{tag}.png', timeout=200000)
            await pg.evaluate("document.querySelector('.ui2-modes [data-mode=fight]').click()"); await pg.wait_for_timeout(2000)
        print('overflow', await pg.evaluate("document.documentElement.scrollWidth - innerWidth"), errs[:6]); await b.close()
asyncio.run(main())
