import asyncio, os
from playwright.async_api import async_playwright
async def shot(pg, name):
    bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
    await pg.screenshot(path=f'v17_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=600000); print('shot', name, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1); pg.set_default_timeout(600000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=600000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()"); await pg.wait_for_timeout(15000)
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=free]').click()")
        await pg.evaluate("window.__sbxDbgT = 0; window.__sbxDbgTp = [9, 4, -9]"); await pg.evaluate("window.__SB().seek(0.06)"); await pg.wait_for_timeout(5000); await shot(pg, 'team')
        await pg.evaluate("window.__sbxDbgT = null")
        await pg.evaluate("document.querySelector('#sbxProt button[data-p=none]').click()"); await pg.wait_for_timeout(10000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        te = await pg.evaluate("window.__SB().rec.t_end"); await pg.evaluate(f"window.__SB().seek({te + 1.9})"); await pg.wait_for_timeout(6000)
        await pg.evaluate("document.querySelector('#sbxXrayBtn').click()"); await pg.wait_for_timeout(6000); await shot(pg, 'xray')
        # night + thermal CITV
        await pg.evaluate("document.querySelector('#sbxXrayPanel [data-x=close]').click()")
        await pg.evaluate("(()=>{const s=document.querySelector('#sbxTod'); s.value='night'; s.dispatchEvent(new Event('change'))})()"); await pg.evaluate("window.__SB().seek(4)"); await pg.wait_for_timeout(6000)
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=cmd]').click()"); await pg.wait_for_timeout(5000); await shot(pg, 'night')
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=citv]').click()"); await pg.wait_for_timeout(5000); await shot(pg, 'night_citv')
        # command mode
        await pg.evaluate("document.querySelector('#sbxCmd').click()"); await pg.wait_for_timeout(8000); await pg.evaluate("window.__SB().seek(2)"); await pg.wait_for_timeout(2000)
        await pg.keyboard.press('a'); await pg.wait_for_timeout(4000); await pg.keyboard.press('g'); await pg.wait_for_timeout(4000)
        print(await pg.evaluate("document.querySelector('#sbxOrdLog').textContent"))
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
