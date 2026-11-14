# python3 tests/beta/lookset.py <out dir> [gfx] [scene names...] : the standing picture set for judging how the world looks.
# One headless browser, one page load per scene (setting + condition), several camera views each; writes <scene>_<view>.png and stats.json.
# A scene name may carry its own view list: farm_day:orbit,chase
# Env: BASE (server address), W, H, NOUI=1 (hide the panels so only the 3D picture shows), FRAMES (frames to wait before each picture, default 3), PRE (JSON list of JS run once per scene).
import asyncio, os, sys, json
from playwright.async_api import async_playwright
NEARB = "void (()=>{const b=window.__beta,T=b.battle.tank,B=b.world.buildings;let m=null,d=1e9;for(const x of B){const q=Math.hypot(x.e-T.e,x.n-T.n);if(q<d){d=q;m=x;}}if(m){const a=Math.atan2(T.e-m.e,T.n-m.n);b.view(m.e+Math.sin(a+%s)*%s,m.n+Math.cos(a+%s)*%s,0,%s,m.e,m.n);}})()"
NEARV = "void (()=>{const b=window.__beta,w=b.world,T=b.battle.tank;let best=null,bd=1e9;for(let j=0;j<w.n;j++)for(let i=0;i<w.n;i++){if(w.V[j*w.n+i]!==%d)continue;const e=i*w.cell-w.half,n=j*w.cell-w.half,d=Math.hypot(e-T.e,n-T.n);if(d<bd){bd=d;best=[e,n];}}if(best){const a=Math.atan2(T.e-best[0],T.n-best[1]);b.view(best[0]+Math.sin(a)*%s,best[1]+Math.cos(a)*%s,0,%s,best[0],best[1]);}})()"
V = {
    'treeline': NEARV % (5, 30, 30, 2.2),
    'woodedge': NEARV % (4, 40, 40, 2.2),
    'scrub': NEARV % (3, 10, 10, 1.7),
    'crop': NEARV % (1, 12, 12, 1.7),
    'maize': NEARV % (2, 12, 12, 1.7),
    'orbit': "window.__beta.near(42, 13, 200)",
    'chase': "window.__beta.near(17, 2.6, 20)",
    'wide': "window.__beta.near(230, 55, 135)",
    'low': "window.__beta.near(60, 1.7, 290)",
    'troops': "window.__beta.cams.set('troops')",
    'gnr': "window.__beta.cams.set('gnr')",
    'street': NEARB % (0.5, 45, 0.5, 45, 5),
    'roofs': NEARB % (-0.8, 120, -0.8, 120, 40),
}
SCENES = {
    'farm_day': ('biome=farmland&cond=day', ['orbit', 'chase', 'low', 'wide', 'troops', 'gnr']),
    'forest_dawn': ('biome=forest&cond=dawn', ['orbit', 'chase', 'wide']),
    'desert_day': ('biome=desert&cond=day', ['orbit', 'low', 'wide']),
    'town_overcast': ('biome=town&cond=overcast', ['orbit', 'street', 'roofs']),
    'farm_rain': ('biome=farmland&cond=rain', ['orbit', 'chase']),
    'farm_snow': ('biome=farmland&cond=snow', ['orbit', 'chase']),
    'farm_night': ('biome=farmland&cond=night', ['orbit', 'chase']),
    'farm_dusk': ('biome=farmland&cond=dusk', ['orbit', 'wide']),
    'farm_fog': ('biome=farmland&cond=fog', ['orbit']),
    'forest_day': ('biome=forest&cond=day', ['orbit', 'low']),
}
async def main():
    out = sys.argv[1]; gfx = sys.argv[2] if len(sys.argv) > 2 else 'high'; names = sys.argv[3:] or list(SCENES)[:7]; os.makedirs(out, exist_ok=True)
    base = os.environ['BASE']; frames = int(os.environ.get('FRAMES', '3')); stats = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': os.environ.get('CHROME', '/usr/bin/google-chrome')} if os.path.exists(os.environ.get('CHROME', '/usr/bin/google-chrome')) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name in names:
            spec = name.split(':'); hashp, views = SCENES[spec[0]]; views = spec[1].split(',') if len(spec) > 1 else views
            pg = await b.new_page(viewport={'width': int(os.environ.get('W', '1280')), 'height': int(os.environ.get('H', '720'))}); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and '404' not in m.text and errs.append(m.text[:300]))
            await pg.goto(base + '#' + hashp + '&gfx=' + gfx + '&speed=1&spectator=1&play=1&seed=1&map=3', timeout=180000)
            ok = False
            for _ in range(240):
                try:
                    if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): ok = True; break
                except Exception: pass
                await pg.wait_for_timeout(1000)
            if not ok: print(name, 'NOT READY', errs[:4]); await pg.close(); continue
            await pg.evaluate('window.__beta.setPlaying(false)')
            if os.environ.get('NOUI'): await pg.add_style_tag(content='body > *:not(#view) { display: none !important; }')
            for cmd in json.loads(os.environ.get('PRE', '[]')): await pg.evaluate(cmd)
            for v in views:
                await pg.evaluate(V[v]); f0 = await pg.evaluate('window.__beta.scene.frameN')
                for _ in range(120):
                    await pg.wait_for_timeout(500)
                    if await pg.evaluate('window.__beta.scene.frameN') >= f0 + frames: break
                await pg.screenshot(path=os.path.join(out, '%s_%s.png' % (spec[0], v)), timeout=180000)
                s = await pg.evaluate('window.__beta.scene.stats()'); stats[spec[0] + '_' + v] = {'calls': s['calls'], 'triangles': s['triangles']}
                print(spec[0], v, s['calls'], 'calls', s['triangles'], 'tris', 'build', s['buildMs'], 'ms', flush=True)
            if errs: print(name, 'errors', errs[:5])
            await pg.close()
        await b.close()
    old = {}
    try: old = json.load(open(os.path.join(out, 'stats.json')))
    except Exception: pass
    old.update(stats); json.dump(old, open(os.path.join(out, 'stats.json'), 'w'), indent=1)
asyncio.run(main())
