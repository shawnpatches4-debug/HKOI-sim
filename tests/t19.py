import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required'])
        for W in [1300, 390]:
            pg = await b.new_page(viewport={'width': W, 'height': 900}, device_scale_factor=1); pg.set_default_timeout(600000)
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text else None)
            await pg.add_init_script(f'window.__hkq = {2 if W > 600 else 1}')
            await pg.goto('file://' + os.path.abspath('test.html'))
            await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=600000); await pg.wait_for_timeout(12000)
            await pg.mouse.click(W // 2, 300)
            v = await pg.evaluate("(async()=>{ const S = window.__SND(); S.start(); await new Promise(r=>setTimeout(r,8000)); return { ready: S.ready } })()")
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            await pg.evaluate("document.querySelector('#sbxCams button[data-cam=cdr]').click()"); await pg.evaluate("window.__SB().seek(6)"); await pg.wait_for_timeout(6000)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
            await pg.screenshot(path=f'v19_{W}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True)
            print(W, 'scrollWidth', sw, v, 'ERR', errs[:5], flush=True); await pg.close()
        await b.close()
asyncio.run(main())
