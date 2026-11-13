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
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='saturation'; e.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.querySelector('.f-tabs [data-ft=crew]').click()")
        await pg.evaluate("(()=>{const i=document.querySelector('.cr-card[data-role=drv] input[data-k=gain]'); i.value=1.5; i.dispatchEvent(new Event('input',{bubbles:true}))})()"); await pg.wait_for_timeout(2500)
        await pg.evaluate("window.__SB().setSpeed(0.02); window.__SB().seek(11)"); await pg.wait_for_timeout(3000)
        await pg.evaluate("document.querySelector('.f-lower').scrollIntoView()"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='crew.png', timeout=200000)
        print(await pg.evaluate("[...document.querySelectorAll('.cr-card')].map(c=>c.querySelector('b').textContent+': '+c.querySelector('.cr-st').textContent+' / '+c.querySelector('.cr-do').textContent).join(' | ')"))
        print(errs[:6]); await b.close()
asyncio.run(main())
