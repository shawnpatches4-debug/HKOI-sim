import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 900}, device_scale_factor=1); pg.set_default_timeout(600000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text else None)
        await pg.add_init_script('window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=600000); await pg.wait_for_timeout(12000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        r0 = await pg.evaluate("(()=>{const r=window.__SB().rec; const b=r.bursts.find(x=>x.kind==='obs'); return b ? [b.tf, b.rounds[0].t_pass, b.rounds.map(x=>x.lead)] : null})()"); print('burst', r0)
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=hsight]').click()")
        await pg.evaluate(f"window.__SB().seek({(r0[0] + r0[1]) / 2})"); await pg.wait_for_timeout(5000)
        bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
        await pg.screenshot(path='v21_lead.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True)
        te = await pg.evaluate("window.__SB().rec.t_end"); await pg.evaluate(f"window.__SB().seek({te + 1.9})"); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.querySelector('#sbxReviewBtn').click()"); await pg.wait_for_timeout(2000)
        print(await pg.evaluate("(()=>{const t=[...document.querySelectorAll('#sbxReview h4')].find(h=>h.textContent==='Fire control'); return t ? t.nextElementSibling.nextElementSibling.innerText : 'no fc table'})()"))
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
