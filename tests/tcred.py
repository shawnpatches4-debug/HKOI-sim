import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1300, 'height': 1000}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        await pg.add_init_script('window.__hkq = 0'); await pg.goto('file://' + os.path.abspath('test.html')); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.querySelector('#runBtn').click()"); await pg.wait_for_function("window.__L() && !document.querySelector('#runBtn').disabled", timeout=600000)
        print('verify:', await pg.evaluate("document.querySelector('#verifyStatus').textContent"), '|', await pg.evaluate("Array.from(document.querySelectorAll('#verifyList li')).map(l=>l.textContent.slice(0,60)).join(' ; ')"))
        print('repro:', (await pg.evaluate("document.querySelector('#reproText').value"))[:500])
        print('rows:', await pg.evaluate("document.querySelectorAll('#asTable tr').length"), await pg.evaluate("document.querySelector('#asTable tr:nth-child(2)').textContent.slice(0,160)"))
        # measured data
        await pg.evaluate("document.querySelector('#measText').value='parameter,value,source\\ncloud_blocking_m2_per_g,1.4,\"chamber test A\"\\nlwr_half_range_km,3,\"range test B\"\\nbogus_thing,3,x'; document.querySelector('#measApply').click()")
        print('meas err:', await pg.evaluate("document.querySelector('#measStatus').textContent"))
        await pg.evaluate("document.querySelector('#measText').value='parameter,value,source\\ncloud_blocking_m2_per_g,1.4,\"chamber test A\"\\nlwr_half_range_km,3,\"range test B\"'; document.querySelector('#measApply').click()")
        print('meas ok:', await pg.evaluate("document.querySelector('#measStatus').textContent"))
        await pg.evaluate("document.querySelector('#runBtn').click()"); await pg.wait_for_function("!document.querySelector('#runBtn').disabled", timeout=600000); await pg.wait_for_timeout(500)
        print('cfg alpha/lwr:', await pg.evaluate("[window.__L().cfg.obs.alpha_m2_per_g, window.__L().cfg.lwr.beam_rider_range_km_half, !document.querySelector('#measBadge').hidden]"))
        print('meas row:', await pg.evaluate("Array.from(document.querySelectorAll('#asTable tr')).filter(r=>r.textContent.includes('Measured')).map(r=>r.textContent.slice(0,200)).join(' || ')"))
        await pg.evaluate("document.querySelector('#measClear').click()")
        if os.environ.get('STRESS'):
            await pg.evaluate("document.querySelector('#runBtn').click()"); await pg.wait_for_function("!document.querySelector('#runBtn').disabled", timeout=600000)
            await pg.evaluate("document.querySelector('#stressBtn').click()"); await pg.wait_for_function("!document.querySelector('#stressBtn').disabled && document.querySelectorAll('#stressTable tr').length > 10", timeout=1500000)
            print('stress:', await pg.evaluate("Array.from(document.querySelectorAll('#stressTable tr')).map(r=>Array.from(r.children).slice(0,3).map(c=>c.textContent).join(' | ')).join('\\n')"), await pg.evaluate("document.querySelector('#stressNote').textContent"))
            await pg.evaluate("document.querySelector('[data-tab=assume]') && document.querySelector('[data-tab=assume]').click()"); await pg.wait_for_timeout(800); await pg.screenshot(path='cred.png', full_page=True)
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
