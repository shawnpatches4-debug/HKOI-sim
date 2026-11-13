import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='think_platoon'; e.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(3000)
        await pg.evaluate("document.querySelector('.sbxgrid').scrollIntoView()")
        await pg.screenshot(path='grp_brief.png', timeout=200000)
        await pg.evaluate("document.querySelector('#sbxBrief [data-fr=\"2\"]').click()"); await pg.wait_for_timeout(5000)
        await pg.evaluate("(()=>{const b=document.querySelector('#sbxCamPlt'); if(b&&!b.hidden) b.click(); window.__SB().setSpeed(0.01); window.__SB().seek(9)})()"); await pg.wait_for_timeout(6000)
        await pg.screenshot(path='grp_play.png', timeout=200000)
        print(errs[:5]); await b.close()
asyncio.run(main())
