#!/usr/bin/env python3
# Check built voice strips against their index (nobody can listen here, so this is what can be measured):
#   python3 -I tools/audio/check_strips.py <assets dir> [prefix=crewvoice]
# every entry lies inside its strip, has speech in it, is followed by silence (so the cut points survived the mp3 coding),
# and all clips sit at about the same loudness. Also prints the loudness of the older voice strips for comparison.
import sys, os, json, subprocess
import numpy as np

A = sys.argv[1]; PRE = sys.argv[2] if len(sys.argv) > 2 else 'crewvoice'; SR = 44100
def load(name):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', os.path.join(A, name), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)
def db(x): return 10 * np.log10((x ** 2).mean() + 1e-12) if len(x) else -120.0
def speech(x):
    n = SR // 100; k = len(x) // n; e = 10 * np.log10((x[:k * n].reshape(k, n) ** 2).mean(1) + 1e-12); return 10 * np.log10((10 ** (e[e > e.max() - 25] / 10)).mean())
I = json.load(open(os.path.join(A, PRE + '_index.json'))); bad = 0; n = 0; loud = []
bufs = {k: load(f) for k, f in I['strips'].items()}
for who, E in I['e'].items():
    for ev, L in E.items():
        for key, t, d, lvl, clip, line in [x[:6] for x in L]:   # a seventh field (how a line was made) may follow
            n += 1; b = bufs[key]; a, z = int(t * SR), int((t + d) * SR)
            if z > len(b) or d <= 0.1: print('outside its strip or too short:', who, ev, clip); bad += 1; continue
            sp = speech(b[a:z]); gap = db(b[z + int(0.04 * SR): z + int(0.11 * SR)]); loud.append(sp)
            if sp < -26 or gap > -55: print('suspect cut:', who, ev, clip, 'speech %.1f dB, gap after %.1f dB' % (sp, gap)); bad += 1
print('%s: %d clips checked, %d problems; speech loudness %.1f .. %.1f dB (median %.1f)' % (PRE, n, bad, min(loud), max(loud), float(np.median(loud))))
for f in ('voice_cdr.mp3', 'voice_gnr.mp3', 'voice_ldr.mp3', 'voice_drv.mp3', 'voice_panic.mp3'):
    if os.path.exists(os.path.join(A, f)): x = load(f); print('older strip %-16s speech loudness %.1f dB, peak %.1f dB' % (f, speech(x), 20 * np.log10(np.abs(x).max() + 1e-9)))
sys.exit(1 if bad else 0)
