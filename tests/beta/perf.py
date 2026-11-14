# python3 tests/beta/perf.py [hash params]: where the processor's time goes in the real frame loop.
# Wraps the page's per-frame calls with timers, lets the real frame loop run for a while in a battle, and prints the average
# milliseconds each call costs per frame. Headless Chrome here draws in software, so scene.render is mostly the software
# drawing and says little about a graphics card; every other line is processor time and means the same on any machine.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
WRAP = """void (() => { const B = __beta, T = window.__pt = {}, n = window.__pn = { frames: 0 };
  const wrap = (name, obj, key) => { if (!obj || typeof obj[key] !== 'function' || obj[key].__w) return; const f = obj[key];
    const g = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t0; const T2 = window.__pt; const e = T2[name] || (T2[name] = { ms: 0, calls: 0, max: 0 }); e.ms += d; e.calls++; if (d > e.max) e.max = d; } };
    g.__w = true; obj[key] = g; };
  wrap('scene.render', B.scene, 'render'); wrap('hudBox.update', B.hudBox, 'update'); wrap('interior.update', B.interior, 'update');
  wrap('volleys.update', B.volleys, 'update'); wrap('cams.update', B.cams, 'update'); wrap('sound.update', B.sound, 'update');
  wrap('tank.animate', B.tank, 'animate'); wrap('battle.step', B.battle, 'step'); if (B.faces) { wrap('faces.update', B.faces, 'update'); wrap('faces.draw', B.faces, 'draw'); wrap('faces.render', B.faces, 'render'); }
  if (B.scene.vehicles) wrap('vehicles.update', B.scene.vehicles, 'update'); if (B.scene.fx) wrap('fx.update', B.scene.fx, 'update');
  const raf = window.requestAnimationFrame; let last = performance.now(); window.__pgap = [];
  window.requestAnimationFrame = cb => raf(t => { const a = performance.now(); cb(t); const d = performance.now() - a; n.frames++; window.__pgap.push(d); }); })()"""
async def main():
    params = sys.argv[1] if len(sys.argv) > 1 else 'gfx=low&speed=1'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto(os.environ['BASE'] + '#' + params, timeout=120000)
        await pg.wait_for_function('window.__beta && window.__beta.ready', timeout=300000)
        await pg.evaluate("document.getElementById('go').click()"); await pg.wait_for_timeout(3000)
        await pg.evaluate(WRAP)
        for view in os.environ.get('VIEWS', 'orbit').split(','):
            if view != 'orbit': await pg.evaluate("void __beta.setView(%s)" % json.dumps(view))
            await pg.evaluate("void (window.__pt = Object.keys(window.__pt).reduce((o, k) => (o[k] = { ms: 0, calls: 0, max: 0 }, o), {}), window.__pn.frames = 0, window.__pgap = [])")
            await pg.wait_for_timeout(int(os.environ.get('SECS', '40')) * 1000)
            r = json.loads(await pg.evaluate("JSON.stringify({ T: window.__pt, frames: window.__pn.frames, gap: window.__pgap.slice().sort((a, b) => a - b), t: __beta.battle.t, info: __beta.scene.renderer.info.render, mem: __beta.scene.renderer.info.memory, faces: __beta.faces ? { ms: __beta.faces.ms, draws: __beta.faces.draws, ok: __beta.faces.ok, failed: __beta.faces.failed } : null, hud: __beta.hud(), mode: __beta.cams.mode })"))
            F = max(1, r['frames']); g = r['gap']
            print(f"== view {view} ({r['mode']}, display {r['hud']}): {r['frames']} frames, battle t {r['t']:.1f}, whole frame callback median {g[len(g)//2] if g else 0:.1f} ms, max {g[-1] if g else 0:.1f} ms")
            for k, e in sorted(r['T'].items(), key=lambda kv: -kv[1]['ms']):
                if e['calls']: print(f"   {k:18s} {e['ms']/F:8.2f} ms a frame   ({e['calls']} calls, worst {e['max']:.1f} ms)")
            print('   draws', r['info'], 'memory', r['mem'], 'faces', r['faces'])
        print('errors', errs[:5]); await b.close()
asyncio.run(main())
