import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1); pg.set_default_timeout(600000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=600000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()"); await pg.wait_for_timeout(15000)
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=free]').click()")
        for i, (tp, tt) in enumerate([([4, 1.6, -3], 3.0), ([-2.5, 1.2, 3], 0.4), ([0, 6, 0.1], 3.0)]):
            await pg.evaluate(f"window.__sbxDbgT = 0; window.__sbxDbgTp = {tp}"); await pg.evaluate(f"window.__SB().seek({tt})"); await pg.wait_for_timeout(5000)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
            await pg.screenshot(path=f'v18_team{i}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True); print('shot', i, flush=True)
        print(await pg.evaluate("(()=>{ const C = window.__C(); return 'ok' })()"))
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
