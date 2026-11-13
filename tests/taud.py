import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.add_init_script('window.__noBrief = 1; window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'), timeout=180000)
        await pg.wait_for_function('(()=>{try{return window.__SB && window.__SB().rec}catch(e){return false}})()', timeout=300000)
        await pg.evaluate("(()=>{const e=document.querySelector('#sbxPreset'); e.value='mixed'; e.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(3000)
        await pg.evaluate("(()=>{const b=document.querySelector('#sbxBrief button.primary'); if(b) b.click()})()"); await pg.wait_for_timeout(2000)
        await pg.evaluate("""(()=>{ window.__clips=[]; const S=AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start=function(at,off,dur){ try{ window.__clips.push(Math.round(this.buffer.duration)); }catch(e){} return S.apply(this,arguments); }; })()""")
        await pg.evaluate("document.querySelector('#sbxCams [data-cam=enemy]').click(); window.__SND().start(); window.__SB().seek(-1)")
        for i in range(int(os.environ.get('N','8'))):
            await pg.wait_for_timeout(10000)
            print(await pg.evaluate("JSON.stringify([window.__SB().t.toFixed(1), window.__SND().ruState, window.__clips.reduce((a,c)=>(a[c]=(a[c]||0)+1,a),{})])"), flush=True)
        print(errs[:6]); await b.close()
asyncio.run(main())
