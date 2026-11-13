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
        await pg.evaluate("document.querySelector('#sbxFriends').value='2'")
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='think_platoon'; e.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(4000)
        await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.querySelector('#sbxNext').click()"); await pg.wait_for_timeout(4000)
        await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.querySelector('.st-seg [data-st=enemy]').click()"); await pg.wait_for_timeout(800)
        await pg.screenshot(path='u2_adp.png', timeout=200000)
        await pg.evaluate("document.querySelector('#sbxReviewBtn').click()"); await pg.wait_for_timeout(2500)
        await pg.screenshot(path='u2_review.png', timeout=200000)
        await pg.evaluate("document.querySelector('.ui2-pop summary').click(); document.querySelector('.f-left').scrollIntoView({block:'end'})"); await pg.wait_for_timeout(800)
        await pg.screenshot(path='u2_pop.png', timeout=200000)
        print(errs[:6]); await b.close()
asyncio.run(main())
