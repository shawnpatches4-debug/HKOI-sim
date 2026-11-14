#!/usr/bin/env python3
# Build the crew voice files of the release: four men with four different voices, and the lines the pack does not have.
#   python3 -I tools/audio/build_voices.py <work dir> <assets dir> <Kokoro model folder> <Whisper model folder> [splice dir] [drop-in dir]
# Reads  <work>/ogg/NNNN.ogg                      the unpacked human voice pack (fsb_unpack.py)
#        tools/audio/crew_release.json            which pack clips are which line (chosen by hand)
#        tools/audio/made_lines.json              the lines to MAKE, three wordings each (calm, tense, shouted)
#        [splice dir]/splices.json                words cut out of the pack by splice.py
#        [drop-in dir]/<WHO>.<event>.<level>.wav  a real recording to use in place of a made line (optional)
# Writes <assets>/crew4_<speaker>.mp3, <assets>/crew4_index.json and <work>/voices_report.json
#        index: { revoiced: true, strips, e: { WHO: { event: [[strip, start, length, level, clip, words, made], ...] } } }
#        made is '' for the pack's own recording, 'splice' for a word cut out of the pack, 'synth' for a synthesised line,
#        'recorded' for a drop-in file.
# What happens to each kind of line:
#   pack clip   re-voiced for its man (voicelib.py: pitch and formants moved independently, pace, microphone colour), trimmed, levelled
#   splice      the same as a pack clip (it IS a pack clip, shorter)
#   synth       Kokoro v1.0 (open model, stock voices: NOT a copy of the pack actor's voice), then: the man's re-voicing; its
#               pitch moved to the middle of that man's real lines of the same delivery (at most +6 / -2 semitones more); for the
#               shouted wording a vocal-effort tilt and light saturation; its long-term spectrum bent to that man's real lines
#               (so it has the pack's microphone and room colour); the same loudness. Then it is MEASURED against the man's
#               real lines (pitch, formants, jitter, shimmer, harmonics-to-noise, brightness: all taken in the intercom's band, as heard) and read back by the speech
#               recogniser. A line that the recogniser cannot read is made again with the second stock voice; if that fails
#               too it is left out (the crewman stays silent). Lines far from the real ones are flagged in the report.
# Nobody has listened to any of it.
import sys, os, json, glob, re, hashlib, subprocess
import numpy as np, soundfile as sf, sherpa_onnx
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import voicelib as V

W, ASSETS, KOK, WHI = sys.argv[1:5]; SPL = sys.argv[5] if len(sys.argv) > 5 else None; DROP = sys.argv[6] if len(sys.argv) > 6 else None
PRE = 'crew4'; SR = V.SR; GAP = 0.2
sel = json.load(open(os.path.join(HERE, 'crew_release.json'))); made = json.load(open(os.path.join(HERE, 'made_lines.json')))
CACHE = os.path.join(W, 'tts_cache'); os.makedirs(CACHE, exist_ok=True)
ROLES = ['CDR', 'GNR', 'LDR', 'DRV']

# ---------------------------------------------------------------- 1. the pack's own lines, re-voiced
lines = {}     # (who, ev) -> [dict(a, level, clip, words, made, m)]
def add(who, ev, a, level, clip, words, how): lines.setdefault((who, ev), []).append(dict(a=a, level=level, clip=clip, words=words, made=how))
def pack(clip): return V.trim(V.load(os.path.join(W, 'ogg', '%04d.ogg' % clip)))
for who, events in sel['e'].items():
    for ev, takes in events.items():
        for clip, level, words in takes:
            x = pack(clip)
            if who == 'ANY':   # a wounded man's cry: one copy in each man's voice
                for r in ROLES: add(r, ev, V.level(V.trim(V.revoice(x, r))), level, clip, words, '')
            else: add(who, ev, V.level(V.trim(V.revoice(x, who))) if who in ROLES else V.level(x), level, clip, words, '')
print('pack lines re-voiced:', sum(len(v) for v in lines.values()))
# what each man's real lines look like, by delivery: the yardstick for the made ones
REF = {}
for r in ROLES:
    for lv in (0, 1, 2):
        pool = [d for (who, ev), L in lines.items() if who == r for d in L if d['level'] == lv and len(d['a']) > SR * 0.7]
        if len(pool) < 3: pool = [d for (who, ev), L in lines.items() if who == r for d in L if abs(d['level'] - lv) <= 1 and len(d['a']) > SR * 0.7]
        M = [V.measure(V.on_intercom(d['a'])) for d in pool]; M = [m for m in M if m['f0'] > 0]   # as heard on the intercom
        REF[(r, lv)] = dict(n=len(M), ltas=np.mean([V.ltas(d['a']) for d in pool], axis=0),
                            mean={k: float(np.mean([m[k] for m in M])) for k in V.KEYS}, sd={k: float(np.std([m[k] for m in M]) + 1e-6) for k in V.KEYS}, f0=float(np.median([m['f0'] for m in M])))
        print('  %s delivery %d: %2d real lines, pitch %3.0f Hz, formants %.0f / %.0f / %.0f Hz' % (r, lv, len(M), REF[(r, lv)]['f0'], REF[(r, lv)]['mean']['f1'], REF[(r, lv)]['mean']['f2'], REF[(r, lv)]['mean']['f3']))

# ---------------------------------------------------------------- 2. words cut out of the pack
if SPL and os.path.exists(os.path.join(SPL, 'splices.json')):
    for s in json.load(open(os.path.join(SPL, 'splices.json'))):
        x, sr = sf.read(os.path.join(SPL, s['file'])); add(s['who'], s['ev'], V.level(V.trim(V.revoice(x, s['who']), 0.01, 0.03)), s['level'], s['clip'], s['words'], 'splice')

# ---------------------------------------------------------------- 3. made lines
kcfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
    model=KOK + '/model.onnx', voices=KOK + '/voices.bin', tokens=KOK + '/tokens.txt', data_dir=KOK + '/espeak-ng-data', lexicon=KOK + '/lexicon-us-en.txt'), num_threads=4))
tts = sherpa_onnx.OfflineTts(kcfg)
wname = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(WHI, '*-encoder.onnx')))
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (WHI, wname), decoder='%s/%s-decoder.onnx' % (WHI, wname), tokens='%s/%s-tokens.txt' % (WHI, wname), num_threads=4, language='en', task='transcribe')
def hear(a):
    n = int(len(a) * 16000 / SR); b = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32); pad = np.zeros(6400, dtype=np.float32)
    s = rec.create_stream(); s.accept_waveform(16000, np.concatenate([pad, b / (np.abs(b).max() + 1e-9) * 0.7, pad])); rec.decode_stream(s); return s.result.text.strip()
NUMW = dict(zip('1 2 3 4 5 6 7 8 9 10 11 12 50'.split(), 'one two three four five six seven eight nine ten eleven twelve fifty'.split()))
def words(t):
    t = re.sub(r"[^a-z0-9' ]", ' ', t.lower().replace("o'clock", 'oclock').replace('o clock', 'oclock')); out = []
    for w in t.split(): out.append(NUMW.get(w, w))
    return [w for w in out if w not in ('the', 'a', 'is', 'it', 'its', "it's", 's')]
def same(a, b): return a == b or (len(a) > 3 and len(b) > 3 and a[:4] == b[:4])
def read_ok(text, got):
    want = words(text.replace('H E', 'he').replace('P C', 'pc')); g = words(got.replace('H.E.', 'he').replace('HE', 'he').replace('P.C.', 'pc').replace('PC', 'pc'))
    return sum(any(same(w, x) for x in g) for w in want) >= max(1, (len(want) * 2 + 2) // 3)   # two words in three
def synth(text, sid, pace):
    key = hashlib.md5(('%d|%.2f|%s' % (sid, pace, text)).encode()).hexdigest()[:16]; p = os.path.join(CACHE, key + '.wav')
    if not os.path.exists(p): a = tts.generate(text, sid=sid, speed=pace); sf.write(p, np.array(a.samples, dtype=np.float32), a.sample_rate)
    return V.trim(V.load(p))
import pickle
def make(who, text, lv, sid, gentle=False):
    # the finished line is kept on disk (keyed by everything that shapes it), so a rebuild only makes what changed
    key = hashlib.md5(json.dumps([who, text, lv, sid, gentle, V.ROLES[who], made['pace'], round(REF[(who, lv)]['f0'], 1), 'v2']).encode()).hexdigest()[:16]; cp = os.path.join(CACHE, 'made_' + key + '.pkl')
    if os.path.exists(cp): return pickle.load(open(cp, 'rb'))
    r = make1(who, text, lv, sid, gentle); pickle.dump(r, open(cp, 'wb')); return r
def make1(who, text, lv, sid, gentle):
    raw = synth(text, sid, made['pace'][lv]); ref = REF[(who, lv)]
    y = V.trim(V.revoice(raw, who)); f0 = V.measure(y)['f0']
    extra = float(np.clip(12 * np.log2(ref['f0'] / f0), -2, 2 if gentle else 6)) if f0 > 0 else 0.0   # gentle: the second try for a line the recogniser could not read
    y = V.trim(V.revoice(raw, who, extra_semi=extra))
    if gentle: y = V.run_ffmpeg(y, 'highshelf=f=1600:g=%.1f' % (1.5 * lv)) if lv else y
    elif lv == 2: y = V.run_ffmpeg(y, 'highshelf=f=1400:g=5,volume=2.2,asoftclip=type=tanh,volume=0.6')      # the push of a raised voice: brighter, a little driven
    elif lv == 1: y = V.run_ffmpeg(y, 'highshelf=f=1600:g=2.5')
    y = V.match_eq(y, ref['ltas']); y = y + np.random.default_rng(len(text)).normal(0, 10 ** (-66 / 20), len(y))   # the pack's colour, and a floor that is not digital silence
    y = V.level(V.trim(y)); m = V.measure(V.on_intercom(y))
    z = {k: (m[k] - ref['mean'][k]) / ref['sd'][k] for k in V.KEYS} if m['f0'] > 0 else {k: 9.0 for k in V.KEYS}
    got = hear(y); return dict(a=y, m=m, z=z, zmax=float(max(abs(v) for v in z.values())), heard=got, ok=read_ok(text, got), sid=sid, extra=round(extra, 2), gentle=gentle)
report = []; nid = 20000
def drop_in(who, ev, lv):
    if not DROP: return None
    for ext in ('wav', 'mp3', 'ogg'):
        p = os.path.join(DROP, '%s.%s.%d.%s' % (who, ev, lv, ext))
        if os.path.exists(p): return V.level(V.trim(V.load(p)))
    return None
for who, events in made['lines'].items():
    for evt, texts in events.items():
        hours = list(enumerate(made['clock'], 1)) if '{N}' in evt else [(0, '')]
        for n, word in hours:
            ev = evt.replace('{N}', str(n))
            for lv, text in enumerate(texts):
                if not text: continue
                text = text.replace('{N}', word); nid += 1; shown = text.replace('{N}', str(n)).replace('P C', 'PC').replace('H E', 'HE')
                real = drop_in(who, ev, lv)
                if real is not None: add(who, ev, real, lv, nid, shown, 'recorded'); continue
                best = None
                for gentle in (False, True):
                    for sid in made['voices'][who]:
                        r = make(who, text, lv, sid, gentle)
                        if best is None or (r['ok'], -r['zmax']) > (best['ok'], -best['zmax']): best = r
                        if r['ok'] and r['zmax'] < 2.5: break
                    if best['ok']: break
                row = dict(who=who, ev=ev, level=lv, text=shown, how='synth', voice=best['sid'], heard=best['heard'], read=bool(best['ok']), zmax=round(best['zmax'], 2), worst=max(best['z'], key=lambda k: abs(best['z'][k])),
                           f0=round(best['m']['f0']), f0_ref=round(REF[(who, lv)]['f0']), extra_semi=best['extra'], gentle=bool(best.get('gentle')), kept=bool(best['ok']))
                report.append(row); print('%s %-4s %-13s %d  z %.1f (%s)  pitch %3d / real %3d  heard: %s' % ('KEEP' if row['kept'] else 'DROP', who, ev, lv, row['zmax'], row['worst'], row['f0'], row['f0_ref'], best['heard'][:50]), flush=True)
                if best['ok']: add(who, ev, best['a'], lv, nid, shown, 'synth')
for (who, ev), L in lines.items():
    for d in L:
        if d['made'] == 'splice':
            m = V.measure(d['a']); report.append(dict(who=who, ev=ev, level=d['level'], text=d['words'], how='splice', clip=d['clip'], f0=round(m['f0']), kept=True))

# ---------------------------------------------------------------- 4. the files
strips = {}; index = {}; n = 0
for (who, ev), L in sorted(lines.items()):
    key = who.lower(); S = strips.setdefault(key, dict(parts=[], t=0.0))
    for d in sorted(L, key=lambda d: d['level']):
        a = d['a']; index.setdefault(who, {}).setdefault(ev, []).append([key, round(S['t'], 3), round(len(a) / SR, 3), d['level'], d['clip'], d['words'], d['made']])
        S['parts'] += [a, np.zeros(int(SR * GAP))]; S['t'] += len(a) / SR + int(SR * GAP) / SR; n += 1
files = {}; total = 0
for key, S in sorted(strips.items()):
    name = '%s_%s.mp3' % (PRE, key); out = os.path.join(ASSETS, name)
    if os.path.exists(out) and not os.environ.get('FORCE'): sys.exit('refusing to overwrite ' + out + ' (set FORCE=1 to rebuild)')
    wav = os.path.join(W, name + '.wav'); sf.write(wav, np.concatenate(S['parts']).astype(np.float32), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', wav, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '80k', out], check=True); os.remove(wav)
    files[key] = name; total += os.path.getsize(out); print('%-18s %6.1f s  %7.1f kB' % (name, S['t'], os.path.getsize(out) / 1024))
json.dump(dict(pack=sel['pack'], revoiced=True, strips=files, e=index), open(os.path.join(ASSETS, PRE + '_index.json'), 'w'), separators=(',', ':'))
json.dump(dict(roles={r: V.ROLES[r] for r in ROLES}, ref={'%s.%d' % k: dict(n=v['n'], f0=v['f0'], mean=v['mean'], sd=v['sd']) for k, v in REF.items()}, made=report), open(os.path.join(W, 'voices_report.json'), 'w'), indent=1)
kept = [r for r in report if r['kept']]; syn = [r for r in kept if r['how'] == 'synth']
print('%d lines in %d strips, %.0f kB. Made lines kept: %d synthesised, %d spliced; dropped (not readable): %d; synthesised lines more than 2.5 deviations from the real ones on some measure: %d'
      % (n, len(files), total / 1024, len(syn), len([r for r in kept if r['how'] == 'splice']), len([r for r in report if not r['kept']]), len([r for r in syn if r['zmax'] > 2.5])))
