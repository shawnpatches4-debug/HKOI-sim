import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type=='error' and errs.append(m.text[:300]))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 1')
        await pg.goto('file://' + os.path.abspath(os.environ.get('PAGE','test.html')), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='%s'; e.dispatchEvent(new Event('change')); document.querySelector('#sbxProt [data-p=%s]').click()})()" % (os.environ.get('PRE','saturation'), os.environ.get('PROT','aps'))); await pg.wait_for_timeout(4000)
        await pg.evaluate("window.__SB().setSpeed(0.02)")
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=cdr]').click()")
        await pg.evaluate("window.__fcH = %s" % os.environ.get('FORCE','null'))
        T = os.environ.get('T','6')
        if T == 'kill': T = await pg.evaluate("(()=>{const r=window.__SB().rec;let k=1e9;for(const th of r.threats){const e=th.viz.end;if(e.type==='hit'&&e.killing)k=Math.min(k,e.t)}return k})()"); print('kill at', T, flush=True)
        for job in os.environ.get('V','cut,cdr,ldr').split(','):
            lk = None
            if '@' in job: job, lk = job.split('@')
            v, dt = (job.split('+') + ['0'])[:2]
            await pg.evaluate('window.__look = %s' % ('{y:%s,p:%s}' % tuple(lk.split('_')) if lk else 'null'))
            await pg.evaluate(f"window.__SB().seek({float(T)+float(dt)})")
            await pg.evaluate(f"document.querySelector('#sbxCabCtl button[data-cv={v}]').click()"); await pg.wait_for_timeout(int(os.environ.get('W','6000')))
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})()")
            await pg.screenshot(path=f'int_{v}_{dt}_{lk or ""}.png', clip=bb, full_page=True, timeout=300000); print('shot', job, await pg.evaluate("document.querySelector('#sbxBail').textContent"), errs[:3], flush=True)
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
