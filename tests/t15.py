import asyncio, os
from playwright.async_api import async_playwright
async def shot(pg, name):
    bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
    await pg.screenshot(path=f'v15_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=600000); print('shot', name, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1); pg.set_default_timeout(600000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=600000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()"); await pg.wait_for_timeout(15000)
        await pg.evaluate("window.__SB().seek(5.5)")
        for name, cam, js in [('gps_day', 'gps', ''), ('gps_th', 'gps', "document.querySelector('#sbxThermal').click()"), ('citv', 'citv', ''), ('hs', 'hsight', ''), ('hs_zoom_day', 'hsight', "document.querySelector('#sbxZoomIn').click(); document.querySelector('#sbxThermal').click()")]:
            await pg.evaluate(f"document.querySelector('#sbxCams button[data-cam={cam}]').click()")
            if js: await pg.evaluate(js)
            await pg.wait_for_timeout(5000); await shot(pg, name)
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
