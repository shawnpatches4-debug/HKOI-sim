# python3 tests/beta/crewfaces.py [out folder] : the crew portraits, close enough to judge the expressions.
# Starts a battle, then puts the four faces through every state (steady, strained, shaken, panicked, frozen, wounded, out of
# action, killed, a flinch, a hit, talking) and through every single channel of the face rig at full strength, and saves each
# as a strip of four faces (commander, gunner, loader, driver), stacked into sheets. Also checks that the faces move the same
# at 30, 60, 144 and 240 frames a second, and prints what one drawing costs.
# The states are SET by this script (hudBox.fake, faces.hold: test hooks), not waited for in a battle.
# Needs the restricted test server (BASE). Prints FACES CHECK PASSED or what went wrong.
import asyncio, os, sys, json, base64, io
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('OUT', '/tmp')

STATES = [
    ('steady', {}, None),
    ('strained', {'state': 'strained', 'stress': 0.48, 'why': 'missile inbound'}, None),
    ('shaken', {'state': 'shaken', 'stress': 0.72, 'why': 'rocket passed 5 m away'}, None),
    ('panicked', {'state': 'panicked', 'stress': 0.93, 'why': 'vehicle hit'}, None),
    ('frozen', {'state': 'panicked', 'stress': 0.95, 'busy': 'frozen for 6 s more', 'why': 'vehicle hit'}, None),
    ('wounded', {'state': 'shaken', 'stress': 0.7, 'status': 'wounded', 'why': 'wounded'}, None),
    ('out of action', {'status': 'down', 'busy': 'out of action'}, None),
    ('killed', {'status': 'down', 'busy': 'killed'}, None),
    ('flinch (blast close by)', {'state': 'strained', 'stress': 0.5}, {'squeeze': 1, 'lid': 1, 'wide': 0, 'pitch': 0.3, 'shoulders': 1, 'frown': 0.9, 'stretch': 0.6}),
    ('hit on the vehicle', {'state': 'shaken', 'stress': 0.7}, {'squeeze': 1, 'lid': 1, 'wide': 0, 'pitch': 0.5, 'roll': 0.25, 'shoulders': 1, 'jaw': 0.9, 'stretch': 1}),
    ('talking, mouth open', {}, {'jaw': 0.5}),
]
CHANNELS = [('browUp', 1), ('browDown', 1), ('lid', 1), ('lid', 0.5), ('wide', 1), ('squeeze', 1), ('stretch', 1), ('frown', 1), ('snarl', 1), ('tight', 1), ('jaw', 1), ('eyeYaw', 1), ('eyeYaw', -1), ('eyePitch', 1), ('eyePitch', -1), ('pitch', 0.5), ('yaw', 0.5), ('roll', 0.4), ('shoulders', 1)]
ZERO = "{ browUp: 0, browDown: 0, lid: 0, wide: 0, squeeze: 0, stretch: 0, frown: 0, snarl: 0, tight: 0, jaw: 0, pitch: 0, yaw: 0, roll: 0, eyeYaw: 0, eyePitch: 0, shoulders: 0, pallor: 0 }"
# one strip: set the men's state and any held channels, let the springs settle (three steps of battle time), draw, hand back the picture
SNAP = '''((fake, hold, ago) => { const B = __beta, F = B.faces, H = B.hudBox, t = B.battle.t; H.fake = {}; F.hold = {}; F.note = {};
  for (const r of ['cdr', 'gnr', 'ldr', 'drv']) { H.fake[r] = Object.assign({ state: 'steady', stress: 0.08, status: 'ok', busy: null, why: null }, fake); if (hold) F.hold[r] = hold; }
  const st = () => ({ on: true, playing: true, battle: B.battle, crew: H.crewNow(B.battle), speaking: null, graphic: true });
  F.tLast = null; F.update(0.1, Object.assign(st(), { now: t - ago })); F.update(0.1, Object.assign(st(), { now: t - ago * 0.6 })); F.update(0.1, Object.assign(st(), { now: t - ago * 0.3 })); F.update(0.1, Object.assign(st(), { now: t }));
  F.draw(Object.assign(st(), { now: t })); const c = document.createElement('canvas'); c.width = 640; c.height = 200; const x = c.getContext('2d');
  ['cdr', 'gnr', 'ldr', 'drv'].forEach((r, i) => x.drawImage(F.out[r], i * 160, 0)); return c.toDataURL('image/png'); })'''

async def main():
    from PIL import Image, ImageDraw
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720}); errs = []; bad = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
        ev = pg.evaluate
        await pg.goto(os.environ['BASE'] + '#gfx=min&speed=1&map=3&seed=1&hud=engineer', timeout=120000)
        for i in range(160):
            if await ev('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1500)
        await pg.click('#go'); await pg.wait_for_timeout(1500); await ev('__beta.playFor(4)'); await ev('__beta.setPlaying(false)')
        for i in range(90):
            if await ev('!!__beta.faces && (__beta.faces.ok || __beta.faces.failed)'): break
            await pg.wait_for_timeout(2000)
        ok = await ev('!!__beta.faces && __beta.faces.ok'); print('portraits loaded', ok, '| signs', await ev('__beta.faces && __beta.faces.ok ? JSON.stringify(["cdr","gnr","ldr","drv"].map(r => [__beta.faces.men[r].jawSign, __beta.faces.men[r].nodSign, __beta.faces.men[r].yawSign])) : ""'))
        if not ok: bad.append('the crew portraits did not load')
        else:
            async def strips(items, name):
                rows = []
                for label, fake, hold in items:
                    url = await ev('%s(%s, %s, %s)' % (SNAP, json.dumps(fake), 'Object.assign(%s, %s)' % (ZERO, json.dumps(hold)) if hold is not None and name == 'channels' else json.dumps(hold), '4.5'))
                    rows.append((label, Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB')))
                per = 6
                for k in range(0, len(rows), per):
                    part = rows[k:k + per]; sheet = Image.new('RGB', (640 * 2 + 150, 400 * len(part)), (10, 14, 12)); d = ImageDraw.Draw(sheet)
                    for i, (label, im) in enumerate(part): sheet.paste(im.resize((1280, 400), Image.LANCZOS), (150, 400 * i)); d.text((6, 400 * i + 190), label, fill=(230, 239, 233))
                    path = os.path.join(OUT, 'faces_%s_%d.png' % (name, k // per + 1)); sheet.save(path); print('saved', path)
            await strips(STATES, 'states')
            await strips([('%s %+.1f' % (c, v), {}, {c: v}) for c, v in CHANNELS], 'channels')
            # the same two seconds of a shaken man going to steady, stepped at four frame rates: the channels must agree
            res = {}
            for fps in (30, 60, 144, 240):
                res[fps] = json.loads(await ev('''(fps => { const B = __beta, F = B.faces, H = B.hudBox, t0 = B.battle.t - 3; F.hold = null; F.note = {}; H.fake = { gnr: { state: 'shaken', stress: 0.72, status: 'ok', busy: null } };
                  const st = now => ({ on: true, playing: true, battle: B.battle, crew: H.crewNow(B.battle), speaking: null, graphic: true, now }); F.tLast = null; F.update(0.1, st(t0));
                  H.fake = { gnr: { state: 'steady', stress: 0.08, status: 'ok', busy: null } }; const n = Math.floor(0.25 * fps + 1e-9), rem = 0.25 - n / fps; for (let i = 1; i <= n; i++) { F.acc = 1; F.update(1 / fps, st(t0 + i / fps)); } if (rem > 1e-6) { F.acc = 1; F.update(rem, st(t0 + 0.25)); }   /* exactly a quarter of a second at every rate */
                  const x = F.men.gnr.sp.x; return JSON.stringify([x.browUp, x.wide, x.frown, x.thrust, x.pallor].map(v => +v.toFixed(4))); })(%d)''' % fps))
                print(' ', fps, 'fps: brow, eyes wide, frown, head thrust, pallor after 0.25 s', res[fps])
            for fps, v in res.items():
                if max(abs(a - c) for a, c in zip(v, res[60])) > 0.02: bad.append('the faces ease differently at %d fps' % fps)
            cost = json.loads(await ev('''(() => { const B = __beta, F = B.faces, H = B.hudBox; H.fake = null; F.hold = null; const t = performance.now(); for (let i = 0; i < 20; i++) { F.acc = 1; F.update(0.1, { on: true, playing: true, battle: B.battle, crew: H.crewNow(B.battle), speaking: null, graphic: true, now: B.battle.t + i * 0.01 }); } return JSON.stringify({ msEach: +((performance.now() - t) / 20).toFixed(2), calls: F.gl.info.render.calls, triangles: F.gl.info.render.triangles }); })()'''))
            print('cost of one drawing of the four faces here (software drawing):', cost)
            await ev('void (__beta.hudBox.fake = null, __beta.faces.hold = null, __beta.faces.tLast = null)')
            # the panel as the viewer sees it, with one man wounded, one frozen, one killed (set by this script)
            await ev('void (__beta.hudBox.fake = { gnr: { state: "shaken", stress: 0.72, why: "vehicle hit on the turret front" }, ldr: { state: "shaken", stress: 0.7, status: "wounded", why: "wounded" }, drv: { state: "panicked", stress: 0.95, busy: "frozen for 6 s more", why: "vehicle hit on the turret front" } })')
            await ev('__beta.setPlaying(true)'); await ev('__beta.playFor(0.4)'); await pg.wait_for_timeout(7000); await ev('__beta.setPlaying(false)'); await pg.wait_for_timeout(2500)
            await pg.screenshot(path=os.path.join(OUT, 'faces_panel_hurt.png'), clip={'x': 0, 'y': 40, 'width': 420, 'height': 640})
            print('panel text:', (await ev('document.getElementById("crewmen").innerText')).replace('\n', ' / ')[:700])
            await ev('void (__beta.hudBox.fake = { cdr: { status: "down", busy: "killed" }, ldr: { status: "down", busy: "out of action" } })')
            await ev('__beta.setPlaying(true)'); await ev('__beta.playFor(0.4)'); await pg.wait_for_timeout(8000); await ev('__beta.setPlaying(false)'); await pg.wait_for_timeout(2500)
            await pg.screenshot(path=os.path.join(OUT, 'faces_panel_dead.png'), clip={'x': 0, 'y': 40, 'width': 420, 'height': 640})
            print('panel text:', (await ev('document.getElementById("crewmen").innerText')).replace('\n', ' / ')[:700])
            if not await ev('document.getElementById("errbar").hidden'): bad.append('the red error bar is showing: ' + (await ev('document.getElementById("errbar").textContent'))[:200])
        print('console errors', errs[:6]); print('FACES CHECK ' + ('PASSED' if not bad and not errs else 'FAILED: ' + '; '.join(bad + errs[:2]))); await b.close()
asyncio.run(main())
