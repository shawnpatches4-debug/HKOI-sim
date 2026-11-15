# python3 tests/beta/looks.py <out dir> [hash params]   (through tools/run_test.sh)
# The fixed set of pictures used to compare how the battlefield looks before and after a change: the same cameras, the same
# battles (seeded), the same staged moments. One page load; the menus and boxes are hidden so only the drawn picture is judged.
# Env: SET=env (places and weathers) | fx (tank firing, cloud cut, Trophy, night) | veh (enemy vehicles: fire, kill, wrecks) | a comma list of names;
#      W, H (default 960x540); MAXS = seconds after which no further picture is started (default 560).
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]; PARAMS = sys.argv[2] if len(sys.argv) > 2 else 'gfx=high&spectator=1&play=1&biome=farmland&cond=day&force=ambush&seed=3&speed=1&hud=simple'
HERE = os.path.dirname(os.path.abspath(__file__)); FAKE = open(os.path.join(HERE, 'vehicles_fake.js')).read(); T0 = time.time()
HELP = r"""void (() => { const b = window.__beta, S = b.scene, D = Math.PI / 180;
  const L = window.__L = {
    hide() { const cv = S.canvas; for (const el of document.querySelectorAll('body *')) { if (el === cv || el.contains(cv) || el.id === 'errbar') continue; el.style.visibility = 'hidden'; } cv.style.visibility = 'visible'; },
    place(biome, cond, force, seed, map) { b.set.biome = biome; b.set.cond = cond; b.set.force = force || 'ambush'; b.set.seed = seed || 3; if (map) b.set.map = map; b.set.spectator = true; b.start(); b.setPlaying(false); S.setThermal(0); L.hide(); return [b.battle.t, S.buildMs]; },
    /* camera: from the tank, `brg` degrees round from north, `dist` metres out, `h` metres above the ground there, looking at a point `up` metres above the tank */
    tank(brg, dist, h, up = 2, fov = 50) { const T = b.battle.tank, a = brg * D, e = T.e + Math.sin(a) * dist, n = T.n + Math.cos(a) * dist; b.cams.mode = 'free'; S.controls.enabled = false; const c = S.camera; c.up.set(0, 1, 0); c.fov = fov; c.updateProjectionMatrix(); c.position.set(e, b.world.h(e, n) + h, -n); c.lookAt(T.e, b.world.h(T.e, T.n) + up, -T.n); S.setFocus(T.e, T.n); },
    look(px, py, pz, tx, ty, tz, fov = 50) { b.cams.mode = 'free'; S.controls.enabled = false; const c = S.camera; c.up.set(0, 1, 0); c.fov = fov; c.updateProjectionMatrix(); c.position.set(px, py, pz); c.lookAt(tx, ty, tz); },
    /* step the battle until a volley turns up that passes `pred`; returns it (or null) */
    volley(pred, maxT = 400) { const B = b.battle; let seen = 0; while (B.t < maxT && B.tank.alive) { while (seen < B.volleys.length) { const v = B.volleys[seen++]; if (v.rec && pred(v)) { b.runTo(B.t); return v; } } B.step(); } b.runTo(B.t); return null; },
    play(sec) { b.playFor(Math.max(0, sec)); },
    fx(sec, fps = 30) { const n = Math.max(1, Math.round(sec * fps)); for (let i = 0; i < n; i++) S.fx.update(sec / n); },
    frames() { return S.frameN; }, err() { const c = document.getElementById('errbar'); return c && !c.hidden ? c.textContent : ''; },
    stats() { const i = S.renderer.info.render; return { calls: i.calls, tris: i.triangles, q: S.quality, pr: +S.pr.toFixed(2), cond: S.condition, t: +b.battle.t.toFixed(1) }; } };
})()"""
# name -> list of javascript steps; the picture is taken after the last one
CUT = "v => v.rec.bursts.some(q => q.kind === 'obs' && q.tau_s && q.tau_need && q.tau_s.some(s => s[1] >= q.tau_need))"
SHOT1 = "void (window.__sh = (() => { const B = __beta.battle; while (!(B.shots && B.shots.length) && B.t < 500 && B.tank.alive) B.step(); __beta.runTo(B.t); return B.shots && B.shots[0]; })())"
SHOTCAM = "void (() => { const s = window.__sh; if (!s) return; const T = __beta.battle.tank, a = Math.atan2(s.to.e - T.e, s.to.n - T.n) * 180 / Math.PI; __L.tank(a + 62, 26, 4.5, 2.2); })()"
SCENES = {
 'env': [
  ('farm_day_orbit', ["__L.place('farmland','day','ambush',3)", "__L.tank(215, 42, 13)"]),
  ('farm_day_close', ["__L.tank(160, 13, 2.4, 1.6)"]),
  ('farm_day_wide', ["__L.tank(200, 160, 40)"]),
  ('farm_day_ground', ["__L.tank(250, 22, 1.6, 1.2)"]),
  ('desert_dusk', ["__L.place('desert','dusk','ambush',3)", "__L.tank(100, 30, 5)"]),
  ('desert_dusk_wide', ["__L.tank(70, 110, 22)"]),
  ('town_rain', ["__L.place('town','rain','ambush',3)", "__L.tank(215, 30, 6)"]),
  ('town_rain_close', ["__L.tank(150, 12, 2.2, 1.5)"]),
  ('forest_fog', ["__L.place('forest','fog','ambush',3)", "__L.tank(215, 34, 7)"]),
  ('farm_snow', ["__L.place('farmland','snow','ambush',3)", "__L.tank(215, 34, 7)"]),
 ],
 'fx': [
  ('fire_main', ["__L.place('farmland','day','ambush',3)", SHOT1, "__L.play(0.1)", SHOTCAM, "WAIT", "__L.fx(0.07)"]),
  ('fire_main_b', ["__L.fx(0.5)"]),
  ('fire_main_c', ["__L.fx(2.0)"]),
  ('cloud_cut', ["__L.place('farmland','day','ambush',3)", "void (window.__v = __L.volley(%s))" % CUT,
     "void (() => { const v = window.__v; if (!v) return; const B = __beta.battle, q = v.rec.bursts.find(q => q.kind === 'obs' && q.tau_s && q.tau_s.some(s => s[1] >= q.tau_need)), tc = q.tau_s.find(s => s[1] >= q.tau_need)[0]; __L.play(v.t0 + tc - B.t + 0.15); const P = __beta.volleys.cloud.puffs.filter(p => p.on); let x = 0, y = 0, z = 0; for (const p of P) { x += p.x; y += p.y; z += p.z; } x /= P.length || 1; y /= P.length || 1; z /= P.length || 1; const T = B.tank, dx = x - T.e, dz = z + T.n, d = Math.hypot(dx, dz) || 1; window.__c = [x, y, z, dx / d, dz / d, d]; __L.look(T.e - dz / d * 14 - dx / d * 10, __beta.world.h(T.e, T.n) + 5.5, -T.n + dx / d * 14 - dz / d * 10, x, y, z, 42); })()"]),
  ('cloud_cut_side', ["void (() => { const c = window.__c; if (!c) return; __L.look(c[0] - c[4] * 55, c[1] + 6, c[2] + c[3] * 55, c[0], c[1], c[2], 40); })()"]),
  ('cloud_later', ["__L.play(2.5)"]),
  ('trophy', ["__L.place('farmland','day','ambush',5)", "void (window.__v = __L.volley(v => v.rec.aps && v.rec.aps.some(a => a.kill)))",
     "void (() => { const v = window.__v; if (!v) return; const B = __beta.battle, a = v.rec.aps.find(a => a.kill); __L.play(v.t0 + a.t - B.t + 0.12); __L.tank(a.brg + 55, 24, 5, 2.4); })()"]),
  ('trophy_b', ["__L.play(0.5)"]),
  ('night_thermal', ["__L.place('farmland','night','ambush',3)", "__L.tank(215, 42, 13)", "WAIT", "void __beta.scene.setThermal(1)"]),
  ('night_fire', ["void __beta.scene.setThermal(0)", SHOT1, "__L.play(0.1)", SHOTCAM, "WAIT", "__L.fx(0.07)"]),
 ],
 'veh': [
  ('veh_fire_t72', ["__L.place('desert','day','light',3)", "VEH", "__go(11.03)", "__cam(2, 16, 12, 2.8)"]),
  ('veh_cat_a', ["__go(22.5)", "__cam(5, 20, 12, 3.5)"]),
  ('veh_cat_b', ["__go(23.6)"]),
  ('veh_cat_c', ["__go(25.6)"]),
  ('veh_wrecks', ["__go(60)", "__cam(5.5, 45, 0, 7)"]),
  ('veh_wreck_close', ["__cam(5, 14, 9, 3)"]),
 ],
}
VEH = """void (() => {
  const b = window.__beta, B = b.battle, V = b.scene.vehicles; b.setPlaying(false);
  const uid = B.units.length ? B.units[0].id : 1, F = window.__vehFake({ e: B.tank.e, n: B.tank.n }, uid);
  window.__vt = 0; window.__F = F; B.vehicles = () => F(Math.ceil(window.__vt * 10 - 1e-6) / 10);
  const orig = V.update.bind(V); V.update = (bt, o) => orig(bt, Object.assign({}, o, { t: window.__vt, bt: Math.ceil(window.__vt * 10 - 1e-6) / 10, all: true }));
  window.__go = (to, fps = 60) => { while (window.__vt < to - 1e-9) { window.__vt = Math.min(to, window.__vt + 1 / fps); V.update(B, { teams: b.teams() }); if (b.scene.fx.step) b.scene.fx.step(1 / fps); else b.scene.fx.update(1 / fps); } return window.__vt; };
  window.__cam = (i, back, side, h) => { const D = Math.PI / 180, p = F.slot(i), be = Math.sin(F.brg * D), bn = Math.cos(F.brg * D); b.view(p[0] - be * back + bn * side, p[1] - bn * back - be * side, 0, h, p[0], p[1]); b.scene.setFocus(p[0], p[1]); };
})()"""
async def main():
    os.makedirs(OUT, exist_ok=True); want = os.environ.get('SET', 'env').split(',')
    shots = []
    for k, v in SCENES.items():
        for name, steps in v:
            if k in want or name in want: shots.append((name, steps))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '960')), 'height': int(os.environ.get('H', '540'))})
        errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#' + PARAMS, timeout=120000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=400000)
        print('ready at %.0f s' % (time.time() - T0), flush=True)
        await pg.evaluate(HELP); await pg.evaluate(FAKE)
        async def settle(n=2):
            f0 = await pg.evaluate('__L.frames()'); t = time.time()   # (polled by hand: the page's rules forbid the string evaluation wait_for_function uses for an expression like this)
            while await pg.evaluate('__L.frames()') < f0 + n and time.time() - t < 90: await pg.wait_for_timeout(400)
        for name, steps in shots:
            if time.time() - T0 > int(os.environ.get('MAXS', '560')): print('out of time before', name); break
            try:
                for s in steps:
                    if s == 'WAIT': await settle(2)
                    elif s == 'VEH': await pg.evaluate(VEH); await settle(3)
                    else: await pg.evaluate(s)
                await pg.evaluate('__L.hide()'); await settle(3)
                await pg.screenshot(path=os.path.join(OUT, name + '.png'), timeout=120000)
                print('%-18s %5.0f s' % (name, time.time() - T0), json.dumps(await pg.evaluate('__L.stats()')), (await pg.evaluate('__L.err()'))[:300], flush=True)
            except Exception as e: print(name, 'FAILED', str(e)[:300], flush=True)
        print('errors', json.dumps(errs[:8], indent=1)); await b.close()
asyncio.run(main())
