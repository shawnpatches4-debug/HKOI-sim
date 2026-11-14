# python3 tests/beta/shell.py [out folder] : the shell around the battle, driven the way a player would.
#   title screen over the battle (three ways in, setup one click away), the title's show at 30/60/144/240 frames a second,
#   the setup panel (incl. the tank's own crew level and crew stress), the simple and engineer displays with a missile inbound,
#   a seat view in each display, the view bar, the result screen and its buttons.
# Needs the restricted test server (BASE). Takes pictures into the out folder. Prints SHELL CHECK PASSED or what went wrong.
import asyncio, os, sys, json
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('OUT', '/tmp')
PARTS = set((os.environ.get('PARTS') or 'title,fps,setup,hud,log,seat,result').split(','))
TAG = os.environ.get('TAG', '')   # added to the names of the pictures (for a second window size)

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

        async def part(f):
            try: await f()
            except Exception as e: bad.append('the check itself stopped: ' + str(e)[:300]); print('  STOPPED:', str(e)[:600])
        await pg.goto(os.environ['BASE'] + '#' + os.environ.get('HASH', 'gfx=low&speed=1&map=3&seed=1&demo=1'), timeout=120000)
        for i in range(160):
            if await ev('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        await ev('localStorage.clear()')

        async def part_1():
            v = await vis('title', 'go', 'o-ladder', 'o-numbers', 'o-setup', 'setup', 'bar', 'status', 'sline')
            top = [await ev('%s(%s)' % (TOP, json.dumps(i))) for i in ('go', 'o-ladder', 'o-numbers', 'o-setup')]
            print('title:', await ev('__beta.state()'), v, 'clickable', top, '| version', await ev('document.getElementById("ver").textContent'), '|', await ev('document.getElementById("t-sum").textContent'))
            need(await ev('__beta.state()') == 'title' and v['title'] and v['go'] and v['o-ladder'] and v['o-numbers'] and v['o-setup'] and all(top), 'title screen does not show Play, Ladder, Run the numbers and Change setup')
            need(not v['setup'] and not v['bar'] and not v['status'] and not v['sline'], 'the setup panel or battle boxes are showing on the title screen')
            need(await ev('document.querySelectorAll("#title button").length') <= 5, 'the title screen has more than five buttons')

        if 'title' in PARTS: await part(part_1)
        async def part_2():
            # the title's show stepped by hand at four frame rates: the battle and the camera must come out the same
            # (riding a missile at about 300 m/s, the 0.02 s allowed in sampling time is 6 m, so that shot gets 8 m; the others 1.5 m)
            runs = {}
            for fps in (30, 60, 144, 240):
                await ev('void (__beta.titleShow.rideMissiles = true)'); await ev('__beta.titleReset(7)'); samples = []
                for sec in range(1, 37):
                    await ev('(() => { const n = %d, dt = 1 / %d; for (let i = 0; i < n; i++) __beta.titleTick(dt); })()' % (fps, fps))
                    if sec % 6 == 0: samples.append(await js('__beta.titleInfo()'))
                runs[fps] = samples; print(' ', fps, 'fps:', [(s['shot'], s['t'], s['cam']) for s in samples])
            ref = runs[60]
            for fps, sm in runs.items():
                for a, r in zip(sm, ref):
                    d = max(abs(x - y) for x, y in zip(a['cam'], r['cam']))
                    need(a['shot'] == r['shot'] and abs(a['t'] - r['t']) <= 0.21 and abs(a['showT'] - r['showT']) < 0.02 and d < (8 if a['shot'] == 'missile' else 1.5), 'title show differs at %d fps: %s %.1f s cam off by %.2f m (60 fps: %s %.1f s)' % (fps, a['shot'], a['t'], d, r['shot'], r['t']))
            need(len(set(s['shot'] for s in ref)) >= 2, 'the title show never changed its camera angle in 36 s')
            need(ref[-1]['t'] > 30, 'the battle behind the title did not advance')

        if 'fps' in PARTS: await part(part_2)
        async def part_3():
            # pictures: a turn around the vehicle, then the first moment a missile is being ridden
            await ev('void (__beta.titleShow.rideMissiles = true)'); await ev('__beta.titleReset(7)'); await ev('(() => { for (let i = 0; i < 150; i++) __beta.titleTick(1 / 30); })()'); need((await js('__beta.titleInfo()'))['shot'] == 'turn', 'the title does not open on the vehicle'); await shot('title_live')
            found = False
            for k in range(240):
                await ev('(() => { for (let i = 0; i < 15; i++) __beta.titleTick(1 / 30); })()')
                i = await js('({ n: __beta.volleys.info.length, shot: __beta.titleShow.shot.key, t: __beta.battle.t })')
                if i['n'] and i['shot'] == 'missile': found = True; break
            print('title: missile ride found', found, i)
            if found: await ev('(() => { for (let i = 0; i < 24; i++) __beta.titleTick(1 / 30); })()'); await shot('title_missile')
            need(found, 'the title show never cut to a missile in 120 s of battle')
            # the real frame loop runs the title by itself
            await ev('void (__beta.titleShow.rideMissiles = false)'); await ev('__beta.titleAuto()'); t0 = (await js('__beta.titleInfo()'))
            await pg.wait_for_timeout(9000); t1 = await js('__beta.titleInfo()')
            print('title: real loop, live', t1['live'], 't', t0['t'], '->', t1['t'], '| red bar', await ev('!document.getElementById("errbar").hidden'))
            need(not t1['live'] or t1['t'] > t0['t'], 'with the live title on, the real frame loop did not advance the battle')
            need(await ev('document.getElementById("errbar").hidden'), 'the red error bar is showing on the title screen')

        if 'title' in PARTS: await part(part_3)
        async def part_4():
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

        if 'setup' in PARTS: await part(part_4)
        async def part_5():
            await pg.click('#go'); await pg.wait_for_timeout(1500)
            need(await ev('__beta.state()') == 'play' and await ev('__beta.hud()') == 'engineer', 'Play did not start the battle in the engineer display')
            need(await ev('__beta.battle.crewOpt.quality') in ('trained', None) and await ev('__beta.battle.crewOpt.on') is True, 'the default crew is not trained with stress on')

        if PARTS & {'hud', 'log', 'seat', 'result'}: await part(part_5)
        async def part_6():
            HUDTXT = '["threats", "engleft", "engright", "ticker", "status"].map(i => document.getElementById(i).innerText).join(" | ")'
            OVER = '(() => { const ids = ["status", "threats", "engleft", "engright", "ticker", "bar", "subs", "logov"], R = ids.map(i => { const e = document.getElementById(i); return e.hidden ? { width: 0 } : e.getBoundingClientRect(); }), out = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = R[i], b = R[j]; if (a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(ids[i] + " over " + ids[j]); } const pb = [...document.querySelectorAll("#engleft .pan, #engright .pan")].map(e => e.getBoundingClientRect().bottom), bar = document.getElementById("bar").getBoundingClientRect().top; if (Math.max(...pb) > bar) out.push("a panel runs under the bar"); return out; })()'
            # ---- a quiet moment
            await ev('__beta.playFor(1.5)'); await ev('__beta.setPlaying(false)')
            for k in range(60):
                if await ev('!__beta.faces || __beta.faces.ok || __beta.faces.failed'): break
                await pg.wait_for_timeout(2000)
            await pg.wait_for_timeout(5000)
            v = await vis('status', 'threats', 'engleft', 'engright', 'ticker', 'bar', 'sline', 'gauges', 'warn', 'logov', 'crewmen', 'crew', 'defences', 'enemybox')
            e = await js('({ hud: __beta.hud(), head: document.getElementById("threats").innerText, cls: document.getElementById("threats").className, strip: [...document.querySelectorAll("#status .chip")].map(x => x.textContent), panels: [...document.querySelectorAll(".pan h3 span")].map(x => x.textContent), men: document.querySelectorAll("#crewmen .man").length, faces: __beta.faces ? { ok: __beta.faces.ok, failed: __beta.faces.failed, ms: +__beta.faces.ms.toFixed(2), draws: __beta.faces.draws } : null, stations: [...document.querySelectorAll(".st")].map(x => x.querySelector(".sh b").textContent + " [" + x.querySelector(".tag").textContent + "] " + x.querySelector(".sl").textContent + " | " + [...x.querySelectorAll(".mag")].map(m => m.title).join(", ") + " | " + x.querySelector(".sf").textContent), bar: [...document.querySelectorAll("#bar .barrow:last-child button")].map(x => x.textContent), ticks: document.querySelectorAll("#ticker div").length, crew: document.getElementById("crewmen").innerText.replace(/\\n+/g, " / ").slice(0, 500), enemy: document.getElementById("enemybox").innerText.replace(/\\n+/g, " / ") })')
            print('engineer, quiet:', v); print('  ', e)
            need(e['hud'] == 'engineer', 'the engineer display is not the default')
            need(v['status'] and v['threats'] and v['engleft'] and v['engright'] and v['ticker'] and v['bar'] and not v['sline'] and not v['gauges'] and not v['warn'] and not v['logov'], 'the engineer display shows the wrong boxes')
            need('No threats' in e['head'] and e['cls'] == 'quiet', 'the headline is not quiet with nothing in the air')
            need(len(e['strip']) == 3 and e['strip'][0].startswith('T+') and 'fps' in e['strip'][2], 'the top strip is not time, rate and frame time only')
            need(e['panels'] == ['Crew', 'Defences', 'Weapons', 'Enemy'] and e['men'] == 4 and len(e['stations']) == 5 and all('[' in x and '[]' not in x for x in e['stations']), 'the four panels, four crew rows or five station cards are not all there')
            need(len(e['bar']) <= 11 and e['ticks'] <= 3 and await ev('!document.querySelector("#bar .pick")'), 'the bar is more than its one row of eleven buttons, the view list is open without being asked for, or the ticker has more than three lines')
            need(e['faces'] is None or e['faces']['ok'], 'the crew portraits did not load')
            ov = await js(OVER); print('  overlaps', ov); need(not ov, 'engineer boxes overlap in a quiet moment: ' + ', '.join(ov))
            await shot('eng_quiet' + TAG, 3000)
            # ---- one missile held by the sensors
            got = False; await ev('__beta.setPlaying(true)')
            for k in range(900):
                await ev('__beta.playFor(0.3)')
                if await ev('__beta.volleys.info.some(m => m.cued && m.range > 300) || !__beta.battle.tank.alive || !!__beta.battle.over'): got = await ev('__beta.volleys.info.some(m => m.cued)'); break
            await ev('__beta.setPlaying(false)'); await pg.wait_for_timeout(5000)
            h = await js('({ t: __beta.battle.t, head: document.getElementById("threats").innerText.replace(/\\n+/g, " / "), cls: document.getElementById("threats").className, rows: document.querySelectorAll("#threats .t").length, txt: %s })' % HUDTXT)
            print('engineer, missile inbound:', got, h['t'], h['cls'], '|', h['head'])
            need(got, 'no missile was picked up by the sensors in the battle')
            need(not got or (h['cls'] in ('warm', 'hot') and h['rows'] >= 1 and ' km' in h['head'] and "o'clock" in h['head'] and any(w in h['head'] for w in ('HKOI', 'Trophy', 'radar', 'tracked'))), 'the headline does not give the weapon, range, bearing and what the defences are doing')
            need(not any(w in h['txt'] for w in ('SACLOS', 'APS', 'aps_', 'cued', ' HE ', '—')), 'engine words or a long dash are showing in the engineer display: ' + h['txt'][:300])
            ov = await js(OVER); print('  overlaps', ov); need(not ov, 'engineer boxes overlap with a missile inbound: ' + ', '.join(ov))
            await shot('eng_missile' + TAG, 3000)
            # ---- folding a panel is remembered
            await pg.click('#engright .pan:first-child h3'); await pg.wait_for_timeout(400)
            f = await js('({ shut: document.querySelector("#engright .pan").classList.contains("shut"), body: getComputedStyle(document.getElementById("defences")).display, saved: localStorage.getItem("hkoi.panels") })'); print('  fold:', f)
            need(f['shut'] and f['body'] == 'none' and f['saved'] and '"def":true' in f['saved'], 'a click on a panel title did not fold it and remember it')
            await pg.click('#engright .pan:first-child h3'); await pg.wait_for_timeout(300)
            # ---- several threats at once; a crewman shaken (from the battle if it has one by then, otherwise set by this check and said so)
            await ev('__beta.setPlaying(true)'); n3 = 0
            for k in range(400):
                await ev('__beta.playFor(0.2)'); n3 = await ev('__beta.volleys.info.filter(m => m.cued).length')
                if n3 >= 3 or await ev('!__beta.battle.tank.alive || !!__beta.battle.over || __beta.battle.t > 60'): break
            real = await ev('Object.values(__beta.battle.crewState().who).some(m => m.state === "shaken" || m.state === "panicked")')
            if not real: await ev('void (__beta.hudBox.fake = { ldr: { state: "shaken", stress: 0.7, why: "rocket passed 5 m away (set by the check)" } })')
            await ev('__beta.setPlaying(false)'); await pg.wait_for_timeout(5500)
            h = await js('({ t: __beta.battle.t, head: document.getElementById("threats").innerText.replace(/\\n+/g, " / "), stations: [...document.querySelectorAll(".st")].map(x => x.querySelector(".sh b").textContent + " [" + x.querySelector(".tag").textContent + "] " + x.querySelector(".sl").textContent + " | " + x.querySelector(".sf").textContent), crew: document.getElementById("crewmen").innerText.replace(/\\n+/g, " / ").slice(0, 700) })')
            print('engineer, several threats:', n3, 'in the air; shaken man from the battle itself:', real, '|', h['head']); print('  stations', h['stations']); print('  crew', h['crew'])
            need('shaken' in h['crew'] or 'panicked' in h['crew'] or 'frozen' in h['crew'], 'the crew panel does not show a shaken man')
            ov = await js(OVER); print('  overlaps', ov); need(not ov, 'engineer boxes overlap with several threats: ' + ', '.join(ov))
            wr = await js('[...document.querySelectorAll("#threats .do, .sl, .sf, .r .m, .mt .do, .mt .fx, .mt .why")].filter(e => e.offsetParent && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)).map(e => e.textContent.slice(0, 50))'); print('  cut-off texts', wr); need(len(wr) == 0, 'a line that explains what is happening is cut off: ' + ' | '.join(wr[:4]))
            await shot('eng_three' + TAG, 3000); await ev('void (__beta.hudBox.fake = null)')
        if 'hud' in PARTS: await part(part_6)
        async def part_6b():
            # ---- later in the fight: the full log with its filters, crew lines in their own style
            await ev('__beta.setPlaying(true)'); crew = False
            for k in range(500):
                await ev('__beta.playFor(0.5)')
                if await ev('__beta.battle.log.some(l => l.kind === "crew" && l.t <= __beta.battle.t) || !__beta.battle.tank.alive || !!__beta.battle.over'): crew = await ev('__beta.battle.log.some(l => l.kind === "crew" && l.t <= __beta.battle.t)'); break
            await ev('__beta.setPlaying(false)'); await pg.wait_for_timeout(4500)
            await pg.keyboard.press('l'); await pg.wait_for_timeout(700)
            lg = await js('({ open: !document.getElementById("logov").hidden, lines: document.querySelectorAll("#log div").length, crewLines: document.querySelectorAll("#log .k-crew").length, filters: [...document.querySelectorAll("#lo-filters button")].map(x => x.textContent), ticks: [...document.querySelectorAll("#ticker div")].map(x => x.textContent.slice(0, 80)), audio: __beta.sound.ctx ? __beta.sound.ctx.state : "not started", said: __beta.sound.icom ? __beta.sound.icom.said.length : null, subs: document.getElementById("subs").textContent })')
            print('log overlay:', lg)
            need(lg['open'] and lg['lines'] >= 3 and lg['filters'] == ['All', 'Threats', 'Crew', 'Enemy'] and 1 <= len(lg['ticks']) <= 3, 'key L did not open the full log with its filters, or the ticker is empty')
            need(not crew or lg['crewLines'] >= 1, 'crew lines are in the battle log but not in the log with their own style')
            await shot('eng_log' + TAG, 2500)
            await ev('[...document.querySelectorAll("#lo-filters button")].find(x => x.textContent === "Crew").click()'); await pg.wait_for_timeout(400)
            fl = await js('({ shown: [...document.querySelectorAll("#log div")].filter(x => x.offsetParent).map(x => x.className), })'); need(len(fl['shown']) >= (1 if crew else 0) and all(c in ('k-crew', 'k-tank') for c in fl['shown']), 'the Crew filter shows other lines: ' + str(fl['shown'][:6]))
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400); need(await ev('document.getElementById("logov").hidden'), 'Esc did not close the log')
            # ---- the simple display is one key away and is remembered
            await pg.keyboard.press('h'); await pg.wait_for_timeout(5000)
            v = await vis('sline', 'gauges', 'bar', 'status', 'engleft', 'engright', 'threats', 'ticker', 'facerow'); sm = await js('({ hud: __beta.hud(), saved: localStorage.getItem("hkoi.hud"), mini: [...document.querySelectorAll("#facerow .mf")].map(x => x.textContent), line: document.getElementById("sline").textContent })'); print('simple display:', v, sm)
            need(sm['hud'] == 'simple' and sm['saved'] == '"simple"' and v['sline'] and v['gauges'] and v['bar'] and not v['status'] and not v['engleft'] and not v['engright'] and not v['threats'] and not v['ticker'], 'key H did not switch to the simple display and remember it')
            need(await ev('!__beta.faces || __beta.faces.failed') or (v['facerow'] and len(sm['mini']) == 4), 'the simple display does not show the four small faces')
            await shot('simple' + TAG, 3000)
            await pg.keyboard.press('h'); await pg.wait_for_timeout(600)
        if 'log' in PARTS: await part(part_6b)
        async def part_7():
            if await ev('__beta.state()') != 'play': await pg.wait_for_timeout(6000); await pg.click('#r-again'); await pg.wait_for_timeout(1500)   # the fight above may have ended
            if await ev('__beta.hud()') != 'engineer': await pg.keyboard.press('h'); await pg.wait_for_timeout(600)
            await ev('__beta.setPlaying(false)')
            await ev('[...document.querySelectorAll("#bar .barrow:last-child button")].find(x => x.textContent.startsWith("View")).click()'); await pg.wait_for_timeout(300)
            names = await js('[...document.querySelectorAll("#bar .pick button")].map(x => x.textContent.replace(/[0-9]$/, ""))'); print('view picker:', names)
            need(sum(1 for n in names if 'river' in n) == 1 and 'Driver seat' in names and sum(1 for n in names if n.startswith('Loader')) == 2 and 'Commander, head out' in names and 'Loader, head out' in names and 'Commander seat' in names and 'Gunner seat' in names, 'the view picker does not hold exactly one driver view (the seat), both loader views and the head-out commander view')
            pk = await js('(() => { const p = document.querySelector("#bar .pick").getBoundingClientRect(), out = []; for (const i of ["engleft", "engright", "threats", "status"]) { const e = document.getElementById(i); if (e.hidden) continue; const b = e.getBoundingClientRect(); if (p.left < b.right - 1 && b.left < p.right - 1 && p.top < b.bottom - 1 && b.top < p.bottom - 1) out.push(i); } return out; })()'); need(not pk, 'the view list covers ' + ', '.join(pk))
            await shot('eng_picker' + TAG, 1500)
            await pg.mouse.click(640, 250); await pg.wait_for_timeout(400); need(await ev('!document.querySelector("#bar .pick")'), 'a click elsewhere did not close the view list')
            await ev('document.getElementById("viewbtn").click()'); await pg.wait_for_timeout(300); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); need(await ev('!document.querySelector("#bar .pick")'), 'Esc did not close the view list')
            await ev('document.getElementById("viewbtn").click()'); await pg.wait_for_timeout(300)
            await ev('[...document.querySelectorAll("#bar .pick button")].find(x => x.textContent.startsWith("Gunner seat")).click()'); await pg.wait_for_timeout(6000); need(await ev('!document.querySelector("#bar .pick")'), 'the view list stayed open after a view was picked')
            v = await vis('strip', 'bar', 'status', 'engleft', 'engright', 'threats', 'ticker', 'sline', 'gauges', 'facerow'); print('seat, engineer:', await ev('__beta.cams.mode'), v, '|', await ev('document.getElementById("strip").textContent'))
            need(await ev('__beta.cams.mode') == 'in_gnr' and v['strip'] and v['bar'] and not v['status'] and not v['engleft'] and not v['engright'] and not v['threats'] and not v['ticker'], 'in a seat the engineer display is not one thin strip')
            need(await ev('document.getElementById("strip").getBoundingClientRect().height') < 34, 'the engineer strip in a seat is not thin')
            await shot('seat_engineer' + TAG, 3500)
            await pg.keyboard.press('h'); await pg.wait_for_timeout(5000)
            v = await vis('strip', 'bar', 'status', 'engleft', 'engright', 'threats', 'sline', 'gauges'); bt = await js('[...document.querySelectorAll("#bar button")].map(x => x.textContent)'); print('seat, simple:', v, bt)
            need(not v['strip'] and not v['status'] and not v['engleft'] and not v['engright'] and not v['threats'] and not v['sline'] and not v['gauges'] and v['bar'] and 'Back outside' in bt and len(bt) <= 5, 'in a seat the simple display does not get out of the way')
            await shot('seat_simple' + TAG, 3500)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1500); need(await ev('__beta.cams.mode') == 'orbit', 'Esc did not leave the seat')
            await pg.keyboard.press('2'); await pg.wait_for_timeout(800); need(await ev('__beta.cams.mode') == 'chase', 'key 2 did not pick the chase view')
            await ev('__beta.setView("orbit")'); await pg.keyboard.press('h'); await pg.wait_for_timeout(500)
            need(await ev('document.getElementById("errbar").hidden'), 'the red error bar came up in the seat views: ' + (await ev('document.getElementById("errbar").textContent'))[:200])
        if 'seat' in PARTS: await part(part_7)
        async def part_8():
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

        if 'result' in PARTS: await part(part_8)
        print('console errors', errs[:6]); print('SHELL CHECK ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
