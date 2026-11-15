# python3 tests/beta/support.py <out dir> [hash params]
# Friendly support and the bomber drone in the real page (src/render/support.js drawing what src/battle/support.js fights).
# One page load, two battles of the "Section attack" force with artillery switched on:
#   seed 18: the wingman on station, the wingman under fire, the wingman's main gun, HKOI firing at a bomber drone, an artillery mission landing
#   seed 22: a bomber drone over the wingman, its bombs falling and striking
# then the real frame loop through the opening engagement. Takes pictures at those moments and checks that what should be drawn is
# drawn (the view's own count), that nothing reaches the page's red error bar and that no error is logged.
# Run it through tools/run_test.sh (one headless browser at a time). Env: W, H (default 960x540), WAITMS per picture (default 2600),
# BOMBS=1 (only the bomb pictures, with seed 22 as the page's first battle: the free camera holds there).
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]; PARAMS = sys.argv[2] if len(sys.argv) > 2 else 'gfx=low&spectator=1&play=1&biome=farmland&map=3&force=section_attack&seed=18&speed=1&waves=1&arty=on&skill=trained&mission=hold&cond=day&hud=none'
WAIT = int(os.environ.get('WAITMS', '2600')); T0 = time.time()
BOMBS = os.environ.get('BOMBS') == '1'   # BOMBS=1: only the bomb pictures, with seed 22 as the page's first battle
if BOMBS: PARAMS = PARAMS.replace('seed=18', 'seed=22')
SETUP = """void (() => {
  const b = window.__beta; b.setPlaying(false);
  window.__ev = type => b.battle.events.filter(e => e.type === type).sort((p, q) => p.t - q.t);
  /* fight on (unseen) until the battle has an event of this type, or maxT; returns the event or null */
  window.__until = (type, maxT) => { const B = b.battle; let n = 0; while (!__ev(type).length && B.t < maxT && B.tank.alive && !B.over && n++ < 20000) b.runTo(B.t + 0.05); return __ev(type)[0] || null; };
  /* run the battle to time t: fast to a few seconds before, then step by step with the drawing following */
  window.__to = t => { if (b.battle.t < t - 3) b.runTo(t - 3); if (t > b.battle.t) b.playFor(t - b.battle.t); return +b.battle.t.toFixed(2); };
  /* look at a point from `dist` metres away on bearing `brg` from it, `h` metres up; the look point is lifted by `up` metres */
  window.__look = (e, n, brg, dist, h, up) => { const a = brg * Math.PI / 180, ce = e + Math.sin(a) * dist, cn = n + Math.cos(a) * dist; b.view(ce, cn, 0, h, e, n); const c = b.scene.camera, y = b.world.h(e, n) + 2 + (up || 0); if (b.scene.controls && b.scene.controls.target) b.scene.controls.target.set(e, y, -n);   /* the orbit control, if it still runs, must aim where we do */ c.lookAt(e, y, -n); };
  window.__brg = (e0, n0, e1, n1) => (Math.atan2(e1 - e0, n1 - n0) * 180 / Math.PI + 360) % 360;
  window.__info = () => { const B = b.battle, S = b.scene.stats(), G = B.wing; return JSON.stringify({ t: +B.t.toFixed(1), drawn: b.support.info, calls: S.calls, tris: S.triangles, wing: G ? { alive: G.alive, e: Math.round(G.e), n: Math.round(G.n), fate: G.fate && G.fate.kind } : null, tank: { alive: B.tank.alive, e: Math.round(B.tank.e), n: Math.round(B.tank.n) }, err: document.getElementById('errbar').hidden ? null : document.getElementById('errbar').textContent.slice(0, 300) }); };
})()"""
async def main():
    os.makedirs(OUT, exist_ok=True); fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': os.environ.get('CHROME', '/usr/bin/google-chrome')} if os.path.exists(os.environ.get('CHROME', '/usr/bin/google-chrome')) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '960')), 'height': int(os.environ.get('H', '540'))})
        errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(getattr(e, 'stack', e))[:600])); pg.on('console', lambda m: m.type == 'error' and 'GPU stall' not in m.text and '404' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#' + PARAMS, timeout=180000)
        await pg.wait_for_function('window.__beta && window.__beta.ready && window.__beta.battle', timeout=420000)
        print('page up after %.0f s' % (time.time() - T0)); await pg.evaluate(SETUP); await pg.add_style_tag(content='#result { display: none !important; }')   # the end-of-battle card would cover the pictures
        try: await pg.wait_for_function('__beta.tank.loaded && __beta.support.wingTank && __beta.support.wingTank.loaded', timeout=300000)
        except Exception as e: print('MODELS NOT LOADED: pictures will show the stand-in boxes')
        print('models in after %.0f s' % (time.time() - T0))
        ev = lambda s: pg.evaluate(s)
        async def shot(name, note):
            await pg.wait_for_timeout(WAIT); await pg.screenshot(path=os.path.join(OUT, name + '.png'), timeout=120000); info = json.loads(await ev('__info()')); print('%-16s %s | %s' % (name, note, json.dumps(info)))
            if info['err']: fails.append(name + ': red bar: ' + info['err'])
            return info
        has = await ev('JSON.stringify({ wing: !!__beta.battle.wing, scout: !!__beta.battle.scout(), art: !!(__beta.battle.sup && __beta.battle.sup.art), force: __beta.set.force })'); print('battle 1', has)
        if not json.loads(has)['wing']: fails.append('no wingman in the battle')
        # ---- seed 18
        if not BOMBS:
            await ev('void (() => { const B = __beta.battle, T = B.tank, G = B.wing; __to(1); __look((T.e + G.e) / 2, (T.n + G.n) / 2, (__brg(T.e, T.n, G.e, G.n) + 90) % 360, 105, 13, 0); })()'); i = await shot('1_station', 'both tanks on station (player and wingman)')
            if not i['drawn']['wing'] or not i['drawn']['scout']: fails.append('wingman or scout not drawn')
            await ev('void (() => { const B = __beta.battle, G = B.wing; __look(G.e, G.n, (G.h + 150) % 360, 16, 4.5, 0); })()'); await shot('2_wing_close', 'the wingman close up, before the fight')
            t = await ev('(() => { __until("wing_launch", 60); const a = __ev("wing_trophy")[0] || __ev("wing_end")[0]; return a ? a.t : null; })()')
            if t is None: fails.append('the wingman was never engaged in this battle')
            else:
                await ev('void (() => { __to(%f); const B = __beta.battle, G = B.wing, l = __ev("wing_launch")[0]; __look(G.e, G.n, ((l ? l.brg : 0) + 200) %% 360, 45, 7, 3); })()' % (t + 0.12)); await shot('3_wing_fire', 'the wingman under fire: Trophy or HKOI answering (t=%.1f)' % t)
            t = await ev('(() => { const a = __until("wing_gun", 90); return a ? a.t : null; })()')
            if t is not None:
                await ev('void (() => { __to(%f); const B = __beta.battle, G = B.wing; __look(G.e, G.n, (G.tur + 110) %% 360, 30, 4, 1); })()' % (t + 0.15)); await shot('4_wing_gun', "the wingman's main gun firing (t=%.1f)" % t)
            t = await ev('(() => { const a = __until("bomber_hkoi", 200); return a ? a.t + a.tof : null; })()')
            if t is not None:
                await ev('void (() => { __to(%f); const B = __beta.battle, fl = B.sup.flights[0], sh = fl.shots[0], F = sh.from === "wing" ? B.wing : B.tank; const br = __brg(F.e, F.n, fl.e, fl.n), a = (br + 60) * Math.PI / 180; __beta.view(fl.e + Math.sin(a) * 55, fl.n + Math.cos(a) * 55, 0, fl.alt - 6, fl.e, fl.n); __beta.scene.camera.lookAt(fl.e, __beta.world.h(fl.e, fl.n) + fl.alt, -fl.n); })()' % (t + 0.2)); i = await shot('5_bomber_hkoi', 'HKOI airbursts at a bomber drone, seen from 55 m beside it (t=%.1f)' % t)
                await ev('void (() => { const B = __beta.battle, fl = B.sup.flights[0]; const F = B.tank, br = __brg(fl.e, fl.n, F.e, F.n); const a = br * Math.PI / 180; __beta.view(fl.e + Math.sin(a) * 9, fl.n + Math.cos(a) * 9, 0, fl.alt + 3, fl.e, fl.n); __beta.scene.camera.lookAt(fl.e, __beta.world.h(fl.e, fl.n) + fl.alt, -fl.n); })()'); await shot('5b_bomber_near', 'the same moment from 9 m')
            t = await ev('(() => { const a = __until("fire_splash", 320); return a ? a.t : null; })()')
            if t is None: fails.append('no artillery mission landed in this battle')
            else:
                await ev('void (() => { __to(%f); const B = __beta.battle, F = B.sup.fires.find(f => f.state !== "cancelled" && f.rounds.some(r => r.done)), T = B.tank; __look(F.e, F.n, __brg(F.e, F.n, T.e, T.n), 170, 14, 4); })()' % (t + 1.6)); await shot('6_artillery', 'first volley of the fire mission landing (t=%.1f)' % t)
                await ev('__to(%f)' % (t + 11.8)); await shot('6b_artillery2', 'second volley')
        # ---- seed 22: bombs
        if not BOMBS: await ev('void (() => { __beta.set.seed = 22; __beta.start(); __beta.setPlaying(false); })()'); await pg.wait_for_timeout(1500)
        t = await ev('(() => { let n = 0; const B = __beta.battle; while (B.t < 400 && B.tank.alive && !B.over && !__ev("bomb_drop").length && n++ < 6000) __beta.runTo(B.t + 0.05); const a = __ev("bomb_drop")[0]; return a ? JSON.stringify([a.t, a.land, a.target]) : null; })()')
        if t is None: print('no bomb was dropped in the second battle (the drone was shot down): no bomb picture')
        else:
            t0, t1, who = json.loads(t)
            await ev('void (() => { __to(%f); const B = __beta.battle, F = "%s" === "wing" ? B.wing : B.tank; __look(F.e, F.n, (F.h + 140) %% 360, 62, 6, 32); })()' % (t0 + 1.0, who)); i = await shot('7_bomb_fall', 'bomber drone over the %s, bomb falling (t=%.1f)' % (who, t0))
            if not i['drawn']['bombers'] or not i['drawn']['bombs']: fails.append('bomber or bomb not drawn')
            await ev('void (() => { __to(%f); const B = __beta.battle, F = "%s" === "wing" ? B.wing : B.tank; __look(F.e, F.n, (F.h + 140) %% 360, 28, 5, 1); })()' % (t1 + 0.25, who)); await shot('8_bomb_land', 'the bomb lands (t=%.1f)' % t1)
            await ev('__to(%f)' % (t1 + 7.5)); await shot('9_bomb_after', 'a few seconds later')
        if BOMBS: print('errors', json.dumps(errs[:8], indent=1)); await b.close(); print('FAILED: ' + '; '.join(fails) if fails or errs else 'BOMB PICTURES TAKEN'); return
        # ---- the real frame loop through the opening engagement on both tanks
        await ev('void (() => { __beta.set.seed = 18; __beta.start(); __beta.setPlaying(false); __beta.runTo(3.6); __beta.setPlaying(true); })()'); t_a = await ev('__beta.battle.t'); t_b = t_a
        for k in range(18):   # up to 90 s of real time: software drawing on a busy machine is slow
            await pg.wait_for_timeout(5000); t_b = await ev('__beta.battle.t')
            if t_b > 9: break
        nv = await ev('JSON.stringify([__beta.battle.volleys.length, __beta.battle.wing.volleys.length])'); i = await shot('10_loop', 'after the real frame loop (battle time %.1f to %.1f; engagements on player, wingman: %s)' % (t_a, t_b, nv))
        if not t_b > t_a + 1: fails.append('the battle did not advance in the real frame loop')
        print('errors', json.dumps(errs[:8], indent=1)); await b.close()
        if errs: fails.append('%d page errors' % len(errs))
    print('FAILED: ' + '; '.join(fails) if fails else 'SUPPORT PAGE TEST PASS', '(%.0f s)' % (time.time() - T0))
asyncio.run(main())
