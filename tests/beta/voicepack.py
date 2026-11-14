# python3 tests/beta/voicepack.py [hash params]: the crew voice pack in the real page (run it through tools/serve_csp.sh, BASE set).
# Nobody can listen here, so this checks what can be checked: the pack's index and every sound file load, every index entry lies
# inside its sound file, each engine line that should use the pack picks a pack clip (and the others still use the older
# recordings), each battle-log line that should be spoken is spoken, and nothing is written to the console as an error.
import asyncio, os, sys, json
from playwright.async_api import async_playwright

# [who, words the engine writes, stress level, pack event expected (None: the older recording)]
ENGINE = [
    ['CDR', 'Driver, back up.', 0, 'drv_back'], ['CDR', 'Driver, back up! Now!', 1, 'drv_back'], ['CDR', 'BACK UP! BACK UP!', 2, 'drv_back'], ['CDR', 'Get us out of here!', 1, 'drv_back'], ['CDR', 'GO! GO! JUST GO!', 2, 'drv_back'],
    ['CDR', 'Driver, forward.', 0, 'drv_fwd'], ['CDR', 'FORWARD! FORWARD!', 2, 'drv_fwd'], ['CDR', 'Driver, move out! Now!', 1, 'drv_fwd'], ['CDR', 'MOVE OUT! MOVE OUT! IT’S COMING IN!', 2, 'drv_fwd'], ['CDR', 'Driver! MOVE!', 1, 'drv_fwd'],
    ['CDR', 'Driver, stop.', 0, 'drv_stop'], ['CDR', 'STOP! STOP!', 2, 'drv_stop'], ['CDR', 'Driver, hard left.', 0, 'left'], ['CDR', 'HARD LEFT! HARD LEFT! IT’S COMING IN!', 2, 'left'], ['CDR', 'Driver, hard right! Now!', 1, 'right'],
    ['CDR', 'We’re hit. Crew report.', 0, 'hit'], ['CDR', 'WE’RE HIT! IS EVERYONE OKAY?!', 2, 'hit'], ['CDR', 'Gunner, sabot, tank.', 0, 'load_sabot'], ['CDR', 'Target. Cease fire.', 0, 'cease'], ['CDR', 'TARGET! HE’S BURNING!', 2, 'cease'],
    ['CDR', 'Target! Re-engage!', 1, 'reengage'], ['CDR', 'HIT HIM AGAIN!', 2, 'reengage'], ['CDR', 'Miss. Re-engage.', 0, 'reengage_doubt'], ['CDR', 'MISSED! AGAIN! AGAIN!', 2, 'reengage_doubt'], ['CDR', 'FIRE! FIRE! EVACUATE!', 1, 'fire'],
    ['CDR', 'They’ve got our radar. Driver, move us. Now.', 1, 'drv_fwd'],
    ['GNR', 'On the way.', 0, 'ontheway'], ['GNR', 'ON THE WAY! ON THE WAY!', 2, 'ontheway'], ['GNR', 'Target.', 0, 'target'], ['GNR', 'GOT IT! GOT IT!', 2, 'target'], ['GNR', 'Gunner up!', 1, 'ready'], ['GNR', 'Gunner’s good.', 0, 'ready'],
    ['GNR', 'Gun’s jammed. Clearing.', 0, 'misfire'], ['GNR', 'Gun’s clear!', 1, 'gun_back'],
    ['LDR', 'Up.', 0, 'up'], ['LDR', 'UP! UP!', 2, 'up'], ['LDR', 'Sabot loaded.', 0, 'ready'], ['LDR', 'Loader up!', 1, 'ready'], ['LDR', 'Loader’s good.', 0, 'ready'],
    ['DRV', 'Moving out.', 0, 'ack_fwd'], ['DRV', 'Going! Going!', 2, 'ack_fwd'], ['DRV', 'Hard left!', 1, 'ack_left'], ['DRV', 'Going right! Going!', 2, 'ack_right'], ['DRV', 'Driver up. Engine’s good.', 0, 'ready'],
    # lines the pack has nothing for: these must still come from the older recordings
    ['CDR', 'Missile, 3 o\'clock.', 0, None], ['CDR', 'Drone! 11 o\'clock!', 1, None], ['CDR', 'Fire!', 1, None], ['CDR', 'Smoke, smoke, smoke.', 0, None], ['CDR', 'It went wide.', 0, None], ['CDR', 'Tank, front.', 0, None], ['CDR', 'Driver, weave.', 0, None],
    ['GNR', 'Identified.', 0, None], ['GNR', 'Beam’s cut. It’s blind.', 0, None], ['GNR', 'HE is out.', 0, None], ['LDR', 'Trophy, kill.', 0, None], ['LDR', 'Trophy left side empty.', 0, None], ['DRV', 'Backing up.', 0, None], ['DRV', 'Stopping.', 0, None], ['DRV', 'Weaving.', 0, None],
]
# [who, battle-log line, pack events expected in order]
LOG = [
    ['GNR', 'Gunner lays on Kornet team #2, 1.23 km, bearing 045: most dangerous.', ['GNR.range_1200']], ['GNR', 'Gunner lays on RPG team #1, 0.42 km, bearing 310: closest.', ['GNR.range_400']],
    ['GNR', 'RPG team #1 knocked out by coax fire at 420 m.', ['GNR.target']], ['GNR', 'Main gun round lands close to Kornet team #2: team pinned.', ['CDR.reengage_doubt']],
    ['GNR', 'Coax engages RPG team #1 at 420 m.', ['GNR.mg']], ['CDR', 'Loader up on the M240: enemy team inside 600 m.', ['LDR.mg_ready']], ['CDR', 'Loader down: main gun needs loading.', ['CDR.reload']],
    ['CDR', 'Loader hit while up in his hatch. The commander will have to load.', ['ANY.wound', 'CDR.loader_down']], ['CDR', 'Commander breaks contact: HKOI is out of obscurant. Pulling back to the start line.', ['CDR.drv_back']],
    ['CDR', 'Commander shifts 120 m to an alternate position: shot at here.', ['CDR.moveout|CDR.drv_fwd', 'DRV.ack_fwd']], ['CDR', 'Commander stays put: no clearly better position within 200 m.', []], ['GNR', 'Gunner holds fire on the Kornet team #2 site: the position is empty.', []],
]

async def main():
    params = sys.argv[1] if len(sys.argv) > 1 else 'speed=1&gfx=min'; fails = []
    async with async_playwright() as p:
        chrome = os.environ.get('CHROME', '/usr/bin/google-chrome')
        b = await p.chromium.launch(**({'executable_path': chrome} if os.path.exists(chrome) else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': int(os.environ.get('W', '320')), 'height': int(os.environ.get('H', '180'))})
        errs = []; got = {}
        def on_resp(r):
            name = r.url.split('/')[-1]
            if 'voice' in name or 'screams' in name: got[name] = r.status
            if r.status >= 400 and 'favicon' not in r.url: errs.append('HTTP %d %s' % (r.status, r.url[-80:]))
        pg.on('response', on_resp); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(getattr(e, 'stack', e))[:600])); pg.on('console', lambda m: m.type == 'error' and errs.append('console ' + m.text[:300]))
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../build/', os.environ.get('BUILD', 'beta'), 'index.html')
        await pg.goto((os.environ.get('BASE') or 'file://' + os.path.abspath(root)) + '#' + params, timeout=120000)
        for i in range(180):
            if await pg.evaluate('!!(window.__beta && window.__beta.ready)'): break
            await pg.wait_for_timeout(1000)
        await pg.evaluate("document.getElementById('go').click()")
        # record every pack line asked for and every clip actually started, from the first moment
        await pg.evaluate("""void (() => { const s = __beta.sound, T = window.__vt = { cues: [], clips: [] }; const c0 = s.cue.bind(s), k0 = s._clip.bind(s);
            s.cue = (who, ev, lv, opt) => { const r = c0(who, ev, lv, opt); T.cues.push([who + '.' + ev, r]); return r; }; s._clip = (key, a, d, o) => { T.clips.push([key, a, d]); return k0(key, a, d, o); }; })()""")
        if os.environ.get('EXPECT') == 'old':   # run with the pack's index taken away: everything must fall back to the older recordings
            for i in range(120):
                st = json.loads(await pg.evaluate("JSON.stringify({ cv: !!__beta.sound.CV, vi: !!__beta.sound.VI, bufs: Object.keys(__beta.sound.bufs || {}) })"))
                if st['vi'] and all(k in st['bufs'] for k in ('cdr', 'gnr', 'ldr', 'drv')): break
                await pg.wait_for_timeout(1000)
            await pg.evaluate('__beta.setPlaying(false)'); await pg.wait_for_timeout(1500)
            r = json.loads(await pg.evaluate("JSON.stringify((() => { const s = __beta.sound, out = []; for (const [who, text] of [['CDR', 'Driver, back up.'], ['GNR', 'On the way.'], ['LDR', 'Up.'], ['DRV', 'Moving out.']]) { s.busyUntil = 0; const k0 = __vt.clips.length, ok = s.say(who, [text], 0); out.push([who, ok, (__vt.clips[k0] || [null])[0]]); } return out; })())"))
            print('without the pack: pack index loaded:', st['cv'], '| older lines:', r); good = not st['cv'] and all(x[1] and x[2] == x[0].lower() for x in r)
            errs = [e for e in errs if 'crewvoice_index' not in e and 'status of 404' not in e and 'GPU stall' not in e]; print('console errors:', errs[:5])
            print('FALLBACK CHECK', 'PASSED' if good and not errs else 'FAILED'); await b.close(); sys.exit(0 if good and not errs else 1)
        ok = False
        for i in range(120):
            st = json.loads(await pg.evaluate("JSON.stringify({ cv: !!__beta.sound.CV, vi: !!__beta.sound.VI, bufs: Object.keys(__beta.sound.bufs || {}), want: __beta.sound.CV ? Object.keys(__beta.sound.CV.strips).map(k => 'cv_' + k) : [] })"))
            if st['cv'] and all(k in st['bufs'] for k in st['want']) and (not st['vi'] or 'cdr' in st['bufs']): ok = True; break
            await pg.wait_for_timeout(1000)
        print('pack index loaded:', st['cv'], '| older index loaded:', st['vi'], '| sound files decoded:', sorted(st['bufs']))
        if not ok: fails.append('pack sound files did not all load')
        print('files fetched:', json.dumps(got, sort_keys=True))
        for f, code in got.items():
            if code != 200: fails.append('%s answered %d' % (f, code))
        # every index entry inside its sound file
        r = json.loads(await pg.evaluate("""JSON.stringify((() => { const s = __beta.sound, out = { n: 0, bad: [], ev: 0 }; for (const who in s.CV.e) for (const ev in s.CV.e[who]) { out.ev++; for (const x of s.CV.e[who][ev]) { out.n++; const b = s.bufs['cv_' + x[0]]; if (!b || x[1] < 0 || x[2] <= 0.1 || x[1] + x[2] > b.duration + 0.01) out.bad.push([who, ev, x[4]]); } } return out; })())"""))
        print('index: %d clips in %d events; outside their sound file: %d' % (r['n'], r['ev'], len(r['bad'])))
        if r['bad']: fails.append('index entries outside their file: %s' % r['bad'][:5])
        await pg.wait_for_timeout(4000)
        first = json.loads(await pg.evaluate('JSON.stringify(__vt.cues)')); print('spoken at the start of the battle:', [c[0] for c in first if c[1]][:8], '(asked %d times before the sound files had arrived)' % sum(1 for c in first if not c[1]))
        if not any(c[0] == 'GNR.ready' and c[1] for c in first): fails.append('crew report at the start was not spoken')
        # engine lines: stop the battle clock so nothing else talks, then ask for each line with a free intercom
        await pg.evaluate('__beta.setPlaying(false)'); await pg.wait_for_timeout(1500)
        res = json.loads(await pg.evaluate("""JSON.stringify((() => { const s = __beta.sound, T = __vt, out = []; for (const [who, text, lv, want] of %s) { s.busyUntil = 0; s.lastCue = null; if (s.lowQ) s.lowQ.length = 0; const c0 = T.cues.length, k0 = T.clips.length, r = s.say(who, [text], lv);
            const cue = T.cues.slice(c0).filter(c => c[1]).map(c => c[0])[0] || null, clip = T.clips.slice(k0)[0] || null; out.push([who, text, lv, want, r, cue, clip && clip[0]]); } return out; })())""" % json.dumps(ENGINE)))
        npack = nold = 0
        for who, text, lv, want, r, cue, strip in res:
            if want:
                good = r and cue == who + '.' + want and strip and strip.startswith('cv_'); npack += good
            else:
                good = cue is None and (strip is None or not strip.startswith('cv_')); nold += bool(r)
                if not r: print('  no recording at all for:', who, text)
            if not good: fails.append('engine line %s "%s" -> spoke=%s cue=%s strip=%s, wanted %s' % (who, text, r, cue, strip, want))
        print('engine lines: %d of %d wired lines picked a pack clip; %d of %d other lines still found an older recording' % (npack, sum(1 for e in ENGINE if e[3]), nold, sum(1 for e in ENGINE if not e[3])))
        # battle-log lines through the real frame loop
        await pg.evaluate('__beta.setPlaying(true)'); nlog = 0
        for who, text, want in LOG:
            st = await pg.evaluate('__beta.state()')
            if st != 'play': print('battle is over (state %s): remaining log lines not tried' % st); fails.append('battle ended before the log-line test finished'); break
            await pg.evaluate("void (() => { const s = __beta.sound, B = __beta.battle; s.busyUntil = 0; s.lastCue = null; window.__c0 = __vt.cues.length; B.say(B.t, 'tank', %s, %s); })()" % (json.dumps(who), json.dumps(text)))
            seen = []
            for i in range(25):
                await pg.wait_for_timeout(800); seen = [c[0] for c in json.loads(await pg.evaluate('JSON.stringify(__vt.cues.slice(window.__c0))')) if c[1]]
                if len(seen) >= max(1, len(want)): break
                if not want and i >= 5: break
            mine = [c for c in seen if any(c in w.split('|') for w in want)] if want else []
            good = (len(mine) == len(want) and all(m in w.split('|') for m, w in zip(mine, want))) if want else True; nlog += good
            if not good: fails.append('log line "%s" -> %s, wanted %s' % (text[:50], seen, want))
        print('battle-log lines: %d of %d behaved as intended' % (nlog, len(LOG)))
        errs = [e for e in errs if 'GPU stall' not in e and 'status of 404' not in e]   # a missing file shows up as an HTTP line above; the browser's own favicon request is not ours
        print('console errors:', json.dumps(errs[:8], indent=1)); fails += errs[:8]
        await b.close()
    print('VOICE PACK CHECK', 'FAILED' if fails else 'PASSED'); [print('  -', f) for f in fails]; sys.exit(1 if fails else 0)
asyncio.run(main())
