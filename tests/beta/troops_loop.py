# python3 tests/beta/troops_loop.py <out.png> : the real frame loop with the "Enemy close-up" camera kept on an enemy team (a moving one
# whenever there is one) until at least SIM (default 60) seconds of battle have gone by. Prints what the teams were doing and any error:
# the red error bar, page errors, and a team whose figures stopped moving because of a fault (TeamView._err).
# Run with the restricted server up and BASE set (see tools/dev.sh).
import asyncio, os, sys, json
from playwright.async_api import async_playwright
PICK = """(() => { const B = __beta, U = B.battle.units, T = B.teams(); let u = U.find(x => x.alive && x.state === 'moving' && (x.spd || 0) > 0.2) || U.find(x => x.alive && x.state === 'moving') || U.find(x => x.alive && (x.state === 'setup' || x.down)) || B.cams.unit || U.find(x => x.alive);
  if (u && B.cams.unit !== u) { B.cams.unit = u; B.cams.snap = true; }
  const eb = document.getElementById('errbar');
  return { t: +B.battle.t.toFixed(1), watching: u ? u.spec.key + ':' + u.state + (u.down ? ':down' : '') + ' spd ' + (u.spd || 0).toFixed(1) : null, doing: T.map(t => t.act || '-').join(','), dead: U.filter(x => !x.alive).length,
    bar: eb && !eb.hidden ? eb.textContent.slice(0, 300) : null, team_faults: T.filter(t => t._err).map(t => String(t._err.stack || t._err).slice(0, 300)) }; })()"""
async def main():
    need = float(os.environ.get('SIM', '60')); out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/troops_loop.png'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '480')), 'height': int(os.environ.get('H', '270'))}); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'] + '#gfx=min&spectator=1&speed=4&force=heavy' + os.environ.get('HASH', ''), timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        for i in range(60):
            if await pg.evaluate('__beta.teams().every(t => t.loaded)'): break
            await pg.wait_for_timeout(1000)
        await pg.evaluate('document.getElementById("go").click()'); await pg.wait_for_timeout(1000); await pg.evaluate("__beta.cams.set('troops')")
        t0 = None; seen = set(); bad = []; shot = False
        for k in range(int(os.environ.get('POLLS', '90'))):
            await pg.wait_for_timeout(4000); r = await pg.evaluate(PICK)
            if t0 is None: t0 = r['t']
            for a in r['doing'].split(','): seen.add(a)
            if r['bar']: bad.append(r['bar'])
            bad += r['team_faults']
            if k % 4 == 0: print(json.dumps(r))
            if not shot and r['watching'] and 'moving' in r['watching'] and 'spd 0.0' not in r['watching']: await pg.screenshot(path=out, timeout=120000); shot = True
            if r['t'] - t0 >= need or bad: break
        if not shot: await pg.screenshot(path=out, timeout=120000)
        print('simulated seconds', round(r['t'] - t0, 1), 'things the teams were seen doing', sorted(seen), 'faults', bad[:3], 'errors', errs[:6]); await b.close()
asyncio.run(main())
