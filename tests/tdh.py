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
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='fpv4'; e.dispatchEvent(new Event('change')); document.querySelector('#sbxProt [data-p=none]').click()})()"); await pg.wait_for_timeout(4000)
        r = json.loads(await pg.evaluate("JSON.stringify(window.__SB().rec.threats.map(q=>[q.idx,q.key,q.viz.end.type,+q.viz.end.t.toFixed(2)]))")); print(r, flush=True)
        hit = [q for q in r if q[2]=='hit'][0]; te = hit[3]
        await pg.evaluate("document.querySelector('#sbxPlay').click(); window.__SB().setSpeed(0.02)")
        async def shot(name):
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})()")
            await pg.add_style_tag(content='#sbxEnNoise{display:none!important}')
            await pg.screenshot(path=name, clip=bb, full_page=True, timeout=300000); print('shot', name, errs[:3], flush=True)
        for cam, dts in [('enemy', [-1.5, -0.4]), ('free', [-0.5, -0.1])]:
            await pg.evaluate(f"document.querySelector('#sbxCams button[data-cam={cam}]').click()")
            for dt in dts:
                await pg.evaluate(f"window.__SB().seek({te + dt})"); await pg.wait_for_timeout(3000)
                if cam == 'enemy': await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxEnSel'); e.value='{hit[0]}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(3500)
                await shot(f'dh_{cam}_{dt}.png')
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
