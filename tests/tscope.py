import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type=='error' and errs.append(m.text[:300]))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        pre = os.environ.get('PRE','saturation')
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='%s'; e.dispatchEvent(new Event('change'))})()" % pre); await pg.wait_for_timeout(5000)
        await pg.evaluate("(()=>{const b=document.querySelector('#sbxBrief button.primary'); if(b) b.click()})()"); await pg.wait_for_timeout(2500)
        print(await pg.evaluate("JSON.stringify(window.__SB().rec.threats.map(q=>[q.idx,q.key,Math.round(q.R),+q.t0.toFixed(1),q.cue==null?null:+q.cue.toFixed(1),q.cue_src,q.track==null?null:+q.track.toFixed(1),+q.viz.end.t.toFixed(1),q.viz.end.type]))"), flush=True)
        await pg.evaluate("window.__SB().setSpeed(0.02)")
        for T in os.environ.get('T','3,6,9').split(','):
            await pg.evaluate(f"window.__SB().seek({T})"); await pg.wait_for_timeout(4000)
            await pg.evaluate("document.querySelector('#scope').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(1500)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#scope').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})()")
            await pg.screenshot(path=f'scope_{pre}_{T}.png', clip=bb, full_page=True, timeout=300000); print('shot', T, bb['width'], errs[:3], flush=True)
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
