#!/usr/bin/env python3
# Does re-voicing keep the words? The speech recogniser reads every REAL (pack) line of the built strips, band-limited as on
# the intercom, and its reading is compared with the words in the index.
#   python3 -I tools/audio/read_back.py <assets dir> <Whisper model folder> [prefix = crew4] [WHO ...]
# Prints the lines it could not read and a count per man. Very short shouts ("Up!") and near-homophones ("Miss fire!")
# count as misses here even when they are right, so compare the count with the same test on the un-re-voiced strips (crew3).
import sys, os, json, glob, re
import numpy as np, sherpa_onnx
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voicelib as V
A, M = sys.argv[1], sys.argv[2]; PRE = sys.argv[3] if len(sys.argv) > 3 else 'crew4'; only = [w for w in sys.argv[4:]]
idx = json.load(open(os.path.join(A, PRE + '_index.json'))); strips = {k: V.load(os.path.join(A, f)) for k, f in idx['strips'].items()}
name = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(M, '*-encoder.onnx')))
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (M, name), decoder='%s/%s-decoder.onnx' % (M, name), tokens='%s/%s-tokens.txt' % (M, name), num_threads=4, language='en', task='transcribe')
def hear(a):
    n = int(len(a) * 16000 / V.SR); b = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32); pad = np.zeros(6400, dtype=np.float32)
    s = rec.create_stream(); s.accept_waveform(16000, np.concatenate([pad, b / (np.abs(b).max() + 1e-9) * 0.7, pad])); rec.decode_stream(s); return s.result.text.strip()
SKIP = set('banshee one three blackjack six main toc tc is this a the to of and i am have has been we are'.split())
words = lambda t: [w for w in re.sub(r"[^a-z0-9' ]", ' ', t.lower()).split() if w not in SKIP and not w.isdigit()]
same = lambda a, b: a == b or (len(a) > 3 and len(b) > 3 and a[:4] == b[:4])
for who, E in idx['e'].items():
    if only and who not in only: continue
    ok = n = 0
    for ev, L in E.items():
        for x in L:
            if (len(x) > 6 and x[6]) or x[2] < 0.75 or ev.startswith('range_'): continue
            a = V.on_intercom(strips[x[0]][int(x[1] * V.SR):int((x[1] + x[2]) * V.SR)]); got = hear(a); want = words(x[5]); g = words(got)
            hit = not want or sum(any(same(w, y) for y in g) for w in want) >= max(1, (len(want) + 1) // 2); n += 1; ok += hit
            if not hit: print('  not read: %-4s %-12s clip %-4d %-44s heard: %s' % (who, ev, x[4], x[5][:44], got[:50]), flush=True)
    print('%s: %d of %d real lines read back correctly' % (who, ok, n), flush=True)
