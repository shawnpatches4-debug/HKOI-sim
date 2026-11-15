# Pictures of what a hit does INSIDE and of the crew (stream "inside", 1.0): the same staged scenes from the same seats, so a
# BEFORE set and an AFTER set can be laid side by side. Every scene is staged through the interior's own inputs: a list of hits in
# the form the damage report gives (battle.interiorHits, as the node test does) and the crew model's state (battle.crewState),
# with the battle clock stopped. Nothing here goes round the interior's code: what is drawn is what a real hit of that kind draws.
# Use: PORT=87xx bash tools/run_test.sh tests/beta/inside_shots.py <out dir> <tag> "<hash params>"     (ONLY=a,b: scenes whose name contains a or b)
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright
HELP = """void (window.hud = v => { let st = document.getElementById('nohud'); if (!st) { st = document.createElement('style'); st.id = 'nohud'; document.head.appendChild(st); } st.textContent = v ? '' : ['status','log','logov','bar','crew','caption','marks','seatcap','hud','replay','threats','engleft','engright','crewmen','defences','enemybox','strip','dock','subs','ticker','facerow','gauges','warn','units','map'].map(i => '#' + i).join(',') + ' { visibility: hidden !important; }'; },
  window.lk = (m, y, p, z, off) => { if (__beta.cams.mode !== m) __beta.cams.set(m); __beta.interior.setLook(y, p, z || 1, off || null); },
  window.cutv = (right, fwd, h) => { __beta.cams.set('cut'); __beta.cams.snap = false; const T = __beta.battle.tank, s = __beta.scene, a = T.h * Math.PI / 180, p = s.at(T.e + Math.cos(a) * right + Math.sin(a) * fwd, T.n - Math.sin(a) * right + Math.cos(a) * fwd, 0); s.camera.position.set(p.x, p.y + h, p.z); },
  window.mkHit = o => { const V = __beta.THREE.Vector3; return { T: __beta.battle.t - o.age, pen: !!o.pen, kill: !!o.kill, minor: !!o.minor, s: o.s || (o.kill ? 2 : o.pen ? 1.6 : 1), e: o.e ? new V(o.e[0], o.e[1], o.e[2]) : undefined, d: o.d ? new V(o.d[0], o.d[1], o.d[2]).normalize() : undefined, comps: o.comps || {}, crew: o.crew || {}, idx: o.idx || 7, zone: o.zone, zoneKey: o.zone, turA: 0, reach: o.reach, key: o.key || 'kornet' }; },
  window.stage = (hits, who, top) => { const b = __beta.battle; b.interiorHits = (hits || []).map(mkHit); b._cs0 = b._cs0 || b.crewState.bind(b);
    b.crewState = () => { const s = b._cs0(); s.on = true; s.abandoned = false; s.fire = null; for (const r of ['cdr', 'gnr', 'ldr', 'drv']) Object.assign(s.who[r], { state: 'steady', status: 'ok', busy: null, stress: 0.1 }, (who || {})[r] || {}); Object.assign(s, top || {}); if (s.fire) { s.fire.since = b.t - s.fire.age; s.fire.until = b.t + (s.fire.left == null ? 5 : s.fire.left); } return s; };
    const I = __beta.interior; if (I.crewFig) I.crewFig.lastT = null; if (I.st) I.st.ldrU = 0; const A = b.tank.ai; if (A && A.ldr && A.ldr.upAt) A.ldr.upAt = []; if (I.last) { I.last.lu = false; I.last.luU = 0; I.last.luT = b.t - 10; } })"""
R = [1.7, 0.38, -0.15]; RD = [-1, -0.04, 0.02]
PEN_GNR = "[{ age: %s, pen: 1, zone: 'turret_side', e: [1.7, 0.36, -0.22], d: [-1, -0.05, -0.03], reach: 2.2, comps: { gps: 'damaged', gnr: 'damaged' }, crew: { gnr: 'wounded' }, idx: 11 }], { gnr: { status: 'wounded', state: 'shaken', stress: 0.7 }, cdr: { state: 'shaken', stress: 0.6 }, ldr: { state: 'strained', stress: 0.45 } }"
KILL_LDR = "[{ age: %s, pen: 1, zone: 'turret_side', e: [-1.7, 0.2, 0.3], d: [1, -0.03, 0.0], reach: 1.6, comps: { ldr: 'destroyed', radio: 'damaged' }, crew: { ldr: 'killed' }, idx: 12 }], { ldr: { status: 'down', busy: 'killed', state: 'steady' }, cdr: { state: 'shaken', stress: 0.65 }, gnr: { state: 'shaken', stress: 0.6 } }"
HULL_FIRE = "[{ age: %s, pen: 1, zone: 'hull_side_f', e: [1.8, -0.52, -1.4], d: [-1, -0.03, -0.12], reach: 1.3, comps: { fuel_r: 'destroyed' }, crew: {}, idx: 13 }], { drv: { state: 'panicked', stress: 0.9 }, cdr: { state: 'shaken', stress: 0.7 }, gnr: { state: 'shaken', stress: 0.7 }, ldr: { state: 'shaken', stress: 0.7 } }, { fire: { where: 'hull', age: %s, left: 6 } }"
ELEC = "[{ age: %s, pen: 1, zone: 'turret_side', e: [-1.7, 0.1, 0.55], d: [1, -0.3, -0.45], reach: 1.9, comps: { radio: 'destroyed', tdrive: 'destroyed' }, crew: {}, idx: 14 }], { gnr: { state: 'strained', stress: 0.45 }, cdr: { state: 'strained', stress: 0.45 }, ldr: { state: 'shaken', stress: 0.6 } }"
CATA = "[{ age: %s, pen: 1, kill: 1, zone: 'turret_front', e: [0.25, 0.36, -2.4], d: [0.02, -0.03, 1], reach: 3.2, comps: { ammo: 'destroyed', gun: 'damaged' }, crew: {}, idx: 15 }], { cdr: { state: 'panicked', stress: 1 }, gnr: { state: 'panicked', stress: 1 }, ldr: { state: 'panicked', stress: 1 } }"
NONPEN = "[{ age: %s, zone: 'turret_side', e: [1.7, 0.38, -0.3], d: [-1, -0.03, 0.05], comps: {}, crew: {}, idx: 16 }], { gnr: { state: 'strained', stress: 0.4 }, cdr: { state: 'strained', stress: 0.4 } }"
def scenes():
    S = []
    S += [('nonpen_0.12s_gnr', f"(stage({NONPEN % 0.12}), lk('in_gnr', 60, 4, 1))"), ('nonpen_0.12s_cdr', "lk('in_cdr', 30, -12, 1)"), ('nonpen_1.2s_ldr', f"(stage({NONPEN % 1.2}), lk('in_ldr', 75, -6, 1))")]
    for age in ['0.05', '1.5', '25']:
        S += [(f'pen_gnr_{age}s_cdr', f"(stage({PEN_GNR % age}), lk('in_cdr', 8, -24, 1))"), (f'pen_gnr_{age}s_ldr', "lk('in_ldr', 78, -8, 1)")]
    S += [('pen_gnr_1.5s_cdr_down', f"(stage({PEN_GNR % 1.5}), lk('in_cdr', 15, -48, 1))"), ('pen_gnr_25s_own_seat', "lk('in_gnr', 80, -25, 1)")]
    for age in ['0.05', '2', '30']:
        S += [(f'kill_ldr_{age}s_cdr', f"(stage({KILL_LDR % age}), lk('in_cdr', -80, -22, 1))"), (f'kill_ldr_{age}s_gnr', "lk('in_gnr', -100, -4, 1, [-0.3, 0.2, 0.5])")]
    for age in ['0.4', '3', '12']:
        S += [(f'hull_fire_{age}s_drv', f"(stage({HULL_FIRE % (age, age)}), lk('in_drv', 62, -12, 1))"), (f'hull_fire_{age}s_gnr', "lk('in_gnr', 40, -42, 1)")]
    S += [('hull_fire_12s_cut', "cutv(5.2, 2.0, 3.0)")]
    for age in ['0.6', '8']:
        S += [(f'electrical_{age}s_gnr', f"(stage({ELEC % age}), lk('in_gnr', -40, -10, 1))"), (f'electrical_{age}s_ldr', "lk('in_ldr', -100, -4, 1)"), (f'electrical_{age}s_cdr', "lk('in_cdr', -30, -18, 1)")]
    for age in ['0.08', '0.45', '0.95']:
        S += [(f'catastrophic_{age}s_cdr', f"(stage({CATA % age}), lk('in_cdr', 168, -8, 1))")]
    S += [('catastrophic_0.5s_ldr', f"(stage({CATA % 0.5}), lk('in_ldr', 100, 0, 1))")]
    for name, who in [('steady', "{}"), ('shaken', "{ cdr: { state: 'shaken', stress: 0.62 }, gnr: { state: 'shaken', stress: 0.62 }, ldr: { state: 'shaken', stress: 0.62 }, drv: { state: 'shaken', stress: 0.62 } }"),
                      ('panicked', "{ cdr: { state: 'panicked', stress: 0.92 }, gnr: { state: 'panicked', stress: 0.92 }, ldr: { state: 'panicked', stress: 0.92 }, drv: { state: 'panicked', stress: 0.92 } }"),
                      ('frozen', "{ cdr: { state: 'panicked', stress: 0.95, busy: 'frozen' }, gnr: { state: 'panicked', stress: 0.95, busy: 'frozen' }, ldr: { state: 'panicked', stress: 0.95, busy: 'frozen' }, drv: { state: 'panicked', stress: 0.95, busy: 'frozen' } }")]:
        S += [(f'crew_{name}_from_ldr', f"(stage([{{ age: 60, minor: 1, s: 0.3, idx: 2 }}], {who}), lk('in_ldr', 78, -4, 1))"), (f'crew_{name}_ldr_from_cdr', "lk('in_cdr', -80, -12, 1)"), (f'crew_{name}_drv', "lk('in_drv', 52, -6, 1, [-0.4, 0.05, 0.1])")]
    S += [('crew_wounded_from_ldr', f"(stage({PEN_GNR % 14}), lk('in_ldr', 78, -4, 1.6))"), ('crew_relief_from_ldr', "(stage([{ age: 26, zone: 'turret_side', e: [1.7, 0.38, -0.3], d: [-1, -0.03, 0.05], idx: 17 }], { cdr: { state: 'strained', stress: 0.4 }, gnr: { state: 'strained', stress: 0.4 }, ldr: { state: 'strained', stress: 0.4 }, drv: { state: 'strained', stress: 0.4 } }), lk('in_ldr', 78, -4, 1))"), ('crew_relief_ldr_from_cdr', "lk('in_cdr', -80, -12, 1)")]
    for name, who in [('steady', "{}"), ('shaken', "{ cdr: { state: 'shaken', stress: 0.62 }, gnr: { state: 'shaken', stress: 0.62 }, ldr: { state: 'shaken', stress: 0.62 }, drv: { state: 'shaken', stress: 0.62 } }"), ('panicked', "{ cdr: { state: 'panicked', stress: 0.92 }, gnr: { state: 'panicked', stress: 0.92 }, ldr: { state: 'panicked', stress: 0.92 }, drv: { state: 'panicked', stress: 0.92 } }"), ('frozen', "{ cdr: { state: 'panicked', stress: 0.95, busy: 'frozen' }, gnr: { state: 'panicked', stress: 0.95, busy: 'frozen' }, ldr: { state: 'panicked', stress: 0.95, busy: 'frozen' }, drv: { state: 'panicked', stress: 0.95, busy: 'frozen' } }")]:
        S += [(f'sheet_{name}', f"(stage([{{ age: 60, minor: 1, s: 0.3, idx: 2 }}], {who}), hud(1), lk('in_cdr', -80, -12, 1))")]
    S += [('sheet_wounded', f"(stage({PEN_GNR % 14}), hud(1), lk('in_cdr', -80, -12, 1))"), ('sheet_relief', "(stage([{ age: 26, zone: 'turret_side', e: [1.7, 0.38, -0.3], d: [-1, -0.03, 0.05], idx: 17 }], { cdr: { state: 'strained', stress: 0.4 }, gnr: { state: 'strained', stress: 0.4 }, ldr: { state: 'strained', stress: 0.4 }, drv: { state: 'strained', stress: 0.4 } }), hud(1), lk('in_cdr', -80, -12, 1))"), ('sheet_end', "hud(0)")]
    S += [('faces_panel_wounded', f"(stage({PEN_GNR % 14}), hud(1), lk('in_cdr', 8, -24, 1))"), ('faces_panel_killed', f"(stage({KILL_LDR % 30}), lk('in_cdr', -80, -22, 1))")]
    return S
ONLY = [k for k in os.environ.get('ONLY', '').split(',') if k]
async def main():
    out, tag, params = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        FULL = {'width': int(os.environ.get('W', '960')), 'height': int(os.environ.get('H', '540'))}
        pg = await b.new_page(viewport={'width': 320, 'height': 180}); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:400]))
        await pg.goto(os.environ['BASE'] + '#play=1&' + params, timeout=120000)
        for i in range(200):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready && window.__beta.tank.loaded)'): break
            await pg.wait_for_timeout(1500)
        await pg.evaluate(HELP); await pg.evaluate("void (hud(0), __beta.setPlaying(false), lk('in_ldr', 0, 0, 1))")
        for i in range(80):
            st = await pg.evaluate('JSON.stringify(__beta.interior.stats)')
            if '"crewReady":true' in st.replace(' ', '') or '"crewFailed":true' in st.replace(' ', ''): break
            await pg.wait_for_timeout(1500)
        print('crew', st[:300]); await pg.set_viewport_size(FULL); await pg.wait_for_timeout(1500); frames = int(os.environ.get('FRAMES', '3'))
        t0 = time.time(); maxs = float(os.environ.get('MAXS', '520'))   # one browser on this machine for everybody: stop taking pictures after this many seconds
        for name, js in scenes():
            if time.time() - t0 > maxs: print('out of time before', name); break
            if ONLY and not any(k in name for k in ONLY):
                if 'stage(' in js: await pg.evaluate('void (' + js.split(", lk(")[0].split(", hud(")[0] + '))')   # keep the staging of a skipped scene, for the views that follow it
                continue
            n0 = await pg.evaluate('__beta.scene.frameN'); await pg.evaluate('void (' + js + ')')
            for i in range(120):
                await pg.wait_for_timeout(400)
                if await pg.evaluate('__beta.scene.frameN') >= n0 + frames: break
            await pg.screenshot(path=os.path.join(out, f'{tag}_{name}.png'), timeout=180000)
        try: print('stats', await pg.evaluate('JSON.stringify([__beta.interior.stats, __beta.scene.stats().calls, __beta.scene.stats().triangles, __beta.interior.fx && __beta.interior.fx.cost ? __beta.interior.fx.cost() : null])'))
        except Exception as e: print('stats failed', str(e)[:200])
        print('errors', len(errs), errs[:6]); await b.close()
asyncio.run(main())
