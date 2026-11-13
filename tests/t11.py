import asyncio, sys, json
from playwright.async_api import async_playwright
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1400
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': W, 'height': 1000 if W > 600 else 840}, device_scale_factor=1)
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.type + ' ' + m.text) if m.type in ('error','warning') else None)
        Q = int(__import__('os').environ.get('Q', '2'))
        await pg.add_init_script(f'window.__hkq = {Q}')
        await pg.goto('file://' + __import__('os').path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=120000)
        await pg.wait_for_timeout(6000)
        sw = await pg.evaluate('document.documentElement.scrollWidth')
        print('scrollWidth', sw)
        sb = 'window.__SB()'
        # pause and seek
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        shots = json.loads(sys.argv[2]) if len(sys.argv) > 2 else [['cmd', 6], ['cdr', 6], ['cdr', 14], ['top', 12], ['gun', 9]]
        for i, (mode, tt) in enumerate(shots):
            await pg.evaluate(f"document.querySelector('#sbxCams button[data-cam={mode}]').click()")
            await pg.evaluate(f"{sb}.seek({tt})")
            await pg.wait_for_timeout(4000)
            info = await pg.evaluate("({t: window.__SB().t, warn: !document.querySelector('#sbxWarn').hidden, subs: document.querySelector('#sbxSubs').innerText, crew: document.querySelector('#stCrewD').innerText})")
            print(mode, tt, info)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
            await pg.screenshot(path=f'shot11_{W}_{i}_{mode}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=120000)
        print('\n'.join(errs[:30]))
        await b.close()
asyncio.run(main())
