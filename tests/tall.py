import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        keys = await pg.evaluate("[...document.querySelectorAll('#sbxPreset option')].map(o=>o.value)")
        keys = keys[int(os.environ.get('START','0')):]
        for pre in keys:
            n0 = len(errs)
            await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(3500)
            await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(3000)
            print(pre.ljust(15), (await pg.evaluate("document.querySelector('#sbxVerdict').textContent")).ljust(48), await pg.evaluate("window.__SB().rec.threats.length"), 'jit', await pg.evaluate("document.querySelector('#misJit').value"), errs[n0:n0+2], flush=True)
        await b.close()
asyncio.run(main())
