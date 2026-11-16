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
        costed = False; bad = 0; fresh = 'help' in PARTS or 'keys' in PARTS   # after the help part (a live battle) the briefing starts from a newly loaded page
        async def ready(hash_):
            await pg.goto('about:blank'); await pg.goto(os.environ['BASE'] + '#' + hash_, timeout=180000);   # (a new address that differs only after the # would not load the page again) await pg.wait_for_function('window.__beta && window.__beta.ready && window.__beta.guide', timeout=400000); print('ready after %.0f s' % (time.time() - T0), flush=True)
        async def shot(name): path = os.path.join(OUT, name + '.png'); await pg.screenshot(path=path, timeout=180000); print('  picture', path, flush=True)
        if 'help' in PARTS:
            HW, HH = int(os.environ.get('HELP_W', '960')), int(os.environ.get('HELP_H', '540')); await pg.set_viewport_size({'width': HW, 'height': HH})   # the help is pictured at the small size by default (it must fit one screen there); HELP_W/HELP_H for others
            await ready('gfx=min&help=1&play=1'); await pg.wait_for_timeout(4000)
            o = await pg.evaluate("JSON.stringify({ open: !document.getElementById('help').hidden, playing: __beta.guide.app.playing, t: __beta.battle.t, fits: (c => c.scrollHeight <= c.clientHeight + 1)(document.querySelector('#help .card')) })"); print('help', o); await shot('help_%dx%d' % (HW, HH))
            if not json.loads(o)['fits']: bad += 1; print('FAIL the help does not fit one screen at %d x %d' % (HW, HH))
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
                o = json.loads(await pg.evaluate("JSON.stringify({ open: !document.getElementById('scen').hidden, cards: document.querySelectorAll('.sc-card').length, title: document.getElementById('title').hidden, scroll: (c => [c.scrollHeight, c.clientHeight])(document.querySelector('#scen .card')), wide: (c => c.scrollWidth <= c.clientWidth + 1)(document.querySelector('#scen .card')), cols: getComputedStyle(document.querySelector('.sc-grid')).gridTemplateColumns.split(' ').length })")); print('scenarios', o); await shot('scenarios_%dx%d' % (W, H))
                if not o['wide']: bad += 1; print('FAIL the scenarios page scrolls sideways')
                if o['scroll'][0] > o['scroll'][1] + 1: await pg.evaluate("void (document.querySelector('#scen .card').scrollTop = 1e6)"); await pg.wait_for_timeout(1200); await shot('scenarios_%dx%d_end' % (W, H))   # the cards below the fold
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
            aimp = s.startswith('a')   # a0.3, a1.2: the targeting page on its own (aim=part.step); part 0 'How HKOI aims', part 1 'Many at once'
            ci, si = [int(x) for x in s.lstrip('a').split('.')]
            if fresh or not await pg.evaluate("!!(window.__beta && __beta.guide)"): fresh = False; await ready('gfx=%s&demo=0&%s=%d.%d' % (GFX, 'aim' if aimp else 'tour', ci, si))
            elif aimp: await pg.evaluate("void (() => { const g = __beta.guide, b = g.brief, i = g.chapterIndex(%d ? 'order' : 'aim'); if (b.on) b.go(i, %d); else b.start(i, %d, ['aim', 'order']); })()" % (ci, si, si))
            else: await pg.evaluate("void (() => { const b = __beta.guide.brief; if (b.on && b.only) b.stop(); b[b.on ? 'go' : 'start'](%d, %d); })()" % (ci, si))
            if aimp: ci = await pg.evaluate("__beta.guide.chapterIndex(%s)" % ("'order'" if ci else "'aim'"))
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
                t2 = time.time(); done = False
                while not done and time.time() - t2 < max(5, min(170, left() - 40)): await pg.wait_for_timeout(1500); done = await pg.evaluate("!!document.querySelector('#tour-panel table')")
                if not done: bad += 1; print('FAIL the live run did not finish with a table')
                print('   panel:', (await pg.evaluate("document.getElementById('tour-panel').innerText"))[:900].replace('\n', ' / '))
            await pg.wait_for_timeout(2500); lab = json.loads(await pg.evaluate(LABELS)); print('  ', lab['tag'], '|', lab['head'], '|', lab['rate'], '| lines', lab['lines']); print('  ', lab['text']); print('   labels', lab['labels'], 'card', lab['card'])
            for L in lab['labels']:
                if L[1] < 0 or L[1] + L[3] > W or L[2] < 0 or L[2] + L[4] > lab['card'][1] + 2: bad += 1; print('FAIL label off the picture or over the card', L)
            panel = await pg.evaluate("!!(__beta.guide.brief.step && __beta.guide.brief.step.panel)")   # (the numbers step is a table on purpose)
            if lab['card'][1] < H * 0.45 and not panel: bad += 1; print('FAIL the card covers more than half the picture', lab['card'])
            dg = json.loads(await pg.evaluate("JSON.stringify((() => { const d = document.getElementById('tour-diag'), st = __beta.guide.brief.step; if (!st || !st.diagram) return { want: false }; const r = d.getBoundingClientRect(), c = document.getElementById('tour-card').getBoundingClientRect(), h = d.innerHTML; return { want: true, shown: !d.hidden && r.width > 100, hole: /NaN|undefined|Infinity/.test(h), r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], card: Math.round(c.top), scrub: !document.querySelector('#tour-card .sc').hidden }; })())"))
            if dg['want']:
                print('   diagram', dg)
                if not dg['shown'] or dg['hole'] or dg['r'][3] > dg['card'] + 2: bad += 1; print('FAIL the diagram is missing, has a hole, or runs under the card', dg)
            await shot('%s_%d_%d%s' % ('aim' if aimp else 'tour', ci, si, os.environ.get('TAG', '')))
            if not costed: costed = True; print('   cost of the briefing, one frame (camera rig, lines, labels), mean of 300: %.3f ms' % (await pg.evaluate("(() => { const b = __beta.guide.brief, t0 = performance.now(); for (let i = 0; i < 300; i++) b.update(0); return (performance.now() - t0) / 300; })()")))
        if 'scrub' in PARTS and await pg.evaluate("!!(window.__beta && __beta.guide && __beta.guide.brief.on && __beta.guide.brief.span)"):   # drag the time scrubber, then click the diagram's time line
            for frac in (0.2, 0.75):
                await pg.evaluate("void (() => { const i = document.querySelector('#tour-card .sc input'); i.value = %d; i.dispatchEvent(new Event('input')); })()" % int(frac * 1000)); await pg.wait_for_timeout(9000)
                o = json.loads(await pg.evaluate("JSON.stringify((() => { const b = __beta.guide.brief, sp = b.span; return { t: __beta.guide.app.battle.t, want: sp[0] + (sp[1] - sp[0]) * %f, si: b.si, playing: __beta.guide.app.playing, lab: document.querySelector('#tour-card .sc span:last-child').textContent }; })())" % frac))
                print('scrub', frac, o)
                if abs(o['t'] - o['want']) > 0.3 or o['playing']: bad += 1; print('FAIL the scrubber did not move the replay there and hold')
                await shot('scrub_%d' % int(frac * 100))
            r = json.loads(await pg.evaluate("JSON.stringify((() => { const s = document.querySelector('#tour-diag svg'); if (!s) return null; const q = s.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; })())"))
            if r and await pg.evaluate("!!(__beta.guide.brief.step.diagram && __beta.guide.brief.step.diagram.kind === 'aim' && !__beta.guide.brief.step.diagram.compact)"):
                await pg.mouse.click(r[0] + r[2] * (30 + 0.5 * 510) / 560, r[1] + r[3] * 500 / 540); await pg.wait_for_timeout(9000)
                o = json.loads(await pg.evaluate("JSON.stringify({ t: __beta.guide.app.battle.t, D: (() => { const D = __beta.guide.brief.step.diagram.D; return D.T0 + D.tL - 0.5 + 0.5 * (D.end.t + 1.3 - D.tL); })() })")); print('timeline click', o)
                if abs(o['t'] - o['D']) > 0.4: bad += 1; print('FAIL a click on the diagram time line did not move the replay there')
        if 'exit' in PARTS and await pg.evaluate("!!(window.__beta && __beta.guide && __beta.guide.brief.on)"):
            before = await pg.evaluate("JSON.stringify(__beta.set)")
            await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(6000); a = json.loads(await pg.evaluate(STATE)); await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(6000); c = json.loads(await pg.evaluate(STATE)); print('arrow keys', a['ci'], a['si'], '->', c['ci'], c['si'])
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(5000)
            o = json.loads(await pg.evaluate("JSON.stringify({ on: __beta.guide.brief.on, state: __beta.state(), title: !document.getElementById('title').hidden, cls: document.body.classList.contains('tour-on'), hold: __beta.director.hold, set: __beta.set.biome + '/' + __beta.set.force + '/' + __beta.set.map + '/' + __beta.set.spectator, mode: __beta.cams.mode })")); print('after Esc', o); await shot('after_exit')
            if o['on'] or o['state'] != 'title' or not o['title'] or o['cls'] or o['hold']: bad += 1; print('FAIL Esc did not leave the briefing cleanly')
        print('errors', errs[:6]); bad += len(errs)
        print('TOUR PAGE CHECK PASSED' if not bad else 'TOUR PAGE CHECK FAILED: %d' % bad); await b.close()
asyncio.run(main())
