#!/usr/bin/env python3
# Step 3 of the sound-pack pipeline: simple measurements of every clip (nobody can listen here): length, loudness, peak,
# voice pitch, brightness and 13 numbers that describe the colour of the voice.
#   python3 -I tools/audio/features.py <work dir>     reads <work>/wav16/*.wav (made by transcribe.py), writes <work>/features.json
import sys, os, json, glob, hashlib
import numpy as np, soundfile as sf
W = sys.argv[1]; SR = 16000; N = 512; HOP = 160
def mel(f): return 2595 * np.log10(1 + f / 700)
def imel(m): return 700 * (10 ** (m / 2595) - 1)
pts = imel(np.linspace(mel(60), mel(7600), 28)); bins = np.floor((N + 1) * pts / SR).astype(int); FB = np.zeros((26, N // 2 + 1))
for k in range(26):
    a, b, c = bins[k], bins[k + 1], bins[k + 2]
    FB[k, a:b] = (np.arange(a, b) - a) / max(1, b - a); FB[k, b:c] = (c - np.arange(b, c)) / max(1, c - b)
DCT = np.cos(np.pi / 26 * (np.arange(26) + 0.5)[None, :] * np.arange(13)[:, None])
out = {}; seen = {}
for f in sorted(glob.glob(os.path.join(W, 'wav16', '*.wav'))):
    i = int(os.path.basename(f)[:4]); a, sr = sf.read(f, dtype='float32')
    h = hashlib.md5(a.tobytes()).hexdigest()
    if h in seen: out[i] = dict(out[seen[h]], dup=seen[h]); continue
    seen[h] = i
    if len(a) < N + HOP: a = np.pad(a, (0, N + HOP - len(a)))
    idx = np.arange(0, len(a) - N, HOP)[:, None] + np.arange(N)[None, :]; fr = a[idx]; e = np.sqrt((fr ** 2).mean(1) + 1e-12); edb = 20 * np.log10(e)
    act = edb > max(edb.max() - 30, -55)   # frames with speech in them
    sp = np.abs(np.fft.rfft(fr * np.hanning(N), axis=1)) ** 2; ml = np.log(sp @ FB.T + 1e-10); cep = ml @ DCT.T
    fq = np.fft.rfftfreq(N, 1 / SR); cen = (sp * fq).sum(1) / (sp.sum(1) + 1e-12)
    # pitch by autocorrelation on the speech frames, 70..400 Hz
    f0 = []
    for x in fr[act][::2]:
        x = x - x.mean(); ac = np.correlate(x, x, 'full')[N - 1:]
        if ac[0] <= 0: continue
        lo, hi = SR // 400, SR // 70; k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] / ac[0] > 0.45: f0.append(SR / k)
    lead = int(np.argmax(act)) * HOP / SR; tail = int(np.argmax(act[::-1])) * HOP / SR
    out[i] = dict(dur=round(len(a) / SR, 3), rms=round(float(20 * np.log10(np.sqrt((fr[act] ** 2).mean()) + 1e-9)), 1), peak=round(float(20 * np.log10(np.abs(a).max() + 1e-9)), 1),
                  f0=round(float(np.median(f0)), 1) if len(f0) > 4 else 0, f0sd=round(float(np.std(f0)), 1) if len(f0) > 4 else 0, voiced=round(len(f0) / max(1, act[::2].sum()), 2),
                  cen=round(float(cen[act].mean())), lead=round(lead, 2), tail=round(tail, 2), cep=[round(float(v), 2) for v in cep[act].mean(0)], hfr=round(float((sp[act][:, fq > 4000].sum() + 1e-12) / (sp[act].sum() + 1e-12)), 4))
json.dump(out, open(os.path.join(W, 'features.json'), 'w'))
print(len(out), 'clips,', len(seen), 'distinct')
