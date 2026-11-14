# python3 tests/beta/shell.py [out folder] : the shell around the battle, driven the way a player would.
#   title screen over the battle (three ways in, setup one click away), the title's show at 30/60/144/240 frames a second,
#   the setup panel (incl. the tank's own crew level and crew stress), the simple and engineer displays with a missile inbound,
#   a seat view in each display, the view bar, the result screen and its buttons.
# Needs the restricted test server (BASE). Takes pictures into the out folder. Prints SHELL CHECK PASSED or what went wrong.
import asyncio, os, sys, json
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('OUT', '/tmp')
PARTS = set((os.environ.get('PARTS') or 'title,fps,setup,hud,seat,result').split(','))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))}); errs = []; bad = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        ev = pg.evaluate
        async def js(code): return json.loads(await ev('JSON.stringify(%s)' % code))
        async def shot(name, wait=4500):
            await pg.wait_for_timeout(wait)
            try: await pg.screenshot(path=os.path.join(OUT, 'shell_%s.png' % name), timeout=120000)
            except Exception as e: print('no picture', name, str(e)[:80])
        def need(ok, what):
            if not ok: bad.append(what); print('  FAIL:', what)
        # visible = on screen, has a size, and not covered at its centre by something else
        VIS = '(id => { const e = document.getElementById(id); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return false; return getComputedStyle(e).display !== "none"; })'
        TOP = '(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === e || e.contains(t)); })'
        async def vis(*ids): return {i: await ev('%s(%s)' % (VIS, json.dumps(i))) for i in ids}

        await pg.goto(os.environ['BASE'] + '#' + os.environ.get('HASH', 'gfx=low&speed=1&map=3&seed=1&demo=1'), timeout=120000)
        for i in range(160):
            if await ev('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        await ev('localStorage.clear()')

        if 'title' in PARTS:
            v = await vis('title', 'go', 'o-ladder', 'o-numbers', 'o-setup', 'setup', 'bar', 'status', 'sline')
            top = [await ev('%s(%s)' % (TOP, json.dumps(i))) for i in ('go', 'o-ladder', 'o-numbers', 'o-setup')]
            print('title:', await ev('__beta.state()'), v, 'clickable', top, '| version', await ev('document.getElementById("ver").textContent'), '|', await ev('document.getElementById("t-sum").textContent'))
            need(await ev('__beta.state()') == 'title' and v['title'] and v['go'] and v['o-ladder'] and v['o-numbers'] and v['o-setup'] and all(top), 'title screen does not show Play, Ladder, Run the numbers and Change setup')
            need(not v['setup'] and not v['bar'] and not v['status'] and not v['sline'], 'the setup panel or battle boxes are showing on the title screen')
            need(await ev('document.querySelectorAll("#title button").length') <= 5, 'the title screen has more than five buttons')

        if 'fps' in PARTS:
            # the title's show stepped by hand at four frame rates: the battle and the camera must come out the same
            runs = {}
            for fps in (30, 60, 144, 240):
                await ev('__beta.titleReset(7)'); samples = []
                for sec in range(1, 37):
                    await ev('(() => { const n = %d, dt = 1 / %d; for (let i = 0; i < n; i++) __beta.titleTick(dt); })()' % (fps, fps))
                    if sec % 6 == 0: samples.append(await js('__beta.titleInfo()'))
                runs[fps] = samples; print(' ', fps, 'fps:', [(s['shot'], s['t'], s['cam']) for s in samples])
            ref = runs[60]
            for fps, sm in runs.items():
                for a, r in zip(sm, ref):
                    d = max(abs(x - y) for x, y in zip(a['cam'], r['cam']))
                    need(a['shot'] == r['shot'] and abs(a['t'] - r['t']) <= 0.21 and abs(a['showT'] - r['showT']) < 0.02 and d < 1.5, 'title show differs at %d fps: %s %.1f s cam off by %.2f m (60 fps: %s %.1f s)' % (fps, a['shot'], a['t'], d, r['shot'], r['t']))
            need(len(set(s['shot'] for s in ref)) >= 2, 'the title show never changed its camera angle in 36 s')
            need(ref[-1]['t'] > 30, 'the battle behind the title did not advance')

        if 'title' in PARTS:
            # pictures: a turn around the vehicle, then the first moment a missile is being ridden
            await ev('__beta.titleReset(7)'); await ev('(() => { for (let i = 0; i < 240; i++) __beta.titleTick(1 / 30); })()'); await shot('title_live')
            found = False
            for k in range(240):
                await ev('(() => { for (let i = 0; i < 15; i++) __beta.titleTick(1 / 30); })()')
                i = await js('({ n: __beta.volleys.info.length, shot: __beta.titleShow.shot.key, t: __beta.battle.t })')
                if i['n'] and i['shot'] == 'missile': found = True; break
            print('title: missile ride found', found, i)
            if found: await ev('(() => { for (let i = 0; i < 24; i++) __beta.titleTick(1 / 30); })()'); await shot('title_missile')
            need(found, 'the title show never cut to a missile in 120 s of battle')
            # the real frame loop runs the title by itself
            await ev('__beta.titleAuto()'); t0 = (await js('__beta.titleInfo()'))
            await pg.wait_for_timeout(9000); t1 = await js('__beta.titleInfo()')
            print('title: real loop, live', t1['live'], 't', t0['t'], '->', t1['t'], '| red bar', await ev('!document.getElementById("errbar").hidden'))
            need(not t1['live'] or t1['t'] > t0['t'], 'with the live title on, the real frame loop did not advance the battle')
            need(await ev('document.getElementById("errbar").hidden'), 'the red error bar is showing on the title screen')

        if 'setup' in PARTS:
            await pg.click('#o-setup'); await pg.wait_for_timeout(500)
            v = await vis('setup', 't-main'); n = await js('({ crew: document.querySelectorAll("#o-crew button").length, stress: document.querySelectorAll("#o-stress button").length, hud: document.querySelectorAll("#o-hud button").length, ground: document.querySelectorAll("#o-biome button").length, cond: document.querySelectorAll("#o-cond button").length, force: document.querySelectorAll("#o-force button").length, skill: document.querySelectorAll("#o-skill button").length, waves: document.querySelectorAll("#o-waves button").length, mission: document.querySelectorAll("#o-mission button").length, fits: document.querySelector("#setup .card").getBoundingClientRect().bottom <= innerHeight })')
            print('setup:', v, n)
            need(v['setup'] and n['crew'] == 4 and n['stress'] == 2 and n['hud'] == 2 and n['ground'] == 4 and n['cond'] == 8 and n['force'] == 5 and n['skill'] == 4 and n['waves'] == 3 and n['mission'] == 3, 'the setup panel is missing choices')
            need(n['fits'], 'the setup panel does not fit the window')
            await shot('setup', 2500)
            await ev('[...document.querySelectorAll("#o-crew button")].find(x => x.textContent === "Veteran").click()'); await ev('[...document.querySelectorAll("#o-stress button")].find(x => x.textContent === "Off").click()'); await pg.wait_for_timeout(1500)
            c = await js('({ crew: __beta.set.crew, stress: __beta.set.stress, battle: __beta.battle.crewOpt, saved: JSON.parse(localStorage.getItem("hkoi.setup")), sum: document.getElementById("t-sum").textContent })'); print('setup: crew choice', c['crew'], c['stress'], c['battle'], '|', c['sum'])
            need(c['crew'] == 'veteran' and c['stress'] is False and c['battle'] == {'on': False, 'quality': 'veteran'} and c['saved']['crew'] == 'veteran' and c['saved']['stress'] is False, 'crew level and crew stress did not reach the battle or were not remembered')
            await ev('[...document.querySelectorAll("#o-crew button")].find(x => x.textContent === "Trained").click()'); await ev('[...document.querySelectorAll("#o-stress button")].find(x => x.textContent === "On").click()'); await pg.wait_for_timeout(600)
            await pg.click('#s-done'); await pg.wait_for_timeout(400); need(not (await vis('setup'))['setup'] and (await vis('go'))['go'], 'Done did not close the setup panel')

        if 'hud' in PARTS or 'seat' in PARTS or 'result' in PARTS:
            await pg.click('#go'); await pg.wait_for_timeout(1500)
            need(await ev('__beta.state()') == 'play' and await ev('__beta.hud()') == 'simple', 'Play did not start the battle in the simple display')
            need(await ev('__beta.battle.crewOpt.quality') in ('trained', None) and await ev('__beta.battle.crewOpt.on') is True, 'the default crew is not trained with stress on')

        if 'hud' in PARTS:
            # fight on until the vehicle's sensors hold a missile in the air, then freeze that moment
            got = False
            for k in range(900):
                await ev('__beta.playFor(0.4)')
                if await ev('__beta.volleys.info.some(m => m.cued && m.range > 250) || !__beta.battle.tank.alive || !!__beta.battle.over'): got = await ev('__beta.volleys.info.some(m => m.cued)'); break
            await ev('__beta.setPlaying(false)'); await pg.wait_for_timeout(5000)
            v = await vis('sline', 'gauges', 'warn', 'bar', 'status', 'engleft', 'engright', 'log', 'strip', 'hud'); w = await ev('document.getElementById("warn").textContent'); print('simple display: t', await ev('__beta.battle.t'), 'missile held', got, v, '|', w, '|', await ev('document.getElementById("sline").textContent'), '|', await ev('document.getElementById("gauges").textContent'))
            need(got, 'no missile was picked up by the sensors in 6 minutes of battle')
            need(v['sline'] and v['gauges'] and v['bar'] and not v['status'] and not v['engleft'] and not v['engright'] and not v['log'] and not v['strip'], 'the simple display shows the wrong boxes')
            need(not got or (v['warn'] and 'INBOUND' in w and "o'clock" in w and 'bearing' in w and 'km' in w), 'no warning with a bearing while a missile is inbound')
            need(await ev('document.querySelectorAll("#bar .barrow:last-child button").length') <= 13, 'the simple bar has more than 13 buttons')
            await shot('simple', 3000)
            await pg.keyboard.press('h'); await pg.wait_for_timeout(5000)
            v = await vis('sline', 'gauges', 'warn', 'bar', 'status', 'engleft', 'engright', 'log', 'crewmen', 'crew', 'threats')
            e = await js('({ hud: __beta.hud(), saved: localStorage.getItem("hkoi.hud"), men: document.querySelectorAll("#crewmen div").length, crew: document.getElementById("crewmen").textContent.slice(0, 260), weapons: document.querySelectorAll("#crew div").length, threats: document.querySelectorAll("#threats div").length, thr: document.getElementById("threats").textContent.slice(0, 160), chips: [...document.querySelectorAll("#status .chip")].map(x => x.textContent), logLines: document.querySelectorAll("#log div").length, crewLines: document.querySelectorAll("#log .k-crew").length, state: __beta.battle.crewState().who.cdr })')
            print('engineer display:', v, e)
            need(e['hud'] == 'engineer' and e['saved'] == '"engineer"', 'key H did not switch to the engineer display and remember it')
            need(v['status'] and v['engleft'] and v['engright'] and v['log'] and v['crewmen'] and v['crew'] and v['threats'] and not v['sline'] and not v['gauges'] and not v['warn'], 'the engineer display shows the wrong boxes')
            need(e['men'] == 4 and e['weapons'] >= 4 and (not got or e['threats'] >= 1) and any('FRAME' in c for c in e['chips']) and e['logLines'] >= 1, 'the engineer display is missing crew states, weapons, the threat readout, frame time or the log')
            need(e['state']['state'] in e['crew'], 'the crew box does not show the commander\'s state from battle.crewState()')
            # boxes must not sit on top of each other
            ov = await js('(() => { const ids = ["status", "engleft", "engright", "bar", "caption", "subs"], R = ids.map(i => document.getElementById(i).getBoundingClientRect()), out = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = R[i], b = R[j]; if (a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(ids[i] + " over " + ids[j]); } return out; })()')
            print('engineer display: overlaps', ov); need(not ov, 'engineer boxes overlap: ' + ', '.join(ov))
            await shot('engineer', 3000)

        if 'seat' in PARTS:
            if await ev('__beta.hud()') != 'engineer': await pg.keyboard.press('h'); await pg.wait_for_timeout(600)
            await ev('__beta.setPlaying(false)')
            names = []
            for g in ('Outside', 'Crew views', 'Inside', 'Enemy'):
                await ev('[...document.querySelectorAll("#bar .barrow:last-child button")].find(x => x.textContent.startsWith(%s)).click()' % json.dumps(g)); await pg.wait_for_timeout(200)
                names += await js('[...document.querySelectorAll("#bar .pop button")].map(x => x.textContent)')
            print('view bar:', names)
            need(sum(1 for n in names if 'river' in n) == 1 and 'Driver seat' in names and sum(1 for n in names if n.startswith('Loader')) == 2 and 'Commander, head out' in names and 'Loader, head out' in names and 'Commander seat' in names and 'Gunner seat' in names, 'the view bar does not hold exactly one driver view (the seat), both loader views and the head-out commander view')
            await ev('[...document.querySelectorAll("#bar .barrow:last-child button")].find(x => x.textContent.startsWith("Inside")).click()'); await pg.wait_for_timeout(200)
            await ev('[...document.querySelectorAll("#bar .pop button")].find(x => x.textContent === "Gunner seat").click()'); await pg.wait_for_timeout(6000)
            v = await vis('strip', 'bar', 'status', 'engleft', 'engright', 'log', 'sline', 'gauges'); print('seat, engineer:', await ev('__beta.cams.mode'), v, '|', await ev('document.getElementById("strip").textContent'))
            need(await ev('__beta.cams.mode') == 'in_gnr' and v['strip'] and v['bar'] and not v['status'] and not v['engleft'] and not v['engright'] and not v['log'], 'in a seat the engineer display is not one thin strip')
            need(await ev('document.getElementById("strip").getBoundingClientRect().height') < 34, 'the engineer strip in a seat is not thin')
            await shot('seat_engineer', 3500)
            await pg.keyboard.press('h'); await pg.wait_for_timeout(5000)
            v = await vis('strip', 'bar', 'status', 'engleft', 'engright', 'log', 'sline', 'gauges'); bt = await js('[...document.querySelectorAll("#bar button")].map(x => x.textContent)'); print('seat, simple:', v, bt)
            need(not v['strip'] and not v['status'] and not v['engleft'] and not v['engright'] and not v['log'] and not v['sline'] and not v['gauges'] and v['bar'] and 'Leave seat' in bt and len(bt) <= 5, 'in a seat the simple display does not get out of the way')
            await shot('seat_simple', 3500)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1500); need(await ev('__beta.cams.mode') == 'orbit', 'Esc did not leave the seat')
            await pg.keyboard.press('2'); await pg.wait_for_timeout(800); need(await ev('__beta.cams.mode') == 'chase', 'key 2 did not pick the chase view')
            await ev('__beta.setView("in_cdr")'); await shot('seat_cdr_simple', 6000); await ev('__beta.setView("cut")'); await shot('cutaway_simple', 6000); await ev('__beta.setView("orbit")')
            need(await ev('document.getElementById("errbar").hidden'), 'the red error bar came up in the seat views: ' + (await ev('document.getElementById("errbar").textContent'))[:200])

        if 'result' in PARTS:
            await ev('__beta.setPlaying(true)'); await ev('__beta.runTo(1800)')
            for i in range(120):
                if await ev('__beta.state() === "result"'): break
                await pg.wait_for_timeout(1000)
            v = await vis('result', 'r-replay', 'r-again', 'r-next', 'r-nextrung', 'r-numbers', 'r-menu', 'r-glance', 'bar', 'sline')
            r = await js('({ state: __beta.state(), head: document.getElementById("r-head").textContent, res: document.getElementById("r-res").textContent, score: document.getElementById("r-score").textContent, grade: document.getElementById("r-grade").textContent, saved: document.getElementById("r-saved").textContent, facts: document.getElementById("r-facts").textContent, fits: document.querySelector("#result .card").getBoundingClientRect().bottom <= innerHeight, btns: [...document.querySelectorAll("#result .row button")].filter(x => !x.hidden).map(x => x.textContent) })')
            print('result:', v, r)
            need(r['state'] == 'result' and v['result'] and v['r-glance'] and r['res'] and r['score'].isdigit() and len(r['saved']) > 20 and r['fits'], 'the result screen does not show the result, the score and what HKOI saved in one window')
            need(v['r-replay'] and v['r-again'] and v['r-next'] and not v['r-nextrung'] and v['r-numbers'] and v['r-menu'] and not v['bar'] and not v['sline'], 'the result screen has the wrong buttons for a battle outside the ladder')
            await shot('result', 2500)
            await pg.click('#r-numbers'); await pg.wait_for_timeout(700); need(await ev('!document.getElementById("numbers").hidden && document.getElementById("result").hidden'), 'Run the numbers did not open from the result screen')
            await ev('[...document.querySelectorAll("#numbers .row button")].find(x => x.textContent === "Back").click()'); await pg.wait_for_timeout(700); need(await ev('!document.getElementById("result").hidden && __beta.state() === "result"'), 'Back from the numbers did not return to the result')
            await pg.click('#r-again'); await pg.wait_for_timeout(1500); need(await ev('__beta.state() === "play" && __beta.battle.t < 20'), 'Again did not restart the battle')
            await ev('[...document.querySelectorAll("#bar button")].find(x => x.textContent === "Menu").click()'); await pg.wait_for_timeout(1200); need(await ev('__beta.state() === "title" && !document.getElementById("title").hidden'), 'Menu did not go back to the title')
            # a ladder raid: the result offers the next rung, and it starts
            await pg.click('#o-ladder'); await pg.wait_for_timeout(600); await ev('document.querySelectorAll("#ladder .pg-rung button")[0].click()'); await pg.wait_for_timeout(1500); await ev('__beta.runTo(1800)')
            for i in range(120):
                if await ev('__beta.state() === "result"'): break
                await pg.wait_for_timeout(1000)
            v = await vis('r-nextrung', 'r-next'); print('ladder result:', v, await ev('document.getElementById("r-grade").textContent'), '| crew', await js('__beta.battle.crewOpt'))
            need(v['r-nextrung'] and not v['r-next'], 'a ladder result does not offer the next rung')
            await shot('result_ladder', 2500)
            await pg.click('#r-nextrung'); await pg.wait_for_timeout(1500); need(await ev('__beta.state() === "play" && __beta.set.custom && __beta.set.custom.rung === "r2"'), 'Next rung did not start rung 2')
            await ev('[...document.querySelectorAll("#bar button")].find(x => x.textContent === "Menu").click()'); await pg.wait_for_timeout(800)
            need(await ev('document.getElementById("errbar").hidden'), 'the red error bar is showing: ' + (await ev('document.getElementById("errbar").textContent'))[:200])

        print('console errors', errs[:6]); print('SHELL CHECK ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
