# real frame loop with the enemy views on, through volleys and team moves; reports frame errors
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 640, 'height': 360}); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'] + '#gfx=min&spectator=1&speed=4&force=heavy', timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        await pg.evaluate('document.getElementById("go").click()'); await pg.wait_for_timeout(1000)
        for k, mode in enumerate(['enemy', 'troops', 'enemy', 'troops', 'enemy', 'troops']):
            await pg.evaluate(f"__beta.cams.set('{mode}')")
            for j in range(3):
                await pg.wait_for_timeout(4000); await pg.keyboard.press(']')
                print(mode, await pg.evaluate('JSON.stringify({t: +__beta.battle.t.toFixed(1), v: __beta.battle.volleys.length, unit: __beta.cams.unit && __beta.cams.unit.spec.key + ":" + __beta.cams.unit.state, err: !document.getElementById("errbar").hidden && document.getElementById("errbar").textContent.slice(0, 300), menu: document.querySelectorAll("#units-list button").length, sight: !document.getElementById("esight").hidden})'))
            if k == 2: await pg.screenshot(path=sys.argv[1], timeout=120000)
        print('errors', errs[:6]); await b.close()
asyncio.run(main())
