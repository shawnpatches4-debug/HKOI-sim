# The picture set for judging the interior: every seat, the consoles close up, the cutaway, and the live states
# (HKOI engaging, main gun being laid, just fired, reloading). HUD hidden so the interior itself can be judged.
# Use: BASE=http://localhost:<port>/index.html python3 tests/beta/interior_shots.py <out dir> <tag> "<hash params>" [set]
#   set = full (second-pass set: seats in five directions, cupola ports, hatch, periscopes, driver, cutaways) | everything (full + consoles + live)
#       | seats | consoles | live | all (default all) | crew (proposal pictures of crew figures: needs crew=1 in the hash params)
import asyncio, os, sys, json
from playwright.async_api import async_playwright
HELP = """void (window.hud = v => { for (const id of ['status','log','bar','crew','caption','marks','seatcap','hud','replay']) { const e = document.getElementById(id); if (e) e.style.visibility = v ? '' : 'hidden'; } },
  window.lk = (m, y, p, z, off) => { if (__beta.cams.mode !== m) __beta.cams.set(m); __beta.interior.setLook(y, p, z || 1, off || null); },
  window.cutv = (right, fwd, h) => { __beta.cams.set('cut'); __beta.cams.snap = false; const T = __beta.battle.tank, s = __beta.scene, a = T.h * Math.PI / 180, p = s.at(T.e + Math.cos(a) * right + Math.sin(a) * fwd, T.n - Math.sin(a) * right + Math.cos(a) * fwd, 0); s.camera.position.set(p.x, p.y + h, p.z); },
  window.stepTo = f => { const b = __beta.battle; let n = 0; while (!f(b) && b.tank.alive && n++ < 6000) __beta.runTo(b.t + 0.1); return [+b.t.toFixed(1), !!f(b)]; })"""
SEATS = [('gnr', "lk('in_gnr', 0, 0, 1)"), ('cdr', "lk('in_cdr', 0, 0, 1)"), ('cdr_blocks', "lk('in_cdr', 0, 20, 1)"), ('ldr', "lk('in_ldr', 0, 0, 1)"), ('ldr_bustle', "lk('in_ldr', 100, 6, 1)"), ('drv', "lk('in_drv', 0, 0, 1)"),
         ('cut_left', "cutv(-5.2, 2.4, 3.0)"), ('cut_right_high', "cutv(3.6, -3.8, 6.2)")]
CONSOLES = [('gnr_sight', "lk('in_gnr', 0, 2, 2.3)"), ('gnr_panel', "lk('in_gnr', 0, -38, 2.2)"), ('gnr_computer', "lk('in_gnr', 60, -12, 2.6)"), ('cdr_display', "lk('in_cdr', 14, -12, 2.6)"), ('cdr_hkoi', "lk('in_cdr', 82, -12, 2.4)"),
            ('cdr_panel', "lk('in_cdr', 122, -4, 2.6)"), ('ldr_radios', "lk('in_ldr', -150, -6, 2.2)"), ('ldr_netbox', "lk('in_ldr', -108, 6, 2.2)"), ('drv_display', "lk('in_drv', 28, -34, 2.6)"), ('drv_master', "lk('in_drv', -28, -34, 2.6)")]
# The full set asked for by the owner's second pass: every seat forward / left / right / down / up, every observation port of the
# cupola, the hatch positions, every periscope, the driver from his eye and from the side, the cutaway from both sides and above.
def full():
    out = []
    for seat, key in [('gnr', 'in_gnr'), ('cdr', 'in_cdr'), ('ldr', 'in_ldr'), ('drv', 'in_drv')]:
        for name, y, p in [('forward', 0, 0), ('left', -70, 0), ('right', 70, 0), ('down', 0, -40), ('up', 0, 30)]: out.append((f'{seat}_{name}', f"lk('{key}', {y}, {p}, 1)"))
    for i, d in enumerate(['front', 'right_front', 'right', 'right_rear', 'rear', 'left_rear', 'left', 'left_front']): out.append((f'port{i}_{d}', f"(__beta.interior.setCupolaHatch(0, true), lk('in_cdr', {i * 45 + 8 if i < 4 else i * 45 + 8 - 360}, 20, 1))"))
    out += [('cupola_port_front_close', "lk('in_cdr', 8, 20, 2.2)"), ('cupola_hatch_open_protected', "(__beta.interior.setCupolaHatch(1, true), lk('in_cdr', 8, 34, 1))"), ('cupola_hatch_open', "(__beta.interior.setCupolaHatch(2, true), lk('in_cdr', 8, 44, 1))"), ('cupola_hatch_closed_again', "(__beta.interior.setCupolaHatch(0, true), lk('in_cdr', 8, 44, 1))")]
    out += [('periscope_loader', "lk('in_ldr', -46, 29, 2.2)"), ('periscope_gunner_aux', "lk('in_gnr', -33, 25, 2.6)"), ('periscope_gunner_main', "lk('in_gnr', 0, 2, 2.3)")]
    out += [('drv_block_left', "lk('in_drv', -32, 22, 1.8)"), ('drv_block_centre', "lk('in_drv', 0, 22, 1.8)"), ('drv_block_right', "lk('in_drv', 32, 22, 1.8)"), ('drv_tbar_and_displays', "lk('in_drv', 0, -8, 1.3)"), ('drv_display_close', "lk('in_drv', 30, -6, 2.6)"), ('drv_master_close', "lk('in_drv', -30, -6, 2.6)")]
    out += [('drv_from_his_left_shoulder_like_the_photo', "lk('in_drv', 62, -4, 1, [-0.4, 0.0, 0.34])"), ('cut_left', "cutv(-5.2, 2.4, 3.0)"), ('cut_right', "cutv(5.2, 2.0, 3.0)"), ('cut_above', "cutv(-0.6, -1.5, 8.5)"), ('cut_front_left_low', "cutv(-3.6, 5.2, 2.0)")]
    return out
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
            n0 = await pg.evaluate('__beta.scene.frameN'); await pg.evaluate('void (' + js + ')')
            for i in range(120):   # the page draws slowly here: wait for four whole frames (camera, small outside views, displays), not for a time
                await pg.wait_for_timeout(500)
                if await pg.evaluate('__beta.scene.frameN') >= n0 + int(os.environ.get('FRAMES', '4')): break
            await pg.screenshot(path=os.path.join(out, f'{tag}_{name}.png'), timeout=180000)
        if which == 'third':   # the short set for the third pass: driver and T-bar, HKOI panel, every port, hatch, finish
            T3 = [('drv_forward', "lk('in_drv', 0, 0, 1)"), ('drv_tbar_close', "lk('in_drv', 0, -14, 1.9)"), ('drv_from_his_left_shoulder_like_the_photo', "lk('in_drv', 62, -4, 1, [-0.4, 0.0, 0.34])")]
            T3 += [(f'port{i}_{d}', f"(__beta.interior.setCupolaHatch(0, true), lk('in_cdr', {i * 45 + 8 if i < 4 else i * 45 + 8 - 360}, 20, 1))") for i, d in enumerate(['front', 'right_front', 'right', 'right_rear', 'rear', 'left_rear', 'left', 'left_front'])]
            T3 += [('hatch_open_protected', "(__beta.interior.setCupolaHatch(1, true), __beta.interior.cupUser = true, lk('in_cdr', 8, 34, 1))"), ('hatch_open', "(__beta.interior.setCupolaHatch(2, true), lk('in_cdr', 8, 44, 1))"), ('cdr_forward', "(__beta.interior.setCupolaHatch(0, true), lk('in_cdr', 0, 0, 1))"),
                   ('cdr_hkoi_close', "lk('in_cdr', 82, -10, 2.4)"), ('cdr_hkoi_crew_page', "(__beta.interior.hkPage = 2, lk('in_cdr', 82, -10, 2.4))"), ('gnr_forward', "(__beta.interior.hkPage = 0, lk('in_gnr', 0, 0, 1))"), ('gnr_left', "lk('in_gnr', -70, 0, 1)"), ('gnr_aux_sight', "lk('in_gnr', -33, 25, 2.6)"),
                   ('ldr_forward', "lk('in_ldr', 0, 0, 1)"), ('ldr_periscope', "lk('in_ldr', -46, 29, 2.2)"), ('cut_left', "cutv(-5.2, 2.4, 3.0)"), ('cut_above', "cutv(-0.6, -1.5, 8.5)")]
            for name, js in T3: await shot('third_' + name, js)
            await pg.evaluate("void (lk('in_drv', 0, -6, 1.3), __beta.setPlaying(true))")
            for i in range(4): await pg.wait_for_timeout(4500); print('drive', await pg.evaluate('JSON.stringify({t: +__beta.battle.t.toFixed(1), v: +(__beta.battle.tank.v || 0).toFixed(1), steer: +__beta.interior.st.steer.toFixed(2), throttle: +__beta.interior.st.thr.toFixed(2), gear: +__beta.interior.st.gear.toFixed(2), hk: __beta.interior.hkState})')); await pg.screenshot(path=os.path.join(out, f'{tag}_third_drv_moving_{i}.png'), timeout=180000)
            await pg.evaluate('void __beta.setPlaying(false)')
            print('stats', await pg.evaluate('JSON.stringify([__beta.interior.stats, __beta.scene.stats().calls, __beta.scene.stats().triangles])'))
        if which == 'cuts':   # the cutaway from every side, at rest and again with the turret laid on a target
            CU = [('left', "cutv(-5.2, 2.4, 3.0)"), ('right', "cutv(5.2, 2.0, 3.0)"), ('above', "cutv(-0.6, -1.5, 8.5)"), ('front_left', "cutv(-3.6, 5.2, 2.0)"), ('rear_right_high', "cutv(3.2, -3.4, 5.6)")]
            for name, js in CU: await shot('cut_' + name, js)
            print('lay', await pg.evaluate('stepTo(b => !!b._rf)'), await pg.evaluate('__beta.tank.turretYaw')); await pg.wait_for_timeout(6000); print('turret', await pg.evaluate('__beta.tank.turretYaw'))
            for name, js in CU: await shot('cut_turned_' + name, js)
            await shot('drv_from_his_left_shoulder_like_the_photo', "lk('in_drv', 62, -4, 1, [-0.4, 0.0, 0.34])"); await shot('drv_forward', "lk('in_drv', 0, 0, 1)")
        if which in ('full', 'everything'):
            for name, js in full(): await shot('full_' + name, js, 3600)
            # the T-bar, twist grip and gear selector while the vehicle moves and turns: a short run of stills from the driver's seat
            await pg.evaluate("void (lk('in_drv', 0, -10, 1.4), __beta.setPlaying(true))")
            for i in range(5): await pg.wait_for_timeout(3500); print('drive', await pg.evaluate('JSON.stringify({t: +__beta.battle.t.toFixed(1), v: +(__beta.battle.tank.v || 0).toFixed(1), steer: +__beta.interior.st.steer.toFixed(2), throttle: +__beta.interior.st.thr.toFixed(2), gear: +__beta.interior.st.gear.toFixed(2)})')); await pg.screenshot(path=os.path.join(out, f'{tag}_full_drv_moving_{i}.png'), timeout=180000)
            await pg.evaluate('void __beta.setPlaying(false)')
            print('stats', await pg.evaluate('JSON.stringify([__beta.interior.stats, __beta.scene.stats().calls, __beta.scene.stats().triangles])'))
        if which in ('all', 'seats'):
            for name, js in SEATS: await shot(name, js)
            print('stats', await pg.evaluate('JSON.stringify([__beta.interior.stats, __beta.scene.stats().calls, __beta.scene.stats().triangles])'))
        if which in ('all', 'consoles', 'everything'):
            for name, js in CONSOLES: await shot('close_' + name, js)
        if which == 'crew':   # proposal pictures only (the page must be opened with crew=1): wait for the four figures, then look at them
            await pg.evaluate("void lk('in_ldr', 0, 0, 1)")
            for i in range(80):
                if await pg.evaluate('!!(__beta.interior.crew && __beta.interior.crew.length)'): break
                await pg.wait_for_timeout(1500)
            print('crew figures', await pg.evaluate('__beta.interior.crew ? __beta.interior.crew.length : 0'))
            for name, js in [('crew_from_ldr', "lk('in_ldr', 10, -8, 1)"), ('crew_from_cdr', "lk('in_cdr', -20, -24, 1)"), ('crew_from_gnr', "lk('in_gnr', 150, -5, 1)"), ('crew_cut_left', "cutv(-4.6, 2.0, 2.8)"), ('crew_cut_right_high', "cutv(3.2, -3.4, 5.6)"), ('crew_cut_front', "cutv(-2.5, 5.5, 3.0)")]: await shot(name, js)
        if which in ('all', 'live', 'everything'):
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
