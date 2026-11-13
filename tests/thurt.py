import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='saturation'; e.dispatchEvent(new Event('change')); document.querySelector('#sbxProt [data-p=aps]').click()})()"); await pg.wait_for_timeout(3000)
        found = 0
        for k in range(40):
            await pg.evaluate("document.querySelector('#sbxDice').click()"); await pg.wait_for_timeout(2500)
            r = await pg.evaluate("""(()=>{const S=window.__SB().rec; const hurt=(S.radio||[]).filter(q=>q.cue); return {killed:S.killed,hits:S.hits,dmg:S.dmg,cue:hurt.map(q=>q.who+': '+q.text), tail:(S.radio||[]).slice(-6).map(q=>q.who+': '+q.text), down:S.threats.filter(t=>t.tags.includes('hkoi_down')||t.tags.includes('radar_down')).length}})()""")
            if r['cue'] and not r['killed']:
                found += 1; print(r)
                if found >= 2: break
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
