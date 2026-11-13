import asyncio, os, json
from playwright.async_api import async_playwright
VIEWS = json.loads(os.environ.get('VIEWS', 'null')) or [
  ['pov', None],
  ['overview', {'p': [1.0, .6, 1.6], 'l': [-.6, -.6, -.5], 'fov': 80}],
  ['side', {'p': [1.2, -.3, -.4], 'l': [-.8, -.6, -.3], 'fov': 85}],
  ['loader', {'p': [-.2, -.1, .9], 'l': [-1.4, -.7, -.2], 'fov': 80}],
  ['front', {'p': [-.7, -.2, -1.0], 'l': [-.4, -.6, .8], 'fov': 90}],
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 900, 'height': 900}, device_scale_factor=1)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('window.__hkq = 0')
        await pg.goto('file://' + os.path.abspath('test.html'))
        await pg.wait_for_function('window.__SB && window.__SB().rec', timeout=120000)
        await pg.evaluate("document.querySelector('#sbxPlay').click()")
        await pg.evaluate("document.querySelector('#sbxCams button[data-cam=cdr]').click()")
        await pg.evaluate(f"window.__SB().seek({os.environ.get('T','4')})")
        await pg.wait_for_timeout(5000)
        for name, v in VIEWS:
            await pg.evaluate(f"window.__cabDbg = {json.dumps(v)}")
            await pg.wait_for_timeout(3000)
            bb = await pg.evaluate("(()=>{const r=document.querySelector('#sbxView').getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})()")
            await pg.screenshot(path=f'cab_{name}.png', clip=dict(x=bb[0], y=bb[1], width=bb[2], height=bb[3]), full_page=True, timeout=120000)
            print('shot', name)
        print(errs[:5]); await b.close()
asyncio.run(main())
