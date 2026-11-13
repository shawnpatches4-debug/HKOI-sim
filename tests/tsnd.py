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
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='saturation'; e.dispatchEvent(new Event('change')); document.querySelector('#sbxProt [data-p=none]').click()})()"); await pg.wait_for_timeout(3000)
        # count scheduled voice clips and overlaps by wrapping AudioBufferSourceNode.start
        await pg.evaluate("""(()=>{ window.__clips=[]; const S=AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start=function(at,off,dur){ try{ const b=this.buffer; if(b&&b.duration>20&&dur) window.__clips.push([+(at||0).toFixed(2), +dur.toFixed(2), Math.round(b.duration)]); }catch(e){} return S.apply(this,arguments); }; })()""")
        await pg.evaluate("document.querySelector('#sbxSnd') && window.__SND().start && window.__SND().start(); window.__SB().seek(-1)")
        await pg.wait_for_timeout(int(os.environ.get('MS', '70000')))
        clips = await pg.evaluate("window.__clips"); ready = await pg.evaluate("window.__SND().ready"); t = await pg.evaluate("window.__SB().t")
        v = sorted([c for c in clips]); ov = sum(1 for i in range(1, len(v)) if v[i][0] < v[i-1][0] + v[i-1][1]/1.1 - 0.02 and v[i][2] != 54 and v[i-1][2] != 54)
        hp = await pg.evaluate('window.__SND().hasPack'); print('pack loaded', hp, 'mod clips', sum(1 for c in v if c[2] in (193,194)), 'panic-set clips', sum(1 for c in v if c[2]==99));
        print('audio ready', ready, 'sim t', round(t, 1), 'voice/scream clips', len(v), 'overlapping pairs', ov); print(v[:40]); print(errs[:6]); await b.close()
asyncio.run(main())
