import sys,time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--allow-file-access-from-files'])
    pg=b.new_page(viewport={'width':1400,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto(sys.argv[1],timeout=180000)
    for i in range(8):
        time.sleep(6); print(i,pg.evaluate("document.getElementById('gfxStat').textContent"),pg.evaluate("JSON.stringify(window.__gfx||null)"),flush=True)
    print('errors',errs)
