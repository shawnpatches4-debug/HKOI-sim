# python3 tests/beta/cdrview.py : the commander view on the map, driven by a made-up commander (tests/beta/fake_commander.js).
# PART=page (default): every kind of order, a stale report, the three sources of his picture, a wrong picture with spectator on and
# with fog of war, a lost commander, no commander at all, the same motion at 30/60/144/240 frames a second.
# PART=replay: scrubbing a real replay with the map open. (tests/app/cdrview.test.mjs checks the same logic in node, with pictures.)
# Needs the restricted test server (BASE). SHOT = picture prefix.
import asyncio, os, json
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))}); errs = []; bad = []; shot = os.environ.get('SHOT', '/tmp/cdrview')
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#gfx=min&speed=1&spectator=1&force=heavy&play=1', timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready && window.__beta.battle)'): break
            await pg.wait_for_timeout(1500)
        ev = lambda s: pg.evaluate(s)
        js = lambda s: pg.evaluate('JSON.stringify(' + s + ')')
        labels = lambda: js('__beta.mapv.cdr.state().labels')
        await ev('localStorage.removeItem("hkoi.cdrview")')
        await ev('void (__beta.setPlaying(false), __beta.runTo(60))')
        real = await ev('typeof __beta.battle.commander')
        print('battle.commander before the fake is put in:', real, '| teams', await ev('__beta.battle.units.length'))
        await ev('__beta.openMap()'); await pg.wait_for_timeout(2500)
        n0 = json.loads(await js('{btn: !!document.getElementById("map-cdr"), on: __beta.mapv.cdr.on, list: document.getElementById("cdr-list").hidden, legend: getComputedStyle(document.getElementById("maplegend")).display}'))
        print('normal map', n0)
        if not n0['btn'] or n0['on'] or not n0['list'] or n0['legend'] == 'none': bad.append('the normal map is not as before (button there, commander view off, its own legend showing)')
        await pg.screenshot(path=shot + '_normal.png')
        await ev(open(os.path.join(HERE, 'fake_commander.js')).read())
        await ev('void (Object.getPrototypeOf(__beta.battle).commander = window.__fakeCommander, Object.getPrototypeOf(__beta.battle).vehicles = window.__fakeVehicles)')
        PART = os.environ.get('PART', 'page')   # 'page' (about 3 minutes) or 'replay' (about 4): one at a time, the browser is shared
        if 'page' in PART:
            await ev('document.getElementById("map-cdr").click()'); await pg.wait_for_timeout(2500)
            c = json.loads(await js('{on: __beta.mapv.cdr.on, saved: localStorage.getItem("hkoi.cdrview"), rows: [...document.querySelectorAll("#cdr-rows .cdr-row")].map(r => r.textContent), wrong: document.querySelectorAll("#cdr-rows .wrong").length, head: document.querySelector("#cdr-list .cdr-head").textContent, st: __beta.mapv.cdr.state(), legend: getComputedStyle(document.getElementById("maplegend")).display}'))
            L = c['st']['labels']; print('commander view: rows', len(c['rows']), '| head:', c['head'][:260]); print('labels', L)
            if not c['on'] or c['saved'] != 'true': bad.append('the button did not switch the view on and remember it')
            if len(c['rows']) != 10: bad.append('the list does not hold all ten orders')
            if not c['rows'] or not c['rows'][0].startswith('Break'): bad.append('the newest order is not first in the list')
            if not c['rows'] or 'done' not in c['rows'][-1]: bad.append('the finished order is not last and marked done')
            for word in ['fix the tank', 'commit down', 'break contact', 'Tank believed here', 'reported 38 s ago', 'He expects it here', 'his picture is', 'Tank (true position)']:   # only his picture, the truth and the newest three orders are written without picking
                if not any(word in l for l in L): bad.append('nothing on the map says "%s"' % word)
            if c['wrong'] != 2 or c['legend'] != 'none': bad.append('wrong orders are not flagged in the list, or the ordinary legend is still showing')
            await pg.screenshot(path=shot + '_cdr.png')
            # the countdown really counts: 10 s later the same order shows 10 s less
            eta = '[...document.querySelectorAll("#cdr-rows .cdr-row")].find(r => /north ridge/.test(r.textContent)).querySelector("em").textContent'
            e1 = await ev(eta); await ev('void (__beta.runTo(70))'); await pg.wait_for_timeout(1500); e2 = await ev(eta); print('time of arrival', e1, '->', e2)
            sec = lambda s: int(s.split(':')[0]) * 60 + int(s.split(':')[1])
            if not (9 <= sec(e1) - sec(e2) <= 11): bad.append('the time of arrival did not count down by ten seconds')
            # click an order: its row lights and its arrow is the picked one
            await ev('[...document.querySelectorAll("#cdr-rows .cdr-row")].find(r => /north ridge/.test(r.textContent)).click()'); await pg.wait_for_timeout(1500)
            pk = json.loads(await js('{sel: __beta.mapv.cdr.sel, on: [...document.querySelectorAll("#cdr-rows .cdr-row.on")].map(r => r.textContent)}')); print('picked', pk)
            if pk['sel'] != 5 or len(pk['on']) != 1: bad.append('clicking an order did not pick it')
            await pg.screenshot(path=shot + '_picked.png'); await ev('void (__beta.mapv.cdr.sel = null, __beta.mapv.cdr.listSig = "")')
            # a stale report fades and its circle grows
            a0 = c['st']['believed']; await ev('void (window.__fakeStale = 400)'); await pg.wait_for_timeout(2500)
            s1 = json.loads(await js('__beta.mapv.cdr.state()')); print('believed fresh', a0, 'stale', s1['believed'], [l for l in s1['labels'] if 'believed' in l])
            if not (a0[3] > 0.95 and s1['believed'][3] < 0.45 and s1['believed'][2] > a0[2] + 200): bad.append('a stale report does not fade and widen')
            await pg.screenshot(path=shot + '_stale.png'); await ev('void (window.__fakeStale = 0)')
            # where his picture came from is said in words
            await ev('void (window.__fakeSrc = "sound")'); await pg.wait_for_timeout(1200); so = json.loads(await labels())
            await ev('void (window.__fakeSrc = "plan")'); await pg.wait_for_timeout(1200); pl = json.loads(await labels()); await ev('void (window.__fakeSrc = null)')
            print('sources:', [l for l in so if 'believed' in l], [l for l in pl if 'believed' in l])
            if not any('heard the gun 38 s ago' in l for l in so) or not any('laid for this spot, nothing seen yet' in l for l in pl): bad.append('the source of his picture (sound, plan) is not said')
            # fog of war: the true tank, the error line and the wrong flags are not shown
            await ev('void (__beta.set.spectator = false)'); await pg.wait_for_timeout(2500)
            f = json.loads(await js('{labels: __beta.mapv.cdr.state().labels, wrong: document.querySelectorAll("#cdr-rows .wrong").length, head: document.querySelector("#cdr-list .cdr-head").textContent}')); print('fog of war labels', f['labels'])
            if any(('true position' in l or 'WRONG' in l or ' off' in l) for l in f['labels']) or f['wrong'] or ' off' in f['head']: bad.append('with fog of war on the commander view gives away the true tank or his error')
            await pg.screenshot(path=shot + '_fog.png'); await ev('void (__beta.set.spectator = true)')
            # the commander is lost: said plainly, no orders left
            await ev('void (window.__fakeLost = true)'); await pg.wait_for_timeout(2500)
            lo = json.loads(await js('{head: document.querySelector("#cdr-list .cdr-head").textContent, rows: document.querySelectorAll("#cdr-rows .cdr-row").length, drawn: __beta.mapv.cdr.state().orders.length}')); print('commander lost', lo)
            if 'Commander lost: teams act on their own' not in lo['head'] or lo['rows'] or lo['drawn']: bad.append('a lost commander is not shown plainly with his orders gone')
            await pg.screenshot(path=shot + '_lost.png'); await ev('void (window.__fakeLost = false)')
            # no commander: the note and nothing else
            await ev('void (window.__fakeNone = true)'); await pg.wait_for_timeout(1500)
            nn = json.loads(await js('{none: document.getElementById("cdr-none").hidden, text: document.getElementById("cdr-none").textContent, list: document.getElementById("cdr-list").hidden}')); print('commander returns null', nn)
            if nn['none'] or not nn['list'] or nn['text'] != 'No enemy commander in this battle': bad.append('a null commander does not show the note alone')
            await pg.screenshot(path=shot + '_null.png'); await ev('void (window.__fakeNone = false)')
            # the same motion at any frame rate: 2 s of frames, an order appearing at 0.5 s (battle time 40 s) and the report and a destination moving at 1 s
            res = json.loads(await js('''(() => { const B = __beta.battle, M = __beta.mapv, out = {}; const P = Object.getPrototypeOf(B), fake = P.commander;
              for (const fps of [30, 60, 144, 240]) { let shift = 0; P.commander = function () { const C = fake.call(this); if (shift) { C.picture.e += 400; C.picture.n += 300; C.plan[4].dest = [C.plan[4].dest[0] + 300, C.plan[4].dest[1]]; } return C; };
                window.__fakeT = 38; M.cdr.lastT = null; M.draw({ tank: B.tank, showAll: true, battle: B, t: 38, dt: 0 });
                for (let i = 1; i <= 2 * fps; i++) { const t = 38 + i / fps; window.__fakeT = t + 1.5 + 1e-9; if (i >= fps) shift = 1; M.draw({ tank: B.tank, showAll: true, battle: B, t, dt: 1 / fps }); }
                out[fps] = M.cdr.state(); }
              P.commander = fake; window.__fakeT = null; M.cdr.lastT = null; return out; })()'''))
            ref = res['30']; worst = 0.0
            for k in ['60', '144', '240']:
                for a, bb in zip(ref['orders'], res[k]['orders']):
                    if a[0] != bb[0]: bad.append('different orders at %s fps' % k)
                    worst = max(worst, max(abs(x - y) for x, y in zip(a[1:], bb[1:])))
                worst = max(worst, max(abs(x - y) for x, y in zip(ref['believed'], res[k]['believed'])))
            mid = [o for o in ref['orders'] if o[0] == '9']
            print('frame rates: largest difference in any eased value between 30, 60, 144 and 240 fps = %.4f (metres or shares); order 9, given during the run: %s' % (worst, mid))
            if worst > 0.02: bad.append('the easing is not the same at every frame rate')
            if not mid or not (0.9 < mid[0][1] < 1.0): bad.append('the order given during the run was not caught easing in')
            # going back in time snaps: no arrows left over from the later moment
            sc = json.loads(await js('''(() => { const B = __beta.battle, M = __beta.mapv; window.__fakeT = 100; M.cdr.lastT = null; M.draw({ tank: B.tank, showAll: true, battle: B, t: 100, dt: 0.016 }); const a = M.cdr.state().orders.length;
              window.__fakeT = 12; M.draw({ tank: B.tank, showAll: true, battle: B, t: 12, dt: 0.016 }); const s = M.cdr.state(); window.__fakeT = null; M.cdr.lastT = null; return { a, b: s.orders }; })()'''))
            print('jump back from 100 s to 12 s: orders', sc['a'], '->', [o[0] for o in sc['b']])
            if sc['a'] != 9 or sorted(o[0] for o in sc['b']) != ['1', '2']: bad.append('a jump back in time left orders from the later moment')
        if 'replay' in PART:
            # a real replay: fight it out, open the replay, scrub forward and back with the map open
            await ev('document.getElementById("map-close").click()'); await ev('void (__beta.setPlaying(true), __beta.runTo(1800))')
            for i in range(90):
                if await ev('__beta.state() === "result"'): break
                await pg.wait_for_timeout(1000)
            await ev('document.getElementById("r-replay").click()'); await pg.wait_for_timeout(2500); await ev('void (__beta.setPlaying(false), __beta.mapv.cdr.setOn(true), __beta.openMap())')
            async def scrub(v):
                await ev('void ((b => { b.value = %d; b.dispatchEvent(new Event("input")); })(document.getElementById("rp-bar")))' % v); await pg.wait_for_timeout(2000)
                return json.loads(await js('{t: __beta.battle.t, rows: document.querySelectorAll("#cdr-rows .cdr-row").length, want: __beta.battle.commander().plan.length, live: __beta.battle.commander().plan.filter(o => !o.done).length, drawn: __beta.mapv.cdr.state().orders.length, fake: __beta.battle.commander === window.__fakeCommander}'))
            r1 = await scrub(900); r2 = await scrub(15); r3 = await scrub(500); print('replay scrub', r1, r2, r3)
            for r in (r1, r2, r3):
                if not r['fake'] or r['rows'] != r['want'] or r['drawn'] != r['live']: bad.append('after scrubbing the replay the list or the arrows do not match the commander at that time')
            if not (r2['rows'] < r1['rows']): bad.append('scrubbing back did not take orders away')
            await pg.screenshot(path=shot + '_replay.png')
        print('console errors', errs[:5]); print('CDRVIEW CHECK ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
