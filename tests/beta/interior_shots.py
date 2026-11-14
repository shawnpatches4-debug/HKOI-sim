# The picture set for judging the interior: every seat, the consoles close up, the cutaway, and the live states
# (HKOI engaging, main gun being laid, just fired, reloading). HUD hidden so the interior itself can be judged.
# Use: BASE=http://localhost:<port>/index.html python3 tests/beta/interior_shots.py <out dir> <tag> "<hash params>" [set]
#   set = seats | consoles | live | all (default all)
import asyncio, os, sys, json
from playwright.async_api import async_playwright
HELP = """void (window.hud = v => { for (const id of ['status','log','bar','crew','caption','marks','seatcap','hud','replay']) { const e = document.getElementById(id); if (e) e.style.visibility = v ? '' : 'hidden'; } },
  window.lk = (m, y, p, z) => { if (__beta.cams.mode !== m) __beta.cams.set(m); const L = __beta.interior.look; L.yaw = y; L.pitch = p; L.zoom = z || 1; },
  window.cutv = (right, fwd, h) => { __beta.cams.set('cut'); __beta.cams.snap = false; const T = __beta.battle.tank, s = __beta.scene, a = T.h * Math.PI / 180, p = s.at(T.e + Math.cos(a) * right + Math.sin(a) * fwd, T.n - Math.sin(a) * right + Math.cos(a) * fwd, 0); s.camera.position.set(p.x, p.y + h, p.z); },
  window.stepTo = f => { const b = __beta.battle; let n = 0; while (!f(b) && b.tank.alive && n++ < 6000) __beta.runTo(b.t + 0.1); return [+b.t.toFixed(1), !!f(b)]; })"""
SEATS = [('gnr', "lk('in_gnr', 0, 0, 1)"), ('cdr', "lk('in_cdr', 0, 0, 1)"), ('cdr_blocks', "lk('in_cdr', 0, 20, 1)"), ('ldr', "lk('in_ldr', 0, 0, 1)"), ('ldr_bustle', "lk('in_ldr', 100, 6, 1)"), ('drv', "lk('in_drv', 0, 0, 1)"),
         ('cut_left', "cutv(-5.2, 2.4, 3.0)"), ('cut_right_high', "cutv(3.6, -3.8, 6.2)")]
CONSOLES = [('gnr_sight', "lk('in_gnr', 0, 2, 2.3)"), ('gnr_panel', "lk('in_gnr', 0, -38, 2.2)"), ('gnr_computer', "lk('in_gnr', 60, -12, 2.6)"), ('cdr_display', "lk('in_cdr', 14, -12, 2.6)"), ('cdr_hkoi', "lk('in_cdr', 82, -12, 2.4)"),
            ('cdr_panel', "lk('in_cdr', 122, -4, 2.6)"), ('ldr_radios', "lk('in_ldr', -150, -6, 2.2)"), ('ldr_netbox', "lk('in_ldr', -108, 6, 2.2)"), ('drv_display', "lk('in_drv', 28, -34, 2.6)"), ('drv_master', "lk('in_drv', -28, -34, 2.6)")]
async def main():
    out, tag, params = sys.argv[1], sys.argv[2], sys.argv[3]; which = sys.argv[4] if len(sys.argv) > 4 else 'all'; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))}); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'] + '#play=1&' + params, timeout=120000)
        for i in range(200):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready && window.__beta.tank.loaded)'): break
            await pg.wait_for_timeout(1500)
        await pg.evaluate(HELP); await pg.evaluate('void (hud(0), __beta.setPlaying(false))'); settle = int(os.environ.get('SETTLE', '4500'))
        async def shot(name, js, wait=None):
            await pg.evaluate('void (' + js + ')'); await pg.wait_for_timeout(wait or settle); await pg.screenshot(path=os.path.join(out, f'{tag}_{name}.png'), timeout=180000)
        if which in ('all', 'seats'):
            for name, js in SEATS: await shot(name, js)
            print('stats', await pg.evaluate('JSON.stringify([__beta.interior.stats, __beta.scene.stats().calls, __beta.scene.stats().triangles])'))
        if which in ('all', 'consoles'):
            for name, js in CONSOLES: await shot('close_' + name, js)
        if which in ('all', 'live'):
            # the main gun being laid on a located team, then just after the shot, then the reload seen from the loader's seat
            print('lay', await pg.evaluate('stepTo(b => !!b._rf)')); await shot('live_gnr_laying', "lk('in_gnr', 0, 0, 1.5)", 9000); await shot('live_cdr_laying', "lk('in_cdr', 30, -14, 1.3)")
            print('fire', await pg.evaluate('(() => { const m = __beta.battle.tank.main; return stepTo(b => b.tank.main < m); })()')); await pg.wait_for_timeout(2500)
            await shot('live_gnr_fired', "(lk('in_gnr', -38, -8, 1), __beta.interior.st.rec = 0.07)"); await shot('live_ldr_recoil', "(lk('in_ldr', 0, 0, 1), __beta.interior.st.rec = 0.07)")
            print('load', await pg.evaluate('stepTo(b => !b.tank.loaded && b.tank.loadT > 1.3)')); await shot('live_ldr_reload_door', "lk('in_ldr', 96, 2, 1)", 7000)
            print('load2', await pg.evaluate('stepTo(b => b.tank.loaded || b.tank.loadT > 4.0)')); await shot('live_ldr_reload_ram', "lk('in_ldr', 10, -4, 1)", 6000)
            # an enemy volley with the HKOI station working: step the battle on in small pieces until its panel says so
            await pg.evaluate("void lk('in_cdr', 82, -12, 2.0)"); print('volley', await pg.evaluate('stepTo(b => b._volleyActive())')); got = None
            for i in range(140):
                await pg.evaluate('void __beta.runTo(__beta.battle.t + 0.2)'); await pg.wait_for_timeout(900); st = await pg.evaluate('JSON.stringify([__beta.interior.hkState, +__beta.battle.t.toFixed(1), __beta.battle._volleyActive(), __beta.interior.warning])')
                if '"FIRING"' in st or '"LAYING"' in st: got = st; break
                if 'false' in st.split(',')[2]: await pg.evaluate('stepTo(b => b._volleyActive())')
            print('hkoi', got or st)
            await pg.screenshot(path=os.path.join(out, f'{tag}_live_cdr_hkoi_engaging.png'), timeout=180000)
            for name, js in [('live_gnr_volley', "lk('in_gnr', 0, 0, 1)"), ('live_ldr_volley', "lk('in_ldr', 0, 0, 1)"), ('live_drv_volley', "lk('in_drv', 0, -6, 1)"), ('live_cdr_volley', "lk('in_cdr', 40, -16, 1)"), ('live_cut_volley', "cutv(-5.0, 2.0, 3.4)")]: await shot(name, js, 3200)
        print('errbar', await pg.evaluate('!document.getElementById("errbar").hidden && document.getElementById("errbar").textContent.slice(0, 400)')); print('errors', errs[:6]); await b.close()
asyncio.run(main())
