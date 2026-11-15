# python3 tests/beta/command_layout.py <out folder> : the order bar must not sit on anything else.
# One page load; at each window size (1280x720, 1920x1080, 1000x600) and in each display (engineer, simple) it measures the order bar
# (its row and the line above it) against the side panels, the ticker, the control bar and the threat banner, with the bar closed
# and with the "More" pop-up open (the pop-up may cover the ticker while it is open; it must stay inside the window and off the
# control bar). Takes a picture of each. Needs the restricted test server (BASE).
import asyncio, os, sys, json
from playwright.async_api import async_playwright
MEASURE = '''JSON.stringify((() => { const R = q => { const e = document.querySelector(q); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width < 1 || r.height < 1 || cs.display === 'none' || cs.visibility === 'hidden' ? null : [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const hit = (a, b) => a && b && a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1, row = R('#cmd .c-row'), say = R('#cmd .c-say'), more = R('#cmd .c-more'), out = { row, say, more, w: innerWidth, h: innerHeight, buttons: document.querySelectorAll('#cmd .c-row .btn').length, hits: [] };
  for (const q of ['#engleft', '#engright', '#ticker', '#bar', '#threats', '#status', '#caption', '#subs', '#replay']) { const r = R(q); if (!r) continue; if (hit(row, r)) out.hits.push('row on ' + q); if (hit(say, r) && document.querySelector('#cmd .c-say').textContent) out.hits.push('line on ' + q); if (more && (q === '#bar' || q === '#engleft' || q === '#engright') && hit(more, r)) out.hits.push('pop-up on ' + q); }
  for (const [n, r] of [['row', row], ['pop-up', more]]) if (r && (r[0] < 0 || r[1] < 0 || r[2] > innerWidth || r[3] > innerHeight)) out.hits.push(n + ' outside the window');
  return out; })())'''
async def main():
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720}); errs = []; bad = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#gfx=min&demo=0&faces=0&command=player&seed=5&map=3&waves=1&hud=engineer', timeout=120000)
        for i in range(160):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        ev = pg.evaluate
        await ev('void document.getElementById("go").click()'); await pg.wait_for_timeout(1500); await ev('void __beta.setPlaying(false)')
        # an order under way and a few seconds of battle, so the panels, the ticker and the line above the bar all have something in them
        await ev('void (() => { const T = __beta.battle.tank; for (let a = 20; a < 380; a += 30) { const e = Math.round(T.e + Math.sin(a * Math.PI / 180) * 160), n = Math.round(T.n + Math.cos(a * Math.PI / 180) * 160); if (__beta.battle.orderRoute(e, n).ok) { __beta.cmd.give({ k: "move", e, n }); break; } } __beta.playFor(3.6); })()')
        for (w, h) in [(1280, 720), (1920, 1080), (1000, 600)]:
            await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(2500)
            for mode in ['engineer', 'simple']:
                cur = await ev('document.body.classList.contains("hud-eng") ? "engineer" : "simple"')
                if cur != mode: await pg.keyboard.press('h'); await pg.wait_for_timeout(1500)
                await pg.wait_for_timeout(1500); m = json.loads(await ev(MEASURE)); tag = f'{w}x{h}_{mode}'
                print(tag, 'row', m['row'], 'buttons', m['buttons'], 'line', m['say'], '| overlaps:', m['hits'] or 'none')
                if not m['row']: bad.append(tag + ': no order bar')
                bad += [tag + ': ' + x for x in m['hits']]
                if w >= 1280 and m['buttons'] < 9: bad.append(tag + ': the bar is collapsed at a width where it should be one row')
                await pg.screenshot(path=os.path.join(out, f'layout_{tag}.png'), timeout=180000)
                await pg.keyboard.press('o'); await pg.wait_for_timeout(1200); m2 = json.loads(await ev(MEASURE))
                print('   pop-up', m2['more'], '| overlaps:', m2['hits'] or 'none')
                if not m2['more']: bad.append(tag + ': the pop-up did not open')
                if w >= 1280: bad += [tag + ' with the pop-up: ' + x for x in m2['hits'] if 'pop-up' in x]   # narrower than 1280 the open pop-up is allowed over the side panels
                await pg.screenshot(path=os.path.join(out, f'layout_{tag}_more.png'), timeout=180000)
                await pg.keyboard.press('o'); await pg.wait_for_timeout(500)
        print('console errors', errs[:5]); print('ORDER BAR LAYOUT ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
