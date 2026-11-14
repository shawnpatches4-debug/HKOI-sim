# python3 tests/beta/sound.py [out folder] [hash params]: the sound in the real page (run through tools/serve_csp.sh, BASE set;
# `bash tools/dev.sh sound <out folder>` does all of it). Nobody can listen here, so this checks what can be checked:
#  1. no sound engine exists before the player clicks (browsers forbid it); after a real mouse click it runs
#  2. every sound file the page asks for arrives (HTTP 200) under the hosting page's restrictions, and the old machine-made
#     crew voices (voice_cdr / gnr / ldr / drv / panic) are NOT fetched any more
#  3. every entry of the crew voice index lies inside its sound file
#  4. each battle event produces the intended line with the intended priority (a made-up battle fed to the crew director)
#  5. every sound call works from every listening position, at normal speed and at 4x, without an error
#  6. the real frame loop is run through an engagement from the gunner's seat: lines are spoken, none overlap, nothing throws
#  7. a short scene is rendered by Chrome's own audio engine and written to <out>/chrome_compare.wav, to compare with the
#     same scene from tests/audio/render.mjs (node): the two engines must agree, and nothing may clip
import asyncio, os, sys, json, base64, struct
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; PARAMS = sys.argv[2] if len(sys.argv) > 2 else 'speed=2&gfx=min&force=ambush&cam=gnr'
NEED = ['crew4_index.json', 'crew4_cdr.mp3', 'crew4_gnr.mp3', 'crew4_ldr.mp3', 'crew4_drv.mp3', 'crew4_hq.mp3', 'voice_index.json', 'voice_ru.mp3', 'screams.mp3', 'sfx_index.json']
BANNED = ['voice_cdr.mp3', 'voice_gnr.mp3', 'voice_ldr.mp3', 'voice_drv.mp3', 'voice_panic.mp3']

# 4. a made-up battle: [event or state change, expected requests as "WHO.event:priority"]
DIRECTOR = r"""(() => {
  const Talk = __beta.sound.talk.constructor, out = [];
  const run = (name, events, expect, tweak) => {
    const asked = [], net = { ready: true, has: () => true, request: (who, ev, o) => { asked.push(who + '.' + ev + ':' + (o.pri == null ? 1 : o.pri)); return true; }, flush: () => asked.push('FLUSH') };
    const cues = [], talk = new Talk(net, { warn() {}, blip: k => cues.push('blip:' + k), smoke: () => cues.push('smoke') });
    const b = { t: 100, events: [], volleys: [], units: [{ id: 1, alive: true, state: 'firing', e: 0, n: 900 }], over: null, _rf: null,
      tank: { e: 0, n: 0, h: 0, tur: 0, v: 0, alive: true, mode: 'halted', loaded: true, main: 10, known: [{ id: 1, e: 0, n: 900 }], ai: { ldr: { up: false, ok: true }, coax: { said: -1 } } } };
    talk.update(b, 100, {}); talk.started = true; asked.length = 0;
    for (const e of events) b.events.push(Object.assign({ t: 100.1 }, e));
    if (tweak) tweak(b, 0);
    b.t = 100.1; talk.update(b, 100.1, { mission: 'hold' });
    if (tweak) tweak(b, 1);
    for (let k = 2; k <= 30; k++) { b.t = 100 + k * 0.1; talk.update(b, b.t, { mission: 'hold' }); }
    const got = asked.concat(cues), ok = expect.every(x => x.split('|').some(y => got.includes(y))) && got.every(g => expect.some(x => x.split('|').includes(g)));
    out.push([name, ok, got.join(' '), expect.join(' ')]);
  };
  run('main gun fires and hits', [{ type: 'gun', uid: 1, R: 900, tof: 0.8, hit: true }, { type: 'team_lost', t: 100.9, uid: 1, by: 'main' }], ['GNR.ontheway:2', 'GNR.target:1', 'CDR.cease:1']);
  run('main gun misses, team stays', [{ type: 'gun', uid: 1, R: 900, tof: 0.8, hit: false }], ['GNR.ontheway:2', 'GNR.miss:1', 'CDR.reengage_doubt:1']);
  run('main gun misses, team pulls out', [{ type: 'gun', uid: 1, R: 900, tof: 0.8, hit: false }], ['GNR.ontheway:2', 'GNR.miss:1'], (b, k) => { if (k === 1) b.units[0].state = 'moving'; });
  run('commander\'s .50 knocks a team out', [{ type: 'team_lost', uid: 1, by: 'm2' }], ['CDR.cease:1']);
  run('loader hit', [{ type: 'loader_hit' }], ['LDR.scream:3', 'LDR.wound:3', 'CDR.loader_down:2']);
  run('gunner wounded, driver down, a man freezes', [{ type: 'crew', who: 'gnr', what: 'wounded' }, { type: 'crew', who: 'drv', what: 'down' }, { type: 'crew', who: 'ldr', what: 'freeze' }], ['GNR.scream:3', 'GNR.wound:3', 'CDR.drv_down:2', 'LDR.freeze:2']);
  run('crew bails out', [{ type: 'crew', who: null, what: 'bail_out' }], ['FLUSH', 'CDR.bail:3']);
  run('team located', [{ type: 'located', uid: 1, how: 'thermal' }], ['GNR.contact:1']);
  run('move order, ahead', [{ type: 'tank_move', to: [0, 300] }], ['CDR.drv_fwd:1|CDR.moveout:1', 'DRV.ack_fwd:1']);
  run('move order, behind', [{ type: 'tank_move', to: [0, -300] }], ['CDR.moveout:1', 'DRV.onmove:1']);
  run('hit that does not kill', [{ type: 'end', by: 'hit', killing: false }], ['CDR.hit:3', 'CDR.report:2', 'GNR.ready:1', 'LDR.ready:1', 'DRV.ready:1']);   /* the hit, then the commander's check and the answers (crewtalk.js _hitCalls) */
  run('killing hit', [{ type: 'end', by: 'hit', killing: true }, { type: 'loader_hit', t: 100.5 }], ['FLUSH']);
  run('vehicle lost', [{ type: 'vehicle_lost' }, { type: 'team_lost', t: 100.6, uid: 1, by: 'coax' }], ['FLUSH']);
  run('battle won', [{ type: 'over', result: 'won' }], ['HQ.end_won:1']);
  run('drone launched in reach', [{ type: 'drone_launch', uid: 1, R: 2000 }], ['blip:rf']);
  run('lull', [{ type: 'lull', wave: 0 }], ['GNR.ready:0', 'LDR.ready:0', 'DRV.ready:0', 'CDR.redcon:0']);
  run('gun loaded', [], ['LDR.up:1'], (b, k) => { b.tank.loaded = k === 1; });
  run('gunner lays at 1230 m', [], ['GNR.range_1200:1'], (b, k) => { if (k === 1) b._rf = { k: b.tank.known[0], R: 1230, at: 200 }; });
  run('loader up on his gun', [], ['LDR.going_up:1', 'LDR.mg_ready:1'], (b, k) => { if (k === 1) b.tank.ai.ldr.up = true; });
  run('coax on a new target', [], ['GNR.mg:1'], (b, k) => { if (k === 1) b.tank.ai.coax.said = 1; });
  run('tank halts', [], ['CDR.drv_stop:0'], (b, k) => { b.tank.mode = k === 0 ? 'moving' : 'halted'; });
  return JSON.stringify(out);
})()"""

# 7. the comparison scene (the same script is scene "compare" in tests/audio/render.mjs)
RENDER = r"""(async () => {
  const S = __beta.sound.constructor, SR = 44100, SEC = 9, ctx = new OfflineAudioContext(2, SR * SEC, SR), s = new S(); s.start(ctx); await s.loadVoices(__beta.sound.base);
  s.mix.setBus('world', 0);
  const acts = [[0.4, () => s.cue('GNR', 'ontheway', 1)], [2.0, () => s.gun30(3)], [2.3, () => s.gun30(3)], [2.6, () => s.gun30(3)], [3.6, () => s.cue('LDR', 'up', 1)], [4.6, () => s.gun120(3)], [6.4, () => s.cue('CDR', 'cease', 1)]];
  let k = 0, err = null; const step = 1 / 30;
  for (let t = step; t < SEC - 2 * step; t += step) ctx.suspend(t).then(() => { try { while (k < acts.length && acts[k][0] <= t) acts[k++][1](); s.update(step, { view: 'gnr', cond: 'day', speed: 0, heading: 0, turret: 0, alive: true, camDist: 3, drones: [], talking: false }); } catch (e) { err = String(e.stack || e); } ctx.resume(); }).catch(() => {});
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), pcm = new Int16Array(L.length * 2); let peak = 0, e = 0;
  for (let i = 0; i < L.length; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); e += L[i] * L[i]; pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
  const u8 = new Uint8Array(pcm.buffer); let bin = ''; for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return JSON.stringify({ err, peak, rms: Math.sqrt(e / L.length), said: s.icom.said.map(x => [x.who + '.' + x.ev, +x.t.toFixed(2), +x.end.toFixed(2)]), b64: btoa(bin) });
})()"""

async def main():
    fails = []; os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        chrome = os.environ.get('CHROME', '/usr/bin/google-chrome')
        b = await p.chromium.launch(**({'executable_path': chrome} if os.path.exists(chrome) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '640')), 'height': int(os.environ.get('H', '360'))})
        errs = []; got = {}
        def on_resp(r):
            name = r.url.split('/')[-1].split('?')[0]
            if name.endswith('.mp3') or name.endswith('_index.json'): got[name] = r.status
            if r.status >= 400: errs.append('HTTP %d %s' % (r.status, r.url[-80:]))
        pg.on('response', on_resp); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(getattr(e, 'stack', e))[:600])); pg.on('console', lambda m: m.type == 'error' and errs.append('console ' + m.text[:300] + ' <- ' + str((m.location or {}).get('url', ''))[-90:]))   # with the address of the file, so a missing file can be named
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../build/', os.environ.get('BUILD', 'beta'), 'index.html')
        await pg.goto((os.environ.get('BASE') or 'file://' + os.path.abspath(root)) + '#' + PARAMS, timeout=120000)
        for i in range(240):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1000)
        ev = lambda js: pg.evaluate(js)
        # 1. nothing before the click; running after a real one
        before = await ev('String(__beta.sound.ctx)')
        if before != 'null': fails.append('a sound engine exists before the player clicked: ' + before)
        real = True
        try: await pg.click('#go', timeout=20000)
        except Exception:
            try: await pg.click('#go', timeout=10000, force=True)
            except Exception: real = False; await ev("document.getElementById('go').click()")   # not a real mouse click: Chrome may leave the sound engine suspended
        for i in range(120):
            if await ev('!!(__beta.sound.ctx && __beta.sound.voicesReady)'): break
            await pg.wait_for_timeout(1000)
        st = json.loads(await ev("JSON.stringify({ ctx: __beta.sound.ctx && __beta.sound.ctx.state, ready: !!__beta.sound.voicesReady, icom: !!(__beta.sound.icom && __beta.sound.icom.ready), pack: __beta.sound.icom && __beta.sound.icom.index && Object.keys(__beta.sound.icom.index.strips), old: Object.keys(__beta.sound.bufs || {}) })"))
        print('1. before the click: no sound engine (%s). After: %s' % (before, json.dumps(st)))
        if st['ctx'] != 'running' and real: fails.append('the sound engine is not running after a click: %s' % st['ctx'])
        if not real: print('   (the Start button could not be clicked with the mouse at this window size; it was clicked from script instead)')
        if not st['icom']: fails.append('the crew voice pack did not load')
        # 2. files
        miss = [n for n in NEED if got.get(n) != 200]; old = [n for n in BANNED if n in got]
        print('2. sound files fetched:', json.dumps(got))
        if miss: fails.append('files missing: %s' % miss)
        if old: fails.append('the old machine-made crew voices are still fetched: %s' % old)
        # 3. index inside the strips
        r = json.loads(await ev("JSON.stringify((() => { const I = __beta.sound.icom, bad = []; let n = 0, ev = 0; for (const who in I.index.e) for (const e in I.index.e[who]) { ev++; for (const x of I.index.e[who][e]) { n++; const b = I.bufs[x[0]]; if (!b || x[1] < 0 || x[2] <= 0.1 || x[1] + x[2] > b.duration + 0.02) bad.push([who, e, x[4]]); } } const V = __beta.sound.VI || {}, B = __beta.sound.bufs; for (const [sec, key] of [['r', 'ru'], ['s', 'screams']]) for (const k in V[sec] || {}) for (const x of V[sec][k]) { n++; if (!B[key] || x[0] + x[1] > B[key].duration + 0.02) bad.push([sec, k]); } return { n, ev, bad }; })())"))
        print('3. %d clips (%d crew events) checked against their sound files; outside: %s' % (r['n'], r['ev'], r['bad']))
        if r['bad']: fails.append('index entries outside their strip: %s' % r['bad'][:6])
        # 4. events -> lines
        await ev('__beta.setPlaying(false)'); await pg.wait_for_timeout(500)
        rows = json.loads(await ev(DIRECTOR)); bad = [x for x in rows if not x[1]]
        print('4. %d of %d event cases give the intended lines' % (len(rows) - len(bad), len(rows)))
        for x in bad: print('   WRONG %-34s got: %-50s expected: %s' % (x[0], x[2], x[3])); fails.append('event case: ' + x[0])
        # 5. every call from every seat, normal speed and 4x
        r = json.loads(await ev("""JSON.stringify((() => { const s = __beta.sound, out = [], base = { cond: 'rain', biome: 'forest', speed: 6, heading: 10, turret: 40, alive: true, camDist: 20, drones: [{ id: 'x', d: 300 }], talking: false };
          for (const rate of [1, 4]) for (const view of ['orbit', 'chase', 'cdr', 'gnr', 'citv', 'hkoi', 'drv', 'ldr', 'in_cdr', 'in_gnr', 'in_ldr', 'in_drv', 'cut', 'top', 'enemy', 'troops', 'fly', 'missile']) { try { s.update(0.05, Object.assign({}, base, { view, rate }));
            s.gun30(15); s.gun120(15); s.mg(15, true); s.mg(15, false); s.aps(10); s.explosion(40, 1.5); s.explosion(900, 0.8); s.airburst(60, 0.5); s.launch(800, true); s.launch(300, false); s.whoosh(0.5, 0.4); s.smoke(10); s.crackThump(600); s.blip('rf'); s.penetration(1.6); s.nearMiss(0.22);
            s.say('CDR', ['Fire!'], 1); s.say('CDR', ['Target! Cease fire!'], 1); s.cue('GNR', 'ready', 0); s.react('CDR', 'hit', 0.1); s.react('GNR', 'panic', 0.1); s.scream('scream', 0.1); s.enemy('fire', 0.1); out.push([view, rate, s.seat]); } catch (e) { out.push([view, rate, 'ERROR ' + (e.stack || e)]); } }
          s.hit(false); s.icom.flush('test'); s.update(0.05, Object.assign({}, base, { view: 'gnr', rate: 1, drones: [] })); return out; })())"""))
        seats = {x[0]: x[2] for x in r}; bad = [x for x in r if str(x[2]).startswith('ERROR')]
        print('5. every sound call from 18 views at 1x and 4x: %d errors. Seats: %s' % (len(bad), json.dumps(seats)))
        for x in bad: fails.append('sound call threw in view %s: %s' % (x[0], x[2][:300]))
        # 6. the real frame loop through an engagement, from the gunner's seat
        await ev("void (__beta.cams.set('gnr'), __beta.setPlaying(true))"); t0 = await ev('__beta.battle.t'); info = {}
        for i in range(int(os.environ.get('LOOPS', '16'))):
            await pg.wait_for_timeout(5000)
            try: info = json.loads(await asyncio.wait_for(ev("JSON.stringify({ t: __beta.battle.t, volleys: __beta.battle.volleys.length, said: __beta.sound.icom.said.length, asked: __beta.sound.talk.trace.length, seat: __beta.sound.seat, alive: __beta.battle.tank.alive })"), 30))
            except Exception as e: fails.append('page not responding: ' + str(e)[:80]); break
            if info['volleys'] >= 1 and info['said'] >= 4 and info['t'] - t0 > 25: break
        said = json.loads(await ev("JSON.stringify(__beta.sound.icom.said.map(x => [x.who + '.' + x.ev, +x.t.toFixed(2), +x.end.toFixed(2), x.clip, x.text]))"))
        over = sum(1 for a, c in zip(said, said[1:]) if c[1] < a[2] - 0.001)
        print('6. frame loop: battle time %.1f -> %.1f s, %d engagement(s), seat %s, %d lines spoken, %d overlapping' % (t0, info.get('t', -1), info.get('volleys', 0), info.get('seat'), len(said), over))
        for x in said[:14]: print('   %7.2f %-18s %s' % (x[1], x[0], x[4][:60]))
        if not info or info.get('t', 0) <= t0: fails.append('simulated time did not advance')
        if len(said) < 1: fails.append('nothing was spoken on the intercom')
        if over: fails.append('%d lines overlap on the intercom' % over)
        # 7. Chrome's own render of the comparison scene
        await ev('__beta.setPlaying(false)')
        try:
            r = json.loads(await asyncio.wait_for(ev(RENDER), 300)); pcm = base64.b64decode(r['b64']); import math
            with open(os.path.join(OUT, 'chrome_compare.wav'), 'wb') as f:
                f.write(b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 2, 44100, 44100 * 4, 4, 16) + b'data' + struct.pack('<I', len(pcm)) + pcm)
            print('7. Chrome render: peak %.1f dB, loudness %.1f dB, lines %s -> %s' % (20 * math.log10(r['peak'] + 1e-9), 20 * math.log10(r['rms'] + 1e-9), json.dumps(r['said']), os.path.join(OUT, 'chrome_compare.wav')))
            if r['err']: fails.append('error while rendering: ' + r['err'][:300])
            if r['peak'] >= 0.999: fails.append('the mix clips in Chrome (peak %.3f)' % r['peak'])
            if len(r['said']) != 3: fails.append('the comparison scene should speak 3 lines, spoke %d' % len(r['said']))
        except Exception as e: fails.append('offline render failed: ' + str(e)[:200])
        print('errors', json.dumps(errs[:10], indent=1)); fails += errs[:5]
        await b.close()
    print('SOUND TEST', 'FAIL: ' + '; '.join(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
