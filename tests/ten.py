import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.add_init_script('window.__hkq = %s' % os.environ.get('HQ','1'))
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        pre = os.environ.get('PRE', 'fpv4')
        await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(3000)
        await pg.evaluate("(()=>{const b=document.querySelector('#sbxBrief button.primary'); if(b) b.click()})()"); await pg.wait_for_timeout(3000)
        sk = os.environ.get('SK')
        if sk: await pg.evaluate(f"(()=>{{const e=document.querySelector('#misDskill'); e.value='{sk}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(4000)
        print(await pg.evaluate("(()=>{const S=window.__SB(); return JSON.stringify({tend:S.rec.t_end, th:S.rec.threats.map(q=>[q.idx,q.key,Math.round(q.R),q.t0.toFixed(1),q.viz.end.t.toFixed(1),q.viz.end.type,(q.viz.feints||[]).map(x=>x.toFixed(1))])})})()"), flush=True)
        await pg.evaluate("window.__SB().setSpeed(0.02)")
        await pg.evaluate("document.querySelector('#sbxCams [data-cam=%s]').click()" % os.environ.get('CAM','enemy'))
        for job in os.environ.get('J', '0:3').split(','):
            u, tt = job.split(':')
            await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxEnSel'); if(!e.options.length) return; e.value='{u}'; e.dispatchEvent(new Event('change'))}})()")
            await pg.evaluate(f"window.__SB().seek({tt})"); await pg.wait_for_timeout(int(os.environ.get('W','5000')))
            await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxEnSel'); e.value='{u}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(int(os.environ.get('W','5000')))
            await pg.add_style_tag(content='#sbxEnNoise{display:none!important}') if os.environ.get('NN') else None; bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}})()"); print('errs', errs[:3], flush=True); await pg.screenshot(path=f'en_{pre}_{u}_{tt}.png', timeout=200000, clip=bb)
            print(job, os.environ.get('CAM','enemy')!='enemy' or await pg.evaluate("(()=>{const q=s=>document.querySelector(s); return [q('#sbxEnemy').hidden, q('.en-tl').textContent, q('.en-br').textContent, q('.en-c').textContent, q('#sbxView').className]})()"), flush=True)
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
