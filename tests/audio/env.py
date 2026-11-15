#!/usr/bin/env python3
# Print the level of a sound file over time as a row of numbers (dB, one per step), to see a burst's shape without ears.
#   python3 -I tests/audio/env.py <file.wav> <from s> <to s> [step ms, default 20] [low-pass / high-pass split Hz: prints both bands]
import sys
import numpy as np, soundfile as sf
x, sr = sf.read(sys.argv[1], dtype='float64'); x = x.mean(1) if x.ndim > 1 else x
a, b = float(sys.argv[2]), float(sys.argv[3]); step = float(sys.argv[4]) / 1000 if len(sys.argv) > 4 else 0.02; split = float(sys.argv[5]) if len(sys.argv) > 5 else 0
def rows(sig, tag):
    out = []
    n = int(step * sr)
    for i in range(int(a * sr), min(len(sig), int(b * sr)) - n, n): out.append(20 * np.log10(np.sqrt(np.mean(sig[i:i + n] ** 2)) + 1e-9))
    per = max(1, int(round(0.2 / step)))
    for k in range(0, len(out), per): print('%s %6.2f s  ' % (tag, a + k * step) + ' '.join('%4.0f' % v for v in out[k:k + per]))
if split:
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr); lo = np.fft.irfft(np.where(f < split, X, 0), len(x)); rows(lo, 'below'); rows(x - lo, 'above')
else: rows(x, 'all  ')
