import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.add_init_script('window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        pre = os.environ.get('PRE', 'think_section')
        await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(3000)
        if pre.startswith('think'): await pg.evaluate("document.querySelector('#sbxBrief [data-fr=\"%s\"]').click()" % os.environ.get('FR','0'))
        else: await pg.evaluate("(()=>{const b=document.querySelector('#sbxBrief button.primary'); if(b) b.click()})()")
        await pg.wait_for_timeout(4000)
        print(await pg.evaluate("(()=>{const S=window.__SB(); return {n:S.rec.threats.length, tend:S.rec.t_end, t:S.t, th:S.rec.threats.map(q=>[q.key,q.R,q.brg,q.t0,q.viz.end.type,q.defeated_by]), labels:document.querySelectorAll('#sbxLabels > *').length}})()"))
        await pg.evaluate("window.__SB().setSpeed(0.02)")
        for tt in os.environ.get('T', '3,6,9').split(','):
            await pg.evaluate(f"window.__SB().seek({tt})"); await pg.wait_for_timeout(3500)
            await pg.screenshot(path=f'sp_{pre}_{tt}.png', timeout=200000, clip={'x':30,'y':150,'width':1050,'height':680})
        print(errs[:6]); await b.close()
asyncio.run(main())
