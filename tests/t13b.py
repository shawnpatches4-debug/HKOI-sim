import asyncio, os
from playwright.async_api import async_playwright
async def shot(pg, name):
    bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
    await pg.screenshot(path=f'v13_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=180000); print('shot', name, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=120000)
        await pg.evaluate("(()=>{const s=document.querySelector('#sbxPreset'); s.value='heli'; s.dispatchEvent(new Event('change'))})()")
        await pg.evaluate("document.querySelector('#sbxProt button[data-p=none]').click()"); await pg.wait_for_timeout(8000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        info = await pg.evaluate("(()=>{const r=window.__SB().rec; return r.threats.map(th=>[th.key, th.brg, th.viz.end.type, +th.viz.end.t.toFixed(1)])})()"); print(info)
        dr = [x for x in info if x[0].startswith('fpv') and x[2] == 'hit']
        if not dr: print('no drone hit'); return
        k, brg, _, te = dr[0]
        import math
        a = math.radians(brg + 70); cx, cz = 14 * math.sin(a), -14 * math.cos(a)
        await pg.evaluate(f"window.__sbxDbg = {{p:[{cx:.1f},4,{cz:.1f}], l:[{6*math.sin(math.radians(brg)):.1f},5,{-6*math.cos(math.radians(brg)):.1f}], fov:70}}")
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=free]').click()")
        for i, dtt in enumerate([-5, -2.5, -0.6, 0.15]):
            await pg.evaluate(f"window.__SB().seek({te + dtt})"); await pg.wait_for_timeout(4000); await shot(pg, f'dive_{i}')
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
