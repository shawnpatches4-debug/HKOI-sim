# python3 tests/beta/fpvfeed.py [hash params] : the first-person drone camera (src/app/fpvfeed.js).
# Fights a drone battle through unseen, opens its replay, and rides a radio drone and a fibre drone: good link, weak link, the end
# of the flight (snow, black, or the frozen last frame after a hit), the team menu, and the same camera at 30/60/144/240 frames a second.
# Needs the restricted test server (BASE). SHOT = picture prefix. Prints FPV CHECK PASSED or what went wrong.
import asyncio, os, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        PART = os.environ.get('PART', 'radio,fibre,hit,menu,fps')   # run one or two parts at a time: the browser is shared
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))}); errs = []; bad = []; shot = os.environ.get('SHOT', '/tmp/fpv')
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        await pg.goto(os.environ['BASE'] + '#' + (sys.argv[1] if len(sys.argv) > 1 else 'gfx=low&speed=1&spectator=1&force=drones&play=1'), timeout=120000)
        for i in range(120):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready && window.__beta.battle)'): break
            await pg.wait_for_timeout(1500)
        ev = lambda s: pg.evaluate(s)
        js = lambda s: pg.evaluate('JSON.stringify(' + s + ')')
        await ev('void (__beta.runTo(1800))')
        for i in range(120):
            if await ev('__beta.state() === "result"'): break
            await pg.wait_for_timeout(1000)
        E = json.loads(await js('__beta.battle.events.filter(e => e.type === "drone_launch" || (e.type === "end" && /^fpv/.test(e.key)))'))
        keys = json.loads(await js('Object.fromEntries(__beta.battle.units.map(u => [u.id, u.spec.key]))'))
        sorties = []
        for l in sorted([e for e in E if e['type'] == 'drone_launch'], key=lambda e: e['t']):
            ends = sorted([e for e in E if e['type'] == 'end' and e['uid'] == l['uid'] and e['t'] >= l['t']], key=lambda e: e['t'])
            if ends: sorties.append({'uid': l['uid'], 'key': keys[str(l['uid'])], 't0': l['t'], 't1': ends[0]['t'], 'how': ends[0]['how'], 'by': ends[0].get('by')})
        print('battle over at', round(await ev('__beta.battle.t'), 1), 's; drone flights:'); [print('  ', s) for s in sorties]
        await ev('document.getElementById("r-replay").click()'); await pg.wait_for_timeout(2500); await ev('void (__beta.setPlaying(false))')
        bar = 'void ((b => { b.value = %d; b.dispatchEvent(new Event("input")); })(document.getElementById("rp-bar")))'
        await ev(bar % 500); T = 2 * await ev('__beta.battle.t')
        async def goto(t, uid, settle=4000):
            await ev(bar % max(0, int((t - 3) / T * 1000))); await ev('void (__beta.cams.enemyId = %d, __beta.setView("fpv"))' % uid)
            await ev('void ((() => { let n = 0; while (__beta.bank()[1] < %f && n++ < 4000) __beta.advance(0.02); })())' % t); await pg.wait_for_timeout(settle)
            return json.loads(await js('''(() => { const q = s => (document.querySelector('#fpv ' + s) || {}).textContent || '', f = document.getElementById('fpv'), c = __beta.scene.camera;
              return { t: +__beta.bank()[1].toFixed(2), mode: __beta.cams.mode, shown: f ? !f.hidden : false, cls: f ? f.className : '', tl: q('.tl'), tr: q('.tr'), bl: q('.bl'), br: q('.br'), bc: q('.bc'), tc: q('.tc'), warn: q('.warn'), cap: q('.cap'),
                snow: +getComputedStyle(document.getElementById('fpv-snow')).opacity, filter: document.getElementById('view').style.filter, fov: c.fov, phase: __beta.fpvFeed && __beta.fpvFeed.info ? __beta.fpvFeed.info.phase : null }; })()'''))
        num = lambda s, key: float(s.split(key)[1].split()[0])
        radio = [s for s in sorties if s['key'] == 'fpv']; fibre = [s for s in sorties if s['key'] == 'fpv_fiber']; hits = [s for s in sorties if s['how'] == 'hit']
        if not radio: bad.append('no radio drone flew in this battle')
        if not fibre: bad.append('no fibre drone flew in this battle')
        if radio and 'radio' in PART:
            s = next((x for x in radio if x['how'] != 'hit' and x['t1'] - x['t0'] > 25), radio[0])
            a = await goto(s['t0'] + 6, s['uid']); print('radio, just launched', a); await pg.screenshot(path=shot + '_radio_good.png')
            if not a['shown'] or a['mode'] != 'fpv' or a['phase'] != 'fly': bad.append('the drone camera did not come up on a flying radio drone')
            if 'RSSI' not in a['tl'] or 'ARMED' not in a['tr'] or 'V ' not in a['bl'] or 'km/h' not in a['br'] or 'ALT' not in a['br'] or 'DST' not in a['br'] or a['cap'] != 'Representative FPV goggle feed': bad.append('the on-screen display is incomplete')
            if 'RSSI' in a['tl'] and num(a['tl'], 'RSSI') < 80: bad.append('the link is not good just after launch')
            if a['fov'] < 70: bad.append('the camera is not wide-angle')
            c = await goto(s['t1'] - 2.0, s['uid']); print('radio, 2 s before the end', c); await pg.screenshot(path=shot + '_radio_weak.png')
            if 'RSSI' in c['tl'] and 'RSSI' in a['tl'] and not (num(c['tl'], 'RSSI') < num(a['tl'], 'RSSI') - 10 and c['snow'] > 0.2): bad.append('the link did not weaken (with snow) far from the pilot and low near the vehicle')
            if 'DST' in c['br'] and 'DST' in a['br'] and not num(c['br'], 'DST') < num(a['br'], 'DST'): bad.append('the distance to the target did not come down')
            d = await goto(s['t1'] + 0.6, s['uid']); print('radio, after the end (%s)' % s['how'], d); await pg.screenshot(path=shot + '_radio_lost.png')
            if s['how'] != 'hit' and not ('NO SIGNAL' in d['warn'] and d['snow'] == 1 and 'brightness(0)' in d['filter']): bad.append('a destroyed radio drone does not cut to snow with NO SIGNAL')
        if fibre and 'fibre' in PART:
            s = fibre[0]; mid = s['t1'] - 2.0
            a = await goto(mid, s['uid']); print('fibre, 2 s before the end', a); await pg.screenshot(path=shot + '_fibre.png')
            if 'FIBRE LINK' not in a['tl'] or a['snow'] != 0 or a['warn']: bad.append('the fibre drone does not keep a clean picture')
            d = await goto(s['t1'] + 0.6, s['uid']); print('fibre, after the end (%s)' % s['how'], d); await pg.screenshot(path=shot + '_fibre_lost.png')
            if 'LINK LOST' not in d['warn'] or d['snow'] != 0: bad.append('the fibre drone does not show LINK LOST without snow at the end')
        if hits and 'hit' in PART:
            s = hits[0]; await goto(s['t1'] - 0.2, s['uid'], 6000)       # a real frame is drawn here: the feed keeps it
            await ev('void ((() => { let n = 0; while (__beta.bank()[1] < %f && n++ < 400) __beta.advance(0.02); })())' % (s['t1'] + 0.4)); await pg.wait_for_timeout(4000)
            h = json.loads(await js('{cls: document.getElementById("fpv").className, warn: document.querySelector("#fpv .warn").textContent, bc: document.querySelector("#fpv .bc").textContent, filter: document.getElementById("view").style.filter}')); print('hit: after impact', h); await pg.screenshot(path=shot + '_hit_frozen.png')
            if 'frozen' not in h['cls'] or 'impact' not in h['bc']: bad.append('after a hit the feed does not freeze on its last frame')
        if not hits: print('NOTE: no drone hit the vehicle in this battle, so the frozen last frame was not exercised')
        # the team menu: a drone crew has a line for its drone's camera; a click on it rides it, a click on another team leaves
        if sorties and 'menu' in PART:
            s = sorties[0]; await ev('void (__beta.setView("troops"))'); await pg.wait_for_timeout(2500)
            m = json.loads(await js('{rows: [...document.querySelectorAll("#units-list .urow")].map(r => r.textContent), drones: document.querySelectorAll("#units-list .udrone").length}')); print('team menu', m)
            if m['drones'] != len([k for k in keys.values() if k.startswith('fpv')]): bad.append('the team menu has no drone-camera line for each drone crew')
            await ev('document.querySelector("#units-list .udrone").click()'); await pg.wait_for_timeout(2500)
            m2 = json.loads(await js('{mode: __beta.cams.mode, shown: !document.getElementById("fpv").hidden, menu: !document.getElementById("units").hidden, on: document.querySelectorAll("#units-list .udrone.on").length}')); print('after clicking the drone line', m2); await pg.screenshot(path=shot + '_menu.png')
            if m2['mode'] != 'fpv' or not m2['shown'] or not m2['menu'] or m2['on'] != 1: bad.append('clicking the drone line in the team menu does not open its camera')
            await ev('void (__beta.setView("orbit"))'); await pg.wait_for_timeout(1500)
            off = json.loads(await js('{shown: !document.getElementById("fpv").hidden, filter: document.getElementById("view").style.filter, tr: document.getElementById("view").style.transform}')); print('back outside', off)
            if off['shown'] or off['filter'] or off['tr']: bad.append('leaving the drone camera leaves its overlay or its picture wash behind')
        # the same camera and the same numbers at any frame rate: one second of flight stepped at 30, 60, 144 and 240 frames a second
        if radio and 'fps' in PART:
            s = next((x for x in radio if x['t1'] - x['t0'] > 25), radio[0]); out = {}
            for fps in (30, 60, 144, 240):
                await ev(bar % int((s['t1'] - 8) / T * 1000)); await ev('void (__beta.cams.enemyId = %d, __beta.setView("fpv"))' % s['uid'])
                out[fps] = json.loads(await js('''(() => { const B = __beta.battle, F = __beta.fpvFeed, c = __beta.scene.camera, fps = %d, t0 = __beta.bank()[1];
                  for (let i = 0; i < 3 * fps; i++) { __beta.advance(1 / fps); const t = Math.min(__beta.bank()[1], B.t); __beta.volleys.update(t, 1 / fps); F.update({ cams: __beta.cams, battle: B, volleys: __beta.volleys, world: __beta.world, tank: B.tankAt ? B.tankAt(t) : B.tank, t, dt: 1 / fps }, true); }
                  const q = s => document.querySelector('#fpv ' + s).textContent; return { t0, t: __beta.bank()[1], p: c.position.toArray(), q: c.quaternion.toArray(), osd: [q('.tl'), q('.tr'), q('.bl'), q('.br'), q('.bc')].join(' / ') }; })()''' % fps))
            ref = out[30]; worst = 0.0; same = True
            for fps in (60, 144, 240):
                worst = max(worst, max(abs(x - y) for x, y in zip(ref['p'] + ref['q'], out[fps]['p'] + out[fps]['q']))); same = same and out[fps]['osd'] == ref['osd']
            print('frame rates: 3 s of flight from t=%.2f to t=%.4f/%.4f/%.4f/%.4f; largest difference in camera position (m) or rotation = %.6f; on-screen numbers the same: %s' % (ref['t0'], ref['t'], out[60]['t'], out[144]['t'], out[240]['t'], worst, same)); print('   ', ref['osd'].replace('\n', ' | '))
            if worst > 0.002 or not same: bad.append('the drone camera is not the same at every frame rate')
        print('console errors', errs[:5]); print('FPV CHECK ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
