import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type=='error' and errs.append(m.text[:300]))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = ' + os.environ.get('HQ','1'))
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='saturation'; e.dispatchEvent(new Event('change')); document.querySelector('#sbxProt [data-p=none]').click()})()"); await pg.wait_for_timeout(3000)
        want = os.environ.get('WANT','alive'); r = None
        for k in range(45):
            await pg.evaluate("document.querySelector('#sbxDice').click()"); await pg.wait_for_timeout(1800)
            r = await pg.evaluate("(()=>{const S=window.__SB(), R=S.rec, H=S.hits(), c=S.crewAt(1e9); return {killed:!!R.killed, c, hits:H.map(h=>[+h.t.toFixed(1),h.crew])}})()")
            v = list(r['c'].values()); ok = ('killed' in v and 'wounded' in v and 'ok' in v) and (r['killed'] if want=='bail' else (not r['killed'] and r['c']['cdr']!='killed')) if want!='pov' else (r['c']['cdr']=='killed' and not r['killed'])
            print(k, r['killed'], r['c'], flush=True)
            if ok: break
        print(k, json.dumps(r), flush=True)
        t0 = [h[0] for h in r['hits'] if h[1] and any(x!='ok' for x in h[1].values())]; T = (t0[-1] if t0 else 5) + float(os.environ.get('DT','2'))
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        for cam in os.environ.get('CAMS','cdr').split(','):
            cv = None
            if ':' in cam: cam, cv = cam.split(':')
            await pg.evaluate(f"document.querySelector('#sbxCams button[data-cam={cam}]').click()")
            if cv: await pg.evaluate(f"document.querySelector('#sbxCabCtl button[data-cv={cv}]').click()")
            await pg.evaluate(f"window.__SB().setSpeed(0.02); window.__SB().seek({T})"); await pg.wait_for_timeout(int(os.environ.get('W','7000')))
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})()")
            await pg.screenshot(path=f'cas_{want}_{cam}{cv or ""}.png', clip=bb, full_page=True, timeout=300000); print('shot', cam, cv, errs[:3], flush=True)
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
