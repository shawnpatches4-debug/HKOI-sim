# python3 sheet.py <outbase> <kind> [dist] : 4 states x 3 angles pose sheet of one enemy team kind (run with the CSP server up, BASE set) The walk and run rows show the team standing ready to move (the map point does not move here); use seq.py for the movement itself.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
from PIL import Image
POSE = """window.__pose = (kind, mode, phase, ang, dist, h) => { const B = __beta, u = B.battle.units.find(x => x.spec.key === kind), T = B.battle.tank, i = B.battle.units.indexOf(u), tv = B.teams()[i]; const b = Math.atan2(T.e - u.e, T.n - u.n); u.hdg = b * 180 / Math.PI; u.down = mode === "down"; if (mode === "walk" || mode === "run") { u.state = "moving"; u.gait = mode; u.spd = 1; } else { u.state = mode === "fire" ? "guiding" : "hidden"; u.spd = 0; } B.cams.mode = "free"; const a = b + ang * Math.PI / 180, c = B.scene.camera; c.up.set(0, 1, 0); c.fov = 40; c.updateProjectionMatrix(); c.position.copy(B.scene.at(u.e + Math.sin(a) * dist, u.n + Math.cos(a) * dist, h)); c.lookAt(B.scene.at(u.e, u.n, 0.95)); setTimeout(() => { tv.update(0.0001, mode === "walk" || mode === "run" ? mode : mode === "down" ? "down" : "still", true); if (tv.settle) tv.settle(); }   /* settle = finish every blend at once; for pictures of the movement itself use seq.py */, 700); return 1; }"""
async def main():
    out, kind = sys.argv[1], sys.argv[2]; dist = float(sys.argv[3]) if len(sys.argv) > 3 else 4.2
    modes = os.environ.get('MODES', 'still,walk,run,down').split(','); angs = [int(x) for x in os.environ.get('ANGS', '35,100,200').split(',')]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 560, 'height': 420}); errs = []
        pg.on('response', lambda r: r.status >= 400 and errs.append('HTTP %d %s' % (r.status, r.url[-60:]))); pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#gfx=low&spectator=1&speed=1' + os.environ.get('HASH', ''), timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        else: print('NEVER READY', errs[:5], await pg.evaluate('document.getElementById("veil").textContent'))
        for i in range(60):
            if await pg.evaluate('__beta.teams().every(t => t.loaded)'): break
            await pg.wait_for_timeout(1000)
        if os.environ.get('FORCE'): await pg.evaluate('[...document.querySelectorAll("#o-force button")].find(b => b.textContent.includes(%s)).click()' % json.dumps(os.environ['FORCE'])); await pg.wait_for_timeout(500)
        await pg.evaluate('document.getElementById("go").click()'); await pg.wait_for_timeout(1500); await pg.evaluate('__beta.setPlaying(false)')
        await pg.add_style_tag(content='#bar,#status,#log,#units,#marks,#caption,#hud,#esight{display:none!important}'); await pg.evaluate('void (' + POSE + ')'); 0 and print(await pg.evaluate('JSON.stringify([__beta.state(), __beta.battle.units.map(u => u.spec.key + ":" + u.type), !!__beta.battle.tank])'))
        ims = []
        for m in modes:
            for a in angs:
                await pg.evaluate(f"__pose('{kind}','{m}',{os.environ.get('PHASE','0.3')},{a},{dist},{os.environ.get('CAMH','1.5')})"); await pg.wait_for_timeout(2600)
                f = f'{out}_{m}_{a}.png'; await pg.screenshot(path=f, timeout=120000); ims.append(Image.open(f))
        w, h = ims[0].size; S = Image.new('RGB', (w * len(angs), h * len(modes)))
        for i, im in enumerate(ims): S.paste(im, ((i % len(angs)) * w, (i // len(angs)) * h))
        S.save(out + '_sheet.png'); print('sheet', S.size, 'errors', errs[:5]); await b.close()
asyncio.run(main())
