import asyncio, os
from playwright.async_api import async_playwright
async def shot(pg, name):
    bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
    await pg.screenshot(path=f'v14_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=240000); print('shot', name, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1); pg.set_default_timeout(600000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=600000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=180000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()"); await pg.wait_for_timeout(15000)
        r = await pg.evaluate("(()=>{const r=window.__SB().rec; return {th: r.threats.map(t=>[t.key, t.brg, +(t.cue??-1), +(t.track??-1)]), acts: (r.crew&&r.crew.acts||[]).map(a=>[+a.t.toFixed(2), a.why]), path: r.crew && r.crew.path ? r.crew.path.filter((p,i)=>i%10==0).slice(0,12) : null}})()"); print(r)
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=free]').click()")
        await pg.evaluate("window.__sbxDbg = {p:[13,9,13], l:[0,1.8,0], fov:50}")
        for tt in [1.0, 3.0, 6.0, 9.0]:
            await pg.evaluate(f"window.__SB().seek({tt})"); await pg.wait_for_timeout(5000)
            print(tt, await pg.evaluate("window.__C ? 0 : 0")); await shot(pg, f'tur_{tt}')
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
