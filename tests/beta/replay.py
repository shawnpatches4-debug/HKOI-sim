# python3 tests/beta/replay.py : plays a battle to its result, opens the replay, scrubs, steps between events, and reloads it from a replay code.
# Needs the restricted test server (BASE). Prints PASS or what went wrong.
import asyncio, os, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 640, 'height': 400}); errs = []; bad = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#gfx=min&speed=4', timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        await pg.evaluate('document.getElementById("go").click()'); await pg.wait_for_timeout(800)
        await pg.evaluate('__beta.runTo(900)')                       # fight it out without drawing
        for i in range(60):
            if await pg.evaluate('__beta.state() === "result"'): break
            await pg.wait_for_timeout(1000)
        st = await pg.evaluate('__beta.state()'); T0 = await pg.evaluate('__beta.battle.t'); sig0 = await pg.evaluate('JSON.stringify(__beta.battle.summary())')
        print('battle ended: state', st, 't', round(T0, 1))
        if st != 'result': bad.append('battle did not reach the result screen')
        await pg.evaluate('document.getElementById("r-replay").click()'); await pg.wait_for_timeout(2500)
        info = json.loads(await pg.evaluate('JSON.stringify({state: __beta.state(), bar: !document.getElementById("replay").hidden, t: __beta.battle.t, ticks: document.querySelectorAll("#rp-ticks i").length, time: document.getElementById("rp-time").textContent})'))
        print('replay opened', info)
        if info['state'] != 'play' or not info['bar'] or info['t'] > 30 or info['ticks'] < 1: bad.append('replay did not start from the beginning with its bar and event marks')
        await pg.evaluate('(() => { const r = document.getElementById("rp-bar"); r.value = 600; r.dispatchEvent(new Event("input")); })()'); await pg.wait_for_timeout(1500)
        t1 = await pg.evaluate('__beta.battle.t'); print('scrubbed to 60%: t', round(t1, 1), 'of', round(T0 + 4, 1))
        if abs(t1 - 0.6 * (T0 + 4)) > 12: bad.append('scrubbing forward did not land near 60%')
        await pg.evaluate('(() => { const r = document.getElementById("rp-bar"); r.value = 200; r.dispatchEvent(new Event("input")); })()'); await pg.wait_for_timeout(1500)
        t2 = await pg.evaluate('__beta.battle.t'); print('scrubbed back to 20%: t', round(t2, 1))
        if abs(t2 - 0.2 * (T0 + 4)) > 12: bad.append('scrubbing backward did not land near 20%')
        await pg.evaluate('document.getElementById("rp-next").click()'); await pg.wait_for_timeout(1200); t3 = await pg.evaluate('__beta.battle.t')
        await pg.evaluate('document.getElementById("rp-prev").click()'); await pg.wait_for_timeout(1200); t4 = await pg.evaluate('__beta.battle.t'); print('next event: t', round(t3, 1), '| previous event: t', round(t4, 1))
        if not t3 > t2 or not t4 < t3: bad.append('event steps did not move the time as expected')
        await pg.evaluate('(() => { const r = document.getElementById("rp-bar"); r.value = 1000; r.dispatchEvent(new Event("input")); })()'); await pg.wait_for_timeout(1500)
        sig1 = await pg.evaluate('JSON.stringify(__beta.battle.summary())'); same = json.loads(sig0); again = json.loads(sig1); same.pop('t', None); again.pop('t', None)
        print('replayed to the end: same outcome as the battle', same == again)
        if same != again: bad.append('the replay did not reproduce the battle: ' + sig0[:160] + ' vs ' + sig1[:160])
        await pg.wait_for_timeout(4000)                               # let the real frame loop run in replay
        await pg.evaluate('document.getElementById("rp-result").click()'); await pg.wait_for_timeout(600)
        await pg.evaluate('document.getElementById("r-code").click()'); code = await pg.evaluate('document.getElementById("r-codebox").value'); print('replay code', code[:50] + '...', len(code), 'characters')
        await pg.evaluate('document.getElementById("r-menu").click()'); await pg.wait_for_timeout(600)
        await pg.evaluate('(() => { document.getElementById("o-code").value = %s; document.getElementById("o-codebtn").click(); })()' % json.dumps(code)); await pg.wait_for_timeout(4000)
        info2 = json.loads(await pg.evaluate('JSON.stringify({state: __beta.state(), bar: !document.getElementById("replay").hidden, time: document.getElementById("rp-time").textContent, err: !document.getElementById("errbar").hidden && document.getElementById("errbar").textContent.slice(0, 200)})'))
        print('loaded from the code', info2)
        if info2['state'] != 'play' or not info2['bar'] or info2['err']: bad.append('loading a replay code did not open the replay')
        await pg.evaluate('(() => { const r = document.getElementById("rp-bar"); r.value = 1000; r.dispatchEvent(new Event("input")); })()'); await pg.wait_for_timeout(1500)
        sig2 = json.loads(await pg.evaluate('JSON.stringify(__beta.battle.summary())')); sig2.pop('t', None); print('from the code, replayed to the end: same outcome', sig2 == same)
        if sig2 != same: bad.append('the battle from the replay code ended differently')
        print('console errors', errs[:5]); print('REPLAY CHECK ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
