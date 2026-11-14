# python3 tests/beta/director.py <out folder> [logic] [strip] [xray] : the film director and the X-ray of a hit, in the real page.
# Needs the restricted test server (BASE); run it as  PORT=<port> bash tools/run_test.sh tests/beta/director.py <out folder> logic strip xray
#   logic  the film is the same at 30, 60, 144 and 240 frames a second (stepped with __beta.advance, never by watching); slow motion
#          lowers the speed and gives it back; the camera is handed back on a touch of the picture and on picking a camera;
#          the director survives a rewind and scrubbing in replay; the page still runs with it switched off
#   strip  a picture strip (1280x720) of one whole engagement as the director films it, captions on
#   xray   X-ray pictures of a hit that does not get through, one that gets through and is survived, and a killing hit
# Prints PASS or what went wrong. Headless Chrome here draws a frame or two a second: timing is judged by numbers only.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; PARTS = sys.argv[2:] or ['logic', 'strip', 'xray']
HASH = 'gfx=%s&speed=1&force=standoff&biome=desert&map=3&seed=3&skill=trained&mission=hold&waves=1'

FPS_JS = r'''(() => { const B = __beta, D = B.director, out = {};
  if (!D.on) D.toggle();
  for (const fps of [30, 60, 144, 240]) {
    B.start(); B.setPlaying(true); D.app.speed = 1; D.yielded = false;
    const dt = 1 / fps, log = { shots: [], caps: [], slow: [] }; let lastShot = null, lastCap = null, slow = false, n = 0, modes = {};
    while (B.battle.t < TEND && n++ < 400000) {
      B.advance(dt * D.app.speed); D.update(dt);
      const t = +Math.min(D.app.tNow, B.battle.t).toFixed(3);
      if (D.shot !== lastShot) { lastShot = D.shot; log.shots.push([t, D.shot ? (D.shot.cam || D.shot.rig) : null]); modes[B.cams.mode] = 1; }
      if (D.capText !== lastCap) { lastCap = D.capText; if (D.capText) log.caps.push([t, D.capText]); }
      if (D.slow !== slow) { slow = D.slow; log.slow.push([t, slow, D.app.speed]); }
    }
    out[fps] = { log, plan: D.plan.list(), shown: D.plan.shown.map(c => [c.t0, c.text]), speedEnd: D.app.speed, frames: n, modes: Object.keys(modes), err: document.getElementById('errbar').hidden ? '' : document.getElementById('errbar').textContent.slice(0, 200) };
  }
  B.setPlaying(false); return JSON.stringify(out); })()'''

HAND_JS = r'''(() => { const B = __beta, D = B.director, r = {}, run = n => { for (let i = 0; i < n; i++) { B.advance(0.1); D.update(0.1); } };
  if (!D.on) D.toggle(); B.start(); B.setPlaying(true); D.app.speed = 1; run(80);
  r.filming = { ctrl: D.ctrl, mode: B.cams.mode, cap: D.plan.shown.length };
  B.scene.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true })); r.touched = { ctrl: D.ctrl, yielded: D.yielded, mode: B.cams.mode, on: D.on };
  run(40); r.stays = { ctrl: D.ctrl, mode: B.cams.mode, capsGoOn: D.plan.shown.length > r.filming.cap || !!D.capText };
  D.toggle(); run(2); r.resumed = { ctrl: D.ctrl, yielded: D.yielded };
  B.cams.set('chase'); run(2); r.picked = { ctrl: D.ctrl, yielded: D.yielded, mode: B.cams.mode };
  D.toggle(); run(2); r.resumed2 = { ctrl: D.ctrl };
  D.toggle(); run(2); r.off = { on: D.on, ctrl: D.ctrl, mode: B.cams.mode, speed: D.app.speed, capHidden: document.getElementById('dir-cap').style.opacity === '0', tagHidden: document.getElementById('dir-tag').hidden };
  D.toggle(); B.setPlaying(false); r.err = document.getElementById('errbar').hidden ? '' : document.getElementById('errbar').textContent.slice(0, 200); return JSON.stringify(r); })()'''

async def ready(pg):
    for i in range(160):
        if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): return True
        await pg.wait_for_timeout(1500)
    return False

async def main():
    bad = []; os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        errs = []
        async def page(w, h, gfx):
            pg = await b.new_page(viewport={'width': w, 'height': h})
            pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text[:300]))
            await pg.goto(os.environ['BASE'] + '#' + HASH % gfx, timeout=120000)
            if not await ready(pg): bad.append('page not ready')
            return pg

        if 'logic' in PARTS:
            pg = await page(480, 270, 'min')
            # with the director never switched on, the page plays as before and the director holds nothing
            off = json.loads(await pg.evaluate('''(() => { const B = __beta; B.start(); for (let i = 0; i < 120; i++) B.advance(0.1); return JSON.stringify({ t: B.battle.t, hasDirector: !!B.director, on: B.director ? B.director.on : null, mode: B.cams.mode }); })()'''))
            await pg.wait_for_timeout(2500)   # a few real frames, so the frame loop has called the director and the X-ray panel
            off2 = json.loads(await pg.evaluate('JSON.stringify({ d: !!__beta.director, on: __beta.director && __beta.director.on, ctrl: __beta.director && __beta.director.ctrl, mode: __beta.cams.mode, xr: !!__beta.xray, xrView: !!(__beta.xray && __beta.xray.view), tag: document.getElementById("dir-tag").hidden })'))
            print('director off:', off2)
            if off2['on'] or off2['ctrl'] or off2['xrView'] or not off2['tag'] or not off2['d'] or not off2['xr']: bad.append('director or X-ray not idle when switched off')
            res = json.loads(await pg.evaluate(FPS_JS.replace('TEND', '34')))
            ref = res['30']
            for fps in ['30', '60', '144', '240']:
                r = res[fps]; print(f"{fps} fps: {r['frames']} frames, {len(r['log']['shots'])} shots, {len(r['log']['caps'])} captions, {len(r['log']['slow']) // 2} slow-motion spells, speed at the end {r['speedEnd']}, cameras used {r['modes']}")
                if r['err']: bad.append(f'frame error at {fps} fps: ' + r['err'])
                if r['plan'] != ref['plan'] or r['shown'] != ref['shown']: bad.append(f'the plan differs at {fps} fps')
                if [s[1] for s in r['log']['shots']] != [s[1] for s in ref['log']['shots']] or any(abs(a[0] - c[0]) > 0.15 for a, c in zip(r['log']['shots'], ref['log']['shots'])): bad.append(f'the shots seen differ at {fps} fps')
                if [s[1] for s in r['log']['caps']] != [s[1] for s in ref['log']['caps']] or any(abs(a[0] - c[0]) > 0.15 for a, c in zip(r['log']['caps'], ref['log']['caps'])): bad.append(f'the captions seen differ at {fps} fps')
                if len(r['log']['slow']) != len(ref['log']['slow']) or any(abs(a[0] - c[0]) > 0.15 for a, c in zip(r['log']['slow'], ref['log']['slow'])): bad.append(f'slow motion differs at {fps} fps: {r["log"]["slow"]} against {ref["log"]["slow"]}')
                if r['speedEnd'] != 1: bad.append(f'speed not given back at {fps} fps')
                if not r['log']['slow'] or any(s[1] and s[2] != 0.25 for s in r['log']['slow']): bad.append(f'slow motion did not lower the speed to a quarter at {fps} fps')
            print('shots at 60 fps:', ' | '.join(f'{s[0]:.1f} {s[1]}' for s in res['60']['log']['shots']))
            print('captions at 60 fps:'); [print(f'   {c[0]:6.1f}  {c[1]}') for c in res['60']['log']['caps']]
            print('slow motion at 60 fps (battle time, on/off, speed):', res['60']['log']['slow'])
            h = json.loads(await pg.evaluate(HAND_JS)); print('hand-back:', h)
            if not h['filming']['ctrl']: bad.append('director not filming after 8 s')
            if h['touched']['ctrl'] or not h['touched']['yielded'] or h['touched']['mode'] == 'free' or not h['touched']['on']: bad.append('camera not handed back on a touch of the picture')
            if h['stays']['ctrl'] or not h['stays']['capsGoOn']: bad.append('director took the camera again by itself, or the captions stopped')
            if not h['resumed']['ctrl']: bad.append('director did not film again when asked')
            if h['picked']['ctrl'] or h['picked']['mode'] != 'chase': bad.append('camera not handed back when a camera was picked')
            if h['off']['on'] or h['off']['ctrl'] or h['off']['mode'] == 'free' or h['off']['speed'] != 1 or not h['off']['capHidden'] or not h['off']['tagHidden']: bad.append('switching off did not give everything back')
            if h['err']: bad.append('frame error in hand-back: ' + h['err'])
            # rewind and scrub: fight the battle out, open the replay, jump about; the plan must match the film of the straight run
            await pg.evaluate('void (__beta.start(), __beta.runTo(900))')
            for i in range(90):
                if await pg.evaluate('__beta.state() === "result"'): break
                await pg.wait_for_timeout(1000)
            await pg.evaluate('document.getElementById("r-replay").click()'); await pg.wait_for_timeout(1500)
            for frac in [600, 150, 420]:
                await pg.evaluate(f'void (() => {{ const bar = document.getElementById("rp-bar"); bar.value = {frac}; bar.dispatchEvent(new Event("input")); __beta.setPlaying(false); }})()'); await pg.wait_for_timeout(1800)
                s = json.loads(await pg.evaluate('(() => { const D = __beta.director; D.update(0.016); return JSON.stringify({ t: __beta.battle.t, plan: D.plan.list(), shown: D.plan.shown.map(c => [c.t0, c.text]), ctrl: D.ctrl, err: document.getElementById("errbar").hidden ? "" : document.getElementById("errbar").textContent.slice(0, 200) }); })()'))
                t = min(s['t'], 33.5); cut = lambda L: [x for x in L if float(str(x).split(' ')[0] if isinstance(x, str) else x[0]) <= t - 0.5]
                same = cut(s['plan']) == cut(ref['plan']) and cut(s['shown']) == cut(ref['shown'])
                print(f"replay scrubbed to {frac / 10:.0f}%: battle t {s['t']:.1f}, {len(s['plan'])} shots planned, same film as the straight run up to {t:.1f} s: {same}")
                if not same: bad.append(f'film differs after scrubbing to {frac / 10:.0f}%')
                if s['err']: bad.append('frame error after scrub: ' + s['err'])
            await pg.screenshot(path=os.path.join(OUT, 'director_replay.png')); await pg.close()

        if 'strip' in PARTS:
            pg = await page(1280, 720, os.environ.get('GFX', 'medium'))
            # first pass, unseen: learn the film; second pass: step to each moment and take the picture
            plan = json.loads(await pg.evaluate('''(() => { const B = __beta, D = B.director; if (!D.on) D.toggle(); B.start(); B.setPlaying(false); B.runTo(34); D.update(0.016);
              return JSON.stringify({ shots: D.plan.shots.map(s => [s.t0, s.t1, s.cam || s.rig]), caps: D.plan.shown.map(c => [c.t0, c.text]), slows: D.plan.slows.map(s => [s[0], s[1]]) }); })()'''))
            times = []
            for t0, t1, what in plan['shots']:
                if 4.5 < t0 < 24: times.append((round(t0 + min(1.1, max(0.4, (t1 - t0) * 0.55)), 1), what))
            for a, c in plan['slows']: times.append((round((a + c) / 2 + 0.05, 2), 'decisive'))
            times = sorted(set(times))[:int(os.environ.get('NSHOT', '16'))]
            await pg.evaluate('void (__beta.start(), __beta.setPlaying(false))'); await pg.wait_for_timeout(1500)
            for i, (t, what) in enumerate(times):
                info = json.loads(await pg.evaluate(f'''(() => {{ const B = __beta, D = B.director; let n = 0; while (B.battle.t < {t} - 1e-6 && n++ < 2000) {{ B.playFor(0.1); D.update(0.1); }}
                  return JSON.stringify({{ t: B.battle.t, mode: B.cams.mode, shot: D.shot ? (D.shot.cam || D.shot.rig) : null, cap: D.capText, xr: !document.getElementById('xr').hidden }}); }})()'''))
                await pg.wait_for_timeout(int(os.environ.get('SETTLE', '3500')))
                f = os.path.join(OUT, f'strip_{i:02d}.png'); await pg.screenshot(path=f, timeout=120000); print(f"strip {i:02d}  t {info['t']:5.1f}  {str(info['shot']):9s} camera {info['mode']:7s} x-ray {info['xr']}  '{info['cap'] or ''}'")
            e = await pg.evaluate('document.getElementById("errbar").hidden ? "" : document.getElementById("errbar").textContent.slice(0, 300)')
            if e: bad.append('frame error in the strip: ' + e)
            print(json.dumps(await pg.evaluate('__beta.scene.stats()'))); await pg.close()

        if 'xray' in PARTS:
            pg = await page(1280, 720, 'min')
            # find one battle of each kind (the page's own battles; a few seconds each, unseen)
            found = json.loads(await pg.evaluate('''(() => { const B = __beta, want = { none: null, through: null, kill: null }, hits = b => { const o = []; for (const v of b.volleys) for (const h of DMG.report(v.rec, v.cfg)) o.push(h); return o; };
              for (const [force, biome] of [['ambush', 'farmland'], ['standoff', 'farmland'], ['ambush', 'desert'], ['heavy', 'farmland']]) for (let seed = 1; seed <= 9; seed++) { if (want.none && want.through && want.kill) break;
                B.set.force = force; B.set.biome = biome; B.set.seed = seed; B.set.custom = null; B.start(); B.setPlaying(false); B.runTo(45); const H = hits(B.battle);
                H.forEach((h, i) => { const k = !h.penetrated ? 'none' : h.killing ? 'kill' : 'through'; if (!want[k] && (k !== 'through' || h.comps.length || !want._t)) { if (k === 'through' && !h.comps.length) { want._t = { force, biome, seed, i }; return; } want[k] = { force, biome, seed, i, zone: h.zoneName, key: h.key, comps: h.comps.map(c => c.id + ':' + c.state).join(',') }; } }); }
              if (!want.through && want._t) want.through = want._t; delete want._t; return JSON.stringify(want); })()'''))
            print('battles used for the X-ray pictures:', found)
            for k in ['none', 'through', 'kill']:
                w = found.get(k)
                if not w: bad.append('no battle found with a hit of kind ' + k); continue
                ok = await pg.evaluate(f'''(() => {{ const B = __beta; B.set.force = '{w['force']}'; B.set.biome = '{w['biome']}'; B.set.seed = {w['seed']}; B.start(); B.setPlaying(false); B.runTo(45); return B.xray.open(B.battle, {w['i']}, true); }})()''')
                await pg.wait_for_timeout(int(os.environ.get('SETTLE', '3500')))
                st = json.loads(await pg.evaluate('JSON.stringify({ open: !document.getElementById("xr").hidden, shell: __beta.xray.view ? __beta.xray.view.shell.children.length + __beta.xray.view.shellTurret.children.length : 0, text: document.querySelector("#xr .xr-body > div:last-child").innerText.replace(/\\n+/g, " | ").slice(0, 600) })'))
                print(f'x-ray {k}: opened {ok}, shell pieces {st["shell"]}:', st['text'])
                if not ok or not st['open'] or 'estimates' not in st['text']: bad.append('X-ray did not open or lacks the estimates note for ' + k)
                await pg.screenshot(path=os.path.join(OUT, f'xray_{k}.png'), timeout=120000)
                await pg.locator('#xr').screenshot(path=os.path.join(OUT, f'xray_{k}_panel.png'), timeout=120000)
            # the small panel during a battle, then closed: nothing is drawn any more
            await pg.evaluate('void (__beta.xray.open(__beta.battle, 0, false))'); await pg.wait_for_timeout(2500); await pg.screenshot(path=os.path.join(OUT, 'xray_small.png'), timeout=120000)
            idle = json.loads(await pg.evaluate('(() => { const X = __beta.xray; X.close(); const n0 = X.view.r.info.render.frame; return new Promise(res => setTimeout(() => res(JSON.stringify({ hidden: document.getElementById("xr").hidden, drawn: X.view.r.info.render.frame - n0 })), 2500)); })()'))
            print('x-ray closed:', idle)
            if not idle['hidden'] or idle['drawn'] > 1: bad.append('the X-ray keeps drawing after it is closed')
            e = await pg.evaluate('document.getElementById("errbar").hidden ? "" : document.getElementById("errbar").textContent.slice(0, 300)')
            if e: bad.append('frame error with the X-ray: ' + e)
            await pg.close()
        await b.close()
    for e in errs[:8]: print('page error:', e)
    if errs: bad.append(f'{len(errs)} page errors')
    print('DIRECTOR PAGE TEST ' + ('PASS' if not bad else 'FAIL: ' + '; '.join(bad)))
asyncio.run(main())
