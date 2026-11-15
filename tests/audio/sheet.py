#!/usr/bin/env python3
# A picture of sound for people who cannot be sent the sound: spectrograms of the same moment, one above the other
# (for example before and after), on the same scales.
#   python3 -I tests/audio/sheet.py <out.png> <from s> <to s> <label>=<file.wav> [<label>=<file.wav> ...]
# Time runs left to right, pitch bottom (40 Hz) to top (16 kHz) on a logarithmic scale, brighter = louder (70 dB range,
# the same for every panel). A sharp vertical line is a transient (a shot); a horizontal band is a steady tone (an engine).
import sys
import numpy as np, soundfile as sf
from PIL import Image, ImageDraw

out, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]); items = [a.split('=', 1) for a in sys.argv[4:]]
W, H, PAD, LEFT = 1500, 300, 34, 64; F0, F1, RANGE = 40.0, 16000.0, 70.0
img = Image.new('RGB', (W + LEFT + 10, (H + PAD) * len(items) + 24), (12, 14, 16)); d = ImageDraw.Draw(img)
def colour(v):   # 0..1 -> dark blue, green, yellow, white
    stops = [(0, (8, 10, 30)), (0.35, (20, 70, 120)), (0.6, (40, 170, 110)), (0.82, (240, 210, 70)), (1, (255, 255, 255))]
    out = np.zeros(v.shape + (3,))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        k = (v >= a) & (v <= b); f = ((v - a) / (b - a))[k]
        for c in range(3): out[..., c][k] = ca[c] + (cb[c] - ca[c]) * f
    return out.astype(np.uint8)
for row, (label, path) in enumerate(items):
    x, sr = sf.read(path, dtype='float64'); x = x.mean(1) if x.ndim > 1 else x
    seg = x[int(t0 * sr):int(t1 * sr)]; n = 2048; hop = max(1, (len(seg) - n) // W); win = np.hanning(n)
    S = np.array([np.abs(np.fft.rfft(seg[i:i + n] * win)) for i in range(0, len(seg) - n, hop)][:W]).T / (n / 4)
    f = np.fft.rfftfreq(n, 1 / sr); rows = np.exp(np.linspace(np.log(F1), np.log(F0), H)); idx = np.clip(np.searchsorted(f, rows), 1, len(f) - 1)
    P = 20 * np.log10(S[idx, :] + 1e-9); v = np.clip((P + RANGE + 6) / RANGE, 0, 1)
    y0 = row * (H + PAD) + PAD; img.paste(Image.fromarray(colour(v)), (LEFT, y0))
    d.text((LEFT, y0 - 16), label, fill=(235, 240, 236))
    for hz in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        y = y0 + int(np.log(F1 / hz) / np.log(F1 / F0) * H); d.line((LEFT - 4, y, LEFT, y), fill=(150, 160, 155)); d.text((4, y - 6), ('%d Hz' % hz) if hz < 1000 else ('%d kHz' % (hz // 1000)), fill=(150, 160, 155))
    for k in range(int(np.ceil(t0)), int(t1) + 1):
        xk = LEFT + int((k - t0) / (t1 - t0) * v.shape[1]); d.line((xk, y0 + H, xk, y0 + H + 4), fill=(150, 160, 155)); d.text((xk + 3, y0 + H + 2), '%d s' % k, fill=(150, 160, 155))
img.save(out); print('wrote', out)
