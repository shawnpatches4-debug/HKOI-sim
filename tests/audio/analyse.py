#!/usr/bin/env python3
# Measure the WAV files written by tests/audio/render.mjs (nobody can listen in the workspace, so numbers and pictures):
#   python3 tests/audio/analyse.py <folder of wav files> [--png name-pattern ...] [--only name-pattern]
# For every file: length, highest peak and loudness (dB below full scale), when the sound first arrives, how the energy is
# spread over five bands (sub under 80 Hz, low 80 to 300, mid 300 to 2000, high 2000 to 8000, air above 8000) and the
# centre of the spectrum. --png draws a spectrogram (time across, frequency up on a log scale, brighter = louder) next
# to each file whose name contains one of the patterns.
import sys, os, glob
import numpy as np, soundfile as sf

BANDS = [('sub', 0, 80), ('low', 80, 300), ('mid', 300, 2000), ('high', 2000, 8000), ('air', 8000, 30000)]
db = lambda x: 20 * np.log10(max(x, 1e-9))

def measure(path):
    x, sr = sf.read(path, dtype='float64'); m = x.mean(1) if x.ndim > 1 else x
    peak = np.abs(x).max(); rms = np.sqrt((m ** 2).mean())
    w = int(sr * 0.4); c = np.cumsum(np.concatenate([[0], m ** 2])); loud = np.sqrt(((c[w:] - c[:-w]) / w).max()) if len(m) > w else rms
    on = np.nonzero(np.abs(m) > max(2e-4, peak * 0.03))[0]; first = on[0] / sr if len(on) else -1; last = on[-1] / sr if len(on) else -1
    S = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2; f = np.fft.rfftfreq(len(m), 1 / sr); tot = S.sum() + 1e-20
    bands = [100 * S[(f >= lo) & (f < hi)].sum() / tot for _, lo, hi in BANDS]; cen = (S * f).sum() / tot
    return dict(dur=len(m) / sr, peak=db(peak), rms=db(rms), loud=db(loud), first=first, last=last, bands=bands, cen=cen, clipped=int((np.abs(x) >= 0.999).sum()))

def spectrogram(path, out, fmin=30, fmax=16000, height=420, width=1100, floor=-90):
    from PIL import Image, ImageDraw
    x, sr = sf.read(path, dtype='float64'); m = x.mean(1) if x.ndim > 1 else x
    n = 2048; hop = max(64, int(len(m) / width)); win = np.hanning(n); m = np.concatenate([np.zeros(n // 2), m, np.zeros(n)])
    cols = [np.abs(np.fft.rfft(m[i:i + n] * win)) for i in range(0, len(m) - n, hop)][:width]
    S = 20 * np.log10(np.array(cols).T / (n / 4) + 1e-9); f = np.fft.rfftfreq(n, 1 / sr)
    fy = np.exp(np.linspace(np.log(fmax), np.log(fmin), height)); idx = np.clip(np.searchsorted(f, fy), 0, len(f) - 1)
    img = np.clip((S[idx] - floor) / (0 - floor), 0, 1)
    r = np.clip(img * 3, 0, 1); g = np.clip(img * 3 - 1, 0, 1); b = np.clip(img * 3 - 2, 0, 1) + np.clip(0.5 - np.abs(img - 0.17) * 3, 0, 0.5)
    rgb = (np.dstack([r, g, np.clip(b, 0, 1)]) * 255).astype(np.uint8)
    pad = 46; im = Image.new('RGB', (rgb.shape[1] + pad + 8, height + 34), (16, 16, 20)); im.paste(Image.fromarray(rgb), (pad, 4)); d = ImageDraw.Draw(im)
    for hz in [50, 100, 200, 500, 1000, 2000, 5000, 10000]:
        y = 4 + int(np.argmin(np.abs(fy - hz))); d.line([(pad - 4, y), (pad, y)], fill=(200, 200, 200)); d.text((2, y - 5), ('%dk' % (hz // 1000)) if hz >= 1000 else str(hz), fill=(200, 200, 200))
    dur = (len(m) - n * 1.5) / sr; step = next(s for s in [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60] if dur / s <= 14)
    for k in range(int(dur / step) + 1):
        xx = pad + int(k * step / dur * rgb.shape[1]); d.line([(xx, height + 4), (xx, height + 9)], fill=(200, 200, 200)); d.text((xx - 6, height + 12), ('%g' % (k * step)), fill=(200, 200, 200))
    d.text((pad + 6, 8), os.path.basename(path) + '   (seconds across, Hz up; colour: %d dB .. 0 dB)' % floor, fill=(255, 255, 255)); im.save(out)

if __name__ == '__main__':
    D = sys.argv[1]; args = sys.argv[2:]; pngs = []; only = None
    while args:
        a = args.pop(0)
        if a == '--png': pngs = [p for p in args if not p.startswith('--')]; args = [p for p in args if p.startswith('--')]
        elif a == '--only': only = args.pop(0)
    print('%-40s %6s %6s %6s %6s %6s %6s   %s  %6s' % ('file', 'sec', 'peak', 'rms', 'loud', 'first', 'last', ' sub  low  mid high  air', 'centre'))
    for p in sorted(glob.glob(os.path.join(D, '*.wav'))):
        name = os.path.basename(p)[:-4]
        if only and only not in name: continue
        r = measure(p)
        print('%-40s %6.1f %6.1f %6.1f %6.1f %6.2f %6.2f   %s  %5.0f Hz%s' % (name, r['dur'], r['peak'], r['rms'], r['loud'], r['first'], r['last'], ' '.join('%4.0f' % b for b in r['bands']), r['cen'], '  CLIPPED x%d' % r['clipped'] if r['clipped'] else ''))
        if any(k in name for k in pngs): spectrogram(p, p[:-4] + '.png')
