#!/usr/bin/env python3
# Step 5 of the sound-pack pipeline: cut the chosen clips into the files the simulator loads.
#   python3 -I tools/audio/build_strips.py <work dir> <assets dir> [prefix=crewvoice] [kbps=80]
# Reads  <work>/catalogue.json (catalogue.py) and <work>/ogg/NNNN.ogg (fsb_unpack.py)
# Writes <assets>/<prefix>_<speaker>.mp3  one long strip per speaker (cdr, gnr, ldr, drv, any), mono, 44.1 kHz
#        <assets>/<prefix>_index.json     { pack, strips: { key: file }, e: { WHO: { event: [[strip, start s, length s, level, clip, line], ...] } } }
# Every clip is trimmed of silence at both ends, set to the same loudness, and given a short fade so cuts do not click.
# Existing files with other names are never touched. The strips are third-party audio: they stay out of git.
import sys, os, json, subprocess
import numpy as np, soundfile as sf

W, ASSETS = sys.argv[1], sys.argv[2]; PRE = sys.argv[3] if len(sys.argv) > 3 else 'crewvoice'; KBPS = sys.argv[4] if len(sys.argv) > 4 else '80'
SR = 44100; GAP = 0.15; TARGET = -19.0; CEIL = -1.5   # loudness of the speech in dB below full scale, and the highest peak allowed
cat = json.load(open(os.path.join(W, 'catalogue.json')))

def load(i):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', os.path.join(W, 'ogg', '%04d.ogg' % i), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def tidy(a):
    n = int(SR * 0.01); k = len(a) // n
    if k < 3: return None
    e = 20 * np.log10(np.sqrt((a[:k * n].reshape(k, n) ** 2).mean(1)) + 1e-9); on = np.nonzero(e > max(e.max() - 38, -60))[0]
    lo = max(0, on[0] * n - int(SR * 0.02)); hi = min(len(a), (on[-1] + 1) * n + int(SR * 0.06)); a = a[lo:hi].copy()
    loud = e[e > e.max() - 25]; rms = 10 * np.log10((10 ** (loud / 10)).mean())   # loudness of the frames with speech in them
    g = 10 ** ((TARGET - rms) / 20); pk = np.abs(a).max() * g; lim = 10 ** (CEIL / 20)
    if pk > lim: g *= lim / pk
    a *= g; f = int(SR * 0.006); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
    return a, 20 * np.log10(g)

strips = {}; index = {}; gains = []; n = 0
for c in cat['clips']:
    if not c.get('in_strip'): continue
    r = tidy(load(c['i']))
    if r is None: print('skipped (too short):', c['i']); continue
    a, g = r; gains.append(g); key = c['who'].lower(); S = strips.setdefault(key, dict(parts=[], t=0.0))
    index.setdefault(c['who'], {}).setdefault(c['event'], []).append([key, round(S['t'], 3), round(len(a) / SR, 3), c['level'], c['i'], c['line']])
    S['parts'] += [a, np.zeros(int(SR * GAP))]; S['t'] += len(a) / SR + int(SR * GAP) / SR; n += 1
files = {}
for key, S in sorted(strips.items()):
    wav = os.path.join(W, '%s_%s.wav' % (PRE, key)); name = '%s_%s.mp3' % (PRE, key); out = os.path.join(ASSETS, name)
    sf.write(wav, np.concatenate(S['parts']).astype(np.float32), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', wav, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', KBPS + 'k', out], check=True); os.remove(wav)
    files[key] = name; print('%-22s %6.1f s  %7.1f kB' % (name, S['t'], os.path.getsize(out) / 1024))
json.dump(dict(pack=cat['pack'], strips=files, e=index), open(os.path.join(ASSETS, PRE + '_index.json'), 'w'), separators=(',', ':'))
print('%d clips in %d strips; gain applied %.1f .. %.1f dB (median %.1f)' % (n, len(files), min(gains), max(gains), float(np.median(gains))))
