# The picture set for judging the interior: every seat, the consoles close up, the cutaway, and the live states
# (HKOI engaging, main gun being laid, just fired, reloading). HUD hidden so the interior itself can be judged.
# Use: BASE=http://localhost:<port>/index.html python3 tests/beta/interior_shots.py <out dir> <tag> "<hash params>" [set]
#   set = full (second-pass set: seats in five directions, cupola ports, hatch, periscopes, driver, cutaways) | everything (full + consoles + live)
#       | seats | consoles | live | all (default all) | crew (proposal pictures of crew figures: needs crew=1 in the hash params)
import asyncio, os, sys, json
from playwright.async_api import async_playwright
HELP = """void (window.hud = v => { for (const id of ['status','log','bar','crew','caption','marks','seatcap','hud','replay']) { const e = document.getElementById(id); if (e) e.style.visibility = v ? '' : 'hidden'; } let st = document.getElementById('nohud'); if (!st) { st = document.createElement('style'); st.id = 'nohud'; document.head.appendChild(st); } st.textContent = v ? '' : ['status','log','logov','bar','crew','caption','marks','seatcap','hud','replay','threats','engleft','engright','crewmen','defences','enemybox','strip','dock','subs','ticker','facerow','gauges','warn','units','map'].map(i => '#' + i).join(',') + ' { visibility: hidden !important; }'; },
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
    out += [('drv_from_his_left_shoulder_like_the_photo', "lk('in_drv', 52, -6, 1, [-0.4, 0.05, 0.1])"), ('cut_left', "cutv(-5.2, 2.4, 3.0)"), ('cut_right', "cutv(5.2, 2.0, 3.0)"), ('cut_above', "cutv(-0.6, -1.5, 8.5)"), ('cut_front_left_low', "cutv(-3.6, 5.2, 2.0)")]
    return out
ONLY = [k for k in os.environ.get('ONLY', '').split(',') if k]
async def main():
    out, tag, params = sys.argv[1], sys.argv[2], sys.argv[3]; which = sys.argv[4] if len(sys.argv) > 4 else 'all'; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        FULL = {'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))}; small = os.environ.get('LOADSMALL') == '1'; state = {'big': not small}
        pg = await b.new_page(viewport={'width': 320, 'height': 180} if small else FULL); errs = []   # LOADSMALL=1: load and stage at a small size (frames are drawn in software here), go to full size for the first picture
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'] + '#play=1&' + params, timeout=120000)
        for i in range(200):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready && window.__beta.tank.loaded)'): break
            await pg.wait_for_timeout(1500)
        await pg.evaluate(HELP); await pg.evaluate('void (hud(0), __beta.setPlaying(false))'); settle = int(os.environ.get('SETTLE', '4500'))
        async def shot(name, js, wait=None):
            if ONLY and not any(k in name for k in ONLY):
                return   # ONLY=a,b: a short run of just the pictures whose names contain one of these
            if not state['big']: state['big'] = True; await pg.set_viewport_size(FULL); await pg.wait_for_timeout(1500)
            for again in range(2 if 'lookThrough(__beta' in js else 1):   # an optic can only be taken up once the interior has seen the new seat (one frame later): ask twice
                n0 = await pg.evaluate('__beta.scene.frameN'); await pg.evaluate('void (' + js + ')')
                for i in range(120):   # the page draws slowly here: wait for four whole frames (camera, small outside views, displays), not for a time
                    await pg.wait_for_timeout(500)
                    if await pg.evaluate('__beta.scene.frameN') >= n0 + int(os.environ.get('FRAMES', '4')): break
            await pg.screenshot(path=os.path.join(out, f'{tag}_{name}.png'), timeout=180000)
        if which == 'third':   # the short set for the third pass: driver and T-bar, HKOI panel, every port, hatch, finish
            T3 = [('drv_forward', "lk('in_drv', 0, 0, 1)"), ('drv_tbar_close', "lk('in_drv', 0, -14, 1.9)"), ('drv_from_his_left_shoulder_like_the_photo', "lk('in_drv', 52, -6, 1, [-0.4, 0.05, 0.1])")]
            T3 += [(f'port{i}_{d}', f"(__beta.interior.setCupolaHatch(0, true), lk('in_cdr', {i * 45 + 8 if i < 4 else i * 45 + 8 - 360}, 20, 1))") for i, d in enumerate(['front', 'right_front', 'right', 'right_rear', 'rear', 'left_rear', 'left', 'left_front'])]
            T3 += [('hatch_open_protected', "(__beta.interior.setCupolaHatch(1, true), __beta.interior.cupUser = true, lk('in_cdr', 8, 34, 1))"), ('hatch_open', "(__beta.interior.setCupolaHatch(2, true), lk('in_cdr', 8, 44, 1))"), ('cdr_forward', "(__beta.interior.setCupolaHatch(0, true), lk('in_cdr', 0, 0, 1))"),
                   ('cdr_hkoi_close', "lk('in_cdr', 74, -6, 2.2)"), ('cdr_hkoi_crew_page', "(__beta.interior.hkPage = 2, lk('in_cdr', 74, -6, 2.2))"), ('gnr_forward', "(__beta.interior.hkPage = 0, lk('in_gnr', 0, 0, 1))"), ('gnr_left', "lk('in_gnr', -70, 0, 1)"), ('gnr_aux_sight', "lk('in_gnr', -33, 25, 2.6)"),
                   ('ldr_forward', "lk('in_ldr', 0, 0, 1)"), ('ldr_periscope', "lk('in_ldr', -46, 29, 2.2)"), ('cut_left', "cutv(-5.2, 2.4, 3.0)"), ('cut_above', "cutv(-0.6, -1.5, 8.5)")]
            for name, js in T3: await shot('third_' + name, js)
            await pg.evaluate("void (lk('in_drv', 0, -6, 1.3), __beta.setPlaying(true))")
            for i in range(4): await pg.wait_for_timeout(4500); print('drive', await pg.evaluate('JSON.stringify({t: +__beta.battle.t.toFixed(1), v: +(__beta.battle.tank.v || 0).toFixed(1), steer: +__beta.interior.st.steer.toFixed(2), throttle: +__beta.interior.st.thr.toFixed(2), gear: +__beta.interior.st.gear.toFixed(2), hk: __beta.interior.hkState})')); await pg.screenshot(path=os.path.join(out, f'{tag}_third_drv_moving_{i}.png'), timeout=180000)
            await pg.evaluate('void __beta.setPlaying(false)')
            print('stats', await pg.evaluate('JSON.stringify([__beta.interior.stats, __beta.scene.stats().calls, __beta.scene.stats().triangles])'))
        if which in ('hits', 'hitsnight', 'crew2'):   # the crew models take a moment to arrive: wait for them before any picture with men in it
            await pg.evaluate("void lk('in_ldr', 0, 0, 1)")
            for i in range(80):
                st = await pg.evaluate('JSON.stringify(__beta.interior.stats)')
                if '"crewReady": true' in st or '"crewReady":true' in st or '"crewFailed":true' in st: break
                await pg.wait_for_timeout(1500)
            print('crew', st)
        if which in ('hits', 'hitsnight'):   # what a hit does inside, and the crew. A real penetrating hit is looked for first; if the battle gives none in time, one is staged (and the file names say so)
            await pg.evaluate("""void (window.stage = (age, kind) => { const b = __beta.battle, T = __beta.THREE; b.interiorHits = [{ T: b.t - age, pen: kind !== 'stop', kill: kind === 'kill', minor: false, s: kind === 'stop' ? 1 : kind === 'kill' ? 2 : 1.6, e: new T.Vector3(1.7, 0.35, -0.3), d: new T.Vector3(-1, -0.03, 0.1).normalize(), comps: kind === 'stop' ? {} : { gps: 'damaged', citv: 'destroyed' }, crew: kind === 'stop' ? {} : { gnr: kind === 'kill' ? 'killed' : 'wounded' }, idx: 7 }]; },
              window.crewAs = o => { const b = __beta.battle; b._cs0 = b._cs0 || b.crewState.bind(b); b.crewState = () => { const s = b._cs0(); s.on = true; s.abandoned = false; for (const r in o) Object.assign(s.who[r], o[r]); return s; }; })""")
            for name, js in [('rest_gnr', "lk('in_gnr', 20, -6, 1)"), ('rest_cdr', "lk('in_cdr', -20, -8, 1)"), ('rest_ldr', "lk('in_ldr', 0, 0, 1)"), ('rest_drv', "lk('in_drv', 0, 0, 1)"), ('rest_drv_shoulder', "lk('in_drv', 52, -6, 1, [-0.4, 0.05, 0.1])"), ('rest_cut_left', "cutv(-5.2, 2.4, 3.0)"), ('rest_cut_above', "cutv(-0.6, -1.5, 8.5)")]: await shot('crew_' + name, js)
            if which == 'hits':
                real = await pg.evaluate("(() => { const b = __beta.battle, I = __beta.interior; let n = 0, h = null; while (!h && b.tank.alive && n++ < 2500) { __beta.runTo(b.t + 0.2); h = I.hitsOf(b).find(x => x.pen && !x.minor); } return h ? { T: h.T, kill: h.kill, zone: h.zone, crew: h.crew, comps: h.comps, t: b.t } : null; })()")
                print('real penetrating hit', json.dumps(real)); tagk = 'real' if real else 'staged'
                for age in [0.06, 2, 20]:
                    if real: await pg.evaluate(f"void __beta.runTo({real['T'] + age})")
                    else: await pg.evaluate(f"void stage({age}, 'pen')")
                    for seat, js in [('gnr', "lk('in_gnr', 30, -6, 1)"), ('cdr', "lk('in_cdr', 30, -10, 1)"), ('ldr', "lk('in_ldr', 0, 0, 1)"), ('drv', "lk('in_drv', 0, 0, 1)")]:
                        if not real: await pg.evaluate(f"void stage({age}, 'pen')")
                        await shot(f'hit_{tagk}_{seat}_{age}s', js)
                    print('state', age, await pg.evaluate('JSON.stringify({smoke: +__beta.interior.smoke.toFixed(2), alarm: __beta.interior.alarm, pulse: __beta.interior.hitPulse, blood: __beta.interior.fxS && __beta.interior.fxS.blood, shake: __beta.interior.fxS && +__beta.interior.fxS.shake.toFixed(2)})'))
                await shot(f'hit_{tagk}_cut_left_20s', "cutv(-5.2, 2.4, 3.0)")
            await shot('hit_staged_stopped_by_armour_cdr', "(stage(0.08, 'stop'), lk('in_cdr', 30, -10, 1))"); await shot('hit_staged_penetration_cut_0.1s', "(stage(0.1, 'pen'), cutv(-5.2, 2.4, 3.0))")
            await shot('crew_staged_gunner_wounded', "(stage(6, 'pen'), crewAs({ gnr: { status: 'wounded', state: 'shaken' } }), lk('in_cdr', -10, -30, 1))")
            await shot('crew_staged_gunner_wounded_from_loader', "lk('in_ldr', 20, -6, 1)")
            await shot('crew_staged_loader_down', "(crewAs({ ldr: { status: 'down' }, gnr: { status: 'ok', state: 'steady' } }), lk('in_cdr', -75, -22, 1))")
            await shot('crew_staged_driver_panicked', "(crewAs({ drv: { state: 'panicked' }, ldr: { status: 'ok' } }), lk('in_drv', 52, -6, 1, [-0.4, 0.05, 0.1]))")
            await shot('crew_staged_all_shaken_cut', "(crewAs({ drv: { state: 'shaken' }, gnr: { state: 'shaken' }, cdr: { state: 'strained' }, ldr: { state: 'panicked' } }), cutv(5.2, 2.0, 3.0))")
            await shot('hit_staged_killing_cdr_3s', "(stage(3, 'kill'), lk('in_cdr', 30, -10, 1))")
            print('stats', await pg.evaluate('JSON.stringify([__beta.interior.stats, __beta.scene.stats().calls, __beta.scene.stats().triangles])'))
        if which == 'crew2':   # staged: a wounded gunner, a downed loader, a panicked driver, with the stains; and smoke in the cutaway
            await pg.evaluate("""void (window.stage = (age, kind, who) => { const b = __beta.battle, T = __beta.THREE, crew = {}; crew[who || 'gnr'] = kind === 'kill' ? 'killed' : 'wounded'; b.interiorHits = [{ T: b.t - age, pen: true, kill: false, minor: false, s: 1.6, e: new T.Vector3(who === 'ldr' ? -1.7 : 1.7, 0.35, who === 'ldr' ? 0.3 : -0.3), d: new T.Vector3(who === 'ldr' ? 1 : -1, -0.03, 0.1).normalize(), comps: { gps: 'damaged' }, crew, idx: 7 }]; },
              window.crewAs = o => { const b = __beta.battle; b._cs0 = b._cs0 || b.crewState.bind(b); b.crewState = () => { const s = b._cs0(); s.on = true; s.abandoned = false; for (const r in o) Object.assign(s.who[r], o[r]); return s; }; })""")
            for name, js in [('gunner_wounded_from_cdr_40s', "(stage(40, 'pen', 'gnr'), crewAs({ gnr: { status: 'wounded', state: 'shaken' } }), lk('in_cdr', 8, -22, 1))"), ('gunner_wounded_from_above_right', "lk('in_gnr', 150, -30, 1, [0.25, 0.25, 0.75])"), ('gunner_own_seat_stains', "lk('in_gnr', 95, -20, 1)"),
                             ('loader_down_from_cdr_40s', "(stage(40, 'kill', 'ldr'), crewAs({ ldr: { status: 'down' }, gnr: { status: 'ok', state: 'steady' } }), lk('in_cdr', -80, -22, 1))"), ('loader_down_from_gnr_side', "lk('in_gnr', -100, -4, 1, [-0.3, 0.2, 0.5])"),
                             ('driver_panicked_shoulder', "(crewAs({ drv: { state: 'panicked' }, ldr: { status: 'ok' } }), lk('in_drv', 52, -6, 1, [-0.4, 0.05, 0.1]))"), ('all_shaken_cut_smoke_3s', "(stage(3, 'pen', 'gnr'), crewAs({ drv: { state: 'shaken' }, gnr: { state: 'shaken', status: 'wounded' }, cdr: { state: 'strained' }, ldr: { state: 'panicked' } }), cutv(5.2, 2.0, 3.0))"), ('cut_above_after_hit', "cutv(-0.6, -1.5, 8.5)"),
                             ('cdr_own_seat_no_arm', "lk('in_cdr', 0, 0, 1)")]: await shot('crew2_' + name, '(' + js + ', __beta.runTo(__beta.battle.t + 0.6), __beta.runTo(__beta.battle.t + 0.6), __beta.runTo(__beta.battle.t + 0.6))')   # the men move on the battle clock: let it run on a little so each picture shows the settled state
        if which == 'strips':   # short runs of stills, a fixed step of battle time apart: a load cycle, a hit, the commander's head moving between his tasks
            await pg.evaluate("void lk('in_ldr', 0, 0, 1)")
            for i in range(80):
                st = await pg.evaluate('JSON.stringify(__beta.interior.stats)')
                if '"crewReady":true' in st or '"crewFailed":true' in st: break
                await pg.wait_for_timeout(1500)
            print('crew', st)
            for i in range(7): await shot(f'strip_head_turn_{i}', f"(__beta.runTo(__beta.battle.t + 0.7), lk('in_ldr', 30, 2, 1.5))")
            print('load', await pg.evaluate('stepTo(b => !b.tank.loaded && b.tank.loadT > 0.2 && !(b.tank.ai && b.tank.ai.ldr && b.tank.ai.ldr.up))'))
            for i in range(9): await shot(f'strip_load_{i}', f"(__beta.runTo(__beta.battle.t + {0.0 if i == 0 else 0.7}), lk('in_cdr', -62, -20, 1))")
            await pg.evaluate("""void (window.stageAt = (T) => { const b = __beta.battle, V = __beta.THREE; b.interiorHits = [{ T, pen: true, kill: false, minor: false, s: 1.6, e: new V.Vector3(1.7, 0.35, -0.3), d: new V.Vector3(-1, -0.03, 0.1).normalize(), comps: { gps: 'damaged' }, crew: { gnr: 'wounded' }, idx: 7 }]; })""")
            T0 = await pg.evaluate('__beta.battle.t + 1.0'); await pg.evaluate(f'void stageAt({T0})')
            for i, dtt in enumerate([0.9, 0.15, 0.25, 0.5, 1.0, 2.5, 8]): await shot(f'strip_hit_{i}', f"(__beta.runTo(__beta.battle.t + {dtt}), lk('in_ldr', 30, 2, 1.2))")
        if which == 'mfd':   # every display straight on and filling the picture: in a quiet moment, then with a missile in the air
            face = lambda seat, key, pre='0': f"({pre}, __beta.cams.mode !== '{seat}' && __beta.cams.set('{seat}'), __beta.interior.lookThrough(null), __beta.interior.faceScreen('{key}'))"
            LIST = [('gnr_sight', 'in_gnr', 'gps', '0'), ('gnr_fire_control', 'in_gnr', 'comp', '0'), ('cdr_display', 'in_cdr', 'citv', '0'), ('hkoi_threats', 'in_cdr', 'hkoi', '__beta.interior.hkPage = 0'), ('hkoi_rounds', 'in_cdr', 'hkoi', '__beta.interior.hkPage = 1'), ('hkoi_crew', 'in_cdr', 'hkoi', '__beta.interior.hkPage = 2'), ('drv_display', 'in_drv', 'drv', '0'), ('ldr_panel', 'in_ldr', 'ldr', '0')]
            await pg.evaluate("void __beta.runTo(__beta.battle.t + 1.5)")
            for nm, seat, key, pre in LIST: await shot(f'mfd_quiet_{nm}', face(seat, key, pre))
            await shot('mfd_quiet_from_gunners_seat', "(__beta.interior.lookThrough(null), lk('in_gnr', 0, 0, 1))"); await shot('mfd_quiet_from_commanders_seat', "lk('in_cdr', 60, -12, 1)")
            print('missile in the air at', await pg.evaluate("JSON.stringify(stepTo(b => { const v = b.volleys[b.volleys.length - 1]; return !!v && v.rec && v.rec.threats.some(th => b.t > v.t0 + th.t0 + 1.2 && b.t < v.t0 + (th.viz.end ? th.viz.end.t : 0) - 1.0); }))"))
            for nm, seat, key, pre in LIST:
                if 'crew' in nm or 'rounds' in nm: continue
                await shot(f'mfd_missile_{nm}', face(seat, key, pre))
            await shot('mfd_missile_from_commanders_seat', "(__beta.interior.lookThrough(null), lk('in_cdr', 60, -12, 1))")
            print('hkoi', await pg.evaluate("JSON.stringify({hk: __beta.interior.hkState, warning: __beta.interior.warning, calls: __beta.scene.renderer.info.render.calls, tris: __beta.scene.renderer.info.render.triangles})"))
        if which == 'optics':   # every periscope and vision block: from the seat, then with the eye put to it
            opt = lambda seat, find, pre='0': f"({pre}, __beta.cams.mode !== '{seat}' && __beta.cams.set('{seat}'), __beta.interior.lookThrough(null), __beta.interior.lookThrough(__beta.interior.controls.find(c => c.optic && {find})))"
            few = os.environ.get('FEW') == '1'
            await pg.evaluate("void (__beta.interior.cupUser = true, __beta.interior.setCupolaHatch(0, true), __beta.runTo(__beta.battle.t + 1))")
            if not few:
                for nm, js in [('seat_drv_blocks', "lk('in_drv', 0, 18, 1.3)"), ('seat_ldr_periscope', "lk('in_ldr', -46, 29, 1.6)"), ('seat_gnr_aux', "lk('in_gnr', -33, 25, 1.8)"), ('seat_cdr_ports_front', "lk('in_cdr', 8, 20, 1)"), ('seat_cdr_ports_left', "lk('in_cdr', -82, 20, 1)")]: await shot('optic_' + nm, "(__beta.interior.lookThrough(null), " + js + ")")
            for i, nm in enumerate(['left', 'centre', 'right']):
                if few and i != 1: continue
                await shot(f'optic_at_drv_block_{nm}', opt('in_drv', f"c.g === 'hul' && c.optic.yaw === {[-32, 0, 32][i]}"))
            for y in ([0] if few else [-50, 0, 50]): await shot(f'optic_at_ldr_periscope_{y}', opt('in_ldr', "c.optic.kind === 'lp'") + f", __beta.interior.lpYaw = {y}")
            for i, d in enumerate(['front', 'right_front', 'right', 'right_rear', 'rear', 'left_rear', 'left', 'left_front']):
                if few and i != 0: continue
                await shot(f'optic_at_cdr_port{i}_{d}', opt('in_cdr', f"c.optic.ring === {i}"))
            await shot('optic_at_gnr_aux', opt('in_gnr', "c.optic.kind === 'gas'"))
            print('at an optic', await pg.evaluate("JSON.stringify({calls: __beta.scene.renderer.info.render.calls, tris: __beta.scene.renderer.info.render.triangles, sightCalls: __beta.interior.stats.sightCalls})"))
            if not few:
                print('missile in the air at', await pg.evaluate("JSON.stringify(stepTo(b => { const v = b.volleys[b.volleys.length - 1]; return !!v && v.rec && v.rec.threats.some(th => b.t > v.t0 + th.t0 + 1.5 && b.t < v.t0 + (th.viz.end ? th.viz.end.t : 0) - 0.8); }))"))
                ring = await pg.evaluate("(() => { const I = __beta.interior, m = (__beta.volleys || {}).info; const inf = (I.s && I.s.volleyInfo) || []; const b = __beta.battle, v = b.volleys[b.volleys.length - 1]; const l = v && v.launches && v.launches[0]; const brg = l ? l.brg : 0; return ((Math.round((((brg - (I.turBrg || 0)) % 360) + 360) % 360 / 45)) % 8); })()")
                print('threat toward port', ring); await shot('optic_missile_through_cdr_port', opt('in_cdr', f"c.optic.ring === {ring}")); await shot('optic_missile_through_ldr_periscope', opt('in_ldr', "c.optic.kind === 'lp'")); await shot('optic_missile_drv_centre', opt('in_drv', "c.g === 'hul' && c.optic.yaw === 0"))
            await pg.evaluate("void __beta.interior.lookThrough(null)")
        if which == 'cdrhatch':   # the commander's hatch in its three states: his own view forward, to each side and back, and close views of the cupola from outside
            await pg.evaluate("void lk('in_cdr', 0, 10, 1)")
            for i in range(80):
                st = await pg.evaluate('JSON.stringify(__beta.interior.stats)')
                if '"crewReady":true' in st or '"crewFailed":true' in st: break
                await pg.wait_for_timeout(1500)
            print('crew', st)
            await pg.evaluate("void (window.cupv = (dist, up, off) => { const s = __beta.scene, c = s.camera, V = __beta.THREE, tu = __beta.tank.turret; tu.updateWorldMatrix(true, false); const a = off * Math.PI / 180, p = tu.localToWorld(new V.Vector3(-0.52, 1.0, -0.36)), q = tu.localToWorld(new V.Vector3(-0.52 - Math.sin(a) * dist, 1.0 + up, -0.36 + Math.cos(a) * dist)); __beta.cams.mode = 'free'; s.controls.enabled = false; c.up.set(0, 1, 0); c.position.copy(q); c.lookAt(p.x, p.y - 0.15, p.z); })")
            for st, nm in [(0, 'closed'), (1, 'open_protected'), (2, 'open')]:
                await pg.evaluate(f"void (__beta.interior.cupUser = true, __beta.interior.setCupolaHatch({st}, true))")
                for vn, y, p in [('fwd', 0, 10), ('right', 90, 10), ('left', -90, 10), ('rear', 178, 10), ('down', 0, -30)]:
                    await shot(f'cdr_{nm}_eye_{vn}', f"lk('in_cdr', {y}, {p}, 1)")
                    if vn == 'fwd': print(nm, await pg.evaluate("JSON.stringify((() => { const I = __beta.interior, e = I.tur.worldToLocal(__beta.scene.camera.position.clone()); return { eye: [+e.x.toFixed(3), +e.y.toFixed(3), +e.z.toFixed(3)], headOut: I.headOut, near: __beta.scene.camera.near, cup1: +I.st.cup1.toFixed(2), cup2: +I.st.cup2.toFixed(2), cap: I.capMode, caps: (I.cap || []).length }; })())"))
                await pg.evaluate('void __beta.runTo(__beta.battle.t + 2)')   # the figures move on the battle clock: let the commander get up (or down) before he is pictured from outside
                for vn, d, u, o in [('front_right', 2.6, 0.9, 50), ('right', 2.4, 0.7, 100), ('rear_right', 2.6, 1.1, 150)]:
                    await shot(f'cdr_{nm}_outside_{vn}', f"cupv({d}, {u}, {o})")
            await pg.evaluate("void (__beta.interior.setCupolaHatch(0, true), __beta.interior.cupUser = false)")
        if which in ('ldrup', 'hatches'):
            await pg.evaluate("void lk('in_ldr', 0, 0, 1)")
            for i in range(80):
                st = await pg.evaluate('JSON.stringify(__beta.interior.stats)')
                if '"crewReady":true' in st or '"crewFailed":true' in st: break
                await pg.wait_for_timeout(1500)
            print('crew', st)
            await pg.evaluate("void (window.outv = (dist, h, off) => { const T = __beta.battle.tank; __beta.near(dist, h, ((T.h || 0) + off + 360) % 360); })")
        if which == 'hatches':   # both hatches in every position, from inside and from outside
            for st, nm in [(0, 'closed'), (1, 'open_protected'), (2, 'open')]:
                await pg.evaluate(f"void (__beta.interior.cupUser = true, __beta.interior.setCupolaHatch({st}, true))")
                await shot(f'hatch_cdr_{nm}_inside', "lk('in_cdr', 8, 42, 1)"); await shot(f'hatch_cdr_{nm}_inside_rear', "lk('in_cdr', 178, 30, 1)"); await shot(f'hatch_cdr_{nm}_from_loader', "lk('in_ldr', 40, 26, 1)")
                await shot(f'hatch_cdr_{nm}_outside', "outv(5.5, 3.6, 150)"); await shot(f'hatch_cdr_{nm}_outside_close', "outv(3.4, 3.2, 20)")
            await pg.evaluate("void __beta.interior.setCupolaHatch(0, true)")
            await shot('hatch_ldr_closed_inside', "lk('in_ldr', -60, 55, 1)")
        if which == 'ldrup':   # the loader opening his hatch, climbing up, firing his machine gun and coming down
            real = None   # staged: the battle itself often calls him down again within a second, which is no use for a strip of the whole act
            print('loader goes up at', real); tagk = 'real' if real is not None else 'staged'
            if real is None: await pg.evaluate("void (window.forceUp = true, (() => { const L = __beta.battle.tank.ai.ldr; Object.defineProperty(L, 'up', { get: () => window.forceUp, set() {}, configurable: true }); window.spEnd = 1e9; const sp = [__beta.battle.t, 1e9]; Object.defineProperty(sp, 1, { get: () => window.spEnd, set() {} }); L.upAt = [sp]; })())")
            await pg.evaluate("void (window.T0 = __beta.battle.t, window.fire = () => { const b = __beta.battle, T = b.tank, a = (((__beta.interior.turBrg || T.h || 0)) - 35) * Math.PI / 180, rec = { t: b.t - 0.3, dur: 8, w: 'm240', m240: true, id: -1, e: T.e + Math.sin(a) * 400, n: T.n + Math.cos(a) * 400, R: 400 }; b._mg = rec; (b.mgs = b.mgs || []).push(rec); })")   # staged: a burst 35 degrees left of the turret's line, also put in the list of bursts (the battle's own next burst of another gun replaces _mg)
            # outside, from the turret's own left-front quarter (relative to the TURRET's bearing), a little above the man, looking at him
            await pg.evaluate("void (window.ldrv = (dist, up, off) => { const I = __beta.interior, s = __beta.scene, c = s.camera, V = __beta.THREE; const eye = I.mgEyeT ? I.tur.localToWorld(I.mgEyeT.clone()) : __beta.tank.group.localToWorld(new V.Vector3(0.8, 2.8, -0.5)); const a = ((I.turBrg || 0) + off) * Math.PI / 180; __beta.cams.mode = 'free'; s.controls.enabled = false; c.up.set(0, 1, 0); c.position.set(eye.x + Math.sin(a) * dist, eye.y + up, eye.z - Math.cos(a) * dist); c.lookAt(eye.x, eye.y - 0.3, eye.z); })")
            UP = [0.05, 0.35, 0.6, 0.85, 1.1, 1.4, 1.7, 2.0, 2.3, 2.75, 3.3, 4.1]
            for i, dtt in enumerate(UP):
                await shot(f'ldr_{tagk}_first_person_{i:02d}_{dtt}s', f"(__beta.runTo(T0 + {dtt}), lk('in_ldr', 0, 0, 1))")
                if i in (3, 6, 9, 11): await shot(f'ldr_{tagk}_from_cdr_{i:02d}_{dtt}s', "lk('in_cdr', -84, -20, 1)"); await shot(f'ldr_{tagk}_from_gnr_{i:02d}_{dtt}s', "lk('in_gnr', -120, 22, 1)"); await shot(f'ldr_{tagk}_outside_{i:02d}_{dtt}s', "outv(5.0, 3.4, 215)")
                if not ONLY or any(k in f'first_person_{i:02d}_' for k in ONLY): print('U', dtt, await pg.evaluate('JSON.stringify({U: +__beta.interior.st.ldrU.toFixed(2), lid: +__beta.interior.st.hatch.toFixed(2), mode: __beta.interior.mode, headOut: __beta.interior.headOut, loaded: __beta.battle.tank.loaded})'))
            await pg.evaluate("void __beta.runTo(Math.max(__beta.battle.t, T0 + 4.6))")   # all the way up (the pictures of the climb may have been skipped)
            staged_fire = await pg.evaluate("(() => { fire(); return true; })()"); print('burst staged:', staged_fire)
            await pg.evaluate("void __beta.runTo(__beta.battle.t + 1.2)")   # the gun laid on the target
            for pre in [q for q in os.environ.get('PRE', '').split('|') if q]:   # tests only: extra pictures after a piece of page code (e.g. hiding one crew figure)
                await shot(f'ldr_{tagk}_firing_first_person_pre{abs(hash(pre)) % 1000}', "(" + pre + ", lk('in_ldr', 0, 0, 1))"); print('PRE', abs(hash(pre)) % 1000, pre)
            await shot(f'ldr_{tagk}_firing_first_person', "lk('in_ldr', 0, 0, 1)");
            if os.environ.get('PICK'):   # what lies under given points of the picture (NDC x,y pairs): names up the parent chain of the first hits
                print('PICK', await pg.evaluate("JSON.stringify((" + os.environ['PICK'] + ").map(([x, y]) => { const V = __beta.THREE, s = __beta.scene, r = new V.Raycaster(); r.setFromCamera(new V.Vector2(x, y), s.camera); return r.intersectObjects(s.scene.children, true).filter(h => h.object.visible).slice(0, 3).map(h => { const n = []; let o = h.object; while (o && n.length < 6) { n.push((o.name || o.type) + (o.visible ? '' : '(hid)')); o = o.parent; } return [+h.distance.toFixed(2), n.join(' < ')]; }); }))"))
            await shot(f'ldr_{tagk}_firing_from_cdr', "lk('in_cdr', -84, -20, 1)"); await shot(f'ldr_{tagk}_firing_outside', "outv(5.0, 3.4, 215)")
            await shot(f'ldr_{tagk}_firing_outside_front', "ldrv(4.5, 0.7, -40)"); await shot(f'ldr_{tagk}_firing_outside_close', "ldrv(2.6, 0.45, -70)")   # from the turret's own left-front quarter, a little above
            print('firing', await pg.evaluate('(() => { const I = __beta.interior, f = I.crewFig && I.crewFig.men && I.crewFig.men.ldr, r = v => v && v.toArray().map(x => +x.toFixed(2)); return JSON.stringify({ firing: I.mgFiring, mgYaw: +I.st.mgYaw.toFixed(1), mgPitch: +(I.mgPitch || 0).toFixed(1), U: +I.st.ldrU.toFixed(2), mode: I.mode, ring: !!I.mgPivot, eye: r(I.mgEyeT), hands: I.mgHandT && I.mgHandT.map(r), muzzle: __beta.tank.m240Tip && r(__beta.tank.m240Tip.getWorldPosition(new __beta.THREE.Vector3())), crewReady: I.crewFig && I.crewFig.ready, ldrShown: f ? f.g.visible : null, handErr: f && f.handErr }); })()'))
            if real is None: await pg.evaluate("void (window.forceUp = false, window.T1 = __beta.battle.t, window.spEnd = __beta.battle.t)")
            else: print('comes down at', await pg.evaluate("(() => { const b = __beta.battle; let n = 0; while (b.tank.ai.ldr.up && b.tank.alive && n++ < 3000) __beta.runTo(b.t + 0.1); window.T1 = b.t; return +b.t.toFixed(1); })()"))
            for i, dtt in enumerate([0.3, 0.7, 1.1, 1.5, 2.0]): await shot(f'ldr_{tagk}_down_first_person_{i}_{dtt}s', f"(__beta.runTo(T1 + {dtt}), lk('in_ldr', 0, 0, 1))")
            await shot(f'ldr_{tagk}_down_from_cdr', "lk('in_cdr', -84, -20, 1)")
        if which == 'station':   # the HKOI weapon station on the roof: from four sides and above, then from the loader's and the commander's head-out views (both men up, both lids open)
            await pg.evaluate("""void (window.outv = (right, fwd, h, ty) => { const C = __beta.cams, T = __beta.battle.tank, s = __beta.scene, a = (T.h + (__beta.tank.turretYaw || 0)) * Math.PI / 180; if (s.fx && s.fx.clear) s.fx.clear(); C.set('orbit'); C.mode = 'free';   /* right, fwd: metres in the TURRET's frame, so the pictures compare whatever way it is turned; battle effects cleared */ s.controls.enabled = false; const p = s.at(T.e + Math.cos(a) * right + Math.sin(a) * fwd, T.n - Math.sin(a) * right + Math.cos(a) * fwd, 0), q = s.at(T.e, T.n, 0); s.camera.fov = 32; s.camera.updateProjectionMatrix(); s.camera.position.set(p.x, q.y + h, p.z); s.camera.up.set(0, 1, 0); s.camera.lookAt(q.x, q.y + (ty == null ? 2.5 : ty), q.z); },
              window.aimAt = (x, y, z) => { const k = __beta.tank; if (!k._as) k._as = k.aimStation; const p = k.group.localToWorld(new __beta.THREE.Vector3(x, y, z)); for (let i = 0; i < 30; i++) k._as.call(k, p, 0.4); k.aimStation = () => {}; },   /* lay the station on a point given in the tank's own frame (left, up, forward) and hold it there for the picture */
              window.forceUp = true, (() => { const L = __beta.battle.tank.ai.ldr; Object.defineProperty(L, 'up', { get: () => window.forceUp, set() {}, configurable: true }); const sp = [__beta.battle.t - 10, 1e9]; L.upAt = [sp]; })(), __beta.interior.cupUser = true, __beta.interior.setCupolaHatch(2, true))""")
            for i in range(40):   # the loader's climb is drawn frame by frame: wait until he stands behind his gun
                if await pg.evaluate('__beta.interior.st.ldrU') > 0.98: break
                await pg.wait_for_timeout(1500)
            print('station', await pg.evaluate("JSON.stringify((() => { const k = __beta.tank; return { at: k.rws ? k.rws.position.toArray().map(v => +v.toFixed(3)) : null, roof: k.rwsRoof, spec: k.stationSpec || null, ldrU: __beta.interior.st.ldrU, tur: __beta.battle.tank.tur, turretYaw: k.turretYaw }; })())"))
            for name, js in [('out_left', "outv(-9, 0.5, 3.4)"), ('out_right', "outv(9, 0.5, 3.4)"), ('out_front', "outv(0.5, 9, 3.6)"), ('out_rear', "outv(-0.5, -9, 4.2)"), ('out_above', "outv(-0.4, -2.2, 11, 2.2)"), ('out_left_rear_high', "outv(-6, -6, 6)"),
                             ('ldr_out_fwd', "lk('in_ldr', 0, 0, 1)"), ('ldr_out_back', "lk('in_ldr', 150, 0, 1)"), ('ldr_out_left', "lk('in_ldr', -90, 0, 1)"), ('cdr_out_fwd', "lk('in_cdr', 0, 44, 1)"), ('cdr_out_left', "lk('in_cdr', -90, 44, 1)"), ('cdr_out_left_rear', "lk('in_cdr', -140, 44, 1)"), ('cdr_out_rear', "lk('in_cdr', 180, 44, 1)"),
                             ('aim_right_front', "(aimAt(-300, 2, 300), outv(-6, -6, 6))"), ('aim_high_left', "(aimAt(300, 250, 60), outv(-7, 2, 4.5))"), ('aim_rear_over_aerial', "(aimAt(40, 2, -300), outv(-7, -5, 5))")]: await shot('station_' + name, js)
        if 'sights' in which:   # the three sight pictures: at rest, laid on a target, at the shot, thermal; the viewer; the HKOI sight on a track
            await pg.evaluate("void (window.hud = () => {}, document.getElementById('nohud') && (document.getElementById('nohud').textContent = ''))")
            async def frames(n=3):
                n0 = await pg.evaluate('__beta.scene.frameN')
                for i in range(120):
                    await pg.wait_for_timeout(500)
                    if await pg.evaluate('__beta.scene.frameN') >= n0 + n: break
            async def snap(name): await frames(); await pg.screenshot(path=os.path.join(out, f'{tag}_sight_{name}.png'), timeout=180000)
            await pg.evaluate("void __beta.cams.set('gnr')"); await snap('gnr_rest_day')
            got = await pg.evaluate("(() => { const b = __beta.battle; let n = 0; while (!(b._rf || (b._vxs && b._vxs.rfv)) && b.tank.alive && n++ < 4000) __beta.runTo(b.t + 0.1); const L = b._rf || (b._vxs && b._vxs.rfv); return L ? { t: b.t, at: L.at, veh: !!(b._vxs && b._vxs.rfv) } : null; })()")
            print('lay', json.dumps(got))
            if got:
                await pg.evaluate(f"void __beta.runTo({got['at']} - 1.2)"); await frames(6); await snap('gnr_laid_day'); print('gnr', await pg.evaluate("JSON.stringify(['sg-top','sg-rng','sg-ammo','sg-rdy','sg-lead','sg-line'].map(i => document.getElementById(i).textContent))"))
                await pg.keyboard.press('t'); await snap('gnr_laid_thermal')
                shot = await pg.evaluate("(() => { const b = __beta.battle, n0 = (b.events || []).filter(e => e.type === 'gun').length; let n = 0; while ((b.events || []).filter(e => e.type === 'gun').length === n0 && b.tank.alive && n++ < 600) __beta.runTo(b.t + 0.05); const e = (b.events || []).filter(e => e.type === 'gun').pop(); return e ? { t: e.t, now: b.t } : null; })()")
                print('shot', json.dumps(shot))
                if shot:
                    for dt_, nm in [(0.12, 'gnr_shot_0.1s_thermal'), (0.6, 'gnr_shot_0.6s_thermal')]: await pg.evaluate(f"void __beta.runTo({shot['t']} + {dt_})"); await snap(nm)
                    await pg.keyboard.press('t'); await pg.keyboard.press('t'); await pg.evaluate(f"void __beta.runTo({shot['t']} + 1.4)"); await snap('gnr_shot_1.4s_day'); print('gnr', await pg.evaluate("JSON.stringify(['sg-top','sg-rng','sg-line'].map(i => document.getElementById(i).textContent))"))
            await pg.evaluate("void __beta.cams.set('citv')"); await snap('citv'); await pg.keyboard.press('t'); await snap('citv_black_hot')
            await pg.evaluate("void __beta.cams.set('hkoi')"); await snap('hkoi_rest')
            trk = await pg.evaluate("(() => { const b = __beta.battle, has = k => (b.events || []).filter(e => e.type === k && e.t >= b.t - 0.01).pop(); let n = 0; while (!has('hkoi_fire') && b.tank.alive && n++ < 6000) __beta.runTo(b.t + 0.1); const e = has('hkoi_fire'); return { t: b.t, fire: e ? e.t : null, alive: b.tank.alive }; })()")
            print('track', json.dumps(trk)); await frames(4); await snap('hkoi_firing'); await pg.evaluate("void __beta.runTo(__beta.battle.t + 0.6)"); await snap('hkoi_firing_later')
            print('hkoi', await pg.evaluate("JSON.stringify({hk: __beta.interior.hkState, warning: __beta.interior.warning, calls: __beta.scene.renderer.info.render.calls, tris: __beta.scene.renderer.info.render.triangles})"))
        if which == 'optics':   # every periscope and vision block: from the seat, then with the eye put to it
            opt = lambda seat, find, pre='0': f"({pre}, __beta.cams.mode !== '{seat}' && __beta.cams.set('{seat}'), __beta.interior.lookThrough(null), __beta.interior.lookThrough(__beta.interior.controls.find(c => c.optic && {find})))"
            few = os.environ.get('FEW') == '1'
            await pg.evaluate("void (__beta.interior.cupUser = true, __beta.interior.setCupolaHatch(0, true), __beta.runTo(__beta.battle.t + 1))")
            if not few:
                for nm, js in [('seat_drv_blocks', "lk('in_drv', 0, 18, 1.3)"), ('seat_ldr_periscope', "lk('in_ldr', -46, 29, 1.6)"), ('seat_gnr_aux', "lk('in_gnr', -33, 25, 1.8)"), ('seat_cdr_ports_front', "lk('in_cdr', 8, 20, 1)"), ('seat_cdr_ports_left', "lk('in_cdr', -82, 20, 1)")]: await shot('optic_' + nm, "(__beta.interior.lookThrough(null), " + js + ")")
            for i, nm in enumerate(['left', 'centre', 'right']):
                if few and i != 1: continue
                await shot(f'optic_at_drv_block_{nm}', opt('in_drv', f"c.g === 'hul' && c.optic.yaw === {[-32, 0, 32][i]}"))
            for y in ([0] if few else [-50, 0, 50]): await shot(f'optic_at_ldr_periscope_{y}', opt('in_ldr', "c.optic.kind === 'lp'") + f", __beta.interior.lpYaw = {y}")
            for i, d in enumerate(['front', 'right_front', 'right', 'right_rear', 'rear', 'left_rear', 'left', 'left_front']):
                if few and i != 0: continue
                await shot(f'optic_at_cdr_port{i}_{d}', opt('in_cdr', f"c.optic.ring === {i}"))
            await shot('optic_at_gnr_aux', opt('in_gnr', "c.optic.kind === 'gas'"))
            print('at an optic', await pg.evaluate("JSON.stringify({calls: __beta.scene.renderer.info.render.calls, tris: __beta.scene.renderer.info.render.triangles, sightCalls: __beta.interior.stats.sightCalls})"))
            if not few:
                print('missile in the air at', await pg.evaluate("JSON.stringify(stepTo(b => { const v = b.volleys[b.volleys.length - 1]; return !!v && v.rec && v.rec.threats.some(th => b.t > v.t0 + th.t0 + 1.5 && b.t < v.t0 + (th.viz.end ? th.viz.end.t : 0) - 0.8); }))"))
                ring = await pg.evaluate("(() => { const I = __beta.interior, m = (__beta.volleys || {}).info; const inf = (I.s && I.s.volleyInfo) || []; const b = __beta.battle, v = b.volleys[b.volleys.length - 1]; const l = v && v.launches && v.launches[0]; const brg = l ? l.brg : 0; return ((Math.round((((brg - (I.turBrg || 0)) % 360) + 360) % 360 / 45)) % 8); })()")
                print('threat toward port', ring); await shot('optic_missile_through_cdr_port', opt('in_cdr', f"c.optic.ring === {ring}")); await shot('optic_missile_through_ldr_periscope', opt('in_ldr', "c.optic.kind === 'lp'")); await shot('optic_missile_drv_centre', opt('in_drv', "c.g === 'hul' && c.optic.yaw === 0"))
            await pg.evaluate("void __beta.interior.lookThrough(null)")
        if which == 'cdrhatch':   # the commander's hatch in its three states: his own view forward, to each side and back, and close views of the cupola from outside
            await pg.evaluate("void lk('in_cdr', 0, 10, 1)")
            for i in range(80):
                st = await pg.evaluate('JSON.stringify(__beta.interior.stats)')
                if '"crewReady":true' in st or '"crewFailed":true' in st: break
                await pg.wait_for_timeout(1500)
            print('crew', st)
            await pg.evaluate("void (window.cupv = (dist, up, off) => { const s = __beta.scene, c = s.camera, V = __beta.THREE, tu = __beta.tank.turret; tu.updateWorldMatrix(true, false); const a = off * Math.PI / 180, p = tu.localToWorld(new V.Vector3(-0.52, 1.0, -0.36)), q = tu.localToWorld(new V.Vector3(-0.52 - Math.sin(a) * dist, 1.0 + up, -0.36 + Math.cos(a) * dist)); __beta.cams.mode = 'free'; s.controls.enabled = false; c.up.set(0, 1, 0); c.position.copy(q); c.lookAt(p.x, p.y - 0.15, p.z); })")
            for st, nm in [(0, 'closed'), (1, 'open_protected'), (2, 'open')]:
                await pg.evaluate(f"void (__beta.interior.cupUser = true, __beta.interior.setCupolaHatch({st}, true))")
                for vn, y, p in [('fwd', 0, 10), ('right', 90, 10), ('left', -90, 10), ('rear', 178, 10), ('down', 0, -30)]:
                    await shot(f'cdr_{nm}_eye_{vn}', f"lk('in_cdr', {y}, {p}, 1)")
                    if vn == 'fwd': print(nm, await pg.evaluate("JSON.stringify((() => { const I = __beta.interior, e = I.tur.worldToLocal(__beta.scene.camera.position.clone()); return { eye: [+e.x.toFixed(3), +e.y.toFixed(3), +e.z.toFixed(3)], headOut: I.headOut, near: __beta.scene.camera.near, cup1: +I.st.cup1.toFixed(2), cup2: +I.st.cup2.toFixed(2), cap: I.capMode, caps: (I.cap || []).length }; })())"))
                await pg.evaluate('void __beta.runTo(__beta.battle.t + 2)')   # the figures move on the battle clock: let the commander get up (or down) before he is pictured from outside
                for vn, d, u, o in [('front_right', 2.6, 0.9, 50), ('right', 2.4, 0.7, 100), ('rear_right', 2.6, 1.1, 150)]:
                    await shot(f'cdr_{nm}_outside_{vn}', f"cupv({d}, {u}, {o})")
            await pg.evaluate("void (__beta.interior.setCupolaHatch(0, true), __beta.interior.cupUser = false)")
        if which in ('ldrup', 'hatches'):
            await pg.evaluate("void lk('in_ldr', 0, 0, 1)")
            for i in range(80):
                st = await pg.evaluate('JSON.stringify(__beta.interior.stats)')
                if '"crewReady":true' in st or '"crewFailed":true' in st: break
                await pg.wait_for_timeout(1500)
            print('crew', st)
            await pg.evaluate("void (window.outv = (dist, h, off) => { const T = __beta.battle.tank; __beta.near(dist, h, ((T.h || 0) + off + 360) % 360); })")
        if which == 'hatches':   # both hatches in every position, from inside and from outside
            for st, nm in [(0, 'closed'), (1, 'open_protected'), (2, 'open')]:
                await pg.evaluate(f"void (__beta.interior.cupUser = true, __beta.interior.setCupolaHatch({st}, true))")
                await shot(f'hatch_cdr_{nm}_inside', "lk('in_cdr', 8, 42, 1)"); await shot(f'hatch_cdr_{nm}_inside_rear', "lk('in_cdr', 178, 30, 1)"); await shot(f'hatch_cdr_{nm}_from_loader', "lk('in_ldr', 40, 26, 1)")
                await shot(f'hatch_cdr_{nm}_outside', "outv(5.5, 3.6, 150)"); await shot(f'hatch_cdr_{nm}_outside_close', "outv(3.4, 3.2, 20)")
            await pg.evaluate("void __beta.interior.setCupolaHatch(0, true)")
            await shot('hatch_ldr_closed_inside', "lk('in_ldr', -60, 55, 1)")
        if which == 'ldrup':   # the loader opening his hatch, climbing up, firing his machine gun and coming down
            real = None   # staged: the battle itself often calls him down again within a second, which is no use for a strip of the whole act
            print('loader goes up at', real); tagk = 'real' if real is not None else 'staged'
            if real is None: await pg.evaluate("void (window.forceUp = true, (() => { const L = __beta.battle.tank.ai.ldr; Object.defineProperty(L, 'up', { get: () => window.forceUp, set() {}, configurable: true }); window.spEnd = 1e9; const sp = [__beta.battle.t, 1e9]; Object.defineProperty(sp, 1, { get: () => window.spEnd, set() {} }); L.upAt = [sp]; })())")
            await pg.evaluate("void (window.T0 = __beta.battle.t, window.fire = () => { const b = __beta.battle, T = b.tank, a = (((__beta.interior.turBrg || T.h || 0)) - 35) * Math.PI / 180, rec = { t: b.t - 0.3, dur: 8, w: 'm240', m240: true, id: -1, e: T.e + Math.sin(a) * 400, n: T.n + Math.cos(a) * 400, R: 400 }; b._mg = rec; (b.mgs = b.mgs || []).push(rec); })")   # staged: a burst 35 degrees left of the turret's line, also put in the list of bursts (the battle's own next burst of another gun replaces _mg)
            # outside, from the turret's own left-front quarter (relative to the TURRET's bearing), a little above the man, looking at him
            await pg.evaluate("void (window.ldrv = (dist, up, off) => { const I = __beta.interior, s = __beta.scene, c = s.camera, V = __beta.THREE; const eye = I.mgEyeT ? I.tur.localToWorld(I.mgEyeT.clone()) : __beta.tank.group.localToWorld(new V.Vector3(0.8, 2.8, -0.5)); const a = ((I.turBrg || 0) + off) * Math.PI / 180; __beta.cams.mode = 'free'; s.controls.enabled = false; c.up.set(0, 1, 0); c.position.set(eye.x + Math.sin(a) * dist, eye.y + up, eye.z - Math.cos(a) * dist); c.lookAt(eye.x, eye.y - 0.3, eye.z); })")
            UP = [0.05, 0.35, 0.6, 0.85, 1.1, 1.4, 1.7, 2.0, 2.3, 2.75, 3.3, 4.1]
            for i, dtt in enumerate(UP):
                await shot(f'ldr_{tagk}_first_person_{i:02d}_{dtt}s', f"(__beta.runTo(T0 + {dtt}), lk('in_ldr', 0, 0, 1))")
                if i in (3, 6, 9, 11): await shot(f'ldr_{tagk}_from_cdr_{i:02d}_{dtt}s', "lk('in_cdr', -84, -20, 1)"); await shot(f'ldr_{tagk}_from_gnr_{i:02d}_{dtt}s', "lk('in_gnr', -120, 22, 1)"); await shot(f'ldr_{tagk}_outside_{i:02d}_{dtt}s', "outv(5.0, 3.4, 215)")
                if not ONLY or any(k in f'first_person_{i:02d}_' for k in ONLY): print('U', dtt, await pg.evaluate('JSON.stringify({U: +__beta.interior.st.ldrU.toFixed(2), lid: +__beta.interior.st.hatch.toFixed(2), mode: __beta.interior.mode, headOut: __beta.interior.headOut, loaded: __beta.battle.tank.loaded})'))
            await pg.evaluate("void __beta.runTo(Math.max(__beta.battle.t, T0 + 4.6))")   # all the way up (the pictures of the climb may have been skipped)
            staged_fire = await pg.evaluate("(() => { fire(); return true; })()"); print('burst staged:', staged_fire)
            await pg.evaluate("void __beta.runTo(__beta.battle.t + 1.2)")   # the gun laid on the target
            for pre in [q for q in os.environ.get('PRE', '').split('|') if q]:   # tests only: extra pictures after a piece of page code (e.g. hiding one crew figure)
                await shot(f'ldr_{tagk}_firing_first_person_pre{abs(hash(pre)) % 1000}', "(" + pre + ", lk('in_ldr', 0, 0, 1))"); print('PRE', abs(hash(pre)) % 1000, pre)
            await shot(f'ldr_{tagk}_firing_first_person', "lk('in_ldr', 0, 0, 1)");
            if os.environ.get('PICK'):   # what lies under given points of the picture (NDC x,y pairs): names up the parent chain of the first hits
                print('PICK', await pg.evaluate("JSON.stringify((" + os.environ['PICK'] + ").map(([x, y]) => { const V = __beta.THREE, s = __beta.scene, r = new V.Raycaster(); r.setFromCamera(new V.Vector2(x, y), s.camera); return r.intersectObjects(s.scene.children, true).filter(h => h.object.visible).slice(0, 3).map(h => { const n = []; let o = h.object; while (o && n.length < 6) { n.push((o.name || o.type) + (o.visible ? '' : '(hid)')); o = o.parent; } return [+h.distance.toFixed(2), n.join(' < ')]; }); }))"))
            await shot(f'ldr_{tagk}_firing_from_cdr', "lk('in_cdr', -84, -20, 1)"); await shot(f'ldr_{tagk}_firing_outside', "outv(5.0, 3.4, 215)")
            await shot(f'ldr_{tagk}_firing_outside_front', "ldrv(4.5, 0.7, -40)"); await shot(f'ldr_{tagk}_firing_outside_close', "ldrv(2.6, 0.45, -70)")   # from the turret's own left-front quarter, a little above
            print('firing', await pg.evaluate('(() => { const I = __beta.interior, f = I.crewFig && I.crewFig.men && I.crewFig.men.ldr, r = v => v && v.toArray().map(x => +x.toFixed(2)); return JSON.stringify({ firing: I.mgFiring, mgYaw: +I.st.mgYaw.toFixed(1), mgPitch: +(I.mgPitch || 0).toFixed(1), U: +I.st.ldrU.toFixed(2), mode: I.mode, ring: !!I.mgPivot, eye: r(I.mgEyeT), hands: I.mgHandT && I.mgHandT.map(r), muzzle: __beta.tank.m240Tip && r(__beta.tank.m240Tip.getWorldPosition(new __beta.THREE.Vector3())), crewReady: I.crewFig && I.crewFig.ready, ldrShown: f ? f.g.visible : null, handErr: f && f.handErr }); })()'))
            if real is None: await pg.evaluate("void (window.forceUp = false, window.T1 = __beta.battle.t, window.spEnd = __beta.battle.t)")
            else: print('comes down at', await pg.evaluate("(() => { const b = __beta.battle; let n = 0; while (b.tank.ai.ldr.up && b.tank.alive && n++ < 3000) __beta.runTo(b.t + 0.1); window.T1 = b.t; return +b.t.toFixed(1); })()"))
            for i, dtt in enumerate([0.3, 0.7, 1.1, 1.5, 2.0]): await shot(f'ldr_{tagk}_down_first_person_{i}_{dtt}s', f"(__beta.runTo(T1 + {dtt}), lk('in_ldr', 0, 0, 1))")
            await shot(f'ldr_{tagk}_down_from_cdr', "lk('in_cdr', -84, -20, 1)")
        if which == 'station':   # the HKOI weapon station on the roof: from four sides and above, then from the loader's and the commander's head-out views (both men up, both lids open)
            await pg.evaluate("""void (window.outv = (right, fwd, h, ty) => { const C = __beta.cams, T = __beta.battle.tank, s = __beta.scene, a = (T.h + (__beta.tank.turretYaw || 0)) * Math.PI / 180; if (s.fx && s.fx.clear) s.fx.clear(); C.set('orbit'); C.mode = 'free';   /* right, fwd: metres in the TURRET's frame, so the pictures compare whatever way it is turned; battle effects cleared */ s.controls.enabled = false; const p = s.at(T.e + Math.cos(a) * right + Math.sin(a) * fwd, T.n - Math.sin(a) * right + Math.cos(a) * fwd, 0), q = s.at(T.e, T.n, 0); s.camera.fov = 32; s.camera.updateProjectionMatrix(); s.camera.position.set(p.x, q.y + h, p.z); s.camera.up.set(0, 1, 0); s.camera.lookAt(q.x, q.y + (ty == null ? 2.5 : ty), q.z); },
              window.aimAt = (x, y, z) => { const k = __beta.tank; if (!k._as) k._as = k.aimStation; const p = k.group.localToWorld(new __beta.THREE.Vector3(x, y, z)); for (let i = 0; i < 30; i++) k._as.call(k, p, 0.4); k.aimStation = () => {}; },   /* lay the station on a point given in the tank's own frame (left, up, forward) and hold it there for the picture */
              window.forceUp = true, (() => { const L = __beta.battle.tank.ai.ldr; Object.defineProperty(L, 'up', { get: () => window.forceUp, set() {}, configurable: true }); const sp = [__beta.battle.t - 10, 1e9]; L.upAt = [sp]; })(), __beta.interior.cupUser = true, __beta.interior.setCupolaHatch(2, true))""")
            for i in range(40):   # the loader's climb is drawn frame by frame: wait until he stands behind his gun
                if await pg.evaluate('__beta.interior.st.ldrU') > 0.98: break
                await pg.wait_for_timeout(1500)
            print('station', await pg.evaluate("JSON.stringify((() => { const k = __beta.tank; return { at: k.rws ? k.rws.position.toArray().map(v => +v.toFixed(3)) : null, roof: k.rwsRoof, spec: k.stationSpec || null, ldrU: __beta.interior.st.ldrU, tur: __beta.battle.tank.tur, turretYaw: k.turretYaw }; })())"))
            for name, js in [('out_left', "outv(-9, 0.5, 3.4)"), ('out_right', "outv(9, 0.5, 3.4)"), ('out_front', "outv(0.5, 9, 3.6)"), ('out_rear', "outv(-0.5, -9, 4.2)"), ('out_above', "outv(-0.4, -2.2, 11, 2.2)"), ('out_left_rear_high', "outv(-6, -6, 6)"),
                             ('ldr_out_fwd', "lk('in_ldr', 0, 0, 1)"), ('ldr_out_back', "lk('in_ldr', 150, 0, 1)"), ('ldr_out_left', "lk('in_ldr', -90, 0, 1)"), ('cdr_out_fwd', "lk('in_cdr', 0, 44, 1)"), ('cdr_out_left', "lk('in_cdr', -90, 44, 1)"), ('cdr_out_left_rear', "lk('in_cdr', -140, 44, 1)"), ('cdr_out_rear', "lk('in_cdr', 180, 44, 1)"),
                             ('aim_right_front', "(aimAt(-300, 2, 300), outv(-6, -6, 6))"), ('aim_high_left', "(aimAt(300, 250, 60), outv(-7, 2, 4.5))"), ('aim_rear_over_aerial', "(aimAt(40, 2, -300), outv(-7, -5, 5))")]: await shot('station_' + name, js)
        if 'sights' in which:   # the three sight pictures: at rest, laid on a target, at the shot, thermal; the viewer; the HKOI sight on a track
            await pg.evaluate("void (window.hud = () => {}, document.getElementById('nohud') && (document.getElementById('nohud').textContent = ''))")
            async def frames(n=3):
                n0 = await pg.evaluate('__beta.scene.frameN')
                for i in range(120):
                    await pg.wait_for_timeout(500)
                    if await pg.evaluate('__beta.scene.frameN') >= n0 + n: break
            async def snap(name): await frames(); await pg.screenshot(path=os.path.join(out, f'{tag}_sight_{name}.png'), timeout=180000)
            await pg.evaluate("void __beta.cams.set('gnr')"); await snap('gnr_rest_day')
            got = await pg.evaluate("(() => { const b = __beta.battle; let n = 0; while (!(b._rf || (b._vxs && b._vxs.rfv)) && b.tank.alive && n++ < 4000) __beta.runTo(b.t + 0.1); const L = b._rf || (b._vxs && b._vxs.rfv); return L ? { t: b.t, at: L.at, veh: !!(b._vxs && b._vxs.rfv) } : null; })()")
            print('lay', json.dumps(got))
            if got:
                await pg.evaluate(f"void __beta.runTo({got['at']} - 1.2)"); await frames(6); await snap('gnr_laid_day'); print('gnr', await pg.evaluate("JSON.stringify(['sg-top','sg-rng','sg-ammo','sg-rdy','sg-lead','sg-line'].map(i => document.getElementById(i).textContent))"))
                await pg.keyboard.press('t'); await snap('gnr_laid_thermal')
                shot = await pg.evaluate("(() => { const b = __beta.battle, n0 = (b.events || []).filter(e => e.type === 'gun').length; let n = 0; while ((b.events || []).filter(e => e.type === 'gun').length === n0 && b.tank.alive && n++ < 600) __beta.runTo(b.t + 0.05); const e = (b.events || []).filter(e => e.type === 'gun').pop(); return e ? { t: e.t, now: b.t } : null; })()")
                print('shot', json.dumps(shot))
                if shot:
                    for dt_, nm in [(0.12, 'gnr_shot_0.1s_thermal'), (0.6, 'gnr_shot_0.6s_thermal')]: await pg.evaluate(f"void __beta.runTo({shot['t']} + {dt_})"); await snap(nm)
                    await pg.keyboard.press('t'); await pg.keyboard.press('t'); await pg.evaluate(f"void __beta.runTo({shot['t']} + 1.4)"); await snap('gnr_shot_1.4s_day'); print('gnr', await pg.evaluate("JSON.stringify(['sg-top','sg-rng','sg-line'].map(i => document.getElementById(i).textContent))"))
            await pg.evaluate("void __beta.cams.set('citv')"); await snap('citv'); await pg.keyboard.press('t'); await snap('citv_black_hot')
            await pg.evaluate("void __beta.cams.set('hkoi')"); await snap('hkoi_rest')
            trk = await pg.evaluate("(() => { const b = __beta.battle; let n = 0; while (!(__beta.volleys.info || []).some(m => m.cued) && b.tank.alive && n++ < 6000) { __beta.runTo(b.t + 0.1); __beta.advance && 0; } return { t: b.t, cued: (__beta.volleys.info || []).filter(m => m.cued).length, alive: b.tank.alive }; })()")
            print('track', json.dumps(trk)); await snap('hkoi_track'); await pg.evaluate("void __beta.runTo(__beta.battle.t + 1.0)"); await snap('hkoi_track_1s_later')
            print('hkoi', await pg.evaluate("JSON.stringify(['ts-top','ts-bot','ts-side','ts-warn'].map(i => document.getElementById(i).textContent))"))
        if 'fate' in which:   # what kills the tank, drawn: STAGED ends (battle.tank.fate written by hand to the contract of src/battle/fate.js), played on the battle clock. Use speed=4 in the hash params.
            await pg.evaluate("""void (window.outv = (right, fwd, h, ty) => { const C = __beta.cams, T = __beta.battle.tank, s = __beta.scene, a = (T.h + (__beta.tank.turretYaw || 0)) * Math.PI / 180; C.set('orbit'); C.mode = 'free'; s.controls.enabled = false; const p = s.at(T.e + Math.cos(a) * right + Math.sin(a) * fwd, T.n - Math.sin(a) * right + Math.cos(a) * fwd, 0), q = s.at(T.e, T.n, 0); s.camera.fov = 40; s.camera.updateProjectionMatrix(); s.camera.position.set(p.x, q.y + h, p.z); s.camera.up.set(0, 1, 0); s.camera.lookAt(q.x, q.y + (ty == null ? 2.5 : ty), q.z); },
              window.stageFate = (kind, extra) => { const b = __beta.battle, t = b.t, man = t0 => ({ state: 'ok', out: t0 == null ? null : { t0: t + t0, t1: t + t0 + 4 } }); window.fateT = t; if (__beta.scene.fx.clear) __beta.scene.fx.clear();
                b.tank.fate = Object.assign({ kind, t, cause: 'staged for a picture', zone: 'turret_rear', by: 'kornet', mobility: 'ok', firepower: 'ok', blowout: null, fire: null, crew: { cdr: man(3), ldr: man(4.5), gnr: man(6), drv: man(7.5) }, hits: [] }, extra ? extra(t) : {}); })""")
            async def to(dt_, name, js):   # play on to dt_ seconds after the staged hit, stop, look, picture
                await pg.evaluate('void __beta.setPlaying(true)')
                for i in range(400):
                    if await pg.evaluate(f'__beta.battle.t >= window.fateT + {dt_}'): break
                    await pg.wait_for_timeout(400)
                await pg.evaluate('void __beta.setPlaying(false)'); await shot('fate_' + name, js)
            await pg.evaluate("void stageFate('ammo_vented', t => ({ blowout: { t0: t + 0.15, t1: t + 12.15 }, fire: { t0: t, t1: t + 12.15, where: 'bustle' } }))"); await pg.evaluate("void outv(-7, -7, 6)")
            await to(0.7, 'vented_0.7s_panels_off', "outv(-7, -7, 6)"); await to(1.8, 'vented_1.8s_jets', "outv(-9, -3, 4, 3.5)"); await to(3.0, 'vented_3s_inside_loader_looks_back', "lk('in_ldr', 150, 0, 1)")
            await to(5.6, 'vented_5.6s_bailing', "outv(6, -6, 5)"); await to(8.2, 'vented_8s_bailing', "outv(7, 3, 4)"); await to(13.5, 'vented_13s_crew_on_the_ground', "outv(8, -7, 6, 1.5)")
            print('fate men', await pg.evaluate("JSON.stringify({ t: __beta.battle.t - window.fateT, hatch: __beta.interior.st.hatch, cup: __beta.interior.cupHatch, mode: __beta.interior.mode, panels: __beta.scene.scene.getObjectByName('tank-fate').children.slice(0, 2).map(p => p.position.toArray().map(v => +v.toFixed(1))) })"))
            await pg.evaluate("void stageFate('catastrophic', t => ({ blowout: { t0: t + 0.15, t1: t + 120 }, fire: { t0: t, t1: t + 120, where: 'all' }, crew: { cdr: { state: 'killed', out: null }, gnr: { state: 'killed', out: null }, ldr: { state: 'killed', out: null }, drv: { state: 'killed', out: null } } }))")
            await to(0.5, 'catastrophic_0.5s', "outv(-9, -6, 5, 3.5)"); await to(4, 'catastrophic_4s', "outv(-9, -6, 5, 3.5)"); await to(5, 'catastrophic_5s_inside_gunner', "lk('in_gnr', 0, 0, 1)")
            await pg.evaluate("void stageFate('mobility_kill', t => ({ mobility: 'killed', firepower: 'killed', gunOut: true, crew: { cdr: { state: 'ok', out: null }, gnr: { state: 'ok', out: null }, ldr: { state: 'ok', out: null }, drv: { state: 'ok', out: null } }, hits: [{ t, comps: ['track_l', 'engine'] }] }))")
            await to(4, 'mobility_and_firepower_kill_4s', "outv(-7, -6, 3.5, 1.5)")
        if which == 'cuts':   # the cutaway from every side, at rest and again with the turret laid on a target
            CU = [('left', "cutv(-5.2, 2.4, 3.0)"), ('right', "cutv(5.2, 2.0, 3.0)"), ('above', "cutv(-0.6, -1.5, 8.5)"), ('front_left', "cutv(-3.6, 5.2, 2.0)"), ('rear_right_high', "cutv(3.2, -3.4, 5.6)")]
            for name, js in CU: await shot('cut_' + name, js)
            print('lay', await pg.evaluate('stepTo(b => !!b._rf)'), await pg.evaluate('__beta.tank.turretYaw')); await pg.wait_for_timeout(6000); print('turret', await pg.evaluate('__beta.tank.turretYaw'))
            for name, js in CU: await shot('cut_turned_' + name, js)
            await shot('drv_from_his_left_shoulder_like_the_photo', "lk('in_drv', 52, -6, 1, [-0.4, 0.05, 0.1])"); await shot('drv_forward', "lk('in_drv', 0, 0, 1)")
            await shot('gnr_left_breech', "lk('in_gnr', -70, 0, 1)")
            # the T-bar at work: run the battle on until the vehicle is under way, then stills from the driver's seat with the clock running
            print('moving', await pg.evaluate('stepTo(b => Math.abs(b.tank.v || 0) > 2)')); await pg.evaluate("void (lk('in_drv', 0, 0, 1), __beta.setPlaying(true))")
            for i in range(4): await pg.wait_for_timeout(4000); print('drive', await pg.evaluate('JSON.stringify({t: +__beta.battle.t.toFixed(1), v: +(__beta.battle.tank.v || 0).toFixed(1), steer: +__beta.interior.st.steer.toFixed(2), throttle: +__beta.interior.st.thr.toFixed(2), gear: +__beta.interior.st.gear.toFixed(2)})')); await pg.screenshot(path=os.path.join(out, f'{tag}_drv_moving_{i}.png'), timeout=180000)
            await pg.evaluate('void __beta.setPlaying(false)')
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
