import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath(os.environ.get('PAGE','test.html')), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        await pg.wait_for_timeout(6000)
        info = await pg.evaluate("""(()=>{const S=window.__SND; const o={}; try{o.keys=Object.keys(S||{}).slice(0,30)}catch(e){}; try{o.idx=S&&S.voiceIndex?Object.keys(S.voiceIndex.v||{}).length:null}catch(e){}; o.t=window.__SB().t; return o})()""")
        print(info)
        for pre in ['combined', 'platoon_wave', 'platoon_atgm', 'ambush']:
            await pg.evaluate(f"(()=>{{const e=document.querySelector('#sbxPreset'); e.value='{pre}'; e.dispatchEvent(new Event('change'))}})()"); await pg.wait_for_timeout(5000)
            await pg.evaluate("window.__SB().seek(1e4)"); await pg.wait_for_timeout(4000)
            print(pre, await pg.evaluate("document.querySelector('#sbxVerdict').textContent"), await pg.evaluate("!!document.querySelector('#sbxReview table')"))
        print('errors', errs[:8]); await b.close()
asyncio.run(main())
