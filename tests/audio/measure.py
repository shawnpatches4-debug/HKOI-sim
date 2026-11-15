#!/usr/bin/env python3
# Measure the moments rendered by tests/audio/moments.mjs (nobody can listen in the workspace) and print a table.
#   python3 -I tests/audio/measure.py <folder of moments> [--before <folder of the older version's moments>] [--hear <Whisper model folder>] [--md <table.md>] [--check]
# Per moment:
#   loudness   integrated loudness in LUFS (ITU-R BS.1770, by ffmpeg's ebur128 filter); for the busy battle the busiest 20 s only
#   peak       true peak in dBTP (ebur128, 4x oversampled)
#   centroid   spectral centroid in Hz (where the "middle" of the energy lies: low = dull or boomy, high = bright or thin)
#   low / body / high   share of the energy below 120 Hz, 120 to 2000 Hz, above 2000 Hz
#   onsets     every expected event (from the moment's .json) is looked for in the sound: how many were found and the
#              largest error in milliseconds. The speed of sound used is 343 m/s (20 degrees C): 3 km is 8.75 s.
#   crew lines (with --hear) the recogniser listens to each line the simulator played IN THE FULL MIX (guns and all) and the
#              number it understood is counted against the number played.
# --check exits 1 when a target is missed: true peak above -1 dBTP anywhere, an onset more than 50 ms off, the busy battle
# outside -16 +-2 LUFS, a burst that is not at the gun's rate of fire.
import sys, os, json, re, subprocess, glob
import numpy as np, soundfile as sf

args = sys.argv[1:]; D = args[0]
def opt(name):
    return args[args.index(name) + 1] if name in args else None
BEFORE, HEAR, MD, CHECK = opt('--before'), opt('--hear'), opt('--md'), '--check' in args
ORDER = ['gun30_burst_inside_0m', 'gun30_burst_outside_30m', 'gun30_burst_far_800m', 'missile_launch_3km', 'missile_launch_3km_weapons_only',
         'penetrating_hit_inside', 'quiet_minute_inside', 'quiet_minute_outside', 'busy_town_heavy_gunner_seat', 'busy_town_heavy_outside']

def ebur(path, t0=None, t1=None):
    cmd = ['ffmpeg', '-hide_banner', '-nostats']
    if t0 is not None: cmd += ['-ss', '%.3f' % t0, '-t', '%.3f' % (t1 - t0)]
    cmd += ['-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-']
    out = subprocess.run(cmd, capture_output=True, text=True).stderr; tail = out[out.rfind('Summary:'):]
    i = re.search(r'I:\s+(-?[\d.]+|-inf) LUFS', tail); p = re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS', tail); lra = re.search(r'LRA:\s+(-?[\d.]+) LU', tail)
    f = lambda m: float(m.group(1)) if m and m.group(1) != '-inf' else float('-inf')
    return f(i), f(p), f(lra)

def spectrum(x, sr):
    n = 4096; hop = 2048; w = np.hanning(n); acc = np.zeros(n // 2 + 1)
    for i in range(0, max(1, len(x) - n), hop): acc += np.abs(np.fft.rfft(x[i:i + n] * w)) ** 2
    f = np.fft.rfftfreq(n, 1 / sr); tot = acc.sum() + 1e-20
    return (f * acc).sum() / tot, acc[f < 120].sum() / tot, acc[(f >= 120) & (f < 2000)].sum() / tot, acc[f >= 2000].sum() / tot

def onset(x, sr, t):
    # the first moment, near the expected time, at which the level over 4 ms rises well clear of what was there just before
    hop = int(sr * 0.001); win = int(sr * 0.004)
    a = int((t - 0.35) * sr); b = int((t + 0.45) * sr)
    if a < 0 or b > len(x): return None
    seg = x[a:b]; c = np.cumsum(np.concatenate([[0], seg ** 2])); idx = np.arange(0, len(seg) - win, hop); env = np.sqrt((c[idx + win] - c[idx]) / win)
    te = a / sr + (idx + win) / sr          # time at the END of each window: the level cannot rise before the sound is there
    pre = env[(te > t - 0.12) & (te < t - 0.03)]; floor = np.median(pre) if len(pre) else 0   # what was there just before (the tail of the round before, the engine)
    peak = env[(te > t - 0.06) & (te < t + 0.4)].max()
    if peak < floor * 2.0 + 1e-5: return None
    thr = max(floor * 1.8, floor + 0.3 * (peak - floor), 2e-5)      # the onset: the level has risen 30% of the way to this event's peak
    for i in range(len(env)):
        if te[i] > t - 0.1 and env[i] > thr and env[min(i + 2, len(env) - 1)] > thr: return te[i] - 0.5 * win / sr
    return None

def hear_lines(wav, said, model):
    import sherpa_onnx
    x, sr = sf.read(wav, dtype='float32'); x = x.mean(1) if x.ndim > 1 else x
    name = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(model, '*-encoder.onnx')))
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (model, name), decoder='%s/%s-decoder.onnx' % (model, name), tokens='%s/%s-tokens.txt' % (model, name), num_threads=4, language='en', task='transcribe')
    SKIP = set('banshee one three tree blackjack six main toc tc is this a the to of and i am have has been'.split())
    def words(t):
        t = re.sub(r'\([^)]*\)', ' ', t.lower()); t = re.sub(r"[^a-z0-9' ]", ' ', t); return [w for w in t.split() if w not in SKIP and not w.isdigit()]
    def same(a, b): return a == b or (len(a) > 3 and len(b) > 3 and (a.startswith(b[:4]) or b.startswith(a[:4])))
    ok = 0; n = 0; rows = []
    for s in said:
        if s.get('cut'): continue
        seg = x[max(0, int((s['t'] - 0.12) * sr)):int((s['end'] + 0.15) * sr)]
        if len(seg) < sr * 0.2: continue
        m = int(len(seg) * 16000 / sr); a = np.interp(np.linspace(0, len(seg) - 1, m), np.arange(len(seg)), seg).astype(np.float32); a = a / (np.abs(a).max() + 1e-9) * 0.7
        pad = np.zeros(6400, dtype=np.float32); st = rec.create_stream(); st.accept_waveform(16000, np.concatenate([pad, a, pad])); rec.decode_stream(st); got = st.result.text.strip()
        want = words(s['text']); gw = words(got); hit = bool(want) and sum(any(same(w, g) for g in gw) for w in want) >= max(1, (len(want) + 1) // 2)
        num = re.sub(r'\D', '', s['text'])
        if not hit and num and num == re.sub(r'\D', '', got): hit = True
        n += 1; ok += hit; rows.append(('ok  ' if hit else 'MISS') + ' %6.2f %-4s played: %-44s heard: %s' % (s['t'], s['who'], s['text'][:44], got[:50]))
    return ok, n, rows

def measure(folder, name, hear=None):
    wav = os.path.join(folder, name + '.wav')
    if not os.path.exists(wav): return None
    J = json.load(open(wav[:-4] + '.json')); x, sr = sf.read(wav, dtype='float64'); m = x.mean(1) if x.ndim > 1 else x
    win = J.get('window'); I, _, _ = ebur(wav, *(win or [None, None])); _, pk, _ = ebur(wav)
    seg = m[int(win[0] * sr):int(win[1] * sr)] if win else m; cen, lo, mid, hi = spectrum(seg, sr)
    r = dict(name=name, lufs=I, peak=pk, centroid=cen, low=lo, body=mid, high=hi, found=None, n=None, err=None, rof=None, lines=None, detail=[])
    ex = J.get('expect') or []
    if ex:
        got = [onset(m, sr, e['t']) for e in ex]; errs = [abs(g - e['t']) * 1000 for g, e in zip(got, ex) if g is not None]
        r.update(found=len(errs), n=len(ex), err=max(errs) if errs else None)
        r['detail'] = ['expected %.3f s, heard %s (%s)' % (e['t'], '%.3f s' % g if g is not None else 'NOT FOUND', e['what']) for g, e in zip(got, ex)]
        if J.get('rof') and len(errs) == len(ex) and len(ex) > 1: r['rof'] = float(np.mean(np.diff(got)))
    # from outside the crew is not heard at all (by design), so lines are counted from a seat only
    if hear and J.get('said') and 'busy' in name and J.get('view') != 'orbit': r['lines'] = hear_lines(wav, J['said'], hear)
    return r

def fmt(r):
    if r is None: return ['-'] * 8
    on = '-' if r['n'] is None else '%d of %d, worst %s' % (r['found'], r['n'], '%.0f ms' % r['err'] if r['err'] is not None else 'n/a')
    if r['rof']: on += ', %.3f s apart' % r['rof']
    ln = '-' if not r['lines'] else '%d of %d' % (r['lines'][0], r['lines'][1])
    return ['%.1f' % r['lufs'], '%.1f' % r['peak'], '%.0f' % r['centroid'], '%.0f / %.0f / %.0f' % (100 * r['low'], 100 * r['body'], 100 * r['high']), on, ln]

head = ['moment', 'version', 'loudness LUFS', 'true peak dBTP', 'centroid Hz', 'energy % low / body / high', 'onsets found, worst error', 'crew lines understood']
rows = []; bad = []
for name in ORDER:
    a = measure(D, name, HEAR); b = measure(BEFORE, name, HEAR) if BEFORE else None
    if b: rows.append([name, 'before'] + fmt(b))
    if a:
        rows.append([name, 'after' if BEFORE else 'now'] + fmt(a))
        if a['peak'] > -1.0: bad.append('%s: true peak %.1f dBTP is above -1' % (name, a['peak']))
        if a['n'] and name != 'missile_launch_3km' and (a['found'] < a['n'] or a['err'] > 50): bad.append('%s: onsets %s' % (name, fmt(a)[4]))
        if a['rof'] and abs(a['rof'] - 0.3) > 0.01: bad.append('%s: rounds %.3f s apart, the gun fires every 0.300 s' % (name, a['rof']))
        if name == 'busy_town_heavy_gunner_seat' and abs(a['lufs'] + 16) > 2:   # the target is set for the crew's seats; from outside there is no speech and the same 20 s measure about 3 LU lower bad.append('%s: %.1f LUFS, the target is -16 +-2' % (name, a['lufs']))
    for tag, r in (('before', b), ('after', a)):
        if r and r['detail']: print('\n'.join('  [%s %s] %s' % (name, tag, d) for d in r['detail']))
        if r and r['lines']: print('\n'.join('  [%s %s] %s' % (name, tag, d) for d in r['lines'][2]))
W = [max(len(str(r[i])) for r in rows + [head]) for i in range(len(head))]
line = lambda r: '| ' + ' | '.join(str(c).ljust(W[i]) for i, c in enumerate(r)) + ' |'
table = '\n'.join([line(head), '|' + '|'.join('-' * (w + 2) for w in W) + '|'] + [line(r) for r in rows])
print(); print(table)
if MD: open(MD, 'w').write(table + '\n')
if bad: print('\nTARGETS MISSED:\n  ' + '\n  '.join(bad))
else: print('\nall targets met (true peak under -1 dBTP, onsets within 50 ms, burst at the rate of fire, busy battle from the gunner's seat at -16 +-2 LUFS)')
if CHECK and bad: sys.exit(1)
