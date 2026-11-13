import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('VW','1200')), 'height': 900}, device_scale_factor=1)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = ' + os.environ.get('HQ','0'))
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        if os.environ.get('PRE'):
            await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='" + os.environ['PRE'] + "'; e.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(5000)
        if os.environ.get('PROT'): await pg.evaluate("document.querySelector('#sbxProt [data-p=%s]').click()" % os.environ['PROT']); await pg.wait_for_timeout(4000)
        print(await pg.evaluate("JSON.stringify((window.__SB().hits?window.__SB().hits():[]))")) if os.environ.get('PROT') else None
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=cdr]').click()")
        T = os.environ.get('T','4')
        if T.startswith('hit'):
            ht = await pg.evaluate("(()=>{const r=window.__SB().rec;let k=1e9;for(const th of r.threats){const e=th.viz.end;if(e.type==='hit')k=Math.min(k,e.t)}return k})()")
            print('hit at', ht, flush=True); T = str(ht + float(T[3:] or 0))
        await pg.evaluate(f"window.__SB().setSpeed(0.02); window.__SB().seek({T})")
        await pg.wait_for_timeout(8000)
        V = json.loads(os.environ.get('V','["cdr","ldr","cut"]'))
        for v in V:
            if isinstance(v, str) and ':' in v:
                v, lp = v.split(':'); await pg.evaluate(f"window.__look={{y:0,p:{lp}}}")
            elif isinstance(v, str): await pg.evaluate('window.__look=null')
            if isinstance(v, str): await pg.evaluate(f"window.__cabDbg=null; document.querySelector('#sbxCabCtl button[data-cv={v}]').click()"); name=v
            else: name=v[0]; await pg.evaluate(f"window.__cabDbg = {json.dumps(v[1])}")
            await pg.wait_for_timeout(3500)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
            await pg.screenshot(path=f'c2_{name}{os.environ.get("TAG","")}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=300000)
            print('shot', name, flush=True)
        print(errs[:6]); await b.close()
asyncio.run(main())
