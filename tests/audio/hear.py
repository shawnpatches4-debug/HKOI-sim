#!/usr/bin/env python3
# Let a speech recogniser listen to a rendered intercom scene (nobody else can, in the workspace) and compare what it hears
# with what the simulator says it played.
#   python3 -I tests/audio/hear.py <scene.wav> <folder of the sherpa-onnx Whisper small.en model> [--whole]
# Next to the wav there must be <scene>.json from tests/audio/render.mjs (the list of lines: start, end, who, event, words).
# Each line is cut out of the mix (with the intercom processing on it) and recognised on its own; --whole also recognises the
# first 29 seconds in one piece, to check the ORDER of the words. A line counts as heard when half of its words (ignoring
# call signs, numbers and punctuation) are in the recogniser's text. Short shouts ("Up!") are often misheard: see the note printed.
import sys, os, json, glob, re
import numpy as np, soundfile as sf, sherpa_onnx

wav, M = sys.argv[1], sys.argv[2]; whole = '--whole' in sys.argv
x, sr = sf.read(wav, dtype='float32'); x = x.mean(1) if x.ndim > 1 else x
said = json.load(open(wav[:-4] + '.json'))['said']
name = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(M, '*-encoder.onnx')))
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (M, name), decoder='%s/%s-decoder.onnx' % (M, name), tokens='%s/%s-tokens.txt' % (M, name), num_threads=4, language='en', task='transcribe')

def to16(a):
    n = int(len(a) * 16000 / sr); return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)
def hear(a):
    a = to16(a); pk = np.abs(a).max() + 1e-9; a = a / pk * 0.7; pad = np.zeros(6400, dtype=np.float32)
    s = rec.create_stream(); s.accept_waveform(16000, np.concatenate([pad, a, pad])); rec.decode_stream(s); return s.result.text.strip()
SKIP = set('banshee one three tree blackjack six main toc tc is this a the to of and i am have has been'.split())
NUM = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three'}
def words(t):
    t = re.sub(r'\([^)]*\)', ' ', t.lower()); t = re.sub(r"[^a-z0-9' ]", ' ', t)
    return [w for w in t.split() if w not in SKIP and not w.isdigit()]
def same(a, b): return a == b or (len(a) > 3 and len(b) > 3 and (a.startswith(b[:4]) or b.startswith(a[:4])))

ok = 0; n = 0; short = 0
for s in said:
    if s.get('cut'): continue
    seg = x[max(0, int((s['t'] - 0.12) * sr)):int((s['end'] + 0.15) * sr)]; got = hear(seg); want = words(s['text']); gw = words(got)
    if not want: hit = None
    else: hit = sum(any(same(w, g) for g in gw) for w in want) >= max(1, (len(want) + 1) // 2)
    numeric = re.sub(r'\D', '', s['text']); gnum = re.sub(r'\D', '', got)
    if hit is None or (not hit and numeric and numeric == gnum): hit = bool(numeric) and numeric == gnum
    n += 1; ok += bool(hit); tiny = s['end'] - s['t'] < 0.75; short += tiny and not hit
    print('%s %7.2f %-4s %-15s clip %-4d played: %-48s heard: %s' % ('ok  ' if hit else 'MISS', s['t'], s['who'], s['ev'], s['clip'], s['text'][:48], got[:60]))
print('%d of %d lines recognised (%d of the misses are shouts under 0.75 s, which the recogniser rarely gets through the intercom processing)' % (ok, n, short))
if whole: print('whole scene, in order:', hear(x[:29 * sr]))
