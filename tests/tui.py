import asyncio, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 950}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        await pg.add_init_script('window.__hkq = 0'); await pg.goto('file://' + os.path.abspath('test.html')); await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=300000)
        ev = pg.evaluate
        await ev("(()=>{const e=document.querySelector('#sbxPreset'); e.value='combined'; e.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(2500)
        print('brief:', await ev("[!document.querySelector('#sbxBrief').hidden, document.querySelector('#sbxBrief h4').textContent, document.querySelector('#sbxBrief .cap').textContent]"))
        bb = await ev("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()"); await pg.screenshot(path='ui_brief.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500); print('brief closed:', await ev("document.querySelector('#sbxBrief').hidden"))
        await pg.keyboard.press('?'); await pg.wait_for_timeout(300); print('keys shown:', await ev("!document.querySelector('#sbxKeys').hidden")); await pg.keyboard.press('Escape'); print('keys hidden:', await ev("document.querySelector('#sbxKeys').hidden"))
        await ev("window.__SB().seek(9)"); await pg.wait_for_timeout(2500); print('pips:', await ev("Array.from(document.querySelectorAll('#fcList .fc-r:not([hidden])')).map(r=>Array.from(r.querySelectorAll('.fc-p i')).map(i=>i.className||'-').join(',')).join(' | ')"))
        await ev("window.__SB().seek(1e4)"); await pg.wait_for_timeout(3500); await ev("document.querySelector('#cmpBtn').click()"); await pg.wait_for_timeout(4000)
        print('compare:', await ev("Array.from(document.querySelectorAll('.rv-cmp tr')).map(r=>Array.from(r.children).map(c=>c.textContent+(c.classList.contains('diff')?'*':'')).join(' | ')).join('\\n')"))
        # undo
        n0 = await ev("document.querySelector('#misCount').textContent"); await ev("document.querySelector('#misClear').click()"); await pg.wait_for_timeout(1500); n1 = await ev("document.querySelector('#misCount').textContent"); await ev("document.querySelector('#misUndo').click()"); await pg.wait_for_timeout(1500); print('undo:', n0, '->', n1, '->', await ev("document.querySelector('#misCount').textContent"))
        # bookmark with note
        await ev("(()=>{const n=document.querySelector('#misNote'); n.value='seed 1: gunner misses first shot'; n.dispatchEvent(new Event('input')); document.querySelector('#misSave').click()})()"); await pg.wait_for_timeout(500)
        print('saved:', await ev("document.querySelector('#misMsg').textContent"), '|', await ev("Array.from(document.querySelector('#misLoad').options).map(o=>o.textContent).join(' ; ')"))
        # palette
        await ev("document.querySelector('#sbxCb').click()"); await pg.wait_for_timeout(2500); print('cb:', await ev("[document.documentElement.classList.contains('cbsafe'), getComputedStyle(document.documentElement).getPropertyValue('--good').trim(), document.querySelector('#fcList .fc-id') && document.querySelector('#fcList .fc-id').style.background]"))
        print('tips:', await ev("[document.querySelector('#misJit').title.slice(0,50), document.querySelector('#misPlatoon').title.slice(0,40)]"))
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
