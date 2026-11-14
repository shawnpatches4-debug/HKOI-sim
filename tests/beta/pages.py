# python3 tests/beta/pages.py : the ladder, the debrief and the run-the-numbers screens, driven the way a player would.
# Needs the restricted test server (BASE). Prints PASS or what went wrong.
import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1100, 'height': 700}); errs = []; bad = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#gfx=min&speed=4', timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        await pg.evaluate('document.getElementById("o-ladder").click()'); await pg.wait_for_timeout(600)
        n = await pg.evaluate('document.querySelectorAll("#ladder .pg-rung").length'); print('ladder rungs shown', n)
        if n != 10: bad.append('ladder does not list ten rungs')
        await pg.screenshot(path=os.environ.get('SHOT', '/tmp/pages') + '_ladder.png')
        await pg.evaluate('document.querySelectorAll("#ladder .pg-rung button")[1].click()'); await pg.wait_for_timeout(1500)
        st = await pg.evaluate('JSON.stringify({state: __beta.state(), units: __beta.battle.units.length, raid: !!__beta.battle.raid, skill: __beta.battle.skill})'); print('rung 2 started', st)
        await pg.evaluate('__beta.runTo(1800)')
        for i in range(90):
            if await pg.evaluate('__beta.state() === "result"'): break
            await pg.wait_for_timeout(1000)
        d = json.loads(await pg.evaluate('JSON.stringify({state: __beta.state(), score: (document.querySelector("#r-debrief .pg-score b") || {}).textContent, saved: (document.querySelector("#r-debrief .pg-saved") || {}).textContent, rows: document.querySelectorAll("#r-debrief .pg-scroll tr").length, best: localStorage.getItem("hkoi.ladder")})'))
        print('debrief', d)
        if d['state'] != 'result' or d['score'] is None or not d['saved'] or d['rows'] < 2 or not d['best']: bad.append('debrief did not appear with a score, the HKOI line, the story and a saved best score')
        await pg.screenshot(path=os.environ.get('SHOT', '/tmp/pages') + '_debrief.png')
        await pg.evaluate('document.getElementById("r-menu").click()'); await pg.wait_for_timeout(600)
        await pg.evaluate('document.getElementById("o-numbers").click()'); await pg.wait_for_timeout(600)
        await pg.evaluate('[...document.querySelectorAll("#numbers .seg button")][0].click()'); await pg.evaluate('[...document.querySelectorAll("#numbers .row button")].find(x => x.textContent === "Run").click()')
        for i in range(400):
            if await pg.evaluate('!!document.querySelector("#numbers .pg-take")'): break
            await pg.wait_for_timeout(1500)
        r = json.loads(await pg.evaluate('JSON.stringify({take: (document.querySelector("#numbers .pg-take") || {}).textContent, tables: document.querySelectorAll("#numbers .pg-tbl").length, status: document.querySelector("#numbers .pg-note").textContent})'))
        print('numbers', r)
        if not r['take'] or r['tables'] < 4: bad.append('run the numbers did not finish with its tables')
        await pg.screenshot(path=os.environ.get('SHOT', '/tmp/pages') + '_numbers.png', full_page=False)
        print('console errors', errs[:5]); print('PAGES CHECK ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
