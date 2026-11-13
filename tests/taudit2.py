import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:260])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:260]))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath(os.environ.get('PAGE','test.html')), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        keys = await pg.evaluate("[...document.querySelectorAll('#sbxPreset option')].map(o=>o.value)")
        keys = keys[int(os.environ.get('START','0')):]
        for pre in keys:
            n0 = len(errs)
            await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(3000)
            await pg.evaluate("(()=>{const b=document.querySelector('#sbxBrief button.primary, #sbxBrief [data-fr=\"0\"]'); if(b) b.click()})()"); await pg.wait_for_timeout(2500)
            te = await pg.evaluate("window.__SB().rec.t_end || 20")
            await pg.evaluate("window.__SB().setSpeed(0.05)")
            for cam in ['cmd','cdr','enemy','top','chase']:
                await pg.evaluate(f"(()=>{{const b=document.querySelector('#sbxCams button[data-cam={cam}]'); if(b) b.click()}})()")
                for f in (.3, .6, .9):
                    await pg.evaluate(f"window.__SB().seek({te*f})"); await pg.wait_for_timeout(900)
            await pg.evaluate("document.querySelector('#sbxCams button[data-cam=cmd]').click(); window.__SB().seek(1e4)"); await pg.wait_for_timeout(2000)
            print(pre.ljust(15), (await pg.evaluate("document.querySelector('#sbxVerdict').textContent"))[:44].ljust(46), await pg.evaluate("window.__SB().rec.threats.length"), sorted(set(errs[n0:]))[:3], flush=True)
        await b.close()
asyncio.run(main())
