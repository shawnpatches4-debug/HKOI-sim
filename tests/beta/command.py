# python3 tests/beta/command.py <out folder> : the player commands the tank, in the real page.
# Chooses "You" under "Who commands" in the setup, starts a battle, gives orders through the screen (right-click menu on the
# ground, the order bar, keys, the map), lets the real frame loop run, fights the battle out, and checks that the replay and a
# replay code fight the same battle again with the same orders. Takes pictures on the way. Needs the restricted test server (BASE).
import asyncio, os, sys, json
from playwright.async_api import async_playwright
async def main():
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; os.makedirs(out, exist_ok=True); W = int(os.environ.get('W', '960')); H = int(os.environ.get('H', '540'))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': W, 'height': H}); errs = []; bad = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#' + os.environ.get('PARAMS', 'gfx=low&demo=0&faces=0&seed=5&map=3&biome=farmland&force=ambush&waves=1'), timeout=120000)
        for i in range(160):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        ev = pg.evaluate; shot = lambda name: pg.screenshot(path=os.path.join(out, name), timeout=120000)
        async def errbar(): return await ev('(() => { const e = document.getElementById("errbar"); return e && !e.hidden ? e.textContent.slice(0, 200) : ""; })()')
        # the setup choice
        await ev('void document.getElementById("o-setup").click()'); await pg.wait_for_timeout(600)
        n = await ev('document.querySelectorAll("#o-command .btn").length'); print('setup: "Who commands" has', n, 'choices')
        if n != 2: bad.append('the setup has no "Who commands" choice')
        await ev('void [...document.querySelectorAll("#o-command .btn")].find(x => /You/.test(x.textContent)).click()'); await pg.wait_for_timeout(1500); await shot('cmd_setup.png')
        await ev('void document.getElementById("s-play").click()'); await pg.wait_for_timeout(1500); await ev('void __beta.setPlaying(false)'); await pg.wait_for_timeout(2500)
        st = json.loads(await ev('JSON.stringify({ state: __beta.state(), cmd: !!__beta.battle.cmd, bar: !document.getElementById("cmd").hidden, buttons: document.querySelectorAll("#cmd .c-row .btn").length, say: document.querySelector("#cmd .c-say").textContent })'))
        print('battle started', st)
        if not st['cmd'] or not st['bar'] or st['buttons'] < 8: bad.append('the order bar is not up in a commanded battle')
        await shot('cmd_bar.png')
        # find a spot on the screen whose ground is 120 to 400 m from the vehicle, right-click it: the menu and the ghost of the route
        spot = json.loads(await ev('JSON.stringify((() => { const T = __beta.battle.tank; let best = null; for (let y = 0.2; y < 0.62; y += 0.03) for (let x = 0.3; x < 0.7; x += 0.04) { const g = __beta.cmd.ground(innerWidth * x, innerHeight * y); if (!g) continue; const d = Math.hypot(g[0] - T.e, g[1] - T.n); if (d > 120 && d < 400 && __beta.battle.orderRoute(Math.round(g[0]), Math.round(g[1])).ok && (!best || d < best.d)) best = { x: innerWidth * x, y: innerHeight * y, d }; } return best; })())'))
        print('spot to point at', spot)
        if not spot: bad.append('no ground 120 to 400 m away found on screen'); spot = {'x': W * 0.6, 'y': H * 0.4}
        await pg.mouse.click(spot['x'], spot['y'], button='right'); await pg.wait_for_timeout(2500)
        menu = json.loads(await ev('JSON.stringify({ open: !document.getElementById("cmdmenu").hidden, items: [...document.querySelectorAll("#cmdmenu .btn")].map(x => x.textContent) })')); print('right-click menu', menu)
        if not menu['open'] or not any('Move here' in t for t in menu['items']): bad.append('right-click on the ground gave no menu with "Move here"')
        await shot('cmd_menu.png')
        await ev('void [...document.querySelectorAll("#cmdmenu .btn")].find(x => /Move here/.test(x.textContent)).click()'); await pg.wait_for_timeout(600)
        o1 = json.loads(await ev('JSON.stringify({ log: __beta.battle.cmd.log, pending: __beta.battle.orderState().pending.length, t: __beta.battle.t })')); print('order given while paused', o1)
        if len(o1['log']) != 1 or o1['log'][0]['k'] != 'move' or o1['pending'] != 1: bad.append('the move order was not taken while paused')
        await ev('void __beta.playFor(3.4)'); await pg.wait_for_timeout(2500)
        mv = json.loads(await ev('JSON.stringify({ t: __beta.battle.t, goal: __beta.battle.tank.goal, v: __beta.battle.tank.v, intent: __beta.battle.tank.intent, ghost: __beta.cmd.gh.visible, ribbon: __beta.cmd.ribbon.visible, volleys: __beta.battle.volleys.length })')); print('after the order reached the driver', mv)
        if not mv['goal'] and not mv['volleys']: bad.append('the vehicle did not set off')
        if not mv['ghost'] or (mv['goal'] and not mv['ribbon']): bad.append('no ghost marker and path on the ground for the move')
        await shot('cmd_move.png')
        # the map: the order and its route, then a click on the map for a menu there
        await pg.keyboard.press('m'); await pg.wait_for_timeout(2500); await shot('cmd_map.png')
        await pg.mouse.click(W * 0.56, H * 0.36); await pg.wait_for_timeout(1500)
        menu2 = json.loads(await ev('JSON.stringify({ open: !document.getElementById("cmdmenu").hidden, items: [...document.querySelectorAll("#cmdmenu .btn, #cmdmenu small")].map(x => x.textContent) })')); print('map click menu', menu2)
        if not menu2['open']: bad.append('a click on the map gave no order menu')
        await shot('cmd_map_menu.png')
        await ev('void [...document.querySelectorAll("#cmdmenu .btn")].find(x => /Cancel/.test(x.textContent)).click()'); await pg.keyboard.press('m'); await pg.wait_for_timeout(500)
        # keys: C (main gun hold), K (HKOI mode), O (the panel)
        for k in ['c', 'k', 'o']: await pg.keyboard.press(k); await pg.wait_for_timeout(300)
        await ev('void __beta.playFor(3)'); await pg.wait_for_timeout(1500)
        ks = json.loads(await ev('JSON.stringify({ main: __beta.battle.cmd.main, hkoi: __beta.battle.cmd.hkoi, more: !document.querySelector("#cmd .c-more").hidden, n: __beta.battle.cmd.log.length })')); print('after keys C, K, O', ks)
        if ks['main'] != 'hold' or ks['hkoi'] != 'obs' or not ks['more']: bad.append('the keys did not give their orders')
        await shot('cmd_more.png')
        await pg.keyboard.press('c'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # the real frame loop with the order bar and the ghost up
        await ev('void __beta.setPlaying(true)'); await pg.wait_for_timeout(9000); e1 = await errbar(); print('frame loop ran', round(await ev('__beta.battle.t'), 1), 's of battle; red bar:', e1 or 'none')
        if e1: bad.append('the frame loop reported a fault: ' + e1)
        await pg.keyboard.press('p'); await pg.wait_for_timeout(1200); await shot('cmd_play.png')
        # fight it out, then the result with the mark for decisions
        await ev('void __beta.runTo(900)')
        for i in range(90):
            if await ev('__beta.state() === "result"'): break
            await pg.wait_for_timeout(1000)
        res = json.loads(await ev('JSON.stringify({ state: __beta.state(), t: __beta.battle.t, sum: __beta.battle.summary(), orders: __beta.battle.cmd.log, mark: (document.getElementById("r-cmd") || {}).textContent || "", markHidden: !document.getElementById("r-cmd") || document.getElementById("r-cmd").hidden })'))
        print('battle ended: state', res['state'], 't', round(res['t'], 1), 'orders', len(res['orders']), '| mark:', res['mark'][:160])
        if res['state'] != 'result': bad.append('the battle did not reach the result screen')
        if res['markHidden'] or 'YOUR COMMAND' not in res['mark']: bad.append('the result shows no mark for the player\'s decisions')
        await shot('cmd_result.png')
        same = dict(res['sum']); same.pop('t', None)
        # replay: the same battle with the same orders
        await ev('void document.getElementById("r-replay").click()'); await pg.wait_for_timeout(2500)
        await ev('(() => { const r = document.getElementById("rp-bar"); r.value = 1000; r.dispatchEvent(new Event("input")); })()'); await pg.wait_for_timeout(2000)
        rp = json.loads(await ev('JSON.stringify({ sum: __beta.battle.summary(), orders: __beta.battle.cmd ? __beta.battle.cmd.log : null, bar: !document.getElementById("cmd").hidden })')); a = dict(rp['sum']); a.pop('t', None)
        print('replayed to the end: same outcome', a == same, '| same orders', rp['orders'] == res['orders'], '| order bar hidden in the replay', not rp['bar'])
        if a != same or rp['orders'] != res['orders']: bad.append('the replay did not fight the same battle with the same orders')
        if rp['bar']: bad.append('the order bar shows during a replay')
        await pg.wait_for_timeout(3000); await ev('void document.getElementById("rp-result").click()'); await pg.wait_for_timeout(600)
        await ev('void document.getElementById("r-code").click()'); code = await ev('document.getElementById("r-codebox").value'); print('replay code', len(code), 'characters')
        await ev('void document.getElementById("r-menu").click()'); await pg.wait_for_timeout(800)
        await ev('(() => { document.getElementById("o-code").value = %s; document.getElementById("o-codebtn").click(); })()' % json.dumps(code)); await pg.wait_for_timeout(4000)
        await ev('(() => { const r = document.getElementById("rp-bar"); r.value = 1000; r.dispatchEvent(new Event("input")); })()'); await pg.wait_for_timeout(2000)
        rc = json.loads(await ev('JSON.stringify({ sum: __beta.battle.summary(), orders: __beta.battle.cmd ? __beta.battle.cmd.log : null })')); c = dict(rc['sum']); c.pop('t', None)
        print('from the replay code: same outcome', c == same, '| same orders', rc['orders'] == res['orders'])
        if c != same or rc['orders'] != res['orders']: bad.append('the battle from the replay code was not the same battle')
        # an old code (no orders in it) still loads, as a battle the crew fights
        old = await ev('btoa(JSON.stringify(Object.assign(JSON.parse(atob(%s)), { cmd: undefined })))' % json.dumps(code))
        await ev('void document.getElementById("rp-result").click()'); await pg.wait_for_timeout(500); await ev('void document.getElementById("r-menu").click()'); await pg.wait_for_timeout(800)
        await ev('(() => { document.getElementById("o-code").value = %s; document.getElementById("o-codebtn").click(); })()' % json.dumps(old)); await pg.wait_for_timeout(4000)
        oc = json.loads(await ev('JSON.stringify({ state: __beta.state(), cmd: __beta.battle.cmd === null, bar: !document.getElementById("replay").hidden })')); print('a code without orders loads as a crew battle', oc)
        if oc['state'] != 'play' or not oc['cmd'] or not oc['bar']: bad.append('a replay code without orders did not load as a crew battle')
        e2 = await errbar(); print('console errors', errs[:5], '| red bar:', e2 or 'none')
        print('COMMAND CHECK ' + ('PASSED' if not bad and not errs and not e2 else 'FAILED: ' + '; '.join(bad + errs[:2] + ([e2] if e2 else [])))); await b.close()
asyncio.run(main())
