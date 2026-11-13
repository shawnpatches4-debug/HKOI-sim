import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=120000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        for preset in ['ambush']:
            await pg.evaluate(f"(()=>{{const s=document.querySelector('#sbxPreset'); s.value='{preset}'; s.dispatchEvent(new Event('change'))}})()")
            await pg.evaluate("document.querySelector('#sbxProt button[data-p=none]').click()")
            await pg.wait_for_timeout(4000)
            await pg.evaluate("document.querySelector('#sbxPlay').click()")
            kt = await pg.evaluate("(()=>{const r=window.__SB().rec; let k=1e9; for(const th of r.threats){const e=th.viz.end; if(e.type==='hit'&&e.killing) k=Math.min(k,e.t)} return k})()")
            print(preset, 'kill at', kt)
            if kt < 1e8: break
        await pg.wait_for_timeout(20000)
        print('model', await pg.evaluate("!!document.querySelector('#sbxCanvas')"))
        shots = [('pre', 2, 'free'), ('cook', kt + 1.2, 'free'), ('run2', kt + 6.5, 'free')]
        for name, tt, cam in shots:
            await pg.evaluate(f"document.querySelector('#sbxCams button[data-cam={cam}]').click()")
            await pg.evaluate("window.__sbxDbg = {p:[14,4.5,10], l:[0,1.8,0], fov:55}")
            await pg.evaluate(f"window.__SB().seek({tt})")
            await pg.wait_for_timeout(5000)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
            await pg.screenshot(path=f'k_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=180000); print('shot', name, flush=True)
        print('ERR', errs[:8]); await b.close()
asyncio.run(main())
