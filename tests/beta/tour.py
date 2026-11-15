# python3 tests/beta/tour.py <out dir> : the briefing, the scenarios page and the first-run help in the real page (headless, software-drawn).
#   PARTS=title,scen,help,keys   which of the small parts to do (default: none)
#   STEPS=0.1,2.2,2.3            briefing steps to picture, as chapter.step counted from 0 (default: none)
#   GFX=low W=960 H=540          graphics level and window
# Each step is entered through the page's own buttons' code path (brief.go), played by the REAL frame loop to its stopping moment
# (hurried along at four times speed until one second before it, because the software renderer manages about a frame a second),
# pictured, and its labels are listed with where they sit. The run stops by itself before ten minutes are up.
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; PARTS = [x for x in os.environ.get('PARTS', '').split(',') if x]; STEPS = [x for x in os.environ.get('STEPS', '').split(',') if x]
GFX = os.environ.get('GFX', 'low'); W = int(os.environ.get('W', '960')); H = int(os.environ.get('H', '540')); T0 = time.time(); LIMIT = float(os.environ.get('LIMIT', '560'))
left = lambda: LIMIT - (time.time() - T0)
STATE = """JSON.stringify((() => { const g = __beta.guide, b = g.brief, A = g.app, st = b.step; return { on: b.on, ci: b.ci, si: b.si, phase: b.phase, sched: b.sched, want: !!b.want, fault: b.fault, state: A.state, t: A.battle ? +A.battle.t.toFixed(2) : null, to: b.to, playing: A.playing, speed: A.speed, rate: st ? st.rate : null, mode: A.cams.mode, veil: !document.getElementById('tour-veil').hidden, err: !document.getElementById('errbar').hidden ? document.getElementById('errbar').textContent.slice(0, 300) : '' }; })())"""
LABELS = """JSON.stringify((() => { const r = []; for (const e of document.querySelectorAll('#tour .tl')) { if (e.style.display === 'none') continue; const q = e.getBoundingClientRect(); r.push([e.textContent, Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)]); } const c = document.getElementById('tour-card').getBoundingClientRect(); return { labels: r, card: [Math.round(c.left), Math.round(c.top), Math.round(c.width), Math.round(c.height)], head: document.querySelector('#tour-card .th b').textContent, tag: document.querySelector('#tour-card .th i').textContent, rate: document.querySelector('#tour-card .th span').textContent, text: document.querySelector('#tour-card p').textContent, lines: [...document.querySelectorAll('#tour svg g:first-child line')].filter(l => l.style.display !== 'none').length }; })())"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': W, 'height': H}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'GPU stall' not in m.text and '404' not in m.text and errs.append(m.text[:300]))
        costed = False; bad = 0; fresh = 'help' in PARTS   # after the help part (a live battle) the briefing starts from a newly loaded page
        async def ready(hash_):
            await pg.goto('about:blank'); await pg.goto(os.environ['BASE'] + '#' + hash_, timeout=180000);   # (a new address that differs only after the # would not load the page again) await pg.wait_for_function('window.__beta && window.__beta.ready && window.__beta.guide', timeout=400000); print('ready after %.0f s' % (time.time() - T0), flush=True)
        async def shot(name): path = os.path.join(OUT, name + '.png'); await pg.screenshot(path=path, timeout=180000); print('  picture', path, flush=True)
        if 'help' in PARTS:
            await pg.set_viewport_size({'width': 960, 'height': 540})   # the help is always pictured at the small size: it must fit one screen there
            await ready('gfx=min&help=1&play=1'); await pg.wait_for_timeout(4000)
            o = await pg.evaluate("JSON.stringify({ open: !document.getElementById('help').hidden, playing: __beta.guide.app.playing, t: __beta.battle.t, fits: (c => c.scrollHeight <= c.clientHeight + 1)(document.querySelector('#help .card')) })"); print('help', o); await shot('help')
            if not json.loads(o)['fits']: bad += 1; print('FAIL the help does not fit one screen at 960 x 540')
            if not json.loads(o)['open']: bad += 1; print('FAIL the first-run help did not open')
            await pg.evaluate("void document.querySelector('#help .btn.primary').click()"); await pg.wait_for_timeout(3000)
            o = json.loads(await pg.evaluate("JSON.stringify({ open: !document.getElementById('help').hidden, playing: __beta.guide.app.playing, seen: localStorage.getItem('hkoi.help1'), q: !!document.querySelector('#bar .btn[title^=\"How to watch\"], #bar .btn[data-tip^=\"How to watch\"]') })")); print('after Got it', o)
            if o['open'] or not o['playing'] or o['seen'] != 'true' or not o['q']: bad += 1; print('FAIL help did not close, resume, remember or leave its ? button on the bar')
            try:
                await pg.hover('#bar .btn', timeout=20000); await pg.wait_for_timeout(1500); o = json.loads(await pg.evaluate("JSON.stringify({ tip: !document.getElementById('bartip').hidden, text: document.getElementById('bartip').textContent })")); print('bar hint', o); await shot('bar_hint')
                if not o['tip'] or not o['text']: bad += 1; print('FAIL no hint over the bar button')
            except Exception as e: bad += 1; print('FAIL hover', str(e)[:200])
            await pg.keyboard.press('?'); await pg.wait_for_timeout(2500); o = await pg.evaluate("!document.getElementById('help').hidden"); print('? key reopens', o); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1000)
            if not o: bad += 1; print('FAIL the ? key did not reopen the help')
            await pg.set_viewport_size({'width': W, 'height': H})
        if 'title' in PARTS or 'scen' in PARTS or 'keys' in PARTS:
            await ready('gfx=%s&demo=0' % GFX); await pg.wait_for_timeout(3000)
            if 'title' in PARTS:
                o = json.loads(await pg.evaluate("JSON.stringify((() => { const m = document.getElementById('t-main'), r = [...m.querySelectorAll('.mbtn')].map(b => [b.id, Math.round(b.getBoundingClientRect().top), Math.round(b.getBoundingClientRect().bottom)]); return { btns: r, h: innerHeight, scroll: m.scrollHeight > m.clientHeight + 1 }; })())")); print('title', o); await shot('title')
                if not o['btns'] or o['btns'][0][0] != 'o-tour': bad += 1; print('FAIL the briefing is not the first button')
            if 'scen' in PARTS:
                await pg.evaluate("void document.getElementById('o-scen').click()"); await pg.wait_for_timeout(2500)
                o = json.loads(await pg.evaluate("JSON.stringify({ open: !document.getElementById('scen').hidden, cards: document.querySelectorAll('.sc-card').length, title: document.getElementById('title').hidden })")); print('scenarios', o); await shot('scenarios')
                if not o['open'] or o['cards'] < 10: bad += 1; print('FAIL scenarios page')
                await pg.evaluate("void document.querySelector('#scen .sc-foot .btn').click()"); await pg.wait_for_timeout(1500)
                o = json.loads(await pg.evaluate("JSON.stringify({ open: !document.getElementById('scen').hidden, title: !document.getElementById('title').hidden })")); print('back', o)
                if o['open'] or not o['title']: bad += 1; print('FAIL Back did not return to the title')
            if 'keys' in PARTS and left() > 200:   # a scenario as a replay, then the briefing by its button, arrow keys, Esc
                await pg.evaluate("void document.getElementById('o-scen').click()"); await pg.wait_for_timeout(1500)
                await pg.evaluate("void document.querySelector('.sc-card[data-key=open] .btn:not(.go)').click()"); await pg.wait_for_timeout(8000)
                o = json.loads(await pg.evaluate("JSON.stringify({ state: __beta.state(), replay: !document.getElementById('replay').hidden, biome: __beta.set.biome, force: __beta.set.force, T: __beta.guide.app.replay && __beta.guide.app.replay.T })")); print('scenario replay', o); await shot('scenario_replay')
                if o['state'] != 'play' or not o['replay'] or o['force'] != 'sprawling_defence': bad += 1; print('FAIL the scenario did not start as a replay')
        for s in STEPS:
            if left() < 100: print('out of time before step', s); break
            ci, si = [int(x) for x in s.split('.')]
            if fresh or not await pg.evaluate("!!(window.__beta && __beta.guide)"): fresh = False; await ready('gfx=%s&demo=0&tour=%d.%d' % (GFX, ci, si))
            else: await pg.evaluate("void __beta.guide.brief[__beta.guide.brief.on ? 'go' : 'start'](%d, %d)" % (ci, si))
            st = None; t1 = time.time()
            while left() > 25:
                await pg.wait_for_timeout(700); st = json.loads(await pg.evaluate(STATE))
                if st['err'] or st['fault']: break
                if st['ci'] == ci and st['si'] == si and not st['sched'] and not st['want'] and st['phase'] == 'hold': break
                if st['phase'] == 'run' and st['playing'] and st['t'] is not None:
                    rem = st['to'] - st['t']
                    if rem > 1.6 and os.environ.get('JUMP', '1') == '1': await pg.evaluate("void __beta.guide.app.seek(%f)" % (st['to'] - 1.0))   # the page's own jump in time (as the replay bar does), so the slow renderer only has to play the last second
                    else: await pg.evaluate("void (__beta.guide.app.speed = %s)" % ('2' if rem > 0.45 else str(st['rate'])))
            print('step %s after %.0f s: %s' % (s, time.time() - t1, st), flush=True)
            if not st or st['err'] or st['fault'] or st['phase'] != 'hold': bad += 1; print('FAIL step', s, 'did not reach its moment')
            if await pg.evaluate("!!(__beta.guide.brief.step && __beta.guide.brief.step.panel === 'numbers')"):   # the small live run: wait for its table
                try: await pg.wait_for_function("!!document.querySelector('#tour-panel table')", timeout=int(max(5, min(150, left() - 40)) * 1000))
                except Exception: bad += 1; print('FAIL the live run did not finish with a table')
                print('   panel:', (await pg.evaluate("document.getElementById('tour-panel').innerText"))[:900].replace('\n', ' / '))
            await pg.wait_for_timeout(2500); lab = json.loads(await pg.evaluate(LABELS)); print('  ', lab['tag'], '|', lab['head'], '|', lab['rate'], '| lines', lab['lines']); print('  ', lab['text']); print('   labels', lab['labels'], 'card', lab['card'])
            for L in lab['labels']:
                if L[1] < 0 or L[1] + L[3] > W or L[2] < 0 or L[2] + L[4] > lab['card'][1] + 2: bad += 1; print('FAIL label off the picture or over the card', L)
            if lab['card'][1] < H * 0.45: bad += 1; print('FAIL the card covers more than half the picture', lab['card'])
            await shot('tour_%d_%d%s' % (ci, si, os.environ.get('TAG', '')))
            if not costed: costed = True; print('   cost of the briefing, one frame (camera rig, lines, labels), mean of 300: %.3f ms' % (await pg.evaluate("(() => { const b = __beta.guide.brief, t0 = performance.now(); for (let i = 0; i < 300; i++) b.update(0); return (performance.now() - t0) / 300; })()")))
        if 'exit' in PARTS and await pg.evaluate("!!(window.__beta && __beta.guide && __beta.guide.brief.on)"):
            before = await pg.evaluate("JSON.stringify(__beta.set)")
            await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(6000); a = json.loads(await pg.evaluate(STATE)); await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(6000); c = json.loads(await pg.evaluate(STATE)); print('arrow keys', a['ci'], a['si'], '->', c['ci'], c['si'])
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(5000)
            o = json.loads(await pg.evaluate("JSON.stringify({ on: __beta.guide.brief.on, state: __beta.state(), title: !document.getElementById('title').hidden, cls: document.body.classList.contains('tour-on'), hold: __beta.director.hold, set: __beta.set.biome + '/' + __beta.set.force + '/' + __beta.set.map + '/' + __beta.set.spectator, mode: __beta.cams.mode })")); print('after Esc', o); await shot('after_exit')
            if o['on'] or o['state'] != 'title' or not o['title'] or o['cls'] or o['hold']: bad += 1; print('FAIL Esc did not leave the briefing cleanly')
        print('errors', errs[:6]); bad += len(errs)
        print('TOUR PAGE CHECK PASSED' if not bad else 'TOUR PAGE CHECK FAILED: %d' % bad); await b.close()
asyncio.run(main())
