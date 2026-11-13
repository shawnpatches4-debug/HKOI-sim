import asyncio, os, json
from playwright.async_api import async_playwright
async def shot(pg, name):
    bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
    await pg.screenshot(path=f'v13_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=180000); print('shot', name, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=120000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        await pg.wait_for_timeout(15000)
        # interior, ambush preset, while engaging
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=cdr]').click()"); await pg.evaluate("window.__SB().seek(6.5)"); await pg.wait_for_timeout(6000); await shot(pg, 'cdr')
        await pg.evaluate("window.__cabDbg = {p:[0.1,0.0,0.15], l:[-0.6,-0.4,-0.7], fov:85}"); await pg.wait_for_timeout(4000); await shot(pg, 'cdr_left')
        await pg.evaluate("window.__cabDbg = null")
        # turret swung toward a threat on the flank
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=free]').click()")
        await pg.evaluate("window.__sbxDbg = {p:[-12,7,14], l:[0,2,0], fov:50}")
        for tt in [4.0, 7.5]:
            await pg.evaluate(f"window.__SB().seek({tt})"); await pg.wait_for_timeout(4000); await shot(pg, f'tur_{tt}')
        # drone raid
        await pg.evaluate("(()=>{const s=document.querySelector('#sbxPreset'); s.value='heli'; s.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(8000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        info = await pg.evaluate("(()=>{const r=window.__SB().rec; return r.threats.map(th=>[th.key, th.t0, th.viz.end.type, +th.viz.end.t.toFixed(1), th.viz.jink||0])})()"); print(info)
        await pg.evaluate("window.__sbxDbg = null"); await pg.evaluate("document.querySelector('#sbxCams button[data-cam=chase]').click()")
        dr = [x for x in info if x[0].startswith('fpv')]
        if dr:
            te = dr[0][3]
            for k, dtt in enumerate([-12, -4, -1.0]):
                await pg.evaluate(f"window.__SB().seek({max(0.5, te + dtt)})"); await pg.wait_for_timeout(4000); await shot(pg, f'drone_{k}')
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
