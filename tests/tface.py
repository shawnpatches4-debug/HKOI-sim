import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900}, device_scale_factor=2)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type=='error' and errs.append(m.text[:300]))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='saturation'; e.dispatchEvent(new Event('change')); document.querySelector('#sbxProt [data-p=%s]').click()})()" % os.environ.get('PROT','none')); await pg.wait_for_timeout(4000)
        await pg.evaluate("window.__SB().setSpeed(0.02)")
        await pg.evaluate("window.__fcH = %s" % os.environ.get('FORCE','null'))
        for T in os.environ.get('T','1,8,12,17').split(','):
            await pg.evaluate(f"window.__SB().seek({T})"); await pg.wait_for_timeout(5000)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxFaces').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})()")
            await pg.screenshot(path=f'face_{T}.png', clip=bb, full_page=True, timeout=300000); print('shot', T, await pg.evaluate("JSON.stringify(window.__SB().crewAt(window.__SB().t))"), errs[:3], flush=True)
        bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})()")
        await pg.screenshot(path='face_view.png', clip=bb, full_page=True, timeout=300000)
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
