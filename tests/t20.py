import asyncio, os
from playwright.async_api import async_playwright
async def shotv(pg, name):
    bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
    await pg.screenshot(path=f'v20_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True); print('shot', name, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 900}, device_scale_factor=1); pg.set_default_timeout(600000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text else None)
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=600000); await pg.wait_for_timeout(12000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        # editor: reload preset, salvo
        await pg.evaluate("(()=>{const s=document.querySelector('#sbxPreset'); s.value='reload'; s.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(9000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        el = await pg.query_selector('.sbxplan'); await el.screenshot(path='v20_editor.png'); print('shot editor')
        # moving-tank engagement from the side: rounds, cloud and missile line up
        await pg.evaluate("(()=>{const s=document.querySelector('#sbxPreset'); s.value='ambush'; s.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(9000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        b0 = await pg.evaluate("(()=>{const r=window.__SB().rec; const b=r.bursts.find(x=>x.kind==='obs'); return b ? [b.tf, b.idx, r.threats[b.idx].brg] : null})()"); print('burst', b0)
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=top]').click()")
        if b0:
            for k, dtt in enumerate([1.2, 2.6]):
                await pg.evaluate(f"window.__SB().seek({b0[0] + dtt})"); await pg.wait_for_timeout(5000); await shotv(pg, f'top{k}')
        await pg.evaluate("document.querySelector('#misRandom').click()"); await pg.wait_for_timeout(9000); print(await pg.evaluate("document.querySelector('#misCount').textContent"))
        await pg.evaluate("document.querySelector('#misShare').click()"); await pg.wait_for_timeout(500); code = await pg.evaluate("document.querySelector('#misCode').value"); print('code len', len(code))
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
