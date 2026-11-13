import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = ' + os.environ.get('HQ','0'))
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.select_option('#sbxPreset', os.environ.get('PRE','overkill')); await pg.dispatch_event('#sbxPreset', 'change')
        await pg.wait_for_timeout(6000)
        info = await pg.evaluate("(()=>{const r=window.__SB().rec;const c={};for(const th of r.threats){const k=th.viz.end.type;c[k]=(c[k]||0)+1}return {n:r.threats.length,ends:c,killed:!!r.killed,platoon:(r.platoon||[]).map(p=>({k:p.k,n:p.rec.threats.length,killed:!!p.rec.killed,hits:p.rec.hits}))}})()")
        print(info, flush=True)
        for T, cam in [(int(x.split(':')[0]), x.split(':')[1]) for x in os.environ.get('SHOTS','25:chase,60:top').split(',')]:
            await pg.evaluate(f"document.querySelector('#sbxCams button[data-cam={cam}]') && document.querySelector('#sbxCams button[data-cam={cam}]').click(); window.__SB().seek({T})")
            if os.environ.get('DBG'): await pg.evaluate('window.__sbxDbg = ' + os.environ['DBG'])
            await pg.wait_for_timeout(int(os.environ.get('WAIT','6000')))
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
            await pg.screenshot(path=f'sw_{T}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=300000); print('shot', T, flush=True)
        print(errs[:5]); print(await pg.evaluate("document.querySelector('#sbxVerdict').textContent")); await b.close()
asyncio.run(main())
