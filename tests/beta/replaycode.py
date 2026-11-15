# python3 tests/beta/replaycode.py <code> [<code> ...]: load each replay code through the setup box, as a player does, and report
# how the battle the page plays ends (length, hits, crew), to compare with what node found for the same settings.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 960, 'height': 540}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto(os.environ['BASE'] + '#gfx=min', timeout=120000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=300000)
        for code in sys.argv[1:]:
            await pg.evaluate("void document.querySelector('#o-setup').click()"); await pg.wait_for_timeout(500)
            await pg.evaluate("(c) => { document.getElementById('o-code').value = c; document.getElementById('o-codebtn').click(); }", code)
            await pg.wait_for_timeout(4000)
            await pg.evaluate("void __beta.runTo(950)")   # the replay starts at the beginning: play it to its end, unseen
            r = await pg.evaluate("JSON.stringify((() => { const B = __beta.battle, s = B.summary(), cs = B.crewState ? B.crewState() : null; return { t: s.t, alive: s.alive, fired: s.fired, hits: s.hits, by: s.by, kt: s.killedByTank, kmg: s.killedByMg, over: B.over && B.over.result, who: cs ? Object.fromEntries(Object.entries(cs.who).map(([k, v]) => [k, v.status])) : null, note: document.getElementById('o-note').textContent }; })())")
            print(code[:24], r)
        print('errors', errs[:4]); await b.close()
asyncio.run(main())
