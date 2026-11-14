# python3 tests/beta/cdrfpv_look.py : a short look (six pictures, a few minutes) at the two new things in the real page:
# the first-person drone camera at good link, weak link and after the end of the flight, and the map: normal, commander view
# (made-up commander from tests/beta/fake_commander.js), and one order picked from the list. Needs the restricted test server (BASE).
# SHOT = picture prefix. The thorough checks are tests/app/cdrview.test.mjs (node), tests/beta/cdrview.py and tests/beta/fpvfeed.py.
import asyncio, os, json, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720}); errs = []; shot = os.environ.get('SHOT', '/tmp/look'); settle = int(os.environ.get('SETTLE', '5000'))
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#' + (sys.argv[1] if len(sys.argv) > 1 else 'gfx=low&speed=1&spectator=1&force=drones&play=1'), timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready && window.__beta.battle)'): break
            await pg.wait_for_timeout(1500)
        ev = lambda s: pg.evaluate(s)
        js = lambda s: pg.evaluate('JSON.stringify(' + s + ')')
        osd = '''(() => { const q = s => ((document.querySelector('#fpv ' + s) || {}).textContent || '').replace(/\\n/g, ' ; '), f = document.getElementById('fpv');
          return { t: +__beta.battle.t.toFixed(1), mode: __beta.cams.mode, shown: f ? !f.hidden : false, cls: f ? f.className : '', tl: q('.tl'), tr: q('.tr'), bl: q('.bl'), br: q('.br'), bc: q('.bc'), warn: q('.warn'), cap: q('.cap'), snow: f ? +getComputedStyle(document.getElementById('fpv-snow')).opacity : null, filter: document.getElementById('view').style.filter, fov: __beta.scene.camera.fov }; })()'''
        await ev('void (__beta.setPlaying(false))')
        # step the battle, unseen, until a radio drone is on its way
        want = os.environ.get('DRONE', 'fpv')
        L = json.loads(await js('''(() => { const B = __beta.battle; let n = 0; const f = () => B.events && B.events.find(e => e.type === 'drone_launch' && B.units.find(u => u.id === e.uid).spec.key === '%s'); while (!f() && B.tank.alive && n++ < 6000) B.step(); __beta.runTo(B.t); return f() || null; })()''' % want))
        print('first %s drone launch' % want, L)
        if L:
            await ev('void (__beta.cams.enemyId = %d, __beta.setView("fpv"), __beta.runTo(%f))' % (L['uid'], L['t'] + 8)); await pg.wait_for_timeout(settle)
            print('good link ', json.loads(await js(osd))); await pg.screenshot(path=shot + '_fpv_good.png')
            E = json.loads(await js('''(() => { const B = __beta.battle; let n = 0; const f = () => B.events.filter(e => e.type === 'end' && e.uid === %d && e.t >= %f).sort((a, b) => a.t - b.t)[0]; while (!f() && B.tank.alive && n++ < 6000) B.step(); __beta.runTo(B.t); return f() || null; })()''' % (L['uid'], L['t'])))
            print('its flight ends', E)
            if E:
                await ev('void (__beta.runTo(%f))' % (E['t'] - 1.2)); await pg.wait_for_timeout(settle)
                print('weak link ', json.loads(await js(osd))); await pg.screenshot(path=shot + '_fpv_weak.png')
                await ev('void (__beta.runTo(%f))' % (E['t'] + 0.5)); await pg.wait_for_timeout(settle)
                print('after end ', json.loads(await js(osd))); await pg.screenshot(path=shot + '_fpv_lost.png')
            await ev('void (__beta.setView("orbit"))')
        if os.environ.get('MAP', '1') == '1':
            await ev('localStorage.removeItem("hkoi.cdrview")'); await ev('void (__beta.mapv.cdr.setOn(false), __beta.openMap())'); await pg.wait_for_timeout(2500); await pg.screenshot(path=shot + '_map_normal.png')
            await ev(open(os.path.join(HERE, 'fake_commander.js')).read())
            await ev('void (__beta.battle.commander = window.__fakeCommander, __beta.battle.vehicles = window.__fakeVehicles)')
            await ev('document.getElementById("map-cdr").click()'); await pg.wait_for_timeout(2500); await pg.screenshot(path=shot + '_map_cdr.png')
            m = json.loads(await js('{rows: document.querySelectorAll("#cdr-rows .cdr-row").length, head: document.querySelector("#cdr-list .cdr-head").textContent, labels: __beta.mapv.cdr.state().labels.length}')); print('commander view', m)
            await ev('[...document.querySelectorAll("#cdr-rows .cdr-row")].find(r => /north ridge/.test(r.textContent)).click()'); await pg.wait_for_timeout(2000); await pg.screenshot(path=shot + '_map_picked.png')
        print('console errors', errs[:5]); print('LOOK ' + ('DONE, no errors' if not errs else 'DONE WITH ERRORS')); await b.close()
asyncio.run(main())
